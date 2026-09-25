import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { clearSession, requireAuth, requireVerified, sessionUser, setSession } from '../middleware/auth.js'
import { removeOld } from './avatar.js'
import { participationIn, publicWhere, summaryInclude, toSummary } from '../services/tournaments.js'

export const meRouter = Router()

const phone = z.string().trim().regex(/^\+?7\s?\(?7\d{2}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/, 'phone')

meRouter.patch('/me', requireAuth(), async (req, res) => {
  const data = body(req, z.object({
    name: z.string().trim().min(3).max(100),
    phone: z.union([phone, z.literal('')]).optional(),
    institution: z.string().trim().max(150).optional(),
    city: z.string().trim().max(60).optional(),
  }))
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: data.name, phone: data.phone || null, institution: data.institution || null, city: data.city || null },
  })
  res.json({ user: await sessionUser(user) })
})

// password change from the profile; every other session is signed out
meRouter.post('/me/password', requireAuth(), async (req, res) => {
  const d = body(req, z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }))
  if (!(await bcrypt.compare(d.currentPassword, req.user!.passwordHash))) throw badRequest('wrong_password')
  if (d.currentPassword === d.newPassword) throw badRequest('same_password')
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash: await bcrypt.hash(d.newPassword, 12), passwordChangedAt: new Date() },
  })
  setSession(res, user.id) // this device stays signed in
  res.json({ user: await sessionUser(user) })
})

// account deletion (personal data law): confirmed by password.
// Owners of unfinished tournaments must finish or delete them first; admins are demoted by another admin first.
meRouter.delete('/me', requireAuth(), async (req, res) => {
  const { password } = body(req, z.object({ password: z.string().min(1).max(128) }))
  const me = req.user!
  if (!(await bcrypt.compare(password, me.passwordHash))) throw badRequest('wrong_password')
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
    where: { round: { status: { not: 'draft' } }, OR: [{ propositionTeamId: { in: teamIds } }, { oppositionTeamId: { in: teamIds } }] },
    include: { round: { include: { tournament: true } }, proposition: true, opposition: true },
    orderBy: [{ round: { date: 'asc' } }, { round: { number: 'asc' } }],
  })
  res.json(debates.map(d => {
    const side = teamIds.includes(d.propositionTeamId) ? 'proposition' : 'opposition'
    const opponent = side === 'proposition' ? d.opposition : d.proposition
    return {
      debate: { id: d.id, roundId: d.roundId, room: d.room, ballotStatus: d.ballotStatus, winner: d.winner ?? undefined },
      side,
      tournament: { id: d.round.tournament.id, name: d.round.tournament.name },
      round: { id: d.round.id, number: d.round.number, name: d.round.name, motion: d.round.motion, status: d.round.status, date: toDay(d.round.date) },
      opponent: { id: opponent.id, name: opponent.name },
      result: d.winner ? (d.winner === side ? 'win' : 'loss') : null,
    }
  }))
})

const registrationSchema = z.object({
  teamName: z.string().trim().min(2).max(60),
  institution: z.string().trim().min(2).max(150),
  speakers: z.array(z.string().trim().min(3).max(100)).length(3),
  phone,
})

// any verified user can register a team; the organizer confirms later.
// Judges and organizers of this tournament cannot compete in it (conflict of interest).
meRouter.post('/tournaments/:id/registrations', requireAuth(), requireVerified, async (req, res) => {
  const data = body(req, registrationSchema)
  const t = await prisma.tournament.findFirst({ where: { id: param(req, 'id'), ...publicWhere }, include: { _count: { select: { teams: true } } } })
  if (!t) throw notFound('tournament_not_found')
  // platform admins may judge or organize, but never compete as speakers
  if (req.user!.role === 'admin') throw forbidden('admins_cannot_compete')
  const role = await participationIn(req.user!.id, t.id)
  if (role.judge || role.organizer) throw forbidden('conflict_of_interest')
  if (t.status !== 'registration' || !t.registrationOpen) throw forbidden('registration_closed')
  if (t.registrationDeadline && t.registrationDeadline < new Date(toDay(new Date()))) throw forbidden('registration_closed')
  if (t._count.teams >= t.maxTeams) throw badRequest('tournament_full')
  if (await prisma.teamRegistration.findUnique({ where: { tournamentId_teamName: { tournamentId: t.id, teamName: data.teamName } } })) {
    throw conflict('team_name_taken')
  }
  const reg = await prisma.teamRegistration.create({
    data: { tournamentId: t.id, userId: req.user!.id, teamName: data.teamName, institution: data.institution, speakers: data.speakers, contactPhone: data.phone },
  })
  res.status(201).json({ ...reg, createdAt: toDay(reg.createdAt) })
})
