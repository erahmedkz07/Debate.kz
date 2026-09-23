import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { publicUser, requireAuth } from '../middleware/auth.js'
import { summaryInclude, toSummary } from '../services/tournaments.js'

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
  res.json({ user: publicUser(user) })
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

// only participants register teams; organizer confirms later
meRouter.post('/tournaments/:id/registrations', requireAuth('participant'), async (req, res) => {
  const data = body(req, registrationSchema)
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'id') }, include: { _count: { select: { teams: true } } } })
  if (!t || !t.visible) throw notFound('tournament_not_found')
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
