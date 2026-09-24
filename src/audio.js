// WebAudio 即時合成音效（免素材檔、零延遲）
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.rollGain = null;
  }

  // 瀏覽器規定需在使用者操作後才能啟動
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    // 白噪音 buffer
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 棕噪音 buffer（能量集中在低頻 → 鋼珠滾在木板上的低沉轟隆聲）
    this.brown = this.ctx.createBuffer(1, len * 2, this.ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.startRoll();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  // 滾動聲：濾波噪音，音量隨球速
  startRoll() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.brown; src.loop = true;
    // 低通 + 微弱共鳴：木板台面的「嗡嗡」底噪，而非風聲
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.7;
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 95; body.Q.value = 1.2; body.gain.value = 5;
    this.rollGain = c.createGain(); this.rollGain.gain.value = 0;
    src.connect(lp).connect(body).connect(this.rollGain).connect(this.master);
    src.start();
    this.rollFilter = lp;
  }

  setRoll(speed) {
    if (!this.rollGain) return;
    // 低速幾乎無聲；速度越快音量越大、音色越亮（但仍保持低沉）
    const v = Math.min(1, Math.max(0, (speed - 60) / 2000));
    this.rollGain.gain.setTargetAtTime(Math.pow(v, 1.3) * 0.22, this.ctx.currentTime, 0.06);
    this.rollFilter.frequency.setTargetAtTime(140 + v * 260, this.ctx.currentTime, 0.06);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  burst(dur, freq, q = 1, vol = 0.3, type = 'bandpass') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // 線圈作動：低頻「咚」+ 短促機械喀聲
  thump(f0, f1, dur, vol) { this.tone(f0, dur, 'sine', vol, f1); }
  flipper() { this.thump(90, 45, 0.09, 0.32); this.burst(0.025, 1400, 1.2, 0.2, 'lowpass'); }
  flipperHit(p) { this.clack(Math.min(1, p / 2500)); }
  bumper() { this.thump(140, 55, 0.13, 0.4); this.burst(0.03, 2200, 1.5, 0.3); this.tone(1180, 0.09, 'triangle', 0.05); }
  sling() { this.thump(170, 70, 0.08, 0.32); this.burst(0.03, 1800, 2, 0.3); }
  // 鋼珠撞金屬：短促、帶一點高頻共鳴的「喀」
  clack(k) {
    if (!this.ctx) return;
    this.burst(0.018, 3800, 4, 0.05 + k * 0.22, 'bandpass');
    this.tone(2900 + Math.random() * 400, 0.03, 'sine', 0.015 + k * 0.05);
  }
  target() { this.tone(1400, 0.06, 'square', 0.1); this.burst(0.03, 4000, 4, 0.2); }
  rollover() { this.tone(1320, 0.18, 'sine', 0.18); this.tone(1980, 0.22, 'sine', 0.1, null, 0.05); }
  wall(p) { this.clack(Math.min(1, p / 2200)); }
  ballHit() { this.clack(0.8); this.tone(3400, 0.05, 'sine', 0.05); }
  launch(power) { this.burst(0.35, 600 + power / 4, 1, 0.3, 'lowpass'); this.tone(90, 0.12, 'triangle', 0.3, 45); }
  plungerPull() { this.burst(0.12, 300, 2, 0.12); }
  // 橡膠：悶一點的「啪」
  rubber() { this.burst(0.03, 900, 1.2, 0.2, 'lowpass'); this.thump(220, 120, 0.04, 0.1); }
  saucer() { this.tone(300, 0.35, 'sawtooth', 0.12, 60); this.tone(900, 0.3, 'sine', 0.08, 200, 0.05); }
  spin() { this.tone(2200 + Math.random() * 300, 0.025, 'square', 0.06); }
  rampEnter() { this.burst(0.25, 1400, 0.7, 0.12, 'lowpass'); }
  ramp(combo) { [659, 880, 1175].concat(combo ? [1568] : []).forEach((f, i) => this.tone(f, 0.14, 'square', 0.1, null, i * 0.06)); }
  kickback() { this.burst(0.08, 500, 1, 0.45); this.tone(140, 0.18, 'square', 0.25, 60); }
  drain() { this.tone(440, 0.5, 'sawtooth', 0.12, 110); this.tone(330, 0.6, 'sawtooth', 0.08, 80, 0.1); }
  award() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.1, null, i * 0.07)); }
  jackpot() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.25, 'square', 0.12, null, i * 0.08)); }
  saved() { this.tone(660, 0.15, 'triangle', 0.2); this.tone(990, 0.25, 'triangle', 0.2, null, 0.12); }
  start() { [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18, null, i * 0.09)); }
  gameOver() { [523, 392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, null, i * 0.16)); }
}
