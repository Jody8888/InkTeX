import { lib, replaceAll } from './db.js';
import { GROUPS, keyOf, CELL } from './charset.js';
import { drawGlyph, makeCanvas, PEN } from './ink.js';

const $ = id => document.getElementById(id);
let onPick;

function tile(g, i) {
  const vs = lib[keyOf(g.chars[i], g.tall)];
  const b = document.createElement('button');
  b.className = vs ? 'tile' : 'tile missing';
  b.onclick = () => onPick(g, i);
  if (!vs) {
    b.textContent = g.chars[i];
    return b;
  }
  const [top, bottom] = CELL[g.tall ? 'tall' : 'normal'];
  const k = 58 / (bottom - top);
  const ctx = makeCanvas(CELL.w * k, 58);
  drawGlyph(ctx, vs[0], k, 0, -top * k, k * PEN);
  const n = document.createElement('span');
  n.textContent = vs.length;
  b.append(ctx.canvas, n);
  return b;
}

// pick(g, i)：点某个字时跳到采字页
export function renderLibrary(pick) {
  onPick = pick;
  const known = new Set(GROUPS.flatMap(g => g.chars.map(ch => keyOf(ch, g.tall))));
  const others = Object.keys(lib).filter(k => !known.has(k));
  const groups = others.length ? [...GROUPS, { name: '其他', chars: others }] : GROUPS;
  const total = Object.values(lib).reduce((n, vs) => n + vs.length, 0);
  $('stats').textContent = `已采 ${Object.keys(lib).length} 个字符，共 ${total} 种写法`;
  $('libGroups').replaceChildren(...groups.flatMap(g => {
    const h = document.createElement('h3');
    h.textContent = `${g.name}  ${g.chars.filter(ch => lib[keyOf(ch, g.tall)]).length}/${g.chars.length}`;
    const d = document.createElement('div');
    d.className = 'tiles';
    d.append(...g.chars.map((_, i) => tile(g, i)));
    return [h, d];
  }));
}

$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(lib)], { type: 'application/json' }));
  a.download = `inktex-glyphs-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};

$('import').onchange = async e => {
  replaceAll(JSON.parse(await e.target.files[0].text()));
  e.target.value = '';
  renderLibrary(onPick);
};
