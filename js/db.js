// 字形库：key → 多种写法；每种写法是若干笔画，每笔是扁平数组 [x, y, 压力, ...]，
// 坐标单位为 em，原点在格子左边的基线上。key 是字符本身，加高版本为 'T:' + 字符。
const open = indexedDB.open('inktex', 1);
open.onupgradeneeded = () => open.result.createObjectStore('glyphs');
const db = await new Promise(r => open.onsuccess = () => r(open.result));

const req = r => new Promise(res => r.onsuccess = () => res(r.result));
const store = mode => db.transaction('glyphs', mode).objectStore('glyphs');

export const lib = {};
const s = store('readonly');
const [keys, vals] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
keys.forEach((k, i) => lib[k] = vals[i]);

export function save(key) {
  if (lib[key].length) store('readwrite').put(lib[key], key);
  else { delete lib[key]; store('readwrite').delete(key); }
}

export function replaceAll(data) {
  const s = store('readwrite');
  s.clear();
  for (const k in lib) delete lib[k];
  for (const k in data) { lib[k] = data[k]; s.put(data[k], k); }
}
