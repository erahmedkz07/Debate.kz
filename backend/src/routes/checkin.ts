import { Router } from 'express'
import { z } from 'zod'
import { randomInt } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { assertCanManage } from '../services/tournaments.js'

// QR check-in at the venue: the organizer shows a code (as a QR) on the screen or on paper,
// a team member scans it and the team is marked present. Organizers can also mark teams by hand.
export const checkinRouter = Router()

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

// brute-force guard: 10 wrong codes per user per 10 minutes
const WINDOW_MS = 10 * 60 * 1000
const misses = new Map<string, number[]>()
function tooManyMisses(userId: string) {
  const recent = (misses.get(userId) ?? []).filter(t => Date.now() - t < WINDOW_MS)
  misses.set(userId, recent)
  return recent.length >= 10
}

async function status(tournamentId: string) {
  const [t, teams] = await Promise.all([
    prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { checkinCode: true } }),
    prisma.team.findMany({ where: { tournamentId, swing: false }, select: { checkedInAt: true } }),
  ])
  return { code: t.checkinCode ?? undefined, present: teams.filter(x => x.checkedInAt).length, total: teams.length }
}

checkinRouter.get('/tournaments/:id/checkin', requireAuth(), async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  res.json(await status(param(req, 'id')))
})

// a new code invalidates the old QR (e.g. if a photo of it spread)
checkinRouter.post('/tournaments/:id/checkin/code', requireAuth(), async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  await prisma.tournament.update({ where: { id: param(req, 'id') }, data: { checkinCode: newCode() } })
  res.json(await status(param(req, 'id')))
})

// a new day: everybody checks in again
checkinRouter.post('/tournaments/:id/checkin/reset', requireAuth(), async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  await prisma.team.updateMany({ where: { tournamentId: param(req, 'id') }, data: { checkedInAt: null } })
  res.json(await status(param(req, 'id')))
})

checkinRouter.patch('/teams/:teamId/checkin', requireAuth(), async (req, res) => {
  const { present } = body(req, z.object({ present: z.boolean() }))
  const team = await prisma.team.findUnique({ where: { id: param(req, 'teamId') } })
  if (!team) throw notFound('team_not_found')
  await assertCanManage(req.user, team.tournamentId)
  await prisma.team.update({ where: { id: team.id }, data: { checkedInAt: present ? new Date() : null } })
  res.json({ ok: true })
})

// a team member scanned the venue QR
checkinRouter.post('/checkin/:tournamentId', requireAuth(), async (req, res) => {
  const { code } = body(req, z.object({ code: z.string().trim().toUpperCase().max(12) }))
  const me = req.user!.id
  if (tooManyMisses(me)) throw new HttpError(429, 'too_many_attempts')
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'tournamentId') } })
  if (!t) throw notFound('tournament_not_found')
  if (t.status === 'finished') throw forbidden('tournament_finished')
  if (!t.checkinCode || t.checkinCode !== code) {
    misses.get(me)!.push(Date.now())
    throw badRequest('wrong_checkin_code')
  }
  // the team where this person speaks (linked speaker), or the team they registered
  const speaker = await prisma.speaker.findFirst({ where: { userId: me, team: { tournamentId: t.id, swing: false } }, include: { team: true } })
  let team = speaker?.team ?? null
  if (!team) {
    const reg = await prisma.teamRegistration.findFirst({ where: { userId: me, tournamentId: t.id, status: 'confirmed' } })
    if (reg) team = await prisma.team.findUnique({ where: { tournamentId_name: { tournamentId: t.id, name: reg.teamName } } })
  }
  if (!team) throw forbidden('not_in_tournament')
  const updated = await prisma.team.update({ where: { id: team.id }, data: { checkedInAt: team.checkedInAt ?? new Date() } })
  res.json({ team: updated.name, tournament: t.name, alreadyChecked: !!team.checkedInAt })
})
