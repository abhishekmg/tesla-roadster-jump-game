import * as THREE from 'three';
import { buildRoadster } from './models';
import type { VehicleModel } from './models';
import type { Particles } from './particles';
import { LANES } from './world';

const GRAVITY = 26;
// One press: a low hop (~2.9 units) that clears cars but not trucks.
const HOP_VELOCITY = 12.2;
// Second press mid-air: a thruster boost (~4 more units) to clear trucks. It sets the
// upward speed rather than adding to it, so pressing early doesn't rocket you off-screen.
const BOOST_VELOCITY = 14.5;
const FAST_FALL = -26;
const LANE_SHARPNESS = 14;
/** Slower lane drift while barrel-rolling, so the car arcs across instead of snapping. */
const ROLL_LANE_SHARPNESS = 5;
const ROLL_SECONDS = 0.7;
const FRONTFLIP_SECONDS = 0.95;
/** Flips are skipped if there isn't this much airtime left to finish them. */
const MIN_FLIP_SECONDS = 0.3;
/** Height of the car's middle; flips spin around this point rather than the wheels. */
const PIVOT_Y = 0.65;

interface Flip {
  active: boolean;
  elapsed: number;
  duration: number;
  /** Total rotation in radians (signed). */
  angle: number;
}

const idleFlip = (): Flip => ({ active: false, elapsed: 0, duration: 1, angle: 0 });
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Player {
  readonly model: VehicleModel;
  readonly group: THREE.Group;
  lane = 1;
  y = 0;
  private vy = 0;
  private thrust = 0;
  private flames: THREE.Mesh[] = [];
  private glow: THREE.PointLight;
  private crashSpin = new THREE.Vector3();
  crashed = false;
  /** True once the mid-air boost has fired during the current jump. */
  boosted = false;
  private particles: Particles;
  /** Inner pivot that the side roll and front flip rotate. */
  private spin = new THREE.Group();
  private roll = idleFlip();
  private frontFlip = idleFlip();

  constructor(scene: THREE.Scene, particles: Particles) {
    this.particles = particles;
    this.model = buildRoadster();
    this.group = this.model.group;
    scene.add(this.group);

    // Cold-gas thrusters: paired nozzles behind the rear wheels and a pair up front,
    // firing white jets straight down like the demo car.
    const jetGeo = new THREE.CylinderGeometry(0.16, 0.07, 1.6, 12, 1, true).translate(0, -0.8, 0);
    const jetMat = new THREE.MeshBasicMaterial({ color: 0xf4f6fa, transparent: true, opacity: 0.55, depthWrite: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, metalness: 0.9, roughness: 0.3 });
    const nozzleGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.16, 10);
    const mounts: [number, number][] = [[-0.78, 2.05], [0.78, 2.05], [-0.3, 2.3], [0.3, 2.3], [-0.75, -1.95], [0.75, -1.95]];
    for (const [x, z] of mounts) {
      const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzle.position.set(x, 0.24, z);
      this.group.add(nozzle);
      const jet = new THREE.Mesh(jetGeo, jetMat);
      const core = new THREE.Mesh(jetGeo, coreMat);
      core.scale.set(0.4, 0.55, 0.4);
      jet.add(core);
      jet.position.set(x, 0.16, z);
      jet.visible = false;
      this.group.add(jet);
      this.flames.push(jet);
    }
    this.glow = new THREE.PointLight(0xdfe8ff, 0, 10, 1.5);
    this.glow.position.set(0, -0.3, 0);
    this.group.add(this.glow);

    // Re-parent the car into a pivot at its middle so flips rotate around the body.
    const inner = new THREE.Group();
    inner.position.y = -PIVOT_Y;
    for (const child of [...this.group.children]) inner.add(child);
    this.spin.position.y = PIVOT_Y;
    this.spin.add(inner);
    this.group.add(this.spin);
    this.reset();
  }

  get x() {
    return this.group.position.x;
  }

  get airborne() {
    return this.y > 0.001 || this.vy > 0;
  }

  reset() {
    this.lane = 1;
    this.y = 0;
    this.vy = 0;
    this.thrust = 0;
    this.crashed = false;
    this.boosted = false;
    this.group.position.set(LANES[1], 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.endFlips();
  }

  move(dir: -1 | 1) {
    if (this.crashed) return;
    this.lane = Math.max(0, Math.min(LANES.length - 1, this.lane + dir));
    // Steering mid-air throws a full barrel roll toward that side, like the demo.
    // Left rolls counter-clockwise as seen from behind (+Z), right clockwise.
    if (this.airborne && !this.roll.active && !this.frontFlip.active) {
      this.startFlip(this.roll, ROLL_SECONDS, -dir * Math.PI * 2);
    }
  }

  /** Seconds until touchdown on the current arc. */
  private timeToLand() {
    return (this.vy + Math.sqrt(this.vy * this.vy + 2 * GRAVITY * Math.max(0, this.y))) / GRAVITY;
  }

  /** Start a flip, shortened if needed so it always finishes before landing. */
  private startFlip(flip: Flip, seconds: number, angle: number) {
    const remaining = this.timeToLand() - 0.05;
    if (remaining < MIN_FLIP_SECONDS) return;
    flip.active = true;
    flip.elapsed = 0;
    flip.duration = Math.min(seconds, remaining);
    flip.angle = angle;
  }

  private endFlips() {
    this.roll = idleFlip();
    this.frontFlip = idleFlip();
    this.spin.rotation.set(0, 0, 0);
  }

  private updateFlips(dt: number) {
    for (const f of [this.roll, this.frontFlip]) {
      if (!f.active) continue;
      f.elapsed += dt;
      if (f.elapsed >= f.duration) f.active = false;
    }
    const progress = (f: Flip) => (f.active ? easeInOut(Math.min(1, f.elapsed / f.duration)) : 0);
    this.spin.rotation.z = progress(this.roll) * this.roll.angle;
    this.spin.rotation.x = progress(this.frontFlip) * this.frontFlip.angle;
  }

  jump() {
    if (this.crashed) return;
    if (!this.airborne) {
      this.vy = HOP_VELOCITY;
      this.thrust = 1;
      this.groundCloud(70, 10);
    } else if (!this.boosted) {
      this.boosted = true;
      this.vy = BOOST_VELOCITY;
      this.thrust = 1;
      this.vaporBlast();
      // The boost throws one full front flip, nose over toward the road ahead.
      if (!this.roll.active) this.startFlip(this.frontFlip, FRONTFLIP_SECONDS, -Math.PI * 2);
    }
  }

  /** Downward burst of vapor from under the car when the boost fires mid-air. */
  private vaporBlast() {
    const base = this.group.position.clone().setY(this.y + 0.1);
    const v = new THREE.Vector3();
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      v.set(Math.cos(a) * s, -6 - Math.random() * 6, Math.sin(a) * s * 0.6);
      this.particles.emit('vapor', base, v, 0.8 + Math.random() * 0.6, 0.6 + Math.random() * 0.6);
    }
  }

  /** A ring of white vapor rolling out across the road, as in the demo footage. */
  private groundCloud(count: number, speed: number) {
    const base = this.group.position.clone().setY(0.35);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      v.set(Math.cos(a) * s, 0.4 + Math.random() * 1.2, Math.sin(a) * s * 0.6);
      this.particles.emit('vapor', base, v, 0.9 + Math.random() * 0.8, 0.7 + Math.random() * 0.7);
    }
  }

  fastFall() {
    // A flip is committed: diving mid-flip would cut it short and snap the car upright.
    if (this.crashed || !this.airborne || this.roll.active || this.frontFlip.active) return;
    this.vy = Math.min(this.vy, FAST_FALL);
  }

  crash() {
    this.crashed = true;
    this.vy = 9;
    this.crashSpin.set(-4 - Math.random() * 3, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
    const p = this.group.position.clone().setY(this.y + 0.8);
    this.particles.burst('hot', p, 30, 14, 0.5, 0.45, 0.3);
    this.particles.burst('flame', p, 40, 11, 0.8, 0.4, 0.4);
    this.particles.burst('smoke', p, 18, 5, 1.1, 0.3, 0.8);
    this.particles.burst('debris', p, 24, 12, 1.4, 0.25, 0.6);
  }

  update(dt: number, speed: number) {
    const pos = this.group.position;

    if (this.crashed) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(0.3, this.y + this.vy * dt);
      if (this.y <= 0.3) {
        this.vy = Math.abs(this.vy) * 0.3;
        this.crashSpin.multiplyScalar(0.6);
      }
      this.group.rotation.x += this.crashSpin.x * dt;
      this.group.rotation.y += this.crashSpin.y * dt;
      this.group.rotation.z += this.crashSpin.z * dt;
      pos.y = this.y;
      this.setFlames(0);
      if (Math.random() < 0.2) {
        this.particles.emit('smoke', pos.clone().setY(this.y + 0.6), new THREE.Vector3((Math.random() - 0.5) * 1, 2.5, -1), 1.0, 0.28);
      }
      return;
    }

    // Lane easing with a little body roll into the turn.
    const targetX = LANES[this.lane];
    const dx = targetX - pos.x;
    pos.x += dx * Math.min(1, (this.roll.active ? ROLL_LANE_SHARPNESS : LANE_SHARPNESS) * dt);
    this.group.rotation.z = this.roll.active ? 0 : THREE.MathUtils.clamp(dx * 0.12, -0.25, 0.25);
    this.group.rotation.y = THREE.MathUtils.clamp(dx * 0.05, -0.12, 0.12);

    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      // Nose pitches up on launch and levels out on descent.
      this.group.rotation.x = THREE.MathUtils.clamp(this.vy * 0.012, -0.12, 0.2);
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.boosted = false;
        this.group.rotation.x = 0;
        this.endFlips();
        this.groundCloud(22, 7);
      }
    }
    pos.y = this.y;
    this.updateFlips(dt);

    // Thrusters: big kick on launch, then a soft hover burn before landing.
    this.thrust = Math.max(0, this.thrust - dt * 2.4);
    let burn = this.thrust;
    if (this.airborne && this.vy < 0 && this.y < 1.4) burn = Math.max(burn, 0.55);
    this.setFlames(burn);
    if (burn > 0.2) {
      for (const f of this.flames) {
        if (Math.random() < burn * 0.7) {
          const wp = f.getWorldPosition(new THREE.Vector3());
          wp.y -= 0.6;
          this.particles.emit('vapor', wp,
            new THREE.Vector3((Math.random() - 0.5) * 1.5, -8 - Math.random() * 4, (Math.random() - 0.5) * 1.5), 0.55, 0.32);
        }
      }
      // Jet wash spreading along the road while low.
      if (this.y < 3 && Math.random() < burn) {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit('vapor', pos.clone().setY(0.3),
          new THREE.Vector3(Math.cos(a) * 8, 0.5, Math.sin(a) * 5), 0.9, 0.8);
      }
    }

    for (const w of this.model.wheels) w.rotation.x -= (speed / 0.4) * dt;
  }

  private setFlames(level: number) {
    for (const f of this.flames) {
      f.visible = level > 0.02;
      const flicker = 0.85 + Math.random() * 0.3;
      f.scale.set(0.8 + level * 0.4, level * flicker * 1.4, 0.8 + level * 0.4);
    }
    this.glow.intensity = level * 12;
  }
}
