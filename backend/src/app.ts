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
import { invitesRouter } from './routes/invites.js'
import { telegramRouter } from './routes/telegram.js'
import { notificationsRouter } from './routes/notifications.js'
import { motionsRouter } from './routes/motions.js'
import { progressRouter } from './routes/progress.js'
import { certificatesRouter } from './routes/certificates.js'
import { checkinRouter } from './routes/checkin.js'
import { teammatesRouter } from './routes/teammates.js'
import { safetyRouter } from './routes/safety.js'
import { googleRouter } from './routes/google.js'
import { paymentsRouter } from './routes/payments.js'
import { clubsRouter } from './routes/clubs.js'
import { newsRouter } from './routes/news.js'
import { reviewsRouter } from './routes/reviews.js'
import { mailOutbox } from './lib/mail.js'
import { UPLOADS_DIR } from './lib/uploads.js'

export function redactUrl(url: string) {
  const [path, query] = url.split('?')
  const safePath = path.replace(/^(\/api\/invites\/)[^/]+/, '$1***')
  if (!query) return safePath
  // the Google callback carries the authorization code and state: drop the whole query
  if (path === '/api/auth/google/callback') return `${safePath}?***`
  return `${safePath}?${query}`
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(helmet())
  // cookies are sent cross-origin only to the known frontend
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  // secrets never reach the access log: Google's one-time code and state, invite tokens in the path
  morgan.token('url', (req: express.Request) => redactUrl(req.originalUrl || req.url || ''))
  app.use(morgan(isProd ? 'combined' : 'dev'))
  app.use(loadUser)

  // liveness + DB check (useful for Docker/monitoring later)
  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok' })
  })

  // user uploads (already re-encoded by sharp); long cache, files are immutable by name
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }))

  app.use('/api/auth', authRouter, googleRouter)
  // test mode only: e2e reads the letters the API "sent"
  if (env.NODE_ENV === 'test') {
    app.get('/api/test/mail', (req, res) => { res.json(mailOutbox.filter(m => !req.query.to || m.to === req.query.to)) })
  }
  app.use('/api', publicRouter, meRouter, avatarRouter, invitesRouter, judgeRouter, telegramRouter, notificationsRouter, motionsRouter, progressRouter, certificatesRouter, checkinRouter, teammatesRouter, safetyRouter, paymentsRouter, clubsRouter, newsRouter, reviewsRouter, organizerRouter, adminRouter)

  app.use('/api', notFoundHandler)
  app.use(errorHandler)
  return app
}
