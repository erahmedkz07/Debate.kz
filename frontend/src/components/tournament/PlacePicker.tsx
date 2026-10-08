import { useTranslation } from 'react-i18next'
import { regionByCode, REGIONS, type GeoName } from '@/content/geo'
import { CITY_DISTRICTS, REGION_DISTRICTS } from '@/content/districts'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

// The tournament's place in a tidy two-column grid: region | city, district | venue.
// The city and the district are suggested from the lists (the region's cities; the city's own districts and the
// region's districts), with "another" to type a village or a district that is not listed. The venue (street, school,
// building) is typed in. Cities and districts are stored by their Russian names.
export interface Place { region: string; city: string; district: string; venue: string }

const OTHER = '__other__'
const NONE = '—'

export function PlacePicker({ value, onChange, invalid }: { value: Place; onChange: (p: Place) => void; invalid?: { region?: string; city?: string } }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const region = regionByCode(value.region)
  const single = !!region && region.cities.length === 1 // Astana, Almaty, Shymkent: the region is the city
  const knownCity = !!region?.cities.some(c => c.ru === value.city)
  const typingCity = (!!region && !single && !knownCity && value.city !== '') || value.city === OTHER
  // districts to suggest: the city's own (big cities), then the region's rural districts
  const districts: GeoName[] = region
    ? [...(region.districts ?? []), ...(CITY_DISTRICTS[value.city] ?? []), ...(single ? [] : REGION_DISTRICTS[region.code] ?? [])]
    : []
  const knownDistrict = districts.some(d => d.ru === value.district)
  const typingDistrict = (value.district !== '' && !knownDistrict) || value.district === OTHER
  const pickRegion = (code: string) => {
    const r = regionByCode(code)!
    onChange({ ...value, region: code, city: r.cities.length === 1 ? r.cities[0].ru : '', district: '' })
  }
  const optional = <span className="font-normal text-muted-foreground">({t('place.optional')})</span>
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="place-region">{t('place.region')}</Label>
        <Select id="place-region" invalid={!!invalid?.region} value={value.region} placeholder={t('place.regionPlaceholder')} onValueChange={pickRegion}
          options={REGIONS.map(r => ({ value: r.code, label: r[lang] }))} />
        {invalid?.region && <p className="mt-1 text-xs text-danger">{invalid.region}</p>}
      </div>
      <div>
        <Label htmlFor="place-city">{t('place.city')}</Label>
        {single ? (
          <Input id="place-city" value={region!.cities[0][lang]} disabled readOnly />
        ) : (
          <>
            <Select id="place-city" invalid={!!invalid?.city} disabled={!region} value={typingCity ? OTHER : value.city}
              placeholder={region ? t('place.cityPlaceholder') : t('place.regionFirst')}
              onValueChange={c => onChange({ ...value, city: c === OTHER ? OTHER : c, district: '' })}
              options={region ? [...region.cities.map(c => ({ value: c.ru, label: c[lang] })), { value: OTHER, label: t('place.otherCity') }] : []} />
            {typingCity && (
              <Input className="mt-2" autoFocus maxLength={60} value={value.city === OTHER ? '' : value.city} placeholder={t('place.villagePlaceholder')}
                aria-label={t('place.otherCity')} onChange={e => onChange({ ...value, city: e.target.value || OTHER })} />
            )}
          </>
        )}
        {invalid?.city && <p className="mt-1 text-xs text-danger">{invalid.city}</p>}
      </div>
      <div>
        <Label htmlFor="place-district">{t('place.district')} {optional}</Label>
        <Select id="place-district" disabled={!region} value={typingDistrict ? OTHER : value.district || NONE}
          onValueChange={v => onChange({ ...value, district: v === NONE ? '' : v === OTHER ? OTHER : v })}
          options={[{ value: NONE, label: region ? t('place.anyDistrict') : t('place.regionFirst') }, ...districts.map(x => ({ value: x.ru, label: x[lang] })), { value: OTHER, label: t('place.otherDistrict') }]} />
        {typingDistrict && (
          <Input className="mt-2" autoFocus maxLength={80} value={value.district === OTHER ? '' : value.district} placeholder={t('place.districtPlaceholder')}
            aria-label={t('place.otherDistrict')} onChange={e => onChange({ ...value, district: e.target.value || OTHER })} />
        )}
      </div>
      <div>
        <Label htmlFor="place-venue">{t('place.venue')} {optional}</Label>
        <Input id="place-venue" maxLength={160} value={value.venue} placeholder={t('place.venuePlaceholder')} onChange={e => onChange({ ...value, venue: e.target.value })} />
      </div>
    </div>
  )
}

// the city as stored: "other" without a name is no city yet
export const placeCity = (p: Place) => (p.city === OTHER ? '' : p.city.trim())
// the district as stored: "other" without a name is no district
export const placeDistrict = (p: Place) => (p.district === OTHER ? '' : p.district.trim())
