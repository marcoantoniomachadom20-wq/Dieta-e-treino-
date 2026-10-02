import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app';
import {
  clearLoginFailures,
  createSession,
  destroySession,
  hashPassword,
  loginRateLimited,
  registerLoginFailure,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
} from '../auth';
import { createUserWithDefaults } from '../seed';
import { getUser, publicUser } from '../services/users';
import { parse } from './_util';
import { todayInTz } from '@app/core';

const RegisterSchema = z.object({
  email: z.string().email('E-mail inválido').max(200),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(200),
  name: z.string().trim().min(1).max(80),
  age: z.number().int().min(12).max(100).default(19),
  sex: z.enum(['masculino', 'feminino']).default('masculino'),
  height_cm: z.number().min(120).max(230).default(175),
  initial_weight_kg: z.number().min(30).max(250).default(75),
  goal: z.enum(['perda_gordura', 'recomposicao', 'ganho_massa', 'manutencao']).default('perda_gordura'),
  timezone: z.string().default('America/Sao_Paulo'),
});

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const registrationOpen = () => ctx.allowRegistration || (db.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n === 0;

  app.get('/api/auth/status', async () => ({ registrationOpen: registrationOpen(), aiEnabled: ctx.analyzer.name !== 'indisponivel' }));

  app.post('/api/auth/register', async (req, reply) => {
    if (!registrationOpen()) return reply.code(403).send({ error: 'Cadastro fechado. Este sistema já tem um usuário.' });
    const body = parse(RegisterSchema, req.body);
    try {
      Intl.DateTimeFormat('en', { timeZone: body.timezone });
    } catch {
      return reply.code(400).send({ error: 'Fuso horário inválido' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) return reply.code(409).send({ error: 'E-mail já cadastrado' });
    const { password, ...rest } = body;
    const userId = createUserWithDefaults(db, { ...rest, password_hash: hashPassword(password) }, todayInTz(body.timezone));
    // Registra o peso inicial como primeira pesagem.
    db.prepare('INSERT INTO weight_entries (user_id, date, weight_kg, notes) VALUES (?, ?, ?, ?)').run(userId, todayInTz(body.timezone), body.initial_weight_kg, 'Peso inicial');
    const s = createSession(db, userId);
    setSessionCookie(reply, s.token, s.expires);
    return reply.code(201).send({ user: publicUser(getUser(db, userId)) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = parse(z.object({ email: z.string().max(200), password: z.string().max(200) }), req.body);
    const key = `${req.ip}|${body.email.toLowerCase()}`;
    if (loginRateLimited(key)) return reply.code(429).send({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(body.email) as { id: number; password_hash: string } | undefined;
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      registerLoginFailure(key);
      return reply.code(401).send({ error: 'E-mail ou senha incorretos' });
    }
    clearLoginFailures(key);
    const s = createSession(db, row.id);
    setSessionCookie(reply, s.token, s.expires);
    return { user: publicUser(getUser(db, row.id)) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    destroySession(db, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth(db) }, async (req) => ({ user: publicUser(getUser(db, req.userId)) }));

  app.put('/api/auth/password', { preHandler: requireAuth(db) }, async (req, reply) => {
    const body = parse(z.object({ current: z.string(), next: z.string().min(8).max(200) }), req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId) as { password_hash: string };
    if (!verifyPassword(body.current, row.password_hash)) return reply.code(400).send({ error: 'Senha atual incorreta' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.next), req.userId);
    // Invalida as outras sessões.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.userId);
    const s = createSession(db, req.userId);
    setSessionCookie(reply, s.token, s.expires);
    return { ok: true };
  });
}
