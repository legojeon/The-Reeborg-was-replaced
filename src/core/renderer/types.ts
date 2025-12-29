import type { RobotPose } from '../types/types';
import type { World } from '../types/types';

export type ViewMode = 'iso' | 'first';

export interface SceneHandle {
  destroy(): void;
  updateRobot(pose: RobotPose, opts?: { reverse?: boolean }): void;
  updateObjects(objects: World['objects'] | undefined): void;
  updateWalls(walls: World['walls'] | undefined): void;
  resetView(): void;
  setViewMode(mode: ViewMode): void;
  setRobotColor(color: number | string): void;
}


