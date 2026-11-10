// Search that does not tell Kazakh letters from the Russian ones people type instead, nor ё from е, nor capitals:
// "оскемен" finds "Өскемен", "кызылорда" finds "Қызылорда". The same rule as the server's (backend/lib/search.ts).
const FROM = 'әіңғүұқөһё'
const TO = 'аингуукохе'
export const fold = (s: string) => s.toLowerCase().replace(/[әіңғүұқөһё]/g, c => TO[FROM.indexOf(c)])
