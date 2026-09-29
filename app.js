import { CONFIG } from "./config.js";
import * as S from "./store.js";
let GAMES_READY = false;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DAY = 864e5;
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);   // día UTC, igual para los dos
const daysBetween = (k1, k2) => Math.round((Date.parse(k2) - Date.parse(k1)) / DAY);

let who = ls.get("who");                 // "a" o "b"
const other = () => (who === "a" ? "b" : "a");
const name = w => CONFIG.names[w] || (w === "a" ? "Yo" : "Tú");
const state = { main: {}, pet: null, quiz: null, ttt: null, msgs: [], ans: {} };

function toast(t, ms = 2400) { const e = $("toast"); e.textContent = t; e.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("show"), ms); }
const buzz = n => { if (navigator.vibrate) navigator.vibrate(n || 40); };
const offline = e => { console.error(e); toast(navigator.onLine ? "No se pudo guardar, prueba otra vez" : "Necesitas conexión para esto 📶"); };

// ================= Navegación =================
const TABS = ["home", "pet", "games", "letters", "mem"];
function showTab(t) {
  TABS.forEach(x => $("tab-" + x).classList.toggle("hidden", x !== t));
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  ls.set("tab", t); window.scrollTo(0, 0);
  if (t === "home") $("dotHome").classList.add("hidden");
  if (t === "mem") setMemSeg(memSeg);
  if (t === "letters") { renderLetters(); renderCaps(); renderDates(); }
  if (t === "games") { if (curGame) openGame(curGame); else renderGameMenu(); }
  if (t === "pet") setTimeout(() => { renderPet(); petWelcome(); }, 350);
}
document.querySelectorAll("nav button").forEach(b => b.onclick = () => showTab(b.dataset.tab));


// ================= Relojes y contadores =================
function fmt(tz, o) { try { return new Intl.DateTimeFormat("es-ES", { timeZone: tz, ...o }).format(new Date()); } catch (e) { return new Intl.DateTimeFormat("es-ES", o).format(new Date()); } }
const hourIn = tz => parseInt(fmt(tz, { hour: "2-digit", hour12: false }), 10) % 24;
const mood = h => h >= 23 || h < 7 ? "🌙 durmiendo" : h < 12 ? "☀️ mañana" : h < 20 ? "🌤 tarde" : "🌆 noche";
function offsetMin(tz) { const d = new Date(); try { return Math.round((new Date(d.toLocaleString("en-US", { timeZone: tz })) - new Date(d.toLocaleString("en-US", { timeZone: "UTC" }))) / 6e4); } catch (e) { return 0; } }
function tick() {
  const otz = (state.main.tz && state.main.tz[other()]) || myTz;
  $("meName").textContent = name(who);
  $("youName").textContent = name(other());
  $("meTime").textContent = fmt(myTz, { hour: "2-digit", minute: "2-digit" });
  $("youTime").textContent = fmt(otz, { hour: "2-digit", minute: "2-digit" });
  $("meDay").textContent = mood(hourIn(myTz)).split(" ")[0];
  $("youDay").textContent = mood(hourIn(otz)).split(" ")[0];
  const d = (offsetMin(otz) - offsetMin(myTz)) / 60;
  $("diff").textContent = d === 0 ? "Misma hora 🥰" : Math.abs(d) + " h " + (d > 0 ? "por delante de ti" : "por detrás de ti");

  if (CONFIG.start) {
    const days = Math.floor((Date.now() - new Date(CONFIG.start + "T00:00:00")) / DAY);
    $("together").textContent = days; $("togetherSub").textContent = days === 1 ? "día juntos" : "días juntos";
  } else { $("together").textContent = "—"; $("togetherSub").textContent = "días"; }

  const next = state.main.next;
  if (next) {
    const ms = next - Date.now();
    if (ms <= 0) { $("countdown").textContent = "¡Ya!"; $("countdownSub").textContent = "🥹"; }
    else {
      const dd = Math.floor(ms / DAY), hh = Math.floor(ms % DAY / 36e5), mm = Math.floor(ms % 36e5 / 6e4);
      $("countdown").innerHTML = dd > 0 ? dd + "<small> d</small>" : hh + "<small> h</small> " + mm + "<small> m</small>";
      $("countdownSub").textContent = dd > 0 ? hh + " h " + mm + " min" : "¡ya casi!";
    }
  } else { $("countdown").textContent = "—"; $("countdownSub").textContent = "elige fecha en ⚙️"; }
  if (otdKey) watchOTD();
  renderHome();
}

// ================= Buzón =================
const SWEET = [
  "Estaba pensando en ti ❤️", "Te echo de menos 🥺", "Ojalá estuvieras aquí ahora mismo", "Un abrazo a distancia 🤗",
  "Me acabo de acordar de ti y he sonreído 😊", "Un día menos para vernos ✈️", "Eres mi persona favorita 💕",
  "Te mando un beso que cruza la distancia 😘", "Solo quería decirte que te quiero", "Nada es igual sin ti 🌙"
];
function sendMsg(text, kind = "text") {
  S.add("messages", { from: who, text, kind, at: Date.now() });
  notifyOther(text);
}
$("btnThink").onclick = () => { buzz(60); sendMsg(SWEET[Math.floor(Math.random() * SWEET.length)], "think"); toast("Enviado a " + name(other()) + " 💌"); };
$("msgSend").onclick = () => { const t = $("msgInput").value.trim(); if (!t) return; sendMsg(t); $("msgInput").value = ""; ls.set("msgRead", Date.now()); renderHome(); };
$("msgInput").onkeydown = e => { if (e.key === "Enter") $("msgSend").click(); };

let msgsLoaded = false;

// ---- Foto de ver una vez (como la "1" de WhatsApp) ----
let snapDraft = null, snapOpenId = null;
function snapShow(src, top, bot) {
  $("snapImg").src = src; $("snapTop").innerHTML = top; $("snapBot").innerHTML = bot;
  $("snapView").classList.remove("hidden"); document.body.style.overflow = "hidden";
}
function snapHide() { $("snapView").classList.add("hidden"); $("snapImg").src = ""; document.body.style.overflow = ""; }
$("snapView").addEventListener("contextmenu", e => e.preventDefault());
$("snapInput").addEventListener("change", e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const max = 1280, s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    snapDraft = c.toDataURL("image/jpeg", 0.72);
    snapShow(snapDraft, `<span class="one">1</span> Foto de ver una vez para ${esc(name(other()))}`,
      `<button class="btn" id="snapCancel">Cancelar</button><button class="btn primary" id="snapSend">Enviar 📸</button>`);
    $("snapCancel").onclick = () => { snapDraft = null; snapHide(); };
    $("snapSend").onclick = () => {
      S.add("messages", { from: who, kind: "snap", text: "📸 Te he enviado una foto (ver una vez)", photo: snapDraft, opened: false, at: Date.now() });
      notifyOther("📸 Te ha enviado una foto de ver una vez");
      snapDraft = null; snapHide(); buzz(); toast("Foto enviada 📸 Solo podrá verla una vez");
    };
  };
  img.src = url;
});
function openSnap(id) {
  const m = (state.msgs || []).find(x => x.id === id);
  if (!m || !m.photo || m.opened) return toast("Esta foto ya se ha abierto");
  snapOpenId = id;
  snapShow(m.photo, `<span class="one">1</span> Foto de ${esc(name(m.from))}`,
    `<div style="width:100%"><button class="btn primary" style="width:100%" id="snapDone">Cerrar · se borrará</button><div class="note mt">Solo puedes verla ahora 👀</div></div>`);
  // se marca como abierta al momento (como WhatsApp) y se borra la foto de la base de datos
  S.merge("messages/" + id, { opened: true, openedAt: Date.now(), photo: null });
  $("snapDone").onclick = () => { snapOpenId = null; snapHide(); };
}

function renderChat(list) {
  renderHome();
  const seen = +(ls.get("seenMsg") || 0);
  if (msgsLoaded) {
    const fresh = list.filter(m => m.from === other() && m.at > seen);
    if (fresh.length) {
      toast(name(other()) + ": " + fresh[0].text, 3500); buzz([60, 80, 60]);
      if ($("tab-home").classList.contains("hidden")) $("dotHome").classList.remove("hidden");
    }
  }
  msgsLoaded = true;
  const top = list.find(m => m.from === other()); if (top) ls.set("seenMsg", Math.max(seen, top.at));
  const items = list.slice(0, 30).reverse();
  const tm = m => `<span class="t">${new Date(m.at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>`;
  const bub = m => {
    const side = m.from === who ? "me" : "them";
    if (m.kind === "voice" && m.audio) return `<div class="bub ${side} voice" data-voice="${esc(m.id)}"><span class="pl">▶️</span><span class="wave"></span><span>${mmss(m.dur || 0)}${tm(m)}</span></div>`;
    if (m.kind !== "snap") return `<div class="bub ${side}">${esc(m.text)}${tm(m)}</div>`;
    if (m.from === who) return `<div class="bub me snap"><span class="one">1</span><span>Foto · ${m.opened ? "Abierta ✓✓" : "Enviada ✓"}${tm(m)}</span></div>`;
    if (m.opened || !m.photo) return `<div class="bub them snap gone"><span class="one">1</span><span>Foto abierta${tm(m)}</span></div>`;
    return `<div class="bub them snap new" data-snap="${esc(m.id)}"><span class="one">1</span><span>📸 Toca para ver la foto${tm(m)}</span></div>`;
  };
  $("chat").innerHTML = items.length ? items.map(bub).join("")
    : '<div class="empty">Aún no hay mensajes. Pulsa "Pienso en ti" ✨</div>';
  $("chat").scrollTop = $("chat").scrollHeight;
  $("chat").querySelectorAll("[data-snap]").forEach(b => b.onclick = () => openSnap(b.dataset.snap));
  $("chat").querySelectorAll("[data-voice]").forEach(b => b.onclick = () => { const m = list.find(x => x.id === b.dataset.voice); if (m) playAudio(m.audio, b); });
}

// ================= Pregunta del día =================
const QUESTIONS = [
  "¿Qué es lo primero que harás cuando nos veamos?", "¿Cuál es tu recuerdo favorito de nosotros?", "¿Qué canción te hace pensar en mí?",
  "¿Dónde te gustaría que viviéramos juntos?", "¿Qué fue lo primero que te gustó de mí?", "¿Qué plan harías conmigo este fin de semana?",
  "¿Qué comida te gustaría que cocináramos juntos?", "¿A qué país te gustaría viajar conmigo?", "¿Qué te hizo sonreír hoy?",
  "¿Qué costumbre mía echas de menos?", "¿Cómo imaginas nuestra vida dentro de 5 años?", "¿Qué película veríamos esta noche si estuviéramos juntos?",
  "¿Qué es lo más bonito que te he dicho?", "¿Qué te gustaría que hiciéramos por nuestro próximo aniversario?", "¿Cuál fue el mejor día que pasamos juntos?",
  "¿Qué te da más paz de nuestra relación?", "¿Qué pequeño detalle mío te encanta?", "¿Qué palabra nos describe?",
  "¿Qué te gustaría enseñarme?", "¿Qué quieres que te diga más a menudo?", "¿Cuál es tu lugar favorito para estar conmigo?",
  "¿Qué sueño quieres cumplir conmigo?", "¿Qué es lo más difícil de la distancia para ti?", "¿Qué te hace sentir querido/a?",
  "¿Qué foto nuestra es tu favorita y por qué?", "¿Qué harías si mañana despertaras a mi lado?", "¿Qué nos hace un buen equipo?",
  "¿Qué te gustaría que no cambiara nunca de nosotros?", "¿Qué aventura loca harías conmigo?", "¿Qué le dirías a nuestro yo de hace un año?"
];
const qIndex = () => Math.floor(Date.parse(dayKey()) / DAY) % QUESTIONS.length;
function renderQuestion() {
  renderHome();
  $("question").textContent = gz(QUESTIONS[qIndex()], who);
  const a = state.ans || {}, mine = a[who], theirs = a[other()];
  let h = "";
  if (mine) {
    h += `<div class="ans"><b>Tú</b>${esc(mine)}</div>`;
    h += theirs ? `<div class="ans"><b>${esc(name(other()))}</b>${esc(theirs)}</div>` : `<div class="ans locked">Esperando a que ${esc(name(other()))} responda…</div>`;
  } else {
    if (theirs) h += `<div class="ans locked">🔒 ${esc(name(other()))} ya ha respondido. Contesta para ver su respuesta.</div>`;
    h += `<textarea id="qAns" class="mt" placeholder="Tu respuesta…"></textarea><button class="btn primary mt" id="qSend">Responder</button>`;
  }
  $("qBox").innerHTML = h;
  if (!mine) $("qSend").onclick = () => {
    const t = $("qAns").value.trim(); if (!t) return toast("Escribe tu respuesta");
    S.merge("answers/" + dayKey(), { [who]: t, at: Date.now() }); buzz(); addHearts(5, "pregunta del día");
  };
}
let unAns = null, ansDay = null;
function watchAnswers() {
  const k = dayKey(); if (k === ansDay) return; ansDay = k;
  if (unAns) unAns();
  unAns = S.watchDoc("answers/" + k, d => { state.ans = d || {}; renderQuestion(); });
}

// ================= Mascota =================
// Crece por fases con los DÍAS que le cuidáis los dos; sube de NIVEL con la experiencia de cada cuidado.
const STAGES = [
  { xp: 0, n: "Huevo" }, { xp: 2, n: "Recién nacido" }, { xp: 7, n: "Pollito" }, { xp: 21, n: "Pollito travieso" },
  { xp: 45, n: "Pollo joven" }, { xp: 90, n: "Gran pollo" }, { xp: 180, n: "Pollo legendario ✨" }
];
const STAGE_E = ["🥚", "🐣", "🐥", "🐤", "🐔", "🐓", "✨"];
const TRAITS = {
  gloton: { e: "🍰", n: "Glotón", d: "Siempre tiene hambre, pero la comida le pone muy contento", mul: { food: 1.35 } },
  dormilon: { e: "😴", n: "Dormilón", d: "Se cansa antes y le encanta la siesta", mul: { energy: 1.4 } },
  jugueton: { e: "⚽", n: "Juguetón", d: "Se aburre rápido, pero jugar le da más experiencia", mul: { fun: 1.35 } },
  mimoso: { e: "🥰", n: "Mimoso", d: "Necesita cariño a menudo; los mimos valen el doble", mul: { love: 1.35 } }
};
const RATE = { food: 3.2, love: 2.5, fun: 3, clean: 1.6, energy: 2.2 };   // puntos que bajan por hora
const NEEDS = [["food", "🍗", "Hambre"], ["love", "💗", "Cariño"], ["fun", "🎈", "Diversión"], ["clean", "🫧", "Limpieza"], ["energy", "⚡", "Energía"]];

// ---------- Catálogo de la tienda ----------
// cat: ropa | color | comida | juguete | casa | lugar ; lvl = nivel mínimo ; req = logro necesario
const CATALOG = [
  // Ropa · cabeza
  { id: "lazo", cat: "ropa", slot: "head", e: "🎀", n: "Lazo", c: 40, lvl: 1 },
  { id: "flor", cat: "ropa", slot: "head", e: "🌸", n: "Flor", c: 60, lvl: 1 },
  { id: "gorrolana", cat: "ropa", slot: "head", e: "🧶", n: "Gorro de lana", c: 90, lvl: 2 },
  { id: "gorro", cat: "ropa", slot: "head", e: "🥳", n: "Gorro de fiesta", c: 120, lvl: 3 },
  { id: "chef", cat: "ropa", slot: "head", e: "👨‍🍳", n: "Gorro de chef", c: 150, lvl: 4 },
  { id: "conejo", cat: "ropa", slot: "head", e: "🐰", n: "Orejas de conejo", c: 160, lvl: 4 },
  { id: "vaquero", cat: "ropa", slot: "head", e: "🤠", n: "Vaquero", c: 180, lvl: 5 },
  { id: "cascos", cat: "ropa", slot: "head", e: "🎧", n: "Auriculares", c: 180, lvl: 5 },
  { id: "pirata", cat: "ropa", slot: "head", e: "🏴‍☠️", n: "Pirata", c: 220, lvl: 6 },
  { id: "cuernos", cat: "ropa", slot: "head", e: "😈", n: "Cuernos", c: 200, lvl: 7 },
  { id: "aureola", cat: "ropa", slot: "head", e: "😇", n: "Aureola", c: 300, lvl: 1, req: { k: "best", v: 30, t: "Racha de 30 días" } },
  { id: "corona", cat: "ropa", slot: "head", e: "👑", n: "Corona", c: 500, lvl: 12 },
  // Ropa · cara
  { id: "bigote", cat: "ropa", slot: "face", e: "🥸", n: "Bigote", c: 70, lvl: 1 },
  { id: "gafas", cat: "ropa", slot: "face", e: "😎", n: "Gafas de sol", c: 110, lvl: 2 },
  { id: "gafascor", cat: "ropa", slot: "face", e: "😍", n: "Gafas corazón", c: 150, lvl: 3 },
  { id: "monoculo", cat: "ropa", slot: "face", e: "🧐", n: "Monóculo", c: 200, lvl: 6 },
  // Ropa · cuello
  { id: "pajarita", cat: "ropa", slot: "neck", e: "🎩", n: "Pajarita", c: 50, lvl: 1 },
  { id: "bufanda", cat: "ropa", slot: "neck", e: "🧣", n: "Bufanda", c: 80, lvl: 1 },
  { id: "corbata", cat: "ropa", slot: "neck", e: "👔", n: "Corbata", c: 90, lvl: 2 },
  { id: "collar", cat: "ropa", slot: "neck", e: "📿", n: "Collar de perlas", c: 200, lvl: 5 },
  { id: "medalla", cat: "ropa", slot: "neck", e: "🥇", n: "Medalla", c: 150, lvl: 1, req: { k: "best", v: 7, t: "Racha de 7 días" } },
  // Ropa · espalda
  { id: "mochila", cat: "ropa", slot: "back", e: "🎒", n: "Mochila", c: 150, lvl: 4 },
  { id: "capa", cat: "ropa", slot: "back", e: "🦸", n: "Capa de héroe", c: 250, lvl: 1, req: { k: "hugs", v: 100, t: "100 mimos" } },
  { id: "alasmar", cat: "ropa", slot: "back", e: "🦋", n: "Alas de mariposa", c: 300, lvl: 8 },
  { id: "alasang", cat: "ropa", slot: "back", e: "🪽", n: "Alas de ángel", c: 400, lvl: 10 },
  // Colores y estampados
  { id: "amarillo", cat: "color", n: "Amarillo", c: 0, lvl: 1, body: "#ffd93b", belly: "#ffec9e", dark: "#f2b705" },
  { id: "rosa", cat: "color", n: "Rosa", c: 60, lvl: 1, body: "#ffb3cf", belly: "#ffe0ec", dark: "#f28bb0" },
  { id: "azul", cat: "color", n: "Azul", c: 60, lvl: 1, body: "#9fd3ff", belly: "#dff1ff", dark: "#6fb4ec" },
  { id: "menta", cat: "color", n: "Menta", c: 60, lvl: 1, body: "#9ff0cf", belly: "#e0fbef", dark: "#5fcfa2" },
  { id: "naranja", cat: "color", n: "Naranja", c: 60, lvl: 2, body: "#ffb361", belly: "#ffe0bd", dark: "#f08c2a" },
  { id: "lila", cat: "color", n: "Lila", c: 80, lvl: 2, body: "#cdb4ff", belly: "#ece3ff", dark: "#a88af0" },
  { id: "blanco", cat: "color", n: "Blanco", c: 100, lvl: 3, body: "#ffffff", belly: "#f3efe8", dark: "#ddd5c8" },
  { id: "choco", cat: "color", n: "Chocolate", c: 100, lvl: 3, body: "#b98158", belly: "#ecd0b4", dark: "#8a5a38" },
  { id: "vaca", cat: "color", n: "Vaquita", c: 200, lvl: 4, body: "#ffffff", belly: "#f6efe6", dark: "#3a3230", pat: "spots" },
  { id: "fresa", cat: "color", n: "Fresa", c: 250, lvl: 5, body: "#ff5a6e", belly: "#ffd1d8", dark: "#d63a50", pat: "seeds" },
  { id: "galaxia", cat: "color", n: "Galaxia", c: 500, lvl: 9, body: "#3b2a7a", belly: "#6a4fc0", dark: "#241a52", pat: "stars" },
  { id: "arcoiris", cat: "color", n: "Arcoíris", c: 600, lvl: 11, body: "#ffd93b", belly: "#fff3c4", dark: "#f28bb0", pat: "rainbow" },
  { id: "dorado", cat: "color", n: "Dorado", c: 400, lvl: 1, body: "#ffc629", belly: "#ffe8a3", dark: "#e8a200", req: { k: "stage", v: 6, t: "Llegar a legendario (o comprarlo)" }, buyAnyway: true },
  // Comida (se gasta)
  { id: "manzana", cat: "comida", e: "🍎", n: "Manzana", c: 8, lvl: 1, eff: { food: 20 } },
  { id: "galleta", cat: "comida", e: "🍪", n: "Galleta", c: 12, lvl: 1, eff: { food: 15, fun: 5 } },
  { id: "fresas", cat: "comida", e: "🍓", n: "Fresas", c: 15, lvl: 1, eff: { food: 25, love: 5 } },
  { id: "helado", cat: "comida", e: "🍦", n: "Helado", c: 20, lvl: 2, eff: { food: 20, fun: 15 } },
  { id: "cafe", cat: "comida", e: "☕", n: "Café", c: 20, lvl: 2, eff: { energy: 35 } },
  { id: "tarta", cat: "comida", e: "🍰", n: "Tarta", c: 25, lvl: 3, eff: { food: 35, love: 10 } },
  { id: "sushi", cat: "comida", e: "🍣", n: "Sushi", c: 30, lvl: 4, eff: { food: 45 } },
  { id: "hambur", cat: "comida", e: "🍔", n: "Hamburguesa", c: 35, lvl: 5, eff: { food: 55, clean: -10 } },
  { id: "medicina", cat: "comida", e: "💊", n: "Medicina", c: 40, lvl: 1, eff: { cure: 1 } },
  { id: "jabon", cat: "comida", e: "🧴", n: "Champú de lujo", c: 25, lvl: 2, eff: { clean: 100, love: 5 } },
  // Juguetes (para siempre)
  { id: "pelota", cat: "juguete", e: "⚽", n: "Pelota", c: 0, lvl: 1, fun: 25 },
  { id: "yoyo", cat: "juguete", e: "🪀", n: "Yoyó", c: 60, lvl: 2, fun: 30 },
  { id: "peluche", cat: "juguete", e: "🧸", n: "Peluche", c: 90, lvl: 3, fun: 25, love: 15 },
  { id: "cometa", cat: "juguete", e: "🪁", n: "Cometa", c: 120, lvl: 4, fun: 40 },
  { id: "guitarra", cat: "juguete", e: "🎸", n: "Guitarra", c: 200, lvl: 5, fun: 40, love: 5 },
  { id: "consola", cat: "juguete", e: "🎮", n: "Videoconsola", c: 300, lvl: 7, fun: 55 },
  // Casa: paredes, suelos y muebles
  { id: "w_crema", cat: "casa", kind: "wall", n: "Pared crema", c: 0, lvl: 1, sw: "#f6ead8" },
  { id: "w_rosa", cat: "casa", kind: "wall", n: "Pared rosa", c: 40, lvl: 1, sw: "#ffd6e2" },
  { id: "w_azul", cat: "casa", kind: "wall", n: "Pared azul", c: 40, lvl: 1, sw: "#cfe6ff" },
  { id: "w_menta", cat: "casa", kind: "wall", n: "Pared menta", c: 40, lvl: 2, sw: "#d4f5e6" },
  { id: "w_madera", cat: "casa", kind: "wall", n: "Pared de madera", c: 70, lvl: 3, sw: "#c9955f" },
  { id: "w_estrellas", cat: "casa", kind: "wall", n: "Papel de estrellas", c: 120, lvl: 5, sw: "#2c2a5a" },
  { id: "w_corazones", cat: "casa", kind: "wall", n: "Papel de corazones", c: 150, lvl: 6, sw: "#ffc1d4" },
  { id: "f_madera", cat: "casa", kind: "floor", n: "Suelo de madera", c: 0, lvl: 1, sw: "#b07a4a" },
  { id: "f_baldosa", cat: "casa", kind: "floor", n: "Baldosas", c: 50, lvl: 2, sw: "#e8e2dc" },
  { id: "f_moqueta", cat: "casa", kind: "floor", n: "Moqueta", c: 60, lvl: 2, sw: "#8e7cc3" },
  { id: "f_cesped", cat: "casa", kind: "floor", n: "Césped", c: 90, lvl: 4, sw: "#7cc95b" },
  { id: "alfombra", cat: "casa", kind: "furn", e: "🟣", n: "Alfombra", c: 50, lvl: 1 },
  { id: "planta", cat: "casa", kind: "furn", e: "🪴", n: "Planta", c: 40, lvl: 1 },
  { id: "cuadro", cat: "casa", kind: "furn", e: "🖼️", n: "Cuadro con vuestra foto", c: 60, lvl: 1 },
  { id: "cama", cat: "casa", kind: "furn", e: "🛏️", n: "Cama", c: 80, lvl: 1 },
  { id: "ventana", cat: "casa", kind: "furn", e: "🪟", n: "Ventana", c: 70, lvl: 2 },
  { id: "reloj", cat: "casa", kind: "furn", e: "🕰️", n: "Reloj", c: 90, lvl: 3 },
  { id: "velas", cat: "casa", kind: "furn", e: "🕯️", n: "Velas", c: 50, lvl: 2 },
  { id: "globos", cat: "casa", kind: "furn", e: "🎈", n: "Globos", c: 60, lvl: 2 },
  { id: "estanteria", cat: "casa", kind: "furn", e: "📚", n: "Estantería", c: 120, lvl: 3 },
  { id: "sofa", cat: "casa", kind: "furn", e: "🛋️", n: "Sofá", c: 150, lvl: 4 },
  { id: "pecera", cat: "casa", kind: "furn", e: "🐠", n: "Pecera", c: 180, lvl: 5 },
  { id: "tele", cat: "casa", kind: "furn", e: "📺", n: "Tele", c: 200, lvl: 6 },
  { id: "arbolnav", cat: "casa", kind: "furn", e: "🎄", n: "Árbol de Navidad", c: 100, lvl: 3 },
  { id: "piano", cat: "casa", kind: "furn", e: "🎹", n: "Piano", c: 300, lvl: 8 },
  // Lugares (fondo del exterior)
  { id: "jardin", cat: "lugar", e: "🌳", n: "Jardín", c: 0, lvl: 1 },
  { id: "playa", cat: "lugar", e: "🏖️", n: "Playa", c: 80, lvl: 2 },
  { id: "bosque", cat: "lugar", e: "🌲", n: "Bosque", c: 120, lvl: 3 },
  { id: "nieve", cat: "lugar", e: "❄️", n: "Nieve", c: 150, lvl: 4 },
  { id: "montana", cat: "lugar", e: "⛰️", n: "Montaña", c: 180, lvl: 5 },
  { id: "ciudad", cat: "lugar", e: "🌃", n: "Ciudad", c: 220, lvl: 6 },
  { id: "mar", cat: "lugar", e: "🐠", n: "Fondo del mar", c: 260, lvl: 7 },
  { id: "espacio", cat: "lugar", e: "🚀", n: "Espacio", c: 350, lvl: 9 },
  { id: "amor", cat: "lugar", e: "💖", n: "Tierra del amor", c: 400, lvl: 10 },
  // Temporada (solo se pueden comprar en esos meses; 0 = enero)
  { id: "calabaza", cat: "ropa", slot: "head", e: "🎃", n: "Calabaza", c: 90, lvl: 1, season: [9], sn: "octubre" },
  { id: "bruja", cat: "ropa", slot: "head", e: "🧙", n: "Sombrero de bruja", c: 120, lvl: 1, season: [9], sn: "octubre" },
  { id: "fantasma", cat: "color", n: "Fantasma", c: 150, lvl: 1, season: [9], sn: "octubre", body: "#f1f1ff", belly: "#ffffff", dark: "#d2d2ea", pat: "ghost" },
  { id: "papanoel", cat: "ropa", slot: "head", e: "🎅", n: "Gorro de Papá Noel", c: 100, lvl: 1, season: [11, 0], sn: "diciembre y enero" },
  { id: "reno", cat: "ropa", slot: "head", e: "🦌", n: "Astas de reno", c: 120, lvl: 1, season: [11], sn: "diciembre" },
  { id: "bufnav", cat: "ropa", slot: "neck", e: "🎄", n: "Bufanda navideña", c: 90, lvl: 1, season: [11, 0], sn: "diciembre y enero" },
  { id: "cupido", cat: "ropa", slot: "head", e: "💘", n: "Corona de corazones", c: 120, lvl: 1, season: [1], sn: "febrero" },
  { id: "coronaflor", cat: "ropa", slot: "head", e: "🌼", n: "Corona de flores", c: 100, lvl: 1, season: [2, 3, 4], sn: "primavera" },
  { id: "flotador", cat: "ropa", slot: "neck", e: "🛟", n: "Flotador", c: 100, lvl: 1, season: [5, 6, 7], sn: "verano" },
  // Solo se consiguen en tesoros
  { id: "gafas3d", cat: "ropa", slot: "face", e: "🕶️", n: "Gafas 3D", c: 0, lvl: 1, treasure: true },
  { id: "chistera", cat: "ropa", slot: "head", e: "🎩", n: "Chistera mágica", c: 0, lvl: 1, treasure: true },
  { id: "estrella", cat: "ropa", slot: "head", e: "🌟", n: "Estrella de oro", c: 0, lvl: 1, treasure: true },
  { id: "noche", cat: "color", n: "Noche", c: 80, lvl: 1, body: "#2b2d42", belly: "#ffffff", dark: "#1b1d2e" },
  // Más muebles (para cualquier habitación)
  { id: "lampara", cat: "casa", kind: "furn", e: "💡", n: "Lámpara (luz de noche)", c: 60, lvl: 1 },
  { id: "frutero", cat: "casa", kind: "furn", e: "🧺", n: "Cesta de fruta", c: 40, lvl: 1 },
  { id: "girasol", cat: "casa", kind: "furn", e: "🌻", n: "Girasoles", c: 40, lvl: 1 },
  { id: "tetera", cat: "casa", kind: "furn", e: "🫖", n: "Tetera", c: 50, lvl: 2 },
  { id: "espejo", cat: "casa", kind: "furn", e: "🪞", n: "Espejo", c: 70, lvl: 2 },
  { id: "fogon", cat: "casa", kind: "furn", e: "🍳", n: "Cocinita", c: 110, lvl: 2 },
  { id: "sombrilla", cat: "casa", kind: "furn", e: "⛱️", n: "Sombrilla", c: 90, lvl: 3 },
  { id: "piscina", cat: "casa", kind: "furn", e: "🏊", n: "Piscina", c: 250, lvl: 5 },
  { id: "fuente", cat: "casa", kind: "furn", e: "⛲", n: "Fuente", c: 200, lvl: 6 },
  // ===== v30: muchos más accesorios (nw = nuevo) · r = rareza 1..4 · chest = solo en cofres · lv = premio de nivel · weekly = exclusivo semanal =====
  { id: "gorra", cat: "ropa", slot: "head", e: "🧢", n: "Gorra", c: 60, lvl: 1, nw: 1 },
  { id: "boina", cat: "ropa", slot: "head", e: "🎨", n: "Boina de artista", c: 70, lvl: 2, nw: 1 },
  { id: "paja", cat: "ropa", slot: "head", e: "👒", n: "Sombrero de paja", c: 90, lvl: 3, nw: 1 },
  { id: "orejitas", cat: "ropa", slot: "head", e: "🐱", n: "Diadema de gatito", c: 110, lvl: 4, nw: 1 },
  { id: "mago", cat: "ropa", slot: "head", e: "🧙", n: "Sombrero de mago", c: 240, lvl: 9, nw: 1 },
  { id: "tiara", cat: "ropa", slot: "head", e: "👸", n: "Tiara de princesa", c: 380, lvl: 1, weekly: 1, r: 4, nw: 1 },
  { id: "vikingo", cat: "ropa", slot: "head", e: "🪖", n: "Casco vikingo", c: 0, chest: 1, r: 3, nw: 1 },
  { id: "astronauta", cat: "ropa", slot: "head", e: "👨‍🚀", n: "Casco de astronauta", c: 0, lv: 20, r: 4, nw: 1 },
  { id: "payaso", cat: "ropa", slot: "face", e: "🤡", n: "Nariz de payaso", c: 40, lvl: 1, nw: 1 },
  { id: "gafasnerd", cat: "ropa", slot: "face", e: "🤓", n: "Gafas redondas", c: 80, lvl: 2, nw: 1 },
  { id: "antifaz", cat: "ropa", slot: "face", e: "🦹", n: "Antifaz", c: 120, lvl: 5, nw: 1 },
  { id: "buceo", cat: "ropa", slot: "face", e: "🤿", n: "Gafas de buceo", c: 150, lvl: 6, nw: 1 },
  { id: "gafasestrella", cat: "ropa", slot: "face", e: "🤩", n: "Gafas de estrella", c: 0, lv: 5, r: 3, nw: 1 },
  { id: "cascabel", cat: "ropa", slot: "neck", e: "🔔", n: "Cascabel", c: 60, lvl: 1, nw: 1 },
  { id: "panuelo", cat: "ropa", slot: "neck", e: "🤠", n: "Pañuelo vaquero", c: 70, lvl: 3, nw: 1 },
  { id: "lei", cat: "ropa", slot: "neck", e: "🌺", n: "Collar de flores", c: 90, lvl: 2, nw: 1 },
  { id: "bufarcoiris", cat: "ropa", slot: "neck", e: "🌈", n: "Bufanda arcoíris", c: 320, lvl: 1, weekly: 1, r: 3, nw: 1 },
  { id: "camiseta", cat: "ropa", slot: "body", e: "👕", n: "Camiseta corazón", c: 50, lvl: 1, nw: 1 },
  { id: "pijama", cat: "ropa", slot: "body", e: "🌙", n: "Pijama de estrellas", c: 80, lvl: 2, nw: 1 },
  { id: "sudadera", cat: "ropa", slot: "body", e: "🧥", n: "Sudadera", c: 90, lvl: 2, nw: 1 },
  { id: "delantal", cat: "ropa", slot: "body", e: "🧑‍🍳", n: "Delantal de chef", c: 110, lvl: 4, nw: 1 },
  { id: "vestido", cat: "ropa", slot: "body", e: "👗", n: "Vestido de fiesta", c: 160, lvl: 4, nw: 1 },
  { id: "chaleco", cat: "ropa", slot: "body", e: "🏴‍☠️", n: "Chaleco pirata", c: 170, lvl: 6, nw: 1 },
  { id: "esmoquin", cat: "ropa", slot: "body", e: "🤵", n: "Esmoquin", c: 260, lvl: 8, nw: 1 },
  { id: "tunica", cat: "ropa", slot: "body", e: "🔮", n: "Túnica de mago", c: 280, lvl: 10, nw: 1 },
  { id: "jersey", cat: "ropa", slot: "body", e: "🎄", n: "Jersey navideño", c: 130, lvl: 1, season: [11, 0], sn: "diciembre y enero", nw: 1 },
  { id: "heroe", cat: "ropa", slot: "body", e: "🦸", n: "Traje de superhéroe", c: 0, lv: 35, r: 4, nw: 1 },
  { id: "chanclas", cat: "ropa", slot: "feet", e: "🩴", n: "Chanclas", c: 40, lvl: 1, nw: 1 },
  { id: "zapatillas", cat: "ropa", slot: "feet", e: "👟", n: "Zapatillas", c: 70, lvl: 1, nw: 1 },
  { id: "botasagua", cat: "ropa", slot: "feet", e: "🥾", n: "Botas de agua", c: 80, lvl: 2, nw: 1 },
  { id: "botasvaq", cat: "ropa", slot: "feet", e: "🤠", n: "Botas de vaquero", c: 150, lvl: 5, nw: 1 },
  { id: "fiesta", cat: "ropa", slot: "feet", e: "👠", n: "Zapatos de fiesta", c: 300, lvl: 1, weekly: 1, r: 3, nw: 1 },
  { id: "patines", cat: "ropa", slot: "feet", e: "🛼", n: "Patines", c: 0, chest: 1, r: 3, nw: 1 },
  { id: "globo", cat: "ropa", slot: "hand", e: "🎈", n: "Globo", c: 40, lvl: 1, nw: 1 },
  { id: "piruleta", cat: "ropa", slot: "hand", e: "🍭", n: "Piruleta", c: 50, lvl: 1, nw: 1 },
  { id: "taza", cat: "ropa", slot: "hand", e: "☕", n: "Taza de chocolate", c: 60, lvl: 2, nw: 1 },
  { id: "cuchara", cat: "ropa", slot: "hand", e: "🥄", n: "Cuchara de palo", c: 60, lvl: 4, nw: 1 },
  { id: "espada", cat: "ropa", slot: "hand", e: "🗡️", n: "Espada pirata", c: 160, lvl: 6, nw: 1 },
  { id: "varita", cat: "ropa", slot: "hand", e: "🪄", n: "Varita mágica", c: 260, lvl: 10, nw: 1 },
  { id: "rosa", cat: "ropa", slot: "hand", e: "🌹", n: "Rosa roja", c: 280, lvl: 1, weekly: 1, r: 3, nw: 1 },
  { id: "micro", cat: "ropa", slot: "hand", e: "🎤", n: "Micrófono", c: 0, chest: 1, r: 3, nw: 1 },
  { id: "murcielago", cat: "ropa", slot: "back", e: "🦇", n: "Alas de murciélago", c: 0, chest: 1, r: 3, nw: 1 },
  { id: "jetpack", cat: "ropa", slot: "back", e: "🚀", n: "Mochila cohete", c: 0, chest: 1, r: 4, nw: 1 },
  { id: "hada", cat: "ropa", slot: "back", e: "🧚", n: "Alas de hada", c: 0, lv: 15, r: 4, nw: 1 },
  { id: "dragon", cat: "ropa", slot: "back", e: "🐉", n: "Alas de dragón", c: 0, lv: 30, r: 4, nw: 1 },
  // Efectos mágicos
  { id: "fx_brillos", cat: "fx", slot: "fx", e: "✨", n: "Brillitos", c: 200, lvl: 5, nw: 1 },
  { id: "fx_copos", cat: "fx", slot: "fx", e: "❄️", n: "Copos mágicos", c: 250, lvl: 1, season: [11, 0, 1], sn: "invierno", nw: 1 },
  { id: "fx_corazones", cat: "fx", slot: "fx", e: "💕", n: "Estela de corazones", c: 350, lvl: 1, weekly: 1, r: 4, nw: 1 },
  { id: "fx_burbujas", cat: "fx", slot: "fx", e: "🫧", n: "Burbujas", c: 0, chest: 1, r: 3, nw: 1 },
  { id: "fx_notas", cat: "fx", slot: "fx", e: "🎶", n: "Notas musicales", c: 0, chest: 1, r: 3, nw: 1 },
  { id: "fx_aura", cat: "fx", slot: "fx", e: "🌟", n: "Aura dorada", c: 0, lv: 10, r: 4, nw: 1 },
  { id: "fx_arcoiris", cat: "fx", slot: "fx", e: "🌈", n: "Arcoíris", c: 0, lv: 25, r: 4, nw: 1 },
  // Colores nuevos
  { id: "sirena", cat: "color", n: "Sirena", c: 0, chest: 1, r: 3, body: "#5ce1e6", belly: "#d6fbff", dark: "#2fb7c4", nw: 1 },
  { id: "diamante", cat: "color", n: "Diamante", c: 0, lv: 40, r: 4, body: "#e6f8ff", belly: "#ffffff", dark: "#8fd3ff", pat: "ice", nw: 1 },
];
const CAT = Object.fromEntries(CATALOG.map(x => [x.id, x]));
const ITEMS = CATALOG.filter(x => x.cat === "ropa");
const COLORS = CATALOG.filter(x => x.cat === "color");
const SHOP_TABS = [["ropa", "👒 Ropa"], ["color", "🎨 Colores"], ["comida", "🍰 Comida"], ["juguete", "🧸 Juguetes"], ["casa", "🏠 Casa"], ["lugar", "🏞️ Lugares"]];
const FURN_POS = {   // posición de cada mueble en la casita (%)
  alfombra: "", planta: "left:3%;bottom:34%;font-size:42px", cuadro: "left:27%;top:12%", cama: "left:2%;bottom:5%;font-size:64px",
  ventana: "right:24%;top:8%;font-size:50px", reloj: "left:50%;top:5%;font-size:30px", velas: "left:30%;bottom:44%;font-size:26px",
  globos: "left:4%;top:34%;font-size:38px", estanteria: "left:24%;bottom:36%;font-size:44px", sofa: "right:2%;bottom:5%;font-size:60px",
  pecera: "right:25%;bottom:38%;font-size:38px", tele: "right:4%;bottom:34%;font-size:46px", arbolnav: "left:26%;bottom:30%;font-size:52px", piano: "right:26%;bottom:6%;font-size:46px"
};

const START_COINS = 100;   // regalo de aniversario 🎁
const stageOf = xp => { let i = 0; STAGES.forEach((s, k) => { if (xp >= s.xp) i = k; }); return i; };
const lvlNeed = l => 60 + l * 40;
function levelOf(exp) { let l = 1, e = exp || 0; while (l < 40 && e >= lvlNeed(l)) { e -= lvlNeed(l); l++; } return l >= 40 ? { l, into: lvlNeed(l), need: lvlNeed(l), max: true } : { l, into: e, need: lvlNeed(l) }; }
const clamp = v => Math.max(0, Math.min(100, v));
function newPet() { return { name: CONFIG.petName || "Pollito", xp: 0, exp: 0, streak: 0, best: 0, lastBoth: null, care: {}, hugs: 0, born: Date.now(), lastBath: null, day: {}, coins: START_COINS, owned: {}, inv: {}, wear: {}, color: "amarillo", scene: "jardin", room: {}, rooms: {}, species: "pollito", album: { 0: Date.now() } }; }
function ensureDay(p) {
  const t = dayKey(); if (!p.day || p.day.d !== t) p.day = { d: t, hugs: {}, play: {} };
  if (p.coins === undefined) p.coins = START_COINS;
  p.owned = p.owned || {}; p.wear = p.wear || {}; p.inv = p.inv || {}; p.room = p.room || {}; p.album = p.album || {}; p.bday = p.bday || {};
  if (!p.rooms) p.rooms = p.room && Object.keys(p.room).length ? { salon: p.room } : {};
  p.species = p.species || "pollito"; p.stickers = p.stickers || {}; p.postcards = p.postcards || {}; p.tre = p.tre || {}; p.family = p.family || []; p.rec = p.rec || {}; p.outfits = p.outfits || []; p.lvc = p.lvc || {};
  if (p.exp === undefined) p.exp = (p.xp || 0) * 30 + (p.hugs || 0) * 2;   // pollos anteriores: experiencia según lo ya cuidado
  if (!p.n) { const now = Date.now(); p.n = {}; for (const [k] of NEEDS) p.n[k] = { v: 75, t: now }; }
  if (stageOf(p.xp) > 0) {
    if (!p.trait) p.trait = rnd(Object.keys(TRAITS));
    if (!p.hatchedAt) p.hatchedAt = Date.now();
    for (let s = 0; s <= stageOf(p.xp); s++) if (!p.album[s]) p.album[s] = 1;   // 1 = alcanzado antes de tener álbum
  }
  return p;
}
const coinsOf = p => (p && p.coins !== undefined ? p.coins : START_COINS);

// ---------- Necesidades que bajan con el tiempo ----------
function needNow(p, k, now = Date.now()) {
  const n = (p.n || {})[k]; if (!n) return 75;
  const h = Math.max(0, (now - n.t) / 36e5), mul = ((((TRAITS[p.trait] || {}).mul || {})[k]) || 1) * needMul(p, k);
  if (k === "energy") {
    const a = Math.max(n.t, p.napStart || 0), b = Math.min(now, p.nap || 0), sl = Math.max(0, (b - a) / 36e5);
    return clamp(n.v - (h - sl) * RATE.energy * mul + sl * 16);
  }
  return clamp(n.v - h * RATE[k] * mul);
}
function setNeed(p, k, delta) { if (delta > 0) { if (k === "food" && setOn(p, "chef")) delta *= 1.5; if (k === "love" && setOn(p, "heroe")) delta *= 2; } p.n = p.n || {}; p.n[k] = { v: Math.round(clamp(needNow(p, k) + delta)), t: Date.now() }; }
function gainExp(p, n) { const b = levelOf(p.exp).l; p.exp = (p.exp || 0) + Math.round(n * expMul(p)); const a = levelOf(p.exp).l; if (a > b) { p.coins += 20 * (a - b); return a; } return 0; }
const isNapping = p => (p.nap || 0) > Date.now();

// ---------- Estado ----------
function petInfo() {
  const p = state.pet ? ensureDay(JSON.parse(JSON.stringify(state.pet))) : ensureDay(newPet()), today = dayKey();
  const meT = p.care?.[who] === today, otT = p.care?.[other()] === today;
  const last = [p.care?.a, p.care?.b].filter(Boolean).sort().pop();
  const gap = last ? daysBetween(last, today) : 0;
  const nv = Object.fromEntries(NEEDS.map(([k]) => [k, Math.round(needNow(p, k))]));
  const low = NEEDS.filter(([k]) => nv[k] < 15).length;
  const si = stageOf(p.xp), L = levelOf(p.exp);
  const bd = bdayInfo(p);
  return { p, today, meT, otT, last, gap, nv, low, si, L, bd, sad: (!!last && gap >= 2) || nv.love < 20, sick: !!p.sick };
}
function bdayInfo(p) {
  if (!p.hatchedAt || p.hatchedAt < 1e12) return null;
  const h = new Date(p.hatchedAt), n = new Date();
  const months = (n.getFullYear() - h.getFullYear()) * 12 + (n.getMonth() - h.getMonth());
  if (months < 1 || n.getDate() !== h.getDate()) return null;
  return { months, years: months % 12 === 0 ? months / 12 : 0, key: localKey(n) };
}
function currentExpr(I) {
  if (Date.now() < tempUntil) return tempExpr;
  if (isNapping(I.p)) return "sleep";
  const h = hourIn(myTz);
  if (h >= 23 || h < 7) return "sleep";
  if (I.sick) return "sick";
  if (I.sad) return "sad";
  if (I.nv.energy < 20) return "tired";
  if (I.nv.food < 30) return "hungry";
  if (I.nv.fun < 25) return "bored";
  if (I.bd) return "happy";
  if (NEEDS.every(([k]) => I.nv[k] >= 60)) return "happy";
  return "normal";
}
function moodText(I) {
  const o = name(other()), p = I.p;
  if (I.si === 0) return I.meT && I.otT ? "Hoy le habéis dado calor los dos 🥚✨" : I.meT ? `Se mueve… falta que ${o} le dé calor 🔥` : I.otT ? `${o} ya le ha dado calor. ¡Te toca!` : "Dadle calor los dos el mismo día para que se abra 🥚";
  if (isNapping(p)) return `Durmiendo la siesta hasta las ${new Date(p.nap).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} 💤`;
  if (I.bd) return I.bd.years ? `¡Hoy cumple ${I.bd.years} año${I.bd.years > 1 ? "s" : ""}! 🎂🎉` : `¡Hoy cumple ${I.bd.months} mes${I.bd.months > 1 ? "es" : ""}! 🎂`;
  if (I.sick) return "Está malito 🤒 Necesita medicina 💊 (en la tienda, sección Comida)";
  if (I.sad && I.gap >= 2) return `Está triste, hace ${I.gap} días que no le cuidáis 😢`;
  if (I.nv.love < 20) return "Se siente solo… ¡necesita mimos! 🥺";
  if (I.nv.energy < 20) return "Está agotado. Déjale dormir una siesta 😴";
  if (I.nv.food < 30) return "Tiene mucha hambre 🍽️";
  if (I.nv.clean < 30) return "Está sucio y huele un poco… 🛁";
  if (I.nv.fun < 25) return "Se aburre… ¿jugáis con él? 🎈";
  if (I.meT && I.otT) return "¡Súper feliz! Hoy le habéis cuidado los dos 💞";
  if (I.meT) return `Contento. Esperando a que ${o} le dé de comer…`;
  if (I.otT) return `${o} ya le ha dado de comer. ¡Te toca! 🍓`;
  return "Tiene hambre 🥺 ¡Dale de comer!";
}

// ---------- Dibujo (SVG) ----------
function itemSVG(id) {
  switch (id) {
    case "lazo": return `<g transform="translate(130 76) rotate(18)"><path d="M0 0 L-15 -10 L-15 10 Z M0 0 L15 -10 L15 10 Z" fill="#ff5c8a"/><circle r="4.5" fill="#e8336b"/></g>`;
    case "flor": return `<g transform="translate(72 76)">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(8 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(8 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="6.5" fill="#ffb3d1"/>`).join("")}<circle r="5" fill="#ffd93b"/></g>`;
    case "gorrolana": return `<g transform="translate(100 78)"><path d="M-38 2 Q-40 -42 0 -44 Q40 -42 38 2 Z" fill="#4d7cff"/><path d="M-20 -38 L-20 -2 M-6 -43 L-6 -2 M8 -43 L8 -2 M22 -37 L22 -2" stroke="#3a63d6" stroke-width="3"/><rect x="-41" y="-6" width="82" height="14" rx="7" fill="#3a63d6"/><circle cy="-46" r="9" fill="#fff"/></g>`;
    case "gorro": case "_party": return `<g transform="translate(106 72) rotate(12)"><path d="M-17 0 L0 -44 L17 0 Z" fill="#7b61ff"/><path d="M-12 -12 L12 -12 M-7 -27 L7 -27" stroke="#ffd93b" stroke-width="3.5"/><circle cy="-46" r="6" fill="#ff5c8a"/></g>`;
    case "chef": return `<g transform="translate(100 70)"><rect x="-24" y="-10" width="48" height="14" rx="3" fill="#f4f1ec" stroke="#ddd6cc" stroke-width="2"/><circle cx="-16" cy="-22" r="14" fill="#fff"/><circle cx="0" cy="-30" r="16" fill="#fff"/><circle cx="16" cy="-22" r="14" fill="#fff"/></g>`;
    case "conejo": return `<g><ellipse cx="82" cy="46" rx="9" ry="28" fill="#fff" stroke="#eee" transform="rotate(-12 82 46)"/><ellipse cx="82" cy="48" rx="4.5" ry="20" fill="#ffb3cf" transform="rotate(-12 82 48)"/><ellipse cx="118" cy="46" rx="9" ry="28" fill="#fff" stroke="#eee" transform="rotate(12 118 46)"/><ellipse cx="118" cy="48" rx="4.5" ry="20" fill="#ffb3cf" transform="rotate(12 118 48)"/><path d="M78 72 Q100 60 122 72" stroke="#ff8fb8" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
    case "vaquero": return `<g transform="translate(100 70)"><path d="M-24 2 Q-27 -32 -9 -28 Q0 -21 9 -28 Q27 -32 24 2 Z" fill="#b87945"/><rect x="-24" y="-8" width="48" height="7" fill="#6b3f1f"/><path d="M-50 2 Q-48 -8 -30 0 Q0 10 30 0 Q48 -8 50 2 Q46 12 0 12 Q-46 12 -50 2 Z" fill="#a0673a"/></g>`;
    case "cascos": return `<g><path d="M54 110 Q54 52 100 50 Q146 52 146 110" stroke="#2b2d42" stroke-width="7" fill="none"/><rect x="42" y="98" width="18" height="30" rx="8" fill="#ef476f"/><rect x="140" y="98" width="18" height="30" rx="8" fill="#ef476f"/></g>`;
    case "pirata": return `<g transform="translate(100 70)"><path d="M-44 4 Q-30 -30 0 -32 Q30 -30 44 4 Q0 -6 -44 4 Z" fill="#1d1d24"/><circle cx="0" cy="-14" r="6" fill="#fff"/><path d="M-5 -6 L5 -6" stroke="#fff" stroke-width="3"/></g>`;
    case "cuernos": return `<g><path d="M76 72 Q66 50 78 40 Q80 56 88 66 Z" fill="#e63946"/><path d="M124 72 Q134 50 122 40 Q120 56 112 66 Z" fill="#e63946"/></g>`;
    case "aureola": return `<ellipse cx="100" cy="46" rx="28" ry="7" fill="none" stroke="#ffd23f" stroke-width="5"/>`;
    case "corona": return `<g transform="translate(100 64)"><path d="M-21 0 L-21 -19 L-10 -8 L0 -26 L10 -8 L21 -19 L21 0 Z" fill="#ffc300" stroke="#e0a100" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="-11" r="3.5" fill="#ff4d5a"/><circle cx="-13" cy="-6" r="2.5" fill="#4dd2ff"/><circle cx="13" cy="-6" r="2.5" fill="#4dd2ff"/></g>`;
    case "bigote": return `<path d="M100 129 Q92 122 80 127 Q76 131 82 134 Q92 136 100 131 Q108 136 118 134 Q124 131 120 127 Q108 122 100 129 Z" fill="#5a3a22"/>`;
    case "gafas": return `<g><rect x="66" y="99" width="28" height="17" rx="7" fill="#15131a"/><rect x="106" y="99" width="28" height="17" rx="7" fill="#15131a"/><path d="M94 105 L106 105" stroke="#15131a" stroke-width="3.5"/><path d="M71 103 L80 103 M111 103 L120 103" stroke="#fff" stroke-width="2.5" opacity=".55" stroke-linecap="round"/></g>`;
    case "gafascor": { const H = "M0 7 C-15 -3 -15 -15 -6 -15 C-2 -15 0 -11 0 -9 C0 -11 2 -15 6 -15 C15 -15 15 -3 0 7Z"; return `<g><path d="${H}" transform="translate(80 112) scale(1.15)" fill="#ff3d7f" opacity=".92"/><path d="${H}" transform="translate(120 112) scale(1.15)" fill="#ff3d7f" opacity=".92"/><path d="M92 104 Q100 99 108 104" stroke="#d6205f" stroke-width="3" fill="none"/></g>`; }
    case "monoculo": return `<g><circle cx="120" cy="107" r="13" fill="rgba(200,230,255,.35)" stroke="#c9a227" stroke-width="3"/><path d="M132 113 Q140 130 136 150" stroke="#c9a227" stroke-width="1.5" fill="none"/></g>`;
    case "pajarita": return `<g transform="translate(100 152)"><path d="M0 0 L-17 -10 L-17 10 Z M0 0 L17 -10 L17 10 Z" fill="#2b3bd9"/><circle r="4.5" fill="#1b27a0"/></g>`;
    case "bufanda": return `<path d="M58 140 Q100 160 142 140 L143 152 Q100 172 57 152 Z" fill="#e63946"/><path d="M66 146 L70 156 M82 150 L85 160 M100 152 L100 162 M118 150 L115 160 M134 146 L130 156" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M118 150 L128 150 L132 178 L120 178 Z" fill="#e63946"/>`;
    case "corbata": return `<g><path d="M92 146 L108 146 L104 154 L96 154 Z" fill="#1d3557"/><path d="M96 154 L104 154 L110 178 L100 186 L90 178 Z" fill="#457b9d"/></g>`;
    case "collar": { let s = ""; for (let k = 0; k <= 11; k++) { const t = k / 11, x = 62 + 76 * t, y = 144 + 16 * Math.sin(Math.PI * t); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2" fill="#fbf7f0" stroke="#e4dccd" stroke-width="1"/>`; } return s + `<circle cx="100" cy="166" r="6" fill="#ff8fb8" stroke="#e46a98" stroke-width="1.5"/>`; }
    case "medalla": return `<g><path d="M86 140 L100 160 L114 140" stroke="#e63946" stroke-width="6" fill="none"/><circle cx="100" cy="166" r="10" fill="#ffc300" stroke="#e0a100" stroke-width="2"/><text x="100" y="170" font-size="10" text-anchor="middle" fill="#8a5a00" font-weight="700">1</text></g>`;
    // espalda (se dibuja detrás del cuerpo)
    case "mochila": return `<g><rect x="136" y="104" width="30" height="44" rx="10" fill="#8a5a38"/><rect x="140" y="116" width="22" height="14" rx="4" fill="#a86f45"/></g>`;
    case "capa": return `<path d="M62 112 Q100 100 138 112 L160 184 Q100 196 40 184 Z" fill="#d62839"/>`;
    case "alasmar": return `<g opacity=".95"><path d="M60 110 Q10 70 22 130 Q30 160 62 140 Z" fill="#9b5de5"/><path d="M140 110 Q190 70 178 130 Q170 160 138 140 Z" fill="#9b5de5"/><circle cx="34" cy="112" r="6" fill="#ffd93b"/><circle cx="166" cy="112" r="6" fill="#ffd93b"/></g>`;
    case "calabaza": return `<g transform="translate(100 64)"><ellipse cx="-12" cy="-8" rx="14" ry="14" fill="#f77f00"/><ellipse cx="12" cy="-8" rx="14" ry="14" fill="#f77f00"/><ellipse cx="0" cy="-8" rx="15" ry="15" fill="#fb8b24"/><path d="M-6 -12 L-2 -16 L2 -12 Z M2 -12 L6 -16 L10 -12 Z" fill="#3a1f00"/><path d="M-8 -4 Q0 2 8 -4" stroke="#3a1f00" stroke-width="2.5" fill="none"/><rect x="-2" y="-28" width="4" height="7" rx="2" fill="#2d6a4f"/></g>`;
    case "bruja": return `<g transform="translate(102 72) rotate(-8)"><ellipse cx="0" cy="0" rx="44" ry="9" fill="#3c1361"/><path d="M-22 -2 Q-10 -30 4 -46 Q14 -60 26 -54 Q12 -40 20 -2 Z" fill="#52237f"/><rect x="-20" y="-10" width="40" height="7" fill="#f77f00"/></g>`;
    case "papanoel": return `<g transform="translate(100 72)"><path d="M-38 0 Q-30 -40 10 -44 Q36 -40 46 -12 L34 -6 Q26 -26 8 -28 Q-18 -26 -26 0 Z" fill="#d62828"/><rect x="-42" y="-6" width="84" height="13" rx="6.5" fill="#fff"/><circle cx="44" cy="-10" r="8" fill="#fff"/></g>`;
    case "reno": return `<g stroke="#8a5a38" stroke-width="5" fill="none" stroke-linecap="round"><path d="M80 72 Q70 50 66 32 M72 52 L58 46 M68 40 L76 30"/><path d="M120 72 Q130 50 134 32 M128 52 L142 46 M132 40 L124 30"/></g>`;
    case "bufnav": return `<path d="M58 140 Q100 160 142 140 L143 152 Q100 172 57 152 Z" fill="#2d6a4f"/><path d="M66 146 L70 156 M82 150 L85 160 M100 152 L100 162 M118 150 L115 160 M134 146 L130 156" stroke="#d62828" stroke-width="4"/><path d="M118 150 L128 150 L132 178 L120 178 Z" fill="#d62828"/>`;
    case "cupido": { const H = "M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z"; return `<g>${[[76, 70, -20], [100, 60, 0], [124, 70, 20]].map(([x, y, r]) => `<path d="${H}" transform="translate(${x} ${y}) rotate(${r}) scale(1.3)" fill="#ff3d7f"/>`).join("")}</g>`; }
    case "coronaflor": return `<g>${[[72, 76, "#ffb3d1"], [86, 66, "#ffd93b"], [100, 62, "#9fd3ff"], [114, 66, "#ffb3d1"], [128, 76, "#cdb4ff"]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="7" fill="${c}"/><circle cx="${x}" cy="${y}" r="2.6" fill="#fff6"/>`).join("")}</g>`;
    case "flotador": return `<g><ellipse cx="100" cy="150" rx="58" ry="16" fill="none" stroke="#ff6b6b" stroke-width="12"/><path d="M52 146 L58 156 M142 146 L148 156 M96 164 L104 164" stroke="#fff" stroke-width="12"/></g>`;
    case "gafas3d": return `<g><rect x="66" y="99" width="28" height="17" rx="3" fill="#e63946" opacity=".85"/><rect x="106" y="99" width="28" height="17" rx="3" fill="#4d9dff" opacity=".85"/><path d="M60 102 L66 102 M94 105 L106 105 M134 102 L140 102" stroke="#fff" stroke-width="3"/><rect x="64" y="97" width="72" height="21" rx="4" fill="none" stroke="#fff" stroke-width="2.5"/></g>`;
    case "chistera": return `<g transform="translate(100 70)"><ellipse cx="0" cy="0" rx="34" ry="7" fill="#1d1d24"/><rect x="-20" y="-40" width="40" height="40" rx="3" fill="#1d1d24"/><rect x="-20" y="-12" width="40" height="7" fill="#9b5de5"/><text x="14" y="-30" font-size="12">✨</text></g>`;
    case "estrella": return `<g transform="translate(100 50)"><path d="M0 -18 L5 -6 L18 -6 L8 2 L12 15 L0 7 L-12 15 L-8 2 L-18 -6 L-5 -6 Z" fill="#ffd23f" stroke="#e0a100" stroke-width="2" stroke-linejoin="round"/></g>`;
    // ---- v30 · cabeza ----
    case "gorra": return `<g transform="translate(100 72)"><path d="M-36 0 Q-34 -34 0 -36 Q34 -34 36 0 Z" fill="#4d9dff"/><path d="M-34 -2 Q-52 0 -66 8 Q-48 13 -28 6 Z" fill="#3a7fd6"/><circle cy="-35" r="4" fill="#3a7fd6"/><path d="M-10 -20 h20" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>`;
    case "boina": return `<g transform="translate(104 70) rotate(-12)"><ellipse cx="0" cy="-2" rx="36" ry="12" fill="#c1121f"/><ellipse cx="-2" cy="-9" rx="30" ry="12" fill="#e63946"/><path d="M0 -20 v-7" stroke="#a4161a" stroke-width="3" stroke-linecap="round"/></g>`;
    case "paja": return `<g transform="translate(100 72)"><ellipse rx="54" ry="11" fill="#e9c46a"/><ellipse rx="54" ry="11" fill="none" stroke="#d4a84a" stroke-width="2" stroke-dasharray="4 4"/><path d="M-26 -2 Q-26 -32 0 -32 Q26 -32 26 -2 Z" fill="#f4d58d"/><rect x="-26" y="-11" width="52" height="7" fill="#e63946"/><circle cx="18" cy="-8" r="5" fill="#ffb3d1"/></g>`;
    case "orejitas": return `<g><path d="M60 82 Q100 58 140 82" stroke="#2b2d42" stroke-width="5" fill="none"/><path d="M68 76 L70 48 L90 66Z" fill="#2b2d42"/><path d="M132 76 L130 48 L110 66Z" fill="#2b2d42"/><path d="M73 70 L74 56 L84 65Z" fill="#ff9fb4"/><path d="M127 70 L126 56 L116 65Z" fill="#ff9fb4"/></g>`;
    case "mago": return `<g transform="translate(100 72)"><ellipse rx="44" ry="9" fill="#3c2a8a"/><path d="M-26 -2 Q-8 -40 6 -70 Q10 -40 28 -2 Z" fill="#5a3fc0"/><path d="${starP(-2, -26, 7)}" fill="#ffd23f"/><path d="${starP(12, -12, 4)}" fill="#ffd23f"/><path d="${starP(-14, -10, 3.5)}" fill="#ffd23f"/><rect x="-26" y="-9" width="53" height="6" fill="#ffd23f" opacity=".8"/></g>`;
    case "tiara": return `<g transform="translate(100 70)"><path d="M-28 4 Q0 -6 28 4" stroke="#d4d4e0" stroke-width="4" fill="none"/><path d="M-18 1 L-13 -12 L-6 -2 L0 -22 L6 -2 L13 -12 L18 1Z" fill="#eef0fb" stroke="#b8b8cc" stroke-width="1.5" stroke-linejoin="round"/><circle cy="-9" r="4" fill="#ff5c8a"/><circle cx="-12" cy="-5" r="2.2" fill="#4dd2ff"/><circle cx="12" cy="-5" r="2.2" fill="#4dd2ff"/></g>`;
    case "vikingo": return `<g transform="translate(100 74)"><path d="M-34 -8 Q-54 -16 -50 -44 Q-40 -26 -28 -24 Z" fill="#f4ecd8" stroke="#d8ceb4" stroke-width="1.5"/><path d="M34 -8 Q54 -16 50 -44 Q40 -26 28 -24 Z" fill="#f4ecd8" stroke="#d8ceb4" stroke-width="1.5"/><path d="M-34 0 Q-34 -36 0 -38 Q34 -36 34 0 Z" fill="#9aa5b1"/><path d="M0 -38 V0" stroke="#6c7a89" stroke-width="5"/><rect x="-37" y="-6" width="74" height="9" rx="3" fill="#6c7a89"/>${[-26, -12, 12, 26].map(x => `<circle cx="${x}" cy="-1.5" r="1.8" fill="#c0c8d2"/>`).join("")}</g>`;
    case "astronauta": return `<g><circle cx="100" cy="110" r="64" fill="#bfe9ff" fill-opacity=".22" stroke="#eef8ff" stroke-width="5"/><path d="M58 80 Q70 58 92 52" stroke="#fff" stroke-width="6" fill="none" opacity=".85" stroke-linecap="round"/><rect x="62" y="164" width="76" height="12" rx="6" fill="#d0d5dd"/><circle cx="100" cy="170" r="3" fill="#e63946"/></g>`;
    // ---- v30 · cara ----
    case "payaso": return `<g><circle cx="100" cy="119" r="10" fill="#e63946"/><circle cx="96" cy="115" r="3" fill="#fff" opacity=".6"/></g>`;
    case "gafasnerd": return `<g><g fill="rgba(255,255,255,.22)" stroke="#2b1a10" stroke-width="3.5"><circle cx="80" cy="107" r="13"/><circle cx="120" cy="107" r="13"/></g><path d="M93 105 Q100 100 107 105 M67 104 L60 101 M133 104 L140 101" stroke="#2b1a10" stroke-width="3" fill="none"/></g>`;
    case "antifaz": return `<path fill-rule="evenodd" d="M60 100 Q80 88 100 100 Q120 88 140 100 Q142 118 124 119 Q110 119 100 110 Q90 119 76 119 Q58 118 60 100Z M71 106 a9 6.5 0 1 0 18 0 a9 6.5 0 1 0 -18 0Z M111 106 a9 6.5 0 1 0 18 0 a9 6.5 0 1 0 -18 0Z" fill="#2b2d42"/>`;
    case "buceo": return `<g><rect x="63" y="95" width="74" height="25" rx="11" fill="rgba(160,220,255,.45)" stroke="#ff9f1c" stroke-width="4"/><path d="M100 96 V119" stroke="#ff9f1c" stroke-width="3"/><path d="M140 106 Q152 106 152 90 V62" stroke="#4d9dff" stroke-width="6" fill="none" stroke-linecap="round"/><rect x="147" y="56" width="10" height="8" rx="3" fill="#ff9f1c"/></g>`;
    case "gafasestrella": return `<g><path d="${starP(80, 107, 18)}" fill="#ffd23f" fill-opacity=".72" stroke="#e0a100" stroke-width="2" stroke-linejoin="round"/><path d="${starP(120, 107, 18)}" fill="#ffd23f" fill-opacity=".72" stroke="#e0a100" stroke-width="2" stroke-linejoin="round"/><path d="M95 104 h10" stroke="#e0a100" stroke-width="3"/></g>`;
    // ---- v30 · cuello ----
    case "cascabel": return `<g><path d="M62 144 Q100 162 138 144" stroke="#e63946" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="100" cy="163" r="8.5" fill="#ffd23f" stroke="#e0a100" stroke-width="2"/><path d="M93 163 h14" stroke="#a07800" stroke-width="2"/><circle cx="100" cy="167" r="1.8" fill="#a07800"/></g>`;
    case "panuelo": return `<g><path d="M60 142 Q100 158 140 142 L100 178 Z" fill="#e63946"/><path d="M60 142 Q100 158 140 142" stroke="#c1121f" stroke-width="4" fill="none"/><g fill="#fff" opacity=".85"><circle cx="88" cy="153" r="2"/><circle cx="112" cy="153" r="2"/><circle cx="100" cy="163" r="2"/><circle cx="96" cy="171" r="1.5"/></g></g>`;
    case "lei": { let s = ""; const C = ["#ff8fb8", "#ffd93b", "#ff6b6b", "#cdb4ff"]; for (let k = 0; k <= 11; k++) { const t = k / 11, x = 60 + 80 * t, y = 142 + 18 * Math.sin(Math.PI * t); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="${C[k % 4]}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#fff" opacity=".8"/>`; } return `<g>${s}</g>`; }
    case "bufarcoiris": return `<g><path d="M58 140 Q100 160 142 140 L143 152 Q100 172 57 152 Z" fill="#ffd93b"/><path d="M58 142.5 Q100 162.5 142 142.5" stroke="#ff6b8b" stroke-width="3.5" fill="none"/><path d="M57.5 149 Q100 169 142.5 149" stroke="#7fb7ff" stroke-width="3.5" fill="none"/><path d="M118 150 L128 150 L132 178 L120 178 Z" fill="#6fdc9a"/><path d="M119 158 h10 M120 166 h10" stroke="#b48be0" stroke-width="3"/><path d="M121 178 v5 M125 178 v5 M129 178 v5" stroke="#ff6b8b" stroke-width="2"/></g>`;
    // ---- v30 · cuerpo (se recorta al cuerpo) ----
    case "camiseta": return `<g><path d="M40 130 Q70 123 84 128 Q100 137 116 128 Q130 123 160 130 V172 H40Z" fill="#ff5c8a"/><path d="M84 128 Q100 137 116 128" stroke="#e63973" stroke-width="3" fill="none"/><path d="M100 146 c-6 -8 -16 -1 0 11 c16 -12 6 -19 0 -11z" fill="#fff"/></g>`;
    case "pijama": return `<g><path d="M40 128 Q100 136 160 128 V172 H40Z" fill="#9fd3ff"/><path d="M82 129 L100 142 L118 129" stroke="#6fb4ec" stroke-width="4" fill="none"/>${[[64, 148], [138, 146], [74, 164], [128, 164], [56, 136], [146, 134]].map(([x, y]) => `<path d="${starP(x, y, 4.5)}" fill="#fff"/>`).join("")}${[148, 158].map(y => `<circle cx="100" cy="${y}" r="2.4" fill="#fff"/>`).join("")}</g>`;
    case "sudadera": return `<g><path d="M40 128 Q100 138 160 128 V172 H40Z" fill="#7b61ff"/><path d="M78 130 Q100 144 122 130" stroke="#6247e0" stroke-width="6" fill="none"/><path d="M93 138 v13 M107 138 v13" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><rect x="78" y="154" width="44" height="14" rx="6" fill="#6247e0"/></g>`;
    case "delantal": return `<g><path d="M40 136 Q100 144 160 136" stroke="#f1ede6" stroke-width="5" fill="none"/><path d="M72 128 H128 L136 172 H64Z" fill="#fff"/><rect x="83" y="150" width="34" height="12" rx="3" fill="#ece6dc"/><path d="M100 150 v12" stroke="#d8d0c4" stroke-width="1.5"/></g>`;
    case "vestido": return `<g><path d="M44 134 Q100 120 156 134 L172 172 H28Z" fill="#ffb3d1"/><path d="M46 134 Q100 148 154 134" stroke="#ff8fb8" stroke-width="7" fill="none"/>${[[70, 156], [100, 164], [130, 156], [86, 148], [116, 148]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff"/>`).join("")}<path d="M94 143 l6 -4 6 4 -6 4z" fill="#ff5c8a"/></g>`;
    case "chaleco": return `<g><rect x="40" y="126" width="120" height="50" fill="#fff"/><path d="M40 134 H160 M40 146 H160 M40 158 H160 M40 170 H160" stroke="#e63946" stroke-width="5"/><path d="M40 124 H80 L90 176 H40Z M160 124 H120 L110 176 H160Z" fill="#2b2d42"/><circle cx="84" cy="146" r="2.5" fill="#ffc629"/><circle cx="116" cy="146" r="2.5" fill="#ffc629"/><rect x="40" y="156" width="120" height="6" fill="#8a5a38"/><rect x="95" y="155" width="10" height="8" rx="1.5" fill="#ffc629"/></g>`;
    case "esmoquin": return `<g><rect x="40" y="124" width="120" height="52" fill="#1d1d24"/><path d="M82 124 L100 168 L118 124Z" fill="#fff"/><path d="M82 124 L95 152 L87 152Z M118 124 L105 152 L113 152Z" fill="#33333f"/><path d="M90 130 L100 135 L90 140Z M110 130 L100 135 L110 140Z" fill="#e63946"/><circle cx="100" cy="135" r="2" fill="#a4161a"/><circle cx="100" cy="150" r="1.8" fill="#1d1d24"/><circle cx="100" cy="158" r="1.8" fill="#1d1d24"/></g>`;
    case "tunica": return `<g><path d="M40 126 Q100 134 160 126 V176 H40Z" fill="#5a3fc0"/><rect x="40" y="152" width="120" height="6" fill="#ffd23f"/><path d="${starP(68, 140, 6)}" fill="#ffd23f"/><path d="${starP(126, 166, 5)}" fill="#ffd23f"/><path d="${starP(120, 138, 4)}" fill="#ffd23f"/><path d="M60 166 a6 6 0 1 0 8 -8 a5 5 0 1 1 -8 8z" fill="#ffd23f"/></g>`;
    case "jersey": return `<g><path d="M40 126 Q100 134 160 126 V176 H40Z" fill="#d62828"/><path d="M40 140 ${Array.from({ length: 15 }, (_, i) => `l4 -6 4 6`).join(" ")}" stroke="#fff" stroke-width="3" fill="none"/><path d="M100 146 L113 166 H87Z" fill="#2d8a3e"/><circle cx="100" cy="146" r="2.8" fill="#ffd23f"/><circle cx="96" cy="158" r="1.8" fill="#ffd23f"/><circle cx="105" cy="162" r="1.8" fill="#4dd2ff"/><rect x="97" y="166" width="6" height="5" fill="#8a5a38"/></g>`;
    case "heroe": return `<g><path d="M40 126 Q100 134 160 126 V176 H40Z" fill="#3a63d6"/><rect x="40" y="160" width="120" height="6" fill="#ffd23f"/><circle cx="100" cy="145" r="13" fill="#ffd23f"/><path d="M100 150 c-5 -7 -13 -1 0 9 c13 -10 5 -16 0 -9z" fill="#e63946"/></g>`;
    // ---- v30 · pies ----
    case "chanclas": return pair2(x => `<ellipse cx="${x}" cy="182" rx="13" ry="3.5" fill="#ff9f1c"/><path d="M${x - 8} 181 L${x} 172 L${x + 8} 181" stroke="#4d9dff" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
    case "zapatillas": return pair2(x => shoe(x, "#fff", "#e63946", `<path d="M${x - 6} 172 L${x + 6} 176" stroke="#4d9dff" stroke-width="3" stroke-linecap="round"/>`));
    case "botasagua": return pair2(x => `<path d="M${x - 10} 158 H${x + 8} V174 Q${x + 14} 175 ${x + 14} 180 V184 H${x - 10}Z" fill="#ffd23f"/><rect x="${x - 11}" y="156" width="20" height="5" rx="2" fill="#e0a100"/>`);
    case "botasvaq": return pair2(x => `<path d="M${x - 10} 158 L${x - 6} 154 L${x - 2} 158 L${x + 2} 154 L${x + 6} 158 L${x + 8} 158 V174 Q${x + 15} 175 ${x + 15} 180 V184 H${x - 10}Z" fill="#8a5a38"/><path d="${starP(x - 1, 169, 4)}" fill="#ffd23f"/><rect x="${x - 10}" y="182" width="25" height="3" fill="#5a3a22"/>`);
    case "fiesta": return pair2(x => shoe(x, "#e63946", "#8a1020", `<path d="M${x - 3} 170 l-5 -4 v8z M${x - 3} 170 l5 -4 v8z" fill="#ffd23f"/>`));
    case "patines": return pair2(x => shoe(x, "#ff8fb8", "#fff", `<circle cx="${x - 7}" cy="188" r="3.8" fill="#7b61ff"/><circle cx="${x + 7}" cy="188" r="3.8" fill="#7b61ff"/>`));
    // ---- v30 · mano ----
    case "globo": return `<g><path d="M150 146 Q158 108 166 80" stroke="#999" stroke-width="1.5" fill="none"/><ellipse cx="168" cy="62" rx="16" ry="19" fill="#ff5c8a"/><ellipse cx="162" cy="55" rx="4" ry="6" fill="#fff" opacity=".45"/><path d="M165 81 l3 4 3 -4z" fill="#ff5c8a"/></g>`;
    case "piruleta": return `<g><path d="M150 148 L160 112" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="163" cy="100" r="15" fill="#ff8fb8"/><path d="M153 100 a10 10 0 1 1 20 0 a7 7 0 1 1 -14 0 a4 4 0 1 1 8 0" stroke="#fff" stroke-width="3" fill="none"/></g>`;
    case "taza": return `<g><rect x="144" y="128" width="24" height="22" rx="4" fill="#fff"/><path d="M168 133 q9 0 9 7 q0 7 -9 7" stroke="#fff" stroke-width="3.5" fill="none"/><path d="M156 137 c-4 -5 -9 0 0 7 c9 -7 4 -12 0 -7z" fill="#ff5c8a"/><path d="M151 124 q-3 -5 0 -10 M160 124 q3 -5 0 -10" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/></g>`;
    case "cuchara": return `<g><path d="M148 150 L168 104" stroke="#c08457" stroke-width="5" stroke-linecap="round"/><ellipse cx="170" cy="96" rx="7.5" ry="11" fill="#c08457" transform="rotate(23 170 96)"/></g>`;
    case "espada": return `<g><path d="M151 144 Q171 108 165 66 Q178 104 159 144Z" fill="#e3e9f0" stroke="#9aa5b1" stroke-width="1.5"/><rect x="142" y="141" width="24" height="5" rx="2" fill="#ffc629"/><rect x="150" y="145" width="8" height="13" rx="2" fill="#8a5a38"/></g>`;
    case "varita": return `<g><path d="M148 150 L170 104" stroke="#2b2d42" stroke-width="4.5" stroke-linecap="round"/><path d="M167 110 L170 104" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><path d="${starP(173, 95, 11)}" fill="#ffd23f" stroke="#e0a100" stroke-width="1.5"/><path class="fxtw" d="${spark(186, 82, 5)}" fill="#fff"/><path class="fxtw" style="animation-delay:.7s" d="${spark(160, 84, 4)}" fill="#fff"/></g>`;
    case "rosa": return `<g><path d="M150 150 Q156 124 160 102" stroke="#2d8a3e" stroke-width="3.5" fill="none"/><ellipse cx="151" cy="127" rx="8" ry="3.5" fill="#3fa34d" transform="rotate(-30 151 127)"/><circle cx="161" cy="94" r="11" fill="#d62839"/><path d="M154 92 q7 -9 14 0 q-7 7 -14 0" fill="#a4161a"/><path d="M155 99 q6 4 12 0" stroke="#a4161a" stroke-width="2" fill="none"/></g>`;
    case "micro": return `<g><rect x="147" y="118" width="9" height="32" rx="4" fill="#2b2d42" transform="rotate(18 151 134)"/><circle cx="157" cy="112" r="10.5" fill="#9aa5b1"/><path d="M149 109 h16 M149 114 h16" stroke="#6c7a89" stroke-width="1.5"/></g>`;
    // ---- v30 · espalda ----
    case "murcielago": { const w = `<path d="M60 112 Q30 78 8 96 Q20 104 14 118 Q28 112 30 128 Q42 118 56 136Z"/>`; return `<g fill="#3d2b56">${w}<g transform="translate(200 0) scale(-1 1)">${w}</g></g>`; }
    case "hada": { const w = `<ellipse cx="40" cy="96" rx="30" ry="16" fill="#bff0ff" stroke="#8fd3ff" stroke-width="1.5" transform="rotate(-30 40 96)"/><ellipse cx="44" cy="132" rx="21" ry="11" fill="#ffd6f0" stroke="#ffb3d1" stroke-width="1.5" transform="rotate(25 44 132)"/>`; return `<g opacity=".85">${w}<g transform="translate(200 0) scale(-1 1)">${w}</g></g>`; }
    case "jetpack": return `<g><rect x="136" y="96" width="20" height="48" rx="8" fill="#9aa5b1"/><rect x="150" y="100" width="20" height="48" rx="8" fill="#c0c8d2"/><path d="M140 96 v-6 h12 v6 M154 100 v-6 h12 v6" fill="#e63946"/><path class="fxjet" d="M141 144 q5 18 10 0Z M155 148 q5 18 10 0Z" fill="#ff9f1c"/></g>`;
    case "dragon": { const w = `<path d="M60 110 Q24 56 4 80 Q16 86 8 100 Q22 98 20 114 Q34 108 36 124 Q48 116 58 132Z" fill="#2d8a3e"/><path d="M58 112 L12 84 M56 118 L16 104 M56 124 L26 118" stroke="#52b95f" stroke-width="2"/>`; return `<g>${w}<g transform="translate(200 0) scale(-1 1)">${w}</g></g>`; }
    case "alasang": return `<g fill="#fff" stroke="#e6e6f0" stroke-width="2"><path d="M60 112 Q14 88 18 128 Q26 150 60 140 Z"/><path d="M58 122 Q26 112 28 140 Q40 152 60 146 Z"/><path d="M140 112 Q186 88 182 128 Q174 150 140 140 Z"/><path d="M142 122 Q174 112 172 140 Q160 152 140 146 Z"/></g>`;
  }
  return "";
}
function eyesSVG(expr) {
  const ink = "#2b1a10";
  if (expr === "happy" || expr === "laugh") return `<path d="M71 110 Q80 98 89 110 M111 110 Q120 98 129 110" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  if (expr === "sleep") return `<path d="M71 106 Q80 114 89 106 M111 106 Q120 114 129 106" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (expr === "love") { const H = "M0 6 C-12 -2 -12 -12 -5 -12 C-2 -12 0 -9 0 -7 C0 -9 2 -12 5 -12 C12 -12 12 -2 0 6Z"; return `<path d="${H}" transform="translate(80 110)" fill="#ff3d7f"/><path d="${H}" transform="translate(120 110)" fill="#ff3d7f"/>`; }
  if (expr === "bored") return `<g class="eyesg"><path d="M71 106 L89 106 M111 106 L129 106" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M74 107 Q80 113 86 107 M114 107 Q120 113 126 107" fill="${ink}"/></g>`;
  if (expr === "tired") return `<g class="eyesg"><path d="M72 104 Q80 110 88 104 M112 104 Q120 110 128 104" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M73 114 Q80 118 87 114 M113 114 Q120 118 127 114" stroke="#8a6f90" stroke-width="2.5" fill="none" opacity=".7"/></g>`;
  if (expr === "sick") return `<g class="eyesg"><path d="M72 102 L88 110 M72 110 L88 102 M112 102 L128 110 M112 110 L128 102" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/></g>`;
  const r = expr === "surprised" ? 9.5 : 7.5;
  let s = `<g class="eyesg"><g class="eyes"><circle cx="80" cy="107" r="${r}" fill="${ink}"/><circle cx="120" cy="107" r="${r}" fill="${ink}"/><circle cx="82.6" cy="104.2" r="2.8" fill="#fff"/><circle cx="122.6" cy="104.2" r="2.8" fill="#fff"/></g></g>`;
  if (expr === "sad") s += `<path d="M68 100 L88 93 M132 100 L112 93" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/><path class="tear" d="M73 118 Q70 124 73 127 Q76 124 73 118 Z" fill="#6cc3ff"/>`;
  if (expr === "hungry") s += `<path d="M71 96 Q79 90 88 93 M129 96 Q121 90 112 93" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/><path class="drool" d="M108 130 Q106 138 109 141 Q112 138 108 130Z" fill="#9fd3ff"/>`;
  return s;
}
function bodyFill(C) {
  if (C.pat === "rainbow") return { defs: `<linearGradient id="rbw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b8b"/><stop offset=".25" stop-color="#ffb361"/><stop offset=".5" stop-color="#ffd93b"/><stop offset=".75" stop-color="#6fdc9a"/><stop offset="1" stop-color="#7fb7ff"/></linearGradient>`, fill: "url(#rbw)" };
  if (C.pat === "ice") return { defs: `<linearGradient id="ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d4f3ff"/><stop offset="1" stop-color="#9fd8ff"/></linearGradient>`, fill: "url(#ice)" };
  if (C.pat === "stars") return { defs: `<radialGradient id="glx" cx=".35" cy=".35"><stop offset="0" stop-color="#7a5cc7"/><stop offset=".6" stop-color="#3b2a7a"/><stop offset="1" stop-color="#1b1440"/></radialGradient>`, fill: "url(#glx)" };
  return { defs: "", fill: C.body };
}
function patternSVG(C) {
  if (C.pat === "spots") return `<g fill="#2b2522"><ellipse cx="72" cy="92" rx="11" ry="8"/><ellipse cx="132" cy="138" rx="12" ry="9"/><ellipse cx="128" cy="84" rx="7" ry="6"/><ellipse cx="66" cy="140" rx="8" ry="6"/></g>`;
  if (C.pat === "seeds") return `<g fill="#ffe16b">${[[70, 90], [90, 78], [112, 80], [132, 92], [62, 118], [140, 118], [74, 146], [128, 148]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="3.4"/>`).join("")}</g>`;
  if (C.pat === "ice") return `<g fill="#fff">${[[70, 88], [128, 82], [140, 128], [62, 136], [100, 70], [116, 150]].map(([x, y], i) => `<path d="${spark(x, y, i % 2 ? 4 : 7)}"/>`).join("")}</g>`;
  if (C.pat === "stars") return `<g fill="#fff">${[[70, 86], [126, 80], [138, 130], [66, 140], [96, 72], [112, 150]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 1.6 : 2.4}"/>`).join("")}</g>`;
  return "";
}
const SPECIES = {
  pollito: { e: "🐤", n: "Pollito", color: "amarillo", egg: "#ffe3b3" },
  gato: { e: "🐱", n: "Gatito", color: "naranja", egg: "#ffcf99" },
  perro: { e: "🐶", n: "Perrito", color: "choco", egg: "#d9b38c" },
  conejo: { e: "🐰", n: "Conejito", color: "blanco", egg: "#ffd6e8" },
  pinguino: { e: "🐧", n: "Pingüino", color: "noche", egg: "#b9c7d9" }
};
function chickSVG(si, expr, wear, crackLevel, colorId, extra = {}) {
  const sp = extra.species || "pollito", SPC = SPECIES[sp] || SPECIES.pollito;
  const shadow = `<ellipse cx="100" cy="182" rx="${si ? 38 + si * 3 : 40}" ry="7" fill="rgba(0,0,0,.18)"/>`;
  if (si === 0) {
    const cracks = crackLevel ? `<path d="M64 112 L76 102 L84 114 L96 100 L106 114 L118 102 L128 112" stroke="#a88a60" stroke-width="3" fill="none" stroke-linejoin="round"/>` : "";
    return `<svg viewBox="0 0 200 200" class="chick">${shadow}<g class="egg-g ${crackLevel ? "shake" : ""}">
      <ellipse cx="100" cy="120" rx="47" ry="60" fill="#fff6e6" stroke="#e8d9bf" stroke-width="3"/>
      <ellipse cx="80" cy="96" rx="9" ry="7" fill="${SPC.egg}"/><ellipse cx="118" cy="140" rx="11" ry="8" fill="${SPC.egg}"/><ellipse cx="116" cy="92" rx="5" ry="4" fill="${SPC.egg}"/><ellipse cx="72" cy="140" rx="6" ry="5" fill="${SPC.egg}"/>
      <ellipse cx="82" cy="84" rx="10" ry="16" fill="#fff" opacity=".6" transform="rotate(25 82 84)"/>${cracks}</g></svg>`;
  }
  const sc = [0, .74, .84, .94, 1.0, 1.06, 1.1][si];
  const C = CAT[colorId] || CAT.amarillo, { belly, dark } = C, BF = bodyFill(C), body = C.body, ink = "#2b1a10";
  const cls = { happy: "happy", laugh: "happy", love: "happy", sad: "sad", sick: "sick", tired: "tired" }[expr] || "";
  const bird = sp === "pollito" || sp === "pinguino";
  const open = (expr === "happy" || expr === "laugh" || expr === "love") ? 4 : expr === "surprised" ? 3 : 0;
  // patas
  const feet = si === 1 ? "" : bird ? `<path d="M86 166 L86 180 M79 180 L93 180 M114 166 L114 180 M107 180 L121 180" stroke="#ff9f1c" stroke-width="4.5" stroke-linecap="round"/>`
    : `<ellipse cx="84" cy="174" rx="12" ry="8" fill="${dark}"/><ellipse cx="116" cy="174" rx="12" ry="8" fill="${dark}"/>`;
  // cola (detrás)
  let tail = "";
  if (sp === "pollito" && si >= 5) tail = `<g fill="${dark}"><ellipse cx="146" cy="96" rx="10" ry="26" transform="rotate(20 146 96)"/><ellipse cx="156" cy="106" rx="10" ry="26" transform="rotate(45 156 106)"/><ellipse cx="160" cy="120" rx="9" ry="22" transform="rotate(70 160 120)"/></g>`;
  if (sp === "gato") tail = `<path class="wag" d="M146 150 Q184 146 178 104 Q176 92 168 96" stroke="${dark}" stroke-width="11" fill="none" stroke-linecap="round"/>`;
  if (sp === "perro") tail = `<path class="wag" d="M148 140 Q172 128 170 108" stroke="${dark}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  if (sp === "conejo") tail = `<circle cx="150" cy="150" r="13" fill="#fff" stroke="#eee" stroke-width="2"/>`;
  // cabeza: plumitas / orejas
  let head = "";
  if (sp === "pollito") head = si >= 4 ? `<path d="M84 72 Q84 54 94 62 Q98 46 106 62 Q116 54 116 72 Z" fill="#ff4d5a"/>`
    : si >= 3 ? `<path d="M100 70 Q95 56 101 48 M100 70 Q107 58 114 58 M100 70 Q92 60 86 62" stroke="${dark}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`
    : si >= 2 ? `<path d="M100 70 Q96 58 102 52" stroke="${dark}" stroke-width="4" fill="none" stroke-linecap="round"/>` : "";
  let earsBack = "";
  if (sp === "gato") earsBack = `<path d="M60 90 L66 46 L96 70 Z" fill="${body}"/><path d="M140 90 L134 46 L104 70 Z" fill="${body}"/><path d="M68 80 L71 56 L88 70 Z" fill="#ff9fb4"/><path d="M132 80 L129 56 L112 70 Z" fill="#ff9fb4"/>`;
  if (sp === "conejo") earsBack = `<ellipse cx="80" cy="44" rx="12" ry="34" fill="${body}" transform="rotate(-10 80 44)"/><ellipse cx="80" cy="46" rx="6" ry="24" fill="#ffb3cf" transform="rotate(-10 80 46)"/><ellipse cx="120" cy="44" rx="12" ry="34" fill="${body}" transform="rotate(10 120 44)"/><ellipse cx="120" cy="46" rx="6" ry="24" fill="#ffb3cf" transform="rotate(10 120 46)"/>`;
  const earsFront = sp === "perro" ? `<ellipse cx="56" cy="102" rx="14" ry="30" fill="${dark}" transform="rotate(18 56 102)"/><ellipse cx="144" cy="102" rx="14" ry="30" fill="${dark}" transform="rotate(-18 144 102)"/>` : "";
  // pico / hocico
  let mouth;
  if (sp === "pollito") mouth = `<path d="M89 118 Q100 111 111 118 L100 127 Z" fill="#ff9f1c"/><g class="beak-low" style="transform-box:fill-box"><path d="M93 ${126 + open} L107 ${126 + open} L100 ${133 + open} Z" fill="#f08400"/></g>` + (open ? `<path d="M95 125 L105 125 L100 ${128 + open} Z" fill="#c2413d"/>` : "");
  else if (sp === "pinguino") mouth = `<path d="M93 118 Q100 114 107 118 L100 125 Z" fill="#ff9f1c"/><g class="beak-low" style="transform-box:fill-box"><path d="M95 ${124 + open} L105 ${124 + open} L100 ${129 + open} Z" fill="#f08400"/></g>`;
  else {
    const nose = sp === "perro" ? `<ellipse cx="100" cy="120" rx="8" ry="6" fill="${ink}"/><ellipse cx="97" cy="118" rx="2.5" ry="1.5" fill="#fff" opacity=".6"/>` : `<path d="M95 118 L105 118 L100 124 Z" fill="#ff8fa3"/>`;
    const m = `<g class="beak-low" style="transform-box:fill-box"><path d="M100 125 Q95 131 89 127 M100 125 Q105 131 111 127" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`;
    const tongue = open && sp === "perro" ? `<path d="M95 130 Q100 144 105 130 Z" fill="#ff6b8b"/>` : open ? `<ellipse cx="100" cy="131" rx="5" ry="${2 + open}" fill="#c2413d"/>` : "";
    const teeth = sp === "conejo" ? `<rect x="96" y="126" width="8" height="7" rx="1.5" fill="#fff" stroke="#ddd"/>` : "";
    const whisk = sp === "gato" ? `<path d="M84 122 L62 118 M84 126 L62 128 M116 122 L138 118 M116 126 L138 128" stroke="${ink}" stroke-width="1.6" opacity=".55"/>` : "";
    mouth = tongue + nose + m + teeth + whisk;
  }
  const shellFront = si === 1 ? `<path d="M38 132 L50 118 L62 134 L76 116 L90 134 L104 116 L118 134 L132 116 L146 134 L162 118 L162 150 Q162 186 100 186 Q38 186 38 150 Z" fill="#fff6e6" stroke="#e8d9bf" stroke-width="3" stroke-linejoin="round"/>` : "";
  const headItem = extra.party ? "_party" : wear.head;
  const shellHat = si === 1 && !headItem && bird ? `<path d="M74 78 Q100 44 126 78 L118 70 L110 80 L100 68 L90 80 L82 70 Z" fill="#fff6e6" stroke="#e8d9bf" stroke-width="3" stroke-linejoin="round"/>` : "";
  const bodyStroke = (colorId === "blanco" || colorId === "vaca" || colorId === "fantasma") ? ` stroke="#e6ded2" stroke-width="2"` : "";
  const bodyOp = C.pat === "ghost" ? ` fill-opacity=".86"` : "";
  const dirt = extra.dirty ? `<g fill="#8a6a45" opacity=".55"><ellipse cx="70" cy="132" rx="8" ry="5"/><ellipse cx="128" cy="96" rx="6" ry="4"/><ellipse cx="118" cy="150" rx="9" ry="5"/><circle cx="82" cy="80" r="3.5"/></g>` : "";
  const sick = expr === "sick" ? `<g><rect x="118" y="124" width="26" height="6" rx="3" fill="#fff" stroke="#ccc" transform="rotate(-20 118 124)"/><circle cx="143" cy="117" r="4" fill="#e63946"/></g>` : "";
  const sweat = extra.hot ? `<path class="tear" d="M140 84 Q136 92 140 96 Q144 92 140 84Z" fill="#9fd3ff"/>` : "";
  const neckItem = wear.neck || (extra.cold ? "bufanda" : null);
  const wings = sp === "pollito" || sp === "pinguino" ? `<g class="wing wl"><ellipse cx="54" cy="128" rx="13" ry="24" fill="${dark}" transform="rotate(22 54 128)"/></g><g class="wing wr"><ellipse cx="146" cy="128" rx="13" ry="24" fill="${dark}" transform="rotate(-22 146 128)"/></g>`
    : `<g class="wing wl"><ellipse cx="58" cy="146" rx="11" ry="16" fill="${dark}" transform="rotate(20 58 146)"/></g><g class="wing wr"><ellipse cx="142" cy="146" rx="11" ry="16" fill="${dark}" transform="rotate(-20 142 146)"/></g>`;
  const cheekOp = expr === "sad" || expr === "sick" ? .3 : .75, cheekCol = expr === "sick" ? "#a8d88a" : "#ff8fa3";
  return `<svg viewBox="0 0 200 200" class="chick ${cls} sp-${sp}"><defs>${BF.defs}<clipPath id="bodyclip"><circle cx="100" cy="116" r="52"/></clipPath></defs>${shadow}
   <g transform="translate(100 182) scale(${sc}) translate(-100 -182)">
    ${fxSVG(wear.fx, "back")}${itemSVG(wear.back)}${tail}${feet}${si > 1 ? itemSVG(wear.feet) : ""}
    <g class="bodyg">
      ${earsBack}${wings}
      <circle cx="100" cy="116" r="52" fill="${BF.fill}"${bodyStroke}${bodyOp}/>
      <g clip-path="url(#bodyclip)">${patternSVG(C)}</g>
      <ellipse cx="100" cy="136" rx="31" ry="25" fill="${belly}"/>
      ${wear.body ? `<g clip-path="url(#bodyclip)">${itemSVG(wear.body)}</g>` : ""}
      <ellipse cx="80" cy="84" rx="12" ry="7" fill="#fff" opacity=".35" transform="rotate(-25 80 84)"/>
      ${earsFront}${dirt}${head}${itemSVG(neckItem)}
      ${eyesSVG(expr)}
      <ellipse cx="67" cy="123" rx="8.5" ry="5.5" fill="${cheekCol}" opacity="${cheekOp}"/>
      <ellipse cx="133" cy="123" rx="8.5" ry="5.5" fill="${cheekCol}" opacity="${cheekOp}"/>
      ${mouth}${sick}${sweat}${itemSVG(wear.face)}${itemSVG(headItem)}${shellHat}${si > 1 ? itemSVG(wear.hand) : ""}
    </g>${shellFront}${fxSVG(wear.fx, "front")}
   </g></svg>`;
}

// ---------- Especies ----------
const SPN = { pollito: ["Pollito", "Pollo"], gato: ["Gatito", "Gato"], perro: ["Perrito", "Perro"], conejo: ["Conejito", "Conejo"], pinguino: ["Pingüinito", "Pingüino"] };
function stageName(k, sp) { const N = SPN[sp || "pollito"] || SPN.pollito; return STAGES[k].n.replace("Pollito", N[0]).replace("Pollo", N[1]).replace("pollo", N[1].toLowerCase()); }
function stageEmoji(k, sp) { return (!sp || sp === "pollito" || k < 2 || k === 6) ? STAGE_E[k] : SPECIES[sp].e; }
const hhmm = t => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

// ---------- Tiempo real (Open-Meteo, sin clave) ----------
let WX = null; try { WX = JSON.parse(ls.get("wx") || "null"); } catch (e) {}
const wxOn = () => ls.get("wxOn") === "1";
if (!wxOn() || (WX && Date.now() - WX.at > 3 * 36e5)) WX = null;
function wxKindOf(code) {
  if (code == null) return "";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  return code >= 2 ? "cloud" : "clear";
}
const wxKind = () => (WX ? wxKindOf(WX.code) : "");
const WX_E = { clear: "☀️", cloud: "⛅", rain: "🌧️", storm: "⛈️", snow: "🌨️", fog: "🌫️" };
const WX_T = { clear: "despejado", cloud: "nublado", rain: "lloviendo", storm: "con tormenta", snow: "nevando", fog: "con niebla" };
const otherWx = () => { const w = ((state.main || {}).wx || {})[other()]; return w && Date.now() - w.at < 6 * 36e5 ? w : null; };
async function loadWeather(force) {
  if (!wxOn()) return;
  if (!force && WX && Date.now() - WX.at < 30 * 60000) return;
  let loc = null; try { loc = JSON.parse(ls.get("wxLoc") || "null"); } catch (e) {}
  if (!loc) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`);
    const c = (await r.json()).current;
    WX = { temp: Math.round(c.temperature_2m), code: c.weather_code, isDay: !!c.is_day, at: Date.now() };
    ls.set("wx", JSON.stringify(WX));
    S.merge("state/main", { wx: { [who]: { temp: WX.temp, code: WX.code, at: WX.at } } });
    sceneSig = ""; petSig = ""; renderPet();
  } catch (e) {}
}
function toggleWeather() {
  if (wxOn()) { ls.set("wxOn", "0"); WX = null; sceneSig = ""; petSig = ""; renderPet(); toast("Tiempo real desactivado"); return; }
  if (!navigator.geolocation) return toast("Tu móvil no deja usar la ubicación 📍");
  toast("Buscando dónde estás… 📍");
  navigator.geolocation.getCurrentPosition(pos => {
    ls.set("wxLoc", JSON.stringify({ lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2) })); ls.set("wxOn", "1");
    loadWeather(true).then(() => { if (WX) say(`Aquí hace ${WX.temp}° y está ${WX_T[wxKind()]} ${WX_E[wxKind()]}`, 4000); else toast("No he podido ver el tiempo, lo intento luego"); });
  }, () => toast("Sin permiso de ubicación no puedo saber el tiempo 📍"), { timeout: 15000, maximumAge: 36e5 });
}
setInterval(() => { if (!document.hidden) loadWeather(); }, 10 * 60000);

// ---------- Excursiones y postales ----------
const TRIP_H = 3;
const DEST = [
  { id: "paris", e: "🗼", n: "París", t: "¡Bonjour! He subido a la Torre Eiffel y desde arriba he buscado vuestras casas. Me he comido un cruasán más grande que yo 🥐" },
  { id: "roma", e: "🏛️", n: "Roma", t: "He tirado una moneda a la Fontana di Trevi para que os veáis muy pronto. ¡Y me he tomado un helado de pistacho! 🍨" },
  { id: "londres", e: "💂", n: "Londres", t: "Ha llovido todo el rato, pero he visto el Big Ben y he tomado té a las cinco en punto ☕" },
  { id: "tokio", e: "🗾", n: "Tokio", t: "¡Konnichiwa! He visto los cerezos en flor y he comido sushi en una cinta que da vueltas 🍣" },
  { id: "nyc", e: "🗽", n: "Nueva York", t: "¡Qué edificios tan altos! He saludado a la Estatua de la Libertad y me he perdido en Central Park 🌳" },
  { id: "egipto", e: "🐫", n: "Egipto", t: "He montado en camello y he visto las pirámides. ¡Qué calor hacía! 🥵" },
  { id: "islandia", e: "🌌", n: "Islandia", t: "Esta noche he visto una aurora boreal verde y rosa. He pedido un deseo por vosotros 💚" },
  { id: "caribe", e: "🏝️", n: "El Caribe", t: "Arena blanca, agua turquesa y un coco con pajita. Solo faltabais vosotros 🥥" },
  { id: "laponia", e: "🎅", n: "Laponia", t: "¡He conocido a Papá Noel! Le he dicho que este año os portáis muy bien 🎁" },
  { id: "venecia", e: "🚣", n: "Venecia", t: "He paseado en góndola y el gondolero me ha cantado una canción de amor 🎶" },
  { id: "amazonas", e: "🦜", n: "El Amazonas", t: "He hecho amigos: un loro, un mono y una rana de colores. ¡Qué selva tan grande! 🌿" },
  { id: "sidney", e: "🦘", n: "Sídney", t: "He saltado con un canguro y he visto la Ópera. ¡Aquí todo va al revés! 🙃" },
  { id: "rio", e: "🎉", n: "Río de Janeiro", t: "¡Me he colado en el carnaval! He bailado samba con plumas de colores 💃" },
  { id: "grecia", e: "🌅", n: "Santorini", t: "Casitas blancas, cúpulas azules y el atardecer más bonito del mundo. Os lo guardo para cuando vengáis juntos 💙" },
  { id: "marruecos", e: "🕌", n: "Marrakech", t: "He paseado por el zoco y he tomado té con hierbabuena. ¡Casi me compro una alfombra voladora! 🧞" },
  { id: "luna", e: "🌙", n: "La Luna", t: "¡He ido a la Luna! Desde aquí la Tierra es pequeñita y vosotros estáis muy cerquita el uno del otro 💫" }
];
const DESTM = Object.fromEntries(DEST.map(d => [d.id, d]));
const tripAway = p => (p && p.trip && Date.now() < p.trip.until ? DESTM[p.trip.id] || DEST[0] : null);
const tripBack = p => !!(p && p.trip && Date.now() >= p.trip.until);
function awayToast() { const d = tripAway(state.pet); if (!d) return false; toast(`Está de excursión en ${d.n} ${d.e} · vuelve a las ${hhmm(state.pet.trip.until)}`); return true; }
function startTrip() {
  const I = petInfo(), p = I.p;
  if (I.si === 0) return toast("Primero tiene que nacer 🥚");
  if (p.trip) return;
  if (p.sick) return say("Estoy malito, mejor me quedo en casa 🤒");
  if (isNapping(p)) return say("Zzz… luego me voy 😴");
  if (I.nv.energy < 25) return say("Estoy muy cansado para viajar… ¿una siesta primero? 😴");
  const seen = p.postcards || {}, pool = DEST.filter(d => !seen[d.id]), d = rnd(pool.length ? pool : DEST);
  let lvl = 0;
  petTx(q => { if (q.trip) return null; q.trip = { id: d.id, until: Date.now() + TRIP_H * (setOn(q, "playa") ? .5 : 1) * 36e5, by: who }; setNeed(q, "energy", -20); bump(q, "trip"); lvl = gainExp(q, 8); return q; })
    .then(r => { if (!r) return; sceneSig = ""; petSig = ""; renderPet(); say(`¡Me voy a ${d.n}! ${d.e} Os traeré una postal 📮`, 4000); sendMsg(`🧳 ${r.name || "La mascota"} se ha ido de excursión a ${d.n} ${d.e}. Vuelve en ${setOn(r, "playa") ? TRIP_H / 2 : TRIP_H} horas con una postal`, "pet"); lvlToast(lvl); })
    .catch(offline);
}
function claimTrip() {
  let d = null, stk = null, gift = 0, lvl = 0;
  petTx(q => {
    if (!tripBack(q)) return null;
    d = DESTM[q.trip.id] || DEST[0]; q.postcards = q.postcards || {};
    const nw = !q.postcards[d.id]; if (nw) q.postcards[d.id] = Date.now();
    gift = nw ? 25 : 10; q.coins += gift; setNeed(q, "fun", 35); setNeed(q, "love", 10); lvl = gainExp(q, 15);
    if (Math.random() < .4) stk = giveSticker(q);
    q.trip = null; return q;
  }).then(r => {
    if (!r || !d) return; sceneSig = ""; petSig = ""; renderPet(); react("happy", 2500); confetti();
    showPostcard(d, true); toast(`+${gift} 🪙${stk ? " · pegatina " + stk.e : ""}`, 3000); lvlToast(lvl);
  }).catch(offline);
}
function showPostcard(d, fresh) { readView({ icon: d.e, title: (fresh ? "📮 Postal desde " : "") + d.n, sub: fresh ? `${(state.pet || {}).name || "Tu mascota"} ha vuelto de su excursión` : "De vuestra colección de postales", text: d.t }); }

// ---------- Pegatinas ----------
const STICKERS = [["corazon", "💖", "Corazón"], ["arcoiris", "🌈", "Arcoíris"], ["unicornio", "🦄", "Unicornio"], ["estrella", "⭐", "Estrella"], ["luna", "🌙", "Luna"], ["sol", "🌞", "Sol"],
  ["fresa", "🍓", "Fresa"], ["helado", "🍦", "Helado"], ["donut", "🍩", "Dónut"], ["pizza", "🍕", "Pizza"], ["gato", "🐱", "Gatito"], ["perro", "🐶", "Perrito"],
  ["panda", "🐼", "Panda"], ["koala", "🐨", "Koala"], ["rana", "🐸", "Rana"], ["pulpo", "🐙", "Pulpo"], ["cohete", "🚀", "Cohete"], ["avion", "✈️", "Avión"],
  ["carta", "💌", "Carta"], ["anillo", "💍", "Anillo"], ["regalo", "🎁", "Regalo"], ["globo", "🎈", "Globo"], ["tulipan", "🌷", "Tulipán"], ["trebol", "🍀", "Trébol"],
  ["seta", "🍄", "Seta"], ["cactus", "🌵", "Cactus"], ["mariposa", "🦋", "Mariposa"], ["diamante", "💎", "Diamante"], ["corona", "👑", "Corona"], ["dragon", "🐉", "Dragón"]].map(([id, e, n]) => ({ id, e, n }));
const STK_PRIZE = 300;
function giveSticker(q) {
  q.stickers = q.stickers || {};
  const miss = STICKERS.filter(s => !q.stickers[s.id]), s = rnd(miss.length ? miss : STICKERS);
  q.stickers[s.id] = (q.stickers[s.id] || 0) + 1;
  if (!q.stkDone && STICKERS.every(x => q.stickers[x.id])) { q.stkDone = Date.now(); q.coins += STK_PRIZE; }
  return s;
}

// ---------- Tesoros (cada 3 horas, cada uno el suyo) ----------
const TRE_H = 3;
const treasureReady = p => !!p && stageOf(p.xp || 0) > 0 && !tripAway(p) && Date.now() - ((p.tre || {})[who] || 0) >= treH(p) * 36e5;
function digTreasure() {
  let res = null, lvl = 0;
  petTx(q => {
    if (!treasureReady(q)) return null;
    q.tre = { ...(q.tre || {}), [who]: Date.now() }; bump(q, "treasure"); lvl = gainExp(q, 5);
    const r = Math.random(), rare = CATALOG.filter(it => it.treasure && !q.owned[it.id]);
    if (r < (setOn(q, "pirata") ? .2 : .08) && rare.length) { const it = rnd(rare); q.owned[it.id] = true; res = { t: `¡${it.e} ${it.n}! Solo sale en tesoros`, e: it.e, big: it }; }
    else if (r < .25) { const s = giveSticker(q); res = { t: `una pegatina ${s.e} ${s.n}`, e: s.e }; }
    else if (r < .48) { const id = rnd(["manzana", "galleta", "fresas", "helado", "cafe", "tarta", "medicina", "jabon"]), it = CAT[id]; q.inv[id] = (q.inv[id] || 0) + 1; res = { t: `${it.e} ${it.n.toLowerCase()} para la mochila`, e: it.e }; }
    else { const n = Math.random() < .06 ? 100 : 10 + Math.floor(Math.random() * 31); q.coins += n; res = { t: `${n} monedas`, e: "🪙", n }; }
    return q;
  }).then(r => {
    if (!r || !res) return;
    buzz([20, 40, 20]); anim("jump", 1200); fx("game", res.e, "", 1600); react("happy", 2600);
    say(`¡He encontrado un tesoro! ✨ ${res.t}`, 4200); if (res.n) setTimeout(() => coinFx(res.n), 600);
    if (res.big) { confetti(); sendMsg(`🌟 ¡${r.name || "La mascota"} ha encontrado un tesoro rarísimo: ${res.big.e} ${res.big.n}!`, "pet"); }
    sceneSig = ""; renderPet(); lvlToast(lvl);
  }).catch(offline);
}

// ---------- Misiones del día (3 para cada uno) ----------
const MISSIONS = [
  { id: "hug5", k: "hug", n: 5, e: "🤗", t: "Dale 5 mimos", r: 15 }, { id: "hug10", k: "hug", n: 10, e: "🥰", t: "Dale 10 mimos", r: 20 },
  { id: "play2", k: "play", n: 2, e: "⚽", t: "Juega con él 2 veces", r: 15 }, { id: "play4", k: "play", n: 4, e: "🎈", t: "Juega con él 4 veces", r: 20 },
  { id: "feed", k: "feed", n: 1, e: "🍓", t: "Dale de comer", r: 10 }, { id: "bath", k: "bath", n: 1, e: "🛁", t: "Báñale", r: 12 },
  { id: "bag", k: "bag", n: 1, e: "🎒", t: "Dale algo de la mochila", r: 12 }, { id: "nap", k: "nap", n: 1, e: "🌙", t: "Ponle a dormir la siesta", r: 10 },
  { id: "dress", k: "dress", n: 1, e: "👒", t: "Cámbiale la ropa", r: 10 }, { id: "buy", k: "buy", n: 1, e: "🛍️", t: "Cómprale algo en la tienda", r: 15 },
  { id: "trip", k: "trip", n: 1, e: "🧳", t: "Mándale de excursión", r: 15 }, { id: "tre", k: "treasure", n: 1, e: "✨", t: "Encuentra un tesoro", r: 15 },
  { id: "game1", k: "game", n: 1, e: "🎮", t: "Juega a un minijuego", r: 12 }, { id: "game3", k: "game", n: 3, e: "🕹️", t: "Juega 3 partidas de minijuegos", r: 20 },
  { id: "post", k: "post", n: 1, e: "✉️", t: "Envía o responde una carta con él", r: 15 },
  { id: "trick", k: "trick", n: 2, e: "🎪", t: "Que haga 2 trucos", r: 12 },
  { id: "tickle", k: "tickle", n: 1, e: "😂", t: "Hazle cosquillas (5 toques rápidos)", r: 10 }, { id: "pet", k: "pet", n: 1, e: "💕", t: "Acaríciale (mantén el dedo)", r: 10 }
];
const MISSION_BONUS = 25;
function todaysMissions(p) {
  const d = (p && p.day && p.day.d) || dayKey(), seed = hashStr(d + who), used = new Set(), out = [];
  MISSIONS.filter(m => m.k !== "trick" || levelOf((p || {}).exp).l >= 2).map(m => ({ m, h: hashStr(m.id + seed) })).sort((a, b) => a.h - b.h).forEach(({ m }) => { if (out.length < 3 && !used.has(m.k)) { used.add(m.k); out.push(m); } });
  return out;
}
function bump(q, k, n = 1) { q.day.m = q.day.m || {}; const m = q.day.m[who] = { ...(q.day.m[who] || {}) }; m[k] = (m[k] || 0) + n; if (k !== "tickle" && k !== "pet") logEv(q, k); }
const mProg = (p, k) => (((((p || {}).day || {}).m || {})[who]) || {})[k] || 0;
const mClaimed = (p, id) => !!((((((p || {}).day || {}).mc || {})[who]) || {})[id]);
function missionsClaimable(p) {
  if (!p || stageOf(p.xp || 0) === 0 || !p.day || p.day.d !== dayKey()) return false;
  return todaysMissions(p).some(m => mProg(p, m.k) >= m.n && !mClaimed(p, m.id));
}
function renderMissions(p, I) {
  const el = $("petMissions"); if (!el) return;
  if (I.si === 0) { el.innerHTML = `<div class="empty">Las misiones empiezan cuando nazca 🐣</div>`; return; }
  const ms = todaysMissions(p), all = ms.every(m => mClaimed(p, m.id));
  el.innerHTML = ms.map(m => {
    const v = Math.min(m.n, mProg(p, m.k)), done = v >= m.n, cl = mClaimed(p, m.id);
    return `<div class="mis ${cl ? "ok" : ""}"><i>${m.e}</i><div class="mtx"><b>${esc(m.t)}</b><div class="bar sm"><div style="width:${Math.round(v / m.n * 100)}%"></div></div><small>${v}/${m.n} · +${m.r} 🪙</small></div>` +
      (cl ? `<span class="chk">✅</span>` : `<button class="btn ${done ? "primary" : ""}" data-mis="${m.id}" ${done ? "" : "disabled"}>${done ? "Cobrar" : "⏳"}</button>`) + `</div>`;
  }).join("") + `<div class="sub" style="font-size:12px;margin-top:8px">${all ? "¡Todas hechas! Mañana hay misiones nuevas 🌟" : `Completa las 3: +${MISSION_BONUS} 🪙 extra y una pegatina 🎁`} · ${esc(name(other()))} tiene las suyas</div>`;
  el.querySelectorAll("[data-mis]").forEach(b => b.onclick = () => claimMission(b.dataset.mis));
}
function claimMission(id) {
  const m = MISSIONS.find(x => x.id === id); let bonus = false, stk = null, lvl = 0;
  petTx(q => {
    if (mProg(q, m.k) < m.n || mClaimed(q, id)) return null;
    q.day.mc = q.day.mc || {}; q.day.mc[who] = { ...(q.day.mc[who] || {}), [id]: true }; q.coins += m.r; lvl = gainExp(q, 10);
    q.day.mb = q.day.mb || {};
    if (todaysMissions(q).every(x => q.day.mc[who][x.id]) && !q.day.mb[who]) { q.day.mb[who] = true; q.coins += MISSION_BONUS; stk = giveSticker(q); bonus = true; }
    return q;
  }).then(r => {
    if (!r) return; buzz(30); coinFx(m.r);
    if (bonus) { confetti(); say(`¡Misiones del día completadas! +${MISSION_BONUS} 🪙 y pegatina ${stk.e}`, 4200); } else say(rnd(["¡Misión cumplida! 🎯", "¡Bien hecho! ⭐", "¡Eso es! 💪"]));
    lvlToast(lvl);
  }).catch(offline);
}

// ---------- Mensajero: el pollito lleva cartas ----------
function sendPost() {
  const p = state.pet || {};
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  if (awayToast()) return;
  if (p.post && p.post.from === who && !p.post.read) return toast(`Tu carta aún no la ha leído ${name(other())} ✉️`);
  const t = prompt(`Escribe una carta para ${name(other())}. ${p.name || "La mascota"} se la llevará volando ✉️`); if (!t || !t.trim()) return;
  petTx(q => { q.post = { from: who, to: other(), text: t.trim().slice(0, 800), at: Date.now(), read: false }; bump(q, "post"); gainExp(q, 5); return q; })
    .then(r => { fx("kite", "✉️", "", 2600); say(`¡Voy volando a llevársela a ${name(other())}! 🕊️`); sendMsg(`✉️ ${r.name || "La mascota"} te trae una carta. Ve a la mascota para leerla 💌`, "pet"); })
    .catch(offline);
}
function replyPost() {
  const post = (state.pet || {}).post; if (!post || post.to !== who) return;
  const t = prompt(`Tu respuesta para ${name(post.from)}:`); if (!t || !t.trim()) return;
  petTx(q => { if (!q.post || q.post.to !== who) return null; Object.assign(q.post, { reply: t.trim().slice(0, 800), replyAt: Date.now(), replyRead: false, read: true }); bump(q, "post"); return q; })
    .then(r => { if (!r) return; $("readView").classList.add("hidden"); fx("kite", "💌", "", 2600); say("¡Se la llevo ahora mismo! 🕊️"); sendMsg(`💌 ${name(who)} ha respondido a tu carta. ¡${r.name || "La mascota"} te la trae!`, "pet"); })
    .catch(offline);
}
function openPost() {
  const p = state.pet || {}, post = p.post; if (!post) return;
  const when = t => fmtDate(t, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (post.to === who) {
    readView({ icon: "💌", title: `Carta de ${name(post.from)}`, sub: `Te la ha traído ${p.name || "la mascota"} · ${when(post.at)}`, text: post.text, nav: post.reply ? "" : `<button class="btn primary" id="postReply">✍️ Responder</button>` });
    const b = $("postReply"); if (b) b.onclick = replyPost;
    if (!post.read) petTx(q => { if (!q.post || q.post.to !== who || q.post.read) return null; q.post.read = true; return q; }).catch(() => {});
  } else if (post.from === who && post.reply) {
    readView({ icon: "💌", title: `Respuesta de ${name(post.to)}`, sub: `A tu carta: “${post.text.slice(0, 60)}${post.text.length > 60 ? "…" : ""}” · ${when(post.replyAt)}`, text: post.reply });
    if (!post.replyRead) petTx(q => { if (!q.post || q.post.replyRead) return null; q.post.replyRead = true; return q; }).catch(() => {});
  }
}
$("petPost").onclick = e => { e.stopPropagation(); openPost(); };

// ---------- Tarjeta de aventuras ----------
function renderAdventures(p, I) {
  const el = $("petAdv"); if (!el) return;
  const away = tripAway(p), back = tripBack(p), post = p.post, o = esc(name(other())), pn = esc(p.name || "la mascota");
  let h = `<div class="advrow"><i>🧳</i><div><b>Excursión</b><small>${away ? `Está en ${esc(away.n)} ${away.e} · vuelve a las ${hhmm(p.trip.until)}` : back ? "¡Ha vuelto! Trae una postal 📮" : `Se va ${TRIP_H} horas a algún sitio del mundo y os trae una postal`}</small></div>` +
    (away ? "" : back ? `<button class="btn primary" id="advClaim">Ver postal</button>` : `<button class="btn" id="advTrip" ${I.si ? "" : "disabled"}>Enviar</button>`) + `</div>`;
  let ps, pb = "";
  if (post && post.to === who && !post.read) { ps = `¡Te trae una carta de ${o}! 💌`; pb = `<button class="btn primary" id="advPost">Leer</button>`; }
  else if (post && post.from === who && post.reply && !post.replyRead) { ps = `${o} te ha respondido 💌`; pb = `<button class="btn primary" id="advPost">Leer</button>`; }
  else if (post && post.to === who && !post.reply) { ps = `Carta de ${o}: “${esc(post.text.slice(0, 40))}${post.text.length > 40 ? "…" : ""}”`; pb = `<button class="btn" id="advPost">Ver</button>`; }
  else if (post && post.from === who && !post.read) { ps = `Tu carta está esperando a que ${o} la lea ✉️`; }
  else { ps = `${pn} le lleva una carta a ${o} volando${post ? ` · <a href="#" id="advLast">ver la última</a>` : ""}`; pb = `<button class="btn" id="advSend" ${I.si ? "" : "disabled"}>Escribir</button>`; }
  h += `<div class="advrow"><i>🕊️</i><div><b>Mensajero</b><small>${ps}</small></div>${pb}</div>`;
  const tr = treasureReady(p);
  h += `<div class="advrow"><i>✨</i><div><b>Tesoro escondido</b><small>${I.si === 0 ? "Cuando nazca buscará tesoros" : away ? "Cuando vuelva de la excursión" : tr ? "¡Hay uno escondido en la escena! Búscalo y tócalo ✨" : "El próximo aparece a las " + hhmm(((p.tre || {})[who] || 0) + treH(p) * 36e5)}</small></div></div>`;
  const ow = otherWx(), k = wxKind();
  h += `<div class="advrow"><i>${WX ? WX_E[k] : "🌦️"}</i><div><b>Tiempo real</b><small>${WX ? `En tu casa: ${WX.temp}° · ${WX_T[k]}` : "La escena tendrá la lluvia, el frío o el calor que haga donde estás"}${ow ? `<br>En casa de ${o}: ${ow.temp}° ${WX_E[wxKindOf(ow.code)]}` : ""}</small></div><button class="btn ${wxOn() ? "" : "primary"}" id="advWx">${wxOn() ? "Quitar" : "Activar"}</button></div>`;
  el.innerHTML = h;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = e => { e.preventDefault(); f(); }; };
  on("advTrip", startTrip); on("advClaim", claimTrip); on("advPost", openPost); on("advSend", sendPost); on("advWx", toggleWeather);
  on("advLast", () => { const q = p.post; readView({ icon: "✉️", title: `Carta de ${name(q.from)}`, sub: fmtDate(q.at), text: q.text + (q.reply ? `\n\n— Respuesta de ${name(q.to)}:\n${q.reply}` : "") }); });
}

// ---------- Colecciones ----------
function renderCollections(p) {
  const el = $("petColl"); if (!el) return;
  const pc = p.postcards || {}, st = p.stickers || {}, nP = DEST.filter(d => pc[d.id]).length, nS = STICKERS.filter(s => st[s.id]).length;
  el.innerHTML = `<div class="slotname" style="margin-top:0">📮 Postales · ${nP}/${DEST.length}</div><div class="coll">${DEST.map(d => pc[d.id] ? `<button class="pcard" data-pc="${d.id}"><i>${d.e}</i><b>${esc(d.n)}</b></button>` : `<div class="pcard lock"><i>?</i><b>???</b></div>`).join("")}</div>
    <div class="slotname">🌟 Pegatinas · ${nS}/${STICKERS.length}${p.stkDone ? " · ¡Álbum completo! 🏆" : ` · álbum completo: +${STK_PRIZE} 🪙`}</div><div class="coll stks">${STICKERS.map(s => st[s.id] ? `<div class="stk on" title="${esc(s.n)}"><i>${s.e}</i>${st[s.id] > 1 ? `<small>x${st[s.id]}</small>` : ""}</div>` : `<div class="stk"><i>?</i></div>`).join("")}</div>
    <div class="sub" style="font-size:12px">Las pegatinas salen en tesoros, excursiones y al completar las misiones del día.</div>`;
  el.querySelectorAll("[data-pc]").forEach(b => b.onclick = () => showPostcard(DESTM[b.dataset.pc]));
}

// ---------- Familia: huevo nuevo al llegar a legendario ----------
function renderFamily(p, I) {
  const el = $("petFam"); if (!el) return;
  const fam = p.family || [], pn = esc(p.name);
  let h = fam.length ? `<div class="album">${fam.map(f => `<div class="alb">${chickSVG(6, "happy", f.wear || {}, 0, f.color, { species: f.species })}<b>${esc(f.name)}</b><small>${esc((SPECIES[f.species] || SPECIES.pollito).n)} · ${f.xp} días</small></div>`).join("")}</div>` : "";
  if (I.si === 6) h += `<div class="sub" style="margin:10px 0 8px">¡${pn} ya es legendario! ✨ Podéis adoptar un huevo nuevo: ${pn} se queda en la familia y vivirá con él en la escena. Se conservan monedas, ropa, muebles, colecciones y nivel.</div><div class="shopgrid">${Object.entries(SPECIES).map(([id, s]) => `<button class="shopit" data-sp="${id}"><i>${s.e}</i><b>${esc(s.n)}</b><span>Adoptar</span></button>`).join("")}</div>`;
  else h += `<div class="sub" style="margin:${fam.length ? "10px" : "0"} 0 0">${fam.length ? "" : "Todavía no hay hermanitos. "}Cuando ${pn} llegue a legendario (${STAGES[6].xp} días cuidándole juntos) podréis adoptar otro huevo: 🐤 pollito, 🐱 gatito, 🐶 perrito, 🐰 conejito o 🐧 pingüino.</div>`;
  el.innerHTML = h;
  el.querySelectorAll("[data-sp]").forEach(b => b.onclick = () => adoptEgg(b.dataset.sp));
}
function adoptEgg(sp) {
  const s = SPECIES[sp], cur = state.pet || {};
  if (!confirm(`¿Adoptar un huevo de ${s.n.toLowerCase()} ${s.e}?\n${cur.name || "Vuestra mascota"} se quedará en la familia para siempre 💛`)) return;
  const nm = ((prompt(`¿Cómo se va a llamar?`, s.n) || s.n).trim() || s.n).slice(0, 24);
  petTx(q => {
    if (stageOf(q.xp) !== 6) return null;
    q.family = [...(q.family || []), { name: q.name || "Pollito", species: q.species || "pollito", color: q.color || "amarillo", wear: q.wear || {}, stage: 6, xp: q.xp, hatchedAt: q.hatchedAt || null, at: Date.now() }];
    Object.assign(q, { name: nm, species: sp, xp: 0, streak: 0, lastBoth: null, care: {}, born: Date.now(), album: { 0: Date.now() }, trait: null, hatchedAt: null, sick: false, curedAt: 0, nap: 0, napStart: 0, wear: {}, color: s.color, bday: {}, trip: null });
    q.owned["color:" + s.color] = true;
    const now = Date.now(); q.n = {}; for (const [k] of NEEDS) q.n[k] = { v: 80, t: now };
    return q;
  }).then(r => {
    if (!r) return; sceneSig = ""; petSig = ""; confetti(); window.scrollTo({ top: 0, behavior: "smooth" });
    say(`¡Un huevo nuevo! ${s.e} Dadle calor los dos para que nazca`, 5000);
    sendMsg(`🥚 ¡Hemos adoptado un huevo de ${s.n.toLowerCase()} ${s.e}! Se llama ${nm}. Dale calor para que nazca`, "pet");
  }).catch(offline);
}

// ---------- Sueños ----------
function dreamText() {
  const p = state.pet || {};
  const L = ["🍓🍓🍓", "💞", `${name("a")} ❤️ ${name("b")}`, "✈️💑", "🌙⭐", "🍰", "🎈🎈", "🤗", "🏖️", "🐑🐑🐑"];
  Object.keys(p.postcards || {}).forEach(id => DESTM[id] && L.push(DESTM[id].e + " " + DESTM[id].n));
  (p.family || []).forEach(f => L.push("💛 " + f.name));
  if (state.main.next && state.main.next > Date.now()) L.push("✈️ ¡Os veis pronto!");
  return "💭 " + rnd(L);
}
setInterval(() => { const d = $("petDream"); if (!d || d.classList.contains("hidden") || document.hidden) return; d.textContent = dreamText(); d.style.animation = "none"; void d.offsetWidth; d.style.animation = ""; }, 4500);

// ---------- Minijuegos: Vuelo y Canta conmigo ----------
const MG = { vuelo: { e: "🪽", n: "Vuelo", max: 20 }, simon: { e: "🎵", n: "Canta conmigo", max: 20 } };
let mg = null;
const recOf = (p, g, w) => ((((p || {}).rec || {})[g]) || {})[w] || 0;
function mgStop() { if (mg) { mg.run = false; cancelAnimationFrame(mg.raf); clearTimeout(mg.tm); } }
function mgOpen(game) {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  if (awayToast()) return;
  mgStop();
  $("fgView").classList.remove("hidden"); document.body.style.overflow = "hidden";
  const cv = $("fgCanvas"), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mg = { game, ctx, W, H, score: 0, run: false, raf: 0, tm: 0 };
  const p = state.pet || {}, oRec = recOf(p, game, other()), mRec = recOf(p, game, who), I = MG[game];
  $("fgScore").textContent = I.e + " 0"; $("fgTime").textContent = `🏆 ${name(other())}: ${oRec}`;
  const how = game === "vuelo" ? "Toca la pantalla para aletear y pasa entre las nubes ☁️" : "Escucha la canción y repítela tocando los corazones en el mismo orden 🎶";
  $("fgMsg").innerHTML = `<div style="font-size:40px">${I.e}</div><b>${I.n}</b><br><span style="font-weight:500">${how}</span><br><small>Tu récord: ${mRec} · ${esc(name(other()))}: ${oRec}</small><button class="btn primary" id="mgGo">¡Empezar!</button>`;
  $("mgGo").onclick = e => { e.stopPropagation(); $("fgMsg").innerHTML = ""; game === "vuelo" ? vlStart() : smStart(); };
  game === "vuelo" ? vlInit() : smInit();
}
function mgClose() { mgStop(); mg = null; $("fgView").classList.add("hidden"); document.body.style.overflow = ""; }
function mgChick(ctx, x, cy, s = 1, open = false) {
  const p = state.pet || {}, C = CAT[p.color] || CAT.amarillo;
  ctx.save(); ctx.translate(x, cy); ctx.scale(s, s);
  ctx.fillStyle = C.dark; ctx.beginPath(); ctx.ellipse(-27, 6, 9, 16, .4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(27, 6, 9, 16, -.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.body; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.belly; ctx.beginPath(); ctx.ellipse(0, 12, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b1a10"; ctx.beginPath(); ctx.arc(-10, -6, 4, 0, Math.PI * 2); ctx.arc(10, -6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff9f1c"; ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(8, 1); ctx.lineTo(0, open ? 13 : 8); ctx.fill();
  ctx.fillStyle = "rgba(255,143,163,.7)"; ctx.beginPath(); ctx.ellipse(-19, 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(19, 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function rr(ctx, x, y, w, h, r) { if (h <= 0 || w <= 0) return; r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }
// Vuelo (como Flappy Bird)
function vlInit() { Object.assign(mg, { y: mg.H * .45, vy: 0, pipes: [], spawn: .3, dead: false }); vlDraw(); }
function vlStart() { mg.run = true; mg.last = performance.now(); mg.vy = -330; mg.raf = requestAnimationFrame(vlLoop); }
function vlLoop(t) {
  if (!mg || !mg.run) return;
  const dt = Math.min(40, t - mg.last) / 1000; mg.last = t;
  const { W, H } = mg, gap = Math.max(150, 215 - mg.score * 3), speed = 150 + Math.min(110, mg.score * 5), bx = W * .3, r = 19;
  mg.vy += 950 * dt; mg.y += mg.vy * dt;
  if (mg.y - r < 0) { mg.y = r; mg.vy = 0; }
  mg.spawn -= dt; if (mg.spawn <= 0) { mg.spawn = 1.6; const top = 50 + Math.random() * Math.max(10, H - 130 - gap); mg.pipes.push({ x: W + 40, top, gap, passed: false }); }
  for (const pp of mg.pipes) {
    pp.x -= speed * dt;
    if (!pp.passed && pp.x + 30 < bx) { pp.passed = true; mg.score++; $("fgScore").textContent = "🪽 " + mg.score; if (navigator.vibrate) navigator.vibrate(10); }
    if (bx + r > pp.x - 30 && bx - r < pp.x + 30 && (mg.y - r < pp.top || mg.y + r > pp.top + pp.gap)) mg.dead = true;
  }
  mg.pipes = mg.pipes.filter(pp => pp.x > -60);
  if (mg.y + r > H - 30) mg.dead = true;
  vlDraw();
  if (mg.dead) { if (navigator.vibrate) navigator.vibrate([40, 40, 40]); mg.run = false; return setTimeout(mgEnd, 400); }
  mg.raf = requestAnimationFrame(vlLoop);
}
function vlDraw() {
  const { ctx, W, H } = mg; ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#7cc95b"; ctx.fillRect(0, H - 30, W, 30);
  for (const pp of mg.pipes) {
    ctx.fillStyle = "#fff"; rr(ctx, pp.x - 30, -20, 60, pp.top + 20, 20); rr(ctx, pp.x - 30, pp.top + pp.gap, 60, H - 30 - pp.top - pp.gap, 20);
    ctx.fillStyle = "rgba(160,200,235,.5)"; rr(ctx, pp.x + 14, -20, 16, pp.top + 20, 8); rr(ctx, pp.x + 14, pp.top + pp.gap, 16, H - 30 - pp.top - pp.gap, 8);
  }
  ctx.save(); ctx.translate(W * .3, mg.y); ctx.rotate(Math.max(-.5, Math.min(.8, mg.vy / 600))); mgChick(ctx, 0, 0, .68, mg.vy < 0); ctx.restore();
}
// Canta conmigo (como Simon)
const SM_PADS = [{ c: "#ff6b8b", e: "❤️", f: 330 }, { c: "#4d9dff", e: "💙", f: 392 }, { c: "#6fdc9a", e: "💚", f: 494 }, { c: "#ffd93b", e: "💛", f: 587 }];
let audioCtx = null;
function tone(f, ms = 280) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime;
    o.type = "triangle"; o.frequency.value = f; g.gain.setValueAtTime(.001, t0); g.gain.exponentialRampToValueAtTime(.3, t0 + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + ms / 1000);
    o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + ms / 1000 + .05);
  } catch (e) {}
}
function smInit() { Object.assign(mg, { seq: [], idx: 0, lit: -1, turn: "" }); smDraw(); }
function smRects() { const { W, H } = mg, s = Math.max(60, Math.min((W - 52) / 2, (H - 250) / 2)), x0 = (W - s * 2 - 12) / 2, y0 = H - s * 2 - 12 - 40; return SM_PADS.map((_, i) => ({ x: x0 + (i % 2) * (s + 12), y: y0 + Math.floor(i / 2) * (s + 12), s })); }
function smDraw() {
  const { ctx, W } = mg; ctx.clearRect(0, 0, W, mg.H);
  const R = smRects(), top = R[0].y;
  mgChick(ctx, W / 2, top / 2 - 4, Math.max(.8, Math.min(1.4, top / 150)), mg.lit >= 0);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (mg.lit >= 0) { ctx.font = "26px system-ui, Apple Color Emoji"; ctx.fillText("🎵", W / 2 + 56, top / 2 - 40); }
  R.forEach((r, i) => { ctx.globalAlpha = mg.lit === i ? 1 : .42; ctx.fillStyle = SM_PADS[i].c; rr(ctx, r.x, r.y, r.s, r.s, 22); ctx.globalAlpha = 1; ctx.font = `${Math.round(r.s * .34)}px system-ui, Apple Color Emoji`; ctx.fillText(SM_PADS[i].e, r.x + r.s / 2, r.y + r.s / 2); });
  ctx.font = "bold 18px system-ui"; ctx.fillStyle = "#3a2330"; ctx.fillText(mg.turn === "show" ? "Escucha… 👂" : mg.turn === "you" ? "¡Tu turno! 🎤" : "", W / 2, top - 16);
}
function smStart() { mg.run = true; mg.seq = []; smNext(); }
function smNext() {
  mg.seq.push(Math.floor(Math.random() * 4)); mg.idx = 0; mg.turn = "show"; mg.lit = -1; smDraw();
  const sp = Math.max(260, 600 - mg.seq.length * 25); let i = 0;
  const step = () => {
    if (!mg || !mg.run) return;
    if (i >= mg.seq.length) { mg.turn = "you"; mg.lit = -1; smDraw(); return; }
    const k = mg.seq[i++]; mg.lit = k; tone(SM_PADS[k].f, sp * .8); smDraw();
    mg.tm = setTimeout(() => { if (!mg) return; mg.lit = -1; smDraw(); mg.tm = setTimeout(step, sp * .35); }, sp);
  };
  mg.tm = setTimeout(step, 700);
}
function smTap(x, y) {
  if (mg.turn !== "you") return;
  const i = smRects().findIndex(r => x >= r.x && x <= r.x + r.s && y >= r.y && y <= r.y + r.s); if (i < 0) return;
  tone(SM_PADS[i].f, 250); mg.lit = i; smDraw(); setTimeout(() => { if (mg && mg.lit === i) { mg.lit = -1; smDraw(); } }, 220);
  if (i !== mg.seq[mg.idx]) { mg.turn = "end"; mg.run = false; if (navigator.vibrate) navigator.vibrate([60, 40, 60]); tone(150, 500); return setTimeout(mgEnd, 600); }
  mg.idx++; if (navigator.vibrate) navigator.vibrate(10);
  if (mg.idx >= mg.seq.length) { mg.score = mg.seq.length; $("fgScore").textContent = "🎵 " + mg.score; mg.turn = "wait"; mg.tm = setTimeout(() => mg && mg.run && smNext(), 700); }
}
$("fgCanvas").addEventListener("pointerdown", e => {
  if (!mg || !mg.run) return; const r = $("fgCanvas").getBoundingClientRect();
  if (mg.game === "vuelo") mg.vy = -330; else smTap(e.clientX - r.left, e.clientY - r.top);
});
function mgEnd() {
  if (!mg) return; mgStop();
  const g = mg.game, score = mg.score, info = MG[g]; let gain = 0, prevO = 0, prevM = 0;
  petTx(p => {
    p.day.mg = p.day.mg || {}; const k = g + "_" + who, got = p.day.mg[k] || 0;
    const gm = setOn(p, "vaquero") ? 1.5 : 1; gain = Math.max(0, Math.min(Math.round(score * 2 * gm), Math.round(info.max * gm) - got)); p.day.mg[k] = got + gain; p.coins += gain;
    p.rec = p.rec || {}; const R = p.rec[g] = { ...(p.rec[g] || {}) }; prevO = R[other()] || 0; prevM = R[who] || 0; R[who] = Math.max(prevM, score);
    bump(p, "game"); if (score > 0) gainExp(p, 4); return p;
  }).then(() => {
    const beat = score > prevO && prevO > 0 && prevM <= prevO, rec = score > prevM;
    $("fgMsg").innerHTML = `<div style="font-size:40px">${beat ? "🏆" : rec ? "🥳" : info.e}</div>${g === "vuelo" ? `Has pasado <b>${score}</b> nube${score === 1 ? "" : "s"}` : `Has repetido <b>${score}</b> nota${score === 1 ? "" : "s"}`}<br>${gain ? `+${gain} 🪙 para la mascota` : score ? "Hoy ya no ganas más monedas aquí" : "¡Casi! Inténtalo otra vez 💪"}<br><small>${rec ? "¡Nuevo récord tuyo! " : ""}${beat ? `¡Has superado a ${esc(name(other()))}! ` : ""}Récords: ${esc(name(who))} ${Math.max(prevM, score)} · ${esc(name(other()))} ${prevO}</small><button class="btn primary" id="mgAgain">Otra vez 🔁</button><button class="btn" id="mgOut">Salir</button>`;
    $("mgAgain").onclick = () => mgOpen(g); $("mgOut").onclick = mgClose;
    if (beat) sendMsg(`🏆 ¡He batido tu récord en ${info.n}: ${score}! ${info.e} Te toca superarlo`, "game");
  }).catch(() => { $("fgMsg").innerHTML = `Puntos: <b>${score}</b><button class="btn" id="mgOut">Salir</button>`; $("mgOut").onclick = mgClose; });
}
function renderGamesPet(p) {
  for (const g of ["vuelo", "simon"]) {
    const el = $("mgInfo_" + g); if (!el) continue;
    const got = (((p.day || {}).mg || {})[g + "_" + who]) || 0;
    el.textContent = (got >= MG[g].max ? `Hoy ya has ganado el máximo (${MG[g].max} 🪙)` : `Hoy puedes ganar ${MG[g].max - got} 🪙 más`) + ` · 🏆 ${name("a")} ${recOf(p, g, "a")} · ${name("b")} ${recOf(p, g, "b")}`;
  }
}
$("vlPlay").onclick = () => mgOpen("vuelo");
$("smPlay").onclick = () => mgOpen("simon");

// =====================================================================
//   v30 · Tienda, niveles y accesorios a lo grande
// =====================================================================
function starP(cx, cy, r) { let d = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; d += (i ? "L" : "M") + (cx + q * Math.cos(a)).toFixed(1) + " " + (cy + q * Math.sin(a)).toFixed(1); } return d + "Z"; }
function spark(x, y, r) { return `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`; }
function shoe(x, c, s, extra = "") { return `<path d="M${x - 12} 178 Q${x - 12} 167 ${x} 167 Q${x + 12} 167 ${x + 13} 177 Q${x + 13} 183 ${x + 7} 183 H${x - 8} Q${x - 12} 183 ${x - 12} 178Z" fill="${c}"/><rect x="${x - 12}" y="181" width="25" height="3" rx="1.5" fill="${s}"/>${extra}`; }
function pair2(f) { return `<g>${f(86)}${f(114)}</g>`; }
// Efectos mágicos (capa de atrás o de delante)
function fxSVG(id, layer) {
  if (!id) return "";
  if (layer === "back") {
    if (id === "fx_aura") return `<defs><radialGradient id="auraG"><stop offset=".5" stop-color="#ffe066" stop-opacity=".8"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient></defs><circle class="fxpulse" cx="100" cy="118" r="88" fill="url(#auraG)"/>`;
    if (id === "fx_arcoiris") return `<g class="fxpulse" fill="none" stroke-width="7" opacity=".9">${["#ff6b8b", "#ffb361", "#ffd93b", "#6fdc9a", "#7fb7ff", "#b48be0"].map((c, i) => `<path d="M${10 + i * 7} 156 A${90 - i * 7} ${90 - i * 7} 0 0 1 ${190 - i * 7} 156" stroke="${c}"/>`).join("")}</g>`;
    return "";
  }
  const P = [[34, 72], [168, 62], [24, 132], [178, 126], [58, 38], [146, 30], [100, 20]];
  if (id === "fx_brillos") return P.map(([x, y], i) => `<path class="fxtw" style="animation-delay:${(i * .33).toFixed(2)}s" d="${spark(x, y, i % 2 ? 7 : 10)}" fill="${i % 3 ? "#fff6b0" : "#fff"}"/>`).join("");
  if (id === "fx_copos") return P.map(([x, y], i) => `<text class="fxtw" style="animation-delay:${(i * .4).toFixed(2)}s" x="${x}" y="${y}" font-size="${i % 2 ? 12 : 16}" text-anchor="middle">❄️</text>`).join("");
  const H = "M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z";
  const X = [30, 170, 48, 152, 20, 180];
  if (id === "fx_corazones") return X.map((x, i) => `<g class="fxup" style="animation-delay:${(i * .5).toFixed(1)}s"><path d="${H}" transform="translate(${x} ${150 - (i % 3) * 20}) scale(${1 + (i % 2) * .5})" fill="${i % 2 ? "#ff3d7f" : "#ff8fb8"}"/></g>`).join("");
  if (id === "fx_burbujas") return X.map((x, i) => `<circle class="fxup" style="animation-delay:${(i * .55).toFixed(2)}s" cx="${x}" cy="${156 - (i % 3) * 18}" r="${5 + (i % 3) * 3}" fill="rgba(200,240,255,.35)" stroke="#fff" stroke-width="1.5"/>`).join("");
  if (id === "fx_notas") return X.map((x, i) => `<text class="fxup" style="animation-delay:${(i * .5).toFixed(1)}s" x="${x}" y="${150 - (i % 3) * 18}" font-size="${16 + (i % 2) * 6}" fill="${["#7b61ff", "#ff5c8a", "#4d9dff"][i % 3]}" font-weight="700" text-anchor="middle">${i % 2 ? "♫" : "♪"}</text>`).join("");
  return "";
}

// ---------- Rarezas, exclusivos y precios ----------
const RAR = [null, { n: "Común", c: "#b8b8c8" }, { n: "Raro", c: "#4d9dff" }, { n: "Épico", c: "#b45cff" }, { n: "Legendario", c: "#ffc629" }];
const rarOf = it => it.r || (it.c <= 80 ? 1 : it.c <= 180 ? 2 : it.c <= 350 ? 3 : 4);
const ownKey = it => (it.cat === "color" ? "color:" + it.id : it.id);
const weekNo = () => Math.floor((Date.now() / 864e5 + 3) / 7);   // semanas que empiezan en lunes
const weekLeft = () => 7 - Math.floor((Date.now() / 864e5 + 3) % 7);
function weeklyItem() { const W = CATALOG.filter(it => it.weekly); return W.length ? W[weekNo() % W.length] : null; }
const SLOT_VB = { head: "30 8 140 100", face: "55 80 90 50", neck: "45 125 110 62", body: "40 108 120 76", feet: "62 150 76 42", hand: "128 48 66 112", back: "0 56 200 114" };
function shopIcon(it) {
  if (it.cat === "color") return `<i class="sw" style="background:${it.pat === "rainbow" ? "linear-gradient(135deg,#ff6b8b,#ffd93b,#6fdc9a,#7fb7ff)" : it.pat === "ice" ? "linear-gradient(135deg,#fff,#c9f0ff 50%,#8fd3ff)" : `linear-gradient(135deg,${it.body} 55%,${it.dark} 55%)`}"></i>`;
  if (it.sw) return `<i class="sw sq" style="background:${it.sw}"></i>`;
  if (it.kind === "furn" && FA[it.id]) return `<i class="fsvg">${furnSVG(it.id, { mode: "day" })}</i>`;
  if (it.slot && SLOT_VB[it.slot]) return `<i class="isvg"><svg data-it="${it.id}" viewBox="${ICON_BB[it.id] || SLOT_VB[it.slot]}"><g class="ic">${it.slot === "body" ? `<defs><clipPath id="icClip"><circle cx="100" cy="116" r="52"/></clipPath></defs><circle cx="100" cy="116" r="52" fill="#ffd93b" opacity=".9"/><ellipse cx="100" cy="136" rx="31" ry="25" fill="#ffec9e"/><g clip-path="url(#icClip)">${itemSVG(it.id)}</g>` : itemSVG(it.id)}</g></svg></i>`;
  return `<i>${it.e || "🎁"}</i>`;
}

// Ajusta cada icono a su dibujo (se calcula una vez cuando se ve en pantalla)
const ICON_BB = {};
function fitIcons(root) {
  if (!root) return;
  root.querySelectorAll("i.isvg svg[data-it]").forEach(svg => {
    const id = svg.dataset.it;
    if (!ICON_BB[id]) {
      const g = svg.querySelector("g.ic"); let b; try { b = g.getBBox(); } catch (e) { return; }
      if (!b || !b.width) return;
      const m = Math.max(b.width, b.height), pad = m * .1, cx = b.x + b.width / 2, cy = b.y + b.height / 2, w = Math.max(b.width, m * .75) + pad * 2, h = Math.max(b.height, m * .75) + pad * 2;
      ICON_BB[id] = [cx - w / 2, cy - h / 2, w, h].map(v => +v.toFixed(1)).join(" ");
    }
    svg.setAttribute("viewBox", ICON_BB[id]);
  });
}

// ---------- Sets con bonus ----------
const SETS = [
  { id: "mago", e: "🧙", n: "Mago", items: ["mago", "tunica", "varita"], d: "+25% de experiencia" },
  { id: "chef", e: "👨‍🍳", n: "Chef", items: ["chef", "delantal", "cuchara"], d: "La comida le llena un 50% más" },
  { id: "pirata", e: "🏴‍☠️", n: "Pirata", items: ["pirata", "chaleco", "espada"], d: "Más suerte en tesoros y cofres" },
  { id: "vaquero", e: "🤠", n: "Vaquero", items: ["vaquero", "panuelo", "botasvaq"], d: "Minijuegos: +50% de monedas" },
  { id: "deporte", e: "🏃", n: "Deportista", items: ["gorra", "sudadera", "zapatillas"], d: "Se cansa la mitad de rápido" },
  { id: "fiesta", e: "🥳", n: "Fiesta", items: ["gorro", "vestido", "globo", "fiesta"], d: "Se aburre la mitad de rápido" },
  { id: "lluvia", e: "☔", n: "Día de lluvia", items: ["gorrolana", "bufanda", "botasagua"], d: "No se pone malito" },
  { id: "playa", e: "🏖️", n: "Playero", items: ["paja", "gafas", "chanclas"], d: "Las excursiones duran la mitad" },
  { id: "heroe", e: "🦸", n: "Superhéroe", items: ["capa", "antifaz", "heroe"], d: "Los mimos valen el doble" },
  { id: "elegante", e: "🎩", n: "Elegante", items: ["chistera", "monoculo", "esmoquin"], d: "10% de descuento en la tienda" },
  { id: "navidad", e: "🎄", n: "Navidad", items: ["papanoel", "jersey", "bufnav"], d: "Un tesoro cada 2 horas" },
  { id: "espacial", e: "🚀", n: "Astronauta", items: ["astronauta", "jetpack"], d: "+50% de experiencia" }
];
const SETM = Object.fromEntries(SETS.map(s => [s.id, s]));
const setOn = (p, id) => !!p && SETM[id].items.every(i => CAT[i] && ((p.wear || {})[CAT[i].slot] === i));
const activeSets = p => SETS.filter(s => setOn(p, s.id));
const expMul = p => 1 + (setOn(p, "mago") ? .25 : 0) + (setOn(p, "espacial") ? .5 : 0);
const needMul = (p, k) => ((k === "fun" && setOn(p, "fiesta")) || (k === "energy" && setOn(p, "deporte")) ? .5 : 1);
const treH = p => (setOn(p, "navidad") ? 2 : 3);
function settle(q) { const now = Date.now(); q.n = q.n || {}; for (const [k] of NEEDS) q.n[k] = { v: Math.round(needNow(q, k, now)), t: now }; }
function announceSets(before, after) {
  const was = new Set(activeSets(before).map(s => s.id)), now = activeSets(after).filter(s => !was.has(s.id));
  if (now.length) { const s = now[0]; setTimeout(() => { confetti(); say(`¡Set ${s.n} completo! ${s.e} ${s.d}`, 4500); }, 700); }
}

// ---------- Cofres sorpresa ----------
const CHESTS = [
  { id: "madera", e: "📦", n: "Cofre de madera", c: 60, odds: [70, 25, 5, 0], col: "#c8925f", dk: "#8a5a38" },
  { id: "plata", e: "🎁", n: "Cofre de plata", c: 160, odds: [20, 50, 25, 5], col: "#d7dde4", dk: "#8e9aa8" },
  { id: "oro", e: "👑", n: "Cofre de oro", c: 360, odds: [0, 20, 50, 30], col: "#ffd23f", dk: "#d49a00" }
];
function chestPool(q) { const m = new Date().getMonth(); return CATALOG.filter(it => (it.slot || it.cat === "color") && !isOwned(q, it) && !it.treasure && !it.lv && !it.req && it.id !== "dorado" && !(it.season && !it.season.includes(m))); }
function rollChest(q, ch) {
  const pool = chestPool(q); if (!pool.length) return null;
  const pickR = () => { let x = Math.random() * 100; for (let i = 0; i < 4; i++) if ((x -= ch.odds[i]) < 0) return i + 1; return 1; };
  let r = pickR(); if (setOn(q, "pirata")) r = Math.max(r, pickR());
  const by = k => pool.filter(it => rarOf(it) === k);
  let c = by(r); for (let d = 1; !c.length && d < 4; d++) c = by(r + d).length ? by(r + d) : by(r - d);
  return rnd(c.flatMap(it => (it.chest ? [it, it, it] : [it])));
}
function chestSVG(ch) {
  return `<svg viewBox="0 0 120 104"><ellipse cx="60" cy="100" rx="52" ry="4" fill="rgba(0,0,0,.25)"/><rect x="10" y="48" width="100" height="50" rx="6" fill="${ch.col}"/><rect x="10" y="62" width="100" height="6" fill="${ch.dk}"/><rect x="24" y="48" width="8" height="50" fill="${ch.dk}" opacity=".55"/><rect x="88" y="48" width="8" height="50" fill="${ch.dk}" opacity=".55"/><g class="lid"><path d="M10 50 Q10 18 60 18 Q110 18 110 50Z" fill="${ch.dk}"/><path d="M16 48 Q16 24 60 24 Q104 24 104 48Z" fill="${ch.col}"/><rect x="24" y="22" width="8" height="28" fill="${ch.dk}" opacity=".55"/><rect x="88" y="22" width="8" height="28" fill="${ch.dk}" opacity=".55"/></g><rect x="51" y="42" width="18" height="22" rx="3" fill="#ffe066" stroke="#c99a00" stroke-width="1.5"/><circle cx="60" cy="52" r="3" fill="#8a5a38"/></svg>`;
}
const chestPrice = ch => priceOf({ id: "_chest", c: ch.c }, []);
function openChest(chId) {
  const ch = CHESTS.find(c => c.id === chId), price = chestPrice(ch); let got = null, refund = 0, fail = false, before = state.pet;
  petTx(q => { if (q.coins < price) { fail = true; return null; } q.coins -= price; got = rollChest(q, ch); refund = 0; if (got) q.owned[ownKey(got)] = true; else { refund = Math.round(price / 2); q.coins += refund; } q.chests = (q.chests || 0) + 1; bump(q, "buy"); return q; })
    .then(r => { if (fail) return toast("No tenéis suficientes monedas 🪙"); if (!r) return; showReveal(ch, got, refund); if (got && rarOf(got) >= 3) sendMsg(`🎁 ¡Nos ha tocado algo ${RAR[rarOf(got)].n.toLowerCase()} en un ${ch.n.toLowerCase()}: ${got.e || "🎨"} ${got.n}!`, "pet"); })
    .catch(offline);
}
// Animación: el cofre tiembla, se abre y aparece la mascota con lo que ha tocado
function showReveal(ch, got, refund, title) {
  const v = $("chestView"), box = $("chestBox"), res = $("chestRes");
  res.classList.add("hidden"); res.innerHTML = ""; v.classList.remove("hidden"); document.body.style.overflow = "hidden";
  box.className = "chestbox" + (ch ? " shake" : ""); box.innerHTML = ch ? chestSVG(ch) : ""; buzz([20, 40, 20, 40]);
  setTimeout(() => {
    box.className = "chestbox open" + (ch ? "" : " nochest"); buzz(60);
    const p = state.pet || {}, si = Math.max(3, stageOf(p.xp || 0)), R = got ? RAR[rarOf(got)] : null, wear = { ...(p.wear || {}) }; let color = p.color;
    if (got && got.slot) wear[got.slot] = got.id; if (got && got.cat === "color") color = got.id;
    res.style.setProperty("--rc", R ? R.c : "#ccc");
    res.innerHTML = got ? `${title ? `<div class="revsub">${esc(title)}</div>` : ""}<div class="rarlbl">${R.n}</div><div class="revpet">${chickSVG(si, "happy", wear, 0, color, { species: p.species })}</div><h3>${got.e || "🎨"} ${esc(got.n)}</h3>${got.slot || got.cat === "color" ? `<div class="row"><button class="btn primary" id="chWear" style="flex:1">Ponérmelo</button><button class="btn" id="chOk" style="flex:1">¡Genial!</button></div>` : `<button class="btn primary" id="chOk">¡Genial!</button>`}`
      : `<div class="rarlbl">¡Lo tenéis todo!</div><h3>Os devuelvo ${refund} 🪙</h3><button class="btn primary" id="chOk">Vale</button>`;
    res.classList.remove("hidden"); if (!got || rarOf(got) >= 3) confetti();
    const close = () => { v.classList.add("hidden"); document.body.style.overflow = ""; };
    $("chOk").onclick = close;
    const w = $("chWear"); if (w) w.onclick = () => { close(); const q = state.pet || {}; if (!isOn(q, got)) shopTap(got.id); };
  }, ch ? 1500 : 200);
}

// ---------- Niveles: camino de premios, títulos, marcos y trucos ----------
const MAX_LVL = 40;
const LV_REWARDS = {
  2: { c: 30, s: "saludar" }, 3: { c: 40, t: "curioso" }, 4: { c: 40, s: "bailar" }, 5: { i: "gafasestrella", f: "madera" },
  6: { c: 50, t: "explorador" }, 7: { ch: "madera", s: "voltereta" }, 8: { c: 60 }, 9: { c: 60, t: "aventurero" }, 10: { i: "fx_aura", f: "bronce", s: "cantar" },
  11: { c: 70 }, 12: { ch: "plata", t: "travieso" }, 13: { c: 80, s: "besito" }, 14: { c: 80 }, 15: { i: "hada", f: "plata", t: "estrella" },
  16: { c: 90, s: "magia" }, 17: { ch: "plata" }, 18: { c: 100, t: "artista" }, 19: { c: 100 }, 20: { i: "astronauta", f: "oro", s: "volar" },
  21: { c: 110 }, 22: { ch: "oro", t: "leyenda" }, 23: { c: 120 }, 24: { c: 120 }, 25: { i: "fx_arcoiris", s: "corazon" },
  26: { c: 130 }, 27: { ch: "oro", t: "superestrella" }, 28: { c: 140 }, 29: { c: 150 }, 30: { i: "dragon", f: "diamante", s: "fuegos", t: "guardian" },
  31: { c: 160 }, 32: { ch: "oro" }, 33: { c: 170 }, 34: { c: 180 }, 35: { i: "heroe", s: "gigante", t: "mitico" },
  36: { c: 200 }, 37: { ch: "oro" }, 38: { c: 220 }, 39: { c: 250 }, 40: { i: "diamante", f: "arcoiris", t: "infinito" }
};
const TITLES = { novato: [1, "Recién llegado"], curioso: [3, "Pequeño curioso"], explorador: [6, "Explorador"], aventurero: [9, "Aventurero"], travieso: [12, "Travieso oficial"], estrella: [15, "Estrella de la casa"], artista: [18, "Artista"], leyenda: [22, "Leyenda del amor"], superestrella: [27, "Superestrella"], guardian: [30, "Guardián de Nosotros"], mitico: [35, "Mítico"], infinito: [40, "Amor infinito ∞"] };
const FRAMES = { ninguno: [1, "Sin marco"], madera: [5, "Madera"], bronce: [10, "Bronce"], plata: [15, "Plata"], oro: [20, "Oro"], diamante: [30, "Diamante"], arcoiris: [40, "Arcoíris"] };
const SKILLS = { saludar: [2, "👋", "Saludar"], bailar: [4, "💃", "Bailar"], voltereta: [7, "🤸", "Voltereta"], cantar: [10, "🎤", "Cantar"], besito: [13, "😘", "Mandar un besito"], magia: [16, "🎩", "Truco de magia"], volar: [20, "🕊️", "Volar"], corazon: [25, "💞", "Lluvia de corazones"], fuegos: [30, "🎆", "Fuegos artificiales"], gigante: [35, "🦖", "Hacerse gigante"] };
function lvText(l) {
  const R = LV_REWARDS[l] || {}, out = [];
  if (R.c) out.push(`${R.c} 🪙`); if (R.ch) out.push(CHESTS.find(c => c.id === R.ch).n.toLowerCase()); if (R.i) out.push(CAT[R.i].n);
  if (R.t) out.push(`título «${TITLES[R.t][1]}»`); if (R.f) out.push(`marco de ${FRAMES[R.f][1].toLowerCase()}`); if (R.s) out.push(`truco: ${SKILLS[R.s][2].toLowerCase()} ${SKILLS[R.s][1]}`);
  return out.join(" · ");
}
let lvScrolled = false;
function renderLevels(p, I) {
  const el = $("lvPath"); if (!el) return;
  const L = I.L.l, got = p.lvc || {}; let h = "";
  for (let l = 2; l <= MAX_LVL; l++) {
    const R = LV_REWARDS[l] || {}, reach = l <= L, claim = reach && (R.c || R.i || R.ch) && !got[l];
    const ic = [R.i ? shopIcon(CAT[R.i]) : "", R.ch ? `<i class="ch">${chestSVG(CHESTS.find(c => c.id === R.ch))}</i>` : "", R.c && !R.i && !R.ch ? `<em>🪙${R.c}</em>` : "", R.s ? `<em>${SKILLS[R.s][1]}</em>` : "", R.t ? `<em>🏷️</em>` : "", R.f ? `<em>🖼️</em>` : ""].join("");
    h += `<div class="lvn ${reach ? "reach" : ""} ${claim ? "claim" : ""} ${l === L ? "cur" : ""} ${R.i || R.ch ? "big" : ""}" data-l="${l}"><b>${l}</b><div class="lvi">${ic}</div>${claim ? `<button class="btn primary" data-lvc="${l}">Recoger</button>` : reach ? `<small>✓</small>` : `<small>🔒</small>`}</div>`;
  }
  el.innerHTML = h; fitIcons(el);
  el.querySelectorAll("[data-lvc]").forEach(b => b.onclick = e => { e.stopPropagation(); claimLevel(+b.dataset.lvc); });
  el.querySelectorAll(".lvn").forEach(n => n.onclick = () => toast(`Nivel ${n.dataset.l}: ${lvText(+n.dataset.l)}`, 3500));
  if (!lvScrolled && el.offsetParent) { const c = el.querySelector(".claim") || el.querySelector(".cur"); if (c) { el.scrollLeft = Math.max(0, c.offsetLeft - 40); lvScrolled = true; } }
  const nClaim = Object.keys(LV_REWARDS).filter(l => +l <= L && (LV_REWARDS[l].c || LV_REWARDS[l].i || LV_REWARDS[l].ch) && !got[l]).length;
  $("lvHead").innerHTML = I.L.max ? `¡Nivel máximo! 👑` : `Nivel ${L} → ${L + 1}: ${esc(lvText(L + 1))}` + (nClaim ? ` · <b style="color:var(--accent)">${nClaim} premio${nClaim > 1 ? "s" : ""} por recoger 🎁</b>` : "");
  $("lvTitles").innerHTML = Object.entries(TITLES).map(([id, [lv, n]]) => lv <= L ? `<button class="tchip ${p.title === id ? "on" : ""}" data-title="${id}">${esc(n)}</button>` : `<span class="tchip lk">🔒 ${esc(n)} · Nv ${lv}</span>`).join("");
  $("lvFrames").innerHTML = Object.entries(FRAMES).map(([id, [lv, n]]) => lv <= L ? `<button class="tchip fchip fr-${id} ${(p.frame || "ninguno") === id ? "on" : ""}" data-frame="${id}">${esc(n)}</button>` : `<span class="tchip lk">🔒 ${esc(n)} · Nv ${lv}</span>`).join("");
  $("lvSkills").innerHTML = Object.entries(SKILLS).map(([id, [lv, e, n]]) => lv <= L ? `<button class="tchip" data-trick="${id}">${e} ${esc(n)}</button>` : `<span class="tchip lk">${e} ${esc(n)} · Nv ${lv}</span>`).join("");
  $("lvTitles").querySelectorAll("[data-title]").forEach(b => b.onclick = () => petTx(q => { q.title = q.title === b.dataset.title ? null : b.dataset.title; return q; }).catch(offline));
  $("lvFrames").querySelectorAll("[data-frame]").forEach(b => b.onclick = () => petTx(q => { q.frame = b.dataset.frame; return q; }).catch(offline));
  $("lvSkills").querySelectorAll("[data-trick]").forEach(b => b.onclick = () => { $("petScene").scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => doTrick(b.dataset.trick), 350); });
}
function claimLevel(l) {
  const R = LV_REWARDS[l]; let got = null, refund = 0;
  petTx(q => {
    q.lvc = q.lvc || {}; if (l > levelOf(q.exp).l || q.lvc[l]) return null; q.lvc[l] = Date.now(); got = null; refund = 0;
    if (R.c) q.coins += R.c; if (R.i) q.owned[ownKey(CAT[R.i])] = true;
    if (R.ch) { got = rollChest(q, CHESTS.find(c => c.id === R.ch)); if (got) q.owned[ownKey(got)] = true; else { refund = 60; q.coins += 60; } }
    return q;
  }).then(r => {
    if (!r) return; buzz([20, 40, 20]);
    if (R.ch) showReveal(CHESTS.find(c => c.id === R.ch), got, refund);
    else if (R.i) showReveal(null, CAT[R.i], 0, `Premio del nivel ${l}`);
    else { confetti(); coinFx(R.c); toast(`+${R.c} 🪙 · premio del nivel ${l}`); }
  }).catch(offline);
}

// ---------- Trucos ----------
function doTrick(id) {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  if (awayToast()) return;
  if (isNapping(state.pet || {})) return say("Zzz… luego te lo enseño 😴");
  if (levelOf((state.pet || {}).exp).l < SKILLS[id][0]) return toast(`Lo aprende en el nivel ${SKILLS[id][0]}`);
  const box = $("petBox"), o = name(other());
  const notes = n => { for (let i = 0; i < n; i++) setTimeout(() => fx("note", rnd(["🎵", "🎶"]), `left:${25 + Math.random() * 50}%`), i * 220); };
  const A = {
    saludar: () => { anim("t-wave", 2000); say(rnd([`¡Hola, ${name(who)}! 👋`, `¡Saluda a ${o} de mi parte! 👋`])); },
    bailar: () => { anim("t-dance", 2600); notes(7); say("💃 ¡A bailar! 🕺"); },
    voltereta: () => { anim("t-flip", 1100); setTimeout(() => say("¡Tachán! 🤸"), 900); },
    cantar: () => { react("happy", 2600); notes(8); [523, 587, 659, 523, 659, 698, 784].forEach((f, i) => setTimeout(() => tone(f, 260), i * 280)); say("🎵 Te quiero, pío pío 🎵"); },
    besito: () => { react("love", 2400); fx("kiss", "💋", "", 1700); hearts(box, "💕"); say(`¡Un besito para ${o}! 😘`); },
    magia: () => { fx("poof", "💨", "", 1000); anim("t-vanish", 1700); setTimeout(() => { for (let i = 0; i < 8; i++) fx("burst", "✨", `left:${30 + Math.random() * 40}%;top:${30 + Math.random() * 40}%`, 1200); }, 800); say("¡Abracadabra! 🎩✨"); },
    volar: () => { anim("t-fly", 2800); say("¡Miradme, vuelo! 🕊️"); },
    corazon: () => { for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); setTimeout(() => fx("hpop", "💗", `left:calc(50% + ${(x * 6).toFixed(0)}px);top:calc(38% + ${(y * 6).toFixed(0)}px)`, 2200), i * 60); } react("love", 2600); say(`💞 Para ${name("a")} y ${name("b")}`); },
    fuegos: () => { for (let i = 0; i < 9; i++) setTimeout(() => { fx("burst", rnd(["🎆", "🎇", "✨", "💥"]), `left:${10 + Math.random() * 75}%;top:${8 + Math.random() * 40}%`, 1400); buzz(15); }, i * 260); say("¡Fuegos artificiales! 🎆"); },
    gigante: () => { anim("t-giant", 2600); say("¡Soy GIGANTE! 🦖"); }
  };
  A[id](); buzz(30);
  let lvl = 0;
  petTx(q => { q.day.tr = q.day.tr || {}; const k = who + "_" + id; if (!q.day.tr[k]) { q.day.tr[k] = 1; lvl = gainExp(q, 5); setNeed(q, "fun", 8); } bump(q, "trick"); return q; }).then(() => lvlToast(lvl)).catch(() => {});
}
function openTricks() {
  const p = state.pet || {}, L = levelOf(p.exp).l;
  openSheet("🎪 Trucos", `<div class="shopgrid">${Object.entries(SKILLS).map(([id, [lv, e, n]]) => lv <= L ? `<button class="shopit" data-trick="${id}"><i>${e}</i><b>${esc(n)}</b><span>¡Hazlo!</span></button>` : `<button class="shopit locked" disabled><i>${e}</i><b>${esc(n)}</b><span>🔒 Nivel ${lv}</span></button>`).join("")}</div><div class="sub" style="font-size:12px">Aprende trucos nuevos al subir de nivel. El primero de cada truco al día da experiencia ⭐</div>`);
  $("sheetBody").querySelectorAll("[data-trick]").forEach(b => b.onclick = () => { closeSheet(); doTrick(b.dataset.trick); });
}

// ---------- Armario: conjuntos guardados y sets ----------
function saveOutfit() {
  const p = state.pet || {};
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  if ((p.outfits || []).length >= 8) return toast("Máximo 8 conjuntos. Borra alguno");
  const n = prompt("¿Cómo se llama este conjunto?", `Conjunto ${(p.outfits || []).length + 1}`); if (!n || !n.trim()) return;
  petTx(q => { q.outfits = [...(q.outfits || []), { n: n.trim().slice(0, 20), wear: { ...(q.wear || {}) }, color: q.color || "amarillo" }]; return q; }).then(() => toast("Conjunto guardado 👗")).catch(offline);
}
function dressWith(wear, color, label) {
  if (awayToast()) return;
  const before = state.pet;
  petTx(q => { settle(q); const w = {}; for (const [s, id] of Object.entries(wear || {})) if (id && CAT[id] && isOwned(q, CAT[id])) w[s] = id; q.wear = w; if (color && CAT[color] && isOwned(q, CAT[color])) q.color = color; bump(q, "dress"); return q; })
    .then(r => { preview = null; react("happy", 2200); say(label, 3000); announceSets(before, r); }).catch(offline);
}
function renderWardrobe(p) {
  const si = Math.max(3, stageOf(p.xp || 0)), outs = p.outfits || [];
  let h = `<div class="slotname" style="margin-top:4px">👗 Tus conjuntos</div>`;
  h += outs.length ? `<div class="outfits">${outs.map((o, i) => `<div class="outfit"><button class="outwear" data-out="${i}">${chickSVG(si, "happy", o.wear || {}, 0, o.color, { species: p.species })}<b>${esc(o.n)}</b></button><button class="outdel" data-odel="${i}">✕</button></div>`).join("")}</div>` : `<div class="empty" style="font-size:14px">Aún no hay conjuntos. Vístele como más te guste y guárdalo aquí para ponérselo con un toque.</div>`;
  h += `<button class="btn mt" style="width:100%" id="outSave">💾 Guardar lo que lleva puesto</button>`;
  h += `<div class="slotname">✨ Sets con bonus <small>(llevar todas las piezas a la vez)</small></div>`;
  h += SETS.map(s => {
    const on = setOn(p, s.id), own = s.items.every(i => isOwned(p, CAT[i]));
    return `<div class="setrow ${on ? "on" : ""}"><div class="sethead"><b>${s.e} ${esc(s.n)}</b>${on ? `<span class="setact">ACTIVO</span>` : ""}</div><small>${esc(s.d)}</small><div class="setpcs">${s.items.map(i => { const it = CAT[i], ow = isOwned(p, it), w = (p.wear || {})[it.slot] === i; return `<button class="pc ${ow ? "own" : ""} ${w ? "worn" : ""}" data-id="${i}" title="${esc(it.n)}">${shopIcon(it)}${ow ? "" : "<u>🔒</u>"}</button>`; }).join("")}${own && !on ? `<button class="btn primary" data-seton="${s.id}">Ponérmelo</button>` : ""}</div></div>`;
  }).join("");
  return h;
}
function bindWardrobe() {
  const B = $("shopBody"), p = state.pet || {};
  B.querySelectorAll("[data-out]").forEach(b => b.onclick = () => { const o = (p.outfits || [])[+b.dataset.out]; if (o) dressWith(o.wear, o.color, `¡Me pongo «${o.n}»! 😎`); });
  B.querySelectorAll("[data-odel]").forEach(b => b.onclick = () => { if (confirm("¿Borrar este conjunto?")) petTx(q => { q.outfits = (q.outfits || []).filter((_, k) => k !== +b.dataset.odel); return q; }).catch(offline); });
  B.querySelectorAll(".setpcs [data-id]").forEach(b => b.onclick = () => shopTap(b.dataset.id));
  B.querySelectorAll("[data-seton]").forEach(b => b.onclick = () => { const s = SETM[b.dataset.seton], w = { ...(p.wear || {}) }; for (const i of s.items) w[CAT[i].slot] = i; dressWith(w, null, `¡Set ${s.n} puesto! ${s.e}`); });
  const sv = $("outSave"); if (sv) sv.onclick = saveOutfit;
}
function renderChests(p, coins) {
  const pool = chestPool(p), ex = pool.filter(it => it.chest).length;
  return `<div class="chests">${CHESTS.map(c => `<div class="chest"><div class="chimg">${chestSVG(c)}</div><b>${c.n}</b><small>${c.odds.map((o, i) => (o ? `<span style="color:${RAR[i + 1].c}">${RAR[i + 1].n} ${o}%</span>` : "")).filter(Boolean).join("<br>")}</small><button class="btn primary" data-chest="${c.id}" ${coins >= chestPrice(c) ? "" : "disabled"}>${chestPrice(c)} 🪙</button></div>`).join("")}</div>
    <div class="sub" style="font-size:12px">🎁 Sale un accesorio, efecto o color que aún no tengáis (${pool.length} por descubrir, ${ex} solo salen en cofres). Si ya lo tenéis todo, os devuelve la mitad.${setOn(p, "pirata") ? " 🏴‍☠️ Set pirata: ¡más suerte!" : ""}</div>`;
}
function goShop(tab) { shopTab = tab; ls.set("shopTab", tab); preview = null; sceneSig = ""; setPetSeg("shop"); $("shopCard").scrollIntoView({ behavior: "smooth" }); }
$("petTricks").onclick = openTricks;
$("petWard").onclick = () => goShop("armario");
$("petChests").onclick = () => goShop("cofres");

// ---------- Muebles dibujados (mismo estilo que la mascota) ----------
// t: floor (en el suelo, con sombra y perspectiva) | wall (colgado) | shelf (sobre una baldita) ; p: posición por defecto {x: centro %, y: base %}
const petals = (cx, cy, r, n, col) => { let s = ""; for (let i = 0; i < n; i++) s += `<ellipse cx="${cx}" cy="${cy - r}" rx="${r * .38}" ry="${r * .62}" fill="${col}" transform="rotate(${i * 360 / n} ${cx} ${cy})"/>`; return s; };
const FA = {
  alfombra: { t: "floor", flat: 1, w: 230, h: 40, p: { x: 50, y: 98 }, d: () => `<ellipse cx="115" cy="20" rx="113" ry="19" fill="#8e6cc8"/><ellipse cx="115" cy="20" rx="100" ry="14" fill="#b48be0"/><ellipse cx="115" cy="20" rx="76" ry="9" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="7 6" opacity=".55"/>` },
  sofa: { t: "floor", w: 150, h: 82, p: { x: 80, y: 90 }, d: () => `<rect x="12" y="8" width="126" height="46" rx="16" fill="#5b8def"/><rect x="18" y="10" width="114" height="9" rx="4.5" fill="#8fb5ff" opacity=".6"/><rect x="26" y="20" width="30" height="24" rx="8" fill="#ffd166" transform="rotate(-8 41 32)"/><rect x="94" y="20" width="30" height="24" rx="8" fill="#ff8fab" transform="rotate(8 109 32)"/><rect x="16" y="42" width="118" height="24" rx="9" fill="#7aa6ff"/><path d="M75 44 V64" stroke="#5b8def" stroke-width="2"/><rect x="0" y="32" width="24" height="40" rx="11" fill="#4a78d6"/><rect x="126" y="32" width="24" height="40" rx="11" fill="#4a78d6"/><rect x="6" y="62" width="138" height="12" rx="5" fill="#3f67bd"/><rect x="16" y="74" width="7" height="8" rx="2" fill="#6b4a2f"/><rect x="127" y="74" width="7" height="8" rx="2" fill="#6b4a2f"/>` },
  cama: { t: "floor", w: 170, h: 92, p: { x: 20, y: 92 }, d: () => `<rect x="0" y="4" width="22" height="84" rx="9" fill="#a86f45"/><rect x="4" y="12" width="14" height="30" rx="5" fill="#c08457"/><rect x="8" y="56" width="158" height="24" rx="6" fill="#c08457"/><rect x="14" y="40" width="150" height="20" rx="9" fill="#fffaf2"/><rect x="22" y="29" width="38" height="18" rx="9" fill="#eef0ff"/><path d="M66 36 H158 Q166 36 166 44 V66 H66 Z" fill="#ff8fab"/><rect x="66" y="36" width="14" height="30" fill="#ff6f93"/><path d="M92 47 h58 M92 56 h58" stroke="#ffb3c6" stroke-width="3" stroke-linecap="round"/><rect x="158" y="44" width="12" height="44" rx="5" fill="#a86f45"/><rect x="10" y="80" width="7" height="12" rx="2" fill="#8a5a38"/><rect x="150" y="80" width="7" height="12" rx="2" fill="#8a5a38"/>` },
  lampara: { t: "floor", w: 56, h: 150, p: { x: 66, y: 68 }, d: o => `${o.mode === "night" && o.lit ? `<ellipse cx="28" cy="30" rx="30" ry="26" fill="#fff3b0" opacity=".45"/>` : ""}<ellipse cx="28" cy="146" rx="18" ry="4.5" fill="#4a4a55"/><rect x="26" y="42" width="4" height="104" fill="#8a8a96"/><path d="M8 46 L18 6 H38 L48 46 Z" fill="#ffe29a"/><path d="M8 46 L18 6 H24 L16 46 Z" fill="#fff3c9" opacity=".7"/><rect x="6" y="44" width="44" height="5" rx="2.5" fill="#f2c35a"/>` },
  planta: { t: "floor", w: 70, h: 100, p: { x: 7, y: 80 }, d: () => `<g fill="#3fa34d"><ellipse cx="35" cy="30" rx="9" ry="26"/><ellipse cx="20" cy="40" rx="8" ry="22" transform="rotate(-35 20 40)"/><ellipse cx="50" cy="40" rx="8" ry="22" transform="rotate(35 50 40)"/></g><g fill="#2d8a3e"><ellipse cx="12" cy="54" rx="7" ry="18" transform="rotate(-60 12 54)"/><ellipse cx="58" cy="54" rx="7" ry="18" transform="rotate(60 58 54)"/><ellipse cx="35" cy="46" rx="5" ry="16"/></g><path d="M17 64 H53 L47 98 H23 Z" fill="#d9774b"/><rect x="13" y="60" width="44" height="9" rx="3" fill="#e8895a"/><path d="M24 70 L27 96" stroke="#c4653c" stroke-width="3" opacity=".5"/>` },
  estanteria: { t: "floor", w: 84, h: 126, p: { x: 13, y: 72 }, d: () => `<rect x="0" y="0" width="84" height="122" rx="4" fill="#a86f45"/><rect x="6" y="6" width="72" height="110" fill="#6e4429"/><rect x="6" y="42" width="72" height="5" fill="#a86f45"/><rect x="6" y="80" width="72" height="5" fill="#a86f45"/><rect x="9" y="16" width="8" height="26" fill="#ef476f"/><rect x="18" y="12" width="9" height="30" fill="#ffd166"/><rect x="28" y="18" width="7" height="24" fill="#06d6a0"/><rect x="36" y="14" width="10" height="28" fill="#118ab2"/><rect x="48" y="22" width="6" height="20" fill="#f78c6b" transform="rotate(-14 51 42)"/><circle cx="68" cy="35" r="7" fill="#9b5de5"/><rect x="9" y="52" width="10" height="28" fill="#8338ec"/><rect x="20" y="56" width="8" height="24" fill="#ff8fab"/><rect x="29" y="50" width="9" height="30" fill="#3a86ff"/><path d="M54 80 v-10 a9 9 0 0 1 18 0 v10 z" fill="#d9774b"/><ellipse cx="63" cy="60" rx="9" ry="8" fill="#3fa34d"/><rect x="10" y="92" width="26" height="24" rx="2" fill="#d9a066"/><rect x="42" y="88" width="8" height="28" fill="#ffd166"/><rect x="51" y="90" width="8" height="26" fill="#ef476f"/><rect x="60" y="86" width="9" height="30" fill="#06d6a0"/><rect x="2" y="120" width="8" height="6" fill="#8a5a38"/><rect x="74" y="120" width="8" height="6" fill="#8a5a38"/>` },
  tele: { t: "floor", w: 116, h: 104, p: { x: 83, y: 74 }, d: o => `<rect x="4" y="70" width="108" height="30" rx="5" fill="#a86f45"/><rect x="10" y="76" width="46" height="18" rx="3" fill="#8a5a38"/><rect x="60" y="76" width="46" height="18" rx="3" fill="#8a5a38"/><circle cx="50" cy="85" r="2" fill="#ffd166"/><circle cx="66" cy="85" r="2" fill="#ffd166"/><rect x="10" y="100" width="6" height="4" fill="#6b4a2f"/><rect x="100" y="100" width="6" height="4" fill="#6b4a2f"/><rect x="52" y="58" width="12" height="12" fill="#333"/><rect x="40" y="66" width="36" height="4" rx="2" fill="#333"/><rect x="8" y="2" width="100" height="58" rx="6" fill="#222"/><rect x="13" y="7" width="90" height="48" rx="3" fill="${o.mode === "night" ? "#2a3a7a" : "#4d9dff"}"/><path d="M13 40 Q40 28 60 40 T103 36 V55 H13Z" fill="#6fdc9a"/><circle cx="84" cy="20" r="6" fill="${o.mode === "night" ? "#fff" : "#ffd93b"}"/><path d="M13 7 L50 7 L30 55 L13 55Z" fill="#fff" opacity=".12"/>` },
  piano: { t: "floor", w: 124, h: 104, p: { x: 22, y: 76 }, d: () => { let k = ""; for (let i = 1; i < 15; i++) k += `<path d="M${2 + i * 8} 50 V66" stroke="#ccc" stroke-width="1"/>`; for (const i of [1, 2, 4, 5, 6, 8, 9, 11, 12, 13]) k += `<rect x="${i * 8 - .5}" y="50" width="5" height="9" fill="#15151c"/>`;
    return `<rect x="0" y="0" width="124" height="54" rx="6" fill="#2b2b36"/><rect x="6" y="6" width="112" height="30" rx="3" fill="#3a3a48"/><g transform="rotate(-4 62 20)"><rect x="48" y="9" width="28" height="22" fill="#fff"/><path d="M52 15 h20 M52 20 h20 M52 25 h14" stroke="#999" stroke-width="1.2"/></g><rect x="2" y="50" width="120" height="16" rx="2" fill="#fff"/>${k}<rect x="4" y="66" width="116" height="26" rx="3" fill="#2b2b36"/><rect x="8" y="92" width="8" height="12" fill="#1c1c24"/><rect x="108" y="92" width="8" height="12" fill="#1c1c24"/><rect x="56" y="96" width="12" height="4" rx="2" fill="#c9a227"/>`; } },
  pecera: { t: "floor", w: 84, h: 108, p: { x: 88, y: 78 }, d: () => `<rect x="10" y="66" width="64" height="42" rx="4" fill="#8a5a38"/><rect x="16" y="74" width="52" height="26" rx="3" fill="#a86f45"/><rect x="2" y="4" width="80" height="62" rx="8" fill="#bfe9ff" opacity=".9"/><rect x="6" y="14" width="72" height="48" rx="5" fill="#4db8ec"/><rect x="6" y="52" width="72" height="10" rx="4" fill="#f2d49b"/><path d="M20 58 Q16 42 22 30 M26 58 Q30 44 26 36" stroke="#2d8a3e" stroke-width="4" fill="none" stroke-linecap="round"/><g class="fishsw"><ellipse cx="50" cy="32" rx="10" ry="6" fill="#ff8c42"/><path d="M59 32 L68 26 L68 38Z" fill="#ff8c42"/><circle cx="46" cy="30" r="1.6" fill="#222"/></g><circle cx="40" cy="22" r="2.5" fill="#fff" opacity=".7"/><circle cx="43" cy="17" r="1.8" fill="#fff" opacity=".7"/><rect x="2" y="4" width="80" height="6" rx="3" fill="#8fd3ff"/>` },
  arbolnav: { t: "floor", w: 96, h: 128, p: { x: 28, y: 78 }, d: () => `<rect x="40" y="96" width="16" height="12" fill="#8a5a38"/><path d="M28 104 H68 L62 128 H34Z" fill="#d62828"/><path d="M48 40 L92 100 H4Z" fill="#2d8a3e"/><path d="M48 22 L82 70 H14Z" fill="#3fa34d"/><path d="M48 8 L72 46 H24Z" fill="#52b95f"/><path d="M18 90 Q48 76 80 92 M26 62 Q48 52 70 64" stroke="#ffd166" stroke-width="3" fill="none"/>${[[30, 92, "#e63946"], [64, 86, "#4d9dff"], [48, 72, "#ffd93b"], [34, 66, "#ff8fab"], [60, 56, "#e63946"], [44, 38, "#4d9dff"], [76, 96, "#ffd93b"]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}"/>`).join("")}<path d="M48 0 L52 9 L62 9 L54 15 L57 24 L48 18 L39 24 L42 15 L34 9 L44 9Z" fill="#ffd23f"/>` },
  fogon: { t: "floor", w: 116, h: 118, p: { x: 15, y: 78 }, d: () => `<path class="steam" d="M72 16 q-5 -6 0 -12 M86 16 q5 -6 0 -12" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/><rect x="62" y="20" width="38" height="20" rx="4" fill="#e63946"/><rect x="58" y="18" width="46" height="5" rx="2.5" fill="#c1121f"/><rect x="100" y="26" width="10" height="4" rx="2" fill="#c1121f"/><ellipse cx="28" cy="38" rx="16" ry="4" fill="#2b2b36"/><rect x="42" y="36" width="16" height="3" rx="1.5" fill="#2b2b36"/><ellipse cx="28" cy="36" rx="7" ry="2.5" fill="#fff"/><circle cx="28" cy="35.5" r="2" fill="#ffc300"/><rect x="0" y="40" width="116" height="8" rx="3" fill="#bfb6aa"/><rect x="2" y="46" width="112" height="68" rx="4" fill="#f4f1ec"/>${[18, 32, 84, 98].map(x => `<circle cx="${x}" cy="55" r="4" fill="#3a3a44"/>`).join("")}<rect x="12" y="62" width="92" height="46" rx="5" fill="#3a3a44"/><rect x="20" y="70" width="76" height="24" rx="3" fill="#6b6b78"/><rect x="20" y="70" width="76" height="6" fill="#8a8a96"/><rect x="44" y="98" width="28" height="4" rx="2" fill="#bfb6aa"/><rect x="6" y="114" width="8" height="4" fill="#8a8a96"/><rect x="102" y="114" width="8" height="4" fill="#8a8a96"/>` },
  globos: { t: "floor", w: 70, h: 104, p: { x: 34, y: 67 }, d: () => `<path d="M20 40 Q26 70 35 96 M36 36 Q36 70 35 96 M52 42 Q44 70 35 96" stroke="#9a9a9a" stroke-width="1.5" fill="none"/><ellipse cx="20" cy="24" rx="15" ry="18" fill="#ff5c8a"/><ellipse cx="52" cy="26" rx="15" ry="18" fill="#4d9dff"/><ellipse cx="36" cy="18" rx="15" ry="18" fill="#ffd93b"/><ellipse cx="14" cy="16" rx="4" ry="6" fill="#fff" opacity=".45"/><ellipse cx="30" cy="10" rx="4" ry="6" fill="#fff" opacity=".45"/><ellipse cx="46" cy="18" rx="4" ry="6" fill="#fff" opacity=".45"/><rect x="29" y="94" width="12" height="10" rx="2" fill="#9b5de5"/>` },
  girasol: { t: "floor", w: 64, h: 112, p: { x: 93, y: 94 }, d: () => `<path d="M32 76 Q30 46 20 28 M32 76 Q36 50 46 38" stroke="#2d8a3e" stroke-width="4" fill="none"/><ellipse cx="22" cy="58" rx="9" ry="5" fill="#3fa34d" transform="rotate(-30 22 58)"/><ellipse cx="42" cy="62" rx="9" ry="5" fill="#3fa34d" transform="rotate(30 42 62)"/>${petals(20, 26, 12, 12, "#ffd23f")}<circle cx="20" cy="26" r="7" fill="#6b3f1f"/>${petals(46, 36, 10, 12, "#ffc300")}<circle cx="46" cy="36" r="6" fill="#6b3f1f"/><path d="M14 80 H50 L45 110 H19Z" fill="#4d9dff"/><rect x="10" y="76" width="44" height="8" rx="3" fill="#6fb4ec"/>` },
  sombrilla: { t: "floor", w: 120, h: 136, p: { x: 84, y: 88 }, d: () => { const xs = [4, 32, 60, 88, 116]; let w = ""; for (let i = 0; i < 4; i++) w += `<path d="M60 6 L${xs[i]} 46 Q${(xs[i] + xs[i + 1]) / 2} 38 ${xs[i + 1]} 46 Z" fill="${i % 2 ? "#fff" : "#e63946"}"/>`;
    return `<rect x="58" y="30" width="4" height="102" fill="#8a8a96" transform="rotate(4 60 80)"/>${w}<circle cx="60" cy="6" r="3.5" fill="#e63946"/><ellipse cx="64" cy="132" rx="14" ry="4" fill="#666"/>`; } },
  piscina: { t: "floor", flat: 1, w: 180, h: 56, p: { x: 76, y: 99 }, d: () => `<ellipse cx="90" cy="30" rx="88" ry="25" fill="#e8f7ff"/><ellipse cx="90" cy="31" rx="78" ry="19" fill="#3fb5e8"/><ellipse cx="90" cy="28" rx="70" ry="13" fill="#6fd0f5"/><path d="M50 28 q8 -4 16 0 M104 33 q8 -4 16 0 M78 21 q6 -3 12 0" stroke="#fff" stroke-width="2" fill="none" opacity=".75"/><g class="bob"><circle cx="58" cy="26" r="6" fill="#ffd93b"/><circle cx="63" cy="20" r="4" fill="#ffd93b"/><path d="M66 20 l5 1 -5 2z" fill="#ff9f1c"/><circle cx="64" cy="19" r="1" fill="#222"/></g><path d="M150 6 V30 M160 6 V30 M150 14 H160 M150 22 H160" stroke="#b0b8c0" stroke-width="3" stroke-linecap="round"/>` },
  fuente: { t: "floor", w: 96, h: 104, p: { x: 16, y: 90 }, d: () => `<ellipse cx="48" cy="92" rx="46" ry="12" fill="#b8c2cc"/><ellipse cx="48" cy="88" rx="40" ry="7" fill="#6fd0f5"/><rect x="42" y="44" width="12" height="44" fill="#c9d2da"/><ellipse cx="48" cy="46" rx="24" ry="6" fill="#b8c2cc"/><ellipse cx="48" cy="44" rx="20" ry="4" fill="#6fd0f5"/><rect x="45" y="22" width="6" height="22" fill="#c9d2da"/><path class="water" d="M48 20 Q30 12 26 44 M48 20 Q66 12 70 44 M26 48 Q14 60 12 86 M70 48 Q82 60 84 86" stroke="#9fe0ff" stroke-width="3" fill="none" opacity=".9"/><circle cx="48" cy="18" r="4" fill="#9fe0ff"/>` },
  // En la pared
  cuadro: { t: "wall", w: 80, h: 64, p: { x: 23, y: 40 }, d: o => `<rect x="0" y="0" width="80" height="64" rx="4" fill="#8a5a38"/><rect x="5" y="5" width="70" height="54" fill="#fffaf2"/>${o.photo ? `<image href="${o.photo}" x="10" y="10" width="60" height="44" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="10" y="10" width="60" height="44" fill="#ffd6e2"/><path d="M40 44 C24 34 26 20 34 20 C38 20 40 24 40 26 C40 24 42 20 46 20 C54 20 56 34 40 44Z" fill="#ff5c8a"/>`}` },
  ventana: { t: "wall", w: 96, h: 90, p: { x: 75, y: 44 }, d: o => { const n = o.mode === "night", d = o.mode === "dawn";
    return `<rect x="10" y="6" width="76" height="74" rx="4" fill="#fff"/><rect x="15" y="11" width="66" height="64" fill="${n ? "#1b2350" : d ? "#ffb38a" : "#9fdcff"}"/>${n ? `<circle cx="62" cy="26" r="7" fill="#fff6c2"/><circle cx="66" cy="23" r="6" fill="#1b2350"/><circle cx="30" cy="22" r="1.5" fill="#fff"/><circle cx="40" cy="56" r="1.2" fill="#fff"/><circle cx="68" cy="60" r="1.5" fill="#fff"/>` : `<circle cx="62" cy="26" r="8" fill="#ffd93b"/><ellipse cx="34" cy="56" rx="12" ry="6" fill="#fff" opacity=".9"/><ellipse cx="42" cy="52" rx="8" ry="6" fill="#fff" opacity=".9"/>`}<path d="M48 11 V75 M15 43 H81" stroke="#fff" stroke-width="4"/><rect x="6" y="76" width="84" height="7" rx="3" fill="#e8e2dc"/><path d="M4 3 H30 Q22 44 30 88 H4Z" fill="#ff8fab"/><path d="M92 3 H66 Q74 44 66 88 H92Z" fill="#ff8fab"/><path d="M12 8 Q10 44 12 84 M84 8 Q86 44 84 84" stroke="#ff6f93" stroke-width="2" fill="none"/><rect x="0" y="0" width="96" height="5" rx="2.5" fill="#a86f45"/>`; } },
  reloj: { t: "wall", w: 50, h: 50, p: { x: 58, y: 20 }, d: () => { const t = new Date(), h = (t.getHours() % 12 + t.getMinutes() / 60) * 30, m = t.getMinutes() * 6; let k = ""; for (let i = 0; i < 12; i++) k += `<path d="M25 7 V${i % 3 ? 9 : 11}" stroke="#8a6f5a" stroke-width="2" transform="rotate(${i * 30} 25 25)"/>`;
    return `<circle cx="25" cy="25" r="24" fill="#a86f45"/><circle cx="25" cy="25" r="19" fill="#fffaf2"/>${k}<path d="M25 25 V14" stroke="#2b1a10" stroke-width="3" stroke-linecap="round" transform="rotate(${h} 25 25)"/><path d="M25 25 V9" stroke="#2b1a10" stroke-width="2" stroke-linecap="round" transform="rotate(${m} 25 25)"/><circle cx="25" cy="25" r="2.2" fill="#e63946"/>`; } },
  espejo: { t: "wall", w: 52, h: 80, p: { x: 42, y: 40 }, d: () => `<ellipse cx="26" cy="40" rx="25" ry="39" fill="#e0b84a"/><ellipse cx="26" cy="40" rx="19" ry="33" fill="#cfe9f7"/><path d="M14 30 Q16 16 26 11" stroke="#fff" stroke-width="4" fill="none" opacity=".85" stroke-linecap="round"/><path d="M14 42 Q13 38 14 35" stroke="#fff" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>` },
  // Sobre una baldita
  frutero: { t: "shelf", w: 56, h: 36, p: { x: 12, y: 50 }, d: () => `<circle cx="18" cy="17" r="9" fill="#e63946"/><circle cx="34" cy="15" r="9" fill="#ff9f1c"/><circle cx="26" cy="9" r="7" fill="#9bd65b"/><path d="M36 18 Q46 4 54 10 Q46 12 40 22Z" fill="#ffe066"/><path d="M3 19 H51 Q47 36 27 36 Q7 36 3 19Z" fill="#b5835a"/><path d="M8 24 H46" stroke="#8a5a38" stroke-width="2"/>` },
  tetera: { t: "shelf", w: 60, h: 42, p: { x: 88, y: 50 }, d: () => `<path d="M42 28 Q52 22 55 11" stroke="#3a7fd6" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M14 16 Q0 24 11 35" stroke="#3a7fd6" stroke-width="5" fill="none"/><ellipse cx="28" cy="27" rx="18" ry="14" fill="#4d9dff"/><rect x="18" y="11" width="20" height="6" rx="3" fill="#3a7fd6"/><circle cx="28" cy="8" r="3" fill="#3a7fd6"/><circle cx="22" cy="26" r="2.5" fill="#fff" opacity=".7"/><circle cx="30" cy="30" r="2.5" fill="#fff" opacity=".7"/><circle cx="36" cy="23" r="2.5" fill="#fff" opacity=".7"/><rect x="14" y="38" width="28" height="4" rx="2" fill="#3a7fd6"/>` },
  velas: { t: "shelf", w: 50, h: 44, p: { x: 50, y: 38 }, d: () => `<rect x="6" y="18" width="10" height="26" rx="2" fill="#fff4e0"/><rect x="20" y="10" width="10" height="34" rx="2" fill="#ffe8c7"/><rect x="34" y="22" width="10" height="22" rx="2" fill="#fff4e0"/>${[[11, 16], [25, 8], [39, 20]].map(([x, y]) => `<path class="flame" d="M${x} ${y} q-4 -6 0 -12 q4 6 0 12Z" fill="#ffb703"/><path d="M${x} ${y} q-2 -3 0 -6 q2 3 0 6Z" fill="#fff3b0"/>`).join("")}` }
};
const furnPos = (room, id) => { const q = (room.pos || {})[id]; return q && q.y != null ? q : FA[id].p; };
const furnScale = (id, P) => (FA[id].t === "floor" && !FA[id].flat ? .8 + .2 * Math.max(0, Math.min(1, (P.y - 62) / 35)) : 1);
function furnSVG(id, o = {}) { const A = FA[id]; return `<svg viewBox="0 0 ${A.w} ${A.h}">${A.d(o)}</svg>`; }
function furnHTML(id, room, mode, photo) {
  const A = FA[id], P = furnPos(room, id), s = furnScale(id, P);
  const sh = A.t === "floor" && !A.flat ? `<ellipse cx="${A.w / 2}" cy="${A.h - 2}" rx="${A.w * .46}" ry="4.5" fill="rgba(0,0,0,.2)"/>` : "";
  return `<div class="fi f-${A.t}${A.flat ? " flat" : ""}" data-id="${id}" style="left:${P.x}%;top:${P.y}%;width:${A.w}px;--s:${s.toFixed(3)}"><svg viewBox="0 0 ${A.w} ${A.h}">${sh}${A.d({ mode, photo, lit: room.light !== false })}</svg></div>`;
}

// ---------- Escenario: exterior (lugares) o casita (habitaciones) ----------
let sceneSig = "", petView = ls.get("petView") || "out", curRoom = ls.get("petRoom") || "salon", editMode = false;
const ROOMS = [["salon", "🛋️ Salón"], ["cocina", "🍳 Cocina"], ["dorm", "🛏️ Dormitorio"], ["jardin", "🌻 Jardín"]];
const ROOM_DEF = { salon: { wall: "w_crema", floor: "f_madera" }, cocina: { wall: "w_menta", floor: "f_baldosa" }, dorm: { wall: "w_rosa", floor: "f_moqueta" }, jardin: { wall: "w_crema", floor: "f_cesped" } };
Object.assign(FURN_POS, { lampara: "right:6%;top:28%;font-size:40px", frutero: "left:6%;bottom:40%;font-size:30px", girasol: "left:4%;bottom:30%;font-size:44px", tetera: "right:6%;bottom:40%;font-size:30px",
  espejo: "right:30%;top:14%;font-size:44px", fogon: "left:3%;bottom:6%;font-size:58px", sombrilla: "right:4%;bottom:20%;font-size:66px", piscina: "", fuente: "left:4%;bottom:10%;font-size:56px" });
const SCENE_DECO = {
  jardin: [["🌷", "left:6%;bottom:12%;font-size:24px"], ["🌼", "right:8%;bottom:16%;font-size:22px"]],
  playa: [["🌴", "left:2%;bottom:18%;font-size:64px"], ["🐚", "right:14%;bottom:8%;font-size:22px"], ["⛵", "right:10%;top:44%;font-size:26px"]],
  bosque: [["🌲", "left:0%;bottom:22%;font-size:70px"], ["🌲", "right:2%;bottom:24%;font-size:60px"], ["🍄", "right:18%;bottom:8%;font-size:22px"], ["🦋", "left:24%;top:30%;font-size:22px", "flutter"]],
  nieve: [["⛄", "right:6%;bottom:12%;font-size:50px"], ["🌲", "left:2%;bottom:22%;font-size:54px"]],
  montana: [["🏔️", "left:-4%;bottom:30%;font-size:110px"], ["🦅", "right:18%;top:26%;font-size:24px", "flutter"]],
  ciudad: [["🏙️", "left:-2%;bottom:24%;font-size:96px"], ["🏢", "right:-2%;bottom:24%;font-size:84px"]],
  mar: [["🐠", "left:10%;top:40%;font-size:26px", "swim"], ["🐟", "right:12%;top:30%;font-size:22px", "swim"], ["🪸", "left:4%;bottom:10%;font-size:40px"], ["🐙", "right:6%;bottom:10%;font-size:34px"]],
  espacio: [["🪐", "left:8%;top:16%;font-size:44px"], ["🌎", "right:10%;top:30%;font-size:36px"], ["🚀", "right:24%;top:10%;font-size:24px", "flutter"]],
  amor: [["💖", "left:8%;top:24%;font-size:28px", "flutter"], ["💕", "right:12%;top:36%;font-size:24px", "flutter"], ["🌹", "left:10%;bottom:10%;font-size:28px"], ["🌹", "right:10%;bottom:12%;font-size:24px"]]
};
const SEASON_DECO = { 9: [["🎃", "left:18%;bottom:6%;font-size:30px"], ["👻", "right:20%;top:34%;font-size:26px", "flutter"]], 11: [["🎄", "right:18%;bottom:10%;font-size:44px"], ["🎁", "right:10%;bottom:6%;font-size:24px"]], 0: [["⛄", "right:18%;bottom:8%;font-size:34px"]], 1: [["💘", "left:20%;top:30%;font-size:26px", "flutter"]] };
const roomOf = (p, r) => ({ ...ROOM_DEF[r], items: {}, pos: {}, ...(((p.rooms || {})[r]) || {}) });
function furnStyle(id, pos) {
  const base = FURN_POS[id] || "", fs = (base.match(/font-size:[^;]+/) || ["font-size:40px"])[0];
  return pos ? `left:${pos.l}%;top:${pos.t}%;${fs}` : base;
}
function renderScene(I, pvScene, pvRoom) {
  const h = hourIn(myTz), mode = (h >= 21 || h < 6) ? "night" : (h < 8 || h >= 19) ? "dawn" : "day", month = new Date().getMonth();
  const p = I.p, scene = pvScene || p.scene || "jardin", room = { ...roomOf(p, curRoom), ...(pvRoom || {}) };
  const photo = (memList.find(m => m.photo) || {}).photo || "", wk = wxKind(), away = tripAway(p);
  const sig = [petView, curRoom, mode, scene, JSON.stringify(room), photo.length, I.bd ? 1 : 0, wk, away ? 1 : 0, editMode, JSON.stringify(p.family || []).length, month, treasureReady(p) ? 1 : 0, room.items.reloj && petView === "in" ? Math.floor(Date.now() / 3e5) : 0].join("|");
  if (sig === sceneSig) return; sceneSig = sig;
  const S0 = $("petScene");
  let sky = "";
  if (petView === "in") {
    const wall = CAT[room.wall] || CAT.w_crema, floor = CAT[room.floor] || CAT.f_madera, garden = curRoom === "jardin";
    S0.className = "scene room " + (garden ? "garden " : "") + room.wall + " " + room.floor + (editMode ? " editing" : "");
    S0.style.setProperty("--wall", wall.sw); S0.style.setProperty("--floor", floor.sw);
    sky += garden ? `<span class="cloud" style="top:26px;animation-delay:-8s">☁️</span><span class="cloud" style="top:64px;animation-delay:-24s;font-size:24px">☁️</span><div class="bushes"></div><div class="fence"></div>`
      : `<div class="walllight"></div><div class="baseboard"></div><div class="floorshade"></div>`;
    const ids = Object.keys(room.items).filter(k => room.items[k] && FA[k]), rank = id => (FA[id].flat ? 0 : FA[id].t === "floor" ? 2 : 1);
    ids.sort((a, b) => rank(a) - rank(b) || furnPos(room, a).y - furnPos(room, b).y);
    for (const id of ids) sky += furnHTML(id, room, mode, photo);
    if (mode === "night") {
      const on = room.items.lampara && room.light !== false, lp = furnPos(room, "lampara"), ly = lp.y - 130 * furnScale("lampara", lp) / 3;
      sky += `<div class="roomnight" style="${on ? `background:radial-gradient(circle at ${lp.x}% ${ly.toFixed(1)}%,rgba(255,220,140,.42) 0,rgba(255,200,120,.14) 90px,rgba(10,10,40,.5) 230px)` : ""}"></div>`;
    }
  } else {
    S0.className = "scene sc-" + scene + " " + (mode === "day" ? "" : mode);
    S0.style.removeProperty("--wall"); S0.style.removeProperty("--floor");
    if (scene === "espacio" || mode === "night") for (let i = 0; i < 26; i++) sky += `<i class="star" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 55).toFixed(1)}%;animation-delay:${(Math.random() * 2.4).toFixed(2)}s"></i>`;
    if (scene !== "espacio" && scene !== "mar") {
      if (!(wk === "rain" || wk === "storm" || wk === "snow")) sky += `<span class="sun">${mode === "night" ? "🌙" : mode === "dawn" ? "🌅" : "☀️"}</span>`;
      if ((mode !== "night" && scene !== "ciudad") || wk === "cloud" || wk === "rain" || wk === "storm") sky += `<span class="cloud" style="top:40px;animation-delay:-8s">☁️</span><span class="cloud" style="top:90px;animation-delay:-24s;font-size:26px">☁️</span>`;
    }
    if (scene === "nieve" || wk === "snow") for (let i = 0; i < 16; i++) sky += `<i class="flake" style="left:${(Math.random() * 100).toFixed(0)}%;animation-delay:${(Math.random() * 6).toFixed(1)}s;animation-duration:${(5 + Math.random() * 4).toFixed(1)}s">❄</i>`;
    if ((wk === "rain" || wk === "storm") && scene !== "mar" && scene !== "espacio") { for (let i = 0; i < 30; i++) sky += `<i class="drop" style="left:${(Math.random() * 100).toFixed(0)}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s"></i>`; sky += `<span class="umbrella">☂️</span>`; }
    if (wk === "storm") sky += `<div class="flash"></div>`;
    if (wk === "fog") sky += `<div class="fog"></div>`;
    if (scene === "mar") for (let i = 0; i < 8; i++) sky += `<i class="bubbleup" style="left:${(10 + Math.random() * 80).toFixed(0)}%;animation-delay:${(Math.random() * 5).toFixed(1)}s">○</i>`;
    for (const [e, st, cl] of (SCENE_DECO[scene] || [])) sky += `<span class="deco ${cl || ""}" style="${st}">${e}</span>`;
    for (const [e, st, cl] of (SEASON_DECO[month] || [])) sky += `<span class="deco ${cl || ""}" style="${st}">${e}</span>`;
    // tesoro
    if (treasureReady(p) && I.si > 0 && !away) { const x = 12 + (hashStr(String((p.tre || {})[who] || 0)) % 60); sky += `<button class="treasure" id="treasureBtn" style="left:${x}%">✨</button>`; }
  }
  // familia (mascotas anteriores), pequeñitas a un lado
  (p.family || []).slice(-3).forEach((f, i) => { sky += `<div class="famfig" style="left:${4 + i * 14}%">${chickSVG(Math.min(6, f.stage || 6), "happy", f.wear || {}, 0, f.color, { species: f.species })}</div>`; });
  if (I.bd) sky += `<span class="deco" style="left:6%;bottom:8%;font-size:40px">🎂</span><span class="deco flutter" style="right:8%;top:20%;font-size:34px">🎈</span>`;
  $("petSky").innerHTML = sky;
  $("petView").textContent = petView === "in" ? "🌳 Salir" : "🏠 Casita";
  $("roomBar").classList.toggle("hidden", petView !== "in");
  $("roomBar").innerHTML = ROOMS.map(([id, n]) => `<button class="${id === curRoom ? "on" : ""}" data-room="${id}">${n}</button>`).join("") +
    `<button class="${editMode ? "on" : ""}" id="editBtn">${editMode ? "✅ Listo" : "✏️ Mover"}</button>` + (mode === "night" && room.items.lampara ? `<button id="lightBtn">${room.light === false ? "💡 Encender" : "🌑 Apagar"}</button>` : "");
  $("roomBar").querySelectorAll("[data-room]").forEach(b => b.onclick = () => { curRoom = b.dataset.room; ls.set("petRoom", curRoom); editMode = false; sceneSig = ""; renderPet(); });
  $("editBtn").onclick = () => { editMode = !editMode; sceneSig = ""; renderPet(); if (editMode) toast("Arrastra los muebles con el dedo ✋"); };
  const lb = $("lightBtn"); if (lb) lb.onclick = () => petTx(q => { q.rooms = q.rooms || {}; q.rooms[curRoom] = { ...roomOf(q, curRoom), light: roomOf(q, curRoom).light === false }; return q; }).then(() => { sceneSig = ""; renderPet(); }).catch(offline);
  const tb = $("treasureBtn"); if (tb) tb.onclick = e => { e.stopPropagation(); digTreasure(); };
  if (editMode) enableDrag();
}
$("petView").onclick = () => { petView = petView === "in" ? "out" : "in"; ls.set("petView", petView); editMode = false; sceneSig = ""; renderPet(); say(petView === "in" ? "¡Mi casita! 🏠" : "¡Qué buen día hace fuera! 🌳"); };
// mover muebles con el dedo
function enableDrag() {
  const sc = $("petScene");
  sc.querySelectorAll(".fi[data-id]").forEach(el => {
    el.onpointerdown = e => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const id = el.dataset.id, A = FA[id], r = sc.getBoundingClientRect(), x0 = parseFloat(el.style.left), y0 = parseFloat(el.style.top), px = e.clientX, py = e.clientY;
      const hp = el.getBoundingClientRect().height / r.height * 100, floorTop = curRoom === "jardin" ? 57 : 64;
      const lim = (x, y) => [Math.max(4, Math.min(96, x)), A.t === "floor" ? Math.max(floorTop, Math.min(99.5, y)) : Math.max(3 + hp, Math.min(60, y))];
      let cur = [x0, y0]; el.classList.add("dragging");
      el.onpointermove = ev => { cur = lim(x0 + (ev.clientX - px) / r.width * 100, y0 + (ev.clientY - py) / r.height * 100); el.style.left = cur[0] + "%"; el.style.top = cur[1] + "%"; el.style.setProperty("--s", furnScale(id, { y: cur[1] }).toFixed(3)); };
      el.onpointerup = el.onpointercancel = () => {
        el.onpointermove = null; el.onpointerup = el.onpointercancel = null; el.classList.remove("dragging");
        const [x, y] = cur.map(v => Math.round(v * 10) / 10);
        petTx(q => { q.rooms = q.rooms || {}; const rm = roomOf(q, curRoom); rm.pos = { ...(rm.pos || {}), [id]: { x, y } }; q.rooms[curRoom] = rm; return q; }).catch(offline);
      };
    };
  });
}

// ---------- Pintar todo ----------
let tempExpr = null, tempUntil = 0, petSig = "", preview = null, shopTab = ls.get("shopTab") || "ropa", sickChecked = "", bdayChecked = "";
function renderPet() {
  renderHome();
  const I = petInfo(), p = I.p, si = I.si, st = STAGES[si], nx = STAGES[si + 1];
  const away = tripAway(p);
  const expr = si === 0 ? "egg" : currentExpr(I);
  const wear = { ...(p.wear || {}) }; let color = p.color || "amarillo", pvScene = null, pvRoom = null;
  for (const pid of pvIds()) {
    const it = CAT[pid]; if (!it) continue;
    if (it.slot) wear[it.slot] = it.id; else if (it.cat === "color") color = it.id;
    else if (it.cat === "lugar") { pvScene = it.id; if (petView !== "out") { petView = "out"; sceneSig = ""; } }
    else if (it.cat === "casa") { if (petView !== "in") { petView = "in"; sceneSig = ""; } const rm = roomOf(p, curRoom); pvRoom = { ...(pvRoom || {}), ...(it.kind === "wall" ? { wall: it.id } : it.kind === "floor" ? { floor: it.id } : { items: { ...((pvRoom && pvRoom.items) || rm.items), [it.id]: true } }) }; }
  }
  renderScene(I, pvScene, pvRoom);
  const crack = si === 0 && (I.meT || I.otT) ? 1 : 0, wk = wxKind();
  const extra = { dirty: si > 0 && I.nv.clean < 30, party: !!I.bd && !wear.head, species: p.species || "pollito",
    cold: !!(WX && WX.temp <= 8 && petView === "out"), hot: !!(WX && WX.temp >= 28 && petView === "out") };
  const sig = [si, expr, JSON.stringify(wear), crack, color, extra.dirty, extra.party, extra.species, extra.cold, extra.hot, away ? 1 : 0].join("|");
  if (sig !== petSig) { petSig = sig; $("petBox").innerHTML = away ? `<div class="awaynote">🧳<b>De excursión en ${esc(away.n)}</b><small>Vuelve a las ${new Date(p.trip.until).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</small></div>` : chickSVG(si, expr, wear, crack, color, extra); }
  $("petZzz").classList.toggle("hidden", expr !== "sleep" || !!away);
  $("petDream").classList.toggle("hidden", expr !== "sleep" || !!away);
  if (expr === "sleep" && !$("petDream").textContent) $("petDream").textContent = dreamText();
  $("petFlies").classList.toggle("hidden", !extra.dirty || !!away);
  $("petCoins").textContent = "🪙 " + coinsOf(p);
  $("petLvl").textContent = "Nv. " + I.L.l;
  $("petWx").classList.toggle("hidden", !WX);
  if (WX) $("petWx").textContent = `${({ clear: WX.isDay ? "☀️" : "🌙", cloud: "⛅", rain: "🌧️", storm: "⛈️", snow: "🌨️", fog: "🌫️" })[wk] || "🌡️"} ${WX.temp}°`;
  // carta que trae el pollito
  const post = p.post, forMe = post && post.to === who && !post.read, replyForMe = post && post.from === who && post.reply && !post.replyRead;
  $("petPost").classList.toggle("hidden", !(forMe || replyForMe) || !!away);

  $("petName").textContent = p.name;
  const tt = TITLES[p.title]; $("petTitle").textContent = tt ? "« " + tt[1] + " »" : ""; $("petTitle").classList.toggle("hidden", !tt || si === 0);
  $("petFrame").className = "pframe fr-" + (p.frame || "ninguno");
  $("petMood").textContent = stageName(si, p.species) + " · " + (away ? `Está de excursión en ${away.n} ${away.e}` : moodText(I));
  const tr = TRAITS[p.trait], spc = SPECIES[p.species || "pollito"];
  $("petTrait").innerHTML = si > 0 && tr ? `${spc.e} ${spc.n} · ${tr.e} ${tr.n} <small>· ${esc(tr.d)}</small>` : si === 0 && p.species && p.species !== "pollito" ? `Huevo de ${spc.n.toLowerCase()} ${spc.e}` : "";
  const act = si > 0 ? activeSets(p) : []; if (act.length) $("petTrait").innerHTML += act.map(s => `<div class="setline">✨ Set ${esc(s.n)} · ${esc(s.d)}</div>`).join("");
  $("petToday").innerHTML = `<span>${esc(name(who))} ${I.meT ? "✅" : "⏳"}</span><span>${esc(name(other()))} ${I.otT ? "✅" : "⏳"}</span>`;

  const col = v => v >= 60 ? "#6fdc9a" : v >= 30 ? "#ffc85c" : "#ff7a7a";
  $("petNeeds").innerHTML = si === 0 ? "" : NEEDS.map(([k, e, n]) => `<div class="need"><div class="nl"><span>${e} ${n}</span><span>${I.nv[k]}%</span></div><div class="nb"><div style="width:${I.nv[k]}%;background:${col(I.nv[k])}"></div></div></div>`).join("");

  $("petFeed").classList.toggle("done", I.meT); $("petFeed").classList.toggle("need", !I.meT);
  $("petFeed").querySelector("span").textContent = I.meT ? "Hecho ✅" : (si === 0 ? "Dar calor" : "Comer");
  $("petFeed").querySelector("i").textContent = si === 0 ? "🔥" : "🍓";
  const nInv = Object.values(p.inv || {}).reduce((a, b) => a + (b || 0), 0);
  $("petBag").querySelector("span").textContent = "Mochila" + (nInv ? ` (${nInv})` : "");
  $("petBag").classList.toggle("need", I.sick && (p.inv || {}).medicina > 0);
  $("petSleep").querySelector("span").textContent = isNapping(p) ? "Despertar" : "Siesta";
  $("petSleep").querySelector("i").textContent = isNapping(p) ? "☀️" : "🌙";
  $("petBath").classList.toggle("need", si > 0 && I.nv.clean < 30);
  $("petPlay").classList.toggle("need", si > 0 && I.nv.fun < 25);
  $("petHug").classList.toggle("need", si > 0 && I.nv.love < 30);

  $("petBar").style.width = nx ? Math.round((p.xp - st.xp) / (nx.xp - st.xp) * 100) + "%" : "100%";
  $("petNext").textContent = nx ? `${p.xp} días cuidándole juntos · faltan ${nx.xp - p.xp} para: ${stageName(si + 1, p.species)}` : "¡Fase máxima! 👑";
  $("lvlBar").style.width = Math.round(I.L.into / I.L.need * 100) + "%";
  $("lvlTxt").textContent = I.L.max ? "¡Nivel máximo! 👑" : `Nivel ${I.L.l} · ${I.L.into}/${I.L.need} de experiencia · cada nivel +20 🪙 y un premio en el camino ⭐`;
  const streakAlive = p.lastBoth && daysBetween(p.lastBoth, I.today) <= 1;
  const age = p.hatchedAt > 1e12 ? Math.floor((Date.now() - p.hatchedAt) / DAY) : null;
  $("stDays").textContent = p.xp; $("stStreak").textContent = streakAlive ? p.streak : 0; $("stHugs").textContent = p.hugs || 0; $("stAge").textContent = age === null ? "—" : age;
  $("stages").innerHTML = STAGES.map((s, k) => `<span class="${k <= si ? "on" : ""}" title="${esc(stageName(k, p.species))}">${k <= si ? stageEmoji(k, p.species) : "?"}<small>${s.xp}</small></span>`).join("");
  renderAlbum(p, color, wear);
  renderShop(p, I);
  renderMissions(p, I); renderLevels(p, I); renderAdventures(p, I); renderCollections(p); renderGamesPet(p); renderFamily(p, I);
  $("dotPet").classList.toggle("hidden", I.meT && !I.sick && I.nv.food >= 30 && !(forMe || replyForMe) && !missionsClaimable(p) && !(p.trip && tripBack(p)));

  if (si > 0 && !p.sick && !setOn(p, "lluvia") && I.low >= 2 && sickChecked !== I.today && Date.now() - (p.curedAt || 0) > 12 * 36e5) { sickChecked = I.today; petTx(q => { if (q.sick) return null; q.sick = true; q.sickAt = Date.now(); return q; }).then(r => { if (r) sendMsg(`🤒 ${r.name || "El pollito"} se ha puesto malito. Necesita medicina 💊`, "pet"); }).catch(() => {}); }
  if (I.bd && !(p.bday || {})[I.bd.key] && bdayChecked !== I.bd.key) {
    bdayChecked = I.bd.key; const gift = I.bd.years ? 200 : 30;
    petTx(q => { q.bday = q.bday || {}; if (q.bday[I.bd.key]) return null; q.bday[I.bd.key] = true; q.coins += gift; return q; })
      .then(r => { if (r) { confetti(); say(I.bd.years ? `¡Hoy cumplo ${I.bd.years} año${I.bd.years > 1 ? "s" : ""}! 🎂 +${gift} 🪙` : `¡Hoy cumplo ${I.bd.months} mes${I.bd.months > 1 ? "es" : ""}! 🎂 +${gift} 🪙`, 5000); sendMsg(`🎂 ¡Hoy ${r.name || "nuestro pollito"} cumple ${I.bd.years ? I.bd.years + " año(s)" : I.bd.months + " mes(es)"}!`, "pet"); } }).catch(() => {});
  }
}
function renderAlbum(p, color, wear) {
  const al = p.album || {};
  $("petAlbum").innerHTML = STAGES.map((s, k) => {
    const got = al[k];
    return `<div class="alb ${got ? "" : "lock"}">${got ? chickSVG(k, k ? "happy" : "egg", {}, 0, color, { species: p.species }) : `<span>?</span>`}<b>${esc(stageName(k, p.species))}</b><small>${got ? (got > 1e12 ? fmtDate(got, { day: "numeric", month: "short", year: "numeric" }) : "✓") : s.xp + " días"}</small></div>`;
  }).join("");
}

// ---------- Tienda ----------
function itemLock(it, p, I) {
  if (it.treasure) return "🔒 Solo sale en tesoros ✨";
  if (it.chest) return "🔒 Solo sale en cofres 🎁";
  if (it.lv) return I.L.l >= it.lv ? "🎁 Recógelo en el camino de premios" : "🔒 Premio del nivel " + it.lv;
  if (it.weekly && (weeklyItem() || {}).id !== it.id) return "🔒 Exclusivo de otra semana";
  if (it.season && !it.season.includes(new Date().getMonth())) return "🔒 Solo en " + it.sn;
  if (it.req) {
    const v = it.req.k === "best" ? (p.best || 0) : it.req.k === "hugs" ? (p.hugs || 0) : it.req.k === "stage" ? I.si : 0;
    if (v < it.req.v) return it.buyAnyway ? null : "🔒 " + it.req.t;
  }
  if (I.L.l < (it.lvl || 1)) return "🔒 Nivel " + it.lvl;
  return null;
}
const isOwned = (p, it) => (it.c === 0 && !it.treasure && !it.chest && !it.lv) || (it.cat === "color" ? !!(p.owned || {})["color:" + it.id] || (it.id === "dorado" && (stageOf(p.xp) === 6 || (p.family || []).length > 0)) : !!(p.owned || {})[it.id]);
function isOn(p, it) {
  if (it.slot) return (p.wear || {})[it.slot] === it.id;
  if (it.cat === "color") return (p.color || "amarillo") === it.id;
  if (it.cat === "lugar") return (p.scene || "jardin") === it.id;
  if (it.cat === "casa") { const r = roomOf(p, curRoom); return it.kind === "wall" ? (r.wall || "w_crema") === it.id : it.kind === "floor" ? (r.floor || "f_madera") === it.id : !!(r.items || {})[it.id]; }
  return false;
}
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function dailyOffers(p, I) {
  const pool = CATALOG.filter(it => it.c > 0 && it.cat !== "comida" && !it.season && !it.treasure && !it.chest && !it.lv && !it.weekly && !isOwned(p, it) && !itemLock(it, p, I));
  const seed = hashStr(dayKey()); return pool.map(it => ({ it, k: hashStr(it.id + seed) })).sort((a, b) => a.k - b.k).slice(0, 3).map(x => x.it.id);
}
const priceOf = (it, offers) => { let c = offers.includes(it.id) ? Math.round(it.c * 0.7) : it.c; if (setOn(state.pet, "elegante")) c = Math.round(c * .9); return c; };
const pvIds = () => (preview ? preview.ids : []);
const sameSlot = (a, b) => (a.slot && a.slot === b.slot) || (a.cat === "color" && b.cat === "color") || (a.cat === "lugar" && b.cat === "lugar") || (a.cat === "casa" && b.cat === "casa" && a.kind === b.kind && a.kind !== "furn");
let shopSlot = ls.get("shopSlot") || "all";
const SLOTS = [["head", "Cabeza"], ["face", "Cara"], ["neck", "Cuello"], ["body", "Cuerpo"], ["feet", "Pies"], ["hand", "En la mano"], ["back", "Espalda"]];
function renderShop(p, I) {
  document.querySelectorAll("#shopTabs button").forEach(b => b.classList.toggle("on", b.dataset.s === shopTab));
  const coins = coinsOf(p), offers = dailyOffers(p, I), wk = weeklyItem(), ids = pvIds();
  let top = "";
  if (wk && !isOwned(p, wk)) top += `<button class="weekly" data-id="${wk.id}" style="--rc:${RAR[rarOf(wk)].c}">${shopIcon(wk)}<div><small>💎 EXCLUSIVO DE LA SEMANA · quedan ${weekLeft()} día${weekLeft() > 1 ? "s" : ""}</small><b>${esc(wk.n)}</b><span class="rtag">${RAR[rarOf(wk)].n}</span></div><span class="wprice">${priceOf(wk, offers)} 🪙</span></button>`;
  if (offers.length) top += `<div class="label" style="margin:10px 0 6px">⭐ Ofertas de hoy · −30%</div><div class="offers">` + offers.map(id => { const it = CAT[id]; return `<button class="offer" data-id="${id}">${shopIcon(it)}<b>${esc(it.n)}</b><span><s>${it.c}</s> ${priceOf(it, offers)} 🪙</span></button>`; }).join("") + `</div>`;
  $("shopOffers").innerHTML = top;
  $("shopOffers").querySelectorAll("[data-id]").forEach(b => b.onclick = () => { shopTab = CAT[b.dataset.id].cat; ls.set("shopTab", shopTab); shopTap(b.dataset.id); });
  const cell = it => {
    const own = isOwned(p, it), on = isOn(p, it), lock = !own && itemLock(it, p, I), pv = ids.includes(it.id), rr = it.slot || it.cat === "color" ? rarOf(it) : 0;
    let tag;
    if (it.cat === "comida") tag = lock || `${priceOf(it, offers)} 🪙${(p.inv || {})[it.id] ? ` · tienes ${p.inv[it.id]}` : ""}`;
    else if (it.cat === "juguete") tag = own ? "Tuyo ✓" : lock || priceOf(it, offers) + " 🪙";
    else tag = on ? "Puesto ✓" : own ? (it.cat === "casa" && it.kind === "furn" ? "Colocar" : "Usar") : lock || priceOf(it, offers) + " 🪙";
    return `<button class="shopit ${rr ? "r" + rr : ""} ${on ? "on" : ""} ${pv ? "pv" : ""} ${lock ? "locked" : ""} ${offers.includes(it.id) && !own ? "sale" : ""}" data-id="${it.id}">${it.nw && !own ? `<em class="nw">NUEVO</em>` : ""}${shopIcon(it)}<b>${esc(it.n)}</b>${rr >= 2 ? `<small class="rt" style="color:${RAR[rr].c}">${RAR[rr].n}</small>` : ""}<span>${esc(tag)}</span></button>`;
  };
  let h = "";
  const list = CATALOG.filter(it => it.cat === shopTab);
  const month = new Date().getMonth(), seasonal = CATALOG.filter(it => it.season && it.season.includes(month));
  if (shopTab === "ropa") {
    const act = activeSets(p);
    h = (act.length ? `<div class="banner setban">✨ ${act.map(s => `Set ${esc(s.n)}: ${esc(s.d)}`).join("<br>✨ ")}</div>` : "") + (seasonal.length ? `<div class="banner" style="margin:4px 0 0">🍂 De temporada ahora: ${seasonal.map(it => (it.e || "🎨") + " " + esc(it.n)).join(" · ")}</div>` : "") +
      `<div class="tchips slotf">${[["all", "Todo"], ...SLOTS, ["new", "✨ Nuevo"]].map(([sl, sn]) => `<button class="tchip ${shopSlot === sl ? "on" : ""}" data-slot="${sl}">${sn}</button>`).join("")}</div>` +
      (shopSlot === "new" ? `<div class="shopgrid" style="margin-top:10px">${list.filter(i => i.nw).map(cell).join("")}</div>`
        : SLOTS.filter(([sl]) => shopSlot === "all" || shopSlot === sl).map(([sl, sn]) => `<div class="slotname">${sn}</div><div class="shopgrid">${list.filter(i => i.slot === sl).map(cell).join("")}</div>`).join(""));
  }
  else if (shopTab === "fx") h = `<div class="sub" style="font-size:13px;margin:0 0 8px">Efectos que brillan alrededor de la mascota ✨ (uno a la vez)</div><div class="shopgrid">${list.map(cell).join("")}</div>`;
  else if (shopTab === "armario") h = renderWardrobe(p);
  else if (shopTab === "cofres") h = renderChests(p, coins);
  else if (shopTab === "casa") h = [["wall", "Paredes"], ["floor", "Suelos"], ["furn", "Muebles (se colocan y se quitan con un toque)"]].map(([k, n]) => `<div class="slotname">${n}</div><div class="shopgrid">${list.filter(i => i.kind === k).map(cell).join("")}</div>`).join("") + `<div class="sub" style="font-size:12px">Se pone en la habitación que estés viendo: <b>${esc((ROOMS.find(r => r[0] === curRoom) || ROOMS[0])[1])}</b>. Cambia de habitación con las pestañas debajo de la escena y pulsa ✏️ Mover para colocar los muebles con el dedo. El cuadro enseña vuestra última foto de Recuerdos 📸 y la lámpara da luz por la noche.</div>`;
  else if (shopTab === "comida") h = `<div class="shopgrid">${list.map(cell).join("")}</div><div class="sub" style="font-size:12px">La comida va a la 🎒 Mochila. Dásela cuando quieras.</div>`;
  else if (shopTab === "juguete") h = `<div class="shopgrid">${list.map(cell).join("")}</div><div class="sub" style="font-size:12px">Cada juguete le divierte distinto. Elígelo al pulsar ⚽ Jugar.</div>`;
  else h = `<div class="shopgrid">${list.map(cell).join("")}</div>${shopTab === "color" ? `<div class="sub" style="font-size:12px">✨ El dorado es gratis al llegar a legendario. Sirena solo sale en cofres y Diamante es el premio del nivel 40.</div>` : ""}`;
  $("shopBody").innerHTML = h;
  $("shopBody").querySelectorAll(".shopit").forEach(b => b.onclick = () => shopTap(b.dataset.id));
  if (shopTab === "armario") bindWardrobe();
  $("shopBody").querySelectorAll("[data-slot]").forEach(b => b.onclick = () => { shopSlot = b.dataset.slot; ls.set("shopSlot", shopSlot); renderPet(); });
  fitIcons($("shopCard"));
  $("shopBody").querySelectorAll("[data-chest]").forEach(b => b.onclick = () => openChest(b.dataset.chest));

  // Probador: puedes probarte varias cosas a la vez y comprarlas juntas
  if (ids.length) {
    const items = ids.map(id => CAT[id]).filter(Boolean), buyable = items.filter(it => !itemLock(it, p, I) && (it.cat === "comida" || !isOwned(p, it)));
    const total = buyable.reduce((a, it) => a + priceOf(it, offers), 0), can = buyable.length && coins >= total, food = items[0].cat === "comida";
    $("shopBuy").innerHTML = `<div class="cart">${food ? "" : `<div class="cartt">👀 Probador · toca más cosas para probártelas juntas</div>`}<div class="cartl">${items.map(it => { const lk = itemLock(it, p, I); return `<span class="chip ${lk ? "lk" : ""}">${it.e || "🎨"} ${esc(it.n)} · ${lk ? "🔒" : priceOf(it, offers) + " 🪙"}<button data-rm="${it.id}">✕</button></span>`; }).join("")}</div>
      ${food && items[0].eff ? `<small>${esc(effText(items[0].eff))}</small>` : ""}${!food && items.some(it => itemLock(it, p, I)) ? `<small>Lo que tiene 🔒 solo se puede probar</small>` : ""}
      <div class="row" style="margin-top:8px"><button class="btn primary" id="buyGo" style="flex:1" ${can ? "" : "disabled"}>${!buyable.length ? esc(itemLock(items[0], p, I) || "Ya lo tenéis") : can ? `Comprar${buyable.length > 1 ? " " + buyable.length + " cosas" : ""} · ${total} 🪙` : `Te faltan ${total - coins} 🪙`}</button><button class="btn" id="buyX">✕</button></div></div>`;
    $("buyGo").onclick = buy; $("buyX").onclick = () => { preview = null; sceneSig = ""; renderPet(); };
    $("shopBuy").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { const r = pvIds().filter(x => x !== b.dataset.rm); preview = r.length ? { ids: r } : null; sceneSig = ""; renderPet(); });
  } else $("shopBuy").innerHTML = shopTab === "armario" || shopTab === "cofres" ? "" : `<div class="sub" style="font-size:13px;text-align:center">Toca algo para probárselo 👀 · puedes probar varias cosas a la vez</div>`;
}
function placeFurn(q, it, on) {
  q.rooms = q.rooms || {}; const rm = roomOf(q, curRoom);
  if (it.kind === "wall") rm.wall = it.id; else if (it.kind === "floor") rm.floor = it.id; else rm.items = { ...rm.items, [it.id]: on };
  q.rooms[curRoom] = rm;
}
const effText = e => Object.entries(e).map(([k, v]) => k === "cure" ? "cura la enfermedad" : `${v > 0 ? "+" : ""}${v} ${({ food: "hambre", love: "cariño", fun: "diversión", clean: "limpieza", energy: "energía" })[k]}`).join(", ");
function shopTap(id) {
  const p = state.pet || newPet(), it = CAT[id], si = stageOf(p.xp);
  if (it.cat === "comida") { preview = pvIds().includes(id) ? null : { ids: [id] }; renderPet(); return; }
  if (isOwned(p, it)) {
    const rest = pvIds().filter(x => x !== id && CAT[x].cat !== "comida" && !sameSlot(CAT[x], it)); preview = rest.length ? { ids: rest } : null;
    if (it.slot && awayToast()) { renderPet(); return; }
    if (it.cat === "juguete") { toast(`${it.e} Ya lo tiene. Úsalo con ⚽ Jugar`); renderPet(); return; }
    const on = isOn(p, it), before = state.pet;
    petTx(q => {
      if (it.slot) { settle(q); q.wear[it.slot] = on ? null : it.id; bump(q, "dress"); }
      else if (it.cat === "color") { q.color = it.id; bump(q, "dress"); }
      else if (it.cat === "lugar") q.scene = it.id;
      else if (it.cat === "casa") placeFurn(q, it, !on);
      return q;
    }).then(r => { sceneSig = ""; if (it.cat === "casa" && petView !== "in") { petView = "in"; ls.set("petView", "in"); } if (it.cat === "lugar" && petView !== "out") { petView = "out"; ls.set("petView", "out"); } if (si) { react("happy", 2000); say(on && it.slot ? "¡Así también estoy guapo!" : rnd(["¡Me encanta! 😍", "¡Qué bonito! ✨", "¡Gracias! 💛"])); } if (r && it.slot) announceSets(before, r); renderPet(); }).catch(offline);
  } else {
    let ids = pvIds().filter(x => CAT[x].cat !== "comida");
    if (ids.includes(id)) ids = ids.filter(x => x !== id); else { ids = ids.filter(x => !sameSlot(CAT[x], it)); ids.push(id); }
    preview = ids.length ? { ids } : null; sceneSig = "";
    if (!si && (it.slot || it.cat === "color")) toast("Se verá cuando nazca 🥚");
    renderPet();
    if (preview && (it.slot || it.cat === "color") && window.scrollY > $("petScene").offsetTop + 200) toast("Mira arriba cómo le queda 👀");
  }
}
function buy() {
  const ids = pvIds(); if (!ids.length) return;
  const p0 = state.pet || newPet(), I = petInfo(), offers = dailyOffers(p0, I);
  const list = ids.map(id => CAT[id]).filter(it => it && !itemLock(it, p0, I) && (it.cat === "comida" || !isOwned(p0, it)));
  if (!list.length) return toast(itemLock(CAT[ids[0]], p0, I) || "Ya lo tenéis");
  const total = list.reduce((a, it) => a + priceOf(it, offers), 0); let fail = false; const before = state.pet;
  petTx(p => {
    if (p.coins < total) { fail = true; return null; }
    fail = false; settle(p);
    for (const it of list) {
      if (it.cat === "comida") { p.inv[it.id] = (p.inv[it.id] || 0) + 1; continue; }
      const key = ownKey(it); if (p.owned[key]) continue; p.owned[key] = true;
      if (it.slot) p.wear[it.slot] = it.id; else if (it.cat === "color") p.color = it.id; else if (it.cat === "lugar") p.scene = it.id; else if (it.cat === "casa") placeFurn(p, it, true);
    }
    bump(p, "buy"); p.coins -= total; return p;
  }).then(r => {
    if (fail) return toast("No tenéis suficientes monedas 🪙");
    if (!r) return;
    const food = list[0].cat === "comida"; if (!food) preview = null;
    sceneSig = ""; buzz([30, 40, 30]); hearts($("petBox"), "✨");
    react("happy", 2500); say(food ? `¡${list[0].e} a la mochila! ¡Ñam!` : rnd(["¡Gracias! ¡Me encanta! 😍", "¡Qué regalo tan bonito! 💛", "¡Sois los mejores! ✨"]));
    if (!food) { sendMsg(`🛍️ Le he comprado ${list.map(it => (it.e || "🎨") + " " + it.n.toLowerCase()).join(", ")} a ${r.name || "la mascota"}`, "pet"); announceSets(before, r); }
    renderPet();
  }).catch(offline);
}
document.querySelectorAll("#shopTabs button").forEach(b => b.onclick = () => { shopTab = b.dataset.s; ls.set("shopTab", shopTab); preview = null; sceneSig = ""; renderPet(); });

// ---------- Monedas ----------
function coinFx(n) { if (n > 0) fx("coinfx", "+" + n + " 🪙", "", 1300); }
function addCoins(n) { return petTx(p => { p.coins += n; return p; }).then(() => { toast("+" + n + " 🪙 para el pollito"); }).catch(() => {}); }
// 💖 Corazones de pareja: cada uno tiene los suyos (juegos, pregunta del día, planes) y se gastan en la Tienda de vales
const HEART_START = 50;
const heartsOf = w => { const x = state.wallet; return x && typeof x[w] === "number" ? x[w] : HEART_START; };
const walletTx = fn => S.tx("state/wallet", x => { x = x || {}; for (const w of ["a", "b"]) if (typeof x[w] !== "number") x[w] = HEART_START; return fn(x); });
function addHearts(n, why) {
  if (!n) return Promise.resolve();
  return walletTx(x => { x[who] += n; return x; }).then(() => toast(`+${n} 💖${why ? " · " + why : ""}`)).catch(() => {});
}
function renderHearts() {
  const el = $("heartBar"); if (el) el.innerHTML = `<span>💖 Tus corazones: <b>${heartsOf(who)}</b></span><small>${esc(name(other()))}: ${heartsOf(other())}</small>`;
  if (typeof curGame !== "undefined" && curGame === "shop") renderShop2();
}

// ---------- Reacciones y vida ----------
function react(expr, ms) { tempExpr = expr; tempUntil = Date.now() + ms; renderPet(); setTimeout(renderPet, ms + 50); }
function anim(cls, ms) { const b = $("petBox"); b.classList.remove(cls); void b.offsetWidth; b.classList.add(cls); setTimeout(() => b.classList.remove(cls), ms); }
function fx(cls, e, style = "", ms = 1800) { const s = document.createElement("span"); s.className = "fx " + cls; s.textContent = e; s.style.cssText = style; $("petScene").appendChild(s); setTimeout(() => s.remove(), ms); }
function say(t, ms = 3200) { const b = $("petSay"); b.classList.remove("ask"); b.textContent = t; b.classList.remove("hidden"); b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; clearTimeout(say.t); say.t = setTimeout(() => b.classList.add("hidden"), ms); }
function phrase() {
  const I = petInfo(), o = name(other()), me = name(who), h = hourIn(myTz), p = I.p, tr = p.trait;
  const L = ["¡Pío pío! 🐤", "¡Os quiero a los dos! 💛", `Dile a ${o} que le echo de menos`, "Me encantan los mimos 🥰", "¿Jugamos? ⚽", "Cuando os veáis, ¡llevadme! 🧳", "¿Me compráis algo bonito? 🛍️", `${me}, ¡eres mi favorito! 🤫 (no se lo digas a ${o})`];
  if (h >= 6 && h < 11) L.push(`¡Buenos días, ${me}! ☀️`, "¿Desayunamos? 🥐");
  if (h >= 13 && h < 16) L.push("¡Hora de comer! 🍽️", "Qué sueñito después de comer… 😪");
  if (h >= 20 && h < 23) L.push("Ya casi es hora de dormir 🌙", `¿Le has dado las buenas noches a ${o}?`);
  if (h >= 23 || h < 7) L.push("Zzz… estaba soñando con vosotros 💤", "¿Qué haces despierto? 🌙");
  if (!I.meT) L.push("Tengo hambre… 🍓");
  if (I.otT) L.push(`Hoy ${o} ya ha venido a verme 💕`);
  if (I.nv.clean < 40) L.push("Huelo un poco a pollo… ¿un bañito? 🛁");
  if (I.nv.fun < 35) L.push("Me aburroooo… 🥱");
  if (I.nv.energy < 30) L.push("Estoy muy cansado… 😴");
  if (I.sick) L.push("No me encuentro bien… 🤒", "¿Tenéis medicina? 💊");
  if (tr === "gloton") L.push("¿Hay tarta? 🍰", "Podría comerme una hamburguesa entera 🍔");
  if (tr === "mimoso") L.push("¡Abrázame! 🤗", "Un mimito más, porfa 🥺");
  if (tr === "jugueton") L.push("¡Vamos a jugar! 🎈", "¿Me tiras la pelota? ⚽");
  if (tr === "dormilon") L.push("Cinco minutitos más… 😴", "Me echaría una siesta 🌙");
  const wk = wxKind(), ow = otherWx();
  if (WX && petView === "out") {
    if (wk === "rain" || wk === "storm") L.push("¡Está lloviendo! Menos mal que tengo paraguas ☂️", "Me encanta saltar en los charcos 💦");
    if (wk === "snow") L.push("¡Está nevando! ¿Hacemos un muñeco? ⛄");
    if (WX.temp <= 8) L.push("Brrr… qué frío hace 🧣", "Menos mal que tengo bufanda 🧣");
    if (WX.temp >= 28) L.push("Qué calor… 🥵 ¿un helado?", "Me derrito… 🫠");
    if (wk === "clear" && WX.isDay) L.push("¡Qué buen día hace! ☀️");
  }
  if (ow) L.push(`En casa de ${o} hace ${ow.temp}° ${WX_E[wxKindOf(ow.code)]}`);
  if (tripBack(p)) L.push("¡He vuelto de viaje! Mirad mi postal 📮");
  if (p.post && p.post.to === who && !p.post.read) L.push(`¡Te traigo una carta de ${o}! ✉️ Tócala`);
  if (treasureReady(p)) L.push("Creo que hay algo brillante escondido por aquí… ✨");
  if ((p.family || []).length) L.push(`${rnd(p.family).name} me ha enseñado un truco 🤫`);
  const ctx = petCtx(I); L.push(...ctx, ...ctx);
  if (p.streak >= 3) L.push(`¡Llevamos ${p.streak} días seguidos juntos! 🔥`);
  if (state.main.next && state.main.next > Date.now()) { const d = Math.ceil((state.main.next - Date.now()) / DAY); L.push(`¡Faltan ${d} día${d === 1 ? "" : "s"} para que os veáis! ✈️`); }
  return rnd(L);
}
const petTx = fn => S.tx("state/pet", p => fn(ensureDay(p || newPet())));
const hatched = () => stageOf((state.pet || {}).xp || 0) > 0;
let lvlToast = l => { if (l) { const R = LV_REWARDS[l] || {}; setTimeout(() => { confetti(); say(`¡He subido a nivel ${l}! 🎉${R.s ? ` ¡He aprendido a ${SKILLS[R.s][2].toLowerCase()} ${SKILLS[R.s][1]}!` : " Hay premio en el camino ⭐"}`, 4500); }, 900); sendMsg(`⭐ ¡${(state.pet || {}).name || "El pollito"} ha subido a nivel ${l}! Premio: ${lvText(l)}`, "pet"); } };

// Comer (el cuidado diario de cada uno: hace crecer al pollito)
$("petFeed").onclick = () => {
  const today = dayKey(); let evolved = false, both = false, wasEgg = false, gain = 0, lvl = 0, newStage = 0;
  petTx(p => {
    p.care = p.care || {};
    if (p.care[who] === today) return null;
    p.care[who] = today; evolved = false; both = false; wasEgg = stageOf(p.xp) === 0; gain = 10;
    if (p.care[other()] === today && p.lastBoth !== today) {
      const before = stageOf(p.xp);
      p.streak = p.lastBoth && daysBetween(p.lastBoth, today) === 1 ? (p.streak || 0) + 1 : 1;
      p.best = Math.max(p.best || 0, p.streak); p.xp += 1; p.lastBoth = today; both = true; gain += 15;
      if (p.streak % 7 === 0) gain += 50;
      newStage = stageOf(p.xp); evolved = newStage > before;
      if (evolved) { p.album[newStage] = Date.now(); if (before === 0) { p.hatchedAt = Date.now(); p.trait = p.trait || rnd(Object.keys(TRAITS)); } }
    }
    if (!wasEgg) { setNeed(p, "food", 45 + (p.trait === "gloton" ? 5 : 0)); if (p.trait === "gloton") setNeed(p, "love", 8); }
    lvl = gainExp(p, 20); bump(p, "feed");
    p.coins += gain;
    return p;
  }).then(r => {
    if (!r) return toast("Hoy ya le has dado de comer 🍓 Usa la 🎒 Mochila para darle más"); buzz();
    if (!wasEgg) { fx("fall", "🍓", "", 900); setTimeout(() => { anim("eat", 1400); react("happy", 2600); }, 700); }
    else anim("wiggle", 1100);
    setTimeout(() => coinFx(gain), 800);
    if (evolved) { setTimeout(() => { hearts($("petBox"), "✨"); say(wasEgg ? `¡Hola papás! ¡He nacido! ${(SPECIES[r.species] || SPECIES.pollito).e} Soy ${TRAITS[r.trait].n.toLowerCase()} ${TRAITS[r.trait].e}` : `¡Mirad cuánto he crecido! Ahora soy ${stageName(newStage, r.species)} ✨${newStage === 6 ? " Ya podéis adoptar un hermanito 🥚" : ""}`, 5000); confetti(); }, 900); toast("✨ ¡Ha evolucionado! ✨", 3500); sendMsg(wasEgg ? "🐣 ¡Nuestro huevo se ha abierto! Ven a verle" : `✨ Nuestra mascota ha evolucionado a ${stageName(newStage, r.species)}`, "pet"); }
    else if (both) { setTimeout(() => say(r.streak % 7 === 0 ? `¡${r.streak} días seguidos! +50 🪙 🔥` : "¡Hoy me habéis cuidado los dos! 💞"), 900); }
    else { setTimeout(() => say(wasEgg ? "*se mueve un poquito*" : "¡Ñam! Gracias 🥰"), 900); sendMsg((wasEgg ? "🔥 Ya le he dado calor al huevo" : "🍓 Ya le he dado de comer a " + (r.name || "la mascota")) + ", ¡te toca!", "pet"); }
    lvlToast(lvl);
  }).catch(offline);
};

// Mochila: comida y medicina compradas
function openSheet(title, html) { $("sheetTitle").textContent = title; $("sheetBody").innerHTML = html; $("petSheet").classList.remove("hidden"); }
function closeSheet() { $("petSheet").classList.add("hidden"); }
$("sheetX").onclick = closeSheet; $("petSheet").onclick = e => { if (e.target.id === "petSheet") closeSheet(); };
$("petBag").onclick = () => {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  if (awayToast()) return;
  const p = state.pet || {}, inv = p.inv || {}, items = CATALOG.filter(it => it.cat === "comida" && inv[it.id] > 0);
  openSheet("🎒 Mochila", items.length ? `<div class="shopgrid">${items.map(it => `<button class="shopit" data-use="${it.id}"><i>${it.e}</i><b>${esc(it.n)}</b><span>x${inv[it.id]} · ${esc(effText(it.eff))}</span></button>`).join("")}</div>`
    : `<div class="empty">La mochila está vacía. Compra comida, café, champú o medicina en la tienda 🍰💊</div><button class="btn primary mt" style="width:100%" id="goShop">Ir a la tienda</button>`);
  const gs = $("goShop"); if (gs) gs.onclick = () => { closeSheet(); shopTab = "comida"; ls.set("shopTab", "comida"); renderPet(); $("shopCard").scrollIntoView({ behavior: "smooth" }); };
  $("sheetBody").querySelectorAll("[data-use]").forEach(b => b.onclick = () => useItem(b.dataset.use));
};
function useItem(id) {
  const it = CAT[id]; let lvl = 0, ok = false, cured = false;
  if (isNapping(state.pet || {}) && !it.eff.cure) { closeSheet(); return say("Zzz… déjame dormir 😴"); }
  petTx(p => {
    if (!(p.inv[id] > 0)) return null; p.inv[id]--; ok = true;
    for (const [k, v] of Object.entries(it.eff)) { if (k === "cure") { if (p.sick) cured = true; p.sick = false; p.curedAt = Date.now(); for (const [nk] of NEEDS) if (needNow(p, nk) < 25) setNeed(p, nk, 15); } else setNeed(p, k, v); }
    lvl = gainExp(p, 5); bump(p, "bag"); return p;
  }).then(r => {
    closeSheet(); if (!ok) return;
    fx("fall", it.e, "", 900); setTimeout(() => { anim("eat", 1200); react(cured ? "happy" : "love", 2200); say(cured ? "¡Ya me encuentro mejor! 💪" : rnd(["¡Ñam ñam! 😋", "¡Qué rico! 🥰", "¡Más, más! 🤤"])); }, 700);
    if (cured) sendMsg(`💊 He curado a ${r.name || "la mascota"}, ya está bien`, "pet");
    lvlToast(lvl);
  }).catch(offline);
}

// Mimos (también tocándole; 5 toques = cosquillas; mantener pulsado = caricia)
function doHug(kind) {
  if (!hatched()) { anim("wiggle", 600); return; }
  if (editMode) return;
  if (awayToast()) return;
  if (isNapping(state.pet || {})) return say(rnd(["Zzz… 😴", "Mmm… cinco minutos más…", "*ronca suavecito*"]));
  const tickle = kind === "tickle", pet = kind === "pet";
  hearts($("petBox"), tickle ? "😂" : pet ? "💕" : "💗"); buzz(tickle ? [20, 30, 20, 30] : 20);
  react(tickle ? "laugh" : pet ? "love" : "happy", 1800); say(tickle ? rnd(["¡Jajaja, cosquillas no! 🤭", "¡Para, para! 😂", "¡Jijiji! 🤣"]) : pet ? rnd(["Mmmm… qué gustito 🥰", "Así, así… 💕", "*ronronea como un gato*"]) : phrase());
  if (tickle) anim("wiggle", 900);
  let g = 0, lvl = 0;
  petTx(p => { p.hugs = (p.hugs || 0) + 1; p.day.hugs[who] = (p.day.hugs[who] || 0) + 1; const first = p.day.hugs[who] <= 10;
    g = first ? 1 : 0; p.coins += g; setNeed(p, "love", (pet ? 12 : 8) * (p.trait === "mimoso" ? 2 : 1)); if (tickle) setNeed(p, "fun", 6); if (first) lvl = gainExp(p, 2); bump(p, "hug"); if (tickle) bump(p, "tickle"); if (pet) bump(p, "pet"); return p; })
    .then(() => { coinFx(g); lvlToast(lvl); }).catch(offline);
}
$("petHug").onclick = () => doHug("hug");

(() => {
  let taps = [], pressT = null, pressed = false;
  const box = $("petBox");
  box.addEventListener("pointerdown", () => { pressed = false; pressT = setTimeout(() => { pressed = true; doHug("pet"); }, 550); });
  box.addEventListener("pointerup", () => {
    clearTimeout(pressT); if (pressed) return;
    const now = Date.now(); taps = taps.filter(t => now - t < 1600); taps.push(now);
    if (taps.length >= 5) { taps = []; doHug("tickle"); } else if (taps.length === 1) setTimeout(() => { if (taps.length === 1) { taps = []; doHug("hug"); } }, 380);
  });
  box.addEventListener("pointerleave", () => clearTimeout(pressT));
  box.addEventListener("contextmenu", e => e.preventDefault());
})();

// Jugar: elegir juguete
$("petPlay").onclick = () => {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  const p = state.pet || {}, I = petInfo();
  if (awayToast()) return;
  if (isNapping(p)) return say("Zzz… ahora estoy durmiendo 😴");
  if (p.sick) return say("Estoy malito, no puedo jugar 🤒");
  if (I.nv.energy < 15) return say("Estoy agotado… mejor una siesta 😴");
  const toys = CATALOG.filter(it => it.cat === "juguete" && isOwned(p, it));
  openSheet("🧸 ¿A qué jugamos?", `<div class="shopgrid">${toys.map(it => `<button class="shopit" data-toy="${it.id}"><i>${it.e}</i><b>${esc(it.n)}</b><span>+${it.fun} diversión</span></button>`).join("")}</div><div class="sub" style="font-size:12px">Más juguetes en la tienda 🧸</div>`);
  $("sheetBody").querySelectorAll("[data-toy]").forEach(b => b.onclick = () => { closeSheet(); playWith(b.dataset.toy); });
};
function playWith(id) {
  const it = CAT[id];
  const A = {
    pelota: () => { fx("ball", "⚽", "", 1400); setTimeout(() => anim("jump", 1200), 450); },
    yoyo: () => { fx("yoyo", "🪀", "", 1600); anim("wiggle", 1200); },
    peluche: () => { hearts($("petBox"), "🧸"); react("love", 2000); },
    cometa: () => { fx("kite", "🪁", "", 2600); anim("jump", 1200); },
    guitarra: () => { for (let i = 0; i < 6; i++) setTimeout(() => fx("note", rnd(["🎵", "🎶"]), `left:${30 + Math.random() * 40}%`), i * 200); anim("wiggle", 1400); },
    consola: () => { fx("game", "🎮", "", 1600); for (let i = 0; i < 5; i++) setTimeout(() => fx("note", "✨", `left:${30 + Math.random() * 40}%`), i * 220); }
  };
  (A[id] || A.pelota)(); buzz(30);
  setTimeout(() => { if (id !== "peluche") react("happy", 2000); say(rnd({ pelota: ["¡Gol! ⚽", "¡Otra, otra!"], yoyo: ["¡Mira qué truco! 🪀"], peluche: ["¡Mi peluchito! 🧸💕"], cometa: ["¡Vuela alto! 🪁"], guitarra: ["🎵 Pío, pío, te quiero, pío 🎵"], consola: ["¡He ganado! 🏆", "¡Una partida más! 🎮"] }[id] || ["¡Qué divertido!"])); }, 800);
  let g = 0, lvl = 0;
  petTx(p => {
    p.day.play[who] = (p.day.play[who] || 0) + 1; const first = p.day.play[who] <= 5; g = first ? 3 : 0; p.coins += g;
    setNeed(p, "fun", it.fun); if (it.love) setNeed(p, "love", it.love); setNeed(p, "energy", -12); setNeed(p, "clean", -4);
    if (first) lvl = gainExp(p, p.trait === "jugueton" ? 9 : 6); bump(p, "play"); return p;
  }).then(() => { setTimeout(() => coinFx(g), 900); lvlToast(lvl); }).catch(offline);
}

// Baño
$("petBath").onclick = () => {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  if (awayToast()) return;
  if (isNapping(state.pet || {})) return say("Zzz… luego me baño 😴");
  for (let i = 0; i < 9; i++) setTimeout(() => fx("bub", "🫧", `left:${30 + Math.random() * 40}%`), i * 120);
  anim("wiggle", 1100); setTimeout(() => { react("happy", 2000); say(rnd(["¡Qué limpito! ✨", "¡Huelo a rosas! 🌹", "¡Splash! 💦"])); }, 700); buzz(30);
  let g = 0, lvl = 0;
  petTx(p => { const first = p.lastBath !== dayKey(); g = first ? 5 : 0; p.lastBath = dayKey(); p.coins += g; setNeed(p, "clean", 100); if (first) lvl = gainExp(p, 10); bump(p, "bath"); return p; })
    .then(() => { setTimeout(() => coinFx(g), 900); lvlToast(lvl); }).catch(offline);
};

// Siesta / despertar
$("petSleep").onclick = () => {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  if (awayToast()) return;
  const napping = isNapping(state.pet || {});
  petTx(p => { if (napping) { setNeed(p, "energy", 0); p.nap = Date.now(); } else { setNeed(p, "energy", 0); p.napStart = Date.now(); p.nap = Date.now() + 2 * 36e5; bump(p, "nap"); } return p; })
    .then(() => { if (napping) { react("surprised", 1500); say("¡Buenos días! ☀️ Ya estoy despierto"); } else say("Buenas noches… 😴💤"); }).catch(offline);
};

$("petName").onclick = () => {
  const n = prompt("¿Cómo se llama vuestra mascota?", (state.pet && state.pet.name) || CONFIG.petName); if (!n || !n.trim()) return;
  petTx(p => { p.name = n.trim().slice(0, 24); return p; }).catch(offline);
};
function hearts(el, e) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 5; i++) {
    const h = document.createElement("div"); h.className = "float-heart"; h.textContent = e;
    h.style.left = (r.left + r.width / 2 - 14 + (Math.random() * 90 - 45)) + "px"; h.style.top = (r.top + r.height / 3) + "px";
    h.style.animationDelay = (i * 0.08) + "s"; document.body.appendChild(h); setTimeout(() => h.remove(), 1500);
  }
}
// Vida propia: mira a los lados, salta, aletea, bosteza y habla de vez en cuando
setInterval(() => {
  if (document.hidden || $("tab-pet").classList.contains("hidden") || !hatched() || Date.now() < tempUntil) return;
  const I = petInfo(), ex = currentExpr(I);
  if (tripAway(I.p) || editMode) return;
  if (ex === "sleep") { if (Math.random() < .15) say(rnd(["Zzz…", "*ronquidito*", "💤"]), 1800); return; }
  const r = Math.random();
  if (r < .3) anim(Math.random() < .5 ? "lookl" : "lookr", 1400);
  else if (r < .45) anim("hopsm", 700);
  else if (r < .55) anim("flap", 900);
  else if (r < .63 && (ex === "tired" || ex === "bored")) { say("*bosteza* 🥱", 2000); anim("yawn", 1500); }
  else if (r < .73) say(phrase());
  else if (r < .78 && ex === "hungry") say("Grrr… mi tripita 🍽️", 2000);
  else if (r < .84) maybeAsk();
}, 7000);
setInterval(() => { if (!document.hidden) renderPet(); }, 60000);

// ================= ¿Me conoces? =================
const QZ = [
  "Comida favorita", "Mayor miedo", "Película favorita", "Canción favorita ahora mismo", "Plan perfecto de domingo",
  "País soñado para viajar", "Lo que más enfada", "Mayor sueño", "Color favorito", "Bebida favorita",
  "Una manía rara", "Animal favorito", "Primer recuerdo de nosotros", "Superpoder que elegiría", "Serie favorita",
  "Postre favorito", "Recuerdo favorito de la infancia", "Estación del año favorita", "Mejor cualidad propia",
  "Qué haría si le tocara la lotería", "Placer culpable", "Emoji más usado", "Lo primero que hace al despertar",
  "Comida que odia", "Talento oculto", "Olor favorito", "Famoso/a con quien cenaría", "Palabra favorita",
  "Lo que más le hace reír", "Recuerdo más bonito juntos"
];
function renderQuiz() {
  const q = state.quiz || {}, ans = q.ans || {}, gu = q.gu || {};
  const me = who, ot = other();
  document.querySelectorAll(".oname").forEach(e => e.textContent = name(ot));
  const count = w => { const g = gu[w] || {}; let ok = 0, tot = 0; for (const i in g) if (g[i].ok !== undefined && g[i].ok !== null) { tot++; if (g[i].ok) ok++; } return { ok, tot }; };
  const cm = count(me), co = count(ot);
  $("quizScore").innerHTML = `<div><b>${cm.ok}/${cm.tot}</b><span>${esc(name(me))} acierta</span></div><div><b>${co.ok}/${co.tot}</b><span>${esc(name(ot))} acierta</span></div>`;
  const tot = cm.tot + co.tot, pct = tot ? (cm.ok + co.ok) / tot : 0;
  $("quizLevel").textContent = tot < 3 ? "Jugad unas cuantas para ver vuestro nivel ✨" :
    "Nivel de pareja: " + (pct < .4 ? "Conociéndoos 🌱" : pct < .7 ? "Buen equipo 💪" : pct < .9 ? "Almas gemelas 💞" : "Telepatía 🔮") + ` (${Math.round(pct * 100)}%)`;

  // Corregir: lo que el otro ha adivinado sobre mí y aún no he corregido
  const pend = Object.keys(gu[ot] || {}).filter(i => gu[ot][i].ok === undefined || gu[ot][i].ok === null);
  $("quizReviewCard").classList.toggle("hidden", !pend.length);
  $("quizReview").innerHTML = pend.map(i => `<div class="guess"><div class="q">${esc(QZ[i])}</div>
    <div class="g">"${esc(gu[ot][i].t)}"</div><div class="q">Tu respuesta: ${esc((ans[me] || {})[i])}</div>
    <div class="okbad"><button class="btn" data-ok="1" data-i="${i}">✅ Acertó</button><button class="btn" data-ok="0" data-i="${i}">❌ Falló</button></div></div>`).join("");
  $("quizReview").querySelectorAll("button").forEach(b => b.onclick = () => {
    const ok = b.dataset.ok === "1";
    S.merge("quiz/main", { gu: { [ot]: { [b.dataset.i]: { ok } } } }); buzz(); if (ok) addHearts(5, "¿Me conoces?");
    sendMsg((ok ? "✅ ¡Acertaste! " : "❌ Fallaste: ") + QZ[b.dataset.i].toLowerCase() + (ok ? "" : " → " + ((ans[me] || {})[b.dataset.i] || "")), "quiz");
  });

  // Adivinar
  const toGuess = Object.keys(ans[ot] || {}).filter(i => !(gu[me] || {})[i]);
  if (toGuess.length) {
    const i = toGuess[0];
    $("quizGuess").innerHTML = `<div class="question">${esc(QZ[i])}</div>
      <input id="qzG" class="mt" placeholder="¿Qué crees?"><button class="btn primary mt" id="qzGS">Adivinar</button>
      <div class="sub">${toGuess.length} por adivinar</div>`;
    $("qzGS").onclick = () => { const t = $("qzG").value.trim(); if (!t) return;
      S.merge("quiz/main", { gu: { [me]: { [i]: { t, ok: null, at: Date.now() } } } }); buzz();
      sendMsg("🤔 He intentado adivinar: " + QZ[i].toLowerCase() + ". ¡Corrígeme en Juegos!", "quiz"); toast("Ahora " + name(ot) + " te dirá si aciertas"); };
  } else $("quizGuess").innerHTML = `<div class="empty">No hay nada que adivinar. Cuando ${esc(name(ot))} responda preguntas sobre sí, aparecerán aquí.</div>`;

  // Responder sobre mí
  const skipped = JSON.parse(ls.get("qzSkip") || "[]");
  const mine = ans[me] || {};
  const nextI = QZ.findIndex((_, i) => mine[i] === undefined && !skipped.includes(i));
  const done = Object.keys(mine).length;
  if (nextI >= 0) {
    $("quizMine").innerHTML = `<div class="question">${esc(QZ[nextI])}</div>
      <input id="qzM" class="mt" placeholder="Tu respuesta (${esc(name(ot))} intentará adivinarla)">
      <div class="row mt"><button class="btn" id="qzSkip" style="flex:1">Saltar</button><button class="btn primary" id="qzMS" style="flex:2">Guardar</button></div>
      <div class="sub">${done}/${QZ.length} respondidas</div>`;
    $("qzMS").onclick = () => { const t = $("qzM").value.trim(); if (!t) return; S.merge("quiz/main", { ans: { [me]: { [nextI]: t } } }); buzz(); };
    $("qzSkip").onclick = () => { skipped.push(nextI); ls.set("qzSkip", JSON.stringify(skipped)); renderQuiz(); };
  } else $("quizMine").innerHTML = `<div class="empty">¡Has respondido todas! (${done}) 🎉</div>` + (skipped.length ? `<button class="btn mt" id="qzUnskip">Ver las que saltaste</button>` : "");
  const us = $("qzUnskip"); if (us) us.onclick = () => { ls.set("qzSkip", "[]"); renderQuiz(); };

  // Historial
  const hist = [];
  for (const w of [me, ot]) for (const i in gu[w] || {}) { const g = gu[w][i]; if (g.ok === true || g.ok === false) hist.push({ w, i, g }); }
  hist.sort((x, y) => (y.g.at || 0) - (x.g.at || 0));
  $("quizHist").innerHTML = hist.length ? hist.slice(0, 20).map(({ w, i, g }) => `<div class="guess"><div class="q">${esc(name(w))} sobre ${esc(name(w === "a" ? "b" : "a"))} · ${esc(QZ[i])}</div>
    <div class="g">"${esc(g.t)}"</div><span class="tag ${g.ok ? "ok" : "bad"}">${g.ok ? "✅ Acertó" : "❌ Era: " + esc((ans[w === "a" ? "b" : "a"] || {})[i])}</span></div>`).join("")
    : '<div class="empty">Aquí saldrán vuestros aciertos y fallos.</div>';
  quizBadge = pend.length + toGuess.length; if (typeof updateGamesDot === "function" && GAMES_READY) { updateGamesDot(); if (!curGame && !$("tab-games").classList.contains("hidden")) renderGameMenu(); }
}

// ================= Tres en raya =================
const SYM = { a: "💙", b: "💗" };
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const newGame = (prev) => {
  const starter = prev ? (prev.starter === "a" ? "b" : "a") : "a";
  return { b: Array(9).fill(""), turn: starter, starter, win: null, line: [], score: prev?.score || { a: 0, b: 0, d: 0 }, bet: prev?.bet ?? "El que pierda invita a la cena cuando nos veamos 🍝" };
};
const tttMyTurn = () => { const g = state.ttt; return !!(g && !g.win && g.turn === who); };
function renderTTT() {
  const g = state.ttt || newGame();
  $("tttScore").innerHTML = `<div><b>${g.score.a}</b><span>${SYM.a} ${esc(name("a"))}</span></div><div><b>${g.score.d}</b><span>empates</span></div><div><b>${g.score.b}</b><span>${SYM.b} ${esc(name("b"))}</span></div>`;
  $("tttTurn").textContent = g.win === "d" ? "¡Empate! 🤝" : g.win ? (g.win === who ? "¡Has ganado! 🎉" : `Ha ganado ${name(g.win)} 😅`) :
    g.turn === who ? `Tu turno ${SYM[who]}` : `Turno de ${name(g.turn)} ${SYM[g.turn]}…`;
  $("tttBoard").innerHTML = g.b.map((c, i) => `<button class="cell ${g.line.includes(i) ? "win" : ""}" data-i="${i}">${c ? SYM[c] : ""}</button>`).join("");
  $("tttBoard").querySelectorAll(".cell").forEach(c => c.onclick = () => move(+c.dataset.i));
  $("tttAgain").classList.toggle("hidden", !g.win);
  if (document.activeElement !== $("tttBet")) $("tttBet").value = g.bet || "";
}
function move(i) {
  const g0 = state.ttt || newGame();
  if (g0.win) return; if (g0.turn !== who) return toast("Espera a que juegue " + name(g0.turn));
  if (g0.b[i]) return;
  let res = null;
  S.tx("state/ttt", g => {
    g = g || newGame();
    if (g.win || g.turn !== who || g.b[i]) return null;
    g.b[i] = who;
    const l = LINES.find(L => L.every(k => g.b[k] === who));
    if (l) { g.win = who; g.line = l; g.score[who]++; res = "win"; }
    else if (g.b.every(Boolean)) { g.win = "d"; g.score.d++; res = "draw"; }
    else g.turn = other();
    return g;
  }).then(g => {
    if (!g) return; buzz();
    if (res === "win") addHearts(15, "tres en raya"); else if (res === "draw") addHearts(5, "empate");
    sendMsg(res === "win" ? "🏆 ¡Te he ganado al tres en raya! " + (g.bet ? "Recuerda: " + g.bet : "") : res === "draw" ? "🤝 Empate en el tres en raya" : "🎮 Te toca en el tres en raya", "ttt");
  }).catch(offline);
}
$("tttAgain").onclick = () => S.tx("state/ttt", g => g && g.win ? newGame(g) : null).then(g => { if (g) sendMsg("🔁 ¡Revancha en el tres en raya!", "ttt"); }).catch(offline);
$("tttBetSave").onclick = () => { S.merge("state/ttt", { bet: $("tttBet").value.trim() }); toast("Apuesta guardada 😏"); };

// ================= Recuerdos + mapa =================
let pendingPhoto = null, pendingPlace = null, pendingTaken = null, memList = [];

// --- Leer ubicación y fecha guardadas dentro de la foto (EXIF) ---
async function readExif(file) {
  try {
    const buf = await file.slice(0, 512 * 1024).arrayBuffer(), v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o < v.byteLength - 10) {
      const m = v.getUint16(o), len = v.getUint16(o + 2);
      if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10);
      if ((m & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
  } catch (e) { console.warn(e); }
  return null;
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949, u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  const ifd = off => { const n = u16(off), r = {}; for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; r[u16(e)] = e; } return r; };
  const i0 = ifd(t + u32(t + 4)), out = {};
  if (i0[0x8769]) {
    const ex = ifd(t + u32(i0[0x8769] + 8)), e = ex[0x9003];
    if (e) { let s = ""; const p = t + u32(e + 8); for (let k = 0; k < 19; k++) s += String.fromCharCode(v.getUint8(p + k));
      const mm = s.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/); if (mm) out.taken = new Date(+mm[1], mm[2] - 1, +mm[3], +mm[4], +mm[5]).getTime(); }
  }
  if (i0[0x8825]) {
    const g = ifd(t + u32(i0[0x8825] + 8));
    const ref = tag => g[tag] ? String.fromCharCode(v.getUint8(g[tag] + 8)) : "";
    const deg = tag => { if (!g[tag]) return NaN; const p = t + u32(g[tag] + 8), r = k => u32(p + k * 8) / u32(p + k * 8 + 4); return r(0) + r(1) / 60 + r(2) / 3600; };
    let lat = deg(2), lng = deg(4);
    if (isFinite(lat) && isFinite(lng) && (lat || lng)) {
      if (ref(1) === "S") lat = -lat; if (ref(3) === "W") lng = -lng;
      out.lat = lat; out.lng = lng;
    }
  }
  return out;
}

// --- Nombres de lugares (OpenStreetMap) ---
async function placeName(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&accept-language=es`);
    const j = await r.json(), a = j.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state || "";
    return { name: [city, a.country].filter(Boolean).join(", ") || "Lugar marcado", country: a.country || "" };
  } catch (e) { return { name: "Lugar marcado", country: "" }; }
}
async function searchPlaces(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&accept-language=es&q=${encodeURIComponent(q)}`);
  return (await r.json()).map(x => ({ lat: +x.lat, lng: +x.lon, name: x.display_name.split(",").slice(0, 3).join(","), country: (x.address || {}).country || "" }));
}

// --- Cargar Leaflet (mapas) solo cuando hace falta ---
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => window.L ? res(window.L) : (leafletP = null, rej(new Error("sin mapa"))); s.onerror = () => { leafletP = null; rej(new Error("sin mapa")); }; document.head.appendChild(s);
  });
  return leafletP;
}
// Mapa satélite (Esri, gratis y sin clave) con nombres de lugares encima.
// Si no carga, se prueba un satélite de reserva y, en último caso, el mapa normal.
const MAP_SOURCES = [
  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imágenes © Esri, Maxar, Earthstar Geographics", max: 19, labels: true },
  { url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imágenes © Esri, Maxar, Earthstar Geographics", max: 19, labels: true },
  { url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg", attr: "Sentinel-2 cloudless © EOX IT Services (Copernicus 2020)", max: 15, labels: true },
  { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', max: 19, labels: false }
];
const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
function baseMap(el) {
  const m = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([45, 10], 3);
  const labels = L.tileLayer(LABELS, { maxZoom: 19, attribution: "Nombres © Esri" });
  let idx = 0;
  const use = () => {
    const s = MAP_SOURCES[idx]; let ok = 0, bad = 0;
    const t = L.tileLayer(s.url, { attribution: s.attr, maxZoom: 19, maxNativeZoom: s.max });
    t.on("tileload", () => { ok++; });
    t.on("tileerror", () => {
      bad++;
      if (ok === 0 && bad >= 3 && idx < MAP_SOURCES.length - 1) {
        m.removeLayer(t); if (m.hasLayer(labels)) m.removeLayer(labels);
        idx++; use();
      }
    });
    t.addTo(m);
    if (s.labels) labels.addTo(m);
  };
  use();
  return m;
}

// --- Mapa de recuerdos ---
let memMap = null, memLayer = null, mapFitted = false;
async function initMemMap() {
  if (memMap) { setTimeout(() => memMap.invalidateSize(), 50); return; }
  try { await loadLeaflet(); } catch (e) { $("memMap").innerHTML = '<div class="mapmsg">🗺️ El mapa necesita internet</div>'; return; }
  $("memMap").innerHTML = "";
  memMap = baseMap($("memMap")); memLayer = L.layerGroup().addTo(memMap);
  drawMemMap();
}
function drawMemMap() {
  const withLoc = memList.filter(m => typeof m.lat === "number");
  const countries = new Set(withLoc.map(m => m.country).filter(Boolean));
  $("mapStats").innerHTML = withLoc.length ? `<span>📍 <b>${withLoc.length}</b> ${withLoc.length === 1 ? "lugar" : "lugares"}</span><span>🌍 <b>${countries.size || 1}</b> ${countries.size === 1 ? "país" : "países"}</span>`
    : `<span>Añadid lugares a vuestros recuerdos y aparecerán aquí 📍</span>`;
  if (!memMap) return;
  memLayer.clearLayers();
  withLoc.forEach(m => {
    const html = m.photo ? `<div class="pin ${m.from}"><div class="ph" style="background-image:url('${m.photo}')"></div></div>` : `<div class="pin ${m.from} nophoto">💗</div>`;
    const icon = L.divIcon({ html, className: "", iconSize: [40, 47], iconAnchor: [20, 46], popupAnchor: [0, -42] });
    const when = new Date(m.taken || m.at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    L.marker([m.lat, m.lng], { icon }).addTo(memLayer).bindPopup(
      `<div class="pop">${m.photo ? `<img src="${m.photo}">` : ""}<b>📍 ${esc(m.place || "")}</b>${m.text ? `<p>${esc(m.text)}</p>` : ""}<small>${esc(name(m.from))} · ${when}</small></div>`, { maxWidth: 240, minWidth: 200 });
  });
  if (withLoc.length && !mapFitted) {
    mapFitted = true;
    const b = L.latLngBounds(withLoc.map(m => [m.lat, m.lng]));
    memMap.fitBounds(b, { padding: [40, 40], maxZoom: 12 });
  }
}

// --- Selector de lugar ---
let pkMap = null, pkMarker = null, pkPick = null, pkDone = null;
async function openPicker(start, cb) {
  pkDone = cb; pkPick = start ? { ...start } : null;
  $("pkResults").innerHTML = ""; $("pkSearch").value = ""; $("pkOk").disabled = !pkPick;
  $("picker").showModal();
  try { await loadLeaflet(); } catch (e) { $("pkMap").innerHTML = '<div class="mapmsg">🗺️ Necesitas internet para el mapa</div>'; return; }
  if (!pkMap) {
    pkMap = baseMap($("pkMap"));
    pkMap.on("click", e => setPick(e.latlng.lat, e.latlng.lng, null));
  }
  setTimeout(() => {
    pkMap.invalidateSize();
    if (pkPick) { setPick(pkPick.lat, pkPick.lng, pkPick.place, pkPick.country); pkMap.setView([pkPick.lat, pkPick.lng], 11); }
    else { if (pkMarker) { pkMarker.remove(); pkMarker = null; } pkMap.setView([45, 10], 3); }
  }, 80);
}
async function setPick(lat, lng, place, country) {
  if (!pkMarker) pkMarker = L.marker([lat, lng]).addTo(pkMap); else pkMarker.setLatLng([lat, lng]);
  pkPick = { lat, lng, place: place || "…", country: country || "" }; $("pkOk").disabled = false;
  pkMarker.bindTooltip(pkPick.place, { permanent: true, direction: "top", offset: [-15, -12] }).openTooltip();
  if (!place) {
    const my = pkPick, n = await placeName(lat, lng);
    if (pkPick === my) { pkPick.place = n.name; pkPick.country = n.country; pkMarker.setTooltipContent(n.name); }
  }
}
async function doSearch() {
  const q = $("pkSearch").value.trim(); if (!q) return;
  $("pkResults").innerHTML = '<div class="sub">Buscando…</div>';
  try {
    const r = await searchPlaces(q);
    $("pkResults").innerHTML = r.length ? r.map((x, i) => `<button class="pkres" data-i="${i}">📍 ${esc(x.name)}</button>`).join("") : '<div class="sub">No encontré nada 🤔</div>';
    $("pkResults").querySelectorAll(".pkres").forEach(b => b.onclick = () => {
      const x = r[+b.dataset.i]; $("pkResults").innerHTML = "";
      setPick(x.lat, x.lng, x.name, x.country); pkMap && pkMap.setView([x.lat, x.lng], 11);
    });
  } catch (e) { $("pkResults").innerHTML = '<div class="sub">Necesitas internet para buscar</div>'; }
}
$("pkGo").onclick = doSearch;
$("pkSearch").onkeydown = e => { if (e.key === "Enter") doSearch(); };
$("pkClose").onclick = () => $("picker").close();
$("pkHere").onclick = () => {
  if (!navigator.geolocation) return toast("Tu móvil no deja ver la ubicación");
  toast("Buscando dónde estás… 📡");
  navigator.geolocation.getCurrentPosition(p => { setPick(p.coords.latitude, p.coords.longitude, null); pkMap && pkMap.setView([p.coords.latitude, p.coords.longitude], 13); },
    () => toast("No pude ver tu ubicación. Revisa los permisos 📍", 3500), { enableHighAccuracy: true, timeout: 12000 });
};
$("pkOk").onclick = () => { if (pkPick && pkDone) pkDone({ ...pkPick }); $("picker").close(); };

// --- Nuevo recuerdo ---
function showPending() {
  $("placeTxt").textContent = pendingPlace ? "📍 " + pendingPlace.place : "📍 Sin lugar";
  $("placeEdit").textContent = pendingPlace ? "Cambiar" : "Elegir lugar";
}
$("placeEdit").onclick = () => openPicker(pendingPlace, p => { pendingPlace = p; showPending(); });
$("memPhoto").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  const ex = await readExif(f);
  pendingTaken = ex && ex.taken || null;
  if (ex && typeof ex.lat === "number") {
    pendingPlace = { lat: ex.lat, lng: ex.lng, place: "…", country: "" }; showPending();
    const n = await placeName(ex.lat, ex.lng); pendingPlace = { ...pendingPlace, place: n.name, country: n.country }; showPending();
    toast("📍 He encontrado dónde hiciste la foto: " + n.name, 3500);
  } else if (!pendingPlace) toast("La foto no dice dónde se hizo. Elige el lugar abajo 📍", 3500);
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const max = 900, s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    pendingPhoto = c.toDataURL("image/jpeg", 0.72); URL.revokeObjectURL(url); $("photoName").textContent = "📷 Foto lista";
  };
  img.src = url;
});
$("memSave").onclick = () => {
  const text = $("memText").value.trim(); if (!text && !pendingPhoto) return toast("Escribe algo o añade una foto");
  const d = { from: who, text, photo: pendingPhoto, at: Date.now() };
  if (pendingTaken) d.taken = pendingTaken;
  if (pendingPlace) Object.assign(d, { lat: pendingPlace.lat, lng: pendingPlace.lng, place: pendingPlace.place, country: pendingPlace.country });
  S.add("memories", d);
  sendMsg(pendingPlace ? "📸 He guardado un recuerdo en " + pendingPlace.place + " 📍" : "📸 He guardado un recuerdo nuevo", "mem");
  $("memText").value = ""; pendingPhoto = null; pendingPlace = null; pendingTaken = null; showPending();
  $("photoName").textContent = ""; $("memPhoto").value = ""; toast("Guardado 💕");
  mapFitted = false;
};
function renderMem(list) {
  renderHome();
  memList = list;
  $("memories").innerHTML = list.length ? list.map(m => `<div class="mem">
    ${m.from === who ? `<button class="del" data-id="${esc(m.id)}">Borrar</button>` : ""}
    <div class="date">${esc(name(m.from))} · ${new Date(m.taken || m.at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</div>
    ${m.photo ? `<img src="${m.photo}" alt="" loading="lazy">` : ""}
    ${m.text ? `<div class="text">${esc(m.text)}</div>` : ""}
    ${typeof m.lat === "number" ? `<button class="memplace" data-go="${esc(m.id)}">📍 ${esc(m.place || "Ver en el mapa")}</button>` : `<button class="memplace add" data-add="${esc(m.id)}">📍 Añadir lugar</button>`}
    </div>`).join("") : '<div class="empty">Aún no hay recuerdos. Guardad el primero ✨</div>';
  $("memories").querySelectorAll(".del").forEach(b => b.onclick = () => { if (confirm("¿Borrar este recuerdo?")) S.del("memories/" + b.dataset.id); });
  $("memories").querySelectorAll("[data-add]").forEach(b => b.onclick = () => openPicker(null, p => {
    S.merge("memories/" + b.dataset.add, { lat: p.lat, lng: p.lng, place: p.place, country: p.country }); mapFitted = false; toast("📍 Lugar añadido");
  }));
  $("memories").querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
    const m = memList.find(x => x.id === b.dataset.go); if (m) goMemOnMap(m);
  });
  drawMemMap();
}


// ================= Planes (lista para tachar) =================
const PLAN_IDEAS = [
  ["🌅", "Ver el amanecer juntos"], ["🚆", "Un viaje en tren sin rumbo"], ["🍝", "Cocinar juntos una receta nueva"], ["🧺", "Un picnic en el parque"],
  ["🎬", "Noche de pelis con manta y palomitas"], ["🎤", "Ir a un concierto"], ["✈️", "Visitar un país nuevo"], ["🕯️", "Una cena romántica en casa"],
  ["🌊", "Bañarnos en el mar de noche"], ["📺", "Ver la misma peli a la vez por videollamada"], ["🍷", "Ir a una cata de vinos"], ["⛰️", "Hacer una ruta por la montaña"],
  ["🎡", "Subir a una noria"], ["📸", "Hacernos un fotomatón"], ["🏕️", "Dormir bajo las estrellas"], ["🎳", "Una tarde de bolos"],
  ["🥐", "Desayunar en la cama"], ["🚲", "Recorrer una ciudad en bici"], ["🎨", "Pintar un cuadro juntos"], ["💃", "Clase de baile juntos"],
  ["❄️", "Ver la nieve juntos"], ["🎢", "Ir a un parque de atracciones"], ["🐬", "Ir a un acuario"], ["📚", "Leer el mismo libro y comentarlo"]
];
let plans = [], showDone = false;
function renderPlans(list) {
  plans = list;
  const todo = list.filter(p => !p.done).sort((a, b) => a.at - b.at), done = list.filter(p => p.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const n = list.length;
  $("plBar").style.width = n ? Math.round(done.length / n * 100) + "%" : "0";
  $("plCount").textContent = n ? `${done.length} de ${n} planes cumplidos${done.length && done.length === n ? " 🎉" : ""}` : "Apuntad aquí todo lo que queréis hacer juntos ✨";
  const row = p => {
    const by = p.done ? `✅ ${esc(name(p.doneBy || p.from))} · ${new Date(p.doneAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}` : `Idea de ${esc(name(p.from))}`;
    return `<div class="plan ${p.done ? "done" : ""}" data-id="${esc(p.id)}">
      <button class="chk ${p.done ? "on" : ""}" data-chk="${esc(p.id)}" aria-label="Tachar">${p.done ? "✓" : ""}</button>
      <div class="pt"><div>${esc(p.cat || "💫")} ${esc(p.text)}</div><small>${by}</small></div>
      ${p.done ? `<button class="ph" data-ph="${esc(p.id)}">📸 Foto</button>` : ""}
      <button class="x" data-del="${esc(p.id)}" aria-label="Borrar">✕</button></div>`;
  };
  $("plList").innerHTML = todo.length ? todo.map(row).join("") : (n ? '<div class="empty">¡Todos cumplidos! Añadid más planes 💫</div>' : "");
  $("plDoneToggle").classList.toggle("hidden", !done.length);
  $("plDoneToggle").textContent = (showDone ? "▾ Ocultar" : "▸ Ver") + ` planes cumplidos (${done.length})`;
  $("plDone").classList.toggle("hidden", !showDone || !done.length);
  $("plDone").innerHTML = done.map(row).join("");
  document.querySelectorAll("#plansCard [data-chk]").forEach(b => b.onclick = () => togglePlan(b.dataset.chk));
  document.querySelectorAll("#plansCard [data-del]").forEach(b => b.onclick = () => {
    const p = plans.find(x => x.id === b.dataset.del); if (p && confirm(`¿Borrar "${p.text}"?`)) S.del("plans/" + p.id);
  });
  document.querySelectorAll("#plansCard [data-ph]").forEach(b => b.onclick = () => planPhoto(plans.find(x => x.id === b.dataset.ph)));
}
function addPlan(text, cat) {
  text = (text || "").trim(); if (!text) return toast("Escribe un plan");
  S.add("plans", { text: text.slice(0, 120), cat: cat || "💫", from: who, done: false, at: Date.now() });
  sendMsg(`📝 He añadido un plan: ${cat || "💫"} ${text}`, "plan"); buzz();
}
$("plAdd").onclick = () => { addPlan($("plText").value, $("plCat").value); $("plText").value = ""; };
$("plText").onkeydown = e => { if (e.key === "Enter") $("plAdd").click(); };
$("plIdeasBtn").onclick = () => {
  const have = new Set(plans.map(p => p.text.toLowerCase()));
  const pool = PLAN_IDEAS.filter(([, t]) => !have.has(t.toLowerCase())).sort(() => Math.random() - .5).slice(0, 4);
  $("plIdeas").innerHTML = pool.length ? pool.map(([c, t], i) => `<button data-i="${i}">＋ ${c} ${esc(t)}</button>`).join("") : '<div class="sub">¡Ya tenéis todas mis ideas! 😄</div>';
  $("plIdeas").querySelectorAll("button").forEach(b => b.onclick = () => { const [c, t] = pool[+b.dataset.i]; addPlan(t, c); b.remove(); });
};
$("plDoneToggle").onclick = () => { showDone = !showDone; renderPlans(plans); };
function togglePlan(id) {
  const p = plans.find(x => x.id === id); if (!p) return;
  if (p.done) {
    if (!confirm("¿Desmarcar este plan?")) return;
    S.merge("plans/" + id, { done: false, doneAt: null, doneBy: null }); return;
  }
  const el = document.querySelector(`.plan[data-id="${CSS.escape(id)}"]`); if (el) el.classList.add("pop");
  setTimeout(() => S.merge("plans/" + id, { done: true, doneAt: Date.now(), doneBy: who }), 250);
  confetti(); buzz([40, 60, 40]);
  sendMsg(`✅ ¡Plan cumplido! ${p.cat || ""} ${p.text}`, "plan");
  addHearts(20, "plan cumplido");
  $("plIdeas").innerHTML = `<div class="plbanner"><span>🎉 ¡Plan cumplido! ¿Guardáis una foto?</span><button class="btn primary" id="plPhotoNow">📸 Foto</button><button class="btn" id="plPhotoNo">✕</button></div>`;
  $("plPhotoNow").onclick = () => { $("plIdeas").innerHTML = ""; planPhoto(p); };
  $("plPhotoNo").onclick = () => { $("plIdeas").innerHTML = ""; };
}
function planPhoto(p) {
  if (!p) return;
  $("memText").value = `✅ ${p.cat || ""} ${p.text}`.trim();
  $("memText").scrollIntoView({ behavior: "smooth", block: "center" });
  $("memPhoto").click();
}
function confetti() {
  const E = ["🎉", "💖", "✨", "🥳", "💫", "🎊"];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement("div"); s.className = "confetti"; s.textContent = E[i % E.length];
    s.style.left = Math.random() * 100 + "vw"; s.style.animationDelay = Math.random() * .5 + "s"; s.style.animationDuration = 1.4 + Math.random() + "s";
    document.body.appendChild(s); setTimeout(() => s.remove(), 2600);
  }
}



// ================= Avisos con la app cerrada (Web Push) =================
let otherSub = null;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function u8(b64) { b64 = b64.replace(/-/g, "+").replace(/_/g, "/"); while (b64.length % 4) b64 += "="; const s = atob(b64); return Uint8Array.from(s, c => c.charCodeAt(0)); }
function pushState() {
  if (S.demo || !CONFIG.pushUrl || !CONFIG.vapidPublic) return "off";
  if (isIOS && !standalone()) return "needHome";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted" && ls.get("pushOn") === "1") return "on";
  return "ask";
}
function renderPush() {
  const st = pushState(), b = $("pushBanner");
  const hide = ls.get("pushBanHide") === "1";
  const msg = {
    needHome: `🔔 Para recibir avisos, añade la app a la <b>pantalla de inicio</b> (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí.`,
    ask: `🔔 Activa los avisos para enterarte cuando ${esc(name(other()))} te escriba, aunque la app esté cerrada.`,
    denied: `🔕 Tienes los avisos bloqueados. Actívalos en Ajustes del móvil → Notificaciones → Nosotros.`,
    unsupported: `🔕 Este navegador no permite avisos. Prueba con Safari (iPhone) o Chrome (Android).`
  }[st];
  b.classList.toggle("hidden", !msg || hide);
  if (msg) {
    b.innerHTML = `<span>${msg}</span>${st === "ask" ? `<button class="btn primary" id="pushGo">Activar</button>` : ""}<button class="x" id="pushX">✕</button>`;
    const g = $("pushGo"); if (g) g.onclick = enablePush;
    $("pushX").onclick = () => { ls.set("pushBanHide", "1"); b.classList.add("hidden"); };
  }
  const sp = $("sPush");
  if (sp) sp.innerHTML = st === "off" ? "" : `<label>Avisos con la app cerrada</label>${st === "on"
    ? `<div class="row" style="align-items:center"><span style="flex:1;font-size:14px">🔔 Activados${otherSub ? "" : ` · ${esc(name(other()))} aún no los ha activado`}</span><button class="btn" id="sPushTest">Probar</button></div>`
    : st === "ask" ? `<button class="btn primary" id="sPushOn" style="width:100%">🔔 Activar avisos</button>` : `<div class="sub" style="margin:0">${msg}</div>`}`;
  const t = $("sPushTest"); if (t) t.onclick = testPush;
  const o = $("sPushOn"); if (o) o.onclick = enablePush;
}
async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Sin permiso no puedo avisarte 🔕", 3500); renderPush(); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(CONFIG.vapidPublic) });
    await S.merge("push/" + who, { sub: JSON.parse(JSON.stringify(sub)), at: Date.now(), device: isIOS ? "iPhone" : "otro" });
    ls.set("pushOn", "1"); renderPush(); toast("🔔 ¡Avisos activados!"); buzz();
  } catch (e) { console.error(e); toast("No se pudieron activar los avisos: " + (e.message || e), 5000); }
}
async function refreshPushSub() {   // si el móvil renueva la suscripción, la guardamos otra vez
  if (pushState() !== "on") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(CONFIG.vapidPublic) });
    const j = JSON.parse(JSON.stringify(sub));
    if (ls.get("pushEp") !== j.endpoint) { await S.merge("push/" + who, { sub: j, at: Date.now() }); ls.set("pushEp", j.endpoint); }
  } catch (e) { console.warn(e); }
}
async function pushTo(sub, title, body) {
  if (!CONFIG.pushUrl || !sub || !sub.endpoint) return null;
  try {
    const r = await fetch(CONFIG.pushUrl, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: CONFIG.pushSecret, sub, title, body, url: location.href.split("#")[0], tag: "nosotros-" + Date.now() }) });
    return await r.json();
  } catch (e) { console.warn("push", e); return null; }
}
function notifyOther(body) {
  if (S.demo || !otherSub) return;
  pushTo(otherSub, name(who) + " 💌", body).then(r => { if (r && r.gone) S.merge("push/" + other(), { sub: null }); });
}
async function testPush() {
  const d = await new Promise(res => { const un = S.watchDoc("push/" + who, x => { res(x); setTimeout(() => un && un(), 0); }); });
  const r = await pushTo(d && d.sub, "Nosotros 🔔", "¡Los avisos funcionan! 🎉");
  toast(r && r.ok ? "Aviso de prueba enviado: te llegará en unos segundos 🔔" : "El aviso de prueba falló" + (r ? ` (${r.status || r.error})` : " (sin conexión con el servidor)"), 4500);
}

// ================= Utilidades comunes =================
const fmtDate = (t, o = { day: "numeric", month: "short", year: "numeric" }) => new Date(t).toLocaleDateString("es-ES", o);
const localKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function shrinkPhoto(file, max = 900, q = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", q));
    };
    img.onerror = rej; img.src = url;
  });
}
function readView({ icon, title, sub, text, img, nav }) {
  $("rvIcon").textContent = icon; $("rvTitle").textContent = title; $("rvSub").textContent = sub || "";
  $("rvText").textContent = text || "";
  $("rvImg").classList.toggle("hidden", !img); if (img) $("rvImg").src = img;
  $("rvNav").innerHTML = nav || "";
  $("readView").classList.remove("hidden"); $("readView").scrollTop = 0;
}
$("rvClose").onclick = () => $("readView").classList.add("hidden");

// ================= Estado de ánimo =================
const MOODS = ["😄", "🥰", "🙂", "😐", "😴", "😔", "😢", "😤"];
const MOOD_TXT = { "😄": "genial", "🥰": "con mucho amor", "🙂": "bien", "😐": "normal", "😴": "con sueño", "😔": "de bajón", "😢": "triste", "😤": "de mal humor" };
// Christian (a) en masculino, Celia (b) en femenino: "enfadado/a" → "enfadado" / "enfadada"
const gz = (t, w) => String(t).replace(/(\w+)o\/a\b/g, (_, r) => r + (w === "b" ? "a" : "o"));
let moods = {};
function renderMoods(list) {
  renderHome();
  if (list) { moods = {}; list.forEach(m => moods[m.id] = m); }
  const t = localKey(), mine = (moods[t] || {})[who], theirs = (moods[t] || {})[other()];
  $("moodPick").innerHTML = MOODS.map(e => `<button class="${mine === e ? "on" : ""}" data-m="${e}">${e}</button>`).join("");
  $("moodPick").querySelectorAll("button").forEach(b => b.onclick = () => {
    const e = b.dataset.m;
    S.merge("moods/" + t, { [who]: e, at: Date.now() }); buzz(20);
    if (mine !== e) sendMsg(`${e} Hoy me siento ${MOOD_TXT[e]}`, "mood");
    moods[t] = { ...(moods[t] || {}), [who]: e }; renderMoods();
  });
  const o = name(other());
  $("moodOther").innerHTML = theirs
    ? `${esc(o)} hoy está ${theirs} <b>${MOOD_TXT[theirs]}</b>` + (["😔", "😢", "😤", "😴"].includes(theirs) ? ` <button class="linkbtn" id="moodHug">· Mándale un mimo 💗</button>` : "")
    : `${esc(o)} aún no ha dicho cómo está hoy`;
  const mh = $("moodHug"); if (mh) mh.onclick = () => { sendMsg("🤗 Te mando un abrazo muy fuerte, todo va a ir bien 💗", "think"); toast("Mimo enviado 💗"); };
  let cal = `<div></div>`, days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * DAY); days.push(localKey(d)); cal += `<div class="d">${d.getDate()}</div>`; }
  for (const w of [who, other()]) {
    cal += `<div class="n">${esc(name(w))}</div>` + days.map(k => { const e = (moods[k] || {})[w]; return `<div class="e ${e ? "" : "empty"}">${e || "·"}</div>`; }).join("");
  }
  $("moodCal").innerHTML = cal;
}

// ================= Buenas noches =================
const NIGHT = ["Buenas noches, mi amor 🌙 Sueña conmigo", "Que descanses 💤 Te quiero", "Buenas noches ✨ Mañana te echo de menos otra vez", "Un beso de buenas noches 😘🌙", "Duerme bien, ojalá estuvieras aquí 🌙"];
$("btnNight").onclick = () => {
  buzz(40); sendMsg(NIGHT[Math.floor(Math.random() * NIGHT.length)], "night");
  petTx(p => { setNeed(p, "energy", 0); p.napStart = Date.now(); p.nap = Date.now() + 8 * 36e5; return p; }).catch(() => {});
  toast(`Beso de buenas noches enviado a ${name(other())} 🌙 ${(state.pet && state.pet.name) || "El pollito"} se va a dormir`, 3200);
};

// ================= Notas de voz =================
let rec = null, recChunks = [], recStart = 0, recTimer = null, voiceDraft = null, playing = null;
function pickMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}
async function startRec() {
  const mime = pickMime(); if (mime === null) return toast("Tu móvil no deja grabar audio aquí 😕");
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return toast("Necesito permiso para el micrófono 🎙️", 3500); }
  recChunks = [];
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined); } catch (e) { rec = new MediaRecorder(stream); }
  rec.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(recTimer); $("voiceBtn").classList.remove("rec"); $("voiceBtn").textContent = "🎙️";
    const dur = Math.round((Date.now() - recStart) / 1000);
    const blob = new Blob(recChunks, { type: rec.mimeType || mime || "audio/mp4" }); rec = null;
    if (dur < 1 || blob.size < 500) { $("voiceBar").classList.add("hidden"); return toast("Muy corta 🙈"); }
    if (blob.size > 700 * 1024) { $("voiceBar").classList.add("hidden"); return toast("Demasiado larga, máximo 1 minuto"); }
    const fr = new FileReader(); fr.onload = () => { voiceDraft = { audio: fr.result, dur }; showVoiceDraft(); }; fr.readAsDataURL(blob);
  };
  rec.start(); recStart = Date.now();
  $("voiceBtn").classList.add("rec"); $("voiceBtn").textContent = "⏹";
  $("voiceBar").classList.remove("hidden"); $("voiceBar").innerHTML = `<span>🔴 Grabando… <b id="recT">0:00</b></span><button class="btn" id="recStop">Parar</button>`;
  $("recStop").onclick = () => rec && rec.stop();
  recTimer = setInterval(() => { const s = Math.round((Date.now() - recStart) / 1000); const e = $("recT"); if (e) e.textContent = `0:${String(s).padStart(2, "0")}`; if (s >= 60 && rec) rec.stop(); }, 250);
}
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
function showVoiceDraft() {
  $("voiceBar").classList.remove("hidden");
  $("voiceBar").innerHTML = `<span>🎙️ Nota de voz · ${mmss(voiceDraft.dur)}</span><button class="btn" id="vdPlay">▶</button><button class="btn primary" id="vdSend">Enviar</button><button class="btn" id="vdX">✕</button>`;
  $("vdPlay").onclick = () => playAudio(voiceDraft.audio, null);
  $("vdSend").onclick = () => {
    S.add("messages", { from: who, kind: "voice", text: "🎙️ Nota de voz", audio: voiceDraft.audio, dur: voiceDraft.dur, at: Date.now() });
    notifyOther("🎙️ Te ha enviado una nota de voz");
    voiceDraft = null; $("voiceBar").classList.add("hidden"); buzz(); toast("Nota de voz enviada 🎙️");
  };
  $("vdX").onclick = () => { voiceDraft = null; $("voiceBar").classList.add("hidden"); };
}
$("voiceBtn").onclick = () => { if (rec) rec.stop(); else startRec(); };
function playAudio(src, el) {
  if (playing) { playing.a.pause(); playing.el && playing.el.classList.remove("playing"); const same = playing.src === src; playing = null; if (same) return; }
  const a = new Audio(src); playing = { a, el, src };
  if (el) el.classList.add("playing");
  a.onended = () => { el && el.classList.remove("playing"); playing = null; };
  a.play().catch(() => { toast("No se pudo reproducir en este móvil 😕"); el && el.classList.remove("playing"); playing = null; });
}

// ================= Ruleta personalizada =================
// Las opciones las ponéis vosotros y se comparten entre los dos móviles (state/wheel)
const WCOL = ["#ff6b8b", "#ffb38a", "#ffd93b", "#9ff0cf", "#9fd3ff", "#cdb4ff"];
let wheelItems = [], wheelRot = 0, wheelBusy = false;
function drawWheel(d) {
  if (d !== undefined) wheelItems = (d && d.items) || [];
  const n = wheelItems.length, W = $("wheel");
  if (n < 2) {
    W.classList.add("empty"); W.style.background = "";
    W.innerHTML = `<span class="wtxt">Añadid al menos 2 opciones abajo 👇</span>`;
  } else {
    W.classList.remove("empty");
    const step = 360 / n, r = n > 10 ? 112 : 105, fs = n > 14 ? 17 : 24;
    W.style.background = `conic-gradient(${wheelItems.map((_, i) => `${WCOL[i % WCOL.length]} ${i * step}deg ${(i + 1) * step}deg`).join(",")})`;
    W.innerHTML = wheelItems.map((it, i) => { const a = (i + .5) * step; return `<span style="font-size:${fs}px;transform:rotate(${a}deg) translateY(-${r}px) rotate(${-a}deg)">${esc(it.e || "⭐")}</span>`; }).join("");
  }
  $("wheelSpin").disabled = n < 2;
  $("wList").innerHTML = n ? wheelItems.map((it, i) => `<div class="lrow"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;flex:none;background:${WCOL[i % WCOL.length]}"></span><span>${esc(it.e || "⭐")} ${esc(it.t)}</span><button class="x" data-wd="${i}">✕</button></div>`).join("")
    : '<div class="empty">Ideas: "Peli y manta", "Quien pierda paga la cena", "Masaje de 10 min", "Videollamada sorpresa"…</div>';
  $("wList").querySelectorAll("[data-wd]").forEach(b => b.onclick = () => {
    const it = wheelItems[+b.dataset.wd]; if (!it || !confirm(`¿Quitar "${it.t}"?`)) return;
    S.tx("state/wheel", w => { w = w || { items: [] }; w.items = w.items.filter(x => !(x.t === it.t && x.e === it.e)); return w; }).catch(offline);
  });
}
function addWheel() {
  const t = $("wText").value.trim(); if (!t) return toast("Escribe una opción");
  const e = $("wEmoji").value;
  if (wheelItems.length >= 20) return toast("Máximo 20 opciones");
  S.tx("state/wheel", w => { w = w || { items: [] }; w.items = [...(w.items || []), { e, t: t.slice(0, 60), by: who }]; return w; })
    .then(() => { $("wText").value = ""; buzz(15); }).catch(offline);
}
$("wAdd").onclick = addWheel;
$("wText").onkeydown = e => { if (e.key === "Enter") addWheel(); };
$("wheelSpin").onclick = () => {
  const n = wheelItems.length; if (wheelBusy || n < 2) return; wheelBusy = true; buzz(20);
  const items = wheelItems.slice(), step = 360 / n, pick = Math.floor(Math.random() * n);
  const target = 360 - (pick + .5) * step + (Math.random() - .5) * step * .6;
  wheelRot += 360 * 5 + ((target - wheelRot) % 360 + 360) % 360;
  $("wheel").style.transform = `rotate(${wheelRot}deg)`; $("wheelRes").innerHTML = "";
  setTimeout(() => {
    wheelBusy = false; buzz([30, 40, 30]);
    const { e, t } = items[pick];
    $("wheelRes").innerHTML = `<div class="wres"><div class="sub" style="margin:0">Ha salido:</div><div class="big2">${esc(e || "⭐")} ${esc(t)}</div>
      <div class="row"><button class="btn" style="flex:1" id="wrPlan">📝 A planes</button><button class="btn primary" style="flex:1" id="wrSend">💬 Contárselo</button></div></div>`;
    $("wrPlan").onclick = () => { addPlan(t, e); toast("Añadido a vuestros planes 📝"); };
    $("wrSend").onclick = () => { sendMsg(`🎡 La ruleta ha dicho: ${e} ${t}`, "wheel"); toast(`Enviado a ${name(other())} 💌`); };
  }, 4300);
};

// ================= Minijuego: atrapa fresas =================
const FG_ITEMS = [{ e: "🍓", v: 1, w: 50 }, { e: "🍒", v: 1, w: 25 }, { e: "⭐", v: 3, w: 8 }, { e: "🌶️", v: -2, w: 17 }];
let fg = null;
function fgInfo() {
  const p = state.pet || {}, d = p.day && p.day.d === dayKey() ? p.day : {};
  const got = (d.game || {})[who] || 0;
  const bb = p.best_by || {};
  $("fgInfo").textContent = (got >= 30 ? "Hoy ya has ganado el máximo (30 🪙)" : `Hoy puedes ganar ${30 - got} 🪙 más`) + ` · 🏆 ${name("a")} ${bb.a || 0} · ${name("b")} ${bb.b || 0}`;
}
$("fgPlay").onclick = () => {
  if (awayToast()) return;
  if (mg) { mgStop(); mg = null; }
  $("fgView").classList.remove("hidden"); document.body.style.overflow = "hidden";
  const cv = $("fgCanvas"), dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  fg = { ctx, W, H, x: W / 2, items: [], score: 0, left: 30, last: 0, spawn: 0, run: false, raf: 0, t0: 0 };
  $("fgScore").textContent = "🍓 0"; $("fgTime").textContent = "⏱ 30";
  $("fgMsg").innerHTML = `<div style="font-size:40px">🐤</div>Mueve el dedo para atrapar<br>🍓🍒 +1 · ⭐ +3 · 🌶️ −2<button class="btn primary" id="fgGo">¡Empezar!</button>`;
  $("fgGo").onclick = () => { $("fgMsg").innerHTML = ""; fg.run = true; fg.t0 = performance.now(); fg.last = fg.t0; fg.raf = requestAnimationFrame(fgLoop); };
  fgDraw();
};
const fgMove = e => { if (!fg) return; const r = $("fgCanvas").getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; fg.x = Math.max(28, Math.min(fg.W - 28, cx)); if (!fg.run) fgDraw(); };
$("fgCanvas").addEventListener("touchmove", e => { e.preventDefault(); fgMove(e); }, { passive: false });
$("fgCanvas").addEventListener("touchstart", fgMove, { passive: true });
$("fgCanvas").addEventListener("mousemove", fgMove);
function fgPick() { const tot = FG_ITEMS.reduce((a, b) => a + b.w, 0); let r = Math.random() * tot; for (const it of FG_ITEMS) { if ((r -= it.w) < 0) return it; } return FG_ITEMS[0]; }
function fgLoop(t) {
  if (!fg || !fg.run) return;
  const dt = Math.min(50, t - fg.last) / 1000; fg.last = t;
  const el = (t - fg.t0) / 1000; fg.left = Math.max(0, 30 - el);
  fg.spawn -= dt; const rate = 0.55 - Math.min(0.3, el * 0.01);
  if (fg.spawn <= 0) { fg.spawn = rate; const it = fgPick(); fg.items.push({ ...it, x: 20 + Math.random() * (fg.W - 40), y: -20, vy: 160 + el * 6 + Math.random() * 60 }); }
  const cy = fg.H - 60;
  fg.items.forEach(o => { o.y += o.vy * dt; if (!o.hit && o.y > cy - 26 && o.y < cy + 20 && Math.abs(o.x - fg.x) < 38) { o.hit = true; fg.score = Math.max(0, fg.score + o.v); fg.flash = { v: o.v, t: 0.6 }; if (navigator.vibrate) navigator.vibrate(o.v > 0 ? 15 : [30, 30, 30]); } });
  fg.items = fg.items.filter(o => !o.hit && o.y < fg.H + 30);
  if (fg.flash) fg.flash.t -= dt;
  $("fgScore").textContent = "🍓 " + fg.score; $("fgTime").textContent = "⏱ " + Math.ceil(fg.left);
  fgDraw();
  if (fg.left <= 0) return fgEnd();
  fg.raf = requestAnimationFrame(fgLoop);
}
function fgDraw() {
  const { ctx, W, H } = fg; ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#7cc95b"; ctx.beginPath(); ctx.ellipse(W / 2, H + 30, W * .8, 70, 0, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "32px system-ui, Apple Color Emoji, Segoe UI Emoji"; fg.items.forEach(o => ctx.fillText(o.e, o.x, o.y));
  const p = state.pet || {}, C = COLORS.find(c => c.id === p.color) || COLORS[0], cy = fg.H - 60, x = fg.x;
  ctx.fillStyle = C.dark; ctx.beginPath(); ctx.ellipse(x - 27, cy + 6, 9, 16, .4, 0, Math.PI * 2); ctx.ellipse(x + 27, cy + 6, 9, 16, -.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.body; ctx.beginPath(); ctx.arc(x, cy, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.belly; ctx.beginPath(); ctx.ellipse(x, cy + 12, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b1a10"; ctx.beginPath(); ctx.arc(x - 10, cy - 6, 4, 0, Math.PI * 2); ctx.arc(x + 10, cy - 6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff9f1c"; ctx.beginPath(); ctx.moveTo(x - 8, cy + 1); ctx.lineTo(x + 8, cy + 1); ctx.lineTo(x, cy + (fg.run ? 12 : 8)); ctx.fill();
  ctx.fillStyle = "rgba(255,143,163,.7)"; ctx.beginPath(); ctx.ellipse(x - 19, cy + 4, 5, 3, 0, 0, Math.PI * 2); ctx.ellipse(x + 19, cy + 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  if (fg.flash && fg.flash.t > 0) { ctx.font = "bold 22px system-ui"; ctx.fillStyle = fg.flash.v > 0 ? "#1f8a4c" : "#d0304a"; ctx.fillText((fg.flash.v > 0 ? "+" : "") + fg.flash.v, x, cy - 50 - (0.6 - fg.flash.t) * 40); }
}
function fgEnd() {
  fg.run = false; cancelAnimationFrame(fg.raf);
  const score = fg.score; let gain = 0, prevOther = 0, prevMine = 0;
  petTx(p => { p.day.game = p.day.game || {}; const got = p.day.game[who] || 0; const gm = setOn(p, "vaquero") ? 1.5 : 1; gain = Math.max(0, Math.min(Math.floor(score / 2 * gm), Math.round(30 * gm) - got)); p.day.game[who] = got + gain; p.coins += gain; p.best_game = Math.max(p.best_game || 0, score); prevOther = (p.best_by || {})[other()] || 0; prevMine = (p.best_by || {})[who] || 0; p.best_by = { ...(p.best_by || {}), [who]: Math.max(prevMine, score) }; bump(p, "game"); return p; })
    .then(() => {
      const best = (state.pet && state.pet.best_game) || score;
      $("fgMsg").innerHTML = `<div style="font-size:40px">${score >= 20 ? "🏆" : score >= 10 ? "🥳" : "🐤"}</div>¡Has atrapado <b>${score}</b>!<br>${gain ? `+${gain} 🪙 para la mascota` : "Hoy ya no ganas más monedas"}<br><small>Récord: ${best}</small>
        <button class="btn primary" id="fgAgain">Otra vez 🔁</button><button class="btn" id="fgOut">Salir</button>`;
      $("fgAgain").onclick = () => $("fgPlay").click(); $("fgOut").onclick = fgClose;
      if (score > prevOther && prevMine <= prevOther && prevOther > 0) sendMsg(`🏆 ¡He batido tu récord en Atrapa fresas: ${score}! 🍓`, "game");
      else if (score >= 15) sendMsg(`🍓 He atrapado ${score} fresas en el minijuego. ¡Supérame!`, "game");
    }).catch(() => { $("fgMsg").innerHTML = `¡Has atrapado <b>${score}</b>!<button class="btn" id="fgOut">Salir</button>`; $("fgOut").onclick = fgClose; });
}
function fgClose() { if (fg) { fg.run = false; cancelAnimationFrame(fg.raf); } fg = null; $("fgView").classList.add("hidden"); document.body.style.overflow = ""; fgInfo(); }
$("fgQuit").onclick = () => (mg ? mgClose() : fgClose());


// =====================================================================
//                         JUEGOS (menú y nuevos)
// =====================================================================
const G = { c4: null, bs: null, wordle: null, wyr: null, tod: null, memory: null, scratch: null, shop: null };
let drawings = [], vouchers = [], quizBadge = 0, curGame = null;
const norm = s => String(s || "").toUpperCase().replace(/Ñ/g, "#").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/#/g, "Ñ").trim();
const rnd = a => a[Math.floor(Math.random() * a.length)];
const SYMC = { a: "#4d9dff", b: "#ff6b8b" };

const GAMES = [
  { id: "quiz", e: "💭", n: "¿Me conoces?" }, { id: "ttt", e: "❌", n: "Tres en raya" }, { id: "c4", e: "🔴", n: "Conecta 4" },
  { id: "bs", e: "🚢", n: "Hundir la flota" }, { id: "wordle", e: "🔤", n: "Wordle" }, { id: "draw", e: "🎨", n: "Dibuja y adivina" },
  { id: "wyr", e: "⚖️", n: "¿Qué prefieres?" }, { id: "tod", e: "🤫", n: "Verdad o reto" }, { id: "memory", e: "🧩", n: "Memory" },
  { id: "scratch", e: "🎟️", n: "Rasca y gana" }, { id: "shop", e: "🛍️", n: "Tienda de vales" }, { id: "wheel", e: "🎡", n: "Ruleta" },
  { id: "ach", e: "🏅", n: "Logros" }
];
function gameBadge(id) {
  const g = G;
  switch (id) {
    case "quiz": return quizBadge ? { t: "¡Te toca!", hot: 1 } : null;
    case "ttt": return tttMyTurn() ? { t: "¡Te toca!", hot: 1 } : null;
    case "c4": return g.c4 && !g.c4.win && g.c4.turn === who ? { t: "¡Te toca!", hot: 1 } : null;
    case "bs": if (!g.bs || g.bs.phase === "end") return null;
      if (g.bs.phase === "setup" && !(g.bs.ready || {})[who]) return { t: "Coloca tu flota", hot: 1 };
      return g.bs.phase === "play" && g.bs.turn === who ? { t: "¡Te toca!", hot: 1 } : null;
    case "wordle": return g.wordle && g.wordle.status === "play" && g.wordle.setter !== who ? { t: "¡Adivina!", hot: 1 } : null;
    case "draw": { const n = drawings.filter(d => d.to === who && !d.solved && !d.gaveUp).length; return n ? { t: n + " por adivinar", hot: 1 } : null; }
    case "wyr": { const n = wyrPendingForMe(); return n ? { t: n + " nuevas", hot: 0 } : null; }
    case "scratch": return ((g.scratch || {}).last || {})[who] !== dayKey() ? { t: "¡Disponible!", hot: 0 } : null;
    case "shop": { const n = (((g.shop || {}).offers || {})[other()] || []).length; return n ? { t: n + " a la venta", hot: 0 } : null; }
  }
  return null;
}
function renderGameMenu() {
  renderHearts();
  $("gameMenu").innerHTML = GAMES.map(x => { const b = gameBadge(x.id); return `<button class="gcard" data-open="${x.id}"><i>${x.e}</i><b>${x.n}</b>${b ? `<span class="gbadge ${b.hot ? "hot" : ""}">${b.t}</span>` : ""}</button>`; }).join("");
  $("gameMenu").querySelectorAll("[data-open]").forEach(b => b.onclick = () => openGame(b.dataset.open));
  updateGamesDot();
}
function updateGamesDot() { $("dotGames").classList.toggle("hidden", !GAMES.some(x => { const b = gameBadge(x.id); return b && b.hot; })); }
function openGame(id) {
  curGame = id;
  $("gameMenu").classList.add("hidden"); $("gameHead").classList.remove("hidden");
  const g = GAMES.find(x => x.id === id); $("gameTitle").textContent = g.e + " " + g.n;
  GAMES.forEach(x => { const el = $("g-" + x.id); if (el) el.classList.toggle("hidden", x.id !== id); });
  document.querySelectorAll(".oname").forEach(e => e.textContent = name(other()));
  ({ quiz: renderQuiz, ttt: renderTTT, c4: renderC4, bs: renderBS, wordle: renderWordle, draw: renderDraw, wyr: renderWyr, tod: renderTod, memory: () => mm ? renderMM() : newMM(), scratch: renderScratch, shop: renderShop2, wheel: () => drawWheel(), ach: renderAch }[id] || (() => {}))();
  window.scrollTo(0, 0);
}
function closeGame() {
  curGame = null; $("gameMenu").classList.remove("hidden"); $("gameHead").classList.add("hidden");
  GAMES.forEach(x => { const el = $("g-" + x.id); if (el) el.classList.add("hidden"); });
  renderGameMenu(); window.scrollTo(0, 0);
}
$("gameBack").onclick = closeGame;
const gRefresh = id => { if (curGame === id) openGameRender(id); renderGameMenu(); };
function openGameRender(id) { ({ c4: renderC4, bs: renderBS, wordle: renderWordle, draw: renderDraw, wyr: renderWyr, tod: renderTod, memory: renderMMBest, scratch: renderScratch, shop: renderShop2 }[id] || (() => {}))(); }

// ---------------- Conecta 4 ----------------
const c4New = prev => { const starter = prev ? (prev.starter === "a" ? "b" : "a") : "a"; return { b: Array(42).fill(""), turn: starter, starter, win: null, line: [], score: prev?.score || { a: 0, b: 0, d: 0 }, at: Date.now() }; };
function c4Line(b, w) {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    if (b[r * 7 + c] !== w) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = []; for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr > 5 || cc < 0 || cc > 6 || b[rr * 7 + cc] !== w) break; cells.push(rr * 7 + cc); }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}
function renderC4() {
  const g = G.c4 || c4New();
  $("c4Score").innerHTML = `<div><b>${g.score.a}</b><span style="color:${SYMC.a}">● ${esc(name("a"))}</span></div><div><b>${g.score.d}</b><span>empates</span></div><div><b>${g.score.b}</b><span style="color:${SYMC.b}">● ${esc(name("b"))}</span></div>`;
  $("c4Turn").innerHTML = g.win === "d" ? "¡Empate! 🤝" : g.win ? (g.win === who ? "¡Has ganado! 🎉" : `Ha ganado ${esc(name(g.win))} 😅`) : g.turn === who ? `Tu turno <span style="color:${SYMC[who]}">●</span> Toca una columna` : `Turno de ${esc(name(g.turn))}…`;
  $("c4Board").innerHTML = g.b.map((v, i) => `<div class="c4c ${g.line.includes(i) ? "win" : ""}" data-col="${i % 7}"><span style="${v ? `background:${SYMC[v]}` : ""}"></span></div>`).join("");
  $("c4Board").querySelectorAll("[data-col]").forEach(c => c.onclick = () => c4Drop(+c.dataset.col));
  $("c4Again").classList.toggle("hidden", !g.win);
}
function c4Drop(col) {
  const g0 = G.c4 || c4New();
  if (g0.win) return; if (g0.turn !== who) return toast("Espera a que juegue " + name(g0.turn));
  let res = null;
  S.tx("games/c4", g => {
    g = g || c4New(); if (g.win || g.turn !== who) return null;
    let r = 5; while (r >= 0 && g.b[r * 7 + col]) r--; if (r < 0) return null;
    g.b[r * 7 + col] = who;
    const l = c4Line(g.b, who);
    if (l) { g.win = who; g.line = l; g.score[who]++; res = "win"; }
    else if (g.b.every(Boolean)) { g.win = "d"; g.score.d++; res = "draw"; }
    else { g.turn = other(); res = "move"; }
    return g;
  }).then(g => {
    if (!g) return; buzz(20);
    if (res === "win") { addHearts(15, "Conecta 4"); confetti(); sendMsg("🔴 ¡Te he ganado al Conecta 4!", "game"); }
    else if (res === "draw") { addHearts(5, "empate"); sendMsg("🤝 Empate en el Conecta 4", "game"); }
    else sendMsg("🔴 Te toca en el Conecta 4", "game");
  }).catch(offline);
}
$("c4Again").onclick = () => S.tx("games/c4", g => g && g.win ? c4New(g) : null).then(g => { if (g) sendMsg("🔁 ¡Revancha al Conecta 4!", "game"); }).catch(offline);

// ---------------- Hundir la flota ----------------
const BS_N = 8, FLEET = [4, 3, 3, 2, 2];
let bsDraft = null;
function randomFleet() {
  const occ = new Set(), ships = [];
  for (const len of FLEET) for (let t = 0; t < 500; t++) {
    const h = Math.random() < .5, r = Math.floor(Math.random() * (h ? BS_N : BS_N - len + 1)), c = Math.floor(Math.random() * (h ? BS_N - len + 1 : BS_N));
    const cells = []; for (let k = 0; k < len; k++) cells.push(h ? r * BS_N + c + k : (r + k) * BS_N + c);
    if (cells.some(x => occ.has(x))) continue; cells.forEach(x => occ.add(x)); ships.push({ c: cells }); break;
  }
  return ships;
}
const bsNew = prev => { const starter = prev ? (prev.starter === "a" ? "b" : "a") : "a"; return { phase: "setup", ships: {}, ready: {}, shots: { a: [], b: [] }, turn: starter, starter, win: null, last: null, score: prev?.score || { a: 0, b: 0 }, at: Date.now() }; };
function bsGrid(el, cells, clickable, onClick) {
  el.innerHTML = cells.map((c, i) => `<div class="bsc ${c.cls || ""} ${clickable && c.can ? "can" : ""}" data-i="${i}">${c.t || ""}</div>`).join("");
  if (clickable) el.querySelectorAll(".bsc.can").forEach(d => d.onclick = () => onClick(+d.dataset.i));
}
function renderBS() {
  const g = G.bs || bsNew(), me = who, ot = other();
  $("bsScore").innerHTML = `<div><b>${g.score.a}</b><span>⚓ ${esc(name("a"))}</span></div><div><b>${g.score.b}</b><span>⚓ ${esc(name("b"))}</span></div>`;
  const myShips = (g.ships[me] || (bsDraft = bsDraft || randomFleet())), shipSet = new Set(myShips.flatMap(s => s.c));
  const theirShots = new Set((g.shots || {})[ot] || []), myShots = new Set((g.shots || {})[me] || []);
  const otherCells = new Set(((g.ships || {})[ot] || []).flatMap(s => s.c));
  const sunkCells = new Set(((g.ships || {})[ot] || []).filter(s => s.c.every(x => myShots.has(x))).flatMap(s => s.c));
  bsGrid($("bsMine"), Array.from({ length: 64 }, (_, i) => ({ cls: (shipSet.has(i) ? "ship" : "") + (theirShots.has(i) ? (shipSet.has(i) ? " hit" : " miss") : ""), t: theirShots.has(i) ? (shipSet.has(i) ? "💥" : "·") : "" })), false);
  let btns = "";
  if (g.phase === "setup") {
    $("bsSea").classList.add("hidden"); $("bsSeaLbl").classList.add("hidden");
    if ((g.ready || {})[me]) { $("bsTurn").textContent = `Esperando a que ${name(ot)} coloque su flota… ⚓`; $("bsMsg").textContent = ""; }
    else { $("bsTurn").textContent = "Coloca tu flota"; $("bsMsg").textContent = "Barcos de 4, 3, 3, 2 y 2 casillas. Puedes recolocarlos al azar."; btns = `<button class="btn" style="flex:1" id="bsShuffle">🔀 Recolocar</button><button class="btn primary" style="flex:1" id="bsReady">✅ ¡Listo!</button>`; }
  } else {
    $("bsSea").classList.remove("hidden"); $("bsSeaLbl").classList.remove("hidden");
    const myTurn = g.phase === "play" && g.turn === me;
    $("bsTurn").innerHTML = g.phase === "end" ? (g.win === me ? "¡Has hundido toda su flota! 🏆" : `${esc(name(g.win))} ha hundido tu flota 😵`) : myTurn ? "Tu turno: dispara en su mar 🎯" : `Turno de ${esc(name(ot))}…`;
    const L = g.last; $("bsMsg").textContent = L ? `${L.by === me ? "Tu disparo" : name(L.by) + " disparó"}: ${L.sunk ? "¡Hundido! 🔥" : L.hit ? "¡Tocado! 💥" : "Agua 💧"}` : "";
    bsGrid($("bsSea"), Array.from({ length: 64 }, (_, i) => myShots.has(i) ? { cls: otherCells.has(i) ? (sunkCells.has(i) ? "sunk" : "hit") : "miss", t: otherCells.has(i) ? (sunkCells.has(i) ? "🔥" : "💥") : "💧" } : { can: myTurn }), myTurn, bsShoot);
    if (g.phase === "end") btns = `<button class="btn primary" style="flex:1" id="bsAgain">Nueva partida 🔁</button>`;
  }
  $("bsSetupBtns").innerHTML = btns;
  const sh = $("bsShuffle"); if (sh) sh.onclick = () => { bsDraft = randomFleet(); renderBS(); };
  const rd = $("bsReady"); if (rd) rd.onclick = () => {
    const fleet = bsDraft || randomFleet();
    S.tx("games/bs", g => { g = g || bsNew(); if (g.phase !== "setup") return null; g.ships = { ...(g.ships || {}), [me]: fleet }; g.ready = { ...(g.ready || {}), [me]: true }; if (g.ready[ot]) { g.phase = "play"; g.turn = g.starter; } return g; })
      .then(g => { if (!g) return; bsDraft = null; sendMsg(g.phase === "play" ? "🚢 ¡Flotas listas! Empieza la batalla" : "🚢 He colocado mi flota. ¡Coloca la tuya!", "game"); }).catch(offline);
  };
  const ag = $("bsAgain"); if (ag) ag.onclick = () => S.tx("games/bs", g => g && g.phase === "end" ? bsNew(g) : null).then(g => { if (g) { bsDraft = null; sendMsg("🔁 ¡Nueva partida de Hundir la flota!", "game"); } }).catch(offline);
}
function bsShoot(i) {
  let res = null;
  S.tx("games/bs", g => {
    if (!g || g.phase !== "play" || g.turn !== who) return null;
    const shots = g.shots[who] || []; if (shots.includes(i)) return null;
    g.shots[who] = [...shots, i];
    const ships = g.ships[other()] || [], cells = ships.flatMap(s => s.c), hit = cells.includes(i);
    const s = ships.find(s => s.c.includes(i)), sunk = !!(hit && s && s.c.every(x => g.shots[who].includes(x)));
    g.last = { by: who, cell: i, hit, sunk };
    if (cells.every(x => g.shots[who].includes(x))) { g.phase = "end"; g.win = who; g.score[who]++; res = "win"; }
    else if (!hit) { g.turn = other(); res = "miss"; } else res = sunk ? "sunk" : "hit";
    return g;
  }).then(g => {
    if (!g) return; buzz(res === "miss" ? 15 : [30, 40, 30]);
    if (res === "win") { addHearts(20, "Hundir la flota"); confetti(); sendMsg("🏆 ¡He hundido toda tu flota!", "game"); }
    else if (res === "miss") sendMsg("🚢 Agua 💧 ¡Te toca disparar!", "game");
    else toast(res === "sunk" ? "¡Hundido! 🔥 Vuelves a disparar" : "¡Tocado! 💥 Vuelves a disparar");
  }).catch(offline);
}

// ---------------- Wordle ----------------
function wdEval(guess, word) {
  const g = [...guess], w = [...word], res = Array(5).fill("b"), cnt = {};
  for (let i = 0; i < 5; i++) { if (g[i] === w[i]) res[i] = "g"; else cnt[w[i]] = (cnt[w[i]] || 0) + 1; }
  for (let i = 0; i < 5; i++) if (res[i] !== "g" && cnt[g[i]] > 0) { res[i] = "y"; cnt[g[i]]--; }
  return res;
}
function renderWordle() {
  const g = G.wordle, guesser = g ? (g.setter === "a" ? "b" : "a") : null;
  const guesses = (g && g.guesses) || [], word = g ? g.word : "";
  let rows = "";
  for (let r = 0; r < 6; r++) {
    const gs = guesses[r], ev = gs ? wdEval(gs, word) : null;
    rows += `<div class="wdrow">${Array.from({ length: 5 }, (_, i) => `<span class="wd ${ev ? ev[i] : ""}">${gs ? [...gs][i] : ""}</span>`).join("")}</div>`;
  }
  $("wdGrid").innerHTML = g ? rows : "";
  let box = "";
  if (!g || g.status !== "play") {
    const last = g ? (g.status === "won" ? `🎉 ${esc(name(guesser))} adivinó <b>${esc(word)}</b> en ${guesses.length} intento${guesses.length === 1 ? "" : "s"}` : `😅 La palabra era <b>${esc(word)}</b>`) : "";
    $("wdTurn").innerHTML = g ? last : "Nueva partida";
    box = `<div class="sub">Elige una palabra secreta de 5 letras para que ${esc(name(other()))} la adivine:</div>
      <div class="sendrow"><input id="wdNew" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="PERRO" style="text-transform:uppercase;letter-spacing:4px;font-weight:800"><button class="btn primary" id="wdStart">Empezar</button></div>`;
  } else if (g.setter === who) {
    $("wdTurn").innerHTML = `Tu palabra: <b>${esc(word)}</b> · ${esc(name(guesser))} lleva ${guesses.length}/6`;
    box = `<div class="sub">Esperando a que ${esc(name(guesser))} la adivine… 🤞</div>`;
  } else {
    $("wdTurn").innerHTML = `Adivina la palabra de ${esc(name(g.setter))} · intento ${guesses.length + 1}/6`;
    box = `<div class="sendrow"><input id="wdGuess" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="?????" style="text-transform:uppercase;letter-spacing:4px;font-weight:800"><button class="btn primary" id="wdTry">Probar</button></div>`;
  }
  $("wdBox").innerHTML = box;
  const st = $("wdStart"); if (st) st.onclick = () => {
    const w = norm($("wdNew").value); if (!/^[A-ZÑ]{5}$/.test(w)) return toast("Tienen que ser 5 letras");
    S.tx("games/wordle", x => (x && x.status === "play") ? null : { word: w, setter: who, guesses: [], status: "play", at: Date.now(), score: (x && x.score) || { a: 0, b: 0 } })
      .then(r => { if (r) sendMsg("🔤 Te he puesto una palabra en el Wordle. ¡Adivínala!", "game"); }).catch(offline);
  };
  const tr = $("wdTry"), gi = $("wdGuess");
  if (gi) gi.onkeydown = e => { if (e.key === "Enter") tr.click(); };
  if (tr) tr.onclick = () => {
    const w = norm(gi.value); if (!/^[A-ZÑ]{5}$/.test(w)) return toast("Escribe 5 letras");
    let res = null;
    S.tx("games/wordle", x => {
      if (!x || x.status !== "play" || x.setter === who || x.guesses.length >= 6) return null;
      x.guesses = [...x.guesses, w];
      if (w === x.word) { x.status = "won"; x.score = x.score || { a: 0, b: 0 }; x.score[who] = (x.score[who] || 0) + 1; res = "won"; }
      else if (x.guesses.length >= 6) { x.status = "lost"; res = "lost"; }
      return x;
    }).then(x => {
      if (!x) return; buzz(15);
      if (res === "won") { addHearts(15, "Wordle"); confetti(); sendMsg(`🔤 ¡Adiviné tu palabra ${x.word} en ${x.guesses.length} intentos!`, "game"); }
      else if (res === "lost") sendMsg(`🔤 No adiviné tu palabra 😅 Era ${x.word}`, "game");
    }).catch(offline);
  };
}

// ---------------- Dibuja y adivina ----------------
const DRAW_WORDS = ["PERRO", "GATO", "CASA", "SOL", "LUNA", "ÁRBOL", "COCHE", "AVIÓN", "PLAYA", "PIZZA", "CORAZÓN", "FLOR", "BICICLETA", "PEZ", "MONTAÑA", "HELADO", "GUITARRA", "LIBRO", "RELOJ", "TELÉFONO",
  "BARCO", "NUBE", "LLUVIA", "ESTRELLA", "TARTA", "GAFAS", "ZAPATO", "PARAGUAS", "CAFÉ", "MARIPOSA", "SERPIENTE", "CASTILLO", "ROBOT", "COHETE", "MANZANA", "PLÁTANO", "HAMBURGUESA", "CAMA", "SOFÁ", "TREN",
  "PAYASO", "FANTASMA", "DRAGÓN", "PINGÜINO", "CONEJO", "ELEFANTE", "JIRAFA", "TORTUGA", "ARCOÍRIS", "VOLCÁN", "ISLA", "REGALO", "VELA", "BESO", "ANILLO", "MALETA", "PALOMITAS", "PIANO", "BALÓN", "POLLITO"];
let drWordCur = rnd(DRAW_WORDS), drStrokes = [], drCur = null, drColor = "#222222", drSize = 6, drCtx = null;
const DR_COLORS = ["#222222", "#e63946", "#ff9f1c", "#ffd93b", "#2a9d8f", "#4d7cff", "#9b5de5", "#ff6b8b", "#8a5a38", "#ffffff"];
function drSetup() {
  const cv = $("drCanvas"); if (drCtx && cv.width) return;
  const W = cv.clientWidth || 300, dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = W * dpr; cv.style.height = W + "px";
  drCtx = cv.getContext("2d"); drCtx.scale(dpr, dpr); drCtx.lineCap = "round"; drCtx.lineJoin = "round"; drRedraw();
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left), (e.clientY - r.top)]; };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); drCur = { c: drColor, s: drSize, p: [pos(e)] }; drStrokes.push(drCur); drRedraw(); };
  cv.onpointermove = e => { if (!drCur) return; drCur.p.push(pos(e)); drRedraw(); };
  cv.onpointerup = cv.onpointercancel = () => { drCur = null; };
  cv.style.touchAction = "none";
}
function drRedraw() {
  const cv = $("drCanvas"), W = cv.clientWidth || 300; drCtx.fillStyle = "#fff"; drCtx.fillRect(0, 0, W, W);
  for (const s of drStrokes) {
    drCtx.strokeStyle = s.c; drCtx.lineWidth = s.s; drCtx.beginPath();
    s.p.forEach(([x, y], i) => i ? drCtx.lineTo(x, y) : drCtx.moveTo(x, y));
    if (s.p.length === 1) drCtx.lineTo(s.p[0][0] + .1, s.p[0][1]);
    drCtx.stroke();
  }
}
function renderDraw() {
  const pend = drawings.filter(d => d.to === who && !d.solved && !d.gaveUp).sort((a, b) => a.at - b.at);
  $("drGuessCard").classList.toggle("hidden", !pend.length);
  if (pend.length) {
    const d = pend[0];
    $("drGuess").innerHTML = `<img class="drimg" src="${d.img}" alt="">
      ${d.guesses && d.guesses.length ? `<div class="sub">Has probado: ${d.guesses.map(esc).join(", ")}</div>` : `<div class="sub">Pista: ${[...norm(d.word)].length} letras</div>`}
      <div class="sendrow"><input id="drTry" placeholder="¿Qué es?" autocomplete="off"><button class="btn primary" id="drGo">Probar</button></div>
      <button class="linkbtn mt" id="drGive">🏳️ Me rindo</button>${pend.length > 1 ? `<div class="sub">+${pend.length - 1} dibujo${pend.length > 2 ? "s" : ""} más esperando</div>` : ""}`;
    $("drTry").onkeydown = e => { if (e.key === "Enter") $("drGo").click(); };
    $("drGo").onclick = () => {
      const t = norm($("drTry").value); if (!t) return;
      if (t === norm(d.word)) {
        S.merge("drawings/" + d.id, { solved: true, solvedAt: Date.now(), guesses: [...(d.guesses || []), t] });
        addHearts(10, "dibujo adivinado"); confetti(); buzz([30, 40, 30]); sendMsg(`🎨 ¡Adiviné tu dibujo! Era ${d.word}`, "game");
      } else { S.merge("drawings/" + d.id, { guesses: [...(d.guesses || []), t] }); toast("¡No! Prueba otra vez 🤔"); buzz(60); }
    };
    $("drGive").onclick = () => { if (!confirm("¿Te rindes?")) return; S.merge("drawings/" + d.id, { gaveUp: true }); toast("Era: " + d.word); sendMsg(`🎨 Me rindo con tu dibujo… ¿era ${d.word}? 😅`, "game"); };
  }
  $("drWord").innerHTML = `<span>Dibuja:</span> <input id="drWordIn" value="${esc(drWordCur)}" maxlength="24"> <button class="btn" id="drOther">🔀</button>`;
  $("drWordIn").oninput = e => { drWordCur = e.target.value; };
  $("drOther").onclick = () => { drWordCur = rnd(DRAW_WORDS); $("drWordIn").value = drWordCur; };
  $("drTools").innerHTML = DR_COLORS.map(c => `<button class="drcol ${c === drColor ? "on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("") +
    [3, 6, 14].map(s => `<button class="drsz ${s === drSize ? "on" : ""}" data-s="${s}"><i style="width:${s + 2}px;height:${s + 2}px"></i></button>`).join("");
  $("drTools").querySelectorAll("[data-c]").forEach(b => b.onclick = () => { drColor = b.dataset.c; renderDraw(); });
  $("drTools").querySelectorAll("[data-s]").forEach(b => b.onclick = () => { drSize = +b.dataset.s; renderDraw(); });
  setTimeout(drSetup, 30);
  const mine = drawings.slice().sort((a, b) => b.at - a.at).slice(0, 12);
  $("drGal").innerHTML = mine.length ? mine.map(d => `<div class="drg"><img src="${d.img}" alt=""><small>${esc(name(d.from))} · ${esc(d.word)} ${d.solved ? "✅" : d.gaveUp ? "🏳️" : "⏳"}</small></div>`).join("") : '<div class="empty">Aún no hay dibujos.</div>';
}
$("drUndo").onclick = () => { drStrokes.pop(); drRedraw(); };
$("drClear").onclick = () => { if (drStrokes.length && confirm("¿Borrar el dibujo?")) { drStrokes = []; drRedraw(); } };
$("drSend").onclick = () => {
  const word = (drWordCur || "").trim(); if (!word) return toast("Escribe qué has dibujado");
  if (!drStrokes.length) return toast("Dibuja algo primero ✏️");
  const img = $("drCanvas").toDataURL("image/jpeg", 0.7);
  S.add("drawings", { from: who, to: other(), word: word.toUpperCase(), img, guesses: [], solved: false, gaveUp: false, at: Date.now() });
  sendMsg("🎨 Te he enviado un dibujo. ¡Adivina qué es!", "game");
  drStrokes = []; drRedraw(); drWordCur = rnd(DRAW_WORDS); renderDraw(); toast("Dibujo enviado 🎨");
};

// ---------------- ¿Qué prefieres? ----------------
const WYR = [
  ["🏖️ Playa", "⛰️ Montaña"], ["🍕 Pizza", "🍔 Hamburguesa"], ["🌅 Madrugar", "🌙 Trasnochar"], ["🎬 Cine", "🛋️ Peli en casa"], ["☕ Café", "🍵 Té"],
  ["🐶 Perro", "🐱 Gato"], ["❄️ Invierno", "☀️ Verano"], ["✈️ Viajar lejos", "🚗 Escapada cerca"], ["🍝 Cocinar juntos", "🍽️ Ir a un restaurante"], ["📚 Leer", "📺 Ver series"],
  ["🎢 Parque de atracciones", "🧖 Spa"], ["🏙️ Ciudad", "🌳 Campo"], ["🍫 Chocolate", "🍓 Fruta"], ["💌 Carta a mano", "🎁 Regalo sorpresa"], ["🎤 Karaoke", "💃 Bailar"],
  ["🌮 Comida picante", "🍰 Dulce"], ["📸 Muchas fotos", "👀 Vivir el momento"], ["🏕️ Acampar", "🏨 Hotel"], ["🎮 Videojuegos", "🎲 Juegos de mesa"], ["🌧️ Día de lluvia en casa", "🌞 Día de sol fuera"],
  ["🍿 Comedia", "😱 Terror"], ["🚿 Ducha", "🛁 Bañera"], ["🥐 Desayuno", "🍷 Cena"], ["🎵 Concierto", "🎭 Teatro"], ["🐧 Viaje al frío", "🌴 Viaje al calor"],
  ["📱 Llamada", "💬 Mensajes"], ["🧳 Planearlo todo", "🎲 Improvisar"], ["🏡 Casa en el campo", "🏢 Piso en la ciudad"], ["🍦 Helado", "🍰 Tarta"], ["🌊 Barco", "🎈 Globo"],
  ["🎂 Fiesta sorpresa", "🥂 Cena tranquila"], ["🦸 Volar", "👻 Ser invisible"], ["⏪ Viajar al pasado", "⏩ Viajar al futuro"], ["🍜 Comida asiática", "🥘 Comida española"], ["🐚 Isla desierta juntos", "🗼 París juntos"],
  ["😴 Siesta", "🚶 Paseo"], ["🎧 Música a tope", "🤫 Silencio"], ["🌹 Flores", "🍫 Bombones"], ["🏋️ Deporte juntos", "🧘 Yoga juntos"], ["💍 Boda grande", "💒 Boda pequeña"]
];
const wyrAns = () => ((G.wyr || {}).ans || {});
function wyrPendingForMe() { const A = wyrAns(), me = A[who] || {}, ot = A[other()] || {}; return Object.keys(ot).filter(i => me[i] === undefined).length; }
function renderWyr() {
  const A = wyrAns(), me = A[who] || {}, ot = A[other()] || {};
  const both = WYR.map((_, i) => i).filter(i => me[i] !== undefined && ot[i] !== undefined), match = both.filter(i => me[i] === ot[i]);
  $("wyrPct").textContent = both.length ? Math.round(match.length / both.length * 100) + "%" : "—";
  $("wyrStats").textContent = both.length ? `Coincidís en ${match.length} de ${both.length} 💞` : "Responded los dos para ver vuestra compatibilidad";
  let next = WYR.findIndex((_, i) => me[i] === undefined && ot[i] !== undefined); if (next < 0) next = WYR.findIndex((_, i) => me[i] === undefined);
  if (next < 0) $("wyrBox").innerHTML = `<div class="empty">¡Has respondido todas! 🎉</div>`;
  else {
    const [x, y] = WYR[next];
    $("wyrBox").innerHTML = `<div class="wyr"><button data-v="0">${esc(x)}</button><span>o</span><button data-v="1">${esc(y)}</button></div><div class="sub" style="text-align:center">${Object.keys(me).length}/${WYR.length} respondidas</div>`;
    $("wyrBox").querySelectorAll("[data-v]").forEach(b => b.onclick = () => {
      const v = +b.dataset.v; S.merge("games/wyr", { ans: { [who]: { [next]: v } } }); buzz(15);
      if (ot[next] !== undefined) { if (ot[next] === v) { toast(`¡Coincidís! 💞 +3 💖 para los dos`); walletTx(x => { x.a += 3; x.b += 3; return x; }).catch(() => {}); } else toast(`${name(other())} eligió lo otro 😅`); }
    });
  }
  $("wyrHist").innerHTML = both.length ? both.slice(-12).reverse().map(i => `<div class="lrow"><span>${esc(WYR[i][me[i]])}</span><small>${esc(name(other()))}: ${esc(WYR[i][ot[i]].split(" ").slice(1).join(" "))}</small><span style="flex:none">${me[i] === ot[i] ? "✅" : "❌"}</span></div>`).join("") : '<div class="empty">Aquí saldrán vuestras respuestas.</div>';
}

// ---------------- Verdad o reto ----------------
const TRUTHS = ["¿Qué fue lo primero que pensaste de mí?", "¿Cuál es tu recuerdo favorito conmigo?", "¿Qué es lo que más echas de menos cuando no estoy?", "¿Alguna vez has soñado conmigo? Cuéntamelo",
  "¿Qué canción te recuerda a mí?", "¿Qué es lo más vergonzoso que te ha pasado?", "¿Qué te gustaría que hiciéramos juntos este año?", "¿Qué manía mía te hace gracia?", "¿Cuándo te diste cuenta de que te gustaba?",
  "¿Qué es algo que nunca me has contado?", "¿Cuál es tu mayor miedo sobre lo nuestro?", "¿Qué parte de mi cuerpo te gusta más?", "¿Qué harías si mañana me tuvieras al lado todo el día?", "¿Qué te gustaría que te dijera más a menudo?",
  "¿Cuál ha sido nuestro peor momento y qué aprendiste?", "¿Qué foto mía es tu favorita?", "¿A qué famoso te parezco?", "¿Qué es lo más romántico que alguien ha hecho por ti?", "¿Cómo te imaginas nuestra casa?", "¿Qué me regalarías si no hubiera límite de dinero?"];
const DARES = ["Mándame una foto tuya ahora mismo, sin filtros 📸", "Mándame un audio cantando mi canción favorita 🎤", "Escríbeme un poema de 4 versos ✍️", "Hazme una videollamada y bésame en la pantalla 😘",
  "Mándame una foto de lo que tienes delante ahora", "Dime 5 cosas que te encantan de mí, en un audio", "Pon tu fondo de pantalla una foto nuestra durante un día", "Mándame un selfie haciendo tu mejor cara de pato 🦆",
  "Dibuja mi cara en Dibuja y adivina", "Imita mi voz en un audio 😂", "Mándame la última foto de tu galería", "Escríbeme una carta de 'Ábrelo cuando…'", "Hazme un baile en videollamada 💃",
  "Cuéntame un chiste malo en audio", "Dime algo bonito en otro idioma", "Mándame una foto de tu comida de hoy", "Cambia mi nombre en tu móvil por uno cursi durante un día", "Graba un audio diciendo por qué me quieres",
  "Hazte una foto con algo que te recuerde a mí", "Proponme una cita para cuando nos veamos, con todo detalle"];
function renderTod() {
  const items = ((G.tod || {}).items || []);
  $("todMine").innerHTML = items.length ? items.map((x, i) => `<div class="lrow"><span>${x.k === "t" ? "🤫" : "🔥"} ${esc(x.t)}</span><small>${esc(name(x.by))}</small><button class="x" data-td="${i}">✕</button></div>`).join("") : '<div class="empty">Añadid verdades y retos propios y saldrán también.</div>';
  $("todMine").querySelectorAll("[data-td]").forEach(b => b.onclick = () => S.tx("games/tod", g => { g = g || { items: [] }; g.items = g.items.filter((_, i) => i !== +b.dataset.td); return g; }).catch(offline));
}
function todPick(k) {
  const own = ((G.tod || {}).items || []).filter(x => x.k === k).map(x => x.t), pool = [...(k === "t" ? TRUTHS : DARES), ...own, ...own];
  const t = rnd(pool); buzz(20);
  $("todRes").innerHTML = `<div class="wres"><div class="sub" style="margin:0">${k === "t" ? "🤫 Verdad" : "🔥 Reto"}</div><div class="big2">${esc(t)}</div>
    <div class="row"><button class="btn" style="flex:1" id="todAgain">🔀 Otra</button><button class="btn primary" style="flex:1" id="todSend">💬 Mandárselo</button></div></div>`;
  $("todAgain").onclick = () => todPick(k);
  $("todSend").onclick = () => { sendMsg(`${k === "t" ? "🤫 Verdad" : "🔥 Reto"} para ti: ${t}`, "game"); toast(`Enviado a ${name(other())} 😏`); };
}
$("todT").onclick = () => todPick("t"); $("todD").onclick = () => todPick("d");
$("todAdd").onclick = () => {
  const t = $("todText").value.trim(); if (!t) return;
  const k = $("todKind").value;
  S.tx("games/tod", g => { g = g || { items: [] }; g.items = [...(g.items || []), { k, t: t.slice(0, 140), by: who }]; return g; }).then(() => { $("todText").value = ""; toast("Añadido ✨"); }).catch(offline);
};

// ---------------- Memory con vuestras fotos ----------------
const MM_EMO = ["💗", "🐤", "🌙", "🌹", "✈️", "🍓", "🎁", "⭐"];
let mm = null;
function newMM() {
  const photos = memList.filter(m => m.photo).map(m => m.photo).sort(() => Math.random() - .5).slice(0, 6);
  const faces = [...photos.map(p => ({ img: p })), ...MM_EMO.sort(() => Math.random() - .5).slice(0, 6 - photos.length).map(e => ({ e }))];
  const cards = [...faces, ...faces].map((f, i) => ({ ...f, k: faces.indexOf(f) })).sort(() => Math.random() - .5);
  mm = { cards, open: [], done: new Set(), moves: 0, t0: 0, lock: false, photos: photos.length };
  renderMM();
}
function renderMM() {
  if (!mm) return newMM();
  $("mmGrid").innerHTML = mm.cards.map((c, i) => { const up = mm.open.includes(i) || mm.done.has(i);
    return `<button class="mmc ${up ? "up" : ""} ${mm.done.has(i) ? "ok" : ""}" data-i="${i}">${up ? (c.img ? `<span class="ph" style="background-image:url('${c.img}')"></span>` : `<span class="em">${c.e}</span>`) : "💗"}</button>`; }).join("");
  $("mmGrid").querySelectorAll("[data-i]").forEach(b => b.onclick = () => mmFlip(+b.dataset.i));
  const secs = mm.t0 ? Math.round(((mm.end || Date.now()) - mm.t0) / 1000) : 0;
  $("mmInfo").textContent = `Movimientos: ${mm.moves} · ⏱ ${secs}s` + (mm.photos < 6 ? ` · ${mm.photos} fotos vuestras` : "");
  renderMMBest();
}
function renderMMBest() {
  const b = ((G.memory || {}).best) || {};
  $("mmBest").textContent = `🏆 Récords: ${["a", "b"].map(w => `${name(w)} ${b[w] ? b[w].moves + " mov." : "—"}`).join(" · ")}` + (memList.some(m => m.photo) ? "" : " · Sube fotos en Recuerdos y saldrán aquí 📸");
}
function mmFlip(i) {
  if (mm.lock || mm.done.has(i) || mm.open.includes(i)) return;
  if (!mm.t0) mm.t0 = Date.now();
  mm.open.push(i); buzz(8);
  if (mm.open.length === 2) {
    mm.moves++; const [a, b] = mm.open;
    if (mm.cards[a].k === mm.cards[b].k) { mm.done.add(a); mm.done.add(b); mm.open = []; if (mm.done.size === mm.cards.length) return mmWin(); }
    else { mm.lock = true; setTimeout(() => { mm.open = []; mm.lock = false; renderMM(); }, 800); }
  }
  renderMM();
}
function mmWin() {
  mm.end = Date.now(); renderMM(); confetti(); buzz([30, 40, 30]);
  const moves = mm.moves, secs = Math.round((mm.end - mm.t0) / 1000), prev = (((G.memory || {}).best) || {})[who];
  if (!prev || moves < prev.moves) { S.merge("games/memory", { best: { [who]: { moves, secs, at: Date.now() } } }); if (prev) sendMsg(`🧩 ¡Nuevo récord en Memory: ${moves} movimientos!`, "game"); }
  let g = 0; walletTx(x => { const d = dayKey(); if (!x.memDay || x.memDay.d !== d) x.memDay = { d }; const n = x.memDay[who] || 0; g = n < 3 ? 5 : 0; x.memDay[who] = n + 1; x[who] += g; return x; })
    .then(() => toast(`🧩 ¡Completado en ${moves} movimientos!${g ? " +5 💖" : ""}`, 3500)).catch(() => {});
}
$("mmNew").onclick = newMM;

// ---------------- Vales (Rasca y gana + Tienda) ----------------
const DEFAULT_VALES = ["💆 Vale por un masaje de 10 minutos", "🎬 Vale por elegir la peli", "🥐 Vale por un desayuno en la cama", "🤗 Vale por un abrazo de 1 minuto", "📸 Vale por una foto tuya cuando quiera",
  "🎵 Vale por una canción dedicada", "😏 Vale por ganar una discusión", "🍕 Vale por una cena que pago yo", "💋 Vale por 10 besos", "📞 Vale por una videollamada sorpresa"];
function voucherList(el) {
  const mine = vouchers.filter(v => v.to === who).sort((a, b) => b.at - a.at), unused = mine.filter(v => !v.used), used = mine.filter(v => v.used);
  el.innerHTML = (unused.length ? unused.map(v => `<div class="vale"><span>${esc(v.text)}<small>de ${esc(name(v.from))} · ${v.src === "shop" ? "comprado" : "ganado rascando"} · ${fmtDate(v.at, { day: "numeric", month: "short" })}</small></span><button class="btn primary" data-use="${esc(v.id)}">Usar</button></div>`).join("") : '<div class="empty">Aún no tienes vales. ¡Rasca o compra alguno! 🎟️</div>')
    + (used.length ? `<div class="sub" style="margin-top:10px">Usados: ${used.slice(0, 8).map(v => esc(v.text)).join(" · ")}</div>` : "");
  el.querySelectorAll("[data-use]").forEach(b => b.onclick = () => {
    const v = vouchers.find(x => x.id === b.dataset.use); if (!v || !confirm(`¿Usar ahora "${v.text}"?`)) return;
    S.merge("vouchers/" + v.id, { used: true, usedAt: Date.now() }); sendMsg(`🎟️ ¡Canjeo mi vale! ${v.text}`, "vale"); confetti();
  });
}
function renderScratch() {
  const sc = G.scratch || {}, today = dayKey(), done = (sc.last || {})[who] === today;
  const pool = ((sc.prizes || {})[other()] || []).length ? sc.prizes[other()] : DEFAULT_VALES;
  if (done) $("scBox").innerHTML = `<div class="scdone">🌙 Ya has rascado hoy.<br>Vuelve mañana para otra tarjeta.</div>`;
  else if (!$("scCanvas")) {
    const r = Math.random(), prize = r < .45 ? { k: "vale", t: rnd(pool) } : r < .8 ? { k: "coins", n: rnd([10, 15, 20, 30]) } : { k: "nada" };
    $("scBox").innerHTML = `<div class="scard"><div class="scprize">${prize.k === "vale" ? `🎟️<b>${esc(prize.t)}</b>` : prize.k === "coins" ? `💖<b>+${prize.n} corazones</b>` : `🍀<b>¡Casi! Mañana más suerte</b>`}</div><canvas id="scCanvas"></canvas></div><div class="sub">Rasca con el dedo 👆</div>`;
    scInit(prize);
  }
  document.querySelectorAll(".oname").forEach(e => e.textContent = name(other()));
  const mine = (sc.prizes || {})[who] || [];
  $("scList").innerHTML = mine.length ? mine.map((t, i) => `<div class="lrow"><span>${esc(t)}</span><button class="x" data-sp="${i}">✕</button></div>`).join("") : `<div class="empty">Si no pones ninguno, ${esc(name(other()))} puede ganar vales típicos (masaje, elegir la peli…).</div>`;
  $("scList").querySelectorAll("[data-sp]").forEach(b => b.onclick = () => S.tx("games/scratch", g => { g = g || {}; g.prizes = g.prizes || {}; g.prizes[who] = (g.prizes[who] || []).filter((_, i) => i !== +b.dataset.sp); return g; }).catch(offline));
  voucherList($("vcMine"));
  const theirs = vouchers.filter(v => v.to === other() && !v.used);
  $("vcTheirs").textContent = theirs.length ? `${name(other())} tiene ${theirs.length} vale${theirs.length === 1 ? "" : "s"} tuyo${theirs.length === 1 ? "" : "s"} sin usar: ${theirs.map(v => v.text).join(" · ")}` : "";
}
function scInit(prize) {
  const cv = $("scCanvas"), box = cv.parentElement, W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext("2d"); c.scale(dpr, dpr);
  const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, "#c9c3d6"); gr.addColorStop(.5, "#e9e4f2"); gr.addColorStop(1, "#b7b0c6");
  c.fillStyle = gr; c.fillRect(0, 0, W, H); c.fillStyle = "#7a6f8f"; c.font = "bold 18px system-ui"; c.textAlign = "center"; c.fillText("✨ RASCA AQUÍ ✨", W / 2, H / 2 + 6);
  c.globalCompositeOperation = "destination-out"; c.lineCap = "round"; c.lineWidth = 34;
  let down = false, last = null, n = 0, claimed = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.style.touchAction = "none";
  cv.onpointerdown = e => { down = true; last = pos(e); cv.setPointerCapture(e.pointerId); };
  cv.onpointerup = cv.onpointercancel = () => { down = false; };
  cv.onpointermove = e => {
    if (!down || claimed) return; const p = pos(e); c.beginPath(); c.moveTo(...last); c.lineTo(...p); c.stroke(); last = p;
    if (++n % 8) return;
    const d = c.getImageData(0, 0, cv.width, cv.height).data; let clear = 0; for (let i = 3; i < d.length; i += 64) if (d[i] < 20) clear++;
    if (clear / (d.length / 64) > .5) { claimed = true; cv.style.transition = "opacity .4s"; cv.style.opacity = 0; setTimeout(() => cv.remove(), 450); scClaim(prize); }
  };
}
function scClaim(prize) {
  const today = dayKey();
  S.tx("games/scratch", g => { g = g || {}; g.last = g.last || {}; if (g.last[who] === today) return null; g.last[who] = today; return g; }).then(g => {
    if (!g) return;
    if (prize.k === "vale") { S.add("vouchers", { to: who, from: other(), text: prize.t, src: "scratch", used: false, at: Date.now() }); confetti(); sendMsg(`🎟️ ¡He ganado un vale rascando! ${prize.t}`, "vale"); }
    else if (prize.k === "coins") { addHearts(prize.n, "rasca y gana"); confetti(); }
    buzz([30, 40, 30]);
  }).catch(offline);
}
$("scAdd").onclick = () => {
  const t = $("scPrize").value.trim(); if (!t) return;
  S.tx("games/scratch", g => { g = g || {}; g.prizes = g.prizes || {}; g.prizes[who] = [...(g.prizes[who] || []), t.slice(0, 80)]; return g; }).then(() => { $("scPrize").value = ""; toast("Vale añadido 🎟️"); }).catch(offline);
};

// ---------------- Tienda de vales ----------------
function renderShop2() {
  $("shCoins").textContent = "💖 " + heartsOf(who);
  const offers = ((G.shop || {}).offers || {}), theirs = offers[other()] || [], mine = offers[who] || [], coins = heartsOf(who);
  $("shBuy").innerHTML = theirs.length ? theirs.map(o => `<div class="vale"><span>${esc(o.e)} ${esc(o.t)}<small>💖 ${o.price}</small></span><button class="btn ${coins >= o.price ? "primary" : ""}" data-buy="${esc(o.id)}" ${coins >= o.price ? "" : "disabled"}>${coins >= o.price ? "Comprar" : "Faltan " + (o.price - coins)}</button></div>`).join("")
    : `<div class="empty">${esc(name(other()))} aún no ha puesto nada a la venta. ¡Pídeselo! 😉</div>`;
  $("shBuy").querySelectorAll("[data-buy]").forEach(b => b.onclick = () => {
    const o = theirs.find(x => x.id === b.dataset.buy); if (!o || !confirm(`¿Comprar "${o.t}" por ${o.price} 💖?`)) return;
    let ok = false;
    walletTx(x => { if (x[who] < o.price) return null; x[who] -= o.price; ok = true; return x; }).then(() => {
      if (!ok) return toast("No tienes suficientes corazones 💖");
      S.add("vouchers", { to: who, from: other(), text: `${o.e} ${o.t}`, src: "shop", price: o.price, used: false, at: Date.now() });
      confetti(); buzz([30, 40, 30]); sendMsg(`🛍️ ¡Te he comprado un vale! ${o.e} ${o.t}`, "vale");
    }).catch(offline);
  });
  $("shOffers").innerHTML = mine.length ? mine.map(o => `<div class="lrow"><span>${esc(o.e)} ${esc(o.t)}</span><small>💖 ${o.price}</small><button class="x" data-rm="${esc(o.id)}">✕</button></div>`).join("") : '<div class="empty">Pon cosas que te pueda comprar: un masaje, elegir plan, una carta…</div>';
  $("shOffers").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => S.tx("games/shop", g => { g = g || {}; g.offers = g.offers || {}; g.offers[who] = (g.offers[who] || []).filter(x => x.id !== b.dataset.rm); return g; }).catch(offline));
  voucherList($("shMine"));
}
$("shAdd").onclick = () => {
  const t = $("shText").value.trim(), price = Math.round(+$("shPrice").value);
  if (!t) return toast("Escribe qué ofreces"); if (!(price >= 5 && price <= 5000)) return toast("Precio entre 5 y 5000 💖");
  const o = { id: Math.random().toString(36).slice(2, 9), e: $("shEmoji").value, t: t.slice(0, 80), price };
  S.tx("games/shop", g => { g = g || {}; g.offers = g.offers || {}; g.offers[who] = [...(g.offers[who] || []), o]; return g; })
    .then(() => { $("shText").value = ""; $("shPrice").value = ""; toast("¡A la venta! 🛍️"); sendMsg(`🛍️ He puesto a la venta: ${o.e} ${o.t} (${o.price} 💖)`, "vale"); }).catch(offline);
};

GAMES_READY = true;

// ================= Ábrelo cuando… =================
const OW = [
  ["triste", "😢", "estés triste"], ["echas", "🥺", "me eches de menos"], ["dormir", "🌙", "no puedas dormir"], ["maldia", "🌧️", "tengas un mal día"],
  ["feliz", "🥳", "estés muy feliz"], ["enfado", "😤", "estés enfadado/a conmigo"], ["solo", "🫂", "te sientas solo/a"], ["animo", "💪", "necesites ánimos"],
  ["duda", "💭", "dudes de lo nuestro"], ["aniv", "💍", "sea nuestro aniversario"]
];
let letters = [];
function renderLetters(list) {
  if (list) letters = list;
  const toMe = letters.filter(l => l.to === who), mine = letters.filter(l => l.from === who);
  const groups = OW.map(([id, e, t]) => ({ id, e, t, all: toMe.filter(l => l.when === id) })).filter(g => g.all.length);
  $("owGrid").innerHTML = groups.length ? groups.map(g => {
    const un = g.all.filter(l => !l.opened).length;
    return `<button class="env ${un ? "" : "read"}" data-ow="${g.id}"><i>${un ? "💌" : g.e}</i>Ábrelo cuando ${esc(gz(g.t, who))}${un ? `<span class="cnt">${un}</span>` : ""}</button>`;
  }).join("") : `<div class="empty" style="grid-column:1/-1">Aún no hay cartas para ti. Pídele a ${esc(name(other()))} que te escriba alguna 😉</div>`;
  $("owGrid").querySelectorAll("[data-ow]").forEach(b => b.onclick = () => openOW(b.dataset.ow));
  $("owWrite").textContent = `✍️ Escribir una carta para ${name(other())}`;
  $("owMine").innerHTML = mine.length ? `<div class="sub" style="margin:4px 0">Tus cartas para ${esc(name(other()))}:</div>` + mine.sort((a, b) => b.at - a.at).map(l => {
    const o = OW.find(x => x[0] === l.when) || ["", "💌", ""];
    return `<div class="lrow"><span>${o[1]} Cuando ${esc(gz(o[2], other()))}</span><small>${l.opened ? "Abierta ✓✓ " + fmtDate(l.openedAt, { day: "numeric", month: "short" }) : "Sin abrir"}</small><button class="x" data-dl="${esc(l.id)}">✕</button></div>`;
  }).join("") : "";
  $("owMine").querySelectorAll("[data-dl]").forEach(b => b.onclick = () => { if (confirm("¿Borrar esta carta?")) S.del("letters/" + b.dataset.dl); });
  $("dotLetters").classList.toggle("hidden", !toMe.some(l => !l.opened) && !capsReady().length);
}
function openOW(id, idx) {
  const o = OW.find(x => x[0] === id), list = letters.filter(l => l.to === who && l.when === id).sort((a, b) => a.at - b.at);
  if (!list.length) return;
  if (idx === undefined) { idx = list.findIndex(l => !l.opened); if (idx < 0) idx = list.length - 1; }
  const l = list[idx];
  readView({
    icon: o[1], title: `Para cuando ${gz(o[2], who)}`, sub: `De ${name(l.from)} · ${fmtDate(l.at)}`, text: l.text,
    nav: list.length > 1 ? `<button id="owPrev" ${idx ? "" : "disabled"}>‹ Anterior</button><span style="align-self:center;font-size:13px">${idx + 1}/${list.length}</span><button id="owNext" ${idx < list.length - 1 ? "" : "disabled"}>Siguiente ›</button>` : ""
  });
  const pv = $("owPrev"), nx = $("owNext");
  if (pv) pv.onclick = () => openOW(id, idx - 1); if (nx) nx.onclick = () => openOW(id, idx + 1);
  if (!l.opened) { S.merge("letters/" + l.id, { opened: true, openedAt: Date.now() }); sendMsg(`💌 He abierto tu carta "Ábrelo cuando ${gz(o[2], who)}"`, "letter"); }
}
$("owWrite").onclick = () => {
  document.querySelectorAll(".oname2").forEach(e => e.textContent = name(other()));
  $("owWhen").innerHTML = OW.map(([id, e, t]) => `<option value="${id}">${e} Cuando ${gz(t, other())}</option>`).join("");
  $("owText").value = ""; $("owDlg").showModal();
};
$("owCancel").onclick = () => $("owDlg").close();
$("owSend").onclick = () => {
  const t = $("owText").value.trim(); if (!t) return toast("Escribe tu carta");
  const w = $("owWhen").value, o = OW.find(x => x[0] === w);
  S.add("letters", { from: who, to: other(), when: w, text: t, opened: false, at: Date.now() });
  sendMsg(`💌 Te he dejado una carta: "Ábrelo cuando ${gz(o[2], other())}"`, "letter");
  $("owDlg").close(); toast("Carta guardada 💌"); buzz();
};

// ================= Cápsula del tiempo =================
let caps = [], capPhotoData = null;
const capsReady = () => caps.filter(c => c.unlockAt <= Date.now() && !(c.opened || {})[who]);
function renderCaps(list) {
  renderHome();
  if (list) caps = list;
  const now = Date.now();
  $("capList").innerHTML = caps.length ? caps.slice().sort((a, b) => a.unlockAt - b.unlockAt).map(c => {
    const open = c.unlockAt <= now, seen = (c.opened || {})[who];
    const d = Math.ceil((c.unlockAt - now) / DAY);
    const sub = open ? (seen ? `Abierta · de ${esc(name(c.from))}` : "🎁 ¡Ya se puede abrir! Toca aquí") : `Se abre el ${fmtDate(c.unlockAt, { day: "numeric", month: "long", year: "numeric" })} · faltan ${d} día${d === 1 ? "" : "s"}`;
    return `<div class="cap ${open ? "open" : ""}" data-cap="${esc(c.id)}"><i>${open ? (seen ? "📜" : "🎁") : "🔒"}</i><div><b>${esc(c.title || "Cápsula")}</b><small>${sub}</small></div>${c.from === who && !open ? `<button class="x" data-dc="${esc(c.id)}">✕</button>` : ""}</div>`;
  }).join("") : '<div class="empty">Aún no hay cápsulas.</div>';
  $("capList").querySelectorAll("[data-cap]").forEach(b => b.onclick = e => {
    if (e.target.dataset.dc) return;
    const c = caps.find(x => x.id === b.dataset.cap); if (!c) return;
    if (c.unlockAt > Date.now()) return toast(`🔒 Aún no. Faltan ${Math.ceil((c.unlockAt - Date.now()) / DAY)} días`);
    readView({ icon: "🎁", title: c.title || "Cápsula del tiempo", sub: `De ${name(c.from)} · cerrada el ${fmtDate(c.at)}`, text: c.text, img: c.photo });
    if (!(c.opened || {})[who]) { S.merge("capsules/" + c.id, { opened: { [who]: Date.now() } }); confetti(); sendMsg(`🎁 He abierto la cápsula "${c.title || ""}"`, "capsule"); }
  });
  $("capList").querySelectorAll("[data-dc]").forEach(b => b.onclick = () => { if (confirm("¿Borrar esta cápsula?")) S.del("capsules/" + b.dataset.dc); });
  renderLetters();
}
function nextAnniv() {
  if (!CONFIG.start) return null;
  const s = new Date(CONFIG.start + "T09:00:00"), n = new Date(); let d = new Date(n.getFullYear(), s.getMonth(), s.getDate(), 9);
  if (d <= n) d = new Date(n.getFullYear() + 1, s.getMonth(), s.getDate(), 9);
  return d;
}
$("capNew").onclick = () => {
  $("capTitle").value = ""; $("capText").value = ""; $("capPhotoTxt").textContent = ""; capPhotoData = null; $("capPhoto").value = "";
  const q = [];
  const an = nextAnniv(); if (an) q.push(["💍 Próximo aniversario", an]);
  if (state.main.next && state.main.next > Date.now()) q.push(["✈️ Cuando nos veamos", new Date(state.main.next)]);
  q.push(["📅 En 1 mes", new Date(Date.now() + 30 * DAY)], ["🗓️ En 6 meses", new Date(Date.now() + 182 * DAY)], ["🎆 En 1 año", new Date(Date.now() + 365 * DAY)]);
  $("capQuick").innerHTML = q.map(([t, d], i) => `<button data-q="${i}">${t}</button>`).join("");
  $("capQuick").querySelectorAll("button").forEach(b => b.onclick = () => { $("capDate").value = localKey(q[+b.dataset.q][1]); });
  $("capDate").value = localKey(q[0][1]); $("capDate").min = localKey(new Date(Date.now() + DAY));
  $("capDlg").showModal();
};
$("capPhoto").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; capPhotoData = await shrinkPhoto(f); $("capPhotoTxt").textContent = "📷 Foto lista"; });
$("capCancel").onclick = () => $("capDlg").close();
$("capSave").onclick = () => {
  const title = $("capTitle").value.trim(), text = $("capText").value.trim(), d = $("capDate").value;
  if (!text && !capPhotoData) return toast("Escribe algo o añade una foto");
  if (!d) return toast("Elige la fecha");
  const unlockAt = new Date(d + "T00:00:00").getTime(); if (unlockAt <= Date.now()) return toast("Tiene que ser una fecha futura");
  S.add("capsules", { from: who, title: title || "Cápsula del tiempo", text, photo: capPhotoData, unlockAt, opened: {}, at: Date.now() });
  sendMsg(`⏳ He cerrado una cápsula del tiempo: "${title || "Cápsula"}". Se abrirá el ${fmtDate(unlockAt, { day: "numeric", month: "long", year: "numeric" })} 🔒`, "capsule");
  $("capDlg").close(); toast("Cápsula cerrada 🔒"); buzz();
};

// ================= Fechas especiales =================
let dates = [];
function nextOcc(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let t = new Date(d.date + "T00:00:00");
  if (d.yearly) { t.setFullYear(today.getFullYear()); if (t < today) t.setFullYear(today.getFullYear() + 1); }
  return { t, days: Math.round((t - today) / DAY) };
}
function renderDates(list) {
  renderHome();
  if (list) dates = list;
  const all = dates.map(d => ({ ...d, own: true }));
  if (CONFIG.start) all.push({ id: "_aniv", emoji: "💍", name: "Nuestro aniversario", date: CONFIG.start, yearly: true, years: true });
  if (state.main.next && state.main.next > Date.now() - DAY) all.push({ id: "_next", emoji: "✈️", name: "¡Nos vemos!", date: localKey(new Date(state.main.next)), yearly: false });
  const rows = all.map(d => ({ d, ...nextOcc(d) })).filter(r => r.days >= 0).sort((a, b) => a.days - b.days);
  $("dateList").innerHTML = rows.length ? rows.map(({ d, t, days }) => {
    const yrs = d.years ? ` · ${t.getFullYear() - new Date(d.date).getFullYear()} años` : "";
    return `<div class="drow ${days === 0 ? "today" : ""}"><i>${esc(d.emoji || "⭐")}</i><div><b>${esc(d.name)}</b><small>${fmtDate(t, { day: "numeric", month: "long", year: "numeric" })}${yrs}${d.yearly ? " · 🔁" : ""}</small></div>
      <span class="left">${days === 0 ? "¡Hoy! 🎉" : days === 1 ? "Mañana" : days + " días"}</span>${d.own ? `<button class="x" data-dd="${esc(d.id)}">✕</button>` : ""}</div>`;
  }).join("") : '<div class="empty">Añadid cumpleaños, aniversarios, viajes…</div>';
  $("dateList").querySelectorAll("[data-dd]").forEach(b => b.onclick = () => { if (confirm("¿Borrar esta fecha?")) S.del("dates/" + b.dataset.dd); });
}
$("dtAdd").onclick = () => {
  const n = $("dtName").value.trim(), d = $("dtDate").value; if (!n || !d) return toast("Pon nombre y fecha");
  S.add("dates", { emoji: $("dtEmoji").value, name: n.slice(0, 60), date: d, yearly: $("dtYearly").checked, from: who, at: Date.now() });
  sendMsg(`📅 He añadido una fecha especial: ${$("dtEmoji").value} ${n}`, "date");
  $("dtName").value = ""; $("dtDate").value = ""; toast("Fecha guardada 📅");
};
$("dtName").placeholder = `Cumple de ${name("b")}…`;

// ================= Logros =================
function achievements() {
  const p = state.pet || {}, q = state.quiz || {}, g = state.ttt || {};
  const withLoc = memList.filter(m => typeof m.lat === "number"), countries = new Set(withLoc.map(m => m.country).filter(Boolean)).size;
  const plansDone = plans.filter(x => x.done).length, owned = Object.keys(p.owned || {}).length;
  const quizOk = ["a", "b"].reduce((s, w) => s + Object.values((q.gu || {})[w] || {}).filter(x => x.ok === true).length, 0);
  const games = g.score ? g.score.a + g.score.b + g.score.d : 0;
  const moodDays = Object.values(moods).filter(m => m.a && m.b).length;
  const capOpen = caps.filter(c => Object.keys(c.opened || {}).length).length;
  return [
    ["🐣", "¡Ha nacido!", "La mascota sale del huevo", p.xp || 0, 2],
    ["🔥", "Racha de 7", "7 días seguidos cuidándole", p.best || 0, 7],
    ["☄️", "Racha de 30", "30 días seguidos", p.best || 0, 30],
    ["👑", "Legendario", "El pollo llega al máximo", p.xp || 0, 180],
    ["🤗", "100 mimos", "Mimos a la mascota", p.hugs || 0, 100],
    ["🛍️", "De compras", "Comprar 5 cosas", owned, 5],
    ["📍", "Viajeros", "3 lugares en el mapa", withLoc.length, 3],
    ["🌍", "Trotamundos", "3 países en el mapa", countries, 3],
    ["📝", "Primer plan", "Cumplir un plan", plansDone, 1],
    ["🏆", "10 planes", "Cumplir 10 planes", plansDone, 10],
    ["🧠", "Telepatía", "10 aciertos en ¿Me conoces?", quizOk, 10],
    ["🎮", "Jugones", "10 partidas de tres en raya", games, 10],
    ["💌", "Cartero", "Escribir 5 cartas", letters.length, 5],
    ["⏳", "Del pasado", "Abrir una cápsula", capOpen, 1],
    ["😊", "Sinceros", "7 días diciendo cómo estáis", moodDays, 7],
    ["🎨", "Artistas", "Adivinar 5 dibujos", drawings.filter(d => d.solved).length, 5],
    ["🚢", "Almirante", "Ganar a Hundir la flota", ((G.bs || {}).score || { a: 0, b: 0 }).a + ((G.bs || {}).score || { a: 0, b: 0 }).b, 1],
    ["🔤", "Palabreros", "Adivinar 5 Wordles", ((G.wordle || {}).score || { a: 0, b: 0 }).a + ((G.wordle || {}).score || { a: 0, b: 0 }).b, 5],
    ["⚖️", "Compatibles", "20 coincidencias en ¿Qué prefieres?", (() => { const A = (G.wyr || {}).ans || {}, x = A.a || {}, y = A.b || {}; return Object.keys(x).filter(i => y[i] !== undefined && y[i] === x[i]).length; })(), 20],
    ["🎟️", "Canjeadores", "Usar 5 vales", vouchers.filter(v => v.used).length, 5]
  ].map(([e, n, d, v, goal]) => ({ e, n, d, v: Math.min(v, goal), goal, ok: v >= goal }));
}
let achReady = false;
function renderAch() {
  const A = achievements(), got = A.filter(a => a.ok);
  $("achCount").textContent = `${got.length} de ${A.length} conseguidos`;
  $("achGrid").innerHTML = A.map(a => `<div class="ach ${a.ok ? "got" : "lock"}"><i>${a.e}</i><b>${esc(a.n)}</b><small>${a.ok ? "✓ " + esc(a.d) : `${a.v}/${a.goal} · ${esc(a.d)}`}</small></div>`).join("");
  if (!achReady) return;
  let seen = []; try { seen = JSON.parse(ls.get("achSeen") || "[]"); } catch (e) {}
  const fresh = got.filter(a => !seen.includes(a.n));
  if (fresh.length) { ls.set("achSeen", JSON.stringify([...seen, ...fresh.map(a => a.n)])); setTimeout(() => { toast(`🏅 ¡Nuevo logro! ${fresh[0].e} ${fresh[0].n}`, 3500); confetti(); }, 600); }
}
setInterval(renderAch, 5000);

// ================= Carta y ajustes =================
function openIntro() {
  $("introLetter").textContent = CONFIG.letter; $("introSign").textContent = CONFIG.sign;
  if (CONFIG.start) { const d = Math.floor((Date.now() - new Date(CONFIG.start + "T00:00:00")) / DAY); $("introDays").textContent = d + " días juntos"; }
  else $("introDays").textContent = "Un año juntos";
  $("introTitle").textContent = "Feliz aniversario, " + name("b");
  $("intro").classList.remove("hidden");
}
$("introClose").onclick = () => { $("intro").classList.add("hidden"); ls.set("introSeen", "1"); };
$("btnLetter").onclick = openIntro;
const toLocalInput = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
$("btnSettings").onclick = () => {
  $("sNext").value = state.main.next ? toLocalInput(state.main.next) : "";
  $("sWho").closest(".field").classList.toggle("hidden", S.needsLogin);
  renderPush();
  $("sAccount").innerHTML = S.needsLogin ? `<label>Cuenta</label><div class="row" style="align-items:center"><span style="flex:1;font-size:14px">${esc(S.userEmail || "")}</span><button class="btn" id="sLogout">Cerrar sesión</button></div>` : "";
  const lo = $("sLogout"); if (lo) lo.onclick = async () => { await S.logout(); ls.set("who", ""); location.reload(); };
  $("sWho").innerHTML = ["a", "b"].map(w => `<option value="${w}" ${w === who ? "selected" : ""}>${esc(name(w))}</option>`).join("");
  $("settings").showModal();
};
$("sCancel").onclick = () => $("settings").close();
$("sSave").onclick = () => {
  const v = $("sNext").value;
  S.merge("state/main", { next: v ? new Date(v).getTime() : null });
  const w = $("sWho").value; $("settings").close();
  if (w !== who) { ls.set("who", w); ls.set("seenMsg", "0"); location.reload(); } else toast("Guardado");
};

// ================= Inicio =================
function pickWho() {
  return new Promise(res => {
    $("pickA").textContent = "Soy " + name("a"); $("pickB").textContent = "Soy " + name("b");
    $("whoPick").classList.remove("hidden");
    const pick = w => { who = w; ls.set("who", w); $("whoPick").classList.add("hidden"); res(); };
    $("pickA").onclick = () => pick("a"); $("pickB").onclick = () => pick("b");
  });
}

function loginUI(err) {
  return new Promise(res => {
    $("loginView").classList.remove("hidden"); $("lgErr").textContent = err || "";
    const allowed = [CONFIG.emails?.a, CONFIG.emails?.b].filter(Boolean).map(x => x.toLowerCase());
    const go = mode => {
      const email = $("lgEmail").value.trim().toLowerCase(), pass = $("lgPass").value;
      if (!email || pass.length < 6) { $("lgErr").textContent = "Pon tu email y una contraseña de al menos 6 caracteres"; return; }
      if (!allowed.includes(email)) { $("lgErr").textContent = "Este email no está invitado 🙈"; return; }
      $("lgErr").textContent = "Un momento…"; res({ email, pass, mode });
    };
    $("lgIn").onclick = () => go("in"); $("lgNew").onclick = () => go("new");
  });
}

const APP_VERSION = "31";
const ERR_HELP = {
  "permission-denied": "sin permiso: revisa las reglas de Firestore",
  "unavailable": "sin conexión a internet",
  "failed-precondition": "falta crear la base de datos o un índice",
  "not-found": "no encuentra la base de datos",
  "unauthenticated": "no has iniciado sesión"
};
let connState = "";
function setConn(st, code, where) {
  const el = $("connPill");
  if (st === "demo") { el.className = "conn demo"; el.textContent = "🟡 Modo prueba · v" + APP_VERSION; return; }
  if (st === "ok") { if (connState === "err") return; connState = "ok"; el.className = "conn ok"; el.textContent = `🟢 Conectado como ${name(who)} · v${APP_VERSION}`; return; }
  if (st === "error") {
    connState = "err"; el.className = "conn err";
    const c = String(code || "").replace(/^firestore\//, "");
    el.textContent = `🔴 Error al ${where || "conectar"}: ${ERR_HELP[c] || c}`;
    toast("⚠️ " + el.textContent, 5000);
    setTimeout(() => { connState = ""; }, 8000);
  }
}
S.onStatus(setConn);
function showRetry() {
  const el = $("connPill"); el.innerHTML = el.textContent + ` <button class="btn" id="retryBtn" style="padding:4px 10px;font-size:13px;margin-left:6px">Reintentar</button>`;
  $("retryBtn").onclick = () => location.reload();
}


// =====================================================================
//   v31 · Inicio que cambia cada día, diario de pareja, recuerdos
//         automáticos y un pollito con personalidad
// =====================================================================
const prevVisit = +(ls.get("lastVisit") || 0) || Date.now() - DAY;
if (!ls.get("msgRead")) ls.set("msgRead", prevVisit);
const markVisit = () => ls.set("lastVisit", Date.now());
document.addEventListener("visibilitychange", () => { if (document.hidden) markVisit(); });
window.addEventListener("pagehide", markVisit);
setInterval(markVisit, 60000);
if ("IntersectionObserver" in window) {   // si ves el buzón un momento, los mensajes cuentan como leídos
  let tmo = null;
  new IntersectionObserver(es => { es.forEach(e => { clearTimeout(tmo); if (e.isIntersecting && !$("tab-home").classList.contains("hidden")) tmo = setTimeout(() => { ls.set("msgRead", Date.now()); renderHome(); }, 2500); }); }, { threshold: .6 }).observe($("chatCard"));
}
const SAD = ["😔", "😢", "😤"];
const REAL_KINDS = ["text", "think", "voice", "snap", "night"];

// ---------- Secciones dentro de cada pestaña ----------
let memSeg = ls.get("memSeg") || "diary", petSeg = ls.get("petSeg") || "hoy";
async function setMemSeg(s) {
  memSeg = s; ls.set("memSeg", s);
  document.querySelectorAll("[data-mseg]").forEach(e => e.classList.toggle("hidden", e.dataset.mseg !== s));
  document.querySelectorAll("#memSegBar button").forEach(b => b.classList.toggle("on", b.dataset.s === s));
  if (s === "map") await initMemMap();
  if (s === "diary") renderDiary();
}
function setPetSeg(s) {
  petSeg = s; ls.set("petSeg", s);
  document.querySelectorAll("[data-pseg]").forEach(e => e.classList.toggle("hidden", e.dataset.pseg !== s));
  document.querySelectorAll("#petSegBar button").forEach(b => b.classList.toggle("on", b.dataset.s === s));
  lvScrolled = false; renderPet();
}
document.querySelectorAll("#memSegBar button").forEach(b => b.onclick = () => setMemSeg(b.dataset.s));
document.querySelectorAll("#petSegBar button").forEach(b => b.onclick = () => setPetSeg(b.dataset.s));
document.querySelectorAll("[data-pseg]").forEach(e => e.classList.toggle("hidden", e.dataset.pseg !== petSeg));
document.querySelectorAll("#petSegBar button").forEach(b => b.classList.toggle("on", b.dataset.s === petSeg));
document.querySelectorAll("[data-mseg]").forEach(e => e.classList.toggle("hidden", e.dataset.mseg !== memSeg));
document.querySelectorAll("#memSegBar button").forEach(b => b.classList.toggle("on", b.dataset.s === memSeg));
async function goMemOnMap(m) {
  showTab("mem"); await setMemSeg("map"); if (!memMap) return;
  window.scrollTo({ top: 0, behavior: "smooth" }); memMap.setView([m.lat, m.lng], 12);
  memLayer.eachLayer(l => { const ll = l.getLatLng(); if (ll.lat === m.lat && ll.lng === m.lng) setTimeout(() => l.openPopup(), 400); });
}

// ---------- Diario de pareja ----------
let diary = [], dyLimit = 30, dyUn = null, dyEdit = null, dyPhoto, dyMood = null, dyDraft = null;
const dayAt = k => new Date(k + "T12:00:00").getTime();
const dayNum = k => (CONFIG.start ? Math.round((new Date(k + "T00:00:00") - new Date(CONFIG.start + "T00:00:00")) / DAY) : null);
const diaryDay = k => diary.find(d => (d.date || d.id) === k);
function watchDiary() { if (dyUn) dyUn(); dyUn = S.watchCol("diary", l => { diary = l; renderDiary(); renderHome(); }, dyLimit); }
function dyHead(k) { const n = dayNum(k); return `${esc(fmtDate(new Date(k + "T12:00:00"), { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}${n !== null && n >= 0 ? ` <span>❤️ Día ${n}</span>` : ""}`; }
const REACTS = ["❤️", "🥹", "😂", "🥰", "😘", "🫂"];
function dyEntry(d, w, k, isMine, inList) {
  const e = d[w], re = (d.re || {})[w];
  return `<div class="dyent ${isMine ? "me" : ""}"><div class="dyw"><b>${esc(name(w))}</b> <span class="dym">${e.mood || ""}</span>${isMine && !inList ? `<button class="linkbtn" data-dyedit="${k}">✏️ Editar</button>` : ""}</div>` +
    (e.text ? `<div class="dytx">${esc(e.text)}</div>` : "") + (e.photo ? `<img class="dyimg" src="${e.photo}" loading="lazy" alt="">` : "") +
    (isMine ? (re ? `<div class="dyre">${esc(name(other()))} ha reaccionado ${re}</div>` : "") : `<div class="dyreacts">${REACTS.map(x => `<button class="${re === x ? "on" : ""}" data-dyre="${k}|${w}|${x}">${x}</button>`).join("")}</div>`) + `</div>`;
}
function renderDiary() {
  const el = $("dyToday"); if (!el) return;
  const today = localKey(), yest = localKey(new Date(Date.now() - DAY)), k = dyEdit || today, d = diaryDay(k) || {}, mine = d[who], theirs = d[other()], o = name(other());
  const editing = !mine || dyEdit;
  let h = `<div class="dyhead big">${dyHead(k)}${k !== today ? ` <em>(ayer)</em>` : ""}</div>`;
  if (editing) {
    const cur = mine || {}; if (dyMood === null) dyMood = cur.mood || (moods[k] || {})[who] || "";
    const ph = dyPhoto !== undefined ? dyPhoto : cur.photo || "", tx = dyDraft !== null ? dyDraft : cur.text || "";
    h += `<div class="dyform"><div class="dyw"><b>${esc(name(who))}</b></div><textarea id="dyText" maxlength="600" placeholder="${k === today ? "¿Cómo ha ido tu día? Una frase basta…" : "¿Qué tal fue ayer?"}">${esc(tx)}</textarea>
      <div class="dymoods">${MOODS.map(e => `<button class="${dyMood === e ? "on" : ""}" data-dm="${e}">${e}</button>`).join("")}</div>
      ${ph ? `<div class="dyph"><img src="${ph}" alt=""><button class="x" id="dyPhX">✕</button></div>` : ""}
      <div class="row mt"><label class="btn" style="flex:1;text-align:center">📷 ${ph ? "Cambiar" : "Foto"}<input id="dyPhIn" type="file" accept="image/*" hidden></label><button class="btn primary" style="flex:2" id="dySave">${mine ? "Guardar cambios" : "Guardar ✍️"}</button></div>
      ${mine || dyEdit ? `<button class="linkbtn mt" id="dyCancel">Cancelar</button>` : ""}</div>`;
  } else h += dyEntry(d, who, k, true);
  if (theirs) h += mine ? dyEntry(d, other(), k, false) : `<div class="dylock">🔒 ${esc(o)} ya ha escrito${k === today ? " hoy" : ""}. Escribe lo tuyo para leerlo 💌</div>`;
  else h += `<div class="dywait">${esc(o)} aún no ha escrito${k === today ? " hoy" : ""}${k === today && ls.get("dyNudge") !== today ? ` · <button class="linkbtn" id="dyNudge">🔔 Recordárselo</button>` : ""}</div>`;
  if (!dyEdit && !(diaryDay(yest) || {})[who] && diary.length) h += `<button class="linkbtn mt" id="dyYest">¿Se te pasó ayer? Escríbelo aquí</button>`;
  el.innerHTML = h;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  const ta = $("dyText"); if (ta) ta.oninput = () => { dyDraft = ta.value; };
  el.querySelectorAll("[data-dm]").forEach(b => b.onclick = () => { dyMood = dyMood === b.dataset.dm ? "" : b.dataset.dm; renderDiary(); });
  const pin = $("dyPhIn"); if (pin) pin.onchange = e => { const f = e.target.files[0]; if (!f) return; shrinkPhoto(f, 1000, .7).then(u => { dyPhoto = u; renderDiary(); }).catch(() => toast("No se pudo leer la foto")); };
  on("dyPhX", () => { dyPhoto = ""; renderDiary(); });
  on("dyCancel", () => { dyEdit = null; dyPhoto = undefined; dyMood = null; dyDraft = null; renderDiary(); });
  on("dyYest", () => { dyEdit = yest; dyPhoto = undefined; dyMood = null; dyDraft = null; renderDiary(); });
  on("dyNudge", () => { sendMsg(`🔔 ${name(who)} te recuerda: ¡escribe en vuestro diario de hoy! 📖`, "diary"); ls.set("dyNudge", today); toast("Recordatorio enviado 🔔"); renderDiary(); });
  on("dySave", () => {
    const text = $("dyText").value.trim(), ph = dyPhoto !== undefined ? dyPhoto : (mine || {}).photo || "";
    if (!text && !ph && !dyMood) return toast("Escribe algo, pon una foto o elige cómo estás");
    const first = !mine;
    S.merge("diary/" + k, { date: k, at: dayAt(k), [who]: { text: text.slice(0, 600), mood: dyMood || "", photo: ph || null, t: Date.now() } });
    if (dyMood && k === today) S.merge("moods/" + k, { [who]: dyMood, at: Date.now() });
    if (first) { sendMsg(`📖 He escrito en nuestro diario ${k === today ? "de hoy" : "de ayer"}`, "diary"); addHearts(3, "diario"); }
    dyEdit = null; dyPhoto = undefined; dyMood = null; dyDraft = null; buzz(30);
    toast(theirs && first ? `Guardado ✍️ Ya puedes leer lo de ${o} 💌` : "Guardado en vuestro diario ✍️", 3000);
  });
  el.querySelectorAll("[data-dyedit]").forEach(b => b.onclick = () => { dyEdit = b.dataset.dyedit; dyPhoto = undefined; dyMood = null; dyDraft = null; renderDiary(); });
  // historia
  const past = diary.filter(x => (x.date || x.id) !== k && (x.a || x.b)).sort((a, b) => ((b.date || b.id) > (a.date || a.id) ? 1 : -1));
  $("dyList").innerHTML = past.length ? past.map(x => { const kk = x.date || x.id; return `<div class="dday"><div class="dyhead">${dyHead(kk)}</div>${[who, other()].filter(w => x[w]).map(w => dyEntry(x, w, kk, w === who, true)).join("")}</div>`; }).join("") : `<div class="empty">Aquí irá quedando vuestra historia, día a día 💞</div>`;
  $("dyMore").classList.toggle("hidden", diary.length < dyLimit);
  document.querySelectorAll("[data-dyre]").forEach(b => b.onclick = () => {
    const [kk, w, x] = b.dataset.dyre.split("|"), had = ((diaryDay(kk) || {}).re || {})[w];
    S.merge("diary/" + kk, { re: { [w]: had === x ? null : x } }); buzz(15);
    if (!had && kk === today) sendMsg(`${x} a lo que has escrito hoy en el diario`, "diary");
  });
}
$("dyMore").onclick = () => { dyLimit += 30; watchDiary(); };

// ---------- Recuerdos automáticos: "hoy hace un año…" ----------
let otd = {}, otdKey = "", otdUn = [], flashCache = null;
function watchOTD() {
  const k = localKey(); if (k === otdKey) return; otdKey = k; otdUn.forEach(u => typeof u === "function" && u()); otdUn = []; otd = {};
  const y = new Date().getFullYear(), y0 = CONFIG.start ? +CONFIG.start.slice(0, 4) : y - 1;
  for (let yy = y0; yy < y; yy++) otdUn.push(S.watchDoc(`diary/${yy}-${k.slice(5)}`, d => { otd[yy] = d; renderHome(); }));
}
function memoryOfDay() {
  const now = new Date(), today = localKey(now), md = today.slice(5), y = now.getFullYear(), t0 = new Date(today + "T00:00:00"), out = [];
  for (const m of memList) {
    const t = new Date(m.taken || m.at), k = localKey(t);
    if (k.slice(5) === md && t.getFullYear() < y) { const n = y - t.getFullYear(); out.push({ pri: 86, ic: "📸", t: `Hoy hace ${n} año${n > 1 ? "s" : ""}…`, s: m.place ? `Estabais en ${m.place} 📍` : m.text || "Un recuerdo vuestro", img: m.photo, m, when: t }); continue; }
    const ago = Math.round((t0 - new Date(k + "T00:00:00")) / DAY);
    if (ago > 0 && (ago === 30 || ago % 100 === 0)) out.push({ pri: 82, ic: "📸", t: `Hace ${ago} días…`, s: m.place ? `Estabais en ${m.place} 📍` : m.text || "Un recuerdo vuestro", img: m.photo, m, when: t });
  }
  for (const [yy, d] of Object.entries(otd)) if (d && (d.a || d.b)) { const n = y - +yy, e = d[other()] || d[who]; out.push({ pri: 84, ic: "📖", t: `Hoy hace ${n} año${n > 1 ? "s" : ""} escribisteis…`, s: e.text || "", img: (d.a && d.a.photo) || (d.b && d.b.photo) || "", dy: d }); }
  if (out.length) return (flashCache = out.sort((a, b) => b.pri - a.pri)[0]);
  const ph = memList.filter(m => m.photo); if (!ph.length) return (flashCache = null);
  const m = ph[hashStr(today) % ph.length], t = new Date(m.taken || m.at);
  return (flashCache = { pri: 24, ic: "📸", t: "¿Os acordáis?", s: `${fmtDate(t, { day: "numeric", month: "long", year: "numeric" })}${m.place ? " · " + m.place : ""}`, img: m.photo, m, when: t });
}
function openFlash() {
  const f = flashCache; if (!f) return;
  if (f.dy) { const d = f.dy; readView({ icon: "📖", title: f.t, sub: fmtDate(new Date(d.date + "T12:00:00"), { day: "numeric", month: "long", year: "numeric" }), text: ["a", "b"].filter(w => d[w]).map(w => `${name(w)} ${d[w].mood || ""}\n${d[w].text || ""}`).join("\n\n"), img: (d.a && d.a.photo) || (d.b && d.b.photo) || "" }); return; }
  const m = f.m;
  readView({ icon: "📸", title: f.t, sub: `${fmtDate(f.when, { day: "numeric", month: "long", year: "numeric" })}${m.place ? " · 📍 " + m.place : ""}`, text: m.text || "", img: m.photo, nav: typeof m.lat === "number" ? `<button class="btn" id="flMap">📍 Ver en el mapa</button>` : "" });
  const b = $("flMap"); if (b) b.onclick = () => { $("readView").classList.add("hidden"); goMemOnMap(m); };
}

// ---------- Regalos que tiene el pollito para vosotros ----------
const lvPending = (p, L) => Object.keys(LV_REWARDS).filter(l => +l <= L && (LV_REWARDS[l].c || LV_REWARDS[l].i || LV_REWARDS[l].ch) && !(p.lvc || {})[l]).length;
function petGifts(p, I, withTreasure = true) {
  const g = [];
  if (p.post && p.post.to === who && !p.post.read) g.push(`una carta de ${name(other())}`);
  if (tripBack(p)) g.push("una postal nueva");
  if (missionsClaimable(p)) g.push("misiones por cobrar");
  if (lvPending(p, I.L.l)) g.push("premios de nivel");
  if (withTreasure && treasureReady(p)) g.push("un tesoro escondido");
  return g;
}

// ---------- Inicio: resumen de hoy ----------
let homeQ = 0;
function renderHome() { if (homeQ) return; homeQ = requestAnimationFrame(() => { homeQ = 0; try { drawHome(); } catch (e) { console.error(e); } }); }
function drawHome() {
  if (!$("feed")) return;
  const o = name(other()), me = name(who), now = Date.now(), today = localKey(), h = hourIn(myTz);
  $("hGreet").innerHTML = `${h < 6 || h >= 21 ? "Buenas noches" : h < 13 ? "Buenos días" : "Buenas tardes"}, ${esc(me)} ${h < 6 || h >= 21 ? "🌙" : h < 13 ? "☀️" : "🌤️"}<small>${esc(fmt(myTz, { weekday: "long", day: "numeric", month: "long" }))}</small>`;
  const items = [], add = (pri, ic, t, s, act, img) => items.push({ pri, ic, t, s, act, img });
  // mensajes sin leer
  const read = +(ls.get("msgRead") || prevVisit);
  const un = (state.msgs || []).filter(m => m.from === other() && m.at > read && now - m.at < 3 * DAY && REAL_KINDS.includes(m.kind || "text"));
  if (un.length) { const m = un[0]; add(100, "💌", `${o} te ha dejado ${un.length === 1 ? "algo" : un.length + " mensajes"}`, m.kind === "snap" ? "📸 Una foto de ver una vez" : m.kind === "voice" ? "🎙️ Una nota de voz" : `“${String(m.text || "").slice(0, 80)}”`, "msgs"); }
  // diario
  const dT = diaryDay(today) || {}, mineD = dT[who], theirD = dT[other()];
  if (theirD && !mineD) add(90, "📖", `${o} ha escrito en vuestro diario`, "Escribe lo tuyo para leerlo ✍️", "diary");
  else if (theirD && mineD && !(dT.re || {})[other()]) add(62, "📖", `Lee lo que ha escrito ${o} hoy`, theirD.text || "", "diary");
  else if (!mineD) add(h >= 18 ? 58 : 36, "✍️", "¿Qué tal tu día?", `Escribe una frase en vuestro diario${theirD ? "" : ` · ${o} tampoco ha escrito aún`}`, "diary");
  // recuerdo del día
  const f = memoryOfDay(); if (f) add(f.pri, f.ic, f.t, f.s, "flash", f.img);
  // mascota
  const I = petInfo(), p = I.p, pn = p.name || "El pollito";
  if (I.sick) add(95, "🤒", `${pn} está malito`, "Necesita medicina 💊", "pet");
  else if (!I.meT && I.otT) add(80, I.si ? SPECIES[p.species || "pollito"].e : "🥚", `${o} ya le ha dado ${I.si ? "de comer" : "calor"} a ${pn}`, "¡Te toca a ti! 🍓", "pet");
  else if (!I.meT) add(50, I.si ? SPECIES[p.species || "pollito"].e : "🥚", I.si ? `${pn} tiene hambre` : "El huevo necesita calor 🔥", `Aún no le habéis ${I.si ? "dado de comer" : "dado calor"} hoy`, "pet");
  const gifts = petGifts(p, I, false); if (gifts.length && I.si) add(70, "🎁", `${pn} tiene algo para vosotros`, joinY(gifts), "petgift");
  if (p.streak >= 2 && p.lastBoth && daysBetween(p.lastBoth, I.today) <= 1) add(30, "🔥", `Lleváis ${p.streak} días seguidos cuidándole juntos`, I.meT && I.otT ? "¡Hoy también! 💞" : "Que no se rompa la racha", "pet");
  // vernos
  const nx = state.main.next;
  if (nx) { const d = Math.ceil((nx - now) / DAY); if (nx <= now && now - nx < DAY) add(99, "🥹", "¡Hoy os veis!", "", null); else if (d > 0 && d <= 60) add(d <= 7 ? 72 : 44, "✈️", d === 1 ? "¡Mañana os veis!" : `Faltan ${d} días para veros`, fmtDate(nx, { weekday: "long", day: "numeric", month: "long" }), null); }
  // fechas y aniversarios
  for (const d of dates) { const { days } = nextOcc(d); if (days >= 0 && days <= 7) add(days === 0 ? 98 : 56 - days, d.emoji || "📅", days === 0 ? `¡Hoy! ${d.name}` : days === 1 ? `Mañana: ${d.name}` : `En ${days} días: ${d.name}`, "", "dates"); }
  if (CONFIG.start) {
    const s = new Date(CONFIG.start + "T00:00:00"), n = new Date(), days = Math.floor((now - s) / DAY);
    if (days > 0 && (days % 100 === 0 || days === 50)) add(97, "🎉", `¡Hoy hacéis ${days} días juntos!`, "", null);
    if (n.getDate() === s.getDate()) { const mo = (n.getFullYear() - s.getFullYear()) * 12 + n.getMonth() - s.getMonth(); if (mo > 0) add(96, mo % 12 === 0 ? "💍" : "💞", mo % 12 === 0 ? `¡Feliz aniversario! ${mo / 12} año${mo > 12 ? "s" : ""} juntos` : `Hoy hacéis ${mo} meses juntos`, "", null); }
  }
  const cap = (caps || []).find(c => c.unlockAt <= now && !(c.opened || {})[who]); if (cap) add(88, "🎁", "Ya se puede abrir una cápsula del tiempo", cap.title || "", "caps");
  // pregunta del día
  const A = state.ans || {};
  if (A[other()] && !A[who]) add(64, "💭", `${o} ya ha respondido la pregunta del día`, "Contesta para ver su respuesta", "question");
  else if (!A[who]) add(16, "💭", "Pregunta del día", gz(QUESTIONS[qIndex()], who), "question");
  // cómo está
  const tm = (moods[today] || {})[other()]; if (tm) { const sad = SAD.includes(tm); add(sad ? 76 : 26, tm, `${o} hoy está ${MOOD_TXT[tm]}`, sad ? "Mándale un mimo 💗" : "", sad ? "hug" : null); }
  const otz = (state.main.tz || {})[other()] || myTz, oh = hourIn(otz); if (oh >= 23 || oh < 7) add(10, "🌙", `${o} está durmiendo`, `Allí son las ${fmt(otz, { hour: "2-digit", minute: "2-digit" })}`, null);
  items.sort((a, b) => b.pri - a.pri);
  const list = items.slice(0, 6); drawHome.list = list;
  $("feed").innerHTML = list.length ? list.map((it, i) => `<button class="fitem ${it.pri >= 80 ? "hot" : ""} ${it.img ? "wimg" : ""}" data-i="${i}">${it.img ? `<span class="fimg" style="background-image:url('${it.img}')"></span>` : `<i>${it.ic}</i>`}<div><b>${esc(it.t)}</b>${it.s ? `<small>${esc(String(it.s).slice(0, 120))}</small>` : ""}</div>${it.act ? `<span class="go">›</span>` : ""}</button>`).join("") : `<div class="empty">Todo al día 💕</div>`;
  $("feed").querySelectorAll("[data-i]").forEach(b => b.onclick = () => feedAct(list[+b.dataset.i].act));
}
function feedAct(act) {
  const p = state.pet || {}, I = petInfo();
  const petGo = (seg, id) => { showTab("pet"); setPetSeg(seg); setTimeout(() => { const e = $(id); if (e) e.scrollIntoView({ behavior: "smooth", block: "start" }); }, 450); };
  if (act === "msgs") { ls.set("msgRead", Date.now()); $("chatCard").scrollIntoView({ behavior: "smooth", block: "start" }); renderHome(); }
  else if (act === "diary") { showTab("mem"); setMemSeg("diary"); }
  else if (act === "flash") openFlash();
  else if (act === "pet") showTab("pet");
  else if (act === "petgift") {
    if (p.post && p.post.to === who && !p.post.read) { showTab("pet"); setTimeout(openPost, 500); }
    else if (tripBack(p)) { showTab("pet"); setTimeout(claimTrip, 500); }
    else if (missionsClaimable(I.p)) petGo("hoy", "petMissions");
    else if (lvPending(I.p, I.L.l)) petGo("prog", "lvCard");
    else showTab("pet");
  }
  else if (act === "dates" || act === "caps") showTab("letters");
  else if (act === "question") $("qCard").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (act === "hug") { sendMsg("🤗 Te mando un abrazo muy fuerte, todo va a ir bien 💗", "think"); toast("Mimo enviado 💗"); }
}

// ---------- Personalidad del pollito ----------
const joinY = a => (a.length > 1 ? a.slice(0, -1).join(", ") + " y " + a[a.length - 1] : a[0] || "");
function logEv(q, k) {
  const L = (q.log || []).slice(-29), last = L[L.length - 1], now = Date.now();
  if (last && last.w === who && last.k === k && now - last.at < 20 * 6e4) L[L.length - 1] = { ...last, n: (last.n || 1) + 1, at: now };
  else L.push({ w: who, k, at: now, n: 1 });
  q.log = L;
}
const EV_TXT = {
  feed: () => "me ha dado de comer 🍓", hug: n => (n > 1 ? `me ha hecho ${n} mimos` : "me ha hecho un mimito"), play: n => (n > 1 ? `hemos jugado ${n} veces ⚽` : "hemos jugado ⚽"),
  bath: () => "me ha bañado 🛁", nap: () => "me ha puesto a dormir la siesta", bag: () => "me ha dado algo rico de la mochila", buy: () => "me ha comprado cosas 🛍️",
  dress: () => "me ha cambiado de ropa 👗", trip: () => "me ha mandado de excursión", treasure: () => "hemos encontrado un tesoro ✨", game: n => `ha jugado ${n > 1 ? n + " partidas" : "una partida"} a los minijuegos`,
  trick: () => "le he enseñado mis trucos 🎪", post: () => "me ha dado una carta para ti ✉️"
};
function petWelcome() {
  const p = state.pet || {}; if (stageOf(p.xp || 0) === 0) return;
  const since = (p.seen || {})[who] || 0, o = name(other()), me = name(who);
  const agg = {}; (p.log || []).filter(e => e.w === other() && e.at > since).forEach(e => { agg[e.k] = (agg[e.k] || 0) + (e.n || 1); });
  const parts = Object.entries(agg).map(([k, n]) => (EV_TXT[k] ? EV_TXT[k](n) : null)).filter(Boolean);
  if (parts.length) { say(`¡Hola ${me}! Mientras no estabas, ${o} ${joinY(parts.slice(0, 3))} 🥰`, 6500); react("happy", 2500); }
  else say(phrase());
  if (Date.now() - since > 10 * 6e4) S.merge("state/pet", { seen: { [who]: Date.now() } });
  setTimeout(() => maybeAsk(), parts.length ? 7000 : 3800);
}
function petCtx(I) {
  const p = I.p, o = name(other()), L = [], today = localKey(), now = Date.now();
  if (I.si === 0) return L;
  if (I.otT && !I.meT) L.push(`${o} ya me ha dado de comer, pero tú todavía no 🥺`, `${o} ha venido a darme de comer. ¿Y tú? 🍓`);
  if (I.meT && !I.otT) L.push(`Tú ya me has dado de comer, pero ${o} todavía no 🥺`);
  if (I.meT && I.otT) L.push("¡Hoy me habéis dado de comer los dos! 💞");
  if (p.xp >= 2) L.push(`¡Lleváis ${p.xp} días cuidándome juntos! 💛`);
  const os = (p.seen || {})[other()];
  if (os) { const m = (now - os) / 6e4; if (m < 90) L.push(`${o} ha venido a verme hace ${m < 2 ? "nada" : Math.round(m) + " minutos"} 🥰`); else if (m > 2 * 1440) L.push(`Echo de menos a ${o}… hace días que no viene 🥺`); }
  const otz = (state.main.tz || {})[other()] || myTz, oh = hourIn(otz);
  if (oh >= 23 || oh < 7) L.push(`Shhh… ${o} está durmiendo 🤫`);
  const tm = (moods[today] || {})[other()], mm = (moods[today] || {})[who];
  if (SAD.includes(tm)) L.push(`${o} hoy está ${MOOD_TXT[tm]}… mándale un mimo 🫂`);
  if (SAD.includes(mm)) L.push("¿Estás de bajón? Ven, que te doy un abrazo 🫂", "Todo va a ir bien, estoy aquí contigo 💛");
  if (tm === "🥰" || tm === "😄") L.push(gz(`${o} hoy está muy contento/a ${tm}`, other()));
  const d = diaryDay(today) || {};
  if (d[other()] && !d[who]) L.push(`¡${o} ha escrito en el diario! Corre a leerlo 📖`);
  if (diary.length && !diary.some(x => now - (x.at || 0) < 3 * DAY)) L.push("Hace días que no escribís en el diario… 📖");
  if (petGifts(p, I, false).length) L.push("Tengo algo para vosotros 🎁 ¡Mirad!");
  if (flashCache && flashCache.pri >= 80) L.push("¿Sabéis qué pasó tal día como hoy? 📸 Mirad en Inicio");
  const tc = {}; (p.log || []).filter(e => e.k === "hug" && localKey(new Date(e.at)) === today).forEach(e => { tc[e.w] = (tc[e.w] || 0) + (e.n || 1); });
  if ((tc[other()] || 0) > (tc[who] || 0) + 2) L.push(`Hoy ${o} me ha hecho más mimos que tú 😜`);
  if ((tc[who] || 0) > (tc[other()] || 0) + 2) L.push(`Hoy tú me has hecho más mimos que ${o} 🥰 no se lo digas`);
  return L;
}
function maybeAsk(force) {
  if (!force && Date.now() - +(ls.get("askAt") || 0) < 25 * 6e4) return;
  if ($("tab-pet").classList.contains("hidden") || !hatched() || tripAway(state.pet) || editMode) return;
  const I = petInfo(), p = I.p, o = name(other()), me = name(who), pn = p.name || "el pollito", today = localKey(), h = hourIn(myTz);
  const tm = (moods[today] || {})[other()], d = diaryDay(today) || {}, A = [];
  if (SAD.includes(tm)) A.push([`${o} hoy está ${MOOD_TXT[tm]}… ¿le mandamos un abrazo? 🫂`, "Sí, mándaselo", () => { sendMsg(`🐤 ${pn} te trae un abrazo muy fuerte de parte de ${me} 🫂💗`, "pet"); hearts($("petBox"), "🫂"); say("¡Hecho! Se lo llevo volando 🕊️"); }]);
  if (d[other()] && !d[who]) A.push([`¡${o} ha escrito en el diario! ¿Escribes tú y lo leemos? 📖`, "Vamos", () => { showTab("mem"); setMemSeg("diary"); }]);
  const g = petGifts(p, I, false); if (g.length) A.push([`¡Tengo algo para vosotros: ${g[0]}! 🎁`, "¡A ver!", () => feedAct("petgift")]);
  if (!I.otT && I.meT && h >= 18) A.push([`${o} aún no me ha dado de comer… ¿se lo recordamos? 🍓`, "Recuérdaselo", () => { sendMsg(`🐤 ${pn} dice: ¡${o}, tengo hambre! 🍓 (${me} ya me ha dado de comer)`, "pet"); say("¡Gracias! 🥺"); }]);
  if (flashCache && flashCache.pri >= 80) A.push(["¿Sabéis qué pasó tal día como hoy? 📸", "Enséñamelo", openFlash]);
  if (!d[who] && h >= 19) A.push(["¿Escribimos lo de hoy en vuestro diario? 📖", "Vamos", () => { showTab("mem"); setMemSeg("diary"); }]);
  if (!A.length) { if (!force && Math.random() > .45) return; A.push([`¿Le mando un beso a ${o} de tu parte? 😘`, "¡Sí!", () => { sendMsg(`🐤 ${pn} te trae un beso de ${me} 😘`, "pet"); hearts($("petBox"), "😘"); say("¡Muac! Ya va de camino 💨"); }]); }
  ls.set("askAt", Date.now()); petAsk(...A[0]);
}
function petAsk(t, yes, fn) {
  const b = $("petSay"); clearTimeout(say.t);
  b.innerHTML = `${esc(t)}<div class="askb"><button class="yes">${esc(yes)}</button><button class="no">Luego</button></div>`;
  b.classList.remove("hidden"); b.classList.add("ask"); b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  const close = () => { b.classList.add("hidden"); b.classList.remove("ask"); };
  b.querySelector(".yes").onclick = e => { e.stopPropagation(); close(); fn(); };
  b.querySelector(".no").onclick = e => { e.stopPropagation(); close(); setTimeout(() => say(rnd(["¡Vale, luego! 😊", "Vale 🐤"])), 100); };
  say.t = setTimeout(close, 16000);
}

async function start() {
  if (S.demo) { $("demoBanner").classList.remove("hidden"); setConn("demo"); }
  if (S.needsLogin) {
    try { await S.init(loginUI); } catch (e) { console.error(e); setConn("error", e && (e.code || e.message), "conectar"); showRetry(); return; }
    $("loginView").classList.add("hidden");
    who = S.userEmail === (CONFIG.emails.a || "").toLowerCase() ? "a" : "b"; ls.set("who", who);
  } else if (who !== "a" && who !== "b") await pickWho();
  if (who === "b" && !ls.get("introSeen")) openIntro();
  const t = ls.get("tab"); if (TABS.includes(t)) showTab(t);
  tick(); renderQuestion(); renderPet(); renderQuiz(); renderTTT(); renderMoods([]); drawWheel(); fgInfo(); renderLetters([]); renderCaps([]); renderDates([]); renderGameMenu();
  if (!S.needsLogin) { try { await S.init(); } catch (e) { console.error(e); setConn("error", e && (e.code || e.message), "conectar"); showRetry(); return; } }
  S.merge("state/main", { tz: { [who]: myTz } });
  S.watchDoc("state/main", d => { state.main = d || {}; tick(); renderDates(); });
  S.watchDoc("state/pet", d => { state.pet = d; renderPet(); fgInfo(); });
  watchDiary(); watchOTD();
  loadWeather(true);
  S.watchDoc("quiz/main", d => { state.quiz = d; renderQuiz(); });
  S.watchDoc("state/ttt", d => { state.ttt = d; renderTTT(); renderQuiz(); renderGameMenu(); });
  S.watchDoc("state/wheel", drawWheel);
  S.watchDoc("state/wallet", d => { state.wallet = d; renderHearts(); });
  ["c4", "bs", "wordle", "wyr", "tod", "memory", "scratch", "shop"].forEach(k => S.watchDoc("games/" + k, d => { G[k] = d; gRefresh(k); }));
  S.watchCol("drawings", l => { drawings = l; gRefresh("draw"); }, 30);
  S.watchCol("vouchers", l => { vouchers = l; gRefresh("scratch"); gRefresh("shop"); }, 200);
  S.watchDoc("state/pet", () => { if (curGame === "shop") renderShop2(); });
  if (!S.demo) S.watchDoc("push/" + other(), d => { otherSub = d && d.sub; renderPush(); });
  renderPush(); refreshPushSub();
  S.watchCol("messages", l => { state.msgs = l; renderChat(l); }, 40);
  S.watchCol("memories", renderMem, 100);
  S.watchCol("plans", renderPlans, 200);
  S.watchCol("moods", renderMoods, 40);
  S.watchCol("letters", renderLetters, 200);
  S.watchCol("capsules", renderCaps, 100);
  S.watchCol("dates", renderDates, 100);
  watchAnswers();
  setTimeout(() => {   // logros: los que ya teníais no saltan como nuevos
    if (ls.get("achSeen") === null) ls.set("achSeen", JSON.stringify(achievements().filter(a => a.ok).map(a => a.n)));
    achReady = true; renderAch();
  }, 4000);
  setInterval(() => { tick(); watchAnswers(); renderPet(); renderCaps(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); watchAnswers(); renderPet(); renderMoods(); renderCaps(); renderDates(); } });
}
start();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
