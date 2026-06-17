# Agent instructions (Hermes / Cursor / RuFlo)

**Canonical repo:** https://github.com/bocaburger131/Helios-Engine.git  
**Do not** use archived copies under `C:\BocaBurger\HermesData\`.

## Workflow

1. Clone from GitHub (not Desktop or BocaBurger paths).
2. Branch: `hermes/<task-name>` off `main`.
3. API workdir: `bank-statement-analyzer-api/`
4. Dashboard workdir: `helios-dashboard/`
5. Open PR to `main`; run tests before push.

Full details: [HERMES_GITHUB.md](HERMES_GITHUB.md) and [REPO_LAYOUT.md](REPO_LAYOUT.md).

Hermes Docker setup: run `C:\BocaBurger\HermesScripts\setup-hermes-github.ps1 -Token github_pat_xxx` after creating a fine-grained PAT.
