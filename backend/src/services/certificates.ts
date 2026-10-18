import { randomInt } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { getStandings, leaguesOf } from './tournaments.js'
import { categoryPlaces, finalPlaces } from './playoffs.js'

// Certificates of a finished tournament: one per speaker (team place, break, top-3 speaker)
// and one per judge. Issued once (idempotent); the random code is printed as a QR and checked publicly.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0 or I/1: easy to read and dictate
export const newCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

export async function ensureCertificates(tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: { where: { swing: false }, include: { speakers: true, institution: true } },
      judges: { include: { institution: true } },
      _count: { select: { certificates: true } },
    },
  })
  // only a finished tournament has final results
  if (!t || t.status !== 'finished') return 0
  const standings = await getStandings(tournamentId)
  // with playoffs the places come from the bracket (the champion is the winner of the final); without, from the standings
  const teamPlace: Map<string, number> = (await finalPlaces(tournamentId)) ?? new Map(standings.teams.map(r => [r.team.id, r.rank]))
  const broke = new Set(t.teams.filter(x => x.breakSeed).map(x => x.id))
  // category brackets (novices…): the team's place there, e.g. "novice champion"
  const inCategory = await categoryPlaces(tournamentId)
  // the top-3 speakers count only if they actually spoke
  let speakerPlace = new Map(standings.speakers.filter(r => r.rank <= 3 && r.total > 0).map(r => [r.speaker.id, r.rank]))
  // Leagues rank on their own: a team's place is its place in its league (its bracket, then its league table), shown
  // with the league's name; the top-3 speakers are each league's own
  const leagues = leaguesOf(t)
  if (leagues.length) {
    const leagueOf = new Map(t.teams.map(x => [x.id, x.league]))
    speakerPlace = new Map()
    for (const l of leagues) {
      const own = standings.speakers.filter(r => r.total > 0 && leagueOf.get(r.team.id) === l.key).slice(0, 3)
      own.forEach((r, i) => speakerPlace.set(r.speaker.id, i + 1))
      const inBracket = standings.teams.filter(r => leagueOf.get(r.team.id) === l.key && inCategory.has(r.team.id))
      let next = inBracket.length + 1
      for (const r of standings.teams.filter(x => leagueOf.get(x.team.id) === l.key)) {
        const place = inCategory.get(r.team.id)?.place ?? next++
        inCategory.set(r.team.id, { category: l.name, place })
        teamPlace.set(r.team.id, place)
      }
    }
  }

  const rows = [
    ...t.teams.flatMap(team => team.speakers.map(s => ({
      kind: 'speaker', speakerId: s.id, userId: s.userId, name: s.name, teamName: team.name, institution: team.institution?.name ?? null,
      teamPlace: teamPlace.get(team.id) ?? null, inBreak: broke.size ? broke.has(team.id) : (teamPlace.get(team.id) ?? 999) <= t.breakSize, speakerPlace: speakerPlace.get(s.id) ?? null,
      breakCategory: inCategory.get(team.id)?.category ?? null, categoryPlace: inCategory.get(team.id)?.place ?? null,
    }))),
    ...t.judges.map(j => ({ kind: 'judge', judgeId: j.id, userId: j.userId, name: j.name, institution: j.institution?.name ?? null })),
  ]
  const r = await prisma.certificate.createMany({
    data: rows.map(row => ({ ...row, tournamentId, code: newCode() })),
    skipDuplicates: true, // already issued ones keep their code
  })
  // issued certificates follow the final results (a corrected ballot, a fixed rule): same code, current places
  const issued = await prisma.certificate.findMany({ where: { tournamentId, kind: 'speaker' } })
  for (const row of rows) {
    if (!('speakerId' in row)) continue
    const c = issued.find(x => x.speakerId === row.speakerId)
    // the name too: an organizer who corrects a speaker's name corrects the certificate
    const places = { name: row.name, teamName: row.teamName, teamPlace: row.teamPlace, inBreak: row.inBreak, speakerPlace: row.speakerPlace, breakCategory: row.breakCategory, categoryPlace: row.categoryPlace }
    if (c && (Object.keys(places) as (keyof typeof places)[]).some(k => c[k] !== places[k])) await prisma.certificate.update({ where: { id: c.id }, data: places })
  }
  return r.count
}

export const certificateInclude = {
  tournament: { select: { id: true, name: true, city: true, startDate: true, endDate: true, organizerName: true, level: true } },
} as const
