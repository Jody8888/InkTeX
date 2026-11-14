import { lib, save } from './db.js';
import { GROUPS, keyOf, CELL } from './charset.js';
import { drawGlyph, makeCanvas, PEN } from './ink.js';

const N = 4;   // 每次写几格
const THUMB = 40;
const GUIDES = [[-0.7, []], [-0.45, [6, 6]], [0, []], [0.25, [6, 6]]];   // 大写高度、小写高度、基线、下伸线

const $ = id => document.getElementById(id);
let group = GROUPS[0], idx, custom = null, cells = [], history = [], EM;

const span = () => CELL[group.tall ? 'tall' : 'normal'];
const key = () => keyOf(group.chars[idx], group.tall);
// 存储前压缩精度：坐标 0.001em，压力 0.01
const quantize = s => s.map((v, i) => i % 3 === 2 ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000);

function guides(ctx, k, top) {
  ctx.lineWidth = 1;
  for (const [y, dash] of GUIDES) {
    ctx.strokeStyle = y === 0 ? '#7f9cc4' : '#c9d6e8';
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(0, (y - top) * k);
    ctx.lineTo(CELL.w * k, (y - top) * k);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function redraw(c) {
  const [top, bottom] = span();
  c.ctx.clearRect(0, 0, CELL.w * EM, (bottom - top) * EM);
  guides(c.ctx, EM, top);
  drawGlyph(c.ctx, c.strokes, EM, 0, -top * EM, EM * PEN);
}

function buildCells() {
  const [top, bottom] = span();
  EM = Math.min(120, ($('cells').clientWidth - 8 * (N - 1) - 2 * N) / (N * CELL.w));   // 4 格排满一行
  history = [];
  cells = Array.from({ length: N }, () => {
    const c = { ctx: makeCanvas(CELL.w * EM, (bottom - top) * EM), strokes: [] };
    const cv = c.ctx.canvas;
    let cur = null;
    const point = e => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) / EM, (e.clientY - r.top) / EM + top, e.pointerType === 'mouse' ? 0.5 : e.pressure];
    };
    cv.onpointerdown = e => {
      if (e.pointerType === 'touch') return;
      cv.setPointerCapture(e.pointerId);
      cur = point(e);
      c.strokes.push(cur);
      history.push(c);
      redraw(c);
    };
    const add = (e, up) => {
      const p = point(e);
      if (up) p[2] = cur.at(-1);   // 抬笔事件的压力是 0，沿用上一点的压力
      if (Math.hypot(p[0] - cur.at(-3), p[1] - cur.at(-2)) < 0.006) return;
      cur.push(...p);
      redraw(c);
    };
    cv.onpointermove = e => cur && add(e);
    // 快速短笔画时 Safari 可能一个 move 都不发，抬笔位置也要记进去
    cv.onpointerup = e => {
      if (!cur) return;
      add(e, true);
      cur = null;
    };
    cv.onpointercancel = () => cur = null;
    // 不让 iPadOS 的 Scribble 和长按手势截走 Pencil 的小幅移动（被截走时只剩起点）
    for (const t of ['touchstart', 'touchmove']) cv.addEventListener(t, e => e.preventDefault(), { passive: false });
    redraw(c);
    return c;
  });
  $('cells').replaceChildren(...cells.map(c => c.ctx.canvas));
}

function renderSaved() {
  const [top, bottom] = span();
  $('saved').replaceChildren(...(lib[key()] || []).map((v, i) => {
    const d = document.createElement('div');
    d.className = 'thumb';
    const ctx = makeCanvas(CELL.w * THUMB, (bottom - top) * THUMB);
    guides(ctx, THUMB, top);
    drawGlyph(ctx, v, THUMB, 0, -top * THUMB, THUMB * PEN);
    const x = document.createElement('button');
    x.textContent = '×';
    x.onclick = () => {
      lib[key()].splice(i, 1);
      save(key());
      renderSaved();
      renderChips();
    };
    d.append(ctx.canvas, x);
    return d;
  }));
}

function renderChips() {
  $('groups').replaceChildren(...(custom ? [...GROUPS, custom] : GROUPS).map(g => {
    const b = document.createElement('button');
    b.textContent = `${g.name} ${g.chars.filter(ch => lib[keyOf(ch, g.tall)]).length}/${g.chars.length}`;
    b.className = g === group ? 'on' : '';
    b.onclick = () => openGroup(g);
    return b;
  }));
}

function go(i) {
  idx = (i + group.chars.length) % group.chars.length;
  $('ref').textContent = group.chars[idx];
  $('pos').textContent = `${group.name}${group.tall ? '（加高版）' : ''}  ${idx + 1} / ${group.chars.length}`;
  buildCells();
  renderSaved();
  renderChips();
}

// 打开分组；不指定位置时跳到第一个还没采的字
export function openGroup(g, i) {
  group = g;
  if (!GROUPS.includes(g)) custom = g;
  go(i ?? Math.max(0, g.chars.findIndex(ch => !lib[keyOf(ch, g.tall)])));
}

// 切到采字页时调用（页面隐藏时量不出格子宽度，所以不在加载时建格子）
export const refresh = () => openGroup(group, idx);

$('prev').onclick = () => go(idx - 1);
$('next').onclick = () => go(idx + 1);
$('undo').onclick = () => {
  const c = history.pop();
  if (!c) return;
  c.strokes.pop();
  redraw(c);
};
$('clear').onclick = () => {
  cells.forEach(c => { c.strokes = []; redraw(c); });
  history = [];
};
$('save').onclick = () => {
  const vs = cells.filter(c => c.strokes.length).map(c => c.strokes.map(quantize));
  if (vs.length) {
    lib[key()] = (lib[key()] || []).concat(vs);
    save(key());
  }
  go(idx + 1);
};
$('customGo').onclick = () => {
  const chars = Array.from($('customChars').value.replace(/\s/g, ''));
  if (!chars.length) return;
  openGroup({ name: '自定义', chars }, 0);
};
