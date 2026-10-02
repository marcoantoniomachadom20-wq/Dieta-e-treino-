import { z } from 'zod';
import { isValidISODate } from '@app/core';

export const isoDate = z.string().refine(isValidISODate, 'Data inválida (use AAAA-MM-DD)');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (HH:MM)');
export const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Valida e lança 400 com mensagens legíveis. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
    throw Object.assign(new Error(msg), { statusCode: 400 });
  }
  return r.data;
}

export const notFound = (what = 'Registro') => Object.assign(new Error(`${what} não encontrado`), { statusCode: 404 });
