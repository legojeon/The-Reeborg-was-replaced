import { isObjectKind } from './objectKinds';
import type { Direction, World } from '../types/types';
import { DEFAULT_TILE } from './tileKinds';
import type { ObjectKind } from './objectKinds';

function mapWallDirText(d: 'north' | 'east' | 'south' | 'west'): Direction {
  switch (d) {
    case 'north': return 'N';
    case 'east': return 'E';
    case 'south': return 'S';
    case 'west': return 'W';
  }
}

function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world));
}

function pushWallUnique(walls: World['walls'], x: number, y: number, dir: Direction) {
  if (x < 1 || y < 1) return;
  if (walls.some(w => w.x === x && w.y === y && w.dir === dir)) return;
  walls.push({ x, y, dir });
}

function removeWall(walls: World['walls'], x: number, y: number, dir: Direction) {
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    if (w.x === x && w.y === y && w.dir === dir) {
      walls.splice(i, 1);
    }
  }
}

function removeWallSymmetric(walls: World['walls'], x: number, y: number, dir: Direction) {
  // Remove primary
  removeWall(walls, x, y, dir);
  // Remove opposite on neighbor, to keep shared edge consistent
  let nx = x, ny = y;
  let opp: Direction = dir;
  switch (dir) {
    case 'N':
      opp = 'S';
      ny = y + 1;
      break;
    case 'S':
      opp = 'N';
      ny = y - 1;
      break;
    case 'E':
      opp = 'W';
      nx = x + 1;
      break;
    case 'W':
      opp = 'E';
      nx = x - 1;
      break;
  }
  removeWall(walls, nx, ny, opp);
}

function addObjectCount(list: NonNullable<World['objects']>, x: number, y: number, kind: ObjectKind, n: number) {
  if (n <= 0) return;
  const found = list.find(o => o.x === x && o.y === y && o.kind === kind);
  if (found) {
    found.count += n;
  } else {
    list.push({ x, y, kind, count: n });
  }
}

export function applyOnload(world: World, onload?: string[]): World {
  if (!Array.isArray(onload) || onload.length === 0) {
    return world;
  }
  const w = cloneWorld(world);
  if (!w.objects) w.objects = [];
  if (!w.walls) w.walls = [];

  // Minimal background stubs; logic-only, no rendering
  let defaultFill: string | null = null;
  const background = new Map<string, string>(); // key: "x,y" -> tile
  function key(x: number, y: number) { return `${x},${y}`; }

  // Dynamic goal accumulated from onload actions marked with {goal: true}
  const dynGoal: { objects?: Record<string, Record<string, number | string>>, walls?: Record<string, Array<'north' | 'east' | 'south' | 'west'>> } = {};

  const RUR = {
    // Geometry/world
    set_world_size: (width: number, height: number) => {
      if (Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1) {
        w.width = Math.floor(width);
        w.height = Math.floor(height);
      }
    },

    // Background (stubs)
    fill_background: (tile: string) => {
      const t = (tile == null || String(tile).trim() === '') ? DEFAULT_TILE : String(tile);
      defaultFill = t;
    },
    add_background_tile: (tile: string, x: number, y: number) => {
      if (x >= 1 && y >= 1) background.set(key(x, y), String(tile || ''));
    },
    is_background_tile: (tile: string, x: number, y: number) => {
      const t = background.get(key(x, y)) ?? defaultFill ?? DEFAULT_TILE;
      return t === String(tile || '');
    },

    // Walls
    add_wall: (dir: 'north' | 'east' | 'south' | 'west', x: number, y: number, opts?: any) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const d = mapWallDirText(dir);
      const isGoal = !!(opts && typeof opts === 'object' && opts.goal === true);
      if (isGoal) {
        // Goal-only marker: store in dynamic goal, do not add to actual walls (no collision yet)
        dynGoal.walls ??= {};
        const coord = key(ix, iy);
        const arr = new Set(dynGoal.walls[coord] ?? []);
        arr.add(dir);
        dynGoal.walls[coord] = Array.from(arr) as any;
        return;
      }
      if (!w.walls.some(ww => ww.x === ix && ww.y === iy && ww.dir === d)) {
        w.walls.push({ x: ix, y: iy, dir: d });
      }
    },
    remove_wall: (dir: 'north' | 'east' | 'south' | 'west', x: number, y: number) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const d = mapWallDirText(dir);
      removeWallSymmetric(w.walls, ix, iy, d);
    },

    // Objects
    add_object: (kind: string, x: number, y: number, opts?: any) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      if (!isObjectKind(String(kind))) {
        // eslint-disable-next-line no-console
        console.warn('[Onload] Unknown object kind skipped:', kind);
        return;
      }
      let n = 1;
      if (typeof opts === 'number') {
        n = Math.floor(opts);
      } else if (opts && typeof opts === 'object') {
        // Reeborg often uses {'number': n, 'goal': true}
        if (Number.isFinite(opts.number)) n = Math.floor(opts.number);
      }
      const k = String(kind) as ObjectKind;
      const goalMark = !!(opts && typeof opts === 'object' && opts.goal === true);
      if (goalMark) {
        // Treat as goal-only marker; do NOT add to real objects
        dynGoal.objects ??= {};
        const coord = key(ix, iy);
        dynGoal.objects[coord] ??= {};
        dynGoal.objects[coord][k] = n as any;
      } else {
        addObjectCount(w.objects!, ix, iy, k, n);
      }
    },

    // Random
    randint: (min: number, max: number) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    },

    // Misc stubs used by some worlds; no-ops here
    get_robot_by_id: (_id: any) => ({}),
    record_frame: (_name: any, _arg: any) => {},
    _write_ln: (_text: any) => {},
    _move_: () => {}
  } as const;

  try {
    const code = onload.join('\n');
    const fn = new Function('RUR', code);
    fn(RUR as any);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[World Onload] execution failed:', e);
  }

  // Persist default background and per-cell tiles so renderer can pick automatically
  (w as any).backgroundDefault = defaultFill ?? DEFAULT_TILE;
  if (background.size > 0) {
    const obj: Record<string, string> = {};
    for (const [k, v] of background.entries()) {
      obj[k] = v;
    }
    (w as any).backgroundTiles = obj;
  }

  // Attach dynamic goal if any were defined during onload
  if ((dynGoal.objects && Object.keys(dynGoal.objects).length > 0) || (dynGoal.walls && Object.keys(dynGoal.walls).length > 0)) {
    (w as any).goal = (w as any).goal || {};
    if (dynGoal.objects) {
      (w as any).goal.objects = { ...(w as any).goal.objects ?? {}, ...dynGoal.objects };
    }
    if (dynGoal.walls) {
      const prev = (w as any).goal.walls ?? {};
      const merged: Record<string, Array<'north' | 'east' | 'south' | 'west'>> = { ...prev };
      for (const [coord, dirs] of Object.entries(dynGoal.walls)) {
        const set = new Set([...(prev[coord] ?? []), ...dirs]);
        merged[coord] = Array.from(set) as any;
      }
      (w as any).goal.walls = merged;
    }
  }

  return w;
}


