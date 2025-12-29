import type { Direction } from '../types/types';

export function dirToRad(dir: Direction): number {
  switch (dir) {
    case 'N': return 0;
    case 'E': return -Math.PI / 2;
    case 'S': return Math.PI;
    case 'W': return Math.PI / 2;
  }
}

export function dirToVec(dir: Direction): { vx: number; vz: number } {
  switch (dir) {
    case 'N': return { vx: 0, vz: -1 };
    case 'E': return { vx: 1, vz: 0 };
    case 'S': return { vx: 0, vz: 1 };
    case 'W': return { vx: -1, vz: 0 };
  }
}

export function mapX1BasedToScene(x: number): number {
  return x - 1;
}

export function mapZ1BasedToScene(y: number, height: number): number {
  return height - y;
}


