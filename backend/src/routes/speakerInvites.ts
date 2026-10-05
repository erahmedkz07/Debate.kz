import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { hashToken, newToken } from '../lib/tokens.js'
import { param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { isOrganizerOf, participationIn } from '../services/tournaments.js'
import { background, notify } from '../services/notify.js'

// Teammates typed in by name have no account, so their tournaments are not in any career. The captain (any speaker
// of the team with an account) or an organizer sends each of them a single-use link; accepting it links the
// teammate's account to that speaker slot. Nobody can take a slot that is already linked.
export const speakerInvitesRouter = Router()

const TTL_MS = 30 * 24 * 60 * 60 * 1000

speakerInvitesRouter.post('/speakers/:id/invite', requireAuth(), async (req, res) => {
  const speaker = await prisma.speaker.findUnique({ where: { id: param(req, 'id') }, include: { team: { include: { speakers: true } } } })
  if (!speaker || speaker.team.swing) throw notFound('speaker_not_found')
  if (speaker.userId) throw conflict('speaker_already_linked')
  const teammate = speaker.team.speakers.some(s => s.userId === req.user!.id)
  if (!teammate && !(await isOrganizerOf(req.user, speaker.team.tournamentId))) throw forbidden('team_or_organizers_only')
  const { token, hash } = newToken()
  const invite = await prisma.speakerInvite.create({ data: { speakerId: speaker.id, tokenHash: hash, createdById: req.user!.id, expiresAt: new Date(Date.now() + TTL_MS) } })
  res.status(201).json({ url: `${env.CLIENT_ORIGIN}/speaker-invite/${token}`, expiresAt: invite.expiresAt.toISOString() })
})

async function load(token: string) {
  const invite = await prisma.speakerInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { speaker: { include: { team: { include: { tournament: { select: { id: true, name: true, startDate: true } } } } } } },
  })
  if (!invite) throw notFound('invite_not_found')
  return invite
}
const stateOf = (i: Awaited<ReturnType<typeof load>>) =>
  i.usedAt || i.speaker.userId ? 'used' : i.expiresAt < new Date() ? 'expired' : 'valid'

speakerInvitesRouter.get('/speaker-invites/:token', async (req, res) => {
  const i = await load(param(req, 'token'))
  res.json({
    state: stateOf(i), speaker: i.speaker.name, team: i.speaker.team.name,
    tournament: { id: i.speaker.team.tournament.id, name: i.speaker.team.tournament.name, startDate: i.speaker.team.tournament.startDate.toISOString().slice(0, 10) },
  })
})

speakerInvitesRouter.post('/speaker-invites/:token/accept', requireAuth(), requireVerified, async (req, res) => {
  const i = await load(param(req, 'token'))
  const state = stateOf(i)
  if (state === 'used') throw badRequest('invite_used')
  if (state === 'expired') throw badRequest('invite_expired')
  const tournamentId = i.speaker.team.tournamentId
  const role = await participationIn(req.user!.id, tournamentId)
  // one person, one slot: not a second speaker slot in the same tournament, not a judge or organizer of it
  if (role.competitor) throw conflict('already_a_speaker')
  if (role.judge || role.organizer) throw forbidden('conflict_of_interest')
  await prisma.$transaction([
    prisma.speaker.update({ where: { id: i.speakerId }, data: { userId: req.user!.id } }),
    prisma.speakerInvite.update({ where: { id: i.id }, data: { usedAt: new Date() } }),
  ])
  background(notify([i.createdById], 'participant.teammateLinked', { name: req.user!.name, team: i.speaker.team.name, tournament: i.speaker.team.tournament.name }, `/tournaments/${tournamentId}?tab=teams`))
  res.json({ ok: true, tournamentId, userId: req.user!.id })
})
