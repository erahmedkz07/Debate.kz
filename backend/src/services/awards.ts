import { prisma } from '../lib/prisma.js'
import { getStandings } from './tournaments.js'
import { newCode } from './certificates.js'
import { background, notify } from './notify.js'

// "Best speaker" and "Best judge" of a tournament: the site suggests, the organizer confirms.
//   best speaker — the speaker standings (total of their preliminary speeches), counting only those who spoke in every
//                  completed preliminary round, so one great round does not beat a whole tournament;
//   best judge   — the speakers' ratings of the judges (judge feedback): the average, with at least MIN_REVIEWS reviews,
//                  ties broken by the number of reviews and the organizer's own rating of the judge.
// The organizer picks one of the suggestions (or anyone else from the tournament); after the finish each award is a
// separate diploma with its own code, issued at once (or when the tournament finishes).
export const MIN_REVIEWS = 3
export type AwardKind = 'best_speaker' | 'best_judge'

export async function awardCandidates(tournamentId: string) {
  const [standings, prelims, judges, feedback] = await Promise.all([
    getStandings(tournamentId),
    prisma.round.count({ where: { tournamentId, kind: 'preliminary', status: 'completed' } }),
    prisma.judge.findMany({ where: { tournamentId }, select: { id: true, name: true, rating: true } }),
    prisma.judgeFeedback.findMany({ where: { judge: { tournamentId } }, select: { judgeId: true, score: true } }),
  ])
  const speakers = standings.speakers
    .filter(s => s.total > 0)
    .map(s => ({ id: s.speaker.id, name: s.speaker.name, team: s.team.name, total: s.total, average: s.average, rounds: s.average ? Math.round(s.total / s.average) : 0 }))
    .filter(s => s.rounds >= prelims)
    .slice(0, 3)
  const byJudge = new Map<string, number[]>()
  for (const f of feedback) byJudge.set(f.judgeId, [...(byJudge.get(f.judgeId) ?? []), f.score])
  const judgeRows = judges.map(j => {
    const scores = byJudge.get(j.id) ?? []
    return { id: j.id, name: j.name, rating: j.rating, reviews: scores.length, average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null }
  })
  const bestJudges = judgeRows
    .filter(j => j.reviews >= MIN_REVIEWS)
    .sort((a, b) => b.average! - a.average! || b.reviews - a.reviews || b.rating - a.rating)
    .slice(0, 3)
  const awards = await prisma.tournamentAward.findMany({ where: { tournamentId } })
  return {
    speakers, judges: bestJudges, minReviews: MIN_REVIEWS, preliminaryRounds: prelims,
    // judges with too few reviews are listed for the organizer to choose by hand
    otherJudges: judgeRows.filter(j => j.reviews < MIN_REVIEWS),
    chosen: Object.fromEntries(awards.map(a => [a.kind, { speakerId: a.speakerId ?? undefined, judgeId: a.judgeId ?? undefined, name: a.name }])),
  }
}

// the organizer's choice; null removes an award. A finished tournament gets the diploma at once.
export async function setAward(tournamentId: string, kind: AwardKind, personId: string | null) {
  if (!personId) {
    await prisma.$transaction([
      prisma.tournamentAward.deleteMany({ where: { tournamentId, kind } }),
      prisma.certificate.deleteMany({ where: { tournamentId, award: kind } }),
    ])
    return null
  }
  const person = kind === 'best_speaker'
    ? await prisma.speaker.findFirst({ where: { id: personId, team: { tournamentId, swing: false } }, select: { id: true, name: true, userId: true } })
    : await prisma.judge.findFirst({ where: { id: personId, tournamentId }, select: { id: true, name: true, userId: true } })
  if (!person) return undefined
  const ids = kind === 'best_speaker' ? { speakerId: person.id, judgeId: null } : { speakerId: null, judgeId: person.id }
  await prisma.tournamentAward.upsert({
    where: { tournamentId_kind: { tournamentId, kind } },
    create: { tournamentId, kind, name: person.name, ...ids },
    update: { name: person.name, ...ids },
  })
  // a changed choice after the finish: the old diploma is withdrawn, the new one issued
  await prisma.certificate.deleteMany({ where: { tournamentId, award: kind } })
  await issueAwardCertificates(tournamentId)
  return person
}

// award diplomas of a finished tournament (idempotent); the winner hears about it
export async function issueAwardCertificates(tournamentId: string) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, name: true } })
  if (!t || t.status !== 'finished') return 0
  const awards = await prisma.tournamentAward.findMany({ where: { tournamentId } })
  let issued = 0
  for (const a of awards) {
    if (await prisma.certificate.findFirst({ where: { tournamentId, award: a.kind } })) continue
    const person = a.speakerId
      ? await prisma.speaker.findUnique({ where: { id: a.speakerId }, include: { team: { include: { institution: true } } } })
      : null
    const judge = a.judgeId ? await prisma.judge.findUnique({ where: { id: a.judgeId }, include: { institution: true } }) : null
    const userId = person?.userId ?? judge?.userId ?? null
    // award diplomas are not tied to the speaker/judge slot (those hold the participation certificate)
    await prisma.certificate.create({
      data: {
        tournamentId, code: newCode(), kind: 'award', award: a.kind, userId, name: a.name,
        teamName: person?.team.name ?? null, institution: person?.team.institution?.name ?? judge?.institution?.name ?? null,
      },
    })
    issued++
    if (userId) background(notify([userId], 'participant.award', { tournament: t.name, award: a.kind }, '/me?tab=certificates'))
  }
  return issued
}
