import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from '@/locales/ru.json'
import kz from '@/locales/kz.json'

const saved = (() => {
  try { return localStorage.getItem('lang') } catch { return null }
})()

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kz: { translation: kz } },
  lng: saved === 'kz' ? 'kz' : 'ru',
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', lng => {
  document.documentElement.lang = lng === 'kz' ? 'kk' : 'ru'
  try { localStorage.setItem('lang', lng) } catch { /* private mode */ }
})

export default i18n
