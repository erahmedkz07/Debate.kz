import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from '@/locales/ru.json'

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

// Russian ships with the page (it is also the fallback); the Kazakh dictionary (~170 KB) loads only for those who use it
i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru } },
  lng: 'ru',
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

async function loadLanguage(lng: string) {
  if (lng !== 'kz' || i18n.hasResourceBundle('kz', 'translation')) return
  const kz = (await import('@/locales/kz.json')).default
  i18n.addResourceBundle('kz', 'translation', withRussianPluralForms(kz as Tree))
}

// switch the site's language (the dictionary is fetched first, so no text flashes in the other language)
export async function setLanguage(lng: 'ru' | 'kz') {
  await loadLanguage(lng)
  await i18n.changeLanguage(lng)
}

// the saved language is ready before the first render
export const i18nReady = saved === 'kz' ? setLanguage('kz').catch(() => undefined) : Promise.resolve()

// the page language follows the chosen language (the tab title is set per page by TitleSync)
const applyLang = (lng: string) => {
  document.documentElement.lang = lng === 'kz' ? 'kk' : 'ru'
}
applyLang(i18n.language)
i18n.on('languageChanged', lng => {
  applyLang(lng)
  try { localStorage.setItem('lang', lng) } catch { /* private mode */ }
})

export default i18n
