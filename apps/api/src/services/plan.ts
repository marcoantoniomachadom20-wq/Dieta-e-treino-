import {
  addDays,
  weekStart as weekStartOf,
  weekday,
  planWeek,
  sessionAdvice,
  suggestNextLoad,
  loadTrend,
  ACTIVITY_LABELS,
  type ActivityType,
  type PlannerSport,
  type RecoveryStatus,
  type SetLog,
} from '@app/core';
import type { DB } from '../db';
import { getUser, httpError, userToday, type UserRow } from './users';

interface WorkoutRow {
  id: number;
  type: ActivityType;
  template_id: number | null;
  date: string;
  planned_time: string | null;
  status: string;
  optional: number;
  rpe: number | null;
  duration_min: number | null;
  locked: number;
  origin: string;
}

function templates(db: DB, userId: number) {
  return db
    .prepare('SELECT id, code, name, lower_load, upper_load FROM workout_templates WHERE user_id = ? AND active = 1 ORDER BY code')
    .all(userId) as { id: number; code: string; name: string; lower_load: number; upper_load: number }[];
}

/** Esportes do modelo semanal projetados para uma data (sem gravar). */
function scheduledSportsFor(db: DB, userId: number, date: string): PlannerSport[] {
  const rows = db.prepare('SELECT type, time, duration_min, optional FROM schedule_template WHERE user_id = ? AND weekday = ?').all(userId, weekday(date)) as {
    type: ActivityType;
    time: string | null;
    duration_min: number | null;
    optional: number;
  }[];
  return rows.map((r) => ({ date, type: r.type, time: r.time, duration_min: r.duration_min, optional: !!r.optional }));
}

/** Gera a agenda da semana (esportes do modelo + musculação planejada) se ainda não existir. */
export function ensureWeekPlan(db: DB, user: UserRow, weekStart: string) {
  const today = userToday(user);
  const exists = db.prepare('SELECT 1 FROM planned_weeks WHERE user_id = ? AND week_start = ?').get(user.id, weekStart);
  if (exists) return;
  // Não inventa passado: semanas já encerradas não são planejadas retroativamente.
  if (addDays(weekStart, 6) < today) return;
  db.transaction(() => {
    db.prepare('INSERT INTO planned_weeks (user_id, week_start) VALUES (?, ?)').run(user.id, weekStart);
    const ins = db.prepare(
      `INSERT INTO workouts (user_id, type, date, planned_time, optional, origin, status, duration_min)
       VALUES (?, ?, ?, ?, ?, 'plano', 'planejado', NULL)`,
    );
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (d < today) continue;
      for (const s of scheduledSportsFor(db, user.id, d)) ins.run(user.id, s.type, d, s.time, s.optional ? 1 : 0);
    }
    replanLifts(db, user, weekStart, today);
  })();
}

export interface ReplanResult {
  placed: { date: string; code: string; time: string; reasons: string[] }[];
  dropped: { code: string; reason: string }[];
}

/**
 * Recalcula a musculação ainda não feita da semana a partir de `fromDate`.
 * Sessões concluídas, em andamento, puladas ou movidas manualmente (locked) são preservadas.
 */
export function replanLifts(db: DB, user: UserRow, weekStart: string, fromDate: string): ReplanResult {
  const weekEnd = addDays(weekStart, 6);
  const tpls = templates(db, user.id);
  const codeById = new Map(tpls.map((t) => [t.id, t.code]));

  db.prepare(
    `DELETE FROM workouts WHERE user_id = ? AND type = 'musculacao' AND status = 'planejado' AND locked = 0
       AND origin = 'plano' AND date >= ? AND date <= ?`,
  ).run(user.id, fromDate, weekEnd);

  const ctxFrom = addDays(weekStart, -2);
  const ctxTo = addDays(weekEnd, 3);
  const rows = db.prepare('SELECT * FROM workouts WHERE user_id = ? AND date >= ? AND date <= ?').all(user.id, ctxFrom, ctxTo) as WorkoutRow[];

  const sports: PlannerSport[] = rows
    .filter((r) => r.type !== 'musculacao')
    .map((r) => ({ date: r.date, type: r.type, time: r.planned_time, duration_min: r.duration_min, optional: !!r.optional, status: r.status as PlannerSport['status'], rpe: r.rpe }));
  // Dias de contexto ainda sem agenda gravada (próxima semana): usa o modelo.
  for (let d = addDays(weekEnd, 1); d <= ctxTo; d = addDays(d, 1)) {
    if (!rows.some((r) => r.date === d && r.type !== 'musculacao')) sports.push(...scheduledSportsFor(db, user.id, d));
  }

  const doneLifts = rows
    .filter((r) => r.type === 'musculacao' && r.template_id && (r.status === 'concluido' || r.status === 'em_andamento' || (r.status === 'planejado' && r.locked)))
    .map((r) => ({ date: r.date, code: codeById.get(r.template_id!) ?? '?' }));
  // Dias que já têm musculação concluída fora do programa também ficam ocupados.
  for (const r of rows) {
    if (r.type === 'musculacao' && !r.template_id && r.status === 'concluido') doneLifts.push({ date: r.date, code: 'extra' });
  }

  const today = userToday(user);
  const rec = db.prepare('SELECT status FROM recovery_checkins WHERE user_id = ? AND date = ?').get(user.id, today) as { status: RecoveryStatus } | undefined;

  const result = planWeek({
    weekStart,
    fromDate,
    sports,
    templates: tpls,
    doneLifts,
    availability: JSON.parse(user.lift_availability),
    targetSessions: user.lift_target_per_week,
    readiness: rec ? { date: today, status: rec.status } : null,
  });

  const tplByCode = new Map(tpls.map((t) => [t.code, t]));
  const ins = db.prepare(
    `INSERT INTO workouts (user_id, type, template_id, date, planned_time, planned_slot, origin, status, plan_reason)
     VALUES (?, 'musculacao', ?, ?, ?, ?, 'plano', 'planejado', ?)`,
  );
  for (const s of result.sessions) {
    ins.run(user.id, tplByCode.get(s.code)!.id, s.date, s.time, s.slot, JSON.stringify(s.reasons));
  }
  return { placed: result.sessions.map((s) => ({ date: s.date, code: s.code, time: s.time, reasons: s.reasons })), dropped: result.dropped };
}

/** "Não consegui treinar": marca como pulado e reorganiza o restante da semana sem duplicar sessões. */
export function skipWorkout(db: DB, userId: number, workoutId: number, reason?: string) {
  const user = getUser(db, userId);
  const w = db.prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?').get(workoutId, userId) as WorkoutRow | undefined;
  if (!w) throw httpError(404, 'Sessão não encontrada');
  if (w.status === 'concluido') throw httpError(409, 'Sessão já concluída');
  return db.transaction(() => {
    db.prepare(`UPDATE workouts SET status = 'pulado', locked = 0, notes = COALESCE(?, notes) WHERE id = ?`).run(reason ?? null, workoutId);
    // Exercícios de uma sessão iniciada e abandonada são descartados.
    db.prepare('DELETE FROM workout_exercises WHERE workout_id = ?').run(workoutId);
    const today = userToday(user);
    const ws = weekStartOf(w.date);
    const from = addDays(w.date > today ? w.date : today, 1);
    if (from > addDays(ws, 6)) return { placed: [], dropped: [], message: 'Era o último dia da semana — a sessão não será reposta.' };
    const r = replanLifts(db, user, ws, from);
    return { ...r, message: r.dropped.length ? r.dropped.map((d) => d.reason).join(' ') : 'Semana reorganizada.' };
  })();
}

/** Contexto de prontidão do dia para ajustar o treino. */
export function readinessContext(db: DB, user: UserRow, date: string) {
  const rec = db.prepare('SELECT status FROM recovery_checkins WHERE user_id = ? AND date = ?').get(user.id, date) as { status: RecoveryStatus } | undefined;
  const sports = db
    .prepare(`SELECT type, planned_time, date FROM workouts WHERE user_id = ? AND type != 'musculacao' AND status != 'pulado' AND date IN (?, ?)`)
    .all(user.id, date, addDays(date, 1)) as { type: ActivityType; planned_time: string | null; date: string }[];
  const loadRows = db
    .prepare(`SELECT date, type, rpe, duration_min FROM workouts WHERE user_id = ? AND status = 'concluido' AND date >= ? AND date <= ?`)
    .all(user.id, addDays(date, -27), date) as { date: string; type: ActivityType; rpe: number | null; duration_min: number | null }[];
  return {
    recovery: rec?.status ?? null,
    sportLaterToday: sports.find((s) => s.date === date)?.type ?? null,
    sportTomorrow: sports.find((s) => s.date === addDays(date, 1))?.type ?? null,
    load: loadTrend(loadRows, date),
  };
}

/** Inicia uma sessão de musculação: copia o template, ajusta pelo contexto do dia e sugere cargas. */
export function startWorkout(db: DB, userId: number, workoutId: number, nowIso: string) {
  const user = getUser(db, userId);
  const w = db.prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?').get(workoutId, userId) as WorkoutRow | undefined;
  if (!w) throw httpError(404, 'Sessão não encontrada');
  if (w.status === 'concluido') throw httpError(409, 'Sessão já concluída');
  if (w.status === 'em_andamento') return { advice: null };
  const today = userToday(user);
  return db.transaction(() => {
    // Treino feito em outro dia: move para hoje.
    db.prepare(`UPDATE workouts SET status = 'em_andamento', started_at = ?, date = ? WHERE id = ?`).run(nowIso, today, workoutId);
    if (w.type !== 'musculacao' || !w.template_id) return { advice: null };
    const tpl = db.prepare('SELECT code, lower_load FROM workout_templates WHERE id = ?').get(w.template_id) as { code: string; lower_load: number };
    const ctx = readinessContext(db, user, today);
    const advice = sessionAdvice({ template: tpl, recovery: ctx.recovery, sportLaterToday: ctx.sportLaterToday, sportTomorrow: ctx.sportTomorrow, loadTrend: ctx.load.label });
    const exercises = db.prepare('SELECT * FROM template_exercises WHERE template_id = ? ORDER BY position').all(w.template_id) as {
      name: string;
      sets: number;
      rep_min: number;
      rep_max: number;
      lower: number;
      position: number;
    }[];
    const insEx = db.prepare(
      `INSERT INTO workout_exercises (workout_id, position, name, target_sets, rep_min, rep_max, lower, suggested_weight, suggestion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insSet = db.prepare('INSERT INTO exercise_sets (workout_exercise_id, set_number, weight_kg) VALUES (?, ?, ?)');
    for (const e of exercises) {
      const delta = e.lower ? advice.lowerSetsDelta : advice.upperSetsDelta;
      const sets = Math.max(e.sets > 2 ? 2 : 1, e.sets + delta);
      const last = lastSetsFor(db, userId, e.name, workoutId);
      const sug = suggestNextLoad(last, e.rep_max, e.lower ? 5 : 2.5);
      const exId = Number(insEx.run(workoutId, e.position, e.name, sets, e.rep_min, e.rep_max, e.lower, sug.weight_kg, sug.reason).lastInsertRowid);
      for (let i = 1; i <= sets; i++) insSet.run(exId, i, sug.weight_kg);
    }
    return { advice };
  })();
}

/** Séries da última sessão concluída em que o exercício apareceu. */
export function lastSetsFor(db: DB, userId: number, exerciseName: string, excludeWorkoutId?: number): SetLog[] {
  const we = db
    .prepare(
      `SELECT we.id FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
       WHERE w.user_id = ? AND w.status = 'concluido' AND we.name = ? AND w.id != ?
       ORDER BY w.date DESC, w.id DESC LIMIT 1`,
    )
    .get(userId, exerciseName, excludeWorkoutId ?? -1) as { id: number } | undefined;
  if (!we) return [];
  return (db.prepare('SELECT weight_kg, reps, rir, completed FROM exercise_sets WHERE workout_exercise_id = ? ORDER BY set_number').all(we.id) as any[]).map(
    (s) => ({ ...s, completed: !!s.completed }),
  );
}

export function sportLabel(t: ActivityType) {
  return ACTIVITY_LABELS[t];
}
