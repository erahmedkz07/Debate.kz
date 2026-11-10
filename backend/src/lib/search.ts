import { Prisma } from '../generated/prisma/client.js'
import { prisma } from './prisma.js'

// Search that does not tell Kazakh letters from the Russian ones people type instead, nor ё from е, nor capitals:
// "казакстан" finds "Қазақстан", "нурлан" finds "Нұрлан".
const FROM = 'әіңғүұқөһё'
const TO = 'аингуукохе'
export const fold = (s: string) => s.toLowerCase().replace(/[әіңғүұқөһё]/g, c => TO[FROM.indexOf(c)])

// the ids of the rows where one of the columns contains the text (the tables and columns are fixed in the code)
const COLUMNS = { tournaments: ['name', 'organizer_name'], clubs: ['name', 'institution'] } as const
export async function idsContaining(table: keyof typeof COLUMNS, text: string): Promise<string[]> {
  // "%" and "_" typed in the search are plain characters, not LIKE wildcards
  const like = `%${fold(text).replace(/[\\%_]/g, c => `\\${c}`)}%`
  const where = COLUMNS[table].map(c => Prisma.sql`translate(lower(coalesce(${Prisma.raw(`"${c}"`)}, '')), ${FROM}, ${TO}) LIKE ${like}`)
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.join(where, ' OR ')}`
  return rows.map(r => r.id)
}
