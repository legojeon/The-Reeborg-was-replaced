import type { Direction, World } from '../types/types';
import { applyOnload } from './onload';
import { parseGoal, mergeGoals } from './goal';
import { isObjectKind } from './objectKinds';
import { isTileKind } from './tileKinds';

type ReeborgWorld = {
  rows: number;
  cols: number;
  description?: string;
  onload?: string[];
  goal?: any;
  robots?: Array<{
    x: number;
    y: number;
    orientation?: number | string;
    _orientation?: number | string;
    objects?: { token?: number };
  }>;
  walls?: Record<string, Array<'north' | 'east' | 'south' | 'west'>>;
  objects?: Record<string, Record<string, number | string>>;
};

function mapOrientationToDir(orientation: number | string | undefined): Direction {
  if (orientation === undefined || orientation === null) return 'E';
  // Accept numeric or string inputs like "1", "N", "north"
  if (typeof orientation === 'string') {
    const s = orientation.trim().toUpperCase();
    if (s === 'N' || s === 'NORTH') return 'N';
    if (s === 'E' || s === 'EAST') return 'E';
    if (s === 'S' || s === 'SOUTH') return 'S';
    if (s === 'W' || s === 'WEST') return 'W';
    const asNum = parseInt(s, 10);
    if (Number.isFinite(asNum)) orientation = asNum;
  }
  if (typeof orientation === 'number') {
    // Requested mapping: 1->N, 2->W, 3->S, default E
    switch (orientation) {
      case 1: return 'N';
      case 2: return 'W';
      case 3: return 'S';
      default: return 'E';
    }
  }
  return 'E';
}

function mapWallDir(d: 'north' | 'east' | 'south' | 'west'): Direction {
  switch (d) {
    case 'north': return 'N';
    case 'east': return 'E';
    case 'south': return 'S';
    case 'west': return 'W';
  }
}

export async function loadReeborgWorld(path: string): Promise<World> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load world: ${path}`);
  }
  const data = (await res.json()) as ReeborgWorld;

  const width = data.cols ?? 10;
  const height = data.rows ?? 10;

  const r0 = data.robots && data.robots[0];
  const rx = r0?.x ?? 1;
  const ry = r0?.y ?? 1;
  const rdir = mapOrientationToDir((r0 as any)?._orientation ?? r0?.orientation);
  const token = r0?.objects?.token ?? 0;

  const wallsArr: World['walls'] = [];
  if (data.walls) {
    for (const [key, arr] of Object.entries(data.walls)) {
      const [sx, sy] = key.split(',');
      const x = parseInt(sx, 10);
      const y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (const w of arr) {
        wallsArr.push({ x, y, dir: mapWallDir(w) });
      }
    }
  }

  const objectsArr: NonNullable<World['objects']> = [];
  if (data.objects) {
    for (const [key, kinds] of Object.entries(data.objects)) {
      const [sx, sy] = key.split(',');
      const x = parseInt(sx, 10);
      const y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (const [kind, val] of Object.entries(kinds)) {
        if (!isObjectKind(kind)) {
          // eslint-disable-next-line no-console
          console.warn('[World Loader] Unknown object kind skipped:', kind);
          continue;
        }
        let count = 0;
        let range: { min: number; max: number } | undefined = undefined;
        let hidden: boolean | undefined = undefined;
        if (typeof val === 'number') {
          count = val;
        } else if (typeof val === 'string') {
          const m = val.match(/^(\d+)\s*-\s*(\d+)$/);
          if (m) {
            const a = parseInt(m[1], 10);
            const b = parseInt(m[2], 10);
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            range = { min: lo, max: hi };
            // Randomize an initial value but keep it hidden until first action
            count = Math.floor(Math.random() * (hi - lo + 1)) + lo;
            hidden = true;
          }
        }
        if (count > 0) {
          objectsArr.push({ x, y, kind, count, range, hidden });
        }
      }
    }
  }

  const world: World = {
    width,
    height,
    robot: { x: rx, y: ry, dir: rdir, token, inventory: [] },
    walls: wallsArr,
    objects: objectsArr,
    description: data.description
  };
  const withOnload = applyOnload(world, data.onload);
  // Merge static tiles from JSON ('tiles' section) into backgroundTiles/backgroundDefault
  if ((data as any).tiles && typeof (data as any).tiles === 'object') {
    const tilesSrc = (data as any).tiles as Record<string, string[]>;
    const tilesObj: Record<string, string> = { ...(withOnload as any).backgroundTiles ?? {} };
    for (const [coord, kinds] of Object.entries(tilesSrc)) {
      if (!Array.isArray(kinds) || kinds.length === 0) continue;
      const name = String(kinds[0] ?? '').trim();
      const norm = name.toLowerCase().replace(/[\s\-]+/g, '_');
      const alias: Record<string, string> = { brics: 'bricks', brick: 'bricks', palegrass: 'pale_grass', pale_grn: 'pale_grass' };
      const picked = isTileKind(norm as any) ? norm : (alias[norm] ?? '');
      if (picked && isTileKind(picked as any)) {
        tilesObj[coord] = picked;
      }
    }
    if (Object.keys(tilesObj).length > 0) {
      (withOnload as any).backgroundTiles = tilesObj;
    }
  }
  const parsedGoal = parseGoal(data.goal);
  (withOnload as any).goal = mergeGoals((withOnload as any).goal, parsedGoal);
  return withOnload;
}


