/**
 * Datas do domínio são sempre strings ISO "YYYY-MM-DD" representando o dia LOCAL
 * do usuário. Toda aritmética é feita em UTC para não sofrer com fuso/horário de verão.
 */
export type ISODate = string;

const DAY_MS = 86_400_000;

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(new Date(parseISO(d).getTime() + n * DAY_MS));
}

/** b - a, em dias. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(d: ISODate): number {
  return parseISO(d).getUTCDay();
}

/** Segunda-feira da semana de `d`. */
export function weekStart(d: ISODate): ISODate {
  const wd = weekday(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

export function rangeDays(start: ISODate, endInclusive: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= endInclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthRange(year: number, month1: number): { start: ISODate; end: ISODate } {
  const start = toISO(new Date(Date.UTC(year, month1 - 1, 1)));
  const end = toISO(new Date(Date.UTC(year, month1, 0)));
  return { start, end };
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(parseISO(s)) === s;
}

/** Data local (YYYY-MM-DD) em um fuso IANA. */
export function todayInTz(tz: string, now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Hora local "HH:MM" em um fuso IANA. */
export function timeInTz(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

export const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Regressão linear simples. Retorna inclinação por unidade de x. */
export function linearSlope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const mx = mean(points.map((p) => p.x))!;
  const my = mean(points.map((p) => p.y))!;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}
