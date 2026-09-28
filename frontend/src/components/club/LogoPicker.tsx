import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { EntityLogo } from '@/components/ui/entity-logo'

// A club's or team's logo that its members change in place: a tap on it picks a picture, the small bin removes it.
export function LogoPicker({ src, name, size = 'md', onUpload, onRemove, onDone }: {
  src?: string; name: string; size?: 'md' | 'lg' | 'xl'
  onUpload: (file: File) => Promise<unknown>; onRemove: () => Promise<unknown>; onDone: () => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); onDone() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  const pick = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return void toast.error(t('apiErrors.invalid_image'))
    if (file.size > 5 * 1024 * 1024) return void toast.error(t('club.logo.tooBig'))
    void act(() => onUpload(file), t('club.logo.saved'))
  }
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} title={t('club.logo.change')} aria-label={t('club.logo.change')}
        className="group relative block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
        <EntityLogo src={src} name={name} size={size} />
        <span className={cn('absolute inset-0 grid place-items-center rounded-[inherit] bg-navy/55 text-white transition-opacity', busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
        </span>
        {!src && <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground"><Camera className="size-3" /></span>}
      </button>
      {src && (
        <button type="button" onClick={() => void act(onRemove, t('club.logo.removed'))} disabled={busy} title={t('club.logo.remove')} aria-label={t('club.logo.remove')}
          className="absolute -right-1.5 -top-1.5 grid size-6 cursor-pointer place-items-center rounded-full border-2 border-card bg-muted text-muted-foreground hover:bg-danger hover:text-white">
          <Trash2 className="size-3" />
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}
