import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Mail, MapPin, Phone } from 'lucide-react'
import { Logo, OrnamentPattern, TelegramIcon } from '@/components/brand'
import { SITE } from '@/content/site'

export function Footer() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const year = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden bg-navy text-white/80">
      <OrnamentPattern className="text-white/[0.03]" />
      <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
      <div className="container-page relative grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo inverted />
          <p className="max-w-xs text-sm leading-relaxed text-white/65">{t('footer.about')}</p>
          {SITE.telegram && (
            <a href={SITE.telegram} target="_blank" rel="noreferrer" aria-label="Telegram"
              className="inline-grid size-10 place-items-center rounded-xl bg-white/10 text-white transition-colors hover:bg-primary">
              <TelegramIcon className="size-5" />
            </a>
          )}
        </div>

        <div>
          <h3 className="mb-4 font-bold text-white">{t('footer.platform')}</h3>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="hover:text-accent" to="/tournaments">{t('nav.tournaments')}</Link></li>
            <li><Link className="hover:text-accent" to="/rating">{t('nav.rating')}</Link></li>
            <li><Link className="hover:text-accent" to="/motions">{t('nav.motions')}</Link></li>
            <li><Link className="hover:text-accent" to="/timer">{t('timer.title')}</Link></li>
            <li><Link className="hover:text-accent" to="/teammates">{t('teammates.title')}</Link></li>
            <li><Link className="hover:text-accent" to="/clubs">{t('footer.clubs')}</Link></li>
            <li><Link className="hover:text-accent" to="/pricing">{t('nav.pricing')}</Link></li>
            <li><Link className="hover:text-accent" to="/dashboard/tournaments/new">{t('nav.createTournament')}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 font-bold text-white">{t('footer.resources')}</h3>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="hover:text-accent" to="/about">{t('nav.about')}</Link></li>
            <li><Link className="hover:text-accent" to="/tools">{t('footer.tools')}</Link></li>
            <li><Link className="hover:text-accent" to="/formats">{t('footer.formats')}</Link></li>
            <li><Link className="hover:text-accent" to="/reference">{t('footer.reference')}</Link></li>
            <li><Link className="hover:text-accent" to="/news">{t('footer.news')}</Link></li>
            <li><a className="hover:text-accent" href="https://www.wsdcdebating.org/" target="_blank" rel="noreferrer">{t('footer.rules')}</a></li>
            <li><Link className="hover:text-accent" to="/pricing#faq">{t('footer.help')}</Link></li>
            <li><Link className="hover:text-accent" to="/safety">{t('safety.title')}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 font-bold text-white">{t('footer.contacts')}</h3>
          <ul className="space-y-3 text-sm">
            {/* only real contacts: an empty detail in content/site.ts is not shown */}
            <li className="flex items-center gap-2.5"><MapPin className="size-4 text-accent" />{SITE.address[lang] || t('footer.address')}</li>
            {SITE.email && <li><a className="flex items-center gap-2.5 hover:text-accent" href={`mailto:${SITE.email}`}><Mail className="size-4 text-accent" />{SITE.email}</a></li>}
            {SITE.phone && <li><a className="flex items-center gap-2.5 hover:text-accent" href={`tel:${SITE.phone.replace(/\s/g, '')}`}><Phone className="size-4 text-accent" />{SITE.phone}</a></li>}
            <li><Link className="hover:text-accent" to="/safety">{t('safety.title')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} Debate.kz. {t('footer.rights')}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link className="hover:text-accent" to="/privacy">{t('legal.privacy')}</Link>
            <Link className="hover:text-accent" to="/terms">{t('legal.terms')}</Link>
            <span>{t('footer.madeIn')} 🇰🇿</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
