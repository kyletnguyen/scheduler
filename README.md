# Lab Scheduler

A desktop scheduling application for clinical laboratory staff. Automatically generates shift schedules across stations (Hematology, Chemistry, Microbiology, Blood Bank, Admin) while respecting employee constraints, weekend rotations, and staffing requirements.

Built with React, Express, SQLite, and Electron.

---

## Quick Start (for users)

### Download the installer

Go to the [Releases](../../releases) page and download the latest version for your OS:

- **Windows**: `Lab Scheduler Setup X.X.X.exe`
- **Mac**: `Lab Scheduler-X.X.X.dmg`

**Windows**: Run the installer and the app will install and launch automatically. No other software required.

**macOS**: The app is not code-signed, so macOS will block it by default. To install:

1. Open the DMG and drag **Lab Scheduler** to your **Applications** folder
2. **Right-click** (or Control-click) the app in Applications and choose **Open**
3. Click **Open** in the warning dialog that appears
4. After this first launch, the app will open normally with a double-click going forward

> As an alternative, you can run this in Terminal to remove the quarantine flag:
> ```bash
> xattr -cr /Applications/Lab\ Scheduler.app
> ```

> The database is stored locally on your machine. No internet connection or server setup needed.

---

## Development Setup

If you want to run from source or contribute:

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (v22 recommended)
- [pnpm](https://pnpm.io/) v8 or later

```bash
# Install pnpm if you don't have it
npm install -g pnpm
```

### Install and run

```bash
# Clone the repo
git clone https://github.com/kyletnguyen/scheduler.git
cd scheduler

# Install all dependencies (client + server)
pnpm install

# Start dev server (runs both client and API server)
pnpm dev
```

This starts:
- **API server** on `http://localhost:3001`
- **React dev server** on `http://localhost:5173`

Open `http://localhost:5173` in your browser.

### Run as a desktop app (Electron)

```bash
# Build everything and launch Electron in dev mode
pnpm electron:dev
```

---

## Building Installers

### Windows

```bash
pnpm electron:build
```

Output in `dist-electron/`:
- `Lab Scheduler Setup X.X.X.exe` — NSIS installer

### Mac

```bash
pnpm electron:build:mac
```

Output in `dist-electron/`:
- `Lab Scheduler-X.X.X.dmg`

> **Note**: Mac builds must be run on a Mac. Windows builds must be run on Windows. Cross-compilation of native modules (better-sqlite3) is not supported.

---

## Project Structure

```
scheduler/
  client/           React frontend (Vite + TypeScript)
    src/
      components/   UI components (calendar, employees, stations)
      hooks/        React Query hooks for API calls
      types.ts      Shared TypeScript types
  server/           Express API + SQLite (better-sqlite3)
    src/
      db/
        connection.ts   Database setup and migrations
        migrations/     SQL migration files (auto-applied on startup)
      routes/           REST API endpoints
      services/
        scheduleGenerator.ts   Core scheduling algorithm
  electron/         Electron main process
  scripts/          Build helpers
```

---

## How It Works

1. **Employees** are configured with a default shift (AM/PM/Night), role (CLS/MLT/Admin), and station qualifications
2. **Constraints** define rules per employee: weekend availability, blocked days, required shifts, off-day patterns
3. **Schedule generation** runs a multi-pass optimizer that:
   - Assigns weekend rotations (alternating A/B groups)
   - Places MLTs across stations (max 1 per station)
   - Rotates CLS through all qualified stations for balanced coverage
   - Enforces min/max staffing per station per shift
   - Respects time-off requests and employee constraints
4. **Warnings** flag understaffing, missing coverage, and scheduling conflicts

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React 18, TypeScript, Tailwind CSS, React Query |
| Backend   | Express, Zod validation             |
| Database  | SQLite via better-sqlite3           |
| Desktop   | Electron                            |
| Build     | Vite (client), esbuild (server bundle), electron-builder |

---

## License

Private / Internal Use
