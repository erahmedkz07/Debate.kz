import { prisma } from '../lib/prisma.js'
import { fold } from '../lib/search.js'

type Db = Pick<typeof prisma, 'institution'>

// One school written in different ways is one school: "Лицей №1", "лицей № 1", "№64 мектеп-лицей" and
// "№64 мектеп лицей" (case, spaces, dashes, quotes, Kazakh letters typed as Russian ones do not matter).
// It matters for fairness: a judge never judges their own school, and in the first rounds a school's teams do not meet.
export const institutionKey = (name: string) => fold(name).replace(/[^\p{L}\p{N}]+/gu, '')

// a school or university by its name: the one already known under any spelling, or a new one
export async function institutionIdFor(name: string, level: 'school' | 'university' | 'mixed', db: Db = prisma) {
  const exact = await db.institution.findUnique({ where: { name }, select: { id: true } })
  if (exact) return exact.id
  const key = institutionKey(name)
  const same = (await db.institution.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })).find(i => institutionKey(i.name) === key)
  if (same) return same.id
  return (await db.institution.upsert({ where: { name }, update: {}, create: { name, level } })).id
}

// institution id → one id for all the spellings of that school (rows made before the spellings were joined)
export async function sameInstitution() {
  const all = await prisma.institution.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })
  const first = new Map<string, string>()
  const out = new Map<string, string>()
  for (const i of all) {
    const key = institutionKey(i.name)
    if (!first.has(key)) first.set(key, i.id)
    out.set(i.id, first.get(key)!)
  }
  return (id: string | null) => (id ? out.get(id) ?? id : null)
}
