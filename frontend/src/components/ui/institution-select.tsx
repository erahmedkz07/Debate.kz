import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { INSTITUTIONS } from '@/content/institutions'
import { cityName } from '@/content/geo'
import { SearchSelect } from '@/components/ui/search-select'

// The school or university, picked from the directory so it is spelled the same everywhere (the rating groups by it):
// the ones in the chosen city first, then universities and schools elsewhere. Anything not listed is typed in full,
// with a reminder to write the exact official name.
export function InstitutionSelect({ value, onChange, city, id, invalid, className, placeholder, 'aria-label': ariaLabel }: {
  value: string; onChange: (name: string) => void; city?: string; id?: string; invalid?: boolean; className?: string; placeholder?: string; 'aria-label'?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const options = useMemo(() => {
    const here = city ? INSTITUTIONS.filter(x => x.city === city) : []
    const rest = INSTITUTIONS.filter(x => !here.includes(x))
    const opt = (x: (typeof INSTITUTIONS)[number], group: string) => ({ value: x.name, label: x.name, hint: cityName(x.city, lang), keywords: x.keywords, group })
    return [
      ...here.map(x => opt(x, t('institution.inCity', { city: cityName(city!, lang) }))),
      ...rest.filter(x => x.kind === 'university').map(x => opt(x, t('institution.universities'))),
      ...rest.filter(x => x.kind === 'school').map(x => opt(x, t('institution.schools'))),
    ]
  }, [city, lang, t])
  return (
    <SearchSelect id={id} className={className} invalid={invalid} aria-label={ariaLabel ?? t('common.institution')} value={value} onChange={onChange}
      options={options} placeholder={placeholder ?? t('institution.placeholder')} allowCustom customHint={t('institution.customHint')} />
  )
}
