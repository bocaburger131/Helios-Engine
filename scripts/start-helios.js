const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const children = [];
let shuttingDown = false;

function run(label, command, folder) {
  const child = spawn(command, {
    cwd: path.join(ROOT, folder),
    shell: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const forward = (stream) => (buf) => {
    const text = buf.toString('utf8');
    process[stream].write(text);
  };
  child.stdout?.on('data', forward('stdout'));
  child.stderr?.on('data', forward('stderr'));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with code ${code}`);
      // Keep the sibling services up unless both die; log and continue.
      // Only tear down if this was a hard spawn failure (code 1 right after start
      // is common for npm wrappers — wait for the other process).
      const stillAlive = children.some((c) => c !== child && c.exitCode == null && !c.killed);
      if (!stillAlive) {
        shutdown(code);
      }
      return;
    }
    if (signal) {
      console.error(`[${label}] exited due to signal ${signal}`);
      shutdown(1);
    }
  });

  child.on('error', (err) => {
    console.error(`[${label}] spawn error: ${err.message}`);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting Helios (API+worker + dashboard)...');
console.log('');
console.log('Local E2E tips:');
console.log('  - Mongo and Redis must be reachable');
console.log('  - API .env: DISABLE_AUTH=true, LAYOUT_FIRST_SHADOW=true (optional)');
console.log('  - Dashboard .env.local: NEXT_PUBLIC_API_URL=http://localhost:3000');
console.log('');
console.log('URLs:');
console.log('  API:       http://localhost:3000');
console.log('  Upload:    http://localhost:3002/upload');
console.log('  Dashboard: http://localhost:3002');
console.log('');

run('api', 'npm run dev:all', 'bank-statement-analyzer-api');
run('dashboard', 'npm run dev', 'helios-dashboard');
