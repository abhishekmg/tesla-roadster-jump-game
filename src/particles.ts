import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  billow: boolean;
  drag: number;
}

/** Kinds that swell as they age instead of shrinking. */
const BILLOW = new Set(['vapor', 'smoke']);

const geo = new THREE.IcosahedronGeometry(0.6, 1);
export const PARTICLE_MATS = {
  flame: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
  hot: new THREE.MeshBasicMaterial({ color: 0xfff0b0 }),
  // Cold-gas thruster exhaust billows out as bright white vapor.
  vapor: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8a8c94, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false }),
  smoke: new THREE.MeshStandardMaterial({ color: 0x4a4a50, roughness: 1, flatShading: true }),
  debris: new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
};
export type ParticleKind = keyof typeof PARTICLE_MATS;

export class Particles {
  private pool: Particle[] = [];
  private active: Particle[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 420; i++) {
      const mesh = new THREE.Mesh(geo, PARTICLE_MATS.flame);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.2, billow: false, drag: 0 });
    }
  }

  emit(kind: ParticleKind, pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number) {
    const p = this.pool.pop();
    if (!p) return;
    p.mesh.material = PARTICLE_MATS[kind];
    p.mesh.position.copy(pos);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.mesh.visible = true;
    p.vel.copy(vel);
    p.life = p.maxLife = life;
    p.size = size;
    p.billow = BILLOW.has(kind);
    p.drag = p.billow ? 2.2 : 0;
    this.active.push(p);
  }

  burst(kind: ParticleKind, pos: THREE.Vector3, count: number, speed: number, life: number, size: number, upBias = 0) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5 + upBias, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.emit(kind, pos, v, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.8));
    }
  }

  /** `drift` scrolls particles with the world so they stay on the road. */
  update(dt: number, drift: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      if (p.billow) {
        p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.vel.y += 0.6 * dt;
      } else {
        p.vel.y -= 4 * dt;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.position.z += drift;
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.y *= -0.3;
      }
      const t = p.life / p.maxLife;
      // Billowing puffs grow, then pinch out at the very end of their life.
      p.mesh.scale.setScalar(p.billow ? p.size * (0.5 + (1 - t) * 1.8) * Math.min(1, t * 5) : p.size * t);
    }
  }

  clear() {
    for (const p of this.active) {
      p.mesh.visible = false;
      this.pool.push(p);
    }
    this.active.length = 0;
  }
}
