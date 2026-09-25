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
  const needle = q.search?.toLowerCase()
  const filtered = all.filter(m =>
    (!q.level || m.tournament.level === q.level)
    && (!q.lang || m.language === q.lang)
    && (!q.topic || m.topics.includes(q.topic))
    && (!needle || m.motion.toLowerCase().includes(needle) || m.infoSlide?.toLowerCase().includes(needle) || m.tournament.name.toLowerCase().includes(needle)))
  // how many motions each topic has (for the filter chips), counted over the whole bank
  const topicCounts = Object.fromEntries(TOPICS.map(t => [t, all.filter(m => m.topics.includes(t)).length]))
  res.json({
    items: filtered.slice((q.page - 1) * PAGE, q.page * PAGE),
    total: filtered.length,
    page: q.page,
    pages: Math.max(1, Math.ceil(filtered.length / PAGE)),
    topicCounts,
  })
})
