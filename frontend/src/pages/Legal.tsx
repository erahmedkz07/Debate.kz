import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/layout/Layout'
import { BackButton } from '@/components/layout/BackButton'
import { Card } from '@/components/ui/card'
import { PRIVACY, TERMS, type LegalDoc } from '@/content/legal'
import { placeholder, SITE } from '@/content/site'
import { formatDate } from '@/lib/utils'

// The privacy policy (/privacy) and the terms of use (/terms) in the reader's language.
// {operator}, {bin}, {address}, {email}, {date} come from content/site.ts; an empty detail shows a visible placeholder.
function LegalPage({ doc, other }: { doc: LegalDoc; other: { to: string; label: string } }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const fill = (text: string) => text
    .replaceAll('{operator}', SITE.operator[lang] || placeholder[lang])
    .replaceAll('{bin}', SITE.bin || placeholder[lang])
    .replaceAll('{address}', SITE.address[lang] || placeholder[lang])
    .replaceAll('{email}', SITE.email || placeholder[lang])
    .replaceAll('{date}', formatDate(SITE.editionDate))
  return (
    <>
      <PageHeader title={doc.title[lang]} subtitle={t('legal.edition', { date: formatDate(SITE.editionDate) })} back={<BackButton fallback="/" />} />
      <div className="container-page max-w-3xl py-10">
        <p className="text-base leading-relaxed">{fill(doc.intro[lang])}</p>
        <nav aria-label={t('legal.contents')} className="mt-6">
          <Card className="p-5">
            <p className="text-sm font-bold">{t('legal.contents')}</p>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {doc.sections.map((s, i) => <li key={i}><a href={`#s${i + 1}`} className="text-primary hover:underline">{s.title[lang]}</a></li>)}
            </ol>
          </Card>
        </nav>
        {doc.sections.map((s, i) => (
          <section key={i} id={`s${i + 1}`} className="mt-8 scroll-mt-24">
            <h2 className="text-xl font-bold">{s.title[lang]}</h2>
            {s.paragraphs.map((p, j) => <p key={j} className="mt-3 leading-relaxed text-muted-foreground">{fill(p[lang])}</p>)}
          </section>
        ))}
        <p className="mt-10 border-t border-border pt-6 text-sm">
          <Link to={other.to} className="font-semibold text-primary hover:underline">{other.label}</Link>
        </p>
      </div>
    </>
  )
}

export function PrivacyPage() {
  const { t } = useTranslation()
  return <LegalPage doc={PRIVACY} other={{ to: '/terms', label: t('legal.terms') }} />
}

export function TermsPage() {
  const { t } = useTranslation()
  return <LegalPage doc={TERMS} other={{ to: '/privacy', label: t('legal.privacy') }} />
}
