import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
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

// Reset DB from seed file
app.post('/api/reset-seed', (_req, res) => {
  const dbPath = process.env.SCHEDULER_DB_PATH;
  if (!dbPath) {
    return res.status(400).json({ error: 'No DB path configured (dev mode — copy server/seed/scheduler.db to server/scheduler.db manually)' });
  }
  const seedPath = process.env.SCHEDULER_SEED_PATH
    ?? (process.env.ELECTRON
      ? path.join((process as any).resourcesPath ?? '', 'app-resources', 'seed', 'scheduler.db')
      : path.join(__dirname, '..', 'seed', 'scheduler.db'));

  if (!fs.existsSync(seedPath)) {
    return res.status(404).json({ error: 'Seed database not found' });
  }

  try {
    db.close();
    fs.copyFileSync(seedPath, dbPath);
    res.json({ ok: true, message: 'Database reset to seed data. Restart the app to apply.' });
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
