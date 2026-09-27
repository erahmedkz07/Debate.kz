import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, ImagePlus, ImageIcon, Loader2 } from 'lucide-react'
import { getCoverTemplates, updateTournament, uploadTournamentCover } from '@/api'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Tournament settings: change the cover — upload a picture or pick a template
export function CoverCard({ tournamentId, cover, onChanged }: { tournamentId: string; cover: string; onChanged: () => void }) {
  const { t } = useTranslation()
  const { data: templates = [] } = useAsync(getCoverTemplates)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); toast.success(t('common.saved')); onChanged() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  const upload = (f?: File) => {
    if (!f) return
    if (f.size > 8 * 1024 * 1024) return void toast.error(t('wizard.coverTooBig'))
    void act(() => uploadTournamentCover(tournamentId, f))
  }
  return (
    <Card className="space-y-4 p-6">
      <h3 className="flex items-center gap-2 font-bold"><ImageIcon className="size-4 text-primary" />{t('wizard.cover')}</h3>
      <div className="relative aspect-[2/1] overflow-hidden rounded-2xl bg-muted">
        {cover && <img src={cover} alt="" className="size-full object-cover" />}
        {busy && <span className="absolute inset-0 grid place-items-center bg-background/60"><Loader2 className="size-6 animate-spin text-primary" /></span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}><ImagePlus className="size-4" />{t('wizard.coverUpload')}</Button>
      </div>
      <p className="text-xs font-semibold text-muted-foreground">{t('wizard.coverTemplates')}</p>
      <div className="grid grid-cols-5 gap-2">
        {templates.map((url, i) => (
          <button key={url} type="button" disabled={busy} aria-label={t('wizard.coverTemplate', { n: i + 1 })} aria-pressed={cover === url} onClick={() => act(() => updateTournament(tournamentId, { coverUrl: url }))}
            className={cn('relative aspect-[3/2] cursor-pointer overflow-hidden rounded-lg ring-offset-2 ring-offset-background transition', cover === url ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100')}>
            <img src={url.replace('w=1200', 'w=240')} alt="" loading="lazy" className="size-full object-cover" />
            {cover === url && <Check className="absolute right-1 top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
          </button>
        ))}
      </div>
    </Card>
  )
}
