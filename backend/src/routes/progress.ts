import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { requireAuth } from '../middleware/auth.js'
import { topicsOf } from '../services/topics.js'
import { hiddenRoundIds } from '../services/silent.js'

// A speaker's progress: every speech of the signed-in user in completed rounds,
// averaged over the panel, plus the judges' written comments.
export const progressRouter = Router()

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

progressRouter.get('/me/progress', requireAuth(), async (req, res) => {
  const scores = await prisma.speakerScore.findMany({
    // completed rounds only: results and comments are final and already public in the standings
    where: { speaker: { userId: req.user!.id }, ballot: { debate: { round: { status: 'completed' } } } },
    include: {
      ballot: {
        include: {
          judge: { select: { name: true } },
          debate: { include: { round: { include: { tournament: { select: { id: true, name: true } } } } } },
        },
      },
    },
  })

  const hidden = new Set<string>()
  for (const tid of new Set(scores.map(s => s.ballot.debate.round.tournamentId))) for (const id of await hiddenRoundIds(tid)) hidden.add(id)

  // one speech = one debate + position; its score is the panel average
  const speeches = new Map<string, { debateId: string; date: string; tournament: { id: string; name: string }; round: string; roundNo: number; motion: string; position: number; side: string; won: boolean; list: number[] }>()
  const comments: { judge: string; text: string; position: number; score: number; tournament: string; round: string; date: string }[] = []
  for (const s of scores) {
    const d = s.ballot.debate
    if (hidden.has(d.roundId)) continue // a silent round: revealed with the break
    const key = `${d.id}:${s.position}`
    const entry = speeches.get(key) ?? {
      debateId: d.id, date: toDay(d.round.date), tournament: d.round.tournament, round: d.round.name, roundNo: d.round.number, motion: d.round.motion,
      position: s.position, side: s.side, won: d.winner === s.side, list: [],
    }
    entry.list.push(Number(s.score))
    speeches.set(key, entry)
    if (s.feedback) comments.push({ judge: s.ballot.judge.name, text: s.feedback, position: s.position, score: Number(s.score), tournament: d.round.tournament.name, round: d.round.name, date: toDay(d.round.date) })
  }
  const all = [...speeches.values()]
    .map(({ list, ...x }) => ({ ...x, score: avg(list)! }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.roundNo - b.roundNo)
  const substantive = all.filter(x => x.position <= 3)
  const replies = all.filter(x => x.position === 4)

  // trend: the second half of the speeches against the first half (needs at least 4)
  const half = Math.floor(substantive.length / 2)
  const trend = substantive.length >= 4
    ? Math.round(((avg(substantive.slice(-half).map(x => x.score)) ?? 0) - (avg(substantive.slice(0, half).map(x => x.score)) ?? 0)) * 10) / 10
    : null

  const byTopic = new Map<string, number[]>()
  for (const x of substantive) for (const topic of topicsOf(x.motion)) byTopic.set(topic, [...(byTopic.get(topic) ?? []), x.score])

  res.json({
    summary: {
      speeches: substantive.length,
      debates: new Set(all.map(x => x.debateId)).size,
      wins: new Set(all.filter(x => x.won).map(x => x.debateId)).size,
      average: avg(substantive.map(x => x.score)),
      best: substantive.length ? Math.max(...substantive.map(x => x.score)) : null,
      replyAverage: avg(replies.map(x => x.score)),
      trend,
    },
    timeline: substantive.map(x => ({ date: x.date, tournament: x.tournament.name, round: x.round, position: x.position, score: x.score, won: x.won })),
    byPosition: [1, 2, 3].map(p => ({ position: p, average: avg(substantive.filter(x => x.position === p).map(x => x.score)), count: substantive.filter(x => x.position === p).length })),
    byTopic: [...byTopic].map(([topic, list]) => ({ topic, average: avg(list)!, count: list.length })).sort((a, b) => b.count - a.count),
    comments: comments.sort((a, b) => b.date.localeCompare(a.date)),
  })
})
