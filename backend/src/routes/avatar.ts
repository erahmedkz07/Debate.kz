import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { randomBytes } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../lib/prisma.js'
import { badRequest } from '../lib/errors.js'
import { AVATARS_DIR } from '../lib/uploads.js'
import { publicUser, requireAuth } from '../middleware/auth.js'

export const avatarRouter = Router()

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
})

async function removeOld(url: string | null) {
  if (!url?.startsWith('/uploads/avatars/')) return
  // basename() blocks path traversal even if the DB value were tampered with
  await unlink(path.join(AVATARS_DIR, path.basename(url))).catch(() => undefined)
}

// The uploaded file is never stored as-is: sharp decodes it (rejecting anything that is not a real image),
// applies EXIF rotation, strips all metadata (GPS etc.) and re-encodes to a 256x256 WebP.
avatarRouter.post('/me/avatar', requireAuth(), upload.single('avatar'), async (req, res) => {
  if (!req.file) throw badRequest('invalid_image')
  let webp: Buffer
  try {
    webp = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(256, 256, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    throw badRequest('invalid_image')
  }
  const file = `${req.user!.id}-${randomBytes(6).toString('hex')}.webp` // new name = no stale browser cache
  await writeFile(path.join(AVATARS_DIR, file), webp)
  await removeOld(req.user!.avatarUrl)
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: `/uploads/avatars/${file}` } })
  res.json({ user: publicUser(user) })
})

avatarRouter.delete('/me/avatar', requireAuth(), async (req, res) => {
  await removeOld(req.user!.avatarUrl)
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: null } })
  res.json({ user: publicUser(user) })
})
