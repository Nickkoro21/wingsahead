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
  /* the instructor print builder is a closure over the view that is going
     away — the once-attached beforeprint hook must not call a dead one */
  WA._insPrint = null;
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
/* THE FIFTH IS A DIFFERENT KIND OF STATEMENT, not merely the next step down —
   the four above place a student on the fighter track or beside it, the fifth
   places him firmly elsewhere. The form separates it with a thin rule for
   exactly that reason, and this index is what draws the rule. */
WA.LEVEL_SEP_AT = 4;
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
  flights:      { label: "Flights", tip: "The flight log — every sortie flown in the AIRCRAFT, one row each: the flight, the date, the instructor, how long it lasted and the grade. The grade may be left empty: a debrief sometimes takes a while, and the row says «awaiting debrief» rather than pretending the flight did not happen. Split into the four tracks of the syllabus; the eight checkrides are recorded in the Evaluations section, where the syllabus order applies to them." },
  fs:           { label: "F/S", tip: "The same log for the SIMULATOR — every F/S sortie, in the same four tracks. Sim hours and flight hours are counted separately by the squadron, which is why they are two logs and not one." },
  lessons:      { label: "Ground lessons", tip: "The ground academics — the twelve theory groups of the programme and the courses inside them. A lesson is a BLOCK, so it can carry an end date; the periods box left empty means the FULL course, and «absent» is how a class the student missed is recorded from their own side. A lesson is attended, not scored, so there is no grade here." },
  exams:        { label: "Ground exams", tip: "The eight ground-exam groups of the syllabus. The grade may be left empty until the result is in. (The exam papers written INSIDE a theory group — FF 190, PT 190, AΕ 190, JX 190/191, NA 191 — are courses of their group and belong under Ground lessons: that is where the squadron's scheduler counts them.)" },
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
/* ── THE CO'S EDITS PREVAIL (round 8) ──────────────────────────────────────
   A row the CO wrote is not a suggestion. It is shown to its owner LOCKED:
   readable, disabled, un-removable, and it must travel through the owner's
   next save fact for fact — the server refuses the save otherwise, naming the
   rule. Only the CO can change or delete it (and the CO editing one of the
   owner's rows makes it his, which locks that one too).
   MIRROR: db/schema.sql → wa.carry_stamps. */
WA.CO_LOCK_TIP =
  "Set by the squadron CO — locked. It stays on your record exactly as it stands; only the CO can change or remove it.";
WA.coLockTag = function () {
  return `<span class="colock" title="${esc(WA.CO_LOCK_TIP)}" aria-label="${esc(WA.CO_LOCK_TIP)}">&#128274; locked by CO</span>`;
};
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
   the CO's tables, the brief and the instructor card all call this one */
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
  evaluations:  ["date", "evaluation", "with", "grade", "legacy", "entered_by"],
  solo_flights: ["slot", "sortie", "date", "ng", "grade", "instructor", "legacy", "entered_by"],
  fpc:          ["date", "flight_code", "evaluator", "result", "grade", "legacy", "entered_by"],
  cef:          ["date", "flight_code", "evaluator", "result", "grade", "legacy", "entered_by"],
  /* ROUND 12 — THE LOG TABLES. flights and fs share ONE shape: the same
     flight, flown in the aircraft or in the simulator, is the same set of
     facts. `track` says which of the four tables the row belongs to — it is
     NOT derived from the code, because kind fcf/cef/other have no syllabus
     code at all. `seq` is AUTHORED (1, and 2 for a deliberate same-day
     re-fly), never derived from an array index: an index is a position and
     this is a fact. `instructor_oid` is never drawn as a box. */
  flights:      ["date", "track", "sortie", "seq", "kind", "instructor", "instructor_oid",
                 "duration", "grade", "ng", "verdict", "note", "legacy", "entered_by"],
  fs:           ["date", "track", "sortie", "seq", "kind", "instructor", "instructor_oid",
                 "duration", "grade", "ng", "verdict", "note", "legacy", "entered_by"],
  lessons:      ["date", "end_date", "group", "course", "periods", "absent",
                 "instructor", "instructor_oid", "note", "legacy", "entered_by"],
  exams:        ["date", "exam", "grade", "instructor", "instructor_oid",
                 "note", "legacy", "entered_by"],
};

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
  /* ROUND 8: the pending tick is gone, so an evaluation slot is empty when it
     carries nothing but its identity — which is all it ever meant. */
  if (sec === "evaluations") {
    return !empty(e.evaluation) && empty(e.date) && empty(e.grade) && empty(e.with);
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
      /* A VERDICT BESIDE A GRADE IS DROPPED, not flagged — the one place this
         round removes a stored value, and it is lossless: where a grade exists
         the verdict is DERIVED from it. Flagging instead would leave a row
         nobody could save, because the form draws no verdict box on a graded
         row — a trap, not a question. */
      if (o.grade !== null && o.grade !== undefined && o.grade !== "" &&
          isFinite(Number(o.grade)) && o.verdict) o.verdict = null;
      if (o.ng && o.verdict) o.verdict = null;
      if (o.verdict && !WA.verdict(o.verdict)) { o.verdict = null; o.legacy = true; }
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
    if (typeof o.absent !== "boolean") o.absent = false;
    if (!isDate(o.date) || !o.group) o.legacy = true;
    return o;
  });
  out.exams = (arr(src.exams) || []).map((e) => {
    const o = { ...e };
    if (o.exam && !WA.exam(o.exam)) { o.exam = null; o.legacy = true; }
    if (!isDate(o.date) || !o.exam) o.legacy = true;
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
   entries to ~80, so "3 of 8 entered by the CO" becomes "3 of 80". That is
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
   every per-checkride comparison the CO makes without ever looking wrong.
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
   MIRROR: db/schema.sql → wa.grade_pass_min() / wa.grade_band() /
   wa.grade_passed(). Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
WA.GRADE_PASS_MIN = 60;
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
/* WAS THE FLIGHT CHARACTERISED SUCCESSFUL? — the one question, one answer.
   A row with no grade is NOT a pass: an evaluation whose result has not been
   written yet has not been characterised anything. */
WA.gradePassed = function (g) {
  const b = WA.gradeBand(g);
  return !!(b && b.pass);
};
WA.gradeBandText = function (g) {
  const b = WA.gradeBand(g);
  return b ? b.label + " («" + b.code + "» " + b.el + ")" : "no grade recorded";
};

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 12 — THE LOG TABLES: the four sections' vocabulary.
   ──────────────────────────────────────────────────────────────────────────
   MIRROR: db/schema.sql → wa.flight_kinds() / wa.verdicts() /
   wa.grade_verdict(). Change one, change the other.
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

/* THE VERDICT WITHOUT A NUMBER. It exists only where the grade is absent: a
   stored verdict beside a stored grade is a second source of truth that can
   contradict the first — the defect round 11 removed from the FPC. */
WA.VERDICTS = [
  { id: "pass", label: "Pass", el: "ΕΠΙΤΥΧΙΑ", cls: "ok",
    tip: "The squadron's scheduler recorded this flight as a pass and has no percentage for it" },
  { id: "lagging", label: "Lagging", el: "ΥΣΤΕΡΗΣΗ", cls: "warn",
    tip: "Recorded as ΥΣΤΕΡΗΣΗ (50-59 %) with no percentage written down" },
  { id: "failed", label: "Failed", el: "ΑΠΟΤΥΧΙΑ", cls: "bad",
    tip: "Recorded as ΑΠΟΤΥΧΙΑ (0-49 %) with no percentage written down" },
];
WA.verdict = function (id) { return WA.VERDICTS.find((v) => v.id === id) || null; };
WA.verdictLabel = function (id) {
  const v = WA.verdict(id);
  return v ? v.label : (id ? String(id) : "");
};
/* the three-way collapse of the printed five-band scale, at the SAME 60/50
   thresholds. MIRROR: db/schema.sql → wa.grade_verdict. */
WA.gradeVerdict = function (g) {
  const b = WA.gradeBand(g);
  if (!b) return null;
  return b.pass ? "pass" : b.id;      /* 'lagging' / 'failed' keep their names */
};
/* what a row's verdict IS, whatever it stores: derived from the grade when
   there is one, read off the row when there is not. One function, so the
   badge, the CSV and the count cannot disagree. */
WA.rowVerdict = function (e) {
  if (!e) return null;
  if (e.grade !== null && e.grade !== undefined && e.grade !== "" && isFinite(Number(e.grade))) {
    return WA.gradeVerdict(e.grade);
  }
  return WA.verdict(e.verdict) ? e.verdict : null;
};

/* ── THE DEBRIEF LAG, WHICH IS THE REALITY THE DIRECTIVE NAMES ─────────────
   «δεκτο το null, γιατι καποιες φορες αργει το debriefing». A flown row with
   no grade, not NG, and no verdict is a row WAITING FOR ITS DEBRIEF — never an
   error, never a legacy leftover, never something that blocks a save. It is
   shown quietly, and it goes amber once it has been waiting a while, because
   at some point the quiet fact becomes a thing to chase. */
WA.DEBRIEF_AMBER_DAYS = 7;
WA.awaitingDebrief = function (e) {
  if (!e || e.ng) return false;
  const hasGrade = e.grade !== null && e.grade !== undefined && e.grade !== "" &&
                   isFinite(Number(e.grade));
  return !hasGrade && !WA.verdict(e.verdict) && !!String(e.date || "").trim();
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
/* the chip itself — quiet by default, amber once it has waited */
WA.debriefChip = function (e) {
  if (!WA.awaitingDebrief(e)) return "";
  const n = WA.daysAgo(e.date);
  const late = n !== null && n >= WA.DEBRIEF_AMBER_DAYS;
  const tip = late
    ? "Flown " + n + " days ago and still without a grade — the debrief has not landed yet"
    : "The flight is recorded; its grade has not been written yet. That is expected — the debrief sometimes takes a while.";
  return `<span class="lagchip${late ? " is-late" : ""}" title="${esc(tip)}"
    aria-label="${esc(tip)}">awaiting debrief${late ? " · " + n + " d" : ""}</span>`;
};
/* the same fact for CSV / plain text */
WA.debriefWord = function (e) {
  if (!WA.awaitingDebrief(e)) return "";
  const n = WA.daysAgo(e.date);
  return "awaiting debrief" + (n === null ? "" : " (" + n + " d)");
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
   MIRROR: the wa.eval_ids() refusal in wa.validate_record. */
WA.logPickList = function (band, track) {
  return WA.logSorties(band, track).filter((s) => !s.k);
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

/* ── THE INSTRUCTOR PICKER'S LIST, CLIENT SIDE (round 9) ────────────────────
   The server sends a JSON array of surnames and nothing else; this is the one
   place that turns it into the list the form draws. It takes STRINGS only —
   an object that ever appeared in that array would be dropped here rather
   than stringified into "[object Object]" beside real names — trims them,
   drops the empties, de-duplicates and sorts. Whatever the transport, the
   form sees the same shape.
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
  return out.sort((a, b) => a.localeCompare(b));
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
