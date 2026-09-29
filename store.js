// Capa de datos: Firebase (conectado) o localStorage (modo prueba)
import { CONFIG } from "./config.js";

export const demo = !CONFIG.firebase;
// Si hay emails en config.js, solo esas dos personas pueden entrar (email + contraseña)
export const needsLogin = !demo && !!(CONFIG.emails && (CONFIG.emails.a || CONFIG.emails.b));
export let userEmail = null;
// Estado de la conexión para enseñarlo en pantalla
let statusCb = () => {};
export const onStatus = fn => { statusCb = fn; };
const fail = (where) => e => { console.error(where, e); statusCb("error", (e && (e.code || e.message)) || String(e), where); };
let impl;

export async function init(loginUI) {
  impl = demo ? localImpl() : await firebaseImpl(loginUI);
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

async function firebaseImpl(loginUI) {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  const { initializeApp } = await import(base + "firebase-app.js");
  const fs = await import(base + "firebase-firestore.js");
  const au = await import(base + "firebase-auth.js");
  const app = initializeApp(CONFIG.firebase);
  let db;
  const dbId = CONFIG.database || "(default)";   // nombre de la base de datos de Firestore
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }, dbId);
  } catch (e) { db = fs.getFirestore(app, dbId); }
  const auth = au.getAuth(app);
  if (needsLogin) {
    const allowed = [CONFIG.emails.a, CONFIG.emails.b].filter(Boolean).map(e => e.toLowerCase());
    let user = await new Promise(res => { const un = au.onAuthStateChanged(auth, u => { un(); res(u); }); });
    let err = "";
    while (!user || !allowed.includes((user.email || "").toLowerCase())) {
      if (user) { await au.signOut(auth); user = null; err = "Este email no está invitado 🙈"; }
      const { email, pass, mode } = await loginUI(err);
      try {
        const cred = mode === "new" ? await au.createUserWithEmailAndPassword(auth, email, pass) : await au.signInWithEmailAndPassword(auth, email, pass);
        user = cred.user; err = "";
      } catch (e) { console.error(e); user = null; err = AUTH_ERR[e.code] || "No se pudo entrar (" + (e.code || e.message) + ")"; }
    }
    userEmail = user.email.toLowerCase();
  } else {
    await new Promise(res => {
      let done = false; const ok = () => { if (!done) { done = true; res(); } };
      au.onAuthStateChanged(auth, u => { if (u) ok(); else au.signInAnonymously(auth).catch(e => { console.error(e); ok(); }); });
      setTimeout(ok, 6000); // sin conexión: seguimos con la caché
    });
  }
  const R = p => {
    const parts = ("couples/" + CONFIG.couple + "/" + p).split("/");
    return parts.length % 2 ? fs.collection(db, ...parts) : fs.doc(db, ...parts);
  };
  return {
    logout: () => au.signOut(auth),
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
  const fire = p => {
    (L[p] || []).forEach(f => f());
    const c = p.split("/").slice(0, -1).join("/");
    if (c) (L[c] || []).forEach(f => f());
  };
  const on = (p, f) => { (L[p] = L[p] || []).push(f); setTimeout(f, 0); return () => { L[p] = L[p].filter(x => x !== f); }; };
  const ids = c => get(c + "/__ids") || [];
  const reg = p => { const parts = p.split("/"); if (parts.length % 2) return; const id = parts.pop(), c = parts.join("/"); if (!ids(c).includes(id)) set(c + "/__ids", [...ids(c), id]); };
  return {
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
