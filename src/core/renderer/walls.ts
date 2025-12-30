import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Color, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { World } from '../types/types';
import { mapX1BasedToScene, mapZ1BasedToScene } from './utils';
import { WALL_COLORS, GOAL_COLORS } from './colors';

export function createWalls(world: World): { group: InstanceType<typeof Group>, dispose: () => void } {
  const group = new Group();
  const realPrimitiveSegs: InstanceType<typeof Mesh>[] = [];
  const realWalls: Array<{ x: number; y: number; dir: 'N' | 'E' | 'S' | 'W' }> = [];
  const goalWallsPlacements: Array<{ x: number; y: number; dir: 'north' | 'east' | 'south' | 'west' }> = [];
  const glbClones: InstanceType<typeof Group | typeof Mesh>[] = [];
  const wallHeight = 0.5;
  const wallY = wallHeight / 2;
  const wallThickness = 0.06;
  const wallMat = new MeshStandardMaterial({ color: WALL_COLORS.primitive });
  const wallMatGoal = new MeshStandardMaterial({ color: GOAL_COLORS.overlay });
  // Target dimensions for GLB walls (real walls only)
  const GLB_TARGET_LENGTH = 1.2;          // along local X
  const GLB_TARGET_HEIGHT = 1.2;        // a bit taller than legacy 0.5
  const GLB_TARGET_THICKNESS = 0.1;    // along local Z
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
      if (!w.goalMark) {
        realPrimitiveSegs.push(seg);
        realWalls.push({ x: w.x, y: w.y, dir: 'N' });
      }
    } else if (w.dir === 'S') {
      const seg = new Mesh(wallGeomX, mat);
      seg.position.set(cx, wallY, cz + 0.5);
      group.add(seg);
      if (!w.goalMark) {
        realPrimitiveSegs.push(seg);
        realWalls.push({ x: w.x, y: w.y, dir: 'S' });
      }
    } else if (w.dir === 'E') {
      const seg = new Mesh(wallGeomZ, mat);
      seg.position.set(cx + 0.5, wallY, cz);
      group.add(seg);
      if (!w.goalMark) {
        realPrimitiveSegs.push(seg);
        realWalls.push({ x: w.x, y: w.y, dir: 'E' });
      }
    } else if (w.dir === 'W') {
      const seg = new Mesh(wallGeomZ, mat);
      seg.position.set(cx - 0.5, wallY, cz);
      group.add(seg);
      if (!w.goalMark) {
        realPrimitiveSegs.push(seg);
        realWalls.push({ x: w.x, y: w.y, dir: 'W' });
      }
    }
  }
  // Asynchronously load wall.glb and swap real (non-goal) primitives to GLB clones
  const WALL_URL = new URL('../../assets/wall.glb', import.meta.url).href;
  // Module-level loader + cache for wall template
  const WALL_LOADER = new GLTFLoader();
  let wallTemplatePromise: Promise<GLTF['scene']> | null = (WALL_LOADER as any).__templatePromise || null;
  if (!wallTemplatePromise) {
    wallTemplatePromise = new Promise<GLTF['scene']>((resolve, reject) => {
      WALL_LOADER.load(
        WALL_URL,
        (gltf: GLTF) => {
          const scene = gltf.scene || gltf.scenes?.[0];
          if (scene) resolve(scene);
          else reject(new Error('No scene in wall.glb'));
        },
        undefined,
        (err: unknown) => reject(err as any)
      );
    });
    (WALL_LOADER as any).__templatePromise = wallTemplatePromise;
  }
  wallTemplatePromise.then((template) => {
      try {
        // Compute template bounding box to scale clones to match target dimensions
        template.updateMatrixWorld(true);
        const box = new Box3().setFromObject(template);
        const size = new Vector3();
        box.getSize(size);
        const baseScaleX = size.x > 0 ? GLB_TARGET_LENGTH / size.x : 1;
        const baseScaleY = size.y > 0 ? GLB_TARGET_HEIGHT / size.y : 1;
        const baseScaleZ = size.z > 0 ? GLB_TARGET_THICKNESS / size.z : 1;
        // Remove existing primitive segments for real walls
        for (const seg of realPrimitiveSegs) {
          group.remove(seg);
        }
        for (const w of realWalls) {
          const cx = mapX1BasedToScene(w.x);
          const cz = mapZ1BasedToScene(w.y, world.height);
          const clone = template.clone(true);
          // Scale to match the target size and keep GLB's original colors
          clone.scale.set(baseScaleX, baseScaleY, baseScaleZ);
          clone.updateMatrixWorld(true);
          // Re-anchor: move model so its bottom sits at y=0 (to touch ground)
          const cb = new Box3().setFromObject(clone);
          const bottomY = cb.min.y;
          if (Number.isFinite(bottomY) && bottomY !== 0) {
            clone.position.y += -bottomY;
            clone.updateMatrixWorld(true);
          }
          // Position and rotation based on direction
          if (w.dir === 'N') {
            clone.position.set(cx, 0, cz - 0.5);
            clone.rotation.y = 0; // along X axis
          } else if (w.dir === 'S') {
            clone.position.set(cx, 0, cz + 0.5);
            clone.rotation.y = 0;
          } else if (w.dir === 'E') {
            clone.position.set(cx + 0.5, 0, cz);
            clone.rotation.y = Math.PI / 2; // along Z axis
          } else {
            clone.position.set(cx - 0.5, 0, cz);
            clone.rotation.y = Math.PI / 2;
          }
          group.add(clone);
          glbClones.push(clone as any);
        }
        // Add GLB goal walls tinted red
        const GOAL_COLOR = GOAL_COLORS.overlay;
        for (const gw of goalWallsPlacements) {
          const cx = mapX1BasedToScene(gw.x);
          const cz = mapZ1BasedToScene(gw.y, world.height);
          const clone = template.clone(true);
          clone.scale.set(baseScaleX, baseScaleY, baseScaleZ);
          clone.updateMatrixWorld(true);
          const cb2 = new Box3().setFromObject(clone);
          const bottomY2 = cb2.min.y;
          if (Number.isFinite(bottomY2) && bottomY2 !== 0) {
            clone.position.y += -bottomY2;
            clone.updateMatrixWorld(true);
          }
          clone.traverse((n: any) => {
            if (n.isMesh && n.material) {
              const mats = Array.isArray(n.material) ? n.material : [n.material];
              const newMats = mats.map((orig: any) => {
                const m = orig?.clone ? orig.clone() : orig;
                if (m?.color) {
                  m.color = new Color(GOAL_COLOR);
                }
                if (m?.emissive) {
                  m.emissive = new Color(GOAL_COLOR);
                  m.emissiveIntensity = 0.1;
                }
                m.needsUpdate = true;
                return m;
              });
              n.material = Array.isArray(n.material) ? newMats : newMats[0];
            }
          });
        if (gw.dir === 'north') {
            clone.position.set(cx, 0, cz - 0.5);
            clone.rotation.y = 0;
          } else if (gw.dir === 'south') {
            clone.position.set(cx, 0, cz + 0.5);
            clone.rotation.y = 0;
          } else if (gw.dir === 'east') {
            clone.position.set(cx + 0.5, 0, cz);
            clone.rotation.y = Math.PI / 2;
          } else {
            clone.position.set(cx - 0.5, 0, cz);
            clone.rotation.y = Math.PI / 2;
          }
          group.add(clone);
          glbClones.push(clone as any);
        }
      } catch {
        // ignore failure; keep primitives
      }
    }).catch(() => {
      // loading error; keep primitives
    });
  // Overlay goal walls (from world.goal.walls) where no real wall exists yet
  const goalWalls = (world as any).goal?.walls as Record<string, Array<'north' | 'east' | 'south' | 'west'>> | undefined;
  if (goalWalls) {
    for (const [coord, dirs] of Object.entries(goalWalls)) {
      const [sx, sy] = coord.split(',');
      const x = parseInt(sx, 10);
      const y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (const d of dirs) {
        if (d === 'north' && !hasRealWall(x, y, 'N')) goalWallsPlacements.push({ x, y, dir: 'north' });
        else if (d === 'south' && !hasRealWall(x, y, 'S')) goalWallsPlacements.push({ x, y, dir: 'south' });
        else if (d === 'east' && !hasRealWall(x, y, 'E')) goalWallsPlacements.push({ x, y, dir: 'east' });
        else if (d === 'west' && !hasRealWall(x, y, 'W')) goalWallsPlacements.push({ x, y, dir: 'west' });
      }
    }
  }
  const dispose = () => {
    wallGeomX.dispose();
    wallGeomZ.dispose();
    wallMat.dispose();
    wallMatGoal.dispose();
    // dispose glb clone materials/geometries
    for (const c of glbClones) {
      (c as any).traverse?.((n: any) => {
        if (n.isMesh) {
          n.geometry?.dispose?.();
          const mat = n.material;
          if (Array.isArray(mat)) mat.forEach(m => m?.dispose?.());
          else mat?.dispose?.();
        }
      });
    }
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


