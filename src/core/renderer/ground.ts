import { Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import type { World } from '../types/types';

export function createGround(world: World, center: InstanceType<typeof Vector3>): { ground: InstanceType<typeof Mesh>, dispose: () => void } {
  const groundGeom = new PlaneGeometry(world.width, world.height, world.width, world.height);
  const groundMat = new MeshStandardMaterial({ color: 0xe5e7eb });
  const ground = new Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.001, center.z);
  const dispose = () => { groundGeom.dispose(); groundMat.dispose(); };
  return { ground, dispose };
}


