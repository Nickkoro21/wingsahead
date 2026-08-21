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
  /* ROUND 14 — the left panel keeps a scroll listener on `window`, which
     outlives the DOM it points at unless it is told to stop. One slot, because
     one view at a time mounts one panel. */
  if (WA._nav) { WA._nav.destroy(); WA._nav = null; }
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
  exams:        { label: "Ground exams", tip: "The eight ground-exam groups of the syllabus, present as rows from the first day: grey until the exam is sat, light green on the date alone, green once the result is in — whatever the result says, because the row asked for a mark and got one. A GROUND EXAM IS PASSED AT 80 % — a flight is passed at 60, and these are two different examinations with two right numbers (ruling of 2026-08-21). The 80 % decides which TRIAL stands for the exam, never whether the row is complete. The ΕΕΘ weekly theory exams are ground exams too and are marked the same way. (The exam papers written INSIDE a theory group — FF 190, PT 190, AΕ 190, JX 190/191, NA 191 — are courses of their group and belong under Ground lessons: that is where the squadron's scheduler counts them.)" },
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
     is already correct. `series`/`series_no` are the ΕΕΘ weekly exams, which
     name no `exam` — the two shapes are exclusive and the server refuses a row
     that tries to be both. */
  exams:        ["date", "exam", "trial", "series", "series_no", "grade",
                 "legacy", "entered_by"],
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
   receives it, wa.slot_empty needs no new branch, the CO-entry arithmetic
   ("3 of 80 entered by the CO") is not diluted by 180 placeholders nobody
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
    tip: "Complete — everything the row asks for is filled in AND the mission was completed: the date, the instructor, the duration, and a grade of 60 % or better (or a mission the squadron characterised complete without a percentage). A non-graded (NG) flight is done on its date, its instructor and its duration: nobody was in a position to score it. A ground lesson is done on its date, a ground exam on its date AND its result — WHATEVER the result says: an exam marked 40 % is a complete row, because the row asked for a result and got one. Whether it PASSED is the other axis (80 % on a ground exam), and it decides which trial stands for the exam, not whether the row is finished." },
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
   slots and FALSE of the two shapes round 14 added. An ΕΕΘ's own cell says the
   syllabus does not enumerate them; a minted 2nd trial is a re-sit somebody
   ORDERED. Both wear the grey, correctly — «on the programme, nothing recorded
   yet» is exactly what they are — and both carried a chip that contradicted the
   tooltip two columns away, and got the one fact backwards that decides whether
   anything is stored for them. The precedent is round 12b's WA.debriefWord: the
   WORD is the same everywhere, the SENTENCE is section- and row-aware. */
WA.rowStateTip = function (sec, e, st) {
  const d = WA.rowStateDef(st);
  if (sec !== "exams" || !e || typeof e !== "object") return d.tip;
  const ser = WA.examSeries(e);
  if (!ser && !WA.rowMinted(sec, e)) return d.tip;          /* a true slot row */
  const what = ser
    ? "a planned weekly theory exam (" + WA.examRowLabel(e) + ")"
    : "a planned " + WA.examTrialWord(WA.examTrial(e)) + " of " + String(e.exam);
  const tail = ser
    ? " The ΕΕΘ are not rows of the printed flow chart — the syllabus does not enumerate them, they are numbered in the order they are sat — and unlike a flow-chart slot this row IS stored: nothing but the record remembers that it was put on the programme."
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
   the two flight logs (MINUS the eight checkrides, which are recorded in the
   Evaluations section and must not exist twice), the 47 (group, course) pairs
   for the lessons and the 8 exam groups. Built once and cached: it is derived
   from the generated catalogue and cannot change while the page is open. */
WA.slotDefs = function (sec) {
  WA._slotDefs = WA._slotDefs || {};
  if (WA._slotDefs[sec]) return WA._slotDefs[sec];
  const out = [];
  if (sec === "flights" || sec === "fs") {
    for (const t of WA.TRACKS) {
      for (const s of WA.logPickList(sec, t)) {
        out.push({ key: t + "|" + s.c, sec, track: t, code: s.c, sortie: s });
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

/* WHICH SLOT THIS ROW COULD OCCUPY — null when the row is an EXTRA by nature.
   A flight qualifies only as the syllabus's planned pass: kind `syllabus`,
   seq 1, and a code the track's own flow-chart list knows. A same-day re-fly
   (seq > 1), a repeat / FCF / CEF / other, and an off-catalogue code are all
   extras, and so is a course that is not a course OF ITS GROUP (the join key
   is the PAIR — OJT is a course of four different groups). */
WA.slotKey = function (sec, e) {
  if (!e || typeof e !== "object") return null;
  if (sec === "flights" || sec === "fs") {
    if ((e.kind || "syllabus") !== "syllabus") return null;
    if (Math.round(Number(e.seq) || 1) !== 1) return null;
    const code = WA.normCode(e.sortie);
    if (!code || !e.track) return null;
    const k = e.track + "|" + code;
    return WA.slotIndex(sec)[k] ? k : null;
  }
  if (sec === "lessons") {
    const c = WA.normLine(e.course);
    if (!e.group || !c) return null;
    const k = e.group + "|" + c;
    return WA.slotIndex(sec)[k] ? k : null;
  }
  if (sec === "exams") {
    /* ROUND 14 — an ΕΕΘ names no exam and occupies no slot: the series is not
       in the syllabus's enumerated eight, so there is nothing for it to claim.
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
     ΕΕΘ, or the 2nd / 3rd trial of an exam. A minted row is a REPORT even when
     it is empty («a re-sit has been ordered»), so it is stored, it is never
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
  if (sec !== "exams" || !e || typeof e !== "object") return false;
  if (WA.examSeries(e)) return true;
  return !!WA.exam(WA.normLine(e.exam)) && WA.examTrial(e) > 1;
};
WA.rowPlanned = function (sec, e) {
  if (sec !== "exams" || !e || typeof e !== "object") return false;
  if (WA.examSeries(e)) return true;
  return !!WA.exam(WA.normLine(e.exam));
};
/* WHO OCCUPIES EACH SLOT — in TWO PASSES, and the order of the passes is the
   whole of the rule.
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
WA.claims = function (sec, list) {
  const arr = Array.isArray(list) ? list : [];
  const taken = {}, claimed = new Array(arr.length).fill(false),
        keys = new Array(arr.length);
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
    if (!k || WA.slotUntouched(sec, arr[i])) continue;
    /* ROUND 14 — a PLANNED row with nothing in it does not take the slot away
       from the attempt that has something in it: a 2nd trial that has only
       been scheduled must not decide the colour of an exam already sat. */
    if (WA.rowMinted(sec, arr[i]) && WA.rowBlank(sec, arr[i])) continue;
    (holder[k] = holder[k] || []).push(i);
  }
  for (const k of Object.keys(holder)) {
    const idxs = holder[k];
    const win = (sec === "exams" && idxs.length > 1)
      ? WA.examOperativeIx(arr, idxs) : idxs[0];
    taken[k] = true; claimed[win] = true;
  }
  for (let i = arr.length - 1; i >= 0; i--) {
    const k = keys[i];
    if (!k || !WA.slotUntouched(sec, arr[i]) || taken[k]) continue;
    taken[k] = true; claimed[i] = true;
  }
  return { claimed, keys, taken };
};

/* HAS ANYBODY TOUCHED THIS ROW? — the shape test, and the one the sparse rule
   rides on: a row carrying NOTHING BUT ITS SLOT IDENTITY is a placeholder the
   form drew, and it is never stored, never counted and never stamped.
   `legacy` and `entered_by` are disqualifiers on purpose: a row an older form
   left incomplete, or one the CO entered, is a REPORT — it must never be
   mistaken for a placeholder and silently dropped on the next save. */
WA.slotUntouched = function (sec, e) {
  if (!e || typeof e !== "object") return false;
  if (e.legacy || e.entered_by) return false;
  /* ROUND 14 — AND A PLANNED ROW IS A REPORT TOO. A minted 2nd trial and an
     ΕΕΘ are rows somebody CREATED: they say «a re-sit has been ordered» and «a
     weekly exam is on the programme», which is information no placeholder
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
  /* ROUND 14 — a numbered trial and an ΕΕΘ claim no slot and are not extras:
     they are planned rows, and they are read exactly like a claimed one.
     A PLANNED ROW WITH NOTHING IN IT IS OWED, not started: minting ΕΕΘ 4 or a
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
   rows: the student's form carries the placeholders and the CO's record does
   not, and both must reach the same number. Hours and the debrief lag count
   the TOUCHED rows only — a slot nobody has flown has flown no hours. */
WA.stateCounts = function (sec, list, track) {
  const arr = Array.isArray(list) ? list : [];
  const c = WA.claims(sec, arr);
  const out = { done: 0, started: 0, owed: 0, extra: 0, hours: 0, lag: 0, n: 0,
                /* ROUND 14 — how many SLOTS are complete, which is not the same
                   number as how many ROWS are: an exam sat three times has one
                   slot and up to three done rows, so every «X of 8» sentence
                   reads this and every «done X» reads the other. */
                slotsDone: 0 };
  let claimedN = 0;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (track != null && (e.track || "") !== track) continue;
    const st = WA.rowState(sec, e, c.claimed[i]);
    /* a SEEDED PLACEHOLDER is counted from the catalogue below, never here —
       but a stored row that reads `owed` (an ΕΕΘ nobody has sat yet) is a real
       row and does count, which is why the test is the placeholder test and
       not the word */
    if (WA.slotOwed(sec, e)) continue;
    if (c.claimed[i]) { claimedN++; if (st === "done") out.slotsDone++; }
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
  out.hours = Math.round(out.hours * 10) / 10;
  /* += , not = : the catalogue's untouched slots PLUS the stored rows that are
     themselves owed (an ΕΕΘ on the programme and not yet sat) */
  out.owed += Math.max(0, WA.slotCount(sec, track == null ? null : track) - claimedN);
  return out;
};
/* ── THE DISPLAY ORDER, AND IT IS ONE FUNCTION ────────────────────────────
   THE SYLLABUS ORDER IS THE BACKBONE: every slot of the catalogue in the order
   the printed flow chart (or the printed programme) lays the stage out in,
   each carrying the row that claims it or nothing at all when it is OWED —
   then the EXTRAS, which have no place in the chart to sit in, oldest first.
   That last half is round 12b's date sort, unrevoked and now scoped to the
   rows it was always the right rule for.
   The student's form, the CO's drill-down and the printed brief all call this,
   so the three cannot show the same record in three different orders.
     → [{ def, e, i, state }]   i = the STORED index, -1 when nothing claims it */
WA.slotRows = function (sec, list, track) {
  const arr = Array.isArray(list) ? list : [];
  const c = WA.claims(sec, arr);
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
       one section over); an ΕΕΘ goes to its own list, after the eight. */
    if (WA.rowPlanned(sec, e)) {
      if (WA.examSeries(e)) { series.push({ e, i }); return; }
      const k = WA.normLine(e.exam);
      (alts[k] = alts[k] || []).push({ e, i });
      return;
    }
    extras.push({ e, i });
  });
  /* the series in NUMBER order — the number is the name, so ΕΕΘ 2 must never
     print above ΕΕΘ 1 because it was typed first */
  series.sort((a, b) => {
    const na = WA.examSeriesNo(a.e), nb = WA.examSeriesNo(b.e);
    if (na === null || nb === null) return na === nb ? a.i - b.i : (na === null ? 1 : -1);
    return na - nb || a.i - b.i;
  });
  for (const k of Object.keys(alts)) alts[k].sort((a, b) => WA.examTrial(a.e) - WA.examTrial(b.e) || a.i - b.i);
  extras.sort((a, b) => {
    const da = WA.rowDate(sec, a.e), db = WA.rowDate(sec, b.e);
    if (!da !== !db) return da ? -1 : 1;             /* dateless last */
    if (da !== db) return da < db ? -1 : 1;
    const sa = Number(a.e.seq || 1), sb = Number(b.e.seq || 1);
    if (sa !== sb) return sa - sb;
    return a.i - b.i;                                 /* stable: stored order */
  });
  const out = [];
  for (const d of WA.slotDefs(sec)) {
    if (track !== undefined && track !== null && d.track !== track) continue;
    const hit = by[d.key];
    out.push({ def: d, e: hit ? hit.e : null, i: hit ? hit.i : -1,
               state: hit ? WA.rowState(sec, hit.e, true) : "owed" });
    /* the other trials of this exam, immediately under it. `alt` marks them so
       a caller can render the trial badge and NOT a second slot header; `def`
       is repeated on purpose (it is the same exam), and nothing counts defs —
       WA.slotCount reads the catalogue, never this list. */
    for (const x of (alts[d.key] || [])) {
      out.push({ def: d, alt: true, trial: WA.examTrial(x.e), e: x.e, i: x.i,
                 state: WA.rowState(sec, x.e, false) });
    }
  }
  /* THE ΕΕΘ SERIES, after the eight fixed slots — «rendered after the 8 fixed
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
   nothing anywhere — not in the CO-entry arithmetic, not in the exports, not
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
      /* an ΕΕΘ names no exam and takes no trial number; the number is its name
         and a row without one cannot be told from any other ΕΕΘ */
      if (o.exam) { o.exam = null; o.legacy = true; }
      delete o.trial;
      /* the key is DROPPED and not nulled, so this mirror and wa.migrate_record
         produce byte-identical rows (the house rule: change one, change both) */
      if (WA.examSeriesNo(o) === null) { delete o.series_no; o.legacy = true; }
      else o.series_no = WA.examSeriesNo(o);
      /* date AND grade are nullable here — a minted ΕΕΘ is a planned row */
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
WA.GRADE_PASS_MIN = 60;
/* the ground exams — the 8 fixed groups AND the ΕΕΘ weekly series, which are
   ground exams too and are marked the same way */
WA.EXAM_PASS_MIN = 80;
/* WHICH NUMBER JUDGES THIS SECTION. One function, so a chip, a tooltip, a CSV
   cell and the operative-trial rule can never quote different marks. */
WA.passMin = function (sec) {
  return sec === "exams" ? WA.EXAM_PASS_MIN : WA.GRADE_PASS_MIN;
};
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
   here before this round. */
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
   MIRROR: db/schema.sql → wa.grade_mission. */
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
   ROUND 13 residual (found while re-rendering the CO's exam table): the chip is
   SECTION-AWARE, like WA.debriefWord has been since 12b. A ground exam awaits a
   RESULT, not a debrief — nobody debriefs a written paper — and the CO's exam
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

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 14 — TRIALS, AND THE ΕΕΘ SERIES.
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

   2. AN ΕΕΘ is a WEEKLY THEORY EXAM — an OPEN series the syllabus does not
      enumerate. It has no place among the eight and no fixed count, so it
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
   squadron, an ΕΕΘ is on the weekly programme. They take the ordinary
   done / started verdict of any written row (WA.rowPlanned).
   MIRROR: db/schema.sql → wa.exam_series() and the exams branch of
   wa.validate_record. Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
WA.EXAM_TRIALS = 3;
WA.EXAM_SERIES = [
  { id: "EETH", label: "ΕΕΘ", en: "EETH",
    tip: "ΕΕΘ — the weekly theory exams. An OPEN series the syllabus does not enumerate: they are numbered ΕΕΘ 1, ΕΕΘ 2 … in the order they are sat, and both the date and the grade may be left empty until they are known. They are not one of the eight ground exams and they are not extras — they are planned. They ARE ground exams, so they are marked at the ground-exam pass mark: 80 %, the same number as the eight (round 15)." },
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
/* what this row IS CALLED, on every surface: "IN190 · 2nd trial", "ΕΕΘ 3"
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
   one sitting, not two. A series row is never counted — the ΕΕΘ are numbered
   and no two of them share a name. */
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
   actually there, so a deleted ΕΕΘ 2 does not make the next one a duplicate */
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
   eight, or an ΕΕΘ of the weekly series. */
WA.examPassed = function (e) {
  return !!e && WA.gradePassed(e.grade, "exams");
};
/* ROUND 15 — THE EXAMS' OWN PASS-ATTEMPT SENTENCE. WA.PASS_ATTEMPT_TIP is the
   CHECKRIDES' and quotes 60 %; a ground exam is judged at 80, so the two
   surfaces cannot share one sentence any more without one of them lying. */
WA.EXAM_PASS_TIP =
  "A re-sat ground exam counts with the attempt it was PASSED on — 80 % and above (the ground-exam pass mark, ruled 2026-08-21: «80% για εξετασεις εδαφους, 60% για πτησεις»; FDMS calls the same number exam_pass_pct). The attempts below it stay in the record and stay visible; they never decide the exam. Two passes resolve to the later one, and if no attempt has reached 80 % the latest graded one stands for the exam and nothing has passed yet.";

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
     2. THE CALL SIGN, in NATURAL order — P-2 before P-14 before P-31, never
        the string order that puts P-14 before P-2. The call sign IS the
        squadron's own hierarchy (P-14, the CO, comes first), which is why it
        and not the rank field decides: rank is a grade, the call sign is the
        position. This is the FDMS Currency precedent, unchanged.
     3. Anybody without a call sign sorts LAST WITHIN THEIR OWN AIR FORCE, by
        surname — they are not un-ranked, they are un-numbered.

   ONE comparator, used by every list on this side; MIRROR: db/schema.sql →
   wa.seniority_key(), which orders the same lists on the server so that a
   payload the client cannot re-sort (the picker is surnames only — no country
   and no call sign ever leave the database for a student) still arrives in
   this order. Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
WA.SENIORITY_TIP =
  "Seniority order — HAF first, then ITAF, then any other air force; within each, by call sign in natural order (P-2 before P-14), and whoever has no call sign last by surname.";
/* digits padded so a numeric run compares as a NUMBER: "P-14" → "P-00000014" */
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
   the whole flight log to get there, and a CO entering data on somebody's
   behalf does it twice. The panel is the form's table of contents — one row
   per section, click to go there, and each row carries THE ONE FACT that
   section is about, so the panel answers "what do I still owe?" without being
   opened at all.

   IT IS ONE COMPONENT AND IT IS NOT THE FORM'S. The student form and the
   admin's Student-analysis tab both mount it; neither knows how it works, and
   both hand it the same shape:
     items = [{ id, label, tip, badge, bars:[{state,n}], tone }]
   The panel renders, tracks the scroll, and re-reads the items on demand
   (refresh) — it never reads a record, because it must not have an opinion
   about what a section is.

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
      <button type="button" class="sn-row" data-navto="${esc(it.id)}"
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
    /* on a phone the panel is a strip the reader just tapped: close it, or the
       section they asked for opens underneath the list they asked it from */
    if (window.innerWidth <= WA.NAV_BREAK) setOpen(false);
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
   — and where the CO is entering on somebody's behalf it names both: who is
   writing, and whose record is being written.

   AND WHAT — AS A NUMBERED LIST OF SENTENCES, not a payload. The list is
   built by comparing the form against the state it was last saved in, and
   every item is in the terms the user can see on screen: the section, the row
   named the round-12b way (its code / date, never a stored index), and what
   changed, old → new. One builder for all three forms — the student's, the
   CO's on-behalf twin and the instructor's general save — because three
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
};
/* the fields a change list ever mentions — the stored keys of the section,
   minus the two the user never typed and cannot act on */
WA.diffFields = function (sec) {
  return (WA.ENTRY_KEYS[sec] || []).filter((k) => k !== "legacy" && k !== "entered_by");
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
/* THE CHANGE LIST OF ONE RECORD — the student form and its CO twin.
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
          o.onBehalf ? ` <span class="cotag" title="${esc(WA.CO_TIP || "")}">CO</span>
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
