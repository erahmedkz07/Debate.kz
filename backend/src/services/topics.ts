// Motion topics and language, detected from the text (RU/KZ word stems).
// A heuristic for filtering and statistics: a motion may get several topics or none ("other").

export const TOPICS = ['education', 'technology', 'economy', 'politics', 'international', 'environment', 'society', 'rights', 'media', 'health', 'culture', 'sport'] as const
export type Topic = (typeof TOPICS)[number]

const STEMS: Record<Topic, string[]> = {
  education: ['school', 'educat', 'student', 'teacher', 'universit', 'exam', 'homework', 'школ', 'образован', 'учени', 'учител', 'студент', 'универс', 'экзамен', 'оқу', 'мектеп', 'білім', 'оқушы', 'мұғалім', 'студент'],
  technology: ['technolog', 'artificial intelligence', ' ai ', 'internet', 'digital', 'robot', 'social media', 'smartphone', 'crypto', 'технолог', 'искусственн', ' ии', 'интернет', 'цифров', 'робот', 'социальн сет', 'соцсет', 'смартфон', 'крипто', 'технология', 'жасанды интеллект', 'цифрлық', 'интернет'],
  economy: ['econom', ' tax', 'business', 'market', 'wage', 'poverty', 'bank', 'эконом', 'налог', 'бизнес', 'рынок', 'рыноч', 'зарплат', 'бедност', 'банк', 'кредит', 'экономика', 'салық', 'нарық', 'кедейлік'],
  politics: ['government', 'state ', 'election', 'parliament', 'democra', ' law', 'president', 'vote', 'государств', 'правительств', 'выбор', 'парламент', 'демократ', 'закон', 'президент', 'мемлекет', 'үкімет', 'сайлау', 'заң', 'демократия'],
  international: ['international', ' un ', 'sanction', ' war', 'conflict', 'migra', 'border', 'международн', 'оон', 'санкци', 'войн', 'конфликт', 'мигрант', 'миграц', 'границ', 'халықаралық', 'соғыс', 'шекара'],
  environment: ['environment', 'climate', 'nature', 'pollut', 'energy', 'carbon', 'plastic', 'эколог', 'климат', 'окружающ', 'природ', 'загрязн', 'энергетик', 'углерод', 'пластик', 'экология', 'климат', 'табиғат', 'қоршаған орта'],
  society: ['societ', 'family', 'youth', 'parent', 'marriage', ' city', 'religio', 'обществ', 'семь', 'молодёж', 'молодеж', 'родител', 'брак', 'город', 'религи', 'қоғам', 'отбасы', 'жастар', 'ата-ана', 'дін'],
  rights: ['right', 'freedom', 'equality', 'discrimin', 'gender', 'women', 'censor', 'прав', 'свобод', 'равенств', 'дискримин', 'гендер', 'женщин', 'цензур', 'құқық', 'бостандық', 'теңдік', 'әйел'],
  media: ['media', 'journalis', 'news', 'advertis', 'blogger', 'сми', 'медиа', 'журналист', 'новост', 'реклам', 'блогер', 'бақ', 'жарнама'],
  health: ['health', 'medic', 'vaccin', 'alcohol', 'smoking', 'drug', 'здоров', 'медицин', 'вакцин', 'спорт и здоров', 'алкогол', 'курени', 'наркот', 'денсаулық', 'медицина', 'темекі'],
  culture: ['cultur', ' art', 'language', 'histor', 'museum', 'literatur', 'tradition', 'культур', 'искусств', 'язык', 'истори', 'музей', 'литератур', 'традиц', 'мәдениет', 'өнер', 'тіл', 'тарих', 'дәстүр'],
  sport: ['sport', 'olympi', 'football', 'esport', 'спорт', 'олимпи', 'футбол', 'киберспорт', 'спорт'],
}

export function topicsOf(motion: string): Topic[] {
  const text = ` ${motion.toLowerCase()} `
  return TOPICS.filter(t => STEMS[t].some(stem => text.includes(stem)))
}

// Kazakh-only letters mean the motion is in Kazakh; Latin letters without any Cyrillic mean English (an English league)
export const languageOf = (motion: string): 'kz' | 'ru' | 'en' =>
  /[әіңғүұқөһ]/i.test(motion) ? 'kz' : !/[а-яё]/i.test(motion) && /[a-z]/i.test(motion) ? 'en' : 'ru'
