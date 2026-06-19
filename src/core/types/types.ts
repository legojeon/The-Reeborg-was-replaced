import type { ObjectKind } from '../world/objectKinds';
export type Direction = 'N' | 'E' | 'S' | 'W';

export interface RobotPose {
  x: number;
  y: number;
  dir: Direction;
  token: number;
  // FIFO inventory of kinds taken; put() will drop in the same order
  inventory?: ObjectKind[];
}

export interface World {
  width: number;
  height: number;
  robot: RobotPose;
  walls: Array<{ x: number; y: number; dir?: Direction; goalMark?: boolean }>;
  // Default background tile kind (from onload fill_background), used by renderer
  backgroundDefault?: string;
  // Per-cell background tiles "x,y" -> TileKind
  backgroundTiles?: Record<string, string>;
  objects?: Array<{
    x: number;
    y: number;
    kind: ObjectKind;
    count: number;
    // When the source world specified a range like "2-5", store it so we can re-randomize on reset.
    range?: { min: number; max: number };
    // If true, UI should display '?' instead of the numeric count until revealed.
    hidden?: boolean;
    // If true, render with goal highlight (light red) to indicate goal target.
    goalMark?: boolean;
  }>;
  description?: string;
  // Reference solution code shown via the "답 보기" feature (optional).
  solution?: string;
  goal?: Goal;
}

export type Goal = {
  // Required object counts at coordinates. Example:
  // { "9,1": { "carrot": "all" }, "10,1": {} }
  // - "all" means none should remain at that coordinate at the end.
  // - {} means the coordinate should be empty of any objects.
  objects?: Record<string, Record<string, number | string>>;
  // Required walls at coordinates. Example:
  // { "7,3": ["east", "north"] }
  walls?: Record<string, Array<'north' | 'east' | 'south' | 'west'>>;
  // List of acceptable final positions (x, y[, orientation]).
  // Orientation may be "N|E|S|W" or a number which we map similarly to loader rules.
  possible_final_positions?: Array<[number, number] | [number, number, number | string]>;
  // Exact final position requirement.
  position?: { x: number; y: number; orientation?: Direction | number | string };
}

// ---------------------------------------------------------------------------
// Canonical world file schema (v2). This is the format the map maker emits and
// that the app treats as the source of truth. Legacy reeborg.ca exports are
// accepted too and converted by normalizeWorld() in loader.ts.
//
// Design rules:
// - directions are cardinal strings "N"|"E"|"S"|"W" (no numeric orientation)
// - one place for goals: the top-level `goal` field
// - tiles are a single kind per cell: { "x,y": "ice" }
// - object counts: a number, or a random range { min, max }; goals also allow
//   the keyword "all" and an empty object {} (= cell must be empty)
// - dynamic worlds keep `generated: true` and their `onload` script
// ---------------------------------------------------------------------------

export type CountSpec = number | { min: number; max: number };

export interface GoalV2 {
  objects?: Record<string, Record<string, CountSpec | 'all'> | Record<string, never>>;
  walls?: Record<string, Array<'north' | 'east' | 'south' | 'west'>>;
  position?: { x: number; y: number; dir?: Direction };
  finalPositions?: Array<[number, number] | [number, number, Direction]>;
}

export interface WorldV2 {
  version: 2;
  id?: string;
  name?: string;
  difficulty?: number;
  // size/robot are optional on a bundle (they live on each variant instead).
  size?: { rows: number; cols: number };
  description?: string | string[];
  solution?: string | string[];
  robot?: { x: number; y: number; dir: Direction; tokens?: number };
  walls?: Record<string, Array<'north' | 'east' | 'south' | 'west'>>;
  objects?: Record<string, Record<string, CountSpec>>;
  tiles?: Record<string, string>;
  goal?: GoalV2;
  // A "bundle": several fixed map variants; one is chosen at random on load.
  // Each variant is a full map (size/robot/walls/objects/tiles/goal); the
  // bundle's name/description/solution are shared across them.
  variants?: WorldV2[];
  // Set when the world is produced by an onload script that cannot be
  // represented declaratively (e.g. uses randomness). The script is preserved.
  generated?: boolean;
  onload?: string[];
}

export type Action = (
  | { type: 'move' }
  | { type: 'turnLeft' }
  | { type: 'put' }
  | { type: 'take' }
  | { type: 'buildWall' }
  | { type: 'done' }
  | { type: 'trace'; message: string }
) & {
  // 1-based line number in the user's Python source that produced this action.
  line?: number;
};

export interface TraceEvent {
  step: number;
  action: Action;
  before: World;
  after?: World;
  ok: boolean;
  reason?: string;
}



