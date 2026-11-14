import { openGroup, refresh } from './collect.js';
import { renderLibrary } from './library.js';

const tabs = document.querySelectorAll('nav button');

function show(name) {
  tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== name);
  if (name === 'library') renderLibrary((g, i) => { show('collect'); openGroup(g, i); });
}

tabs.forEach(b => b.onclick = () => {
  show(b.dataset.tab);
  if (b.dataset.tab === 'collect') refresh();
});

navigator.serviceWorker.register('sw.js');
