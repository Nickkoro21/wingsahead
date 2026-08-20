"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   Wings Ahead — STUDENT form (mobile-first, 375 px up).
   ──────────────────────────────────────────────────────────────────────────
   ROUND-3 SHAPE: every section is a LIST OF DATED ENTRIES and every counter
   is DERIVED from that list — there is no typed count anywhere in the app.
   Rows carry the detail the CO asked for: FAIL / ALMOST GOOD know the flight
   code, the syllabus items (multi-select), the instructor and the grade;
   solos are graded % or NG; evaluations name which of the eight checkrides
   they were; airsickness knows when and with whom.
   Entries imported from the previous form are marked `legacy` and the form
   asks for what is missing instead of dropping them.

   ROUND-4 ENTER-ON-BEHALF: the SAME form, bound to somebody else. opts.asCO
   swaps the two RPCs for their admin_* twins (identical validation pipeline
   server-side) and adds the "editing as CO" banner; nothing else forks.
     opts = { asCO: true, targetId: <student uuid> }   (admin token only)
   ══════════════════════════════════════════════════════════════════════════ */

WA.renderStudent = async function (view, me, opts) {
  const O = opts || {};
  const asCO = !!O.asCO;
  const S = { data: null, lastUpdate: null, dirty: false, enteredBy: null };
  /* the fingerprint of the record as it was last SAVED, and what the status
     line says while the form matches it — see markDirty() / markSaved() */
  let SAVED = "";
  let CLEAN_ST = "All changes are kept only after you press Save.";
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  const txt = (v) => String(v === null || v === undefined ? "" : v).trim();
  /* ROUND 6: there is no CUSTOM item sentinel any more — the FAIL / ALMOST
     GOOD item list ends where the printed gradesheet ends. */
  const backBtn = `<button type="button" class="btn btn-sm" data-coback>&#8592; Back to the dashboard</button>`;

  let INS = [], who = me || {};
  try {
    const got = asCO
      ? await rpc("admin_get_student_form", { p_token: WA.token, p_student_id: O.targetId })
      : await rpc("get_student_form", { p_token: WA.token });
    who = me || got.me || {};
    S.data = WA.migrateRecord(got.data);
    S.lastUpdate = got.last_update || null;
    S.enteredBy = got.entered_by || null;
    /* ROUND 9 — THE PICKER RIDES IN WITH THE FORM. get_student_form and its
       admin twin carry `instructors`: the ACTIVE instructors' surnames and
       nothing else (wa.instructor_surnames). It is one round trip instead of
       two, and the boxes that ask WHO can no longer render before their list
       arrives. An instance still running an older schema sends no such key —
       that, and only that, falls back to the standalone RPC, so the form
       degrades to the round-8 behaviour rather than to no list at all. */
    INS = Array.isArray(got.instructors)
      ? WA.insNames(got.instructors)
      : await WA.instructorNames();
  } catch (e) {
    view.innerHTML = `<div class="landing"><h2>Could not load ${asCO ? "this record" : "your form"}</h2>
      <p>${esc(e.message)}</p>${asCO ? `<p>${backBtn}</p>` : ""}</div>`;
    if (asCO) view.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-coback]")) location.hash = WA.adminHash();
    });
    return;
  }

  /* ── is this entry complete enough to stop being a legacy leftover? ──
     ROUND 6 adds four conditions to this one table, and every "please fix it
     first" in the form comes back to them: an airsickness row needs its
     FLIGHT (round 6b: EVERY row, not only the ones that still carry the
     retired phase note), a FAIL / ALMOST GOOD row needs SYLLABUS items only,
     every flown solo needs its instructor (NG included — somebody authorised
     it), and an FPC needs an evaluator that is one of the two appointments. */
  const COMPLETE = {
    nfs: (e) => isDate(e.date) && !!WA.nfsReason(e.reason) &&
      (e.reason !== "other" || !!txt(e.note)),
    /* ROUND 8 — an SMS entrance names its ΚΕΠΕ condition (3-01 ΚΕΦ.2 §32β),
       and the discretionary one names the performance it was based on */
    sms: (e) => isDate(e.entrance_date) && !!WA.smsReason(e.reason) &&
      (e.reason !== "judgement" || !!txt(e.note)),
    airsickness: (e) => isDate(e.date) && !!txt(e.flight_code),
    fail: (e) => isDate(e.date) && !!WA.itemCat(e.category) &&
      (e.items || []).length > 0 && !WA.itemsLegacy(e).length,
    almost_good: (e) => isDate(e.date) && !!WA.itemCat(e.category) &&
      (e.items || []).length > 0 && !WA.itemsLegacy(e).length,
    /* a fixed slot nobody has flown yet is complete BY BEING EMPTY */
    evaluations: (e) => WA.slotEmpty("evaluations", e) ||
      (isDate(e.date) && !!WA.evalById(e.evaluation)),
    solo_flights: (e) => WA.slotEmpty("solo_flights", e) || (isDate(e.date) &&
      !!txt(e.instructor) &&
      (e.ng ? true : (isFinite(Number(e.grade)) && e.grade !== null && e.grade !== ""))),
    fpc: (e) => isDate(e.date) && WA.fpcEvaluatorOK(e.evaluator),
    cef: (e) => isDate(e.date),
    /* ── ROUND 12 — THE LOG TABLES, AND WHAT "COMPLETE" MEANS WITH THE LAG ──
       THE GRADE IS DELIBERATELY NOT PART OF THIS. «δεκτο το null, γιατι
       καποιες φορες αργει το debriefing» — a row may wait for its grade for
       ever without being incomplete, and this is the one function that decides
       it. A flight is complete when it says WHICH flight, WHEN, and WITH WHOM. */
    flights: (e) => isDate(e.date) && !!txt(e.sortie) && !!txt(e.instructor) && !!e.track,
    fs: (e) => isDate(e.date) && !!txt(e.sortie) && !!txt(e.instructor) && !!e.track,
    lessons: (e) => isDate(e.date) && !!WA.groundGroup(e.group),
    exams: (e) => isDate(e.date) && !!WA.exam(e.exam),
  };
  const stillLegacy = (sec, e) => !!e.legacy && !COMPLETE[sec](e);

  /* ── DOES THIS ROW BLOCK THE SAVE? (round 6) ──────────────────────────────
     The legacy flag has always meant "keep it, ask for it": a row the OLD form
     never asked a question of still saves, incomplete, so nothing is lost
     while the student works through it. The five round-6 rules are stricter by
     the user's ruling — the row stays READABLE everywhere, and the record
     REFUSES TO BE SAVED until it is corrected. The two must not be confused on
     screen, so each row says which of the two it is, and this is the one
     function that decides. MIRROR: the refusals in buildPayload, and the
     server's in wa.validate_record. */
  function blocksSave(sec, e) {
    if (sec === "fail" || sec === "almost_good") return WA.itemsLegacy(e).length > 0;
    /* ROUND 6b — the flight is MANDATORY on every airsickness row, so a row
       without one blocks the save whether or not it carries the retired note */
    if (sec === "airsickness") return !txt(e.flight_code);
    /* ROUND 8 — the ΚΕΠΕ condition is asked of every SMS row, legacy included:
       the flag excuses what the old form never asked for, never a rule of this
       round. The row stays readable; the record refuses to be saved again. */
    if (sec === "sms") {
      return !WA.smsReason(e.reason) ||
             (e.reason === "judgement" && !txt(e.note));
    }
    if (sec === "solo_flights") {
      return !WA.slotEmpty("solo_flights", e) && !txt(e.instructor);
    }
    if (sec === "fpc") return !WA.fpcEvaluatorOK(e.evaluator);
    if (sec === "evaluations") {
      return !WA.slotEmpty("evaluations", e) && !!e.evaluation && !!evalBlocker(e.evaluation);
    }
    /* ROUND 12 — A MISSING GRADE NEVER BLOCKS A SAVE; a missing INSTRUCTOR
       always does. The round-6 solo doctrine applies to every sortie: «a
       student never launches alone on their own authority», and the server
       refuses the same row in the same words, on a legacy row too. Everything
       else about a log row — the grade above all — is allowed to be missing. */
    if (sec === "flights" || sec === "fs") return !txt(e.instructor);
    return false;
  }

  /* ── THE FIXED SYLLABUS ROWS (round 5) ────────────────────────────────────
     The eight solos the stage prescribes and the eight stage checkrides are
     not things a student adds: they exist from the first day and wait to be
     flown. The record is normalised on load so every slot has its row, in
     syllabus order, with the extras (an unforeseen additional solo, an
     earlier attempt at a checkride, an imported evaluation nobody has
     identified) after them. */
  function ensureSlots() {
    const solos = Array.isArray(S.data.solo_flights) ? S.data.solo_flights : [];
    const slotIx = {};
    WA.soloSlots().forEach((s, k) => { slotIx[s.id] = k; });
    for (const s of WA.soloSlots()) {
      if (!solos.some((e) => e.slot === s.id)) {
        solos.push({ slot: s.id, sortie: "", date: "", ng: false, grade: null, instructor: "" });
      }
    }
    solos.forEach((e, i) => { e._k = i; });
    solos.sort((a, b) => {
      const ka = a.slot ? slotIx[a.slot] : 1000, kb = b.slot ? slotIx[b.slot] : 1000;
      return (ka - kb) || (a._k - b._k);
    });
    solos.forEach((e) => { delete e._k; });
    S.data.solo_flights = solos;

    const evs = Array.isArray(S.data.evaluations) ? S.data.evaluations : [];
    const evIx = {};
    WA.EVALUATIONS.forEach((d, k) => { evIx[d.id] = k; });
    for (const d of WA.EVALUATIONS) {
      if (!evs.some((e) => e.evaluation === d.id)) {
        evs.push({ evaluation: d.id, date: "", with: "", grade: null });
      }
    }
    evs.forEach((e, i) => { e._k = i; });
    evs.sort((a, b) => {
      const ka = a.evaluation in evIx ? evIx[a.evaluation] : 1000;
      const kb = b.evaluation in evIx ? evIx[b.evaluation] : 1000;
      /* several attempts at the same checkride: OLDEST FIRST, so the slot
         header sits on the most recent one and the story reads downwards in
         the order it happened. Round 11: that is a LAYOUT and no longer the
         verdict — which attempt counts is decided by the pass rule
         (WA.evalOperativeOf) and said on each row's badge, not by position. */
      return (ka - kb) || String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
             (a._k - b._k);
    });
    evs.forEach((e) => { delete e._k; });
    S.data.evaluations = evs;
  }
  ensureSlots();

  /* ── THE CO'S EDITS PREVAIL (round 8) ─────────────────────────────────────
     An entry the squadron CO created or modified is LOCKED for its owner: it
     is shown, marked, and every control inside it is disabled — the student
     can neither change it nor remove it, and their save must carry it through
     untouched (the server refuses otherwise, in the same words). The CO's own
     form locks nothing: on that side every row is his to edit or delete.
     MIRROR: db/schema.sql → wa.carry_stamps. */
  const coLocked = (e) => !asCO && WA.isCO(e);
  /* the CO entries the record ARRIVED with, per section. Nothing in the UI can
     drop one, so a mismatch at save time means a row was refused on its way
     into the payload — and the owner cannot fix a locked row, so the message
     has to send them to the CO instead of to the row. */
  const CO_BASE = {};

  /* ── field builders ───────────────────────────────────────────────────── */
  const F = (sec, i, field, extra) =>
    `data-sec="${esc(sec)}" data-idx="${i}" data-field="${esc(field)}"${extra || ""}`;
  /* `off` freezes a box the rules do not allow to be filled YET — round 6 uses
     it for a checkride whose predecessor has not been flown. It is never used to
     freeze a box that already holds something: a value must always be
     correctable, or the form becomes a trap. */
  const off = (lock) => (lock ? " disabled" : "");

  const dateF = (sec, i, field, val, label, req, lock) => `
    <label class="f${lock ? " is-off" : ""}"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="date" value="${esc(val || "")}" ${F(sec, i, field)}${off(lock)}></label>`;

  const textF = (sec, i, field, val, label, ph, list, lock) => `
    <label class="f${lock ? " is-off" : ""}"><span>${esc(label)}</span>
      <input type="text" value="${esc(val || "")}" placeholder="${esc(ph || "")}"
             ${list ? `list="${esc(list)}" autocomplete="off"` : ""} ${F(sec, i, field)}${off(lock)}></label>`;

  /* GRADES ARE WHOLE NUMBERS (round 5). step=1 on every grade box, and a
     fractional value is never silently rounded: the row says the value is not
     a whole number and offers the rounding as an act.
     ROUND 5b — THE OFFER IS LIVE. The note used to be drawn once, at render
     time, so it existed only for a fraction that was already STORED: a student
     who TYPED 62.5 was refused on save and told to press a "Round to 63%"
     button that was nowhere on the row. It now appears on the keystroke that
     makes the value fractional and leaves on the one that does not — the same
     wording, the same button, on the student form and the CO's alike (they
     are one form). */
  function fixnoteHTML(sec, i, field, val) {
    const n = Number(val);
    if (val === null || val === undefined || val === "" ||
        !isFinite(n) || n === Math.round(n)) return "";
    return `Grades are whole numbers &mdash; <b>${esc(val)}%</b> is not one.
      <button type="button" class="btn btn-sm" data-round="${esc(sec)}:${i}:${esc(field)}"
        >Round to ${esc(Math.round(n))}%</button>`;
  }
  const gradeF = (sec, i, field, val, label, req, lock) => {
    const fx = fixnoteHTML(sec, i, field, val);
    return `
    <label class="f${lock ? " is-off" : ""}"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0-100"
             value="${val === null || val === undefined || val === "" ? "" : esc(val)}"
             ${F(sec, i, field)}${off(lock)}>
      ${fx ? `<span class="fixnote">${fx}</span>` : ""}</label>`;
  };

  /* ── ONE PICKER, five uses (round 5) ──────────────────────────────────────
     A real <select> over a CLOSED list, with an "Other…" option that reveals
     a free-text box beside it. This is what makes an impossible pair — the
     Instrument track with a Contact sortie — unreachable rather than merely
     unlikely: the list only ever holds what the chosen category allows.
     Field markers: "@x" is the select of x, "~x" its free-text box; the UI
     flag _o_x remembers that the student chose to type it themselves.
     groups = [{label?, items:[{v, t, tip?}]}] */
  const PICK_OTHER = "__other__";
  function pickerF(sec, i, e, field, label, groups, o) {
    const O = o || {};
    const raw = e[field];
    const val = raw === null || raw === undefined ? "" : String(raw);
    const flat = [];
    for (const g of groups) for (const it of g.items) flat.push(it);
    const inList = flat.some((x) => x.v === val);
    const free = !!O.free && (!!e["_o_" + field] || (!!val && !inList));
    const opt = (it) => `<option value="${esc(it.v)}"${!free && val === it.v ? " selected" : ""}${
      it.tip ? ` title="${esc(it.tip)}"` : ""}>${esc(it.t)}</option>`;
    const body = groups.map((g) => g.label
      ? `<optgroup label="${esc(g.label)}">${g.items.map(opt).join("")}</optgroup>`
      : g.items.map(opt).join("")).join("");
    return `
      <label class="f"><span>${esc(label)}${O.req ? " *" : ""}</span>
        <select ${F(sec, i, "@" + field)}${O.disabled ? " disabled" : ""}>
          <option value=""${!val && !free ? " selected" : ""}>${esc(O.ph || "— choose —")}</option>
          ${body}
          ${O.free ? `<option value="${PICK_OTHER}"${free ? " selected" : ""}>${
            esc(O.otherLabel || "Other… (type it)")}</option>` : ""}
        </select>
        ${free ? `<input type="text" class="freein" value="${esc(val)}"
                    placeholder="${esc(O.freePh || "type it")}" ${F(sec, i, "~" + field)}
                    aria-label="${esc(label)} — typed">` : ""}
        ${O.note ? `<span class="fnote">${O.note}</span>` : ""}</label>`;
  }

  /* NFS reason — the six printed causes of the ΦΜΠ (form Α0473). English
     labels; the Greek of the printed line rides in each option's tooltip and
     is shown verbatim under the box once a cause is chosen. */
  function reasonF(i, e) {
    const r = WA.nfsReason(e.reason);
    return pickerF("nfs", i, e, "reason", "Reason",
      [{ items: WA.NFS_REASONS.map((x) => ({ v: x.id, t: x.label, tip: x.el })) }],
      { req: true, ph: "— why was the flight not flown? —",
        note: r ? `<span title="Printed verbatim on form Α0473 «ΦΥΛΛΟ ΜΗ ΠΤΗΣΗΣ ΜΑΘΗΤΗ – ΕΚΠΑΙΔΕΥΟΜΕΝΟΥ», 3-01 ΚΕΦ.9">${esc(r.el)}</span>` : "" });
  }

  /* one sortie of ONE track — the FAIL / ALMOST GOOD flight code */
  function codeF(sec, i, e) {
    const cat = WA.itemCat(e.category) ? e.category : "";
    const list = cat ? WA.sorties(cat) : [];
    return pickerF(sec, i, e, "flight_code", "Flight code",
      [{ items: list.map((s) => ({
           v: s.c, t: s.c + " — " + s.n + (s.b === "fs" ? " (simulator)" : "") + (s.k ? " — checkride" : ""),
           tip: s.n })) }],
      { free: true, disabled: !cat,
        ph: cat ? "— which sortie of " + WA.itemCatLabel(cat) + "? —" : "— choose the track first —",
        otherLabel: "Other… (type the code)", freePh: "e.g. C4302",
        note: codeNoteHTML(e.category, WA.normCode(e.flight_code)) });
  }

  /* any sortie of the stage, checkrides included — the FPC / CEF trigger */
  const TRIGGER_GROUPS = WA.TRACKS.map((t) => ({
    label: WA.itemCatLabel(t),
    items: WA.sorties(t).map((s) => ({
      v: s.c, t: s.c + " — " + s.n + (s.b === "fs" ? " (simulator)" : "") + (s.k ? " — checkride" : ""),
      tip: s.n })),
  }));
  function triggerF(sec, i, e) {
    return pickerF(sec, i, e, "flight_code", "Due to which stage flight",
      TRIGGER_GROUPS,
      { free: true, ph: "— which flight triggered it? —",
        otherLabel: "Other… (type the code)", freePh: "e.g. C4590" });
  }

  /* AIRSICKNESS — THE FLIGHT IT HAPPENED ON (round 6). Airsickness does not
     respect the syllabus, so the picker offers EVERY sortie of the stage, the
     four tracks grouped, plus the same "Other…" escape the other pickers have.
     The phase-of-flight note it replaces is gone from the form: what is
     already stored is shown greyed under the row, as legacy information.
     ROUND 6b — REQUIRED, hence the asterisk: an airsickness event with no
     sortie on it is a date and a name, and no pattern can be read out of it.
     The server refuses the same row in the same words. */
  function airFlightF(i, e) {
    return pickerF("airsickness", i, e, "flight_code", "Flight",
      TRIGGER_GROUPS,
      { free: true, req: true, ph: "— on which flight? —",
        otherLabel: "Other… (type the code)", freePh: "e.g. C4302" });
  }

  /* which sortie of THIS Training Section was flown solo (the syllabus names
     the candidates; free text stays open because reality does too) */
  function soloSortieF(i, e, slot) {
    return pickerF("solo_flights", i, e, "sortie", "Sortie flown solo",
      [{ items: (slot.codes || []).map((c) => {
           const s = WA.sortieOf(c);
           return { v: c, t: c + (s ? " — " + s.n : ""), tip: s ? s.n : "" };
         }) }],
      { free: true, ph: "— which sortie? —", otherLabel: "Other… (type the code)",
        freePh: "e.g. " + ((slot.codes || [])[0] || "C4802") });
  }

  /* flown / not flown — the one badge that says what a fixed slot is.
     ROUND 8: there is no third state. An empty slot IS the not-yet-flown
     state; it never needed a flag of its own.
     ROUND 11 adds the ONE case where an empty slot row does not mean "never
     flown": a checkride that was failed and whose RE-FLY has just been opened.
     The slot row is empty because the re-fly has not been recorded yet, while
     the attempt above it is very much flown, and a badge reading "not flown
     yet" over a checkride the student has already sat would be a lie of
     exactly one word. `waiting` carries that case and nothing else. */
  function slotBadge(sec, i, flown, waiting) {
    if (!flown && waiting) {
      return `<span class="badge badge-warn" data-slotbadge="${esc(sec)}:${i}"
        title="This checkride has been flown and did not pass — this row is the RE-FLY, and it has not been recorded yet"
        >re-fly not recorded yet</span>`;
    }
    return `<span class="badge ${flown ? "badge-good" : ""}" data-slotbadge="${esc(sec)}:${i}"
      title="${esc(flown ? "Flown — the details below are recorded"
                        : "This syllabus slot has not been flown yet")}"
      >${flown ? "flown" : "not flown yet"}</span>`;
  }

  /* CEF — who conducted it: DO · Squadron CO · the squadron's instructors ·
     typed. A CEF is flown with a Squadron Evaluator, so the list stays open.
     ROUND 9 — ONE BOX WITH A LIST BEHIND IT, like every other name on this
     form. The round-5 shape here was a <select> whose escape was a second
     step ("Other…" → a box appears → type), which for a field whose list was
     never closed is two acts where the squadron does one. The list is now the
     two appointments followed by the active instructors' surnames, offered as
     a datalist: choosing is a tap, typing a name nobody has listed is just
     typing it. Nothing about what is STORED changed — one string, normalised
     by WA.normLine on save, exactly as before. */
  function evaluatorF(sec, i, e) {
    return textF(sec, i, "evaluator", e.evaluator, "Evaluator",
                 INS.length ? "choose or type" : "surname or appointment", "dl-eval");
  }

  /* ── THE FPC TRIGGER — WHY THE LIST IS NOT THE EIGHT CHECKRIDES (round 11) ─
     THE QUESTION ASKED (verbatim): «οι fpc γίνονται triggered μόνο από
     αξιολογήσεις;» THE ANSWER FROM THE REGULATION: no. An FPC is not defined
     by the flight that came before it — it is defined by the REFERRAL CASE
     (λόγος παραπομπής) of ΠΔ 29/2020 Άρθρο 3. Παρ.3 sends cases 1α · 1β · 1γ ·
     1δ to a Δοκιμή Προόδου in the air with the ΑΕ of the squadron and case 1ε
     to one IN THE SIMULATOR, and only ONE of those five (1β) is a checkride:
       1α  dangerous handling on ANY sortie, discipline not the cause
       1β  0-59 % in a πτήση εξέτασης ή αξιολόγησης     ← the eight checkrides
       1γ  after the stage's first 4 sorties: 0-49 % twice running, or
           0-59 % three times running — ORDINARY sorties
       1δ  0-59 % on >= 40 % of the Pre-SOLO phase or >= 20 % of the stage
       1ε  the SIMULATOR thresholds — and its FPC is flown in the simulator
     Three more paths arrive from elsewhere: a failed CEF re-flown badly
     (3-01 ΚΕΦ.2 §30ζ), a failed first solo (§56), a third consecutive F/S
     failure (§30στ → «Δοκιμή Προόδου στον εξομοιωτή»), and ΠΔ 29/2020 Άρθρο 3
     παρ.17β prescribes an «κατ' εξαίρεση πτήση Δοκιμής Προόδου» after a
     favourable Board — an FPC with NO triggering sortie at all.
     SO THE PICKER IS UNCHANGED: every sortie of the stage, all four tracks,
     the simulator sorties among them, free text still open, and the field
     stays OPTIONAL because παρ.17β describes an FPC that has no trigger. What
     round 11 adds is the RULE, written under the box, so the person filling it
     in knows why the list is as wide as it is. */
  const FPC_TRIGGER_NOTE =
    "An FPC follows the referral case, not a kind of flight (ΠΔ 29/2020 Άρθρο 3): " +
    "dangerous handling on any sortie (1α) · 0-59 % on a checkride (1β) · consecutive low grades " +
    "on ordinary sorties (1γ) · the 40 % / 20 % ratio of the phase or the stage (1δ) · the " +
    "simulator thresholds, whose FPC is flown in the simulator (1ε). So it may be any sortie — " +
    "and after a favourable Board it may follow none at all (παρ.17β): leave this empty then.";
  function fpcTriggerF(i, e) {
    return pickerF("fpc", i, e, "flight_code", "Due to which stage flight",
      TRIGGER_GROUPS,
      { free: true, ph: "— which flight triggered it? —",
        otherLabel: "Other… (type the code)", freePh: "e.g. C4590",
        note: `<span title="${esc("ΠΔ 29/2020 Άρθρο 3 παρ.1 και παρ.3 — digitised in FDMS " +
          "data/requirements/failure_procedures.json as fail-23 (παρ.3), fail-75 (1α), fail-16 " +
          "(1β), fail-76 (1γ), fail-77 (1δ), fail-40 (1ε), fail-70 (παρ.17β)")}">${
          esc(FPC_TRIGGER_NOTE)}</span>` });
  }

  /* the FPC result a record already holds — read-only, never a box (round 11) */
  function fpcResultLegacy(e) {
    if (!String((e && e.result) || "").trim()) return "";
    return `<p class="legnote" title="${esc(WA.FPC_RESULT_TIP)}">Result &mdash;
      <b>${esc(e.result)}</b>. This box was removed: an FPC's result is its
      <b>grade</b> against the printed scale (60 % and above is the successful
      characterisation). What you wrote is kept here exactly as it stands and counts for
      nothing; it can be dropped, and it cannot be written again.</p>`;
  }

  /* FPC — EXACTLY TWO OPTIONS (round 6): the Squadron CO or the DO. No
     instructor surnames, no "Other…", no free text. A value stored before the
     rule is not thrown away — it is named under the box and the row asks
     which of the two it actually was, refusing to save until it is told. */
  function fpcEvaluatorF(i, e) {
    const bad = !WA.fpcEvaluatorOK(e.evaluator);
    return pickerF("fpc", i, e, "evaluator", "Evaluator",
      [{ items: WA.FPC_EVALUATORS.map((v) => ({ v, t: v })) }],
      { ph: "— who conducted it? —",
        note: bad
          ? `<span class="warn-t" title="An FPC is conducted by the Squadron CO or the DO — the round-5 form also offered the instructors, and this entry kept one of those values">legacy evaluator &ldquo;${
              esc(e.evaluator)}&rdquo; &mdash; an FPC is conducted by the Squadron CO or the DO: choose which one</span>`
          : "An FPC is conducted by the Squadron CO or the DO." });
  }

  /* SMS (ΚΕΠΕ) entry condition — the six printed thresholds of 3-01 ΚΕΦ.2
     §32β plus the Squadron CO / DO discretion of its opening sentence. English
     labels; the Greek of the printed line rides in each option's tooltip and
     is shown verbatim under the box once a condition is chosen. */
  function smsReasonF(i, e) {
    const r = WA.smsReason(e.reason);
    return pickerF("sms", i, e, "reason", "Entry condition",
      [{ items: WA.SMS_REASONS.map((x) => ({ v: x.id, t: x.label, tip: x.el })) }],
      { req: true, ph: "— under which condition was he put in SMS? —",
        note: r ? `<span title="${esc("Printed verbatim in " + WA.SMS_SOURCE)}">${esc(r.el)}</span>` : "" });
  }

  const rmB = (sec, i) =>
    `<button type="button" class="rm" data-rm="${esc(sec)}" data-idx="${i}">&#10005; remove</button>`;

  const insF = (sec, i, field, val, label, lock) =>
    textF(sec, i, field, val, label, INS.length ? "choose or type" : "type the surname", "dl-ins", lock);

  /* ── EVALUATIONS FOLLOW THE SYLLABUS ORDER (round 6) ──────────────────────
     Which checkride, if any, has to be recorded before this one may be. Read
     from the live form state, so a date typed into C4590 opens C4790 on the
     next redraw without a save.
     MIRROR: WA.evalOrderState / the evaluations block of wa.validate_record. */
  function evalBlocker(id) {
    return WA.evalOrderState(S.data).blockedBy[id] || null;
  }

  /* ── WHICH ATTEMPT ACTUALLY COUNTS (round 11) ─────────────────────────────
     The form lists the attempts at one checkride in date order, so the syllabus
     slot header sits on the LAST of them. That is a layout, not a verdict:
     since round 11 the attempt every comparison uses is the one the flight was
     characterised SUCCESSFUL on, which may well be the row above. So each
     attempt row says plainly whether it is the one that counts — the badge is
     computed here, from the live form state, by the same helper the dashboard
     uses (WA.evalOperativeOf), so the form and the brief cannot disagree.
       → { C4590: <index of the operative row>, … } */
  function evalOpIndex() {
    const rows = WA.evalRows(S.data);
    const out = {};
    for (const d of WA.EVALUATIONS) {
      const r = WA.evalOperativeOf(rows, d.id).row;
      if (r) out[d.id] = r.i;
    }
    return out;
  }
  /* ── THE RE-FLY (round 11) ────────────────────────────────────────────────
     Until this round the form COULD NOT record a re-flown checkride. The eight
     evaluations are a fixed section with no "+ Add", so a student whose C4590
     was failed and flown again had exactly one place to put the second grade:
     on top of the first one — which destroys the failure the whole referral
     chain of ΠΔ 29/2020 hangs on, and makes the pass-attempt rule the command
     asked for unreachable on any record made from here on.
     So the section gains ONE act, and it is a RULED EXCEPTION in the round-6
     sense: not "+ Add an evaluation" (nobody may invent a ninth checkride),
     but "record the re-fly of THIS checkride" — offered only where the
     regulation says a re-fly comes from, i.e. an attempt that did not pass
     (ΠΔ 29/2020 Άρθρο 3 παρ.1β: 0-59 % in a πτήση εξέτασης ή αξιολόγησης is
     the referral case). It appends one more attempt at the SAME checkride id;
     the failed one stays exactly where it is, visible and marked. */
  function flownAttempts(id) {
    return (S.data.evaluations || [])
      .filter((x) => x.evaluation === id && !WA.slotEmpty("evaluations", x)).length;
  }
  /* "does this checkride currently stand on a PASS?" — the one bit the live
     re-fly offer and the attempt badges hang on. null for a row with no
     checkride identity, so a change on an unidentified import triggers
     nothing. */
  function e_passState(id) {
    if (!WA.evalById(id)) return null;
    return WA.evalOperativeOf(WA.evalRows(S.data), id).passed;
  }
  function reflyButton(e, opIx) {
    if (!e.evaluation) return "";
    const rows = WA.evalRows(S.data);
    const op = WA.evalOperativeOf(rows, e.evaluation);
    /* only after a graded attempt that did NOT pass, and only while no empty
       re-fly row is already open for this checkride */
    if (!op.row || op.row.grade === null || op.passed) return "";
    const open = (S.data.evaluations || [])
      .some((x) => x.evaluation === e.evaluation && WA.slotEmpty("evaluations", x));
    if (open) return "";
    return `<div class="addrow"><button type="button" class="btn btn-sm btn-add"
      data-refly="${esc(e.evaluation)}"
      title="${esc("This checkride was graded " + op.row.grade + " % — " +
        WA.gradeBandText(op.row.grade) + ". Recording the re-fly adds ANOTHER attempt at " +
        e.evaluation + " and keeps this one exactly as it is: the grade that counts becomes the " +
        "attempt the flight was characterised successful on.")}"
      >+ Record the re-fly of ${esc(e.evaluation)}</button>
      <span class="hint">It did not pass (${esc(WA.gradeBandText(op.row.grade))}) &mdash; the
        re-fly is a second attempt, and this one stays on the record.</span></div>`;
  }

  /* the badge one attempt row wears — nothing at all when the checkride was
     flown once, because a single attempt needs no explanation */
  function attemptBadge(e, i, opIx, n) {
    if (!e.evaluation || n < 2) return "";
    const counts = opIx[e.evaluation] === i;
    const g = e.grade;
    return counts
      ? `<span class="badge badge-good" title="${esc(WA.PASS_ATTEMPT_TIP)}">${
          WA.gradePassed(g) ? "counts — the successful attempt" : "counts — no attempt has passed yet"}</span>`
      : `<span class="badge" title="${esc(WA.PASS_ATTEMPT_TIP)}">not counted${
          WA.gradeBand(g) ? " · " + esc(WA.gradeBand(g).code) + " " + esc(WA.gradeBand(g).label) : ""}</span>`;
  }

  /* ── evaluation identity: the eight checkrides of the stage ── */
  const EV_GROUPS = WA.EVAL_CATS.filter((c) => c.id !== "fpc").map((c) => ({
    label: c.label, list: WA.evalsOfCat(c.id),
  }));
  const evalF = (i, val) => `
    <label class="f"><span>Evaluation *</span>
      <select ${F("evaluations", i, "evaluation")}>
        <option value=""${val ? "" : " selected"}>&mdash; which checkride? &mdash;</option>
        ${EV_GROUPS.map((g) => `<optgroup label="${esc(g.label)}">${g.list.map((d) =>
          `<option value="${esc(d.id)}"${val === d.id ? " selected" : ""}>${esc(WA.evalLabel(d.id))}</option>`
        ).join("")}</optgroup>`).join("")}
      </select></label>`;

  /* ── FAIL / ALMOST GOOD: category → flight code → items[] multi-select ── */
  const ITEM_CATS = (typeof WA_ITEMS === "object" && WA_ITEMS && Array.isArray(WA_ITEMS.categories))
    ? WA_ITEMS.categories : [];

  function catF(sec, i, e) {
    return `
      <label class="f"><span>Category *</span>
        <select ${F(sec, i, "category")}>
          <option value=""${e.category ? "" : " selected"}>&mdash; choose the track &mdash;</option>
          ${ITEM_CATS.map((c) =>
            `<option value="${esc(c.id)}"${e.category === c.id ? " selected" : ""}>${esc(c.label)}</option>`).join("")}
          ${e.category === "other"
            ? `<option value="other" selected>Other (legacy entry — please choose a track)</option>` : ""}
        </select></label>`;
  }

  /* SYLLABUS ONLY (round 6) — the list ends where the printed gradesheet does.
     The "Other… (type it yourself)" option is gone: an item nobody else can
     have is an item nobody can compare, count across the class or look up in
     the MIF, and every surface that shows items was quietly showing two kinds
     of thing. Nothing was lost with it — what is already stored is READ,
     marked, and asked to be replaced. */
  function itemOptions(catId) {
    const cat = WA.itemCat(catId);
    /* Round 9 residual (verify item D) — with no track chosen the select used
       to render zero options: a blank grey control saying nothing. It now says
       what to do first. */
    if (!cat) return `<option value="" selected disabled>&mdash; choose the track first &mdash;</option>`;
    return `<option value="" selected>&mdash; add an item &mdash;</option>` +
      cat.items.map((it) =>
        `<option value="${esc(it.name)}">${esc((it.n ? it.n + " — " : "") + it.name)}</option>`).join("");
  }

  /* the multi-select block of ONE row — re-rendered on its own so adding an
     item never redraws the whole section under the student's fingers */
  function msHTML(sec, i, e) {
    const chips = (e.items || []).map((n, k) => {
      const known = WA.itemKnown(e.category, n);
      return `
      <span class="mschip${known ? "" : " is-legacy"}"
            title="${esc(known ? WA.itemText(e.category, n) : WA.ITEM_LEGACY_TIP)}">${
        esc(WA.itemText(e.category, n))}${known ? "" : ` <span class="k">legacy</span>`}
        <button type="button" class="x" data-msrm="${esc(sec)}:${i}:${k}"
                aria-label="Remove ${esc(n)}">&#10005;</button></span>`;
    }).join("");
    const stale = WA.itemsLegacy(e).length;
    return `
      <div class="ms-chips">${WA.itemsN(e) > 1
          ? `<span class="ms-n">${esc(WA.itemsCount(e))}</span>` : ""}${
        chips || `<span class="ms-none">no item chosen yet</span>`}</div>
      ${stale ? `<p class="ms-legacy">${stale === 1
          ? "One item was typed by hand before the syllabus list existed"
          : stale + " items were typed by hand before the syllabus list existed"}
        &mdash; remove ${stale === 1 ? "it" : "them"} and choose the matching
        ${esc(WA.itemCatLabel(e.category))} item${stale === 1 ? "" : "s"} below.
        This entry cannot be saved until ${stale === 1 ? "it is" : "they are"} replaced.</p>` : ""}
      ${/* ROUND 9 — THE FILTER BOX IS GONE. A box that says "filter items"
           beside a box that says "add an item" reads as two ways to enter an
           item, and the squadron's own reading of it was that it would confuse
           more than it helped: the one thing typing into it could never do was
           put an item on the row. The select below is the whole of the act,
           and it is the syllabus list of the chosen track in printed order —
           the browser's own type-to-jump still finds a name inside it. */ ""}
      <select class="ms-add" data-msadd="${esc(sec)}:${i}" aria-label="Add an item">
        ${itemOptions(e.category)}
      </select>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ROUND 12 — THE LOG TABLES.
     «Για αρχη προσθεσε για καθε μαθητη ανα κατηγορια ενα πινακα στο τελος οπου
      θα εχει ολες τις πτησεις. contact, ημερομηνια, instructor, duration,
      grade or non graded (δεκτο το null, γιατι καποιες φορες αργει το
      debriefing). 4+4 πινακες για f/s και flights. ομοιως τα μαθηματα και τα
      exams.»
     Four sections, ten blocks: the band IS the section (flights / fs), the
     track is on the row, and the pair is one table. NOTHING IS PRE-SEEDED —
     the syllabus list is what a flight is CHOSEN FROM, never a skeleton of 133
     rows, so an unflown sortie stays what it is: not an entry.
     ══════════════════════════════════════════════════════════════════════════ */

  /* the flight identity — the directive's first column. The list is the
     table's own (band, track) in FLOW-CHART order, minus the eight checkrides
     (they live in Evaluations). Free text is always accepted: the syllabus
     data may lag reality and a record must never become unstorable. */
  function logSortieF(sec, i, e) {
    const track = e.track || "";
    const list = track ? WA.logPickList(sec, track) : [];
    const off = WA.kindOffCatalogue(e.kind);
    return pickerF(sec, i, e, "sortie", "Flight",
      [{ items: list.map((s) => ({
           v: s.c,
           t: s.c + " — " + s.n + (s.nt ? " (night)" : ""),
           tip: "Training Section " + s.g + (s.h ? " · syllabus " + s.h + " h" : "") })) }],
      { free: true, req: true,
        ph: off ? "— type what was flown —" : "— which sortie? —",
        otherLabel: "Other… (type the code)",
        freePh: off ? "e.g. FCF profile 2" : "e.g. C4302",
        note: logSortieNoteHTML(sec, e) });
  }

  /* the live verdict under a TYPED flight code — the same three answers the
     server gives, said before the save instead of after it. An fcf / cef /
     other row is off-catalogue BY NATURE, so it is never marked as a surprise. */
  function logSortieNoteHTML(sec, e) {
    const code = WA.normCode(e.sortie);
    if (!code) return "";
    const t = WA.codeTrack(code);
    if (t && e.track && t !== e.track) {
      return `<span class="warn-t" title="The letter of a Phase II sortie code names its track — this pair contradicts itself and is refused on save">${
        esc(code)} belongs to the ${esc(WA.itemCatLabel(t))} table</span>`;
    }
    const b = WA.sortieBand(code);
    if (b && b !== sec) {
      return `<span class="warn-t" title="Nothing derives the aircraft/simulator split from a code — the generated flow-chart catalogue is the only authority, and where it knows the code it is a fact">${
        esc(code)} is ${b === "fs" ? "a SIMULATOR sortie — record it under F/S"
                                   : "an AIRCRAFT sortie — record it under Flights"}</span>`;
    }
    if (WA.EVAL_ORDER.indexOf(code) >= 0) {
      return `<span class="warn-t" title="Two rows for one flight would be two grades that can disagree">${
        esc(code)} is a checkride — record it in the Evaluations section, where the syllabus order applies to it</span>`;
    }
    if (WA.kindOffCatalogue(e.kind)) return "";
    if (!WA.logSortieKnown(sec, e.track, code)) {
      return `<span class="warn-t" title="Not in the generated syllabus catalogue — it is saved as typed and shown marked. If it was an FCF, a CEF or something else outside the flow chart, say so in “Kind” and this note goes away.">not in the syllabus catalogue</span>`;
    }
    return "";
  }

  /* DURATION — DECIMAL HOURS, ONE DECIMAL (0.1 h = 6 min). The box is text and
     not number, so 1:20 can be TYPED — and the offer to convert it appears on
     that keystroke, in the exact idiom the grade box uses for a fractional
     value. Nothing is converted silently. */
  function durParse(v) {
    const s = WA.normLine(v);
    if (!s) return { empty: true };
    const hm = /^(\d{1,2}):([0-5]?\d)$/.exec(s);
    if (hm) return { hm: true, dec: Math.round((Number(hm[1]) + Number(hm[2]) / 60) * 10) / 10 };
    const n = Number(s.replace(",", "."));
    if (!isFinite(n)) return { bad: true };
    return { dec: n, exact: n === Math.round(n * 10) / 10 };
  }
  function durnoteHTML(sec, i, val) {
    const p = durParse(val);
    if (p.empty) return "";
    if (p.hm) {
      return `<b>${esc(WA.normLine(val))}</b> is ${esc(p.dec)} decimal hours &mdash;
        the log is kept in hours, not hours and minutes.
        <button type="button" class="btn btn-sm" data-dur="${esc(sec)}:${i}:${esc(p.dec)}"
          >Use ${esc(p.dec)}</button>`;
    }
    if (p.bad) {
      return `<span class="warn-t">that is not a duration &mdash; type decimal hours (1.3) or h:mm (1:20)</span>`;
    }
    if (!p.exact) {
      const r = Math.round(p.dec * 10) / 10;
      return `Duration is recorded to one decimal (6-minute steps) &mdash;
        <b>${esc(p.dec)}</b> is not.
        <button type="button" class="btn btn-sm" data-dur="${esc(sec)}:${i}:${esc(r)}"
          >Round to ${esc(r)}</button>`;
    }
    return "";
  }
  function durF(sec, i, e) {
    const note = durnoteHTML(sec, i, e.duration);
    const hint = e.sortie ? WA.sortieHours(sec, e.track, e.sortie) : null;
    return `
      <label class="f"><span>Duration (h)</span>
        <input type="text" inputmode="decimal" value="${esc(e.duration === null || e.duration === undefined ? "" : e.duration)}"
               placeholder="${esc(hint ? "syllabus " + hint : "e.g. 1.3")}"
               ${F(sec, i, "duration")}>
        ${note ? `<span class="fixnote">${note}</span>` : ""}</label>`;
  }

  /* THE KIND — «να αφησουμε placeholder για τυχον fcf, cef, repeat». */
  function kindF(sec, i, e) {
    const k = WA.flightKind(e.kind) || WA.flightKind("syllabus");
    return pickerF(sec, i, e, "kind", "Kind",
      [{ items: WA.FLIGHT_KINDS.map((x) => ({ v: x.id, t: x.label, tip: x.tip })) }],
      { ph: "— syllabus —", note: k ? esc(k.tip) : "" });
  }

  /* THE VERDICT — drawn ONLY where there is no grade, because that is the only
     place it may live. It is how a pass/lag/fail the squadron's scheduler
     recorded WITHOUT a percentage reaches this record: without it, a FAIL the
     squadron knows about would be indistinguishable from a flight still
     waiting for its debrief — a failure invisible in the record that exists to
     show it. Supply the number later and the verdict is read from it instead. */
  function verdictF(sec, i, e) {
    return pickerF(sec, i, e, "verdict", "Or a verdict with no number",
      [{ items: WA.VERDICTS.map((v) => ({ v: v.id, t: v.label + " — " + v.el, tip: v.tip })) }],
      { ph: "— none —",
        note: "Only for a flight the squadron characterised without a percentage. Type a grade above and the verdict is read from it." });
  }

  /* the one-line summary that makes the row read as a TABLE ROW: the flight,
     the date, the instructor, the duration and the grade — the directive's own
     columns — with the kind and seq tags beside them when they say something. */
  function logHeadHTML(sec, i, e) {
    const kind = WA.flightKind(e.kind);
    const seq = Number(e.seq || 1);
    const v = WA.rowVerdict(e);
    const gradeCell = e.ng
      ? `<span class="badge">NG</span>`
      : (e.grade !== null && e.grade !== undefined && e.grade !== "" && isFinite(Number(e.grade))
          ? `<b>${WA.pct(e.grade)}</b>`
          : (v ? `<span class="badge badge-warn" title="${esc((WA.verdict(v) || {}).tip || "")}">${esc(WA.verdictLabel(v))}</span>`
               : WA.debriefChip(e)));
    return `
      <div class="logline">
        <span class="lg-c" title="${esc(WA.logSortieLabel(sec, e.track, e.sortie, e.kind))}">${
          esc(WA.normCode(e.sortie) || "—")}</span>
        ${kind && kind.id !== "syllabus"
          ? `<span class="badge badge-acc" title="${esc(kind.tip)}">${esc(kind.label)}</span>` : ""}
        ${seq > 1
          ? `<span class="badge" title="The ${esc(seq)}${esc(seq === 2 ? "nd" : seq === 3 ? "rd" : "th")} flight of this sortie on this date — a deliberate same-day re-fly, not a duplicate">#${esc(seq)}</span>` : ""}
        <span class="lg-d">${esc(e.date ? fmtD(e.date) : "no date")}</span>
        <span class="lg-i">${esc(WA.normLine(e.instructor) || "—")}</span>
        <span class="lg-h">${e.duration === null || e.duration === undefined || e.duration === ""
          ? "" : esc(e.duration) + " h"}</span>
        <span class="lg-g">${gradeCell}</span>
      </div>`;
  }

  function logRow(sec, i, e) {
    const ng = !!e.ng;
    const hasGrade = e.grade !== null && e.grade !== undefined && e.grade !== "" &&
                     isFinite(Number(e.grade));
    return `
      ${logHeadHTML(sec, i, e)}
      <div class="rgrid2">
        ${logSortieF(sec, i, e)}
        ${dateF(sec, i, "date", e.date, "Date", true)}
      </div>
      <div class="rgrid2">
        ${insF(sec, i, "instructor", e.instructor, "Instructor *")}
        ${durF(sec, i, e)}
      </div>
      <div class="f"><span>Grading</span>
        <span class="chiprow segrow">
          <button type="button" class="chip${ng ? "" : " is-on"}" data-ng="${esc(sec)}:${i}:0"
                  aria-pressed="${ng ? "false" : "true"}">Graded&nbsp;%</button>
          <button type="button" class="chip${ng ? " is-on" : ""}" data-ng="${esc(sec)}:${i}:1"
                  aria-pressed="${ng ? "true" : "false"}">NG (non-graded)</button>
        </span></div>
      <div class="rgrid2">
        ${ng
          ? `<div class="f"><span>&nbsp;</span><span class="hint">Non-graded by nature &mdash; nobody
               was in a position to score it. Who flew it or authorised it still goes on the row.</span></div>`
          : gradeF(sec, i, "grade", e.grade, "Grade (%)")}
        ${ng || hasGrade ? kindF(sec, i, e) : verdictF(sec, i, e)}
      </div>
      ${ng || hasGrade ? "" : `<div class="rgrid2">${kindF(sec, i, e)}<div></div></div>`}
      ${!ng && !hasGrade && !WA.verdict(e.verdict)
        ? `<p class="hint">${WA.debriefChip(e) ||
             "Leave the grade empty until the debrief lands — the row is complete without it."}
           ${e.date ? "The flight is recorded; only its grade is missing." : ""}</p>` : ""}
      ${textF(sec, i, "note", e.note, "Note (optional)", "anything worth remembering")}
      <div class="rfoot">
        <button type="button" class="btn btn-sm" data-refly2="${esc(sec)}:${i}"
          title="A second turn on the same sortie on the SAME DAY. It is a real thing and it is not a duplicate, so it is a deliberate act: the new row opens with the same flight and date and the next sequence number.">+ same-day re-fly</button>
        ${rmB(sec, i)}</div>`;
  }

  /* ── GROUND LESSONS ────────────────────────────────────────────────────── */
  function lessonGroupF(i, e) {
    return pickerF("lessons", i, e, "group", "Group",
      [{ items: WA.groundGroups().map((g) => ({
           v: g.g, t: g.g + " — " + g.name,
           tip: g.name + " · " + (g.p === null ? "?" : g.p) + " periods · " +
                g.courses.length + " course" + (g.courses.length === 1 ? "" : "s") })) }],
      { req: true, ph: "— which theory group? —" });
  }
  function lessonCourseF(i, e) {
    const list = e.group ? WA.lessonCourses(e.group) : [];
    return pickerF("lessons", i, e, "course", "Course",
      [{ items: list.map((c) => ({
           v: c.c, t: c.c + " — " + c.n + (c.cond ? " (foreign SPs)" : ""),
           tip: c.n + " · " + c.p + " period" + (c.p === 1 ? "" : "s") +
                (c.cond ? " · supplementary: only for SPs who did not cover it at their Academy" : "") })) }],
      { free: true, disabled: !e.group,
        ph: e.group ? "— which course? —" : "— choose the group first —",
        otherLabel: "Other… (type the code)", freePh: "e.g. IN 201-210",
        note: courseNoteHTML(e) });
  }
  function courseNoteHTML(e) {
    const c = WA.normLine(e.course);
    if (!c || !e.group) return "";
    if (WA.lessonCourse(e.group, c)) return "";
    const home = WA.courseHome(c);
    if (home) {
      return `<span class="warn-t" title="A course is identified by the PAIR (group, course), never by its code alone — OJT is a course of four different groups">${
        esc(c)} is a course of ${esc(home)}</span>`;
    }
    return `<span class="warn-t" title="Not in the generated syllabus catalogue — it is saved as typed and shown marked">not in the syllabus catalogue</span>`;
  }
  function lessonRow(i, e) {
    const g = WA.groundGroup(e.group);
    const c = g ? WA.lessonCourse(e.group, WA.normLine(e.course)) : null;
    return `
      <div class="logline">
        <span class="lg-c" title="${esc(WA.groundGroupLabel(e.group))}">${esc(WA.normLine(e.course) || e.group || "—")}</span>
        ${e.absent ? `<span class="badge badge-warn" title="The class covered this and the student did not — the makeup is owed">absent</span>` : ""}
        <span class="lg-d">${esc(e.date ? fmtD(e.date) : "no date")}${
          e.end_date && e.end_date !== e.date ? " &ndash; " + esc(fmtD(e.end_date)) : ""}</span>
        <span class="lg-i">${esc(WA.normLine(e.instructor) || "—")}</span>
        <span class="lg-h">${e.periods === null || e.periods === undefined || e.periods === ""
          ? `<span class="k" title="Empty means the FULL course — the same meaning the squadron's scheduler gives it">full</span>`
          : esc(e.periods) + " p"}</span>
        <span class="lg-g">${c ? `<span class="k">of ${esc(c.p)}</span>` : ""}</span>
      </div>
      <div class="rgrid2">
        ${lessonGroupF(i, e)}
        ${lessonCourseF(i, e)}
      </div>
      <div class="rgrid2">
        ${dateF("lessons", i, "date", e.date, "Date", true)}
        ${dateF("lessons", i, "end_date", e.end_date, "End date (if it ran several days)")}
      </div>
      <div class="rgrid2">
        <label class="f"><span>Periods covered</span>
          <input type="number" min="0" max="400" step="1" inputmode="numeric"
                 placeholder="the whole course"
                 value="${e.periods === null || e.periods === undefined ? "" : esc(e.periods)}"
                 ${F("lessons", i, "periods")}>
          <span class="fnote">Leave it empty for the FULL course${
            c ? " (" + esc(c.p) + " period" + (c.p === 1 ? "" : "s") + ")" : ""}.</span></label>
        ${insF("lessons", i, "instructor", e.instructor, "Instructor")}
      </div>
      <div class="f"><span>Attendance</span>
        <span class="chiprow segrow">
          <button type="button" class="chip${e.absent ? "" : " is-on"}" data-absent="${i}:0"
                  aria-pressed="${e.absent ? "false" : "true"}">Attended</button>
          <button type="button" class="chip${e.absent ? " is-on" : ""}" data-absent="${i}:1"
                  aria-pressed="${e.absent ? "true" : "false"}">Absent</button>
        </span>
        <span class="fnote">“Absent” says the class covered it and this student did not &mdash; which is
          what makes the makeup visible instead of silent.</span></div>
      ${textF("lessons", i, "note", e.note, "Note (optional)", "anything worth remembering")}
      <div class="rfoot">${rmB("lessons", i)}</div>`;
  }

  /* ── GROUND EXAMS ──────────────────────────────────────────────────────── */
  function examF(i, e) {
    return pickerF("exams", i, e, "exam", "Exam",
      [{ items: WA.examList().map((x) => ({
           v: x.id, t: x.id + " — " + x.name,
           tip: x.name + " · " + (x.p === null ? "?" : x.p) + " period" + (x.p === 1 ? "" : "s") +
                (x.cond ? " · foreign SPs only — a HAF student does not owe it" : "") })) }],
      { req: true, ph: "— which ground exam? —" });
  }
  function examRow(i, e) {
    const x = WA.exam(e.exam);
    const hasGrade = e.grade !== null && e.grade !== undefined && e.grade !== "" &&
                     isFinite(Number(e.grade));
    return `
      <div class="logline">
        <span class="lg-c" title="${esc(WA.examLabel(e.exam))}">${esc(e.exam || "—")}</span>
        ${x && x.cond ? `<span class="badge badge-acc" title="Foreign SPs only — a HAF student does not owe this exam">foreign SPs only</span>` : ""}
        <span class="lg-d">${esc(e.date ? fmtD(e.date) : "no date")}</span>
        <span class="lg-i">${esc(WA.normLine(e.instructor) || "—")}</span>
        <span class="lg-h"></span>
        <span class="lg-g">${hasGrade ? `<b>${WA.pct(e.grade)}</b>` : WA.debriefChip(e)}</span>
      </div>
      <div class="rgrid2">
        ${examF(i, e)}
        ${dateF("exams", i, "date", e.date, "Date", true)}
      </div>
      <div class="rgrid2">
        ${gradeF("exams", i, "grade", e.grade, "Grade (%)")}
        ${insF("exams", i, "instructor", e.instructor, "Examiner")}
      </div>
      ${hasGrade ? "" : `<p class="hint">${WA.debriefChip(e) ||
        "Leave the grade empty until the result is in — the row is complete without it."}</p>`}
      ${textF("exams", i, "note", e.note, "Note (optional)", "anything worth remembering")}
      <div class="rfoot">${rmB("exams", i)}</div>`;
  }

  function failRow(sec, i, e) {
    return `
      <div class="rgrid2">
        ${catF(sec, i, e)}
        ${codeF(sec, i, e)}
      </div>
      <div class="f"><span>Items that missed the desired performance *</span>
        <div class="ms" data-ms="${esc(sec)}:${i}">${msHTML(sec, i, e)}</div>
      </div>
      <div class="rgrid2">
        ${dateF(sec, i, "date", e.date, "Date", true)}
        ${gradeF(sec, i, "grade", e.grade, "Grade (%)")}
      </div>
      <div class="rgrid2">${insF(sec, i, "instructor", e.instructor, "Instructor")}<div></div></div>
      <div class="rfoot">${rmB(sec, i)}</div>`;
  }

  /* ── the sections, in the order the student meets them ── */
  const SECTIONS = [
    { id: "nfs",
      hint: "One entry per NFS (Φύλλο μη Πτήσης), each with its own date and the REASON printed on the sheet itself — form Α0473 lists six causes and you tick one. The count below is calculated from the entries; you never type a number.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("nfs", i, "date", e.date, "Date", true)}
          ${reasonF(i, e)}
        </div>
        ${textF("nfs", i, "note", e.note,
                e.reason === "other" ? "Cause *" : "Note (optional)",
                e.reason === "other"
                  ? "write the cause — this is the «ΑΛΛΗ ΑΙΤΙΑ» line of the sheet"
                  : "anything worth remembering")}
        <div class="rfoot">${rmB("nfs", i)}</div>`,
      blank: () => ({ date: "", reason: "", note: "" }) },

    { id: "sms",
      hint: "One entry per SMS entrance — ΚΕΠΕ, the squadron's special monitoring status. Each entrance names the CONDITION it was raised under: 3-01 ΚΕΦ.2 §32β prints six of them, and the opening sentence of the same paragraph is the Squadron CO / DO decision (which asks for the reduced performance in writing). Leave the exit date empty while the entry is still open.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("sms", i, "entrance_date", e.entrance_date, "Entrance date", true)}
          ${smsReasonF(i, e)}
        </div>
        <div class="rgrid2">
          ${dateF("sms", i, "exit_date", e.exit_date, "Exit date (if closed)")}
          <div></div>
        </div>
        ${textF("sms", i, "note", e.note,
                e.reason === "judgement" ? "Reduced performance the decision was based on *" : "Note (optional)",
                e.reason === "judgement"
                  ? "what fell short — the student is told the reasons (3-01 ΚΕΦ.2 §32δ(2))"
                  : "anything worth remembering")}
        <div class="rfoot"><span class="hint">${e.exit_date ? "closed" : "still open"}</span>${rmB("sms", i)}</div>`,
      blank: () => ({ entrance_date: "", exit_date: "", reason: "", note: "" }) },

    { id: "airsickness",
      hint: "One entry per airsickness event — when it happened, on WHICH FLIGHT and with whom, so the squadron can see the pattern. The flight is required on every entry. (It replaced the free-text phase-of-flight note in round 6; a note already written is kept below the row as legacy information, and the row asks for its flight before the record can be saved again.)",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("airsickness", i, "date", e.date, "Date", true)}
          ${airFlightF(i, e)}
        </div>
        <div class="rgrid2">${insF("airsickness", i, "instructor", e.instructor, "Instructor")}<div></div></div>
        ${txt(e.phase) ? `<p class="oldnote" title="The phase-of-flight note this form used to collect. It is kept as it was written; the squadron now records the FLIGHT instead.">
          <span class="k">legacy note:</span> ${esc(e.phase)}</p>` : ""}
        <div class="rfoot">${rmB("airsickness", i)}</div>`,
      blank: () => ({ date: "", instructor: "", flight_code: "" }) },

    /* ROUND 8 — THE GRADE BOX STARTS WHERE THE CODE DOES. A FAIL is the
       squadron's «ΑΠΟΤΥΧΙΑ» band and an ALMOST GOOD its «ΥΣΤΕΡΗΣΗ», so a new
       row opens at 40 and 50 respectively instead of empty: the student
       corrects a number far more reliably than they supply one. Both stay
       editable and both are still whole-number validated. Only a NEW row is
       prefilled — nothing stored is ever overwritten. */
    { id: "fail",
      hint: "One entry per FAIL: the track, the flight it happened on, the syllabus items that missed the desired performance, the instructor, the date and the grade. A new row opens at grade 40 — change it to what was actually awarded.",
      row: (e, i) => failRow("fail", i, e),
      blank: () => ({ date: "", category: "", flight_code: "", items: [], instructor: "", grade: 40 }) },

    { id: "almost_good",
      hint: "Same detail as a FAIL — the track, the flight, the items, the instructor, the date and the grade. A new row opens at grade 50 — change it to what was actually awarded.",
      row: (e, i) => failRow("almost_good", i, e),
      blank: () => ({ date: "", category: "", flight_code: "", items: [], instructor: "", grade: 50 }) },

    /* ── FIXED SLOTS: the eight stage checkrides, always all eight ──
       ROUND 6 — AND IN SYLLABUS ORDER. A slot whose predecessors have not been
       flown is not merely discouraged: its boxes are DISABLED and it says
       which checkride comes first. The order is WA.EVAL_ORDER, read off the
       printed Training Flow Chart; the server refuses the same fill with the
       same sentence, so the hint is a courtesy and not the guard. */
    { id: "evaluations", fixed: true,
      hint: "The eight checkrides of the stage — every one of them is here from the first day and stays EMPTY until you fly it. Fill in the date, the evaluator and the grade when it happens, IN SYLLABUS ORDER: a checkride cannot be recorded while an earlier one has not been flown. Nothing can be added or removed: that is what lets the squadron compare you with your class on the same flight.",
      row: (e, i, meta) => {
        const m = meta || {};
        const flown = !WA.slotEmpty("evaluations", e);
        const blocker = e.evaluation ? evalBlocker(e.evaluation) : null;
        /* an already-filled row is never frozen — it must stay editable so it
           can be corrected or cleared; only an empty one waits its turn */
        const lock = !!blocker && !flown;
        /* ROUND 11 — how many attempts this checkride holds, and which of them
           is the operative one: the badge on every attempt row comes from that
           and from nothing this section decides for itself */
        const opIx = evalOpIndex();
        const nAtt = e.evaluation
          ? (S.data.evaluations || []).filter((x) => x.evaluation === e.evaluation).length : 0;
        const head = m.slot
          ? `<span class="slot-nm">${esc(WA.evalLabel(e.evaluation))}</span>
             ${slotBadge("evaluations", i, flown,
                         !flown && e.evaluation && flownAttempts(e.evaluation) > 0)}
             ${attemptBadge(e, i, opIx, nAtt)}
             ${blocker ? `<span class="badge badge-warn" title="${esc(
               "Evaluations are flown and recorded in syllabus order — " + WA.EVAL_ORDER.join(" → ") +
               ". " + blocker + " has not been flown yet.")}">complete ${esc(blocker)} first</span>` : ""}`
          : (e.evaluation
              ? `<span class="slot-nm">Another attempt &mdash; ${esc(WA.evalLabel(e.evaluation))}</span>
                 ${attemptBadge(e, i, opIx, nAtt)}
                 ${rmB("evaluations", i)}`
              : `<span class="slot-nm warn-t">Imported evaluation &mdash; which checkride was it?</span>
                 ${rmB("evaluations", i)}`);
        return `
        <div class="slot-h">${head}</div>
        ${m.slot ? "" : evalF(i, e.evaluation)}
        ${blocker ? `<p class="ordnote${flown ? " warn-t" : ""}">${flown
            ? `This checkride is recorded but <b>${esc(blocker)}</b> has not been flown &mdash;
               evaluations follow the syllabus order, so the record cannot be saved until
               ${esc(blocker)} is filled in (or this row is cleared).`
            : `Waiting for <b>${esc(blocker)}</b> &mdash; the checkrides are flown in syllabus
               order (${esc(WA.EVAL_ORDER.join(" → "))}), so this one opens once ${esc(blocker)}
               is recorded.`}</p>` : ""}
        <div class="rgrid2">
          ${insF("evaluations", i, "with", e.with, "With (evaluator)", lock)}
          ${dateF("evaluations", i, "date", e.date, "Date", flown, lock)}
        </div>
        <div class="rgrid2">${gradeF("evaluations", i, "grade", e.grade, "Grade (%)", false, lock)}<div></div></div>
        ${m.slot ? reflyButton(e, opIx) : ""}`;
      } },

    /* ── FIXED SLOTS: the solos the syllabus prescribes ── */
    { id: "solo_flights", fixed: true,
      hint: "The solos of the stage, one row each — they are fixed by the syllabus and stay EMPTY until flown. Fill in the date and then either the grade or NG (non-graded); every flown row names who authorised it. EVERY CONTACT (adaptation) solo opens as NG — nobody is in the other seat to grade them — and the FORMATION solos open graded; either can be switched with one tap. A solo the syllabus did not foresee goes in as an additional solo at the end.",
      row: (e, i, meta) => {
        const m = meta || {};
        const slot = e.slot ? WA.soloSlot(e.slot) : null;
        const flown = !WA.slotEmpty("solo_flights", e);
        /* ROUND 9 — THE ROW OPENS IN THE STATE IT WILL TAKE. Round 8 gave the
           contact solos their NG default in the DATA, applied the first time a
           slot stopped being empty; on screen every unflown contact row still
           showed "Graded %" lit with a grade box beside it, so the student met
           the wrong default before the right one and five of the eight rows
           invited a number nobody can award. `ng` here is what the row DRAWS:
           an empty contact slot draws NG. It stays a default — one tap on
           Graded % answers the row (_ngset) and is never overridden — and it
           writes nothing: the data still takes ng only when the slot stops
           being empty, because WA.slotEmpty counts ng and an unflown slot
           must not start counting as flown. */
        const ng = soloNG(e);
        return `
        <div class="slot-h">
          <span class="slot-nm" title="${esc(WA.soloSlotTip(e.slot))}">${esc(WA.soloSlotLabel(e.slot))}</span>
          ${slot ? slotBadge("solo_flights", i, flown) : ""}
          ${slot && slot.req ? `<span class="badge badge-warn" title="The syllabus REQUIRES this solo">required</span>` : ""}
          ${slot ? "" : rmB("solo_flights", i)}
        </div>
        <div class="rgrid2">
          ${dateF("solo_flights", i, "date", e.date, "Date", flown)}
          ${slot ? soloSortieF(i, e, slot) : `<div class="f"><span>&nbsp;</span>
            <span class="hint">Not one of the syllabus solos — recorded as an extra.</span></div>`}
        </div>
        <div class="f"><span>Grading</span>
          <span class="chiprow segrow"${ng && !e.ng ? ` title="${esc(WA.SOLO_NG_DEFAULT_TIP)}"` : ""}>
            <button type="button" class="chip${ng ? "" : " is-on"}" data-ng="solo_flights:${i}:0"
                    aria-pressed="${ng ? "false" : "true"}">Graded&nbsp;%</button>
            <button type="button" class="chip${ng ? " is-on" : ""}" data-ng="solo_flights:${i}:1"
                    aria-pressed="${ng ? "true" : "false"}">NG (non-graded)</button>
          </span></div>
        ${/* ROUND 6 — THE PERSON IS ON EVERY ROW, NG INCLUDED. NG removes the
             GRADE, never the person: a student does not launch alone on their
             own authority, so the row names whoever AUTHORISED the flight even
             when nobody was in the other seat to score it. ROUND 8 gives that
             one label everywhere — "Authorised by". */ ""}
        <div class="rgrid2">
          ${ng
            ? `<div class="f"><span>&nbsp;</span><span class="hint">Non-graded solo — no grade is
                 recorded; who authorised it still is.</span></div>`
            : gradeF("solo_flights", i, "grade", e.grade, "Grade (%)", flown)}
          ${insF("solo_flights", i, "instructor", e.instructor,
                 "Authorised by" + (flown ? " *" : ""))}
        </div>
        ${ng ? `<p class="hint">${e.ng
          ? "He may not have flown along — he authorised the solo, and the squadron records who did."
          : esc(WA.SOLO_NG_DEFAULT_TIP)}</p>` : ""}`;
      },
      blank: () => ({ slot: null, sortie: "", date: "", ng: false, grade: null, instructor: "" }) },

    { id: "fpc",
      hint: "One entry per FPC — which stage flight it followed, who conducted it and the grade. An FPC is conducted by the Squadron CO or the DO and by nobody else (round 6). Several FPC after the same flight are simply several entries. Leave the grade empty until the result is known — the grade IS the result (round 11 removed the free-text “Result” box).",
      row: (e, i) => `
        <div class="rgrid2">
          ${fpcTriggerF(i, e)}
          ${fpcEvaluatorF(i, e)}
        </div>
        <div class="rgrid2">
          ${dateF("fpc", i, "date", e.date, "Date", true)}
          ${gradeF("fpc", i, "grade", e.grade, "Grade (%)")}
        </div>
        ${/* ROUND 11 — «Αφαίρεσε το result optional.» No box is drawn. A value
             written before the rule is shown here, read-only, so nothing that
             was recorded disappears from its owner's own form. */ ""}
        ${fpcResultLegacy(e)}
        <div class="rfoot"><span class="hint">${WA.checkLineHTML("fpc", e)}</span>
          ${rmB("fpc", i)}</div>`,
      blank: () => ({ date: "", flight_code: "", evaluator: "", grade: null }) },

    { id: "cef",
      hint: "One entry per CEF — which stage flight it followed, who conducted it and the result. Leave the grade empty until the result is known.",
      row: (e, i) => `
        <div class="rgrid2">
          ${triggerF("cef", i, e)}
          ${evaluatorF("cef", i, e)}
        </div>
        <div class="rgrid2">
          ${dateF("cef", i, "date", e.date, "Date", true)}
          ${gradeF("cef", i, "grade", e.grade, "Grade (%)")}
        </div>
        ${textF("cef", i, "result", e.result, "Result (optional)", "e.g. pass")}
        <div class="rfoot"><span class="hint">${WA.checkLineHTML("cef", e)}</span>
          ${rmB("cef", i)}</div>`,
      blank: () => ({ date: "", flight_code: "", evaluator: "", result: "", grade: null }) },

    /* ── ROUND 12 — THE LOG TABLES, AT THE END («στο τελος») ────────────────
       Two sections drawn as 4+4 collapsible tables (the track is on the row),
       then the two ground blocks. Nothing here is a fixed slot: an unflown
       sortie is not an entry, so the syllabus list is what a row is CHOSEN
       from and never a skeleton of 133 placeholders. */
    { id: "flights", log: true,
      hint: "Every sortie flown in the AIRCRAFT, one row each — the flight, the date, the instructor, how long it lasted and the grade. THE GRADE MAY BE LEFT EMPTY: a debrief sometimes takes a while, and the row simply says it is waiting instead of pretending the flight did not happen. Four tables, one per track, in the order of the printed Training Flow Chart. The eight checkrides are not here: they are recorded in the Evaluations section, where the syllabus order and the pass rule apply to them.",
      row: (e, i) => logRow("flights", i, e),
      blank: (track) => logBlank(track) },

    { id: "fs", log: true,
      hint: "The same log for the SIMULATOR. Sim hours and flight hours are counted separately by the squadron everywhere, which is why these are two logs and not one.",
      row: (e, i) => logRow("fs", i, e),
      blank: (track) => logBlank(track) },

    { id: "lessons",
      hint: "The ground academics — the twelve theory groups of the programme and the courses inside them. A lesson is a BLOCK, so a course taught over several days is one row with an end date; leaving the periods box empty means the FULL course. A lesson is attended, not scored, so there is no grade here — “Absent” is how a class the student missed is recorded from their own side, which is what makes the makeup visible.",
      row: (e, i) => lessonRow(i, e),
      blank: () => ({ date: "", end_date: "", group: "", course: "", periods: null,
                      absent: false, instructor: "", note: "" }) },

    { id: "exams",
      hint: "The eight ground-exam groups of the syllabus. Leave the grade empty until the result is in. (The exam papers written INSIDE a theory group — FF 190, PT 190, AΕ 190, JX 190/191, NA 191 — are courses of their group and go under Ground lessons: that is where the squadron's scheduler counts them.)",
      row: (e, i) => examRow(i, e),
      blank: () => ({ date: "", exam: "", grade: null, instructor: "", note: "" }) },
  ];
  /* one blank flight row of a given table. `seq` and `kind` are AUTHORED from
     the first keystroke, not defaulted server-side after the fact, so the row
     the form sends and the row the record stores are the same object. */
  function logBlank(track, from) {
    return { date: (from && from.date) || "", track: track || "",
             sortie: (from && from.sortie) || "", seq: (from && from.seq) || 1,
             kind: (from && from.kind) || "syllabus",
             instructor: "", duration: null, grade: null, ng: false,
             verdict: null, note: "" };
  }
  const secById = (id) => SECTIONS.find((s) => s.id === id);

  /* ── rendering ─────────────────────────────────────────────────────────── */
  function rowHTML(sec, e, i, meta) {
    const leg = stillLegacy(sec.id, e);
    const co = WA.isCO(e);
    const lock = coLocked(e);
    const slot = !!(meta && meta.slot);
    return `<div class="rrow${leg ? " is-legacy" : ""}${
      co ? " is-co" : ""}${lock ? " is-colock" : ""}${slot ? " is-slot" : ""}${
      slot && WA.slotEmpty(sec.id, e) ? " is-empty" : ""}" data-row="${esc(sec.id)}:${i}">
      ${leg ? `<p class="legnote">Recorded on an earlier version of this form &mdash; please complete
        ${esc(missingOf(sec.id, e).join(", ") || "the missing details")}. ${lock
          ? "Only the squadron CO can change this entry, so ask him to complete it."
          : blocksSave(sec.id, e)
            ? "It stays readable everywhere in the meantime, but the record cannot be saved again until this is done."
            : "Nothing is lost in the meantime — the rest of the form saves as it is."}</p>` : ""}
      ${co ? `<p class="conote">${lock ? WA.coLockTag() : WA.coTag(e)} ${lock
        ? "This entry was set by the squadron CO. You can see it, and it stays on your record exactly as it is &mdash; only the CO can change or remove it."
        : "entered by the squadron CO"}</p>` : ""}
      ${sec.row(e, i, meta)}</div>`;
  }

  function rowsHTML(sec) {
    const list = S.data[sec.id] || [];
    if (sec.fixed) return fixedRowsHTML(sec, list);
    if (sec.log) return logTablesHTML(sec, list);
    if (!list.length) return `<div class="empty">No entries &mdash; use &ldquo;+ Add&rdquo;.</div>`;
    return list.map((e, i) => rowHTML(sec, e, i)).join("");
  }

  /* ── THE 4+4 TABLES (round 12) ────────────────────────────────────────────
     ONE section, FOUR collapsible blocks — the track is on the row, so the
     grouping is a render and not four more storage keys. Each table opens by
     itself when it holds something, so a student mid-Contact does not have to
     unfold three empty tables to reach theirs. Rows keep their INDEX IN THE
     SECTION (data-idx), never their index in the table: every handler in this
     file addresses S.data[sec][i], and a per-table index would silently edit
     the wrong row the moment two tables held entries. */
  function logTablesHTML(sec, list) {
    return WA.TRACKS.map((t) => {
      const rows = [];
      list.forEach((e, i) => { if ((e.track || "") === t) rows.push(rowHTML(sec, e, i)); });
      const lag = list.filter((e, i) => (e.track || "") === t && WA.awaitingDebrief(e)).length;
      const hrs = list.reduce((a, e) => a + ((e.track || "") === t && isFinite(Number(e.duration))
        ? Number(e.duration) : 0), 0);
      const nCat = WA.logPickList(sec.id, t).length;
      return `
        <details class="logtbl" ${rows.length ? "open" : ""} data-logtbl="${esc(sec.id)}:${esc(t)}">
          <summary><b>${esc(WA.secLabel(sec.id))} &mdash; ${esc(WA.itemCatLabel(t))}</b>
            <span class="cnt">${rows.length} ${rows.length === 1 ? "flight" : "flights"}${
              hrs > 0 ? " · " + (Math.round(hrs * 10) / 10) + " h" : ""}${
              lag ? " · " + lag + " awaiting a grade" : ""}</span>
            <span class="k" title="${esc("This table CHOOSES from " + nCat + " " +
              (sec.id === "fs" ? "simulator" : "aircraft") + " sorties of the printed flow chart — and none of them is a row until it is flown. (The track's checkrides are not among them: they are recorded in the Evaluations section.)")}">${esc(nCat)} in the list</span>
          </summary>
          ${rows.length ? rows.join("")
            : `<div class="empty">Nothing recorded in this track yet &mdash; use &ldquo;+ Add a flight&rdquo;.</div>`}
          <div class="addrow"><button type="button" class="btn btn-sm btn-add"
            data-add="${esc(sec.id)}" data-track="${esc(t)}">+ Add a flight</button></div>
        </details>`;
    }).join("");
  }

  /* THE FIXED SECTIONS (round 5): the syllabus rows first, in syllabus order,
     then whatever reality added — an extra solo, an earlier attempt at a
     checkride, an imported evaluation nobody has identified yet. */
  function fixedRowsHTML(sec, list) {
    const isSlot = slotFlags(sec.id, list);
    const head = [];
    const tail = [];
    list.forEach((e, i) => {
      (isSlot[i] ? head : tail).push(rowHTML(sec, e, i, { slot: isSlot[i] }));
    });
    const extraHead = sec.id === "solo_flights"
      ? `<div class="subhead">Additional solos
           <span class="hint">— a solo the syllabus does not prescribe. These are the only solo rows that can be added or removed.</span></div>`
      : `<div class="subhead">Other evaluation entries
           <span class="hint">— earlier attempts at a checkride and imported entries that still need identifying.</span></div>`;
    return head.join("") + (tail.length ? extraHead + tail.join("") : "") +
      (sec.id === "solo_flights"
        ? `<div class="addrow"><button type="button" class="btn btn-sm btn-add" data-add="solo_flights"
             >+ Add an additional solo</button></div>` : "");
  }

  /* which entries stand for a fixed slot: every solo that names one, and the
     LAST-LISTED attempt at each of the eight checkrides. That is the row the
     slot HEADER sits on (the list is in date order — ensureSlots); which
     attempt COUNTS is a separate question the badges answer (round 11). */
  function slotFlags(secId, list) {
    const out = list.map(() => false);
    if (secId === "solo_flights") {
      list.forEach((e, i) => { out[i] = !!(e.slot && WA.soloSlot(e.slot)); });
      return out;
    }
    const last = {};
    list.forEach((e, i) => { if (WA.evalById(e.evaluation)) last[e.evaluation] = i; });
    for (const k of Object.keys(last)) out[last[k]] = true;
    return out;
  }

  function missingOf(sec, e) {
    const out = [];
    if (sec === "sms") {
      if (!isDate(e.entrance_date)) out.push("the entrance date");
      if (!WA.smsReason(e.reason)) out.push("the ΚΕΠΕ entry condition it was raised under");
      else if (e.reason === "judgement" && !txt(e.note)) out.push("the reduced performance the decision was based on");
      return out;
    }
    if (!isDate(e.date)) out.push("the date");
    if (sec === "fail" || sec === "almost_good") {
      if (!WA.itemCat(e.category)) out.push("the track");
      if (!(e.items || []).length) out.push("at least one item");
      const stale = WA.itemsLegacy(e);
      if (stale.length) out.push(stale.length === 1
        ? "a syllabus item in place of “" + stale[0] + "”"
        : "syllabus items in place of the " + stale.length + " typed by hand");
    }
    if (sec === "nfs") {
      if (!WA.nfsReason(e.reason)) out.push("the reason");
      else if (e.reason === "other" && !txt(e.note)) out.push("the cause");
    }
    /* ROUND 6 — the airsickness note became the flight it happened on, and
       round 6b makes the flight mandatory on EVERY row: the one that still
       carries a note says what happened to it, the rest just name the gap. */
    if (sec === "airsickness" && !txt(e.flight_code)) {
      out.push(txt(e.phase)
        ? "the flight it happened on (the phase note is kept as legacy information)"
        : "the flight it happened on");
    }
    if (sec === "evaluations" && !WA.evalById(e.evaluation)) out.push("which checkride it was");
    if (sec === "solo_flights") {
      if (!e.ng && (!isFinite(Number(e.grade)) || e.grade === null || e.grade === "")) out.push("the grade");
      /* ROUND 6 — NG rows too: somebody authorised that solo */
      if (!txt(e.instructor)) out.push(e.ng ? "the authorising instructor" : "the instructor");
    }
    /* ROUND 6 — an FPC is conducted by the Squadron CO or the DO */
    if (sec === "fpc" && !WA.fpcEvaluatorOK(e.evaluator)) {
      out.push("which of the two appointments conducted it (“" + e.evaluator + "” is not one of them)");
    }
    /* ROUND 12 — THE GRADE IS NEVER LISTED HERE. A row waiting for its debrief
       is not missing anything: «δεκτο το null». */
    if (sec === "flights" || sec === "fs") {
      if (!e.track) out.push("which track's table it belongs in");
      if (!txt(e.sortie)) out.push("which flight it was");
      if (!txt(e.instructor)) out.push("the instructor");
    }
    if (sec === "lessons" && !WA.groundGroup(e.group)) {
      out.push(e.group ? "a group from the current list (“" + e.group + "” is no longer one of them)"
                       : "which theory group it belongs to");
    }
    if (sec === "exams" && !WA.exam(e.exam)) {
      out.push(e.exam ? "an exam from the current list (“" + e.exam + "” is no longer one of them)"
                      : "which of the eight ground exams it was");
    }
    return out;
  }

  /* the derived counter of a section — FILLED entries only, so the eight
     empty solo slots do not read as eight solos flown (round 5) */
  function cntHTML(id) {
    const list = S.data[id] || [];
    const n = WA.filled(id, list).length;
    const sec = secById(id);
    if (sec && sec.fixed) {
      const slots = id === "solo_flights" ? WA.soloSlots().length : WA.EVALUATIONS.length;
      /* DISTINCT slots: a checkride flown twice is one checkride done, and the
         attempt that is not the operative one is counted among the extras */
      const seen = {};
      list.forEach((e) => {
        if (WA.slotEmpty(id, e)) return;
        const key = id === "solo_flights" ? e.slot : e.evaluation;
        if (key) seen[key] = true;
      });
      const done = Object.keys(seen).length;
      const extra = n - done;
      return `${Math.min(done, slots)} of ${slots} flown` +
        (extra > 0 ? ` · ${extra} extra` : "");
    }
    /* ROUND 12 — a log section counts its rows, its hours and its LAG. The
       third number is the one the directive asked to be able to see: how many
       flights are still waiting for a debrief. */
    if (sec && sec.log) {
      const hrs = list.reduce((a, e) => a + (isFinite(Number(e.duration)) ? Number(e.duration) : 0), 0);
      const lag = list.filter(WA.awaitingDebrief).length;
      return `${n} ${n === 1 ? "flight" : "flights"}` +
        (hrs > 0 ? ` · ${Math.round(hrs * 10) / 10} h` : "") +
        (lag ? ` · ${lag} awaiting a grade` : "");
    }
    if (id === "exams" || id === "lessons") {
      const lag = id === "exams" ? list.filter(WA.awaitingDebrief).length : 0;
      return `${n} ${n === 1 ? "entry" : "entries"}` +
        (lag ? ` · ${lag} awaiting a result` : "");
    }
    return `${n} ${n === 1 ? "entry" : "entries"}`;
  }

  function secHTML(sec) {
    return `
      <section class="card">
        <div class="sec-h"><h2>${esc(WA.secLabel(sec.id))}</h2>${WA.tipDot(sec.id)}
          <span class="cnt" id="cnt-${esc(sec.id)}" title="${
            sec.fixed ? "the fixed syllabus slots, and how many of them have been flown"
                      : "counted automatically from the entries below"}">${cntHTML(sec.id)}</span>
          ${sec.fixed
            ? `<span class="badge" title="These rows are fixed by the syllabus — they cannot be added to or removed">fixed by the syllabus</span>`
            : sec.log
              /* the + Add lives inside each of the four tables — a single one
                 up here could not know which track it was adding to */
              ? `<span class="badge" title="Four tables, one per track — each has its own + Add">4 tables</span>`
              : `<button type="button" class="btn btn-sm btn-add" data-add="${esc(sec.id)}">+ Add</button>`}</div>
        <p class="hint">${esc(sec.hint)}</p>
        <div style="margin-top:8px" id="rows-${esc(sec.id)}">${rowsHTML(sec)}</div>
      </section>`;
  }

  /* ── THE TWO LISTS BEHIND EVERY "WHO" BOX (round 9) ───────────────────────
     dl-ins  — the ACTIVE instructors' surnames, exactly as the roster stores
               them (upper case). It sits behind the airsickness instructor,
               the FAIL and ALMOST GOOD instructor, the evaluation's evaluator
               and the solo's "Authorised by".
     dl-eval — the same surnames with the two APPOINTMENTS in front of them,
               behind the CEF evaluator: a CEF is flown with a Squadron
               Evaluator, so the appointment is as likely an answer as a name.
     Both are <datalist>: a suggestion, never a rule. Every one of these boxes
     is a plain text input and takes any name typed into it — the squadron
     flies with people this database has never been told about, and a form
     that refused their names would be a form nobody could finish. The FPC
     evaluator is NOT here: round 6 closed that list to the two appointments
     and it stays a <select>. */
  const dlOpts = (list) => list.map((n) => `<option value="${esc(n)}"></option>`).join("");
  const DATALISTS =
    `<datalist id="dl-ins">${dlOpts(INS)}</datalist>` +
    `<datalist id="dl-eval">${dlOpts(WA.EVALUATOR_ROLES.concat(INS))}</datalist>`;

  view.innerHTML = `
    <div class="wrap" id="stu-form">
      ${asCO ? `
        <div class="cobar" role="note">
          <span class="cotag">CO</span>
          <div class="cotxt"><b>Editing as CO</b> &mdash; you are filling in this record on behalf of
            <b>${esc(WA.personName(who, true))}</b>. What you <b>add or change</b> here is tagged
            <b>&ldquo;entered by CO&rdquo;</b> and shown as such everywhere; entries you leave as they
            are stay ${esc(who.last_name || "the student")}&rsquo;s own. The tags clear the moment
            ${esc(who.last_name || "the student")} saves this form themselves.</div>
          ${backBtn}
        </div>` : ""}
      <section class="card">
        <div class="idhead">
          <span class="nm">${esc(WA.personName(who, true))}</span>
          <span class="meta">${esc([who.mn ? "MN " + who.mn : "", who.class ? "Class " + who.class : ""].filter(Boolean).join(" · "))}</span>
          <span class="lastupd" id="stu-lastupd">Last update: <b>${esc(fmtDT(S.lastUpdate))}</b></span>
        </div>
        <p class="hint" style="margin-top:6px">${asCO
          ? `The student&rsquo;s training record. Every section is a list of dated entries &mdash; the counts are
             calculated. The same rules apply as on the student&rsquo;s own form: an incomplete entry is refused
             here too. Remember to press <b>Save</b>.`
          : `Your self-reported training record. It is visible to your
             instructors and the squadron CO. Every section is a list of dated entries &mdash; the counts are
             calculated for you. You can come back through the same link and edit at any time
             &mdash; remember to press <b>Save</b>.`}</p>
        <p class="hint" id="stu-legacy"></p>
        <p class="hint" id="stu-co"></p>
      </section>
      ${SECTIONS.map(secHTML).join("")}
    </div>
    ${DATALISTS}
    ${/* ROUND 9 — THE SAVE THAT COMES TO YOU. The bar below is at the bottom
         of a form several screens long; this one is fixed at the top right
         and exists only while there is something to save. Same act, same
         validation, same button — it calls the one save() below. */ ""}
    <div class="savefloat" id="stu-float" hidden>
      <span class="sf-hint">unsaved changes</span>
      <button type="button" class="btn btn-primary" id="stu-float-save">Save${asCO ? " as CO" : ""}</button>
    </div>
    <div class="savebar">
      ${asCO ? backBtn : ""}
      <button type="button" class="btn btn-primary" id="stu-save">Save${asCO ? " as CO" : ""}</button>
      <span class="st" id="stu-status">All changes are kept only after you press Save.</span>
    </div>`;

  const form = $("stu-form");
  for (const k of WA.COUNTED) CO_BASE[k] = (S.data[k] || []).filter(WA.isCO).length;
  /* the FIRST render is a render like any other — the locks apply to it too */
  applyLocks();
  /* the baseline every later edit is measured against: the record as it was
     loaded, AFTER the fixed syllabus slots were filled in (they are part of
     the form's idea of the record, and an untouched form must read clean) */
  markSaved();
  placeFloat();
  if (!WA._stuFloatHooked) {
    WA._stuFloatHooked = true;
    window.addEventListener("resize", () => placeFloat());
  }

  function redraw(secId) {
    $("rows-" + secId).innerHTML = rowsHTML(secById(secId));
    $("cnt-" + secId).textContent = cntHTML(secId);
    applyLocks();
  }
  /* THE LOCK, ENFORCED IN THE DOM (round 8). Every control inside a row the CO
     set is disabled — inputs, selects, the item chips' ✕, the Graded/NG chips
     and the remove button alike — so no delegated handler can ever fire
     against it. It runs after EVERY render path (section, single row,
     multi-select), which is why it is one function and not a flag per box. */
  function applyLocks() {
    if (asCO) return;
    for (const row of form.querySelectorAll(".rrow.is-colock")) {
      for (const el of row.querySelectorAll("input, select, textarea, button")) {
        el.disabled = true;
      }
    }
  }
  function redrawMS(secId, i) {
    const box = form.querySelector(`[data-ms="${secId}:${i}"]`);
    if (box) box.innerHTML = msHTML(secId, i, S.data[secId][i]);
    applyLocks();
    return box;
  }
  /* ONE row, in place — a picker that reveals its free-text box must not
     re-render the whole section under the student's fingers */
  function redrawRow(secId, i, focusSel) {
    const el = form.querySelector(`.rrow[data-row="${secId}:${i}"]`);
    if (!el) { redraw(secId); return; }
    const sec = secById(secId);
    const meta = sec.fixed ? { slot: slotFlags(secId, S.data[secId])[i] } : null;
    el.outerHTML = rowHTML(sec, S.data[secId][i], i, meta);
    $("cnt-" + secId).textContent = cntHTML(secId);
    applyLocks();
    if (focusSel) {
      const back = form.querySelector(`.rrow[data-row="${secId}:${i}"] ${focusSel}`);
      if (back) back.focus();
    }
  }
  /* the live verdict under a TYPED flight code, without redrawing the box the
     student is typing into: a code of another track (refused on save) and a
     code the generated catalogue does not know (accepted, and marked). */
  function codeNoteHTML(catId, code) {
    if (!code) return "";
    const t = WA.codeTrack(code);
    if (t && catId && catId !== "other" && t !== catId) {
      return `<span class="warn-t" title="The letter of a Phase II sortie code names its track — this pair contradicts itself and is refused on save">${
        esc(code)} belongs to the ${esc(WA.itemCatLabel(t))} track</span>`;
    }
    if (!WA.sortieKnown(WA.itemCat(catId) ? catId : null, code)) {
      return `<span class="warn-t" title="Not in the generated syllabus catalogue — it is saved as typed and shown marked">not in the syllabus catalogue</span>`;
    }
    return "";
  }
  function refreshCodeNote(secId, i, field) {
    const box = form.querySelector(`.rrow[data-row="${secId}:${i}"] [data-field="~${field}"]`);
    if (!box) return;
    const label = box.closest("label.f");
    if (!label) return;
    const e = S.data[secId][i];
    const html = field === "flight_code" && (secId === "fail" || secId === "almost_good")
      ? codeNoteHTML(e.category, WA.normCode(e.flight_code)) : "";
    let note = label.querySelector(".fnote");
    if (!html) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement("span");
      note.className = "fnote";
      label.appendChild(note);
    }
    note.innerHTML = html;
  }

  /* ── ROUND 12 — the same three live refreshes for the log rows ────────────
     The verdict under a typed flight code / course, the duration conversion
     offer, and the row's own summary line. All in place, because none of them
     may redraw the box the student is typing into (round 5b). */
  function refreshLogNote(secId, i, field) {
    const box = form.querySelector(`.rrow[data-row="${secId}:${i}"] [data-field="~${field}"]`);
    if (!box) return;
    const label = box.closest("label.f");
    if (!label) return;
    const e = S.data[secId][i];
    const html = field === "sortie" ? logSortieNoteHTML(secId, e)
               : field === "course" ? courseNoteHTML(e) : "";
    let note = label.querySelector(".fnote");
    if (!html) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement("span");
      note.className = "fnote";
      label.appendChild(note);
    }
    note.innerHTML = html;
    refreshLogHead(secId, i);
  }
  function refreshDurNote(secId, i) {
    const box = form.querySelector(`.rrow[data-row="${secId}:${i}"] [data-field="duration"]`);
    if (!box) return;
    const label = box.closest("label.f");
    if (!label) return;
    const html = durnoteHTML(secId, i, S.data[secId][i].duration);
    let note = label.querySelector(".fixnote");
    if (!html) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement("span");
      note.className = "fixnote";
      label.appendChild(note);
    }
    note.innerHTML = html;
  }
  /* the one-line summary that makes a log row read as a table row */
  function refreshLogHead(secId, i) {
    const row = form.querySelector(`.rrow[data-row="${secId}:${i}"]`);
    if (!row) return;
    const line = row.querySelector(".logline");
    if (!line) return;
    const e = S.data[secId][i];
    const html = secId === "lessons" ? lessonRow(i, e)
               : secId === "exams" ? examRow(i, e)
               : logHeadHTML(secId, i, e);
    /* only the summary line is replaced — the boxes below it keep the focus */
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const fresh = tmp.querySelector(".logline");
    if (fresh) line.innerHTML = fresh.innerHTML;
    $("cnt-" + secId).textContent = cntHTML(secId);
    const det = row.closest("details.logtbl");
    if (det) refreshLogSummary(det, secId);
  }
  /* the per-table count in the collapsible's own header */
  function refreshLogSummary(det, secId) {
    const t = String(det.dataset.logtbl || "").split(":")[1];
    const sum = det.querySelector("summary .cnt");
    if (!sum || !t) return;
    const list = (S.data[secId] || []).filter((e) => (e.track || "") === t);
    const hrs = list.reduce((a, e) => a + (isFinite(Number(e.duration)) ? Number(e.duration) : 0), 0);
    const lag = list.filter(WA.awaitingDebrief).length;
    sum.textContent = list.length + " " + (list.length === 1 ? "flight" : "flights") +
      (hrs > 0 ? " · " + (Math.round(hrs * 10) / 10) + " h" : "") +
      (lag ? " · " + lag + " awaiting a grade" : "");
  }

  /* the same note under a grade box, live — added/removed without redrawing
     the box the student is typing into (round 5b) */
  function refreshFixnote(secId, i, field) {
    const box = form.querySelector(`.rrow[data-row="${secId}:${i}"] [data-field="${field}"]`);
    if (!box) return;
    const label = box.closest("label.f");
    if (!label) return;
    const html = fixnoteHTML(secId, i, field, S.data[secId][i][field]);
    let note = label.querySelector(".fixnote");
    if (!html) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement("span");
      note.className = "fixnote";
      label.appendChild(note);
    }
    note.innerHTML = html;
  }

  /* the flown / not-flown badge of a fixed slot, without touching the inputs */
  function refreshSlotBadge(secId, i) {
    const b = form.querySelector(`[data-slotbadge="${secId}:${i}"]`);
    if (!b) return;
    const flown = !WA.slotEmpty(secId, S.data[secId][i]);
    b.textContent = flown ? "flown" : "not flown yet";
    b.classList.toggle("badge-good", flown);
    const row = form.querySelector(`.rrow[data-row="${secId}:${i}"]`);
    if (row) row.classList.toggle("is-empty", !flown);
    $("cnt-" + secId).textContent = cntHTML(secId);
  }
  /* ── DIRTY IS A COMPARISON, NOT A FLAG (round 9) ──────────────────────────
     The bottom save bar is at the bottom of a form that is several screens
     long, so a student who changes something halfway down can leave without
     ever seeing it. A SECOND Save therefore floats at the top right for
     exactly as long as the form differs from what is stored — and "differs"
     is measured, not assumed: every edit re-fingerprints the record
     (WA.recordFingerprint) and compares it with the fingerprint of the last
     save. Type a character and delete it again and the button LEAVES, because
     the record really is the stored one again. `SAVED` is re-taken after every
     successful save, from the record as the SERVER normalised it. (SAVED and
     CLEAN_ST are declared at the top of this function — the first render
     takes the baseline before this line is ever reached.) */
  function markDirty() {
    S.dirty = WA.recordFingerprint(S.data) !== SAVED;
    const st = $("stu-status");
    st.className = "st";
    st.textContent = S.dirty ? "Unsaved changes — press Save." : CLEAN_ST;
    showFloat();
  }
  /* the floating Save is drawn once and shown or hidden — never re-created,
     so it cannot steal the focus or flicker under a fast typist */
  function showFloat() {
    const f = document.getElementById("stu-float");
    if (f) f.hidden = !S.dirty;
  }
  /* THE FORM NOW MATCHES THE RECORD — after a save, and at load */
  function markSaved() {
    SAVED = WA.recordFingerprint(S.data);
    S.dirty = false;
    showFloat();
  }
  /* the floating bar must clear the sticky top bar, whatever height it has
     wrapped to on this screen — measured, because on a 375 px phone the top
     bar is two rows tall and a hardcoded offset would sit on top of it */
  function placeFloat() {
    const f = document.getElementById("stu-float");
    if (!f) return;
    const top = document.querySelector(".topbar");
    f.style.top = ((top ? top.getBoundingClientRect().height : 0) + 10) + "px";
  }
  /* an imported row stops being a leftover the moment it is complete — the
     flag is dropped in place, so typing is never interrupted by a redraw */
  function dropLegacy(secId, e) {
    /* the "date was never recorded" placeholder is untrue once it is — and
       with it goes the "other cause" it was standing in for, so the row asks
       for the real reason instead of inheriting an import note as its cause */
    if (secId === "nfs" && isDate(e.date) && e.note === WA.NFS_IMPORT_NOTE) {
      e.note = "";
      if (e.reason === "other") e.reason = "";
    }
    if (!e.legacy || !COMPLETE[secId](e)) return;
    delete e.legacy;
  }
  function unmarkLegacy(row) {
    if (!row) return;
    row.classList.remove("is-legacy");
    const n = row.querySelector(".legnote");
    if (n) n.remove();
    const note = row.querySelector('[data-field="note"]');
    if (note && note.value === WA.NFS_IMPORT_NOTE) note.value = "";
  }
  /* A ROW THAT IS STILL A LEFTOVER, BUT OF A DIFFERENT ONE (round 6). Replacing
     one of two custom items leaves the row legacy and its note out of date, so
     the note follows what is actually missing — in place, because the multi-
     select must not be redrawn under the student's fingers. */
  function refreshLegnote(secId, i, row) {
    const el = row || form.querySelector(`.rrow[data-row="${secId}:${i}"]`);
    if (!el) return;
    const e = S.data[secId][i];
    if (!stillLegacy(secId, e)) { unmarkLegacy(el); return; }
    el.classList.add("is-legacy");
    let n = el.querySelector(".legnote");
    if (!n) {
      n = document.createElement("p");
      n.className = "legnote";
      el.insertBefore(n, el.firstChild);
    }
    n.innerHTML = `Recorded on an earlier version of this form &mdash; please complete
      ${esc(missingOf(secId, e).join(", ") || "the missing details")}. ${blocksSave(secId, e)
        ? "It stays readable everywhere in the meantime, but the record cannot be saved again until this is done."
        : "Nothing is lost in the meantime — the rest of the form saves as it is."}`;
  }
  /* THE BANNER COUNTS LEGACY LEFTOVERS, AND "N OF THEM" MEANS N OF THOSE.
     `blocking` is therefore counted over the SAME rows as `n` — a row the
     student is in the middle of adding also blocks the save (a new airsickness
     row has no flight yet, a new FPC row no evaluator), but it was never
     "recorded on an earlier version of this form", and counting it here
     produced "2 entries were recorded … 3 of them have to be corrected". A
     half-typed new row is answered where it belongs: by the save, which names
     the row and what it is missing. */
  function showLegacyNote() {
    let n = 0, blocking = 0;
    for (const sec of SECTIONS) {
      for (const e of S.data[sec.id]) {
        if (!stillLegacy(sec.id, e)) continue;
        n++;
        if (blocksSave(sec.id, e)) blocking++;
      }
    }
    $("stu-legacy").innerHTML = n
      ? `<b>${n} ${n === 1 ? "entry was" : "entries were"} recorded on an earlier version of this
         form</b> and ${n === 1 ? "is" : "are"} missing a detail the squadron now asks for. They are
         highlighted below and they stay readable everywhere.${blocking
           ? ` <b>${blocking} of them ${blocking === 1 ? "has" : "have"} to be corrected before this
               record can be saved again</b> — each takes a few seconds.`
           : " Completing them takes a few seconds and nothing is lost in the meantime."}`
      : "";
  }
  /* how much of this record was entered by the CO instead of its owner —
     HOW MUCH, not whether: the rest of it is the owner's and is named as such
     (round 4b, where a CO save stopped claiming the whole record) */
  function showCoNote() {
    let n = 0, tot = 0;
    /* FILLED entries only: an unflown syllabus slot is nobody's report */
    for (const sec of SECTIONS) {
      for (const e of WA.filled(sec.id, S.data[sec.id])) { tot++; if (WA.isCO(e)) n++; }
    }
    $("stu-co").innerHTML = n
      ? `<span class="cotag">CO</span> <b>${n} of ${tot} ${tot === 1 ? "entry" : "entries"} ${
         n === 1 ? "was" : "were"} entered by the squadron CO</b>${asCO ? "" : " on your behalf"}
         and ${n === 1 ? "is" : "are"} marked as such wherever the record is shown${
         n < tot ? `; the other ${tot - n} ${tot - n === 1 ? "is" : "are"} self-reported` : ""}. ${asCO
           ? (n === 1 ? "It is" : "They are") + " yours to edit or remove here; the student sees " +
             (n === 1 ? "it" : "them") + " locked."
           : (n === 1 ? "It is" : "They are") + " <b>locked</b> — " + (n === 1 ? "it stays" : "they stay") +
             " on your record exactly as " + (n === 1 ? "it is" : "they are") +
             ", and saving this form does not change or remove " + (n === 1 ? "it" : "them") + "."}`
      : "";
  }
  showLegacyNote();
  showCoNote();

  /* Back to the dashboard — the admin token stays in the hash, so the CO
     never has to re-open their link (the banner button and the save bar
     button are both outside #stu-form, hence the listener on the view). */
  if (asCO) {
    view.addEventListener("click", (ev) => {
      if (!ev.target.closest("[data-coback]")) return;
      if (S.dirty && !window.confirm(
        "This record has unsaved changes. Leave without saving?")) return;
      S.dirty = false;
      location.hash = WA.adminHash();
    });
  }

  /* ── delegated listeners (attach once) ────────────────────────────────── */
  form.addEventListener("click", (ev) => {
    const add = ev.target.closest("[data-add]");
    if (add) {
      const id = add.dataset.add;
      const def = secById(id);
      /* the fixed sections have no blank(): their rows come from the syllabus,
         and nothing in the UI can add one (this is the belt to that braces) */
      if (!def || typeof def.blank !== "function") return;
      /* ROUND 12 — a log table's + Add carries WHICH TABLE it is in: the track
         is a stored fact of the row, so it is written by the act that creates
         the row and never inferred afterwards from a code that may not exist */
      S.data[id].push(def.blank(add.dataset.track));
      const at = S.data[id].length - 1;
      redraw(id);
      markDirty();
      const last = form.querySelector(`.rrow[data-row="${id}:${at}"]`) ||
        (() => { const r = $("rows-" + id).querySelectorAll(".rrow"); return r[r.length - 1]; })();
      if (last) {
        const first = last.querySelector("input, select");
        if (first) first.focus();
      }
      return;
    }
    /* ── THE SAME-DAY RE-FLY (round 12) ────────────────────────────────────
       Two turns on one sortie on one day is a real thing, and it is NOT a
       duplicate — so there is no (sortie, date) uniqueness rule anywhere, and
       `seq` is not derived from an array index either (an index is a position;
       this is a fact). It is an ACT: this button opens the next row with the
       same flight and date and the next sequence number, and nothing else in
       the app can produce a seq above 1. */
    const refly2 = ev.target.closest("[data-refly2]");
    if (refly2) {
      const [sec, ix] = refly2.dataset.refly2.split(":");
      const src = S.data[sec][Number(ix)];
      if (!src) return;
      const same = (S.data[sec] || []).filter((x) =>
        (x.track || "") === (src.track || "") &&
        WA.normCode(x.sortie) === WA.normCode(src.sortie) &&
        String(x.date || "") === String(src.date || ""));
      const next = same.reduce((a, x) => Math.max(a, Number(x.seq || 1)), 0) + 1;
      const row = logBlank(src.track, src);
      row.seq = Math.min(next, 20);
      S.data[sec].push(row);
      const at = S.data[sec].length - 1;
      redraw(sec);
      markDirty();
      const box = form.querySelector(`.rrow[data-row="${sec}:${at}"] [data-field="instructor"]`);
      if (box) box.focus();
      toast("Same-day re-fly #" + row.seq + " — the flight and the date are carried over");
      return;
    }
    /* the ground lesson's attendance chips — "the class covered it and this
       student did not" is the only way a makeup can be visible at all */
    const abs = ev.target.closest("[data-absent]");
    if (abs) {
      const [ix, on] = abs.dataset.absent.split(":");
      const e2 = S.data.lessons[Number(ix)];
      if (!e2) return;
      e2.absent = on === "1";
      redrawRow("lessons", Number(ix));
      markDirty();
      return;
    }
    /* 1:20 → 1.3, and 1.25 → 1.3 — offered, never performed silently */
    const dur = ev.target.closest("[data-dur]");
    if (dur) {
      const [sec, ix, val] = dur.dataset.dur.split(":");
      const e2 = S.data[sec][Number(ix)];
      if (!e2) return;
      const was = e2.duration;
      e2.duration = Number(val);
      redrawRow(sec, Number(ix), '[data-field="duration"]');
      markDirty();
      toast("Duration set from " + was + " to " + e2.duration + " h");
      return;
    }
    /* ROUND 11 — the ONE act the fixed evaluations section allows: another
       attempt at a checkride that did not pass. It cannot invent a ninth
       checkride (the id comes from the row it was pressed on), and it cannot
       touch the attempt already there. ensureSlots re-sorts, so the new row
       lands at the end of its own checkride's group. */
    const refly = ev.target.closest("[data-refly]");
    if (refly) {
      const id = refly.dataset.refly;
      if (!WA.evalById(id)) return;
      S.data.evaluations.push({ evaluation: id, date: "", with: "", grade: null });
      ensureSlots();
      redraw("evaluations");
      markDirty();
      /* land the cursor in the date of the row that was just opened */
      const at = S.data.evaluations.findIndex(
        (x) => x.evaluation === id && WA.slotEmpty("evaluations", x));
      const box = at < 0 ? null
        : form.querySelector(`.rrow[data-row="evaluations:${at}"] [data-field="date"]`);
      if (box) box.focus();
      return;
    }
    const rm = ev.target.closest("[data-rm]");
    if (rm) {
      const id = rm.dataset.rm;
      S.data[id].splice(Number(rm.dataset.idx), 1);
      redraw(id);
      showLegacyNote();
      markDirty();
      return;
    }
    const msrm = ev.target.closest("[data-msrm]");
    if (msrm) {
      const [sec, i, k] = msrm.dataset.msrm.split(":");
      const e = S.data[sec][Number(i)];
      /* the row is looked up BEFORE the chips are redrawn: redrawMS replaces
         the whole .ms box, which detaches this button from the document and
         would make closest(".rrow") null — the round-5 bug that left a
         corrected row still wearing its legacy note */
      const row = msrm.closest(".rrow");
      e.items.splice(Number(k), 1);
      redrawMS(sec, Number(i));
      /* removing the last custom leftover is what completes the row (round 6),
         so the legacy flag has to be re-judged here too */
      afterEdit(sec, e, row);
      return;
    }
    const ng = ev.target.closest("[data-ng]");
    if (ng) {
      const [sec, i, on] = ng.dataset.ng.split(":");
      const e = S.data[sec][Number(i)];
      const want = on === "1";
      /* an explicit answer — the slot's opening default never overrides it */
      e._ngset = true;
      e._ngwant = want;
      /* ROUND 9 — ON AN UNFLOWN SLOT, NG IS AN ANSWER ABOUT A FLIGHT THAT HAS
         NOT HAPPENED. Writing ng:true into an empty slot would make it FLOWN —
         WA.slotEmpty counts ng — so a tap on the NG chip of a row nobody has
         filled would add a solo on no date, refused by the save in words about
         a date the student never meant to give. The answer is therefore
         REMEMBERED (_ngwant) and the data takes it the moment the row stops
         being empty (soloFirstFill). Everything else writes as before. */
      if (!(want && sec === "solo_flights" && WA.slotEmpty("solo_flights", e))) {
        e.ng = want;
      }
      /* ROUND 6 — NG drops the GRADE and nothing else: the instructor who
         authorised the solo stays on the row, because he authorised it.
         ROUND 12 — on a log row it drops the VERDICT with it: a flight nobody
         was in a position to score was not characterised anything either. */
      if (e.ng) { e.grade = null; if (sec === "flights" || sec === "fs") e.verdict = null; }
      /* ROUND 9 residuals-verify item 9 — this handler is the one place that
         itself DESTROYS a value: on a row whose only real value was that
         grade, the line above just emptied it while setting ng, and ng alone
         must not hold the slot "flown" on nothing (the save would refuse a
         date the student never meant to give, with no field left to clear). */
      soloEmptyReset(sec, e);
      redrawRow(sec, Number(i));
      showLegacyNote();
      markDirty();
      return;
    }
    /* a fractional grade inherited from an older record — rounded only when
       the student says so, and never behind their back (round 5) */
    const rnd = ev.target.closest("[data-round]");
    if (rnd) {
      const [sec, i, field] = rnd.dataset.round.split(":");
      const e = S.data[sec][Number(i)];
      const was = e[field];
      e[field] = Math.round(Number(was));
      redrawRow(sec, Number(i));
      showLegacyNote();
      markDirty();
      toast("Grade rounded from " + was + "% to " + e[field] + "%");
    }
  });

  /* ── HOW A SOLO SLOT OPENS (round 8) ──────────────────────────────────────
     The contact (adaptation) solos are flown with nobody in the other seat to
     score them, so the squadron records them NG and names who authorised the
     launch; the formation solos are graded. That is applied THE FIRST TIME a
     slot stops being empty — never to a row the owner has already answered,
     and never over an explicit tap on the Graded/NG chips. The chips stay
     live either way: this is a default, not a rule. */
  /* WHAT THIS SOLO ROW'S GRADING SAYS — the answer if the chips were tapped,
     the slot's opening default if they were not. ONE function, so the chips,
     the grade box, the hint and the value the data eventually takes cannot
     disagree with each other. */
  function soloNG(e) {
    if (e.ng) return true;                    /* answered, and already stored */
    if (e._ngset) return !!e._ngwant;         /* answered on a row still empty */
    return !!e.slot && WA.slotEmpty("solo_flights", e) && WA.soloDefaultNG(e.slot);
  }
  function soloFirstFill(e, wasEmpty) {
    if (!wasEmpty || !e.slot || e.ng) return false;
    if (WA.slotEmpty("solo_flights", e)) return false;
    /* WHICH GRADING THE ROW WAS SHOWING WHEN IT WAS STILL EMPTY — deliberately
       NOT soloNG(e), which is about the row as it is NOW: by the time this
       runs the row has stopped being empty, and soloNG's default arm would
       have said "no default here" for the very row that needs one. That
       mismatch left the data at ng:false while the screen still drew NG. */
    if (!(e._ngset ? !!e._ngwant : WA.soloDefaultNG(e.slot))) return false;
    e.ng = true;
    e.grade = null;
    /* "default" only when nobody answered the chips first — the toast that
       explains the NG has no business appearing after an explicit tap */
    return e._ngset ? "answer" : "default";
  }
  /* Round 9 residual (verify item B) — the MIRROR of soloFirstFill: clearing
     the last real value of a solo row would otherwise leave ng:true holding
     the slot "flown" on no date, with the Graded chip as the only way back.
     An emptied row returns to "not flown yet"; the NG answer is REMEMBERED
     (_ngset/_ngwant) exactly like an answer given on a still-empty row, so a
     refill takes it again without asking twice. */
  function soloEmptyReset(sec, e) {
    if (sec !== "solo_flights" || !e.ng) return false;
    if (!WA.slotEmpty("solo_flights", Object.assign({}, e, { ng: false }))) return false;
    e.ng = false;
    e._ngset = true;
    e._ngwant = true;
    return true;
  }

  /* one edit → drop the legacy flag if the row is now complete, mark dirty */
  function afterEdit(secId, entry, row) {
    const was = !!entry.legacy;
    dropLegacy(secId, entry);
    /* the note either goes (the row is complete) or says the NEXT thing that
       is missing — replacing one of two custom items must not leave the row
       naming the item that is already gone (round 6) */
    if (was) {
      const i = S.data[secId].indexOf(entry);
      if (i >= 0) refreshLegnote(secId, i, row);
      showLegacyNote();
    }
    markDirty();
  }

  form.addEventListener("input", (ev) => {
    const el = ev.target;

    /* SYLLABUS ONLY (round 6): the only thing this select can add is a
       catalogue item — there is no "Other…" option left to branch on.
       ROUND 9 removed the filter box that used to sit above it, so the focus
       after an add goes back to the select itself: the student's next act is
       almost always the next item. */
    if (el.dataset.msadd !== undefined) {
      const [sec, i] = el.dataset.msadd.split(":");
      const e = S.data[sec][Number(i)];
      const v = el.value;
      if (!v) return;
      /* the row BEFORE the redraw — see the note on data-msrm above */
      const row = el.closest(".rrow");
      if (!e.items.includes(v)) e.items.push(v);
      const box = redrawMS(sec, Number(i));
      if (box) {
        const focusOn = box.querySelector(".ms-add");
        if (focusOn) focusOn.focus();
      }
      afterEdit(sec, e, row);
      return;
    }

    const sec = el.dataset.sec, f = el.dataset.field;
    if (!sec || !f) return;
    const i = Number(el.dataset.idx);
    const entry = S.data[sec][i];
    if (!entry) return;
    /* was this solo slot still empty BEFORE the keystroke? (round 8) */
    const soloWasEmpty = sec === "solo_flights" && WA.slotEmpty("solo_flights", entry);

    /* ── the shared picker (round 5) ── "@x" is the select of x, "~x" the
       free-text box it reveals. Choosing from the list is the normal path;
       "Other…" only ever fills the same field by hand. */
    if (f[0] === "@" || f[0] === "~") {
      const key = f.slice(1);
      if (f[0] === "@") {
        if (el.value === PICK_OTHER) {
          entry["_o_" + key] = true;
          redrawRow(sec, i, `[data-field="~${key}"]`);
        } else {
          entry["_o_" + key] = false;
          entry[key] = el.value || null;
          if (soloFirstFill(entry, soloWasEmpty) === "default") {
            toast("Contact solos are recorded NG — switch the row to Graded % if this one was graded");
          }
          soloEmptyReset(sec, entry);
          redrawRow(sec, i, `[data-field="@${key}"]`);
        }
      } else {
        entry[key] = el.value;
        const ngFill = soloFirstFill(entry, soloWasEmpty);
        if (ngFill) {
          redrawRow(sec, i, `[data-field="~${key}"]`);
          if (ngFill === "default") {
            toast("Contact solos are recorded NG — switch the row to Graded % if this one was graded");
          }
        }
        soloEmptyReset(sec, entry);
        refreshSlotBadge(sec, i);
        refreshCodeNote(sec, i, key);
        /* ROUND 12 — the same live verdict under a TYPED flight code / course:
           the wrong-table, wrong-band, checkride and off-catalogue answers all
           appear on the keystroke, not on the next save */
        if (sec === "flights" || sec === "fs" || sec === "lessons") {
          refreshLogNote(sec, i, key);
        }
      }
      /* ROUND 12 — CHOOSING THE FLIGHT PREFILLS THE DURATION. The syllabus
         value for that sortie, and only onto a box that is still EMPTY:
         nothing already recorded is ever overwritten (the round-8 FAIL/ALMOST
         GOOD precedent). What is STORED stays the ACTUAL time flown — this is
         a starting point, and correcting it is one keystroke. */
      if ((sec === "flights" || sec === "fs") && key === "sortie" &&
          (entry.duration === null || entry.duration === undefined || entry.duration === "")) {
        const h = WA.sortieHours(sec, entry.track, entry.sortie);
        if (h) { entry.duration = h; redrawRow(sec, i, `[data-field="@sortie"]`); }
      }
      /* the kind decides whether the flight box is off-catalogue BY NATURE,
         which changes the note under it and the placeholder inside it */
      if ((sec === "flights" || sec === "fs") && key === "kind") redrawRow(sec, i);
      /* a group change re-lists the courses, and a course chosen under the old
         group cannot survive it — the (group, course) pair is the join key */
      if (sec === "lessons" && key === "group") {
        if (entry.course && !WA.lessonCourse(entry.group, WA.normLine(entry.course))) {
          const was = entry.course;
          entry.course = ""; entry._o_course = false;
          if (WA.groundGroup(entry.group)) {
            toast("“" + was + "” is not a course of " + entry.group + " — choose the course again", true);
          }
        }
        redrawRow(sec, i, `[data-field="@group"]`);
      }
      const wasL = !!entry.legacy;
      dropLegacy(sec, entry);
      if (wasL !== !!entry.legacy) { redrawRow(sec, i); showLegacyNote(); }
      markDirty();
      return;
    }

    /* was this checkride RECORDED before the keystroke? Filling one opens the
       next slot and clearing one closes it again, so the section is redrawn
       the moment that state flips — the hints and the frozen boxes of every
       OTHER row depend on this one (round 6). */
    const wasRec = sec === "evaluations" && !WA.slotEmpty("evaluations", entry);
    /* ROUND 11 — THE RE-FLY OFFER IS LIVE, the round-5b rule applied to a new
       act: typing 48 into a checkride's grade must put "+ Record the re-fly"
       on the screen on that keystroke, not on the next save. What decides the
       offer is whether the operative attempt PASSED, so that is what is
       remembered here and compared afterwards. */
    const wasPass = sec === "evaluations" && e_passState(entry.evaluation);

    /* ROUND 12 — DID THIS LOG ROW HAVE A GRADE BEFORE THE KEYSTROKE? The
       verdict box exists ONLY where the grade is absent, so the moment a
       number appears the box must leave (and its value with it) and the moment
       the number goes the box must come back. Both on the keystroke — the
       round-5b rule applied to a new pair. */
    const isLog = sec === "flights" || sec === "fs";
    const hadGrade = isLog && entry.grade !== null && entry.grade !== undefined &&
                     entry.grade !== "" && isFinite(Number(entry.grade));

    if (el.type === "checkbox") {
      entry[f] = el.checked;
    } else if (el.type === "number") {
      entry[f] = el.value === "" ? null : num(el.value);
      refreshFixnote(sec, i, f);
    } else if (f === "duration") {
      /* a TEXT box on purpose, so 1:20 can be typed at all. It is parsed only
         where it is exact; anything else stays as typed and the note offers
         the conversion (nothing is converted silently). */
      const p = durParse(el.value);
      entry.duration = p.empty ? null : (p.hm || p.bad ? el.value : p.dec);
      refreshDurNote(sec, i);
    } else {
      entry[f] = el.value;
    }
    const wasLegacy = !!entry.legacy;
    /* the opening grading of a solo slot, applied the first time it is filled */
    const ngDefaulted = soloFirstFill(entry, soloWasEmpty);
    soloEmptyReset(sec, entry);
    dropLegacy(sec, entry);
    /* the category drives BOTH lists this row depends on: the syllabus items
       and the flight codes. A code chosen under the old track cannot survive
       the change — keeping it is exactly the impossible pair this round
       removes — so it is dropped, out loud. */
    if (f === "category") {
      const code = WA.normCode(entry.flight_code);
      if (code && WA.codeTrack(code) !== entry.category) {
        entry.flight_code = ""; entry._o_flight_code = false;
        if (WA.itemCat(entry.category)) {
          toast("Flight " + code + " belongs to another track — choose the flight again", true);
        }
      }
      redraw(sec);
    } else if (sec === "evaluations" && f === "evaluation") {
      /* an imported evaluation that is finally identified goes HOME: if the
         fixed row of that checkride is still empty it takes its place, so the
         section never shows the same checkride twice for one attempt. If that
         checkride already holds an attempt, both stay — a re-flown checkride
         is a real thing, and the later one is the row the squadron compares. */
      const id = entry.evaluation;
      if (WA.evalById(id)) {
        const twin = S.data.evaluations.findIndex((x, k) => k !== i && x.evaluation === id);
        if (twin >= 0 && WA.slotEmpty("evaluations", S.data.evaluations[twin])) {
          const t = S.data.evaluations[twin];
          t.date = entry.date || "";
          t.with = entry.with || "";
          t.grade = (entry.grade === undefined ? null : entry.grade);
          if (entry.entered_by) t.entered_by = entry.entered_by;
          if (!WA.slotEmpty("evaluations", t) && !COMPLETE.evaluations(t)) t.legacy = true;
          S.data.evaluations.splice(i, 1);
        }
      }
      ensureSlots();
      redraw(sec);
      showLegacyNote();
    } else if (ngDefaulted) {
      /* the row has just taken its slot's opening grading — the chips, the
         grade box and the hint all change together, so the row is redrawn */
      const at0 = document.activeElement;
      const back0 = at0 && at0.dataset ? at0.dataset.field : null;
      redrawRow(sec, i, back0 ? `[data-field="${back0}"]` : null);
      if (ngDefaulted === "default") {
        toast("Contact solos are recorded NG — switch the row to Graded % if this one was graded");
      }
    } else if (isLog && f === "grade" &&
               hadGrade !== (entry.grade !== null && entry.grade !== undefined &&
                             entry.grade !== "" && isFinite(Number(entry.grade)))) {
      /* ROUND 12 — the grade has just appeared, or just gone. The verdict box
         belongs to exactly one of those two states, so it arrives or leaves on
         this keystroke — and a verdict typed before the number is DROPPED
         rather than left to be refused by the save in words about a box that
         is no longer on the screen. */
      if (!hadGrade && entry.verdict) {
        const was = WA.verdictLabel(entry.verdict);
        entry.verdict = null;
        toast("The grade decides it now — the “" + was + "” verdict is read from the number instead");
      }
      redrawRow(sec, i, `[data-field="grade"]`);
    } else if (isLog && (f === "date" || f === "instructor" || f === "duration")) {
      /* the row's summary line IS the table row the directive asked for, so it
         follows the keystroke instead of waiting for a redraw */
      refreshLogHead(sec, i);
    } else if ((sec === "lessons" || sec === "exams") &&
               (f === "date" || f === "end_date" || f === "instructor" || f === "periods")) {
      refreshLogHead(sec, i);
    } else if (f === "note" && sec === "nfs") {
      /* the note IS the cause when the reason is "Other" — the row's own
         completeness note has to follow what is typed into it */
      const wasE = form.querySelector(`.rrow[data-row="nfs:${i}"]`);
      if (wasE) wasE.classList.toggle("is-legacy", stillLegacy("nfs", entry));
    } else if (f === "note" && sec === "sms") {
      /* the note IS the reason when the condition is the CO / DO decision */
      const wasE = form.querySelector(`.rrow[data-row="sms:${i}"]`);
      if (wasE) wasE.classList.toggle("is-legacy", stillLegacy("sms", entry));
    } else if (sec === "evaluations" &&
               (wasRec !== !WA.slotEmpty("evaluations", entry) ||
                wasPass !== e_passState(entry.evaluation))) {
      /* this checkride has just become recorded (or stopped being): the
         syllabus-order state of every LATER slot changed with it, so the whole
         section is redrawn — the date box the student is in keeps the focus.
         ROUND 11 adds the second trigger: the operative attempt has just
         crossed the pass threshold in one direction or the other, so the
         re-fly offer and the attempt badges have to follow the keystroke. */
      const at = document.activeElement;
      const back = at && at.dataset ? at.dataset.field : null;
      redraw(sec);
      if (back) {
        const el2 = form.querySelector(
          `.rrow[data-row="evaluations:${i}"] [data-field="${back}"]`);
        if (el2) el2.focus();
      }
      showLegacyNote();
    } else {
      if (wasLegacy && !entry.legacy) unmarkLegacy(el.closest(".rrow"));
      refreshSlotBadge(sec, i);
      /* the FPC / CEF row shows the line every other surface will print —
         "FPC (C4590) — DO — 12/08/2026" — so it follows what is typed */
      if (sec === "fpc" || sec === "cef") {
        const line = form.querySelector(`.rrow[data-row="${sec}:${i}"] .rfoot .hint`);
        if (line) line.innerHTML = WA.checkLineHTML(sec, entry);
      }
    }
    if (wasLegacy !== !!entry.legacy) showLegacyNote();
    markDirty();
  });

  /* ── collect + client-side validation (the server re-validates all of it) ── */
  function buildPayload() {
    const d = S.data, problems = [], leftovers = [];
    const clean = {};
    /* the form row each payload entry was built from, in payload order — the
       server answers with its stamping verdict per entry (round 4b), and this
       is how that verdict finds its way back to the row on screen */
    const rows = {};
    const gr = (v) => (v === null || v === undefined || v === "") ? null : num(v);
    const legacyOf = (sec, e) => stillLegacy(sec, e);

    const push = (sec, obj, e) => {
      if (legacyOf(sec, e)) obj.legacy = true;
      (clean[sec] = clean[sec] || []).push(obj);
      (rows[sec] = rows[sec] || []).push(e);
      if (legacyOf(sec, e)) leftovers.push(WA.secLabel(sec));
    };
    const need = (sec, i, what) =>
      problems.push(WA.secLabel(sec) + " #" + (i + 1) + ": " + what);
    /* GRADES ARE WHOLE NUMBERS (round 5) — the server refuses 62.5, so the
       form says so first, on the row, and offers the rounding as a button
       rather than performing it silently. */
    const intOK = (sec, i, e, field, what) => {
      const v = e[field];
      if (v === null || v === undefined || v === "") return true;
      const n = Number(v);
      if (isFinite(n) && n === Math.round(n)) return true;
      need(sec, i, what + " must be a whole number — " + v +
        " is not (use the “Round to " + Math.round(n) + "%” button on the row)");
      return false;
    };

    for (const sec of SECTIONS) clean[sec.id] = [];

    d.nfs.forEach((e, i) => {
      if (!e.legacy) {
        if (!isDate(e.date)) { need("nfs", i, "the date is required"); return; }
        if (!WA.nfsReason(e.reason)) { need("nfs", i, "choose the reason printed on the sheet"); return; }
        if (e.reason === "other" && !txt(e.note)) {
          need("nfs", i, "reason “Other” needs the cause written in the note"); return;
        }
      }
      push("nfs", { date: e.date || null,
                    reason: WA.nfsReason(e.reason) ? e.reason : null,
                    note: txt(e.note) || null }, e);
    });
    d.sms.forEach((e, i) => {
      if (!isDate(e.entrance_date) && !e.legacy) { need("sms", i, "the entrance date is required"); return; }
      if (e.exit_date && e.entrance_date && e.exit_date < e.entrance_date) {
        need("sms", i, "the exit date cannot be before the entrance date"); return;
      }
      /* ROUND 8 — THE ΚΕΠΕ CONDITION, ON EVERY ROW, LEGACY INCLUDED. The
         server refuses the same row in the same words; the form says it first. */
      if (!WA.smsReason(e.reason)) {
        need("sms", i, "choose the condition this SMS entrance was raised under — 3-01 ΚΕΦ.2 §32β prints the six thresholds, and its opening sentence the Squadron CO / DO decision");
        return;
      }
      if (e.reason === "judgement" && !txt(e.note)) {
        need("sms", i, "a Squadron CO / DO decision names the reduced performance it was based on — write it in the box below");
        return;
      }
      push("sms", { entrance_date: e.entrance_date || null,
                    exit_date: e.exit_date || null,
                    reason: e.reason,
                    note: txt(e.note) || null }, e);
    });
    /* AIRSICKNESS — THE FLIGHT, NOT THE PHASE (round 6). The note the form no
       longer collects is carried through untouched when the row already had
       one (nothing is destroyed behind the owner's back), and such a row is
       refused until the flight is chosen — the server says the same.
       ROUND 6b — THE FLIGHT IS REQUIRED ON EVERY ROW, legacy included: the
       flag excuses what the OLD form never asked for, not a rule of this
       round. The note-carrier is told what happened to its note; every other
       row is told the rule. Both sentences mirror wa.validate_record. */
    d.airsickness.forEach((e, i) => {
      if (!isDate(e.date) && !e.legacy) { need("airsickness", i, "the date is required"); return; }
      if (!txt(e.flight_code)) {
        need("airsickness", i, txt(e.phase)
          ? "choose the FLIGHT this airsickness happened on — the phase-of-flight note is no longer collected, and this entry keeps its own as legacy information"
          : "every airsickness entry names the FLIGHT it happened on — choose the sortie the student was sick on (round 6 replaced the phase-of-flight note with the flight)");
        return;
      }
      push("airsickness", { date: e.date || null, instructor: WA.normLine(e.instructor) || null,
                            flight_code: WA.normCode(e.flight_code) || null,
                            ...(txt(e.phase) ? { phase: e.phase } : {}) }, e);
    });
    for (const k of ["fail", "almost_good"]) {
      d[k].forEach((e, i) => {
        const code = WA.normCode(e.flight_code);
        if (!e.legacy) {
          if (!isDate(e.date)) { need(k, i, "the date is required"); return; }
          if (!WA.itemCat(e.category)) { need(k, i, "choose the track"); return; }
          if (!(e.items || []).length) { need(k, i, "choose at least one item"); return; }
        }
        if (!intOK(k, i, e, "grade", "the grade")) return;
        /* the picker cannot produce this pair; a typed code still can */
        if (code && WA.codeTrack(code) && e.category && e.category !== "other" &&
            WA.codeTrack(code) !== e.category) {
          need(k, i, "flight " + code + " belongs to the " + WA.itemCatLabel(WA.codeTrack(code)) +
            " track — this entry is filed under " + WA.itemCatLabel(e.category));
          return;
        }
        /* SYLLABUS ONLY (round 6) — the custom item is gone, so a string the
           chosen track's gradesheet does not print is a leftover to replace,
           not a value to store. The server refuses it by name; the form says
           so first, and names it too. */
        const stale = WA.itemsLegacy(e);
        if (stale.length) {
          need(k, i, "“" + stale[0] + "” is not a syllabus item — FAIL / ALMOST GOOD items come " +
            "from the printed " + WA.itemCatLabel(e.category) + " gradesheet only" +
            (stale.length > 1 ? " (" + stale.length + " items on this entry)" : "") +
            ": remove it and choose the matching item");
          return;
        }
        push(k, {
          date: e.date || null, category: e.category || null,
          flight_code: code || null,
          items: (e.items || []).map((x) => WA.normLine(x)).filter(Boolean),
          instructor: WA.normLine(e.instructor) || null,
          grade: gr(e.grade),
        }, e);
      });
    }
    /* THE EIGHT CHECKRIDES — fixed rows. One that has not been flown travels
       as its identity and nothing else: the server accepts a slot without a
       date, and counts it as nothing. */
    /* EVALUATIONS FOLLOW THE SYLLABUS ORDER (round 6) — the same verdict the
       server reaches, from the same order list, in the same words. */
    const ordState = WA.evalOrderState(d);
    d.evaluations.forEach((e, i) => {
      const empty = WA.slotEmpty("evaluations", e);
      if (!e.legacy && !empty) {
        if (!WA.evalById(e.evaluation)) { need("evaluations", i, "choose which checkride it was"); return; }
        if (!isDate(e.date)) { need("evaluations", i, "the date is required once the checkride is flown"); return; }
      }
      if (!empty && WA.evalById(e.evaluation) && ordState.blockedBy[e.evaluation]) {
        problems.push("evaluations follow the syllabus order — " + e.evaluation +
          " cannot be recorded while " + ordState.blockedBy[e.evaluation] + " has not been flown");
        return;
      }
      if (!intOK("evaluations", i, e, "grade", "the grade")) return;
      push("evaluations", {
        date: e.date || null, evaluation: WA.evalById(e.evaluation) ? e.evaluation : null,
        with: WA.normLine(e.with) || null, grade: gr(e.grade) }, e);
    });
    /* THE SOLO SLOTS — same rule, plus the sortie that was flown solo */
    d.solo_flights.forEach((e, i) => {
      const empty = WA.slotEmpty("solo_flights", e);
      const slot = e.slot ? WA.soloSlot(e.slot) : null;
      if (!e.legacy && !empty) {
        if (!isDate(e.date)) { need("solo_flights", i, "the date is required once the solo is flown"); return; }
        if (!e.ng && gr(e.grade) === null) { need("solo_flights", i, "a graded solo needs its grade (or mark it NG)"); return; }
      }
      /* ROUND 6 — EVERY flown solo names its instructor, NG included: NG
         removes the grade, not the person who authorised the flight. Asked of
         a legacy row too: the flag excuses what the old form never asked for,
         never a rule of this round. */
      if (!empty && !txt(e.instructor)) {
        need("solo_flights", i, e.ng
          ? "a non-graded (NG) solo still needs the AUTHORISING instructor — he may not have flown along, but he authorised it"
          : "a graded solo needs the evaluator or instructor");
        return;
      }
      if (!intOK("solo_flights", i, e, "grade", "the grade")) return;
      const sortie = WA.normCode(e.sortie);
      if (sortie && slot && sortie[0] !== String(slot.id)[0]) {
        need("solo_flights", i, "sortie " + sortie + " does not belong to Training Section " + slot.sec);
        return;
      }
      push("solo_flights", {
        slot: slot ? slot.id : null,
        sortie: sortie || null,
        date: e.date || null, ng: !!e.ng,
        grade: e.ng ? null : gr(e.grade),
        /* NG drops the grade and NOTHING ELSE — the instructor rides on every
           flown solo row, because somebody authorised it (round 6) */
        instructor: WA.normLine(e.instructor) || null }, e);
    });
    for (const k of ["fpc", "cef"]) {
      d[k].forEach((e, i) => {
        if (!isDate(e.date) && !e.legacy) { need(k, i, "the date is required"); return; }
        /* AN FPC IS CONDUCTED BY THE SQUADRON CO OR THE DO (round 6). CEF
           keeps its open list — a CEF is flown with a Squadron Evaluator. */
        if (k === "fpc" && !WA.fpcEvaluatorOK(e.evaluator)) {
          need(k, i, "an FPC is conducted by the " + WA.FPC_EVALUATORS.join(" or the ") +
            " and by nobody else — “" + e.evaluator + "” is not one of them");
          return;
        }
        if (!intOK(k, i, e, "grade", "the grade")) return;
        /* ROUND 11 — `result` still travels for BOTH sections, but for an FPC
           it can only ever be a value that was already there: the form draws
           no box, so nothing can put a new string into e.result, and the
           server refuses a payload that grows the count (wa.fpc_result_count).
           Carrying it is what KEEPS it — dropping it here would delete every
           stored note the moment its owner pressed Save. */
        push(k, { date: e.date || null,
                  flight_code: WA.normCode(e.flight_code) || null,
                  evaluator: WA.normLine(e.evaluator) || null,
                  result: txt(e.result) || null, grade: gr(e.grade) }, e);
      });
    }

    /* ══ ROUND 12 — THE LOG TABLES ═══════════════════════════════════════════
       The one rule that is NOT here: a missing grade. «δεκτο το null, γιατι
       καποιες φορες αργει το debriefing» — a row without a grade is complete,
       saves, and says on screen that it is waiting. Everything the server
       refuses is refused here first, in the same words. */
    for (const k of ["flights", "fs"]) {
      d[k].forEach((e, i) => {
        const code = WA.normCode(e.sortie);
        if (!e.track) { need(k, i, "choose which track's table this flight belongs in"); return; }
        if (!isDate(e.date) && !e.legacy) { need(k, i, "the date is required"); return; }
        if (!code) { need(k, i, "every row of a flight log names the flight"); return; }
        /* the pickers cannot produce these three; a typed code still can, and
           the server refuses each of them by name */
        if (WA.codeTrack(code) && WA.codeTrack(code) !== e.track) {
          need(k, i, code + " belongs to the " + WA.itemCatLabel(WA.codeTrack(code)) +
            " track — this row is in the " + WA.itemCatLabel(e.track) + " table");
          return;
        }
        const band = WA.sortieBand(code);
        if (band && band !== k) {
          need(k, i, code + " is " + (band === "fs" ? "a SIMULATOR sortie — record it under F/S"
                                                    : "an AIRCRAFT sortie — record it under Flights"));
          return;
        }
        if (WA.EVAL_ORDER.indexOf(code) >= 0) {
          need(k, i, code + " is one of the eight checkrides — record it in the Evaluations " +
            "section, where the syllabus order and the pass rule apply to it. Two rows for one " +
            "flight would be two grades that can disagree.");
          return;
        }
        /* the round-6 solo doctrine, on every sortie */
        if (!txt(e.instructor)) {
          need(k, i, "every flown sortie names the instructor — a student never launches alone " +
            "on their own authority, and an ungraded row still had somebody in the other seat " +
            "or somebody who authorised it");
          return;
        }
        if (!WA.flightKind(e.kind)) { need(k, i, "choose what kind of flight it was"); return; }
        if (!intOK(k, i, e, "grade", "the grade")) return;
        /* the duration box is TEXT so 1:20 can be typed — an unconverted value
           is refused here, with the row's own button as the answer */
        const dp = durParse(e.duration);
        if (dp.bad || dp.hm || (!dp.empty && !dp.exact)) {
          need(k, i, dp.hm
            ? "the log is kept in DECIMAL HOURS — press “Use " + dp.dec + "” on the row to convert " + e.duration
            : dp.bad
              ? "“" + e.duration + "” is not a duration — type decimal hours (1.3) or h:mm (1:20)"
              : "duration is recorded to one decimal (6-minute steps) — " + dp.dec +
                " is not (use the button on the row)");
          return;
        }
        if (!dp.empty && (dp.dec <= 0 || dp.dec > 24)) {
          need(k, i, dp.dec > 24
            ? "duration is DECIMAL HOURS, not minutes — 1.3 is one hour and eighteen minutes"
            : "a flown sortie lasted longer than nothing — leave the box empty while the time is not known yet");
          return;
        }
        const hasGrade = gr(e.grade) !== null;
        /* the two contradictions. The form cannot produce either — the verdict
           box is only drawn where there is no grade, and NG clears both — so
           these are the belt to that braces, and they say the server's words. */
        if (e.ng && hasGrade) {
          need(k, i, "a non-graded (NG) flight carries no grade"); return;
        }
        if (e.verdict && hasGrade) {
          need(k, i, "this row has a grade, so its verdict is read from it — a stored verdict " +
            "beside a stored grade is a second source of truth that can contradict the first");
          return;
        }
        if (e.verdict && e.ng) {
          need(k, i, "a non-graded (NG) flight is not scorable at all — it carries neither a " +
            "grade nor a verdict");
          return;
        }
        push(k, {
          date: e.date || null,
          track: e.track || null,
          sortie: code || null,
          seq: Math.max(1, Math.min(20, Math.round(Number(e.seq) || 1))),
          kind: e.kind || "syllabus",
          instructor: WA.normLine(e.instructor) || null,
          /* NEVER AUTHORED HERE. instructor_oid is written by the CO's form
             path and by the bridge; the form draws no box for it, so it only
             ever travels through unchanged — dropping it would delete an
             identity the row already carries. */
          ...(txt(e.instructor_oid) ? { instructor_oid: WA.normLine(e.instructor_oid) } : {}),
          duration: dp.empty ? null : dp.dec,
          grade: e.ng ? null : gr(e.grade),
          ng: !!e.ng,
          verdict: (!e.ng && !hasGrade && WA.verdict(e.verdict)) ? e.verdict : null,
          note: txt(e.note) || null,
        }, e);
      });
    }
    d.lessons.forEach((e, i) => {
      if (!isDate(e.date) && !e.legacy) { need("lessons", i, "the date is required"); return; }
      if (!WA.groundGroup(e.group)) {
        need("lessons", i, e.group
          ? "“" + e.group + "” is not one of the twelve theory groups — choose the group again"
          : "every ground lesson names the group it belongs to");
        return;
      }
      if (e.end_date && e.date && e.end_date < e.date) {
        need("lessons", i, "a lesson cannot end before it started"); return;
      }
      const course = WA.normLine(e.course);
      /* a course that exists but in ANOTHER group makes the (group, course)
         join key false — the one thing refused here; a course the catalogue
         does not know at all is accepted and shown marked */
      if (course && !WA.lessonCourse(e.group, course)) {
        const home = WA.courseHome(course);
        if (home) {
          need("lessons", i, "“" + course + "” is a course of " + home +
            " — a course is identified by the PAIR (group, course), never by its code alone");
          return;
        }
      }
      const per = (e.periods === null || e.periods === undefined || e.periods === "")
        ? null : Math.round(Number(e.periods));
      if (per !== null && (!isFinite(per) || per < 0 || per > 400)) {
        need("lessons", i, "the periods must be a whole number between 0 and 400 — leave it empty for the FULL course");
        return;
      }
      push("lessons", {
        date: e.date || null,
        end_date: e.end_date || null,
        group: e.group || null,
        course: course || null,
        periods: per,
        absent: !!e.absent,
        instructor: WA.normLine(e.instructor) || null,
        ...(txt(e.instructor_oid) ? { instructor_oid: WA.normLine(e.instructor_oid) } : {}),
        note: txt(e.note) || null,
      }, e);
    });
    d.exams.forEach((e, i) => {
      if (!isDate(e.date) && !e.legacy) { need("exams", i, "the date is required"); return; }
      if (!WA.exam(e.exam)) {
        need("exams", i, e.exam
          ? "“" + e.exam + "” is not one of the eight ground exams — choose it again"
          : "every exam row names which of the eight ground exams it was");
        return;
      }
      if (!intOK("exams", i, e, "grade", "the grade")) return;
      push("exams", {
        date: e.date || null,
        exam: e.exam || null,
        grade: gr(e.grade),
        instructor: WA.normLine(e.instructor) || null,
        ...(txt(e.instructor_oid) ? { instructor_oid: WA.normLine(e.instructor_oid) } : {}),
        note: txt(e.note) || null,
      }, e);
    });
    /* ── THE CO'S ENTRIES MUST ALL STILL BE THERE (round 8) ─────────────────
       Nothing in the UI can drop one — they are locked — so a section that
       comes out of this function short of CO entries can only mean a locked
       row was refused on its way into the payload. The owner cannot fix a
       locked row, so the message sends them to the CO instead of to the box,
       and it goes FIRST: the specific complaint underneath it is not
       something they can act on. */
    for (const sec of SECTIONS) {
      const kept = (rows[sec.id] || []).filter(WA.isCO).length;
      const miss = (CO_BASE[sec.id] || 0) - kept;
      if (miss > 0) {
        problems.unshift(WA.secLabel(sec.id) + ": " + miss +
          (miss === 1 ? " entry was" : " entries were") +
          " set by the squadron CO and only the CO can change them — ask him to correct it; your save cannot go through without them");
      }
    }
    return { clean, rows, problems, leftovers };
  }

  /* ── THE ONE SAVE (round 9) ───────────────────────────────────────────────
     Two buttons, one act: the bar at the bottom and the floating one at the
     top right both land here, so the validation, the stamping and the receipt
     can never differ between them. Both are disabled while the call is in
     flight — a double-tap on a phone must not send the record twice. */
  async function save() {
    const st = $("stu-status");
    const { clean, rows, problems, leftovers } = buildPayload();
    if (problems.length) {
      st.className = "st err";
      st.textContent = problems[0] + (problems.length > 1 ? " (+" + (problems.length - 1) + " more)" : "");
      toast(problems[0], true);
      return;
    }
    const btns = [$("stu-save"), document.getElementById("stu-float-save")].filter(Boolean);
    btns.forEach((b) => { b.disabled = true; });
    st.className = "st";
    st.textContent = "Saving…";
    try {
      const res = asCO
        ? await rpc("admin_save_student_record",
                    { p_token: WA.token, p_student_id: O.targetId, p_payload: clean })
        : await rpc("save_student_record", { p_token: WA.token, p_payload: clean });
      S.lastUpdate = res.last_update;
      S.enteredBy = res.entered_by || null;
      /* THE STAMPS, as the server decided them (round 4b). A CO save is diffed
         against the stored record — only the entries he added or changed get
         the tag — so the client can no longer work them out from the payload
         alone: it applies res.record, entry for entry, in payload order.
         An instance still running the round-4 schema sends no record back and
         really does stamp everything, so that branch mirrors what it did. */
      const srv = (res.record && typeof res.record === "object") ? res.record : null;
      /* ROUND 5b — the server NORMALISES what it stores (trim, one space,
         upper case for the codes). The row must then show the value the record
         actually holds, not the padded text that produced it, or the box would
         keep offering to save something the record no longer contains. */
      const ADOPT = ["category", "reason", "flight_code", "sortie", "slot",
                     "evaluation", "instructor", "evaluator", "with",
                     "note", "result", "phase",
                     /* round 12 — the log rows' own strings */
                     "track", "kind", "verdict", "group", "course", "exam",
                     "instructor_oid", "end_date"];
      for (const sec of SECTIONS) {
        const list = srv ? (Array.isArray(srv[sec.id]) ? srv[sec.id] : []) : null;
        (rows[sec.id] || []).forEach((e, i) => {
          const by = srv ? ((list[i] || {}).entered_by || null) : (asCO ? "admin" : null);
          if (by) e.entered_by = by; else delete e.entered_by;
          const stored = srv ? (list[i] || null) : null;
          if (!stored) return;
          for (const f of ADOPT) {
            if (typeof stored[f] === "string" && e[f] !== stored[f]) e[f] = stored[f];
          }
          if (Array.isArray(stored.items)) e.items = stored.items.slice();
        });
        redraw(sec.id);
      }
      showCoNote();
      $("stu-lastupd").innerHTML = `Last update: <b>${esc(fmtDT(S.lastUpdate))}</b>`;
      /* how much of the record now carries the CO's name — the server counted
         it while stamping, so the message states a fact and not an intention */
      const coN = (typeof res.co_entries === "number")
        ? res.co_entries
        : SECTIONS.reduce((a, sec) => a + S.data[sec.id].filter(WA.isCO).length, 0);
      const coTot = (typeof res.entries === "number")
        ? res.entries
        : SECTIONS.reduce((a, sec) => a + S.data[sec.id].length, 0);
      /* THE FORM NOW MATCHES THE RECORD — and it matches the record as the
         SERVER normalised it, which is why this is taken AFTER the adoption
         loop above and not before it: a value the server trimmed would
         otherwise read as an edit and bring the floating Save straight back. */
      markSaved();
      st.className = "st ok";
      CLEAN_ST = "Saved ✓ " + fmtDT(S.lastUpdate) +
        (asCO ? " — " + coN + " of " + coTot + " entr" + (coTot === 1 ? "y" : "ies") +
          " tagged as entered by CO" : "") +
        (leftovers.length ? " — " + leftovers.length + " earlier entr" +
          (leftovers.length === 1 ? "y is" : "ies are") + " still incomplete" : "");
      st.textContent = CLEAN_ST;
      toast(leftovers.length
        ? "Record saved — " + leftovers.length + " earlier entries still need a detail"
        : (asCO ? "Record saved — " + coN + " entr" + (coN === 1 ? "y" : "ies") +
                  " tagged as entered by CO" : "Record saved"));
    } catch (e) {
      st.className = "st err";
      st.textContent = "Save failed: " + e.message;
      toast("Save failed: " + e.message, true);
    }
    btns.forEach((b) => { b.disabled = false; });
    /* a failed save leaves the record unsaved, and the floating button must
       still be there to try again — the fingerprint says so either way */
    showFloat();
  }
  $("stu-save").addEventListener("click", save);
  $("stu-float-save").addEventListener("click", save);

  WA._stuState = S;
  if (!WA._stuUnloadHooked) {
    WA._stuUnloadHooked = true;
    window.addEventListener("beforeunload", (ev) => {
      if (WA._stuState && WA._stuState.dirty) { ev.preventDefault(); ev.returnValue = ""; }
    });
  }
};
