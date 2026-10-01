import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { notFound } from '../lib/errors.js'
import { param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { assertCanManage } from '../services/tournaments.js'
import { certificateInclude, ensureCertificates } from '../services/certificates.js'

export const certificatesRouter = Router()

type Row = Prisma.CertificateGetPayload<{ include: typeof certificateInclude }>
const shape = (c: Row) => ({
  code: c.code, kind: c.kind, name: c.name, teamName: c.teamName ?? undefined, institution: c.institution ?? undefined,
  teamPlace: c.teamPlace ?? undefined, inBreak: c.inBreak, speakerPlace: c.speakerPlace ?? undefined, issuedAt: toDay(c.issuedAt),
  ...(c.breakCategory && { breakCategory: c.breakCategory, categoryPlace: c.categoryPlace ?? undefined }),
  ...(c.award && { award: c.award }),
  tournament: {
    id: c.tournament.id, name: c.tournament.name, city: c.tournament.city, level: c.tournament.level, organizer: c.tournament.organizerName,
    startDate: toDay(c.tournament.startDate), endDate: toDay(c.tournament.endDate),
  },
})
const code = z.string().regex(/^[A-Z2-9]{10}$/)

// public check behind the QR: anyone can confirm a certificate is genuine
certificatesRouter.get('/certificates/:code', async (req, res) => {
  const parsed = code.safeParse(param(req, 'code').toUpperCase())
  if (!parsed.success) throw notFound('certificate_not_found')
  const c = await prisma.certificate.findUnique({ where: { code: parsed.data }, include: certificateInclude })
  if (!c) throw notFound('certificate_not_found')
  res.json(shape(c))
})

// my certificates: as a speaker or a judge of finished tournaments
certificatesRouter.get('/me/certificates', requireAuth(), async (req, res) => {
  const me = req.user!.id
  const [speakers, judges] = await Promise.all([
    prisma.speaker.findMany({ where: { userId: me, team: { tournament: { status: 'finished' } } }, select: { id: true, team: { select: { tournamentId: true } } } }),
    prisma.judge.findMany({ where: { userId: me, tournament: { status: 'finished' } }, select: { id: true, tournamentId: true } }),
  ])
  for (const id of new Set([...speakers.map(s => s.team.tournamentId), ...judges.map(j => j.tournamentId)])) await ensureCertificates(id)
  const list = await prisma.certificate.findMany({
    where: { OR: [{ userId: me }, { speakerId: { in: speakers.map(s => s.id) } }, { judgeId: { in: judges.map(j => j.id) } }] },
    include: certificateInclude,
    orderBy: { issuedAt: 'desc' },
  })
  res.json(list.map(shape))
})

// organizers print every certificate of their finished tournament at once
certificatesRouter.get('/tournaments/:id/certificates', requireAuth(), async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  await ensureCertificates(param(req, 'id'))
  const list = await prisma.certificate.findMany({
    where: { tournamentId: param(req, 'id') },
    include: certificateInclude,
    // winners first, then by team and name; judges last
    orderBy: [{ kind: 'desc' }, { teamPlace: 'asc' }, { teamName: 'asc' }, { name: 'asc' }],
  })
  res.json(list.map(shape))
})
