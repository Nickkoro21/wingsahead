"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   Wings Ahead — core: helpers · RPC client · router · theme gallery.
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

/* ══════════════════════════════════════════════════════════════════════════
   THE TWO PASS MARKS, HOISTED (round 15b, R15 verify item 14).
   ──────────────────────────────────────────────────────────────────────────
   The numbers and the doctrine that settles them belong to «THE GRADE SCALE»
   further down (round 11 / round 15) and are documented there in full — but
   the CONSTANT STRINGS of this file are object literals evaluated at LOAD, and
   a tooltip a thousand lines above the definition cannot read a number that
   does not exist yet. So the three lines that carry the numbers stand HERE, at
   the top, where every literal below can build its sentence from them. That is
   the whole of the change: nothing about the numbers themselves moved, and the
   doctrine — WHY there are two, what did NOT move with them, and the MIRROR to
   db/schema.sql — stays where it was written.
   ══════════════════════════════════════════════════════════════════════════ */
WA.GRADE_PASS_MIN = 60;
/* the ground exams — the 8 fixed groups AND the Weekly series, which are
   ground exams too and are marked the same way */
WA.EXAM_PASS_MIN = 80;
/* WHICH NUMBER JUDGES THIS SECTION. One function, so a chip, a tooltip, a CSV
   cell and the operative-trial rule can never quote different marks. */
WA.passMin = function (sec) {
  return sec === "exams" ? WA.EXAM_PASS_MIN : WA.GRADE_PASS_MIN;
};

function getToken() {
  const m = /[#&]t=([A-Za-z0-9_-]{10,})/.exec(location.hash);
  return m ? m[1] : null;
}

/* ENTER-ON-BEHALF sub-route — #t=<admin token>&co=rec:<uuid> (student record)
   or &co=prop:<uuid> (an instructor's proposals). The token stays in the hash,
   so Back / reload / bookmark never lose the admin session. Only the admin
   role acts on it: for anybody else route() ignores it (the admin editing UI
   is unreachable, not merely hidden). */
function getCoTarget() {
  const m = /[#&]co=(rec|prop):([0-9a-fA-F-]{36})/.exec(location.hash);
  return m ? { kind: m[1], id: m[2] } : null;
}
WA.coHash = function (kind, id) {
  return "#t=" + WA.token + "&co=" + kind + ":" + id;
};
WA.adminHash = function () { return "#t=" + WA.token; };

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 20 — THE INSTRUCTOR'S TWO DOORS ARE A SUB-ROUTE.
   ──────────────────────────────────────────────────────────────────────────
   RULING (2026-08-27): «το landing page να έχει τα στοιχεία αυτού που μπαίνει,
   ώστε να κάνει και επιβεβαίωση, και να έχουμε μήνυμα καλωσορίσματος. Και μετά
   δύο επιλογές: My currency, Student Assessment. Τώρα είναι μπερδεμένα.»

   `#t=<token>`             → the welcome page: who you are, and the two doors
   `#t=<token>&v=assess`    → Student Assessment
   `#t=<token>&v=currency`  → My currency

   IT IS THE HASH AND NOT A VARIABLE, so a door can be bookmarked, reached by
   Back and reloaded — the same three properties the `&co=` sub-route was built
   for, and the same regex shape it uses.

   BUT A DOOR IS NOT A NEW PAGE. route() re-fetches the whole payload and
   rebuilds the DOM; doing that when only the door changed would throw away
   whatever is half-typed in the other one. So the instructor view registers
   WA._insDoor and route() offers it the change FIRST — see route(). */
WA.DOORS = ["assess", "currency"];
function getDoor() {
  const m = /[#&]v=([a-z]+)/.exec(location.hash);
  return (m && WA.DOORS.indexOf(m[1]) >= 0) ? m[1] : "";
}
WA.doorFromHash = getDoor;
/* the hash for one door of the link that is open — the co target rides along,
   so the admin's twin keeps its own doors without a second hash shape */
WA.doorHash = function (door) {
  const co = getCoTarget();
  return "#t=" + WA.token + (co ? "&co=" + co.kind + ":" + co.id : "") +
         (door ? "&v=" + door : "");
};

function renderLanding(el, invalid) {
  el.innerHTML = `
    <div class="landing">
      <div class="big" aria-hidden="true">&#9992;</div>
      <h2>${invalid ? "This link is not active" : "Wings Ahead"}</h2>
      <p>${invalid
        ? "The personal link you used is invalid or has been revoked. No data is shown."
        : "This application works only through personal links."}
        <br><br>Please contact the squadron administration to receive your personal link.</p>
    </div>`;
}

/* leaving a view: stop everything the previous one had running, so a timer or
   a key handler can never fire against a DOM that is no longer there */
function teardownView() {
  if (WA._admTimer) { clearInterval(WA._admTimer); WA._admTimer = null; }
  /* ROUND 14 — the left panel keeps a scroll listener on `window`, which
     outlives the DOM it points at unless it is told to stop. One slot, because
     one view at a time mounts one panel. */
  if (WA._nav) { WA._nav.destroy(); WA._nav = null; }
  WA._adminState = null;
  WA._admNav = null;
  WA._stuState = null;
  WA._insState = null;
  /* ROUND 19 — and the closure that answers «is his currency unsaved?». It is a
     function over the view being torn down, so the once-attached beforeunload
     hook must not keep asking it about rows that no longer exist. */
  WA._insCurDirty = null;
  /* the instructor print builder is a closure over the view that is going
     away — the once-attached beforeprint hook must not call a dead one */
  WA._insPrint = null;
  /* ROUND 20 — and the door switcher, which is a closure over the same view */
  WA._insDoor = null;
  WA._insKey = null;
}

async function route() {
  const view = $("view");
  /* ── ROUND 20 — THE DOOR CHANGES WITHOUT THE PAGE RELOADING ──────────────
     A door is a sub-route of the SAME view, so the mounted instructor form is
     offered the change before anything is torn down. It takes it only when the
     link is the same one it was built for (token + co target); anything else —
     a different token pasted into the bar, the admin leaving an on-behalf
     detour — falls through to the full route below and rebuilds.
     THIS IS ALSO WHAT MAKES BACK WORK: the door buttons only ever set
     location.hash, so a click, the Back button, a bookmark and a reload all
     arrive here through the one path. */
  if (WA._insDoor && WA._insDoor(getToken(), getCoTarget(), getDoor())) return;
  teardownView();
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
  const co = getCoTarget();
  if (me.role === "admin" && co) {
    /* the admin entering on behalf of somebody — the SAME form, bound to them */
    if (co.kind === "rec") WA.renderStudent(view, null, { asCO: true, targetId: co.id });
    else WA.renderInstructor(view, null, { asCO: true, targetId: co.id });
    return;
  }
  if (me.role === "student") WA.renderStudent(view, me, null);
  else if (me.role === "instructor") WA.renderInstructor(view, me, null);
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
const DEFAULT_PAL = "slate";   /* round-2 decision — mirrored in the <head> pre-paint script */
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
  const fallback = () => byId(DEFAULT_PAL) || PALETTES[0];

  const btn = $("theme-btn");        // ☀ / ☾  — quick light↔dark flip
  const gal = $("theme-gal-btn");    // ◑ Theme — opens the gallery
  let cur = fallback(), pop = null, grid = null, modeBtn = null;

  function initialId() {
    const saved = byId(ls.get(KEY));
    return saved ? saved.id : DEFAULT_PAL;
  }

  function apply(id, persist) {
    const p = byId(id) || fallback();
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

  /* re-applies what the <head> script already painted. persist=false on boot:
     a visitor who never opened the gallery is NOT pinned to today's default —
     only an explicit choice (card click / mode flip) is written to storage. */
  apply(initialId(), false);
  btn.onclick = flipMode;
  if (gal) {
    gal.setAttribute("aria-haspopup", "dialog");
    gal.setAttribute("aria-expanded", "false");
    gal.onclick = toggle;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   EVALUATION IDENTITY — the eight Phase II checkrides of the stage.
   Every evaluation entry carries one of these ids, which is what makes the
   comparison possible: the same evaluation is the same x position for every
   student. There is deliberately NO free "Other" evaluation — a progress
   check flight is an FPC and has its own section (round-3 ruling).
   Names are the printed syllabus names (FDMS flowchart2.json).
   MIRROR: the same id list is validated server-side in db/schema.sql
   (wa.eval_ids). Change one, change the other.
     id     — stored in evaluations[i].evaluation (= the sortie code)
     cat    — syllabus track, for the per-category plot
     order  — SYLLABUS ORDER, and since round 6 a RULE and not only an axis:
              it is the position of the checkride in WA_EVAL_ORDER, which the
              generator reads off the FILE ORDER of the sortie entries in
              flowchart2.json — the order of the printed Training Flow Chart.
              A later evaluation cannot be FILLED while an earlier one is
              unflown, on this side and on the server's alike.
   ══════════════════════════════════════════════════════════════════════════ */
WA.EVAL_ORDER = (typeof WA_EVAL_ORDER !== "undefined" && Array.isArray(WA_EVAL_ORDER))
  ? WA_EVAL_ORDER.slice()
  : ["C4590", "C4790", "C5090", "C5490", "I4490", "I4890", "F4690", "N4690"];
WA.EVALUATIONS = [
  { id: "C4590", cat: "contact",        name: "Contact checkride" },
  { id: "C4790", cat: "contact",        name: "Contact checkride for SOLO" },
  { id: "C5090", cat: "contact",        name: "Contact checkride" },
  { id: "C5490", cat: "contact",        name: "Final Contact checkride" },
  { id: "I4490", cat: "instrument",     name: "Instrument checkride" },
  { id: "I4890", cat: "instrument",     name: "Final Instruments checkride" },
  { id: "F4690", cat: "formation",      name: "Final Formation checkride" },
  { id: "N4690", cat: "vfr_navigation", name: "Final Navigation checkride" },
]
  /* the ORDER is not typed here: it comes from the generated catalogue, and
     the list is sorted by it so no view can draw a different sequence */
  .map((d) => ({ ...d, order: WA.EVAL_ORDER.indexOf(d.id) + 1 }))
  .sort((a, b) => a.order - b.order);
/* 1-based syllabus position · 0 when the id is not one of the eight.
   MIRROR: db/schema.sql → wa.eval_pos. */
WA.evalPos = function (id) { return WA.EVAL_ORDER.indexOf(id) + 1; };

/* ══════════════════════════════════════════════════════════════════════════
   NFS REASONS — the printed causes of the ΦΜΠ (round 5).
   SOURCE: 3-01/2025 ΔΑΕ, ΚΕΦ.9, form **Α0473 «ΦΥΛΛΟ ΜΗ ΠΤΗΣΗΣ ΜΑΘΗΤΗ –
   ΕΚΠΑΙΔΕΥΟΜΕΝΟΥ»**, PDF page 219 = printed page 201 — the table headed
   «Α/Α ΑΙΤΙΑ ΦΥΛΛΟΥ ΜΗ ΠΤΗΣΗΣ / Check (√)». Six printed lines, in order;
   line 6 is a blank «ΑΛΛΗ ΑΙΤΙΑ:» which is the free-text note here.
   (The form is listed in the ΚΕΦ.9 forms table, PDF 182 / printed 164, and
   the obligation to raise one is 3-01 ΚΕΦ.2 §11, PDF 39 / printed 21 —
   digitised as fail-83 in FDMS data/requirements/failure_procedures.json.)
   MIRROR: db/schema.sql → wa.nfs_reasons(). Change one, change the other.
     id — stored in nfs[i].reason      el — the printed Greek, verbatim
   ══════════════════════════════════════════════════════════════════════════ */
WA.NFS_REASONS = [
  { id: "questionnaire", label: "Failed a written questionnaire", el: "ΑΠΟΤΥΧΙΑ ΣΕ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟ" },
  { id: "briefing", label: "Failed the pre-flight briefing", el: "ΑΠΟΤΥΧΙΑ ΣΕ ΠΡΟ ΠΤΗΣΗΣ ΕΝΗΜΕΡΩΣΗ" },
  { id: "flight", label: "Failed the flight", el: "ΑΠΟΤΥΧΙΑ ΣΕ ΠΤΗΣΗ" },
  { id: "fs", label: "Failed the simulator (F/S)", el: "ΑΠΟΤΥΧΙΑ ΣΕ F/S" },
  { id: "illness", label: "Illness", el: "ΑΣΘΕΝΕΙΑ" },
  { id: "other", label: "Other cause…", el: "ΑΛΛΗ ΑΙΤΙΑ" },
];
WA.nfsReason = function (id) {
  return WA.NFS_REASONS.find((r) => r.id === id) || null;
};
/* the reason on its own — for a table that prints the note in its own column */
WA.nfsReasonShort = function (e) {
  const r = WA.nfsReason(e && e.reason);
  return r ? r.label : "—";
};
/* the reason as one phrase — for a line that has no room for a note column:
   "Other cause…" alone says nothing, so the written cause replaces it */
WA.nfsReasonLabel = function (e) {
  const r = WA.nfsReason(e && e.reason);
  if (!r) return "—";
  const note = String((e && e.note) || "").trim();
  return r.id === "other" ? (note || r.label) : r.label;
};

/* ══════════════════════════════════════════════════════════════════════════
   SMS (ΚΕΠΕ) ENTRY CONDITIONS — the printed thresholds (round 8).
   SMS is the squadron's Special Monitoring Status — ΚΕΠΕ, «Κατάσταση Ειδικής
   Παρακολούθησης Εκπαίδευσης Μαθητή» — and an entrance is not a matter of
   prose: 3-01/2025 ΔΑΕ, ΚΕΦ.2 §32β (PDF page 54 = printed page 36) prints the
   SIX conditions, at least one of which puts a student in ΚΕΠΕ, verbatim in
   `el` below. The SEVENTH option is not an invented "Other…": it is the
   opening sentence of the same §32β — the standing discretion of the Squadron
   CO / DO, which the six conditions specify («Ειδικότερα…») without
   exhausting. It is the only room the regulation leaves, so it is the only
   option beyond the six, it is NAMED rather than blank, and it asks for the
   reason in writing (§32δ(2): the student is told why he was put in ΚΕΠΕ).
   MIRROR: db/schema.sql → wa.sms_reasons(). Change one, change the other.
     id — stored in sms[i].reason      el — the printed Greek, verbatim
   ══════════════════════════════════════════════════════════════════════════ */
WA.SMS_REASONS = [
  { id: "sortie59", label: "Graded 59% or below on a sortie or F/S",
    el: "Σε οποιαδήποτε έξοδο αέρος, πλην (περιπτώσεων ΑΕΡΟΝΑΥΤΙΑΣ, Περιστατικού Φυσιολογίας Πτήσεων) ή F/S βαθμολογηθεί με 59% και κάτω." },
  { id: "two63", label: "Graded 63% or below on two consecutive flights",
    el: "Σε δύο συνεχόμενες πτήσεις, εκτός των τελικών εξετάσεων και Δοκιμών Προόδου, βαθμολογηθεί με 63% και κάτω." },
  { id: "airsickness", label: "Airsickness on two consecutive flights",
    el: "Σε δύο συνεχόμενες πτήσεις παρουσιάσει ΑΕΡΟΝΑΥΤΙΑ." },
  { id: "written", label: "Failed one written or ground examination (CBT included)",
    el: "Σε μία γραπτή αξιολόγηση ή εξέταση εδάφους (συμπεριλαμβανομένων εξετάσεων σε CBT) χαρακτηρισθεί ως «ΑΠΟΤΥΧΩΝ»." },
  { id: "oral", label: "Failed 2 consecutive or 4 non-consecutive oral ground examinations",
    el: "Σε 2 συνεχόμενες ή 4 μη συνεχόμενες προφορικές εξετάσεις εδάφους κατά την ομαδική ή/και ατομική προ πτήσεως ενημέρωση, χαρακτηρισθεί ως «ΑΠΟΤΥΧΩΝ»." },
  { id: "instructor", label: "His instructor recommended it — unacceptable progress between flights",
    el: "Όταν ο Εκπαιδευτής του, εισηγηθεί να μπει σε ΚΕΠΕ λόγω μη αποδεκτής προόδου μεταξύ των πτήσεων." },
  { id: "judgement", label: "Squadron CO / DO decision — reduced performance…",
    el: "Μαθητής να τίθεται σε ΚΕΠΕ κατά την κρίση του Διοικητή της Μοίρας ή του Α.Ε. αυτής, όταν οι επιδόσεις του στην πτητική ή θεωρητική εκπαίδευση υπολείπονται έναντι της παρεχόμενης εκπαίδευσης, με αποτέλεσμα να απαιτείται ιδιαίτερη παρακολούθηση της προόδου του." },
];
WA.SMS_SOURCE = "3-01/2025 ΔΑΕ, ΚΕΦ.2 §32β — «Κατάσταση Ειδικής Παρακολούθησης Εκπαίδευσης Μαθητή (ΚΕΠΕ)», PDF page 54 = printed page 36";
WA.smsReason = function (id) {
  return WA.SMS_REASONS.find((r) => r.id === id) || null;
};
/* the condition on its own — for a table that prints the note separately */
WA.smsReasonShort = function (e) {
  const r = WA.smsReason(e && e.reason);
  return r ? r.label : "—";
};
/* the condition as one phrase — for a line with no room for a note column:
   the discretionary path says nothing on its own, so the written reason wins */
WA.smsReasonLabel = function (e) {
  const r = WA.smsReason(e && e.reason);
  /* a row recorded before round 8 asked: an em dash in a running line reads as
     "nothing happened", which is not what it means (cf. WA.soloWhoPhrase) */
  if (!r) return "condition not recorded";
  const note = String((e && e.note) || "").trim();
  return r.id === "judgement" ? (note || r.label) : r.label;
};

/* ── THE FOUR TRACKS, AND THE COLOUR EACH ONE WEARS (round 11) ─────────────
   The evaluation plot is ONE chart of all eight checkrides now, so the only
   thing left to say which track a point belongs to is the colour of its x
   label. Four tokens, defined once in styles.css (--cat-contact …) for both
   modes so all eight palettes inherit them, and NONE of them is a status
   colour: --good / --bad / --warn on a TRACK label would read as a verdict on
   the track ("contact is green, formation is red"), which is not a thing this
   application is allowed to say. --accent stays the student's own line and
   --muted the class average, so neither is available either.
   `cat` is the value stored in WA.EVALUATIONS[].cat. */
WA.EVAL_CATS = [
  { id: "contact",        label: "Contact",    color: "var(--cat-contact)" },
  { id: "instrument",     label: "Instrument", color: "var(--cat-instrument)" },
  { id: "formation",      label: "Formation",  color: "var(--cat-formation)" },
  { id: "vfr_navigation", label: "Navigation", color: "var(--cat-navigation)" },
  { id: "fpc",            label: "FPC",        color: "var(--cat-fpc)" },
];
WA.evalCat = function (id) {
  return WA.EVAL_CATS.find((c) => c.id === id) || null;
};
WA.evalCatColor = function (id) {
  const c = WA.evalCat(id);
  return c ? c.color : "var(--muted)";
};
WA.evalCatLabel = function (id) {
  const c = WA.evalCat(id);
  return c ? c.label : "—";
};

WA.evalById = function (id) {
  return WA.EVALUATIONS.find((e) => e.id === id) || null;
};
/* "C4590 — Contact checkride" · "(not identified yet)" for a legacy row */
WA.evalLabel = function (id) {
  const e = WA.evalById(id);
  return e ? e.id + " — " + e.name : "(evaluation not identified)";
};
/* short axis label */
WA.evalShort = function (id) {
  const e = WA.evalById(id);
  return e ? e.id : "(not identified)";
};
WA.evalsOfCat = function (cat) {
  return WA.EVALUATIONS.filter((e) => e.cat === cat).sort((a, b) => a.order - b.order);
};

/* ══════════════════════════════════════════════════════════════════════════
   SECTION VOCABULARY — one place for the label + the tooltip that sits on
   every section header (round-2 R6 · round-3 W5 renames).
   ══════════════════════════════════════════════════════════════════════════ */
/* who may conduct a CEF, before the squadron's own instructors: the two
   standing appointments of the unit (round 5). Free text stays accepted —
   a CEF is flown with a Squadron Evaluator, who may be any of them. */
WA.EVALUATOR_ROLES = ["DO", "Squadron CO"];

/* ── WHO MAY CONDUCT AN FPC (round 6) — EXACTLY TWO, and nothing else ──────
   A Δοκιμή Προόδου is flown for the squadron leadership: the Squadron CO or
   the DO conducts it. The instructor surnames and the free-text "Other…" that
   round 5 offered are gone from the FPC picker — a surname in that box was
   always a mis-filed CEF or an ordinary debrief. A stored value from before
   the rule stays READABLE and the form asks which of the two it was.
   MIRROR: db/schema.sql → wa.fpc_evaluators(). Change one, change the other. */
WA.FPC_EVALUATORS = ["Squadron CO", "DO"];
WA.fpcEvaluatorOK = function (v) {
  return v === null || v === undefined || v === "" || WA.FPC_EVALUATORS.indexOf(v) >= 0;
};

/* ── THE FPC «RESULT (OPTIONAL)» BOX IS GONE (round 11) ────────────────────
   «Αφαίρεσε το result optional.» It was a free-text line beside a 0-100 grade
   and an evaluator, and free text beside a number is where a second, softer
   answer to the same question gets written: "pass" under a 48 %, "ok" under a
   grade nobody filled in yet. The FPC already says its result twice — the
   GRADE against the printed scale (WA.gradeBand: 60 % and above is the
   successful characterisation) and the FPC section's own existence in the
   record — so the box added nothing but a place to disagree with them.
   THE ROUND-6 LEGACY PATTERN, EXACTLY: what is stored is never destroyed.
   `result` stays in WA.ENTRY_KEYS.fpc as a READ-ONLY CARRIER, the form draws
   no box for it, every surface prints what is there marked as a legacy note,
   and the write path refuses to let the number of FPC rows carrying one GROW
   (wa.fpc_result_count) — so an old note can be kept or dropped, never added.
   CEF IS UNTOUCHED and keeps its Result box: the two sections are separate
   code in student.js (two literal rows, not a shared builder), the command's
   sentence names the FPC, and a CEF is conducted by a Squadron Evaluator
   whose written finding is a different object from a Δοκιμή Προόδου's grade.
   MIRROR: db/schema.sql → wa.fpc_result_count(). */
WA.FPC_RESULT_TIP =
  "The FPC “Result (optional)” box was removed in round 11 — the grade against the printed scale is the result (60 % and above is the successful characterisation). This text was written before that and is kept exactly as it stands; it can be dropped, never re-added, and nothing counts it.";
WA.fpcResultNote = function (v) {
  const t = String(v === null || v === undefined ? "" : v).trim();
  if (!t) return "";
  return ` <span class="itlegacy" title="${esc(WA.FPC_RESULT_TIP)}">${esc(t)} <span class="k">(legacy note)</span></span>`;
};
/* the same fact for paper, where colour and hover do not exist */
WA.fpcResultText = function (v) {
  const t = String(v === null || v === undefined ? "" : v).trim();
  return t ? t + " (legacy note — the FPC result box was removed in round 11)" : "";
};

/* ══════════════════════════════════════════════════════════════════════════
   THE FIVE-LEVEL ASSESSMENT (round 10) — THE FINAL SCALE.
   ──────────────────────────────────────────────────────────────────────────
   The command replaced the branch ranking with ONE assessment per instructor
   per student, and the question it answers is about FIGHTERS. There is no
   aircraft-type ranking anywhere in this application any more.

   NOT ONE NEGATIVE WORD APPEARS ON THIS SCALE. That is deliberate and it is
   the most important thing about it. The bottom two levels REDIRECT — «your
   value is somewhere else» — where an ordinary scale would REJECT. The people
   these sentences are written about are 22 years old, at the end of the
   hardest year they have had, and the one written about them is a sentence
   they will remember for the rest of their lives. The command's own «not
   recommended at all» is therefore expressed WITHOUT the negation, as the
   emphatic redirect at weight 1: the strongest thing the scale can say in
   that direction, said without telling anyone he is not wanted.

   THE WEIGHTS carry the judgement so the words do not have to. The gaps are
   uneven on purpose — 10→8 is a nuance between two recommendations, 8→5 a
   real step down, 5→3 the crossing from fighters to elsewhere, 3→1 the
   emphasis inside that — so a mean separates a class the way the squadron
   reads it, which a flat 5/4/3/2/1 would not.

     id     the stored key (proposals.level)
     label  the words, character-exact — THE ONLY FORM THAT EVER RENDERS
     short  kept as an API seam but ΑΠΟΦΑΝΣΗ 2026-08-19 made it identical to
            label: «Παντού ολόκληρες» — no abbreviation anywhere, because the
            abbreviated fifth ("Strongly Other Assignments") dropped the very
            word the naming session fought for. Tight surfaces wrap instead.
     w      the weight

   MIRROR: db/schema.sql → wa.level_keys() / wa.level_weight() /
   wa.level_label(). Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
WA.LEVELS = [
  { id: "strongly_recommended", w: 10,
    label: "Strongly Recommended", short: "Strongly Recommended" },
  { id: "recommended", w: 8,
    label: "Recommended", short: "Recommended" },
  { id: "alternate", w: 5,
    label: "Recommended as Alternate", short: "Recommended as Alternate" },
  { id: "other_assignments", w: 3,
    label: "Recommended for Other Assignments", short: "Recommended for Other Assignments" },
  { id: "strongly_other_assignments", w: 1,
    label: "Strongly Recommended for Other Assignments", short: "Strongly Recommended for Other Assignments" },
];
/* THE LINE IS THE FIGHTER / OTHER SPLIT (round 14) — «την γραμμη μεταξυ
   recommended as alternate and recommended for other assignments».
   Until round 14 the rule sat before the FIFTH level and said "the last one is
   a different kind of statement". The command moved it up one: it now sits
   between **Recommended as Alternate (5)** and **Recommended for Other
   Assignments (3)**, and it marks the real boundary of the scale —
     ABOVE the line   the three FIGHTER answers: strongly recommended,
                      recommended, recommended as alternate. All three place the
                      student on the fighter track or immediately beside it.
     BELOW the line   the two REDIRECT answers: other assignments, and strongly
                      so. Both place him somewhere else in the Air Force.
   So the rule no longer separates "the last level" from "the list"; it
   separates the two things the form is actually asked to tell apart. The index
   is the count of options ABOVE the rule, which is what draws it. */
WA.LEVEL_SEP_AT = 3;
WA.LEVEL_TIP = "One assessment per instructor per student, about fighters. " +
  "The scale carries its judgement in the weights (10 · 8 · 5 · 3 · 1), never in a negative word: " +
  "the lower levels say where a student's value lies, not that he has none.";
WA.level = function (id) {
  return WA.LEVELS.find((l) => l.id === id) || null;
};
WA.levelLabel = function (id) {
  const l = WA.level(id);
  return l ? l.label : "—";
};
WA.levelShort = function (id) {
  const l = WA.level(id);
  return l ? l.short : "—";
};
/* null — never 0 — for an unassessed row: it is excluded from the mean, not
   scored zero, on this side exactly as in wa.level_weight() */
WA.levelWeight = function (id) {
  const l = WA.level(id);
  return l ? l.w : null;
};
WA.levelPos = function (id) {
  return WA.LEVELS.findIndex((l) => l.id === id);
};

/* THE WEIGHTED MEAN of a set of proposals — the ONE number the brief ranks on.
   Rows without a level are not counted (an instructor who has formed no view
   neither raises nor lowers anybody), so `n` can be smaller than the list.
   Returns the arithmetic as well as the answer: every surface prints the
   formula instead of asking the reader to trust the number. */
WA.assess = function (props) {
  const list = (props || []).filter((p) => WA.level(p.level));
  const counts = {};
  for (const l of WA.LEVELS) counts[l.id] = 0;
  let sum = 0;
  for (const p of list) { counts[p.level]++; sum += WA.levelWeight(p.level); }
  const n = list.length;
  return { n: n, sum: sum, mean: n ? sum / n : null, counts: counts };
};
/* "10×3 ÷ 3" · "(10×2 + 5×1) ÷ 3" — built from the counts in scale order, so
   the printed formula is the calculation that actually happened */
WA.levelFormula = function (counts, n) {
  const terms = WA.LEVELS.filter((l) => (counts[l.id] || 0) > 0)
    .map((l) => l.w + "×" + counts[l.id]);
  if (!terms.length || !n) return "";
  return (terms.length > 1 ? "(" + terms.join(" + ") + ")" : terms[0]) + " ÷ " + n;
};
/* «2× Strongly · 1× Alternate» — the command's own shorthand */
WA.levelDist = function (counts) {
  return WA.LEVELS.filter((l) => (counts[l.id] || 0) > 0)
    .map((l) => counts[l.id] + "× " + l.short).join(" · ");
};
WA.meanText = function (m) {
  return (m === null || m === undefined) ? "—" : m.toFixed(2);
};

WA.SECTIONS_META = {
  nfs:          { label: "NFS", tip: "NFS = Φύλλο μη Πτήσης (ΦΜΠ) — one dated entry per event, with the reason printed on form Α0473 (3-01 ΚΕΦ.9): failed questionnaire / failed pre-flight briefing / failed flight / failed F/S / illness / other cause. The count is derived." },
  sms:          { label: "SMS", tip: "SMS = the squadron's Special Monitoring Status — ΚΕΠΕ, «Κατάσταση Ειδικής Παρακολούθησης Εκπαίδευσης Μαθητή» (3-01 ΚΕΦ.2 §32). One entry per entrance, naming the condition it was raised under — the six thresholds printed in §32β (59% on a sortie or F/S · 63% on two consecutive flights · airsickness on two consecutive flights · one failed written/ground exam · 2 consecutive or 4 non-consecutive failed orals · the instructor's recommendation) or the Squadron CO / DO decision of the same paragraph's opening sentence — plus the exit date when it closes." },
  airsickness:  { label: "Airsickness", tip: "One dated entry per airsickness event — the FLIGHT it happened on and with whom, so the squadron can see the pattern. The flight is required on every entry. (Round 6 replaced the free-text phase-of-flight note with the flight code; a note already written is kept as legacy information, and its row asks for the flight before the record can be saved again.)" },
  fail:         { label: "FAIL", tip: "FAIL = a syllabus item graded below the desired performance — the flight, the items, the instructor and the grade. The items are the printed gradesheet items of the chosen track and nothing else (round 6)." },
  almost_good:  { label: "ALMOST GOOD", tip: "ALMOST GOOD = an item that only just reached the desired performance — same detail as a FAIL, and the same syllabus-only item list." },
  evaluations:  { label: "Evaluations", tip: "The eight checkrides of the stage — fixed rows, present from day one and empty until flown, so every student is compared on the same flight. They are filled in SYLLABUS ORDER: a later checkride cannot be recorded while an earlier one has not been flown (round 6)." },
  solo_flights: { label: "Solo flights", tip: "The solos the syllabus prescribes — eight fixed slots (F4301-06 carries two), empty until flown. A flown solo is graded 0-100 % or NG (non-graded), and EVERY flown row names who authorised it. The contact (adaptation) solos start as NG and the formation solos as graded; either can be switched. An unforeseen solo is recorded as an additional solo." },
  fpc:          { label: "FPC", tip: "FPC = Δοκιμή Προόδου (flight progress check) — flown after failures, so fewer is better. Each entry names the stage flight that triggered it and the evaluator: the Squadron CO or the DO, and nobody else (round 6)." },
  /* NOTE (round 8): no section carries a "pending" flag any more. A fixed slot
     with no date has not been flown, and a result still awaited is a grade not
     written yet — neither needs a flag to say so. */
  cef:          { label: "CEF", tip: "CEF = Εξέταση Καταλληλότητας (evaluation with a Squadron Evaluator) — flown after failures, so fewer is better. Each entry names the stage flight that triggered it and the evaluator who conducted it." },
  /* ROUND 12 — THE LOG TABLES. Four sections, ten blocks on screen: the band
     is the section, the track is on the row, and the pair is one table. */
  flights:      { label: "Flights", tip: "The flight log — every sortie of the printed flow chart is a row here FROM THE FIRST DAY (round 13): grey while it is owed, light green once something is written in it, green when the row is complete and the mission was completed, mustard when it is beyond the syllabus's one planned pass (a repeat, an FCF, a CEF, a same-day re-fly). The grade may be left empty: a debrief sometimes takes a while, and the row says «awaiting debrief» rather than pretending the flight did not happen. Split into the four tracks; the eight checkrides are recorded in the Evaluations section, where the syllabus order applies to them. An untouched row is STORED NOWHERE — the record keeps only what actually happened." },
  fs:           { label: "F/S", tip: "The same log for the SIMULATOR — its own flow-chart sorties pre-seeded in the same four tracks, in the same four colours. Sim hours and flight hours are counted separately by the squadron, which is why they are two logs and not one." },
  lessons:      { label: "Ground lessons", tip: "The ground academics — the twelve theory groups of the programme and all 47 courses inside them, present as rows from the first day and grouped by their theory group. A lesson is a BLOCK, so it can carry an end date. A lesson is attended, not scored, so there is no grade here and no instructor. An untouched course is stored nowhere; a course the catalogue does not know goes in as an extra." },
  exams:        { label: "Ground exams", tip: "The eight ground-exam groups of the syllabus, present as rows from the first day: grey until the exam is sat, light green on the date alone, green once the result is in — whatever the result says, because the row asked for a mark and got one. A GROUND EXAM IS PASSED AT " + WA.passMin("exams") + " % — a flight is passed at " + WA.passMin() + ", and these are two different examinations with two right numbers (ruling of 2026-08-21). The " + WA.passMin("exams") + " % decides which TRIAL stands for the exam, never whether the row is complete. The Weekly theory exams are ground exams too and are marked the same way. (The exam papers written INSIDE a theory group — FF 190, PT 190, AΕ 190, JX 190/191, NA 191 — are courses of their group and belong under Ground lessons: that is where the squadron's scheduler counts them.)" },
  /* ROUND 19 — the ONE section of an INSTRUCTOR's record. It is listed here
     beside the student's because every naming surface — the change list, the
     save dialog, the read-only dashboard view — asks WA.secLabel for a word
     and must get the same word from all of them. */
  ins_currency: { label: "My currency", tip: "Your own flying, for the squadron's currency register — the bridge into FDMS. One row per sortie: the DAY, whether it was a CONTINUATION flight of your own or one WITH AN SP, WHAT WAS FLOWN — a Continuation flight names its Σ category (the printed rows of Πίνακας 9: Σ-1, Σ-2 day, Σ-2 night, Σ-3, Σ-4, Σ-20, and of Πίνακας 6: SIM-1 … SIM-ΔΑ, plus FDMS's columns for a night sortie with students and for an FCF, and the Chapter-5 demo flight); a With-SP flight names the STUDENT'S SORTIE from the syllabus, or repeat / fcf / cef, or the code as typed — and the 3-01 EVENTS it exercised. A sortie that exercised no event is still a sortie: leave the events empty and the flight still counts. This is YOUR record and nobody else's — it names no student, and the flights your students log are entered by them, on their own form." },
};
WA.secLabel = function (k) { return (WA.SECTIONS_META[k] || {}).label || k; };
WA.secTip = function (k) { return (WA.SECTIONS_META[k] || {}).tip || ""; };
/* the little ⓘ that carries the terminology tooltip next to a header */
WA.tipDot = function (k) {
  const t = WA.secTip(k);
  return t ? `<span class="tipdot" tabindex="0" role="note" title="${esc(t)}"
    aria-label="${esc(WA.secLabel(k) + ": " + t)}">&#9432;</span>` : "";
};

/* ══════════════════════════════════════════════════════════════════════════
   GRADE RENDERING — one guard, used everywhere a percentage reaches the DOM.
   A v1 solo that said {graded:true, grade:null} migrates to a legacy row with
   no grade; without this it printed a bare "%" in the dashboard, the print
   sheet and the brief line (round-4 W3b).
   ══════════════════════════════════════════════════════════════════════════ */
WA.pct = function (v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  /* ROUND 5 — grades are whole numbers. A fractional grade can only be a
     record written before that rule: it is shown ROUNDED, and the raw value
     stays one hover away. Nothing is rewritten in storage behind the owner's
     back; the form asks for a whole number the next time it is saved. */
  if (n !== Math.round(n)) {
    const tip = "Stored as " + n + "% — grades are whole numbers, so it is shown rounded";
    return `<span class="rnd" title="${esc(tip)}">${esc(Math.round(n))}%</span>`;
  }
  return esc(n) + "%";
};
/* the same grade for CSV / plain text: the RAW stored value, never rounded */
WA.pctRaw = function (v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return isFinite(n) ? n : "";
};

/* ══════════════════════════════════════════════════════════════════════════
   ENTERED BY THE ADMIN — the transparency stamp (round 4, RENAMED round 17).
   ──────────────────────────────────────────────────────────────────────────
   ROUND 17 — THE ADMIN IS NOT THE SQUADRON CO. Ruling of 2026-08-22, verbatim:
   «Ο admin δεν ειναι ο squadron CO, ειμαι εγω, ο developer. ⟨SURNAME⟩.
    Διορθωσε το»
   (the surname the ruling names is redacted here and in every tracked file —
   the DATABASE carries the display name, which is its only home.)

   The holder of the admin link is the FLIGHT COMMANDER and the developer of
   this application. He is not the squadron's Commanding Officer, and for four
   rounds every stamp, lock note, banner, chip, tooltip, print line and CSV
   verdict said he was. The identity is now said in exactly two ways and never
   in a third:
     · WHERE A NAME FITS  — the admin person row's OWN rank + surname, read
       from the database through WA.personRankName. That is only possible on
       the surfaces the admin himself is looking at (WA.me is his own row):
       the two on-behalf banners, the save signature, his printed sheet.
     · WHERE A ROLE WORD FITS — the neutral «the admin» / «the squadron
       administration». A student reading a lock note has never been told the
       admin's name by any RPC, and inventing one would be a second identity.
   WHAT DID NOT MOVE: the stored value stays entered_by='admin' (already
   neutral — no migration, schema untouched), and the CSS/internal identifiers
   (.cotag, .colock, is-co, is-colock, WA.isCO, asCO) keep their names. What
   the USER SEES stops claiming CO-ness; what the code calls its own variables
   is nobody's business but the code's.
   AND THE REAL SQUADRON CO IS UNTOUCHED, because he exists: «Squadron CO» is
   one of the two appointments that may conduct an FPC (WA.FPC_EVALUATORS,
   round 6), one of the evaluator roles of a CEF, and the authority named in
   the ΚΕΠΕ entry conditions of 3-01 ΚΕΦ.2 §32β. Those are DOCTRINE, they name
   an appointment and not this application's admin, and they stay word for word.
   ──────────────────────────────────────────────────────────────────────────
   The admin can enter data FOR a student or an instructor; every row written
   that way carries entered_by:'admin', set server-side, and every view that
   shows the row shows this tag. The owner saving their own form clears it —
   reclaimed data is self-reported again.
   ══════════════════════════════════════════════════════════════════════════ */
/* THE CHIP'S WORD — one constant, so the tag cannot say ADMIN on one surface
   and something else on the next. It is the ROLE, in the neutral word: the
   chip is read by students and instructors, who are never told a name. */
WA.ADMIN_TAG = "ADMIN";
/* the role word in a sentence, long and short */
WA.ADMIN_BODY = "the squadron administration";
WA.ADMIN_WORD = "the admin";
/* WHO IS SIGNING, WHEN THE ADMIN IS THE ONE READING. WA.me is the token's own
   record, so on the admin's own surfaces the name is available and is used;
   anywhere else this is never called. */
WA.adminRankName = function () {
  return WA.personRankName(WA.me || {});
};
WA.CO_TIP = "Entered by " + WA.ADMIN_BODY + " on behalf of the owner — not self-reported";
/* ── THE ADMIN'S EDITS PREVAIL (round 8) ───────────────────────────────────
   A row the admin wrote is not a suggestion. It is shown to its owner LOCKED:
   readable, disabled, un-removable, and it must travel through the owner's
   next save fact for fact — the server refuses the save otherwise, naming the
   rule. Only the admin can change or delete it (and the admin editing one of
   the owner's rows makes it his, which locks that one too).
   MIRROR: db/schema.sql → wa.carry_stamps. */
WA.CO_LOCK_TIP =
  "Set by " + WA.ADMIN_BODY + " — locked. It stays on your record exactly as it stands; only " +
  WA.ADMIN_WORD + " can change or remove it.";
WA.coLockTag = function () {
  return `<span class="colock" title="${esc(WA.CO_LOCK_TIP)}" aria-label="${esc(WA.CO_LOCK_TIP)}">&#128274; locked by ${esc(WA.ADMIN_WORD)}</span>`;
};
WA.isCO = function (e) { return !!(e && e.entered_by === "admin"); };
WA.coTag = function (e) {
  return WA.isCO(e)
    ? `<span class="cotag" title="${esc(WA.CO_TIP)}" aria-label="${esc(WA.CO_TIP)}">${esc(WA.ADMIN_TAG)}</span>` : "";
};
/* the same fact for CSV / plain-text surfaces */
WA.coWord = function (e) { return WA.isCO(e) ? "admin" : "self"; };

/* ── THE SOURCE OF A WHOLE RECORD (round 4b) ───────────────────────────────
   A record is not "the admin's" because the admin touched it. 17 self-reported
   entries and 1 admin addition is a SELF-REPORTED record with one addition,
   and every surface that summarises a record must say exactly that.
   MIRROR: db/schema.sql → wa.record_stamp / wa.co_entry_count / wa.entry_count.
   `stamp` is the record-level flag the server sends; it settles only the case
   the entries cannot — an empty record the admin created for an owner who has
   never saved it. → { n, total, all, some, any, word, tip } */
WA.coSource = function (rec, stamp) {
  const r = rec || {};
  let total = 0;
  for (const k of WA.COUNTED) total += WA.filled(k, r[k]).length;
  const n = WA.coEntries(r).length;   /* the one place admin entries are counted */
  const all = total > 0 ? n === total : stamp === "admin";
  const some = n > 0 && !all;
  return {
    n, total, all, some, any: all || some,
    /* the plain-text verdict for CSV: "admin" = all of it, "self+admin" = the
       owner's record with admin additions (the count travels beside it) */
    word: all ? "admin" : (some ? "self+admin" : "self"),
    tip: all
      ? (total ? "Every entry of this record was entered by " + WA.ADMIN_BODY + " on the owner's behalf"
               : "This record was opened by " + WA.ADMIN_BODY + " — its owner has never saved it")
      : some
        ? n + (n === 1 ? " entry was" : " entries were") +
          " entered by " + WA.ADMIN_BODY + " on the owner's behalf — the other " +
          (total - n) + (total - n === 1 ? " is" : " are") + " self-reported"
        : "Self-reported by its owner",
  };
};
/* the chip that carries that verdict: filled "ADMIN" = the whole record is the
   admin's, hollow "+N ADMIN" = N of its entries are and the rest is the
   owner's. */
WA.coRecordTag = function (src) {
  if (!src || !src.any) return "";
  const label = src.all ? WA.ADMIN_TAG : "+" + src.n + " " + WA.ADMIN_TAG;
  return `<span class="cotag${src.all ? "" : " part"}" title="${esc(src.tip)}"
    aria-label="${esc(src.tip)}">${esc(label)}</span>`;
};

/* ══════════════════════════════════════════════════════════════════════════
   SYLLABUS CATALOGUE ACCESS — items (WA_ITEMS) and sortie codes (WA_SORTIES),
   both generated into app/items-catalog.js from the FDMS syllabus.
   ══════════════════════════════════════════════════════════════════════════ */
WA.itemCat = function (id) {
  const c = (typeof WA_ITEMS === "object" && WA_ITEMS && Array.isArray(WA_ITEMS.categories))
    ? WA_ITEMS.categories.find((x) => x.id === id) : null;
  return c || null;
};
WA.itemCatLabel = function (id) {
  const c = WA.itemCat(id);
  return c ? c.label : (id === "other" ? "Other (legacy entry)" : "—");
};
/* the catalogue entry whose name matches, for the printed item number */
WA.itemFind = function (catId, name) {
  const c = WA.itemCat(catId);
  if (!c || !name) return null;
  return c.items.find((it) => it.name === name) || null;
};
/* one item string → "12–20 — PRECISION - AEROBATIC MANEUVERS" · custom as typed */
WA.itemText = function (catId, name) {
  const hit = WA.itemFind(catId, name);
  return (hit && hit.n ? hit.n + " — " : "") + String(name || "");
};
/* ── SYLLABUS ONLY (round 6) ───────────────────────────────────────────────
   The custom "Other…" item is gone: items[] may name only the printed
   gradesheet items of the entry's own track, because an item nobody else can
   have is an item nobody can compare, count or look up in the MIF. What is
   already stored is NOT rewritten — a custom string is read, shown marked
   "legacy", and its row is refused on the next save until it is replaced.
   MIRROR: db/schema.sql → wa.item_names / the items[] check in
   wa.validate_record. */
WA.itemKnown = function (catId, name) { return !!WA.itemFind(catId, name); };
WA.itemsLegacy = function (entry) {
  const e = entry || {};
  return (Array.isArray(e.items) ? e.items : []).filter((n) => !WA.itemKnown(e.category, n));
};
WA.ITEM_LEGACY_TIP =
  "Legacy — a custom item typed before round 6. Replace it with an item of the printed gradesheet; the entry cannot be saved again until you do.";
/* the whole items[] of one FAIL / ALMOST GOOD entry, for tables and print */
WA.itemsLabel = function (entry) {
  const e = entry || {};
  const list = Array.isArray(e.items) ? e.items : [];
  if (!list.length) return "—";
  return list.map((n) => WA.itemText(e.category, n) +
    (WA.itemKnown(e.category, n) ? "" : " (legacy)")).join(" · ");
};
/* the same list as HTML, with the custom leftovers greyed and explained —
   the admin's tables, the brief and the instructor card all call this one */
WA.itemsLabelHTML = function (entry) {
  const e = entry || {};
  const list = Array.isArray(e.items) ? e.items : [];
  if (!list.length) return "—";
  return list.map((n) => WA.itemKnown(e.category, n)
    ? esc(WA.itemText(e.category, n))
    : `<span class="itlegacy" title="${esc(WA.ITEM_LEGACY_TIP)}">${esc(n)} <span class="k">(legacy)</span></span>`
  ).join(" · ");
};
/* HOW MANY items one FAIL / ALMOST GOOD entry names. The list itself is
   rendered by WA.itemsLabel; the COUNT belongs beside it on every surface that
   shows the list — the form's chip header, the admin table, the brief, the
   instructor card, the CSV and the PRINT SHEET. Print was the one that carried
   the items without ever saying how many (round 5b), so the wording now lives
   in ONE place and a new surface cannot drift from the others. */
WA.itemsN = function (entry) {
  const l = (entry || {}).items;
  return Array.isArray(l) ? l.length : 0;
};
/* "(3 items)" — and nothing at all for a single item, which needs no count */
WA.itemsCount = function (entry) {
  const n = WA.itemsN(entry);
  return n > 1 ? "(" + n + " items)" : "";
};
WA.itemsCountHTML = function (entry, cls) {
  const t = WA.itemsCount(entry);
  return t ? ` <span class="${esc(cls || "k")}">${esc(t)}</span>` : "";
};
WA.sorties = function (catId) {
  const s = (typeof WA_SORTIES === "object" && WA_SORTIES) ? WA_SORTIES[catId] : null;
  return Array.isArray(s) ? s : [];
};
/* every stage sortie, syllabus order per track — the FPC / CEF trigger picker */
WA.TRACKS = ["contact", "instrument", "formation", "vfr_navigation"];
WA.allSorties = function () {
  if (WA._allSorties) return WA._allSorties;
  const out = [];
  for (const t of WA.TRACKS) for (const s of WA.sorties(t)) out.push({ ...s, t });
  WA._allSorties = out;
  return out;
};
/* ── NORMALISATION — WHITESPACE IS NOT DATA (round 5b) ────────────────────
   MIRROR: db/schema.sql → wa.norm_line / wa.norm_code. The server normalises
   every string at the write boundary and on read; the client does the same
   BEFORE it judges a value, because a check that reads ' C4302 ' as free text
   is a check that does not run: the live "wrong track" note under the box and
   the pre-save refusal both go quiet on a padded code otherwise. */
WA.normLine = function (v) {
  /* JS \s already covers NBSP / BOM / every Unicode space; the
     zero-width space is the one it does not, so it goes first. */
  return String(v === null || v === undefined ? "" : v)
    .replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
};
WA.normCode = function (v) { return WA.normLine(v).toUpperCase(); };

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 22 (WA-21 verify finding 3) — WHAT AN OFF-CATALOGUE CODE IS PROMISED.
   Every «Other…» tooltip in this application used to say the typed code was
   «saved as typed». It is not: a field named `sortie` / `slot` / `evaluation`
   / `flight_code` goes through wa.norm_code at the normalisation boundary,
   which is `upper(wa.norm_line(t))` — so `c4302` is STORED `C4302`, and a
   promise that says otherwise is a small lie the very next screen exposes.
   ONE SENTENCE, everywhere a code box can be typed into. The free-text fields
   that are NOT codes (a course code, a note) keep their own wording, because
   for them the old promise was true.
   MIRROR: db/schema.sql → wa.code_fields / wa.norm_code. */
WA.OFFCAT_SAVED =
  "saved in capitals, exactly as the log prints it — every sortie code is stored " +
  "upper-cased (type c4302 and the record holds C4302), and leading and trailing " +
  "spaces are trimmed. Nothing else about it is changed, and it is shown marked.";

WA.sortieOf = function (code) {
  if (!code) return null;
  if (!WA._sortieIx) {
    WA._sortieIx = {};
    for (const s of WA.allSorties()) WA._sortieIx[s.c] = s;
  }
  return WA._sortieIx[WA.normCode(code)] || null;
};
/* the track a syllabus code belongs to, from its letter (B/C contact,
   I instrument, F formation, N navigation) — null for free text.
   MIRROR: db/schema.sql → wa.code_track. This is what makes the pair
   "category Instrument + flight C4302" impossible instead of merely unlikely. */
WA.codeTrack = function (code) {
  const c = WA.normCode(code);
  if (!/^[BCIFN]\d{4}$/.test(c)) return null;
  return { B: "contact", C: "contact", I: "instrument", F: "formation", N: "vfr_navigation" }[c[0]];
};
/* is this code one the generated catalogue knows? (an unknown code is
   accepted — the syllabus data can lag reality — but it is shown marked) */
WA.sortieKnown = function (catId, code) {
  if (!code) return true;
  const c = WA.normCode(code);
  return catId ? WA.sorties(catId).some((s) => s.c === c) : !!WA.sortieOf(c);
};
/* "C4302 — Contact — advanced handling (simulator)" · free text as typed */
WA.sortieLabel = function (catId, code) {
  if (!code) return "—";
  const hit = (catId ? WA.sorties(catId).find((s) => s.c === code) : null) || WA.sortieOf(code);
  return hit ? hit.c + " — " + hit.n + (hit.b === "fs" ? " (simulator)" : "") +
                 (hit.k ? " — checkride" : "")
             : String(code) + " (not in the syllabus catalogue)";
};
/* the flight-code cell every table prints: the code, its full name in the
   tooltip, and a marker when the catalogue does not know it */
WA.sortieCell = function (catId, code) {
  if (!code) return "—";
  const known = WA.sortieKnown(catId, code);
  return `<span title="${esc(WA.sortieLabel(catId, code))}">${esc(code)}</span>` +
    (known ? "" : `<span class="offcat" title="This code is not in the syllabus catalogue — typed as free text">*</span>`);
};

/* ══════════════════════════════════════════════════════════════════════════
   THE FIXED SOLO SLOTS (round 5) — one row per solo the stage prescribes.
   WA_SOLO_SLOTS is generated from the FDMS flow chart: every Training Section
   whose printed duration block says SOLO SORTIES > 0 contributes that many
   slots, so F4301-06 (SORTIES/HOURS SOLO: 2/2,4) carries TWO. The Solo
   section renders exactly these, always, empty until flown — there is no
   + Add and no remove. A solo the syllabus did not foresee is recorded as a
   slot-LESS "additional solo".
   MIRROR: db/schema.sql → wa.solo_slots().
   ══════════════════════════════════════════════════════════════════════════ */
WA.soloSlots = function () {
  return (typeof WA_SOLO_SLOTS !== "undefined" && Array.isArray(WA_SOLO_SLOTS)) ? WA_SOLO_SLOTS : [];
};
WA.soloSlot = function (id) {
  return WA.soloSlots().find((s) => s.id === id) || null;
};
/* "C4801-04 — solo" · "C4790-91 — 1st SOLO (C4791)" · "F4301-06 — solo 2 of 2" */
WA.soloSlotLabel = function (id) {
  const s = WA.soloSlot(id);
  if (!s) return id ? String(id) : "Additional solo";
  const one = s.codes.length === 1 ? " (" + s.codes[0] + ")" : "";
  return s.sec + " — " + (s.req ? "1st SOLO" : "solo") +
         (s.of > 1 ? " " + s.n + " of " + s.of : "") + one;
};
WA.soloSlotTip = function (id) {
  const s = WA.soloSlot(id);
  if (!s) return "A solo the syllabus does not prescribe — recorded as an additional solo";
  return "Training Section " + s.sec + " — " + s.name +
         " · the syllabus prescribes " + s.of + " solo" + (s.of === 1 ? "" : "s") +
         " here" + (s.req ? " (required)" : "") +
         " · candidate sortie" + (s.codes.length === 1 ? "" : "s") + ": " + s.codes.join(", ");
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 22 — WHICH SORTIE CODES BELONG TO A SOLO SLOT, AND WHICH ARE A SOLO
   BY DEFINITION. THE JUDGEMENT, WRITTEN DOWN.
   ROUND 23 — AND THE JUDGEMENT NOW PRODUCES A MARK, NOT A REFUSAL.
   ──────────────────────────────────────────────────────────────────────────
   RULING (2026-08-28): «Έβαλα την C4791 και έκανα save. Γιατί δεν ανανεώνεται
   στον πίνακα Flights;» — the solo slot and the Flights row for one sortie
   were two books for one flight. The CHECKRIDE PRECEDENT closes it: one fact,
   one row, and the other surface renders it DERIVED.
   Item 1(b) asks for the refusal set to be JUDGED from the syllabus. Here is
   the judgement, in two tiers, because the syllabus itself has two shapes:

   TIER 1 — A SOLO BY DEFINITION (MARKED SUSPECT, by name). A Training Section
     whose solo is REQUIRED and whose picker offers no alternative: the slot
     MUST be filled and only one code can fill it, so that code is never flown
     dual by anybody. Today that is exactly ONE code — C4791, the stage's 1st
     SOLO (section C4790-91, required, candidates: C4791 alone). It is the
     exact parallel of a checkride: the flow chart leaves no other way to fly
     it. The general form is `req && slotsOfSection >= codes.length`, so a
     section that ever prescribed 2 solos over 2 candidates would join it
     without a line of new code.

   TIER 2 — A SOLO CANDIDATE (MARKED only when THIS record's own solo section
     already names it, on the SAME DAY). C4802 and C4803 are the two candidates
     of a four-sortie section prescribing ONE solo: whichever was not flown solo
     WAS flown dual, and its Flights row is the truth. Marking all 17 candidates
     by name would cry wolf on a real flight — so the mark is the honest one:
     two rows that MAY be one flight.

   RULING 2026-08-28 (evening) — ΜΑΡΚΑΡΙΣΜΑ, ΟΧΙ ΑΡΝΗΣΗ (§4y·11·1). «Όπως
   είναι με το which-sortie που μπορούμε να κάνουμε type είναι μια χαρά — θα
   μπαίνει ως έξτρα γραμμή. Για να μην το πνίγουμε: ΜΑΡΚΑΡΙΣΜΑ ως ύποπτο, και
   το ξεδιαλύνουμε μετά και μαζί.» Both tiers were REFUSALS in round 22 and are
   MARKS now: a refusal here refused flights that happened — a repeat flown in
   another section's slot, a genuine second solo — and nothing is worth that.
   The two-tier judgement itself stands: it is still what decides WHICH sentence
   a row wears.
   MIRROR: db/schema.sql → wa.solo_slot_codes() / wa.solo_only_codes(). The two
   arrays stay on the server as the GENERATED MIRROR of this client mark set —
   asserted by the r22 audit block — even though the server refuses nothing here
   any more.
   ══════════════════════════════════════════════════════════════════════════ */
/* every code any fixed solo slot can hold — the union of the slots' pickers */
WA.soloSlotCodes = function () {
  if (WA._soloCodes) return WA._soloCodes;
  const seen = {};
  for (const s of WA.soloSlots()) for (const c of (s.codes || [])) seen[WA.normCode(c)] = true;
  WA._soloCodes = Object.keys(seen).sort();
  return WA._soloCodes;
};
/* the codes of TIER 1 — a solo by definition, wherever it is written */
WA.soloOnlyCodes = function () {
  if (WA._soloOnly) return WA._soloOnly;
  const n = {};
  for (const s of WA.soloSlots()) n[s.sec] = (n[s.sec] || 0) + 1;
  const seen = {};
  for (const s of WA.soloSlots()) {
    if (!s.req || n[s.sec] < (s.codes || []).length) continue;
    for (const c of (s.codes || [])) seen[WA.normCode(c)] = true;
  }
  WA._soloOnly = Object.keys(seen).sort();
  return WA._soloOnly;
};
WA.isSoloOnlyCode = function (code) {
  const c = WA.normCode(code);
  return !!c && WA.soloOnlyCodes().indexOf(c) >= 0;
};
/* ══════════════════════════════════════════════════════════════════════════
   ROUND 23 — THE SUSPECT SENTENCES. FOUR OF THEM, ONE VOICE.
   ──────────────────────────────────────────────────────────────────────────
   Round 22 wrote these as REFUSAL sentences and the server raised each one by
   name. The ruling of 2026-08-28 (evening) turned three of the four into
   MARKS: the row saves exactly as it stands, it is rendered as an EXTRA, and
   the chip beside it says why it MAY be a double record and what happens next.
   THE HOUSE SHAPE OF EACH SENTENCE: WHAT it is · WHERE the other record lives ·
   WHY the two may be one flight · WHAT HAPPENS NOW. The last clause is written
   ONCE (WA.SUSPECT_TAIL) so four sentences cannot end four ways.
   MIRROR: none — these are CLIENT marks; the server refuses nothing here since
   the ruling of 2026-08-28 (§4y·11·1). The one sentence that is still a
   REFUSAL on both sides keeps its name: WA.soloIsCheckrideRefusal. */
WA.SUSPECT_WORD = "suspect";
WA.SUSPECT_TAIL =
  "Nothing is refused and nothing is lost: the row is saved exactly as it stands, it is " +
  "marked here, and the double record is untangled together with " + WA.ADMIN_BODY + ".";
/* ROUND 22b (verify finding 3) — WHAT A REFUSAL CALLS THE ROW THAT ALREADY
   HOLDS THE SORTIE. It is the SLOT ID AS IT IS STORED, because that is the one
   name the server can say: wa.solo_holder returns `coalesce(slot, 'an
   additional solo')` and the two mirrors have to name the same thing in the
   same words. WA.soloSlotLabel — the form's own heading — ends in "— solo",
   so interpolating it mid-sentence produced «…the solo of C4801-04 — solo — a
   solo is recorded…»: a stray clause the server twin never had. */
WA.soloHolderName = function (slotId) {
  return WA.normLine(slotId) || "an additional solo";
};
/* (A) TIER 1 — a flights / fs row naming a solo-by-definition code */
WA.soloOnlySuspect = function (code) {
  const c = WA.normCode(code) || String(code || "");
  return c + " is the stage's 1st SOLO and the syllabus gives no other way to fly it — the " +
    "solo itself is recorded in the Solo flights section, where who authorised it and the NG " +
    "rule live, and that record holds this position in the flow chart. So this row may be a " +
    "SECOND RECORD of the same flight; it is kept as an EXTRA and marked. " + WA.SUSPECT_TAIL;
};
/* (B) TIER 2 — the same-day shape */
WA.soloSameDaySuspect = function (code, slotId, date) {
  const c = WA.normCode(code) || String(code || "");
  return c + (date ? " on " + fmtD(date) : "") +
    " is also recorded as the solo of " + WA.soloHolderName(slotId) +
    " — the same sortie on the same day, which is one flight in two books. This row is kept " +
    "as an EXTRA and marked. " + WA.SUSPECT_TAIL;
};
/* ══════════════════════════════════════════════════════════════════════════
   ROUND 22b — THE TWO THINGS THE SOLO SECTION ITSELF OWES (verify finding 2)
   ROUND 23 — AND ONE OF THE TWO IS NOW A MARK, NOT A REFUSAL.
   ──────────────────────────────────────────────────────────────────────────
   Round 22 wrote, in WA.derivedSlots, «a record that (wrongly) holds two solos
   of one sortie shows the last one and the section itself refuses the pair».
   Nothing refused it — on either side. These are the sentences that make that
   comment true, and the fence the solo picker's free text left open.
     · THE PAIR — MARKED SUSPECT ON BOTH ROWS (round 23; it was a refusal in
       22b). Two rows naming one sortie MAY be two books for one solo: they
       derive one Flights position between them (the later wins) and both are
       stored, counted and exported. But «ένα solo που δεν πετάχτηκε σε μια
       ενότητα (λόγω καιρού) συνήθως πετιέται σε κάποιο repeat» — a genuine
       second solo of one code is a flight that happened, and a refusal here
       refused it. So both rows are kept, both are marked, and the double
       record is untangled with the squadron. It fires on the SORTIE BEING
       PRESENT ON BOTH ROWS and on nothing else — an empty slot names no
       sortie and can neither disarm the mark nor be caught by it (the
       round-20b three-valued-logic rule: presence before membership).
     · A CHECKRIDE IN A SOLO SLOT — the R12 sentence, one section over. The
       picker offers the Training Section's candidates and free text beside
       them (reality outruns the generated chart), so `{sortie: 'C4590'}` used
       to be stored, counted and exported while appearing NOWHERE in the
       Flights table: WA.derivedSlots skips a `ck` position on purpose, because
       that position belongs to Evaluations. A checkride is flown WITH an
       evaluator; it can never be a solo, whoever typed it.
   THE JUDGEMENT ON THE REST OF THE FREE TEXT, recorded (spec §4y·10): the
   candidate set is NOT fenced. A solo of a sortie the generated flow chart did
   not mark `sc` is still a flight that happened, and refusing it would refuse
   the truth — the one thing this application must never do. Such a code is
   already bounded (wa.code_track: /^[BCIFN]\d{4}$/, and its letter must match
   the slot's Training Section) and, unlike a checkride, it makes no second
   book: the Flights position it names is DERIVED from this very row.
   MIRROR: db/schema.sql → wa.validate_record, the solo_flights branch — the
   CHECKRIDE fence only; the pair is a client mark and the server refuses
   nothing about it (§4y·11·1). */
/* (C) THE SOLO PAIR — the same sentence on BOTH rows, because the two names
   are printed in STORED ORDER and therefore read alike standing on either. */
WA.soloPairSuspect = function (code, slotA, slotB) {
  const c = WA.normCode(code) || String(code || "");
  return c + " is recorded as the solo of both " + WA.soloHolderName(slotA) +
    " and " + WA.soloHolderName(slotB) + " — a sortie is flown solo ONCE, so one of these " +
    "two rows is probably a second record of one flight. They derive ONE position of the " +
    "flight log between them (the later row wins it) while both are stored, counted and " +
    "exported. Both rows are kept, and both are marked. " + WA.SUSPECT_TAIL;
};
WA.soloIsCheckrideRefusal = function (code) {
  const c = WA.normCode(code) || String(code || "");
  return c + " is one of the eight checkrides — a checkride is recorded in the Evaluations " +
    "section, where the syllabus order and the pass-attempt rule apply to it, and it is flown " +
    "WITH an evaluator: it can never be a solo. Choose the sortie this Training Section " +
    "prescribes as its solo.";
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 23 — DOES THIS RECORD'S SOLO SECTION ALREADY HOLD THAT SORTIE?
   ──────────────────────────────────────────────────────────────────────────
   Lifted OUT of student.js (where it was `soloHolder`, closed over S.data) so
   the three surfaces that must say the same thing about a row — the student's
   form, the admin's drill-down and the printed brief — read it from one place.
   The record is passed in; nothing here knows which page it is running on.
   `date` narrows it to the SAME-DAY shape, which is the one the ruling calls
   suspect. Called WITHOUT a date it answers the softer question: is this
   sortie's flow-chart position already held by a solo at all? That one is not
   suspicious — it is the commonest true shape in the syllabus (§4y·11·1 (D)).
   PRESENCE BEFORE MEMBERSHIP: an empty slot names no sortie and no day, so it
   can neither be found by this nor disarm it. */
WA.soloHolderOf = function (rec, code, date) {
  const c = WA.normCode(code);
  if (!c) return null;
  const list = (rec && Array.isArray(rec.solo_flights)) ? rec.solo_flights : [];
  return list.find((x) =>
    x && typeof x === "object" && !WA.slotEmpty("solo_flights", x) &&
    WA.normCode(x.sortie) === c &&
    (date === undefined || (!!x.date && x.date === date))) || null;
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 23 — THE SOLO SECTION'S OWN ROW MARK: THE PAIR, ON BOTH ROWS.
   ──────────────────────────────────────────────────────────────────────────
   22b verify item 11: the pair was refused ON SAVE and shown nowhere AT REST,
   so a record could sit on the screen for an hour with two solos of one sortie
   and say nothing about it. Now it says so on both rows the moment the page
   draws them — and the record saves, because the ruling of 2026-08-28
   (evening) made the pair a MARK.
   THE TWIN IS FOUND BY THE SORTIE ALONE, and in STORED ORDER, so the sentence
   reads identically standing on either row (WA.soloPairSuspect prints the two
   names lower-index-first). PRESENCE BEFORE MEMBERSHIP: a row is compared only
   when it NAMES a sortie — eight empty slots name none, so they neither
   collide with each other nor disarm the mark for the rows that do.
     → null, or { label, tip, suspect } */
WA.soloRowFlag = function (rec, i) {
  const list = (rec && Array.isArray(rec.solo_flights)) ? rec.solo_flights : [];
  const e = list[i];
  if (!e || typeof e !== "object") return null;
  const c = WA.normCode(e.sortie);
  if (!c) return null;
  const twin = list.findIndex((x, j) =>
    j !== i && x && typeof x === "object" && WA.normCode(x.sortie) === c);
  if (twin < 0) return null;
  const a = Math.min(i, twin), b = Math.max(i, twin);
  return { label: WA.SUSPECT_WORD, suspect: true,
           tip: WA.soloPairSuspect(c, (list[a] || {}).slot, (list[b] || {}).slot) };
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 23 — THE LIVE VERDICT ON A FLIGHT-LOG ROW. ONE FUNCTION, THREE
   SURFACES (the WA.slotOwner pattern of 22b, one section over).
   ──────────────────────────────────────────────────────────────────────────
   It was `logSortieFlag` inside student.js, so the ADMIN's drill-down — the
   review surface — showed none of it (22b verify item 13: «the review surface
   must not be blinder than the surface being reviewed»). Lifted here verbatim
   and given the record, it now answers for the student's form, the admin's
   drill-down and the printed brief from ONE body of rules.
   THE ANSWERS, in the order they bite. The first four are REFUSALS said on the
   keystroke (the server raises each of them by name); the last three are MARKS
   — since the ruling of 2026-08-28 nothing about a solo is refused here.
     → null, or { label, tip, suspect }
   An fcf / cef / other row is off-catalogue BY NATURE, so it is never marked
   as a surprise. */
WA.logRowFlag = function (sec, e, rec) {
  const row = e || {};
  const code = WA.normCode(row.sortie);
  if (!code) return null;
  const t = WA.codeTrack(code);
  if (t && row.track && t !== row.track) {
    return { label: WA.itemCatLabel(t) + " table", suspect: false,
      tip: code + " belongs to the " + WA.itemCatLabel(t) + " table — the letter of a Phase II sortie code names its track, so this pair contradicts itself and is refused on save" };
  }
  const b = WA.sortieBand(code);
  if (b && b !== sec) {
    return { label: b === "fs" ? "simulator" : "aircraft", suspect: false,
      tip: code + " is " + (b === "fs" ? "a SIMULATOR sortie — record it under F/S"
                                       : "an AIRCRAFT sortie — record it under Flights") +
        ". Nothing derives the aircraft/simulator split from a code — the generated flow-chart catalogue is the only authority, and where it knows the code it is a fact." };
  }
  if (WA.EVAL_ORDER.indexOf(code) >= 0) {
    return { label: "checkride", suspect: false,
      tip: code + " is a checkride — record it in the Evaluations section, where the syllabus order and the pass rule apply to it. Two rows for one flight would be two grades that can disagree." };
  }
  /* ROUND 23 — THE TWO SOLO MARKS. The first is a property of the SYLLABUS (a
     code nobody flies dual); the second is a property of THIS RECORD (the solo
     section already holds that sortie on that very day). Neither is refused on
     either side any more — the row saves as it stands and wears the word. */
  if (WA.isSoloOnlyCode(code)) {
    return { label: WA.SUSPECT_WORD, suspect: true, tip: WA.soloOnlySuspect(code) };
  }
  const same = WA.soloHolderOf(rec, code, row.date || "");
  if (same) {
    return { label: WA.SUSPECT_WORD, suspect: true,
             tip: WA.soloSameDaySuspect(code, same.slot, row.date) };
  }
  /* (D) THE SOLO-CANDIDATE EXTRA ON ANOTHER DAY — NOT suspect, and the
     JUDGEMENT is recorded (§4y·11·1): a dual C4802 on the 5th beside a solo
     C4803 on the 12th is the commonest TRUE shape in the whole syllabus, and
     marking it suspect would cry wolf on the normal case and teach the
     squadron to ignore the word — the one failure a marking scheme cannot
     survive. So the word here is what it always was: «solo flown». */
  const held = WA.soloHolderOf(rec, code);
  if (held) {
    return { label: "solo flown", suspect: false,
      tip: code + " was flown SOLO on " + fmtD(held.date) +
        " and is recorded in the Solo flights section (" + WA.soloSlotLabel(held.slot) +
        "), which holds its place in the flow chart. This row is a SECOND sortie of the " +
        "same code on ANOTHER DAY — normally a real, separate flight. It is stored, it " +
        "counts, and it is shown as an EXTRA. Nothing is refused and nothing is suspected." };
  }
  if (WA.kindOffCatalogue(row.kind)) return null;
  if (!WA.logSortieKnown(sec, row.track, code)) {
    return { label: "off-catalogue", suspect: false,
      tip: "Not in the generated syllabus catalogue — " + WA.OFFCAT_SAVED +
        " If it was an FCF, a CEF or something else outside the flow chart, say so in the Kind column and this mark goes away." };
  }
  return null;
};

/* ══════════════════════════════════════════════════════════════════════════
   CLIENT-SIDE MIGRATION — the mirror of wa.migrate_record in db/schema.sql.
   The server already migrates on read; this repeats it so the app is correct
   even against a cloud instance whose schema.sql has not been re-run yet.
   Idempotent: a v2 record passes through unchanged.
   ══════════════════════════════════════════════════════════════════════════ */
/* the placeholder wa.migrate_record writes on an NFS event that the v1 counter
   knew about but never dated. MIRROR: db/schema.sql — same text, so the form
   can drop it the moment the student supplies the real date. */
WA.NFS_IMPORT_NOTE = "imported from the old NFS counter — the date was never recorded";

/* PER-SECTION KEY WHITELIST — the exhaustive list of keys ONE entry may carry.
   MIRROR: db/schema.sql → wa.entry_keys. Change one, change the other.
   Anything else is stripped on read and refused on write: a typo is caught
   instead of stored, and a flag the form no longer knows ("pending", retired in
   round 8) can never enter the record (round-4 W3a). */
WA.ENTRY_KEYS = {
  nfs:          ["date", "reason", "note", "legacy", "entered_by"],
  /* ROUND 8: an SMS entrance names the ΚΕΠΕ condition it was raised under */
  sms:          ["entrance_date", "exit_date", "reason", "note", "legacy", "entered_by"],
  fail:         ["date", "category", "flight_code", "items", "instructor", "grade", "legacy", "entered_by"],
  almost_good:  ["date", "category", "flight_code", "items", "instructor", "grade", "legacy", "entered_by"],
  /* ROUND 6: the FLIGHT, not a phase-of-flight note. `phase` stays in the list
     as a READ-ONLY legacy carrier — an already-written note is never destroyed
     — but the form draws no box for it, the server refuses to let the number
     of rows carrying one grow, and such a row cannot be saved again until its
     flight is chosen. */
  airsickness:  ["date", "instructor", "flight_code", "phase", "legacy", "entered_by"],
  /* ROUND 23 — `duration` JOINS THE TWO FIXED SECTIONS, under the SAME KEY the
     log rows use. «Να βάλουμε και το duration στις παράγωγες γραμμές»
     (2026-08-28, evening): one name buys wa.chk_duration, WA.fieldText, the
     [data-dur] handler, durParse / durFix, the CSV Hours column and the change
     list with no new code at all — a second name (`hours`, `dur`) would need
     every one of them twice. Optional everywhere: null / absent is legal, and
     the field NEVER decides a state (§4y·11·3).
     THE REGISTRY ENTRY IS THE MIGRATION: absent ≡ null, so nothing stored has
     to be rewritten — what the entry does is stop the strip from DESTROYING the
     key on the first read (the R19 lesson). */
  evaluations:  ["date", "evaluation", "with", "grade", "duration", "legacy", "entered_by"],
  solo_flights: ["slot", "sortie", "date", "ng", "grade", "instructor", "duration", "legacy", "entered_by"],
  fpc:          ["date", "flight_code", "evaluator", "result", "grade", "legacy", "entered_by"],
  cef:          ["date", "flight_code", "evaluator", "result", "grade", "legacy", "entered_by"],
  /* ROUND 12 — THE LOG TABLES. flights and fs share ONE shape: the same
     flight, flown in the aircraft or in the simulator, is the same set of
     facts. `track` says which of the four tables the row belongs to — it is
     NOT derived from the code, because kind fcf/cef/other have no syllabus
     code at all. `seq` is AUTHORED (1, and 2 for a deliberate same-day
     re-fly), never derived from an array index: an index is a position and
     this is a fact. `instructor_oid` is never drawn as a box.
     ROUND 12b — `note` and `verdict` are GONE, `mission` (complete /
     incomplete) took the verdict's place, and lessons / exams keep four cells
     and three: «Δε θελω πεδιο note … Θελω μονο mission complete, mission
     incomplete … Μη βαλεις εκπαιδευτη για μαθηματα και εξετασεις». */
  flights:      ["date", "track", "sortie", "seq", "kind", "instructor", "instructor_oid",
                 "duration", "grade", "ng", "mission", "legacy", "entered_by"],
  fs:           ["date", "track", "sortie", "seq", "kind", "instructor", "instructor_oid",
                 "duration", "grade", "ng", "mission", "legacy", "entered_by"],
  lessons:      ["date", "end_date", "group", "course", "legacy", "entered_by"],
  /* ROUND 14 — TRIAL and SERIES. `trial` is 2 or 3 and nothing else: the first
     trial is written as no key at all, so every record from before this round
     is already correct. `series`/`series_no` are the Weekly theory exams, which
     name no `exam` — the two shapes are exclusive and the server refuses a row
     that tries to be both. */
  exams:        ["date", "exam", "trial", "series", "series_no", "grade",
                 "legacy", "entered_by"],
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 19 — THE INSTRUCTOR'S OWN CURRENCY (the FDMS bridge lane).
   ──────────────────────────────────────────────────────────────────────────
   RULING (2026-08-26): «στο link που θα στέλνουμε σε κάθε εκπαιδευτή θέλω να
   μπορεί να περάσει κι εκείνος, πέρα από την αξιολόγηση, κάποια δική του πτήση
   S και τα αντίστοιχα Ε. Επίσης να μπορεί να περάσει Ε και σε μια πτήση με
   μαθητή πέρα από τις S. Αυτό θα είναι μια γέφυρα για το currency του FDMS.»

   A SECOND RECORD, AND ITS OWN REGISTRY. An instructor record shares not one
   section name with a student record, so it gets its own whitelist rather than
   a branch inside the student's: a single map serving both would answer
   'currency' with the student's key list, and an unregistered section is not
   rejected by the strip — it is DESTROYED by it, row by row, on the first read.
   MIRROR: db/schema.sql → wa.ins_sections / wa.ins_entry_keys / wa.ins_section_cap.
   ══════════════════════════════════════════════════════════════════════════ */
WA.INS_SECTIONS = ["currency"];
WA.INS_ENTRY_KEYS = {
  /* the section key as the FORM and the CHANGE LIST know it is `ins_currency`
     — a name that cannot collide with any student section on a surface that
     takes both (WA.secLabel, WA.rowLabel, WA.rowIdent). The name the RECORD
     stores is plain `currency`, because inside an instructor's record there is
     nothing else it could be. WA.insSecKey() is the one place the two meet. */
  /* ROUND 20 — `category` is gone and `s_category` is what replaced it. The
     programme is DERIVED from the category (WA.sCatGroup), so the two facts
     that could contradict each other are one fact that cannot.
     ROUND 21 — `sortie` joins for the with-SP kind: a flight with a student is
     named by WHAT WAS FLOWN (the student's syllabus code, a marker of
     WA.WITHSP_MARKERS, or off-catalogue text), and `s_category` becomes a
     CONTINUATION-only fact (surviving on old with-SP rows as the read-only
     legacy carrier).
     MIRROR: db/schema.sql → wa.ins_entry_keys('currency'). */
  ins_currency: ["date", "kind", "s_category", "sortie", "e_items", "seq"],
};
/* MIRROR: db/schema.sql → wa.ins_section_cap. Like every other cap in this
   application it is a runaway-client stop, not a squadron rule: 400 rows is
   about two years of one instructor's own sorties. */
WA.INS_SECTION_CAP = function (sec) { return sec === "ins_currency" ? 400 : 200; };
/* form key ⇄ stored key, in both directions, in one place */
WA.insSecKey = function (formKey) { return String(formKey || "").replace(/^ins_/, ""); };
WA.insFormKey = function (storedKey) { return "ins_" + String(storedKey || ""); };

/* THE TWO KINDS — ROUND 21: «Στο flight επιλογές Continuation, With SP» — the
   ruling's own words, as the STORED keys as well as the labels (the cloud
   table was empty, so the keys moved with the surfaces; wa.migrate_ins_entry
   maps the round-19/20 'own'/'student' on read). They are two because the
   squadron counts them differently — a sortie flown with a student is
   instruction as well as currency. Neither references the student: the flight
   itself lives on the student's own form, and this row is the instructor's
   claim about his own logbook (db/schema.sql → wa.currency_kinds). */
WA.CURRENCY_KINDS = [
  { id: "continuation", label: "Continuation",
    tip: "A Continuation flight of your own — no student aboard («τωρινό own — μετά Continuation»). It is named by its Σ category of Πίνακας 9 / Πίνακας 6, never by a syllabus sortie of the students." },
  { id: "with_sp", label: "With SP",
    tip: "A flight with a student («τωρινό with a student»). It is named by WHAT WAS FLOWN — the student's syllabus sortie, or repeat / fcf / cef. The FLIGHT is the student's and they log it on their own form; this row is your currency claim about the same hour. Nothing here names the student, and nothing here changes their record." },
];
WA.currencyKind = function (id) {
  return WA.CURRENCY_KINDS.find((k) => k.id === String(id || "")) || null;
};
WA.currencyKindLabel = function (id) {
  const k = WA.currencyKind(id);
  return k ? k.label : (id ? String(id) : "—");
};

/* ROUND 21 — THE THREE MARKERS a with-SP row may carry in its sortie box
   beside the student syllabus codes. They ARE the R12 flight-kind ids, stored
   in the SAME field (lowercase words cannot collide with the C4101 code
   shapes), deliberately without 'syllabus' (a syllabus flight is named by its
   code) and without 'other' (the off-catalogue free text IS the other).
   MIRROR: db/schema.sql → wa.withsp_markers(). */
WA.WITHSP_MARKERS = [
  { id: "repeat", short: "repeat", label: "repeat — a re-fly of a syllabus flight",
    tip: "The student re-flew a syllabus sortie. Their own row says which; if you know the code, picking it from the syllabus list joins the two rows tighter." },
  { id: "fcf", short: "FCF", label: "FCF — aircraft test flight",
    tip: "Functional Check Flight — not a syllabus sortie of the students, so it is named by the marker." },
  { id: "cef", short: "CEF", label: "CEF — Εξέταση Καταλληλότητας",
    tip: "Εξέταση Καταλληλότητας — recorded on the student's side as an evaluation; here it is your flight of that day." },
];
WA.withspMarker = function (id) {
  const k = String(id === null || id === undefined ? "" : id).trim().toLowerCase();
  return WA.WITHSP_MARKERS.find((m) => m.id === k) || null;
};
/* the FULL printed name of a with-SP sortie value — the marker's label, the
   catalogue code with its printed name, or the off-catalogue text as typed */
WA.curSortieText = function (v) {
  const m = WA.withspMarker(v);
  if (m) return m.label;
  const c = WA.normCode(v);
  const band = WA.sortieBand(c);
  if (band) {
    for (const t of WA.TRACKS) {
      const s = WA.logSortie(band, t, c);
      if (s) return s.c + " — " + s.n;
    }
    return c;
  }
  return String(v === null || v === undefined ? "" : v);
};
/* the SHORT form — what a chip or a narrow cell prints */
WA.curSortieCode = function (v) {
  const m = WA.withspMarker(v);
  if (m) return m.short;
  const s = WA.normCode(v);
  return s || String(v === null || v === undefined ? "" : v);
};
/* is this value one the catalogue or the marker list knows? (an unknown one is
   accepted — the syllabus data can lag reality — and shown marked) */
WA.curSortieKnown = function (v) {
  if (!String(v === null || v === undefined ? "" : v).trim()) return true;
  return !!WA.withspMarker(v) || !!WA.sortieBand(v);
};

/* THE TWO PROGRAMMES, IN THE NAMES THE 3-01 PRINTS. «ΑΕΡΟΣ» is the semester
   AIR programme (Πίνακας 9) and «F/S» the semester SIMULATOR one (Πίνακας 6):
   the first and the last section of the FDMS currency card. The interface of
   this application is English and these two words are not — deliberately, and
   for the reason the Weekly tip gives for keeping ΕΕΘ in its own tooltip: they
   are what is PRINTED on the sheet the instructor is copying from, and an
   invented English pair would make him translate twice. The English is one
   hover away, which is where a terminology bridge belongs.
   MIRROR: db/schema.sql → wa.currency_categories. */
WA.CURRENCY_CATS = [
  { id: "aeros", label: "ΑΕΡΟΣ", en: "air",
    tip: "ΑΕΡΟΣ — the semester AIR programme of the 3-01 (Πίνακας 9): the sorties flown in the aircraft. It is the first section of the currency card in FDMS." },
  { id: "fs", label: "F/S", en: "simulator",
    tip: "F/S — the semester SIMULATOR programme of the 3-01 (Πίνακας 6). The squadron counts simulator sorties and aircraft sorties separately, which is why they are two answers here and not one." },
];
WA.currencyCat = function (id) {
  return WA.CURRENCY_CATS.find((c) => c.id === String(id || "")) || null;
};
WA.currencyCatLabel = function (id) {
  const c = WA.currencyCat(id);
  return c ? c.label : (id ? String(id) : "—");
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 20 — THE Σ TAXONOMY: WHICH SORTIE, NOT WHICH TABLE.
   ──────────────────────────────────────────────────────────────────────────
   RULING (2026-08-27): «θα έπρεπε να έχουμε ποια S είναι και δυνατότητα
   πολλαπλών Ε. Αφού θα τροφοδοτούν το ίδιο σχήμα με το FDMS να τα έχουμε
   σωστά.»

   Round 19 asked «ΑΕΡΟΣ or F/S?» and stopped. That is the TABLE the sortie
   belongs to, not the sortie: Πίνακας 9 prints six ΑΕΡΟΣ rows and Πίνακας 6 six
   F/S rows, and a currency register that cannot say which of them was flown
   cannot feed the register FDMS keeps — which is exactly what this lane exists
   to do. So the row carries the CATEGORY and the programme is derived from it:
   one fact where there were two, and no way for them to disagree.

   THE CATALOGUE IS GENERATED, from the same FDMS research file the E-items come
   from, by the same run of the same script (tools/gen-currency-catalog.py) —
   so the list this form offers and the list db/schema.sql enforces cannot
   drift. The two rows the 3-01 does not print are FDMS's own recording columns,
   carried under its ids and its printed names and asserted against its client
   at build time.
   ══════════════════════════════════════════════════════════════════════════ */
WA.S_CATEGORIES = (typeof WA_S_CATEGORIES === "object" && WA_S_CATEGORIES &&
                   Array.isArray(WA_S_CATEGORIES.items)) ? WA_S_CATEGORIES.items : [];
WA._S_BY_ID = (() => {
  const m = {};
  for (const it of WA.S_CATEGORIES) m[it.id] = it;
  return m;
})();
WA.sCat = function (id) { return WA._S_BY_ID[String(id || "")] || null; };
/* THE CATEGORIES A NEW ROW MAY BE GIVEN — everything except the legacy ids,
   which are STORABLE (a migrated record must round-trip) and never OFFERED. */
WA.sCatOptions = function () { return WA.S_CATEGORIES.filter((c) => !c.legacy); };
WA.sCatIsLegacy = function (id) { const c = WA.sCat(id); return !!(c && c.legacy); };
/* the SHORT name — the printed code, which is what a currency sheet says */
WA.sCatCode = function (id) {
  const c = WA.sCat(id);
  return c ? c.c : String(id || "");
};
/* the FULL printed name — «Σ-3 — Air-to-Ground missions, day/night». This is
   what WA.rowLabel prints, by the ruling: a change list that named a sortie
   «Σ-3» would be naming it in a code half the squadron reads off paper. */
WA.sCatText = function (id) {
  const c = WA.sCat(id);
  return c ? c.c + " — " + c.n : String(id || "");
};
/* WHICH PROGRAMME — derived, never stored. An id nobody knows has no
   programme, and every surface prints «—» for it rather than guessing one. */
WA.sCatGroup = function (id) {
  const c = WA.sCat(id);
  return c ? c.g : "";
};
WA.sCatGroupLabel = function (id) {
  const g = WA.sCatGroup(id);
  return g ? WA.currencyCatLabel(g) : (id ? "—" : "—");
};
WA.sCatTip = function (id) {
  const c = WA.sCat(id);
  if (!c) {
    return "This category is not in the Πίνακας 9 / Πίνακας 6 list this application carries. " +
           "It cannot be saved: choose one of the printed categories instead.";
  }
  if (c.legacy) {
    return WA.sCatText(c.id) + " — " + (WA_S_CATEGORIES.legacyWhy || "recorded before the Σ taxonomy") +
      ". The programme (" + WA.currencyCatLabel(c.g) + ") is what the old row really carried; the Σ is not, " +
      "and this form will not invent one.";
  }
  const quota = c.p === undefined
    ? "the 3-01 prints a dash for it — no sortie is required, it is recorded when it is flown"
    : "the 3-01 prints " + c.p + " sortie" + (c.p === 1 ? "" : "s") + " per semester for a POSTED instructor" +
      (c.a === undefined ? " and a dash for an attached one" : " (" + c.a + " attached)");
  return WA.sCatText(c.id) + " · " + WA.currencyCatLabel(c.g) +
    (c.aid ? " · not a printed row of Πίνακας 9: " + c.why : " · " + quota) +
    (c.tp ? " · flown by the squadron's Test Pilots" : "") +
    /* ROUND 21 — the dp mark, exactly as tp renders: MARKED, never hidden,
       because this roster has no demo_pilot flag to hide it by */
    (c.dp ? " · Demo pilots only — the option is marked, never hidden" : "") +
    ". The semester itself is counted in FDMS; this form records that the sortie was flown, and on what day.";
};

/* ── THE E-ITEMS ──────────────────────────────────────────────────────────
   The EVENTS table of the 3-01/2025 ΔΑΕ, generated from the FDMS research
   file into app/currency-catalog.js and into db/schema.sql by ONE run of
   tools/gen-currency-catalog.py — so the closed list this form offers and the
   closed list the server enforces cannot drift.
   THE STORED VALUE IS THE ASCII id. The printed code is Greek and its Ε and α
   are homoglyphs of Latin E and a: a stored code would be a value nobody could
   retype and no two systems could reliably compare. */
WA.E_ITEMS = (typeof WA_E_ITEMS === "object" && WA_E_ITEMS && Array.isArray(WA_E_ITEMS.items))
  ? WA_E_ITEMS.items : [];
WA._E_BY_ID = (() => {
  const m = {};
  for (const it of WA.E_ITEMS) m[it.id] = it;
  return m;
})();
WA.eItem = function (id) { return WA._E_BY_ID[String(id || "")] || null; };
/* the SHORT name — the printed code, which is what a currency sheet says */
WA.eItemCode = function (id) {
  const it = WA.eItem(id);
  return it ? it.c : String(id || "");
};
/* the FULL name — «Ε-32 — BFM (Basic Fighter Manoeuvres)» */
WA.eItemText = function (id) {
  const it = WA.eItem(id);
  return it ? it.c + " — " + it.n : String(id || "");
};
WA.eItemTip = function (id) {
  const it = WA.eItem(id);
  if (!it) return "This event is not in the 3-01 EVENTS table this application carries. It cannot be saved: choose one of the printed events instead.";
  return WA.eItemText(it.id) +
    (it.seat ? " · seat " + it.seat : "") +
    (it.d ? " · the 3-01 prints a " + it.d + "-day window for an experienced (ΕΜΠ) instructor" :
            " · the 3-01 prints no window for it — the availability is kept") +
    ". The window itself is counted in FDMS; this form records that the event was flown, and on what day.";
};
/* the ids of one row, in CATALOGUE ORDER and without repeats. The order is not
   cosmetic: WA.sameValue compares arrays as JSON, so two rows holding the same
   events in a different order would read as a change nobody made. */
WA.eItemsOf = function (e) {
  const raw = (e && Array.isArray(e.e_items)) ? e.e_items : [];
  const want = {};
  for (const v of raw) want[String(v || "").trim()] = true;
  const out = WA.E_ITEMS.filter((it) => want[it.id]).map((it) => it.id);
  /* an id the catalogue does not know is KEPT and shown marked, never dropped
     silently — the server will refuse it by name, which is the message that
     tells the instructor what to fix */
  for (const k of Object.keys(want)) if (k && !WA.eItem(k)) out.push(k);
  return out;
};
WA.eItemsText = function (e) {
  const ids = WA.eItemsOf(e);
  return ids.length ? ids.map(WA.eItemCode).join(" · ") : "";
};

/* THE CLIENT'S READ-TIME REPAIR of an instructor record — the mirror of
   wa.migrate_instructor_record.
   ROUND 20 — AND IT HAS EXACTLY ONE LEGACY SHAPE TO HEAL: a round-19 row that
   stored the PROGRAMME (`category`) and no Σ category at all. It does not
   guess. Nobody can reconstruct from «ΑΕΡΟΣ on the 26th» whether the sortie was
   a Σ-1 or a Σ-3, so the programme the row really carried is mapped onto a
   category whose printed name SAYS the Σ was never recorded, and the form
   renders it marked. TWO legacy ids and not one, so the fact the old row DID
   carry is not thrown away in order to be honest about the one it did not.
   THE ORDER MATTERS: the legacy pass runs before the whitelist, because the
   whitelist is what makes `category` stop existing.
   MIRROR: db/schema.sql → wa.migrate_ins_entry + wa.migrate_instructor_record. */
WA.INS_LEGACY_CAT = { aeros: "legacy-aeros-unspecified", fs: "legacy-fs-unspecified" };
/* ROUND 21 — TWO MORE ARMS, IN ORDER (the mirror of wa.migrate_ins_entry):
   the kind map first ('own' → 'continuation', 'student' → 'with_sp' — the
   stored keys moved with the surfaces, §4x·1), then the marker fold (a sortie
   whose lowercase form is repeat/fcf/cef becomes that lowercase id — the
   normalisation boundary upper-cases every `sortie`, and the markers ARE the
   lowercase R12 kind ids), then the round-20 category→legacy arm. An
   s_category on a (now) with_sp row is KEPT AS-IS — the legacy carrier. */
WA.migrateInsEntry = function (sec, e) {
  if (!e || typeof e !== "object") return {};
  if (sec !== "ins_currency") return e;
  let x = e;
  const kmap = { own: "continuation", student: "with_sp" };
  if (kmap[String(x.kind || "")]) x = { ...x, kind: kmap[String(x.kind)] };
  const m = WA.withspMarker(x.sortie);
  if (m && String(x.sortie) !== m.id) x = { ...x, sortie: m.id };
  if (x.s_category) return x;
  const legacy = WA.INS_LEGACY_CAT[String(x.category || "")];
  return legacy ? { ...x, s_category: legacy } : x;
};
WA.migrateInsRecord = function (rec) {
  const src = (rec && typeof rec === "object") ? rec : {};
  const out = {};
  for (const stored of WA.INS_SECTIONS) {
    const form = WA.insFormKey(stored);
    const keep = WA.INS_ENTRY_KEYS[form] || [];
    const list = Array.isArray(src[stored]) ? src[stored] : [];
    out[stored] = list.map((raw) => {
      const e = WA.migrateInsEntry(form, raw);
      const o = {};
      if (e && typeof e === "object") {
        for (const f of keep) if (Object.prototype.hasOwnProperty.call(e, f)) o[f] = e[f];
      }
      return o;
    });
  }
  return out;
};

/* WHICH SORTIE OF THE DAY — 1 unless the row says otherwise, and the key is
   only ever written when it says something (the round-14 `trial` doctrine),
   so a record from before a second flight existed needs no rewriting. */
WA.curSeq = function (e) {
  const n = Math.round(Number((e || {}).seq));
  return (isFinite(n) && n >= 1) ? n : 1;
};
/* DATE ORDER, NEWEST FIRST, and the same-day sorties in their own order. The
   list is open-ended — there is no syllabus to lay it out — so the only order
   it can have is the one a logbook has. */
WA.curSort = function (list) {
  return (Array.isArray(list) ? list.slice() : []).map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const da = String(a.e.date || ""), db = String(b.e.date || "");
      if (da !== db) return da < db ? 1 : -1;      /* newest first */
      const sa = WA.curSeq(a.e), sb = WA.curSeq(b.e);
      if (sa !== sb) return sa - sb;
      return a.i - b.i;
    });
};
/* the identity two versions of one currency row share — and the identity the
   server refuses a second copy of (wa.validate_instructor_record).
   ROUND 21 — one formula, both kinds: the what-was-flown slot is the Σ
   category where the row carries one, else the sortie folded to upper case
   (the server's coalesce + upper(wa.norm_line(…)), mirrored). */
WA.curIdent = function (e) {
  const x = e || {};
  const what = String(x.s_category || "") || WA.normCode(x.sortie || "");
  return [String(x.kind || ""), what, String(x.date || ""), WA.curSeq(x)].join("|");
};

/* ── AN EMPTY FIXED SLOT (round 5) ─────────────────────────────────────────
   The eight solos and the eight checkrides are rows the SYLLABUS puts in the
   record, not events the student reported. Until one is flown it is a
   placeholder: it is never counted, never exported as an entry and never
   stamped "entered by the admin".
   ROUND 23 — AND `duration` IS PART OF THE TEST, ON BOTH ROWS. This is the
   three-valued-logic seam of the round (the round-20b rule: presence before
   membership), and it has one right answer. `empty(v)` is null / undefined /
   "" — an absent key, an explicit null and a cleared box are all empty — so NO
   STORED RECORD CHANGES STATE ON DEPLOY: no record can carry the key today,
   because it was unregistered and therefore stripped on every read. A row
   carrying ONLY a duration correctly stops being an empty slot (a duration is
   a report about a flight that happened) and is then asked for its date and
   its instructor by the rules that already exist — the same shape as typing a
   grade and nothing else, which is the behaviour this round wants.
   MIRROR: db/schema.sql → wa.slot_empty. */
WA.slotEmpty = function (sec, e) {
  if (!e || typeof e !== "object") return false;
  const empty = (v) => v === null || v === undefined || v === "";
  if (sec === "solo_flights") {
    return !empty(e.slot) && empty(e.date) && empty(e.grade) &&
           empty(e.instructor) && empty(e.sortie) && empty(e.duration) && !e.ng;
  }
  /* ROUND 8: the pending tick is gone, so an evaluation slot is empty when it
     carries nothing but its identity — which is all it ever meant. */
  if (sec === "evaluations") {
    return !empty(e.evaluation) && empty(e.date) && empty(e.grade) &&
           empty(e.with) && empty(e.duration);
  }
  return false;
};
/* ══════════════════════════════════════════════════════════════════════════
   ROUND 13 — THE PRE-SEEDED SYLLABUS SLOTS.
   ──────────────────────────────────────────────────────────────────────────
   THE REVIEW (2026-08-20): «Οπως ειναι τωρα πρεπει να καταχωρησει καθε πτηση
   ο μαθητης. Εγω θελω να εχουμε ηδη ετοιμες τις πτησεις. Οταν ειναι complete
   και ολα τα στοιχεια συμπληρωμενα θα γινεται χρωμα πρασινο. Οτι εχει
   ξεκινισει να γραφει ο μαθητης αντιστοιχο ανοιχτο πρασινο. Οτι χρωσταει
   καποια αποχρωση οπως γκρι. Οτι ειναι εξτρα θα εχει ενα μουσταρδι χρωμα ας
   πουμε. Ομοιως για ολες τις κατηγοριες. Και ετοιμα τα ground lessons.»

   THE PATTERN IS THE SOLO-SLOTS PATTERN, SCALED. solo_flights has rendered
   eight fixed slots since round 5 and stores only what was flown; the same
   idea now covers the four log sections — 125 flight/simulator sorties, 47
   ground courses and 8 ground exams are drawn as rows FROM THE FIRST DAY.

   AND THE STORAGE STAYS SPARSE, which is the whole engineering of it. An
   untouched slot stores NOTHING: buildPayload drops it, so the server never
   receives it, wa.slot_empty needs no new branch, the admin-entry arithmetic
   ("3 of 80 entered by the admin") is not diluted by 180 placeholders nobody
   reported, and the payload caps are exactly where they were.

   THREE FUNCTIONS DECIDE EVERYTHING, and every surface calls them:
     WA.slotKey     — WHICH slot a row could occupy (null = an extra)
     WA.claims      — WHO actually occupies it (first row in stored order)
     WA.rowState    — done · started · owed · extra
   ONE ROW PER SLOT: a stored syllabus row CLAIMS its slot and no placeholder
   is drawn beside it; a SECOND row for the same sortie is an EXTRA, because
   the slot is the syllabus's ONE planned pass and a re-fly is not it.
   NO SERVER CHANGE: the slots are a RENDER, never storage. The catalogues
   live in app/items-catalog.js and the server keeps no second copy.
   ══════════════════════════════════════════════════════════════════════════ */
WA.SLOT_SECTIONS = ["flights", "fs", "lessons", "exams"];
WA.hasSlots = function (sec) { return WA.SLOT_SECTIONS.indexOf(sec) >= 0; };

/* HOW MANY ENTRIES ONE SECTION MAY HOLD — the client's mirror of
   wa.section_cap(). It is not a validation (the server's is), it is what an
   affordance that MINTS rows has to know before it mints one: «unlimited count
   within caps» is only true if something knows where the cap is.
   MIRROR: db/schema.sql → wa.section_cap. */
WA.sectionCap = function (sec) {
  return (sec === "flights" || sec === "fs" || sec === "lessons") ? 400 : 200;
};

/* THE FOUR STATES, in the user's own terms. `label` is the word every count,
   legend, CSV cell and tooltip uses — one vocabulary, so the colour on screen
   and the word on paper can never say different things. */
WA.ROW_STATES = [
  { id: "done", label: "done", el: "πράσινο",
    tip: "Complete — everything the row asks for is filled in AND the mission was completed: the date, the instructor, the duration, and a grade of " + WA.passMin() + " % or better (or a mission the squadron characterised complete without a percentage). A non-graded (NG) flight is done on its date, its instructor and its duration: nobody was in a position to score it. A ground lesson is done on its date, a ground exam on its date AND its result — WHATEVER the result says: an exam marked 40 % is a complete row, because the row asked for a result and got one. Whether it PASSED is the other axis (" + WA.passMin("exams") + " % on a ground exam), and it decides which trial stands for the exam, not whether the row is finished." },
  { id: "started", label: "started", el: "ανοιχτό πράσινο",
    tip: "Started — the row has been written in, but not everything is there yet. A flight with a date and no instructor, a flight still waiting for its debrief, an exam sat but not marked. It is not a problem and it blocks nothing; it is work in progress." },
  { id: "owed", label: "owed", el: "γκρι",
    tip: "Owed — the syllabus prescribes this sortie / course / exam and nothing has been recorded against it yet. It is a row of the printed flow chart, not something anybody reported, and NOTHING IS STORED for it until the first keystroke." },
  { id: "extra", label: "extra", el: "μουστάρδι",
    tip: "Extra — beyond the syllabus's one planned pass: a repeat, an FCF, a CEF, anything filed as Other, a same-day re-fly (#2 and up), a second row for a sortie whose slot is already taken, or a code the generated catalogue does not know. It is a real flight and it counts in the hours; it simply is not the planned pass." },
];
WA.rowStateDef = function (id) {
  return WA.ROW_STATES.find((s) => s.id === id) || WA.ROW_STATES[2];
};
/* ROUND 14b (verify finding 3) — THE CHIP'S SENTENCE, IN THE ROW'S OWN TERMS.
   The word is the same on every row — one vocabulary, and the four colours mean
   one thing — but the generic OWED sentence ends «It is a row of the printed
   flow chart, not something anybody reported», which is true of the 181 seeded
   slots and FALSE of the two shapes round 14 added. A Weekly exam's own cell
   says the syllabus does not enumerate them; a minted 2nd trial is a re-sit somebody
   ORDERED. Both wear the grey, correctly — «on the programme, nothing recorded
   yet» is exactly what they are — and both carried a chip that contradicted the
   tooltip two columns away, and got the one fact backwards that decides whether
   anything is stored for them. The precedent is round 12b's WA.debriefWord: the
   WORD is the same everywhere, the SENTENCE is section- and row-aware. */
WA.rowStateTip = function (sec, e, st, att) {
  const d = WA.rowStateDef(st);
  /* ROUND 23 — AND THE FAIL SEAM HAS ITS OWN SENTENCE, on a position with no
     row of this table behind it at all. «Started» there does not mean «written
     in and not finished»: it means an attempt at this sortie is ON THE RECORD,
     in the FAIL / ALMOST GOOD section, and the position is not complete until
     an attempt is Mission Complete. The precedent is round 12b's
     WA.debriefWord: the WORD is the same everywhere, the SENTENCE is section-
     and row-aware. */
  if ((sec === "flights" || sec === "fs") && att && (att.fails || []).length) {
    if (st === "started") {
      return "Started — an attempt at this sortie is on the record: " +
        ((att.fails || []).some((x) => x.sec === "fail") ? "a FAIL is" : "an ALMOST GOOD is") +
        " recorded against it in the " +
        WA.secLabel((att.fails || [])[0].sec) + " section. The position is not complete until " +
        "an attempt is Mission Complete.";
    }
    return d.tip;
  }
  if (sec !== "exams" || !e || typeof e !== "object") return d.tip;
  const ser = WA.examSeries(e);
  if (!ser && !WA.rowMinted(sec, e)) return d.tip;          /* a true slot row */
  const what = ser
    ? "a planned weekly theory exam (" + WA.examRowLabel(e) + ")"
    : "a planned " + WA.examTrialWord(WA.examTrial(e)) + " of " + String(e.exam);
  const tail = ser
    ? " The Weekly exams are not rows of the printed flow chart — the syllabus does not enumerate them, they are numbered in the order they are sat — and unlike a flow-chart slot this row IS stored: nothing but the record remembers that it was put on the programme."
    : " A re-sit is ORDERED, not prescribed, so this is not a row of the printed flow chart — and unlike a flow-chart slot it IS stored: nothing but the record remembers that the squadron ordered it.";
  if (st === "owed") {
    return "Owed — " + what + ", on the programme and nothing recorded against it yet." + tail;
  }
  if (st === "started") {
    return "Started — " + what + ", written in and not finished: an exam sat and not marked yet." + tail;
  }
  if (st === "done") {
    return "Complete — " + what + ", with its date and its result both in." + tail;
  }
  return d.tip;
};

/* THE SLOT CATALOGUE OF ONE SECTION, in syllabus order — the flow chart for
   the two flight logs, the 47 (group, course) pairs for the lessons and the 8
   exam groups. Built once and cached: it is derived from the generated
   catalogue and cannot change while the page is open.

   ROUND 22 — THE EIGHT CHECKRIDES REJOIN THE FLIGHT LOG, AS POSITIONS.
   RULING (2026-08-28): «Στα flights δεν έχεις τις αξιολογήσεις — τις
   θέλουμε.» Until this round the flow chart was drawn into these tables MINUS
   its eight checkrides, and the table said so; the effect was that the one
   place the squadron reads a stage in flow-chart order had eight holes in it,
   and «what is this student still owed» was answered short by eight.
   WHAT DOES NOT CHANGE — WHERE THE FACT LIVES. A checkride is stored ONLY in
   Evaluations, the R12 refusal stands verbatim, and nothing here is editable
   or storable: `ck: true` marks a position whose ROW IS DERIVED (see
   WA.derivedSlots) or, until it is flown, simply OWED. The number of aircraft
   sorties the chart prescribes goes 77 → 85 and the four Contact / Instrument
   / Formation / Navigation tables each gain their own; the SIMULATOR tables
   gain none, because none of the eight is an F/S sortie.
   THE DROPDOWN DROPS THEM (WA.logPickList): a position nobody may type into
   needs no option in the picker.

   ROUND 22b (verify finding 1) — AND THE SOLO POSITION IS THE SAME SHAPE.
   `so` marks a position whose code is a SOLO BY DEFINITION (WA.soloOnlyCodes,
   today exactly C4791): the server refuses EVERY flights row naming one, so
   this table can no more hold that row than it can hold a checkride. It was
   marked nowhere, and the consequence was a frozen record — a legacy carrier
   claimed the position, rendered as an ordinary green planned pass with no
   flag anywhere, and the refusal it caused was met only AFTER the save failed.
   Both markers now mean one thing everywhere: NOT A POSITION OF THIS TABLE —
   never seeded, never claimed, DERIVED from the section that owns the fact
   (WA.derivedSlots) or plainly OWED, and read-only wherever it is drawn. */
WA.slotDefs = function (sec) {
  WA._slotDefs = WA._slotDefs || {};
  if (WA._slotDefs[sec]) return WA._slotDefs[sec];
  const out = [];
  if (sec === "flights" || sec === "fs") {
    for (const t of WA.TRACKS) {
      for (const s of WA.logSorties(sec, t)) {
        out.push({ key: t + "|" + s.c, sec, track: t, code: s.c, sortie: s,
                   ck: !!s.k, so: WA.isSoloOnlyCode(s.c) });
      }
    }
  } else if (sec === "lessons") {
    for (const g of WA.groundGroups()) {
      for (const c of (g.courses || [])) {
        out.push({ key: g.g + "|" + c.c, sec, group: g.g, course: c.c, grp: g, crs: c });
      }
    }
  } else if (sec === "exams") {
    for (const x of WA.examList()) out.push({ key: x.id, sec, exam: x.id, def: x });
  }
  out.forEach((d, i) => { d.o = i; });
  WA._slotDefs[sec] = out;
  return out;
};
WA.slotIndex = function (sec) {
  WA._slotIx = WA._slotIx || {};
  if (WA._slotIx[sec]) return WA._slotIx[sec];
  const ix = {};
  for (const d of WA.slotDefs(sec)) ix[d.key] = d;
  WA._slotIx[sec] = ix;
  return ix;
};
/* how many slots one scope holds — a track of a log, or the whole section */
WA.slotCount = function (sec, track) {
  return WA.slotDefs(sec).filter((d) => track == null || d.track === track).length;
};
/* ROUND 22b — WHICH SECTION OWNS A POSITION THIS TABLE MAY NOT HOLD, or null
   for an ordinary slot. One function, so the student's form, the admin's
   drill-down and the printed brief cannot name three different owners for one
   position — and so a third source, if the syllabus ever grows one, is added
   in one line rather than at every surface that draws a row. */
WA.slotOwner = function (d) {
  if (!d) return null;
  return d.ck ? "evaluations" : (d.so ? "solo_flights" : null);
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 23 — WHICH POSITION A ROW IS *ABOUT* (never a claim on it).
   ──────────────────────────────────────────────────────────────────────────
   `slotKey` answers «may this row HOLD that position»; this answers «which
   position is this row an attempt at». They were one question until the ruling
   of 2026-08-28 made a repeat and a same-day re-fly ATTEMPTS at the position
   rather than rows with nowhere to sit, and keeping them apart is what lets a
   non-operative attempt render UNDER its slot instead of at the foot of the
   table. Null for the ground sections, and null for an off-catalogue KIND —
   an fcf / cef / other names no syllabus position at all, its flight box is
   free text and it belongs in the extras block, exactly as before. */
WA.slotHome = function (sec, e) {
  if (!e || typeof e !== "object") return null;
  if (sec !== "flights" && sec !== "fs") return null;
  if (WA.kindOffCatalogue(e.kind)) return null;
  const code = WA.normCode(e.sortie);
  if (!code || !e.track) return null;
  const k = e.track + "|" + code;
  return WA.slotIndex(sec)[k] ? k : null;
};
/* WHICH SLOT THIS ROW COULD OCCUPY — null when the row is an EXTRA by nature.
   ROUND 23 — AND «BY NATURE» NO LONGER MEANS «NOT THE FIRST ATTEMPT». The
   ruling: «Μια έξοδος (π.χ. C4202) μπορεί να πεταχτεί Mission Incomplete — δεν
   μετράει στη ροή του syllabus· θα μετρήσει μόνο όταν είναι Mission Complete.
   Ένα solo που δεν πετάχτηκε σε μια ενότητα (λόγω καιρού) συνήθως πετιέται σε
   κάποιο repeat.» Until this round `seq === 1 && kind === 'syllabus'` was the
   gate, so a Mission-Incomplete first attempt claimed its position FOR EVER
   and the completed re-fly could never take it — the half of the ruling that
   was untrue. The gate is gone and the EXAMS DOCTRINE takes its place: every
   row that names a position is an ATTEMPT at it, exactly as the three trials
   of IN190 are three attempts at one exam, and WA.claims hands the position to
   the OPERATIVE one (WA.logOperativeIx — the latest Mission Complete, or the
   first in stored order while none has completed).
   What has NOT changed: a position this table does not OWN (`ck` / `so`) is
   still denied a key here, so the 22b hole does not re-open; and a repeat is
   still not «on the programme» (WA.rowPlanned is untouched), so every
   non-operative attempt still reads `extra` — the ruling's own word.
   A course that is not a course OF ITS GROUP is still an extra too (the join
   key is the PAIR — OJT is a course of four different groups).
   ROUND 22 — AND NEVER A DERIVED POSITION. A checkride position (`ck`) is
   filled from Evaluations and from nowhere else, so a stored flights row
   naming one may not take it: the server refuses such a row by name, and a
   legacy carrier that predates the refusal renders as a marked EXTRA — kept,
   visible, asked for, never destroyed and never mistaken for the planned
   pass.
   ROUND 22b (verify finding 1) — AND NEITHER MAY A SOLO-ONLY POSITION (`so`).
   Round 22 blocked the solo positions in WA.claims, from the DERIVED map —
   which is per record and therefore only while a solo is actually recorded.
   The commonest legacy shape has the solo slot EMPTY, so nothing derived, so
   the stored C4791 row claimed the position and rendered as an ordinary green
   planned pass: no flag, no chip, no sentence — while the server refused every
   save of that record, a duration edit three sections away included. The
   mark set is a property of the SYLLABUS, not of the record (a code nobody
   ever flies dual), so it belongs here, beside `ck`, where one row is enough to
   answer: the row falls through to a marked EXTRA carrying the tier-1 sentence
   as its chip, derived row or not, and the position reads OWED until the Solo
   flights section fills it. The tier-2 mark stays per RECORD (a candidate
   flown dual on another day is a real flight) and lives in WA.logRowFlag.
   ROUND 23 — AND THE «server refused every save» CLAUSE ABOVE IS HISTORY. The
   server ACCEPTS such a row now and the client MARKS IT SUSPECT (§4y·11·1);
   the position is still never claimed by it, because a code nobody flies dual
   is a property of the SYLLABUS and that has not changed — which is exactly
   why this block, and not the refusal, was the load-bearing half of 22b. */
WA.slotKey = function (sec, e) {
  if (!e || typeof e !== "object") return null;
  if (sec === "flights" || sec === "fs") {
    const k = WA.slotHome(sec, e);
    if (!k) return null;
    return WA.slotOwner(WA.slotIndex(sec)[k]) ? null : k;
  }
  if (sec === "lessons") {
    const c = WA.normLine(e.course);
    if (!e.group || !c) return null;
    const k = e.group + "|" + c;
    return WA.slotIndex(sec)[k] ? k : null;
  }
  if (sec === "exams") {
    /* ROUND 14 — a Weekly exam names no exam and occupies no slot: the
       series is not in the syllabus's enumerated eight, so there is nothing
       for it to claim.
       A TRIAL, on the other hand, keeps its exam's key on purpose — all three
       trials of IN190 compete for the IN190 slot and WA.claims hands it to the
       operative one (the pass-attempt rule), which is what makes the slot's
       colour follow the successful attempt rather than the first row typed. */
    if (WA.examSeries(e)) return null;
    const x = WA.normLine(e.exam);
    return (x && WA.slotIndex(sec)[x]) ? x : null;
  }
  return null;
};
/* ══ ROUND 14 — TWO QUESTIONS ABOUT A ROW THAT HOLDS NO SLOT ═══════════════
   They sound alike and they are not, and keeping them apart is what makes the
   exams section behave.

   WAS IT MINTED?  — did somebody CREATE this row with an affordance: the next
     a Weekly exam, or the 2nd / 3rd trial of an exam. A minted row is a REPORT
     even when it is empty («a re-sit has been ordered»), so it is stored, it is never
     mistaken for a seeded placeholder, and it never silently disappears on the
     next save. A blank trial-1 row, by contrast, IS the seeded placeholder.
     → WA.slotUntouched, WA.claims

   IS IT ON THE PROGRAMME? — should it wear the MUSTARD? `extra` means «beyond
     the syllabus's one planned pass», and EVERY attempt at one of the eight is
     within the plan whichever trial it is: when a 2nd trial passes it takes the
     slot, and the failed FIRST attempt that it displaces is not suddenly an
     off-catalogue extra — it is the first trial, and it is shown as one. Only a
     row naming no known exam at all is an extra here.
     → WA.rowState */
WA.rowMinted = function (sec, e) {
  if (!e || typeof e !== "object") return false;
  /* ROUND 23 — AND THE FLIGHT LOGS MINT ROWS TOO, AND IT IS LOAD-BEARING.
     A repeat / FCF / CEF / other, and a same-day re-fly (seq > 1), are rows
     somebody CREATED with an affordance — the Kind picker and the ↻ button,
     the exact round-14 doctrine. Until this round they were extras by nature
     and never claimed a slot, so nothing ever asked whether they were
     placeholders. Now that they CAN claim one (WA.slotKey), a blank Repeat row
     with a sortie chosen would satisfy WA.slotUntouched and be SILENTLY
     DROPPED from the payload — the student's click quietly undoing itself. It
     is a REPORT: it is stored, it is refused by name («the date is required»),
     and — WA.claims 's minted-and-blank line — it cannot take the position off
     a written row while it holds nothing. */
  if (sec === "flights" || sec === "fs") {
    return (e.kind || "syllabus") !== "syllabus" ||
           Math.round(Number(e.seq) || 1) > 1;
  }
  if (sec !== "exams") return false;
  if (WA.examSeries(e)) return true;
  return !!WA.exam(WA.normLine(e.exam)) && WA.examTrial(e) > 1;
};
/* ── ROUND 23 — WAS THE SORTIE COMPLETED? ─────────────────────────────────
   «Θα μετρήσει μόνο όταν είναι Mission Complete.» Independent of whether the
   row is FULLY filled in: it reads the grade where there is one (the 60 % of
   ΠΔ 151/13, through WA.rowMission) and the hand-set mission where there is
   not, and it keeps the app-wide NG exception — a flight nobody could score
   was still flown and completed. WA.rowDone is the stricter question (is
   EVERYTHING in as well), and it is unchanged. */
WA.flightCompleted = function (e) {
  if (!e || typeof e !== "object") return false;
  return !!e.ng || WA.rowMission(e) === "complete";
};
/* ── ROUND 23 — WHICH OF SEVERAL ATTEMPTS HOLDS THE POSITION ───────────────
   The mirror of WA.examOperativeIx (the exams' pass-attempt rule) and of
   WA.evalOperativeOf (the checkrides'), over flight-log rows: THE LATEST
   ATTEMPT THAT WAS COMPLETED, and — while none has been — round 13's FIRST IN
   STORED ORDER, unchanged, so nothing churns until a re-fly actually
   completes. Tiebreak, the WA.attemptLater shape: date first, a dated attempt
   beats an undated one, then `seq`, then the stored index.
   THE DEFAULT THIS ENCODES, AND IT AWAITS RATIFICATION (§4y·11·9): a position
   that already holds a Mission Complete KEEPS it when a LATER fail or
   incomplete arrives — only a COMPLETED attempt is ever handed the position.
   That is the operative-attempt mirror of Evaluations («two successful
   attempts resolve to the later one»); the demotion is one predicate away and
   would need a ruling, because it would paint a sortie the student
   demonstrably completed as not completed. */
WA.logOperativeIx = function (list, idxs) {
  const arr = Array.isArray(list) ? list : [];
  const at = (i) => arr[i] || {};
  const later = (i, j) => {
    const di = String(at(i).date || "").trim(), dj = String(at(j).date || "").trim();
    if (!di !== !dj) return !!di;
    if (di !== dj) return di > dj;
    const si = Math.round(Number(at(i).seq) || 1), sj = Math.round(Number(at(j).seq) || 1);
    if (si !== sj) return si > sj;
    return i > j;
  };
  let done = -1;
  for (const i of (idxs || [])) {
    if (!WA.flightCompleted(at(i))) continue;
    if (done < 0 || later(i, done)) done = i;
  }
  return done >= 0 ? done : ((idxs || [])[0]);
};
WA.rowPlanned = function (sec, e) {
  if (sec !== "exams" || !e || typeof e !== "object") return false;
  if (WA.examSeries(e)) return true;
  return !!WA.exam(WA.normLine(e.exam));
};
/* ══════════════════════════════════════════════════════════════════════════
   ROUND 22 — THE DERIVED ROWS. ONE FACT, ONE ROW, TWO PLACES TO READ IT.
   ──────────────────────────────────────────────────────────────────────────
   TWO RULINGS (2026-08-28) and ONE mechanism:
     «Έβαλα την C4791 και έκανα save. Γιατί δεν ανανεώνεται στον πίνακα
      Flights;»   — the solo the student filled in stayed OWED in the log.
     «Στα flights δεν έχεις τις αξιολογήσεις — τις θέλουμε.»
                  — the eight checkrides were missing from the log entirely.

   Both are the same shape: a flight whose ONE STORED ROW lives in another
   section, and a Flights-table position that has to tell the truth about it
   without owning it. So this function answers, for a whole RECORD, «which
   positions of this log are filled from somewhere else, and what do they
   say» — and every surface that draws or counts the log reads it.

   THE THREE INVARIANTS, and they are the whole of the design:
     · NOTHING IS STORED. A derived row has no index, is never in a payload,
       is never exported, is never stamped and never counts as an entry. Render
       it or do not render it: the stored bytes are identical either way.
     · IT IS NEVER EDITABLE. The fact belongs to its own section; the row
       carries a jump link to the row that owns it, and no control of its own.
     · IT WINS ITS POSITION. A stored flights row naming the same sortie can
       never claim it, so it falls back to being a marked EXTRA — kept, never
       destroyed. ROUND 23: such a row is no longer REFUSED on save; it is
       accepted and marked SUSPECT (§4y·11·1). The invariant is untouched —
       what changed is what happens to the row, not who holds the position.

     → { [key]: { src, key, track, code, state, date, who, grade, ng, dur,
                  passed, attempts, sec, slot, i, label, why, jump } }
   ══════════════════════════════════════════════════════════════════════════ */
WA.DERIVED_SRC = {
  evaluations: {
    tag: "checkride — recorded in Evaluations",
    tip: "One of the eight checkrides. It is recorded in the Evaluations section, where the " +
         "syllabus order and the pass-attempt rule apply to it — this row READS that record " +
         "and stores nothing. Two rows for one flight would be two grades that can disagree.",
  },
  solo_flights: {
    tag: "recorded in Solo flights",
    tip: "This sortie was flown SOLO. It is recorded in the Solo flights section, where who " +
         "authorised it and the NG rule live — this row READS that record and stores nothing. " +
         "Two rows for one flight would be two records that can disagree.",
  },
};
WA.derivedSlots = function (sec, rec) {
  const out = {};
  if (!rec || typeof rec !== "object") return out;
  if (sec !== "flights" && sec !== "fs") return out;
  const ix = WA.slotIndex(sec);
  const isD = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));

  /* ── (1) THE EIGHT CHECKRIDES ────────────────────────────────────────────
     The OPERATIVE attempt and not merely the latest (round 11's pass rule,
     WA.evalOperativeOf) — the same row every other checkride surface reads,
     so the log cannot print a grade the Evaluations table disowns. A slot
     nobody has flown produces NOTHING: its position stays plainly OWED. */
  const evRows = WA.evalRows(rec).filter((r) => r.flown && r.id);
  for (const d of WA.EVALUATIONS) {
    const op = WA.evalOperativeOf(evRows, d.id);
    if (!op.row) continue;
    const track = d.cat, key = track + "|" + d.id;
    if (!ix[key] || !ix[key].ck) continue;      /* not a position of THIS band */
    out[key] = {
      src: "evaluations", sec: "evaluations", key, track, code: d.id,
      i: op.row.i, slot: d.id, date: op.row.date || "", who: op.row.with || "",
      grade: op.row.grade, ng: false, passed: op.passed, attempts: op.attempts,
      /* ROUND 23 — THE HOURS, read from the row that owns them. «Να βάλουμε
         και το duration στις παράγωγες γραμμές»: the two owning sections now
         carry an optional `duration`, so a derived row can finally show one
         and the block total can finally include it (§4y·9 item 2, closed). */
      dur: (op.row.duration === null || op.row.duration === undefined ||
            op.row.duration === "") ? null : op.row.duration,
      /* DONE is the flights table's own word: everything the row asks for is
         in AND the mission was completed. For a checkride «the mission was
         completed» IS the pass-attempt rule — 60 % on the printed scale. */
      state: (isD(op.row.date) && op.passed) ? "done" : "started",
      label: d.id + " — " + d.name,
    };
  }

  /* ── (2) THE SOLOS ───────────────────────────────────────────────────────
     Every FILLED solo row that names a sortie this log has a position for —
     the eight fixed slots AND an additional solo, because a solo recorded is
     a solo recorded and the double bookkeeping is identical either way. A
     filled slot with no sortie chosen yet names no position and derives
     nothing. Later rows win, so a record that holds two solos of one sortie
     shows the last one and the section itself MARKS the pair on both rows —
     ROUND 23. (Round 22b made it a REFUSAL; the ruling of 2026-08-28 evening
     turned it into a mark, because «ένα solo που δεν πετάχτηκε … συνήθως
     πετιέται σε κάποιο repeat» — a genuine second solo is a flight that
     happened. WA.soloPairSuspect is what makes this sentence true now: both
     rows are stored, both are visible, both wear the word, and the double
     record is untangled with the squadron.) */
  const solos = (rec && Array.isArray(rec.solo_flights)) ? rec.solo_flights : [];
  solos.forEach((e, i) => {
    if (!e || typeof e !== "object" || WA.slotEmpty("solo_flights", e)) return;
    const code = WA.normCode(e.sortie);
    if (!code) return;
    const track = WA.codeTrack(code);
    if (!track) return;
    const key = track + "|" + code;
    const d = ix[key];
    /* A CHECKRIDE POSITION IS NEVER FILLED FROM HERE — it belongs to
       Evaluations, and round 22b refuses a solo naming one by name, so this
       skip now guards legacy rows only. A SOLO-ONLY position (`so`) is the
       opposite case: it is exactly the position this row is the truth about,
       and it derives as it always did. */
    if (!d || d.ck) return;
    const ng = !!e.ng;
    const g = (e.grade === null || e.grade === undefined || e.grade === "")
      ? null : Number(e.grade);
    const who = String(e.instructor || "").trim();
    out[key] = {
      src: "solo_flights", sec: "solo_flights", key, track, code,
      i, slot: e.slot || null, date: e.date || "", who,
      grade: (g === null || !isFinite(g)) ? null : g, ng,
      passed: ng || (g !== null && isFinite(g) && WA.gradePassed(g)),
      attempts: 1,
      /* ROUND 23 — the hours, from the row that owns the flight */
      dur: (e.duration === null || e.duration === undefined || e.duration === "")
        ? null : e.duration,
      /* the flights table's own DONE, read off a solo row: the date, the
         person who authorised it, and either NG (nobody could score it) or a
         grade that passed. Anything less is STARTED — the row is real and
         unfinished, which is exactly what the light green says. */
      state: (isD(e.date) && who && (ng || (g !== null && isFinite(g) && WA.gradePassed(g))))
        ? "done" : "started",
      label: WA.soloSlotLabel(e.slot),
    };
  });
  return out;
};
/* the keys of one scope — what the owed arithmetic must subtract */
WA.derivedKeys = function (sec, rec, track) {
  const d = WA.derivedSlots(sec, rec);
  return Object.keys(d).filter((k) => track == null || d[k].track === track);
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 23 — THE EXTRAS / FAIL SEAM. «Αν κάποιος περάσει ένα fail στην C4602
   επάνω, πρέπει τότε να ενημερώνεται το flight.»
   ──────────────────────────────────────────────────────────────────────────
   THE DECISION, AND IT IS RECORDED (§4y·11·4): (ii) THE EXISTING SECTIONS
   CROSS-INFORM THE POSITION — NOT (i) a fail/almost-good STATE stored on the
   flights row. Three reasons, in the order they bite:
     1. A grade state on the row would be a THIRD SOURCE OF TRUTH beside
        `grade` and `mission` — exactly the defect round 11 removed from the
        FPC (`result`) and round 12b removed with `verdict`. The grade already
        carries the band (ΠΔ 151/13: Ε 0-49 ΑΠΟΤΥΧΙΑ, ΣΚ 50-59 ΥΣΤΕΡΗΣΗ, ≥60)
        and `mission` already carries the no-percentage case.
     2. THE RULING'S FOUR OUTCOMES ON AN EXTRA ARE ALREADY REPRESENTABLE, with
        nothing new stored: a PERCENTAGE (whose printed band IS fail / almost
        good / pass), FAIL = a percentage in Ε and/or a FAIL row naming the
        sortie, ALMOST GOOD = a percentage in ΣΚ and/or an ALMOST GOOD row, and
        NON GRADED = `ng: true` — «nobody was in a position to score it», which
        is exactly what non-graded means here. It needs no code.
     3. What the log row genuinely does NOT hold is the FAIL section's own
        content — the ITEMS that missed the desired performance, the instructor
        and the track. That is what the squadron reads. So the seam is a LINK,
        not a duplicated verdict.
   NOTHING IS STORED, on either side: this is derived at render from the two
   sections that already hold the facts, exactly as WA.derivedSlots is. Rows
   naming no known code contribute nothing (presence before membership).
     → { [track|code]: { fails: [{ sec, i, date, grade, items, instructor }] } } */
WA.slotAttention = function (sec, rec) {
  const out = {};
  if (!rec || typeof rec !== "object") return out;
  if (sec !== "flights" && sec !== "fs") return out;
  for (const src of ["fail", "almost_good"]) {
    const list = Array.isArray(rec[src]) ? rec[src] : [];
    list.forEach((e, i) => {
      if (!e || typeof e !== "object") return;
      const code = WA.normCode(e.flight_code);
      if (!code) return;
      if (WA.sortieBand(code) !== sec) return;
      const track = WA.codeTrack(code);
      if (!track) return;
      const key = track + "|" + code;
      if (!WA.slotIndex(sec)[key]) return;
      (out[key] = out[key] || { fails: [] }).fails.push({
        sec: src, i, date: e.date || "",
        grade: (e.grade === null || e.grade === undefined || e.grade === "") ? null : e.grade,
        items: (Array.isArray(e.items) ? e.items : []).slice(),
        instructor: String(e.instructor || "").trim(),
      });
    });
  }
  return out;
};
/* the chip's WORD — «FAIL recorded», «ALMOST GOOD recorded», «2× FAIL
   recorded» — one vocabulary for the three surfaces */
WA.attentionTag = function (a) {
  const f = (a && a.fails) || [];
  if (!f.length) return "";
  const kinds = {};
  for (const x of f) kinds[x.sec] = (kinds[x.sec] || 0) + 1;
  return Object.keys(kinds).map((k) =>
    (kinds[k] > 1 ? kinds[k] + "× " : "") +
    (k === "fail" ? "FAIL" : "ALMOST GOOD") + " recorded").join(" · ");
};
/* the chip's SENTENCE — WHAT is recorded · WHERE · WHAT IT MEANS FOR THIS
   POSITION. It never says the flight failed: it says where the reading lives. */
WA.attentionTip = function (a, code) {
  const f = (a && a.fails) || [];
  if (!f.length) return "";
  const c = String(code || "this sortie");
  const one = (x) => (x.sec === "fail" ? "A FAIL" : "An ALMOST GOOD") +
    " is recorded against " + c + " in the " + WA.secLabel(x.sec) + " section" +
    (x.date ? " — " + fmtD(x.date) : "") +
    (x.items.length ? ", " + x.items.length + " item" + (x.items.length === 1 ? "" : "s") : "") +
    (x.instructor ? ", " + x.instructor : "") + ".";
  return f.map(one).join(" ") +
    " The flight itself is recorded here; what missed the desired performance is recorded " +
    "there. This position is not complete until an attempt at " + c + " is Mission Complete.";
};
/* the jump target — the FIRST of them, because one arrow can land in one place
   and the tooltip above has already named every row it stands for */
WA.attentionJump = function (a) {
  const f = (a && a.fails) || [];
  return f.length ? (f[0].sec + ":" + f[0].i) : "";
};
/* THE BOUNDED STATE PROMOTION, IN ONE PREDICATE — «η θέση δεν είναι complete
   όσο δεν υπάρχει Mission Complete», said in the four words the scheme already
   has. A position whose state WOULD be `owed` and which slotAttention names
   reads `started` instead, and NOTHING ELSE MOVES: a `done` position keeps its
   green (a fail that happened is history, not a demotion — §4y·11·9 (a)), a
   `started` one is already started, an `extra` is not a position at all.
   `ck` / `so` ARE EXCLUDED: their state belongs to Evaluations / Solo flights,
   so promoting them here would be this table answering for another section.
   They still get the CHIP — the fail is visible wherever the sortie appears.
   All three surfaces that promote ask THIS — WA.slotRows, WA.stateCounts and
   the student form's rowMeta — so the rule cannot be written three ways. */
WA.attentionPromotes = function (d, att) {
  return !!d && !WA.slotOwner(d) && !!(att || {})[d.key];
};
/* ── HOW A DERIVED ROW SAYS WHAT IT IS ────────────────────────────────────
   One vocabulary for the student's form, the admin's drill-down and the
   printed brief, so three surfaces cannot describe the same row three ways.
   The WORD names the section that owns the fact; the SENTENCE says why the
   row is not editable here and what a second row would do to the record. */
WA.derivedTag = function (d) {
  return (d && WA.DERIVED_SRC[d.src] ? WA.DERIVED_SRC[d.src].tag : "recorded elsewhere");
};
WA.derivedTip = function (d) {
  if (!d) return "";
  const base = WA.DERIVED_SRC[d.src] ? WA.DERIVED_SRC[d.src].tip : "";
  const bits = [d.label || d.code];
  if (d.src === "evaluations") {
    bits.push(d.attempts > 1
      ? d.attempts + " attempts recorded — this is the operative one"
      : "one attempt recorded");
    if (d.grade !== null) bits.push(d.passed ? "passed" : "no successful attempt yet");
  } else if (d.src === "solo_flights") {
    bits.push(d.ng ? "non-graded (NG)" : (d.grade === null ? "no grade yet" : d.grade + " %"));
    if (d.who) bits.push("authorised by " + d.who);
  }
  return base + " — " + bits.join(" · ") + ".";
};
/* the grade a derived row prints — the same words the log's own cells use */
WA.derivedGradeText = function (d) {
  if (!d) return "—";
  if (d.ng) return "NG";
  return (d.grade === null || d.grade === undefined) ? "—" : String(d.grade) + " %";
};
/* the jump target: section + the STORED index of the owning row, so the
   surface can put the reader in front of the row that holds the fact */
WA.derivedJump = function (d) {
  return d ? (d.sec + ":" + d.i) : "";
};
/* which fixed solo slot names this code as one of its candidates — the slot a
   position of the flight log is WAITING FOR when nothing has been recorded
   against it yet (round 22b) */
WA.soloSlotOfCode = function (code) {
  const c = WA.normCode(code);
  if (!c) return null;
  return WA.soloSlots().find((s) => (s.codes || []).indexOf(c) >= 0) || null;
};
/* ── ROUND 22b — WHAT AN UNFILLED «NOT OURS» POSITION SAYS ─────────────────
   A position of the flight log that this table may not hold, with nothing
   recorded against it anywhere yet: an unflown checkride, or a solo the Solo
   flights section has not recorded. It wears the grey like any owed row and
   the SENTENCE names the section that will hold it — one vocabulary, on the
   student's form and in the admin's drill-down alike. */
WA.slotOwnerTip = function (d) {
  const src = WA.slotOwner(d);
  if (!src) return "";
  const base = (WA.DERIVED_SRC[src] || {}).tip || "";
  if (src === "evaluations") {
    const ev = WA.evalById ? WA.evalById(d.code) : null;
    return base + (ev ? " Not flown yet — " + ev.id + " is checkride " + ev.order +
                        " of the eight." : "");
  }
  const s = WA.soloSlotOfCode(d.code);
  return base + " Not flown yet — " + d.code +
    (s ? " is the solo of Training Section " + s.sec + (s.req ? ", and the syllabus REQUIRES it" : "") : "") +
    ": record it in the Solo flights section and this row fills itself in.";
};

/* WHO OCCUPIES EACH SLOT — in TWO PASSES, and the order of the passes is the
   whole of the rule.
     0. A DERIVED POSITION (round 22) is taken before either pass runs: the
        fact is stored in another section and no row of THIS one may claim it.
        A stored row that names such a sortie therefore falls through to being
        an EXTRA — which is what a legacy carrier is, and what the server now
        refuses to create a new one of. ROUND 22b: the `ck` and `so` positions
        no longer depend on this pass at all — WA.slotKey refuses them a key,
        so an UNFILLED one is blocked too, which is the shape that froze a
        record. What pass 0 still answers alone is the tier-2 case: an ordinary
        solo CANDIDATE flown solo, whose position is spoken for only while this
        record actually holds that solo.
     1. A ROW SOMEBODY HAS WRITTEN IN takes the slot, first one in stored
        order. A second written row naming the same sortie is an EXTRA: the
        slot is the syllabus's ONE planned pass and a re-fly is not it.
     2. Only then may an untouched PLACEHOLDER take a slot still free — and
        there the LAST one wins, because the placeholder that arrives later is
        the one the student just created by hand: picking IN190 on a row they
        added must move THAT row into the IN190 slot, not make it vanish
        behind the seeded one. (The same doctrine as the evaluations section's
        "an imported evaluation that is finally identified goes HOME".)
   Stored order never changes under a half-typed row, so both passes are
   deterministic. A placeholder that ends up claiming nothing is REDUNDANT: it
   is drawn nowhere and stored nowhere — see WA.slotOwed. */
WA.claims = function (sec, list, rec) {
  const arr = Array.isArray(list) ? list : [];
  const taken = {}, claimed = new Array(arr.length).fill(false),
        keys = new Array(arr.length);
  /* ROUND 22 — PASS 0. The derived positions are taken before anything else
     may take them; `derived` marks them so a caller can tell a position filled
     from another section from one filled by a row of this one. */
  const derived = rec ? WA.derivedSlots(sec, rec) : {};
  for (const k of Object.keys(derived)) taken[k] = true;
  for (let i = 0; i < arr.length; i++) keys[i] = WA.slotKey(sec, arr[i]);
  /* ROUND 14 — WHICH OF SEVERAL WRITTEN ROWS HOLDS THE SLOT.
     For the two flight logs and the lessons the answer is round 13's: the
     FIRST in stored order, because a second row naming the same sortie is a
     re-fly and the slot is the one planned pass. For the EXAMS it is the
     OPERATIVE TRIAL — round 11's pass-attempt rule, one section over — because
     the three trials of one exam are three attempts at the SAME slot, not
     three passes at it, and the colour of the slot has to follow the attempt
     the student actually passed on. `holder` is the one line where the two
     doctrines meet, and nothing else in the pass changes.
     ROUND 15 — and "passed" there is the GROUND-EXAM mark (80 %), not the
     flight's 60: WA.examOperativeIx asks WA.gradePassed(v, 'exams'). */
  const holder = {};
  for (let i = 0; i < arr.length; i++) {
    const k = keys[i];
    if (!k || derived[k] || WA.slotUntouched(sec, arr[i])) continue;
    /* ROUND 14 — a PLANNED row with nothing in it does not take the slot away
       from the attempt that has something in it: a 2nd trial that has only
       been scheduled must not decide the colour of an exam already sat.
       ROUND 23 — and the same line now guards the flight logs: a blank Repeat
       row somebody just added must not take the position off the sortie that
       was actually flown. */
    if (WA.rowMinted(sec, arr[i]) && WA.rowBlank(sec, arr[i])) continue;
    (holder[k] = holder[k] || []).push(i);
  }
  for (const k of Object.keys(holder)) {
    const idxs = holder[k];
    /* ONE LINE, THREE DOCTRINES. Round 14 put two here; round 23 adds the
       third and it is the exams' own, one section over: a flow-chart position
       is held by the OPERATIVE ATTEMPT among the rows that name it — «θα
       μετρήσει μόνο όταν είναι Mission Complete» — and every other attempt is
       an EXTRA, rendered under it (WA.slotRows). */
    const win = (sec === "exams" && idxs.length > 1)
      ? WA.examOperativeIx(arr, idxs)
      : (((sec === "flights" || sec === "fs") && idxs.length > 1)
          ? WA.logOperativeIx(arr, idxs) : idxs[0]);
    taken[k] = true; claimed[win] = true;
  }
  for (let i = arr.length - 1; i >= 0; i--) {
    const k = keys[i];
    if (!k || !WA.slotUntouched(sec, arr[i]) || taken[k]) continue;
    taken[k] = true; claimed[i] = true;
  }
  return { claimed, keys, taken, derived };
};

/* HAS ANYBODY TOUCHED THIS ROW? — the shape test, and the one the sparse rule
   rides on: a row carrying NOTHING BUT ITS SLOT IDENTITY is a placeholder the
   form drew, and it is never stored, never counted and never stamped.
   `legacy` and `entered_by` are disqualifiers on purpose: a row an older form
   left incomplete, or one the admin entered, is a REPORT — it must never be
   mistaken for a placeholder and silently dropped on the next save. */
WA.slotUntouched = function (sec, e) {
  if (!e || typeof e !== "object") return false;
  if (e.legacy || e.entered_by) return false;
  /* ROUND 14 — AND A PLANNED ROW IS A REPORT TOO. A minted 2nd trial and an
     Weekly exams are rows somebody CREATED: they say «a re-sit has been
     ordered» and «a weekly exam is on the programme», which is information no
     placeholder
     carries and which nothing but the record remembers. Treating them as
     placeholders would drop them from the payload on the next save and the
     student's click would quietly undo itself. Same disqualifier, same
     reasoning, as `legacy` and `entered_by` above. */
  if (WA.rowMinted(sec, e)) return false;
  return WA.rowBlank(sec, e);
};
/* THE SHAPE TEST ALONE — is there anything in the fields of this row? It is
   what `slotUntouched` asks after its three disqualifiers, and it is asked on
   its own by the rules that need "empty" without needing "droppable". */
WA.rowBlank = function (sec, e) {
  if (!e || typeof e !== "object") return false;
  const empty = (v) => v === null || v === undefined || String(v) === "";
  /* `ng` IS DELIBERATELY NOT IN THIS LIST, and it is the round-9 solo ruling
     applied to a log row: ON AN UNFLOWN SLOT, NG IS AN ANSWER ABOUT A FLIGHT
     THAT HAS NOT HAPPENED. Counting it as a touch would make the row travel,
     and the save would then refuse a DATE the student never meant to give —
     after one tap on a chip. So the tap is remembered on the row (the cell
     draws it), the slot stays OWED and stores nothing, and the answer is
     carried into the record by the first keystroke that makes the flight real.
     The solo section reaches the same place with _ngwant; here the value
     itself can hold the answer, because nothing else reads it. */
  if (sec === "flights" || sec === "fs") {
    return empty(e.date) && empty(e.instructor) && empty(e.instructor_oid) &&
           empty(e.duration) && empty(e.grade) && empty(e.mission);
  }
  if (sec === "lessons") return empty(e.date) && empty(e.end_date);
  if (sec === "exams") return empty(e.date) && empty(e.grade);
  return false;
};
/* AN OWED ROW: it carries a syllabus identity and NOTHING ELSE. That is the
   whole test, and it deliberately does not ask whether the row claims its slot
   — because the answer is the same either way: the row stores nothing, counts
   nothing and is stamped by nobody. A placeholder that claims is DRAWN, grey,
   as the slot; a redundant one (its slot already taken by a written row) is
   drawn nowhere. Both are dropped from the payload by the same line. */
WA.slotOwed = function (sec, e) {
  return !!WA.slotKey(sec, e) && WA.slotUntouched(sec, e);
};

/* IS THIS ROW COMPLETE? — «Οταν ειναι complete και ολα τα στοιχεια
   συμπληρωμενα». Two conditions, not one: everything filled AND the mission
   completed. A flight flown, graded 48 % and re-flown is not "done" — it is
   started, and the green belongs to the pass. NG is the named exception: a
   flight nobody could score is complete on its date, its instructor and its
   duration, because there is no grade to wait for. */
WA.rowDone = function (sec, e) {
  if (!e || typeof e !== "object") return false;
  const has = (v) => !(v === null || v === undefined || String(v).trim() === "");
  const isD = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  if (sec === "flights" || sec === "fs") {
    if (!isD(e.date) || !has(e.instructor) || !has(e.duration)) return false;
    if (e.ng) return true;
    return WA.rowMission(e) === "complete";
  }
  /* ROUND 14 — AN END DATE ALONE IS A RECORD. «τα μαθηματα να δεχομαστε και
     μονο end date για την καταγραφη»: the course ENDED, therefore it ran, and
     a squadron that knows a lesson finished on the 12th knows the lesson
     happened. Round 13's rule («a lesson is done on its date») counted only
     the START date and made an end-only row incomplete for ever — which is
     also the exact shape open item 2 of round 13 named as a defect («a started
     ground lesson cannot be saved»): the ONLY partial state a two-date row can
     have is an end without a start, and it was the one state the form refused.
     Either date now completes the row; both is the normal case; neither is
     still an owed slot. */
  if (sec === "lessons") return isD(e.date) || isD(e.end_date);
  if (sec === "exams") return isD(e.date) && has(e.grade) && isFinite(Number(e.grade));
  return false;
};
/* THE DATE A ROW IS FILED UNDER — the one every date sort reads. It is `date`
   everywhere except a ground lesson recorded by its END alone (round 14),
   where the end date is the only date the row has and sorting it among the
   undated would file a course that demonstrably ran behind every course that
   has not started. */
WA.rowDate = function (sec, e) {
  const o = e || {};
  const d = String(o.date || "").trim();
  if (d) return d;
  return (sec === "lessons") ? String(o.end_date || "").trim() : "";
};
/* THE ONE VERDICT every colour, count, legend and CSV cell reads */
WA.rowState = function (sec, e, claimed) {
  if (WA.slotOwed(sec, e)) return "owed";
  /* ROUND 14 — a numbered trial and a Weekly exam claim no slot and are not
     extras: they are planned rows, and they are read exactly like a claimed one.
     A PLANNED ROW WITH NOTHING IN IT IS OWED, not started: minting Weekly 4 or a
     2nd trial of IN190 puts it on the programme, and "in the programme,
     nothing recorded yet" is the exact sentence the grey wash already carries.
     Neither is a seeded placeholder though — both are STORED, because nothing
     but the record remembers that the squadron scheduled them (WA.slotOwed
     stays false for them, which is the line buildPayload drops rows on). */
  if (!claimed && !WA.rowPlanned(sec, e)) return "extra";
  if (!claimed && WA.rowPlanned(sec, e) && WA.rowBlank(sec, e)) return "owed";
  return WA.rowDone(sec, e) ? "done" : "started";
};

/* THE FOUR COUNTS OF ONE SCOPE — a track of a log, or a whole section.
   OWED IS COMPUTED FROM THE CATALOGUE (slots − claimed), never counted off the
   rows: the student's form carries the placeholders and the admin's record does
   not, and both must reach the same number. Hours and the debrief lag count
   the TOUCHED rows only — a slot nobody has flown has flown no hours. */
WA.stateCounts = function (sec, list, track, rec) {
  const arr = Array.isArray(list) ? list : [];
  const c = WA.claims(sec, arr, rec);
  const out = { done: 0, started: 0, owed: 0, extra: 0, hours: 0, lag: 0, n: 0,
                /* ROUND 14 — how many SLOTS are complete, which is not the same
                   number as how many ROWS are: an exam sat three times has one
                   slot and up to three done rows, so every «X of 8» sentence
                   reads this and every «done X» reads the other. */
                slotsDone: 0,
                /* ROUND 22 — how many of this scope's positions are filled from
                   ANOTHER section. They are counted in done/started like any
                   filled position (the sortie was flown, so it is not owed) and
                   they are NOT entries: `n` deliberately leaves them alone,
                   because a derived row is not an entry of this section.
                   ROUND 23 — AND THEIR HOURS NOW DO COUNT (§4y·9 item 2,
                   CLOSED). Round 22's reason — «counting it here would count
                   one flight's hours twice» — was right about `n` and wrong
                   about `hours`: this table stores NO row for that sortie, so
                   there is no second copy to double. The ruling of 2026-08-28
                   gave the two owning sections a `duration`, so a derived row
                   shows its hours and the block total includes them. */
                derived: 0 };
  let claimedN = 0;
  const written = {};
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (track != null && (e.track || "") !== track) continue;
    const st = WA.rowState(sec, e, c.claimed[i]);
    /* a SEEDED PLACEHOLDER is counted from the catalogue below, never here —
       but a stored row that reads `owed` (a Weekly exam nobody has sat yet) is
       a real row and does count, which is why the test is the placeholder test and
       not the word */
    if (WA.slotOwed(sec, e)) continue;
    if (c.claimed[i]) {
      claimedN++; if (st === "done") out.slotsDone++;
      /* ROUND 23 — which positions a WRITTEN row holds. A seeded placeholder
         also marks `taken` in WA.claims, so `taken` cannot answer «is this
         position owed» on the student's form, where the placeholders live —
         and the fail promotion below has to ask exactly that. */
      if (c.keys[i]) written[c.keys[i]] = true;
    }
    out[st]++;
    out.n++;
    const h = Number(e.duration);
    if (isFinite(h)) out.hours += h;
    /* THE LAG BELONGS TO THE SECTIONS THAT HAVE A GRADE. A ground lesson is
       ATTENDED, not scored, so it is never "awaiting" anything — the round-12
       CSV made exactly this distinction and the counters must agree with it,
       or every dated lesson in the squadron would read as a chase. */
    if (sec !== "lessons" && WA.awaitingDebrief(e)) out.lag++;
  }
  /* ROUND 22 — THE DERIVED POSITIONS, BEFORE THE OWED SUBTRACTION. A flown
     checkride and a flown solo are not owed in this table: their colour is the
     one their own section gives them, and the grey they used to wear was the
     table saying a flight had not happened when the record says it had. */
  for (const k of Object.keys(c.derived || {})) {
    const d = c.derived[k];
    if (track != null && d.track !== track) continue;
    out.derived++; out[d.state]++; out.slotsDone += (d.state === "done") ? 1 : 0;
    /* ROUND 23 — and their HOURS, from the row that owns them. `n` is left
       alone on purpose: a derived row is not an ENTRY of this section. */
    const dh = Number(d.dur);
    if (isFinite(dh)) out.hours += dh;
  }
  /* the rounding is taken AFTER the derived loop (round 23) — it used to run
     before it, which would have dropped the derived tenths on the floor */
  out.hours = Math.round(out.hours * 10) / 10;
  /* += , not = : the catalogue's untouched slots PLUS the stored rows that are
     themselves owed (a Weekly exam on the programme and not yet sat) */
  out.owed += Math.max(0, WA.slotCount(sec, track == null ? null : track)
                          - claimedN - out.derived);
  /* ── ROUND 23 — THE FAIL SEAM'S BOUNDED PROMOTION ───────────────────────
     «Αν κάποιος περάσει ένα fail στην C4602 επάνω, πρέπει τότε να ενημερώνεται
     το flight.» An OWED position that a FAIL / ALMOST GOOD row names is not
     owed — something was attempted at it — so it reads STARTED. It is done
     here, after the owed residue is known, because the promotion is about
     positions of the CATALOGUE and this is where they are counted; nothing is
     stored for them and WA.slotOwed is untouched, so the payload and the
     fingerprint do not move a byte. */
  const att = WA.slotAttention(sec, rec);
  const attKeys = Object.keys(att);
  if (attKeys.length) {
    let nAtt = 0;
    for (const k of attKeys) {
      const d = WA.slotIndex(sec)[k];
      if (!d) continue;
      if (track != null && d.track !== track) continue;
      if (!WA.attentionPromotes(d, att)) continue;   /* ck / so belong elsewhere */
      if ((c.derived || {})[k] || written[k]) continue;   /* already not owed */
      nAtt++;
    }
    nAtt = Math.min(nAtt, out.owed);
    out.owed -= nAtt; out.started += nAtt;
  }
  return out;
};
/* ── THE DISPLAY ORDER, AND IT IS ONE FUNCTION ────────────────────────────
   THE SYLLABUS ORDER IS THE BACKBONE: every slot of the catalogue in the order
   the printed flow chart (or the printed programme) lays the stage out in,
   each carrying the row that claims it or nothing at all when it is OWED —
   then the EXTRAS, which have no place in the chart to sit in, oldest first.
   That last half is round 12b's date sort, unrevoked and now scoped to the
   rows it was always the right rule for.
   The student's form, the admin's drill-down and the printed brief all call this,
   so the three cannot show the same record in three different orders.
   ROUND 22 — and a position can now be filled from ANOTHER SECTION. Such a row
   carries `derived` (the WA.derivedSlots record) and, deliberately, `e: null`
   and `i: -1`: there is no stored row of THIS section behind it, and every
   caller that maps a rendered row back to a stored one must keep missing.
     → [{ def, e, i, state, derived? }]   i = the STORED index, -1 when nothing
        of this section claims it */
WA.slotRows = function (sec, list, track, rec) {
  const arr = Array.isArray(list) ? list : [];
  const c = WA.claims(sec, arr, rec);
  const by = {}, alts = {}, series = [], extras = [];
  arr.forEach((e, i) => {
    if (track !== undefined && track !== null && (e.track || "") !== track) return;
    if (c.claimed[i]) { by[c.keys[i]] = { e, i }; return; }
    /* a REDUNDANT placeholder — its slot is already held by a written row — is
       drawn nowhere: it is not an extra, it is a row nobody ever wrote in */
    if (WA.slotOwed(sec, e)) return;
    /* ROUND 14 — the planned rows that hold no slot. A NON-OPERATIVE TRIAL is
       filed under its own exam, so it renders directly beneath the slot it is
       an attempt at (the evaluations section's "another attempt at C4590",
       one section over); a Weekly exam goes to its own list, after the eight. */
    if (WA.rowPlanned(sec, e)) {
      if (WA.examSeries(e)) { series.push({ e, i }); return; }
      const k = WA.normLine(e.exam);
      (alts[k] = alts[k] || []).push({ e, i });
      return;
    }
    /* ROUND 23 — AND THE SAME FILING FOR THE FLIGHT LOGS. An unclaimed row
       that is ABOUT a position of the chart (WA.slotHome, not slotKey) is an
       ATTEMPT at it — a Mission-Incomplete first go, a repeat, a same-day
       re-fly, a suspect solo carrier — so it renders immediately BENEATH the
       position it is about, exactly as a non-operative exam trial does. Only a
       row with NO home at all (an fcf / cef / other, or a code the chart does
       not know) goes to the bottom extras block, which is what that block was
       always for. The row's STATE is unchanged: WA.rowPlanned is untouched, so
       every non-operative attempt still reads `extra` — the ruling's own word
       for it («θα μπαίνει ως έξτρα γραμμή»). */
    if (sec === "flights" || sec === "fs") {
      const home = WA.slotHome(sec, e);
      if (home && WA.slotIndex(sec)[home]) {
        (alts[home] = alts[home] || []).push({ e, i });
        return;
      }
    }
    extras.push({ e, i });
  });
  /* the series in NUMBER order — the number is the name, so Weekly 2 must never
     print above Weekly 1 because it was typed first */
  series.sort((a, b) => {
    const na = WA.examSeriesNo(a.e), nb = WA.examSeriesNo(b.e);
    if (na === null || nb === null) return na === nb ? a.i - b.i : (na === null ? 1 : -1);
    return na - nb || a.i - b.i;
  });
  /* the attempts under one position, in the order they were made: the exams
     sort by TRIAL NUMBER (the number is the name), the flight logs by DATE →
     seq → stored index — the extras block's own sort, round 23, so a row does
     not change its neighbours merely by moving under its slot */
  const altSort = (sec === "flights" || sec === "fs")
    ? (a, b) => {
        const da = WA.rowDate(sec, a.e), db = WA.rowDate(sec, b.e);
        if (!da !== !db) return da ? -1 : 1;           /* dateless last */
        if (da !== db) return da < db ? -1 : 1;
        const sa = Number(a.e.seq || 1), sb = Number(b.e.seq || 1);
        if (sa !== sb) return sa - sb;
        return a.i - b.i;
      }
    : (a, b) => WA.examTrial(a.e) - WA.examTrial(b.e) || a.i - b.i;
  for (const k of Object.keys(alts)) alts[k].sort(altSort);
  extras.sort((a, b) => {
    const da = WA.rowDate(sec, a.e), db = WA.rowDate(sec, b.e);
    if (!da !== !db) return da ? -1 : 1;             /* dateless last */
    if (da !== db) return da < db ? -1 : 1;
    const sa = Number(a.e.seq || 1), sb = Number(b.e.seq || 1);
    if (sa !== sb) return sa - sb;
    return a.i - b.i;                                 /* stable: stored order */
  });
  const out = [];
  /* ROUND 23 — the FAIL / ALMOST GOOD rows that name a position of this log.
     Derived, stored nowhere, and read here so that the same map decides the
     chip AND the one state promotion it is allowed to make. */
  const att = WA.slotAttention(sec, rec);
  for (const d of WA.slotDefs(sec)) {
    if (track !== undefined && track !== null && d.track !== track) continue;
    const hit = by[d.key];
    const der = (c.derived || {})[d.key];
    const a = att[d.key] || null;
    out.push(der
      ? { def: d, e: null, i: -1, derived: der, state: der.state, att: a }
      : { def: d, e: hit ? hit.e : null, i: hit ? hit.i : -1, att: a,
          /* AN OWED POSITION A FAIL NAMES READS `started`, and nothing else
             moves: something was attempted at it. The word stays one of the
             four — no fifth vocabulary — and the SENTENCE is the row's
             (WA.rowStateTip). NOTHING IS STORED: WA.slotOwed is untouched, so
             the seeded placeholder is still dropped from the payload. */
          state: hit ? WA.rowState(sec, hit.e, true)
                     : (WA.attentionPromotes(d, att) ? "started" : "owed") });
    /* the other trials of this exam, immediately under it. `alt` marks them so
       a caller can render the trial badge and NOT a second slot header; `def`
       is repeated on purpose (it is the same exam), and nothing counts defs —
       WA.slotCount reads the catalogue, never this list. */
    for (const x of (alts[d.key] || [])) {
      out.push({ def: d, alt: true,
                 trial: (sec === "exams") ? WA.examTrial(x.e) : null,
                 attempt: (sec === "flights" || sec === "fs") || undefined,
                 e: x.e, i: x.i, state: WA.rowState(sec, x.e, false) });
    }
  }
  /* THE WEEKLY SERIES, after the eight fixed slots — «rendered after the 8 fixed
     slots» — and before the extras, which are the rows nobody planned at all */
  for (const x of series) {
    out.push({ def: null, series: WA.examSeries(x.e), no: WA.examSeriesNo(x.e),
               e: x.e, i: x.i, state: WA.rowState(sec, x.e, false) });
  }
  for (const x of extras) out.push({ def: null, e: x.e, i: x.i, state: "extra" });
  return out;
};

/* "done 4 · started 1 · owed 27 · extra 2 · 6.4 h" — one line, everywhere.
   The hours belong to the two flight logs and the lag word to the section that
   is waiting (a debrief for a flight, a result for an exam). */
WA.stateLine = function (sec, cn) {
  const bits = ["done " + cn.done, "started " + cn.started, "owed " + cn.owed];
  if (cn.extra) bits.push("extra " + cn.extra);
  if ((sec === "flights" || sec === "fs") && cn.hours > 0) bits.push(cn.hours + " h");
  if (cn.lag) bits.push(cn.lag + (sec === "exams" ? " awaiting a result" : " awaiting a grade"));
  return bits.join(" · ");
};

/* the entries of one section that actually happened (slots excluded).
   ROUND 13 — the four log sections join the rule the two fixed sections have
   followed since round 5: an OWED slot is not an entry, so it counts for
   nothing anywhere — not in the admin-entry arithmetic, not in the exports, not
   in the counters. (A stored record never CONTAINS one; the student's form
   does, and this is the function that keeps the two saying the same number.) */
WA.filled = function (sec, list) {
  const arr = Array.isArray(list) ? list : [];
  if (!WA.hasSlots(sec)) return arr.filter((e) => !WA.slotEmpty(sec, e));
  return arr.filter((e) => !WA.slotOwed(sec, e));
};

WA.migrateRecord = function (rec) {
  const src = (rec && typeof rec === "object") ? rec : {};
  const out = {};
  const arr = (v) => Array.isArray(v) ? v.map((e) => (e && typeof e === "object") ? { ...e } : {}) : null;
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));

  /* NFS — v1 { count, dates[] } → dated entries + one placeholder per
     counted-but-undated event (nothing is lost, nothing is re-typed).
     ROUND 5: every entry also carries the printed REASON of the ΦΜΠ. A row
     written before that has only a note — which is the form's «ΑΛΛΗ ΑΙΤΙΑ»
     line — so it becomes reason "other" with the note kept verbatim; a row
     with neither is flagged and the form asks which of the six causes it was.
     MIRROR: db/schema.sql → wa.nfs_reason_fix. */
  const reasonFix = (e) => {
    const o = { ...e };
    if (WA.nfsReason(o.reason)) return o;
    if (o.reason !== null && o.reason !== undefined && o.reason !== "") {
      o.reason = null; o.legacy = true; return o;
    }
    if (String(o.note || "").trim()) { o.reason = "other"; return o; }
    o.legacy = true;
    return o;
  };
  if (Array.isArray(src.nfs)) {
    out.nfs = arr(src.nfs).map(reasonFix)
      .map((e) => (isDate(e.date) ? e : { ...e, legacy: true }));
  } else if (src.nfs && typeof src.nfs === "object") {
    const dates = Array.isArray(src.nfs.dates) ? src.nfs.dates.filter(isDate) : [];
    const cnt = Math.max(0, Math.floor(num(src.nfs.count)));
    out.nfs = dates.map((d) => reasonFix({ date: d }));
    while (out.nfs.length < cnt) {
      out.nfs.push({ date: "", legacy: true, reason: "other", note: WA.NFS_IMPORT_NOTE });
    }
  } else out.nfs = [];

  /* SMS — the v1 pending flag is gone; if it was set, keep the fact as a note.
     ROUND 8: the entrance names its ΚΕΠΕ condition (3-01 ΚΕΦ.2 §32β). A row
     written before that rule has none: it is READ with its note intact,
     flagged, and the form asks which of the seven it was — nothing is guessed.
     MIRROR: db/schema.sql → wa.sms_reason_fix. */
  out.sms = (arr(src.sms) || []).map((e) => {
    const o = { ...e };
    if (o.pending && !o.note) o.note = "was flagged as awaiting a result in the previous form";
    delete o.pending;
    if (!WA.smsReason(o.reason)) {
      if (o.reason !== null && o.reason !== undefined && o.reason !== "") o.reason = null;
      o.legacy = true;
    }
    if (!isDate(o.entrance_date)) o.legacy = true;
    return o;
  });

  /* FAIL / ALMOST GOOD — v1 free-text item → items[] under category "other" */
  for (const k of ["fail", "almost_good"]) {
    out[k] = (arr(src[k]) || []).map((e) => {
      const o = { ...e };
      if (!Array.isArray(o.items)) {
        const txt = String(o.item || o.custom || "").trim();
        o.items = txt ? [txt] : [];
        delete o.item; delete o.custom;
        if (!o.category) o.category = "other";
        o.legacy = true;
      }
      /* ROUND 6 — SYLLABUS ONLY. A row still naming an item its track's
         printed gradesheet does not carry keeps the string, and is flagged:
         the form marks the chip, names it and refuses to save the row until
         it is replaced. MIRROR: db/schema.sql → wa.migrate_record. */
      if (!isDate(o.date) || !o.category || !o.items.length ||
          WA.itemsLegacy(o).length) o.legacy = true;
      return o;
    });
  }

  /* AIRSICKNESS — ROUND 6: the event names the FLIGHT it happened on. A row
     that still carries the retired phase-of-flight note keeps it (nothing is
     destroyed behind its owner's back), is shown with it greyed as legacy
     information, and is flagged so the form asks for the flight.
     ROUND 6b — the flight is MANDATORY, so EVERY flight-less row is flagged,
     not only the note-carriers: a pre-round-6 entry that simply never had a
     flight is exactly as incomplete as one that carries a note instead of it.
     MIRROR: db/schema.sql → wa.migrate_record (airsickness). */
  out.airsickness = (arr(src.airsickness) || []).map((e) =>
    (isDate(e.date) && String(e.flight_code || "").trim())
      ? e : { ...e, legacy: true });

  /* EVALUATIONS — v1 rows carry no identity; they stay, flagged, until the
     student says which of the eight checkrides they were. An identified
     checkride with nothing in it is a FIXED SLOT nobody has flown yet
     (round 5) — a placeholder, not an incomplete import. */
  out.evaluations = (arr(src.evaluations) || []).map((e) => {
    const o = { ...e };
    if (!WA.evalById(o.evaluation)) { o.evaluation = null; o.legacy = true; }
    if (!isDate(o.date) && !WA.slotEmpty("evaluations", o)) o.legacy = true;
    return o;
  });

  /* SOLO FLIGHTS — v1 graded:boolean → ng (non-graded), grade is a % */
  out.solo_flights = (arr(src.solo_flights) || []).map((e) => {
    const o = { ...e };
    if (typeof o.ng !== "boolean") o.ng = !o.graded;
    delete o.graded;
    if (o.ng) o.grade = null;
    /* ROUND 6 — every flown solo names its instructor, NG included: the
       authorising instructor may not fly along, but he authorises. A row
       recorded before that rule is read, stays readable, and is flagged so
       the form asks who authorised it. */
    if (!WA.slotEmpty("solo_flights", o) &&
        (!isDate(o.date) || !String(o.instructor || "").trim() ||
         (!o.ng && !isFinite(Number(o.grade))))) o.legacy = true;
    return o;
  });
  /* ROUND 5 — the solos ARE the syllabus slots. A solo recorded before this
     rule names none, so it takes the earliest free slot in date order: the
     slots come in stage order (1st SOLO → C48XX → C49XX → C52XX → C53XX →
     F43XX ×2 → F45XX), so the k-th solo flown is the k-th solo prescribed.
     Deterministic, and the student can move any of them with the picker.
     A ninth solo, or one with no date to order it by, stays slot-less — the
     "additional solo" path, which is exactly what it is.
     MIRROR: db/schema.sql → wa.migrate_record (solo_flights). */
  {
    const taken = out.solo_flights.map((e) => e.slot).filter(Boolean);
    const free = WA.soloSlots().map((s) => s.id).filter((id) => taken.indexOf(id) < 0);
    out.solo_flights
      .map((e, i) => ({ e, i }))
      .filter((x) => !x.e.slot && isDate(x.e.date))
      .sort((a, b) => String(a.e.date).localeCompare(String(b.e.date)) || (a.i - b.i))
      .forEach((x, k) => { if (k < free.length) x.e.slot = free[k]; });
  }

  /* PROGRESS TESTS → FPC · APTITUDE EXAMS → CEF.
     The superseded storage keys ("progress_tests" from v1 and the transposed
     spelling shipped in round 3) are read for ever, so no stored record is
     stranded; nothing is written under them again. */
  const ren = { fpc: ["fcp", "progress_tests"], cef: ["aptitude_exams"] };
  for (const k of ["fpc", "cef"]) {
    let list = arr(src[k]);
    for (const alt of ren[k]) if (!list) list = arr(src[alt]);
    out[k] = (list || []).map((e) => {
      const o = { ...e };
      /* round 5: "by" → "evaluator" (DO / Squadron CO / an instructor).
         The superseded key is read for ever; nothing is written under it. */
      if (Object.prototype.hasOwnProperty.call(o, "by")) {
        if (o.evaluator === null || o.evaluator === undefined || o.evaluator === "") o.evaluator = o.by;
        delete o.by;
      }
      /* ROUND 6 — an FPC is conducted by the Squadron CO or the DO. A stored
         FPC naming anybody else is READ and shown, flagged so the form asks
         which of the two it was. CEF is untouched. */
      if (!isDate(o.date) || (k === "fpc" && !WA.fpcEvaluatorOK(o.evaluator))) o.legacy = true;
      return o;
    });
  }

  /* ── ROUND 12 — THE LOG TABLES: THE PASS-THROUGH, WHICH IS THE POINT ──────
     `out` is built key by key and the final pass below iterates over IT, so a
     section this function does not NAME never enters the record the form is
     handed — a student's whole flight log would evaporate on the first read.
     Named here, named in WA.ENTRY_KEYS, and the four travel with their own
     repairs. MIRROR: db/schema.sql → wa.migrate_record (round 12 block). */
  for (const k of ["flights", "fs"]) {
    out[k] = (arr(src[k]) || []).map((e) => {
      const o = { ...e };
      /* the authored defaults, so a row written by an older client reads as
         what it always was: one flight of that sortie, in its syllabus place */
      if (typeof o.seq !== "number") o.seq = 1;
      if (!WA.flightKind(o.kind)) o.kind = "syllabus";
      if (typeof o.ng !== "boolean") o.ng = false;
      if (o.ng) o.grade = null;
      /* the track rides in a syllabus code's own letter, so reading it off
         there destroys nothing and invents nothing */
      if (!o.track && WA.codeTrack(o.sortie)) o.track = WA.codeTrack(o.sortie);
      /* A MISSION BESIDE A GRADE IS DROPPED, not flagged — the one place this
         round removes a stored value, and it is lossless: where a grade exists
         the mission is DERIVED from it. Flagging instead would leave a row
         nobody could save, because the form draws no mission box on a graded
         row — a trap, not a question. (Round 12's `verdict` needs no branch of
         its own: it is not in WA.ENTRY_KEYS any more, so the final whitelist
         pass below drops it like any retired key.) */
      if (o.grade !== null && o.grade !== undefined && o.grade !== "" &&
          isFinite(Number(o.grade)) && o.mission) o.mission = null;
      if (o.ng && o.mission) o.mission = null;
      if (o.mission && !WA.mission(o.mission)) { o.mission = null; o.legacy = true; }
      if (!isDate(o.date) || !String(o.sortie || "").trim() ||
          !String(o.instructor || "").trim() || !o.track) o.legacy = true;
      return o;
    });
  }
  /* THE CATALOGUE-NARROWING REPAIR (the wa.nfs_reason_fix model): a group or
     an exam the syllabus no longer contains is nulled and the row flagged —
     never dropped, never guessed at — so a revision cannot make a stored
     record permanently unsaveable. */
  out.lessons = (arr(src.lessons) || []).map((e) => {
    const o = { ...e };
    if (o.group && !WA.groundGroup(o.group)) { o.group = null; o.legacy = true; }
    /* round 12b — no `absent` default: attendance, periods, the instructor and
       the note are not keys of a lesson any more, and the whitelist pass drops
       whatever a stored row still carries under those names */
    /* ROUND 14 — EITHER date completes a lesson: «τα μαθηματα να δεχομαστε και
       μονο end date για την καταγραφη». A row with an end and no start is a
       course that demonstrably ran, so it is no longer flagged as an import
       that lost its date. */
    if ((!isDate(o.date) && !isDate(o.end_date)) || !o.group) o.legacy = true;
    return o;
  });
  out.exams = (arr(src.exams) || []).map((e) => {
    const o = { ...e };
    /* ROUND 14 — the two shapes, repaired the round-13 way: narrowed out of
       its catalogue, an unknown value is NULLED and the row FLAGGED, never
       dropped and never guessed at. */
    const ser = WA.examSeriesDef(String(o.series || "").trim());
    if (o.series && !ser) { o.series = null; o.legacy = true; }
    if (ser) {
      /* a Weekly exam names no exam and takes no trial number; the number is
         its name and a row without one cannot be told from any other */
      if (o.exam) { o.exam = null; o.legacy = true; }
      delete o.trial;
      /* the key is DROPPED and not nulled, so this mirror and wa.migrate_record
         produce byte-identical rows (the house rule: change one, change both) */
      if (WA.examSeriesNo(o) === null) { delete o.series_no; o.legacy = true; }
      else o.series_no = WA.examSeriesNo(o);
      /* date AND grade are nullable — a minted Weekly exam is a planned row */
      return o;
    }
    if (o.exam && !WA.exam(o.exam)) { o.exam = null; o.legacy = true; }
    /* trial 1 is written as no key at all, so a stored 1 (or anything outside
       1..3) is normalised away rather than carried as a second way to say it */
    const t = Math.round(Number(o.trial));
    if (isFinite(t) && t > 1 && t <= WA.EXAM_TRIALS) o.trial = t; else delete o.trial;
    delete o.series; delete o.series_no;
    /* a PLANNED trial may be dateless — a re-sit that has been ordered and not
       yet sat is a row with a number and nothing else */
    if ((!isDate(o.date) && !o.trial) || !o.exam) o.legacy = true;
    return o;
  });

  /* FINAL PASS — per-section key whitelist (mirror of wa.strip_entry): a key
     the form cannot show and the validator no longer accepts is dropped on
     READ, so a record written before this rule stops carrying it. */
  for (const k of Object.keys(out)) {
    const keep = WA.ENTRY_KEYS[k] || [];
    out[k] = (out[k] || []).map((e) => {
      const o = {};
      for (const f of keep) if (Object.prototype.hasOwnProperty.call(e, f)) o[f] = e[f];
      return o;
    });
  }
  return out;
};

/* ── shared record metric helpers (used by instructor + admin views) ── */
/* NOTE (round 2 R4, completed in round 4 W3c): there is deliberately NO mean
   evaluation grade and NO evaluation COUNT — anywhere. Every student converges
   to the same eight checkrides, so the count says nothing and invites a false
   comparison; the per-evaluation grades and the summary table carry the
   information instead. recStats therefore has no `evals` key at all — the
   number cannot be resurrected by copying a line. Every count below is
   DERIVED from the entries, never typed. */
/* ROUND 12 — the four log sections join the arithmetic, honestly. The
   consequence is named rather than hidden: a mid-stage student goes from ~18
   entries to ~80, so "3 of 8 entered by the admin" becomes "3 of 80". That is
   what the record now contains, and a denominator that pretended otherwise
   would be the untruth. */
WA.COUNTED = ["nfs", "sms", "fail", "almost_good", "airsickness",
              "evaluations", "solo_flights", "fpc", "cef",
              "flights", "fs", "lessons", "exams"];

/* ── IS THIS RECORD DIFFERENT FROM THAT ONE? (round 9) ──────────────────────
   One string per record, so "has anything actually changed since the last
   save?" is a string comparison and not a flag somebody has to remember to
   lower. The floating Save of the student form rides on exactly this: it
   appears when the fingerprint moves away from the saved one and leaves when
   it comes back — typing a character and deleting it again ends where it
   started, which a set-once dirty flag could never see.
   WHAT IS DELIBERATELY NOT IN IT:
     · keys prefixed "_" — the picker's _o_x memory and every other UI-only
       crumb. REVEALING a free-text box is not an edit of the record.
     · the DIFFERENCE between null, undefined and "" — an empty box and an
       absent field are the same absence, and typing into a box and clearing
       it again must land back on clean.
     · leading / trailing whitespace — the server normalises it away
       (wa.norm_line), so a stray space changes nothing that gets stored.
   Key order is sorted, so two objects built in different orders — a stored
   entry and one the form rebuilt — still fingerprint alike. */
WA.fpValue = function (v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(WA.fpValue);
  if (typeof v === "string") { const s = v.trim(); return s === "" ? null : s; }
  if (typeof v === "object") return WA.fpEntry(v);
  return v;
};
WA.fpEntry = function (e) {
  const out = {};
  for (const k of Object.keys(e || {}).sort()) {
    if (k.charAt(0) === "_") continue;
    out[k] = WA.fpValue(e[k]);
  }
  return out;
};
WA.recordFingerprint = function (rec) {
  const r = rec || {};
  return JSON.stringify(WA.COUNTED.map((k) =>
    (Array.isArray(r[k]) ? r[k] : []).map(WA.fpEntry)));
};

WA.recStats = function (rec) {
  const r = rec || {};
  /* ROUND 5 — FILLED SLOTS ONLY. The solo and evaluation sections always
     carry their fixed syllabus rows; a slot nobody has flown yet is not a
     solo the student flew, so it counts for nothing anywhere. */
  const n = (k) => WA.filled(k, r[k]).length;
  return {
    nfs: n("nfs"), sms: n("sms"), fail: n("fail"), almost_good: n("almost_good"),
    airsickness: n("airsickness"), solos: n("solo_flights"),
    fpc: n("fpc"), cef: n("cef"),
    legacy: WA.legacyItems(r).length,
    /* HOW MANY entries the admin entered — never WHETHER the record is "the
       admin's": that verdict needs the total too, and lives in WA.coSource */
    co: WA.coEntries(r).length,
  };
};

/* every entry the admin entered on the owner's behalf, described */
WA.coEntries = function (rec) {
  const r = rec || {};
  const out = [];
  for (const k of WA.COUNTED) {
    WA.filled(k, r[k]).forEach((e, i) => {
      if (WA.isCO(e)) out.push(WA.secLabel(k) + " #" + (i + 1));
    });
  }
  return out;
};

/* every evaluation of one record, normalised for the plot and the table.
   ROUND 5: `flown` separates a real attempt from a fixed slot nobody has
   flown yet — the latter is a placeholder the syllabus put there. */
WA.evalRows = function (rec) {
  const list = (rec && Array.isArray(rec.evaluations)) ? rec.evaluations : [];
  return list.map((e, i) => {
    const def = WA.evalById(e.evaluation);
    const g = Number(e.grade);
    return {
      i, id: def ? def.id : null, def,
      cat: def ? def.cat : null, order: def ? def.order : 99,
      grade: (e.grade === null || e.grade === undefined || e.grade === "" || !isFinite(g)) ? null : g,
      /* ROUND 23 — the projection carries `duration` through, because the
         derived Flights row of a checkride reads its hours off this row */
      duration: (e.duration === null || e.duration === undefined || e.duration === "")
        ? null : e.duration,
      with: e.with || "", date: e.date || "", legacy: !def,
      flown: !WA.slotEmpty("evaluations", e),
      entered_by: e.entered_by || null,
    };
  });
};
/* ══════════════════════════════════════════════════════════════════════════
   WHO IS ON A SOLO ROW (round 6) — one helper, every surface.
   A student never launches alone on their own authority: somebody AUTHORISES
   the solo and signs for it. NG removes the GRADE, never the person, so every
   flown solo names an instructor — the one who graded it, or (on an NG row)
   the one who authorised it. A row recorded before the rule has nobody's name,
   and says so rather than showing an empty cell.
   MIRROR: the solo_flights block of wa.validate_record. */
WA.soloWho = function (e) {
  const who = String((e && e.instructor) || "").trim();
  return who || "not recorded";
};
WA.SOLO_WHO_TIP =
  "Every solo is authorised by somebody — this row was recorded before round 6 asked for the name, and the record cannot be saved again until it is supplied";
WA.soloWhoHTML = function (e) {
  const who = String((e && e.instructor) || "").trim();
  if (!who) {
    return `<span class="badge badge-bad" title="${esc(WA.SOLO_WHO_TIP)}">not recorded</span>`;
  }
  return esc(who);
};
/* the same fact as a PHRASE, for the running lines of the brief and the
   instructor card, where a bare "w/" in front of "not recorded" reads wrong */
WA.soloWhoPhrase = function (e) {
  const who = String((e && e.instructor) || "").trim();
  if (!who) {
    return `<span class="k" title="${esc(WA.SOLO_WHO_TIP)}">not recorded</span>`;
  }
  return `<span class="k">authorised by ${esc(who)}</span>`;
};
/* ── HOW A SOLO SLOT STARTS (round 8) ──────────────────────────────────────
   The CONTACT solos are the adaptation solos: the student goes round on their
   own and nobody is in the other seat to score it, so the squadron records
   them NG and names whoever authorised the launch. The FORMATION solos are
   flown and graded as a pair, so those start graded. This is the state a slot
   takes THE FIRST TIME IT IS FILLED — the Graded/NG chips stay live, and a row
   the owner has already answered is never moved. Slot ids carry their own
   track in their first letter (wa.solo_slots(): C4790-91-S1, C4801-04-S1,
   C4901-05-S1, C5201-04-S1, C5301-04-S1, F4301-06-S1/-S2, F4501-03-S1), so
   nothing has to be typed into the generated catalogue for this. */
WA.soloDefaultNG = function (slotId) {
  return String(slotId || "").charAt(0) === "C";
};
WA.SOLO_NG_DEFAULT_TIP =
  "The contact (adaptation) solos are recorded NG — nobody is in the other seat to grade them — so the row starts NG and names who authorised it. Switch it to Graded % if this one was graded.";

/* ══════════════════════════════════════════════════════════════════════════
   EVALUATIONS FOLLOW THE SYLLABUS ORDER (round 6).
   The stage is flown in one order and the checkrides sit in it at fixed
   points, so a later checkride cannot have been flown while an earlier one
   has not: such a record is a slip of the identity picker, and it corrupts
   every per-checkride comparison the admin makes without ever looking wrong.
   THE ORDER IS WA.EVAL_ORDER — the file order of flowchart2.json, i.e. the
   printed Training Flow Chart. What is refused is a FILL out of order; an
   empty fixed slot is always allowed, because that is the state all eight
   start in.
     → { recorded:{id:bool}, blockedBy:{id:firstMissingPredecessorId} }
   MIRROR: db/schema.sql → the evaluations block of wa.validate_record. */
WA.evalOrderState = function (rec) {
  const list = (rec && Array.isArray(rec.evaluations)) ? rec.evaluations : [];
  const recorded = {};
  for (const e of list) {
    if (!e || !WA.evalById(e.evaluation)) continue;
    if (!WA.slotEmpty("evaluations", e)) recorded[e.evaluation] = true;
  }
  const blockedBy = {};
  WA.EVAL_ORDER.forEach((id, k) => {
    for (let j = 0; j < k; j++) {
      if (!recorded[WA.EVAL_ORDER[j]]) { blockedBy[id] = WA.EVAL_ORDER[j]; break; }
    }
  });
  return { recorded, blockedBy };
};

/* ══════════════════════════════════════════════════════════════════════════
   THE GRADE SCALE — WHAT «CHARACTERISED SUCCESSFUL» MEANS (round 11).
   ──────────────────────────────────────────────────────────────────────────
   Nothing in this record stores an OUTCOME. There is no pass/fail tick on an
   evaluation entry and there never was: `evaluations` carries date · identity ·
   with whom · grade, and that is the whole shape (WA.ENTRY_KEYS.evaluations ⇄
   wa.entry_keys('evaluations')). So the honest answer to "was this flight
   characterised successful?" is not a field somebody forgot to fill in — it is
   THE GRADE, read against the printed scale, which is exactly how the squadron
   reads it on paper.

   THE PRINTED SCALE — ΠΔ 151/13, quoted in 3-01/2025 ΔΑΕ and digitised in
   FDMS data/requirements/failure_procedures.json (requirement #0, `verbatim`):
     «Α»  Άριστα           90-100 %
     «ΛΚ» Λίαν Καλώς       75-89 %
     «Κ»  Καλώς            60-74 %
     «ΣΚ» Σχεδόν Καλώς     50-59 %   = ΥΣΤΕΡΗΣΗ  (lagging)
     «Ε»  ΑΠΟΤΥΧΩΝ          0-49 %   = ΑΠΟΤΥΧΙΑ  (failed)
   The same record states the consequence in one line: «Το κατώφλι 59%/60%
   διαχωρίζει την αποδεκτή από τη μη αποδεκτή απόδοση και είναι το κατώφλι που
   χρησιμοποιούν όλα τα κριτήρια παραπομπής.»
   For a CHECKRIDE specifically the same threshold is written into the referral
   law itself — ΠΔ 29/2020 Άρθρο 3 παρ.1β (FDMS fail-16): a grade «από μηδέν (0)
   έως πενήντα εννέα τοις εκατό (59%)» in a πτήση εξέτασης ή αξιολόγησης is the
   referral case. The two agree, so there is one number: 60.

   The squadron's own words for the two failing bands are the user's words for
   this rule — «αποτυχία ή υστέρηση» — and they are the two bands below 60.

   ── ROUND 15 (2026-08-21) — AND THE GROUND EXAMS ARE JUDGED AT 80 ──────────
   COMMAND WORDING: «80% για εξετασεις εδαφους, 60% για πτησεις. Πλεον εχουμε
   κανει και το mapping.» That settles round 12b's open item («THE GROUND-EXAM
   PASS MARK IS DELIBERATELY NOT DECIDED») in the second of the two readings it
   named: they ARE two different exams and both numbers are right. FDMS's
   `exam_pass_pct` (default 80) and WA now agree, and the bridge joins two
   systems that use the same number.

   WHAT DOES **NOT** MOVE, and why the printed scale is untouched:
   · THE FIVE BANDS ARE A CHARACTERISATION, NOT A PASS MARK. A ground exam
     marked 78 is still «ΛΚ Λίαν Καλώς» on ΠΔ 151/13 — that is what the paper
     says about the performance. What changed is whether that performance
     PASSES A GROUND EXAM, which is a different question with its own number.
     So WA.gradeBand / WA.GRADE_BANDS stay exactly as printed, and only the
     PASS test becomes section-aware.
   · FLIGHTS AND F/S KEEP 60 — the referral criteria of ΠΔ 29/2020 read that
     number off a πτήση and nothing about them changed. The mission collapse
     (WA.gradeMission) is a FLIGHTS-ONLY key and therefore keeps 60 too.
   · THE FOUR ROW STATES ARE NOT A PASS TEST and do not move: a ground exam is
     `done` on its date AND its result, whatever the result says. A failed exam
     with every field filled is a COMPLETE ROW. Pass/fail is the other axis,
     and on the exams it decides exactly one thing — WHICH TRIAL IS OPERATIVE
     (WA.examOperativeIx), and through it which trial wears the slot.
   · The freeze-per-exam-at-entry principle (an exam judged by the mark in
     force on the day it was sat) belongs to the BRIDGE FINGERPRINTS on the
     FDMS side, not to a WA constant: WA stores one live number.
   MIRROR: db/schema.sql → wa.grade_pass_min() / wa.exam_pass_min() /
   wa.grade_band() / wa.grade_passed(). Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
/* THE THREE LINES THAT CARRY THE NUMBERS — `WA.GRADE_PASS_MIN = 60`,
   `WA.EXAM_PASS_MIN = 80` and `WA.passMin(sec)` — ARE AT THE TOP OF THIS FILE
   («THE TWO PASS MARKS, HOISTED», round 15b): the constant strings of this file
   are evaluated at load and have to be able to read them. This is where they
   are EXPLAINED; that is where they are declared, and nowhere else. */
WA.GRADE_BANDS = [
  { id: "excellent", lo: 90, code: "Α",  label: "Excellent",   el: "Άριστα",        pass: true },
  { id: "very_good", lo: 75, code: "ΛΚ", label: "Very Good",   el: "Λίαν Καλώς",    pass: true },
  { id: "good",      lo: 60, code: "Κ",  label: "Good",        el: "Καλώς",         pass: true },
  { id: "lagging",   lo: 50, code: "ΣΚ", label: "Lagging",     el: "Σχεδόν Καλώς — ΥΣΤΕΡΗΣΗ", pass: false },
  { id: "failed",    lo: 0,  code: "Ε",  label: "Failed",      el: "ΑΠΟΤΥΧΩΝ — ΑΠΟΤΥΧΙΑ",     pass: false },
];
WA.GRADE_SOURCE = "ΠΔ 151/13 (3-01/2025 ΔΑΕ) — Α 90-100 · ΛΚ 75-89 · Κ 60-74 · ΣΚ 50-59 (ΥΣΤΕΡΗΣΗ) · Ε 0-49 (ΑΠΟΤΥΧΙΑ); the 59/60 threshold is the one every referral criterion uses";
/* the band a grade falls in · null for no grade at all */
WA.gradeBand = function (g) {
  if (g === null || g === undefined || g === "") return null;
  const n = Number(g);
  if (!isFinite(n)) return null;
  return WA.GRADE_BANDS.find((b) => n >= b.lo) || WA.GRADE_BANDS[WA.GRADE_BANDS.length - 1];
};
/* WAS THIS CHARACTERISED SUCCESSFUL? — the one question, one answer.
   A row with no grade is NOT a pass: an evaluation whose result has not been
   written yet has not been characterised anything.
   ROUND 15 — the SECOND ARGUMENT is the section, and it is the whole of the
   80 % ruling: `gradePassed(g)` is the flight question and answers it exactly
   as it has since round 11 (the band's own `pass` flag is `n >= 60`, so this
   is the same test written as the number it always was); `gradePassed(g,
   'exams')` is the ground-exam question and answers it at 80. Callers that
   pass no section are asking about a flight — which is every caller that was
   here before this round.
   ══════════════════════════════════════════════════════════════════════════
   ROUND 15b (R15 verify item 15) — THE 60 IS NOW READ FROM TWO PLACES, AND
   THAT IS DELIBERATE. THE INVARIANT: for every finite grade `g`,
        WA.gradePassed(g) === (WA.gradeMission(g) === "complete")
   — but the two functions do NOT share an implementation, and must not:
   · `WA.gradePassed(g, sec)` reads the NUMBER (`n >= WA.passMin(sec)`), because
     it has to answer a SECOND question — the ground exam's 80 % — and a band
     has no section.
   · `WA.gradeMission(g)` reads the printed BAND's own `pass` flag, and that is
     load-bearing: the mission collapse is the FIVE-BAND SCALE of ΠΔ 151/13 said
     in two words, so it must keep answering «which side of the printed scale is
     this?» and not «is this ≥ some number?». Unifying them would silently make
     the mission follow any future section-aware mark — which is exactly what
     round 15 ruled it must NOT do (a flight has no ground-exam mark).
   THEY AGREE TODAY BECAUSE `GRADE_BANDS[good].lo === 60 === GRADE_PASS_MIN`.
   A round that moves ONE of those two numbers without the other breaks the
   invariant, so BOTH definitions name each other here, and the invariant is
   recorded in the spec's open list (§4p) rather than asserted at runtime:
   this application writes NOTHING to the console, ever (house rule), and a
   check nobody can see is not a guard — it is noise waiting to happen.
   MIRROR of the same split, server-side: db/schema.sql → wa.grade_passed()
   reads the number, wa.grade_mission() reads wa.grade_band(). Same pair, same
   invariant, same reason.
   ══════════════════════════════════════════════════════════════════════════ */
WA.gradePassed = function (g, sec) {
  if (g === null || g === undefined || g === "") return false;
  const n = Number(g);
  if (!isFinite(n)) return false;
  return n >= WA.passMin(sec);
};
WA.gradeBandText = function (g) {
  const b = WA.gradeBand(g);
  return b ? b.label + " («" + b.code + "» " + b.el + ")" : "no grade recorded";
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 12 — THE LOG TABLES: the four sections' vocabulary.
   ──────────────────────────────────────────────────────────────────────────
   MIRROR: db/schema.sql → wa.flight_kinds() / wa.missions() /
   wa.grade_mission(). Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
WA.LOG_BANDS = [
  { id: "flights", label: "Flights", short: "Flights", device: "T-6A",
    tip: "The sorties flown in the aircraft" },
  { id: "fs", label: "F/S", short: "F/S", device: "simulator",
    tip: "The sorties flown in the simulator" },
];
WA.logBand = function (id) { return WA.LOG_BANDS.find((b) => b.id === id) || null; };

/* «να αφησουμε placeholder για τυχον fcf, cef, repeat» — the user's own list.
   `off` marks the kinds that are OFF-CATALOGUE BY NATURE: for them the sortie
   box is free text and carries no "not in the syllabus catalogue" warning,
   because the catalogue was never the right list to look in. */
WA.FLIGHT_KINDS = [
  { id: "syllabus", label: "Syllabus", tip: "A sortie of the printed flow chart, flown in its place" },
  { id: "repeat", label: "Repeat", tip: "The SAME syllabus sortie flown again — the squadron's scheduler records a re-fly as a second event on the same node" },
  { id: "fcf", label: "FCF", off: true, tip: "Functional Check Flight — not a syllabus sortie, so the flight box is free text" },
  { id: "cef", label: "CEF", off: true, tip: "Εξέταση Καταλληλότητας — recorded here as a flight; the CEF section keeps the evaluation itself" },
  { id: "other", label: "Other", off: true, tip: "Anything the four above do not cover — the flight box is free text" },
];
WA.flightKind = function (id) { return WA.FLIGHT_KINDS.find((k) => k.id === id) || null; };
WA.flightKindLabel = function (id) {
  const k = WA.flightKind(id);
  return k ? k.label : (id ? String(id) : "Syllabus");
};
/* does this kind free the flight box from the syllabus catalogue? */
WA.kindOffCatalogue = function (id) { return !!(WA.flightKind(id) || {}).off; };

/* ── THE MISSION (round 12b) ───────────────────────────────────────────────
   «Or a verdict with no number. Θελω μονο mission complete, mission
   incomplete.» Two answers and no third: round 12's pass / lagging / failed
   was the printed grade scale wearing a second name, and where a grade exists
   that scale is already there — in the number.
   It exists only where the grade is absent and the row is not NG: a stored
   mission beside a stored grade is a second source of truth that can
   contradict the first — the defect round 11 removed from the FPC.
   MIRROR: db/schema.sql → wa.missions() / wa.grade_mission(). */
WA.MISSIONS = [
  { id: "complete", label: "Mission complete", short: "complete", cls: "ok",
    tip: "The squadron recorded this flight as a completed mission and has no percentage for it" },
  { id: "incomplete", label: "Mission incomplete", short: "incomplete", cls: "bad",
    tip: "The squadron recorded this flight as an incomplete mission and has no percentage for it" },
];
WA.mission = function (id) { return WA.MISSIONS.find((m) => m.id === id) || null; };
WA.missionLabel = function (id) {
  const m = WA.mission(id);
  return m ? m.label : (id ? String(id) : "");
};
/* the two-way collapse of the printed five-band scale, at the SAME 60 %
   threshold. FLIGHTS AND F/S ONLY, and that is why round 15's 80 % does not
   reach it: `mission` is a key of the two flight logs and an exams row carries
   none, so there is no such thing as a ground exam's mission to collapse.
   ROUND 15b (R15 verify item 15) — IT READS THE BAND, `WA.gradePassed` READS
   THE NUMBER, and the two are TWO SOURCES THAT AGREE rather than one source
   used twice. The band read here is the load-bearing half: this function IS the
   printed five-band scale collapsed into the squadron's two words, so it must
   keep asking «which side of ΠΔ 151/13 is this?». The invariant they owe each
   other — `gradePassed(g) === (gradeMission(g) === "complete")` for every
   finite g — holds only while `GRADE_BANDS[good].lo === GRADE_PASS_MIN`, and it
   is written out in full at WA.gradePassed above and listed in the spec (§4p).
   MIRROR: db/schema.sql → wa.grade_mission (which reads wa.grade_band — the
   same split, on purpose). */
WA.gradeMission = function (g) {
  const b = WA.gradeBand(g);
  if (!b) return null;
  return b.pass ? "complete" : "incomplete";
};
/* what a row's mission IS, whatever it stores: derived from the grade when
   there is one, read off the row when there is not. One function, so the
   cell, the CSV and the count cannot disagree. */
WA.rowMission = function (e) {
  if (!e) return null;
  if (e.grade !== null && e.grade !== undefined && e.grade !== "" && isFinite(Number(e.grade))) {
    return WA.gradeMission(e.grade);
  }
  return WA.mission(e.mission) ? e.mission : null;
};
/* is this row's mission DERIVED (and therefore not editable)? */
WA.missionDerived = function (e) {
  return !!e && e.grade !== null && e.grade !== undefined && e.grade !== "" &&
         isFinite(Number(e.grade));
};

/* ── THE DEBRIEF LAG, WHICH IS THE REALITY THE DIRECTIVE NAMES ─────────────
   «δεκτο το null, γιατι καποιες φορες αργει το debriefing». A flown row with
   no grade, not NG, and no mission is a row WAITING FOR ITS DEBRIEF — never an
   error, never a legacy leftover, never something that blocks a save. It is
   shown quietly, and it goes amber once it has been waiting a while, because
   at some point the quiet fact becomes a thing to chase. A hand-set mission
   ENDS the wait: the squadron characterised the flight, it just did so without
   a percentage. (An exams row has no mission key, so `e.mission` is undefined
   there and the same function reads it correctly.) */
WA.DEBRIEF_AMBER_DAYS = 7;
WA.awaitingDebrief = function (e) {
  if (!e || e.ng) return false;
  const hasGrade = e.grade !== null && e.grade !== undefined && e.grade !== "" &&
                   isFinite(Number(e.grade));
  return !hasGrade && !WA.mission(e.mission) && !!String(e.date || "").trim();
};
/* how many days ago that flight was — null when the date is unusable */
WA.daysAgo = function (d) {
  const s = String(d || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const then = Date.parse(s + "T00:00:00Z");
  if (!isFinite(then)) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86400000);
};
/* the chip itself — quiet by default, amber once it has waited.
   ROUND 13 residual (found while re-rendering the admin's exam table): the chip is
   SECTION-AWARE, like WA.debriefWord has been since 12b. A ground exam awaits a
   RESULT, not a debrief — nobody debriefs a written paper — and the admin's exam
   table was the one surface still saying the flight word. 12b's own note
   claimed this surface already agreed; it did not, and now it does. */
WA.debriefChip = function (e, sec) {
  if (!WA.awaitingDebrief(e)) return "";
  const n = WA.daysAgo(e.date);
  const late = n !== null && n >= WA.DEBRIEF_AMBER_DAYS;
  const exam = sec === "exams";
  const word = exam ? "awaiting a result" : "awaiting debrief";
  const tip = late
    ? (exam ? "Sat " + n + " days ago and the result has still not been written"
            : "Flown " + n + " days ago and still without a grade — the debrief has not landed yet")
    : (exam ? "The exam is recorded; its result has not been written yet."
            : "The flight is recorded; its grade has not been written yet. That is expected — the debrief sometimes takes a while.");
  return `<span class="lagchip${late ? " is-late" : ""}" title="${esc(tip)}"
    aria-label="${esc(tip)}">${esc(word)}${late ? " · " + n + " d" : ""}</span>`;
};
/* the same fact for CSV / plain text. 12b verify finding 3 — a ground EXAM
   awaits a RESULT, not a debrief: every other surface already says so
   (admin.js "awaiting a result", the exam row chip); the CSV must agree. */
WA.debriefWord = function (e, sec) {
  if (!WA.awaitingDebrief(e)) return "";
  const n = WA.daysAgo(e.date);
  const word = sec === "exams" ? "awaiting a result" : "awaiting debrief";
  return word + (n === null ? "" : " (" + n + " d)");
};

/* ── THE LOG CATALOGUES (generated into app/items-catalog.js) ─────────────── */
/* the sorties of ONE table, in FLOW-CHART ORDER. MIRROR: wa.sortie_codes. */
WA.logSorties = function (band, track) {
  const b = (typeof WA_LOG_SORTIES === "object" && WA_LOG_SORTIES) ? WA_LOG_SORTIES[band] : null;
  const t = b ? b[track] : null;
  return Array.isArray(t) ? t : [];
};
WA.logSortie = function (band, track, code) {
  const c = WA.normCode(code);
  return WA.logSorties(band, track).find((s) => s.c === c) || null;
};
/* which band a syllabus code belongs to — 'flights' | 'fs' | null.
   The letter gives the TRACK (WA.codeTrack); only the flow chart gives the
   band, which is why this is a lookup and not a regex. */
WA.sortieBand = function (code) {
  if (!WA._bandIx) {
    WA._bandIx = {};
    for (const b of WA.LOG_BANDS) {
      for (const t of WA.TRACKS) for (const s of WA.logSorties(b.id, t)) WA._bandIx[s.c] = b.id;
    }
  }
  return WA._bandIx[WA.normCode(code)] || null;
};
/* the PRESCRIBED hours of a sortie — what the duration box opens with. What
   is stored is always the ACTUAL time flown; this is a starting point. */
WA.sortieHours = function (band, track, code) {
  const s = WA.logSortie(band, track, code);
  return s && typeof s.h === "number" ? s.h : null;
};
/* WHAT THE TABLE'S DROPDOWN OFFERS — the flow-chart list MINUS the eight
   checkrides. A checkride is recorded in the Evaluations section, where the
   syllabus order and the pass-attempt rule apply to it; two rows for one
   flight would be two grades that can disagree. The server refuses such a row
   by name, so this is the courtesy and not the guard.
   ROUND 22b — AND MINUS THE SOLOS BY DEFINITION, for the identical reason: the
   server refused EVERY flights row naming one (tier 1), so offering C4791 in
   this picker was inviting a choice the save would then refuse.
   ROUND 23 — AND IT STAYS OUT ALTHOUGH THE SAVE NO LONGER REFUSES IT. The
   judgement, recorded (§4y·11·1): a picker that offers a code this table can
   NEVER HOLD is a list manufacturing the double record the suspect mark exists
   to catch — the `so` position is still never claimable by a stored row, so a
   C4791 row typed into this table is ALWAYS an extra wearing the word, and
   offering it in the syllabus dropdown would be the list saying «this is one of
   your sorties, put it here». Free text can always type it, and typing it is a
   DELIBERATE act that meets the mark on the keystroke; picking from the list is
   not deliberate, it is trust in the list. And `ck` and `so` have been ONE rule
   since 22b (WA.slotOwner) — splitting them now would put two doctrines back
   where one was.
   MIRROR: the wa.eval_ids() refusal in wa.validate_record (the checkrides); the
   solo half is a client mark and the server refuses nothing about it. */
WA.logPickList = function (band, track) {
  return WA.logSorties(band, track).filter((s) => !s.k && !WA.isSoloOnlyCode(s.c));
};
/* is this code one the table's own list knows? (an unknown one is accepted —
   the syllabus data can lag reality — and shown marked) */
WA.logSortieKnown = function (band, track, code) {
  if (!String(code || "").trim()) return true;
  return !!WA.logSortie(band, track, code);
};
/* "C4302 — Aerobatics" · free text as typed. Round-12 verify finding 3: the
   off-catalogue warning is for kind:syllabus rows only — an FCF/CEF/other row
   is off-catalogue BY NATURE and must not wear it (pass the row's kind). */
WA.logSortieLabel = function (band, track, code, kind) {
  if (!String(code || "").trim()) return "—";
  const s = WA.logSortie(band, track, code);
  if (s) return s.c + " — " + s.n + (s.nt ? " (night)" : "");
  const k = String(kind || "syllabus");
  return String(code) + (k === "syllabus" || k === "repeat" ? " (not in the syllabus catalogue)" : "");
};

/* the 12 theory groups and their 47 courses. THE JOIN KEY IS THE PAIR
   (group, course) — OJT is a course of four different groups. */
WA.groundGroups = function () {
  return (typeof WA_GROUND !== "undefined" && Array.isArray(WA_GROUND)) ? WA_GROUND : [];
};
WA.groundGroup = function (id) {
  return WA.groundGroups().find((g) => g.g === id) || null;
};
WA.groundGroupLabel = function (id) {
  const g = WA.groundGroup(id);
  return g ? g.g + " — " + g.name : (id ? String(id) : "—");
};
WA.lessonCourses = function (group) {
  const g = WA.groundGroup(group);
  return g && Array.isArray(g.courses) ? g.courses : [];
};
WA.lessonCourse = function (group, code) {
  return WA.lessonCourses(group).find((c) => c.c === code) || null;
};
/* which group a course code belongs to, when exactly one does — the check
   behind "that course belongs to another group" */
WA.courseHome = function (code) {
  const c = String(code || "").trim();
  if (!c) return null;
  for (const g of WA.groundGroups()) if (g.courses.some((x) => x.c === c)) return g.g;
  return null;
};
/* the 8 ground-exam groups (and only those — the nested exams[] of four
   theory groups are COURSES of their group in FDMS, so they live in lessons) */
WA.examList = function () {
  return (typeof WA_EXAMS !== "undefined" && Array.isArray(WA_EXAMS)) ? WA_EXAMS : [];
};
WA.exam = function (id) { return WA.examList().find((e) => e.id === id) || null; };
WA.examLabel = function (id) {
  const e = WA.exam(id);
  return e ? e.id + " — " + e.name : (id ? String(id) : "—");
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 14 — TRIALS, AND THE WEEKLY SERIES.
   ──────────────────────────────────────────────────────────────────────────
   «στα ground exam να εχουμε 2nd trial, 3rd και να μπορουμε να βαλουμε τα ΕΕΘ
    με ΕΕΘ 1, ΕΕΘ 2 κλπ»

   TWO DIFFERENT THINGS ARRIVE IN ONE SENTENCE, and they are stored
   differently because they ARE different:

   1. A TRIAL is another attempt AT ONE OF THE EIGHT. It is not a new exam —
      it is the same exam, sat again — so it carries the exam's own identity
      and a number: `trial` 1 · 2 · 3, at most three, at most one row each.
      A row with no `trial` key IS the first trial; nothing in the record has
      to be rewritten for that to be true, which is why 1 is written as null.

   2. A WEEKLY EXAM is a WEEKLY THEORY EXAM — an OPEN series the syllabus does
      not enumerate. It has no place among the eight and no fixed count, so it
      carries `series` ('EETH') and `series_no` (1, 2, 3 …) and no `exam` at
      all. The next one is max + 1: they are numbered, not dated, and the
      number is the name.

   WHICH TRIAL HOLDS THE SLOT — THE EVALUATIONS' RULE, ONE SECTION OVER.
   The colour of an exam slot follows the OPERATIVE attempt, decided exactly
   as round 11 decided it for the eight checkrides (WA.evalOperativeOf): PASS
   is the filter and it runs first, LATEST is only the tiebreak, and a slot
   with no pass at all falls back to the latest attempt so that a student who
   has failed twice still shows a number rather than an em dash. It has to be
   the same rule — a re-sat exam and a re-flown checkride are the same fact
   about the same student, and two rules would let the brief and the form
   disagree about whether IN190 is done.

   NEITHER IS MUSTARD. The `extra` wash means «beyond the syllabus's one
   planned pass», and both of these are planned: a 2nd trial is ordered by the
   squadron, a weekly exam is on the weekly programme. They take the ordinary
   done / started verdict of any written row (WA.rowPlanned).
   MIRROR: db/schema.sql → wa.exam_series() and the exams branch of
   wa.validate_record. Change one, change the other.

   ══════════════════════════════════════════════════════════════════════════
   ROUND 18 — THE SERIES IS CALLED «WEEKLY».
   ──────────────────────────────────────────────────────────────────────────
   COMMAND RULING (2026-08-26), verbatim:
     «τα ερωτηματολογια ΕΕΘ 1,2,3 να τα βαλουμε ως Weekly 1,2,3»
     — «the ΕΕΘ questionnaires 1,2,3, let us put them as Weekly 1,2,3».
   OLD NAME → NEW NAME: **ΕΕΘ n → Weekly n**, on every surface a human reads —
   the row label, the mint button, the badges and tips, the confirmation
   dialog, the printed brief, the CSV cells, the admin table and the server's
   own refusals.

   THE STORED KEY IS UNTOUCHED AND THAT IS THE POINT. `id` below is still the
   literal 'EETH', which is what `series` holds in every record already
   written, what the CHECK on the server accepts and what the payload sends.
   NOT ONE ROW IS MIGRATED: a record stored in round 14 renders «Weekly 3» the
   instant this file loads, because `label` was always a LOOKUP and the number
   was always the name. Renaming the key would have meant rewriting every
   stored record to change a caption — and would have broken any instance still
   serving the previous client. The word is data; the key is the contract.
   MIRROR: db/schema.sql → wa.series_label().

   ROUND 19 — AND THE «ΕΕΘ» IN THE TIP STAYS. RULING (Claude, 2026-08-26,
   standing unless the user overrules it). Round 18 renamed the series to
   «Weekly» on every surface and left one Greek word behind, inside the
   tooltip: «the squadron's ΕΕΘ, renamed on 2026-08-26». That is not a missed
   surface — it is a TERMINOLOGY BRIDGE, and it is deliberate.
   WHY IT IS NOT A VIOLATION OF THE ENGLISH-UI RULE. The rule exists so that a
   foreign student officer can read this application; it has never meant that a
   Greek word may not be NAMED as the thing an English one replaced. Every user
   of this form has spent a year hearing «ΕΕΘ» in the squadron and reading it on
   the programme board, and a tooltip that pretended the word did not exist
   would force each of them to work out for themselves that «Weekly» is the same
   examination. The bridge is where a bridge belongs: one hover away, never in a
   label, never in a stored value, and dated so a reader knows when the change
   happened. The same judgement governs the round-19 ΑΕΡΟΣ / F/S labels — see
   WA.CURRENCY_CATS, where the printed Greek is the label and the English is
   one hover away, for the same reason and with the same limit.
   IT IS A SENTENCE WITH AN EXPIRY: when nobody in the squadron says «ΕΕΘ» any
   more, the bridge has done its work and the clause goes. Until then, removing
   it would cost a reader the one fact that connects the new word to his own.
   ══════════════════════════════════════════════════════════════════════════ */
WA.EXAM_TRIALS = 3;
WA.EXAM_SERIES = [
  /* `id` is the STORED key and never changes; `label` is what everybody reads.
     ROUND 19 — AND THERE IS NO `en` ANY MORE. Round 18 added it as «the ASCII
     spelling of the stored key, kept for the file names and log lines that must
     stay ASCII», and not one file name or log line ever read it: the stored key
     is ALREADY ASCII, so the field was a copy of `id` under a second name. A
     dead field is a promise the code does not keep — the next reader would have
     had to prove it was unused before touching either half — so it is gone. */
  { id: "EETH", label: "Weekly",
    tip: "Weekly — the weekly theory exams (the squadron's ΕΕΘ, renamed on 2026-08-26). An OPEN series the syllabus does not enumerate: they are numbered Weekly 1, Weekly 2 … in the order they are sat, and both the date and the grade may be left empty until they are known. They are not one of the eight ground exams and they are not extras — they are planned. They ARE ground exams, so they are marked at the ground-exam pass mark: " + WA.passMin("exams") + " %, the same number as the eight (round 15)." },
];
WA.examSeriesDef = function (id) {
  return WA.EXAM_SERIES.find((s) => s.id === id) || null;
};
/* the series a row belongs to, or null when it is one of the eight */
WA.examSeries = function (e) {
  return (e && typeof e === "object") ? WA.examSeriesDef(String(e.series || "").trim()) : null;
};
WA.examSeriesNo = function (e) {
  const n = Math.round(Number((e || {}).series_no));
  return isFinite(n) && n >= 1 ? n : null;
};
/* WHICH TRIAL THIS ROW IS. Absent, null and 1 all mean the first trial — the
   key is only ever written when it says something (2 or 3), so a record from
   before this round is already correct without being touched. */
WA.examTrial = function (e) {
  const n = Math.round(Number((e || {}).trial));
  return (isFinite(n) && n >= 1 && n <= WA.EXAM_TRIALS) ? n : 1;
};
WA.EXAM_TRIAL_WORDS = ["", "1st trial", "2nd trial", "3rd trial"];
WA.examTrialWord = function (n) {
  return WA.EXAM_TRIAL_WORDS[n] || (n + "th trial");
};
/* what this row IS CALLED, on every surface: "IN190 · 2nd trial", "Weekly 3"
   ROUND 14b (verify finding 5a) — AND WHEN THE FIRST SITTING HAS TO SAY SO.
   The trial is named from the 2nd up, which is right on a row standing alone:
   «IN190» IS the first sitting, and «IN190 · 1st trial» would be noise on the
   199 exams out of 200 that are sat once. In a LIST beside «IN190 · 2nd trial»
   it is the opposite — the unqualified «IN190» reads as the exam itself rather
   than as one of its sittings, so the save dialog could name the re-sit and the
   attempt it displaced with two lines the reader cannot tell apart. `named`
   forces the word; only a caller that can SEE the other trials sets it
   (WA.examsWithTrials), so the noise is never added where there is one sitting. */
WA.examRowLabel = function (e, named) {
  const s = WA.examSeries(e);
  if (s) {
    const n = WA.examSeriesNo(e);
    return s.label + (n === null ? "" : " " + n);
  }
  const id = (e && e.exam) ? String(e.exam) : "";
  const t = WA.examTrial(e);
  return (id || "—") + ((t > 1 || (named && id)) ? " · " + WA.examTrialWord(t) : "");
};
/* WHICH EXAMS ARE SAT MORE THAN ONCE — the set the naming reads as `trials`.
   COUNTED WITHIN EACH LIST, never across them: the dialog hands in the record
   BEFORE and the record AFTER, and one unchanged sitting appearing in both is
   one sitting, not two. A series row is never counted — the Weekly exams are
   numbered and no two of them share a name. */
WA.examsWithTrials = function (...lists) {
  const out = {};
  for (const list of lists) {
    const n = {};
    for (const e of (Array.isArray(list) ? list : [])) {
      if (!e || typeof e !== "object" || WA.examSeries(e)) continue;
      const id = String(e.exam || "").trim();
      if (!id) continue;
      n[id] = (n[id] || 0) + 1;
      if (n[id] > 1) out[id] = true;
    }
  }
  return out;
};
/* the next free number of a series — «next = max + 1», counted over what is
   actually there, so a deleted Weekly 2 does not make the next one a duplicate */
WA.examNextSeriesNo = function (list, seriesId) {
  let max = 0;
  for (const e of (Array.isArray(list) ? list : [])) {
    const s = WA.examSeries(e);
    if (!s || s.id !== seriesId) continue;
    const n = WA.examSeriesNo(e);
    if (n !== null && n > max) max = n;
  }
  return max + 1;
};
/* the trials of one exam already in the record, and the next free number */
WA.examTrialsOf = function (list, examId) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((e, i) => {
    if (WA.examSeries(e)) return;
    if (!e || String(e.exam || "") !== String(examId)) return;
    out.push({ e, i, trial: WA.examTrial(e) });
  });
  return out;
};
WA.examNextTrial = function (list, examId) {
  const taken = {};
  for (const t of WA.examTrialsOf(list, examId)) taken[t.trial] = true;
  for (let n = 1; n <= WA.EXAM_TRIALS; n++) if (!taken[n]) return n;
  return null;                       /* all three sat — the affordance is gone */
};
/* THE OPERATIVE TRIAL of one exam — the round-11 pass-attempt rule, verbatim,
   over exam rows instead of evaluation rows. Returns the STORED INDEX.
   ROUND 15 — "pass" here means the GROUND-EXAM pass mark (WA.EXAM_PASS_MIN =
   80), not the flight's 60. A 2nd trial marked 78 therefore no longer wears
   the slot: it is a mark the exam was not passed on, and the rule's own
   documented fallback applies — no attempt passed, so the LATEST GRADED one
   stands for the slot and every surface says nothing has passed yet. */
WA.examOperativeIx = function (list, idxs) {
  const arr = Array.isArray(list) ? list : [];
  const at = (i) => arr[i] || {};
  const g = (i) => {
    const v = at(i).grade;
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };
  /* the same tiebreak as WA.attemptLater: date first, a dated attempt beats an
     undated one, and equal dates fall back to the LATER TRIAL NUMBER (which is
     what "the later attempt" means when two re-sits share a day) */
  const later = (i, j) => {
    const di = String(at(i).date || "").trim(), dj = String(at(j).date || "").trim();
    if (!di !== !dj) return !!di;
    if (di !== dj) return di > dj;
    const ti = WA.examTrial(at(i)), tj = WA.examTrial(at(j));
    if (ti !== tj) return ti > tj;
    return i > j;
  };
  let pass = -1, any = -1, some = -1;
  for (const i of (idxs || [])) {
    if (some < 0 || later(i, some)) some = i;
    const v = g(i);
    if (v === null) continue;
    if (any < 0 || later(i, any)) any = i;
    if (!WA.gradePassed(v, "exams")) continue;
    if (pass < 0 || later(i, pass)) pass = i;
  }
  return pass >= 0 ? pass : (any >= 0 ? any : some);
};
/* DID THIS EXAM ROW PASS? — the row-level question, at the ground-exam mark.
   Both shapes are ground exams and both are marked the same way: one of the
   eight, or a Weekly exam of the weekly series. */
WA.examPassed = function (e) {
  return !!e && WA.gradePassed(e.grade, "exams");
};
/* IS THERE A MARK AT ALL? — the question that has to be asked BEFORE the
   verdict, and the one three surfaces used to answer with three inline copies
   of the same four-clause test. A row with no grade has NOT failed; it waits. */
WA.examGraded = function (e) {
  const g = e ? e.grade : null;
  return !(g === null || g === undefined || g === "") && isFinite(Number(g));
};
/* ── ROUND 16 — THE BADGE GATE, ONE DEFINITION FOR BOTH SURFACES ───────────
   The student's exam row and the admin's Student-analysis row wear the SAME
   badge, and until this round each decided for itself when to draw it. Two
   rulings of 22/08/2026 move that decision, so it moves once, here.

   (5A-a) THE VERDICT BECOMES VISIBLE ON A SINGLE SITTING. A graded exam that
   did not reach the mark says so in a chip, whether it was sat once or three
   times — before this round a 79 sat once wore its verdict ONLY on hover,
   which is to say: on a phone, nowhere. `WA.examNotPassed` is that chip's
   condition and it is GRADED-AND-BELOW, never merely «has not passed yet»: a
   row still waiting for its result has not failed anything.
   THE COLOUR OF THE ROW DOES NOT MOVE (still st-done). The two axes are kept
   apart, as round 13 ruled: the colour says «is this row finished», the badge
   says «what did it say». A PASS WEARS NOTHING — «passed» on 199 rows out of
   200 is noise, and the absence of the chip IS the pass.

   (5A-b) THE OPERATIVE 1ST TRIAL WEARS ITS WORD. The gate used to be
   `trial > 1 || alt`, which left exactly one row in the app unnamed: the FIRST
   trial, when it beat a later re-sit and kept the slot (85 then 65). Its own
   displaced re-sit was badged «2nd trial» directly beneath it and the holder
   said nothing, so the pair read as one anonymous row plus one attempt. The
   word is now drawn whenever the record holds MORE THAN ONE SITTING of that
   exam — §4o·5's «what counts as beside», read from the same counter that
   already names the trial in the save dialog — and a single sitting stays
   unbadged as to trial, which is what keeps the word off those 199 rows.
   A SERIES ROW NEVER WEARS A TRIAL WORD: the Weekly exams are numbered, not re-sat.

   ROUND 17 (R16 verify item 12) — AND WHAT IT COUNTS ARE SITTINGS, NOT ROWS.
   The counter above was WA.examTrialsOf, which returns every row naming that
   exam — INCLUDING the seeded flow-chart slot, which is not a sitting and is
   not even stored. So a record holding a hand-made `{exam:'X', trial:2}` and
   no trial 1 gave the EMPTY slot row of X two "trials", and the empty row —
   nothing typed into it, nothing recorded against it, grey, owed — wore
   «1st trial». It named an attempt that had never been made.
   The gate now asks the same question the sparse rule asks: is this row a
   REPORT (WA.slotUntouched says no to exactly the untouched flow-chart
   placeholder, and yes to everything else — a written row, a legacy row, an
   admin-entered row, a minted trial or Weekly exam, all of which are stored). TWO
   clauses, because both halves of the sentence have to be true:
     · the ROW ITSELF must be a sitting — an owed placeholder is not the
       «1st trial» of anything, whatever sits beside it;
     · and the RECORD must hold more than one sitting of that exam.
   Everything the ruling put the word there for is untouched: a real 1st trial
   beside a real 2nd still wears it (both are sittings), an alt row and any
   trial > 1 short-circuit above this line and never reach the count. */
WA.examSittingsOf = function (list, examId) {
  return WA.examTrialsOf(list, examId).filter((t) => !WA.slotUntouched("exams", t.e));
};
WA.examTrialShown = function (list, e, alt) {
  if (!e || WA.examSeries(e)) return false;
  if (alt || WA.examTrial(e) > 1) return true;
  if (WA.slotUntouched("exams", e)) return false;
  return WA.examSittingsOf(list, e.exam).length > 1;
};
WA.examNotPassed = function (e) {
  return WA.examGraded(e) && !WA.examPassed(e);
};
/* ROUND 15 — THE EXAMS' OWN PASS-ATTEMPT SENTENCE. WA.PASS_ATTEMPT_TIP is the
   CHECKRIDES' and quotes 60 %; a ground exam is judged at 80, so the two
   surfaces cannot share one sentence any more without one of them lying.
   ROUND 15b (verify item 14): the two marks this sentence ASSERTS are read
   from WA.passMin("exams"); the Greek inside the «…» is the user's ruling
   QUOTED, and a quotation is not derived from anything — it stays as spoken. */
WA.EXAM_PASS_TIP =
  "A re-sat ground exam counts with the attempt it was PASSED on — " + WA.passMin("exams") + " % and above (the ground-exam pass mark, ruled 2026-08-21: «80% για εξετασεις εδαφους, 60% για πτησεις»; FDMS calls the same number exam_pass_pct). The attempts below it stay in the record and stay visible; they never decide the exam. Two passes resolve to the later one, and if no attempt has reached " + WA.passMin("exams") + " % the latest graded one stands for the exam and nothing has passed yet.";

/* ── WHICH OF TWO ATTEMPTS CAME LATER (round 9's twin rule, extracted) ──────
   Date first; a dated attempt beats an undated one; equal dates fall back to
   the position in the stored list. ONE definition — the slot picker and the
   pass-attempt rule below both call it, so they can never disagree about what
   "the latest" means. */
WA.attemptLater = function (a, b) {
  const da = String(a.date || ""), db = String(b.date || "");
  if (da && db && da !== db) return da > db;
  if (da && !db) return true;
  if (!da && db) return false;
  return a.i >= b.i;
};

/* ══════════════════════════════════════════════════════════════════════════
   THE PASS-ATTEMPT RULE (round 11) — THE OPERATIVE ATTEMPT OF A SLOT.
   ──────────────────────────────────────────────────────────────────────────
   COMMAND WORDING (2026-08-19): «Αν ο μαθητής στην κανονική ροή βαθμολογήθηκε
   με αποτυχία ή υστέρηση, τότε θα υπολογίζουμε για βαθμολογία αυτή όπου η
   πτήση χαρακτηρίστηκε ως επιτυχής.»

   One checkride can hold several attempts — a failed C4590 is re-flown, and
   both flights are real and both stay in the record. What every GRADE SURFACE
   must use is the attempt the flight was characterised SUCCESSFUL on: the
   chart point, the class average, the comparison, the summary table, the CSV
   and the printed brief. The failed and the lagged attempts are not deleted
   and not hidden — they are shown, named as attempts and marked with their
   band — they simply never enter a number.

   HOW IT RECONCILES WITH ROUND 9'S TWIN RULE ("the latest attempt stands for
   the slot"): the twin rule is not replaced, it is DEMOTED TO THE TIEBREAK.
   PASS is the filter and it runs first; LATEST decides only between attempts
   that are equally operative. Two passes on one checkride (which the syllabus
   does not foresee, but a re-flown-and-re-graded slot can produce) therefore
   still resolve the round-9 way. And a slot with no pass at all falls back to
   the latest attempt, so a student who has only failed a checkride still shows
   a number instead of an em dash — marked `passed:false`, which is what every
   surface renders as "no successful attempt yet".
     → { row, passed, attempts, others }
   MIRROR: db/schema.sql → wa.eval_operative(). Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
WA.evalOperativeOf = function (rows, id) {
  const mine = (rows || []).filter((r) => r.id === id);
  let pass = null, any = null;
  for (const r of mine) {
    if (r.grade === null) continue;
    if (!any || WA.attemptLater(r, any)) any = r;
    if (!WA.gradePassed(r.grade)) continue;
    if (!pass || WA.attemptLater(r, pass)) pass = r;
  }
  /* no graded attempt at all: the slot is still occupied by whatever row is
     there (a date with no grade yet), so the tables keep showing it */
  let row = pass || any;
  if (!row) for (const r of mine) if (!row || WA.attemptLater(r, row)) row = r;
  return {
    row, passed: !!pass, attempts: mine.length,
    others: mine.filter((r) => r !== row),
  };
};
/* the grade every comparison uses — null when nothing is graded yet */
WA.evalGrade = function (rows, id) {
  const op = WA.evalOperativeOf(rows, id);
  return op.row ? op.row.grade : null;
};
/* the operative ROW itself, for the surfaces that also print date / with whom */
WA.evalOperative = function (rows, id) {
  return WA.evalOperativeOf(rows, id).row;
};
/* THE CHECKRIDES' sentence, and only theirs — a FLIGHT is judged at 60 %.
   The ground exams have their own (WA.EXAM_PASS_TIP, 80 % since round 15). */
WA.PASS_ATTEMPT_TIP =
  "A re-flown checkride counts with the attempt the flight was characterised SUCCESSFUL on — 60 % and above on the printed scale (ΠΔ 151/13: ΣΚ 50-59 % is ΥΣΤΕΡΗΣΗ, Ε 0-49 % is ΑΠΟΤΥΧΙΑ). The failed and lagged attempts stay in the record and stay visible; they never enter a number. Two successful attempts resolve to the later one.";

/* THE EIGHT CHECKRIDES AS FIXED ROWS (round 5) — always all eight, in
   syllabus order, whatever the record holds. `row` is the attempt that
   occupies the slot — since round 11 the OPERATIVE one, i.e. the successful
   attempt (WA.evalOperativeOf) and not merely the latest — `passed` says
   whether it was in fact a pass, `earlier` holds the other attempts of the
   same checkride, and `extras` the imported evaluations nobody has identified
   yet. */
WA.evalSlotRows = function (rec) {
  const rows = WA.evalRows(rec).filter((r) => r.flown || !r.id);
  const slots = WA.EVALUATIONS.map((d) => {
    const op = WA.evalOperativeOf(rows, d.id);
    return { def: d, row: op.row, passed: op.passed,
             attempts: op.attempts, earlier: op.others };
  });
  return { slots, extras: rows.filter((r) => !r.id) };
};
/* the FPC entries as plot rows — an FPC has no syllabus position, so they are
   ordered chronologically and numbered #1, #2 … */
WA.fpcRows = function (rec) {
  const list = (rec && Array.isArray(rec.fpc)) ? rec.fpc : [];
  return list.map((e, i) => ({ i, e }))
    .sort((a, b) => String(a.e.date || "9999").localeCompare(String(b.e.date || "9999")))
    .map((x, k) => {
      const g = Number(x.e.grade);
      return {
        i: x.i, id: "fpc#" + (k + 1), def: null, cat: "fpc", order: k + 1,
        grade: (x.e.grade === null || x.e.grade === undefined || x.e.grade === "" || !isFinite(g)) ? null : g,
        with: x.e.evaluator || "", date: x.e.date || "",
        trigger: x.e.flight_code || "", flown: true,
        result: x.e.result || "", legacy: !!x.e.legacy, entered_by: x.e.entered_by || null,
      };
    });
};

/* ══════════════════════════════════════════════════════════════════════════
   FPC / CEF — one line, everywhere (round 5): the section, the STAGE FLIGHT
   that triggered it, the EVALUATOR who conducted it and the date.
     "FPC (C4590) — DO — 12/08/2026"
   ══════════════════════════════════════════════════════════════════════════ */
WA.checkTitle = function (sec, e) {
  const x = e || {};
  return WA.secLabel(sec) + (x.flight_code ? " (" + x.flight_code + ")" : "");
};
WA.checkLine = function (sec, e) {
  const x = e || {};
  const bits = [WA.checkTitle(sec, x)];
  if (x.evaluator) bits.push(String(x.evaluator));
  bits.push(fmtD(x.date));
  return bits.join(" — ");
};
/* the same line as HTML, with the trigger flight's full name in the tooltip */
WA.checkLineHTML = function (sec, e) {
  const x = e || {};
  const head = x.flight_code
    ? esc(WA.secLabel(sec)) + " (" + WA.sortieCell(null, x.flight_code) + ")"
    : esc(WA.secLabel(sec));
  return head + " &mdash; " + esc(x.evaluator || "—") + " &mdash; " + esc(fmtD(x.date));
};

/* SUPERSEDED IN ROUND 11 — WA.evalLatest is gone, not renamed. It answered
   "the latest graded attempt", which the command replaced with "the attempt
   the flight was characterised successful on" (WA.evalOperativeOf above). The
   name is deliberately not kept as an alias: two functions with two rules is
   exactly how a class average and a printed brief drift apart, and every
   caller was moved. */

/* NOTE (round 8): there is no WA.pendingItems and no `pending` count in
   recStats. The flag is gone from the data model — an unfilled fixed slot
   simply has no date, which every surface already reads as "not flown yet",
   and a result still awaited is a grade not written yet. */

/* entries a v1 record could not fully describe — the student is asked to
   complete them; the admin sees how many are still incomplete. */
WA.legacyItems = function (rec) {
  const r = rec || {};
  const out = [];
  for (const k of WA.COUNTED) {
    WA.filled(k, r[k]).forEach((e, i) => {
      if (e && e.legacy) out.push(WA.secLabel(k) + " #" + (i + 1));
    });
  }
  return out;
};

/* ── THE INSTRUCTOR PICKER'S LIST, CLIENT SIDE (round 9) ────────────────────
   The server sends a JSON array of surnames and nothing else; this is the one
   place that turns it into the list the form draws. It takes STRINGS only —
   an object that ever appeared in that array would be dropped here rather
   than stringified into "[object Object]" beside real names — trims them and
   drops the empties and the duplicates. Whatever the transport, the form sees
   the same shape.
   ROUND 14 — IT NO LONGER SORTS, AND THAT IS THE POINT. The order is the
   SENIORITY order (HAF before ITAF, call sign natural within each), and it is
   decided by wa.instructor_surnames() because it is the only place that can
   decide it: the payload is surnames and nothing else — no country, no call
   sign ever leaves the database for a student — so the client has nothing left
   to sort BY. Re-sorting alphabetically here, which is what round 9 did, threw
   the squadron's own order away one line after the server had applied it.
   MIRROR: db/schema.sql → wa.instructor_surnames(). */
WA.insNames = function (raw) {
  const seen = Object.create(null), out = [];
  for (const x of (Array.isArray(raw) ? raw : [])) {
    if (typeof x !== "string") continue;
    const n = x.trim();
    if (!n || seen[n]) continue;
    seen[n] = true;
    out.push(n);
  }
  return out;
};

/* THE STANDALONE QUESTION — the round-8 path, kept as the FALLBACK for an
   instance whose schema does not yet fold the list into the form payload
   (get_student_form.instructors). One RPC per session, cached. The RPC
   exposes surnames and nothing else (db/schema.sql). */
WA.instructorNames = async function () {
  if (WA._insNames) return WA._insNames;
  try {
    const r = await rpc("list_instructor_names", { p_token: WA.token });
    WA._insNames = WA.insNames(r);
  } catch (e) {
    WA._insNames = [];      /* free text still works — the picker is a comfort */
  }
  return WA._insNames;
};

WA.personName = function (p, withRank) {
  const bits = [];
  if (withRank && p.rank) bits.push(p.rank);
  bits.push(p.last_name || "");
  if (p.first_name) bits.push(p.first_name);
  return bits.join(" ").trim();
};

/* ROUND 9 — the shared roster's three visible facts about a person, as one
   helper so the People table, the drill-down and any later surface cannot
   drift apart: the CALL SIGN (how the squadron actually says the name), the
   TP badge, and the marker that says this row is owned by the global roster
   (its object id is immutable here). Empty for anybody the roster has never
   mentioned, which is every demo person and every hand-made one. */
WA.callSign = function (p) {
  return p && p.call_sign ? String(p.call_sign) : "";
};
WA.rosterTags = function (p) {
  if (!p) return "";
  let out = "";
  if (p.call_sign) out += ` <span class="badge" title="call sign">${esc(p.call_sign)}</span>`;
  if (p.test_pilot) out += ` <span class="badge" title="test pilot">TP</span>`;
  if (p.external_oid) {
    out += ` <span class="badge" title="from the shared roster — object id ${esc(p.external_oid)}, immutable">roster</span>`;
  }
  return out;
};
/* "Maj Alfa (TEST-01)" — the drill-down identity line */
WA.personCall = function (p, withRank) {
  const n = WA.personName(p || {}, withRank);
  const cs = WA.callSign(p);
  return cs ? n + " (" + cs + ")" : n;
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 14 — SENIORITY ORDER, AND IT IS ONE COMPARATOR.
   ──────────────────────────────────────────────────────────────────────────
   «τους εκπαιδευτες με σειρα αρχαιοτητας. HAF πρωτα, ITAF μετα.»

   Every surface that LISTS instructors — the People table, the picker behind
   every "who" box, the Overview submissions strip, the assessment drill-down,
   the by-level names — used to sort them alphabetically by surname, which is
   an order the squadron does not use for anything. The squadron's order is
   SENIORITY, and it has two levels:

     1. THE AIR FORCE.  HAF first, ITAF second, any other named air force
        after them (alphabetically, so a third one lands somewhere definite
        rather than wherever the roster happened to insert it), and people the
        roster gave no country last.
     2. THE CALL SIGN, in NATURAL order — a 2 before a 14 before a 31, never
        the string order that puts the 14 before the 2. The call sign IS the
        squadron's own hierarchy, which is why it and not the rank field
        decides: rank is a grade, the call sign is the position. This is the
        FDMS Currency precedent, unchanged.
        WHICH CALL SIGN IS FIRST IS NOT WRITTEN HERE (round 19, the FDMS
        round-18 privacy lesson applied to this repository): the order falls
        out of the `call_sign` values the roster holds, so no literal in this
        file names a real call sign and no comment says who holds one.
     3. Anybody without a call sign sorts LAST WITHIN THEIR OWN AIR FORCE, by
        surname — they are not un-ranked, they are un-numbered.

   ONE comparator, used by every list on this side; MIRROR: db/schema.sql →
   wa.seniority_key(), which orders the same lists on the server so that a
   payload the client cannot re-sort (the picker is surnames only — no country
   and no call sign ever leave the database for a student) still arrives in
   this order. Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
/* ROUND 19 — THE EXAMPLE IS INVENTED, AND IT HAS TO BE. The privacy grep of
   this round found the illustration below quoting a call sign the squadron's
   own roster carries — a real one, in a public repository, exactly the leak the
   FDMS round-18 sweep removed from its own comments. The example now uses
   numbers nobody on the roster holds; it demonstrates the rule just as well,
   because the rule is about DIGITS and not about who flies under them. */
WA.SENIORITY_TIP =
  "Seniority order — HAF first, then ITAF, then any other air force; within each, by call sign in natural order (a 2 before an 11, never the string order that reverses them), and whoever has no call sign last by surname.";
/* digits padded so a numeric run compares as a NUMBER: "X-11" → "X-00000011" */
WA.natKey = function (s) {
  return String(s === null || s === undefined ? "" : s).toUpperCase()
    .replace(/\d+/g, (d) => d.padStart(8, "0"));
};
WA.SENIORITY_FORCES = ["HAF", "ITAF"];
WA.seniorityKey = function (p) {
  const o = p || {};
  const c = String(o.country || "").trim().toUpperCase();
  const i = WA.SENIORITY_FORCES.indexOf(c);
  /* 0,1 = the two named air forces · 2 = any other, ordered by its own name
     · 3 = the roster gave none */
  const band = i >= 0 ? String(i) : (c ? "2" : "3");
  const cs = String(o.call_sign || "").trim();
  return [band, i >= 0 ? "" : c, cs ? "0" : "1", WA.natKey(cs),
          String(o.last_name || "").toUpperCase(),
          String(o.first_name || "").toUpperCase()].join("|");
};
/* the comparator itself — plain string comparison on the key, never
   localeCompare: the key is already padded and upper-cased, and a locale that
   sorts "|" differently would silently reorder the bands */
WA.bySeniority = function (a, b) {
  const ka = WA.seniorityKey(a), kb = WA.seniorityKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};
/* a copy, sorted — never in place: the caller's array is usually A.data's own */
WA.sortBySeniority = function (list) {
  return (Array.isArray(list) ? list.slice() : []).sort(WA.bySeniority);
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 14 — THE LEFT NAVIGATION PANEL.
   ──────────────────────────────────────────────────────────────────────────
   «θα ηθελα στο wings ahead να προσθεσουμε στα αριστερα ενα navigation panel»

   The student form is FOURTEEN SECTIONS and, since round 13 pre-seeded the
   syllabus, something over 180 rows long. Everything in it is reachable and
   nothing in it is findable: a student who wants to add an NFS scrolls past
   the whole flight log to get there, and the admin entering data on somebody's
   behalf does it twice. The panel is the form's table of contents — one row
   per section, click to go there, and each row carries THE ONE FACT that
   section is about, so the panel answers "what do I still owe?" without being
   opened at all.

   IT IS ONE COMPONENT AND IT IS NOT THE FORM'S. The student form, the admin's
   Student-analysis tab and (round 17) the instructor's assessment form all
   mount it; none of them knows how it works, and all of them hand it the same
   shape:
     items = [{ id, label, tip, badge, bars:[{state,n}], tone, rowTone }]
   The panel renders, tracks the scroll, and re-reads the items on demand
   (refresh) — it never reads a record, because it must not have an opinion
   about what a section is.

   ROUND 17 — `rowTone`, AND IT IS THE ONLY THING THIS COMPONENT GREW.
   «Πράσινη χροιά όποιο έχει βάλει επιλογή, μουσταρδί ότι δεν έχει επιλέξει
    κάτι ακόμη» (2026-08-22). The instructor's rail is one row per STUDENT, and
   the fact it carries is binary — an assessment is chosen, or it is not — so a
   badge alone would say it in the smallest type on the row. `rowTone` is a
   state id from WA.ROW_STATES painted as a WASH ACROSS THE WHOLE ROW, in the
   very tokens the four-state colour contract already owns (--st-done green,
   --st-extra mustard): the caller names a state, never a colour, and the rail
   can never invent a fifth. It is opt-in — the two round-14 rails pass nothing
   and are pixel-for-pixel what they were — and `is-here` still wins over it,
   because where the reader IS outranks what the row says.

   STICKY, AND UNDER 900 px IT IS THE SAME LIST IN A DIFFERENT SHAPE. Above the
   break it is a rail sticking below the top bar; below it, the SAME <ul> is a
   one-line horizontally-scrolling strip of pills, and the burger opens it into
   a wrapped grid of all of them. One list, two shapes: a phone gets the pills
   without a second copy of the markup that could drift from the first.
   ══════════════════════════════════════════════════════════════════════════ */
WA.NAV_BREAK = 900;
/* how far a click may animate before it simply jumps (see go(), below) */
WA.NAV_SMOOTH_MAX = 2400;
/* the sticky top bar's measured height, published as a token so the CSS can
   place the rail under it — the bar wraps to two rows on a 375 px phone and a
   hard-coded offset would sit on top of it (the round-9 placeFloat precedent) */
WA.measureTopbar = function () {
  const t = document.querySelector(".topbar");
  const h = t ? Math.round(t.getBoundingClientRect().height) : 56;
  document.documentElement.style.setProperty("--topbar-h", h + "px");
  return h;
};
WA.navItemHTML = function (it) {
  const bars = (it.bars || []).filter((b) => b.n > 0);
  return `
    <li class="sn-li">
      <button type="button" class="sn-row${it.rowTone ? " tone-" + esc(it.rowTone) : ""}"
              data-navto="${esc(it.id)}"
              title="${esc(it.tip || it.label)}">
        <span class="sn-lbl">${esc(it.label)}</span>
        ${bars.length
          ? `<span class="sn-bars" aria-hidden="true">${bars.map((b) =>
              `<i class="st-${esc(b.state)}" style="flex:${b.n}"
                  title="${esc(b.n + " " + WA.rowStateDef(b.state).label)}"></i>`).join("")}</span>`
          : ""}
        <span class="sn-st${it.tone ? " is-" + esc(it.tone) : ""}">${esc(it.badge || "")}</span>
      </button>
    </li>`;
};
WA.navHTML = function (id, items, opts) {
  const o = opts || {};
  return `
    <nav class="secnav" id="${esc(id)}" aria-label="${esc(o.aria || "Sections")}">
      <div class="sn-head">
        <button type="button" class="sn-burger" data-navburger
                aria-expanded="false" aria-controls="${esc(id)}-list">
          <span class="sn-ic" aria-hidden="true">&#9776;</span>
          <span class="sn-t">${esc(o.title || "Sections")}</span>
        </button>
        <span class="sn-sum" data-navsum></span>
      </div>
      <ul class="sn-list" id="${esc(id)}-list">${(items || []).map(WA.navItemHTML).join("")}</ul>
    </nav>`;
};
/* mount: wire the clicks, the burger and the scroll spy. Returns a controller
   the caller keeps and DESTROYS on the way out — a scroll handler that outlived
   its DOM is exactly the leak teardownView() exists to prevent. */
WA.navMount = function (navEl, opts) {
  const o = opts || {};
  const anchor = o.anchor || ((secId) => document.getElementById("sec-" + secId));
  const list = navEl.querySelector(".sn-list");
  const burger = navEl.querySelector("[data-navburger]");
  let raf = 0, dead = false;

  /* WHAT HAS TO BE CLEARED ABOVE THE TARGET. Above the break that is the top
     bar alone — the rail sits BESIDE the content, not over it. Below the break
     the panel is a second sticky strip under the bar, so its height counts too,
     or every jump would land the section's heading behind the very pills that
     were used to ask for it. Measured, never assumed: the bar wraps to two rows
     on a 375 px phone and the strip's height follows the palette's font size. */
  function offset() {
    const mini = window.innerWidth <= WA.NAV_BREAK
      ? Math.round(navEl.getBoundingClientRect().height) : 0;
    return WA.measureTopbar() + mini + 14;
  }
  function go(secId) {
    const el = anchor(secId);
    if (!el) return;
    /* ── ROUND 17b — COLLAPSE FIRST, THEN MEASURE. THE ORDER IS THE FIX. ────
       On a phone the panel the reader just tapped is a strip they OPENED: the
       burger turns the one-line pill strip into a wrapped grid, and the grid is
       part of the flow (`position:sticky`), so everything below it — including
       the card being asked for — sits that much further down the document.
       This function used to measure `el.getBoundingClientRect()` and `offset()`
       against the OPEN panel and close it AFTERWARDS. On paper the two errors
       cancel — the offset is too big by the panel's extra height, and so is the
       anchor's document position — but the browser's SCROLL ANCHORING then
       compensates the collapse and pulls the page back by that same amount, so
       what is left on screen is the error. Measured on the running app, every
       pill landed its card the collapse-delta too low: 173.8 px instead of 14
       on the 25-student instructor rail at 900 (delta 160) and 358.3 at 375
       (delta 344); 37.5 and 183.5 on the 13-section student rail (deltas 24 and
       170); 150.0 on the admin's 10-card analysis rail at 375 (delta 136).
       Closing FIRST costs nothing — `getBoundingClientRect()` flushes the
       pending layout on the very next line — and it is the same close that
       always had to happen, moved to where its effect is measurable.
       ONE COMPONENT, THREE RAILS: the student form, the admin's analysis cards
       and the instructor's students all mount this function, so the fix lands
       on all three without any of them knowing it happened. */
    if (window.innerWidth <= WA.NAV_BREAK) setOpen(false);
    const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset());
    const from = window.scrollY;
    /* ── HOW FAR, AND WHETHER TO ANIMATE IT ────────────────────────────────
       SMOOTH ONLY FOR A SHORT HOP. This form is twelve thousand pixels tall;
       animating a jump from the top to Ground exams is not "smooth", it is a
       four-second wait, and a table of contents exists to TAKE you there. Under
       WA.NAV_SMOOTH_MAX the animation says «you moved down the page», which is
       worth having; beyond it the jump is instant. `prefers-reduced-motion`
       turns the animation off at any distance — an eleven-thousand-pixel slide
       is exactly the movement that setting exists to switch off. */
    const still = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const smooth = !still && Math.abs(y - from) <= WA.NAV_SMOOTH_MAX;
    window.scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" });
    /* AND THE LANDING IS CONFIRMED. `behavior:"smooth"` is advisory: some
       engines and some emulation modes ignore it outright and the page simply
       never moves, which would make the whole panel look broken while every
       other part of it worked. So if nothing has moved AT ALL a moment later
       and we are not already there, the jump is made instantly. A real smooth
       scroll has travelled by then, so this never interrupts one. */
    if (smooth) {
      window.setTimeout(() => {
        if (Math.abs(window.scrollY - y) > 2 && Math.abs(window.scrollY - from) < 2) {
          window.scrollTo(0, y);
        }
      }, 250);
    }
    /* (the close that used to live here is now the FIRST thing this function
       does — see the round-17b note above: it has to happen BEFORE the two
       measurements, not after the scroll they produced.) */
    mark(secId);
  }
  function mark(secId) {
    for (const b of list.querySelectorAll(".sn-row")) {
      const on = b.dataset.navto === secId;
      b.classList.toggle("is-here", on);
      if (on && window.innerWidth <= WA.NAV_BREAK && !navEl.classList.contains("is-open")) {
        /* keep the current pill visible in the strip without moving the page */
        const r = b.getBoundingClientRect(), lr = list.getBoundingClientRect();
        if (r.left < lr.left || r.right > lr.right) {
          list.scrollLeft += (r.left - lr.left) - (lr.width - r.width) / 2;
        }
      }
    }
  }
  /* WHICH SECTION AM I IN — the last one whose top has passed the top bar. A
     plain measurement and not an IntersectionObserver, because the sections are
     re-rendered under it constantly (every keystroke redraws a row, a save
     redraws all fourteen) and an observer would have to be re-registered each
     time against elements that no longer exist. */
  function spy() {
    raf = 0;
    if (dead) return;
    const line = offset() + 8;
    let cur = null;
    for (const it of (o.items || [])) {
      const el = anchor(it.id);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= line) cur = it.id;
    }
    if (!cur && (o.items || []).length) cur = o.items[0].id;
    if (cur) mark(cur);
  }
  function onScroll() { if (!raf) raf = window.requestAnimationFrame(spy); }
  function setOpen(on) {
    navEl.classList.toggle("is-open", !!on);
    if (burger) burger.setAttribute("aria-expanded", on ? "true" : "false");
  }
  navEl.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-navburger]")) {
      setOpen(!navEl.classList.contains("is-open"));
      return;
    }
    const b = ev.target.closest("[data-navto]");
    if (b) go(b.dataset.navto);
  });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  WA.measureTopbar();
  spy();

  return {
    /* the states are live: every count the form recomputes lands here too */
    refresh(items) {
      if (dead) return;
      o.items = items || o.items;
      const here = list.querySelector(".sn-row.is-here");
      const keep = here ? here.dataset.navto : null;
      list.innerHTML = (o.items || []).map(WA.navItemHTML).join("");
      if (keep) mark(keep);
      const sum = navEl.querySelector("[data-navsum]");
      if (sum) sum.textContent = o.summary ? o.summary() : "";
    },
    summary(text) {
      const sum = navEl.querySelector("[data-navsum]");
      if (sum) sum.textContent = text || "";
    },
    destroy() {
      dead = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    },
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 14 — WHAT AM I ABOUT TO SAVE, AND WHO AM I SAVING IT AS.
   ──────────────────────────────────────────────────────────────────────────
   «οταν πατησει το γενικο save ή το ειδικο να του βγαζουμε ενα μηνυμα
    επιβεβαιωσης ποιος εγραψε (απο το link, o Maj ⟨ΟΝΟΜΑ⟩) και σε σχεση με
    τι … Επισης θα μπορει να απορριψει. Αν θελει να απορριψει θα τον ρωταμε αν
    θελει σιγουρα να απορριψει τις 1,2,3 αλλαγες»
   (the surname the directive names is redacted here and everywhere else in the
   repository — no real name enters a tracked file, ever.)

   THE IDENTITY COMES FROM THE LINK, WHICH IS THE WHOLE POINT. Whoever holds a
   personal link IS that person to this application; the one thing it can and
   must say back before a write is WHOSE NAME goes on it. The header is the
   token's own record (WA.me) — rank + surname, the way the squadron writes it
   — and where the admin is entering on somebody's behalf it names both: who is
   writing, and whose record is being written. (Round 17: that name is the
   ADMIN'S OWN, read from his person row, and the chip beside it says ADMIN —
   the admin is the flight commander and the developer, never the squadron CO.)

   AND WHAT — AS A NUMBERED LIST OF SENTENCES, not a payload. The list is
   built by comparing the form against the state it was last saved in, and
   every item is in the terms the user can see on screen: the section, the row
   named the round-12b way (its code / date, never a stored index), and what
   changed, old → new. One builder for all three forms — the student's, the
   admin's on-behalf twin and the instructor's general save — because three
   builders is three chances for the message and the write to disagree.
   ══════════════════════════════════════════════════════════════════════════ */
/* "Maj ⟨SURNAME⟩" — rank + surname, and nothing else: the confirmation names
   the person the squadron names, not the roster's full record */
WA.personRankName = function (p) {
  const o = p || {};
  return [o.rank || "", o.last_name || ""].filter(Boolean).join(" ").trim() ||
         (o.first_name || "this link's holder");
};
/* WHICH DATE A ROW IS NAMED BY — the one WA.rowLabel prints, and the one an
   «added» line must therefore NOT repeat in its parenthetical (round 14b,
   verify finding 5b). One function, both readers, so they cannot drift. */
WA.titleDateField = function (e) {
  const x = e || {};
  if (x.date) return "date";
  if (x.entrance_date) return "entrance_date";
  if (x.end_date) return "end_date";
  return null;
};
/* WHAT A ROW IS CALLED (round 12b's naming, extracted so the refusals, the
   change list and any later surface cannot drift): what the user can SEE.
   Returns "" for a row that shows nothing at all — the caller decides what to
   say instead, because a dialog says «a new entry» and a save refusal says «#4».
     opts.trials — {examId:true} for the exams sat more than once, so a first
                   sitting standing beside its re-sit is named as one
                   (WA.examsWithTrials; see WA.examRowLabel). */
WA.rowLabel = function (sec, e, opts) {
  const x = e || {};
  const o = opts || {};
  const bits = [];
  /* ROUND 19 — A CURRENCY ROW IS NAMED BY WHAT MAKES IT UNIQUE, and by nothing
     else: the kind, the programme, the day and — where there was more than one
     that day — which sortie of it. That is exactly WA.curIdent in words, so a
     line the dialog prints can never stand for two different rows. It falls
     through to the shared `seq` suffix at the bottom of this function, which is
     where every other section's «#2» already comes from. */
  if (sec === "ins_currency") {
    /* only what the row ACTUALLY says. An unfilled kind renders as «—» through
       the label helpers, and a title reading «— · — · 23/08/2026» is three
       dashes where a half-finished row should simply be called by its date. */
    if (x.kind) bits.push(WA.currencyKindLabel(x.kind));
    /* ROUND 20 — THE Σ PRINTED NAME, by the ruling: «να έχουμε ποια S είναι».
       Not the programme beside it — the programme is DERIVED from the category
       now, so printing both would be printing one fact twice, and not the bare
       code either, because half the squadron reads these off paper by name.
       ROUND 21 — a with-SP row is named by WHAT WAS FLOWN instead: the
       student's sortie, a marker's label, or the off-catalogue text as typed
       (the WA.curIdent coalesce, in words). */
    if (x.s_category) bits.push(WA.sCatText(x.s_category));
    else if (x.sortie) bits.push(WA.curSortieText(x.sortie));
    if (x.date) bits.push(fmtD(x.date));
    const nm0 = bits.filter(Boolean).join(" · ");
    const sq0 = WA.curSeq(x);
    return nm0 ? nm0 + (sq0 > 1 ? " #" + sq0 : "") : "";
  }
  if (sec === "exams") {
    if (WA.examSeries(x) || x.exam) {
      bits.push(WA.examRowLabel(x, !!((o.trials || {})[String(x.exam || "").trim()])));
    }
  } else if (x.sortie) bits.push(String(x.sortie).toUpperCase());
  else if (x.exam) bits.push(String(x.exam));
  else if (x.group) bits.push(String(x.group) + (x.course ? " · " + x.course : ""));
  else if (x.slot) bits.push(WA.soloSlotLabel ? WA.soloSlotLabel(x.slot) : String(x.slot));
  else if (x.evaluation) bits.push(String(x.evaluation));
  else if (x.flight_code) bits.push(String(x.flight_code).toUpperCase());
  if (x.track) bits.push(WA.itemCatLabel ? WA.itemCatLabel(x.track) : x.track);
  const df = WA.titleDateField(x);
  if (df) bits.push(fmtD(x[df]));
  const nm = bits.filter(Boolean).join(" · ");
  if (!nm) return "";
  /* ROUND 14b (verify finding 1) — AND WHICH FLIGHT OF THE DAY IT IS. WA.rowIdent
     has told a same-day re-fly apart by its `seq` since round 13; the NAME never
     did, so an original and its re-fly printed the IDENTICAL line in the save
     dialog — and «— removed» on the re-fly read exactly like the row that
     survived, which is the one line in that dialog nobody can afford to misread.
     `#2` is the mark the log table already draws on the row, so the name wears
     the squadron's own. */
  const seq = Math.round(Number(x.seq) || 1);
  return nm + (seq > 1 ? " #" + seq : "");
};
WA.rowTitle = function (sec, e, i, opts) {
  return WA.rowLabel(sec, e, opts) ||
         (i === undefined || i === null ? "a new entry" : "#" + (i + 1));
};
/* THE IDENTITY TWO VERSIONS OF ONE ROW SHARE. Without it a removed row makes
   every row below it read as changed, which would turn one deletion into
   eighty edits in the dialog. Where a row has a syllabus identity that IS the
   identity; where it has none, its date and its one distinguishing string are
   as close as the data comes, and a collision only ever costs a slightly
   differently-worded true sentence. */
WA.rowIdent = function (sec, e) {
  const x = e || {};
  const s = (v) => String(v === null || v === undefined ? "" : v).trim().toUpperCase();
  /* ROUND 19 — one definition, and it is the SERVER's: the uniqueness the
     validator enforces and the identity the change list pairs rows by are the
     same four facts, so a row the dialog calls «changed» is a row the server
     will accept as an update rather than refuse as a duplicate. */
  if (sec === "ins_currency") return WA.curIdent(x);
  if (sec === "flights" || sec === "fs") {
    return [s(x.track), s(x.sortie), Math.round(Number(x.seq) || 1), s(x.kind)].join("|");
  }
  if (sec === "lessons") return [s(x.group), s(x.course)].join("|");
  if (sec === "exams") {
    const ser = WA.examSeries(x);
    return ser ? "S|" + ser.id + "|" + (WA.examSeriesNo(x) || "?")
               : "X|" + s(x.exam) + "|" + WA.examTrial(x);
  }
  if (sec === "solo_flights") return s(x.slot) || "SOLO|" + s(x.date);
  if (sec === "evaluations") return s(x.evaluation) + "|" + s(x.date);
  if (sec === "sms") return s(x.entrance_date) + "|" + s(x.reason);
  return [s(x.date), s(x.flight_code), s(x.reason), s(x.evaluator), s(x.category)].join("|");
};
/* a value, in the words the form shows */
WA.fieldText = function (sec, field, v) {
  if (v === null || v === undefined || v === "") return "—";
  /* ROUND 19 — THE SECTION DECIDES THE VOCABULARY, and it is asked FIRST.
     `kind` and `category` are already spoken for below — by the flight log's
     kind and the gradesheet's track — and a currency row means neither. Two
     sections may share a key name and mean different things; what they must
     never do is let one section's word be printed over the other's fact. */
  if (sec === "ins_currency") {
    if (field === "kind") return WA.currencyKindLabel(v);
    if (field === "s_category") return WA.sCatText(v);
    if (field === "sortie") return WA.curSortieText(v);
  }
  if (field === "date" || field === "end_date" || field === "entrance_date" || field === "exit_date") {
    return fmtD(v);
  }
  if (field === "grade") return v + " %";
  if (field === "duration") return v + " h";
  if (field === "ng") return v ? "non-graded (NG)" : "graded";
  if (field === "flew_with") return v ? "yes" : "no";
  if (field === "level") return WA.levelLabel(v);
  if (field === "trial") return WA.examTrialWord(Math.round(Number(v)) || 1);
  if (field === "series") {
    const d = WA.examSeriesDef(String(v));
    return d ? d.label : String(v);
  }
  if (field === "items") return (Array.isArray(v) ? v : []).join(", ") || "—";
  if (field === "reason") {
    const r = (sec === "sms" ? WA.smsReason(v) : WA.nfsReason(v));
    return r ? (r.label || r.short || String(v)) : String(v);
  }
  if (field === "kind") {
    const k = WA.flightKind(v);
    return k ? k.label : String(v);
  }
  if (field === "mission") {
    const m = WA.mission(v);
    return m ? m.label : String(v);
  }
  if (field === "track") return WA.itemCatLabel ? WA.itemCatLabel(v) : String(v);
  if (field === "e_items") {
    const ids = Array.isArray(v) ? v : [];
    return ids.length ? ids.map(WA.eItemCode).join(" · ") : "—";
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
};
WA.FIELD_WORDS = {
  date: "date", end_date: "end date", entrance_date: "entrance date",
  exit_date: "exit date", grade: "grade", instructor: "instructor",
  evaluator: "evaluator", with: "evaluator", duration: "duration", ng: "grading",
  mission: "mission", kind: "kind", track: "track", sortie: "flight",
  seq: "flight of the day", note: "note", result: "result", items: "items",
  category: "track", flight_code: "flight", reason: "reason", group: "group",
  course: "course", exam: "exam", trial: "trial", series: "series",
  series_no: "number", slot: "slot", evaluation: "checkride",
  level: "assessment", flew_with: "flown with this student", comment: "comment",
  /* ROUND 19 — the word the FDMS currency card uses for the EVENTS table's
     rows, so a change list and the register it feeds say the same thing */
  e_items: "E-items",
  /* ROUND 20 — «category» alone would read as the gradesheet's track on a
     surface that takes both sections; «Σ category» is what Πίνακας 9 calls it */
  s_category: "Σ category",
};
WA.fieldWord = function (f) { return WA.FIELD_WORDS[f] || f; };
/* THE FIELDS THAT ARE THE ROW'S NAME. WA.rowTitle already prints them, so an
   «added» line that listed them again would read «IN190 · 2nd trial — added
   (exam IN190, trial 2nd trial)». They are still compared: changing one of them
   changes WA.rowIdent, so it surfaces as a removal and an addition, which is
   the honest description of moving a row from one identity to another. */
WA.IDENT_FIELDS = {
  flights: ["track", "sortie", "seq", "kind"],
  fs: ["track", "sortie", "seq", "kind"],
  lessons: ["group", "course"],
  exams: ["exam", "trial", "series", "series_no"],
  solo_flights: ["slot"],
  evaluations: ["evaluation"],
  /* ROUND 19 — all the facts of WA.curIdent. They ARE the row's name, so the
     «added» line does not repeat them; change one and the row surfaces as a
     removal plus an addition, which is the honest description of a sortie
     re-filed under a different day, kind or identity. ROUND 21 adds `sortie` —
     the with-SP half of the identity's coalesce. */
  ins_currency: ["date", "kind", "s_category", "sortie", "seq"],
};
/* the fields a change list ever mentions — the stored keys of the section,
   minus the two the user never typed and cannot act on.
   ROUND 19 — TWO REGISTRIES, ASKED IN ORDER. The student sections are the
   mirror of wa.entry_keys and the instructor's of wa.ins_entry_keys; each
   surface keeps pointing at its own server function, and this is the one place
   a caller that takes either kind of section has to know about both. */
WA.diffFields = function (sec) {
  const keys = WA.ENTRY_KEYS[sec] || WA.INS_ENTRY_KEYS[sec] || [];
  return keys.filter((k) => k !== "legacy" && k !== "entered_by");
};
WA.sameValue = function (a, b) {
  const n = (v) => (v === null || v === undefined || v === "") ? "" : v;
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
  }
  if (typeof a === "boolean" || typeof b === "boolean") return !!a === !!b;
  if (typeof a === "number" || typeof b === "number") {
    if (n(a) === "" || n(b) === "") return n(a) === n(b);
    return Number(a) === Number(b);
  }
  return String(n(a)) === String(n(b));
};
/* THE CHANGE LIST OF ONE RECORD — the student form and its admin twin.
     before / after : two records in the migrated shape
     → ["Ground exams · IN190 · 2nd trial · 12/08/2026 — added (grade 78 %)", …] */
WA.recordChanges = function (before, after, sections) {
  const A = before || {}, B = after || {}, out = [];
  const secs = sections || WA.COUNTED;
  for (const sec of secs) {
    const la = (Array.isArray(A[sec]) ? A[sec] : []).filter((e) => !WA.slotOwed(sec, e));
    const lb = (Array.isArray(B[sec]) ? B[sec] : []).filter((e) => !WA.slotOwed(sec, e));
    const bag = {};
    la.forEach((e, i) => {
      const k = WA.rowIdent(sec, e);
      (bag[k] = bag[k] || []).push({ e, i });
    });
    const label = WA.secLabel(sec);
    const used = {};
    /* ROUND 14b (verify finding 5a) — the naming context of THIS section: the
       exams this record holds more than one sitting of, in either version, so
       the first trial is named beside its re-sit and left alone when it stands
       on its own. Computed once per section, not per line. */
    const nm = (sec === "exams") ? { trials: WA.examsWithTrials(la, lb) } : null;
    for (const e of lb) {
      const k = WA.rowIdent(sec, e);
      const q = bag[k] || [];
      const prev = q.length ? q.shift() : null;
      if (prev) { used[k] = true; }
      if (!prev) {
        /* ADDED — and it says what it was added WITH, or the row would be a
           name with no content in a list that exists to show content.
           ROUND 14b (verify finding 5b) — MINUS THE DATE THE TITLE ALREADY SAID.
           «NFS · 21/08/2026 — added (date 21/08/2026, reason …)» printed one fact
           twice in eleven words; the parenthetical is what the row was added WITH,
           and the date is what it is CALLED. The other date of a two-date row is
           still listed: an end date the title did not print is news. */
        const ident = WA.IDENT_FIELDS[sec] || [];
        const df = WA.titleDateField(e);
        const said = WA.diffFields(sec)
          .filter((f) => ident.indexOf(f) < 0 && f !== df && !WA.sameValue(undefined, e[f]))
          .map((f) => WA.fieldWord(f) + " " + WA.fieldText(sec, f, e[f]));
        out.push(label + " · " + WA.rowTitle(sec, e, null, nm) + " — added" +
                 (said.length ? " (" + said.join(", ") + ")" : ""));
        continue;
      }
      const ch = [];
      for (const f of WA.diffFields(sec)) {
        if (WA.sameValue(prev.e[f], e[f])) continue;
        ch.push(WA.fieldWord(f) + " " + WA.fieldText(sec, f, prev.e[f]) +
                " → " + WA.fieldText(sec, f, e[f]));
      }
      if (ch.length) out.push(label + " · " + WA.rowTitle(sec, e, null, nm) + " — " + ch.join(", "));
    }
    for (const k of Object.keys(bag)) {
      for (const left of bag[k]) {
        out.push(label + " · " + WA.rowTitle(sec, left.e, left.i, nm) + " — removed");
      }
    }
  }
  return out;
};
/* THE CHANGE LIST OF A SET OF ASSESSMENTS — the instructor's general save.
     before / after : { studentId: {level, flew_with, comment} }
     nameOf(id)     : the student's name, because an id is not a change list */
WA.proposalChanges = function (before, after, nameOf) {
  const A = before || {}, B = after || {}, out = [];
  for (const id of Object.keys(B)) {
    const a = A[id] || {}, b = B[id] || {};
    const ch = [];
    for (const f of ["level", "flew_with", "comment"]) {
      if (WA.sameValue(a[f], b[f])) continue;
      ch.push(WA.fieldWord(f) + " " + WA.fieldText(null, f, a[f]) +
              " → " + WA.fieldText(null, f, b[f]));
    }
    if (ch.length) out.push((nameOf ? nameOf(id) : id) + " — " + ch.join(", "));
  }
  return out;
};

/* THE DIALOG. One promise, three answers — "save" · "discard" · "keep" — and
   the second question is asked INSIDE it, so a discard can still be backed out
   of without the first list having to be rebuilt. */
WA.confirmSave = function (opts) {
  const o = opts || {};
  const list = (o.changes || []).slice();
  const n = list.length;
  const range = n === 1 ? "1" : "1-" + n;
  const items = (cls) => `<ol class="cfm-list${cls ? " " + cls : ""}">${
    list.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`;
  return new Promise((resolve) => {
    const veil = document.createElement("div");
    veil.className = "veil";
    veil.id = "wa-confirm";
    const first = () => `
      <div class="modal cfm" role="dialog" aria-modal="true" aria-labelledby="wa-cfm-h">
        <h3 id="wa-cfm-h">${esc(o.title || ("Save " + n + " change" + (n === 1 ? "" : "s") + "?"))}</h3>
        <p class="cfm-who">Signed by <b>${esc(o.who || "")}</b>${
          o.onBehalf ? ` <span class="cotag" title="${esc(WA.CO_TIP || "")}">${esc(WA.ADMIN_TAG)}</span>
            <span class="k">on behalf of <b>${esc(o.onBehalf)}</b></span>` : ""}</p>
        <p class="hint">${esc(o.what || "")}</p>
        <p class="cfm-n">${esc(n + (n === 1 ? " change" : " changes"))}</p>
        ${items()}
        <div class="mfoot">
          <button type="button" class="btn" data-cfm="keep">Keep editing</button>
          <button type="button" class="btn btn-danger" data-cfm="ask">Discard changes</button>
          <button type="button" class="btn btn-primary" data-cfm="save">Confirm &amp; save</button>
        </div>
      </div>`;
    const second = () => `
      <div class="modal cfm" role="alertdialog" aria-modal="true" aria-labelledby="wa-cfm-h2">
        <h3 id="wa-cfm-h2">Are you sure you want to discard change${n === 1 ? "" : "s"} ${esc(range)}?</h3>
        <p class="hint">They will be undone and the form will go back to the way it was
          ${esc(o.savedWord || "last saved")}. This cannot be undone.</p>
        ${items("is-warn")}
        <div class="mfoot">
          <button type="button" class="btn" data-cfm="back">No &mdash; go back</button>
          <button type="button" class="btn btn-danger" data-cfm="discard">Yes, discard ${esc(
            n === 1 ? "it" : "all " + n)}</button>
        </div>
      </div>`;
    function draw(html, focusSel) {
      veil.innerHTML = html;
      const f = veil.querySelector(focusSel);
      if (f) f.focus();
    }
    function done(answer) {
      document.removeEventListener("keydown", onKey, true);
      veil.remove();
      resolve(answer);
    }
    function onKey(ev) {
      if (ev.key === "Escape") { ev.preventDefault(); done("keep"); }
    }
    veil.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cfm]");
      if (!b) return;
      const a = b.dataset.cfm;
      if (a === "ask") { draw(second(), '[data-cfm="back"]'); return; }
      if (a === "back") { draw(first(), '[data-cfm="save"]'); return; }
      done(a);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(veil);
    draw(first(), '[data-cfm="save"]');
  });
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 20 — THE E-ITEM PICKER: A CHECKBOX LIST, A FILTER AND A COUNT.
   ──────────────────────────────────────────────────────────────────────────
   RULING (2026-08-27): «δυνατότητα πολλαπλών Ε».

   MULTI-E EXISTED SINCE ROUND 19 AND NOBODY COULD SEE IT. The cell offered a
   «— add an event —» select: pick one, the select redraws, pick the next. That
   is a list of one that happens to be repeatable, and a repeatable list of one
   is what a form looks like when it does NOT take many — so an instructor who
   flew four events recorded one and moved on. Nothing about the data changed
   this round; what changed is that the affordance now SAYS «many», in the shape
   FDMS's own dialog says it: every event on screen at once, a filter over the
   27, a checkbox per row and a chip counting what is ticked.

   THE BOXES ARE STATE, NOT A WRITE. Nothing reaches the row until «Done», so
   Cancel really is a cancel and a half-ticked list is never a half-saved
   sortie. The filter re-renders only the list and re-reads the ticks from the
   Set, so a box ticked before filtering is still ticked after it — the one bug
   a filtered checkbox list can have.

   Returns a promise: an ARRAY of ids on Done, or null on Cancel.
   ══════════════════════════════════════════════════════════════════════════ */
WA.pickEvents = function (opts) {
  const o = opts || {};
  const all = WA.E_ITEMS;
  const chosen = new Set((o.selected || []).map(String));
  /* an id the catalogue does not know was KEPT by WA.eItemsOf so the server
     could refuse it by name; it must survive this dialog too — a picker that
     silently dropped it would turn a refusal the instructor can act on into a
     row that quietly changed under him */
  const unknown = [...chosen].filter((id) => !WA.eItem(id));
  return new Promise((resolve) => {
    const veil = document.createElement("div");
    veil.className = "veil";
    veil.id = "wa-epick";
    let q = "";
    const matches = () => {
      const f = q.trim().toLowerCase();
      if (!f) return all;
      return all.filter((it) =>
        it.id.indexOf(f) >= 0 ||
        (it.c + " " + it.n).toLowerCase().indexOf(f) >= 0);
    };
    const listHTML = () => {
      const hit = matches();
      if (!hit.length) {
        return `<p class="hint">No event matches &ldquo;${esc(q)}&rdquo; &mdash;
          the filter reads the code and the name.</p>`;
      }
      return hit.map((it) => `<label class="epick-row" title="${esc(WA.eItemTip(it.id))}">
        <input type="checkbox" data-eid="${esc(it.id)}"${chosen.has(it.id) ? " checked" : ""}>
        <span class="epick-c">${esc(it.c)}</span>
        <span class="epick-n">${esc(it.n)}</span></label>`).join("");
    };
    const countHTML = () => `${chosen.size} of ${all.length} selected`;
    function drawList() {
      const box = veil.querySelector("#wa-epick-list");
      if (box) box.innerHTML = listHTML();
      const n = veil.querySelector("#wa-epick-n");
      if (n) {
        n.textContent = countHTML();
        n.classList.toggle("badge-good", chosen.size > 0);
      }
    }
    function done(answer) {
      document.removeEventListener("keydown", onKey, true);
      veil.remove();
      resolve(answer);
    }
    function onKey(ev) {
      if (ev.key === "Escape") { ev.preventDefault(); done(null); }
    }
    veil.innerHTML = `
      <div class="modal epick" role="dialog" aria-modal="true" aria-labelledby="wa-epick-h">
        <h3 id="wa-epick-h">Which events did this sortie exercise?</h3>
        <p class="hint">${esc(o.what || "")}<b>Tick every one of them.</b> A sortie exercises as many
          events as it exercises, and a sortie that exercised none is still a sortie &mdash; leave
          them all clear. The list is the EVENTS table of the 3-01 (Ch.4 &sect;48), which is the
          closed list the squadron&rsquo;s register is built on.</p>
        <div class="epick-bar">
          <input type="search" id="wa-epick-q" class="epick-q" autocomplete="off"
            placeholder="filter the ${esc(all.length)} events &mdash; code or words"
            aria-label="Filter the events by code or by name">
          <span class="badge${chosen.size ? " badge-good" : ""}" id="wa-epick-n"
            title="${esc("How many events are ticked. The count is what the row will carry.")}">${esc(countHTML())}</span>
        </div>
        <div class="epick-list" id="wa-epick-list" role="group"
          aria-label="Events of the 3-01 EVENTS table">${listHTML()}</div>
        ${unknown.length ? `<p class="hint"><b>${esc(unknown.length)}</b> id${
          unknown.length === 1 ? " on this row is" : "s on this row are"} not in the
          3-01 list this application carries (${esc(unknown.join(", "))}). ${
          unknown.length === 1 ? "It is" : "They are"} kept as ${
          unknown.length === 1 ? "it is" : "they are"} so the server can refuse
          ${unknown.length === 1 ? "it" : "them"} by name.</p>` : ""}
        <div class="mfoot">
          <button type="button" class="btn" data-ep="clear"
            title="${esc("Unticks everything. The row keeps no event at all — which is a valid sortie, not an unfinished one.")}">Clear all</button>
          <button type="button" class="btn" data-ep="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-ep="done">Done</button>
        </div>
      </div>`;
    veil.addEventListener("click", (ev) => {
      const box = ev.target.closest("input[data-eid]");
      if (box) {
        if (box.checked) chosen.add(box.dataset.eid); else chosen.delete(box.dataset.eid);
        const n = veil.querySelector("#wa-epick-n");
        if (n) {
          n.textContent = countHTML();
          n.classList.toggle("badge-good", chosen.size > 0);
        }
        return;
      }
      const b = ev.target.closest("[data-ep]");
      if (!b) return;
      if (b.dataset.ep === "clear") {
        chosen.clear();
        for (const id of unknown) chosen.add(id);   /* never silently dropped */
        drawList();
        return;
      }
      if (b.dataset.ep === "cancel") { done(null); return; }
      done(WA.eItemsOf({ e_items: [...chosen] }));
    });
    /* `input`, so the list narrows as he types — and only the LIST is redrawn,
       because redrawing the box would take the caret with it */
    veil.addEventListener("input", (ev) => {
      if (!ev.target.matches("#wa-epick-q")) return;
      q = ev.target.value;
      drawList();
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(veil);
    const f = veil.querySelector("#wa-epick-q");
    if (f) f.focus();
  });
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
