import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { REGIONS } from '@/content/geo'
import { SearchSelect } from '@/components/ui/search-select'

// Every city of Kazakhstan, grouped by region (Astana, Almaty and Shymkent first), searchable in both languages.
// Cities are stored by their Russian name, as everywhere on the site.
export function CitySelect({ value, onChange, allLabel, allowCustom, placeholder, id, className, invalid, 'aria-label': ariaLabel }: {
  value: string; onChange: (city: string) => void; allLabel?: string; allowCustom?: boolean; placeholder?: string
  id?: string; className?: string; invalid?: boolean; 'aria-label'?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const options = useMemo(() => REGIONS.flatMap(r => r.cities.map(c => ({
    value: c.ru, label: c[lang], keywords: `${c.ru} ${c.kz}`,
    group: r.cities.length === 1 ? t('place.republicanCities') : r[lang],
  }))), [lang, t])
  return (
    <SearchSelect id={id} className={className} invalid={invalid} aria-label={ariaLabel ?? t('common.city')} value={value} onChange={onChange}
      options={options} allLabel={allLabel} placeholder={placeholder ?? t('place.cityPlaceholder')}
      allowCustom={allowCustom} customHint={allowCustom ? t('place.customCityHint') : undefined} />
  )
}
