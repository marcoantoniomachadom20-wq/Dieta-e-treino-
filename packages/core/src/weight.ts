import { round, mean, diffDays, addDays, linearSlope, type ISODate } from './dates';

export interface WeightEntry {
  date: ISODate;
  weight_kg: number;
}

/** Média dos registros dentro de [date-(window-1), date]. */
export function movingAverageAt(entries: WeightEntry[], date: ISODate, window: number): number | null {
  const from = addDays(date, -(window - 1));
  const vals = entries.filter((e) => e.date >= from && e.date <= date).map((e) => e.weight_kg);
  const m = mean(vals);
  return m == null ? null : round(m, 2);
}

export function weightSeries(entries: WeightEntry[]) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((e) => ({
    date: e.date,
    weight: e.weight_kg,
    avg7: movingAverageAt(sorted, e.date, 7),
  }));
}

/**
 * Taxa de variação semanal pela regressão linear dos últimos `days` dias.
 * Exige pelo menos 6 pesagens cobrindo ≥ 10 dias — abaixo disso é ruído.
 */
export function weeklyRate(entries: WeightEntry[], endDate: ISODate, days = 28) {
  const from = addDays(endDate, -(days - 1));
  const pts = entries.filter((e) => e.date >= from && e.date <= endDate);
  if (pts.length < 6) return null;
  const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
  if (diffDays(sorted[0].date, sorted[sorted.length - 1].date) < 10) return null;
  const slope = linearSlope(sorted.map((p) => ({ x: diffDays(from, p.date), y: p.weight_kg })));
  if (slope == null) return null;
  const kgPerWeek = round(slope * 7, 2);
  const ref = mean(sorted.map((p) => p.weight_kg))!;
  return { kgPerWeek, pctPerWeek: round((kgPerWeek / ref) * 100, 2), points: sorted.length, days };
}

export function weightStats(entries: WeightEntry[], today: ISODate, initialWeight?: number | null) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) {
    return { current: null, currentDate: null, initial: initialWeight ?? null, min: null, max: null, avg7: null, avg30: null, changeFromStart: null, changeFromStartAvg: null, rate: null };
  }
  const last = sorted[sorted.length - 1];
  const initial = initialWeight ?? sorted[0].weight_kg;
  const ws = sorted.map((e) => e.weight_kg);
  const avg7 = movingAverageAt(sorted, today, 7);
  const avg30 = movingAverageAt(sorted, today, 30);
  return {
    current: last.weight_kg,
    currentDate: last.date,
    initial,
    min: Math.min(...ws),
    max: Math.max(...ws),
    avg7,
    avg30,
    changeFromStart: round(last.weight_kg - initial, 1),
    /** Mais confiável que o valor pontual: média 7d vs inicial. */
    changeFromStartAvg: avg7 != null ? round(avg7 - initial, 1) : null,
    rate: weeklyRate(sorted, today),
  };
}
