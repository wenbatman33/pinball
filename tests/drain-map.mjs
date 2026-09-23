// 發射後不操作 / 隨機操作擋板：統計球最後從哪裡出界（左 outlane / 中央 / 右 outlane）
import { PinballPhysics } from '../src/physics.js';
import { PHYS_DEFAULT, LAYOUT_DEFAULT, BALL_START } from '../src/table.js';
const clone = (o) => JSON.parse(JSON.stringify(o));
let seed = 3;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const N = +(process.argv[2] || 200);
const res = { leftOut: 0, center: 0, rightOut: 0, timeout: 0 };
let totalLife = 0;
for (let i = 0; i < N; i++) {
  const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
  const b = sim.addBall(BALL_START.x, BALL_START.y);
  for (let t = 0; t < 20; t++) sim.step();
  sim.plungerHold(true);
  const hold = Math.round((0.4 + rnd() * 0.6) * 1.1 * 120);
  for (let t = 0; t < hold; t++) sim.step();
  sim.plungerHold(false);
  let lastX = b.x, t = 0, lp = false, rp = false;
  for (; t < 120 * 60 && b.alive; t++) {
    // 簡單機器人：球靠近擋板時拍擊
    const nearL = b.y > 930 && b.y < 1010 && b.x > 190 && b.x < 290;
    const nearR = b.y > 930 && b.y < 1010 && b.x > 302 && b.x < 402;
    const wantL = nearL && rnd() < 0.25, wantR = nearR && rnd() < 0.25;
    if (wantL !== lp) { lp = wantL || (lp && rnd() < 0.9); sim.setFlipper('L', lp); }
    if (wantR !== rp) { rp = wantR || (rp && rnd() < 0.9); sim.setFlipper('R', rp); }
    lastX = b.x;
    sim.step(); sim.events.length = 0;
  }
  totalLife += t / 120;
  if (b.alive) res.timeout++;
  else if (lastX < 70) res.leftOut++;
  else if (lastX > 522) res.rightOut++;
  else res.center++;
}
console.log({ balls: N, ...res, avgLifeSec: +(totalLife / N).toFixed(1) });
