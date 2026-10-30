// Proves the latest backup can be restored: it is loaded into a separate, temporary database (<db>_restorecheck),
// its row counts are compared with the live database, and the temporary database is dropped. The live database is
// only read. The files archive is listed too. A failure is reported to the admins in Telegram.
// Usage: npm run backup:verify   (weekly is enough; see docs/OPERATIONS.md). Reads the server's copies too:
//        BACKUP_DIR=/var/backups/debatekz node --env-file=/etc/debatekz/api.env scripts/backup-verify.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { alert, dbUrl, pgTool, tarTool } from './lib/ops.mjs'

const root = path.resolve(import.meta.dirname, '..')
const dir = path.resolve(process.env.BACKUP_DIR ?? path.join(root, 'backups', 'auto'))
const live = dbUrl()
const checkName = `${live.pathname.slice(1)}_restorecheck`
const check = new URL(live); check.pathname = `/${checkName}`
const postgres = new URL(live); postgres.pathname = '/postgres'
const TABLES = ['users', 'tournaments', 'teams', 'speakers', 'judges', 'rounds', 'debates', 'ballots', 'speaker_scores', 'certificates', 'clubs']

const count = async url => {
  const c = new pg.Client({ connectionString: url.toString() })
  await c.connect()
  try {
    const out = {}
    for (const t of TABLES) out[t] = Number((await c.query(`select count(*)::int as n from "${t}"`)).rows[0].n)
    return out
  } finally { await c.end() }
}
const admin = async sql => {
  const c = new pg.Client({ connectionString: postgres.toString() })
  await c.connect()
  try { await c.query(sql) } finally { await c.end() }
}

try {
  // npm run backup names them debatekz-…, the server's deploy/backup.sh db-…: the newest of either
  const latest = readdirSync(dir).filter(f => /^(?:debatekz|db)-.*\.dump$/.test(f))
    .sort((a, b) => statSync(path.join(dir, a)).mtimeMs - statSync(path.join(dir, b)).mtimeMs).at(-1)
  if (!latest) throw new Error(`no backup in ${dir}`)
  const dump = path.join(dir, latest)
  await admin(`drop database if exists "${checkName}"`)
  await admin(`create database "${checkName}"`)
  execFileSync(pgTool('pg_restore'), ['--no-owner', '--no-privileges', `--dbname=${check}`, dump], { stdio: ['ignore', 'ignore', 'inherit'] })
  const [restored, now] = [await count(check), await count(live)]
  // the backup may be older than the live data: it must have every table, and not more rows than there are now
  // (except rows deleted since); here: no table empty that has data now, and users present
  const rows = TABLES.map(t => `${t}: ${restored[t]} (сейчас ${now[t]})`)
  if (!restored.users) throw new Error('в копии нет пользователей')
  const empty = TABLES.filter(t => now[t] > 0 && restored[t] === 0)
  if (empty.length) throw new Error(`в копии пустые таблицы: ${empty.join(', ')}`)
  const filesArchive = latest.replace(/^(?:debatekz|db)-/, 'files-').replace(/\.dump$/, '.tar.gz')
  if (existsSync(path.join(dir, filesArchive))) execFileSync(tarTool(), ['-tzf', path.join(dir, filesArchive)], { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log(`restore check ok: ${latest} restores into a clean database\n  ${rows.join('\n  ')}`)
} catch (e) {
  await alert(`проверка бэкапа не прошла: ${e instanceof Error ? e.message : e}`)
  process.exitCode = 1
} finally {
  await admin(`drop database if exists "${checkName}"`).catch(() => undefined)
}
