import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';
import type { World } from '../types/types';

export function createGrid(world: World): { grid: InstanceType<typeof LineSegments>, dispose: () => void } {
  const xLeft = -0.5;
  const xRight = world.width - 0.5;
  const zBottom = world.height - 0.5;
  const zTop = -0.5;
  const lines: number[] = [];
  for (let i = 0; i <= world.width; i++) {
    const x = i - 0.5;
    lines.push(x, 0, zTop, x, 0, zBottom);
  }
  for (let j = 0; j <= world.height; j++) {
    const z = (world.height - j) - 0.5;
    lines.push(xLeft, 0, z, xRight, 0, z);
  }
  const gridGeom = new BufferGeometry();
  gridGeom.setAttribute('position', new Float32BufferAttribute(new Float32Array(lines), 3));
  const gridMat = new LineBasicMaterial({ color: 0xcbd5e1 });
  const grid = new LineSegments(gridGeom, gridMat);
  const dispose = () => { gridGeom.dispose(); gridMat.dispose(); };
  return { grid, dispose };
}


