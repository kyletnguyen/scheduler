const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;
let server;

const PORT = 3001;

async function startServer() {
  const isPacked = app.isPackaged;

  // Set environment so the server knows it's inside Electron
  process.env.ELECTRON = '1';
  process.env.PORT = String(PORT);
  process.env.SCHEDULER_DB_PATH = path.join(app.getPath('userData'), 'scheduler.db');

  if (isPacked) {
    // In packaged app, everything is in resources/app-resources/
    const resDir = path.join(process.resourcesPath, 'app-resources');
    process.env.SCHEDULER_MIGRATIONS_PATH = path.join(resDir, 'migrations');
    process.env.SCHEDULER_CLIENT_PATH = path.join(resDir, 'client', 'dist');

    // Add the bundled node_modules to the module search path so better-sqlite3 can be found
    const Module = require('module');
    const originalResolveFilename = Module._resolveFilename;
    const bundledNodeModules = path.join(resDir, 'node_modules');
    Module._resolveFilename = function (request, parent, isMain, options) {
      if (request === 'better-sqlite3' || request === 'bindings' || request === 'file-uri-to-path') {
        return originalResolveFilename.call(this, request, parent, isMain, {
          ...options,
          paths: [bundledNodeModules, ...(options?.paths || [])],
        });
      }
      return originalResolveFilename.call(this, request, parent, isMain, options);
    };

    const serverEntry = path.join(resDir, 'server', 'index.cjs');
    const serverModule = require(serverEntry);
    server = serverModule.startServer();
  } else {
    // Dev mode — import compiled server directly
    process.env.SCHEDULER_MIGRATIONS_PATH = path.join(__dirname, '..', 'server', 'src', 'db', 'migrations');
    const serverEntry = path.join(__dirname, '..', 'server', 'dist', 'index.js');
    const serverModule = await import(`file://${serverEntry.replace(/\\/g, '/')}`);
    server = serverModule.startServer();
  }

  // Wait for the server to bind
  return new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Lab Scheduler',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});
