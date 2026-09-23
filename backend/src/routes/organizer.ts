import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fromDay, toDay } from '../lib/dates.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { assertCanManage, summaryInclude, toSummary, toTeam } from '../services/tournaments.js'
import { generateDraw } from '../services/draw.js'

export const organizerRouter = Router()
const org = requireAuth('organizer', 'admin')

export const FREE_TEAM_LIMIT = 12
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// ---------- tournaments ----------

organizerRouter.get('/organizer/tournaments', org, async (req, res) => {
  const where = req.user!.role === 'admin' ? {} : { organizers: { some: { userId: req.user!.id } } }
  const rows = await prisma.tournament.findMany({ where, include: summaryInclude, orderBy: { startDate: 'desc' } })
  res.json(rows.map(toSummary))
})

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(60),
  startDate: day,
  endDate: day,
  level: z.enum(['school', 'university']),
  description: z.string().trim().max(3000).default(''),
  coverUrl: z.string().url().max(500).optional(),
  preliminaryRounds: z.number().int().min(2).max(8),
  breakSize: z.number().int().refine(n => [2, 4, 8, 16].includes(n)),
  maxTeams: z.number().int().min(4).max(128),
  registrationOpen: z.boolean().default(true),
  requireApproval: z.boolean().default(true),
  registrationDeadline: day.optional(),
  languages: z.array(z.enum(['ru', 'kz'])).min(1),
}).refine(v => v.endDate >= v.startDate, { path: ['endDate'], message: 'end_before_start' })
  .refine(v => !v.registrationDeadline || v.registrationDeadline <= v.startDate, { path: ['registrationDeadline'], message: 'deadline_after_start' })

organizerRouter.post('/tournaments', org, async (req, res) => {
  const d = body(req, createSchema)
  const pro = d.maxTeams > FREE_TEAM_LIMIT
  const start = fromDay(d.startDate), end = fromDay(d.endDate)
  const t = await prisma.tournament.create({
    data: {
      name: d.name, city: d.city, startDate: start, endDate: end, level: d.level, description: d.description,
      coverUrl: d.coverUrl, preliminaryRounds: d.preliminaryRounds, breakSize: d.breakSize, maxTeams: d.maxTeams,
      registrationOpen: d.registrationOpen, requireApproval: d.requireApproval,
      registrationDeadline: d.registrationDeadline ? fromDay(d.registrationDeadline) : null,
      languages: d.languages, organizerName: req.user!.institution ?? req.user!.name,
      // Pro plan is paid offline; admin marks it as paid manually
      plan: pro ? 'pro' : 'free', paid: !pro,
      organizers: { create: { userId: req.user!.id } },
      scoringConfig: { create: {} },
      rounds: {
        create: Array.from({ length: d.preliminaryRounds }, (_, i) => ({
          number: i + 1, name: `Раунд ${i + 1}`, date: i < Math.ceil(d.preliminaryRounds / 2) ? start : end,
        })),
      },
    },
    include: summaryInclude,
  })
  res.status(201).json(toSummary(t))
})

organizerRouter.patch('/tournaments/:id', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(3000).optional(),
    visible: z.boolean().optional(),
    registrationOpen: z.boolean().optional(),
    status: z.enum(['registration', 'ongoing', 'finished']).optional(),
  }))
  const t = await prisma.tournament.update({ where: { id: param(req, 'id') }, data: d, include: summaryInclude })
  res.json(toSummary(t))
})

organizerRouter.delete('/tournaments/:id', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  await prisma.tournament.delete({ where: { id: param(req, 'id') } })
  res.status(204).end()
})

// ---------- teams ----------

const teamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  institution: z.string().trim().min(2).max(150),
  city: z.string().trim().max(60).optional(),
  speakers: z.array(z.string().trim().min(3).max(100)).length(3),
})

async function institutionId(name: string, level: 'school' | 'university') {
  const i = await prisma.institution.upsert({ where: { name }, update: {}, create: { name, level } })
  return i.id
}

organizerRouter.post('/tournaments/:id/teams', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, teamSchema)
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') }, include: { _count: { select: { teams: true } } } })
  if (t._count.teams >= t.maxTeams) throw badRequest('tournament_full')
  if (await prisma.team.findUnique({ where: { tournamentId_name: { tournamentId: t.id, name: d.name } } })) throw conflict('team_name_taken')
  const team = await prisma.team.create({
    data: {
      tournamentId: t.id, name: d.name, city: d.city, institutionId: await institutionId(d.institution, t.level),
      speakers: { create: d.speakers.map((name, i) => ({ name, position: i + 1 })) },
    },
    include: { institution: true, speakers: { orderBy: { position: 'asc' } } },
  })
  res.status(201).json(toTeam(team))
})

organizerRouter.patch('/teams/:teamId', org, async (req, res) => {
  const existing = await prisma.team.findUnique({ where: { id: param(req, 'teamId') }, include: { tournament: true, speakers: { orderBy: { position: 'asc' } } } })
  if (!existing) throw notFound('team_not_found')
  await assertCanManage(req.user, existing.tournamentId)
  const d = body(req, teamSchema)
  const team = await prisma.$transaction(async tx => {
    await Promise.all(existing.speakers.map((s, i) => tx.speaker.update({ where: { id: s.id }, data: { name: d.speakers[i] } })))
    return tx.team.update({
      where: { id: existing.id },
      data: { name: d.name, city: d.city, institutionId: await institutionId(d.institution, existing.tournament.level) },
      include: { institution: true, speakers: { orderBy: { position: 'asc' } } },
    })
  })
  res.json(toTeam(team))
})

organizerRouter.delete('/teams/:teamId', org, async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: param(req, 'teamId') } })
  if (!team) throw notFound('team_not_found')
  await assertCanManage(req.user, team.tournamentId)
  const played = await prisma.debate.count({ where: { OR: [{ propositionTeamId: team.id }, { oppositionTeamId: team.id }] } })
  if (played) throw forbidden('team_in_draw')
  await prisma.team.delete({ where: { id: team.id } })
  res.status(204).end()
})

// ---------- judges ----------

organizerRouter.post('/tournaments/:id/judges', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({
    name: z.string().trim().min(3).max(100),
    institution: z.string().trim().max(150).optional(),
    rating: z.number().int().min(1).max(10),
    email: z.string().trim().toLowerCase().email().optional(), // links the judge to an existing account
  }))
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') } })
  const user = d.email ? await prisma.user.findUnique({ where: { email: d.email } }) : null
  const j = await prisma.judge.create({
    data: {
      tournamentId: t.id, name: d.name, rating: d.rating, userId: user?.id,
      institutionId: d.institution ? await institutionId(d.institution, 'university') : undefined,
    },
    include: { institution: true },
  })
  res.status(201).json({ id: j.id, tournamentId: j.tournamentId, name: j.name, institution: j.institution?.name ?? '', rating: j.rating })
})

// ---------- rounds & draw ----------

const nextStatus = { draft: 'released', released: 'completed' } as const

organizerRouter.patch('/rounds/:roundId', org, async (req, res) => {
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') }, include: { debates: true } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  const d = body(req, z.object({
    motion: z.string().trim().max(500).optional(),
    infoSlide: z.string().trim().max(2000).optional(),
    status: z.enum(['released', 'completed']).optional(),
  }))
  if (round.status === 'completed' && (d.motion !== undefined || d.infoSlide !== undefined)) throw forbidden('round_completed')
  if (d.status) {
    if (nextStatus[round.status as keyof typeof nextStatus] !== d.status) throw badRequest('invalid_status_transition')
    const motion = d.motion ?? round.motion
    if (d.status === 'released' && (!motion.trim() || round.debates.length === 0)) throw badRequest('need_motion_and_draw')
    if (d.status === 'completed' && round.debates.some(x => !x.winner)) throw badRequest('ballots_missing')
  }
  const updated = await prisma.$transaction(async tx => {
    // completing a round locks all its ballots
    if (d.status === 'completed') await tx.debate.updateMany({ where: { roundId: round.id }, data: { ballotStatus: 'confirmed' } })
    return tx.round.update({ where: { id: round.id }, data: d })
  })
  res.json({ ...updated, date: toDay(updated.date), infoSlide: updated.infoSlide ?? undefined })
})

organizerRouter.post('/rounds/:roundId/draw', org, async (req, res) => {
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  await generateDraw(round.id)
  const debates = await prisma.debate.findMany({ where: { roundId: round.id }, include: { judges: { orderBy: { isChair: 'desc' } } }, orderBy: { room: 'asc' } })
  res.status(201).json(debates.map(x => ({
    id: x.id, roundId: x.roundId, room: x.room, propositionTeamId: x.propositionTeamId, oppositionTeamId: x.oppositionTeamId,
    judgeIds: x.judges.map(j => j.judgeId), winner: x.winner ?? undefined, ballotStatus: x.ballotStatus,
  })))
})

organizerRouter.patch('/debates/:debateId', org, async (req, res) => {
  const debate = await prisma.debate.findUnique({ where: { id: param(req, 'debateId') }, include: { round: true, judges: true } })
  if (!debate) throw notFound('debate_not_found')
  await assertCanManage(req.user, debate.round.tournamentId)
  if (debate.round.status === 'completed') throw forbidden('round_completed')
  const d = body(req, z.object({
    room: z.string().trim().min(1).max(60).optional(),
    swapSides: z.boolean().optional(),
    chairJudgeId: z.string().optional(),
  }))
  await prisma.$transaction(async tx => {
    if (d.room) await tx.debate.update({ where: { id: debate.id }, data: { room: d.room } })
    if (d.swapSides) {
      if (await tx.ballot.count({ where: { debateId: debate.id } })) throw forbidden('ballots_already_submitted')
      await tx.debate.update({ where: { id: debate.id }, data: { propositionTeamId: debate.oppositionTeamId, oppositionTeamId: debate.propositionTeamId } })
    }
    if (d.chairJudgeId) {
      const judge = await tx.judge.findUnique({ where: { id: d.chairJudgeId } })
      if (!judge || judge.tournamentId !== debate.round.tournamentId) throw badRequest('invalid_judge')
      // a judge can sit in only one room per round
      const busy = await tx.debateJudge.findFirst({ where: { judgeId: judge.id, debate: { roundId: debate.roundId, id: { not: debate.id } } } })
      if (busy) throw conflict('judge_busy_in_round')
      await tx.debateJudge.updateMany({ where: { debateId: debate.id }, data: { isChair: false } })
      await tx.debateJudge.deleteMany({ where: { debateId: debate.id, judgeId: judge.id } })
      const oldChair = debate.judges.find(j => j.isChair)
      if (oldChair && oldChair.judgeId !== judge.id) await tx.debateJudge.delete({ where: { debateId_judgeId: { debateId: debate.id, judgeId: oldChair.judgeId } } })
      await tx.debateJudge.create({ data: { debateId: debate.id, judgeId: judge.id, isChair: true } })
    }
  })
  const x = await prisma.debate.findUniqueOrThrow({ where: { id: debate.id }, include: { judges: { orderBy: { isChair: 'desc' } } } })
  res.json({
    id: x.id, roundId: x.roundId, room: x.room, propositionTeamId: x.propositionTeamId, oppositionTeamId: x.oppositionTeamId,
    judgeIds: x.judges.map(j => j.judgeId), winner: x.winner ?? undefined, ballotStatus: x.ballotStatus,
  })
})

// ---------- registrations ----------

organizerRouter.get('/tournaments/:id/registrations', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const regs = await prisma.teamRegistration.findMany({ where: { tournamentId: param(req, 'id') }, include: { user: true }, orderBy: { createdAt: 'asc' } })
  res.json(regs.map(r => ({
    id: r.id, tournamentId: r.tournamentId, teamName: r.teamName, institution: r.institution, speakers: r.speakers,
    contactPhone: r.contactPhone, status: r.status, createdAt: toDay(r.createdAt), user: { id: r.user.id, name: r.user.name, email: r.user.email },
  })))
})

// confirming a registration creates the team; the registering participant is linked to their speaker slot
organizerRouter.patch('/registrations/:regId', org, async (req, res) => {
  const reg = await prisma.teamRegistration.findUnique({ where: { id: param(req, 'regId') }, include: { tournament: { include: { _count: { select: { teams: true } } } }, user: true } })
  if (!reg) throw notFound('registration_not_found')
  await assertCanManage(req.user, reg.tournamentId)
  const { status } = body(req, z.object({ status: z.enum(['confirmed', 'rejected']) }))
  if (reg.status !== 'pending') throw badRequest('already_processed')
  if (status === 'confirmed') {
    if (reg.tournament._count.teams >= reg.tournament.maxTeams) throw badRequest('tournament_full')
    if (await prisma.team.findUnique({ where: { tournamentId_name: { tournamentId: reg.tournamentId, name: reg.teamName } } })) throw conflict('team_name_taken')
    const instId = await institutionId(reg.institution, reg.tournament.level)
    await prisma.$transaction([
      prisma.team.create({
        data: {
          tournamentId: reg.tournamentId, name: reg.teamName, institutionId: instId, city: reg.user.city,
          speakers: { create: reg.speakers.map((name, i) => ({ name, position: i + 1, userId: name === reg.user.name ? reg.userId : undefined })) },
        },
      }),
      prisma.teamRegistration.update({ where: { id: reg.id }, data: { status } }),
    ])
  } else {
    await prisma.teamRegistration.update({ where: { id: reg.id }, data: { status } })
  }
  res.json({ id: reg.id, status })
})
