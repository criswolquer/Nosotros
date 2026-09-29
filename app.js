import { CONFIG } from "./config.js";
import * as S from "./store.js";

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
  if (t === "mem") initMemMap();
  if (t === "letters") { renderLetters(); renderCaps(); renderDates(); }
  if (t === "games") renderAch();
  if (t === "pet") setTimeout(() => { renderPet(); if (stageOf((state.pet || {}).xp || 0) > 0) say(phrase()); }, 350);
}
document.querySelectorAll("nav button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
document.querySelectorAll("#gameSeg button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#gameSeg button").forEach(x => x.classList.toggle("on", x === b));
  ["quiz", "ttt", "wheel", "ach"].forEach(g => $("g-" + g).classList.toggle("hidden", b.dataset.g !== g));
  if (b.dataset.g === "ach") renderAch();
});

// ================= Relojes y contadores =================
function fmt(tz, o) { try { return new Intl.DateTimeFormat("es-ES", { timeZone: tz, ...o }).format(new Date()); } catch (e) { return new Intl.DateTimeFormat("es-ES", o).format(new Date()); } }
const hourIn = tz => parseInt(fmt(tz, { hour: "2-digit", hour12: false }), 10) % 24;
const mood = h => h >= 23 || h < 7 ? "🌙 durmiendo" : h < 12 ? "☀️ mañana" : h < 20 ? "🌤 tarde" : "🌆 noche";
function offsetMin(tz) { const d = new Date(); try { return Math.round((new Date(d.toLocaleString("en-US", { timeZone: tz })) - new Date(d.toLocaleString("en-US", { timeZone: "UTC" }))) / 6e4); } catch (e) { return 0; } }
function tick() {
  const otz = (state.main.tz && state.main.tz[other()]) || myTz;
  $("meName").textContent = name(who) + " (tú)";
  $("youName").textContent = name(other());
  $("meTime").textContent = fmt(myTz, { hour: "2-digit", minute: "2-digit" });
  $("youTime").textContent = fmt(otz, { hour: "2-digit", minute: "2-digit" });
  $("meDay").textContent = fmt(myTz, { weekday: "long" }) + " · " + mood(hourIn(myTz));
  $("youDay").textContent = fmt(otz, { weekday: "long" }) + " · " + mood(hourIn(otz));
  const d = (offsetMin(otz) - offsetMin(myTz)) / 60;
  $("diff").textContent = d === 0 ? "Misma hora 🥰" : Math.abs(d) + " h " + (d > 0 ? "por delante de ti" : "por detrás de ti");

  if (CONFIG.start) {
    const days = Math.floor((Date.now() - new Date(CONFIG.start + "T00:00:00")) / DAY);
    $("together").textContent = days; $("togetherSub").textContent = days === 1 ? "día" : "días";
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
}

// ================= Buzón =================
const SWEET = [
  "Estaba pensando en ti ❤️", "Te echo de menos 🥺", "Ojalá estuvieras aquí ahora mismo", "Un abrazo a distancia 🤗",
  "Me acabo de acordar de ti y he sonreído 😊", "Un día menos para vernos ✈️", "Eres mi persona favorita 💕",
  "Te mando un beso que cruza la distancia 😘", "Solo quería decirte que te quiero", "Nada es igual sin ti 🌙"
];
function sendMsg(text, kind = "text") {
  S.add("messages", { from: who, text, kind, at: Date.now() });
}
$("btnThink").onclick = () => { buzz(60); sendMsg(SWEET[Math.floor(Math.random() * SWEET.length)], "think"); toast("Enviado a " + name(other()) + " 💌"); };
$("msgSend").onclick = () => { const t = $("msgInput").value.trim(); if (!t) return; sendMsg(t); $("msgInput").value = ""; };
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
    S.merge("answers/" + dayKey(), { [who]: t, at: Date.now() }); buzz(); addCoins(5);
  };
}
let unAns = null, ansDay = null;
function watchAnswers() {
  const k = dayKey(); if (k === ansDay) return; ansDay = k;
  if (unAns) unAns();
  unAns = S.watchDoc("answers/" + k, d => { state.ans = d || {}; renderQuestion(); });
}

// ================= Mascota =================
// Crece despacio: días cuidándole LOS DOS el mismo día
const STAGES = [
  { xp: 0, n: "Huevo" }, { xp: 2, n: "Recién nacido" }, { xp: 7, n: "Pollito" }, { xp: 21, n: "Pollito travieso" },
  { xp: 45, n: "Pollo joven" }, { xp: 90, n: "Gran pollo" }, { xp: 180, n: "Pollo legendario ✨" }
];
const ITEMS = [
  { id: "lazo", slot: "head", e: "🎀", n: "Lazo", c: 40 },
  { id: "flor", slot: "head", e: "🌸", n: "Flor", c: 60 },
  { id: "gorrolana", slot: "head", e: "🧶", n: "Gorro de lana", c: 90 },
  { id: "gorro", slot: "head", e: "🥳", n: "Gorro fiesta", c: 120 },
  { id: "vaquero", slot: "head", e: "🤠", n: "Vaquero", c: 180 },
  { id: "corona", slot: "head", e: "👑", n: "Corona", c: 500 },
  { id: "bigote", slot: "face", e: "🥸", n: "Bigote", c: 70 },
  { id: "gafas", slot: "face", e: "😎", n: "Gafas de sol", c: 110 },
  { id: "gafascor", slot: "face", e: "😍", n: "Gafas corazón", c: 150 },
  { id: "pajarita", slot: "neck", e: "🎩", n: "Pajarita", c: 50 },
  { id: "bufanda", slot: "neck", e: "🧣", n: "Bufanda", c: 80 },
  { id: "collar", slot: "neck", e: "📿", n: "Collar perlas", c: 200 }
];
const COLORS = [
  { id: "amarillo", n: "Amarillo", c: 0, body: "#ffd93b", belly: "#ffec9e", dark: "#f2b705" },
  { id: "rosa", n: "Rosa", c: 60, body: "#ffb3cf", belly: "#ffe0ec", dark: "#f28bb0" },
  { id: "azul", n: "Azul", c: 60, body: "#9fd3ff", belly: "#dff1ff", dark: "#6fb4ec" },
  { id: "menta", n: "Menta", c: 60, body: "#9ff0cf", belly: "#e0fbef", dark: "#5fcfa2" },
  { id: "naranja", n: "Naranja", c: 60, body: "#ffb361", belly: "#ffe0bd", dark: "#f08c2a" },
  { id: "lila", n: "Lila", c: 80, body: "#cdb4ff", belly: "#ece3ff", dark: "#a88af0" },
  { id: "blanco", n: "Blanco", c: 100, body: "#ffffff", belly: "#f3efe8", dark: "#ddd5c8" },
  { id: "choco", n: "Chocolate", c: 100, body: "#b98158", belly: "#ecd0b4", dark: "#8a5a38" },
  { id: "dorado", n: "Dorado", c: 400, body: "#ffc629", belly: "#ffe8a3", dark: "#e8a200" }
];
const START_COINS = 100;   // regalo de aniversario 🎁
const stageOf = xp => { let i = 0; STAGES.forEach((s, k) => { if (xp >= s.xp) i = k; }); return i; };
function newPet() { return { name: CONFIG.petName || "Pollito", xp: 0, streak: 0, best: 0, lastBoth: null, care: {}, hugs: 0, born: Date.now(), lastBath: null, day: {}, coins: START_COINS, owned: {}, wear: {}, color: "amarillo" }; }
function ensureDay(p) {
  const t = dayKey(); if (!p.day || p.day.d !== t) p.day = { d: t, hugs: {}, play: {} };
  if (p.coins === undefined) p.coins = START_COINS; p.owned = p.owned || {}; p.wear = p.wear || {};
  return p;
}
const coinsOf = p => (p && p.coins !== undefined ? p.coins : START_COINS);

// ---- Dibujo (SVG) ----
function itemSVG(id) {
  switch (id) {
    case "lazo": return `<g transform="translate(130 76) rotate(18)"><path d="M0 0 L-15 -10 L-15 10 Z M0 0 L15 -10 L15 10 Z" fill="#ff5c8a"/><circle r="4.5" fill="#e8336b"/></g>`;
    case "flor": return `<g transform="translate(72 76)">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(8 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(8 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="6.5" fill="#ffb3d1"/>`).join("")}<circle r="5" fill="#ffd93b"/></g>`;
    case "gorrolana": return `<g transform="translate(100 78)"><path d="M-38 2 Q-40 -42 0 -44 Q40 -42 38 2 Z" fill="#4d7cff"/><path d="M-20 -38 L-20 -2 M-6 -43 L-6 -2 M8 -43 L8 -2 M22 -37 L22 -2" stroke="#3a63d6" stroke-width="3"/><rect x="-41" y="-6" width="82" height="14" rx="7" fill="#3a63d6"/><circle cy="-46" r="9" fill="#fff"/></g>`;
    case "gorro": return `<g transform="translate(106 72) rotate(12)"><path d="M-17 0 L0 -44 L17 0 Z" fill="#7b61ff"/><path d="M-12 -12 L12 -12 M-7 -27 L7 -27" stroke="#ffd93b" stroke-width="3.5"/><circle cy="-46" r="6" fill="#ff5c8a"/></g>`;
    case "vaquero": return `<g transform="translate(100 70)"><path d="M-24 2 Q-27 -32 -9 -28 Q0 -21 9 -28 Q27 -32 24 2 Z" fill="#b87945"/><rect x="-24" y="-8" width="48" height="7" fill="#6b3f1f"/><path d="M-50 2 Q-48 -8 -30 0 Q0 10 30 0 Q48 -8 50 2 Q46 12 0 12 Q-46 12 -50 2 Z" fill="#a0673a"/></g>`;
    case "corona": return `<g transform="translate(100 64)"><path d="M-21 0 L-21 -19 L-10 -8 L0 -26 L10 -8 L21 -19 L21 0 Z" fill="#ffc300" stroke="#e0a100" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="-11" r="3.5" fill="#ff4d5a"/><circle cx="-13" cy="-6" r="2.5" fill="#4dd2ff"/><circle cx="13" cy="-6" r="2.5" fill="#4dd2ff"/></g>`;
    case "bigote": return `<path d="M100 129 Q92 122 80 127 Q76 131 82 134 Q92 136 100 131 Q108 136 118 134 Q124 131 120 127 Q108 122 100 129 Z" fill="#5a3a22"/>`;
    case "gafas": return `<g><rect x="66" y="99" width="28" height="17" rx="7" fill="#15131a"/><rect x="106" y="99" width="28" height="17" rx="7" fill="#15131a"/><path d="M94 105 L106 105" stroke="#15131a" stroke-width="3.5"/><path d="M71 103 L80 103 M111 103 L120 103" stroke="#fff" stroke-width="2.5" opacity=".55" stroke-linecap="round"/></g>`;
    case "gafascor": { const H = "M0 7 C-15 -3 -15 -15 -6 -15 C-2 -15 0 -11 0 -9 C0 -11 2 -15 6 -15 C15 -15 15 -3 0 7Z"; return `<g><path d="${H}" transform="translate(80 112) scale(1.15)" fill="#ff3d7f" opacity=".92"/><path d="${H}" transform="translate(120 112) scale(1.15)" fill="#ff3d7f" opacity=".92"/><path d="M92 104 Q100 99 108 104" stroke="#d6205f" stroke-width="3" fill="none"/></g>`; }
    case "pajarita": return `<g transform="translate(100 152)"><path d="M0 0 L-17 -10 L-17 10 Z M0 0 L17 -10 L17 10 Z" fill="#2b3bd9"/><circle r="4.5" fill="#1b27a0"/></g>`;
    case "bufanda": return `<path d="M58 140 Q100 160 142 140 L143 152 Q100 172 57 152 Z" fill="#e63946"/><path d="M66 146 L70 156 M82 150 L85 160 M100 152 L100 162 M118 150 L115 160 M134 146 L130 156" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M118 150 L128 150 L132 178 L120 178 Z" fill="#e63946"/>`;
    case "collar": { let s = ""; for (let k = 0; k <= 11; k++) { const t = k / 11, x = 62 + 76 * t, y = 144 + 16 * Math.sin(Math.PI * t); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2" fill="#fbf7f0" stroke="#e4dccd" stroke-width="1"/>`; } return s + `<circle cx="100" cy="166" r="6" fill="#ff8fb8" stroke="#e46a98" stroke-width="1.5"/>`; }
  }
  return "";
}
function eyesSVG(expr) {
  const ink = "#2b1a10";
  if (expr === "happy") return `<path d="M71 110 Q80 98 89 110 M111 110 Q120 98 129 110" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  if (expr === "sleep") return `<path d="M71 106 Q80 114 89 106 M111 106 Q120 114 129 106" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  let s = `<g class="eyes"><circle cx="80" cy="107" r="7.5" fill="${ink}"/><circle cx="120" cy="107" r="7.5" fill="${ink}"/><circle cx="82.6" cy="104.2" r="2.6" fill="#fff"/><circle cx="122.6" cy="104.2" r="2.6" fill="#fff"/></g>`;
  if (expr === "sad") s += `<path d="M68 100 L88 93 M132 100 L112 93" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/><path class="tear" d="M73 118 Q70 124 73 127 Q76 124 73 118 Z" fill="#6cc3ff"/>`;
  if (expr === "hungry") s += `<path d="M71 96 Q79 90 88 93 M129 96 Q121 90 112 93" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return s;
}
function chickSVG(si, expr, wear, crackLevel, colorId) {
  const shadow = `<ellipse cx="100" cy="182" rx="${si ? 38 + si * 3 : 40}" ry="7" fill="rgba(0,0,0,.18)"/>`;
  if (si === 0) {
    const cracks = crackLevel ? `<path d="M64 112 L76 102 L84 114 L96 100 L106 114 L118 102 L128 112" stroke="#a88a60" stroke-width="3" fill="none" stroke-linejoin="round"/>` : "";
    return `<svg viewBox="0 0 200 200" class="chick">${shadow}<g class="egg-g ${crackLevel ? "shake" : ""}">
      <ellipse cx="100" cy="120" rx="47" ry="60" fill="#fff6e6" stroke="#e8d9bf" stroke-width="3"/>
      <ellipse cx="80" cy="96" rx="9" ry="7" fill="#ffe3b3"/><ellipse cx="118" cy="140" rx="11" ry="8" fill="#ffe3b3"/><ellipse cx="116" cy="92" rx="5" ry="4" fill="#ffe3b3"/>
      <ellipse cx="82" cy="84" rx="10" ry="16" fill="#fff" opacity=".6" transform="rotate(25 82 84)"/>${cracks}</g></svg>`;
  }
  const sc = [0, .74, .84, .94, 1.0, 1.06, 1.1][si];
  const C = COLORS.find(c => c.id === colorId) || COLORS[0];
  const { body, belly, dark } = C;
  const cls = expr === "happy" ? "happy" : expr === "sad" ? "sad" : "";
  const feet = si === 1 ? "" : `<path d="M86 166 L86 180 M79 180 L93 180 M114 166 L114 180 M107 180 L121 180" stroke="#ff9f1c" stroke-width="4.5" stroke-linecap="round"/>`;
  const tail = si >= 5 ? `<g fill="${dark}"><ellipse cx="146" cy="96" rx="10" ry="26" transform="rotate(20 146 96)"/><ellipse cx="156" cy="106" rx="10" ry="26" transform="rotate(45 156 106)"/><ellipse cx="160" cy="120" rx="9" ry="22" transform="rotate(70 160 120)"/></g>` : "";
  const head = si >= 4
    ? `<path d="M84 72 Q84 54 94 62 Q98 46 106 62 Q116 54 116 72 Z" fill="#ff4d5a"/>`
    : si >= 3 ? `<path d="M100 70 Q95 56 101 48 M100 70 Q107 58 114 58 M100 70 Q92 60 86 62" stroke="${dark}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`
    : si >= 2 ? `<path d="M100 70 Q96 58 102 52" stroke="${dark}" stroke-width="4" fill="none" stroke-linecap="round"/>` : "";
  const beakOpen = expr === "happy" ? 4 : 0;
  const beak = `<path d="M89 118 Q100 111 111 118 L100 127 Z" fill="#ff9f1c"/><g class="beak-low" style="transform-box:fill-box"><path d="M93 ${126 + beakOpen} L107 ${126 + beakOpen} L100 ${133 + beakOpen} Z" fill="#f08400"/></g>` +
    (beakOpen ? `<path d="M95 125 L105 125 L100 ${128 + beakOpen} Z" fill="#c2413d"/>` : "");
  const shellFront = si === 1 ? `<path d="M38 132 L50 118 L62 134 L76 116 L90 134 L104 116 L118 134 L132 116 L146 134 L162 118 L162 150 Q162 186 100 186 Q38 186 38 150 Z" fill="#fff6e6" stroke="#e8d9bf" stroke-width="3" stroke-linejoin="round"/>` : "";
  const shellHat = si === 1 && !wear.head ? `<path d="M74 78 Q100 44 126 78 L118 70 L110 80 L100 68 L90 80 L82 70 Z" fill="#fff6e6" stroke="#e8d9bf" stroke-width="3" stroke-linejoin="round"/>` : "";
  const bodyStroke = colorId === "blanco" ? ` stroke="#e6ded2" stroke-width="2"` : "";
  return `<svg viewBox="0 0 200 200" class="chick ${cls}">${shadow}
   <g transform="translate(100 182) scale(${sc}) translate(-100 -182)">
    ${feet}${tail}
    <g class="bodyg">
      <g class="wing wl"><ellipse cx="54" cy="128" rx="13" ry="24" fill="${dark}" transform="rotate(22 54 128)"/></g>
      <g class="wing wr"><ellipse cx="146" cy="128" rx="13" ry="24" fill="${dark}" transform="rotate(-22 146 128)"/></g>
      <circle cx="100" cy="116" r="52" fill="${body}"${bodyStroke}/>
      <ellipse cx="100" cy="136" rx="31" ry="25" fill="${belly}"/>
      <ellipse cx="80" cy="84" rx="12" ry="7" fill="#fff" opacity=".35" transform="rotate(-25 80 84)"/>
      ${head}${itemSVG(wear.neck)}
      ${eyesSVG(expr)}
      <ellipse cx="67" cy="123" rx="8.5" ry="5.5" fill="#ff8fa3" opacity="${expr === "sad" ? .3 : .75}"/>
      <ellipse cx="133" cy="123" rx="8.5" ry="5.5" fill="#ff8fa3" opacity="${expr === "sad" ? .3 : .75}"/>
      ${beak}${itemSVG(wear.face)}${itemSVG(wear.head)}${shellHat}
    </g>${shellFront}
   </g></svg>`;
}

// ---- Escena según la hora ----
let sceneSig = "";
function renderScene() {
  const h = hourIn(myTz), mode = (h >= 21 || h < 6) ? "night" : (h < 8 || h >= 19) ? "dawn" : "day";
  if (mode === sceneSig) return; sceneSig = mode;
  $("petScene").className = "scene " + (mode === "day" ? "" : mode);
  let sky = "";
  if (mode === "night") {
    for (let i = 0; i < 28; i++) sky += `<i class="star" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 55).toFixed(1)}%;animation-delay:${(Math.random() * 2.4).toFixed(2)}s"></i>`;
    sky += `<span class="sun">🌙</span>`;
  } else {
    sky += `<span class="sun">${mode === "dawn" ? "🌅" : "☀️"}</span><span class="cloud" style="top:40px;animation-delay:-8s">☁️</span><span class="cloud" style="top:90px;animation-delay:-24s;font-size:26px">☁️</span>`;
  }
  $("petSky").innerHTML = sky;
}

// ---- Estado y necesidades ----
let tempExpr = null, tempUntil = 0, petSig = "", preview = null, shopTab = "ropa";
function petInfo() {
  const p = state.pet || newPet(), today = dayKey();
  const day = p.day && p.day.d === today ? p.day : { hugs: {}, play: {} };
  const meT = p.care?.[who] === today, otT = p.care?.[other()] === today;
  const last = [p.care?.a, p.care?.b].filter(Boolean).sort().pop();
  const gap = last ? daysBetween(last, today) : 0;
  const hugsToday = (day.hugs.a || 0) + (day.hugs.b || 0), playToday = (day.play.a || 0) + (day.play.b || 0);
  const bathGap = p.lastBath ? daysBetween(p.lastBath, today) : 2;
  const food = meT && otT ? 100 : (meT || otT) ? 60 : gap <= 1 && last ? 25 : 8;
  const love = Math.min(100, 15 + hugsToday * 9);
  const fun = Math.min(100, 10 + playToday * 25);
  const clean = Math.max(5, 100 - bathGap * 30);
  const sad = !!last && gap >= 2;
  return { p, today, day, meT, otT, last, gap, food, love, fun, clean, sad };
}
function currentExpr(I) {
  if (Date.now() < tempUntil) return tempExpr;
  if ((I.p.nap || 0) > Date.now()) return "sleep";
  const h = hourIn(myTz);
  if (h >= 23 || h < 7) return "sleep";
  if (I.sad) return "sad";
  if (!I.meT && !I.otT) return "hungry";
  if (I.meT && I.otT) return "happy";
  return "normal";
}
const owns = (p, id) => !!(p.owned && p.owned[id]);
const colorOwned = (p, c) => c.c === 0 || owns(p, "color:" + c.id) || (c.id === "dorado" && stageOf(p.xp) === 6);
function renderPet() {
  renderScene();
  const I = petInfo(), p = I.p;
  const si = stageOf(p.xp), st = STAGES[si], nx = STAGES[si + 1];
  const expr = si === 0 ? "egg" : currentExpr(I);
  const wear = { ...(p.wear || {}) }; let color = p.color || "amarillo";
  if (preview && preview.kind === "item") { const it = ITEMS.find(x => x.id === preview.id); wear[it.slot] = it.id; }
  if (preview && preview.kind === "color") color = preview.id;
  const crack = si === 0 && (I.meT || I.otT) ? 1 : 0;
  const sig = [si, expr, JSON.stringify(wear), crack, color].join("|");
  if (sig !== petSig) { petSig = sig; $("petBox").innerHTML = chickSVG(si, expr, wear, crack, color); }
  $("petZzz").classList.toggle("hidden", expr !== "sleep");
  $("petCoins").textContent = "🪙 " + coinsOf(p);

  let m;
  if (si === 0) m = I.meT && I.otT ? "Hoy le habéis dado calor los dos 🥚✨" : I.meT ? `Se mueve… falta que ${name(other())} le dé calor 🔥` : I.otT ? `${name(other())} ya le ha dado calor. ¡Te toca!` : "Dadle calor los dos el mismo día para que se abra 🥚";
  else if (I.meT && I.otT) m = "¡Súper feliz! Hoy le habéis cuidado los dos 💞";
  else if (I.meT) m = `Contento. Esperando a que ${name(other())} le dé de comer…`;
  else if (I.otT) m = `${name(other())} ya le ha dado de comer. ¡Te toca! 🍓`;
  else if (I.sad) m = `Está triste, hace ${I.gap} días que no come 😢`;
  else m = "Tiene hambre 🥺";
  $("petName").textContent = p.name;
  $("petMood").textContent = st.n + " · " + m;
  $("petToday").innerHTML = `<span>${esc(name(who))} ${I.meT ? "✅" : "⏳"}</span><span>${esc(name(other()))} ${I.otT ? "✅" : "⏳"}</span>`;

  const col = v => v >= 60 ? "#6fdc9a" : v >= 30 ? "#ffc85c" : "#ff7a7a";
  $("petNeeds").innerHTML = [["🍓 Comida", I.food], ["💗 Cariño", I.love], ["⚽ Diversión", I.fun], ["🫧 Limpieza", I.clean]]
    .map(([n, v]) => `<div class="need"><div class="nl"><span>${n}</span><span>${v}%</span></div><div class="nb"><div style="width:${v}%;background:${col(v)}"></div></div></div>`).join("");

  $("petFeed").classList.toggle("done", I.meT); $("petFeed").classList.toggle("need", !I.meT);
  $("petFeed").querySelector("span").textContent = I.meT ? "Hecho ✅" : (si === 0 ? "Dar calor" : "Comer");
  $("petFeed").querySelector("i").textContent = si === 0 ? "🔥" : "🍓";

  $("petBar").style.width = nx ? Math.round((p.xp - st.xp) / (nx.xp - st.xp) * 100) + "%" : "100%";
  $("petNext").textContent = nx ? `${p.xp} días cuidándole juntos · faltan ${nx.xp - p.xp} para: ${nx.n}` : "¡Nivel máximo! 👑";
  const streakAlive = p.lastBoth && daysBetween(p.lastBoth, I.today) <= 1;
  $("stDays").textContent = p.xp; $("stStreak").textContent = streakAlive ? p.streak : 0; $("stHugs").textContent = p.hugs || 0;
  $("stages").innerHTML = STAGES.map((s, k) => `<span class="${k <= si ? "on" : ""}" title="${esc(s.n)}">${k <= si ? ["🥚", "🐣", "🐥", "🐤", "🐔", "🐓", "✨"][k] : "?"}<small>${s.xp}</small></span>`).join("");

  renderShop(p, si);
  $("dotPet").classList.toggle("hidden", I.meT);
}

// ---- Tienda ----
function renderShop(p, si) {
  document.querySelectorAll("#shopTabs button").forEach(b => b.classList.toggle("on", b.dataset.s === shopTab));
  const coins = coinsOf(p);
  let h = "";
  if (shopTab === "ropa") {
    const slots = [["head", "Cabeza"], ["face", "Cara"], ["neck", "Cuello"]];
    h = slots.map(([sl, sn]) => `<div class="slotname">${sn}</div><div class="shopgrid">` + ITEMS.filter(i => i.slot === sl).map(i => {
      const own = owns(p, i.id), on = p.wear && p.wear[sl] === i.id, pv = preview && preview.id === i.id;
      return `<button class="shopit ${on ? "on" : ""} ${pv ? "pv" : ""}" data-k="item" data-id="${i.id}"><i>${i.e}</i><b>${i.n}</b><span>${on ? "Puesto ✓" : own ? "Ponérselo" : i.c + " 🪙"}</span></button>`;
    }).join("") + `</div>`).join("");
  } else {
    h = `<div class="shopgrid">` + COLORS.map(c => {
      const own = colorOwned(p, c), on = (p.color || "amarillo") === c.id, pv = preview && preview.id === c.id;
      const lockGold = c.id === "dorado" && !own;
      return `<button class="shopit ${on ? "on" : ""} ${pv ? "pv" : ""}" data-k="color" data-id="${c.id}"><i class="sw" style="background:linear-gradient(135deg,${c.body} 55%,${c.dark} 55%)"></i><b>${c.n}</b><span>${on ? "Puesto ✓" : own ? "Usar" : c.c + " 🪙"}</span></button>`;
    }).join("") + `</div><div class="sub" style="font-size:12px">✨ El dorado es gratis cuando llegue a legendario.</div>`;
  }
  $("shopBody").innerHTML = h;
  $("shopBody").querySelectorAll(".shopit").forEach(b => b.onclick = () => shopTap(b.dataset.k, b.dataset.id));

  // Barra de compra (vista previa)
  if (preview) {
    const it = preview.kind === "item" ? ITEMS.find(x => x.id === preview.id) : COLORS.find(x => x.id === preview.id);
    const can = coins >= it.c;
    $("shopBuy").innerHTML = `<div class="buybar"><span>${preview.kind === "item" ? it.e : "🎨"} <b>${esc(it.n)}</b></span>
      <button class="btn primary" id="buyGo" ${can ? "" : "disabled"}>${can ? "Comprar · " + it.c + " 🪙" : "Te faltan " + (it.c - coins) + " 🪙"}</button>
      <button class="btn" id="buyX">✕</button></div>`;
    $("buyGo").onclick = buy; $("buyX").onclick = () => { preview = null; renderPet(); };
  } else $("shopBuy").innerHTML = `<div class="sub" style="font-size:13px;text-align:center">Toca algo para probárselo 👀</div>`;
}
function shopTap(kind, id) {
  const p = state.pet || newPet(), si = stageOf(p.xp);
  if (kind === "item") {
    const it = ITEMS.find(x => x.id === id);
    if (owns(p, id)) {
      preview = null;
      const on = p.wear && p.wear[it.slot] === id;
      petTx(q => { q.wear[it.slot] = on ? null : id; return q; }).then(() => { if (si) { react("happy", 2000); say(on ? "¡Así también estoy guapo!" : "¡Me encanta! 😍"); } }).catch(offline);
    } else { preview = preview && preview.id === id ? null : { kind, id }; if (!si) toast("La ropa se verá cuando nazca 🥚"); renderPet(); }
  } else {
    const c = COLORS.find(x => x.id === id);
    if (colorOwned(p, c)) {
      preview = null;
      petTx(q => { q.color = id; return q; }).then(() => { if (si) { react("happy", 2000); say("¡Nuevo look! 🎨"); } }).catch(offline);
    } else { preview = preview && preview.id === id ? null : { kind, id }; if (!si) toast("El color se verá cuando nazca 🥚"); renderPet(); }
  }
}
function buy() {
  if (!preview) return;
  const pv = preview, it = pv.kind === "item" ? ITEMS.find(x => x.id === pv.id) : COLORS.find(x => x.id === pv.id);
  const key = pv.kind === "item" ? it.id : "color:" + it.id;
  let fail = false;
  petTx(p => {
    if (p.coins < it.c) { fail = true; return null; }
    if (p.owned[key]) return null;
    p.coins -= it.c; p.owned[key] = true;
    if (pv.kind === "item") p.wear[it.slot] = it.id; else p.color = it.id;
    return p;
  }).then(r => {
    if (fail) return toast("No tenéis suficientes monedas 🪙");
    if (!r) return;
    preview = null; buzz([30, 40, 30]); hearts($("petBox"), "✨");
    react("happy", 2500); say(pv.kind === "item" ? "¡Gracias! ¡Me encanta! 😍" : "¡Qué color tan bonito! 🎨");
    sendMsg(`🛍️ Le he comprado ${pv.kind === "item" ? it.e + " " + it.n.toLowerCase() : "el color " + it.n.toLowerCase()} a ${r.name || "la mascota"}`, "pet");
  }).catch(offline);
}
document.querySelectorAll("#shopTabs button").forEach(b => b.onclick = () => { shopTab = b.dataset.s; preview = null; renderPet(); });

// ---- Monedas ----
function coinFx(n) { if (n > 0) fx("coinfx", "+" + n + " 🪙", "", 1300); }
function addCoins(n) { return petTx(p => { p.coins += n; return p; }).then(() => { toast("+" + n + " 🪙 para vuestra mascota"); }).catch(() => {}); }

// ---- Reacciones ----
function react(expr, ms) { tempExpr = expr; tempUntil = Date.now() + ms; renderPet(); setTimeout(renderPet, ms + 50); }
function anim(cls, ms) { const b = $("petBox"); b.classList.remove(cls); void b.offsetWidth; b.classList.add(cls); setTimeout(() => b.classList.remove(cls), ms); }
function fx(cls, e, style = "", ms = 1800) { const s = document.createElement("span"); s.className = "fx " + cls; s.textContent = e; s.style.cssText = style; $("petScene").appendChild(s); setTimeout(() => s.remove(), ms); }
function say(t, ms = 3200) { const b = $("petSay"); b.textContent = t; b.classList.remove("hidden"); b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; clearTimeout(say.t); say.t = setTimeout(() => b.classList.add("hidden"), ms); }
function phrase() {
  const I = petInfo(), o = name(other()), h = hourIn(myTz);
  const L = ["¡Pío pío! 🐤", "¡Os quiero a los dos! 💛", `Dile a ${o} que le echo de menos`, "Me encantan los mimos 🥰", "¿Jugamos? ⚽", "Cuando os veáis, ¡llevadme! 🧳", "¿Me compráis algo bonito? 🛍️"];
  if (h >= 23 || h < 7) L.push("Zzz… estaba soñando con vosotros 💤");
  if (!I.meT) L.push("Tengo hambre… 🍓");
  if (I.otT) L.push(`Hoy ${o} ya ha venido a verme 💕`);
  if (I.clean < 40) L.push("Huelo un poco a pollo… ¿un bañito? 🛁");
  if (state.main.next && state.main.next > Date.now()) { const d = Math.ceil((state.main.next - Date.now()) / DAY); L.push(`¡Faltan ${d} día${d === 1 ? "" : "s"} para que os veáis! ✈️`); }
  return L[Math.floor(Math.random() * L.length)];
}
const petTx = fn => S.tx("state/pet", p => fn(ensureDay(p || newPet())));
const hatched = () => stageOf((state.pet || {}).xp || 0) > 0;

$("petFeed").onclick = () => {
  const today = dayKey(); let evolved = false, both = false, wasEgg = false, gain = 0;
  petTx(p => {
    p.care = p.care || {};
    if (p.care[who] === today) return null;
    p.care[who] = today; evolved = false; both = false; wasEgg = stageOf(p.xp) === 0; gain = 10;
    if (p.care[other()] === today && p.lastBoth !== today) {
      const before = stageOf(p.xp);
      p.streak = p.lastBoth && daysBetween(p.lastBoth, today) === 1 ? (p.streak || 0) + 1 : 1;
      p.best = Math.max(p.best || 0, p.streak); p.xp += 1; p.lastBoth = today; both = true; gain += 15;
      if (p.streak % 7 === 0) gain += 50;   // premio por racha semanal
      evolved = stageOf(p.xp) > before;
    }
    p.coins += gain;
    return p;
  }).then(r => {
    if (!r) return toast("Hoy ya le has dado de comer 🍓"); buzz();
    if (!wasEgg) { fx("fall", "🍓", "", 900); setTimeout(() => { anim("eat", 1400); react("happy", 2600); }, 700); }
    else anim("wiggle", 1100);
    setTimeout(() => coinFx(gain), 800);
    if (evolved) { setTimeout(() => { hearts($("petBox"), "✨"); say(wasEgg ? "¡Hola papás! ¡He nacido! 🐣" : "¡Mirad cuánto he crecido! ✨", 4500); }, 900); toast("✨ ¡Ha evolucionado! ✨", 3500); sendMsg(wasEgg ? "🐣 ¡Nuestro huevo se ha abierto! Ven a verle" : "✨ Nuestra mascota ha evolucionado", "pet"); }
    else if (both) { setTimeout(() => say(r.streak % 7 === 0 ? `¡${r.streak} días seguidos! +50 🪙 🔥` : "¡Hoy me habéis cuidado los dos! 💞"), 900); }
    else { setTimeout(() => say(wasEgg ? "*se mueve un poquito*" : "¡Ñam! Gracias 🥰"), 900); sendMsg((wasEgg ? "🔥 Ya le he dado calor al huevo" : "🍓 Ya le he dado de comer a " + (r.name || "la mascota")) + ", ¡te toca!", "pet"); }
  }).catch(offline);
};
$("petHug").onclick = () => {
  hearts($("petBox"), "💗"); buzz(20);
  if (hatched()) { react("happy", 1800); say(phrase()); } else anim("wiggle", 600);
  let g = 0;
  petTx(p => { p.hugs = (p.hugs || 0) + 1; p.day.hugs[who] = (p.day.hugs[who] || 0) + 1; g = p.day.hugs[who] <= 10 ? 1 : 0; p.coins += g; return p; }).then(() => coinFx(g)).catch(offline);
};
$("petPlay").onclick = () => {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  fx("ball", "⚽", "", 1400); setTimeout(() => { anim("jump", 1200); react("happy", 2000); }, 450); buzz(30);
  setTimeout(() => say(["¡Gol! ⚽", "¡Otra, otra!", "¡Qué divertido! 🤸"][Math.floor(Math.random() * 3)]), 900);
  let g = 0;
  petTx(p => { p.day.play[who] = (p.day.play[who] || 0) + 1; g = p.day.play[who] <= 5 ? 3 : 0; p.coins += g; return p; }).then(() => setTimeout(() => coinFx(g), 900)).catch(offline);
};
$("petBath").onclick = () => {
  if (!hatched()) return toast("Primero tiene que nacer 🥚");
  for (let i = 0; i < 9; i++) setTimeout(() => fx("bub", "🫧", `left:${30 + Math.random() * 40}%`), i * 120);
  anim("wiggle", 1100); setTimeout(() => { react("happy", 2000); say("¡Qué limpito! ✨"); }, 700); buzz(30);
  let g = 0;
  petTx(p => { g = p.lastBath === dayKey() ? 0 : 5; p.lastBath = dayKey(); p.coins += g; return p; }).then(() => setTimeout(() => coinFx(g), 900)).catch(offline);
};
$("petBox").onclick = () => $("petHug").click();
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
    S.merge("quiz/main", { gu: { [ot]: { [b.dataset.i]: { ok } } } }); buzz(); if (ok) addCoins(5);
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
  $("dotGames").classList.toggle("hidden", !(pend.length || toGuess.length || tttMyTurn()));
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
    if (res === "win") addCoins(15); else if (res === "draw") addCoins(5);
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
    const m = memList.find(x => x.id === b.dataset.go); if (!m || !memMap) return;
    window.scrollTo({ top: 0, behavior: "smooth" }); memMap.setView([m.lat, m.lng], 12);
    memLayer.eachLayer(l => { const ll = l.getLatLng(); if (ll.lat === m.lat && ll.lng === m.lng) setTimeout(() => l.openPopup(), 400); });
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
  addCoins(20);
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
  petTx(p => { p.nap = Date.now() + 8 * 36e5; return p; }).catch(() => {});
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
  $("fgInfo").textContent = got >= 30 ? "Hoy ya habéis ganado el máximo (30 🪙). ¡Juega por diversión!" : `30 segundos · hoy puedes ganar ${30 - got} 🪙 más`;
}
$("fgPlay").onclick = () => {
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
  const score = fg.score; let gain = 0;
  petTx(p => { p.day.game = p.day.game || {}; const got = p.day.game[who] || 0; gain = Math.max(0, Math.min(Math.floor(score / 2), 30 - got)); p.day.game[who] = got + gain; p.coins += gain; p.best_game = Math.max(p.best_game || 0, score); return p; })
    .then(() => {
      const best = (state.pet && state.pet.best_game) || score;
      $("fgMsg").innerHTML = `<div style="font-size:40px">${score >= 20 ? "🏆" : score >= 10 ? "🥳" : "🐤"}</div>¡Has atrapado <b>${score}</b>!<br>${gain ? `+${gain} 🪙 para la mascota` : "Hoy ya no ganas más monedas"}<br><small>Récord: ${best}</small>
        <button class="btn primary" id="fgAgain">Otra vez 🔁</button><button class="btn" id="fgOut">Salir</button>`;
      $("fgAgain").onclick = () => $("fgPlay").click(); $("fgOut").onclick = fgClose;
      if (score >= 15) sendMsg(`🍓 He atrapado ${score} fresas en el minijuego. ¡Supérame!`, "game");
    }).catch(() => { $("fgMsg").innerHTML = `¡Has atrapado <b>${score}</b>!<button class="btn" id="fgOut">Salir</button>`; $("fgOut").onclick = fgClose; });
}
function fgClose() { if (fg) { fg.run = false; cancelAnimationFrame(fg.raf); } fg = null; $("fgView").classList.add("hidden"); document.body.style.overflow = ""; fgInfo(); }
$("fgQuit").onclick = fgClose;

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
    ["😊", "Sinceros", "7 días diciendo cómo estáis", moodDays, 7]
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

async function start() {
  if (S.demo) $("demoBanner").classList.remove("hidden");
  if (S.needsLogin) {
    try { await S.init(loginUI); } catch (e) { console.error(e); toast("No se pudo conectar. Revisa config.js", 5000); return; }
    $("loginView").classList.add("hidden");
    who = S.userEmail === (CONFIG.emails.a || "").toLowerCase() ? "a" : "b"; ls.set("who", who);
  } else if (who !== "a" && who !== "b") await pickWho();
  if (who === "b" && !ls.get("introSeen")) openIntro();
  const t = ls.get("tab"); if (TABS.includes(t)) showTab(t);
  tick(); renderQuestion(); renderPet(); renderQuiz(); renderTTT(); renderMoods([]); drawWheel(); fgInfo(); renderLetters([]); renderCaps([]); renderDates([]);
  if (!S.needsLogin) { try { await S.init(); } catch (e) { console.error(e); toast("No se pudo conectar. Revisa config.js", 5000); return; } }
  S.merge("state/main", { tz: { [who]: myTz } });
  S.watchDoc("state/main", d => { state.main = d || {}; tick(); renderDates(); });
  S.watchDoc("state/pet", d => { state.pet = d; renderPet(); fgInfo(); });
  S.watchDoc("quiz/main", d => { state.quiz = d; renderQuiz(); });
  S.watchDoc("state/ttt", d => { state.ttt = d; renderTTT(); renderQuiz(); });
  S.watchDoc("state/wheel", drawWheel);
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
