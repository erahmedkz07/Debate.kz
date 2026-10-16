import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadInstitutions, type Institution, type InstitutionKind } from '@/content/institutions'
import { cityName } from '@/content/geo'
import { SearchSelect } from '@/components/ui/search-select'

const ORDER: InstitutionKind[] = ['university', 'college', 'school']

// The school, college or university, picked from the directory so it is spelled the same everywhere (the rating
// groups by it). With a city chosen, the list is that city's institutions only: universities, colleges, schools.
// Without one, the whole country (search narrows it). Anything not listed is typed in full, with a reminder to
// write the exact official name.
export function InstitutionSelect({ value, onChange, city, id, invalid, className, placeholder, 'aria-label': ariaLabel }: {
  value: string; onChange: (name: string) => void; city?: string; id?: string; invalid?: boolean; className?: string; placeholder?: string; 'aria-label'?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const [all, setAll] = useState<Institution[] | null>(null)
  useEffect(() => { loadInstitutions().then(setAll, () => setAll([])) }, [])

  const local = useMemo(() => (all && city ? all.filter(x => x.city === city) : []), [all, city])
  // a city that is in the directory shows its own institutions; a typed-in village shows the whole country
  const scoped = local.length > 0
  const options = useMemo(() => {
    const list = scoped ? local : all ?? []
    return ORDER.flatMap(kind => list.filter(x => x.kind === kind).map(x => ({
      value: x.name, label: x.name, keywords: x.keywords, group: t(`institution.kinds.${kind}`),
      ...(!scoped && { hint: cityName(x.city, lang) }),
    })))
  }, [scoped, local, all, lang, t])

  const note = !all ? undefined
    : scoped ? t('institution.inCity', { city: cityName(city!, lang), count: local.length })
      : city ? t('institution.notInCity') : t('institution.pickCity')
  return (
    <SearchSelect id={id} className={className} invalid={invalid} aria-label={ariaLabel ?? t('common.institution')} value={value} onChange={onChange}
      options={options} loading={!all} note={note} footer={t('institution.source')}
      placeholder={placeholder ?? t('institution.placeholder')} allowCustom customHint={t('institution.customHint')} />
  )
}
