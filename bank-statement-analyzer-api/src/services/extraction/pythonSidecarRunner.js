/**
 * Shared Python subprocess bridge for pdfplumber + OCR sidecars.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const API_ROOT = path.resolve(__dirname, '../../..');

export const TRACEBACK_MARKERS = [
  'Traceback (most recent call last)',
  'SyntaxError:',
  'ModuleNotFoundError'
];

export function resolvePythonExecutable() {
  const configured = String(process.env.PYTHON_PATH || '').trim();
  if (configured) return configured;
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * @param {string} stdout
 * @returns {{ json: object|null, parseError: string|null }}
 */
export function parseStdoutJson(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) {
    return { json: null, parseError: 'empty_stdout' };
  }

  for (const marker of TRACEBACK_MARKERS) {
    if (trimmed.includes(marker)) {
      return { json: null, parseError: 'python_traceback_in_stdout' };
    }
  }

  try {
    return { json: JSON.parse(trimmed), parseError: null };
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return { json: JSON.parse(trimmed.slice(start, end + 1)), parseError: null };
      } catch (e) {
        return { json: null, parseError: `invalid_json: ${e.message}` };
      }
    }
    return { json: null, parseError: 'invalid_json' };
  }
}

/**
 * @param {string|{ stdout?: string, stderr?: string }} raw
 */
export function normalizeChildResult(raw) {
  if (raw && typeof raw === 'object' && 'stdout' in raw) {
    return {
      stdout: String(raw.stdout ?? ''),
      stderr: String(raw.stderr ?? '')
    };
  }
  return { stdout: String(raw ?? ''), stderr: '' };
}

/**
 * @param {string} python
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
export function runPythonChildProcess(python, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const maxBytes = 10 * 1024 * 1024;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`python sidecar timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > maxBytes) {
        child.kill('SIGTERM');
        reject(new Error('python sidecar stdout exceeded max size'));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > maxBytes) {
        child.kill('SIGTERM');
        reject(new Error('python sidecar stderr exceeded max size'));
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        const errMsg = stderr.trim() || stdout.trim() || `python sidecar exit code ${exitCode}`;
        reject(new Error(errMsg.slice(0, 2000)));
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}

/**
 * Write buffer to temp PDF and run a Python script.
 * @param {Buffer} pdfBuffer
 * @param {object} options
 * @param {string} options.scriptPath
 * @param {string[]} options.scriptArgs
 * @param {number} options.timeoutMs
 * @param {string} [options.tempPrefix]
 * @param {typeof runPythonChildProcess|null} [options.runner]
 */
export async function runPythonScriptOnPdfBuffer(pdfBuffer, options) {
  if (!pdfBuffer?.length) {
    throw new Error('empty_buffer');
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), options.tempPrefix || 'python-sidecar-'));
  const pdfPath = path.join(tmpDir, `statement-${randomUUID()}.pdf`);

  try {
    await fs.writeFile(pdfPath, pdfBuffer);
    const python = resolvePythonExecutable();
    const args = [options.scriptPath, pdfPath, ...(options.scriptArgs || [])];
    const runner = options.runner ?? runPythonChildProcess;
    const rawResult = await runner(python, args, options.timeoutMs);
    return normalizeChildResult(rawResult);
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export default {
  API_ROOT,
  resolvePythonExecutable,
  parseStdoutJson,
  normalizeChildResult,
  runPythonChildProcess,
  runPythonScriptOnPdfBuffer
};
