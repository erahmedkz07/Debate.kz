import type { Request } from 'express'
import type { z } from 'zod'
import { badRequest } from '../lib/errors.js'

// Parse and validate request parts with zod; throws 400 with field errors
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data)
  if (!r.success) throw badRequest('validation_error', r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })))
  return r.data
}

export const body = <T extends z.ZodType>(req: Request, schema: T) => parse(schema, req.body)
export const query = <T extends z.ZodType>(req: Request, schema: T) => parse(schema, req.query)

// Express 5 types params as string | string[]; route params here are always single strings
export const param = (req: Request, name: string) => String(req.params[name])
