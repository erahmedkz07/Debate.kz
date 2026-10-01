import { createApp } from './app.js'
import { env } from './lib/env.js'
import { prisma } from './lib/prisma.js'
import { startBot, stopBot } from './services/botPoller.js'
import { startWatchdog } from './services/watchdog.js'

const server = createApp().listen(env.PORT, () => {
  console.log(`Debate.kz API listening on http://localhost:${env.PORT}`)
  startBot() // no-op without TELEGRAM_BOT_TOKEN
})
// reminders, the archive of abandoned tournaments and strikes; the e2e run drives it by hand
const stopWatchdog = env.NODE_ENV === 'test' ? () => undefined : startWatchdog()

// graceful shutdown: finish requests, close DB pool
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopBot()
    stopWatchdog()
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  })
}
