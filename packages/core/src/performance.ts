import { round, addDays, type ISODate } from './dates';
import type { ActivityType } from './types';

export interface SetLog {
  weight_kg: number | null;
  reps: number | null;
  rir?: number | null;
  completed: boolean;
}

/** 1RM estimado (Epley). Pouco confiável acima de ~12 reps; nesses casos retorna null. */
export function e1rm(weight: number, reps: number): number | null {
  if (!weight || !reps || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : round(weight * (1 + reps / 30), 1);
}

export function setsVolume(sets: SetLog[]): number {
  return round(
    sets.filter((s) => s.completed && s.weight_kg && s.reps).reduce((a, s) => a + (s.weight_kg as number) * (s.reps as number), 0),
  );
}

export function bestSet(sets: SetLog[]): { weight_kg: number; reps: number; e1rm: number | null } | null {
  let best: { weight_kg: number; reps: number; e1rm: number | null } | null = null;
  for (const s of sets) {
    if (!s.completed || !s.weight_kg || !s.reps) continue;
    const est = e1rm(s.weight_kg, s.reps);
    const score = est ?? s.weight_kg;
    const bestScore = best ? best.e1rm ?? best.weight_kg : -1;
    if (score > bestScore) best = { weight_kg: s.weight_kg, reps: s.reps, e1rm: est };
  }
  return best;
}

/**
 * Progressão dupla: se TODAS as séries da última sessão atingiram o topo da faixa de repetições
 * com RIR ≥ 1, sugere subir a carga. Caso contrário mantém e busca mais repetições.
 */
export function suggestNextLoad(
  lastSets: SetLog[],
  repMax: number,
  increment = 2.5,
): { weight_kg: number | null; reason: string } {
  const done = lastSets.filter((s) => s.completed && s.weight_kg && s.reps);
  if (!done.length) return { weight_kg: null, reason: 'Sem histórico: escolha uma carga que deixe 2–3 repetições em reserva.' };
  const topWeight = Math.max(...done.map((s) => s.weight_kg as number));
  const atTop = done.filter((s) => s.weight_kg === topWeight);
  const allHitTop = atTop.length === done.length && atTop.every((s) => (s.reps as number) >= repMax && (s.rir == null || s.rir >= 1));
  if (allHitTop) return { weight_kg: round(topWeight + increment, 1), reason: `Bateu ${repMax} reps em todas as séries — suba ${increment} kg.` };
  return { weight_kg: topWeight, reason: 'Mantenha a carga e busque mais repetições.' };
}

/** Carga interna da sessão (session-RPE de Foster): RPE × minutos, em unidades arbitrárias. */
export function sessionLoad(rpe: number | null | undefined, minutes: number | null | undefined): number {
  if (!rpe || !minutes) return 0;
  return round(rpe * minutes);
}

export interface LoadSession {
  date: ISODate;
  type: ActivityType;
  rpe: number | null;
  duration_min: number | null;
}

export function loadBetween(sessions: LoadSession[], from: ISODate, toInclusive: ISODate): number {
  return sessions.filter((s) => s.date >= from && s.date <= toInclusive).reduce((a, s) => a + sessionLoad(s.rpe, s.duration_min), 0);
}

/**
 * Compara a carga dos últimos 7 dias com a média semanal das 3 semanas anteriores.
 * Saltos > 30% são um alerta de prudência (não um limite científico rígido).
 */
export function loadTrend(sessions: LoadSession[], today: ISODate) {
  const current = loadBetween(sessions, addDays(today, -6), today);
  const prev = [1, 2, 3].map((w) => loadBetween(sessions, addDays(today, -6 - 7 * w), addDays(today, -7 * w)));
  const withData = prev.filter((p) => p > 0);
  const baseline = withData.length >= 2 ? round(withData.reduce((a, b) => a + b, 0) / withData.length) : null;
  const ratio = baseline ? round(current / baseline, 2) : null;
  let label: 'sem_base' | 'baixa' | 'estavel' | 'alta' = 'sem_base';
  if (ratio != null) label = ratio > 1.3 ? 'alta' : ratio < 0.7 ? 'baixa' : 'estavel';
  return { current, baseline, ratio, label };
}

export interface ExerciseSession {
  date: ISODate;
  sets: SetLog[];
}

/** Série histórica de um exercício: melhor série, e1RM e volume por sessão, com marcação de PR. */
export function exerciseProgression(sessions: ExerciseSession[]) {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  let bestE1 = 0;
  let bestWeight = 0;
  return sorted
    .map((s) => {
      const b = bestSet(s.sets);
      if (!b) return null;
      const score = b.e1rm ?? b.weight_kg;
      const isPR = score > bestE1;
      const isWeightPR = b.weight_kg > bestWeight;
      bestE1 = Math.max(bestE1, score);
      bestWeight = Math.max(bestWeight, b.weight_kg);
      return { date: s.date, top_weight: b.weight_kg, top_reps: b.reps, e1rm: b.e1rm, volume: setsVolume(s.sets), isPR, isWeightPR };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

/**
 * Tendência de força: compara o melhor e1RM das últimas 2 semanas com as 2–4 semanas anteriores,
 * por exercício, e agrega. Retorna 'subindo' / 'estavel' / 'caindo' / null (dados insuficientes).
 */
export function strengthTrend(byExercise: Record<string, ExerciseSession[]>, today: ISODate) {
  const recentFrom = addDays(today, -13);
  const prevFrom = addDays(today, -41);
  let up = 0;
  let down = 0;
  let compared = 0;
  for (const sessions of Object.values(byExercise)) {
    const best = (from: ISODate, to: ISODate) => {
      let m = 0;
      for (const s of sessions) {
        if (s.date < from || s.date > to) continue;
        const b = bestSet(s.sets);
        if (b) m = Math.max(m, b.e1rm ?? b.weight_kg);
      }
      return m;
    };
    const recent = best(recentFrom, today);
    const prev = best(prevFrom, addDays(recentFrom, -1));
    if (!recent || !prev) continue;
    compared++;
    const change = (recent - prev) / prev;
    if (change > 0.02) up++;
    else if (change < -0.03) down++;
  }
  if (compared < 2) return { trend: null as null | 'subindo' | 'estavel' | 'caindo', up, down, compared };
  const trend = down > up && down >= Math.ceil(compared / 3) ? 'caindo' : up > down ? 'subindo' : 'estavel';
  return { trend: trend as 'subindo' | 'estavel' | 'caindo', up, down, compared };
}
