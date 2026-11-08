// غيّر رقم النسخة عند أي تعديل على الملفات، ليأخذ المستخدمون النسخة الجديدة
const VERSION = 'hisn-v8';

const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// مواقع الخطوط والأيقونات: نحفظها أول مرة نفتح فيها بالإنترنت
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

// لو الإنترنت بطيء جدًا نفتح من الحفظ بعد المدة دي (بالمللي ثانية)
const NAVIGATE_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // cache: 'reload' عشان نجيب الملفات الجديدة فعلًا ومن كاش المتصفح (GitHub Pages بيحفظ 10 دقايق)
      cache.addAll(CORE_FILES.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // لا نستخدم skipWaiting هنا: النسخة الجديدة تنتظر حتى يضغط المستخدم "تحديث الآن"
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(response) {
  return response && (response.ok || response.type === 'opaque');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) فتح الصفحة: من الإنترنت أولاً (لنحصل على آخر تحديث)، وإلا من الحفظ
  //    ولو الإنترنت بطيء أكتر من NAVIGATE_TIMEOUT نفتح من الحفظ فورًا
  if (request.mode === 'navigate') {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put('./index.html', copy));
      }
      return response;
    });

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), NAVIGATE_TIMEOUT)
    );

    event.respondWith(
      Promise.race([network, timeout]).catch(() =>
        // لو مفيش حفظ لسه (أول فتحة) نستنى الإنترنت لحد ما يخلص
        caches.match('./index.html').then((cached) => cached || network)
      )
    );
    // نخلي الـ Service Worker شغال لحد ما التحميل في الخلفية يخلص ويتحفظ
    event.waitUntil(network.catch(() => {}));
    return;
  }

  // 2) ملفات موقعنا: من الحفظ أولاً
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3) الخطوط والأيقونات: نعرض المحفوظ فوراً ونحدّثه في الخلفية
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (isCacheable(response)) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // 4) أي شيء آخر (مواقيت الصلاة، بث الإذاعة، Google Analytics) يمر كما هو بدون حفظ
  //    ملاحظة: مواقيت الصلاة بتتحفظ جوه الصفحة نفسها (localStorage) مش هنا
});
