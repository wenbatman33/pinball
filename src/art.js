// 靜態桌面美術（Canvas 2D 繪製一次成貼圖）
// 風格：復古太空海報「EXPLORING THE BLUE」— 深藍太空、奶油色線條、橘紅閃電、地球地平線
import { WORLD, ARC_C, ARC_R } from './table.js';

export const C = {
  navy: '#0f2a40',
  deep: '#143a57',
  blue: '#1d5478',
  teal: '#2f7f95',
  cream: '#f3e6c4',
  orange: '#ec6a2c',
  red: '#d8402b',
  yellow: '#f4b93a',
  green: '#5d9b52',
  sky: '#7cc3de',
};

const FONT_T = '"Bungee", "Arial Black", sans-serif';
const FONT_B = '"Rubik", "Helvetica Neue", Arial, sans-serif';

// 可重現的亂數
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

export function drawPlayfield(ctx, S, walls, art = null) {
  const { W, H } = WORLD;
  ctx.save();
  ctx.scale(S, S);

  // ---- 機台木框 ----
  ctx.fillStyle = '#120a06';
  ctx.fillRect(0, 0, W, H);

  // ---- 台面裁切區 ----
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(20, 1120);
  ctx.lineTo(20, ARC_C.y);
  ctx.arc(ARC_C.x, ARC_C.y, ARC_R, Math.PI, Math.PI * 2);
  ctx.lineTo(620, 1120);
  ctx.closePath();
  ctx.clip();

  let g;
  const r = rng(11);
  if (art) {
    // AI 生成的美式機台插畫（左移讓中央漩渦對齊 WORMHOLE）
    ctx.drawImage(muteArt(art.img, art.sat ?? 0.45, art.bright ?? 0.72), art.dx, 0, W, H);
    drawArtExtras(ctx);
  } else {
  // 深空底色
  g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0b26');
  g.addColorStop(0.45, '#15123d');
  g.addColorStop(1, '#0c1634');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 星雲
  const neb = [[140, 260, 220, 'rgba(122,44,255,0.28)'], [470, 420, 240, 'rgba(40,120,255,0.22)'],
    [296, 700, 260, 'rgba(0,200,255,0.16)'], [120, 880, 200, 'rgba(255,60,160,0.14)'], [500, 900, 200, 'rgba(122,44,255,0.2)']];
  for (const [x, y, rr, c] of neb) {
    g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }

  // 發光裂紋（古早機台的電路紋理）
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = 30 + r() * 560, y = 60 + r() * 1000, a = r() * Math.PI * 2;
    ctx.strokeStyle = `rgba(90,170,255,${0.1 + r() * 0.14})`;
    ctx.lineWidth = 0.6 + r() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      a += (r() - 0.5) * 1.4;
      x += Math.cos(a) * (14 + r() * 22); y += Math.sin(a) * (14 + r() * 22);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 星星
  for (let i = 0; i < 220; i++) {
    const x = 20 + r() * 600, y = 20 + r() * 1080, sz = r() * 1.4 + 0.3;
    ctx.globalAlpha = 0.25 + r() * 0.75;
    ctx.fillStyle = r() < 0.12 ? '#ffd27a' : '#dfe8ff';
    ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 12; i++) star4(ctx, 40 + r() * 520, 60 + r() * 900, 3 + r() * 4, r() < 0.5 ? '#ffffff' : C.yellow);

  // 行星
  planet(ctx, 520, 110, 34, '#ff9a5a', '#7a2b3a');
  planet(ctx, 90, 470, 18, '#8fd6ff', '#23407a');

  // 底部大行星地平線
  g = ctx.createRadialGradient(296, 1500, 560, 296, 1500, 640);
  g.addColorStop(0, 'rgba(120,80,255,0.55)'); g.addColorStop(1, 'rgba(120,80,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(296, 1500, 640, 0, Math.PI * 2); ctx.fill();
  g = ctx.createLinearGradient(0, 940, 0, 1120);
  g.addColorStop(0, '#3a2a8a'); g.addColorStop(1, '#140c3a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(296, 1500, 560, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(180,160,255,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(296, 1500, 560, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();

  // 擋板間星芒
  starburst(ctx, 296, 1090);

  // 中央 WORMHOLE 圓盤
  wormholeDisc(ctx, 296, 482);
  }


  // 立靶區標籤
  for (const [x, a, txt] of [[150, -1.25, 'SATELLITE'], [442, 1.25, 'SHOOTING STAR']]) {
    ctx.save();
    ctx.font = `11px ${FONT_T}`;
    ctx.fillStyle = '#ffd27a';
    ctx.translate(x, 505); ctx.rotate(a); ctx.textAlign = 'center';
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  // 通道內裝飾線
  laneStripes(ctx);

  // ---- 底部 apron ----
  apron(ctx);

  // 發射道：木紋
  g = ctx.createLinearGradient(572, 0, 620, 0);
  g.addColorStop(0, '#4a2412'); g.addColorStop(0.5, '#8a4a22'); g.addColorStop(1, '#4a2412');
  ctx.fillStyle = g;
  ctx.fillRect(572, 340, 48, 790);
  ctx.strokeStyle = 'rgba(40,16,6,0.5)'; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const x = 576 + r() * 40;
    ctx.beginPath(); ctx.moveTo(x, 340); ctx.bezierCurveTo(x + 6, 600, x - 6, 800, x + 3, 1130); ctx.stroke();
  }
  for (let y = 420; y < 1040; y += 60) {
    ctx.fillStyle = 'rgba(255,210,90,0.8)';
    tri(ctx, 596, y, 7, -Math.PI / 2);
  }
  ctx.restore(); // 結束裁切

  // ---- 牆體 ----
  drawWalls(ctx, walls);

  // 外框：深木 + 紅色飾邊
  ctx.lineCap = 'butt';
  const frame = (w, col, off) => {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(14 - off, 1120); ctx.lineTo(14 - off, ARC_C.y);
    ctx.arc(ARC_C.x, ARC_C.y, ARC_R + 6 + off, Math.PI, Math.PI * 2);
    ctx.lineTo(626 + off, 1120);
    ctx.stroke();
  };
  frame(12, '#1a0c06', 0);
  frame(3, '#c8202c', -1);

  ctx.restore();
}

// 牆：銀色金屬 + 紅色飾邊；橡膠為白色
function drawWalls(ctx, walls) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pass = (col, widen, ox = 0, oy = 0) => {
    for (const w of walls) {
      ctx.strokeStyle = typeof col === 'function' ? col(w) : col;
      ctx.lineWidth = (w.r + widen) * 2;
      ctx.beginPath();
      if (w.type === 'arc') ctx.arc(w.cx + ox, w.cy + oy, w.R, w.a0, w.a1);
      else { ctx.moveTo(w.ax + ox, w.ay + oy); ctx.lineTo(w.bx + ox, w.by + oy); }
      ctx.stroke();
    }
  };
  pass('rgba(0,0,0,0.45)', 1.5, 3, 5);
  pass((w) => (w.mat === 'rubber' ? '#1a1020' : '#c8202c'), 1.8);
  pass((w) => (w.mat === 'rubber' ? '#f4f0e6' : w.type === 'gate' ? '#c9d3dc' : '#9aa6b8'), 0);
  ctx.globalAlpha = 0.75;
  pass((w) => (w.mat === 'rubber' ? '#ffffff' : '#eef3fa'), -2.6, -0.8, -0.8);
  ctx.globalAlpha = 1;
}

// 底圖降彩度 / 降亮度 / 偏深藍（讓機構與燈號更突出）
function muteArt(img, sat, bright) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    // 往灰階靠攏 → 壓亮度 → 混入一點深藍
    p[i] = (l + (r - l) * sat) * bright * 0.92 + 4;
    p[i + 1] = (l + (g - l) * sat) * bright * 0.95 + 6;
    p[i + 2] = (l + (b - l) * sat) * bright + 18;
  }
  x.putImageData(d, 0, 0);
  return c;
}

// AI 底圖上的附加層：WORMHOLE 燈座外框
function drawArtExtras(ctx) {
  ctx.strokeStyle = 'rgba(10,10,30,0.8)'; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.arc(296, 482, 62, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#c8202c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(296, 482, 71, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(296, 482, 53, 0, Math.PI * 2); ctx.stroke();
}

function planet(ctx, x, y, R, c1, c2) {
  let g = ctx.createRadialGradient(x, y, R, x, y, R * 2.4);
  g.addColorStop(0, c1 + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 2.4, 0, Math.PI * 2); ctx.fill();
  g = ctx.createRadialGradient(x - R * 0.4, y - R * 0.4, R * 0.1, x, y, R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
}

function starburst(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  const spikes = [[-1.57, 120], [-2.1, 80], [-1.04, 80], [-2.5, 60], [-0.64, 60]];
  for (const [a, L] of spikes) {
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
    g.addColorStop(0, 'rgba(190,90,255,0.95)'); g.addColorStop(1, 'rgba(120,60,255,0.1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.2) * 14, Math.sin(a - 0.2) * 14);
    ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L);
    ctx.lineTo(Math.cos(a + 0.2) * 14, Math.sin(a + 0.2) * 14);
    ctx.fill();
  }
  ctx.restore();
}

function wormholeDisc(ctx, x, y) {
  ctx.fillStyle = 'rgba(8,10,40,0.85)';
  ctx.beginPath(); ctx.arc(x, y, 80, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a5aa8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 80, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,170,255,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 72, 0, Math.PI * 2); ctx.stroke();
  const g = ctx.createRadialGradient(x, y, 4, x, y, 44);
  g.addColorStop(0, '#0a1030'); g.addColorStop(0.35, '#1ba6d8'); g.addColorStop(0.7, '#1a4aa0'); g.addColorStop(1, 'rgba(20,40,120,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(160,230,255,0.45)'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    for (let t = 0; t < 1; t += 0.02) {
      const a = k * Math.PI / 2 + t * 5, rr = 14 + t * 30;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      t ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#9fdcff'; ctx.font = `9px ${FONT_T}`; ctx.textAlign = 'center';
  ctx.fillText('WORMHOLE', x, y + 62);
}

function chromeTitle(ctx, x, y) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `21px ${FONT_T}`;
  const g = ctx.createLinearGradient(0, y - 22, 0, y + 26);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#aab6c8'); g.addColorStop(0.5, '#5a6478'); g.addColorStop(1, '#e8eef6');
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#c8202c'; ctx.lineWidth = 5;
  ctx.strokeText('EXPLORING', x, y); ctx.strokeText('THE BLUE', x, y + 24);
  ctx.fillStyle = g;
  ctx.fillText('EXPLORING', x, y); ctx.fillText('THE BLUE', x, y + 24);
  ctx.restore();
}

function star4(ctx, x, y, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
}

function chevron(ctx, x, y, ang, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.strokeStyle = C.cream; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-6, 11); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function tri(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s, -s); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function laneStripes(ctx) {
  // 左右軌道內的虛線（視覺導引）
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = 'rgba(243,230,196,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(ARC_C.x, ARC_C.y, 278, Math.PI * 1.06, Math.PI * 1.32); ctx.stroke();
  ctx.beginPath(); ctx.arc(ARC_C.x, ARC_C.y, 278, Math.PI * 1.66, Math.PI * 1.84); ctx.stroke();
  ctx.setLineDash([]);
}

function apron(ctx) {
  const plate = (pts) => {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    const g = ctx.createLinearGradient(0, 1060, 0, 1120);
    g.addColorStop(0, '#2a2e3a'); g.addColorStop(1, '#14161e');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#c8202c'; ctx.lineWidth = 2; ctx.stroke();
  };
  plate([[20, 1060], [200, 1060], [236, 1120], [20, 1120]]);
  plate([[572, 1060], [392, 1060], [356, 1120], [572, 1120]]);
  ctx.fillStyle = '#ffd27a';
  ctx.font = `9px ${FONT_T}`; ctx.textAlign = 'center';
  ctx.fillText('KEEP LOOKING UP', 110, 1094);
  ctx.fillText('CURIOSITY ENGINE', 482, 1094);
}

// ---- 動態元件用的小貼圖 ----
export function makeBallTexture(scene, key, R, S) {
  const size = Math.ceil((R * 2 + 4) * S);
  const t = scene.textures.createCanvas(key, size, size);
  const ctx = t.getContext();
  const c = size / 2, r = R * S;
  let g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.05, c, c, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, '#e8eef3');
  g.addColorStop(0.6, '#8d9aa6');
  g.addColorStop(0.9, '#3d4a57');
  g.addColorStop(1, '#1d2630');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
  // 反射出的藍色桌面
  g = ctx.createLinearGradient(0, c, 0, c + r);
  g.addColorStop(0, 'rgba(60,140,190,0)');
  g.addColorStop(1, 'rgba(60,140,190,0.45)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
  // 深色外框 + 白色邊緣光：讓球從任何底圖中跳出來
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = r * 0.14;
  ctx.beginPath(); ctx.arc(c, c, r - r * 0.07, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = r * 0.07;
  ctx.beginPath(); ctx.arc(c, c, r * 0.8, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  t.refresh();
}

// 球底下的光暈（加亮混合）
export function makeBallGlow(scene, key, R, S) {
  const size = Math.ceil(R * 5 * S);
  const t = scene.textures.createCanvas(key, size, size);
  const ctx = t.getContext();
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, R * S * 0.8, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.4, 'rgba(160,220,255,0.22)');
  g.addColorStop(1, 'rgba(160,220,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  t.refresh();
}

export function makeShadowTexture(scene, key, R, S) {
  const size = Math.ceil((R * 2 + 12) * S);
  const t = scene.textures.createCanvas(key, size, size);
  const ctx = t.getContext();
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  t.refresh();
}

export function makeBumperCap(scene, key, R, S, label, col) {
  const size = Math.ceil((R * 2 + 8) * S);
  const t = scene.textures.createCanvas(key, size, size);
  const ctx = t.getContext();
  ctx.scale(S, S);
  const c = R + 4;
  // 古早款：白色塑膠蓋 + 放射條紋 + 藍色圓頂
  ctx.fillStyle = '#f4f0e6';
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(c, c);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 0.95, -0.16, 0.16); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  let g = ctx.createRadialGradient(c - R * 0.15, c - R * 0.2, 1, c, c, R * 0.5);
  g.addColorStop(0, '#9fd0ff'); g.addColorStop(0.5, '#1e4fd0'); g.addColorStop(1, '#0a1a60');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, R * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(R * 0.26)}px ${FONT_T}`;
  ctx.fillText(label, c, c + 1);
  g = ctx.createRadialGradient(c - R * 0.35, c - R * 0.45, 1, c, c, R);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1a0c06'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
  t.refresh();
}

export function makeSpark(scene, key) {
  const t = scene.textures.createCanvas(key, 32, 32);
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,220,140,0.9)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  t.refresh();
}

// ---- 高架坡道：透明壓克力底板 + 立體護欄 + 支撐肋條 + 投影 ----
// 全部用基本 path API（不使用 roundRect 等較新 API，確保舊版 iOS 可用）
export function drawRamps(ctx, S, ramps) {
  ctx.save();
  ctx.scale(S, S);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const HW = 18; // 坡道半寬
  for (const r of ramps) {
    const P = r.pts;
    // 各點法向 → 左右邊緣
    const L = [], R = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      L.push([P[i][0] - dy * HW, P[i][1] + dx * HW]);
      R.push([P[i][0] + dy * HW, P[i][1] - dx * HW]);
    }
    const poly = (ox = 0, oy = 0) => {
      ctx.beginPath();
      L.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0] + ox, R[i][1] + oy);
      ctx.closePath();
    };
    const line = (E, ox = 0, oy = 0) => {
      ctx.beginPath();
      E.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
    };
    // 投影（越高越偏移）
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    poly(9, 13); ctx.fill();
    // 壓克力底板：漸層
    const g = ctx.createLinearGradient(P[0][0], P[0][1], P[P.length - 1][0], P[P.length - 1][1]);
    g.addColorStop(0, 'rgba(150,200,255,0.30)');
    g.addColorStop(1, 'rgba(200,230,255,0.42)');
    ctx.fillStyle = g;
    poly(); ctx.fill();
    // 支撐肋條
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
    for (let i = 4; i < L.length - 2; i += 8) {
      ctx.beginPath(); ctx.moveTo(L[i][0], L[i][1]); ctx.lineTo(R[i][0], R[i][1]); ctx.stroke();
    }
    // 護欄：外側深色 + 壓克力本體 + 高光
    for (const E of [L, R]) {
      ctx.strokeStyle = 'rgba(10,20,40,0.55)'; ctx.lineWidth = 7; line(E); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,230,255,0.85)'; ctx.lineWidth = 4.5; line(E); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.4; line(E, -0.8, -0.8); ctx.stroke();
    }
    // 入口金屬唇片
    ctx.strokeStyle = '#1a1a24'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]); ctx.lineTo(R[0][0], R[0][1]); ctx.stroke();
    ctx.strokeStyle = '#c9d3dc'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]); ctx.lineTo(R[0][0], R[0][1]); ctx.stroke();
    // 出口唇片
    const n = L.length - 1;
    ctx.strokeStyle = '#c9d3dc'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L[n][0], L[n][1]); ctx.lineTo(R[n][0], R[n][1]); ctx.stroke();
    // 名牌（沿坡道中段）
    const mid = P[Math.floor(P.length * 0.42)];
    ctx.save(); ctx.translate(mid[0], mid[1]);
    ctx.fillStyle = 'rgba(12,16,40,0.92)'; ctx.strokeStyle = '#c8202c'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-24, -8); ctx.lineTo(24, -8); ctx.lineTo(28, 0); ctx.lineTo(24, 8); ctx.lineTo(-24, 8); ctx.lineTo(-28, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd27a'; ctx.font = `8px ${FONT_T}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SKY RAMP', 0, 1);
    ctx.restore();
  }
  ctx.restore();
}
