import { AmbientLight, CylinderGeometry, Color, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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

  const amb = new AmbientLight(0xffffff, 0.6);
  const dir = new DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 7);
  scene.add(amb, dir);

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

  const robotGeom = new CylinderGeometry(0.5, 0.5, 0.5, 3, 1, false); // triangular prism
  const robotMat = new MeshStandardMaterial({ color: 0x3b82f6, flatShading: true }); // bright blue
  const robot = new Mesh(robotGeom, robotMat);
  // Internal coordinates are 1-based; map to scene units with bottom-origin:
  // x -> x - 1, z -> (height - y)
  robot.position.set(world.robot.x - 1, 0.45, (world.height - world.robot.y));
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
  const firstEyeHeight = 0.2;
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
    robot.position.set(mapX1BasedToScene(pose.x), 0.45, mapZ1BasedToScene(pose.y, world.height));
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
      robotGeom.dispose();
      robotMat.dispose();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
    },
    updateRobot: updateRobotPose,
    setRobotColor(color: number | string) {
      robotMat.color = new Color(color as any);
      robotMat.needsUpdate = true;
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
      // rebuild objects
      scene.remove(objectsGroup);
      disposeObjects();
      const list = objects ?? [];
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
      scene.remove(wallsGroup);
      disposeWalls();
      const list = walls ?? [];
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


