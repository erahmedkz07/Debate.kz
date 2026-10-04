// A motion is stored without surrounding quotes (the site and the bot add «» when they show it). Organizers often
// type the quotes themselves; any kind and any number of layers are dropped.
const OPEN = '«"“„\'‘'
const CLOSE = '»"”“\'’'
export function bareMotion(motion: string) {
  let m = motion.trim()
  while (m.length > 1 && OPEN.includes(m[0]) && CLOSE.includes(m[m.length - 1])) {
    // «А» и «Б» is not quoted as a whole: the inner part must keep its own «» balanced
    const inner = m.slice(1, -1)
    if ((inner.match(/«/g)?.length ?? 0) !== (inner.match(/»/g)?.length ?? 0) || inner.indexOf('»') < inner.indexOf('«')) break
    m = inner.trim()
  }
  return m
}
