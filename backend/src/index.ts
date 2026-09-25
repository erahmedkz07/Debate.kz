import { createApp } from './app.js'
import { env } from './lib/env.js'
import { prisma } from './lib/prisma.js'
import { startBot, stopBot } from './services/botPoller.js'

const server = createApp().listen(env.PORT, () => {
  console.log(`Debate.kz API listening on http://localhost:${env.PORT}`)
  startBot() // no-op without TELEGRAM_BOT_TOKEN
})

// graceful shutdown: finish requests, close DB pool
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopBot()
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  })
}
