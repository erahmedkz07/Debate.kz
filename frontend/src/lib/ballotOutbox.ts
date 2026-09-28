import { ApiError, submitBallot, type BallotData, type BallotPayload } from '@/api'

// Offline ballots. Venue Wi-Fi drops exactly when a round ends, so a judge's ballot must survive it:
//  - the form is autosaved as a draft on the device while the judge types;
//  - a ballot that cannot reach the server is queued and sent when the connection returns;
//  - the last loaded ballot sheet is kept so the page can reopen without a network.
// Re-sending is safe: the API replaces the same judge's previous ballot for that debate.

export interface QueuedBallot {
  debateId: string
  userId: string // only the judge who filled it can send it
  label: string // "Round 2 · Room 101" for messages
  payload: BallotPayload
  savedAt: string
}

// everything is kept per judge: two judges of one debate on a shared tablet never see each other's scores
const OUTBOX = 'ballot-outbox-v2'
const itemKey = (debateId: string, userId: string) => `${userId}:${debateId}`
const draftKey = (debateId: string, userId: string) => `ballot-draft:${userId}:${debateId}`
const sheetKey = (debateId: string, userId: string) => `ballot-sheet:${userId}:${debateId}`
export const OUTBOX_EVENT = 'ballot-outbox-changed'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked (private mode): the ballot still works online
  }
}

// no answer from the API at all, or a gateway in front of it is down: worth retrying later
export const isRetryable = (e: unknown) =>
  e instanceof ApiError && (e.status === 0 || e.status >= 502 || (e.status === 500 && e.code === 'unknown_error'))

// ---------- queue ----------
const all = () => {
  // ballots queued before the per-judge keys: moved once, nothing waiting is lost
  const old = read<Record<string, QueuedBallot>>('ballot-outbox-v1')
  if (old) {
    const items = read<Record<string, QueuedBallot>>(OUTBOX) ?? {}
    for (const b of Object.values(old)) items[itemKey(b.debateId, b.userId)] ??= b
    write(OUTBOX, items)
    write('ballot-outbox-v1', null)
  }
  return read<Record<string, QueuedBallot>>(OUTBOX) ?? {}
}
const save = (items: Record<string, QueuedBallot>) => {
  write(OUTBOX, Object.keys(items).length ? items : null)
  window.dispatchEvent(new Event(OUTBOX_EVENT))
}

export const pendingBallots = (userId: string) => Object.values(all()).filter(b => b.userId === userId)
export const queuedBallot = (debateId: string, userId: string) => all()[itemKey(debateId, userId)]

// one entry per debate: a newer ballot for the same debate replaces the older one
export function queueBallot(item: Omit<QueuedBallot, 'savedAt'>) {
  save({ ...all(), [itemKey(item.debateId, item.userId)]: { ...item, savedAt: new Date().toISOString() } })
}
export function dropBallot(debateId: string, userId: string) {
  const items = all()
  const key = itemKey(debateId, userId)
  if (!items[key]) return
  delete items[key]
  save(items)
}

export type FlushResult = { sent: QueuedBallot[]; rejected: { ballot: QueuedBallot; code: string }[]; waiting: number }

let flushing: Promise<FlushResult> | null = null
// sends this user's queued ballots one by one; stops at the first network failure
export function flushBallots(userId: string): Promise<FlushResult> {
  flushing ??= (async () => {
    const result: FlushResult = { sent: [], rejected: [], waiting: 0 }
    const queue = pendingBallots(userId)
    for (const [i, b] of queue.entries()) {
      try {
        await submitBallot(b.debateId, b.payload)
        dropBallot(b.debateId, userId)
        clearBallotDraft(b.debateId, userId)
        result.sent.push(b)
      } catch (e) {
        if (isRetryable(e) || (e instanceof ApiError && e.status === 401)) {
          // offline again or signed out: keep the rest for the next attempt
          result.waiting = queue.length - i
          break
        }
        // the server refused it for good (round closed, panel changed…): the judge must look at it
        dropBallot(b.debateId, userId)
        result.rejected.push({ ballot: b, code: e instanceof ApiError ? e.code : 'unknown_error' })
      }
    }
    return result
  })().finally(() => { flushing = null })
  return flushing
}

// ---------- draft of the form ----------
export interface BallotDraft {
  scores: Record<string, string>
  feedback: Record<string, string>
  reply: Record<'proposition' | 'opposition', string>
  replyBy: Partial<Record<'proposition' | 'opposition', string>>
  winner: 'proposition' | 'opposition' | 'closingProposition' | 'closingOpposition' | null
}
export const loadBallotDraft = (debateId: string, userId: string) => read<BallotDraft>(draftKey(debateId, userId))
export const saveBallotDraft = (debateId: string, userId: string, draft: BallotDraft) => write(draftKey(debateId, userId), draft)
export function clearBallotDraft(debateId: string, userId: string) {
  write(draftKey(debateId, userId), null)
  write(sheetKey(debateId, userId), null)
}

// ---------- the ballot sheet itself, for reopening offline ----------
export const loadBallotSheet = (debateId: string, userId: string) => read<BallotData>(sheetKey(debateId, userId))
export const saveBallotSheet = (debateId: string, userId: string, data: BallotData) => write(sheetKey(debateId, userId), data)
