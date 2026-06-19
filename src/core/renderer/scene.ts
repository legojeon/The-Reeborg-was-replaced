import { AmbientLight, CanvasTexture, CylinderGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { World, Direction, RobotPose } from '../types/types';
import { dirToRad, dirToVec, mapX1BasedToScene, mapZ1BasedToScene } from './utils';
import { createGrid } from './grid';
import { createGround } from './ground';
import { createWalls } from './walls';
import { createObjects } from './objects';
import type { SceneHandle } from './types';
import { SCENE_COLORS, LIGHT_COLORS, GOAL_COLORS, ROBOT_COLORS } from './colors';

function makeSkyTexture(top: string, bottom: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createThreeScene(canvas: HTMLCanvasElement, world: World): SceneHandle {
  const scene = new Scene();
  // Soft vertical sky gradient instead of a flat white background.
  scene.background = makeSkyTexture(SCENE_COLORS.skyTop, SCENE_COLORS.skyBottom);

  const ISO_FOV = 50;
  const FIRST_FOV = 90; // wide first-person lens so the world feels less zoomed-in
  const camera = new PerspectiveCamera(ISO_FOV, 1, 0.1, 1000);
  const center = new Vector3((world.width - 1) / 2, 0, (world.height - 1) / 2);
  // Front-facing view: align horizontally with grid center (x), view from +Z, slight elevation
  const span = Math.max(world.width, world.height);
  const initialCamPos = new Vector3(center.x, span, center.z + span);
  camera.position.copy(initialCamPos);
  camera.lookAt(center);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Improve perceived brightness/saturation with ACES tone mapping and sRGB output
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = SRGBColorSpace;

  const amb = new AmbientLight(LIGHT_COLORS.ambient, 0.6);
  const dir = new DirectionalLight(LIGHT_COLORS.directional, 0.8);
  dir.position.set(5, 10, 7);
  const hemi = new HemisphereLight(LIGHT_COLORS.hemiSky, LIGHT_COLORS.hemiGround, 0.5);
  scene.add(amb, dir, hemi);

  // Mouse camera controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(center.x, 0, center.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = Math.max(3, Math.min(world.width, world.height) * 0.6);
  controls.maxDistance = Math.max(world.width, world.height) * 4;
  controls.maxPolarAngle = Math.PI * 0.49; // avoid going under the ground plane
  controls.update();

  // Grid
  const { grid, dispose: disposeGrid } = createGrid(world);
  scene.add(grid);

  // Ground
  const { ground, dispose: disposeGround } = createGround(world, center);
  scene.add(ground);

  // Goal position tile overlay (light green)
  let goalOverlay: Mesh | null = null;
  let goalOverlayGeom: PlaneGeometry | null = null;
  let goalOverlayMat: MeshStandardMaterial | null = null;
  try {
    const gp = world.goal?.position;
    const gx = Number(gp?.x);
    const gy = Number(gp?.y);
    if (Number.isFinite(gx) && Number.isFinite(gy)) {
      goalOverlayGeom = new PlaneGeometry(1, 1, 1, 1);
      goalOverlayMat = new MeshStandardMaterial({ color: GOAL_COLORS.positionTile, transparent: true, opacity: 0.6 });
      goalOverlay = new Mesh(goalOverlayGeom, goalOverlayMat);
      goalOverlay.rotation.x = -Math.PI / 2;
      goalOverlay.position.set(mapX1BasedToScene(Math.floor(gx)), -0.0005, mapZ1BasedToScene(Math.floor(gy), world.height));
      scene.add(goalOverlay);
    }
  } catch {
    // ignore
  }

  // Walls
  let { group: wallsGroup, dispose: disposeWalls } = createWalls(world);
  scene.add(wallsGroup);

  // Objects
  let { group: objectsGroup, dispose: disposeObjects } = createObjects(world);
  scene.add(objectsGroup);

  // Robot: start with a simple primitive immediately, then swap to GLB when loaded
  const robotGeom = new CylinderGeometry(0.5, 0.5, 0.5, 3, 1, false); // triangular prism
  const robotMat = new MeshStandardMaterial({ color: ROBOT_COLORS.default, flatShading: true }); // primitive color
  let robot: Mesh | Group = new Mesh(robotGeom, robotMat);
  let robotIsGLB = false;
  let disposeGLB: (() => void) | null = null;
  // Placement/scale tuning
  const ROBOT_Y = 0;          // slightly lower than before (was 0.45)
  const PRIMITIVE_SCALE = 1.2;   // make the primitive a bit larger
  const GLB_SCALE = 1.3;        // make the GLB model slightly larger than default
  robot.scale.setScalar(PRIMITIVE_SCALE);
  const ROBOT_URL = new URL('../../assets/robot.glb', import.meta.url).href;
  const gltfLoader = new GLTFLoader();
  gltfLoader.load(
    ROBOT_URL,
    (gltf: GLTF) => {
      try {
        const model = gltf.scene || gltf.scenes?.[0];
        if (!model) return;
        // Position/rotation match the primitive; set scale if needed
        model.position.copy(robot.position);
        model.rotation.copy(robot.rotation);
        // Heuristic scale so it roughly fits the previous primitive footprint
        model.scale.setScalar(GLB_SCALE);
        // Preserve GLB's original materials/colors (no overrides)
        // Store originals so we can restore later after temporary overrides
        model.traverse((n: any) => {
          if (n.isMesh && n.material) {
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) {
              if (m?.color && !m.userData?.__origColor) {
                m.userData = m.userData || {};
                m.userData.__origColor = m.color.clone();
              }
            }
          }
        });
        // Swap in scene
        scene.remove(robot);
        scene.add(model);
        robot = model;
        robotIsGLB = true;
        // Prepare disposer for GLB (dispose geometries/materials on destroy)
        disposeGLB = () => {
          model.traverse((n: any) => {
            if (n.isMesh) {
              n.geometry?.dispose?.();
              const mat = n.material;
              if (Array.isArray(mat)) mat.forEach(m => m?.dispose?.());
              else mat?.dispose?.();
            }
          });
        };
      } catch {
        // keep primitive if anything goes wrong
      }
    },
    undefined,
    () => {
      // loading error -> keep primitive silently
    }
  );
  // Internal coordinates are 1-based; map to scene units with bottom-origin:
  // x -> x - 1, z -> (height - y)
  robot.position.set(world.robot.x - 1, ROBOT_Y, (world.height - world.robot.y));
  // Orient the prism axis along -Z so a triangle vertex faces forward, then yaw to dir
  robot.rotation.y = dirToRad(world.robot.dir) + (Math.PI);
  scene.add(robot);

  // Track last direction to control rotation interpolation direction (left turn = +90deg)
  let lastDir = world.robot.dir;
  let rotating = false;
  let rotateStart = 0;
  let rotateDurationMs = 150;
  let rotateStartYaw = robot.rotation.y;
  let rotateEndYaw = robot.rotation.y;
  // Position tween (so the robot glides between cells instead of jumping)
  let moving = false;
  let moveStart = 0;
  let moveDur = 0;
  let moveFromX = robot.position.x;
  let moveFromZ = robot.position.z;
  let moveToX = robot.position.x;
  let moveToZ = robot.position.z;
  let viewMode: 'iso' | 'first' = 'iso';
  // First-person tuning: slightly higher eye and a bit in front of the robot to avoid occlusion
  const firstEyeHeight = 0.8;
  const firstFrontOffset = 0.1; // distance in front of robot along its facing vector
  const firstLookDist = 0.5;    // how far ahead to look from the eye
  let firstYawRad = 0; // continuous yaw offset relative to robot dir, clamped [-PI/2, +PI/2]
  let lastPose: RobotPose = { x: world.robot.x, y: world.robot.y, dir: world.robot.dir, token: world.robot.token };
  const dragState = { active: false, startX: 0, prevX: 0 };
  // First-person turn animation state (to smoothly blend robot turns)
  let camTurnActive = false;
  let camTurnStart = 0;
  let camTurnSign = 1; // +1 left turn, -1 right (when reverse)
  let camPrevDir: Direction = lastDir;

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);

  // First-person: drag to rotate 90° left/right
  function onPointerDown(e: PointerEvent) {
    if (viewMode !== 'first') return;
    dragState.active = true;
    dragState.startX = e.clientX;
    dragState.prevX = e.clientX;
  }
  function onPointerMove(e: PointerEvent) {
    if (viewMode !== 'first' || !dragState.active) return;
    const dx = e.clientX - dragState.prevX;
    dragState.prevX = e.clientX;
    const sensitivity = 0.005; // rad per pixel
    firstYawRad += dx * sensitivity;
    const HALF_PI = Math.PI / 2;
    if (firstYawRad > HALF_PI) firstYawRad = HALF_PI;
    if (firstYawRad < -HALF_PI) firstYawRad = -HALF_PI;
    // re-apply camera with new yaw
    updateRobotPose(lastPose);
  }
  function onPointerUp(_e: PointerEvent) {
    if (viewMode !== 'first' || !dragState.active) return;
    dragState.active = false;
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // Position the first-person camera for a continuous grid position (cx,cz are
  // already in scene units, matching robot.position.x / .z).
  function placeFirstPersonCamera(cx: number, cz: number, dir: Direction) {
    const base = dirToVec(dir);
    const c = Math.cos(firstYawRad);
    const s = Math.sin(firstYawRad);
    const vx = base.vx * c - base.vz * s;
    const vz = base.vx * s + base.vz * c;
    const eyeX = cx + vx * firstFrontOffset;
    const eyeZ = cz + vz * firstFrontOffset;
    camera.position.set(eyeX, firstEyeHeight, eyeZ);
    camera.lookAt(eyeX + vx * firstLookDist, firstEyeHeight, eyeZ + vz * firstLookDist);
  }

  let prevNow = performance.now();

  renderer.setAnimationLoop(() => {
    // delta seconds
    const now = performance.now();
    const delta = Math.max(0, (now - prevNow)) / 1000;
    prevNow = now;

    if (viewMode === 'iso') {
      controls.update();
    }
    // Glide the robot between cells
    if (moving) {
      const t = (now - moveStart) / moveDur;
      if (t >= 1) {
        moving = false;
        robot.position.set(moveToX, ROBOT_Y, moveToZ);
      } else {
        const k = t < 0 ? 0 : t; // linear keeps a constant speed across cells
        robot.position.set(moveFromX + (moveToX - moveFromX) * k, ROBOT_Y, moveFromZ + (moveToZ - moveFromZ) * k);
      }
      if (viewMode === 'first' && !camTurnActive) {
        placeFirstPersonCamera(robot.position.x, robot.position.z, lastPose.dir);
      }
    }
    if (rotating) {
      const t = (performance.now() - rotateStart) / rotateDurationMs;
      if (t >= 1) {
        rotating = false;
        robot.rotation.y = dirToRad(lastDir) + Math.PI;
      } else {
        const k = Math.min(Math.max(t, 0), 1);
        robot.rotation.y = rotateStartYaw + (rotateEndYaw - rotateStartYaw) * k;
      }
    }
    // Animate first-person camera during robot turns
    if (viewMode === 'first' && camTurnActive) {
      const t = (performance.now() - camTurnStart) / rotateDurationMs;
      if (t >= 1) {
        camTurnActive = false;
        // snap to final with current lastDir and firstYawRad
        updateRobotPose(lastPose);
      } else {
        const k = Math.min(Math.max(t, 0), 1);
        // Start from previous direction, rotate by partial turn angle
        const base = dirToVec(camPrevDir);
        const turnAngle = camTurnSign * (Math.PI / 2) * k;
        const c1 = Math.cos(turnAngle);
        const s1 = Math.sin(turnAngle);
        let vx = base.vx * c1 - base.vz * s1;
        let vz = base.vx * s1 + base.vz * c1;
        // Apply user yaw offset
        const c2 = Math.cos(firstYawRad);
        const s2 = Math.sin(firstYawRad);
        const rvx = vx * c2 - vz * s2;
        const rvz = vx * s2 + vz * c2;
        const cx = lastPose.x - 1;
        const cz = (world.height - lastPose.y);
        const eyeX = cx + rvx * firstFrontOffset;
        const eyeZ = cz + rvz * firstFrontOffset;
        camera.position.set(eyeX, firstEyeHeight, eyeZ);
        camera.lookAt(eyeX + rvx * firstLookDist, firstEyeHeight, eyeZ + rvz * firstLookDist);
      }
    }
    renderer.render(scene, camera);
  });

  function updateRobotPose(pose: RobotPose, opts?: { reverse?: boolean; durationMs?: number }) {
    // Map 1-based grid coordinate to scene with bottom-origin
    const tx = mapX1BasedToScene(pose.x);
    const tz = mapZ1BasedToScene(pose.y, world.height);
    const dur = Math.max(0, Math.min(800, opts?.durationMs ?? 0));
    const dist = Math.hypot(tx - robot.position.x, tz - robot.position.z);
    // Glide only for a normal single-cell step; snap on resets/teleports (>1 cell).
    if (dist > 1e-4 && dist <= 1.6 && dur >= 30) {
      // Glide to the new cell over `dur` ms (driven by the animation loop).
      moveFromX = robot.position.x;
      moveFromZ = robot.position.z;
      moveToX = tx;
      moveToZ = tz;
      moveStart = performance.now();
      moveDur = dur;
      moving = true;
    } else {
      robot.position.set(tx, ROBOT_Y, tz);
      moving = false;
      if (viewMode === 'first') placeFirstPersonCamera(tx, tz, pose.dir);
    }
    lastPose = pose;
    if (pose.dir !== lastDir) {
      // Rotate 90deg; reverse flag decides direction (-90 for prev)
      const sign = opts?.reverse ? -1 : 1;
      // For first-person: start camera turn animation from previous dir
      camPrevDir = lastDir;
      // Positive sign (left turn) should rotate camera by -90° in our XZ convention
      camTurnSign = -sign;
      camTurnStart = performance.now();
      camTurnActive = true;
      rotateStartYaw = robot.rotation.y;
      rotateEndYaw = rotateStartYaw + sign * (Math.PI / 2);
      rotateStart = performance.now();
      rotating = true;
      lastDir = pose.dir;
    } else {
      // Move only; keep current yaw
    }
  }

  // simple signatures to avoid unnecessary rebuilds (reduces flicker)
  let lastObjectsSig = JSON.stringify(world.objects ?? []);
  let lastWallsSig = JSON.stringify(world.walls ?? []);

  return {
    destroy() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      // dispose helpers
      disposeGrid();
      disposeGround();
      if (goalOverlay) scene.remove(goalOverlay);
      if (goalOverlayGeom) goalOverlayGeom.dispose();
      if (goalOverlayMat) goalOverlayMat.dispose();
      disposeWalls();
      disposeObjects();
      if (robotIsGLB) {
        disposeGLB?.();
      } else {
        robotGeom.dispose();
        robotMat.dispose();
      }
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
    },
    updateRobot: updateRobotPose,
    setRobotColor(color: number | string) {
      if (robotIsGLB) {
        // Traverse and update any material with color
        robot.traverse((n: any) => {
          if (n.isMesh && n.material) {
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) {
              if (m?.color) {
                m.color = new Color(color);
                m.needsUpdate = true;
              }
            }
          }
        });
      } else {
        robotMat.color = new Color(color);
        robotMat.needsUpdate = true;
      }
    },
    resetView() {
      controls.target.copy(center);
      camera.position.copy(initialCamPos);
      camera.lookAt(center);
      controls.enabled = true;
      controls.update();
      viewMode = 'iso';
      firstYawRad = 0;
      robot.visible = true;
      camera.fov = ISO_FOV;
      camera.updateProjectionMatrix();
    },
    setViewMode(mode: 'iso' | 'first') {
      viewMode = mode;
      if (mode === 'iso') {
        controls.enabled = true;
        controls.target.copy(center);
        camera.position.copy(initialCamPos);
        camera.lookAt(center);
        controls.update();
        // Restore the robot model and the normal lens
        robot.visible = true;
        camera.fov = ISO_FOV;
        camera.updateProjectionMatrix();
      } else {
        controls.enabled = false;
        firstYawRad = 0;
        // Hide the robot so it does not occlude its own first-person view,
        // and widen the lens so the world feels less zoomed-in.
        robot.visible = false;
        camera.fov = FIRST_FOV;
        camera.updateProjectionMatrix();
        updateRobotPose({ x: world.robot.x, y: world.robot.y, dir: lastDir, token: world.robot.token });
      }
    },
    updateObjects(objects) {
      const list = objects ?? [];
      const sig = JSON.stringify(list);
      if (sig === lastObjectsSig) return; // no change; skip rebuild
      lastObjectsSig = sig;
      // rebuild objects
      scene.remove(objectsGroup);
      disposeObjects();
      // Preserve goal overlays by rebuilding via createObjects with a temp world snapshot
      const tempWorld: World = {
        ...world,
        objects: list
      };
      const rebuiltAll = createObjects(tempWorld);
      objectsGroup = rebuiltAll.group;
      disposeObjects = rebuiltAll.dispose;
      scene.add(objectsGroup);
    },
    updateWalls(walls) {
      const list = walls ?? [];
      const sig = JSON.stringify(list);
      if (sig === lastWallsSig) return; // no change; skip rebuild
      lastWallsSig = sig;
      scene.remove(wallsGroup);
      disposeWalls();
      // Rebuild including goal overlays
      const tempWorld: World = {
        ...world,
        walls: list
      };
      const rebuiltAll = createWalls(tempWorld);
      wallsGroup = rebuiltAll.group;
      disposeWalls = rebuiltAll.dispose;
      scene.add(wallsGroup);
    },
    restoreRobotOriginalColor() {
      if (robotIsGLB) {
        robot.traverse((n: any) => {
          if (n.isMesh && n.material) {
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) {
              const orig = m?.userData?.__origColor;
              if (m?.color && orig) {
                m.color.copy(orig);
                m.needsUpdate = true;
              }
            }
          }
        });
      } else {
        robotMat.color = new Color(ROBOT_COLORS.default);
        robotMat.needsUpdate = true;
      }
    }
  };
}


