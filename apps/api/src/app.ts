import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db';
import type { MealAnalyzer } from './services/ai';
import { PhotoStorage, MAX_IMAGE_BYTES } from './storage';
import { authRoutes } from './routes/auth';
import { profileRoutes } from './routes/profile';
import { workoutRoutes } from './routes/workouts';
import { nutritionRoutes } from './routes/nutrition';
import { bodyRoutes } from './routes/body';
import { trackingRoutes } from './routes/tracking';
import { dataRoutes } from './routes/data';

export interface AppContext {
  db: DB;
  analyzer: MealAnalyzer;
  storage: PhotoStorage;
  allowRegistration: boolean;
  fs: typeof fs;
}

export interface BuildOptions {
  db: DB;
  analyzer: MealAnalyzer;
  uploadsDir: string;
  allowRegistration?: boolean;
  webDist?: string;
  logger?: boolean;
}

export async function buildApp(o: BuildOptions) {
  const app = Fastify({ logger: o.logger ?? false, trustProxy: true, bodyLimit: 1024 * 1024 });
  const ctx: AppContext = { db: o.db, analyzer: o.analyzer, storage: new PhotoStorage(o.uploadsDir), allowRegistration: !!o.allowRegistration, fs };

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 } });

  // Cabeçalhos de segurança.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(self), geolocation=()');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
  });

  // Proteção CSRF adicional ao SameSite=Strict: mutações só da mesma origem.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || !req.url.startsWith('/api/')) return;
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return reply.code(403).send({ error: 'Origem não permitida' });
      } catch {
        return reply.code(403).send({ error: 'Origem inválida' });
      }
    }
  });

  app.setErrorHandler((err: any, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'Arquivo muito grande' });
    if (err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(415).send({ error: 'Tipo de conteúdo não suportado' });
    if (err.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || err.code === 'FST_ERR_CTP_INVALID_JSON_BODY') return reply.code(400).send({ error: 'JSON inválido' });
    reply.code(status).send({ error: status >= 500 && status !== 503 && status !== 502 ? 'Erro interno' : err.message });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(async (s) => authRoutes(s, ctx));
  await app.register(async (s) => profileRoutes(s, ctx));
  await app.register(async (s) => workoutRoutes(s, ctx));
  await app.register(async (s) => nutritionRoutes(s, ctx));
  await app.register(async (s) => bodyRoutes(s, ctx));
  await app.register(async (s) => trackingRoutes(s, ctx));
  await app.register(async (s) => dataRoutes(s, ctx));

  // Frontend compilado (produção): um único processo serve API + SPA.
  if (o.webDist && fs.existsSync(path.join(o.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: o.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Rota não encontrada' });
      return reply.type('text/html').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Rota não encontrada' }));
  }

  return app;
}
