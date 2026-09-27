// End-to-end API scenario. Do not run directly: `npm run test:e2e` (scripts/e2e.mjs)
// starts a separate API on a separate test database and then imports this file.
// The checks MUTATE data (registrations, ballots, draws), so they must never hit the dev DB.
const A = process.env.API_URL
if (!A) throw new Error('run through npm run test:e2e')

function client() {
  let cookie = ''
  return async (method, path, body) => {
    const res = await fetch(A + path, {
      method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
      body: body && JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    return { status: res.status, data }
  }
}
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) process.exitCode = 1 }
const login = async (email) => { const c = client(); const r = await c('POST', '/auth/login', { email, password: 'demo1234' }); ok(r.status === 200, `login ${email}`); return c }

const org = await login('org@debate.kz')
const student = await login('student@debate.kz')
const judge = await login('judge@debate.kz')
const admin = await login('admin@debate.kz')

// ---------- 1. registration -> confirmation ----------
const mine = (await org('GET', '/organizer/tournaments')).data
const t1 = mine.find(t => t.status === 'registration')
const before = t1.teamsCount
let r = await student('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'E2E Команда', institution: 'Лицей №15', speakers: ['Тест Первый', 'Тест Второй', 'Тест Третий'], phone: '+7 701 555 44 33' })
ok(r.status === 201, `participant registers team (${r.status})`)
r = await student('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'E2E Команда', institution: 'Лицей №15', speakers: ['А Б', 'В Г', 'Д Е'].map(s => s + 'ов'), phone: '+7 701 555 44 33' })
ok(r.status === 409 && r.data.error === 'team_name_taken', 'duplicate team name rejected')
const t4id = mine.find(t => t.status === 'ongoing').id
r = await judge('POST', `/tournaments/${t4id}/registrations`, { teamName: 'Команда судьи', institution: 'Лицей №1', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33' })
ok(r.status === 403 && r.data.error === 'conflict_of_interest', 'a judge of a tournament cannot register a team in it')
const regs = (await org('GET', `/tournaments/${t1.id}/registrations`)).data
const reg = regs.find(x => x.teamName === 'E2E Команда')
r = await student('PATCH', `/registrations/${reg.id}`, { status: 'confirmed' })
ok(r.status === 403, 'participant cannot confirm registrations')
r = await org('PATCH', `/registrations/${reg.id}`, { status: 'confirmed' })
ok(r.status === 200, 'organizer confirms registration')
const t1after = (await org('GET', `/tournaments/${t1.id}`)).data
ok(t1after.teamsCount === before + 1 && t1after.teams.some(t => t.name === 'E2E Команда'), `team created (${before} -> ${t1after.teamsCount})`)

// ---------- 2. judge ballots with WSDC validation ----------
const assignments = (await judge('GET', '/judge/assignments')).data
const pending = assignments.find(a => a.debate.ballotStatus === 'pending')
ok(!!pending, `judge has a pending ballot (${assignments.length} assignments)`)
const b = (await judge('GET', `/ballots/${pending.debate.id}`)).data
const scores = {}
b.proposition.speakers.forEach(s => (scores[s.id] = 75))
b.opposition.speakers.forEach(s => (scores[s.id] = 72))
const base = { scores, reply: { proposition: 37, opposition: 36 }, replySpeakers: { proposition: b.proposition.speakers[0].id, opposition: b.opposition.speakers[1].id } }

r = await judge('POST', `/ballots/${b.debate.id}`, { ...base, winner: 'opposition' })
ok(r.status === 400 && r.data.error === 'winner_mismatch', 'winner must match totals')
r = await judge('POST', `/ballots/${b.debate.id}`, { ...base, winner: 'proposition', scores: { ...scores, [b.proposition.speakers[0].id]: 85 } })
ok(r.status === 400 && r.data.error === 'speaker_score_out_of_range', 'score above 80 rejected')
r = await judge('POST', `/ballots/${b.debate.id}`, { ...base, winner: 'proposition', scores: { ...scores, [b.proposition.speakers[0].id]: 70.3 } })
ok(r.status === 400 && r.data.error === 'speaker_score_out_of_range', 'score not on 0.5 step rejected')
r = await judge('POST', `/ballots/${b.debate.id}`, { ...base, winner: 'proposition', replySpeakers: { ...base.replySpeakers, proposition: b.proposition.speakers[2].id } })
ok(r.status === 400 && r.data.error === 'invalid_reply_speaker', '3rd speaker cannot give reply')
const tieScores = { ...scores }; b.opposition.speakers.forEach(s => (tieScores[s.id] = 75))
r = await judge('POST', `/ballots/${b.debate.id}`, { ...base, scores: tieScores, reply: { proposition: 36, opposition: 36 }, winner: 'proposition' })
ok(r.status === 400 && r.data.error === 'tie_not_allowed', 'tie rejected')
r = await student('POST', `/ballots/${b.debate.id}`, { ...base, winner: 'proposition' })
ok(r.status === 403, 'participant cannot submit ballots')
r = await judge('POST', `/ballots/${b.debate.id}`, { ...base, winner: 'proposition' })
ok(r.status === 201 && r.data.totals.proposition === 262 && r.data.totals.opposition === 252, `valid ballot accepted, totals ${JSON.stringify(r.data?.totals)}`)

// ---------- 3. finish the live round and draw the next one ----------
const t4 = mine.find(t => t.status === 'ongoing')
let det = (await org('GET', `/tournaments/${t4.id}`)).data
const live = det.rounds.find(x => x.status === 'released')
// the organizer fills the missing ballots (on behalf of the chair)
for (const d of det.debates.filter(x => x.roundId === live.id && !x.winner)) {
  const bd = (await org('GET', `/ballots/${d.id}`)).data
  const sc = {}
  bd.proposition.speakers.forEach(s => (sc[s.id] = 74)); bd.opposition.speakers.forEach(s => (sc[s.id] = 73.5))
  const res = await org('POST', `/ballots/${d.id}`, { winner: 'proposition', scores: sc, reply: { proposition: 36, opposition: 36 }, replySpeakers: { proposition: bd.proposition.speakers[0].id, opposition: bd.opposition.speakers[0].id } })
  if (res.status !== 201) ok(false, `org ballot ${res.status} ${JSON.stringify(res.data)}`)
}
det = (await org('GET', `/tournaments/${t4.id}`)).data
const stillMissing = det.debates.filter(x => x.roundId === live.id && !x.winner).length
ok(stillMissing === 0, `all debates of ${live.name} decided (missing: ${stillMissing})`)
const standBefore = (await org('GET', `/tournaments/${t4.id}/standings`)).data.teams.reduce((s, x) => s + x.wins, 0)
r = await org('PATCH', `/rounds/${live.id}`, { status: 'completed' })
ok(r.status === 200, `complete ${live.name}`)
const standAfter = (await org('GET', `/tournaments/${t4.id}/standings`)).data
const winsAfter = standAfter.teams.reduce((s, x) => s + x.wins, 0)
ok(winsAfter === standBefore + det.debates.filter(x => x.roundId === live.id).length, `standings include the new round (wins ${standBefore} -> ${winsAfter})`)

r = await judge('POST', `/ballots/${b.debate.id}`, { ...base, winner: 'proposition' })
ok(r.status === 403 && r.data.error === 'ballot_locked', 'ballots locked after round completed')

const next = det.rounds.find(x => x.status === 'draft')
r = await org('PATCH', `/rounds/${next.id}`, { status: 'released' })
ok(r.status === 400 && r.data.error === 'need_motion_and_draw', 'cannot release without motion and draw')
r = await org('POST', `/rounds/${next.id}/draw`)
ok(r.status === 201 && r.data.length === det.teams.length / 2, `power-paired draw generated (${r.data?.length} rooms)`)
const draw = r.data
// quality checks: every team once, no judge twice, no rematch if avoidable
const teamIds = draw.flatMap(d => [d.propositionTeamId, d.oppositionTeamId])
ok(new Set(teamIds).size === det.teams.length, 'every team debates exactly once')
const judgeIds = draw.flatMap(d => d.judgeIds)
ok(new Set(judgeIds).size === judgeIds.length, 'no judge sits in two rooms')
const met = new Set(det.debates.map(d => [d.propositionTeamId, d.oppositionTeamId].sort().join('|')))
const rematches = draw.filter(d => met.has([d.propositionTeamId, d.oppositionTeamId].sort().join('|'))).length
ok(rematches === 0, `no rematches (${rematches})`)
// top two teams of the standings should be paired together or near the top
const top = standAfter.teams.slice(0, 2).map(x => x.team.id)
ok(draw.slice(0).some(d => top.includes(d.propositionTeamId) || top.includes(d.oppositionTeamId)), 'strongest teams are in the draw')

// chair swap: judge already sitting in another room must be refused
r = await org('PATCH', `/debates/${draw[0].id}`, { chairJudgeId: draw[1].judgeIds[0] })
ok(r.status === 409 && r.data.error === 'judge_busy_in_round', 'judge cannot be put into two rooms')
r = await org('PATCH', `/debates/${draw[0].id}`, { swapSides: true, room: 'Актовый зал' })
ok(r.status === 200 && r.data.propositionTeamId === draw[0].oppositionTeamId && r.data.room === 'Актовый зал', 'swap sides + change room')

// public must not see the unreleased draw/motion
r = await org('PATCH', `/rounds/${next.id}`, { motion: 'Эта палата запретила бы домашние задания' })
const pub = (await client()('GET', `/tournaments/${t4.id}`)).data
ok(pub.rounds.find(x => x.id === next.id).motion === '' && !pub.debates.some(d => d.roundId === next.id), 'draft motion and draw hidden from public')
r = await org('PATCH', `/rounds/${next.id}`, { status: 'released' })
ok(r.status === 200, 'round released with motion and draw')
const pub2 = (await client()('GET', `/tournaments/${t4.id}`)).data
ok(pub2.rounds.find(x => x.id === next.id).motion.length > 0 && pub2.debates.some(d => d.roundId === next.id), 'released round visible to public')

// ---------- 4. other organizer's tournament is off-limits ----------
const foreign = (await admin('GET', '/admin/tournaments')).data.find(t => !mine.some(m => m.id === t.id))
r = await org('POST', `/tournaments/${foreign.id}/teams`, { name: 'Hack', institution: 'X school', speakers: ['Aaa Bbb', 'Ccc Ddd', 'Eee Fff'] })
ok(r.status === 403, 'organizer cannot edit a foreign tournament')

// ---------- 5. admin ----------
const unpaid = (await admin('GET', '/admin/tournaments')).data.find(t => t.plan === 'pro' && !t.paid)
r = await admin('PATCH', `/admin/tournaments/${unpaid.id}`, { paid: true })
ok(r.status === 200 && r.data.paid === true, `admin marks ${unpaid.name} as paid`)
const me = (await admin('GET', '/auth/me')).data.user
r = await admin('PATCH', `/admin/users/${me.id}`, { blocked: true })
ok(r.status === 400 && r.data.error === 'cannot_change_self', 'admin cannot block themself')
const users = (await admin('GET', '/admin/users')).data
const aruzhan = users.find(u => u.email === 'aruzhan@mail.kz')
r = await admin('PATCH', `/admin/users/${aruzhan.id}`, { blocked: true })
const aru = client(); const lr = await aru('POST', '/auth/login', { email: 'aruzhan@mail.kz', password: 'demo1234' })
ok(lr.status === 403 && lr.data.error === 'blocked', 'blocked user cannot log in')

// ---------- 6. participant sees own data ----------
const myDebates = (await student('GET', '/me/debates')).data
ok(myDebates.length >= 3 && myDebates.some(d => d.result), `participant sees own debates (${myDebates.length}, with results)`)
const myRegs = (await student('GET', '/me/registrations')).data
ok(myRegs.some(x => x.teamName === 'E2E Команда' && x.status === 'confirmed'), 'registration shows as confirmed')

// ---------- 7. roles model: plain users, email verification, moderation, invites ----------
const uniq = Date.now().toString(36)
const fresh = client()
r = await fresh('POST', '/auth/register', { name: 'Новый Пользователь', email: `new.${uniq}@mail.kz`, phone: '+7 707 111 22 33', password: 'secret123', consent: true, role: 'admin' })
ok(r.status === 201 && r.data.user.role === 'user', 'self-registration always gives role "user" (role: admin ignored)')
ok(r.data.user.emailVerified === false && typeof r.data.devVerificationToken === 'string', 'new account starts unverified, verification email sent')
const verifyToken = r.data.devVerificationToken
r = await client()('POST', '/auth/register', { name: 'Без Согласия', email: `nc.${uniq}@mail.kz`, phone: '+7 707 111 22 33', password: 'secret123' })
ok(r.status === 400, 'registration without personal-data consent rejected')

const tBody = n => ({ name: `E2E турнир ${n} ${uniq}`, city: 'Астана', startDate: '2026-12-12', endDate: '2026-12-13', level: 'school', description: '', preliminaryRounds: 3, breakSize: 4, maxTeams: 8, registrationOpen: true, requireApproval: true, languages: ['ru'] })
r = await fresh('POST', '/tournaments', tBody(1))
ok(r.status === 403 && r.data.error === 'email_not_verified', 'unverified user cannot create a tournament')
r = await fresh('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'Z', institution: 'Лицей', speakers: ['Ааа Бб', 'Ввв Гг', 'Ддд Ее'], phone: '+7 701 555 44 33' })
ok(r.status === 403 && r.data.error === 'email_not_verified', 'unverified user cannot register a team')
r = await fresh('POST', '/auth/verify-email', { token: 'x'.repeat(43) })
ok(r.status === 400 && r.data.error === 'invalid_or_expired_token', 'wrong verification token rejected')
r = await fresh('POST', '/auth/verify-email', { token: verifyToken })
ok(r.status === 200 && r.data.user.emailVerified === true, 'email verified with the link token')
r = await fresh('POST', '/auth/verify-email', { token: verifyToken })
ok(r.status === 400, 'verification link is single-use')

r = await fresh('POST', '/tournaments', tBody(1))
const own1 = r.data
ok(r.status === 201, 'any verified user can create a tournament')
let pubList = (await client()('GET', '/tournaments')).data
ok(!pubList.some(t => t.id === own1.id), 'new tournament is NOT public before moderation')
ok((await client()('GET', `/tournaments/${own1.id}`)).status === 404, 'guest gets 404 for an unmoderated tournament')
ok((await fresh('GET', `/tournaments/${own1.id}`)).data.moderation === 'pending', 'owner sees it with status pending')
r = await fresh('PATCH', `/admin/tournaments/${own1.id}`, { moderation: 'approved' })
ok(r.status === 403, 'owner cannot approve their own tournament')
r = await admin('PATCH', `/admin/tournaments/${own1.id}`, { moderation: 'rejected' })
ok(r.status === 400 && r.data.error === 'reason_required', 'rejection requires a reason')
r = await admin('PATCH', `/admin/tournaments/${own1.id}`, { moderation: 'approved' })
pubList = (await client()('GET', '/tournaments')).data
ok(r.status === 200 && pubList.some(t => t.id === own1.id), 'after admin approval the tournament is public')

ok((await fresh('POST', '/tournaments', tBody(2))).status === 201 && (await fresh('POST', '/tournaments', tBody(3))).status === 201, 'second and third tournament allowed')
r = await fresh('POST', '/tournaments', tBody(4))
ok(r.status === 400 && r.data.error === 'tournament_limit_reached', 'fourth active tournament refused (limit 3)')

// judge invite: single use, grants rights only in that tournament
const sabina = await login('sabina@mail.kz')
const timur = await login('timur@mail.kz')
r = await sabina('POST', `/tournaments/${own1.id}/invites`, { kind: 'judge' })
ok(r.status === 403, 'outsider cannot create invites')
r = await fresh('POST', `/tournaments/${own1.id}/invites`, { kind: 'judge' })
const judgeToken = r.data.url.split('/invite/')[1]
ok(r.status === 201 && !!judgeToken, 'owner creates a judge invite link')
const preview = (await client()('GET', `/invites/${judgeToken}`)).data
ok(preview.state === 'valid' && preview.kind === 'judge' && preview.tournament.id === own1.id, 'anyone can preview the invite')
r = await sabina('POST', `/invites/${judgeToken}/accept`)
ok(r.status === 200, 'invited user accepts and becomes a judge of that tournament')
ok((await sabina('GET', '/auth/me')).data.user.judges === true, 'profile now reports judging')
r = await timur('POST', `/invites/${judgeToken}/accept`)
ok(r.status === 400 && r.data.error === 'invite_used', 'the same invite cannot be used twice')
r = await sabina('POST', `/tournaments/${own1.id}/teams`, { name: 'Hack', institution: 'X school', speakers: ['Aaa Bbb', 'Ccc Ddd', 'Eee Fff'] })
ok(r.status === 403, 'a judge cannot manage the tournament')

// conflict of interest: an applicant cannot become a judge of the same tournament
r = await org('POST', `/tournaments/${t1.id}/invites`, { kind: 'judge' })
r = await student('POST', `/invites/${r.data.url.split('/invite/')[1]}/accept`)
ok(r.status === 403 && r.data.error === 'conflict_of_interest', 'a team member cannot accept a judge invite for the same tournament')

// co-organizer: can manage, cannot delete or invite co-organizers
r = await fresh('POST', `/tournaments/${own1.id}/invites`, { kind: 'co_organizer' })
r = await timur('POST', `/invites/${r.data.url.split('/invite/')[1]}/accept`)
ok(r.status === 200, 'co-organizer joins through an invite')
r = await timur('POST', `/tournaments/${own1.id}/teams`, { name: 'Команда соорга', institution: 'Лицей №1', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
ok(r.status === 201, 'co-organizer can manage teams')
r = await timur('POST', `/tournaments/${own1.id}/invites`, { kind: 'co_organizer' })
ok(r.status === 403 && r.data.error === 'owner_only', 'co-organizer cannot invite other co-organizers')
r = await timur('DELETE', `/tournaments/${own1.id}`)
ok(r.status === 403 && r.data.error === 'owner_only', 'co-organizer cannot delete the tournament')

// the admin role cannot be obtained by users
const freshMe = (await fresh('GET', '/auth/me')).data.user
r = await fresh('PATCH', `/admin/users/${freshMe.id}`, { role: 'admin' })
ok(r.status === 403, 'a user cannot make themselves admin')
r = await admin('PATCH', `/admin/users/${freshMe.id}`, { role: 'judge' })
ok(r.status === 400, '"judge" is not a global role anymore')

// ---------- 8. password reset ----------
{
  const victimEmail = `reset.${uniq}@mail.kz`
  const oldSession = client()
  await oldSession('POST', '/auth/register', { name: 'Сброс Пароля', email: victimEmail, phone: '+7 707 222 33 44', password: 'oldpass123', consent: true })
  ok((await oldSession('GET', '/auth/me')).data.user?.email === victimEmail, 'reset: account created and signed in')

  r = await client()('POST', '/auth/forgot-password', { email: `nobody.${uniq}@mail.kz` })
  const unknown = r
  r = await client()('POST', '/auth/forgot-password', { email: victimEmail })
  const resetToken = r.data.devResetToken
  ok(unknown.status === 200 && r.status === 200 && unknown.data.ok === r.data.ok, 'forgot-password answers the same for unknown and known emails')
  ok(typeof resetToken === 'string', 'reset link sent for a known email')

  r = await client()('POST', '/auth/reset-password', { token: resetToken, password: 'short' })
  ok(r.status === 400 && r.data.error === 'validation_error', 'new password must be at least 8 characters')
  r = await client()('POST', '/auth/reset-password', { token: verifyToken, password: 'newpass123' })
  ok(r.status === 400 && r.data.error === 'invalid_or_expired_token', 'an email-verification link cannot reset a password')

  await new Promise(res => setTimeout(res, 1100)) // make sure the new password is set in a later second than the old session
  const fresh2 = client()
  r = await fresh2('POST', '/auth/reset-password', { token: resetToken, password: 'newpass123' })
  ok(r.status === 200 && r.data.user.email === victimEmail, 'password reset with the link, user signed in')
  r = await client()('POST', '/auth/reset-password', { token: resetToken, password: 'another123' })
  ok(r.status === 400, 'reset link is single-use')

  ok((await oldSession('GET', '/auth/me')).data.user === null, 'sessions created before the reset are revoked')
  ok((await fresh2('GET', '/auth/me')).data.user?.email === victimEmail, 'the new session works')
  r = await client()('POST', '/auth/login', { email: victimEmail, password: 'oldpass123' })
  ok(r.status === 401, 'old password no longer works')
  r = await client()('POST', '/auth/login', { email: victimEmail, password: 'newpass123' })
  ok(r.status === 200, 'new password works')
}

// ---------- 9. tournament stages ----------
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'finished' })
ok(r.status === 400 && r.data.error === 'invalid_status_transition', 'cannot jump from registration to finished')
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'ongoing' })
ok(r.status === 400 && r.data.error === 'not_enough_teams', 'cannot start with fewer than 2 teams')
await fresh('POST', `/tournaments/${own1.id}/teams`, { name: 'Вторая команда', institution: 'Лицей №2', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'ongoing' })
ok(r.status === 200 && r.data.status === 'ongoing', 'owner starts the tournament')
r = await student('POST', `/tournaments/${own1.id}/registrations`, { teamName: 'Поздняя команда', institution: 'Лицей №3', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33' })
ok(r.status === 403 && r.data.error === 'registration_closed', 'registration is closed once the tournament is ongoing')
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'registration' })
ok(r.status === 200, 'can go back to registration while no round is released')
await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'ongoing' })
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'finished' })
ok(r.status === 200 && r.data.status === 'finished', 'owner finishes the tournament')
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'ongoing' })
ok(r.status === 400 && r.data.error === 'invalid_status_transition', 'a finished tournament cannot be reopened')
const pendingOwn = (await fresh('GET', '/organizer/tournaments')).data.find(t => t.moderation === 'pending')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { status: 'ongoing' })
ok(r.status === 403 && r.data.error === 'not_approved', 'an unmoderated tournament cannot start')

// ---------- 10. removing judges ----------
r = await fresh('POST', `/tournaments/${pendingOwn.id}/judges`, { name: 'Лишний Судья', rating: 5 })
r = await fresh('DELETE', `/judges/${r.data.id}`)
ok(r.status === 204, 'a judge who is not in any draw can be removed')
const t4full = (await org('GET', `/tournaments/${t4id}`)).data
const drawnJudge = t4full.judges.find(j => t4full.debates.some(d => d.judgeIds.includes(j.id)))
r = await org('DELETE', `/judges/${drawnJudge.id}`)
ok(r.status === 403 && r.data.error === 'judge_in_draw', 'a judge already in a draw cannot be removed')
r = await sabina('DELETE', `/judges/${drawnJudge.id}`)
ok(r.status === 403, 'outsiders cannot remove judges')

// ---------- 11. admins never compete ----------
r = await admin('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'Команда админа', institution: 'Лицей №1', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33' })
ok(r.status === 403 && r.data.error === 'admins_cannot_compete', 'an admin cannot register a team')

// ---------- 12. editing details, rooms, wing judges ----------
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { startDate: '2026-12-20', endDate: '2026-12-19' })
ok(r.status === 400 && r.data.error === 'end_before_start', 'end date before start rejected')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { city: 'Алматы', startDate: '2026-12-20', endDate: '2026-12-21', registrationDeadline: '2026-12-15' })
let po = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data
ok(r.status === 200 && po.city === 'Алматы' && po.startDate === '2026-12-20' && po.registrationDeadline === '2026-12-15', 'city, dates and deadline updated')
ok(po.rounds.every(x => x.date === '2026-12-20' || x.date === '2026-12-21'), 'unreleased rounds moved to the new dates')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { maxTeams: 24 })
po = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data
ok(r.status === 200 && po.plan === 'pro' && po.paid === false, 'raising the limit above 20 switches to unpaid Pro')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { maxTeams: 8 })
po = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data
ok(po.plan === 'free' && po.paid === true, 'lowering back to 20 or less returns to Free')
for (const n of ['Альфа', 'Бета']) await fresh('POST', `/tournaments/${pendingOwn.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { maxTeams: 4 })
ok(r.status === 200, 'limit can equal the minimum')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { rooms: ['Зал A', 'Зал A', 'Зал B'] })
po = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data
ok(r.status === 200 && po.rooms.join('|') === 'Зал A|Зал B', 'own rooms saved without duplicates')
const js = []
for (const n of ['Первый Судья', 'Второй Судья', 'Третий Судья']) js.push((await fresh('POST', `/tournaments/${pendingOwn.id}/judges`, { name: n, rating: 7 })).data.id)
r = await fresh('POST', `/rounds/${po.rounds[0].id}/draw`)
ok(r.status === 201 && r.data[0].room === 'Зал A', 'the draw uses the organizer\'s rooms')
const deb = r.data[0]
const wing = js.find(id => id !== deb.judgeIds[0])
r = await fresh('PATCH', `/debates/${deb.id}`, { wingJudgeIds: [] })
ok(r.status === 200 && r.data.judgeIds.length === 1, 'wings can be cleared')
r = await fresh('PATCH', `/debates/${deb.id}`, { wingJudgeIds: [wing] })
ok(r.status === 200 && r.data.judgeIds.length === 2 && r.data.judgeIds[1] === wing, 'organizer sets a wing judge')
r = await fresh('PATCH', `/debates/${deb.id}`, { wingJudgeIds: [deb.judgeIds[0]] })
ok(r.status === 400 && r.data.error === 'invalid_judge', 'the chair cannot also be a wing')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { maxTeams: 2 })
ok(r.status === 400, 'limit below 4 rejected')
const t1n = (await org('GET', `/tournaments/${t1.id}`)).data.teams.length
if (t1n > 4) {
  r = await org('PATCH', `/tournaments/${t1.id}`, { maxTeams: t1n - 1 })
  ok(r.status === 400 && r.data.error === 'below_team_count', 'limit cannot go below the teams already in')
}

// ---------- 13. password change, account deletion ----------
const freshEmail = `new.${uniq}@mail.kz`
const otherDevice = client()
await otherDevice('POST', '/auth/login', { email: freshEmail, password: 'secret123' })
r = await fresh('POST', '/me/password', { currentPassword: 'wrong-pass', newPassword: 'another123' })
ok(r.status === 400 && r.data.error === 'wrong_password', 'password change requires the current password')
r = await fresh('POST', '/me/password', { currentPassword: 'secret123', newPassword: 'another123' })
ok(r.status === 200, 'password changed from the profile')
ok((await fresh('GET', '/auth/me')).data.user?.email === freshEmail, 'this device stays signed in')
ok((await otherDevice('GET', '/auth/me')).data.user === null, 'other devices are signed out')
r = await fresh('DELETE', '/me', { password: 'another123' })
ok(r.status === 400 && r.data.error === 'owns_active_tournaments', 'owner of active tournaments cannot delete the account')
r = await admin('DELETE', '/me', { password: 'demo1234' })
ok(r.status === 403 && r.data.error === 'admin_cannot_delete_self', 'an admin cannot delete their own account')
const leaver = client()
const leaverEmail = `bye.${uniq}@mail.kz`
await leaver('POST', '/auth/register', { name: 'Уходящий Пользователь', email: leaverEmail, phone: '+7 707 111 22 33', password: 'secret123', consent: true })
r = await leaver('DELETE', '/me', { password: 'nope' })
ok(r.status === 400 && r.data.error === 'wrong_password', 'account deletion requires the password')
r = await leaver('DELETE', '/me', { password: 'secret123' })
ok(r.status === 204, 'user deletes their account')
ok((await client()('POST', '/auth/login', { email: leaverEmail, password: 'secret123' })).status === 401, 'deleted account cannot sign in')

// ---------- 14. admin audit log ----------
const log = (await admin('GET', '/admin/actions')).data
ok(log.some(a => a.action === 'tournament.approve' && a.targetId === own1.id) && log.some(a => a.action === 'user.block' && a.targetId === aruzhan.id),
  'admin decisions are in the audit log')
ok(log.some(a => a.action === 'tournament.paid' && a.targetId === unpaid.id && a.adminName), 'payment confirmation is logged with the admin name')
ok((await student('GET', '/admin/actions')).status === 403, 'only admins can read the audit log')

// ---------- 15. Telegram bot (test mode: e2e plays Telegram, the bot writes to an outbox) ----------
const bot = client()
let upd = 1000
const tgSend = (chatId, fields, type = 'private') => bot('POST', '/telegram/test/update', {
  update_id: ++upd, message: { message_id: upd, from: { id: chatId, username: `u${chatId}` }, chat: { id: chatId, type }, ...fields },
})
const inbox = async (chatId) => (await bot('GET', `/telegram/test/outbox?chat=${chatId}`)).data
const lastText = async (chatId) => (await inbox(String(chatId))).filter(m => m.method === 'sendMessage').at(-1)?.text ?? ''
// notifications are sent in the background: wait until the expected message arrives
const waitFor = async (chatId, re) => { for (let i = 0; i < 20; i++) { if ((await inbox(String(chatId))).some(m => re.test(m.text ?? ''))) return true; await new Promise(r => setTimeout(r, 100)) } return false }
const linkToken = async c => (await c('POST', '/me/telegram/link')).data.url.split('start=')[1]

const tgConf = (await client()('GET', '/telegram/config')).data
ok(tgConf.enabled && tgConf.username === 'DebateKzTestBot', 'bot config is public')
ok((await client()('POST', '/me/telegram/link')).status === 401, 'guests cannot create a link')
r = await student('POST', '/me/telegram/link')
ok(r.status === 201 && r.data.url.startsWith('https://t.me/DebateKzTestBot?start='), 'user gets a one-time deep link')
const stTok = r.data.url.split('start=')[1]
await tgSend(111, { text: `/start ${stTok}` })
const hello = await inbox('111')
ok(hello.some(m => /Готово/.test(m.text)) && hello.some(m => m.reply_markup?.keyboard?.[0]?.[0]?.request_contact), 'the bot links the account and asks for the phone')
let meTg = (await student('GET', '/auth/me')).data.user
ok(meTg.telegramLinked && meTg.telegramUsername === 'u111' && !meTg.phoneVerified, 'the site shows Telegram as connected')
await tgSend(112, { text: `/start ${stTok}` })
ok(/устарела|использована/.test(await lastText(112)), 'a link works only once')
await tgSend(111, { text: `/start ${await linkToken(timur)}` })
ok(/уже подключ[её]н/.test(await lastText(111)), 'one Telegram account cannot be linked to two site accounts')
await tgSend(555, { text: '/start' }, 'group')
ok((await inbox('555')).length === 0, 'group chats are ignored')
await tgSend(111, { contact: { phone_number: '+77015550000', user_id: 999 } })
ok(/свой номер/.test(await lastText(111)) && !(await student('GET', '/auth/me')).data.user.phoneVerified, "someone else's contact card is not accepted")
await tgSend(111, { contact: { phone_number: '+79161234567', user_id: 111 } })
ok(/Казахстана/.test(await lastText(111)), 'only Kazakhstan numbers are accepted')
await tgSend(111, { contact: { phone_number: '87011234567', user_id: 111 } })
meTg = (await student('GET', '/auth/me')).data.user
ok(meTg.phoneVerified && meTg.phone === '+7 701 123 45 67', 'own contact verifies the phone')
await tgSend(222, { text: `/start ${await linkToken(timur)}` })
await tgSend(222, { contact: { phone_number: '+7 701 123 45 67', user_id: 222 } })
ok(/другом аккаунте/.test(await lastText(222)), 'one phone number, one account')
await tgSend(111, { text: '/stop' })
ok((await student('GET', '/auth/me')).data.user.telegramNotify === false, '/stop turns notifications off')
await tgSend(111, { text: '/on' })
await tgSend(111, { text: '/me' })
ok(/подтверждён/.test(await lastText(111)), '/me shows the account')
await tgSend(333, { text: 'привет' })
ok(/не подключён/.test(await lastText(333)), 'unknown chats get instructions')

// notifications
const logosReg = (await org('GET', `/tournaments/${t1.id}/registrations`)).data.find(x => x.status === 'pending' && x.user.email === 'student@debate.kz')
await org('PATCH', `/registrations/${logosReg.id}`, { status: 'rejected' })
ok(await waitFor(111, /отклонена/), 'registration decision arrives in Telegram')
await tgSend(333, { text: `/start ${await linkToken(judge)}` })
// a judge with an account gets their room when the draw is published
await fresh('POST', `/tournaments/${pendingOwn.id}/judges`, { name: 'Алихан Ахметов', rating: 9, email: 'judge@debate.kz' })
const round1 = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data.rounds[0]
await fresh('POST', `/rounds/${round1.id}/draw`)
await fresh('PATCH', `/rounds/${round1.id}`, { motion: 'Эта палата поддерживает уведомления в Telegram' })
r = await fresh('PATCH', `/rounds/${round1.id}`, { status: 'released' })
ok(r.status === 200 && await waitFor(333, /председатель/) && await waitFor(333, /уведомления в Telegram/), 'a released draw tells the judge their room, role and motion')
await tgSend(444, { text: `/start ${await linkToken(fresh)}` })
await admin('PATCH', `/admin/tournaments/${pendingOwn.id}`, { moderation: 'rejected', moderationNote: 'Проверка уведомлений' })
ok(await waitFor(444, /отклонён.*Проверка уведомлений/s), 'moderation decisions arrive to the owner')
r = await student('DELETE', '/me/telegram')
ok(r.status === 200 && r.data.user.telegramLinked === false && r.data.user.phoneVerified === true, 'unlinking keeps the verified phone')

// ---------- 16. admin deletes a tournament ----------
const doomed = (await fresh('GET', '/organizer/tournaments')).data.find(x => x.moderation === 'pending')
ok((await fresh('DELETE', `/admin/tournaments/${doomed.id}`, { reason: 'Дубликат турнира' })).status === 403, 'only admins use the admin delete')
r = await admin('DELETE', `/admin/tournaments/${doomed.id}`, {})
ok(r.status === 400, 'deleting needs a reason')
r = await admin('DELETE', `/admin/tournaments/${doomed.id}`, { reason: 'Дубликат турнира' })
ok(r.status === 204 && (await admin('GET', `/tournaments/${doomed.id}`)).status === 404, 'admin deletes any tournament')
ok((await admin('GET', '/admin/actions')).data.some(a => a.action === 'tournament.delete' && a.targetId === doomed.id && a.note === 'Дубликат турнира'), 'the deletion and its reason are in the audit log')
ok(await waitFor(444, /удалён администратором.*Дубликат/s), 'the owner is told why in Telegram')

// ---------- 17. a verified phone stays verified only while unchanged ----------
const stNow = (await student('GET', '/auth/me')).data.user
r = await student('PATCH', '/me', { name: stNow.name, phone: '+77011234567' })
ok(r.data.user.phoneVerified === true, 'the same number in another format keeps the verification')
r = await student('PATCH', '/me', { name: stNow.name, phone: '+7 702 000 00 00' })
ok(r.data.user.phoneVerified === false, 'changing the number by hand removes the verification')
r = await client()('POST', `/tournaments/${t1.id}/judges`, { name: 'Проверка Рейтинга' })
ok(r.status === 401, 'judges are added by organizers only')
r = await org('POST', `/tournaments/${t1.id}/judges`, { name: 'Судья Без Рейтинга', rating: 10 })
ok(r.status === 201 && r.data.rating === 5, 'organizers cannot set a judge rating (ignored, neutral default)')

// ---------- 18. notification centre (by role) ----------
const notes = async c => (await c('GET', '/me/notifications')).data
const types = list => list.items.map(n => n.type)
const orgN = await notes(org)
ok(types(orgN).includes('organizer.newRegistration') && orgN.items.some(n => n.data.team === 'E2E Команда'), 'organizer: new team registration')
const stN = await notes(student)
ok(types(stN).includes('participant.registrationConfirmed') && types(stN).includes('participant.drawReleased'), 'participant: registration decision and draw (room, side)')
ok(stN.items.find(n => n.type === 'participant.drawReleased').data.room !== undefined, 'the draw notification carries the room')
ok(!types(stN).some(x => x.startsWith('organizer.') || x.startsWith('admin.')), 'a participant gets no organizer or admin events')
const jN = await notes(judge)
ok(types(jN).includes('judge.assigned') && jN.items.find(n => n.type === 'judge.assigned').link.startsWith('/ballot/'), 'judge: assignment with a ballot link')
ok(types(await notes(sabina)).includes('judge.joined'), 'judge: welcome after accepting an invite')
const frN = await notes(fresh)
ok(['organizer.memberJoined', 'organizer.approved', 'organizer.deleted'].every(x => types(frN).includes(x)), 'organizer: who joined, approvals and deletions')
ok(frN.items.find(n => n.type === 'organizer.deleted').link === undefined, 'a deleted tournament has no link')
const adN = await notes(admin)
ok(types(adN).includes('admin.tournamentPending'), 'admin: tournaments waiting for review')
const feed = (await admin('GET', '/admin/notifications')).data
ok(feed.items.length > 0 && feed.items.every(n => n.recipient?.email), 'admin sees the whole platform feed with recipients')
ok((await student('GET', '/admin/notifications')).status === 403, 'the platform feed is admin-only')
const unread0 = (await student('GET', '/me/notifications/unread')).data.count
ok(unread0 === stN.unread && unread0 > 0, `unread counter (${unread0})`)
r = await student('POST', '/me/notifications/read', { ids: [stN.items[0].id] })
ok(r.data.updated === 1 && (await student('GET', '/me/notifications/unread')).data.count === unread0 - 1, 'mark one as read')
r = await timur('POST', '/me/notifications/read', { ids: [stN.items[1].id] })
ok(r.data.updated === 0, "nobody can mark someone else's notifications")
await student('POST', '/me/notifications/read', {})
ok((await student('GET', '/me/notifications/unread')).data.count === 0, 'mark all as read')
if (adN.hasMore) {
  const page2 = (await admin('GET', `/me/notifications?before=${adN.items.at(-1).createdAt}`)).data
  ok(page2.items.every(n => n.createdAt < adN.items.at(-1).createdAt), 'the next page continues where the first ended')
}

// ---------- 19. motion bank ----------
const bank = (await client()('GET', '/motions')).data
ok(bank.total > 0 && bank.items.length <= 24 && bank.items.every(m => m.motion && m.tournament.id), `motion bank lists released motions (${bank.total})`)
ok((await client()('GET', `/motions?search=${encodeURIComponent('уведомления в Telegram')}`)).data.total === 0, 'motions of non-public tournaments never appear')
const eduBank = (await client()('GET', '/motions?topic=education')).data
ok(eduBank.items.every(m => m.topics.includes('education')) && bank.topicCounts.education === eduBank.total, 'topic filter and counters agree')
ok((await client()('GET', '/motions?lang=kz')).data.items.every(m => m.language === 'kz'), 'language filter')
ok((await client()('GET', '/motions?topic=astrology')).status === 400, 'unknown topics are rejected')

// ---------- 20. judges' written feedback and speaker progress ----------
const t4live = (await org('GET', `/tournaments/${t4id}`)).data
const liveRound = t4live.rounds.find(x => x.status === 'released')
const myDebate = (await student('GET', '/me/debates')).data.find(x => x.round.id === liveRound.id)
const COMMENT = 'Сильная структура, но не хватило ответов на POI'
for (const d of t4live.debates.filter(x => x.roundId === liveRound.id && !x.winner)) {
  const bd = (await org('GET', `/ballots/${d.id}`)).data
  const sc = {}, fb = {}
  bd.proposition.speakers.forEach(s => (sc[s.id] = 75)); bd.opposition.speakers.forEach(s => (sc[s.id] = 72))
  if (d.id === myDebate.debate.id) [...bd.proposition.speakers, ...bd.opposition.speakers].forEach(s => (fb[s.id] = COMMENT))
  fb['reply:proposition'] = 'Хороший итог'
  const res = await org('POST', `/ballots/${d.id}`, { winner: 'proposition', scores: sc, reply: { proposition: 37, opposition: 35 }, replySpeakers: { proposition: bd.proposition.speakers[0].id, opposition: bd.opposition.speakers[0].id }, feedback: fb })
  if (res.status !== 201) ok(false, `ballot with feedback ${res.status} ${JSON.stringify(res.data)}`)
}
r = await org('POST', `/ballots/${myDebate.debate.id}`, { winner: 'proposition', scores: {}, reply: { proposition: 37, opposition: 35 }, replySpeakers: { proposition: 'x', opposition: 'y' }, feedback: { x: 'a'.repeat(401) } })
ok(r.status === 400, 'a comment longer than 400 characters is rejected')
let prog = (await student('GET', '/me/progress')).data
ok(!prog.comments.some(c => c.text === COMMENT), 'comments stay hidden until the round is completed')
r = await org('PATCH', `/rounds/${liveRound.id}`, { status: 'completed' })
prog = (await student('GET', '/me/progress')).data
ok(r.status === 200 && prog.comments.some(c => c.text === COMMENT && c.judge && c.round === liveRound.name), "after the round the speaker sees the judge's comment")
ok(prog.summary.speeches >= 3 && prog.summary.average >= 60 && prog.summary.average <= 80 && prog.timeline.length === prog.summary.speeches, `progress: ${prog.summary.speeches} speeches, average ${prog.summary.average}`)
ok(prog.byPosition.length === 3 && prog.byPosition.every(p => p.average === null || (p.average >= 60 && p.average <= 80)), 'averages by position')
ok((await timur('GET', '/me/progress')).data.comments.every(c => c.text !== COMMENT), "nobody else sees someone's comments")
ok((await client()('GET', '/me/progress')).status === 401, 'progress needs sign-in')

// ---------- 21. certificates with QR verification ----------
const finishedT = (await org('GET', '/organizer/tournaments')).data.find(x => x.status === 'finished')
const certs = (await org('GET', `/tournaments/${finishedT.id}/certificates`)).data
ok(certs.length > 0 && certs.every(c => /^[A-Z2-9]{10}$/.test(c.code)), `certificates issued for a finished tournament (${certs.length})`)
ok(certs.some(c => c.kind === 'speaker' && c.teamPlace === 1) && certs.some(c => c.kind === 'judge'), 'speakers (with team place) and judges get certificates')
ok(certs.filter(c => c.speakerPlace).length <= 3 && certs.filter(c => c.inBreak).every(c => c.teamPlace <= finishedT.breakSize), 'top-3 speakers and the break are marked correctly')
const again = (await org('GET', `/tournaments/${finishedT.id}/certificates`)).data
ok(again.length === certs.length && again.every(c => certs.some(x => x.code === c.code)), 'issuing is idempotent: codes never change')
const one = certs[0]
r = await client()('GET', `/certificates/${one.code}`)
ok(r.status === 200 && r.data.name === one.name && r.data.tournament.name === finishedT.name, 'anyone can verify a certificate by its code')
ok((await client()('GET', `/certificates/${one.code.toLowerCase()}`)).status === 200, 'the code is case-insensitive')
ok((await client()('GET', '/certificates/ABCDEFGHJK')).status === 404 && (await client()('GET', '/certificates/nonsense')).status === 404, 'unknown codes are rejected')
ok((await student('GET', `/tournaments/${finishedT.id}/certificates`)).status === 403, 'only organizers list every certificate')
ok((await org('GET', `/tournaments/${t1.id}/certificates`)).data.length === 0, 'no certificates before the tournament is finished')
const judgeOfFinished = certs.find(c => c.kind === 'judge')
const jc = (await judge('GET', '/me/certificates')).data
ok(Array.isArray(jc) && jc.every(c => c.kind === 'judge' || c.kind === 'speaker') && jc.every(c => certs.some(x => x.code === c.code) || c.tournament.id !== finishedT.id), 'my certificates list only my own')
ok(!(await student('GET', '/me/certificates')).data.some(c => c.code === judgeOfFinished?.code), "nobody gets someone else's certificate")

// ---------- 22. QR check-in and the swing team ----------
r = await org('POST', `/tournaments/${t1.id}/checkin/code`)
const ciCode = r.data.code
ok(r.status === 200 && /^[A-Z2-9]{6}$/.test(ciCode) && r.data.present === 0, 'organizer creates a check-in code')
ok((await student('POST', `/checkin/${t1.id}`, { code: 'WRONG1' })).data.error === 'wrong_checkin_code', 'a wrong code is rejected')
r = await student('POST', `/checkin/${t1.id}`, { code: ciCode.toLowerCase() })
ok(r.status === 200 && r.data.team === 'E2E Команда', 'a team member checks the team in by scanning the QR')
ok((await timur('POST', `/checkin/${t1.id}`, { code: ciCode })).data.error === 'not_in_tournament', 'people without a team cannot check in')
for (let i = 0; i < 10; i++) await sabina('POST', `/checkin/${t1.id}`, { code: 'ZZZZZZ' })
ok((await sabina('POST', `/checkin/${t1.id}`, { code: ciCode })).status === 429, 'guessing the code is blocked after 10 misses')
const t1teams = (await org('GET', `/tournaments/${t1.id}`)).data.teams
for (const tm of t1teams.filter(x => x.name !== 'E2E Команда').slice(0, 2)) await org('PATCH', `/teams/${tm.id}/checkin`, { present: true })
ok((await org('GET', `/tournaments/${t1.id}/checkin`)).data.present === 3, 'the organizer marks teams by hand (3 present)')
ok((await student('PATCH', `/teams/${t1teams[0].id}/checkin`, { present: false })).status === 403, 'participants cannot mark teams')
const t1round = (await org('GET', `/tournaments/${t1.id}`)).data.rounds.find(x => x.status === 'draft')
r = await org('POST', `/rounds/${t1round.id}/draw`, { presentOnly: true })
ok(r.status === 400 && r.data.error === 'odd_number_of_teams', 'three present teams cannot be paired without a swing')
r = await org('POST', `/rounds/${t1round.id}/draw`, { presentOnly: true, addSwing: true })
const t1drawn = (await org('GET', `/tournaments/${t1.id}`)).data
const swing = t1drawn.teams.find(x => x.swing)
ok(r.status === 201 && r.data.length === 2 && swing && r.data.some(d => [d.propositionTeamId, d.oppositionTeamId].includes(swing.id)), 'only present teams are drawn, the swing team evens it out')
ok(!(await client()('GET', `/tournaments/${t1.id}/standings`)).data.teams.some(x => x.team.swing || x.team.name === 'Swing'), 'the swing team is never ranked')
r = await org('POST', `/tournaments/${t1.id}/checkin/reset`)
ok(r.data.present === 0, 'check-in can be reset for the next day')

// ---------- 23. find a teammate ----------
ok((await client()('GET', '/teammates')).status === 200, 'anyone can browse the teammate board')
const post = { kind: 'team_needed', city: 'Астана', level: 'school', languages: ['ru', 'kz'], text: 'Ищу команду на школьные турниры, опыт 1 год' }
ok((await client()('POST', '/teammates', post)).status === 401, 'guests cannot post')
ok((await student('POST', '/teammates', { ...post, text: 'коротко' })).status === 400, 'too short posts are rejected')
r = await student('POST', '/teammates', post)
const postId = r.data.id
ok(r.status === 201, 'a participant posts "looking for a team"')
await student('POST', '/teammates', { ...post, kind: 'speaker_needed', text: 'Ищем третьего спикера в команду Вектор' })
await student('POST', '/teammates', { ...post, text: 'Ещё одно объявление о поиске команды' })
ok((await student('POST', '/teammates', { ...post, text: 'Четвёртое объявление подряд — лишнее' })).data.error === 'too_many_posts', 'at most 3 active posts per person')
const board = (await client()('GET', '/teammates?kind=team_needed&city=Астана')).data
const mineOnBoard = board.find(p => p.id === postId)
ok(mineOnBoard && mineOnBoard.author.name && !JSON.stringify(mineOnBoard).match(/@|\+7|phone|email/i), 'posts never expose contacts')
r = await timur('POST', `/teammates/${postId}/reply`, { message: 'Привет! Я из Астаны, давай в команду. Мой Telegram @timur' })
ok(r.status === 201, 'someone replies to a post')
ok((await timur('POST', `/teammates/${postId}/reply`, { message: 'Ещё раз привет' })).status === 409, 'one reply per person and post')
ok((await student('POST', `/teammates/${postId}/reply`, { message: 'Ответ самому себе' })).data.error === 'own_post', 'you cannot reply to your own post')
await new Promise(res => setTimeout(res, 300))
const stNotes = (await student('GET', '/me/notifications')).data.items
ok(stNotes.some(n => n.type === 'participant.teammateReply' && n.data.message.includes('@timur')), 'the reply reaches the author as a notification')
ok((await timur('DELETE', `/teammates/${postId}`)).status === 403, "you cannot close someone else's post")
r = await student('DELETE', `/teammates/${postId}`)
ok(r.status === 204 && !(await client()('GET', '/teammates')).data.some(p => p.id === postId), 'the author closes the post')

// ---------- 24. report behaviour (safeguarding) ----------
const report = { category: 'bullying', about: 'Участник команды X', place: 'Кубок Астаны, раунд 2', description: 'Во время раунда оскорблял спикеров соперника, это видели судьи', anonymous: true }
ok((await client()('POST', '/safety-reports', report)).status === 401, 'reporting needs sign-in')
ok((await student('POST', '/safety-reports', { ...report, description: 'коротко' })).status === 400, 'a report needs a description')
r = await student('POST', '/safety-reports', report)
const safetyId = r.data.id
ok(r.status === 201, 'a participant reports bullying')
ok((await student('GET', '/safety-reports')).status === 403 && (await timur('GET', '/safety-reports')).status === 403, 'ordinary users cannot read reports')
let queueS = (await admin('GET', '/safety-reports')).data
ok(queueS.some(x => x.id === safetyId && x.anonymous && !x.reporter), 'admins see the report; an anonymous reporter stays hidden')
await new Promise(res => setTimeout(res, 300))
ok((await admin('GET', '/me/notifications')).data.items.some(n => n.type === 'admin.safetyReport'), 'admins are notified')
const sabinaUser = (await admin('GET', '/admin/users')).data.find(u => u.email === 'sabina@mail.kz')
r = await admin('PATCH', `/admin/users/${sabinaUser.id}`, { safeguardingOfficer: true })
ok(r.status === 200 && (await sabina('GET', '/safety-reports')).status === 200, 'an admin appoints a safeguarding officer who can read reports')
r = await sabina('PATCH', `/safety-reports/${safetyId}`, { status: 'resolved', resolutionNote: 'Поговорили с тренером команды' })
ok(r.status === 200 && (await student('GET', '/me/safety-reports')).data.find(x => x.id === safetyId).status === 'resolved', 'the officer resolves it and the reporter sees the status')
await new Promise(res => setTimeout(res, 300))
ok((await student('GET', '/me/notifications')).data.items.some(n => n.type === 'participant.safetyUpdate' && n.data.status === 'resolved'), 'the reporter is notified')
ok((await admin('GET', '/admin/actions')).data.some(a => a.action === 'user.safeguardingOn' && a.targetId === sabinaUser.id), 'appointing an officer is logged')
await admin('PATCH', `/admin/users/${sabinaUser.id}`, { safeguardingOfficer: false })
ok((await sabina('GET', '/safety-reports')).status === 403, 'removing the role removes access')


// ---------- 25. sign in with Google (Google is played by the runner's fake token endpoint) ----------
const G = process.env.FAKE_GOOGLE
const cookieOf = (res, name) => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).find(c => c.startsWith(`${name}=`))
function cookieClient(cookie) {
  return async (method, path, body) => {
    const res = await fetch(A + path, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), Cookie: cookie }, body: body && JSON.stringify(body) })
    return { status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) }
  }
}
const sessionOf = async email => cookieOf(await fetch(`${A}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234' }) }), 'dkz_token')
// runs start → (Google) → callback like a browser; `session` is an existing dkz_token cookie (for linking)
async function google(claims, { mode = 'login', next = '/tournaments', session = '', tamper } = {}) {
  const start = await fetch(`${A}/auth/google/start?mode=${mode}&next=${encodeURIComponent(next)}`, { redirect: 'manual', headers: session ? { Cookie: session } : {} })
  const to = new URL(start.headers.get('location'))
  const flow = cookieOf(start, 'dkz_google')
  const p = to.searchParams
  const full = { iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, nonce: p.get('nonce'), email_verified: true, ...claims }
  let code = Buffer.from(JSON.stringify({ claims: full, challenge: p.get('code_challenge') })).toString('base64url')
  let state = p.get('state')
  let cookies = [flow, session].filter(Boolean)
  if (tamper === 'state') state = 'forged'
  if (tamper === 'cookie') cookies = [session].filter(Boolean)
  if (tamper === 'pkce') code = Buffer.from(JSON.stringify({ claims: full, challenge: 'other' })).toString('base64url')
  const cb = await fetch(`${A}/auth/google/callback?state=${state}&code=${code}`, { redirect: 'manual', headers: { Cookie: cookies.join('; ') } })
  const loc = new URL(cb.headers.get('location'))
  const sess = cookieOf(cb, 'dkz_token')
  return { start: to, loc, session: sess, as: sess ? cookieClient(sess) : null }
}
const mails = async to => (await (await fetch(`${A}/test/mail?to=${encodeURIComponent(to)}`)).json())

ok((await client()('GET', '/auth/google/config')).data.enabled === true, 'Google sign-in is enabled when the client id and secret are set')
let g = await google({ sub: `g-new-${uniq}`, email: `Ali.${uniq}@gmail.com`, name: 'Али Серикбаев', picture: `${G}/photo.png` })
const gp = g.start.searchParams
ok(g.start.origin + g.start.pathname === `${G}/auth` && gp.get('scope') === 'openid email profile' && gp.get('code_challenge_method') === 'S256' && !!gp.get('state') && !!gp.get('nonce'),
  'start sends the browser to Google with state, nonce and a PKCE challenge')
ok(g.loc.pathname === '/me' && g.loc.searchParams.get('welcome') === '1' && !!g.session, 'a new Google user is signed in and sent to the profile to complete it')
const gme = (await g.as('GET', '/auth/me')).data.user
ok(gme.email === `ali.${uniq}@gmail.com` && gme.name === 'Али Серикбаев' && gme.emailVerified && gme.googleLinked && gme.googleEmail === gme.email && !gme.hasPassword,
  'the profile gets the name and email from Google, the email is confirmed, no password')
ok(!!gme.avatarUrl?.startsWith('/uploads/avatars/') && (await fetch(`${A.replace(/\/api$/, '')}${gme.avatarUrl}`)).ok, 'the Google photo becomes the avatar (re-encoded, served locally)')
ok((await mails(gme.email)).some(m => m.subject.includes('Добро пожаловать')), 'a welcome letter goes to the Google address')
ok((await client()('POST', '/auth/login', { email: gme.email, password: 'anything123' })).status === 401, 'a Google-only account cannot sign in with a password')
g = await google({ sub: `g-new-${uniq}`, email: `ali.${uniq}@gmail.com`, name: 'Другое Имя' })
ok(g.loc.pathname === '/tournaments' && (await g.as('GET', '/auth/me')).data.user.id === gme.id, 'the next Google sign-in finds the same account and returns to "next"')

g = await google({ sub: `g-x-${uniq}`, email: `x.${uniq}@gmail.com` }, { tamper: 'state' })
ok(g.loc.searchParams.get('google_error') === 'google_expired' && !g.session, 'a forged state is refused (CSRF)')
g = await google({ sub: `g-x-${uniq}`, email: `x.${uniq}@gmail.com` }, { tamper: 'cookie' })
ok(g.loc.searchParams.get('google_error') === 'google_expired' && !g.session, 'a callback without the flow cookie is refused')
g = await google({ sub: `g-x-${uniq}`, email: `x.${uniq}@gmail.com` }, { tamper: 'pkce' })
ok(g.loc.searchParams.get('google_error') === 'google_failed' && !g.session, 'a wrong PKCE verifier is refused by the token endpoint')
g = await google({ sub: `g-x-${uniq}`, email: `x.${uniq}@gmail.com`, nonce: 'replayed' })
ok(g.loc.searchParams.get('google_error') === 'google_failed' && !g.session, 'an ID token with another nonce is refused (replay)')
g = await google({ sub: `g-x-${uniq}`, email: `x.${uniq}@gmail.com`, aud: 'someone-else.apps.googleusercontent.com' })
ok(g.loc.searchParams.get('google_error') === 'google_failed' && !g.session, 'an ID token issued to another app is refused')
g = await google({ sub: `g-x-${uniq}`, email: `x.${uniq}@gmail.com`, email_verified: false })
ok(g.loc.searchParams.get('google_error') === 'google_email_unverified' && !g.session, 'an unconfirmed Google email is refused')
g = await google({ sub: `g-y-${uniq}`, email: `y.${uniq}@gmail.com` }, { next: '//evil.example/steal' })
ok(g.loc.hostname !== 'evil.example' && g.loc.pathname === '/me', 'next cannot redirect to another site')

// an existing confirmed account: Google is linked, the password keeps working
g = await google({ sub: `g-student-${uniq}`, email: 'student@debate.kz' })
const stMe = (await student('GET', '/auth/me')).data.user
ok((await g.as('GET', '/auth/me')).data.user.id === stMe.id && stMe.googleLinked && stMe.hasPassword, 'Google with the email of an existing account links to it')
ok((await client()('POST', '/auth/login', { email: 'student@debate.kz', password: 'demo1234' })).status === 200, 'the password of that account still works')
ok((await mails('student@debate.kz')).some(m => m.subject.includes('Google подключён')), 'the owner gets a letter that Google was linked')
g = await google({ sub: `g-student-other-${uniq}`, email: 'student@debate.kz' })
ok(g.loc.searchParams.get('google_error') === 'google_mismatch' && !g.session, 'another Google account with the same email cannot take over a linked account')

// account pre-hijacking: someone registered a victim's address with their own password and never confirmed it
const victim = `victim.${uniq}@gmail.com`
const squatter = client()
await squatter('POST', '/auth/register', { name: 'Чужой Человек', email: victim, phone: '+7 707 111 22 33', password: 'squatter123', consent: true })
g = await google({ sub: `g-victim-${uniq}`, email: victim, name: 'Настоящий Владелец' })
ok(!!g.session && (await client()('POST', '/auth/login', { email: victim, password: 'squatter123' })).status === 401, "the owner's Google sign-in drops the squatter's password")
ok((await squatter('GET', '/auth/me')).data.user === null, "the squatter's session ends")
ok((await g.as('GET', '/auth/me')).data.user.emailVerified, 'the address is now confirmed by Google')

// link / unlink from the profile
g = await google({ sub: `g-timur-${uniq}`, email: `timur.${uniq}@gmail.com` }, { mode: 'link', session: await sessionOf('timur@mail.kz') })
const tMe = (await timur('GET', '/auth/me')).data.user
ok(g.loc.searchParams.get('google') === 'linked' && tMe.googleLinked && tMe.googleEmail === `timur.${uniq}@gmail.com` && tMe.email === 'timur@mail.kz', 'a signed-in user links a Google account with another address')
g = await google({ sub: `g-timur-${uniq}`, email: `timur.${uniq}@gmail.com` }, { mode: 'link', session: await sessionOf('sabina@mail.kz') })
ok(g.loc.searchParams.get('google_error') === 'google_taken', 'a Google account linked to someone else cannot be linked again')
r = await timur('DELETE', '/auth/google')
ok(r.status === 200 && !r.data.user.googleLinked && (await mails('timur@mail.kz')).some(m => m.subject.includes('Google отключён')), 'unlinking Google works and the owner is told by email')
g = await google({ sub: `g-z-${uniq}`, email: `z.${uniq}@gmail.com` }, { mode: 'link' })
ok(g.start.pathname === '/login' && g.start.searchParams.get('google_error') === 'login_required', 'linking needs a signed-in user')

// a Google-only account: unlink needs a password first; the password is set through a link sent by email
const ali = cookieClient((await google({ sub: `g-new-${uniq}`, email: `ali.${uniq}@gmail.com` })).session)
ok((await ali('DELETE', '/auth/google')).data?.error === 'set_password_first', 'a Google-only account cannot unlink Google before it has a password')
ok((await ali('POST', '/me/password', { currentPassword: 'x', newPassword: 'newpass123' })).data?.error === 'no_password', 'there is no "current password" to change yet')
r = await ali('POST', '/me/password/setup')
ok(r.status === 200 && (await mails(`ali.${uniq}@gmail.com`)).some(m => m.subject.includes('задайте пароль') && m.action?.url.includes('/reset-password?token=')), 'a "set a password" link goes to the Google email')
r = await client()('POST', '/auth/reset-password', { token: r.data.devResetToken, password: 'alipass123' })
ok(r.status === 200 && r.data.user.hasPassword && (await client()('POST', '/auth/login', { email: `ali.${uniq}@gmail.com`, password: 'alipass123' })).status === 200, 'the link sets the password; email + password now works too')
ok((await mails(`ali.${uniq}@gmail.com`)).some(m => m.subject.includes('пароль задан')), 'a "password set" letter confirms it')

// blocked users stay out; deleting a Google-only account is confirmed by typing the email
const blockedG = await google({ sub: `g-block-${uniq}`, email: `block.${uniq}@gmail.com` })
const blockedId = (await blockedG.as('GET', '/auth/me')).data.user.id
await admin('PATCH', `/admin/users/${blockedId}`, { blocked: true })
g = await google({ sub: `g-block-${uniq}`, email: `block.${uniq}@gmail.com` })
ok(g.loc.searchParams.get('google_error') === 'blocked' && !g.session, 'a blocked user cannot sign in with Google')
const del = (await google({ sub: `g-del-${uniq}`, email: `del.${uniq}@gmail.com` })).as
ok((await del('DELETE', '/me', { email: 'wrong@gmail.com' })).data?.error === 'wrong_email', 'deleting a Google-only account needs its email typed')
ok((await del('DELETE', '/me', { email: `del.${uniq}@gmail.com` })).status === 204, 'with the right email the account is deleted')

// ordinary accounts: changing the password sends a security letter
r = await sabina('POST', '/me/password', { currentPassword: 'demo1234', newPassword: 'sabina-new-1' })
ok(r.status === 200 && (await mails('sabina@mail.kz')).some(m => m.subject.includes('пароль изменён')), 'a password change sends a "password changed" letter')
await sabina('POST', '/me/password', { currentPassword: 'sabina-new-1', newPassword: 'demo1234' })


// ---------- 26. Pro tournaments (> 20 teams) paid by Kaspi QR, confirmed by an admin ----------
r = await client()('GET', '/plans')
ok(r.status === 200 && r.data.freeTeamLimit === 20 && r.data.proPrice > 0, 'the public plan info says: free up to 20 teams, with the Pro price')
await admin('PATCH', '/admin/settings', { proPrice: 25000, recipient: 'Ермек А.', phone: '+7 777 000 00 00', note: 'Укажите код платежа в комментарии' })
ok((await client()('PATCH', '/admin/settings', { proPrice: 1 })).status === 401 && (await student('PATCH', '/admin/settings', { proPrice: 1 })).status === 403, 'only admins change the price and the Kaspi details')
const payer = client()
r = await payer('POST', '/auth/register', { name: 'Плательщик Тестов', email: `payer.${uniq}@mail.kz`, phone: '+7 707 222 11 00', password: 'secret123', consent: true })
await payer('POST', '/auth/verify-email', { token: r.data.devVerificationToken })
const small = (await payer('POST', '/tournaments', { ...tBody(20), name: `Малый ${uniq}`, maxTeams: 20 })).data
const smallD = (await payer('GET', `/tournaments/${small.id}`)).data
ok(smallD.plan === 'free' && smallD.paid === true, 'a tournament of 20 teams is free')
ok((await payer('GET', `/tournaments/${small.id}/payment`)).data.required === false, 'a free tournament needs no payment')
const big = (await payer('POST', '/tournaments', { ...tBody(21), name: `Большой ${uniq}`, maxTeams: 24 })).data
const bigD = (await payer('GET', `/tournaments/${big.id}`)).data
ok(bigD.plan === 'pro' && bigD.paid === false, 'more than 20 teams is Pro and waits for payment')
let pay = (await payer('GET', `/tournaments/${big.id}/payment`)).data
ok(pay.required && !pay.paid && pay.amount === 25000 && /^DKZ-[A-Z2-9]{6}$/.test(pay.reference) && pay.status === 'awaiting' && pay.kaspi.recipient === 'Ермек А.',
  'the organizer gets the amount, a payment reference and the Kaspi details')
ok((await payer('GET', `/tournaments/${big.id}/payment`)).data.reference === pay.reference, 'the reference stays the same on every visit')
ok((await student('GET', `/tournaments/${big.id}/payment`)).status === 403, 'strangers cannot see the payment')
for (let i = 1; i <= 20; i++) await payer('POST', `/tournaments/${big.id}/teams`, { name: `Команда ${i}`, institution: `Школа ${i}`, speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
r = await payer('POST', `/tournaments/${big.id}/teams`, { name: 'Команда 21', institution: 'Школа 21', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
ok(r.status === 402 && r.data.error === 'payment_required', 'an unpaid Pro tournament stops at 20 teams')
ok((await payer('POST', `/tournaments/${big.id}/payment/claim`, { payerNote: '' })).status === 400, '"I have paid" needs the payer name or time')
r = await payer('POST', `/tournaments/${big.id}/payment/claim`, { payerNote: 'Плательщик Т., 14:05' })
ok(r.status === 200 && (await payer('GET', `/tournaments/${big.id}/payment`)).data.status === 'pending', '"I have paid" puts the payment in the admin queue')
ok((await payer('POST', `/tournaments/${big.id}/payment/claim`, { payerNote: 'ещё раз' })).data?.error === 'payment_already_claimed', 'it cannot be claimed twice while waiting')
await new Promise(res => setTimeout(res, 300))
ok((await admin('GET', '/me/notifications')).data.items.some(n => n.type === 'admin.paymentClaimed' && n.data.reference === pay.reference), 'admins are notified with the reference')
let queue = (await admin('GET', '/admin/payments')).data
const payRow = queue.find(x => x.reference === pay.reference)
ok(payRow?.status === 'pending' && payRow.payerNote === 'Плательщик Т., 14:05' && payRow.tournament.id === big.id, 'the admin sees the claim with the payer note')
ok((await student('GET', '/admin/payments')).status === 403, 'only admins see payments')
ok((await admin('PATCH', `/admin/payments/${payRow.id}`, { status: 'rejected' })).data?.error === 'reason_required', 'a rejection needs a reason')
r = await admin('PATCH', `/admin/payments/${payRow.id}`, { status: 'rejected', adminNote: 'Перевод не найден' })
pay = (await payer('GET', `/tournaments/${big.id}/payment`)).data
ok(r.status === 200 && pay.status === 'rejected' && pay.adminNote === 'Перевод не найден' && !pay.paid, 'the admin rejects; the organizer sees why')
ok((await mails(`payer.${uniq}@mail.kz`)).some(m => m.subject.includes('не подтверждена')), 'the organizer gets a "not confirmed" letter')
await payer('POST', `/tournaments/${big.id}/payment/claim`, { payerNote: 'Плательщик Т., перевод 15:20' })
r = await admin('PATCH', `/admin/payments/${payRow.id}`, { status: 'confirmed' })
pay = (await payer('GET', `/tournaments/${big.id}/payment`)).data
ok(r.status === 200 && pay.paid && pay.status === 'confirmed', 'after the second claim the admin confirms; the tournament is paid')
ok((await payer('POST', `/tournaments/${big.id}/teams`, { name: 'Команда 21', institution: 'Школа 21', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })).status === 201, 'the 21st team is accepted after payment')
ok((await admin('PATCH', `/admin/payments/${payRow.id}`, { status: 'confirmed' })).data?.error === 'payment_not_pending', 'a handled payment cannot be handled again')
ok((await admin('GET', '/admin/actions')).data.some(a => a.action === 'tournament.paid' && a.targetId === big.id && a.note.includes(pay.reference)), 'the confirmation is in the audit log with the reference')
ok((await mails(`payer.${uniq}@mail.kz`)).some(m => m.subject.includes('подтверждена') && !m.subject.includes('не ')), 'the organizer gets a "payment confirmed" letter')
await payer('PATCH', `/tournaments/${big.id}`, { maxTeams: 20 })
await payer('PATCH', `/tournaments/${big.id}`, { maxTeams: 24 })
ok((await payer('GET', `/tournaments/${big.id}`)).data.paid === true, 'a confirmed payment stays valid when the limit changes')
await admin('PATCH', '/admin/settings', { proPrice: 20000 })


// ---------- 27. judges (and co-organizers) invited by email ----------
await admin('PATCH', `/admin/tournaments/${small.id}`, { moderation: 'approved' })
ok((await student('POST', `/tournaments/${small.id}/invites/email`, { email: 'sabina@mail.kz' })).status === 403, 'only the organizers of a tournament can invite')
r = await payer('POST', `/tournaments/${small.id}/invites/email`, { email: 'Sabina@Mail.kz' })
ok(r.status === 201 && r.data.registered === true && r.data.state === 'pending' && r.data.kind === 'judge', 'an organizer invites a registered person as a judge by email')
ok((await payer('POST', `/tournaments/${small.id}/invites/email`, { email: 'sabina@mail.kz' })).data?.error === 'already_invited', 'the same person cannot be invited twice while the invite is open')
await new Promise(res => setTimeout(res, 300))
const invNote = (await sabina('GET', '/me/notifications')).data.items.find(n => n.type === 'participant.inviteReceived' && n.data.tournament === small.name)
ok(!!invNote && invNote.link.startsWith('/invite/'), 'the invited person gets a notification with the invite')
ok((await mails('sabina@mail.kz')).some(m => m.subject.includes('приглашение судить') && m.action?.url.includes('/invite/')), 'and a letter with the invite link')
const invToken = invNote.link.split('/').pop()
r = await client()('GET', `/invites/${invToken}`)
ok(r.data.forEmail === 's***@mail.kz' && r.data.state === 'valid', 'the invite page shows whom it is for, with the address masked')
ok((await timur('POST', `/invites/${invToken}/accept`)).data?.error === 'invite_other_email', 'another account cannot accept an invite sent to someone else')
ok((await timur('POST', `/invites/${invToken}/decline`)).data?.error === 'invite_other_email', 'nor decline it')
r = await sabina('POST', `/invites/${invToken}/decline`)
let invList = (await payer('GET', `/tournaments/${small.id}/invites`)).data
ok(r.status === 200 && invList.find(i => i.email === 'sabina@mail.kz')?.state === 'declined', 'the person declines; the organizer sees "declined"')
await new Promise(res => setTimeout(res, 300))
ok((await payer('GET', '/me/notifications')).data.items.some(n => n.type === 'organizer.inviteDeclined'), 'the organizer is notified about the refusal')
ok((await sabina('POST', `/invites/${invToken}/accept`)).data?.error === 'invite_declined', 'a declined invite cannot be accepted later')
r = await payer('POST', `/tournaments/${small.id}/invites/email`, { email: 'sabina@mail.kz' })
ok(r.status === 201, 'after a refusal the organizer may invite again')
await new Promise(res => setTimeout(res, 300))
const inv2 = (await sabina('GET', '/me/notifications')).data.items.filter(n => n.type === 'participant.inviteReceived' && n.data.tournament === small.name)[0].link.split('/').pop()
r = await sabina('POST', `/invites/${inv2}/accept`)
ok(r.status === 200 && r.data.kind === 'judge' && (await sabina('GET', '/judge/assignments')).status === 200, 'accepting turns on the judge functions for this tournament')
invList = (await payer('GET', `/tournaments/${small.id}/invites`)).data
ok(invList.some(i => i.state === 'accepted' && i.acceptedBy), 'the organizer sees who accepted')
ok((await payer('POST', `/tournaments/${small.id}/invites/email`, { email: 'sabina@mail.kz' })).data?.error === 'already_joined', 'someone who already judges here is not invited again')

// a participant of the tournament cannot be invited to judge it
await student('POST', `/tournaments/${small.id}/registrations`, { teamName: `Студенты ${uniq}`, institution: 'Лицей', speakers: ['Студент Демо', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33' })
ok((await payer('POST', `/tournaments/${small.id}/invites/email`, { email: 'student@debate.kz' })).data?.error === 'conflict_of_interest', 'a person registered as a participant cannot be invited to judge')

// someone without an account: the letter asks to sign up with that address
const newbie = `newjudge.${uniq}@mail.kz`
r = await payer('POST', `/tournaments/${small.id}/invites/email`, { email: newbie })
ok(r.status === 201 && r.data.registered === false && (await mails(newbie)).some(m => m.text.includes('зарегистрируйтесь')), 'an address without an account gets a sign-up invite')
const newbieToken = (await mails(newbie)).at(-1).action.url.split('/').pop()
const nb = client()
r = await nb('POST', '/auth/register', { name: 'Новый Судья', email: newbie, phone: '+7 707 333 44 55', password: 'secret123', consent: true })
await nb('POST', '/auth/verify-email', { token: r.data.devVerificationToken })
ok((await nb('POST', `/invites/${newbieToken}/accept`)).status === 200, 'after signing up with that address the invite can be accepted')

// withdrawing an unanswered invite
r = await payer('POST', `/tournaments/${small.id}/invites/email`, { email: 'timur@mail.kz' })
const tInv = r.data.id
ok((await payer('DELETE', `/tournaments/${small.id}/invites/${tInv}`)).status === 204 && (await payer('GET', `/tournaments/${small.id}/invites`)).data.find(i => i.id === tInv).state === 'expired', 'the organizer can withdraw an unanswered invite')


// ---------- 28. clubs and teams (all members equal) ----------
const stSession = (await student('GET', '/auth/me')).data.user
ok(!!stSession.club?.name && !!stSession.clubTeam?.name, 'the demo participant has a club and a team in the profile')
r = await client()('GET', '/clubs')
ok(r.status === 200 && r.data.length > 0 && r.data.every(c => c.name && c.city && typeof c.members === 'number'), 'the public club list works')
const clubA = client(), clubB = client(), outsider = client()
for (const [c, n] of [[clubA, 'a'], [clubB, 'b'], [outsider, 'o']]) {
  r = await c('POST', '/auth/register', { name: `Клубный Член${n}`, email: `club${n}.${uniq}@mail.kz`, phone: '+7 707 555 66 77', password: 'secret123', consent: true })
  await c('POST', '/auth/verify-email', { token: r.data.devVerificationToken })
}
r = await clubA('POST', '/clubs', { name: `Клуб ${uniq}`, city: 'Астана', institution: 'ЕНУ' })
const clubId = r.data.id
ok(r.status === 201, 'a verified user creates a club and becomes its member')
ok((await clubA('POST', '/clubs', { name: `Второй ${uniq}`, city: 'Астана' })).data?.error === 'already_in_club', 'one person is in one club only')
ok((await clubB('POST', '/clubs', { name: `Клуб ${uniq}`, city: 'Астана' })).data?.error === 'club_exists', 'club names are unique within a city')
let club = (await clubA('GET', `/clubs/${clubId}`)).data
ok(club.isMember && /^[A-Z2-9]{8}$/.test(club.joinCode) && club.log.some(l => l.action === 'created'), 'members see the join code and the club log')
ok((await client()('GET', `/clubs/${clubId}`)).data.joinCode === undefined, 'outsiders do not see the join code')
r = await clubA('POST', `/clubs/${clubId}/teams`, { name: 'Альфа', join: true })
const alpha = r.data.id
ok(r.status === 201 && (await clubA('GET', '/me/club')).data.team?.name === 'Альфа', 'a member creates a team and joins it')
ok((await clubA('POST', `/clubs/${clubId}/teams`, { name: 'Альфа' })).data?.error === 'team_exists', 'team names are unique in a club')
ok((await outsider('POST', `/clubs/${clubId}/teams`, { name: 'Чужая' })).data?.error === 'not_club_member', 'a non-member cannot change the club')
ok((await client()('GET', `/clubs/code/${club.joinCode}`)).data.id === clubId, 'the join link shows which club it is')
r = await clubB('POST', '/clubs/join', { code: club.joinCode.toLowerCase() })
ok(r.status === 200 && r.data.id === clubId, 'a person joins with the link (the code is case-insensitive)')
await new Promise(res => setTimeout(res, 300))
ok((await clubA('GET', '/me/notifications')).data.items.some(n => n.type === 'participant.clubJoined'), 'members are told who joined')
// all members are equal: the newcomer creates a team, renames, moves members, edits the club
r = await clubB('POST', `/clubs/${clubId}/teams`, { name: 'Бета' })
const beta = r.data.id
const aId = (await clubA('GET', '/auth/me')).data.user.id, bId = (await clubB('GET', '/auth/me')).data.user.id
ok((await clubB('PUT', `/clubs/${clubId}/members/${aId}/team`, { teamId: beta })).status === 200 && (await clubA('GET', '/me/club')).data.team?.name === 'Бета', 'any member can put another member into a team')
ok((await clubB('PATCH', `/club-teams/${alpha}`, { name: 'Альфа-2' })).status === 200, 'any member can rename a team')
ok((await clubB('PATCH', `/clubs/${clubId}`, { description: 'Мы спорим по средам' })).status === 200 && (await client()('GET', `/clubs/${clubId}`)).data.description === 'Мы спорим по средам', 'any member edits the club page')
club = (await clubA('GET', `/clubs/${clubId}`)).data
ok(club.log.some(l => l.action === 'team.assigned' && l.userName.includes('Членb')) && club.log.some(l => l.action === 'team.renamed'), 'the log shows who changed what')
ok(club.teams.find(t => t.id === beta).members.some(m => m.id === aId), 'the club page lists team members')
const otherClub = (await client()('GET', '/clubs')).data.find(c => c.id !== clubId)
ok((await clubB('PUT', `/clubs/${clubId}/members/${bId}/team`, { teamId: (await client()('GET', `/clubs/${otherClub.id}`)).data.teams[0]?.id ?? 'x' })).data?.error === 'team_not_in_club', 'a member cannot be put into a team of another club')
const oldCode = club.joinCode
r = await clubB('POST', `/clubs/${clubId}/code`)
ok(r.data.joinCode !== oldCode && (await outsider('POST', '/clubs/join', { code: oldCode })).status === 404, 'resetting the link stops the old one')
// registration for a tournament needs a club and a team
r = await outsider('POST', `/tournaments/${small.id}/registrations`, { teamName: `Без клуба ${uniq}`, institution: 'Школа', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33' })
ok(r.data?.error === 'club_required', 'without a club and a team in the profile you cannot apply to a tournament')
await outsider('POST', '/clubs/join', { code: r.data ? (await clubA('GET', `/clubs/${clubId}`)).data.joinCode : '' })
await outsider('PUT', `/clubs/${clubId}/members/${(await outsider('GET', '/auth/me')).data.user.id}/team`, { teamId: beta })
r = await outsider('POST', `/tournaments/${small.id}/registrations`, { teamName: `С клубом ${uniq}`, institution: 'ЕНУ', speakers: ['Клубный Членo', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33' })
ok(r.status === 201, 'with a club and a team the application goes through')
const smallRegs = (await payer('GET', `/tournaments/${small.id}/registrations`)).data
await payer('PATCH', `/registrations/${smallRegs.find(x => x.teamName === `С клубом ${uniq}`).id}`, { status: 'confirmed' })
const smallTeams = (await payer('GET', `/tournaments/${small.id}`)).data.teams
ok(smallTeams.find(tm => tm.name === `С клубом ${uniq}`)?.club?.id === clubId, 'the confirmed tournament team remembers its club')
// leaving and removing
const oId = (await outsider('GET', '/auth/me')).data.user.id
ok((await clubB('DELETE', `/clubs/${clubId}/members/${bId}`)).data?.error === 'use_leave', 'you leave a club yourself, not remove yourself')
r = await clubA('DELETE', `/clubs/${clubId}/members/${oId}`)
ok(r.status === 204 && !(await outsider('GET', '/auth/me')).data.user.club, 'any member can remove another member')
await new Promise(res => setTimeout(res, 300))
ok((await outsider('GET', '/me/notifications')).data.items.some(n => n.type === 'participant.clubRemoved'), 'the removed person is told')
ok((await clubB('POST', `/clubs/${clubId}/leave`)).status === 204 && (await clubB('GET', '/me/club')).data.club === undefined, 'a member leaves the club')

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
