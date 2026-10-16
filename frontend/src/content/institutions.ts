// The directory of universities, colleges and schools of Kazakhstan, by city, for picking an institution in one
// consistent spelling (the rating groups teams and speakers by it). institutions.json is built by
// scripts/institutions/build.py: a curated list of universities (official names and the abbreviations people search
// by), the Nazarbayev Intellectual Schools and well-known schools, plus every school, college and university mapped
// in OpenStreetMap (© OpenStreetMap contributors, ODbL), cleaned and placed in the nearest city of geo.ts.
// The map does not have every school yet, so anything missing is typed in full by the user (see InstitutionSelect).
// About 100 KB: loaded only when a picker opens, never with the rest of the site.
export type InstitutionKind = 'university' | 'college' | 'school'
export interface Institution { name: string; city: string; kind: InstitutionKind; keywords?: string }

const KINDS: Record<string, InstitutionKind> = { u: 'university', c: 'college', s: 'school' }
let loading: Promise<Institution[]> | null = null

export function loadInstitutions() {
  loading ??= import('./institutions.json')
    .then(m => (m.default as [string, string, string, string?][]).map(([name, city, k, keywords]) => ({ name, city, kind: KINDS[k], keywords })))
    .catch(e => { loading = null; throw e })
  return loading
}
