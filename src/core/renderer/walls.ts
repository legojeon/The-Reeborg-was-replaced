import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { World } from '../types/types';
import { mapX1BasedToScene, mapZ1BasedToScene } from './utils';

export function createWalls(world: World): { group: InstanceType<typeof Group>, dispose: () => void } {
  const group = new Group();
  const wallHeight = 0.5;
  const wallY = wallHeight / 2;
  const wallThickness = 0.06;
  const wallMat = new MeshStandardMaterial({ color: 0x94a3b8 });
  const wallMatGoal = new MeshStandardMaterial({ color: 0xfca5a5 });
  const wallGeomX = new BoxGeometry(1, wallHeight, wallThickness);
  const wallGeomZ = new BoxGeometry(wallThickness, wallHeight, 1);
  const hasRealWall = (x: number, y: number, d: 'N' | 'E' | 'S' | 'W') =>
    world.walls.some(w => w.x === x && w.y === y && w.dir === d);
  for (const w of world.walls) {
    const cx = mapX1BasedToScene(w.x);
    const cz = mapZ1BasedToScene(w.y, world.height);
    const mat = w.goalMark ? wallMatGoal : wallMat;
    if (w.dir === 'N') {
      const seg = new Mesh(wallGeomX, mat);
      seg.position.set(cx, wallY, cz - 0.5);
      group.add(seg);
    } else if (w.dir === 'S') {
      const seg = new Mesh(wallGeomX, mat);
      seg.position.set(cx, wallY, cz + 0.5);
      group.add(seg);
    } else if (w.dir === 'E') {
      const seg = new Mesh(wallGeomZ, mat);
      seg.position.set(cx + 0.5, wallY, cz);
      group.add(seg);
    } else if (w.dir === 'W') {
      const seg = new Mesh(wallGeomZ, mat);
      seg.position.set(cx - 0.5, wallY, cz);
      group.add(seg);
    }
  }
  // Overlay goal walls (from world.goal.walls) where no real wall exists yet
  const goalWalls = (world as any).goal?.walls as Record<string, Array<'north' | 'east' | 'south' | 'west'>> | undefined;
  if (goalWalls) {
    for (const [coord, dirs] of Object.entries(goalWalls)) {
      const [sx, sy] = coord.split(',');
      const x = parseInt(sx, 10);
      const y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const cx = mapX1BasedToScene(x);
      const cz = mapZ1BasedToScene(y, world.height);
      for (const d of dirs) {
        if (d === 'north' && !hasRealWall(x, y, 'N')) {
          const seg = new Mesh(wallGeomX, wallMatGoal);
          seg.position.set(cx, wallY, cz - 0.5);
          group.add(seg);
        } else if (d === 'south' && !hasRealWall(x, y, 'S')) {
          const seg = new Mesh(wallGeomX, wallMatGoal);
          seg.position.set(cx, wallY, cz + 0.5);
          group.add(seg);
        } else if (d === 'east' && !hasRealWall(x, y, 'E')) {
          const seg = new Mesh(wallGeomZ, wallMatGoal);
          seg.position.set(cx + 0.5, wallY, cz);
          group.add(seg);
        } else if (d === 'west' && !hasRealWall(x, y, 'W')) {
          const seg = new Mesh(wallGeomZ, wallMatGoal);
          seg.position.set(cx - 0.5, wallY, cz);
          group.add(seg);
        }
      }
    }
  }
  const dispose = () => {
    wallGeomX.dispose();
    wallGeomZ.dispose();
    wallMat.dispose();
    wallMatGoal.dispose();
  };
  return { group, dispose };
}

export function createWallsFromList(height: number, list: World['walls']): { group: InstanceType<typeof Group>, dispose: () => void } {
  const group = new Group();
  const wallHeight = 0.5;
  const wallY = wallHeight / 2;
  const wallThickness = 0.06;
  const wallMat = new MeshStandardMaterial({ color: 0x94a3b8 });
  const wallMatGoal = new MeshStandardMaterial({ color: 0xfca5a5 });
  const wallGeomX = new BoxGeometry(1, wallHeight, wallThickness);
  const wallGeomZ = new BoxGeometry(wallThickness, wallHeight, 1);
  for (const w of list) {
    const cx = mapX1BasedToScene(w.x);
    const cz = mapZ1BasedToScene(w.y, height);
    const mat = w.goalMark ? wallMatGoal : wallMat;
    if (w.dir === 'N') {
      const seg = new Mesh(wallGeomX, mat);
      seg.position.set(cx, wallY, cz - 0.5);
      group.add(seg);
    } else if (w.dir === 'S') {
      const seg = new Mesh(wallGeomX, mat);
      seg.position.set(cx, wallY, cz + 0.5);
      group.add(seg);
    } else if (w.dir === 'E') {
      const seg = new Mesh(wallGeomZ, mat);
      seg.position.set(cx + 0.5, wallY, cz);
      group.add(seg);
    } else if (w.dir === 'W') {
      const seg = new Mesh(wallGeomZ, mat);
      seg.position.set(cx - 0.5, wallY, cz);
      group.add(seg);
    }
  }
  const dispose = () => {
    wallGeomX.dispose();
    wallGeomZ.dispose();
    wallMat.dispose();
    wallMatGoal.dispose();
  };
  return { group, dispose };
}


