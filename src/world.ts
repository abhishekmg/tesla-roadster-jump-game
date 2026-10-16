import * as THREE from 'three';

export const LANES = [-3, 0, 3];
const ROAD_WIDTH = 10;
const ROAD_LENGTH = 420;
const DASH_CYCLE = 12;
const SCENERY_SPAN = 300;
const BARRIER_X = 5.6;
const WALL_X = 11;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// California freeway: concrete-gray asphalt, yellow left edge line,
// white right edge line, and Botts' dots instead of painted lane dashes.
function roadTexture(): THREE.CanvasTexture {
  const tex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#4a4b50';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      const v = 60 + Math.random() * 30;
      g.fillStyle = `rgb(${v},${v},${v + 3})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // Tire wear down the middle of each lane
    const toPx = (x: number) => ((x + ROAD_WIDTH / 2) / ROAD_WIDTH) * 256;
    g.fillStyle = 'rgba(25,25,30,0.18)';
    for (const lane of LANES) for (const o of [-0.8, 0.8]) g.fillRect(toPx(lane + o) - 6, 0, 12, 256);
    g.fillStyle = '#f2c230';
    g.fillRect(toPx(-4.7) - 3, 0, 6, 256);
    g.fillStyle = '#f0f0ea';
    g.fillRect(toPx(4.7) - 3, 0, 6, 256);
    for (const x of [-1.5, 1.5]) {
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(toPx(x), 16 + i * 26, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, ROAD_LENGTH / DASH_CYCLE);
  return tex;
}

function skyTexture(): THREE.CanvasTexture {
  return canvasTex(4, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#22306a');
    grad.addColorStop(0.4, '#8a5c96');
    grad.addColorStop(0.68, '#f2876a');
    grad.addColorStop(0.85, '#ffb27a');
    grad.addColorStop(1, '#ffd79a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 512);
  });
}

function windowsTexture(): THREE.CanvasTexture {
  const tex = canvasTex(64, 128, (g) => {
    g.fillStyle = '#3c4060';
    g.fillRect(0, 0, 64, 128);
    for (let y = 2; y < 128; y += 8) {
      for (let x = 2; x < 64; x += 8) {
        const r = Math.random();
        g.fillStyle = r < 0.35 ? '#ffd890' : r < 0.5 ? '#ffb070' : '#2a2e48';
        g.fillRect(x, y, 5, 5);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const SIGNS: [string, string, string][] = [
  ['405', 'NORTH', 'Santa Monica Blvd'],
  ['101', 'NORTH', 'Hollywood'],
  ['10', 'WEST', 'Santa Monica'],
  ['110', 'SOUTH', 'Downtown LA'],
  ['', 'EXIT 9A', 'Sunset Blvd'],
  ['405', 'SOUTH', 'LAX Airport'],
];

function signTexture([route, dir, dest]: [string, string, string]): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#0e6b3c';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#fff';
    g.lineWidth = 8;
    g.strokeRect(10, 10, 492, 236);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (route) {
      // Interstate-style shield
      g.beginPath();
      g.moveTo(170, 36);
      g.quadraticCurveTo(256, 56, 342, 36);
      g.quadraticCurveTo(352, 110, 256, 150);
      g.quadraticCurveTo(160, 110, 170, 36);
      g.fillStyle = '#1d4fa8';
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = '#fff';
      g.font = 'bold 56px Arial, sans-serif';
      g.fillText(route, 256, 92);
      g.font = 'bold 30px Arial, sans-serif';
      g.fillText(dir, 256, 176);
    } else {
      g.font = 'bold 40px Arial, sans-serif';
      g.fillText(dir, 256, 80);
    }
    g.font = '42px Arial, sans-serif';
    g.fillText(dest, 256, 220);
  });
}

export class World {
  private roadTex: THREE.CanvasTexture;
  private props: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0xe9a283, 70, 250);

    scene.add(new THREE.HemisphereLight(0xffe0c0, 0x5a4a5a, 1.3));
    const sun = new THREE.DirectionalLight(0xffb070, 2.4);
    sun.position.set(-10, 20, 14);
    sun.target.position.set(0, 0, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 30, bottom: -30, near: 1, far: 90 });
    scene.add(sun, sun.target);

    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false }),
    );
    sunDisc.position.set(70, 30, -470);
    scene.add(sunDisc);

    this.roadTex = roadTexture();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
      new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.85 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, -ROAD_LENGTH / 2 + 30);
    road.receiveShadow = true;
    scene.add(road);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, ROAD_LENGTH + 200),
      new THREE.MeshStandardMaterial({ color: 0x8c8a74, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -ROAD_LENGTH / 2 + 30;
    ground.receiveShadow = true;
    scene.add(ground);

    this.buildWalls(scene);
    this.buildSkyline(scene);
    this.buildScenery(scene);
  }

  /** Concrete K-rail barriers and sound walls run the full length, so they never need to scroll. */
  private buildWalls(scene: THREE.Scene) {
    const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c3b6, roughness: 0.95 });
    const shape = new THREE.Shape([
      new THREE.Vector2(-0.4, 0), new THREE.Vector2(0.4, 0), new THREE.Vector2(0.25, 0.3),
      new THREE.Vector2(0.12, 1.0), new THREE.Vector2(-0.12, 1.0), new THREE.Vector2(-0.25, 0.3),
    ]);
    const barrierGeo = new THREE.ExtrudeGeometry(shape, { depth: ROAD_LENGTH, bevelEnabled: false });
    for (const side of [-1, 1]) {
      const barrier = new THREE.Mesh(barrierGeo, concrete);
      barrier.position.set(side * BARRIER_X, 0, 30 - ROAD_LENGTH);
      barrier.castShadow = barrier.receiveShadow = true;
      scene.add(barrier);

      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 4.2, ROAD_LENGTH),
        new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 1 }),
      );
      wall.position.set(side * WALL_X, 2.1, 30 - ROAD_LENGTH / 2);
      wall.receiveShadow = true;
      scene.add(wall);
      // Ivy along the base of the sound wall
      const ivy = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.4, ROAD_LENGTH),
        new THREE.MeshStandardMaterial({ color: 0x3f6a34, roughness: 1 }),
      );
      ivy.position.set(side * (WALL_X - 0.8), 0.7, 30 - ROAD_LENGTH / 2);
      scene.add(ivy);
    }
  }

  /** Downtown LA skyline sits on the horizon and never scrolls, like the sun. */
  private buildSkyline(scene: THREE.Scene) {
    const winTex = windowsTexture();
    const hills = new THREE.MeshBasicMaterial({ color: 0x8a6a8e, fog: false });
    for (let i = 0; i < 9; i++) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(60 + Math.random() * 40, 30 + Math.random() * 25, 5), hills);
      hill.position.set(-260 + i * 65, 10, -520);
      scene.add(hill);
    }

    const addTower = (geo: THREE.BufferGeometry, x: number, z: number, h: number, w: number) => {
      const map = winTex.clone();
      map.repeat.set(Math.max(1, w / 14), Math.max(1, h / 28));
      const tower = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map, color: 0xb8a8c8, fog: false }),
      );
      tower.position.set(x, h / 2, z);
      scene.add(tower);
      return tower;
    };

    for (let i = 0; i < 26; i++) {
      const w = 8 + Math.random() * 10;
      const h = 20 + Math.random() * 55;
      const x = -70 + Math.random() * 140;
      addTower(new THREE.BoxGeometry(w, h, w), x, -400 - Math.random() * 40, h, w);
    }
    // Landmark towers: a round one with a crown, and a tall one with a spire.
    addTower(new THREE.CylinderGeometry(9, 10, 115, 16), -12, -405, 115, 30);
    const spireTower = addTower(new THREE.BoxGeometry(14, 105, 12), 16, -395, 105, 14);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 30, 4),
      new THREE.MeshBasicMaterial({ color: 0xd8d0e0, fog: false }),
    );
    spire.position.y = 67;
    spireTower.add(spire);
  }

  private buildScenery(scene: THREE.Scene) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a8d94, metalness: 0.6, roughness: 0.4 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffc870, emissiveIntensity: 2 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0xbdb6a8, roughness: 0.95 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6e52, roughness: 1, flatShading: true });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x3d6a2c, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });

    // Cobra-head street lights on the barriers
    for (let z = 0; z < SCENERY_SPAN; z += 36) {
      for (const side of [-1, 1]) {
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 9, 6), poleMat);
        pole.position.y = 4.5;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), poleMat);
        arm.position.set(-side * 1.0, 8.9, 0);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.35), lampMat);
        head.position.set(-side * 2.0, 8.8, 0);
        lamp.add(pole, arm, head);
        lamp.position.set(side * BARRIER_X, 1, -z + (side > 0 ? 18 : 0));
        this.addProp(scene, lamp);
      }
    }

    // Tall LA palms poking above the sound walls
    const palm = new THREE.Group();
    const trunkHeight = 16;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, trunkHeight, 7), trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    palm.add(trunk);
    const frondGeo = new THREE.ConeGeometry(0.5, 4, 3).rotateZ(-Math.PI / 2).translate(2, 0, 0).scale(1, 0.25, 1);
    for (let i = 0; i < 9; i++) {
      const pivot = new THREE.Group();
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.rotation.z = -0.35 - Math.random() * 0.35;
      pivot.add(frond);
      pivot.rotation.y = (i / 9) * Math.PI * 2;
      pivot.position.y = trunkHeight;
      palm.add(pivot);
    }
    for (let i = 0; i < 44; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const p = palm.clone();
      p.scale.setScalar(0.75 + Math.random() * 0.5);
      p.rotation.set((Math.random() - 0.5) * 0.08, Math.random() * Math.PI, side * (0.02 + Math.random() * 0.05));
      p.position.set(side * (13 + Math.random() * 14), 0, -Math.random() * SCENERY_SPAN);
      this.addProp(scene, p);
    }

    // Overhead green freeway sign gantries
    for (let i = 0; i < 3; i++) {
      const gantry = new THREE.Group();
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 0.4), poleMat);
        post.position.set(side * (BARRIER_X + 0.2), 5, 0);
        gantry.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(BARRIER_X * 2 + 0.8, 0.5, 0.5), poleMat);
      beam.position.y = 9.6;
      gantry.add(beam);
      for (const x of [-2.4, 2.4]) {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(4.4, 2.2),
          new THREE.MeshStandardMaterial({ map: signTexture(SIGNS[(i * 2 + (x > 0 ? 1 : 0)) % SIGNS.length]), roughness: 0.6 }),
        );
        sign.position.set(x, 9.4, 0.3);
        gantry.add(sign);
      }
      gantry.position.z = -40 - i * 100;
      this.addProp(scene, gantry);
    }

    // Overpasses
    for (let i = 0; i < 2; i++) {
      const bridge = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(40, 1.6, 9), concrete);
      deck.position.y = 11.5;
      deck.castShadow = true;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 0.4), concrete);
      rail.position.set(0, 12.8, 4.3);
      bridge.add(deck, rail);
      for (const x of [-8.5, 8.5]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 11, 6), concrete);
        pier.position.set(x, 5.5, 0);
        pier.castShadow = true;
        bridge.add(pier);
      }
      bridge.position.z = -90 - i * 150;
      this.addProp(scene, bridge);
    }
  }

  private addProp(scene: THREE.Scene, obj: THREE.Object3D) {
    scene.add(obj);
    this.props.push(obj);
  }

  /** Scroll the world toward the camera by `dz` units. */
  update(dz: number) {
    this.roadTex.offset.y = (this.roadTex.offset.y + dz / DASH_CYCLE) % 1;
    for (const p of this.props) {
      p.position.z += dz;
      if (p.position.z > 40) p.position.z -= SCENERY_SPAN;
    }
  }
}
