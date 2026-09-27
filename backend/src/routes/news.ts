import { Router, type Request } from 'express'
import { z } from 'zod'
import type { News } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { body, param, query } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { logAction } from './admin.js'

// News of the debate world. Everyone reads published posts; admins write, publish, edit and delete them
// (drafts are visible to admins only). Every change is in the admin audit log.
export const newsRouter = Router()

const PAGE = 12
const isAdmin = (req: Request) => req.user?.role === 'admin'
const toNews = (n: News & { author?: { name: string } | null }, full: boolean) => ({
  id: n.id, title: n.title, summary: n.summary, coverUrl: n.coverUrl ?? undefined, published: n.published,
  publishedAt: n.publishedAt?.toISOString(), updatedAt: n.updatedAt.toISOString(), author: n.author?.name,
  ...(full && { body: n.body }),
})

newsRouter.get('/news', async (req, res) => {
  const q = query(req, z.object({ page: z.coerce.number().int().min(1).max(500).default(1), drafts: z.enum(['1']).optional() }))
  // admins may ask for drafts too
  const where = q.drafts && isAdmin(req) ? {} : { published: true }
  const [items, total] = await Promise.all([
    prisma.news.findMany({ where, include: { author: { select: { name: true } } }, orderBy: [{ published: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * PAGE, take: PAGE }),
    prisma.news.count({ where }),
  ])
  res.json({ items: items.map(n => toNews(n, false)), total, page: q.page, pages: Math.max(1, Math.ceil(total / PAGE)) })
})

newsRouter.get('/news/:id', async (req, res) => {
  const n = await prisma.news.findUnique({ where: { id: param(req, 'id') }, include: { author: { select: { name: true } } } })
  if (!n || (!n.published && !isAdmin(req))) throw notFound('news_not_found')
  res.json(toNews(n, true))
})

const newsSchema = z.object({
  title: z.string().trim().min(5).max(160),
  summary: z.string().trim().min(10).max(300),
  body: z.string().trim().min(20).max(20_000),
  coverUrl: z.union([z.string().trim().url().max(1000).refine(u => u.startsWith('https://'), 'https only'), z.literal('')]).optional(),
  published: z.boolean().default(false),
})

newsRouter.post('/news', requireAuth('admin'), async (req, res) => {
  const d = body(req, newsSchema)
  const n = await prisma.news.create({
    data: { title: d.title, summary: d.summary, body: d.body, coverUrl: d.coverUrl || null, published: d.published, publishedAt: d.published ? new Date() : null, authorId: req.user!.id },
  })
  await logAction(req.user!, d.published ? 'news.publish' : 'news.create', { type: 'news', id: n.id, label: n.title })
  res.status(201).json({ id: n.id })
})

newsRouter.patch('/news/:id', requireAuth('admin'), async (req, res) => {
  const d = body(req, newsSchema.partial())
  const cur = await prisma.news.findUnique({ where: { id: param(req, 'id') } })
  if (!cur) throw notFound('news_not_found')
  const n = await prisma.news.update({
    where: { id: cur.id },
    data: {
      ...d, ...(d.coverUrl !== undefined && { coverUrl: d.coverUrl || null }),
      // the first publication fixes the date; unpublishing keeps it for a later re-publish
      ...(d.published && !cur.publishedAt && { publishedAt: new Date() }),
    },
  })
  const action = d.published === true && !cur.published ? 'news.publish' : d.published === false && cur.published ? 'news.unpublish' : 'news.edit'
  await logAction(req.user!, action, { type: 'news', id: n.id, label: n.title })
  res.json({ ok: true })
})

newsRouter.delete('/news/:id', requireAuth('admin'), async (req, res) => {
  const cur = await prisma.news.findUnique({ where: { id: param(req, 'id') } })
  if (!cur) throw notFound('news_not_found')
  await prisma.news.delete({ where: { id: cur.id } })
  await logAction(req.user!, 'news.delete', { type: 'news', id: cur.id, label: cur.title })
  res.status(204).end()
})
