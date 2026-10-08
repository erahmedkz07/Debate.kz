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

// ---------- judges vote only from their own accounts ----------
// The seed's judges have names only. A check that needs a ballot links such a judge to a fresh account in the test DB
// (as accepting an invite does) and votes as that judge; new judges join through an invite link, as on the site.
const { default: pgModule } = await import('pg')
const db = new pgModule.Client({ connectionString: process.env.E2E_DATABASE_URL })
await db.connect()
const jtag = Date.now().toString(36)
let accounts = 0
const newAccount = async (name) => {
  const c = client()
  const email = `acct.${jtag}.${++accounts}@mail.kz`
  const res = await c('POST', '/auth/register', { name, email, phone: '+7 707 000 00 00', password: 'secret123', consent: true })
  await c('POST', '/auth/verify-email', { token: res.data.devVerificationToken })
  return { c, id: res.data.user.id, email }
}
const judgeClients = new Map()
const judgeAs = async (judgeId) => {
  if (judgeClients.has(judgeId)) return judgeClients.get(judgeId)
  const j = (await db.query('select j.name, u.email from judges j left join users u on u.id = j.user_id where j.id = $1', [judgeId])).rows[0]
  let c
  if (j.email) {
    c = client()
    if ((await c('POST', '/auth/login', { email: j.email, password: 'demo1234' })).status !== 200) await c('POST', '/auth/login', { email: j.email, password: 'secret123' })
  } else {
    const a = await newAccount(j.name.includes(' ') ? j.name : `${j.name} Судья`)
    await db.query('update judges set user_id = $1 where id = $2', [a.id, judgeId])
    c = a.c
  }
  judgeClients.set(judgeId, c)
  return c
}
// every judge on the panel sends a ballot built from the sheet they see
const panelVote = async (debateId, build) => {
  const panel = (await db.query('select judge_id from debate_judges where debate_id = $1', [debateId])).rows
  for (const { judge_id } of panel) {
    const c = await judgeAs(judge_id)
    const sheet = (await c('GET', `/ballots/${debateId}`)).data
    const res = await c('POST', `/ballots/${debateId}`, build(sheet))
    if (res.status !== 201) ok(false, `panel ballot ${res.status} ${JSON.stringify(res.data)}`)
  }
}
// a new judge joins a tournament through an invite link and accepts it from a fresh account
const addJudge = async (orgClient, tournamentId, name) => {
  const a = await newAccount(name)
  const link = (await orgClient('POST', `/tournaments/${tournamentId}/invites`, { kind: 'judge' })).data.url
  const res = await a.c('POST', `/invites/${link.split('/invite/')[1]}/accept`)
  if (res.status !== 200) ok(false, `judge accepts ${res.status} ${JSON.stringify(res.data)}`)
  const id = (await db.query('select id from judges where tournament_id = $1 and user_id = $2', [tournamentId, a.id])).rows[0].id
  judgeClients.set(id, a.c)
  return { status: 201, data: { id } }
}

// ---------- 1. registration -> confirmation ----------
const mine = (await org('GET', '/organizer/tournaments')).data
const t1 = mine.find(t => t.status === 'registration')
const before = t1.teamsCount
let r = await student('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'E2E Команда', institution: 'Лицей №15', speakers: ['Тест Первый', 'Тест Второй', 'Тест Третий'], phone: '+7 701 555 44 33', guardianConsent: true })
ok(r.status === 201, `participant registers team (${r.status})`)
r = await student('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'E2E Команда', institution: 'Лицей №15', speakers: ['А Б', 'В Г', 'Д Е'].map(s => s + 'ов'), phone: '+7 701 555 44 33', guardianConsent: true })
ok(r.status === 409 && r.data.error === 'team_name_taken', 'duplicate team name rejected')
const t4id = mine.find(t => t.status === 'ongoing').id
r = await judge('POST', `/tournaments/${t4id}/registrations`, { teamName: 'Команда судьи', institution: 'Лицей №1', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
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
// the organizer cannot fill ballots: the panels vote themselves
{
  const d0 = det.debates.find(x => x.roundId === live.id && !x.winner)
  const bd = (await org('GET', `/ballots/${d0.id}`)).data
  const sc = {}
  bd.proposition.speakers.forEach(s => (sc[s.id] = 74)); bd.opposition.speakers.forEach(s => (sc[s.id] = 73.5))
  r = await org('POST', `/ballots/${d0.id}`, { winner: 'proposition', scores: sc, reply: { proposition: 36, opposition: 36 }, replySpeakers: { proposition: bd.proposition.speakers[0].id, opposition: bd.opposition.speakers[0].id } })
  ok(r.status === 403 && r.data.error === 'judges_only', 'the organizer cannot send or change a ballot')
  ok((await admin('POST', `/ballots/${d0.id}`, {})).data?.error === 'judges_only', 'an admin cannot either')
}
for (const d of det.debates.filter(x => x.roundId === live.id && !x.winner)) {
  await panelVote(d.id, bd => {
    const sc = {}
    bd.proposition.speakers.forEach(s => (sc[s.id] = 74)); bd.opposition.speakers.forEach(s => (sc[s.id] = 73.5))
    return { winner: 'proposition', scores: sc, reply: { proposition: 36, opposition: 36 }, replySpeakers: { proposition: bd.proposition.speakers[0].id, opposition: bd.opposition.speakers[0].id } }
  })
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
ok(r.status === 201 && r.data.debates.length === det.teams.length / 2, `power-paired draw generated (${r.data?.debates?.length} rooms)`)
const draw = r.data.debates
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
r = await fresh('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'Z', institution: 'Лицей', speakers: ['Ааа Бб', 'Ввв Гг', 'Ддд Ее'], phone: '+7 701 555 44 33', guardianConsent: true })
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
r = await student('POST', `/tournaments/${own1.id}/registrations`, { teamName: 'Поздняя команда', institution: 'Лицей №3', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
ok(r.status === 403 && r.data.error === 'registration_closed', 'registration is closed once the tournament is ongoing')
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'registration' })
ok(r.status === 200, 'can go back to registration while no round is released')
await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'ongoing' })
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'finished' })
ok(r.status === 200 && r.data.status === 'finished', 'owner finishes the tournament')
{
  // certificates exist right after finishing, before anyone opens a profile or prints them
  const { default: pgc } = await import('pg')
  const dbc = new pgc.Client({ connectionString: process.env.E2E_DATABASE_URL })
  await dbc.connect()
  let n = 0
  for (let i = 0; i < 20 && !n; i++) { n = Number((await dbc.query('select count(*) from certificates where tournament_id = $1', [own1.id])).rows[0].count); if (!n) await new Promise(res => setTimeout(res, 100)) }
  await dbc.end()
  ok(n > 0, 'certificates are issued as soon as the tournament is finished')
}
r = await fresh('PATCH', `/tournaments/${own1.id}`, { status: 'ongoing' })
ok(r.status === 400 && r.data.error === 'invalid_status_transition', 'a finished tournament cannot be reopened')
const pendingOwn = (await fresh('GET', '/organizer/tournaments')).data.find(t => t.moderation === 'pending')
r = await fresh('PATCH', `/tournaments/${pendingOwn.id}`, { status: 'ongoing' })
ok(r.status === 403 && r.data.error === 'not_approved', 'an unmoderated tournament cannot start')

// ---------- 10. removing judges ----------
r = await addJudge(fresh, pendingOwn.id, 'Лишний Судья')
r = await fresh('DELETE', `/judges/${r.data.id}`)
ok(r.status === 204, 'a judge who is not in any draw can be removed')
const t4full = (await org('GET', `/tournaments/${t4id}`)).data
const drawnJudge = t4full.judges.find(j => t4full.debates.some(d => d.judgeIds.includes(j.id)))
r = await org('DELETE', `/judges/${drawnJudge.id}`)
ok(r.status === 403 && r.data.error === 'judge_in_draw', 'a judge already in a draw cannot be removed')
r = await sabina('DELETE', `/judges/${drawnJudge.id}`)
ok(r.status === 403, 'outsiders cannot remove judges')

// ---------- 11. admins never compete ----------
r = await admin('POST', `/tournaments/${t1.id}/registrations`, { teamName: 'Команда админа', institution: 'Лицей №1', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
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
for (const n of ['Первый Судья', 'Второй Судья', 'Третий Судья']) js.push((await addJudge(fresh, pendingOwn.id, n)).data.id)
r = await fresh('POST', `/rounds/${po.rounds[0].id}/draw`)
ok(r.status === 201 && r.data.debates[0].room === 'Зал A', 'the draw uses the organizer\'s rooms')
const deb = r.data.debates[0]
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
{
  const link = (await fresh('POST', `/tournaments/${pendingOwn.id}/invites`, { kind: 'judge' })).data.url
  await judge('POST', `/invites/${link.split('/invite/')[1]}/accept`)
}
const round1 = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data.rounds[0]
await fresh('POST', `/rounds/${round1.id}/draw`)
{
  // more judges than seats: the organizer makes this judge the chair by hand (equal judges are drawn in a random order)
  const me = (await db.query("select j.id from judges j join users u on u.id = j.user_id where j.tournament_id = $1 and u.email = 'judge@debate.kz'", [pendingOwn.id])).rows[0].id
  const debate = (await fresh('GET', `/tournaments/${pendingOwn.id}`)).data.debates.find(d => d.roundId === round1.id)
  await fresh('PATCH', `/debates/${debate.id}`, { chairJudgeId: me, wingJudgeIds: [] })
}
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
r = await org('POST', `/tournaments/${t1.id}/judges`, { name: 'Судья Без Аккаунта' })
ok(r.status === 404, 'judges join only by invite: a judge cannot be added by name')

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
  await panelVote(d.id, bd => {
    const sc = {}, fb = {}
    bd.proposition.speakers.forEach(s => (sc[s.id] = 75)); bd.opposition.speakers.forEach(s => (sc[s.id] = 72))
    if (d.id === myDebate.debate.id) [...bd.proposition.speakers, ...bd.opposition.speakers].forEach(s => (fb[s.id] = COMMENT))
    fb['reply:proposition'] = 'Хороший итог'
    return { winner: 'proposition', scores: sc, reply: { proposition: 37, opposition: 35 }, replySpeakers: { proposition: bd.proposition.speakers[0].id, opposition: bd.opposition.speakers[0].id }, feedback: fb }
  })
}
const myPanelJudge = (await db.query('select judge_id from debate_judges where debate_id = $1 limit 1', [myDebate.debate.id])).rows[0].judge_id
r = await (await judgeAs(myPanelJudge))('POST', `/ballots/${myDebate.debate.id}`, { winner: 'proposition', scores: {}, reply: { proposition: 37, opposition: 35 }, replySpeakers: { proposition: 'x', opposition: 'y' }, feedback: { x: 'a'.repeat(401) } })
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
ok(r.status === 201 && r.data.debates.length === 2 && swing && r.data.debates.some(d => [d.propositionTeamId, d.oppositionTeamId].includes(swing.id)), 'only present teams are drawn, the swing team evens it out')
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
// it comes back through /login?next=..., where the page follows "next" only if this account may open it
ok(g.loc.pathname === '/login' && g.loc.searchParams.get('next') === '/tournaments' && (await g.as('GET', '/auth/me')).data.user.id === gme.id, 'the next Google sign-in finds the same account and returns to "next" through the login page')

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
// "I have paid" sends the payer note and the Kaspi receipt (multipart)
const payerSession = cookieOf(await fetch(`${A}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `payer.${uniq}@mail.kz`, password: 'secret123' }) }), 'dkz_token')
const { default: sharpR } = await import('sharp')
const receiptJpg = await sharpR({ create: { width: 400, height: 700, channels: 3, background: '#ffffff' } }).jpeg().toBuffer()
const claim = async (id, payerNote, file = new Blob([receiptJpg], { type: 'image/jpeg' }), session = payerSession) => {
  const form = new FormData()
  form.append('payerNote', payerNote)
  if (file) form.append('receipt', file, 'receipt.jpg')
  const res = await fetch(`${A}/tournaments/${id}/payment/claim`, { method: 'POST', headers: { Cookie: session }, body: form })
  return { status: res.status, data: await res.json().catch(() => null) }
}
ok((await claim(big.id, '')).status === 400, '"I have paid" needs the payer name or time')
ok((await claim(big.id, 'Плательщик Т., 14:05', null)).data?.error === 'receipt_required', '"I have paid" needs the Kaspi receipt')
ok((await claim(big.id, 'Плательщик Т., 14:05', new Blob([Buffer.from('not a picture')], { type: 'image/jpeg' }))).data?.error === 'invalid_receipt', 'a receipt that is not a real picture or PDF is refused')
r = await claim(big.id, 'Плательщик Т., 14:05')
ok(r.status === 200 && (await payer('GET', `/tournaments/${big.id}/payment`)).data.status === 'pending', '"I have paid" puts the payment in the admin queue')
ok((await claim(big.id, 'ещё раз')).data?.error === 'payment_already_claimed', 'it cannot be claimed twice while waiting')
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
await claim(big.id, 'Плательщик Т., перевод 15:20')
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
await student('POST', `/tournaments/${small.id}/registrations`, { teamName: `Студенты ${uniq}`, institution: 'Лицей', speakers: ['Студент Демо', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
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
// against fake clubs: a new club waits for an admin
ok(r.status === 201 && (await clubA('GET', `/clubs/${clubId}`)).data.status === 'pending', 'a new club waits for an admin')
ok(!(await client()('GET', '/clubs')).data.some(c => c.id === clubId) && (await client()('GET', `/clubs/${clubId}`)).status === 404, 'an unchecked club is not in the catalogue and not open to outsiders')
ok((await admin('GET', '/admin/clubs')).data.find(c => c.id === clubId)?.status === 'pending', 'the admins see it in the queue')
ok((await admin('PATCH', `/admin/clubs/${clubId}`, { status: 'rejected' })).data?.error === 'reason_required', 'rejecting needs a reason')
await admin('PATCH', `/admin/clubs/${clubId}`, { status: 'rejected', note: 'Укажите учебное заведение полностью' })
ok((await clubA('GET', `/clubs/${clubId}`)).data.moderationNote === 'Укажите учебное заведение полностью' && (await notes(clubA)).items.some(n => n.type === 'participant.clubRejected'), 'members learn why it was rejected')
ok((await clubA('PATCH', `/clubs/${clubId}`, { institution: 'Евразийский национальный университет' })).data?.status === 'pending', 'after a fix the club goes back to the admins')
ok((await admin('PATCH', `/admin/clubs/${clubId}`, { status: 'approved' })).status === 200 && (await client()('GET', '/clubs')).data.some(c => c.id === clubId), 'an approved club is in the catalogue')
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
r = await outsider('POST', `/tournaments/${small.id}/registrations`, { teamName: `Без клуба ${uniq}`, institution: 'Школа', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
ok(r.data?.error === 'club_required', 'without a club and a team in the profile you cannot apply to a tournament')
await outsider('POST', '/clubs/join', { code: r.data ? (await clubA('GET', `/clubs/${clubId}`)).data.joinCode : '' })
await outsider('PUT', `/clubs/${clubId}/members/${(await outsider('GET', '/auth/me')).data.user.id}/team`, { teamId: beta })
r = await outsider('POST', `/tournaments/${small.id}/registrations`, { teamName: `С клубом ${uniq}`, institution: 'ЕНУ', speakers: ['Клубный Членo', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
ok(r.status === 201, 'with a club and a team the application goes through')
{
  // a club no admin has approved cannot send a team, and duplicates are merged, fakes reported and removed
  const fake = await newAccount('Фейк Клубов')
  const fc = (await fake.c('POST', '/clubs', { name: `Клуб ${uniq} дубль`, city: 'Астана' })).data
  await fake.c('POST', `/clubs/${fc.id}/teams`, { name: 'Дубль', join: true })
  r = await fake.c('POST', `/tournaments/${small.id}/registrations`, { teamName: `Дубль ${uniq}`, institution: 'Школа', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
  ok(r.data?.error === 'club_not_verified', 'a team of an unchecked club cannot apply to a tournament')
  ok((await outsider('POST', `/clubs/${fc.id}/report`, { reason: 'Это дубль клуба' })).status === 201
    && (await outsider('POST', `/clubs/${fc.id}/report`, { reason: 'Ещё раз' })).data?.error === 'already_reported', 'a person reports a fake club once')
  ok((await admin('GET', '/admin/clubs')).data.find(c => c.id === fc.id)?.reports.length === 1, 'the admins see the report')
  r = await admin('POST', `/admin/clubs/${fc.id}/merge`, { intoId: clubId })
  const merged = (await client()('GET', `/clubs/${clubId}`)).data
  ok(r.status === 200 && merged.members.some(m => m.id === fake.id) && merged.teams.some(t => t.name === 'Дубль') && (await client()('GET', `/clubs/${fc.id}`)).status === 404,
    'merging moves the members and teams of the duplicate into the real club')
  const gone = await newAccount('Удалённый Клуб')
  const gc = (await gone.c('POST', '/clubs', { name: `Пустышка ${uniq}`, city: 'Астана' })).data
  ok((await admin('DELETE', `/admin/clubs/${gc.id}`, { reason: 'Фейковый клуб' })).status === 204
    && (await notes(gone.c)).items.some(n => n.type === 'participant.clubDeleted') && (await gone.c('GET', '/me/club')).data.club === undefined, 'an admin removes a fake club and its members are told')
  ok((await admin('GET', '/admin/actions')).data.some(a => a.action === 'club.merge'), 'club decisions go to the audit log')
}
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


// ---------- 29. rating: clubs, and where speakers and teams come from ----------
const rating = (await client()('GET', '/rating')).data
ok(Array.isArray(rating.clubs) && rating.clubs.length > 0, 'the rating has a club table')
ok(rating.clubs.every((c, i) => c.rank === i + 1 && c.id && c.name && c.wins <= c.debates && c.winRate >= 0 && c.winRate <= 100), 'club rows have a rank, wins not above debates and a win rate in %')
ok(rating.clubs.every((c, i, a) => i === 0 || a[i - 1].wins > c.wins || (a[i - 1].wins === c.wins && a[i - 1].points >= c.points)), 'clubs are ordered by wins, then speaker points')
ok(rating.speakers.some(s => s.club?.id && s.team), 'speakers show their club and team')
ok(rating.teams.some(tm => tm.club?.id), 'teams show their club')
const topClub = rating.clubs[0]
ok((await client()('GET', `/clubs/${topClub.id}`)).status === 200, 'a club in the rating links to its page')

// ---------- 30. draw methods and "clubmates do not meet early" ----------
const dt = (await payer('POST', '/tournaments', { ...tBody(30), name: `Жеребьёвка ${uniq}`, maxTeams: 8 })).data
const schools = ['Школа А', 'Школа А', 'Школа А', 'Школа А', 'Школа Б', 'Школа Б', 'Школа В', 'Школа В']
for (const [i, inst] of schools.entries()) await payer('POST', `/tournaments/${dt.id}/teams`, { name: `Д${i + 1}`, institution: inst, speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
for (let i = 1; i <= 4; i++) await addJudge(payer, dt.id, `Судья Жеребьёвки ${i}`)
let dd = (await payer('GET', `/tournaments/${dt.id}`)).data
const instOf = new Map(dd.teams.map(tm => [tm.id, tm.institution]))
const dRound = dd.rounds[0]
let clean = true, reports = []
for (let i = 0; i < 6; i++) { // random order each time: the rule must hold every time
  r = await payer('POST', `/rounds/${dRound.id}/draw`)
  reports.push(r.data.report)
  if (r.data.debates.some(d => instOf.get(d.propositionTeamId) === instOf.get(d.oppositionTeamId))) clean = false
}
ok(clean && reports.every(x => x.protectClubs && x.sameClub === 0 && x.method === 'power'), 'in the first rounds teams of the same club (or school) never meet, in 6 random draws')
r = await payer('POST', `/rounds/${dRound.id}/draw`, { method: 'high_low', protectClubs: true })
ok(r.status === 201 && r.data.report.method === 'high_low' && r.data.debates.length === 4, 'the organizer can choose the "top vs bottom" method')
r = await payer('POST', `/rounds/${dRound.id}/draw`, { method: 'random' })
ok(r.status === 201 && r.data.report.method === 'random', 'and the random method')
ok((await payer('POST', `/rounds/${dRound.id}/draw`, { method: 'swiss-magic' })).status === 400, 'an unknown method is refused')
r = await payer('POST', `/rounds/${dRound.id}/draw`, { protectClubs: false })
ok(r.status === 201 && r.data.report.protectClubs === false, 'the club rule can be switched off for a round')
// six teams of one school out of eight: two same-school debates cannot be avoided — the report says so
for (const tm of dd.teams.filter(x => ['Д5', 'Д6'].includes(x.name))) {
  await payer('PATCH', `/teams/${tm.id}`, { name: tm.name, institution: 'Школа А', speakers: tm.speakers.map(s => s.name) })
}
dd = (await payer('GET', `/tournaments/${dt.id}`)).data
const inst2 = new Map(dd.teams.map(tm => [tm.id, tm.institution]))
let fewest = true
for (let i = 0; i < 8; i++) { // random orders: the minimum (6 of 8 teams from one school -> 2 debates) must hold every time
  r = await payer('POST', `/rounds/${dRound.id}/draw`)
  const same = r.data.debates.filter(d => inst2.get(d.propositionTeamId) === inst2.get(d.oppositionTeamId)).length
  if (r.status !== 201 || same !== 2 || r.data.report.sameClub !== 2) fewest = false
}
ok(fewest, 'when a clean draw is impossible, the fewest clubmate meetings are made and reported (8 random draws)')
ok(new Set(r.data.debates.flatMap(d => [d.propositionTeamId, d.oppositionTeamId])).size === 8, 'every team still debates exactly once')


// ---------- 31. news (admins write, everyone reads) ----------
r = await client()('GET', '/news')
ok(r.status === 200 && r.data.items.length >= 2 && r.data.items.every(n => n.published && !n.body), 'everyone sees published news (list without the full text)')
ok(!(await client()('GET', '/news?drafts=1')).data.items.some(n => !n.published), 'guests never see drafts, even when asking')
const drafts = (await admin('GET', '/news?drafts=1')).data.items.filter(n => !n.published)
ok(drafts.length >= 1, 'admins see drafts')
ok((await client()('GET', `/news/${drafts[0].id}`)).status === 404, 'a draft is not readable by others')
ok((await student('POST', '/news', { title: 'Хочу написать новость', summary: 'Пусть все прочитают это', body: 'Длинный текст новости для проверки' })).status === 403, 'participants cannot write news')
r = await admin('POST', '/news', { title: 'Новость из e2e', summary: 'Проверяем, как пишутся новости', body: 'Первый абзац новости.\n\nВторой абзац новости.', coverUrl: 'http://insecure.example/x.jpg' })
ok(r.status === 400, 'a cover must be an https link')
r = await admin('POST', '/news', { title: 'Новость из e2e', summary: 'Проверяем, как пишутся новости', body: 'Первый абзац новости.\n\nВторой абзац новости.' })
const newsId = r.data.id
ok(r.status === 201 && (await client()('GET', `/news/${newsId}`)).status === 404, 'a new post starts as a draft')
r = await admin('PATCH', `/news/${newsId}`, { published: true })
const pubNews = (await client()('GET', `/news/${newsId}`)).data
ok(r.status === 200 && pubNews.published && pubNews.publishedAt && pubNews.body.includes('Второй абзац'), 'after publishing everyone can read it')
ok((await admin('GET', '/admin/actions')).data.some(a => a.action === 'news.publish' && a.targetId === newsId), 'publishing is in the audit log')
ok((await admin('DELETE', `/news/${newsId}`)).status === 204 && (await client()('GET', `/news/${newsId}`)).status === 404, 'an admin deletes a post')

// ---------- 32. tournament covers ----------
const templates = (await client()('GET', '/tournament-covers')).data
ok(Array.isArray(templates) && templates.length >= 6, 'there are ready cover templates')
const noCover = (await payer('GET', `/tournaments/${dt.id}`)).data
ok(templates.includes(noCover.cover), 'a tournament without a cover shows a template, not an empty picture')
ok((await payer('PATCH', `/tournaments/${dt.id}`, { coverUrl: 'https://evil.example/tracker.png' })).status === 400, 'a cover cannot be an arbitrary external link')
r = await payer('PATCH', `/tournaments/${dt.id}`, { coverUrl: templates[3] })
ok(r.status === 200 && (await payer('GET', `/tournaments/${dt.id}`)).data.cover === templates[3], 'the organizer picks a template')
const { default: sharpLib } = await import('sharp')
const png = await sharpLib({ create: { width: 900, height: 600, channels: 3, background: '#e8710a' } }).png().toBuffer()
const coverSession = cookieOf(await fetch(`${A}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `payer.${uniq}@mail.kz`, password: 'secret123' }) }), 'dkz_token')
const upload = async (id, body, session = coverSession) => {
  const form = new FormData()
  form.append('cover', body)
  const res = await fetch(`${A}/tournaments/${id}/cover`, { method: 'POST', headers: { Cookie: session }, body: form })
  return { status: res.status, data: await res.json().catch(() => null) }
}
r = await upload(dt.id, new Blob([png], { type: 'image/png' }), coverSession)
const uploaded = r.data?.cover
ok(r.status === 200 && /^\/uploads\/covers\/[\w-]+\.webp$/.test(uploaded) && (await fetch(`${A.replace(/\/api$/, '')}${uploaded}`)).ok, 'the organizer uploads their own cover (stored as WebP on the site)')
ok((await payer('GET', `/tournaments/${dt.id}`)).data.cover === uploaded, 'the tournament shows the uploaded cover')
ok((await upload(dt.id, new Blob([Buffer.from('not an image')], { type: 'image/png' }))).status === 400, 'a file that is not a real image is refused')
ok((await upload(dt.id, new Blob([png], { type: 'image/png' }), await sessionOf('timur@mail.kz'))).status === 403, 'strangers cannot change the cover')
await payer('PATCH', `/tournaments/${dt.id}`, { coverUrl: null })
ok(templates.includes((await payer('GET', `/tournaments/${dt.id}`)).data.cover) && (await fetch(`${A.replace(/\/api$/, '')}${uploaded}`)).status === 404, 'removing the cover returns the template and deletes the old file')
r = await admin('POST', '/tournaments', { ...tBody(40), name: `С обложкой ${uniq}`, coverUrl: templates[1] })
ok(r.status === 201 && r.data.cover === templates[1], 'a template chosen in the wizard is saved with the new tournament')
ok((await admin('POST', '/tournaments', { ...tBody(41), name: `Чужая обложка ${uniq}`, coverUrl: 'https://evil.example/x.jpg' })).status === 400, 'the wizard cannot save an external picture link')

// ---------- 33. requests to join a club ----------
const reqClubOwner = client(), applicant = client()
for (const [c, n] of [[reqClubOwner, 'ro'], [applicant, 'ap']]) {
  r = await c('POST', '/auth/register', { name: `Заявка Тестов${n}`, email: `req${n}.${uniq}@mail.kz`, phone: '+7 707 555 66 88', password: 'secret123', consent: true })
  await c('POST', '/auth/verify-email', { token: r.data.devVerificationToken })
}
const rClub = (await reqClubOwner('POST', '/clubs', { name: `Заявочный ${uniq}`, city: 'Астана' })).data.id
await admin('PATCH', `/admin/clubs/${rClub}`, { status: 'approved' }) // checked: it is in the catalogue
const rTeam = (await reqClubOwner('POST', `/clubs/${rClub}/teams`, { name: 'Основа', join: true })).data.id
ok((await client()('POST', `/clubs/${rClub}/requests`, {})).status === 401, 'a guest cannot ask to join')
r = await applicant('POST', `/clubs/${rClub}/requests`, { message: 'Хочу в клуб, говорю вторым спикером' })
const reqId = r.data.id
ok(r.status === 201 && (await applicant('GET', `/clubs/${rClub}`)).data.myRequest === reqId, 'a person asks to join from the public club page')
ok((await applicant('POST', `/clubs/${rClub}/requests`, {})).data?.error === 'already_requested', 'one open request per club')
ok((await reqClubOwner('POST', `/clubs/${rClub}/requests`, {})).data?.error === 'already_member', 'members do not request their own club')
await new Promise(res => setTimeout(res, 300))
ok((await reqClubOwner('GET', '/me/notifications')).data.items.some(n => n.type === 'participant.clubRequest'), 'members are told about the request')
let reqs = (await reqClubOwner('GET', `/clubs/${rClub}/requests`)).data
ok(reqs.length === 1 && reqs[0].message.includes('вторым спикером') && reqs[0].user.name.includes('Тестовap'), 'members see the request with the message')
ok((await applicant('GET', `/clubs/${rClub}/requests`)).status === 403, 'outsiders cannot see the requests')
ok((await applicant('PATCH', `/club-requests/${reqId}`, { status: 'accepted' })).status === 403, 'the applicant cannot accept themself')
ok((await reqClubOwner('GET', `/clubs/${rClub}`)).data.pendingRequests === 1, 'the club page tells members how many requests wait')
r = await reqClubOwner('PATCH', `/club-requests/${reqId}`, { status: 'accepted', teamId: rTeam })
const apMe = (await applicant('GET', '/auth/me')).data.user
ok(r.status === 200 && apMe.club?.id === rClub && apMe.clubTeam?.id === rTeam, 'a member accepts and puts the person straight into a team')
await new Promise(res => setTimeout(res, 300))
ok((await applicant('GET', '/me/notifications')).data.items.some(n => n.type === 'participant.clubRequestAccepted'), 'the person is told')
ok((await reqClubOwner('PATCH', `/club-requests/${reqId}`, { status: 'declined' })).data?.error === 'request_not_pending', 'a handled request cannot be handled again')
// decline and withdraw
const other = client()
r = await other('POST', '/auth/register', { name: 'Другой Заявитель', email: `reqot.${uniq}@mail.kz`, phone: '+7 707 555 66 99', password: 'secret123', consent: true })
await other('POST', '/auth/verify-email', { token: r.data.devVerificationToken })
const r2 = (await other('POST', `/clubs/${rClub}/requests`, {})).data.id
r = await reqClubOwner('PATCH', `/club-requests/${r2}`, { status: 'declined' })
ok(r.status === 200 && !(await other('GET', '/auth/me')).data.user.club && (await other('GET', '/me/club-requests')).data.length === 0, 'a declined person stays outside and the request is closed')
const r3 = (await other('POST', `/clubs/${rClub}/requests`, {})).data.id
ok((await other('DELETE', `/club-requests/${r3}`)).status === 204 && (await reqClubOwner('GET', `/clubs/${rClub}/requests`)).data.length === 0, 'the person can withdraw a request')
ok((await reqClubOwner('GET', `/clubs/${rClub}`)).data.log.some(l => l.action === 'request.accepted'), 'accepting is in the club log')


// ---------- 34. receipts, paying in the creation wizard, schedule, judges needed for the draw ----------
const payView = (await payer('GET', `/tournaments/${big.id}/payment`)).data
ok(payView.hasReceipt === true && !!payView.id, 'the organizer sees that the receipt was attached')
const receiptUrl = `${A}/payments/${payView.id}/receipt`
let rec = await fetch(receiptUrl, { headers: { Cookie: payerSession } })
ok(rec.status === 200 && rec.headers.get('content-type')?.startsWith('image/jpeg') && rec.headers.get('cache-control')?.includes('no-store'), 'the organizer can open their receipt (not cached)')
rec = await fetch(receiptUrl, { headers: { Cookie: await sessionOf('admin@debate.kz') } })
ok(rec.status === 200, 'an admin can open the receipt')
ok((await fetch(receiptUrl, { headers: { Cookie: await sessionOf('timur@mail.kz') } })).status === 403 && (await fetch(receiptUrl)).status === 401, 'nobody else can open a receipt')
ok((await admin('GET', '/admin/payments')).data.find(x => x.id === payView.id)?.hasReceipt === true, 'the admin queue marks payments with a receipt')
ok((await fetch(`${A.replace(/\/api$/, '')}/uploads/receipts/x.jpg`)).status === 404, 'receipts are not in the public uploads folder')

// the wizard: the payment is shown before the tournament exists, the reference travels with the new tournament
const qp = client()
r = await qp('POST', '/auth/register', { name: 'Мастер Оплаты', email: `quote.${uniq}@mail.kz`, phone: '+7 707 444 55 66', password: 'secret123', consent: true })
await qp('POST', '/auth/verify-email', { token: r.data.devVerificationToken })
ok((await client()('GET', '/plans/quote')).status === 401, 'a guest gets no payment quote')
const quote = (await qp('GET', '/plans/quote')).data
ok(quote.amount > 0 && /^DKZ-[A-Z2-9]{6}$/.test(quote.reference) && quote.freeTeamLimit === 20, 'the wizard gets the amount and a fresh payment reference')
const created = (await qp('POST', '/tournaments', { ...tBody(50), name: `Мастер Pro ${uniq}`, maxTeams: 32, paymentReference: quote.reference })).data
const createdPay = (await qp('GET', `/tournaments/${created.id}/payment`)).data
ok(createdPay.required && createdPay.reference === quote.reference && createdPay.status === 'awaiting', 'the new Pro tournament keeps the reference the organizer paid with')
const quoteSession = cookieOf(await fetch(`${A}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `quote.${uniq}@mail.kz`, password: 'secret123' }) }), 'dkz_token')
const pdf = new Blob([Buffer.from('%PDF-1.4\n% test receipt\n%%EOF')], { type: 'application/pdf' })
r = await claim(created.id, 'Мастер О., 10:15', pdf, quoteSession)
ok(r.status === 200 && (await qp('GET', `/tournaments/${created.id}/payment`)).data.status === 'pending', 'the receipt sent from the wizard puts the payment in the admin queue at once (PDF works too)')
const small2 = (await qp('POST', '/tournaments', { ...tBody(51), name: `Мастер Free ${uniq}`, maxTeams: 12, paymentReference: 'DKZ-AAAAAA' })).data
ok((await qp('GET', `/tournaments/${small2.id}/payment`)).data.required === false, 'a free tournament creates no payment even with a reference')

// schedule
const sched = [{ day: 1, time: '09:00', title: 'Регистрация команд' }, { day: 1, time: '10:00', title: 'Раунд 1' }, { day: 2, time: '16:00', title: 'Финал и награждение' }]
r = await qp('PUT', `/tournaments/${created.id}/schedule`, { items: sched })
ok(r.status === 200 && r.data.length === 3, 'the organizer saves the schedule')
const savedSched = (await qp('GET', `/tournaments/${created.id}`)).data.schedule
ok(savedSched.length === 3 && savedSched[2].day === 2 && savedSched[2].title === 'Финал и награждение', 'the schedule is part of the tournament, sorted by day and time')
ok((await qp('PUT', `/tournaments/${created.id}/schedule`, { items: [{ day: 5, time: '10:00', title: 'Лишний день' }] })).data?.error === 'schedule_day_outside', 'a day outside the tournament dates is refused')
ok((await qp('PUT', `/tournaments/${created.id}/schedule`, { items: [{ day: 1, time: '25:00', title: 'Неверное время' }] })).status === 400, 'a wrong time is refused')
ok((await timur('PUT', `/tournaments/${created.id}/schedule`, { items: [] })).status === 403, 'strangers cannot change the schedule')

// the draw explains how many judges are missing
const jd = (await qp('POST', '/tournaments', { ...tBody(52), name: `Судьи ${uniq}`, maxTeams: 8 })).data
for (let i = 1; i <= 4; i++) await qp('POST', `/tournaments/${jd.id}/teams`, { name: `С${i}`, institution: `Школа С${i}`, speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
await addJudge(qp, jd.id, 'Единственный Судья')
const jr = (await qp('GET', `/tournaments/${jd.id}`)).data.rounds[0]
r = await qp('POST', `/rounds/${jr.id}/draw`)
ok(r.data?.error === 'not_enough_judges' && r.data.details?.need === 2 && r.data.details?.have === 1, 'the draw says: 4 teams need 2 judges, there is 1')
await addJudge(qp, jd.id, 'Второй Судья')
ok((await qp('POST', `/rounds/${jr.id}/draw`)).status === 201, 'with a second judge the draw works')


// ---------- 35. the bot: two languages, menus, /next, /tournaments, safe texts ----------
const tgTap = (chatId, data, text = '') => bot('POST', '/telegram/test/update', {
  update_id: ++upd, callback_query: { id: `cb${upd}`, from: { id: chatId }, data, message: { message_id: 1, chat: { id: chatId, type: 'private' }, text } },
})
const sentTo = async chatId => (await inbox(String(chatId))).filter(m => m.method === 'sendMessage')
r = await judge('PUT', '/me/language', { language: 'kz' })
ok(r.status === 200 && r.data.user.language === 'kz', 'the site saves the language of the account')
ok((await judge('PUT', '/me/language', { language: 'en' })).status === 400, 'only Russian and Kazakh are accepted')
await tgSend(333, { text: '/help' })
ok(/турнирлеріңіз/.test(await lastText(333)), 'after the switch the bot answers in Kazakh')
await tgSend(333, { text: '/next' })
ok(/аудиториясында сіз/.test(await lastText(333)), '/next shows the judge their room and role (in Kazakh)')
await tgSend(333, { text: '/next@DebateKzTestBot' })
ok(/аудиториясында сіз/.test(await lastText(333)), 'a command with the bot name works the same')
await tgTap(333, 'lang:ru')
ok((await judge('GET', '/auth/me')).data.user.language === 'ru' && (await bot('GET', '/telegram/test/outbox')).data.some(m => m.method === 'answerCallbackQuery'),
  'a tap on a language button switches the language and answers the tap')
await tgSend(333, { text: '/me' })
const meMsg = (await sentTo(333)).filter(m => /Язык:/.test(m.text)).at(-1)
ok(/Язык: русский/.test(meMsg?.text) && meMsg.reply_markup?.inline_keyboard?.flat().some(b => b.callback_data === 'lang:kz') && meMsg.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'notify:off'),
  '/me shows the account with language and notification buttons')
// Telegram gives the bot its message back as plain text, without the HTML tags
const meShown = meMsg.text.replace(/<[^>]+>/g, '')
await tgTap(333, 'notify:off', meShown)
ok((await judge('GET', '/auth/me')).data.user.telegramNotify === false && (await inbox('333')).some(m => m.method === 'editMessageText'), 'notifications are muted with a button and the menu redraws itself')
await tgTap(333, 'notify:on', meShown)
ok((await judge('GET', '/auth/me')).data.user.telegramNotify === true, 'and turned back on')
await tgSend(333, { text: '/tournaments' })
ok(/Мои турниры/.test(await lastText(333)) && /судья/.test(await lastText(333)), '/tournaments lists active tournaments with the role')
ok((await sentTo(333)).some(m => /Подтвердите номер/.test(m.text) && m.reply_markup?.keyboard), '/me also asks an unverified judge for the phone')
await tgSend(333, { text: '/foo' })
ok(/Не понял/.test(await lastText(333)), 'an unknown command gets the list of commands')
await bot('POST', '/telegram/test/update', { update_id: ++upd, message: { message_id: upd, from: { id: 778, language_code: 'kk' }, chat: { id: 778, type: 'private' }, text: 'сәлем' } })
ok(/қосылмаған/.test(await lastText(778)), 'an unknown chat with Telegram in Kazakh gets instructions in Kazakh')
// the link from the site carries the language the person is using there
r = await timur('POST', '/me/telegram/link', { language: 'kz' })
ok(r.status === 201 && (await timur('GET', '/auth/me')).data.user.language === 'kz', 'connecting Telegram from the Kazakh site sets Kazakh')
await timur('PUT', '/me/language', { language: 'ru' })

// notifications follow each person's language, and names cannot break the message
await fresh('PUT', '/me/language', { language: 'kz' })
const odd = (await fresh('POST', '/tournaments', { ...tBody(60), name: `Кубок <Алтын> & ${uniq}` })).data
await admin('PATCH', `/admin/tournaments/${odd.id}`, { moderation: 'rejected', moderationNote: '<b>дубль</b> & тест' })
ok(await waitFor(444, /қабылданбады/), 'the owner gets the decision in Kazakh')
const oddMsg = (await sentTo(444)).filter(m => m.text.includes('Алтын')).at(-1)?.text ?? ''
ok(oddMsg.includes('«Кубок &lt;Алтын&gt; &amp;') && oddMsg.includes('&lt;b&gt;дубль&lt;/b&gt; &amp; тест') && !oddMsg.includes('<Алтын>'),
  'names and reasons are escaped in Telegram texts')
ok((await fresh('GET', '/me/notifications')).data.items.some(n => n.type === 'organizer.rejected' && n.data.tournament.includes('<Алтын>')), 'the site notification keeps the original text')
await fresh('PUT', '/me/language', { language: 'ru' })

// ---------- 36. letters in Kazakh and Russian ----------
const kzUser = client()
r = await kzUser('POST', '/auth/register', { name: 'Айгерім Сейтқали', email: `kz.${uniq}@mail.kz`, phone: '+7 707 555 66 77', password: 'secret123', consent: true, language: 'kz' })
ok(r.status === 201 && r.data.user.language === 'kz', 'registering from the Kazakh site sets Kazakh on the account')
const kzVerify = (await mails(`kz.${uniq}@mail.kz`)).at(-1)
ok(/растаңыз/.test(kzVerify?.subject) && /Сәлеметсіз бе/.test(kzVerify.text) && kzVerify.action?.label === 'Email-ді растау' && kzVerify.lang === 'kz',
  'the confirmation letter comes in Kazakh')
const ruUser = client()
await ruUser('POST', '/auth/register', { name: 'Олег Петров', email: `ru.${uniq}@mail.kz`, phone: '+7 707 555 66 78', password: 'secret123', consent: true })
ok(/подтвердите email/.test((await mails(`ru.${uniq}@mail.kz`)).at(-1)?.subject), 'without a language the letters stay Russian')
await kzUser('POST', '/auth/verify-email', { token: r.data.devVerificationToken })
const kzT = (await kzUser('POST', '/tournaments', { ...tBody(70), name: `Шақыру ${uniq}` })).data
await kzUser('POST', `/tournaments/${kzT.id}/invites/email`, { email: `nobody.${uniq}@mail.kz`, kind: 'judge' })
const both = (await mails(`nobody.${uniq}@mail.kz`)).at(-1)
ok(both?.lang === 'both' && /Сәлеметсіз бе/.test(both.text) && /Здравствуйте/.test(both.text) && both.action?.label === 'Шақыруды ашу / Открыть приглашение',
  'an invite to an email without an account is written in both languages')
await kzUser('POST', `/tournaments/${kzT.id}/invites/email`, { email: 'timur@mail.kz', kind: 'judge' })
ok(/Здравствуйте/.test((await mails('timur@mail.kz')).at(-1)?.text) && !/Сәлеметсіз/.test((await mails('timur@mail.kz')).at(-1)?.text),
  'a registered person gets the invite in the language of their account')

// ---------- 37. ballots belong to judges; judges without an account; the end of a tournament; logos ----------
{
  // the organizer reads every ballot of a debate as it was sent; a judge of the panel gets only the form
  const tl = (await org('GET', `/tournaments/${t4id}`)).data
  const decided = tl.debates.find(d => d.ballotStatus !== 'pending')
  const view = (await org('GET', `/ballots/${decided.id}`)).data
  ok(view.canSubmit === false && Array.isArray(view.panel) && view.panel.some(p => p.submittedAt && p.scores?.length === 8 && p.totals),
    "the organizer sees each judge's ballot with the scores, read-only")
  const jview = (await (await judgeAs(view.panel[0].judgeId))('GET', `/ballots/${decided.id}`)).data
  ok(jview.canSubmit === true && jview.panel === undefined, "a judge of the panel gets the form, not the other judges' ballots")
}
{
  // a judge the organizer had added by name (no account) is linked to a person by an email invite
  const plain = (await db.query('select id from judges where tournament_id = $1 and user_id is null limit 1', [t1.id])).rows[0]
  const before = (await org('GET', `/tournaments/${t1.id}`)).data.judges
  ok(before.find(j => j.id === plain.id)?.hasAccount === false, 'the judges list shows who has no account yet')
  const person = await newAccount('Привязанный Судья')
  r = await org('POST', `/tournaments/${t1.id}/invites/email`, { email: person.email, kind: 'judge', judgeId: plain.id })
  ok(r.status === 201, 'the organizer invites a person to be that judge')
  const token = (await mails(person.email)).at(-1).action.url.split('/invite/')[1]
  r = await person.c('POST', `/invites/${token}/accept`)
  const after = (await org('GET', `/tournaments/${t1.id}`)).data.judges
  ok(r.status === 200 && after.find(j => j.id === plain.id)?.hasAccount === true && after.length === before.length,
    'accepting links the account to the same judge (no second judge, the draws stay)')
  ok((await org('POST', `/tournaments/${t1.id}/invites/email`, { email: 'sabina@mail.kz', kind: 'judge', judgeId: plain.id })).data?.error === 'judge_has_account',
    'a judge who already has an account cannot be linked again')
}
// the end of a tournament: its organizers learn the result (own1 was finished in section 9)
ok((await notes(fresh)).items.some(n => n.type === 'organizer.tournamentFinished'), 'when a tournament ends its organizers get the result')
{
  // club and team logos
  const owner = await newAccount('Логотип Клуба')
  const club = (await owner.c('POST', '/clubs', { name: `Клуб логотипов ${jtag}`, city: 'Астана' })).data
  await admin('PATCH', `/admin/clubs/${club.id}`, { status: 'approved' })
  const sess = cookieOf(await fetch(`${A}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: owner.email, password: 'secret123' }) }), 'dkz_token')
  const png = await sharpR({ create: { width: 300, height: 200, channels: 3, background: '#009bc9' } }).png().toBuffer()
  const up = async (url, file, cookie = sess) => {
    const f = new FormData()
    if (file) f.append('logo', file, 'logo.png')
    const res = await fetch(`${A}${url}`, { method: 'POST', headers: { Cookie: cookie }, body: f })
    return { status: res.status, data: await res.json().catch(() => null) }
  }
  r = await up(`/clubs/${club.id}/logo`, new Blob([png], { type: 'image/png' }))
  ok(r.status === 200 && /^\/uploads\/logos\/.+\.webp$/.test(r.data?.logoUrl ?? ''), 'a member sets the club logo (stored as WebP)')
  const img = await fetch(`${A.replace(/\/api$/, '')}${r.data.logoUrl}`)
  const meta = await sharpR(Buffer.from(await img.arrayBuffer())).metadata()
  ok(img.ok && meta.width === 256 && meta.height === 256, 'the logo is a 256×256 square')
  ok((await client()('GET', '/clubs')).data.find(c => c.id === club.id)?.logoUrl === r.data.logoUrl, 'the club catalogue shows the logo')
  ok((await up(`/clubs/${club.id}/logo`, new Blob([Buffer.from('not a picture')], { type: 'image/png' }))).data?.error === 'invalid_image', 'a file that is not a picture is refused')
  ok((await up(`/clubs/${club.id}/logo`, new Blob([png], { type: 'image/png' }), await sessionOf('timur@mail.kz'))).status === 403, 'only members change the logo')
  const team = (await owner.c('POST', `/clubs/${club.id}/teams`, { name: 'Команда с логотипом', join: true })).data
  r = await up(`/club-teams/${team.id}/logo`, new Blob([png], { type: 'image/png' }))
  ok(r.status === 200 && (await client()('GET', `/clubs/${club.id}`)).data.teams.find(x => x.id === team.id)?.logoUrl === r.data.logoUrl, 'a team logo shows on the club page')
  ok((await owner.c('DELETE', `/clubs/${club.id}/logo`)).status === 204 && !(await client()('GET', `/clubs/${club.id}`)).data.logoUrl, 'the logo can be removed')
}

// ---------- 38. formats (WSDC, APF, Karl Popper) and mixed tournaments ----------
{
  const host = await newAccount('Формат Организатор')
  const base = n => ({ ...tBody(80 + n), name: `Формат ${n} ${jtag}` })
  let tr = await host.c('POST', '/tournaments', { ...base(1), level: 'mixed', format: 'APF' })
  ok(tr.status === 201 && tr.data.level === 'mixed' && tr.data.format === 'APF', 'a mixed (school + university) APF tournament is created')
  const apf = tr.data
  ok((await host.c('POST', '/tournaments', { ...base(2), format: 'CNDF' })).status === 400, 'an unknown format is refused')
  r = await host.c('POST', `/tournaments/${apf.id}/teams`, { name: 'Тройка', institution: 'Школа 1', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
  ok(r.status === 400 && r.data.error === 'wrong_speaker_count' && r.data.details?.need === 2, 'APF teams have two speakers, not three')
  for (const n of ['Альфа', 'Бета']) await host.c('POST', `/tournaments/${apf.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} Первый`, `${n} Второй`] })
  const aj = await addJudge(host.c, apf.id, 'Судья Форматов')
  const apfRound = (await host.c('GET', `/tournaments/${apf.id}`)).data.rounds[0]
  await host.c('POST', `/rounds/${apfRound.id}/draw`, { addSwing: false })
  await host.c('PATCH', `/rounds/${apfRound.id}`, { motion: 'ЭП разрешила бы голосование с 16 лет', status: 'released' })
  const apfDebate = (await host.c('GET', `/tournaments/${apf.id}`)).data.debates.find(x => x.roundId === apfRound.id)
  const jc = judgeClients.get(aj.data.id)
  const sheet = (await jc('GET', `/ballots/${apfDebate.id}`)).data
  ok(sheet.rules?.format === 'APF' && sheet.rules.speakers === 2 && sheet.rules.speaker.join('-') === '20-30' && sheet.rules.reply?.range.join('-') === '10-15' && sheet.rules.reply.by.join() === '1',
    'the APF ballot sheet: 2 speakers, 20–30, rebuttal 10–15 by the leader')
  const sc = {}
  sheet.proposition.speakers.forEach(s => (sc[s.id] = 26)); sheet.opposition.speakers.forEach(s => (sc[s.id] = 24.5))
  const good = { winner: 'proposition', scores: sc, reply: { proposition: 13, opposition: 12 }, replySpeakers: { proposition: sheet.proposition.speakers[0].id, opposition: sheet.opposition.speakers[0].id } }
  ok((await jc('POST', `/ballots/${apfDebate.id}`, { ...good, replySpeakers: { ...good.replySpeakers, proposition: sheet.proposition.speakers[1].id } })).data?.error === 'invalid_reply_speaker', 'in APF only the leader gives the rebuttal')
  ok((await jc('POST', `/ballots/${apfDebate.id}`, { ...good, reply: { proposition: 30, opposition: 12 } })).data?.error === 'reply_score_out_of_range', 'the rebuttal is scored 10–15')
  ok((await jc('POST', `/ballots/${apfDebate.id}`, { ...good, scores: { ...sc, [sheet.proposition.speakers[0].id]: 70 } })).data?.error === 'speaker_score_out_of_range', 'APF speeches are scored 20–30')
  r = await jc('POST', `/ballots/${apfDebate.id}`, good)
  ok(r.status === 201 && r.data.totals.proposition === 65 && r.data.totals.opposition === 61, 'a valid APF ballot is accepted')

  // Karl Popper: three speakers and no reply speeches
  tr = await host.c('POST', '/tournaments', { ...base(3), format: 'POPPER' })
  const kp = tr.data
  ok(tr.status === 201 && kp.format === 'POPPER', 'a Karl Popper tournament is created')
  for (const n of ['Гамма', 'Дельта']) await host.c('POST', `/tournaments/${kp.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} Один`, `${n} Два`, `${n} Три`] })
  const kj = await addJudge(host.c, kp.id, 'Судья Поппера')
  const kpRound = (await host.c('GET', `/tournaments/${kp.id}`)).data.rounds[0]
  await host.c('POST', `/rounds/${kpRound.id}/draw`, { addSwing: false })
  await host.c('PATCH', `/rounds/${kpRound.id}`, { motion: 'Школьная форма должна быть отменена', status: 'released' })
  const kpDebate = (await host.c('GET', `/tournaments/${kp.id}`)).data.debates.find(x => x.roundId === kpRound.id)
  const kc = judgeClients.get(kj.data.id)
  const ks = (await kc('GET', `/ballots/${kpDebate.id}`)).data
  ok(ks.rules?.speakers === 3 && !ks.rules.reply, 'the Karl Popper sheet has no reply speeches')
  const kscores = {}
  ks.proposition.speakers.forEach(s => (kscores[s.id] = 27)); ks.opposition.speakers.forEach(s => (kscores[s.id] = 25))
  r = await kc('POST', `/ballots/${kpDebate.id}`, { winner: 'proposition', scores: kscores })
  ok(r.status === 201 && r.data.totals.proposition === 81 && r.data.totals.opposition === 75, 'a Karl Popper ballot needs no reply speeches')

  // registrations follow the format too, and the public filters show mixed tournaments for both levels
  await admin('PATCH', `/admin/tournaments/${apf.id}`, { moderation: 'approved' })
  const school = (await client()('GET', '/tournaments?level=school&limit=100')).data
  const uni = (await client()('GET', '/tournaments?level=university&limit=100')).data
  ok((school.items ?? school).some(x => x.id === apf.id) && (uni.items ?? uni).some(x => x.id === apf.id), 'a mixed tournament shows up under both school and university')
  r = await student('POST', `/tournaments/${apf.id}/registrations`, { teamName: 'Трое в APF', institution: 'Лицей', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33', guardianConsent: true })
  ok(r.data?.error === 'wrong_speaker_count', 'an application to an APF tournament names two speakers')
}
// ---------- 39. British Parliamentary: four teams per room, places 1–4, the chair's agreed ballot ----------
{
  const host = await newAccount('BP Организатор')
  let tr = await host.c('POST', '/tournaments', { ...tBody(90), name: `BP ${jtag}`, format: 'BP' })
  ok(tr.status === 201 && tr.data.format === 'BP', 'a British Parliamentary tournament is created')
  const bp = tr.data
  r = await host.c('POST', `/tournaments/${bp.id}/teams`, { name: 'Тройка BP', institution: 'Вуз', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
  ok(r.data?.error === 'wrong_speaker_count' && r.data.details?.need === 2, 'BP teams have two speakers')
  const names = ['Орёл', 'Барс', 'Сокол', 'Беркут', 'Тулпар', 'Арлан']
  for (const n of names) await host.c('POST', `/tournaments/${bp.id}/teams`, { name: n, institution: `Вуз ${n}`, speakers: [`${n} Первый`, `${n} Второй`] })
  const round1 = (await host.c('GET', `/tournaments/${bp.id}`)).data.rounds[0]
  r = await host.c('POST', `/rounds/${round1.id}/draw`, { addSwing: false })
  ok(r.data?.error === 'bp_teams_multiple_of_four' && r.data.details?.teams === 6, 'a BP draw needs a multiple of four teams')
  const j1 = await addJudge(host.c, bp.id, 'BP Судья Один')
  r = await host.c('POST', `/rounds/${round1.id}/draw`, { addSwing: true })
  ok(r.data?.error === 'not_enough_judges' && r.data.details?.need === 2 && r.data.details.teams === 8, 'two swing teams fill the last room; two rooms need two judges')
  const j2 = await addJudge(host.c, bp.id, 'BP Судья Два')
  const j3 = await addJudge(host.c, bp.id, 'BP Судья Три')
  r = await host.c('POST', `/rounds/${round1.id}/draw`, { addSwing: true })
  const rooms = r.data?.debates ?? []
  const seated = rooms.flatMap(d => [d.propositionTeamId, d.oppositionTeamId, d.closingPropositionTeamId, d.closingOppositionTeamId])
  ok(r.status === 201 && rooms.length === 2 && seated.every(Boolean) && new Set(seated).size === 8, 'the draw seats eight teams in two rooms of four (OG, OO, CG, CO)')
  const teamsNow = (await host.c('GET', `/tournaments/${bp.id}`)).data.teams
  ok(teamsNow.filter(x => x.swing).length === 2, 'two swing teams were added')
  await host.c('PATCH', `/rounds/${round1.id}`, { motion: 'ЭП ввела бы всеобщий базовый доход', status: 'released' })

  // the room with a wing judge: the wing reads, the chair sends the agreed ballot
  const withWing = rooms.find(d => d.judgeIds.length === 2)
  ok(!!withWing, 'the spare judge sits as a wing')
  const [chairId, wingId] = withWing.judgeIds
  const wing = judgeClients.get(wingId), chair = judgeClients.get(chairId)
  const wv = (await wing('GET', `/ballots/${withWing.id}`)).data
  ok(wv.canSubmit === false && Array.isArray(wv.panel), 'in BP a wing judge reads the ballot, the chair sends it')
  const sheet = (await chair('GET', `/ballots/${withWing.id}`)).data
  ok(sheet.canSubmit === true && sheet.rules?.teams === 4 && sheet.rules.speakers === 2 && sheet.rules.speaker.join('-') === '50-100' && !sheet.rules.reply
    && sheet.closingProposition?.speakers.length === 2 && sheet.closingOpposition?.speakers.length === 2,
    'the BP sheet: four teams of two, 50–100, no reply speeches')
  const pts = { proposition: 78, opposition: 75, closingProposition: 80, closingOpposition: 72 }
  const scores = {}
  for (const side of Object.keys(pts)) sheet[side].speakers.forEach(x => (scores[x.id] = pts[side]))
  ok((await wing('POST', `/ballots/${withWing.id}`, { scores })).data?.error === 'chair_only', "a wing's ballot is refused")
  ok((await chair('POST', `/ballots/${withWing.id}`, { scores: { ...scores, [sheet.proposition.speakers[0].id]: 77.5 } })).data?.error === 'speaker_score_out_of_range', 'BP speeches are whole points 50–100')
  const tie = { ...scores }
  sheet.closingOpposition.speakers.forEach(x => (tie[x.id] = 75))
  ok((await chair('POST', `/ballots/${withWing.id}`, { scores: tie })).data?.error === 'tie_not_allowed', 'two teams cannot share a place')
  ok((await chair('POST', `/ballots/${withWing.id}`, { scores, ranking: ['proposition', 'opposition', 'closingProposition', 'closingOpposition'] })).data?.error === 'ranking_mismatch',
    'the places must follow the team totals')
  r = await chair('POST', `/ballots/${withWing.id}`, { scores, ranking: ['closingProposition', 'proposition', 'opposition', 'closingOpposition'] })
  ok(r.status === 201 && r.data.ranking?.join() === 'closingProposition,proposition,opposition,closingOpposition' && r.data.totals.closingProposition === 160,
    'the chair sends the ballot: CG 1st, OG 2nd, OO 3rd, CO 4th')
  const other = rooms.find(d => d.id !== withWing.id)
  const oc = judgeClients.get(other.judgeIds[0])
  const os = (await oc('GET', `/ballots/${other.id}`)).data
  const sc2 = {}
  ;[['proposition', 70], ['opposition', 74], ['closingProposition', 72], ['closingOpposition', 76]].forEach(([side, v]) => os[side].speakers.forEach(x => (sc2[x.id] = v)))
  ok((await oc('POST', `/ballots/${other.id}`, { scores: sc2 })).status === 201, 'the other room is decided (the ranking comes from the totals)')
  const decided = (await host.c('GET', `/tournaments/${bp.id}`)).data.debates.find(d => d.id === withWing.id)
  ok(decided.winner === 'closingProposition' && decided.ranking?.length === 4 && decided.ballotStatus === 'submitted', 'the debate keeps its places')
  ok((await host.c('PATCH', `/rounds/${round1.id}`, { status: 'completed' })).status === 200, 'the BP round is completed')

  // standings: 3/2/1/0 team points, then speaker points; swing teams are not ranked
  await admin('PATCH', `/admin/tournaments/${bp.id}`, { moderation: 'approved' })
  const st = (await client()('GET', `/tournaments/${bp.id}/standings`)).data.teams
  const pointsOf = id => st.find(x => x.team.id === id)?.points
  ok(st.length === 6 && st.every(x => x.team.swing === false), 'swing teams stay out of the BP standings')
  const real = new Set(teamsNow.filter(x => !x.swing).map(x => x.id))
  const expected = [[withWing.closingPropositionTeamId, 3], [withWing.propositionTeamId, 2], [withWing.oppositionTeamId, 1], [withWing.closingOppositionTeamId, 0]].filter(([id]) => real.has(id))
  ok(expected.every(([id, p]) => pointsOf(id) === p), 'places give 3/2/1/0 team points')
  ok(st.every((x, i) => i === 0 || st[i - 1].points >= x.points), 'the BP table is ordered by team points')

  // round 2: every team moves to a position it has not held yet
  const round2 = (await host.c('GET', `/tournaments/${bp.id}`)).data.rounds[1]
  r = await host.c('POST', `/rounds/${round2.id}/draw`, { addSwing: true })
  const pos = d => [d.propositionTeamId, d.oppositionTeamId, d.closingPropositionTeamId, d.closingOppositionTeamId]
  const before = new Map(rooms.flatMap(d => pos(d).map((id, i) => [id, i])))
  ok(r.status === 201 && r.data.debates.every(d => pos(d).every((id, i) => before.get(id) !== i)), 'the second round balances positions: nobody repeats OG/OO/CG/CO')
  const room1 = r.data.debates.map(pos).find(ids => ids.includes(withWing.closingPropositionTeamId))
  // swing teams are ranked last, so the check holds for real teams only
  const leaders = [withWing.closingPropositionTeamId, withWing.propositionTeamId]
  ok(!leaders.every(id => real.has(id)) || room1.includes(withWing.propositionTeamId), 'power pairing: the round 1 leaders meet in the top room')
}
// ---------- 40. the playoffs: break, bracket, champion by the final ----------
{
  const sleep = ms => new Promise(res => setTimeout(res, ms))
  // one full round: draw, motion, every panel votes, completed
  const details = async (c, id) => (await c('GET', `/tournaments/${id}`)).data
  const playRound = async (c, tid, roundId, build) => {
    const drawn = await c('POST', `/rounds/${roundId}/draw`, { addSwing: false })
    if (drawn.status !== 201) ok(false, `draw ${drawn.status} ${JSON.stringify(drawn.data)}`)
    await c('PATCH', `/rounds/${roundId}`, { motion: 'ЭП поддерживает четырёхдневную рабочую неделю', status: 'released' })
    for (const d of (await details(c, tid)).debates.filter(x => x.roundId === roundId)) await panelVote(d.id, build)
    return c('PATCH', `/rounds/${roundId}`, { status: 'completed' })
  }
  // WSDC ballots: `win` decides which side has the higher scores
  const wsdc = win => sheet => {
    const hi = win === 'proposition' ? 'proposition' : 'opposition', lo = hi === 'proposition' ? 'opposition' : 'proposition'
    const scores = {}
    sheet[hi].speakers.forEach(x => (scores[x.id] = 72)); sheet[lo].speakers.forEach(x => (scores[x.id] = 68))
    return {
      winner: hi, scores, reply: { [hi]: 36, [lo]: 34 },
      replySpeakers: { proposition: sheet.proposition.speakers[0].id, opposition: sheet.opposition.speakers[0].id },
    }
  }

  const host = await newAccount('Плей-офф Организатор')
  const po = (await host.c('POST', '/tournaments', { ...tBody(95), name: `Плей-офф ${jtag}`, preliminaryRounds: 2, breakSize: 4 })).data
  await admin('PATCH', `/admin/tournaments/${po.id}`, { moderation: 'approved' })
  const names = ['Альтаир', 'Вега', 'Сириус', 'Капелла', 'Ригель', 'Денеб', 'Антарес', 'Поллукс']
  for (const n of names) await host.c('POST', `/tournaments/${po.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} Один`, `${n} Два`, `${n} Три`] })
  for (let i = 1; i <= 4; i++) await addJudge(host.c, po.id, `Судья Плей-офф ${i}`)

  ok((await host.c('POST', `/tournaments/${po.id}/break`)).data?.error === 'tournament_not_ongoing', 'the break is announced only during the tournament')
  await host.c('PATCH', `/tournaments/${po.id}`, { status: 'ongoing' })
  ok((await host.c('POST', `/tournaments/${po.id}/break`)).data?.error === 'preliminaries_unfinished', 'the break waits for every preliminary round')
  const prelims = (await details(host.c, po.id)).rounds
  let played = 0
  for (const pr of prelims) if ((await playRound(host.c, po.id, pr.id, wsdc('proposition'))).status === 200) played++
  ok(played === 2, 'the preliminary rounds are played')
  const table = (await client()('GET', `/tournaments/${po.id}/standings`)).data.teams

  r = await host.c('POST', `/tournaments/${po.id}/break`)
  const seeds = r.data?.seeds ?? []
  ok(r.status === 201 && seeds.length === 4 && seeds.map(s => s.team.id).join() === table.slice(0, 4).map(x => x.team.id).join(),
    'the break seeds the top four of the standings 1–4')
  ok(r.data.rounds.map(x => x.stage).join() === 'semi,final' && r.data.rounds.every(x => x.status === 'draft'), 'a break of four makes a semifinal and a final')
  ok((await host.c('POST', `/tournaments/${po.id}/break`)).data?.error === 'break_already_announced', 'the break is announced once')
  {
    // speakers with an account learn whether their team broke (re-announced to see the letters of this announcement)
    const inside = await newAccount('Брейк Прошёл'), outside = await newAccount('Брейк Непрошёл')
    const slot = async (teamId, id) => db.query('update speakers set user_id = $1 where id = (select id from speakers where team_id = $2 order by position limit 1)', [id, teamId])
    await slot(seeds[0].team.id, inside.id)
    await slot(table[table.length - 1].team.id, outside.id)
    await host.c('DELETE', `/tournaments/${po.id}/break`)
    await host.c('POST', `/tournaments/${po.id}/break`)
    await sleep(300)
    const got = async (a, type) => (await notes(a.c)).items.find(n => n.type === type)
    const inN = await got(inside, 'participant.breakIn')
    ok(inN?.data.seed === 1 && inN.data.team === seeds[0].team.name, 'a speaker of a breaking team gets "you are in the playoffs" with the seed')
    ok(!!(await got(outside, 'participant.breakOut')), 'a speaker of a team that did not break is told too')
  }
  ok((await host.c('DELETE', `/tournaments/${po.id}/break`)).status === 204 && (await details(host.c, po.id)).rounds.length === 2, 'the break can be cancelled before it starts')
  r = await host.c('POST', `/tournaments/${po.id}/break`)
  ok(r.status === 201, 'and announced again')
  const seedList = r.data.seeds
  const seed = n => seedList.find(s => s.seed === n).team.id
  const [semi, final] = r.data.rounds

  ok((await host.c('POST', `/rounds/${final.id}/draw`)).data?.error === 'previous_round_unfinished', 'the final is drawn after the semifinal')
  r = await host.c('POST', `/rounds/${semi.id}/draw`)
  const semis = [...(r.data?.debates ?? [])].sort((a, b) => a.bracketSlot - b.bracketSlot)
  ok(r.status === 201 && semis.length === 2 && semis[0].propositionTeamId === seed(1) && semis[0].oppositionTeamId === seed(4)
    && semis[1].propositionTeamId === seed(2) && semis[1].oppositionTeamId === seed(3), 'semifinals: 1 v 4 and 2 v 3, the higher seed is Proposition')
  ok((await host.c('PATCH', `/tournaments/${po.id}`, { status: 'finished' })).data?.error !== undefined, 'the tournament cannot finish before the final')
  // the underdogs win both semifinals: seeds 4 and 3 reach the final
  ok((await playRound(host.c, po.id, semi.id, wsdc('opposition'))).status === 200, 'the semifinals are played')
  r = await host.c('POST', `/rounds/${final.id}/draw`)
  const fin = r.data?.debates?.[0]
  ok(r.status === 201 && r.data.debates.length === 1 && fin.propositionTeamId === seed(3) && fin.oppositionTeamId === seed(4), 'the winners meet in the final (seed 3 v seed 4)')
  ok((await playRound(host.c, po.id, final.id, wsdc('proposition'))).status === 200, 'the final is played')
  const after = (await client()('GET', `/tournaments/${po.id}/standings`)).data.teams
  ok(after.reduce((n, x) => n + x.wins, 0) === 8, 'playoff debates do not change the standings')
  const bracket = (await client()('GET', `/tournaments/${po.id}/bracket`)).data
  ok(bracket.champion?.id === seed(3) && bracket.rounds.every(x => x.status === 'completed'), 'the champion is the winner of the final, not the leader of the standings')

  ok((await host.c('PATCH', `/tournaments/${po.id}`, { status: 'finished' })).status === 200, 'after the final the tournament finishes')
  let certs = []
  for (let i = 0; i < 30 && certs.length < 24; i++) {
    await sleep(200)
    certs = (await db.query("select c.team_place, c.in_break, s.team_id from certificates c join speakers s on s.id = c.speaker_id where c.tournament_id = $1 and c.kind = 'speaker'", [po.id])).rows
  }
  const placeOf = id => certs.find(c => c.team_id === id)?.team_place
  ok(placeOf(seed(3)) === 1 && placeOf(seed(4)) === 2 && placeOf(seed(1)) === 3 && placeOf(seed(2)) === 3, 'certificates: champion 1st, finalist 2nd, semifinalists 3rd')
  const out = certs.filter(c => !seedList.some(s => s.team.id === c.team_id))
  ok(out.length === 12 && out.every(c => c.team_place >= 5 && !c.in_break) && certs.filter(c => c.in_break).length === 12, 'teams that did not break are placed 5th and below')
  const champName = (await details(host.c, po.id)).teams.find(x => x.id === seed(3)).name
  let owner
  for (let i = 0; i < 20 && !owner; i++) { await sleep(150); owner = (await notes(host.c)).items.find(n => n.type === 'organizer.tournamentFinished') }
  ok(owner?.data?.winner === champName, 'the organizers learn the champion (the winner of the final)')

  // British Parliamentary: the final is one room of four; places 1–4 come from its ranking
  ok((await host.c('POST', '/tournaments', { ...tBody(96), name: `BP мал ${jtag}`, format: 'BP', breakSize: 2 })).status === 400, 'a BP break needs at least four teams')
  const bpHost = await newAccount('BP Плей-офф')
  const bp = (await bpHost.c('POST', '/tournaments', { ...tBody(97), name: `BP плей-офф ${jtag}`, format: 'BP', preliminaryRounds: 2, breakSize: 4 })).data
  await admin('PATCH', `/admin/tournaments/${bp.id}`, { moderation: 'approved' })
  for (const n of names) await bpHost.c('POST', `/tournaments/${bp.id}/teams`, { name: n, institution: `Вуз ${n}`, speakers: [`${n} А`, `${n} Б`] })
  for (let i = 1; i <= 2; i++) await addJudge(bpHost.c, bp.id, `BP Судья Плей-офф ${i}`)
  await bpHost.c('PATCH', `/tournaments/${bp.id}`, { status: 'ongoing' })
  // BP ballots: the chair scores OG > OO > CG > CO
  const bpVote = sheet => {
    const scores = {}
    ;[['proposition', 80], ['opposition', 76], ['closingProposition', 72], ['closingOpposition', 68]].forEach(([side, v]) => sheet[side].speakers.forEach(x => (scores[x.id] = v)))
    return { scores }
  }
  const bpPanel = async (debateId, build) => {
    const chairId = (await db.query('select judge_id from debate_judges where debate_id = $1 and is_chair', [debateId])).rows[0].judge_id
    const c = await judgeAs(chairId)
    const res = await c('POST', `/ballots/${debateId}`, build((await c('GET', `/ballots/${debateId}`)).data))
    if (res.status !== 201) ok(false, `BP ballot ${res.status} ${JSON.stringify(res.data)}`)
  }
  for (const bpPrelim of (await details(bpHost.c, bp.id)).rounds) {
    await bpHost.c('POST', `/rounds/${bpPrelim.id}/draw`, { addSwing: false })
    await bpHost.c('PATCH', `/rounds/${bpPrelim.id}`, { motion: 'ЭП ввела бы налог на роскошь', status: 'released' })
    for (const d of (await details(bpHost.c, bp.id)).debates.filter(x => x.roundId === bpPrelim.id)) await bpPanel(d.id, bpVote)
    await bpHost.c('PATCH', `/rounds/${bpPrelim.id}`, { status: 'completed' })
  }
  r = await bpHost.c('POST', `/tournaments/${bp.id}/break`)
  ok(r.status === 201 && r.data.rounds.length === 1 && r.data.rounds[0].stage === 'final' && r.data.rounds[0].teamsInRound === 4, 'a BP break of four is one final room')
  const bpFinal = r.data.rounds[0]
  r = await bpHost.c('POST', `/rounds/${bpFinal.id}/draw`)
  const room = r.data?.debates?.[0]
  const inRoom = room ? [room.propositionTeamId, room.oppositionTeamId, room.closingPropositionTeamId, room.closingOppositionTeamId] : []
  const bpSeeds = (await client()('GET', `/tournaments/${bp.id}/bracket`)).data.seeds.map(s => s.team.id)
  ok(r.status === 201 && new Set(inRoom).size === 4 && inRoom.every(id => bpSeeds.includes(id)), 'the BP final seats the four breaking teams')
  await bpHost.c('PATCH', `/rounds/${bpFinal.id}`, { motion: 'ЭП отменила бы домашние задания', status: 'released' })
  await bpPanel(room.id, bpVote)
  await bpHost.c('PATCH', `/rounds/${bpFinal.id}`, { status: 'completed' })
  const bpBracket = (await client()('GET', `/tournaments/${bp.id}/bracket`)).data
  ok(bpBracket.champion?.id === room.propositionTeamId, 'the BP champion is 1st in the final room')
}
// ---------- 41. minors: parents' consent for school and mixed tournaments ----------
{
  const host = await newAccount('Согласие Организатор')
  const mk = async (n, level) => {
    const t = (await host.c('POST', '/tournaments', { ...tBody(100 + n), name: `Согласие ${n} ${jtag}`, level })).data
    await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
    return t
  }
  const school = await mk(1, 'school'), uni = await mk(2, 'university')
  const body = name => ({ teamName: name, institution: 'Лицей', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'], phone: '+7 701 555 44 33' })
  r = await student('POST', `/tournaments/${school.id}/registrations`, body('Без согласия'))
  ok(r.status === 400 && r.data.error === 'guardian_consent_required', "a school tournament needs the parents' consent")
  r = await student('POST', `/tournaments/${school.id}/registrations`, { ...body('С согласием'), guardianConsent: true })
  const saved = r.status === 201 && (await db.query('select guardian_consent_at from team_registrations where id = $1', [r.data.id])).rows[0]?.guardian_consent_at
  ok(!!saved, 'the confirmation is stored with its time')
  r = await student('POST', `/tournaments/${uni.id}/registrations`, body('Студенты'))
  ok(r.status === 201, 'a university tournament does not ask for it')
}
// ---------- 42. online rooms: a video call link per room, only for the debate's people ----------
{
  const host = await newAccount('Онлайн Организатор')
  const on = (await host.c('POST', '/tournaments', { ...tBody(110), name: `Онлайн ${jtag}` })).data
  await admin('PATCH', `/admin/tournaments/${on.id}`, { moderation: 'approved' })
  ok((await host.c('PATCH', `/tournaments/${on.id}`, { roomLinks: { 'Зал А': 'http://zoom.us/j/1' } })).status === 400, 'room links must be https')
  const links = { 'Зал А': 'https://zoom.us/j/111', 'Зал Б': 'https://meet.google.com/abc-defg-hij' }
  r = await host.c('PATCH', `/tournaments/${on.id}`, { rooms: ['Зал А', 'Зал Б'], roomLinks: links })
  ok(r.status === 200, 'the organizer saves a link for each room')
  for (const n of ['Онлайн 1', 'Онлайн 2']) await host.c('POST', `/tournaments/${on.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} А`, `${n} Б`, `${n} В`] })
  const oj = await addJudge(host.c, on.id, 'Онлайн Судья')
  const round = (await host.c('GET', `/tournaments/${on.id}`)).data.rounds[0]
  r = await host.c('POST', `/rounds/${round.id}/draw`, { addSwing: false })
  const deb = r.data?.debates?.[0]
  ok(deb?.room === 'Зал А' && deb.onlineUrl === links['Зал А'], "the draw gives each debate its room's link")
  await host.c('PATCH', `/rounds/${round.id}`, { motion: 'ЭП перевела бы школы на онлайн-обучение', status: 'released' })
  const pub = (await client()('GET', `/tournaments/${on.id}`)).data.debates.find(x => x.id === deb.id)
  ok(pub && pub.onlineUrl === undefined, 'the public page never shows the link')
  const mine = (await judgeClients.get(oj.data.id)('GET', '/judge/assignments')).data.find(a => a.debate.id === deb.id)
  ok(mine?.debate.onlineUrl === links['Зал А'], "the judge sees the room's link")
  r = await host.c('PATCH', `/debates/${deb.id}`, { room: 'Зал Б' })
  ok(r.data?.onlineUrl === links['Зал Б'], 'moving the debate to another room brings that room\'s link')
  r = await host.c('PATCH', `/debates/${deb.id}`, { onlineUrl: null })
  ok(r.status === 200 && r.data.onlineUrl === undefined, 'the organizer can remove a link')
}
// ---------- 43. silent rounds: results hidden from the public until the break ----------
{
  const host = await newAccount('Тихие Организатор')
  const q = (await host.c('POST', '/tournaments', { ...tBody(120), name: `Тихие ${jtag}`, preliminaryRounds: 2, breakSize: 2 })).data
  await admin('PATCH', `/admin/tournaments/${q.id}`, { moderation: 'approved' })
  for (const n of ['Тихие 1', 'Тихие 2', 'Тихие 3', 'Тихие 4']) await host.c('POST', `/tournaments/${q.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} А`, `${n} Б`, `${n} В`] })
  for (let i = 1; i <= 2; i++) await addJudge(host.c, q.id, `Тихий Судья ${i}`)
  await host.c('PATCH', `/tournaments/${q.id}`, { status: 'ongoing' })
  const vote = sheet => {
    const scores = {}
    sheet.proposition.speakers.forEach(x => (scores[x.id] = 72)); sheet.opposition.speakers.forEach(x => (scores[x.id] = 68))
    return { winner: 'proposition', scores, reply: { proposition: 36, opposition: 34 }, replySpeakers: { proposition: sheet.proposition.speakers[0].id, opposition: sheet.opposition.speakers[0].id } }
  }
  const [r1, r2] = (await host.c('GET', `/tournaments/${q.id}`)).data.rounds
  for (const rd of [r1, r2]) {
    await host.c('POST', `/rounds/${rd.id}/draw`, { addSwing: false })
    // round 2 is closed after its draw is made: the switch works at any time
    if (rd.id === r2.id) ok((await host.c('PATCH', `/rounds/${rd.id}`, { silent: true })).status === 200, 'the organizer closes round 2 after its draw')
    await host.c('PATCH', `/rounds/${rd.id}`, { motion: 'ЭП запретила бы домашние задания', status: 'released' })
    for (const d of (await host.c('GET', `/tournaments/${q.id}`)).data.debates.filter(x => x.roundId === rd.id)) await panelVote(d.id, vote)
    await host.c('PATCH', `/rounds/${rd.id}`, { status: 'completed' })
  }
  const wins = rows => rows.reduce((n, x) => n + x.wins, 0)
  ok(wins((await client()('GET', `/tournaments/${q.id}/standings`)).data.teams) === 2, 'the public table counts only the open round')
  ok(wins((await host.c('GET', `/tournaments/${q.id}/standings`)).data.teams) === 4, 'the organizer sees the full table')
  const pubDebates = (await client()('GET', `/tournaments/${q.id}`)).data.debates
  ok(pubDebates.filter(x => x.roundId === r2.id).every(x => x.winner === undefined) && pubDebates.filter(x => x.roundId === r1.id).every(x => x.winner),
    "the public draw hides who won a silent round")
  ok((await host.c('PATCH', `/rounds/${r2.id}`, { silent: false })).status === 200
    && wins((await client()('GET', `/tournaments/${q.id}/standings`)).data.teams) === 4, 'opening the round shows its results at once')
  await host.c('PATCH', `/rounds/${r2.id}`, { silent: true })
  ok((await host.c('POST', `/tournaments/${q.id}/break`)).status === 201, 'the break is announced (on the real results)')
  const final = (await host.c('GET', `/tournaments/${q.id}`)).data.rounds.find(x => x.kind === 'elimination')
  ok((await host.c('PATCH', `/rounds/${final.id}`, { silent: true })).data?.error === 'playoff_round_not_silent', 'a playoff round cannot be closed')
  ok(wins((await client()('GET', `/tournaments/${q.id}/standings`)).data.teams) === 4, 'after the break the silent round is revealed')
}
// ---------- 44. judge conflicts: institution, own club, personal ----------
{
  const host = await newAccount('Конфликты Организатор')
  const k = (await host.c('POST', '/tournaments', { ...tBody(130), name: `Конфликты ${jtag}` })).data
  await admin('PATCH', `/admin/tournaments/${k.id}`, { moderation: 'approved' })
  for (const n of ['Кон 1', 'Кон 2', 'Кон 3', 'Кон 4']) await host.c('POST', `/tournaments/${k.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} А`, `${n} Б`, `${n} В`] })
  const teams = (await host.c('GET', `/tournaments/${k.id}`)).data.teams
  const [jA, jB, jC] = [await addJudge(host.c, k.id, 'Судья Родственник'), await addJudge(host.c, k.id, 'Судья Тренер'), await addJudge(host.c, k.id, 'Судья Свободный')].map(x => x.data.id)
  // A: a relative of team 1 (personal conflict); B: coaches the club of team 2 (club conflict)
  ok((await host.c('PUT', `/judges/${jA}/conflicts`, { teamIds: ['nope'] })).data?.error === 'invalid_team', 'a conflict needs a team of this tournament')
  r = await host.c('PUT', `/judges/${jA}/conflicts`, { teamIds: [teams[0].id] })
  ok(r.status === 200 && r.data.teamIds.length === 1, 'the organizer marks a personal conflict')
  const coach = (await db.query('select user_id from judges where id = $1', [jB])).rows[0].user_id
  const club = (await judgeClients.get(jB)('POST', '/clubs', { name: `Клуб тренера ${jtag}`, city: 'Астана' })).data
  await db.query('update teams set club_id = $1 where id = $2', [club.id, teams[1].id])
  ok(!!coach && !!club.id, "the coach's club is the club of team 2")
  const details = (await host.c('GET', `/tournaments/${k.id}`)).data
  ok(details.judges.find(j => j.id === jA)?.conflictTeamIds?.[0] === teams[0].id && details.judges.find(j => j.id === jB)?.clubId === club.id, 'organizers see the conflicts')
  const round = details.rounds[0]
  const bad = { [jA]: teams[0].id, [jB]: teams[1].id }
  let clean = 0
  for (let i = 0; i < 6; i++) {
    const res = await host.c('POST', `/rounds/${round.id}/draw`, { addSwing: false, method: 'random' })
    const ok1 = res.status === 201 && res.data.report.judgeConflicts === 0
      && res.data.debates.every(d => d.judgeIds.every(j => !bad[j] || ![d.propositionTeamId, d.oppositionTeamId].includes(bad[j])))
    if (ok1) clean++
  }
  ok(clean === 6, 'every draw keeps judges away from teams they have a conflict with')
  const deb = (await host.c('GET', `/tournaments/${k.id}`)).data.debates.find(d => [d.propositionTeamId, d.oppositionTeamId].includes(teams[0].id))
  r = await host.c('PATCH', `/debates/${deb.id}`, { chairJudgeId: jA })
  ok(r.status === 400 && r.data.error === 'judge_conflict', 'a judge with a conflict cannot be put into that room by hand')
  // (the judge may still be busy in the other room: that answer is judge_busy_in_round, not a conflict)
  ok((await host.c('PUT', `/judges/${jA}/conflicts`, { teamIds: [] })).status === 200
    && (await host.c('PATCH', `/debates/${deb.id}`, { chairJudgeId: jA })).data?.error !== 'judge_conflict', 'after the conflict is removed the conflict check no longer stops the judge')
}
// ---------- 45. judge feedback: speakers rate the judges of their debate, organizers read it ----------
{
  const host = await newAccount('Отзывы Организатор')
  const f = (await host.c('POST', '/tournaments', { ...tBody(140), name: `Отзывы ${jtag}` })).data
  await admin('PATCH', `/admin/tournaments/${f.id}`, { moderation: 'approved' })
  for (const n of ['Отзыв 1', 'Отзыв 2']) await host.c('POST', `/tournaments/${f.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} А`, `${n} Б`, `${n} В`] })
  const fj = (await addJudge(host.c, f.id, 'Оцениваемый Судья')).data.id
  const speaker = await newAccount('Отзыв Спикер')
  const team = (await host.c('GET', `/tournaments/${f.id}`)).data.teams[0]
  await db.query('update speakers set user_id = $1 where id = $2', [speaker.id, team.speakers[0].id])
  const round = (await host.c('GET', `/tournaments/${f.id}`)).data.rounds[0]
  await host.c('POST', `/rounds/${round.id}/draw`, { addSwing: false })
  const deb = (await host.c('GET', `/tournaments/${f.id}`)).data.debates[0]
  ok((await speaker.c('POST', `/debates/${deb.id}/feedback`, { judgeId: fj, score: 5 })).data?.error === 'round_not_released', 'feedback opens once the draw is out')
  await host.c('PATCH', `/rounds/${round.id}`, { motion: 'ЭП ввела бы обязательное голосование', status: 'released' })
  ok((await speaker.c('POST', `/debates/${deb.id}/feedback`, { judgeId: fj, score: 6 })).status === 400, 'the score is 1 to 5')
  const outsider = await newAccount('Чужой Зритель')
  ok((await outsider.c('POST', `/debates/${deb.id}/feedback`, { judgeId: fj, score: 1 })).data?.error === 'not_in_debate', 'only speakers of the debate rate its judges')
  ok((await speaker.c('POST', `/debates/${deb.id}/feedback`, { judgeId: fj, score: 3 })).status === 201, 'a speaker rates the judge')
  ok((await speaker.c('POST', `/debates/${deb.id}/feedback`, { judgeId: fj, score: 4, comment: 'Понятно объяснил решение' })).status === 201, 'and can change the rating')
  const mine = (await speaker.c('GET', '/me/debates')).data.find(x => x.debate.id === deb.id)
  ok(mine?.judges?.[0]?.myScore === 4, 'the speaker sees the rating they gave')
  const fb = (await host.c('GET', `/tournaments/${f.id}/judge-feedback`)).data
  ok(fb.length === 1 && fb[0].judgeId === fj && fb[0].count === 1 && fb[0].average === 4 && fb[0].items[0].comment === 'Понятно объяснил решение' && fb[0].items[0].team === team.name,
    'the organizer reads the average and the comments')
  ok((await judgeClients.get(fj)('GET', `/tournaments/${f.id}/judge-feedback`)).status === 403, 'the judge does not read feedback about themselves')
}
// ---------- 46. break categories: a separate bracket for novices ----------
{
  const sleep = ms => new Promise(res => setTimeout(res, ms))
  const host = await newAccount('Категории Организатор')
  const cat = (await host.c('POST', '/tournaments', { ...tBody(150), name: `Категории ${jtag}`, preliminaryRounds: 2, breakSize: 2 })).data
  await admin('PATCH', `/admin/tournaments/${cat.id}`, { moderation: 'approved' })
  ok((await host.c('PATCH', `/tournaments/${cat.id}`, { breakCategories: [{ key: 'nov', name: 'Новички', size: 2 }, { key: 'nov', name: 'Дубль', size: 2 }] })).data?.error === 'invalid_break_categories', 'category keys are unique')
  r = await host.c('PATCH', `/tournaments/${cat.id}`, { breakCategories: [{ key: 'nov', name: 'Новички', size: 2 }] })
  ok(r.status === 200, 'the organizer adds a novice category with a break of two')
  const names = ['Кат 1', 'Кат 2', 'Кат 3', 'Кат 4', 'Кат 5', 'Кат 6']
  for (const n of names) await host.c('POST', `/tournaments/${cat.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} А`, `${n} Б`, `${n} В`] })
  for (let i = 1; i <= 3; i++) await addJudge(host.c, cat.id, `Судья Категорий ${i}`)
  const teams = (await host.c('GET', `/tournaments/${cat.id}`)).data.teams
  ok((await host.c('PUT', `/teams/${teams[0].id}/categories`, { categories: ['junior'] })).data?.error === 'invalid_break_categories', 'only a known category can be ticked')
  // every team is a novice: the open break takes the top two, the novice bracket the next two
  for (const tm of teams) await host.c('PUT', `/teams/${tm.id}/categories`, { categories: ['nov'] })
  await host.c('PATCH', `/tournaments/${cat.id}`, { status: 'ongoing' })
  const vote = sheet => {
    const scores = {}
    sheet.proposition.speakers.forEach(x => (scores[x.id] = 72)); sheet.opposition.speakers.forEach(x => (scores[x.id] = 68))
    return { winner: 'proposition', scores, reply: { proposition: 36, opposition: 34 }, replySpeakers: { proposition: sheet.proposition.speakers[0].id, opposition: sheet.opposition.speakers[0].id } }
  }
  const play = async rd => {
    await host.c('POST', `/rounds/${rd.id}/draw`, { addSwing: false })
    await host.c('PATCH', `/rounds/${rd.id}`, { motion: 'ЭП отменила бы оценки в школе', status: 'released' })
    for (const d of (await host.c('GET', `/tournaments/${cat.id}`)).data.debates.filter(x => x.roundId === rd.id)) await panelVote(d.id, vote)
    return host.c('PATCH', `/rounds/${rd.id}`, { status: 'completed' })
  }
  for (const rd of (await host.c('GET', `/tournaments/${cat.id}`)).data.rounds) await play(rd)
  const table = (await host.c('GET', `/tournaments/${cat.id}/standings`)).data.teams.map(x => x.team.id)
  r = await host.c('POST', `/tournaments/${cat.id}/break`)
  const nov = r.data?.categories?.[0]
  ok(r.status === 201 && r.data.seeds.map(s => s.team.id).join() === table.slice(0, 2).join() && nov?.seeds.map(s => s.team.id).join() === table.slice(2, 4).join(),
    'the open break takes the top two, the novice bracket the next two novices')
  ok(r.data.rounds.length === 1 && nov.rounds.length === 1 && nov.rounds[0].name.includes('Новички'), 'each bracket has its own final')
  ok((await host.c('PUT', `/teams/${teams[0].id}/categories`, { categories: [] })).status === 403, 'categories are fixed once the break is announced')
  const finals = (await host.c('GET', `/tournaments/${cat.id}`)).data.rounds.filter(x => x.kind === 'elimination')
  ok(finals.find(x => x.category === 'nov')?.categoryName === 'Новички', 'the novice final is named after its category')
  for (const rd of finals) ok((await play(rd)).status === 200, `the ${rd.category ? 'novice' : 'open'} final is played`)
  const br = (await client()('GET', `/tournaments/${cat.id}/bracket`)).data
  const novChamp = br.categories[0].champion?.id
  ok(!!br.champion && !!novChamp && novChamp !== br.champion.id && table.slice(2, 4).includes(novChamp), 'the novice champion comes from the novice bracket')
  ok((await host.c('PATCH', `/tournaments/${cat.id}`, { status: 'finished' })).status === 200, 'the tournament finishes after both finals')
  let cert
  for (let i = 0; i < 30 && !cert; i++) {
    await sleep(200)
    cert = (await db.query("select c.break_category, c.category_place, c.in_break from certificates c join speakers s on s.id = c.speaker_id where c.tournament_id = $1 and s.team_id = $2 limit 1", [cat.id, novChamp])).rows[0]
  }
  ok(cert?.break_category === 'Новички' && cert.category_place === 1 && cert.in_break === true, "the novice champion's certificate says so")
}
// ---------- 47. draw methods: round robin, slide, fold ----------
{
  const host = await newAccount('Методы Организатор')
  const rr = (await host.c('POST', '/tournaments', { ...tBody(160), name: `Круговой ${jtag}`, preliminaryRounds: 3, breakSize: 2 })).data
  await admin('PATCH', `/admin/tournaments/${rr.id}`, { moderation: 'approved' })
  for (const n of ['Круг 1', 'Круг 2', 'Круг 3', 'Круг 4']) await host.c('POST', `/tournaments/${rr.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} А`, `${n} Б`, `${n} В`] })
  for (let i = 1; i <= 2; i++) await addJudge(host.c, rr.id, `Круговой Судья ${i}`)
  const vote = sheet => {
    const scores = {}
    sheet.proposition.speakers.forEach(x => (scores[x.id] = 72)); sheet.opposition.speakers.forEach(x => (scores[x.id] = 68))
    return { winner: 'proposition', scores, reply: { proposition: 36, opposition: 34 }, replySpeakers: { proposition: sheet.proposition.speakers[0].id, opposition: sheet.opposition.speakers[0].id } }
  }
  const meetings = new Set()
  let draws = 0
  for (const rd of (await host.c('GET', `/tournaments/${rr.id}`)).data.rounds) {
    r = await host.c('POST', `/rounds/${rd.id}/draw`, { addSwing: false, method: 'round_robin' })
    if (r.status === 201) draws++
    r.data.debates.forEach(d => meetings.add([d.propositionTeamId, d.oppositionTeamId].sort().join('|')))
    await host.c('PATCH', `/rounds/${rd.id}`, { motion: 'ЭП ввела бы бесплатный транспорт', status: 'released' })
    for (const d of (await host.c('GET', `/tournaments/${rr.id}`)).data.debates.filter(x => x.roundId === rd.id)) await panelVote(d.id, vote)
    await host.c('PATCH', `/rounds/${rd.id}`, { status: 'completed' })
  }
  ok(draws === 3 && meetings.size === 6, 'round robin: in three rounds every one of four teams meets each other once')

  const sf = (await host.c('POST', '/tournaments', { ...tBody(161), name: `Слайд ${jtag}`, preliminaryRounds: 2, breakSize: 2 })).data
  await admin('PATCH', `/admin/tournaments/${sf.id}`, { moderation: 'approved' })
  for (const n of ['Слайд 1', 'Слайд 2', 'Слайд 3', 'Слайд 4', 'Слайд 5', 'Слайд 6', 'Слайд 7', 'Слайд 8']) await host.c('POST', `/tournaments/${sf.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} А`, `${n} Б`, `${n} В`] })
  for (let i = 1; i <= 4; i++) await addJudge(host.c, sf.id, `Слайд Судья ${i}`)
  const [s1, s2] = (await host.c('GET', `/tournaments/${sf.id}`)).data.rounds
  await host.c('POST', `/rounds/${s1.id}/draw`, { addSwing: false })
  await host.c('PATCH', `/rounds/${s1.id}`, { motion: 'ЭП запретила бы смартфоны в школах', status: 'released' })
  for (const d of (await host.c('GET', `/tournaments/${sf.id}`)).data.debates.filter(x => x.roundId === s1.id)) await panelVote(d.id, vote)
  await host.c('PATCH', `/rounds/${s1.id}`, { status: 'completed' })
  const winners = new Set((await host.c('GET', `/tournaments/${sf.id}`)).data.debates.filter(x => x.roundId === s1.id).map(d => d.propositionTeamId))
  for (const method of ['slide', 'fold']) {
    r = await host.c('POST', `/rounds/${s2.id}/draw`, { addSwing: false, method })
    ok(r.status === 201 && r.data.debates.every(d => winners.has(d.propositionTeamId) === winners.has(d.oppositionTeamId)), `${method}: teams meet inside their bracket (winners with winners)`)
  }
  const bpT = (await host.c('POST', '/tournaments', { ...tBody(162), name: `BP метод ${jtag}`, format: 'BP', breakSize: 4 })).data
  const bpRound = (await host.c('GET', `/tournaments/${bpT.id}`)).data.rounds[0]
  ok((await host.c('POST', `/rounds/${bpRound.id}/draw`, { method: 'round_robin' })).data?.error === 'method_not_for_bp', 'round robin is for two-team formats')
}
// ---------- 48. the place: region, city or village, district ----------
{
  const host = await newAccount('География Организатор')
  const a = (await host.c('POST', '/tournaments', { ...tBody(170), name: `Кокшетау ${jtag}`, city: 'Кокшетау' })).data
  ok(a.region === 'akmola', "a known city brings its region")
  r = await host.c('POST', '/tournaments', { ...tBody(171), name: `Село ${jtag}`, city: 'Жарма', region: 'abai', district: 'ул. Абая, 10' })
  ok(r.status === 201 && r.data.region === 'abai' && r.data.district === 'ул. Абая, 10', 'a village is typed in with its region and an address')
  ok((await host.c('POST', '/tournaments', { ...tBody(172), name: `Нет региона ${jtag}`, region: 'mars' })).status === 400, 'an unknown region is refused')
  for (const x of [a, r.data]) await admin('PATCH', `/admin/tournaments/${x.id}`, { moderation: 'approved' })
  const akmola = (await client()('GET', '/tournaments?region=akmola&limit=100')).data
  ok(akmola.some(x => x.id === a.id) && !akmola.some(x => x.id === r.data.id), 'the list filters by region')
  ok((await host.c('PATCH', `/tournaments/${a.id}`, { city: 'Шымкент' })).data?.region === 'shymkent', 'a new city moves the region along')
}
// ---------- 49. selection: unlimited applications, first come / lottery, club quota, waitlist ----------
{
  const host = await newAccount('Отбор Организатор')
  const mk = async (n, extra) => {
    const t = (await host.c('POST', '/tournaments', { ...tBody(180 + n), name: `Отбор ${n} ${jtag}`, maxTeams: 4, ...extra })).data
    await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
    return t
  }
  // applicants: three in one club (X), the others in their own clubs; every club is approved by an admin
  const people = []
  let clubX
  for (const [i, name] of ['Отбор Икс Один', 'Отбор Икс Два', 'Отбор Икс Три', 'Отбор Бэ', 'Отбор Вэ', 'Отбор Гэ'].entries()) {
    const p = await newAccount(name)
    if (i === 0 || i >= 3) {
      const club = (await p.c('POST', '/clubs', { name: `Отбор клуб ${i} ${jtag}`, city: 'Астана' })).data
      await admin('PATCH', `/admin/clubs/${club.id}`, { status: 'approved' })
      if (i === 0) clubX = club.id
    } else {
      const code = (await people[0].c('GET', `/clubs/${clubX}`)).data.joinCode
      await p.c('POST', '/clubs/join', { code })
    }
    const myClub = (await p.c('GET', '/me/club')).data.club.id
    await p.c('POST', `/clubs/${myClub}/teams`, { name: `Отбор команда ${i}`, join: true })
    people.push(p)
  }
  const apply = (p, t, i) => p.c('POST', `/tournaments/${t.id}/registrations`, {
    teamName: `Отбор ${i}`, institution: 'Лицей', speakers: [`Спикер ${i} А`, `Спикер ${i} Б`, `Спикер ${i} В`], phone: '+7 701 555 44 33', guardianConsent: true,
  })

  const fc = await mk(1)
  ok((await host.c('PATCH', `/tournaments/${fc.id}`, { selectionMode: 'first_come', clubQuota: 2 })).status === 200, 'the organizer chooses "first come" and at most 2 teams per club')
  const st = []
  for (const [i, p] of people.entries()) st.push((await apply(p, fc, i)).data?.status)
  ok(st.join() === 'confirmed,confirmed,waitlisted,confirmed,confirmed,waitlisted', 'first come: places while they last; the 3rd team of a club and the 6th team wait')
  let sel = (await client()('GET', `/tournaments/${fc.id}/selection`)).data
  ok(sel.applications === 6 && sel.places === 4 && sel.taken === 4 && sel.waitlisted === 2, 'the public sees 6 applications for 4 places')
  ok((await client()('GET', `/tournaments?limit=100`)).data.find(x => x.id === fc.id)?.applications === 6, 'the tournament card counts live applications')
  // a team leaves: the club-X team is skipped (quota), the next in line takes the place
  const teams = (await host.c('GET', `/tournaments/${fc.id}`)).data.teams
  ok((await host.c('DELETE', `/teams/${teams.find(x => x.name === 'Отбор 3').id}`)).status === 204, 'the organizer removes a team')
  let regs = (await host.c('GET', `/tournaments/${fc.id}/registrations`)).data
  ok(regs.find(r => r.teamName === 'Отбор 5').status === 'confirmed' && regs.find(r => r.teamName === 'Отбор 2').status === 'waitlisted', 'the waitlist moves up, skipping a team over its club quota')
  await host.c('PATCH', `/tournaments/${fc.id}`, { clubQuota: 3, maxTeams: 6 })
  regs = (await host.c('GET', `/tournaments/${fc.id}/registrations`)).data
  ok(regs.find(r => r.teamName === 'Отбор 2').status === 'confirmed', 'a looser quota and a higher limit let the waiting team in')

  const lt = await mk(2)
  await host.c('PATCH', `/tournaments/${lt.id}`, { selectionMode: 'lottery' })
  for (const [i, p] of people.slice(0, 5).entries()) await apply(p, lt, i)
  ok((await host.c('GET', `/tournaments/${lt.id}/registrations`)).data.every(r => r.status === 'pending'), 'lottery: applications wait for the draw')
  r = await host.c('POST', `/tournaments/${lt.id}/selection/lottery`)
  ok(r.status === 201 && r.data.confirmed === 4 && r.data.waitlisted === 1, 'the lottery gives 4 places and puts the rest on the waitlist')
  sel = (await client()('GET', `/tournaments/${lt.id}/selection`)).data
  ok(sel.lotteryAt && sel.lottery.length === 5 && sel.lottery.map(x => x.rank).join() === '1,2,3,4,5', 'the lottery order is public')
  ok((await host.c('POST', `/tournaments/${lt.id}/selection/lottery`)).data?.error === 'lottery_done', 'the lottery is drawn once')
  r = await apply(people[5], lt, 5)
  ok(r.data?.status === 'waitlisted' && (await client()('GET', `/tournaments/${lt.id}/selection`)).data.lottery.find(x => x.team === 'Отбор 5')?.rank === 6, 'a late application joins the end of the waitlist')
}
// ---------- 50. tournament reviews: everyone who took part rates a finished tournament ----------
{
  const done = (await db.query("select id from tournaments where name like $1 and status = 'finished' order by created_at desc limit 1", [`Плей-офф ${jtag}`])).rows[0].id
  const judgeId = (await db.query('select id from judges where tournament_id = $1 and user_id is not null limit 1', [done])).rows[0].id
  const jc = await judgeAs(judgeId)
  ok((await notes(jc)).items.some(n => n.type === 'participant.rateTournament'), 'finishing the tournament asks its judges to rate it')
  const fan = await newAccount('Оценщик Спикер')
  const sp = (await db.query('select s.id from speakers s join teams t on t.id = s.team_id where t.tournament_id = $1 and s.user_id is null limit 1', [done])).rows[0].id
  await db.query('update speakers set user_id = $1 where id = $2', [fan.id, sp])
  ok((await (await newAccount('Посторонний Зритель')).c('POST', `/tournaments/${done}/review`, { score: 5 })).data?.error === 'not_a_participant', 'only participants and judges rate a tournament')
  ok((await fan.c('POST', `/tournaments/${done}/review`, { score: 6 })).status === 400, 'the rating is 1 to 5')
  ok((await fan.c('POST', `/tournaments/${done}/review`, { score: 3 })).status === 201
    && (await fan.c('POST', `/tournaments/${done}/review`, { score: 4, comment: 'Отличные темы, но задержки между раундами' })).status === 201, 'a speaker rates it and can change the rating')
  ok((await jc('POST', `/tournaments/${done}/review`, { score: 5 })).status === 201, 'a judge rates it too')
  const rv = (await client()('GET', `/tournaments/${done}/reviews`)).data
  ok(rv.count === 2 && rv.average === 4.5 && rv.spread.join() === '1,1,0,0,0', 'the public sees the average and the spread')
  ok(rv.items.length === 1 && rv.items[0].role === 'speaker' && rv.items[0].comment.startsWith('Отличные') && rv.items[0].author?.id === fan.id && rv.items[0].author.name === 'Оценщик Спикер', "a comment carries its author's name and role")
  {
    // the organizer answers publicly; the author is told; others cannot answer
    const ownerEmail = (await db.query("select u.email from tournament_organizers o join users u on u.id = o.user_id where o.tournament_id = $1 and o.role = 'owner'", [done])).rows[0].email
    const owner = client()
    await owner('POST', '/auth/login', { email: ownerEmail, password: 'secret123' })
    ok((await owner('GET', `/tournaments/${done}/reviews`)).data.canReply === true && rv.canReply === false, 'only organizers may answer reviews')
    ok((await fan.c('POST', `/reviews/${rv.items[0].id}/reply`, { text: 'Сам себе отвечу' })).data?.error === 'organizers_only', 'a participant cannot answer for the organizer')
    ok((await owner('POST', `/reviews/${rv.items[0].id}/reply`, { text: 'Спасибо! Задержки были из-за проектора, исправим.' })).status === 200, 'the organizer answers a review')
    const answered = (await client()('GET', `/tournaments/${done}/reviews`)).data.items[0]
    ok(answered.reply?.text.startsWith('Спасибо') && !!answered.reply.by, 'the answer is public, with who answered')
    ok((await notes(fan.c)).items.some(n => n.type === 'participant.reviewReply'), 'the author of the review is told')
    await owner('POST', `/reviews/${rv.items[0].id}/reply`, { text: '' })
    ok((await client()('GET', `/tournaments/${done}/reviews`)).data.items[0].reply === undefined, 'an empty answer removes it')
  }
  ok(rv.organizer.count >= 2 && typeof rv.organizer.average === 'number', "the organizer's average across their tournaments is public")
  const mine = (await fan.c('GET', `/tournaments/${done}/reviews`)).data
  ok(mine.canReview && mine.mine?.score === 4, 'a participant sees their own rating')
  const open = (await db.query("select id from tournaments where status <> 'finished' and moderation = 'approved' limit 1")).rows[0].id
  ok((await fan.c('POST', `/tournaments/${open}/review`, { score: 5 })).data?.error === 'tournament_not_finished', 'a tournament is rated after it finishes')
}
// ---------- 51. best speaker and best judge: the site suggests, the organizer confirms, diplomas ----------
{
  const done = (await db.query("select id from tournaments where name like $1 and status = 'finished' order by created_at desc limit 1", [`Плей-офф ${jtag}`])).rows[0].id
  const ownerEmail = (await db.query("select u.email from tournament_organizers o join users u on u.id = o.user_id where o.tournament_id = $1 and o.role = 'owner'", [done])).rows[0].email
  const host = client()
  await host('POST', '/auth/login', { email: ownerEmail, password: 'secret123' })
  // three speakers of one debate rate its chair: enough reviews to suggest the judge
  const deb = (await db.query("select d.id, dj.judge_id, d.proposition_team_id, d.opposition_team_id from debates d join debate_judges dj on dj.debate_id = d.id and dj.is_chair join rounds r on r.id = d.round_id where r.tournament_id = $1 and r.kind = 'preliminary' limit 1", [done])).rows[0]
  const spk = (await db.query('select id from speakers where team_id in ($1, $2) order by id limit 3', [deb.proposition_team_id, deb.opposition_team_id])).rows
  for (const [i, sp] of spk.entries()) {
    const a = await newAccount(`Рецензент ${['Один', 'Два', 'Три'][i]}`)
    await db.query('update speakers set user_id = $1 where id = $2', [a.id, sp.id])
    await a.c('POST', `/debates/${deb.id}/feedback`, { judgeId: deb.judge_id, score: 5 - (i === 2 ? 1 : 0) })
  }
  const cand = (await host('GET', `/tournaments/${done}/awards`)).data
  ok(cand.speakers.length === 3 && cand.speakers.every(s => s.rounds >= cand.preliminaryRounds) && cand.speakers[0].total >= cand.speakers[1].total, 'the site suggests the top speakers who spoke in every preliminary round')
  ok(cand.judges[0]?.id === deb.judge_id && cand.judges[0].reviews === 3 && cand.judges[0].average === 4.7, 'and the judge with the best rating from the speakers (3+ reviews)')
  ok((await host('PUT', `/tournaments/${done}/awards`, { kind: 'best_speaker', personId: 'nobody' })).data?.error === 'award_person_not_found', 'an award goes to someone of this tournament')
  ok((await host('PUT', `/tournaments/${done}/awards`, { kind: 'best_speaker', personId: cand.speakers[0].id })).status === 200
    && (await host('PUT', `/tournaments/${done}/awards`, { kind: 'best_judge', personId: deb.judge_id })).status === 200, 'the organizer confirms the best speaker and the best judge')
  const awardCerts = async () => (await db.query("select award, name from certificates where tournament_id = $1 and kind = 'award' order by award", [done])).rows
  let certs = await awardCerts()
  ok(certs.length === 2 && certs[0].award === 'best_judge' && certs[1].name === cand.speakers[0].name, 'a finished tournament gets the award diplomas at once')
  const pub = (await client()('GET', `/tournaments/${done}`)).data.awards
  ok(pub?.length === 2 && pub.some(a => a.kind === 'best_speaker' && a.name === cand.speakers[0].name), 'the tournament page shows the awards')
  await host('PUT', `/tournaments/${done}/awards`, { kind: 'best_speaker', personId: cand.speakers[1].id })
  certs = await awardCerts()
  ok(certs.length === 2 && certs[1].name === cand.speakers[1].name, 'a changed choice replaces the diploma')
  await host('PUT', `/tournaments/${done}/awards`, { kind: 'best_judge', personId: null })
  ok((await awardCerts()).length === 1, 'an award can be withdrawn')
}
// ---------- 52. public profiles: a speaker's and a judge's career, "hide my profile" ----------
{
  const done = (await db.query("select id from tournaments where name like $1 and status = 'finished' order by created_at desc limit 1", [`Плей-офф ${jtag}`])).rows[0].id
  // a speaker of the champion team with an account
  const champ = (await client()('GET', `/tournaments/${done}/bracket`)).data.champion
  const sp = (await db.query('select s.id, s.user_id from speakers s where s.team_id = $1 order by s.position limit 1', [champ.id])).rows[0]
  let pid = sp.user_id
  if (!pid) {
    const a = await newAccount('Публичный Спикер')
    await db.query('update speakers set user_id = $1 where id = $2', [a.id, sp.id])
    pid = a.id
  }
  const pro = (await client()('GET', `/people/${pid}`)).data
  const entry = pro.speaker?.tournaments.find(x => x.id === done)
  ok(entry && entry.place === 1 && entry.team === champ.name && pro.speaker.debates >= 2 && typeof pro.speaker.average === 'number', "a speaker's page lists the tournament, the place and the speaking record")
  ok(pro.awards.some(a => a.tournament.id === done), 'and the awards (diplomas) of finished tournaments')
  const played = Number((await db.query("select count(*) from debates d join rounds r on r.id = d.round_id where r.tournament_id = $1 and r.status = 'completed' and $2 in (d.proposition_team_id, d.opposition_team_id)", [done, champ.id])).rows[0].count)
  ok(pro.speaker.debates === played && played > 2, 'wins / debates count the playoffs too (the average stays on the preliminary rounds)')
  const team = (await client()('GET', `/tournaments/${done}`)).data.teams.find(x => x.id === champ.id)
  ok(team.speakers.find(s => s.id === sp.id)?.userId === pid, 'speaker names link to the page')
  const judgeUser = (await db.query('select user_id, id from judges where tournament_id = $1 and user_id is not null limit 1', [done])).rows[0]
  const jp = (await client()('GET', `/people/${judgeUser.user_id}`)).data
  ok(jp.judge.tournaments.some(x => x.id === done) && jp.judge.rounds >= 1 && jp.judge.rating === undefined, "a judge's page counts rounds and chairs; the rating shows only with 5+ reviews")
}
// ---------- 53. strikes and reminders: abandoned tournaments, last-minute cancellations ----------
{
  const host = await newAccount('Страйк Организатор')
  const mk = async (n, start, end) => {
    const t = (await host.c('POST', '/tournaments', { ...tBody(200 + n), name: `Страйк ${n} ${jtag}` })).data
    await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
    if (start) await db.query('update tournaments set start_date = $2, end_date = $3 where id = $1', [t.id, start, end ?? start])
    return t
  }
  const team = (t, i) => host.c('POST', `/tournaments/${t.id}/teams`, { name: `Страйк команда ${i}`, institution: 'Школа', speakers: ['Ааа Ббб', 'Ввв Ггг', 'Ддд Еее'] })
  const run = today => admin('POST', '/admin/watchdog/run', { today })
  const mine = async type => (await notes(host.c)).items.filter(n => n.type === type && n.data.tournament?.includes(jtag))
  // the watchdog on pretend dates (e2e only): no motions 2 days before the start; a tournament that ended 2 days ago
  const soon = await mk(1, '2020-01-03', '2020-01-04')
  const old = await mk(2, '2019-12-29', '2019-12-30')
  await run('2020-01-01')
  await run('2020-01-01')
  ok((await mine('organizer.motionsMissing')).length === 1, 'reminder: motions are missing 3 days before the start (once)')
  ok((await mine('organizer.finishReminder')).length === 1, 'reminder: the tournament ended but is not finished')
  await run('2020-01-04')
  ok((await mine('organizer.archiveWarning')).some(n => n.data.days === 2), 'warning: 2 days left before the archive and a strike')
  await run('2020-01-06')
  const mineList = (await host.c('GET', '/organizer/tournaments')).data
  ok(mineList.find(x => x.id === old.id)?.abandoned === true && !mineList.find(x => x.id === soon.id)?.abandoned, '7 days after the end the tournament goes to the archive')
  ok((await client()('GET', `/tournaments/${old.id}`)).status === 404 && (await host.c('GET', `/tournaments/${old.id}`)).status === 200, 'an archived tournament is hidden from the public, the organizer still sees it')
  let s = (await host.c('GET', '/me/strikes')).data
  ok(s.active === 1 && s.items[0].reason === 'abandoned' && (await mine('organizer.strike')).length === 1, 'and the owner gets a strike')

  // deleting a tournament with teams less than 3 days before the start: a strike; without teams or early: none
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date())
  const late = await mk(3, today)
  await team(late, 1)
  await host.c('DELETE', `/tournaments/${late.id}`)
  const empty = await mk(4, today)
  await host.c('DELETE', `/tournaments/${empty.id}`)
  const early = await mk(5)
  await team(early, 2)
  await host.c('DELETE', `/tournaments/${early.id}`)
  s = (await host.c('GET', '/me/strikes')).data
  ok(s.active === 2 && s.items[0].reason === 'late_cancel', 'a last-minute cancellation with teams is a strike; an empty or early one is not')
  const late2 = await mk(6, today)
  await team(late2, 3)
  await host.c('DELETE', `/tournaments/${late2.id}`)
  let r = await host.c('POST', '/tournaments', { ...tBody(207), name: `Страйк 7 ${jtag}` })
  ok(r.status === 403 && r.data.error === 'too_many_strikes', '3 strikes: no new tournaments')
  ok((await host.c('GET', '/me/debates')).status === 200 && (await host.c('GET', '/me/registrations')).status === 200, 'but the account works as before')
  ok((await notes(admin)).items.some(n => n.type === 'admin.strikeLimit' && n.data.tournament?.includes(jtag)), 'admins learn about the third strike')

  // the admin sees and lifts a strike, with a reason for the log
  const list = (await admin('GET', '/admin/strikes')).data.filter(x => x.user.id === host.id)
  ok(list.length === 3 && list.every(x => !x.lifted), 'the admin sees the strikes')
  ok((await host.c('GET', '/admin/strikes')).status === 403, 'only admins see everyone')
  ok((await admin('POST', `/admin/strikes/${list[0].id}/lift`, { note: '' })).status === 400, 'lifting needs a reason')
  await admin('POST', `/admin/strikes/${list[0].id}/lift`, { note: 'Турнир перенесли из-за погоды' })
  s = (await host.c('GET', '/me/strikes')).data
  ok(s.active === 2 && s.items.some(x => x.lifted && x.note), 'a lifted strike stays in the history')
  r = await host.c('POST', '/tournaments', { ...tBody(208), name: `Страйк 8 ${jtag}` })
  ok(r.status === 201, 'and the person can create tournaments again')

  // finishing an archived tournament brings it back (the strike stays)
  for (const i of [4, 5]) await team(old, i)
  await host.c('PATCH', `/tournaments/${old.id}`, { status: 'ongoing' })
  r = await host.c('PATCH', `/tournaments/${old.id}`, { status: 'finished' })
  ok(r.status === 200 && (await client()('GET', `/tournaments/${old.id}`)).status === 200, 'finishing an archived tournament brings it back')
  ok((await client()('POST', '/admin/watchdog/run', {})).status === 401, 'the watchdog is admin-only')
}
// ---------- 54. admin analytics: aggregates only, no personal data ----------
{
  const r = await admin('GET', '/admin/analytics')
  const a = r.data
  const approved = Number((await db.query("select count(*) from tournaments where moderation = 'approved'")).rows[0].count)
  const teams = Number((await db.query("select count(*) from teams t join tournaments x on x.id = t.tournament_id where x.moderation = 'approved' and not t.swing")).rows[0].count)
  ok(r.status === 200 && a.months.length === 12 && a.totals.tournaments === approved && a.totals.teams === teams, 'analytics: 12 months of growth, totals match the database')
  ok(a.regions.some(x => x.key === 'astana' && x.tournaments > 0) && a.tournaments.byLevel.length > 0 && a.tournaments.byFormat.length > 0, 'tournaments by region, level and format')
  ok(a.people.active > 0 && a.people.returning <= a.people.active && a.tournaments.activeStrikes >= 2, 'participants who came back, active strikes')
  const json = JSON.stringify(a)
  ok(!/@|gender|"email"|"phone"/i.test(json), 'no personal data in the analytics')
  const someone = await newAccount('Аналитика Посторонний')
  ok((await someone.c('GET', '/admin/analytics')).status === 403, 'only admins see the analytics')
}
// ---------- 55. info slide: the organizer adds it to a round, the public sees it once the round is out ----------
{
  const host = await newAccount('Инфослайд Организатор')
  const t = (await host.c('POST', '/tournaments', { ...tBody(300), name: `Инфослайд ${jtag}` })).data
  await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  const round = (await host.c('GET', `/tournaments/${t.id}`)).data.rounds[0]
  let r = await host.c('PATCH', `/rounds/${round.id}`, { motion: 'Эта палата запретит домашние задания', infoSlide: 'Домашние задания — работа, которую дают на дом.' })
  ok(r.status === 200 && r.data.infoSlide === 'Домашние задания — работа, которую дают на дом.', 'an info slide is saved with the motion')
  ok((await client()('GET', `/tournaments/${t.id}`)).data.rounds[0].infoSlide === undefined, 'the public does not see it before the round is published')
  r = await host.c('PATCH', `/rounds/${round.id}`, { motion: '««Эта палата запретит домашние задания»»' })
  ok(r.data.motion === 'Эта палата запретит домашние задания', 'quotes typed around a motion are dropped (the site adds its own)')
  r = await host.c('PATCH', `/rounds/${round.id}`, { infoSlide: '' })
  ok(r.status === 200 && r.data.infoSlide === undefined && (await db.query('select info_slide from rounds where id = $1', [round.id])).rows[0].info_slide === null, 'an emptied info slide is removed')
}
// ---------- 56. judge panels: chairs by the speakers' ratings, judges rotate between teams ----------
{
  const host = await newAccount('Ротация Организатор')
  const t = (await host.c('POST', '/tournaments', { ...tBody(310), name: `Ротация ${jtag}`, preliminaryRounds: 3 })).data
  await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  for (const n of ['Арна', 'Байтерек', 'Ғалым', 'Дала', 'Есіл', 'Жайық', 'Зере', 'Іле']) await host.c('POST', `/tournaments/${t.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} Бір`, `${n} Екі`, `${n} Үш`] })
  for (let i = 1; i <= 5; i++) await addJudge(host.c, t.id, `Ротация Судья ${i}`)
  await host.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  const rounds = (await host.c('GET', `/tournaments/${t.id}`)).data.rounds
  // the panels of a round straight from the database: judge, chair, the two teams
  const panels = async roundId => (await db.query(
    'select j.id judge, j.name, dj.is_chair chair, d.id debate, d.proposition_team_id p, d.opposition_team_id o from debate_judges dj join judges j on j.id = dj.judge_id join debates d on d.id = dj.debate_id where d.round_id = $1', [roundId])).rows
  await host.c('POST', `/rounds/${rounds[0].id}/draw`, { addSwing: false })
  const r1 = await panels(rounds[0].id)
  // the speakers rate the judges of round 1 (two ratings each): judge 1 is rated worst
  const rate = { 'Ротация Судья 1': 1, 'Ротация Судья 2': 5, 'Ротация Судья 3': 4, 'Ротация Судья 4': 5, 'Ротация Судья 5': 4 }
  for (const seat of r1) {
    for (const [email, team] of [['admin@debate.kz', seat.p], ['student@debate.kz', seat.o]]) {
      await db.query("insert into judge_feedback (id, debate_id, judge_id, user_id, team_id, score) select 'fb' || md5(random()::text), $1, $2, u.id, $3, $4 from users u where u.email = $5",
        [seat.debate, seat.judge, team, rate[seat.name], email])
    }
  }
  // round 1 is over (results straight in the database: this section checks the panels, not the ballots)
  const finish = async roundId => {
    await db.query("update debates set winner = 'proposition', ballot_status = 'confirmed' where round_id = $1", [roundId])
    await db.query("update rounds set status = 'completed' where id = $1", [roundId])
  }
  await finish(rounds[0].id)
  await host.c('POST', `/rounds/${rounds[1].id}/draw`, { addSwing: false })
  const r2 = await panels(rounds[1].id)
  const chairs = r2.filter(x => x.chair).map(x => x.name)
  ok(chairs.length === 4 && !chairs.includes('Ротация Судья 1'), "the judge the speakers rated lowest does not chair")
  // rotation: with 8 teams there is always a seat away from the teams a judge has seen
  const before = new Map(r1.map(x => [x.judge, [x.p, x.o]]))
  const seenIn = (judge, room) => (before.get(judge) ?? []).filter(id => id === room.p || id === room.o).length
  const repeats = r2.reduce((n, x) => n + seenIn(x.judge, x), 0)
  // the best possible: every way to seat these chairs in these rooms, and the wing in its best room
  const rooms = [...new Map(r2.map(x => [x.debate, x])).values()]
  const chairIds = r2.filter(x => x.chair).map(x => x.judge), wingIds = r2.filter(x => !x.chair).map(x => x.judge)
  const perms = xs => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p])))
  const bestChairs = Math.min(...perms(chairIds).map(p => p.reduce((n, judge, i) => n + seenIn(judge, rooms[i]), 0)))
  const bestWings = wingIds.reduce((n, w) => n + Math.min(...rooms.map(room => seenIn(w, room))), 0)
  ok(repeats === bestChairs + bestWings, `judges rotate: as few repeated teams as possible (${repeats})`)
  await finish(rounds[1].id)
  await host.c('POST', `/rounds/${rounds[2].id}/draw`, { addSwing: false, method: 'slide', presentOnly: false, protectClubs: false })
  const saved = (await host.c('GET', `/tournaments/${t.id}`)).data.drawOptions
  ok(saved?.method === 'slide' && saved.addSwing === false && saved.protectClubs === false, 'the draw settings are kept for the next round')
  ok((await client()('GET', `/tournaments/${t.id}`)).data.drawOptions === undefined, 'only organizers see them')
}
// ---------- 57. several judge links at once (each still single-use) ----------
{
  const host = await newAccount('Ссылки Организатор')
  const t = (await host.c('POST', '/tournaments', { ...tBody(320), name: `Ссылки ${jtag}` })).data
  let r = await host.c('POST', `/tournaments/${t.id}/invites`, { kind: 'judge', count: 5 })
  ok(r.status === 201 && r.data.links.length === 5 && new Set(r.data.links.map(l => l.url)).size === 5, 'an organizer makes 5 judge links at once, all different')
  const a = await newAccount('Ссылки Судья Один'), b = await newAccount('Ссылки Судья Два')
  const token = r.data.links[0].url.split('/invite/')[1]
  ok((await a.c('POST', `/invites/${token}/accept`)).status === 200 && (await b.c('POST', `/invites/${token}/accept`)).data?.error === 'invite_used', 'each of them still works once')
  ok((await host.c('POST', `/tournaments/${t.id}/invites`, { kind: 'judge', count: 31 })).status === 400, 'at most 30 at once')
  ok((await host.c('POST', `/tournaments/${t.id}/invites`, { kind: 'co_organizer', count: 2 })).data?.error === 'one_co_organizer_link', 'co-organizer links one at a time')
}
// ---------- 58. every speaker has a page; a teammate links their account by the captain's link ----------
{
  const done = (await db.query("select id from tournaments where name like $1 and status = 'finished' order by created_at desc limit 1", [`Плей-офф ${jtag}`])).rows[0].id
  // a team with at least two speakers without an account: one becomes the captain, the other is invited
  const slot = (await db.query(`select s.id, s.team_id, s.name from speakers s join teams t on t.id = s.team_id
    where t.tournament_id = $1 and s.user_id is null and not t.swing
      and (select count(*) from speakers x where x.team_id = t.id and x.user_id is null) >= 2
    order by t.name, s.position desc limit 1`, [done])).rows[0]
  const page = (await client()('GET', `/tournaments/${done}/speakers/${slot.id}`)).data
  ok(page.name === slot.name && page.rounds.length >= 2 && typeof page.rounds[0].score === 'number' && page.team.place >= 1 && page.userId === undefined, 'a speaker without an account has a page in the tournament: rounds, scores, the team place')
  ok((await client()('GET', `/tournaments/${done}/speakers/nope`)).status === 404, 'an unknown speaker is 404')
  // the captain: a speaker of the same team with an account
  const captain = await newAccount('Капитан Ссылка')
  await db.query('update speakers set user_id = $1 where id = (select id from speakers where team_id = $2 and user_id is null and id <> $3 order by position limit 1)', [captain.id, slot.team_id, slot.id])
  const stranger = await newAccount('Чужой Капитан')
  ok((await stranger.c('POST', `/speakers/${slot.id}/invite`)).data?.error === 'team_or_organizers_only', 'only the team or the organizers invite a teammate')
  const inv = (await captain.c('POST', `/speakers/${slot.id}/invite`)).data
  const token = inv.url.split('/speaker-invite/')[1]
  ok((await client()('GET', `/speaker-invites/${token}`)).data?.state === 'valid', 'the link shows the slot it links')
  const mate = await newAccount('Сокомандник Привязка')
  ok((await mate.c('POST', `/speaker-invites/${token}/accept`)).status === 200, 'the teammate links their account')
  ok((await client()('GET', `/tournaments/${done}/speakers/${slot.id}`)).data.userId === mate.id && (await client()('GET', `/people/${mate.id}`)).data.speaker.tournaments.some(x => x.id === done), 'the tournament is now in their career')
  ok((await stranger.c('POST', `/speaker-invites/${token}/accept`)).data?.error === 'invite_used', 'a link works once')
  ok((await captain.c('POST', `/speakers/${slot.id}/invite`)).data?.error === 'speaker_already_linked', 'a linked slot cannot be invited again')
  ok((await notes(captain.c)).items.some(n => n.type === 'participant.teammateLinked'), 'the captain learns the teammate linked')
}
// ---------- 59. audit 2026-10: dates, team renames, replaced speakers, draw order, notifications of deleted tournaments ----------
{
  const host = await newAccount('Аудит Организатор')
  // B1: impossible dates are a 400, not a 500
  let r = await host.c('POST', '/tournaments', { ...tBody(400), name: `Аудит даты ${jtag}`, startDate: '2026-02-31', endDate: '2026-03-01' })
  ok(r.status === 400, 'an impossible date (31 February) is refused with 400')
  // B2: a tournament cannot start in the past (the watchdog would archive it at once and strike its owner)
  r = await host.c('POST', '/tournaments', { ...tBody(401), name: `Аудит прошлое ${jtag}`, startDate: '2020-05-01', endDate: '2020-05-02' })
  ok(r.data?.error === 'start_in_past', 'a tournament cannot be created in the past')

  // B3–B5: the applicant's slot is linked even with the words swapped; a rename keeps the application; a replaced speaker is unlinked
  const t = (await host.c('POST', '/tournaments', { ...tBody(402), name: `Аудит команды ${jtag}`, requireApproval: false })).data
  await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  const cap = await newAccount('Аудит Капитанов')
  const club = (await cap.c('POST', '/clubs', { name: `Аудит клуб ${jtag}`, city: 'Астана' })).data
  await admin('PATCH', `/admin/clubs/${club.id}`, { status: 'approved' })
  await cap.c('POST', `/clubs/${club.id}/teams`, { name: 'Аудит Тим', join: true })
  r = await cap.c('POST', `/tournaments/${t.id}/registrations`, {
    teamName: 'Аудит Тим', institution: 'Лицей', speakers: ['капитанов   аудит', 'Второй Спикер', 'Третий Спикер'], phone: '+7 701 555 44 33', guardianConsent: true,
  })
  const regStatus = (await db.query('select status from team_registrations where id = $1', [r.data.id])).rows[0]?.status
  if (regStatus !== 'confirmed') await host.c('PATCH', `/registrations/${r.data.id}`, { status: 'confirmed' })
  let team = (await host.c('GET', `/tournaments/${t.id}`)).data.teams.find(x => x.name === 'Аудит Тим')
  ok(team?.speakers[0].userId === cap.id, 'the applicant is linked to their slot even when the name is written another way')
  r = await host.c('PATCH', `/teams/${team.id}`, { name: 'Аудит Тим 2', institution: 'Лицей', speakers: ['Капитанов Аудит', 'Новый Человек', 'Третий Спикер'] })
  ok(r.status === 200, 'the organizer renames the team and replaces a speaker')
  ok((await db.query('select team_name from team_registrations where tournament_id = $1', [t.id])).rows[0]?.team_name === 'Аудит Тим 2', "the team's application follows the new name")
  const slots = (await db.query('select name, user_id from speakers where team_id = $1 order by position', [team.id])).rows
  ok(slots[0].user_id === cap.id, 'the same person in a slot stays linked')
  await db.query('update speakers set user_id = $1 where team_id = $2 and position = 2', [cap.id, team.id])
  await host.c('PATCH', `/teams/${team.id}`, { name: 'Аудит Тим 2', institution: 'Лицей', speakers: ['Капитанов Аудит', 'Совсем Другой', 'Третий Спикер'] })
  ok((await db.query('select user_id from speakers where team_id = $1 and position = 2', [team.id])).rows[0].user_id === null, 'a speaker replaced by another person is unlinked from the old account')

  // B6: a round is drawn only after the earlier preliminary rounds are completed
  for (const n of ['Аудит А', 'Аудит Б', 'Аудит В']) await host.c('POST', `/tournaments/${t.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} Один`, `${n} Два`, `${n} Три`] })
  for (let i = 1; i <= 2; i++) await addJudge(host.c, t.id, `Аудит Судья ${i}`)
  await host.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  const rounds = (await host.c('GET', `/tournaments/${t.id}`)).data.rounds
  ok((await host.c('POST', `/rounds/${rounds[0].id}/draw`, { addSwing: false })).status === 201, 'round 1 is drawn')
  ok((await host.c('POST', `/rounds/${rounds[1].id}/draw`, { addSwing: false })).data?.error === 'previous_round_unfinished', 'round 2 waits until round 1 is completed')

  // B8: deleting a tournament removes the notifications that point into it
  const before = Number((await db.query("select count(*) from notifications where link like $1", [`%/tournaments/${t.id}%`])).rows[0].count)
  await host.c('DELETE', `/tournaments/${t.id}`)
  const after = Number((await db.query("select count(*) from notifications where link like $1", [`%/tournaments/${t.id}%`])).rows[0].count)
  ok(before > 0 && after === 0, 'a deleted tournament leaves no notifications that lead nowhere')
}
// ---------- 60. custom rounds and break: 1 preliminary round, a break of 6 with byes for seeds 1 and 2 ----------
{
  const host = await newAccount('Бай Организатор')
  ok((await host.c('POST', '/tournaments', { ...tBody(410), name: `Бай 13 ${jtag}`, preliminaryRounds: 13 })).status === 400, 'at most 12 preliminary rounds')
  ok((await host.c('POST', '/tournaments', { ...tBody(411), name: `Бай BP ${jtag}`, format: 'BP', breakSize: 6 })).status === 400, 'BP breaks are rooms of four (4, 8, 16, 32, 64)')
  const t = (await host.c('POST', '/tournaments', { ...tBody(412), name: `Бай 6 ${jtag}`, preliminaryRounds: 1, breakSize: 6 })).data
  ok(t?.id && (await host.c('GET', `/tournaments/${t.id}`)).data.rounds.length === 1, 'a tournament with 1 preliminary round and a break of 6')
  await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  const names = ['Бай1', 'Бай2', 'Бай3', 'Бай4', 'Бай5', 'Бай6', 'Бай7', 'Бай8']
  for (const n of names) await host.c('POST', `/tournaments/${t.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: [`${n} Один`, `${n} Два`, `${n} Три`] })
  for (let i = 1; i <= 4; i++) await addJudge(host.c, t.id, `Бай Судья ${i}`)
  await host.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  const details = async () => (await host.c('GET', `/tournaments/${t.id}`)).data
  const ballot = win => sheet => {
    const lo = win === 'proposition' ? 'opposition' : 'proposition'
    const scores = {}
    sheet[win].speakers.forEach(x => (scores[x.id] = 72)); sheet[lo].speakers.forEach(x => (scores[x.id] = 68))
    return { winner: win, scores, reply: { [win]: 36, [lo]: 34 }, replySpeakers: { proposition: sheet.proposition.speakers[0].id, opposition: sheet.opposition.speakers[0].id } }
  }
  const play = async roundId => {
    const drawn = await host.c('POST', `/rounds/${roundId}/draw`, { addSwing: false })
    await host.c('PATCH', `/rounds/${roundId}`, { motion: 'ЭП введёт бесплатный проезд для школьников', status: 'released' })
    for (const d of (await details()).debates.filter(x => x.roundId === roundId)) await panelVote(d.id, ballot('proposition'))
    await host.c('PATCH', `/rounds/${roundId}`, { status: 'completed' })
    return drawn
  }
  await play((await details()).rounds[0].id)
  const r = await host.c('POST', `/tournaments/${t.id}/break`)
  ok(r.status === 201 && r.data.seeds.length === 6 && r.data.rounds.map(x => x.stage).join() === 'quarter,semi,final', 'a break of 6 plays a quarterfinal, a semifinal and a final')
  const seeds = new Map(r.data.seeds.map(s => [s.team.id, s.seed]))
  const [qf, sf, fin] = r.data.rounds
  const q = await play(qf.id)
  const qDebates = q.data.debates
  const qSeeds = qDebates.map(d => [seeds.get(d.propositionTeamId), seeds.get(d.oppositionTeamId)].sort((a, b) => a - b).join('v')).sort()
  ok(qDebates.length === 2 && qSeeds.join() === '3v6,4v5', 'seeds 1 and 2 get a bye: the quarterfinal is 3–6 and 4–5')
  const s = await play(sf.id)
  const semis = s.data.debates.map(d => [seeds.get(d.propositionTeamId), seeds.get(d.oppositionTeamId)].sort((a, b) => a - b))
  ok(semis.length === 2 && semis.some(p => p[0] === 1) && semis.some(p => p[0] === 2) && semis.every(p => p[1] >= 3 && p[1] <= 6), 'the bye teams meet the quarterfinal winners in the semifinals')
  await play(fin.id)
  ok((await host.c('PATCH', `/tournaments/${t.id}`, { status: 'finished' })).status === 200, 'the tournament with byes finishes')
  const bracket = (await client()('GET', `/tournaments/${t.id}/bracket`)).data
  ok(!!bracket.champion, 'the champion is known')
}
// ---------- 61. new formats: Lincoln–Douglas (one against one), Public Forum, Asian Parliamentary, Australs ----------
{
  for (const [format, speakers, scale, reply] of [['LD', 1, [26, 30], null], ['PF', 2, [26, 30], null], ['ASIAN', 3, [70, 80], [35, 40]], ['AUSTRALS', 3, [60, 80], null]]) {
    const host = await newAccount(`Формат Организатор${format}`) // one organizer may run 3 tournaments at once
    const t = (await host.c('POST', '/tournaments', { ...tBody(420), name: `Формат ${format} ${jtag}`, format, preliminaryRounds: 1, breakSize: 2 })).data
    await admin('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
    const names = ['Альфа', 'Бета']
    for (const n of names) {
      const r = await host.c('POST', `/tournaments/${t.id}/teams`, { name: n, institution: `Школа ${n}`, speakers: Array.from({ length: speakers }, (_, i) => `${n} Спикер${'АБВ'[i]}`) })
      if (r.status !== 201) ok(false, `${format} team ${r.status} ${JSON.stringify(r.data)}`)
    }
    ok((await host.c('POST', `/tournaments/${t.id}/teams`, { name: 'Лишний', institution: 'Школа', speakers: ['Один Два', 'Три Четыре', 'Пять Шесть'].slice(0, speakers === 3 ? 2 : speakers + 1) })).status === 400,
      `${format}: a team needs exactly ${speakers} speaker(s)`)
    await addJudge(host.c, t.id, `Формат Судья ${format}`)
    await host.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
    const round = (await host.c('GET', `/tournaments/${t.id}`)).data.rounds[0]
    await host.c('POST', `/rounds/${round.id}/draw`, { addSwing: false })
    await host.c('PATCH', `/rounds/${round.id}`, { motion: 'ЭП верит, что справедливость важнее свободы', status: 'released' })
    const debate = (await host.c('GET', `/tournaments/${t.id}`)).data.debates.find(d => d.roundId === round.id)
    let rules
    await panelVote(debate.id, sheet => {
      rules = sheet.rules
      const scores = {}
      sheet.proposition.speakers.forEach(x => (scores[x.id] = scale[1] - 1)); sheet.opposition.speakers.forEach(x => (scores[x.id] = scale[0] + 1))
      return {
        winner: 'proposition', scores,
        ...(reply && { reply: { proposition: reply[1] - 1, opposition: reply[0] + 1 }, replySpeakers: { proposition: sheet.proposition.speakers[0].id, opposition: sheet.opposition.speakers[0].id } }),
      }
    })
    ok(rules?.speakers === speakers && rules.speaker[0] === scale[0] && rules.speaker[1] === scale[1] && !!rules.reply === !!reply, `${format}: the ballot follows the format (${speakers} speaker(s), ${scale.join('–')}${reply ? ', reply' : ''})`)
    ok((await host.c('PATCH', `/rounds/${round.id}`, { status: 'completed' })).status === 200
      && (await client()('GET', `/tournaments/${t.id}/standings`)).data.teams[0].wins === 1, `${format}: the round counts in the table`)
  }
}
await db.end()
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
