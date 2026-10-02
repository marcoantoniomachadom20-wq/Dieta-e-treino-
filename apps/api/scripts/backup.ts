/**
 * Backup consistente: usa a API de backup online do SQLite (seguro com o servidor rodando)
 * e copia a pasta de uploads. Mantém os 14 backups mais recentes.
 *   npm run backup            → backups/AAAA-MM-DDTHH-MM-SS/
 *   BACKUP_DIR=/mnt/x npm run backup
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../src/config';

const dbFile = path.join(config.dataDir, 'app.db');
if (!fs.existsSync(dbFile)) {
  console.error(`Banco não encontrado em ${dbFile}`);
  process.exit(1);
}
const base = path.resolve(process.env.BACKUP_DIR ?? path.join(config.dataDir, '..', 'backups'));
const dest = path.join(base, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
fs.mkdirSync(dest, { recursive: true, mode: 0o700 });

const db = new Database(dbFile, { readonly: true });
await db.backup(path.join(dest, 'app.db'));
db.close();

const uploads = path.join(config.dataDir, 'uploads');
if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dest, 'uploads'), { recursive: true });

const all = fs.readdirSync(base).filter((d) => /^\d{4}-/.test(d)).sort();
for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.rmSync(path.join(base, old), { recursive: true, force: true });

console.log(`Backup salvo em ${dest}`);
