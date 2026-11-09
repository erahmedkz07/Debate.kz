// The site was updated while this tab stayed open: the page's parts now have new file names and the old ones are gone,
// so opening another page fails to load its part. One reload brings the new version (a ballot being typed is kept on
// the device, nothing is lost). At most once a minute, so a real outage never turns into a reload loop.
const KEY = 'stale-build-reload'
const MESSAGES = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically/i

export const isStaleBuild = (error: unknown) => MESSAGES.test(String((error as Error)?.message ?? error))

export function reloadForNewBuild() {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // no storage: reload anyway, the browser keeps nothing that could loop
  }
  location.reload()
  return true
}

// Vite tells about a part that failed to load before React even sees it
export function watchStaleBuild() {
  window.addEventListener('vite:preloadError', e => { if (reloadForNewBuild()) e.preventDefault() })
}
