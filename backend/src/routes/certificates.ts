import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { notFound } from '../lib/errors.js'
import { param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { assertCanManage, leagueLanguage, leaguesOf } from '../services/tournaments.js'
import { certificateInclude, ensureCertificates } from '../services/certificates.js'

export const certificatesRouter = Router()

type Row = Prisma.CertificateGetPayload<{ include: typeof certificateInclude }>
type Lang = 'ru' | 'kz'

// A certificate speaks its holder's language: a speaker of the Kazakh league gets it in Kazakh, of the Russian league
// in Russian, and a judge of a league likewise (the league's language: chosen by the organizer, else from its name).
// Without a league: the tournament's only language; a tournament in both languages (or an award diploma) follows the
// reader's site language.
async function languagesOf(rows: Row[]): Promise<Map<string, Lang>> {
  const out = new Map<string, Lang>()
  const ids = (k: 'speakerId' | 'judgeId') => rows.flatMap(c => (c[k] ? [c[k]!] : []))
  const [speakers, judges, tournaments] = await Promise.all([
    prisma.speaker.findMany({ where: { id: { in: ids('speakerId') } }, select: { id: true, team: { select: { league: true } } } }),
    prisma.judge.findMany({ where: { id: { in: ids('judgeId') } }, select: { id: true, league: true } }),
    prisma.tournament.findMany({ where: { id: { in: [...new Set(rows.map(c => c.tournamentId))] } }, select: { id: true, leagues: true, languages: true } }),
  ])
  for (const c of rows) {
    const t = tournaments.find(x => x.id === c.tournamentId)
    const key = c.speakerId ? speakers.find(s => s.id === c.speakerId)?.team.league : c.judgeId ? judges.find(j => j.id === c.judgeId)?.league : null
    const league = t && key ? leaguesOf(t).find(l => l.key === key) : undefined
    const only = t?.languages.filter(l => l === 'ru' || l === 'kz') ?? []
    const lang: Lang | undefined = league ? leagueLanguage(league) : only.length === 1 ? (only[0] as Lang) : undefined
    if (lang && c.kind !== 'award') out.set(c.code, lang)
  }
  return out
}

const shape = (c: Row, lang?: Lang) => ({
  code: c.code, kind: c.kind, name: c.name, teamName: c.teamName ?? undefined, institution: c.institution ?? undefined,
  teamPlace: c.teamPlace ?? undefined, inBreak: c.inBreak, speakerPlace: c.speakerPlace ?? undefined, issuedAt: toDay(c.issuedAt),
  ...(c.breakCategory && { breakCategory: c.breakCategory, categoryPlace: c.categoryPlace ?? undefined }),
  ...(c.award && { award: c.award }),
  ...(lang && { language: lang }),
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
  res.json(shape(c, (await languagesOf([c])).get(c.code)))
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
  const langs = await languagesOf(list)
  res.json(list.map(c => shape(c, langs.get(c.code))))
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
  const langs = await languagesOf(list)
  res.json(list.map(c => shape(c, langs.get(c.code))))
})
