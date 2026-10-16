// The level of a team, speaker or club for the season rating: taken from the school or university itself, so a
// "mixed" tournament still sorts its school and university teams apart. When the name says nothing (a typed-in team
// without an institution), the tournament's own level is used; a college or an unknown name stays "mixed".
export type Level = 'school' | 'university' | 'mixed'

// whole words in any script (\b only knows Latin letters)
const word = (body: string) => new RegExp(`(?<![\p{L}\p{N}])(?:${body})(?![\p{L}\p{N}])`, 'iu')
const UNIVERSITY = [
  /университет|институт|академи|university|institute|academy/iu,
  word('вуз|кимэп|almau|aitu|kbtu|kimep|sdu|enu|kaznu|nu'),
  // Kazakh university abbreviations end in "У" (университет): ЕНУ, КазНУ, КарТУ, ВКТУ, ЖезУ, КазУТБ
  /(?<![\p{L}])[А-ЯЁӘҒҚҢӨҰҮҺІ][А-ЯЁӘҒҚҢӨҰҮҺІа-яё]*У(?:ТБ)?(?![\p{L}])/u,
]
const SCHOOL = [/школ|лицей|гимнази|мектеп|school|lyceum|gymnasium|haileybury/iu, word('ниш|ктл|бил|мирас|miras|дарын|nis')]

export function levelOfInstitution(name: string | null | undefined): Level | null {
  if (!name) return null
  if (SCHOOL[0].test(name) || SCHOOL[1].test(name)) return 'school'
  if (UNIVERSITY.some(r => r.test(name))) return 'university'
  return null
}

// the institution decides; else the tournament's level
export const rowLevel = (institution: string | null | undefined, tournamentLevel: Level): Level => levelOfInstitution(institution) ?? tournamentLevel
