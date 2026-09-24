// 彈珠台專用物理核心（純 JS，無引擎依賴，可在 Node 測試）
// 設計重點：
//  1. 固定步長 + 大量子步：每子步球位移遠小於半徑 → 不可能穿牆
//  2. 所有碰撞體皆為「膠囊 / 圓 / 圓弧」→ 法向量連續，不會出現尖角亂彈
//  3. 擋板為運動學剛體：以子步更新角度，碰撞時計入接觸點表面速度
//  4. 低速接觸不反彈（restThreshold）→ 球停在擋板上不會抖動

import { buildWalls, PLUNGER, BALL_START, WORLD, RAMPS, rampMouth } from './table.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export const TICK = 1 / 120;       // 邏輯步長
export const SUBSTEPS = 16;        // 每步子步數 → 1920Hz

let _ballId = 1;

export class PinballPhysics {
  constructor(layout, phys) {
    this.layout = layout;
    this.P = phys;
    this.balls = [];
    this.events = [];
    this.flippers = [];
    this.plunger = { pull: 0, y: PLUNGER.restY, vy: 0, charging: false, firing: false, fireSpeed: 0 };
    this.cooldown = new Map();     // 元件觸發冷卻
    this.time = 0;
    this._seed = 20260923;
    this.rebuild();
  }

  // 依 layout 編譯碰撞體（DEV 工具拖曳後會呼叫）
  rebuild() {
    const L = this.layout;
    this.walls = buildWalls();
    this.bumpers = L.bumpers.map((b) => ({ ...b }));
    this.slingSegs = [];
    for (const s of L.slings) {
      const r = 6;
      this.slingSegs.push({ ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, r, id: s.id, kicker: false });
      this.slingSegs.push({ ax: s.bx, ay: s.by, bx: s.cx, by: s.cy, r, id: s.id, kicker: false });
      this.slingSegs.push({ ax: s.ax, ay: s.ay, bx: s.cx, by: s.cy, r, id: s.id, kicker: true });
    }
    this.targets = L.targets.map((t) => {
      const a = t.a * DEG, h = t.len / 2;
      const dx = Math.cos(a) * h, dy = Math.sin(a) * h;
      return { id: t.id, bank: t.bank, ax: t.x - dx, ay: t.y - dy, bx: t.x + dx, by: t.y + dy, r: 4,
        fnx: Math.sin(a), fny: -Math.cos(a) };
    });
    this.sensors = L.rollovers.map((r) => ({ ...r }));
    // 星星 rollover 也是感應器（半徑 12）
    for (const st of L.stars || []) this.sensors.push({ id: st.id, x: st.x, y: st.y, r: 12, star: true });
    const oldDrop = new Map((this.drops || []).map((d) => [d.id, d.down]));
    this.drops = (L.drops || []).map((t) => {
      const a = t.a * DEG, h = t.len / 2;
      const dx = Math.cos(a) * h, dy = Math.sin(a) * h;
      return { id: t.id, ax: t.x - dx, ay: t.y - dy, bx: t.x + dx, by: t.y + dy, r: 4,
        fnx: Math.sin(a), fny: -Math.cos(a), bank: t.bank, down: oldDrop.get(t.id) || false };
    });
    this.saucers = (L.saucers || []).map((c) => ({ ...c }));
    // 橡膠柱：以零長度膠囊加入牆體（共用碰撞與計分）
    for (const p of L.posts || []) this.walls.push({ type: 'seg', ax: p.x, ay: p.y, bx: p.x, by: p.y + 0.01, r: p.r, mat: 'rubber', post: p.id });
    const oldSpin = new Map((this.spinners || []).map((sp) => [sp.id, sp]));
    this.spinners = (L.spinners || []).map((sp) => {
      const o = oldSpin.get(sp.id);
      return { ...sp, ang: o ? o.ang : 0, w: o ? o.w : 0, acc: o ? o.acc : 0 };
    });
    if (!this.ramps) this.ramps = RAMPS.map(buildRamp);
    // 擋板：保留目前角度（避免拖曳時跳動）
    const old = new Map(this.flippers.map((f) => [f.id, f]));
    this.flippers = L.flippers.map((f) => {
      const L_ = f.side === 'L';
      const rest = L_ ? f.rest * DEG : Math.PI - f.rest * DEG;
      const up = L_ ? f.up * DEG : Math.PI - f.up * DEG;
      const prev = old.get(f.id);
      return { ...f, restA: rest, upA: up, ang: prev ? clampBetween(prev.ang, rest, up) : rest,
        w: 0, pressed: prev ? prev.pressed : false };
    });
  }

  addBall(x = BALL_START.x, y = BALL_START.y, vx = 0, vy = 0) {
    const b = { id: _ballId++, x, y, vx, vy, px: x, py: y, sensorsIn: new Set(), orbitSeq: [], alive: true, stillT: 0 };
    this.balls.push(b);
    return b;
  }

  setFlipper(side, pressed) {
    for (const f of this.flippers) if (f.side === side) f.pressed = pressed;
  }

  // 發射台：按住蓄力、放開發射
  plungerHold(on) {
    const pl = this.plunger;
    if (on) { if (!pl.firing) pl.charging = true; }
    else if (pl.charging) {
      pl.charging = false;
      pl.firing = true;
      pl.fireSpeed = this.P.plungerMin + (this.P.plungerMax - this.P.plungerMin) * Math.pow(pl.pull, 1.15);
    }
  }

  // outlane 救球：把球朝上彈回
  kick(b, vx, vy) { b.vx = vx; b.vy = vy; }

  // 輕推桌子（救卡球 / 玩家 nudge）
  nudge(dx, dy) {
    for (const b of this.balls) { b.vx += dx; b.vy += dy; }
  }

  // 可重現亂數（測試可重現）
  rand() { this._seed = (this._seed * 16807) % 2147483647; return this._seed / 2147483647; }

  emit(type, data) { this.events.push({ type, ...data }); }

  // 前進一個邏輯 tick
  step() {
    const P = this.P;
    const dt = TICK * P.timeScale;
    const h = dt / SUBSTEPS;
    for (const b of this.balls) { b.px = b.x; b.py = b.y; }
    for (const f of this.flippers) f.pAng = f.ang;
    this.plunger.pY = this.plunger.y;

    // 蓄力（以 tick 為單位即可）
    const pl = this.plunger;
    if (pl.charging) pl.pull = Math.min(1, pl.pull + dt / 1.1);

    for (let s = 0; s < SUBSTEPS; s++) {
      this.time += h;
      this.updateFlippers(h);
      this.updatePlunger(h);
      for (const b of this.balls) {
        if (b.held) this.holdStep(b);
        else if (b.ramp) this.rampStep(b, h);
        else this.integrate(b, h);
      }
      for (const b of this.balls) if (!b.ramp && !b.held) this.collideStatic(b, h);
      this.collideBalls();
      // 第二輪靜態碰撞：處理球互撞後被推入牆內的情況
      for (const b of this.balls) if (!b.ramp && !b.held) this.collideStatic(b, h, true);
      for (const b of this.balls) if (!b.ramp && !b.held) { this.checkSensors(b); this.checkRampEntry(b); this.checkSaucer(b); }
    }

    // 旋轉片：角速度衰減、每半圈計分
    for (const sp of this.spinners) {
      if (Math.abs(sp.w) < 0.05) { sp.w = 0; continue; }
      const da = sp.w * dt;
      sp.ang += da;
      sp.acc += Math.abs(da);
      while (sp.acc >= Math.PI) { sp.acc -= Math.PI; this.emit('spin', { id: sp.id, x: sp.x, y: sp.y }); }
      sp.w *= Math.exp(-dt * 1.4);
    }

    // 出界判定
    for (const b of this.balls) {
      if (b.y > WORLD.H + 40 || !isFinite(b.x) || !isFinite(b.y)) {
        b.alive = false;
        this.emit('drain', { ball: b });
      }
    }
    this.balls = this.balls.filter((b) => b.alive);
  }

  // ---- Saucer 吸球洞：慢速經過的球被吸住，1 秒後朝上彈出 ----
  checkSaucer(b) {
    for (const c of this.saucers) {
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < c.r - 3 && !(b.saucerCooldown > this.time) && Math.hypot(b.vx, b.vy) < 1100 && !this.balls.some((o) => o.held && o.held.id === c.id)) {
        b.held = { id: c.id, x: c.x, y: c.y, until: this.time + 1.0 };
        b.vx = 0; b.vy = 0;
        this.emit('saucer', { id: c.id, x: c.x, y: c.y, ball: b });
      }
    }
  }

  holdStep(b) {
    const hd = b.held;
    // 吸入：往洞心收斂
    b.x += (hd.x - b.x) * 0.02; b.y += (hd.y - b.y) * 0.02;
    if (this.time >= hd.until) {
      const a = -Math.PI / 2 + (this.rand() - 0.5) * 1.1;
      b.x = hd.x; b.y = hd.y;
      b.vx = Math.cos(a) * 1250; b.vy = Math.sin(a) * 1250;
      b.held = null;
      b.saucerCooldown = this.time + 0.4;
      this.emit('saucerKick', { id: hd.id });
    }
  }

  // ---- 坡道：球被「捕獲」後沿中心線做一維運動（重力沿切線分量 + 阻力）----
  checkRampEntry(b) {
    for (const r of this.ramps) {
      const rx = b.x - r.cx, ry = b.y - r.cy;
      const along = rx * r.dx + ry * r.dy;          // > 0 表示已越過入口線
      const lat = Math.abs(-rx * r.dy + ry * r.dx);
      const vIn = b.vx * r.dx + b.vy * r.dy;
      if (along >= 0 && lat < r.halfW + 2 && vIn > 0 && (b.lastAlong === undefined || b.lastAlong[r.id] === undefined || b.lastAlong[r.id] < 0)) {
        b.ramp = { r, s: Math.min(along, 2), v: vIn };
        this.emit('rampEnter', { id: r.id });
      }
      (b.lastAlong ||= {})[r.id] = along;
    }
  }

  rampStep(b, h) {
    const P = this.P;
    const st = b.ramp, r = st.r;
    const t = rampAt(r, st.s);
    const a = P.gravity * P.rampGravity * t.ty - Math.sign(st.v) * P.rampDrag;
    st.v += a * h;
    st.v = Math.max(-P.maxSpeed, Math.min(P.maxSpeed, st.v));
    st.s += st.v * h;
    if (st.s <= 0) {
      // 力道不足 → 滾回入口
      const t0 = rampAt(r, 0);
      b.x = t0.x; b.y = t0.y;
      b.vx = t0.tx * st.v; b.vy = t0.ty * st.v;
      b.ramp = null;
      (b.lastAlong ||= {})[r.id] = 0;
      this.emit('rampFail', { id: r.id });
      return;
    }
    if (st.s >= r.len) {
      const t1 = rampAt(r, r.len);
      b.x = t1.x; b.y = t1.y;
      b.vx = t1.tx * st.v; b.vy = t1.ty * st.v;
      b.ramp = null;
      this.emit('ramp', { id: r.id, ball: b });
      return;
    }
    const p = rampAt(r, st.s);
    b.x = p.x; b.y = p.y;
    b.vx = p.tx * st.v; b.vy = p.ty * st.v;
  }

  updateFlippers(h) {
    const P = this.P;
    for (const f of this.flippers) {
      // 真實線圈：有角加速度（球會被推著沿擋板滑動，出手時機影響角度）
      const target = f.pressed ? f.upA : f.restA;
      const maxW = f.pressed ? P.flipperOmega : P.flipperReturnOmega;
      const prev = f.ang;
      const d = target - f.ang;
      if (Math.abs(d) < 1e-9) { f.spd = 0; f.w = 0; continue; }
      const dir = Math.sign(d);
      if (f.dir !== dir) { f.spd = 0; f.dir = dir; }
      f.spd = Math.min(maxW, (f.spd || 0) + P.flipperAccel * h);
      const stepA = f.spd * h;
      if (Math.abs(d) <= stepA) { f.ang = target; f.spd = 0; }
      else f.ang += dir * stepA;
      f.w = (f.ang - prev) / h;
    }
  }

  updatePlunger(h) {
    const pl = this.plunger;
    const prevY = pl.y;
    if (pl.firing) {
      pl.y -= pl.fireSpeed * h;
      if (pl.y <= PLUNGER.restY) {
        pl.y = PLUNGER.restY;
        pl.firing = false;
        pl.pull = 0;
        this.emit('plunger', { power: pl.fireSpeed });
      }
    } else {
      // 蓄力時緩緩下拉
      const targetY = PLUNGER.restY + pl.pull * PLUNGER.travel;
      pl.y += (targetY - pl.y) * Math.min(1, h * 30);
    }
    pl.vy = (pl.y - prevY) / h;
  }

  integrate(b, h) {
    const P = this.P;
    b.vy += P.gravity * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > P.maxSpeed) { const k = P.maxSpeed / sp; b.vx *= k; b.vy *= k; }
    b.x += b.vx * h;
    b.y += b.vy * h;
  }

  // 球與碰撞體接觸後的速度解算；回傳撞擊前法向速度（負值 = 撞入）
  resolve(b, nx, ny, pen, e, svx = 0, svy = 0, mu = this.P.friction) {
    const P = this.P;
    b.x += nx * pen;
    b.y += ny * pen;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const resting = -vn < P.restThreshold;
      const ee = resting ? 0 : e;
      // 滾動的鋼珠在靜止接觸時不會被摩擦「黏住」：高摩擦（擋板橡膠）只用於撞擊
      if (resting) mu = Math.min(mu, P.friction);
      let tx = rvx - vn * nx, ty = rvy - vn * ny;
      // 庫侖摩擦：切線衝量 ≤ μ × 法向衝量（連續貼牆滑行不會異常掉速）
      const jn = -(1 + ee) * vn;
      const vt = Math.hypot(tx, ty);
      if (vt > 1e-6) {
        const k = Math.max(0, vt - mu * jn) / vt;
        tx *= k; ty *= k;
      }
      b.vx = tx - ee * vn * nx + svx;
      b.vy = ty - ee * vn * ny + svy;
    }
    return vn;
  }

  collideStatic(b, h, second = false) {
    const P = this.P;
    const rb = P.ballRadius;

    // 牆
    for (const w of this.walls) {
      if (w.type === 'arc') {
        const c = closestOnArc(b.x, b.y, w);
        this.hitPoint(b, c.x, c.y, w.r, w.mat === 'rubber' ? P.rubberE : P.wallE, w);
      } else if (w.type === 'gate') {
        // 單向閘：球心在正面才碰撞（正面 = 左上方）
        const nx = w.ay - w.by, ny = w.bx - w.ax; // 左手法向
        const side = (b.x - w.ax) * nx + (b.y - w.ay) * ny;
        if (side < 0) continue;
        const q = closestOnSeg(b.x, b.y, w.ax, w.ay, w.bx, w.by);
        this.hitPoint(b, q.x, q.y, w.r, P.wallE);
      } else {
        const q = closestOnSeg(b.x, b.y, w.ax, w.ay, w.bx, w.by);
        this.hitPoint(b, q.x, q.y, w.r, w.mat === 'rubber' ? P.rubberE : P.wallE, w);
      }
    }

    // 圓形彈跳器
    for (const bm of this.bumpers) {
      const dx = b.x - bm.x, dy = b.y - bm.y;
      const d = Math.hypot(dx, dy);
      const R = rb + bm.r;
      if (d < R) {
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
        const vn = this.resolve(b, nx, ny, R - d, P.rubberE);
        if (vn < 0 && this.ready(bm.id, 0.06)) {
          // 主動彈出：保證最低彈出速度
          const out = b.vx * nx + b.vy * ny;
          if (out < P.bumperKick) {
            b.vx += nx * (P.bumperKick - out);
            b.vy += ny * (P.bumperKick - out);
          }
          // 真實 bumper 的線圈彈出方向有些微偏差：±4° 偏擺，避免完全對稱的無限彈跳
          const j = (this.rand() - 0.5) * 0.14, cj = Math.cos(j), sj = Math.sin(j);
          const vx = b.vx * cj - b.vy * sj; b.vy = b.vx * sj + b.vy * cj; b.vx = vx;
          this.emit('bumper', { id: bm.id, x: bm.x, y: bm.y });
        }
      }
    }

    // 彈弓
    for (const s of this.slingSegs) {
      const q = closestOnSeg(b.x, b.y, s.ax, s.ay, s.bx, s.by);
      const dx = b.x - q.x, dy = b.y - q.y;
      const d = Math.hypot(dx, dy);
      const R = rb + s.r;
      if (d < R) {
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
        const vn = this.resolve(b, nx, ny, R - d, P.rubberE);
        if (!s.kicker && vn < -180 && this.ready(s, 0.12)) this.emit('rubber', { x: q.x, y: q.y, w: s });
        if (s.kicker && -vn > P.slingThreshold && q.t > 0.08 && q.t < 0.92 && this.ready(s.id, 0.12)) {
          b.vx += nx * P.slingKick;
          b.vy += ny * P.slingKick;
          this.emit('sling', { id: s.id, x: q.x, y: q.y });
        }
      }
    }

    // 立靶
    for (const t of this.targets) {
      const q = closestOnSeg(b.x, b.y, t.ax, t.ay, t.bx, t.by);
      const dx = b.x - q.x, dy = b.y - q.y;
      const d = Math.hypot(dx, dy);
      const R = rb + t.r;
      if (d < R) {
        const nx = d > 1e-6 ? dx / d : t.fnx, ny = d > 1e-6 ? dy / d : t.fny;
        const vn = this.resolve(b, nx, ny, R - d, 0.4);
        const front = nx * t.fnx + ny * t.fny > 0.3;
        if (front && vn < -70 && this.ready(t.id, 0.25)) this.emit('target', { id: t.id, bank: t.bank, x: q.x, y: q.y });
      }
    }

    // Drop Target（倒下後不碰撞）
    for (const t of this.drops) {
      if (t.down) continue;
      const q = closestOnSeg(b.x, b.y, t.ax, t.ay, t.bx, t.by);
      const dx = b.x - q.x, dy = b.y - q.y;
      const d = Math.hypot(dx, dy);
      const R = rb + t.r;
      if (d < R) {
        const nx = d > 1e-6 ? dx / d : t.fnx, ny = d > 1e-6 ? dy / d : t.fny;
        const vn = this.resolve(b, nx, ny, R - d, 0.35);
        const front = nx * t.fnx + ny * t.fny > 0.3;
        if (front && vn < -80) { t.down = true; this.emit('drop', { id: t.id, bank: t.bank, x: (t.ax + t.bx) / 2, y: (t.ay + t.by) / 2 }); }
      }
    }

    // 擋板
    for (const f of this.flippers) this.collideFlipper(b, f);

    // 發射台
    const pl = this.plunger;
    if (b.x > PLUNGER.x0 - rb && b.x < PLUNGER.x1 + rb) {
      const q = closestOnSeg(b.x, b.y, PLUNGER.x0, pl.y, PLUNGER.x1, pl.y);
      const dx = b.x - q.x, dy = b.y - q.y;
      const d = Math.hypot(dx, dy);
      const R = rb + PLUNGER.r;
      if (d < R) {
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
        this.resolve(b, nx, ny, R - d, 0.05, 0, Math.min(0, pl.vy));
      }
    }
  }

  // 球 vs 膠囊上的最近點
  hitPoint(b, qx, qy, r, e, w = null) {
    const rb = this.P.ballRadius;
    const dx = b.x - qx, dy = b.y - qy;
    const d2 = dx * dx + dy * dy;
    const R = rb + r;
    if (d2 >= R * R) return 0;
    const d = Math.sqrt(d2);
    let nx, ny;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; }
    else {
      // 極罕見：球心剛好在線上 → 以上一位置方向推出
      const px = b.px - qx, py = b.py - qy, pl = Math.hypot(px, py) || 1;
      nx = px / pl; ny = py / pl;
    }
    const vn = this.resolve(b, nx, ny, R - d, e);
    // 橡膠撞擊（計分 + 閃光）
    if (w && w.mat === 'rubber' && vn < -180 && this.ready(w, 0.12)) this.emit('rubber', { x: qx, y: qy, w });
    else if (w && w.mat !== 'rubber' && vn < -220 && this.ready(w, 0.06)) this.emit('wall', { power: -vn });
    return vn;
  }

  collideFlipper(b, f) {
    const P = this.P;
    const rb = P.ballRadius;
    const ca = Math.cos(f.ang), sa = Math.sin(f.ang);
    const tx = f.x + ca * f.len, ty = f.y + sa * f.len;
    const q = closestOnSeg(b.x, b.y, f.x, f.y, tx, ty);
    const rr = f.r1 + (f.r2 - f.r1) * q.t;
    const dx = b.x - q.x, dy = b.y - q.y;
    const d = Math.hypot(dx, dy);
    const R = rb + rr;
    if (d >= R) return;
    let nx, ny;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; }
    else { nx = -sa; ny = ca; }
    // 接觸點的表面速度 = ω × r
    const cx = q.x + nx * rr - f.x, cy = q.y + ny * rr - f.y;
    const svx = -f.w * cy, svy = f.w * cx;
    const vn = this.resolve(b, nx, ny, R - d, P.flipperE, svx, svy, P.flipperFriction);
    if (vn < -250 && Math.abs(f.w) > 1 && this.ready(f.id + 'hit', 0.1)) this.emit('flipperHit', { id: f.id, power: -vn });
  }

  collideBalls() {
    const bs = this.balls;
    const rb = this.P.ballRadius;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        if (a.ramp || c.ramp || a.held || c.held) continue; // 坡道上的球與台面分層
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= rb * 2 || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d;
        const pen = (rb * 2 - d) / 2;
        a.x -= nx * pen; a.y -= ny * pen;
        c.x += nx * pen; c.y += ny * pen;
        const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (vn < 0) {
          const j_ = -(1 + 0.9) * vn / 2;
          a.vx -= j_ * nx; a.vy -= j_ * ny;
          c.vx += j_ * nx; c.vy += j_ * ny;
          if (-vn > 120 && this.ready('bb', 0.05)) this.emit('ballHit', {});
        }
      }
    }
  }

  // 升起 Drop Target：有球壓在上方時延後（回傳是否全部升起）
  resetDrops() {
    const rb = this.P.ballRadius;
    for (const t of this.drops) {
      const blocked = this.balls.some((b) => {
        const q = closestOnSeg(b.x, b.y, t.ax, t.ay, t.bx, t.by);
        return Math.hypot(b.x - q.x, b.y - q.y) < rb + t.r + 2;
      });
      if (blocked) return false;
    }
    for (const t of this.drops) t.down = false;
    return true;
  }

  checkSensors(b) {
    // 旋轉片：球心穿越旋轉片線段 → 依垂直速度帶動旋轉
    for (const sp of this.spinners) {
      const side = b.y - sp.y;
      const key = 'sp_' + sp.id;
      const prev = b[key];
      b[key] = side;
      if (prev !== undefined && Math.sign(prev) !== Math.sign(side) && Math.abs(b.x - sp.x) < sp.w / 2) {
        sp.w = Math.sign(-b.vy || 1) * Math.min(60, Math.abs(b.vy) / 38);
        this.emit('spinHit', { id: sp.id });
      }
    }
    for (const s of this.sensors) {
      const inside = Math.hypot(b.x - s.x, b.y - s.y) < s.r + 4;
      if (inside && !b.sensorsIn.has(s.id)) {
        b.sensorsIn.add(s.id);
        this.emit('sensor', { id: s.id, ball: b });
      } else if (!inside && b.sensorsIn.has(s.id)) {
        b.sensorsIn.delete(s.id);
      }
    }
  }

  ready(key, cd) {
    const t = this.cooldown.get(key) || -1;
    if (this.time - t < cd) return false;
    this.cooldown.set(key, this.time);
    return true;
  }

  flipperGeom(f) {
    return { x: f.x, y: f.y, tx: f.x + Math.cos(f.ang) * f.len, ty: f.y + Math.sin(f.ang) * f.len };
  }
}

// ---------- 坡道路徑（Catmull-Rom 取樣 + 弧長參數化）----------
function buildRamp(def) {
  const P = def.path;
  const pts = [];
  const get = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(P[P.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const m = rampMouth(def);
  return { ...def, pts, cum, len: cum[cum.length - 1], cx: m.cx, cy: m.cy, dx: m.dx, dy: m.dy };
}

export function rampAt(r, s) {
  s = Math.max(0, Math.min(r.len, s));
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r.cum[mid] <= s) lo = mid; else hi = mid; }
  const seg = r.cum[hi] - r.cum[lo] || 1;
  const t = (s - r.cum[lo]) / seg;
  const [x0, y0] = r.pts[lo], [x1, y1] = r.pts[hi];
  const tx = (x1 - x0) / seg, ty = (y1 - y0) / seg;
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, tx, ty };
}

// ---------- 幾何工具 ----------
export function closestOnSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const L2 = abx * abx + aby * aby;
  let t = L2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + abx * t, y: ay + aby * t, t };
}

export function closestOnArc(px, py, w) {
  let a = Math.atan2(py - w.cy, px - w.cx);
  // 將角度正規化到 [a0, a0 + 2π)
  while (a < w.a0) a += TAU;
  while (a >= w.a0 + TAU) a -= TAU;
  if (a > w.a1) {
    // 超出範圍：取較近的端點
    const d1 = a - w.a1, d0 = w.a0 + TAU - a;
    a = d1 < d0 ? w.a1 : w.a0;
  }
  return { x: w.cx + Math.cos(a) * w.R, y: w.cy + Math.sin(a) * w.R };
}

function clampBetween(v, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return Math.max(lo, Math.min(hi, v));
}
