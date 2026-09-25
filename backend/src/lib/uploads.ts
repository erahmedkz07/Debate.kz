import path from 'node:path'
import { mkdirSync } from 'node:fs'

// backend/uploads (same depth from src/lib and dist/lib)
export const UPLOADS_DIR = path.resolve(import.meta.dirname, '../../uploads')
export const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars')
mkdirSync(AVATARS_DIR, { recursive: true })
