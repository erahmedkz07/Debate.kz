import { prisma } from '../lib/prisma.js'

// a school or university by its name (created on first use); teams and judges point to it
export async function institutionIdFor(name: string, level: 'school' | 'university' | 'mixed') {
  const i = await prisma.institution.upsert({ where: { name }, update: {}, create: { name, level } })
  return i.id
}
