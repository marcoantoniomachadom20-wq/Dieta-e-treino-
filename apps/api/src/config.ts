import path from 'node:path';

const root = path.resolve(process.cwd(), process.cwd().endsWith(path.join('apps', 'api')) ? '../..' : '.');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  isProd: process.env.NODE_ENV === 'production',
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(root, 'data')),
  webDist: path.join(root, 'apps', 'web', 'dist'),
  /** Cadastro aberto só enquanto não existe nenhum usuário, salvo se liberado explicitamente. */
  allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  sessionDays: 30,
  aiModel: process.env.AI_MODEL ?? 'claude-opus-5-5',
  anthropicKey: process.env.ANTHROPIC_API_KEY,
};
