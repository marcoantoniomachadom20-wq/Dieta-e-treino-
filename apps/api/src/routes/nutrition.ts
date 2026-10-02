import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addDays, scaleFood, rescale, sumMacros, round, MEALS } from '@app/core';
import type { AppContext } from '../app';
import { requireAuth } from '../auth';
import type { DB } from '../db';
import { dayNutrition } from '../services/metrics';
import { getUser, httpError, userToday } from '../services/users';
import { MAX_IMAGE_BYTES, sniffImage } from '../storage';
import { idParam, isoDate, notFound, parse } from './_util';

const meal = z.enum(MEALS.map((m) => m.id) as [string, ...string[]]);
const macroNum = z.number().min(0).max(10000);

const ManualItem = z.object({
  name: z.string().trim().min(1).max(120),
  quantity_g: z.number().positive().max(5000),
  calories: macroNum,
  protein: macroNum,
  carbs: macroNum,
  fat: macroNum,
});

function food(db: DB, userId: number, id: number) {
  const f = db.prepare('SELECT * FROM food_items WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!f) throw notFound('Alimento');
  return f;
}

function insertEntry(db: DB, userId: number, e: { date: string; meal: string; name: string; quantity_g: number; calories: number; protein: number; carbs: number; fat: number; source: string; food_item_id?: number | null; meal_photo_id?: number | null; ai_confidence?: number | null }) {
  return Number(
    db
      .prepare(
        `INSERT INTO food_entries (user_id, date, meal, food_item_id, name, quantity_g, calories, protein, carbs, fat, source, meal_photo_id, ai_confidence)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(userId, e.date, e.meal, e.food_item_id ?? null, e.name, e.quantity_g, round(e.calories), round(e.protein, 1), round(e.carbs, 1), round(e.fat, 1), e.source, e.meal_photo_id ?? null, e.ai_confidence ?? null)
      .lastInsertRowid,
  );
}

export async function nutritionRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  app.addHook('preHandler', requireAuth(db));

  app.get('/api/nutrition/day', async (req) => {
    const user = getUser(db, req.userId);
    const q = parse(z.object({ date: isoDate.optional() }), req.query);
    return dayNutrition(db, user.id, q.date ?? userToday(user));
  });

  /** Registro manual: por item da biblioteca (gramas) OU com macros informados. */
  app.post('/api/nutrition/entries', async (req, reply) => {
    const b = parse(
      z.union([
        z.object({ date: isoDate, meal, food_item_id: z.number().int().positive(), quantity_g: z.number().positive().max(5000) }),
        z.object({ date: isoDate, meal, save_to_library: z.boolean().optional() }).merge(ManualItem),
      ]),
      req.body,
    );
    let id: number;
    if ('food_item_id' in b) {
      const f = food(db, req.userId, b.food_item_id);
      id = insertEntry(db, req.userId, { date: b.date, meal: b.meal, name: f.name, quantity_g: b.quantity_g, ...scaleFood(f, b.quantity_g), source: 'biblioteca', food_item_id: f.id });
    } else {
      let foodId: number | null = null;
      if (b.save_to_library) {
        const per = 100 / b.quantity_g;
        foodId = Number(
          db
            .prepare('INSERT INTO food_items (user_id, name, kcal_100, protein_100, carbs_100, fat_100, default_grams) VALUES (?,?,?,?,?,?,?)')
            .run(req.userId, b.name, round(b.calories * per, 1), round(b.protein * per, 1), round(b.carbs * per, 1), round(b.fat * per, 1), b.quantity_g).lastInsertRowid,
        );
      }
      id = insertEntry(db, req.userId, { ...b, source: 'manual', food_item_id: foodId });
    }
    return reply.code(201).send({ id, day: dayNutrition(db, req.userId, b.date) });
  });

  /** Editar quantidade (reescala macros) ou mover de refeição. */
  app.patch('/api/nutrition/entries/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const e = db.prepare('SELECT * FROM food_entries WHERE id = ? AND user_id = ?').get(id, req.userId) as any;
    if (!e) throw notFound('Registro');
    const b = parse(z.object({ quantity_g: z.number().positive().max(5000).optional(), meal: meal.optional(), name: z.string().trim().min(1).max(120).optional() }), req.body);
    const m = b.quantity_g ? rescale(e, e.quantity_g, b.quantity_g) : e;
    db.prepare('UPDATE food_entries SET quantity_g = ?, calories = ?, protein = ?, carbs = ?, fat = ?, meal = ?, name = ? WHERE id = ?').run(
      b.quantity_g ?? e.quantity_g, m.calories, m.protein, m.carbs, m.fat, b.meal ?? e.meal, b.name ?? e.name, id,
    );
    return { day: dayNutrition(db, req.userId, e.date) };
  });

  app.delete('/api/nutrition/entries/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const e = db.prepare('SELECT date FROM food_entries WHERE id = ? AND user_id = ?').get(id, req.userId) as { date: string } | undefined;
    if (!e) throw notFound('Registro');
    db.prepare('DELETE FROM food_entries WHERE id = ?').run(id);
    return { day: dayNutrition(db, req.userId, e.date) };
  });

  /** Copiar uma refeição de outro dia (ex.: "o mesmo café de ontem"). */
  app.post('/api/nutrition/copy-meal', async (req) => {
    const b = parse(z.object({ from_date: isoDate, from_meal: meal, to_date: isoDate, to_meal: meal.optional() }), req.body);
    const items = db.prepare('SELECT * FROM food_entries WHERE user_id = ? AND date = ? AND meal = ?').all(req.userId, b.from_date, b.from_meal) as any[];
    if (!items.length) throw httpError(404, 'Nada registrado nessa refeição');
    db.transaction(() => {
      for (const i of items) insertEntry(db, req.userId, { ...i, date: b.to_date, meal: b.to_meal ?? b.from_meal, source: i.source === 'foto_ia' ? 'manual' : i.source, meal_photo_id: null });
    })();
    return { day: dayNutrition(db, req.userId, b.to_date) };
  });

  // ---- Água ----
  app.post('/api/water', async (req) => {
    const b = parse(z.object({ date: isoDate, ml: z.number().int().min(-2000).max(3000).refine((n) => n !== 0) }), req.body);
    if (b.ml < 0) {
      const cur = (db.prepare('SELECT COALESCE(SUM(ml),0) ml FROM water_entries WHERE user_id = ? AND date = ?').get(req.userId, b.date) as { ml: number }).ml;
      if (cur + b.ml < 0) throw httpError(400, 'Não há tanta água registrada');
    }
    db.prepare('INSERT INTO water_entries (user_id, date, ml) VALUES (?,?,?)').run(req.userId, b.date, b.ml);
    return { water: dayNutrition(db, req.userId, b.date).water };
  });

  // ---- Biblioteca ----
  app.get('/api/foods', async (req) => {
    const q = parse(z.object({ q: z.string().max(80).optional(), favorites: z.enum(['1', '0']).optional() }), req.query);
    const term = `%${(q.q ?? '').trim()}%`;
    // Ordena por favoritos e frequência de uso.
    return db
      .prepare(
        `SELECT f.*, (SELECT COUNT(*) FROM food_entries e WHERE e.food_item_id = f.id) AS uses
         FROM food_items f WHERE f.user_id = ? AND f.name LIKE ? ${q.favorites === '1' ? 'AND f.favorite = 1' : ''}
         ORDER BY f.favorite DESC, uses DESC, f.name LIMIT 60`,
      )
      .all(req.userId, term);
  });

  const FoodSchema = z.object({
    name: z.string().trim().min(1).max(120),
    kcal_100: z.number().min(0).max(950),
    protein_100: z.number().min(0).max(100),
    carbs_100: z.number().min(0).max(100),
    fat_100: z.number().min(0).max(100),
    default_grams: z.number().positive().max(2000).default(100),
    unit_label: z.string().max(80).nullable().optional(),
    favorite: z.boolean().optional(),
  }).refine((f) => f.protein_100 + f.carbs_100 + f.fat_100 <= 101, 'Macros por 100 g não podem passar de 100 g');

  app.post('/api/foods', async (req, reply) => {
    const b = parse(FoodSchema, req.body);
    const id = Number(
      db
        .prepare('INSERT INTO food_items (user_id, name, kcal_100, protein_100, carbs_100, fat_100, default_grams, unit_label, favorite) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(req.userId, b.name, b.kcal_100, b.protein_100, b.carbs_100, b.fat_100, b.default_grams, b.unit_label ?? null, b.favorite ? 1 : 0).lastInsertRowid,
    );
    return reply.code(201).send(food(db, req.userId, id));
  });

  app.patch('/api/foods/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const cur = food(db, req.userId, id);
    const b = parse(z.object({ favorite: z.boolean().optional(), default_grams: z.number().positive().max(2000).optional(), name: z.string().trim().min(1).max(120).optional() }), req.body);
    db.prepare('UPDATE food_items SET favorite = ?, default_grams = ?, name = ? WHERE id = ?').run(
      b.favorite === undefined ? cur.favorite : b.favorite ? 1 : 0, b.default_grams ?? cur.default_grams, b.name ?? cur.name, id,
    );
    return food(db, req.userId, id);
  });

  app.delete('/api/foods/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    food(db, req.userId, id);
    db.prepare('DELETE FROM food_items WHERE id = ?').run(id);
    return { ok: true };
  });

  // ---- Refeições favoritas ----
  app.get('/api/favorite-meals', async (req) =>
    (db.prepare('SELECT * FROM favorite_meals WHERE user_id = ? ORDER BY name').all(req.userId) as any[]).map((f) => {
      const items = JSON.parse(f.items_json);
      return { ...f, items, totals: sumMacros(items) };
    }),
  );

  /** Salva como favorita a partir de uma refeição registrada. */
  app.post('/api/favorite-meals', async (req, reply) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), date: isoDate, meal }), req.body);
    const items = db.prepare('SELECT name, quantity_g, calories, protein, carbs, fat, food_item_id FROM food_entries WHERE user_id = ? AND date = ? AND meal = ?').all(req.userId, b.date, b.meal);
    if (!items.length) throw httpError(400, 'Essa refeição está vazia');
    const id = Number(db.prepare('INSERT INTO favorite_meals (user_id, name, meal, items_json) VALUES (?,?,?,?)').run(req.userId, b.name, b.meal, JSON.stringify(items)).lastInsertRowid);
    return reply.code(201).send({ id });
  });

  app.post('/api/favorite-meals/:id/apply', async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ date: isoDate, meal: meal.optional() }), req.body);
    const f = db.prepare('SELECT * FROM favorite_meals WHERE id = ? AND user_id = ?').get(id, req.userId) as any;
    if (!f) throw notFound('Refeição favorita');
    db.transaction(() => {
      for (const i of JSON.parse(f.items_json)) insertEntry(db, req.userId, { ...i, date: b.date, meal: b.meal ?? f.meal, source: 'favorita' });
    })();
    return { day: dayNutrition(db, req.userId, b.date) };
  });

  app.delete('/api/favorite-meals/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const r = db.prepare('DELETE FROM favorite_meals WHERE id = ? AND user_id = ?').run(id, req.userId);
    if (!r.changes) throw notFound('Refeição favorita');
    return { ok: true };
  });

  // ---- Foto da refeição (IA) ----

  /** Recebe a foto, guarda de forma privada e devolve a ESTIMATIVA para revisão. Nada é registrado aqui. */
  app.post('/api/meals/analyze', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
    if (!file) throw httpError(400, 'Envie uma imagem');
    const buf = await file.toBuffer();
    if (file.file.truncated) throw httpError(413, 'Imagem muito grande (máx. 10 MB)');
    const mime = sniffImage(buf);
    if (!mime) throw httpError(400, 'Formato de imagem não suportado (use JPEG, PNG ou WebP)');
    const hintField = file.fields.hint as { value?: string } | undefined;
    const hint = typeof hintField?.value === 'string' ? hintField.value : undefined;
    const analysis = await ctx.analyzer.analyzeMeal(buf, mime, { hint });
    const fileName = ctx.storage.save(req.userId, 'meals', buf, mime);
    const photoId = Number(
      db.prepare('INSERT INTO meal_photos (user_id, file_name, mime, analysis_json) VALUES (?,?,?,?)').run(req.userId, fileName, mime, JSON.stringify(analysis)).lastInsertRowid,
    );
    return reply.send({ photo_id: photoId, analysis });
  });

  /** Confirma a análise (já corrigida pelo usuário) e grava no diário. */
  app.post('/api/meals/confirm', async (req, reply) => {
    const b = parse(
      z.object({
        date: isoDate,
        meal,
        photo_id: z.number().int().positive().nullable().optional(),
        confidence: z.number().min(0).max(1).nullable().optional(),
        items: z.array(ManualItem).min(1).max(30),
      }),
      req.body,
    );
    if (b.photo_id) {
      const p = db.prepare('SELECT id FROM meal_photos WHERE id = ? AND user_id = ?').get(b.photo_id, req.userId);
      if (!p) throw notFound('Foto');
    }
    db.transaction(() => {
      for (const i of b.items) insertEntry(db, req.userId, { ...i, date: b.date, meal: b.meal, source: 'foto_ia', meal_photo_id: b.photo_id ?? null, ai_confidence: b.confidence ?? null });
    })();
    return reply.code(201).send({ day: dayNutrition(db, req.userId, b.date) });
  });

  app.get('/api/meal-photos/:id/file', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const p = db.prepare('SELECT * FROM meal_photos WHERE id = ? AND user_id = ?').get(id, req.userId) as any;
    if (!p) throw notFound('Foto');
    reply.header('Cache-Control', 'private, max-age=3600').type(p.mime);
    return reply.send(ctx.fs.createReadStream(ctx.storage.path(req.userId, 'meals', p.file_name)));
  });

  // ---- Lista de compras ----
  /** Lista baseada no consumo real dos últimos N dias, projetada para 7 dias. */
  app.get('/api/shopping-list', async (req) => {
    const user = getUser(db, req.userId);
    const q = parse(z.object({ days: z.coerce.number().int().min(3).max(28).default(7) }), req.query);
    const today = userToday(user);
    const from = addDays(today, -q.days);
    const rows = db
      .prepare(
        `SELECT COALESCE(f.name, e.name) AS name, SUM(e.quantity_g) grams, COUNT(DISTINCT e.date) days, f.unit_label
         FROM food_entries e LEFT JOIN food_items f ON f.id = e.food_item_id
         WHERE e.user_id = ? AND e.date >= ? AND e.date < ? GROUP BY COALESCE(f.id, e.name) ORDER BY grams DESC`,
      )
      .all(user.id, from, today) as { name: string; grams: number; days: number; unit_label: string | null }[];
    const logged = (db.prepare('SELECT COUNT(DISTINCT date) n FROM food_entries WHERE user_id = ? AND date >= ? AND date < ?').get(user.id, from, today) as { n: number }).n;
    const factor = logged ? 7 / logged : 0;
    return {
      basedOnDays: logged,
      items: rows
        .filter((r) => r.days >= 2)
        .map((r) => ({ name: r.name, weekly_grams: Math.ceil((r.grams * factor) / 50) * 50, unit_label: r.unit_label, days: r.days })),
      note: 'Quantidades de alimento PRONTO (cozido) — arroz, feijão e massas rendem ~2,5× o peso cru.',
    };
  });
}
