const CACHE = "nosotros-v99";
const FILES = ["./", "index.html", "app.js", "store.js", "config.js", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
const staleClients = new Set();
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  const own = u.origin === location.origin;
  const lib = u.hostname === "cdnjs.cloudflare.com";
  if (!own && !lib) return; // Firebase, mapas, etc. van directos, sin pasar por aquí
  // Archivos de la app: siempre la versión más nueva; si no hay internet, la guardada
  const net = (own ? fetch(u.href, { cache: "no-cache", credentials: "same-origin" }) : fetch(e.request)).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  });
  const saved = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : null));
  e.waitUntil(net.catch(() => {}));
  // Si esta pantalla se abrió con la copia guardada, el resto de archivos también salen de ahí (nunca mezclamos versiones)
  if (own && e.clientId && staleClients.has(e.clientId)) { e.respondWith(saved().then(r => r || net)); return; }
  if (own && e.request.mode === "navigate") {
    // Con mala cobertura no hacemos esperar: si la red tarda más de 2,5 s, abrimos con la copia guardada (la nueva queda guardada para la próxima vez)
    let netDone = false; net.then(() => { netDone = true; }, () => {});
    const slow = new Promise(res => setTimeout(res, 2500)).then(() => (netDone ? net : saved().then(r => { if (!r || netDone) return net; if (e.resultingClientId) staleClients.add(e.resultingClientId); return r; })));
    e.respondWith(Promise.race([net, slow]).catch(() => saved().then(r => { if (r && e.resultingClientId) staleClients.add(e.resultingClientId); return r || Response.error(); })));
    return;
  }
  e.respondWith(net.catch(() => saved().then(r => r || Response.error())));
});

// ---------- Avisos con la app cerrada ----------
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Nosotros 💌", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "nosotros", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  // solo abrimos páginas de la propia app (nunca un enlace de fuera)
  let url = "./"; try { const u = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope); if (u.origin === self.location.origin) url = u.href; } catch (x) {}
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
