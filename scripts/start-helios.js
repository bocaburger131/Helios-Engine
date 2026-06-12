const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const children = [];
let shuttingDown = false;

function run(label, command, folder) {
  const child = spawn(command, {
    cwd: path.join(ROOT, folder),
    shell: true,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
      return;
    }
    if (signal) {
      console.error(`[${label}] exited due to signal ${signal}`);
      shutdown(1);
    }
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting Helios (API+worker + dashboard)...');
console.log('');
console.log('Local E2E tips:');
console.log('  - Mongo and Redis must be reachable');
console.log('  - API .env: DISABLE_AUTH=true, LAYOUT_FIRST_SHADOW=true (optional)');
console.log('  - Dashboard .env.local: NEXT_PUBLIC_HELIOS_API_URL=http://localhost:3000');
console.log('');
console.log('URLs:');
console.log('  API:       http://localhost:3000');
console.log('  Upload:    http://localhost:3002/test/upload');
console.log('  Dashboard: http://localhost:3002');
console.log('');

run('api', 'npm run dev:all', 'bank-statement-analyzer-api');
run('dashboard', 'npm run dev', 'helios-dashboard');
