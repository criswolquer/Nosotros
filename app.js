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
const TABS = ["home", "pet", "games", "mem"];
function showTab(t) {
  TABS.forEach(x => $("tab-" + x).classList.toggle("hidden", x !== t));
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  ls.set("tab", t); window.scrollTo(0, 0);
  if (t === "home") $("dotHome").classList.add("hidden");
  if (t === "pet") setTimeout(() => { renderPet(); if (stageOf((state.pet || {}).xp || 0) > 0) say(phrase()); }, 350);
}
document.querySelectorAll("nav button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
document.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b));
  $("g-quiz").classList.toggle("hidden", b.dataset.g !== "quiz");
  $("g-ttt").classList.toggle("hidden", b.dataset.g !== "ttt");
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
  $("chat").innerHTML = items.length ? items.map(m => `<div class="bub ${m.from === who ? "me" : "them"}">${esc(m.text)}<span class="t">${new Date(m.at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>`).join("")
    : '<div class="empty">Aún no hay mensajes. Pulsa "Pienso en ti" ✨</div>';
  $("chat").scrollTop = $("chat").scrollHeight;
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
  $("question").textContent = QUESTIONS[qIndex()];
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

// ================= Recuerdos =================
let pendingPhoto = null;
$("memPhoto").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
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
  S.add("memories", { from: who, text, photo: pendingPhoto, at: Date.now() });
  sendMsg("📸 He guardado un recuerdo nuevo", "mem");
  $("memText").value = ""; pendingPhoto = null; $("photoName").textContent = ""; $("memPhoto").value = ""; toast("Guardado 💕");
};
function renderMem(list) {
  $("memories").innerHTML = list.length ? list.map(m => `<div class="mem">
    ${m.from === who ? `<button class="del" data-id="${esc(m.id)}">Borrar</button>` : ""}
    <div class="date">${esc(name(m.from))} · ${new Date(m.at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</div>
    ${m.photo ? `<img src="${m.photo}" alt="" loading="lazy">` : ""}
    ${m.text ? `<div class="text">${esc(m.text)}</div>` : ""}</div>`).join("") : '<div class="empty">Aún no hay recuerdos. Guardad el primero ✨</div>';
  $("memories").querySelectorAll(".del").forEach(b => b.onclick = () => { if (confirm("¿Borrar este recuerdo?")) S.del("memories/" + b.dataset.id); });
}

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

async function start() {
  if (S.demo) $("demoBanner").classList.remove("hidden");
  if (who !== "a" && who !== "b") await pickWho();
  if (who === "b" && !ls.get("introSeen")) openIntro();
  const t = ls.get("tab"); if (TABS.includes(t)) showTab(t);
  tick(); renderQuestion(); renderPet(); renderQuiz(); renderTTT();
  try { await S.init(); } catch (e) { console.error(e); toast("No se pudo conectar. Revisa config.js", 5000); return; }
  S.merge("state/main", { tz: { [who]: myTz } });
  S.watchDoc("state/main", d => { state.main = d || {}; tick(); });
  S.watchDoc("state/pet", d => { state.pet = d; renderPet(); });
  S.watchDoc("quiz/main", d => { state.quiz = d; renderQuiz(); });
  S.watchDoc("state/ttt", d => { state.ttt = d; renderTTT(); renderQuiz(); });
  S.watchCol("messages", l => { state.msgs = l; renderChat(l); }, 40);
  S.watchCol("memories", renderMem, 100);
  watchAnswers();
  setInterval(() => { tick(); watchAnswers(); renderPet(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); watchAnswers(); renderPet(); } });
}
start();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
