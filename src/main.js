import Phaser from 'phaser';
import { PinballPhysics, TICK } from './physics.js';
import { WORLD, PHYS_DEFAULT, LAYOUT_DEFAULT, buildWalls, PLUNGER } from './table.js';
import { drawPlayfield, drawRamps, makeBallTexture, makeBallGlow, makeShadowTexture, makeBumperCap, makeSpark, C } from './art.js';
import { Sfx } from './audio.js';
import { GameRules } from './game.js';
import { HUD, VIEW_W } from './ui.js';
import { DevTool, loadOverrides } from './devtool.js';

const TEX_S = 2.5;            // 靜態貼圖超取樣倍率（高 DPI 清晰）
const hex = (s) => Phaser.Display.Color.HexStringToColor(s).color;

class TableScene extends Phaser.Scene {
  constructor() { super('table'); }

  preload() {
    this.load.image('artbg', 'art/playfield.jpg');
  }

  create() {
    const ov = loadOverrides();
    this.layoutData = ov.layout || JSON.parse(JSON.stringify(LAYOUT_DEFAULT));
    this.phys = { ...PHYS_DEFAULT, ...(ov.phys || {}) };
    this.artCfg = { sat: 0.45, bright: 0.72, ...(ov.art || {}) }; // 底圖彩度 / 亮度
    this.sim = new PinballPhysics(this.layoutData, this.phys);
    this.sfx = new Sfx();
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.acc = 0;
    this.paused = false;

    // ---- 貼圖 ----
    // 美術步驟任何一步出錯都不能拖垮輸入與遊戲（舊版瀏覽器相容）
    try { this.buildPlayfieldTexture(); } catch (e) { console.error('playfield art', e); this.textures.createCanvas('playfield', 8, 8); }
    makeBallTexture(this, 'ball', this.phys.ballRadius, TEX_S * 1.6);
    makeBallGlow(this, 'ballglow', this.phys.ballRadius, TEX_S);
    makeShadowTexture(this, 'shadow', this.phys.ballRadius, TEX_S);
    makeSpark(this, 'spark');

    this.bg = this.add.image(0, 0, 'playfield').setOrigin(0).setScale(1 / TEX_S);
    const rt = this.textures.createCanvas('ramps', WORLD.W * TEX_S, WORLD.H * TEX_S);
    try { drawRamps(rt.getContext(), TEX_S, this.sim.ramps); } catch (e) { console.error('ramps art', e); }
    rt.refresh();
    this.rampImg = this.add.image(0, 0, 'ramps').setOrigin(0).setScale(1 / TEX_S).setDepth(7.5);
    this.gParts = this.add.graphics();
    this.bumperImgs = new Map();
    this.labels = new Map();
    this.syncParts();
    this.saveLabels = {};
    for (const [side, x] of [['L', 45], ['R', 547]]) {
      this.saveLabels[side] = this.add.text(x, 1005.5, 'SAVE', { fontFamily: 'Bungee', fontSize: '22px', color: '#0a1724' })
        .setOrigin(0.5).setScale(0.5).setResolution(2).setDepth(3);
    }
    this.gPlunger = this.add.graphics();
    this.gFlip = this.add.graphics();
    this.ballSprites = new Map();
    this.gFx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 420 }, lifespan: { min: 180, max: 380 },
      scale: { start: 0.55, end: 0 }, blendMode: 'ADD', emitting: false,
    });
    this.gDebug = this.add.graphics();
    // 繪製順序
    this.bg.setDepth(0); this.gParts.setDepth(1); this.gPlunger.setDepth(4);
    this.gFlip.setDepth(6);
    this.gFx.setDepth(8); this.sparks.setDepth(9); this.gDebug.setDepth(10);

    // ---- 系統 ----
    this.hud = new HUD(this);
    this.rules = new GameRules(this.sim, this.sfx, this.hud);
    this.dev = new DevTool(this);
    this.setupInput();
    this.onResize();
    this.scale.on('resize', () => {});
    window.addEventListener('resize', () => this.onResize());
    window.visualViewport?.addEventListener('resize', () => this.onResize());
    this.hud.showStart(true);

    // 待機畫面：放一顆展示球讓台面有動態
    this.demoBall();
  }

  demoBall() {
    if (this.rules.state === 'play') return;
    if (this.sim.balls.length < 1) this.sim.addBall(296, 300, (Math.random() - 0.5) * 600, 200);
  }

  buildPlayfieldTexture() {
    if (this.textures.exists('playfield')) this.textures.remove('playfield');
    const t = this.textures.createCanvas('playfield', WORLD.W * TEX_S, WORLD.H * TEX_S);
    const art = this.textures.exists('artbg')
      ? { img: this.textures.get('artbg').getSourceImage(), dx: -29, sat: this.artCfg.sat, bright: this.artCfg.bright } : null;
    drawPlayfield(t.getContext(), TEX_S, buildWalls(), art);
    t.refresh();
  }

  // DEV：底圖參數變更後重建貼圖（節流，避免拖滑桿時卡頓）
  rebuildArt() {
    clearTimeout(this._artT);
    this._artT = setTimeout(() => {
      this.buildPlayfieldTexture();
      this.bg.setTexture('playfield');
    }, 60);
  }

  // 可調元件的貼圖 / 文字同步（DEV 拖曳後呼叫）
  syncParts() {
    const L = this.layoutData;
    const cols = ['#c8202c', '#d8402b', '#b0186a'];
    for (const [i, b] of L.bumpers.entries()) {
      const key = `cap_${b.id}_${b.r}`;
      if (!this.textures.exists(key)) makeBumperCap(this, key, b.r, TEX_S * 1.5, b.label, cols[i % 3]);
      let img = this.bumperImgs.get(b.id);
      if (!img) { img = this.add.image(0, 0, key); this.bumperImgs.set(b.id, img); }
      img.setTexture(key).setScale(1 / (TEX_S * 1.5)).setPosition(b.x, b.y).setDepth(2);
    }
    for (const r of L.rollovers) {
      if (!r.label) continue;
      let t = this.labels.get(r.id);
      if (!t) {
        t = this.add.text(0, 0, r.label, { fontFamily: 'Bungee', fontSize: '28px', color: '#0f2a40' })
          .setOrigin(0.5).setScale(0.5).setDepth(3).setResolution(2);
        this.labels.set(r.id, t);
      }
      t.setPosition(r.x, r.y + 1);
    }
  }

  // ---------------- 輸入 ----------------
  setupInput() {
    const keys = {
      L: ['ArrowLeft', 'KeyZ', 'ShiftLeft', 'KeyA'],
      R: ['ArrowRight', 'Slash', 'ShiftRight', 'KeyL'],
      P: ['Space', 'ArrowDown', 'Enter', 'KeyS'],
    };
    const roleOf = (code) => Object.keys(keys).find((k) => keys[k].includes(code));
    this.held = { L: new Set(), R: new Set(), P: new Set() };

    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('#dev')) return; // DEV 面板輸入中
      this.sfx.unlock();
      const role = roleOf(e.code);
      if (role) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyD') return this.dev.toggle();
      if (e.code === 'KeyM') return this.toggleMute();
      if (e.code === 'KeyP') { this.paused = !this.paused; this.hud.message(this.paused ? 'PAUSED' : 'GO', '', this.paused ? 99 : 0.5); return; }
      if (e.code === 'KeyN') return this.nudge();
      if (this.rules.state !== 'play' && (e.code === 'Enter' || e.code === 'Space')) return this.startGame();
      if (role) this.press(role, 'k:' + e.code, true);
    });
    window.addEventListener('keyup', (e) => {
      const role = roleOf(e.code);
      if (role) this.press(role, 'k:' + e.code, false);
    });
    window.addEventListener('blur', () => { for (const r of 'LRP') for (const k of [...this.held[r]]) this.press(r, k, false); });

    // 觸控 / 滑鼠：左半邊 = 左擋板，右半邊 = 右擋板，發射道區 = 發射
    this.input.addPointer(4);
    this.pointerRole = new Map();
    this.input.on('pointerdown', (p) => {
      this.sfx.unlock();
      if (this.dev.open && this.dev.pointerDown(p)) return;
      if (this.rules.state !== 'play') return;
      const role = this.roleForPointer(p);
      this.pointerRole.set(p.id, role);
      this.press(role, 'p:' + p.id, true);
    });
    const up = (p) => {
      if (this.dev.open) this.dev.pointerUp(p);
      const role = this.pointerRole.get(p.id);
      if (role) { this.pointerRole.delete(p.id); this.press(role, 'p:' + p.id, false); }
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    // 觸控被系統中斷（來電、手勢）時也要放開，避免擋板卡在按下狀態
    this.game.canvas.addEventListener('pointercancel', () => {
      for (const [id, role] of this.pointerRole) this.press(role, 'p:' + id, false);
      this.pointerRole.clear();
    });
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.input.on('pointermove', (p) => { if (this.dev.open) this.dev.pointerMove(p); });
  }

  roleForPointer(p) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    if (w.x > 560 && w.y > 780) return 'P';
    const right = p.x >= this.scale.width / 2;
    // 只有等待發射的球時，右半邊觸控也可蓄力（手機好操作）
    if (right && this.ballWaiting()) return 'P';
    return right ? 'R' : 'L';
  }

  ballWaiting() {
    const bs = this.sim.balls;
    return bs.length > 0 && bs.every((b) => b.x > 574 && b.y > 900);
  }

  press(role, src, down) {
    const set = this.held[role];
    const was = set.size > 0;
    if (down) set.add(src); else set.delete(src);
    const now = set.size > 0;
    if (was === now) return;
    if (role === 'P') {
      this.sim.plungerHold(now);
      if (now) this.sfx.plungerPull();
      return;
    }
    this.sim.setFlipper(role, now);
    if (now) { this.sfx.flipper(); this.rules.laneChange(role === 'L' ? -1 : 1); }
    else this.sfx.burst(0.03, 1200, 1, 0.08);
  }

  nudge() {
    if ((this.lastNudge || 0) > this.sim.time - 0.8) return;
    this.lastNudge = this.sim.time;
    this.sim.nudge((Math.random() - 0.5) * 160, -140);
    this.cameras.main.shake(120, 0.004);
    this.sfx.burst(0.08, 200, 1, 0.3);
  }

  startGame() {
    this.sfx.unlock();
    this.hud.showStart(false);
    this.rules.startGame();
  }

  toggleMute() {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    this.hud.el.mute.textContent = this.sfx.muted ? '🔇' : '🔊';
  }

  spark(x, y, n) { this.sparks.explode(n, x, y); }

  // bumper 擴散光環
  ring(x, y) {
    const c = this.add.circle(x, y, 30).setStrokeStyle(4, 0xffe27a, 1).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: c, scale: 1.9, alpha: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
  }

  // 撞擊點飄字（物件池避免 GC 卡頓）
  popup(x, y, pts, big) {
    this.popPool ||= [];
    let t = this.popPool.find((p) => !p.active);
    if (!t) {
      t = this.add.text(0, 0, '', { fontFamily: 'Bungee', fontSize: '40px', color: '#ffe27a', stroke: '#0a1724', strokeThickness: 8 })
        .setOrigin(0.5).setResolution(2).setDepth(9.5);
      this.popPool.push(t);
    }
    const s = big ? 0.62 : pts >= 500 ? 0.44 : pts >= 100 ? 0.36 : 0.28;
    t.setActive(true).setVisible(true).setText('+' + pts.toLocaleString('en-US'))
      .setPosition(Phaser.Math.Clamp(x, 60, 530), y).setScale(s * 0.6).setAlpha(1)
      .setColor(big ? '#ffffff' : pts >= 500 ? '#ffb347' : pts >= 100 ? '#ffe27a' : '#cfe8ff');
    this.tweens.killTweensOf(t);
    this.tweens.add({ targets: t, scale: s, duration: 90, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - (big ? 60 : 38), alpha: 0, delay: big ? 500 : 220, duration: big ? 700 : 480, ease: 'Cubic.easeIn',
      onComplete: () => t.setActive(false).setVisible(false) });
  }

  // ---------------- 版面 ----------------
  onResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vv = window.visualViewport;
    const W = Math.max(320, Math.round((vv && vv.width) || window.innerWidth || 0));
    const H = Math.max(480, Math.round((vv && vv.height) || window.innerHeight || 0));
    const mode = this.dev.forceMode || (W / H > 0.85 && W >= 720 ? 'pc' : 'mobile');
    const area = this.hud.layout(mode, W, H);
    this.scale.resize(W * dpr, H * dpr);
    this.scale.setZoom(1 / dpr);
    const cam = this.cameras.main;
    const pad = mode === 'pc' ? 16 : 0;
    const viewW = mode === 'pc' ? WORLD.W : VIEW_W; // 手機裁掉左右木框，讓台面填滿螢幕寬
    const zoom = Math.min((area.w - pad * 2) / viewW, (area.h - pad * 2) / WORLD.H) * dpr;
    cam.setViewport(area.x * dpr, area.y * dpr, area.w * dpr, area.h * dpr);
    cam.setZoom(zoom);
    cam.centerOn(WORLD.W / 2, WORLD.H / 2);
    this.mode = mode;
    // 桌面螢幕位置 → 給 CSS 用（訊息條置中於桌面）
    const tw = WORLD.W * zoom / dpr, th = WORLD.H * zoom / dpr;
    const r = document.documentElement.style;
    r.setProperty('--tx', area.x + (area.w - tw) / 2 + 'px');
    r.setProperty('--ty', area.y + (area.h - th) / 2 + 'px');
    r.setProperty('--tw', tw + 'px');
    r.setProperty('--th', th + 'px');
  }

  // ---------------- 主迴圈 ----------------
  update(_, delta) {
    if (!this.paused) {
      this.acc += Math.min(delta / 1000, 0.1);
      let n = 0;
      while (this.acc >= TICK && n < 12) {
        this.sim.step();
        this.rules.update();
        this.acc -= TICK;
        n++;
      }
      if (n === 12) this.acc = 0;
      if (this.rules.state !== 'play') this.demoBall();
    }
    const alpha = this.paused ? 1 : this.acc / TICK;
    this.render(alpha);
    this.hud.update(this.rules);
    if (this.dev.open) this.dev.draw(this.gDebug); else this.gDebug.clear();
  }

  render(a) {
    const t = this.sim.time;
    const R = this.rules;
    const g = this.gParts;
    const L = this.layoutData;
    g.clear();
    const blink = (hz) => Math.sin(t * Math.PI * 2 * hz) > 0;

    // 彈跳器：底座光環 + 閃光
    for (const b of L.bumpers) {
      const lit = R.isLit(b.id);
      g.fillStyle(0x000000, 0.35).fillCircle(b.x + 3, b.y + 5, b.r + 3);
      g.fillStyle(lit ? 0xfff2b0 : 0x2a2e3a, 1).fillCircle(b.x, b.y, b.r + 5);
      g.lineStyle(2, lit ? 0xffffff : 0xc8202c, 1).strokeCircle(b.x, b.y, b.r + 5);
      const img = this.bumperImgs.get(b.id);
      img.setScale((lit ? 0.92 : 1) / (TEX_S * 1.5));
      if (lit) { g.lineStyle(4, 0xffe27a, 0.9).strokeCircle(b.x, b.y, b.r + 9); }
    }

    // 彈弓
    for (const s of L.slings) {
      const lit = R.isLit(s.id);
      g.fillStyle(0x000000, 0.3).fillTriangle(s.ax + 3, s.ay + 5, s.bx + 3, s.by + 5, s.cx + 3, s.cy + 5);
      g.fillStyle(0x1a0c3a, 1).fillTriangle(s.ax, s.ay, s.bx, s.by, s.cx, s.cy);
      // 內部塑膠片
      const cx = (s.ax + s.bx + s.cx) / 3, cy = (s.ay + s.by + s.cy) / 3;
      const k = 0.62;
      const P = (x, y) => [cx + (x - cx) * k, cy + (y - cy) * k];
      const [a1, a2] = P(s.ax, s.ay), [b1, b2] = P(s.bx, s.by), [c1, c2] = P(s.cx, s.cy);
      g.fillStyle(lit ? 0x9fe8ff : 0x3a1a7a, 1).fillTriangle(a1, a2, b1, b2, c1, c2);
      // 電光鋸齒
      {
        const zz = [];
        for (let i = 0; i <= 6; i++) {
          const k = i / 6, o = i % 2 ? 5 : -5;
          const x = a1 + (cx - a1) * 0.2 + ((b1 + c1) / 2 - a1) * k * 0.9, y = a2 + ((b2 + c2) / 2 - a2) * k * 0.9;
          zz.push(new Phaser.Math.Vector2(x + o, y));
        }
        g.lineStyle(lit ? 3 : 2, lit ? 0xffffff : 0x5fd8ff, 1).strokePoints(zz, false);
      }
      const rub = (x1, y1, x2, y2, col) => { g.lineStyle(12, col, 1).lineBetween(x1, y1, x2, y2); };
      rub(s.ax, s.ay, s.bx, s.by, 0xf7f0dc);
      rub(s.bx, s.by, s.cx, s.cy, 0xf7f0dc);
      rub(s.ax, s.ay, s.cx, s.cy, lit ? 0xffffff : 0xf7f0dc);
      for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by], [s.cx, s.cy]]) {
        g.fillStyle(0xf7f0dc, 1).fillCircle(x, y, 6);
        g.fillStyle(0x9aa4ad, 1).fillCircle(x, y, 2.5);
      }
      if (lit) g.lineStyle(3, 0xfff2b0, 1).lineBetween(s.ax, s.ay, s.cx, s.cy);
    }

    // 立靶
    for (const tg of L.targets) {
      const idx = +tg.id.slice(-1) - 1;
      const done = R.banks[tg.bank][idx];
      const lit = R.isLit(tg.id);
      const ang = (tg.a * Math.PI) / 180;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const nx = Math.sin(ang), ny = -Math.cos(ang);
      const h = tg.len / 2, th = 5;
      const pts = [
        [tg.x - dx * h - nx * th, tg.y - dy * h - ny * th], [tg.x + dx * h - nx * th, tg.y + dy * h - ny * th],
        [tg.x + dx * h + nx * th, tg.y + dy * h + ny * th], [tg.x - dx * h + nx * th, tg.y - dy * h + ny * th],
      ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
      g.fillStyle(lit ? 0xffffff : done ? hex(C.yellow) : hex(C.red), 1).fillPoints(pts, true);
      g.lineStyle(1.5, 0x0a1724, 1).strokePoints(pts, true);
      // 後方燈
      g.fillStyle(done ? hex(C.yellow) : 0x3b2a1a, done ? 1 : 0.8).fillCircle(tg.x + nx * 18, tg.y + ny * 18, 5);
    }

    // Drop Target：立起 = 白面紅框；倒下 = 只剩地面縫隙
    for (const d of this.sim.drops) {
      const mx = (d.ax + d.bx) / 2, my = (d.ay + d.by) / 2;
      const hw = Math.hypot(d.bx - d.ax, d.by - d.ay) / 2 - 3;
      const ang = Math.atan2(d.by - d.ay, d.bx - d.ax);
      const box = (w, h, oy, col, al = 1) => {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const P = (u, v) => new Phaser.Math.Vector2(mx + ca * u - sa * (v + oy), my + sa * u + ca * (v + oy));
        g.fillStyle(col, al).fillPoints([P(-w, -h), P(w, -h), P(w, h), P(-w, h)], true);
      };
      box(hw + 1, 2.5, 0, 0x0a0a14);
      if (d.down) continue;
      box(hw, 6, 3, 0x000000, 0.35);
      box(hw, 6, 0, R.isLit(d.id) ? 0xffffff : 0xc8202c);
      box(hw - 3, 3.5, 0, 0xf4f0e6);
      box(3, 3, 0, 0xc8202c);
    }

    // Spinner：旋轉時以 |cos| 表現薄片翻轉
    for (const sp of this.sim.spinners) {
      const h = Math.max(1.5, Math.abs(Math.cos(sp.ang)) * 9);
      g.lineStyle(3, 0x9aa4ad, 1).lineBetween(sp.x - sp.w / 2 - 4, sp.y, sp.x + sp.w / 2 + 4, sp.y);
      g.fillStyle(Math.cos(sp.ang) > 0 ? hex(C.yellow) : 0xd9c79c, 1).fillRect(sp.x - sp.w / 2, sp.y - h / 2, sp.w, h);
      g.fillStyle(0x0a1724, 1).fillCircle(sp.x - sp.w / 2 - 4, sp.y, 2.5).fillCircle(sp.x + sp.w / 2 + 4, sp.y, 2.5);
    }

    // WORMHOLE 燈環 + Saucer
    for (const c of L.saucers || []) {
      const lit = R.wormLit;
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        const x = c.x + Math.cos(a) * 62, y = c.y + Math.sin(a) * 62;
        const on = lit ? Math.floor(t * 12) % 12 === i || blink(3) : i < R.ring;
        g.fillStyle(0x05060f, 1).fillCircle(x, y, 7);
        g.fillStyle(on ? (lit ? 0xffffff : 0x4fd0ff) : 0x10284a, 1).fillCircle(x, y, 5.5);
        if (on) g.fillStyle(0x4fd0ff, 0.25).fillCircle(x, y, 11);
      }
      const hot = R.isLit(c.id) || (lit && blink(4));
      g.fillStyle(hot ? 0xffe27a : 0x1a4aa0, hot ? 0.9 : 0.6).fillCircle(c.x, c.y, c.r + 5);
      g.fillStyle(0x02030a, 1).fillCircle(c.x, c.y, c.r);
      g.lineStyle(2, 0x9aa6b8, 1).strokeCircle(c.x, c.y, c.r);
    }
    for (const p of L.posts || []) {
      const lit = R.isLit(p.id);
      g.fillStyle(0x000000, 0.4).fillCircle(p.x + 2, p.y + 4, p.r + 1);
      g.fillStyle(lit ? 0xffffff : 0xf4f0e6, 1).fillCircle(p.x, p.y, p.r);
      g.fillStyle(lit ? 0xffe27a : 0xc8202c, 1).fillCircle(p.x, p.y, p.r * 0.55);
      if (lit) g.lineStyle(2, 0xffe27a, 1).strokeCircle(p.x, p.y, p.r + 4);
    }

    // 感應燈
    for (const r of L.rollovers) {
      const lit = R.isLit(r.id);
      if (r.id.startsWith('lane')) {
        const i = 'SKY'.indexOf(r.id.slice(-1));
        const on = R.lanes[i];
        g.fillStyle(lit ? 0xffffff : on ? hex(C.yellow) : 0x6b4a2a, 1).fillCircle(r.x, r.y, r.r);
        g.lineStyle(2, hex(C.cream), 1).strokeCircle(r.x, r.y, r.r);
      } else if (r.id.startsWith('in')) {
        const col = C.yellow;
        g.fillStyle(lit ? 0xffffff : hex(col), lit ? 1 : 0.55);
        g.fillTriangle(r.x - 6, r.y - 6, r.x + 6, r.y - 6, r.x, r.y + 6);
      } else if (r.id.startsWith('orbit')) {
        const on = R.multiball ? blink(3) : R.isLit('orbit');
        g.fillStyle(on ? 0xffe27a : 0x000000, on ? 0.9 : 0).fillCircle(r.x, r.y, 6);
      }
    }

    // KICKBACK 保送燈：待命 = 綠色箭頭由下往上跑馬燈 + SAVE 燈牌亮；用掉 = 全暗
    for (const [side, x] of [['L', 45], ['R', 547]]) {
      const armed = R.state === 'play' ? R.kick[side] : true;
      const fire = R.isLit('kick' + side);
      if (fire) g.fillStyle(0xffffff, 0.35).fillRect(x - 21, 800, 42, 300); // 觸發瞬間整條通道閃白
      for (let i = 0; i < 3; i++) {
        const y = 940 - i * 42;
        const chase = Math.floor(t * 6) % 3 === i;
        const col = armed ? (chase ? 0xd9ffb0 : 0x57d15a) : 0x2a3a2a;
        const al = armed ? 1 : 0.8;
        g.fillStyle(0x0a1724, 0.9).fillTriangle(x, y - 13, x - 12, y + 8, x + 12, y + 8);
        g.fillStyle(col, al).fillTriangle(x, y - 10, x - 9, y + 6, x + 9, y + 6);
        if (armed && chase) g.fillStyle(0x9dff7a, 0.25).fillCircle(x, y, 16);
      }
      // SAVE 燈牌
      g.fillStyle(0x0a1724, 1).fillRoundedRect(x - 19, 994, 38, 22, 5);
      g.fillStyle(fire ? 0xffffff : armed ? 0x3fbf4a : 0x4a1a14, 1).fillRoundedRect(x - 16, 997, 32, 16, 4);
      if (armed && !fire) g.fillStyle(0xffffff, 0.25).fillRoundedRect(x - 14, 998, 28, 5, 2);
      const lb = this.saveLabels[side];
      lb.setColor(armed || fire ? '#0a1724' : '#8a5a4a');
      // 彈射柱
      g.fillStyle(0x9aa4ad, 1).fillRect(x - 9, fire ? 1060 : 1068, 18, 6);
    }

    // ---- 射擊指示燈（shot arrows）：燈亮 = 現在打這裡有獎勵 ----
    const arrow = (x, y, ang, fill, on, label) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const P = (d, o) => new Phaser.Math.Vector2(x + ca * d - sa * o, y + sa * d + ca * o);
      const shape = (k) => [P(18 * k, 0), P(2 * k, -11 * k), P(2 * k, -5 * k), P(-16 * k, -5 * k), P(-16 * k, 5 * k), P(2 * k, 5 * k), P(2 * k, 11 * k)];
      g.fillStyle(0x0a1724, 1).fillPoints(shape(1.18), true);
      g.fillStyle(on ? fill : 0x3a2a1c, 1).fillPoints(shape(1), true);
      if (on) g.fillStyle(0xffffff, 0.35).fillPoints([P(14, 0), P(2, -8), P(2, -3), P(-12, -3), P(-12, 0)], true);
      if (on) g.fillStyle(fill, 0.18).fillCircle(x, y, 26);
      void label;
    };
    for (const r of this.sim.ramps) {
      const comboReady = R.lastRamp && R.lastRamp.id !== r.id && t - R.lastRamp.t < 5;
      const on = R.isLit(r.id) || (comboReady ? blink(6) : blink(0.8));
      arrow(r.cx - r.dx * 70, r.cy - r.dy * 70, Math.atan2(r.dy, r.dx), comboReady ? 0xff5a3a : hex(C.yellow), on);
    }
    {
      const up = this.sim.drops.filter((d) => !d.down).length;
      const on = up > 0 && (up === 1 ? blink(5) : true);
      arrow(420, 590, -0.9, hex(C.orange), on || R.isLit('dropbank'));
    }
    for (const [id, x, ang] of [['orbitL', 60, -Math.PI / 2 - 0.12], ['orbitR', 532, -Math.PI / 2 + 0.12]]) {
      const on = R.multiball ? blink(4) : R.isLit('orbit') ? blink(10) : R.orbits > 0 || blink(0.6);
      arrow(x, 410, ang, R.multiball ? 0xff5a3a : 0x6fd3ff, on);
    }

    // 中央 EVOLUTION 進度燈
    L.inserts.forEach((ins, i) => {
      const on = R.orbits > i || (R.isLit('orbit') && blink(8));
      g.fillStyle(0x0a1724, 1).fillCircle(ins.x, ins.y, 11);
      g.fillStyle(on ? hex(C.yellow) : 0x5a3a1c, 1).fillCircle(ins.x, ins.y, 8);
      if (on) g.fillStyle(0xffffff, 0.6).fillCircle(ins.x - 2, ins.y - 2, 3);
    });

    // 球保燈（SHOOT AGAIN）
    const saving = R.state === 'play' && t < R.ballSaveUntil;
    const on = saving && (R.ballSaveUntil - t > 3 || blink(5));
    g.fillStyle(on ? 0xff6a4a : 0x4a1a14, 1).fillCircle(296, 1068, 8);
    g.lineStyle(2, hex(C.cream), 1).strokeCircle(296, 1068, 8);

    // ---- 擋板 ----
    const gf = this.gFlip;
    gf.clear();
    for (const f of this.sim.flippers) {
      const ang = f.pAng + (f.ang - f.pAng) * a;
      this.drawFlipper(gf, f, ang, 3, 5, 0x000000, 0.35);
      this.drawFlipper(gf, f, ang, 0, 0, 0xd8402b, 1);          // 紅色橡膠圈
      this.drawFlipper(gf, f, ang, 0, 0, 0xf7f0dc, 1, -3.2);     // 本體
      gf.fillStyle(0x9aa4ad, 1).fillCircle(f.x, f.y, 4);
      gf.fillStyle(0xffffff, 0.8).fillCircle(f.x - 1, f.y - 1, 1.5);
    }

    // ---- 發射台 ----
    const gp = this.gPlunger;
    gp.clear();
    const pl = this.sim.plunger;
    const py = pl.pY + (pl.y - pl.pY) * a;
    const top = py;
    gp.fillStyle(0x0a1724, 1).fillRect(PLUNGER.x0 - 1, top - 2, PLUNGER.x1 - PLUNGER.x0 + 2, 8);
    gp.fillStyle(0xc9d3dc, 1).fillRect(PLUNGER.x0, top - 1, PLUNGER.x1 - PLUNGER.x0, 6);
    gp.fillStyle(0x9aa4ad, 1).fillRect(593, top + 5, 6, 1130 - top);
    // 彈簧
    gp.lineStyle(2, 0xd9c79c, 1);
    const coils = 8, sy = top + 8, ey = 1118;
    for (let i = 0; i < coils; i++) {
      const y0 = sy + ((ey - sy) * i) / coils, y1 = sy + ((ey - sy) * (i + 1)) / coils;
      gp.lineBetween(584, y0, 608, (y0 + y1) / 2);
      gp.lineBetween(608, (y0 + y1) / 2, 584, y1);
    }
    // 蓄力條
    if (pl.pull > 0.01) {
      gp.fillStyle(0x000000, 0.5).fillRect(563, 930, 6, 120);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0xf4b93a), Phaser.Display.Color.ValueToColor(0xd8402b), 100, pl.pull * 100);
      gp.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(563, 1050 - pl.pull * 120, 6, pl.pull * 120);
    }
    // 手機提示：等待發射時閃爍
    if (R.state === 'play' && this.ballWaiting() && pl.pull < 0.01 && blink(1.5)) {
      gp.fillStyle(0xf4b93a, 0.9);
      gp.fillTriangle(596, 1000, 588, 1012, 604, 1012);
    }

    // ---- 球（插值）----
    const alive = new Set();
    for (const b of this.sim.balls) {
      alive.add(b.id);
      let s = this.ballSprites.get(b.id);
      if (!s) {
        s = {
          img: this.add.image(0, 0, 'ball'),
          sh: this.add.image(0, 0, 'shadow').setScale(1 / TEX_S),
          glow: this.add.image(0, 0, 'ballglow').setScale(1 / TEX_S).setBlendMode(Phaser.BlendModes.ADD).setDepth(6.9),
        };
        this.ballSprites.set(b.id, s);
      }
      const x = b.px + (b.x - b.px) * a, y = b.py + (b.y - b.py) * a;
      // 坡道上：球在壓克力上方（較大、影子較遠）
      const up = !!b.ramp;
      const sunk = !!b.held;
      s.img.setPosition(x, y).setDepth(up ? 7.6 : 7).setScale((up ? 1.1 : sunk ? 0.82 : 1) / (TEX_S * 1.6));
      s.sh.setPosition(x + (up ? 8 : 3) + (x - 296) * 0.012, y + (up ? 12 : 6)).setDepth(up ? 7.55 : 5).setAlpha(up ? 0.7 : 1);
      s.glow.setPosition(x, y).setDepth(up ? 7.58 : 6.9).setVisible(!sunk);
    }
    for (const [id, s] of this.ballSprites) {
      if (!alive.has(id)) { s.img.destroy(); s.sh.destroy(); s.glow.destroy(); this.ballSprites.delete(id); }
    }

    // 滾動聲
    let maxSp = 0;
    for (const b of this.sim.balls) if (b.x < 572 || b.y < 1000) maxSp = Math.max(maxSp, Math.hypot(b.vx, b.vy));
    this.sfx.setRoll(maxSp);

    // 多球時邊框光暈
    const fx = this.gFx;
    fx.clear();
    if (R.multiball) {
      fx.lineStyle(6, 0xf4b93a, 0.25 + 0.2 * Math.sin(t * 8));
      fx.beginPath(); fx.arc(320, 320, 296, Math.PI, Math.PI * 2); fx.strokePath();
    }
  }

  // 錐形擋板多邊形（兩圓外切線）
  drawFlipper(g, f, ang, ox, oy, col, alpha, inset = 0) {
    const r1 = f.r1 + inset, r2 = f.r2 + inset;
    const L = f.len;
    const phi = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / L)));
    const pts = [];
    const x1 = f.x + ox, y1 = f.y + oy;
    const x2 = x1 + Math.cos(ang) * L, y2 = y1 + Math.sin(ang) * L;
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const aa = ang + phi + ((Math.PI * 2 - 2 * phi) * i) / N;
      pts.push(new Phaser.Math.Vector2(x1 + Math.cos(aa) * r1, y1 + Math.sin(aa) * r1));
    }
    for (let i = 0; i <= N; i++) {
      const aa = ang - phi + (2 * phi * i) / N;
      pts.push(new Phaser.Math.Vector2(x2 + Math.cos(aa) * r2, y2 + Math.sin(aa) * r2));
    }
    g.fillStyle(col, alpha).fillPoints(pts, true);
  }
}

// ---- 啟動：先等字型載入，貼圖文字才正確 ----
async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('20px Bungee'), document.fonts.load('12px Rubik')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* 離線時使用備用字型 */ }
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    transparent: true,
    // 背景分頁載入時 innerWidth 可能為 0 → 給安全預設值，稍後 onResize 會修正
    width: Math.max(320, window.innerWidth || 0),
    height: Math.max(480, window.innerHeight || 0),
    scale: { mode: Phaser.Scale.NONE },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { smoothStep: false },
    input: { activePointers: 5 },
    scene: [TableScene],
  });
  window.__game = game;
  document.getElementById('loading')?.remove();
}
boot();
