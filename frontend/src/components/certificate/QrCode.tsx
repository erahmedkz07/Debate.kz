import { useEffect, useState } from 'react'
import QR from 'qrcode'

// QR code rendered locally (no external service); error correction M survives print and screen glare
export function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let alive = true
    QR.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: size * 2, color: { dark: '#0b2a3c', light: '#ffffff' } })
      .then(url => { if (alive) setSrc(url) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [value, size])
  return src
    ? <img src={src} width={size} height={size} alt={value} className={className} />
    : <span style={{ width: size, height: size }} className={className} />
}
