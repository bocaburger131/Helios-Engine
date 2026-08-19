# Pokémon GO Buddy Interaction Animations — Feasibility Report

## Executive Summary

**Goal:** Obtain 4 specific buddy interaction animations (berry feeding, playing, photo pose, petting) for use in a Three.js web app.

**Bottom line: Feasible but non-trivial.** The animation clips exist inside Pokémon GO's Unity asset bundles but are not directly available in any public GLB repository. A multi-step extraction pipeline is required.

---

## 1. What Already Exists (Public Repos)

### PokeMiners/pogo_assets (⭐494) — THE primary source
**URL:** https://github.com/PokeMiners/pogo_assets  
**Format:** FBX (rigged meshes + skeleton only, **NO animation data**)  
**Files:** `pm0025_00_Rig.fbx` + PNG textures per Pokémon  
**Last 3D asset update:** May 2023 (3 years stale)  

> The PokeMiners repo has static rigged models — the skeleton exists but AnimationClips are **NOT included**. They strip animations during extraction. These FBX files are useful as the base mesh but provide zero buddy animation data.

### Pokemon3D API Assets (⭐14)
**URL:** https://github.com/Pokemon-3D-api/assets  
**Format:** GLB (Draco compressed, WebP textures)  
**Source:** Sketchfab (fan/Nintendo models), **NOT from Pokémon GO**  
**Animations:** Some models have walk/idle cycles — these are fan-made or from the main series games, NOT Pokémon GO buddy interactions  

> Irrelevant for this task. Wrong animations from wrong source.

---

## 2. The Actual Animation Source

Pokémon GO stores buddy interaction animations as:
- **Unity `.anim` AnimationClip files** inside **Unity Addressable Asset Bundles**
- Referenced by **Animator Controllers** (`.controller` files)
- Some are in the APK itself, many more are **downloaded at runtime** via Niantic's remote asset delivery system

### What animations exist in-game (confirmed by gameplay footage & datamining)

| Interaction | Animation | In-game trigger |
|---|---|---|
| Berry feeding | Pokémon reaches toward berry, eats, shows hearts | Tap "Feed" on buddy screen |
| Playing | Pokémon reacts to taps, jumps, spins | Tap buddy in AR mode repeatedly |
| Photo pose | Pokémon faces camera in a specific pose | Camera button during buddy interaction |
| Petting | Pokémon leans into touch, shows affection hearts | Long-press/swipe on buddy in AR |
| Walk/Follow | Pokémon walks alongside trainer | Buddy on map |
| Idle | Various idle stances | Default on buddy screen |
| Quick Treat | Simplified feed animation (non-AR) | Quick Treat button |

**Animation clip internal names** are unknown publicly but follow patterns like:
- `idle`, `idle_loop`, `walk`, `walk_loop`, `run`
- `feed`, `eat`, `berry`
- `pet`, `petting`, `affection`, `love`
- `play`, `playing`, `jump`, `spin`
- `photo`, `camera`, `pose`

These names would need to be discovered by examining the extracted Animator Controllers.

---

## 3. Extraction Pipeline (Step by Step)

### Phase 1: Get the Unity assets
```
APK (download from APKMirror)
  ↓
AssetRipper (best) or AssetStudio (alternative)
  ↓
Extracted Unity project with:
  - FBX models (meshes + skeleton)
  - AnimationClips (.anim files)
  - Animator Controllers (.controller files)
```

**Tools:**
- **[AssetRipper](https://github.com/AssetRipper/AssetRipper)** (recommended) — GUI tool, extracts Unity serialized files back into a Unity project structure. Supports Unity 3.4–2022.3+. Can extract anim files.
- **[AssetStudio (Perfare fork)](https://github.com/Perfare/AssetStudio)** — Can export "Animator with selected AnimationClip" as FBX. Select mesh + AnimationClip → `Model → Export selected objects with AnimationClip`.
- **[UABEA](https://github.com/nesrak1/UABEA)** / **[UABEANext](https://github.com/nesrak1/UABEANext)** — For modding/research. Author recommends AssetRipper/AssetStudio for extraction.

**Important:** Pokémon GO uses Unity's Addressable Assets system. Some bundles are downloaded on-demand. To capture them:
1. Clear app data, launch Pokémon GO, trigger buddy interactions
2. Use a **MITM proxy** (Fiddler, Charles, mitmproxy) to capture asset bundle URLs from Niantic's CDN
3. Download the bundles and feed them into AssetRipper

### Phase 2: Convert to GLB with animations

**Option A: Unity Editor + UnityGLTF (recommended)**
```
Extracted Unity project
  ↓
Open in Unity Editor (free Personal edition works)
  ↓
Install KhronosGroup/UnityGLTF plugin
  ↓
Select GameObject with Animator + AnimationClips
  ↓
Export → GLB (animations baked in as glTF animation clips)
  ↓
Load in Three.js with GLTFLoader
```

**Option B: AssetStudio → FBX → Blender → GLB**
```
AssetStudio: Select mesh + AnimationClip
  ↓
Export as FBX (with animation baked)
  ↓
Import into Blender
  ↓
Re-export as GLB (File → Export → glTF 2.0)
  ↓
Load in Three.js with GLTFLoader
```

**Key tools:**
- **[UnityGLTF](https://github.com/KhronosGroup/UnityGLTF)** (Khronos official) — "You can export entire Animators and their clips as glTF files with multiple animations. Animation clips will be named after each Motion State in the Animator."
- **Blender** — Free, handles FBX→GLB conversion reliably
- **glTF Transform** — Node.js CLI for optimizing GLB files

---

## 4. PGSharp Analysis

**PGSharp is NOT useful for asset extraction.** It is a cheating/mod overlay (GPS spoofing, joystick, etc.) that wraps the official Pokémon GO APK. It does not contain or expose the game's 3D asset bundles. The APK itself (available from APKMirror) is what you need.

---

## 5. Tool Requirements Summary

| Tool | Purpose | Platform | Cost |
|---|---|---|---|
| [AssetRipper](https://github.com/AssetRipper/AssetRipper) | Extract Unity assets from APK/bundles | Win/Mac/Linux | Free |
| [Unity Editor](https://unity.com/download) (Personal) | Open extracted project, run UnityGLTF | Win/Mac/Linux | Free |
| [UnityGLTF](https://github.com/KhronosGroup/UnityGLTF) (via UPM) | Export animated GLB from Unity | In-Unity | Free/MIT |
| [Blender](https://blender.org) | Alternative: FBX→GLB conversion | Win/Mac/Linux | Free |
| [glTF Transform](https://gltf-transform.dev/) | Optimize GLB (Draco, texture resize) | Node.js CLI | Free/MIT |
| APK from [APKMirror](https://apkmirror.com) | Source of Pokémon GO assets | — | Free |
| MITM proxy (optional) | Capture remote asset bundles | Win/Mac/Linux | Free |

---

## 6. Feasibility Assessment

| Animation | Feasibility | Difficulty | Notes |
|---|---|---|---|
| Berry feeding | ✅ Possible | Medium | AnimationClip exists in game bundles; need to find the right one |
| Playing | ✅ Possible | Medium | Tap-reaction animation; multiple variations exist |
| Photo pose | ✅ Possible | Medium-High | May use existing idle pose with camera placement logic |
| Petting | ✅ Possible | Medium | Touch-reaction animation in AR interaction bundles |

**Major unknowns:**
- Whether the buddy animations are packed in the APK or only downloaded remotely (remote is harder)
- The exact AnimationClip names (require discovery)
- Whether animations are per-pokémon or shared (likely per-pokémon for unique body types)
- The rigging/bone naming convention (each Pokémon has a unique skeleton)

**Alternative approach:** Since obtaining the exact GO animations is complex, consider:
- Replicating the interactions via custom Three.js animations on the PokeMiners FBX models
- Using the existing skeleton from the FBX and creating new animations in Blender that approximate the GO behaviors

---

## 7. Recommended Path Forward

### Short-term (prove concept):
1. Download Pokémon GO APK from APKMirror
2. Run AssetRipper on the APK + any captured remote bundles
3. Look for AnimationClips with buddy-related naming
4. Export a single Pokémon + animation as FBX via AssetStudio's "Export with AnimationClip"
5. Convert FBX → GLB in Blender
6. Test in Three.js

### Medium-term (full solution):
1. Set up Unity 2021.3+ with UnityGLTF plugin
2. Open full extracted Pokémon GO project from AssetRipper
3. Locate Animator Controllers for buddy interactions
4. Export the 4 target animations as GLB with UnityGLTF (Animator→multiple clips→export)
5. Optimize with glTF Transform
6. Integrate into web app

### Hardest risk: Remote bundles
If the buddy animations are remote-only, you'll need to use mitmproxy or similar to capture the asset bundles during gameplay. This requires:
- Android device/emulator with a proxy configured
- Pokémon GO running and buddy interactions triggered
- Capturing the AssetBundle download URLs
- Downloading and processing those bundles
