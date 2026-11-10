import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fromDay, isRealDay, toDay, todayKz } from '../lib/dates.js'
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { assertCanManage, assertOwner, leaguesOf, motionFor, summaryInclude, teamInclude, toDebate, toSummary, toTeam } from '../services/tournaments.js'
import { generateDraw } from '../services/draw.js'
import { announceBreak, cancelBreak, categoriesOf, MAX_BREAK, validBreak } from '../services/playoffs.js'
import { conflictChecker } from '../services/conflicts.js'
import { swingTeamFor } from '../services/draw.js'
import { withLock } from '../lib/lock.js'
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
import { FORMAT_CODES, isBP, rulesOf, scoringDefaults } from '../services/formats.js'
import { COVER_TEMPLATES, COVERS_DIR, isAllowedCover, removeUploadedCover } from '../services/covers.js'
import { bareMotion } from '../lib/motion.js'
import { personName, sameName } from '../lib/names.js'
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
  // open: teams apply with accounts and the results count in the rating; local: the organizer enters the teams
  kind: z.enum(['open', 'local']).default('local'),
  registrationUrl: httpsUrl.optional(), // local only: a Google Form or another sign-up page
}).refine(v => v.endDate >= v.startDate, { path: ['endDate'], message: 'end_before_start' })
  .refine(v => !v.registrationDeadline || v.registrationDeadline <= v.startDate, { path: ['registrationDeadline'], message: 'deadline_after_start' })
  .refine(v => v.kind === 'local' || !v.registrationUrl, { path: ['registrationUrl'], message: 'registration_url_local_only' })
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
      kind: d.kind, registrationUrl: d.registrationUrl ?? null,
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
    // reply speeches on or off: before the first ballot, so every debate of the tournament is scored the same way
    replySpeeches: z.boolean().optional(),
    // the score ranges (a league that scores 50–80, not 60–80): before the first ballot, like the reply speeches
    scoring: z.object({
      speakerMin: z.number().min(0).max(100), speakerMax: z.number().min(1).max(100),
      replyMin: z.number().min(0).max(100).optional(), replyMax: z.number().min(1).max(100).optional(),
    }).optional(),
    // the kind: only while the tournament has no teams and no applications (else the rating would mix both)
    kind: z.enum(['open', 'local']).optional(),
    registrationUrl: httpsUrl.nullable().optional(), // null removes it
    // leagues inside the tournament (a Russian and a Kazakh league): set before the first draw
    leagues: z.array(z.object({ key: z.string().regex(/^[a-z0-9-]{1,24}$/), name: z.string().trim().min(2).max(40), breakSize: z.number().int().min(2).max(MAX_BREAK).optional(), language: z.enum(['kz', 'ru', 'en']).optional() })).max(4).optional(),
    coverUrl: z.string().max(500).refine(isAllowedCover, 'cover').nullable().optional(), // null = back to the default template
  }))
  const cur = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') }, include: { rounds: true, _count: { select: { teams: { where: { swing: false } } } } } })
  if (d.status) await assertStageChange(cur.id, d.status)
  const { startDate, endDate, registrationDeadline, maxTeams, rooms, roomLinks, coverUrl, scoring, ...rest } = d
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
  if (scoring) {
    const sc = scoring
    if (sc.speakerMin >= sc.speakerMax || (sc.replyMin !== undefined && sc.replyMax !== undefined && sc.replyMin >= sc.replyMax)) throw badRequest('invalid_score_range')
    const cfg = await prisma.scoringConfig.findUnique({ where: { tournamentId: cur.id } }) ?? await prisma.scoringConfig.create({ data: { tournamentId: cur.id, ...scoringDefaults(cur.format) } })
    const step = Number(cfg.step), onStep = (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9
    if (![sc.speakerMin, sc.speakerMax, sc.replyMin, sc.replyMax].every(v => v === undefined || onStep(v))) throw badRequest('score_off_step', { step })
    const changed = Number(cfg.speakerMin) !== sc.speakerMin || Number(cfg.speakerMax) !== sc.speakerMax
      || (sc.replyMin !== undefined && Number(cfg.replyMin) !== sc.replyMin) || (sc.replyMax !== undefined && Number(cfg.replyMax) !== sc.replyMax)
    if (changed && await prisma.ballot.count({ where: { debate: { round: { tournamentId: cur.id } } } })) throw forbidden('ballots_already_sent')
    if (changed) await prisma.scoringConfig.update({ where: { tournamentId: cur.id }, data: { speakerMin: sc.speakerMin, speakerMax: sc.speakerMax, ...(sc.replyMin !== undefined && { replyMin: sc.replyMin }), ...(sc.replyMax !== undefined && { replyMax: sc.replyMax }) } })
  }
  if (rest.replySpeeches !== undefined && rest.replySpeeches !== cur.replySpeeches) {
    if (!rulesOf(cur.format).reply) throw badRequest('format_has_no_replies')
    if (await prisma.ballot.count({ where: { debate: { round: { tournamentId: cur.id } } } })) throw forbidden('ballots_already_sent')
  }
  if (rest.kind !== undefined && rest.kind !== cur.kind) {
    if (cur._count.teams || await prisma.teamRegistration.count({ where: { tournamentId: cur.id } })) throw forbidden('kind_after_teams')
    if (rest.kind === 'open') data.registrationUrl = null
  }
  if (rest.registrationUrl && (rest.kind ?? cur.kind) !== 'local') throw badRequest('registration_url_local_only')
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
  if (d.maxTeams !== undefined || d.clubQuota !== undefined || d.selectionMode !== undefined) await withLock(`places:${cur.id}`, () => fillFromWaitlist(cur.id))
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
  const d = body(req, z.object({ kind: z.enum(['best_speaker', 'best_judge']), personId: z.string().nullable(), league: z.string().max(24).nullable().optional() }))
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') }, select: { leagues: true } })
  // with leagues every award belongs to a league
  const keys = leaguesOf(t).map(l => l.key)
  if (keys.length ? !d.league || !keys.includes(d.league) : d.league) throw badRequest('invalid_league')
  const person = await setAward(param(req, 'id'), d.kind, d.personId, d.league ?? null)
  if (person === undefined) throw badRequest('award_person_not_found')
  res.json({ kind: d.kind, league: d.league ?? null, name: person?.name ?? null })
})

// the selection lottery: a public random order of the applications; places go in that order
organizerRouter.post('/tournaments/:id/selection/lottery', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  res.status(201).json(await withLock(`places:${param(req, 'id')}`, () => runLottery(param(req, 'id'))))
})

organizerRouter.post('/tournaments/:id/break', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  // a double click announces the break once (the second sees it announced)
  const result = await withLock(`break:${param(req, 'id')}`, () => announceBreak(param(req, 'id')))
  background(notifyBreakAnnounced(param(req, 'id')))
  res.status(201).json(result)
})

// a team of the break gives its place (its seed) to a team outside it: the organizer's decision at a tie on the break
// line, or any other reason; only while that bracket has no draw yet
organizerRouter.post('/tournaments/:id/break/replace', org, (req, res) => withLock(`break:${param(req, 'id')}`, () => replaceInBreak(req, res)))
async function replaceInBreak(req: Request, res: Response) {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const d = body(req, z.object({ inTeamId: z.string(), outTeamId: z.string() }))
  const [inTeam, outTeam] = await Promise.all([prisma.team.findUnique({ where: { id: d.inTeamId } }), prisma.team.findUnique({ where: { id: d.outTeamId } })])
  if (!inTeam || !outTeam || inTeam.tournamentId !== id || outTeam.tournamentId !== id) throw notFound('team_not_found')
  if (!inTeam.breakSeed) throw badRequest('team_not_in_break')
  if (outTeam.breakSeed) throw badRequest('team_in_break')
  if (outTeam.swing || outTeam.withdrawnAt) throw badRequest('team_withdrawn')
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id }, select: { leagues: true } })
  if (leaguesOf(t).length && inTeam.league !== outTeam.league) throw badRequest('different_leagues')
  if (await prisma.debate.count({ where: { round: { tournamentId: id, kind: 'elimination', category: inTeam.breakCategory } } })) throw forbidden('break_in_progress')
  await prisma.$transaction([
    prisma.team.update({ where: { id: inTeam.id }, data: { breakSeed: null, breakCategory: null } }),
    prisma.team.update({ where: { id: outTeam.id }, data: { breakSeed: inTeam.breakSeed, breakCategory: inTeam.breakCategory } }),
  ])
  res.json({ seed: inTeam.breakSeed })
}

organizerRouter.delete('/tournaments/:id/break', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  await withLock(`break:${param(req, 'id')}`, () => cancelBreak(param(req, 'id')))
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
  speakers: z.array(personName()).min(1).max(3), // the tournament's format says how many (LD: one)
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

// an open tournament's teams come only from applications by accounts (its results count in the rating)
async function assertLocal(tournamentId: string) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { kind: true } })
  if (t.kind === 'open') throw forbidden('open_tournament_teams_by_application')
}

organizerRouter.post('/tournaments/:id/teams', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  await assertLocal(param(req, 'id'))
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

// Teams pasted from a spreadsheet (the answers of a Google Form): name, school and the speakers' real names, all at once.
// The page reads the rows and shows them first; here every team is checked like one added by hand. Names already in
// the tournament are skipped; nothing is created if any row is wrong.
organizerRouter.post('/tournaments/:id/teams/import', org, async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  await assertLocal(id)
  const d = body(req, z.object({ teams: z.array(teamSchema).min(1).max(128) }))
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id }, include: { teams: { select: { name: true, swing: true } } } })
  const taken = new Set(t.teams.map(x => x.name.toLowerCase()))
  const fresh = [...new Map(d.teams.map(x => [x.name.toLowerCase(), x])).values()].filter(x => !taken.has(x.name.toLowerCase()))
  // a wrong row is named, so the organizer fixes that line of the table
  fresh.forEach(x => {
    try { assertSpeakers(t.format, x.speakers); leagueFor(t, x.league) } catch (e) {
      if (e instanceof HttpError) throw badRequest(e.code, { ...(e.details as object | undefined), team: x.name })
      throw e
    }
  })
  const count = t.teams.filter(x => !x.swing).length
  if (count + fresh.length > t.maxTeams) throw badRequest('tournament_full')
  if (fresh.length) assertRoomForTeam(t, count + fresh.length - 1)
  const institutions = new Map<string, string | null>()
  for (const x of fresh) if (!institutions.has(x.institution)) institutions.set(x.institution, await institutionId(x.institution, t.level))
  const created = await prisma.$transaction(fresh.map(x => prisma.team.create({
    data: {
      tournamentId: t.id, name: x.name, city: x.city, institutionId: institutions.get(x.institution) ?? null, league: leagueFor(t, x.league),
      speakers: { create: x.speakers.map((name, i) => ({ name, position: i + 1 })) },
    },
    include: teamInclude,
  })))
  res.status(201).json({ created: created.map(toTeam), skipped: d.teams.length - fresh.length })
})

// Judges by name, without accounts (a tournament run on paper): the owner enters their ballots for them ("as" a judge),
// and a judge can still be linked to an account later by email. Names already in the tournament are skipped.
organizerRouter.post('/tournaments/:id/judges/bulk', org, async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({ names: z.array(personName()).min(1).max(100), league: z.string().max(24).nullable().optional() }))
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
  await assertLocal(param(req, 'id'))
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
  const bp = !!debate.closingPropositionTeamId
  const { side } = body(req, z.object({ side: z.enum(['proposition', 'opposition', 'closingProposition', 'closingOpposition']).nullable() }))
  if (side && !bp && side !== 'proposition' && side !== 'opposition') throw badRequest('invalid_side')
  if (side === null) {
    // undo: the debate waits for its ballots again
    if (!debate.forfeit) return void res.json({ ok: true })
    if (bp && await prisma.ballot.count({ where: { debateId: debate.id } })) throw forbidden('ballots_already_submitted')
    await prisma.debate.update({ where: { id: debate.id }, data: { forfeit: null, winner: null, ranking: [], ballotStatus: 'pending' } })
    return void res.json({ ok: true })
  }
  if (await prisma.ballot.count({ where: { debateId: debate.id } })) throw forbidden('ballots_already_submitted')
  // two teams: the other side wins at once. BP: the absent team will be 4th; the chair still places the other three
  await prisma.debate.update({
    where: { id: debate.id },
    data: bp ? { forfeit: side } : { forfeit: side, winner: side === 'proposition' ? 'opposition' : 'proposition', ballotStatus: 'confirmed' },
  })
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
    // a running round: the room without ballots goes to the opponent (a technical loss), so the round can be completed
    const open = await prisma.debate.findMany({
      where: {
        round: { tournamentId: team.tournamentId, status: 'released' }, forfeit: null, ballots: { none: {} },
        OR: [{ propositionTeamId: team.id }, { oppositionTeamId: team.id }, { closingPropositionTeamId: team.id }, { closingOppositionTeamId: team.id }],
      },
    })
    for (const d of open) {
      const side = d.propositionTeamId === team.id ? 'proposition' : d.oppositionTeamId === team.id ? 'opposition' : d.closingPropositionTeamId === team.id ? 'closingProposition' : 'closingOpposition'
      // two teams: the opponent wins at once; BP: the team is marked absent (4th), the chair places the other three
      await prisma.debate.update({ where: { id: d.id }, data: d.closingPropositionTeamId ? { forfeit: side } : { forfeit: side, winner: side === 'proposition' ? 'opposition' : 'proposition', ballotStatus: 'confirmed' } })
    }
    return void res.json({ withdrawn: true, forfeited: open.length })
  }
  await prisma.team.delete({ where: { id: team.id } })
  // the team's application no longer holds a place; the waitlist moves up
  await prisma.teamRegistration.updateMany({ where: { tournamentId: team.tournamentId, teamName: team.name, status: 'confirmed' }, data: { status: 'rejected' } })
  await withLock(`places:${team.tournamentId}`, () => fillFromWaitlist(team.tournamentId))
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
  const { league, name } = body(req, z.object({ league: z.string().max(24).nullable().optional(), name: personName().optional() }))
  if (league && !leaguesOf(judge.tournament).some(l => l.key === league)) throw badRequest('invalid_league')
  // a judge with an account goes by the account's name; one without is named by the organizer (a typo is fixed here)
  if (name !== undefined && judge.userId) throw forbidden('judge_has_account')
  const x = await prisma.judge.update({ where: { id: judge.id }, data: { ...(league !== undefined && { league }), ...(name !== undefined && { name }) } })
  res.json({ id: x.id, league: x.league, name: x.name })
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

// one change of a round at a time (publish, complete, draw, a room added, teams swapped): a double click or a resent
// request runs after the first and sees its result, so a round is never published twice (nor its Telegram news sent twice)
const oneAtATime = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) =>
  withLock(`round:${param(req, 'roundId')}`, () => handler(req, res))

organizerRouter.patch('/rounds/:roundId', org, oneAtATime(async (req, res) => {
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
    // the organizer is told where to look: the rooms still without a result
    const open = round.debates.filter(x => !x.winner)
    if (d.status === 'completed' && open.length) throw badRequest('ballots_missing', { rooms: open.map(x => x.room).join(', '), count: open.length })
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
}))

organizerRouter.post('/rounds/:roundId/draw', org, async (req, res) => {
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  const opts = body(req, z.object({
    presentOnly: z.boolean().optional(), addSwing: z.boolean().optional(),
    method: z.enum(['power', 'high_low', 'random', 'slide', 'fold', 'round_robin']).optional(), protectClubs: z.boolean().optional(),
  }).default({}))
  // a double click: the second draw waits for the first, then replaces it (never two draws side by side)
  const report = await withLock(`round:${round.id}`, () => generateDraw(round.id, opts))
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

// Two teams change places in a round: between rooms or inside one. To repeat a draw made on paper, or to correct a
// pairing by hand (a late team, two teams that should not meet). Preliminary rounds only (the playoffs follow the
// bracket), before any ballot of those rooms, inside one league. A judge never stays with a team they conflict with.
// The organizer has the last word: a rematch or two clubmates in one room are allowed, with a warning.
const SIDE_COLUMN = { proposition: 'propositionTeamId', opposition: 'oppositionTeamId', closingProposition: 'closingPropositionTeamId', closingOpposition: 'closingOppositionTeamId' } as const
type SlotSide = keyof typeof SIDE_COLUMN
const slotSchema = z.object({ debateId: z.string(), side: z.enum(['proposition', 'opposition', 'closingProposition', 'closingOpposition']) })
// a team that has no room in this round (a late team): it takes the place of the team at slot a
const outsideSchema = z.object({ teamId: z.string() })
organizerRouter.post('/rounds/:roundId/swap-teams', org, oneAtATime(async (req, res) => {
  const d = body(req, z.object({ a: slotSchema, b: z.union([slotSchema, outsideSchema]) }))
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') }, include: { tournament: { select: { leagues: true } }, debates: { include: { judges: true } } } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  if (round.kind === 'elimination') throw forbidden('playoffs_follow_bracket')
  if (round.status === 'completed') throw forbidden('round_completed')
  if ('teamId' in d.b) return void res.json(await replaceWithOutside(round, d.a, d.b.teamId))
  const b = d.b
  const da = round.debates.find(x => x.id === d.a.debateId), db = round.debates.find(x => x.id === b.debateId)
  if (!da || !db) throw notFound('debate_not_found')
  const ta = da[SIDE_COLUMN[d.a.side]], tb = db[SIDE_COLUMN[b.side]]
  if (!ta || !tb) throw badRequest('no_team_on_side')
  if (ta === tb) return void res.json({ warnings: [] })
  if (da.forfeit || db.forfeit) throw forbidden('debate_forfeited')
  if (await prisma.ballot.count({ where: { debateId: { in: [da.id, db.id] } } })) throw forbidden('ballots_in_room')
  const teams = new Map((await prisma.team.findMany({ where: { tournamentId: round.tournamentId }, select: { id: true, name: true, league: true, clubId: true } })).map(t => [t.id, t]))
  // the rooms of a tournament with leagues are kept apart by league
  if (leaguesOf(round.tournament).length && teams.get(ta)?.league !== teams.get(tb)?.league) throw badRequest('different_leagues')

  // the rooms after the swap
  const roomOf = (x: typeof da) => Object.fromEntries((Object.keys(SIDE_COLUMN) as SlotSide[]).map(side => [side, x[SIDE_COLUMN[side]]])) as Record<SlotSide, string | null>
  const rooms = new Map([[da.id, roomOf(da)], [db.id, roomOf(db)]])
  rooms.get(da.id)![d.a.side] = tb
  rooms.get(db.id)![b.side] = ta
  const idsOf = (id: string) => Object.values(rooms.get(id)!).filter((x): x is string => !!x)
  const clash = await conflictChecker(round.tournamentId)
  for (const x of [da, db]) {
    const bad = x.judges.find(j => clash(j.judgeId, idsOf(x.id)))
    if (bad) throw badRequest('swap_judge_conflict', { judgeId: bad.judgeId, debateId: x.id })
  }

  // warnings: teams that met in an earlier round, two teams of one club in a room
  const earlier = await prisma.debate.findMany({ where: { round: { tournamentId: round.tournamentId, id: { not: round.id } } }, select: { propositionTeamId: true, oppositionTeamId: true, closingPropositionTeamId: true, closingOppositionTeamId: true } })
  const met = new Set(earlier.flatMap(x => {
    const ids = [x.propositionTeamId, x.oppositionTeamId, x.closingPropositionTeamId, x.closingOppositionTeamId].filter((y): y is string => !!y)
    return ids.flatMap(a => ids.filter(b => b !== a).map(b => `${a}|${b}`))
  }))
  const warnings: { kind: 'rematch' | 'same_club'; teams: string[] }[] = []
  for (const id of new Set([da.id, db.id])) {
    const ids = idsOf(id)
    for (const [i, a] of ids.entries()) for (const b of ids.slice(i + 1)) {
      if (![ta, tb].includes(a) && ![ta, tb].includes(b)) continue // only the pairs the swap made
      const names = [teams.get(a)?.name ?? '', teams.get(b)?.name ?? '']
      if (met.has(`${a}|${b}`)) warnings.push({ kind: 'rematch', teams: names })
      const ca = teams.get(a)?.clubId
      if (ca && ca === teams.get(b)?.clubId) warnings.push({ kind: 'same_club', teams: names })
    }
  }

  const columns = (id: string) => Object.fromEntries((Object.keys(SIDE_COLUMN) as SlotSide[]).map(side => [SIDE_COLUMN[side], rooms.get(id)![side]]))
  await prisma.$transaction([...new Set([da.id, db.id])].map(id => prisma.debate.update({ where: { id }, data: columns(id) })))
  res.json({ warnings })
}))

type RoundWithDebates = { id: string; tournamentId: string; tournament: { leagues: unknown }; debates: ({ id: string; forfeit: string | null; judges: { judgeId: string }[] } & Record<(typeof SIDE_COLUMN)[SlotSide], string | null>)[] }
const teamsInRound = (round: RoundWithDebates) => new Set(round.debates.flatMap(x => Object.values(SIDE_COLUMN).map(c => x[c]).filter((y): y is string => !!y)))

// a team outside the round takes the place of a team in a room (that team is then outside, for another room)
async function replaceWithOutside(round: RoundWithDebates, a: { debateId: string; side: SlotSide }, teamId: string) {
  const da = round.debates.find(x => x.id === a.debateId)
  if (!da) throw notFound('debate_not_found')
  const ta = da[SIDE_COLUMN[a.side]]
  if (!ta) throw badRequest('no_team_on_side')
  if (da.forfeit) throw forbidden('debate_forfeited')
  if (await prisma.ballot.count({ where: { debateId: da.id } })) throw forbidden('ballots_in_room')
  const [out, inRoom] = await Promise.all([prisma.team.findUnique({ where: { id: teamId } }), prisma.team.findUniqueOrThrow({ where: { id: ta } })])
  if (!out || out.tournamentId !== round.tournamentId) throw notFound('team_not_found')
  if (out.withdrawnAt) throw badRequest('team_withdrawn')
  if (teamsInRound(round).has(out.id)) throw badRequest('team_in_round')
  if (leaguesOf(round.tournament).length && out.league !== inRoom.league) throw badRequest('different_leagues')
  const ids = [...Object.values(SIDE_COLUMN).map(c => da[c]).filter((y): y is string => !!y && y !== ta), out.id]
  const clash = await conflictChecker(round.tournamentId)
  const bad = da.judges.find(j => clash(j.judgeId, ids))
  if (bad) throw badRequest('swap_judge_conflict', { judgeId: bad.judgeId, debateId: da.id })
  await prisma.debate.update({ where: { id: da.id }, data: { [SIDE_COLUMN[a.side]]: out.id } })
  return { warnings: [] }
}

// A room added by hand to a running round: a late team against another team that has no room (one replaced by it,
// or a swing team). With a swing team the room may be won at once (a technical win: the swing side "did not come").
organizerRouter.post('/rounds/:roundId/rooms', org, oneAtATime(async (req, res) => {
  const d = body(req, z.object({
    propositionTeamId: z.string(), oppositionTeamId: z.string().nullable(), // null: a swing team of the league
    room: z.string().trim().min(1).max(60), chairJudgeId: z.string().optional(), technicalWin: z.boolean().optional(),
  }))
  const round = await prisma.round.findUnique({ where: { id: param(req, 'roundId') }, include: { tournament: { select: { leagues: true, format: true } }, debates: { include: { judges: true } } } })
  if (!round) throw notFound('round_not_found')
  await assertCanManage(req.user, round.tournamentId)
  if (round.kind === 'elimination') throw forbidden('playoffs_follow_bracket')
  if (round.status === 'completed') throw forbidden('round_completed')
  if (isBP(round.tournament.format)) throw badRequest('two_team_rooms_only')
  const prop = await prisma.team.findUnique({ where: { id: d.propositionTeamId } })
  if (!prop || prop.tournamentId !== round.tournamentId) throw notFound('team_not_found')
  const opp = d.oppositionTeamId ? await prisma.team.findUnique({ where: { id: d.oppositionTeamId } }) : await swingTeamFor(round.tournamentId, prop.league)
  if (!opp || opp.tournamentId !== round.tournamentId || opp.id === prop.id) throw notFound('team_not_found')
  if (prop.withdrawnAt || opp.withdrawnAt) throw badRequest('team_withdrawn')
  const busy = teamsInRound(round)
  if (busy.has(prop.id) || busy.has(opp.id)) throw badRequest('team_in_round')
  if (leaguesOf(round.tournament).length && prop.league !== opp.league) throw badRequest('different_leagues')
  if (d.technicalWin && !opp.swing) throw badRequest('technical_win_against_swing_only')
  if (d.chairJudgeId) {
    const judge = await prisma.judge.findUnique({ where: { id: d.chairJudgeId } })
    if (!judge || judge.tournamentId !== round.tournamentId || judge.leftAt) throw badRequest('invalid_judge')
    if (round.debates.some(x => x.judges.some(j => j.judgeId === judge.id))) throw conflict('judge_busy_in_round')
    if ((await conflictChecker(round.tournamentId))(judge.id, [prop.id, opp.id])) throw badRequest('judge_conflict', { judgeId: judge.id })
  }
  const links = (await prisma.tournament.findUniqueOrThrow({ where: { id: round.tournamentId }, select: { roomLinks: true } })).roomLinks as Record<string, string>
  const x = await prisma.debate.create({
    data: {
      roundId: round.id, room: d.room, onlineUrl: links[d.room] ?? null, propositionTeamId: prop.id, oppositionTeamId: opp.id,
      ...(d.technicalWin && { forfeit: 'opposition', winner: 'proposition', ballotStatus: 'confirmed' as const }),
      ...(d.chairJudgeId && { judges: { create: { judgeId: d.chairJudgeId, isChair: true } } }),
    },
    include: { judges: { orderBy: { isChair: 'desc' } } },
  })
  res.status(201).json(toDebate(x, true))
}))

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
  const found = await prisma.teamRegistration.findUnique({ where: { id: param(req, 'regId') }, select: { tournamentId: true } })
  if (!found) throw notFound('registration_not_found')
  // under the tournament's places lock: a double click confirms once, and a place is never given twice
  await withLock(`places:${found.tournamentId}`, () => decideRegistration(req, res))
})
async function decideRegistration(req: Request, res: Response) {
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
}

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
