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

function getToken() {
  const m = /[#&]t=([A-Za-z0-9_-]{10,})/.exec(location.hash);
  return m ? m[1] : null;
}

/* ENTER-ON-BEHALF sub-route — #t=<admin token>&co=rec:<uuid> (student record)
   or &co=prop:<uuid> (an instructor's proposals). The token stays in the hash,
   so Back / reload / bookmark never lose the admin session. Only the admin
   role acts on it: for anybody else route() ignores it (the CO editing UI is
   unreachable, not merely hidden). */
function getCoTarget() {
  const m = /[#&]co=(rec|prop):([0-9a-fA-F-]{36})/.exec(location.hash);
  return m ? { kind: m[1], id: m[2] } : null;
}
WA.coHash = function (kind, id) {
  return "#t=" + WA.token + "&co=" + kind + ":" + id;
};
WA.adminHash = function () { return "#t=" + WA.token; };

function renderLanding(el, invalid) {
  el.innerHTML = `
    <div class="landing">
      <div class="big" aria-hidden="true">&#9992;</div>
      <h2>${invalid ? "This link is not active" : "Wings Ahead"}</h2>
      <p>${invalid
        ? "The personal link you used is invalid or has been revoked. No data is shown."
        : "This application works only through personal links."}
        <br><br>Please contact the squadron CO to receive your personal link.</p>
    </div>`;
}

/* leaving a view: stop everything the previous one had running, so a timer or
   a key handler can never fire against a DOM that is no longer there */
function teardownView() {
  if (WA._admTimer) { clearInterval(WA._admTimer); WA._admTimer = null; }
  WA._adminState = null;
  WA._admNav = null;
  WA._stuState = null;
  WA._insState = null;
}

async function route() {
  const view = $("view");
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
    /* the CO entering on behalf of somebody — the SAME form, bound to them */
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
     order  — syllabus order (the x axis of the category plot)
   ══════════════════════════════════════════════════════════════════════════ */
WA.EVALUATIONS = [
  { id: "C4590", cat: "contact",        order: 1, name: "Contact checkride" },
  { id: "C4790", cat: "contact",        order: 2, name: "Contact checkride for SOLO" },
  { id: "C5090", cat: "contact",        order: 3, name: "Contact checkride" },
  { id: "C5490", cat: "contact",        order: 4, name: "Final Contact checkride" },
  { id: "I4490", cat: "instrument",     order: 5, name: "Instrument checkride" },
  { id: "I4890", cat: "instrument",     order: 6, name: "Final Instruments checkride" },
  { id: "F4690", cat: "formation",      order: 7, name: "Final Formation checkride" },
  { id: "N4690", cat: "vfr_navigation", order: 8, name: "Final Navigation checkride" },
];

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

/* the chips of the per-category plot — the four tracks + the FPC section */
WA.EVAL_CATS = [
  { id: "contact", label: "Contact" },
  { id: "instrument", label: "Instrument" },
  { id: "formation", label: "Formation" },
  { id: "vfr_navigation", label: "Navigation" },
  { id: "fpc", label: "FPC" },
];

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
/* who may conduct an FPC / CEF, before the squadron's own instructors: the
   two standing appointments of the unit (round 5). Free text stays accepted. */
WA.EVALUATOR_ROLES = ["DO", "Squadron CO"];

WA.SECTIONS_META = {
  nfs:          { label: "NFS", tip: "NFS = Φύλλο μη Πτήσης (ΦΜΠ) — one dated entry per event, with the reason printed on form Α0473 (3-01 ΚΕΦ.9): failed questionnaire / failed pre-flight briefing / failed flight / failed F/S / illness / other cause. The count is derived." },
  sms:          { label: "SMS", tip: "SMS = Safety Management System — one entry per entrance, with the exit date when it closes." },
  airsickness:  { label: "Airsickness", tip: "One dated entry per airsickness event — with whom it happened and, optionally, the phase of flight." },
  fail:         { label: "FAIL", tip: "FAIL = a syllabus item graded below the desired performance — the flight, the items, the instructor and the grade." },
  almost_good:  { label: "ALMOST GOOD", tip: "ALMOST GOOD = an item that only just reached the desired performance — same detail as a FAIL." },
  evaluations:  { label: "Evaluations", tip: "The eight checkrides of the stage — fixed rows, present from day one and pending until flown, so every student is compared on the same flight." },
  solo_flights: { label: "Solo flights", tip: "The solos the syllabus prescribes — eight fixed slots (F4301-06 carries two), pending until flown. A flown solo is graded 0-100 % or NG (non-graded). An unforeseen solo is recorded as an additional solo." },
  fpc:          { label: "FPC", tip: "FPC = Δοκιμή Προόδου (flight progress check) — flown after failures, so fewer is better. Each entry names the stage flight that triggered it and the evaluator who conducted it." },
  cef:          { label: "CEF", tip: "CEF = Εξέταση Καταλληλότητας (evaluation with a Squadron Evaluator) — flown after failures, so fewer is better. Each entry names the stage flight that triggered it and the evaluator who conducted it." },
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
   ENTERED BY THE CO — the transparency stamp (round 4).
   The squadron CO can enter data FOR a student or an instructor; every row
   written that way carries entered_by:'admin', set server-side, and every
   view that shows the row shows this tag. The owner saving their own form
   clears it — reclaimed data is self-reported again.
   ══════════════════════════════════════════════════════════════════════════ */
WA.CO_TIP = "Entered by the squadron CO on behalf of the owner — not self-reported";
WA.isCO = function (e) { return !!(e && e.entered_by === "admin"); };
WA.coTag = function (e) {
  return WA.isCO(e)
    ? `<span class="cotag" title="${esc(WA.CO_TIP)}" aria-label="${esc(WA.CO_TIP)}">CO</span>` : "";
};
/* the same fact for CSV / plain-text surfaces */
WA.coWord = function (e) { return WA.isCO(e) ? "CO" : "self"; };

/* ── THE SOURCE OF A WHOLE RECORD (round 4b) ───────────────────────────────
   A record is not "the CO's" because the CO touched it. 17 self-reported
   entries and 1 CO addition is a SELF-REPORTED record with one CO addition,
   and every surface that summarises a record must say exactly that.
   MIRROR: db/schema.sql → wa.record_stamp / wa.co_entry_count / wa.entry_count.
   `stamp` is the record-level flag the server sends; it settles only the case
   the entries cannot — an empty record the CO created for an owner who has
   never saved it. → { n, total, all, some, any, word, tip } */
WA.coSource = function (rec, stamp) {
  const r = rec || {};
  let total = 0;
  for (const k of WA.COUNTED) total += WA.filled(k, r[k]).length;
  const n = WA.coEntries(r).length;   /* the one place CO entries are counted */
  const all = total > 0 ? n === total : stamp === "admin";
  const some = n > 0 && !all;
  return {
    n, total, all, some, any: all || some,
    /* the plain-text verdict for CSV: "CO" = all of it, "self+CO" = the
       owner's record with CO additions (the count travels beside it) */
    word: all ? "CO" : (some ? "self+CO" : "self"),
    tip: all
      ? (total ? "Every entry of this record was entered by the squadron CO on the owner's behalf"
               : "This record was opened by the squadron CO — its owner has never saved it")
      : some
        ? n + (n === 1 ? " entry was" : " entries were") +
          " entered by the squadron CO on the owner's behalf — the other " +
          (total - n) + (total - n === 1 ? " is" : " are") + " self-reported"
        : "Self-reported by its owner",
  };
};
/* the chip that carries that verdict: filled "CO" = the whole record is the
   CO's, hollow "+N CO" = N of its entries are and the rest is the owner's. */
WA.coRecordTag = function (src) {
  if (!src || !src.any) return "";
  const label = src.all ? "CO" : "+" + src.n + " CO";
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
/* the whole items[] of one FAIL / ALMOST GOOD entry, for tables and print */
WA.itemsLabel = function (entry) {
  const e = entry || {};
  const list = Array.isArray(e.items) ? e.items : [];
  if (!list.length) return "—";
  return list.map((n) => WA.itemText(e.category, n)).join(" · ");
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
WA.sortieOf = function (code) {
  if (!code) return null;
  if (!WA._sortieIx) {
    WA._sortieIx = {};
    for (const s of WA.allSorties()) WA._sortieIx[s.c] = s;
  }
  return WA._sortieIx[String(code).toUpperCase()] || null;
};
/* the track a syllabus code belongs to, from its letter (B/C contact,
   I instrument, F formation, N navigation) — null for free text.
   MIRROR: db/schema.sql → wa.code_track. This is what makes the pair
   "category Instrument + flight C4302" impossible instead of merely unlikely. */
WA.codeTrack = function (code) {
  const c = String(code || "").toUpperCase();
  if (!/^[BCIFN]\d{4}$/.test(c)) return null;
  return { B: "contact", C: "contact", I: "instrument", F: "formation", N: "vfr_navigation" }[c[0]];
};
/* is this code one the generated catalogue knows? (an unknown code is
   accepted — the syllabus data can lag reality — but it is shown marked) */
WA.sortieKnown = function (catId, code) {
  if (!code) return true;
  const c = String(code).toUpperCase();
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
   section renders exactly these, always, pending until flown — there is no
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
   instead of stored, and a flag the form cannot show ("pending" on an NFS row)
   can never enter the record (round-4 W3a). */
WA.ENTRY_KEYS = {
  nfs:          ["date", "reason", "note", "legacy", "entered_by"],
  sms:          ["entrance_date", "exit_date", "note", "legacy", "entered_by"],
  fail:         ["date", "category", "flight_code", "items", "instructor", "grade", "pending", "legacy", "entered_by"],
  almost_good:  ["date", "category", "flight_code", "items", "instructor", "grade", "pending", "legacy", "entered_by"],
  airsickness:  ["date", "instructor", "phase", "legacy", "entered_by"],
  evaluations:  ["date", "evaluation", "with", "grade", "pending", "legacy", "entered_by"],
  solo_flights: ["slot", "sortie", "date", "ng", "grade", "instructor", "legacy", "entered_by"],
  fpc:          ["date", "flight_code", "evaluator", "result", "grade", "pending", "legacy", "entered_by"],
  cef:          ["date", "flight_code", "evaluator", "result", "grade", "pending", "legacy", "entered_by"],
};
/* only these sections may carry `pending` — exactly where the form draws the
   tick box, so a pending badge on the CO's dashboard can always be cleared */
WA.PENDING_SECTIONS = ["fail", "almost_good", "evaluations", "fpc", "cef"];

/* ── AN EMPTY FIXED SLOT (round 5) ─────────────────────────────────────────
   The eight solos and the eight checkrides are rows the SYLLABUS puts in the
   record, not events the student reported. Until one is flown it is a
   placeholder: it is never counted, never exported as an entry and never
   stamped "entered by the CO".
   MIRROR: db/schema.sql → wa.slot_empty. */
WA.slotEmpty = function (sec, e) {
  if (!e || typeof e !== "object") return false;
  const empty = (v) => v === null || v === undefined || v === "";
  if (sec === "solo_flights") {
    return !empty(e.slot) && empty(e.date) && empty(e.grade) &&
           empty(e.instructor) && empty(e.sortie) && !e.ng;
  }
  if (sec === "evaluations") {
    return !empty(e.evaluation) && empty(e.date) && empty(e.grade) &&
           empty(e.with) && !e.pending;
  }
  return false;
};
/* the entries of one section that actually happened (slots excluded) */
WA.filled = function (sec, list) {
  return (Array.isArray(list) ? list : []).filter((e) => !WA.slotEmpty(sec, e));
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

  /* SMS — the pending flag is gone; if it was set, keep the fact as a note */
  out.sms = (arr(src.sms) || []).map((e) => {
    const o = { ...e };
    if (o.pending && !o.note) o.note = "was flagged pending in the previous form";
    delete o.pending;
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
      if (!isDate(o.date) || !o.category || !o.items.length) o.legacy = true;
      return o;
    });
  }

  out.airsickness = (arr(src.airsickness) || []).map((e) =>
    isDate(e.date) ? e : { ...e, legacy: true });

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
    if (!WA.slotEmpty("solo_flights", o) &&
        (!isDate(o.date) || (!o.ng && !isFinite(Number(o.grade))))) o.legacy = true;
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
      return isDate(o.date) ? o : { ...o, legacy: true };
    });
  }

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
WA.COUNTED = ["nfs", "sms", "fail", "almost_good", "airsickness",
              "evaluations", "solo_flights", "fpc", "cef"];

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
    pending: WA.pendingItems(r).length,
    legacy: WA.legacyItems(r).length,
    /* HOW MANY entries the CO entered — never WHETHER the record is "the
       CO's": that verdict needs the total too, and lives in WA.coSource */
    co: WA.coEntries(r).length,
  };
};

/* every entry the CO entered on the owner's behalf, described */
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
      with: e.with || "", date: e.date || "", pending: !!e.pending, legacy: !def,
      flown: !WA.slotEmpty("evaluations", e),
      entered_by: e.entered_by || null,
    };
  });
};
/* THE EIGHT CHECKRIDES AS FIXED ROWS (round 5) — always all eight, in
   syllabus order, whatever the record holds. `row` is the attempt that
   occupies the slot (the latest one, which is what every comparison uses),
   `earlier` the superseded attempts of the same checkride, `extras` the
   imported evaluations nobody has identified yet. */
WA.evalSlotRows = function (rec) {
  const rows = WA.evalRows(rec).filter((r) => r.flown || !r.id);
  const later = (a, b) => {
    const da = String(a.date || ""), db = String(b.date || "");
    if (da && db && da !== db) return da > db;
    if (da && !db) return true;
    if (!da && db) return false;
    return a.i >= b.i;
  };
  const slots = WA.EVALUATIONS.map((d) => {
    const mine = rows.filter((r) => r.id === d.id);
    let row = null;
    for (const r of mine) if (!row || later(r, row)) row = r;
    return { def: d, row, earlier: mine.filter((r) => r !== row) };
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
        with: x.e.evaluator || "", date: x.e.date || "", pending: !!x.e.pending,
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

/* this student's value on ONE evaluation identity: the LATEST graded attempt
   (a re-fly after a failed checkride supersedes the earlier one). Every
   class statistic in the admin views uses this same rule. */
WA.evalLatest = function (rows, id) {
  let best = null;
  for (const r of rows) {
    if (r.id !== id || r.grade === null) continue;
    if (!best) { best = r; continue; }
    const a = String(r.date || ""), b = String(best.date || "");
    if (a && !b) best = r;
    else if (a && b ? a >= b : r.i >= best.i) best = r;
  }
  return best;
};

/* every pending-flagged entry, described — for highlights and badges */
WA.pendingItems = function (rec) {
  const r = rec || {};
  const out = [];
  const walk = (k, mk) => {
    (Array.isArray(r[k]) ? r[k] : []).forEach((e) => {
      if (e && e.pending) out.push(WA.secLabel(k) + ": " + mk(e));
    });
  };
  const on = (e) => (e.date ? " (" + fmtD(e.date) + ")" : "");
  walk("fail", (e) => WA.itemsLabel(e) + on(e));
  walk("almost_good", (e) => WA.itemsLabel(e) + on(e));
  walk("evaluations", (e) => WA.evalShort(e.evaluation) +
       (e.with ? " with " + e.with : "") + on(e));
  walk("fpc", (e) => (e.flight_code ? "(" + e.flight_code + ") " : "") +
       (e.date ? fmtD(e.date) : "entry") + (e.evaluator ? " — " + e.evaluator : ""));
  walk("cef", (e) => (e.flight_code ? "(" + e.flight_code + ") " : "") +
       (e.date ? fmtD(e.date) : "entry") + (e.evaluator ? " — " + e.evaluator : ""));
  return out;
};

/* entries a v1 record could not fully describe — the student is asked to
   complete them; the CO sees how many are still incomplete. */
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

/* instructor surnames for the pickers — one RPC per session, cached.
   The RPC exposes surnames and nothing else (db/schema.sql). */
WA.instructorNames = async function () {
  if (WA._insNames) return WA._insNames;
  try {
    const r = await rpc("list_instructor_names", { p_token: WA.token });
    WA._insNames = Array.isArray(r) ? r.filter((x) => typeof x === "string") : [];
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
