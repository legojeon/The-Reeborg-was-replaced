import type { Action, Direction, TraceEvent, World } from '../types/types';
import type { ObjectKind } from '../world/objectKinds';
import { EngineErrors, logEngineError } from './errors';

export interface Engine {
  enqueue(action: Action): void;
  step(): TraceEvent | null;
  stepPrev(): World | null;
  reset(world?: World): void;
  getState(): World;
  subscribe(listener: (e: TraceEvent) => void): () => void;
}

function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world));
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
    case 'N': return { dx: 0, dy: 1 }; // 1-based grid: y decreases when moving North
    case 'E': return { dx: 1, dy: 0 };
    case 'S': return { dx: 0, dy: -1 };
    case 'W': return { dx: -1, dy: 0 };
  }
}

export function createEngine(initialWorld: World): Engine {
  let world: World = cloneWorld(initialWorld);
  let stepCounter = 0;
  const queue: Action[] = [];
  const listeners = new Set<(e: TraceEvent) => void>();
  const executed: TraceEvent[] = [];

  function hasWallAt(x: number, y: number, dir: Direction): boolean {
    return world.walls.some(w => w.x === x && w.y === y && w.dir === dir);
  }

  function isBlockedByWall(x: number, y: number, dir: Direction): boolean {
    // 1-based grid, check wall on current edge or opposing edge of neighbor cell
    switch (dir) {
      case 'N':
        return hasWallAt(x, y, 'N') || hasWallAt(x, y + 1, 'S');
      case 'E':
        return hasWallAt(x, y, 'E') || hasWallAt(x + 1, y, 'W');
      case 'S':
        return hasWallAt(x, y, 'S') || hasWallAt(x, y - 1, 'N');
      case 'W':
        return hasWallAt(x, y, 'W') || hasWallAt(x - 1, y, 'E');
    }
  }

  function emit(e: TraceEvent) {
    for (const l of listeners) l(e);
  }

  function ensureObjects() {
    if (!world.objects) world.objects = [];
  }

  function objectsAt(x: number, y: number) {
    ensureObjects();
    return world.objects!.filter(o => o.x === x && o.y === y);
  }

  function decrementOneObjectAt(x: number, y: number): boolean {
    ensureObjects();
    for (let i = 0; i < world.objects!.length; i++) {
      const o = world.objects![i];
      if (o.x === x && o.y === y && o.count > 0) {
        o.count -= 1;
        if (o.count === 0) world.objects!.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  function decrementObjectOfKindAt(x: number, y: number, kind: ObjectKind): boolean {
    ensureObjects();
    for (let i = 0; i < world.objects!.length; i++) {
      const o = world.objects![i];
      if (o.x === x && o.y === y && o.kind === kind && o.count > 0) {
        o.count -= 1;
        if (o.count === 0) world.objects!.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  function incrementTokenAt(x: number, y: number) {
    ensureObjects();
    const existing = world.objects!.find(o => o.x === x && o.y === y && o.kind === 'token');
    if (existing) existing.count += 1;
    else world.objects!.push({ x, y, kind: 'token', count: 1 });
  }

  function incrementObjectKindAt(x: number, y: number, kind: ObjectKind) {
    ensureObjects();
    const existing = world.objects!.find(o => o.x === x && o.y === y && o.kind === kind);
    if (existing) existing.count += 1;
    else world.objects!.push({ x, y, kind, count: 1 });
  }

  function pickKindToTakeAt(x: number, y: number): ObjectKind | null {
    const here = objectsAt(x, y).filter(o => o.count > 0);
    if (here.length === 0) return null;
    // Prefer goal-marked kinds first, then lexicographic by kind for determinism
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

  function enqueue(action: Action) {
    queue.push(action);
  }

  type StepCtx = {
    world: World;
    deltaFor: (d: Direction) => { dx: number; dy: number };
    isBlockedByWall: (x: number, y: number, dir: Direction) => boolean;
    objectsAt: (x: number, y: number) => Array<NonNullable<World['objects']>[number]>;
    decrementOneObjectAt: (x: number, y: number) => boolean;
    incrementTokenAt: (x: number, y: number) => void;
  };

  const handlers: Record<Action['type'], (ctx: StepCtx, action?: Action) => { ok: boolean; reason?: string }> = {
    move: ({ world, deltaFor, isBlockedByWall }) => {
      const { dx, dy } = deltaFor(world.robot.dir);
      const nx = world.robot.x + dx;
      const ny = world.robot.y + dy;
      if (nx < 1 || ny < 1 || nx > world.width || ny > world.height) {
        logEngineError(EngineErrors.OUT_OF_BOUNDS, { nx, ny, width: world.width, height: world.height });
        return { ok: false, reason: EngineErrors.OUT_OF_BOUNDS };
      }
      if (isBlockedByWall(world.robot.x, world.robot.y, world.robot.dir)) {
        logEngineError(EngineErrors.BLOCKED_BY_WALL, { x: world.robot.x, y: world.robot.y, dir: world.robot.dir });
        return { ok: false, reason: EngineErrors.BLOCKED_BY_WALL };
      }
      world.robot.x = nx;
      world.robot.y = ny;
      return { ok: true };
    },
    buildWall: ({ world }) => {
      const wx = world.robot.x;
      const wy = world.robot.y;
      const wd = world.robot.dir;
      // normalize: ensure dir present and dedupe
      const exists = world.walls.some(w => w.x === wx && w.y === wy && w.dir === wd);
      if (!exists) {
        world.walls.push({ x: wx, y: wy, dir: wd });
      }
      return { ok: true };
    },
    done: () => {
      // Flush remaining actions to end execution
      queue.length = 0;
      return { ok: true };
    },
    trace: () => {
      // no-op step for tracing/query visibility
      return { ok: true };
    },
    turnLeft: ({ world }) => {
      world.robot.dir = turnLeft(world.robot.dir);
      return { ok: true };
    },
    take: ({ world }) => {
      const kind = pickKindToTakeAt(world.robot.x, world.robot.y);
      if (!kind) {
        logEngineError(EngineErrors.NO_OBJECT_HERE, { x: world.robot.x, y: world.robot.y });
        return { ok: false, reason: EngineErrors.NO_OBJECT_HERE };
      }
      decrementObjectOfKindAt(world.robot.x, world.robot.y, kind);
      if (!world.robot.inventory) world.robot.inventory = [];
      world.robot.inventory.push(kind); // enqueue (FIFO)
      return { ok: true };
    },
    put: ({ world }) => {
      if (!world.robot.inventory || world.robot.inventory.length === 0) {
        logEngineError(EngineErrors.NO_ITEM_TO_PUT, { x: world.robot.x, y: world.robot.y });
        return { ok: false, reason: EngineErrors.NO_ITEM_TO_PUT };
      }
      // FIFO: drop in the order taken
      const kind = world.robot.inventory.shift() as ObjectKind;
      incrementObjectKindAt(world.robot.x, world.robot.y, kind);
      return { ok: true };
    }
  };

  function step(): TraceEvent | null { //큐에서 1개 꺼내 검증/적용, 트레이스 생성
    const action = queue.shift();
    if (!action) return null;
    const before = cloneWorld(world);

    let ok = true;
    let reason: string | undefined = undefined;

    const handler = handlers[action.type];
    const ctx: StepCtx = {
      world,
      deltaFor,
      isBlockedByWall,
      objectsAt,
      decrementOneObjectAt,
      incrementTokenAt
    };
    const res = handler ? handler(ctx, action as any) : { ok: false, reason: 'unknown_action' };
    ok = res.ok;
    reason = res.reason;

    const after = ok ? cloneWorld(world) : undefined;
    const event: TraceEvent = {
      step: ++stepCounter,
      action,
      before,
      after,
      ok,
      reason
    };
    emit(event);
    executed.push(event);
    return event;
  }

  function stepPrev(): World | null {
    const last = executed.pop();
    if (!last) return null;
    // restore previous world snapshot
    world = cloneWorld(last.before);
    // reinsert the consumed action at the front so it can be redone
    queue.unshift(last.action);
    // adjust step counter
    stepCounter = Math.max(0, stepCounter - 1);
    return cloneWorld(world);
  }

  function reset(next?: World) {
    world = cloneWorld(next ?? initialWorld);
    stepCounter = 0;
    queue.length = 0;
    executed.length = 0;
  }

  function getState() {
    return cloneWorld(world);
  }

  function subscribe(listener: (e: TraceEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { enqueue, step, stepPrev, reset, getState, subscribe };
}


