import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { toDay } from '../lib/dates.js'
import { badRequest, conflict, forbidden, HttpError, notFound } from '../lib/errors.js'
import { hashToken, newToken } from '../lib/tokens.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { assertCanManage, assertOwner, participationIn } from '../services/tournaments.js'
import { background, inbox, notifyJoined, notifyUsers, organizersOf, withLink } from '../services/notify.js'
import { inviteLetter } from '../services/letters.js'

export const invitesRouter = Router()

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const EMAIL_INVITES_PER_DAY = 50 // per tournament: stops using the site to spam addresses

// Judges and co-organizers join a tournament only through a single-use invite link from its organizers.
// Nobody can make themselves a judge: the right exists only inside that one tournament.
invitesRouter.post('/tournaments/:id/invites', requireAuth(), async (req, res) => {
  const { kind } = body(req, z.object({ kind: z.enum(['judge', 'co_organizer']) }))
  const tournamentId = param(req, 'id')
  if (kind === 'co_organizer') await assertOwner(req.user, tournamentId)
  else await assertCanManage(req.user, tournamentId)

  const { token, hash } = newToken()
  const invite = await prisma.tournamentInvite.create({
    data: { tournamentId, kind, tokenHash: hash, createdById: req.user!.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  })
  res.status(201).json({ id: invite.id, kind, url: `${env.CLIENT_ORIGIN}/invite/${token}`, expiresAt: invite.expiresAt.toISOString() })
})

// Invite a person by email: registered people get a notification with Accept / Decline (and Telegram),
// everyone gets a letter. Only the account with this address can accept.
invitesRouter.post('/tournaments/:id/invites/email', requireAuth(), async (req, res) => {
  const d = body(req, z.object({ email: z.string().trim().toLowerCase().email().max(200), kind: z.enum(['judge', 'co_organizer']).default('judge') }))
  const tournamentId = param(req, 'id')
  if (d.kind === 'co_organizer') await assertOwner(req.user, tournamentId)
  else await assertCanManage(req.user, tournamentId)
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (t.status === 'finished') throw badRequest('tournament_finished')
  const today = await prisma.tournamentInvite.count({ where: { tournamentId, email: { not: null }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  if (today >= EMAIL_INVITES_PER_DAY) throw new HttpError(429, 'too_many_invites')
  const open = await prisma.tournamentInvite.findFirst({ where: { tournamentId, kind: d.kind, email: d.email, usedAt: null, declinedAt: null, expiresAt: { gt: new Date() } } })
  if (open) throw conflict('already_invited')
  const invitee = await prisma.user.findUnique({ where: { email: d.email } })
  if (invitee) {
    // the same rules as when accepting: no judging or running a tournament you compete in
    const role = await participationIn(invitee.id, tournamentId)
    if (role.competitor) throw forbidden('conflict_of_interest')
    if ((d.kind === 'judge' && role.judge) || (d.kind === 'co_organizer' && role.organizer)) throw conflict('already_joined')
  }
  const { token, hash } = newToken()
  const invite = await prisma.tournamentInvite.create({
    data: { tournamentId, kind: d.kind, email: d.email, tokenHash: hash, createdById: req.user!.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  })
  const path = `/invite/${token}`
  if (invitee) {
    background(inbox([invitee.id], 'participant.inviteReceived', { tournament: t.name, name: req.user!.name, kind: d.kind }, path))
    background(notifyUsers([invitee.id], () => withLink(`✉️ ${req.user!.name} приглашает вас ${d.kind === 'judge' ? 'судить' : 'стать соорганизатором'}: «${t.name}».`, 'Принять или отклонить', path)))
  }
  const sent = await inviteLetter(d.email, { inviter: req.user!.name, tournament: t.name, kind: d.kind, registered: !!invitee, url: `${env.CLIENT_ORIGIN}${path}` })
  res.status(201).json({ id: invite.id, email: d.email, kind: d.kind, state: 'pending', registered: !!invitee, mailed: sent, createdAt: invite.createdAt.toISOString() })
})

// organizers see who was invited by email and what they answered
invitesRouter.get('/tournaments/:id/invites', requireAuth(), async (req, res) => {
  const tournamentId = param(req, 'id')
  await assertCanManage(req.user, tournamentId)
  const rows = await prisma.tournamentInvite.findMany({ where: { tournamentId, email: { not: null } }, include: { usedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
  const now = new Date()
  res.json(rows.map(i => ({
    id: i.id, email: i.email, kind: i.kind, createdAt: i.createdAt.toISOString(), acceptedBy: i.usedBy?.name,
    state: i.usedAt ? 'accepted' : i.declinedAt ? 'declined' : i.expiresAt < now ? 'expired' : 'pending',
  })))
})

// withdraw an unanswered invite
invitesRouter.delete('/tournaments/:id/invites/:inviteId', requireAuth(), async (req, res) => {
  const tournamentId = param(req, 'id')
  await assertCanManage(req.user, tournamentId)
  const i = await prisma.tournamentInvite.findFirst({ where: { id: param(req, 'inviteId'), tournamentId } })
  if (!i) throw notFound('invite_not_found')
  if (i.usedAt) throw badRequest('invite_used')
  await prisma.tournamentInvite.update({ where: { id: i.id }, data: { expiresAt: new Date() } })
  res.status(204).end()
})

// a@b.kz -> a***@b.kz: the invite page says whom it is for without showing the full address to anyone with the link
const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, '$1***$2')

async function loadInvite(token: string) {
  const invite = await prisma.tournamentInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { tournament: true, createdBy: { select: { name: true } } },
  })
  if (!invite) throw notFound('invite_not_found')
  const state = invite.usedAt ? 'used' : invite.declinedAt ? 'declined' : invite.expiresAt < new Date() ? 'expired' : 'valid'
  return { invite, state }
}

// preview for the invite page (no login needed to see what you are invited to)
invitesRouter.get('/invites/:token', async (req, res) => {
  const { invite, state } = await loadInvite(param(req, 'token'))
  const t = invite.tournament
  res.json({
    kind: invite.kind, state, invitedBy: invite.createdBy.name, expiresAt: invite.expiresAt.toISOString(), forEmail: invite.email ? mask(invite.email) : undefined,
    tournament: { id: t.id, name: t.name, city: t.city, startDate: toDay(t.startDate), endDate: toDay(t.endDate), cover: t.coverUrl ?? '' },
  })
})

invitesRouter.post('/invites/:token/accept', requireAuth(), requireVerified, async (req, res) => {
  const { invite, state } = await loadInvite(param(req, 'token'))
  if (state !== 'valid') throw badRequest(`invite_${state}`)
  const user = req.user!
  if (invite.email && invite.email !== user.email) throw forbidden('invite_other_email')
  const role = await participationIn(user.id, invite.tournamentId)
  // a speaker (or applicant) of this tournament cannot judge or run it
  if (role.competitor) throw forbidden('conflict_of_interest')
  if (invite.kind === 'judge' && role.judge) throw conflict('already_joined')
  if (invite.kind === 'co_organizer' && role.organizer) throw conflict('already_joined')

  await prisma.$transaction(async tx => {
    // claim the invite atomically so one link cannot be used twice in parallel
    const claimed = await tx.tournamentInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date(), usedById: user.id } })
    if (claimed.count !== 1) throw badRequest('invite_used')
    if (invite.kind === 'judge') {
      const institutionId = user.institution
        ? (await tx.institution.upsert({ where: { name: user.institution }, update: {}, create: { name: user.institution, level: invite.tournament.level } })).id
        : undefined
      await tx.judge.create({ data: { tournamentId: invite.tournamentId, name: user.name, rating: 5, userId: user.id, institutionId } })
    } else {
      await tx.tournamentOrganizer.create({ data: { tournamentId: invite.tournamentId, userId: user.id, role: 'co_organizer' } })
    }
  })
  background(notifyJoined(invite.tournamentId, user.id, invite.kind))
  res.json({ ok: true, kind: invite.kind, tournamentId: invite.tournamentId })
})

// the invited person says no; the organizers are told so they can invite someone else
invitesRouter.post('/invites/:token/decline', requireAuth(), async (req, res) => {
  const { invite, state } = await loadInvite(param(req, 'token'))
  if (state !== 'valid') throw badRequest(`invite_${state}`)
  if (invite.email && invite.email !== req.user!.email) throw forbidden('invite_other_email')
  await prisma.tournamentInvite.update({ where: { id: invite.id }, data: { declinedAt: new Date() } })
  const orgs = await organizersOf(invite.tournamentId)
  background(inbox(orgs, 'organizer.inviteDeclined', { tournament: invite.tournament.name, name: req.user!.name, kind: invite.kind },
    `/dashboard/tournaments/${invite.tournamentId}/${invite.kind === 'judge' ? 'judges' : 'settings'}`))
  res.json({ ok: true })
})
