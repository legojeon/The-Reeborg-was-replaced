import type { Direction, WorldV2, CountSpec } from '../../core/types/types';
import type { ObjectKind } from '../../core/world/objectKinds';
import { isObjectKind } from '../../core/world/objectKinds';
import type { TileKind } from '../../core/world/tileKinds';
import { isTileKind } from '../../core/world/tileKinds';
import { normalizeWorld } from '../../core/world/loader';

// A placed start object: a fixed count or a random range.
export type ObjVal = number | { min: number; max: number };
// A goal object requirement: a fixed count or "all" (collect every one).
export type GoalVal = number | 'all';

// One map. A bundle holds several of these and shows one at random on play.
export interface MakerVariant {
  rows: number;
  cols: number;
  robot: { x: number; y: number; dir: Direction };
  robotTokens: number;
  walls: string[]; // canonical "x,y,N" or "x,y,E" (plus boundary S/W)
  objects: Record<string, Partial<Record<ObjectKind, ObjVal>>>;
  tiles: Record<string, TileKind>;
  goalObjects: Record<string, Partial<Record<ObjectKind, GoalVal>>>;
  goalEmptyCells: string[];
  goalWalls: string[];
  // Finish cell. `dir` (optional facing requirement) is preserved from loaded
  // worlds; the maker's finish-cell tool only sets x/y.
  goalPosition: { x: number; y: number; dir?: Direction } | null;
  // Acceptable finish positions from a loaded world. The maker has no tool to
  // author these, but carries them through a load→save round trip so external
  // worlds keep their goal. Mutually exclusive with goalPosition.
  goalFinalPositions: Array<[number, number] | [number, number, Direction]>;
}

// The whole document being edited: shared text + one or more map variants.
export interface MakerState {
  name: string;
  description: string;
  solution: string;
  variants: MakerVariant[];
  active: number; // index of the variant currently shown on the board
}

export function createEmptyVariant(rows = 8, cols = 8): MakerVariant {
  return {
    rows, cols,
    robot: { x: 1, y: 1, dir: 'E' },
    robotTokens: 0,
    walls: [],
    objects: {},
    tiles: {},
    goalObjects: {},
    goalEmptyCells: [],
    goalWalls: [],
    goalPosition: null,
    goalFinalPositions: []
  };
}

export function createEmptyMaker(rows = 8, cols = 8): MakerState {
  return { name: '', description: '', solution: '', variants: [createEmptyVariant(rows, cols)], active: 0 };
}

export function activeVariant(s: MakerState): MakerVariant {
  return s.variants[s.active] ?? s.variants[0];
}

// Apply a board edit to the active variant only.
export function updateActive(s: MakerState, fn: (v: MakerVariant) => MakerVariant): MakerState {
  return { ...s, variants: s.variants.map((v, i) => (i === s.active ? fn(v) : v)) };
}

export function addVariant(s: MakerState): MakerState {
  const cur = activeVariant(s);
  const fresh = createEmptyVariant(cur.rows, cur.cols); // inherit size for convenience
  return { ...s, variants: [...s.variants, fresh], active: s.variants.length };
}

export function removeVariant(s: MakerState, index: number): MakerState {
  if (s.variants.length <= 1) return s;
  const variants = s.variants.filter((_, i) => i !== index);
  const active = Math.max(0, Math.min(variants.length - 1, s.active > index ? s.active - 1 : s.active));
  return { ...s, variants, active };
}

// Insert a deep copy of a variant right after it, and select the copy.
export function duplicateVariant(s: MakerState, index: number): MakerState {
  const src = s.variants[index];
  if (!src) return s;
  const copy: MakerVariant = JSON.parse(JSON.stringify(src));
  const variants = [...s.variants.slice(0, index + 1), copy, ...s.variants.slice(index + 1)];
  return { ...s, variants, active: index + 1 };
}

// A wall click on an edge of a cell normalizes to one canonical key so the
// shared edge between two cells is never stored twice.
export function canonicalWall(x: number, y: number, dir: Direction): string {
  if (dir === 'S' && y > 1) return `${x},${y - 1},N`;
  if (dir === 'W' && x > 1) return `${x - 1},${y},E`;
  return `${x},${y},${dir}`;
}

export function toggleWall(walls: string[], key: string): string[] {
  return walls.includes(key) ? walls.filter(w => w !== key) : [...walls, key];
}

// ---- cell mutation helpers (operate on a single variant, immutable) ----

function withKind<V>(map: Record<string, Partial<Record<ObjectKind, V>>>, coord: string, kind: ObjectKind, value: V | null) {
  const next = { ...map };
  const cell = { ...(next[coord] ?? {}) };
  if (value == null) delete cell[kind];
  else cell[kind] = value;
  if (Object.keys(cell).length === 0) delete next[coord];
  else next[coord] = cell;
  return next;
}

export function setObject(v: MakerVariant, coord: string, kind: ObjectKind, value: ObjVal): MakerVariant {
  return { ...v, objects: withKind(v.objects, coord, kind, value) };
}
export function removeObject(v: MakerVariant, coord: string, kind: ObjectKind): MakerVariant {
  return { ...v, objects: withKind(v.objects, coord, kind, null) };
}
// Add `delta` to the cell's count (stacking on repeated clicks); a range value is
// treated as 0 and replaced. Removes the kind when the total drops to 0 or below.
export function addObject(v: MakerVariant, coord: string, kind: ObjectKind, delta: number): MakerVariant {
  const cur = v.objects[coord]?.[kind];
  const base = typeof cur === 'number' ? cur : 0;
  const next = base + delta;
  return next > 0 ? setObject(v, coord, kind, next) : removeObject(v, coord, kind);
}
export function setGoalObject(v: MakerVariant, coord: string, kind: ObjectKind, value: GoalVal): MakerVariant {
  return { ...v, goalObjects: withKind(v.goalObjects, coord, kind, value), goalEmptyCells: v.goalEmptyCells.filter(c => c !== coord) };
}
export function removeGoalObject(v: MakerVariant, coord: string, kind: ObjectKind): MakerVariant {
  return { ...v, goalObjects: withKind(v.goalObjects, coord, kind, null) };
}
export function addGoalObject(v: MakerVariant, coord: string, kind: ObjectKind, delta: number): MakerVariant {
  const cur = v.goalObjects[coord]?.[kind];
  const base = typeof cur === 'number' ? cur : 0;
  const next = base + delta;
  return next > 0 ? setGoalObject(v, coord, kind, next) : removeGoalObject(v, coord, kind);
}
export function toggleGoalEmpty(v: MakerVariant, coord: string): MakerVariant {
  if (v.goalEmptyCells.includes(coord)) return { ...v, goalEmptyCells: v.goalEmptyCells.filter(c => c !== coord) };
  const goalObjects = { ...v.goalObjects };
  delete goalObjects[coord];
  return { ...v, goalEmptyCells: [...v.goalEmptyCells, coord], goalObjects };
}

// Drop any walls/objects/goals that fall outside a rows×cols grid (used when the
// board is shrunk, so off-grid data never silently serializes into a saved world).
export function pruneToBounds(v: MakerVariant, rows: number, cols: number): MakerVariant {
  const inCell = (key: string) => {
    const [sx, sy] = key.split(',');
    const x = parseInt(sx, 10), y = parseInt(sy, 10);
    return x >= 1 && x <= cols && y >= 1 && y <= rows;
  };
  const filterMap = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => inCell(k)));
  return {
    ...v,
    walls: v.walls.filter(inCell),
    goalWalls: v.goalWalls.filter(inCell),
    objects: filterMap(v.objects),
    goalObjects: filterMap(v.goalObjects),
    tiles: filterMap(v.tiles),
    goalEmptyCells: v.goalEmptyCells.filter(inCell),
    goalPosition: v.goalPosition && (v.goalPosition.x <= cols && v.goalPosition.y <= rows) ? v.goalPosition : null,
    goalFinalPositions: v.goalFinalPositions.filter(([x, y]) => x >= 1 && x <= cols && y >= 1 && y <= rows)
  };
}

export function clearCell(v: MakerVariant, coord: string): MakerVariant {
  const objects = { ...v.objects };
  const goalObjects = { ...v.goalObjects };
  const tiles = { ...v.tiles };
  delete objects[coord];
  delete goalObjects[coord];
  delete tiles[coord];
  const goalPosition = v.goalPosition && `${v.goalPosition.x},${v.goalPosition.y}` === coord ? null : v.goalPosition;
  return { ...v, objects, goalObjects, tiles, goalPosition, goalEmptyCells: v.goalEmptyCells.filter(c => c !== coord) };
}

// ---- serialization ----

const WALL_WORD: Record<string, 'north' | 'east' | 'south' | 'west'> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const WORD_DIR: Record<string, Direction> = { north: 'N', east: 'E', south: 'S', west: 'W' };

function wallsToRecord(keys: string[]): Record<string, Array<'north' | 'east' | 'south' | 'west'>> {
  const walls: Record<string, Array<'north' | 'east' | 'south' | 'west'>> = {};
  for (const key of keys) {
    const [sx, sy, d] = key.split(',');
    (walls[`${sx},${sy}`] ??= []).push(WALL_WORD[d]);
  }
  return walls;
}

// Serialize one variant to a v2 map (no shared name/description/solution).
function variantToV2(v: MakerVariant): WorldV2 {
  const out: WorldV2 = {
    version: 2,
    size: { rows: v.rows, cols: v.cols },
    robot: { x: v.robot.x, y: v.robot.y, dir: v.robot.dir, tokens: v.robotTokens > 0 ? v.robotTokens : undefined }
  };
  if (v.walls.length > 0) out.walls = wallsToRecord(v.walls);

  if (Object.keys(v.objects).length > 0) {
    out.objects = {};
    for (const [coord, kinds] of Object.entries(v.objects)) {
      const cell: Record<string, CountSpec> = {};
      for (const [k, val] of Object.entries(kinds)) {
        if (val == null) continue;
        if (typeof val === 'number') { if (val > 0) cell[k] = val; }
        else cell[k] = { min: val.min, max: val.max };
      }
      if (Object.keys(cell).length > 0) out.objects[coord] = cell;
    }
  }

  if (Object.keys(v.tiles).length > 0) {
    out.tiles = {};
    for (const [coord, kind] of Object.entries(v.tiles)) out.tiles[coord] = kind;
  }

  const goal: NonNullable<WorldV2['goal']> = {};
  const goalObjects: Record<string, any> = {};
  for (const [coord, kinds] of Object.entries(v.goalObjects)) {
    const cell: Record<string, number | 'all'> = {};
    for (const [k, val] of Object.entries(kinds)) {
      if (val === 'all') cell[k] = 'all';
      else if (typeof val === 'number' && val > 0) cell[k] = val;
    }
    if (Object.keys(cell).length > 0) goalObjects[coord] = cell;
  }
  for (const coord of v.goalEmptyCells) goalObjects[coord] = {};
  if (Object.keys(goalObjects).length > 0) goal.objects = goalObjects;
  if (v.goalWalls.length > 0) goal.walls = wallsToRecord(v.goalWalls);
  if (v.goalPosition) {
    goal.position = v.goalPosition.dir
      ? { x: v.goalPosition.x, y: v.goalPosition.y, dir: v.goalPosition.dir }
      : { x: v.goalPosition.x, y: v.goalPosition.y };
  }
  if (v.goalFinalPositions.length > 0) goal.finalPositions = v.goalFinalPositions.map(p => [...p] as typeof p);
  if (Object.keys(goal).length > 0) out.goal = goal;

  return out;
}

// Convert the whole document to v2. A single variant stays a plain world;
// multiple variants produce a bundle.
export function makerToV2(s: MakerState): WorldV2 {
  const shared: Partial<WorldV2> = {};
  if (s.name.trim()) shared.name = s.name.trim();
  if (s.description.trim()) shared.description = s.description;
  if (s.solution.trim()) shared.solution = s.solution;

  if (s.variants.length <= 1) {
    return { ...variantToV2(s.variants[0]), ...shared, version: 2 };
  }
  return { version: 2, ...shared, variants: s.variants.map(variantToV2) };
}

// ---- deserialization ----

function worldToVariant(w: ReturnType<typeof normalizeWorld>): MakerVariant {
  const v = createEmptyVariant(w.height, w.width);
  v.robot = { x: w.robot.x, y: w.robot.y, dir: w.robot.dir };
  v.robotTokens = w.robot.token ?? 0;

  for (const wall of w.walls) if (wall.dir) v.walls.push(canonicalWall(wall.x, wall.y, wall.dir));
  v.walls = Array.from(new Set(v.walls));

  for (const o of w.objects ?? []) {
    if (!isObjectKind(o.kind)) continue;
    const coord = `${o.x},${o.y}`;
    v.objects[coord] ??= {};
    v.objects[coord][o.kind] = o.range ? { min: o.range.min, max: o.range.max } : o.count;
  }

  const tiles = (w as any).backgroundTiles as Record<string, string> | undefined;
  if (tiles) for (const [coord, kind] of Object.entries(tiles)) if (isTileKind(kind)) v.tiles[coord] = kind as TileKind;

  const goal = w.goal;
  if (goal?.objects) {
    for (const [coord, kinds] of Object.entries(goal.objects)) {
      if (Object.keys(kinds).length === 0) { v.goalEmptyCells.push(coord); continue; }
      const cell: Partial<Record<ObjectKind, GoalVal>> = {};
      for (const [k, val] of Object.entries(kinds)) {
        if (!isObjectKind(k)) continue;
        if (val === 'all') cell[k as ObjectKind] = 'all';
        else {
          const n = typeof val === 'number' ? val : parseInt(String(val), 10);
          if (Number.isFinite(n) && n > 0) cell[k as ObjectKind] = n;
        }
      }
      if (Object.keys(cell).length > 0) v.goalObjects[coord] = cell;
    }
  }
  if (goal?.walls) {
    for (const [coord, dirs] of Object.entries(goal.walls)) {
      const [sx, sy] = coord.split(',');
      for (const d of dirs) v.goalWalls.push(canonicalWall(parseInt(sx, 10), parseInt(sy, 10), WORD_DIR[d]));
    }
    v.goalWalls = Array.from(new Set(v.goalWalls));
  }
  if (goal?.position && Number.isFinite(goal.position.x)) {
    const dir = toDir(goal.position.orientation);
    v.goalPosition = { x: Math.floor(goal.position.x), y: Math.floor(goal.position.y), ...(dir ? { dir } : {}) };
  } else if (Array.isArray(goal?.possible_final_positions) && goal.possible_final_positions.length > 0) {
    // Preserve multi-finish goals (no maker tool authors these, but we keep them).
    v.goalFinalPositions = goal.possible_final_positions
      .filter(p => Array.isArray(p) && p.length >= 2)
      .map(p => {
        const dir = p.length >= 3 ? toDir(p[2]) : undefined;
        return (dir ? [Math.floor(p[0]), Math.floor(p[1]), dir] : [Math.floor(p[0]), Math.floor(p[1])]) as [number, number] | [number, number, Direction];
      });
  }
  return v;
}

// Parse an orientation (Direction | number | string) to a Direction, or undefined.
function toDir(o: unknown): Direction | undefined {
  if (typeof o === 'string') {
    const u = o.trim().toUpperCase();
    if (u === 'N' || u === 'NORTH') return 'N';
    if (u === 'E' || u === 'EAST') return 'E';
    if (u === 'S' || u === 'SOUTH') return 'S';
    if (u === 'W' || u === 'WEST') return 'W';
    const n = parseInt(u, 10);
    if (Number.isFinite(n)) return toDir(n);
    return undefined;
  }
  if (typeof o === 'number') {
    switch (o) { case 1: return 'N'; case 2: return 'W'; case 3: return 'S'; case 0: return 'E'; default: return undefined; }
  }
  return undefined;
}

// Load a stored world (single or bundle, v2 or legacy) back into editor state.
export function worldDataToMaker(data: any, name: string): MakerState {
  const s = createEmptyMaker();
  s.name = name;

  const isBundle = data && Array.isArray(data.variants) && data.variants.length > 0;
  const desc = isBundle ? data.description : (data.description ?? undefined);
  const sol = isBundle ? data.solution : (data.solution ?? undefined);
  s.description = textOf(desc);
  s.solution = textOf(sol);

  if (isBundle) {
    // Force each variant explicitly (no random pick) so editing is deterministic.
    s.variants = data.variants.map((vd: any, i: number) => worldToVariant(normalizeWorld({ version: 2, ...vd, variants: undefined }, i)));
  } else {
    s.variants = [worldToVariant(normalizeWorld(data))];
    if (!s.description) s.description = textOf((normalizeWorld(data) as any).description);
    if (!s.solution) s.solution = textOf((normalizeWorld(data) as any).solution);
  }
  s.active = 0;
  return s;
}

function textOf(d: string | string[] | undefined): string {
  if (d == null) return '';
  return Array.isArray(d) ? d.join('\n') : d;
}
