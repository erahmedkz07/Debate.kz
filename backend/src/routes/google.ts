import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import { createHash, randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env, googleEnabled, isProd } from '../lib/env.js'
import { badRequest, notFound } from '../lib/errors.js'
import { AVATARS_DIR } from '../lib/uploads.js'
import { query } from '../middleware/validate.js'
import { requireAuth, sessionUser, setSession } from '../middleware/auth.js'
import { googleLinkedLetter, googleUnlinkedLetter, welcomeGoogleLetter } from '../services/letters.js'

// "Sign in with Google" — OAuth 2.0 authorization code flow with OpenID Connect, done on the server:
//  1. /auth/google/start puts state + nonce + PKCE verifier into a short-lived signed httpOnly cookie
//     and sends the browser to Google;
//  2. Google returns to /auth/google/callback; the state must match the cookie (CSRF), the code is exchanged
//     for an ID token together with the client secret and the PKCE verifier, and the token's issuer,
//     audience, expiry, nonce and email_verified are checked. The token comes straight from Google's token
//     endpoint over TLS, so (OpenID Connect Core 3.1.3.7) its signature does not have to be verified again.
//  3. The user is found by Google id, else by the verified email (the accounts are linked), else created.
// Nothing about the Google account except id, email, name and photo is stored; no Google tokens are kept.
export const googleRouter = Router()

const FLOW_COOKIE = 'dkz_google'
const FLOW_TTL_S = 10 * 60
const callbackUrl = () => `${env.CLIENT_ORIGIN}/api/auth/google/callback`
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: isProd ? 40 : 500, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_requests' } })

interface Flow { state: string; nonce: string; verifier: string; mode: 'login' | 'link'; next: string; userId?: string; lang?: 'ru' | 'kz' }
const b64url = (b: Buffer) => b.toString('base64url')
// only same-site paths: "/me", never "//evil.com" or "https://…"
const safeNext = (p?: string) => (p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') ? p.slice(0, 300) : '/')

function back(res: Response, pathname: string, params: Record<string, string>) {
  const url = new URL(pathname, env.CLIENT_ORIGIN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  res.redirect(303, url.toString())
}

googleRouter.get('/google/config', (_req, res) => {
  res.json({ enabled: googleEnabled() })
})

googleRouter.get('/google/start', limiter, (req: Request, res: Response) => {
  const q = query(req, z.object({ mode: z.enum(['login', 'link']).default('login'), next: z.string().max(300).optional(), lang: z.enum(['ru', 'kz']).optional() }))
  const next = safeNext(q.next)
  if (!googleEnabled()) return back(res, '/login', { google_error: 'google_disabled' })
  // linking needs a signed-in user; otherwise it is a plain sign-in
  if (q.mode === 'link' && !req.user) return back(res, '/login', { next: '/me', google_error: 'login_required' })
  const flow: Flow = {
    state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)), verifier: b64url(randomBytes(48)),
    mode: q.mode, next, ...(q.mode === 'link' && { userId: req.user!.id }), ...(q.lang && { lang: q.lang }),
  }
  res.cookie(FLOW_COOKIE, jwt.sign(flow, env.JWT_SECRET, { expiresIn: FLOW_TTL_S, algorithm: 'HS256' }), {
    // lax: the cookie comes back on Google's top-level redirect to the callback
    httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: FLOW_TTL_S * 1000, path: '/api/auth/google',
  })
  const url = new URL(env.GOOGLE_AUTH_URL)
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: callbackUrl(), response_type: 'code', scope: 'openid email profile',
    state: flow.state, nonce: flow.nonce,
    code_challenge: b64url(createHash('sha256').update(flow.verifier).digest()), code_challenge_method: 'S256',
    prompt: 'select_account', // lets people with several Google accounts pick the right one
  }).toString()
  res.redirect(303, url.toString())
})

const claimsSchema = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com']),
  aud: z.string(), sub: z.string().min(1).max(255), exp: z.number(), nonce: z.string().optional(),
  email: z.string().email().max(200), email_verified: z.boolean(),
  name: z.string().max(200).optional(), given_name: z.string().max(100).optional(), family_name: z.string().max(100).optional(),
  picture: z.string().url().max(2000).optional(),
})
type Claims = z.infer<typeof claimsSchema>

class FlowError extends Error {}

async function exchange(code: string, verifier: string): Promise<Claims> {
  const r = await fetch(env.GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(), grant_type: 'authorization_code', code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!r?.ok) throw new FlowError('google_failed')
  const { id_token } = (await r.json().catch(() => ({}))) as { id_token?: string }
  const payload = id_token && jwt.decode(id_token)
  const claims = claimsSchema.safeParse(payload)
  if (!claims.success) throw new FlowError('google_failed')
  return claims.data
}

// Google's photo, re-encoded like an uploaded avatar (256×256 WebP, no metadata); only from Google's image host
async function importPicture(user: User, picture?: string) {
  if (!picture || user.avatarUrl) return null
  const u = new URL(picture)
  const trusted = (u.protocol === 'https:' && u.hostname.endsWith('.googleusercontent.com')) || (env.NODE_ENV === 'test' && u.hostname === 'localhost')
  if (!trusted) return null
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8_000) })
    const size = Number(r.headers.get('content-length') ?? 0)
    if (!r.ok || size > 5 * 1024 * 1024) return null
    const webp = await sharp(Buffer.from(await r.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer()
    const file = `${user.id}-${randomBytes(6).toString('hex')}.webp`
    await writeFile(path.join(AVATARS_DIR, file), webp)
    return `/uploads/avatars/${file}`
  } catch {
    return null // no photo is not a reason to fail the sign-in
  }
}

const fullName = (c: Claims) => (c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || c.email.split('@')[0]).trim().slice(0, 100)

googleRouter.get('/google/callback', limiter, async (req: Request, res: Response) => {
  const token = req.cookies?.[FLOW_COOKIE]
  res.clearCookie(FLOW_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/api/auth/google' })
  let flow: Flow | null = null
  try {
    flow = jwt.verify(token ?? '', env.JWT_SECRET, { algorithms: ['HS256'] }) as Flow
  } catch {
    return back(res, '/login', { google_error: 'google_expired' })
  }
  const fail = (code: string) => back(res, flow!.mode === 'link' ? '/me' : '/login', { google_error: code, ...(flow!.mode === 'login' && { next: flow!.next }) })
  const q = req.query as Record<string, string | undefined>
  if (!q.state || q.state !== flow.state) return fail('google_expired')
  // the person pressed "Cancel" on Google's page
  if (q.error) return fail(q.error === 'access_denied' ? 'google_cancelled' : 'google_failed')
  if (!q.code) return fail('google_failed')

  try {
    const c = await exchange(q.code, flow.verifier)
    if (c.aud !== env.GOOGLE_CLIENT_ID || c.exp * 1000 < Date.now() || c.nonce !== flow.nonce) throw new FlowError('google_failed')
    // an unconfirmed Google address proves nothing about who owns it
    if (!c.email_verified) throw new FlowError('google_email_unverified')
    const email = c.email.toLowerCase()
    const owner = await prisma.user.findUnique({ where: { googleId: c.sub } })

    // ---- link Google to the signed-in account (from the profile) ----
    if (flow.mode === 'link') {
      if (!req.user || req.user.id !== flow.userId) throw new FlowError('login_required')
      if (owner && owner.id !== req.user.id) throw new FlowError('google_taken')
      if (!owner) {
        const u = await prisma.user.update({
          where: { id: req.user.id },
          // the same address confirmed by Google also confirms the account email
          data: { googleId: c.sub, googleEmail: email, ...(email === req.user.email && !req.user.emailVerifiedAt && { emailVerifiedAt: new Date() }) },
        })
        const avatarUrl = await importPicture(u, c.picture)
        if (avatarUrl) await prisma.user.update({ where: { id: u.id }, data: { avatarUrl } })
        await googleLinkedLetter(u, email, false)
      }
      return back(res, '/me', { google: 'linked' })
    }

    // ---- sign in ----
    let user = owner
    let created = false
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email } })
      if (byEmail?.googleId) throw new FlowError('google_mismatch') // the account uses another Google account
      if (byEmail) {
        // Same verified address: this is the owner of the account, link Google to it.
        // If the account email was never confirmed, whoever registered it may not own the mailbox
        // (account pre-hijacking): their password is dropped and their sessions end.
        const unverified = !byEmail.emailVerifiedAt
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: c.sub, googleEmail: email,
            ...(unverified && { emailVerifiedAt: new Date(), passwordHash: null, passwordChangedAt: new Date() }),
          },
        })
        await googleLinkedLetter(user, email, unverified && !!byEmail.passwordHash)
      } else {
        // consent to data processing: the buttons say "by continuing you accept the privacy policy"
        user = await prisma.user.create({
          // a new account speaks the language the site was shown in (welcome letter, bot)
          data: { email, name: fullName(c), googleId: c.sub, googleEmail: email, emailVerifiedAt: new Date(), consentAt: new Date(), language: flow.lang ?? 'ru' },
        })
        created = true
      }
    }
    if (user.blocked) throw new FlowError('blocked')
    const avatarUrl = await importPicture(user, c.picture)
    if (avatarUrl) user = await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } })
    if (created) await welcomeGoogleLetter(user)
    setSession(res, user.id)
    // a new account goes to the profile to add phone, school and city
    return created ? back(res, '/me', { welcome: '1' }) : back(res, '/login', { next: flow.next })
  } catch (e) {
    if (e instanceof FlowError) return fail(e.message)
    console.error('[google]', e)
    return fail('google_failed')
  }
})

// Disconnect Google. Allowed only while the account has a password, otherwise the owner would be locked out.
googleRouter.delete('/google', requireAuth(), async (req, res) => {
  const me = req.user!
  if (!me.googleId) throw notFound('google_not_linked')
  if (!me.passwordHash) throw badRequest('set_password_first')
  const user = await prisma.user.update({ where: { id: me.id }, data: { googleId: null, googleEmail: null } })
  await googleUnlinkedLetter(user, me.googleEmail ?? me.email)
  res.json({ user: await sessionUser(user) })
})
