// End-to-end API scenario against the local dev server.
// Usage: npm run dev (in another terminal), then: npm run test:e2e && npm run db:seed
// It MUTATES the dev database (registrations, ballots, draws); re-seed afterwards. Never point it at production.
const A = process.env.API_URL ?? 'http://localhost:4000/api'

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

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
