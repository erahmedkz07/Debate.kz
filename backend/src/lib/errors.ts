// Error with an HTTP status and a stable machine-readable code for the frontend
export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code)
  }
}

export const badRequest = (code: string, details?: unknown) => new HttpError(400, code, code, details)
export const unauthorized = (code = 'unauthorized') => new HttpError(401, code)
export const forbidden = (code = 'forbidden') => new HttpError(403, code)
export const notFound = (code = 'not_found') => new HttpError(404, code)
export const conflict = (code: string) => new HttpError(409, code)
