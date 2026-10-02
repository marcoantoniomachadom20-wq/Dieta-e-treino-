import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app';
import { openDb } from '../src/db';
import { finalizeAnalysis } from '../src/services/ai/finalize';
import type { MealAnalyzer } from '../src/services/ai';
import { todayInTz, addDays, weekStart } from '@app/core';

const TZ = 'America/Sao_Paulo';
const today = todayInTz(TZ);
// JPEG mínimo válido (cabeçalho FFD8FF) — suficiente para a checagem de assinatura.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);

const fakeAnalyzer: MealAnalyzer = {
  name: 'fake',
  async analyzeMeal() {
    return finalizeAnalysis({
      foods: [
        { name: 'Arroz branco cozido', estimated_grams: 150, calories: 192, protein: 3.8, carbs: 42, fat: 0.3, preparation: 'cozido', confidence: 0.8 },
        { name: 'Frango grelhado', estimated_grams: 150, calories: 900, protein: 48, carbs: 0, fat: 3.8, preparation: 'grelhado', confidence: 0.7 },
      ],
      confidence: 0.78,
      assumptions: ['Óleo de preparo não visível'],
      questions: [],
      provider: 'fake',
    });
  },
};

let app: Awaited<ReturnType<typeof buildApp>>;
let dir: string;
let cookie = '';

function multipart(fields: Record<string, string>, file: Buffer, filename = 'p.jpg') {
  const boundary = '----t' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`), file, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const req = (method: string, url: string, payload?: unknown, c = cookie) =>
  app.inject({ method: method as any, url, payload: payload as any, headers: c ? { cookie: c } : {} });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  app = await buildApp({ db: openDb(path.join(dir, 'test.db')), analyzer: fakeAnalyzer, uploadsDir: path.join(dir, 'uploads') });
});
afterAll(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('autenticação', () => {
  it('bloqueia acesso sem login', async () => {
    expect((await req('GET', '/api/dashboard', undefined, '')).statusCode).toBe(401);
  });
  it('valida cadastro', async () => {
    const r = await req('POST', '/api/auth/register', { email: 'x', password: '1', name: '' }, '');
    expect(r.statusCode).toBe(400);
  });
  it('cadastra o primeiro usuário com perfil inicial', async () => {
    const r = await req('POST', '/api/auth/register', { email: 'eu@teste.com', password: 'senha-forte-123', name: 'Atleta', age: 19, sex: 'masculino', height_cm: 175, initial_weight_kg: 75 }, '');
    expect(r.statusCode).toBe(201);
    const set = r.headers['set-cookie'] as string;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    cookie = set.split(';')[0];
  });
  it('fecha o cadastro após o primeiro usuário', async () => {
    const r = await req('POST', '/api/auth/register', { email: 'outro@teste.com', password: 'senha-forte-123', name: 'Outro' }, '');
    expect(r.statusCode).toBe(403);
  });
  it('login com senha errada falha e limita tentativas', async () => {
    for (let i = 0; i < 5; i++) expect((await req('POST', '/api/auth/login', { email: 'eu@teste.com', password: 'errada' }, '')).statusCode).toBe(401);
    expect((await req('POST', '/api/auth/login', { email: 'eu@teste.com', password: 'senha-forte-123' }, '')).statusCode).toBe(429);
  });
  it('rejeita mutação de outra origem', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/water', payload: { date: today, ml: 250 }, headers: { cookie, origin: 'https://evil.example', host: 'localhost' } });
    expect(r.statusCode).toBe(403);
  });
});

describe('dashboard e plano', () => {
  it('dashboard traz metas iniciais e peso', async () => {
    const r = await req('GET', '/api/dashboard');
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.nutrition.targets.calories).toBe(2350);
    expect(d.nutrition.targets.protein).toBe(160);
    expect(d.weight.current).toBe(75);
    expect(typeof d.recommendation).toBe('string');
  });
  it('gera a semana com esportes e musculação sem dias duplicados', async () => {
    const r = await req('GET', '/api/plan/week');
    const w = r.json();
    const lifts = w.sessions.filter((s: any) => s.type === 'musculacao');
    expect(new Set(lifts.map((l: any) => l.date)).size).toBe(lifts.length);
    expect(w.sessions.every((s: any) => s.date >= today)).toBe(true);
  });
});

describe('treino', () => {
  let workoutId: number;
  it('cria, inicia e registra séries de um treino', async () => {
    // Remove eventual musculação planejada hoje e cria uma manual (independe do dia da semana do teste).
    const week = (await req('GET', '/api/plan/week')).json();
    for (const s of week.sessions.filter((s: any) => s.type === 'musculacao' && s.date === today)) await req('DELETE', `/api/workouts/${s.id}`);
    const c = await req('POST', '/api/workouts', { type: 'musculacao', date: today, template_code: 'A', planned_time: '06:00' });
    expect(c.statusCode).toBe(201);
    workoutId = c.json().id;
    expect(c.json().preview.length).toBeGreaterThan(3);
    const dup = await req('POST', '/api/workouts', { type: 'musculacao', date: today, template_code: 'B' });
    expect(dup.statusCode).toBe(409);

    const s = await req('POST', `/api/workouts/${workoutId}/start`);
    const w = s.json();
    expect(w.status).toBe('em_andamento');
    const ex = w.exercises[0];
    expect(ex.sets.length).toBeGreaterThanOrEqual(2);
    const bad = await req('PATCH', `/api/sets/${ex.sets[0].id}`, { completed: true });
    expect(bad.statusCode).toBe(400);
    for (const set of ex.sets) {
      const u = await req('PATCH', `/api/sets/${set.id}`, { weight_kg: 60, reps: 10, rir: 2, completed: true });
      expect(u.statusCode).toBe(200);
    }
    const note = await req('PATCH', `/api/workout-exercises/${ex.id}`, { notes: 'Boa execução' });
    expect(note.json().exercises[0].notes).toBe('Boa execução');
  });
  it('conclui com RPE, calcula volume e duração', async () => {
    expect((await req('POST', `/api/workouts/${workoutId}/complete`, { rpe: 11 })).statusCode).toBe(400);
    const r = await req('POST', `/api/workouts/${workoutId}/complete`, { rpe: 7, duration_min: 52, notes: 'ok' });
    expect(r.statusCode).toBe(200);
    const w = r.json();
    expect(w.status).toBe('concluido');
    expect(w.duration_min).toBe(52);
    expect(w.volume_kg).toBeGreaterThan(0);
    expect((await req('POST', `/api/workouts/${workoutId}/complete`, { rpe: 7 })).statusCode).toBe(409);
  });
  it('sugere progressão na próxima sessão', async () => {
    const tomorrow = addDays(today, 1);
    const ex = await req('GET', '/api/performance/exercises');
    expect(ex.json()[0].sessions).toBe(1);
    // Nova sessão A em outro dia da mesma semana, se houver espaço.
    if (weekStart(tomorrow) === weekStart(today)) {
      const week = (await req('GET', '/api/plan/week')).json();
      for (const s of week.sessions.filter((s: any) => s.type === 'musculacao' && s.date === tomorrow)) await req('DELETE', `/api/workouts/${s.id}`);
      const c = (await req('POST', '/api/workouts', { type: 'musculacao', date: tomorrow, template_code: 'A' })).json();
      const supino = c.preview.find((p: any) => p.name === 'Supino reto com barra');
      expect(supino.suggestion.weight_kg).toBe(62.5);
    }
  });
  it('registra esporte avulso com RPE e desempenho', async () => {
    const c = (await req('POST', '/api/workouts', { type: 'tenis', date: today, planned_time: '19:00' })).json();
    const r = await req('POST', `/api/workouts/${c.id}/complete`, { rpe: 8, duration_min: 90, games: 2, performance_rating: 4, intensity: 'intensa' });
    expect(r.statusCode).toBe(200);
    const sports = (await req('GET', '/api/performance/sports?type=tenis')).json();
    expect(sports.summary.count30).toBe(1);
  });
  it('pular treino reorganiza sem duplicar', async () => {
    const week = (await req('GET', '/api/plan/week')).json();
    const planned = week.sessions.find((s: any) => s.type === 'musculacao' && s.status === 'planejado');
    if (!planned) return; // fim de semana sem sessões restantes
    const r = await req('POST', `/api/workouts/${planned.id}/skip`, { reason: 'Prova' });
    expect(r.statusCode).toBe(200);
    const after = (await req('GET', '/api/plan/week')).json();
    const lifts = after.sessions.filter((s: any) => s.type === 'musculacao' && s.status !== 'pulado');
    expect(new Set(lifts.map((l: any) => l.date)).size).toBe(lifts.length);
    const codes = lifts.map((l: any) => l.template_code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('histórico do mês', async () => {
    const r = (await req('GET', '/api/history')).json();
    expect(r.stats.total).toBeGreaterThanOrEqual(2);
    expect(r.days[today].length).toBeGreaterThan(0);
  });
});

describe('dieta', () => {
  it('registra pela biblioteca e calcula restantes', async () => {
    const foods = (await req('GET', '/api/foods?q=frango')).json();
    const frango = foods[0];
    const r = await req('POST', '/api/nutrition/entries', { date: today, meal: 'almoco', food_item_id: frango.id, quantity_g: 150 });
    expect(r.statusCode).toBe(201);
    const day = r.json().day;
    expect(day.totals.protein).toBe(48);
    expect(day.progress.protein.remaining).toBe(112);
    expect(day.progress.calories.remaining).toBe(2350 - day.totals.calories);
  });
  it('registro manual valida entrada', async () => {
    expect((await req('POST', '/api/nutrition/entries', { date: today, meal: 'almoco', name: 'X', quantity_g: -5, calories: 1, protein: 1, carbs: 1, fat: 1 })).statusCode).toBe(400);
    expect((await req('POST', '/api/nutrition/entries', { date: '2026-02-30', meal: 'almoco', name: 'X', quantity_g: 5, calories: 1, protein: 1, carbs: 1, fat: 1 })).statusCode).toBe(400);
    expect((await req('POST', '/api/nutrition/entries', { date: today, meal: 'brunch', name: 'X', quantity_g: 5, calories: 1, protein: 1, carbs: 1, fat: 1 })).statusCode).toBe(400);
    const ok = await req('POST', '/api/nutrition/entries', { date: today, meal: 'jantar', name: 'Marmita', quantity_g: 400, calories: 600, protein: 40, carbs: 60, fat: 20, save_to_library: true });
    expect(ok.statusCode).toBe(201);
  });
  it('edita quantidade reescalando macros e exclui', async () => {
    const day = (await req('GET', `/api/nutrition/day?date=${today}`)).json();
    const e = day.entries.find((x: any) => x.name === 'Marmita');
    const r = (await req('PATCH', `/api/nutrition/entries/${e.id}`, { quantity_g: 200 })).json();
    expect(r.day.entries.find((x: any) => x.id === e.id).calories).toBe(300);
    await req('DELETE', `/api/nutrition/entries/${e.id}`);
    const d2 = (await req('GET', `/api/nutrition/day?date=${today}`)).json();
    expect(d2.entries.find((x: any) => x.id === e.id)).toBeUndefined();
  });
  it('água', async () => {
    await req('POST', '/api/water', { date: today, ml: 500 });
    const r = (await req('POST', '/api/water', { date: today, ml: 250 })).json();
    expect(r.water.consumed).toBe(750);
    expect((await req('POST', '/api/water', { date: today, ml: -2000 })).statusCode).toBe(400);
  });
  it('refeição favorita', async () => {
    const c = await req('POST', '/api/favorite-meals', { name: 'Meu almoço padrão', date: today, meal: 'almoco' });
    expect(c.statusCode).toBe(201);
    const r = (await req('POST', `/api/favorite-meals/${c.json().id}/apply`, { date: addDays(today, -1) })).json();
    expect(r.day.entries.length).toBe(1);
    expect(r.day.entries[0].source).toBe('favorita');
  });
  it('foto: analisa (sem gravar) e confirma com correções', async () => {
    const mp = multipart({ hint: 'almoço' }, JPEG);
    const a = await app.inject({ method: 'POST', url: '/api/meals/analyze', payload: mp.payload, headers: { ...mp.headers, cookie } });
    expect(a.statusCode).toBe(200);
    const { analysis, photo_id } = a.json();
    // Frango com kcal inconsistente foi corrigido pelo servidor e sinalizado.
    expect(analysis.warnings.length).toBe(1);
    expect(analysis.total.calories).toBeLessThan(500);
    const before = (await req('GET', `/api/nutrition/day?date=${today}`)).json().entries.length;
    expect(before).toBe(1);
    const items = analysis.foods.map((f: any) => ({ name: f.name, quantity_g: f.estimated_grams, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat }));
    items[0].quantity_g = 200;
    const c = await req('POST', '/api/meals/confirm', { date: today, meal: 'jantar', photo_id, confidence: analysis.confidence, items });
    expect(c.statusCode).toBe(201);
    expect(c.json().day.entries.filter((e: any) => e.source === 'foto_ia').length).toBe(2);
    const img = await req('GET', `/api/meal-photos/${photo_id}/file`);
    expect(img.statusCode).toBe(200);
  });
  it('rejeita arquivo que não é imagem', async () => {
    const mp = multipart({}, Buffer.from('<?php echo 1; ?>'), 'x.jpg');
    const a = await app.inject({ method: 'POST', url: '/api/meals/analyze', payload: mp.payload, headers: { ...mp.headers, cookie } });
    expect(a.statusCode).toBe(400);
  });
  it('metas com vigência', async () => {
    const r = await req('PUT', '/api/profile/targets', { calories: 2300, protein: 165, carbs: 250, fat: 70, water_ml: 3000 });
    expect(r.statusCode).toBe(200);
    expect(r.json().targets.protein).toBe(165);
    expect((await req('PUT', '/api/profile/targets', { calories: 200, protein: 165, carbs: 250, fat: 70, water_ml: 3000 })).statusCode).toBe(400);
  });
});

describe('corpo e recuperação', () => {
  it('peso: uma pesagem por dia, estatísticas e médias', async () => {
    for (let i = 10; i >= 1; i--) await req('POST', '/api/weight', { date: addDays(today, -i), weight_kg: 75 - (10 - i) * 0.1 });
    await req('POST', '/api/weight', { date: today, weight_kg: 74.0 });
    const up = await req('POST', '/api/weight', { date: today, weight_kg: 74.1 });
    expect(up.statusCode).toBe(201);
    const w = (await req('GET', '/api/weight')).json();
    expect(w.stats.current).toBe(74.1);
    expect(w.stats.avg7).toBeGreaterThan(74);
    expect(w.entries.filter((e: any) => e.date === today).length).toBe(1);
    expect((await req('POST', '/api/weight', { date: addDays(today, 3), weight_kg: 74 })).statusCode).toBe(400);
    expect((await req('POST', '/api/weight', { date: today, weight_kg: 900 })).statusCode).toBe(400);
  });
  it('medidas exigem método para % de gordura', async () => {
    expect((await req('POST', '/api/measurements', { date: today, body_fat: 15 })).statusCode).toBe(400);
    expect((await req('POST', '/api/measurements', { date: today, waist: 82, arm: 35 })).statusCode).toBe(201);
  });
  it('fotos de evolução privadas', async () => {
    const mp = multipart({ date: today, pose: 'frontal' }, JPEG);
    const r = await app.inject({ method: 'POST', url: '/api/photos', payload: mp.payload, headers: { ...mp.headers, cookie } });
    expect(r.statusCode).toBe(201);
    const list = (await req('GET', '/api/photos')).json();
    expect(list[0].weight_kg).toBe(74.1);
    expect(list[0].measurement.waist).toBe(82);
    expect((await req('GET', `/api/photos/${list[0].id}/file`, undefined, '')).statusCode).toBe(401);
    expect((await req('GET', `/api/photos/${list[0].id}/file`)).statusCode).toBe(200);
  });
  it('check-in de recuperação gera status e recomendação', async () => {
    const r = await req('POST', '/api/recovery', { date: today, sleep_hours: 5, sleep_quality: 2, energy: 2, soreness: 4, stress: 4, motivation: 2 });
    expect(r.statusCode).toBe(201);
    expect(r.json().status).toBe('baixa');
    expect(r.json().recommendation).toBeTruthy();
    expect((await req('POST', '/api/recovery', { date: today, sleep_quality: 6, energy: 2, soreness: 4, stress: 4, motivation: 2 })).statusCode).toBe(400);
  });
  it('energia: balanço como faixa', async () => {
    const r = await req('POST', '/api/energy', { date: today, active_calories: 680, total_calories: 2850, steps: 9000 });
    expect(r.statusCode).toBe(201);
    const b = r.json().balance;
    expect(b.balanceLow).toBeLessThan(b.balance);
    expect(b.expenditure.value).toBe(2850);
    expect((await req('POST', '/api/energy', { date: today, active_calories: 3000, total_calories: 2850 })).statusCode).toBe(400);
  });
});

describe('relatórios, metas e exportação', () => {
  it('relatório semanal', async () => {
    const r = await req('GET', `/api/reports/weekly?week=${today}`);
    expect(r.statusCode).toBe(200);
    expect(r.json().training.lifts.done).toBeGreaterThanOrEqual(1);
    expect(typeof r.json().summary).toBe('string');
  });
  it('metas com progresso', async () => {
    const g = (await req('GET', '/api/goals')).json().goals;
    const lifts = g.find((x: any) => x.kind === 'musculacao_semana');
    expect(lifts.current).toBeGreaterThanOrEqual(1);
    const peso = g.find((x: any) => x.kind === 'peso_alvo');
    expect(peso.pct).toBeGreaterThan(0);
    const c = await req('POST', '/api/goals', { horizon: 'medio', kind: 'carga_exercicio', title: 'Supino 80 kg', target_value: 80, exercise_name: 'Supino reto com barra' });
    expect(c.statusCode).toBe(201);
  });
  it('exporta todos os dados', async () => {
    const r = await req('GET', '/api/export');
    expect(r.statusCode).toBe(200);
    expect(r.json().food_entries.length).toBeGreaterThan(0);
    expect(r.json().user.password_hash).toBeUndefined();
    expect((await req('GET', '/api/auth/me')).json().user.password_hash).toBeUndefined();
  });
  it('persiste após reabrir o banco', async () => {
    const db2 = openDb(path.join(dir, 'test.db'));
    const n = (db2.prepare('SELECT COUNT(*) n FROM food_entries').get() as { n: number }).n;
    expect(n).toBeGreaterThan(0);
    db2.close();
  });
});

describe('isolamento entre usuários', () => {
  it('um usuário não acessa dados de outro', async () => {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pp2-'));
    const db = openDb(path.join(d2, 't.db'));
    const app2 = await buildApp({ db, analyzer: fakeAnalyzer, uploadsDir: path.join(d2, 'u'), allowRegistration: true });
    const reg = async (email: string) =>
      ((await app2.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'senha-forte-123', name: email } })).headers['set-cookie'] as string).split(';')[0];
    const a = await reg('a@a.com');
    const b = await reg('b@b.com');
    const e = await app2.inject({ method: 'POST', url: '/api/nutrition/entries', payload: { date: today, meal: 'almoco', name: 'Secreto', quantity_g: 100, calories: 100, protein: 10, carbs: 10, fat: 1 }, headers: { cookie: a } });
    const id = e.json().id;
    expect((await app2.inject({ method: 'DELETE', url: `/api/nutrition/entries/${id}`, headers: { cookie: b } })).statusCode).toBe(404);
    const day = (await app2.inject({ method: 'GET', url: `/api/nutrition/day?date=${today}`, headers: { cookie: b } })).json();
    expect(day.entries.length).toBe(0);
    await app2.close();
    fs.rmSync(d2, { recursive: true, force: true });
  });
});
