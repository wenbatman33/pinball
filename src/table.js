// 桌面幾何與物理參數（世界座標：寬 640、高 1120，y 向下）
// DEV 工具會覆寫這裡的值；匯出 JSON 後再 bake 回本檔

export const WORLD = { W: 640, H: 1120 };

// 物理參數（單位：px、秒）
export const PHYS_DEFAULT = {
  gravity: 1500,        // 沿桌面傾斜方向的等效重力
  ballRadius: 11,
  maxSpeed: 3400,       // 安全上限，避免數值爆衝
  wallE: 0.3,           // 金屬/木頭牆恢復係數
  rubberE: 0.72,        // 橡膠柱恢復係數
  flipperE: 0.4,        // 擋板恢復係數
  flipperOmega: 30,     // 擋板最高角速度 rad/s
  flipperReturnOmega: 18,
  flipperAccel: 1500,   // 擋板角加速度 rad/s²（約 20ms 達全速）
  flipperFriction: 0.3, // 擋板橡膠摩擦
  bumperKick: 820,      // 圓形彈跳器最低彈出速度
  slingKick: 620,       // 三角彈弓額外彈力
  slingThreshold: 90,   // 撞擊速度超過才觸發彈弓
  plungerMin: 900,
  plungerMax: 2750,
  rampGravity: 1.25,     // 坡道上的等效重力倍率（越大越難上坡）
  rampDrag: 90,         // 坡道滾動阻力
  kickback: 2300,       // 左 outlane 回彈速度
  friction: 0.08,       // 庫侖摩擦係數 μ
  restThreshold: 45,    // 低於此法向速度視為靜止接觸（不反彈，避免抖動）
  timeScale: 1,
};

// 可在 DEV 工具中拖曳的元件
export const LAYOUT_DEFAULT = {
  bumpers: [
    { id: 'bumper1', x: 226, y: 262, r: 28, label: 'DATA' },
    { id: 'bumper2', x: 366, y: 262, r: 28, label: 'SAT' },
    { id: 'bumper3', x: 296, y: 356, r: 28, label: 'SKY' },
  ],
  // 三角彈弓：a=上角, b=下角(靠外), c=右下角(靠擋板)；a→c 為彈射面
  slings: [
    { id: 'slingL', ax: 110, ay: 790, bx: 110, by: 860, cx: 178, cy: 906 },
    { id: 'slingR', ax: 482, ay: 790, bx: 482, by: 860, cx: 414, cy: 906 },
  ],
  flippers: [
    { id: 'flipL', side: 'L', x: 200, y: 982, len: 84, r1: 13, r2: 7, rest: 32, up: -28 },
    { id: 'flipR', side: 'R', x: 392, y: 982, len: 84, r1: 13, r2: 7, rest: 32, up: -28 },
    // 右側上擋板（與右擋板同鍵）
    { id: 'flipU', side: 'R', x: 505, y: 640, len: 58, r1: 11, r2: 6, rest: 28, up: -22 },
  ],
  // 立靶：中心、角度(度)、長度
  targets: [
    { id: 'tL1', x: 96, y: 468, a: 72, len: 30, bank: 'L' },
    { id: 'tL2', x: 108, y: 506, a: 72, len: 30, bank: 'L' },
    { id: 'tL3', x: 120, y: 544, a: 72, len: 30, bank: 'L' },
  ],
  // 中央三連 Drop Target（被擊中後沉下，全倒後重新升起）
  drops: [
    // 右側 SHOOTING STAR 組（陡斜排列，球不會停在頂面；頭尾相接無縫隙）
    { id: 'd1', x: 496, y: 468, a: -72, len: 40, bank: 'R' },
    { id: 'd2', x: 484, y: 506, a: -72, len: 40, bank: 'R' },
    { id: 'd3', x: 472, y: 544, a: -72, len: 40, bank: 'R' },
  ],
  // 旋轉片（球穿越時旋轉計分，不阻擋）
  spinners: [
    { id: 'spinL', x: 43, y: 290, w: 34 },
  ],
  // 感應器（不碰撞）
  rollovers: [
    { id: 'laneS', x: 256, y: 100, r: 12, label: 'S' },
    { id: 'laneK', x: 296, y: 100, r: 12, label: 'K' },
    { id: 'laneY', x: 336, y: 100, r: 12, label: 'Y' },
    { id: 'inL', x: 90, y: 860, r: 11, label: '' },
    { id: 'inR', x: 502, y: 860, r: 11, label: '' },
    { id: 'outL', x: 45, y: 960, r: 11, label: '' },
    { id: 'outR', x: 547, y: 960, r: 11, label: '' },
    { id: 'orbitL', x: 48, y: 300, r: 16, label: '' },
    { id: 'orbitR', x: 560, y: 205, r: 16, label: '' },
  ],
  // ORBIT 進度燈（純視覺）
  inserts: [
    { id: 'ins1', x: 262, y: 600 },
    { id: 'ins2', x: 296, y: 608 },
    { id: 'ins3', x: 330, y: 600 },
  ],
  // 中央 WORMHOLE 吸球洞
  saucers: [
    { id: 'wormhole', x: 296, y: 482, r: 13 },   // 對齊底圖中央漩渦
  ],
  // 計分橡膠柱
  posts: [
    { id: 'postL', x: 188, y: 640, r: 8 },
    { id: 'postR', x: 404, y: 640, r: 8 },
  ],
};

// 固定牆體（不開放拖曳，確保桌面封閉）
// 型別：seg = 膠囊線段、arc = 圓弧、gate = 單向閘
export const ARC_C = { x: 320, y: 320 };
export const ARC_R = 300;

export function buildWalls() {
  const W = [];
  const seg = (ax, ay, bx, by, r = 4, mat = 'wall') => W.push({ type: 'seg', ax, ay, bx, by, r, mat });
  const poly = (pts, r = 4, mat = 'wall') => {
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, mat);
  };
  const arc = (cx, cy, R, a0, a1, r = 4, mat = 'wall') =>
    W.push({ type: 'arc', cx, cy, R, a0: (a0 * Math.PI) / 180, a1: (a1 * Math.PI) / 180, r, mat });

  // 外框：左牆、上方大弧、右牆（發射道外側）
  seg(20, 320, 20, 1130);
  arc(ARC_C.x, ARC_C.y, ARC_R, 180, 360);
  seg(620, 320, 620, 1130);

  // 發射道內牆 + 單向閘（球可由下往上通過，回落時被導回台面）
  seg(572, 345, 572, 1130);
  W.push({ type: 'gate', ax: 620, ay: 298, bx: 574, by: 340, r: 3, mat: 'wall' });

  // 左右軌道內側導軌
  arc(ARC_C.x, ARC_C.y, 255, 195, 235, 5, 'wall');
  arc(ARC_C.x, ARC_C.y, 255, 300, 330, 5, 'wall');

  // 頂部 S-K-Y 通道分隔柱
  for (const x of [236, 276, 316, 356]) seg(x, 74, x, 116, 4, 'rubber');

  // 兩側單向閘門：從上方落下的貼牆球被導回台面；
  // 由下往上（SAVE 彈射、打上軌道的球）可直接穿過。正面 = 線段左手法向側
  W.push({ type: 'gate', ax: 70, ay: 640, bx: 20, by: 560, r: 3, mat: 'wall' });
  // 右側閘門末端落在上擋板表面上方（球滑下後沿擋板滾出，不會卡在轉軸旁）
  W.push({ type: 'gate', ax: 572, ay: 520, bx: 495, by: 600, r: 3, mat: 'wall' });
  // 右側下層閘門（上擋板轉軸與右牆之間的直通道，與左側閘門同高度）
  W.push({ type: 'gate', ax: 572, ay: 650, bx: 526, by: 720, r: 3, mat: 'wall' });

  // 內/外通道分隔：頂端為橡膠柱；斜段與擋板上緣「共線」(36.1°)，
  // 表面無縫銜接 → 球從 inlane 滾上擋板不會被彈起飛過擋板
  poly([[70, 790], [70, 876.1], [205.3, 974.73]], 4, 'wall');
  poly([[522, 790], [522, 876.1], [386.7, 974.73]], 4, 'wall');
  seg(70, 790, 70, 791, 6, 'rubber');
  seg(522, 790, 522, 791, 6, 'rubber');

  // 坡道入口：兩側導牆 + 後擋
  for (const r of RAMPS) {
    const { cx, cy, dx, dy } = rampMouth(r);
    const px = -dy, py = dx; // 垂直方向
    const hw = r.halfW + 4; // 牆中心距入口中心
    for (const sgn of [-1, 1]) {
      const bx = cx + px * hw * sgn, by = cy + py * hw * sgn;
      seg(bx - dx * 26, by - dy * 26, bx + dx * 40, by + dy * 40, 4, 'wall');
    }
    seg(cx + px * hw + dx * 40, cy + py * hw + dy * 40, cx - px * hw + dx * 40, cy - py * hw + dy * 40, 4, 'wall');
  }

  // 發射柱底座擋板（防止球從發射道底部掉出）
  seg(572, 1120, 620, 1120, 4, 'wall');
  return W;
}

// ---- 高架坡道 ----
// mouth：入口中心；ang：進入方向（度）；path：坡道中心線控制點（第一點 = 入口）
// 短坡道：入口對準右擋板出球線 → 爬升 → 頂端向內彎 → 把球送進上方 bumper 區
const RAMP_L_PATH = [[182, 458], [172, 420], [166, 364], [163, 306], [162, 258], [168, 216], [186, 188], [214, 176], [244, 182]];
export const RAMPS = [
  { id: 'rampL', label: 'SKY CANVAS', halfW: 30, path: RAMP_L_PATH },
  { id: 'rampR', label: 'SKY CANVAS', halfW: 30, path: RAMP_L_PATH.map(([x, y]) => [592 - x, y]) },
];
export function rampMouth(r) {
  const [x0, y0] = r.path[0], [x1, y1] = r.path[1];
  const L = Math.hypot(x1 - x0, y1 - y0);
  return { cx: x0, cy: y0, dx: (x1 - x0) / L, dy: (y1 - y0) / L };
}

// 發射台
export const PLUNGER = { x0: 577, x1: 615, restY: 1092, travel: 46, r: 3 };
export const BALL_START = { x: 596, y: 1092 - 3 - 11 - 0.5 };
