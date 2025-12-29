import type { World } from '../types/types';

export function createDefaultWorld(width = 10, height = 10): World {
  return {
    width,
    height,
    // 1-based coordinates: start at (1,1) and default facing North
    robot: { x: 1, y: 1, dir: 'E', token: 0 },
    walls: [],
    objects: []
  };
}



