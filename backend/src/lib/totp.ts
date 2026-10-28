import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Time-based one-time codes (RFC 6238, the 6 digits of Google Authenticator, Microsoft Authenticator…), with no
// extra library: a 20-byte secret in base32, HMAC-SHA1, 30-second steps; one step either side for a slow phone clock.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(buf: Buffer) {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}
function unbase32(s: string) {
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(ch)
    if (i < 0) continue
    value = (value << 5) | i; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

export const newSecret = () => base32(randomBytes(20))

export function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', unbase32(secret)).update(counter).digest()
  const o = h[h.length - 1] & 15
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

// the step the code belongs to (to refuse the same code twice), or null
export function verifyCode(secret: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const step = Math.floor(now / 30_000)
  for (const d of [0, -1, 1]) {
    const want = Buffer.from(codeAt(secret, step + d))
    if (timingSafeEqual(want, Buffer.from(clean))) return step + d
  }
  return null
}

// the address an authenticator app reads from the QR code
export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`Debate.kz:${account}`)}?secret=${secret}&issuer=Debate.kz&algorithm=SHA1&digits=6&period=30`

// one-time recovery codes for a lost phone: shown once, kept only as hashes
export const newRecoveryCodes = () => Array.from({ length: 8 }, () => randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'))
export const hashRecovery = (code: string) => createHash('sha256').update(code.trim().toLowerCase()).digest('hex')
