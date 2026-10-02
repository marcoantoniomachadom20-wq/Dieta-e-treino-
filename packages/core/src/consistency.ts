import { addDays, type ISODate } from './dates';

export interface DayCompliance {
  date: ISODate;
  foodLogged: boolean;
  /** Sessões obrigatórias planejadas para o dia */
  plannedRequired: number;
  /** Quantas delas foram concluídas */
  completedRequired: number;
  /** Alguma sessão obrigatória marcada como "não consegui"? */
  skippedRequired: number;
}

/**
 * Um dia "conta" para a sequência quando: houve registro alimentar E nenhuma sessão obrigatória
 * planejada ficou sem fazer. Pular um treino quebra a sequência; descanso planejado não quebra.
 * Hoje só entra na contagem se já estiver cumprido (senão a sequência vem até ontem).
 */
export function dayCounts(d: DayCompliance): boolean {
  return d.foodLogged && d.skippedRequired === 0 && d.completedRequired >= d.plannedRequired;
}

export function computeStreak(days: DayCompliance[], today: ISODate): number {
  const map = new Map(days.map((d) => [d.date, d]));
  let streak = 0;
  let cursor = today;
  const todayInfo = map.get(today);
  if (!todayInfo || !dayCounts(todayInfo)) cursor = addDays(today, -1);
  for (;;) {
    const d = map.get(cursor);
    if (!d || !dayCounts(d)) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Semanas consecutivas (terminadas) em que a meta de musculação foi batida. */
export function weeklyLiftStreak(weeks: { weekStart: ISODate; lifts: number }[], target: number): number {
  const sorted = [...weeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  let s = 0;
  for (const w of sorted) {
    if (w.lifts >= target) s++;
    else break;
  }
  return s;
}
