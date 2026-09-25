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
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { maxTeams: 16 })
po = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data
ok(r.status === 200 && po.plan === 'pro' && po.paid === false, 'raising the limit above 12 switches to unpaid Pro')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { maxTeams: 8 })
po = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data
ok(po.plan === 'free' && po.paid === true, 'lowering back to 12 or less returns to Free')
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

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
