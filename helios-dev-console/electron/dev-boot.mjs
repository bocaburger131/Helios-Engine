/**
 * Dev boot — probe Vite, then launch Electron. Writes debug NDJSON.
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const LOG_PATH = path.join(PKG, "..", "debug-84ef67.log");
const LOG_PATH_SESSION = path.join(PKG, "..", "debug-655110.log");
const INGEST =
  "http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad";

function dbg(hypothesisId, message, data = {}) {
  const payload = {
    sessionId: "655110",
    runId: process.env.DEBUG_RUN_ID || "boot",
    hypothesisId,
    location: "electron/dev-boot.mjs",
    message,
    data,
    timestamp: Date.now(),
  };
  // #region agent log
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(payload) + "\n");
    fs.appendFileSync(LOG_PATH_SESSION, JSON.stringify(payload) + "\n");
  } catch {
    /* ignore */
  }
  fetch(INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "655110",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
  console.log(`[dev-boot][${hypothesisId}] ${message}`, JSON.stringify(data));
}

function probe(host, port = 5173) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: "/", timeout: 2500 }, (res) => {
      res.resume();
      resolve({ host, ok: true, status: res.statusCode });
    });
    req.on("error", (e) => resolve({ host, ok: false, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ host, ok: false, error: "timeout" });
    });
  });
}

async function waitForVite(url, timeoutMs = 60000) {
  const started = Date.now();
  const u = new URL(url);
  while (Date.now() - started < timeoutMs) {
    const r = await probe(u.hostname, Number(u.port || 5173));
    if (r.ok) return r;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout waiting for ${url}`);
}

const v4 = await probe("127.0.0.1");
const v6 = await probe("localhost");
dbg("A", "vite bind probe before wait", { v4, v6 });

// Prefer 127.0.0.1 once Vite is configured to listen there; fall back to localhost.
const target =
  v4.ok ? "http://127.0.0.1:5173" : v6.ok ? "http://localhost:5173" : "http://127.0.0.1:5173";

dbg("A", "selected vite wait target", { target, v4ok: v4.ok, v6ok: v6.ok });

try {
  const ready = await waitForVite(target);
  dbg("A", "vite ready", { target, ready });
} catch (e) {
  dbg("A", "vite wait failed", { target, error: e.message });
  process.exit(1);
}

const electronBin = require("electron");
// #region agent log
const parentRunAsNode = process.env.ELECTRON_RUN_AS_NODE ?? null;
dbg("B", "spawning electron binary", {
  electronBin: String(electronBin),
  cwd: PKG,
  main: "electron/main.js",
  nodeVersion: process.version,
  parentELECTRON_RUN_AS_NODE: parentRunAsNode,
});
// #endregion

// If ELECTRON_RUN_AS_NODE is inherited, electron.exe runs as plain Node and crashes
// loading ESM main (`esm/translators` TypeError on `exports`). package.json is
// "type":"module"; main.js imports are correct — do not convert to require().
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const spawnStartedAt = Date.now();
const child = spawn(String(electronBin), ["."], {
  cwd: PKG,
  stdio: "inherit",
  env: childEnv,
  windowsHide: false,
  shell: false,
});
dbg("B", "electron spawn returned", { pid: child.pid ?? null });

child.on("error", (err) => {
  dbg("B", "electron spawn error", { error: err.message });
});
child.on("exit", (code, signal) => {
  // #region agent log
  const unsigned =
    typeof code === "number" && code < 0 ? code >>> 0 : code;
  dbg("B", "electron exited", {
    code,
    unsigned,
    hex:
      typeof unsigned === "number"
        ? `0x${Number(unsigned).toString(16)}`
        : null,
    signal,
    pid: child.pid ?? null,
    isAccessViolation: unsigned === 3221225786,
    elapsedMs: Date.now() - spawnStartedAt,
  });
  // #endregion
  process.exit(code ?? 1);
});

process.on("SIGINT", () => {
  // #region agent log
  dbg("C", "dev-boot received SIGINT", { electronPid: child.pid ?? null });
  // #endregion
});
process.on("SIGTERM", () => {
  // #region agent log
  dbg("C", "dev-boot received SIGTERM", { electronPid: child.pid ?? null });
  // #endregion
});
