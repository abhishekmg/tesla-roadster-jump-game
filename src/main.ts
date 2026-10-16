import './style.css';
import { inject } from '@vercel/analytics';
import { Game } from './game';

inject();

const game = new Game(document.getElementById('app')!);
if (import.meta.env.DEV) Object.assign(window, { game });

let last = performance.now();
function frame(now: number) {
  // Clamp so a background tab doesn't teleport the car through traffic.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
