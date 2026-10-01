import { CONFIG } from "./config.js";
import * as S from "./store.js";
let GAMES_READY = false;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DAY = 864e5;
const calDays = t => { const a = new Date(), b = new Date(t); a.setHours(12, 0, 0, 0); b.setHours(12, 0, 0, 0); return Math.round((b - a) / 864e5); };   // días de calendario hasta t
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
  if (t === "pet") setTimeout(() => { renderPet(); if (!ls.get("petTour")) startTour(); else petWelcome(); }, 350);
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

  const next = !state.main.together && state.main.next && !(state.main.nextSet && state.main.next - state.main.nextSet < 30 * 6e4) && state.main.next > Date.now() - DAY ? state.main.next : null;
  if (next) {
    const ms = next - Date.now();
    if (ms <= 0) { $("countdown").textContent = "¡Ya!"; $("countdownSub").textContent = "🥹"; }
    else {
      const dd = Math.floor(ms / DAY), hh = Math.floor(ms % DAY / 36e5), mm = Math.floor(ms % 36e5 / 6e4);
      $("countdown").innerHTML = dd > 0 ? dd + "<small> d</small>" : hh + "<small> h</small> " + mm + "<small> m</small>";
      $("countdownSub").textContent = dd > 0 ? hh + " h " + mm + " min" : "¡ya casi!";
    }
  } else if (state.main.together) { $("countdown").textContent = "💞"; $("countdownSub").textContent = "¡estáis juntos!"; }
  else { $("countdown").textContent = "—"; $("countdownSub").textContent = "elige fecha en ⚙️"; }
  if (otdKey) watchOTD();
  if (typeof petDiaryCheck === "function") petDiaryCheck();
  if (typeof weeklyCheck === "function") weeklyCheck().catch(e => console.warn(e));
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
      { const th = fresh.find(m => m.kind === "think"), mine = (((state.main || {}).think || {})["last_" + who]) || 0; if (th && Math.abs(th.at - mine) < THINK_SYNC && typeof thinkSync === "function") setTimeout(thinkSync, 600); }
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
  { xp: 0, n: "Huevo" }, { xp: 2, n: "Recién nacido" }, { xp: 7, n: "Pequeñín" }, { xp: 21, n: "Pollito travieso" },
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
  // ===== v38: novedades (nw: 2) =====
  { id: "ranita", cat: "ropa", slot: "head", e: "🐸", n: "Gorro de ranita", c: 90, lvl: 1, nw: 2 },
  { id: "gfresa", cat: "ropa", slot: "head", e: "🍓", n: "Gorro de fresa", c: 110, lvl: 2, nw: 2 },
  { id: "diadcor", cat: "ropa", slot: "head", e: "💞", n: "Diadema de corazones", c: 130, lvl: 2, nw: 2 },
  { id: "cascobici", cat: "ropa", slot: "head", e: "🚲", n: "Casco de bici", c: 120, lvl: 3, nw: 2 },
  { id: "florsol", cat: "ropa", slot: "head", e: "🌻", n: "Girasol en la cabeza", c: 80, lvl: 1, nw: 2 },
  { id: "nubecita", cat: "ropa", slot: "head", e: "🌧️", n: "Nube que le sigue", c: 340, lvl: 6, r: 4, nw: 2 },
  { id: "aviador", cat: "ropa", slot: "face", e: "🕶️", n: "Gafas de aviador", c: 140, lvl: 3, nw: 2 },
  { id: "pixel", cat: "ropa", slot: "face", e: "😎", n: "Gafas pixeladas", c: 230, lvl: 5, r: 3, nw: 2 },
  { id: "tirita", cat: "ropa", slot: "face", e: "🩹", n: "Tirita de valiente", c: 30, lvl: 1, nw: 2 },
  { id: "colgante", cat: "ropa", slot: "neck", e: "💛", n: "Colgante de corazón", c: 160, lvl: 2, nw: 2 },
  { id: "fular", cat: "ropa", slot: "neck", e: "🧣", n: "Fular de lunares", c: 90, lvl: 2, nw: 2 },
  { id: "pajlun", cat: "ropa", slot: "neck", e: "🎀", n: "Pajarita de lunares", c: 70, lvl: 1, nw: 2 },
  { id: "chubasquero", cat: "ropa", slot: "body", e: "🧥", n: "Chubasquero", c: 120, lvl: 2, nw: 2 },
  { id: "hawaiana", cat: "ropa", slot: "body", e: "🌺", n: "Camisa hawaiana", c: 140, lvl: 3, nw: 2 },
  { id: "peto", cat: "ropa", slot: "body", e: "👖", n: "Peto vaquero", c: 110, lvl: 2, nw: 2 },
  { id: "tutu", cat: "ropa", slot: "body", e: "🩰", n: "Tutú de bailarina", c: 150, lvl: 3, nw: 2 },
  { id: "abrigo", cat: "ropa", slot: "body", e: "🧥", n: "Abrigo con pelito", c: 200, lvl: 4, nw: 2 },
  { id: "jerseycor", cat: "ropa", slot: "body", e: "🧶", n: "Jersey de punto", c: 130, lvl: 2, nw: 2 },
  { id: "zapconejo", cat: "ropa", slot: "feet", e: "🐰", n: "Zapatillas de conejito", c: 100, lvl: 2, nw: 2 },
  { id: "botasnieve", cat: "ropa", slot: "feet", e: "❄️", n: "Botas de nieve", c: 120, lvl: 3, nw: 2 },
  { id: "aletas", cat: "ropa", slot: "feet", e: "🤿", n: "Aletas", c: 90, lvl: 2, nw: 2 },
  { id: "bailarinas", cat: "ropa", slot: "feet", e: "🩰", n: "Bailarinas", c: 110, lvl: 3, nw: 2 },
  { id: "cucu", cat: "ropa", slot: "hand", e: "🍨", n: "Cucurucho de helado", c: 60, lvl: 1, nw: 2 },
  { id: "paraguas", cat: "ropa", slot: "hand", e: "☂️", n: "Paraguas", c: 110, lvl: 2, nw: 2 },
  { id: "guitarm", cat: "ropa", slot: "hand", e: "🎸", n: "Guitarrita", c: 180, lvl: 4, nw: 2 },
  { id: "ramo", cat: "ropa", slot: "hand", e: "💐", n: "Ramo de flores", c: 150, lvl: 2, nw: 2 },
  { id: "cartamor", cat: "ropa", slot: "hand", e: "💌", n: "Carta de amor", c: 90, lvl: 1, nw: 2 },
  { id: "camaram", cat: "ropa", slot: "hand", e: "📷", n: "Cámara de fotos", c: 160, lvl: 3, nw: 2 },
  { id: "osito", cat: "ropa", slot: "back", e: "🧸", n: "Mochila de osito", c: 170, lvl: 3, nw: 2 },
  { id: "caparazon", cat: "ropa", slot: "back", e: "🐢", n: "Caparazón de tortuga", c: 190, lvl: 4, nw: 2 },
  { id: "globitos", cat: "ropa", slot: "back", e: "🎈", n: "Ramillete de globos", c: 260, lvl: 5, r: 3, nw: 2 },
  { id: "fx_estrellas", cat: "fx", slot: "fx", e: "⭐", n: "Estrellitas", c: 220, lvl: 3, nw: 2 },
  { id: "fx_petalos", cat: "fx", slot: "fx", e: "🌸", n: "Lluvia de pétalos", c: 280, lvl: 4, r: 4, nw: 2 },
  { id: "fx_luces", cat: "fx", slot: "fx", e: "✨", n: "Luciérnagas", c: 240, lvl: 5, nw: 2 },
  { id: "melocoton", cat: "color", n: "Melocotón", c: 80, lvl: 1, body: "#ffc8a2", belly: "#ffe8d8", dark: "#f0a070", nw: 2 },
  { id: "lima", cat: "color", n: "Lima", c: 80, lvl: 1, body: "#d4f06a", belly: "#f3fbd0", dark: "#a8c93c", nw: 2 },
  { id: "chicle", cat: "color", n: "Chicle", c: 120, lvl: 2, body: "#ff9ff3", belly: "#ffe0fb", dark: "#e07ad4", nw: 2 },
  { id: "carbon", cat: "color", n: "Carbón", c: 140, lvl: 3, body: "#5a5a6e", belly: "#9a9ab0", dark: "#3a3a48", nw: 2 },
  { id: "cielonoc", cat: "color", n: "Cielo estrellado", c: 380, lvl: 6, body: "#2d3a6b", belly: "#4e5d99", dark: "#1c2548", pat: "stars", r: 4, nw: 2 },
  { id: "palomitas", cat: "comida", e: "🍿", n: "Palomitas", c: 18, lvl: 1, eff: { food: 10, fun: 15 }, nw: 2 },
  { id: "pizza", cat: "comida", e: "🍕", n: "Pizza", c: 30, lvl: 2, eff: { food: 45, fun: 5 }, nw: 2 },
  { id: "batido", cat: "comida", e: "🥤", n: "Batido de fresa", c: 22, lvl: 1, eff: { food: 15, love: 10 }, nw: 2 },
  { id: "gominola", cat: "comida", e: "🍬", n: "Gominolas", c: 10, lvl: 1, eff: { fun: 12, energy: 8 }, nw: 2 },
  { id: "sopa", cat: "comida", e: "🍲", n: "Sopita caliente", c: 28, lvl: 2, eff: { food: 30, energy: 15 }, nw: 2 },
  { id: "croissant", cat: "comida", e: "🥐", n: "Cruasán", c: 16, lvl: 1, eff: { food: 20, energy: 10 }, nw: 2 },
  { id: "tortilla", cat: "comida", e: "🥘", n: "Tortilla de patata", c: 35, lvl: 3, eff: { food: 55, love: 5 }, nw: 2 },
  { id: "chocolate", cat: "comida", e: "🍫", n: "Chocolate", c: 18, lvl: 1, eff: { love: 10, fun: 10 }, nw: 2 },
  { id: "pompero", cat: "juguete", e: "🫧", n: "Pompero", c: 70, lvl: 1, fun: 30, nw: 2 },
  { id: "patito", cat: "juguete", e: "🦆", n: "Patito de goma", c: 50, lvl: 1, fun: 20, love: 5, nw: 2 },
  { id: "puzzle", cat: "juguete", e: "🧩", n: "Puzle", c: 110, lvl: 3, fun: 35, nw: 2 },
  { id: "camaelastica", cat: "juguete", e: "🤸", n: "Cama elástica", c: 250, lvl: 6, fun: 55, nw: 2 },
  { id: "w_lavanda", cat: "casa", kind: "wall", n: "Pared lavanda", c: 40, lvl: 1, sw: "#e6dcff", nw: 2 },
  { id: "w_melocoton", cat: "casa", kind: "wall", n: "Pared melocotón", c: 40, lvl: 1, sw: "#ffe1cc", nw: 2 },
  { id: "w_noche", cat: "casa", kind: "wall", n: "Pared azul noche", c: 80, lvl: 3, sw: "#26335c", nw: 2 },
  { id: "f_marmol", cat: "casa", kind: "floor", n: "Mármol", c: 90, lvl: 3, sw: "#efeae4", nw: 2 },
  { id: "f_azul", cat: "casa", kind: "floor", n: "Suelo azul", c: 50, lvl: 1, sw: "#9ec9e8", nw: 2 },
  { id: "f_rosa", cat: "casa", kind: "floor", n: "Moqueta rosa", c: 50, lvl: 1, sw: "#f3b6c8", nw: 2 },
  { id: "cactus", cat: "casa", kind: "furn", e: "🌵", n: "Cactus", c: 40, lvl: 1, nw: 2 },
  { id: "tocadiscos", cat: "casa", kind: "furn", e: "📻", n: "Tocadiscos", c: 160, lvl: 3, nw: 2 },
  { id: "guirnalda", cat: "casa", kind: "furn", e: "💡", n: "Guirnalda de luces", c: 90, lvl: 2, nw: 2 },
  { id: "puff", cat: "casa", kind: "furn", e: "🟠", n: "Puf", c: 80, lvl: 2, nw: 2 },
];
// v40 · muchos más colores, degradados y marcas de pelaje
CATALOG.push(
  { id: "cereza", cat: "color", n: "Cereza", c: 90, lvl: 2, body: "#e84a5f", belly: "#ffd0d6", dark: "#b8283d", nw: 2 },
  { id: "coral", cat: "color", n: "Coral", c: 70, lvl: 1, body: "#ff7f6b", belly: "#ffd8cf", dark: "#e05a47", nw: 2 },
  { id: "salmon", cat: "color", n: "Salmón", c: 70, lvl: 1, body: "#ffa38a", belly: "#ffe2d8", dark: "#e97d63", nw: 2 },
  { id: "mandarina", cat: "color", n: "Mandarina", c: 70, lvl: 1, body: "#ff9933", belly: "#ffdcb3", dark: "#e07410", nw: 2 },
  { id: "mostaza", cat: "color", n: "Mostaza", c: 70, lvl: 1, body: "#e5b53a", belly: "#f8e6ae", dark: "#b88a14", nw: 2 },
  { id: "limon", cat: "color", n: "Limón", c: 60, lvl: 1, body: "#fff275", belly: "#fffbd1", dark: "#e6d334", nw: 2 },
  { id: "pistacho", cat: "color", n: "Pistacho", c: 70, lvl: 1, body: "#b5d99c", belly: "#e9f5df", dark: "#86b86a", nw: 2 },
  { id: "oliva", cat: "color", n: "Oliva", c: 90, lvl: 2, body: "#9aa64a", belly: "#dfe3b8", dark: "#737d2c", nw: 2 },
  { id: "c_bosque", cat: "color", n: "Bosque", c: 100, lvl: 2, body: "#4f9a6a", belly: "#cfe8d7", dark: "#2f7048", nw: 2 },
  { id: "esmeralda", cat: "color", n: "Esmeralda", c: 120, lvl: 3, body: "#2ecc8f", belly: "#c8f5e2", dark: "#1a9e6a", nw: 2 },
  { id: "turquesa", cat: "color", n: "Turquesa", c: 100, lvl: 2, body: "#3fd0d4", belly: "#cff5f6", dark: "#1fa4a8", nw: 2 },
  { id: "cielo", cat: "color", n: "Cielo", c: 70, lvl: 1, body: "#7cc4ff", belly: "#dcefff", dark: "#4a9be0", nw: 2 },
  { id: "c_vaquero", cat: "color", n: "Vaquero", c: 100, lvl: 2, body: "#4a78c2", belly: "#cbdaf3", dark: "#2f569a", nw: 2 },
  { id: "marino", cat: "color", n: "Marino", c: 120, lvl: 3, body: "#2e4a8a", belly: "#b9c7e6", dark: "#1c2f5e", nw: 2 },
  { id: "indigo", cat: "color", n: "Índigo", c: 120, lvl: 3, body: "#5b4fcf", belly: "#d5d1f6", dark: "#3d33a3", nw: 2 },
  { id: "uva", cat: "color", n: "Uva", c: 100, lvl: 2, body: "#8e5cc8", belly: "#e3d4f4", dark: "#6a3ba3", nw: 2 },
  { id: "lavanda2", cat: "color", n: "Lavanda", c: 70, lvl: 1, body: "#b9a6f0", belly: "#ece6ff", dark: "#8f78d6", nw: 2 },
  { id: "orquidea", cat: "color", n: "Orquídea", c: 90, lvl: 2, body: "#d98ad9", belly: "#f6dff6", dark: "#b25fb2", nw: 2 },
  { id: "frambuesa", cat: "color", n: "Frambuesa", c: 100, lvl: 2, body: "#d64f8a", belly: "#f7d0e1", dark: "#a8305f", nw: 2 },
  { id: "azucar", cat: "color", n: "Algodón de azúcar", c: 80, lvl: 1, body: "#ffc6e5", belly: "#fff0f8", dark: "#f59ac9", nw: 2 },
  { id: "nube", cat: "color", n: "Nube", c: 80, lvl: 1, body: "#eef3f8", belly: "#ffffff", dark: "#c8d3df", nw: 2 },
  { id: "niebla", cat: "color", n: "Niebla", c: 80, lvl: 2, body: "#b9c2cc", belly: "#eef1f4", dark: "#8c97a3", nw: 2 },
  { id: "ceniza", cat: "color", n: "Ceniza", c: 90, lvl: 2, body: "#8e8e99", belly: "#d9d9e0", dark: "#696973", nw: 2 },
  { id: "grafito", cat: "color", n: "Grafito", c: 140, lvl: 3, body: "#3f4150", belly: "#a3a5b3", dark: "#2a2c38", nw: 2 },
  { id: "c_cafe", cat: "color", n: "Café", c: 100, lvl: 2, body: "#7a5230", belly: "#e0c7ad", dark: "#57371d", nw: 2 },
  { id: "caramelo", cat: "color", n: "Caramelo", c: 90, lvl: 2, body: "#d8914a", belly: "#f6dcc0", dark: "#b06d2a", nw: 2 },
  { id: "arena", cat: "color", n: "Arena", c: 70, lvl: 1, body: "#e8d3a9", belly: "#f9f0dd", dark: "#c7ae7c", nw: 2 },
  { id: "canela", cat: "color", n: "Canela", c: 90, lvl: 2, body: "#c07a4c", belly: "#f0d5c0", dark: "#955631", nw: 2 },
  { id: "c_galleta", cat: "color", n: "Galleta", c: 80, lvl: 1, body: "#e0b77e", belly: "#f7e6cc", dark: "#bb8f55", nw: 2 },
  { id: "crema", cat: "color", n: "Crema", c: 70, lvl: 1, body: "#fff4d6", belly: "#fffdf4", dark: "#e6d3a0", nw: 2 },
  { id: "rubi", cat: "color", n: "Rubí", c: 260, lvl: 5, body: "#c21f3a", belly: "#f4c1ca", dark: "#8e0f26", nw: 2 },
  { id: "zafiro", cat: "color", n: "Zafiro", c: 260, lvl: 5, body: "#1f5fc2", belly: "#c1d4f4", dark: "#0f3d8e", nw: 2 },
  { id: "amatista", cat: "color", n: "Amatista", c: 260, lvl: 5, body: "#9b4dca", belly: "#e5cdf4", dark: "#6f2a9e", nw: 2 },
  { id: "ambar", cat: "color", n: "Ámbar", c: 240, lvl: 4, body: "#ffb000", belly: "#ffe7a8", dark: "#cc8a00", nw: 2 },
  { id: "jade", cat: "color", n: "Jade", c: 240, lvl: 4, body: "#4cae7d", belly: "#d0efdf", dark: "#2e8358", nw: 2 },
  { id: "perla", cat: "color", n: "Perla", c: 240, lvl: 4, body: "#f5f0ea", belly: "#ffffff", dark: "#d9cfc3", nw: 2 },
  { id: "bronce", cat: "color", n: "Bronce", c: 220, lvl: 4, body: "#b8763e", belly: "#f0d2b3", dark: "#8a5423", nw: 2 },
  { id: "plata", cat: "color", n: "Plata", c: 320, lvl: 6, body: "#c9d1da", belly: "#f2f5f8", dark: "#98a3af", nw: 2 },
  { id: "atardecer", cat: "color", n: "Atardecer", c: 300, lvl: 5, body: "#ff7e79", belly: "#fff0dc", dark: "#e0607a", grad: ["#ffb347", "#ff7e79", "#c86dd7"], r: 3, nw: 2 },
  { id: "oceano", cat: "color", n: "Océano", c: 300, lvl: 5, body: "#3fa7e0", belly: "#dffbff", dark: "#2a7bb8", grad: ["#5ee7df", "#3fa7e0", "#2e5fb8"], r: 3, nw: 2 },
  { id: "aurora", cat: "color", n: "Aurora", c: 380, lvl: 7, body: "#5ec8e8", belly: "#effff6", dark: "#5a8fd0", grad: ["#7cf7b0", "#5ec8e8", "#9b6cf0"], r: 4, nw: 2 },
  { id: "algodon", cat: "color", n: "Pastel", c: 260, lvl: 4, body: "#e6d9ff", belly: "#ffffff", dark: "#c7a8e8", grad: ["#ffc6e5", "#e6d9ff", "#bfe3ff"], r: 3, nw: 2 },
  { id: "melon", cat: "color", n: "Melón y sandía", c: 260, lvl: 4, body: "#ffe28a", belly: "#fffbe6", dark: "#e59a5c", grad: ["#c6f28d", "#ffe28a", "#ffab76"], r: 3, nw: 2 },
  { id: "lava", cat: "color", n: "Lava", c: 400, lvl: 8, body: "#ff7a1a", belly: "#fff0c9", dark: "#b8321a", grad: ["#ffd23f", "#ff7a1a", "#d42a2a"], r: 4, nw: 2 },
  { id: "mk_rayas", cat: "marca", slot: "mark", e: "〰️", n: "Rayitas", c: 80, lvl: 1, nw: 2 },
  { id: "mk_manchas", cat: "marca", slot: "mark", e: "🐄", n: "Manchas", c: 80, lvl: 1, nw: 2 },
  { id: "mk_lunares", cat: "marca", slot: "mark", e: "⚪", n: "Lunares", c: 90, lvl: 1, nw: 2 },
  { id: "mk_pecas", cat: "marca", slot: "mark", e: "🟤", n: "Pecas", c: 60, lvl: 1, nw: 2 },
  { id: "mk_corazones", cat: "marca", slot: "mark", e: "💗", n: "Corazones", c: 120, lvl: 2, nw: 2 },
  { id: "mk_estrellas", cat: "marca", slot: "mark", e: "⭐", n: "Estrellitas", c: 140, lvl: 2, nw: 2 },
  { id: "mk_tigre", cat: "marca", slot: "mark", e: "🐯", n: "Tigre", c: 160, lvl: 3, nw: 2 },
  { id: "mk_bicolor", cat: "marca", slot: "mark", e: "🌓", n: "Bicolor", c: 120, lvl: 2, nw: 2 },
  { id: "mk_antifaz", cat: "marca", slot: "mark", e: "🦝", n: "Antifaz", c: 110, lvl: 2, nw: 2 },
  { id: "mk_parche", cat: "marca", slot: "mark", e: "🐶", n: "Parche en el ojo", c: 90, lvl: 1, nw: 2 },
  { id: "mk_barriga", cat: "marca", slot: "mark", e: "💞", n: "Barriga de corazón", c: 130, lvl: 2, nw: 2 },
  { id: "mk_calcetines", cat: "marca", slot: "mark", e: "🧦", n: "Calcetines", c: 100, lvl: 2, nw: 2 },
  { id: "mk_brillos", cat: "marca", slot: "mark", e: "✨", n: "Destellos", c: 220, lvl: 4, nw: 2 },
  { id: "mk_cebra", cat: "marca", slot: "mark", e: "🦓", n: "Cebra", c: 150, lvl: 3, nw: 2 },
  { id: "mk_flores", cat: "marca", slot: "mark", e: "🌼", n: "Florecitas", c: 130, lvl: 2, nw: 2 },
  { id: "mk_rubor", cat: "marca", slot: "mark", e: "😊", n: "Coloretes", c: 50, lvl: 1, nw: 2 },
  { id: "mk_copete", cat: "marca", slot: "mark", e: "💈", n: "Copete", c: 90, lvl: 1, nw: 2 }
);
// v48 · la tienda crece: +110 cosas nuevas (nw: 3)
CATALOG.push(
  // ---- cabeza ----
  { id: "boinamar", cat: "ropa", slot: "head", e: "⚓", n: "Gorra de marinero", c: 90, lvl: 1, nw: 3 },
  { id: "cascovik", cat: "ropa", slot: "head", e: "🪖", n: "Casco vikingo", c: 170, lvl: 3, nw: 3 },
  { id: "gorroaviador", cat: "ropa", slot: "head", e: "🛩️", n: "Gorro de aviador", c: 150, lvl: 3, nw: 3 },
  { id: "orejasoso", cat: "ropa", slot: "head", e: "🐻", n: "Orejas de osito", c: 80, lvl: 1, nw: 3 },
  { id: "coronaflores", cat: "ropa", slot: "head", e: "🌼", n: "Corona de flores", c: 120, lvl: 2, nw: 3 },
  { id: "pamela", cat: "ropa", slot: "head", e: "👒", n: "Pamela de playa", c: 130, lvl: 2, nw: 3 },
  { id: "gorrodormir", cat: "ropa", slot: "head", e: "🌙", n: "Gorro de dormir", c: 70, lvl: 1, nw: 3 },
  { id: "cuernouni", cat: "ropa", slot: "head", e: "🦄", n: "Cuerno de unicornio", c: 260, lvl: 5, r: 3, nw: 3 },
  { id: "halo", cat: "ropa", slot: "head", e: "😇", n: "Aureola", c: 300, lvl: 6, r: 3, nw: 3 },
  { id: "lazogigante", cat: "ropa", slot: "head", e: "🎀", n: "Lazo gigante", c: 110, lvl: 2, nw: 3 },
  { id: "orejeras", cat: "ropa", slot: "head", e: "🎧", n: "Orejeras de pelito", c: 100, lvl: 2, nw: 3 },
  { id: "cintadep", cat: "ropa", slot: "head", e: "🏃", n: "Cinta de deporte", c: 60, lvl: 1, nw: 3 },
  { id: "rizos", cat: "ropa", slot: "head", e: "🧑‍🦱", n: "Peluca de rizos", c: 140, lvl: 3, nw: 3 },
  { id: "tiaraluna", cat: "ropa", slot: "head", e: "🌙", n: "Tiara de luna", c: 380, lvl: 7, r: 4, nw: 3 },
  // ---- cara ----
  { id: "gafasrosa", cat: "ropa", slot: "face", e: "🌟", n: "Gafas de estrella rosa", c: 130, lvl: 2, nw: 3 },
  { id: "gafasgato", cat: "ropa", slot: "face", e: "😼", n: "Gafas de gatita", c: 140, lvl: 3, nw: 3 },
  { id: "gafascorazon", cat: "ropa", slot: "face", e: "😍", n: "Gafas de corazón", c: 120, lvl: 2, nw: 3 },
  { id: "antifazfiesta", cat: "ropa", slot: "face", e: "🎭", n: "Antifaz de fiesta", c: 160, lvl: 3, nw: 3 },
  { id: "gafasbuceo", cat: "ropa", slot: "face", e: "🤿", n: "Gafas de buceo", c: 110, lvl: 2, nw: 3 },
  { id: "gafasredondas", cat: "ropa", slot: "face", e: "👓", n: "Gafas redondas", c: 90, lvl: 1, nw: 3 },
  { id: "pestanas", cat: "ropa", slot: "face", e: "👁️", n: "Pestañas de muñeca", c: 70, lvl: 1, nw: 3 },
  // ---- cuello ----
  { id: "trebol", cat: "ropa", slot: "neck", e: "🍀", n: "Colgante de trébol", c: 130, lvl: 2, nw: 3 },
  { id: "boa", cat: "ropa", slot: "neck", e: "🪶", n: "Boa de plumas", c: 180, lvl: 4, nw: 3 },
  { id: "pajaritaest", cat: "ropa", slot: "neck", e: "⭐", n: "Pajarita de estrellas", c: 90, lvl: 1, nw: 3 },
  { id: "cadenacor", cat: "ropa", slot: "neck", e: "💞", n: "Cadena de corazones", c: 150, lvl: 3, nw: 3 },
  { id: "corbatarayas", cat: "ropa", slot: "neck", e: "👔", n: "Corbata de rayas", c: 80, lvl: 1, nw: 3 },
  { id: "babero", cat: "ropa", slot: "neck", e: "🍼", n: "Babero", c: 40, lvl: 1, nw: 3 },
  { id: "gargantilla", cat: "ropa", slot: "neck", e: "💎", n: "Gargantilla de brillantes", c: 320, lvl: 6, r: 3, nw: 3 },
  // ---- cuerpo ----
  { id: "pijamanube", cat: "ropa", slot: "body", e: "☁️", n: "Pijama de nubes", c: 120, lvl: 2, nw: 3 },
  { id: "chaquetavaq", cat: "ropa", slot: "body", e: "🧥", n: "Chaqueta vaquera", c: 160, lvl: 3, nw: 3 },
  { id: "vestidoflores", cat: "ropa", slot: "body", e: "👗", n: "Vestido de flores", c: 150, lvl: 2, nw: 3 },
  { id: "rebeca", cat: "ropa", slot: "body", e: "🧶", n: "Rebeca de botones", c: 110, lvl: 2, nw: 3 },
  { id: "trajebanio", cat: "ropa", slot: "body", e: "🩱", n: "Bañador de lunares", c: 90, lvl: 1, nw: 3 },
  { id: "bata", cat: "ropa", slot: "body", e: "🥼", n: "Bata de científico", c: 140, lvl: 3, nw: 3 },
  { id: "marinera", cat: "ropa", slot: "body", e: "⚓", n: "Camiseta marinera", c: 100, lvl: 1, nw: 3 },
  { id: "superheroe", cat: "ropa", slot: "body", e: "🦸", n: "Traje de superhéroe", c: 240, lvl: 5, r: 3, nw: 3 },
  { id: "jerseynavidad", cat: "ropa", slot: "body", e: "🎄", n: "Jersey navideño", c: 130, lvl: 1, season: [11, 0], sn: "Navidad", nw: 3 },
  { id: "kimono", cat: "ropa", slot: "body", e: "👘", n: "Kimono de flores", c: 220, lvl: 4, nw: 3 },
  { id: "futbol", cat: "ropa", slot: "body", e: "⚽", n: "Equipación de fútbol", c: 120, lvl: 2, nw: 3 },
  // ---- pies ----
  { id: "deportivas", cat: "ropa", slot: "feet", e: "👟", n: "Zapatillas deportivas", c: 100, lvl: 1, nw: 3 },
  { id: "botasvaquero", cat: "ropa", slot: "feet", e: "🤠", n: "Botas de vaquero", c: 140, lvl: 3, nw: 3 },
  { id: "pantuflas", cat: "ropa", slot: "feet", e: "🐻", n: "Pantuflas de osito", c: 90, lvl: 1, nw: 3 },
  { id: "zapatillasluz", cat: "ropa", slot: "feet", e: "✨", n: "Zapatillas con luces", c: 200, lvl: 4, r: 3, nw: 3 },
  { id: "zuecos", cat: "ropa", slot: "feet", e: "🪵", n: "Zuecos", c: 80, lvl: 2, nw: 3 },
  { id: "charol", cat: "ropa", slot: "feet", e: "👞", n: "Zapatos de charol", c: 130, lvl: 3, nw: 3 },
  // ---- en la mano ----
  { id: "algodonaz", cat: "ropa", slot: "hand", e: "🍭", n: "Algodón de azúcar", c: 70, lvl: 1, nw: 3 },
  { id: "globocor", cat: "ropa", slot: "hand", e: "🎈", n: "Globo de corazón", c: 90, lvl: 1, nw: 3 },
  { id: "libro", cat: "ropa", slot: "hand", e: "📖", n: "Libro de cuentos", c: 80, lvl: 1, nw: 3 },
  { id: "pincel", cat: "ropa", slot: "hand", e: "🖌️", n: "Pincel", c: 70, lvl: 1, nw: 3 },
  { id: "abanico", cat: "ropa", slot: "hand", e: "🪭", n: "Abanico", c: 100, lvl: 2, nw: 3 },
  { id: "rosaroja", cat: "ropa", slot: "hand", e: "🌹", n: "Rosa roja", c: 120, lvl: 2, nw: 3 },
  { id: "molinillo", cat: "ropa", slot: "hand", e: "🌬️", n: "Molinillo de viento", c: 80, lvl: 1, nw: 3 },
  { id: "linterna", cat: "ropa", slot: "hand", e: "🔦", n: "Linterna", c: 90, lvl: 2, nw: 3 },
  { id: "microfono", cat: "ropa", slot: "hand", e: "🎤", n: "Micrófono", c: 150, lvl: 3, nw: 3 },
  { id: "cazamariposas", cat: "ropa", slot: "hand", e: "🦋", n: "Cazamariposas", c: 110, lvl: 2, nw: 3 },
  // ---- espalda ----
  { id: "alasmariposa", cat: "ropa", slot: "back", e: "🦋", n: "Alas de mariposa", c: 280, lvl: 5, r: 3, nw: 3 },
  { id: "alasdragon", cat: "ropa", slot: "back", e: "🐉", n: "Alas de dragón", c: 340, lvl: 7, r: 4, nw: 3 },
  { id: "guitarraesp", cat: "ropa", slot: "back", e: "🎸", n: "Guitarra a la espalda", c: 190, lvl: 4, nw: 3 },
  { id: "mochilauni", cat: "ropa", slot: "back", e: "🦄", n: "Mochila de unicornio", c: 170, lvl: 3, nw: 3 },
  { id: "capaestrellas", cat: "ropa", slot: "back", e: "🌌", n: "Capa de estrellas", c: 260, lvl: 5, r: 3, nw: 3 },
  // ---- magia ----
  { id: "fx_confeti", cat: "fx", slot: "fx", e: "🎊", n: "Confeti de fiesta", c: 230, lvl: 3, nw: 3 },
  { id: "fx_globitos", cat: "fx", slot: "fx", e: "🎈", n: "Globitos flotando", c: 250, lvl: 4, nw: 3 },
  { id: "fx_flores", cat: "fx", slot: "fx", e: "🌷", n: "Flores que flotan", c: 260, lvl: 4, nw: 3 },
  { id: "fx_hojas", cat: "fx", slot: "fx", e: "🍂", n: "Hojas de otoño", c: 200, lvl: 2, season: [9, 10], sn: "otoño", nw: 3 },
  { id: "fx_rayos", cat: "fx", slot: "fx", e: "⚡", n: "Chispas eléctricas", c: 320, lvl: 6, r: 4, nw: 3 },
  { id: "fx_mariposas", cat: "fx", slot: "fx", e: "🦋", n: "Mariposas", c: 300, lvl: 5, r: 3, nw: 3 },
  // ---- comida ----
  { id: "onigiri", cat: "comida", e: "🍙", n: "Onigiri", c: 20, lvl: 1, eff: { food: 25, energy: 5 }, nw: 3 },
  { id: "taco", cat: "comida", e: "🌮", n: "Taco", c: 24, lvl: 1, eff: { food: 30, fun: 5 }, nw: 3 },
  { id: "burger", cat: "comida", e: "🍔", n: "Hamburguesita", c: 30, lvl: 2, eff: { food: 45 }, nw: 3 },
  { id: "donut", cat: "comida", e: "🍩", n: "Dónut", c: 15, lvl: 1, eff: { food: 12, fun: 12 }, nw: 3 },
  { id: "tortitas", cat: "comida", e: "🥞", n: "Tortitas", c: 22, lvl: 1, eff: { food: 25, love: 8 }, nw: 3 },
  { id: "sandia", cat: "comida", e: "🍉", n: "Sandía", c: 14, lvl: 1, eff: { food: 15, clean: 5, energy: 5 }, nw: 3 },
  { id: "uvas", cat: "comida", e: "🍇", n: "Uvas", c: 12, lvl: 1, eff: { food: 12, energy: 6 }, nw: 3 },
  { id: "pretzel", cat: "comida", e: "🥨", n: "Pretzel", c: 14, lvl: 1, eff: { food: 16 }, nw: 3 },
  { id: "te", cat: "comida", e: "🍵", n: "Té calentito", c: 12, lvl: 1, eff: { energy: 12, love: 6 }, nw: 3 },
  { id: "zumo", cat: "comida", e: "🧃", n: "Zumito", c: 10, lvl: 1, eff: { food: 8, energy: 10 }, nw: 3 },
  { id: "ramen", cat: "comida", e: "🍜", n: "Ramen", c: 32, lvl: 3, eff: { food: 50, energy: 8 }, nw: 3 },
  { id: "cupcake", cat: "comida", e: "🧁", n: "Cupcake", c: 20, lvl: 1, eff: { food: 12, love: 12 }, nw: 3 },
  { id: "flan", cat: "comida", e: "🍮", n: "Flan", c: 16, lvl: 1, eff: { food: 14, fun: 8 }, nw: 3 },
  { id: "aguacate", cat: "comida", e: "🥑", n: "Tostada de aguacate", c: 22, lvl: 2, eff: { food: 30, energy: 10 }, nw: 3 },
  // ---- juguetes ----
  { id: "boomerang", cat: "juguete", e: "🪃", n: "Bumerán", c: 80, lvl: 2, fun: 25, nw: 3 },
  { id: "canicas", cat: "juguete", e: "🔮", n: "Canicas", c: 60, lvl: 1, fun: 20, nw: 3 },
  { id: "dados", cat: "juguete", e: "🎲", n: "Dados gigantes", c: 50, lvl: 1, fun: 18, nw: 3 },
  { id: "pelotaplaya", cat: "juguete", e: "🏐", n: "Pelota de playa", c: 70, lvl: 1, fun: 25, nw: 3 },
  { id: "trenjug", cat: "juguete", e: "🚂", n: "Tren de juguete", c: 140, lvl: 3, fun: 35, nw: 3 },
  { id: "cohetejug", cat: "juguete", e: "🚀", n: "Cohete de juguete", c: 160, lvl: 4, fun: 40, nw: 3 },
  { id: "tambor", cat: "juguete", e: "🥁", n: "Tambor", c: 90, lvl: 2, fun: 28, nw: 3 },
  // ---- casa: muebles ----
  { id: "mesa", cat: "casa", kind: "furn", e: "🍽️", n: "Mesa con sillas", c: 90, lvl: 1, nw: 3 },
  { id: "nevera", cat: "casa", kind: "furn", e: "🧊", n: "Nevera", c: 110, lvl: 2, nw: 3 },
  { id: "armario", cat: "casa", kind: "furn", e: "🚪", n: "Armario ropero", c: 120, lvl: 2, nw: 3 },
  { id: "escritorio", cat: "casa", kind: "furn", e: "💻", n: "Escritorio con ordenador", c: 150, lvl: 3, nw: 3 },
  { id: "hamaca", cat: "casa", kind: "furn", e: "🌴", n: "Hamaca", c: 140, lvl: 3, nw: 3 },
  { id: "barbacoa", cat: "casa", kind: "furn", e: "🍖", n: "Barbacoa", c: 130, lvl: 3, nw: 3 },
  { id: "cunita", cat: "casa", kind: "furn", e: "🍼", n: "Cunita para las crías", c: 120, lvl: 2, nw: 3 },
  { id: "chimenea", cat: "casa", kind: "furn", e: "🔥", n: "Chimenea", c: 220, lvl: 4, nw: 3 },
  { id: "macetas", cat: "casa", kind: "furn", e: "🪴", n: "Macetas colgantes", c: 70, lvl: 1, nw: 3 },
  { id: "poster", cat: "casa", kind: "furn", e: "🌠", n: "Póster de estrellas", c: 50, lvl: 1, nw: 3 },
  { id: "mural", cat: "casa", kind: "furn", e: "🖼️", n: "Mural de fotos", c: 90, lvl: 2, nw: 3 },
  { id: "lamparaluna", cat: "casa", kind: "furn", e: "🌙", n: "Lámpara de luna", c: 80, lvl: 2, nw: 3 },
  { id: "osogigante", cat: "casa", kind: "furn", e: "🧸", n: "Oso de peluche gigante", c: 160, lvl: 3, nw: 3 },
  { id: "banco", cat: "casa", kind: "furn", e: "🪑", n: "Banco de jardín", c: 90, lvl: 2, nw: 3 },
  { id: "columpio", cat: "casa", kind: "furn", e: "🎠", n: "Columpio", c: 180, lvl: 4, nw: 3 },
  { id: "arcade", cat: "casa", kind: "furn", e: "🕹️", n: "Máquina recreativa", c: 260, lvl: 5, r: 3, nw: 3 },
  // ---- casa: paredes y suelos ----
  { id: "w_ladrillo", cat: "casa", kind: "wall", n: "Pared de ladrillo", c: 90, lvl: 2, sw: "#c8745a", nw: 3 },
  { id: "w_rayas", cat: "casa", kind: "wall", n: "Papel de rayas", c: 70, lvl: 1, sw: "#d9ecff", nw: 3 },
  { id: "w_nubes", cat: "casa", kind: "wall", n: "Papel de nubes", c: 120, lvl: 3, sw: "#bfe3ff", nw: 3 },
  { id: "w_salvia", cat: "casa", kind: "wall", n: "Pared verde salvia", c: 50, lvl: 1, sw: "#cfdcc4", nw: 3 },
  { id: "w_sol", cat: "casa", kind: "wall", n: "Pared amarillo sol", c: 50, lvl: 1, sw: "#ffefb0", nw: 3 },
  { id: "w_lunares", cat: "casa", kind: "wall", n: "Papel de lunares", c: 90, lvl: 2, sw: "#ffd6e2", nw: 3 },
  { id: "f_parquet", cat: "casa", kind: "floor", n: "Parquet claro", c: 70, lvl: 1, sw: "#d9b07a", fs: "planks", nw: 3 },
  { id: "f_nogal", cat: "casa", kind: "floor", n: "Madera de nogal", c: 90, lvl: 2, sw: "#7a5232", fs: "planks", nw: 3 },
  { id: "f_ajedrez", cat: "casa", kind: "floor", n: "Suelo de ajedrez", c: 110, lvl: 3, sw: "#e9e4dc", fs: "check", nw: 3 },
  { id: "f_terrazo", cat: "casa", kind: "floor", n: "Terrazo", c: 90, lvl: 2, sw: "#e8ddd2", fs: "tiles", nw: 3 },
  { id: "f_alfombra", cat: "casa", kind: "floor", n: "Moqueta azul", c: 60, lvl: 1, sw: "#7f9fd9", fs: "carpet", nw: 3 }
);
const CAT = Object.fromEntries(CATALOG.map(x => [x.id, x]));
const COLM = Object.fromEntries(CATALOG.filter(x => x.cat === "color").map(x => [x.id, x]));   // los colores tienen ids que chocan (rosa)
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
  backfillFirsts(p);
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
function setNeed(p, k, delta) { if (delta > 0) { if (k === "food" && setOn(p, "chef")) delta *= 1.5; if (k === "love" && setOn(p, "heroe")) delta *= 2; else if (k === "love" && setOn(p, "amor")) delta *= 1.5; } p.n = p.n || {}; p.n[k] = { v: Math.round(clamp(needNow(p, k) + delta)), t: Date.now() }; }
function gainExp(p, n) { const b = levelOf(p.exp).l; p.exp = (p.exp || 0) + Math.round(n * expMul(p)); const a = levelOf(p.exp).l; if (a > b) { if (a >= 10) firstMark(p, "lvl10"); p.coins += 20 * (a - b); return a; } return 0; }
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
  const x2 = items2(id); if (x2 != null) return x2;
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
    // ---- v38 · novedades ----
    case "ranita": return `<g transform="translate(100 72)"><path d="M-38 2 Q-38 -34 0 -36 Q38 -34 38 2 Z" fill="#6fcf5b"/><circle cx="-18" cy="-32" r="11" fill="#6fcf5b"/><circle cx="18" cy="-32" r="11" fill="#6fcf5b"/><circle cx="-18" cy="-33" r="6.5" fill="#fff"/><circle cx="18" cy="-33" r="6.5" fill="#fff"/><circle cx="-17" cy="-32" r="3.2" fill="#2b1a10"/><circle cx="19" cy="-32" r="3.2" fill="#2b1a10"/><path d="M-10 -14 Q0 -8 10 -14" stroke="#3f9a3a" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="-40" y="-4" width="80" height="9" rx="4.5" fill="#4fb043"/></g>`;
    case "gfresa": return `<g transform="translate(100 72)"><path d="M-36 2 Q-36 -40 0 -42 Q36 -40 36 2 Z" fill="#ff4d5e"/>${[[-20, -20], [-6, -30], [10, -22], [22, -10], [-26, -6], [4, -10], [-12, -10], [18, -32]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.8" ry="2.8" fill="#ffe29a"/>`).join("")}<path d="M-16 -40 L-8 -50 L-2 -41 L6 -51 L14 -40 Q0 -34 -16 -40Z" fill="#3fa34d"/><path d="M0 -44 v-9" stroke="#2d8a3e" stroke-width="3" stroke-linecap="round"/><rect x="-38" y="-5" width="76" height="9" rx="4.5" fill="#e63946"/></g>`;
    case "diadcor": return `<g><path d="M60 82 Q100 58 140 82" stroke="#ff5c8a" stroke-width="5" fill="none"/><path d="M84 70 Q80 58 84 48 M116 70 Q120 58 116 48" stroke="#ff5c8a" stroke-width="2.5" fill="none"/><path d="M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z" transform="translate(84 44) scale(1.4)" fill="#ff3d7f"/><path d="M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z" transform="translate(116 44) scale(1.4)" fill="#ff3d7f"/><circle cx="80" cy="36" r="1.8" fill="#fff" opacity=".7"/><circle cx="112" cy="36" r="1.8" fill="#fff" opacity=".7"/></g>`;
    case "cascobici": return `<g transform="translate(100 74)"><path d="M-40 0 Q-40 -40 0 -42 Q40 -40 40 0 Z" fill="#20c997"/><path d="M-24 -34 L-18 -8 M0 -40 L0 -10 M24 -34 L18 -8" stroke="#138a67" stroke-width="5" stroke-linecap="round"/><path d="M-40 0 H40" stroke="#138a67" stroke-width="5" stroke-linecap="round"/><path d="M-12 -38 Q0 -44 12 -38" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/></g>`;
    case "florsol": return `<g transform="translate(128 70) rotate(15)"><g transform="translate(0 0)">${petals(0, 0, 11, 12, "#ffd23f")}</g><circle r="7.5" fill="#6b3f1f"/><circle cx="-2" cy="-2" r="2" fill="#8a5a38"/></g>`;
    case "nubecita": return `<g class="bob"><g fill="#fff"><circle cx="84" cy="36" r="12"/><circle cx="100" cy="28" r="16"/><circle cx="117" cy="36" r="12"/><rect x="72" y="36" width="58" height="12" rx="6"/></g><g fill="#7fb7ff"><path class="fxtw" d="M86 54 q-3 6 0 8 q3 -2 0 -8Z"/><path class="fxtw" style="animation-delay:.4s" d="M100 58 q-3 6 0 8 q3 -2 0 -8Z"/><path class="fxtw" style="animation-delay:.8s" d="M114 54 q-3 6 0 8 q3 -2 0 -8Z"/></g></g>`;
    case "aviador": return `<g><path d="M64 100 H94 Q96 120 80 121 Q64 120 64 100Z" fill="rgba(90,60,20,.55)" stroke="#d4a017" stroke-width="2.5"/><path d="M106 100 H136 Q136 120 120 121 Q104 120 106 100Z" fill="rgba(90,60,20,.55)" stroke="#d4a017" stroke-width="2.5"/><path d="M94 101 H106 M94 98 Q100 95 106 98" stroke="#d4a017" stroke-width="2.5" fill="none"/><path d="M69 104 L78 104 M111 104 L120 104" stroke="#fff" stroke-width="2" opacity=".6"/></g>`;
    case "pixel": return `<g><g fill="#111"><rect x="62" y="99" width="76" height="6"/><rect x="66" y="105" width="28" height="7"/><rect x="106" y="105" width="28" height="7"/><rect x="70" y="112" width="20" height="5"/><rect x="110" y="112" width="20" height="5"/></g><g fill="#fff"><rect x="70" y="105" width="5" height="5"/><rect x="110" y="105" width="5" height="5"/></g></g>`;
    case "tirita": return `<g transform="translate(126 124) rotate(-25)"><rect x="-13" y="-5" width="26" height="10" rx="5" fill="#f4c7a1"/><rect x="-5" y="-5" width="10" height="10" fill="#e8b48a"/><circle cx="-9" cy="0" r=".9" fill="#c98f63"/><circle cx="9" cy="0" r=".9" fill="#c98f63"/></g>`;
    case "colgante": return `<g><path d="M64 142 Q100 162 136 142" stroke="#e0b84a" stroke-width="2.5" fill="none"/><path d="M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z" transform="translate(100 162) scale(1.25)" fill="#ffc629" stroke="#e0a100" stroke-width="1.5"/><circle cx="96" cy="155" r="1.8" fill="#fff" opacity=".85"/></g>`;
    case "fular": return `<g><path d="M58 140 Q100 160 142 140 L143 152 Q100 172 57 152 Z" fill="#3a86ff"/><path d="M82 150 L70 150 L64 178 L78 178 Z" fill="#3a86ff"/><g fill="#fff">${[[66, 146], [80, 153], [96, 157], [112, 156], [128, 151], [138, 145], [72, 160], [70, 172]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join("")}</g></g>`;
    case "pajlun": return `<g transform="translate(100 152)"><path d="M0 0 L-18 -11 L-18 11 Z M0 0 L18 -11 L18 11 Z" fill="#e63946"/><g fill="#fff"><circle cx="-12" cy="-3" r="1.8"/><circle cx="-8" cy="5" r="1.8"/><circle cx="12" cy="-3" r="1.8"/><circle cx="8" cy="5" r="1.8"/></g><circle r="4.5" fill="#b3202c"/></g>`;
    case "chubasquero": return `<g><path d="M40 126 Q100 134 160 126 V176 H40Z" fill="#ffd23f"/><path d="M100 130 V176" stroke="#e0a100" stroke-width="3"/>${[142, 154, 166].map(y => `<circle cx="106" cy="${y}" r="2.6" fill="#e0a100"/>`).join("")}<path d="M82 128 L100 140 L118 128" stroke="#e0a100" stroke-width="4" fill="none"/><rect x="58" y="152" width="20" height="12" rx="3" fill="#f4c20d"/><rect x="122" y="152" width="20" height="12" rx="3" fill="#f4c20d"/></g>`;
    case "hawaiana": return `<g><path d="M40 128 Q100 136 160 128 V176 H40Z" fill="#20c5c5"/><path d="M84 128 L100 146 L116 128Z" fill="#fff" opacity=".85"/>${[[62, 146], [134, 142], [78, 166], [122, 166], [100, 160]].map(([x, y], i) => `<ellipse cx="${x - 7}" cy="${y + 4}" rx="7" ry="3" fill="#2d8a3e" transform="rotate(-30 ${x - 7} ${y + 4})"/>${petals(x, y, 5, 5, i % 2 ? "#ff5c8a" : "#ffd23f")}<circle cx="${x}" cy="${y}" r="2.2" fill="#fff"/>`).join("")}</g>`;
    case "peto": return `<g><rect x="40" y="148" width="120" height="30" fill="#4a78c2"/><rect x="72" y="134" width="56" height="20" rx="4" fill="#4a78c2"/><path d="M76 136 L64 124 M124 136 L136 124" stroke="#4a78c2" stroke-width="7" stroke-linecap="round"/><circle cx="78" cy="139" r="3" fill="#ffd23f"/><circle cx="122" cy="139" r="3" fill="#ffd23f"/><rect x="88" y="140" width="24" height="10" rx="2" fill="#3a63a8"/><path d="M40 150 H160" stroke="#3a63a8" stroke-width="2" stroke-dasharray="4 3"/></g>`;
    case "tutu": return `<g><path d="M30 150 Q42 172 54 152 Q66 174 78 152 Q90 174 102 152 Q114 174 126 152 Q138 174 150 152 Q162 172 170 150 Z" fill="#ffc1dc"/><path d="M36 146 Q48 164 60 148 Q72 166 84 148 Q96 166 108 148 Q120 166 132 148 Q144 164 164 146 Z" fill="#ffa6cb"/><path d="M40 128 Q100 136 160 128 V146 H40Z" fill="#ff8fb8"/><rect x="40" y="141" width="120" height="7" fill="#ff5c8a"/></g>`;
    case "abrigo": return `<g><path d="M40 126 Q100 134 160 126 V176 H40Z" fill="#a0673a"/><path d="M100 134 V176" stroke="#7a4a26" stroke-width="3"/>${[146, 160].map(y => `<circle cx="92" cy="${y}" r="3" fill="#5a3418"/><circle cx="108" cy="${y}" r="3" fill="#5a3418"/>`).join("")}<path d="M50 127 Q100 150 150 127 Q150 140 100 144 Q50 140 50 127Z" fill="#f4ecd8"/><path d="M58 134 q4 3 8 0 M74 139 q4 3 8 0 M118 139 q4 3 8 0 M134 134 q4 3 8 0" stroke="#e2d6bd" stroke-width="2" fill="none"/></g>`;
    case "jerseycor": return `<g><path d="M40 126 Q100 134 160 126 V176 H40Z" fill="#f3e6d3"/><path d="M58 134 V170 M142 134 V170" stroke="#e2cfb6" stroke-width="3" stroke-dasharray="4 3"/><path d="M40 170 H160" stroke="#e2cfb6" stroke-width="6"/><path d="M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z" transform="translate(100 160) scale(1.6)" fill="#ff5c8a"/></g>`;
    case "zapconejo": return pair2(x => `<ellipse cx="${x - 5}" cy="164" rx="3" ry="7" fill="#fff" stroke="#f2dfe6"/><ellipse cx="${x + 3}" cy="164" rx="3" ry="7" fill="#fff" stroke="#f2dfe6"/>` + shoe(x, "#fff", "#f2dfe6", `<circle cx="${x + 7}" cy="174" r="1.6" fill="#2b1a10"/><circle cx="${x + 12}" cy="177" r="1.6" fill="#ff8fb8"/>`));
    case "botasnieve": return pair2(x => `<path d="M${x - 10} 160 H${x + 8} V174 Q${x + 14} 175 ${x + 14} 180 V185 H${x - 10}Z" fill="#e63946"/><rect x="${x - 12}" y="156" width="22" height="8" rx="4" fill="#fff"/><rect x="${x - 10}" y="182" width="24" height="3" fill="#8a1020"/>`);
    case "aletas": return pair2(x => `<path d="M${x - 8} 172 Q${x} 166 ${x + 8} 172 L${x + 15} 190 Q${x} 195 ${x - 15} 190Z" fill="#20c997"/><path d="M${x - 4} 180 L${x - 6} 190 M${x + 4} 180 L${x + 6} 190" stroke="#138a67" stroke-width="1.5"/>`);
    case "bailarinas": return pair2(x => shoe(x, "#ff8fb8", "#e0668f", `<path d="M${x - 5} 169 l5 3 5 -3 -5 -2z" fill="#fff"/>`));
    case "cucu": return `<g><path d="M152 118 L164 150 L176 118Z" fill="#e0a45e"/><path d="M156 124 L172 124 M158 131 L170 131 M160 138 L168 138" stroke="#b5793c" stroke-width="1.5"/><circle cx="164" cy="112" r="11" fill="#ffb3d1"/><circle cx="157" cy="104" r="8" fill="#fff3c4"/><circle cx="171" cy="104" r="7" fill="#9fd3ff"/><circle cx="164" cy="95" r="3" fill="#e63946"/></g>`;
    case "paraguas": return `<g><path d="M150 150 L148 72" stroke="#2b2d42" stroke-width="3"/><path d="M150 150 q0 8 -6 8" stroke="#2b2d42" stroke-width="3" fill="none"/><path d="M96 74 Q148 22 198 74 Q185 64 172 74 Q160 64 148 74 Q135 64 122 74 Q109 64 96 74Z" fill="#7b61ff"/><path d="M122 74 Q128 40 148 30 Q140 50 148 74 Q135 64 122 74Z" fill="#9b87ff"/><path d="M172 74 Q168 42 148 30 Q158 50 148 74 Q160 64 172 74Z" fill="#6247e0"/><circle cx="148" cy="28" r="3" fill="#2b2d42"/></g>`;
    case "guitarm": return `<g transform="translate(162 130) rotate(-35)"><rect x="-3" y="-46" width="6" height="34" fill="#6b3f1f"/><rect x="-5" y="-52" width="10" height="8" rx="2" fill="#3a2414"/><ellipse cx="0" cy="-4" rx="13" ry="11" fill="#e07a2e"/><ellipse cx="0" cy="11" rx="16" ry="13" fill="#e07a2e"/><circle cx="0" cy="3" r="4.5" fill="#3a2414"/><rect x="-6" y="14" width="12" height="3" fill="#3a2414"/></g>`;
    case "ramo": return `<g><path d="M152 150 L160 116 M158 150 L166 112 M164 150 L172 118" stroke="#2d8a3e" stroke-width="3"/><circle cx="156" cy="110" r="7" fill="#ff5c8a"/><circle cx="168" cy="104" r="7" fill="#ffd23f"/><circle cx="176" cy="114" r="6" fill="#b48be0"/><circle cx="156" cy="110" r="2.5" fill="#fff"/><circle cx="168" cy="104" r="2.5" fill="#fff"/><circle cx="176" cy="114" r="2.2" fill="#fff"/><path d="M144 122 L182 122 L168 154 L158 154Z" fill="#fff3f7" stroke="#ffb3d1" stroke-width="1.5"/><path d="M156 136 l7 4 7 -4" stroke="#ff5c8a" stroke-width="2.5" fill="none"/></g>`;
    case "cartamor": return `<g transform="translate(162 126) rotate(-12)"><rect x="-17" y="-12" width="34" height="24" rx="3" fill="#fffaf2" stroke="#e8d9bf" stroke-width="1.5"/><path d="M-17 -12 L0 3 L17 -12" stroke="#e8d9bf" stroke-width="1.5" fill="none"/><path d="M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z" transform="translate(0 4) scale(.7)" fill="#e63946"/></g>`;
    case "camaram": return `<g transform="translate(164 126)"><rect x="-17" y="-11" width="34" height="23" rx="5" fill="#2b2d42"/><rect x="-8" y="-15" width="12" height="6" rx="2" fill="#2b2d42"/><circle cx="0" cy="1" r="8" fill="#9aa5b1"/><circle cx="0" cy="1" r="5" fill="#1b1d2a"/><circle cx="-2" cy="-1" r="1.6" fill="#fff"/><circle cx="11" cy="-6" r="2" fill="#ffd23f"/></g>`;
    case "osito": return `<g><circle cx="152" cy="118" r="20" fill="#b98158"/><circle cx="138" cy="100" r="7" fill="#b98158"/><circle cx="166" cy="100" r="7" fill="#b98158"/><circle cx="138" cy="100" r="3.5" fill="#ecd0b4"/><circle cx="166" cy="100" r="3.5" fill="#ecd0b4"/><ellipse cx="152" cy="124" rx="8" ry="6" fill="#ecd0b4"/><circle cx="145" cy="114" r="2.3" fill="#2b1a10"/><circle cx="159" cy="114" r="2.3" fill="#2b1a10"/><circle cx="152" cy="122" r="2" fill="#2b1a10"/></g>`;
    case "caparazon": return `<g><ellipse cx="100" cy="126" rx="64" ry="54" fill="#588157" stroke="#3a5a40" stroke-width="4"/>${[[42, 110], [46, 142], [158, 110], [154, 142], [100, 76]].map(([x, y]) => `<path d="M${x - 8} ${y} l4 -7 h8 l4 7 -4 7 h-8z" fill="#a3b18a" stroke="#3a5a40" stroke-width="1.5"/>`).join("")}</g>`;
    case "globitos": return `<g><path d="M70 132 Q50 100 34 70 M70 132 Q62 96 58 52 M70 132 Q72 100 80 76" stroke="#999" stroke-width="1.3" fill="none"/><ellipse cx="32" cy="58" rx="13" ry="16" fill="#4d9dff"/><ellipse cx="58" cy="40" rx="13" ry="16" fill="#ff5c8a"/><ellipse cx="82" cy="62" rx="12" ry="15" fill="#ffd23f"/><ellipse cx="28" cy="52" rx="3" ry="5" fill="#fff" opacity=".5"/><ellipse cx="54" cy="34" rx="3" ry="5" fill="#fff" opacity=".5"/><ellipse cx="78" cy="56" rx="3" ry="5" fill="#fff" opacity=".5"/></g>`;
    case "alasang": return `<g fill="#fff" stroke="#e6e6f0" stroke-width="2"><path d="M60 112 Q14 88 18 128 Q26 150 60 140 Z"/><path d="M58 122 Q26 112 28 140 Q40 152 60 146 Z"/><path d="M140 112 Q186 88 182 128 Q174 150 140 140 Z"/><path d="M142 122 Q174 112 172 140 Q160 152 140 146 Z"/></g>`;
  }
  return "";
}
function eyesSVG(expr, u) {
  const ink = "#2b1a10";
  if (expr === "happy" || expr === "laugh") return `<path d="M71 110 Q80 98 89 110 M111 110 Q120 98 129 110" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  if (expr === "sleep") return `<path d="M71 106 Q80 114 89 106 M111 106 Q120 114 129 106" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (expr === "love") { const H = "M0 6 C-12 -2 -12 -12 -5 -12 C-2 -12 0 -9 0 -7 C0 -9 2 -12 5 -12 C12 -12 12 -2 0 6Z"; return `<path d="${H}" transform="translate(80 110)" fill="#ff3d7f"/><path d="${H}" transform="translate(120 110)" fill="#ff3d7f"/>`; }
  if (expr === "bored") return `<g class="eyesg"><path d="M71 106 L89 106 M111 106 L129 106" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M74 107 Q80 113 86 107 M114 107 Q120 113 126 107" fill="${ink}"/></g>`;
  if (expr === "tired") return `<g class="eyesg"><path d="M72 104 Q80 110 88 104 M112 104 Q120 110 128 104" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M73 114 Q80 118 87 114 M113 114 Q120 118 127 114" stroke="#8a6f90" stroke-width="2.5" fill="none" opacity=".7"/></g>`;
  if (expr === "sick") return `<g class="eyesg"><path d="M72 102 L88 110 M72 110 L88 102 M112 102 L128 110 M112 110 L128 102" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/></g>`;
  const r = expr === "surprised" ? 9.5 : 7.5;
  const R = r + 1, iris = u ? `url(#${u}i)` : ink;
  let s = `<g class="eyesg"><g class="eyes">${[80, 120].map(x => `<circle cx="${x}" cy="107" r="${R}" fill="${iris}"/><circle cx="${x + 2.8}" cy="103.6" r="3.3" fill="#fff"/><circle cx="${x - 2.6}" cy="110.8" r="1.5" fill="#fff" opacity=".85"/>`).join("")}</g></g>`;
  if (expr === "sad") s += `<path d="M68 100 L88 93 M132 100 L112 93" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/><path class="tear" d="M73 118 Q70 124 73 127 Q76 124 73 118 Z" fill="#6cc3ff"/>`;
  if (expr === "hungry") s += `<path d="M71 96 Q79 90 88 93 M129 96 Q121 90 112 93" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/><path class="drool" d="M108 130 Q106 138 109 141 Q112 138 108 130Z" fill="#9fd3ff"/>`;
  return s;
}
function bodyFill(C) {
  if (C.grad) { const id = "grd_" + (C.id || "x") + "_" + hashStr(C.grad.join()); return { defs: `<linearGradient id="${id}" x1="0" y1="0" x2=".6" y2="1">${C.grad.map((c, i) => `<stop offset="${(i / (C.grad.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("")}</linearGradient>`, fill: `url(#${id})` }; }
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
// v39 · gráficos con volumen: degradados por mascota (ids únicos para que no choquen entre sí)
let chickUid = 0;
function hexMix(h, to, t) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "")); if (!m) return h;
  const a = parseInt(m[1], 16), b = parseInt(to.slice(1), 16), c = k => Math.round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t);
  return "#" + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
}
function chickDefs(u, dk = "#b07a00") {
  return `<radialGradient id="${u}s" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".28" stop-color="#fff" stop-opacity=".06"/><stop offset=".6" stop-color="${dk}" stop-opacity="0"/><stop offset="1" stop-color="${dk}" stop-opacity=".6"/></radialGradient>
    <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#6b3a00" stop-opacity=".12"/></linearGradient>
    <radialGradient id="${u}k"><stop offset="0" stop-color="#ff6f8f" stop-opacity=".95"/><stop offset=".65" stop-color="#ff8fa3" stop-opacity=".7"/><stop offset="1" stop-color="#ff8fa3" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}g"><stop offset="0" stop-color="#8fd46b" stop-opacity=".9"/><stop offset="1" stop-color="#a8d88a" stop-opacity="0"/></radialGradient>
    <linearGradient id="${u}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc766"/><stop offset=".6" stop-color="#ff9f1c"/><stop offset="1" stop-color="#e57a00"/></linearGradient>
    <radialGradient id="${u}i" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#6e4630"/><stop offset=".55" stop-color="#2b1a10"/><stop offset="1" stop-color="#120804"/></radialGradient>
    <radialGradient id="${u}h"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".7" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
}
function chickSVG(si, expr, wear, crackLevel, colorId, extra = {}) {
  const u = "ck" + (++chickUid) + "_";
  const sp = extra.species || "pollito", SPC = SPECIES[sp] || SPECIES.pollito;
  const shadow = `<ellipse cx="100" cy="182" rx="${si ? 44 + si * 3 : 46}" ry="9" fill="url(#${u}h)"/>`;
  if (si === 0) {
    const cracks = crackLevel ? `<path d="M64 112 L76 102 L84 114 L96 100 L106 114 L118 102 L128 112" stroke="#a88a60" stroke-width="3" fill="none" stroke-linejoin="round"/>` : "";
    return `<svg viewBox="0 0 200 200" class="chick"><defs>${chickDefs(u, "#c9a878")}</defs>${shadow}<g class="egg-g ${crackLevel ? "shake" : ""}">
      <ellipse cx="100" cy="120" rx="47" ry="60" fill="#fff6e6"/><ellipse cx="100" cy="120" rx="47" ry="60" fill="url(#${u}s)" opacity=".7"/><ellipse cx="100" cy="120" rx="47" ry="60" fill="none" stroke="#d9c6a4" stroke-width="2.5"/>
      <ellipse cx="80" cy="96" rx="9" ry="7" fill="${SPC.egg}"/><ellipse cx="118" cy="140" rx="11" ry="8" fill="${SPC.egg}"/><ellipse cx="116" cy="92" rx="5" ry="4" fill="${SPC.egg}"/><ellipse cx="72" cy="140" rx="6" ry="5" fill="${SPC.egg}"/>
      <ellipse cx="82" cy="84" rx="10" ry="16" fill="#fff" opacity=".6" transform="rotate(25 82 84)"/>${cracks}</g></svg>`;
  }
  const sc = [0, .74, .84, .94, 1.0, 1.06, 1.1][si];
  const C = (colorId && typeof colorId === "object") ? colorId : (COLM[colorId] || COLM.amarillo), { belly, dark } = C, BF = bodyFill(C), body = C.body, ink = "#2b1a10";
  const cls = { happy: "happy", laugh: "happy", love: "happy", sad: "sad", sick: "sick", tired: "tired" }[expr] || "";
  const bird = sp === "pollito" || sp === "pinguino";
  const open = (expr === "happy" || expr === "laugh" || expr === "love") ? 4 : expr === "surprised" ? 3 : 0;
  // patas
  const line = hexMix(dark, "#3a1a00", .45);
  const foot = x => `<path d="M${x} 164 L${x} 178" stroke="#f28a00" stroke-width="5" stroke-linecap="round"/><path d="M${x} 178 L${x - 8} 183 M${x} 178 L${x} 185 M${x} 178 L${x + 8} 183" stroke="#ff9f1c" stroke-width="4.2" stroke-linecap="round"/>`;
  const paw = x => `<ellipse cx="${x}" cy="174" rx="13" ry="8.5" fill="${dark}"/><ellipse cx="${x}" cy="174" rx="13" ry="8.5" fill="url(#${u}s)"/><path d="M${x - 4} 179 v-4 M${x + 4} 179 v-4" stroke="${line}" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>`;
  const feet = si === 1 || extra.nofeet ? "" : `<g class="leg ll">${bird ? foot(86) : paw(84)}</g><g class="leg lr">${bird ? foot(114) : paw(116)}</g>`;
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
  if (earsBack) earsBack = `<g stroke="${line}" stroke-width="2" stroke-opacity=".35" stroke-linejoin="round">${earsBack}</g>`;
  const earsFront = sp === "perro" ? `<g stroke="${line}" stroke-width="2" stroke-opacity=".35">${[[56, 18], [144, -18]].map(([x, r]) => `<ellipse cx="${x}" cy="102" rx="14" ry="30" fill="${dark}" transform="rotate(${r} ${x} 102)"/><ellipse cx="${x}" cy="102" rx="14" ry="30" fill="url(#${u}s)" stroke="none" transform="rotate(${r} ${x} 102)"/>`).join("")}</g>` : "";
  // pico / hocico
  let mouth;
  if (sp === "pollito") mouth = `<path d="M89 118 Q100 111 111 118 L100 127 Z" fill="url(#${u}p)"/><path d="M94 117 Q100 114 104 116" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".6"/><g class="beak-low" style="transform-box:fill-box"><path d="M93 ${126 + open} L107 ${126 + open} L100 ${133 + open} Z" fill="#f08400"/></g>` + (open ? `<path d="M95 125 L105 125 L100 ${128 + open} Z" fill="#c2413d"/>` : "");
  else if (sp === "pinguino") mouth = `<path d="M93 118 Q100 114 107 118 L100 125 Z" fill="url(#${u}p)"/><g class="beak-low" style="transform-box:fill-box"><path d="M95 ${124 + open} L105 ${124 + open} L100 ${129 + open} Z" fill="#f08400"/></g>`;
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
  const limb = (cls, cx, cy, rx, ry, r) => `<g class="wing ${cls}"><g transform="rotate(${r} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${dark}" stroke="${line}" stroke-width="2" stroke-opacity=".35"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${u}s)"/>${bird ? `<path d="M${cx - rx * .5} ${cy + ry * .55} q${rx * .25} ${ry * .3} ${rx * .5} 0 q${rx * .25} ${ry * .3} ${rx * .5} 0" stroke="${line}" stroke-width="1.5" fill="none" opacity=".35"/>` : ""}</g></g>`;
  const wings = bird ? limb("wl", 54, 128, 13, 24, 22) + limb("wr", 146, 128, 13, 24, -22) : limb("wl", 58, 146, 11, 16, 20) + limb("wr", 142, 146, 11, 16, -20);
  const cheekOp = expr === "sad" || expr === "sick" ? .45 : 1, cheekCol = expr === "sick" ? `url(#${u}g)` : `url(#${u}k)`;
  const fluff = bird && si <= 3 ? `<path d="M74 118 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0 q2 -3 3 0" fill="none" stroke="${belly}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  return `<svg viewBox="0 0 200 200" class="chick ${cls} sp-${sp}"><defs>${BF.defs}${chickDefs(u, hexMix(dark, "#000000", .15))}<clipPath id="bodyclip"><circle cx="100" cy="116" r="52"/></clipPath></defs>${shadow}
   <g transform="translate(100 182) scale(${sc}) translate(-100 -182)">
    ${fxSVG(wear.fx, "back")}${itemSVG(wear.back)}${tail}${feet}${si > 1 ? itemSVG(wear.feet) : ""}
    <g class="bodyg">
      ${earsBack}${wings}
      <circle cx="100" cy="116" r="52" fill="${BF.fill}"${bodyOp}/>
      <g clip-path="url(#bodyclip)">${patternSVG(C)}${markSVG(wear.mark, C, "under")}</g>
      <circle cx="100" cy="116" r="52" fill="url(#${u}s)"/>
      <ellipse cx="100" cy="136" rx="31" ry="25" fill="${belly}"/><ellipse cx="100" cy="136" rx="31" ry="25" fill="url(#${u}b)"/>${fluff}
      <circle cx="100" cy="116" r="51" fill="none" stroke="${bodyStroke ? "#d8cfc2" : line}" stroke-width="2.4" stroke-opacity="${bodyStroke ? 1 : .35}"/>
      ${wear.body ? `<g clip-path="url(#bodyclip)">${itemSVG(wear.body)}</g>` : ""}
      <ellipse cx="80" cy="84" rx="12" ry="7" fill="#fff" opacity=".35" transform="rotate(-25 80 84)"/>
      ${markSVG(wear.mark, C, "over")}${earsFront}${dirt}${head}${itemSVG(neckItem)}
      ${eyesSVG(expr, u)}
      <ellipse cx="67" cy="123" rx="11" ry="7" fill="${cheekCol}" opacity="${cheekOp}"/>
      <ellipse cx="133" cy="123" rx="11" ry="7" fill="${cheekCol}" opacity="${cheekOp}"/>
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
function awayToast() {
  const d = tripAway(state.pet); if (!d) return false;
  const t = `Estoy de excursión en ${d.n} ${d.e} · vuelvo a las ${hhmm(state.pet.trip.until)}`;
  if (!$("tab-pet").classList.contains("hidden")) say(t, 3500); else toast(t);
  return true;
}
function awaySign(d, until) {
  const nm = `${d.e} ${d.n}`, fs = d.n.length > 11 ? 16 : 19;
  return `<svg viewBox="0 0 200 200" class="sign"><ellipse cx="100" cy="190" rx="66" ry="6" fill="rgba(0,0,0,.18)"/>
    <rect x="50" y="118" width="11" height="72" rx="3" fill="#8a5a38"/><rect x="139" y="118" width="11" height="72" rx="3" fill="#8a5a38"/>
    <rect x="18" y="50" width="164" height="94" rx="12" fill="#cf9a66" stroke="#8a5a38" stroke-width="4"/>
    <path d="M26 74 H174 M26 98 H174 M26 122 H174" stroke="#b07a4a" stroke-width="2" opacity=".55"/>
    ${[[30, 60], [170, 60], [30, 134], [170, 134]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#6b4a2f"/>`).join("")}
    <text x="100" y="80" text-anchor="middle" font-size="13" font-weight="800" fill="#3a2330">¡Me he ido de excursión!</text>
    <text x="100" y="108" text-anchor="middle" font-size="${fs}" font-weight="900" fill="#3a2330">${esc(nm)}</text>
    <text x="100" y="131" text-anchor="middle" font-size="12.5" font-weight="700" fill="#5a3a2a">Vuelvo a las ${hhmm(until)}</text>
    <g transform="translate(156 186)"><rect x="-17" y="-24" width="34" height="24" rx="4" fill="#a0522d"/><path d="M-7 -24 v-6 h14 v6" stroke="#6b4a2f" stroke-width="3" fill="none"/><rect x="-17" y="-15" width="34" height="3" fill="#6b4a2f"/><circle cx="-8" cy="-7" r="3.5" fill="#ffd93b"/><rect x="4" y="-10" width="8" height="6" rx="1" fill="#9fd3ff"/></g></svg>`;
}
function startTrip() {
  const I = petInfo(), p = I.p;
  if (I.si === 0) return toast("Primero tiene que nacer 🥚");
  if (p.trip) return;
  if (p.sick) return say("Estoy malito, mejor me quedo en casa 🤒");
  if (isNapping(p)) return say("Zzz… luego me voy 😴");
  if (I.nv.energy < 25) return say("Estoy muy cansado para viajar… ¿una siesta primero? 😴");
  const seen = p.postcards || {}, pool = DEST.filter(d => !seen[d.id]), d = rnd(pool.length ? pool : DEST);
  let lvl = 0;
  petTx(q => { if (q.trip) return null; q.trip = { id: d.id, until: Date.now() + TRIP_H * (setOn(q, "playa") ? .5 : 1) * 36e5, by: who }; setNeed(q, "energy", -20); bump(q, "trip"); if (q.firsts && q.firsts.trip && !q.firsts.trip.info) q.firsts.trip.info = d.e + " " + d.n; lvl = gainExp(q, 8); return q; })
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
  { id: "teach", k: "teach", n: 1, e: "🗣️", t: "Enséñale una frase", r: 12 },
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
  h += `<div class="advrow"><i>🗣️</i><div><b>Enséñale a hablar</b><small>Le enseñas una frase y se la suelta a ${o} cuando menos se lo espere 🤫</small></div><button class="btn" id="advTeach" ${I.si ? "" : "disabled"}>Enseñar</button></div>`;
  const tr = treasureReady(p);
  h += `<div class="advrow"><i>✨</i><div><b>Tesoro escondido</b><small>${I.si === 0 ? "Cuando nazca buscará tesoros" : away ? "Cuando vuelva de la excursión" : tr ? "¡Hay uno escondido en la escena! Búscalo y tócalo ✨" : "El próximo aparece a las " + hhmm(((p.tre || {})[who] || 0) + treH(p) * 36e5)}</small></div></div>`;
  const ow = otherWx(), k = wxKind();
  h += `<div class="advrow"><i>${WX ? WX_E[k] : "🌦️"}</i><div><b>Tiempo real</b><small>${WX ? `En tu casa: ${WX.temp}° · ${WX_T[k]}` : "La escena tendrá la lluvia, el frío o el calor que haga donde estás"}${ow ? `<br>En casa de ${o}: ${ow.temp}° ${WX_E[wxKindOf(ow.code)]}` : ""}</small></div><button class="btn ${wxOn() ? "" : "primary"}" id="advWx">${wxOn() ? "Quitar" : "Activar"}</button></div>`;
  el.innerHTML = h;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = e => { e.preventDefault(); f(); }; };
  on("advTrip", startTrip); on("advClaim", claimTrip); on("advPost", openPost); on("advSend", sendPost); on("advWx", toggleWeather); on("advTeach", teachWord);
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
    q.family = [...(q.family || []), { sex: q.sex || null, name: q.name || "Pollito", species: q.species || "pollito", color: q.color || "amarillo", wear: q.wear || {}, stage: 6, xp: q.xp, hatchedAt: q.hatchedAt || null, at: Date.now() }];
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
  const p = state.pet || {}, C = COLM[p.color] || COLM.amarillo;
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
function vlInit() { Object.assign(mg, { y: mg.H * .45, vy: 0, pipes: [], coins: [], parts: [], spawn: .3, dead: false, tt: 0, flap: 0 }); mgSprite("happy"); mgSprite("laugh"); mgSprite("surprised"); vlDraw(0); }
function vlStart() { mg.run = true; mg.last = performance.now(); mg.vy = -330; mg.flap = .2; SFX.whoosh(); mg.raf = requestAnimationFrame(vlLoop); }
function vlLoop(t) {
  if (!mg || !mg.run) return;
  const dt = Math.min(40, t - mg.last) / 1000; mg.last = t; mg.tt += dt;
  const { W, H } = mg, gap = Math.max(160, 225 - mg.score * 3), speed = 150 + Math.min(110, mg.score * 5), bx = W * .3, r = 21;
  mg.vy += 950 * dt; mg.y += mg.vy * dt; mg.flap = Math.max(0, mg.flap - dt);
  if (mg.y - r < 0) { mg.y = r; mg.vy = 0; }
  mg.spawn -= dt;
  if (mg.spawn <= 0) { mg.spawn = 1.6; const top = 50 + Math.random() * Math.max(10, H - 130 - gap); mg.pipes.push({ x: W + 40, top, gap, passed: false, seed: Math.random() * 100 }); if (Math.random() < .55) mg.coins.push({ x: W + 40, y: top + gap / 2, e: Math.random() < .2 ? "⭐" : "🪙" }); }
  for (const pp of mg.pipes) {
    pp.x -= speed * dt;
    if (!pp.passed && pp.x + 30 < bx) { pp.passed = true; mg.score++; $("fgScore").textContent = "🪽 " + mg.score; SFX.ding(); buzz(10); }
    if (bx + r > pp.x - 30 && bx - r < pp.x + 30 && (mg.y - r < pp.top || mg.y + r > pp.top + pp.gap)) mg.dead = true;
  }
  for (const c of mg.coins) { c.x -= speed * dt; if (!c.got && Math.abs(c.x - bx) < 26 && Math.abs(c.y - mg.y) < 26) { c.got = true; mg.score += c.e === "⭐" ? 3 : 1; $("fgScore").textContent = "🪽 " + mg.score; SFX.coin(); mgBurst(mg.parts, c.x, c.y, ["✨", c.e], 6); } }
  mg.pipes = mg.pipes.filter(pp => pp.x > -60); mg.coins = mg.coins.filter(c => !c.got && c.x > -30);
  if (mg.y + r > H - 34) mg.dead = true;
  vlDraw(dt);
  if (mg.dead) { buzz([40, 40, 40]); SFX.fail(); mgBurst(mg.parts, bx, mg.y, ["🪶", "💫", "⭐"], 12); mg.run = false; let k = 0; const fall = () => { if (!mg || k++ > 24) return setTimeout(mgEnd, 150); mg.y = Math.min(H - 40, mg.y + 9); vlDraw(1 / 60); requestAnimationFrame(fall); }; return requestAnimationFrame(fall); }
  mg.raf = requestAnimationFrame(vlLoop);
}
function vlCloud(ctx, x, y0, y1, seed, flipTop) {
  if (y1 - y0 < 2) return;
  ctx.save(); ctx.fillStyle = "#ffffff"; ctx.shadowColor = "rgba(90,140,200,.35)"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.rect(x - 26, y0, 52, y1 - y0); ctx.fill();
  for (let y = y0 + 10; y < y1 - 6; y += 22) { const k = (seed + y) % 5; ctx.beginPath(); ctx.arc(x - 26, y, 9 + k, 0, 7); ctx.arc(x + 26, y + 11, 9 + ((k + 2) % 5), 0, 7); ctx.fill(); }
  const ey = flipTop ? y1 : y0;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - 27 + i * 18, ey, 15 + ((seed + i * 7) % 5), 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = "rgba(170,205,240,.35)"; ctx.fillRect(x + 8, y0, 14, y1 - y0);
}
function vlDraw(dt = 0) {
  const { ctx, W, H } = mg, t = mg.tt || 0, s = mg.score || 0;
  const pal = s < 8 ? ["#7ec8ff", "#d8f1ff", "#7cc95b"] : s < 16 ? ["#ff9a8b", "#ffd6a5", "#6cae4f"] : ["#1b2350", "#4a3f7a", "#2e5638"];
  mgSky(ctx, W, H, pal[0], pal[1], t, pal[2]);
  if (s >= 16) { ctx.fillStyle = "#fff"; for (let i = 0; i < 20; i++) { ctx.globalAlpha = .4 + .4 * Math.sin(t * 2 + i); ctx.fillRect((i * 97) % W, (i * 53) % (H * .5), 2, 2); } ctx.globalAlpha = 1; }
  for (const pp of mg.pipes) { vlCloud(ctx, pp.x, -20, pp.top, pp.seed, true); vlCloud(ctx, pp.x, pp.top + pp.gap, H - 34, pp.seed + 3, false); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "24px system-ui, Apple Color Emoji"; ctx.fillStyle = "#000";
  for (const c of mg.coins) { ctx.save(); ctx.translate(c.x, c.y + Math.sin(t * 5 + c.x / 30) * 4); ctx.scale(Math.abs(Math.cos(t * 3)) * .4 + .6, 1); ctx.fillText(c.e, 0, 0); ctx.restore(); }
  ctx.fillStyle = "#5fae46"; ctx.fillRect(0, H - 34, W, 34); ctx.fillStyle = "#4e9a39"; for (let x = -((t * (150 + Math.min(110, s * 5))) % 24); x < W; x += 24) ctx.fillRect(x, H - 34, 12, 6);
  const rot = Math.max(-.5, Math.min(.9, mg.vy / 600)), sq = 1 + mg.flap * .9;
  mgPet(ctx, W * .3, mg.y + 10, 88, mg.dead ? "surprised" : mg.vy < 0 ? "laugh" : "happy", rot, sq);
  mgParts(ctx, mg.parts, dt);
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
  const { ctx, W, H } = mg, t = performance.now() / 1000;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#ffe0ec"); g.addColorStop(1, "#e6dcff"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.5)"; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc((i * 83 + 30) % W, 40 + (i * 61) % 160, 3 + i % 3, 0, 7); ctx.fill(); }
  const R = smRects(), top = R[0].y, ps = Math.max(80, Math.min(150, top * .85));
  ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.beginPath(); ctx.ellipse(W / 2, top / 2 + ps * .36, ps * .32, 7, 0, 0, 7); ctx.fill();
  mgPet(ctx, W / 2, top / 2 + 8, ps, mg.lit >= 0 ? "laugh" : mg.turn === "end" ? "sad" : "happy", mg.lit >= 0 ? Math.sin(t * 10) * .06 : 0, mg.lit >= 0 ? 1.04 : 1);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (mg.lit >= 0) { ctx.font = "26px system-ui, Apple Color Emoji"; ctx.fillText("🎵", W / 2 + ps * .45, top / 2 - ps * .3); ctx.fillText("🎶", W / 2 - ps * .45, top / 2 - ps * .2); }
  R.forEach((r, i) => {
    const P = SM_PADS[i], lit = mg.lit === i;
    ctx.save();
    if (lit) { ctx.shadowColor = P.c; ctx.shadowBlur = 30; }
    const gg = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.s); gg.addColorStop(0, lit ? "#fff" : P.c); gg.addColorStop(.25, P.c); gg.addColorStop(1, P.c);
    ctx.globalAlpha = lit ? 1 : .55; ctx.fillStyle = gg;
    const k = lit ? 1.05 : 1, cx = r.x + r.s / 2, cy = r.y + r.s / 2, ss = r.s * k;
    rr(ctx, cx - ss / 2, cy - ss / 2, ss, ss, 24);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,.35)"; rr(ctx, r.x + 10, r.y + 8, r.s - 20, r.s * .22, 12);
    ctx.font = `${Math.round(r.s * (lit ? .4 : .34))}px system-ui, Apple Color Emoji`; ctx.fillText(P.e, cx, cy + 4);
  });
  ctx.font = "800 18px system-ui"; ctx.fillStyle = "#3a2330";
  ctx.fillText(mg.turn === "show" ? `Escucha… 👂 (nivel ${mg.seq.length})` : mg.turn === "you" ? `¡Tu turno! 🎤 ${mg.idx}/${mg.seq.length}` : mg.turn === "wait" ? "¡Perfecto! ✨" : "", W / 2, top - 16);
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
  if (mg.idx >= mg.seq.length) { mg.score = mg.seq.length; $("fgScore").textContent = "🎵 " + mg.score; mg.turn = "wait"; SFX.ding(); smDraw(); mg.tm = setTimeout(() => mg && mg.run && smNext(), 700); }
}
$("fgCanvas").addEventListener("pointerdown", e => {
  if (!mg || !mg.run) return; const r = $("fgCanvas").getBoundingClientRect();
  if (mg.game === "vuelo") { mg.vy = -330; mg.flap = .2; SFX.whoosh(); if (Math.random() < .5) mgBurst(mg.parts || (mg.parts = []), mg.W * .3 - 16, mg.y + 10, ["🪶"], 1); } else smTap(e.clientX - r.left, e.clientY - r.top);
});
function mgEnd() {
  if (!mg) return; mgStop();
  const g = mg.game, score = mg.score, info = MG[g]; let gain = 0, prevO = 0, prevM = 0;
  petTx(p => {
    p.day.mg = p.day.mg || {}; const k = g + "_" + who, got = p.day.mg[k] || 0;
    const gm = setOn(p, "vaquero") || setOn(p, "musico") ? 1.5 : 1; gain = Math.max(0, Math.min(Math.round(score * 2 * gm), Math.round(info.max * gm) - got)); p.day.mg[k] = got + gain; p.coins += gain;
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
  const f2 = fx2(id, layer); if (f2 != null) return f2;
  if (layer === "back") {
    if (id === "fx_aura") return `<defs><radialGradient id="auraG"><stop offset=".5" stop-color="#ffe066" stop-opacity=".8"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient></defs><circle class="fxpulse" cx="100" cy="118" r="88" fill="url(#auraG)"/>`;
    if (id === "fx_arcoiris") return `<g class="fxpulse" fill="none" stroke-width="7" opacity=".9">${["#ff6b8b", "#ffb361", "#ffd93b", "#6fdc9a", "#7fb7ff", "#b48be0"].map((c, i) => `<path d="M${10 + i * 7} 156 A${90 - i * 7} ${90 - i * 7} 0 0 1 ${190 - i * 7} 156" stroke="${c}"/>`).join("")}</g>`;
    return "";
  }
  const P = [[34, 72], [168, 62], [24, 132], [178, 126], [58, 38], [146, 30], [100, 20]];
  if (id === "fx_estrellas") return P.map(([x, y], i) => `<path class="fxtw" style="animation-delay:${(i * .3).toFixed(2)}s" d="${starP(x, y, i % 2 ? 6 : 8)}" fill="${i % 2 ? "#ffd23f" : "#fff3a0"}"/>`).join("");
  if (id === "fx_luces") return P.map(([x, y], i) => `<g class="fxtw" style="animation-delay:${(i * .45).toFixed(2)}s"><circle cx="${x}" cy="${y + 20}" r="8" fill="#fff59d" opacity=".25"/><circle cx="${x}" cy="${y + 20}" r="3" fill="#fffde0"/></g>`).join("");
  if (id === "fx_petalos") return [30, 170, 48, 152, 20, 180].map((x, i) => `<g class="fxup" style="animation-delay:${(i * .5).toFixed(1)}s;animation-direction:reverse"><ellipse cx="${x}" cy="${60 + (i % 3) * 30}" rx="5" ry="3" fill="${i % 2 ? "#ffb3d1" : "#ffd6e7"}" transform="rotate(${i * 40} ${x} ${60 + (i % 3) * 30})"/></g>`).join("");
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
  if (it.cat === "marca") return markIcon(it);
  if (it.grad) return `<i class="sw" style="background:linear-gradient(135deg,${it.grad.join(",")})"></i>`;
  if (it.cat === "color") return `<i class="sw" style="background:${it.pat === "rainbow" ? "linear-gradient(135deg,#ff6b8b,#ffd93b,#6fdc9a,#7fb7ff)" : it.pat === "ice" ? "linear-gradient(135deg,#fff,#c9f0ff 50%,#8fd3ff)" : `linear-gradient(135deg,${it.body} 55%,${it.dark} 55%)`}"></i>`;
  if (it.sw) return `<i class="sw sq" style="background:${it.sw}"></i>`;
  if (it.cat === "lugar") return `<i class="lsvg">${landscape(it.id, "day", "", -1)}</i>`;
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
  { id: "espacial", e: "🚀", n: "Astronauta", items: ["astronauta", "jetpack"], d: "+50% de experiencia" },
  { id: "amor", e: "💞", n: "Enamorado", items: ["diadcor", "colgante", "cartamor"], d: "+25% de experiencia y los mimos valen más" },
  { id: "invierno", e: "❄️", n: "Invierno", items: ["gfresa", "abrigo", "botasnieve"], d: "Se cansa la mitad de rápido" },
  { id: "hawaiano", e: "🌺", n: "Hawaiano", items: ["hawaiana", "lei", "aletas"], d: "Se aburre la mitad de rápido" },
  { id: "musico", e: "🎸", n: "Estrella del rock", items: ["pixel", "guitarm", "cascos"], d: "Minijuegos: +50% de monedas" }
];
const SETM = Object.fromEntries(SETS.map(s => [s.id, s]));
const setOn = (p, id) => !!p && SETM[id].items.every(i => CAT[i] && ((p.wear || {})[CAT[i].slot] === i));
const activeSets = p => SETS.filter(s => setOn(p, s.id));
const expMul = p => 1 + (setOn(p, "mago") ? .25 : 0) + (setOn(p, "espacial") ? .5 : 0) + (setOn(p, "amor") ? .25 : 0);
const needMul = (p, k) => ((k === "fun" && (setOn(p, "fiesta") || setOn(p, "hawaiano"))) || (k === "energy" && (setOn(p, "deporte") || setOn(p, "invierno"))) ? .5 : 1);
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
    const w = $("chWear"); if (w) w.onclick = () => { close(); const q = state.pet || {}; if (!isOn(q, got)) shopTap(ownKey(got)); };
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
  petHome();
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
  petTx(q => { settle(q); const w = {}; for (const [s, id] of Object.entries(wear || {})) if (id && CAT[id] && isOwned(q, CAT[id])) w[s] = id; q.wear = w; if (color && COLM[color] && isOwned(q, COLM[color])) q.color = color; bump(q, "dress"); return q; })
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
  cama: { t: "floor", w: 170, h: 92, p: { x: 20, y: 92 }, d: (o = {}) => `<rect x="0" y="4" width="22" height="84" rx="9" fill="#a86f45"/><rect x="4" y="12" width="14" height="30" rx="5" fill="#c08457"/><rect x="8" y="56" width="158" height="24" rx="6" fill="#c08457"/><rect x="14" y="40" width="150" height="20" rx="9" fill="#fffaf2"/><rect x="22" y="29" width="38" height="18" rx="9" fill="#eef0ff"/>${o.sleep ? o.sleep : `<path d="M66 36 H158 Q166 36 166 44 V66 H66 Z" fill="#ff8fab"/><rect x="66" y="36" width="14" height="30" fill="#ff6f93"/><path d="M92 47 h58 M92 56 h58" stroke="#ffb3c6" stroke-width="3" stroke-linecap="round"/>`}<rect x="158" y="44" width="12" height="44" rx="5" fill="#a86f45"/><rect x="10" y="80" width="7" height="12" rx="2" fill="#8a5a38"/><rect x="150" y="80" width="7" height="12" rx="2" fill="#8a5a38"/>` },
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
  cactus: { t: "shelf", w: 40, h: 50, p: { x: 30, y: 50 }, d: () => `<rect x="8" y="34" width="24" height="16" rx="3" fill="#e07a2e"/><rect x="6" y="32" width="28" height="5" rx="2" fill="#c9661f"/><rect x="15" y="6" width="10" height="28" rx="5" fill="#52b95f"/><path d="M15 20 H9 V12" stroke="#52b95f" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M25 16 H31 V9" stroke="#52b95f" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="20" cy="5" r="3" fill="#ff8fb8"/>` },
  tocadiscos: { t: "floor", w: 90, h: 86, p: { x: 60, y: 82 }, d: () => `<rect x="6" y="36" width="78" height="48" rx="5" fill="#8a5a38"/><rect x="12" y="44" width="30" height="32" rx="3" fill="#6e4429"/><rect x="48" y="44" width="30" height="32" rx="3" fill="#6e4429"/><rect x="2" y="28" width="86" height="10" rx="3" fill="#a86f45"/><ellipse cx="42" cy="26" rx="30" ry="7" fill="#1d1d24"/><ellipse cx="42" cy="26" rx="8" ry="2" fill="#e63946"/><path d="M76 20 L60 26" stroke="#c0c8d2" stroke-width="3" stroke-linecap="round"/><text class="fxup" x="70" y="12" font-size="12" fill="#ffd23f">♪</text>` },
  guirnalda: { t: "wall", w: 150, h: 36, p: { x: 50, y: 12 }, d: o => `<path d="M2 6 Q40 30 75 10 Q110 30 148 6" stroke="#4a4a55" stroke-width="2" fill="none"/>${[[14, 13, "#ffd23f"], [34, 20, "#ff5c8a"], [56, 20, "#7fb7ff"], [75, 12, "#6fdc9a"], [94, 20, "#ffd23f"], [116, 20, "#ff5c8a"], [136, 13, "#b48be0"]].map(([x, y, c]) => `${o.mode === "night" ? `<circle cx="${x}" cy="${y + 6}" r="9" fill="${c}" opacity=".35"/>` : ""}<ellipse cx="${x}" cy="${y + 6}" rx="4" ry="5.5" fill="${c}"/><rect x="${x - 2}" y="${y - 1}" width="4" height="3" fill="#4a4a55"/>`).join("")}` },
  puff: { t: "floor", w: 70, h: 52, p: { x: 36, y: 90 }, d: () => `<path d="M6 44 Q2 14 35 8 Q68 14 64 44 Q35 54 6 44Z" fill="#ff9f1c"/><path d="M35 8 Q30 28 35 50 M16 16 Q20 30 16 46 M54 16 Q50 30 54 46" stroke="#e07a00" stroke-width="2" fill="none"/><ellipse cx="26" cy="18" rx="8" ry="4" fill="#fff" opacity=".3"/>` },
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
// dibujos de la ropa nueva (v48)
function items2(id) {
  switch (id) {
    // ---- cabeza ----
    case "boinamar": return `<g transform="translate(100 70)"><ellipse cx="0" cy="-2" rx="34" ry="9" fill="#1f3b73"/><path d="M-30 -4 Q-28 -30 0 -32 Q28 -30 30 -4 Z" fill="#fff"/><rect x="-31" y="-9" width="62" height="7" rx="3" fill="#1f3b73"/><circle cy="-33" r="5" fill="#e63946"/><path d="M-6 -20 l6 -6 l6 6" stroke="#1f3b73" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`;
    case "cascovik": return `<g transform="translate(100 70)"><path d="M-36 0 Q-36 -36 0 -38 Q36 -36 36 0 Z" fill="#9aa4b2"/><path d="M-36 0 Q0 6 36 0 L36 6 Q0 12 -36 6Z" fill="#7d8796"/><circle cx="-18" cy="-14" r="2.5" fill="#cfd6df"/><circle cx="18" cy="-14" r="2.5" fill="#cfd6df"/><path d="M-30 -14 Q-56 -26 -50 -54 Q-44 -34 -24 -26Z" fill="#fff6e0" stroke="#e8d9bf" stroke-width="2"/><path d="M30 -14 Q56 -26 50 -54 Q44 -34 24 -26Z" fill="#fff6e0" stroke="#e8d9bf" stroke-width="2"/></g>`;
    case "gorroaviador": return `<g transform="translate(100 72)"><path d="M-38 6 Q-40 -36 0 -38 Q40 -36 38 6 Q38 20 30 24 L28 2 Q0 -6 -28 2 L-30 24 Q-38 20 -38 6Z" fill="#8a5a38"/><path d="M-30 22 Q-34 30 -28 34 M30 22 Q34 30 28 34" stroke="#6e4429" stroke-width="5" stroke-linecap="round"/><g transform="translate(0 -16)"><rect x="-26" y="-8" width="52" height="7" rx="3" fill="#3a3a48"/><circle cx="-12" cy="-4" r="9" fill="#9fdcff" stroke="#c9a227" stroke-width="3"/><circle cx="12" cy="-4" r="9" fill="#9fdcff" stroke="#c9a227" stroke-width="3"/><path d="M-15 -8 l4 4 M9 -8 l4 4" stroke="#fff" stroke-width="2" opacity=".8"/></g></g>`;
    case "orejasoso": return `<g><path d="M60 82 Q100 58 140 82" stroke="#8a5a38" stroke-width="5" fill="none"/><circle cx="68" cy="68" r="14" fill="#a86f45"/><circle cx="68" cy="68" r="7" fill="#e0b08a"/><circle cx="132" cy="68" r="14" fill="#a86f45"/><circle cx="132" cy="68" r="7" fill="#e0b08a"/></g>`;
    case "coronaflores": return `<g>${[[66, 76, "#ff8fb8"], [80, 68, "#ffd23f"], [100, 64, "#ffffff"], [120, 68, "#b48be0"], [134, 76, "#ff8fb8"]].map(([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(5.5 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(5.5 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="4.4" fill="${c}"/>`).join("")}<circle r="3" fill="#ff9f1c"/></g>`).join("")}<path d="M60 84 Q72 70 88 68 M112 68 Q128 70 140 84" stroke="#3fa34d" stroke-width="2.5" fill="none"/><ellipse cx="90" cy="72" rx="5" ry="2.5" fill="#3fa34d" transform="rotate(-20 90 72)"/><ellipse cx="110" cy="72" rx="5" ry="2.5" fill="#3fa34d" transform="rotate(20 110 72)"/></g>`;
    case "pamela": return `<g transform="translate(100 72)"><ellipse rx="62" ry="13" fill="#f6dfa8"/><ellipse rx="62" ry="13" fill="none" stroke="#e2c27a" stroke-width="2" stroke-dasharray="3 5"/><path d="M-26 -2 Q-26 -30 0 -30 Q26 -30 26 -2 Z" fill="#fbe9bd"/><rect x="-27" y="-10" width="54" height="7" fill="#7fc8f8"/><path d="M24 -8 q14 6 18 20" stroke="#7fc8f8" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="-16" cy="-8" r="5" fill="#ff8fb8"/></g>`;
    case "gorrodormir": return `<g transform="translate(100 70)"><path d="M-34 2 Q-30 -30 4 -34 Q30 -36 44 -12 Q50 4 58 8" stroke="#7b7fd6" stroke-width="0" fill="none"/><path d="M-34 4 Q-34 -32 6 -36 Q36 -36 50 -8 L56 10 Q42 -6 30 -10 Q32 0 34 4Z" fill="#7b7fd6"/><circle cx="58" cy="12" r="8" fill="#fff"/><rect x="-36" y="-2" width="72" height="10" rx="5" fill="#fff"/>${[[-14, -20], [10, -24], [24, -14]].map(([x, y]) => `<path d="${starP(x, y, 4)}" fill="#ffd23f"/>`).join("")}</g>`;
    case "cuernouni": return `<g transform="translate(100 66)"><path d="M-8 2 L0 -40 L8 2Z" fill="#ffe7a3"/><path d="M-6 -6 L6 -10 M-4 -18 L4 -22 M-2 -30 L2 -32" stroke="#e8b84a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="-20" cy="2" rx="8" ry="5" fill="#ffb3d1"/><ellipse cx="20" cy="2" rx="8" ry="5" fill="#b9a6f0"/><path class="fxtw" d="${spark(14, -36, 5)}" fill="#fff"/></g>`;
    case "halo": return `<g class="fxpulse"><ellipse cx="100" cy="50" rx="30" ry="8" fill="none" stroke="#ffe066" stroke-width="6"/><ellipse cx="100" cy="50" rx="30" ry="8" fill="none" stroke="#fff6c2" stroke-width="2"/></g>`;
    case "lazogigante": return `<g transform="translate(100 66)"><path d="M0 0 L-34 -22 Q-42 0 -34 18 Z" fill="#ff4d7e"/><path d="M0 0 L34 -22 Q42 0 34 18 Z" fill="#ff4d7e"/><path d="M-30 -14 Q-24 0 -30 10 M30 -14 Q24 0 30 10" stroke="#ff8fb0" stroke-width="3" fill="none"/><circle r="9" fill="#e63973"/><path d="M-6 6 L-14 30 M6 6 L14 30" stroke="#ff4d7e" stroke-width="6" stroke-linecap="round"/></g>`;
    case "orejeras": return `<g><path d="M58 104 Q60 52 100 50 Q140 52 142 104" stroke="#ff8fb8" stroke-width="6" fill="none"/><circle cx="56" cy="106" r="16" fill="#fff"/><circle cx="56" cy="106" r="16" fill="none" stroke="#f2dfe6" stroke-width="2"/><circle cx="144" cy="106" r="16" fill="#fff"/><circle cx="144" cy="106" r="16" fill="none" stroke="#f2dfe6" stroke-width="2"/><circle cx="52" cy="101" r="4" fill="#ffe0ec"/><circle cx="140" cy="101" r="4" fill="#ffe0ec"/></g>`;
    case "cintadep": return `<g><path d="M52 92 Q100 72 148 92 L148 102 Q100 82 52 102Z" fill="#ff4d5a"/><path d="M54 97 Q100 78 146 97" stroke="#fff" stroke-width="2.5" fill="none"/></g>`;
    case "rizos": return `<g fill="#8a4b2a">${[[64, 82, 12], [74, 70, 13], [88, 62, 13], [104, 59, 13], [120, 63, 13], [133, 72, 12], [140, 86, 11], [58, 96, 10], [144, 100, 10]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}<g fill="#a85f38">${[[74, 70], [104, 59], [133, 72]].map(([x, y]) => `<circle cx="${x - 3}" cy="${y - 3}" r="4"/>`).join("")}</g></g>`;
    case "tiaraluna": return `<g transform="translate(100 70)"><path d="M-30 4 Q0 -8 30 4" stroke="#c9d1e8" stroke-width="4" fill="none"/><path d="M-6 -30 A16 16 0 1 0 12 -6 A12 12 0 1 1 -6 -30Z" fill="#fff3b0" stroke="#e0c25a" stroke-width="1.5"/><circle cx="-18" cy="-4" r="3" fill="#b9a6f0"/><circle cx="18" cy="-2" r="3" fill="#b9a6f0"/><path class="fxtw" d="${spark(14, -30, 5)}" fill="#fff"/><path class="fxtw" style="animation-delay:.6s" d="${spark(-22, -20, 4)}" fill="#fff"/></g>`;
    // ---- cara ----
    case "gafasrosa": return `<g><path d="${starP(80, 106, 15)}" fill="#ff5c8a" opacity=".92"/><path d="${starP(120, 106, 15)}" fill="#ff5c8a" opacity=".92"/><path d="M93 104 L107 104" stroke="#e63973" stroke-width="3"/><path d="${starP(80, 106, 8)}" fill="#ffd6e7" opacity=".5"/><path d="${starP(120, 106, 8)}" fill="#ffd6e7" opacity=".5"/></g>`;
    case "gafasgato": return `<g><path d="M64 100 Q70 94 92 100 Q94 112 82 114 Q68 114 64 100Z" fill="#2b1a10" opacity=".85"/><path d="M136 100 Q130 94 108 100 Q106 112 118 114 Q132 114 136 100Z" fill="#2b1a10" opacity=".85"/><path d="M92 102 L108 102" stroke="#2b1a10" stroke-width="3"/><path d="M64 100 L58 94 M136 100 L142 94" stroke="#ff8fb8" stroke-width="3" stroke-linecap="round"/><path d="M70 102 l6 -2 M114 100 l6 2" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/></g>`;
    case "gafascorazon": { const H = (x, y) => `M${x} ${y + 9} C${x - 16} ${y - 2} ${x - 12} ${y - 14} ${x} ${y - 6} C${x + 12} ${y - 14} ${x + 16} ${y - 2} ${x} ${y + 9}Z`; return `<g><path d="${H(80, 105)}" fill="#ff3d7f" opacity=".9"/><path d="${H(120, 105)}" fill="#ff3d7f" opacity=".9"/><path d="M92 101 L108 101" stroke="#d6265f" stroke-width="3"/><path d="M73 99 l4 -2 M113 99 l4 -2" stroke="#fff" stroke-width="2" opacity=".7" stroke-linecap="round"/></g>`; }
    case "antifazfiesta": return `<g><path d="M60 100 Q80 90 100 100 Q120 90 140 100 Q142 116 124 116 Q110 116 100 108 Q90 116 76 116 Q58 116 60 100Z" fill="#7b2ff7"/><ellipse cx="80" cy="106" rx="9" ry="6" fill="#2b1a10"/><ellipse cx="120" cy="106" rx="9" ry="6" fill="#2b1a10"/>${[[66, 98], [134, 98], [100, 98]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#ffd23f"/>`).join("")}<path d="M140 98 Q154 84 150 70" stroke="#ff8fb8" stroke-width="3" fill="none"/><ellipse cx="150" cy="68" rx="4" ry="8" fill="#ff8fb8" transform="rotate(20 150 68)"/></g>`;
    case "gafasbuceo": return `<g><path d="M56 102 Q58 96 66 96 L134 96 Q142 96 144 102" stroke="#2b2d42" stroke-width="4" fill="none"/><rect x="66" y="92" width="68" height="28" rx="12" fill="#ffd23f"/><rect x="71" y="96" width="58" height="20" rx="9" fill="#9fdcff" opacity=".85"/><path d="M76 100 l10 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/><path d="M138 112 Q150 116 150 96 Q150 80 156 76" stroke="#ff9f1c" stroke-width="6" fill="none" stroke-linecap="round"/></g>`;
    case "gafasredondas": return `<g fill="none" stroke="#2b1a10" stroke-width="3"><circle cx="80" cy="106" r="11"/><circle cx="120" cy="106" r="11"/><path d="M91 104 Q100 99 109 104"/><path d="M69 104 L60 101 M131 104 L140 101"/></g>`;
    case "pestanas": return `<g stroke="#2b1a10" stroke-width="2.4" stroke-linecap="round"><path d="M70 100 l-5 -6 M75 97 l-2 -7 M81 96 l1 -7"/><path d="M130 100 l5 -6 M125 97 l2 -7 M119 96 l-1 -7"/></g>`;
    // ---- cuello ----
    case "trebol": return `<g><path d="M66 140 Q100 162 134 140" stroke="#c9a227" stroke-width="2.5" fill="none"/><g transform="translate(100 162)"><circle cx="-5" cy="-4" r="5.5" fill="#3fa34d"/><circle cx="5" cy="-4" r="5.5" fill="#3fa34d"/><circle cx="-5" cy="5" r="5.5" fill="#3fa34d"/><circle cx="5" cy="5" r="5.5" fill="#3fa34d"/><path d="M0 8 q2 6 6 8" stroke="#2d8a3e" stroke-width="2" fill="none"/></g></g>`;
    case "boa": { let s = ""; for (let k = 0; k <= 12; k++) { const t = k / 12, x = 56 + 88 * t, y = 142 + 14 * Math.sin(Math.PI * t); s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="7" fill="${k % 2 ? "#ff8fd0" : "#ffb3e6"}"/>`; } return `<g>${s}<ellipse cx="140" cy="164" rx="8" ry="16" fill="#ff8fd0" transform="rotate(-15 140 164)"/></g>`; }
    case "pajaritaest": return `<g transform="translate(100 146)"><path d="M0 0 L-17 -10 L-17 10 Z M0 0 L17 -10 L17 10 Z" fill="#2b2d6e"/><circle r="4.5" fill="#1d1f52"/>${[[-11, -3], [-8, 5], [11, -3], [8, 5]].map(([x, y]) => `<path d="${starP(x, y, 2.6)}" fill="#ffd23f"/>`).join("")}</g>`;
    case "cadenacor": { let s = ""; for (let k = 0; k <= 9; k++) { const t = k / 9, x = 62 + 76 * t, y = 142 + 16 * Math.sin(Math.PI * t); s += `<path d="M${x.toFixed(1)} ${(y + 3).toFixed(1)} c-4 -3 -5 -7 -2 -8 c1.4 -.5 2 .3 2 1 c0 -.7 .6 -1.5 2 -1 c3 1 2 5 -2 8z" fill="${k % 2 ? "#ff5c8a" : "#ffd23f"}"/>`; } return `<g>${s}</g>`; }
    case "corbatarayas": return `<g><path d="M92 140 L108 140 L104 148 L96 148Z" fill="#1f3b73"/><path d="M96 148 L104 148 L110 176 L100 186 L90 176Z" fill="#1f3b73"/><path d="M96 154 L106 150 M93 164 L108 158 M92 174 L109 168" stroke="#ffd23f" stroke-width="3"/></g>`;
    case "babero": return `<g><path d="M70 140 Q100 152 130 140 Q134 170 100 174 Q66 170 70 140Z" fill="#fff"/><path d="M70 140 Q100 152 130 140 Q134 170 100 174 Q66 170 70 140Z" fill="none" stroke="#9fdcff" stroke-width="3" stroke-dasharray="4 3"/><path d="M100 164 c-6 -7 -14 -1 0 8 c14 -9 6 -15 0 -8z" fill="#ffb3cf"/></g>`;
    case "gargantilla": return `<g><path d="M64 142 Q100 160 136 142" stroke="#dfe7f2" stroke-width="5" fill="none"/>${[[76, 151], [88, 155], [100, 157], [112, 155], [124, 151]].map(([x, y], i) => `<path d="M${x} ${y - 5} L${x + 4} ${y} L${x} ${y + 6} L${x - 4} ${y}Z" fill="${i === 2 ? "#4dd2ff" : "#fff"}" stroke="#a8c4e0" stroke-width=".8"/>`).join("")}<path class="fxtw" d="${spark(108, 150, 4)}" fill="#fff"/></g>`;
    // ---- cuerpo ----
    case "pijamanube": return `<g><path d="M40 128 Q100 116 160 128 V178 H40Z" fill="#b9d8ff"/>${[[66, 146], [110, 140], [136, 160], [84, 166]].map(([x, y]) => `<path d="M${x - 9} ${y} a5 5 0 0 1 5 -6 a7 7 0 0 1 12 0 a5 5 0 0 1 2 9 h-16 a4 4 0 0 1 -3 -3z" fill="#fff"/>`).join("")}${[[94, 156], [124, 132], [58, 132]].map(([x, y]) => `<path d="${starP(x, y, 3)}" fill="#ffd23f"/>`).join("")}</g>`;
    case "chaquetavaq": return `<g><path d="M40 126 Q70 120 86 124 L94 176 H40Z" fill="#4a78c2"/><path d="M160 126 Q130 120 114 124 L106 176 H160Z" fill="#4a78c2"/><path d="M86 124 L96 150 M114 124 L104 150" stroke="#2f569a" stroke-width="3"/><rect x="56" y="146" width="16" height="12" rx="2" fill="#3a63a8"/><rect x="128" y="146" width="16" height="12" rx="2" fill="#3a63a8"/><path d="M58 150 h12 M130 150 h12" stroke="#ffd23f" stroke-width="1.4" stroke-dasharray="2 2"/><circle cx="90" cy="160" r="2.2" fill="#c9a227"/><circle cx="110" cy="160" r="2.2" fill="#c9a227"/></g>`;
    case "vestidoflores": return `<g><path d="M50 128 Q100 118 150 128 L166 180 H34Z" fill="#ffd6e7"/>${[[66, 150], [96, 140], [124, 152], [80, 168], [140, 170], [110, 172]].map(([x, y], i) => `<g transform="translate(${x} ${y})">${[0, 90, 180, 270].map(a => `<circle cx="${(3 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(3 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="2.6" fill="${i % 2 ? "#ff5c8a" : "#b48be0"}"/>`).join("")}<circle r="1.6" fill="#ffd23f"/></g>`).join("")}<path d="M50 132 Q100 124 150 132" stroke="#ff8fb8" stroke-width="3" fill="none"/></g>`;
    case "rebeca": return `<g><path d="M40 128 Q100 116 160 128 V178 H40Z" fill="#f2c14e"/><path d="M100 126 V178" stroke="#d9a62e" stroke-width="3"/>${[138, 152, 166].map(y => `<circle cx="106" cy="${y}" r="3" fill="#8a5a38"/>`).join("")}<path d="M44 140 h112 M44 170 h112" stroke="#e8b43c" stroke-width="2" stroke-dasharray="3 4"/></g>`;
    case "trajebanio": return `<g><path d="M44 134 Q100 128 156 134 V178 H44Z" fill="#ff5c8a"/>${[[60, 146], [82, 158], [104, 144], [126, 160], [146, 146], [70, 170], [116, 172]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="#fff"/>`).join("")}<path d="M44 134 Q100 128 156 134" stroke="#e63973" stroke-width="3" fill="none"/></g>`;
    case "bata": return `<g><path d="M40 126 Q70 120 86 124 L96 178 H40Z" fill="#fbfbff"/><path d="M160 126 Q130 120 114 124 L104 178 H160Z" fill="#fbfbff"/><path d="M86 124 L98 152 M114 124 L102 152" stroke="#d8dde8" stroke-width="3"/><rect x="128" y="142" width="14" height="10" rx="2" fill="#e8ecf4"/><path d="M131 140 v6 M136 138 v8" stroke="#4d9dff" stroke-width="2" stroke-linecap="round"/><path d="M135 138 v-2" stroke="#e63946" stroke-width="2"/></g>`;
    case "marinera": return `<g><path d="M40 128 Q100 118 160 128 V178 H40Z" fill="#fff"/>${[140, 152, 164, 176].map(y => `<path d="M40 ${y} H160" stroke="#1f3b73" stroke-width="5"/>`).join("")}<path d="M80 126 L100 144 L120 126" fill="#1f3b73"/><path d="M96 140 l4 6 l4 -6" fill="#e63946"/></g>`;
    case "superheroe": return `<g><path d="M40 128 Q100 116 160 128 V178 H40Z" fill="#3a63d8"/><path d="M40 162 H160 V170 H40Z" fill="#ffd23f"/><path d="M100 132 L112 146 L100 160 L88 146Z" fill="#ffd23f"/><path d="${starP(100, 146, 6)}" fill="#e63946"/></g>`;
    case "jerseynavidad": return `<g><path d="M40 128 Q100 116 160 128 V178 H40Z" fill="#c8102e"/><path d="M40 140 H160" stroke="#fff" stroke-width="4" stroke-dasharray="4 4"/><path d="M40 170 H160" stroke="#fff" stroke-width="4" stroke-dasharray="4 4"/><path d="M100 146 L108 160 H92Z" fill="#2d8a3e"/><path d="${starP(100, 145, 3.5)}" fill="#ffd23f"/>${[[66, 156], [134, 156]].map(([x, y]) => `<path d="${spark(x, y, 5)}" fill="#fff"/>`).join("")}</g>`;
    case "kimono": return `<g><path d="M40 128 Q100 116 160 128 V178 H40Z" fill="#7b2ff7"/><path d="M84 124 L104 160 M116 124 L96 160" stroke="#ffd6e7" stroke-width="7"/><rect x="40" y="152" width="120" height="12" fill="#ffd23f"/>${[[60, 140], [140, 140], [66, 172], [134, 172]].map(([x, y]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(3.4 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(3.4 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="2.6" fill="#ffb3d1"/>`).join("")}</g>`).join("")}</g>`;
    case "futbol": return `<g><path d="M40 128 Q100 116 160 128 V178 H40Z" fill="#fff"/><path d="M40 128 Q60 124 70 124 V178 H40Z M160 128 Q140 124 130 124 V178 H160Z" fill="#e63946"/><text x="100" y="166" text-anchor="middle" font-size="26" font-weight="900" fill="#1f3b73" font-family="system-ui">10</text></g>`;
    // ---- pies ----
    case "deportivas": return pair2(x => shoe(x, "#fff", "#4d9dff", `<path d="M${x - 6} 172 l10 -3 M${x - 4} 176 l10 -3" stroke="#4d9dff" stroke-width="1.8" stroke-linecap="round"/>`));
    case "botasvaquero": return pair2(x => `<path d="M${x - 9} 150 H${x + 7} V170 Q${x + 16} 172 ${x + 15} 181 H${x - 11} V160Z" fill="#a86f45"/><rect x="${x - 11}" y="180" width="27" height="4" rx="1.5" fill="#6e4429"/><path d="M${x - 6} 158 q5 4 10 0" stroke="#e0b08a" stroke-width="1.6" fill="none"/><path d="${starP(x - 1, 166, 3)}" fill="#ffd23f"/>`);
    case "pantuflas": return pair2(x => shoe(x, "#a86f45", "#8a5a38", `<circle cx="${x - 2}" cy="168" r="3" fill="#a86f45"/><circle cx="${x + 7}" cy="168" r="3" fill="#a86f45"/><circle cx="${x + 5}" cy="175" r="1.4" fill="#2b1a10"/><circle cx="${x + 10}" cy="177" r="1.6" fill="#2b1a10"/>`));
    case "zapatillasluz": return pair2(x => shoe(x, "#fff", "#ff5c8a", `<g class="fxtw"><circle cx="${x - 6}" cy="182" r="1.6" fill="#ff5c8a"/><circle cx="${x}" cy="182" r="1.6" fill="#4dd2ff"/><circle cx="${x + 6}" cy="182" r="1.6" fill="#ffd23f"/></g>`));
    case "zuecos": return pair2(x => `<path d="M${x - 12} 177 Q${x - 12} 166 ${x} 166 Q${x + 13} 166 ${x + 14} 178 V184 H${x - 12}Z" fill="#f2c14e"/><path d="M${x - 8} 172 q8 -4 16 0" stroke="#d9a62e" stroke-width="2" fill="none"/><circle cx="${x + 2}" cy="176" r="2.4" fill="#ff5c8a"/>`);
    case "charol": return pair2(x => shoe(x, "#1b1b24", "#000", `<path d="M${x - 6} 170 q4 -2 8 0" stroke="#fff" stroke-width="1.8" opacity=".7" fill="none"/><rect x="${x - 3}" y="170" width="6" height="3" rx="1" fill="#c9a227"/>`));
    // ---- mano ----
    case "algodonaz": return `<g><path d="M150 152 L164 112" stroke="#e8d9bf" stroke-width="4" stroke-linecap="round"/><g fill="#ffb3e6"><circle cx="166" cy="100" r="13"/><circle cx="176" cy="92" r="10"/><circle cx="158" cy="90" r="10"/><circle cx="168" cy="82" r="9"/></g><circle cx="162" cy="88" r="3" fill="#fff" opacity=".6"/></g>`;
    case "globocor": return `<g><path d="M150 150 Q160 120 166 100" stroke="#9a9a9a" stroke-width="1.5" fill="none"/><path d="M166 104 C146 90 148 66 162 66 C168 66 166 72 166 74 C166 72 166 66 172 66 C186 66 186 90 166 104Z" fill="#ff3d7f"/><ellipse cx="160" cy="76" rx="3" ry="5" fill="#fff" opacity=".5"/></g>`;
    case "libro": return `<g transform="rotate(-12 160 130)"><rect x="144" y="114" width="34" height="26" rx="2" fill="#4dbb7a"/><rect x="160" y="114" width="2.5" height="26" fill="#2e8a54"/><path d="M148 120 h9 M148 126 h9 M166 120 h9" stroke="#fff" stroke-width="2" opacity=".8"/><path d="${starP(170, 130, 4)}" fill="#ffd23f"/></g>`;
    case "pincel": return `<g><path d="M150 150 L172 104" stroke="#c08457" stroke-width="5" stroke-linecap="round"/><rect x="168" y="96" width="9" height="10" rx="2" fill="#c9cdd6" transform="rotate(26 172 101)"/><path d="M176 92 Q184 80 180 74 Q170 82 172 94Z" fill="#ff5c8a"/></g>`;
    case "abanico": return `<g transform="translate(160 118)">${[-60, -40, -20, 0, 20, 40, 60].map((a, i) => `<path d="M0 14 L${(30 * Math.sin(a * Math.PI / 180)).toFixed(1)} ${(14 - 30 * Math.cos(a * Math.PI / 180)).toFixed(1)}" stroke="${i % 2 ? "#ff5c8a" : "#ff8fb0"}" stroke-width="9"/>`).join("")}<path d="M-26 -1 Q0 -26 26 -1" stroke="#e63973" stroke-width="2" fill="none"/><circle cy="14" r="3" fill="#c9a227"/></g>`;
    case "rosaroja": return `<g><path d="M150 152 Q158 130 164 110" stroke="#2d8a3e" stroke-width="3.5" fill="none"/><ellipse cx="156" cy="132" rx="6" ry="3" fill="#3fa34d" transform="rotate(-40 156 132)"/><g transform="translate(166 102)"><circle r="10" fill="#d62839"/><path d="M-5 -2 Q0 -8 5 -2 Q2 4 -3 3" stroke="#a4161a" stroke-width="2" fill="none"/><path d="M-9 2 Q-4 9 4 8" stroke="#a4161a" stroke-width="1.6" fill="none"/></g></g>`;
    case "molinillo": return `<g><path d="M150 152 L164 104" stroke="#e8d9bf" stroke-width="3.5" stroke-linecap="round"/><g transform="translate(164 102)"><g class="spin">${[["#ff5c8a", 0], ["#ffd23f", 90], ["#4dd2ff", 180], ["#7cd67a", 270]].map(([c, a]) => `<path d="M0 0 L0 -16 Q10 -12 0 0Z" fill="${c}" transform="rotate(${a})"/>`).join("")}</g><circle r="2.5" fill="#fff"/></g></g>`;
    case "linterna": return `<g transform="rotate(-25 160 130)"><rect x="150" y="118" width="12" height="28" rx="3" fill="#3a3a48"/><path d="M148 118 h16 l3 -8 h-22z" fill="#5a5a6e"/><path d="M146 110 L130 70 L184 70 L168 110Z" fill="#fff59d" opacity=".35"/></g>`;
    case "microfono": return `<g transform="rotate(-20 160 130)"><rect x="155" y="112" width="9" height="34" rx="4" fill="#3a3a48"/><circle cx="159.5" cy="106" r="11" fill="#c9cdd6"/><path d="M151 102 h17 M150 107 h19 M151 112 h17" stroke="#9aa0ab" stroke-width="1.5"/><circle cx="155" cy="101" r="2.5" fill="#fff" opacity=".7"/></g>`;
    case "cazamariposas": return `<g><path d="M150 152 L172 92" stroke="#c08457" stroke-width="4" stroke-linecap="round"/><ellipse cx="178" cy="78" rx="16" ry="12" fill="#fff" opacity=".55" stroke="#e8d9bf" stroke-width="2.5"/><path d="M168 74 L188 82 M170 84 L186 72" stroke="#e8d9bf" stroke-width="1" opacity=".7"/></g>`;
    // ---- espalda ----
    case "alasmariposa": return `<g opacity=".95"><path d="M86 104 Q40 50 22 86 Q12 112 58 118 Q24 138 44 158 Q66 168 90 128Z" fill="#b48be0"/><path d="M114 104 Q160 50 178 86 Q188 112 142 118 Q176 138 156 158 Q134 168 110 128Z" fill="#b48be0"/><circle cx="44" cy="90" r="7" fill="#ffd23f"/><circle cx="156" cy="90" r="7" fill="#ffd23f"/><circle cx="58" cy="146" r="5" fill="#ff8fb8"/><circle cx="142" cy="146" r="5" fill="#ff8fb8"/></g>`;
    case "alasdragon": return `<g><path d="M80 110 L24 60 L34 84 L14 86 L36 104 L18 116 L44 122 L36 140 L76 130Z" fill="#3fa34d"/><path d="M120 110 L176 60 L166 84 L186 86 L164 104 L182 116 L156 122 L164 140 L124 130Z" fill="#3fa34d"/><path d="M80 110 L24 60 M120 110 L176 60" stroke="#2d6a35" stroke-width="3"/><path d="M34 84 L74 118 M36 104 L72 122 M166 84 L126 118 M164 104 L128 122" stroke="#2d6a35" stroke-width="1.6"/></g>`;
    case "guitarraesp": return `<g transform="rotate(30 100 120)"><rect x="96" y="40" width="9" height="66" rx="2" fill="#6e4429"/><rect x="92" y="34" width="17" height="12" rx="3" fill="#3a2a1a"/><ellipse cx="100" cy="124" rx="26" ry="22" fill="#e07a2e"/><ellipse cx="100" cy="108" rx="18" ry="15" fill="#e07a2e"/><circle cx="100" cy="116" r="6" fill="#3a2a1a"/></g>`;
    case "mochilauni": return `<g><rect x="132" y="102" width="34" height="46" rx="12" fill="#ffd6e7"/><path d="M144 102 L149 84 L154 102Z" fill="#ffe7a3"/><ellipse cx="140" cy="104" rx="5" ry="3" fill="#b9a6f0"/><ellipse cx="158" cy="104" rx="5" ry="3" fill="#7fd6e6"/><rect x="138" y="122" width="22" height="14" rx="4" fill="#ffb3d1"/></g>`;
    case "capaestrellas": return `<g><path d="M62 112 Q100 100 138 112 L162 184 Q100 196 38 184 Z" fill="#2c2a5a"/>${[[60, 150], [84, 170], [116, 172], [140, 150], [100, 160], [74, 132], [128, 132]].map(([x, y], i) => `<path d="${starP(x, y, i % 2 ? 3 : 4.5)}" fill="#ffd23f"/>`).join("")}</g>`;
  }
  return null;
}
// efectos mágicos nuevos (v48)
function fx2(id, layer) {
  if (layer === "back") return ["fx_confeti", "fx_globitos", "fx_flores", "fx_hojas", "fx_rayos", "fx_mariposas"].includes(id) ? "" : null;
  const P = [[34, 72], [168, 62], [24, 132], [178, 126], [58, 38], [146, 30], [100, 20]];
  const C = ["#ff5c8a", "#ffd23f", "#4dd2ff", "#7cd67a", "#b48be0", "#ff9f1c"];
  if (id === "fx_confeti") return P.concat([[70, 160], [130, 170]]).map(([x, y], i) => `<rect class="fxup" style="animation-delay:${(i * .35).toFixed(2)}s;animation-direction:reverse" x="${x}" y="${y}" width="5" height="9" rx="1" fill="${C[i % C.length]}" transform="rotate(${i * 37} ${x} ${y})"/>`).join("");
  if (id === "fx_globitos") return [[30, 80, 0], [170, 70, 1], [20, 140, 2], [182, 130, 4]].map(([x, y, c], i) => `<g class="fxtw" style="animation-delay:${(i * .5).toFixed(1)}s"><path d="M${x} ${y + 10} q-2 8 1 16" stroke="#aaa" stroke-width="1" fill="none"/><ellipse cx="${x}" cy="${y}" rx="7" ry="9" fill="${C[c]}"/><ellipse cx="${x - 2}" cy="${y - 3}" rx="2" ry="3" fill="#fff" opacity=".5"/></g>`).join("");
  if (id === "fx_flores") return P.map(([x, y], i) => `<g class="fxtw" style="animation-delay:${(i * .4).toFixed(2)}s" transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(4 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(4 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="3.2" fill="${C[i % 3 === 0 ? 0 : i % 3 === 1 ? 4 : 1]}"/>`).join("")}<circle r="2" fill="#fff"/></g>`).join("");
  if (id === "fx_hojas") return [30, 170, 48, 152, 20, 180].map((x, i) => `<g class="fxup" style="animation-delay:${(i * .55).toFixed(1)}s;animation-direction:reverse"><path d="M${x} ${70 + (i % 3) * 30} q6 -8 12 0 q-6 8 -12 0z" fill="${["#e07a2e", "#d9a62e", "#c8452c"][i % 3]}" transform="rotate(${i * 50} ${x + 6} ${70 + (i % 3) * 30})"/></g>`).join("");
  if (id === "fx_rayos") return P.map(([x, y], i) => `<path class="fxtw" style="animation-delay:${(i * .25).toFixed(2)}s" d="M${x} ${y - 8} l-5 9 h5 l-4 9 l10 -12 h-5 l4 -6z" fill="#ffe14d" stroke="#e0a100" stroke-width=".8"/>`).join("");
  if (id === "fx_mariposas") return [[30, 70], [170, 60], [24, 136], [178, 128]].map(([x, y], i) => `<g class="fxtw" style="animation-delay:${(i * .5).toFixed(1)}s"><ellipse cx="${x - 4}" cy="${y}" rx="5" ry="7" fill="${C[(i + 4) % 6]}" transform="rotate(-20 ${x - 4} ${y})"/><ellipse cx="${x + 4}" cy="${y}" rx="5" ry="7" fill="${C[(i + 4) % 6]}" transform="rotate(20 ${x + 4} ${y})"/><rect x="${x - 1}" y="${y - 6}" width="2" height="12" rx="1" fill="#2b1a10"/></g>`).join("");
  return null;
}
// muebles nuevos (v48)
Object.assign(FA, {
  mesa: { t: "floor", w: 130, h: 80, p: { x: 70, y: 90 }, d: () => `<rect x="10" y="30" width="110" height="10" rx="4" fill="#c08457"/><rect x="10" y="26" width="110" height="6" rx="3" fill="#fffaf2"/><path d="M14 26 Q40 34 64 26 Q88 34 116 26" fill="#ff8fb8" opacity=".6"/><rect x="20" y="40" width="6" height="36" fill="#a86f45"/><rect x="104" y="40" width="6" height="36" fill="#a86f45"/><circle cx="64" cy="20" r="7" fill="#fff"/><circle cx="64" cy="20" r="4" fill="#e63946"/><path d="M0 46 h22 v30 M108 46 h22 v30" stroke="#8a5a38" stroke-width="5" fill="none"/><rect x="0" y="22" width="6" height="26" rx="2" fill="#8a5a38"/><rect x="124" y="22" width="6" height="26" rx="2" fill="#8a5a38"/>` },
  nevera: { t: "floor", w: 64, h: 128, p: { x: 88, y: 84 }, d: () => `<rect x="2" y="2" width="60" height="124" rx="10" fill="#e8f4ff"/><rect x="2" y="2" width="60" height="124" rx="10" fill="none" stroke="#bcd3e8" stroke-width="2"/><path d="M2 48 H62" stroke="#bcd3e8" stroke-width="2"/><rect x="50" y="18" width="5" height="20" rx="2" fill="#9fb7cc"/><rect x="50" y="58" width="5" height="30" rx="2" fill="#9fb7cc"/><circle cx="18" cy="70" r="6" fill="#ff5c8a"/><rect x="26" y="78" width="12" height="10" fill="#ffd23f" transform="rotate(-8 32 83)"/><path d="M14 22 h20" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` },
  armario: { t: "floor", w: 92, h: 136, p: { x: 82, y: 76 }, d: () => `<rect x="2" y="4" width="88" height="128" rx="6" fill="#c08457"/><rect x="2" y="0" width="88" height="10" rx="4" fill="#a86f45"/><rect x="8" y="14" width="36" height="110" rx="4" fill="#d29a6a"/><rect x="48" y="14" width="36" height="110" rx="4" fill="#d29a6a"/><circle cx="40" cy="70" r="3" fill="#8a5a38"/><circle cx="52" cy="70" r="3" fill="#8a5a38"/><path d="M14 22 v94 M78 22 v94" stroke="#e0b08a" stroke-width="2" opacity=".6"/>` },
  escritorio: { t: "floor", w: 120, h: 104, p: { x: 74, y: 82 }, d: o => `<rect x="4" y="56" width="112" height="9" rx="3" fill="#a86f45"/><rect x="10" y="65" width="7" height="36" fill="#8a5a38"/><rect x="88" y="65" width="26" height="36" rx="3" fill="#8a5a38"/><circle cx="101" cy="78" r="2" fill="#e0b08a"/><rect x="34" y="14" width="56" height="38" rx="4" fill="#2b2d42"/><rect x="38" y="18" width="48" height="30" rx="2" fill="${o.mode === "night" ? "#4dd2ff" : "#9fdcff"}"/><path d="M44 26 h20 M44 32 h30 M44 38 h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/><rect x="58" y="50" width="8" height="7" fill="#3a3a48"/><rect x="40" y="58" width="44" height="5" rx="2" fill="#c9cdd6"/><circle cx="20" cy="50" r="6" fill="#ff8fb8"/><rect x="17" y="40" width="6" height="10" fill="#3fa34d"/>` },
  hamaca: { t: "floor", w: 170, h: 100, p: { x: 30, y: 95 }, d: () => `<rect x="4" y="10" width="8" height="88" rx="3" fill="#8a5a38"/><rect x="158" y="10" width="8" height="88" rx="3" fill="#8a5a38"/><path d="M12 24 L40 46 M158 24 L130 46" stroke="#e8d9bf" stroke-width="2"/><path d="M40 46 Q85 86 130 46 Q85 70 40 46Z" fill="#ff9f1c"/><path d="M48 52 Q85 80 122 52" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/><path d="M56 60 Q85 82 114 60" stroke="#ff5c8a" stroke-width="4" fill="none" opacity=".8"/>` },
  barbacoa: { t: "floor", w: 84, h: 100, p: { x: 20, y: 92 }, d: () => `<path class="steam" d="M30 14 q-5 -6 0 -12 M50 14 q5 -6 0 -12" stroke="#ddd" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/><path d="M6 34 Q42 70 78 34Z" fill="#2b2d42"/><rect x="4" y="28" width="76" height="8" rx="3" fill="#5a5a6e"/><path d="M18 30 h48" stroke="#9aa0ab" stroke-width="2"/><ellipse cx="30" cy="26" rx="9" ry="4" fill="#a8452c"/><ellipse cx="52" cy="26" rx="8" ry="4" fill="#c8602c"/><path d="M28 56 L18 98 M56 56 L66 98 M42 60 V98" stroke="#3a3a48" stroke-width="4" stroke-linecap="round"/>` },
  cunita: { t: "floor", w: 96, h: 80, p: { x: 36, y: 92 }, d: () => `<path d="M8 30 Q48 6 88 30 L84 66 H12Z" fill="#ffd6e7"/><path d="M12 66 Q48 80 84 66" stroke="#ff8fb8" stroke-width="3" fill="none"/>${[18, 30, 42, 54, 66, 78].map(x => `<path d="M${x} 34 V64" stroke="#fff" stroke-width="3"/>`).join("")}<path d="M8 30 Q48 6 88 30" stroke="#ff8fb8" stroke-width="4" fill="none"/><path d="M20 66 Q48 84 76 66" stroke="#c08457" stroke-width="4" fill="none"/><circle cx="48" cy="12" r="5" fill="#ffd23f"/>` },
  chimenea: { t: "floor", w: 120, h: 120, p: { x: 27, y: 70 }, d: o => `<rect x="6" y="16" width="108" height="102" rx="4" fill="#c8745a"/><rect x="0" y="10" width="120" height="12" rx="3" fill="#8a5a38"/>${[30, 50, 70, 90].map((y, i) => `<path d="M6 ${y} H114" stroke="#a85a44" stroke-width="2"/>`).join("")}<path d="M30 118 V62 Q60 40 90 62 V118Z" fill="#2b1a10"/><g class="fxtw"><path d="M44 116 Q40 96 52 86 Q50 98 58 104 Q60 86 70 80 Q66 96 76 104 Q80 96 82 90 Q90 104 78 116Z" fill="#ff9f1c"/><path d="M52 116 Q50 104 58 98 Q60 106 66 108 Q68 100 72 98 Q76 110 70 116Z" fill="#ffd23f"/></g><rect x="40" y="112" width="40" height="5" rx="2" fill="#6e4429"/>${o.mode === "night" ? `<ellipse cx="60" cy="100" rx="50" ry="30" fill="#ffb347" opacity=".2"/>` : ""}` },
  macetas: { t: "wall", w: 120, h: 70, p: { x: 50, y: 22 }, d: () => `<path d="M2 4 H118" stroke="#8a5a38" stroke-width="3"/>${[20, 60, 100].map((x, i) => `<path d="M${x} 4 V${20 + i % 2 * 8}" stroke="#e8d9bf" stroke-width="1.5"/><path d="M${x - 12} ${20 + i % 2 * 8} h24 l-4 18 h-16z" fill="${["#e07a2e", "#ff8fb8", "#4dd2ff"][i]}"/><g fill="#3fa34d"><ellipse cx="${x - 6}" cy="${18 + i % 2 * 8}" rx="4" ry="9" transform="rotate(-30 ${x - 6} ${18 + i % 2 * 8})"/><ellipse cx="${x + 6}" cy="${18 + i % 2 * 8}" rx="4" ry="9" transform="rotate(30 ${x + 6} ${18 + i % 2 * 8})"/><path d="M${x - 10} ${38 + i % 2 * 8} q-4 12 2 20" stroke="#3fa34d" stroke-width="3" fill="none"/></g>`).join("")}` },
  poster: { t: "wall", w: 56, h: 74, p: { x: 30, y: 42 }, d: () => `<rect x="2" y="2" width="52" height="70" rx="2" fill="#2c2a5a"/><circle cx="18" cy="20" r="8" fill="#fff6c2"/><circle cx="21" cy="17" r="7" fill="#2c2a5a"/>${[[38, 14], [44, 34], [14, 46], [32, 58], [44, 56], [22, 34]].map(([x, y], i) => `<path d="${starP(x, y, i % 2 ? 2.5 : 4)}" fill="#ffd23f"/>`).join("")}<circle cx="28" cy="4" r="2.5" fill="#e63946"/>` },
  mural: { t: "wall", w: 110, h: 64, p: { x: 50, y: 34 }, d: o => `<path d="M2 8 Q55 18 108 8" stroke="#8a5a38" stroke-width="1.5" fill="none"/>${[[10, 12, -6], [40, 16, 4], [72, 14, -3], [94, 10, 7]].map(([x, y, r], i) => `<g transform="rotate(${r} ${x + 10} ${y + 14})"><rect x="${x}" y="${y}" width="22" height="26" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="18" height="16" fill="${["#ffb3cf", "#9fdcff", "#ffe7a3", "#c8f5e2"][i]}"/>${i === 1 && o.photo ? `<image href="${o.photo}" x="${x + 2}" y="${y + 2}" width="18" height="16" preserveAspectRatio="xMidYMid slice"/>` : `<path d="M${x + 11} ${y + 12} c-3 -2 -4 -5 -1.6 -6 c1 -.4 1.6 .2 1.6 .8 c0 -.6 .6 -1.2 1.6 -.8 c2.4 1 1.4 4 -1.6 6z" fill="#ff5c8a"/>`}<rect x="${x + 8}" y="${y - 3}" width="6" height="5" fill="#ffd23f" opacity=".85"/></g>`).join("")}` },
  lamparaluna: { t: "shelf", w: 44, h: 50, p: { x: 70, y: 50 }, d: o => `${o.mode === "night" ? `<circle cx="22" cy="20" r="22" fill="#fff6c2" opacity=".3"/>` : ""}<path d="M14 4 A16 16 0 1 0 34 26 A12 12 0 1 1 14 4Z" fill="#fff3b0" stroke="#e0c25a" stroke-width="1.5"/><rect x="18" y="38" width="8" height="8" fill="#c08457"/><rect x="10" y="44" width="24" height="5" rx="2" fill="#a86f45"/>` },
  osogigante: { t: "floor", w: 90, h: 100, p: { x: 88, y: 92 }, d: () => `<circle cx="20" cy="22" r="11" fill="#a86f45"/><circle cx="70" cy="22" r="11" fill="#a86f45"/><circle cx="20" cy="22" r="5" fill="#e0b08a"/><circle cx="70" cy="22" r="5" fill="#e0b08a"/><ellipse cx="45" cy="74" rx="34" ry="26" fill="#a86f45"/><ellipse cx="45" cy="78" rx="20" ry="16" fill="#e0b08a"/><circle cx="45" cy="38" r="26" fill="#b98158"/><ellipse cx="45" cy="46" rx="11" ry="8" fill="#e0b08a"/><circle cx="36" cy="34" r="3" fill="#2b1a10"/><circle cx="54" cy="34" r="3" fill="#2b1a10"/><ellipse cx="45" cy="43" rx="4" ry="3" fill="#2b1a10"/><ellipse cx="18" cy="92" rx="12" ry="8" fill="#a86f45"/><ellipse cx="72" cy="92" rx="12" ry="8" fill="#a86f45"/><path d="M34 58 Q45 66 56 58" stroke="#ff5c8a" stroke-width="5" fill="none"/>` },
  banco: { t: "floor", w: 120, h: 70, p: { x: 74, y: 94 }, d: () => `${[8, 20, 32].map(y => `<rect x="6" y="${y}" width="108" height="8" rx="3" fill="#c08457"/>`).join("")}<rect x="4" y="42" width="112" height="9" rx="3" fill="#a86f45"/><path d="M14 8 V68 M106 8 V68" stroke="#3a3a48" stroke-width="5" stroke-linecap="round"/>` },
  columpio: { t: "floor", w: 120, h: 140, p: { x: 80, y: 92 }, d: () => `<path d="M10 138 L30 4 L50 138 M70 138 L90 4 L110 138 M26 6 H94" stroke="#a86f45" stroke-width="7" stroke-linecap="round" fill="none"/><g class="swing" style="transform-origin:60px 8px"><path d="M44 8 V96 M76 8 V96" stroke="#e8d9bf" stroke-width="2.5"/><rect x="38" y="94" width="44" height="8" rx="3" fill="#ff5c8a"/></g>` },
  arcade: { t: "floor", w: 70, h: 136, p: { x: 14, y: 76 }, d: o => `<path d="M6 132 V20 Q6 4 22 4 H48 Q64 4 64 20 V132Z" fill="#7b2ff7"/><rect x="12" y="20" width="46" height="38" rx="4" fill="#15131a"/><rect x="15" y="23" width="40" height="32" rx="2" fill="${o.mode === "night" ? "#2bd9a0" : "#1f9e78"}"/><path d="M20 46 h6 v-6 h6 v6 h6 v-10 h6 v10 h6" stroke="#ffd23f" stroke-width="2" fill="none"/><circle cx="26" cy="31" r="3" fill="#ff5c8a"/><path d="M8 62 H62 L66 76 H4Z" fill="#5a1fcc"/><circle cx="20" cy="68" r="3.5" fill="#e63946"/><circle cx="34" cy="70" r="3" fill="#ffd23f"/><circle cx="46" cy="70" r="3" fill="#4dd2ff"/><rect x="24" y="90" width="22" height="6" rx="2" fill="#15131a"/><path d="M14 8 h42" stroke="#ff8fd0" stroke-width="3"/>` }
});

const furnPos = (room, id) => { const q = (room.pos || {})[id]; return q && q.y != null ? q : FA[id].p; };
const furnScale = (id, P) => (FA[id].t === "floor" && !FA[id].flat ? .8 + .2 * Math.max(0, Math.min(1, (P.y - 62) / 35)) : 1);
// v40 · casita con volumen: molduras, zócalo, perspectiva del suelo y luz de la ventana
function roomSVG(room, mode) {
  const W = 400, H = 300, FY = 186, VX = 200, fl = room.floor || "f_madera", wl = room.wall || "w_crema", night = mode === "night";
  const fan = (n, sp) => { let d = ""; for (let i = -n; i <= n; i++) { const x0 = VX + i * sp, x1 = VX + i * sp * 2.6; d += `M${x0.toFixed(1)} ${FY} L${x1.toFixed(1)} ${H}`; } return d; };
  const rows = k => { let d = "", y = FY, g = 7; for (let i = 0; i < k; i++) { g *= 1.28; y += g; if (y > H) break; d += `M0 ${y.toFixed(1)} H${W}`; } return d; };
  let floor = "";
  const fst = (CAT[fl] || {}).fs || ({ f_madera: "planks", f_azul: "planks", f_baldosa: "tiles", f_marmol: "tiles", f_moqueta: "carpet", f_rosa: "carpet" })[fl] || "";
  if (fst === "planks") {
    floor = `<path d="${fan(9, 26)}" stroke="#3a1d00" stroke-opacity=".22" stroke-width="1.4"/>`;
    let seams = ""; for (let i = -9; i < 9; i++) { const t = (((i * 37 + 100) % 7 + 7) % 7) / 7, y = FY + 10 + t * 90, u = (y - FY) / (H - FY), x = VX + (i + .5) * 26 * (1 + 1.6 * u); seams += `M${(x - 5).toFixed(1)} ${y.toFixed(1)} h10`; }
    floor += `<path d="${seams}" stroke="#3a1d00" stroke-opacity=".2" stroke-width="1.2"/>`;
  } else if (fst === "check") {
    let q = ""; const rowsY = [FY]; { let y = FY, g = 7; while (y < H) { g *= 1.28; y += g; rowsY.push(Math.min(H, y)); } }
    for (let r = 0; r < rowsY.length - 1; r++) for (let i = -8; i < 8; i++) { if ((i + r) % 2 === 0) continue; const y0 = rowsY[r], y1 = rowsY[r + 1], u0 = (y0 - FY) / (H - FY), u1 = (y1 - FY) / (H - FY), X = (i, u) => VX + i * 30 * (1 + 1.6 * u); q += `M${X(i, u0).toFixed(1)} ${y0.toFixed(1)} L${X(i + 1, u0).toFixed(1)} ${y0.toFixed(1)} L${X(i + 1, u1).toFixed(1)} ${y1.toFixed(1)} L${X(i, u1).toFixed(1)} ${y1.toFixed(1)}Z`; }
    floor = `<path d="${q}" fill="#2b2d42" opacity=".78"/>`;
  } else if (fst === "tiles") {
    floor = `<path d="${fan(7, 34)}${rows(8)}" stroke="#6b6159" stroke-opacity=".28" stroke-width="1.3"/>`;
    if (fl === "f_marmol" || fl === "f_terrazo") floor += `<path d="M40 214 q30 10 60 -4 t70 8 M230 250 q40 -12 80 4 t60 -6 M10 272 q50 8 90 -6" stroke="#b9ada0" stroke-opacity=".45" stroke-width="1.2" fill="none"/>`;
  } else if (fst === "carpet") {
    let dots = ""; for (let i = 0; i < 70; i++) { const x = (i * 97) % W, y = FY + 6 + ((i * 53) % (H - FY - 8)); dots += `<circle cx="${x}" cy="${y}" r="${(1 + (i % 3) * .4).toFixed(1)}"/>`; }
    floor = `<g fill="#fff" opacity=".12">${dots}</g><rect x="0" y="${FY}" width="${W}" height="${H - FY}" fill="url(#rmCarpet)"/>`;
  }
  const win = (room.items || {}).ventana, wp = win ? furnPos(room, "ventana") : null;
  const beam = win && mode !== "night" ? (() => { const x = wp.x / 100 * W; return `<path d="M${x - 26} ${FY} L${x + 26} ${FY} L${x + 90} ${H} L${x + 10} ${H}Z" fill="#fff8d8" opacity="${mode === "dawn" ? .16 : .22}"/>`; })() : "";
  const wpat = {
    w_ladrillo: `<g stroke="#fff" stroke-opacity=".28" stroke-width="2" fill="none">${Array.from({ length: 9 }, (_, r) => `<path d="M0 ${r * 16 + 12} H${W}"/>` + Array.from({ length: 11 }, (_, c) => `<path d="M${c * 40 + (r % 2) * 20} ${r * 16 - 4} V${r * 16 + 12}"/>`).join("")).join("")}</g>`,
    w_rayas: `<g fill="#fff" opacity=".45">${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 30}" y="0" width="13" height="${FY}"/>`).join("")}</g>`,
    w_nubes: `<g fill="#fff" opacity=".7">${[[40, 30], [150, 60], [260, 26], [350, 74], [90, 104], [220, 112], [330, 140]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="22" ry="9"/><ellipse cx="${x + 12}" cy="${y - 6}" rx="14" ry="9"/><ellipse cx="${x - 10}" cy="${y - 4}" rx="10" ry="7"/>`).join("")}</g>`,
    w_lunares: `<g fill="#fff" opacity=".6">${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i % 12) * 34 + (Math.floor(i / 12) % 2) * 17 + 8}" cy="${Math.floor(i / 12) * 30 + 16}" r="5"/>`).join("")}</g>`
  }[wl];
  const paper = wpat ? wpat : wl === "w_rosa" || wl === "w_lavanda" || wl === "w_melocoton" ? `<g fill="#fff" opacity=".22">${Array.from({ length: 48 }, (_, i) => `<circle cx="${(i % 12) * 34 + (Math.floor(i / 12) % 2) * 17 + 8}" cy="${Math.floor(i / 12) * 34 + 30}" r="2.4"/>`).join("")}</g>`
    : wl === "w_crema" || wl === "w_menta" || wl === "w_azul" ? `<g stroke="#fff" stroke-opacity=".22" stroke-width="6">${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 30 + 12} 14 V${FY - 58}"/>`).join("")}</g>` : "";
  return `<svg class="roomsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs>
    <linearGradient id="rmWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".18" stop-color="#fff" stop-opacity=".1"/><stop offset=".75" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient>
    <linearGradient id="rmSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".12" stop-color="#000" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
    <linearGradient id="rmFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".3" stop-color="#000" stop-opacity=".06"/><stop offset=".8" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient>
    <radialGradient id="rmCarpet" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>
    <radialGradient id="rmLamp" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#fff6d8" stop-opacity=".4"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient></defs>
    ${paper}
    <rect x="0" y="0" width="${W}" height="${FY}" fill="url(#rmWall)"/>
    <rect x="0" y="0" width="${W}" height="9" fill="#fff" opacity=".5"/><rect x="0" y="9" width="${W}" height="3" fill="#000" opacity=".1"/>
    <rect x="0" y="${FY - 56}" width="${W}" height="56" fill="#000" opacity=".05"/>
    <rect x="0" y="${FY - 58}" width="${W}" height="4" fill="#fff" opacity=".45"/><rect x="0" y="${FY - 54}" width="${W}" height="2" fill="#000" opacity=".08"/>
    <g fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.5">${Array.from({ length: 6 }, (_, i) => `<rect x="${i * 68 + 10}" y="${FY - 46}" width="54" height="34" rx="3"/>`).join("")}</g>
    ${floor}
    <rect x="0" y="${FY}" width="${W}" height="${H - FY}" fill="url(#rmFloor)"/>
    ${beam}
    <rect x="0" y="${FY - 10}" width="${W}" height="10" fill="#fffaf2"/><rect x="0" y="${FY - 10}" width="${W}" height="2.5" fill="#fff"/><rect x="0" y="${FY}" width="${W}" height="5" fill="#000" opacity=".16"/>
    ${night ? "" : `<ellipse cx="200" cy="0" rx="220" ry="120" fill="url(#rmLamp)"/>`}
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#rmSide)"/>
  </svg>`;
}
function furnSVG(id, o = {}) { const A = FA[id]; return `<svg viewBox="0 0 ${A.w} ${A.h}">${A.d(o)}</svg>`; }
// quién duerme en la cama: la mascota (y su pareja) tumbados en la almohada y tapados
function bedSleeper(room) {
  const p = state.pet || {}, I = petInfo();
  if (!I.si || petView !== "in" || tripAway(p) || currentExpr(I) !== "sleep" || petLoc(p, I) !== viewLoc()) return "";
  const eyeY = k => 182 - (182 - 107) * [0, .74, .84, .94, 1.0, 1.06, 1.1][k];
  const put = (svg, x, y, w) => svg.replace('<svg viewBox="0 0 200 200"', `<svg x="${x}" y="${y}" width="${w}" height="${w}" viewBox="0 0 200 200" overflow="visible"`);
  const wear = { ...(p.wear || {}) }; delete wear.feet; delete wear.hand; delete wear.back;
  let h = `<defs><clipPath id="bedclip"><rect x="-10" y="-70" width="190" height="136"/></clipPath></defs><g clip-path="url(#bedclip)">`;
  const m = mateOf(p);
  const ms = Math.max(2, I.si);
  if (m && m.status !== "conocidos" && mateLoc(p, I) === viewLoc()) h += `<g transform="rotate(8 74 30)">${put(chickSVG(ms, "sleep", { head: (m.wear || {}).head, mark: m.mark }, 0, geneColor(m), { species: m.species, nofeet: 1 }), 38, 31 - eyeY(ms) * 74 / 200, 74)}</g>`;
  h += `<g transform="rotate(-10 40 30)">${put(chickSVG(I.si, "sleep", wear, 0, p.color, { species: p.species, nofeet: 1 }), 2, 33 - eyeY(I.si) * 80 / 200, 80)}</g>`;
  const hearts = [[96, 55], [120, 50], [144, 57], [108, 62], [134, 64]].map(([x, y]) => `<path d="M${x} ${y + 2} c-3 -2 -4 -5 -1.6 -6 c1 -.4 1.6 .2 1.6 .8 c0 -.6 .6 -1.2 1.6 -.8 c2.4 1 1.4 4 -1.6 6z" fill="#fff" opacity=".55"/>`).join("");
  h += `</g><defs><linearGradient id="bedq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb0c8"/><stop offset="1" stop-color="#f27aa0"/></linearGradient></defs>
    <path d="M20 44 Q60 36 100 39 Q140 42 164 40 Q168 41 168 46 L166 70 Q92 74 20 70 Z" fill="url(#bedq)"/>
    <path d="M20 44 Q60 36 100 39 Q140 42 164 40 L164 47 Q140 49 100 46 Q60 43 20 51 Z" fill="#fffaf2"/>
    <path d="M22 50 Q60 43 100 46 Q140 49 164 47" stroke="#e8dcc8" stroke-width="1.2" fill="none"/>${hearts}
    <path d="M60 66 Q62 58 70 54" stroke="#e46a92" stroke-width="1.4" fill="none" opacity=".6"/>`;
  return h;
}
function furnHTML(id, room, mode, photo) {
  const A = FA[id], P = furnPos(room, id), sl = id === "cama" ? bedSleeper(room) : "", s = furnScale(id, P) * (sl ? 1.22 : 1);
  const sh = A.t === "floor" && !A.flat ? `<ellipse cx="${A.w / 2}" cy="${A.h - 2}" rx="${A.w * .46}" ry="4.5" fill="rgba(0,0,0,.2)"/>` : "";
  return `<div class="fi f-${A.t}${A.flat ? " flat" : ""}" data-id="${id}" style="left:${P.x}%;top:${P.y}%;width:${A.w}px;--s:${s.toFixed(3)}"><svg viewBox="0 0 ${A.w} ${A.h}">${sh}${A.d({ mode, photo, lit: room.light !== false, sleep: sl })}</svg></div>`;
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
// ---------- Paisajes dibujados (mismo estilo que la mascota) ----------
// Lienzo 400×300; el suelo queda a la altura de los pies de la mascota (y≈245)
const L_ = {
  cloud: (x, y, k, c = "#fff") => `<g transform="translate(${x} ${y}) scale(${k})" fill="${c}"><ellipse cx="0" cy="0" rx="26" ry="13"/><ellipse cx="16" cy="-9" rx="17" ry="13"/><ellipse cx="-15" cy="-4" rx="14" ry="10"/><ellipse cx="32" cy="2" rx="14" ry="9"/></g>`,
  tree: (x, y, k, c = "#4f9f3e") => `<g transform="translate(${x} ${y}) scale(${k})"><rect x="-6" y="-52" width="12" height="54" rx="4" fill="#8a5a38"/><circle cx="0" cy="-72" r="30" fill="${c}"/><circle cx="-21" cy="-56" r="20" fill="${c}"/><circle cx="21" cy="-56" r="20" fill="#5aab47"/><circle cx="-8" cy="-84" r="13" fill="#6cbd57" opacity=".8"/><ellipse cx="0" cy="2" rx="26" ry="4" fill="rgba(0,0,0,.15)"/></g>`,
  pine: (x, y, k, c = "#2f6f3e", snow) => `<g transform="translate(${x} ${y}) scale(${k})"><ellipse cx="0" cy="1" rx="30" ry="4" fill="rgba(0,0,0,.15)"/><rect x="-5" y="-14" width="10" height="16" fill="#6b4a2f"/><path d="M0 -112 L30 -52 H17 L40 -14 H-40 L-17 -52 H-30Z" fill="${c}"/><path d="M0 -112 L30 -52 H17 L40 -14 H22 Z" fill="rgba(0,0,0,.12)"/>${snow ? `<path d="M0 -112 L10 -92 Q0 -86 -10 -92Z M-26 -54 Q0 -46 26 -54 M-37 -16 Q0 -8 37 -16" stroke="#fff" stroke-width="5" fill="#fff" stroke-linecap="round"/>` : ""}</g>`,
  flower: (x, y, c) => `<g transform="translate(${x} ${y})"><path d="M0 0 V-11" stroke="#3d8a2e" stroke-width="2"/>${[0, 72, 144, 216, 288].map(a => `<circle cx="${(4 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(-13 + 4 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="3.2" fill="${c}"/>`).join("")}<circle cy="-13" r="2.2" fill="#ffd93b"/></g>`,
  heart: (x, y, k, c) => `<path d="M0 6 C-10 -2 -10 -11 -4 -11 C-1 -11 0 -8 0 -6 C0 -8 1 -11 4 -11 C10 -11 10 -2 0 6Z" transform="translate(${x} ${y}) scale(${k})" fill="${c}"/>`,
  ground: (c, top, y = 246, d = 22) => `<path d="M0 ${y} Q200 ${y - d} 400 ${y} V300 H0Z" fill="${c}"/><path d="M0 ${y} Q200 ${y - d} 400 ${y}" stroke="${top}" stroke-width="5" fill="none"/>`,
  snowman: (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><ellipse cx="0" cy="0" rx="22" ry="4" fill="rgba(0,0,0,.12)"/><circle cy="-18" r="19" fill="#fff" stroke="#dbe8f4" stroke-width="2"/><circle cy="-46" r="14" fill="#fff" stroke="#dbe8f4" stroke-width="2"/><circle cy="-67" r="10" fill="#fff" stroke="#dbe8f4" stroke-width="2"/><path d="M-10 -56 Q0 -50 10 -56 L12 -50 Q0 -44 -12 -50Z" fill="#e63946"/><circle cx="-3.5" cy="-69" r="1.6" fill="#222"/><circle cx="3.5" cy="-69" r="1.6" fill="#222"/><path d="M0 -66 L10 -64 L0 -63Z" fill="#ff8c1a"/><rect x="-9" y="-80" width="18" height="4" fill="#222"/><rect x="-6" y="-92" width="12" height="13" fill="#222"/><circle cy="-40" r="1.8" fill="#222"/><circle cy="-30" r="1.8" fill="#222"/></g>`
};
function starsSVG(n, seed, maxY = 200) { let s = ""; for (let i = 0; i < n; i++) { const h = hashStr(seed + i); s += `<circle class="tw" style="animation-delay:${(h % 24) / 10}s" cx="${h % 400}" cy="${(h >> 9) % maxY}" r="${(h >> 5) % 3 ? 1 : 1.7}" fill="#fff"/>`; } return s; }
const SCN = {
  jardin: () => `<ellipse cx="70" cy="252" rx="170" ry="58" fill="#9ad97a"/><ellipse cx="340" cy="256" rx="180" ry="62" fill="#8ccf6c"/>${L_.tree(42, 240, 1)}<g fill="#58ad3f"><circle cx="362" cy="238" r="16"/><circle cx="384" cy="236" r="19"/><circle cx="346" cy="244" r="12"/></g>` +
    L_.ground("#6fbf4f", "#8ad86a") + [[110, 264, "#ff8fb8"], [128, 272, "#fff"], [72, 278, "#ffd93b"], [290, 266, "#ff6b6b"], [318, 274, "#cdb4ff"], [352, 264, "#ffd93b"], [376, 280, "#ff8fb8"]].map(f => L_.flower(...f)).join(""),
  playa: () => `<rect x="0" y="172" width="400" height="70" fill="#3fa7d6"/><rect x="0" y="172" width="400" height="7" fill="#8fd6f5" opacity=".75"/><path d="M20 195 q10 -5 20 0 M120 206 q10 -5 20 0 M240 190 q10 -5 20 0 M330 212 q10 -5 20 0 M60 222 q10 -5 20 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>` +
    `<g transform="translate(318 186)"><path d="M-18 0 H18 L12 8 H-12Z" fill="#8a5a38"/><path d="M1 -2 V-30 L17 -4Z" fill="#fff"/><path d="M-1 -4 V-24 L-14 -4Z" fill="#ff6b6b"/></g>` +
    `<path d="M0 236 Q110 220 220 232 T400 228 V300 H0Z" fill="#f2d49b"/><path d="M0 236 Q110 220 220 232 T400 228" stroke="#fff" stroke-width="4" fill="none" opacity=".6"/>` +
    `<path d="M52 256 Q38 206 64 150" stroke="#a0703f" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M47 236 l10 -2 M44 216 l10 -1 M46 196 l10 0 M52 176 l10 1" stroke="#7d5530" stroke-width="2.5"/>` +
    `<g fill="#3fa34d"><path d="M64 150 Q30 128 4 150 Q34 138 64 154Z"/><path d="M64 150 Q98 126 124 146 Q94 138 64 154Z"/><path d="M64 150 Q44 116 20 112 Q48 124 62 152Z"/><path d="M64 150 Q86 114 112 110 Q84 124 66 152Z"/><path d="M64 150 Q70 118 60 98 Q76 120 68 152Z" fill="#52b95f"/></g><circle cx="60" cy="156" r="5" fill="#7d5530"/><circle cx="69" cy="157" r="5" fill="#7d5530"/>` +
    `<path d="${starP(336, 268, 8)}" fill="#ff8c42"/><path d="M366 280 a8 8 0 0 1 16 0Z" fill="#ffb3cf"/><path d="M370 280 v-6 M374 280 v-8 M378 280 v-6" stroke="#ff8fb8" stroke-width="1.5"/>`,
  bosque: () => { let far = ""; for (let i = 0; i < 13; i++) { const x = i * 32 - 10, t = 150 + (i % 3) * 14; far += `<path d="M${x} 232 L${x + 18} ${t} L${x + 36} 232Z" fill="#7fb58a"/>`; }
    return far + L_.ground("#4f8f3a", "#63a94b", 246, 18) + L_.pine(36, 254, 1.25) + L_.pine(372, 256, 1.15) + L_.pine(320, 244, .8, "#3d7f4a") +
      `<g transform="translate(300 272)"><rect x="-3" y="-8" width="6" height="9" rx="2" fill="#fff"/><path d="M-10 -7 Q0 -21 10 -7Z" fill="#e63946"/><circle cx="-3" cy="-12" r="1.6" fill="#fff"/><circle cx="4" cy="-11" r="1.4" fill="#fff"/></g><g transform="translate(96 276) scale(.8)"><rect x="-3" y="-8" width="6" height="9" rx="2" fill="#fff"/><path d="M-10 -7 Q0 -21 10 -7Z" fill="#e63946"/><circle cx="-3" cy="-12" r="1.6" fill="#fff"/></g>` +
      `<g class="bfly"><g transform="translate(110 150)"><ellipse cx="-5" cy="0" rx="6" ry="8" fill="#ffb3d1"/><ellipse cx="5" cy="0" rx="6" ry="8" fill="#ff8fb8"/><rect x="-1" y="-6" width="2" height="12" fill="#3a2330"/></g></g>`; },
  nieve: () => `<path d="M0 222 L70 142 L130 200 L200 118 L280 210 L340 150 L400 200 V246 H0Z" fill="#b8cbe2"/><path d="M70 142 L55 160 L70 154 L85 162Z M200 118 L181 142 L200 135 L217 146Z M340 150 L325 167 L340 162 L354 169Z" fill="#fff"/>` +
    L_.ground("#fdfeff", "#dbe8f4") + `<path d="M40 272 q30 -6 60 0 M280 282 q30 -6 60 0" stroke="#dbe8f4" stroke-width="3" fill="none"/>` + L_.pine(40, 250, 1.05, "#2f5f4a", 1) + L_.pine(88, 244, .6, "#3a6d57", 1) + L_.snowman(350, 262, 1),
  montana: () => `<path d="M0 212 L60 150 L110 188 L170 112 L230 180 L290 130 L350 188 L400 160 V250 H0Z" fill="#a8bcdb"/><path d="M-20 244 L112 88 L182 160 L232 118 L336 244Z" fill="#7189a8"/><path d="M112 88 L182 160 L160 244 L130 244Z" fill="#5f7896"/><path d="M232 118 L336 244 L300 244 L256 170Z" fill="#5f7896"/>` +
    `<path d="M112 88 L90 115 L102 110 L112 122 L124 108 L136 117Z M232 118 L217 136 L229 132 L240 141 L247 133Z" fill="#fff"/>` + L_.ground("#8cbf5f", "#a4d07a") +
    `<ellipse cx="62" cy="266" rx="42" ry="7" fill="#7fc4ee"/><ellipse cx="52" cy="264" rx="18" ry="2" fill="#fff" opacity=".5"/>` + L_.pine(334, 250, .55, "#3d7f4a") + L_.pine(358, 256, .7, "#2f6f3e") + L_.pine(382, 250, .5, "#3d7f4a") + L_.flower(120, 276, "#fff") + L_.flower(300, 274, "#ffd93b"),
  ciudad: N => { const back = [[0, 120], [36, 92], [70, 142], [104, 100], [140, 130], [176, 86], [210, 150], [246, 110], [282, 136], [318, 96], [352, 126], [386, 104]];
    let s = back.map(([x, h]) => `<rect x="${x}" y="${238 - h}" width="36" height="${h}" fill="${N ? "#353a63" : "#aeb9d6"}"/>`).join("");
    const front = [[-6, 78, 58], [48, 104, 46], [276, 94, 50], [330, 124, 56], [384, 84, 40]];
    for (const [x, h, w] of front) { s += `<rect x="${x}" y="${240 - h}" width="${w}" height="${h}" fill="${N ? "#262b4b" : "#6d7c9b"}"/><rect x="${x}" y="${240 - h}" width="${w}" height="5" fill="${N ? "#1d2140" : "#5b6886"}"/>`;
      for (let yy = 240 - h + 12; yy < 228; yy += 16) for (let xx = x + 7; xx < x + w - 8; xx += 12) { const lit = N ? hashStr(xx + ":" + yy) % 3 !== 0 : false; s += `<rect x="${xx}" y="${yy}" width="6" height="8" rx="1" fill="${N ? (lit ? "#ffd966" : "#1a1e3a") : "#d6ebff"}"/>`; } }
    s += `<rect y="236" width="400" height="10" fill="#a2a2ad"/><rect y="244" width="400" height="56" fill="#56565f"/><path d="M0 274 H400" stroke="#fff" stroke-width="3" stroke-dasharray="18 14" opacity=".7"/>`;
    for (const x of [30, 372]) s += `${N ? `<circle cx="${x + 10}" cy="178" r="26" fill="#ffe8a0" opacity=".25"/>` : ""}<rect x="${x - 2}" y="178" width="4" height="62" fill="#3a3a44"/><path d="M${x} 178 q0 -8 10 -8 h4" stroke="#3a3a44" stroke-width="4" fill="none"/><rect x="${x + 8}" y="172" width="12" height="8" rx="2" fill="${N ? "#ffe066" : "#e8e8ef"}"/>`;
    return s + L_.tree(98, 240, .5) + `<rect x="84" y="234" width="28" height="8" rx="2" fill="#8a5a38"/>`; },
  mar: () => `<g fill="#fff" opacity=".08"><path d="M60 0 L100 0 L40 300 L10 300Z"/><path d="M180 0 L215 0 L190 300 L150 300Z"/><path d="M300 0 L330 0 L370 300 L335 300Z"/></g>` +
    `<g class="swim1"><ellipse cx="80" cy="118" rx="14" ry="8" fill="#ff8c42"/><path d="M93 118 l11 -7 v14z" fill="#ff8c42"/><path d="M76 111 v14" stroke="#fff" stroke-width="3"/><circle cx="72" cy="116" r="2" fill="#222"/></g><g class="swim2"><ellipse cx="320" cy="84" rx="11" ry="6" fill="#4dd2ff"/><path d="M309 84 l-9 -6 v12z" fill="#4dd2ff"/><circle cx="326" cy="82" r="1.7" fill="#222"/></g>` +
    L_.ground("#e0c48a", "#ecd5a6", 248, 16) + [[30, 250, "#2d8a3e"], [52, 252, "#3fa34d"], [368, 252, "#2d8a3e"]].map(([x, y, c]) => `<path class="sway" d="M${x} ${y} q-12 -22 0 -44 q12 -22 0 -44" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/>`).join("") +
    `<g transform="translate(330 252)" stroke="#ff7aa2" stroke-width="7" stroke-linecap="round" fill="none"><path d="M0 0 V-32 M0 -18 L-15 -34 M0 -26 L12 -42 M-15 -34 V-46"/></g><g transform="translate(96 256)" stroke="#ffa94d" stroke-width="6" stroke-linecap="round" fill="none"><path d="M0 0 V-22 M0 -12 L10 -26 M0 -16 L-9 -28"/></g>` +
    `<ellipse cx="270" cy="262" rx="16" ry="8" fill="#9aa3ae"/><ellipse cx="288" cy="266" rx="10" ry="6" fill="#b2bac4"/><path d="${starP(230, 278, 8)}" fill="#ff8c42"/>`,
  espacio: () => starsSVG(60, "esp", 230) + `<g transform="translate(92 130)"><ellipse rx="48" ry="11" fill="none" stroke="#e8c98a" stroke-width="5" transform="rotate(-18)"/><circle r="24" fill="#f2b56b"/><path d="M-22 -8 Q0 -2 22 -8" stroke="#e39a4a" stroke-width="4" fill="none"/><path d="M-48 0 A48 11 0 0 0 48 0" stroke="#e8c98a" stroke-width="5" fill="none" transform="rotate(-18)"/></g>` +
    `<g transform="translate(318 104)"><circle r="19" fill="#4d9dff"/><path d="M-12 -8 q6 -6 12 0 q4 6 -4 10 q-8 2 -8 -10z M4 6 q8 -2 10 6 q-6 6 -10 -6z" fill="#6fdc9a"/><circle r="19" fill="none" stroke="#bfe9ff" stroke-width="2" opacity=".6"/></g>` +
    `<g class="fly2"><g transform="translate(240 60) rotate(35)"><path d="M0 -16 Q7 -8 7 6 H-7 Q-7 -8 0 -16Z" fill="#eef2f6"/><circle cy="-4" r="3" fill="#4dd2ff"/><path d="M-7 2 l-5 8 h5z M7 2 l5 8 h-5z" fill="#e63946"/><path d="M-4 7 q4 10 8 0z" fill="#ff9f1c"/></g></g>` +
    L_.ground("#8d8aa3", "#a7a4bd", 244, 26) + `<g fill="#77748d"><ellipse cx="70" cy="270" rx="22" ry="6"/><ellipse cx="320" cy="262" rx="16" ry="4"/><ellipse cx="360" cy="282" rx="12" ry="3.5"/></g><path d="M300 240 v-26" stroke="#ccc" stroke-width="2"/><path d="M300 214 h16 v10 h-16z" fill="#e63946"/>`,
  amor: () => `${L_.heart(120, 70, 2.4, "#fff")}${L_.heart(262, 108, 1.8, "#ffe0ec")}<ellipse cx="80" cy="254" rx="170" ry="58" fill="#ffc2d8"/><ellipse cx="340" cy="258" rx="180" ry="62" fill="#ffb0cc"/>` +
    [[46, 244, 1], [360, 248, .9]].map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})"><ellipse cx="0" cy="2" rx="24" ry="4" fill="rgba(0,0,0,.12)"/><rect x="-5" y="-50" width="10" height="52" rx="4" fill="#8a5a38"/>${L_.heart(0, -70, 5.2, "#ff5c8a")}${L_.heart(-6, -78, 1.4, "#ff8fb8")}</g>`).join("") +
    L_.ground("#ff8fb8", "#ffa8c8") + [[110, 266], [134, 274], [300, 268], [326, 276]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 0 V-10" stroke="#2d8a3e" stroke-width="2"/><circle cy="-12" r="4.5" fill="#d62839"/><path d="M-3 -13 q3 -3 6 0" stroke="#a4161a" stroke-width="1.5" fill="none"/></g>`).join("") +
    [[70, 150], [320, 170], [200, 60]].map(([x, y], i) => `<g class="flo" style="animation-delay:${i * 1.3}s">${L_.heart(x, y, 1.3, "#ff3d7f")}</g>`).join("")
};
function seasonalSVG(month) {
  if (month === 9) return `<g transform="translate(106 266)"><ellipse cx="0" cy="0" rx="16" ry="3" fill="rgba(0,0,0,.15)"/><ellipse cx="-8" cy="-9" rx="9" ry="9" fill="#f77f00"/><ellipse cx="8" cy="-9" rx="9" ry="9" fill="#f77f00"/><ellipse cx="0" cy="-9" rx="10" ry="10" fill="#fb8b24"/><path d="M-4 -12 l2 -3 2 3z M2 -12 l2 -3 2 3z" fill="#3a1f00"/><path d="M-5 -6 q5 3 10 0" stroke="#3a1f00" stroke-width="1.6" fill="none"/><rect x="-1.5" y="-22" width="3" height="5" rx="1" fill="#2d8a3e"/></g>` +
    `<g class="flo"><path d="M300 108 q0 -22 18 -22 q18 0 18 22 v18 l-6 -5 -6 5 -6 -5 -6 5 -6 -5 -6 5z" fill="#fff" opacity=".92"/><circle cx="312" cy="104" r="2.4" fill="#222"/><circle cx="324" cy="104" r="2.4" fill="#222"/><ellipse cx="318" cy="112" rx="3" ry="4" fill="#222"/></g>`;
  if (month === 11) return `<g transform="translate(100 272) scale(.5) translate(-48 -128)">${FA.arbolnav.d()}</g><g transform="translate(132 272)"><rect x="-9" y="-16" width="18" height="16" rx="2" fill="#e63946"/><rect x="-2" y="-16" width="4" height="16" fill="#ffd23f"/><path d="M0 -16 q-8 -8 -6 0 M0 -16 q8 -8 6 0" stroke="#ffd23f" stroke-width="2" fill="none"/></g>`;
  if (month === 0) return L_.snowman(108, 270, .55);
  if (month === 1) return `<g class="flo"><path d="M310 150 Q316 180 304 200" stroke="#999" stroke-width="1.2" fill="none"/>${L_.heart(310, 138, 2.2, "#ff3d7f")}</g>`;
  return "";
}
function landscape(scene, mode, wk = "", month = new Date().getMonth()) {
  const N = mode === "night", Dw = mode === "dawn", out = scene !== "mar" && scene !== "espacio";
  const SKY = { jardin: ["#7ec8ff", "#d4f0ff"], playa: ["#6ec6ff", "#d2f1ff"], bosque: ["#9fd4c4", "#e4f6dc"], nieve: ["#a9cdef", "#eef6fd"], montana: ["#6fb0e6", "#d6ecfa"],
    ciudad: ["#8fc2ee", "#e6f2ff"], mar: ["#2a8cc4", "#0c3d66"], espacio: ["#05041a", "#2b1f5c"], amor: ["#ffb3cf", "#ffe6f0"] };
  let [s1, s2] = SKY[scene] || SKY.jardin;
  if (out) { if (N) [s1, s2] = ["#0b0c29", "#2f2a5c"]; else if (Dw) [s1, s2] = ["#ff9a8b", "#ffd9a8"]; if (wk === "rain" || wk === "storm") [s1, s2] = N ? ["#15172a", "#34374c"] : ["#8a98a8", "#cfd7e0"]; }
  const gid = "lsk" + scene + mode + wk;
  let s = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#${gid})"/>`;
  if (out && N) s += starsSVG(34, "n" + scene, 160);
  if (out && !["rain", "storm", "snow"].includes(wk)) s += N ? `<defs><mask id="moonM"><rect width="400" height="300" fill="#fff"/><circle cx="249" cy="75" r="15" fill="#000"/></mask></defs><circle cx="240" cy="82" r="28" fill="#fff6c2" opacity=".12"/><circle cx="240" cy="82" r="18" fill="#fff6c2" mask="url(#moonM)"/>` : Dw ? `<circle cx="300" cy="176" r="40" fill="#ffcf73" opacity=".35"/><circle cx="300" cy="176" r="26" fill="#ffb347"/>` : `<circle cx="236" cy="80" r="30" fill="#fff3b0" opacity=".45"/><circle cx="236" cy="80" r="20" fill="#ffd93b"/>`;
  if (out && (!N || wk === "cloud" || wk === "rain" || wk === "storm")) { const c = wk === "rain" || wk === "storm" ? "#9aa3b0" : N ? "#8b86b8" : "#fff"; s += `<g class="drift" opacity=".92">${L_.cloud(150, 52, 1, c)}${L_.cloud(236, 96, .7, c)}${wk ? L_.cloud(66, 118, .8, c) + L_.cloud(340, 128, .9, c) : ""}</g>`; }
  s += (SCN[scene] || SCN.jardin)(N, Dw);
  if (out) s += seasonalSVG(month);
  if (out && N && scene !== "ciudad") s += `<rect width="400" height="300" fill="#0a0a30" opacity=".3"/>`;
  if (out && Dw) s += `<rect width="400" height="300" fill="#ff8a50" opacity=".08"/>`;
  return `<svg class="land" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
}
function renderScene(I, pvScene, pvRoom) {
  const h = hourIn(myTz), mode = (h >= 21 || h < 6) ? "night" : (h < 8 || h >= 19) ? "dawn" : "day", month = new Date().getMonth();
  const p = I.p, scene = pvScene || p.scene || "jardin", room = { ...roomOf(p, curRoom), ...(pvRoom || {}) };
  const photo = phOf(memList.find(m => phOf(m)) || {}), wk = wxKind(), away = tripAway(p);
  const sig = [petView, curRoom, mode, scene, JSON.stringify(room), photo.length, I.bd ? 1 : 0, wk, away ? 1 : 0, editMode, JSON.stringify(p.family || []).length, month, treasureReady(p) ? 1 : 0, room.items.reloj && petView === "in" ? Math.floor(Date.now() / 3e5) : 0].join("|");
  if (sig + famSig(p) === sceneSig) return; sceneSig = sig + famSig(p);
  const S0 = $("petScene");
  let sky = "";
  if (petView === "in") {
    const wall = CAT[room.wall] || CAT.w_crema, floor = CAT[room.floor] || CAT.f_madera, garden = curRoom === "jardin";
    S0.className = "scene room " + (garden ? "garden " : "") + room.wall + " " + room.floor + (editMode ? " editing" : "");
    S0.style.setProperty("--wall", wall.sw); S0.style.setProperty("--floor", floor.sw);
    sky += garden ? `<span class="cloud" style="top:26px;animation-delay:-8s">☁️</span><span class="cloud" style="top:64px;animation-delay:-24s;font-size:24px">☁️</span><div class="bushes"></div><div class="fence"></div>`
      : roomSVG(room, mode);
    const ids = Object.keys(room.items).filter(k => room.items[k] && FA[k]), rank = id => (FA[id].flat ? 0 : FA[id].t === "floor" ? 2 : 1);
    ids.sort((a, b) => rank(a) - rank(b) || furnPos(room, a).y - furnPos(room, b).y);
    for (const id of ids) sky += furnHTML(id, room, mode, photo);
    if (mode === "night") {
      const on = room.items.lampara && room.light !== false, lp = furnPos(room, "lampara"), ly = lp.y - 130 * furnScale("lampara", lp) / 3;
      sky += `<div class="roomnight" style="${on ? `background:radial-gradient(circle at ${lp.x}% ${ly.toFixed(1)}%,rgba(255,220,140,.42) 0,rgba(255,200,120,.14) 90px,rgba(10,10,40,.5) 230px)` : ""}"></div>`;
    }
  } else {
    S0.className = "scene land-on sc-" + scene + " " + (mode === "day" ? "" : mode);
    S0.style.removeProperty("--wall"); S0.style.removeProperty("--floor");
    sky += landscape(scene, mode, wk, month);
    sky += ambientHTML(scene, mode, wk, month);
    if (mode !== "day") sky += `<div class="landveil ${mode}"></div>`;
    if (scene === "nieve" || wk === "snow") for (let i = 0; i < 16; i++) sky += `<i class="flake" style="left:${(Math.random() * 100).toFixed(0)}%;animation-delay:${(Math.random() * 6).toFixed(1)}s;animation-duration:${(5 + Math.random() * 4).toFixed(1)}s">❄</i>`;
    if ((wk === "rain" || wk === "storm") && scene !== "mar" && scene !== "espacio") { for (let i = 0; i < 30; i++) sky += `<i class="drop" style="left:${(Math.random() * 100).toFixed(0)}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s"></i>`; sky += `<span class="umbrella">☂️</span>`; }
    if (wk === "storm") sky += `<div class="flash"></div>`;
    if (wk === "fog") sky += `<div class="fog"></div>`;
    if (scene === "mar") for (let i = 0; i < 8; i++) sky += `<i class="bubbleup" style="left:${(10 + Math.random() * 80).toFixed(0)}%;animation-delay:${(Math.random() * 5).toFixed(1)}s">○</i>`;
    // tesoro
    if (treasureReady(p) && I.si > 0 && !away) { const x = 12 + (hashStr(String((p.tre || {})[who] || 0)) % 60); sky += `<button class="treasure" id="treasureBtn" style="left:${x}%">✨</button>`; }
  }
  if (away && !(petView === "in" && curRoom !== "jardin")) sky += `<svg class="plane" viewBox="0 0 80 30"><path d="M4 16 Q2 12 8 12 H56 Q70 12 76 16 Q70 20 56 20 H8 Q2 20 4 16Z" fill="#fff"/><path d="M30 12 L42 0 H48 L42 12Z M30 20 L42 30 H48 L42 20Z M6 12 L2 4 H8 L14 12Z" fill="#e6ebf2"/>${[50, 44, 38, 32, 26].map(x => `<circle cx="${x}" cy="15" r="1.6" fill="#7fb7ff"/>`).join("")}<path d="M66 13 Q72 14 74 16" stroke="#7fb7ff" stroke-width="2" fill="none"/></svg>`;
  // familia (mascotas anteriores), pequeñitas a un lado
  (p.family || []).slice(-3).forEach((f, i) => { sky += `<div class="famfig" style="left:${4 + i * 14}%">${chickSVG(Math.min(6, f.stage || 6), "happy", f.wear || {}, 0, f.color, { species: f.species })}</div>`; });
  sky += famScene(p, I);
  if (I.bd) sky += `<span class="deco" style="left:6%;bottom:8%;font-size:40px">🎂</span><span class="deco flutter" style="right:8%;top:20%;font-size:34px">🎈</span>`;
  sky += `<div class="vign"></div>`;
  $("petSky").innerHTML = sky; bindFamScene();
  const vk = petView + curRoom; if (renderScene.vk && renderScene.vk !== vk) sceneFade(); renderScene.vk = vk;
  $("petView").textContent = petView === "in" ? "🌳 Salir" : "🏠 Casita";
  $("roomBar").classList.toggle("hidden", petView !== "in");
  $("roomBar").innerHTML = ROOMS.map(([id, n]) => `<button class="${id === curRoom ? "on" : ""}" data-room="${id}">${n}</button>`).join("") +
    `<button class="${editMode ? "on" : ""}" id="editBtn">${editMode ? "✅ Listo" : "✏️ Mover"}</button>` + (mode === "night" && room.items.lampara ? `<button id="lightBtn">${room.light === false ? "💡 Encender" : "🌑 Apagar"}</button>` : "");
  $("roomBar").querySelectorAll("[data-room]").forEach(b => b.onclick = () => { locNav = true; petHome(true); curRoom = b.dataset.room; ls.set("petRoom", curRoom); editMode = false; sceneSig = ""; renderPet(); });
  $("editBtn").onclick = () => { editMode = !editMode; sceneSig = ""; renderPet(); if (editMode) toast("Arrastra los muebles con el dedo ✋"); };
  const lb = $("lightBtn"); if (lb) lb.onclick = () => petTx(q => { q.rooms = q.rooms || {}; q.rooms[curRoom] = { ...roomOf(q, curRoom), light: roomOf(q, curRoom).light === false }; return q; }).then(() => { sceneSig = ""; renderPet(); }).catch(offline);
  const tb = $("treasureBtn"); if (tb) tb.onclick = e => { e.stopPropagation(); digTreasure(); };
  if (editMode) enableDrag();
}
$("petView").onclick = () => { locNav = true; petHome(true); petView = petView === "in" ? "out" : "in"; ls.set("petView", petView); editMode = false; sceneSig = ""; renderPet(); if (locHere()) say(petView === "in" ? "¡Mi casita! 🏠" : "¡Qué buen día hace fuera! 🌳"); };
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
  if (away && petX !== 50) petHome(true);
  const expr = si === 0 ? "egg" : currentExpr(I);
  const wear = { ...(p.wear || {}) }; let color = p.color || "amarillo", pvScene = null, pvRoom = null;
  for (const pid of pvIds()) {
    const it = ITK(pid); if (!it) continue;
    if (it.slot) wear[it.slot] = it.id; else if (it.cat === "color") color = it.id;
    else if (it.cat === "lugar") { pvScene = it.id; if (petView !== "out") { petView = "out"; sceneSig = ""; } }
    else if (it.cat === "casa") { if (petView !== "in") { petView = "in"; sceneSig = ""; } const rm = roomOf(p, curRoom); pvRoom = { ...(pvRoom || {}), ...(it.kind === "wall" ? { wall: it.id } : it.kind === "floor" ? { floor: it.id } : { items: { ...((pvRoom && pvRoom.items) || rm.items), [it.id]: true } }) }; }
  }
  renderScene(I, pvScene, pvRoom);
  const crack = si === 0 && (I.meT || I.otT) ? 1 : 0, wk = wxKind();
  const extra = { dirty: si > 0 && I.nv.clean < 30, party: !!I.bd && !wear.head, species: p.species || "pollito",
    cold: !!(WX && WX.temp <= 8 && petView === "out"), hot: !!(WX && WX.temp >= 28 && petView === "out") };
  const sig = [si, expr, JSON.stringify(wear), crack, color, extra.dirty, extra.party, extra.species, extra.cold, extra.hot, away ? 1 : 0].join("|");
  if (sig !== petSig) { petSig = sig; $("petBox").innerHTML = away ? awaySign(away, p.trip.until) : chickSVG(si, expr, wear, crack, color, extra); }
  const here = renderLocate(p, I);
  if (here && expr === "sleep" && !away && petView === "in") { const rm = roomOf(p, curRoom); if (rm.items && rm.items.cama) { const bx = Math.max(24, furnPos(rm, "cama").x); if (Math.abs(petX - bx) > 3) petPlace(bx, 0); } }
  if (here && !away) sleepPose(expr);
  $("petZzz").classList.toggle("hidden", expr !== "sleep" || !!away || !here);
  $("petDream").classList.toggle("hidden", expr !== "sleep" || !!away || !here);
  if (expr === "sleep" && !$("petDream").textContent) $("petDream").textContent = dreamText();
  $("petFlies").classList.toggle("hidden", !extra.dirty || !!away || !here);
  $("petCoins").textContent = "🪙 " + coinsOf(p);
  $("petLvl").textContent = "Nv. " + I.L.l;
  $("petWx").classList.toggle("hidden", !WX);
  if (WX) $("petWx").textContent = `${({ clear: WX.isDay ? "☀️" : "🌙", cloud: "⛅", rain: "🌧️", storm: "⛈️", snow: "🌨️", fog: "🌫️" })[wk] || "🌡️"} ${WX.temp}°`;
  // carta que trae el pollito
  const post = p.post, forMe = post && post.to === who && !post.read, replyForMe = post && post.from === who && post.reply && !post.replyRead;
  $("petPost").classList.toggle("hidden", !(forMe || replyForMe) || !!away);
  renderGiftBtn(p);

  $("petName").innerHTML = esc(p.name || "Pollito") + (p.sex ? " " + sxTag(p.sex) : "");
  const tt = TITLES[p.title]; $("petTitle").textContent = tt ? "« " + tt[1] + " »" : ""; $("petTitle").classList.toggle("hidden", !tt || si === 0);
  $("petFrame").className = "pframe fr-" + (p.frame || "ninguno");
  $("petMood").textContent = stageName(si, p.species) + " · " + (away ? `Está de excursión en ${away.n} ${away.e}` : moodText(I)) + (si && !away && here ? ` · 📍 ${LOCE[petLoc(p, I)]} ${LOCN[petLoc(p, I)]}` : "");
  const tr = TRAITS[p.trait], spc = SPECIES[p.species || "pollito"];
  $("petTrait").innerHTML = si > 0 && tr ? `${(p.species || "pollito") === "pollito" ? "" : spc.e + " " + spc.n + " · "}${tr.e} ${tr.n} <small>· ${esc(tr.d)}</small>` : si === 0 && p.species && p.species !== "pollito" ? `Huevo de ${spc.n.toLowerCase()} ${spc.e}` : "";
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
  $("petNext").textContent = nx ? `${p.xp} días cuidándole juntos · faltan ${nx.xp - p.xp} para la fase «${stageName(si + 1, p.species)}»` : "¡Fase máxima! 👑";
  $("lvlBar").style.width = Math.round(I.L.into / I.L.need * 100) + "%";
  $("lvlTxt").textContent = I.L.max ? "¡Nivel máximo! 👑" : `Nivel ${I.L.l} · ${I.L.into}/${I.L.need} de experiencia · cada nivel +20 🪙 y un premio en el camino ⭐`;
  const streakAlive = p.lastBoth && daysBetween(p.lastBoth, I.today) <= 1;
  const age = p.hatchedAt > 1e12 ? Math.floor((Date.now() - p.hatchedAt) / DAY) : null;
  $("stDays").textContent = p.xp; $("stStreak").textContent = streakAlive ? p.streak : 0; $("stHugs").textContent = p.hugs || 0; $("stAge").textContent = age === null ? "—" : age;
  $("stages").innerHTML = STAGES.map((s, k) => `<span class="${k <= si ? "on" : ""}" title="${esc(stageName(k, p.species))}">${k <= si ? stageEmoji(k, p.species) : "?"}<small>${s.xp}</small></span>`).join("");
  renderAlbum(p, color, wear);
  renderShop(p, I);
  renderMissions(p, I); renderLevels(p, I); renderAdventures(p, I); renderFirsts(p); renderWords(p); renderCollections(p); renderGamesPet(p); renderFamily(p, I); renderLove(p, I); renderTree(p);
  $("dotPet").classList.toggle("hidden", I.meT && !I.sick && I.nv.food >= 30 && !(forMe || replyForMe) && !missionsClaimable(p) && !(p.trip && tripBack(p)));

  if (si > 0 && !p.sick && !setOn(p, "lluvia") && I.low >= 2 && sickChecked !== I.today && Date.now() - (p.curedAt || 0) > 12 * 36e5) { sickChecked = I.today; petTx(q => { if (q.sick) return null; q.sick = true; q.sickAt = Date.now(); firstMark(q, "sick"); return q; }).then(r => { if (r) sendMsg(`🤒 ${r.name || "El pollito"} se ha puesto malito. Necesita medicina 💊`, "pet"); }).catch(() => {}); }
  if (I.bd && !(p.bday || {})[I.bd.key] && bdayChecked !== I.bd.key) {
    bdayChecked = I.bd.key; const gift = I.bd.years ? 200 : 30;
    petTx(q => { q.bday = q.bday || {}; if (q.bday[I.bd.key]) return null; q.bday[I.bd.key] = true; q.coins += gift; firstMark(q, "bday"); return q; })
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
  const seed = hashStr(dayKey()); return pool.map(it => ({ it, k: hashStr(it.id + seed) })).sort((a, b) => a.k - b.k).slice(0, 3).map(x => ownKey(x.it));
}
const priceOf = (it, offers) => { const k = ownKey(it); let c = FLASH && FLASH === k ? Math.round(it.c * 0.5) : offers.includes(k) ? Math.round(it.c * 0.7) : it.c; if (setOn(state.pet, "elegante")) c = Math.round(c * .9); return c; };
const pvIds = () => (preview ? preview.ids : []);
const sameSlot = (a, b) => (a.slot && a.slot === b.slot) || (a.cat === "color" && b.cat === "color") || (a.cat === "lugar" && b.cat === "lugar") || (a.cat === "casa" && b.cat === "casa" && a.kind === b.kind && a.kind !== "furn");
let shopSlot = ls.get("shopSlot") || "all";
const SLOTS = [["head", "Cabeza"], ["face", "Cara"], ["neck", "Cuello"], ["body", "Cuerpo"], ["feet", "Pies"], ["hand", "En la mano"], ["back", "Espalda"]];
function placeFurn(q, it, on) {
  q.rooms = q.rooms || {}; const rm = roomOf(q, curRoom);
  if (it.kind === "wall") rm.wall = it.id; else if (it.kind === "floor") rm.floor = it.id; else rm.items = { ...rm.items, [it.id]: on };
  q.rooms[curRoom] = rm;
}
const effText = e => Object.entries(e).map(([k, v]) => k === "cure" ? "cura la enfermedad" : `${v > 0 ? "+" : ""}${v} ${({ food: "hambre", love: "cariño", fun: "diversión", clean: "limpieza", energy: "energía" })[k]}`).join(", ");

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
let lastTouch = 0; document.addEventListener("pointerdown", () => { lastTouch = Date.now(); }, true);
function say(t, ms = 3200) { if (state.pet && hatched() && Date.now() - lastTouch > 4000 && typeof currentExpr === "function" && currentExpr(petInfo()) === "sleep" && !/^(Zzz|\*ronq|💤|🔊)/.test(t)) return; if (typeof locHere === "function" && state.pet && hatched() && !tripAway(state.pet) && !locHere()) return; const b = $("petSay"); b.classList.remove("ask"); b.textContent = t; b.classList.remove("hidden"); b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; clearTimeout(say.t); say.t = setTimeout(() => b.classList.add("hidden"), ms); }
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
  if (state.main.next && state.main.next > Date.now()) { const d = calDays(state.main.next); L.push(`¡Faltan ${d} día${d === 1 ? "" : "s"} para que os veáis! ✈️`); }
  return rnd(L);
}
const petTx = fn => S.tx("state/pet", p => fn(ensureDay(p || newPet())));
const hatched = () => stageOf((state.pet || {}).xp || 0) > 0;
let lvlToast = l => { if (l) { const R = LV_REWARDS[l] || {}; setTimeout(() => { confetti(); say(`¡He subido a nivel ${l}! 🎉${R.s ? ` ¡He aprendido a ${SKILLS[R.s][2].toLowerCase()} ${SKILLS[R.s][1]}!` : " Hay premio en el camino ⭐"}`, 4500); }, 900); sendMsg(`⭐ ¡${(state.pet || {}).name || "El pollito"} ha subido a nivel ${l}! Premio: ${lvText(l)}`, "pet"); } };

// Comer (el cuidado diario de cada uno: hace crecer al pollito)
$("petFeed").onclick = () => {
  petHome();
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
  petHome();
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
  hugSignal();
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
  petHome();
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
  petHome();
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
  if (tripAway(I.p) || editMode || !locHere()) return;
  sleepPose(ex);
  if (ex !== "sleep" && lifeTick(I, ex)) return;
  if (petPose) return;
  if (petWander(I, ex)) return;
  if (ex === "sleep") { if (Math.random() < .15) say(rnd(["Zzz…", "*ronquidito*", "💤"]), 1800); return; }
  const r = Math.random();
  if (r < .3) anim(Math.random() < .5 ? "lookl" : "lookr", 1400);
  else if (r < .45) anim("hopsm", 700);
  else if (r < .55) anim("flap", 900);
  else if (r < .63 && (ex === "tired" || ex === "bored")) { say("*bosteza* 🥱", 2000); anim("yawn", 1500); }
  else if (r < .73) say(phrase());
  else if (r < .78 && ex === "hungry") say("Grrr… mi tripita 🍽️", 2000);
  else if (r < .84) maybeAsk();
}, 4500);
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
    const html = phOf(m) ? `<div class="pin ${m.from}"><div class="ph" style="background-image:url('${phOf(m)}')"></div></div>` : `<div class="pin ${m.from} nophoto">💗</div>`;
    const icon = L.divIcon({ html, className: "", iconSize: [40, 47], iconAnchor: [20, 46], popupAnchor: [0, -42] });
    const when = new Date(m.taken || m.at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    L.marker([m.lat, m.lng], { icon }).addTo(memLayer).bindPopup(
      `<div class="pop">${phOf(m) ? `<img src="${phOf(m)}">` : ""}<b>📍 ${esc(m.place || "")}</b>${m.text ? `<p>${esc(m.text)}</p>` : ""}<small>${esc(name(m.from))} · ${when}</small></div>`, { maxWidth: 240, minWidth: 200 });
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
  addMemory(d);
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
    ${phOf(m) ? `<img src="${phOf(m)}" alt="" loading="lazy" data-full="${esc(m.id)}">` : ""}
    ${m.text ? `<div class="text">${esc(m.text)}</div>` : ""}
    ${typeof m.lat === "number" ? `<button class="memplace" data-go="${esc(m.id)}">📍 ${esc(m.place || "Ver en el mapa")}</button>` : `<button class="memplace add" data-add="${esc(m.id)}">📍 Añadir lugar</button>`}
    </div>`).join("") : '<div class="empty">Aún no hay recuerdos. Guardad el primero ✨</div>';
  $("memories").querySelectorAll(".del").forEach(b => b.onclick = () => { if (confirm("¿Borrar este recuerdo?")) { const m = memList.find(x => x.id === b.dataset.id); S.del("memories/" + b.dataset.id); if (m && m.pid) S.del("photos/" + m.pid); } });
  $("memories").querySelectorAll("img[data-full]").forEach(im => im.onclick = () => { const m = memList.find(x => x.id === im.dataset.full); if (!m) return; fullPhoto(m).then(src => readView({ icon: "📸", title: m.place || "Recuerdo", sub: `${name(m.from)} · ${fmtDate(m.taken || m.at, { day: "numeric", month: "long", year: "numeric" })}`, text: m.text || "", img: src })); });
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
  if (S.demo || !srvUrl() || !CONFIG.vapidPublic) return "off";
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
  if (!srvUrl() || !sub || !sub.endpoint) return null;
  try {
    const r = await fetch(srvUrl(), { method: "POST", headers: { "Content-Type": "application/json" },
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
  const el = (t - fg.t0) / 1000; fg.left = Math.max(0, 30 + (fg.bonusT || 0) - el);
  fg.parts = fg.parts || []; fg.combo = fg.combo || 0; fg.tt = el;
  fg.spawn -= dt; const rate = 0.55 - Math.min(0.3, el * 0.01);
  if (fg.spawn <= 0) {
    fg.spawn = rate; let it = fgPick();
    const r = Math.random(); if (r < .035) it = { e: "🧲", v: 0, pw: "mag" }; else if (r < .06) it = { e: "⏰", v: 0, pw: "time" }; else if (r < .085) it = { e: "🌈", v: 0, pw: "x2" };
    fg.items.push({ ...it, x: 20 + Math.random() * (fg.W - 40), y: -20, vy: 160 + el * 6 + Math.random() * 60, rot: Math.random() * 6, vr: (Math.random() - .5) * 3 });
  }
  const cy = fg.H - 70, now = performance.now();
  fg.items.forEach(o => {
    o.y += o.vy * dt; o.rot += o.vr * dt;
    if (fg.mag > now && o.v > 0) o.x += (fg.x - o.x) * Math.min(1, dt * 4);
    if (!o.hit && o.y > cy - 34 && o.y < cy + 18 && Math.abs(o.x - fg.x) < 40) {
      o.hit = true;
      if (o.pw) {
        if (o.pw === "mag") { fg.mag = now + 5000; fg.flash = { txt: "🧲 ¡Imán!", t: 1 }; }
        if (o.pw === "time") { fg.bonusT = (fg.bonusT || 0) + 5; fg.flash = { txt: "⏰ +5 s", t: 1 }; }
        if (o.pw === "x2") { fg.x2 = now + 8000; fg.flash = { txt: "🌈 ¡Puntos x2!", t: 1 }; }
        SFX.ding(); mgBurst(fg.parts, o.x, o.y, ["✨", "⭐", "💫"], 10); fg.squish = .25; return;
      }
      if (o.v > 0) { fg.combo++; const mult = (fg.combo >= 10 ? 3 : fg.combo >= 5 ? 2 : 1) * (fg.x2 > now ? 2 : 1); const pts = o.v * mult; fg.score += pts; fg.flash = { v: pts, t: .6, mult }; SFX.pop(); mgBurst(fg.parts, o.x, o.y, ["✨", o.e, "💖"], 6); if (fg.combo === 5 || fg.combo === 10) { SFX.ding(); fg.flash = { txt: `¡Combo x${fg.combo >= 10 ? 3 : 2}! 🔥`, t: 1.1 }; } }
      else { fg.combo = 0; fg.score = Math.max(0, fg.score + o.v); fg.flash = { v: o.v, t: .6 }; SFX.fail(); fg.shake = .3; mgBurst(fg.parts, o.x, o.y, ["💨", "🔥"], 6); }
      fg.squish = .2; buzz(o.v > 0 ? 15 : [30, 20, 30]);
    }
    if (!o.hit && o.y > fg.H + 10 && o.v > 0) fg.combo = 0;
  });
  fg.items = fg.items.filter(o => !o.hit && o.y < fg.H + 30);
  if (fg.flash) fg.flash.t -= dt; if (fg.squish) fg.squish = Math.max(0, fg.squish - dt); if (fg.shake) fg.shake = Math.max(0, fg.shake - dt);
  if (fg.left <= 5 && Math.ceil(fg.left) !== fg.lastTick) { fg.lastTick = Math.ceil(fg.left); if (fg.left > 0) SFX.tap(); }
  $("fgScore").textContent = "🍓 " + fg.score + (fg.combo >= 5 ? ` 🔥x${fg.combo >= 10 ? 3 : 2}` : ""); $("fgTime").textContent = "⏱ " + Math.ceil(fg.left);
  fgDraw(dt);
  if (fg.left <= 0) return fgEnd();
  fg.raf = requestAnimationFrame(fgLoop);
}
function fgDraw(dt = 0) {
  const { ctx, W, H } = fg, now = performance.now(), t = fg.tt || now / 1000;
  ctx.save(); if (fg.shake) ctx.translate((Math.random() - .5) * 10 * fg.shake / .3, 0);
  mgSky(ctx, W, H, "#7ec8ff", "#d8f1ff", t);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const o of fg.items) {
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.pw ? 0 : Math.sin(o.rot) * .4);
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.beginPath(); ctx.ellipse(3, 18, 12, 4, 0, 0, 7); ctx.fill();
    if (o.pw) { ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.beginPath(); ctx.arc(0, 0, 22 + Math.sin(now / 150) * 2, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#000"; ctx.font = "32px system-ui, Apple Color Emoji, Segoe UI Emoji"; ctx.fillText(o.e, 0, 0); ctx.restore();
  }
  const cy = fg.H - 70, x = fg.x, sq = 1 + (fg.squish || 0) * .6;
  ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.beginPath(); ctx.ellipse(x, cy + 44, 34, 8, 0, 0, 7); ctx.fill();
  if (fg.mag > now) { ctx.strokeStyle = "rgba(255,92,138,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, cy, 60 + Math.sin(now / 90) * 4, 0, 7); ctx.stroke(); }
  mgPet(ctx, x, cy + 18, 104, fg.run ? (fg.flash && fg.flash.t > 0 && fg.flash.v < 0 ? "sad" : "laugh") : "happy", 0, sq);
  mgParts(ctx, fg.parts || [], dt);
  if (fg.flash && fg.flash.t > 0) {
    ctx.font = "900 24px system-ui"; ctx.lineWidth = 5; ctx.strokeStyle = "#fff";
    const txt = fg.flash.txt || ((fg.flash.v > 0 ? "+" : "") + fg.flash.v + (fg.flash.mult > 1 ? ` (x${fg.flash.mult})` : "")), yy = cy - 70 - (1 - fg.flash.t) * 30;
    ctx.fillStyle = fg.flash.txt ? "#7b2ff7" : fg.flash.v > 0 ? "#1f8a4c" : "#d0304a"; ctx.strokeText(txt, x, yy); ctx.fillText(txt, x, yy);
  }
  if (fg.run && fg.left <= 5) { ctx.font = "900 64px system-ui"; ctx.fillStyle = "rgba(255,92,138," + (.25 + (fg.left % 1) * .5) + ")"; ctx.fillText(Math.ceil(fg.left), W / 2, H * .35); }
  if (fg.x2 > now) { ctx.font = "800 15px system-ui"; ctx.fillStyle = "#7b2ff7"; ctx.fillText("🌈 x2", 40, 20); }
  ctx.restore();
}
function fgEnd() {
  fg.run = false; cancelAnimationFrame(fg.raf);
  const score = fg.score; let gain = 0, prevOther = 0, prevMine = 0;
  petTx(p => { p.day.game = p.day.game || {}; const got = p.day.game[who] || 0; const gm = setOn(p, "vaquero") || setOn(p, "musico") ? 1.5 : 1; gain = Math.max(0, Math.min(Math.floor(score / 2 * gm), Math.round(30 * gm) - got)); p.day.game[who] = got + gain; p.coins += gain; p.best_game = Math.max(p.best_game || 0, score); prevOther = (p.best_by || {})[other()] || 0; prevMine = (p.best_by || {})[who] || 0; p.best_by = { ...(p.best_by || {}), [who]: Math.max(prevMine, score) }; bump(p, "game"); return p; })
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
  { id: "scratch", e: "🎟️", n: "Rasca y gana" }, { id: "shop", e: "🛍️", n: "Tienda de vales" }, { id: "wheel", e: "🎯", n: "Ruleta" },
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
  const photos = memList.filter(m => phOf(m)).map(m => phOf(m)).sort(() => Math.random() - .5).slice(0, 6);
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
  $("mmBest").textContent = `🏆 Récords: ${["a", "b"].map(w => `${name(w)} ${b[w] ? b[w].moves + " mov." : "—"}`).join(" · ")}` + (memList.some(m => phOf(m)) ? "" : " · Sube fotos en Recuerdos y saldrán aquí 📸");
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
  $("sServer").value = srvUrl(); $("sServer").disabled = !!CONFIG.pushUrl;
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
  const nv = v ? new Date(v).getTime() : null;
  if (nv !== (state.main.next || null)) {
    if (nv && nv < Date.now() + 10 * 6e4) { toast("Esa fecha ya ha pasado: elige cuándo os veis ✈️"); $("sNext").focus(); return; }
    S.merge("state/main", nv ? { next: nv, nextSet: Date.now() } : { next: null, nextSet: null });
  }
  const sv = $("sServer").value.trim().replace(/\/+$/, "");
  if (!CONFIG.pushUrl && sv !== ((state.main || {}).server || "")) {
    if (sv && !/^https:\/\/[^\s]+$/.test(sv)) { toast("La dirección del servidor tiene que empezar por https://"); return; }
    S.merge("state/main", { server: sv }); state.main.server = sv; renderPush();
    if (sv) fetch(sv).then(r => r.text()).then(t => toast(/IA conectada/.test(t) ? "✅ Servidor conectado · avisos e IA listos 🐤" : /funcionando/.test(t) ? "✅ Servidor conectado · falta enlazar la IA en Cloudflare" : "⚠️ Esa dirección no parece el servidor", 4500)).catch(() => toast("⚠️ No he podido conectar con esa dirección", 4500));
  }
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
      $("lgErr").style.color = ""; $("lgErr").textContent = "Un momento…"; res({ email, pass, mode });
    };
    $("lgIn").onclick = () => go("in"); $("lgNew").onclick = () => go("new");
    $("lgForgot").onclick = async () => {
      const email = $("lgEmail").value.trim().toLowerCase(), e = $("lgErr");
      if (!email) { e.textContent = "Escribe arriba tu email y vuelve a pulsar aquí"; $("lgEmail").focus(); return; }
      if (!allowed.includes(email)) { e.textContent = "Este email no está invitado 🙈"; return; }
      e.textContent = "Enviando…";
      try { await S.resetPassword(email); e.style.color = "#b8f5c8"; e.textContent = `📩 Te hemos mandado un email a ${email} para elegir una contraseña nueva. Si no lo ves, mira en spam.`; }
      catch (er) { e.style.color = ""; e.textContent = er && er.code === "auth/user-not-found" ? "Ese email aún no tiene cuenta: pulsa «crear cuenta»" : er && er.code === "auth/network-request-failed" ? "Sin conexión a internet 📶" : er && er.code === "auth/too-many-requests" ? "Demasiados intentos, espera un poco" : "No se pudo enviar el email, prueba otra vez"; }
    };
  });
}

const APP_VERSION = "2.0";
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
function watchDiary() { if (dyUn) dyUn(); dyUn = S.watchCol("diary", l => { diary = l; diaryLoaded = true; renderDiary(); renderHome(); petDiaryCheck(); setTimeout(() => weeklyCheck().catch(e => console.warn(e)), 1500); }, dyLimit); }
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
  const past = diary.filter(x => (x.date || x.id) !== k && (x.a || x.b || x.pet)).sort((a, b) => ((b.date || b.id) > (a.date || a.id) ? 1 : -1));
  $("dyList").innerHTML = past.length ? past.map(x => { const kk = x.date || x.id; return `<div class="dday"><div class="dyhead">${dyHead(kk)}</div>${[who, other()].filter(w => x[w]).map(w => dyEntry(x, w, kk, w === who, true)).join("")}${x.pet ? dyPet(x) : ""}</div>`; }).join("") : `<div class="empty">Aquí irá quedando vuestra historia, día a día 💞</div>`;
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
    if (k.slice(5) === md && t.getFullYear() < y) { const n = y - t.getFullYear(); out.push({ pri: 86, ic: "📸", t: `Hoy hace ${n} año${n > 1 ? "s" : ""}…`, s: m.place ? `Estabais en ${m.place} 📍` : m.text || "Un recuerdo vuestro", img: phOf(m), m, when: t }); continue; }
    const ago = Math.round((t0 - new Date(k + "T00:00:00")) / DAY);
    if (ago > 0 && (ago === 30 || ago % 100 === 0)) out.push({ pri: 82, ic: "📸", t: `Hace ${ago} días…`, s: m.place ? `Estabais en ${m.place} 📍` : m.text || "Un recuerdo vuestro", img: phOf(m), m, when: t });
  }
  for (const [yy, d] of Object.entries(otd)) if (d && (d.a || d.b)) { const n = y - +yy, e = d[other()] || d[who]; out.push({ pri: 84, ic: "📖", t: `Hoy hace ${n} año${n > 1 ? "s" : ""} escribisteis…`, s: e.text || "", img: (d.a && d.a.photo) || (d.b && d.b.photo) || "", dy: d }); }
  if (out.length) return (flashCache = out.sort((a, b) => b.pri - a.pri)[0]);
  const ph = memList.filter(m => phOf(m)); if (!ph.length) return (flashCache = null);
  const m = ph[hashStr(today) % ph.length], t = new Date(m.taken || m.at);
  return (flashCache = { pri: 24, ic: "📸", t: "¿Os acordáis?", s: `${fmtDate(t, { day: "numeric", month: "long", year: "numeric" })}${m.place ? " · " + m.place : ""}`, img: phOf(m), m, when: t });
}
function openFlash() {
  const f = flashCache; if (!f) return;
  if (f.dy) { const d = f.dy; readView({ icon: "📖", title: f.t, sub: fmtDate(new Date(d.date + "T12:00:00"), { day: "numeric", month: "long", year: "numeric" }), text: ["a", "b"].filter(w => d[w]).map(w => `${name(w)} ${d[w].mood || ""}\n${d[w].text || ""}`).join("\n\n"), img: (d.a && d.a.photo) || (d.b && d.b.photo) || "" }); return; }
  const m = f.m;
  readView({ icon: "📸", title: f.t, sub: `${fmtDate(f.when, { day: "numeric", month: "long", year: "numeric" })}${m.place ? " · 📍 " + m.place : ""}`, text: m.text || "", img: phOf(m), nav: typeof m.lat === "number" ? `<button class="btn" id="flMap">📍 Ver en el mapa</button>` : "" });
  if (m.pid) fullPhoto(m).then(src => { if (src && !$("readView").classList.contains("hidden")) $("rvImg").src = src; });
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
  if (partnerOnline()) add(93, "🟢", `${o} está en la app ahora mismo`, "Id los dos a la mascota y hacedle mimos a la vez: ¡abrazo doble! 🤗", "pet");
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
  if (pendingWord(p)) add(78, "🗣️", `${pn} ha aprendido algo para ti`, `${o} le ha enseñado una frase… ve a escucharla 🤫`, "pet");
  for (const [k, f] of Object.entries(p.firsts || {})) if (f.by === other() && now - f.at < DAY && FIRSTM[k]) add(55, FIRSTM[k][1], `¡Primera vez! ${FIRSTM[k][2]}`, `con ${o}${f.info ? " · " + f.info : ""}`, "pet");
  const gifts = petGifts(p, I, false); if (gifts.length && I.si) add(70, "🎁", `${pn} tiene algo para vosotros`, joinY(gifts), "petgift");
  if (p.streak >= 2 && p.lastBoth && daysBetween(p.lastBoth, I.today) <= 1) add(30, "🔥", `Lleváis ${p.streak} días seguidos cuidándole juntos`, I.meT && I.otT ? "¡Hoy también! 💞" : "Que no se rompa la racha", "pet");
  // vernos
  const nx = state.main.next;
  if (nx) { const d = calDays(nx); if (nx <= now && now - nx < DAY) add(99, "🥹", "¡Hoy os veis!", "", null); else if (d > 0 && d <= 60) add(d <= 7 ? 72 : 44, "✈️", d === 1 ? "¡Mañana os veis!" : `Faltan ${d} días para veros`, fmtDate(nx, { weekday: "long", day: "numeric", month: "long" }), null); }
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
  // v38: regalo, carta semanal, juego en directo y nuestro año
  const gft = giftsFor(p, who)[0]; if (gft) add(92, "🎁", `${name(gft.from)} te ha hecho un regalo`, `${pn} lo tiene envuelto para ti · ábrelo 🤫`, "gift");
  const wkN = (weeklies || []).find(w => !ls.get("wkRead:" + w.wk)); if (wkN) add(87, "💌", `${pn} os ha escrito la carta de la semana`, String(wkN.text).slice(0, 90) + "…", "weekly");
  if (live && liveFresh(live) && live.st === "invite" && live.by !== who) add(98, "🎮", `${o} te invita a jugar en directo`, "¡Entra ya a la partida!", "live");
  if (CONFIG.start) { const dd = Math.floor((now - new Date(CONFIG.start + "T00:00:00")) / DAY); if (dd >= 365 && dd % 365 <= 30 && !ls.get("wrapSeen")) add(94, "🎉", `¡Vuestro ${dd < 730 ? "primer año" : Math.floor(dd / 365) + "º año"} en números!`, "Mirad todo lo que habéis vivido juntos", "wrap"); }
  items.sort((a, b) => b.pri - a.pri);
  const list = items.slice(0, 6); drawHome.list = list;
  $("feed").innerHTML = list.length ? list.map((it, i) => `<button class="fitem ${it.pri >= 80 ? "hot" : ""} ${it.img ? "wimg" : ""}" data-i="${i}">${it.img ? `<span class="fimg" style="background-image:url('${it.img}')"></span>` : `<i>${it.ic}</i>`}<div><b>${esc(it.t)}</b>${it.s ? `<small>${esc(String(it.s).slice(0, 120))}</small>` : ""}</div>${it.act ? `<span class="go">›</span>` : ""}</button>`).join("") : `<div class="empty">Todo al día 💕</div>`;
  $("feed").querySelectorAll("[data-i]").forEach(b => b.onclick = () => feedAct(list[+b.dataset.i].act));
}
$("btnSurprise").onclick = openSurprise; $("btnWrap").onclick = openWrapped; $("btnBook").onclick = openBook;
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
  else if (act === "gift") { const g = giftsFor(p, who)[0]; if (g) openGift(g.id); }
  else if (act === "weekly") openWeekly((weeklies || []).find(w => !ls.get("wkRead:" + w.wk)));
  else if (act === "live") liveTx(x => (x.st === "invite" ? { ...x, st: "play", at: Date.now() } : null)).catch(offline);
  else if (act === "wrap") openWrapped();
  else if (act === "hug") { sendMsg("🤗 Te mando un abrazo muy fuerte, todo va a ir bien 💗", "think"); toast("Mimo enviado 💗"); }
}

// ---------- Personalidad del pollito ----------
const joinY = a => (a.length > 1 ? a.slice(0, -1).join(", ") + " y " + a[a.length - 1] : a[0] || "");
function logEv(q, k) {
  const L = (q.log || []).slice(-59), last = L[L.length - 1], now = Date.now();
  if (last && last.w === who && last.k === k && now - last.at < 20 * 6e4) L[L.length - 1] = { ...last, n: (last.n || 1) + 1, at: now };
  else L.push({ w: who, k, at: now, n: 1 });
  q.log = L; firstMark(q, k);
}
const EV_TXT = {
  feed: () => "me ha dado de comer 🍓", hug: n => (n > 1 ? `me ha hecho ${n} mimos` : "me ha hecho un mimito"), play: n => (n > 1 ? `hemos jugado ${n} veces ⚽` : "hemos jugado ⚽"),
  bath: () => "me ha bañado 🛁", nap: () => "me ha puesto a dormir la siesta", bag: () => "me ha dado algo rico de la mochila", buy: () => "me ha comprado cosas 🛍️",
  dress: () => "me ha cambiado de ropa 👗", trip: () => "me ha mandado de excursión", treasure: () => "hemos encontrado un tesoro ✨", game: n => `ha jugado ${n > 1 ? n + " partidas" : "una partida"} a los minijuegos`,
  trick: () => "le he enseñado mis trucos 🎪", post: () => "me ha dado una carta para ti ✉️", teach: () => "me ha enseñado una frase secreta 🤫", talk: () => "ha estado charlando conmigo 💬", gift: () => "ha abierto un regalo 🎁"
};
function petWelcome() {
  const p = state.pet || {}; if (stageOf(p.xp || 0) === 0) return;
  const since = (p.seen || {})[who] || 0, o = name(other()), me = name(who);
  const agg = {}; (p.log || []).filter(e => e.w === other() && e.at > since).forEach(e => { agg[e.k] = (agg[e.k] || 0) + (e.n || 1); });
  const parts = Object.entries(agg).map(([k, n]) => (EV_TXT[k] ? EV_TXT[k](n) : null)).filter(Boolean);
  if (parts.length) { say(`¡Hola ${me}! Mientras no estabas, ${o} ${joinY(parts.slice(0, 3))} 🥰`, 6500); react("happy", 2500); }
  else say(phrase());
  if (Date.now() - since > 10 * 6e4) S.merge("state/pet", { seen: { [who]: Date.now() } });
  const pw = pendingWord(p); if (pw) setTimeout(() => sayWord(pw), parts.length ? 6800 : 500); else setTimeout(() => maybeAsk(), parts.length ? 7000 : 3800);
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
  (p.words || []).filter(w => w.said && w.from === other()).slice(-3).forEach(w => L.push(`${o} me enseñó a decir: «${w.text}» 💛`));
  if ((p.words || []).some(w => w.from === who && w.said)) L.push(`Ya le dije a ${o} lo que me enseñaste 🤫`);
  if (!(p.words || []).length) L.push("¿Me enseñas a decir algo bonito? 🗣️");
  return L;
}
function maybeAsk(force) {
  const pw = pendingWord(state.pet); if (pw && sayWord(pw)) return;
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


// =====================================================================
//   v33 · Mascota viva: se mueve y usa los muebles, nota cuando estáis
//         los dos (abrazo doble), escribe su diario, fotos y tutorial
// =====================================================================
// ---------- Moverse por la escena ----------
let petX = 50, walkT = 0, petBusyUntil = 0;
function petPlace(x, ms) {
  const box = $("petBox"); x = Math.max(24, Math.min(76, x));
  const dx = x - petX; if (Math.abs(dx) < 1) return 0;
  const dur = ms != null ? ms : Math.min(3400, Math.round(Math.abs(dx) * 60));
  box.style.transition = dur ? `left ${dur}ms cubic-bezier(.42,0,.38,1)` : "none";
  if (petPose && petPose !== "bed") setPose("");
  box.classList.toggle("flip", dx < 0); if (dur > 400) { box.classList.add("walking"); crewWalk(dx, dur); }
  box.style.left = x + "%"; petX = x; $("petScene").style.setProperty("--px", x + "%");
  clearTimeout(walkT); walkT = setTimeout(() => box.classList.remove("walking", "flip"), dur + 30);
  return dur;
}
function petHome(instant) { petBusyUntil = 0; if (typeof setPose === "function") setPose(""); petPlace(50, instant ? 0 : 350); }
const USE = {
  sofa: ["Qué cómodo es el sofá… 🛋️", "Me quedaría aquí toda la tarde 😌"], tele: ["📺 ¡Mis dibujos favoritos!", "¿Vemos una peli juntos? 🍿"], pecera: ["¡Hola, pececito! 🐠", "Blub, blub 🫧"],
  fogon: ["¡Qué bien huele! 🍳", "¿Cocinamos algo rico?"], frutero: ["¿Me como una manzana? 🍎"], piano: ["🎵 Do, re, mi… 🎹"], estanteria: ["Estoy leyendo un cuento 📚"],
  espejo: ["¡Qué guapo estoy hoy! 🪞"], cama: ["Me echaría una siesta… 🛏️"], planta: ["¡Mi planta ha crecido! 🌱"], girasol: ["Los girasoles miran al sol ☀️"], piscina: ["¡Al agua, patos! 💦"],
  fuente: ["¡Me mojo las plumas! ⛲"], sombrilla: ["Qué fresquito a la sombra ⛱️"], globos: ["¡Globos! 🎈"], cuadro: ["Me encanta esta foto vuestra 💕"], ventana: ["Mirando por la ventana… ¿vendrá alguien? 🪟"],
  arbolnav: ["¡Ya viene Papá Noel! 🎄"], tetera: ["¿Un té calentito? 🫖"], lampara: ["Qué luz tan bonita 💡"], alfombra: ["¡Voy a rodar por la alfombra! 🌀"], velas: ["Qué romántico… 🕯️"], reloj: ["Tic, tac… ¿cuánto falta para que os veáis? 🕰️"]
};
const USE_FX = { tele: "📺", pecera: "🫧", fogon: "🍳", frutero: "🍎", piscina: "💦", fuente: "💧", globos: "🎈", espejo: "✨", cama: "💤", sofa: "💤", tetera: "☕", velas: "✨", alfombra: "🌀" };
const OUT_SAY = { jardin: ["¡Mira, una flor! 🌸", "Qué bien huele el césped 🌿"], playa: ["¡Qué agua tan buena! 🌊", "Voy a hacer un castillo de arena 🏰"], bosque: ["¡Una mariposa! 🦋", "Aquí hay setas 🍄"],
  nieve: ["¡Guerra de bolas! ❄️", "Brrr, qué frío 🥶"], montana: ["¡Qué vistas! ⛰️", "Hola, eco… ¡eco! 🗣️"], ciudad: ["¡Cuánta gente! 🏙️", "Cuidado con los coches 🚗"], mar: ["Blub, blub 🫧", "¡Un pez me ha saludado! 🐠"],
  espacio: ["¡Estoy flotando! 🚀", "Hola, marcianos 👽"], amor: ["Aquí todo huele a amor 💕", "¡Corazones por todas partes! 💖"] };
function petWander(I, ex) {
  if (Date.now() < petBusyUntil) return true;
  const p = I.p;
  if (petView === "in") {
    const room = roomOf(p, curRoom), ids = Object.keys(room.items || {}).filter(k => room.items[k] && FA[k]);
    if (ex === "sleep") { if (room.items.cama) { const x = furnPos(room, "cama").x; if (Math.abs(petX - Math.max(24, x)) > 3) petPlace(x); } return false; }
    if (Math.random() > .45) return false;
    const pick = ids.length && Math.random() < .75 ? rnd(ids) : null, x = pick ? furnPos(room, pick).x : 25 + Math.random() * 50;
    const dur = petPlace(x); petBusyUntil = Date.now() + dur + 2600;
    if (pick) setTimeout(() => {
      if (petView !== "in" || $("tab-pet").classList.contains("hidden")) return;
      say(rnd(USE[pick] || ["¡Qué bonito! ✨"]), 2600);
      if (USE_FX[pick]) fx("burst", USE_FX[pick], `left:${petX}%;top:38%`, 1300);
      if (pick === "piano") for (let i = 0; i < 5; i++) setTimeout(() => fx("note", rnd(["🎵", "🎶"]), `left:${petX - 8 + Math.random() * 16}%`), i * 220);
    }, dur + 100);
    return true;
  }
  if (ex === "sleep" || Math.random() > .4) return false;
  const dur = petPlace(28 + Math.random() * 44); petBusyUntil = Date.now() + dur + 1500;
  if (Math.random() < .5) setTimeout(() => { if (!$("tab-pet").classList.contains("hidden")) say(rnd(OUT_SAY[p.scene || "jardin"] || OUT_SAY.jardin), 2400); }, dur + 100);
  return true;
}

// ---------- Los dos a la vez: presencia y abrazo doble ----------
let pres = {}, presOn = false, dhShown = 0;
const partnerOnline = () => Date.now() - ((pres || {})[other()] || 0) < 75000;
function beat() { if (!document.hidden) S.merge("state/presence", { [who]: Date.now() }); }
function watchPresence() {
  S.watchDoc("state/presence", d => {
    const was = presOn; pres = d || {}; presOn = partnerOnline();
    if (presOn && !was && !$("tab-pet").classList.contains("hidden") && hatched() && !tripAway(state.pet)) { say(`¡${name(other())} también está aquí! 💞`, 3500); hearts($("petBox"), "💞"); }
    const h = (pres.hug || {})[other()], mine = (pres.hug || {})[who];
    if (h && mine && Math.abs(h - mine) < 15000 && Date.now() - Math.max(h, mine) < 20000) doubleHug();
    renderPresence(); renderHome();
  });
  beat(); setInterval(beat, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
  setInterval(() => { const now = partnerOnline(); if (now !== presOn) { presOn = now; renderPresence(); renderHome(); } }, 15000);
}
function renderPresence() {
  const on = partnerOnline(), o = name(other());
  const b = $("petPartner"); if (b) { b.classList.toggle("hidden", !on); b.innerHTML = `💞 ${esc(o)} está aquí · ¡mimos a la vez!`; }
  const hb = $("hOnline"); if (hb) { hb.classList.toggle("hidden", !on); hb.textContent = `🟢 ${o} está en la app ahora`; }
  if (typeof liveCardOnly === "function") liveCardOnly();
}
function hugSignal() {
  const now = Date.now(), oh = (pres.hug || {})[other()];
  S.merge("state/presence", { [who]: now, hug: { [who]: now } });
  pres.hug = { ...(pres.hug || {}), [who]: now };
  if (oh && now - oh < 15000) doubleHug();
}
function doubleHug() {
  const key = Math.max((pres.hug || {}).a || 0, (pres.hug || {}).b || 0); if (!key || dhShown === key) return; dhShown = key;
  if (!$("tab-pet").classList.contains("hidden")) { confetti(); for (let i = 0; i < 4; i++) setTimeout(() => hearts($("petBox"), rnd(["💞", "🤗", "💗"])), i * 250); react("love", 3200); anim("jump", 1200); }
  say(`¡Abrazo doble! 🤗💞 ${name("a")} y ${name("b")} a la vez`, 4500); buzz([40, 60, 40, 60, 90]);
  let got = false;
  petTx(q => { if (q.day.dh) return null; q.day.dh = Date.now(); q.coins += 30; gainExp(q, 20); setNeed(q, "love", 40); logEv(q, "dhug"); got = true; return q; })
    .then(r => { if (r && got) toast("💞 ¡Primer abrazo doble del día! +30 🪙", 3500); }).catch(() => {});
}

// ---------- Su propio diario: cada noche escribe cómo fue su día ----------
let pdDone = "", diaryLoaded = false;
function petDiaryText(k) {
  const p = state.pet || {}, log = p.log || []; if (stageOf(p.xp || 0) === 0 || !log.length) return null;
  const dayStart = new Date(k + "T00:00:00").getTime(), L = log.filter(e => localKey(new Date(e.at)) === k);
  if (!L.length && log[0].at > dayStart) return null;   // el registro empezó después: no sé qué pasó
  const by = { a: {}, b: {} }; L.forEach(e => { if (by[e.w]) by[e.w][e.k] = (by[e.w][e.k] || 0) + (e.n || 1); });
  const parts = [];
  for (const w of ["a", "b"]) {
    const A = by[w], acts = [];
    if (A.feed) acts.push("me dio de comer"); if (A.hug) acts.push(`me hizo ${A.hug} mimo${A.hug > 1 ? "s" : ""}`); if (A.play) acts.push("jugó conmigo"); if (A.bath) acts.push("me bañó");
    if (A.trip) acts.push("me mandó de excursión"); if (A.dress) acts.push("me vistió muy guapo"); if (A.buy) acts.push("me compró cosas"); if (A.nap) acts.push("me acostó a dormir la siesta");
    if (A.trick) acts.push("vio mis trucos"); if (A.post) acts.push("me dio una carta para llevar"); if (A.game) acts.push("jugó a los minijuegos");
    if (acts.length) parts.push(`${name(w)} ${joinY(acts.slice(0, 4))}`);
  }
  let t = parts.length ? `Hoy ${joinY(parts)}.` : "Hoy nadie vino a verme… os eché mucho de menos 🥺";
  const pcs = Object.entries(p.postcards || {}).filter(([, ts]) => localKey(new Date(ts)) === k).map(([id]) => DESTM[id]).filter(Boolean);
  if (pcs.length) t += ` Volví de ${pcs.map(d => d.n + " " + d.e).join(" y ")}.`;
  if (L.some(e => e.k === "treasure")) t += " ¡Encontré un tesoro! ✨";
  if (L.some(e => e.k === "dhug")) t += " ¡Y me disteis un abrazo doble! 🤗💞";
  if (by.a.feed && by.b.feed) t += " Me cuidasteis los dos 💞";
  if (parts.length) t += ["", " Fue un día feliz 💛", " ¡Qué bien lo pasé! 🐤", " Os quiero mucho 💛"][hashStr(k) % 4];
  return t.trim();
}
function petDiaryCheck() {
  const y = localKey(new Date(Date.now() - DAY)); if (pdDone === y || !state.pet || !diaryLoaded) return; pdDone = y;
  const d = diaryDay(y); if (d && d.pet) return;
  const t = petDiaryText(y); if (!t) return;
  petDiaryAI(y, t).catch(() => null).then(ai => S.tx("diary/" + y, d => { if (d && d.pet) return null; return { ...(d || {}), date: y, at: dayAt(y), pet: { text: ai || t, t: Date.now(), ai: ai ? 1 : 0 } }; })).catch(() => {});
}
function dyPet(d) {
  const p = state.pet || {}, sp = SPECIES[p.species || "pollito"] || SPECIES.pollito;
  return `<div class="dyent pet"><div class="dyw"><b>${sp.e} ${esc(p.name || sp.n)}</b> <small>escribe…</small></div><div class="dytx">${esc(d.pet.text)}</div></div>`;
}

// ---------- Fotos de la mascota ----------
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function sceneCanvas() {
  const sc = $("petScene"), r = sc.getBoundingClientRect(), W = 1080, k = W / r.width, H = Math.round(r.height * k), FOOT = 96;
  const c = document.createElement("canvas"); c.width = W; c.height = H + FOOT; const ctx = c.getContext("2d");
  ctx.fillStyle = "#7ec8ff"; ctx.fillRect(0, 0, W, H);
  if (petView === "in") {
    if (curRoom === "jardin") { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#8fd3ff"); g.addColorStop(.549, "#cdeeff"); g.addColorStop(.55, "#7cc95b"); g.addColorStop(1, "#8fd66c"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = sc.style.getPropertyValue("--wall") || "#f6ead8"; ctx.fillRect(0, 0, W, H * .62); ctx.fillStyle = sc.style.getPropertyValue("--floor") || "#b07a4a"; ctx.fillRect(0, H * .62, W, H * .38); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(0, H * .62 - 9 * k, W, 10 * k); }
  }
  for (const s of sc.querySelectorAll("svg")) {
    const b = s.getBoundingClientRect(); if (!b.width || s.closest(".hidden")) continue;
    const cl = s.cloneNode(true); cl.setAttribute("width", b.width); cl.setAttribute("height", b.height); cl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    try { const img = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(cl))); ctx.drawImage(img, (b.left - r.left) * k, (b.top - r.top) * k, b.width * k, b.height * k); } catch (e) { console.warn(e); }
  }
  const p = state.pet || {}, tt = TITLES[p.title];
  ctx.fillStyle = "#fff"; ctx.fillRect(0, H, W, FOOT);
  ctx.fillStyle = "#3a2330"; ctx.font = "800 40px -apple-system, system-ui, sans-serif"; ctx.textBaseline = "middle"; ctx.fillText(`${p.name || "Pollito"}${tt ? " · " + tt[1] : ""}`, 32, H + FOOT / 2);
  ctx.fillStyle = "#b07a90"; ctx.font = "600 28px -apple-system, system-ui, sans-serif"; ctx.textAlign = "right"; ctx.fillText(`${fmtDate(Date.now(), { day: "numeric", month: "short", year: "numeric" })} · Nosotros ❤️`, W - 32, H + FOOT / 2);
  return c;
}
function scaleCanvas(c, w) { const o = document.createElement("canvas"); o.width = w; o.height = Math.round(c.height * w / c.width); o.getContext("2d").drawImage(c, 0, 0, o.width, o.height); return o; }
async function petPhoto() {
  if (petPhoto.busy) return; petPhoto.busy = true;
  const sc = $("petScene"), fl = document.createElement("div"); fl.className = "shotflash"; sc.appendChild(fl); setTimeout(() => fl.remove(), 600); buzz(30);
  try {
    const c = await sceneCanvas(), url = c.toDataURL("image/jpeg", .86);
    S.add("petpics", { from: who, img: scaleCanvas(c, 720).toDataURL("image/jpeg", .72), at: Date.now() });
    petTx(q => { firstMark(q, "photo"); return q; }).catch(() => {});
    readView({ icon: "📸", title: "¡Qué foto tan bonita!", sub: "Guardada en su álbum · mantén pulsada la foto para guardarla en el móvil", img: url, nav: navigator.share ? `<button class="btn primary" id="picShare">📤 Compartir</button>` : "" });
    const b = $("picShare"); if (b) b.onclick = async () => {
      try { const f = new File([await (await fetch(url)).blob()], "mascota.jpg", { type: "image/jpeg" }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: "Nuestra mascota" }); else await navigator.share({ title: "Nuestra mascota", text: "Mira a nuestra mascota 💛" }); } catch (e) {}
    };
  } catch (e) { console.error(e); toast("No se pudo hacer la foto 😕"); }
  petPhoto.busy = false;
}
$("petCam").onclick = e => { e.stopPropagation(); openCamSheet(); };
let petPics = [];
function watchPetPics() { S.watchCol("petpics", l => { petPics = l; renderPetPics(); }, 30); }
function renderPetPics() {
  const el = $("petPics"); if (!el) return;
  el.innerHTML = petPics.length ? petPics.map(x => `<img src="${x.img}" data-pic="${esc(x.id)}" alt="" loading="lazy">`).join("") : `<div class="empty" style="grid-column:1/-1;font-size:14px">Pulsa 📸 en la escena para hacerle fotos</div>`;
  el.querySelectorAll("[data-pic]").forEach(i => i.onclick = () => {
    const x = petPics.find(y => y.id === i.dataset.pic); if (!x) return;
    readView({ icon: "📸", title: `Foto de ${name(x.from)}`, sub: fmtDate(x.at, { day: "numeric", month: "long", year: "numeric" }), img: x.img, nav: x.from === who ? `<button class="btn" id="picDel">🗑️ Borrar</button>` : "" });
    const d = $("picDel"); if (d) d.onclick = () => { if (confirm("¿Borrar esta foto?")) { S.del("petpics/" + x.id); $("readView").classList.add("hidden"); } };
  });
}

// ---------- Tutorial (la primera vez que entráis) ----------
function tourSteps() {
  const o = esc(name(other())), pn = esc((state.pet || {}).name || "Pollito"), egg = !hatched();
  return [
    ["petBox", `¡Hola, ${esc(name(who))}! Soy <b>${pn}</b>, vuestro hijo virtual ${egg ? "(de momento soy un huevo 🥚)" : "🐣"}. Te enseño cómo funciono.`],
    ["petFeed", `Cada día <b>los dos</b> tenéis que ${egg ? "darme calor 🔥" : "darme de comer 🍓"}. Solo crezco los días que lo hacéis tú y ${o}. ¡Así me cuidáis juntos! 💞`],
    egg ? null : ["petNeeds", "Aquí ves cómo estoy: hambre, cariño, diversión, limpieza y energía. Bajan con las horas aunque no abráis la app. Si descuidáis dos cosas, me pongo malito 🤒"],
    ["petBox", "Tócame para darme mimos 🤗<br>· 5 toques rápidos = cosquillas<br>· mantener pulsado = caricia"],
    ["petBag", "Con estos botones me cuidas: mochila, jugar, baño, siesta… y en 🎪 Trucos, 👗 Armario y 🎁 Cofres hay sorpresas."],
    ["petSegBar", "Aquí abajo tienes: 🎯 misiones y aventuras, 🛍️ mi tienda, ⭐ niveles y premios, y 📚 mis colecciones."],
    ["petView", "Aquí está mi casita 🏠. La podéis decorar juntos y yo me paseo por ella."],
    ["petCam", "Con 📸 me haces fotos para guardarlas o mandarlas 💛"],
    [null, `¡Eso es todo! Cuando ${o} y tú estéis a la vez en la app lo notaré… y si me hacéis mimos a la vez, ¡<b>abrazo doble</b>! 🤗💞`]
  ].filter(Boolean);
}
function startTour() {
  const steps = tourSteps().filter(([id]) => !id || ($(id) && $(id).offsetParent)); let i = 0;
  const ov = $("tour"), sp = $("tourSpot"), card = $("tourCard"); ov.classList.remove("hidden");
  const end = () => { ov.classList.add("hidden"); ls.set("petTour", "1"); setTimeout(petWelcome, 400); };
  const show = () => {
    const [id, txt] = steps[i], el = id && $(id);
    if (el) el.scrollIntoView({ block: "center" });
    setTimeout(() => {
      const r = el ? el.getBoundingClientRect() : null;
      if (r) Object.assign(sp.style, { display: "block", left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" }); else sp.style.display = "none";
      card.innerHTML = `<div class="tourtx">${txt}</div><div class="row"><button class="btn" id="tourSkip">Saltar</button><button class="btn primary" id="tourNext" style="flex:1">${i < steps.length - 1 ? "Siguiente →" : "¡Entendido! 💛"}</button></div><small>${i + 1} / ${steps.length}</small>`;
      const below = !r || r.bottom < innerHeight * .55;
      card.style.top = r ? (below ? Math.min(innerHeight - card.offsetHeight - 12, r.bottom + 14) : Math.max(12, r.top - card.offsetHeight - 14)) + "px" : Math.round(innerHeight * .35) + "px";
      $("tourNext").onclick = () => { i++; if (i >= steps.length) end(); else show(); };
      $("tourSkip").onclick = end;
    }, 260);
  };
  show();
}
$("tourAgain").onclick = () => { window.scrollTo(0, 0); setTimeout(startTour, 300); };


// =====================================================================
//   v35 · Enséñale a hablar, sus primeras veces y foto contigo
// =====================================================================
// ---------- Sus primeras veces ----------
const FIRSTS = [
  ["hatch", "🐣", "Nació"], ["feed", "🍓", "Su primera comida"], ["hug", "🤗", "Su primer mimo"], ["play", "⚽", "Su primer juego"], ["bath", "🛁", "Su primer baño"],
  ["nap", "🌙", "Su primera siesta"], ["dress", "👒", "Su primera ropa"], ["buy", "🛍️", "Su primer regalo"], ["trip", "🧳", "Su primera excursión"], ["treasure", "✨", "Su primer tesoro"],
  ["game", "🎮", "Su primer minijuego"], ["trick", "🎪", "Su primer truco"], ["post", "✉️", "Su primera carta como mensajero"], ["word", "🗣️", "Aprendió su primera frase"],
  ["dhug", "💞", "Su primer abrazo doble"], ["photo", "📸", "Su primera foto"], ["sick", "🤒", "Se puso malito por primera vez"], ["bday", "🎂", "Su primer cumplemés"],
  ["stage3", "🐤", "Se hizo travieso"], ["lvl10", "⭐", "Llegó al nivel 10"], ["talk", "💬", "Su primera conversación"]
];
const FIRSTM = Object.fromEntries(FIRSTS.map(f => [f[0], f]));
function firstMark(q, k, info) {
  q.firsts = q.firsts || {};
  if (!FIRSTM[k] || q.firsts[k] || (k !== "hatch" && stageOf(q.xp || 0) === 0)) return;
  q.firsts[k] = { at: Date.now(), by: who, ...(info ? { info: String(info).slice(0, 80) } : {}) };
}
function backfillFirsts(p) {   // lo que ya había pasado antes de existir el álbum
  p.firsts = p.firsts || {};
  if (p.hatchedAt > 1e12 && !p.firsts.hatch) p.firsts.hatch = { at: p.hatchedAt };
  const pc = Object.entries(p.postcards || {}).filter(([, t]) => t > 1e12).sort((a, b) => a[1] - b[1])[0];
  if (pc && !p.firsts.trip) p.firsts.trip = { at: pc[1], info: DESTM[pc[0]] ? DESTM[pc[0]].e + " " + DESTM[pc[0]].n : "" };
  if ((p.album || {})[3] > 1e12 && !p.firsts.stage3) p.firsts.stage3 = { at: p.album[3] };
}
let firstsSeen = null;
function checkFirsts(d) {
  const f = (d && d.firsts) || {}, keys = Object.keys(f);
  if (firstsSeen === null) { firstsSeen = new Set(keys); return; }
  for (const k of keys) if (!firstsSeen.has(k)) {
    firstsSeen.add(k); const F = FIRSTM[k]; if (!F || Date.now() - f[k].at > 3 * 6e4) continue;
    setTimeout(() => { toast(`🍼 ¡Primera vez! ${F[1]} ${F[2]}${f[k].info ? " · " + f[k].info : ""}`, 4200); if (!$("tab-pet").classList.contains("hidden")) hearts($("petBox"), F[1]); }, 1200);
  }
}
function renderFirsts(p) {
  const el = $("petFirsts"); if (!el) return;
  const f = p.firsts || {}, got = FIRSTS.filter(([k]) => f[k]).sort((a, b) => f[a[0]].at - f[b[0]].at), miss = FIRSTS.filter(([k]) => !f[k]);
  el.innerHTML = (got.length ? `<div class="firsts">${got.map(([k, e, n]) => `<div class="first"><i>${e}</i><div><b>${esc(n)}</b><small>${fmtDate(f[k].at, { day: "numeric", month: "short", year: "numeric" })}${f[k].info ? " · " + esc(f[k].info) : ""}${f[k].by ? " · con " + esc(name(f[k].by)) : ""}</small></div></div>`).join("")}</div>` : `<div class="empty" style="font-size:14px">Aquí se irán guardando solas sus primeras veces 🍼</div>`) +
    (miss.length ? `<div class="slotname">Por descubrir</div><div class="tchips">${miss.map(([, e, n]) => `<span class="tchip lk">${e} ${esc(n)}</span>`).join("")}</div>` : "");
}

// ---------- Enséñale a hablar ----------
const pendingWord = p => ((p && p.words) || []).find(w => w.from === other() && !w.said);
function teachWord() {
  const p = state.pet || {};
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  const t = prompt(`¿Qué quieres que ${p.name || "tu mascota"} le diga a ${name(other())}? Se lo soltará cuando menos se lo espere 🤫`); if (!t || !t.trim()) return;
  petTx(q => { q.words = [...(q.words || []), { id: Date.now().toString(36), from: who, text: t.trim().slice(0, 140), at: Date.now(), said: 0 }].slice(-40); firstMark(q, "word"); bump(q, "teach"); return q; })
    .then(r => { react("happy", 2000); say(rnd(["¡Aprendido! Se lo diré cuando menos se lo espere 🤫", "¡Me lo guardo en el piquito! 🤐", "Vale, vale… ¡será nuestro secreto! 🤫"]), 3500); sendMsg(`🗣️ Le he enseñado una frase nueva a ${r.name || "la mascota"}… ve a verle 🤫`, "pet"); })
    .catch(offline);
}
function sayWord(w) {
  if (!w || $("tab-pet").classList.contains("hidden") || tripAway(state.pet)) return false;
  petHome(); react("love", 3500); hearts($("petBox"), "💬");
  say(`${name(w.from)} me ha enseñado a decirte: «${w.text}» 💛`, 8000);
  petTx(q => { const x = (q.words || []).find(y => y.id === w.id); if (!x || x.said) return null; x.said = Date.now(); return q; }).catch(() => {});
  return true;
}
function renderWords(p) {
  const el = $("petWords"); if (!el) return;
  const ws = (p.words || []).slice().reverse();
  el.innerHTML = ws.length ? ws.map(w => `<div class="word"><div class="wq">${w.from !== who && !w.said ? "🤫 Una frase secreta…" : `«${esc(w.text)}»`}</div><small>Se lo enseñó ${esc(name(w.from))} · ${fmtDate(w.at, { day: "numeric", month: "short" })} · ${w.said ? `✅ ya se lo dijo a ${esc(name(w.from === "a" ? "b" : "a"))}` : w.from === who ? "🤫 aún no se lo ha dicho" : "🎁 ¡tiene algo para ti! Ve a verle"}</small>${w.from === who && !w.said ? `<button class="x" data-wdel="${w.id}">✕</button>` : ""}</div>`).join("")
    : `<div class="empty" style="font-size:14px">Aún no le habéis enseñado ninguna frase.</div>`;
  el.innerHTML += `<button class="btn primary mt" id="wTeach" style="width:100%">🗣️ Enseñarle una frase para ${esc(name(other()))}</button>`;
  el.querySelectorAll("[data-wdel]").forEach(b => b.onclick = () => { if (confirm("¿Olvidar esta frase?")) petTx(q => { q.words = (q.words || []).filter(w => w.id !== b.dataset.wdel); return q; }).catch(offline); });
  $("wTeach").onclick = teachWord;
}

// ---------- Foto contigo: la mascota como pegatina en tus fotos ----------
let stk = null;
function openCamSheet() {
  openSheet("📸 Fotos", `<div class="shopgrid" style="grid-template-columns:1fr 1fr"><button class="shopit" id="camScene"><i>🏞️</i><b>Foto de la escena</b><span>Tal y como está ahora</span></button><label class="shopit" id="camWith"><i>🤳</i><b>Foto contigo</b><span>Ponle en una foto tuya</span><input type="file" accept="image/*" id="camFile" hidden></label></div>`);
  $("camScene").onclick = () => { closeSheet(); petPhoto(); };
  $("camFile").onchange = e => { const f = e.target.files[0]; closeSheet(); if (f) openSticker(f); };
}
function openSticker(file) {
  const url = URL.createObjectURL(file), img = $("stkImg");
  img.onload = () => {
    const p = state.pet || {}, I = petInfo(), si = Math.max(1, I.si);
    stk = { x: 70, y: 72, s: 38, flip: false, url };
    $("stkPet").innerHTML = chickSVG(si, "happy", p.wear || {}, 0, p.color, { species: p.species });
    placeSticker(); $("stkView").classList.remove("hidden"); document.body.style.overflow = "hidden";
  };
  img.onerror = () => toast("No se pudo abrir la foto");
  img.src = url;
}
function placeSticker() { const e = $("stkPet"); Object.assign(e.style, { left: stk.x + "%", top: stk.y + "%", width: stk.s + "%" }); e.classList.toggle("flip", stk.flip); }
(() => {
  const el = $("stkPet"), pts = new Map(); let base = null;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); base = { ...stk, d: pts.size === 2 ? dist() : 0, px: e.clientX, py: e.clientY }; });
  el.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId) || !stk) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = $("stkStage").getBoundingClientRect();
    if (pts.size >= 2 && base.d) stk.s = Math.max(12, Math.min(90, base.s * dist() / base.d));
    else if (pts.size === 1) { stk.x = Math.max(0, Math.min(100, base.x + (e.clientX - base.px) / r.width * 100)); stk.y = Math.max(0, Math.min(100, base.y + (e.clientY - base.py) / r.height * 100)); }
    placeSticker();
  });
  const up = e => { pts.delete(e.pointerId); if (stk && pts.size === 1) { const [q] = [...pts.values()]; base = { ...stk, d: 0, px: q.x, py: q.y }; } };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
})();
$("stkPlus").onclick = () => { stk.s = Math.min(90, stk.s + 6); placeSticker(); };
$("stkMinus").onclick = () => { stk.s = Math.max(12, stk.s - 6); placeSticker(); };
$("stkFlip").onclick = () => { stk.flip = !stk.flip; placeSticker(); };
function closeSticker() { $("stkView").classList.add("hidden"); document.body.style.overflow = ""; if (stk) URL.revokeObjectURL(stk.url); stk = null; }
$("stkCancel").onclick = closeSticker;
$("stkSave").onclick = async () => {
  if (!stk) return;
  try {
    const im = $("stkImg"), M = 1600, k = Math.min(1, M / Math.max(im.naturalWidth, im.naturalHeight)), W = Math.round(im.naturalWidth * k), H = Math.round(im.naturalHeight * k);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d"); ctx.drawImage(im, 0, 0, W, H);
    const svg = $("stkPet").querySelector("svg").cloneNode(true), size = W * stk.s / 100;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg"); svg.setAttribute("width", size); svg.setAttribute("height", size);
    const pi = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg)));
    ctx.save(); ctx.translate(W * stk.x / 100, H * stk.y / 100); if (stk.flip) ctx.scale(-1, 1); ctx.drawImage(pi, -size / 2, -size / 2, size, size); ctx.restore();
    const url = c.toDataURL("image/jpeg", .85), small = scaleCanvas(c, Math.min(720, W)).toDataURL("image/jpeg", .72);
    closeSticker(); buzz(30);
    S.add("petpics", { from: who, img: small, at: Date.now() });
    petTx(q => { firstMark(q, "photo"); return q; }).catch(() => {});
    readView({ icon: "🤳", title: "¡Qué foto tan bonita!", sub: "Guardada en su álbum · mantén pulsada la foto para guardarla en el móvil", img: url,
      nav: `<button class="btn" id="stkMem">💾 A Recuerdos</button>${navigator.share ? `<button class="btn primary" id="stkShare">📤 Compartir</button>` : ""}` });
    $("stkMem").onclick = () => { addMemory({ from: who, text: `Con ${(state.pet || {}).name || "nuestra mascota"} 💛`, photo: scaleCanvas(c, Math.min(1000, W)).toDataURL("image/jpeg", .72), taken: Date.now(), at: Date.now() }); sendMsg(`📸 He guardado una foto con ${(state.pet || {}).name || "la mascota"} en Recuerdos`, "mem"); toast("Guardada en Recuerdos 💕"); $("stkMem").disabled = true; };
    const sh = $("stkShare"); if (sh) sh.onclick = async () => { try { const f = new File([await (await fetch(url)).blob()], "foto-con-mascota.jpg", { type: "image/jpeg" }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] }); } catch (e) {} };
  } catch (e) { console.error(e); toast("No se pudo crear la foto 😕"); }
};


// =====================================================================
//   v36 · Hablar con la mascota (IA) + servidor configurable desde ⚙️
// =====================================================================
const srvUrl = () => CONFIG.pushUrl || ((state.main || {}).server || "");
let aiHist = []; try { aiHist = JSON.parse(ls.get("aiHist") || "[]"); } catch (e) { aiHist = []; }
function aiContext() {
  const I = petInfo(), p = I.p, sp = SPECIES[p.species || "pollito"] || SPECIES.pollito, tr = TRAITS[p.trait], o = name(other()), me = name(who), today = localKey();
  const days = CONFIG.start ? Math.floor((Date.now() - new Date(CONFIG.start + "T00:00:00")) / DAY) : null;
  const nx = state.main.next && state.main.next > Date.now() ? Math.ceil((state.main.next - Date.now()) / DAY) : null;
  const md = moods[today] || {}, d = diaryDay(today) || {}, away = tripAway(p);
  const wear = Object.values(p.wear || {}).filter(Boolean).map(id => CAT[id] && CAT[id].n).filter(Boolean);
  const up = dates.map(x => ({ x, ...nextOcc(x) })).filter(r => r.days >= 0 && r.days <= 30).map(r => `${r.x.name} (en ${r.days} días)`);
  const pl = (plans || []).filter(x => !x.done).slice(0, 4).map(x => x.text);
  const said = (p.words || []).filter(w => w.said).slice(-3).map(w => `«${w.text}» (te lo enseñó ${name(w.from)})`);
  return [
    `Eres ${p.name || sp.n}, la mascota virtual (${sp.n.toLowerCase()}, fase «${stageName(I.si, p.species)}», nivel ${I.L.l}) que comparten ${name("a")} y ${name("b")}, una pareja que vive a distancia. Ahora hablas con ${me}.`,
    tr ? `Tu personalidad: ${tr.n.toLowerCase()} (${tr.d}).` : "",
    "Responde SIEMPRE en español, en 1 a 3 frases cortas, con ternura y humor y algún emoji. Eres su mascota: nunca digas que eres una IA, un modelo o un programa. No inventes cosas sobre ellos que no estén en estos datos; si no sabes algo, dilo con gracia. Anima a la pareja y nunca critiques a ninguno de los dos.",
    `Si ${me} te pide que le digas o le lleves algo a ${o}, contesta que se lo dirás y añade al final exactamente: [RECADO: el mensaje tal y como tú se lo dirás a ${o}, con tu gracia, en tercera persona, por ejemplo «¡${o}! ${me} me ha dicho que te echa muchísimo de menos y que le debes un abrazo enorme 🫂»]. Solo en ese caso: si no hay recado, no escribas nada entre corchetes.`,
    "Habla como un personaje, no expliques tus datos ni repitas números sin venir a cuento. Si te dicen algo que contradice tus datos, créete a la persona con cariño.",
    "Datos de ahora mismo:",
    p.hatchedAt > 1e12 ? `- Naciste del huevo hace ${Math.floor((Date.now() - p.hatchedAt) / DAY)} días (el ${new Date(p.hatchedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}); eres muy pequeñito todavía. Tu nivel no es tu edad.` : "",
    p.born > 1e12 ? `- Ellos adoptaron tu huevo el ${new Date(p.born).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}.` : "",
    `- Hoy es ${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}.`,
        days !== null ? `- Llevan ${days} días juntos.` : "", nx ? `- Faltan ${nx} días para que se vean.` : "",
    `- Tus necesidades (100% = perfecto): hambre ${I.nv.food}%, cariño ${I.nv.love}%, diversión ${I.nv.fun}%, limpieza ${I.nv.clean}%, energía ${I.nv.energy}%.${I.sick ? " Estás malito." : ""}`,
    `- Hoy te ha dado de comer: ${[I.meT ? me : "", I.otT ? o : ""].filter(Boolean).join(" y ") || "nadie todavía"}. Días que te han cuidado los dos: ${p.xp}. Racha: ${p.streak || 0}.`,
    wear.length ? `- Llevas puesto: ${wear.join(", ")}.` : "", familyCtx(p),
    away ? `- Estás de excursión en ${away.n}.` : `- Estás en ${petLoc(p) === "out" ? (CAT[p.scene || "jardin"] || {}).n || "el jardín" : LOCN[petLoc(p)] + " de vuestra casita"}. ${petLoc(p) === viewLoc() ? name(who) + " está mirándote ahí." : name(who) + " te está buscando por la casa: no le digas dónde estás, que lo descubra."}`,
    md[who] ? `- ${me} hoy se siente ${MOOD_TXT[md[who]]}.` : "", md[other()] ? `- ${o} hoy se siente ${MOOD_TXT[md[other()]]}.` : "",
    d[who] && d[who].text ? `- ${me} escribió hoy en el diario: «${d[who].text.slice(0, 200)}»` : "",
    d[who] && d[other()] && d[other()].text ? `- ${o} escribió hoy en el diario: «${d[other()].text.slice(0, 200)}»` : "",
    up.length ? `- Fechas especiales que se acercan: ${up.join(", ")}.` : "", pl.length ? `- Planes que quieren hacer juntos: ${pl.join("; ")}.` : "",
    said.length ? `- Frases que has aprendido: ${said.join("; ")}.` : "",
    partnerOnline() ? `- ${o} está en la app ahora mismo.` : "", `- Son las ${fmt(myTz, { hour: "2-digit", minute: "2-digit" })} para ${me}.`,
    memContext()
  ].filter(Boolean).join("\n");
}
function demoReply(t) {
  const o = name(other()), p = state.pet || {}, x = t.toLowerCase();
  if (/dile|dale|recado|lleva/.test(x)) return `¡Claro! Se lo diré a ${o} en cuanto venga 🤫 [RECADO: ${t.replace(/^.*?(dile|dale|lleva(le)?)\s*(a\s+\w+\s*)?(que\s*)?/i, "")}]`;
  if (/hambre|comer|comida/.test(x)) return "¡Siempre tengo hambre! 🍓 ¿Me das una fresa?";
  if (/quieres|quién|favorit/.test(x)) return `Os quiero a los dos igual… pero no se lo digas a ${o} 🤭💛`;
  return rnd([`¡Pío! Qué bien que vengas a hablar conmigo, ${name(who)} 🐤`, `Hoy me siento genial 💛 ¿Y tú?`, `¿Sabes qué? Echo de menos a ${o} 🥺`, `¡Me encanta mi ${(CAT[(p.wear || {}).head] || {}).n || "plumaje"}! ✨`]);
}
function drawAi(typing) {
  const el = $("aiLog"); if (!el) return;
  el.innerHTML = (aiHist.length ? aiHist.map(m => `<div class="bub ${m.role === "user" ? "me" : "pet"}">${esc(m.content)}</div>`).join("") : `<div class="empty" style="text-align:center">¡Pío! Pregúntame lo que quieras 🐤<br><small>Por ejemplo: «¿qué tal tu día?», «¿a quién quieres más?» o «dile a ${esc(name(other()))} que la echo de menos»</small></div>`) + (typing ? `<div class="bub pet typing"><i></i><i></i><i></i></div>` : "");
  el.scrollTop = el.scrollHeight;
}
function openPetChat() {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  const p = state.pet || {};
  openSheet(`💬 Hablar con ${p.name || "tu mascota"}`, `<div class="aichat" id="aiLog"></div><div class="sendrow"><input id="aiIn" placeholder="Escríbele algo…" enterkeyhint="send" maxlength="300"><button class="btn primary" id="aiSend">➤</button></div><div class="sub" style="font-size:11.5px;text-align:center">Contesta con IA según lo que pasa en la app · esta conversación solo la ves tú · <button class="linkbtn" id="aiClear" style="font-size:11.5px">borrar</button> · <button class="linkbtn" id="aiMem" style="font-size:11.5px">🧠 lo que recuerda</button></div>`);
  drawAi(); $("aiSend").onclick = aiSend; $("aiIn").onkeydown = e => { if (e.key === "Enter") aiSend(); };
  $("aiClear").onclick = () => { aiHist = []; ls.set("aiHist", "[]"); drawAi(); };
  $("aiMem").onclick = openMemList;
}
async function aiSend() {
  const inp = $("aiIn"), t = inp.value.trim(); if (!t || aiSend.busy) return; inp.value = "";
  aiHist.push({ role: "user", content: t.slice(0, 300) }); aiHist = aiHist.slice(-20); drawAi(true); aiSend.busy = true;
  let reply = null;
  try {
    if (S.demo) { aiContext.last = aiContext(); await new Promise(r => setTimeout(r, 700)); reply = demoReply(t); }
    else if (!srvUrl()) reply = "Pío… 🥺 Aún no tengo voz: falta poner la dirección del servidor en ⚙️ Ajustes.";
    else {
      const body = JSON.stringify({ secret: CONFIG.pushSecret, type: "chat", system: aiContext(), messages: aiHist.filter(m => !m.fail).slice(-12).map(m => ({ role: m.role, content: m.content })) });
      for (let i = 0; i < 2 && !reply; i++) {
        try { const r = await fetch(srvUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body }); const j = await r.json(); if (!j.ok || !j.reply) throw new Error(j.error || "sin respuesta"); reply = j.reply; }
        catch (e) { if (i) throw e; await new Promise(r => setTimeout(r, 800)); }
      }
    }
  } catch (e) { console.warn(e); reply = null; }
  aiSend.busy = false;
  const fail = !reply; if (fail) reply = "Pío… me he quedado sin palabras 😵 Prueba otra vez en un ratito.";
  let rec = null; reply = String(reply).replace(/\[RECADO:\s*([^\]]+)\]/i, (_, m) => { rec = m.trim(); return ""; }).replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim() || "🐤💛";
  if (rec && /^(no hay|ninguno|nada)/i.test(rec)) rec = null;
  aiHist.push(fail ? { role: "assistant", content: reply, fail: 1 } : { role: "assistant", content: reply }); aiHist = aiHist.slice(-20); ls.set("aiHist", JSON.stringify(aiHist)); drawAi();
  if (!fail) memExtract().catch(e => console.warn(e));
  say(reply.length > 150 ? reply.slice(0, 147) + "…" : reply, 5000); react("happy", 1500);
  const pn = (state.pet || {}).name || "La mascota";
  petTx(q => { firstMark(q, "talk"); bump(q, "talk"); if (rec) { q.words = [...(q.words || []), { id: Date.now().toString(36), from: who, text: rec.slice(0, 140), at: Date.now(), said: 0 }].slice(-40); firstMark(q, "word"); } return q; })
    .then(() => { if (rec) sendMsg(`🗣️ ${pn} tiene un recado para ti… ve a verle 🤫`, "pet"); }).catch(() => {});
}
$("petChat").onclick = e => { e.stopPropagation(); openPetChat(); };
window.__aiCtx = () => aiContext.last;
window.__chick = (...a) => chickSVG(...a);
window.__furn = id => furnSVG(id, { mode: "day" });
window.__new = () => CATALOG.filter(i => i.nw === 3).map(i => [i.id, i.cat, i.slot || i.kind || "", i.n]);


// =====================================================================
//   v38 · Tienda nueva: espejo, escaparate, departamentos, deseos y regalos
// =====================================================================
const ITK = k => (k && String(k).startsWith("color:") ? COLM[String(k).slice(6)] : CAT[k]);   // clave única (los colores llevan "color:")
const keyOf = it => ownKey(it);
const isNewIt = it => it.nw === 3;
const DEPTS = [["ropa", "👒", "Ropa"], ["fx", "✨", "Magia"], ["color", "🎨", "Colores"], ["comida", "🍰", "Comida"], ["juguete", "🧸", "Juguetes"],
  ["casa", "🏠", "Casa"], ["lugar", "🏞️", "Lugares"], ["cofres", "🎁", "Cofres"], ["armario", "👗", "Armario"], ["deseos", "💝", "Deseos"]];
let FLASH = null, mirrorMsg = null;
const FLASH_H = 3;   // la oferta relámpago cambia cada 3 horas
function flashItem(p, I, offers) {
  const pool = CATALOG.filter(it => it.c >= 60 && it.cat !== "comida" && !it.season && !it.treasure && !it.chest && !it.lv && !it.weekly && !isOwned(p, it) && !itemLock(it, p, I) && !offers.includes(ownKey(it)));
  if (!pool.length) return null;
  const slot = Math.floor(Date.now() / (FLASH_H * 36e5));
  return pool.map(it => ({ it, k: hashStr(it.id + ":" + slot) })).sort((a, b) => a.k - b.k)[0].it;
}
const flashLeft = () => { const ms = FLASH_H * 36e5 - Date.now() % (FLASH_H * 36e5); const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4); return h ? `${h} h ${m} min` : `${m} min`; };
const wishOf = (p, w) => ((p.wish || {})[w] || []).filter(k => ITK(k));
const giftsFor = (p, w) => (p.gifts || []).filter(g => g.to === w);
const giftsFrom = (p, w) => (p.gifts || []).filter(g => g.from === w);

// Lo que dice mientras se prueba algo
function tryLine(it, p) {
  if (!it) return "";
  const o = name(other()), R = rarOf(it), wished = wishOf(p, other()).includes(keyOf(it));
  if (wished) return `¡Esto está en la lista de deseos de ${o}! 💝`;
  const pick = a => a[hashStr(it.id) % a.length];
  if (it.cat === "comida") return pick(["¡Ñam! ¿Me lo compras? 🥺", "¡Qué buena pinta! 🤤", "Mmm… ¡eso quiero! 😋"]);
  if (it.cat === "juguete") return pick(["¡Con eso jugaría todo el día! 🥳", "¡Porfa, porfa, porfa! 🙏"]);
  if (it.cat === "casa") return pick(["¡Quedaría genial en la casita! 🏠", "¡Me encanta para decorar! ✨"]);
  if (it.cat === "lugar") return pick(["¡Llévame ahí! 🤩", "¡Qué sitio tan bonito! 😍"]);
  if (it.cat === "color") return pick(["¿Me queda bien este color? 🎨", "¡Soy otro pollito! 😆", "¡Me siento nuevo! ✨"]);
  if (it.cat === "fx") return "¡Soy mágico! ✨🪄";
  if (R >= 4) return "¡Esto es LEGENDARIO! 🌟";
  return ({ head: ["¿A que estoy guapísimo? 😎", "¡Me queda de cine! 🎬", "¡Qué elegancia! 💅"], face: ["¡Ahora lo veo todo más bonito! 🤓", "¿Me reconoces? 😏"], neck: ["¡Qué calentito! 🥰", "¡Muy fashion! ✨"],
    body: ["¡Me queda como un guante! 👌", "¡Mírame, mírame! 🤩"], feet: ["¡A bailar! 💃", "¡Qué cómodos! 🥰"], hand: ["¡Mira lo que tengo! 🤗", "¡Es mío, mío! 😆"], back: ["¡Voy a salir volando! 🪽", "¡Qué chulo! 😍"] }[it.slot] || ["¡Me encanta! 😍"]).map(x => x)[hashStr(it.id) % 2] || "¡Me encanta! 😍";
}

function mirrorHTML(p, I, ids, offers) {
  const si = I.si, wear = { ...(p.wear || {}) }; let color = p.color || "amarillo", bg = "", side = "";
  for (const k of ids) {
    const it = ITK(k); if (!it) continue;
    if (it.slot) wear[it.slot] = it.id; else if (it.cat === "color") color = it.id;
    else if (it.cat === "lugar") bg = `<div class="mbg">${landscape(it.id, "day", "", -1)}</div>`;
    else if (it.cat === "casa" && it.kind !== "furn") bg = `<div class="mbg room" style="--w:${(it.kind === "wall" ? it : CAT[roomOf(p, curRoom).wall || "w_crema"]).sw};--f:${(it.kind === "floor" ? it : CAT[roomOf(p, curRoom).floor || "f_madera"]).sw}"></div>`;
    else side = `<div class="mside">${shopIcon(it)}</div>`;
  }
  const pet = si ? chickSVG(si, "happy", wear, 0, color, { species: p.species }) : chickSVG(0, "egg", {}, 0, color, { species: p.species });
  return `<div class="mpet">${bg}${pet}${side}</div>`;
}

function renderShop(p, I) {
  const coins = coinsOf(p), offers = dailyOffers(p, I), wk = weeklyItem(), ids = pvIds(), fl = flashItem(p, I, offers);
  FLASH = fl ? keyOf(fl) : null;
  document.querySelectorAll("#shopTabs button").forEach(b => b.classList.toggle("on", b.dataset.s === shopTab));
  $("shopCoins").textContent = coins + " 🪙";
  const myWish = wishOf(p, who), theirWish = wishOf(p, other()), o = name(other());
  // ---- Escaparate ----
  const cards = [];
  const forMe = giftsFor(p, who);
  if (forMe.length) cards.push(`<button class="vit gift" data-open-gift="${esc(forMe[0].id)}"><span class="vbadge">🎁 PARA TI</span><i class="vbig">🎁</i><b>¡${esc(name(forMe[0].from))} te ha hecho un regalo!</b><small>Toca para abrirlo</small></button>`);
  if (fl) cards.push(`<button class="vit flashv" data-k="${keyOf(fl)}" style="--rc:${RAR[rarOf(fl)].c}"><span class="vbadge">⚡ RELÁMPAGO −50%</span>${shopIcon(fl)}<b>${esc(fl.n)}</b><span class="vp"><s>${fl.c}</s> ${priceOf(fl, offers)} 🪙</span><small>⏳ ${flashLeft()}</small></button>`);
  if (wk && !isOwned(p, wk)) cards.push(`<button class="vit weekly2" data-k="${keyOf(wk)}" style="--rc:${RAR[rarOf(wk)].c}"><span class="vbadge">💎 DE LA SEMANA</span>${shopIcon(wk)}<b>${esc(wk.n)}</b><span class="vp">${priceOf(wk, offers)} 🪙</span><small>Quedan ${weekLeft()} día${weekLeft() > 1 ? "s" : ""}</small></button>`);
  if (theirWish.length) { const it = ITK(theirWish[theirWish.length - 1]); cards.push(`<button class="vit wish" data-k="${keyOf(it)}"><span class="vbadge">💝 DESEO DE ${esc(o.toUpperCase())}</span>${shopIcon(it)}<b>${esc(it.n)}</b><span class="vp">${priceOf(it, offers)} 🪙</span><small>Regálaselo 🎁</small></button>`); }
  offers.forEach(k => { const it = ITK(k); if (!it) return; cards.push(`<button class="vit" data-k="${keyOf(it)}" style="--rc:${RAR[rarOf(it)].c}"><span class="vbadge">⭐ HOY −30%</span>${shopIcon(it)}<b>${esc(it.n)}</b><span class="vp"><s>${it.c}</s> ${priceOf(it, offers)} 🪙</span></button>`); });
  const nNew = CATALOG.filter(it => isNewIt(it) && !isOwned(p, it)).length;
  if (nNew) cards.push(`<button class="vit news" data-go-new="1"><span class="vbadge">✨ NOVEDADES</span><i class="vbig">🛍️</i><b>${nNew} cosas nuevas</b><small>Ropa, colores, comida, juguetes y casa</small></button>`);
  $("shopOffers").innerHTML = `<div class="vitrina">${cards.join("")}</div>`;
  $("shopOffers").querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const it = ITK(b.dataset.k); if (!it) return; if (it.cat !== shopTab && !["deseos"].includes(shopTab)) { shopTab = it.cat === "fx" ? "fx" : it.cat; ls.set("shopTab", shopTab); } shopTap(b.dataset.k); });
  $("shopOffers").querySelectorAll("[data-open-gift]").forEach(b => b.onclick = () => openGift(b.dataset.openGift));
  $("shopOffers").querySelectorAll("[data-go-new]").forEach(b => b.onclick = () => { shopTab = "ropa"; shopSlot = "new"; ls.set("shopTab", "ropa"); ls.set("shopSlot", "new"); renderPet(); $("shopTabs").scrollIntoView({ behavior: "smooth", block: "start" }); });

  // ---- Espejo (probador) ----
  const items = ids.map(ITK).filter(Boolean), dprize = !(p.dprize || {})[who] || (p.dprize || {})[who] !== localKey();
  let mh = `<div class="mwrap">${mirrorHTML(p, I, ids, offers)}<div class="mright">`;
  if (items.length) {
    const buyable = items.filter(it => !itemLock(it, p, I) && (it.cat === "comida" || !isOwned(p, it)));
    const total = buyable.reduce((a, it) => a + priceOf(it, offers), 0), can = buyable.length && coins >= total, last = items[items.length - 1];
    mh += `<div class="msay">${esc(mirrorMsg && mirrorMsg.until > Date.now() ? mirrorMsg.t : tryLine(last, p))}</div><div class="mchips">${items.map(it => { const lk = itemLock(it, p, I), k = keyOf(it); return `<span class="chip ${lk ? "lk" : ""}">${it.e || "🎨"} ${esc(it.n)} · ${lk ? "🔒" : isOwned(p, it) && it.cat !== "comida" ? "tuyo" : priceOf(it, offers) + "🪙"}<button data-rm="${k}">✕</button></span>`; }).join("")}</div>
      <div class="mbtns"><button class="btn primary" id="buyGo" ${can ? "" : "disabled"}>${!buyable.length ? esc(itemLock(items[0], p, I) || "Ya lo tenéis") : can ? `Comprar ${total}🪙` : `Faltan ${total - coins} 🪙`}</button>
      ${buyable.length ? `<button class="btn giftb" id="giftGo" ${can ? "" : "disabled"} title="Regalar">🎁</button>` : ""}<button class="btn" id="buyX">✕</button></div>`;
  } else {
    const pend = giftsFrom(p, who);
    const idle = ["¡Hola! Toca algo y me lo pruebo 👀", "¿Vamos de compras? 🛍️", "Puedes probarme varias cosas a la vez 😎", "Dale al ♡ de lo que te guste 💝"];
    mh += `<div class="msay">${esc(mirrorMsg && mirrorMsg.until > Date.now() ? mirrorMsg.t : pend.length ? `Estoy guardando tu regalo para ${o} 🤫🎁` : si0(I) ? "¡Todavía soy un huevo! Lo que compres me lo pondré al nacer 🥚" : idle[hashStr(localKey() + who + new Date().getHours()) % idle.length])}</div>
      <div class="mbtns">${dprize ? `<button class="btn primary dpz" id="dPrize">🎁 Premio diario</button>` : `<span class="mnote">Premio diario recogido ✓ · vuelve mañana</span>`}</div>`;
  }
  mh += `</div></div>`;
  const M = $("shopMirror"); M.innerHTML = mh; M.classList.toggle("act", !!items.length);
  if (items.length) {
    $("buyGo").onclick = () => buy(); $("buyX").onclick = () => { preview = null; sceneSig = ""; renderPet(); };
    const g = $("giftGo"); if (g) g.onclick = giftFlow;
    M.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { const r = pvIds().filter(x => x !== b.dataset.rm); preview = r.length ? { ids: r } : null; sceneSig = ""; renderPet(); });
  } else { const d = $("dPrize"); if (d) d.onclick = dailyPrize; }
  fitIcons(M);

  // ---- Departamento ----
  const cell = it => {
    const k = keyOf(it), own = isOwned(p, it), on = isOn(p, it), lock = !own && itemLock(it, p, I), pv = ids.includes(k), rr = it.slot || it.cat === "color" ? rarOf(it) : 0;
    const price = priceOf(it, offers), sale = price < it.c, wished = myWish.includes(k), theirs = theirWish.includes(k);
    let tag;
    if (it.cat === "comida") tag = lock || `${price} 🪙`;
    else if (it.cat === "juguete") tag = own ? "Tuyo ✓" : lock || price + " 🪙";
    else tag = on ? "Puesto ✓" : own ? (it.cat === "casa" && it.kind === "furn" ? "Colocar" : "Usar") : lock || price + " 🪙";
    const cls = ["shopit", "v2", rr ? "r" + rr : "", on ? "on" : "", own && !on && it.cat !== "comida" ? "own" : "", pv ? "pv" : "", lock ? "locked" : "", sale && !own ? "sale" : "", !own && !lock && it.cat !== "comida" && coins < price ? "poor" : ""].filter(Boolean).join(" ");
    return `<button class="${cls}" data-k="${k}">${isNewIt(it) && !own ? `<em class="nw">NUEVO</em>` : ""}${!own && it.cat !== "comida" ? `<span class="wbtn ${wished ? "on" : ""}" data-wish="${k}">${wished ? "♥" : "♡"}</span>` : ""}${theirs ? `<span class="twish">💝</span>` : ""}${it.cat === "comida" && (p.inv || {})[it.id] ? `<span class="invn">×${p.inv[it.id]}</span>` : ""}${shopIcon(it)}<b>${esc(it.n)}</b>${rr >= 2 ? `<small class="rt" style="color:${RAR[rr].c}">${RAR[rr].n}</small>` : ""}<span class="pt">${sale && !own && !lock ? `<s>${it.c}</s> ` : ""}${esc(tag)}</span></button>`;
  };
  const order = it => { const own = isOwned(p, it); if (isOn(p, it)) return 0; if (!own && !itemLock(it, p, I)) return coinsOf(p) >= priceOf(it, offers) ? 1 : 2; return own ? 3 : 4; };
  const grid = list => { const ok = list.filter(it => isOwned(p, it) || !itemLock(it, p, I) || it.cat === "comida").sort((a, b) => order(a) - order(b) || a.c - b.c), lk = list.filter(it => !ok.includes(it));
    return (ok.length ? `<div class="shopgrid">${ok.map(cell).join("")}</div>` : "") + (lk.length ? `<details class="lockd"><summary>🔒 Se desbloquean más adelante (${lk.length})</summary><div class="shopgrid">${lk.map(cell).join("")}</div></details>` : ""); };
  let h = "";
  const list = CATALOG.filter(it => it.cat === shopTab);
  const month = new Date().getMonth(), seasonal = CATALOG.filter(it => it.season && it.season.includes(month));
  if (shopTab === "ropa") {
    const act = activeSets(p);
    h = (act.length ? `<div class="banner setban">✨ ${act.map(s => `Set ${esc(s.n)}: ${esc(s.d)}`).join("<br>✨ ")}</div>` : "") + (seasonal.length ? `<div class="banner" style="margin:4px 0 0">🍂 De temporada: ${seasonal.map(it => (it.e || "🎨") + " " + esc(it.n)).join(" · ")}</div>` : "") +
      `<div class="tchips slotf one">${[["all", "Todo"], ["new", "✨ Nuevo"], ...SLOTS].map(([sl, sn]) => `<button class="tchip ${shopSlot === sl ? "on" : ""}" data-slot="${sl}">${sn}</button>`).join("")}</div>` +
      (shopSlot === "new" ? `<div class="slotname">✨ Recién llegado</div>` + grid(CATALOG.filter(i => isNewIt(i) && i.cat !== "lugar"))
        : SLOTS.filter(([sl]) => shopSlot === "all" || shopSlot === sl).map(([sl, sn]) => `<div class="slotname">${sn}</div>${grid(list.filter(i => i.slot === sl))}`).join("")) +
      `<button class="btn sets" id="setsInfo">🧩 Ver los sets y sus poderes</button>`;
  }
  else if (shopTab === "fx") h = `<div class="sub dsub">Efectos que brillan alrededor de la mascota ✨ (uno a la vez)</div>${grid(list)}`;
  else if (shopTab === "armario") h = renderWardrobe(p);
  else if (shopTab === "cofres") h = renderChests(p, coins);
  else if (shopTab === "deseos") h = renderWishes(p, I, offers);
  else if (shopTab === "casa") h = [["furn", "🛋️ Muebles"], ["wall", "🎨 Paredes"], ["floor", "🟫 Suelos"]].map(([k, n]) => `<div class="slotname">${n}</div>${grid(list.filter(i => i.kind === k))}`).join("") + `<div class="sub dsub">Se pone en: <b>${esc((ROOMS.find(r => r[0] === curRoom) || ROOMS[0])[1])}</b>. Cambia de habitación debajo de la escena y usa ✏️ Mover para colocar los muebles.</div>`;
  else if (shopTab === "comida") h = `${grid(list)}<div class="sub dsub">La comida va a la 🎒 Mochila. Dásela cuando quieras.</div>`;
  else if (shopTab === "juguete") h = `${grid(list)}<div class="sub dsub">Cada juguete le divierte distinto. Elígelo al pulsar ⚽ Jugar.</div>`;
  else if (shopTab === "color") h = `<div class="slotname">🎨 Colores y degradados</div>${grid(list)}<div class="slotname">🐾 Marcas y dibujos del pelaje</div><div class="sub dsub" style="margin-top:0">Se combinan con cualquier color. ¡Y las crías las heredan! 🐣</div>${grid(CATALOG.filter(i => i.cat === "marca"))}<div class="sub dsub">✨ El dorado es gratis al llegar a legendario. Sirena solo sale en cofres y Diamante es el premio del nivel 40.</div>`;
  else h = grid(list);
  $("shopBody").innerHTML = h;
  $("shopBody").querySelectorAll(".shopit").forEach(b => b.onclick = e => { if (e.target.closest("[data-wish]")) return; shopTap(b.dataset.k); });
  $("shopBody").querySelectorAll("[data-wish]").forEach(b => b.onclick = e => { e.stopPropagation(); toggleWish(b.dataset.wish); });
  if (shopTab === "armario") bindWardrobe();
  if (shopTab === "deseos") bindWishes();
  const si2 = $("setsInfo"); if (si2) si2.onclick = openSets;
  $("shopBody").querySelectorAll("[data-slot]").forEach(b => b.onclick = () => { shopSlot = b.dataset.slot; ls.set("shopSlot", shopSlot); renderPet(); });
  fitIcons($("shopCard"));
  $("shopBody").querySelectorAll("[data-chest]").forEach(b => b.onclick = () => openChest(b.dataset.chest));
  $("shopBuy").innerHTML = "";
}
const si0 = I => I.si === 0;

function openSets() {
  const p = state.pet || {};
  openSheet("🧩 Sets con poderes", `<div class="sub" style="margin-bottom:10px">Si lleva todas las piezas de un set a la vez, gana su poder ✨</div>` + SETS.map(s => {
    const have = s.items.filter(i => CAT[i] && isOwned(p, CAT[i])).length, on = setOn(p, s.id);
    return `<div class="setrow ${on ? "on" : ""}"><b>${s.e} ${esc(s.n)}</b><small>${esc(s.d)}</small><div class="setits">${s.items.map(i => CAT[i] ? `<span class="${isOwned(p, CAT[i]) ? "got" : ""}">${CAT[i].e || "🎨"} ${esc(CAT[i].n)}</span>` : "").join("")}</div><small>${on ? "✅ ¡Activo!" : `${have}/${s.items.length} piezas`}</small></div>`;
  }).join(""));
}

// ---- Probar (clave única) ----
function shopTap(k) {
  const p = state.pet || newPet(), it = ITK(k), si = stageOf(p.xp); if (!it) return;
  if (it.cat === "comida") { preview = pvIds().includes(k) ? null : { ids: [k] }; sceneSig = ""; renderPet(); return; }
  if (isOwned(p, it)) {
    const rest = pvIds().filter(x => x !== k && ITK(x) && ITK(x).cat !== "comida" && !sameSlot(ITK(x), it)); preview = rest.length ? { ids: rest } : null;
    if (it.slot && awayToast()) { renderPet(); return; }
    if (it.cat === "juguete") { toast(`${it.e} Ya lo tiene. Úsalo con ⚽ Jugar`); renderPet(); return; }
    const on = isOn(p, it), before = state.pet;
    petTx(q => {
      if (it.slot) { settle(q); q.wear[it.slot] = on ? null : it.id; bump(q, "dress"); if (!on && q.firsts && q.firsts.dress && !q.firsts.dress.info) q.firsts.dress.info = it.n; }
      else if (it.cat === "color") { q.color = it.id; bump(q, "dress"); }
      else if (it.cat === "lugar") q.scene = it.id;
      else if (it.cat === "casa") placeFurn(q, it, !on);
      return q;
    }).then(r => { sceneSig = ""; if (it.cat === "casa" && petView !== "in") { petView = "in"; ls.set("petView", "in"); } if (it.cat === "lugar" && petView !== "out") { petView = "out"; ls.set("petView", "out"); } if (si) { react("happy", 2000); say(on && it.slot ? "¡Así también estoy guapo!" : rnd(["¡Me encanta! 😍", "¡Qué bonito! ✨", "¡Gracias! 💛"])); } if (r && it.slot) announceSets(before, r); renderPet(); }).catch(offline);
  } else {
    let ids = pvIds().filter(x => ITK(x) && ITK(x).cat !== "comida");
    if (ids.includes(k)) ids = ids.filter(x => x !== k); else { ids = ids.filter(x => !sameSlot(ITK(x), it)); ids.push(k); }
    preview = ids.length ? { ids } : null; sceneSig = "";
    renderPet(); buzz(15);
    const M = $("shopMirror"); if (M && preview) { M.classList.remove("pop"); void M.offsetWidth; M.classList.add("pop"); }
  }
}

// ---- Comprar (con animación) ----
function flyTo(fromEl, toEl, html) {
  if (!fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect(); if (!a.width || !b.width) return;
  const f = document.createElement("div"); f.className = "flyit"; f.innerHTML = html;
  f.style.left = a.left + a.width / 2 - 28 + "px"; f.style.top = a.top + a.height / 2 - 28 + "px"; document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px,${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.4)`; f.style.opacity = ".2"; });
  setTimeout(() => f.remove(), 750);
}
function coinPop(el, t) {
  if (!el) return; const r = el.getBoundingClientRect(), d = document.createElement("div"); d.className = "coinpop"; d.textContent = t;
  d.style.left = r.left + r.width / 2 + "px"; d.style.top = r.top + "px"; document.body.appendChild(d); setTimeout(() => d.remove(), 1300);
}
function mirrorCheer(t) {
  const M = $("shopMirror"); if (!M) return;
  const pet = M.querySelector(".mpet"); if (pet) { pet.classList.remove("jump"); void pet.offsetWidth; pet.classList.add("jump"); hearts(pet, rnd(["✨", "💛", "🎉"])); }
  if (t) { mirrorMsg = { t, until: Date.now() + 5000 }; const s = M.querySelector(".msay"); if (s) s.textContent = t; }
}
function buy() {
  const ids = pvIds(); if (!ids.length) return;
  const p0 = state.pet || newPet(), I = petInfo(), offers = dailyOffers(p0, I);
  const list = ids.map(ITK).filter(it => it && !itemLock(it, p0, I) && (it.cat === "comida" || !isOwned(p0, it)));
  if (!list.length) return toast(itemLock(ITK(ids[0]), p0, I) || "Ya lo tenéis");
  const total = list.reduce((a, it) => a + priceOf(it, offers), 0); let fail = false; const before = state.pet;
  const fromEls = list.map(it => document.querySelector(`#shopBody .shopit[data-k="${keyOf(it)}"]`) || document.querySelector(`#shopOffers [data-k="${keyOf(it)}"]`));
  petTx(p => {
    if (p.coins < total) { fail = true; return null; }
    fail = false; settle(p);
    for (const it of list) {
      if (it.cat === "comida") { p.inv[it.id] = (p.inv[it.id] || 0) + 1; continue; }
      const key = ownKey(it); if (p.owned[key]) continue; p.owned[key] = true;
      if (it.slot) p.wear[it.slot] = it.id; else if (it.cat === "color") p.color = it.id; else if (it.cat === "lugar") p.scene = it.id; else if (it.cat === "casa") placeFurn(p, it, true);
      if (p.wish && p.wish[who]) p.wish[who] = p.wish[who].filter(x => x !== key);
    }
    bump(p, "buy"); p.coins -= total; p.spent = (p.spent || 0) + total; return p;
  }).then(r => {
    if (fail) return toast("No tenéis suficientes monedas 🪙");
    if (!r) return;
    const food = list[0].cat === "comida"; if (!food) preview = null;
    list.forEach((it, i) => flyTo(fromEls[i], $("shopMirror"), shopIcon(it)));
    coinPop($("shopCoins"), `−${total} 🪙`);
    sceneSig = ""; buzz([30, 40, 30]); hearts($("petBox"), "✨");
    react("happy", 2500); const line = food ? `¡${list[0].e} a la mochila! ¡Ñam!` : rnd(["¡Gracias! ¡Me encanta! 😍", "¡Qué regalo tan bonito! 💛", "¡Sois los mejores! ✨", "¡Estreno modelito! 💃"]);
    say(line);
    if (!food) { sendMsg(`🛍️ Le he comprado ${list.map(it => (it.e || "🎨") + " " + it.n.toLowerCase()).join(", ")} a ${r.name || "la mascota"}`, "pet"); announceSets(before, r); if (list.some(it => rarOf(it) >= 3)) setTimeout(confetti, 400); }
    renderPet(); setTimeout(() => mirrorCheer(line), 60);
  }).catch(offline);
}

// ---- Lista de deseos ----
function toggleWish(k) {
  const it = ITK(k); if (!it) return; let on = false;
  petTx(q => { q.wish = q.wish || {}; const L = (q.wish[who] || []).filter(x => x !== k); on = L.length === (q.wish[who] || []).length; q.wish[who] = on ? [...L, k].slice(-30) : L; return q; })
    .then(() => { buzz(20); toast(on ? `💝 Añadido a tu lista de deseos · ${name(other())} lo verá` : "Quitado de tu lista de deseos"); if (on) sendMsg(`💝 He añadido ${it.e || "🎨"} ${it.n} a mi lista de deseos del pollito… 👀`, "pet"); renderPet(); }).catch(offline);
}
function renderWishes(p, I, offers) {
  const o = name(other()), theirs = wishOf(p, other()), mine = wishOf(p, who), coins = coinsOf(p);
  const row = (k, mode) => { const it = ITK(k); const pr = priceOf(it, offers), own = isOwned(p, it);
    return `<div class="wrow">${shopIcon(it)}<div><b>${esc(it.n)}</b><small>${own ? "Ya lo tenéis ✓" : pr + " 🪙"}</small></div>${mode === "gift" && !own ? `<button class="btn primary" data-wgift="${k}" ${coins >= pr ? "" : "disabled"}>🎁 Regalar</button>` : ""}${mode === "mine" ? `<button class="btn" data-wtry="${k}">👀</button><button class="x" data-wrm="${k}">✕</button>` : ""}</div>`; };
  const pend = giftsFrom(p, who), got = (p.giftLog || []).filter(g => g.to === who).slice(-6).reverse();
  return `<div class="slotname">💝 Lo que le gustaría a ${esc(o)}</div>${theirs.length ? theirs.map(k => row(k, "gift")).join("") : `<div class="empty" style="font-size:14px">${esc(o)} aún no tiene deseos. Toca el ♡ de cualquier cosa para hacer tu lista.</div>`}
    <div class="slotname">📝 Tu lista de deseos</div>${mine.length ? mine.map(k => row(k, "mine")).join("") : `<div class="empty" style="font-size:14px">Toca el ♡ de lo que te guste y ${esc(o)} podrá regalártelo 🎁</div>`}
    ${pend.length ? `<div class="slotname">⏳ Regalos esperando a ${esc(o)}</div>${pend.map(g => `<div class="wrow"><i>🎁</i><div><b>${g.keys.map(k => (ITK(k) || {}).n).filter(Boolean).join(", ")}</b><small>Aún no lo ha abierto 🤫</small></div></div>`).join("")}` : ""}
    ${got.length ? `<div class="slotname">🎀 Regalos que te han hecho</div>${got.map(g => `<div class="wrow"><i>🎀</i><div><b>${g.keys.map(k => (ITK(k) || {}).n).filter(Boolean).join(", ")}</b><small>De ${esc(name(g.from))} · ${fmtDate(g.opened || g.at, { day: "numeric", month: "short" })}${g.note ? " · «" + esc(g.note) + "»" : ""}</small></div></div>`).join("")}` : ""}`;
}
function bindWishes() {
  const B = $("shopBody");
  B.querySelectorAll("[data-wgift]").forEach(b => b.onclick = () => { preview = { ids: [b.dataset.wgift] }; sceneSig = ""; renderPet(); giftFlow(); });
  B.querySelectorAll("[data-wtry]").forEach(b => b.onclick = () => { shopTap(b.dataset.wtry); $("shopMirror").scrollIntoView({ behavior: "smooth", block: "center" }); });
  B.querySelectorAll("[data-wrm]").forEach(b => b.onclick = () => toggleWish(b.dataset.wrm));
  fitIcons(B);
}

// ---- Regalar a la pareja ----
function giftFlow() {
  const ids = pvIds(), p0 = state.pet || newPet(), I = petInfo(), offers = dailyOffers(p0, I), o = name(other());
  const list = ids.map(ITK).filter(it => it && !itemLock(it, p0, I) && (it.cat === "comida" || !isOwned(p0, it)));
  if (!list.length) return toast("Elige algo que no tengáis");
  const total = list.reduce((a, it) => a + priceOf(it, offers), 0);
  openSheet(`🎁 Regalo para ${o}`, `<div class="giftprev">${list.map(it => shopIcon(it)).join("")}</div><div class="sub" style="text-align:center">${list.map(it => esc(it.n)).join(", ")} · <b>${total} 🪙</b></div>
    <textarea id="giftNote" maxlength="120" rows="2" placeholder="Escríbele algo en la tarjeta (opcional) 💌"></textarea>
    <div class="sub" style="font-size:12px">El pollito lo guarda envuelto y ${esc(o)} lo abrirá con sorpresa. No sabrá qué es hasta abrirlo 🤫</div>
    <button class="btn primary" id="giftOk" style="width:100%;margin-top:10px">Envolver y dejar el regalo 🎀</button>`);
  fitIcons($("sheetBody"));
  $("giftOk").onclick = () => {
    const note = $("giftNote").value.trim().slice(0, 120); let fail = false;
    petTx(q => {
      if (q.coins < total) { fail = true; return null; }
      q.coins -= total; q.spent = (q.spent || 0) + total;
      const keys = list.map(keyOf);
      q.gifts = [...(q.gifts || []), { id: Date.now().toString(36), keys, from: who, to: other(), note, at: Date.now() }].slice(-10);
      q.wish = q.wish || {}; if (q.wish[other()]) q.wish[other()] = q.wish[other()].filter(k => !keys.includes(k));
      bump(q, "buy"); return q;
    }).then(r => {
      if (fail) return toast("No tenéis suficientes monedas 🪙"); if (!r) return;
      closeSheet(); preview = null; sceneSig = ""; confetti(); buzz([30, 50, 30]);
      coinPop($("shopCoins"), `−${total} 🪙`);
      sendMsg(`🎁 ¡Te he dejado un regalo envuelto! Ve a ver a ${r.name || "la mascota"} para abrirlo 🤫`, "pet");
      renderPet(); setTimeout(() => mirrorCheer(`¡Envuelto! Se lo daré a ${o} en cuanto venga 🎀🤫`), 60);
    }).catch(offline);
  };
}
function giftBoxSVG() {
  return `<svg viewBox="0 0 120 110"><ellipse cx="60" cy="106" rx="50" ry="4" fill="rgba(0,0,0,.25)"/><rect x="14" y="50" width="92" height="54" rx="6" fill="#ff5c8a"/><rect x="52" y="50" width="16" height="54" fill="#ffd23f"/>
    <g class="lid"><rect x="8" y="34" width="104" height="20" rx="5" fill="#ff7aa0"/><rect x="52" y="34" width="16" height="20" fill="#ffd23f"/><path d="M60 34 C44 14 30 22 40 32 C46 36 56 35 60 34 Z M60 34 C76 14 90 22 80 32 C74 36 64 35 60 34 Z" fill="#ffd23f" stroke="#e0a100" stroke-width="1.5"/></g></svg>`;
}
function openGift(gid) {
  const p = state.pet || {}, g = (p.gifts || []).find(x => x.id === gid && x.to === who); if (!g) return toast("Ese regalo ya está abierto");
  const items = g.keys.map(ITK).filter(Boolean);
  const v = $("chestView"), box = $("chestBox"), res = $("chestRes");
  res.classList.add("hidden"); res.innerHTML = ""; v.classList.remove("hidden"); document.body.style.overflow = "hidden";
  box.className = "chestbox giftbox shake"; box.innerHTML = giftBoxSVG(); buzz([20, 40, 20, 40]);
  let done = false;
  const claim = () => petTx(q => {
    const i = (q.gifts || []).findIndex(x => x.id === gid); if (i < 0) return null;
    const G = q.gifts[i]; q.gifts = q.gifts.filter(x => x.id !== gid); settle(q);
    for (const k of G.keys) { const it = ITK(k); if (!it) continue; if (it.cat === "comida") { q.inv[it.id] = (q.inv[it.id] || 0) + 1; continue; } q.owned[k] = true; if (it.slot) q.wear[it.slot] = it.id; else if (it.cat === "color") q.color = it.id; else if (it.cat === "casa") placeFurn(q, it, true); else if (it.cat === "lugar") q.scene = it.id; }
    q.giftLog = [...(q.giftLog || []), { ...G, opened: Date.now() }].slice(-60); logEv(q, "gift"); done = true; return q;
  });
  box.onclick = null;
  setTimeout(() => {
    box.className = "chestbox giftbox open"; buzz(60); confetti();
    const si = Math.max(3, stageOf(p.xp || 0)), wear = { ...(p.wear || {}) }; let color = p.color;
    items.forEach(it => { if (it.slot) wear[it.slot] = it.id; if (it.cat === "color") color = it.id; });
    res.style.setProperty("--rc", "#ff8fb8");
    res.innerHTML = `<div class="revsub">Un regalo de ${esc(name(g.from))} 💝</div>${g.note ? `<div class="gnote">«${esc(g.note)}»</div>` : ""}<div class="revpet">${chickSVG(si, "love", wear, 0, color, { species: p.species })}</div><h3>${items.map(it => (it.e || "🎨") + " " + esc(it.n)).join(" · ")}</h3>
      <div class="row"><button class="btn primary" id="gThanks" style="flex:1">Dar las gracias 💌</button><button class="btn" id="chOk" style="flex:1">¡Qué ilusión!</button></div>`;
    res.classList.remove("hidden");
    claim().then(() => { if (done) { sceneSig = ""; renderPet(); } }).catch(offline);
    const close = () => { v.classList.add("hidden"); document.body.style.overflow = ""; box.className = "chestbox"; };
    $("chOk").onclick = close;
    $("gThanks").onclick = () => { sendMsg(`💌 ¡Gracias por el regalo! ${items.map(it => it.e || "🎨").join("")} Me ha hecho muchísima ilusión 🥹💕`, "text"); toast("Gracias enviadas 💕"); close(); };
  }, 1500);
}

// ---- Premio diario (uno por persona y día) ----
function dailyPrize() {
  const p0 = state.pet || {}; if ((p0.dprize || {})[who] === localKey()) return toast("Ya lo has recogido hoy · vuelve mañana 🎁");
  let got = null, coins = 0, food = null;
  petTx(q => {
    q.dprize = { ...(q.dprize || {}), [who]: localKey() };
    const x = Math.random();
    if (x < .12) { const pool = CATALOG.filter(it => it.slot && !isOwned(q, it) && rarOf(it) <= 2 && !it.chest && !it.lv && !it.req && !it.weekly && !it.season && !it.treasure && it.c > 0); got = pool.length ? rnd(pool) : null; }
    if (got) q.owned[ownKey(got)] = true;
    else if (x < .42) { const F = CATALOG.filter(it => it.cat === "comida" && it.c <= 30 && it.id !== "medicina"); food = rnd(F); q.inv[food.id] = (q.inv[food.id] || 0) + 2; }
    else { coins = rnd([10, 15, 20, 20, 25, 30, 40, 50]); q.coins += coins; }
    return q;
  }).then(r => {
    if (!r) return;
    if (got) { showReveal(null, got, 0, "🎁 Premio diario"); return renderPet(); }
    const M = $("shopMirror"); if (M) { const pet = M.querySelector(".mpet"); if (pet) for (let i = 0; i < 3; i++) setTimeout(() => hearts(pet, food ? food.e : "🪙"), i * 180); }
    buzz([20, 30, 20]); toast(food ? `🎁 ¡2 × ${food.e} ${food.n} a la mochila!` : `🎁 ¡${coins} monedas de premio! 🪙`, 3000);
    if (coins) coinPop($("shopCoins"), `+${coins} 🪙`);
    renderPet(); setTimeout(() => mirrorCheer(food ? `¡${food.e} para merendar! ¡Gracias!` : `¡${coins} monedas! ¡Somos ricos! 🤑`), 60);
  }).catch(offline);
}
// Regalo sin abrir: se ve en la escena
function renderGiftBtn(p) {
  const b = $("petGiftB"); if (!b) return;
  const g = giftsFor(p, who)[0]; b.classList.toggle("hidden", !g || !!tripAway(p));
  if (g) b.onclick = e => { e.stopPropagation(); openGift(g.id); };
}
document.querySelectorAll("#shopTabs button").forEach(b => b.onclick = () => { shopTab = b.dataset.s; ls.set("shopTab", shopTab); preview = null; sceneSig = ""; renderPet(); });


// =====================================================================
//   v38 · IA con memoria, diario y cartas del pollito, Sorpréndeme,
//         Nuestro año, juego en directo, cuenta atrás, libro y fotos ligeras
// =====================================================================
const onceDoc = path => new Promise(res => { let un = null, done = false; un = S.watchDoc(path, d => { if (done) return; done = true; res(d); setTimeout(() => un && un(), 0); }); });
const onceCol = (path, lim) => new Promise(res => { let un = null, done = false; un = S.watchCol(path, l => { if (done) return; done = true; res(l); setTimeout(() => un && un(), 0); }, lim); });
async function aiAsk(system, prompt, max = 400) {
  if (S.demo || !srvUrl()) return null;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(srvUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: CONFIG.pushSecret, type: "chat", system, messages: [{ role: "user", content: prompt }], max }) });
      const j = await r.json(); if (j.ok && j.reply) return String(j.reply).trim(); throw new Error(j.error || "sin respuesta");
    } catch (e) { if (i) { console.warn(e); return null; } await new Promise(r => setTimeout(r, 900)); }
  }
  return null;
}
const petNm = () => (state.pet || {}).name || "Pollito";
const fmtD = (t, o) => fmtDate(t, o || { day: "numeric", month: "long" });

// ---------- 1) Memoria del pollito ----------
let aimem = {};
const memFacts = w => (aimem[w] || []).filter(f => f && f.t);
function watchAiMem() { S.watchDoc("state/aimem", d => { aimem = d || {}; }); }
function memContext() {
  const me = name(who), o = name(other()), mine = memFacts(who).slice(-25), theirs = memFacts(other()).filter(f => !f.s).slice(-15);
  const L = [];
  if (mine.length) L.push(`Cosas que recuerdas porque te las contó ${me}:\n${mine.map(f => `- ${f.t}${f.s ? " (secreto: no se lo digas a " + o + ")" : ""}`).join("\n")}`);
  if (theirs.length) L.push(`Cosas que te contó ${o} (puedes mencionarlas con cariño):\n${theirs.map(f => "- " + f.t).join("\n")}`);
  if (L.length) L.push(`Si viene a cuento, pregunta por algo que recuerdes (por ejemplo cómo le fue algo que tenía que hacer). No repitas siempre lo mismo.`);
  return L.join("\n");
}
async function memExtract() {
  const n = +(ls.get("aiMemN") || 0) + 1; ls.set("aiMemN", String(n));
  const last = aiHist.filter(m => !m.fail).slice(-6), lastU = [...last].reverse().find(m => m.role === "user");
  if (!lastU) return;
  let facts = [];
  if (S.demo || !srvUrl()) {
    if (/(me gusta|me encanta|odio|mañana|tengo (un|una|que)|voy a|mi favorit|examen|cumple)/i.test(lastU.content)) facts = [{ t: `${name(who)} dijo: «${lastU.content.slice(0, 120)}»`, s: /sorpresa|secreto|no se lo digas/i.test(lastU.content) ? 1 : 0 }];
  } else {
    if (n % 3 && lastU.content.length < 40) return;   // ahorramos: solo de vez en cuando o si ha contado algo largo
    const have = memFacts(who).map(f => "- " + f.t).join("\n") || "(nada)";
    const out = await aiAsk(`Extraes recuerdos para la mascota virtual de una pareja (${name("a")} y ${name("b")}). Respondes SOLO con JSON válido, sin texto extra.`,
      `Conversación reciente de ${name(who)} con la mascota:\n${last.map(m => (m.role === "user" ? name(who) : "Mascota") + ": " + m.content).join("\n")}\n\nYa recordados:\n${have}\n\nDevuelve {"facts":[{"t":"frase corta en tercera persona","s":0}]} con como máximo 3 hechos NUEVOS y útiles para recordar más adelante (gustos, planes, fechas, exámenes, viajes, preocupaciones, cosas de ${name(other())}). s=1 si es un secreto o una sorpresa para ${name(other())}. Si no hay nada nuevo: {"facts":[]}`, 300);
    try { const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)); facts = (j.facts || []).filter(f => f && typeof f.t === "string" && f.t.length > 3).slice(0, 3).map(f => ({ t: f.t.slice(0, 160), s: f.s ? 1 : 0 })); } catch (e) { facts = []; }
  }
  if (!facts.length) return;
  const now = Date.now();
  S.tx("state/aimem", d => { d = d || {}; const L = d[who] || [], seen = new Set(L.map(f => f.t.toLowerCase())); d[who] = [...L, ...facts.filter(f => !seen.has(f.t.toLowerCase())).map(f => ({ ...f, at: now }))].slice(-40); return d; }).catch(() => {});
}
function openMemList() {
  const me = memFacts(who), th = memFacts(other()).filter(f => !f.s), o = name(other());
  openSheet(`🧠 Lo que recuerda ${petNm()}`, `<div class="sub" style="margin-bottom:8px">Se acuerda de lo que le contáis para sacarlo otro día. Puedes borrar lo que quieras.</div>
    <div class="slotname">Lo que le has contado tú</div>${me.length ? me.map((f, i) => `<div class="lrow"><span>${f.s ? "🤫 " : ""}${esc(f.t)}</span><button class="x" data-mdel="${i}">✕</button></div>`).join("") : `<div class="empty" style="font-size:14px">Todavía nada. ¡Cuéntale cosas! 💬</div>`}
    <div class="slotname">Lo que le ha contado ${esc(o)}</div>${th.length ? th.map(f => `<div class="lrow"><span>${esc(f.t)}</span></div>`).join("") : `<div class="empty" style="font-size:14px">Nada todavía (los secretos no se ven 🤫)</div>`}
    <button class="btn mt" id="memBack" style="width:100%">‹ Volver a hablar</button>`);
  $("sheetBody").querySelectorAll("[data-mdel]").forEach(b => b.onclick = () => { const f = me[+b.dataset.mdel]; S.tx("state/aimem", d => { d = d || {}; d[who] = (d[who] || []).filter(x => x.t !== f.t); return d; }).then(() => { aimem[who] = (aimem[who] || []).filter(x => x.t !== f.t); openMemList(); }).catch(offline); });
  $("memBack").onclick = openPetChat;
}

// ---------- 2) Diario escrito por la IA ----------
async function petDiaryAI(k, base) {
  const d = diaryDay(k) || {}, md = moods[k] || {};
  const lines = [`Lo que pasó (resumen automático): ${base}`];
  for (const w of ["a", "b"]) { if (d[w] && d[w].text) lines.push(`${name(w)} escribió en su diario: «${d[w].text.slice(0, 300)}»`); if (md[w]) lines.push(`${name(w)} se sentía ${MOOD_TXT[md[w]] || md[w]}.`); }
  const p = state.pet || {}, tr = TRAITS[p.trait];
  return aiAsk(`Eres ${petNm()}, la mascota virtual (${(SPECIES[p.species || "pollito"] || SPECIES.pollito).n.toLowerCase()}${tr ? ", " + tr.n.toLowerCase() : ""}) de ${name("a")} y ${name("b")}, una pareja a distancia. Escribes tu diario en español, en primera persona, con ternura y humor.`,
    `Escribe tu entrada de diario del ${fmtD(new Date(k + "T12:00:00"), { weekday: "long", day: "numeric", month: "long" })} en 2 a 4 frases cortas, con 1 o 2 emojis. Usa SOLO estos datos, sin inventar hechos:\n${lines.join("\n")}\nNo pongas título ni fecha.`, 260);
}

// ---------- 3) Carta semanal del pollito ----------
let weeklies = [], wkChecked = "";
const mondayOf = t => { const d = new Date(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localKey(d); };
function watchWeekly() { S.watchCol("weekly", l => { weeklies = l; renderWeeklyList(); renderHome(); }, 30); }
function weekStats(wk) {
  const t0 = new Date(wk + "T00:00:00").getTime(), t1 = t0 + 7 * DAY, p = state.pet || {}, inR = t => t >= t0 && t < t1;
  const days = Array.from({ length: 7 }, (_, i) => localKey(new Date(t0 + i * DAY + 12 * 36e5)));
  const dy = days.map(diaryDay).filter(Boolean), both = dy.filter(d => d.a && d.b).length;
  const log = (p.log || []).filter(e => inR(e.at)), by = { a: 0, b: 0 }; log.forEach(e => { if (by[e.w] !== undefined) by[e.w] += e.n || 1; });
  const msgs = (state.msgs || []).filter(m => inR(m.at)), mem = (memList || []).filter(m => inR(m.at)), pl = (plans || []).filter(x => x.done && inR(x.doneAt || 0));
  const md = days.map(k => moods[k]).filter(Boolean);
  const texts = dy.flatMap(d => ["a", "b"].filter(w => d[w] && d[w].text).map(w => `${name(w)} (${d.date}): «${d[w].text.slice(0, 160)}»`)).slice(0, 8);
  return { t0, t1, days, diaryDays: dy.length, both, care: by, msgs: msgs.length, mem: mem.map(m => m.text || "una foto").slice(0, 4), plans: pl.map(x => x.text), moods: md.map(m => `${m.a || "·"}/${m.b || "·"}`).join(" "), texts, dh: log.filter(e => e.k === "dhug").length, gifts: log.filter(e => e.k === "gift").length };
}
function weeklyTemplate(wk, s) {
  const pn = petNm(), A = name("a"), B = name("b");
  const L = [`¡Hola, ${A} y ${B}! 💛 Soy ${pn} y os escribo para contaros vuestra semana.`];
  if (s.care.a || s.care.b) L.push(`Esta semana me habéis cuidado un montón: ${A} ${s.care.a} veces y ${B} ${s.care.b}. ${s.care.a === s.care.b ? "¡Empate! 🤝" : `¡Gana ${s.care.a > s.care.b ? A : B}! 🏆`}`);
  if (s.diaryDays) L.push(`Escribisteis en el diario ${s.diaryDays} día${s.diaryDays > 1 ? "s" : ""}${s.both ? `, y ${s.both} de ellos los dos 📖` : " 📖"}.`);
  if (s.msgs) L.push(`Os habéis dejado ${s.msgs} mensajes en el buzón 💌.`);
  if (s.mem.length) L.push(`Guardasteis recuerdos nuevos 📸.`);
  if (s.plans.length) L.push(`¡Y cumplisteis ${s.plans.length} plan${s.plans.length > 1 ? "es" : ""}! 🎉`);
  if (s.dh) L.push(`Me disteis ${s.dh} abrazo${s.dh > 1 ? "s" : ""} doble${s.dh > 1 ? "s" : ""} 🤗💞`);
  L.push(`La semana que viene quiero más mimos y más fotos vuestras. Os quiero mucho a los dos.\n\nCon amor,\n${pn} 🐤`);
  return L.join("\n\n");
}
async function weeklyCheck() {
  if (!state.pet || !hatched() || !diaryLoaded) return;
  const now = new Date(), h = now.getHours(), dow = now.getDay();
  const wk = dow === 0 && h >= 18 ? mondayOf(now) : mondayOf(now.getTime() - 7 * DAY);
  if (wkChecked === wk) return; wkChecked = wk;
  if (new Date(wk + "T00:00:00").getTime() < ((state.pet || {}).hatchedAt || Date.now()) - 7 * DAY) return;
  const ex = await onceDoc("weekly/" + wk); if (ex && ex.text) return;
  const s = weekStats(wk);
  const pn = petNm(), prompt = `Datos de la semana del ${fmtD(s.t0)} al ${fmtD(s.t1 - DAY)}:
- Veces que te cuidó cada uno: ${name("a")} ${s.care.a}, ${name("b")} ${s.care.b}
- Días con diario: ${s.diaryDays} (los dos: ${s.both})
- Mensajes en el buzón: ${s.msgs}
- Recuerdos nuevos: ${s.mem.join("; ") || "ninguno"}
- Planes cumplidos: ${s.plans.join("; ") || "ninguno"}
- Abrazos dobles: ${s.dh}
- Estados de ánimo (${name("a")}/${name("b")}): ${s.moods || "sin datos"}
${s.texts.length ? "- Cosas que escribieron:\n" + s.texts.join("\n") : ""}
${memContext()}
Escribe la carta.`;
  let text = await aiAsk(`Eres ${pn}, la mascota virtual de ${name("a")} y ${name("b")}, una pareja que vive a distancia. Escribes en español una carta semanal cariñosa y graciosa para los dos: 6 a 9 frases, menciona cosas concretas de los datos (sin inventar), celebra lo bonito, anima con lo difícil y termina deseándoles una buena semana y firmando como ${pn}. Sin título.`, prompt, 700);
  if (!text) text = weeklyTemplate(wk, s);
  let made = false;
  await S.tx("weekly/" + wk, d => { if (d && d.text) return null; made = true; return { wk, text, at: Date.now(), by: who, ai: S.demo || !srvUrl() ? 0 : 1 }; }).catch(() => {});
  if (made) { notifyOther(`💌 ${pn} os ha escrito la carta de la semana`); toast(`💌 ¡${pn} os ha escrito la carta de la semana!`, 3500); }
}
function openWeekly(w) {
  if (!w) return; ls.set("wkRead:" + w.wk, "1");
  readView({ icon: "💌", title: `Carta de ${petNm()}`, sub: `Semana del ${fmtD(new Date(w.wk + "T12:00:00"))}`, text: w.text });
  renderHome(); renderWeeklyList();
}
function renderWeeklyList() {
  const el = $("wkList"); if (!el) return;
  el.innerHTML = weeklies.length ? weeklies.map(w => `<button class="wkit ${ls.get("wkRead:" + w.wk) ? "" : "new"}" data-wk="${esc(w.wk)}"><i>💌</i><div><b>Semana del ${esc(fmtD(new Date(w.wk + "T12:00:00")))}</b><small>${esc(String(w.text).slice(0, 70))}…</small></div></button>`).join("") : `<div class="empty" style="font-size:14px">Cada domingo por la tarde ${esc(petNm())} os escribe una carta con vuestra semana 💌</div>`;
  el.querySelectorAll("[data-wk]").forEach(b => b.onclick = () => openWeekly(weeklies.find(w => w.wk === b.dataset.wk)));
}

// ---------- 5) Sorpréndeme ----------
const SURP = {
  cita: ["🎬 Cine a la vez|Elegid una peli, dadle al play a la vez y comentadla por videollamada con palomitas 🍿", "🍝 Cena juntos a distancia|Cocinad la misma receta cada uno en su casa y cenad por videollamada 🕯️", "🗺️ Paseo virtual|Abrid Google Street View y pasead juntos por la ciudad de vuestro próximo viaje", "🎨 Pintamos lo mismo|Poned un temporizador de 15 minutos y dibujad lo mismo cada uno. ¡Luego os lo enseñáis!", "🎮 Noche de juegos|Jugad a 4 en raya y al ahorcado en la app y el que pierda elige la próxima peli", "⭐ Mirar las estrellas|Salid a la vez a mirar el cielo y contaos qué veis cada uno 🌙"],
  pregunta: ["💭 ¿Cuál es el recuerdo nuestro que más te hace sonreír?", "💭 Si pudiéramos vivir un año en cualquier país, ¿cuál elegirías y por qué?", "💭 ¿Qué es lo primero que quieres hacer cuando nos veamos?", "💭 ¿Qué canción te recuerda a mí?", "💭 ¿Qué pequeña cosa hago que te enamora sin que yo lo sepa?", "💭 ¿Cómo te imaginas un domingo perfecto juntos dentro de 5 años?"],
  reto: ["🎯 Mándale un audio de 30 segundos diciéndole 3 cosas que te encantan de él/ella", "🎯 Haced una foto a la vez de lo que veis ahora mismo y compartidla", "🎯 Escribid cada uno una carta en «Ábrelo cuando…» esta noche", "🎯 Poneos la misma canción a la vez y bailadla (vale grabarlo 😆)", "🎯 Contaos un secreto tonto que nunca os hayáis dicho", "🎯 Planead juntos vuestra próxima escapada en Planes"],
  detalle: ["🎁 Mándale una postal de verdad por correo con una foto vuestra", "🎁 Pídele a domicilio su comida favorita por sorpresa", "🎁 Hazle una playlist con canciones que os recuerdan a los dos", "🎁 Déjale un vale en la tienda de vales: «un día entero de mimos»", "🎁 Grábale un vídeo corto contándole por qué le quieres"]
};
const SURP_T = { cita: ["💡", "Una cita a distancia"], pregunta: ["💬", "Una pregunta para hablar"], reto: ["🎯", "Un reto para hoy"], detalle: ["🎁", "Un detalle para " ] };
let surpLast = null;
function openSurprise() {
  const o = name(other());
  openSheet("✨ Sorpréndeme", `<div class="sub" style="margin-bottom:10px">${esc(petNm())} os propone algo pensado para vosotros 💞</div><div class="surpgrid">${Object.entries(SURP_T).map(([k, [e, t]]) => `<button class="surpb" data-sk="${k}"><i>${e}</i>${esc(k === "detalle" ? t + o : t)}</button>`).join("")}</div><div id="surpOut"></div>`);
  $("sheetBody").querySelectorAll("[data-sk]").forEach(b => b.onclick = () => surprise(b.dataset.sk));
}
async function surprise(k) {
  const out = $("surpOut"); if (!out) return; out.innerHTML = `<div class="surpcard load">${esc(petNm())} está pensando… 🤔</div>`;
  const o = name(other()), me = name(who), days = CONFIG.start ? Math.floor((Date.now() - new Date(CONFIG.start + "T00:00:00")) / DAY) : null, nx = state.main.next && state.main.next > Date.now() ? Math.ceil((state.main.next - Date.now()) / DAY) : null;
  const otz = (state.main.tz || {})[other()] || myTz;
  let txt = await aiAsk(`Eres ${petNm()}, la mascota de ${name("a")} y ${name("b")}, una pareja a distancia. Propones ideas originales, concretas y bonitas en español.`,
    `Pide: ${({ cita: "una idea de cita a distancia para hacer juntos", pregunta: "una pregunta bonita y profunda (o divertida) para que se hagan", reto: "un reto pequeño y romántico/divertido para hoy", detalle: `una idea de detalle o sorpresa que ${me} puede hacerle a ${o} a distancia` })[k]}.
Contexto: llevan ${days ?? "?"} días juntos${nx ? `, se ven en ${nx} días` : ""}. Ahora son las ${fmt(myTz, { hour: "2-digit", minute: "2-digit" })} para ${me} y las ${fmt(otz, { hour: "2-digit", minute: "2-digit" })} para ${o}.
${memContext()}
${surpLast ? "No repitas esto: " + surpLast : ""}
Responde SOLO en este formato, en una línea: EMOJI Título corto|Explicación en 1 o 2 frases`, 220);
  if (!txt || !txt.includes("|")) { const L = SURP[k].filter(x => x !== surpLast); txt = L[Math.floor(Math.random() * L.length)]; if (!txt.includes("|")) txt = txt.slice(0, 2).trim() + " " + SURP_T[k][1] + "|" + txt.slice(2).trim(); }
  surpLast = txt;
  const [t, d] = txt.split("|").map(x => x.trim());
  out.innerHTML = `<div class="surpcard"><b>${esc(t)}</b><p>${esc(d || "")}</p><div class="row"><button class="btn" id="spAgain">🔁 Otra</button><button class="btn" id="spPlan">📝 A planes</button><button class="btn primary" id="spSend">💌 A ${esc(o)}</button></div></div>`;
  $("spAgain").onclick = () => surprise(k);
  $("spPlan").onclick = () => { S.add("plans", { text: (t + (d ? " — " + d : "")).slice(0, 120), cat: "✨", from: who, done: false, at: Date.now() }); toast("Guardado en Planes 📝"); };
  $("spSend").onclick = () => { sendMsg(`✨ ${t}${d ? "\n" + d : ""}`, "text"); toast(`Enviado a ${o} 💌`); };
}

// ---------- 6) Nuestro año ----------
const STOP = new Set("de la que el en y a los se del las un por con no una su para es al lo como más o pero sus le ya muy me mi te tu yo tú si sí qué que eso esto está estoy hoy ha he has hay mucho también bien vale jaja jajaja ok pues porque cuando todo nada así ahora eres soy son era fue ser hacer tengo tienes tiene nos os lo la le les".split(" "));
async function wrapStats() {
  const start = CONFIG.start ? new Date(CONFIG.start + "T00:00:00").getTime() : Date.now() - 365 * DAY;
  const from = Math.max(start, Date.now() - 366 * DAY), p = state.pet || {};
  const [msgs, dys, mems] = await Promise.all([onceCol("messages", 3000), onceCol("diary", 400), Promise.resolve(memList || [])]);
  const M = msgs.filter(m => m.at >= from && REAL_KINDS.includes(m.kind || "text"));
  const by = { a: 0, b: 0 }; M.forEach(m => { if (by[m.from] !== undefined) by[m.from]++; });
  const words = {}, emo = {};
  M.forEach(m => { const t = String(m.text || "").toLowerCase(); (t.match(/\p{Extended_Pictographic}/gu) || []).forEach(e => { emo[e] = (emo[e] || 0) + 1; }); (t.match(/\p{L}{3,}/gu) || []).forEach(w => { if (!STOP.has(w)) words[w] = (words[w] || 0) + 1; }); });
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const perDay = {}; M.forEach(m => { const k = localKey(new Date(m.at)); perDay[k] = (perDay[k] || 0) + 1; });
  const busy = top(perDay)[0];
  const D = dys.filter(d => d.at >= from), dBoth = D.filter(d => d.a && d.b).length;
  const moodC = {}; Object.values(moods).forEach(m => ["a", "b"].forEach(w => { if (m[w]) moodC[m[w]] = (moodC[m[w]] || 0) + 1; }));
  const ME = mems.filter(m => m.at >= from), places = new Set(ME.filter(m => m.place).map(m => m.place)), countries = new Set(ME.filter(m => m.country).map(m => m.country));
  return {
    from, days: Math.floor((Date.now() - start) / DAY), msgs: M.length, by, emoji: top(emo).slice(0, 3).map(x => x[0]), word: (top(words)[0] || [])[0], busy,
    diary: D.length, dBoth, mood: (top(moodC)[0] || [])[0], mems: ME.length, photos: ME.filter(m => m.photo || m.thumb).length, places: places.size, countries: countries.size,
    plansDone: (plans || []).filter(x => x.done).length, plansTodo: (plans || []).filter(x => !x.done).length, letters: (letters || []).length, caps: (caps || []).length,
    pet: { name: p.name || "Pollito", born: p.hatchedAt, xp: p.xp || 0, hugs: p.hugs || 0, best: p.best || 0, spent: p.spent || 0, gifts: (p.giftLog || []).length, trips: Object.keys(p.postcards || {}).length, lvl: levelOf(p.exp).l, words: (p.words || []).filter(w => w.said).length }
  };
}
let WR = null, wrI = 0, wrTimer = 0;
async function openWrapped() {
  const v = $("wrapView"); v.classList.remove("hidden"); document.body.style.overflow = "hidden";
  v.innerHTML = `<div class="wrload"><div class="wrspin">🐤</div>Preparando vuestro año…</div>`;
  let s; try { s = await wrapStats(); } catch (e) { console.error(e); v.classList.add("hidden"); document.body.style.overflow = ""; return toast("No he podido cargar los datos 📶"); }
  const A = name("a"), B = name("b"), pct = s.msgs ? Math.round(s.by.a / s.msgs * 100) : 50, yrs = s.days >= 365 ? Math.floor(s.days / 365) : 0;
  const first = yrs === 1 ? "Vuestro primer año" : yrs > 1 ? `Vuestros ${yrs} años` : "Vuestra historia";
  const petS = state.pet ? chickSVG(Math.max(1, stageOf(state.pet.xp || 0)), "love", state.pet.wear || {}, 0, state.pet.color, { species: state.pet.species }) : "";
  const S1 = [
    { bg: "g1", html: `<small>Nosotros · ${esc(A)} y ${esc(B)}</small><h1>${first} 💞</h1><p>${esc(fmtD(new Date(CONFIG.start + "T12:00:00"), { day: "numeric", month: "long", year: "numeric" }))} → hoy</p><div class="wrpet">${petS}</div>` },
    { bg: "g2", html: `<small>Lleváis juntos</small><div class="big" data-n="${s.days}">0</div><h2>días</h2><p>Son ${(s.days * 24).toLocaleString("es-ES")} horas queriéndoos, aunque sea a distancia ✈️</p>` },
    { bg: "g3", html: `<small>En el buzón os habéis dejado</small><div class="big" data-n="${s.msgs}">0</div><h2>mensajes 💌</h2><div class="wrbar"><span style="width:${pct}%">${esc(A)} ${pct}%</span><span>${esc(B)} ${100 - pct}%</span></div>${s.busy && s.busy[1] > 1 ? `<p>El día que más hablasteis fue el ${esc(fmtD(new Date(s.busy[0] + "T12:00:00")))}: ${s.busy[1]} mensajes 🔥</p>` : ""}` },
    { bg: "g4", html: `<small>Vuestras palabras</small>${s.emoji.length ? `<div class="wremo">${s.emoji.join(" ")}</div><p>Vuestros emojis favoritos</p>` : ""}${s.word ? `<h2>«${esc(s.word)}»</h2><p>es la palabra que más os escribís 🥹</p>` : `<p>Aún os estáis conociendo por escrito ✍️</p>`}` },
    { bg: "g5", html: `<small>Vuestro diario</small><div class="big" data-n="${s.diary}">0</div><h2>días escritos 📖</h2><p>${s.dBoth} de ellos escribisteis los dos${s.mood ? ` · el ánimo que más se repite: ${s.mood}` : ""}</p>` },
    { bg: "g6", html: `<small>Recuerdos</small><div class="big" data-n="${s.mems}">0</div><h2>recuerdos guardados 📸</h2><p>${s.places ? `En ${s.places} lugar${s.places > 1 ? "es" : ""}${s.countries > 1 ? ` de ${s.countries} países` : ""} 🗺️` : "¡Llenad el mapa este año! 🗺️"}</p>` },
    { bg: "g7", html: `<small>${esc(s.pet.name)}</small><div class="wrpet sm">${petS}</div><div class="wrgrid"><div><b data-n="${s.pet.xp}">0</b>días cuidándole juntos</div><div><b data-n="${s.pet.hugs}">0</b>mimos</div><div><b data-n="${s.pet.best}">0</b>días de racha máxima</div><div><b data-n="${s.pet.lvl}">0</b>nivel</div><div><b data-n="${s.pet.gifts}">0</b>regalos</div><div><b data-n="${s.pet.trips}">0</b>postales</div></div>` },
    { bg: "g8", html: `<small>Planes</small><div class="big" data-n="${s.plansDone}">0</div><h2>planes cumplidos ✅</h2><p>…y ${s.plansTodo} esperándoos. ${s.letters ? `Además os habéis escrito ${s.letters} cartas 💌` : ""}</p>` },
    { bg: "g9", ai: 1, html: `<small>${esc(s.pet.name)} tiene algo que deciros</small><div class="wrletter" id="wrAi">…</div>` },
    { bg: "g1", html: `<h1>Por muchos más 🥂</h1><p>Gracias por cuidaros tanto, ${esc(A)} y ${esc(B)} 💛</p><div class="wrpet">${petS}</div><div class="row wrbtns"><button class="btn" id="wrAgain">↺ Otra vez</button><button class="btn primary" id="wrShare">💌 Avisar a ${esc(name(other()))}</button></div>` }
  ];
  WR = { s, slides: S1 }; wrI = 0;
  v.innerHTML = `<div class="wrbars">${S1.map(() => `<i><b></b></i>`).join("")}</div><button class="wrx" id="wrX">✕</button><div class="wrstage" id="wrStage"></div><div class="wrtap l" id="wrL"></div><div class="wrtap r" id="wrR"></div>`;
  $("wrX").onclick = closeWrapped; $("wrL").onclick = () => wrGo(wrI - 1); $("wrR").onclick = () => wrGo(wrI + 1);
  wrGo(0);
  const pn = s.pet.name;
  aiAsk(`Eres ${pn}, la mascota virtual de ${A} y ${B}, una pareja a distancia. Escribes en español, con mucha ternura y algo de humor.`,
    `Hoy les enseñas el resumen de su año. Datos: ${s.days} días juntos, ${s.msgs} mensajes (${A} ${pct}%), ${s.diary} días de diario, ${s.mems} recuerdos en ${s.places} lugares, ${s.plansDone} planes cumplidos, ${s.pet.xp} días cuidándote, ${s.pet.hugs} mimos. ${s.word ? "Palabra más usada: " + s.word + "." : ""}\n${memContext()}\nEscríbeles un mensaje de 4 a 6 frases diciéndoles lo que piensas de ellos como pareja, con algún detalle concreto, y firma como ${pn}.`, 450)
    .then(t => { WR.ai = t || `Os he visto quereros cada día, aunque haya kilómetros de por medio. Os escribís, os cuidáis, me cuidáis a mí… y eso es lo más bonito que conozco. Estoy muy orgulloso de ser vuestro ${pn.toLowerCase() === "pollito" ? "pollito" : "peque"}. ¡A por otro año juntos! 💛\n\n— ${pn} 🐤`; const e = $("wrAi"); if (e) e.textContent = WR.ai; });
}
function wrGo(i) {
  if (!WR) return; if (i < 0) i = 0; if (i >= WR.slides.length) return closeWrapped();
  wrI = i; const sl = WR.slides[i], st = $("wrStage");
  st.className = "wrstage " + sl.bg; st.innerHTML = `<div class="wrs">${sl.html}</div>`;
  if (sl.ai) { const e = $("wrAi"); if (e && WR.ai) e.textContent = WR.ai; }
  document.querySelectorAll("#wrapView .wrbars i").forEach((b, k) => b.className = k < i ? "done" : k === i ? "on" : "");
  st.querySelectorAll("[data-n]").forEach(el => { const n = +el.dataset.n, t0 = performance.now(); const f = t => { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))).toLocaleString("es-ES"); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  if (i === WR.slides.length - 1) { confetti(); $("wrAgain").onclick = e => { e.stopPropagation(); wrGo(0); }; $("wrShare").onclick = e => { e.stopPropagation(); sendMsg("🎉 He visto nuestro año en la app… ¡míralo tú también! 🥹💞 (Inicio → Nuestro año)", "text"); toast("Enviado 💌"); }; }
  buzz(10);
}
function closeWrapped() { $("wrapView").classList.add("hidden"); document.body.style.overflow = ""; WR = null; ls.set("wrapSeen", localKey()); renderHome(); }

// ---------- 7) Juego en directo ----------
const LQ = [
  { t: "¿Quién es más probable que se quede dormido en una peli?", w: 1 }, { t: "¿Quién dice antes «te quiero»?", w: 1 }, { t: "¿Quién se pierde más con el móvil en la mano?", w: 1 },
  { t: "¿Quién come más dulces?", w: 1 }, { t: "¿Quién llora más con las películas?", w: 1 }, { t: "¿Quién ronca más?", w: 1 }, { t: "¿Quién tarda más en arreglarse?", w: 1 },
  { t: "¿Quién es más celoso/a?", w: 1 }, { t: "¿Quién pide perdón primero?", w: 1 }, { t: "¿Quién se ríe más de sus propios chistes?", w: 1 }, { t: "¿Quién cocina mejor?", w: 1 },
  { t: "¿Quién escribe primero por la mañana?", w: 1 }, { t: "¿Quién sería peor en un concurso de baile?", w: 1 }, { t: "¿Quién gasta más en caprichos?", w: 1 }, { t: "¿Quién es más cabezota?", w: 1 },
  { t: "¿Quién se enamoró primero?", w: 1 }, { t: "¿Quién sobreviviría más en una isla desierta?", w: 1 }, { t: "¿Quién es más romántico/a?", w: 1 },
  { t: "¿Playa o montaña?", o: ["🏖️ Playa", "⛰️ Montaña"] }, { t: "¿Pizza o sushi?", o: ["🍕 Pizza", "🍣 Sushi"] }, { t: "¿Madrugar o trasnochar?", o: ["🌅 Madrugar", "🌙 Trasnochar"] },
  { t: "¿Perros o gatos?", o: ["🐶 Perros", "🐱 Gatos"] }, { t: "¿Peli en casa o salir de fiesta?", o: ["🛋️ Peli en casa", "🪩 Fiesta"] }, { t: "¿Dulce o salado?", o: ["🍩 Dulce", "🥨 Salado"] },
  { t: "¿Frío o calor?", o: ["❄️ Frío", "☀️ Calor"] }, { t: "¿Viaje organizado o improvisar?", o: ["🗂️ Organizado", "🎲 Improvisar"] }, { t: "¿Mensaje o llamada?", o: ["💬 Mensaje", "📞 Llamada"] },
  { t: "¿Desayuno en la cama o cena romántica?", o: ["🥐 Desayuno", "🕯️ Cena"] }, { t: "¿Casa en el campo o piso en la ciudad?", o: ["🏡 Campo", "🏙️ Ciudad"] }, { t: "¿Series o películas?", o: ["📺 Series", "🎬 Pelis"] },
  { t: "¿Café o té?", o: ["☕ Café", "🍵 Té"] }, { t: "¿Abrazo o beso?", o: ["🤗 Abrazo", "😘 Beso"] }, { t: "¿Invierno o verano?", o: ["⛄ Invierno", "🏝️ Verano"] }, { t: "¿Tortilla con o sin cebolla?", o: ["🧅 Con", "🥔 Sin"] }
];
const LIVE_N = 8;
let live = null, liveAdvT = 0, liveShown = "";
function watchLive() { S.watchDoc("games/live", d => { live = d; renderLive(); }); }
const liveFresh = d => d && ((d.st === "invite" && Date.now() - d.at < 10 * 6e4) || (d.st === "play" && Date.now() - (d.t || d.at) < 20 * 6e4) || (d.st === "end" && Date.now() - (d.t || d.at) < 2 * 6e4));
function liveInvite() {
  const qs = LQ.map((_, i) => i).sort(() => Math.random() - .5).slice(0, LIVE_N);
  S.tx("games/live", () => ({ st: "invite", by: who, at: Date.now(), t: Date.now(), qs, r: 0, ans: {} })).then(() => {
    notifyOther(`🎮 ${name(who)} te invita a jugar en directo · ¡entra ya!`);
    toast(partnerOnline() ? `Invitación enviada a ${name(other())} 🎮` : `Invitación enviada. Le llegará un aviso 🔔`, 3000);
  }).catch(offline);
}
function liveTx(fn) { return S.tx("games/live", d => { if (!d) return null; const n = fn(JSON.parse(JSON.stringify(d))); if (n) n.t = Date.now(); return n; }); }
function liveAnswer(v) { const r = live.r; buzz(20); liveTx(d => { if (d.st !== "play" || d.r !== r) return null; d.ans = d.ans || {}; d.ans[r] = { ...(d.ans[r] || {}), [who]: v }; return d; }).catch(offline); }
function liveScore(d) { let n = 0; for (let i = 0; i < (d.qs || []).length; i++) { const a = (d.ans || {})[i]; if (a && a.a !== undefined && a.a === a.b) n++; } return n; }
function liveCardOnly() { const c = $("liveCard"); if (c && live !== undefined) renderLive(true); }
function renderLive(cardOnly) {
  const card = $("liveCard"), d = live, o = name(other()), fresh = liveFresh(d);
  if (card) {
    const on = partnerOnline();
    card.innerHTML = `<div class="label">Jugar juntos en directo 🎮</div><div class="sub" style="margin-bottom:10px">${on ? `🟢 ${esc(o)} está en la app ahora mismo. ¡Es el momento!` : `Cuando estéis los dos en la app, contestad a la vez y descubrid cuánto coincidís 💞`}</div>
      ${fresh && d.st === "invite" && d.by === who ? `<button class="btn" disabled style="width:100%">⏳ Esperando a ${esc(o)}…</button>` : fresh && d.st === "play" ? `<button class="btn primary" id="liveOpen" style="width:100%">▶️ Volver a la partida</button>` : `<button class="btn primary" id="liveGo" style="width:100%">🎮 Invitar a ${esc(o)} a jugar</button>`}`;
    const g = $("liveGo"); if (g) g.onclick = liveInvite; const lo = $("liveOpen"); if (lo) lo.onclick = () => { liveShown = ""; drawLive(); };
  }
  const ban = $("liveBan");
  if (ban) { const inv = fresh && d.st === "invite" && d.by !== who; ban.classList.toggle("hidden", !inv); if (inv) { ban.innerHTML = `<span>🎮 <b>${esc(name(d.by))}</b> te invita a jugar en directo</span><button class="btn primary" id="liveYes">¡Vamos!</button><button class="x" id="liveNo">✕</button>`; $("liveYes").onclick = () => liveTx(x => (x.st === "invite" ? { ...x, st: "play", at: Date.now() } : null)).catch(offline); $("liveNo").onclick = () => { ban.classList.add("hidden"); liveTx(x => (x.st === "invite" ? { ...x, st: "no" } : null)).catch(() => {}); }; } }
  if (cardOnly) return;
  if (d && d.st === "no" && d.by === who && Date.now() - d.t < 6e4 && liveShown !== "no" + d.t) { liveShown = "no" + d.t; toast(`${o} ahora no puede jugar 🙈`); }
  drawLive();
}
function drawLive() {
  const v = $("liveView"), d = live; if (!v) return;
  const on = d && liveFresh(d) && (d.st === "play" || d.st === "end");
  if (!on) { if (!v.classList.contains("hidden")) { v.classList.add("hidden"); document.body.style.overflow = ""; } return; }
  if (d.st === "end" && ls.get("liveEndSeen") === String(d.at)) { v.classList.add("hidden"); return; }
  v.classList.remove("hidden"); document.body.style.overflow = "hidden";
  const A = name("a"), B = name("b"), q = LQ[(d.qs || [])[d.r]] || LQ[0], a = (d.ans || {})[d.r] || {}, mine = a[who], both = a.a !== undefined && a.b !== undefined;
  if (d.st === "end") {
    const sc = liveScore(d), n = (d.qs || []).length;
    v.innerHTML = `<div class="lvbox"><div class="lvtop">🎮 Fin de la partida</div><div class="lvscore">${sc}<small>/${n}</small></div><h3>${sc === n ? "¡Almas gemelas! 💞" : sc >= n * .7 ? "¡Os conocéis de maravilla! 🥰" : sc >= n * .4 ? "¡Nada mal! 😄" : "¡Polos opuestos se atraen! 🧲"}</h3><p class="sub">Coincidencias entre ${esc(A)} y ${esc(B)}</p><div class="row"><button class="btn" id="lvClose" style="flex:1">Cerrar</button><button class="btn primary" id="lvAgain" style="flex:1">Otra 🔁</button></div></div>`;
    if (liveShown !== "end" + d.at) { liveShown = "end" + d.at; confetti(); let got = false; petTx(q2 => { if ((q2.day || {}).live) return null; q2.day.live = 1; q2.coins += 20; gainExp(q2, 10); logEv(q2, "game"); got = true; return q2; }).then(() => { if (got) toast("🎮 ¡Partida en directo! +20 🪙 para el pollito", 3000); }).catch(() => {}); }
    $("lvClose").onclick = () => { ls.set("liveEndSeen", String(d.at)); v.classList.add("hidden"); document.body.style.overflow = ""; };
    $("lvAgain").onclick = () => { ls.set("liveEndSeen", String(d.at)); liveInvite(); v.classList.add("hidden"); document.body.style.overflow = ""; };
    return;
  }
  const opts = q.w ? [["a", A], ["b", B]] : [[0, q.o[0]], [1, q.o[1]]];
  const lab = x => (opts.find(o => String(o[0]) === String(x)) || [0, "?"])[1];
  const match = both && a.a === a.b;
  v.innerHTML = `<div class="lvbox"><div class="lvtop">🎮 En directo · ${d.r + 1}/${(d.qs || []).length} <span>💞 ${liveScore(d)}</span></div><h2 class="lvq">${esc(q.t)}</h2>
    ${both ? `<div class="lvrev ${match ? "ok" : "ko"}"><div><small>${esc(A)}</small><b>${esc(lab(a.a))}</b></div><div><small>${esc(B)}</small><b>${esc(lab(a.b))}</b></div></div><h3>${match ? "¡Coincidís! 💞" : "¡Uy, no coincidís! 😆"}</h3>`
      : `<div class="lvopts">${opts.map(([k, t]) => `<button class="lvo ${String(mine) === String(k) ? "on" : ""}" data-v="${k}">${esc(t)}</button>`).join("")}</div><div class="sub" style="text-align:center">${mine !== undefined ? `Esperando a ${esc(name(other()))}… ⏳` : a[other()] !== undefined ? `${esc(name(other()))} ya ha contestado 👀` : "Contestad a la vez"}</div>`}
    <button class="linkbtn lvquit" id="lvQuit">Salir de la partida</button></div>`;
  v.querySelectorAll("[data-v]").forEach(b => b.onclick = () => liveAnswer(q.w ? b.dataset.v : +b.dataset.v));
  $("lvQuit").onclick = () => { if (confirm("¿Salir de la partida?")) liveTx(x => ({ ...x, st: "end" })).catch(() => {}); };
  if (both) { if (match && liveShown !== "m" + d.at + d.r) { liveShown = "m" + d.at + d.r; buzz([30, 40, 30]); } clearTimeout(liveAdvT); const r = d.r; liveAdvT = setTimeout(() => liveTx(x => (x.st === "play" && x.r === r ? (r + 1 >= (x.qs || []).length ? { ...x, st: "end" } : { ...x, r: r + 1 }) : null)).catch(() => {}), 2600); }
}

// ---------- 8) Cuenta atrás para veros ----------
let meetT = 0;
function renderMeet() {
  const el = $("meetCard"); if (!el) return;
  const nx = state.main.next, now = Date.now(), o = name(other()), m = state.main;
  const bogus = nx && m.nextSet && nx - m.nextSet < 30 * 6e4;
  const setTog = () => { S.merge("state/main", { together: true, togetherAt: Date.now(), next: null, nextSet: null }); confetti(); toast("💞 ¡A disfrutar juntos!"); };
  if (m.together) {
    const d = Math.max(0, -calDays(m.togetherAt || now));
    el.innerHTML = `<div class="label">Ahora estáis juntos 💞</div><div class="togeth"><span>🥰</span><b>¡Disfrutad mucho!</b><small>${d ? `Juntos desde hace ${d} ${d === 1 ? "día" : "días"}` : "Juntos desde hoy"}</small></div>
      <button class="btn primary" id="meetApart" style="width:100%">✈️ Ya nos hemos separado · poner la próxima fecha</button>`;
    $("meetApart").onclick = () => S.merge("state/main", { together: false, togetherAt: null });
    return;
  }
  if (!nx || nx < now - DAY || bogus) {
    el.innerHTML = `<div class="label">¿Cuándo os veis? ✈️</div><div class="sub">Poned la fecha y empezará la cuenta atrás para los dos.</div><div class="row mt"><input type="datetime-local" id="meetIn"><button class="btn primary" id="meetSet">Guardar</button></div>`;
    el.insertAdjacentHTML("beforeend", `<button class="linkbtn" id="meetTog" style="display:block;margin:10px auto 0">💞 Ahora mismo estamos juntos</button>`); $("meetTog").onclick = setTog;
    $("meetSet").onclick = () => { const v = $("meetIn").value; if (!v) return toast("Elige fecha y hora"); if (new Date(v).getTime() < Date.now() + 10 * 6e4) return toast("Esa fecha ya ha pasado: elige una futura ✈️"); S.merge("state/main", { next: new Date(v).getTime(), nextSet: Date.now(), meetPlan: [], meetNote: {} }); sendMsg(`✈️ ¡Ya tenemos fecha! Nos vemos el ${fmtD(new Date(v).getTime(), { weekday: "long", day: "numeric", month: "long" })} 🥹`, "text"); };
    return;
  }
  const here = nx <= now, ms = Math.max(0, nx - now), set = m.nextSet && m.nextSet < nx ? m.nextSet : nx - 30 * DAY, pct = Math.min(100, Math.max(2, (now - set) / (nx - set) * 100));
  const plan = m.meetPlan || [], notes = m.meetNote || {}, mineN = notes[who], theirN = notes[other()];
  el.innerHTML = `<div class="label">${here ? "¡Hoy os veis! 🥹" : "Cuenta atrás para veros ✈️"}</div>
    <div class="cdown" id="cdown"></div>
    ${here ? `<div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" id="meetYes" style="flex:1">💞 ¡Ya estamos juntos!</button><button class="btn" id="meetNo" style="flex:1">😕 Hoy no nos vemos</button></div>` : ""}
    <div class="cdbar"><i style="width:${pct.toFixed(1)}%"></i><span style="left:${pct.toFixed(1)}%">✈️</span></div>
    <div class="sub" style="text-align:center;margin-top:6px">${esc(fmtD(nx, { weekday: "long", day: "numeric", month: "long" }))} · ${esc(fmt(myTz, { hour: "2-digit", minute: "2-digit" }))} ahora</div>
    ${meetPetHTML(nx)}
    <div class="slotname">📝 Lo que haremos ese día</div>
    ${plan.length ? plan.map((x, i) => `<div class="lrow"><span>${esc(x.t)} <small>· ${esc(name(x.by))}</small></span>${x.by === who ? `<button class="x" data-mp="${i}">✕</button>` : ""}</div>`).join("") : `<div class="empty" style="font-size:13.5px">Apuntad todo lo que queréis hacer cuando os veáis 💞</div>`}
    <div class="sendrow"><input id="mpIn" placeholder="Cenar juntos, un abrazo…" maxlength="80"><button class="btn primary" id="mpAdd">+</button></div>
    <div class="slotname">💌 Sobres para ese día</div>
    <div class="mnotes"><div class="mnote2 ${theirN ? "has" : ""}">${theirN ? (here ? `<b>De ${esc(o)}:</b> ${esc(theirN.t)}` : `🔒 ${esc(o)} te ha dejado un sobre. Se abre cuando os veáis`) : `${esc(o)} aún no ha dejado sobre`}</div>
    <div class="mnote2 mine">${mineN ? `✅ Tu sobre está guardado${here ? `: ${esc(mineN.t)}` : " 🤫"}` : `<textarea id="mnIn" rows="2" maxlength="300" placeholder="Escribe algo para que ${esc(o)} lo lea ese día…"></textarea><button class="btn" id="mnSave">Guardar sobre 💌</button>`}</div></div>
    ${spOn() ? `<button class="meetsp" id="meetSp">🌶️ <span><b>Vuestro plan privado</b><small>Las posturas que queréis probar los dos</small></span><i>›</i></button>` : ""}
    <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:6px 18px;margin-top:8px"><button class="linkbtn" id="meetEdit">Cambiar la fecha</button><button class="linkbtn" id="meetDel">Quitar la fecha</button><button class="linkbtn" id="meetTog">💞 Ya estamos juntos</button></div>`;
  $("meetTog").onclick = setTog;
  const myes = $("meetYes"); if (myes) myes.onclick = setTog;
  const mno = $("meetNo"); if (mno) mno.onclick = () => { S.merge("state/main", { next: null, nextSet: null }); toast("Fecha quitada. Poned la buena cuando la tengáis ✈️", 3500); };
  $("meetDel").onclick = () => { if (!confirm("¿Quitar la fecha en la que os veis?")) return; S.merge("state/main", { next: null, nextSet: null }); toast("Fecha quitada"); };
  const msp = $("meetSp"); if (msp) msp.onclick = () => { spTab = "ks"; ksFilter = "lista"; spEnter(); };
  if (here && !ls.get("meetParty:" + nx)) { ls.set("meetParty:" + nx, "1"); setTimeout(() => { confetti(); toast(`¡Hoy os veis! 🥹💞 Disfrutadlo mucho`, 4000); }, 700); }
  el.querySelectorAll("[data-mp]").forEach(b => b.onclick = () => S.tx("state/main", d => { d = d || {}; d.meetPlan = (d.meetPlan || []).filter((_, i) => i !== +b.dataset.mp); return d; }).catch(offline));
  $("mpAdd").onclick = () => { const t = $("mpIn").value.trim(); if (!t) return; S.tx("state/main", d => { d = d || {}; d.meetPlan = [...(d.meetPlan || []), { t: t.slice(0, 80), by: who }].slice(-20); return d; }).then(() => { const i = $("mpIn"); if (i) i.value = ""; }).catch(offline); };
  const ns = $("mnSave"); if (ns) ns.onclick = () => { const t = $("mnIn").value.trim(); if (!t) return; S.merge("state/main", { meetNote: { [who]: { t: t.slice(0, 300), at: Date.now() } } }); toast("Sobre guardado 💌🤫"); notifyOther(`💌 ${name(who)} te ha dejado un sobre para el día que os veáis`); };
  $("meetEdit").onclick = () => $("btnSettings").click();
  tickMeet();
}
function tickMeet() {
  const e = $("cdown"), nx = state.main.next; if (!e || !nx) return;
  const ms = Math.max(0, nx - Date.now()), d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 36e5), mi = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  e.innerHTML = ms ? [[d, "días"], [h, "horas"], [mi, "min"], [s, "seg"]].map(([n, l]) => `<div><b>${String(n).padStart(2, "0")}</b><small>${l}</small></div>`).join("") : `<div class="here">🥹💞</div>`;
}
setInterval(() => { if (!$("tab-home").classList.contains("hidden")) tickMeet(); }, 1000);

// ---------- 9) Nuestro libro (PDF) y copia de seguridad ----------
async function openBook() {
  const v = $("bookView"); v.classList.remove("hidden"); document.body.style.overflow = "hidden";
  v.innerHTML = `<div class="wrload" style="color:#5a3a48"><div class="wrspin">📖</div>Montando vuestro libro…</div>`;
  let dys = [], mems = [], wks = [];
  try { [dys, mems, wks] = await Promise.all([onceCol("diary", 1000), onceCol("memories", 600), onceCol("weekly", 200)]); } catch (e) { console.error(e); }
  const A = name("a"), B = name("b"), p = state.pet || {}, days = CONFIG.start ? Math.floor((Date.now() - new Date(CONFIG.start + "T00:00:00")) / DAY) : 0;
  const fullPh = await Promise.all(mems.map(m => (m.pid ? onceDoc("photos/" + m.pid).then(d => (d && d.data) || m.thumb) : Promise.resolve(m.photo || null)).catch(() => m.thumb || null)));
  const byDate = (a, b) => (a.date || a.id || "").localeCompare(b.date || b.id || "");
  const petS = p.xp ? chickSVG(Math.max(1, stageOf(p.xp || 0)), "love", p.wear || {}, 0, p.color, { species: p.species }) : "";
  const done = (plans || []).filter(x => x.done).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));
  let h = `<div class="bktools"><button class="btn primary" id="bkPrint">🖨️ Guardar como PDF</button><button class="btn" id="bkJson">💾 Copia</button><button class="btn" id="bkX">✕</button></div><div class="book">
    <section class="bkcover"><div class="bkpet">${petS}</div><h1>Nosotros</h1><h2>${esc(A)} & ${esc(B)}</h2><p>Desde el ${esc(fmtD(new Date(CONFIG.start + "T12:00:00"), { day: "numeric", month: "long", year: "numeric" }))} · ${days} días juntos</p></section>
    <section><h3>Nuestros números</h3><ul class="bknum"><li><b>${days}</b> días juntos</li><li><b>${dys.length}</b> días de diario</li><li><b>${mems.length}</b> recuerdos</li><li><b>${done.length}</b> planes cumplidos</li><li><b>${p.xp || 0}</b> días cuidando a ${esc(p.name || "Pollito")}</li><li><b>${p.hugs || 0}</b> mimos</li></ul></section>`;
  if (mems.length) h += `<section><h3>Nuestros recuerdos 📸</h3>${mems.slice().sort((a, b) => (a.taken || a.at) - (b.taken || b.at)).map(m => { const i = mems.indexOf(m); return `<div class="bkmem">${fullPh[i] ? `<img src="${fullPh[i]}" alt="">` : ""}<div><small>${esc(fmtD(m.taken || m.at, { day: "numeric", month: "long", year: "numeric" }))}${m.place ? " · 📍 " + esc(m.place) : ""} · ${esc(name(m.from))}</small>${m.text ? `<p>${esc(m.text)}</p>` : ""}</div></div>`; }).join("")}</section>`;
  if (dys.length) h += `<section><h3>Nuestro diario 📖</h3>${dys.slice().sort(byDate).map(d => `<div class="bkday"><h4>${esc(fmtD(new Date((d.date || d.id) + "T12:00:00"), { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</h4>${["a", "b"].filter(w => d[w] && (d[w].text || d[w].photo)).map(w => `<p><b>${esc(name(w))} ${esc(d[w].mood || "")}</b> ${esc(d[w].text || "")}</p>${d[w].photo ? `<img src="${d[w].photo}" alt="">` : ""}`).join("")}${d.pet && d.pet.text ? `<p class="bkpetl">🐤 ${esc(d.pet.text)}</p>` : ""}</div>`).join("")}</section>`;
  if (wks.length) h += `<section><h3>Cartas de ${esc(p.name || "Pollito")} 💌</h3>${wks.slice().sort((a, b) => a.wk.localeCompare(b.wk)).map(w => `<div class="bkday"><h4>Semana del ${esc(fmtD(new Date(w.wk + "T12:00:00"), { day: "numeric", month: "long", year: "numeric" }))}</h4><p style="white-space:pre-wrap">${esc(w.text)}</p></div>`).join("")}</section>`;
  if (done.length) h += `<section><h3>Planes cumplidos ✅</h3><ul>${done.map(x => `<li>${esc(x.cat || "")} ${esc(x.text)} <small>${x.doneAt ? esc(fmtD(x.doneAt, { day: "numeric", month: "short", year: "numeric" })) : ""}</small></li>`).join("")}</ul></section>`;
  h += `<section class="bkend"><p>Hecho con amor en Nosotros · ${esc(fmtD(Date.now(), { day: "numeric", month: "long", year: "numeric" }))}</p></section></div>`;
  v.innerHTML = h;
  $("bkX").onclick = () => { v.classList.add("hidden"); document.body.style.overflow = ""; };
  $("bkPrint").onclick = () => { document.body.classList.add("printing"); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove("printing"), 500); }, 100); };
  $("bkJson").onclick = async () => {
    toast("Preparando la copia… 💾");
    const cols = ["messages", "memories", "diary", "plans", "letters", "capsules", "dates", "moods", "weekly", "petpics", "vouchers"], out = { app: "Nosotros", v: APP_VERSION, at: new Date().toISOString(), names: CONFIG.names };
    for (const c of cols) { try { out[c] = await onceCol(c, 5000); } catch (e) { out[c] = []; } }
    for (const d of ["state/pet", "state/main", "state/aimem"]) { try { out[d] = await onceDoc(d); } catch (e) {} }
    const photos = {}; for (const m of out.memories || []) if (m.pid) { try { const d = await onceDoc("photos/" + m.pid); if (d) photos[m.pid] = d.data; } catch (e) {} } out.photos = photos;
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `nosotros-copia-${localKey()}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };
}

// ---------- 10) Fotos ligeras: miniatura en la lista y foto grande aparte ----------
const phOf = m => (m && (m.thumb || m.photo)) || "";
function thumbOf(src, max = 320, q = .66) {
  return loadImg(src).then(img => { const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q); });
}
async function addMemory(d) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  if (d.photo && d.photo.length > 40000) {
    try { const th = await thumbOf(d.photo); await S.merge("photos/" + id, { data: d.photo, at: d.at }); d = { ...d, thumb: th, pid: id, photo: null }; } catch (e) { console.warn(e); }
  }
  return S.merge("memories/" + id, d);
}
function fullPhoto(m) { return m.pid ? onceDoc("photos/" + m.pid).then(d => (d && d.data) || m.thumb || "").catch(() => m.thumb || "") : Promise.resolve(m.photo || ""); }
let migDone = false;
async function migratePhotos() {
  if (migDone || !navigator.onLine) return; migDone = true;
  const big = (memList || []).filter(m => m.photo && !m.pid && m.photo.length > 60000).slice(0, 4);
  for (const m of big) {
    try {
      const th = await thumbOf(m.photo);
      await S.merge("photos/" + m.id, { data: m.photo, at: m.at });
      const chk = await onceDoc("photos/" + m.id); if (!chk || !chk.data || chk.data.length !== m.photo.length) continue;
      await S.merge("memories/" + m.id, { thumb: th, pid: m.id, photo: null });
    } catch (e) { console.warn("mig", e); }
  }
}


// =====================================================================
//   v40 · Pareja, crías con genes, árbol familiar y marcas de pelaje
// =====================================================================
const LOVE_MIN_STAGE = 2;          // desde "Pollito" (7 días cuidándole juntos)
const WARM_DAYS = 5, MAX_KIDS = 3, NEST_GAP = 14 * DAY;
FIRSTS.push(["love", "💘", "Se enamoró"], ["wed", "💍", "Se casó"], ["baby", "🐣", "Tuvo su primera cría"]);
FIRSTS.slice(-3).forEach(f => { FIRSTM[f[0]] = f; });
Object.assign(EV_TXT, { friend: n => (n > 1 ? `nos ha preparado ${n} planes con nuestra pareja 😊` : "nos ha preparado un plan con nuestra pareja 😊"), date: n => (n > 1 ? `nos ha llevado de cita ${n} veces 🌹` : "nos ha llevado de cita 🌹"), warm: () => "le ha dado calor al huevo 🔥", kid: () => "ha hecho mimos a las crías 🐣", wed: () => "¡nos ha casado! 💍" });

// ---------- genes ----------
const M_NAMES = ["Coco", "Bruno", "Maíz", "Churro", "Tofu", "Rayo", "Simba", "Leo", "Nacho", "Pistacho", "Kiwi", "Mango", "Rulo", "Toby", "Pipo", "Lucas"];
const F_NAMES = ["Luna", "Nube", "Canela", "Bombón", "Galleta", "Pipa", "Chispa", "Lola", "Trufa", "Menta", "Perla", "Mora", "Nala", "Frida", "Olivia", "Brisa", "Gominola"];
const sexOf = x => (x && x.sex) || (hashStr((x && x.name) || "") % 2 ? "m" : "f");
const SEXW = { m: ["chico", "♂"], f: ["chica", "♀"] };
const sxTag = s => s === "m" || s === "f" ? `<i class="sx ${s}">${SEXW[s][1]}</i>` : "";
const sameSex = (a, b) => !!(a && b && a.sex && sexOf(a) === sexOf(b));
const CHEM = [null, ["💗", "Baja", "Se llevan bien, pero no hay chispa"], ["💗💗", "Media", "Puede surgir algo"], ["💗💗💗", "Alta", "¡Están hechos el uno para el otro!"]];
const MATE_NAMES = ["Luna", "Kiwi", "Coco", "Nube", "Canela", "Bombón", "Galleta", "Pipa", "Mango", "Chispa", "Lola", "Bruno", "Maíz", "Trufa", "Menta", "Pompón", "Churro", "Perla", "Tofu", "Rayo", "Mora", "Nala", "Simba", "Frida", "Leo", "Olivia", "Nacho", "Brisa", "Pistacho", "Gominola"];
const KID_NAMES = ["Pipo", "Mimi", "Bolita", "Peque", "Pío", "Chiqui", "Nugget", "Gusi", "Tití", "Bubu", "Kiki", "Lulú", "Nino", "Fifi", "Momo", "Bebé", "Piñón", "Semillita", "Burbuja", "Botón"];
const LIKES = ["las fresas", "bailar bajo la lluvia", "las siestas al sol", "coleccionar piedras bonitas", "cantar por las mañanas", "los abrazos largos", "mirar las estrellas", "las galletas de chocolate", "los charcos", "las flores amarillas", "hacer volteretas", "los días de playa"];
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; }; }
const MARKS = () => CATALOG.filter(it => it.cat === "marca");
const PALETTE = () => CATALOG.filter(it => it.cat === "color" && !it.chest && !it.lv && !it.season && it.id !== "dorado" && it.pat !== "ghost");
function geneColor(g) {   // objeto de color que entiende chickSVG
  if (!g) return COLM.amarillo;
  if (g.c && COLM[g.c]) return COLM[g.c];
  return { id: "mix", n: g.n || "Mezcla", body: g.body, belly: g.belly, dark: g.dark, pat: g.pat || null, grad: g.grad || null };
}
const geneWear = g => ({ ...((g && g.wear) || {}), mark: (g && g.mark) || null });
const markName = id => (id && CAT[id] ? CAT[id].n : "Sin marcas");
function colorName(g) { const C = geneColor(g); return C.n || "Mezcla"; }
function petGene(p) { return { c: p.color || "amarillo", mark: (p.wear || {}).mark || null }; }
function mixGenes(A, B, r = Math.random) {
  const a = geneColor(A), b = geneColor(B), x = r();
  let g;
  if (x < .36) g = A.c ? { c: A.c } : { ...a, c: null, n: a.n };
  else if (x < .72) g = B.c ? { c: B.c } : { ...b, c: null, n: b.n };
  else g = { c: null, n: `Mezcla de ${a.n || "?"} y ${b.n || "?"}`, body: hexMix(a.body, b.body, .5), belly: hexMix(a.belly, b.belly, .5), dark: hexMix(a.dark, b.dark, .5), pat: a.pat && a.pat === b.pat ? a.pat : null, grad: a.grad && b.grad ? a.grad : null };
  if (r() < .1) { const P = PALETTE(); g = { c: P[Math.floor(r() * P.length)].id, mut: 1 }; }   // mutación: color nuevo
  const y = r(), M = MARKS();
  g.mark = y < .42 ? A.mark || null : y < .84 ? B.mark || null : (r() < .7 ? M[Math.floor(r() * M.length)].id : null);
  if (y >= .84 && g.mark) g.mut = 1;
  return g;
}
function mateCands(p) {
  const R = rng(hashStr(dayKey() + ":amor:" + (p.born || 0) + ":" + (p.likes || "all"))), P = PALETTE().filter(c => c.c <= 400), M = MARKS(), T = Object.keys(TRAITS);
  const used = new Set();
  return [0, 1, 2].map(() => {
    const sx = p.likes === "m" || p.likes === "f" ? p.likes : R() < .5 ? "m" : "f", L = sx === "m" ? M_NAMES : F_NAMES;
    let nm; do { nm = L[Math.floor(R() * L.length)]; } while (used.has(nm)); used.add(nm);
    const x = R(), chem = x < .25 ? 1 : x < .7 ? 2 : 3;
    return { name: nm, sex: sx, chem, wed: R() < .8, species: p.species || "pollito", c: P[Math.floor(R() * P.length)].id, mark: R() < .65 ? M[Math.floor(R() * M.length)].id : null, trait: T[Math.floor(R() * T.length)], like: LIKES[Math.floor(R() * LIKES.length)] };
  });
}
const kidStage = k => { const d = (Date.now() - (k.born || Date.now())) / DAY; return d < 3 ? 1 : d < 10 ? 2 : d < 21 ? 3 : 4; };
const mateOf = p => (p && p.mate && p.mate.status ? p.mate : null);
const kidsOf = p => (p && p.kids) || [];

// ---------- marcas de pelaje (dibujo) ----------
const heartP = (x, y, s) => `M${x} ${y + s * .9} C${x - s * 1.6} ${y - s * .1} ${x - s * .9} ${y - s * 1.3} ${x} ${y - s * .45} C${x + s * .9} ${y - s * 1.3} ${x + s * 1.6} ${y - s * .1} ${x} ${y + s * .9}Z`;
function markSVG(id, C, layer) {
  if (!id) return "";
  const mc = hexMix(C.dark || "#b07a00", "#000000", .12), lt = hexMix(C.body || "#ffd93b", "#ffffff", .72);
  const U = layer === "under", O = !U;
  switch (id) {
    case "mk_rayas": return U ? `<g stroke="${mc}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"><path d="M64 78 Q100 60 136 78"/><path d="M52 94 Q100 74 148 94"/><path d="M76 66 Q100 56 124 66"/></g>` : "";
    case "mk_tigre": return U ? `<g fill="${mc}" opacity=".9"><path d="M47 98 L74 104 L49 110Z"/><path d="M49 124 L76 128 L51 136Z"/><path d="M153 98 L126 104 L151 110Z"/><path d="M151 124 L124 128 L149 136Z"/><path d="M90 64 L100 82 L110 64Z"/><path d="M66 74 L84 86 L72 70Z"/><path d="M134 74 L116 86 L128 70Z"/></g>` : "";
    case "mk_manchas": return U ? `<g fill="${mc}" opacity=".85"><ellipse cx="70" cy="84" rx="13" ry="9" transform="rotate(-20 70 84)"/><ellipse cx="134" cy="90" rx="10" ry="8"/><ellipse cx="146" cy="140" rx="11" ry="9"/><ellipse cx="56" cy="144" rx="9" ry="7"/><ellipse cx="108" cy="70" rx="7" ry="5"/></g>` : "";
    case "mk_lunares": return U ? `<g fill="${lt}">${[[66, 86], [88, 72], [112, 72], [134, 86], [54, 112], [146, 112], [60, 140], [140, 140], [100, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6"/>`).join("")}</g>` : "";
    case "mk_corazones": return U ? `<g fill="#ff6f91">${[[68, 88, 6], [134, 84, 5], [146, 136, 6], [56, 136, 4.5], [100, 68, 4.5]].map(([x, y, s]) => `<path d="${heartP(x, y, s)}"/>`).join("")}</g>` : "";
    case "mk_estrellas": return U ? `<g fill="#ffd23f" stroke="#e8a200" stroke-width="1">${[[68, 86, 7], [132, 82, 6], [146, 134, 7], [56, 136, 5], [102, 66, 5]].map(([x, y, s]) => `<path d="${starP(x, y, s)}"/>`).join("")}</g>` : "";
    case "mk_bicolor": return U ? `<ellipse cx="100" cy="66" rx="62" ry="38" fill="${mc}" opacity=".85"/>` : "";
    case "mk_calcetines": return U ? `<rect x="40" y="148" width="120" height="30" fill="${mc}" opacity=".85"/>` : "";
    case "mk_cebra": return U ? `<g stroke="${mc}" stroke-width="4" fill="none" stroke-linecap="round">${[88, 100, 112, 124, 136].map(y => `<path d="M48 ${y} q12 -5 22 1"/><path d="M152 ${y} q-12 -5 -22 1"/>`).join("")}<path d="M90 64 q10 8 20 0"/><path d="M84 74 q16 8 32 0"/></g>` : "";
    case "mk_brillos": return U ? `<g fill="#fff">${[[66, 84, 7], [134, 80, 6], [146, 132, 5], [56, 134, 5], [100, 66, 4]].map(([x, y, s]) => `<path d="${spark(x, y, s)}"/>`).join("")}</g>` : "";
    case "mk_flores": return U ? `<g>${[[66, 86], [136, 84], [146, 136], [56, 138]].map(([x, y]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(5 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(5 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="3.6" fill="#fff"/>`).join("")}<circle r="2.8" fill="#ffd23f"/></g>`).join("")}</g>` : "";
    case "mk_pecas": return O ? `<g fill="${mc}" opacity=".75">${[[61, 117], [67, 121], [72, 116], [139, 117], [133, 121], [128, 116]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8"/>`).join("")}</g>` : "";
    case "mk_antifaz": return O ? `<path d="M56 102 Q100 86 144 102 Q146 118 128 118 Q100 110 72 118 Q54 118 56 102Z" fill="${mc}" opacity=".9"/>` : "";
    case "mk_parche": return O ? `<ellipse cx="121" cy="106" rx="16" ry="14" fill="${mc}" opacity=".9"/>` : "";
    case "mk_barriga": return O ? `<path d="${heartP(100, 140, 14)}" fill="${hexMix(C.belly || "#fff", "#ff8fb0", .35)}"/>` : "";
    case "mk_rubor": return O ? `<g fill="#ff7d99" opacity=".35"><ellipse cx="66" cy="121" rx="15" ry="10"/><ellipse cx="134" cy="121" rx="15" ry="10"/></g>` : "";
    case "mk_copete": return O ? `<path d="M86 72 Q84 50 98 58 Q100 40 108 58 Q120 50 116 72Z" fill="${mc}"/>` : "";
  }
  return "";
}
function markIcon(it) {
  const C = { ...COLM.amarillo, dark: "#b8621b" }, u = "mi" + it.id;
  return `<i class="isvg"><svg viewBox="44 58 112 112"><defs><clipPath id="${u}"><circle cx="100" cy="116" r="52"/></clipPath></defs><circle cx="100" cy="116" r="52" fill="${C.body}"/><g clip-path="url(#${u})">${markSVG(it.id, C, "under")}</g><ellipse cx="100" cy="136" rx="31" ry="25" fill="${C.belly}"/>${markSVG(it.id, C, "over")}<circle cx="80" cy="107" r="6" fill="#2b1a10"/><circle cx="120" cy="107" r="6" fill="#2b1a10"/><path d="M92 118 Q100 113 108 118 L100 125Z" fill="#ff9f1c"/></svg></i>`;
}

// ---------- en la escena ----------
function famSig(p) { const m = mateOf(p), I0 = petInfo(); return JSON.stringify([viewLoc(), petLoc(p, I0), mateLoc(p, I0), kidsOf(p).map(k => kidLoc(p, I0, k)).join(), I0.si && currentExpr(I0) === "sleep",m && [m.name, m.c, m.mark, m.status, relStatus(relOf(m))[1], m.weddingAt && Date.now() - m.weddingAt < DAY], kidsOf(p).map(k => [k.id, kidStage(k), k.name, JSON.stringify(k.wear || {})]), p.nest && [p.nest.n, p.nest.at]]); }
function famScene(p, I) {
  let h = "";
  const m = mateOf(p), vl = viewLoc(), pl = petLoc(p, I);
  if (m && mateLoc(p, I) === vl) {
    const wed = m.weddingAt && Date.now() - m.weddingAt < DAY, wear = geneWear(m), far = pl !== vl, sleep = I.si && currentExpr(I) === "sleep";
    const snug = !far && sleep && m.status !== "conocidos";
    const inBed = snug && petView === "in" && (roomOf(p, curRoom).items || {}).cama;
    if (wed && !wear.head) wear.head = sexOf(m) === "m" ? "chistera" : "tiara";
    if (!inBed) h += `<button class="matefig${far ? " far" : ""}${snug ? " snug" : ""}" id="mateFig" aria-label="${esc(m.name)}">${chickSVG(Math.max(2, Math.min(5, I.si || 4)), snug || (sleep && !far) ? "sleep" : "idle", wear, 0, geneColor(m), { species: m.species })}<b>${relStatus(relOf(m))[0]} ${esc(m.name)} ${sxTag(sexOf(m))}</b></button>`;
  }
  let ki = 0;
  kidsOf(p).slice(0, MAX_KIDS).forEach((k, i) => {
    if (kidLoc(p, I, k) !== vl) return;
    const alone = pl !== vl;
    h += `<button class="kidfig kst${kidStage(k)}${alone ? " alone" : ""}" data-kid="${k.id}" style="--ki:${ki++};animation-delay:${-i * .7}s">${chickSVG(kidStage(k), pl === "dorm" && vl === "dorm" && hourIn(myTz) >= 21 ? "sleep" : "happy", geneWear(k), 0, geneColor(k), { species: k.species })}<em class="kidsx">${sxTag(sexOf(k))}</em></button>`;
  });
  if (p.nest && !p.nest.hatched && (vl === "dorm" || vl === "jardin" || vl === "out")) h += `<button class="nestfig" id="nestFig" aria-label="Huevo">${nestSVG(p)}</button>`;
  return h;
}
function nestSVG(p) {
  const m = mateOf(p) || {}, a = geneColor(petGene(p)), b = geneColor(m), n = (p.nest && p.nest.n) || 0, today = dayKey(), w = (p.nest && p.nest.warm) || {};
  const flames = [0, 1, 2].map(i => `<text x="${34 + i * 16}" y="16" font-size="12" opacity="${i < n ? 1 : .25}">🔥</text>`).join("");
  return `<svg viewBox="0 0 100 90"><defs><radialGradient id="ne_eg" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff6e6"/><stop offset="1" stop-color="#e3cfa9"/></radialGradient></defs>${flames}
    <g class="${n >= WARM_DAYS - 1 ? "egg-g shake" : ""}"><ellipse cx="50" cy="52" rx="19" ry="24" fill="url(#ne_eg)"/><circle cx="43" cy="44" r="4" fill="${a.body}"/><circle cx="57" cy="56" r="5" fill="${b.body || "#ffb3cf"}"/><circle cx="46" cy="62" r="3" fill="${b.body || "#ffb3cf"}"/><circle cx="56" cy="38" r="2.6" fill="${a.body}"/></g>
    <path d="M14 62 Q50 92 86 62 Q84 80 50 84 Q16 80 14 62Z" fill="#a0692f"/><path d="M14 62 Q50 74 86 62" stroke="#c98c4a" stroke-width="5" fill="none"/><path d="M20 68 Q50 80 80 68 M24 75 Q50 84 76 75" stroke="#7d4f1f" stroke-width="2" fill="none" opacity=".7"/>
    ${w[who] === today ? "" : `<circle cx="84" cy="30" r="9" fill="#ff5c8a"/><text x="84" y="34" font-size="11" text-anchor="middle" fill="#fff" font-weight="800">!</text>`}</svg>`;
}
function bindFamScene() {
  const mf = $("mateFig"); if (mf) mf.onclick = e => { e.stopPropagation(); const m = mateOf(state.pet); if (!m) return; hearts(mf, "💕"); buzz(20); say(rnd([`¡${m.name} es lo más bonito del mundo! 😍`, `${m.name} y yo os queremos mucho 💞`, `¿Nos lleváis de cita? 🌹`, `¡Mira qué guap${hashStr(m.name) % 2 ? "o" : "a"} está ${m.name}! ✨`])); react("love", 1800); };
  document.querySelectorAll("#petSky [data-kid]").forEach(b => b.onclick = e => { e.stopPropagation(); openKid(b.dataset.kid); });
  const nf = $("nestFig"); if (nf) nf.onclick = e => { e.stopPropagation(); warmEgg(); };
}

// ---------- relación estilo Sims: amistad + romance ----------
const REL_F = [[0, "Recién conocidos", "👋"], [15, "Conocidos", "🙂"], [35, "Amigos", "😊"], [60, "Buenos amigos", "😄"], [85, "Mejores amigos", "🤗"]];
const REL_R = [[0, "", ""], [15, "Les hace tilín", "☺️"], [30, "Flechazo", "😳"], [50, "Enamorados", "🥰"], [75, "Muy enamorados", "😍"], [90, "Almas gemelas", "💞"]];
const ACTS_PER_DAY = 2;           // interacciones por persona y día
const STABLE_DAYS = 14, WED_MIN_DAYS = 14, FAMILY_DAYS = 7;
const INTER = [
  { id: "charlar", e: "💬", n: "Charlar", f: [2, 4], say: ["¡Hemos hablado de nubes y de fresas! ☁️🍓", "¡Me ha contado un secreto! 🤫", "Hablar con {m} es lo mejor 💬"] },
  { id: "jugar", e: "⚽", n: "Jugar juntos", f: [3, 5], say: ["¡Hemos jugado al pilla-pilla! 🏃", "¡He ganado yo! (creo) ⚽", "¡Qué risa con {m}! 😆"] },
  { id: "merienda", e: "🍓", n: "Compartir merienda", f: [2, 4], r: [0, 1], say: ["Le he dado la fresa más grande 🍓", "Hemos merendado juntos 🥪"] },
  { id: "chiste", e: "😂", n: "Contar un chiste", f: [3, 6], ch: 72, fail: "No le ha hecho gracia… 😅", say: ["¡Se ha partido de risa! 😂", "¡Le ha encantado mi chiste! 🤣"] },
  { id: "regalo", e: "🎁", n: "Regalo (20 🪙)", cost: 20, f: [4, 6], r: [1, 3], say: ["¡Le ha encantado el regalo! 🎁", "{m} se ha puesto rojit@ 🥹"] },
  { id: "piropo", e: "😊", n: "Piropo", rom: 1, needF: 35, r: [3, 5], ch: 0, fail: "¡Qué corte! 😳 No era el momento", say: ["Le he dicho que tiene los ojos más bonitos 😊", "{m} se ha sonrojado 😳"] },
  { id: "alas", e: "🤝", n: "Cogerse de las alas", rom: 1, needF: 35, needR: 15, r: [3, 6], ch: 0, fail: "Ha retirado el ala… 🙈", say: ["Hemos paseado cogidos de las alas 🤝", "¡Me ha cogido del ala! 🥰"] },
  { id: "abrazo", e: "🤗", n: "Abrazo largo", rom: 1, needF: 40, needR: 20, f: [1, 2], r: [3, 5], ch: 0, fail: "Se ha apartado un poquito… 😶", say: ["¡Qué abrazo más calentito! 🤗", "Podría quedarme así todo el día 💛"] },
  { id: "cita", e: "🌹", n: "Ir de cita", rom: 1, needF: 45, needR: 30, f: [2, 3], r: [5, 8], ch: 0, once: 1, fail: "La cita ha sido un poco rara… 😬", say: ["¡La cita ha sido perfecta! 🌹", "¡Hemos cenado a la luz de las velas! 🕯️"] },
  { id: "beso", e: "😘", n: "Besito", rom: 1, needS: "novios", r: [4, 7], ch: 0, fail: "Se ha girado justo en el último momento 🙈", say: ["¡Muac! 😘", "Un besito en el pico 💋"] }
];
const INTERM = Object.fromEntries(INTER.map(x => [x.id, x]));
function relOf(m) {   // normaliza (compatibilidad con la v40)
  if (!m) return null;
  if (m.chem == null) { m.chem = 3; if (m.wed == null) m.wed = true; }
  if (m.f == null) { const base = { conocidos: [5, 0], novios: [60, 55], prometidos: [80, 90], casados: [85, 92] }[m.status] || [5, 0]; m.f = base[0]; m.r = base[1]; if (m.status === "novios" && !m.noviosAt) m.noviosAt = m.metAt; }
  return m;
}
const relF = f => REL_F.filter(x => f >= x[0]).pop();
const relR = r => REL_R.filter(x => r >= x[0]).pop();
const daysSince = t => (t ? Math.floor((Date.now() - t) / DAY) : 0);
function relStatus(m) {
  if (!m) return ["", ""];
  if (m.status === "casados") return ["💒", "Casados"];
  if (m.status === "prometidos") return ["💍", "Prometidos"];
  if (m.fz && m.status === "conocidos") return ["🤝", "Solo amigos"];
  if (m.status === "novios") return m.r >= 75 && daysSince(m.noviosAt) >= STABLE_DAYS ? ["💑", "Pareja estable"] : ["💞", "Novios"];
  const R = relR(m.r || 0); if (R[1] && (m.r || 0) >= 30) return [R[2], R[1]];
  const F = relF(m.f || 0); return [F[2], F[1]];
}
function relDecay(m) {   // si no se ven, la relación baja un poquito
  const d = m.lastInt ? Math.max(0, daysBetween(m.lastInt, dayKey()) - 1) : 0;
  if (!d) return;
  const floorR = m.status === "casados" ? 60 : m.status === "prometidos" ? 55 : m.status === "novios" ? 35 : 0;
  m.f = Math.max(0, (m.f || 0) - 2 * d); m.r = Math.max(floorR, (m.r || 0) - 1.5 * d);
}
function relMiles(m) {
  m.miles = m.miles || {};
  const set = (k, ok) => { if (ok && !m.miles[k]) m.miles[k] = Date.now(); };
  set("met", true); set("amigos", m.f >= 35); set("buenos", m.f >= 60); set("mejores", m.f >= 85); set("flechazo", m.r >= 30); set("enamorados", m.r >= 50);
  set("novios", ["novios", "prometidos", "casados"].includes(m.status)); set("estable", m.status !== "conocidos" && m.r >= 75 && daysSince(m.noviosAt) >= STABLE_DAYS);
  set("prometidos", ["prometidos", "casados"].includes(m.status)); set("boda", m.status === "casados");
}
const MILES = [["met", "👋", "Se conocen"], ["amigos", "😊", "Se hacen amigos"], ["buenos", "😄", "Buenos amigos"], ["mejores", "🤗", "Mejores amigos"], ["flechazo", "😳", "Flechazo"], ["enamorados", "🥰", "Se enamoran"], ["novios", "💞", "Son novios"], ["estable", "💑", "Pareja estable"], ["prometidos", "💍", "Se prometen"], ["boda", "💒", "Boda"]];
function moodPenalty(p) { const I = petInfo(); const avg = NEEDS.reduce((a, [k]) => a + I.nv[k], 0) / NEEDS.length; return avg < 45 ? 20 : avg < 60 ? 8 : 0; }
function interChance(m, it, p) {
  if (!it.rom) return (it.ch || 100) - moodPenalty(p);
  return Math.max(15, Math.min(95, 50 + (m.r || 0) * .45 + ((m.f || 0) - 35) * .3 - moodPenalty(p) + (m.status !== "conocidos" ? 15 : 0) + ({ 1: -15, 3: 5 }[m.chem] || 0)));
}
function interLock(m, it) {
  if (it.needF && (m.f || 0) < it.needF) return `Necesitan ${relF(it.needF)[1].toLowerCase()}`;
  if (it.needR && (m.r || 0) < it.needR) return `Necesitan ${(relR(it.needR)[1] || "más romance").toLowerCase()}`;
  if (it.needS && m.status === "conocidos") return "Tienen que ser novios";
  return null;
}
const actsLeft = m => ACTS_PER_DAY - (((m.acts || {}).day === dayKey() && (m.acts || {})[who]) || 0);
const rrand = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
function doInter(id) {
  const it = INTERM[id]; if (!it) return;
  let res = null;
  petTx(q => {
    const m = relOf(mateOf(q)); if (!m || interLock(m, it)) return null;
    const today = dayKey();
    if (!m.acts || m.acts.day !== today) m.acts = { day: today };
    if ((m.acts[who] || 0) >= ACTS_PER_DAY) { res = { none: 1 }; return null; }
    if (it.once && m.acts.once && m.acts.once[id]) { res = { once: 1 }; return null; }
    if (it.cost && coinsOf(q) < it.cost) { res = { coins: 1 }; return null; }
    relDecay(m);
    const ok = Math.random() * 100 < interChance(m, it, q);
    const damp = (v, max) => v * Math.max(.25, 1 - v / (max * 1.35));
    let df = 0, dr = 0;
    if (ok) { df = it.f ? rrand(it.f) : 0; dr = it.r && (!it.rom ? (m.f || 0) >= 35 : true) ? rrand(it.r) : 0; df = Math.round(df * Math.max(.3, 1 - (m.f || 0) / 140)); dr = Math.round(dr * Math.max(.3, 1 - (m.r || 0) / 140) * ([1, .35, .8, 1.15][m.chem || 3])); }
    else { df = -1; dr = it.rom ? -rrand([2, 4]) : 0; }
    m.f = Math.max(0, Math.min(100, (m.f || 0) + df)); m.r = Math.max(0, Math.min(m.chem === 1 && m.status === "conocidos" ? 35 : 100, (m.r || 0) + dr));
    m.acts[who] = (m.acts[who] || 0) + 1; if (it.once) m.acts.once = { ...(m.acts.once || {}), [id]: 1 };
    m.lastInt = today; m.log = [...(m.log || []), { k: id, ok: ok ? 1 : 0, at: Date.now(), by: who }].slice(-30);
    if (id === "cita" && ok) m.dates = (m.dates || 0) + 1;
    if (it.cost) q.coins = coinsOf(q) - it.cost;
    const before = JSON.stringify(m.miles || {}); relMiles(m); const newMile = JSON.stringify(m.miles) !== before ? MILES.filter(x => m.miles[x[0]] && !JSON.parse(before)[x[0]]).pop() : null;
    settle(q); if (ok) { setNeed(q, "love", it.rom ? 8 : 4); setNeed(q, "fun", 5); }
    bump(q, it.rom ? "date" : "friend");
    res = { ok, df, dr, it, name: m.name, mile: newMile };
    return q;
  }).then(() => {
    if (!res) return;
    if (res.none) return toast(`Ya habéis hecho tus ${ACTS_PER_DAY} planes de hoy con ${(mateOf(state.pet) || {}).name}. ¡Mañana más! 🌙`, 3200);
    if (res.once) return toast("Hoy ya han tenido su cita 🌹");
    if (res.coins) return toast("No tenéis monedas suficientes 🪙");
    sceneSig = ""; renderPet();
    const mf = $("mateFig");
    if (res.ok) { setTimeout(() => interAnim(res.it.id), 250); react(res.it.rom ? "love" : "happy", 2600); hearts($("petBox"), res.it.rom ? "💕" : "✨"); if (mf) hearts(mf, res.it.rom ? "💖" : "⭐"); say(rnd(res.it.say).replace("{m}", res.name), 4000); }
    else { react("sad", 2200); say(res.it.fail || "Uy… no ha salido bien 😅", 3500); }
    toast(`${res.it.e} ${res.df ? (res.df > 0 ? "+" : "") + res.df + " 💚 amistad" : ""}${res.df && res.dr ? " · " : ""}${res.dr ? (res.dr > 0 ? "+" : "") + res.dr + " 💗 romance" : ""}` || res.it.e, 2600);
    if (res.mile) setTimeout(() => { confetti(); readView({ icon: res.mile[1], title: `¡${res.mile[2]}!`, sub: `${(state.pet || {}).name} y ${res.name}`, text: mileText(res.mile[0], res.name) }); sendMsg(`${res.mile[1]} ${(state.pet || {}).name} y ${res.name}: ¡${res.mile[2].toLowerCase()}!`, "pet"); }, 1200);
  }).catch(offline);
}
function mileText(k, n) {
  return ({ amigos: `Ya son amigos 😊 Ahora sabéis su química: ${(() => { const m = mateOf(state.pet) || {}; const c = CHEM[m.chem || 3]; return c[0] + " " + c[1].toLowerCase() + ". " + c[2]; })()} Se desbloquean los piropos 😊`, buenos: `Cada vez se llevan mejor. ¡Seguid así!`, mejores: `No se separan ni un minuto 🤗`,
    flechazo: `A ${(state.pet || {}).name} se le acelera el corazón cuando ve a ${n} 😳 Se desbloquean las citas 🌹`, enamorados: `Están enamorados 🥰 ¡Ya puede declararse! 💌`,
    novios: `¡Son novios! 💞 Seguid cuidando la relación: con el tiempo serán pareja estable y podrán prometerse 💍`, estable: `Llevan ${STABLE_DAYS} días de novios y se quieren muchísimo 💑`,
    prometidos: `¡Se van a casar! 💍 Preparad la boda juntos: invitaciones, tarta y decoración (una cosa cada día).`, boda: `¡Vivan los novios! 💒` })[k] || "";
}
function declare() {
  let res = null;
  petTx(q => {
    const m = relOf(mateOf(q)); if (!m || m.status !== "conocidos" || m.r < 50 || m.f < 45) return null;
    if (m.declNext && m.declNext > Date.now()) { res = { wait: 1 }; return null; }
    relDecay(m);
    const ch = Math.max(25, Math.min(95, 45 + (m.r - 50) * 1.5 + (m.f - 45) * .5 - moodPenalty(q) + (m.chem === 3 ? 10 : 0)));
    const ok = m.chem !== 1 && Math.random() * 100 < ch;
    if (m.chem === 1) m.fz = 1;
    if (ok) { m.status = "novios"; m.noviosAt = Date.now(); m.r = Math.min(100, m.r + 8); firstMark(q, "love", m.name); } else { m.r = Math.max(0, m.r - 8); m.declNext = Date.now() + 2 * DAY; }
    m.lastInt = dayKey(); relMiles(m); res = { ok, name: m.name }; bump(q, "date"); return q;
  }).then(() => {
    if (!res) return; if (res.wait) return toast("Aún le da vergüenza… inténtalo en unos días 🙈");
    sceneSig = ""; petSig = ""; renderPet();
    if (res.ok) { confetti(); react("love", 3500); readView({ icon: "💌", title: `¡${res.name} ha dicho que sí!`, sub: `${(state.pet || {}).name} y ${res.name} ya son novios 💞`, text: mileText("novios", res.name) }); sendMsg(`💌 ¡${(state.pet || {}).name} se ha declarado a ${res.name} y ha dicho que SÍ! Ya son novios 💞`, "pet"); }
    else if ((mateOf(state.pet) || {}).fz) { react("sad", 3000); readView({ icon: "🤝", title: `${res.name} le quiere… como amig${sexOf(state.pet) === "m" ? "o" : "a"}`, sub: "No hay química entre ellos 💛", text: `Seguirán siendo muy buenos amigos. Si queréis que ${(state.pet || {}).name} encuentre el amor, podéis dejar de verse (sin dramas) y presentarle a otra persona 👋` }); }
    else { react("sad", 3000); readView({ icon: "💔", title: "Todavía no…", sub: `${res.name} necesita un poquito más de tiempo`, text: "Seguid cuidando la relación (citas, abrazos, piropos…) y en un par de días podrá volver a intentarlo 💪" }); }
  }).catch(offline);
}
const PREP = [["invit", "💌", "Mandar las invitaciones"], ["tarta", "🎂", "Elegir la tarta"], ["deco", "💐", "Decorar el lugar"]];
function doPrep(k) {
  let ok = false;
  petTx(q => { const m = relOf(mateOf(q)); if (!m || m.status !== "prometidos") return null; m.prep = m.prep || {}; if (m.prep[k] || m.prep.last === dayKey()) return null; m.prep[k] = { at: Date.now(), by: who }; m.prep.last = dayKey(); ok = true; return q; })
    .then(() => { if (!ok) return toast("Hoy ya habéis preparado algo. ¡Mañana lo siguiente! 📋"); const P = PREP.find(x => x[0] === k); renderPet(); toast(`${P[1]} ¡Hecho! ${P[2]}`, 2600); confetti(); }).catch(offline);
}
function celebrate() {
  let ok = false;
  petTx(q => { const m = relOf(mateOf(q)); if (!m || m.status !== "prometidos" || PREP.some(([k]) => !(m.prep || {})[k]) || (m.prep || {}).last === dayKey()) return null; m.status = "casados"; m.weddingAt = Date.now(); m.r = Math.min(100, m.r + 5); relMiles(m); q.coins = coinsOf(q) + 150; firstMark(q, "wed", m.name); bump(q, "wed"); ok = true; return q; })
    .then(() => { if (!ok) return toast("La boda será el día después de terminar los preparativos 💒"); sceneSig = ""; petSig = ""; renderPet(); weddingShow(); sendMsg(`💒 ¡${(state.pet || {}).name} y ${(mateOf(state.pet) || {}).name} se han casado! Hoy van de boda todo el día 🥂`, "pet"); }).catch(offline);
}
function breakUp() {
  const m = mateOf(state.pet); if (!m || m.status !== "conocidos") return;
  if (!confirm(`¿Dejar de ver a ${m.name}? Podréis presentarle a otra persona 💔`)) return;
  petTx(q => { const x = mateOf(q); if (!x || x.status !== "conocidos") return null; q.exes = [...(q.exes || []), { name: x.name, at: Date.now() }].slice(-10); q.mate = null; return q; }).then(() => { sceneSig = ""; renderPet(); toast("Otra vez será 💔"); }).catch(offline);
}

// ---------- tarjeta de amor (Hoy) ----------
function sexSetup(p, edit) {
  const pn = esc(p.name || "Pollito"), sx = p.sex, lk = p.likes;
  return `<div class="sub" style="margin:0 0 10px">${edit ? "Cambiad lo que queráis:" : `Antes de presentarle a nadie… contadnos un poco sobre ${pn} 💛`}</div>
    <div class="slotname" style="margin-top:0">${pn} es…</div><div class="sexrow"><button class="${sx === "m" ? "on" : ""}" data-sx="m">♂️ Chico</button><button class="${sx === "f" ? "on" : ""}" data-sx="f">♀️ Chica</button></div>
    <div class="slotname">Le gustan…</div><div class="sexrow"><button class="${lk === "m" ? "on" : ""}" data-lk="m">Los chicos</button><button class="${lk === "f" ? "on" : ""}" data-lk="f">Las chicas</button><button class="${lk === "all" ? "on" : ""}" data-lk="all">Los dos</button></div>
    <div class="sub" style="font-size:12px;margin-top:8px">Cada persona que conozca tendrá su propia <b>química</b> con ${pn}: con algunas solo habrá amistad, y no todas querrán casarse 😉</div>`;
}
function bindSexSetup() {
  document.querySelectorAll("#petLove [data-sx]").forEach(b => b.onclick = () => petTx(q => { q.sex = b.dataset.sx; return q; }).then(() => renderPet()).catch(offline));
  document.querySelectorAll("#petLove [data-lk]").forEach(b => b.onclick = () => petTx(q => { q.likes = b.dataset.lk; q.mateVote = null; return q; }).then(() => renderPet()).catch(offline));
}
function relBars(m) {
  const F = relF(m.f || 0), R = relR(m.r || 0), romOn = (m.f || 0) >= 35 || m.status !== "conocidos";
  return `<div class="relbars"><div class="relrow"><span>💚 Amistad</span><div class="relbar f"><i style="width:${Math.round(m.f || 0)}%"></i></div><b>${F[2]} ${esc(F[1])}</b></div>
    <div class="relrow ${romOn ? "" : "off"}"><span>💗 Romance</span><div class="relbar r"><i style="width:${romOn ? Math.round(m.r || 0) : 0}%"></i></div><b>${romOn ? (R[1] ? R[2] + " " + esc(R[1]) : "Nada aún") : "🔒 Cuando sean amigos"}</b></div></div>`;
}
function loveLadder(m) {
  const st = m.status, novD = daysSince(m.noviosAt);
  const steps = [
    ["👋", "Conocerse", true, ""], ["😊", "Amigos", m.f >= 35, `amistad ${Math.round(m.f)}/35`], ["😳", "Flechazo", m.r >= 30, `romance ${Math.round(m.r)}/30`],
    ["🥰", "Enamorados", m.r >= 50, `romance ${Math.round(m.r)}/50`], ["💌", "Novios", st !== "conocidos", "declararse"],
    ["💑", "Pareja estable", st !== "conocidos" && m.r >= 75 && novD >= STABLE_DAYS, st === "conocidos" ? "" : `${Math.min(novD, STABLE_DAYS)}/${STABLE_DAYS} días de novios`],
    ["💍", "Prometidos", st === "prometidos" || st === "casados", "romance 90 · amistad 70"], ["💒", "Boda", st === "casados", "3 días de preparativos"], ["🐣", "Familia", kidsOf(state.pet).length > 0, `${FAMILY_DAYS} días casados`]
  ];
  const cur = steps.findIndex(s => !s[2]);
  return `<details class="ladder"><summary>🪜 Camino del amor · paso ${cur < 0 ? steps.length : cur + 1} de ${steps.length}</summary>${steps.map((s, i) => `<div class="lstep ${s[2] ? "done" : i === cur ? "cur" : ""}"><i>${s[2] ? "✓" : s[0]}</i><b>${s[1]}</b>${!s[2] && s[3] ? `<small>${esc(s[3])}</small>` : ""}</div>`).join("")}</details>`;
}
function renderLove(p, I) {
  const el = $("petLove"); if (!el) return;
  const m = relOf(mateOf(p)), pn = esc(p.name || "Pollito"), o = esc(name(other())), today = dayKey();
  let h = "";
  if (!m) {
    if (I.si < LOVE_MIN_STAGE) { el.innerHTML = `<div class="sub" style="margin:0">Cuando ${pn} sea un poco más mayor (fase «${esc(stageName(LOVE_MIN_STAGE, p.species))}») podréis presentarle a alguien 👋 Primero serán amigos, luego… ¡quién sabe! 💘</div>`; return; }
    if (!p.sex || !p.likes) { el.innerHTML = sexSetup(p); bindSexSetup(); return; }
    const v = p.mateVote && p.mateVote.day === today ? p.mateVote : {};
    h = `<div class="lovehero"><span>👋</span><div><b>¿Le presentamos a alguien?</b><small>Cada día hay 3 personas nuevas. Si <b>los dos</b> elegís la misma, se conocen. Primero amistad, luego romance… poco a poco 💛</small></div></div>
      <button class="btn primary mt" id="loveFind" style="width:100%">👋 Presentarle a alguien${v[other()] != null && v[who] == null ? ` · ${o} ya ha votado` : ""}</button>
      <div class="sub" style="text-align:center;font-size:12px;margin-top:8px">${SEXW[p.sex][1]} ${pn} es ${SEXW[p.sex][0]} · le gustan ${({ m: "los chicos", f: "las chicas", all: "chicos y chicas" })[p.likes]} · <button class="linkbtn" id="loveSexEdit" style="font-size:12px">cambiar</button></div>`;
  } else {
    const [se, sn] = relStatus(m), left = actsLeft(m), prop = m.prop, st = m.status, novD = daysSince(m.noviosAt), kids = kidsOf(p);
    h = `<div class="couple"><div class="cfig">${chickSVG(Math.max(2, I.si), "happy", p.wear || {}, 0, p.color, { species: p.species })}<b>${pn} ${sxTag(p.sex)}</b></div><div class="cheart">${se}<small>${esc(sn)}</small></div><div class="cfig">${chickSVG(Math.max(2, I.si), "happy", geneWear(m), 0, geneColor(m), { species: m.species })}<b>${esc(m.name)} ${sxTag(sexOf(m))}</b></div></div>
      ${relBars(m)}
      <div class="chem">${m.f >= 35 || st !== "conocidos" ? `Química: <b>${CHEM[m.chem][0]} ${CHEM[m.chem][1]}</b> · ${CHEM[m.chem][2]}` : "Química: ❓ se descubre cuando sean amigos"}</div>
      <div class="sub" style="text-align:center;margin:6px 0 8px;font-size:12.5px">${SEXW[sexOf(m)][1]} ${esc(m.name)} es ${SEXW[sexOf(m)][0]} · se conocen desde el ${fmtDate(m.metAt, { day: "numeric", month: "long" })}${m.like ? ` · a ${esc(m.name)} le encantan ${esc(m.like)}` : ""}</div>`;
    // momentos especiales
    let big = "";
    if (st === "conocidos" && m.fz) big = `<div class="sub" style="text-align:center;margin:0">🤝 Entre ${pn} y ${esc(m.name)} no hay química: serán grandes amigos. Si queréis buscarle el amor, podéis dejar de verse abajo.</div>`;
    else if (st === "conocidos" && m.r >= 50 && m.f >= 45) big = (m.declNext || 0) > Date.now() ? `<button class="btn" disabled>💌 Podrá volver a declararse en ${Math.ceil((m.declNext - Date.now()) / DAY)} días</button>` : `<button class="btn primary pulse" id="loveDeclare">💌 ¡Declararse!</button>`;
    else if (st === "novios") {
      const canProp = m.r >= 90 && m.f >= 70 && novD >= WED_MIN_DAYS;
      big = prop ? (prop.by === who ? `<button class="btn" disabled>💍 Esperando el «sí» de ${o}…</button>` : `<button class="btn primary pulse" id="loveYes">💍 ¡Sí, quiero!</button>`)
        : (m.propNext || 0) > Date.now() ? `<button class="btn" disabled>💍 Podrá volver a pedírselo en ${Math.ceil((m.propNext - Date.now()) / DAY)} días</button>`
        : `<button class="btn ${canProp ? "primary" : ""}" id="lovePropose" ${canProp ? "" : "disabled"}>💍 Pedir matrimonio${canProp ? "" : ` · ${novD < WED_MIN_DAYS ? `${novD}/${WED_MIN_DAYS} días de novios` : "romance 90 y amistad 70"}`}</button>`;
    } else if (st === "prometidos") {
      const pr = m.prep || {}, done = PREP.filter(([k]) => pr[k]).length;
      big = `<div class="prep">${PREP.map(([k, e, n]) => `<button class="btn ${pr[k] ? "" : "primary"}" data-prep="${k}" ${pr[k] || pr.last === today ? "disabled" : ""}>${pr[k] ? "✅" : e} ${n}</button>`).join("")}</div>
        ${done === PREP.length ? `<button class="btn primary pulse mt" id="loveCelebrate" ${pr.last === today ? "disabled" : ""} style="width:100%">💒 ${pr.last === today ? "La boda es mañana" : "¡Celebrar la boda!"}</button>` : `<div class="sub" style="font-size:12px;margin-top:6px">Preparativos: ${done}/${PREP.length} · uno al día</div>`}`;
    } else if (st === "casados") {
      const casD = daysSince(m.weddingAt);
      big = p.nest && !p.nest.hatched ? `<button class="btn primary" id="loveWarm">🔥 Dar calor al huevo · ${p.nest.n || 0}/${WARM_DAYS}</button>`
        : kids.length >= MAX_KIDS ? `<button class="btn" disabled>🏠 Familia completa (${MAX_KIDS} crías)</button>`
        : (p.nextNest || 0) > Date.now() ? `<button class="btn" disabled>🥚 Podrán tener otra cría en ${Math.ceil((p.nextNest - Date.now()) / DAY)} días</button>`
        : casD < FAMILY_DAYS ? `<button class="btn" disabled>🥚 Familia: ${casD}/${FAMILY_DAYS} días de casados</button>`
        : m.r < 80 ? `<button class="btn" disabled>🥚 Necesitan más romance (${Math.round(m.r)}/80)</button>`
        : sameSex(p, m) ? `<button class="btn primary" id="loveEgg">🏡 Adoptar un huevito</button><div class="sub" style="text-align:center;font-size:12px;margin-top:6px">${esc(p.name)} y ${esc(m.name)} son ${sexOf(p) === "m" ? "dos chicos" : "dos chicas"}: no pueden poner huevos, pero pueden adoptar uno 💛</div>`
        : `<button class="btn primary" id="loveEgg">🥚 Formar una familia</button>`;
    }
    const lk = INTER.map(it => [it, interLock(m, it)]).filter(([it, l]) => !it.rom || !l || it.needF <= (m.f || 0) + 15);
    h += `${big ? `<div class="lovebig">${big}</div>` : ""}
      <div class="slotname" style="display:flex;justify-content:space-between"><span>Qué hacen hoy</span><span style="opacity:.8">${left > 0 ? `Te quedan ${left} plan${left === 1 ? "" : "es"}` : "Mañana más 🌙"}</span></div>
      <div class="inters">${lk.map(([it, l]) => { const onceDone = it.once && (m.acts || {}).day === today && ((m.acts || {}).once || {})[it.id]; const ch = l ? 0 : Math.round(interChance(m, it, p)); return `<button class="inter ${it.rom ? "rom" : ""}" data-int="${it.id}" ${l || left <= 0 || onceDone ? "disabled" : ""}><i>${l ? "🔒" : it.e}</i><b>${esc(it.n)}</b><small>${l ? esc(l) : onceDone ? "Hecho hoy" : it.rom || it.ch ? ch + "% éxito" : "Seguro"}</small></button>`; }).join("")}</div>
      ${loveLadder(m)}`;
    if (p.nest && !p.nest.hatched) { const w = p.nest.warm || {}; h += `<div class="sub" style="font-size:12.5px;margin-top:8px">🥚 Nace cuando le deis calor <b>los dos el mismo día</b> durante ${WARM_DAYS} días. Hoy: ${w[who] === today ? "tú ✅" : "tú ⏳"} · ${w[other()] === today ? o + " ✅" : o + " ⏳"}</div>`; }
    if (kids.length) h += `<div class="slotname">Sus crías 🐣</div><div class="kidrow">${kids.map(k => `<button class="kidcard" data-kidc="${k.id}">${chickSVG(kidStage(k), "happy", geneWear(k), 0, geneColor(k), { species: k.species })}<b>${esc(k.name)}</b><small>${esc(colorName(k))}${k.mark ? " · " + esc(markName(k.mark)) : ""}</small></button>`).join("")}</div>`;
    if (st === "conocidos") h += `<button class="linkbtn" id="loveBreak" style="display:block;margin:10px auto 0;font-size:12px;opacity:.7">💔 Dejar de verse</button>`;
  }
  el.innerHTML = h;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  on("loveFind", openMateFinder); on("loveDeclare", declare); on("lovePropose", propose); on("loveYes", acceptWedding); on("loveCelebrate", celebrate);
  on("loveEgg", layEgg); on("loveWarm", warmEgg); on("loveBreak", breakUp); on("loveSexEdit", () => { el.innerHTML = sexSetup(p, 1); bindSexSetup(); });
  el.querySelectorAll("[data-int]").forEach(b => b.onclick = () => doInter(b.dataset.int));
  el.querySelectorAll("[data-prep]").forEach(b => b.onclick = () => doPrep(b.dataset.prep));
  el.querySelectorAll("[data-kidc]").forEach(b => b.onclick = () => openKid(b.dataset.kidc));
}
function openMateFinder() {
  const p = state.pet || {}, C = mateCands(p), today = dayKey(), v = p.mateVote && p.mateVote.day === today ? p.mateVote : {}, o = name(other());
  openSheet("👋 Presentarle a alguien", `<div class="sub" style="margin-bottom:10px">Elegid <b>los dos</b> a la misma persona para que se conozcan. Empezarán como desconocidos: la amistad y el romance se ganan poco a poco 💛</div>
    <div class="cands">${C.map((c, i) => { const tr = TRAITS[c.trait]; return `<button class="cand ${v[who] === i ? "on" : ""}" data-cand="${i}">${chickSVG(4, "happy", geneWear(c), 0, geneColor(c), { species: c.species })}<b>${SEXW[c.sex][1]} ${esc(c.name)}</b><small>${esc(colorName(c))}${c.mark ? " · " + esc(markName(c.mark)) : ""}</small><small>${tr ? tr.e + " " + esc(tr.n) : ""}</small><small>Le encantan ${esc(c.like)}</small><small>Química: ❓</small><span class="votes">${v[who] === i ? `<em>Tú ✓</em>` : ""}${v[other()] === i ? `<em class="o">${esc(o)} ✓</em>` : ""}</span></button>`; }).join("")}</div>`);
  $("sheetBody").querySelectorAll("[data-cand]").forEach(b => b.onclick = () => voteMate(+b.dataset.cand));
}
function voteMate(i) {
  let matched = null;
  petTx(q => {
    if (mateOf(q)) return null;
    const today = dayKey(), C = mateCands(q);
    q.mateVote = q.mateVote && q.mateVote.day === today ? { ...q.mateVote } : { day: today };
    q.mateVote[who] = i;
    if (q.mateVote[other()] === i) { matched = C[i]; q.mate = { ...matched, status: "conocidos", metAt: Date.now(), f: 5, r: 0, dates: 0, lastInt: today }; relMiles(q.mate); q.mateVote = null; logEv(q, "friend"); }
    return q;
  }).then(r => {
    if (!r) return;
    sceneSig = ""; petSig = "";
    if (matched) { closeSheet(); renderPet(); react("happy", 2500); readView({ icon: "👋", title: `${(state.pet || {}).name} ha conocido a ${matched.name}`, sub: "Los dos habéis elegido a la misma persona 💛", text: `Ahora son recién conocidos. Cada día podéis hacer ${ACTS_PER_DAY} planes cada uno con ${matched.name}: charlar, jugar, merendar… Cuando sean amigos se desbloquea el romance 💗` }); sendMsg(`👋 ${(state.pet || {}).name} ha conocido a ${matched.name}. ¡A ver si se hacen amigos! 😊`, "pet"); }
    else { openMateFinder(); toast(`Voto guardado. Falta que ${name(other())} elija a la misma persona 💌`); notifyOther(`👋 ${name(who)} ha elegido a quién presentarle a ${(state.pet || {}).name}. ¡Vota tú también!`); }
  }).catch(offline);
}
function propose() {
  petTx(q => { const m = relOf(mateOf(q)); if (!m || m.status !== "novios" || m.r < 90 || m.f < 70 || daysSince(m.noviosAt) < WED_MIN_DAYS || (m.propNext || 0) > Date.now()) return null; m.prop = { by: who, at: Date.now() }; return q; })
    .then(r => { if (!r) return; renderPet(); toast(`💍 Ahora ${name(other())} tiene que decir «Sí, quiero»`, 3500); notifyOther(`💍 ${name(who)} quiere que ${(state.pet || {}).name} y ${(mateOf(state.pet) || {}).name} se casen. ¡Entra y di «Sí, quiero»!`); }).catch(offline);
}
function acceptWedding() {
  let ok = false, no = false;
  petTx(q => {
    const m = relOf(mateOf(q)); if (!m || !m.prop || m.prop.by === who || m.status !== "novios") return null;
    m.prop = null;
    if (m.wed === false) { m.wedNo = (m.wedNo || 0) + 1; m.propNext = Date.now() + 7 * DAY; if (m.wedNo >= 2) m.wed = true; no = true; return q; }
    m.status = "prometidos"; m.promAt = Date.now(); m.prep = {}; relMiles(m); ok = true; return q;
  }).then(() => {
    renderPet();
    const m = mateOf(state.pet) || {}, pn = (state.pet || {}).name;
    if (no) return readView({ icon: "💔", title: `A ${m.name} no le hace ilusión casarse… de momento`, sub: "Siguen siendo novios y se quieren igual 💞", text: `${m.name} prefiere ir sin prisas. Seguid cuidando la relación y en una semana ${pn} podrá volver a pedírselo. A lo mejor cambia de opinión 😉` });
    if (!ok) return;
    confetti(); readView({ icon: "💍", title: "¡Se van a casar!", sub: `${pn} y ${m.name} están prometidos`, text: mileText("prometidos") }); sendMsg(`💍 ¡${pn} y ${m.name} se han prometido! Toca preparar la boda juntos 💐`, "pet");
  }).catch(offline);
}

function weddingShow() {
  const p = state.pet || {}, m = mateOf(p); if (!m) return;
  const si = Math.max(2, stageOf(p.xp || 0)), w1 = { ...(p.wear || {}) }, w2 = geneWear(m);
  if (!w1.head) w1.head = sexOf(p) === "m" ? "chistera" : "tiara"; if (!w2.head) w2.head = sexOf(m) === "m" ? "chistera" : "tiara";
  readView({ icon: "💍", title: `¡Vivan los novios!`, sub: `${p.name} ♥ ${m.name} · ${fmtDate(m.weddingAt || Date.now(), { day: "numeric", month: "long", year: "numeric" })}`, text: `Gracias a ${name("a")} y ${name("b")} por ser los padrinos 🥂 Os han dado 150 🪙 de regalo de boda. Cuando lleven ${FAMILY_DAYS} días casados podrán formar una familia 🥚` });
  const box = $("rvIcon");
  if (box) box.innerHTML = `<span class="wedpair">${chickSVG(si, "love", w1, 0, p.color, { species: p.species })}${chickSVG(si, "love", w2, 0, geneColor(m), { species: m.species })}</span>`;
  confetti(); setTimeout(confetti, 900);
}
function layEgg() {
  petTx(q => { const m = relOf(mateOf(q)); if (!m || m.status !== "casados" || daysSince(m.weddingAt) < FAMILY_DAYS || m.r < 80 || (q.nest && !q.nest.hatched) || kidsOf(q).length >= MAX_KIDS || (q.nextNest || 0) > Date.now()) return null; q.nest = { at: Date.now(), n: 0, warm: {}, by: who, adopted: sameSex(q, m) || null }; return q; })
    .then(r => { if (!r) return; sceneSig = ""; renderPet(); confetti(); const ad = r.nest && r.nest.adopted; say(ad ? "¡Hemos adoptado un huevito! 🥚💛 Dadle calor los dos cada día 🔥" : "¡Un huevito! 🥚 Dadle calor los dos cada día 🔥", 4500); notifyOther(`🥚 ¡${(state.pet || {}).name} y ${(mateOf(state.pet) || {}).name} ${ad ? "han adoptado" : "han puesto"} un huevo! Entra a darle calor 🔥`); }).catch(offline);
}
function warmEgg() {
  const today = dayKey(); let st = "";
  petTx(q => {
    const N = q.nest; if (!N || N.hatched) return null;
    N.warm = { ...(N.warm || {}) };
    if (N.warm[who] === today) { st = "ya"; return null; }
    N.warm[who] = today; bump(q, "warm");
    if (N.warm[other()] === today && N.lastBoth !== today) { N.n = (N.n || 0) + 1; N.lastBoth = today; st = N.n >= WARM_DAYS ? "hatch" : "both"; } else st = "me";
    return q;
  }).then(() => {
    if (st === "ya") return toast("Hoy ya le has dado calor 🔥 Mañana más");
    sceneSig = ""; renderPet(); const nf = $("nestFig"); if (nf) hearts(nf, "🔥");
    if (st === "hatch") hatchKid();
    else if (st === "both") toast(`🔥 ¡Los dos le habéis dado calor hoy! ${(state.pet.nest || {}).n}/${WARM_DAYS}`, 3200);
    else { toast(`🔥 Calentito. Falta ${name(other())} hoy`, 3000); notifyOther(`🥚 ${name(who)} ha dado calor al huevo. ¡Te toca a ti hoy! 🔥`); }
  }).catch(offline);
}
function hatchKid() {
  let kid = null;
  petTx(q => {
    const m = mateOf(q), N = q.nest; if (!m || !N || N.hatched || (N.n || 0) < WARM_DAYS) return null;
    const g = mixGenes(petGene(q), m), used = new Set(kidsOf(q).map(k => k.name));
    const nm = KID_NAMES.filter(n => !used.has(n))[Math.floor(Math.random() * 10)] || "Peque";
    const ksx = Math.random() < .5 ? "m" : "f";
    kid = { id: Date.now().toString(36), sex: ksx, adopted: N.adopted || null, name: nm, species: Math.random() < .5 ? q.species || "pollito" : m.species || q.species || "pollito", ...g, born: Date.now(), by: who };
    q.kids = [...kidsOf(q), kid]; q.nest = null; q.nextNest = Date.now() + NEST_GAP; firstMark(q, "baby", nm); q.coins = coinsOf(q) + 40;
    return q;
  }).then(() => {
    if (!kid) return; sceneSig = ""; petSig = ""; renderPet(); confetti();
    readView({ icon: "🐣", title: `¡Ha nacido ${kid.name}!`, sub: `${SEXW[sexOf(kid)][1]} ${sexOf(kid) === "m" ? "Hijo" : "Hija"}${kid.adopted ? " adoptiv" + (sexOf(kid) === "m" ? "o" : "a") : ""} de ${(state.pet || {}).name} y ${(mateOf(state.pet) || {}).name}`, text: `Color: ${colorName(kid)}${kid.mut ? " (¡una mutación rara! ✨)" : ""}. Marcas: ${markName(kid.mark)}. Podéis cambiarle el nombre tocándole en la escena 💛` });
    const box = document.querySelector("#rvIcon"); if (box) box.innerHTML = `<span class="wedpair">${chickSVG(1, "happy", geneWear(kid), 0, geneColor(kid), { species: kid.species })}</span>`;
    sendMsg(`🐣 ¡Ha nacido ${kid.name}, la cría de ${(state.pet || {}).name}! Ven a conocerle 💛`, "pet");
  }).catch(offline);
}
function openKid(id) {
  const p = state.pet || {}, k = kidsOf(p).find(x => x.id === id); if (!k) return;
  const days = Math.max(0, -calDays(k.born)), st = kidStage(k), m = mateOf(p) || {};
  const own = CATALOG.filter(it => it.cat === "ropa" && ["head", "face", "neck"].includes(it.slot) && isOwned(p, it));
  openSheet(`🐣 ${k.name}`, `<div class="kidbig">${chickSVG(st, "happy", geneWear(k), 0, geneColor(k), { species: k.species })}</div>
    <div class="sub" style="text-align:center">${esc(stageName(st, k.species))} · ${days ? days + " día" + (days === 1 ? "" : "s") : "nació hoy"} · ${sxTag(sexOf(k))} ${sexOf(k) === "m" ? "hijo" : "hija"}${k.adopted ? " adoptiv" + (sexOf(k) === "m" ? "o" : "a") : ""} de ${esc(p.name)} y ${esc(m.name || "?")}<br>🎨 ${esc(colorName(k))}${k.mut ? " ✨" : ""} · 🐾 ${esc(markName(k.mark))}</div>
    <div class="lovebtns mt"><button class="btn primary" id="kidHug">💗 Mimito</button><button class="btn" id="kidName">✏️ Nombre</button></div>
    ${own.length ? `<div class="slotname">🎀 Prestarle ropa</div><div class="shopgrid">${own.map(it => `<button class="shopit ${(k.wear || {})[it.slot] === it.id ? "on" : ""}" data-kw="${it.id}">${shopIcon(it)}<b>${esc(it.n)}</b></button>`).join("")}</div>` : ""}`);
  fitIcons($("sheetBody"));
  $("kidHug").onclick = () => { const f = document.querySelector(`#petSky [data-kid="${id}"]`); hearts(f || $("petBox"), "💗"); buzz(20); petTx(q => { settle(q); setNeed(q, "love", 6); bump(q, "kid"); return q; }).catch(() => {}); toast(`${k.name}: ¡pío pío! 🥰`); };
  $("kidName").onclick = () => { const nm = (prompt("¿Cómo se llama?", k.name) || "").trim().slice(0, 20); if (!nm) return; petTx(q => { const x = kidsOf(q).find(y => y.id === id); if (!x) return null; x.name = nm; return q; }).then(() => { sceneSig = ""; openKid(id); renderPet(); }).catch(offline); };
  $("sheetBody").querySelectorAll("[data-kw]").forEach(b => b.onclick = () => { const it = CAT[b.dataset.kw]; petTx(q => { const x = kidsOf(q).find(y => y.id === id); if (!x) return null; x.wear = { ...(x.wear || {}) }; x.wear[it.slot] = x.wear[it.slot] === it.id ? null : it.id; return q; }).then(() => { sceneSig = ""; renderPet(); openKid(id); }).catch(offline); });
}

// ---------- árbol familiar ----------
function renderTree(p) {
  const el = $("petTree"); if (!el) return;
  const m = mateOf(p), kids = kidsOf(p), fam = p.family || [], si = Math.max(1, stageOf(p.xp || 0));
  const fig = (svg, nm, sub, cls = "", sx) => `<div class="tnode ${cls}"><div class="tav">${svg}</div><b>${sx ? sxTag(sx) + " " : ""}${esc(nm)}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  let h = `<div class="tree">`;
  if (fam.length) h += `<div class="tgen"><div class="tlabel">Antepasados</div><div class="trow">${fam.map(f => fig(chickSVG(6, "happy", f.wear || {}, 0, f.color, { species: f.species }), f.name, `✨ ${f.hatchedAt ? fmtDate(f.hatchedAt, { month: "short", year: "numeric" }) : "legendario"}`, "", f.sex)).join("")}</div><div class="tline"></div></div>`;
  h += `<div class="tgen"><div class="tlabel">${m ? relStatus(relOf(m)).reverse().join(" ") : "Ahora"}</div><div class="trow couple2">${fig(chickSVG(si, "happy", p.wear || {}, 0, p.color, { species: p.species }), p.name || "Pollito", p.hatchedAt ? "🐣 " + fmtDate(p.hatchedAt, { day: "numeric", month: "short" }) : "", "", p.sex)}${m ? `<div class="tknot">${relStatus(m)[0]}<small>${fmtDate(m.weddingAt || m.noviosAt || m.metAt, { day: "numeric", month: "short" })}</small></div>` + fig(chickSVG(si, "happy", geneWear(m), 0, geneColor(m), { species: m.species }), m.name, `👋 ${fmtDate(m.metAt, { day: "numeric", month: "short" })}`, "", sexOf(m)) : `<div class="tknot ghost">＋<small>pareja</small></div>`}</div>`;
  if (kids.length || (p.nest && !p.nest.hatched)) h += `<div class="tline"></div><div class="tlabel">Crías</div><div class="trow kids">${kids.map(k => fig(chickSVG(kidStage(k), "happy", geneWear(k), 0, geneColor(k), { species: k.species }), k.name, `🐣 ${fmtDate(k.born, { day: "numeric", month: "short" })}`, "", sexOf(k))).join("")}${p.nest && !p.nest.hatched ? fig(nestSVG(p), "Huevo", `🔥 ${p.nest.n || 0}/${WARM_DAYS}`, "egg") : ""}</div>`;
  h += `</div></div>`;
  // cronología
  const ev = [];
  fam.forEach(f => { if (f.hatchedAt) ev.push([f.hatchedAt, "🐣", `Nace ${f.name}`]); if (f.at) ev.push([f.at, "✨", `${f.name} se hace legendario y llega un huevo nuevo`]); });
  if (p.born) ev.push([p.born, "🥚", `Llega el huevo de ${p.name}`]);
  if (p.hatchedAt) ev.push([p.hatchedAt, "🐣", `Nace ${p.name}`]);
  if (m) { relOf(m); const ms = m.miles || { met: m.metAt }; MILES.forEach(([k, e, n]) => { if (ms[k]) ev.push([ms[k], e, k === "met" ? `${p.name} conoce a ${m.name}` : `${p.name} y ${m.name}: ${n.toLowerCase()}`]); }); }
  (p.exes || []).forEach(x => ev.push([x.at, "💔", `${p.name} deja de ver a ${x.name}`]));
  if (p.nest && p.nest.at) ev.push([p.nest.at, "🥚", "Ponen un huevo"]);
  kids.forEach(k => ev.push([k.born, "🐣", `Nace ${k.name} (${colorName(k)}${k.mark ? ", " + markName(k.mark).toLowerCase() : ""})`]));
  ev.sort((a, b) => b[0] - a[0]);
  h += ev.length ? `<div class="slotname">📜 Cronología</div><div class="tlist">${ev.slice(0, 40).map(([t, e, s]) => `<div class="tev"><i>${e}</i><div><b>${esc(s)}</b><small>${fmtDate(t, { day: "numeric", month: "long", year: "numeric" })}</small></div></div>`).join("")}</div>` : "";
  el.innerHTML = h;
}
function familyCtx(p) {
  const m = relOf(mateOf(p)), k = kidsOf(p), me = p.sex ? `- Eres ${SEXW[p.sex][0]}.` : ""; if (!m) return me;
  const st = relStatus(m)[1].toLowerCase();
  return me + `\n- Conoces a ${m.name} (${SEXW[sexOf(m)][0]}) desde el ${fmtDate(m.metAt, { day: "numeric", month: "long" })}. Ahora mismo sois: ${st} (amistad ${Math.round(m.f)}/100, romance ${Math.round(m.r)}/100). A ${m.name} le encantan ${m.like || "los mimos"}.${m.fz ? " Entre vosotros no hay química: sois solo amigos." : ""}${m.status === "conocidos" && m.r >= 30 ? " Te gusta un montón, aunque te da vergüenza admitirlo." : ""}${k.length ? ` Vuestras crías: ${k.map(x => x.name).join(", ")}.` : ""}${p.nest && !p.nest.hatched ? " Estáis esperando un huevo 🥚." : ""}`;
}

// ---------- Pie de página con la autoría ----------
function addCredits() {
  const y = new Date().getFullYear();
  document.querySelectorAll("main[id^='tab-']").forEach(m => {
    if (m.querySelector(".credit")) return;
    const f = document.createElement("footer"); f.className = "credit";
    f.innerHTML = `<div class="clogo">Nosotros <span>♥</span></div><div class="cby">Diseñada y desarrollada por <b>Christian Segovia Martín</b></div><div class="cr">© ${y > 2025 ? "2025–" + y : y} Christian Segovia Martín · Todos los derechos reservados · Versión ${APP_VERSION}</div>`;
    m.appendChild(f);
  });
}
addCredits();

// =====================================================================
//   v43 · Vida propia: la mascota va por la casa y hay que buscarla
// =====================================================================
const LOC_SLOT = 40 * 6e4;   // cada 40 minutos puede cambiar de sitio
const LOCN = { out: "fuera", salon: "el salón", cocina: "la cocina", dorm: "el dormitorio", jardin: "el jardín de casa" };
const LOCE = { out: "🌳", salon: "🛋️", cocina: "🍳", dorm: "🛏️", jardin: "🌻" };
const LOCCLUE = {
  out: ["Se oyen pajaritos fuera… ¿habrá salido a pasear? 🌳", "La puerta de la calle está entreabierta 🚪🌳"],
  salon: ["Se oye la tele en el salón 📺", "Hay plumitas en el sofá del salón 🛋️"],
  cocina: ["Huele a galletas desde la cocina 🍪", "Se oye ñam, ñam en la cocina 🍓"],
  dorm: ["Se oyen ronquiditos en el dormitorio 💤", "La lamparita del dormitorio está encendida 🛏️"],
  jardin: ["Se oyen risas en el jardín de casa 🌻", "Hay huellitas camino del jardín de casa 🐾"]
};
const LOC_GO = { cocina: ["¡Tengo hambre! Me voy a la cocina 🍪", "Voy a por algo rico a la cocina 🍓"], dorm: ["Qué sueño… me voy a la camita 💤", "Me voy al dormitorio a descansar 🛏️"],
  salon: ["Me voy al salón a ver la tele 📺", "Voy al sofá un ratito 🛋️"], out: ["¡Me voy a dar un paseo! 🌳", "Salgo a tomar el aire ☀️"], jardin: ["¡Me voy a jugar al jardín! 🌻", "Voy a regar las flores 🌷"] };
let locSeen = null, locMiss = false, locNav = false, locCalled = false;
const viewLoc = () => (petView === "out" ? "out" : curRoom);
function pickW(w, seed) { const tot = w.reduce((a, x) => a + x[1], 0); let r = (seed % 1000) / 1000 * tot; for (const [k, v] of w) { if ((r -= v) < 0) return k; } return w[0][0]; }
function schedW(h) {
  if (h >= 22 || h < 7) return [["dorm", 1]];
  if (h < 10) return [["cocina", 4], ["salon", 2], ["jardin", 1]];
  if (h < 13) return [["out", 3], ["jardin", 2], ["salon", 2], ["cocina", 1]];
  if (h < 15) return [["cocina", 3], ["salon", 2], ["out", 2]];
  if (h < 17) return [["dorm", 2], ["salon", 2], ["out", 2], ["jardin", 1]];
  if (h < 20) return [["out", 3], ["jardin", 2], ["salon", 3]];
  return [["salon", 4], ["cocina", 2], ["dorm", 1]];
}
function petLoc(p, I) {
  p = p || state.pet || {}; I = I || petInfo();
  if (!I.si || tripAway(p)) return viewLoc();
  const now = Date.now();
  if (p.here && p.here.until > now && LOCN[p.here.loc]) return p.here.loc;
  if (isNapping(p) || currentExpr(I) === "sleep") return "dorm";
  if (I.nv.food < 35) return "cocina";
  if (I.nv.energy < 28) return "dorm";
  const slot = Math.floor(now / LOC_SLOT);
  if (I.nv.fun < 35) return hashStr(slot + ":f") % 2 ? "out" : "jardin";
  return pickW(schedW(hourIn(myTz)), hashStr(slot + ":" + (p.born || 0)));
}
function mateLoc(p, I) {
  const m = mateOf(p); if (!m) return null;
  const pl = petLoc(p, I), slot = Math.floor(Date.now() / LOC_SLOT), close = m.status !== "conocidos" ? 85 : 55;
  if (pl === "dorm" && m.status !== "conocidos") return "dorm";
  return hashStr(slot + ":m:" + m.name) % 100 < close ? pl : pickW(schedW(hourIn(myTz)).filter(x => x[0] !== pl).concat([["jardin", 1]]), hashStr(slot + ":mw:" + m.name));
}
function kidLoc(p, I, k) {
  const pl = petLoc(p, I), slot = Math.floor(Date.now() / LOC_SLOT);
  if (pl === "dorm" && hourIn(myTz) >= 21) return "dorm";
  return hashStr(slot + ":k:" + k.id) % 100 < 65 ? pl : (hashStr(slot + k.id) % 2 ? "jardin" : "salon");
}
const locHere = () => petLoc() === viewLoc();
function summonPet(silent) {
  const loc = viewLoc(), pn = (state.pet || {}).name || "Pollito";
  if (locHere()) return Promise.resolve();
  locNav = true; locCalled = true;
  if (!silent) toast(`📣 ¡${pn}! Ya viene corriendo… 🐾`, 2200);
  return petTx(q => { q.here = { loc, until: Date.now() + 15 * 6e4, by: who }; return q; }).then(() => { sceneSig = ""; petSig = ""; renderPet(); walkIn(); }).catch(offline);
}
function renderLocate(p, I) {
  const box = $("petBox"), look = $("petLook"); if (!box || !look) return true;
  const pl = petLoc(p, I), vl = viewLoc(), here = pl === vl, pn = esc(p.name || "Pollito");
  if (!I.si || !p.born) { locSeen = null; box.classList.remove("gone"); look.classList.add("hidden"); return true; }
  if (locSeen && locSeen.loc !== pl && locSeen.here && !here && !locNav && performance.now() > 5000 && !$("tab-pet").classList.contains("hidden") && !box.classList.contains("gone")) {
    // se va andando de la habitación en la que la estabas mirando
    setPose(""); say(rnd(LOC_GO[pl] || ["¡Ahora vuelvo! 🐾"]), 2600);
    box.style.transition = "left 1600ms linear"; box.classList.add("walking"); box.classList.toggle("flip", petX < 50); box.style.left = (petX < 50 ? -30 : 130) + "%";
    setTimeout(() => { box.classList.add("gone"); box.classList.remove("walking", "flip"); box.style.transition = "none"; petX = 50; box.style.left = "50%"; $("petScene").style.setProperty("--px", "50%"); }, 1650);
  } else if (locSeen && !locSeen.here && here && !locNav && performance.now() > 5000 && !$("tab-pet").classList.contains("hidden")) {
    walkIn(); setTimeout(() => say(rnd(["¡Ya estoy aquí! 🐾", "¡Hola! ¿Me buscabas? 👋", "¡Llegué! 😊"]), 2200), 1900);
  } else box.classList.toggle("gone", !here);
  look.classList.toggle("hidden", here);
  if (!here) {
    if (look.dataset.loc !== vl) { look.dataset.loc = vl; look.innerHTML = `<b>${pn} no está aquí</b><button class="btn" id="lookCall">📣 Llamarle</button>`; $("lookCall").onclick = e => { e.stopPropagation(); summonPet(); }; }
    locMiss = true;
  } else if (locMiss && !locCalled && I.si) {
    locMiss = false;
    const slot = Math.floor(Date.now() / LOC_SLOT), key = "found:" + who;
    if (ls.get(key) !== String(slot)) {
      ls.set(key, String(slot));
      setTimeout(() => { say(rnd([`¡Me has encontrado! 🎉 Estaba en ${LOCN[pl]}`, `¡Pillado! 🙈 +3 🪙`, `¡Cucú! 👀 ¡Aquí estoy!`]), 3200); react("happy", 1800); }, 250);
      petTx(q => { q.coins = coinsOf(q) + 3; return q; }).catch(() => {});
    }
  } else if (here) locMiss = false;
  if (here) locCalled = false;
  locSeen = { loc: pl, here }; locNav = false;
  return here;
}
// animaciones cuando hacen planes juntos
const DATE_PROPS = {
  picnic: `<svg viewBox="0 0 220 60"><ellipse cx="110" cy="34" rx="104" ry="22" fill="#e63946"/><g fill="#fff" opacity=".9">${[20, 60, 100, 140, 180].map(x => `<rect x="${x}" y="16" width="18" height="36" transform="skewX(-20)"/>`).join("")}</g><text x="150" y="30" font-size="26">🧺</text><text x="40" y="34" font-size="20">🍓</text></svg>`,
  velas: `<svg viewBox="0 0 220 80"><rect x="60" y="30" width="100" height="10" rx="4" fill="#fff"/><rect x="70" y="40" width="6" height="36" fill="#8a5a38"/><rect x="144" y="40" width="6" height="36" fill="#8a5a38"/><text x="98" y="30" font-size="24">🕯️</text><text x="74" y="30" font-size="18">🍝</text><text x="126" y="30" font-size="18">🍷</text></svg>`,
  cine: `<svg viewBox="0 0 220 70"><text x="70" y="52" font-size="30">🍿</text><text x="120" y="52" font-size="28">🥤</text></svg>`
};
function interAnim(id) {
  const sc = $("petScene"); if (!sc || !locHere()) return;
  const mf = $("mateFig"); if (!mf || mf.classList.contains("far")) return;
  const close = ["abrazo", "beso", "alas", "cita", "piropo", "merienda"].includes(id);
  if (close) { sc.classList.add("inter-close"); clearTimeout(interAnim.t); interAnim.t = setTimeout(() => sc.classList.remove("inter-close"), id === "cita" ? 20000 : 5000); }
  const pb = $("petBox"), px = parseFloat(getComputedStyle(sc).getPropertyValue("--px")) || petX;
  const at = (e, dx, top, cls = "burst", ms = 1600) => fx(cls, e, `left:${px + dx}%;top:${top}%`, ms);
  if (id === "abrazo") { pb.classList.add("hugme"); mf.classList.add("hugme"); setTimeout(() => { pb.classList.remove("hugme"); mf.classList.remove("hugme"); }, 2400); at("💞", -12, 30); }
  else if (id === "beso") setTimeout(() => { at("💋", -13, 36); at("💗", -10, 24); }, 600);
  else if (id === "alas") { anim("hopsm", 700); mf.classList.add("hop"); setTimeout(() => mf.classList.remove("hop"), 800); at("🤝", -13, 50); }
  else if (id === "charlar") { at("💬", -30, 26); setTimeout(() => at("💭", 4, 22), 700); }
  else if (id === "jugar") { for (let i = 0; i < 4; i++) setTimeout(() => at("⚽", i % 2 ? -4 : -28, 55 + (i % 2) * 6, "burst", 900), i * 450); }
  else if (id === "merienda") at("🍓", -14, 50);
  else if (id === "regalo") at("🎁", -30, 40);
  else if (id === "piropo") at("😊", -30, 28);
  else if (id === "chiste") { at("😂", -30, 26); at("😆", 2, 24); }
  else if (id === "cita") {
    const kind = rnd(Object.keys(DATE_PROPS)), d = document.createElement("div"); d.className = "dateprop dp-" + kind; d.innerHTML = DATE_PROPS[kind];
    d.style.left = `calc(${px}% - 26%)`; sc.appendChild(d); setTimeout(() => d.remove(), 20000);
    for (let i = 0; i < 6; i++) setTimeout(() => at(rnd(["💕", "💖", "✨"]), -14 + Math.random() * 10, 20 + Math.random() * 20), i * 500);
  }
}


// =====================================================================
//   v44 · Más vida: patitas, poses, comportamientos espontáneos y mirada
// =====================================================================
let petPose = "", poseT = 0, lifeBusy = 0;
function setPose(p, ms) {
  const b = $("petBox"); if (!b) return;
  b.classList.remove("pose-bed", "pose-sofa", "pose-eat", "pose-curl", "pose-tiptoe", "pose-dance", "pose-stretch", "pose-shake", "pose-scratch", "pose-peck");
  petPose = p || ""; clearTimeout(poseT);
  if (p) { b.classList.add("pose-" + p); if (ms) poseT = setTimeout(() => setPose(""), ms); }
}
// acompañantes andan a la vez que la mascota
function crewWalk(dx, dur) {
  document.querySelectorAll("#mateFig:not(.far), #petSky .kidfig:not(.alone)").forEach((e, i) => {
    e.classList.add("walking"); e.classList.toggle("flip", dx < 0);
    setTimeout(() => e.classList.remove("walking", "flip"), dur + 500 + i * 150);
  });
}
// entrar andando desde un lado
function walkIn() {
  const b = $("petBox"); if (!b) return;
  const from = Math.random() < .5 ? -25 : 125, to = 35 + Math.random() * 30;
  b.style.transition = "none"; b.style.left = from + "%"; void b.offsetWidth;
  b.classList.remove("gone"); b.classList.add("walking"); b.classList.toggle("flip", from > 50);
  const dur = 1900; b.style.transition = `left ${dur}ms linear`; b.style.left = to + "%"; petX = to; $("petScene").style.setProperty("--px", to + "%");
  crewWalk(from > 50 ? -1 : 1, dur);
  setTimeout(() => b.classList.remove("walking", "flip"), dur + 40);
  petBusyUntil = Date.now() + dur + 1500;
}
// mirada que sigue tu dedo y se gira hacia ti
(function eyesFollow() {
  const sc = $("petScene"); if (!sc) return; let t = 0;
  const look = e => {
    const b = $("petBox"); if (!b || b.classList.contains("gone")) return;
    const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * .5;
    const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 140)), dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 140));
    const fl = b.classList.contains("flip") ? -1 : 1;
    b.style.setProperty("--ex", (dx * 5 * fl).toFixed(1) + "px"); b.style.setProperty("--ey", (dy * 3.5).toFixed(1) + "px");
    clearTimeout(t); t = setTimeout(() => { b.style.setProperty("--ex", "0px"); b.style.setProperty("--ey", "0px"); }, 2500);
  };
  sc.addEventListener("pointermove", look); sc.addEventListener("pointerdown", look);
})();
// cosas que hace por su cuenta
const LIFE = {
  mariposa() {
    const sc = $("petScene"), bf = document.createElement("div"); bf.className = "bfly"; bf.textContent = "🦋";
    const y = 20 + Math.random() * 25, dir = Math.random() < .5; bf.style.top = y + "%"; bf.style.animationDirection = dir ? "normal" : "reverse"; sc.appendChild(bf);
    say(rnd(["¡Una mariposa! 🦋", "¡Ven aquí, mariposita!", "¡Te voy a pillar! 🦋"]), 2400);
    const tgt = dir ? [35, 60, 72] : [65, 40, 28]; tgt.forEach((x, i) => setTimeout(() => { const d = petPlace(x, 900); crewWalk(x - petX, d); anim("hopsm", 700); }, 400 + i * 1500));
    setTimeout(() => { bf.remove(); say(rnd(["Casi la pillo… 😅", "¡Qué rápida es! 🦋", "Bueno, otro día 😌"]), 2200); }, 5600);
    return 6200;
  },
  estirarse() { setPose("stretch", 2200); say(rnd(["Aaaaah… 🥱", "¡Qué a gusto! 🙆", "Estirando las alitas… 🪽"]), 2200); return 2600; },
  sacudirse() { setPose("shake", 1300); for (let i = 0; i < 4; i++) setTimeout(() => fx("burst", "🪶", `left:${petX - 10 + Math.random() * 20}%;top:${45 + Math.random() * 15}%`, 1400), i * 180); return 1800; },
  rascarse() { setPose("scratch", 1800); say(rnd(["Me pica un poquito… 🤭", "*rasca rasca*"]), 1800); return 2000; },
  picotear() { setPose("peck", 2400); for (let i = 0; i < 3; i++) setTimeout(() => fx("burst", rnd(["🌱", "·", "🐛"]), `left:${petX}%;top:78%`, 900), 300 + i * 700); return 2600; },
  bailar() { setPose("dance", 3600); for (let i = 0; i < 6; i++) setTimeout(() => fx("note", rnd(["🎵", "🎶"]), `left:${petX - 10 + Math.random() * 20}%`), i * 450); say(rnd(["¡A bailar! 💃", "🎶 La la la…", "¡Mirad qué pasos! 🕺"]), 2500); return 3900; },
  ventana(room) { const x = furnPos(room, "ventana").x, d = petPlace(x); crewWalk(x - petX, d); setTimeout(() => { setPose("tiptoe", 3200); say(rnd(["¿Qué habrá ahí fuera? 👀", "¡Un pajarito! 🐦", `¿Vendrá ${name(other())} hoy? 🪟`]), 2800); }, d + 100); return d + 3500; },
  comer() {
    const sc = $("petScene"), pl = document.createElement("div"); pl.className = "plate"; pl.innerHTML = "🍽️"; pl.style.left = `calc(${petX}% + 6%)`; sc.appendChild(pl);
    setPose("eat", 4200); say(rnd(["Ñam, ñam… 😋", "¡Qué rico! 🍓", "Mmm… migas de galleta 🍪"]), 2400);
    for (let i = 0; i < 5; i++) setTimeout(() => fx("burst", rnd(["·", "✦", "🍪"]), `left:calc(${petX}% + ${4 + Math.random() * 8}%);top:${70 + Math.random() * 8}%`, 700), 400 + i * 700);
    setTimeout(() => pl.remove(), 4400); return 4600;
  },
  sofa(room) { const x = furnPos(room, "sofa").x, d = petPlace(x); crewWalk(x - petX, d); setTimeout(() => { setPose("sofa", 7000); say(rnd(["Qué blandito… 🛋️", "Aquí me quedo un ratito 😌"]), 2400); }, d + 100); return d + 7200; },
  mimoPareja() {
    const m = mateOf(state.pet), mf = $("mateFig"); if (!m || !mf || mf.classList.contains("far")) return 0;
    const sc = $("petScene"); sc.classList.add("inter-close"); crewWalk(1, 1200);
    setTimeout(() => { hearts(mf, "💕"); react("love", 2200); say(rnd([`¡${m.name} me ha dado un mimo! 🥰`, `${m.name} me ha dado un besito 😳💗`, `Me encanta cuando ${m.name} hace eso 💞`]), 2800); }, 1300);
    setTimeout(() => sc.classList.remove("inter-close"), 4200); return 4400;
  }
};
function lifeTick(I, ex) {
  if (Date.now() < lifeBusy || Date.now() < petBusyUntil || petPose) return false;
  const p = I.p, inside = petView === "in", room = inside ? roomOf(p, curRoom) : null, items = room ? room.items || {} : {};
  const opts = [];
  if (!inside || curRoom === "jardin") opts.push(["mariposa", 3], ["picotear", 3]);
  if (inside && curRoom === "cocina") opts.push(["comer", 4]);
  if (inside && items.sofa && curRoom !== "jardin") opts.push(["sofa", 2]);
  if (inside && items.ventana) opts.push(["ventana", 2]);
  if (items.tocadiscos || Math.random() < .3) opts.push(["bailar", items.tocadiscos ? 3 : 1]);
  opts.push(["estirarse", 2], ["sacudirse", 2], ["rascarse", 1]);
  const m = mateOf(p); if (m && m.status !== "conocidos") opts.push(["mimoPareja", 2]);
  if (Math.random() > .33) return false;
  const k = pickW(opts, Math.floor(Math.random() * 1000)), ms = LIFE[k](room);
  if (!ms) return false;
  lifeBusy = Date.now() + ms; petBusyUntil = Date.now() + ms; return true;
}
window.__life = k => LIFE[k](petView === "in" ? roomOf(state.pet || {}, curRoom) : null);
// dormir en la cama (tumbado y tapado) o hecho una bolita
function sleepPose(expr) {
  const b = $("petBox"); if (!b) return;
  const room = petView === "in" ? roomOf(state.pet || {}, curRoom) : null, bed = room && room.items && room.items.cama;
  b.classList.toggle("inbed", expr === "sleep" && !!bed && locHere());
  const zz = $("petZzz"); if (zz) zz.style.left = expr === "sleep" && bed ? `calc(${furnPos(room, "cama").x}% + 10px)` : "";
  const dr = $("petDream"); if (dr) { dr.style.left = expr === "sleep" && bed ? `calc(${furnPos(room, "cama").x}% + 30px)` : ""; dr.style.right = expr === "sleep" && bed ? "auto" : ""; }
  if (expr !== "sleep") { if (petPose === "curl") setPose(""); return; }
  if (!bed && petPose !== "curl") setPose("curl");
}


// =====================================================================
//   v49 · Calidad: sonidos, animaciones más suaves, ambiente y sprites
// =====================================================================
// ---------- Sonidos (sintetizados, sin archivos) ----------
const SFX = (() => {
  let ac = null, master = null;
  const on = () => ls.get("snd") !== "0";
  const ctx = () => {
    if (!on()) return null;
    try {
      if (!ac) { ac = (typeof audioCtx !== "undefined" && audioCtx) || new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .55; master.connect(ac.destination); }
      if (ac.state === "suspended") ac.resume();
      return ac;
    } catch (e) { return null; }
  };
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  const osc = (type, f0, f1, dur, peak = .25, delay = 0) => {
    const a = ctx(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, .012, peak, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  };
  const noise = (dur, peak = .2, filt = 1200, delay = 0, q = 1) => {
    const a = ctx(); if (!a) return; const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = "bandpass"; f.frequency.value = filt; f.Q.value = q;
    env(g, t, .005, peak, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
  };
  let lastP = 0;
  const S = {
    unlock() { const a = ctx(); if (a) { const o = a.createOscillator(), g = a.createGain(); g.gain.value = .0001; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .01); } },
    pio(force) { const n = Date.now(); if (!force && n - lastP < 1400) return; lastP = n; const b = 1700 + Math.random() * 500; osc("sine", b, b * 1.45, .09, .16); osc("sine", b * 1.1, b * 1.6, .08, .12, .12); },
    tap() { osc("sine", 880, 660, .05, .07); },
    pop() { osc("sine", 420, 900, .09, .22); },
    coin() { osc("square", 988, null, .07, .08); osc("square", 1319, null, .16, .08, .07); },
    eat() { for (let i = 0; i < 3; i++) noise(.06, .25, 1800 + Math.random() * 800, i * .14, 2); },
    splash() { noise(.45, .22, 900, 0, .7); for (let i = 0; i < 4; i++) osc("sine", 600 + Math.random() * 700, 1400, .06, .06, .1 + i * .07); },
    hug() { [523, 659, 784].forEach((f, i) => osc("triangle", f, null, .35, .09, i * .05)); },
    bounce() { osc("sine", 220, 520, .12, .2); osc("sine", 260, 600, .1, .14, .16); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => osc("triangle", f, null, .22, .14, i * .09)); osc("triangle", 1319, null, .5, .1, .4); },
    fail() { osc("sawtooth", 220, 110, .35, .08); },
    whoosh() { noise(.18, .14, 600, 0, .6); },
    ding() { osc("sine", 1568, null, .18, .12); osc("sine", 2093, null, .25, .08, .06); },
    lullaby() { [659, 587, 523, 587, 659].forEach((f, i) => osc("sine", f, null, .3, .07, i * .28)); },
    on, set(v) { ls.set("snd", v ? "1" : "0"); if (v) S.pop(); }
  };
  return S;
})();
document.addEventListener("pointerdown", () => SFX.unlock(), { once: true, capture: true });
// enganchar sonidos a lo que ya pasa en la app
{
  const _hearts = hearts, _coinPop = coinPop, _confetti = confetti, _say = say; let lastH = 0;
  hearts = (el, e) => { const n = Date.now(); if (n - lastH > 350) { lastH = n; SFX.hug(); } return _hearts(el, e); };
  coinPop = (el, t) => { SFX.coin(); return _coinPop(el, t); };
  confetti = () => { SFX.fanfare(); return _confetti(); };
  say = (t, ms) => { const r = _say(t, ms); const b = $("petSay"); if (b && !b.classList.contains("hidden") && !$("tab-pet").classList.contains("hidden")) SFX.pio(); return r; };
  const _lv = lvlToast; lvlToast = l => { if (l) setTimeout(() => SFX.fanfare(), 900); return _lv(l); };
  const hook = (id, f) => { const b = $(id); if (b) b.addEventListener("click", f); };
  hook("petFeed", () => SFX.eat()); hook("petBath", () => SFX.splash()); hook("petPlay", () => SFX.bounce()); hook("petSleep", () => SFX.lullaby());
  document.addEventListener("click", e => { if (e.target.closest("nav button, .act, .seg button, #roomBar button, .viewbtn")) SFX.tap(); }, true);
}
// ajuste de sonido en ⚙️
(() => {
  const f = $("sPush"); if (!f || $("sSnd")) return;
  const d = document.createElement("div"); d.className = "field";
  d.innerHTML = `<label class="sndrow"><span>🔊 Sonidos de la mascota y de los juegos</span><input type="checkbox" id="sSnd" ${SFX.on() ? "checked" : ""}></label><div class="sub" style="font-size:12px;margin-top:4px">En iPhone la vibración no está disponible en apps web; los sonidos sí (con el modo silencio quitado).</div>`;
  f.parentNode.insertBefore(d, f.nextSibling);
  $("sSnd").onchange = e => SFX.set(e.target.checked);
})();

// ---------- Animaciones más naturales ----------
// parpadeo a intervalos aleatorios (como de verdad)
(function blinkLoop() {
  const b = $("petBox");
  if (b && !document.hidden) { b.classList.remove("blinkn"); void b.offsetWidth; b.classList.add("blinkn"); if (Math.random() < .2) setTimeout(() => { b.classList.remove("blinkn"); void b.offsetWidth; b.classList.add("blinkn"); }, 260); }
  setTimeout(blinkLoop, 2200 + Math.random() * 4200);
})();
// aplastarse un poquito al tocarle
$("petBox").addEventListener("pointerdown", () => { const b = $("petBox"); b.classList.remove("squash"); void b.offsetWidth; b.classList.add("squash"); setTimeout(() => b.classList.remove("squash"), 260); SFX.pio(true); });
// fundido suave al cambiar de habitación o salir
function sceneFade() { const s = $("petSky"); if (!s) return; s.classList.remove("fadein"); void s.offsetWidth; s.classList.add("fadein"); }

// ---------- Ambiente: pájaros, luciérnagas, hojas y luz ----------
function ambientHTML(scene, mode, wk, month) {
  let h = "";
  if (["rain", "storm", "snow"].includes(wk) || scene === "espacio" || scene === "mar") return h;
  if (mode === "day") {
    for (let i = 0; i < 2; i++) h += `<svg class="bird" style="top:${12 + i * 9}%;animation-delay:${-i * 7 - Math.random() * 6}s;animation-duration:${16 + i * 5}s" viewBox="0 0 30 12"><path d="M1 6 Q8 0 15 6 Q22 0 29 6" stroke="#3a3a48" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    h += `<div class="sunrays"></div>`;
    for (let i = 0; i < 6; i++) h += `<i class="mote" style="left:${(10 + Math.random() * 80).toFixed(0)}%;top:${(30 + Math.random() * 40).toFixed(0)}%;animation-delay:${(-Math.random() * 8).toFixed(1)}s"></i>`;
  } else if (mode === "night") {
    for (let i = 0; i < 9; i++) h += `<i class="firefly" style="left:${(6 + Math.random() * 88).toFixed(0)}%;top:${(45 + Math.random() * 45).toFixed(0)}%;animation-delay:${(-Math.random() * 6).toFixed(1)}s;animation-duration:${(5 + Math.random() * 4).toFixed(1)}s"></i>`;
  }
  if (month === 9 || month === 10) for (let i = 0; i < 4; i++) h += `<i class="leaf" style="left:${(Math.random() * 100).toFixed(0)}%;animation-delay:${(-Math.random() * 9).toFixed(1)}s;animation-duration:${(7 + Math.random() * 5).toFixed(1)}s">${rnd(["🍂", "🍁"])}</i>`;
  return h;
}

// ---------- Mascota de verdad en los minijuegos ----------
let mgSprites = {};
function mgSprite(expr) {
  const p = state.pet || {}, si = Math.max(1, stageOf(p.xp || 0)), key = [expr, si, p.color, JSON.stringify(p.wear || {}), p.species].join("|");
  if (mgSprites[key]) return mgSprites[key].ok ? mgSprites[key].img : null;
  const img = new Image(), rec = mgSprites[key] = { img, ok: false };
  const svg = chickSVG(si, expr, { ...(p.wear || {}), fx: null }, 0, p.color, { species: p.species }).replace('<svg viewBox="0 0 200 200"', '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"');
  img.onload = () => { rec.ok = true; }; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  return null;
}
function mgPet(ctx, x, y, size, expr = "happy", rot = 0, sq = 1) {
  const im = mgSprite(expr);
  if (!im) return mgChick(ctx, x, y, size / 90, expr === "laugh");
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1 / sq, sq); ctx.drawImage(im, -size / 2, -size * .62, size, size); ctx.restore();
}
// partículas para los juegos
function mgBurst(arr, x, y, list, n = 8) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 160; arr.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, t: .7 + Math.random() * .4, e: rnd(list), s: 12 + Math.random() * 10 }); } }
function mgParts(ctx, arr, dt) {
  for (const q of arr) { q.t -= dt; q.vy += 420 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].t <= 0) arr.splice(i, 1);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  for (const q of arr) { ctx.globalAlpha = Math.max(0, Math.min(1, q.t * 1.6)); ctx.font = `${q.s}px system-ui, Apple Color Emoji`; ctx.fillText(q.e, q.x, q.y); }
  ctx.globalAlpha = 1;
}
function mgSky(ctx, W, H, top, bot, t, hills = "#7cc95b") {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < 4; i++) { const cx = ((i * 157 + t * (12 + i * 6)) % (W + 160)) - 80, cy = 40 + i * 46; ctx.beginPath(); ctx.ellipse(W - cx, cy, 34, 13, 0, 0, 7); ctx.ellipse(W - cx + 20, cy - 8, 22, 13, 0, 0, 7); ctx.ellipse(W - cx - 18, cy - 4, 16, 10, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = "rgba(0,0,0,.06)"; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - 80 - Math.sin((x + t * 18) / 70) * 18); ctx.lineTo(W, H); ctx.fill();
  ctx.fillStyle = hills; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - 46 - Math.sin((x + t * 40) / 55) * 10); ctx.lineTo(W, H); ctx.fill();
}


// =====================================================================
//   v50 · 🌶️ Zona privada (solo si la activáis los dos, con PIN)
// =====================================================================
const SP_LV = [["coqueto", "😊", "Coqueto"], ["atrevido", "🔥", "Atrevido"], ["picante", "🌶️", "Picante"]];
const SP_TRUTH = {
  coqueto: ["¿Qué fue lo primero que te atrajo de mí?", "¿Cuál es la parte de mi cuerpo que más te gusta?", "¿Qué ropa mía te encanta verme puesta?", "¿Dónde te gustaría que te diera un beso ahora mismo?", "¿Qué es lo que más echas de menos de tenerme cerca?", "¿Qué canción te pone en modo romántico?", "¿Qué gesto mío te derrite?", "¿Cuál ha sido nuestro beso más bonito?", "¿Qué es lo más romántico que te gustaría que hiciera por ti?", "¿En qué momento del día piensas más en mí?"],
  atrevido: ["¿Cuál ha sido tu sueño más atrevido conmigo?", "¿Qué es lo que más te gusta que te haga?", "¿En qué sitio raro te gustaría que nos besáramos?", "¿Qué te pondrías para sorprenderme?", "¿Qué te gustaría que te susurrara al oído?", "¿Hay algo que nunca te has atrevido a pedirme?", "Describe nuestro mejor beso con detalle.", "¿Qué es lo que más te pone nerviosa/o de mí… en el buen sentido?", "¿Cuál es tu recuerdo nuestro más intenso?", "¿Qué mensaje mío te ha dejado pensando todo el día?"],
  picante: ["¿Cuál es tu fantasía conmigo que nunca me has contado?", "¿Qué es lo primero que harías si me tuvieras delante ahora mismo?", "¿Qué es lo que más te enciende de mí?", "¿Qué recuerdo nuestro todavía te sube la temperatura?", "Si tuviéramos una noche entera solo para nosotros, ¿cómo sería?", "¿Qué te gustaría que probáramos juntos que aún no hemos probado?", "¿Cuál es tu sitio favorito para que te bese?", "Luces apagadas o encendidas… ¿y por qué?", "¿Qué es lo que más te gusta que te diga en la intimidad?", "¿Qué harías si supieras que no te puedo decir que no?"]
};
const SP_DARE = {
  coqueto: ["Mándale una foto con tu sonrisa más pícara 😏", "Envíale un audio diciéndole lo que más te gusta de su cuerpo", "Escríbele un piropo que le haga ponerse rojo/a", "Dile en qué estás pensando ahora mismo, sin mentir", "Mándale un beso a cámara lenta por videollamada", "Describe en tres palabras cómo te hace sentir"],
  atrevido: ["Mándale un audio susurrando algo bonito al oído", "Ponte la prenda que más le gusta y mándale una foto (vestido/a 😇)", "Escríbele cómo sería vuestra próxima cita perfecta… con final incluido", "Dile algo que te gustaría hacerle la próxima vez que os veáis", "Videollamada solo con la luz de una vela durante un minuto", "Elige una canción para «vuestro momento» y mándasela"],
  picante: ["Escríbele un mensaje que solo se pueda leer a solas", "Graba un audio de 20 segundos diciéndole todo lo que le harías", "Planea con detalle vuestra próxima noche juntos y mándaselo", "Cuéntale una fantasía que tengas con él/ella", "Videollamada: miraos 30 segundos sin reíros… y lo que surja", "Regálale un cupón picante de esta zona 🎟️"]
};
const SP_DICE_A = ["Besar", "Acariciar", "Susurrar", "Mordisquear", "Masajear", "Abrazar"], SP_DICE_B = ["el cuello", "los labios", "la oreja", "la espalda", "las manos", "donde tú elijas 😏"];
const SP_IDEAS = ["Un baño juntos con velas", "Una noche en un hotel bonito", "Masaje con aceites", "Bailar lento en el salón", "Ver el amanecer desde la cama", "Un fin de semana sin salir de casa", "Desayuno en la cama con sorpresa", "Juego de roles: conocernos como desconocidos en un bar", "Una videollamada atrevida", "Mensajes picantes durante todo un día", "Ropa especial de sorpresa", "Escapada a una cabaña", "Bañarnos en el mar de noche", "Besarnos bajo la lluvia", "Escribirnos una carta muy atrevida", "Masaje con los ojos vendados", "Un juego de mesa picante", "Una noche de «sí a todo» (con límites claros)", "Dormir abrazados sin móviles", "Una cita sorpresa organizada por el otro", "Recrear nuestra primera cita", "Un jacuzzi para los dos", "Bailar una canción sensual", "Dejarnos notas por la casa", "Despertarnos a besos", "Probar algo nuevo que proponga el otro", "Una ducha juntos", "Cocinar juntos… con poca ropa", "Una noche de pelis abrazados", "Hacer una lista de deseos juntos"];
const SP_COUPONS = ["💆 Un masaje de 20 minutos", "🌙 Una noche de lo que tú quieras", "💋 Besos ilimitados durante una hora", "🛁 Un baño juntos", "🥐 Desayuno en la cama", "💃 Un baile lento", "👗 Tú eliges lo que me pongo", "🎁 Una cita sorpresa", "✅ Un «sí» a una petición", "🤫 Un secreto al oído"];
let spState = {}, spCoupons = [], spLetters = [], spOpen = false, spTab = "juego", spLevel = ls.get("spLv") || "coqueto", spUnlockedAt = 0;
const spOpted = w => !!((spState.opt || {})[w]);
const spOn = () => spOpted("a") && spOpted("b");
async function spHash(t) { try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("nosotros:" + t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); } catch (e) { return "x" + t; } }
function renderSpSettings() {
  const el = $("sSpicy"); if (!el) return;
  const me = spOpted(who), ot = spOpted(other()), o = esc(name(other()));
  el.innerHTML = `<label class="sndrow"><span>🌶️ Zona privada para los dos</span><input type="checkbox" id="spOpt" ${me ? "checked" : ""}></label>
    <div class="sub" style="font-size:12px;margin-top:4px">${me && ot ? "Activada por los dos ✅ La encontrarás en la pestaña Nosotros, con PIN." : me ? `Tú la has activado. Falta que ${o} la active en su móvil.` : ot ? `${o} la ha activado. Actívala tú también si te apetece 😏` : "Juegos y mensajes íntimos solo para vosotros. Solo aparece si la activáis los dos."}${me ? ` · <button class="linkbtn" id="spPinReset" style="font-size:12px">cambiar PIN</button>` : ""}</div>`;
  $("spOpt").onchange = e => { S.merge("state/spicy", { opt: { [who]: e.target.checked } }); if (e.target.checked && !ot) notifyOther("🌶️ Te he propuesto algo… mira en ⚙️ Ajustes"); };
  const pr = $("spPinReset"); if (pr) pr.onclick = () => { ls.set("spPinH", ""); toast("PIN borrado. Pondrás uno nuevo al entrar 🔒"); };
}
function renderSpEntry() {
  const el = $("spEntry"); if (!el) return;
  el.classList.toggle("hidden", !spOn());
  if (!spOn()) return;
  const n = spLetters.filter(l => l.to === who && !l.read).length + spCoupons.filter(c => c.to === who && !c.seen).length;
  el.innerHTML = `<button class="spbtn" id="spGo"><span>🔒</span><div><b>Zona privada</b><small>Solo para vosotros dos${n ? ` · ${n} nuevo${n > 1 ? "s" : ""} 🔥` : ""}</small></div><i>›</i></button>`;
  $("spGo").onclick = spEnter;
}
function spEnter() {
  if (!spOn()) return;
  if (Date.now() - spUnlockedAt < 3 * 6e4) return spShow();
  const has = !!ls.get("spPinH");
  spPinPad(has ? "Escribe tu PIN" : "Crea un PIN de 4 números", async pin => {
    if (!has) { const p2 = await new Promise(res => spPinPad("Repítelo", res)); if (p2 !== pin) { toast("No coinciden, prueba otra vez"); return false; } ls.set("spPinH", await spHash(pin)); }
    else if (await spHash(pin) !== ls.get("spPinH")) { buzz([40, 30, 40]); return false; }
    spUnlockedAt = Date.now(); spShow(); return true;
  });
}
function spPinPad(title, cb) {
  const v = $("spPin"); let code = "";
  const draw = (err) => { v.classList.remove("hidden"); v.innerHTML = `<div class="pinbox"><div class="pinlock">🔒</div><b>${esc(title)}</b><div class="pindots ${err ? "err" : ""}">${[0, 1, 2, 3].map(i => `<i class="${i < code.length ? "on" : ""}"></i>`).join("")}</div>
    <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map(k => k === "" ? "<span></span>" : `<button data-k="${k}">${k}</button>`).join("")}</div>${title === "Escribe tu PIN" ? `<button class="linkbtn" id="pinForgot" style="display:block;margin:6px auto 0">¿Has olvidado el PIN?</button>` : ""}<button class="linkbtn" id="pinX">Cancelar</button></div>`;
    v.querySelectorAll("[data-k]").forEach(b => b.onclick = async () => {
      const k = b.dataset.k; if (k === "⌫") code = code.slice(0, -1); else if (code.length < 4) code += k; SFX.tap(); draw();
      if (code.length === 4) { const c = code; code = ""; const r = await cb(c); if (r === false) { draw(true); } else if (r !== undefined) v.classList.add("hidden"); else v.classList.add("hidden"); }
    });
    $("pinX").onclick = () => { v.classList.add("hidden"); };
    const pf = $("pinForgot"); if (pf) pf.onclick = () => { if (!confirm("Se borrará el PIN de este móvil y elegirás uno nuevo. No se pierde nada de la zona privada. ¿Seguimos?")) return; ls.set("spPinH", ""); v.classList.add("hidden"); setTimeout(spEnter, 150); };
  };
  v.classList.remove("hidden"); draw();
}
function spShow() { spOpen = true; $("spView").classList.remove("hidden"); document.body.style.overflow = "hidden"; renderSp(); }
function spClose() { spOpen = false; $("spView").classList.add("hidden"); document.body.style.overflow = ""; }
document.addEventListener("visibilitychange", () => { if (document.hidden && spOpen) { spClose(); spUnlockedAt = 0; } });
function renderSp() {
  const v = $("spBody"); if (!v) return;
  $("spTabs").classList.remove("hidden");
  document.querySelectorAll("#spTabs button").forEach(b => b.classList.toggle("on", b.dataset.t === spTab));
  { const cb = document.querySelector('#spTabs [data-t="cal"]'); if (cb) cb.classList.toggle("dot", !!wrNewKey()); }
  const o = esc(name(other())), me = esc(name(who));
  let h = "";
  if (spTab === "juego") {
    h = `<div class="splv">${SP_LV.map(([k, e, n]) => `<button class="${spLevel === k ? "on" : ""}" data-lv="${k}">${e} ${n}</button>`).join("")}</div>
      <div class="spcard" id="spCard"><div class="spk">Elige verdad o reto</div><div class="spq">🎲</div></div>
      <div class="sprow"><button class="spb" id="spTruth">🗣️ Verdad</button><button class="spb hot" id="spDare">🔥 Reto</button></div>
      <button class="spb ghost" id="spSendQ" style="width:100%;margin-top:8px">💌 Mandárselo a ${o}</button>`;
  } else if (spTab === "dados") {
    h = `<div class="sub sptxt">Tirad los dados… y apuntadlo para cuando os veáis 😏</div><div class="dice"><div class="die" id="d1">💋</div><div class="die" id="d2">✨</div></div><div class="spres" id="dRes"></div>
      <button class="spb hot" id="dRoll" style="width:100%">🎲 Tirar los dados</button>`;
  } else if (spTab === "atreves") {
    const mine = ((spState.dare || {})[who]) || {}, theirs = ((spState.dare || {})[other()]) || {};
    const both = SP_IDEAS.map((t, i) => [t, i]).filter(([, i]) => mine[i] === 2 && theirs[i] === 2), maybe = SP_IDEAS.map((t, i) => [t, i]).filter(([, i]) => (mine[i] === 2 && theirs[i] === 1) || (mine[i] === 1 && theirs[i] === 2));
    const done = Object.keys(mine).length, odone = Object.keys(theirs).length;
    h = `<div class="sub sptxt">Marca cada idea. <b>Solo veréis las que os apetezcan a los dos</b>; lo que diga que no ${o} no lo verás nunca, y al revés 🤫</div>
      ${both.length ? `<div class="spsec">💞 Os apetece a los dos</div>${both.map(([t]) => `<div class="spmatch">🔥 ${esc(t)}</div>`).join("")}` : ""}
      ${maybe.length ? `<div class="spsec">💛 Uno dice sí y otro quizá… habladlo</div>${maybe.map(([t]) => `<div class="spmatch maybe">${esc(t)}</div>`).join("")}` : ""}
      ${!both.length && !maybe.length ? `<div class="spmatch empty">${odone ? "Aún no hay coincidencias… ¡sigue marcando!" : `Cuando ${o} marque las suyas, aquí saldrán las que coincidan 😏`}</div>` : ""}
      <div class="spsec">Tus respuestas · ${done}/${SP_IDEAS.length}</div>
      ${SP_IDEAS.map((t, i) => `<div class="spidea"><span>${esc(t)}</span><div class="ynm">${[[2, "💚"], [1, "💛"], [0, "✕"]].map(([val, e]) => `<button class="${mine[i] === val ? "on v" + val : ""}" data-i="${i}" data-v="${val}">${e}</button>`).join("")}</div></div>`).join("")}`;
  } else if (spTab === "cupones") {
    const got = spCoupons.filter(c => c.to === who), sent = spCoupons.filter(c => c.from === who);
    h = `<div class="spsec">🎟️ Regálale un cupón a ${o}</div><div class="cpgrid">${SP_COUPONS.map((c, i) => `<button class="cpopt" data-cp="${i}">${esc(c)}</button>`).join("")}</div>
      <div class="sprow"><input id="cpTxt" maxlength="80" placeholder="O escribe uno tú…"><button class="spb hot" id="cpSend" style="flex:none">Regalar</button></div>
      <div class="spsec">💝 Tus cupones</div>${got.length ? got.map(c => `<div class="coupon ${c.used ? "used" : ""}"><b>${esc(c.text)}</b><small>de ${esc(name(c.from))} · ${fmtDate(c.at, { day: "numeric", month: "short" })}</small>${c.used ? `<em>Canjeado ✓</em>` : `<button class="spb" data-use="${c.id}">Canjear</button>`}</div>`).join("") : `<div class="spmatch empty">Todavía no tienes cupones… 😏</div>`}
      ${sent.length ? `<div class="spsec">📤 Los que has regalado</div>${sent.map(c => `<div class="coupon mine ${c.used ? "used" : ""}"><b>${esc(c.text)}</b><small>para ${o}${c.used ? " · ¡canjeado! 🔥" : ""}</small></div>`).join("")}` : ""}`;
  } else if (spTab === "cartas") {
    const L = spLetters.filter(l => l.to === who || l.from === who);
    h = `<div class="sub sptxt">Mensajes que solo se pueden leer aquí dentro, con el PIN 🔒</div>
      <textarea id="slTxt" maxlength="1500" placeholder="Escríbele algo que solo pueda leer a solas…"></textarea><button class="spb hot" id="slSend" style="width:100%;margin-top:8px">💌 Enviar en secreto</button>
      <div class="spsec">Vuestros mensajes</div>${L.length ? L.map(l => `<div class="sletter ${l.from === who ? "mine" : ""} ${l.to === who && !l.read ? "new" : ""}" data-l="${l.id}"><small>${l.from === who ? "Tú → " + o : esc(name(l.from)) + " → tú"} · ${fmtDate(l.at, { day: "numeric", month: "short" })} ${hhmm(l.at)}</small><p>${esc(l.text)}</p></div>`).join("") : `<div class="spmatch empty">Aún no hay mensajes secretos</div>`}`;
  } else if (spTab === "cal") { h = renderSpCal();
  } else if (spTab === "ks") { h = renderKs();
  }
  v.innerHTML = h;
  if (spTab === "cal") bindSpCal();
  v.querySelectorAll("[data-kf]").forEach(b => b.onclick = () => { ksFilter = b.dataset.kf; renderSp(); });
  v.querySelectorAll("[data-ks]").forEach(b => b.onclick = () => ksOpen(b.dataset.ks));
  v.querySelectorAll("[data-wr]").forEach(b => b.onclick = () => { const [y, m] = b.dataset.wr.split("-").map(Number); wrOpen(y, m - 1); });
  if ($("ksSpin")) $("ksSpin").onclick = ksSpin;
  if (ksOpenId) renderKsSheet();
  // marcar como vistos
  const unseen = spCoupons.filter(c => c.to === who && !c.seen); if (spTab === "cupones" && unseen.length) unseen.forEach(c => S.merge("spcoupons/" + c.id, { seen: 1 }));
  const unread = spLetters.filter(l => l.to === who && !l.read); if (spTab === "cartas" && unread.length) unread.forEach(l => S.merge("spletters/" + l.id, { read: Date.now() }));
  const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  v.querySelectorAll("[data-lv]").forEach(b => b.onclick = () => { spLevel = b.dataset.lv; ls.set("spLv", spLevel); renderSp(); });
  let last = null;
  const showQ = kind => { const L = (kind === "t" ? SP_TRUTH : SP_DARE)[spLevel]; const q = rnd(L); last = { kind, q }; const c = $("spCard"); c.classList.remove("flip"); void c.offsetWidth; c.classList.add("flip"); c.innerHTML = `<div class="spk">${kind === "t" ? "🗣️ Verdad" : "🔥 Reto"} · ${SP_LV.find(x => x[0] === spLevel)[1]}</div><div class="spq">${esc(q)}</div>`; SFX.pop(); };
  on("spTruth", () => showQ("t")); on("spDare", () => showQ("d"));
  on("spSendQ", () => { if (!last) return toast("Primero saca una verdad o un reto 😏"); spAddText("spletters", { from: who, to: other(), text: `${last.kind === "t" ? "🗣️ Verdad" : "🔥 Reto"} para ti: ${last.q}`, at: Date.now(), read: 0 }); notifyOther("🔒 Tienes algo nuevo en la zona privada 😏"); toast(`Enviado a ${name(other())} en secreto 🔒`); });
  on("dRoll", () => {
    const a = $("d1"), b = $("d2"); a.classList.add("roll"); b.classList.add("roll"); SFX.bounce(); let n = 0;
    const it = setInterval(() => { a.textContent = rnd(["💋", "🤲", "👄", "😘", "💆", "🤗"]); b.textContent = rnd(["✨", "🌙", "🔥", "💫", "❤️", "🌶️"]); if (++n > 10) { clearInterval(it); a.classList.remove("roll"); b.classList.remove("roll"); const x = rnd(SP_DICE_A), y = rnd(SP_DICE_B); $("dRes").innerHTML = `<b>${x}</b> ${y}`; SFX.ding(); } }, 90);
  });
  v.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { const i = b.dataset.i, val = +b.dataset.v; spSaveMine({ dare: { [i]: val } }); SFX.tap(); });
  v.querySelectorAll("[data-cp]").forEach(b => b.onclick = () => { $("cpTxt").value = SP_COUPONS[+b.dataset.cp]; });
  on("cpSend", () => { const t = ($("cpTxt").value || "").trim(); if (!t) return toast("Elige o escribe un cupón 🎟️"); spAddText("spcoupons", { from: who, to: other(), text: t.slice(0, 80), at: Date.now(), used: 0, seen: 0 }); notifyOther("🎟️ Te han regalado algo en la zona privada 😏"); toast("Cupón regalado 🎟️🔥"); SFX.coin(); });
  v.querySelectorAll("[data-use]").forEach(b => b.onclick = () => { if (!confirm("¿Canjear este cupón? 😏")) return; S.merge("spcoupons/" + b.dataset.use, { used: Date.now() }); notifyOther("🎟️ Han canjeado un cupón… 🔥"); confetti(); });
  on("slSend", () => { const t = ($("slTxt").value || "").trim(); if (!t) return; spAddText("spletters", { from: who, to: other(), text: t.slice(0, 1500), at: Date.now(), read: 0 }); notifyOther("🔒 Tienes un mensaje secreto 💌"); $("slTxt").value = ""; toast("Enviado en secreto 🔒"); });
}
document.querySelectorAll("#spTabs button").forEach(b => b.onclick = () => { spTab = b.dataset.t; renderSp(); $("spBody").scrollTop = 0; });
$("spClose").onclick = spClose;
(() => { const f = $("sSnd") ? $("sSnd").closest(".field") : $("sPush"); if (!f || $("sSpicy")) return; const d = document.createElement("div"); d.className = "field"; d.id = "sSpicy"; f.parentNode.insertBefore(d, f.nextSibling); renderSpSettings(); })();


// ---------- 🌶️ Calendario íntimo + Kamasutra (v51) ----------
const KS = [
  { id: "misionero", n: "El misionero", d: 1, i: 3, t: "Cara a cara: una persona tumbada boca arriba y la otra encima. Permite besarse y mirarse a los ojos todo el rato.", tip: "Una almohada bajo las caderas cambia el ángulo y la sensación." },
  { id: "amazona", n: "La amazona", d: 1, i: 3, t: "Una persona tumbada boca arriba y la otra encima, sentada a horcajadas y de frente. Quien está arriba marca el ritmo.", tip: "Ideal para ir despacio y con las manos entrelazadas." },
  { id: "amazonainv", n: "La amazona invertida", d: 2, i: 1, t: "Como la amazona, pero quien está encima mira hacia los pies de la otra persona.", tip: "Apoyarse en las rodillas de la pareja da estabilidad." },
  { id: "cucharita", n: "La cucharita", d: 1, i: 3, t: "Tumbados de lado, uno detrás del otro, como dos cucharas encajadas. Muy cómoda y cariñosa.", tip: "Perfecta para mañanas perezosas o cuando hay cansancio." },
  { id: "perrito", n: "El perrito", d: 2, i: 1, t: "Una persona a cuatro patas y la otra detrás, de rodillas.", tip: "Bajar el pecho hacia la cama hace la postura más cómoda." },
  { id: "loto", n: "El loto (Yab-Yum)", d: 2, i: 3, t: "Postura tántrica: una persona sentada con las piernas cruzadas y la otra sentada encima, de frente, rodeándola con las piernas.", tip: "Respirad al mismo ritmo: es más de conexión que de velocidad." },
  { id: "mariposa", n: "La mariposa", d: 2, i: 2, t: "Una persona tumbada boca arriba al borde de la cama, con las piernas elevadas; la otra de pie frente a ella.", tip: "La altura de la cama es clave; un cojín ayuda a ajustarla." },
  { id: "yunque", n: "El yunque", d: 3, i: 2, t: "Variante del misionero en la que quien está abajo apoya las piernas sobre los hombros de la otra persona.", tip: "Requiere flexibilidad: id poco a poco." },
  { id: "silla", n: "La silla", d: 2, i: 3, t: "Una persona sentada en una silla firme y la otra sentada encima, de frente o de espaldas.", tip: "Una silla sin ruedas y sin brazos es la mejor opción." },
  { id: "tijera", n: "La tijera", d: 2, i: 2, t: "Tumbados de lado o semi-incorporados, con las piernas entrelazadas como unas tijeras.", tip: "Muy cómoda para alargar el momento sin cansarse." },
  { id: "depie", n: "De pie", d: 3, i: 2, t: "Los dos de pie, cara a cara o uno detrás del otro, con apoyo en la pared o en un mueble.", tip: "Un escalón o unos tacones ayudan si hay diferencia de altura." },
  { id: "elefante", n: "El elefante", d: 2, i: 1, t: "Una persona tumbada boca abajo y estirada; la otra encima, detrás, apoyada en los brazos.", tip: "Un cojín bajo las caderas de quien está abajo lo hace más cómodo." },
  { id: "cascada", n: "La cascada", d: 3, i: 2, t: "Una persona tumbada boca arriba con la cabeza y los hombros fuera del borde de la cama; la otra encima.", tip: "Hacedlo sobre una superficie baja y sin prisas." },
  { id: "carretilla", n: "La carretilla", d: 4, i: 1, t: "Una persona se apoya en las manos en el suelo y la otra, de pie, le sujeta las piernas por la cintura.", tip: "Postura acrobática: mejor como juego corto." },
  { id: "bailarina", n: "La bailarina", d: 4, i: 3, t: "De pie y cara a cara, una persona levanta una pierna y la apoya en la cadera o el hombro de la otra.", tip: "Apoyaos en la pared para mantener el equilibrio." },
  { id: "69", n: "El 69", d: 2, i: 2, t: "Estimulación oral mutua y a la vez, tumbados en direcciones opuestas, de lado o uno encima del otro.", tip: "De lado es la variante más cómoda para los dos." },
  { id: "puente", n: "El puente", d: 4, i: 2, t: "Una persona forma un puente arqueando la espalda sobre manos y pies; la otra se coloca encima o de rodillas.", tip: "Muy exigente físicamente: solo un ratito." },
  { id: "lado", n: "Cara a cara de lado", d: 1, i: 3, t: "Tumbados de lado, mirándose, con las piernas entrelazadas. Lenta y muy cercana.", tip: "Ideal para besarse y hablar a la vez." }
];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const KSM = Object.fromEntries(KS.map(k => [k.id, k]));
const SP_PLACES = [["cama", "🛏️ Cama"], ["sofa", "🛋️ Sofá"], ["ducha", "🚿 Ducha"], ["cocina", "🍳 Cocina"], ["hotel", "🏨 Hotel"], ["coche", "🚗 Coche"], ["fuera", "🌲 Al aire libre"], ["otro", "✨ Otro"]];
const SP_DUR = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];
const durTxt = (m, short) => m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`) + (short && m >= 180 ? " o más" : "") : `${m} min`;
const SP_TIMES = [["manana", "🌅 Mañana"], ["tarde", "☀️ Tarde"], ["noche", "🌙 Noche"], ["madrugada", "🌌 Madrugada"]];
let spCal = [], spCalMonth = null, spCalSel = null, ksFilter = "todas";
const calEntry = k => spCal.find(e => e.id === k) || null;
let spCalLoaded = false;
function calStats() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), E = spCal.filter(e => e.n > 0);
  const inMonth = (e, yy, mm) => { const d = new Date(e.id + "T12:00:00"); return d.getFullYear() === yy && d.getMonth() === mm; };
  const month = E.filter(e => inMonth(e, y, m)).reduce((a, e) => a + e.n, 0), year = E.filter(e => e.id.startsWith(String(y))).reduce((a, e) => a + e.n, 0);
  const days = new Set(E.map(e => e.id)); let streak = 0; { const d = new Date(); d.setHours(12); if (!days.has(localKey(d))) d.setDate(d.getDate() - 1); while (days.has(localKey(d))) { streak++; d.setDate(d.getDate() - 1); } }
  const pc = {}; E.forEach(e => (e.pos || []).forEach(p => { pc[p] = (pc[p] || 0) + 1; }));
  const fav = Object.entries(pc).sort((a, b) => b[1] - a[1])[0];
  const pl = {}; E.forEach(e => e.place && (pl[e.place] = (pl[e.place] || 0) + 1)); const favPl = Object.entries(pl).sort((a, b) => b[1] - a[1])[0];
  const last = E.map(e => e.id).sort().pop();
  const rated = E.filter(e => e.rating), avg = rated.length ? rated.reduce((a, e) => a + e.rating, 0) / rated.length : 0;
  const bars = []; for (let i = 5; i >= 0; i--) { const d = new Date(y, m - i, 1); bars.push([d.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""), E.filter(e => inMonth(e, d.getFullYear(), d.getMonth())).reduce((a, e) => a + e.n, 0)]); }
  return { month, year, streak, fav, favPl, last, avg, bars, tried: Object.keys(pc).length, total: E.reduce((a, e) => a + e.n, 0) };
}
let spDraft = null;


// ---------- 🌶️ v52 · Kamasutra ilustrado, lista de deseos, ruleta, insignias ----------
const KF = { t: 30, ua: 14, fa: 13, th: 19, sh: 18 };
const kfR = d => d * Math.PI / 180, kfP = (p, a, l) => [p[0] + Math.cos(kfR(a)) * l, p[1] + Math.sin(kfR(a)) * l];
const kfN = v => Math.round(v * 10) / 10, kfQ = p => kfN(p[0]) + " " + kfN(p[1]);
let kfUid = 0;
// segmento cónico con extremos redondeados
function kfSeg(p1, p2, w1, w2, fill) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const a = [p1[0] + nx * w1 / 2, p1[1] + ny * w1 / 2], b = [p2[0] + nx * w2 / 2, p2[1] + ny * w2 / 2], c = [p2[0] - nx * w2 / 2, p2[1] - ny * w2 / 2], d = [p1[0] - nx * w1 / 2, p1[1] - ny * w1 / 2];
  return `<path d="M${kfQ(a)}L${kfQ(b)}A${kfN(w2 / 2)} ${kfN(w2 / 2)} 0 0 0 ${kfQ(c)}L${kfQ(d)}A${kfN(w1 / 2)} ${kfN(w1 / 2)} 0 0 0 ${kfQ(a)}Z" fill="${fill}"/>`;
}
// contorno suave a partir de secciones [t, ancho]
function kfBody(p1, p2, secs, fill) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const P = secs.map(([t, w]) => [p1[0] + dx * t, p1[1] + dy * t, w / 2]);
  const left = P.map(([x, y, h]) => [x + nx * h, y + ny * h]), right = P.map(([x, y, h]) => [x - nx * h, y - ny * h]).reverse();
  const pts = [...left, ...right], n = pts.length;
  let d = `M${kfQ([(pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2])}`;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; d += `Q${kfQ(p)} ${kfQ([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2])}`; }
  return `<path d="${d}Z" fill="${fill}"/>`;
}

// contorno cerrado suave
function kfSmooth(pts, closed = true) {
  const n = pts.length, mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  if (!closed) { let d = `M${kfQ(pts[0])}`; for (let i = 1; i < n - 1; i++) d += `Q${kfQ(pts[i])} ${kfQ(i === n - 2 ? pts[n - 1] : mid(pts[i], pts[i + 1]))}`; return d; }
  let d = `M${kfQ(mid(pts[n - 1], pts[0]))}`; for (let i = 0; i < n; i++) d += `Q${kfQ(pts[i])} ${kfQ(mid(pts[i], pts[(i + 1) % n]))}`; return d + "Z";
}
// cabeza de perfil: x hacia la cara, y hacia arriba
const KF_HEAD = {
  face: [[-5.4, -3.2], [-7, 1], [-6, 5.6], [-2, 7.8], [2.6, 7.4], [5.4, 5], [6.3, 2.2], [6, 1], [7.7, -1.2], [6.2, -2.1], [6.6, -3.2], [6, -4.1], [6.3, -5.2], [4.4, -7], [1, -6.6], [-1.6, -4.2]],
  hairA: [[6.5, 5.6], [4.8, 8.2], [0.5, 9.4], [-4.4, 8.6], [-7.4, 5.2], [-7.7, 1], [-6.3, -2.6], [-4.4, -3.1], [-3.3, -0.4], [-2.6, 1.6], [0, 0], [0.9, 3.6], [3.1, 5.4], [5.2, 4.9]],
  hairB: [[6.3, 6], [4, 9], [-1, 10], [-6.4, 7.8], [-8.6, 3], [-8.2, -3], [-5.6, -6.4], [-2.4, -6], [-0.4, -3.6], [0.6, 0.6], [1.4, 4.2], [3.6, 5.2], [5.8, 4.4]],
  backB: [[-5.2, 7], [-8.8, 3.4], [-10, -4], [-9.6, -11], [-7.6, -16.5], [-4.6, -15.5], [-2.8, -11], [-2.2, -6.5], [-1.6, -2]],
};
function kfHead(head, u, face, who, G, part) {
  const W = (x, y) => [head[0] + (face[0] * x + u[0] * y) * .9, head[1] + (face[1] * x + u[1] * y) * .9], M = a => a.map(p => W(p[0], p[1]));
  if (part === "back") return who === "b" ? `<path d="${kfSmooth(M(KF_HEAD.backB))}" fill="${G.hairD}"/><path d="${kfSmooth(M([[-7.2, 3], [-8.4, -4], [-7.4, -10.5]]), false)}" stroke="${G.hairL}" stroke-width=".7" fill="none" opacity=".55"/>` : "";
  let s = `<path d="${kfSmooth(M(KF_HEAD.face))}" fill="${G.body}"/>`;
  // oreja
  const ear = W(-1.2, -.4); if (who === "a") s += `<ellipse cx="${kfN(ear[0])}" cy="${kfN(ear[1])}" rx="1.5" ry="2.3" transform="rotate(${kfN(Math.atan2(u[1], u[0]) * 180 / Math.PI + 90)} ${kfN(ear[0])} ${kfN(ear[1])})" fill="${G.skinD}"/>`;
  // ojo, ceja, labios
  const eye = W(4.4, 1.5), br = M([[3.1, 3.1], [4.6, 3.5], [5.9, 3.1]]), lp = W(6.35, -3.2);
  s += `<ellipse cx="${kfN(eye[0])}" cy="${kfN(eye[1])}" rx=".95" ry=".55" transform="rotate(${kfN(Math.atan2(face[1], face[0]) * 180 / Math.PI)} ${kfN(eye[0])} ${kfN(eye[1])})" fill="#2a1a16"/>`;
  s += `<path d="${kfSmooth(br, false)}" stroke="${G.hairD}" stroke-width=".75" fill="none" stroke-linecap="round"/>`;
  s += `<circle cx="${kfN(lp[0])}" cy="${kfN(lp[1])}" r="${who === "b" ? .85 : .6}" fill="${who === "b" ? "#c56f6f" : "#a8655a"}" opacity=".85"/>`;
  if (who === "a") s += `<path d="${kfSmooth(M([[-1.4, -4.1], [1, -6.4], [4.4, -6.9], [6.2, -5.2], [5.6, -4.5], [3.6, -5.2], [1.2, -4.4], [-.4, -2.6]]))}" fill="${G.hairD}" opacity=".16"/>`;
  // pelo
  const H = who === "a" ? KF_HEAD.hairA : KF_HEAD.hairB;
  s += `<path d="${kfSmooth(M(H))}" fill="url(#${G.hairG})"/>`;
  const strands = who === "a" ? [[[5.6, 5.4], [2.5, 8], [-2.5, 8.6]], [[3.5, 6], [-1, 7.6], [-5.6, 6]], [[-4.6, 7], [-6.8, 3.6], [-6.6, 0]]] : [[[5.4, 5.6], [1, 8.6], [-5, 7.4]], [[3, 6.4], [-2.5, 7.6], [-7, 3.4]], [[-6.4, 6], [-7.8, 1.5], [-6.4, -1]]];
  strands.forEach(st => { s += `<path d="${kfSmooth(M(st), false)}" stroke="${G.hairD}" stroke-width=".45" fill="none" stroke-linecap="round" opacity=".38"/>`; });
  s += `<path d="${kfSmooth(M(who === "a" ? [[3.6, 7.6], [0.4, 8.7], [-3.6, 8]] : [[3, 8.2], [-1, 9.1], [-5, 7.6]]), false)}" stroke="${G.hairL}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".6"/>`;
  return s;
}

// tipos de cuerpo: a (más ancho de hombros), b (más curvas)
const KF_BODY = {
  a: { secs: [[-.08, 11], [.12, 13.5], [.42, 12], [.74, 14.5], [.93, 15.5], [1.04, 9]], thigh: [10, 7], calf: [7, 4.2], ua: [6, 4.8], fa: [4.8, 3.6], hair: "short" },
  b: { secs: [[-.08, 12], [.12, 15.5], [.45, 9.6], [.72, 12.4], [.92, 12], [1.04, 8]], thigh: [10.5, 6.4], calf: [6.4, 3.6], ua: [5, 4], fa: [4, 3], hair: "long" },
};
function kfLimb(start, a, l1, l2, wU, wL, fill, end) {
  const k = kfP(start, a[0], l1), e = kfP(k, a[1], l2);
  let s = kfSeg(start, k, wU[0], wU[1], fill) + kfSeg(k, e, wL[0], wL[1], fill);
  if (end === "hand") s += `<ellipse cx="${kfN(e[0])}" cy="${kfN(e[1])}" rx="3" ry="2.4" transform="rotate(${kfN(a[1])} ${kfN(e[0])} ${kfN(e[1])})" fill="${fill}"/>`;
  if (end && end.foot) { const fe = kfP(e, a[1] + end.foot, 6.5); s += kfSeg(e, fe, 3.8, 3, fill); }
  return s;
}
// o: {h cadera, t torso, n cabeza, a brazos, l piernas, fc: 1 mira a la derecha / -1 izquierda}
function kfFig(o, who, G) {
  const B = KF_BODY[who], fc = o.fc || -1, hip = o.h, sh = kfP(hip, o.t, KF.t - 3), neck = kfP(hip, o.t, KF.t), hn = o.n ?? o.t, head = kfP(neck, hn, 9.2);
  const A = o.a || [[90, 90], [90, 90]], L = o.l || [[90, 90], [90, 90]];
  const u = [Math.cos(kfR(hn)), Math.sin(kfR(hn))], face = [-u[1] * fc, u[0] * fc];
  // el pie apunta hacia donde mira la figura
  const footOff = l => { const sa = kfR(l[1]), fx = -Math.sin(sa) * fc, fy = Math.cos(sa) * fc; return (Math.atan2(face[1], face[0]) - Math.atan2(Math.sin(sa), Math.cos(sa))) * 180 / Math.PI; };
  const ft = l => { let d = footOff(l); d = ((d + 540) % 360) - 180; return { foot: d > 0 ? 80 : -80 }; };
  let s = "";
  s += kfLimb(sh, A[1], KF.ua, KF.fa, B.ua, B.fa, G.back, "hand") + kfLimb(hip, L[1], KF.th, KF.sh, B.thigh, B.calf, G.back, ft(L[1]));
  s += kfBody(hip, kfP(hip, o.t, KF.t), B.secs, G.body);
  s += kfBody(hip, kfP(hip, o.t, KF.t), B.secs.map(([t, w]) => [t, w * .55]), "rgba(255,240,228,.07)");
  s += kfSeg(neck, kfP(neck, hn, 5), 5.2, 5, G.body);
  s += kfHead(head, u, face, who, G, "back");
  s += kfHead(head, u, face, who, G, "front");
  s += kfLimb(hip, L[0], KF.th, KF.sh, B.thigh, B.calf, G.body, ft(L[0])) + kfLimb(sh, A[0], KF.ua, KF.fa, B.ua, B.fa, G.body, "hand");
  return s;
}
const KP = {
  bed: (x1 = 14, x2 = 186, y = 100, hb = 1) => `<rect x="${x1}" y="${y + 13}" width="${x2 - x1}" height="9" rx="2" fill="url(#@wood)"/><rect x="${x1 + 3}" y="${y + 21}" width="5" height="6" rx="1.5" fill="#3b2418"/><rect x="${x2 - 8}" y="${y + 21}" width="5" height="6" rx="1.5" fill="#3b2418"/><rect x="${x1}" y="${y - 1}" width="${x2 - x1}" height="16" rx="6" fill="url(#@sheet)"/><path d="M${x1 + 30} ${y + 4}q20 3 40 0t40 1" stroke="rgba(120,90,110,.18)" stroke-width="1.2" fill="none"/>${hb ? `<rect x="${x1 - 6}" y="${y - 34}" width="10" height="62" rx="3" fill="url(#@wood)"/>` : ""}`,
  pillow: (x, y) => `<rect x="${x}" y="${y - 1}" width="30" height="11" rx="5.5" fill="url(#@pillow)"/>`,
  floor: (y = 122) => `<rect x="0" y="${y}" width="200" height="${130 - y}" fill="url(#@floor)"/>`,
  wall: (x = 30) => `<rect x="${x - 2}" y="0" width="8" height="130" fill="url(#@wallv)"/>`,
  chair: (x, y, fl = 122) => `<rect x="${x - 18}" y="${y - 40}" width="5" height="46" rx="2" fill="url(#@wood)"/><rect x="${x - 15}" y="${y + 4}" width="4" height="${fl - y - 4}" rx="1.5" fill="#3b2418"/><rect x="${x + 15}" y="${y + 4}" width="4" height="${fl - y - 4}" rx="1.5" fill="#3b2418"/><rect x="${x - 19}" y="${y}" width="42" height="6" rx="2" fill="url(#@wood)"/>`,
  table: (x1, x2, y) => `<rect x="${x1 + 5}" y="${y + 5}" width="4" height="${122 - y - 5}" rx="1.5" fill="#3b2418"/><rect x="${x2 - 9}" y="${y + 5}" width="4" height="${122 - y - 5}" rx="1.5" fill="#3b2418"/><rect x="${x1}" y="${y}" width="${x2 - x1}" height="6" rx="2" fill="url(#@wood)"/>`,
};
const KPOSE = {};
function ksSVG(id, cls = "") {
  const p = KPOSE[id]; if (!p) return "";
  const u = "k" + (++kfUid) + "_", R = s => s.replace(/@/g, u);
  const G = {
    a: { body: `url(#${u}ga)`, back: `url(#${u}gab)`, skinD: "#a86c50", hairD: "#1f1410", hairL: "#7a5a48", hairG: `${u}ha` },
    b: { body: `url(#${u}gb)`, back: `url(#${u}gbb)`, skinD: "#c98c70", hairD: "#3a1f14", hairL: "#c08a5a", hairG: `${u}hb` },
  };
  const grad = (id, c1, c2, us) => `<linearGradient id="${u}${id}" ${us ? 'gradientUnits="userSpaceOnUse" x1="0" y1="34" x2="0" y2="124"' : 'x1="0" y1="0" x2="0" y2="1"'}><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
  const defs = `<defs>${grad("ga", "#ecb894", "#b8795a", 1)}${grad("gab", "#c48c6c", "#8f5a40", 1)}${grad("gb", "#fad6be", "#d99e82", 1)}${grad("gbb", "#d9ab90", "#a87058", 1)}
    ${grad("ha", "#4a3428", "#1c120e")}${grad("hb", "#8a5634", "#4a2616")}${grad("sheet", "#fbeff3", "#d9c3cd")}${grad("pillow", "#ffffff", "#e3d3da")}${grad("wood", "#8a5a3c", "#5a3622")}${grad("floor", "#4a2a2e", "#2a1418")}
    <linearGradient id="${u}wallv" x1="0" x2="1"><stop offset="0" stop-color="#3a2228"/><stop offset="1" stop-color="#5a3a40"/></linearGradient>
    <radialGradient id="${u}glow" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#ffb38a" stop-opacity=".28"/><stop offset="1" stop-color="#ffb38a" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}shd" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
  const figs = p.f.map(([o, who]) => kfFig(o, who, G[who])).join("");
  return `<svg class="kssvg ${cls}" viewBox="8 24 184 104" aria-hidden="true">${defs}<rect x="0" y="0" width="200" height="130" fill="url(#${u}glow)"/>${R(p.bg || "")}<ellipse cx="${p.sx || 105}" cy="${p.sy || 121}" rx="60" ry="5" fill="url(#${u}shd)"/>${figs}${R(p.fg || "")}</svg>`;
}
Object.assign(KPOSE, {
  misionero: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: 1, h: [112, 93], t: 180, a: [[-30, -10], [-25, -5]], l: [[-45, 45], [-50, 40]] }, "b"], [{ fc: -1, h: [116, 80], t: 188, n: 192, a: [[100, 85], [95, 90]], l: [[35, 5], [30, 2]] }, "a"]] },
  amazona: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: 1, h: [118, 93], t: 180, a: [[200, 250], [195, 260]], l: [[0, 0], [-5, 5]] }, "a"], [{ fc: -1, h: [116, 82], t: -95, n: -100, a: [[120, 100], [115, 95]], l: [[150, 0], [145, 5]] }, "b"]] },
  amazonainv: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: 1, h: [104, 93], t: 180, a: [[200, 250], [195, 260]], l: [[-15, 15], [-10, 10]] }, "a"], [{ fc: 1, h: [104, 82], t: -85, n: -80, a: [[60, 80], [65, 85]], l: [[30, 180], [35, 175]] }, "b"]] },
  cucharita: { bg: KP.bed() + KP.pillow(22, 82), f: [[{ fc: 1, h: [120, 84], t: 184, a: [[120, 170], [175, 180]], l: [[22, -15], [18, -12]] }, "a"], [{ fc: 1, h: [112, 93], t: 181, a: [[160, 190], [165, 190]], l: [[22, -15], [18, -12]] }, "b"]] },
  perrito: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: -1, h: [124, 77], t: 184, n: 190, a: [[92, 88], [88, 92]], l: [[95, 2], [90, 0]] }, "b"], [{ fc: -1, h: [137, 76], t: -100, n: -110, a: [[115, 100], [110, 95]], l: [[85, 3], [80, 0]] }, "a"]] },
  loto: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: 1, h: [88, 93], t: -88, a: [[-20, -50], [-15, -45]], l: [[-5, 170], [5, 175]] }, "a"], [{ fc: -1, h: [100, 84], t: -92, n: -100, a: [[190, 170], [200, 175]], l: [[185, 120], [175, 110]] }, "b"]] },
  mariposa: { bg: KP.bed(14, 116) + KP.floor() + KP.pillow(22, 92), f: [[{ fc: 1, h: [110, 93], t: 180, a: [[200, 250], [195, 260]], l: [[-70, -80], [-65, -75]] }, "b"], [{ fc: -1, h: [128, 82], t: -92, a: [[170, 60], [165, 55]], l: [[95, 90], [85, 90]] }, "a"]] },
  yunque: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: -1, h: [118, 80], t: 190, n: 194, a: [[100, 85], [95, 90]], l: [[35, 5], [30, 2]] }, "a"], [{ fc: 1, h: [112, 93], t: 180, a: [[200, 250], [195, 260]], l: [[-135, -150], [-130, -145]] }, "b"]] },
  silla: { bg: KP.chair(88, 102) + KP.floor(), f: [[{ fc: 1, h: [88, 96], t: -92, a: [[-20, 0], [-25, -5]], l: [[0, 80], [5, 85]] }, "a"], [{ fc: -1, h: [103, 88], t: -88, n: -80, a: [[200, 180], [195, 175]], l: [[170, 100], [180, 95]] }, "b"]] },
  tijera: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: 1, h: [96, 93], t: 180, a: [[200, 240], [190, 250]], l: [[-8, 0], [5, 0]] }, "a"], [{ fc: -1, h: [124, 90], t: -3, n: 0, a: [[-20, -60], [-10, -70]], l: [[175, 185], [188, 180]] }, "b"]] },
  depie: { bg: KP.wall(34) + KP.floor(), f: [[{ fc: 1, h: [52, 81], t: -90, a: [[-15, -30], [-25, -40]], l: [[92, 90], [80, 95]] }, "b"], [{ fc: -1, h: [72, 81], t: -97, n: -100, a: [[190, 200], [200, 205]], l: [[95, 90], [100, 92]] }, "a"]] },
  elefante: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: -1, h: [115, 93], t: 180, a: [[170, 180], [175, 180]], l: [[0, 0], [-3, 3]] }, "b"], [{ fc: -1, h: [120, 84], t: 188, n: 192, a: [[120, 130], [115, 125]], l: [[2, 0], [-2, 2]] }, "a"]] },
  cascada: { bg: KP.bed(70, 190, 100, 0), f: [[{ fc: 1, h: [102, 93], t: 180, n: 120, a: [[110, 100], [100, 95]], l: [[0, 0], [-4, 4]] }, "b"], [{ fc: -1, h: [104, 82], t: -100, n: -105, a: [[130, 110], [125, 105]], l: [[150, 0], [145, 5]] }, "a"]] },
  carretilla: { bg: KP.floor(), f: [[{ fc: -1, h: [108, 84], t: 160, n: 150, a: [[110, 100], [100, 95]], l: [[-5, 0], [5, 0]] }, "b"], [{ fc: -1, h: [146, 80], t: -92, a: [[110, 135], [115, 140]], l: [[95, 90], [85, 90]] }, "a"]] },
  bailarina: { bg: KP.floor(), f: [[{ fc: 1, h: [78, 81], t: -90, a: [[-20, 0], [-30, -10]], l: [[92, 90], [-35, -80]] }, "b"], [{ fc: -1, h: [100, 81], t: -92, n: -95, a: [[190, 170], [200, 175]], l: [[95, 88], [85, 92]] }, "a"]] },
  "69": { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: 1, h: [118, 93], t: 180, a: [[200, 190], [190, 180]], l: [[-30, 30], [-35, 35]] }, "a"], [{ fc: 1, h: [78, 80], t: 0, n: 10, a: [[70, 110], [80, 100]], l: [[150, 180], [155, 180]] }, "b"]] },
  puente: { bg: KP.floor(112), f: [[{ fc: 1, h: [100, 80], t: 155, n: 120, a: [[115, 100], [105, 95]], l: [[50, 90], [55, 85]] }, "b"], [{ fc: -1, h: [128, 86], t: -105, n: -115, a: [[140, 125], [135, 120]], l: [[88, 0], [83, 5]] }, "a"]] },
  lado: { bg: KP.bed() + KP.pillow(22, 80), f: [[{ fc: -1, h: [116, 82], t: 176, n: 170, a: [[150, 170], [165, 175]], l: [[10, 15], [3, -3]] }, "b"], [{ fc: 1, h: [114, 93], t: 184, n: 192, a: [[-60, -20], [190, 180]], l: [[-8, 0], [6, 12]] }, "a"]] },
  rana: { bg: KP.bed() + KP.pillow(22, 92), f: [[{ fc: 1, h: [118, 93], t: 180, a: [[200, 250], [195, 260]], l: [[0, 0], [-5, 5]] }, "a"], [{ fc: -1, h: [118, 83], t: -92, n: -98, a: [[150, 170], [145, 165]], l: [[210, 85], [205, 80]] }, "b"]] },
  arado: { bg: KP.bed(14, 112) + KP.floor() + KP.pillow(22, 92), f: [[{ fc: -1, h: [106, 93], t: 180, a: [[170, 180], [175, 180]], l: [[-5, -2], [-2, -5]] }, "b"], [{ fc: -1, h: [124, 80], t: -95, n: -100, a: [[100, 60], [95, 55]], l: [[95, 85], [85, 95]] }, "a"]] },
  mesa: { bg: KP.table(28, 102, 88) + KP.floor(), f: [[{ fc: 1, h: [94, 82], t: -120, n: -110, a: [[120, 100], [115, 95]], l: [[-10, 40], [0, 50]] }, "b"], [{ fc: -1, h: [118, 81], t: -92, n: -98, a: [[170, 190], [175, 195]], l: [[95, 90], [88, 90]] }, "a"]] },
});

KS.push(
  { id: "rana", n: "La rana", d: 2, i: 2, t: "Variante de la amazona: quien está encima se pone en cuclillas, con los pies apoyados en la cama, en lugar de de rodillas.", tip: "Apoyar las manos en el pecho o en las rodillas ayuda a mantener el equilibrio." },
  { id: "arado", n: "El arado", d: 3, i: 1, t: "Una persona tumbada boca abajo al borde de la cama; la otra, de pie detrás, le sujeta las piernas a la altura de la cintura.", tip: "Mejor con una cama alta y solo un ratito." },
  { id: "mesa", n: "La mesa", d: 2, i: 3, t: "Una persona sentada en el borde de una mesa o encimera firme y la otra de pie frente a ella, cara a cara y abrazadas.", tip: "Comprobad antes que el mueble aguanta bien 😉" }
);
KS.forEach(k => { KSM[k.id] = k; });
const KS_D = ["", "Fácil", "Media", "Difícil", "Experta"], KS_I = ["", "Juguetona", "Cercana", "Muy íntima"];
const ksPc = () => { const pc = {}, last = {}; spCal.forEach(e => (e.n > 0) && (e.pos || []).forEach(p => { pc[p] = (pc[p] || 0) + 1; if (!last[p] || e.id > last[p]) last[p] = e.id; })); return { pc, last }; };
const ksWant = (u, id) => !!(((spState.ksw || {})[u] || {})[id]);
const ksBoth = id => ksWant("a", id) && ksWant("b", id);
let ksOpenId = null, ksSpinTok = 0;
const ksMeter = (n, max, cls = "") => `<span class="kmt ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
function renderKs() {
  const { pc } = ksPc(), tried = KS.filter(k => pc[k.id]).length, both = KS.filter(k => ksBoth(k.id)), mine = KS.filter(k => ksWant(who, k.id));
  const L = KS.filter(k => ksFilter === "todas" || (ksFilter === "probadas" ? pc[k.id] : ksFilter === "nuevas" ? !pc[k.id] : ksFilter === "lista" ? ksBoth(k.id) : ksFilter === "mias" ? ksWant(who, k.id) : String(k.d) === ksFilter));
  const day = KS[hashStr(localKey()) % KS.length], pct = Math.round(tried / KS.length * 100);
  const F = [["todas", "Todas"], ["nuevas", "Sin probar"], ["probadas", `✓ Probadas (${tried})`], ["mias", `❤️ Mis deseos (${mine.length})`], ["lista", `💞 Los dos (${both.length})`], ["1", "🔥 Fácil"], ["2", "🔥🔥 Media"], ["3", "🔥🔥🔥 Difícil"], ["4", "🔥🔥🔥🔥 Experta"]];
  return `<div class="ksprog"><div class="ksring" style="--p:${pct}"><div><b>${tried}</b><small>/${KS.length}</small></div></div><div class="ksprogt"><b>Vuestro Kamasutra</b><small>${pct}% explorado · ${both.length ? `💞 ${both.length} ${both.length === 1 ? "deseo compartido" : "deseos compartidos"}` : "marcad las que os apetezcan ❤️"}</small><div class="ksbar"><i style="width:${pct}%"></i></div></div></div>
    <button class="ksday" data-ks="${day.id}"><div class="ksdayart">${ksSVG(day.id)}</div><div class="ksdayt"><small>✨ Postura del día</small><b>${esc(day.n)}</b><span>${"🔥".repeat(day.d)} · ${KS_I[day.i]}</span></div><i>›</i></button>
    <button class="spb hot ksspin" id="ksSpin">🎰 Ruleta de posturas <small>¿no sabéis cuál? que elija la suerte</small></button>
    <div class="chips ksfil">${F.map(([k, t]) => `<button class="chip ${ksFilter === k ? "on" : ""}" data-kf="${k}">${t}</button>`).join("")}</div>
    ${ksFilter === "lista" && !both.length ? `<div class="spmatch empty">Abrid las fichas y pulsad <b>🤍 ¿Te apetece?</b>. Solo saldrán aquí las que queráis <b>los dos</b>; lo que marque cada uno por separado es secreto 🤫</div>` : ""}
    <div class="ksgrid">${L.map(k => `<button class="kstile ${pc[k.id] ? "done" : ""}" data-ks="${k.id}"><div class="kstart">${ksSVG(k.id)}${ksBoth(k.id) ? `<em class="kmatch">💞</em>` : ksWant(who, k.id) ? `<em class="kmatch">❤️</em>` : ""}${pc[k.id] ? `<em class="kdone">✓ ${pc[k.id]}</em>` : ""}</div><b>${esc(k.n)}</b><small>${ksMeter(k.d, 4)}<span>${KS_D[k.d]}</span></small></button>`).join("") || (ksFilter === "lista" ? "" : `<div class="spmatch empty" style="grid-column:1/-1">Nada por aquí todavía</div>`)}</div>
    <div class="sub sptxt" style="font-size:12px;margin-top:12px;text-align:center">Id siempre a vuestro ritmo, con comunicación y respetando los límites de cada uno 💛</div>`;
}
function ksSheetEl(id, cls) { let s = $(id); if (!s) { s = document.createElement("div"); s.id = id; s.className = cls + " hidden"; $("spView").appendChild(s); } return s; }
function ksOpen(id) { ksOpenId = id; const s = ksSheetEl("ksSheet", "kssheet"); s.classList.remove("hidden"); renderKsSheet(true); SFX.pop(); }
function ksCloseSheet() { ksOpenId = null; const s = $("ksSheet"); if (s) s.classList.add("hidden"); }
function renderKsSheet(anim) {
  const s = $("ksSheet"); if (!s || !ksOpenId) return;
  const k = KSM[ksOpenId], i = KS.indexOf(k), { pc, last } = ksPc(), me = ksWant(who, k.id), both = ksBoth(k.id);
  s.innerHTML = `<div class="ksbg" data-x="1"></div><div class="kspanel ${anim ? "in" : ""}"><div class="ksgrab"></div>
    <div class="ksnav"><button data-nav="-1" aria-label="Anterior">‹</button><span>${i + 1} / ${KS.length}</span><button data-nav="1" aria-label="Siguiente">›</button></div>
    <div class="ksart">${ksSVG(k.id, "big")}</div>
    <h3>${esc(k.n)}</h3>
    <div class="ksmeters"><div><small>Dificultad</small>${ksMeter(k.d, 4)}<em>${KS_D[k.d]}</em></div><div><small>Intimidad</small>${ksMeter(k.i, 3, "pink")}<em>${KS_I[k.i]}</em></div><div><small>Probada</small><b>${pc[k.id] || 0}</b><em>${pc[k.id] ? (pc[k.id] === 1 ? "vez" : "veces") : "aún no"}</em></div></div>
    <p class="ksdesc">${esc(k.t)}</p><div class="kstip">💡 ${esc(k.tip)}</div>
    ${both ? `<div class="ksboth">💞 ¡Los dos queréis probarla!</div>` : ""}
    ${pc[k.id] ? `<div class="ksstat">🗓️ La última vez fue el <b>${fmtDate(new Date(last[k.id] + "T12:00:00"), { day: "numeric", month: "long" })}</b></div>` : ""}
    <div class="sprow" style="margin-top:12px"><button class="spb ${me ? "want" : ""}" id="ksWant">${me ? "❤️ Me apetece" : "🤍 ¿Te apetece?"}</button><button class="spb hot" id="ksLog">📅 Apuntar hoy</button></div>
    <div class="sub sptxt" style="font-size:11.5px;text-align:center;margin:8px 0 0">${me && !both ? `Si ${esc(name(other()))} también la marca, os saldrá a los dos 😏` : "Lo que marques es secreto hasta que coincidáis"}</div>
    <button class="spb ghost" id="ksX" style="width:100%;margin-top:10px">Cerrar</button></div>`;
  s.querySelectorAll("[data-x]").forEach(b => b.onclick = ksCloseSheet); $("ksX").onclick = ksCloseSheet;
  s.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => { ksOpenId = KS[(i + +b.dataset.nav + KS.length) % KS.length].id; SFX.tap(); renderKsSheet(); });
  $("ksWant").onclick = () => {
    const nv = !me; spSaveMine({ ksw: { [k.id]: nv } }); SFX.tap();
    if (nv && ksWant(other(), k.id)) { confetti(); toast(`💞 ¡${name(other())} también quiere probar «${k.n}»!`); notifyOther("💞 Tenéis algo nuevo en común en la zona privada 😏"); }
    else if (nv) toast("Guardado en tus deseos ❤️ (en secreto)");
  };
  $("ksLog").onclick = () => {
    ksCloseSheet(); const t = localKey(), base = calEntry(t) || {};
    spTab = "cal"; spCalMonth = null; spCalSel = t;
    spDraft = { n: base.n || 1, pos: [...new Set([...(base.pos || []), k.id])], times: [...(base.times || [])], place: base.place || "", rating: base.rating || 0 };
    spDraft.note = base.note || ""; renderSp(); calOpenSheet();
  };
  // deslizar para cambiar
  const art = s.querySelector(".ksart"); let x0 = null;
  art.ontouchstart = e => { x0 = e.touches[0].clientX; };
  art.ontouchend = e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) { ksOpenId = KS[(i + (dx < 0 ? 1 : -1) + KS.length) % KS.length].id; SFX.tap(); renderKsSheet(); } };
}
function ksSpin() {
  const { pc } = ksPc(), tok = ++ksSpinTok; let pool = KS.filter(k => !pc[k.id]); if (pool.length < 3) pool = KS;
  const pick = rnd(pool), r = ksSheetEl("ksRoul", "ksroul"); r.classList.remove("hidden");
  r.innerHTML = `<div class="ksbg" data-x="1"></div><div class="ksrbox"><small>🎰 La ruleta está eligiendo…</small><div class="ksrart" id="ksrArt"></div><b id="ksrName">…</b><span id="ksrMeta"></span>
    <div class="sprow" style="margin-top:14px"><button class="spb" id="ksrAgain">🔄 Otra</button><button class="spb hot" id="ksrSee" disabled>Ver ficha</button></div><button class="spb ghost" id="ksrX" style="width:100%;margin-top:8px">Cerrar</button></div>`;
  const close = () => { ksSpinTok++; r.classList.add("hidden"); };
  r.querySelector("[data-x]").onclick = close; $("ksrX").onclick = close; $("ksrAgain").onclick = ksSpin;
  let n = 0, d = 55; const steps = 16 + Math.floor(Math.random() * 6), seq = [];
  const step = () => {
    if (tok !== ksSpinTok) return;
    const last = n >= steps, k = last ? pick : KS[(KS.indexOf(pick) + steps - n + KS.length * 3) % KS.length];
    $("ksrArt").innerHTML = ksSVG(k.id); $("ksrName").textContent = k.n; $("ksrArt").classList.remove("tick"); void $("ksrArt").offsetWidth; $("ksrArt").classList.add("tick");
    if (!last) { SFX.tap(); n++; d *= 1.13; seq.push(setTimeout(step, d)); return; }
    $("ksrArt").classList.add("win"); r.querySelector("small").textContent = pc[k.id] ? "🎰 La suerte ha decidido" : "🎰 ¡Una que aún no habéis probado!";
    $("ksrMeta").innerHTML = `${"🔥".repeat(k.d)} · ${KS_I[k.i]}`; SFX.ding(); buzz([20, 40, 20]);
    const b = $("ksrSee"); b.disabled = false; b.onclick = () => { close(); ksOpen(k.id); };
  };
  step();
}
// ---- insignias ----
function spBadgeStats() {
  const E = spCal.filter(e => e.n > 0).sort((a, b) => a.id < b.id ? -1 : 1), days = new Set(E.map(e => e.id)), { pc } = ksPc();
  let best = 0; E.forEach(e => { const d = new Date(e.id + "T12:00:00"); d.setDate(d.getDate() - 1); if (days.has(localKey(d))) return; let c = 0; const x = new Date(e.id + "T12:00:00"); while (days.has(localKey(x))) { c++; x.setDate(x.getDate() + 1); } best = Math.max(best, c); });
  const months = {}; E.forEach(e => { const m = e.id.slice(0, 7); months[m] = (months[m] || 0) + e.n; });
  const finde = E.some(e => new Date(e.id + "T12:00:00").getDay() === 6 && (() => { const d = new Date(e.id + "T12:00:00"); d.setDate(d.getDate() + 1); return days.has(localKey(d)); })());
  return {
    days: E.length, total: E.reduce((a, e) => a + e.n, 0), best, maxN: Math.max(0, ...E.map(e => e.n)), tried: KS.filter(k => pc[k.id]).length,
    places: new Set(E.map(e => e.place).filter(Boolean)).size, madr: E.some(e => (e.times || []).includes("madrugada")), man: E.some(e => (e.times || []).includes("manana")),
    five: E.filter(e => e.rating === 5).length, wish: KS.some(k => ksBoth(k.id) && pc[k.id]), month: Math.max(0, ...Object.values(months)), finde
  };
}
const SP_BADGES = [
  ["primera", "🌱", "El primer día", "Apuntad vuestro primer día", s => [s.days, 1]],
  ["diez", "🔥", "10 veces", "Llegad a 10 en total", s => [s.total, 10]],
  ["cincuenta", "🎖️", "50 veces", "Llegad a 50 en total", s => [s.total, 50]],
  ["cien", "👑", "Club de los 100", "Llegad a 100 en total", s => [s.total, 100]],
  ["doble", "✌️", "Doblete", "Dos veces el mismo día", s => [s.maxN, 2]],
  ["triple", "🎩", "Hat-trick", "Tres veces el mismo día", s => [s.maxN, 3]],
  ["racha3", "⚡", "Racha de 3", "Tres días seguidos", s => [s.best, 3]],
  ["racha7", "🌋", "Semana de fuego", "Siete días seguidos", s => [s.best, 7]],
  ["mes10", "📆", "Mes intenso", "10 veces en un mismo mes", s => [s.month, 10]],
  ["pos5", "📖", "Curiosos", "Probad 5 posturas distintas", s => [s.tried, 5]],
  ["pos12", "🧘", "Aventureros", "Probad 12 posturas distintas", s => [s.tried, 12]],
  ["todas", "🏆", "Maestros del Kamasutra", "Probad todas las posturas", s => [s.tried, KS.length]],
  ["sitios", "🗺️", "Exploradores", "Hacedlo en 4 sitios distintos", s => [s.places, 4]],
  ["madr", "🌌", "Noctámbulos", "Una vez de madrugada", s => [s.madr ? 1 : 0, 1]],
  ["man", "🌅", "Buenos días", "Una vez por la mañana", s => [s.man ? 1 : 0, 1]],
  ["finde", "🛌", "Finde de manta", "Sábado y domingo seguidos", s => [s.finde ? 1 : 0, 1]],
  ["cinco", "⭐", "Cinco estrellas", "5 días valorados con 5★", s => [s.five, 5]],
  ["deseo", "💞", "Deseo cumplido", "Probad una de vuestra lista", s => [s.wish ? 1 : 0, 1]],
];
function spBadgesHTML() {
  const s = spBadgeStats(), R = SP_BADGES.map(([id, e, n, d, f]) => { const [c, g] = f(s); return { id, e, n, d, c: Math.min(c, g), g, ok: c >= g }; });
  const got = R.filter(b => b.ok);
  // avisar de insignias nuevas
  let seen = null; try { seen = JSON.parse(ls.get("spBdg") || "null"); } catch (e) { }
  const ids = got.map(b => b.id);
  if (!spCalLoaded) { }
  else if (seen === null) ls.set("spBdg", JSON.stringify(ids));
  else { const nw = got.filter(b => !seen.includes(b.id)); if (nw.length) { ls.set("spBdg", JSON.stringify(ids)); setTimeout(() => { confetti(); toast(`🏅 Nueva insignia: ${nw[0].e} ${nw[0].n}`); }, 400); } }
  return `<div class="spsec">🏅 Insignias · ${got.length}/${R.length}</div><div class="bdgs">${R.sort((a, b) => b.ok - a.ok).map(b => `<div class="bdg ${b.ok ? "on" : ""}"><span>${b.e}</span><b>${b.n}</b><small>${b.ok ? "¡Conseguida!" : b.d}</small>${b.ok ? "" : `<div class="bdgbar"><i style="width:${Math.round(b.c / b.g * 100)}%"></i></div><em>${b.c}/${b.g}</em>`}</div>`).join("")}</div>`;
}
function spCalExtraHTML() {
  const E = spCal.filter(e => e.n > 0), M = {}; E.forEach(e => { M[e.id] = e.n; });
  // mapa de calor de 26 semanas
  const end = new Date(); end.setHours(12); const start = new Date(end); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 25 * 7);
  let cells = ""; const d = new Date(start), tk = localKey();
  while (localKey(d) <= tk) { const k = localKey(d), n = M[k] || 0; cells += `<i class="h${Math.min(3, n)}" title="${k}"></i>`; d.setDate(d.getDate() + 1); }
  const wd = [0, 0, 0, 0, 0, 0, 0]; E.forEach(e => { wd[(new Date(e.id + "T12:00:00").getDay() + 6) % 7] += e.n; }); const wmax = Math.max(1, ...wd);
  const tm = {}; let tt = 0; E.forEach(e => (e.times || []).forEach(t => { tm[t] = (tm[t] || 0) + 1; tt++; }));
  const fav = calStats().fav, fk = fav && KSM[fav[0]];
  return `${fk ? `<button class="favpose" data-ks="${fk.id}"><div>${ksSVG(fk.id)}</div><span><small>💞 Vuestra postura favorita</small><b>${esc(fk.n)}</b><em>${fav[1]} ${fav[1] === 1 ? "vez" : "veces"} · ver ficha ›</em></span></button>` : ""}
    <div class="spsec">Últimas 26 semanas</div><div class="heat">${cells}</div><div class="callegend" style="margin-top:6px"><span>Menos</span><span><i class="hh0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i></span><span>Más</span></div>
    <div class="twocol"><div class="mini"><small>Día de la semana</small><div class="wdbars">${wd.map((v, i) => `<div><i style="height:${Math.round(v / wmax * 100)}%"></i><span>${"LMXJVSD"[i]}</span></div>`).join("")}</div></div>
    <div class="mini"><small>Momento del día</small>${SP_TIMES.map(([id, t]) => { const p = tt ? Math.round((tm[id] || 0) / tt * 100) : 0; return `<div class="tmrow"><span>${t}</span><b>${p}%</b><div><i style="width:${p}%"></i></div></div>`; }).join("")}</div></div>
    ${spBadgesHTML()}`;
}


// ---------- 📅 v53 · calendario estilo iPhone ----------
let icAnim = 0;
function renderSpCal() {
  const now = new Date(), today = localKey(); if (!spCalMonth) spCalMonth = [now.getFullYear(), now.getMonth()]; if (!spCalSel) spCalSel = today;
  const [Y, M] = spCalMonth, first = new Date(Y, M, 1), off = (first.getDay() + 6) % 7, nd = new Date(Y, M + 1, 0).getDate();
  const st = calStats(), max = Math.max(1, ...st.bars.map(b => b[1]));
  const total = Math.ceil((off + nd) / 7) * 7; let rows = "", row = "";
  for (let i = 0; i < total; i++) {
    const dt = new Date(Y, M, i - off + 1, 12), k = localKey(dt), inM = dt.getMonth() === M, e = calEntry(k), n = (e && e.n) || 0;
    row += `<button class="icd${inM ? "" : " out"}${k === today ? " today" : ""}${k === spCalSel ? " sel" : ""}${k > today ? " fut" : ""}${i % 7 >= 5 ? " wk" : ""}${n ? " has" : ""}" data-day="${k}"><b>${dt.getDate()}</b><i>${n ? Array.from({ length: Math.min(3, n) }, () => "<u></u>").join("") : ""}</i></button>`;
    if (i % 7 === 6) { rows += `<div class="icrow">${row}</div>`; row = ""; }
  }
  const pre = `${Y}-${String(M + 1).padStart(2, "0")}`, monthN = spCal.filter(e => e.n > 0 && e.id.startsWith(pre)).reduce((a, e) => a + e.n, 0), monthD = spCal.filter(e => e.n > 0 && e.id.startsWith(pre)).length;
  const isNow = Y === now.getFullYear() && M === now.getMonth();
  const anim = icAnim > 0 ? " sl" : icAnim < 0 ? " sr" : ""; icAnim = 0;
  return `<div class="ical"><div class="icalhead"><div class="ictitle"><b>${cap(first.toLocaleDateString("es-ES", { month: "long" }))}</b><span>${Y}</span></div><div class="icbtns">${!isNow || spCalSel !== today ? `<button class="ictoday" data-today="1">Hoy</button>` : ""}<button class="icnav" data-m="-1" aria-label="Mes anterior">‹</button><button class="icnav" data-m="1" aria-label="Mes siguiente">›</button></div></div>
      <div class="icsub">${monthN ? `<b>${monthN}</b> ${monthN === 1 ? "vez" : "veces"} en ${monthD} ${monthD === 1 ? "día" : "días"}` : "Sin registros este mes"}</div>
      <div class="icwd">${["L", "M", "X", "J", "V", "S", "D"].map((x, i) => `<span class="${i >= 5 ? "wk" : ""}">${x}</span>`).join("")}</div>
      <div class="icgrid${anim}" id="icGrid">${rows}</div></div>
    ${icAgenda(spCalSel)}
    ${wrCardHTML()}
    <div class="spsec">Resumen</div>
    <div class="kpis"><div class="kpi"><b>${st.month}</b><small>este mes</small></div><div class="kpi"><b>${st.year}</b><small>este año</small></div><div class="kpi"><b>${st.streak}</b><small>racha</small></div><div class="kpi"><b>${st.avg ? st.avg.toFixed(1) : "—"}</b><small>★ media</small></div></div>
    <div class="spsec">Últimos 6 meses</div><div class="bars6">${st.bars.map(([l, v]) => `<div class="b6"><i style="height:${Math.round(v / max * 100)}%"></i><b>${v}</b><small>${l}</small></div>`).join("")}</div>
    <div class="igroup" style="margin-top:14px">
      <div class="irow"><span>🔥 Total</span><em>${st.total} ${st.total === 1 ? "vez" : "veces"}</em></div>
      <div class="irow"><span>📍 Sitio favorito</span><em>${st.favPl ? (SP_PLACES.find(p => p[0] === st.favPl[0]) || ["", st.favPl[0]])[1] : "—"}</em></div>
      <div class="irow"><span>📖 Posturas probadas</span><em>${st.tried}/${KS.length}</em></div>
      ${(() => { const L = spCal.filter(e => e.n > 0 && e.dur > 0); if (!L.length) return ""; const avg = Math.round(L.reduce((a, e) => a + e.dur, 0) / L.length), top = L.slice().sort((a, b) => b.dur - a.dur)[0]; return `<div class="irow"><span>⏱️ Duración media</span><em>${durTxt(avg)}</em></div><div class="irow"><span>🏆 La más larga</span><em>${durTxt(top.dur)} · ${fmtDate(new Date(top.id + "T12:00:00"), { day: "numeric", month: "short" })}</em></div>`; })()}
      <div class="irow"><span>🗓️ Última vez</span><em>${st.last ? fmtDate(new Date(st.last + "T12:00:00"), { day: "numeric", month: "long" }) : "—"}</em></div></div>
    ${spCalExtraHTML()}`;
}
function icAgenda(k) {
  const e = calEntry(k), today = localKey(), d = new Date(k + "T12:00:00");
  const head = `<div class="icaghead"><b>${cap(fmtDate(d, { weekday: "long", day: "numeric", month: "long" }))}</b>${k === today ? `<span>HOY</span>` : ""}</div>`;
  if (!e || !e.n) return `<div class="icag">${head}<div class="icempty">${k > today ? "Este día aún no ha llegado 😏" : "Sin registros"}</div>${k > today ? "" : `<button class="icadd" data-edit="1">＋ Añadir registro</button>`}</div>`;
  const tm = (e.times || []).map(t => (SP_TIMES.find(x => x[0] === t) || ["", t])[1]).join(" · "), pl = e.place ? (SP_PLACES.find(x => x[0] === e.place) || ["", e.place])[1] : "";
  const P = (e.pos || []).filter(p => KSM[p]);
  return `<div class="icag">${head}<button class="icev" data-edit="1"><div class="icevbar"></div><div class="icevb">
      <div class="icevt"><b>🔥 ${e.n} ${e.n === 1 ? "vez" : "veces"}</b>${e.rating ? `<span class="icstars">${"★".repeat(e.rating)}<i>${"★".repeat(5 - e.rating)}</i></span>` : ""}</div>
      ${tm || pl ? `<small>${[tm, pl].filter(Boolean).join(" · ")}</small>` : ""}
      ${e.hora || e.dur ? `<div class="ictime">${e.hora ? `<span>🕐 ${esc(e.hora)}</span>` : ""}${e.dur ? `<span>⏱️ ${durTxt(e.dur)}</span>` : ""}</div>` : ""}
      ${P.length ? `<div class="icpos">${P.map(p => `<span>${ksSVG(p, "kthumb")}<em>${esc(KSM[p].n)}</em></span>`).join("")}</div>` : ""}
      ${e.note ? `<p>“${esc(e.note)}”</p>` : ""}
      <div class="icevf"><span>${e.by ? `Apuntado por ${esc(name(e.by))}` : ""}</span><span class="ed">Editar ›</span></div></div></button></div>`;
}
function icShift(d) { let [y, m] = spCalMonth; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } spCalMonth = [y, m]; icAnim = d; SFX.tap(); renderSp(); }
function bindSpCal() {
  const v = $("spBody");
  v.querySelectorAll("[data-m]").forEach(b => b.onclick = () => icShift(+b.dataset.m));
  v.querySelectorAll("[data-today]").forEach(b => b.onclick = () => { const n = new Date(); icAnim = 0; spCalMonth = [n.getFullYear(), n.getMonth()]; spCalSel = localKey(); renderSp(); });
  v.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { const k = b.dataset.day; if (b.classList.contains("out")) { const d = new Date(k + "T12:00:00"); icAnim = d < new Date(spCalMonth[0], spCalMonth[1], 1) ? -1 : 1; spCalMonth = [d.getFullYear(), d.getMonth()]; } spCalSel = k; SFX.tap(); renderSp(); });
  v.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { spDraft = null; calOpenSheet(); });
  const g = $("icGrid"); let x0 = null, y0 = 0;
  if (g) { g.ontouchstart = e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }; g.ontouchend = e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) icShift(dx < 0 ? 1 : -1); }; }
}
function calOpenSheet() {
  const k = spCalSel; if (!k || k > localKey()) return;
  const base = calEntry(k) || {};
  spDraft = spDraft || { n: base.n || 1, pos: [...(base.pos || [])], times: [...(base.times || [])], place: base.place || "", rating: base.rating || 0, note: base.note || "", hora: base.hora || "", dur: base.dur || 0 };
  const s = ksSheetEl("calSheet", "kssheet"); s.classList.remove("hidden"); renderCalSheet(); SFX.pop();
}
function calCloseSheet() { spDraft = null; const s = $("calSheet"); if (s) s.classList.add("hidden"); }
function renderCalSheet() {
  const s = $("calSheet"), k = spCalSel, D = spDraft, base = calEntry(k);
  s.innerHTML = `<div class="ksbg" data-x="1"></div><div class="kspanel icsheet in">
    <div class="icsh"><button data-x="1">Cancelar</button><b>${base ? "Editar registro" : "Nuevo registro"}</b><button class="ok" id="cfSave">Guardar</button></div>
    <div class="igroup"><div class="irow"><span>📅 Fecha</span><em>${cap(fmtDate(new Date(k + "T12:00:00"), { weekday: "long", day: "numeric", month: "long" }))}</em></div>
      <div class="irow"><span>🔥 Veces</span><div class="stepper"><button data-n="-1" aria-label="Menos">−</button><b id="cfN">${D.n}</b><button data-n="1" aria-label="Más">+</button></div></div>
      <div class="irow"><span>🕐 Hora</span><input type="time" id="cfHora" class="itime" value="${esc(D.hora || "")}"></div></div>
    <div class="ilabel">¿Cuánto duró? <small id="cfDurL">${D.dur ? durTxt(D.dur) : ""}</small></div><div class="chips durchips">${SP_DUR.map(v => `<button class="chip ${D.dur === v ? "on" : ""}" data-du="${v}">${durTxt(v, 1)}</button>`).join("")}</div>
    <div class="ilabel">Momento del día</div><div class="iseg">${SP_TIMES.map(([id, t]) => `<button class="${D.times.includes(id) ? "on" : ""}" data-tm="${id}">${t.replace(" ", "<br>")}</button>`).join("")}</div>
    <div class="ilabel">Dónde</div><div class="chips">${SP_PLACES.map(([id, t]) => `<button class="chip ${D.place === id ? "on" : ""}" data-pl="${id}">${t}</button>`).join("")}</div>
    <div class="ilabel">Posturas <small id="cfPc">${D.pos.length ? D.pos.length + (D.pos.length === 1 ? " elegida" : " elegidas") : ""}</small></div>
    <div class="ipos">${KS.map(p => `<button class="${D.pos.includes(p.id) ? "on" : ""}" data-po="${p.id}">${ksSVG(p.id, "kthumb")}<span>${esc(p.n)}</span></button>`).join("")}</div>
    <div class="ilabel">Valoración</div><div class="igroup"><div class="irow"><span>¿Qué tal fue?</span><div class="stars">${[1, 2, 3, 4, 5].map(i => `<button class="${D.rating >= i ? "on" : ""}" data-r="${i}">★</button>`).join("")}</div></div></div>
    <div class="ilabel">Nota</div><textarea id="cfNote" maxlength="300" placeholder="Algo para recordar (opcional)">${esc(D.note || "")}</textarea>
    ${base ? `<button class="idel" id="cfDel">Eliminar registro</button>` : ""}</div>`;
  s.querySelectorAll("[data-x]").forEach(b => b.onclick = calCloseSheet);
  $("cfNote").oninput = e => { D.note = e.target.value; };
  $("cfHora").onchange = e => { D.hora = e.target.value; const h = +(D.hora || "").split(":")[0]; if (D.hora && !D.times.length) { const t = h < 6 ? "madrugada" : h < 13 ? "manana" : h < 20 ? "tarde" : "noche"; D.times = [t]; s.querySelectorAll("[data-tm]").forEach(c => c.classList.toggle("on", c.dataset.tm === t)); } };
  s.querySelectorAll("[data-du]").forEach(b => b.onclick = () => { const v = +b.dataset.du; D.dur = D.dur === v ? 0 : v; s.querySelectorAll("[data-du]").forEach(c => c.classList.toggle("on", +c.dataset.du === D.dur)); $("cfDurL").textContent = D.dur ? durTxt(D.dur) : ""; SFX.tap(); });
  s.querySelectorAll("[data-n]").forEach(b => b.onclick = () => { D.n = Math.max(1, Math.min(20, D.n + +b.dataset.n)); $("cfN").textContent = D.n; SFX.tap(); });
  s.querySelectorAll("[data-tm]").forEach(b => b.onclick = () => { const x = b.dataset.tm; D.times = D.times.includes(x) ? D.times.filter(y => y !== x) : [...D.times, x]; b.classList.toggle("on", D.times.includes(x)); SFX.tap(); });
  s.querySelectorAll("[data-pl]").forEach(b => b.onclick = () => { D.place = D.place === b.dataset.pl ? "" : b.dataset.pl; s.querySelectorAll("[data-pl]").forEach(c => c.classList.toggle("on", c.dataset.pl === D.place)); SFX.tap(); });
  s.querySelectorAll("[data-po]").forEach(b => b.onclick = () => { const x = b.dataset.po; D.pos = D.pos.includes(x) ? D.pos.filter(y => y !== x) : [...D.pos, x]; b.classList.toggle("on", D.pos.includes(x)); $("cfPc").textContent = D.pos.length ? D.pos.length + (D.pos.length === 1 ? " elegida" : " elegidas") : ""; SFX.tap(); });
  s.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { D.rating = +b.dataset.r === D.rating ? 0 : +b.dataset.r; s.querySelectorAll("[data-r]").forEach(c => c.classList.toggle("on", D.rating >= +c.dataset.r)); SFX.tap(); });
  $("cfSave").onclick = () => {
    const kk = spCalSel, note = (D.note || "").trim().slice(0, 300), isNew = !base;
    spCalSave(kk, { n: D.n, pos: D.pos, times: D.times, place: D.place, rating: D.rating, note, hora: D.hora || "", dur: D.dur || 0, by: (base && base.by) || who, upd: Date.now() });
    calCloseSheet(); SFX.ding(); toast(isNew ? "Apuntado 🔥" : "Cambios guardados ✓"); renderSp();
  };
  const dl = $("cfDel"); if (dl) dl.onclick = () => { if (!confirm("¿Eliminar el registro de este día?")) return; spCalDel(spCalSel); calCloseSheet(); renderSp(); };
}


// ---------- 🎬 v55 · Resumen mensual estilo "Wrapped" ----------
const wrKey = (y, m) => { const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const wrMonth = (y, m) => new Date(y, m, 1).toLocaleDateString("es-ES", { month: "long" });
const WR_WD = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
let wr = null;
function wrStats(y, m) {
  const pre = wrKey(y, m), all = spCal.filter(e => e.n > 0).sort((a, b) => a.id < b.id ? -1 : 1), E = all.filter(e => e.id.startsWith(pre));
  const ppre = wrKey(y, m - 1), prev = all.filter(e => e.id.startsWith(ppre)).reduce((a, e) => a + e.n, 0);
  const total = E.reduce((a, e) => a + e.n, 0), days = new Set(E.map(e => e.id));
  let best = 0; E.forEach(e => { const d = new Date(e.id + "T12:00:00"); d.setDate(d.getDate() - 1); if (days.has(localKey(d))) return; let c = 0; const x = new Date(e.id + "T12:00:00"); while (days.has(localKey(x)) && localKey(x).startsWith(pre)) { c++; x.setDate(x.getDate() + 1); } best = Math.max(best, c); });
  const top = E.slice().sort((a, b) => b.n - a.n || (b.rating || 0) - (a.rating || 0))[0];
  const pc = {}; E.forEach(e => (e.pos || []).forEach(p => { if (KSM[p]) pc[p] = (pc[p] || 0) + 1; }));
  const star = Object.entries(pc).sort((a, b) => b[1] - a[1])[0];
  const first = {}; all.forEach(e => (e.pos || []).forEach(p => { if (!first[p]) first[p] = e.id; }));
  const newPos = Object.keys(first).filter(p => KSM[p] && first[p].startsWith(pre));
  const cnt = f => { const o = {}; let t = 0; E.forEach(e => f(e).forEach(k => { if (k) { o[k] = (o[k] || 0) + 1; t++; } })); return { L: Object.entries(o).sort((a, b) => b[1] - a[1]), t }; };
  const times = cnt(e => e.times || []), places = cnt(e => [e.place]);
  const wd = [0, 0, 0, 0, 0, 0, 0]; E.forEach(e => { wd[(new Date(e.id + "T12:00:00").getDay() + 6) % 7] += e.n; });
  const rated = E.filter(e => e.rating), avg = rated.length ? rated.reduce((a, e) => a + e.rating, 0) / rated.length : 0;
  const note = E.filter(e => e.note).sort((a, b) => (b.rating || 0) - (a.rating || 0) || (a.id < b.id ? 1 : -1))[0];
  const title = total >= 12 ? ["Un mes de fuego", "🔥"] : newPos.length >= 3 ? ["Mes explorador", "🧭"] : avg >= 4.5 ? ["Calidad cinco estrellas", "⭐"] : best >= 3 ? ["Imparables", "⚡"] : total >= 6 ? ["Muy bien avenidos", "😏"] : ["Pocas, pero buenas", "💞"];
  return { y, m, pre, E, total, days: days.size, prev, best, top, star, newPos, times, places, wd, avg, rated: rated.length, note, title };
}
function wrSlides(s) {
  const mes = wrMonth(s.y, s.m), Mes = cap(mes), me = esc(name(who)), o = esc(name(other())), A = (d, h, c = "") => `<div class="wa ${c}" style="--d:${d}s">${h}</div>`, S = [];
  S.push({ bg: "g1", html: `${A(.1, `<div class="wrk">${s.y} · solo para vosotros</div>`)}${A(.35, `<div class="wrbig">Vuestro<br>${mes}</div>`)}${A(.8, `<div class="wrsub">${me} <span>&</span> ${o}</div>`)}${A(1.6, `<div class="wrhint">Toca para empezar ›</div>`)}<div class="wrfloat">${["💗", "✨", "🔥", "💋", "✨", "💞"].map((e, i) => `<i style="--i:${i}">${e}</i>`).join("")}</div>`, dur: 5200 });
  const diff = s.total - s.prev, prevName = wrMonth(s.y, s.m - 1);
  S.push({ bg: "g2", html: `${A(.1, `<div class="wrk">En ${mes} lo hicisteis</div>`)}${A(.3, `<div class="wrnum" data-count="${s.total}">0</div>`)}${A(.5, `<div class="wrunit">${s.total === 1 ? "vez" : "veces"}</div>`)}${A(1.1, `<div class="wrpill">en <b>${s.days}</b> ${s.days === 1 ? "día distinto" : "días distintos"}</div>`)}${s.prev || s.total ? A(1.6, `<div class="wrcmp ${diff > 0 ? "up" : diff < 0 ? "down" : ""}">${s.prev ? (diff > 0 ? `▲ ${diff} más que en ${prevName}` : diff < 0 ? `▼ ${-diff} menos que en ${prevName}` : `Igual que en ${prevName}`) : `${cap(prevName)} no tuvo registros`}</div>`) : ""}` });
  const first = new Date(s.y, s.m, 1), off = (first.getDay() + 6) % 7, nd = new Date(s.y, s.m + 1, 0).getDate(), M = {}; s.E.forEach(e => { M[e.id] = e.n; });
  let cells = "", k = 0; for (let i = 0; i < off; i++) cells += "<span></span>";
  for (let d = 1; d <= nd; d++) { const key = `${s.pre}-${String(d).padStart(2, "0")}`, n = M[key] || 0; cells += `<span class="${n ? "l" + Math.min(3, n) : ""}" style="--d:${n ? (.5 + (k++) * .09).toFixed(2) : 0}s">${d}</span>`; }
  const topD = s.top ? new Date(s.top.id + "T12:00:00") : null;
  S.push({ bg: "g3", html: `${A(.1, `<div class="wrk">Vuestros días de ${mes}</div>`)}${A(.25, `<div class="wrcal"><div class="wrcwd">${"LMXJVSD".split("").map(x => `<b>${x}</b>`).join("")}</div><div class="wrcg">${cells}</div></div>`)}
    <div class="wrrow">${A(1.2 + k * .09, `<div class="wrmini"><b>${s.best}</b><small>${s.best === 1 ? "día, vuestra<br>mejor racha" : "días seguidos,<br>vuestra mejor racha"}</small></div>`)}${topD ? A(1.4 + k * .09, `<div class="wrmini"><b>${topD.getDate()}</b><small>de ${mes}, el día más<br>intenso (${s.top.n} ${s.top.n === 1 ? "vez" : "veces"})</small></div>`) : ""}</div>`, dur: 7000 + k * 90 });
  if (s.star) {
    const st = KSM[s.star[0]];
    S.push({ bg: "g4", html: `${A(.1, `<div class="wrk">Vuestra postura estrella</div>`)}${A(.35, `<div class="wrart">${ksSVG(st.id)}</div>`, "pop")}${A(.9, `<div class="wrtitle">${esc(st.n)}</div>`)}${A(1.2, `<div class="wrpill"><b>${s.star[1]}</b> ${s.star[1] === 1 ? "vez" : "veces"} este mes</div>`)}
      ${s.newPos.length ? A(1.8, `<div class="wrnew"><small>✨ Y estrenasteis ${s.newPos.length} ${s.newPos.length === 1 ? "postura nueva" : "posturas nuevas"}</small><div>${s.newPos.slice(0, 4).map(p => `<span>${ksSVG(p)}<em>${esc(KSM[p].n)}</em></span>`).join("")}</div></div>`) : ""}`, dur: 7500 });
  }
  const tm = s.times.L[0], pl = s.places.L[0];
  if (tm || pl) {
    const tName = tm ? (SP_TIMES.find(x => x[0] === tm[0]) || ["", tm[0]])[1] : "", pName = pl ? (SP_PLACES.find(x => x[0] === pl[0]) || ["", pl[0]])[1] : "";
    const big = t => { const [e, ...r] = t.split(" "); return `<span class="wre">${e}</span><b>${r.join(" ")}</b>`; };
    S.push({ bg: "g5", html: `${A(.1, `<div class="wrk">Lo vuestro es…</div>`)}${tm ? A(.35, `<div class="wrcardx">${big(tName)}<small>vuestro momento del día · ${Math.round(tm[1] / s.times.t * 100)}%</small></div>`) : ""}${pl ? A(.9, `<div class="wrcardx">${big(pName)}<small>vuestro sitio favorito · ${Math.round(pl[1] / s.places.t * 100)}%</small></div>`) : ""}` });
  }
  const wmax = Math.max(...s.wd), wi = s.wd.indexOf(wmax);
  if (wmax > 0) S.push({ bg: "g6", html: `${A(.1, `<div class="wrk">Vuestro día favorito</div>`)}${A(.3, `<div class="wrbig sm">Los ${WR_WD[wi]}${wi < 5 ? "" : ""}</div>`)}${A(.6, `<div class="wrbars7">${s.wd.map((v, i) => `<div class="${i === wi ? "top" : ""}"><i style="--h:${Math.round(v / wmax * 100)}%;--d:${(.8 + i * .1).toFixed(1)}s"></i><b>${v || ""}</b><span>${"LMXJVSD"[i]}</span></div>`).join("")}</div>`)}` });
  if (s.rated) S.push({ bg: "g7", html: `${A(.1, `<div class="wrk">Nota media del mes</div>`)}${A(.3, `<div class="wrnum sm" data-count="${s.avg.toFixed(1)}" data-dec="1">0</div>`)}${A(.5, `<div class="wrstars">${[1, 2, 3, 4, 5].map(i => `<i class="${s.avg >= i - .25 ? "on" : ""}" style="--d:${(.7 + i * .15).toFixed(2)}s">★</i>`).join("")}</div>`)}
    ${s.note ? A(1.7, `<div class="wrquote">“${esc(s.note.note)}”<small>— ${fmtDate(new Date(s.note.id + "T12:00:00"), { day: "numeric", month: "long" })}</small></div>`) : ""}` });
  S.push({ bg: "g8", html: `${A(.1, `<div class="wrk">Vuestro ${mes} en una frase</div>`)}${A(.3, `<div class="wremoji">${s.title[1]}</div>`, "pop")}${A(.7, `<div class="wrbig sm">${s.title[0]}</div>`)}
    ${A(1.1, `<div class="wrchips"><span><b>${s.total}</b>veces</span><span><b>${s.days}</b>días</span><span><b>${s.best}</b>racha</span><span><b>${s.newPos.length}</b>nuevas</span></div>`)}
    ${A(1.5, `<div class="wrsub">Hasta el mes que viene, ${me} y ${o} 💞</div>`)}${A(1.8, `<div class="wrbtns"><button class="spb" id="wrAgain">↺ Ver otra vez</button><button class="spb hot" id="wrDone">Cerrar</button></div>`)}`, fx: () => setTimeout(() => confetti(), 500) });
  return S;
}
function wrOpen(y, m) {
  const st = wrStats(y, m); if (!st.total) return toast("Ese mes no tiene registros todavía");
  ls.set("spWr:" + wrKey(y, m), "1");
  wr = { st, i: 0, slides: wrSlides(st), t: null };
  const v = ksSheetEl("wrView", "wrview"); v.classList.remove("hidden"); wrShow(0);
}
function wrClose() { if (wr) clearTimeout(wr.t); wr = null; const v = $("wrView"); if (v) { v.classList.add("hidden"); v.innerHTML = ""; } if (spOpen) renderSp(); }
function wrShow(i) {
  const v = $("wrView"); if (!wr || !v) return;
  i = Math.max(0, Math.min(wr.slides.length - 1, i)); wr.i = i; clearTimeout(wr.t);
  const s = wr.slides[i], dur = s.dur || 6500, last = i === wr.slides.length - 1;
  v.innerHTML = `<div class="wrslide ${s.bg}" style="--dur:${dur}ms"><div class="wrblob"></div><div class="wrbars">${wr.slides.map((_, k) => `<i class="${k < i ? "done" : k === i && !last ? "on" : k === i ? "done" : ""}"><b></b></i>`).join("")}</div>
    <div class="wrtop"><span>🌶️ Resumen de ${wrMonth(wr.st.y, wr.st.m)}</span><button class="wrx" aria-label="Cerrar">✕</button></div>
    <div class="wrtap l"></div><div class="wrtap r"></div><div class="wrin">${s.html}</div></div>`;
  v.querySelector(".wrx").onclick = wrClose;
  v.querySelector(".wrtap.l").onclick = () => { if (wr.i > 0) wrShow(wr.i - 1); };
  v.querySelector(".wrtap.r").onclick = () => { if (!last) wrShow(wr.i + 1); };
  const ag = $("wrAgain"); if (ag) ag.onclick = () => wrShow(0); const dn = $("wrDone"); if (dn) dn.onclick = wrClose;
  v.querySelectorAll("[data-count]").forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), t0 = performance.now(), delay = 450, len = 1300;
    const step = t => { if (!wr || !el.isConnected) return; const p = Math.max(0, Math.min(1, (t - t0 - delay) / len)), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toFixed(dec); if (p < 1) requestAnimationFrame(step); else if (!dec) SFX.coin(); };
    requestAnimationFrame(step);
  });
  SFX.whoosh(); buzz(8); if (s.fx) s.fx(v);
  // mantener pulsado = pausa
  wr.left = dur; wr.start = performance.now();
  const sl = v.querySelector(".wrslide");
  const next = () => { if (wr && wr.i === i) wrShow(i + 1); };
  if (!last) wr.t = setTimeout(next, dur);
  sl.onpointerdown = () => { if (last || !wr) return; clearTimeout(wr.t); wr.left -= performance.now() - wr.start; sl.classList.add("paused"); };
  sl.onpointerup = sl.onpointercancel = () => { if (last || !wr || !sl.classList.contains("paused")) return; sl.classList.remove("paused"); wr.start = performance.now(); wr.t = setTimeout(next, Math.max(300, wr.left)); };
}
function wrMonths() { return [...new Set(spCal.filter(e => e.n > 0).map(e => e.id.slice(0, 7)))].sort().reverse().slice(0, 12); }
function wrNewKey() { const n = new Date(), pk = wrKey(n.getFullYear(), n.getMonth() - 1); return wrMonths().includes(pk) && !ls.get("spWr:" + pk) ? pk : null; }
function wrCardHTML() {
  const L = wrMonths(); if (!L.length) return "";
  const n = new Date(), cur = wrKey(n.getFullYear(), n.getMonth()), pk = wrKey(n.getFullYear(), n.getMonth() - 1);
  const main = L.includes(pk) ? pk : L[0], [y, mm] = main.split("-").map(Number), st = wrStats(y, mm - 1), isNew = !ls.get("spWr:" + main) && main !== cur;
  return `<button class="wrcard ${isNew ? "new" : ""}" data-wr="${main}"><div class="wrcv"><span>🎬</span></div><div class="wrct"><small>${isNew ? "<em>NUEVO</em> " : ""}Resumen del mes</small><b>Vuestro ${wrMonth(y, mm - 1)}${main === cur ? " (hasta hoy)" : ""}</b><span>${st.total} ${st.total === 1 ? "vez" : "veces"} · ${st.title[0]} ${st.title[1]}</span></div><i>▶</i></button>
    ${L.length > 1 ? `<div class="wrmonths">${L.filter(k => k !== main).map(k => { const [a, b] = k.split("-").map(Number); return `<button class="chip" data-wr="${k}">🎬 ${cap(new Date(a, b - 1, 1).toLocaleDateString("es-ES", { month: "short" }).replace(".", ""))} ${String(a).slice(2)}</button>`; }).join("")}</div>` : ""}`;
}


// ---------- 🔐 v1.2 · Cifrado de extremo a extremo de la zona privada ----------
// Todo lo íntimo se cifra en el móvil con AES-256 (clave sacada de una frase que solo sabéis vosotros).
// En Firebase solo se guarda texto ilegible.
const SPK = { key: null, raw: null };
const spRaw = { spicy: null, cal: [], coupons: [], letters: [], got: {} }, spSeq = { spicy: 0, cal: 0, coupons: 0, letters: 0 };
let spMigrating = false;
const b64e = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const isEnc = s => typeof s === "string" && s.startsWith("e1:");
const spNorm = p => (p || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
async function spDeriveRaw(phrase) {
  const enc = new TextEncoder(), base = await crypto.subtle.importKey("raw", enc.encode(spNorm(phrase)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode("nosotros-zona-privada|" + CONFIG.couple), iterations: 250000, hash: "SHA-256" }, base, 256));
}
async function spUseRaw(raw) { SPK.key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); SPK.raw = b64e(raw); }
async function spEnc(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, SPK.key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return "e1:" + b64e(out);
}
async function spDec(s) {
  if (!isEnc(s) || !SPK.key) return null;
  try { const u = b64d(s.slice(3)); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, SPK.key, u.slice(12)))); } catch (e) { return null; }
}
async function spDocId(day) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SPK.raw + "|cal|" + day))); return "c" + Array.from(h.slice(0, 12), x => x.toString(16).padStart(2, "0")).join(""); }
async function spLoadKey() { const r = ls.get("spK"); if (!r) return; try { await spUseRaw(b64d(r)); spDecodeAll(); } catch (e) { ls.set("spK", ""); } }
const spRender = () => { if (spOpen) renderSp(); renderSpEntry(); };
// ---- descifrar lo que llega de Firebase ----
async function spDecodeSpicy() {
  const my = ++spSeq.spicy, d = spRaw.spicy || {}, st = { ...d, dare: {}, ksw: {} };
  for (const u of ["a", "b"]) {
    const x = d["x" + u] ? await spDec(d["x" + u]) : null;
    st.dare[u] = { ...((d.dare && d.dare[u]) || {}), ...((x && x.dare) || {}) };
    st.ksw[u] = { ...((d.ksw && d.ksw[u]) || {}), ...((x && x.ksw) || {}) };
  }
  if (my !== spSeq.spicy) return; spState = st; renderSpSettings(); spRender(); spMigrate();
}
async function spDecodeCal() {
  const my = ++spSeq.cal, out = {}, plain = [];
  for (const e of spRaw.cal) {
    if (e.x) { const o = await spDec(e.x); if (o && o.d) out[o.d] = { ...o, id: o.d, _doc: e.id }; }
    else if (e.n != null) plain.push({ ...e, _doc: e.id });
  }
  plain.forEach(e => { if (!out[e.id]) out[e.id] = e; });
  if (my !== spSeq.cal) return; spCal = Object.values(out); spCalLoaded = true; if (spOpen && (spTab === "cal" || spTab === "ks")) renderSp(); spMigrate();
}
async function spDecodeTexts(kind) {
  const my = ++spSeq[kind], L = [];
  for (const e of spRaw[kind]) { if (isEnc(e.text)) { const o = await spDec(e.text); L.push({ ...e, text: o ? o.t : "🔒 (cifrado)", _enc: 1 }); } else L.push(e); }
  if (my !== spSeq[kind]) return; if (kind === "coupons") spCoupons = L; else spLetters = L; spRender(); spMigrate();
}
function spDecodeAll() { spDecodeSpicy(); spDecodeCal(); spDecodeTexts("coupons"); spDecodeTexts("letters"); }
function watchSpicy() {
  S.watchDoc("state/spicy", d => { spRaw.spicy = d || {}; spRaw.got.spicy = 1; spState = { ...spState, opt: (d || {}).opt, kchk: (d || {}).kchk, kby: (d || {}).kby }; renderSpEntry(); renderSpSettings(); spDecodeSpicy(); });
  S.watchCol("spcoupons", l => { spRaw.coupons = l; spRaw.got.coupons = 1; spDecodeTexts("coupons"); }, 60);
  S.watchCol("spletters", l => { spRaw.letters = l; spRaw.got.letters = 1; spDecodeTexts("letters"); }, 40);
}
function watchSpCal() { S.watchCol("spcal", l => { spRaw.cal = l; spRaw.got.cal = 1; spDecodeCal(); }, 500); }
// ---- guardar cifrado ----
async function spSaveMine(patch) {
  const mine = { dare: { ...((spState.dare || {})[who] || {}), ...(patch.dare || {}) }, ksw: { ...((spState.ksw || {})[who] || {}), ...(patch.ksw || {}) } };
  spState = { ...spState, dare: { ...(spState.dare || {}), [who]: mine.dare }, ksw: { ...(spState.ksw || {}), [who]: mine.ksw } }; spRender();
  await S.merge("state/spicy", { dare: { [who]: mine.dare }, ksw: { [who]: mine.ksw } });
}
async function spCalSave(day, data) {
  const id = day, old = calEntry(day);
  await S.merge("spcal/" + id, { ...data, at: Date.parse(day + "T12:00:00") });
  if (old && old._doc && old._doc !== id) S.del("spcal/" + old._doc);
}
function spCalDel(day) { const e = calEntry(day); if (e && e._doc) S.del("spcal/" + e._doc); }
async function spAddText(col, data) { return S.add(col, data); }
// ---- pasar a cifrado lo que había antes ----
async function spMigrate() {
  // 1.8: quitamos la frase secreta. El móvil que aún la tenga guardada descifra lo que había y lo deja normal.
  const g = spRaw.got; if (!SPK.key || spMigrating || !(g.spicy && g.cal && g.coupons && g.letters)) return;
  spMigrating = true; let fails = 0;
  try {
    const d = spRaw.spicy || {}, up = { kchk: null, kby: null };
    for (const e of spRaw.cal.filter(e => e.x)) { const o = await spDec(e.x); if (!o || !o.d) { fails++; continue; } const { d: day, ...rest } = o; await S.merge("spcal/" + day, { ...rest, at: Date.parse(day + "T12:00:00") }); await S.del("spcal/" + e.id); }
    for (const e of spRaw.coupons.filter(e => isEnc(e.text))) { const o = await spDec(e.text); if (o) await S.merge("spcoupons/" + e.id, { text: o.t }); else fails++; }
    for (const e of spRaw.letters.filter(e => isEnc(e.text))) { const o = await spDec(e.text); if (o) await S.merge("spletters/" + e.id, { text: o.t }); else fails++; }
    for (const u of ["a", "b"]) { if (!d["x" + u]) continue; const o = await spDec(d["x" + u]); if (o) { up.dare = { ...(up.dare || {}), [u]: o.dare || {} }; up.ksw = { ...(up.ksw || {}), [u]: o.ksw || {} }; up["x" + u] = null; } else fails++; }
    if (fails) { console.warn("no se pudo descifrar", fails); spMigrating = false; return; }
    await S.merge("state/spicy", up);
    ls.set("spK", ""); SPK.key = null; SPK.raw = null;
  } catch (e) { console.error("descifrar", e); }
  spMigrating = false;
}
// ---- pantalla de la frase secreta ----
function spKeyHTML() {
  const has = !!spState.kchk, by = spState.kby ? esc(name(spState.kby)) : esc(name(other()));
  return `<div class="spkey"><div class="spkeyico">🔐</div>
    ${has ? `<h3>Frase secreta</h3><p>Vuestra zona privada está <b>cifrada</b>. Para abrirla en este móvil, escribe la frase secreta que eligió ${by}.</p>
      <input id="spk1" type="password" autocomplete="off" autocapitalize="off" placeholder="Frase secreta"><button class="spb hot" id="spkGo">Desbloquear</button>`
    : `<h3>Protege vuestra intimidad</h3><p>Antes de entrar, elegid una <b>frase secreta</b> que sepáis solo vosotros dos. Con ella se cifra en el móvil todo lo de aquí: calendario, deseos, cupones y mensajes secretos.</p>
      <ul><li>🔒 En internet solo se guarda texto ilegible: ni Google ni nadie con acceso a la base de datos puede leerlo.</li><li>🗣️ Dísela a ${esc(name(other()))} en persona o por llamada, nunca por escrito.</li><li>⚠️ Si la olvidáis los dos, lo cifrado no se puede recuperar.</li></ul>
      <input id="spk1" type="password" autocomplete="off" autocapitalize="off" placeholder="Frase secreta (mín. 8 caracteres)"><input id="spk2" type="password" autocomplete="off" autocapitalize="off" placeholder="Repítela">
      <button class="spb hot" id="spkGo">🔐 Activar el cifrado</button>`}
    <label class="spkshow"><input type="checkbox" id="spkShow"> Mostrar lo que escribo</label><div class="spkerr" id="spkErr"></div></div>`;
}
function spKeyBind() {
  $("spkShow").onchange = e => document.querySelectorAll(".spkey input[type=password],.spkey input[data-pw]").forEach(i => { i.dataset.pw = 1; i.type = e.target.checked ? "text" : "password"; });
  const err = t => { $("spkErr").textContent = t; buzz([40, 30, 40]); };
  $("spkGo").onclick = async () => {
    const p1 = $("spk1").value, has = !!spState.kchk, b = $("spkGo");
    if (spNorm(p1).length < (has ? 1 : 8)) return err(has ? "Escribe la frase" : "Mínimo 8 caracteres");
    if (!has && spNorm(p1) !== spNorm($("spk2").value)) return err("Las dos frases no coinciden");
    b.disabled = true; b.textContent = "🔐 Un momento…";
    try {
      const raw = await spDeriveRaw(p1); await spUseRaw(raw);
      if (has) {
        const ok = await spDec(spState.kchk);
        if (!ok || ok.ok !== "nosotros") { SPK.key = null; SPK.raw = null; b.disabled = false; b.textContent = "Desbloquear"; return err("Esa frase no es la correcta"); }
      } else {
        if (spRaw.spicy && spRaw.spicy.kchk) { SPK.key = null; b.disabled = false; renderSp(); return toast(`${name(other())} acaba de crear la frase: pídesela 🔐`); }
        await S.merge("state/spicy", { kchk: await spEnc({ ok: "nosotros" }), kby: who, kat: Date.now() });
        notifyOther("🔒 Hay novedades en la zona privada");
      }
      ls.set("spK", b64e(raw)); SFX.ding(); toast(has ? "Desbloqueado 🔓" : "Cifrado activado 🔐"); confetti();
      spDecodeAll(); renderSp();
    } catch (e) { console.error(e); SPK.key = null; b.disabled = false; b.textContent = has ? "Desbloquear" : "🔐 Activar el cifrado"; err("Algo falló, prueba otra vez"); }
  };
}
// ---- tapar la pantalla en el selector de apps del iPhone ----
(() => {
  const cover = () => { if (spOpen || !$("spPin").classList.contains("hidden")) document.body.classList.add("spcover"); };
  const uncover = () => setTimeout(() => { if (!document.hidden) document.body.classList.remove("spcover"); }, 60);
  window.addEventListener("blur", cover); window.addEventListener("pagehide", cover);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cover(); $("spPin").classList.add("hidden"); } else uncover(); });
  window.addEventListener("focus", uncover); window.addEventListener("pageshow", uncover);
})();


// ---------- 💭 1.4 · "Pienso en ti" con contador semanal y "a la vez" ----------
const weekKey = (d = new Date()) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return localKey(x); };
const THINK_SYNC = 10 * 6e4;
function thinkSync() { confetti(); buzz([60, 60, 60, 60, 120]); toast(`💞 ¡${name(other())} y tú estabais pensando el uno en el otro a la vez!`, 4500); }
function renderThink() {
  const el = $("thinkStats"); if (!el) return;
  const t = (state.main || {}).think || {}, cur = t.wk === weekKey() ? t : {}, me = cur[who] || 0, ot = cur[other()] || 0, sync = (t.sync && t.sync.wk === weekKey()) ? t.sync.n : 0;
  el.innerHTML = me || ot ? `💭 Esta semana: <b>tú ${me}</b> · <b>${esc(name(other()))} ${ot}</b>${sync ? ` · 💞 ${sync} ${sync === 1 ? "vez" : "veces"} a la vez` : ""}` : `💭 Pulsa cuando pienses en ${esc(name(other()))}: aquí veréis cuántas veces esta semana`;
}
$("btnThink").addEventListener("click", () => {
  const wk = weekKey(), now = Date.now(), t0 = (state.main || {}).think || {}, theirs = t0["last_" + other()] || 0, isSync = now - theirs < THINK_SYNC && !(t0["lastSync"] > theirs);
  S.tx("state/main", d => {
    d = d || {}; const t = { ...(d.think || {}) };
    if (t.wk !== wk) { t.wk = wk; t.a = 0; t.b = 0; }
    t[who] = (t[who] || 0) + 1; t["last_" + who] = now;
    if (isSync) { const s = t.sync && t.sync.wk === wk ? t.sync : { wk, n: 0 }; t.sync = { wk, n: s.n + 1 }; t.lastSync = now; }
    d.think = t; return d;
  }).catch(e => console.warn(e));
  if (isSync) setTimeout(thinkSync, 400);
});
// ---------- ✈️ 1.4 · cuenta atrás: la mascota también lo espera ----------
function meetPetHTML(nx) {
  const p = state.pet || {}, ms = nx - Date.now(), d = calDays(nx), pn = esc(p.name || "Tu mascota");
  if (!p.xp && p.xp !== 0) return "";
  const [txt, cls] = ms <= 0 ? [`¡${pn} no puede más de la emoción! 🥹`, "party"] : d <= 0 ? [`¡Es hoy! ${pn} no se despega de la puerta 🚪`, "nerv"] : d === 1 ? [`¡Mañana! ${pn} no va a poder dormir 😳`, "nerv"] : d <= 7 ? [`${pn} está nerviosísimo: ¡solo ${d} días! 🤭`, "nerv"] : d <= 30 ? [`${pn} ya está preparando la maleta 🧳`, "calm"] : [`${pn} va tachando los días en el calendario 🗓️`, "calm"];
  let svg = ""; try { svg = chickSVG(Math.max(1, stageOf(p.xp || 0)), ms <= DAY * 7 ? "love" : "happy", p.wear || {}, 0, p.color, { species: p.species }); } catch (e) { }
  return `<div class="meetpet ${cls}"><div class="mpsvg">${svg}</div><span>${txt}</span></div>`;
}

// si le das de comer, mimos, etc. y no está contigo, viene corriendo
document.querySelector(".actions.six").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || !["petFeed", "petBag", "petHug", "petPlay", "petBath", "petSleep", "petTricks"].includes(b.id)) return;
  if (hatched() && !tripAway(state.pet) && !locHere()) summonPet();
}, true);
setInterval(() => { if (!document.hidden && !$("tab-pet").classList.contains("hidden") && state.pet) renderPet(); }, 30000);
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
  S.watchDoc("state/main", d => { state.main = d || {}; tick(); renderDates(); renderPush(); renderMeet(); renderThink(); });
  S.watchDoc("state/pet", d => { state.pet = d; checkFirsts(d); renderPet(); fgInfo(); });
  watchDiary(); watchOTD(); watchPresence(); watchPetPics(); watchAiMem(); watchWeekly(); watchLive(); spLoadKey(); watchSpicy(); watchSpCal();
  // 🎁 Una sola vez para la pareja: el pollito empieza ya en el día 7 (fase «Pequeñín»)
  setTimeout(() => {
    const q = state.pet || {}; if (q.boost7 || (q.xp || 0) >= 7) return;
    petTx(p => {
      if (p.boost7 || (p.xp || 0) >= 7) { p.boost7 = true; return p; }
      const now = Date.now(); p.album = p.album || {};
      if (!p.album[1]) p.album[1] = now - 5 * DAY; if (!p.album[2]) p.album[2] = now;
      if (!p.hatchedAt) p.hatchedAt = now - 5 * DAY; p.trait = p.trait || rnd(Object.keys(TRAITS));
      p.xp = 7; p.boost7 = 1; return p;
    }).then(r => { if (r && r.xp === 7 && r.boost7 === 1) { confetti(); toast(`🎁 ¡${r.name || "Tu pollito"} ya va por el día 7: ahora es un Pequeñín! 🐥`, 4000); } }).catch(e => console.warn(e));
  }, 3500);
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
  S.watchCol("memories", l => { renderMem(l); setTimeout(migratePhotos, 4000); }, 300);
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
