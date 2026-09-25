import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { esc, linkable, sendMessage, telegramEnabled, TelegramError, type InlineButton, type SendOptions } from '../lib/telegram.js'

// Telegram notifications. Only people who linked the bot themselves (and did not turn it off) get messages.
// Sending never breaks the request that triggered it: call these with background().

export function background(p: Promise<unknown>) {
  p.catch(e => console.error('[notify]', e instanceof Error ? e.message : e))
}

const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`

// a link as a button when Telegram accepts it (public https), otherwise as a line of text
function withLink(text: string, label: string, path: string, extra: InlineButton[][] = []): [string, SendOptions] {
  const url = site(path)
  if (linkable(url)) return [text, { buttons: [[{ text: label, url }], ...extra] }]
  return [`${text}\n\n${label}: ${url}`, extra.length ? { buttons: extra } : {}]
}

export async function notifyUsers(userIds: (string | null | undefined)[], build: (userId: string) => [string, SendOptions?]) {
  if (!telegramEnabled()) return
  const ids = [...new Set(userIds.filter((x): x is string => !!x))]
  if (!ids.length) return
  const users = await prisma.user.findMany({ where: { id: { in: ids }, telegramChatId: { not: null }, telegramNotify: true, blocked: false } })
  for (const u of users) {
    const [text, opts] = build(u.id)
    try {
      await sendMessage(u.telegramChatId!, text, opts)
    } catch (e) {
      // the person blocked the bot or deleted the chat: stop trying
      if (e instanceof TelegramError && (e.code === 403 || /chat not found/i.test(e.message))) {
        await prisma.user.update({ where: { id: u.id }, data: { telegramChatId: null } })
      } else throw e
    }
  }
}

// ---------- domain events ----------

// a round was published: speakers get their room, side, opponent and motion; judges get their room and ballot link
export async function notifyRoundReleased(roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      tournament: { select: { name: true, id: true } },
      debates: {
        include: {
          proposition: { include: { speakers: { select: { userId: true } } } },
          opposition: { include: { speakers: { select: { userId: true } } } },
          judges: { include: { judge: { select: { userId: true } } } },
        },
      },
    },
  })
  if (!round) return
  const head = `📢 <b>${esc(round.tournament.name)}</b> · ${esc(round.name)}`
  const motion = round.motion ? `\nТема: «${esc(round.motion)}»` : ''
  for (const d of round.debates) {
    for (const [side, team, other] of [['Правительство', d.proposition, d.opposition], ['Оппозиция', d.opposition, d.proposition]] as const) {
      await notifyUsers(team.speakers.map(s => s.userId), () =>
        withLink(`${head}\n\n🚪 Аудитория: <b>${esc(d.room)}</b>\nВы — <b>${side}</b> против «${esc(other.name)}»${motion}`, 'Жеребьёвка', `/tournaments/${round.tournament.id}?tab=draw`))
    }
    for (const j of d.judges) {
      await notifyUsers([j.judge.userId], () =>
        withLink(`${head}\n\n⚖️ Вы ${j.isChair ? '<b>председатель</b>' : 'боковой судья'} в аудитории <b>${esc(d.room)}</b>\n«${esc(d.proposition.name)}» vs «${esc(d.opposition.name)}»${motion}`,
          'Заполнить бюллетень', `/ballot/${d.id}`))
    }
  }
}

export async function notifyRegistration(regId: string) {
  const r = await prisma.teamRegistration.findUnique({ where: { id: regId }, include: { tournament: { select: { id: true, name: true } } } })
  if (!r || r.status === 'pending') return
  const ok = r.status === 'confirmed'
  await notifyUsers([r.userId], () => withLink(
    ok ? `✅ Заявка команды «${esc(r.teamName)}» на турнир <b>${esc(r.tournament.name)}</b> подтверждена. Удачи!`
      : `❌ Заявка команды «${esc(r.teamName)}» на турнир <b>${esc(r.tournament.name)}</b> отклонена организатором.`,
    'Турнир', `/tournaments/${r.tournament.id}`))
}

export async function notifyModeration(tournamentId: string, text: string) {
  const owners = await prisma.tournamentOrganizer.findMany({ where: { tournamentId, role: 'owner' }, select: { userId: true } })
  await notifyUsers(owners.map(o => o.userId), () => withLink(text, 'Управление турниром', `/dashboard/tournaments/${tournamentId}`))
}
