import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { weightSeries, weightStats } from '@app/core';
import type { AppContext } from '../app';
import { requireAuth } from '../auth';
import { weights } from '../services/metrics';
import { getUser, httpError, latestWeight, userToday } from '../services/users';
import { MAX_IMAGE_BYTES, sniffImage } from '../storage';
import { idParam, isoDate, notFound, parse } from './_util';

const cm = z.number().min(10).max(250).nullable().optional();

export async function bodyRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  app.addHook('preHandler', requireAuth(db));

  // ---- Peso ----
  app.get('/api/weight', async (req) => {
    const user = getUser(db, req.userId);
    const ws = weights(db, user.id);
    return { entries: ws, series: weightSeries(ws), stats: weightStats(ws, userToday(user), user.initial_weight_kg) };
  });

  /** Uma pesagem por dia: registrar de novo no mesmo dia substitui. */
  app.post('/api/weight', async (req, reply) => {
    const b = parse(z.object({ date: isoDate, weight_kg: z.number().min(30).max(250), notes: z.string().max(200).nullable().optional() }), req.body);
    const user = getUser(db, req.userId);
    if (b.date > userToday(user)) throw httpError(400, 'Data no futuro');
    const prev = latestWeight(db, user.id, b.date);
    db.prepare(
      `INSERT INTO weight_entries (user_id, date, weight_kg, notes) VALUES (?,?,?,?)
       ON CONFLICT(user_id, date) DO UPDATE SET weight_kg = excluded.weight_kg, notes = excluded.notes`,
    ).run(user.id, b.date, b.weight_kg, b.notes ?? null);
    const warning = prev && prev.date !== b.date && Math.abs(b.weight_kg - prev.weight_kg) > 3 ? `Diferença de ${Math.abs(b.weight_kg - prev.weight_kg).toFixed(1)} kg para a pesagem anterior — confira se digitou certo.` : null;
    return reply.code(201).send({ ok: true, warning });
  });

  app.delete('/api/weight/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const r = db.prepare('DELETE FROM weight_entries WHERE id = ? AND user_id = ?').run(id, req.userId);
    if (!r.changes) throw notFound('Pesagem');
    return { ok: true };
  });

  // ---- Medidas ----
  app.get('/api/measurements', async (req) => db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY date').all(req.userId));

  app.post('/api/measurements', async (req, reply) => {
    const b = parse(
      z.object({
        date: isoDate,
        waist: cm,
        abdomen: cm,
        chest: cm,
        arm: cm,
        thigh: cm,
        body_fat: z.number().min(3).max(60).nullable().optional(),
        body_fat_method: z.string().max(60).nullable().optional(),
        notes: z.string().max(300).nullable().optional(),
      }),
      req.body,
    );
    if (b.body_fat != null && !b.body_fat_method) throw httpError(400, 'Informe o método da medição de gordura (ex.: DEXA, bioimpedância, dobras)');
    const fields = ['waist', 'abdomen', 'chest', 'arm', 'thigh', 'body_fat'] as const;
    if (fields.every((f) => b[f] == null)) throw httpError(400, 'Informe pelo menos uma medida');
    db.prepare(
      `INSERT INTO body_measurements (user_id, date, waist, abdomen, chest, arm, thigh, body_fat, body_fat_method, notes) VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, date) DO UPDATE SET waist=excluded.waist, abdomen=excluded.abdomen, chest=excluded.chest, arm=excluded.arm,
       thigh=excluded.thigh, body_fat=excluded.body_fat, body_fat_method=excluded.body_fat_method, notes=excluded.notes`,
    ).run(req.userId, b.date, b.waist ?? null, b.abdomen ?? null, b.chest ?? null, b.arm ?? null, b.thigh ?? null, b.body_fat ?? null, b.body_fat_method ?? null, b.notes ?? null);
    return reply.code(201).send({ ok: true });
  });

  app.delete('/api/measurements/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const r = db.prepare('DELETE FROM body_measurements WHERE id = ? AND user_id = ?').run(id, req.userId);
    if (!r.changes) throw notFound('Medida');
    return { ok: true };
  });

  // ---- Fotos de evolução (privadas) ----
  app.get('/api/photos', async (req) => {
    const rows = db.prepare('SELECT id, date, pose, weight_kg, created_at FROM progress_photos WHERE user_id = ? ORDER BY date DESC, pose').all(req.userId) as any[];
    const measures = db.prepare('SELECT * FROM body_measurements WHERE user_id = ?').all(req.userId) as any[];
    const byDate = new Map(measures.map((m) => [m.date, m]));
    return rows.map((r) => ({ ...r, measurement: byDate.get(r.date) ?? null }));
  });

  app.post('/api/photos', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
    if (!file) throw httpError(400, 'Envie uma imagem');
    const buf = await file.toBuffer();
    if (file.file.truncated) throw httpError(413, 'Imagem muito grande (máx. 10 MB)');
    const field = (k: string) => (file.fields[k] as { value?: string } | undefined)?.value;
    const meta = parse(z.object({ date: isoDate, pose: z.enum(['frontal', 'lateral', 'posterior']) }), { date: field('date'), pose: field('pose') });
    const mime = sniffImage(buf);
    if (!mime) throw httpError(400, 'Formato não suportado (JPEG, PNG ou WebP)');
    const name = ctx.storage.save(req.userId, 'progress', buf, mime);
    // Peso do dia (ou o mais recente até a data) registrado junto da foto.
    const w = latestWeight(db, req.userId, meta.date);
    const id = Number(
      db.prepare('INSERT INTO progress_photos (user_id, date, pose, file_name, mime, weight_kg) VALUES (?,?,?,?,?,?)').run(req.userId, meta.date, meta.pose, name, mime, w?.weight_kg ?? null).lastInsertRowid,
    );
    return reply.code(201).send({ id });
  });

  app.get('/api/photos/:id/file', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const p = db.prepare('SELECT * FROM progress_photos WHERE id = ? AND user_id = ?').get(id, req.userId) as any;
    if (!p) throw notFound('Foto');
    reply.header('Cache-Control', 'private, max-age=3600').type(p.mime);
    return reply.send(ctx.fs.createReadStream(ctx.storage.path(req.userId, 'progress', p.file_name)));
  });

  app.delete('/api/photos/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const p = db.prepare('SELECT * FROM progress_photos WHERE id = ? AND user_id = ?').get(id, req.userId) as any;
    if (!p) throw notFound('Foto');
    db.prepare('DELETE FROM progress_photos WHERE id = ?').run(id);
    ctx.storage.remove(req.userId, 'progress', p.file_name);
    return { ok: true };
  });
}
