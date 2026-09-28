import path from 'node:path'
import { mkdirSync } from 'node:fs'

// Where files live. Normally next to the code (backend/uploads, backend/private); the e2e server (NODE_ENV=test)
// keeps its own copy in backend/test-storage, which the runner wipes, so test avatars and receipts never mix
// with real ones. STORAGE_DIR moves everything elsewhere (e.g. a mounted volume in production).
const backendDir = path.resolve(import.meta.dirname, '../..') // same depth from src/lib and dist/lib
export const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : process.env.NODE_ENV === 'test' ? path.join(backendDir, 'test-storage') : backendDir

export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads')
export const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars')
mkdirSync(AVATARS_DIR, { recursive: true })
export const LOGOS_DIR = path.join(UPLOADS_DIR, 'logos') // club and club-team logos
mkdirSync(LOGOS_DIR, { recursive: true })

// private files (payment receipts): outside UPLOADS_DIR, served only through checked routes
export const PRIVATE_DIR = path.join(STORAGE_DIR, 'private')
export const RECEIPTS_DIR = path.join(PRIVATE_DIR, 'receipts')
mkdirSync(RECEIPTS_DIR, { recursive: true })
