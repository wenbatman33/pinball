// 物理壓力測試：隨機大量球、隨機擋板操作，驗證
//  1. 不穿牆（最大穿透量）
//  2. 不離開台面、不從台面穿進發射道
//  3. 速度不爆衝
//  4. 發射力道：滿力可上頂、弱力會落回
import { PinballPhysics, closestOnSeg, closestOnArc, TICK } from '../src/physics.js';
import { PHYS_DEFAULT, LAYOUT_DEFAULT, ARC_C, ARC_R, BALL_START } from '../src/table.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function maxPenetration(sim, b) {
  const rb = sim.P.ballRadius;
  let worst = 0, what = '';
  const chk = (d, R, name) => { if (R - d > worst) { worst = R - d; what = name; } };
  for (const w of sim.walls) {
    if (w.type === 'arc') { const q = closestOnArc(b.x, b.y, w); chk(Math.hypot(b.x - q.x, b.y - q.y), rb + w.r, 'arc'); }
    else if (w.type === 'gate') continue;
    else { const q = closestOnSeg(b.x, b.y, w.ax, w.ay, w.bx, w.by); chk(Math.hypot(b.x - q.x, b.y - q.y), rb + w.r, `seg(${w.ax},${w.ay})`); }
  }
  for (const m of sim.bumpers) chk(Math.hypot(b.x - m.x, b.y - m.y), rb + m.r, m.id);
  for (const s of sim.slingSegs) { const q = closestOnSeg(b.x, b.y, s.ax, s.ay, s.bx, s.by); chk(Math.hypot(b.x - q.x, b.y - q.y), rb + s.r, s.id); }
  for (const t of sim.targets) { const q = closestOnSeg(b.x, b.y, t.ax, t.ay, t.bx, t.by); chk(Math.hypot(b.x - q.x, b.y - q.y), rb + t.r, t.id); }
  return { worst, what };
}

function pointInTri(px, py, s) {
  const d = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = d(px, py, s.ax, s.ay, s.bx, s.by), d2 = d(px, py, s.bx, s.by, s.cx, s.cy), d3 = d(px, py, s.cx, s.cy, s.ax, s.ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// ---------- 測試 1：隨機混沌 ----------
function chaos(minutes) {
  const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
  const ticks = Math.round((minutes * 60) / TICK);
  let worst = 0, worstWhat = '', escapes = 0, laneCross = 0, maxSp = 0, spawned = 0, inTri = 0;
  const spawn = () => {
    // 在台面上半部隨機位置、隨機高速
    for (let k = 0; k < 50; k++) {
      const x = 60 + rnd() * 470, y = 150 + rnd() * 600;
      const b = sim.addBall(x, y, (rnd() - 0.5) * 6000, (rnd() - 0.5) * 6000);
      if (maxPenetration(sim, b).worst <= 0 && sim.balls.every((o) => o === b || Math.hypot(o.x - x, o.y - y) > 30)) { spawned++; return; }
      sim.balls.pop();
    }
  };
  for (let i = 0; i < 3; i++) spawn();
  let lp = true, rp = false;
  for (let t = 0; t < ticks; t++) {
    // 機器人：球接近擋板時拍擊 + 隨機
    const near = (side) => sim.balls.some((b) => b.y > 900 && b.y < 1040 && (side === 'L' ? b.x < 296 : b.x >= 296) && b.x < 572);
    if (rnd() < 0.08) lp = near('L') ? rnd() < 0.7 : rnd() < 0.3;
    if (rnd() < 0.08) rp = near('R') ? rnd() < 0.7 : rnd() < 0.3;
    sim.setFlipper('L', lp); sim.setFlipper('R', rp);
    const before = sim.balls.map((b) => ({ b, x: b.x, y: b.y }));
    sim.step();
    sim.events.length = 0;
    for (const { b, x, y } of before) {
      if (!b.alive) continue;
      // 台面 → 發射道（閘門以下）視為穿越
      if (x < 572 && b.x > 572 && b.y > 350 && b.y < 1110) laneCross++;
      if (x > 572 && b.x < 572 && b.y > 350 && b.y < 1110) laneCross++;
    }
    for (const b of sim.balls) {
      if (b.ramp) continue; // 坡道為高架層，不與台面重疊判定
      const p = maxPenetration(sim, b);
      if (p.worst > worst) { worst = p.worst; worstWhat = p.what; }
      const sp = Math.hypot(b.vx, b.vy); if (sp > maxSp) maxSp = sp;
      const outside = b.y < 1120 && (b.x < 20 || b.x > 620 || (b.y < ARC_C.y && Math.hypot(b.x - ARC_C.x, b.y - ARC_C.y) > ARC_R));
      if (outside) escapes++;
      for (const s of LAYOUT_DEFAULT.slings) if (pointInTri(b.x, b.y, s)) inTri++;
      for (const m of sim.bumpers) if (Math.hypot(b.x - m.x, b.y - m.y) < m.r) inTri++;
    }
    // 發射道內的球直接移回台面（本測試只驗台面物理）
    for (const b of sim.balls) if (b.x > 574 && b.y > 360) { b.alive = false; }
    sim.balls = sim.balls.filter((b) => b.alive);
    while (sim.balls.length < 3) spawn();
  }
  return { minutes, spawned, worstPenetration: +worst.toFixed(3), worstWhat, escapes, laneCross, insideSolids: inTri, maxSpeed: Math.round(maxSp) };
}

// ---------- 測試 2：擋板高速擊球（最容易穿透的情況） ----------
function flipperSmash() {
  let worst = 0, fails = 0, maxOut = 0;
  for (let i = 0; i < 4000; i++) {
    const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
    const f = sim.flippers[i % 2];
    const tl = 0.2 + rnd() * 0.8;
    const g = sim.flipperGeom(f);
    const x = f.x + (g.tx - f.x) * tl, y = f.y + (g.ty - f.y) * tl - 40 - rnd() * 120;
    const b = sim.addBall(x + (rnd() - 0.5) * 20, y, (rnd() - 0.5) * 800, 500 + rnd() * 2800);
    const pressAt = Math.floor(rnd() * 12);
    // 記錄球相對擋板線的側向（穿透 = 一個 tick 內在擋板範圍內從上方翻到下方）
    const sideOf = () => {
      const G = sim.flipperGeom(f);
      const q = closestOnSeg(b.x, b.y, G.x, G.y, G.tx, G.ty);
      const cross = (G.tx - G.x) * (b.y - G.y) - (G.ty - G.y) * (b.x - G.x);
      return { below: f.side === 'L' ? cross > 0 : cross < 0, inSpan: q.t > 0.02 && q.t < 0.98 };
    };
    let prev = sideOf();
    for (let t = 0; t < 60; t++) {
      if (t === pressAt) sim.setFlipper(f.side, true);
      sim.step(); sim.events.length = 0;
      if (!b.alive) break;
      if (!b.ramp) worst = Math.max(worst, maxPenetration(sim, b).worst);
      const cur = sideOf();
      if (!prev.below && cur.below && prev.inSpan && cur.inSpan) { fails++; break; }
      prev = cur;
    }
    maxOut = Math.max(maxOut, Math.hypot(b.vx, b.vy));
  }
  return { cases: 4000, tunnelThroughFlipper: fails, worstPenetration: +worst.toFixed(3) };
}

// ---------- 測試 3：擋板托球靜止（不可抖動） ----------
function cradle() {
  const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
  sim.setFlipper('L', true);
  for (let t = 0; t < 30; t++) sim.step();
  const f = sim.flippers[0];
  const g = sim.flipperGeom(f);
  // 放在擋板中段上方
  const b = sim.addBall(f.x + (g.tx - f.x) * 0.7, f.y + (g.ty - f.y) * 0.7 - 24, 0, 0);
  let maxJitter = 0;
  const pos = [];
  for (let t = 0; t < 900; t++) { sim.step(); sim.events.length = 0; if (t > 600) pos.push([b.x, b.y, Math.hypot(b.vx, b.vy)]); }
  for (const p of pos) maxJitter = Math.max(maxJitter, p[2]);
  const spread = Math.max(...pos.map((p) => p[1])) - Math.min(...pos.map((p) => p[1]));
  return { restSpeedMax: +maxJitter.toFixed(2), ySpread: +spread.toFixed(3), resting: b.alive };
}

// ---------- 測試 4：發射 ----------
function launch(pull) {
  const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
  const b = sim.addBall();
  for (let t = 0; t < 30; t++) sim.step();
  sim.plungerHold(true);
  const holdTicks = Math.round((pull * 1.1) / TICK);
  for (let t = 0; t < holdTicks; t++) sim.step();
  sim.plungerHold(false);
  let minY = 1e9, reachedPlayfield = false, t = 0;
  for (; t < 600; t++) {
    sim.step(); sim.events.length = 0;
    if (!b.alive) break;
    minY = Math.min(minY, b.y);
    if (b.x < 560) { reachedPlayfield = true; break; }
  }
  return { pull, minY: Math.round(minY), reachedPlayfield, backInLane: !reachedPlayfield && b.x > 572 && b.y > 1000 };
}

const t0 = Date.now();
const results = {
  chaos: chaos(20),
  flipperSmash: flipperSmash(),
  cradle: cradle(),
  launchFull: launch(1),
  launchHalf: launch(0.5),
  launchWeak: launch(0.05),
};
console.log(JSON.stringify(results, null, 2));
console.log(`耗時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const ok = results.chaos.worstPenetration < 1 && results.chaos.escapes === 0 && results.chaos.laneCross === 0 &&
  results.chaos.insideSolids === 0 && results.flipperSmash.tunnelThroughFlipper === 0 && results.cradle.restSpeedMax < 5 &&
  results.launchFull.reachedPlayfield && results.launchWeak.backInLane;
console.log(ok ? '✅ 全部通過' : '❌ 有項目未通過');
if (!ok) process.exitCode = 1;

// ---------- 測試 5：無人操作 → 台面上每一顆球都必須流出（檢查卡球死角）----------
function trapScan() {
  const traps = [];
  let n = 0;
  for (let y = 130; y <= 1000; y += 14) {
    for (let x = 30; x <= 562; x += 14) {
      const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
      const b = sim.addBall(x, y, 0, 0);
      if (maxPenetration(sim, b).worst > 0) continue;
      if (Math.hypot(x - ARC_C.x, y - ARC_C.y) > ARC_R - 12 && y < ARC_C.y) continue;
      n++;
      let t = 0;
      for (; t < 120 * 40 && b.alive; t++) {
        sim.step(); sim.events.length = 0;
        // 模擬遊戲中的自動輕推（2.5 秒低速）不列入 → 這裡要求純物理就流出
      }
      if (b.alive && !(b.x > 574)) traps.push([x, y, Math.round(b.x), Math.round(b.y)]);
    }
  }
  return { tested: n, trapped: traps.length, samples: traps.slice(0, 60).map((t) => t.slice(2).join(",")).filter((v, i, a) => a.indexOf(v) === i) };
}

// ---------- 測試 6：坡道 ----------
function rampShot(speed) {
  const sim = new PinballPhysics(clone(LAYOUT_DEFAULT), { ...PHYS_DEFAULT });
  const r = sim.ramps[0];
  const b = sim.addBall(r.cx - r.dx * 40, r.cy - r.dy * 40, r.dx * speed, r.dy * speed);
  let res = 'none';
  for (let t = 0; t < 600 && b.alive; t++) {
    sim.step();
    for (const e of sim.events) { if (e.type === 'ramp') res = 'made'; if (e.type === 'rampFail') res = 'rolledBack'; }
    sim.events.length = 0;
    if (res !== 'none') break;
  }
  return { speed, res, exit: [Math.round(b.x), Math.round(b.y)] };
}

const extra = { trap: trapScan(), rampFast: rampShot(1900), rampSlow: rampShot(800) };
console.log(JSON.stringify(extra, null, 2));
const ok2 = extra.trap.trapped === 0 && extra.rampFast.res === 'made' && extra.rampSlow.res === 'rolledBack';
console.log(ok2 ? '✅ 卡球 / 坡道測試通過' : '❌ 卡球 / 坡道測試未通過');
if (!ok2) process.exitCode = 1;
