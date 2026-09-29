import type { TFunction } from 'i18next'
import { getBracket, getStandings, getTournamentById, type Bracket } from '@/api'
import type { Debate, Side, TournamentDetails, TeamStanding, SpeakerStanding } from '@/types'
import { isBP, sidesOf, teamIdOn } from '@/lib/formats'
import { silentRoundIds } from '@/lib/silent'

// The tournament's results as plain tables: one builder for the Excel file and for the printable report (PDF),
// so both always show the same thing. Uses only what the reader may see (public data; organizers get everything).

export type Cell = string | number
export interface Table { key: 'teams' | 'speakers' | 'playoffs' | 'rounds'; title: string; header: string[]; rows: Cell[][] }
export interface ReportData { details: TournamentDetails; teams: TeamStanding[]; speakers: SpeakerStanding[]; bracket: Bracket | null }

export async function loadReport(id: string): Promise<ReportData> {
  const [details, standings] = await Promise.all([getTournamentById(id), getStandings(id)])
  const bracket = details.rounds.some(r => r.kind === 'elimination') ? await getBracket(id) : null
  return { details, teams: standings.teams, speakers: standings.speakers, bracket }
}

interface Helpers { t: TFunction; sides: Record<Side, string>; roundName: (r: { name: string; number?: number }) => string }

export function buildTables({ details, teams, speakers, bracket }: ReportData, { t, sides, roundName }: Helpers): Table[] {
  const bp = isBP(details.format)
  const teamName = (id?: string) => details.teams.find(x => x.id === id)?.name ?? ''
  const judgeName = (id: string) => details.judges.find(j => j.id === id)?.name ?? ''
  const seedOf = new Map(details.teams.filter(x => x.breakSeed).map(x => [x.id, x.breakSeed!]))
  const silent = details.myRole ? new Set<string>() : silentRoundIds(details)
  const tables: Table[] = []

  tables.push({
    key: 'teams', title: t('export.teams'),
    header: ['#', t('common.team'), t('export.institution'), t('export.club'), bp ? t('tournament.teamPoints') : t('tournament.wins'), ...(bp ? [] : [t('export.losses')]), t('tournament.speakerPoints'), t('export.seed')],
    rows: teams.map(r => [r.rank, r.team.name, r.team.institution, r.team.club?.name ?? '', bp ? r.points : r.wins, ...(bp ? [] : [r.losses]), r.speakerPoints, seedOf.get(r.team.id) ?? '']),
  })
  tables.push({
    key: 'speakers', title: t('export.speakers'),
    header: ['#', t('export.speaker'), t('common.team'), t('export.total'), t('export.average')],
    rows: speakers.filter(s => s.total > 0).map(s => [s.rank, s.speaker.name, s.team.name, s.total, s.average]),
  })

  if (bracket?.announced) {
    const rows: Cell[][] = []
    if (bracket.champion) rows.push([t('playoff.champion'), '', bracket.champion.name, ''])
    for (const r of bracket.rounds) for (const d of r.debates) {
      const names = d.teams.map(x => `${seedOf.get(x.teamId) ? `(${seedOf.get(x.teamId)}) ` : ''}${teamName(x.teamId)}`)
      const through = d.ranking ? d.ranking.slice(0, 2).map(s => teamName(d.teams.find(x => x.side === s)?.teamId)).join(', ') : teamName(d.teams.find(x => x.side === d.winner)?.teamId)
      rows.push([t(`playoff.stages.${r.stage}`), d.room, names.join(' · '), through])
    }
    tables.push({ key: 'playoffs', title: t('playoff.tab'), header: [t('export.stage'), t('tournament.room'), t('export.teamsInRoom'), t('export.through')], rows })
  }

  const sideList = sidesOf(details.format)
  const result = (d: Debate) => {
    if (d.ranking?.length) return d.ranking.map((s, i) => `${i + 1}. ${teamName(teamIdOn(d, s))}`).join('  ')
    return d.winner ? teamName(teamIdOn(d, d.winner)) : ''
  }
  const rows: Cell[][] = []
  for (const r of details.rounds.filter(x => x.status !== 'draft')) {
    for (const d of details.debates.filter(x => x.roundId === r.id)) {
      rows.push([roundName(r), d.room, ...sideList.map(s => teamName(teamIdOn(d, s))), silent.has(r.id) ? t('profile.result.silent') : result(d), d.judgeIds.map(judgeName).join(', ')])
    }
  }
  tables.push({
    key: 'rounds', title: t('export.rounds'),
    header: [t('export.round'), t('tournament.room'), ...sideList.map(s => sides[s]), bp ? t('ballot.places') : t('tournament.winner'), t('tournament.judges')],
    rows,
  })
  return tables
}

// a safe file name from the tournament's name
export const fileNameOf = (name: string, ext: string) => `${name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'debate-kz'}.${ext}`

export async function downloadXlsx(data: ReportData, tables: Table[]) {
  // loaded on demand: the library is needed only when someone downloads
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const sheets = tables.map(tb => ({
    sheet: tb.title.slice(0, 31), // Excel limit
    stickyRowsCount: 1,
    columns: tb.header.map((h, i) => ({ width: Math.min(60, Math.max(8, h.length + 2, ...tb.rows.map(r => String(r[i] ?? '').length + 2))) })),
    data: [
      tb.header.map(h => ({ value: h, fontWeight: 'bold' as const })),
      ...tb.rows.map(r => r.map(v => ({ value: v, type: typeof v === 'number' ? Number : String }))),
    ],
  }))
  await writeXlsxFile(sheets).toFile(fileNameOf(data.details.name, 'xlsx'))
}
