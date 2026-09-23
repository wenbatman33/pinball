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
      save: this.$('saveLamp'),
      mute: this.$('muteBtn'), gear: this.$('gearBtn'),
    };
    this.cache = {};
    this.msgTimer = null;
    this.el.start.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); scene.startGame(); });
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
