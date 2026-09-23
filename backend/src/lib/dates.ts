// DB stores DATE columns; the API speaks ISO "YYYY-MM-DD" strings
export const toDay = (d: Date) => d.toISOString().slice(0, 10)
export const fromDay = (s: string) => new Date(`${s}T00:00:00.000Z`)
