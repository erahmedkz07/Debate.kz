import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { conflict, forbidden, notFound } from '../lib/errors.js'
import { param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { assertCanManage, leaguesOf, linkExpired, motionFor, participationIn } from '../services/tournaments.js'
import { background, notify, organizersOf } from '../services/notify.js'
import { hiddenRoundIds } from '../services/silent.js'
import { ensureCertificates } from '../services/certificates.js'
import { placeOf, sidesInDebate } from '../services/formats.js'

// Personal links of speakers, for tournaments whose teams were entered by name (no accounts). By the link a speaker
// sees their draw, results, scores and certificate. "This is me" asks to add it all to their own profile; an organizer
// of the tournament confirms it (a link can be forwarded or a card handed to the wrong person, so the link alone is
// not proof). The organizer prints the links as QR cards for the registration desk.
export const speakerLinksRouter = Router()

const newKey = () => randomBytes(18).toString('base64url')

// the organizer: every speaker's link (made on first use), team by team, Kazakh league first
speakerLinksRouter.post('/tournaments/:id/speaker-links', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id }, select: { leagues: true } })
  const missing = await prisma.speaker.findMany({ where: { team: { tournamentId: id, swing: false }, accessKey: null }, select: { id: true } })
  for (const s of missing) await prisma.speaker.update({ where: { id: s.id }, data: { accessKey: newKey() } })
  const teams = await prisma.team.findMany({
    where: { tournamentId: id, swing: false, withdrawnAt: null },
    include: { speakers: { orderBy: { position: 'asc' } }, institution: true },
    orderBy: { name: 'asc' },
  })
  const order = new Map(leaguesOf(t).map((l, i) => [l.key, i]))
  teams.sort((a, b) => (order.get(a.league ?? '') ?? 99) - (order.get(b.league ?? '') ?? 99))
  res.json(teams.map(tm => ({
    teamId: tm.id, teamName: tm.name, institution: tm.institution?.name ?? '', ...(tm.league && { league: leaguesOf(t).find(l => l.key === tm.league)?.name }),
    speakers: tm.speakers.map(s => ({ id: s.id, name: s.name, position: s.position, accessKey: s.accessKey!, linked: !!s.userId })),
  })))
})

// a new link for one speaker: the old one stops working (a card handed to the wrong person)
speakerLinksRouter.post('/speakers/:id/link', requireAuth(), async (req, res) => {
  const s = await prisma.speaker.findUnique({ where: { id: param(req, 'id') }, include: { team: { select: { tournamentId: true } } } })
  if (!s) throw notFound('speaker_not_found')
  await assertCanManage(req.user, s.team.tournamentId)
  const accessKey = newKey()
  await prisma.speaker.update({ where: { id: s.id }, data: { accessKey } })
  res.json({ accessKey })
})

async function speakerByKey(key: string) {
  const s = await prisma.speaker.findUnique({
    where: { accessKey: key },
    include: { team: { include: { tournament: { select: { id: true, name: true, city: true, status: true, format: true, leagues: true, endDate: true } } } } },
  })
  if (!s) throw forbidden('speaker_link_invalid')
  if (linkExpired(s.team.tournament)) throw forbidden('link_expired')
  return s
}

// the speaker's page by the link: no sign-in needed
speakerLinksRouter.get('/speaker-link/:key', async (req, res) => {
  const s = await speakerByKey(param(req, 'key'))
  const t = s.team.tournament
  const hidden = await hiddenRoundIds(t.id)
  const debates = await prisma.debate.findMany({
    where: {
      round: { tournamentId: t.id, status: { not: 'draft' } },
      OR: [{ propositionTeamId: s.teamId }, { oppositionTeamId: s.teamId }, { closingPropositionTeamId: s.teamId }, { closingOppositionTeamId: s.teamId }],
    },
    include: {
      round: true, proposition: true, opposition: true, closingProposition: true, closingOpposition: true,
      judges: { include: { judge: { select: { name: true } } }, orderBy: { isChair: 'desc' } },
      ballots: { select: { reason: true, judge: { select: { name: true } }, scores: { where: { speakerId: s.id }, select: { score: true, position: true } } } },
    },
    orderBy: { round: { number: 'asc' } },
  })
  if (t.status === 'finished') await ensureCertificates(t.id)
  const certificate = t.status === 'finished' ? await prisma.certificate.findFirst({ where: { speakerId: s.id }, select: { code: true } }) : null
  const names = { proposition: 'proposition', opposition: 'opposition', closingProposition: 'closingProposition', closingOpposition: 'closingOpposition' } as const
  res.json({
    speaker: { id: s.id, name: s.name, position: s.position },
    team: { id: s.team.id, name: s.team.name, ...(s.team.league && { league: leaguesOf(t).find(l => l.key === s.team.league)?.name }) },
    tournament: { id: t.id, name: t.name, city: t.city, status: t.status, format: t.format },
    claimed: !!s.userId,
    // the signed-in visitor's own request, if any: pending, approved or rejected
    ...(req.user && { myClaim: (await prisma.speakerClaim.findUnique({ where: { speakerId_userId: { speakerId: s.id, userId: req.user.id } }, select: { status: true } }))?.status ?? null }),
    ...(certificate && { certificate: certificate.code }),
    debates: debates.map(d => {
      const side = sidesInDebate(d).find(x => x.teamId === s.teamId)!.side
      const teams = { proposition: d.proposition, opposition: d.opposition, closingProposition: d.closingProposition, closingOpposition: d.closingOpposition }
      // results, scores and the judges' reasons once the round is completed (a silent round: after the break)
      const open = d.round.status === 'completed' && !hidden.has(d.roundId)
      const mine = d.ballots.flatMap(b => b.scores.filter(x => x.position <= 3).map(x => Number(x.score)))
      return {
        id: d.id, room: d.room, side: names[side],
        round: { number: d.round.number, name: d.round.name, status: d.round.status, motion: motionFor(d.round, d.proposition.league), date: toDay(d.round.date) },
        opponents: sidesInDebate(d).filter(x => x.side !== side).map(x => teams[x.side]!.name),
        judges: d.judges.map(j => ({ name: j.judge.name, isChair: j.isChair })),
        ...(open && d.winner && {
          result: d.ranking.length ? { place: placeOf(d, side) } : { win: d.winner === side },
          ...(mine.length && { score: Math.round((mine.reduce((a, b) => a + b, 0) / mine.length) * 10) / 10 }),
          reasons: d.ballots.filter(b => b.reason).map(b => ({ judge: b.judge.name, text: b.reason! })),
        }),
      }
    }),
  })
})

// "this is me": the signed-in person asks for the slot; an organizer of the tournament confirms or refuses
speakerLinksRouter.post('/speaker-link/:key/claim', requireAuth(), async (req, res) => {
  const s = await speakerByKey(param(req, 'key'))
  const me = req.user!.id
  if (s.userId === me) return void res.json({ status: 'approved' })
  if (s.userId) throw conflict('speaker_has_account')
  await assertCanClaim(me, s.team.tournament.id)
  const before = await prisma.speakerClaim.findUnique({ where: { speakerId_userId: { speakerId: s.id, userId: me } } })
  if (before?.status === 'rejected') throw forbidden('claim_rejected')
  if (!before) {
    await prisma.speakerClaim.create({ data: { speakerId: s.id, userId: me } })
    background(notify(await organizersOf(s.team.tournament.id), 'organizer.speakerClaim',
      { tournament: s.team.tournament.name, name: req.user!.name, speaker: s.name, team: s.team.name }, `/dashboard/tournaments/${s.team.tournament.id}/teams`))
  }
  res.json({ status: 'pending' })
})

// one person is one speaker of a tournament, and never its judge or organizer as well
async function assertCanClaim(userId: string, tournamentId: string) {
  const role = await participationIn(userId, tournamentId)
  if (role.competitor) throw conflict('already_joined')
  if (role.judge || role.organizer) throw forbidden('conflict_of_interest')
}

// the organizer: the open requests of the tournament
speakerLinksRouter.get('/tournaments/:id/speaker-claims', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const claims = await prisma.speakerClaim.findMany({
    where: { status: 'pending', speaker: { team: { tournamentId: id } } },
    include: { user: { select: { id: true, name: true, institution: true, city: true } }, speaker: { include: { team: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  res.json(claims.map(c => ({
    id: c.id, at: c.createdAt.toISOString(),
    user: { id: c.user.id, name: c.user.name, ...(c.user.institution && { institution: c.user.institution }), ...(c.user.city && { city: c.user.city }) },
    speaker: { id: c.speaker.id, name: c.speaker.name, team: c.speaker.team.name },
  })))
})

// confirm: the slot, its results and certificate go to the person's profile; other requests for it are refused
speakerLinksRouter.post('/speaker-claims/:id/:decision', requireAuth(), async (req, res) => {
  const decision = param(req, 'decision')
  if (decision !== 'approve' && decision !== 'reject') throw notFound()
  const c = await prisma.speakerClaim.findUnique({ where: { id: param(req, 'id') }, include: { speaker: { include: { team: { include: { tournament: { select: { id: true, name: true } } } } } } } })
  if (!c) throw notFound('claim_not_found')
  const t = c.speaker.team.tournament
  await assertCanManage(req.user, t.id)
  if (c.status !== 'pending') throw conflict('claim_decided')
  const decided = { decidedBy: req.user!.name, decidedAt: new Date() }
  if (decision === 'reject') {
    await prisma.speakerClaim.update({ where: { id: c.id }, data: { status: 'rejected', ...decided } })
    background(notify([c.userId], 'participant.claimRejected', { tournament: t.name, speaker: c.speaker.name }))
    return void res.json({ status: 'rejected' })
  }
  if (c.speaker.userId) throw conflict('speaker_has_account')
  await assertCanClaim(c.userId, t.id) // things may have changed since the request (they joined as a judge…)
  const others = await prisma.speakerClaim.findMany({ where: { speakerId: c.speakerId, status: 'pending', id: { not: c.id } }, select: { userId: true } })
  await prisma.$transaction([
    prisma.speaker.update({ where: { id: c.speakerId }, data: { userId: c.userId } }),
    prisma.certificate.updateMany({ where: { speakerId: c.speakerId }, data: { userId: c.userId } }),
    prisma.speakerClaim.update({ where: { id: c.id }, data: { status: 'approved', ...decided } }),
    prisma.speakerClaim.updateMany({ where: { speakerId: c.speakerId, status: 'pending' }, data: { status: 'rejected', ...decided } }),
    // the person's other requests in this tournament: one person is one speaker
    prisma.speakerClaim.updateMany({ where: { userId: c.userId, status: 'pending', speaker: { team: { tournamentId: t.id } } }, data: { status: 'rejected', ...decided } }),
  ])
  background(notify([c.userId], 'participant.claimApproved', { tournament: t.name, speaker: c.speaker.name }, `/tournaments/${t.id}`))
  if (others.length) background(notify(others.map(o => o.userId), 'participant.claimRejected', { tournament: t.name, speaker: c.speaker.name }))
  res.json({ status: 'approved' })
})
