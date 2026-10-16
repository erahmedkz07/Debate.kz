import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { query } from '../middleware/validate.js'
import { publicWhere } from '../services/tournaments.js'
import { languageOf, TOPICS, topicsOf } from '../services/topics.js'

// Motion bank: every motion of a released or completed round of a public tournament.
// Draft rounds never appear (their motions are secret until release).
export const motionsRouter = Router()

const PAGE = 24
const schema = z.object({
  search: z.string().trim().max(100).optional(),
  level: z.enum(['school', 'university']).optional(),
  lang: z.enum(['ru', 'kz']).optional(),
  topic: z.enum(TOPICS).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
})

motionsRouter.get('/motions', async (req, res) => {
  const q = query(req, schema)
  const rounds = await prisma.round.findMany({
    where: { status: { not: 'draft' }, motion: { not: '' }, tournament: publicWhere },
    include: { tournament: { select: { id: true, name: true, level: true, city: true, startDate: true } } },
    orderBy: [{ date: 'desc' }, { number: 'asc' }],
    take: 5000,
  })
  const all = rounds.map(r => ({
    id: r.id, motion: r.motion, infoSlide: r.infoSlide ?? undefined, round: r.name, date: toDay(r.date),
    topics: topicsOf(r.motion), language: languageOf(r.motion),
    tournament: { id: r.tournament.id, name: r.tournament.name, level: r.tournament.level, city: r.tournament.city },
  }))
  // search ignores case, ё/е, quotes and punctuation: "эта палата", «Эта палата…» and "ЭТА ПАЛАТА" find the same motions
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const words = q.search ? norm(q.search).split(' ').filter(Boolean) : []
  const matches = (m: (typeof all)[number]) => {
    if (!words.length) return true
    const hay = norm(`${m.motion} ${m.infoSlide ?? ''} ${m.tournament.name} ${m.tournament.city}`)
    return words.every(w => hay.includes(w))
  }
  // a mixed tournament (school and university teams together) belongs to both levels
  const levelOk = (m: (typeof all)[number]) => !q.level || m.tournament.level === q.level || m.tournament.level === 'mixed'
  const base = all.filter(m => levelOk(m) && (!q.lang || m.language === q.lang) && matches(m))
  const filtered = base.filter(m => !q.topic || m.topics.includes(q.topic))
  // how many motions each topic has under the other filters (the chips' numbers match what a click shows)
  const topicCounts = Object.fromEntries(TOPICS.map(t => [t, base.filter(m => m.topics.includes(t)).length]))
  res.json({
    items: filtered.slice((q.page - 1) * PAGE, q.page * PAGE),
    total: filtered.length,
    page: q.page,
    pages: Math.max(1, Math.ceil(filtered.length / PAGE)),
    topicCounts,
  })
})
