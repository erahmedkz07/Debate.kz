import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import { env, isProd } from './lib/env.js'
import { loadUser } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { authRouter } from './routes/auth.js'
import { publicRouter } from './routes/public.js'
import { meRouter } from './routes/me.js'
import { judgeRouter } from './routes/judge.js'
import { organizerRouter } from './routes/organizer.js'
import { adminRouter } from './routes/admin.js'
import { prisma } from './lib/prisma.js'
import { avatarRouter } from './routes/avatar.js'
import { UPLOADS_DIR } from './lib/uploads.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(helmet())
  // cookies are sent cross-origin only to the known frontend
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(morgan(isProd ? 'combined' : 'dev'))
  app.use(loadUser)

  // liveness + DB check (useful for Docker/monitoring later)
  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok' })
  })

  // user uploads (already re-encoded by sharp); long cache, files are immutable by name
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }))

  app.use('/api/auth', authRouter)
  app.use('/api', publicRouter, meRouter, avatarRouter, judgeRouter, organizerRouter, adminRouter)

  app.use('/api', notFoundHandler)
  app.use(errorHandler)
  return app
}
