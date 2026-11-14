// 联网时总取最新文件并顺手缓存，断网时用缓存，保证添加到主屏幕后可离线使用
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request)
    .then(r => {
      const copy = r.clone();
      caches.open('inktex').then(c => c.put(e.request, copy));
      return r;
    })
    .catch(() => caches.match(e.request))
));
