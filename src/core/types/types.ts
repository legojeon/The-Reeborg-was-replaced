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

export type Action =
  | { type: 'move' }
  | { type: 'turnLeft' }
  | { type: 'put' }
  | { type: 'take' }
  | { type: 'buildWall' }
  | { type: 'done' }
  | { type: 'trace'; message: string };

export interface TraceEvent {
  step: number;
  action: Action;
  before: World;
  after?: World;
  ok: boolean;
  reason?: string;
}



