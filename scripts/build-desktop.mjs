// Builds everything the desktop app needs (does NOT touch the UI source):
//   1. vite build            -> dist/          (the original frontend)
//   2. esbuild               -> electron/server.cjs (the original api/index.ts backend + static serving)
//   3. copy ffmpeg/ffprobe   -> build-bin/     (bundled so transcoding works out of the box)
import { execSync } from 'node:child_process';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);

console.log('\n[1/3] Building frontend (vite)...');
execSync('npx vite build', { stdio: 'inherit' });

console.log('\n[2/3] Bundling backend (esbuild)...');
await build({
  entryPoints: ['electron/server-entry.ts'],
  outfile: 'electron/server.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  logLevel: 'info',
  // `import.meta` is not used by the backend; keep a safe fallback anyway.
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
});

console.log('\n[3/3] Collecting ffmpeg / ffprobe...');
const binDir = path.join(root, 'build-bin');
fs.rmSync(binDir, { recursive: true, force: true });
fs.mkdirSync(binDir, { recursive: true });
const exe = process.platform === 'win32' ? '.exe' : '';
try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    fs.copyFileSync(ffmpegPath, path.join(binDir, 'ffmpeg' + exe));
    console.log('  ffmpeg  OK');
  } else console.warn('  ffmpeg binary not found (continuing without it)');
} catch (e) {
  console.warn('  ffmpeg-static unavailable (continuing without it):', e.message);
}
try {
  const ffprobePath = require('ffprobe-static').path;
  if (ffprobePath && fs.existsSync(ffprobePath)) {
    fs.copyFileSync(ffprobePath, path.join(binDir, 'ffprobe' + exe));
    console.log('  ffprobe OK');
  } else console.warn('  ffprobe binary not found (continuing without it)');
} catch (e) {
  console.warn('  ffprobe-static unavailable (continuing without it):', e.message);
}

console.log('\nDesktop files ready.');
