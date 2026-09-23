import { createApp } from './app.js'
import { env } from './lib/env.js'
import { prisma } from './lib/prisma.js'

const server = createApp().listen(env.PORT, () => {
  console.log(`Debate.kz API listening on http://localhost:${env.PORT}`)
})

// graceful shutdown: finish requests, close DB pool
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  })
}
