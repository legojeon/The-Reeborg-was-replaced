<h1 align="center">The-Reeborg-was-replaced</h1>

<p align="center">
  <b>Learn Python by guiding a robot through a 3D world — with a built-in visual map maker.</b><br/>
  A modern, 3D reimagining of <a href="https://reeborg.ca/reeborg.html">Reeborg's World</a> for kids and beginners.
</p>

<p align="center">
  <i>Write Python on the right, watch the robot act in the 3D world on the left.</i>
</p>

<p align="center">English · <a href="README.ko.md">한국어</a></p>

---

## What is this?

**The-Reeborg-was-replaced** is a browser-based environment where learners control a virtual robot using Python in a 3D world. It is inspired by the classic **Reeborg's World**, rebuilt from scratch with a real-time 3D engine, a friendly editor, kid-friendly feedback, and a no-code **map maker**.

Everything runs **fully in the browser** — the Python code executes client-side via [Pyodide](https://pyodide.org/) (no server needed).

<p align="center">
  <img src="assets/241_view.png" alt="The-Reeborg-was-replaced — a mission in the 3D world" width="820"/><br/>
  <sub>A mission in the live 3D world.</sub>
</p>

### Original vs. the remake

The original Reeborg's World is a 2D grid with a classic interface. This project keeps the same teaching idea but rebuilds the experience as a real-time 3D world with a modern UI.

<table>
<tr>
<td width="50%" align="center">
  <img src="assets/reeborg_original.png" alt="Reeborg's World — the original (2D)" width="400"/><br/>
  <sub><b>Reeborg's World</b> — the original: flat 2D grid, classic UI</sub>
</td>
<td width="50%" align="center">
  <img src="assets/3d_original.png" alt="The-Reeborg-was-replaced — the 3D remake" width="400"/><br/>
  <sub><b>The-Reeborg-was-replaced</b> — real-time 3D world, modern UI</sub>
</td>
</tr>
</table>

---

## Features

- **Real Python in the browser** — code runs via Pyodide (WebAssembly), no backend required.
- **3D viewport** — the robot, objects, walls, tiles, and a solid "plateau" base are rendered live with Three.js.
- **Friendly editor** — syntax highlighting, Reeborg-API autocomplete, and **live line highlighting** (green = running line, red = error line).
- **Step-by-step controls** — Run, Stop, Prev, Next, and Reset to walk through a program one action at a time.
- **Missions with a goal checklist** — each mission shows a per-condition checklist so learners see *partial progress*, not just pass/fail.
- **Kid-friendly errors** — raw Python tracebacks are translated into clear, localized hints pointing at the exact line.
- **First-person "robot view"** — see the world through the robot's eyes.
- **Visual Map Maker** — build worlds by clicking: walls, tiles, objects, and goals. Save, test, and export to JSON — no coding required.
- **Random worlds without code** — bundle several map *variants*; one is shown at random each run, so a single solution must generalize.
- **Progress & solutions** — cleared missions are remembered (localStorage), and worlds can ship an optional **"Solution"** to reveal.
- **Korean / English** — full in-app language toggle for both the learning page and the map maker.

<p align="center">
  <img src="assets/241_robot_view.png" alt="The full interface — mission, 3D world, and Python editor side by side" width="820"/><br/>
  <sub>The full interface — mission &amp; goal checklist, the live 3D world, and the Python editor with a Result panel.</sub>
</p>

---

## Robot API (the Python you write)

| Command | What it does |
|---|---|
| `move()` | Move forward one cell |
| `turn_left()` | Turn 90° to the left |
| `take()` | Pick up an object in the current cell |
| `put()` | Put down a carried object |
| `build_wall()` | Build a wall on the facing side |
| `done()` | End the run here |
| `think(ms)` | Set the delay between actions (bigger = slower) |
| `wall_in_front()` / `wall_on_right()` | `True` if there is a wall there |
| `front_is_clear()` | `True` if the way ahead is open |
| `object_here()` | `True` if an object is in the current cell |
| `at_goal()` | `True` if the goal is reached |
| `print(...)` | Show text in the Result panel |

Standard Python (`if`, `while`, `for`, `def`, functions, variables…) works too. In the app, the **"?"** button (bottom-right of the world) opens this same reference.

---

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) **20.19+ or 22+**.

```bash
# 1. install dependencies (first time only)
npm install

# 2. start the dev server (hot reload)
npm run dev          # → http://localhost:5173

# 3. or build + preview the production bundle
npm run build        # outputs static files to dist/
npm run preview      # → http://localhost:4173
```

> The first time you press **▶ Run**, the Python engine (Pyodide) is downloaded from a CDN, so an **internet connection is required** even locally.

---

## Map Maker

Open **`/maker`** (or the Map Maker button) to author worlds visually:

- **Drawing tools** — place the robot & its facing, draw **walls** by clicking cell edges, paint **floor tiles**, or erase.
- **Place objects** — pick a kind (token, carrot, apple…) and click to drop it; the options bar sets a fixed **count** or a **random range**.
- **Goals** — set target objects (with a "collect **all**" option), empty-cell goals, goal walls, and a finish cell.
- **Variants** — add multiple maps under one world; on play, **one is chosen at random** (great for "can't-memorize" challenges).
- **Save / Test / Export** — worlds are saved to your browser (localStorage) and can be exported as JSON.

Saved worlds appear in the learning page's **"My worlds"** dropdown.

<p align="center">
  <img src="assets/map_maker.png" alt="Map Maker" width="820"/><br/>
  <sub>Draw walls/tiles/objects/goals, manage variants, then Save &amp; Test.</sub>
</p>

The **World manager** lists every world — built-in **Mission**s and your own **Free** worlds — where you can preview each one, **import**/**export** its JSON, or delete it.

<p align="center">
  <img src="assets/worlds.png" alt="World manager" width="820"/><br/>
  <sub>The World manager — preview, import, export, or remove worlds, then jump back to Learn.</sub>
</p>

---

## World format

Worlds are JSON in a canonical **v2** schema (`public/worlds/*.json`), loaded via a single `normalizeWorld()` entry point that also understands legacy Reeborg exports:

```jsonc
{
  "version": 2,
  "name": "아토241",
  "size": { "rows": 8, "cols": 12 },
  "robot": { "x": 1, "y": 1, "dir": "E", "tokens": 0 },
  "walls":   { "3,3": ["north", "east"] },
  "objects": { "5,4": { "carrot": 3 } },     // or a range: { "carrot": { "min": 1, "max": 5 } }
  "tiles":   { "5,4": "grass" },
  "goal":    { "objects": { "9,1": { "carrot": "all" } } },
  "description": ["<h1>Title</h1><p>…</p>"],
  "solution": ["move()", "turn_left()"]
}
```

A **bundle** uses `"variants": [ { …world… }, … ]` to ship several maps and pick one at random.

`public/worlds/index.json` is the registry of available missions (a committed artifact — the app fetches it at runtime).

---

## Project structure

```
src/
  App.tsx                 # layout, world selection, routing, popups
  main.tsx                # routes (/, /world/:id, /maker, /maker/:id) + i18n provider
  core/                   # framework-agnostic engine (no React)
    engine/               # action queue, stepping, rewind
    py/                   # Pyodide bridge: Python ↔ engine
    renderer/             # Three.js scene, robot, walls, objects, tiles, cliff base
    world/                # v2 loader, goal evaluation, onload, object/tile kinds
    types/                # shared types (World, WorldV2, Goal…)
  ui/
    components/           # Viewport, Controls, Editor, MissionPanel, ResultPanel, popups
    maker/                # Map Maker (model + UI)
    useExecution.ts       # hook wiring engine ↔ UI (run/stop/step/reset)
    i18n.tsx              # Korean/English strings + language toggle
    messages.ts, pythonErrors.ts, progress.ts, customWorlds.ts
public/
  worlds/                 # *.json missions + index.json registry
scripts/
  migrateWorldsToV2.ts    # one-time legacy → v2 migration tool
assets/                   # screenshots (used in this README)
```

---

## Tech stack

**React + TypeScript** · **Vite** · **Three.js** (3D) · **Pyodide** (in-browser Python) · **CodeMirror** (editor) · **React Router**

---

## License

ISC. See `package.json` for details.
