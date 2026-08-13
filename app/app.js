"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   WingsAhead — core: helpers · RPC client · router · theme gallery.
   House rules: vanilla JS, English-only UI, esc() on EVERY interpolation,
   DD/MM/YYYY display / ISO storage, attach-once listeners.
   ══════════════════════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ISO YYYY-MM-DD → DD/MM/YYYY for display (storage stays ISO) */
function fmtD(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "—";
}
function fmtDT(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() +
         " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function round1(v) { return Math.round(v * 10) / 10; }

/* ── toast ── */
let toastTimer = null;
function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), isErr ? 5200 : 2600);
}

/* ── RPC client — the ONLY way the app talks to the database ── */
async function rpc(fn, args) {
  const cfg = (typeof WA_CONFIG === "object" && WA_CONFIG) || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    throw new Error("config.js is not filled in (SUPABASE_URL / SUPABASE_ANON_KEY)");
  }
  let res;
  try {
    res = await fetch(cfg.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args || {}),
    });
  } catch (e) {
    throw new Error("Network error — check your connection and try again");
  }
  if (!res.ok) {
    let msg = "Request failed (" + res.status + ")";
    try {
      const j = await res.json();
      if (j && j.message) msg = String(j.message).replace(/^WA:\s*/, "");
    } catch (e) { /* body not json */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ── router: #t=<token> → whoami → role view ── */
const WA = { me: null, token: null };

function getToken() {
  const m = /[#&]t=([A-Za-z0-9_-]{10,})/.exec(location.hash);
  return m ? m[1] : null;
}

function renderLanding(el, invalid) {
  el.innerHTML = `
    <div class="landing">
      <div class="big" aria-hidden="true">&#9992;</div>
      <h2>${invalid ? "This link is not active" : "WingsAhead"}</h2>
      <p>${invalid
        ? "The personal link you used is invalid or has been revoked. No data is shown."
        : "This application works only through personal links."}
        <br><br>Please contact the squadron CO to receive your personal link.</p>
    </div>`;
}

async function route() {
  const view = $("view");
  WA.token = getToken();
  if (!WA.token) { renderLanding(view, false); return; }
  view.innerHTML = `<div class="landing"><p>Loading…</p></div>`;
  let me;
  try {
    me = await rpc("whoami", { p_token: WA.token });
  } catch (e) {
    view.innerHTML = `
      <div class="landing">
        <div class="big" aria-hidden="true">&#9888;</div>
        <h2>Cannot reach the server</h2>
        <p>${esc(e.message)}</p>
      </div>`;
    return;
  }
  if (!me || !me.role) { renderLanding(view, true); return; }
  WA.me = me;
  if (me.role === "student") WA.renderStudent(view, me);
  else if (me.role === "instructor") WA.renderInstructor(view, me);
  else WA.renderAdmin(view, me);
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);

/* ══════════════════════════════════════════════════════════════════════════
   THEME GALLERY — ported from FDMS (same 8 palettes, same behaviour).
   PALETTES is the JS half of the "PALETTE CATALOGUE" section in styles.css
   (same order, same ids). Each entry only describes the CARD; token values
   live in the CSS blocks. ADDING A PALETTE = one CSS block + one entry here.
     id    — matches html[data-theme="<id>"]
     mode  — "light" | "dark"; drives html[data-mode] and the ☀/☾ switch
     desc  — one line on the card
     sw    — the four card swatches: bg · panel-2 · text · accent
   ══════════════════════════════════════════════════════════════════════════ */
const PALETTES = [
  { id: "obsidian", label: "Obsidian", mode: "dark",
    desc: "The original night deck — navy graphite, sky-blue accent.",
    sw: ["#0e1420", "#1c2a3d", "#e8eef6", "#58b0ff"] },
  { id: "slate", label: "Slate", mode: "light",
    desc: "Daylight briefing room — cool grey paper, deep blue accent.",
    sw: ["#eef2f7", "#f0f4f9", "#1a2733", "#1b5fa6"] },
  { id: "summit", label: "Summit", mode: "light",
    desc: "Alpine white with a steel-blue edge — print-like clarity.",
    sw: ["#f6f8fa", "#eef2f6", "#16202a", "#235d8c"] },
  { id: "ridgeline", label: "Ridgeline", mode: "light",
    desc: "Warm green tint, moss accent — the low-fatigue daylight option.",
    sw: ["#f2f5ee", "#edf2e6", "#1b2318", "#3d6435"] },
  { id: "mesa", label: "Mesa", mode: "light",
    desc: "Sand and ivory, terracotta accent — desert-strip warmth.",
    sw: ["#f7f2e9", "#f3ece0", "#241b12", "#96431f"] },
  { id: "tidal", label: "Tidal", mode: "dark",
    desc: "Deep navy water, ice-cyan accent — night ops, high focus.",
    sw: ["#081727", "#163149", "#e6f1fb", "#63d3ec"] },
  { id: "wilderness", label: "Wilderness", mode: "dark",
    desc: "Olive field kit, brass-gold accent — dispersal at dusk.",
    sw: ["#151a12", "#252d1f", "#eef2e6", "#d8bb52"] },
  { id: "aegean", label: "Aegean", mode: "dark",
    desc: "Squadron colours — blue-black sea, white-blue accent.",
    sw: ["#060d1a", "#132135", "#eef4ff", "#a8d4ff"] },
];

{
  const KEY = "wa-palette", KEY_MODE = "wa-palmode";
  const LAST = { light: "wa-pal-light", dark: "wa-pal-dark" };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const byId = (id) => PALETTES.find((p) => p.id === id) || null;
  const firstOf = (mode) => PALETTES.find((p) => p.mode === mode);

  const btn = $("theme-btn");        // ☀ / ☾  — quick light↔dark flip
  const gal = $("theme-gal-btn");    // ◑ Theme — opens the gallery
  let cur = PALETTES[0], pop = null, grid = null, modeBtn = null;

  function initialId() {
    const saved = byId(ls.get(KEY));
    return saved ? saved.id : "obsidian";
  }

  function apply(id, persist) {
    const p = byId(id) || PALETTES[0];
    const root = document.documentElement;
    root.setAttribute("data-theme", p.id);
    root.setAttribute("data-mode", p.mode);
    for (const c of Array.from(root.classList)) if (c.indexOf("pal-") === 0) root.classList.remove(c);
    root.classList.add("pal-" + p.id);
    root.classList.toggle("light", p.mode === "light");
    cur = p;
    btn.textContent = p.mode === "light" ? "☾" : "☀";
    btn.title = p.mode === "light"
      ? "Switch to the dark palette (" + (byId(ls.get(LAST.dark)) || firstOf("dark")).label + ")"
      : "Switch to the light palette (" + (byId(ls.get(LAST.light)) || firstOf("light")).label + ")";
    if (gal) gal.title = "Theme gallery — " + p.label + " (" + p.mode + ")";
    if (persist !== false) {
      ls.set(KEY, p.id);
      ls.set(KEY_MODE, p.mode);
      ls.set(LAST[p.mode], p.id);
    }
    mark();
  }

  function flipMode() {
    const want = cur.mode === "light" ? "dark" : "light";
    apply((byId(ls.get(LAST[want])) || firstOf(want)).id);
  }

  function mark() {
    if (!grid) return;
    for (const c of grid.children) {
      const on = c.dataset.pal === cur.id;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
      c.querySelector(".thm-tick").textContent = on ? "✓" : "";
    }
    if (modeBtn) {
      modeBtn.textContent = cur.mode === "light" ? "☾ Dark" : "☀ Light";
      modeBtn.title = "Quick switch to the last used " + (cur.mode === "light" ? "dark" : "light") + " palette";
    }
  }

  function build() {
    pop = document.createElement("div");
    pop.id = "theme-pop";
    pop.className = "thm-pop hidden";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Theme gallery");
    pop.innerHTML =
      `<div class="thm-head"><h3 id="thm-h">Theme</h3>
         <span class="thm-sub">${PALETTES.length} palettes</span>
         <button type="button" class="thm-modebtn" id="thm-mode"></button></div>
       <div class="thm-grid" id="thm-grid" role="listbox" aria-labelledby="thm-h"></div>`;
    document.body.appendChild(pop);
    grid = $("thm-grid");
    modeBtn = $("thm-mode");
    grid.innerHTML = PALETTES.map((p) => `
      <button type="button" class="thm-card" role="option" aria-selected="false"
              data-pal="${esc(p.id)}" title="${esc(p.label)} — ${esc(p.desc)}">
        <span class="thm-sw" aria-hidden="true">${p.sw.map((c) =>
          `<i style="background:${esc(c)}"></i>`).join("")}</span>
        <span class="thm-nm">${esc(p.label)}<span class="thm-tag">${esc(p.mode)}</span>
          <span class="thm-tick"></span></span>
        <span class="thm-d">${esc(p.desc)}</span>
      </button>`).join("");
    grid.addEventListener("click", (ev) => {
      const card = ev.target.closest(".thm-card");
      if (card) apply(card.dataset.pal);
    });
    grid.addEventListener("keydown", (ev) => {
      const cards = Array.from(grid.children);
      const here = document.activeElement && document.activeElement.closest(".thm-card");
      const i = cards.indexOf(here);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[ev.key];
      if (!step) return;
      ev.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, i + step))].focus();
    });
    modeBtn.addEventListener("click", flipMode);
    pop.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { close(); gal.focus(); } });
    document.addEventListener("click", (ev) => {
      if (pop.classList.contains("hidden")) return;
      if (ev.target.closest("#theme-pop, #theme-gal-btn")) return;
      close();
    });
    window.addEventListener("resize", () => { if (!pop.classList.contains("hidden")) place(); });
  }

  function place() {
    const r = gal.getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 8) + "px";
    pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + "px";
  }

  function close() {
    if (!pop) return;
    pop.classList.add("hidden");
    gal.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (!pop) build();
    if (pop.classList.contains("hidden")) {
      mark();
      pop.classList.remove("hidden");
      place();
      gal.setAttribute("aria-expanded", "true");
      const on = grid.querySelector(".thm-card.is-on") || grid.firstElementChild;
      if (on) on.focus();
    } else close();
  }

  apply(initialId());   /* re-applies what the <head> script already painted */
  btn.onclick = flipMode;
  if (gal) {
    gal.setAttribute("aria-haspopup", "dialog");
    gal.setAttribute("aria-expanded", "false");
    gal.onclick = toggle;
  }
}

/* ── shared record metric helpers (used by instructor + admin views) ── */
WA.recStats = function (rec) {
  const r = rec || {};
  const list = (k) => Array.isArray(r[k]) ? r[k] : [];
  const evals = list("evaluations");
  const grades = evals.map((e) => Number(e.grade)).filter((g) => isFinite(g));
  const mean = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null;
  return {
    nfs: (r.nfs && isFinite(Number(r.nfs.count))) ? Number(r.nfs.count) : 0,
    nfsDates: (r.nfs && Array.isArray(r.nfs.dates)) ? r.nfs.dates : [],
    sms: list("sms").length,
    fail: list("fail").length,
    almost_good: list("almost_good").length,
    airsickness: list("airsickness").length,
    evals: evals.length,
    evalMean: mean === null ? null : round1(mean),
    solos: list("solo_flights").length,
    progress: list("progress_tests").length,
    aptitude: list("aptitude_exams").length,
    pending: WA.pendingItems(r).length,
  };
};

/* every pending-flagged entry, described — for highlights and badges */
WA.pendingItems = function (rec) {
  const r = rec || {};
  const out = [];
  const walk = (k, label, mk) => {
    (Array.isArray(r[k]) ? r[k] : []).forEach((e, i) => {
      if (e && e.pending) out.push(label + ": " + mk(e, i));
    });
  };
  walk("sms", "SMS", (e) => "entered " + fmtD(e.entrance_date) + (e.exit_date ? ", exit " + fmtD(e.exit_date) : ", still open"));
  walk("fail", "FAIL", (e) => (e.item || "item") + (e.date ? " (" + fmtD(e.date) + ")" : ""));
  walk("almost_good", "ALMOST GOOD", (e) => (e.item || "item") + (e.date ? " (" + fmtD(e.date) + ")" : ""));
  walk("evaluations", "Evaluation", (e) => (e.with ? "with " + e.with : "entry") + (e.date ? " (" + fmtD(e.date) + ")" : ""));
  walk("progress_tests", "Progress test", (e) => (e.date ? fmtD(e.date) : "entry") + (e.by ? " by " + e.by : ""));
  walk("aptitude_exams", "Aptitude exam", (e) => (e.date ? fmtD(e.date) : "entry") + (e.by ? " by " + e.by : ""));
  return out;
};

WA.personName = function (p, withRank) {
  const bits = [];
  if (withRank && p.rank) bits.push(p.rank);
  bits.push(p.last_name || "");
  if (p.first_name) bits.push(p.first_name);
  return bits.join(" ").trim();
};

/* copy to clipboard with fallback */
WA.copyText = async function (text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e2) { return false; }
  }
};
