import { getStroke } from './vendor/perfect-freehand.mjs';

export const INK = '#1b2a5e';
export const PEN = 0.055;   // 笔粗占 em 的比例

// 一笔：按笔压算出整笔的轮廓多边形，再一次填充（逐段描线在慢速书写时会叠出一颗颗圆头）。
// k 为每 em 像素数，(ox, oy) 为原点位置，w 为笔压 0.5 时的笔粗。
export function drawStroke(ctx, s, k, ox, oy, w) {
  const pts = [];
  let p = s[2];
  for (let i = 0; i < s.length; i += 3) {
    p += (s[i + 2] - p) * 0.4;   // 轻微平滑笔压抖动
    pts.push([ox + s[i] * k, oy + s[i + 1] * k, p]);
  }
  const o = getStroke(pts, { size: w, thinning: 0.5, smoothing: 0.5, streamline: 0, simulatePressure: false, last: true });
  ctx.beginPath();
  ctx.moveTo(...o[0]);
  o.forEach(([x0, y0], i) => {
    const [x1, y1] = o[(i + 1) % o.length];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  });
  ctx.fill();
}

export function drawGlyph(ctx, strokes, k, ox, oy, w) {
  ctx.fillStyle = INK;
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
