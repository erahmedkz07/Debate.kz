import { createHash, randomBytes } from 'node:crypto'

// Random URL-safe token for links; only its SHA-256 hash is stored in the DB,
// so a leaked database does not leak working links.
export function newToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
