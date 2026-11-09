import { expect, test, type Page } from '@playwright/test'
import { admin, newAccount, signIn } from './helpers'

// A whole tournament made with the mouse and the keyboard, the way an organizer and the judges do it: the wizard,
// teams pasted from a table, judges by a list, the start, two rounds (draw, motion, publish, the judges' ballots typed
// key by key, completion), the break, the final, the finish, the best speaker, the certificates. No script error and
// no failed request on the way.
test('an organizer runs a whole tournament through the site', async ({ page }) => {
  test.setTimeout(420_000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(`script: ${e.message}`))
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`) })

  const org = await newAccount('UI Путь Организатор')
  await signIn(page, org.email, org.password)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date())
  const name = `UI путь ${Math.random().toString(36).slice(2, 7)}`
  await page.evaluate(([uid, values]) => localStorage.setItem(`tournament-draft:${uid}`, JSON.stringify({ values, step: 2, cover: null })), [org.id,
    { name, level: 'school', format: 'WSDC', prelims: 2, breakSize: 2, maxTeams: 12, regOpen: true, approval: true, langRu: true, langKz: false, kind: '', regUrl: '', region: 'astana', city: 'Астана', district: '', venue: '', startDate: day, endDate: day, regDeadline: '', description: '' }] as const)
  await page.goto('/dashboard/tournaments/new')
  await page.getByRole('radio', { name: /Локальный/ }).click()
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.getByRole('button', { name: 'Создать турнир' }).click()
  await expect(page).toHaveURL(/\/dashboard\/tournaments\/[^/]+\/teams/)
  const id = page.url().split('/tournaments/')[1].split('/')[0]
  await (await admin())('PATCH', `/admin/tournaments/${id}`, { moderation: 'approved' })
  const api = async () => (await org.c('GET', `/tournaments/${id}`)).data

  // teams from a table, judges by a list
  await page.getByRole('button', { name: 'Вставить из таблицы' }).click()
  const rows = [['Команда', 'Школа', 'Спикер 1', 'Спикер 2', 'Спикер 3'],
    ...['Альфа', 'Бета', 'Гамма', 'Дельта'].map(n => [n, `Школа ${n}`, `${n} Первый`, `${n} Второй`, `${n} Третий`])]
  await page.locator('#pt').fill(rows.map(r => r.join('\t')).join('\n'))
  await page.getByRole('button', { name: /^Добавить 4/ }).click()
  await expect(page.getByRole('cell', { name: 'Альфа Первый, Альфа Второй, Альфа Третий' })).toBeVisible()
  await page.goto(`/dashboard/tournaments/${id}/judges`)
  await page.getByRole('button', { name: 'Судьи списком' }).click()
  await page.getByRole('dialog').locator('textarea').fill('Судья Первая\nСудья Вторая')
  await page.getByRole('dialog').getByRole('button', { name: /^Добавить 2/ }).click()
  await expect(page.getByText('Судья Вторая').first()).toBeVisible()

  // the start
  await page.goto(`/dashboard/tournaments/${id}/settings`)
  await page.getByRole('button', { name: 'Начать турнир' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Начать турнир|Да|Подтвердить/ }).last().click()
  await expect.poll(async () => (await api()).status).toBe('ongoing')

  // a round: draw, motion, publish, the judges' ballots, completion
  const typeBallot = async (debateId: string, key: string, propName: string) => {
    await page.goto(`/j/${key}/ballot/${debateId}`)
    const first = page.locator('input[data-score]').first()
    await first.click()
    for (const v of ['75', '75', '75', '38', '70', '70', '70', '35']) { await page.keyboard.type(v); await page.keyboard.press('Enter') }
    await page.locator('button[aria-pressed]').filter({ hasText: propName }).last().click()
    await page.getByRole('button', { name: 'Отправить бюллетень' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Да, отправить' }).click()
    await expect(page.getByText('Бюллетень принят')).toBeVisible()
  }
  const playRound = async (n: number) => {
    let d = await api()
    const round = d.rounds[n]
    await page.goto(`/dashboard/tournaments/${id}/draw`)
    await page.getByRole('button', { name: round.kind === 'elimination' ? /Сгенерировать жеребьёвку|Пересобрать/ : 'Сгенерировать жеребьёвку' }).first().click()
    await expect.poll(async () => (await api()).debates.filter((x: { roundId: string }) => x.roundId === round.id).length).toBeGreaterThan(0)
    await page.goto(`/dashboard/tournaments/${id}/rounds`)
    await page.locator(`#m-${round.id}`).fill(`ЭП отменит домашние задания (${round.name})`)
    await page.locator(`#round-${round.id}`).getByRole('button', { name: 'Опубликовать' }).click()
    await expect.poll(async () => (await api()).rounds[n].status).toBe('released')
    d = await api()
    for (const room of d.debates.filter((x: { roundId: string }) => x.roundId === round.id)) {
      // every judge of the panel votes (a room is decided when the whole panel has)
      for (const jid of room.judgeIds) {
        const judge = d.judges.find((j: { id: string }) => j.id === jid)
        await typeBallot(room.id, judge.accessKey, d.teams.find((x: { id: string }) => x.id === room.propositionTeamId).name)
      }
    }
    await page.goto(`/dashboard/tournaments/${id}/rounds`)
    await page.locator(`#round-${round.id}`).getByRole('button', { name: 'Завершить раунд' }).click()
    await expect.poll(async () => (await api()).rounds[n].status).toBe('completed')
  }
  await playRound(0)
  await playRound(1)

  // the break and the final
  await page.getByRole('button', { name: 'Объявить брейк' }).click()
  await expect.poll(async () => (await api()).rounds.length).toBe(3)
  await playRound(2)

  // the finish, the best speaker, the certificates
  await page.goto(`/dashboard/tournaments/${id}/settings`)
  await page.getByRole('button', { name: 'Завершить турнир' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Завершить турнир|Да|Подтвердить/ }).last().click()
  await expect.poll(async () => (await api()).status).toBe('finished')
  await page.goto(`/dashboard/tournaments/${id}/results`)
  await page.locator('button[aria-pressed]').filter({ hasText: 'сумма' }).first().click()
  await expect(page.getByText('Диплом выдан')).toBeVisible()
  await page.goto(`/tournaments/${id}/certificates/print`)
  await expect(page.locator('.cert-sheet').first()).toBeVisible()
  expect(await page.locator('.cert-sheet').count()).toBeGreaterThanOrEqual(12 + 2)
  await page.goto(`/tournaments/${id}?tab=playoffs`)
  await expect(page.getByText(/Чемпион/).first()).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

export type { Page }
