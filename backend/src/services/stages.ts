// Playoff stage by how many teams are still in: two-team formats end with 2 (the final), BP with one room of 4
export const stageOf = (teams: number, bp: boolean) =>
  (bp ? { 4: 'final', 8: 'semi', 16: 'quarter', 32: 'octo', 64: 'doubleOcto' } : { 2: 'final', 4: 'semi', 8: 'quarter', 16: 'octo', 32: 'doubleOcto', 64: 'tripleOcto' } as Record<number, string>)[teams] ?? 'octo'
export const STAGE_NAME: Record<string, string> = { final: 'Финал', semi: 'Полуфинал', quarter: 'Четвертьфинал', octo: '1/8 финала', doubleOcto: '1/16 финала', tripleOcto: '1/32 финала' }
