// One at a time per key: a double click (or a phone resending on a weak connection) sends the same request twice at
// once; the second waits for the first and then runs on its result, instead of both writing side by side (two draws
// of one round, two copies of one ballot). The API runs as one process (the Telegram bot allows no second one), so a
// lock in memory is enough; several processes would need a lock in the database.
const tails = new Map<string, Promise<void>>()

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const before = tails.get(key) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>(r => { release = r })
  const tail = before.then(() => mine)
  tails.set(key, tail)
  await before
  try {
    return await fn()
  } finally {
    release()
    if (tails.get(key) === tail) tails.delete(key)
  }
}
