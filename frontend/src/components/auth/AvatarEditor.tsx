import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { deleteAvatar, uploadAvatar } from '@/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Avatar } from './UserMenu'

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX = 5 * 1024 * 1024

// Big profile avatar: click to upload a photo, small button to remove it
export function AvatarEditor({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const pick = async (file?: File) => {
    if (!file) return
    // quick client-side checks; the server re-validates and re-encodes anyway
    if (!TYPES.includes(file.type)) return void toast.error(t('apiErrors.invalid_image'))
    if (file.size > MAX) return void toast.error(t('apiErrors.file_too_large'))
    const local = URL.createObjectURL(file)
    setPreview(local)
    setBusy(true)
    try {
      signIn(await uploadAvatar(file))
      toast.success(t('profile.avatar.saved'))
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
      setPreview(null)
      URL.revokeObjectURL(local)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      signIn(await deleteAvatar())
      toast(t('profile.avatar.removed'))
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    // relative + z-10 keeps the avatar above the (positioned) cover banner
    <div className={cn('group relative z-10 shrink-0', className)}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className="relative block cursor-pointer rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
        aria-label={t('profile.avatar.change')} title={t('profile.avatar.change')}>
        <Avatar name={user.name} role={user.role} src={preview ?? user.avatarUrl} className="size-24 border-4 border-card text-3xl shadow-lg sm:size-28" />
        <span className={cn('absolute inset-1 grid place-items-center rounded-full bg-navy/55 text-white transition-opacity',
          busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100')}>
          {busy ? <Loader2 className="size-7 animate-spin" /> : <Camera className="size-7" />}
        </span>
      </button>
      {/* always-visible camera badge so touch users see it can be changed */}
      <span aria-hidden className="pointer-events-none absolute bottom-1 right-1 grid size-8 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow">
        <Camera className="size-4" />
      </span>
      {user.avatarUrl && !busy && (
        <button type="button" onClick={remove} title={t('profile.avatar.remove')} aria-label={t('profile.avatar.remove')}
          className="absolute -right-1 top-0 grid size-7 cursor-pointer place-items-center rounded-full border-2 border-card bg-danger text-white opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100">
          <Trash2 className="size-3.5" />
        </button>
      )}
      <input ref={input} type="file" accept={TYPES.join(',')} className="sr-only" onChange={e => pick(e.target.files?.[0])} />
    </div>
  )
}
