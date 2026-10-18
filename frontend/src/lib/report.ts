import type { TFunction } from 'i18next'
import { getBracket, getStandings, getTournamentById, type Bracket, type BracketPart } from '@/api'
import type { Debate, Side, TournamentDetails, TeamStanding, SpeakerStanding } from '@/types'
import { isBP, sidesOf, teamIdOn } from '@/lib/formats'
import { silentRoundIds } from '@/lib/silent'
import { finalPlaces, type FinalPlace } from '@/lib/places'

// The tournament's results as plain tables: one builder for the Excel file and for the printable report (PDF),
// so both always show the same thing. Uses only what the reader may see (public data; organizers get everything).
// With leagues every league has its own block (its final places, table, speakers, playoffs and rounds); swing teams
// only fill the draw and are never listed. A column empty in every row (no schools, no clubs) is left out.

export type Cell = string | number
export type TableKey = 'places' | 'teams' | 'teamRounds' | 'speakers' | 'playoffs' | 'rounds' | 'judges'
export interface Table { key: TableKey; title: string; group?: string; header: string[]; rows: Cell[][] }
export interface ReportGroup { key: string; name: string; champion?: string; tables: Table[] }
export interface Report { groups: ReportGroup[]; judges: Table | null; summary: { teams: number; judges: number; rounds: number } }
export interface ReportData { details: TournamentDetails; teams: TeamStanding[]; speakers: SpeakerStanding[]; bracket: Bracket | null }

export async function loadReport(id: string): Promise<ReportData> {
  const [details, standings] = await Promise.all([getTournamentById(id), getStandings(id)])
  const bracket = details.rounds.some(r => r.kind === 'elimination') ? await getBracket(id) : null
  return { details, teams: standings.teams, speakers: standings.speakers, bracket }
}

interface Helpers { t: TFunction; sides: Record<Side, string>; roundName: (r: { name: string; number?: number }) => string }

// a column that is empty in every row is dropped (the # column always stays)
function compact(tb: Table): Table {
  const keep = tb.header.map((_, i) => i === 0 || tb.rows.some(r => r[i] !== '' && r[i] !== undefined))
  return { ...tb, header: tb.header.filter((_, i) => keep[i]), rows: tb.rows.map(r => r.filter((_, i) => keep[i])) }
}

// the bracket of a group: a league's own one, else the open break (and, without leagues, the category brackets)
export const bracketOfLeague = (bracket: Bracket | null, league: string): BracketPart | undefined =>
  !bracket?.announced ? undefined : league ? bracket.categories.find(c => c.key === league) : bracket

export const placeLabel = (p: FinalPlace, t: TFunction) =>
  p.stage === 'champion' ? t('report.champion') : p.stage === 'finalist' ? t('report.finalist')
    : p.stage === 'prelims' ? t('report.prelims') : t('report.outIn', { stage: t(`playoff.stages.${p.stage}`) })

export function buildReport({ details, teams, speakers, bracket }: ReportData, { t, sides, roundName }: Helpers): Report {
  const bp = isBP(details.format)
  const team = (id?: string) => details.teams.find(x => x.id === id)
  const teamName = (id?: string) => team(id)?.name ?? ''
  const judgeName = (id: string) => details.judges.find(j => j.id === id)?.name ?? ''
  const seedOf = new Map(details.teams.filter(x => x.breakSeed).map(x => [x.id, x.breakSeed!]))
  const silent = details.myRole ? new Set<string>() : silentRoundIds(details)
  const leagues = details.leagues ?? []
  const groups = leagues.length ? leagues : [{ key: '', name: '' }]
  const sideList = sidesOf(details.format)
  // the preliminary rounds the reader may see results of, in order
  const shownRounds = details.rounds.filter(r => r.kind !== 'elimination' && r.status === 'completed' && !silent.has(r.id))
  const outcome = (x: { result: 'W' | 'L' | number; score: number }) =>
    `${typeof x.result === 'number' ? t('ballot.placeN', { n: x.result }) : t(x.result === 'W' ? 'report.win' : 'report.loss')}${x.score ? ` · ${x.score.toFixed(1)}` : ''}`
  const result = (d: Debate) => {
    if (d.ranking?.length) return d.ranking.map((s, i) => `${i + 1}. ${teamName(teamIdOn(d, s))}`).join('  ')
    const win = d.winner ? teamName(teamIdOn(d, d.winner)) : ''
    return d.forfeit && win ? `${win} (${t('dashboard.forfeit.short')})` : win
  }

  const out: ReportGroup[] = groups.map(g => {
    const inGroup = (id?: string) => !g.key || team(id)?.league === g.key
    const table = teams.filter(r => inGroup(r.team.id)).map((r, i) => ({ ...r, rank: i + 1 }))
    const part = bracketOfLeague(bracket, g.key)
    const places = finalPlaces(part, table.map(r => r.team.id))
    const tables: Table[] = []
    if (places) {
      tables.push({
        key: 'places', title: t('report.places'), group: g.name,
        header: [t('report.place'), t('common.team'), t('export.institution'), t('report.result')],
        rows: places.map(p => [p.place, teamName(p.teamId), team(p.teamId)?.institution ?? '', placeLabel(p, t)]),
      })
    }
    tables.push({
      key: 'teams', title: places ? t('report.teamsPrelim') : t('export.teams'), group: g.name,
      header: ['#', t('common.team'), t('export.institution'), t('export.club'), bp ? t('tournament.teamPoints') : t('tournament.wins'), ...(bp ? [] : [t('export.losses'), t('report.margin')]), t('tournament.speakerPoints'), t('report.avgTeam'), t('export.seed')],
      rows: table.map(r => {
        // the team's average score per round (replies included, as in the rounds table)
        const scored = Object.values(r.byRound ?? {}).filter(x => x.score)
        const avg = scored.length ? Math.round((scored.reduce((sum, x) => sum + x.score, 0) / scored.length) * 10) / 10 : ''
        return [r.rank, r.team.name, r.team.institution, r.team.club?.name ?? '', bp ? r.points : r.wins, ...(bp ? [] : [r.losses, r.margins]), r.speakerPoints, avg, seedOf.get(r.team.id) ?? '']
      }),
    })
    // every team round by round: the result, its score and the opponent
    if (shownRounds.length) {
      tables.push({
        key: 'teamRounds', title: t('report.teamRounds'), group: g.name,
        header: ['#', t('common.team'), ...shownRounds.map(rd => roundName(rd))],
        rows: table.map(r => [r.rank, r.team.name, ...shownRounds.map(rd => {
          const x = r.byRound?.[rd.id]
          if (!x) return '—'
          return `${outcome(x)}${x.opponentId ? ` · ${t('report.vs', { team: teamName(x.opponentId) })}` : ''}`
        })]),
      })
    }
    tables.push({
      key: 'speakers', title: t('export.speakers'), group: g.name,
      header: ['#', t('export.speaker'), t('common.team'), ...shownRounds.map(rd => roundName(rd)), t('export.total'), t('export.average'), t('report.roundsSpoken')],
      rows: speakers.filter(s => s.total > 0 && inGroup(s.team.id)).map((s, i) => [i + 1, s.speaker.name, s.team.name, ...shownRounds.map(rd => s.byRound?.[rd.id] ?? '—'), s.total, s.average, s.rounds ?? '']),
    })
    // the playoffs: this group's bracket (without leagues, the category brackets too)
    const parts = !bracket?.announced ? [] : g.key ? (part ? [{ ...part, name: '' }] : []) : [{ ...bracket, name: '' }, ...bracket.categories]
    const playoffRows: Cell[][] = []
    for (const p of parts) {
      const suffix = p.name ? ` · ${p.name}` : ''
      for (const r of p.rounds) for (const d of r.debates) {
        const names = d.teams.map(x => `${seedOf.get(x.teamId) ? `(${seedOf.get(x.teamId)}) ` : ''}${teamName(x.teamId)}`)
        const through = d.ranking ? d.ranking.slice(0, 2).map(s => teamName(d.teams.find(x => x.side === s)?.teamId)).join(', ') : teamName(d.teams.find(x => x.side === d.winner)?.teamId)
        playoffRows.push([`${t(`playoff.stages.${r.stage}`)}${suffix}`, d.room, names.join(bp ? ' · ' : ' — '), through])
      }
    }
    if (playoffRows.length) tables.push({ key: 'playoffs', title: t('playoff.tab'), group: g.name, header: [t('export.stage'), t('tournament.room'), t('export.teamsInRoom'), t('export.through')], rows: playoffRows })
    // every debate of the preliminary rounds in this group
    const rounds: Cell[][] = []
    for (const r of details.rounds.filter(x => x.status !== 'draft' && x.kind !== 'elimination')) {
      for (const d of details.debates.filter(x => x.roundId === r.id && inGroup(x.propositionTeamId))) {
        // two-team formats: each side's score (the panel's average) and the margin
        const score = (side: Side) => (silent.has(r.id) ? undefined : teams.find(x => x.team.id === teamIdOn(d, side))?.byRound?.[r.id]?.score)
        const scores: Cell[] = bp ? [] : sideList.map(s => score(s) || '')
        const margin = !bp && typeof scores[0] === 'number' && typeof scores[1] === 'number' ? Math.round(Math.abs(scores[0] - scores[1]) * 10) / 10 : ''
        rounds.push([roundName(r), d.room, ...sideList.flatMap((s, i) => (bp ? [teamName(teamIdOn(d, s))] : [teamName(teamIdOn(d, s)), scores[i]])), silent.has(r.id) ? t('profile.result.silent') : result(d), margin, d.judgeIds.map(judgeName).join(', ')])
      }
    }
    if (rounds.length) {
      tables.push({
        key: 'rounds', title: t('report.roundsPrelim'), group: g.name,
        header: [t('export.round'), t('tournament.room'), ...sideList.flatMap(s => (bp ? [sides[s]] : [sides[s], t('report.points')])), bp ? t('ballot.places') : t('tournament.winner'), t('report.margin'), t('tournament.judges')],
        rows: rounds,
      })
    }
    const champion = part?.champion?.name
    return { key: g.key, name: g.name, ...(champion && { champion }), tables: tables.map(compact) }
  })

  const judges = details.judges.length ? compact({
    key: 'judges', title: t('report.judges'),
    header: ['#', t('report.judge'), t('export.institution'), ...(leagues.length ? [t('report.league')] : []), t('report.judged'), t('report.chaired')],
    rows: [...details.judges].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((j, i) => {
      // the rooms a judge sat in (released rounds), and how many of them as the chair
      const sat = details.debates.filter(d => d.judgeIds.includes(j.id) && details.rounds.some(r => r.id === d.roundId && r.status !== 'draft'))
      return [i + 1, j.name, j.institution ?? '', ...(leagues.length ? [j.league ? leagues.find(l => l.key === j.league)?.name ?? '' : t('leagues.any')] : []), sat.length, sat.filter(d => d.judgeIds[0] === j.id).length]
    }),
  }) : null
  return {
    groups: out, judges,
    summary: { teams: details.teams.filter(x => !x.swing).length, judges: details.judges.length, rounds: details.rounds.filter(r => r.status !== 'draft').length },
  }
}

// a safe file name from the tournament's name
export const fileNameOf = (name: string, ext: string) => `${name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'debate-kz'}.${ext}`

// Excel: one sheet per kind of table; with leagues, the league is the first column of each sheet
export async function downloadXlsx(data: ReportData, report: Report, t: TFunction) {
  // loaded on demand: the library is needed only when someone downloads
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const byLeague = report.groups.length > 1
  const order: TableKey[] = ['places', 'teams', 'teamRounds', 'speakers', 'playoffs', 'rounds']
  const sheets: { title: string; header: string[]; rows: Cell[][] }[] = []
  for (const key of order) {
    const parts = report.groups.flatMap(g => g.tables.filter(tb => tb.key === key).map(tb => ({ g, tb })))
    if (!parts.length) continue
    // the widest header of the group's tables (columns may differ when one league has no clubs)
    const header = parts.reduce((h, p) => (p.tb.header.length > h.length ? p.tb.header : h), parts[0].tb.header)
    const rows = parts.flatMap(({ g, tb }) => tb.rows.map(r => {
      const cells = header.map(h => { const i = tb.header.indexOf(h); return i === -1 ? '' : r[i] })
      return byLeague ? [g.name, ...cells] : cells
    }))
    sheets.push({ title: t(`report.sheet.${key}`), header: byLeague ? [t('report.league'), ...header] : header, rows })
  }
  if (report.judges) sheets.push({ title: report.judges.title, header: report.judges.header, rows: report.judges.rows })
  await writeXlsxFile(sheets.map(s => ({
    sheet: s.title.slice(0, 31), // Excel limit
    stickyRowsCount: 1,
    columns: s.header.map((h, i) => ({ width: Math.min(60, Math.max(8, h.length + 2, ...s.rows.map(r => String(r[i] ?? '').length + 2))) })),
    data: [
      s.header.map(h => ({ value: h, fontWeight: 'bold' as const, backgroundColor: '#E2E8F0' })),
      ...s.rows.map(r => r.map(v => ({ value: v, type: typeof v === 'number' ? Number : String }))),
    ],
  }))).toFile(fileNameOf(data.details.name, 'xlsx'))
}
