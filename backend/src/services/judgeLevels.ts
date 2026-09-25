import type { JudgeLevel } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'

// Judge levels are earned, not granted: they are recomputed from real data every time.
//  - debates:     debates with a result where the person sat on the panel
//  - tournaments: distinct tournaments among them
//  - agreement:   share of panel debates (2+ ballots) where their ballot matched the final decision
//  - feedback:    teams' 1..5 scores; winners and losers are averaged separately and then combined,
//                 so a losing team's "revenge" cannot sink a judge; extremes are trimmed
//  - organizer:   organizers' 1..5 rating per tournament
// An admin may set a minimum level (judgeLevelMin) for known judges joining the platform.

export const LEVELS: JudgeLevel[] = ['novice', 'judge', 'experienced', 'chief']
export const levelRank = (l: JudgeLevel) => LEVELS.indexOf(l)

interface Rule { debates: number; tournaments: number; feedback: number; avg: number; agreement: number; organizer: number }
// feedback/agreement/organizer checks apply only once there is enough data for them,
// except the "min feedback count" of the upper levels, which is a hard requirement
export const LEVEL_RULES: Record<Exclude<JudgeLevel, 'novice'>, Rule> = {
  judge: { debates: 6, tournaments: 1, feedback: 0, avg: 3.0, agreement: 0.5, organizer: 3.0 },
  experienced: { debates: 20, tournaments: 2, feedback: 10, avg: 3.8, agreement: 0.65, organizer: 3.5 },
  chief: { debates: 50, tournaments: 4, feedback: 25, avg: 4.2, agreement: 0.75, organizer: 4.0 },
}
const MIN_FEEDBACK_FOR_AVG = 3 // fewer scores are neither shown nor judged (anonymity + noise)
const MIN_PANELS_FOR_AGREEMENT = 3

export interface JudgeStats {
  debates: number
  tournaments: number
  panels: number
  agreement: number | null
  feedbackCount: number
  feedbackAvg: number | null
  organizerCount: number
  organizerAvg: number | null
}

export interface JudgeProfile {
  level: JudgeLevel
  earnedLevel: JudgeLevel
  minLevel: JudgeLevel | null
  stats: JudgeStats
  next: { level: JudgeLevel; checks: { key: string; current: number | null; required: number; met: boolean }[] } | null
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
// drop the single highest and lowest score once there are enough of them
const trimmed = (xs: number[]) => {
  if (xs.length < 5) return mean(xs)
  const s = [...xs].sort((a, b) => a - b)
  return mean(s.slice(1, -1))
}
export function fairAverage(rows: { score: number; teamWon: boolean }[]) {
  const won = trimmed(rows.filter(r => r.teamWon).map(r => r.score))
  const lost = trimmed(rows.filter(r => !r.teamWon).map(r => r.score))
  if (won === null) return lost
  if (lost === null) return won
  return (won + lost) / 2
}
const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100)

function checksFor(rule: Rule, s: JudgeStats) {
  return [
    { key: 'debates', current: s.debates, required: rule.debates, met: s.debates >= rule.debates },
    { key: 'tournaments', current: s.tournaments, required: rule.tournaments, met: s.tournaments >= rule.tournaments },
    ...(rule.feedback ? [{ key: 'feedbackCount', current: s.feedbackCount, required: rule.feedback, met: s.feedbackCount >= rule.feedback }] : []),
    { key: 'feedbackAvg', current: s.feedbackAvg, required: rule.avg, met: s.feedbackAvg === null ? !rule.feedback : s.feedbackAvg >= rule.avg },
    { key: 'agreement', current: s.agreement, required: rule.agreement, met: s.agreement === null || s.agreement >= rule.agreement },
    { key: 'organizer', current: s.organizerAvg, required: rule.organizer, met: s.organizerAvg === null || s.organizerAvg >= rule.organizer },
  ]
}

function earned(s: JudgeStats): JudgeLevel {
  let level: JudgeLevel = 'novice'
  for (const l of ['judge', 'experienced', 'chief'] as const) {
    if (checksFor(LEVEL_RULES[l], s).every(c => c.met)) level = l
    else break
  }
  return level
}

// profiles for many users at once (a few queries, no N+1)
export async function judgeProfiles(userIds: string[]): Promise<Map<string, JudgeProfile>> {
  const ids = [...new Set(userIds)]
  const out = new Map<string, JudgeProfile>()
  if (!ids.length) return out
  const [users, seats, ballots, feedback, reviews] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, judgeLevelMin: true } }),
    prisma.debateJudge.findMany({
      where: { judge: { userId: { in: ids } }, debate: { winner: { not: null } } },
      select: { judge: { select: { userId: true } }, debate: { select: { id: true, round: { select: { tournamentId: true } } } } },
    }),
    prisma.ballot.findMany({
      where: { judge: { userId: { in: ids } }, debate: { winner: { not: null } } },
      select: { winner: true, judge: { select: { userId: true } }, debate: { select: { winner: true, _count: { select: { ballots: true } } } } },
    }),
    prisma.judgeFeedback.findMany({ where: { judge: { userId: { in: ids } } }, select: { score: true, teamWon: true, judge: { select: { userId: true } } } }),
    prisma.judgeReview.findMany({ where: { judge: { userId: { in: ids } } }, select: { score: true, judge: { select: { userId: true } } } }),
  ])
  for (const u of users) {
    const mySeats = seats.filter(x => x.judge.userId === u.id)
    const panels = ballots.filter(b => b.judge.userId === u.id && b.debate._count.ballots > 1)
    const fb = feedback.filter(f => f.judge.userId === u.id)
    const rv = reviews.filter(r => r.judge.userId === u.id).map(r => r.score)
    const fbAvg = fb.length >= MIN_FEEDBACK_FOR_AVG ? fairAverage(fb) : null
    const stats: JudgeStats = {
      debates: new Set(mySeats.map(x => x.debate.id)).size,
      tournaments: new Set(mySeats.map(x => x.debate.round.tournamentId)).size,
      panels: panels.length,
      agreement: panels.length >= MIN_PANELS_FOR_AGREEMENT ? round2(panels.filter(b => b.winner === b.debate.winner).length / panels.length) : null,
      feedbackCount: fb.length,
      feedbackAvg: round2(fbAvg),
      organizerCount: rv.length,
      organizerAvg: round2(mean(rv)),
    }
    const earnedLevel = earned(stats)
    const level = u.judgeLevelMin && levelRank(u.judgeLevelMin) > levelRank(earnedLevel) ? u.judgeLevelMin : earnedLevel
    const nextLevel = LEVELS[levelRank(earnedLevel) + 1] as Exclude<JudgeLevel, 'novice'> | undefined
    out.set(u.id, {
      level, earnedLevel, minLevel: u.judgeLevelMin, stats,
      next: nextLevel ? { level: nextLevel, checks: checksFor(LEVEL_RULES[nextLevel], stats) } : null,
    })
  }
  return out
}

export async function judgeProfile(userId: string) {
  return (await judgeProfiles([userId])).get(userId)!
}

// level per Judge row of a tournament (judges without an account have no level)
export async function levelsForJudges(judges: { id: string; userId: string | null }[]) {
  const profiles = await judgeProfiles(judges.flatMap(j => (j.userId ? [j.userId] : [])))
  return new Map(judges.map(j => [j.id, j.userId ? profiles.get(j.userId)?.level : undefined]))
}
