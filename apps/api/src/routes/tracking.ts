import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addDays,
  computeRecovery,
  exerciseProgression,
  sessionLoad,
  weekStart,
  weekday,
  round,
  mean,
  RECOVERY_LABEL,
  type ActivityType,
} from '@app/core';
import type { AppContext } from '../app';
import { requireAuth } from '../auth';
import { adaptiveEstimate, energyFor, goalsWithProgress, insights, liftHistory, sessionsBetween, weeklyReport, dashboard } from '../services/metrics';
import { dailyRecommendation } from '../services/recommend';
import { ensureWeekPlan } from '../services/plan';
import { getUser, userToday } from '../services/users';
import { idParam, isoDate, notFound, parse } from './_util';
import { GOAL_KIND_LABEL } from '@app/core';

const scale = z.number().int().min(1).max(5);

export async function trackingRoutes(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', requireAuth(db));

  app.get('/api/dashboard', async (req) => {
    const q = parse(z.object({ date: isoDate.optional() }), req.query);
    // A agenda da semana precisa existir antes de montar o resumo do dia.
    const u = getUser(db, req.userId);
    ensureWeekPlan(db, u, weekStart(q.date ?? userToday(u)));
    const d = dashboard(db, req.userId, q.date);
    const sessionsWithCode = db
      .prepare(`SELECT w.*, t.code AS template_code FROM workouts w LEFT JOIN workout_templates t ON t.id = w.template_id WHERE w.user_id = ? AND w.date = ? ORDER BY COALESCE(w.planned_time,'99')`)
      .all(req.userId, d.date) as any[];
    return {
      ...d,
      sessions: sessionsWithCode,
      recommendation: dailyRecommendation(sessionsWithCode, (d.recovery as any)?.status ?? null, weekday(d.date)),
    };
  });

  // ---- Recuperação ----
  app.get('/api/recovery', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const q = parse(z.object({ from: isoDate.optional(), to: isoDate.optional() }), req.query);
    return db.prepare('SELECT * FROM recovery_checkins WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(user.id, q.from ?? addDays(today, -29), q.to ?? today);
  });

  app.post('/api/recovery', async (req, reply) => {
    const user = getUser(db, req.userId);
    const b = parse(
      z.object({
        date: isoDate,
        sleep_hours: z.number().min(0).max(16).nullable().optional(),
        sleep_quality: scale,
        energy: scale,
        soreness: scale,
        stress: scale,
        motivation: scale,
        notes: z.string().max(500).nullable().optional(),
      }),
      req.body,
    );
    const baseline = (db.prepare('SELECT score FROM recovery_checkins WHERE user_id = ? AND date < ? AND date >= ?').all(user.id, b.date, addDays(b.date, -28)) as { score: number }[]).map((r) => r.score);
    const r = computeRecovery(b, baseline);
    db.prepare(
      `INSERT INTO recovery_checkins (user_id, date, sleep_hours, sleep_quality, energy, soreness, stress, motivation, score, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, date) DO UPDATE SET sleep_hours=excluded.sleep_hours, sleep_quality=excluded.sleep_quality, energy=excluded.energy,
       soreness=excluded.soreness, stress=excluded.stress, motivation=excluded.motivation, score=excluded.score, status=excluded.status, notes=excluded.notes`,
    ).run(user.id, b.date, b.sleep_hours ?? null, b.sleep_quality, b.energy, b.soreness, b.stress, b.motivation, r.score, r.status, b.notes ?? null);
    const sessions = db
      .prepare(`SELECT w.*, t.code AS template_code FROM workouts w LEFT JOIN workout_templates t ON t.id = w.template_id WHERE w.user_id = ? AND w.date = ?`)
      .all(user.id, b.date) as any[];
    return reply.code(201).send({
      ...r,
      label: RECOVERY_LABEL[r.status],
      recommendation: dailyRecommendation(sessions, r.status, weekday(b.date)),
      disclaimer: 'Indicador de autopercepção, não diagnóstico.',
    });
  });

  // ---- Gasto energético (entrada manual; ver docs/INTEGRATIONS.md) ----
  app.get('/api/energy', async (req) => {
    const user = getUser(db, req.userId);
    const q = parse(z.object({ date: isoDate.optional() }), req.query);
    const date = q.date ?? userToday(user);
    return { date, ...energyFor(db, user, date), adaptive: adaptiveEstimate(db, user, userToday(user)) };
  });

  app.post('/api/energy', async (req, reply) => {
    const b = parse(
      z
        .object({
          date: isoDate,
          active_calories: z.number().min(0).max(8000).nullable().optional(),
          total_calories: z.number().min(800).max(10000).nullable().optional(),
          steps: z.number().int().min(0).max(150000).nullable().optional(),
          avg_hr: z.number().int().min(30).max(220).nullable().optional(),
          activity_minutes: z.number().min(0).max(1440).nullable().optional(),
          workout_calories: z.number().min(0).max(5000).nullable().optional(),
        })
        .refine((v) => v.total_calories == null || v.active_calories == null || v.total_calories > v.active_calories, 'Calorias totais devem ser maiores que as ativas'),
      req.body,
    );
    db.prepare(
      `INSERT INTO energy_logs (user_id, date, source, active_calories, total_calories, steps, avg_hr, activity_minutes, workout_calories)
       VALUES (?,?,'manual',?,?,?,?,?,?)
       ON CONFLICT(user_id, date, source) DO UPDATE SET active_calories=excluded.active_calories, total_calories=excluded.total_calories,
       steps=excluded.steps, avg_hr=excluded.avg_hr, activity_minutes=excluded.activity_minutes, workout_calories=excluded.workout_calories`,
    ).run(req.userId, b.date, b.active_calories ?? null, b.total_calories ?? null, b.steps ?? null, b.avg_hr ?? null, b.activity_minutes ?? null, b.workout_calories ?? null);
    const user = getUser(db, req.userId);
    return reply.code(201).send({ date: b.date, ...energyFor(db, user, b.date) });
  });

  // ---- Performance ----
  app.get('/api/performance/exercises', async (req) => {
    const h = liftHistory(db, req.userId);
    return Object.entries(h)
      .map(([name, sessions]) => {
        const prog = exerciseProgression(sessions);
        const last = prog.at(-1);
        const best = prog.reduce((a, p) => ((p.e1rm ?? p.top_weight) > (a?.e1rm ?? a?.top_weight ?? 0) ? p : a), prog[0]);
        return { name, sessions: prog.length, last, best, prs: prog.filter((p) => p.isPR).length };
      })
      .filter((e) => e.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);
  });

  app.get('/api/performance/exercise', async (req) => {
    const q = parse(z.object({ name: z.string().min(1).max(80) }), req.query);
    const h = liftHistory(db, req.userId);
    return { name: q.name, progression: exerciseProgression(h[q.name] ?? []) };
  });

  app.get('/api/performance/sports', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const q = parse(z.object({ type: z.enum(['futevolei', 'tenis', 'recuperacao', 'outro']) }), req.query);
    const rows = db
      .prepare(`SELECT id, date, duration_min, rpe, intensity, games, performance_rating, calories, notes FROM workouts WHERE user_id = ? AND type = ? AND status = 'concluido' ORDER BY date DESC LIMIT 100`)
      .all(user.id, q.type) as any[];
    const last30 = rows.filter((r) => r.date >= addDays(today, -29));
    return {
      sessions: rows,
      summary: {
        count30: last30.length,
        minutes30: round(last30.reduce((a, r) => a + (r.duration_min ?? 0), 0)),
        avgRpe30: last30.length ? round(mean(last30.filter((r) => r.rpe).map((r) => r.rpe))!, 1) : null,
        avgRating30: last30.filter((r) => r.performance_rating).length ? round(mean(last30.filter((r) => r.performance_rating).map((r) => r.performance_rating))!, 1) : null,
        games30: last30.reduce((a, r) => a + (r.games ?? 0), 0),
      },
    };
  });

  /** Carga semanal (RPE × minutos) por modalidade. */
  app.get('/api/performance/load', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const q = parse(z.object({ weeks: z.coerce.number().int().min(2).max(26).default(8) }), req.query);
    const ws0 = weekStart(today);
    const from = addDays(ws0, -7 * (q.weeks - 1));
    const rows = sessionsBetween(db, user.id, from, addDays(ws0, 6)).filter((s) => s.status === 'concluido');
    const out = [];
    for (let i = 0; i < q.weeks; i++) {
      const ws = addDays(from, 7 * i);
      const inWeek = rows.filter((r) => r.date >= ws && r.date <= addDays(ws, 6));
      const by = (t: ActivityType) => inWeek.filter((r) => r.type === t).reduce((a, r) => a + sessionLoad(r.rpe, r.duration_min), 0);
      out.push({ weekStart: ws, musculacao: by('musculacao'), futevolei: by('futevolei'), tenis: by('tenis'), outros: by('recuperacao') + by('outro'), sessions: inWeek.length });
    }
    return { weeks: out, unit: 'UA (RPE × minutos)' };
  });

  // ---- Metas ----
  app.get('/api/goals', async (req) => {
    const user = getUser(db, req.userId);
    return { goals: goalsWithProgress(db, user, userToday(user)), kinds: GOAL_KIND_LABEL };
  });

  const GoalSchema = z.object({
    horizon: z.enum(['curto', 'medio', 'longo']),
    kind: z.enum(['musculacao_semana', 'proteina_semana', 'registro_semana', 'sono_semana', 'peso_alvo', 'cintura_alvo', 'carga_exercicio', 'treinos_mes', 'manual']),
    title: z.string().trim().min(1).max(120),
    target_value: z.number().min(0).max(100000),
    start_value: z.number().min(0).max(100000).nullable().optional(),
    current_manual: z.number().min(0).max(100000).nullable().optional(),
    unit: z.string().max(20).nullable().optional(),
    exercise_name: z.string().max(80).nullable().optional(),
    deadline: isoDate.nullable().optional(),
  });

  app.post('/api/goals', async (req, reply) => {
    const b = parse(GoalSchema, req.body);
    if (b.kind === 'carga_exercicio' && !b.exercise_name) throw Object.assign(new Error('Informe o exercício'), { statusCode: 400 });
    const id = Number(
      db
        .prepare('INSERT INTO goals (user_id, horizon, kind, title, target_value, start_value, current_manual, unit, exercise_name, deadline) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(req.userId, b.horizon, b.kind, b.title, b.target_value, b.start_value ?? null, b.current_manual ?? null, b.unit ?? null, b.exercise_name ?? null, b.deadline ?? null).lastInsertRowid,
    );
    return reply.code(201).send({ id });
  });

  app.patch('/api/goals/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const cur = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, req.userId) as any;
    if (!cur) throw notFound('Meta');
    const b = parse(GoalSchema.partial().extend({ active: z.boolean().optional() }), req.body);
    const n = { ...cur, ...b, active: b.active === undefined ? cur.active : b.active ? 1 : 0 };
    db.prepare('UPDATE goals SET horizon=?, kind=?, title=?, target_value=?, start_value=?, current_manual=?, unit=?, exercise_name=?, deadline=?, active=? WHERE id=?').run(
      n.horizon, n.kind, n.title, n.target_value, n.start_value, n.current_manual, n.unit, n.exercise_name, n.deadline, n.active, id,
    );
    return { ok: true };
  });

  app.delete('/api/goals/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const r = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, req.userId);
    if (!r.changes) throw notFound('Meta');
    return { ok: true };
  });

  // ---- Relatórios e insights ----
  app.get('/api/reports/weekly', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const q = parse(z.object({ week: isoDate.optional() }), req.query);
    // Padrão: semana atual se for domingo; senão, a anterior (completa) — a menos que ela seja anterior à conta.
    const created = user.created_at.slice(0, 10);
    let ws = q.week ? weekStart(q.week) : weekday(today) === 0 ? weekStart(today) : addDays(weekStart(today), -7);
    if (!q.week && addDays(ws, 6) < created) ws = weekStart(today);
    if (addDays(ws, 6) < created) {
      return { weekStart: ws, weekEnd: addDays(ws, 6), noData: true, message: `Sem dados: sua conta começou em ${created.split('-').reverse().join('/')}.` };
    }
    return { ...weeklyReport(db, user, ws), isComplete: addDays(ws, 6) <= today, noData: false };
  });

  app.get('/api/insights', async (req) => {
    const user = getUser(db, req.userId);
    return insights(db, user, userToday(user));
  });
}
