import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toDay, todayKz } from '../lib/dates.js'
import rateLimit from 'express-rate-limit'
import { badRequest, conflict, forbidden, HttpError, notFound } from '../lib/errors.js'
import { env } from '../lib/env.js'
import { newToken } from '../lib/tokens.js'
import { passwordChangedLetter, resetPasswordLetter } from '../services/letters.js'
import { body, param } from '../middleware/validate.js'
import { clearSession, requireAuth, requireVerified, sessionUser, setSession } from '../middleware/auth.js'
import { removeOld } from './avatar.js'
import { assertSpeakers } from './organizer.js'
import { background, notifyNewRegistration } from '../services/notify.js'
import { participationIn, publicWhere, summaryInclude, toSummary } from '../services/tournaments.js'
import { placeOf, sideLabel, sidesInDebate } from '../services/formats.js'

export const meRouter = Router()
const mailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_requests' } })

const phone = z.string().trim().regex(/^\+?7\s?\(?7\d{2}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/, 'phone')

meRouter.patch('/me', requireAuth(), async (req, res) => {
  const data = body(req, z.object({
    name: z.string().trim().min(3).max(100),
    phone: z.union([phone, z.literal('')]).optional(),
    institution: z.string().trim().max(150).optional(),
    city: z.string().trim().max(60).optional(),
  }))
  // a phone confirmed through the Telegram bot stays confirmed only while it is not changed by hand
  const digits = (p?: string | null) => (p ?? '').replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7')
  const changedPhone = !!req.user!.verifiedPhone && digits(data.phone) !== digits(req.user!.verifiedPhone)
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      name: data.name, phone: data.phone || null, institution: data.institution || null, city: data.city || null,
      ...(changedPhone && { verifiedPhone: null, phoneVerifiedAt: null }),
    },
  })
  res.json({ user: await sessionUser(user) })
})

// password change from the profile; every other session is signed out
meRouter.post('/me/password', requireAuth(), async (req, res) => {
  const d = body(req, z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }))
  // a Google-only account sets its first password through a link sent to its email (POST /me/password/setup)
  if (!req.user!.passwordHash) throw badRequest('no_password')
  if (!(await bcrypt.compare(d.currentPassword, req.user!.passwordHash))) throw badRequest('wrong_password')
  if (d.currentPassword === d.newPassword) throw badRequest('same_password')
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash: await bcrypt.hash(d.newPassword, 12), passwordChangedAt: new Date() },
  })
  await passwordChangedLetter(user, false)
  setSession(res, user.id) // this device stays signed in
  res.json({ user: await sessionUser(user) })
})

// "Set a password" for accounts created with Google: a one-hour link goes to the account email,
// so a stolen session alone cannot add a password to someone else's account
meRouter.post('/me/password/setup', mailLimiter, requireAuth(), async (req, res) => {
  const me = req.user!
  if (me.passwordHash) throw badRequest('has_password')
  const { token, hash } = newToken()
  await prisma.emailToken.create({ data: { userId: me.id, purpose: 'reset_password', tokenHash: hash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } })
  const sent = await resetPasswordLetter(me, token)
  if (!sent) throw new HttpError(502, 'mail_failed')
  res.json({ ok: true, ...((env.NODE_ENV === 'development' || env.NODE_ENV === 'test') && { devResetToken: token }) })
})

// account deletion (personal data law): confirmed by password, or by typing the email for Google-only accounts.
// Owners of unfinished tournaments must finish or delete them first; admins are demoted by another admin first.
meRouter.delete('/me', requireAuth(), async (req, res) => {
  const { password, email } = body(req, z.object({ password: z.string().max(128).optional(), email: z.string().trim().toLowerCase().max(200).optional() }))
  const me = req.user!
  const confirmed = me.passwordHash ? !!password && (await bcrypt.compare(password, me.passwordHash)) : email === me.email
  if (!confirmed) throw badRequest(me.passwordHash ? 'wrong_password' : 'wrong_email')
  if (me.role === 'admin') throw forbidden('admin_cannot_delete_self')
  const active = await prisma.tournament.count({ where: { status: { not: 'finished' }, organizers: { some: { userId: me.id, role: 'owner' } } } })
  if (active) throw badRequest('owns_active_tournaments')
  // teams, judges and ballots stay in tournament history (links become empty); registrations and tokens are removed
  await prisma.user.delete({ where: { id: me.id } })
  await removeOld(me.avatarUrl)
  clearSession(res)
  res.status(204).end()
})

meRouter.get('/me/registrations', requireAuth(), async (req, res) => {
  const regs = await prisma.teamRegistration.findMany({
    where: { userId: req.user!.id },
    include: { tournament: { include: summaryInclude } },
    orderBy: { createdAt: 'desc' },
  })
  res.json(regs.map(r => ({
    id: r.id, tournamentId: r.tournamentId, teamName: r.teamName, institution: r.institution, speakers: r.speakers,
    status: r.status, createdAt: toDay(r.createdAt), tournament: toSummary(r.tournament),
  })))
})

// debates of every team where the signed-in user is a speaker
meRouter.get('/me/debates', requireAuth(), async (req, res) => {
  const speakers = await prisma.speaker.findMany({ where: { userId: req.user!.id }, select: { teamId: true } })
  const teamIds = speakers.map(s => s.teamId)
  const debates = await prisma.debate.findMany({
    where: {
      round: { status: { not: 'draft' } },
      OR: [{ propositionTeamId: { in: teamIds } }, { oppositionTeamId: { in: teamIds } }, { closingPropositionTeamId: { in: teamIds } }, { closingOppositionTeamId: { in: teamIds } }],
    },
    include: { round: { include: { tournament: true } }, proposition: true, opposition: true, closingProposition: true, closingOpposition: true },
    orderBy: [{ round: { date: 'asc' } }, { round: { number: 'asc' } }],
  })
  res.json(debates.map(d => {
    const teams = { proposition: d.proposition, opposition: d.opposition, closingProposition: d.closingProposition, closingOpposition: d.closingOpposition }
    const side = sidesInDebate(d).find(x => teamIds.includes(x.teamId))!.side
    const bp = d.ranking.length > 0 || !!d.closingPropositionTeamId
    // BP: the other three teams of the room are the opponents
    const others = sidesInDebate(d).filter(x => x.side !== side).map(x => teams[x.side]!)
    const opponent = { id: others[0].id, name: others.map(o => o.name).join(', ') }
    const place = placeOf(d, side)
    return {
      debate: { id: d.id, roundId: d.roundId, room: d.room, ballotStatus: d.ballotStatus, winner: d.winner ?? undefined },
      side: sideLabel(side, bp),
      ...(place && { place }),
      tournament: { id: d.round.tournament.id, name: d.round.tournament.name },
      round: { id: d.round.id, number: d.round.number, name: d.round.name, motion: d.round.motion, status: d.round.status, date: toDay(d.round.date) },
      opponent: { id: opponent.id, name: opponent.name },
      // 1st place in BP counts as a win, like in the standings
      result: d.winner ? (d.winner === side ? 'win' : 'loss') : null,
    }
  }))
})

const registrationSchema = z.object({
  teamName: z.string().trim().min(2).max(60),
  institution: z.string().trim().min(2).max(150),
  speakers: z.array(z.string().trim().min(3).max(100)).min(2).max(3), // as many as the tournament's format needs
  phone,
})

// any verified user can register a team; the organizer confirms later.
// Judges and organizers of this tournament cannot compete in it (conflict of interest).
meRouter.post('/tournaments/:id/registrations', requireAuth(), requireVerified, async (req, res) => {
  const data = body(req, registrationSchema)
  const t = await prisma.tournament.findFirst({ where: { id: param(req, 'id'), ...publicWhere }, include: { _count: { select: { teams: { where: { swing: false } } } } } })
  if (!t) throw notFound('tournament_not_found')
  // platform admins may judge or organize, but never compete as speakers
  if (req.user!.role === 'admin') throw forbidden('admins_cannot_compete')
  const role = await participationIn(req.user!.id, t.id)
  if (role.judge || role.organizer) throw forbidden('conflict_of_interest')
  if (t.status !== 'registration' || !t.registrationOpen) throw forbidden('registration_closed')
  if (t.registrationDeadline && toDay(t.registrationDeadline) < todayKz()) throw forbidden('registration_closed')
  if (t._count.teams >= t.maxTeams) throw badRequest('tournament_full')
  assertSpeakers(t.format, data.speakers)
  // a participant states their club and team in the profile first (organizers and ratings need to know who is from where)
  const membership = await prisma.clubMember.findUnique({ where: { userId: req.user!.id } })
  if (!membership?.teamId) throw badRequest('club_required')
  if (await prisma.teamRegistration.findUnique({ where: { tournamentId_teamName: { tournamentId: t.id, teamName: data.teamName } } })) {
    throw conflict('team_name_taken')
  }
  const reg = await prisma.teamRegistration.create({
    data: { tournamentId: t.id, userId: req.user!.id, teamName: data.teamName, institution: data.institution, speakers: data.speakers, contactPhone: data.phone, clubId: membership.clubId, clubTeamId: membership.teamId },
  })
  background(notifyNewRegistration(reg.id))
  res.status(201).json({ ...reg, createdAt: toDay(reg.createdAt) })
})
