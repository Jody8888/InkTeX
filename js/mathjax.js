// LaTeX → MathJax SVG → 每个符号的位置。坐标单位 em，原点为公式左端基线，y 向下。
// 条目类型：glyph（普通符号，按基线对齐）、stretch（被拉伸的括号/大型运算符，按框适配）、bar（手画直线）。
// 每个 glyph/stretch 带 fallback（MathJax 原始轮廓），字形库缺字时用它。

const GREEK_EXTRA = ['∂', 'ϵ', 'ϑ', 'ϰ', 'ϕ', 'ϱ', 'ϖ'];
const ALIAS = { 0x22C5: '·', 0x2223: '|', 0x2225: '‖', 0x2016: '‖', 0x2218: '°', 0x2217: '*', 0x20D7: '→', 0x2C6: '^', 0x2DC: '~' };
const ACCENTS = new Set([0x20D7, 0x5E, 0x2C6, 0x7E, 0x2DC]);   // 按框适配大小的重音（\vec 箭头、\hat、\tilde）
// 可伸缩括号的拼接部件 → 对应字符
const PIECES = [
  [0x239B, 0x239D, '('], [0x239E, 0x23A0, ')'], [0x23A1, 0x23A3, '['], [0x23A4, 0x23A6, ']'],
  [0x23A7, 0x23AA, '{'], [0x23AB, 0x23AD, '}'], [0x2320, 0x2321, '∫'], [0x23AE, 0x23AE, '∫'], [0x23B7, 0x23B7, '√'],
];
// 被横向拉伸后直接手画成直线的符号（\overline 等）
const BARS = new Set(['−', '–', '—', '⎯', '―', '─', '¯', '‾']);

// MathJax 的数学字母码位（斜体 x = U+1D465 等）→ 字形库里的普通字符
export function charOf(cp) {
  if (cp === 0x210E) return 'h';
  if (cp >= 0x1D400 && cp <= 0x1D6A3) {
    const o = (cp - 0x1D400) % 52;
    return String.fromCharCode(o < 26 ? 65 + o : 71 + o);
  }
  if (cp >= 0x1D6A8 && cp <= 0x1D7C9) {
    const o = (cp - 0x1D6A8) % 58;   // 25 个大写 + ∇ + 25 个小写 + 7 个变体
    if (o === 17) return 'ϴ';
    if (o < 25) return String.fromCharCode(0x391 + o);
    if (o === 25) return '∇';
    if (o < 51) return String.fromCharCode(0x3B1 + o - 26);
    return GREEK_EXTRA[o - 51];
  }
  if (cp >= 0x1D7CE && cp <= 0x1D7FF) return String((cp - 0x1D7CE) % 10);
  return ALIAS[cp] ?? String.fromCodePoint(cp);
}

const pieceOf = cp => PIECES.find(([a, b]) => cp >= a && cp <= b)?.[2] ?? charOf(cp);
const cpOf = el => parseInt(el.getAttribute('data-c'), 16);

const host = document.createElement('div');
host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
document.body.append(host);
const cache = new Map();

export async function formula(tex, display) {
  await MathJax.startup.promise;
  const id = (display ? 'D' : 'I') + tex;
  if (!cache.has(id)) cache.set(id, extract(tex, display));
  return cache.get(id);
}

function extract(tex, display) {
  const node = MathJax.tex2svg(tex, { display });
  const svg = node.querySelector('svg');
  host.append(node);
  const err = svg.querySelector('[data-mjx-error]');
  if (err) {
    node.remove();
    return { err: err.getAttribute('data-mjx-error') };
  }
  const vb = svg.viewBox.baseVal;
  // 元素坐标 → 根坐标（再平移掉 viewBox 原点），根坐标 1000 = 1em
  const toRoot = new DOMMatrix().translate(-vb.x, 0).multiply(svg.getScreenCTM().inverse());
  const M = el => toRoot.multiply(el.getScreenCTM());
  const box = (m, b) => {
    const xs = [], ys = [];
    for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
      xs.push((m.a * x + m.c * y + m.e) / 1000);
      ys.push((m.b * x + m.d * y + m.f) / 1000);
    }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const union = (a, b) => a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b;
  const fb = p => ({ d: p.getAttribute('d'), m: M(p) });
  const stretch = (key, b, fallback) => BARS.has(key) && b[2] - b[0] > b[3] - b[1]
    ? { t: 'bar', b }
    : { t: 'stretch', key, b, fallback };

  const items = [], used = new Set();

  // 多段拼接或嵌套 svg 拉伸的符号（大括号、矩阵括号、\overline 等）：整个 mo 当一个符号。
  // \lim 这类多字母 mo 不算。
  for (const mo of svg.querySelectorAll('[data-mml-node="mo"]')) {
    const parts = [...mo.querySelectorAll('path')];
    if (!mo.querySelector('svg') && !parts.some(p => PIECES.some(([a, b]) => cpOf(p) >= a && cpOf(p) <= b))) continue;
    let b = null;
    for (const c of mo.children) {
      b = union(b, c.tagName === 'svg'
        ? box(M(c.parentNode), { x: +c.getAttribute('x'), y: +c.getAttribute('y'), width: +c.getAttribute('width'), height: +c.getAttribute('height') })
        : box(M(c), c.getBBox()));
    }
    const arrow = parts.find(p => [0x2192, 0x2190].includes(cpOf(p)));
    items.push(stretch(pieceOf(cpOf(arrow ?? parts[0])), b, parts.map(fb)));
    parts.forEach(p => used.add(p));
  }

  for (const p of svg.querySelectorAll('path')) {
    if (used.has(p) || !p.getAttribute('d')) continue;
    const m = M(p);
    const em = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    const b = box(m, p.getBBox());
    const key = charOf(cpOf(p));
    items.push(b[3] - b[1] > 1.2 * em || ACCENTS.has(cpOf(p))
      ? stretch(key, b, [fb(p)])
      : { t: 'glyph', key, b, base: m.f / 1000, em, fallback: [fb(p)] });
  }

  // 实心矩形是分数线、根号横线等；\boxed 的框是描边矩形，拆成四条边
  for (const r of svg.querySelectorAll('rect')) {
    const b = box(M(r), r.getBBox());
    const sides = r.getAttribute('fill') === 'none'
      ? [[b[0], b[1], b[2], b[1]], [b[2], b[1], b[2], b[3]], [b[0], b[3], b[2], b[3]], [b[0], b[1], b[0], b[3]]]
      : [b];
    for (const s of sides) items.push({ t: 'bar', b: s });
  }

  // \text{} 里 MathJax 字体没有的字（中文等）是 <text>，一个元素里可能有多个字，按宽度均分
  for (const t of svg.querySelectorAll('text')) {
    const m = M(t);
    const em = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * parseFloat(t.getAttribute('font-size')) / 1000;
    const b = box(m, t.getBBox());
    const chars = Array.from(t.textContent);
    const w = (b[2] - b[0]) / chars.length;
    chars.forEach((ch, i) => items.push({ t: 'glyph', key: ch, b: [b[0] + i * w, b[1], b[0] + (i + 1) * w, b[3]], base: m.f / 1000, em }));
  }

  node.remove();
  return { w: vb.width / 1000, asc: -vb.y / 1000, desc: (vb.height + vb.y) / 1000, items };
}
