import type { Engine } from '../engine/engine';
import type { Direction, World } from '../types/types';
import type { ObjectKind } from '../world/objectKinds';

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<any>;
  }
}

async function ensurePyodideLoaded() {
  if (window.loadPyodide) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

export interface PyBridge {
  init(engine: Engine): Promise<void>;
  runUserCode(code: string): Promise<void>;
  getPaceMs(): number;
}

export function validatePythonActions(code: string): { ok: boolean; errors: string[] } {//내부함수 에러처리
  const errors: string[] = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // strip comments (naive): split on #, take left side
    const withoutComment = raw.split('#')[0];
    // strip simple quoted strings (naive)
    const stripped = withoutComment.replace(/(['"]).*?\1/g, '');
    // find bare move / turn_left not followed by '('
    const badMove = /\bmove\b(?!\s*\()/.test(stripped);
    const badTurn = /\bturn_left\b(?!\s*\()/.test(stripped);
    const badPut = /\bput\b(?!\s*\()/.test(stripped);
    const badTake = /\btake\b(?!\s*\()/.test(stripped);
    const badWallFront = /\bwall_in_front\b(?!\s*\()/.test(stripped);
    const badWallRight = /\bwall_on_right\b(?!\s*\()/.test(stripped);
    const badObjectHere = /\bobject_here\b(?!\s*\()/.test(stripped);
    const badAtGoal = /\bat_goal\b(?!\s*\()/.test(stripped);
    const badDone = /\bdone\b(?!\s*\()/.test(stripped);
    const badBuildWall = /\bbuild_wall\b(?!\s*\()/.test(stripped);
    if (badMove) {
      errors.push(`Line ${i + 1}: "move" should be "move()"`);
    }
    if (badTurn) {
      errors.push(`Line ${i + 1}: "turn_left" should be "turn_left()"`);
    }
    if (badPut) {
      errors.push(`Line ${i + 1}: "put" should be "put()"`);
    }
    if (badTake) {
      errors.push(`Line ${i + 1}: "take" should be "take()"`);
    }
    if (badWallFront) {
      errors.push(`Line ${i + 1}: "wall_in_front" should be "wall_in_front()"`);
    }
    if (badWallRight) {
      errors.push(`Line ${i + 1}: "wall_on_right" should be "wall_on_right()"`);
    }
    if (badObjectHere) {
      errors.push(`Line ${i + 1}: "object_here" should be "object_here()"`);
    }
    if (badAtGoal) {
      errors.push(`Line ${i + 1}: "at_goal" should be "at_goal()"`);
    }
    if (badDone) {
      errors.push(`Line ${i + 1}: "done" should be "done()"`);
    }
    if (badBuildWall) {
      errors.push(`Line ${i + 1}: "build_wall" should be "build_wall()"`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function createPyBridge(): PyBridge {
  let py: any = null;
  let initialized = false;
  let engineRef: Engine | null = null;
  let paceMs = 1;
  let planWorld: World | null = null; // shadow world to evaluate queries during code generation

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

  async function init(engine: Engine) {
    if (initialized) return;
    engineRef = engine;
    await ensurePyodideLoaded();
    py = await window.loadPyodide!({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/' });

    // Register a JS module that Python can import
    py.registerJsModule('reeborg', {
      enqueue_action: (type: string) => {
        if (type === 'move') {
          engineRef?.enqueue({ type: 'move' });
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
          engineRef?.enqueue({ type: 'turnLeft' });
          if (planWorld) {
            planWorld.robot.dir = turnLeft(planWorld.robot.dir);
          }
        } else if (type === 'put') {
          engineRef?.enqueue({ type: 'put' });
          if (planWorld) {
            const inv = (planWorld.robot.inventory ?? []) as ObjectKind[];
            if (inv.length > 0) {
              const kind = inv.shift() as ObjectKind;
              planWorld.robot.inventory = inv;
              incrementObjectKindAt(planWorld, planWorld.robot.x, planWorld.robot.y, kind);
            }
          }
        } else if (type === 'take') {
          engineRef?.enqueue({ type: 'take' });
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
          engineRef?.enqueue({ type: 'done' });
        } else if (type === 'buildWall') {
          engineRef?.enqueue({ type: 'buildWall' });
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
          if (!w) return false;
          const gp = (w as any).goal?.position;
          if (!gp || typeof gp !== 'object') {
            engineRef?.enqueue({ type: 'trace', message: `at_goal() -> false` });
            return false;
          }
          const gx = Number(gp.x), gy = Number(gp.y);
          const res = Number.isFinite(gx) && Number.isFinite(gy) && w.robot.x === Math.floor(gx) && w.robot.y === Math.floor(gy);
          engineRef?.enqueue({ type: 'trace', message: `at_goal() -> ${res}` });
          return res;
        } catch {
          return false;
        }
      }
    });

    // Define Python wrappers that will be visible to user code
    py.runPython(`
from reeborg import enqueue_action
from reeborg import set_pace
from reeborg import wall_in_front as _wall_in_front
from reeborg import wall_on_right as _wall_on_right
from reeborg import object_here as _object_here
from reeborg import at_goal as _at_goal
def move():
    enqueue_action('move')
def turn_left():
    enqueue_action('turnLeft')
def put():
    enqueue_action('put')
def take():
    enqueue_action('take')
def think(ms):
    set_pace(ms)
def done():
    enqueue_action('done')
def build_wall():
    enqueue_action('buildWall')
def wall_in_front():
    return bool(_wall_in_front())
def wall_on_right():
    return bool(_wall_on_right())
def object_here():
    return bool(_object_here())
def at_goal():
    return bool(_at_goal())
    `);

    initialized = true;
  }

  async function runUserCode(code: string) {
    if (!initialized) throw new Error('Pyodide bridge not initialized');
    // Reset pace to default 1 unless user sets it via think(ms)
    paceMs = 1;
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

  return { init, runUserCode, getPaceMs };
}


