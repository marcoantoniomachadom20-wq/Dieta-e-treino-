import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addDays,
  weekStart,
  weekday,
  monthRange,
  setsVolume,
  sessionAdvice,
  suggestNextLoad,
  round,
  mean,
  type ActivityType,
} from '@app/core';
import type { AppContext } from '../app';
import { requireAuth } from '../auth';
import type { DB } from '../db';
import { ensureWeekPlan, lastSetsFor, readinessContext, replanLifts, skipWorkout, startWorkout } from '../services/plan';
import { streaks } from '../services/metrics';
import { getUser, httpError, userNowTime, userToday } from '../services/users';
import { hhmm, idParam, isoDate, notFound, parse } from './_util';

const activity = z.enum(['musculacao', 'futevolei', 'tenis', 'recuperacao', 'outro']);

function ownedWorkout(db: DB, userId: number, id: number) {
  const w = db.prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!w) throw notFound('Sessão');
  return w;
}

function ownedExercise(db: DB, userId: number, id: number) {
  const e = db.prepare('SELECT we.*, w.status AS workout_status FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id WHERE we.id = ? AND w.user_id = ?').get(id, userId) as any;
  if (!e) throw notFound('Exercício');
  return e;
}

function ownedSet(db: DB, userId: number, id: number) {
  const s = db
    .prepare('SELECT s.* FROM exercise_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id JOIN workouts w ON w.id = we.workout_id WHERE s.id = ? AND w.user_id = ?')
    .get(id, userId) as any;
  if (!s) throw notFound('Série');
  return s;
}

/** Sessão completa com template, exercícios, séries e, se planejada, prévia do treino com últimas cargas. */
export function workoutDetail(db: DB, userId: number, id: number) {
  const w = ownedWorkout(db, userId, id);
  const tpl = w.template_id ? (db.prepare('SELECT id, code, name, focus, lower_load FROM workout_templates WHERE id = ?').get(w.template_id) as any) : null;
  const exercises = (db.prepare('SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position, id').all(id) as any[]).map((e) => ({
    ...e,
    completed: !!e.completed,
    lower: !!e.lower,
    sets: (db.prepare('SELECT * FROM exercise_sets WHERE workout_exercise_id = ? ORDER BY set_number').all(e.id) as any[]).map((s) => ({ ...s, completed: !!s.completed })),
    last: lastSetsFor(db, userId, e.name, id),
  }));
  let preview: any[] | null = null;
  if (tpl && w.status === 'planejado') {
    preview = (db.prepare('SELECT * FROM template_exercises WHERE template_id = ? ORDER BY position').all(tpl.id) as any[]).map((e) => {
      const last = lastSetsFor(db, userId, e.name);
      return { ...e, lower: !!e.lower, last, suggestion: suggestNextLoad(last, e.rep_max, e.lower ? 5 : 2.5) };
    });
  }
  return { ...w, optional: !!w.optional, locked: !!w.locked, plan_reason: w.plan_reason ? JSON.parse(w.plan_reason) : [], template: tpl, exercises, preview };
}

const CompleteSchema = z.object({
  rpe: z.number().int().min(1).max(10),
  duration_min: z.number().min(1).max(600).optional(),
  calories: z.number().min(0).max(5000).nullable().optional(),
  avg_hr: z.number().int().min(30).max(230).nullable().optional(),
  intensity: z.enum(['leve', 'moderada', 'intensa']).nullable().optional(),
  games: z.number().int().min(0).max(50).nullable().optional(),
  performance_rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function workoutRoutes(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', requireAuth(db));

  /** Agenda da semana (gera se necessário). */
  app.get('/api/plan/week', async (req) => {
    const user = getUser(db, req.userId);
    const q = parse(z.object({ date: isoDate.optional() }), req.query);
    const ws = weekStart(q.date ?? userToday(user));
    ensureWeekPlan(db, user, ws);
    const rows = db
      .prepare(
        `SELECT w.*, t.code AS template_code, t.name AS template_name, t.focus AS template_focus
         FROM workouts w LEFT JOIN workout_templates t ON t.id = w.template_id
         WHERE w.user_id = ? AND w.date BETWEEN ? AND ? ORDER BY w.date, COALESCE(w.planned_time, '99')`,
      )
      .all(user.id, ws, addDays(ws, 6)) as any[];
    return {
      weekStart: ws,
      today: userToday(user),
      sessions: rows.map((r) => ({ ...r, optional: !!r.optional, locked: !!r.locked, plan_reason: r.plan_reason ? JSON.parse(r.plan_reason) : [] })),
    };
  });

  app.post('/api/plan/replan', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const b = parse(z.object({ from: isoDate.optional() }), req.body ?? {});
    const from = b.from && b.from > today ? b.from : today;
    const ws = weekStart(from);
    ensureWeekPlan(db, user, ws);
    return db.transaction(() => replanLifts(db, user, ws, from))();
  });

  /** Treino de hoje: sessões do dia com detalhes e conselho de prontidão. */
  app.get('/api/workouts/today', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    ensureWeekPlan(db, user, weekStart(today));
    const ids = db.prepare(`SELECT id FROM workouts WHERE user_id = ? AND date = ? ORDER BY COALESCE(planned_time,'99')`).all(user.id, today) as { id: number }[];
    const sessions = ids.map((r) => workoutDetail(db, user.id, r.id));
    const lift = sessions.find((s) => s.type === 'musculacao' && s.template);
    // Referência = horário planejado do treino (se ainda for depois de agora): treino marcado após o jogo não é "antes do jogo".
    const now = userNowTime(user);
    const ref = lift?.status === 'planejado' && lift.planned_time && lift.planned_time > now ? lift.planned_time : now;
    const ctx = readinessContext(db, user, today, ref);
    const advice = lift
      ? sessionAdvice({ template: lift.template, recovery: ctx.recovery, sportLaterToday: ctx.sportLaterToday, sportTomorrow: ctx.sportTomorrow, loadTrend: ctx.load.label })
      : null;
    const next = db
      .prepare(
        `SELECT w.date, w.planned_time, w.type, t.code AS template_code FROM workouts w LEFT JOIN workout_templates t ON t.id = w.template_id
         WHERE w.user_id = ? AND w.date > ? AND w.status = 'planejado' ORDER BY w.date, w.planned_time LIMIT 3`,
      )
      .all(user.id, today);
    return { date: today, sessions, advice, context: ctx, next };
  });

  app.get('/api/workouts/:id', async (req) => workoutDetail(db, req.userId, parse(idParam, req.params).id));

  /** Cria uma sessão avulsa (ex.: registrar um jogo não planejado, ou musculação extra). */
  app.post('/api/workouts', async (req, reply) => {
    const b = parse(
      z.object({
        type: activity,
        date: isoDate,
        planned_time: hhmm.nullable().optional(),
        template_code: z.string().max(5).optional(),
        optional: z.boolean().optional(),
      }),
      req.body,
    );
    let templateId: number | null = null;
    if (b.template_code) {
      const t = db.prepare('SELECT id FROM workout_templates WHERE user_id = ? AND code = ?').get(req.userId, b.template_code) as { id: number } | undefined;
      if (!t) throw httpError(400, 'Template inexistente');
      templateId = t.id;
    }
    if (b.type === 'musculacao') {
      const clash = db.prepare(`SELECT 1 FROM workouts WHERE user_id = ? AND date = ? AND type = 'musculacao' AND status != 'pulado'`).get(req.userId, b.date);
      if (clash) throw httpError(409, 'Já existe musculação nesse dia. Mova a existente em vez de duplicar.');
    }
    const id = Number(
      db
        .prepare(`INSERT INTO workouts (user_id, type, template_id, date, planned_time, optional, origin, status, locked) VALUES (?,?,?,?,?,?,'manual','planejado',1)`)
        .run(req.userId, b.type, templateId, b.date, b.planned_time ?? null, b.optional ? 1 : 0).lastInsertRowid,
    );
    return reply.code(201).send(workoutDetail(db, req.userId, id));
  });

  /** Mover sessão (outro horário/dia). Fica "travada" para o replanejamento não mexer. */
  app.patch('/api/workouts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const w = ownedWorkout(db, req.userId, id);
    const b = parse(z.object({ date: isoDate.optional(), planned_time: hhmm.nullable().optional(), notes: z.string().max(1000).nullable().optional() }), req.body);
    if (b.date && b.date !== w.date && w.type === 'musculacao') {
      const clash = db.prepare(`SELECT 1 FROM workouts WHERE user_id = ? AND date = ? AND type = 'musculacao' AND status != 'pulado' AND id != ?`).get(req.userId, b.date, id);
      if (clash) throw httpError(409, 'Já existe musculação nesse dia.');
      if (weekStart(b.date) !== weekStart(w.date)) throw httpError(400, 'Mova dentro da mesma semana. Para outra semana, pule e deixe o plano reorganizar.');
    }
    const moved = (b.date && b.date !== w.date) || (b.planned_time !== undefined && b.planned_time !== w.planned_time);
    db.prepare(
      `UPDATE workouts SET date = COALESCE(?, date), planned_time = CASE WHEN ? THEN ? ELSE planned_time END,
       planned_slot = CASE WHEN ? THEN 'custom' ELSE planned_slot END, locked = CASE WHEN ? THEN 1 ELSE locked END,
       notes = CASE WHEN ? THEN ? ELSE notes END WHERE id = ?`,
    ).run(b.date ?? null, b.planned_time !== undefined ? 1 : 0, b.planned_time ?? null, moved ? 1 : 0, moved ? 1 : 0, b.notes !== undefined ? 1 : 0, b.notes ?? null, id);
    return workoutDetail(db, req.userId, id);
  });

  app.post('/api/workouts/:id/start', async (req) => {
    const { id } = parse(idParam, req.params);
    const r = startWorkout(db, req.userId, id, new Date().toISOString());
    return { ...workoutDetail(db, req.userId, id), advice: r.advice };
  });

  app.post('/api/workouts/:id/skip', async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
    return skipWorkout(db, req.userId, id, b.reason);
  });

  /** Concluir: registra RPE, duração, volume e observações. */
  app.post('/api/workouts/:id/complete', async (req) => {
    const { id } = parse(idParam, req.params);
    const w = ownedWorkout(db, req.userId, id);
    if (w.status === 'concluido') throw httpError(409, 'Sessão já concluída');
    const b = parse(CompleteSchema, req.body);
    const now = new Date();
    let duration = b.duration_min;
    if (!duration && w.started_at) duration = Math.max(1, Math.round((now.getTime() - new Date(w.started_at).getTime()) / 60000));
    if (!duration) throw httpError(400, 'Informe a duração');
    if (duration > 600) duration = 600;
    const sets = db
      .prepare('SELECT s.weight_kg, s.reps, s.completed FROM exercise_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id WHERE we.workout_id = ?')
      .all(id) as any[];
    const volume = setsVolume(sets.map((s) => ({ ...s, completed: !!s.completed })));
    const user = getUser(db, req.userId);
    const today = userToday(user);
    db.prepare(
      `UPDATE workouts SET status='concluido', finished_at=?, started_at=COALESCE(started_at, ?), duration_min=?, rpe=?, calories=?, avg_hr=?, intensity=?,
       games=?, performance_rating=?, notes=COALESCE(?, notes), volume_kg=?, date = CASE WHEN date > ? THEN ? ELSE date END WHERE id=?`,
    ).run(
      now.toISOString(),
      new Date(now.getTime() - duration * 60000).toISOString(),
      duration,
      b.rpe,
      b.calories ?? null,
      b.avg_hr ?? null,
      b.intensity ?? null,
      b.games ?? null,
      b.performance_rating ?? null,
      b.notes ?? null,
      w.type === 'musculacao' ? volume : null,
      today,
      today,
      id,
    );
    // Exercícios com todas as séries feitas ficam marcados como concluídos.
    db.prepare(
      `UPDATE workout_exercises SET completed = 1 WHERE workout_id = ? AND NOT EXISTS (SELECT 1 FROM exercise_sets s WHERE s.workout_exercise_id = workout_exercises.id AND s.completed = 0)`,
    ).run(id);
    return { ...workoutDetail(db, req.userId, id), streak: streaks(db, user, today) };
  });

  /** Desfaz a conclusão (correção de erro). */
  app.post('/api/workouts/:id/reopen', async (req) => {
    const { id } = parse(idParam, req.params);
    const w = ownedWorkout(db, req.userId, id);
    const hasEx = (db.prepare('SELECT COUNT(*) n FROM workout_exercises WHERE workout_id = ?').get(id) as { n: number }).n > 0;
    db.prepare(`UPDATE workouts SET status = ?, finished_at = NULL WHERE id = ?`).run(hasEx || w.started_at ? 'em_andamento' : 'planejado', id);
    return workoutDetail(db, req.userId, id);
  });

  app.delete('/api/workouts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ownedWorkout(db, req.userId, id);
    db.prepare('DELETE FROM workouts WHERE id = ?').run(id);
    return { ok: true };
  });

  // ---- Exercícios e séries ----

  app.post('/api/workouts/:id/exercises', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const w = ownedWorkout(db, req.userId, id);
    if (w.status === 'concluido') throw httpError(409, 'Sessão concluída: reabra para editar');
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), sets: z.number().int().min(1).max(10).default(3), rep_min: z.number().int().min(1).max(50).default(8), rep_max: z.number().int().min(1).max(50).default(12), lower: z.boolean().default(false) }), req.body);
    const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 p FROM workout_exercises WHERE workout_id = ?').get(id) as { p: number }).p;
    const last = lastSetsFor(db, req.userId, b.name, id);
    const sug = suggestNextLoad(last, b.rep_max, b.lower ? 5 : 2.5);
    const exId = Number(
      db
        .prepare('INSERT INTO workout_exercises (workout_id, position, name, target_sets, rep_min, rep_max, lower, suggested_weight, suggestion) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, pos, b.name, b.sets, b.rep_min, b.rep_max, b.lower ? 1 : 0, sug.weight_kg, sug.reason).lastInsertRowid,
    );
    const ins = db.prepare('INSERT INTO exercise_sets (workout_exercise_id, set_number, weight_kg) VALUES (?,?,?)');
    for (let i = 1; i <= b.sets; i++) ins.run(exId, i, sug.weight_kg);
    if (w.status === 'planejado') db.prepare(`UPDATE workouts SET status = 'em_andamento', started_at = COALESCE(started_at, ?) WHERE id = ?`).run(new Date().toISOString(), id);
    return reply.code(201).send(workoutDetail(db, req.userId, id));
  });

  app.patch('/api/workout-exercises/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const e = ownedExercise(db, req.userId, id);
    const b = parse(z.object({ completed: z.boolean().optional(), notes: z.string().max(500).nullable().optional() }), req.body);
    db.prepare('UPDATE workout_exercises SET completed = COALESCE(?, completed), notes = CASE WHEN ? THEN ? ELSE notes END WHERE id = ?').run(
      b.completed === undefined ? null : b.completed ? 1 : 0,
      b.notes !== undefined ? 1 : 0,
      b.notes ?? null,
      id,
    );
    if (b.completed) db.prepare('UPDATE exercise_sets SET completed = 1 WHERE workout_exercise_id = ? AND reps IS NOT NULL').run(id);
    return workoutDetail(db, req.userId, e.workout_id);
  });

  app.delete('/api/workout-exercises/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const e = ownedExercise(db, req.userId, id);
    db.prepare('DELETE FROM workout_exercises WHERE id = ?').run(id);
    return workoutDetail(db, req.userId, e.workout_id);
  });

  app.post('/api/workout-exercises/:id/sets', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    ownedExercise(db, req.userId, id);
    const last = db.prepare('SELECT set_number, weight_kg FROM exercise_sets WHERE workout_exercise_id = ? ORDER BY set_number DESC LIMIT 1').get(id) as any;
    const sid = Number(db.prepare('INSERT INTO exercise_sets (workout_exercise_id, set_number, weight_kg) VALUES (?,?,?)').run(id, (last?.set_number ?? 0) + 1, last?.weight_kg ?? null).lastInsertRowid);
    return reply.code(201).send(db.prepare('SELECT * FROM exercise_sets WHERE id = ?').get(sid));
  });

  app.patch('/api/sets/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ownedSet(db, req.userId, id);
    const b = parse(
      z.object({
        weight_kg: z.number().min(0).max(500).nullable().optional(),
        reps: z.number().int().min(0).max(100).nullable().optional(),
        rir: z.number().int().min(0).max(10).nullable().optional(),
        completed: z.boolean().optional(),
      }),
      req.body,
    );
    const cur = db.prepare('SELECT * FROM exercise_sets WHERE id = ?').get(id) as any;
    const next = { ...cur, ...b, completed: b.completed === undefined ? cur.completed : b.completed ? 1 : 0 };
    if (next.completed && (next.reps == null || next.reps === 0)) throw httpError(400, 'Informe as repetições antes de concluir a série');
    db.prepare('UPDATE exercise_sets SET weight_kg = ?, reps = ?, rir = ?, completed = ? WHERE id = ?').run(next.weight_kg, next.reps, next.rir, next.completed, id);
    return { ...next, completed: !!next.completed };
  });

  app.delete('/api/sets/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ownedSet(db, req.userId, id);
    db.prepare('DELETE FROM exercise_sets WHERE id = ?').run(id);
    return { ok: true };
  });

  // ---- Histórico ----

  app.get('/api/history', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const q = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    const [y, m] = (q.month ?? today.slice(0, 7)).split('-').map(Number);
    const { start, end } = monthRange(y, m);
    const rows = db
      .prepare(
        `SELECT w.id, w.type, w.date, w.status, w.duration_min, w.rpe, w.calories, w.volume_kg, w.optional, w.planned_time, t.code AS template_code
         FROM workouts w LEFT JOIN workout_templates t ON t.id = w.template_id WHERE w.user_id = ? AND w.date BETWEEN ? AND ? ORDER BY w.date`,
      )
      .all(user.id, start, end) as any[];
    const done = rows.filter((r) => r.status === 'concluido');
    const days: Record<string, any[]> = {};
    for (const r of rows) (days[r.date] ??= []).push(r);
    const lastDay = end < today ? end : today;
    const weeksElapsed = Math.max(1, (new Date(lastDay).getTime() - new Date(start).getTime()) / (7 * 86400000));
    // Volume semanal de musculação nas últimas 8 semanas.
    const ws0 = weekStart(today);
    const weeklyVolume = [];
    for (let i = 7; i >= 0; i--) {
      const ws = addDays(ws0, -7 * i);
      const v = db
        .prepare(`SELECT COALESCE(SUM(volume_kg),0) v, COUNT(*) n FROM workouts WHERE user_id = ? AND type='musculacao' AND status='concluido' AND date BETWEEN ? AND ?`)
        .get(user.id, ws, addDays(ws, 6)) as { v: number; n: number };
      weeklyVolume.push({ weekStart: ws, volume: round(v.v), sessions: v.n });
    }
    const count = (t: ActivityType) => done.filter((r) => r.type === t).length;
    return {
      month: `${y}-${String(m).padStart(2, '0')}`,
      start,
      end,
      days,
      stats: {
        total: done.length,
        musculacao: count('musculacao'),
        futevolei: count('futevolei'),
        tenis: count('tenis'),
        perWeek: round(done.length / weeksElapsed, 1),
        avgRpe: done.length ? round(mean(done.filter((d) => d.rpe).map((d) => d.rpe))!, 1) : null,
        liftVolume: round(done.reduce((a, d) => a + (d.volume_kg ?? 0), 0)),
        skipped: rows.filter((r) => r.status === 'pulado').length,
      },
      weeklyVolume,
      streak: streaks(db, user, today),
      today,
    };
  });
}
