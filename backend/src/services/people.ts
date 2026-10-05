import { notFound } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { getStandings, publicWhere } from './tournaments.js'
import { resultOf, sidesInDebate } from './formats.js'
import { finalPlaces } from './playoffs.js'
import { hiddenRoundIds } from './silent.js'

// A person's public page: their debate career as a speaker and as a judge, and their awards — open to everyone
// (the owner decided against a "hide my profile" switch). Only public tournaments
// and only what is already public there: closed (silent) rounds stay out until the break, judge ratings show only as an
// average of at least PUBLIC_RATING_MIN reviews, never single comments.
export const PUBLIC_RATING_MIN = 5

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

export async function publicProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { clubMembership: { include: { club: { select: { id: true, name: true, status: true } } } } } })
  if (!user || user.blocked) throw notFound('profile_not_found')

  // ---- as a speaker ----
  const speakerSlots = await prisma.speaker.findMany({
    where: { userId, team: { swing: false, tournament: publicWhere } },
    include: { team: { include: { tournament: true } } },
  })
  const tournaments = []
  for (const s of speakerSlots) {
    const t = s.team.tournament
    const hide = await hiddenRoundIds(t.id)
    const standings = await getStandings(t.id, hide)
    const row = standings.speakers.find(x => x.speaker.id === s.id)
    const final = t.status === 'finished' ? await finalPlaces(t.id) : null
    const place = final?.get(s.teamId) ?? standings.teams.find(x => x.team.id === s.teamId)?.rank
    tournaments.push({
      id: t.id, name: t.name, startDate: toDay(t.startDate), status: t.status, team: s.team.name,
      place: place ?? undefined, teams: standings.teams.length, inBreak: !!s.team.breakSeed,
      ...(row && row.total > 0 && { speakerRank: row.rank, average: row.average }),
    })
  }
  // debates of completed rounds that are already public, the playoffs included (wins / debates); the speaking average
  // counts preliminary rounds only, like the speaker table. The score of a speech is the panel average.
  const hidden = new Set<string>()
  for (const t of new Set(speakerSlots.map(s => s.team.tournamentId))) for (const id of await hiddenRoundIds(t)) hidden.add(id)
  const scores = await prisma.speakerScore.findMany({
    where: { speaker: { userId, team: { tournament: publicWhere } }, position: { lte: 3 }, ballot: { debate: { round: { status: 'completed' } } } },
    include: { ballot: { include: { debate: { include: { round: { select: { kind: true } } } } } } },
  })
  const bySpeech = new Map<string, number[]>()
  const debates = new Map<string, boolean>() // debate -> won
  for (const sc of scores) {
    const d = sc.ballot.debate
    if (hidden.has(d.roundId)) continue
    debates.set(d.id, d.ranking.length ? d.ranking[0] === sc.side : d.winner === sc.side)
    if (d.round.kind !== 'preliminary') continue
    const k = `${d.id}:${sc.position}`
    bySpeech.set(k, [...(bySpeech.get(k) ?? []), Number(sc.score)])
  }
  const speeches = [...bySpeech.values()].map(list => avg(list)!)

  // ---- as a judge ----
  const judgeSlots = await prisma.judge.findMany({
    where: { userId, tournament: publicWhere },
    include: { tournament: true, debates: { include: { debate: { include: { round: true } } } }, feedback: { select: { score: true } } },
  })
  const seated = judgeSlots.flatMap(j => j.debates.filter(dj => dj.debate.round.status !== 'draft'))
  const ratings = judgeSlots.flatMap(j => j.feedback.map(f => f.score))

  // ---- awards (from certificates of finished tournaments) ----
  const certs = await prisma.certificate.findMany({
    where: {
      tournament: publicWhere,
      // the person's certificates: by the account, or by their speaker / judge slot (the account may be linked later)
      AND: [
        { OR: [{ userId }, { speakerId: { in: speakerSlots.map(x => x.id) } }, { judgeId: { in: judgeSlots.map(x => x.id) } }] },
        { OR: [{ award: { not: null } }, { teamPlace: { lte: 3 } }, { speakerPlace: { not: null } }, { categoryPlace: 1 }] },
      ],
    },
    include: { tournament: { select: { id: true, name: true, endDate: true } } },
    orderBy: { issuedAt: 'desc' },
  })

  return {
    id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? undefined, city: user.city ?? undefined, since: toDay(user.createdAt),
    ...(user.clubMembership?.club.status === 'approved' && { club: { id: user.clubMembership.club.id, name: user.clubMembership.club.name } }),
    speaker: {
      tournaments: tournaments.sort((a, b) => b.startDate.localeCompare(a.startDate)),
      debates: debates.size, wins: [...debates.values()].filter(Boolean).length,
      average: avg(speeches), best: speeches.length ? Math.max(...speeches) : null,
    },
    judge: {
      tournaments: judgeSlots.map(j => ({
        id: j.tournament.id, name: j.tournament.name, startDate: toDay(j.tournament.startDate), status: j.tournament.status,
        rounds: j.debates.filter(dj => dj.debate.round.status !== 'draft').length, chaired: j.debates.filter(dj => dj.isChair && dj.debate.round.status !== 'draft').length,
      })).sort((a, b) => b.startDate.localeCompare(a.startDate)),
      rounds: seated.length, chaired: seated.filter(dj => dj.isChair).length,
      playoffRounds: seated.filter(dj => dj.debate.round.kind === 'elimination').length,
      ...(ratings.length >= PUBLIC_RATING_MIN && { rating: { average: avg(ratings), count: ratings.length } }),
    },
    awards: certs.map(c => ({
      tournament: { id: c.tournament.id, name: c.tournament.name }, date: toDay(c.tournament.endDate),
      kind: c.award ?? (c.categoryPlace === 1 ? 'category_champion' : c.teamPlace && c.teamPlace <= 3 ? 'team_place' : 'speaker_place'),
      ...(c.teamPlace && c.teamPlace <= 3 && !c.award && { place: c.teamPlace }),
      ...(c.speakerPlace && !c.award && { speakerPlace: c.speakerPlace }),
      ...(c.breakCategory && c.categoryPlace === 1 && { category: c.breakCategory }),
      code: c.code, // certificates are public by their code anyway (QR check)
    })),
  }
}

// A speaker's page inside one tournament, for every speaker (an account is not needed): the place in the speaker
// table, the team's place, and each public round — side, opponent, result, the speech score (panel average) and the
// reply. Closed rounds stay out until the break, like everywhere. With an account, the page links to the career.
export async function speakerInTournament(tournamentId: string, speakerId: string) {
  const speaker = await prisma.speaker.findFirst({
    where: { id: speakerId, team: { tournamentId, swing: false, tournament: publicWhere } },
    include: { team: { include: { tournament: true, institution: true } } },
  })
  if (!speaker) throw notFound('speaker_not_found')
  const t = speaker.team.tournament
  const hide = await hiddenRoundIds(t.id)
  const standings = await getStandings(t.id, hide)
  const row = standings.speakers.find(x => x.speaker.id === speaker.id)
  const final = t.status === 'finished' ? await finalPlaces(t.id) : null
  const teamPlace = final?.get(speaker.teamId) ?? standings.teams.find(x => x.team.id === speaker.teamId)?.rank
  const debates = await prisma.debate.findMany({
    where: {
      round: { tournamentId: t.id, status: 'completed', id: { notIn: [...hide] } },
      OR: [{ propositionTeamId: speaker.teamId }, { oppositionTeamId: speaker.teamId }, { closingPropositionTeamId: speaker.teamId }, { closingOppositionTeamId: speaker.teamId }],
    },
    include: {
      round: true, proposition: true, opposition: true, closingProposition: true, closingOpposition: true,
      ballots: { include: { scores: { where: { speakerId: speaker.id } } } },
    },
    orderBy: { round: { number: 'asc' } },
  })
  const rounds = debates.map(d => {
    const side = sidesInDebate(d).find(x => x.teamId === speaker.teamId)!.side
    const names = { proposition: d.proposition, opposition: d.opposition, closingProposition: d.closingProposition, closingOpposition: d.closingOpposition }
    const opponents = sidesInDebate(d).filter(x => x.side !== side).map(x => names[x.side]!.name).join(', ')
    const speech = avg(d.ballots.flatMap(b => b.scores.filter(s => s.position <= 3).map(s => Number(s.score))))
    const reply = avg(d.ballots.flatMap(b => b.scores.filter(s => s.position === 4).map(s => Number(s.score))))
    return {
      round: d.round.name, number: d.round.number, kind: d.round.kind, motion: d.round.motion, side, opponents,
      result: resultOf(d, side), ...(speech !== null && { score: speech }), ...(reply !== null && { reply }),
    }
  })
  return {
    id: speaker.id, name: speaker.name, ...(speaker.userId && { userId: speaker.userId }),
    tournament: { id: t.id, name: t.name, startDate: toDay(t.startDate), status: t.status },
    team: { id: speaker.team.id, name: speaker.team.name, institution: speaker.team.institution?.name ?? undefined, place: teamPlace ?? undefined, teams: standings.teams.length, inBreak: !!speaker.team.breakSeed },
    ...(row && row.total > 0 && { rank: row.rank, average: row.average, total: row.total, speakers: standings.speakers.length }),
    rounds,
  }
}
