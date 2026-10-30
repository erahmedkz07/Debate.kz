// Backup of the site: the database (pg_dump, custom format) and the uploaded files (covers, logos, avatars, payment
// receipts), into BACKUP_DIR (default backend/backups/auto). Old copies are thinned out: the last 7 days, 4 weeks
// (Sundays) and 6 months (the 1st) are kept. With BACKUP_COPY_DIR set (a second disk, a synced cloud folder) every new
// copy is also put there. A failure is reported to the admins in Telegram.
// Usage: npm run backup   (daily: Windows Task Scheduler or cron on the server, see docs/OPERATIONS.md)
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { alert, dbUrl, pgTool, stamp, tarTool } from './lib/ops.mjs'

const root = path.resolve(import.meta.dirname, '..')
const dir = path.resolve(process.env.BACKUP_DIR ?? path.join(root, 'backups', 'auto'))
const copyDir = process.env.BACKUP_COPY_DIR ? path.resolve(process.env.BACKUP_COPY_DIR) : null
const storage = path.resolve(process.env.STORAGE_DIR ?? root) // where uploads/ and private/ live (see src/lib/uploads.ts)
mkdirSync(dir, { recursive: true })

const name = stamp()
const dump = path.join(dir, `debatekz-${name}.dump`)
const files = path.join(dir, `files-${name}.tar.gz`)
try {
  // 1. the database
  execFileSync(pgTool('pg_dump'), ['-Fc', '-f', dump, `--dbname=${dbUrl()}`], { stdio: ['ignore', 'ignore', 'inherit'] })
  // a dump that pg_restore cannot read is no backup: list its contents
  const listing = execFileSync(pgTool('pg_restore'), ['--list', dump]).toString()
  if (!/TABLE DATA public users/.test(listing)) throw new Error('the dump has no users table')

  // 2. the files (tar is part of Windows 10+ and of every Linux)
  const parts = ['uploads', 'private'].filter(p => existsSync(path.join(storage, p)))
  if (parts.length) execFileSync(tarTool(), ['-czf', files, '-C', storage, ...parts])

  // 3. a second copy elsewhere
  if (copyDir) {
    mkdirSync(copyDir, { recursive: true })
    for (const f of [dump, files]) if (existsSync(f)) copyFileSync(f, path.join(copyDir, path.basename(f)))
  }

  // 4. thinning: keep the copies of the last 7 days, of 4 Sundays and of 6 firsts of the month
  for (const d of [dir, ...(copyDir ? [copyDir] : [])]) thin(d)
  const mb = (statSync(dump).size + (existsSync(files) ? statSync(files).size : 0)) / 1048576
  console.log(`backup ok: ${path.basename(dump)}${existsSync(files) ? ` + ${path.basename(files)}` : ''} (${mb.toFixed(1)} MB) in ${dir}`)
} catch (e) {
  await alert(`бэкап не удался: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}

function thin(folder) {
  const re = /^(?:debatekz|files)-(\d{4})-(\d{2})-(\d{2})_\d{4}\.(?:dump|tar\.gz)$/
  const days = new Map() // day -> files of that day
  for (const f of readdirSync(folder)) {
    const m = re.exec(f)
    if (!m) continue // never touches anything it did not make
    const day = `${m[1]}-${m[2]}-${m[3]}`
    days.set(day, [...(days.get(day) ?? []), f])
  }
  const sorted = [...days.keys()].sort().reverse()
  const keep = new Set(sorted.slice(0, 7))
  const sundays = sorted.filter(d => new Date(`${d}T12:00:00Z`).getUTCDay() === 0).slice(0, 4)
  const firsts = sorted.filter(d => d.endsWith('-01')).slice(0, 6)
  for (const d of [...sundays, ...firsts]) keep.add(d)
  for (const [day, list] of days) {
    if (keep.has(day)) {
      // within a kept day only its latest copy stays
      const latest = list.filter(f => f.startsWith('debatekz-')).sort().at(-1)
      const latestFiles = list.filter(f => f.startsWith('files-')).sort().at(-1)
      for (const f of list) if (f !== latest && f !== latestFiles) rmSync(path.join(folder, f))
    } else for (const f of list) rmSync(path.join(folder, f))
  }
}
