import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Mail, MapPin, Phone } from 'lucide-react'
import { Logo, OrnamentPattern, TelegramIcon } from '@/components/brand'

export function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden bg-navy text-white/80">
      <OrnamentPattern className="text-white/[0.03]" />
      <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
      <div className="container-page relative grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo inverted />
          <p className="max-w-xs text-sm leading-relaxed text-white/65">{t('footer.about')}</p>
          <a href="https://t.me/" target="_blank" rel="noreferrer" aria-label="Telegram"
            className="inline-grid size-10 place-items-center rounded-xl bg-white/10 text-white transition-colors hover:bg-primary">
            <TelegramIcon className="size-5" />
          </a>
        </div>

        <div>
          <h3 className="mb-4 font-bold text-white">{t('footer.platform')}</h3>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="hover:text-accent" to="/tournaments">{t('nav.tournaments')}</Link></li>
            <li><Link className="hover:text-accent" to="/rating">{t('nav.rating')}</Link></li>
            <li><Link className="hover:text-accent" to="/pricing">{t('nav.pricing')}</Link></li>
            <li><Link className="hover:text-accent" to="/dashboard/tournaments/new">{t('nav.createTournament')}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 font-bold text-white">{t('footer.resources')}</h3>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="hover:text-accent" to="/about">{t('nav.about')}</Link></li>
            <li><a className="hover:text-accent" href="https://www.wsdcdebating.org/" target="_blank" rel="noreferrer">{t('footer.rules')}</a></li>
            <li><Link className="hover:text-accent" to="/pricing#faq">{t('footer.help')}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 font-bold text-white">{t('footer.contacts')}</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2.5"><MapPin className="size-4 text-accent" />Астана, Казахстан</li>
            <li className="flex items-center gap-2.5"><Mail className="size-4 text-accent" />hello@debate.kz</li>
            <li className="flex items-center gap-2.5"><Phone className="size-4 text-accent" />+7 700 000 00 00</li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} Debate.kz. {t('footer.rights')}</span>
          <span>{t('footer.madeIn')} 🇰🇿</span>
        </div>
      </div>
    </footer>
  )
}
