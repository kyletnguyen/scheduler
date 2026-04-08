/**
 * Bundles the server into a single file for Electron packaging.
 * Uses esbuild to bundle everything except native modules (better-sqlite3).
 * Then copies better-sqlite3's native binding separately.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'electron-deps');

// Clean output
if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true });
}
fs.mkdirSync(path.join(OUT, 'server'), { recursive: true });

// Step 1: Bundle server with esbuild (everything except better-sqlite3)
console.log('Bundling server with esbuild...');
// Bundle as CJS so require() works in Electron's main process
// Use define to replace import.meta.url with a CJS-compatible expression
const esbuildBin = path.join(ROOT, 'node_modules', '.bin', 'esbuild');
execSync(
  `"${esbuildBin}" server/dist/index.js --bundle --platform=node --format=cjs --outfile=electron-deps/server/index.cjs --external:better-sqlite3 --define:import.meta.url=import_meta_url --banner:js="var import_meta_url = require('url').pathToFileURL(__filename).href;"`,
  { cwd: ROOT, stdio: 'inherit' }
);

// Step 2: Copy better-sqlite3 and its minimal deps (bindings, file-uri-to-path)
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const depsToInclude = ['better-sqlite3', 'bindings', 'file-uri-to-path'];
const nodeModulesOut = path.join(OUT, 'node_modules');
fs.mkdirSync(nodeModulesOut, { recursive: true });

for (const dep of depsToInclude) {
  // Resolve through pnpm symlinks
  const serverDir = path.join(ROOT, 'server');
  let pkgDir;
  try {
    const resolved = require.resolve(dep, { paths: [serverDir] });
    pkgDir = path.dirname(resolved);
    while (pkgDir !== path.parse(pkgDir).root) {
      if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
        const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
        if (pkg.name === dep) break;
      }
      pkgDir = path.dirname(pkgDir);
    }
  } catch {
    console.log(`  Warning: could not resolve ${dep}, skipping`);
    continue;
  }

  console.log(`  Copying ${dep} from ${pkgDir}`);
  copyDir(pkgDir, path.join(nodeModulesOut, dep));
}

// Step 3: Copy migrations
const migrationsOut = path.join(OUT, 'migrations');
copyDir(path.join(ROOT, 'server', 'src', 'db', 'migrations'), migrationsOut);

// Step 4: Copy client dist
const clientDistOut = path.join(OUT, 'client', 'dist');
copyDir(path.join(ROOT, 'client', 'dist'), clientDistOut);

console.log('Done! Electron package prepared at electron-deps/');
