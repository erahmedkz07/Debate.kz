import type { ErrorRequestHandler, RequestHandler } from 'express'
import { HttpError } from '../lib/errors.js'
import { isProd } from '../lib/env.js'

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'not_found' })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, details: err.details })
    return
  }
  // multer: file too large / too many files
  if (err?.name === 'MulterError') {
    res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_image' })
    return
  }
  // malformed JSON body
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error', ...(isProd ? {} : { message: String(err?.message ?? err) }) })
}
