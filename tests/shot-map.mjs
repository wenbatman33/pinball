// 擋板出球統計（蒙地卡羅）：隨機來球 + 球在擋板上時隨機時機出手 → 統計命中分佈
import { PinballPhysics, closestOnSeg } from '../src/physics.js';
import { PHYS_DEFAULT, LAYOUT_DEFAULT } from '../src/table.js';
const clone = (o) => JSON.parse(JSON.stringify(o));
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const N = +(process.argv[2] || 600);
const hits = {}, byFlip = { L: 0, R: 0 };
let flips = 0;
for (let i = 0; i < N; i++) {
  const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
  // 來球：inlane 或台面中下方隨機
  const src = rnd();
  const b = src < 0.35 ? sim.addBall(rnd() < 0.5 ? 90 : 502, 800, 0, rnd() * 300)
    : sim.addBall(180 + rnd() * 232, 700 + rnd() * 120, (rnd() - 0.5) * 500, rnd() * 400);
  let flipped = null, first = null, delay = -1;
  for (let t = 0; t < 360 && b.alive; t++) {
    if (!flipped) {
      for (const f of sim.flippers.slice(0, 2)) {
        const G = sim.flipperGeom(f);
        const q = closestOnSeg(b.x, b.y, G.x, G.y, G.tx, G.ty);
        if (Math.hypot(b.x - q.x, b.y - q.y) < 26 && b.y < q.y) {
          if (delay < 0) delay = Math.floor(rnd() * 14);
          if (delay-- === 0) { sim.setFlipper(f.side, true); flipped = f.side; flips++; byFlip[f.side]++; }
        }
      }
    }
    sim.step();
    for (const e of sim.events) {
      if (!flipped || first) continue;
      if (['bumper', 'drop', 'target', 'rampEnter', 'saucer', 'sling', 'spinHit'].includes(e.type)) first = e.type === 'rampEnter' ? 'rampEnter' : e.type;
      if (e.type === 'sensor' && e.id.startsWith('orbit')) first = 'orbit';
    }
    for (const e of sim.events) if (e.type === 'ramp' && flipped) first = 'RAMP_MADE';
    sim.events.length = 0;
    if (first === 'RAMP_MADE') break;
  }
  if (flipped) hits[first || 'none'] = (hits[first || 'none'] || 0) + 1;
}
const pct = Object.fromEntries(Object.entries(hits).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, (v / flips * 100).toFixed(1) + '%']));
console.log({ flips, ...pct });
