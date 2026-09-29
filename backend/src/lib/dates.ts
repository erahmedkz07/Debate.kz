// DB stores DATE columns; the API speaks ISO "YYYY-MM-DD" strings
export const toDay = (d: Date) => d.toISOString().slice(0, 10)
export const fromDay = (s: string) => new Date(`${s}T00:00:00.000Z`)
// today's date in Kazakhstan (UTC+5), whatever the server's time zone: a deadline "10 November" closes at midnight in Astana,
// not at 05:00 when UTC turns the date
export const todayKz = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
