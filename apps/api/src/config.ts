import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), process.cwd().endsWith(path.join('apps', 'api')) ? '../..' : '.');

// Carrega o .env da raiz do projeto (variáveis já definidas no ambiente têm prioridade).
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile) && !process.env.VITEST) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (!process.env[m[1]] && value !== '') process.env[m[1]] = value;
  }
}

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
