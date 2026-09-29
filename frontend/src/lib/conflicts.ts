import type { Judge, Team } from '@/types'

// Why a judge may not judge a team (mirrors backend services/conflicts.ts): null when there is no conflict
export type ConflictReason = 'personal' | 'institution' | 'club'
export function conflictReason(j: Judge, team: Team | undefined): ConflictReason | null {
  if (!team) return null
  if (j.conflictTeamIds?.includes(team.id)) return 'personal'
  if (j.institutionId && j.institutionId === team.institutionId) return 'institution'
  if (j.clubId && j.clubId === team.club?.id) return 'club'
  return null
}
