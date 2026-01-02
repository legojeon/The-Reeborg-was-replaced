import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function playJumpingRobotBottomLeft(_mountEl?: HTMLElement | null, opts?: { durationMs?: number; sizePx?: number; loopAnim?: boolean }) {
	const durationMs = opts?.durationMs ?? 3500;
	const loopAnim = !!opts?.loopAnim;
	const sizePx = opts?.sizePx ?? 200;

	// Topmost overlay container (fixed full-viewport)
	const container = document.createElement('div');
	container.style.position = 'fixed';
	container.style.inset = '0';
	container.style.zIndex = '2147483647';
	container.style.pointerEvents = 'none';
	container.style.clipPath = 'none';
	container.style.overflow = 'visible';
	container.style.transform = 'none';
	container.style.filter = 'none';
	container.style.isolation = 'isolate';
	document.body.appendChild(container);

	const canvas = document.createElement('canvas');
	canvas.style.position = 'absolute';
	canvas.style.left = '-100px';
	canvas.style.bottom = '-50px';
	canvas.style.width = `${sizePx}px`;
	canvas.style.height = `${sizePx}px`;
	canvas.style.pointerEvents = 'none';
	container.appendChild(canvas);

	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	// fully transparent background (avoid dimming behind)
	renderer.setClearColor(0x000000, 0);

	function resize() {
		const w = sizePx;
		const h = sizePx;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
	camera.position.set(0, 0.55, 1.6); // default; will be auto-fitted after model loads
	camera.lookAt(0, 0.2, 0);

	const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.0);
	const amb = new THREE.AmbientLight(0xffffff, 0.5);
	const dir = new THREE.DirectionalLight(0xffffff, 0.9);
	dir.position.set(2, 3, 2);
	scene.add(hemi, amb, dir);

	resize();

	// Holder to keep model centered and to animate spin/jump without affecting fit calculations
	const holder = new THREE.Group();
	scene.add(holder);
	let jumpAmp = 0.4;
	let jumpBase = 0.1;
	let biasDown = 0; // push the model lower on screen to leave headroom for jumps

	function fitCameraToObject(obj: any) {
		try {
			const box = new THREE.Box3().setFromObject(obj);
			const size = box.getSize(new THREE.Vector3());
			const center = box.getCenter(new THREE.Vector3());
			// Recenter object around origin
			obj.position.sub(center);
			const maxDim = Math.max(size.x, size.y, size.z) * 1.6; // margin
			const fov = THREE.MathUtils.degToRad(camera.fov);
			const dist = (maxDim * 0.5) / Math.tan(fov / 2);
			camera.position.set(0, size.y * 0.2, Math.max(1.0, dist));
			camera.near = 0.01;
			camera.far = 100;
			camera.updateProjectionMatrix();
			// screen bias so the model sits lower; camera lookAt does NOT follow this bias
			// so that the robot visually stays lower in the frame.
			biasDown = Math.max(0.4, size.y * 0.6);
			camera.lookAt(0, size.y * 0.05, 0);
			// Derive jump parameters from model height so it stays on-screen
			jumpAmp = Math.max(0.12, size.y * 0.18);
			jumpBase = Math.max(0.04, size.y * 0.06);
		} catch {
			// ignore
		}
	}

	const loader = new GLTFLoader();
	// Path from src/core/renderer/effects -> src/assets
	const url = new URL('../../../assets/robot.glb', import.meta.url).href;
	let robot: any | null = null;
	// primitive fallback if GLB fails
	let fallback: any | null = null;

	const start = performance.now();
	let last = start;
	let running = true;

	loader.load(
		url,
		(gltf: GLTF) => {
			if (!running) return;
			robot = (gltf.scene || gltf.scenes?.[0]) as any;
			robot.position.set(0, 0, 0);
			robot.traverse((n: any) => {
				if (n.isMesh) n.frustumCulled = false;
			});
			// restore original bigger appearance
			robot.scale.setScalar(1.6);
			holder.add(robot);
			fitCameraToObject(holder);
		},
		undefined,
		() => {
			// On error, show a simple primitive so the user still sees the effect
			if (!running) return;
			const geom = new THREE.ConeGeometry(0.4, 0.8, 6);
			const mat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, flatShading: true });
			fallback = new THREE.Mesh(geom, mat);
			fallback.position.set(0, 0, 0);
			(fallback as any).frustumCulled = false;
			holder.add(fallback);
			fitCameraToObject(holder);
		}
	);

	function loop() {
		if (!running) return;
		const now = performance.now();
		const dt = Math.max(0, now - last) / 1000;
		last = now;

		const t = now - start;

		// Animate holder (not raw mesh) so bbox stays centered and fit remains valid
		holder.rotation.y += dt * Math.PI * 2; // ~1rev/sec
		const jumpT = (t % 1200) / 1200; // repeat every 1.2s
		const y = -biasDown + jumpBase + Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, jumpT))), 2) * jumpAmp;
		holder.position.y = y;

		renderer.render(scene, camera);

		if (!loopAnim && t >= durationMs) {
			stop();
			return;
		}
		requestAnimationFrame(loop);
	}
	requestAnimationFrame(loop);

	function stop() {
		running = false;
		try {
			if (robot) {
				robot.traverse((n: any) => {
					if (n.isMesh) {
						n.geometry?.dispose?.();
						const mat = n.material;
						if (Array.isArray(mat)) mat.forEach((m: any) => m?.dispose?.());
						else mat?.dispose?.();
					}
				});
			}
			if (fallback) {
				fallback.geometry.dispose();
				(fallback.material as any)?.dispose?.();
			}
		} catch {}
		try { renderer.setAnimationLoop(null as any); } catch {}
		try { renderer.dispose(); } catch {}
		try { container.remove(); } catch {}
	}

	return { stop };
}


