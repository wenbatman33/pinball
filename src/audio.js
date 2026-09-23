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
    src.buffer = this.noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 380;
    this.rollGain = c.createGain(); this.rollGain.gain.value = 0;
    src.connect(bp).connect(this.rollGain).connect(this.master);
    src.start();
    this.rollFilter = bp;
  }

  setRoll(speed) {
    if (!this.rollGain) return;
    const v = Math.min(1, speed / 2200);
    this.rollGain.gain.setTargetAtTime(v * 0.16, this.ctx.currentTime, 0.05);
    this.rollFilter.frequency.setTargetAtTime(250 + v * 700, this.ctx.currentTime, 0.05);
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

  flipper() { this.burst(0.05, 2400, 0.8, 0.22); this.tone(110, 0.07, 'triangle', 0.25, 60); }
  flipperHit(p) { this.tone(180, 0.06, 'square', Math.min(0.2, p / 8000), 90); }
  bumper() { this.tone(820, 0.16, 'square', 0.14, 240); this.burst(0.04, 3200, 2, 0.25); }
  sling() { this.burst(0.06, 1800, 3, 0.35); this.tone(420, 0.08, 'triangle', 0.2, 180); }
  target() { this.tone(1400, 0.06, 'square', 0.1); this.burst(0.03, 4000, 4, 0.2); }
  rollover() { this.tone(1320, 0.18, 'sine', 0.18); this.tone(1980, 0.22, 'sine', 0.1, null, 0.05); }
  wall(p) { this.burst(0.03, 900, 1.5, Math.min(0.18, p / 9000)); }
  ballHit() { this.tone(2600, 0.04, 'sine', 0.12); }
  launch(power) { this.burst(0.35, 600 + power / 4, 1, 0.3, 'lowpass'); this.tone(90, 0.12, 'triangle', 0.3, 45); }
  plungerPull() { this.burst(0.12, 300, 2, 0.12); }
  rubber() { this.burst(0.035, 2600, 3, 0.16); this.tone(900, 0.04, 'triangle', 0.08); }
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
