import type { Direction, Goal, World } from '../types/types';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function parseDir(v: unknown): Direction | undefined {
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    if (s === 'N' || s === 'NORTH') return 'N';
    if (s === 'E' || s === 'EAST') return 'E';
    if (s === 'S' || s === 'SOUTH') return 'S';
    if (s === 'W' || s === 'WEST') return 'W';
  } else if (typeof v === 'number') {
    // Align with loader mapping: 1->N, 2->W, 3->S, default E
    switch (v) {
      case 1: return 'N';
      case 2: return 'W';
      case 3: return 'S';
      default: return 'E';
    }
  }
  return undefined;
}

export function parseGoal(raw: any | undefined): Goal | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g: Goal = {};
  if (raw.objects && typeof raw.objects === 'object') g.objects = clone(raw.objects);
  if (raw.walls && typeof raw.walls === 'object') g.walls = clone(raw.walls);
  if (Array.isArray(raw.possible_final_positions)) g.possible_final_positions = clone(raw.possible_final_positions);
  if (raw.position && typeof raw.position === 'object') g.position = clone(raw.position);
  return g;
}

export function mergeGoals(a?: Goal, b?: Goal): Goal | undefined {
  if (!a && !b) return undefined;
  if (!a) return b ? clone(b) : undefined;
  if (!b) return a ? clone(a) : undefined;
  const out: Goal = {};
  if (a.objects || b.objects) {
    out.objects = { ...(a.objects ?? {}) };
    for (const [coord, spec] of Object.entries(b.objects ?? {})) {
      out.objects[coord] = { ...(out.objects[coord] ?? {}), ...spec };
    }
  }
  if (a.walls || b.walls) {
    out.walls = { ...(a.walls ?? {}) };
    for (const [coord, arr] of Object.entries(b.walls ?? {})) {
      const prev = new Set(out.walls[coord] ?? []);
      for (const d of arr) prev.add(d);
      out.walls[coord] = Array.from(prev) as any;
    }
  }
  if (a.position || b.position) {
    out.position = { ...(a.position ?? {} as any), ...(b.position ?? {} as any) };
  }
  if (a.possible_final_positions || b.possible_final_positions) {
    out.possible_final_positions = [
      ...(a.possible_final_positions ?? []),
      ...(b.possible_final_positions ?? [])
    ];
  }
  return out;
}

function objectsAt(state: World, x: number, y: number) {
  return (state.objects ?? []).filter(o => o.x === x && o.y === y);
}

function buildObservedSnapshot(state: World): Map<string, Map<string, number>> {
  const snapshot = new Map<string, Map<string, number>>();
  for (const o of state.objects ?? []) {
    if (o.count <= 0) continue;
    const coord = `${o.x},${o.y}`;
    let kinds = snapshot.get(coord);
    if (!kinds) {
      kinds = new Map<string, number>();
      snapshot.set(coord, kinds);
    }
    kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + o.count);
  }
  return snapshot;
}

function buildExpectedSnapshot(goalObjects: Record<string, Record<string, number | string>>, state: World): Map<string, Map<string, number>> {
  // Precompute totals by kind across the entire map (for "all")
  const totalByKind = new Map<string, number>();
  for (const o of state.objects ?? []) {
    totalByKind.set(o.kind, (totalByKind.get(o.kind) ?? 0) + o.count);
  }
  const expected = new Map<string, Map<string, number>>();
  for (const [coord, req] of Object.entries(goalObjects)) {
    // Empty {} means the coordinate must be empty; we do not add it to expected map
    if (!req || Object.keys(req).length === 0) continue;
    const kinds = new Map<string, number>();
    for (const [kind, val] of Object.entries(req)) {
      if (typeof val === 'number') {
        kinds.set(kind, val);
      } else if (typeof val === 'string') {
        const v = val.trim().toLowerCase();
        if (/^\d+$/.test(v)) {
          kinds.set(kind, parseInt(v, 10));
        } else if (v === 'all') {
          kinds.set(kind, totalByKind.get(kind) ?? 0);
        } else {
          // Unknown spec; treat as impossible to satisfy
          kinds.set(kind, NaN);
        }
      }
    }
    expected.set(coord, kinds);
  }
  return expected;
}

function hasWall(state: World, x: number, y: number, dir: Direction): boolean {
  return state.walls.some(w => w.x === x && w.y === y && w.dir === dir);
}

function mapWallTextToDir(d: 'north' | 'east' | 'south' | 'west'): Direction {
  switch (d) {
    case 'north': return 'N';
    case 'east': return 'E';
    case 'south': return 'S';
    case 'west': return 'W';
  }
}

export function evaluateGoal(state: World, goal?: Goal): boolean {
  if (!goal) return true;

  // objects
  if (goal.objects) {
    const observed = buildObservedSnapshot(state);
    const expected = buildExpectedSnapshot(goal.objects, state);
    const expectedCoords = new Set(expected.keys());
    const goalCoords = new Set(Object.keys(goal.objects));

    // 1) Coordinates not allowed by goal must be empty
    for (const [coord, kinds] of observed.entries()) {
      if (!goalCoords.has(coord)) return false;
      const req = goal.objects[coord];
      // If goal has {} at this coord, observed must be empty (but we have kinds>0)
      if (!req || Object.keys(req).length === 0) return false;
    }

    // 2) For each expected coordinate with explicit kinds: enforce exact match
    for (const [coord, reqKinds] of expected.entries()) {
      const obsKinds = observed.get(coord) ?? new Map<string, number>();
      // No extra kinds at this coordinate
      for (const k of obsKinds.keys()) {
        if (!reqKinds.has(k)) return false;
      }
      for (const [kind, need] of reqKinds.entries()) {
        const have = obsKinds.get(kind) ?? 0;
        if (!Number.isFinite(need) || have !== need) return false;
      }
    }

    // 3) For coordinates specified as {} in goal, ensure observed is empty there
    for (const coord of goalCoords) {
      const req = goal.objects[coord];
      if (!req || Object.keys(req).length === 0) {
        if (observed.has(coord)) {
          const obsKinds = observed.get(coord)!;
          if (obsKinds.size > 0) return false;
        }
      }
    }
  }

  // walls
  if (goal.walls) {
    for (const [key, dirs] of Object.entries(goal.walls)) {
      const [sx, sy] = key.split(',');
      const x = parseInt(sx, 10);
      const y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (const d of dirs ?? []) {
        const dir = mapWallTextToDir(d);
        if (!hasWall(state, x, y, dir)) return false;
      }
    }
  }

  // position
  if (goal.position) {
    const gx = (goal.position as any).x;
    const gy = (goal.position as any).y;
    if (Number.isFinite(gx) && Number.isFinite(gy)) {
      if (state.robot.x !== Math.floor(gx) || state.robot.y !== Math.floor(gy)) return false;
    }
    if (goal.position.orientation !== undefined) {
      const d = parseDir(goal.position.orientation);
      if (d && state.robot.dir !== d) return false;
    }
  }

  // possible_final_positions
  if (goal.possible_final_positions && goal.possible_final_positions.length > 0) {
    let match = false;
    for (const pos of goal.possible_final_positions) {
      if (!Array.isArray(pos) || pos.length < 2) continue;
      const [x, y, o] = pos as [number, number, number | string | undefined];
      if (state.robot.x === Math.floor(x) && state.robot.y === Math.floor(y)) {
        if (o === undefined) {
          match = true;
          break;
        }
        const d = parseDir(o);
        if (!d || state.robot.dir === d) {
          match = true;
          break;
        }
      }
    }
    if (!match) return false;
  }

  return true;
}


