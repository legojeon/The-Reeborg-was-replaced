import type { Direction, World, WorldV2, GoalV2, Goal, CountSpec } from '../types/types';
import { applyOnload } from './onload';
import { parseGoal, mergeGoals } from './goal';
import { normalizeObjectKind } from './objectKinds';
import { isTileKind } from './tileKinds';

export type ReeborgWorld = {
  rows: number;
  cols: number;
  // Reeborg world files store the description either as a single string
  // or as an array of HTML fragments (one per line).
  description?: string | string[];
  // Reference solution code (custom extension, same string-or-lines format).
  solution?: string | string[];
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

function normalizeDescription(d: string | string[] | undefined): string | undefined {
  if (d == null) return undefined;
  const s = Array.isArray(d) ? d.join('\n') : d;
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
  const data = await res.json();
  return normalizeWorld(data);
}

// Single entry point: accepts either a canonical v2 world or a legacy
// reeborg.ca export and returns the in-memory World.
// `variantIndex` forces a specific bundle variant (used by the editor); when
// omitted, a bundle picks one variant at random.
export function normalizeWorld(data: any, variantIndex?: number): World {
  if (data && data.version === 2) {
    if (Array.isArray(data.variants) && data.variants.length > 0) {
      const i = variantIndex != null
        ? Math.max(0, Math.min(data.variants.length - 1, variantIndex))
        : Math.floor(Math.random() * data.variants.length);
      const pick = data.variants[i] as WorldV2;
      // Variant carries the map; the bundle supplies shared text.
      const merged: WorldV2 = {
        ...pick,
        version: 2,
        name: data.name ?? pick.name,
        description: pick.description ?? data.description,
        solution: pick.solution ?? data.solution
      };
      return parseV2(merged);
    }
    return parseV2(data as WorldV2);
  }
  return parseReeborgWorld(data as ReeborgWorld);
}

function countFromSpec(spec: CountSpec | string | number): { count: number; range?: { min: number; max: number }; hidden?: boolean } {
  if (typeof spec === 'number') return { count: spec };
  if (spec && typeof spec === 'object' && 'min' in spec && 'max' in spec) {
    const lo = Math.min(spec.min, spec.max);
    const hi = Math.max(spec.min, spec.max);
    return { count: Math.floor(Math.random() * (hi - lo + 1)) + lo, range: { min: lo, max: hi }, hidden: true };
  }
  // tolerate legacy "n-m" / "n" strings inside v2 too
  if (typeof spec === 'string') {
    const m = spec.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const lo = Math.min(+m[1], +m[2]);
      const hi = Math.max(+m[1], +m[2]);
      return { count: Math.floor(Math.random() * (hi - lo + 1)) + lo, range: { min: lo, max: hi }, hidden: true };
    }
    const n = parseInt(spec, 10);
    if (Number.isFinite(n)) return { count: n };
  }
  return { count: 0 };
}

function goalV2ToGoal(g: GoalV2 | undefined): Goal | undefined {
  if (!g) return undefined;
  const out: Goal = {};
  if (g.objects) {
    out.objects = {};
    for (const [coord, kinds] of Object.entries(g.objects)) {
      const cell: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(kinds as Record<string, any>)) {
        if (v === 'all') cell[k] = 'all';
        else if (typeof v === 'number') cell[k] = v;
        else if (v && typeof v === 'object' && 'min' in v) cell[k] = v.min; // goal needs an exact count; use min
        else cell[k] = v;
      }
      out.objects[coord] = cell;
    }
  }
  if (g.walls) out.walls = JSON.parse(JSON.stringify(g.walls));
  if (g.position) {
    out.position = { x: g.position.x, y: g.position.y, orientation: g.position.dir };
  }
  if (g.finalPositions) out.possible_final_positions = JSON.parse(JSON.stringify(g.finalPositions));
  return out;
}

export function parseV2(data: WorldV2): World {
  const width = data.size?.cols ?? 10;
  const height = data.size?.rows ?? 10;

  const walls: World['walls'] = [];
  if (data.walls) {
    for (const [coord, arr] of Object.entries(data.walls)) {
      const [sx, sy] = coord.split(',');
      const x = parseInt(sx, 10), y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (const d of arr) walls.push({ x, y, dir: mapWallDir(d) });
    }
  }

  const objects: NonNullable<World['objects']> = [];
  if (data.objects) {
    for (const [coord, kinds] of Object.entries(data.objects)) {
      const [sx, sy] = coord.split(',');
      const x = parseInt(sx, 10), y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (const [kind, spec] of Object.entries(kinds)) {
        const nk = normalizeObjectKind(kind);
        if (!nk) {
          // eslint-disable-next-line no-console
          console.warn('[World v2] Unknown object kind skipped:', kind);
          continue;
        }
        const { count, range, hidden } = countFromSpec(spec as CountSpec);
        if (count > 0) objects.push({ x, y, kind: nk, count, range, hidden });
      }
    }
  }

  const backgroundTiles: Record<string, string> = {};
  if (data.tiles) {
    for (const [coord, kind] of Object.entries(data.tiles)) {
      const norm = String(kind).toLowerCase().replace(/[\s\-]+/g, '_');
      if (isTileKind(norm as any)) backgroundTiles[coord] = norm;
    }
  }

  let world: World = {
    width,
    height,
    robot: { x: data.robot?.x ?? 1, y: data.robot?.y ?? 1, dir: data.robot?.dir ?? 'E', token: data.robot?.tokens ?? 0, inventory: [] },
    walls,
    objects,
    description: normalizeDescription(data.description),
    solution: normalizeDescription(data.solution),
    goal: goalV2ToGoal(data.goal)
  };
  if (Object.keys(backgroundTiles).length > 0) (world as any).backgroundTiles = backgroundTiles;

  // Dynamic worlds still run their onload script at load time.
  if (data.generated && Array.isArray(data.onload) && data.onload.length > 0) {
    const withOnload = applyOnload(world, data.onload);
    // onload may also contribute a goal; merge it in
    (withOnload as any).goal = mergeGoals((world as any).goal, (withOnload as any).goal);
    world = withOnload;
  }

  return world;
}

export function parseReeborgWorld(data: ReeborgWorld, opts?: { skipOnload?: boolean }): World {
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
        const nk = normalizeObjectKind(kind);
        if (!nk) {
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
          objectsArr.push({ x, y, kind: nk, count, range, hidden });
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
    description: normalizeDescription(data.description),
    solution: normalizeDescription(data.solution)
  };
  const withOnload = opts?.skipOnload ? world : applyOnload(world, data.onload);
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


