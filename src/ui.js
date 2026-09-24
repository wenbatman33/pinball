// DOM HUD（清晰文字、響應式 PC / Mobile 版面）
import { fmt } from './game.js';

// 手機版以台面可見寬度（去掉左右木框）計算縮放
export const VIEW_W = 624;
const WORLD_H = 1120;

export class HUD {
  constructor(scene) {
    this.scene = scene;
    this.$ = (id) => document.getElementById(id);
    this.el = {
      root: this.$('hud'),
      score: this.$('score'), ball: this.$('ballNo'), high: this.$('high'), mult: this.$('mult'),
      msg: this.$('msg'), msgT: this.$('msgTitle'), msgS: this.$('msgSub'),
      start: this.$('start'), startHigh: this.$('startHigh'),
      over: this.$('over'), overScore: this.$('overScore'), overHigh: this.$('overHigh'),
      overNew: this.$('overNew'), overStats: this.$('overStats'),
      save: this.$('saveLamp'),
      mute: this.$('muteBtn'), gear: this.$('gearBtn'),
    };
    this.cache = {};
    this.msgTimer = null;
    this.endShownAt = 0;
    const tap = (id, fn) => this.$(id).addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    tap('btnStart', () => scene.startGame());
    tap('btnAgain', () => scene.startGame());
    tap('btnMenu', () => {
      if (!this.endReady()) return;
      scene.rules.state = 'attract'; // 回到待機，開始畫面才能正常開新局
      this.hideEnd();
      this.showStart(true);
    });
    // 開始畫面：點任何地方都可開始（按鈕只是視覺焦點）
    this.el.start.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); scene.startGame(); });
    // 結束畫面：吞掉點擊，避免穿透到台面
    this.el.over.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    this.el.mute.addEventListener('pointerdown', (e) => { e.stopPropagation(); scene.toggleMute(); });
    this.el.gear.addEventListener('pointerdown', (e) => { e.stopPropagation(); scene.dev.toggle(); });
  }

  set(key, el, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    el.textContent = val;
  }

  update(r) {
    if (this.cache.score !== fmt(r.score) && this.cache.score !== undefined) {
      // 分數增加 → 跳動
      this.el.score.classList.remove('bump'); void this.el.score.offsetWidth; this.el.score.classList.add('bump');
    }
    this.set('score', this.el.score, fmt(r.score));
    this.set('ball', this.el.ball, r.state === 'play' ? `${r.ball} / ${r.maxBalls}` : '-');
    this.set('high', this.el.high, fmt(r.high));
    this.set('mult', this.el.mult, `×${r.mult}`);
    const saving = r.state === 'play' && r.now() < r.ballSaveUntil;
    if (this.cache.save !== saving) { this.cache.save = saving; this.el.save.classList.toggle('on', saving); }
  }

  message(title, sub = '', dur = 1.5) {
    const { msg, msgT, msgS } = this.el;
    msgT.textContent = title;
    msgS.textContent = sub;
    msg.classList.remove('show');
    void msg.offsetWidth; // 重新觸發動畫
    msg.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => msg.classList.remove('show'), dur * 1000);
  }

  showStart(on) {
    this.el.startHigh.textContent = fmt(this.scene.rules.high);
    this.el.start.classList.toggle('show', on);
  }

  // 結束畫面：分數滾動計數 + 新紀錄 + 本局統計
  showEnd({ score, high, isHigh, stats }) {
    const { over, overScore, overHigh, overNew, overStats } = this.el;
    overHigh.textContent = fmt(high);
    overNew.classList.toggle('show', isHigh);
    const items = [
      ['坡道', stats.ramps], ['绕行', stats.orbits], ['JACKPOT', stats.jackpots],
      ['多球', stats.multiballs], ['弹跳器', stats.bumpers], ['救球', stats.saves],
    ];
    overStats.innerHTML = items.map(([k, v]) => `<div><b>${fmt(v)}</b><span>${k}</span></div>`).join('');
    over.classList.add('show');
    this.endShownAt = performance.now();
    // 分數從 0 滾到最終值
    const t0 = performance.now(), dur = Math.min(1400, 400 + score / 200);
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      overScore.textContent = fmt(score * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && over.classList.contains('show')) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  hideEnd() { this.el.over.classList.remove('show'); }

  // 結束畫面出現後 1.2 秒內不接受開始（避免還按著的按鍵誤觸直接開新局）
  endReady() { return performance.now() - this.endShownAt > 1200; }

  spark(x, y, n) { this.scene.spark(x, y, n); }
  ring(x, y) { this.scene.ring(x, y); }
  popup(x, y, pts, big) { this.scene.popup(x, y, pts, big); }
  shake(k = 0.006) { this.scene.cameras.main.shake(k < 0.005 ? 120 : 260, k); }
  vibrate(ms) { if (this.scene.isTouch && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* 忽略 */ } }

  // 版面：依模式設定 HUD 區塊與桌面區域（CSS px）
  layout(mode, W, H) {
    document.body.dataset.mode = mode;
    const root = document.documentElement.style;
    if (mode === 'pc') {
      const side = Math.min(260, Math.max(180, (W - H * 0.62) / 2 - 20));
      const tableW = W - side * 2;
      root.setProperty('--side', side + 'px');
      return { x: side, y: 0, w: tableW, h: H };
    }
    // 手機：台面寬度填滿、貼齊底部；上方剩餘空間做成機台「背板」（標題 + 點陣分數螢幕）
    const tableH = Math.round((W * WORLD_H) / VIEW_W);
    const top = Math.max(48, H - tableH);
    root.setProperty('--top', top + 'px');
    document.body.dataset.glass = top >= 100 ? '1' : '0';
    return { x: 0, y: top, w: W, h: H - top };
  }
}
