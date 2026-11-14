import { openGroup, refresh } from './collect.js';
import { renderLibrary } from './library.js';
import { initGenerate, render } from './generate.js';

const tabs = document.querySelectorAll('nav button');

function show(name) {
  tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== name);
}

const pick = (g, i) => { show('collect'); openGroup(g, i); };

tabs.forEach(b => b.onclick = () => {
  const name = b.dataset.tab;
  show(name);
  if (name === 'generate') render();
  if (name === 'collect') refresh();
  if (name === 'library') renderLibrary(pick);
});

initGenerate(chars => pick({ name: '缺字', chars }, 0));
render();

navigator.serviceWorker.register('sw.js');
