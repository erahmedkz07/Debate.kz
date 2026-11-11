import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, HttpError, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { withLock } from '../lib/lock.js'
import { assertCanManage } from '../services/tournaments.js'
import { rulesOf } from '../services/formats.js'
import { notify, organizersOf } from '../services/notify.js'

// The tournament day for its organizers (the Telegram bot uses it, the site can too):
//   - where the current round stands: ballots in and the rooms still waiting (with the judges' names), who checked in;
//   - a reminder to the judges whose ballot is missing;
//   - an announcement to everyone in the tournament (teams, judges, co-organizers).
export const tournamentDayRouter = Router()

// the judges who still owe a ballot in a debate: every judge in two-team formats, the chair in BP (one panel ballot)
type PanelDebate = { id: string; room: string; judges: { judgeId: string; isChair: boolean; judge: { name: string; userId: string | null } }[]; ballots: { judgeId: string }[] }
export function missingJudges(d: PanelDebate, format: string) {
  const bp = rulesOf(format).teams === 4
  if (bp) return d.ballots.length ? [] : d.judges.filter(j => j.isChair)
  return d.judges.filter(j => !d.ballots.some(b => b.judgeId === j.judgeId))
}

const debateSelect = {
  id: true, room: true, winner: true,
  judges: { select: { judgeId: true, isChair: true, judge: { select: { name: true, userId: true } } }, orderBy: { isChair: 'desc' as const } },
  ballots: { select: { judgeId: true } },
} as const

// the round going on: the last published one that is not completed (else the last completed one)
async function currentRound(tournamentId: string) {
  return (await prisma.round.findFirst({ where: { tournamentId, status: 'released' }, orderBy: { number: 'desc' }, include: { debates: { select: debateSelect, orderBy: { room: 'asc' } } } }))
    ?? prisma.round.findFirst({ where: { tournamentId, status: 'completed' }, orderBy: { number: 'desc' }, include: { debates: { select: debateSelect, orderBy: { room: 'asc' } } } })
}

tournamentDayRouter.get('/tournaments/:id/day', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const t = await prisma.tournament.findUnique({ where: { id }, select: { name: true, format: true, checkinCode: true } })
  if (!t) throw notFound('tournament_not_found')
  const [round, teams] = await Promise.all([
    currentRound(id),
    prisma.team.findMany({ where: { tournamentId: id, swing: false, withdrawnAt: null }, select: { name: true, checkedInAt: true }, orderBy: { name: 'asc' } }),
  ])
  const debates = round?.debates ?? []
  const waiting = debates.map(d => ({ debateId: d.id, room: d.room, judges: missingJudges(d, t.format).map(j => ({ name: j.judge.name, account: !!j.judge.userId })) })).filter(x => x.judges.length)
  res.json({
    tournament: { id, name: t.name },
    round: round ? { id: round.id, name: round.name, number: round.number, status: round.status, releasedAt: round.releasedAt?.toISOString() } : null,
    ballots: { done: debates.length - waiting.length, total: debates.length, waiting },
    checkin: { open: !!t.checkinCode, present: teams.filter(x => x.checkedInAt).length, total: teams.length, absent: teams.filter(x => !x.checkedInAt).map(x => x.name) },
  })
})

// "remind the judges": one notification per judge (with an account) who still owes a ballot in this round; a second
// press within 5 minutes reaches nobody again
export async function remindJudges(roundId: string, minutes = 5) {
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { tournament: { select: { name: true, format: true } }, debates: { select: debateSelect } } })
  if (!round) throw notFound('round_not_found')
  let sent = 0, withoutAccount = 0
  const since = new Date(Date.now() - minutes * 60_000)
  for (const d of round.debates) {
    for (const j of missingJudges(d, round.tournament.format)) {
      if (!j.judge.userId) { withoutAccount++; continue }
      const link = `/ballot/${d.id}`
      const recent = await prisma.notification.findFirst({ where: { userId: j.judge.userId, type: 'judge.ballotReminder', link, createdAt: { gte: since } } })
      if (recent) continue
      await notify([j.judge.userId], 'judge.ballotReminder', { tournament: round.tournament.name, round: round.name, room: d.room }, link)
      sent++
    }
  }
  return { sent, withoutAccount }
}

tournamentDayRouter.post('/rounds/:roundId/remind-judges', requireAuth(), async (req, res) => {
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') }, select: { id: true, tournamentId: true, status: true } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  if (round.status !== 'released') throw badRequest('round_not_released')
  res.json(await withLock(`remind:${round.id}`, () => remindJudges(round.id)))
})

// an announcement to everyone in the tournament: the speakers of its teams, the applicants with a place, the judges and
// the other organizers; at most one a minute (a double tap sends it once)
tournamentDayRouter.post('/tournaments/:id/announcements', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const { text } = body(req, z.object({ text: z.string().trim().min(3).max(1000) }))
  const result = await withLock(`announce:${id}`, async () => {
    const t = await prisma.tournament.findUnique({ where: { id }, select: { name: true } })
    if (!t) throw notFound('tournament_not_found')
    const link = `/tournaments/${id}`
    if (await prisma.notification.findFirst({ where: { type: 'participant.announcement', link, createdAt: { gte: new Date(Date.now() - 60_000) } } })) throw new HttpError(429, 'announcement_too_soon')
    const [speakers, regs, judges, organizers] = await Promise.all([
      prisma.speaker.findMany({ where: { userId: { not: null }, team: { tournamentId: id, swing: false, withdrawnAt: null } }, select: { userId: true } }),
      prisma.teamRegistration.findMany({ where: { tournamentId: id, status: 'confirmed' }, select: { userId: true } }),
      prisma.judge.findMany({ where: { tournamentId: id, userId: { not: null }, leftAt: null }, select: { userId: true } }),
      organizersOf(id),
    ])
    const to = [...new Set([...speakers.map(x => x.userId!), ...regs.map(x => x.userId), ...judges.map(x => x.userId!), ...organizers])].filter(u => u !== req.user!.id)
    await notify(to, 'participant.announcement', { tournament: t.name, text, from: req.user!.name }, link)
    return { sent: to.length }
  })
  res.status(201).json(result)
})
