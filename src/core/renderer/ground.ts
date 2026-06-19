import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, TextureLoader, Vector3, RepeatWrapping, SRGBColorSpace } from 'three';
import type { World } from '../types/types';
import { DEFAULT_TILE, isTileKind, type TileKind } from '../world/tileKinds';

// A solid earth block beneath the tiles so the map reads as a plateau/cliff
// instead of a thin floating sheet.
const BASE_DEPTH = 1.6;

function createBaseBlock(world: World, center: Vector3): { mesh: Mesh; dispose: () => void } {
  const geom = new BoxGeometry(world.width, BASE_DEPTH, world.height);
  // Gray sides to match the default floor, slightly darker bottom for depth.
  const side = new MeshStandardMaterial({ color: 0xb4b1ac, roughness: 1, metalness: 0 });
  const dark = new MeshStandardMaterial({ color: 0x8a8782, roughness: 1, metalness: 0 });
  // BoxGeometry material order: +x, -x, +y(top), -y(bottom), +z, -z
  const mats = [side, side, side, dark, side, side];
  const mesh = new Mesh(geom, mats);
  // Top face sits just under the tile plane; block extends downward.
  mesh.position.set(center.x, -0.02 - BASE_DEPTH / 2, center.z);
  const dispose = () => {
    geom.dispose();
    side.dispose();
    dark.dispose();
  };
  return { mesh, dispose };
}

export function createGround(world: World, center: Vector3): { ground: Group, dispose: () => void } {
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
  const kind = normalizeTileName(world.backgroundDefault ?? DEFAULT_TILE);
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
  const perCell: Record<string, string> | undefined = world.backgroundTiles;
  if (perCell && Object.keys(perCell).length > 0) {
    const root = new Group();
    // Solid earth block beneath the tiles (cliff look)
    const block = createBaseBlock(world, center);
    root.add(block.mesh);
    // Base ground for default kind
    const baseTex = loader.load(texturePath[kind]);
    baseTex.wrapS = baseTex.wrapT = RepeatWrapping;
    baseTex.repeat.set(world.width, world.height);
    baseTex.anisotropy = ANISO;
    baseTex.colorSpace = SRGBColorSpace;
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
        tex.colorSpace = SRGBColorSpace;
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
      block.dispose();
    };
    return { ground: root, dispose };
  }

  // Static texture for whole-plane (including water)
  const tex = loader.load(texturePath[kind]);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(world.width, world.height);
  tex.anisotropy = ANISO;
  tex.colorSpace = SRGBColorSpace;
  // Slightly reduce metalness and increase roughness for ground
  const groundMat = new MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const groundMesh = new Mesh(groundGeom, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(center.x, -0.01, center.z);
  // Solid earth block beneath the tiles (cliff look)
  const block = createBaseBlock(world, center);
  const root = new Group();
  root.add(block.mesh);
  root.add(groundMesh);
  const dispose = () => {
    groundGeom.dispose();
    if (groundMat.map) groundMat.map.dispose();
    groundMat.dispose();
    block.dispose();
  };
  return { ground: root, dispose };
}


