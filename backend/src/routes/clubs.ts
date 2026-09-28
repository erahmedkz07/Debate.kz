import { Router, type Request } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import path from 'node:path'
import { randomBytes, randomInt } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { LOGOS_DIR } from '../lib/uploads.js'
import { z } from 'zod'
import type { Prisma, User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { body, param, query } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { background, notify } from '../services/notify.js'

// Clubs and their teams. All members are equal: any member can edit the club, create and rename teams,
// put members into teams, share or reset the join link and remove a member. Every change goes to the club log.
export const clubsRouter = Router()

const name = z.string().trim().min(2).max(80)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

const log = (tx: Prisma.TransactionClient, clubId: string, user: User, action: string, detail = '') =>
  tx.clubLog.create({ data: { clubId, userId: user.id, userName: user.name, action, detail } })

// the signed-in user's membership in this club, or 403
async function memberOf(req: Request, clubId: string) {
  const m = await prisma.clubMember.findUnique({ where: { userId: req.user!.id } })
  if (!m || m.clubId !== clubId) throw forbidden('not_club_member')
  return m
}

const unique = (e: unknown, code: string) => {
  if ((e as { code?: string })?.code === 'P2002') throw conflict(code)
  throw e
}

// ---------- public ----------

clubsRouter.get('/clubs', async (req, res) => {
  const q = query(req, z.object({ search: z.string().trim().max(80).optional(), city: z.string().trim().max(60).optional() }))
  const clubs = await prisma.club.findMany({
    where: {
      ...(q.city && { city: q.city }),
      ...(q.search && { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { institution: { contains: q.search, mode: 'insensitive' } }] }),
    },
    include: { _count: { select: { members: true, teams: true } } },
    orderBy: { name: 'asc' },
    take: 100,
  })
  res.json(clubs.map(c => ({ id: c.id, name: c.name, city: c.city, institution: c.institution ?? undefined, logoUrl: c.logoUrl ?? undefined, members: c._count.members, teams: c._count.teams })))
})

// the club page: public part for everyone, the join link and the log only for members
clubsRouter.get('/clubs/:id', async (req, res) => {
  const c = await prisma.club.findUnique({
    where: { id: param(req, 'id') },
    include: {
      teams: { orderBy: { name: 'asc' } },
      members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } }, orderBy: { joinedAt: 'asc' } },
    },
  })
  if (!c) throw notFound('club_not_found')
  const isMember = !!req.user && c.members.some(m => m.userId === req.user!.id)
  const member = (m: typeof c.members[number]) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl ?? undefined, teamId: m.teamId ?? undefined })
  res.json({
    id: c.id, name: c.name, city: c.city, institution: c.institution ?? undefined, description: c.description, createdAt: c.createdAt.toISOString().slice(0, 10),
    logoUrl: c.logoUrl ?? undefined,
    teams: c.teams.map(t => ({ id: t.id, name: t.name, logoUrl: t.logoUrl ?? undefined, members: c.members.filter(m => m.teamId === t.id).map(member) })),
    members: c.members.map(member),
    isMember,
    myRequest: req.user && !isMember
      ? (await prisma.clubJoinRequest.findFirst({ where: { clubId: c.id, userId: req.user.id, status: 'pending' }, select: { id: true } }))?.id
      : undefined,
    ...(isMember && {
      joinCode: c.joinCode,
      pendingRequests: await prisma.clubJoinRequest.count({ where: { clubId: c.id, status: 'pending' } }),
      log: (await prisma.clubLog.findMany({ where: { clubId: c.id }, orderBy: { createdAt: 'desc' }, take: 50 }))
        .map(l => ({ id: l.id, userName: l.userName, action: l.action, detail: l.detail, createdAt: l.createdAt.toISOString() })),
    }),
  })
})

// preview for the join page
clubsRouter.get('/clubs/code/:code', async (req, res) => {
  const c = await prisma.club.findUnique({ where: { joinCode: param(req, 'code').toUpperCase() }, include: { _count: { select: { members: true, teams: true } } } })
  if (!c) throw notFound('club_not_found')
  res.json({ id: c.id, name: c.name, city: c.city, institution: c.institution ?? undefined, logoUrl: c.logoUrl ?? undefined, members: c._count.members, teams: c._count.teams })
})

// ---------- my club ----------

clubsRouter.get('/me/club', requireAuth(), async (req, res) => {
  const m = await prisma.clubMember.findUnique({ where: { userId: req.user!.id }, include: { club: true, team: true } })
  res.json(m ? { club: { id: m.club.id, name: m.club.name, city: m.club.city, logoUrl: m.club.logoUrl ?? undefined }, team: m.team ? { id: m.team.id, name: m.team.name, logoUrl: m.team.logoUrl ?? undefined } : undefined } : { club: undefined, team: undefined })
})

clubsRouter.post('/clubs', requireAuth(), requireVerified, async (req, res) => {
  const d = body(req, z.object({ name, city: z.string().trim().min(2).max(60), institution: z.string().trim().max(150).optional(), description: z.string().trim().max(2000).optional() }))
  const me = req.user!
  if (await prisma.clubMember.findUnique({ where: { userId: me.id } })) throw conflict('already_in_club')
  const club = await prisma.$transaction(async tx => {
    const c = await tx.club.create({ data: { name: d.name, city: d.city, institution: d.institution || null, description: d.description ?? '', joinCode: newCode() } })
    await tx.clubMember.create({ data: { userId: me.id, clubId: c.id } })
    await log(tx, c.id, me, 'created', c.name)
    return c
  }).catch(e => unique(e, 'club_exists'))
  res.status(201).json({ id: club.id })
})

clubsRouter.patch('/clubs/:id', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  const d = body(req, z.object({ name: name.optional(), city: z.string().trim().min(2).max(60).optional(), institution: z.string().trim().max(150).optional(), description: z.string().trim().max(2000).optional() }))
  await prisma.$transaction(async tx => {
    await tx.club.update({ where: { id }, data: { ...d, ...(d.institution !== undefined && { institution: d.institution || null }) } })
    await log(tx, id, req.user!, 'edited', Object.keys(d).join(', '))
  }).catch(e => unique(e, 'club_exists'))
  res.json({ ok: true })
})

// a new join link; the old one stops working (e.g. it leaked to a public chat)
clubsRouter.post('/clubs/:id/code', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  const c = await prisma.$transaction(async tx => {
    const c = await tx.club.update({ where: { id }, data: { joinCode: newCode() } })
    await log(tx, id, req.user!, 'code.reset')
    return c
  })
  res.json({ joinCode: c.joinCode })
})

clubsRouter.post('/clubs/join', requireAuth(), requireVerified, async (req, res) => {
  const { code } = body(req, z.object({ code: z.string().trim().toUpperCase().length(8) }))
  const me = req.user!
  const c = await prisma.club.findUnique({ where: { joinCode: code } })
  if (!c) throw notFound('club_not_found')
  const current = await prisma.clubMember.findUnique({ where: { userId: me.id } })
  if (current?.clubId === c.id) throw conflict('already_member')
  if (current) throw conflict('already_in_club') // leave the old club first
  const others = (await prisma.clubMember.findMany({ where: { clubId: c.id }, select: { userId: true } })).map(m => m.userId)
  await prisma.$transaction(async tx => {
    await tx.clubMember.create({ data: { userId: me.id, clubId: c.id } })
    await tx.clubJoinRequest.updateMany({ where: { userId: me.id, status: 'pending' }, data: { status: 'cancelled' } })
    await log(tx, c.id, me, 'joined')
  })
  background(notify(others, 'participant.clubJoined', { name: me.name, club: c.name }, '/me?tab=club'))
  res.json({ id: c.id })
})

clubsRouter.post('/clubs/:id/leave', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  await prisma.$transaction(async tx => {
    await tx.clubMember.delete({ where: { userId: req.user!.id } })
    await log(tx, id, req.user!, 'left')
  })
  res.status(204).end()
})

// any member may remove another member (all members are equal); the removed person is told
clubsRouter.delete('/clubs/:id/members/:userId', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  const target = await prisma.clubMember.findUnique({ where: { userId: param(req, 'userId') }, include: { user: true, club: true } })
  if (!target || target.clubId !== id) throw notFound('member_not_found')
  if (target.userId === req.user!.id) throw badRequest('use_leave')
  await prisma.$transaction(async tx => {
    await tx.clubMember.delete({ where: { userId: target.userId } })
    await log(tx, id, req.user!, 'removed', target.user.name)
  })
  background(notify([target.userId], 'participant.clubRemoved', { name: req.user!.name, club: target.club.name }, '/clubs'))
  res.status(204).end()
})

// ---------- teams inside a club ----------

clubsRouter.post('/clubs/:id/teams', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  const m = await memberOf(req, id)
  const d = body(req, z.object({ name, join: z.boolean().default(false) }))
  if ((await prisma.clubTeam.count({ where: { clubId: id } })) >= 30) throw badRequest('too_many_teams')
  const team = await prisma.$transaction(async tx => {
    const t = await tx.clubTeam.create({ data: { clubId: id, name: d.name } })
    await log(tx, id, req.user!, 'team.created', t.name)
    // "create my team": the creator moves into it right away
    if (d.join) await tx.clubMember.update({ where: { userId: m.userId }, data: { teamId: t.id } })
    return t
  }).catch(e => unique(e, 'team_exists'))
  res.status(201).json({ id: team.id, name: team.name })
})

async function teamOf(req: Request) {
  const t = await prisma.clubTeam.findUnique({ where: { id: param(req, 'teamId') } })
  if (!t) throw notFound('team_not_found')
  await memberOf(req, t.clubId)
  return t
}

clubsRouter.patch('/club-teams/:teamId', requireAuth(), async (req, res) => {
  const t = await teamOf(req)
  const d = body(req, z.object({ name }))
  await prisma.$transaction(async tx => {
    await tx.clubTeam.update({ where: { id: t.id }, data: { name: d.name } })
    await log(tx, t.clubId, req.user!, 'team.renamed', `${t.name} → ${d.name}`)
  }).catch(e => unique(e, 'team_exists'))
  res.json({ ok: true })
})

// deleting a team keeps its members in the club (without a team); past tournaments keep their history
clubsRouter.delete('/club-teams/:teamId', requireAuth(), async (req, res) => {
  const t = await teamOf(req)
  await prisma.$transaction(async tx => {
    await tx.clubTeam.delete({ where: { id: t.id } })
    await log(tx, t.clubId, req.user!, 'team.deleted', t.name)
  })
  await removeLogo(t.logoUrl)
  res.status(204).end()
})

// ---------- logos: any member sets the club's picture and its teams' pictures; shown wherever the club or team appears ----------

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
})

// never stored as sent: decoded (anything that is not a real image is refused), metadata stripped, a square 256x256 WebP;
// "contain" keeps a whole emblem visible on a white square instead of cutting its edges
async function saveLogo(owner: string, file?: Express.Multer.File) {
  if (!file) throw badRequest('invalid_image')
  let webp: Buffer
  try {
    webp = await sharp(file.buffer, { limitInputPixels: 40_000_000 }).rotate()
      .resize(256, 256, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).webp({ quality: 85 }).toBuffer()
  } catch {
    throw badRequest('invalid_image')
  }
  const name = `${owner}-${randomBytes(6).toString('hex')}.webp` // a new name each time: no stale browser cache
  await writeFile(path.join(LOGOS_DIR, name), webp)
  return `/uploads/logos/${name}`
}
async function removeLogo(url: string | null) {
  if (!url?.startsWith('/uploads/logos/')) return
  await unlink(path.join(LOGOS_DIR, path.basename(url))).catch(() => undefined)
}

clubsRouter.post('/clubs/:id/logo', requireAuth(), logoUpload.single('logo'), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  const club = await prisma.club.findUniqueOrThrow({ where: { id } })
  const logoUrl = await saveLogo(`club-${id}`, req.file)
  await prisma.$transaction(async tx => {
    await tx.club.update({ where: { id }, data: { logoUrl } })
    await log(tx, id, req.user!, 'logo.changed')
  })
  await removeLogo(club.logoUrl)
  res.json({ logoUrl })
})

clubsRouter.delete('/clubs/:id/logo', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  const club = await prisma.club.findUniqueOrThrow({ where: { id } })
  await prisma.$transaction(async tx => {
    await tx.club.update({ where: { id }, data: { logoUrl: null } })
    await log(tx, id, req.user!, 'logo.removed')
  })
  await removeLogo(club.logoUrl)
  res.status(204).end()
})

clubsRouter.post('/club-teams/:teamId/logo', requireAuth(), logoUpload.single('logo'), async (req, res) => {
  const t = await teamOf(req)
  const logoUrl = await saveLogo(`team-${t.id}`, req.file)
  await prisma.$transaction(async tx => {
    await tx.clubTeam.update({ where: { id: t.id }, data: { logoUrl } })
    await log(tx, t.clubId, req.user!, 'team.logo', t.name)
  })
  await removeLogo(t.logoUrl)
  res.json({ logoUrl })
})

clubsRouter.delete('/club-teams/:teamId/logo', requireAuth(), async (req, res) => {
  const t = await teamOf(req)
  await prisma.$transaction(async tx => {
    await tx.clubTeam.update({ where: { id: t.id }, data: { logoUrl: null } })
    await log(tx, t.clubId, req.user!, 'team.logo', t.name)
  })
  await removeLogo(t.logoUrl)
  res.status(204).end()
})

// put a member (yourself or another member) into a team, or take them out (teamId: null)
clubsRouter.put('/clubs/:id/members/:userId/team', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  const { teamId } = body(req, z.object({ teamId: z.string().nullable() }))
  const target = await prisma.clubMember.findUnique({ where: { userId: param(req, 'userId') }, include: { user: true } })
  if (!target || target.clubId !== id) throw notFound('member_not_found')
  const team = teamId ? await prisma.clubTeam.findUnique({ where: { id: teamId } }) : null
  if (teamId && (!team || team.clubId !== id)) throw badRequest('team_not_in_club')
  await prisma.$transaction(async tx => {
    await tx.clubMember.update({ where: { userId: target.userId }, data: { teamId } })
    await log(tx, id, req.user!, 'team.assigned', `${target.user.name} → ${team?.name ?? '—'}`)
  })
  res.json({ ok: true })
})

// ---------- requests to join (from the public club page) ----------

const MAX_OPEN_REQUESTS = 3

clubsRouter.post('/clubs/:id/requests', requireAuth(), requireVerified, async (req, res) => {
  const { message } = body(req, z.object({ message: z.string().trim().max(300).default('') }))
  const me = req.user!
  const c = await prisma.club.findUnique({ where: { id: param(req, 'id') } })
  if (!c) throw notFound('club_not_found')
  const current = await prisma.clubMember.findUnique({ where: { userId: me.id } })
  if (current?.clubId === c.id) throw conflict('already_member')
  if (current) throw conflict('already_in_club')
  if (await prisma.clubJoinRequest.findFirst({ where: { clubId: c.id, userId: me.id, status: 'pending' } })) throw conflict('already_requested')
  if ((await prisma.clubJoinRequest.count({ where: { userId: me.id, status: 'pending' } })) >= MAX_OPEN_REQUESTS) throw badRequest('too_many_club_requests')
  const r = await prisma.clubJoinRequest.create({ data: { clubId: c.id, userId: me.id, message } })
  const members = (await prisma.clubMember.findMany({ where: { clubId: c.id }, select: { userId: true } })).map(m => m.userId)
  background(notify(members, 'participant.clubRequest', { name: me.name, club: c.name }, '/me?tab=club'))
  res.status(201).json({ id: r.id })
})

// members see who wants to join
clubsRouter.get('/clubs/:id/requests', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await memberOf(req, id)
  const rows = await prisma.clubJoinRequest.findMany({
    where: { clubId: id, status: 'pending' },
    include: { user: { select: { id: true, name: true, avatarUrl: true, institution: true, city: true } } },
    orderBy: { createdAt: 'asc' },
  })
  res.json(rows.map(r => ({
    id: r.id, message: r.message, createdAt: r.createdAt.toISOString(),
    user: { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? undefined, institution: r.user.institution ?? undefined, city: r.user.city ?? undefined },
  })))
})

// any member accepts (and may put the person straight into a team) or declines
clubsRouter.patch('/club-requests/:requestId', requireAuth(), async (req, res) => {
  const d = body(req, z.object({ status: z.enum(['accepted', 'declined']), teamId: z.string().nullable().optional() }))
  const r = await prisma.clubJoinRequest.findUnique({ where: { id: param(req, 'requestId') }, include: { user: true, club: true } })
  if (!r) throw notFound('request_not_found')
  await memberOf(req, r.clubId)
  if (r.status !== 'pending') throw badRequest('request_not_pending')
  const team = d.teamId ? await prisma.clubTeam.findUnique({ where: { id: d.teamId } }) : null
  if (d.teamId && (!team || team.clubId !== r.clubId)) throw badRequest('team_not_in_club')
  if (d.status === 'accepted' && (await prisma.clubMember.findUnique({ where: { userId: r.userId } }))) throw conflict('already_in_club')
  await prisma.$transaction(async tx => {
    await tx.clubJoinRequest.update({ where: { id: r.id }, data: { status: d.status, handledById: req.user!.id, handledAt: new Date() } })
    if (d.status === 'accepted') {
      await tx.clubMember.create({ data: { userId: r.userId, clubId: r.clubId, teamId: team?.id ?? null } })
      // the person is in a club now: other open requests are closed
      await tx.clubJoinRequest.updateMany({ where: { userId: r.userId, status: 'pending' }, data: { status: 'cancelled' } })
    }
    await log(tx, r.clubId, req.user!, d.status === 'accepted' ? 'request.accepted' : 'request.declined', team ? `${r.user.name} → ${team.name}` : r.user.name)
  })
  background(notify([r.userId], d.status === 'accepted' ? 'participant.clubRequestAccepted' : 'participant.clubRequestDeclined',
    { club: r.club.name, team: team?.name ?? '' }, d.status === 'accepted' ? '/me?tab=club' : `/clubs/${r.clubId}`))
  res.json({ ok: true })
})

// the person withdraws their own request
clubsRouter.delete('/club-requests/:requestId', requireAuth(), async (req, res) => {
  const r = await prisma.clubJoinRequest.findUnique({ where: { id: param(req, 'requestId') } })
  if (!r || r.userId !== req.user!.id) throw notFound('request_not_found')
  if (r.status === 'pending') await prisma.clubJoinRequest.update({ where: { id: r.id }, data: { status: 'cancelled' } })
  res.status(204).end()
})

clubsRouter.get('/me/club-requests', requireAuth(), async (req, res) => {
  const rows = await prisma.clubJoinRequest.findMany({ where: { userId: req.user!.id, status: 'pending' }, include: { club: { select: { id: true, name: true, city: true } } }, orderBy: { createdAt: 'desc' } })
  res.json(rows.map(r => ({ id: r.id, club: r.club, createdAt: r.createdAt.toISOString() })))
})
