# Helios Dev Console

Electron + Vite + React desktop GUI for local Helios orchestration.

## Run

```bash
cd helios-dev-console
npm install
npm run dev
```

Or from monorepo root:

```bash
npm run dev:console
```

## Features

- Start/stop Helios (`npm run dev`), Docker Redis/Mongo, ngrok (`http 3000`)
- Split-pane log viewer (Node / Ngrok / Docker)
- Report Hub for `reports/extraction_results.csv`
- Data Explorer with Nuke & Pave (Redis FLUSHDB + Mongo `bank-statement-dev` drop)
- **Simulation** panel — env toggles → `bank-statement-analyzer-api/.env.dev.override`, HITL queue inspector, Presentation mode (mask API keys)

Primary brand color: `#3366a9`.

Restart Helios after applying simulation overrides so the API process reloads `.env.dev.override`.