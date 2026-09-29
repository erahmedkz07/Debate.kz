import { prisma } from '../lib/prisma.js'

// Who may not judge whom. A judge has a conflict with a team when:
//   - they come from the same institution (school / university);
//   - the judge's own club (from their account) is the team's club — a coach does not judge their pupils;
//   - the organizer marked a personal conflict (a relative, a former coach, a friend…).
// The draw seats judges without conflicts; a manual assignment with a conflict is refused.
export type ConflictCheck = (judgeId: string, teamIds: string[]) => boolean

export async function conflictChecker(tournamentId: string): Promise<ConflictCheck> {
  const [judges, teams] = await Promise.all([
    prisma.judge.findMany({
      where: { tournamentId },
      select: { id: true, institutionId: true, conflicts: { select: { teamId: true } }, user: { select: { clubMembership: { select: { clubId: true } } } } },
    }),
    prisma.team.findMany({ where: { tournamentId }, select: { id: true, institutionId: true, clubId: true } }),
  ])
  const team = new Map(teams.map(t => [t.id, t]))
  const judge = new Map(judges.map(j => [j.id, {
    institutionId: j.institutionId, clubId: j.user?.clubMembership?.clubId ?? null, personal: new Set(j.conflicts.map(c => c.teamId)),
  }]))
  return (judgeId, teamIds) => {
    const j = judge.get(judgeId)
    if (!j) return false
    return teamIds.some(id => {
      const t = team.get(id)
      if (!t) return false
      return j.personal.has(id)
        || (!!j.institutionId && j.institutionId === t.institutionId)
        || (!!j.clubId && j.clubId === t.clubId)
    })
  }
}
