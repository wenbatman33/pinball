// DEV 開發者微調工具
//  - D 鍵或右下齒輪開啟
//  - 直接用滑鼠拖曳彈跳器 / 彈弓頂點 / 擋板轉軸 / 立靶 / 感應器
//  - 右側面板：物理參數滑桿、選取元件屬性、狀態觸發、PC/Mobile 預覽
//  - 💾 匯出：複製 JSON（同時存 localStorage，重整後保留）
import { PHYS_DEFAULT, LAYOUT_DEFAULT } from './table.js';

const STORE = 'pinball.dev.v1';

export function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
}

const PHYS_UI = [
  ['gravity', '重力', 600, 3000, 10],
  ['flipperOmega', '擋板角速度', 8, 40, 0.5],
  ['flipperReturnOmega', '擋板回彈速度', 6, 40, 0.5],
  ['flipperAccel', '擋板角加速度', 300, 5000, 50],
  ['flipperFriction', '擋板橡膠摩擦', 0, 0.8, 0.01],
  ['flipperE', '擋板恢復係數', 0, 0.9, 0.01],
  ['wallE', '牆恢復係數', 0, 0.9, 0.01],
  ['rubberE', '橡膠恢復係數', 0, 0.95, 0.01],
  ['bumperKick', '彈跳器彈力', 200, 1600, 10],
  ['slingKick', '彈弓彈力', 100, 1400, 10],
  ['slingThreshold', '彈弓觸發門檻', 20, 400, 5],
  ['plungerMin', '發射最小速度', 300, 2000, 10],
  ['plungerMax', '發射最大速度', 1500, 3400, 10],
  ['friction', '摩擦係數 μ', 0, 0.5, 0.005],
  ['restThreshold', '靜止門檻', 0, 150, 1],
  ['timeScale', '時間倍率(慢動作)', 0.1, 1.5, 0.05],
];

export class DevTool {
  constructor(scene) {
    this.scene = scene;
    this.open = false;
    this.sel = null;
    this.drag = null;
    this.showColliders = true;
    this.forceMode = null;
    this.build();
  }

  // 所有可拖曳把手
  handles() {
    const L = this.scene.layoutData;
    const H = [];
    for (const b of L.bumpers) H.push({ obj: b, kx: 'x', ky: 'y', name: b.id, props: [['r', 14, 44, 1]] });
    for (const s of L.slings) {
      H.push({ obj: s, kx: 'ax', ky: 'ay', name: s.id + '.上角', group: s });
      H.push({ obj: s, kx: 'bx', ky: 'by', name: s.id + '.下角', group: s });
      H.push({ obj: s, kx: 'cx', ky: 'cy', name: s.id + '.右角', group: s });
    }
    for (const f of L.flippers) H.push({ obj: f, kx: 'x', ky: 'y', name: f.id, props: [['len', 50, 110, 1], ['r1', 8, 18, 0.5], ['r2', 4, 12, 0.5], ['rest', 10, 50, 0.5], ['up', -50, 0, 0.5]] });
    for (const t of L.targets) H.push({ obj: t, kx: 'x', ky: 'y', name: t.id, props: [['a', -180, 180, 1], ['len', 16, 50, 1]] });
    for (const r of L.rollovers) H.push({ obj: r, kx: 'x', ky: 'y', name: r.id, props: [['r', 6, 24, 1]] });
    for (const d of L.drops || []) H.push({ obj: d, kx: 'x', ky: 'y', name: d.id, props: [['a', -180, 180, 1], ['len', 16, 50, 1]] });
    for (const sp of L.spinners || []) H.push({ obj: sp, kx: 'x', ky: 'y', name: sp.id, props: [['w', 20, 50, 1]] });
    for (const c of L.saucers || []) H.push({ obj: c, kx: 'x', ky: 'y', name: c.id });
    for (const p of L.posts || []) H.push({ obj: p, kx: 'x', ky: 'y', name: p.id, props: [['r', 4, 16, 0.5]] });
    for (const i of L.inserts) H.push({ obj: i, kx: 'x', ky: 'y', name: i.id });
    return H;
  }

  build() {
    const d = document.createElement('div');
    d.id = 'dev';
    d.innerHTML = `
      <div class="dev-h">🛠 DEV 微調 <span class="dev-k">D 關閉</span></div>
      <div class="dev-sec">
        <div class="dev-t">版面 / 狀態</div>
        <div class="dev-row">
          <button data-a="mode-auto" class="on">自動</button>
          <button data-a="mode-pc">PC</button>
          <button data-a="mode-mobile">Mobile</button>
        </div>
        <div class="dev-row">
          <button data-a="ball">+ 球（台面）</button>
          <button data-a="multiball">多球</button>
          <button data-a="save">球保 10s</button>
        </div>
        <div class="dev-row">
          <button data-a="evolution">EVOLUTION</button>
          <button data-a="jackpot">JACKPOT</button>
          <button data-a="gameover">結算</button>
          <button data-a="worm">WORMHOLE 亮</button>
        </div>
        <div class="dev-row">
          <button data-a="colliders" class="on">碰撞體</button>
          <button data-a="pause">暫停</button>
          <button data-a="slow">慢動作</button>
        </div>
      </div>
      <div class="dev-sec">
        <div class="dev-t">選取元件 <span id="devSelName" class="dev-k">（在桌面上點選 / 拖曳）</span></div>
        <div id="devSel"></div>
      </div>
      <div class="dev-sec">
        <div class="dev-t">底圖</div>
        <div id="devArt"></div>
      </div>
      <div class="dev-sec">
        <div class="dev-t">物理參數</div>
        <div id="devPhys"></div>
      </div>
      <div class="dev-sec">
        <div class="dev-row">
          <button data-a="export" class="primary">💾 匯出 / 鎖定</button>
          <button data-a="reset">還原預設</button>
        </div>
        <textarea id="devOut" readonly placeholder="匯出的 JSON 會出現在這裡（已同步複製到剪貼簿）"></textarea>
      </div>`;
    document.body.appendChild(d);
    this.el = d;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    d.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (a) this.action(a, e.target);
    });
    this.buildPhys();
    const art = d.querySelector('#devArt');
    const A = this.scene.artCfg;
    this.slider(art, '彩度', A.sat, 0, 1.2, 0.01, (v) => { A.sat = v; this.scene.rebuildArt(); this.persist(); });
    this.slider(art, '亮度', A.bright, 0.3, 1.2, 0.01, (v) => { A.bright = v; this.scene.rebuildArt(); this.persist(); });
  }

  slider(parent, label, val, min, max, step, onInput) {
    const row = document.createElement('label');
    row.className = 'dev-sl';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><input type="number" step="${step}" value="${val}">`;
    const [rng, num] = row.querySelectorAll('input');
    const set = (v, src) => { v = +v; if (src !== rng) rng.value = v; if (src !== num) num.value = v; onInput(v); };
    rng.addEventListener('input', () => set(rng.value, rng));
    num.addEventListener('input', () => set(num.value, num));
    parent.appendChild(row);
    return (v) => { rng.value = v; num.value = v; };
  }

  buildPhys() {
    const box = this.el.querySelector('#devPhys');
    box.innerHTML = '';
    const P = this.scene.phys;
    for (const [k, label, min, max, step] of PHYS_UI) {
      this.slider(box, label, P[k], min, max, step, (v) => { P[k] = v; this.persist(); });
    }
  }

  showSel(h) {
    this.sel = h;
    const box = this.el.querySelector('#devSel');
    this.el.querySelector('#devSelName').textContent = h ? h.name : '（在桌面上點選 / 拖曳）';
    box.innerHTML = '';
    if (!h) return;
    const apply = () => this.changed();
    this.selSetters = {
      x: this.slider(box, 'x', h.obj[h.kx], 0, 640, 1, (v) => { h.obj[h.kx] = v; apply(); }),
      y: this.slider(box, 'y', h.obj[h.ky], 0, 1120, 1, (v) => { h.obj[h.ky] = v; apply(); }),
    };
    for (const [k, min, max, step] of h.props || []) {
      this.slider(box, k, h.obj[k], min, max, step, (v) => { h.obj[k] = v; apply(); });
    }
  }

  changed() {
    this.scene.sim.rebuild();
    this.scene.syncParts();
    this.persist();
  }

  persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ phys: this.scene.phys, layout: this.scene.layoutData, art: this.scene.artCfg }));
    } catch { /* 忽略 */ }
  }

  exportJSON() {
    const out = JSON.stringify({ PHYS: this.scene.phys, LAYOUT: this.scene.layoutData, ART: this.scene.artCfg }, null, 2);
    this.el.querySelector('#devOut').value = out;
    navigator.clipboard?.writeText(out).catch(() => {});
    this.persist();
    this.scene.hud.message('EXPORTED', '已複製 JSON 到剪貼簿', 1.5);
    console.log('[DEV EXPORT]\n' + out);
  }

  action(a, btn) {
    const sc = this.scene, R = sc.rules;
    const modeBtns = this.el.querySelectorAll('[data-a^="mode-"]');
    switch (a) {
      case 'mode-auto': case 'mode-pc': case 'mode-mobile':
        this.forceMode = a === 'mode-auto' ? null : a.slice(5);
        modeBtns.forEach((b) => b.classList.toggle('on', b === btn));
        sc.onResize();
        break;
      case 'ball': sc.sim.addBall(296, 420, (Math.random() - 0.5) * 400, 0); break;
      case 'multiball': if (R.state !== 'play') sc.startGame(); R.startMultiball(); break;
      case 'save': R.ballSaveUntil = R.now() + 10; break;
      case 'evolution': R.orbits = 2; R.orbitAward(); break;
      case 'jackpot': { const m = R.multiball; R.multiball = true; R.orbitAward(); R.multiball = m; break; }
      case 'gameover': if (R.state === 'play') { R.gameOver(0); sc.sim.balls.length = 0; } break;
      case 'worm': R.ring = 11; R.addRing(1); break;
      case 'colliders': this.showColliders = !this.showColliders; btn.classList.toggle('on', this.showColliders); break;
      case 'pause': sc.paused = !sc.paused; btn.classList.toggle('on', sc.paused); break;
      case 'slow': sc.phys.timeScale = sc.phys.timeScale < 1 ? 1 : 0.25; btn.classList.toggle('on', sc.phys.timeScale < 1); this.buildPhys(); break;
      case 'export': this.exportJSON(); break;
      case 'reset':
        if (!confirm('還原為程式內建預設值？（本機調整會清除）')) break;
        try { localStorage.removeItem(STORE); } catch { /* 忽略 */ }
        Object.assign(sc.phys, JSON.parse(JSON.stringify(PHYS_DEFAULT)));
        const fresh = JSON.parse(JSON.stringify(LAYOUT_DEFAULT));
        for (const k of Object.keys(fresh)) sc.layoutData[k] = fresh[k];
        this.changed(); this.buildPhys(); this.showSel(null);
        break;
    }
  }

  toggle() {
    this.open = !this.open;
    this.el.classList.toggle('show', this.open);
    document.body.classList.toggle('dev-open', this.open);
    if (!this.open) { this.drag = null; }
  }

  worldOf(p) { return this.scene.cameras.main.getWorldPoint(p.x, p.y); }

  pointerDown(p) {
    const w = this.worldOf(p);
    let best = null, bd = 16;
    for (const h of this.handles()) {
      const d = Math.hypot(h.obj[h.kx] - w.x, h.obj[h.ky] - w.y);
      if (d < bd) { bd = d; best = h; }
    }
    // Shift + 點空白處：在該位置放一顆球（測試用）
    if (!best) {
      if (p.event?.shiftKey) { this.scene.sim.addBall(w.x, w.y, 0, 0); return true; }
      return false;
    }
    this.drag = { h: best, ox: best.obj[best.kx] - w.x, oy: best.obj[best.ky] - w.y };
    this.showSel(best);
    return true;
  }

  pointerMove(p) {
    if (!this.drag || !p.isDown) return;
    const w = this.worldOf(p);
    const { h, ox, oy } = this.drag;
    const snap = p.event?.altKey ? 1 : 0.5;
    const nx = Math.round((w.x + ox) / snap) * snap, ny = Math.round((w.y + oy) / snap) * snap;
    // 彈弓：按住 Shift 拖曳 = 整組移動
    if (h.group && p.event?.shiftKey) {
      const dx = nx - h.obj[h.kx], dy = ny - h.obj[h.ky];
      for (const [kx, ky] of [['ax', 'ay'], ['bx', 'by'], ['cx', 'cy']]) { h.group[kx] += dx; h.group[ky] += dy; }
    } else { h.obj[h.kx] = nx; h.obj[h.ky] = ny; }
    this.selSetters?.x(h.obj[h.kx]); this.selSetters?.y(h.obj[h.ky]);
    this.changed();
  }

  pointerUp() { this.drag = null; }

  draw(g) {
    g.clear();
    const sim = this.scene.sim;
    if (this.showColliders) {
      g.lineStyle(1, 0x00ff99, 0.9);
      for (const w of sim.walls) {
        if (w.type === 'arc') { g.beginPath(); g.arc(w.cx, w.cy, w.R, w.a0, w.a1); g.strokePath(); }
        else { g.lineStyle(1, w.type === 'gate' ? 0xff00ff : 0x00ff99, 0.9); g.lineBetween(w.ax, w.ay, w.bx, w.by); }
      }
      g.lineStyle(1, 0x00e5ff, 0.9);
      for (const s of sim.slingSegs) g.lineBetween(s.ax, s.ay, s.bx, s.by);
      for (const t of sim.targets) g.lineBetween(t.ax, t.ay, t.bx, t.by);
      for (const t of sim.drops) if (!t.down) g.lineBetween(t.ax, t.ay, t.bx, t.by);
      for (const b of sim.bumpers) g.strokeCircle(b.x, b.y, b.r);
      g.lineStyle(1, 0xffff00, 0.7);
      for (const s of sim.sensors) g.strokeCircle(s.x, s.y, s.r);
      for (const f of sim.flippers) {
        const G = sim.flipperGeom(f);
        g.lineStyle(1, 0xff5555, 1).lineBetween(G.x, G.y, G.tx, G.ty);
        // 擋板活動範圍
        g.lineStyle(1, 0xff5555, 0.35);
        g.beginPath(); g.arc(f.x, f.y, f.len, Math.min(f.restA, f.upA), Math.max(f.restA, f.upA)); g.strokePath();
      }
      g.lineStyle(1, 0xffffff, 0.8);
      for (const b of sim.balls) g.strokeCircle(b.x, b.y, sim.P.ballRadius);
    }
    // 把手
    for (const h of this.handles()) {
      const x = h.obj[h.kx], y = h.obj[h.ky];
      const on = this.sel && this.sel.obj === h.obj && this.sel.kx === h.kx;
      g.fillStyle(on ? 0xff3366 : 0xffffff, on ? 1 : 0.85).fillCircle(x, y, on ? 5 : 3.5);
      g.lineStyle(1, 0x000000, 1).strokeCircle(x, y, on ? 5 : 3.5);
    }
  }
}
