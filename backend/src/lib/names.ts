// The same person's name written differently: "Айдана Серикова", "серикова  айдана", "Серикова Айдана" are one name.
// Order of words, case, extra spaces and ё/е do not matter.
export const nameKey = (name: string) =>
  name.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean).sort().join(' ')
export const sameName = (a: string, b: string) => nameKey(a) === nameKey(b)
