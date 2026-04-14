import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import db, { runMigrations } from './db/connection.js';
import { errorHandler } from './middleware/errorHandler.js';
import employeesRouter from './routes/employees.js';
import shiftsRouter from './routes/shifts.js';
import schedulesRouter from './routes/schedules.js';
import timeOffRouter from './routes/timeOff.js';
import stationsRouter from './routes/stations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Run migrations on startup
runMigrations();

// Routes
app.use('/api/employees', employeesRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/schedule', schedulesRouter);
app.use('/api/time-off', timeOffRouter);
app.use('/api/stations', stationsRouter);

// Reset DB from seed file — uses SQLite backup so the connection stays alive
app.post('/api/reset-seed', (_req, res) => {
  const seedPath = process.env.SCHEDULER_SEED_PATH
    ?? (process.env.ELECTRON
      ? path.join((process as any).resourcesPath ?? '', 'app-resources', 'seed', 'scheduler.db')
      : path.join(__dirname, '..', 'seed', 'scheduler.db'));

  if (!fs.existsSync(seedPath)) {
    return res.status(404).json({ error: 'Seed database not found' });
  }

  try {
    // Open seed DB read-only, copy data table by table into live DB
    const seedDb = new Database(seedPath, { readonly: true });

    // Get all table names from seed (excluding internal tables)
    const tables = seedDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'"
    ).all() as { name: string }[];

    db.exec('PRAGMA foreign_keys = OFF');

    // Clear existing data and copy from seed
    for (const { name } of tables) {
      db.exec(`DELETE FROM "${name}"`);
      const rows = seedDb.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(', ');
      const insert = db.prepare(`INSERT OR REPLACE INTO "${name}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`);
      const insertAll = db.transaction(() => {
        for (const row of rows) insert.run(...cols.map(c => row[c]));
      });
      insertAll();
    }

    db.exec('PRAGMA foreign_keys = ON');
    seedDb.close();

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// In production/Electron, serve the built client
const clientDist = process.env.SCHEDULER_CLIENT_PATH
  ?? path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(errorHandler);

export function startServer() {
  return app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only auto-start when run directly (not when imported by Electron)
if (!process.env.ELECTRON) {
  startServer();
}
