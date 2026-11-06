import { expect, test } from '@playwright/test'
import { leagueTournament, newAccount, signIn } from './helpers'

test('schedule: the time wheel turns endlessly (after 23 come 00 and 01)', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/schedule`)
  await page.getByRole('button', { name: 'Добавить пункт' }).click()
  const time = page.locator('button').filter({ hasText: /^(\d\d:\d\d|--:--)$/ }).last()
  await time.click()
  const [hours, minutes] = [page.getByRole('listbox').nth(0), page.getByRole('listbox').nth(1)]
  await expect(hours.getByRole('option', { selected: true })).toHaveText(/\d\d/)
  // to 23, then one row further: the next one is 00 of the next turn, not an end
  await hours.evaluate(el => { el.scrollTop = (3 * 24 + 23) * 36 })
  await expect(time).toHaveText(/^23:/)
  await hours.evaluate(el => { el.scrollTop = (3 * 24 + 24) * 36 })
  await expect(time).toHaveText(/^00:/)
  await minutes.evaluate(el => { el.scrollTop = (3 * 12 + 11) * 36 })
  await expect(time).toHaveText(/:55$/)
  await minutes.evaluate(el => { el.scrollTop = (3 * 12 + 12) * 36 })
  await expect(time).toHaveText(/:00$/)
})

test('draw: the league under both teams of a room; Kazakh league first', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/draw`)
  const row = page.locator('tbody tr').filter({ hasText: 'Қаз' }).filter({ has: page.locator('select, button') }).first()
  await expect(row.getByText('Қазақ лигасы')).toHaveCount(2)
  const tabs = page.getByRole('group', { name: /лиги|лигалар/i }).first().getByRole('button')
  await expect(tabs.nth(1)).toHaveText('Қазақ лигасы')
})

test('speakers\' QR cards: one card per speaker, by league', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/tournaments/${t.id}/speaker-links/print`)
  const cards = page.getByText('Отсканируйте: жеребьёвка, баллы и сертификат')
  await expect(cards).toHaveCount(24)
  await page.getByRole('button', { name: 'Қазақ лигасы' }).click()
  await expect(cards).toHaveCount(12)
})

test('a speaker by the link: the room without signing in, then "this is me", confirmed by the organizer', async ({ page }) => {
  const t = await leagueTournament()
  const links = (await t.org('POST', `/tournaments/${t.id}/speaker-links`)).data
  const team = links[0]
  const key = team.speakers[0].accessKey
  await page.goto(`/s/${key}`)
  await expect(page.getByRole('heading', { name: team.speakers[0].name })).toBeVisible()
  await expect(page.getByText('Мои дебаты')).toBeVisible()
  await expect(page.getByText(/^Против:/)).toBeVisible()
  // not signed in: the button leads to sign-in and back here
  await page.getByRole('button', { name: 'Войти и отправить запрос' }).click()
  await expect(page).toHaveURL(/\/login\?next=%2Fs%2F/)
  const student = await newAccount('UI Спикер')
  await signIn(page, student.email, student.password)
  await page.goto(`/s/${key}`)
  await page.getByRole('button', { name: 'Это я — отправить запрос' }).click()
  // the link alone is not proof: the request waits for the organizer
  await expect(page.getByText(/Запрос отправлен\. Как только организатор/)).toBeVisible()

  await page.context().clearCookies()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/teams`)
  await expect(page.getByText('Запросы «это я»: 1')).toBeVisible()
  await expect(page.getByText(`говорит, что он(а) — ${team.speakers[0].name}`)).toBeVisible()
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Запросы «это я»')).toHaveCount(0)
  await page.goto(`/s/${key}`)
  await expect(page.getByText(/уже сохранены в профиль/)).toBeVisible()
})

test('a local tournament: teams pasted from a Google Form table, with real names and leagues', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/teams`)
  await page.getByRole('button', { name: 'Вставить из таблицы' }).click()
  // as copied from Google Sheets: the timestamp first, tabs between the cells, a league column
  const rows = [
    ['Отметка времени', 'Название команды', 'Учебное заведение', 'Спикер 1 (ФИО)', 'Спикер 2 (ФИО)', 'Спикер 3 (ФИО)', 'Лига'],
    ['06.11.2026 10:15:00', 'Тұмар', 'НЗМ Астана', 'Айгерім Сапарова', 'Данияр Ержанов', 'Мадина Ахметова', 'Қазақ лигасы'],
    ['06.11.2026 10:20:00', 'Феникс', 'Лицей №1', 'Иван Петров', 'Анна Ким', 'Олжас Нуров', 'Русская лига'],
    ['06.11.2026 10:25:00', 'Неполная', 'Лицей №2', 'Один Спикер', '', '', 'Русская лига'],
  ]
  await page.locator('#pt').fill(rows.map(r => r.join('\t')).join('\n'))
  await expect(page.getByText('Готово к добавлению: 2')).toBeVisible()
  await expect(page.getByText('Нужно 3 спикер(а), имя и фамилия каждого')).toBeVisible()
  await page.getByRole('button', { name: /^Добавить 2/ }).click()
  await expect(page.getByRole('cell', { name: 'Айгерім Сапарова, Данияр Ержанов, Мадина Ахметова' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Иван Петров, Анна Ким, Олжас Нуров' })).toBeVisible()
})

test('an open tournament: teams come only through applications', async ({ page }) => {
  const org = await newAccount('UI Открытый')
  const name = `UI открытый ${Math.random().toString(36).slice(2, 7)}`
  const t = (await org.c('POST', '/tournaments', { name, city: 'Астана', startDate: '2026-12-20', endDate: '2026-12-20', level: 'school', description: '', preliminaryRounds: 2, breakSize: 2, maxTeams: 12, registrationOpen: true, requireApproval: true, languages: ['ru'], kind: 'open' })).data
  await signIn(page, org.email, org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/teams`)
  await expect(page.getByText(/Это открытый турнир: команды приходят только через заявки/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить команду' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Вставить из таблицы' })).toHaveCount(0)
})

test('the wizard: the kind is chosen, a local tournament keeps its Google Form link', async ({ page }) => {
  test.slow() // the wizard is a separate bundle: the first open is slow on a cold dev server
  const org = await newAccount('UI Мастер')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date(Date.now() + 20 * 864e5))
  const name = `UI мастер ${Math.random().toString(36).slice(2, 7)}`
  await signIn(page, org.email, org.password)
  // the first two steps are filled already (the wizard keeps a draft): open it on "Registration"
  await page.evaluate(([uid, values]) => localStorage.setItem(`tournament-draft:${uid}`, JSON.stringify({ values, step: 2, cover: null })), [org.id,
    { name, level: 'school', format: 'WSDC', prelims: 3, breakSize: 4, maxTeams: 12, regOpen: true, approval: true, langRu: true, langKz: true, kind: '', regUrl: '', region: 'astana', city: 'Астана', district: '', venue: '', startDate: day, endDate: day, regDeadline: '', description: '' }] as const)
  await page.goto('/dashboard/tournaments/new')
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByText('Выберите тип турнира')).toBeVisible()
  await page.getByRole('radio', { name: /Локальный/ }).click()
  await page.locator('#regUrl').fill('https://forms.gle/uiwizard')
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByText('Тип турнира').last()).toBeVisible()
  await page.getByRole('button', { name: 'Создать турнир' }).click()
  await expect(page).toHaveURL(/\/dashboard\/tournaments\/[^/]+\/teams/)
  const id = page.url().split('/tournaments/')[1].split('/')[0]
  const t = (await org.c('GET', `/tournaments/${id}`)).data
  expect(t.kind).toBe('local')
  expect(t.registrationUrl).toBe('https://forms.gle/uiwizard')
  await expect(page.getByRole('button', { name: 'Вставить из таблицы' })).toBeVisible()
})

test('draw: two teams of different rooms change places with two clicks', async ({ page }) => {
  const t = await leagueTournament()
  const ru = t.details.debates.filter((d: { propositionTeamId: string }) => t.details.teams.find((x: { id: string; league: string }) => x.id === d.propositionTeamId)?.league === 'ru')
  const name = (id: string) => t.details.teams.find((x: { id: string }) => x.id === id).name as string
  const [one, two] = ru
  const a = name(one.oppositionTeamId), b = name(two.propositionTeamId)
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/draw`)
  await page.getByRole('button', { name: a, exact: true }).click()
  await expect(page.getByText(`Выбрана «${a}»`)).toBeVisible()
  await page.getByRole('button', { name: b, exact: true }).click()
  await expect(page.getByText('Команды поменялись местами')).toBeVisible()
  const after = (await t.org('GET', `/tournaments/${t.id}`)).data.debates
  expect(name(after.find((d: { id: string }) => d.id === one.id).oppositionTeamId)).toBe(b)
  expect(name(after.find((d: { id: string }) => d.id === two.id).propositionTeamId)).toBe(a)
  // the table shows the new rooms
  await expect(page.locator('tbody tr').filter({ hasText: name(one.propositionTeamId) }).getByRole('button', { name: b, exact: true })).toBeVisible()
})
