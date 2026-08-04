# Tech Stack Research: AI-Assisted Mobile Game + Dashboard — 2025/2026

**Project:** Pokégatchi (BLE-connected mobile game + web dashboard)
**Research date:** July 2026
**Sources:** NovelBits, SoloDevStack, Tech Insider, SitePoint, Cosmic JS, TECHSY, Augment Code, FG Factory, Summer Engine, Digital Applied, MG Software

---

## 1. Mobile Framework: BLE-Heavy Game

### The BLE Complexity Spectrum

| BLE Complexity | Recommended Approach |
|---|---|
| Simple read/write, foreground-only, low throughput | Cross-platform (Flutter or RN) ✅ |
| OTA firmware updates (DFU), persistent background, high throughput | **Native (Kotlin + Swift)** or hybrid cross-platform + native plugins |
| Streaming data, real-time sensor, tight timing | **Native only** — abstractions introduce unacceptable latency |

### Flutter vs React Native for BLE + Gaming

| Dimension | Flutter | React Native |
|---|---|---|
| **BLE library maturity** | `flutter_blue_plus` — actively maintained, stable, largest community | `react-native-ble-plx` — functional but less stable; RN New Architecture compatibility issues reported |
| **BLE community verdict** | **Best cross-platform BLE choice** (per NovelBits, multiple dev surveys) | Works, but Flutter's BLE plugins are "generally more stable" |
| **Game engine** | **Flame Engine** — genuine 2D game engine, component-based, active Game Jams, runs on mobile/desktop/web | **No native game engine** — must assemble Skia + Reanimated + Matter.js manually; ~50 entity limit before frame drops |
| **Performance model** | Dart compiled to ARM native; Skia rendering; no JS bridge | JavaScript bridge; Skia for GPU rendering but logic on JS thread |
| **BLE + game coexistence** | Both run on Dart VM — same thread, simpler coordination | BLE (native module) ↔ JS bridge ↔ game loop — more glue code |
| **AI tool friendliness** | Strong (Dart is statically typed, good for AI code gen) | Strong (TypeScript has the richest AI training data) |

### 🏆 Verdict: Flutter + Flame Engine

**For a BLE-connected 2D mobile game, Flutter + Flame is the clear winner:**

- **Flame** gives you a real game loop, sprites, collision, camera, particle effects — not a DIY assembly
- `flutter_blue_plus` is the most stable cross-platform BLE library
- Single language (Dart) for both BLE and game logic avoids bridge overhead
- If your BLE needs are **truly complex** (DFU, persistent background, high throughput), go **native (Kotlin/Swift)** and accept the dual-platform cost

**When to go native:** If the BLE device requires OTA firmware updates during gameplay OR needs sub-50ms latency guarantees, native is non-negotiable. Cross-platform BLE plugins can't reliably handle these scenarios.

---

## 2. Backend Framework: Game API Server

### Comparison Matrix (2026)

| Framework | Lang | Requests/sec (Bun) | Requests/sec (Node) | Bundle size | Best For |
|---|---|---|---|---|---|
| **Hono** | TS/JS | 180,000 (Bun.serve) | 65,000 | <14 KB | Edge/serverless, lightweight APIs, cost-sensitive |
| **Fastify** | TS/JS | 95,200 | 55,800 | ~50 KB | High-perf Node.js, JSON Schema validation |
| **Express 5** | TS/JS | 89,421 | 28,743 | ~200 KB | Maximum ecosystem, lowest learning curve |
| **FastAPI** | Python | N/A | N/A | Larger dep tree | Auto-docs, ML/DS integration, Pydantic validation |
| **Elysia** | TS/JS (Bun-native) | 200,000+ | N/A | Tiny | Bun-committed teams wanting maximum perf |

### Runtime: Bun vs Node.js (2026)

| Factor | Bun 1.3 | Node.js 23 |
|---|---|---|
| HTTP throughput | 180K req/s | 65K req/s |
| Cold start | 8–15 ms | 40–120 ms |
| TypeScript | **Native, zero-config** | Experimental (--experimental-strip-types) |
| npm compat | ~98% of top 1000 | 100% (native) |
| Built-in tools | Package manager, bundler, test runner, SQLite | External (npm, Vite, Jest) |
| Package install | 10–30× faster than npm | Baseline |
| Windows stability | ✅ (1.3+) | ✅ |

### Hosting Cost Reality Check

| Setup | Cost at 2M requests/month |
|---|---|
| Hono + Cloudflare Workers | **$0** (free tier) to $5 (paid) |
| FastAPI + VPS | ~$5–20/month (always-on server) |
| Hono + Bun + VPS | ~$5–10/month |

### 🏆 Verdict: Hono + Bun

**For a game backend where you need WebSocket support, low latency, and cost efficiency:**

- **Hono** gives you Express-like DX with 3–4× the throughput and edge deployability
- **Bun** is mature enough in 2026 (1.3, Windows-stable, 98% compat) and gives you TypeScript, bundler, and test runner for free
- Deploy on Cloudflare Workers for free/low-cost at MVP scale; migrate to Bun-on-VPS if edge limitations bite
- **If you need Python's data/ML ecosystem** (e.g., player analytics, ML-based matchmaking), FastAPI is the best Python option by far

**Fallback:** If your team knows Express and you value ecosystem safety over performance, Express 5 + Bun is still a 3× improvement over Express + Node.js.

---

## 3. Dashboard Framework: Game Admin/Player Dashboard

### Framework Positioning (2026)

| Framework | Philosophy | Best For | Bundle | SEO |
|---|---|---|---|---|
| **Next.js 16** | Full-stack React, SSR-first | SaaS, e-commerce, public-facing apps | ~92 KB | ✅ Excellent |
| **Vite + React** | SPA, CSR-only | **Dashboards, admin panels, internal tools** | ~42 KB | ❌ Poor |
| **Astro 6.4** | Content-first, zero JS default | Blogs, docs, marketing sites | 0 KB default | ✅ Excellent |

### The Dashboard Decision

Game dashboards are almost always **auth-gated** (no SEO needed), **real-time** (WebSocket polling), and **heavy on interactivity** (charts, tables, filters). This is the SPA sweet spot.

| Factor | Next.js (App Router) | Vite + React + TanStack Query |
|---|---|---|
| Learning curve | Steep (RSC, file conventions, caching) | Low (standard React) |
| HMR speed | 100–300ms (Turbopack) | **<50ms (Vite)** — dramatically faster dev loop |
| Hosting | Needs Node.js server or Vercel | **Static CDN** ($0 on Cloudflare Pages/Netlify) |
| Real-time data | Server Components complicate WebSocket patterns | Straightforward client-side WebSocket + React Query |
| Route complexity | Handled by framework | React Router v7 or TanStack Router |
| Bundle size | ~92 KB | ~42 KB |

### 🏆 Verdict: Vite + React + TanStack Query + React Router v7

**For a game dashboard, the SPA approach wins on every axis that matters:**

- **Faster development** (sub-50ms HMR vs 100–300ms)
- **Cheaper hosting** (static CDN, often free)
- **Simpler architecture** (no server components, no RSC serialization, no caching confusion)
- **Better real-time fit** (WebSocket/SSE in client-side React is straightforward)
- **Smaller bundle** (42KB vs 92KB)

The React team itself says: "Use a framework if you can, and Vite for SPAs when that doesn't apply." A dashboard is exactly when it doesn't apply.

**UI kit recommendation:** Pair with **shadcn/ui** (Tailwind + Radix) for rapid dashboard construction.

---

## 4. AI Coding Tools for Game Development

### Market Reality (2026)

- **87% of game developers** use AI agents in their workflows (GamesIndustry.biz 2025 survey)
- Developers using AI coding assistants complete tasks **55% faster** (Stanford/MIT controlled study)
- AI tools now span **4 distinct jobs**: in-engine agents, asset generators, code assistants, design/ideation

### The Big Three: Head-to-Head

| Factor | Claude Code | Cursor | GitHub Copilot |
|---|---|---|---|
| **Interface** | Terminal (CLI) | AI-native IDE (VS Code fork) | IDE extension |
| **Autonomy** | **Highest** — plans, edits, runs commands, opens PRs | Medium-high — Agent mode with inline diffs | Medium — conversational, more manual |
| **Models** | Claude models only | Multi-provider | **Widest** — OpenAI, Anthropic, Google, xAI |
| **Individual price** | $20/mo (Claude Pro) | $20–200/mo | **$10/mo (Pro)** |
| **Free tier** | Limited | Hobby (limited) | **Yes** — 2K completions + 50 agent chats/mo |
| **Best for** | Autonomous refactors, infra, terminal-native devs | Visual-diff workflows, IDE-native experience | Teams on GitHub, multi-model flexibility |
| **Game dev specific** | Strong for engine code, build scripts, CI | Strong for asset workflow, visual code review | Strong for Unity/Unreal scripting (multi-model) |

### Game-Specific AI Tools

| Tool | What It Does | Best For |
|---|---|---|
| **Summer Engine** | AI-native engine (Godot-compatible), build-play-fix loop | Full game construction by AI |
| **Unity Muse** | In-editor AI for C# scripting, texture/sprite gen | Unity teams |
| **Rosebud AI** | Prompt-to-game, auto mechanics | Prototyping |
| **Meshy / Tripo / Rodin** | AI 3D model generation | Asset creation |
| **Scenario** | Style-consistent AI art generation | 2D art pipelines |
| **ElevenLabs / Suno** | Voice, SFX, music generation | Audio prototyping |

### 🏆 Verdict: Claude Code + Copilot (dual-wield)

**For AI-assisted game development in a small team:**

1. **Claude Code** as your primary agent — it's the most autonomous, handles complex multi-file refactors, and its SWE-bench score (80.9%) is the highest for real-world coding tasks. Use it for: architecture planning, game logic implementation, BLE module code, backend API construction.

2. **GitHub Copilot** as your inline assistant — $10/mo, works in every IDE, multi-model flexibility means you can use cheap models for autocomplete and premium for complex completions. Use it for: boilerplate, type definitions, inline suggestions, quick fixes.

3. **For Flutter/Dart specifically:** Cursor has strong Flutter support with its VS Code base. If you want visual diffs and IDE-native AI, Cursor is excellent — but at $20/mo minimum vs Copilot's $10.

**For asset generation (non-code):** Meshy (3D), Scenario (2D art), ElevenLabs (audio) — all with free tiers for prototyping.

---

## 5. Token Utilization Strategy: Model Routing

### The Core Principle

> ⚠️ **Using a single model for everything is now a costly anti-pattern.** Smart teams route tasks to the right model at the right reasoning level.

### Model Cost/Benchmark at a Glance (Dec 2025–Mid 2026)

| Model | Input $/M tok | Output $/M tok | SWE-bench | Speed | Best Role |
|---|---|---|---|---|---|
| **Claude Opus 4.6** | $5.00 | $25.00 | **80.9%** | 49 tok/s | Architect, coordinator, complex debugging |
| **GPT-5.2** | $1.75 | $14.00 | 80.0% | **187 tok/s** | Real-time interactions, code review |
| **Gemini 3 Pro** | $2.00 | $12.00 | 76.8% | 95 tok/s | Multimodal, 1M context tasks |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | ~73% | 80 tok/s | Implementation workhorse |
| **DeepSeek V3.2** | **$0.28** | **$0.42** | 73.1% | 142 tok/s | Boilerplate, docs, simple tasks, high-volume |
| **Claude Haiku 4.5** | $1.00 | $5.00 | ~65% | Fast | File navigation, search, simple completions |

### The Routing Playbook for Game Development

#### Stage 1: Planning & Architecture
**Model: Claude Opus 4.6 ($$$), reasoning: High**
- Game architecture design, data model design, API schema planning
- BLE protocol design, state machine architecture
- Cost is justified — architecture errors cascade expensively

#### Stage 2: Heavy Implementation
**Model: Claude Sonnet 4.6 ($$), reasoning: Medium-High**
- Game logic implementation, dashboard component building
- WebSocket handlers, BLE service implementations
- Good balance of quality and cost

#### Stage 3: Boilerplate & Documentation
**Model: DeepSeek V3.2 ($), reasoning: Low**
- CRUD endpoints, type definitions, form validation schemas
- README files, API documentation, test fixtures
- CSS/Tailwind utility classes, configuration files
- **94% cheaper than Opus — save $4.72 per million input tokens**

#### Stage 4: Code Review & QA
**Model: GPT-5.2 ($$), reasoning: Medium**
- Fast (187 tok/s), good at catching bugs
- Multi-model perspective catches issues Claude might miss
- Batch review of PRs

#### Stage 5: Real-Time Completions
**Model: Claude Haiku 4.5 ($), reasoning: Low**
- In-IDE autocomplete
- Fast, cheap, good enough for line-level suggestions

### Two-Level Routing: Model + Reasoning Effort

Every model call should specify both **which model** AND **how hard it should think**:

| Compute Band | Reasoning Level | Use Case |
|---|---|---|
| **Don't Overthink** | Low/none | Formatting, simple transformations, documentation |
| **Balanced (Workhorse)** | Medium | Code generation, analysis, most implementation |
| **Pay for Certainty** | High/Max | Architecture, security audit, complex debugging |

### Cost Comparison: 10M Token Project

| Strategy | Cost |
|---|---|
| All Opus (no routing) | **$300.00** |
| All DeepSeek (no routing) | **$7.00** |
| Smart routing (70% DeepSeek, 20% Sonnet, 10% Opus) | **~$42.00** — 86% savings vs all-Opus with near-frontier quality |

---

## 🎯 Final Stack Recommendation

```
┌──────────────────────────────────────────────────────┐
│                 POKÉGATCHI TECH STACK                 │
├──────────────┬───────────────────────────────────────┤
│ Mobile Game  │ Flutter 3.x + Flame Engine             │
│              │ BLE: flutter_blue_plus                 │
│              │ State: Riverpod or BLoC                │
├──────────────┼───────────────────────────────────────┤
│ Backend API  │ Hono 4.x + Bun 1.3                     │
│              │ DB: SQLite (bun:sqlite) → PostgreSQL   │
│              │ WS: Native Bun.serve WebSocket         │
│              │ Validation: Zod                        │
│              │ Hosting: Cloudflare Workers (MVP)       │
├──────────────┼───────────────────────────────────────┤
│ Dashboard    │ Vite 6 + React 19 + TypeScript         │
│              │ Router: React Router v7                │
│              │ Data: TanStack Query v5                │
│              │ UI: shadcn/ui + Tailwind CSS           │
│              │ Charts: Recharts or Tremor             │
│              │ Hosting: Cloudflare Pages ($0)          │
├──────────────┼───────────────────────────────────────┤
│ AI Tools     │ Claude Code (primary agent)            │
│              │ GitHub Copilot ($10/mo inline)         │
│              │ Meshy/Scenario (assets, as needed)     │
├──────────────┼───────────────────────────────────────┤
│ Model Routing│ DeepSeek V3.2 — 70% of calls (cheap)   │
│              │ Sonnet 4.6 — 20% of calls (workhorse)  │
│              │ Opus 4.6 — 10% of calls (architecture) │
└──────────────┴───────────────────────────────────────┘
```

### Key Rationale

1. **Flutter + Flame** is the only cross-platform option that gives you both a real game engine AND stable BLE libraries. React Native requires too much DIY assembly for the game layer.

2. **Hono + Bun** gives you maximum performance-per-dollar with a modern DX. You get TypeScript, bundler, test runner, and SQLite without installing anything extra. Deploy for $0 on Cloudflare Workers at MVP scale.

3. **Vite + React SPA** is objectively correct for an auth-gated dashboard. No SSR overhead, cheaper hosting, faster dev loop, simpler mental model. Next.js adds complexity you don't need.

4. **Claude Code** is the best autonomous agent for game development (highest SWE-bench, best at multi-file refactors), supplemented by Copilot for inline completions.

5. **Model routing saves 86%** on token costs without sacrificing quality. DeepSeek handles the 70% of tasks that don't need frontier reasoning.

