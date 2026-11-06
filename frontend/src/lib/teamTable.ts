import type { League } from '@/types'

// Teams pasted from a spreadsheet: the answers of a Google Form (or any table) copied as they are. Cells are split by
// tabs (what Google Sheets and Excel copy) or semicolons. The header row, if there is one, tells which column is which;
// without it the columns go in order (a leading date column, the form's timestamp, is skipped). Everything is checked
// here so the organizer sees the wrong rows before adding; the server checks it all again.

export type TeamColumns = Partial<Record<'name' | 'institution' | 'league' | 'speaker1' | 'speaker2' | 'speaker3' | 'speaker4', number>>
export type ParsedTeam = { name: string; institution: string; speakers: string[]; league?: string; error?: 'name' | 'institution' | 'speakers' | 'league' }

const HEADER = /команд|team|школ|мектеп|спикер|speaker|участник|қатысушы|отметка|timestamp|уақыт|учебн|оқу орны|лига|league/i
const TIME = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/
const GUESS: [keyof TeamColumns | 'speaker' | 'skip', RegExp][] = [
  ['skip', /отметка|timestamp|уақыт|дата|date|почт|mail|телефон|phone|байланыс/i],
  ['league', /лига|league|liga|язык|тіл/i],
  ['speaker', /спикер|speaker|участник|қатысушы|фио|аты-жөні|дебатёр|дебатер/i],
  ['institution', /школ|учебн|организац|мектеп|оқу|универ|лице|гимназ|колледж|institution|school/i],
  ['name', /команд|team|топ/i],
]

const cellsOf = (line: string) => (line.includes('\t') ? line.split('\t') : line.split(';')).map(c => c.trim())

function guessColumns(header: string[], firstRow: string[], speakers: number): TeamColumns {
  const cols: TeamColumns = {}
  if (header.some(Boolean)) {
    let n = 0
    header.forEach((h, i) => {
      const kind = GUESS.find(([, re]) => re.test(h))?.[0]
      if (kind === 'speaker') { if (n < speakers) cols[`speaker${++n}` as keyof TeamColumns] = i }
      else if (kind && kind !== 'skip' && cols[kind] === undefined) cols[kind] = i
    })
    if (Object.keys(cols).length) return cols
  }
  // no header (or nothing recognised): name, school, speakers… in order, after a timestamp column
  const start = TIME.test(firstRow[0] ?? '') ? 1 : 0
  cols.name = start; cols.institution = start + 1
  for (let i = 1; i <= speakers; i++) cols[`speaker${i}` as keyof TeamColumns] = start + 1 + i
  return cols
}

function leagueOf(value: string, leagues: League[]) {
  const v = value.trim().toLowerCase()
  if (!v) return undefined
  return leagues.find(l => l.key.toLowerCase() === v || l.name.toLowerCase() === v || l.name.toLowerCase().includes(v) || v.includes(l.name.toLowerCase()))?.key
    ?? leagues.find(l => (/қаз|каз|kaz|kz/.test(v) && (l.language ?? '') === 'kz') || (/рус|rus|ru/.test(v) && (l.language ?? '') === 'ru'))?.key
}

export function parseTeamTable(text: string, o: { speakers: number; leagues: League[]; columns: TeamColumns | null; league: string }) {
  const rows = text.split(/\r?\n/).filter(l => l.trim()).map(cellsOf)
  if (!rows.length) return { header: [] as string[], columns: {} as TeamColumns, teams: [] as ParsedTeam[] }
  const hasHeader = rows[0].some(c => HEADER.test(c))
  const width = Math.max(...rows.map(r => r.length))
  const header = Array.from({ length: width }, (_, i) => (hasHeader ? rows[0][i] ?? '' : ''))
  const data = hasHeader ? rows.slice(1) : rows
  // with leagues and no league column: one league for all the pasted teams (-1)
  const guessed = guessColumns(header, data[0] ?? [], o.speakers)
  const columns = o.columns ?? (o.leagues.length ? { ...guessed, league: guessed.league ?? -1 } : guessed)
  const cell = (row: string[], i?: number) => (i === undefined || i < 0 ? '' : row[i] ?? '').trim()

  const teams = data.map((row): ParsedTeam => {
    let speakers = Array.from({ length: o.speakers }, (_, i) => cell(row, columns[`speaker${i + 1}` as keyof TeamColumns]))
    // all the speakers in one cell ("Айгерим Сапарова, Даниял Ержанов, …")
    if (o.speakers > 1 && speakers.filter(Boolean).length === 1 && /[,\n;/]/.test(speakers.find(Boolean)!)) {
      speakers = speakers.find(Boolean)!.split(/[,\n;/]+/).map(s => s.trim()).filter(Boolean)
    }
    speakers = speakers.filter(Boolean)
    const league = o.leagues.length ? (columns.league !== undefined && columns.league >= 0 ? leagueOf(cell(row, columns.league), o.leagues) : o.league || undefined) : undefined
    const team: ParsedTeam = { name: cell(row, columns.name), institution: cell(row, columns.institution), speakers, ...(league && { league }) }
    if (team.name.length < 2 || team.name.length > 60) team.error = 'name'
    else if (team.institution.length < 2) team.error = 'institution'
    else if (speakers.length !== o.speakers || speakers.some(s => s.length < 3 || s.length > 100)) team.error = 'speakers'
    else if (o.leagues.length && !league) team.error = 'league'
    return team
  })
  return { header, columns, teams }
}
