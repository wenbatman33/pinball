// 遊戲規則（計分、球數、任務、多球）— 與渲染分離
import { BALL_START } from './table.js';

const HS_KEY = 'pinball.blue.highscore';

export class GameRules {
  constructor(sim, sfx, ui) {
    this.sim = sim;
    this.sfx = sfx;
    this.ui = ui;
    this.state = 'attract';
    this.high = +(safeGet(HS_KEY) || 0);
    this.reset();
  }

  reset() {
    this.score = 0;
    this.ball = 1;
    this.maxBalls = 3;
    this.mult = 1;
    this.bonus = 0;
    this.lanes = [false, false, false];
    this.banks = { L: [false, false, false], R: [false, false, false] };
    this.orbits = 0;
    this.multiball = false;
    this.ballSaveUntil = 0;
    this.saveArmed = false;
    this.launched = false;
    this.pendingBalls = 0;
    this.flash = {};          // 元件閃光計時
    this.kick = { L: true, R: true }; // outlane 救球裝置（每顆球各一次）
    this.dropResetPending = false;
    if (this.sim.drops) this.sim.resetDrops();
    this.lastRamp = null;
    this.ramps = 0;
    this.ring = 0;            // WORMHOLE 燈環（0~12）
    this.wormLit = false;
    this.lastOrbit = null;
  }

  now() { return this.sim.time; }

  startGame() {
    this.reset();
    this.state = 'play';
    this.sim.balls.length = 0;
    this.serveBall();
    this.sfx.start();
    this.ui.message('BALL 1', this.ui.scene.isTouch ? 'HOLD RIGHT SIDE · RELEASE TO LAUNCH' : 'HOLD SPACE · RELEASE TO LAUNCH', 2.2);
  }

  serveBall() {
    const b = this.sim.addBall(BALL_START.x, BALL_START.y);
    b.skipFirstOrbit = true;
    this.kick = { L: true, R: true }; // 新球：兩側救球重新待命
    this.launched = false;
    this.saveArmed = true;
  }

  // 加分；給座標時在撞擊點跳出飄字
  add(pts, x, y, big = false) {
    const m = this.multiball ? 2 : 1;
    this.score += pts * m;
    if (x !== undefined) this.ui.popup(x, y, pts * m, big);
  }

  light(id, dur = 0.25) { this.flash[id] = this.now() + dur; }
  isLit(id) { return (this.flash[id] || 0) > this.now(); }

  // 每 tick 呼叫
  update() {
    const sim = this.sim;
    for (const e of sim.events) this.onEvent(e);
    sim.events.length = 0;
    if (this.state !== 'play') {
      if (this.dropResetPending && this.now() > this.dropResetAt && sim.resetDrops()) this.dropResetPending = false;
      return;
    }

    // 球離開發射道 → 啟動球保
    for (const b of sim.balls) {
      if (!b.launchedFlag && b.x < 568) {
        b.launchedFlag = true;
        if (this.saveArmed) { this.ballSaveUntil = this.now() + 10; this.saveArmed = false; }
      }
      // 球已落到台面下半部 → 之後的繞行都算數
      if (b.skipFirstOrbit && b.launchedFlag && b.y > 600) b.skipFirstOrbit = false;
      // 卡球偵測：低速超過 2.5 秒且不在擋板/發射道 → 自動輕推
      const sp = Math.hypot(b.vx, b.vy);
      // 只有「玩家按住擋板托球」或在發射道時不算卡球
      const cradled = b.y > 900 && sim.flippers.some((f) => f.pressed);
      const inLane = b.x > 572;
      if (sp < 12 && !cradled && !inLane && !b.ramp && !b.held) {
        b.stillT += 1 / 120;
        if (b.stillT > 2.5) {
          b.vx += (Math.random() - 0.5) * 300; b.vy -= 250;
          b.stillT = 0;
          this.ui.message('NUDGE', '', 0.8);
        }
      } else b.stillT = 0;
    }

    // Drop Target 重新升起（有球壓住就稍後再試）
    if (this.dropResetPending && this.now() > this.dropResetAt) {
      if (sim.resetDrops()) { this.dropResetPending = false; this.banks.R = [false, false, false]; this.sfx.burst(0.1, 700, 1, 0.3); }
    }

    // 多球補球（錯開發射）
    if (this.pendingBalls > 0 && this.now() > (this.nextBallAt || 0)) {
      this.pendingBalls--;
      this.nextBallAt = this.now() + 0.9;
      const b = sim.addBall(596, 720, 0, -2500);
      b.launchedFlag = true;
      b.skipFirstOrbit = true;
      this.sfx.launch(2500);
    }

    // 多球結束
    if (this.multiball && sim.balls.length + this.pendingBalls <= 1) {
      this.multiball = false;
      this.ui.message('MULTIBALL OVER', '', 1.5);
    }
  }

  onEvent(e) {
    const play = this.state === 'play';
    switch (e.type) {
      case 'bumper':
        this.sfx.bumper();
        this.light(e.id, 0.18);
        if (play) { this.add(100, e.x, e.y - 34); this.bonus += 20; }
        this.ui.spark(e.x, e.y, 16);
        this.ui.ring(e.x, e.y);
        // 連續快打 bumper → 微震
        this.bumperChain = this.now() - (this.lastBumperT || 0) < 0.5 ? (this.bumperChain || 0) + 1 : 1;
        this.lastBumperT = this.now();
        if (this.bumperChain >= 3) this.ui.shake(0.0025);
        this.ui.vibrate(8);
        break;
      case 'sling':
        this.sfx.sling();
        this.light(e.id, 0.15);
        if (play) this.add(50, e.x, e.y);
        this.ui.spark(e.x, e.y, 8);
        break;
      case 'rubber':
        this.sfx.rubber();
        if (e.w && e.w.post) this.light(e.w.post, 0.15);
        this.ui.spark(e.x, e.y, 4);
        if (play) this.add(10, e.x, e.y);
        break;
      case 'target': {
        this.sfx.target();
        this.light(e.id, 0.3);
        if (!play) break;
        const idx = +e.id.slice(-1) - 1;
        const bank = this.banks[e.bank];
        this.add(500, e.x, e.y); this.bonus += 100;
        if (!bank[idx]) {
          bank[idx] = true;
          if (bank.every(Boolean)) {
            this.add(3000);
            this.addRing(2);
            this.sfx.award();
            this.ui.message(e.bank === 'L' ? 'SATELLITE COMPLETE' : 'SHOOTING STAR COMPLETE', '+3,000', 1.6);
            if (!this.kick[e.bank]) { this.kick[e.bank] = true; setTimeout(() => this.ui.message('KICKBACK LIT', e.bank === 'L' ? 'LEFT SAVE READY' : 'RIGHT SAVE READY', 1.4), 900); }
            if (this.banks.L.every(Boolean) && this.banks.R.every(Boolean)) this.startMultiball();
          }
        }
        break;
      }
      case 'sensor': this.onSensor(e); break;
      case 'flipperHit': this.sfx.flipperHit(e.power); break;
      case 'ballHit': this.sfx.ballHit(); break;
      case 'plunger': this.sfx.launch(e.power); break;
      case 'drain': this.onDrain(e.ball); break;
      case 'rampEnter': this.sfx.rampEnter(); break;
      case 'saucer': this.onSaucer(e); break;
      case 'saucerKick': this.sfx.kickback(); this.ui.spark(e.x ?? 296, e.y ?? 660, 10); break;
      case 'drop': {
        // 右側 SHOOTING STAR 組為 Drop Target：倒下即點亮該格
        this.sfx.target(); this.light(e.id, 0.2);
        this.ui.spark(e.x, e.y, 10);
        const allDown = this.sim.drops.every((d) => d.down) && !this.dropResetPending;
        if (allDown) { this.dropResetPending = true; this.dropResetAt = this.now() + 1.5; this.light('dropbank', 1.5); }
        if (!play) break;
        this.add(750, e.x, e.y); this.bonus += 100;
        this.banks[e.bank || 'R'][+e.id.slice(-1) - 1] = true;
        if (allDown) {
          this.add(10000);
          this.addRing(3);
          this.sfx.award();
          this.ui.message('SHOOTING STAR COMPLETE', '+10,000', 1.6);
          if (!this.kick.R) { this.kick.R = true; setTimeout(() => this.ui.message('KICKBACK LIT', 'RIGHT SAVE READY', 1.4), 900); }
          if (this.banks.L.every(Boolean) && this.banks.R.every(Boolean)) this.startMultiball();
        }
        break;
      }
      case 'spinHit': this.sfx.spin(); break;
      case 'spin': if (play) this.add(100, e.x + 30, e.y); this.sfx.spin(); break;
      case 'ramp': this.onRamp(e); break;
    }
  }

  onSensor(e) {
    const play = this.state === 'play';
    const id = e.id;
    if (id.startsWith('lane')) {
      const i = 'SKY'.indexOf(id.slice(-1));
      this.sfx.rollover();
      this.light(id, 0.4);
      if (!play) return;
      this.add(250, e.ball.x, e.ball.y - 20);
      if (!this.lanes[i]) {
        this.lanes[i] = true;
        if (this.lanes.every(Boolean)) {
          this.mult = Math.min(6, this.mult + 1);
          this.add(5000);
          this.addRing(2);
          this.sfx.award();
          this.ui.message(`BONUS ×${this.mult}`, 'SKY LANES COMPLETE +5,000', 1.8);
          setTimeout(() => (this.lanes = [false, false, false]), 600);
        }
      }
    } else if (id === 'inL' || id === 'inR') {
      this.sfx.rollover(); this.light(id, 0.4);
      if (play) this.add(500, e.ball.x, e.ball.y - 20);
    } else if (id === 'outL' || id === 'outR') {
      this.light(id, 0.6);
      if (!play) {
        // 待機展示：照樣救回
        this.sim.kick(e.ball, 0, -this.sim.P.kickback);
        return;
      }
      this.add(1000);
      const side = id === 'outL' ? 'L' : 'R';
      if (this.kick[side] && e.ball.vy > 0) {
        // 第一次掉入：救球裝置把球彈回台面；第二次就會出界
        this.kick[side] = false;
        this.sim.kick(e.ball, (Math.random() - 0.5) * 60, -this.sim.P.kickback);
        this.light('kick' + side, 0.5);
        this.sfx.kickback();
        this.ui.message('SAVED!', 'KICKBACK USED — NEXT TIME IT DRAINS', 1.6);
        this.ui.shake();
      }
    } else if (id === 'orbitL' || id === 'orbitR') {
      // 完整繞行：左右感應器在 2 秒內依序觸發；剛發射的球第一次繞行不算
      const b = e.ball;
      const other = id === 'orbitL' ? 'orbitR' : 'orbitL';
      if (b.lastOrbit && b.lastOrbit.id === other && this.now() - b.lastOrbit.t < 2) {
        b.lastOrbit = null;
        if (b.skipFirstOrbit) { b.skipFirstOrbit = false; return; }
        if (play) this.orbitAward();
      } else b.lastOrbit = { id, t: this.now() };
    }
  }

  onRamp(e) {
    this.light(e.id, 0.8);
    if (this.state !== 'play') return;
    const combo = this.lastRamp && this.lastRamp.id !== e.id && this.now() - this.lastRamp.t < 5;
    this.lastRamp = { id: e.id, t: this.now() };
    this.ramps++;
    this.bonus += 250;
    this.addRing(2);
    if (this.multiball) {
      this.add(15000, e.ball.x + 30, e.ball.y - 30, true);
      this.sfx.jackpot();
      this.ui.message('RAMP JACKPOT!', '+30,000', 1.6);
      return;
    }
    const pts = combo ? 15000 : 5000;
    this.add(pts, e.ball.x + 30, e.ball.y - 30, true);
    this.sfx.ramp(combo);
    this.ui.message(combo ? 'COMBO!' : 'SKY RAMP', `+${fmt(pts)}`, 1.3);
  }

  addRing(n) {
    if (this.state !== 'play' || this.wormLit) return;
    this.ring = Math.min(12, this.ring + n);
    if (this.ring >= 12) {
      this.wormLit = true;
      this.sfx.award();
      setTimeout(() => this.ui.message('WORMHOLE LIT', 'SHOOT THE CENTER HOLE', 1.8), 700);
    }
  }

  onSaucer(e) {
    this.sfx.saucer();
    this.light('wormhole', 1.0);
    if (this.state !== 'play') return;
    if (this.wormLit) {
      this.wormLit = false;
      this.ring = 0;
      this.add(100000, e.x, e.y - 30, true);
      this.sfx.jackpot();
      this.ui.message('WORMHOLE!', '+100,000', 2.4);
      this.ui.shake();
    } else {
      this.add(2500, e.x, e.y - 30);
      this.addRing(1);
    }
  }

  orbitAward() {
    this.light('orbit', 0.8);
    if (this.multiball) {
      this.add(10000);
      this.sfx.jackpot();
      this.ui.message('JACKPOT!', '+20,000', 1.8);
      this.ui.shake();
      return;
    }
    this.orbits++;
    this.add(2500);
    this.addRing(2);
    this.sfx.award();
    if (this.orbits >= 3) {
      this.orbits = 0;
      this.add(50000);
      this.sfx.jackpot();
      this.ui.message('EVOLUTION!', '+50,000', 2.2);
      this.ui.shake();
    } else this.ui.message('ORBIT', `${this.orbits} / 3 EVOLUTION`, 1.2);
  }

  startMultiball() {
    this.banks.L = [false, false, false];
    this.multiball = true;
    this.pendingBalls += 2;
    this.nextBallAt = this.now() + 0.8;
    this.ballSaveUntil = Math.max(this.ballSaveUntil, this.now() + 12);
    this.sfx.jackpot();
    this.ui.message('MULTIBALL!', 'ALL SCORES ×2 · ORBITS = JACKPOT', 2.4);
    this.ui.shake();
  }

  onDrain(b) {
    if (this.state !== 'play') return;
    // 球保
    if (this.now() < this.ballSaveUntil && b.launchedFlag) {
      this.sfx.saved();
      this.ui.message('BALL SAVED', '', 1.4);
      if (this.multiball) { this.pendingBalls++; }
      else { this.serveBallAuto(); }
      return;
    }
    if (this.sim.balls.length + this.pendingBalls > 0) return; // 多球中還有球
    this.sfx.drain();
    // 結算獎勵
    const bonus = this.bonus * this.mult;
    this.score += bonus;
    this.bonus = 0;
    this.mult = 1;
    if (this.ball >= this.maxBalls) {
      this.gameOver(bonus);
    } else {
      this.ball++;
      this.ui.message(`BONUS ${fmt(bonus)}`, `BALL ${this.ball}`, 2);
      setTimeout(() => { if (this.state === 'play') this.serveBall(); }, 900);
    }
  }

  serveBallAuto() {
    // 球保：直接由發射道自動送出
    const b = this.sim.addBall(596, 720, 0, -2500);
    b.launchedFlag = true;
    b.skipFirstOrbit = true;
    this.sfx.launch(2500);
  }

  gameOver(bonus) {
    this.state = 'gameover';
    this.sfx.gameOver();
    const isHigh = this.score > this.high;
    if (isHigh) { this.high = this.score; safeSet(HS_KEY, String(this.high)); }
    this.ui.message('GAME OVER', isHigh ? 'NEW HIGH SCORE!' : `BONUS ${fmt(bonus)}`, 3);
    setTimeout(() => this.ui.showStart(true), 1600);
  }

  // 擋板按下時的換道（S-K-Y 燈號旋轉）
  laneChange(dir) {
    if (this.state !== 'play') return;
    const l = this.lanes;
    this.lanes = dir > 0 ? [l[2], l[0], l[1]] : [l[1], l[2], l[0]];
  }
}

export function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 無痕模式忽略 */ } }
