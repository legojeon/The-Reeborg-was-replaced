import { Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, TextureLoader, Vector3, RepeatWrapping, SRGBColorSpace } from 'three';
import type { World } from '../types/types';
import { DEFAULT_TILE, isTileKind, type TileKind } from '../world/tileKinds';

export function createGround(world: World, center: InstanceType<typeof Vector3>): { ground: any, dispose: () => void } {
  const groundGeom = new PlaneGeometry(world.width, world.height, world.width, world.height);
  const ANISO = 8;
  // Determine tile kind (fallback to DEFAULT_TILE), with tolerant normalization
  function normalizeTileName(input: unknown): TileKind {
    const raw = String(input ?? '').trim().toLowerCase();
    // normalize separators
    const s = raw.replace(/[\s\-]+/g, '_');
    // common aliases/typos
    const map: Record<string, TileKind> = {
      brick: 'bricks',
      bricks: 'bricks',
      brics: 'bricks',
      grass: 'grass',
      pale_grass: 'pale_grass',
      palegrass: 'pale_grass',
      pale_grn: 'pale_grass',
      ice: 'ice',
      mud: 'mud',
      gravel: 'gravel',
      water: 'water'
    };
    const guess = map[s];
    if (guess) return guess;
    // direct guard if already valid
    if (isTileKind(s)) return s;
    return DEFAULT_TILE;
  }
  const kind = normalizeTileName((world as any).backgroundDefault ?? DEFAULT_TILE);
  // Map kind to texture path
  const texturePath: Record<TileKind, string> = {
    grass: new URL('../../assets/tiles/grass.jpg', import.meta.url).href,
    pale_grass: new URL('../../assets/tiles/pale_grass.jpg', import.meta.url).href,
    ice: new URL('../../assets/tiles/ice.jpg', import.meta.url).href,
    mud: new URL('../../assets/tiles/mud.jpg', import.meta.url).href,
    water: new URL('../../assets/tiles/water.jpg', import.meta.url).href,
    gravel: new URL('../../assets/tiles/gravel.jpg', import.meta.url).href,
    bricks: new URL('../../assets/tiles/bricks.jpg', import.meta.url).href
  };
  const loader = new TextureLoader();
  // If we have per-cell tiles, build overlays using instancing
  const perCell: Record<string, string> | undefined = (world as any).backgroundTiles;
  if (perCell && Object.keys(perCell).length > 0) {
    const root = new Group();
    // Base ground for default kind
    const baseTex = loader.load(texturePath[kind]);
    baseTex.wrapS = baseTex.wrapT = RepeatWrapping;
    baseTex.repeat.set(world.width, world.height);
    baseTex.anisotropy = ANISO;
    if ('colorSpace' in baseTex) (baseTex as any).colorSpace = SRGBColorSpace;
    const baseMat = new MeshStandardMaterial({ map: baseTex, roughness: 0.85, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const baseMesh = new Mesh(groundGeom, baseMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.set(center.x, -0.01, center.z);
    root.add(baseMesh);
    // Group cells by kind (excluding default), and create instanced overlays
    const byKind = new Map<TileKind, Array<{ x: number; y: number }>>();
    for (const [coord, name] of Object.entries(perCell)) {
      const [sx, sy] = coord.split(',');
      const x = parseInt(sx, 10);
      const y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const nk = normalizeTileName(name);
      if (nk === kind) continue; // same as base
      if (!byKind.has(nk)) byKind.set(nk, []);
      byKind.get(nk)!.push({ x, y });
    }
    const cellGeom = new PlaneGeometry(1, 1, 1, 1);
    const disposers: Array<() => void> = [];
    for (const [k2, cells] of byKind.entries()) {
        const tex = loader.load(texturePath[k2]);
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.repeat.set(1, 1);
        tex.anisotropy = ANISO;
        if ('colorSpace' in tex) (tex as any).colorSpace = SRGBColorSpace;
        const mat = new MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        const inst = new InstancedMesh(cellGeom, mat, cells.length);
        let i = 0;
        const m4 = new Matrix4();
        for (const { x, y } of cells) {
          const px = (x - 1);
          const pz = (world.height - y);
          m4.makeRotationX(-Math.PI / 2);
          m4.setPosition(px, -0.009, pz);
          inst.setMatrixAt(i++, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
        root.add(inst);
        disposers.push(() => {
          cellGeom.dispose();
          mat.map?.dispose?.();
          mat.dispose();
        });
    }
    const dispose = () => {
      groundGeom.dispose();
      baseMat.map?.dispose?.();
      baseMat.dispose();
      disposers.forEach(fn => fn());
    };
    return { ground: root as any, dispose };
  }

  // Static texture for whole-plane (including water)
  const tex = loader.load(texturePath[kind]);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(world.width, world.height);
  tex.anisotropy = ANISO;
  if ('colorSpace' in tex) {
    (tex as any).colorSpace = SRGBColorSpace;
  }
  // Slightly reduce metalness and increase roughness for ground
  const groundMat = new MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const ground = new Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.01, center.z);
  const dispose = () => {
    groundGeom.dispose();
    if (groundMat.map) groundMat.map.dispose();
    groundMat.dispose();
  };
  return { ground, dispose };
}


