import { CanvasTexture, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Sprite, SpriteMaterial } from 'three';
import type { World } from '../types/types';
import { mapX1BasedToScene, mapZ1BasedToScene } from './utils';

export function createObjectsFromList(height: number, list: NonNullable<World['objects']>): { group: InstanceType<typeof Group>, dispose: () => void } {
  const group = new Group();
  if (!list || list.length === 0) {
    return { group, dispose: () => {} };
  }
  const geom = new OctahedronGeometry(0.2, 0);
  const matDefault = new MeshStandardMaterial({ color: 0xffa500 });
  const matGoal = new MeshStandardMaterial({ color: 0xfca5a5 });
  const sprites: InstanceType<typeof Sprite>[] = [];
  const textures: InstanceType<typeof CanvasTexture>[] = [];
  // Draw actual objects (yellow/orange)
  for (const obj of list) {
    const cx = mapX1BasedToScene(obj.x);
    const cz = mapZ1BasedToScene(obj.y, height);
    const m = new Mesh(geom, matDefault);
    m.position.set(cx, 0.2, cz);
    group.add(m);
    // label
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffa500';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 64px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const label = obj.hidden ? '?' : String(obj.count);
    ctx.fillText(label, 64, 64);
    const tex = new CanvasTexture(canvas);
    const smat = new SpriteMaterial({ map: tex, transparent: true });
    const sprite = new Sprite(smat);
    const spriteScale = 0.4;
    sprite.scale.set(spriteScale, spriteScale, 1);
    sprite.position.set(cx + 0.35, 0.6, cz);
    group.add(sprite);
    sprites.push(sprite);
    textures.push(tex);
  }
  // Draw goal markers from world.goal.objects as red overlays (left side)
  // We don't receive world here, so caller should use createObjects(world) which passes world.height, world.objects.
  // To render goal markers, we rely on closure over height only and receive goal via list? Not available here.
  // We will handle goal markers in createObjects(world) where world is available.
  const dispose = () => {
    geom.dispose();
    matDefault.dispose();
    matGoal.dispose();
    for (const s of sprites) {
      const m = s.material as InstanceType<typeof SpriteMaterial>;
      if (m.map) m.map.dispose();
      m.dispose();
    }
    for (const t of textures) t.dispose();
  };
  return { group, dispose };
}

export function createObjects(world: World): { group: InstanceType<typeof Group>, dispose: () => void } {
  const group = new Group();
  const disposers: Array<() => void> = [];
  // Actual objects
  if (world.objects && world.objects.length > 0) {
    const actual = createObjectsFromList(world.height, world.objects);
    group.add(actual.group);
    disposers.push(actual.dispose);
  }
  // Goal overlays
  const goal = (world as any).goal as World['goal'];
  const goalObjects = goal?.objects;
  if (goalObjects && typeof goalObjects === 'object') {
    const geom = new OctahedronGeometry(0.2, 0);
    const matGoal = new MeshStandardMaterial({ color: 0xfca5a5 });
    const sprites: InstanceType<typeof Sprite>[] = [];
    const textures: InstanceType<typeof CanvasTexture>[] = [];
    for (const [coord, spec] of Object.entries(goalObjects)) {
      const [sx, sy] = coord.split(',');
      const x = parseInt(sx, 10);
      const y = parseInt(sy, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const cx = mapX1BasedToScene(x);
      const cz = mapZ1BasedToScene(y, world.height);
      // Draw one marker per kind at this coord
      for (const [_kind, val] of Object.entries(spec)) {
        const m = new Mesh(geom, matGoal);
        // Center the red goal marker on the tile
        m.position.set(cx, 0.2, cz);
        group.add(m);
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fca5a5';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 64px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        const label = typeof val === 'number' || /^\d+$/.test(String(val)) ? String(val) : String(val);
        ctx.fillText(label, 64, 64);
        const tex = new CanvasTexture(canvas);
        const smat = new SpriteMaterial({ map: tex, transparent: true });
        const sprite = new Sprite(smat);
        const spriteScale = 0.4;
        sprite.scale.set(spriteScale, spriteScale, 1);
        // Place goal label on the left to avoid overlap with actual label
        sprite.position.set(cx - 0.35, 0.6, cz);
        group.add(sprite);
        sprites.push(sprite);
        textures.push(tex);
      }
    }
    disposers.push(() => {
      geom.dispose();
      matGoal.dispose();
      for (const s of sprites) {
        const m = s.material as InstanceType<typeof SpriteMaterial>;
        if (m.map) m.map.dispose();
        m.dispose();
      }
      for (const t of textures) t.dispose();
    });
  }
  return { group, dispose: () => disposers.forEach(d => d()) };
}


