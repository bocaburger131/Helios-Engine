import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Current directory:', process.cwd());
console.log('Root directory:', rootDir);

// Run vitest with debugging options
const vitestProcess = spawn('npx', ['vitest', 'run', 'tests/simple.test.js', '--no-color'], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'pipe']
});

vitestProcess.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

vitestProcess.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

vitestProcess.on('close', (code) => {
  console.log(`Vitest process exited with code ${code}`);
});