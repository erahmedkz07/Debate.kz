import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen } from 'lucide-react'
import { FORMATS, formatById } from '@/content/formats'
import { BackButton } from '@/components/layout/BackButton'
import { SpeechTimer } from '@/components/tools/SpeechTimer'

// The timer page: the format lives in the address (?format=bp), so a link opens the right one.
export default function Timer() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const format = formatById(params.get('format') ?? '') ?? FORMATS[0]
  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/tools" className="-ml-1 mb-2" />
        <h1 className="text-3xl font-extrabold tracking-tight">{t('timer.title')}</h1>
        <div className="mt-4">
          <SpeechTimer key={format.id} formatId={format.id} onFormatChange={id => setParams({ format: id }, { replace: true })} />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t('timer.keys')} · <Link to={`/formats?f=${format.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><BookOpen className="size-3.5" />{t('timer.aboutFormat')}</Link>
        </p>
      </div>
    </div>
  )
}
