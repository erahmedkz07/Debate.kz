// Kazakhstan's regions for the tournament's place (codes match frontend/src/content/geo.ts, which also has the Kazakh
// names and the districts of the three big cities). City -> region lets the API fill the region when only a city is given.
export const REGION_CITIES = {
  astana: ['Астана'],
  almaty: ['Алматы'],
  shymkent: ['Шымкент'],
  abai: ['Семей', 'Аягоз', 'Курчатов', 'Шар'],
  akmola: ['Кокшетау', 'Степногорск', 'Щучинск', 'Атбасар', 'Акколь', 'Есиль', 'Ерейментау', 'Макинск', 'Степняк', 'Державинск', 'Косшы'],
  aktobe: ['Актобе', 'Алга', 'Кандыагаш', 'Хромтау', 'Шалкар', 'Эмба', 'Темир', 'Жем'],
  'almaty_region': ['Конаев', 'Каскелен', 'Талгар', 'Есик'],
  atyrau: ['Атырау', 'Кульсары'],
  east: ['Усть-Каменогорск', 'Риддер', 'Алтай', 'Зайсан', 'Серебрянск', 'Шемонаиха'],
  zhambyl: ['Тараз', 'Жанатас', 'Каратау', 'Шу'],
  zhetysu: ['Талдыкорган', 'Жаркент', 'Текели', 'Ушарал', 'Уштобе', 'Сарканд'],
  west: ['Уральск', 'Аксай'],
  karaganda: ['Караганда', 'Темиртау', 'Балхаш', 'Шахтинск', 'Сарань', 'Абай', 'Приозёрск'],
  kostanay: ['Костанай', 'Рудный', 'Лисаковск', 'Аркалык', 'Житикара', 'Тобыл'],
  kyzylorda: ['Кызылорда', 'Аральск', 'Казалинск', 'Байконыр'],
  mangystau: ['Актау', 'Жанаозен', 'Форт-Шевченко'],
  pavlodar: ['Павлодар', 'Экибастуз', 'Аксу'],
  north: ['Петропавловск', 'Булаево', 'Мамлютка', 'Сергеевка', 'Тайынша'],
  turkistan: ['Туркестан', 'Кентау', 'Сарыагаш', 'Арысь', 'Ленгер', 'Жетысай', 'Шардара'],
  ulytau: ['Жезказган', 'Сатпаев', 'Каражал'],
} as const

export type RegionCode = keyof typeof REGION_CITIES
export const REGION_CODES = Object.keys(REGION_CITIES) as [RegionCode, ...RegionCode[]]

// the region of a city in the list (a typed-in village has none)
export const regionOfCity = (city: string): RegionCode | null =>
  (Object.entries(REGION_CITIES) as [RegionCode, readonly string[]][]).find(([, cities]) => cities.includes(city))?.[0] ?? null
