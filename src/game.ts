import * as THREE from 'three';
import { track } from '@vercel/analytics';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Particles } from './particles';
import { Player } from './player';
import { Traffic, TRAFFIC_SPEED } from './traffic';
import { World } from './world';

type State = 'menu' | 'playing' | 'crashed';

const START_SPEED = 30;
const MAX_SPEED = 72;
/** Difficulty steps up every this many seconds. */
const LEVEL_SECONDS = 30;
const SPEED_PER_LEVEL = 7;
const BEST_KEY = 'roadster-runner-best';

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    // Storage blocked: best score just won't persist.
  }
}

const $ = (id: string) => document.getElementById(id)!;

/** Phones and tablets: touch controls, lighter rendering. */
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;
/** Finger travel (px) that counts as a swipe rather than a tap. */
const SWIPE_PX = 28;
const TAP_MAX_MS = 300;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  private world: World;
  private particles: Particles;
  private player: Player;
  private traffic: Traffic;

  private state: State = 'menu';
  private speed = START_SPEED;
  private distance = 0;
  private elapsed = 0;
  private level = 0;
  private best = loadBest();
  private crashTime = 0;
  private shake = 0;
  private camLook = new THREE.Vector3(0, 1, -12);
  /** Chase-camera distance multiplier; >1 on tall portrait screens so all three lanes fit. */
  private camScale = 1;

  private ui = {
    hud: $('hud'),
    score: $('score'),
    best: $('best'),
    speed: $('speed'),
    level: $('level'),
    levelBar: $('level-bar'),
    levelUp: $('levelup'),
    finalLevel: $('final-level'),
    menu: $('menu'),
    over: $('gameover'),
    finalScore: $('final-score'),
    finalBest: $('final-best'),
    newBest: $('new-best'),
    menuBest: $('menu-best'),
  };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Phones have very dense screens; 1.5x keeps it sharp without cooking the GPU.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    // Reflections so metallic paint and glass don't render black.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.world = new World(this.scene);
    this.particles = new Particles(this.scene);
    this.player = new Player(this.scene, this.particles);
    this.traffic = new Traffic(this.scene);
    this.camera.position.set(0, 3.6, 8.5);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.bindTouch();
    $('start-btn').addEventListener('click', () => this.start());
    $('restart-btn').addEventListener('click', () => this.start());
    this.renderBest();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Narrow screens: widen the lens and pull the camera back/up so all three lanes stay visible.
    const aspect = w / h;
    this.camera.fov = aspect < 0.9 ? 78 : 62;
    this.camScale = aspect < 0.9 ? THREE.MathUtils.clamp(0.75 / aspect, 1, 1.65) : 1;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Touch controls: swipe left/right to change lanes (and barrel-roll mid-air),
   * tap or swipe up to hop (again mid-air to boost), swipe down to drop fast.
   * Swipes fire as soon as the finger has moved far enough, so they feel instant.
   */
  private bindTouch() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let used = false;
    const onButton = (e: TouchEvent) => (e.target as Element | null)?.closest('button') != null;

    window.addEventListener('touchstart', (e) => {
      if (onButton(e)) return;
      e.preventDefault(); // no scrolling, zooming or emulated mouse clicks
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = performance.now();
      used = false;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (onButton(e)) return;
      e.preventDefault();
      if (used || this.state !== 'playing') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      used = true;
      if (Math.abs(dx) > Math.abs(dy)) this.player.move(dx < 0 ? -1 : 1);
      else if (dy < 0) this.player.jump();
      else this.player.fastFall();
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (onButton(e) || used) return;
      e.preventDefault();
      if (performance.now() - startTime > TAP_MAX_MS) return;
      if (this.state === 'playing') this.player.jump();
      else if (this.state === 'menu' || performance.now() - this.crashTime > 700) this.start();
    }, { passive: false });
  }

  private onKey(e: KeyboardEvent) {
    const k = e.code;
    if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;

    if (this.state !== 'playing') {
      const canRestart = this.state === 'menu' || performance.now() - this.crashTime > 700;
      if ((k === 'Space' || k === 'Enter') && canRestart) this.start();
      return;
    }
    if (k === 'ArrowLeft' || k === 'KeyA') this.player.move(-1);
    else if (k === 'ArrowRight' || k === 'KeyD') this.player.move(1);
    else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') this.player.jump();
    else if (k === 'ArrowDown' || k === 'KeyS') this.player.fastFall();
  }

  private start() {
    track('game_start');
    this.state = 'playing';
    this.speed = START_SPEED;
    this.distance = 0;
    this.elapsed = 0;
    this.level = 0;
    this.ui.level.textContent = '1';
    this.ui.levelUp.classList.remove('show');
    this.shake = 0;
    this.player.reset();
    this.traffic.reset(START_SPEED - TRAFFIC_SPEED);
    this.particles.clear();
    this.ui.menu.hidden = true;
    this.ui.over.hidden = true;
    this.ui.hud.hidden = false;
  }

  private crash() {
    this.state = 'crashed';
    this.crashTime = performance.now();
    this.shake = 1;
    this.player.crash();
    const score = Math.floor(this.distance);
    const isBest = score > this.best;
    if (isBest) {
      this.best = score;
      saveBest(score);
    }
    this.ui.finalScore.textContent = String(score);
    this.ui.finalLevel.textContent = String(this.level + 1);
    this.ui.newBest.hidden = !isBest;
    this.renderBest();
    window.setTimeout(() => {
      if (this.state === 'crashed') this.ui.over.hidden = false;
    }, 900);
  }

  private levelUp(level: number) {
    this.level = level;
    this.ui.level.textContent = String(level + 1);
    const el = this.ui.levelUp;
    el.textContent = `Level ${level + 1}`;
    el.dataset.sub = this.speed < MAX_SPEED - 1 ? 'Faster · more traffic' : 'More traffic';
    // Restart the CSS animation.
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  private renderBest() {
    const b = String(this.best);
    this.ui.best.textContent = b;
    this.ui.finalBest.textContent = b;
    this.ui.menuBest.textContent = b;
  }

  update(dt: number) {
    if (this.state === 'playing') {
      this.elapsed += dt;
      const level = Math.floor(this.elapsed / LEVEL_SECONDS);
      if (level > this.level) this.levelUp(level);
      // Ease into each new level's speed over a couple of seconds rather than jumping.
      const target = Math.min(MAX_SPEED, START_SPEED + this.level * SPEED_PER_LEVEL);
      this.speed += (target - this.speed) * Math.min(1, dt * 0.9);
      this.ui.levelBar.style.width = `${((this.elapsed % LEVEL_SECONDS) / LEVEL_SECONDS) * 100}%`;
    } else if (this.state === 'crashed') {
      this.speed = Math.max(0, this.speed - 90 * dt);
    } else {
      this.speed = 14; // idle cruise behind the menu
    }

    const relSpeed = Math.max(0, this.speed - TRAFFIC_SPEED);
    const dz = this.speed * dt;
    this.world.update(dz);
    this.player.update(dt, this.speed);
    this.particles.update(dt, dz);

    if (this.state === 'playing') {
      this.distance += dz;
      this.traffic.update(dt, relSpeed, this.level);
      if (this.traffic.hits(this.player)) this.crash();
      this.ui.score.textContent = String(Math.floor(this.distance));
      this.ui.speed.textContent = String(Math.round(this.speed * 3.2));
    } else if (this.state === 'crashed') {
      this.traffic.update(dt, 0, this.level);
    }

    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    const px = this.player.x;
    const py = this.state === 'crashed' ? 0 : this.player.y;
    const k = Math.min(1, dt * 6);
    const s = this.camScale;
    const target = new THREE.Vector3(px * 0.7, 3.6 * s + py * 0.55, 8.5 * s + (this.speed - START_SPEED) * 0.02);
    this.camera.position.lerp(target, k);
    this.camLook.lerp(new THREE.Vector3(px * 0.85, 1.1 + py * 0.6, -14), k);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * this.shake * 0.6;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
