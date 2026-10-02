import path from 'node:path';
import { buildApp } from './app';
import { config } from './config';
import { openDb } from './db';
import { createMealAnalyzer } from './services/ai';

const db = openDb(path.join(config.dataDir, 'app.db'));
const analyzer = createMealAnalyzer();
const app = await buildApp({
  db,
  analyzer,
  uploadsDir: path.join(config.dataDir, 'uploads'),
  allowRegistration: config.allowRegistration,
  webDist: config.webDist,
  logger: true,
});

await app.listen({ port: config.port, host: config.host });
app.log.info(`Análise de refeição por foto: ${analyzer.name}`);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
