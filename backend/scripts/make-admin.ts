// Grants the global admin role to an existing account. Admins cannot be created through the website.
// Usage: npm run admin:grant -- someone@mail.kz
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run admin:grant -- <email>')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
try {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error(`No user with email ${email}. Register on the site first.`)
  await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } })
  console.log(`${user.name} <${email}> is now an admin.`)
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
