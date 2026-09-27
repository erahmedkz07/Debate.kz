import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { UPLOADS_DIR } from '../lib/uploads.js'

// Tournament covers: an organizer uploads a picture (re-encoded, stored in uploads/covers) or picks a ready template.
// A tournament without a cover gets a template chosen by its id, so every card has a picture.

export const COVERS_DIR = path.join(UPLOADS_DIR, 'covers')
mkdirSync(COVERS_DIR, { recursive: true })

// free Unsplash photos (Unsplash License), the same set the site already uses
const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=75`
export const COVER_TEMPLATES = [
  u('photo-1715610237622-748477adf2e4'), // podium
  u('photo-1587825140708-dfaf72ae4b04'), // stage and audience
  u('photo-1550305080-4e029753abcf'), // hands up
  u('photo-1758270704763-22072a90d3b6'), // students in a hall
  u('photo-1582192730841-2a682d7375f9'), // panel
  u('photo-1733222814719-9c756a54ad92'), // presentation
  u('photo-1540575467063-178a50c2df87'), // audience
  u('photo-1544531586-fde5298cdd40'), // speaker and crowd
  u('photo-1531058020387-3be344556be6'), // conference
  u('photo-1475721027785-f74eccf877e2'), // microphone
]

// stable pick: the same tournament always gets the same template
export function templateFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COVER_TEMPLATES[h % COVER_TEMPLATES.length]
}

export const coverOf = (t: { id: string; coverUrl: string | null }) => t.coverUrl || templateFor(t.id)

// a cover may be a template or a file uploaded to this site — never an arbitrary external link
export const isAllowedCover = (url: string) => COVER_TEMPLATES.includes(url) || /^\/uploads\/covers\/[\w-]+\.webp$/.test(url)

export async function removeUploadedCover(url: string | null) {
  if (!url?.startsWith('/uploads/covers/')) return
  await unlink(path.join(COVERS_DIR, path.basename(url))).catch(() => undefined)
}
