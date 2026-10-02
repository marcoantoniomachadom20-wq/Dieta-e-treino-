import {
  addDays,
  weekStart as weekStartOf,
  sumMacros,
  dailyProgress,
  weightStats,
  weeklyRate,
  movingAverageAt,
  estimateDailyExpenditure,
  energyBalance,
  adaptiveMaintenance,
  computeStreak,
  weeklyLiftStreak,
  generateInsights,
  buildWeeklyReport,
  exerciseProgression,
  strengthTrend,
  loadTrend,
  loadBetween,
  goalProgress,
  mean,
  round,
  diffDays,
  type ActivityType,
  type ExerciseSession,
  type Macros,
  type DayCompliance,
  type GoalKind,
} from '@app/core';
import type { DB } from '../db';
import { getUser, latestWeight, targetsFor, userToday, type UserRow } from './users';

// ---------- Nutrição ----------

export function foodEntries(db: DB, userId: number, date: string) {
  return db.prepare('SELECT * FROM food_entries WHERE user_id = ? AND date = ? ORDER BY created_at').all(userId, date) as (Macros & {
    id: number;
    meal: string;
    name: string;
    quantity_g: number;
    source: string;
    ai_confidence: number | null;
  })[];
}

export function dayNutrition(db: DB, userId: number, date: string) {
  const entries = foodEntries(db, userId, date);
  const totals = sumMacros(entries);
  const targets = targetsFor(db, userId, date);
  const water = (db.prepare('SELECT COALESCE(SUM(ml),0) AS ml FROM water_entries WHERE user_id = ? AND date = ?').get(userId, date) as { ml: number }).ml;
  return {
    date,
    entries,
    totals,
    targets,
    progress: dailyProgress(totals, targets),
    water: { consumed: water, target: targets.water_ml },
    mealsLogged: new Set(entries.map((e) => e.meal)).size,
  };
}

/** Totais diários num intervalo (somente dias com registro). */
export function dailyTotals(db: DB, userId: number, from: string, to: string) {
  return db
    .prepare(
      `SELECT date, SUM(calories) calories, SUM(protein) protein, SUM(carbs) carbs, SUM(fat) fat, COUNT(DISTINCT meal) meals
       FROM food_entries WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
    )
    .all(userId, from, to) as (Macros & { date: string; meals: number })[];
}

// ---------- Treino ----------

export interface SessionRow {
  id: number;
  type: ActivityType;
  date: string;
  status: string;
  rpe: number | null;
  duration_min: number | null;
  calories: number | null;
  optional: number;
  volume_kg: number | null;
  template_id: number | null;
  planned_time: string | null;
}

export function sessionsBetween(db: DB, userId: number, from: string, to: string) {
  return db.prepare('SELECT * FROM workouts WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, planned_time').all(userId, from, to) as SessionRow[];
}

/** Histórico por exercício (sessões concluídas). */
export function liftHistory(db: DB, userId: number, from = '0000-01-01'): Record<string, ExerciseSession[]> {
  const rows = db
    .prepare(
      `SELECT w.date, we.id AS we_id, we.name, s.weight_kg, s.reps, s.rir, s.completed
       FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id JOIN exercise_sets s ON s.workout_exercise_id = we.id
       WHERE w.user_id = ? AND w.status = 'concluido' AND w.date >= ? ORDER BY w.date, we.id, s.set_number`,
    )
    .all(userId, from) as { date: string; we_id: number; name: string; weight_kg: number | null; reps: number | null; rir: number | null; completed: number }[];
  const byName: Record<string, Map<number, ExerciseSession>> = {};
  for (const r of rows) {
    const m = (byName[r.name] ??= new Map());
    if (!m.has(r.we_id)) m.set(r.we_id, { date: r.date, sets: [] });
    m.get(r.we_id)!.sets.push({ weight_kg: r.weight_kg, reps: r.reps, rir: r.rir, completed: !!r.completed });
  }
  return Object.fromEntries(Object.entries(byName).map(([k, v]) => [k, [...v.values()]]));
}

// ---------- Consistência ----------

export function complianceDays(db: DB, userId: number, from: string, to: string): DayCompliance[] {
  const logged = new Set((db.prepare('SELECT DISTINCT date FROM food_entries WHERE user_id = ? AND date BETWEEN ? AND ?').all(userId, from, to) as { date: string }[]).map((r) => r.date));
  const sessions = sessionsBetween(db, userId, from, to);
  const out: DayCompliance[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const req = sessions.filter((s) => s.date === d && !s.optional);
    out.push({
      date: d,
      foodLogged: logged.has(d),
      plannedRequired: req.length,
      completedRequired: req.filter((s) => s.status === 'concluido').length,
      skippedRequired: req.filter((s) => s.status === 'pulado').length,
    });
  }
  return out;
}

export function streaks(db: DB, user: UserRow, today: string) {
  const from = addDays(today, -120);
  const days = complianceDays(db, user.id, from, today);
  const lifts = db
    .prepare(`SELECT date FROM workouts WHERE user_id = ? AND type = 'musculacao' AND status = 'concluido' AND date >= ?`)
    .all(user.id, from) as { date: string }[];
  const thisWeek = weekStartOf(today);
  const weeks: { weekStart: string; lifts: number }[] = [];
  for (let w = addDays(thisWeek, -7); w >= weekStartOf(from); w = addDays(w, -7)) {
    weeks.push({ weekStart: w, lifts: lifts.filter((l) => weekStartOf(l.date) === w).length });
  }
  return { days: computeStreak(days, today), liftWeeks: weeklyLiftStreak(weeks, user.lift_target_per_week) };
}

// ---------- Energia ----------

export function energyFor(db: DB, user: UserRow, date: string) {
  const device = db.prepare('SELECT * FROM energy_logs WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(user.id, date) as
    | { total_calories: number | null; active_calories: number | null; steps: number | null }
    | undefined;
  const weight = latestWeight(db, user.id, date)?.weight_kg ?? user.initial_weight_kg;
  const sessions = sessionsBetween(db, user.id, date, date).filter((s) => s.status === 'concluido');
  const expenditure = estimateDailyExpenditure({ sex: user.sex, weightKg: weight, heightCm: user.height_cm, age: user.age, device: device ?? null, sessions });
  const n = dayNutrition(db, user.id, date);
  const today = userToday(user);
  const balance = energyBalance({ intakeKcal: n.totals.calories, mealsLogged: n.mealsLogged, dayClosed: date < today, expenditure });
  return { device: device ?? null, balance };
}

export function adaptiveEstimate(db: DB, user: UserRow, today: string) {
  const from = addDays(today, -27);
  const totals = new Map(dailyTotals(db, user.id, from, addDays(today, -1)).map((t) => [t.date, t]));
  const weights = new Map(
    (db.prepare('SELECT date, weight_kg FROM weight_entries WHERE user_id = ? AND date BETWEEN ? AND ?').all(user.id, from, today) as { date: string; weight_kg: number }[]).map((w) => [w.date, w.weight_kg]),
  );
  const days = [];
  for (let d = from; d < today; d = addDays(d, 1)) {
    const t = totals.get(d);
    // Dias com só 1 refeição registrada provavelmente estão incompletos: descartados.
    days.push({ date: d, intake: t && t.meals >= 2 ? t.calories : null, weight: weights.get(d) ?? null });
  }
  return adaptiveMaintenance(days);
}

// ---------- Peso ----------

export function weights(db: DB, userId: number) {
  return db.prepare('SELECT id, date, weight_kg, notes FROM weight_entries WHERE user_id = ? ORDER BY date').all(userId) as {
    id: number;
    date: string;
    weight_kg: number;
    notes: string | null;
  }[];
}

// ---------- Recuperação ----------

export function recoveryBetween(db: DB, userId: number, from: string, to: string) {
  return db.prepare('SELECT * FROM recovery_checkins WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(userId, from, to) as {
    date: string;
    score: number;
    status: string;
    sleep_hours: number | null;
  }[];
}

// ---------- Insights ----------

export function insights(db: DB, user: UserRow, today: string) {
  const ws = weights(db, user.id);
  const totals = dailyTotals(db, user.id, addDays(today, -6), today);
  const targets = targetsFor(db, user.id, today);
  const rec3 = recoveryBetween(db, user.id, addDays(today, -2), today);
  const rec7 = recoveryBetween(db, user.id, addDays(today, -6), today);
  const loadRows = sessionsBetween(db, user.id, addDays(today, -27), today).filter((s) => s.status === 'concluido');
  const lt = loadTrend(loadRows, today);
  const wk = weekStartOf(today);
  const liftsThisWeek = sessionsBetween(db, user.id, wk, addDays(wk, 6)).filter((s) => s.type === 'musculacao' && s.status === 'concluido').length;
  const st = strengthTrend(liftHistory(db, user.id, addDays(today, -42)), today);
  const fullDays = totals.filter((t) => t.meals >= 2);
  return generateInsights({
    goal: user.goal,
    weightRate: weeklyRate(ws, today, 28),
    previousWeightRate: weeklyRate(ws, addDays(today, -28), 28),
    strengthTrend: st.trend,
    avgProtein7d: mean(fullDays.map((t) => t.protein)),
    proteinTarget: targets.protein,
    avgCalories7d: mean(fullDays.map((t) => t.calories)),
    calorieTarget: targets.calories,
    daysFoodLogged7d: fullDays.length,
    avgRecoveryScore3d: rec3.length >= 2 ? mean(rec3.map((r) => r.score)) : null,
    avgSleepHours7d: mean(rec7.filter((r) => r.sleep_hours).map((r) => r.sleep_hours!)),
    loadTrend: { label: lt.label, ratio: lt.ratio },
    liftsThisWeek,
    liftTarget: user.lift_target_per_week,
    daysLeftInWeek: diffDays(today, addDays(wk, 6)),
  });
}

// ---------- Relatório semanal ----------

export function weeklyReport(db: DB, user: UserRow, weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const prevStart = addDays(weekStart, -7);
  const ws = weights(db, user.id);
  const inWeek = ws.filter((w) => w.date >= weekStart && w.date <= weekEnd);
  const inPrev = ws.filter((w) => w.date >= prevStart && w.date < weekStart);
  const totals = dailyTotals(db, user.id, weekStart, weekEnd);
  const full = totals.filter((t) => t.meals >= 2);
  const onTarget = full.filter((t) => {
    const tg = targetsFor(db, user.id, t.date);
    return Math.abs(t.calories - tg.calories) <= tg.calories * 0.1 && t.protein >= tg.protein * 0.9;
  }).length;
  const targets = targetsFor(db, user.id, weekEnd);
  const sessions = sessionsBetween(db, user.id, weekStart, weekEnd);
  // Planejado = o que a agenda previa (inclui pulados). Na semana em que a conta foi criada,
  // só conta a partir do cadastro — não cobra a meta cheia de dias que não existiam no sistema.
  const created = user.created_at.slice(0, 10);
  const daysActive = Math.min(7, Math.max(0, diffDays(created > weekStart ? created : weekStart, weekEnd) + 1));
  const count = (type: ActivityType) => {
    const done = sessions.filter((s) => s.type === type && s.status === 'concluido').length;
    const scheduled = sessions.filter((s) => s.type === type && !s.optional && s.status !== 'em_andamento').length;
    const target = type === 'musculacao' ? Math.round((user.lift_target_per_week * daysActive) / 7) : 0;
    return { done, planned: Math.max(done, scheduled, target) };
  };
  const vol = (from: string, to: string) =>
    (db.prepare(`SELECT COALESCE(SUM(volume_kg),0) v FROM workouts WHERE user_id = ? AND type='musculacao' AND status='concluido' AND date BETWEEN ? AND ?`).get(user.id, from, to) as { v: number }).v;
  const rec = recoveryBetween(db, user.id, weekStart, weekEnd);
  const history = liftHistory(db, user.id);
  const prs: { exercise: string; weight: number; reps: number }[] = [];
  for (const [name, list] of Object.entries(history)) {
    for (const p of exerciseProgression(list)) {
      if (p.isPR && p.date >= weekStart && p.date <= weekEnd && list.length > 1 && list[0].date < p.date) prs.push({ exercise: name, weight: p.top_weight, reps: p.top_reps });
    }
  }
  const st = strengthTrend(history, weekEnd);
  return buildWeeklyReport({
    weekStart,
    weekEnd,
    avgWeight: inWeek.length ? round(mean(inWeek.map((w) => w.weight_kg))!, 1) : null,
    prevAvgWeight: inPrev.length ? round(mean(inPrev.map((w) => w.weight_kg))!, 1) : null,
    weighIns: inWeek.length,
    avgCalories: mean(full.map((t) => t.calories)),
    avgProtein: mean(full.map((t) => t.protein)),
    calorieTarget: targets.calories,
    proteinTarget: targets.protein,
    daysLogged: full.length,
    daysOnTarget: onTarget,
    lifts: count('musculacao'),
    futevolei: count('futevolei'),
    tenis: count('tenis'),
    liftVolume: round(vol(weekStart, weekEnd)),
    prevLiftVolume: round(vol(prevStart, addDays(weekStart, -1))) || null,
    avgRecovery: mean(rec.map((r) => r.score)),
    avgSleep: mean(rec.filter((r) => r.sleep_hours).map((r) => r.sleep_hours!)),
    strengthTrend: st.trend,
    prs,
    skipped: sessions.filter((s) => s.status === 'pulado' && !s.optional).length,
  });
}

// ---------- Metas ----------

export function goalsWithProgress(db: DB, user: UserRow, today: string) {
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? AND active = 1 ORDER BY horizon, id').all(user.id) as {
    id: number;
    horizon: string;
    kind: GoalKind;
    title: string;
    target_value: number;
    start_value: number | null;
    current_manual: number | null;
    unit: string | null;
    exercise_name: string | null;
    deadline: string | null;
  }[];
  const wk = weekStartOf(today);
  const weekSessions = sessionsBetween(db, user.id, wk, addDays(wk, 6));
  const weekTotals = dailyTotals(db, user.id, wk, today);
  const ws = weights(db, user.id);
  const monthStart = today.slice(0, 8) + '01';
  const firstMeasurement = db.prepare('SELECT waist FROM body_measurements WHERE user_id = ? AND waist IS NOT NULL ORDER BY date LIMIT 1').get(user.id) as { waist: number } | undefined;
  const lastMeasurement = db.prepare('SELECT waist FROM body_measurements WHERE user_id = ? AND waist IS NOT NULL ORDER BY date DESC LIMIT 1').get(user.id) as { waist: number } | undefined;
  const history = liftHistory(db, user.id);

  return goals.map((g) => {
    let current: number | null = null;
    let start = g.start_value;
    switch (g.kind) {
      case 'musculacao_semana':
        current = weekSessions.filter((s) => s.type === 'musculacao' && s.status === 'concluido').length;
        break;
      case 'proteina_semana':
        current = weekTotals.filter((t) => t.protein >= targetsFor(db, user.id, t.date).protein * 0.9).length;
        break;
      case 'registro_semana':
        current = weekTotals.filter((t) => t.meals >= 2).length;
        break;
      case 'sono_semana': {
        const r = recoveryBetween(db, user.id, wk, today).filter((x) => x.sleep_hours);
        current = r.length ? round(mean(r.map((x) => x.sleep_hours!))!, 1) : null;
        break;
      }
      case 'peso_alvo':
        current = movingAverageAt(ws, today, 7) ?? ws.at(-1)?.weight_kg ?? null;
        start ??= user.initial_weight_kg;
        break;
      case 'cintura_alvo':
        current = lastMeasurement?.waist ?? null;
        start ??= firstMeasurement?.waist ?? null;
        break;
      case 'carga_exercicio': {
        const prog = g.exercise_name ? exerciseProgression(history[g.exercise_name] ?? []) : [];
        current = prog.length ? Math.max(...prog.map((p) => p.top_weight)) : null;
        start ??= prog[0]?.top_weight ?? null;
        break;
      }
      case 'treinos_mes':
        current = (db.prepare(`SELECT COUNT(*) n FROM workouts WHERE user_id = ? AND status = 'concluido' AND date BETWEEN ? AND ?`).get(user.id, monthStart, today) as { n: number }).n;
        break;
    }
    const p = goalProgress({ kind: g.kind, target_value: g.target_value, start_value: start, current_manual: g.current_manual }, current);
    // Meta de redução sem valor inicial conhecido: não dá para calcular progresso honestamente.
    const unknown = (g.kind === 'cintura_alvo' || g.kind === 'peso_alvo' || g.kind === 'carga_exercicio') && start == null;
    return { ...g, start_value: start, current: p.current, pct: unknown ? null : p.pct };
  });
}

// ---------- Dashboard ----------

export function dashboard(db: DB, userId: number, date?: string) {
  const user = getUser(db, userId);
  const today = date ?? userToday(user);
  const n = dayNutrition(db, userId, today);
  const ws = weights(db, userId);
  const sessions = sessionsBetween(db, userId, today, today);
  const recovery = db.prepare('SELECT * FROM recovery_checkins WHERE user_id = ? AND date = ?').get(userId, today) ?? null;
  const loadRows = sessionsBetween(db, userId, addDays(today, -27), today).filter((s) => s.status === 'concluido');
  const wk = weekStartOf(today);
  const week = sessionsBetween(db, userId, wk, addDays(wk, 6));
  const energy = energyFor(db, user, today);
  return {
    date: today,
    user: { name: user.name, goal: user.goal },
    nutrition: { totals: n.totals, targets: n.targets, progress: n.progress, water: n.water, mealsLogged: n.mealsLogged },
    weight: weightStats(ws, today, user.initial_weight_kg),
    sessions,
    recovery,
    energy,
    load: { ...loadTrend(loadRows, today), week: loadBetween(loadRows, wk, today) },
    week: {
      lifts: { done: week.filter((s) => s.type === 'musculacao' && s.status === 'concluido').length, target: user.lift_target_per_week },
      sports: { done: week.filter((s) => s.type !== 'musculacao' && s.status === 'concluido').length, planned: week.filter((s) => s.type !== 'musculacao' && !s.optional).length },
    },
    streak: streaks(db, user, today),
    insights: insights(db, user, today),
    isSunday: new Date(today + 'T12:00:00Z').getUTCDay() === 0,
  };
}
