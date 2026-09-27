import { randomInt } from 'node:crypto'
import type { Tournament } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/errors.js'

// Plans: every feature is free; the only difference is the size. Tournaments above FREE_TEAM_LIMIT teams
// are Pro and must be paid before they grow beyond the free limit.
export const FREE_TEAM_LIMIT = 20

export const planFor = (maxTeams: number) => (maxTeams > FREE_TEAM_LIMIT ? 'pro' : 'free') as 'pro' | 'free'

// the single settings row; created with defaults on first use
export const platformSettings = () => prisma.platformSetting.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } })

// a new team is refused while an unpaid Pro tournament is at the free limit
export function assertRoomForTeam(t: Pick<Tournament, 'plan' | 'paid'>, teamsNow: number) {
  if (t.plan === 'pro' && !t.paid && teamsNow >= FREE_TEAM_LIMIT) throw new HttpError(402, 'payment_required')
}

// DKZ-XXXXXX without look-alike characters (0/O, 1/I), easy to type in a Kaspi comment
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const newReference = () => `DKZ-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`
