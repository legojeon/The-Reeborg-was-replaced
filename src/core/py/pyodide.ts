import type { Engine } from '../engine/engine';
import type { Direction, World } from '../types/types';
import type { ObjectKind } from '../world/objectKinds';
import { evaluateGoal } from '../world/goal';

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<any>;
  }
}

// Cache the script-loading promise so concurrent callers never inject the script twice.
let pyodideScriptPromise: Promise<void> | null = null;
function ensurePyodideLoaded(): Promise<void> {
  if (window.loadPyodide) return Promise.resolve();
  if (!pyodideScriptPromise) {
    pyodideScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (e) => {
        pyodideScriptPromise = null; // allow retry on network failure
        reject(e);
      };
      document.head.appendChild(script);
    });
  }
  return pyodideScriptPromise;
}

export interface PyBridge {
  init(engine: Engine): Promise<void>;
  runUserCode(code: string): Promise<void>;
  getPaceMs(): number;
  setStdoutHandler(cb: (text: string) => void): void;
  setStderrHandler(cb: (text: string) => void): void;
}

export interface PreflightError {
  line: number;
  // The bare call name (e.g. "move"); the UI formats the localized message.
  name: string;
}

const BARE_CALL_NAMES = [
  'move',
  'turn_left',
  'put',
  'take',
  'wall_in_front',
  'wall_on_right',
  'object_here',
  'at_goal',
  'front_is_clear',
  'done',
  'build_wall'
] as const;

// Catch the most common beginner mistake — writing `move` instead of `move()` —
// before handing the code to Python, so the message can point at the exact line.
export function validatePythonActions(code: string): { ok: boolean; errors: PreflightError[] } {
  const errors: PreflightError[] = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // strip comments (naive): split on #, take left side
    const withoutComment = raw.split('#')[0];
    // strip simple quoted strings (naive)
    const stripped = withoutComment.replace(/(['"]).*?\1/g, '');
    for (const name of BARE_CALL_NAMES) {
      // skip assignments like `f = move` (aliasing) is intentionally still flagged —
      // kids at this level are far more likely to have forgotten the parentheses.
      const bare = new RegExp(`\\b${name}\\b(?!\\s*\\()`);
      if (bare.test(stripped)) {
        errors.push({ line: i + 1, name });
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// Safety cap: a runaway loop (e.g. `while True: move()`) would otherwise enqueue
// actions forever and freeze the browser tab.
const MAX_QUEUED_ACTIONS = 10000;

export function createPyBridge(): PyBridge {
  let py: any = null;
  let initialized = false;
  let initPromise: Promise<void> | null = null;
  let engineRef: Engine | null = null;
  let queuedCount = 0;
  let paceMs = 1;
  let planWorld: World | null = null; // shadow world to evaluate queries during code generation
  let onStdout: (s: string) => void = () => {};
  let onStderr: (s: string) => void = () => {};

  function cloneWorld<T>(w: T): T {
    return JSON.parse(JSON.stringify(w));
  }
  function turnLeft(dir: Direction): Direction {
    switch (dir) {
      case 'N': return 'W';
      case 'W': return 'S';
      case 'S': return 'E';
      case 'E': return 'N';
    }
  }
  function deltaFor(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
      case 'N': return { dx: 0, dy: 1 };
      case 'E': return { dx: 1, dy: 0 };
      case 'S': return { dx: 0, dy: -1 };
      case 'W': return { dx: -1, dy: 0 };
    }
  }
  function hasWallAt(w: World, x: number, y: number, dir: Direction): boolean {
    return w.walls.some(ww => ww.x === x && ww.y === y && ww.dir === dir);
  }
  function isBlockedByWall(w: World, x: number, y: number, dir: Direction): boolean {
    switch (dir) {
      case 'N':
        return hasWallAt(w, x, y, 'N') || hasWallAt(w, x, y + 1, 'S');
      case 'E':
        return hasWallAt(w, x, y, 'E') || hasWallAt(w, x + 1, y, 'W');
      case 'S':
        return hasWallAt(w, x, y, 'S') || hasWallAt(w, x, y - 1, 'N');
      case 'W':
        return hasWallAt(w, x, y, 'W') || hasWallAt(w, x - 1, y, 'E');
    }
  }
  // Check for a wall on the right side of the robot at (x,y) given its current facing dir
  function hasRightWall(w: World, x: number, y: number, dir: Direction): boolean {
    switch (dir) {
      case 'N': // right edge corresponds to +E
        return hasWallAt(w, x, y, 'E') || hasWallAt(w, x + 1, y, 'W');
      case 'E': // right edge corresponds to +S
        return hasWallAt(w, x, y, 'S') || hasWallAt(w, x, y - 1, 'N');
      case 'S': // right edge corresponds to +W
        return hasWallAt(w, x, y, 'W') || hasWallAt(w, x - 1, y, 'E');
      case 'W': // right edge corresponds to +N
        return hasWallAt(w, x, y, 'N') || hasWallAt(w, x, y + 1, 'S');
    }
  }
  function ensureObjects(w: World) {
    if (!w.objects) w.objects = [];
  }
  function objectsAt(w: World, x: number, y: number) {
    ensureObjects(w);
    return w.objects!.filter(o => o.x === x && o.y === y);
  }
  function decrementOneObjectAt(w: World, x: number, y: number): boolean {
    ensureObjects(w);
    for (let i = 0; i < w.objects!.length; i++) {
      const o = w.objects![i];
      if (o.x === x && o.y === y && o.count > 0) {
        o.count -= 1;
        if (o.count === 0) w.objects!.splice(i, 1);
        return true;
      }
    }
    return false;
  }
  function decrementObjectOfKindAt(w: World, x: number, y: number, kind: ObjectKind): boolean {
    ensureObjects(w);
    for (let i = 0; i < w.objects!.length; i++) {
      const o = w.objects![i];
      if (o.x === x && o.y === y && o.kind === kind && o.count > 0) {
        o.count -= 1;
        if (o.count === 0) w.objects!.splice(i, 1);
        return true;
      }
    }
    return false;
  }
  function incrementTokenAt(w: World, x: number, y: number) {
    ensureObjects(w);
    const existing = w.objects!.find(o => o.x === x && o.y === y && o.kind === 'token');
    if (existing) existing.count += 1;
    else w.objects!.push({ x, y, kind: 'token', count: 1 });
  }
  function incrementObjectKindAt(w: World, x: number, y: number, kind: ObjectKind) {
    ensureObjects(w);
    const existing = w.objects!.find(o => o.x === x && o.y === y && o.kind === kind);
    if (existing) existing.count += 1;
    else w.objects!.push({ x, y, kind, count: 1 });
  }
  function pickKindToTakeAt(w: World, x: number, y: number): ObjectKind | null {
    const here = objectsAt(w, x, y).filter(o => o.count > 0);
    if (here.length === 0) return null;
    here.sort((a, b) => {
      const ga = a.goalMark ? 1 : 0;
      const gb = b.goalMark ? 1 : 0;
      if (ga !== gb) return gb - ga;
      if (a.kind < b.kind) return -1;
      if (a.kind > b.kind) return 1;
      return 0;
    });
    return here[0].kind as ObjectKind;
  }

  function bumpQueuedCount() {
    queuedCount += 1;
    if (queuedCount > MAX_QUEUED_ACTIONS) {
      // Stable marker; the UI localizes it (see pythonErrors.ts).
      throw new Error(`__TOO_MANY_ACTIONS__:${MAX_QUEUED_ACTIONS}`);
    }
  }

  async function init(engine: Engine) {
    engineRef = engine;
    // Concurrent callers (e.g. Run and Next clicked in quick succession) must share
    // one initialization; otherwise Pyodide gets loaded twice.
    if (!initPromise) initPromise = doInit();
    return initPromise;
  }

  async function doInit() {
    await ensurePyodideLoaded();
    py = await window.loadPyodide!({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/' });
    try {
      py.setStdout({ batched: (s: string) => { try { onStdout(s); } catch {} } });
      py.setStderr({ batched: (s: string) => { try { onStderr(s); } catch {} } });
    } catch {
      // ignore if setStdout API not available
    }

    // Register a JS module that Python can import
    py.registerJsModule('reeborg', {
      enqueue_action: (type: string, line?: number) => {
        bumpQueuedCount();
        const ln = Number.isFinite(line) ? Number(line) : undefined;
        if (type === 'move') {
          engineRef?.enqueue({ type: 'move', line: ln });
          if (planWorld) {
            const { dx, dy } = deltaFor(planWorld.robot.dir);
            const nx = planWorld.robot.x + dx;
            const ny = planWorld.robot.y + dy;
            if (
              nx >= 1 &&
              ny >= 1 &&
              nx <= planWorld.width &&
              ny <= planWorld.height &&
              !isBlockedByWall(planWorld, planWorld.robot.x, planWorld.robot.y, planWorld.robot.dir)
            ) {
              planWorld.robot.x = nx;
              planWorld.robot.y = ny;
            }
          }
        } else if (type === 'turnLeft') {
          engineRef?.enqueue({ type: 'turnLeft', line: ln });
          if (planWorld) {
            planWorld.robot.dir = turnLeft(planWorld.robot.dir);
          }
        } else if (type === 'put') {
          engineRef?.enqueue({ type: 'put', line: ln });
          if (planWorld) {
            const inv = (planWorld.robot.inventory ?? []) as ObjectKind[];
            if (inv.length > 0) {
              const kind = inv.shift() as ObjectKind;
              planWorld.robot.inventory = inv;
              incrementObjectKindAt(planWorld, planWorld.robot.x, planWorld.robot.y, kind);
            }
          }
        } else if (type === 'take') {
          engineRef?.enqueue({ type: 'take', line: ln });
          if (planWorld) {
            const kind = pickKindToTakeAt(planWorld, planWorld.robot.x, planWorld.robot.y);
            if (kind) {
              decrementObjectOfKindAt(planWorld, planWorld.robot.x, planWorld.robot.y, kind);
              const inv = (planWorld.robot.inventory ?? []) as ObjectKind[];
              inv.push(kind);
              planWorld.robot.inventory = inv;
            }            
          }
        } else if (type === 'done') {
          engineRef?.enqueue({ type: 'done', line: ln });
        } else if (type === 'buildWall') {
          engineRef?.enqueue({ type: 'buildWall', line: ln });
          if (planWorld) {
            const wx = planWorld.robot.x;
            const wy = planWorld.robot.y;
            const wd = planWorld.robot.dir;
            const exists = planWorld.walls.some(w => w.x === wx && w.y === wy && w.dir === wd);
            if (!exists) {
              planWorld.walls.push({ x: wx, y: wy, dir: wd });
            }
          }
        }
      },
      enqueue_trace: (message: any, line?: number) => {
        bumpQueuedCount();
        try {
          const m = message == null ? '' : String(message);
          const ln = Number.isFinite(line) ? Number(line) : undefined;
          engineRef?.enqueue({ type: 'trace', message: m, line: ln });
        } catch {
          // ignore
        }
      },
      set_pace: (ms: number) => {
        const n = Number(ms*5);
        paceMs = Number.isFinite(n) && n >= 0 ? n : 10; //최소 think 50
      },
      wall_in_front: () => {
        try {
          const w = planWorld ?? engineRef?.getState();
          if (!w) return false;
          const rx = w.robot.x;
          const ry = w.robot.y;
          const dir = w.robot.dir;
          const res = !!isBlockedByWall(w, rx, ry, dir);
          engineRef?.enqueue({ type: 'trace', message: `wall_in_front() -> ${res}` });
          return res;
        } catch {
          return false;
        }
      },
      wall_on_right: () => {
        try {
          const w = planWorld ?? engineRef?.getState();
          if (!w) return false;
          const rx = w.robot.x;
          const ry = w.robot.y;
          const dir = w.robot.dir;
          const res = !!hasRightWall(w, rx, ry, dir);
          engineRef?.enqueue({ type: 'trace', message: `wall_on_right() -> ${res}` });
          return res;
        } catch {
          return false;
        }
      },
      object_here: () => {
        try {
          const w = planWorld ?? engineRef?.getState();
          if (!w) return false;
          const here = (w.objects ?? []).filter(o => o.x === w.robot.x && o.y === w.robot.y);
          const res = here.some(o => o.count > 0);
          engineRef?.enqueue({ type: 'trace', message: `object_here() -> ${res}` });
          return res;
        } catch {
          return false;
        }
      },
      at_goal: () => {
        try {
          const w = planWorld ?? engineRef?.getState();
          const goal = (w as any)?.goal;
          // Delegate to the single source of truth used for final scoring, so the
          // query never disagrees with success/fail (handles position, orientation,
          // possible_final_positions, object counts, "all", empty cells and walls).
          // With no goal (free play) at_goal() is meaningless → false.
          const res = !!(w && goal) && evaluateGoal(w, goal);
          engineRef?.enqueue({ type: 'trace', message: `at_goal() -> ${res}` });
          return res;
        } catch {
          return false;
        }
      }
    });

    // Define Python wrappers that will be visible to user code
    py.runPython(`
import sys as _sys
from reeborg import enqueue_action
from reeborg import set_pace
from reeborg import enqueue_trace as _enqueue_trace
from reeborg import wall_in_front as _wall_in_front
from reeborg import wall_on_right as _wall_on_right
from reeborg import object_here as _object_here
from reeborg import at_goal as _at_goal

def _caller_line():
    # Line number in the caller's frame (= the student's code)
    try:
        return _sys._getframe(2).f_lineno
    except Exception:
        return None

def move():
    enqueue_action('move', _caller_line())
def turn_left():
    enqueue_action('turnLeft', _caller_line())
def put():
    enqueue_action('put', _caller_line())
def take():
    enqueue_action('take', _caller_line())
def think(ms):
    set_pace(ms)
def done():
    enqueue_action('done', _caller_line())
def build_wall():
    enqueue_action('buildWall', _caller_line())
def wall_in_front():
    return bool(_wall_in_front())
def wall_on_right():
    return bool(_wall_on_right())
def object_here():
    return bool(_object_here())
def at_goal():
    return bool(_at_goal())
def front_is_clear():
    return not bool(_wall_in_front())
# override print to enqueue messages into the engine action queue (keeps order with moves)
def print(*args, sep=' ', end='\\n'):
    try:
        s = sep.join(str(a) for a in args) + end
    except Exception:
        s = sep.join(map(str, args)) + end
    _enqueue_trace(s, _caller_line())
    `);

    initialized = true;
  }

  async function runUserCode(code: string) {
    if (!initialized) throw new Error('Pyodide bridge not initialized');
    // Reset pace to default 1 unless user sets it via think(ms)
    paceMs = 1;
    queuedCount = 0;
    // Initialize planning world from current engine state for consistent queries during code gen
    try {
      const snapshot = engineRef?.getState();
      planWorld = snapshot ? cloneWorld(snapshot) : null;
    } catch {
      planWorld = null;
    }
    // Execute user code only; we do not auto-invoke any run() function.
    try {
      await py.runPythonAsync(code);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Pyodide] runUserCode error', err);
      throw err;
    }
  }

  function getPaceMs() {
    return paceMs;
  }

  function setStdoutHandler(cb: (text: string) => void) {
    onStdout = cb || (() => {});
  }
  function setStderrHandler(cb: (text: string) => void) {
    onStderr = cb || (() => {});
  }

  return { init, runUserCode, getPaceMs, setStdoutHandler, setStderrHandler };
}


