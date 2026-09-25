// Thin fetch wrapper: JSON in/out, session cookie included, errors as ApiError
export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code)
  }
}

const BASE = import.meta.env.VITE_API_URL ?? '/api'

export async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'unknown_error', data?.details)
  return data as T
}

// multipart upload (e.g. avatar); the browser sets the boundary header itself
export async function upload<T>(path: string, form: FormData): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, { method: 'POST', credentials: 'include', body: form })
  } catch {
    throw new ApiError(0, 'network_error')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'unknown_error', data?.details)
  return data as T
}

export const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== 'all') p.set(k, String(v)) })
  const s = p.toString()
  return s ? `?${s}` : ''
}
