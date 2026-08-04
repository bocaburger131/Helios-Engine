# Pokégatchi — Architecture Recommendation

> Based on research of open-source Three.js projects, the Pokémon3D API ecosystem, WebGL best practices, and virtual pet game patterns.

---

## 🔍 Research Summary

### What Real Projects Do

| Project | Stack | Structure | Key Takeaway |
|---------|-------|-----------|--------------|
| **Pokémon3D Showcase** | React 19 + Vite + TS + `<model-viewer>` | `src/components/`, `src/hooks/`, `src/services/` | Went from vanilla → React + Vite. Uses `<model-viewer>` web component, not raw Three.js |
| **SlashSaber** (72★) | Vue 3 + Vite + TS + Three.js + cannon-es | `src/game/`, `src/components/`, `src/store/` | Game logic in `src/game/`, Vue for UI overlays. Clear separation of 3D vs 2D |
| **Soffritti Three.js Template** | Vanilla JS | `SceneManager.js` + `sceneSubjects/` | Classic: SceneManager owns the render loop, SceneSubjects are entities. Event bus for decoupling |
| **Three.js Examples** (official) | Vanilla ES modules | One HTML file per example, no shared structure | They're examples, not production apps. Not scalable by design |

### The Critical Finding: Three.js + Vanilla ES Modules + CDN

**Three.js r128 (your current version) is the last version that worked without import maps from CDN.** From r152+, Three.js requires `type="importmap"` to use ES module CDN versions (unpkg, esm.sh, jsdelivr). Your r128 CDN `<script>` tag approach is the correct choice for zero-build.

However, r128 is **7 major versions behind** (current r175+). You're missing DRACOLoader improvements, WebGPU support, performance fixes. The tradeoff: upgrading means either (a) import maps, (b) a build tool, or (c) the UMD bundle.

---

## 1. CODE ORGANIZATION PATTERNS — RECOMMENDED APPROACH

### Verdict: Feature-Based ES Modules via `type="module"` Script Tags

**For the constraint** (vanilla JS, no build, GitHub Pages), the best structure is:

- **ES modules** (not IIFE, not namespaces) — use `<script type="module" src="...">` for code files
- **Feature-based splitting** — files grouped by game feature, not by layer
- **Centralized game state store** — a single observable state object, not distributed state
- **Three.js as a UMD `<script>` tag** (r128) — no import maps needed

### Why Feature-Based > Layer-Based

```
❌ LAYER-BASED (bad for this game):
js/
  models/
    Pet.js
    Pokemon.js
  views/
    PetRenderer.js
    HUDView.js
  controllers/
    GameController.js
    PetController.js
  services/
    SaveManager.js
    ModelLoader.js

✅ FEATURE-BASED (better for this game):
js/
  core/           # Engine infrastructure
  pet/            # Everything about the pet
  ui/             # 2D overlays/HUD
  data/           # Pokemon data, save/load
  utils/          # Shared helpers
```

**Why:** Feature-based keeps related code together. When you change how the pet evolves, you touch files in `pet/`, not 4 separate layer directories. As the game grows, entire features can be extracted or refactored independently.

### State Management: Centralized Observable Store

```js
// js/core/Store.js — Single source of truth
const store = {
  state: {
    pet: { species: 'pikachu', stage: 'egg', happiness: 100, hunger: 50 },
    inventory: [],
    settings: { music: true, effects: true },
    time: { elapsed: 0, lastSave: Date.now() }
  },
  listeners: new Map(),

  get(key) {
    return key.split('.').reduce((o, k) => o?.[k], this.state)
  },

  set(key, value) {
    const keys = key.split('.')
    const lastKey = keys.pop()
    const target = keys.reduce((o, k) => o[k], this.state)
    target[lastKey] = value
    this._notify(key, value)
  },

  subscribe(key, fn) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key).add(fn)
    return () => this.listeners.get(key).delete(fn)
  },

  _notify(key, value) {
    this.listeners.get(key)?.forEach(fn => fn(value))
    // Also notify wildcard and parent keys
  }
}
```

This is **9 lines of core logic** and gives you React-like reactivity without React. It's the simplest thing that works.

### Reference: Three.js Project Structure Examples

| Project | Org Pattern | Files | Notes |
|---------|------------|-------|-------|
| Pokemon3D Showcase | Feature-based (React) | ~15 src files | TypeScript, hooks per feature |
| SlashSaber | Hybrid: `game/` (ECS-like) + `components/` (Vue) | ~30 src files | Game logic fully separated from UI |
| Soffritti's template | Layer-based (MVC-light) | 5 files | Too simple for a game, but good starting concept |

---

## 2. GAME ARCHITECTURE PATTERNS

### 2A. Game Loop Pattern

```js
// js/core/GameLoop.js
export class GameLoop {
  constructor() {
    this._lastTime = performance.now()
    this._animFrameId = null
    this._systems = []  // Update systems registered by features
    this._tick = 0
  }

  start() {
    this._lastTime = performance.now()
    this._loop(this._lastTime)
  }

  stop() {
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId)
  }

  register(system) {
    this._systems.push(system)
  }

  _loop(now) {
    this._animFrameId = requestAnimationFrame(t => this._loop(t))

    const dt = Math.min((now - this._lastTime) / 1000, 0.1) // Cap at 100ms
    this._lastTime = now

    // Fixed-step simulation (for physics/evolution timers)
    this._tick++
    const step = 1/60 // 60Hz simulation

    // Update all registered systems
    for (const system of this._systems) {
      system.update(dt, step, this._tick)
    }
  }
}
```

**Key pattern:** Separate the Three.js render from game logic. Register "systems" that each handle one concern (pet update, animation, save timer, auto-mode AI). The render call belongs in a `RenderSystem` registered with the loop, not in the loop itself.

### 2B. Class Hierarchy vs Entity-Component-System

**RECOMMENDATION: Class hierarchy (composition-over-inheritance)**, NOT full ECS.

**Why not ECS:** ECS shines with hundreds/thousands of similar entities (bullets, particles, enemies). You have **one** pet. ECS adds indirection and complexity for zero benefit here. A-Frame uses ECS because it's a general-purpose framework. Your game is specialized.

**Recommended approach: Class hierarchy with composable traits:**

```js
// js/pet/Pet.js — The single pet entity
import { EvolutionStateMachine } from './EvolutionStateMachine.js'
import { Stats } from './Stats.js'
import { AnimationController } from './AnimationController.js'
import { ExpressionOverlay } from './ExpressionOverlay.js'

export class Pet {
  constructor(species, scene) {
    this.species = species
    this.stats = new Stats()               // hunger, happiness, energy
    this.fsm = new EvolutionStateMachine()  // egg→baby→teen→adult→mega
    this.model = null                       // Three.js Group (loaded async)
    this.animator = new AnimationController()
    this.expression = new ExpressionOverlay()
    this.scene = scene
  }

  async init() {
    this.model = await ModelLoader.load(this.species, this.fsm.currentStage)
    this.scene.add(this.model)
    this.animator.attach(this.model)
    this.expression.attach(this.model)
  }

  update(dt) {
    this.stats.tick(dt)          // Decay hunger, etc.
    this.fsm.checkEvolution(this.stats)  // Check if should evolve
    this.animator.update(dt)     // Blend animations
    this.expression.update(this.stats)   // Show mood expression
  }

  async evolve() {
    const newStage = this.fsm.evolve()
    this.scene.remove(this.model)
    // Dispose old model
    this.model = await ModelLoader.load(this.species, newStage)
    this.scene.add(this.model)
    this.animator.attach(this.model)
  }
}
```

### 2C. State Machine for Pet Evolution

```js
// js/pet/EvolutionStateMachine.js
const EVOLUTION_STAGES = {
  EGG:    { duration: 300_000, next: 'BABY',    anim: 'idle', modelSuffix: 'egg' },
  BABY:   { duration: 600_000, next: 'TEEN',    anim: 'idle', modelSuffix: 'baby' },
  TEEN:   { duration: 900_000, next: 'ADULT',   anim: 'walk', modelSuffix: '' },
  ADULT:  { duration: 1_800_000, next: 'MEGA',  anim: 'run',  modelSuffix: 'mega' },
  MEGA:   { duration: Infinity, next: null,      anim: 'run',  modelSuffix: 'mega' },
}

export class EvolutionStateMachine {
  constructor() {
    this.stage = 'EGG'
    this.stageTime = 0
    this._transitions = {
      EGG:    { canEvolve: (s) => s.stageTime >= EVOLUTION_STAGES.EGG.duration },
      BABY:   { canEvolve: (s) => s.stageTime >= EVOLUTION_STAGES.BABY.duration
                                  && s.stats.happiness > 50 },
      TEEN:   { canEvolve: (s) => s.stageTime >= EVOLUTION_STAGES.TEEN.duration
                                  && s.stats.happiness > 70 },
      ADULT:  { canEvolve: (s) => s.stageTime >= EVOLUTION_STAGES.ADULT.duration
                                  && s.stats.happiness > 90 },
      MEGA:   { canEvolve: () => false },
    }
  }

  checkEvolution(stats) {
    this.stageTime += stats.dt * 1000 // ms
    if (this._transitions[this.stage].canEvolve({ stageTime: this.stageTime, stats })) {
      return this.stage
    }
    return null
  }

  evolve() {
    const next = EVOLUTION_STAGES[this.stage].next
    if (next) {
      this.stage = next
      this.stageTime = 0
      // Dispatch event for UI to react
      window.dispatchEvent(new CustomEvent('pet:evolve', { detail: { stage: next } }))
    }
    return this.stage
  }
}
```

### 2D. Event-Driven Architecture

Use the **native DOM CustomEvent system** — no library needed. This decouples game logic from UI.

```js
// Fire events
window.dispatchEvent(new CustomEvent('pet:feed', { detail: { food: 'berry' } }))
window.dispatchEvent(new CustomEvent('pet:happiness-change', { detail: { value: 85 } }))
window.dispatchEvent(new CustomEvent('save:completed', { detail: { timestamp: Date.now() } }))

// Listen anywhere
window.addEventListener('pet:evolve', (e) => {
  showEvolutionAnimation(e.detail.stage)
})

// Event naming convention:
// `domain:action` — pet:feed, ui:click, save:load, game:start
```

**Events vs direct calls:** Events for decoupled concerns (UI reacting to game state). Direct method calls for tightly coupled logic (pet.feed() directly modifying pet.stats). Use both — they're not competing.

### 2E. Save/Load Pattern

**TWO-TIER approach** (not one-or-the-other):

| Storage | For | Capacity | Speed | API |
|---------|-----|----------|-------|-----|
| **localStorage** | Quick auto-save, settings | 5-10MB | Sync, instant | `JSON.stringify` |
| **IndexedDB** | Full save slots, model cache | 50MB-1GB | Async | `idb-keyval` or raw |

```js
// js/data/SaveManager.js
const SAVE_KEY = 'pokegatchi_save'
const AUTO_SAVE_INTERVAL = 30_000 // 30s

export class SaveManager {
  constructor(store) {
    this.store = store
    this._autoSaveTimer = null
  }

  startAutoSave() {
    this._autoSaveTimer = setInterval(() => this.autoSave(), AUTO_SAVE_INTERVAL)
  }

  autoSave() {
    // Save only what's needed — NOT Three.js objects (they can't be serialized)
    const snapshot = {
      pet: this.store.get('pet'),
      inventory: this.store.get('inventory'),
      settings: this.store.get('settings'),
      time: { played: this.store.get('time.elapsed'), lastSave: Date.now() }
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot))
    } catch (e) {
      console.warn('Save failed (storage full?):', e)
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      // Validate structure
      if (!data.pet || !data.pet.stage) return null
      return data
    } catch {
      return null
    }
  }

  // For full save slots, use IndexedDB via a simple wrapper
  async saveSlot(slotName, data) {
    // Delegate to IndexedDB for named save slots
  }
}
```

**CRITICAL RULE:** Never try to serialize Three.js objects (meshes, materials, scenes). Save data only — species name, stage name, stat values. Reload means reconstructing the 3D scene from data.

---

## 3. PERFORMANCE FOR MOBILE

### 3A. Bundle Size Optimization

**You can't optimize a bundle when there is no bundle.** The CDN approach means users download Three.js from a CDN cache (hot cache for many users). Your JS files should be small by design.

| Asset | Size (approx) | Strategy |
|-------|---------------|----------|
| Three.js r128 CDN | ~520KB min | CDN-cached, one-time download |
| Your game JS (all modules) | ~30-60KB | Keep it lean — no unnecessary deps |
| GLB model (Draco) | ~200-800KB | Lazy load on demand |
| 2D sprites | ~10-50KB each | Sprite atlas / lazy load |
| CSS | ~5KB | Inline critical, lazy rest |

**Key optimizations specific to your stack:**
- Use `defer` on all scripts (not `async`) — preserves order, doesn't block parse
- Lazy-load GLB models: fetch only the current pet's model, cache in memory
- Pokémon sprites from PokeAPI sprites CDN (not your domain) — they're CDN-hosted
- Minimize your JS: one `import` chain from `main.js` (tree-shakeable by the browser's module loader)

### 3B. Texture/Model Lazy Loading

```js
// js/data/ModelLoader.js
const modelCache = new Map()
const LOADING = new Map() // deduplicate in-flight requests

export async function loadModel(species, stage) {
  const key = `${species}-${stage}`
  if (modelCache.has(key)) return modelCache.get(key)
  if (LOADING.has(key)) return LOADING.get(key) // Wait for in-flight

  const url = `https://assets.pokemon3d-api.com/models/${species}/${stage}.glb`

  const loader = new THREE.GLTFLoader()
  const dracoLoader = new THREE.DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
  loader.setDRACOLoader(dracoLoader)

  const promise = new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      modelCache.set(key, gltf.scene)
      LOADING.delete(key)
      resolve(gltf.scene)
    }, undefined, reject)
  })

  LOADING.set(key, promise)
  return promise
}

export function disposeModel(model) {
  model.traverse(child => {
    if (child.isMesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
  // Remove from cache
  for (const [key, cached] of modelCache) {
    if (cached === model) { modelCache.delete(key); break }
  }
}
```

### 3C. WebGL Context Management

```js
// In your renderer setup:
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('canvas'),
  antialias: true,
  alpha: false,          // No transparency — saves compositing
  powerPreference: 'high-performance'  // Tells browser to use dedicated GPU
})

// CRITICAL FOR MOBILE:
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
// Never use devicePixelRatio directly — kills performance on high-DPI phones

// Optional: reduce resolution further on slow devices
if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
  renderer.setPixelRatio(1)
}
```

**Mobile WebGL Pitfalls (from MDN best practices):**
- Always call `.dispose()` on geometry, material, texture when swapping models
- Don't call `getError()` or `getParameter()` in production (synchronous stall)
- Batch draw calls — one mesh per pet is ideal (you already have this)
- Use `renderer.info.render.calls` in dev to monitor draw calls (should be < 50 for one pet + scene)
- Context loss: listen for `webglcontextlost` and `webglcontextrestored` events on canvas

### 3D. Mobile-Specific Considerations

**Touch events:**
```js
// One touch handler, don't duplicate
const touchHandler = {
  startX: 0, startY: 0,
  onSwipe: null,
  onTap: null,

  handleStart(e) {
    const t = e.touches[0]
    this.startX = t.clientX
    this.startY = t.clientY
  },

  handleEnd(e) {
    const t = e.changedTouches[0]
    const dx = t.clientX - this.startX
    const dy = t.clientY - this.startY
    const dist = Math.sqrt(dx*dx + dy*dy)

    if (dist < 10) {
      this.onTap?.(t.clientX, t.clientY)    // Tap = interact
    } else if (Math.abs(dx) > Math.abs(dy)) {
      this.onSwipe?.(dx > 0 ? 'right' : 'left', dist) // Swipe = feed/play
    } else {
      this.onSwipe?.(dy > 0 ? 'down' : 'up', dist)
    }
  }
}
```

**Screen sizes:** Use `renderer.setSize(window.innerWidth, window.innerHeight)` on resize, but keep the render at 1x or 2x pixel ratio. Use CSS `width: 100vw; height: 100vh` on the canvas.

**Battery:** The requestAnimationFrame loop runs constantly in auto-mode. On mobile:
- Pause the render loop when the tab is hidden (`document.visibilitychange` event)
- In auto-mode, render at half framerate (every 2nd RAF) by tracking a frame counter
- Use `navigator.getBattery()` (if available) to reduce quality when < 20%

---

## 4. RECOMMENDED TECH STACK EVOLUTION

### Current State Assessment

| Dimension | Current | Recommendation |
|-----------|---------|----------------|
| **Build tool** | None | Stay none for now |
| **Framework** | Vanilla JS | Stay vanilla for now |
| **Three.js version** | r128 CDN `<script>` | Stay r128 for CDN simplicity |
| **Serving** | GitHub Pages / `index.html` | Works fine |

### When to Add a Build Tool

Add **Vite** when you hit ONE of these:
1. You need to upgrade Three.js past r152 (requires import maps or a bundler)
2. Your own JS code exceeds ~50KB and you want minification
3. You want TypeScript
4. You want to use npm packages beyond Three.js

**Vite recommendation:** Vite is the clear winner for this use case. It has zero-config Three.js support, GitHub Pages deployment is one command (`npm run build && npx gh-pages -d dist`), and it gives you hot module reload during development.

### When to Add a Framework

Add a framework when the UI complexity outweighs the 3D complexity. If you have:
- Multiple screens (menu, game, evolution animation, settings)
- Complex HUD with many interactive elements
- Inventory management, multiple pets

**Then** a framework becomes worth it. **React** is the safe choice (R3F ecosystem is mature). **Vue** works (SlashSaber proves it). **Svelte** is leanest but has less Three.js ecosystem.

BUT: A framework means a build tool is mandatory. You can't use React/Vue/Svelte from CDN without JSX compilation (for React/Vue) or compiler (for Svelte).

### PWA Support

**Add this TODAY** — it costs nothing and works with vanilla static hosting:

```html
<!-- index.html -->
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#ff0000">
<meta name="apple-mobile-web-app-capable" content="yes">
```

```json
// manifest.json
{
  "name": "Pokégatchi",
  "short_name": "Pokégatchi",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#ff0000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

For **offline support**, add a service worker that caches Three.js CDN assets + your JS + core CSS:

```js
// sw.js — Cache-first for your assets, network-first for CDN
const CACHE = 'pokegatchi-v1'
const PRECACHE = [
  '/', '/index.html', '/css/style.css',
  '/js/main.js', '/js/core/Store.js', '/js/core/GameLoop.js',
  '/js/pet/Pet.js', '/js/pet/EvolutionStateMachine.js',
  '/js/ui/HUD.js', '/js/data/SaveManager.js'
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim())
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  // Three.js CDN: cache-first (it's versioned, won't change)
  if (url.hostname.includes('cdnjs') || url.hostname.includes('unpkg')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(
        res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res }
      ))
    )
    return
  }
  // Your assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
```

### Evolution Path (Recommended)

```
Phase 1 (NOW)    — Vanilla JS, r128 CDN, single index.html
                       ↓     (code grows beyond 30KB or need r152+)
Phase 2          — Add Vite, keep vanilla JS, upgrade Three.js
                       ↓     (UI gets complex, multiple screens)
Phase 3          — Add React with R3F, TypeScript
                       ↓     (if ever needed)
Phase 4          — Full PWA, service worker, IndexedDB sync
```

**Advice: Stay in Phase 1 as long as it works.** You can always migrate later. Premature build-tooling is the #1 cause of stalled hobby projects.

---

## 5. CODE ORGANIZATION — SUGGESTED PROJECT TREE

```
pokegatchi/
├── index.html              # Entry point — minimal HTML shell
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (optional)
│
├── css/
│   └── style.css           # All styles (keep under 500 lines)
│
├── js/
│   ├── main.js             # Entry: bootstraps everything
│   │
│   ├── core/
│   │   ├── Store.js        # Centralized observable state
│   │   ├── GameLoop.js     # rAF loop + system registration
│   │   ├── EventBus.js     # Optional typed event helpers
│   │   └── SceneSetup.js   # Renderer, scene, camera creation
│   │
│   ├── pet/
│   │   ├── Pet.js          # Main pet entity (composes below)
│   │   ├── EvolutionStateMachine.js  # Egg→Baby→Teen→Adult→Mega
│   │   ├── Stats.js        # Hunger, happiness, energy, etc.
│   │   ├── AnimationController.js    # GLTF animation playback
│   │   └── ExpressionOverlay.js      # 2D expression sprite overlay
│   │
│   ├── data/
│   │   ├── PokemonData.js  # Species info, evolution trees, stats
│   │   ├── ModelLoader.js  # GLB loading + caching + disposal
│   │   ├── SaveManager.js  # localStorage + IndexedDB save/load
│   │   └── SpriteManager.js # 2D sprite loading + CSS sprites
│   │
│   ├── ui/
│   │   ├── HUD.js          # Stats display, buttons, menus
│   │   ├── EvolutionScene.js # Evolution animation sequence
│   │   └── TouchHandler.js # Touch/swipe input abstraction
│   │
│   └── utils/
│       ├── math.js         # Clamp, lerp, random, easing
│       ├── time.js         # Format duration, time-ago
│       └── dom.js          # Safe DOM helpers
│
├── assets/
│   ├── sprites/            # 2D expression overlays, UI icons
│   ├── sounds/             # (future) Sound effects
│   └── textures/           # (future) Custom textures
│
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Actions → GitHub Pages
```

### File Count & Sizing

| Category | Files | Lines/file (max) | Total (est) |
|----------|-------|------------------|-------------|
| `core/` | 4 | 100 | 400 |
| `pet/` | 5 | 150 | 750 |
| `data/` | 4 | 200 | 800 |
| `ui/` | 3 | 150 | 450 |
| `utils/` | 3 | 60 | 180 |
| CSS | 1 | 300 | 300 |
| HTML | 1 | 80 | 80 |
| **Total** | **21** | — | **~2,960 lines** |

This is a manageable codebase for one developer. Each file has a single responsibility.

### Naming Conventions

| Convention | Example | Why |
|------------|---------|-----|
| **Files: PascalCase** for classes/modules | `Pet.js`, `GameLoop.js` | Matches class name inside |
| **Files: camelCase** for utilities | `math.js`, `dom.js` | Not classes, just functions |
| **Classes: PascalCase** | `class EvolutionStateMachine` | Standard JS convention |
| **Functions: camelCase** | `function loadModel()` | Standard JS convention |
| **Events: `domain:action`** | `'pet:evolve'`, `'save:completed'` | Namespace prevents collisions |
| **Constants: UPPER_SNAKE** | `EVOLUTION_STAGES`, `AUTO_SAVE_INTERVAL` | Clearly "this is a constant" |
| **Private: `_` prefix** | `this._autoSaveTimer` | Clearly "don't touch this from outside" |

### Module Boundaries (import rules)

```
                ┌──────────┐
                │ main.js  │ — Only this file touches the DOM
                └────┬─────┘
                     │ imports
         ┌───────────┼───────────┐
         ▼           ▼           ▼
     ┌──────┐  ┌─────────┐  ┌──────┐
     │ core │  │   pet   │  │ data │
     └──┬───┘  └────┬────┘  └──┬───┘
        │           │          │
        │           ▼          │
        │       ┌────────┐     │
        └──────►│  utils │◄────┘
                └────────┘
```

- **`core/`** imports nothing from the project (pure engine)
- **`pet/`** imports from `core/` and `data/`
- **`data/`** imports from `core/` (Store) and `utils/`
- **`ui/`** imports from `core/` (Store events) and `pet/`
- **`utils/`** imports nothing (pure functions)
- **No circular imports** — enforce this strictly

---

## 6. RECOMMENDED DEPLOYMENT

### GitHub Actions Deploy Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .            # Deploy from repo root
          keep_files: false
```

**No build step needed** for vanilla JS. If you add Vite later, add `run: npm run build` before deploy and change `publish_dir: ./dist`.

---

## 7. SUMMARY OF KEY DECISIONS

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Module system** | ES modules (`type="module"`) | Native, no build tool needed |
| **File splitting** | Feature-based (pet/, data/, ui/, core/) | Co-locates related code |
| **State management** | Centralized observable Store | Simple, testable, no deps |
| **Game loop** | RAF with registered systems | Extensible, separates concerns |
| **Entity pattern** | Class with composition | ECS is overkill for 1 entity |
| **Pet evolution** | Finite state machine | Well-understood, testable |
| **Events** | DOM CustomEvents | Zero dependencies, native |
| **Save system** | localStorage primary, IndexedDB for slots | Simple for auto-save, advanced for full saves |
| **Pixel ratio** | `Math.min(devicePixelRatio, 2)` | Balances quality vs performance |
| **Model loading** | Lazy-load + cache + dispose on swap | Minimizes memory |
| **Build tool** | None now, Vite later | Don't add complexity until needed |
| **Framework** | None now, React+R3F later | Same reasoning |
| **Three.js version** | Stay on r128 until upgrade needed | Avoids import-map complexity |
| **PWA** | Add manifest.json + sw.js | Free win, works with static hosting |
| **Deploy** | GitHub Pages via Actions | Free, automatic | 

---

## Key References

- [Pokemon3D API Showcase](https://github.com/Pokemon-3D-api/showcase) — React + Vite + `<model-viewer>` Pokedex
- [Pokemon3D API Assets](https://github.com/Pokemon-3D-api/assets) — Draco-compressed GLB model pipeline
- [SlashSaber](https://github.com/honzaap/SlashSaber) — Vue + Three.js game with clean `src/game/` separation
- [Soffritti Three.js Structure](https://pierfrancesco-soffritti.medium.com/how-to-organize-the-structure-of-a-three-js-project-77649f58fa3f) — SceneManager/SceneSubject pattern
- [MDN WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) — Context management, draw calls, limits
- [100 Three.js Performance Tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips) — Modern optimization guide
- [Three.js Discourse: Vanilla JS + CDN](https://discourse.threejs.org/t/cdn-es6-module-import-requires-importmap-vanilla-js/68353) — Import map requirements discussion
