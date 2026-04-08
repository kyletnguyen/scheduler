import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getDbPath(): string {
  // In Electron, use the userData directory so the DB is in a writable location
  if (process.env.SCHEDULER_DB_PATH) {
    return process.env.SCHEDULER_DB_PATH;
  }
  // Default: next to the server package (dev mode)
  return path.join(__dirname, '..', '..', 'scheduler.db');
}

const DB_PATH = getDbPath();

const db: DatabaseType = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations() {
  // Create migrations tracking table
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // In production build, SQL files are copied to dist/db/migrations by the build script
  const migrationsDir = process.env.SCHEDULER_MIGRATIONS_PATH
    ?? path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(r => r.name)
  );

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    ran++;
    console.log(`  Applied migration: ${file}`);
  }

  console.log(ran > 0 ? `Ran ${ran} new migration(s)` : 'Migrations up to date');
}

export default db;
