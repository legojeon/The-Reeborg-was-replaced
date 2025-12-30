import { Box3, CanvasTexture, Color, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Sprite, SpriteMaterial, Vector3, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { World } from '../types/types';
import type { ObjectKind } from '../world/objectKinds';
import { mapX1BasedToScene, mapZ1BasedToScene } from './utils';
import { OBJECT_COLORS, GOAL_COLORS } from './colors';

// Module-level GLB template cache to avoid reloading per update
const OBJECT_LOADER = new GLTFLoader();
const TEMPLATE_CACHE = new Map<string, Promise<GLTF['scene']>>();
function loadTemplate(url: string): Promise<GLTF['scene']> {
  if (!TEMPLATE_CACHE.has(url)) {
    TEMPLATE_CACHE.set(url, new Promise<GLTF['scene']>((resolve, reject) => {
      OBJECT_LOADER.load(
        url,
        (gltf: GLTF) => {
          const scene = gltf.scene || gltf.scenes?.[0];
          if (scene) resolve(scene);
          else reject(new Error('No scene in GLTF'));
        },
        undefined,
        (err: unknown) => reject(err as any)
      );
    }));
  }
  return TEMPLATE_CACHE.get(url)!;
}

// Per-kind target heights (scene units), used by both actual and goal objects
const OBJECT_TARGET_HEIGHT_BY_KIND: Record<ObjectKind, number> = {
  apple: 0.6,
  banana: 0.5,
  carrot: 0.8,
  dandelion: 0.5,
  leaf: 0.5,
  token: 0.5
};

export function createObjectsFromList(height: number, list: NonNullable<World['objects']>): { group: InstanceType<typeof Group>, dispose: () => void } {
  const group = new Group();
  if (!list || list.length === 0) {
    return { group, dispose: () => {} };
  }
  // Placeholders shown until GLB loads
  const geom = new OctahedronGeometry(0.2, 0);
  const matDefault = new MeshStandardMaterial({ color: OBJECT_COLORS.primitive });
  const matGoal = new MeshStandardMaterial({ color: GOAL_COLORS.overlay });
  const sprites: InstanceType<typeof Sprite>[] = [];
  const textures: InstanceType<typeof CanvasTexture>[] = [];
  const primitiveMeshes: InstanceType<typeof Mesh>[] = [];
  const glbClones: InstanceType<typeof Group | typeof Mesh>[] = [];
  // cache loaded templates per kind
  const templateByKind = new Map<ObjectKind, { template: GLTF['scene'], scale: number }>();
  // brighten factor for all objects (applied via emissive)
  const BRIGHTEN_INTENSITY = 0.02;
  // vertical hover offset above ground for all objects
  const OBJECT_FLOAT_Y = 0.1;
  // map kinds to asset URLs
  const KIND_TO_URL: Record<ObjectKind, string> = {
    apple: new URL('../../assets/objects/apple.glb', import.meta.url).href,
    banana: new URL('../../assets/objects/banana.glb', import.meta.url).href,
    carrot: new URL('../../assets/objects/carrot.glb', import.meta.url).href,
    dandelion: new URL('../../assets/objects/dandelion.glb', import.meta.url).href,
    leaf: new URL('../../assets/objects/leaf.glb', import.meta.url).href,
    token: new URL('../../assets/objects/token.glb', import.meta.url).href
  };
  // Track placements for each entry so we can swap when loaded
  const placements: Array<{ kind: ObjectKind; cx: number; cz: number }> = [];
  // Draw actual objects (yellow/orange)
  for (const obj of list) {
    const cx = mapX1BasedToScene(obj.x);
    const cz = mapZ1BasedToScene(obj.y, height);
    const m = new Mesh(geom, matDefault);
    m.position.set(cx, OBJECT_FLOAT_Y, cz);
    group.add(m);
    primitiveMeshes.push(m);
    placements.push({ kind: obj.kind as ObjectKind, cx, cz });
    // label
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = OBJECT_COLORS.label;
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
  // For each distinct kind, load GLB once and then swap all placeholders of that kind
  const distinctKinds = Array.from(new Set(placements.map(p => p.kind)));
  for (const kind of distinctKinds) {
    const url = KIND_TO_URL[kind];
    loadTemplate(url)
      .then((template) => {
        try {
          // compute uniform scale so model height becomes per-kind target height
          template.updateMatrixWorld(true);
          const box = new Box3().setFromObject(template);
          const size = new Vector3();
          box.getSize(size);
          const height = size.y > 0 ? size.y : 1;
          const targetHeight = OBJECT_TARGET_HEIGHT_BY_KIND[kind] ?? 0.5;
          const scale = targetHeight / height;
          templateByKind.set(kind, { template, scale });
          // swap placeholders for this kind
          placements.forEach((p, idx) => {
            if (p.kind !== kind) return;
            const clone = template.clone(true);
            clone.scale.setScalar(scale);
            clone.updateMatrixWorld(true);
            // anchor bottom to ground y=0
            const cb = new Box3().setFromObject(clone);
            const bottomY = cb.min.y;
            if (Number.isFinite(bottomY) && bottomY !== 0) {
              clone.position.y += -bottomY;
            }
            // hover above ground
            clone.position.y += OBJECT_FLOAT_Y;
            // place at tile center
            clone.position.x = p.cx;
            clone.position.z = p.cz;
            // brighten using emissive, keep original colors
            clone.traverse((n: any) => {
              if (n.isMesh && n.material) {
                const mats = Array.isArray(n.material) ? n.material : [n.material];
                for (const m of mats) {
                  // Ensure color textures use sRGB for correct saturation
                  if (m.map && 'colorSpace' in m.map) {
                    m.map.colorSpace = SRGBColorSpace;
                    m.map.needsUpdate = true;
                  }
                  if (m.emissiveMap && 'colorSpace' in m.emissiveMap) {
                    m.emissiveMap.colorSpace = SRGBColorSpace;
                    m.emissiveMap.needsUpdate = true;
                  }
                  // Slightly boost saturation/lightness of material color (if not pure white)
                  if (m.color && (m.color.r !== 1 || m.color.g !== 1 || m.color.b !== 1)) {
                    const hsl = { h: 0, s: 0, l: 0 };
                    m.color.getHSL(hsl as any);
                    const sBoost = 1.15;
                    const lBoost = 1.08;
                    hsl.s = Math.min(1, hsl.s * sBoost);
                    hsl.l = Math.min(0.9, hsl.l * lBoost);
                    m.color.setHSL(hsl.h, hsl.s, hsl.l);
                  }
                  if (m?.emissive) {
                    // Use current color if available, otherwise white
                    const base = m.color ? m.color.clone() : new Color(0xffffff);
                    m.emissive = base;
                    m.emissiveIntensity = BRIGHTEN_INTENSITY;
                  }
                  // Keep roughness/metalness reasonable for a brighter look
                  if (typeof m.roughness === 'number') m.roughness = Math.min(m.roughness, 0.5);
                  if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.3);
                  m.needsUpdate = true;
                }
              }
            });
            // remove primitive placeholder mesh
            const prim = primitiveMeshes[idx];
            if (prim && prim.parent === group) {
              group.remove(prim);
            }
            group.add(clone as any);
            glbClones.push(clone as any);
          });
        } catch {
          // keep placeholders on failure
        }
      })
      .catch(() => {
        // load error -> keep placeholders
      });
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
    for (const prim of primitiveMeshes) {
      prim.geometry?.dispose?.();
      (prim.material as any)?.dispose?.();
    }
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
    const matGoal = new MeshStandardMaterial({ color: GOAL_COLORS.overlay });
    const sprites: InstanceType<typeof Sprite>[] = [];
    const textures: InstanceType<typeof CanvasTexture>[] = [];
    const placeholders: InstanceType<typeof Mesh>[] = [];
    const goalClones: InstanceType<typeof Group | typeof Mesh>[] = [];
    const goalPlacements: Array<{ kind: string; cx: number; cz: number; placeholderIdx: number }> = [];
    const loader = new GLTFLoader();
    // Goal GLBs use the same per-kind target heights as actual objects
    const GOAL_COLOR = GOAL_COLORS.objectGLB; // darker gray for goal objects
    const BRIGHTEN_INTENSITY_GOAL = 0.2; // no glow for goal objects
    const GOAL_OBJECT_FLOAT_Y = 0.2; // match actual objects' offset
    // map kinds to asset URLs
    const KIND_TO_URL: Record<string, string> = {
      apple: new URL('../../assets/objects/apple.glb', import.meta.url).href,
      banana: new URL('../../assets/objects/banana.glb', import.meta.url).href,
      carrot: new URL('../../assets/objects/carrot.glb', import.meta.url).href,
      dandelion: new URL('../../assets/objects/dandelion.glb', import.meta.url).href,
      leaf: new URL('../../assets/objects/leaf.glb', import.meta.url).href,
      token: new URL('../../assets/objects/token.glb', import.meta.url).href
    };
    const distinctGoalKinds = new Set<string>();
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
        // Placeholder centered
        m.position.set(cx, 0.2, cz);
        group.add(m);
        const placeholderIdx = placeholders.push(m) - 1;
        goalPlacements.push({ kind: _kind, cx, cz, placeholderIdx });
        if (KIND_TO_URL[_kind]) distinctGoalKinds.add(_kind);
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = GOAL_COLORS.objectLabel;
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
    // Load GLBs for goal kinds and swap placeholders
    distinctGoalKinds.forEach((k) => {
      const url = KIND_TO_URL[k];
      if (!url) return;
      loader.load(
        url,
        (gltf: GLTF) => {
          try {
            const template = gltf.scene || gltf.scenes?.[0];
            if (!template) return;
            template.updateMatrixWorld(true);
            const box = new Box3().setFromObject(template);
            const size = new Vector3();
            box.getSize(size);
            const height = size.y > 0 ? size.y : 1;
            const targetHeight = OBJECT_TARGET_HEIGHT_BY_KIND[k as ObjectKind] ?? 0.5;
            const scale = targetHeight / height;
            // create clones for each placement of kind k
            goalPlacements.forEach(({ kind, cx, cz, placeholderIdx }) => {
              if (kind !== k) return;
              const clone = template.clone(true);
              clone.scale.setScalar(scale);
              clone.updateMatrixWorld(true);
              // anchor bottom to ground
              const cb = new Box3().setFromObject(clone);
              const bottomY = cb.min.y;
              if (Number.isFinite(bottomY) && bottomY !== 0) {
                clone.position.y += -bottomY;
              }
              // hover same offset as actual objects
              clone.position.y += GOAL_OBJECT_FLOAT_Y;
              // colorize goal darker gray; clone materials so actual objects keep originals
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
                      m.emissiveIntensity = BRIGHTEN_INTENSITY_GOAL;
                    }
                    if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.9);
                    if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.05);
                    m.needsUpdate = true;
                    return m;
                  });
                  n.material = Array.isArray(n.material) ? newMats : newMats[0];
                }
              });
              // position
              clone.position.x = cx;
              clone.position.z = cz;
              // swap placeholder
              const ph = placeholders[placeholderIdx];
              if (ph && ph.parent === group) {
                group.remove(ph);
              }
              group.add(clone as any);
              goalClones.push(clone as any);
            });
          } catch {
            // keep placeholders on failure
          }
        },
        undefined,
        () => {
          // load error -> keep placeholders
        }
      );
    });
    disposers.push(() => {
      geom.dispose();
      matGoal.dispose();
      for (const s of sprites) {
        const m = s.material as InstanceType<typeof SpriteMaterial>;
        if (m.map) m.map.dispose();
        m.dispose();
      }
      for (const t of textures) t.dispose();
      for (const ph of placeholders) {
        ph.geometry?.dispose?.();
        (ph.material as any)?.dispose?.();
      }
      for (const c of goalClones) {
        (c as any).traverse?.((n: any) => {
          if (n.isMesh) {
            n.geometry?.dispose?.();
            const mat = n.material;
            if (Array.isArray(mat)) mat.forEach(m => m?.dispose?.());
            else mat?.dispose?.();
          }
        });
      }
    });
  }
  return { group, dispose: () => disposers.forEach(d => d()) };
}


