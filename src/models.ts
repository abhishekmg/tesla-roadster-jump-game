import * as THREE from 'three';

// All vehicles face -Z (forward). Profiles are drawn in (forward, up) space
// and extruded across the car's width.

export const TRAFFIC_TYPES = ['model3', 'modelY', 'modelS', 'modelX', 'cybertruck', 'cybercab', 'semi'] as const;
export type TrafficType = (typeof TRAFFIC_TYPES)[number];

export interface VehicleModel {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  /** Collision half-width (x), full length (z) and height (y). */
  halfWidth: number;
  length: number;
  height: number;
}

const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.3 });
const spokeMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.5, roughness: 0.4 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.7, roughness: 0.12 });
const tintMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.7, roughness: 0.15 });
// Unlit and un-tonemapped so it stays a true deep red under the warm sun.
const tailMat = new THREE.MeshBasicMaterial({ color: 0xe3000f, toneMapped: false });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.6 });

function extrude(points: [number, number][], width: number, mat: THREE.Material, bevel = 0.06): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  // Map shape u (forward) to world -Z and extrusion depth to world X.
  geo.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function addWheel(group: THREE.Group, wheels: THREE.Object3D[], x: number, z: number, r: number, w: number, spokes = 0) {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(wheelGeo, tireMat);
  tire.scale.set(w, r, r);
  tire.castShadow = true;
  const rim = new THREE.Mesh(wheelGeo, rimMat);
  rim.scale.set(w + 0.02, r * 0.68, r * 0.68);
  wheel.add(tire, rim);
  // `spokes` dark bars through the hub (so 3 → six blades) over a silver disc, like the new Roadster's wheels.
  const face = Math.sign(x) * (w / 2 + 0.02);
  for (let i = 0; i < spokes; i++) {
    const spoke = box(0.03, r * 1.25, 0.07, spokeMat, face, 0, 0);
    spoke.rotation.x = (i / spokes) * Math.PI;
    wheel.add(spoke);
  }
  wheel.position.set(x, r, z);
  group.add(wheel);
  wheels.push(wheel);
}

function paint(color: number, metalness = 0.5, flat = false) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.32, flatShading: flat });
}

function plateTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9e9e6';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#8a8a88';
  g.font = 'bold 34px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Next-gen Roadster: faceted pearl-white wedge, wraparound tinted canopy,
 * big rear wing, full-width red light bar and a dark fan/thruster diffuser.
 */
export function buildRoadster(): VehicleModel {
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const width = 2.0;
  const pearl = paint(0xe6e7ea, 0.35, true);

  // Lower body: sharp low nose, long flat flanks, wide hips.
  group.add(extrude(
    [[-2.25, 0.3], [2.05, 0.3], [2.3, 0.42], [2.28, 0.58], [1.35, 0.76], [-0.6, 0.8], [-2.25, 0.84]],
    width, pearl, 0.05,
  ));
  // Rear haunches rising behind the cabin.
  group.add(extrude(
    [[-0.55, 0.78], [-2.25, 0.82], [-2.25, 1.08], [-1.5, 1.1], [-0.75, 1.0]],
    1.86, pearl, 0.04,
  ));
  // Wraparound tinted canopy.
  group.add(extrude(
    [[1.4, 0.74], [0.35, 1.08], [-0.55, 1.2], [-1.45, 1.1], [-1.05, 0.8]],
    1.5, tintMat, 0.04,
  ));
  // Black rocker skirt
  group.add(box(width + 0.02, 0.12, 3.6, darkMat, 0, 0.32, 0));

  // Rear end, modeled on the reveal car: red light bar along the top edge, a
  // pearl panel with the ROSTR plate, then a tall black diffuser holding four
  // thruster nozzles over four caged fans, with dark corners either side.
  const rear = new THREE.Group();
  rear.position.z = 2.3;
  group.add(rear);
  const steel = new THREE.MeshStandardMaterial({ color: 0xa8acb4, metalness: 0.9, roughness: 0.3 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.55, metalness: 0.4 });

  // Black lower corners that wrap around the bumper.
  for (const side of [-1, 1]) {
    rear.add(box(0.3, 0.58, 0.5, darkMat, side * 0.88, 0.59, -0.2));
    for (let i = 0; i < 3; i++) rear.add(box(0.2, 0.03, 0.02, housing, side * 0.88, 0.45 + i * 0.12, 0.06));
  }
  // Diffuser block spanning the full lower rear.
  rear.add(box(1.5, 0.58, 0.28, darkMat, 0, 0.59, 0.0));
  rear.add(box(1.96, 0.04, 0.3, housing, 0, 0.86, 0.02));
  // Trapezoid frame around the nozzle row (wider at the bottom).
  rear.add(box(1.2, 0.035, 0.03, housing, 0, 0.61, 0.15));
  rear.add(box(1.08, 0.035, 0.03, housing, 0, 0.84, 0.15));
  for (const side of [-1, 1]) {
    const post = box(0.035, 0.25, 0.03, housing, side * 0.57, 0.725, 0.15);
    post.rotation.z = side * 0.2;
    rear.add(post);
  }
  const ringGeo = new THREE.TorusGeometry(0.045, 0.014, 8, 18);
  const boreGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.14, 14).rotateX(Math.PI / 2);
  const fanRingGeo = new THREE.TorusGeometry(0.095, 0.018, 8, 20);
  const fanDiscGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 16).rotateX(Math.PI / 2);
  const hubGeo = new THREE.SphereGeometry(0.022, 10, 8);
  for (const x of [-0.42, -0.14, 0.14, 0.42]) {
    const ring = new THREE.Mesh(ringGeo, steel);
    ring.position.set(x, 0.73, 0.16);
    const bore = new THREE.Mesh(boreGeo, housing);
    bore.position.set(x, 0.73, 0.1);
    rear.add(ring, bore);
    const cage = new THREE.Mesh(fanRingGeo, housing);
    cage.position.set(x, 0.46, 0.15);
    const disc = new THREE.Mesh(fanDiscGeo, darkMat);
    disc.position.set(x, 0.46, 0.13);
    const hub = new THREE.Mesh(hubGeo, housing);
    hub.position.set(x, 0.46, 0.16);
    rear.add(cage, disc, hub);
    for (let i = 0; i < 3; i++) {
      const blade = box(0.16, 0.02, 0.02, housing, x, 0.46, 0.155);
      blade.rotation.z = (i * Math.PI) / 3;
      rear.add(blade);
    }
  }
  // Dividers between the fans
  for (const x of [-0.28, 0, 0.28]) rear.add(box(0.03, 0.22, 0.03, housing, x, 0.46, 0.15));

  // Plate on the pearl panel, and the light bar along the top edge.
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.2),
    new THREE.MeshStandardMaterial({ map: plateTexture('ROSTR'), roughness: 0.5 }),
  );
  plate.position.set(0, 0.98, 0.005);
  rear.add(plate);
  rear.add(box(1.94, 0.08, 0.12, tailMat, 0, 1.12, -0.02));
  for (const side of [-1, 1]) rear.add(box(0.08, 0.08, 0.3, tailMat, side * 0.97, 1.12, -0.2));

  // Side thrusters hanging just inboard of the rear wheels.
  const sideNozzle = new THREE.CylinderGeometry(0.05, 0.06, 0.32, 10);
  for (const side of [-1, 1]) {
    const n = new THREE.Mesh(sideNozzle, steel);
    n.position.set(side * 0.78, 0.34, 2.05);
    group.add(n);
  }

  // Wide, flat rear wing on two swan-neck stalks, with end plates hanging down.
  const wingMat = paint(0xdddbd6, 0.55);
  const wing = new THREE.Group();
  wing.position.set(0, 1.27, 1.74);
  wing.rotation.x = -0.08;
  group.add(wing);
  const plane = box(2.1, 0.05, 0.7, wingMat, 0, 0, 0);
  plane.castShadow = true;
  wing.add(plane);
  for (const side of [-1, 1]) {
    const tip = box(0.2, 0.05, 0.7, wingMat, side * 1.13, -0.04, 0);
    tip.rotation.z = -side * 0.4;
    wing.add(tip);
    const fin = box(0.04, 0.26, 0.62, wingMat, side * 1.24, -0.16, 0);
    fin.rotation.z = -side * 0.12;
    wing.add(fin);
    const stalk = box(0.06, 0.18, 0.12, housing, side * 0.45, 1.18, 1.7);
    stalk.rotation.x = 0.2;
    group.add(stalk);
  }
  // Dark recess under the wing
  group.add(box(1.4, 0.03, 0.5, housing, 0, 1.11, 1.7));

  // Front LED bar and triangular headlights (seen when the car spins out).
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 });
  group.add(box(1.4, 0.03, 0.03, ledMat, 0, 0.56, -2.29));
  for (const side of [-1, 1]) group.add(box(0.22, 0.06, 0.04, ledMat, side * 0.75, 0.66, -2.12));

  // Amber side markers behind the front wheels
  const amber = new THREE.MeshStandardMaterial({ color: 0xff8a20, emissive: 0xff7010, emissiveIntensity: 1.2 });
  for (const side of [-1, 1]) group.add(box(0.02, 0.04, 0.28, amber, side * 1.01, 0.66, -0.8));

  for (const x of [-1.0, 1.0]) {
    addWheel(group, wheels, x, -1.4, 0.4, 0.32, 3);
    addWheel(group, wheels, x * 1.03, 1.42, 0.42, 0.46, 3);
  }
  return { group, wheels, halfWidth: 0.98, length: 4.55, height: 1.3 };
}

const TESLA_PAINT = [0xf2f2f2, 0x111216, 0x1c3270, 0xa3111b, 0x3c3f45, 0x9da2a8, 0x55595f, 0xf2f2f2];
const randomPaint = () => TESLA_PAINT[Math.floor(Math.random() * TESLA_PAINT.length)];

interface CarSpec {
  length: number;
  width: number;
  belt: number; // top of the doors
  roof: number;
  hood: number; // nose to windshield base
  roofPeak: number; // u of the highest roof point
  tail: [number, number]; // where the glass meets the rear deck
  wheelR: number;
  lightBar: boolean;
}

const CAR_SPECS: Record<'model3' | 'modelY' | 'modelS' | 'modelX', CarSpec> = {
  model3: { length: 4.7, width: 1.86, belt: 0.95, roof: 1.44, hood: 1.25, roofPeak: 0.1, tail: [-1.75, 1.0], wheelR: 0.37, lightBar: true },
  modelY: { length: 4.75, width: 1.92, belt: 1.05, roof: 1.62, hood: 1.2, roofPeak: 0.0, tail: [-1.95, 1.22], wheelR: 0.39, lightBar: true },
  modelS: { length: 5.0, width: 1.96, belt: 0.95, roof: 1.43, hood: 1.4, roofPeak: 0.0, tail: [-2.15, 1.05], wheelR: 0.38, lightBar: false },
  modelX: { length: 5.05, width: 2.0, belt: 1.1, roof: 1.68, hood: 1.3, roofPeak: 0.3, tail: [-2.1, 1.3], wheelR: 0.41, lightBar: false },
};

function buildTeslaCar(spec: CarSpec): VehicleModel {
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const { length: L, width: W, belt, roof, hood, roofPeak, tail, wheelR } = spec;
  const h = L / 2;
  group.add(extrude(
    [[-h, 0.32], [h - 0.15, 0.3], [h, 0.55], [h - 0.2, 0.72], [h - hood, belt - 0.05], [-h + 0.15, belt + 0.03], [-h, belt - 0.22]],
    W, paint(randomPaint()), 0.08,
  ));
  // Teslas are all-glass on top.
  group.add(extrude(
    [[h - hood + 0.05, belt - 0.08], [roofPeak + 0.6, roof - 0.04], [roofPeak - 0.5, roof], [tail[0] + 0.35, tail[1] + 0.12], [tail[0], tail[1]], [-h + 0.3, belt]],
    W - 0.26, glassMat, 0.06,
  ));
  const rearZ = h + 0.1; // past the extrusion bevel
  if (spec.lightBar) {
    group.add(box(W - 0.2, 0.05, 0.05, tailMat, 0, belt - 0.1, rearZ));
  } else {
    for (const side of [-1, 1]) group.add(box(0.5, 0.12, 0.05, tailMat, side * (W / 2 - 0.3), belt - 0.12, rearZ));
  }
  group.add(box(W - 0.3, 0.14, 0.06, darkMat, 0, 0.4, rearZ));
  const axle = h - 0.95;
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
    addWheel(group, wheels, x, -axle, wheelR, 0.3);
    addWheel(group, wheels, x, axle, wheelR, 0.3);
  }
  return { group, wheels, halfWidth: W / 2, length: L, height: roof };
}

export function buildTrafficCar(type: TrafficType): VehicleModel {
  if (type === 'model3' || type === 'modelY' || type === 'modelS' || type === 'modelX') {
    return buildTeslaCar(CAR_SPECS[type]);
  }

  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];

  if (type === 'cybercab') {
    // Two-seat teardrop robotaxi in champagne gold, rear window-less.
    const width = 1.95;
    const gold = paint(0xc9b48a, 0.75);
    group.add(extrude(
      [[-2.1, 0.3], [2.0, 0.3], [2.15, 0.55], [1.2, 0.85], [-1.9, 0.92], [-2.15, 0.7]],
      width, gold, 0.1,
    ));
    group.add(extrude([[1.15, 0.82], [0.2, 1.42], [-0.6, 1.4], [-0.3, 0.88]], width - 0.3, glassMat, 0.06));
    group.add(extrude([[-0.25, 0.88], [-0.65, 1.4], [-1.2, 1.3], [-1.95, 0.9]], width - 0.25, gold, 0.06));
    group.add(box(width - 0.15, 0.05, 0.05, tailMat, 0, 0.82, 2.27));
    for (const x of [-0.95, 0.95]) {
      addWheel(group, wheels, x, -1.35, 0.38, 0.3);
      addWheel(group, wheels, x, 1.35, 0.38, 0.3);
    }
    return { group, wheels, halfWidth: 0.97, length: 4.3, height: 1.42 };
  }

  if (type === 'cybertruck') {
    const width = 2.1;
    const steel = new THREE.MeshStandardMaterial({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3, flatShading: true });
    group.add(extrude(
      [[-2.85, 0.5], [2.8, 0.5], [2.85, 1.05], [0.15, 1.95], [-2.85, 1.25]],
      width, steel, 0.02,
    ));
    const win = extrude([[1.2, 1.55], [0.15, 1.9], [-1.1, 1.62], [0.0, 1.5]], width - 0.25, glassMat, 0.02);
    win.position.y = 0.04;
    group.add(win);
    group.add(box(width - 0.1, 0.04, 0.05, tailMat, 0, 1.15, 2.9));
    group.add(box(width + 0.04, 0.35, 5.6, darkMat, 0, 0.55, 0));
    for (const x of [-1.0, 1.0]) {
      addWheel(group, wheels, x, -1.9, 0.48, 0.38);
      addWheel(group, wheels, x, 1.9, 0.48, 0.38);
    }
    return { group, wheels, halfWidth: 1.05, length: 5.7, height: 1.95 };
  }

  // Semi: cab in front, long box trailer behind.
  const width = 2.4;
  const cabMat = paint(0xe9ebee, 0.3);
  group.add(extrude(
    [[-1.4, 0.7], [1.6, 0.7], [1.7, 1.6], [0.7, 3.0], [-1.4, 3.0]],
    width, cabMat, 0.06,
  ).translateZ(-4.2));
  const shield = extrude([[1.55, 1.75], [0.75, 2.85], [0.4, 2.7], [1.2, 1.7]], width - 0.3, glassMat, 0.02);
  shield.translateZ(-4.2);
  group.add(shield);
  const trailer = box(width, 2.55, 8.2, paint(0xd8dadd, 0.2), 0, 1.95, 1.3);
  trailer.castShadow = true;
  group.add(trailer);
  group.add(box(width + 0.02, 0.25, 8.0, new THREE.MeshStandardMaterial({ color: 0xc8102e }), 0, 1.2, 1.3));
  group.add(box(width - 0.4, 0.35, 11, darkMat, 0, 0.6, -0.2));
  // Trailer rear, the part you actually see: split doors with lock bars,
  // red/white reflective tape, an underride guard, mud flaps and taillights.
  const rearZ = 5.42;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8e9196, metalness: 0.7, roughness: 0.4 });
  const tapeRed = new THREE.MeshBasicMaterial({ color: 0xd0101c });
  const tapeWhite = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
  group.add(box(width, 0.12, 0.06, frameMat, 0, 3.17, rearZ));
  group.add(box(width, 0.12, 0.06, frameMat, 0, 0.73, rearZ));
  for (const side of [-1, 1]) group.add(box(0.1, 2.5, 0.06, frameMat, side * (width / 2 - 0.05), 1.95, rearZ));
  group.add(box(0.05, 2.32, 0.05, darkMat, 0, 1.95, rearZ + 0.01));
  for (const x of [-0.85, -0.3, 0.3, 0.85]) {
    group.add(box(0.05, 2.2, 0.06, frameMat, x, 1.95, rearZ + 0.03));
    group.add(box(0.14, 0.05, 0.08, frameMat, x, 1.2, rearZ + 0.05));
  }
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const w = (width - 0.1) / segs;
    group.add(box(w, 0.08, 0.02, i % 2 ? tapeWhite : tapeRed, -width / 2 + 0.05 + w * (i + 0.5), 0.86, rearZ + 0.04));
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      group.add(box(0.07, 0.36, 0.02, i % 2 ? tapeWhite : tapeRed, side * (width / 2 - 0.05), 1.12 + i * 0.38, rearZ + 0.04));
    }
  }
  // Underride guard with its own reflective stripes, hanging below the floor.
  for (const side of [-1, 1]) group.add(box(0.08, 0.35, 0.08, frameMat, side * 0.75, 0.52, rearZ - 0.1));
  for (let i = 0; i < 6; i++) {
    const w = (width - 0.3) / 6;
    group.add(box(w, 0.12, 0.1, i % 2 ? tapeWhite : tapeRed, -(width - 0.3) / 2 + w * (i + 0.5), 0.36, rearZ - 0.05));
  }
  for (const side of [-1, 1]) {
    group.add(box(0.5, 0.55, 0.03, darkMat, side * 0.98, 0.42, rearZ - 0.45));
    group.add(box(0.3, 0.16, 0.05, tailMat, side * (width / 2 - 0.3), 0.6, rearZ + 0.02));
  }
  for (const x of [-1.05, 1.05]) {
    for (const z of [-4.8, -2.4, 3.6, 4.6]) addWheel(group, wheels, x, z, 0.5, 0.4);
  }
  return { group, wheels, halfWidth: 1.2, length: 11, height: 3.2 };
}
