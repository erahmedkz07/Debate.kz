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
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === 'production'
