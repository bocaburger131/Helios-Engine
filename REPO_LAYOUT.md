# Helios Engine — Repository Layout

## Canonical source of truth

| Item | Value |
|------|--------|
| **Local path** | `C:\Users\Jorge Brice\Desktop\BankSatement V2` |
| **Git remote (origin)** | https://github.com/bocaburger131/Helios-Engine.git |
| **Upstream (legacy org)** | https://github.com/Shift4funding/Helios-Engine.git — historical API remote; do not use for new clones |
| **Default branch** | `main` |

This is a **monorepo**. There must be **only one `.git` directory** at the repo root. Do not nest git repos inside subfolders.

## Project structure

```
BankSatement V2/
├── bank-statement-analyzer-api/   # Node/Express API (port 3000)
├── helios-dashboard/              # Next.js dashboard (port 3002)
├── scripts/
│   └── start-helios.js            # Starts API + dashboard
├── README.md
└── REPO_LAYOUT.md
```

## Development

```powershell
cd "C:\Users\Jorge Brice\Desktop\BankSatement V2\bank-statement-analyzer-api"
npm install
npm run dev:all

# Or from repo root:
npm run dev
```

## Hermes / agents

- **Do not** use local copies under `C:\BocaBurger\HermesData\` (archived).
- Clone from GitHub: `git clone https://github.com/bocaburger131/Helios-Engine.git`
- Work on branches: `hermes/<task-name>`
- API workdir: `bank-statement-analyzer-api/`
- Open PRs to `main`; never edit the Desktop path directly from container agents.

See [HERMES_GITHUB.md](HERMES_GITHUB.md) for the full agent workflow.
