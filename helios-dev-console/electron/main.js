/**
 * Helios Dev Console — Electron main process.
 * Allowlisted IPC only; spawn for long-lived services; exec for one-shot docker.
 */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import net from "net";
import { fileURLToPath } from "url";
import { spawn, execFile } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..");
const LOGS_DIR = path.join(PACKAGE_ROOT, ".logs");
const LOG_FILES = {
  helios: path.join(LOGS_DIR, "helios-node.log"),
  ngrok: path.join(LOGS_DIR, "ngrok.log"),
  docker: path.join(LOGS_DIR, "docker.log"),
};
const DEBUG_LOG = path.join(REPO_ROOT, "debug-84ef67.log");
const DEBUG_LOG_SESSION = path.join(REPO_ROOT, "debug-655110.log");

// #region agent log
/** Non-blocking — sync append was starving the event loop and timing out /health probes. */
function agentLog(hypothesisId, message, data = {}) {
  const payload = {
    sessionId: "655110",
    runId: process.env.DEBUG_RUN_ID || "electron-main",
    hypothesisId,
    location: "electron/main.js",
    message,
    data,
    timestamp: Date.now(),
  };
  const line = JSON.stringify(payload) + "\n";
  fs.appendFile(DEBUG_LOG, line, () => {});
  fs.appendFile(DEBUG_LOG_SESSION, line, () => {});
  fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "655110",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
agentLog("B", "main.js module loaded", {
  packageRoot: PACKAGE_ROOT,
  preloadExists: fs.existsSync(path.join(__dirname, "preload.cjs")),
});
// #endregion

const REDIS_CONTAINER = "bank-analyzer-redis";
const REDIS_ALIAS = "helios-redis-stack";
const MONGO_CONTAINER = "bank-analyzer-mongo";
const COMPOSE_FILE = path.join(
  REPO_ROOT,
  "bank-statement-analyzer-api",
  "docker-compose.yml"
);
const CSV_PATH = path.join(REPO_ROOT, "reports", "extraction_results.csv");
const UPLOADS_REPORTS = path.join(
  REPO_ROOT,
  "bank-statement-analyzer-api",
  "uploads",
  "reports"
);
const MONGO_DB = "bank-statement-dev";
const API_ROOT = path.join(REPO_ROOT, "bank-statement-analyzer-api");
const ENV_OVERRIDE_PATH = path.join(API_ROOT, ".env.dev.override");

/** Allowlisted simulation toggles for .env.dev.override */
const SIM_TOGGLE_KEYS = [
  "DISABLE_AI_RESCUER",
  "ZOHO_DEMO_MODE",
  "SALESFORCE_DEMO_MODE",
  "DEMO_MODE",
  "DISABLE_AUTH",
  "ENABLE_PUBLIC_UPLOAD",
  "FORCE_HITL_ROUTING",
  "USE_MOCK_SERVICES",
  "AI_DIAGNOSTIC_RESCUE_ENABLED",
  "DISABLE_LAYOUT_STITCHER",
  "DISABLE_LAYOUT_LEARNING",
  "DISABLE_LLM_CATEGORIZER",
  "DISABLE_VERA_BRIEFING",
];

/** Per-stage AI model routing keys for .env.dev.override */
const AI_MODEL_KEYS = [
  "LAYOUT_AI_MODEL",
  "RESCUER_AI_MODEL",
  "CATEGORIZER_AI_MODEL",
  "ANALYSIS_AI_MODEL",
];

/** @type {Array<{ id: string, tags: string[] }>} */
const AI_MODEL_CATALOG = [
  { id: "gpt-4o", tags: ["vision", "general"] },
  { id: "gpt-4o-mini", tags: ["vision", "general"] },
  { id: "o1-mini", tags: ["thinking"] },
  { id: "claude-3-5-sonnet", tags: ["vision", "thinking"] },
  { id: "claude-sonnet-4-20250514", tags: ["vision", "thinking"] },
  { id: "gemini-flash-latest", tags: ["vision", "thinking"] },
  { id: "gemini-1.5-pro", tags: ["vision", "thinking"] },
  { id: "gemini-1.5-flash", tags: ["vision"] },
  { id: "gemini-2.0-flash", tags: ["vision", "thinking"] },
  { id: "gemini-2.5-pro", tags: ["vision", "thinking"] },
  { id: "sonar", tags: ["thinking", "code", "general"] },
  { id: "sonar-pro", tags: ["thinking", "code", "general"] },
  { id: "anthropic/claude-sonnet-4", tags: ["vision", "thinking"] },
  { id: "openrouter/auto", tags: ["vision", "thinking", "general"] },
  { id: "mistral-ocr", tags: ["vision"] },
  { id: "deepseek-chat", tags: ["thinking", "code"] },
  { id: "deepseek-coder", tags: ["code"] },
  { id: "ollama-local", tags: ["general", "code"] },
];

const AI_MODEL_OPTIONS = AI_MODEL_CATALOG.map((m) => m.id);

const HELIOS_DIR = path.join(API_ROOT, ".helios");
const CUSTOM_MODELS_PATH = path.join(HELIOS_DIR, "custom_models.json");

const PROVIDER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "PERPLEXITY_API_KEY",
  "OPENROUTER_API_KEY",
  "MISTRAL_API_KEY",
  "DEEPSEEK_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_HOST",
  "CUSTOM_AI_API_KEY",
];

const PROVIDER_TO_ENV = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  ollama: "OLLAMA_BASE_URL",
  custom: "CUSTOM_AI_API_KEY",
};

const VALID_CUSTOM_PROVIDERS = new Set(Object.keys(PROVIDER_TO_ENV));

/** Model id → env keys that indicate API readiness. */
const MODEL_PROVIDER_ENV = {
  "gpt-4o": ["OPENAI_API_KEY"],
  "gpt-4o-mini": ["OPENAI_API_KEY"],
  "o1-mini": ["OPENAI_API_KEY"],
  "claude-3-5-sonnet": ["ANTHROPIC_API_KEY"],
  "claude-sonnet-4-20250514": ["ANTHROPIC_API_KEY"],
  "gemini-flash-latest": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  "gemini-1.5-pro": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  "gemini-1.5-flash": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  "gemini-2.0-flash": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  "gemini-2.5-pro": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  sonar: ["PERPLEXITY_API_KEY"],
  "sonar-pro": ["PERPLEXITY_API_KEY"],
  "anthropic/claude-sonnet-4": ["OPENROUTER_API_KEY"],
  "openrouter/auto": ["OPENROUTER_API_KEY"],
  "mistral-ocr": ["MISTRAL_API_KEY"],
  "deepseek-chat": ["DEEPSEEK_API_KEY"],
  "deepseek-coder": ["DEEPSEEK_API_KEY"],
  "ollama-local": ["OLLAMA_BASE_URL", "OLLAMA_HOST"],
};

const VALID_TAGS = new Set(["vision", "thinking", "code", "general"]);

function ensureHeliosDir() {
  if (!fs.existsSync(HELIOS_DIR)) {
    fs.mkdirSync(HELIOS_DIR, { recursive: true });
  }
}

function loadCustomModels() {
  try {
    if (!fs.existsSync(CUSTOM_MODELS_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(CUSTOM_MODELS_PATH, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((m) => m && typeof m.id === "string" && m.id.trim())
      .map((m) => ({
        id: String(m.id).trim(),
        name: String(m.name || m.id).trim(),
        provider: String(m.provider || "custom").trim().toLowerCase(),
        tags: Array.isArray(m.tags)
          ? m.tags.filter((t) => VALID_TAGS.has(t))
          : ["general"],
        envKey: m.envKey ? String(m.envKey) : undefined,
        custom: true,
      }));
  } catch {
    return [];
  }
}

function saveCustomModels(list) {
  ensureHeliosDir();
  fs.writeFileSync(CUSTOM_MODELS_PATH, JSON.stringify(list, null, 2), "utf8");
}

function getMergedCatalog() {
  const custom = loadCustomModels();
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const m of AI_MODEL_CATALOG) {
    map.set(m.id, { id: m.id, tags: [...m.tags], custom: false });
  }
  for (const m of custom) {
    map.set(m.id, m);
  }
  return [...map.values()];
}

function getAllowedModelIds() {
  return getMergedCatalog().map((m) => m.id);
}

function providerEnvKeysForModel(entry) {
  if (entry.envKey) return [entry.envKey];
  if (MODEL_PROVIDER_ENV[entry.id]) return MODEL_PROVIDER_ENV[entry.id];
  const fromProvider = PROVIDER_TO_ENV[entry.provider];
  if (fromProvider) return [fromProvider];
  return ["CUSTOM_AI_API_KEY"];
}

function envKeyToProvider(envKey) {
  if (envKey === "OPENAI_API_KEY" || envKey === "CUSTOM_AI_API_KEY") return "openai";
  if (envKey === "ANTHROPIC_API_KEY") return "anthropic";
  if (envKey === "GEMINI_API_KEY" || envKey === "GOOGLE_API_KEY") return "google";
  if (envKey === "PERPLEXITY_API_KEY") return "perplexity";
  if (envKey === "OPENROUTER_API_KEY") return "openrouter";
  if (envKey === "MISTRAL_API_KEY") return "mistral";
  if (envKey === "DEEPSEEK_API_KEY") return "deepseek";
  if (envKey === "OLLAMA_BASE_URL" || envKey === "OLLAMA_HOST") return "ollama";
  return "custom";
}

function readMergedEnvForKeys() {
  /** @type {Record<string, string>} */
  const out = {};
  const basePath = path.join(API_ROOT, ".env");
  if (fs.existsSync(basePath)) {
    Object.assign(out, parseEnvFile(fs.readFileSync(basePath, "utf8")));
  }
  if (fs.existsSync(ENV_OVERRIDE_PATH)) {
    Object.assign(out, parseEnvFile(fs.readFileSync(ENV_OVERRIDE_PATH, "utf8")));
  }
  return out;
}

/**
 * Lightweight provider key validation (200 = ready).
 * @param {string} provider
 * @param {string} key
 * @param {Record<string, string>} env
 */
async function validateApiKey(provider, key, env = {}) {
  const trimmed = String(key || "").trim();
  if (provider === "ollama") {
    const base = String(
      env.OLLAMA_BASE_URL || env.OLLAMA_HOST || trimmed || "http://127.0.0.1:11434"
    )
      .trim()
      .replace(/\/$/, "");
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.status === 200;
    } catch {
      return false;
    }
  }
  if (!trimmed) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    let res;
    if (provider === "openai" || provider === "custom") {
      res = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: ctrl.signal,
      });
    } else if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": trimmed,
          "anthropic-version": "2023-06-01",
        },
        signal: ctrl.signal,
      });
    } else if (provider === "google") {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`,
        { method: "GET", signal: ctrl.signal }
      );
    } else if (provider === "deepseek") {
      res = await fetch("https://api.deepseek.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: ctrl.signal,
      });
    } else if (provider === "openrouter") {
      res = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: ctrl.signal,
      });
    } else if (provider === "mistral") {
      res = await fetch("https://api.mistral.ai/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: ctrl.signal,
      });
    } else if (provider === "perplexity") {
      // Perplexity has no public models list; treat a non-empty key as ready.
      clearTimeout(t);
      return trimmed.length >= 16;
    } else {
      clearTimeout(t);
      return false;
    }
    clearTimeout(t);
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Live-validate API keys for merged catalog.
 * @returns {Promise<{ apiReady: Record<string, boolean>, providerEnvLabel: Record<string, string> }>}
 */
async function resolveApiReady() {
  const catalog = getMergedCatalog();
  const env = readMergedEnvForKeys();
  /** @type {Record<string, boolean>} */
  const apiReady = {};
  /** @type {Record<string, string>} */
  const providerEnvLabel = {};
  /** @type {Map<string, Promise<boolean>>} */
  const validationCache = new Map();

  for (const entry of catalog) {
    const keys = providerEnvKeysForModel(entry);
    providerEnvLabel[entry.id] = keys[0] || "(unknown)";
    let ready = false;
    for (const envKey of keys) {
      const provider = envKeyToProvider(envKey);
      const keyVal = String(env[envKey] || "").trim();
      const cacheKey =
        provider === "ollama"
          ? `ollama::${env.OLLAMA_BASE_URL || env.OLLAMA_HOST || keyVal || "default"}`
          : `${provider}::${keyVal}`;
      if (!validationCache.has(cacheKey)) {
        validationCache.set(cacheKey, validateApiKey(provider, keyVal, env));
      }
      // eslint-disable-next-line no-await-in-loop
      const ok = await validationCache.get(cacheKey);
      if (ok) {
        ready = true;
        break;
      }
    }
    apiReady[entry.id] = ready;
  }
  return { apiReady, providerEnvLabel };
}

function catalogPayload() {
  return getMergedCatalog().map((m) => ({
    id: m.id,
    tags: [...m.tags],
    name: m.name || m.id,
    provider: m.provider || undefined,
    custom: Boolean(m.custom),
  }));
}

const SENSITIVE_KEY_RE =
  /API_KEY|SECRET|PASSWORD|TOKEN|MONGO_URI|MONGODB_URI|PRIVATE/i;

// Mitigate Windows GPU/cache ACCESS_VIOLATION (exit 3221225786) in some envs.
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.disableHardwareAcceleration();

// #region agent log
agentLog("D", "main.js GPU switches applied", {
  pid: process.pid,
  electronVersion: process.versions?.electron || null,
  chrome: process.versions?.chrome || null,
});
process.on("uncaughtException", (err) => {
  agentLog("E", "uncaughtException", {
    message: err?.message || String(err),
    stack: String(err?.stack || "").slice(0, 500),
  });
});
process.on("unhandledRejection", (reason) => {
  agentLog("E", "unhandledRejection", {
    message: String(reason).slice(0, 300),
  });
});
app.on("render-process-gone", (_e, _wc, details) => {
  agentLog("A", "render-process-gone", {
    reason: details?.reason,
    exitCode: details?.exitCode,
  });
});
app.on("child-process-gone", (_e, details) => {
  agentLog("A", "child-process-gone", {
    type: details?.type,
    reason: details?.reason,
    exitCode: details?.exitCode,
    name: details?.name,
  });
});
app.on("will-quit", () => {
  agentLog("C", "app will-quit", {});
});
// #endregion

/** @type {Map<string, import('child_process').ChildProcess>} */
const children = new Map();

/** @type {BrowserWindow | null} */
let mainWindow = null;

function ensureLogsDir() {
  try {
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function appendServiceLog(id, line) {
  const file = LOG_FILES[id];
  if (!file) return;
  try {
    ensureLogsDir();
    fs.appendFileSync(file, String(line).replace(/\r?\n$/, "") + "\n");
    // Advance tail offset so fs.watch does not re-emit our own writes to the UI.
    const tail = logTails.get(id);
    if (tail) {
      try {
        tail.offset = fs.statSync(file).size;
        logTails.set(id, tail);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore disk errors */
  }
}

function emitLog(source, stream, line) {
  const text = String(line).replace(/\r?\n$/, "");
  if (!text) return;
  const payload = {
    source,
    stream,
    line: text,
    ts: Date.now(),
  };
  if (LOG_FILES[source]) appendServiceLog(source, `[${stream}] ${text}`);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("logs:data", payload);
    }
  } catch {
    /* no EPIPE to renderer */
  }
}

function readLogTail(id, maxLines = 500) {
  const file = LOG_FILES[id];
  if (!file || !fs.existsSync(file)) return [];
  try {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.length);
    const slice = lines.slice(-maxLines);
    return slice.map((line) => {
      const m = line.match(/^\[(stdout|stderr|system)\]\s?(.*)$/);
      return {
        source: id,
        stream: m ? m[1] : "stdout",
        line: m ? m[2] : line,
        ts: Date.now(),
      };
    });
  } catch {
    return [];
  }
}

/** @type {Map<string, { watcher?: fs.FSWatcher, offset: number }>} */
const logTails = new Map();

function startFileTail(id) {
  const file = LOG_FILES[id];
  if (!file) return;
  ensureLogsDir();
  if (!fs.existsSync(file)) {
    try {
      fs.writeFileSync(file, "");
    } catch {
      return;
    }
  }
  const prev = logTails.get(id);
  if (prev?.watcher) {
    try {
      prev.watcher.close();
    } catch {
      /* ignore */
    }
  }
  let offset = fs.statSync(file).size;
  const pushNew = () => {
    try {
      const st = fs.statSync(file);
      if (st.size < offset) offset = 0;
      if (st.size <= offset) return;
      const buf = Buffer.alloc(st.size - offset);
      const fd = fs.openSync(file, "r");
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      offset = st.size;
      const text = buf.toString("utf8");
      for (const raw of text.split(/\r?\n/)) {
        if (!raw.length) continue;
        const m = raw.match(/^\[(stdout|stderr|system)\]\s?(.*)$/);
        const stream = m ? m[1] : "stdout";
        const line = m ? m[2] : raw;
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("logs:data", {
              source: id,
              stream,
              line,
              ts: Date.now(),
            });
          }
        } catch {
          /* ignore */
        }
      }
      logTails.set(id, { ...(logTails.get(id) || {}), offset });
    } catch {
      /* ignore */
    }
  };
  const watcher = fs.watch(file, { persistent: false }, () => pushNew());
  logTails.set(id, { watcher, offset });
}

function attachStreams(id, child) {
  const onData = (stream) => (buf) => {
    const text = buf.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.length) emitLog(id, stream, line);
    }
  };
  child.stdout?.on("data", onData("stdout"));
  child.stderr?.on("data", onData("stderr"));
  child.stdout?.on("error", () => {});
  child.stderr?.on("error", () => {});
  child.on("exit", (code, signal) => {
    children.delete(id);
    // #region agent log
    agentLog("B", "child process exited", {
      id,
      code,
      signal,
      pid: child.pid ?? null,
    });
    // #endregion
    emitLog(
      id,
      "system",
      `process exited code=${code ?? "null"} signal=${signal ?? "null"}`
    );
  });
  child.on("error", (err) => {
    // #region agent log
    agentLog("B", "child spawn error event", {
      id,
      error: err.message,
    });
    // #endregion
    emitLog(id, "stderr", `spawn error: ${err.message}`);
  });
}

function npmBin() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/**
 * Spawn a long-lived service: detached so Electron quit does not kill it.
 * Child stdout/stderr go to .logs/* and the Terminal viewer via emitLog.
 * Avoid shell:true for node (Windows flashes a cmd window and breaks stdio).
 */
function spawnDetached(id, command, args, cwd) {
  ensureLogsDir();
  const logPath = LOG_FILES[id];
  if (!logPath) {
    throw new Error(`no log file mapping for ${id}`);
  }
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "");
  }
  try {
    fs.appendFileSync(
      logPath,
      `[system] spawning ${command} ${args.join(" ")} cwd=${cwd}\n`
    );
  } catch {
    /* ignore */
  }

  /** Strip Electron env that breaks nested node/npm on Windows. */
  const cleanEnv = { ...process.env };
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith("ELECTRON_") || key === "ORIGINAL_XDG_CURRENT_DESKTOP") {
      delete cleanEnv[key];
    }
  }

  const isNode =
    command === "node" ||
    command === "node.exe" ||
    /[/\\]node(\.exe)?$/i.test(command);
  // Prefer real Node from PATH — process.execPath inside Electron is electron.exe.
  const bin = isNode ? "node" : command;

  const child = spawn(bin, args, {
    cwd,
    shell: !isNode,
    env: loadOverrideIntoEnv(cleanEnv),
    windowsHide: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const pipeToLog = (streamName) => (buf) => {
    const text = buf.toString("utf8");
    try {
      fs.appendFileSync(logPath, text);
    } catch {
      /* ignore */
    }
    for (const line of text.split(/\r?\n/)) {
      if (line.length) emitLog(id, streamName, line);
    }
  };
  child.stdout?.on("data", pipeToLog("stdout"));
  child.stderr?.on("data", pipeToLog("stderr"));
  child.stdout?.on("error", () => {});
  child.stderr?.on("error", () => {});

  try {
    child.unref();
  } catch {
    /* ignore */
  }

  children.set(id, child);
  startFileTail(id);

  child.on("exit", (code, signal) => {
    children.delete(id);
    // #region agent log
    agentLog("B", "child process exited", {
      id,
      code,
      signal,
      pid: child.pid ?? null,
    });
    // #endregion
    emitLog(
      id,
      "system",
      `process exited code=${code ?? "null"} signal=${signal ?? "null"}`
    );
  });
  child.on("error", (err) => {
    // #region agent log
    agentLog("B", "child spawn error event", {
      id,
      error: err.message,
    });
    // #endregion
    emitLog(id, "stderr", `spawn error: ${err.message}`);
  });

  return child;
}

function killChild(id) {
  const child = children.get(id);
  if (!child || child.killed) {
    children.delete(id);
    return false;
  }
  // External adopt (no real ChildProcess) — clear marker only.
  if (child.external || typeof child.kill !== "function") {
    children.delete(id);
    return true;
  }
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch (e) {
    emitLog(id, "stderr", `stop failed: ${e.message}`);
  }
  children.delete(id);
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Force-kill whatever is LISTENING on a TCP port (orphaned Helios on :3000).
 * @param {number} port
 * @returns {Promise<{ ok: boolean, pids: number[], error?: string }>}
 */
async function killPort(port) {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const r = await execCapture("netstat", ["-ano"]);
      const text = `${r.stdout || ""}\n${r.stderr || ""}`;
      for (const line of text.split(/\r?\n/)) {
        if (!line.includes(`:${port}`)) continue;
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pidStr = parts[parts.length - 1];
        const pid = Number(pidStr);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
    } else {
      const r = await execCapture("lsof", [
        `-tiTCP:${port}`,
        "-sTCP:LISTEN",
      ]);
      const text = String(r.stdout || "").trim();
      if (text) {
        for (const part of text.split(/\s+/)) {
          const pid = Number(part);
          if (Number.isFinite(pid) && pid > 0) pids.add(pid);
        }
      }
    }
  } catch (e) {
    return {
      ok: false,
      pids: [],
      error: e?.message || String(e),
    };
  }

  if (pids.size === 0) {
    emitLog("helios", "system", `killPort(:${port}) — nothing listening`);
    return { ok: true, pids: [] };
  }

  emitLog(
    "helios",
    "system",
    `killPort(:${port}) — terminating PID(s): ${[...pids].join(", ")}`
  );

  const errors = [];
  for (const pid of pids) {
    try {
      if (process.platform === "win32") {
        const kill = await execCapture("taskkill", [
          "/PID",
          String(pid),
          "/T",
          "/F",
        ]);
        if (!kill.ok) {
          errors.push(
            `PID ${pid}: ${(kill.stderr || kill.error || "taskkill failed").trim()}`
          );
        } else {
          emitLog("helios", "system", `killed PID ${pid} (taskkill /T /F)`);
        }
      } else {
        const kill = await execCapture("kill", ["-9", String(pid)]);
        if (!kill.ok) {
          errors.push(
            `PID ${pid}: ${(kill.stderr || kill.error || "kill -9 failed").trim()}`
          );
        } else {
          emitLog("helios", "system", `killed PID ${pid} (kill -9)`);
        }
      }
    } catch (e) {
      errors.push(`PID ${pid}: ${e?.message || String(e)}`);
    }
  }

  return {
    ok: errors.length === 0,
    pids: [...pids],
    error: errors.length ? errors.join("; ") : undefined,
  };
}

/**
 * Force-kill :3000 orphans, clear adopt markers, respawn tracked Helios.
 */
async function resetHelios() {
  emitLog("helios", "system", "Force reset — killing :3000 …");
  const first = await killPort(3000);
  if (first.pids.length) {
    emitLog(
      "helios",
      "system",
      `killPort result: ok=${first.ok} pids=${first.pids.join(",")}${first.error ? ` err=${first.error}` : ""}`
    );
  }

  killChild("helios");
  children.delete("helios");

  emitLog("helios", "system", "waiting 2s for port to free …");
  await sleep(2000);

  let portOpen = await probeTcpPort("127.0.0.1", 3000);
  if (portOpen) {
    emitLog("helios", "system", ":3000 still open — second killPort attempt");
    await killPort(3000);
    await sleep(1000);
    portOpen = await probeTcpPort("127.0.0.1", 3000);
  }

  if (portOpen) {
    const err = "port :3000 still in use after force kill — cannot spawn clean Helios";
    emitLog("helios", "stderr", err);
    return { ok: false, error: err };
  }

  emitLog("helios", "system", "port free — spawning fresh Helios …");
  const started = await startHelios();
  if (!started.ok) {
    return started;
  }
  return {
    ok: true,
    detail: started.detail || "reset complete — Helios spawned",
  };
}

/**
 * Probe a local HTTP endpoint with a hard wall-clock timeout (connect hangs included).
 * @param {string} url
 * @param {number} [timeoutMs]
 */
function probeHttp(url, timeoutMs = 2500) {
  return Promise.race([
    new Promise((resolve) => {
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      try {
        const u = new URL(url);
        const req = http.get(
          {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname + u.search,
            timeout: timeoutMs,
          },
          (res) => {
            let body = "";
            res.on("data", (c) => {
              body += c;
              if (body.length > 4000) res.destroy();
            });
            res.on("end", () => {
              done({
                ok: res.statusCode >= 200 && res.statusCode < 400,
                statusCode: res.statusCode,
                body: body.slice(0, 800),
              });
            });
          }
        );
        req.on("timeout", () => {
          req.destroy();
          done({ ok: false, error: "timeout" });
        });
        req.on("error", (e) => done({ ok: false, error: e.message }));
      } catch (e) {
        done({ ok: false, error: e.message });
      }
    }),
    new Promise((resolve) =>
      setTimeout(
        () => resolve({ ok: false, error: "hard-timeout" }),
        timeoutMs + 200
      )
    ),
  ]);
}

/**
 * Format unhealthy-but-running dependency wait message from /health deps.
 * @param {Record<string, string>|null|undefined} deps
 */
function formatMissingDeps(deps) {
  if (!deps) return "Waiting on dependencies";
  const missing = [];
  const mongo = deps.mongodb || deps.mongo;
  const redis = deps.redis;
  if (mongo && String(mongo).toUpperCase() !== "CONNECTED") missing.push("Mongo");
  if (redis && String(redis).toUpperCase() !== "CONNECTED") missing.push("Redis");
  if (!missing.length) return "Degraded";
  return `Waiting on ${missing.join(", ")}`;
}

/**
 * TCP connect probe — true if something accepts on host:port (even if HTTP /health fails).
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs]
 */
function probeTcpPort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

/** Sticky healthy latch — avoid flapping Degraded when /health briefly times out. */
let lastHeliosHealthyAt = 0;
const HEALTHY_STICKY_MS = 30000;
/** Prevent overlapping service:status probes from piling onto :3000. */
let statusProbeInFlight = null;

/**
 * Ternary Helios probe: offline | running (unhealthy) | healthy.
 * isRunning = HTTP /health response OR TCP :3000 accepting connections.
 * isHealthy = 2xx + status healthy (with sticky latch on transient timeouts).
 * @param {{ includeDash?: boolean }} [opts]
 */
async function probeHeliosLive(opts = {}) {
  const includeDash = opts.includeDash !== false;
  // #region agent log
  const probeStarted = Date.now();
  agentLog("P", "probeHeliosLive enter", { includeDash });
  // #endregion
  const [health, portOpen] = await Promise.all([
    probeHttp("http://127.0.0.1:3000/health", 4000),
    probeTcpPort("127.0.0.1", 3000),
  ]);
  // #region agent log
  agentLog("P", "probeHeliosLive health+tcp done", {
    elapsedMs: Date.now() - probeStarted,
    statusCode: health.statusCode ?? null,
    ok: health.ok,
    error: health.error ?? null,
    bodyLen: health.body ? String(health.body).length : 0,
    portOpen,
    hypothesisId: "A",
  });
  // #endregion
  const httpAlive = health.statusCode != null;
  const isRunning = httpAlive || portOpen;
  let bodyStatus = null;
  let deps = null;
  if (health.body) {
    try {
      const j = JSON.parse(health.body);
      bodyStatus = j.status || null;
      deps = j.dependencies || null;
    } catch {
      /* ignore non-JSON */
    }
  }
  const statusOk =
    health.statusCode != null &&
    health.statusCode >= 200 &&
    health.statusCode < 300;
  let isHealthy = statusOk && bodyStatus === "healthy";

  // Port open + /health timeout ⇒ Online. Browser can hit /health while Electron's
  // overlapping probes time out; TCP acceptance means the API process is live.
  const healthTimedOut =
    health.error === "timeout" || health.error === "hard-timeout";
  if (!isHealthy && portOpen && healthTimedOut && !httpAlive) {
    isHealthy = true;
  } else if (
    !isHealthy &&
    portOpen &&
    healthTimedOut &&
    Date.now() - lastHeliosHealthyAt < HEALTHY_STICKY_MS
  ) {
    isHealthy = true;
  }
  if (statusOk && bodyStatus === "healthy") {
    lastHeliosHealthyAt = Date.now();
  }

  let details;
  if (!isRunning) {
    details = "No response from :3000";
  } else if (isHealthy) {
    details =
      statusOk && bodyStatus === "healthy"
        ? "Healthy"
        : "Online (:3000 open — /health slow)";
  } else if (!httpAlive && portOpen) {
    details = "Port :3000 open — /health timed out (API may still be fine)";
  } else {
    details = formatMissingDeps(deps);
  }

  let dashboardOk = false;
  if (includeDash) {
    const dash = await probeHttp("http://127.0.0.1:3002/upload", 1500);
    dashboardOk = Boolean(dash.ok);
    // #region agent log
    agentLog("P", "probeHeliosLive dash done", {
      elapsedMs: Date.now() - probeStarted,
      dashOk: dashboardOk,
      dashStatus: dash.statusCode ?? null,
      dashError: dash.error ?? null,
    });
    // #endregion
  }

  return {
    isRunning,
    isHealthy,
    details,
    deps,
    dashboardOk,
    apiOk: isHealthy,
    detail: details,
    portOpen,
  };
}

function execCapture(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { ...opts, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err?.code ?? 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: err ? err.message : undefined,
      });
    });
  });
}

function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function emptyAiModels() {
  /** @type {Record<string, string>} */
  const models = {};
  for (const k of AI_MODEL_KEYS) models[k] = "";
  return models;
}

function readOverrideFile() {
  /** @type {Record<string, boolean>} */
  const toggles = {};
  for (const k of SIM_TOGGLE_KEYS) toggles[k] = false;
  const models = emptyAiModels();
  /** @type {Record<string, string>} */
  const secrets = {};
  if (!fs.existsSync(ENV_OVERRIDE_PATH)) {
    return { path: ENV_OVERRIDE_PATH, toggles, models, secrets, raw: "" };
  }
  const raw = fs.readFileSync(ENV_OVERRIDE_PATH, "utf8");
  const parsed = parseEnvFile(raw);
  for (const k of SIM_TOGGLE_KEYS) {
    toggles[k] = parsed[k] === "true" || parsed[k] === "1";
  }
  const allowed = getAllowedModelIds();
  for (const k of AI_MODEL_KEYS) {
    if (parsed[k] && allowed.includes(parsed[k])) {
      models[k] = parsed[k];
    }
  }
  for (const k of PROVIDER_ENV_KEYS) {
    if (parsed[k]) secrets[k] = parsed[k];
  }
  return { path: ENV_OVERRIDE_PATH, toggles, models, secrets, raw };
}

/**
 * Merge-write toggles and/or AI models into .env.dev.override without wiping the other.
 * @param {{ toggles?: Record<string, boolean>, models?: Record<string, string>, secrets?: Record<string, string> }} patch
 */
function writeOverrideFile(patch = {}) {
  const current = readOverrideFile();
  /** @type {Record<string, boolean>} */
  const toggles = { ...current.toggles };
  if (patch.toggles && typeof patch.toggles === "object") {
    for (const key of SIM_TOGGLE_KEYS) {
      if (key in patch.toggles) toggles[key] = Boolean(patch.toggles[key]);
    }
  }
  if (toggles.DISABLE_AI_RESCUER) {
    toggles.AI_DIAGNOSTIC_RESCUE_ENABLED = false;
  }

  /** @type {Record<string, string>} */
  const models = { ...current.models };
  const allowed = getAllowedModelIds();
  if (patch.models && typeof patch.models === "object") {
    for (const key of AI_MODEL_KEYS) {
      if (!(key in patch.models)) continue;
      const val = String(patch.models[key] || "").trim();
      if (!val) {
        models[key] = "";
      } else if (allowed.includes(val)) {
        models[key] = val;
      }
    }
  }

  /** @type {Record<string, string>} */
  const secrets = { ...current.secrets };
  if (patch.secrets && typeof patch.secrets === "object") {
    for (const key of PROVIDER_ENV_KEYS) {
      if (!(key in patch.secrets)) continue;
      const val = String(patch.secrets[key] || "").trim();
      if (val) secrets[key] = val;
      else delete secrets[key];
    }
  }

  const lines = [
    "# Generated by Helios Dev Console — Settings Panel",
    "# Loaded after .env (override: true). Restart Helios to apply to a running API.",
    "",
  ];
  for (const key of SIM_TOGGLE_KEYS) {
    lines.push(`${key}=${toggles[key] ? "true" : "false"}`);
  }
  const modelLines = AI_MODEL_KEYS.filter((k) => models[k]);
  if (modelLines.length) {
    lines.push("");
    lines.push("# AI Model Routing Matrix");
    for (const key of modelLines) {
      lines.push(`${key}=${models[key]}`);
    }
  }
  const secretKeys = PROVIDER_ENV_KEYS.filter((k) => secrets[k]);
  if (secretKeys.length) {
    lines.push("");
    lines.push("# Provider API keys (from Dev Console / custom models)");
    for (const key of secretKeys) {
      lines.push(`${key}=${secrets[key]}`);
    }
  }
  lines.push("");
  fs.writeFileSync(ENV_OVERRIDE_PATH, lines.join("\n"), "utf8");
  emitLog("system", "system", `wrote ${ENV_OVERRIDE_PATH}`);
  return readOverrideFile();
}

function readOverrideToggles() {
  const { path: overridePath, toggles, raw } = readOverrideFile();
  return { path: overridePath, toggles, raw };
}

/**
 * @param {Record<string, boolean>} toggles
 */
function writeOverrideToggles(toggles) {
  const result = writeOverrideFile({ toggles });
  return { path: result.path, toggles: result.toggles, raw: result.raw };
}

function loadOverrideIntoEnv(baseEnv) {
  const env = { ...baseEnv };
  if (!fs.existsSync(ENV_OVERRIDE_PATH)) return env;
  const parsed = parseEnvFile(fs.readFileSync(ENV_OVERRIDE_PATH, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (
      SIM_TOGGLE_KEYS.includes(k) ||
      AI_MODEL_KEYS.includes(k) ||
      PROVIDER_ENV_KEYS.includes(k) ||
      k.startsWith("FORCE_") ||
      k.startsWith("DISABLE_") ||
      k.startsWith("ZOHO_") ||
      k.startsWith("SALESFORCE_") ||
      k.startsWith("DEMO_") ||
      k.startsWith("ENABLE_") ||
      k.startsWith("USE_") ||
      k.startsWith("AI_")
    ) {
      env[k] = v;
    }
  }
  return env;
}

function maskSensitiveEnvPreview(raw, presentationMode) {
  if (!presentationMode) return raw;
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => {
      const eq = line.indexOf("=");
      if (eq <= 0) return line;
      const key = line.slice(0, eq).trim();
      if (SENSITIVE_KEY_RE.test(key)) {
        return `${key}=********`;
      }
      return line;
    })
    .join("\n");
}

const TRIAGE_ROOT = path.join(API_ROOT, "uploads", "triage");
const HITL_API_ORIGIN = "http://127.0.0.1:3000";

function asFiniteNumber(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mongoIdString(doc) {
  const id = doc?._id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (id && typeof id === "object" && typeof id.$oid === "string") return id.$oid.trim();
  if (id != null && typeof id !== "object") return String(id);
  return null;
}

function firstReviewFile(doc) {
  const files = doc?.reviewPayload?.files;
  if (!Array.isArray(files) || !files.length) return null;
  return files[0] && typeof files[0] === "object" ? files[0] : null;
}

function extractChecksumFields(fileMeta) {
  const breakdown =
    fileMeta?.reconciliationBreakdown && typeof fileMeta.reconciliationBreakdown === "object"
      ? fileMeta.reconciliationBreakdown
      : {};
  const checksum =
    fileMeta?.checksumRecon && typeof fileMeta.checksumRecon === "object"
      ? fileMeta.checksumRecon
      : {};
  const merged = { ...checksum, ...breakdown };
  return {
    extractedDeposits: asFiniteNumber(merged.deposits ?? merged.parsedDeposits),
    printedDeposits: asFiniteNumber(merged.printedDeposits),
    extractedWithdrawals: asFiniteNumber(merged.withdrawals ?? merged.parsedWithdrawals),
    printedWithdrawals: asFiniteNumber(merged.printedWithdrawals),
    delta: asFiniteNumber(merged.delta),
    opening: asFiniteNumber(merged.opening),
    closing: asFiniteNumber(merged.closing),
  };
}

/**
 * Resolve triage PDF under allowlisted uploads/triage/<session>/.
 */
function resolveTriagePdfPath(uploadSessionId, fileName) {
  const session = String(uploadSessionId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const name = String(fileName || "").trim();
  if (!session || !name) return null;

  const rootResolved = path.resolve(TRIAGE_ROOT);
  const sessionDir = path.resolve(path.join(TRIAGE_ROOT, session));
  if (!sessionDir.startsWith(rootResolved + path.sep) && sessionDir !== rootResolved) {
    return null;
  }

  const manifestPath = path.join(sessionDir, "manifest.json");
  let storedName = null;
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const entry = (manifest.files || []).find(
        (f) => f.originalName === name || f.storedName === name
      );
      if (entry?.storedName) storedName = entry.storedName;
    } catch {
      /* ignore bad manifest */
    }
  }
  if (!storedName) {
    storedName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  const abs = path.resolve(path.join(sessionDir, storedName));
  if (!abs.startsWith(sessionDir + path.sep) && abs !== sessionDir) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}

function enrichHitlDoc(doc) {
  const id = mongoIdString(doc);
  const fileMeta = firstReviewFile(doc);
  const fileName =
    (Array.isArray(doc?.failingFileNames) && doc.failingFileNames[0]) ||
    fileMeta?.fileName ||
    null;
  const uploadSessionId =
    typeof doc?.uploadSessionId === "string" && doc.uploadSessionId.trim()
      ? doc.uploadSessionId.trim()
      : "";
  const checksum = extractChecksumFields(fileMeta);
  const localPdfPath =
    uploadSessionId && fileName
      ? resolveTriagePdfPath(uploadSessionId, fileName)
      : null;
  const pdfPreviewUrl =
    uploadSessionId && fileName
      ? `${HITL_API_ORIGIN}/api/statements/batch/triage/${encodeURIComponent(uploadSessionId)}/file/${encodeURIComponent(fileName)}`
      : null;

  const rowBalanceRecon =
    fileMeta?.rowBalanceRecon && typeof fileMeta.rowBalanceRecon === "object"
      ? fileMeta.rowBalanceRecon
      : null;
  const transactions = Array.isArray(fileMeta?.transactions)
    ? fileMeta.transactions
    : [];

  return {
    id,
    fileName: fileName || null,
    uploadSessionId: uploadSessionId || null,
    rtn: typeof doc?.rtn === "string" ? doc.rtn : null,
    status: doc?.status || "REQUIRES_HUMAN_REVIEW",
    createdAt: doc?.createdAt || null,
    failingFileNames: Array.isArray(doc?.failingFileNames) ? doc.failingFileNames : [],
    reviewPayload: doc?.reviewPayload || null,
    localPdfPath,
    pdfPreviewUrl,
    rowBalanceRecon,
    transactions,
    ...checksum,
    /** Raw mongo doc for SimulationPanel / legacy consumers. */
    _raw: doc,
  };
}

async function fetchHitlQueue() {
  const evalJs = `(() => { const d=db.getSiblingDB('${MONGO_DB}'); const docs=d.processingruns.find({status:'REQUIRES_HUMAN_REVIEW'}).sort({createdAt:-1}).limit(20).toArray(); print(JSON.stringify(docs)); })()`;
  const r = await execCapture("docker", [
    "exec",
    MONGO_CONTAINER,
    "mongosh",
    "--quiet",
    "--eval",
    evalJs,
  ]);
  if (!r.ok) {
    return {
      ok: false,
      items: [],
      error: (r.stderr || r.error || "mongosh failed").trim(),
    };
  }
  const text = String(r.stdout || "").trim();
  if (!text || text === "null") {
    return { ok: true, items: [], error: null };
  }
  try {
    const docs = JSON.parse(text);
    const list = Array.isArray(docs) ? docs : [];
    return { ok: true, items: list.map(enrichHitlDoc), error: null };
  } catch {
    return { ok: false, items: [], error: `parse failed: ${text.slice(0, 200)}` };
  }
}

/** Legacy single-doc shape for SimulationPanel. */
async function fetchLatestHitlPayload() {
  const queue = await fetchHitlQueue();
  if (!queue.ok) {
    return { ok: false, payload: null, error: queue.error };
  }
  const first = queue.items[0] || null;
  return {
    ok: true,
    payload: first?._raw || null,
    error: null,
  };
}

async function startHelios() {
  // #region agent log
  agentLog("E", "startHelios enter", {
    hasChild: children.has("helios"),
    repoRoot: REPO_ROOT,
    runId: "post-fix",
  });
  // #endregion
  if (children.has("helios")) {
    emitLog("helios", "system", "Start skipped — Helios already tracked (running or adopted)");
    return { ok: true, detail: "already running" };
  }

  emitLog("helios", "system", "Start requested — probing :3000 …");
  let live;
  try {
    live = await probeHeliosLive();
  } catch (e) {
    live = {
      isRunning: false,
      isHealthy: false,
      details: e?.message || "probe failed",
      portOpen: false,
    };
  }
  // #region agent log
  agentLog("H1", "startHelios live probe", { ...live, runId: "post-fix" });
  // #endregion
  emitLog(
    "helios",
    "system",
    `probe: isRunning=${live.isRunning} isHealthy=${Boolean(live.isHealthy)} portOpen=${Boolean(live.portOpen)} (${live.details})`
  );

  if (live.isRunning) {
    children.set("helios", { pid: null, killed: false, external: true });
    emitLog(
      "helios",
      "system",
      `detected existing stack (${live.details}) — already on :3000; not spawning a second process`
    );
    // #region agent log
    agentLog("A", "startHelios adopt existing — skip spawn", {
      details: live.details,
      portOpen: live.portOpen ?? null,
      isHealthy: live.isHealthy,
      runId: "post-fix",
    });
    // #endregion
    return {
      ok: true,
      detail: live.portOpen && !live.isHealthy
        ? "port :3000 already in use — adopted (no second spawn)"
        : "already responding on :3000",
    };
  }

  const heliosCwd = path.resolve(REPO_ROOT);
  const starter = path.join(heliosCwd, "scripts", "start-helios.js");
  const pkg = path.join(heliosCwd, "package.json");
  if (!fs.existsSync(pkg) || !fs.existsSync(starter)) {
    const err = `Helios cwd invalid: ${heliosCwd} (missing package.json or scripts/start-helios.js)`;
    emitLog("helios", "stderr", err);
    return { ok: false, error: err };
  }

  // Spawn node directly — npm.cmd often exits immediately under detached:true on Windows.
  emitLog(
    "helios",
    "system",
    `spawning node scripts/start-helios.js (cwd=${heliosCwd}, detached)`
  );
  // #region agent log
  agentLog("E", "startHelios about to spawn", {
    cwd: heliosCwd,
    starter,
    runId: "post-fix",
  });
  // #endregion

  const child = spawnDetached("helios", "node", [starter], heliosCwd);
  // #region agent log
  agentLog("B", "startHelios spawned start-helios.js", {
    pid: child.pid ?? null,
    cwd: heliosCwd,
    runId: "post-fix",
  });
  // #endregion
  emitLog(
    "helios",
    "system",
    `started start-helios.js pid=${child.pid ?? "?"} cwd=${heliosCwd}`
  );
  if (fs.existsSync(ENV_OVERRIDE_PATH)) {
    emitLog("helios", "system", `injected env from ${ENV_OVERRIDE_PATH}`);
  }

  // If the launcher dies immediately, re-check port — adopt instead of leaving Offline.
  child.once("exit", async (code) => {
    if (code === 0 || code === null) return;
    const again = await probeHeliosLive().catch(() => null);
    // #region agent log
    agentLog("A", "startHelios child exited — reprobe", {
      code,
      again,
      runId: "post-fix",
    });
    // #endregion
    if (again?.isRunning || again?.portOpen) {
      children.set("helios", { pid: null, killed: false, external: true });
      emitLog(
        "helios",
        "system",
        `launcher exited code=${code} but :3000 is in use — adopted existing API (avoid duplicate)`
      );
    }
  });

  return { ok: true, detail: `spawned pid=${child.pid ?? "?"}` };
}

async function startDocker() {
  emitLog(
    "docker",
    "system",
    `ensuring redis (${REDIS_CONTAINER}|${REDIS_ALIAS}) + ${MONGO_CONTAINER}`
  );

  // Prefer compose service name; also try user-facing alias helios-redis-stack.
  let start = await execCapture("docker", [
    "start",
    REDIS_CONTAINER,
    MONGO_CONTAINER,
  ]);
  emitLog(
    "docker",
    start.ok ? "stdout" : "stderr",
    start.stdout || start.stderr || start.error || ""
  );

  if (!start.ok) {
    const aliasStart = await execCapture("docker", [
      "start",
      REDIS_ALIAS,
      MONGO_CONTAINER,
    ]);
    emitLog(
      "docker",
      aliasStart.ok ? "stdout" : "stderr",
      aliasStart.stdout || aliasStart.stderr || aliasStart.error || ""
    );
    if (aliasStart.ok) start = aliasStart;
  }

  if (!start.ok) {
    emitLog("docker", "system", "containers missing — compose up -d redis mongo");
    const up = await execCapture(
      "docker",
      ["compose", "-f", COMPOSE_FILE, "up", "-d", "redis", "mongo"],
      { cwd: REPO_ROOT }
    );
    for (const line of (up.stdout + "\n" + up.stderr).split(/\r?\n/)) {
      if (line.trim()) emitLog("docker", up.ok ? "stdout" : "stderr", line);
    }
    if (!up.ok) return { ok: false, error: up.error || up.stderr || "compose failed" };
  }

  children.set("docker", { pid: null, killed: false });
  return { ok: true };
}

async function stopDocker() {
  const r = await execCapture("docker", [
    "stop",
    REDIS_CONTAINER,
    REDIS_ALIAS,
    MONGO_CONTAINER,
  ]);
  emitLog("docker", r.ok ? "stdout" : "stderr", r.stdout || r.stderr || "");
  children.delete("docker");
  return { ok: true };
}

async function startNgrok() {
  if (children.has("ngrok")) {
    return { ok: true, detail: "already running" };
  }
  const tunnels = await probeHttp("http://127.0.0.1:4040/api/tunnels", 1500);
  if (tunnels.ok) {
    children.set("ngrok", { pid: null, killed: false, external: true });
    emitLog("ngrok", "system", "detected existing ngrok on :4040 — not spawning");
    return { ok: true, detail: "already responding on :4040" };
  }
  emitLog("ngrok", "system", "spawning ngrok http 3000 (detached)");
  const child = spawnDetached("ngrok", "ngrok", ["http", "3000"], path.resolve(REPO_ROOT));
  emitLog("ngrok", "system", `started ngrok http 3000 pid=${child.pid ?? "?"}`);
  return { ok: true };
}

async function initializeState() {
  ensureLogsDir();
  emitLog("system", "system", "Boot hydrate: scanning docker / API / ngrok …");

  const redisUp =
    (await dockerInspectRunning(REDIS_CONTAINER)) ||
    (await dockerInspectRunning(REDIS_ALIAS));
  const mongoUp = await dockerInspectRunning(MONGO_CONTAINER);
  if (redisUp || mongoUp) {
    children.set("docker", { pid: null, killed: false, external: true });
    emitLog(
      "docker",
      "system",
      `hydrated docker (redis=${redisUp} mongo=${mongoUp})`
    );
  }

  let live;
  try {
    live = await probeHeliosLive();
  } catch {
    live = { isRunning: false, isHealthy: false, details: "probe failed" };
  }
  if (live.isRunning && !children.has("helios")) {
    children.set("helios", { pid: null, killed: false, external: true });
    emitLog(
      "helios",
      "system",
      `hydrated helios from :3000 (${live.details})`
    );
  }

  const ngrok = await probeHttp("http://127.0.0.1:4040/api/tunnels", 1500);
  if (ngrok.ok && !children.has("ngrok")) {
    children.set("ngrok", { pid: null, killed: false, external: true });
    emitLog("ngrok", "system", "hydrated ngrok from :4040/api/tunnels");
  }

  // #region agent log
  agentLog("H1", "initializeState done", {
    docker: children.has("docker"),
    helios: children.has("helios"),
    ngrok: children.has("ngrok"),
    live,
  });
  // #endregion
}

async function dockerInspectRunning(name) {
  const r = await execCapture("docker", [
    "inspect",
    "-f",
    "{{.State.Running}}",
    name,
  ]);
  return r.ok && String(r.stdout).trim() === "true";
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const split = (line) => {
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  };

  const headers = split(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Helios Dev Console",
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isDev = !app.isPackaged;
  // #region agent log
  agentLog("B", "createWindow", { isDev, load: isDev ? "http://127.0.0.1:5173" : "dist" });
  // #endregion
  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(PACKAGE_ROOT, "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
    // #region agent log
    const b = mainWindow.getBounds();
    agentLog("F", "window ready-to-show focused", {
      bounds: b,
      isVisible: mainWindow.isVisible(),
      isMinimized: mainWindow.isMinimized(),
    });
    // #endregion
  });

  mainWindow.webContents.on("did-finish-load", () => {
    // #region agent log
    agentLog("B", "window did-finish-load", {});
    // #endregion
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("logs:history", async (_e, options = {}) => {
    const maxLines = Math.min(Number(options.maxLines) || 500, 2000);
    const sources = options.source
      ? [options.source]
      : ["helios", "ngrok", "docker"];
    const out = [];
    for (const id of sources) {
      out.push(...readLogTail(id, maxLines));
    }
    return { ok: true, lines: out };
  });

  ipcMain.handle("service:start", async (_e, payload) => {
    const id = payload?.id;
    // #region agent log
    agentLog("E", "service:start invoked", { id, payload });
    // #endregion
    try {
      let result;
      if (id === "helios") result = await startHelios();
      else if (id === "docker") result = await startDocker();
      else if (id === "ngrok") result = await startNgrok();
      else result = { ok: false, error: `unknown service: ${id}` };
      // #region agent log
      agentLog("E", "service:start result", {
        id,
        result,
        childHelios: children.has("helios"),
        heliosPid: children.get("helios")?.pid ?? null,
      });
      // #endregion
      return result;
    } catch (err) {
      // #region agent log
      agentLog("E", "service:start threw", {
        id,
        error: err?.message || String(err),
      });
      // #endregion
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("service:stop", async (_e, payload) => {
    const id = payload?.id;
    try {
      if (id === "docker") return await stopDocker();
      if (id === "helios" || id === "ngrok") {
        const entry = children.get(id);
        const wasExternal = Boolean(entry?.external);
        const hadPid = Boolean(entry?.pid);
        killChild(id);
        if (wasExternal && !hadPid) {
          emitLog(
            id,
            "system",
            `cleared adopt marker — process may still be running (Stop cannot kill pid-less external ${id}; end it manually if needed)`
          );
          return {
            ok: true,
            detail: "cleared status; external process may still be running",
          };
        }
        emitLog(id, "system", "stopped");
        return { ok: true };
      }
      return { ok: false, error: `unknown service: ${id}` };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("service:reset", async (_e, payload) => {
    const id = payload?.id;
    if (id !== "helios") {
      return {
        ok: false,
        error: `reset only supported for helios (got: ${id || "none"})`,
      };
    }
    try {
      return await resetHelios();
    } catch (err) {
      emitLog("helios", "stderr", `reset failed: ${err?.message || String(err)}`);
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("service:status", async () => {
    if (statusProbeInFlight) return statusProbeInFlight;

    statusProbeInFlight = (async () => {
    const redisUp =
      (await dockerInspectRunning(REDIS_CONTAINER)) ||
      (await dockerInspectRunning(REDIS_ALIAS));
    const mongoUp = await dockerInspectRunning(MONGO_CONTAINER);

    // Skip dashboard HTTP on the hot path — overlapping probes were timing out /health.
    const live = await probeHeliosLive({ includeDash: false });
    // #region agent log
    agentLog("H1", "service:status probe", {
      childHelios: children.has("helios"),
      live,
      redisUp,
      mongoUp,
      runId: "post-fix",
    });
    // #endregion

    // Adopt externally started API when anything responds on :3000 (incl. 503).
    if (live.isRunning && !children.has("helios")) {
      children.set("helios", { pid: null, killed: false, external: true });
    }
    if (!live.isRunning && children.get("helios")?.external) {
      children.delete("helios");
    }

    // Docker card: containers OR live Redis/Mongo via API health (Atlas + local Redis).
    const depsRedis =
      live.deps?.redis === "CONNECTED" || live.deps?.redis === "connected";
    const depsMongo =
      live.deps?.mongodb === "CONNECTED" || live.deps?.mongodb === "connected";
    const dockerRunning = redisUp || mongoUp || depsRedis || depsMongo;
    if (dockerRunning) children.set("docker", { pid: null, killed: false });
    else children.delete("docker");

    // Ngrok: child map OR live :4040
    let ngrokRunning = children.has("ngrok");
    if (!ngrokRunning) {
      const tunnels = await probeHttp("http://127.0.0.1:4040/api/tunnels", 800);
      if (tunnels.ok) {
        children.set("ngrok", { pid: null, killed: false, external: true });
        ngrokRunning = true;
      }
    }

    return {
      helios: {
        running: children.has("helios") || live.isRunning,
        isRunning: children.has("helios") || live.isRunning,
        isHealthy: live.isHealthy,
        detail: live.details,
        details: live.details,
        pid: children.get("helios")?.pid ?? null,
      },
      docker: {
        running: dockerRunning,
        pid: null,
        detail: `redis=${redisUp || depsRedis} mongo=${mongoUp || depsMongo} (alias ${REDIS_ALIAS}→${REDIS_CONTAINER})`,
      },
      ngrok: {
        running: ngrokRunning,
        pid: children.get("ngrok")?.pid ?? null,
      },
    };
    })();

    try {
      return await statusProbeInFlight;
    } finally {
      statusProbeInFlight = null;
    }
  });

  ipcMain.handle("reports:read", async (_e, options = {}) => {
    const target = options.path
      ? path.isAbsolute(options.path)
        ? options.path
        : path.join(REPO_ROOT, options.path)
      : CSV_PATH;

    if (!fs.existsSync(target)) {
      return { path: target, missing: true, headers: [], rows: [] };
    }
    const text = fs.readFileSync(target, "utf8");
    const { headers, rows } = parseCsv(text);
    return { path: target, missing: false, headers, rows };
  });

  ipcMain.handle("reports:listUploads", async () => {
    if (!fs.existsSync(UPLOADS_REPORTS)) return [];
    return fs
      .readdirSync(UPLOADS_REPORTS)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .map((f) => path.join(UPLOADS_REPORTS, f))
      .sort()
      .reverse()
      .slice(0, 25);
  });

  async function resolveRedisContainer() {
    if (await dockerInspectRunning(REDIS_CONTAINER)) return REDIS_CONTAINER;
    if (await dockerInspectRunning(REDIS_ALIAS)) return REDIS_ALIAS;
    return REDIS_CONTAINER;
  }

  ipcMain.handle("db:status", async () => {
    const redisName = await resolveRedisContainer();
    const redisRunning = await dockerInspectRunning(redisName);
    const mongoRunning = await dockerInspectRunning(MONGO_CONTAINER);

    let redisOk = false;
    let redisDetail = "container down";
    if (redisRunning) {
      const ping = await execCapture("docker", [
        "exec",
        redisName,
        "redis-cli",
        "ping",
      ]);
      redisOk = ping.ok && /PONG/i.test(ping.stdout);
      redisDetail = (ping.stdout || ping.stderr || "").trim() || ping.error;
    }

    let mongoOk = false;
    let mongoDetail = "container down";
    if (mongoRunning) {
      const ping = await execCapture("docker", [
        "exec",
        MONGO_CONTAINER,
        "mongosh",
        "--quiet",
        "--eval",
        "db.runCommand({ ping: 1 }).ok",
      ]);
      mongoOk = ping.ok && String(ping.stdout).trim().startsWith("1");
      mongoDetail = (ping.stdout || ping.stderr || "").trim() || ping.error;
    }

    return {
      redis: {
        ok: redisOk,
        container: redisName,
        port: "6380",
        detail: redisDetail,
      },
      mongo: {
        ok: mongoOk,
        container: MONGO_CONTAINER,
        port: "27017",
        detail: mongoDetail,
      },
    };
  });

  ipcMain.handle("db:nuke", async () => {
    const logs = [];
    const push = (line) => {
      logs.push(line);
      emitLog("nuke", "system", line);
    };

    const redisName = await resolveRedisContainer();
    push("Nuke & Pave started");
    const flush = await execCapture("docker", [
      "exec",
      redisName,
      "redis-cli",
      "FLUSHDB",
    ]);
    push(
      `redis FLUSHDB (${redisName}): ${flush.ok ? "ok" : "fail"} ${(flush.stdout || flush.stderr || flush.error || "").trim()}`
    );

    const drop = await execCapture("docker", [
      "exec",
      MONGO_CONTAINER,
      "mongosh",
      "--quiet",
      "--eval",
      `db.getSiblingDB('${MONGO_DB}').dropDatabase()`,
    ]);
    push(
      `mongo drop ${MONGO_DB}: ${drop.ok ? "ok" : "fail"} ${(drop.stdout || drop.stderr || drop.error || "").trim()}`
    );

    const ok = flush.ok && drop.ok;
    push(ok ? "Nuke & Pave completed" : "Nuke & Pave finished with errors");
    return {
      ok,
      logs,
      error: ok ? undefined : "one or more flush commands failed",
    };
  });

  ipcMain.handle("sim:getToggles", async () => readOverrideToggles());

  ipcMain.handle("sim:setToggles", async (_e, payload = {}) => {
    const incoming = payload.toggles && typeof payload.toggles === "object" ? payload.toggles : {};
    /** @type {Record<string, boolean>} */
    const next = {};
    for (const key of SIM_TOGGLE_KEYS) {
      next[key] = Boolean(incoming[key]);
    }
    if (next.DISABLE_AI_RESCUER) next.AI_DIAGNOSTIC_RESCUE_ENABLED = false;
    const result = writeOverrideToggles(next);
    emitLog(
      "system",
      "system",
      "Simulation overrides updated — restart Helios (or Start again) to apply to API process"
    );
    return { ok: true, ...result };
  });

  ipcMain.handle("sim:getAiModels", async () => {
    const override = readOverrideFile();
    const { apiReady, providerEnvLabel } = await resolveApiReady();
    return {
      ok: true,
      path: override.path,
      models: override.models,
      options: getAllowedModelIds(),
      catalog: catalogPayload(),
      apiReady,
      providerEnvLabel,
      raw: override.raw,
    };
  });

  ipcMain.handle("sim:setAiModels", async (_e, payload = {}) => {
    const incoming = payload.models && typeof payload.models === "object" ? payload.models : {};
    const allowed = getAllowedModelIds();
    /** @type {Record<string, string>} */
    const patch = {};
    for (const key of AI_MODEL_KEYS) {
      if (!(key in incoming)) continue;
      const val = String(incoming[key] || "").trim();
      if (val && !allowed.includes(val)) {
        const { apiReady, providerEnvLabel } = await resolveApiReady();
        return {
          ok: false,
          error: `Invalid model for ${key}: ${val}`,
          path: ENV_OVERRIDE_PATH,
          models: readOverrideFile().models,
          options: allowed,
          catalog: catalogPayload(),
          apiReady,
          providerEnvLabel,
        };
      }
      patch[key] = val;
    }
    const result = writeOverrideFile({ models: patch });
    const { apiReady, providerEnvLabel } = await resolveApiReady();
    emitLog(
      "system",
      "system",
      "AI model routing updated — restart Helios (or Start again) to apply to API process"
    );
    return {
      ok: true,
      path: result.path,
      models: result.models,
      options: getAllowedModelIds(),
      catalog: catalogPayload(),
      apiReady,
      providerEnvLabel,
      raw: result.raw,
    };
  });

  ipcMain.handle("sim:addCustomModel", async (_e, payload = {}) => {
    const id = String(payload.id || "").trim();
    const name = String(payload.name || id).trim();
    const provider = String(payload.provider || "custom").trim().toLowerCase();
    const apiKey = String(payload.apiKey || "").trim();
    const tags = Array.isArray(payload.tags)
      ? payload.tags.filter((t) => VALID_TAGS.has(t))
      : [];
    if (!id) {
      return { ok: false, error: "Model ID is required" };
    }
    if (!VALID_CUSTOM_PROVIDERS.has(provider)) {
      return { ok: false, error: `Invalid provider: ${provider}` };
    }
    if (!tags.length) {
      return { ok: false, error: "Select at least one capability" };
    }
    const envKey = PROVIDER_TO_ENV[provider] || "CUSTOM_AI_API_KEY";
    const list = loadCustomModels().filter((m) => m.id !== id);
    list.push({
      id,
      name,
      provider,
      tags,
      envKey,
      custom: true,
    });
    saveCustomModels(list);

    /** @type {Record<string, string>} */
    const secrets = {};
    if (apiKey) secrets[envKey] = apiKey;
    writeOverrideFile({ secrets });

    const { apiReady, providerEnvLabel } = await resolveApiReady();
    const override = readOverrideFile();
    emitLog("system", "system", `Custom model added: ${id} (${provider})`);
    return {
      ok: true,
      path: override.path,
      models: override.models,
      options: getAllowedModelIds(),
      catalog: catalogPayload(),
      apiReady,
      providerEnvLabel,
      raw: override.raw,
    };
  });

  ipcMain.handle("sim:readEnvPreview", async (_e, payload = {}) => {
    const presentationMode = Boolean(payload.presentationMode);
    const basePath = path.join(API_ROOT, ".env");
    let baseRaw = "";
    if (fs.existsSync(basePath)) {
      baseRaw = fs.readFileSync(basePath, "utf8");
    }
    const override = readOverrideFile();
    return {
      envPath: basePath,
      overridePath: ENV_OVERRIDE_PATH,
      envPreview: maskSensitiveEnvPreview(baseRaw, presentationMode),
      overridePreview: maskSensitiveEnvPreview(override.raw, presentationMode),
      toggles: override.toggles,
      models: override.models,
    };
  });

  ipcMain.handle("hitl:fetchQueue", async () => {
    const result = await fetchHitlQueue();
    if (result.ok && result.items.length) {
      emitLog(
        "system",
        "system",
        `HITL queue: ${result.items.length} run(s) — ${result.items[0].id || "(unknown)"}`
      );
    }
    return result;
  });

  ipcMain.handle("sim:hitlQueue", async () => {
    const result = await fetchLatestHitlPayload();
    if (result.payload) {
      emitLog(
        "system",
        "system",
        `HITL queue: ProcessingRun ${result.payload._id || "(unknown)"}`
      );
    }
    return result;
  });

  /** Allowlist: Upload Hub deep links only (localhost:3002). */
  ipcMain.handle("shell:openExternal", async (_e, payload = {}) => {
    const raw = typeof payload.url === "string" ? payload.url.trim() : "";
    if (!raw) {
      return { ok: false, error: "url required" };
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, error: "invalid url" };
    }
    const hostOk =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "http:" || !hostOk || parsed.port !== "3002") {
      return { ok: false, error: "url not allowlisted" };
    }
    if (!parsed.pathname.startsWith("/upload")) {
      return { ok: false, error: "url not allowlisted" };
    }
    try {
      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

app.whenReady().then(async () => {
  // #region agent log
  agentLog("B", "app.whenReady fired", { packaged: app.isPackaged });
  // #endregion
  registerIpc();
  try {
    await initializeState();
  } catch (e) {
    emitLog("system", "stderr", `initializeState failed: ${e?.message || e}`);
  }
  createWindow();
  // Resume live tails for any existing log files (history loaded by LogViewer IPC).
  for (const id of Object.keys(LOG_FILES)) {
    try {
      startFileTail(id);
    } catch {
      /* ignore */
    }
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Persistent controller: do NOT kill Helios/Ngrok on quit — they stay detached.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // #region agent log
  agentLog("C", "before-quit — leaving detached helios/ngrok running", {
    helios: children.has("helios"),
    ngrok: children.has("ngrok"),
  });
  // #endregion
});
