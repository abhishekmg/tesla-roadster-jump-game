import * as THREE from 'three';
import { buildTrafficCar, TRAFFIC_TYPES } from './models';
import type { TrafficType, VehicleModel } from './models';
import type { Player } from './player';
import { LANES } from './world';

const SPAWN_Z = -210;
const DESPAWN_Z = 25;
/** Where the first pre-placed row sits at the start of a run (~2s away at start speed). */
const FIRST_ROW_Z = -50;
export const TRAFFIC_SPEED = 6;
/** Hitboxes are shrunk slightly so near misses feel fair. */
const FORGIVE = 0.15;
/** Trucks can only be cleared with the mid-air boost (second Space press). */
/** Row index of the guaranteed intro Semi (reaches you ~6s into a run). */
const INTRO_SEMI_ROW = 2;
const TRUCKS: ReadonlySet<TrafficType> = new Set<TrafficType>(['cybertruck', 'semi']);

interface Car {
  type: TrafficType;
  model: VehicleModel;
  lane: number;
}

export class Traffic {
  private scene: THREE.Scene;
  private active: Car[] = [];
  private pool = Object.fromEntries(TRAFFIC_TYPES.map((t) => [t, []])) as unknown as Record<TrafficType, VehicleModel[]>;
  private untilNextRow = 0;
  private rowsSpawned = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Clear the road, then fill it with traffic out to the horizon so cars are there from the first second. */
  reset(relSpeed = 0) {
    for (const car of this.active) this.release(car);
    this.active.length = 0;
    this.rowsSpawned = 0;
    this.untilNextRow = Infinity;
    if (relSpeed <= 0) return;
    let z = FIRST_ROW_Z;
    while (z > SPAWN_Z) {
      this.spawnRow(relSpeed, 0, z);
      z -= this.untilNextRow;
    }
    // The next row spawns once the world has scrolled it up to the spawn point.
    this.untilNextRow = SPAWN_Z - z;
  }

  /** `relSpeed` is how fast traffic approaches the player; `level` (0-based) drives density. */
  update(dt: number, relSpeed: number, level: number) {
    const dz = relSpeed * dt;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const car = this.active[i];
      car.model.group.position.z += dz;
      for (const w of car.model.wheels) w.rotation.x -= (TRAFFIC_SPEED / 0.4) * dt;
      if (car.model.group.position.z - car.model.length / 2 > DESPAWN_Z) {
        this.release(car);
        this.active.splice(i, 1);
      }
    }

    this.untilNextRow -= dz;
    if (this.untilNextRow <= 0) this.spawnRow(relSpeed, level);
  }

  private spawnRow(relSpeed: number, level: number, z = SPAWN_Z) {
    // Each level packs rows closer together (1.35s apart at level 1, 0.8s by level 7)...
    const gapTime = Math.max(0.8, 1.35 - level * 0.09);
    // ...and fills more lanes per row: mostly two cars, with full 3-lane walls you must jump.
    const wallChance = Math.min(0.35, 0.15 + level * 0.04);
    const singleChance = Math.max(0.08, 0.25 - level * 0.03);
    const roll = Math.random();
    let count = roll < wallChance ? 3 : roll < wallChance + singleChance ? 1 : 2;
    let lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, count);
    // A few seconds in, send a lone Semi down the middle lane (where you start) so
    // every run introduces the double-jump early.
    const intro = this.rowsSpawned++ === INTRO_SEMI_ROW;
    if (intro) {
      count = 1;
      lanes = [1];
    }

    let longest = 0;
    let hasTruck = false;
    for (const lane of lanes) {
      const type = intro ? 'semi' : this.pickType(level, count);
      const model = this.acquire(type);
      // Stagger cars in a row a little so it doesn't look like a fence.
      const stagger = count > 1 ? Math.random() * 3 : 0;
      model.group.position.set(LANES[lane], 0, z - model.length / 2 - stagger);
      this.active.push({ type, model, lane });
      longest = Math.max(longest, model.length + stagger);
      hasTruck ||= TRUCKS.has(type);
    }
    // Rows you must jump over get extra room so there's time to land and react:
    // the boost keeps you airborne ~0.5s longer than a hop, and a wall leaves no lane to dodge into.
    const extra = (hasTruck ? 0.7 : 0) + (count === 3 ? 0.35 : 0);
    this.untilNextRow = relSpeed * (gapTime + extra) + longest;
  }

  private pickType(level: number, rowSize: number): TrafficType {
    const r = Math.random();
    // Trucks make up ~28% of traffic at level 1, rising to ~45% by level 4.
    // Semis are never part of a full 3-lane wall, so there's always a way through.
    const semi = rowSize < 3 ? Math.min(0.25, 0.1 + level * 0.05) : 0;
    if (r < semi) return 'semi';
    if (r < semi + 0.2) return 'cybertruck';
    if (r < semi + 0.3) return 'cybercab';
    const cars: TrafficType[] = ['model3', 'modelY', 'modelS', 'modelX'];
    return cars[Math.floor(Math.random() * cars.length)];
  }

  private acquire(type: TrafficType): VehicleModel {
    const model = this.pool[type].pop() ?? buildTrafficCar(type);
    this.scene.add(model.group);
    return model;
  }

  private release(car: Car) {
    this.scene.remove(car.model.group);
    this.pool[car.type].push(car.model);
  }

  hits(player: Player): boolean {
    const p = player.model;
    const px = player.x;
    const py = player.y;
    for (const car of this.active) {
      const c = car.model;
      const cp = c.group.position;
      const overlapX = Math.abs(px - cp.x) < p.halfWidth + c.halfWidth - FORGIVE * 2;
      const overlapZ = Math.abs(cp.z) < p.length / 2 + c.length / 2 - FORGIVE * 2;
      const overlapY = py < c.height - FORGIVE || (TRUCKS.has(car.type) && !player.boosted);
      if (overlapX && overlapZ && overlapY) return true;
    }
    return false;
  }
}
