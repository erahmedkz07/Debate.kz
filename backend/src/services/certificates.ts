import { randomInt } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { getStandings } from './tournaments.js'
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
  const teamPlace = (await finalPlaces(tournamentId)) ?? new Map(standings.teams.map(r => [r.team.id, r.rank]))
  const broke = new Set(t.teams.filter(x => x.breakSeed).map(x => x.id))
  // category brackets (novices…): the team's place there, e.g. "novice champion"
  const inCategory = await categoryPlaces(tournamentId)
  // the top-3 speakers count only if they actually spoke
  const speakerPlace = new Map(standings.speakers.filter(r => r.rank <= 3 && r.total > 0).map(r => [r.speaker.id, r.rank]))

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
  return r.count
}

export const certificateInclude = {
  tournament: { select: { id: true, name: true, city: true, startDate: true, endDate: true, organizerName: true, level: true } },
} as const
