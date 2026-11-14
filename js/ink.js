export const INK = '#1b2a5e';
export const PEN = 0.055;   // 笔粗占 em 的比例

const pw = p => 0.55 + 0.9 * p;   // 笔压 → 笔粗系数

// 一笔：相邻点中点之间用二次曲线连接，每段按该点笔压设线宽。k 为每 em 像素数，(ox, oy) 为原点位置。
export function drawStroke(ctx, s, k, ox, oy, w) {
  const m = s.length / 3;
  const P = j => [ox + s[3 * j] * k, oy + s[3 * j + 1] * k];
  ctx.lineCap = ctx.lineJoin = 'round';
  let [ax, ay] = P(0);
  if (m === 1) {
    ctx.beginPath();
    ctx.arc(ax, ay, w * pw(s[2]) / 2, 0, 7);
    ctx.fill();
    return;
  }
  for (let j = 1; j < m; j++) {
    const [cx, cy] = P(j);
    const [ex, ey] = j === m - 1 ? [cx, cy] : P(j + 1).map((v, i) => (v + [cx, cy][i]) / 2);
    ctx.lineWidth = w * pw(s[3 * j + 2]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    [ax, ay] = [ex, ey];
  }
}

export function drawGlyph(ctx, strokes, k, ox, oy, w) {
  ctx.strokeStyle = ctx.fillStyle = INK;
  for (const s of strokes) drawStroke(ctx, s, k, ox, oy, w);
}

// 建一个按设备像素比放大的画布，返回 2D 上下文（已按 CSS 像素设好变换）
export function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  const r = devicePixelRatio;
  cv.width = w * r;
  cv.height = h * r;
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.scale(r, r);
  return ctx;
}
