import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fromDay, isRealDay, toDay, todayKz } from '../lib/dates.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { assertCanManage, assertOwner, leaguesOf, motionFor, summaryInclude, teamInclude, toDebate, toSummary, toTeam } from '../services/tournaments.js'
import { generateDraw } from '../services/draw.js'
import { announceBreak, cancelBreak, categoriesOf, MAX_BREAK, validBreak } from '../services/playoffs.js'
import { conflictChecker } from '../services/conflicts.js'
import { institutionIdFor } from '../services/institutions.js'
import { confirmRegistration, fillFromWaitlist, runLottery } from '../services/selection.js'
import { awardCandidates, issueAwardCertificates, setAward } from '../services/awards.js'
import { activeStrikes, giveStrike, LATE_CANCEL_DAYS, STRIKE_LIMIT } from '../services/watchdog.js'
import { REGION_CODES, regionOfCity } from '../lib/regions.js'
import { ensureCertificates } from '../services/certificates.js'
import { background, notifyAdminsNewTournament, notifyRegistration, notifyRoundCompleted, notifyRoundReleased, notifyTournamentFinished, notifyBreakAnnounced, forgetTournamentNotifications } from '../services/notify.js'
import type { Prisma } from '../generated/prisma/client.js'

// video call links: https only (Zoom, Google Meet, Teams…)
const httpsUrl = z.string().trim().url().max(300).refine(u => u.startsWith('https://'), 'https_only')

export const organizerRouter = Router()
// any signed-in user; per-tournament rights are checked with assertCanManage / assertOwner
const org = requireAuth()

export { FREE_TEAM_LIMIT } from '../services/plans.js'
import { assertRoomForTeam, newReference, planFor, platformSettings } from '../services/plans.js'
import multer from 'multer'
import sharp from 'sharp'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FORMAT_CODES, rulesOf, scoringDefaults } from '../services/formats.js'
import { COVER_TEMPLATES, COVERS_DIR, isAllowedCover, removeUploadedCover } from '../services/covers.js'
import { bareMotion } from '../lib/motion.js'
import { sameName } from '../lib/names.js'
export const MAX_PRELIMS = 12 // preliminary rounds a tournament may have
export const ACTIVE_TOURNAMENT_LIMIT = 3 // anti-spam: unfinished tournaments one person may own
const day = z.string().refine(isRealDay, 'invalid_date')

// ---------- tournaments ----------

// tournaments the user owns or co-organizes (admins moderate everything from the admin panel)
organizerRouter.get('/organizer/tournaments', org, async (req, res) => {
  const rows = await prisma.tournament.findMany({
    where: { organizers: { some: { userId: req.user!.id } } },
    include: { ...summaryInclude, organizers: { where: { userId: req.user!.id } } },
    orderBy: { startDate: 'desc' },
  })
  res.json(rows.map(t => ({
    ...toSummary(t), moderation: t.moderation, moderationNote: t.moderationNote ?? undefined, myRole: t.organizers[0]?.role,
    ...(t.abandonedAt && { abandoned: true }),
  })))
})

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(60),
  startDate: day,
  endDate: day,
  level: z.enum(['school', 'university', 'mixed']),
  format: z.enum(FORMAT_CODES).default('WSDC'),
  description: z.string().trim().max(3000).default(''),
  coverUrl: z.string().max(500).refine(isAllowedCover, 'cover').optional(), // a template or an uploaded file
  preliminaryRounds: z.number().int().min(1).max(MAX_PRELIMS),
  breakSize: z.number().int().min(2).max(MAX_BREAK), // checked against the format below (BP: rooms of four)
  // the place: region (when missing, found from the city), city or village, and optionally a district or address
  region: z.enum(REGION_CODES).optional(),
  district: z.string().trim().max(80).optional(),
  venue: z.string().trim().max(160).optional(),
  maxTeams: z.number().int().min(4).max(128),
  registrationOpen: z.boolean().default(true),
  requireApproval: z.boolean().default(true),
  registrationDeadline: day.optional(),
  languages: z.array(z.enum(['ru', 'kz'])).min(1),
  paymentReference: z.string().regex(/^DKZ-[A-Z2-9]{6}$/).optional(), // from GET /plans/quote, for tournaments above the free limit
}).refine(v => v.endDate >= v.startDate, { path: ['endDate'], message: 'end_before_start' })
  .refine(v => !v.registrationDeadline || v.registrationDeadline <= v.startDate, { path: ['registrationDeadline'], message: 'deadline_after_start' })
  // BP playoffs are rooms of four: the smallest break is one final room
  .refine(v => validBreak(v.breakSize, v.format === 'BP'), { path: ['breakSize'], message: 'break_too_small' })

organizerRouter.post('/tournaments', org, requireVerified, async (req, res) => {
  const d = body(req, createSchema)
  const isAdmin = req.user!.role === 'admin'
  // a tournament in the past would be archived by the watchdog at once (and give its owner a strike)
  if (d.startDate < todayKz()) throw badRequest('start_in_past')
  if (!isAdmin) {
    const active = await prisma.tournament.count({
      where: { status: { not: 'finished' }, moderation: { not: 'rejected' }, abandonedAt: null, organizers: { some: { userId: req.user!.id, role: 'owner' } } },
    })
    if (active >= ACTIVE_TOURNAMENT_LIMIT) throw badRequest('tournament_limit_reached')
    // 3 active strikes (abandoned tournaments, last-minute cancellations): no new tournaments until an admin lifts one
    const strikes = await activeStrikes(req.user!.id)
    if (strikes >= STRIKE_LIMIT) throw forbidden('too_many_strikes')
  }
  const pro = planFor(d.maxTeams) === 'pro'
  const start = fromDay(d.startDate), end = fromDay(d.endDate)
  const t = await prisma.tournament.create({
    data: {
      name: d.name, city: d.city, startDate: start, endDate: end, level: d.level, format: d.format, description: d.description,
      coverUrl: d.coverUrl, preliminaryRounds: d.preliminaryRounds, breakSize: d.breakSize, maxTeams: d.maxTeams,
      region: d.region ?? regionOfCity(d.city), district: d.district || null, venue: d.venue || null,
      registrationOpen: d.registrationOpen, requireApproval: d.requireApproval,
      registrationDeadline: d.registrationDeadline ? fromDay(d.registrationDeadline) : null,
      languages: d.languages, organizerName: req.user!.institution ?? req.user!.name,
      // Pro plan is paid offline; admin marks it as paid manually
      plan: pro ? 'pro' : 'free', paid: !pro,
      // new tournaments stay out of the public list until an admin approves them
      moderation: isAdmin ? 'approved' : 'pending',
      organizers: { create: { userId: req.user!.id, role: 'owner' } },
      scoringConfig: { create: scoringDefaults(d.format) }, // the format's score ranges
      rounds: {
        create: Array.from({ length: d.preliminaryRounds }, (_, i) => ({
          number: i + 1, name: `Раунд ${i + 1}`, date: i < Math.ceil(d.preliminaryRounds / 2) ? start : end,
        })),
      },
    },
    include: summaryInclude,
  })
  // a Pro tournament gets its payment at once, with the reference the organizer already saw (and maybe paid with)
  if (pro) {
    const taken = d.paymentReference && await prisma.payment.findUnique({ where: { reference: d.paymentReference } })
    const settings = await platformSettings()
    await prisma.payment.create({ data: { tournamentId: t.id, userId: req.user!.id, amount: settings.proPrice, reference: d.paymentReference && !taken ? d.paymentReference : newReference() } })
  }
  // admins learn that a tournament waits for their review
  background(notifyAdminsNewTournament(t.id))
  res.status(201).json(toSummary(t))
})

organizerRouter.patch('/tournaments/:id', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(3000).optional(),
    visible: z.boolean().optional(),
    registrationOpen: z.boolean().optional(),
    status: z.enum(['registration', 'ongoing', 'finished']).optional(),
    city: z.string().trim().min(2).max(60).optional(),
    region: z.enum(REGION_CODES).optional(),
    district: z.string().trim().max(80).nullable().optional(),
    venue: z.string().trim().max(160).nullable().optional(),
    startDate: day.optional(),
    endDate: day.optional(),
    registrationDeadline: day.nullable().optional(),
    maxTeams: z.number().int().min(4).max(128).optional(),
    rooms: z.array(z.string().trim().min(1).max(60)).max(64).optional(),
    // with leagues: the league each room is for (a room left out is for any league)
    roomLeagues: z.record(z.string().max(60), z.string().max(24)).optional(),
    // extra brackets for groups of teams (novices, juniors…), set before the break
    selectionMode: z.enum(['manual', 'first_come', 'lottery']).optional(),
    clubQuota: z.number().int().min(1).max(32).nullable().optional(),
    breakCategories: z.array(z.object({
      key: z.string().regex(/^[a-z0-9-]{1,24}$/), name: z.string().trim().min(2).max(40), size: z.number().int().min(2).max(MAX_BREAK),
    })).max(3).optional(),
    roomLinks: z.record(z.string().trim().min(1).max(60), httpsUrl).optional(),
    // the number of preliminary rounds and the break: known only once the teams are in, so they change after creating
    preliminaryRounds: z.number().int().min(1).max(MAX_PRELIMS).optional(),
    breakSize: z.number().int().min(2).max(MAX_BREAK).optional(),
    // leagues inside the tournament (a Russian and a Kazakh league): set before the first draw
    leagues: z.array(z.object({ key: z.string().regex(/^[a-z0-9-]{1,24}$/), name: z.string().trim().min(2).max(40) })).max(4).optional(),
    coverUrl: z.string().max(500).refine(isAllowedCover, 'cover').nullable().optional(), // null = back to the default template
  }))
  const cur = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') }, include: { rounds: true, _count: { select: { teams: { where: { swing: false } } } } } })
  if (d.status) await assertStageChange(cur.id, d.status)
  const { startDate, endDate, registrationDeadline, maxTeams, rooms, roomLinks, coverUrl, ...rest } = d
  const data: Prisma.TournamentUpdateInput = { ...rest }

  // dates: a finished tournament is history and stays as it was
  if (startDate || endDate || registrationDeadline !== undefined) {
    if (cur.status === 'finished') throw forbidden('tournament_finished')
    const start = startDate ?? toDay(cur.startDate), end = endDate ?? toDay(cur.endDate)
    const deadline = registrationDeadline === undefined ? (cur.registrationDeadline && toDay(cur.registrationDeadline)) : registrationDeadline
    if (end < start) throw badRequest('end_before_start')
    if (deadline && deadline > start) throw badRequest('deadline_after_start')
    Object.assign(data, { startDate: fromDay(start), endDate: fromDay(end), registrationDeadline: deadline ? fromDay(deadline) : null })
  }
  // team limit: never below the teams already in; crossing the free limit switches the plan (Pro is confirmed by an admin)
  if (maxTeams !== undefined && maxTeams !== cur.maxTeams) {
    if (maxTeams < cur._count.teams) throw badRequest('below_team_count')
    const pro = planFor(maxTeams) === 'pro'
    // a Pro payment confirmed earlier stays valid if the limit goes down and up again
    if (pro && cur.plan === 'free') Object.assign(data, { plan: 'pro', paid: (await prisma.payment.count({ where: { tournamentId: cur.id, status: 'confirmed' } })) > 0 })
    if (!pro && cur.plan === 'pro') Object.assign(data, { plan: 'free', paid: true })
    data.maxTeams = maxTeams
  }
  if (rooms) data.rooms = [...new Set(rooms)]
  if (rest.roomLeagues) {
    const keys = leaguesOf(cur).map(l => l.key)
    if (Object.values(rest.roomLeagues).some(k => !keys.includes(k))) throw badRequest('invalid_league')
    // only rooms of the tournament keep a league
    const names = new Set((data.rooms as string[] | undefined) ?? cur.rooms)
    data.roomLeagues = Object.fromEntries(Object.entries(rest.roomLeagues).filter(([r]) => names.has(r)))
  }
  // a new city without a region: take the city's region
  if (rest.city && !rest.region) data.region = regionOfCity(rest.city) ?? cur.region
  if (rest.district !== undefined) data.district = rest.district || null
  if (rest.venue !== undefined) data.venue = rest.venue || null
  if (rest.breakCategories) {
    if (await prisma.round.count({ where: { tournamentId: cur.id, kind: 'elimination' } })) throw forbidden('break_already_announced')
    if (new Set(rest.breakCategories.map(c => c.key)).size !== rest.breakCategories.length) throw badRequest('invalid_break_categories')
    // BP brackets are rooms of four
    if (rest.breakCategories.some(c => !validBreak(c.size, cur.format === 'BP'))) throw badRequest('break_too_small')
    // a removed category no longer marks any team
    const keys = rest.breakCategories.map(c => c.key)
    const teams = await prisma.team.findMany({ where: { tournamentId: cur.id, NOT: { categories: { isEmpty: true } } }, select: { id: true, categories: true } })
    for (const tm of teams) {
      const left = tm.categories.filter(k => keys.includes(k))
      if (left.length !== tm.categories.length) await prisma.team.update({ where: { id: tm.id }, data: { categories: left } })
    }
  }
  // rounds and break: until the break is announced. A round is added at the end; only a round without a draw is taken away.
  const elimination = cur.rounds.some(r => r.kind === 'elimination')
  const prelims = cur.rounds.filter(r => r.kind === 'preliminary').sort((a, b) => a.number - b.number)
  const addRounds: number[] = [], dropRounds: string[] = []
  if (rest.preliminaryRounds !== undefined && rest.preliminaryRounds !== prelims.length) {
    if (elimination) throw forbidden('break_already_announced')
    if (rest.preliminaryRounds > prelims.length) {
      for (let n = prelims.length + 1; n <= rest.preliminaryRounds; n++) addRounds.push(n)
    } else {
      const extra = prelims.slice(rest.preliminaryRounds)
      const drawn = await prisma.debate.count({ where: { roundId: { in: extra.map(r => r.id) } } })
      if (drawn || extra.some(r => r.status !== 'draft')) throw forbidden('round_already_drawn')
      dropRounds.push(...extra.map(r => r.id))
    }
  }
  if (rest.breakSize !== undefined && rest.breakSize !== cur.breakSize) {
    if (elimination) throw forbidden('break_already_announced')
    if (!validBreak(rest.breakSize, cur.format === 'BP')) throw badRequest('break_too_small')
  }
  if (rest.leagues) {
    const keys = rest.leagues.map(l => l.key)
    if (new Set(keys).size !== keys.length || rest.leagues.length === 1) throw badRequest('invalid_leagues')
    // after a draw the leagues may be renamed, not added or removed (the rooms already keep them apart)
    const before = leaguesOf(cur).map(l => l.key)
    const drawn = await prisma.debate.count({ where: { round: { tournamentId: cur.id } } })
    if (drawn && (before.length !== keys.length || before.some(k => !keys.includes(k)))) throw forbidden('leagues_after_draw')
    // a removed league no longer holds its teams
    await prisma.team.updateMany({ where: { tournamentId: cur.id, league: { notIn: keys } }, data: { league: null } })
  }
  if (roomLinks) data.roomLinks = roomLinks
  if (coverUrl !== undefined && coverUrl !== cur.coverUrl) {
    data.coverUrl = coverUrl
    await removeUploadedCover(cur.coverUrl) // a replaced upload is not kept
  }

  const t = await prisma.$transaction(async tx => {
    // new rounds go on the last day; the removed ones had no draw
    if (dropRounds.length) await tx.round.deleteMany({ where: { id: { in: dropRounds } } })
    for (const n of addRounds) {
      await tx.round.create({ data: { tournamentId: cur.id, number: n, name: `Раунд ${n}`, date: (data.endDate as Date | undefined) ?? cur.endDate } })
    }
    // unreleased rounds follow the new dates (first half on day one, the rest on the last day)
    if (data.startDate || data.endDate) {
      const start = (data.startDate as Date | undefined) ?? cur.startDate, end = (data.endDate as Date | undefined) ?? cur.endDate
      const half = Math.ceil(cur.preliminaryRounds / 2)
      for (const r of cur.rounds.filter(x => x.status === 'draft')) {
        await tx.round.update({ where: { id: r.id }, data: { date: r.number <= half ? start : end } })
      }
    }
    // new dates: the reminders start over; finishing an archived (abandoned) tournament brings it back (the strike stays)
    const watch = {
      ...((data.startDate || data.endDate) && { remindedMotionsAt: null, finishReminders: 0 }),
      ...(d.status === 'finished' && cur.abandonedAt && { abandonedAt: null }),
    }
    return tx.tournament.update({ where: { id: cur.id }, data: { ...data, ...watch }, include: summaryInclude })
  })
  // the results are final: certificates exist at once (profiles, printing and the public QR check all see them)
  // and everyone who took part learns the result and where the certificate is
  if (d.status === 'finished' && cur.status !== 'finished') {
    background(ensureCertificates(cur.id).then(() => issueAwardCertificates(cur.id)).then(() => notifyTournamentFinished(cur.id)))
  }
  // a higher limit, a looser quota or another mode can open places for the waitlist
  if (d.maxTeams !== undefined || d.clubQuota !== undefined || d.selectionMode !== undefined) await fillFromWaitlist(cur.id)
  res.json(toSummary(t))
})

// registration -> ongoing -> finished; going back to registration is allowed until a round is released
const stageMoves: Record<string, string[]> = { registration: ['ongoing'], ongoing: ['registration', 'finished'], finished: [] }

async function assertStageChange(tournamentId: string, to: 'registration' | 'ongoing' | 'finished') {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: { rounds: true, _count: { select: { teams: { where: { swing: false } } } } } })
  if (t.status === to) return
  if (!stageMoves[t.status].includes(to)) throw badRequest('invalid_status_transition')
  if (t.moderation !== 'approved') throw forbidden('not_approved')
  if (to === 'ongoing' && t._count.teams < 2) throw badRequest('not_enough_teams')
  if (to === 'registration' && t.rounds.some(r => r.status !== 'draft')) throw badRequest('rounds_started')
  if (to === 'finished' && t.rounds.some(r => r.status === 'released')) throw badRequest('round_in_progress')
  // once the break is announced the tournament ends with its final: the champion is the winner of the final
  if (to === 'finished' && t.rounds.some(r => r.kind === 'elimination' && r.status !== 'completed')) throw badRequest('playoffs_unfinished')
}

// ---------- the break (playoffs) ----------

// best speaker / best judge: the site's suggestions and the organizer's choice
organizerRouter.get('/tournaments/:id/awards', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  res.json(await awardCandidates(param(req, 'id')))
})

organizerRouter.put('/tournaments/:id/awards', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({ kind: z.enum(['best_speaker', 'best_judge']), personId: z.string().nullable() }))
  const person = await setAward(param(req, 'id'), d.kind, d.personId)
  if (person === undefined) throw badRequest('award_person_not_found')
  res.json({ kind: d.kind, name: person?.name ?? null })
})

// the selection lottery: a public random order of the applications; places go in that order
organizerRouter.post('/tournaments/:id/selection/lottery', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  res.status(201).json(await runLottery(param(req, 'id')))
})

organizerRouter.post('/tournaments/:id/break', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const result = await announceBreak(param(req, 'id'))
  background(notifyBreakAnnounced(param(req, 'id')))
  res.status(201).json(result)
})

organizerRouter.delete('/tournaments/:id/break', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  await cancelBreak(param(req, 'id'))
  res.status(204).end()
})

organizerRouter.delete('/tournaments/:id', org, async (req, res) => {
  await assertOwner(req.user, param(req, 'id'))
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') }, include: { _count: { select: { teams: { where: { swing: false } } } }, organizers: { where: { role: 'owner' } } } })
  // deleting a tournament teams already got places in, less than 3 days before the start (or after it): a strike
  const late = t.status !== 'finished' && t._count.teams > 0
    && fromDay(todayKz()).getTime() >= t.startDate.getTime() - LATE_CANCEL_DAYS * 86_400_000
  await forgetTournamentNotifications(t.id)
  await prisma.tournament.delete({ where: { id: t.id } })
  const owner = t.organizers[0]?.userId
  if (late && owner && req.user!.role !== 'admin') await giveStrike(owner, t, 'late_cancel')
  res.status(204).end()
})

// ---------- teams ----------

const teamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  institution: z.string().trim().min(2).max(150),
  city: z.string().trim().max(60).optional(),
  speakers: z.array(z.string().trim().min(3).max(100)).min(1).max(3), // the tournament's format says how many (LD: one)
  league: z.string().max(24).nullable().optional(),
})

// with leagues, every team names one of them; without, none
function leagueFor(t: { leagues: unknown }, league?: string | null) {
  const keys = leaguesOf(t).map(l => l.key)
  if (!keys.length) return null
  if (!league) throw badRequest('league_required')
  if (!keys.includes(league)) throw badRequest('invalid_league')
  return league
}

// a team has exactly as many speakers as the tournament's format needs
export function assertSpeakers(format: string, speakers: string[]) {
  const need = rulesOf(format).speakers
  if (speakers.length !== need) throw badRequest('wrong_speaker_count', { need })
}

const institutionId = institutionIdFor

organizerRouter.post('/tournaments/:id/teams', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, teamSchema)
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') }, include: { _count: { select: { teams: { where: { swing: false } } } } } })
  assertSpeakers(t.format, d.speakers)
  if (t._count.teams >= t.maxTeams) throw badRequest('tournament_full')
  assertRoomForTeam(t, t._count.teams)
  if (await prisma.team.findUnique({ where: { tournamentId_name: { tournamentId: t.id, name: d.name } } })) throw conflict('team_name_taken')
  const team = await prisma.team.create({
    data: {
      tournamentId: t.id, name: d.name, city: d.city, institutionId: await institutionId(d.institution, t.level), league: leagueFor(t, d.league),
      speakers: { create: d.speakers.map((name, i) => ({ name, position: i + 1 })) },
    },
    include: teamInclude,
  })
  res.status(201).json(toTeam(team))
})

// Judges by name, without accounts (a tournament run on paper): the owner enters their ballots for them ("as" a judge),
// and a judge can still be linked to an account later by email. Names already in the tournament are skipped.
organizerRouter.post('/tournaments/:id/judges/bulk', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({ names: z.array(z.string().trim().min(3).max(100)).min(1).max(100), league: z.string().max(24).nullable().optional() }))
  const id = param(req, 'id')
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id }, select: { leagues: true } })
  if (d.league && !leaguesOf(t).some(l => l.key === d.league)) throw badRequest('invalid_league')
  const have = new Set((await prisma.judge.findMany({ where: { tournamentId: id }, select: { name: true } })).map(j => j.name.toLowerCase()))
  const names = [...new Map(d.names.map(n => [n.toLowerCase(), n])).values()].filter(n => !have.has(n.toLowerCase()))
  // each judge gets a personal link at once: no account is needed to judge
  await prisma.judge.createMany({ data: names.map(name => ({ tournamentId: id, name, league: d.league ?? null, accessKey: randomBytes(18).toString('base64url') })) })
  res.status(201).json({ created: names.length, skipped: d.names.length - names.length })
})

// Many teams at once, by name (one per line): for a tournament whose teams have no accounts. Each gets placeholder
// speakers ("Speaker 1"…) to rename at the registration desk; names already in the tournament are skipped.
organizerRouter.post('/tournaments/:id/teams/bulk', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({
    names: z.array(z.string().trim().min(2).max(60)).min(1).max(128),
    institution: z.string().trim().min(2).max(150).optional(),
    league: z.string().max(24).nullable().optional(),
  }))
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') }, include: { teams: { select: { name: true, swing: true } } } })
  const league = leagueFor(t, d.league)
  const taken = new Set(t.teams.map(x => x.name.toLowerCase()))
  const names = [...new Map(d.names.map(n => [n.toLowerCase(), n])).values()].filter(n => !taken.has(n.toLowerCase()))
  const count = t.teams.filter(x => !x.swing).length
  if (count + names.length > t.maxTeams) throw badRequest('tournament_full')
  assertRoomForTeam(t, count + names.length - 1)
  const speakers = rulesOf(t.format).speakers
  const inst = d.institution ? await institutionId(d.institution, t.level) : null
  const created = await prisma.$transaction(names.map(name => prisma.team.create({
    data: { tournamentId: t.id, name, league, institutionId: inst, speakers: { create: Array.from({ length: speakers }, (_, i) => ({ name: `Спикер ${i + 1}`, position: i + 1 })) } },
    include: teamInclude,
  })))
  res.status(201).json({ created: created.map(toTeam), skipped: d.names.length - names.length })
})

organizerRouter.patch('/teams/:teamId', org, async (req, res) => {
  const existing = await prisma.team.findUnique({ where: { id: param(req, 'teamId') }, include: { tournament: true, speakers: { orderBy: { position: 'asc' } } } })
  if (!existing) throw notFound('team_not_found')
  await assertCanManage(req.user, existing.tournamentId)
  const d = body(req, teamSchema)
  assertSpeakers(existing.tournament.format, d.speakers)
  const team = await prisma.$transaction(async tx => {
    // a slot whose name really changed is another person now: the old account is unlinked (its career keeps clean)
    await Promise.all(existing.speakers.map((s, i) => tx.speaker.update({
      where: { id: s.id }, data: { name: d.speakers[i], ...(!sameName(s.name, d.speakers[i]) && { userId: null }) },
    })))
    // the team's application follows its new name (the captain's check-in and their cabinet find the team by it)
    if (d.name !== existing.name) {
      await tx.teamRegistration.updateMany({ where: { tournamentId: existing.tournamentId, teamName: existing.name }, data: { teamName: d.name } })
    }
    // the league of a team that has played stays (its rounds were paired inside it)
    const league = leagueFor(existing.tournament, d.league ?? existing.league)
    if (league !== existing.league && await tx.debate.count({ where: { OR: [{ propositionTeamId: existing.id }, { oppositionTeamId: existing.id }, { closingPropositionTeamId: existing.id }, { closingOppositionTeamId: existing.id }] } })) {
      throw forbidden('team_in_draw')
    }
    return tx.team.update({
      where: { id: existing.id },
      data: { name: d.name, city: d.city, institutionId: await institutionId(d.institution, existing.tournament.level), league },
      include: teamInclude,
    })
  })
  res.json(toTeam(team))
})

// a withdrawn team comes back
organizerRouter.post('/teams/:teamId/return', org, async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: param(req, 'teamId') } })
  if (!team) throw notFound('team_not_found')
  await assertCanManage(req.user, team.tournamentId)
  await prisma.team.update({ where: { id: team.id }, data: { withdrawnAt: null } })
  res.status(204).end()
})

// ---- a technical loss: a team did not come, the other side wins without ballots ----
organizerRouter.post('/debates/:debateId/forfeit', org, async (req, res) => {
  const debate = await prisma.debate.findUnique({ where: { id: param(req, 'debateId') }, include: { round: { include: { tournament: { select: { format: true } } } } } })
  if (!debate) throw notFound('debate_not_found')
  await assertCanManage(req.user, debate.round.tournamentId)
  if (debate.round.status === 'completed') throw forbidden('round_completed')
  if (debate.round.status === 'draft') throw badRequest('round_not_released')
  if (debate.closingPropositionTeamId) throw badRequest('forfeit_two_teams_only')
  const { side } = body(req, z.object({ side: z.enum(['proposition', 'opposition']).nullable() }))
  if (side === null) {
    // undo: the debate waits for its ballots again
    if (!debate.forfeit) return void res.json({ ok: true })
    await prisma.debate.update({ where: { id: debate.id }, data: { forfeit: null, winner: null, ballotStatus: 'pending' } })
    return void res.json({ ok: true })
  }
  if (await prisma.ballot.count({ where: { debateId: debate.id } })) throw forbidden('ballots_already_submitted')
  await prisma.debate.update({ where: { id: debate.id }, data: { forfeit: side, winner: side === 'proposition' ? 'opposition' : 'proposition', ballotStatus: 'confirmed' } })
  res.json({ ok: true })
})

// which break categories a team may break in (novices, juniors…): the whole list is replaced
organizerRouter.put('/teams/:teamId/categories', org, async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: param(req, 'teamId') }, include: { tournament: { select: { breakCategories: true, rounds: { select: { kind: true } } } } } })
  if (!team) throw notFound('team_not_found')
  await assertCanManage(req.user, team.tournamentId)
  if (team.tournament.rounds.some(r => r.kind === 'elimination')) throw forbidden('break_already_announced')
  const { categories } = body(req, z.object({ categories: z.array(z.string()).max(3) }))
  const known = new Set(categoriesOf(team.tournament).map(c => c.key))
  if (categories.some(k => !known.has(k))) throw badRequest('invalid_break_categories')
  const updated = await prisma.team.update({ where: { id: team.id }, data: { categories: [...new Set(categories)] }, include: teamInclude })
  res.json({ ...toTeam(updated), categories: updated.categories })
})

organizerRouter.delete('/teams/:teamId', org, async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: param(req, 'teamId') } })
  if (!team) throw notFound('team_not_found')
  await assertCanManage(req.user, team.tournamentId)
  const played = await prisma.debate.count({ where: { OR: [{ propositionTeamId: team.id }, { oppositionTeamId: team.id }, { closingPropositionTeamId: team.id }, { closingOppositionTeamId: team.id }] } })
  // a team already in a draw is withdrawn: its rounds and results stay, the next draws leave it out
  if (played) {
    await prisma.team.update({ where: { id: team.id }, data: { withdrawnAt: new Date(), checkedInAt: null } })
    return void res.json({ withdrawn: true })
  }
  await prisma.team.delete({ where: { id: team.id } })
  // the team's application no longer holds a place; the waitlist moves up
  await prisma.teamRegistration.updateMany({ where: { tournamentId: team.tournamentId, teamName: team.name, status: 'confirmed' }, data: { status: 'rejected' } })
  await fillFromWaitlist(team.tournamentId)
  res.status(204).end()
})

// ---------- judges ----------

// Judges join only through an invite (a link or an email) and judge from their own account: a ballot is theirs alone.
// A judge added earlier without an account is linked to one by an email invite (see routes/invites.ts).

// what speakers said about the judges: average, count and every comment with its round and team (organizers only)
organizerRouter.get('/tournaments/:id/judge-feedback', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const rows = await prisma.judgeFeedback.findMany({
    where: { judge: { tournamentId: param(req, 'id') } },
    include: { team: { select: { name: true } }, debate: { select: { room: true, round: { select: { number: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  const byJudge = new Map<string, typeof rows>()
  for (const r of rows) byJudge.set(r.judgeId, [...(byJudge.get(r.judgeId) ?? []), r])
  res.json([...byJudge].map(([judgeId, list]) => ({
    judgeId, count: list.length,
    average: Math.round((list.reduce((s, x) => s + x.score, 0) / list.length) * 10) / 10,
    items: list.map(x => ({ score: x.score, comment: x.comment ?? undefined, team: x.team.name, round: x.debate.round.name, room: x.debate.room, createdAt: x.createdAt.toISOString() })),
  })))
})

// personal conflicts of a judge (relative, former coach…): the whole list is replaced
organizerRouter.put('/judges/:judgeId/conflicts', org, async (req, res) => {
  const judge = await prisma.judge.findUnique({ where: { id: param(req, 'judgeId') } })
  if (!judge) throw notFound('judge_not_found')
  await assertCanManage(req.user, judge.tournamentId)
  const { teamIds } = body(req, z.object({ teamIds: z.array(z.string()).max(128) }))
  const ids = [...new Set(teamIds)]
  const valid = await prisma.team.count({ where: { id: { in: ids }, tournamentId: judge.tournamentId, swing: false } })
  if (valid !== ids.length) throw badRequest('invalid_team')
  await prisma.$transaction([
    prisma.judgeConflict.deleteMany({ where: { judgeId: judge.id } }),
    prisma.judgeConflict.createMany({ data: ids.map(teamId => ({ judgeId: judge.id, teamId })) }),
  ])
  res.json({ judgeId: judge.id, teamIds: ids })
})

// a judge's league (with leagues: the judge only sits in that league's rooms; null = any league)
organizerRouter.patch('/judges/:judgeId', org, async (req, res) => {
  const judge = await prisma.judge.findUnique({ where: { id: param(req, 'judgeId') }, include: { tournament: { select: { leagues: true } } } })
  if (!judge) throw notFound('judge_not_found')
  await assertCanManage(req.user, judge.tournamentId)
  const { league } = body(req, z.object({ league: z.string().max(24).nullable() }))
  if (league && !leaguesOf(judge.tournament).some(l => l.key === league)) throw badRequest('invalid_league')
  await prisma.judge.update({ where: { id: judge.id }, data: { league } })
  res.json({ id: judge.id, league })
})

// a judge's personal link (no account needed): a new one each time, the old one stops working
organizerRouter.post('/judges/:judgeId/link', org, async (req, res) => {
  const judge = await prisma.judge.findUnique({ where: { id: param(req, 'judgeId') } })
  if (!judge) throw notFound('judge_not_found')
  await assertCanManage(req.user, judge.tournamentId)
  const accessKey = randomBytes(18).toString('base64url')
  await prisma.judge.update({ where: { id: judge.id }, data: { accessKey } })
  res.json({ accessKey })
})

// A judge who left: with no ballot sent the judge is deleted; with ballots sent the judge is marked as left, so the
// results stay. Either way the judge leaves every room of a round that is not completed and has no ballot of theirs;
// a chair's place goes to a wing of the room.
organizerRouter.delete('/judges/:judgeId', org, async (req, res) => {
  const judge = await prisma.judge.findUnique({ where: { id: param(req, 'judgeId') } })
  if (!judge) throw notFound('judge_not_found')
  await assertCanManage(req.user, judge.tournamentId)
  const sent = await prisma.ballot.count({ where: { judgeId: judge.id } })
  await prisma.$transaction(async tx => {
    const seats = await tx.debateJudge.findMany({ where: { judgeId: judge.id, debate: { round: { status: { not: 'completed' } }, ballots: { none: { judgeId: judge.id } } } } })
    for (const seat of seats) await leaveRoom(tx, seat.debateId, judge.id, seat.isChair)
    if (sent) await tx.judge.update({ where: { id: judge.id }, data: { leftAt: new Date() } })
    else await tx.judge.delete({ where: { id: judge.id } })
  })
  res.json({ left: sent > 0 })
})

// a judge who left comes back
organizerRouter.post('/judges/:judgeId/return', org, async (req, res) => {
  const judge = await prisma.judge.findUnique({ where: { id: param(req, 'judgeId') } })
  if (!judge) throw notFound('judge_not_found')
  await assertCanManage(req.user, judge.tournamentId)
  await prisma.judge.update({ where: { id: judge.id }, data: { leftAt: null } })
  res.status(204).end()
})

// a judge leaves one room; if they chaired it, its first wing takes the chair
async function leaveRoom(tx: Prisma.TransactionClient, debateId: string, judgeId: string, wasChair: boolean) {
  await tx.debateJudge.delete({ where: { debateId_judgeId: { debateId, judgeId } } })
  if (wasChair) {
    const wing = await tx.debateJudge.findFirst({ where: { debateId }, orderBy: { judgeId: 'asc' } })
    if (wing) await tx.debateJudge.update({ where: { debateId_judgeId: { debateId, judgeId: wing.judgeId } }, data: { isChair: true } })
  }
}

// ---------- rounds & draw ----------

const nextStatus = { draft: 'released', released: 'completed' } as const

organizerRouter.patch('/rounds/:roundId', org, async (req, res) => {
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') }, include: { debates: true } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  const d = body(req, z.object({
    motion: z.string().trim().max(500).transform(bareMotion).optional(),
    infoSlide: z.string().trim().max(2000).optional(),
    // with leagues: each league's own motion and info slide
    leagueMotions: z.record(z.string().max(24), z.object({ motion: z.string().trim().max(500).transform(bareMotion), infoSlide: z.string().trim().max(2000).optional() })).optional(),
    status: z.enum(['released', 'completed']).optional(),
    silent: z.boolean().optional(), // closed round: results hidden from the public until the break
  }))
  if (d.silent !== undefined && round.kind !== 'preliminary') throw badRequest('playoff_round_not_silent')
  if (round.status === 'completed' && (d.motion !== undefined || d.infoSlide !== undefined || d.leagueMotions !== undefined)) throw forbidden('round_completed')
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: round.tournamentId }, select: { leagues: true } })
  const leagueKeys = leaguesOf(t).map(l => l.key)
  if (d.leagueMotions && Object.keys(d.leagueMotions).some(k => !leagueKeys.includes(k))) throw badRequest('invalid_league')
  if (d.status) {
    if (nextStatus[round.status as keyof typeof nextStatus] !== d.status) throw badRequest('invalid_status_transition')
    // every league needs a motion (its own, or the round's)
    const next = { motion: d.motion ?? round.motion, leagueMotions: d.leagueMotions ?? round.leagueMotions }
    const missing = leagueKeys.length ? leagueKeys.some(k => !motionFor(next, k).trim()) : !next.motion.trim()
    if (d.status === 'released' && (missing || round.debates.length === 0)) throw badRequest('need_motion_and_draw')
    if (d.status === 'completed' && round.debates.some(x => !x.winner)) throw badRequest('ballots_missing')
  }
  const updated = await prisma.$transaction(async tx => {
    // completing a round locks all its ballots
    if (d.status === 'completed') await tx.debate.updateMany({ where: { roundId: round.id }, data: { ballotStatus: 'confirmed' } })
    // an emptied info slide is removed
    return tx.round.update({ where: { id: round.id }, data: { ...d, ...(d.infoSlide !== undefined && { infoSlide: d.infoSlide || null }) } })
  })
  // participants and judges learn their rooms in Telegram
  if (d.status === 'released') background(notifyRoundReleased(round.id))
  if (d.status === 'completed') background(notifyRoundCompleted(round.id))
  res.json({ ...updated, date: toDay(updated.date), infoSlide: updated.infoSlide ?? undefined })
})

organizerRouter.post('/rounds/:roundId/draw', org, async (req, res) => {
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  const opts = body(req, z.object({
    presentOnly: z.boolean().optional(), addSwing: z.boolean().optional(),
    method: z.enum(['power', 'high_low', 'random', 'slide', 'fold', 'round_robin']).optional(), protectClubs: z.boolean().optional(),
  }).default({}))
  const report = await generateDraw(round.id, opts)
  // the next round starts from these settings (the club rule only when it was set by hand, its default follows the round)
  if (round.kind === 'preliminary') await prisma.tournament.update({ where: { id: round.tournamentId }, data: { drawOptions: opts } })
  const debates = await prisma.debate.findMany({ where: { roundId: round.id }, include: { judges: { orderBy: { isChair: 'desc' } } }, orderBy: { room: 'asc' } })
  // the report tells the organizer which wishes could not be met (same-club meetings, rematches)
  res.status(201).json({
    debates: debates.map(x => toDebate(x, true)),
    report,
  })
})

organizerRouter.patch('/debates/:debateId', org, async (req, res) => {
  const debate = await prisma.debate.findUnique({ where: { id: param(req, 'debateId') }, include: { round: true, judges: true } })
  if (!debate) throw notFound('debate_not_found')
  await assertCanManage(req.user, debate.round.tournamentId)
  if (debate.round.status === 'completed') throw forbidden('round_completed')
  const d = body(req, z.object({
    room: z.string().trim().min(1).max(60).optional(),
    onlineUrl: httpsUrl.nullable().optional(), // null removes the link
    swapSides: z.boolean().optional(),
    chairJudgeId: z.string().optional(),
    wingJudgeIds: z.array(z.string()).max(4).optional(), // the non-chair panel, replaced as a whole
  }))
  // a judge with a conflict (institution, club, personal) never sits in this room
  const newJudges = [...(d.chairJudgeId ? [d.chairJudgeId] : []), ...(d.wingJudgeIds ?? [])]
  if (newJudges.length) {
    const clash = await conflictChecker(debate.round.tournamentId)
    const room = [debate.propositionTeamId, debate.oppositionTeamId, debate.closingPropositionTeamId, debate.closingOppositionTeamId].filter((x): x is string => !!x)
    const bad = newJudges.find(id => clash(id, room))
    if (bad) throw badRequest('judge_conflict', { judgeId: bad })
  }
  await prisma.$transaction(async tx => {
    // a new room brings its own online link (from the tournament's room links) unless a link is given explicitly
    if (d.room) {
      const links = (await tx.tournament.findUniqueOrThrow({ where: { id: debate.round.tournamentId }, select: { roomLinks: true } })).roomLinks as Record<string, string>
      await tx.debate.update({ where: { id: debate.id }, data: { room: d.room, onlineUrl: links[d.room] ?? null } })
    }
    if (d.onlineUrl !== undefined) await tx.debate.update({ where: { id: debate.id }, data: { onlineUrl: d.onlineUrl } })
    if (d.swapSides) {
      if (await tx.ballot.count({ where: { debateId: debate.id } })) throw forbidden('ballots_already_submitted')
      // BP: government and opposition swap in both halves of the room
      await tx.debate.update({
        where: { id: debate.id },
        data: {
          propositionTeamId: debate.oppositionTeamId, oppositionTeamId: debate.propositionTeamId,
          closingPropositionTeamId: debate.closingOppositionTeamId, closingOppositionTeamId: debate.closingPropositionTeamId,
        },
      })
    }
    if (d.chairJudgeId) {
      const judge = await tx.judge.findUnique({ where: { id: d.chairJudgeId } })
      if (!judge || judge.tournamentId !== debate.round.tournamentId) throw badRequest('invalid_judge')
      // a judge sits in one room per round: one already in another room moves here, and this room's chair takes their
      // place there (the rooms swap judges), unless that judge has already sent a ballot there
      const busy = await tx.debateJudge.findFirst({ where: { judgeId: judge.id, debate: { roundId: debate.roundId, id: { not: debate.id } } } })
      if (busy) {
        if (await tx.ballot.count({ where: { debateId: busy.debateId, judgeId: judge.id } })) throw conflict('judge_busy_in_round')
        await tx.debateJudge.delete({ where: { debateId_judgeId: { debateId: busy.debateId, judgeId: judge.id } } })
        const oldChair = debate.judges.find(j => j.isChair)
        if (oldChair && oldChair.judgeId !== judge.id && !await tx.debateJudge.findUnique({ where: { debateId_judgeId: { debateId: busy.debateId, judgeId: oldChair.judgeId } } })) {
          await tx.debateJudge.create({ data: { debateId: busy.debateId, judgeId: oldChair.judgeId, isChair: busy.isChair } })
        } else if (busy.isChair) {
          const wing = await tx.debateJudge.findFirst({ where: { debateId: busy.debateId } })
          if (wing) await tx.debateJudge.update({ where: { debateId_judgeId: { debateId: busy.debateId, judgeId: wing.judgeId } }, data: { isChair: true } })
        }
      }
      await tx.debateJudge.updateMany({ where: { debateId: debate.id }, data: { isChair: false } })
      await tx.debateJudge.deleteMany({ where: { debateId: debate.id, judgeId: judge.id } })
      const oldChair = debate.judges.find(j => j.isChair)
      if (oldChair && oldChair.judgeId !== judge.id) await tx.debateJudge.deleteMany({ where: { debateId: debate.id, judgeId: oldChair.judgeId } })
      await tx.debateJudge.create({ data: { debateId: debate.id, judgeId: judge.id, isChair: true } })
    }
    if (d.wingJudgeIds) {
      if (await tx.ballot.count({ where: { debateId: debate.id } })) throw forbidden('ballots_already_submitted')
      const wings = [...new Set(d.wingJudgeIds)]
      const chair = await tx.debateJudge.findFirst({ where: { debateId: debate.id, isChair: true } })
      if (chair && wings.includes(chair.judgeId)) throw badRequest('invalid_judge')
      const valid = await tx.judge.count({ where: { id: { in: wings }, tournamentId: debate.round.tournamentId } })
      if (valid !== wings.length) throw badRequest('invalid_judge')
      // wings already in another room move here (unless they sent a ballot there)
      const busy = await tx.debateJudge.findMany({ where: { judgeId: { in: wings }, debate: { roundId: debate.roundId, id: { not: debate.id } } } })
      for (const b of busy) {
        if (await tx.ballot.count({ where: { debateId: b.debateId, judgeId: b.judgeId } })) throw conflict('judge_busy_in_round')
        await leaveRoom(tx, b.debateId, b.judgeId, b.isChair)
      }
      await tx.debateJudge.deleteMany({ where: { debateId: debate.id, isChair: false } })
      if (wings.length) await tx.debateJudge.createMany({ data: wings.map(judgeId => ({ debateId: debate.id, judgeId, isChair: false })) })
    }
  })
  const x = await prisma.debate.findUniqueOrThrow({ where: { id: debate.id }, include: { judges: { orderBy: { isChair: 'desc' } } } })
  res.json(toDebate(x, true))
})

// ---------- registrations ----------

organizerRouter.get('/tournaments/:id/registrations', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const regs = await prisma.teamRegistration.findMany({
    where: { tournamentId: param(req, 'id') }, include: { user: true },
    orderBy: [{ lotteryRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })
  // the club of each application (for the per-club quota)
  const clubs = new Map((await prisma.club.findMany({ where: { id: { in: regs.flatMap(r => (r.clubId ? [r.clubId] : [])) } }, select: { id: true, name: true } })).map(c => [c.id, c.name]))
  res.json(regs.map(r => ({
    id: r.id, tournamentId: r.tournamentId, teamName: r.teamName, institution: r.institution, speakers: r.speakers,
    contactPhone: r.contactPhone, status: r.status, createdAt: toDay(r.createdAt), user: { id: r.user.id, name: r.user.name, email: r.user.email },
    ...(r.clubId && clubs.has(r.clubId) && { club: clubs.get(r.clubId) }), ...(r.lotteryRank && { lotteryRank: r.lotteryRank }),
  })))
})

// confirming a registration creates the team; the registering participant is linked to their speaker slot
organizerRouter.patch('/registrations/:regId', org, async (req, res) => {
  const reg = await prisma.teamRegistration.findUnique({ where: { id: param(req, 'regId') }, include: { tournament: { include: { _count: { select: { teams: { where: { swing: false } } } } } }, user: true } })
  if (!reg) throw notFound('registration_not_found')
  await assertCanManage(req.user, reg.tournamentId)
  const { status } = body(req, z.object({ status: z.enum(['confirmed', 'rejected', 'waitlisted']) }))
  // a waiting application can still be confirmed, rejected or kept waiting
  if (reg.status !== 'pending' && reg.status !== 'waitlisted') throw badRequest('already_processed')
  if (status === 'confirmed') {
    await confirmRegistration(reg.id)
    return void res.json({ id: reg.id, status })
  }
  if (status === 'waitlisted' || status === 'rejected') {
    await prisma.teamRegistration.update({ where: { id: reg.id }, data: { status } })
    background(notifyRegistration(reg.id))
    return void res.json({ id: reg.id, status })
  }
})

// ---------- tournament cover ----------

organizerRouter.get('/tournament-covers', (_req, res) => {
  res.json(COVER_TEMPLATES)
})

// the organizer's own picture: decoded and re-encoded by sharp (no metadata), 1600×800 WebP
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 }, fileFilter: (_req, f, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(f.mimetype)) })
organizerRouter.post('/tournaments/:id/cover', org, coverUpload.single('cover'), async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  if (!req.file) throw badRequest('invalid_image')
  let webp: Buffer
  try {
    webp = await sharp(req.file.buffer, { limitInputPixels: 60_000_000 }).rotate().resize(1600, 800, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toBuffer()
  } catch {
    throw badRequest('invalid_image')
  }
  const file = `${id}-${randomBytes(6).toString('hex')}.webp`
  await writeFile(path.join(COVERS_DIR, file), webp)
  const cur = await prisma.tournament.findUniqueOrThrow({ where: { id } })
  await prisma.tournament.update({ where: { id }, data: { coverUrl: `/uploads/covers/${file}` } })
  await removeUploadedCover(cur.coverUrl)
  res.json({ cover: `/uploads/covers/${file}` })
})

// ---------- schedule ----------
// The organizer writes the programme (day of the tournament, time, what happens); it is shown on the public page.
organizerRouter.put('/tournaments/:id/schedule', org, async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const { items } = body(req, z.object({
    items: z.array(z.object({
      day: z.number().int().min(1).max(14),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      title: z.string().trim().min(2).max(120),
    })).max(60),
  }))
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id } })
  const days = Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86_400_000) + 1
  if (items.some(i => i.day > days)) throw badRequest('schedule_day_outside')
  await prisma.$transaction([
    prisma.scheduleItem.deleteMany({ where: { tournamentId: id } }),
    prisma.scheduleItem.createMany({ data: items.map(i => ({ ...i, tournamentId: id })) }),
  ])
  const saved = await prisma.scheduleItem.findMany({ where: { tournamentId: id }, orderBy: [{ day: 'asc' }, { time: 'asc' }] })
  res.json(saved.map(s => ({ day: s.day, time: s.time, title: s.title })))
})
