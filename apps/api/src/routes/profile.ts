import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { suggestTargets, weekStart, addDays, isTargetsValid } from '@app/core';
import type { AppContext } from '../app';
import { requireAuth } from '../auth';
import { getUser, latestWeight, publicUser, targetsFor, userToday } from '../services/users';
import { ensureWeekPlan, replanLifts } from '../services/plan';
import { hhmm, parse } from './_util';

const slot = z.enum(['manha', 'almoco', 'tarde', 'pos_esporte']);

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  age: z.number().int().min(12).max(100),
  sex: z.enum(['masculino', 'feminino']),
  height_cm: z.number().min(120).max(230),
  initial_weight_kg: z.number().min(30).max(250),
  goal: z.enum(['perda_gordura', 'recomposicao', 'ganho_massa', 'manutencao']),
  goal_notes: z.string().max(500).nullable().optional(),
  timezone: z.string(),
  lift_target_per_week: z.number().int().min(0).max(6),
  lift_availability: z.record(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.array(slot)),
});

const TargetsSchema = z.object({
  calories: z.number().min(1000).max(6000),
  protein: z.number().min(30).max(400),
  carbs: z.number().min(0).max(900),
  fat: z.number().min(15).max(300),
  water_ml: z.number().min(500).max(8000),
  notes: z.string().max(300).optional(),
});

const ScheduleSchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    type: z.enum(['futevolei', 'tenis', 'recuperacao', 'outro']),
    time: hhmm.nullable(),
    duration_min: z.number().int().min(10).max(300).nullable().default(90),
    optional: z.boolean().default(false),
  }),
).max(30);

const TemplateSchema = z.object({
  name: z.string().min(1).max(60),
  focus: z.string().max(80),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        sets: z.number().int().min(1).max(10),
        rep_min: z.number().int().min(1).max(50),
        rep_max: z.number().int().min(1).max(50),
        rest_s: z.number().int().min(0).max(600).default(90),
        lower: z.boolean(),
        notes: z.string().max(200).nullable().optional(),
      }).refine((e) => e.rep_max >= e.rep_min, 'rep_max deve ser ≥ rep_min'),
    )
    .min(1)
    .max(15),
});

export async function profileRoutes(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', requireAuth(db));

  app.get('/api/profile', async (req) => {
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const weight = latestWeight(db, user.id)?.weight_kg ?? user.initial_weight_kg;
    return {
      user: publicUser(user),
      targets: targetsFor(db, user.id, today),
      targetsHistory: db.prepare('SELECT * FROM nutrition_targets WHERE user_id = ? ORDER BY effective_from DESC').all(user.id),
      suggestion: suggestTargets({ sex: user.sex, weightKg: weight, heightCm: user.height_cm, age: user.age }),
      schedule: db.prepare('SELECT * FROM schedule_template WHERE user_id = ? ORDER BY weekday, time').all(user.id),
      templates: (db.prepare('SELECT * FROM workout_templates WHERE user_id = ? ORDER BY code').all(user.id) as any[]).map((t) => ({
        ...t,
        exercises: db.prepare('SELECT * FROM template_exercises WHERE template_id = ? ORDER BY position').all(t.id),
      })),
    };
  });

  app.put('/api/profile', async (req) => {
    const b = parse(ProfileSchema, req.body);
    try {
      Intl.DateTimeFormat('en', { timeZone: b.timezone });
    } catch {
      throw Object.assign(new Error('Fuso horário inválido'), { statusCode: 400 });
    }
    db.prepare(
      `UPDATE users SET name=?, age=?, sex=?, height_cm=?, initial_weight_kg=?, goal=?, goal_notes=?, timezone=?, lift_target_per_week=?, lift_availability=? WHERE id=?`,
    ).run(b.name, b.age, b.sex, b.height_cm, b.initial_weight_kg, b.goal, b.goal_notes ?? null, b.timezone, b.lift_target_per_week, JSON.stringify(b.lift_availability), req.userId);
    return { user: publicUser(getUser(db, req.userId)) };
  });

  /** Nova meta passa a valer a partir de hoje; dias anteriores mantêm a meta da época. */
  app.put('/api/profile/targets', async (req) => {
    const b = parse(TargetsSchema, req.body);
    if (!isTargetsValid(b)) throw Object.assign(new Error('Metas inválidas'), { statusCode: 400 });
    const today = userToday(getUser(db, req.userId));
    db.prepare(
      `INSERT INTO nutrition_targets (user_id, effective_from, calories, protein, carbs, fat, water_ml, notes) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, effective_from) DO UPDATE SET calories=excluded.calories, protein=excluded.protein, carbs=excluded.carbs,
       fat=excluded.fat, water_ml=excluded.water_ml, notes=excluded.notes`,
    ).run(req.userId, today, b.calories, b.protein, b.carbs, b.fat, b.water_ml, b.notes ?? null);
    const kcalFromMacros = b.protein * 4 + b.carbs * 4 + b.fat * 9;
    return {
      targets: targetsFor(db, req.userId, today),
      warning: Math.abs(kcalFromMacros - b.calories) > b.calories * 0.08 ? `Os macros somam ~${Math.round(kcalFromMacros)} kcal, diferente da meta de ${b.calories}.` : null,
    };
  });

  /** Atualiza a rotina esportiva e reconstrói a agenda futura da semana atual. */
  app.put('/api/profile/schedule', async (req) => {
    const items = parse(ScheduleSchema, req.body);
    const user = getUser(db, req.userId);
    const today = userToday(user);
    const ws = weekStart(today);
    db.transaction(() => {
      db.prepare('DELETE FROM schedule_template WHERE user_id = ?').run(user.id);
      const ins = db.prepare('INSERT INTO schedule_template (user_id, weekday, type, time, duration_min, optional) VALUES (?,?,?,?,?,?)');
      for (const i of items) ins.run(user.id, i.weekday, i.type, i.time, i.duration_min, i.optional ? 1 : 0);
      db.prepare(
        `DELETE FROM workouts WHERE user_id = ? AND origin = 'plano' AND status = 'planejado' AND locked = 0 AND type != 'musculacao' AND date >= ? AND date <= ?`,
      ).run(user.id, today, addDays(ws, 6));
      db.prepare('DELETE FROM planned_weeks WHERE user_id = ? AND week_start > ?').run(user.id, ws);
      const insW = db.prepare(`INSERT INTO workouts (user_id, type, date, planned_time, optional, origin, status) VALUES (?,?,?,?,?,'plano','planejado')`);
      for (let d = today; d <= addDays(ws, 6); d = addDays(d, 1)) {
        const wd = new Date(d + 'T12:00:00Z').getUTCDay();
        for (const i of items.filter((x) => x.weekday === wd)) insW.run(user.id, i.type, d, i.time, i.optional ? 1 : 0);
      }
      replanLifts(db, user, ws, today);
    })();
    ensureWeekPlan(db, user, ws);
    return { schedule: db.prepare('SELECT * FROM schedule_template WHERE user_id = ? ORDER BY weekday, time').all(user.id) };
  });

  /** Edita os exercícios de um template (A/B/C). Sessões já iniciadas não mudam. */
  app.put('/api/profile/templates/:code', async (req) => {
    const { code } = parse(z.object({ code: z.string().max(5) }), req.params);
    const b = parse(TemplateSchema, req.body);
    const t = db.prepare('SELECT id FROM workout_templates WHERE user_id = ? AND code = ?').get(req.userId, code) as { id: number } | undefined;
    if (!t) throw Object.assign(new Error('Template não encontrado'), { statusCode: 404 });
    db.transaction(() => {
      db.prepare('UPDATE workout_templates SET name = ?, focus = ? WHERE id = ?').run(b.name, b.focus, t.id);
      db.prepare('DELETE FROM template_exercises WHERE template_id = ?').run(t.id);
      const ins = db.prepare('INSERT INTO template_exercises (template_id, position, name, sets, rep_min, rep_max, rest_s, lower, notes) VALUES (?,?,?,?,?,?,?,?,?)');
      b.exercises.forEach((e, i) => ins.run(t.id, i, e.name, e.sets, e.rep_min, e.rep_max, e.rest_s, e.lower ? 1 : 0, e.notes ?? null));
      // Recalcula a carga relativa de pernas do template pelo volume de séries.
      const lowerSets = b.exercises.filter((e) => e.lower).reduce((a, e) => a + e.sets, 0);
      const total = b.exercises.reduce((a, e) => a + e.sets, 0);
      const share = lowerSets / total;
      db.prepare('UPDATE workout_templates SET lower_load = ?, upper_load = ? WHERE id = ?').run(
        Math.round(Math.min(1, share * 1.6) * 100) / 100,
        Math.round(Math.min(1, (1 - share) * 1.6) * 100) / 100,
        t.id,
      );
    })();
    return { ok: true };
  });
}
