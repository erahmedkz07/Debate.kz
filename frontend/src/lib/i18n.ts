import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from '@/locales/ru.json'
import kz from '@/locales/kz.json'

const saved = (() => {
  try { return localStorage.getItem('lang') } catch { return null }
})()

// The site's code for Kazakh is "kz", but for plurals the browser reads "kz" as Russian-in-Kazakhstan (ru-KZ) and asks
// for the Russian forms _few/_many. Kazakh does not change a noun after a number, so every missing form is the
// _other text; without this, "5 команда" fell back to the Russian "5 команд".
type Tree = { [key: string]: string | Tree }
function withRussianPluralForms(tree: Tree): Tree {
  const out: Tree = {}
  for (const [key, value] of Object.entries(tree)) {
    out[key] = typeof value === 'string' ? value : withRussianPluralForms(value)
    if (typeof value === 'string' && key.endsWith('_other')) {
      const base = key.slice(0, -'_other'.length)
      for (const form of ['_few', '_many']) if (!(base + form in tree)) out[base + form] = value
    }
  }
  return out
}

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kz: { translation: withRussianPluralForms(kz as Tree) } },
  lng: saved === 'kz' ? 'kz' : 'ru',
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

// the tab title and the page language follow the chosen language
const titles = { ru: 'Debate.kz — дебатные турниры', kz: 'Debate.kz — дебат турнирлері' }
const applyLang = (lng: string) => {
  document.documentElement.lang = lng === 'kz' ? 'kk' : 'ru'
  document.title = titles[lng === 'kz' ? 'kz' : 'ru']
}
applyLang(i18n.language)
i18n.on('languageChanged', lng => {
  applyLang(lng)
  try { localStorage.setItem('lang', lng) } catch { /* private mode */ }
})

export default i18n
