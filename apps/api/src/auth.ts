import type {} from '@fastify/cookie';
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from './db';
import { config } from './config';

export const SESSION_COOKIE = 'pp_session';

/** Hash de senha com scrypt (nativo do Node, sem dependência nativa extra). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(db: DB, userId: number): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires.toISOString());
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  return { token, expires };
}

export function destroySession(db: DB, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
}

export function userIdFromToken(db: DB, token: string | undefined): number | null {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(sha256(token)) as
    | { user_id: number; expires_at: string }
    | undefined;
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return row.user_id;
}

export function setSessionCookie(reply: FastifyReply, token: string, expires: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    expires,
  });
}

/** Limitador simples em memória para tentativas de login (por IP + e-mail). */
const attempts = new Map<string, { count: number; until: number }>();
export function loginRateLimited(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.count >= 5 && a.until > Date.now();
}
export function registerLoginFailure(key: string) {
  const a = attempts.get(key);
  const now = Date.now();
  if (!a || a.until < now) attempts.set(key, { count: 1, until: now + 15 * 60_000 });
  else a.count++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: number;
  }
}

export function requireAuth(db: DB) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = userIdFromToken(db, req.cookies[SESSION_COOKIE]);
    if (!uid) return reply.code(401).send({ error: 'Não autenticado' });
    req.userId = uid;
  };
}
