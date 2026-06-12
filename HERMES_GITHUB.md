# Hermes Agent — GitHub Workflow

Use this instead of local BocaBurger folder copies.

## Clone and branch

```bash
git clone https://github.com/bocaburger131/Helios-Engine.git
cd Helios-Engine
git checkout -b hermes/your-task-name
```

## Working directories

| Task | Path |
|------|------|
| API / validation / parsers | `bank-statement-analyzer-api/` |
| Dashboard UI | `helios-dashboard/` |
| Start both locally | `node scripts/start-helios.js` (from repo root) |

There is **no** `package.json` at repo root except the convenience `npm run dev` script. Run `npm install` inside each subproject.

## Before opening a PR

```bash
cd bank-statement-analyzer-api
npm run test:unit

cd ../helios-dashboard
npm test
```

## Pull request

- Target branch: `main`
- Title: `hermes: <short description>`
- Do not commit: `.env`, `uploads/`, `node_modules/`, `ruvector.db`, `.swarm/` memory DBs

## Docker / container mount (if required)

Mount the **git clone**, not Desktop or BocaBurger:

```bash
-v /path/to/Helios-Engine:/workspace
```

Workdir: `/workspace/bank-statement-analyzer-api`

Do **not** mount `:ro` if the agent needs to write files for commits.
