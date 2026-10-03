// Capa de datos: Firebase (conectado) o localStorage (modo prueba)
import { CONFIG } from "./config.js";

export const demo = !CONFIG.firebase;
// Con Firebase cada persona entra con su email y su contraseña
export const needsLogin = !demo;
export let userEmail = null;
// Cada pareja tiene su propio espacio: couples/{código}
export let coupleCode = null;
export let role = null;        // "a" = quien creó el espacio · "b" = quien se unió con el código
export let meta = null;        // nombres, fecha de inicio, carta de bienvenida… de la pareja
export let isLegacy = false;   // la pareja original (Christian y Celia), con su código de siempre
// Estado de la conexión para enseñarlo en pantalla
let statusCb = () => {};
export const onStatus = fn => { statusCb = fn; };
const fail = (where) => e => { console.error(where, e); statusCb("error", (e && (e.code || e.message)) || String(e), where); };
let impl;
const metaCbs = [];
export const watchMeta = cb => { metaCbs.push(cb); if (meta) setTimeout(() => cb(meta), 0); };
const setMeta = m => { meta = m; metaCbs.forEach(f => { try { f(m); } catch (e) { console.error(e); } }); };

export async function init(loginUI, coupleUI) {
  impl = demo ? localImpl() : await firebaseImpl(loginUI, coupleUI);
}
const AUTH_ERR = {
  "auth/invalid-credential": "Email o contraseña incorrectos", "auth/wrong-password": "Email o contraseña incorrectos",
  "auth/user-not-found": "Aún no tienes cuenta: pulsa \"crear cuenta\"", "auth/email-already-in-use": "Ya tienes cuenta: pulsa Entrar",
  "auth/weak-password": "La contraseña necesita al menos 6 caracteres", "auth/invalid-email": "Ese email no es válido",
  "auth/network-request-failed": "Sin conexión a internet 📶", "auth/too-many-requests": "Demasiados intentos, espera un poco",
  "auth/operation-not-allowed": "Falta activar Email/contraseña en Firebase"
};
export const watchDoc = (p, cb) => impl.watchDoc(p, cb);
export const watchCol = (p, cb, lim) => impl.watchCol(p, cb, lim);
export const merge = (p, d) => impl.merge(p, d).catch(fail("guardar"));
export const add = (p, d) => impl.add(p, d).catch(fail("enviar"));
export const del = (p) => impl.del(p).catch(fail("borrar"));
export async function logout() { if (impl && impl.logout) await impl.logout(); }
export const tx = (p, fn) => impl.tx(p, fn);
// Cambiar los datos de la pareja (nombres, fecha…): lo ven los dos
export const updateMeta = d => impl.updateMeta(d);
// El "pase" que el servidor de Cloudflare comprueba para saber que eres tú (caduca cada hora y se renueva solo)
export async function idToken() { try { return impl && impl.token ? await impl.token() : null; } catch (e) { return null; } }
// Recuperar contraseña: Firebase manda un email para elegir una nueva
let resetFn = null;
export async function resetPassword(email) { if (!resetFn) throw { code: "no-firebase" }; return resetFn(email); }

// Códigos de pareja: 8 letras/números sin los que se confunden (O/0, I/1)
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const cleanCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const validCode = c => /^[A-HJ-NP-Z2-9]{8}$/.test(c);
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ABC[b % 32]).join("");
const legacyRoleOf = email => {
  const E = CONFIG.emails || {}, e = String(email || "").toLowerCase();
  if (!CONFIG.couple || !e) return null;
  return e === String(E.a || "").toLowerCase() ? "a" : e === String(E.b || "").toLowerCase() ? "b" : null;
};

async function firebaseImpl(loginUI, coupleUI) {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  // Si la descarga falla, la app enseña un botón "Reintentar" (recarga la página)
  const load = f => import(base + f);
  const { initializeApp } = await load("firebase-app.js");
  const fs = await load("firebase-firestore.js");
  const au = await load("firebase-auth.js");
  const app = initializeApp(CONFIG.firebase);
  let db;
  const dbId = CONFIG.database || "(default)";   // nombre de la base de datos de Firestore
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }, dbId);
  } catch (e) { db = fs.getFirestore(app, dbId); }
  const auth = au.getAuth(app);
  auth.languageCode = "es";
  resetFn = email => au.sendPasswordResetEmail(auth, email);

  // ---- 1) entrar con email y contraseña ----
  let user = await new Promise(res => { const un = au.onAuthStateChanged(auth, u => { un(); res(u); }); });
  if (user && (user.isAnonymous || !user.email)) { await au.signOut(auth); user = null; }
  let err = "";
  while (!user) {
    const { email, pass, mode } = await loginUI(err);
    try {
      const cred = mode === "new" ? await au.createUserWithEmailAndPassword(auth, email, pass) : await au.signInWithEmailAndPassword(auth, email, pass);
      user = cred.user; err = "";
    } catch (e) { console.error(e); user = null; err = AUTH_ERR[e.code] || "No se pudo entrar (" + (e.code || e.message) + ")"; }
  }
  userEmail = (user.email || "").toLowerCase();
  const uid = user.uid;

  // ---- 2) ¿de qué pareja eres? (users/{uid} → couples/{código}) ----
  const CD = c => fs.doc(db, "couples", c), UD = fs.doc(db, "users", uid);
  const CK = "nsCouple:" + uid;
  const saveCache = () => { try { localStorage.setItem(CK, JSON.stringify({ code: coupleCode, role, meta, legacy: isLegacy })); } catch (e) {} };
  const adopt = (code, m, r) => { coupleCode = code; role = r; isLegacy = code === CONFIG.couple && !!legacyRoleOf(userEmail); setMeta(m || {}); saveCache(); };
  const roleIn = m => !m ? null : m.a === uid ? "a" : m.b === uid ? "b" : null;
  const get = async ref => { const s = await fs.getDoc(ref); return s.exists() ? s.data() : null; };
  // La pareja original sigue con su código de siempre: la primera vez se apuntan solos
  const legacyMeta = () => ({ names: { ...(CONFIG.names || {}) }, gender: { a: "m", b: "f" }, start: CONFIG.start || null, letter: CONFIG.letter || "", sign: CONFIG.sign || "", petName: CONFIG.petName || "Pollito" });
  async function ensureLegacy(lr) {
    const ref = CD(CONFIG.couple), d = (await get(ref)) || {}, up = {};
    if (!(d.members || []).includes(uid)) up.members = fs.arrayUnion(uid);
    if (d[lr] !== uid) up[lr] = uid;
    if (!d.names) up.names = { a: (CONFIG.names || {}).a || "", b: (CONFIG.names || {}).b || "" };
    if (!d.gender) up.gender = { a: "m", b: "f" };
    if (!d.start && CONFIG.start) up.start = CONFIG.start;
    if (!d.letter && CONFIG.letter) { up.letter = CONFIG.letter; up.sign = CONFIG.sign || ""; }
    if (!d.petName && CONFIG.petName) up.petName = CONFIG.petName;
    if (!d.createdAt) up.createdAt = Date.now();
    if (Object.keys(up).length) await fs.setDoc(ref, up, { merge: true });
    await fs.setDoc(UD, { couple: CONFIG.couple, at: Date.now() }, { merge: true }).catch(e => console.warn("users", e));   // con las reglas antiguas no se puede: da igual
    return get(ref);
  }
  async function resolve() {
    const lr = legacyRoleOf(userEmail);
    if (lr) {   // la pareja original: siempre su código de siempre, aunque falle algo
      let m = null; try { m = await ensureLegacy(lr); } catch (e) { console.warn("legacy", e); }
      adopt(CONFIG.couple, { ...legacyMeta(), ...(m || {}) }, lr); return true;
    }
    const code = ((await get(UD)) || {}).couple || null;
    if (!code) return false;
    const m = await get(CD(code)).catch(() => null), r = roleIn(m);
    if (!r) { await fs.setDoc(UD, { couple: null, at: Date.now() }, { merge: true }).catch(() => {}); return false; }
    adopt(code, m, r); return true;
  }
  const api = {
    email: userEmail,
    get code() { return coupleCode; }, get role() { return role; }, get meta() { return meta; },
    // crear vuestro espacio: tú eres "a" y te damos el código para tu pareja
    async create(f) {
      for (let i = 0; i < 5; i++) {
        const code = newCode(), my = String(f.myName || "").trim().slice(0, 30), ot = String(f.partnerName || "").trim().slice(0, 30);
        const m = { members: [uid], a: uid, names: { a: my, b: ot }, gender: { a: f.myGender === "f" ? "f" : "m", b: f.partnerGender === "m" ? "m" : "f" },
          start: f.start || null, letter: String(f.letter || "").slice(0, 4000), sign: f.letter ? `Con todo mi cariño, ${my} ❤️` : "", petName: "Pollito", createdAt: Date.now() };
        try { await fs.setDoc(CD(code), m); } catch (e) { if (e && e.code === "permission-denied" && i < 4) continue; throw e; }   // código ya usado (rarísimo): otro
        await fs.setDoc(UD, { couple: code, at: Date.now() });
        adopt(code, m, "a"); return code;
      }
    },
    // unirte con el código que te ha pasado tu pareja: tú eres "b"
    async join(raw) {
      const code = cleanCode(raw); if (!validCode(code)) throw { code: "bad-code" };
      if (code === coupleCode) throw { code: "own-code" };
      try { await fs.updateDoc(CD(code), { members: fs.arrayUnion(uid), b: uid, joinedAt: Date.now() }); }
      catch (e) { throw (e && (e.code === "permission-denied" || e.code === "not-found")) ? { code: "no-code" } : e; }
      await fs.setDoc(UD, { couple: code, at: Date.now() });
      const m = await get(CD(code)); adopt(code, m, "b"); return m;
    },
    // te has equivocado al crearlo: se cierra para siempre (solo si aún estás tú solo/a)
    async cancel() {
      if (coupleCode) await fs.setDoc(CD(coupleCode), { members: [], closedAt: Date.now() }, { merge: true }).catch(e => console.warn(e));
      await fs.setDoc(UD, { couple: null, at: Date.now() }, { merge: true }).catch(() => {});
      try { localStorage.removeItem(CK); } catch (e) {}
      coupleCode = null; role = null; meta = null;
    },
    update: async d => { await fs.setDoc(CD(coupleCode), d, { merge: true }); setMeta(deep(JSON.parse(JSON.stringify(meta || {})), d)); saveCache(); },
    watch: cb => fs.onSnapshot(CD(coupleCode), s => { if (s.exists()) { const m = s.data(); meta = m; saveCache(); cb(m); } }, e => console.warn(e)),
    logout: async () => {
      try { localStorage.removeItem(CK); } catch (e) {}
      await au.signOut(auth);
      try { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); } catch (e) {}   // en un móvil compartido no queda nada guardado
    }
  };
  let cached = null; try { cached = JSON.parse(localStorage.getItem(CK)); } catch (e) {}
  if (cached && cached.code && cached.role && cached.meta) {
    coupleCode = cached.code; role = cached.role; isLegacy = !!cached.legacy; meta = cached.meta;
    // pareja original: si aún no constáis como miembros (p. ej. con las reglas antiguas no se pudo), se hace ahora sin esperar
    const lr = legacyRoleOf(userEmail);
    if (isLegacy && lr && !(meta.members || []).includes(uid)) ensureLegacy(lr).then(m => { if (m) { setMeta(m); saveCache(); } }).catch(e => console.warn("legacy", e));
  }
  else {
    let ok = false;
    try { ok = await resolve(); } catch (e) { console.error(e); statusCb("error", (e && (e.code || e.message)) || String(e), "buscar vuestra pareja"); throw e; }
    if (!ok) await coupleUI(api);
    if (!coupleCode) throw { code: "sin-pareja" };
  }
  // los datos de la pareja, en directo (si cambiáis los nombres, o si tu pareja se une)
  const un = fs.onSnapshot(CD(coupleCode), s => {
    if (!s.exists()) return; const m = s.data(), r = roleIn(m) || (isLegacy ? role : null);
    if (!r) return; role = r; setMeta(m); saveCache();
  }, e => {
    console.warn("pareja", e);
    // ya no eres de esta pareja (o el espacio se borró): a elegir otra vez
    if (e && e.code === "permission-denied" && !isLegacy) { try { localStorage.removeItem(CK); } catch (x) {} un && un(); setTimeout(() => location.reload(), 300); }
  });

  const R = p => {
    const parts = ("couples/" + coupleCode + "/" + p).split("/");
    return parts.length % 2 ? fs.collection(db, ...parts) : fs.doc(db, ...parts);
  };
  return {
    logout: api.logout,
    token: () => (auth.currentUser || user).getIdToken(),
    updateMeta: d => api.update(d),
    watchDoc: (p, cb) => fs.onSnapshot(R(p), s => { statusCb("ok"); cb(s.exists() ? s.data() : null); }, fail("leer")),
    watchCol: (p, cb, lim) => fs.onSnapshot(
      fs.query(R(p), fs.orderBy("at", "desc"), fs.limit(lim || 50)),
      s => { statusCb("ok"); cb(s.docs.map(d => ({ id: d.id, ...d.data() }))); }, fail("leer")),
    merge: (p, d) => fs.setDoc(R(p), d, { merge: true }),
    add: (p, d) => fs.addDoc(R(p), d),
    del: (p) => fs.deleteDoc(R(p)),
    tx: (p, fn) => fs.runTransaction(db, async t => {
      const r = R(p); const s = await t.get(r);
      const nd = fn(s.exists() ? s.data() : null);
      if (nd) t.set(r, nd);
      return nd;
    })
  };
}

function localImpl() {
  const L = {};
  const K = p => "demo:" + p;
  const get = p => { try { return JSON.parse(localStorage.getItem(K(p))); } catch (e) { return null; } };
  const set = (p, v) => { try { localStorage.setItem(K(p), JSON.stringify(v)); } catch (e) { alert("Sin espacio en modo prueba"); } };
  { const m0 = get("__meta"); if (m0) setMeta(m0); }
  const fire = p => {
    (L[p] || []).forEach(f => f());
    const c = p.split("/").slice(0, -1).join("/");
    if (c) (L[c] || []).forEach(f => f());
  };
  const on = (p, f) => { (L[p] = L[p] || []).push(f); setTimeout(f, 0); return () => { L[p] = L[p].filter(x => x !== f); }; };
  // modo prueba con dos pestañas abiertas: lo que cambia en una se ve en la otra
  try { window.addEventListener("storage", e => { if (!e.key || !e.key.startsWith("demo:")) return; const k = e.key.slice(5); if (k.endsWith("/__ids")) { const c = k.slice(0, -6); (L[c] || []).forEach(f => f()); } else fire(k); }); } catch (e) {}
  const ids = c => get(c + "/__ids") || [];
  const reg = p => { const parts = p.split("/"); if (parts.length % 2) return; const id = parts.pop(), c = parts.join("/"); if (!ids(c).includes(id)) set(c + "/__ids", [...ids(c), id]); };
  return {
    token: null,
    updateMeta: async d => { const m = deep(get("__meta") || {}, d); set("__meta", m); setMeta(m); },
    watchDoc: (p, cb) => on(p, () => cb(get(p))),
    watchCol: (c, cb, lim) => on(c, () => cb(ids(c).map(id => ({ id, ...get(c + "/" + id) }))
      .filter(x => x.at).sort((a, b) => b.at - a.at).slice(0, lim || 50))),
    merge: async (p, d) => { reg(p); set(p, deep(get(p) || {}, d)); fire(p); },
    add: async (c, d) => {
      const id = Math.random().toString(36).slice(2);
      set(c + "/" + id, d); set(c + "/__ids", [...ids(c), id]); fire(c + "/" + id);
    },
    del: async p => {
      const parts = p.split("/"); const id = parts.pop(); const c = parts.join("/");
      localStorage.removeItem(K(p)); set(c + "/__ids", ids(c).filter(x => x !== id)); fire(p);
    },
    tx: async (p, fn) => { const nd = fn(get(p)); if (nd) { reg(p); set(p, nd); fire(p); } return nd; }
  };
}

function deep(a, b) {
  for (const k in b) {
    const v = b[k];
    if (v && typeof v === "object" && !Array.isArray(v)) a[k] = deep(a[k] && typeof a[k] === "object" ? a[k] : {}, v);
    else a[k] = v;
  }
  return a;
}
