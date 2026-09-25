import type { OrganizerTrust } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'

// Organizer trust decides whether a new tournament needs admin review.
//  - new:        tournaments wait for moderation (default)
//  - trusted:    earned: ran at least one real tournament (finished, with a completed round),
//                no upheld reports and no rejected tournaments in the last 180 days -> published at once
//  - verified:   set by an admin for schools, clubs and universities -> published at once
//  - restricted: set by an admin -> always moderated, even if trust was earned
// Auto-published tournaments are still protected by reports (see routes/reports.ts).

export type TrustLevel = 'new' | 'trusted' | 'verified' | 'restricted'
export const ACTIVE_LIMITS: Record<TrustLevel, number> = { new: 3, restricted: 3, trusted: 5, verified: 10 }
const REJECTION_COOLDOWN_MS = 180 * 24 * 60 * 60 * 1000

export interface TrustProfile {
  level: TrustLevel
  earned: 'new' | 'trusted'
  override: OrganizerTrust | null
  autoPublish: boolean
  activeLimit: number
  active: number
  checks: { key: 'finished' | 'noUpheldReports' | 'noRecentRejections'; met: boolean; value: number }[]
}

export async function organizerTrust(userId: string): Promise<TrustProfile> {
  const owned = { organizers: { some: { userId, role: 'owner' as const } } }
  const [user, finished, upheld, rejected, active] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { organizerTrust: true } }),
    prisma.tournament.count({ where: { ...owned, status: 'finished', moderation: 'approved', rounds: { some: { status: 'completed' } } } }),
    prisma.tournamentReport.count({ where: { status: 'upheld', tournament: owned } }),
    prisma.tournament.count({ where: { ...owned, moderation: 'rejected', updatedAt: { gte: new Date(Date.now() - REJECTION_COOLDOWN_MS) } } }),
    prisma.tournament.count({ where: { ...owned, status: { not: 'finished' }, moderation: { not: 'rejected' } } }),
  ])
  const checks = [
    { key: 'finished' as const, met: finished >= 1, value: finished },
    { key: 'noUpheldReports' as const, met: upheld === 0, value: upheld },
    { key: 'noRecentRejections' as const, met: rejected === 0, value: rejected },
  ]
  const earned = checks.every(c => c.met) ? 'trusted' : 'new'
  const level: TrustLevel = user.organizerTrust ?? earned
  return {
    level, earned, override: user.organizerTrust, autoPublish: level === 'trusted' || level === 'verified',
    activeLimit: ACTIVE_LIMITS[level], active, checks,
  }
}

export async function trustLevels(userIds: string[]) {
  const out = new Map<string, TrustLevel>()
  for (const id of new Set(userIds)) out.set(id, (await organizerTrust(id)).level)
  return out
}
