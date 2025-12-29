import { AmbientLight, CylinderGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { World, Direction, RobotPose } from '../types/types';
import { dirToRad, dirToVec, mapX1BasedToScene, mapZ1BasedToScene } from './utils';
import { createGrid } from './grid';
import { createGround } from './ground';
import { createWalls, createWallsFromList } from './walls';
import { createObjects, createObjectsFromList } from './objects';
import type { SceneHandle } from './types';

export function createThreeScene(canvas: HTMLCanvasElement, world: World): SceneHandle {
  const scene = new Scene();
  scene.background = new Color('#ffffff');

  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  const center = new Vector3((world.width - 1) / 2, 0, (world.height - 1) / 2);
  // Front-facing view: align horizontally with grid center (x), view from +Z, slight elevation
  const span = Math.max(world.width, world.height);
  const initialCamPos = new Vector3(center.x, span, center.z + span);
  camera.position.copy(initialCamPos);
  camera.lookAt(center);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Improve perceived brightness/saturation with ACES tone mapping and sRGB output
  (renderer as any).toneMapping = ACESFilmicToneMapping;
  (renderer as any).toneMappingExposure = 1.25;
  if ('outputColorSpace' in renderer) {
    (renderer as any).outputColorSpace = SRGBColorSpace;
  }

  const amb = new AmbientLight(0xffffff, 0.6);
  const dir = new DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 7);
  const hemi = new HemisphereLight(0xffffff, 0x404040, 0.5);
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
  let goalOverlay: InstanceType<typeof Mesh> | null = null;
  let goalOverlayGeom: InstanceType<typeof PlaneGeometry> | null = null;
  let goalOverlayMat: InstanceType<typeof MeshStandardMaterial> | null = null;
  try {
    const gp = (world as any).goal?.position;
    const gx = Number(gp?.x);
    const gy = Number(gp?.y);
    if (Number.isFinite(gx) && Number.isFinite(gy)) {
      goalOverlayGeom = new PlaneGeometry(1, 1, 1, 1);
      goalOverlayMat = new MeshStandardMaterial({ color: 0x86efac, transparent: true, opacity: 0.6 });
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
  const robotMat = new MeshStandardMaterial({ color: 0x3b82f6, flatShading: true }); // bright blue
  let robot: InstanceType<typeof Mesh> | InstanceType<typeof Group> = new Mesh(robotGeom, robotMat);
  let robotIsGLB = false;
  let disposeGLB: (() => void) | null = null;
  // Placement/scale tuning
  const ROBOT_Y = 0;          // slightly lower than before (was 0.45)
  const PRIMITIVE_SCALE = 1.2;   // make the primitive a bit larger
  const GLB_SCALE = 1.3;        // make the GLB model slightly larger than default
  (robot as any).scale.setScalar(PRIMITIVE_SCALE);
  const ROBOT_URL = new URL('../../assets/robot.glb', import.meta.url).href;
  const gltfLoader = new GLTFLoader();
  gltfLoader.load(
    ROBOT_URL,
    (gltf: GLTF) => {
      try {
        const model = gltf.scene || gltf.scenes?.[0];
        if (!model) return;
        // Position/rotation match the primitive; set scale if needed
        model.position.copy((robot as any).position);
        model.rotation.copy((robot as any).rotation);
        // Heuristic scale so it roughly fits the previous primitive footprint
        model.scale.setScalar(GLB_SCALE);
        // Ensure default color matches primitive's blue (0x3b82f6)
        const defaultColor = new Color(0x3b82f6);
        model.traverse((n: any) => {
          if (n.isMesh && n.material) {
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) {
              if (m?.color) {
                m.color = defaultColor.clone();
                m.needsUpdate = true;
              }
            }
          }
        });
        // Swap in scene
        scene.remove(robot as any);
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

  renderer.setAnimationLoop(() => {
    if (viewMode === 'iso') {
      controls.update();
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

  function updateRobotPose(pose: RobotPose, opts?: { reverse?: boolean }) {
    // Map 1-based grid coordinate to scene with bottom-origin
    robot.position.set(mapX1BasedToScene(pose.x), ROBOT_Y, mapZ1BasedToScene(pose.y, world.height));
    if (viewMode === 'first') {
      // derive viewing vector from robot dir rotated by firstYawRad (clamped)
      const base = dirToVec(pose.dir);
      const c = Math.cos(firstYawRad);
      const s = Math.sin(firstYawRad);
      const vx = base.vx * c - base.vz * s;
      const vz = base.vx * s + base.vz * c;
      const cx = pose.x - 1;
      const cz = (world.height - pose.y);
      // place camera slightly in front of the robot and a bit higher
      const eyeX = cx + vx * firstFrontOffset;
      const eyeZ = cz + vz * firstFrontOffset;
      camera.position.set(eyeX, firstEyeHeight, eyeZ);
      // look forward along the robot's direction
      camera.lookAt(eyeX + vx * firstLookDist, firstEyeHeight, eyeZ + vz * firstLookDist);
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
        (robot as any).traverse((n: any) => {
          if (n.isMesh && n.material) {
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) {
              if (m?.color) {
                m.color = new Color(color as any);
                m.needsUpdate = true;
              }
            }
          }
        });
      } else {
        robotMat.color = new Color(color as any);
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
    },
    setViewMode(mode: 'iso' | 'first') {
      viewMode = mode;
      if (mode === 'iso') {
        controls.enabled = true;
        controls.target.copy(center);
        camera.position.copy(initialCamPos);
        camera.lookAt(center);
        controls.update();
      } else {
        controls.enabled = false;
        firstYawRad = 0;
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
    }
  };
}


