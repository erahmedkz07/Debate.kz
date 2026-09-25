import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { toDay } from '../lib/dates.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { hashToken, newToken } from '../lib/tokens.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { assertCanManage, assertOwner, participationIn } from '../services/tournaments.js'

export const invitesRouter = Router()

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Judges and co-organizers join a tournament only through a single-use invite link from its organizers.
// Nobody can make themselves a judge: the right exists only inside that one tournament.
invitesRouter.post('/tournaments/:id/invites', requireAuth(), async (req, res) => {
  const { kind } = body(req, z.object({ kind: z.enum(['judge', 'co_organizer']) }))
  const tournamentId = param(req, 'id')
  if (kind === 'co_organizer') await assertOwner(req.user, tournamentId)
  else await assertCanManage(req.user, tournamentId)

  const { token, hash } = newToken()
  const invite = await prisma.tournamentInvite.create({
    data: { tournamentId, kind, tokenHash: hash, createdById: req.user!.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  })
  res.status(201).json({ id: invite.id, kind, url: `${env.CLIENT_ORIGIN}/invite/${token}`, expiresAt: invite.expiresAt.toISOString() })
})

async function loadInvite(token: string) {
  const invite = await prisma.tournamentInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { tournament: true, createdBy: { select: { name: true } } },
  })
  if (!invite) throw notFound('invite_not_found')
  const state = invite.usedAt ? 'used' : invite.expiresAt < new Date() ? 'expired' : 'valid'
  return { invite, state }
}

// preview for the invite page (no login needed to see what you are invited to)
invitesRouter.get('/invites/:token', async (req, res) => {
  const { invite, state } = await loadInvite(param(req, 'token'))
  const t = invite.tournament
  res.json({
    kind: invite.kind, state, invitedBy: invite.createdBy.name, expiresAt: invite.expiresAt.toISOString(),
    tournament: { id: t.id, name: t.name, city: t.city, startDate: toDay(t.startDate), endDate: toDay(t.endDate), cover: t.coverUrl ?? '' },
  })
})

invitesRouter.post('/invites/:token/accept', requireAuth(), requireVerified, async (req, res) => {
  const { invite, state } = await loadInvite(param(req, 'token'))
  if (state !== 'valid') throw badRequest(`invite_${state}`)
  const user = req.user!
  const role = await participationIn(user.id, invite.tournamentId)
  // a speaker (or applicant) of this tournament cannot judge or run it
  if (role.competitor) throw forbidden('conflict_of_interest')
  if (invite.kind === 'judge' && role.judge) throw conflict('already_joined')
  if (invite.kind === 'co_organizer' && role.organizer) throw conflict('already_joined')

  await prisma.$transaction(async tx => {
    // claim the invite atomically so one link cannot be used twice in parallel
    const claimed = await tx.tournamentInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date(), usedById: user.id } })
    if (claimed.count !== 1) throw badRequest('invite_used')
    if (invite.kind === 'judge') {
      const institutionId = user.institution
        ? (await tx.institution.upsert({ where: { name: user.institution }, update: {}, create: { name: user.institution, level: invite.tournament.level } })).id
        : undefined
      await tx.judge.create({ data: { tournamentId: invite.tournamentId, name: user.name, rating: 5, userId: user.id, institutionId } })
    } else {
      await tx.tournamentOrganizer.create({ data: { tournamentId: invite.tournamentId, userId: user.id, role: 'co_organizer' } })
    }
  })
  res.json({ ok: true, kind: invite.kind, tournamentId: invite.tournamentId })
})
