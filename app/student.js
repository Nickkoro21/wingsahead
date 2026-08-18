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
      /* several attempts at the same checkride: oldest first, so the row that
         stands for the slot is the latest one — the one every view compares */
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
     state; it never needed a flag of its own. */
  function slotBadge(sec, i, flown) {
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
        const head = m.slot
          ? `<span class="slot-nm">${esc(WA.evalLabel(e.evaluation))}</span>
             ${slotBadge("evaluations", i, flown)}
             ${blocker ? `<span class="badge badge-warn" title="${esc(
               "Evaluations are flown and recorded in syllabus order — " + WA.EVAL_ORDER.join(" → ") +
               ". " + blocker + " has not been flown yet.")}">complete ${esc(blocker)} first</span>` : ""}`
          : (e.evaluation
              ? `<span class="slot-nm">Earlier attempt &mdash; ${esc(WA.evalLabel(e.evaluation))}</span>
                 <span class="badge" title="A checkride flown more than once: the latest attempt is the one every comparison uses">superseded</span>
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
        <div class="rgrid2">${gradeF("evaluations", i, "grade", e.grade, "Grade (%)", false, lock)}<div></div></div>`;
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
      hint: "One entry per FPC — which stage flight it followed, who conducted it and the result. An FPC is conducted by the Squadron CO or the DO and by nobody else (round 6). Several FPC after the same flight are simply several entries. Leave the grade empty until the result is known.",
      row: (e, i) => `
        <div class="rgrid2">
          ${triggerF("fpc", i, e)}
          ${fpcEvaluatorF(i, e)}
        </div>
        <div class="rgrid2">
          ${dateF("fpc", i, "date", e.date, "Date", true)}
          ${gradeF("fpc", i, "grade", e.grade, "Grade (%)")}
        </div>
        ${textF("fpc", i, "result", e.result, "Result (optional)", "e.g. pass")}
        <div class="rfoot"><span class="hint">${WA.checkLineHTML("fpc", e)}</span>
          ${rmB("fpc", i)}</div>`,
      blank: () => ({ date: "", flight_code: "", evaluator: "", result: "", grade: null }) },

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
  ];
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
    if (!list.length) return `<div class="empty">No entries &mdash; use &ldquo;+ Add&rdquo;.</div>`;
    return list.map((e, i) => rowHTML(sec, e, i)).join("");
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
     LATEST attempt at each of the eight checkrides */
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
         superseded attempt is one of the extras */
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
      S.data[id].push(def.blank());
      redraw(id);
      markDirty();
      const rows = $("rows-" + id).querySelectorAll(".rrow");
      const last = rows[rows.length - 1];
      if (last) {
        const first = last.querySelector("input, select");
        if (first) first.focus();
      }
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
         authorised the solo stays on the row, because he authorised it */
      if (e.ng) e.grade = null;
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

    if (el.type === "checkbox") {
      entry[f] = el.checked;
    } else if (el.type === "number") {
      entry[f] = el.value === "" ? null : num(el.value);
      refreshFixnote(sec, i, f);
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
               wasRec !== !WA.slotEmpty("evaluations", entry)) {
      /* this checkride has just become recorded (or stopped being): the
         syllabus-order state of every LATER slot changed with it, so the whole
         section is redrawn — the date box the student is in keeps the focus */
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
        push(k, { date: e.date || null,
                  flight_code: WA.normCode(e.flight_code) || null,
                  evaluator: WA.normLine(e.evaluator) || null,
                  result: txt(e.result) || null, grade: gr(e.grade) }, e);
      });
    }
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
                     "note", "result", "phase"];
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
