import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { body } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'

// In-app notification centre. Everyone reads only their own notifications;
// admins additionally see the whole platform feed (every user's notifications).
export const notificationsRouter = Router()

const PAGE = 30
const query = z.object({ before: z.iso.datetime().optional() })

const shape = (n: Prisma.NotificationGetPayload<object>) => ({
  id: n.id, type: n.type, data: n.data, link: n.link ?? undefined, read: !!n.readAt, createdAt: n.createdAt.toISOString(),
})

// newest first, 30 per page; ?before=<createdAt of the last item> loads the next page
notificationsRouter.get('/me/notifications', requireAuth(), async (req, res) => {
  const { before } = query.parse(req.query)
  const where = { userId: req.user!.id, ...(before && { createdAt: { lt: new Date(before) } }) }
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ])
  res.json({ items: items.map(shape), unread, hasMore: items.length === PAGE })
})

// cheap counter for the bell in the header
notificationsRouter.get('/me/notifications/unread', requireAuth(), async (req, res) => {
  res.json({ count: await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }) })
})

// mark some (ids) or all as read; only your own notifications are touched
notificationsRouter.post('/me/notifications/read', requireAuth(), async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(z.string()).max(200).optional() }))
  const r = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null, ...(ids && { id: { in: ids } }) },
    data: { readAt: new Date() },
  })
  res.json({ updated: r.count })
})

// admins: everything that happens on the platform, with the recipient
notificationsRouter.get('/admin/notifications', requireAuth('admin'), async (req, res) => {
  const { before } = query.parse(req.query)
  const items = await prisma.notification.findMany({
    where: before ? { createdAt: { lt: new Date(before) } } : {},
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: PAGE,
  })
  res.json({ items: items.map(n => ({ ...shape(n), recipient: n.user })), hasMore: items.length === PAGE })
})
