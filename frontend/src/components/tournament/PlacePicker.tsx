import { useTranslation } from 'react-i18next'
import { regionByCode, REGIONS } from '@/content/geo'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

// The tournament's place: the region, a city of it (or a village typed in), the district (аудан) — a list for Astana,
// Almaty and Shymkent, typed in for any other place — and the venue itself: street, school, building.
// Cities are stored by their Russian name.
export interface Place { region: string; city: string; district: string; venue: string }

const OTHER = '__other__'

export function PlacePicker({ value, onChange, invalid }: { value: Place; onChange: (p: Place) => void; invalid?: { region?: string; city?: string } }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const region = regionByCode(value.region)
  const known = !!region?.cities.some(c => c.ru === value.city)
  // a single-city region (Astana, Almaty, Shymkent) picks its city by itself
  const pickRegion = (code: string) => {
    const r = regionByCode(code)!
    onChange({ ...value, region: code, city: r.cities.length === 1 ? r.cities[0].ru : '', district: '' })
  }
  const typing = !!region && region.cities.length > 1 && !known && value.city !== '' || value.city === OTHER
  const optional = <span className="font-normal text-muted-foreground">({t('place.optional')})</span>
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="place-region">{t('place.region')}</Label>
        <Select id="place-region" invalid={!!invalid?.region} value={value.region} placeholder={t('place.regionPlaceholder')} onValueChange={pickRegion}
          options={REGIONS.map(r => ({ value: r.code, label: r[lang] }))} />
        {invalid?.region && <p className="mt-1 text-xs text-danger">{invalid.region}</p>}
      </div>
      {region && region.cities.length > 1 && (
        <div>
          <Label htmlFor="place-city">{t('place.city')}</Label>
          <Select id="place-city" invalid={!!invalid?.city} value={typing ? OTHER : value.city} placeholder={t('place.cityPlaceholder')}
            onValueChange={c => onChange({ ...value, city: c === OTHER ? OTHER : c })}
            options={[...region.cities.map(c => ({ value: c.ru, label: c[lang] })), { value: OTHER, label: t('place.otherCity') }]} />
          {typing && (
            <Input className="mt-2" autoFocus maxLength={60} value={value.city === OTHER ? '' : value.city} placeholder={t('place.villagePlaceholder')}
              aria-label={t('place.otherCity')} onChange={e => onChange({ ...value, city: e.target.value || OTHER })} />
          )}
          {invalid?.city && <p className="mt-1 text-xs text-danger">{invalid.city}</p>}
        </div>
      )}
      {region && (
        <div>
          <Label htmlFor="place-district">{t('place.district')} {optional}</Label>
          {region.districts ? (
            <Select id="place-district" value={value.district || '—'} onValueChange={d => onChange({ ...value, district: d === '—' ? '' : d })}
              options={[{ value: '—', label: t('place.anyDistrict') }, ...region.districts.map(d => ({ value: d.ru, label: d[lang] }))]} />
          ) : (
            <Input id="place-district" maxLength={80} value={value.district} placeholder={t('place.districtPlaceholder')} onChange={e => onChange({ ...value, district: e.target.value })} />
          )}
        </div>
      )}
      {region && (
        <div className={region.cities.length > 1 ? 'sm:col-span-2' : undefined}>
          <Label htmlFor="place-venue">{t('place.venue')} {optional}</Label>
          <Input id="place-venue" maxLength={160} value={value.venue} placeholder={t('place.venuePlaceholder')} onChange={e => onChange({ ...value, venue: e.target.value })} />
        </div>
      )}
    </div>
  )
}

// the city as stored: "other" without a name is no city yet
export const placeCity = (p: Place) => (p.city === OTHER ? '' : p.city.trim())
