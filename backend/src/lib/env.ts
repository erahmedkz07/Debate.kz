import { z } from 'zod'

// Fail fast on startup if config is missing or weak
const schema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  PORT: z.coerce.number().int().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // optional Telegram bot (@BotFather); empty = bot disabled
  TELEGRAM_BOT_TOKEN: z.preprocess(v => v || undefined, z.string().regex(/^\d+:[\w-]{30,}$/, 'looks like 123456:ABC...').optional()),
  TELEGRAM_BOT_USERNAME: z.preprocess(v => v || undefined, z.string().regex(/^\w{5,32}$/, 'bot username without @').optional()),
  // optional "Sign in with Google" (Google Cloud Console → OAuth client, type "Web application"); empty = button hidden
  GOOGLE_CLIENT_ID: z.preprocess(v => v || undefined, z.string().regex(/\.apps\.googleusercontent\.com$/, 'looks like 1234-abc.apps.googleusercontent.com').optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(v => v || undefined, z.string().min(10).optional()),
  // Google endpoints; overridden only by the e2e runner, which plays Google locally
  GOOGLE_AUTH_URL: z.string().url().default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_TOKEN_URL: z.string().url().default('https://oauth2.googleapis.com/token'),
  // optional SMTP for real email (e.g. Gmail: smtp.gmail.com, 465, your address, an app password); empty = console
  SMTP_HOST: z.preprocess(v => v || undefined, z.string().optional()),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.preprocess(v => v || undefined, z.string().optional()),
  SMTP_PASS: z.preprocess(v => v || undefined, z.string().optional()),
  MAIL_FROM: z.preprocess(v => v || undefined, z.string().optional()), // "Debate.kz <address>"; defaults to SMTP_USER
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === 'production'
export const googleEnabled = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
