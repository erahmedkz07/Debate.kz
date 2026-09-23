import { useCallback, useEffect, useState } from 'react'

// Tiny data-fetching hook: { data, loading, error, reload }
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: Error }>({ loading: true })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setState(s => ({ data: s.data, loading: true }))
    fn().then(
      data => alive && setState({ data, loading: false }),
      error => alive && setState({ loading: false, error }),
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { ...state, reload }
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = useCallback(() => {
    setDark(d => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch { /* private mode */ }
      return next
    })
  }, [])
  return { dark, toggle }
}
