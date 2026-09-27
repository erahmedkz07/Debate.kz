import path from 'node:path'
import { mkdirSync } from 'node:fs'

// backend/uploads (same depth from src/lib and dist/lib)
export const UPLOADS_DIR = path.resolve(import.meta.dirname, '../../uploads')
export const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars')
mkdirSync(AVATARS_DIR, { recursive: true })

// private files (payment receipts): outside UPLOADS_DIR, served only through checked routes
export const PRIVATE_DIR = path.resolve(import.meta.dirname, '../../private')
export const RECEIPTS_DIR = path.join(PRIVATE_DIR, 'receipts')
mkdirSync(RECEIPTS_DIR, { recursive: true })
