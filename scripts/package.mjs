import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const files = [
  'manifest.json', 'index.html', 'popup.html', 'LICENSE',
  ...[16, 32, 48, 128].map(size => `icons/icon-${size}.png`),
  ...['app.js', 'api.js', 'styles.css', 'property.js', 'property.css', 'finance.js', 'scientific.js', 'tools.css']
    .map(name => `src/${name}`),
];

mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(join(dist, '.package-'));
try {
  const archive = join(staging, 'property-desk-calc.zip');
  execFileSync('zip', ['-q', '-X', archive, ...files], { cwd: root, stdio: 'inherit' });
  renameSync(archive, join(dist, 'property-desk-calc.zip'));
  console.log('Created dist/property-desk-calc.zip');
} finally {
  rmSync(staging, { recursive: true, force: true });
}
