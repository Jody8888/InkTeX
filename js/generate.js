import { lib } from './db.js';
import { drawStroke, INK, PEN } from './ink.js';
import { formula } from './mathjax.js';

const $ = id => document.getElementById(id);

// [键, 名称, 最小, 最大, 步长, 默认]；长度单位都是 em（一个字的大小）
const PARAMS = [
  ['size', '字号（像素）', 40, 120, 1, 72],
  ['width', '行宽（em）', 8, 60, 0.5, 26],
  ['gap', '行距（em）', 0, 1.5, 0.05, 0.5],
  ['spacing', '字距（em）', -0.1, 0.4, 0.01, 0.1],
  ['pen', '笔粗', 0.5, 2, 0.05, 1],
  ['spaceJ', '字距抖动', 0, 0.15, 0.005, 0.04],
  ['posJ', '位置偏移', 0, 0.12, 0.005, 0.03],
  ['sizeJ', '大小抖动', 0, 0.15, 0.005, 0.05],
  ['rotJ', '旋转抖动（°）', 0, 8, 0.1, 2],
  ['shearJ', '倾斜抖动', 0, 0.25, 0.005, 0.05],
  ['strokeJ', '笔画偏移', 0, 0.06, 0.002, 0.012],
  ['strokeRot', '笔画旋转（°）', 0, 6, 0.1, 1.5],
  ['wobble', '线条抖动', 0, 0.05, 0.001, 0.01],
  ['lineSlope', '行倾斜（°）', 0, 2, 0.05, 0.4],
  ['lineWave', '行波动', 0, 0.2, 0.005, 0.05],
  ['mathJ', '公式扰动系数', 0, 1.5, 0.05, 0.6],
];
const DEFAULTS = Object.fromEntries(PARAMS.map(p => [p[0], p[5]]));
const SAMPLE = '解：由牛顿第二定律 $F=ma$ 得 $a=\\frac{F}{m}=5\\,\\mathrm{m/s^2}$。\n$$\\int_0^1 x^2\\,dx=\\frac{1}{3}$$\n等效电阻 $R=R_1+\\frac{R_2R_3}{R_2+R_3}=10\\,\\Omega$。';
const PAD = 0.5;   // 图片四周留白（em）
const MJ_GAP = 0.05;   // MathJax 里相邻字母墨迹间距的典型值
const LATIN = /[A-Za-z0-9'’-]/;                  // 连续的这些字符算一个词，不在中间断行
const CLOSE = /[，。、；：？！）》」』”,.;:?!)\]】]/;  // 不放在行首的标点
const WIDE = /[\u3000-\u303f\uff00-\uffef]/;      // 全角标点，至少占半个字宽
// 字形库没有的中文标点，换成对应的英文标点
const PUNCT = { '，': ',', '。': '.', '：': ':', '；': ';', '（': '(', '）': ')', '、': ',', '？': '?', '！': '!' };

// 公式外的 LaTeX 文档命令（AI 常输出）转成纯文本：去掉格式命令，列表项和 \\ 变换行
function plain(s) {
  return s
    .replace(/\\(?:begin|end)\{(?:enumerate|itemize|description|center)\}(?:\[[^\]]*\])?/g, '')
    .replace(/\\item\b\s*/g, '\n')
    .replace(/\\(?:textbf|textit|textrm|text|emph|underline|mathrm)\{([^{}]*)\}/g, '$1')
    .replace(/\\\\(?:\[[^\]]*\])?|\\(?:newline|par)\b/g, '\n')
    .replace(/\\(?:qquad|quad|noindent|[,;: ])/g, ' ')
    .replace(/[ \t]*\n\s*/g, '\n');   // 去掉空行和行首空白，手写越紧凑越好
}

let P = { ...DEFAULTS, seed: 1, ...JSON.parse(localStorage.getItem('inktex-params') || '{}') };
let rand, drift, missing, errors, blob, renderId = 0, onCollect;
const lastVariant = new Map();
const measure = document.createElement('canvas').getContext('2d');

// ---------- 随机数 ----------

function mulberry(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 截断在 ±2.5σ 的高斯分布，避免偶尔出现离谱的偏移
function gauss(s) {
  const g = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  return s * Math.max(-2.5, Math.min(2.5, g));
}

// 平滑的二维值噪声，范围约 [-1, 1]，用于线条抖动
function hash(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 2147483648 - 1;
}
function noise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// 字级扰动。大小和上下位置是相关的随机游走（真人写字是渐变的），再叠加小幅独立抖动。f 为扰动系数。
function jitter(f) {
  drift.s = 0.85 * drift.s + gauss(P.sizeJ * 0.5);
  drift.y = 0.85 * drift.y + gauss(P.posJ * 0.5);
  return {
    s: 1 + (drift.s + gauss(P.sizeJ * 0.5)) * f,
    dx: gauss(P.posJ) * f,
    dy: (drift.y + gauss(P.posJ * 0.5)) * f,
    rot: gauss(P.rotJ * Math.PI / 180) * f,
    shear: gauss(P.shearJ) * f,
  };
}

// ---------- 字形 ----------

// 随机选一种写法，同一个字不连续用同一种
function pick(key) {
  const vs = lib[key];
  let i = Math.floor(rand() * vs.length);
  if (vs.length > 1 && i === lastVariant.get(key)) i = (i + 1) % vs.length;
  lastVariant.set(key, i);
  return vs[i];
}

const boxes = new WeakMap();
function bbox(strokes) {
  if (!boxes.has(strokes)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) {
      for (let i = 0; i < s.length; i += 3) {
        x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]);
        y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]);
      }
    }
    boxes.set(strokes, { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
  }
  return boxes.get(strokes);
}

// 画一个手写字形，使字形中心落在 (tx, ty)（em）。sx、sy 为缩放（字形 em → 页面 em）。
// 变换顺序：每笔绕自身中心偏移旋转 → 整字缩放、倾斜、旋转 → 线条抖动
function drawHand(ctx, strokes, b, tx, ty, sx, sy, J, f) {
  const k = P.size, cos = Math.cos(J.rot), sin = Math.sin(J.rot);
  const amp = P.wobble * k, fr = 1 / (0.35 * k);
  for (const s of strokes) {
    const n = s.length / 3;
    let cx = 0, cy = 0;
    for (let i = 0; i < s.length; i += 3) { cx += s[i] / n; cy += s[i + 1] / n; }
    const r = gauss(P.strokeRot * Math.PI / 180 * f), rc = Math.cos(r), rs = Math.sin(r);
    const ox = gauss(P.strokeJ * f), oy = gauss(P.strokeJ * f);
    const out = [];
    for (let i = 0; i < s.length; i += 3) {
      const ux = s[i] - cx, uy = s[i + 1] - cy;
      const px = (cx + ux * rc - uy * rs + ox - b.cx) * sx, py = (cy + ux * rs + uy * rc + oy - b.cy) * sy;
      const qx = px + J.shear * py;
      const X = (tx + qx * cos - py * sin) * k, Y = (ty + qx * sin + py * cos) * k;
      out.push(X + amp * noise(X * fr, Y * fr, 1), Y + amp * noise(X * fr, Y * fr, 2), s[i + 2]);
    }
    drawStroke(ctx, out, 1, 0, 0, PEN * k * P.pen);
  }
}

// 手画直线（分数线、根号横线等）：两端长短随机，中间略弯
function handLine(ctx, b, ox, oy, off, f) {
  const hz = b[2] - b[0] >= b[3] - b[1];
  const [x1, y1, x2, y2] = hz
    ? [b[0], (b[1] + b[3]) / 2, b[2], (b[1] + b[3]) / 2]
    : [(b[0] + b[2]) / 2, b[1], (b[0] + b[2]) / 2, b[3]];
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const e1 = gauss(0.03 * f), e2 = gauss(0.03 * f), n1 = gauss(0.015 * f), n2 = gauss(0.015 * f);
  const bow = gauss(0.01 + 0.015 * len * f);
  const ax = ox + x1 - ux * e1 - uy * n1, ay = oy + y1 - uy * e1 + ux * n1;
  const bx = ox + x2 + ux * e2 - uy * n2, by = oy + y2 + uy * e2 + ux * n2;
  const mx = (ax + bx) / 2 - uy * bow, my = (ay + by) / 2 + ux * bow;
  const k = P.size, pts = [];
  for (let t = 0; t <= 1.001; t += 1 / 16) {
    const x = (1 - t) ** 2 * ax + 2 * t * (1 - t) * mx + t * t * bx;
    const y = (1 - t) ** 2 * ay + 2 * t * (1 - t) * my + t * t * by;
    pts.push(x * k, (y + off(x)) * k, 0.5);
  }
  drawStroke(ctx, pts, 1, 0, 0, PEN * k * P.pen);
}

// 字形库缺字时：公式用 MathJax 原轮廓，正文用系统字体
function fallback(ctx, it, ox, oy, off) {
  const k = P.size, x = ox + it.b[0];
  if (!it.fallback) {
    ctx.font = `${it.em * k}px serif`;
    ctx.fillText(it.key, x * k, (oy + off(x) + it.base) * k);
    return;
  }
  ctx.save();
  ctx.translate(ox * k, (oy + off(x)) * k);
  ctx.scale(k / 1000, k / 1000);
  for (const { d, m } of it.fallback) {
    ctx.save();
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.fill(new Path2D(d));
    ctx.restore();
  }
  ctx.restore();
}

// 给公式里每个符号选好字形，再按手写字宽重排横向位置（竖直不动）。
// x 轴分段线性映射：有符号的区间按「手写宽 / 印刷宽」缩放（叠放的取最大），空白区间加上字距差，
// 这样公式内字距和正文一致。横线和横向拉伸的重音不参与，跟着映射伸缩。
function handFormula(fm) {
  const f = P.mathJ;
  const items = fm.items.map(it => {
    const h = { it, k: it.t === 'bar' || it.t === 'stretch' && it.b[2] - it.b[0] > it.b[3] - it.b[1] ? 0 : 1 };
    if (it.t === 'bar') return h;
    const key = it.t === 'stretch' && lib['T:' + it.key] ? 'T:' + it.key : it.key;
    if (!lib[key]) {
      if (it.key.trim()) missing.add(it.key);
      return h;
    }
    const strokes = pick(key), b = bbox(strokes), J = jitter(f);
    if (h.k && it.t === 'glyph') h.k = b.w * it.em * J.s / (it.b[2] - it.b[0]);
    return Object.assign(h, { strokes, b, J });
  });
  const cov = items.filter(h => h.k !== 0);
  const xs = [...new Set(cov.flatMap(h => [h.it.b[0], h.it.b[2]]))].sort((a, b) => a - b), X = [0];
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1], c = xs[i];
    const ks = cov.filter(h => h.it.b[0] <= a && h.it.b[2] >= c).map(h => h.k);
    X.push(X[i - 1] + (ks.length ? (c - a) * Math.max(...ks) : Math.max(0, c - a + P.spacing - MJ_GAP)));
  }
  const map = x => {
    const i = xs.findIndex(v => v >= x);
    if (i < 0) return X.at(-1) + x - xs.at(-1);
    if (i === 0) return x - xs[0];
    return X[i - 1] + (X[i] - X[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  };
  for (const h of items) { h.x0 = map(h.it.b[0]); h.x1 = map(h.it.b[2]); }
  const x0 = Math.min(...items.map(h => h.x0)), x1 = Math.max(...items.map(h => h.x1));
  return { items, x0, w: x1 - x0, asc: fm.asc, desc: fm.desc };
}

// ox 是公式最左墨迹的位置
function drawFormula(ctx, hf, ox, oy, off) {
  const f = P.mathJ;
  ox -= hf.x0;
  for (const h of hf.items) {
    const { it } = h, cx = (h.x0 + h.x1) / 2;
    if (it.t === 'bar') { handLine(ctx, [h.x0, it.b[1], h.x1, it.b[3]], ox, oy, off, f); continue; }
    if (!h.strokes) { fallback(ctx, it, ox + cx - (it.b[0] + it.b[2]) / 2, oy, off); continue; }
    const { strokes, b, J } = h, x = ox + cx + J.dx;
    if (it.t === 'glyph') {
      const s = it.em * J.s;
      drawHand(ctx, strokes, b, x, oy + off(x) + it.base + b.cy * s + J.dy, s, s, J, f);
    } else {
      // 拉伸的符号：把字形框适配到映射后的框（笔粗不变，所以非等比缩放也不变形）
      const sy = (it.b[3] - it.b[1]) / b.h, sx = b.w ? (h.x1 - h.x0) / b.w : sy;
      drawHand(ctx, strokes, b, x, oy + off(x) + (it.b[1] + it.b[3]) / 2 + J.dy, sx, sy, J, f);
    }
  }
}

// ---------- 排版 ----------

function tokenize(src) {
  const out = [], re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)/g;
  let last = 0, m;
  const text = s => { for (const ch of plain(s)) out.push(ch === '\n' ? { nl: true } : { ch }); };
  while ((m = re.exec(src))) {
    text(src.slice(last, m.index));
    out.push({ tex: (m[1] ?? m[2] ?? m[3] ?? m[4]).trim(), display: m[1] !== undefined || m[2] !== undefined });
    last = re.lastIndex;
  }
  text(src.slice(last));
  return out;
}

function textGlyph(ch) {
  if (!lib[ch] && lib[PUNCT[ch]]) ch = PUNCT[ch];
  if (!lib[ch]) {
    missing.add(ch);
    measure.font = '100px serif';
    return { fb: ch, w: measure.measureText(ch).width / 100 + P.spacing, asc: 0.75, desc: 0.25 };
  }
  const strokes = pick(ch), b = bbox(strokes), J = jitter(1);
  const gw = WIDE.test(ch) ? Math.max(b.w * J.s, 0.5) : b.w * J.s;
  return { strokes, b, J, w: gw + P.spacing + gauss(P.spaceJ), asc: -b.y0 * J.s, desc: b.y1 * J.s };
}

// 单位：词 / 单个汉字（带后面的标点）/ 行内公式 / 空格 / 换行 / 行间公式
async function buildUnits(tokens) {
  const units = [];
  let word = null;
  const flush = () => { if (word) units.push(word); word = null; };
  for (const tk of tokens) {
    if (tk.nl) { flush(); units.push({ nl: true }); continue; }
    if (tk.tex !== undefined) {
      flush();
      const fm = await formula(tk.tex, tk.display);
      if (fm.err) errors.push(`${fm.err}：${tk.tex}`);
      else if (tk.display) units.push({ block: handFormula(fm) });
      else {
        const hf = handFormula(fm), w = hf.w + P.spacing + gauss(P.spaceJ);
        units.push({ w, parts: [{ hf, w, asc: hf.asc, desc: hf.desc }] });
      }
      continue;
    }
    if (/\s/.test(tk.ch)) { flush(); units.push({ sp: 0.33 + gauss(P.spaceJ) }); continue; }
    const g = textGlyph(tk.ch);
    if (LATIN.test(tk.ch)) {
      word ??= { w: 0, parts: [] };
      word.parts.push(g);
      word.w += g.w;
      continue;
    }
    flush();
    const prev = units.at(-1);
    if (CLOSE.test(tk.ch) && prev?.parts) { prev.parts.push(g); prev.w += g.w; }
    else units.push({ w: g.w, parts: [g] });
  }
  flush();
  return units;
}

function breakLines(units) {
  const lines = [];
  let cur, afterBlock = false;
  const nl = () => lines.push(cur = { items: [], x: 0, asc: 0.75, desc: 0.25 });
  nl();
  for (const u of units) {
    if (u.nl) {
      if (!afterBlock || cur.items.length) nl();   // 行间公式后面紧跟的换行不再多空一行
      afterBlock = false;
      continue;
    }
    afterBlock = false;
    if (u.block) {
      if (cur.items.length) nl();
      Object.assign(cur, { block: u.block, asc: u.block.asc, desc: u.block.desc });
      nl();
      afterBlock = true;
      continue;
    }
    if (u.sp) { if (cur.items.length) cur.x += u.sp; continue; }
    if (cur.x + u.w > P.width && cur.items.length) nl();
    cur.items.push({ u, x: cur.x });
    cur.x += u.w;
    for (const p of u.parts) { cur.asc = Math.max(cur.asc, p.asc); cur.desc = Math.max(cur.desc, p.desc); }
  }
  if (!cur.items.length) lines.pop();
  return lines;
}

// ---------- 渲染 ----------

async function render() {
  const id = ++renderId;
  rand = mulberry(P.seed);
  drift = { s: 0, y: 0 };
  missing = new Set();
  errors = [];
  lastVariant.clear();
  const lines = breakLines(await buildUnits(tokenize($('src').value)));
  if (id !== renderId) return;

  let y = PAD, w = 0;
  for (const ln of lines) {
    y += ln.asc;
    ln.base = y;
    y += ln.desc + P.gap;
    w = Math.max(w, ln.block ? ln.block.w + 1 : ln.x);
  }
  const k = P.size, cv = document.createElement('canvas');
  cv.width = Math.ceil((w + 2 * PAD) * k);
  cv.height = Math.ceil((y - P.gap + PAD) * k);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = INK;

  for (const ln of lines) {
    // 行级扰动：整行倾斜 + 基线缓慢起伏 + 行首位置
    const sl = Math.tan(gauss(P.lineSlope * Math.PI / 180)), amp = P.lineWave, ph = rand() * 6.28, per = 6 + rand() * 6;
    const off = x => (x - PAD) * sl + amp * Math.sin(x / per * 6.28 + ph);
    const x0 = PAD + Math.abs(gauss(0.05));
    if (ln.block) drawFormula(ctx, ln.block, x0 + 1, ln.base, off);
    for (const { u, x } of ln.items) {
      let xx = x0 + x;
      for (const g of u.parts) {
        if (g.hf) drawFormula(ctx, g.hf, xx, ln.base, off);
        else if (g.fb) fallback(ctx, { key: g.fb, b: [0], em: 1, base: 0 }, xx, ln.base, off);
        else {
          const cx = xx + g.b.w * g.J.s / 2 + g.J.dx;
          drawHand(ctx, g.strokes, g.b, cx, ln.base + off(cx) + g.b.cy * g.J.s + g.J.dy, g.J.s, g.J.s, g.J, 1);
        }
        xx += g.w;
      }
    }
  }

  cv.style.width = cv.width * 36 / k + 'px';   // 预览统一按每字 36px 显示，与导出字号无关
  $('preview').replaceChildren(cv);
  showStatus();
  cv.toBlob(b => blob = b);
}

function showStatus() {
  const st = $('status');
  st.replaceChildren(...errors.map(e => Object.assign(document.createElement('div'), { textContent: '公式错误：' + e })));
  if (!missing.size) return;
  const chars = [...missing];
  const d = document.createElement('div');
  d.textContent = `字形库缺 ${chars.length} 个字（暂用印刷体）：${chars.join(' ')} `;
  const b = Object.assign(document.createElement('button'), { textContent: '去采集这些字' });
  b.onclick = () => onCollect(chars);
  d.append(b);
  st.append(d);
}

// ---------- 界面 ----------

let timer;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(render, 250);
}

function persist() {
  localStorage.setItem('inktex-params', JSON.stringify(P));
  localStorage.setItem('inktex-src', $('src').value);
}

function buildParams() {
  $('params').replaceChildren(...PARAMS.map(([key, label, min, max, step]) => {
    const l = document.createElement('label');
    const v = document.createElement('span');
    const r = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: P[key] });
    v.textContent = P[key];
    r.oninput = () => {
      P[key] = +r.value;
      v.textContent = r.value;
      persist();
      schedule();
    };
    l.append(label, r, v);
    return l;
  }));
}

$('src').value = localStorage.getItem('inktex-src') ?? SAMPLE;
$('src').oninput = () => { persist(); schedule(); };
$('reseed').onclick = () => {
  P.seed = Math.floor(Math.random() * 1e9);
  persist();
  render();
};
$('resetParams').onclick = () => {
  P = { ...DEFAULTS, seed: P.seed };
  persist();
  buildParams();
  render();
};
$('copy').onclick = () => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  .then(() => $('copy').textContent = '已复制 ✓', () => $('copy').textContent = '复制失败')
  .then(() => setTimeout(() => $('copy').textContent = '复制图片', 1500));
$('share').onclick = () => {
  const file = new File([blob], 'inktex.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'inktex.png';
  a.click();
};
buildParams();

// collect(chars)：点「去采集这些字」时调用
export function initGenerate(collect) {
  onCollect = collect;
}
export { render };
