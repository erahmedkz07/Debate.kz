import { z } from 'zod'

// The same person's name written differently: "Айдана Серикова", "серикова  айдана", "Серикова Айдана" are one name.
// Order of words, case, extra spaces and ё/е do not matter, nor Kazakh letters typed on a Russian keyboard
// ("Нурлан Алиев" for "Нұрлан Әлиев").
const FOLD: Record<string, string> = { ё: 'е', ә: 'а', і: 'и', ң: 'н', ғ: 'г', ү: 'у', ұ: 'у', қ: 'к', ө: 'о', һ: 'х' }
export const nameKey = (name: string) =>
  name.toLowerCase().replace(/[ёәіңғүұқөһ]/g, c => FOLD[c]).split(/\s+/).filter(Boolean).sort().join(' ')
// a person's name as typed: the spaces at the ends dropped, several spaces inside kept as one
export const personName = () => z.string().trim().min(3).max(100).transform(s => s.replace(/\s+/g, ' '))
export const sameName = (a: string, b: string) => nameKey(a) === nameKey(b)
