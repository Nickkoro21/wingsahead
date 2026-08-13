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
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  const txt = (v) => String(v === null || v === undefined ? "" : v).trim();
  const CUSTOM = "__custom__";
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
    INS = await WA.instructorNames();
  } catch (e) {
    view.innerHTML = `<div class="landing"><h2>Could not load ${asCO ? "this record" : "your form"}</h2>
      <p>${esc(e.message)}</p>${asCO ? `<p>${backBtn}</p>` : ""}</div>`;
    if (asCO) view.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-coback]")) location.hash = WA.adminHash();
    });
    return;
  }

  /* ── is this entry complete enough to stop being a legacy leftover? ── */
  const COMPLETE = {
    nfs: (e) => isDate(e.date) && !!WA.nfsReason(e.reason) &&
      (e.reason !== "other" || !!txt(e.note)),
    sms: (e) => isDate(e.entrance_date),
    airsickness: (e) => isDate(e.date),
    fail: (e) => isDate(e.date) && !!WA.itemCat(e.category) && (e.items || []).length > 0,
    almost_good: (e) => isDate(e.date) && !!WA.itemCat(e.category) && (e.items || []).length > 0,
    /* a fixed slot nobody has flown yet is complete BY BEING EMPTY */
    evaluations: (e) => WA.slotEmpty("evaluations", e) ||
      (isDate(e.date) && !!WA.evalById(e.evaluation)),
    solo_flights: (e) => WA.slotEmpty("solo_flights", e) || (isDate(e.date) &&
      (e.ng ? true : (isFinite(Number(e.grade)) && e.grade !== null && e.grade !== "" && !!txt(e.instructor)))),
    fpc: (e) => isDate(e.date),
    cef: (e) => isDate(e.date),
  };
  const stillLegacy = (sec, e) => !!e.legacy && !COMPLETE[sec](e);

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
        evs.push({ evaluation: d.id, date: "", with: "", grade: null, pending: false });
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

  /* ── field builders ───────────────────────────────────────────────────── */
  const F = (sec, i, field, extra) =>
    `data-sec="${esc(sec)}" data-idx="${i}" data-field="${esc(field)}"${extra || ""}`;

  const dateF = (sec, i, field, val, label, req) => `
    <label class="f"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="date" value="${esc(val || "")}" ${F(sec, i, field)}></label>`;

  const textF = (sec, i, field, val, label, ph, list) => `
    <label class="f"><span>${esc(label)}</span>
      <input type="text" value="${esc(val || "")}" placeholder="${esc(ph || "")}"
             ${list ? `list="${esc(list)}" autocomplete="off"` : ""} ${F(sec, i, field)}></label>`;

  /* GRADES ARE WHOLE NUMBERS (round 5). step=1 on every grade box, and a
     fractional value inherited from an older record is never silently
     rounded: the row says what is stored and offers the rounding as an act. */
  const gradeF = (sec, i, field, val, label, req) => {
    const n = Number(val);
    const frac = val !== null && val !== undefined && val !== "" &&
                 isFinite(n) && n !== Math.round(n);
    return `
    <label class="f"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0-100"
             value="${val === null || val === undefined || val === "" ? "" : esc(val)}"
             ${F(sec, i, field)}>
      ${frac ? `<span class="fixnote">Stored as <b>${esc(val)}%</b> — grades are whole numbers.
        <button type="button" class="btn btn-sm" data-round="${esc(sec)}:${i}:${esc(field)}"
          >Round to ${esc(Math.round(n))}%</button></span>` : ""}</label>`;
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
        note: codeNoteHTML(e.category, txt(e.flight_code).toUpperCase()) });
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

  /* pending / flown, the one badge that says what a fixed slot is */
  function slotBadge(sec, i, flown) {
    return `<span class="badge ${flown ? "badge-good" : ""}" data-slotbadge="${esc(sec)}:${i}"
      title="${esc(flown ? "Flown — the details below are recorded"
                        : "This syllabus slot has not been flown yet")}"
      >${flown ? "flown" : "pending — not flown yet"}</span>`;
  }

  /* who conducted it: DO · Squadron CO · the squadron's instructors · typed */
  function evaluatorF(sec, i, e) {
    return pickerF(sec, i, e, "evaluator", "Evaluator",
      [{ label: "Appointment", items: WA.EVALUATOR_ROLES.map((v) => ({ v, t: v })) },
       { label: "Instructors", items: INS.map((v) => ({ v, t: v })) }],
      { free: true, ph: "— who conducted it? —", freePh: "surname or appointment" });
  }

  const pendF = (sec, i, on) => `
    <label class="ck pend"><input type="checkbox" ${on ? "checked" : ""} ${F(sec, i, "pending")}>
      pending</label>`;

  const rmB = (sec, i) =>
    `<button type="button" class="rm" data-rm="${esc(sec)}" data-idx="${i}">&#10005; remove</button>`;

  const insF = (sec, i, field, val, label) =>
    textF(sec, i, field, val, label, INS.length ? "choose or type" : "type the surname", "dl-ins");

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

  function itemOptions(catId, filter) {
    const cat = WA.itemCat(catId);
    if (!cat) return "";
    const q = String(filter || "").trim().toLowerCase();
    let list = cat.items;
    if (q) list = list.filter((it) =>
      it.name.toLowerCase().indexOf(q) >= 0 || String(it.n || "").indexOf(q) >= 0);
    return `<option value="" selected>&mdash; add an item &mdash;</option>` +
      list.map((it) => `<option value="${esc(it.name)}">${esc((it.n ? it.n + " — " : "") + it.name)}</option>`).join("") +
      (q && !list.length ? `<option value="" disabled>no item matches &ldquo;${esc(filter)}&rdquo;</option>` : "") +
      `<option value="${CUSTOM}">Other&hellip; (type it yourself)</option>`;
  }

  /* the multi-select block of ONE row — re-rendered on its own so the
     filter box never loses what the student is typing */
  function msHTML(sec, i, e) {
    const chips = (e.items || []).map((n, k) => `
      <span class="mschip${WA.itemFind(e.category, n) ? "" : " is-custom"}"
            title="${esc(WA.itemText(e.category, n))}">${esc(WA.itemText(e.category, n))}
        <button type="button" class="x" data-msrm="${esc(sec)}:${i}:${k}"
                aria-label="Remove ${esc(n)}">&#10005;</button></span>`).join("");
    return `
      <div class="ms-chips">${chips || `<span class="ms-none">no item chosen yet</span>`}</div>
      <input type="search" class="ms-q" placeholder="filter ${esc(WA.itemCatLabel(e.category))} items&hellip;"
             value="${esc(e._q || "")}" data-msq="${esc(sec)}:${i}" aria-label="Filter items">
      <select class="ms-add" data-msadd="${esc(sec)}:${i}" aria-label="Add an item">
        ${itemOptions(e.category, e._q)}
      </select>
      ${e._other ? `
        <div class="ms-other">
          <input type="text" placeholder="describe the item in your own words"
                 value="${esc(e._otherText || "")}" data-msother="${esc(sec)}:${i}"
                 aria-label="Custom item">
          <button type="button" class="btn btn-sm" data-msaddother="${esc(sec)}:${i}">Add</button>
        </div>` : ""}`;
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
      <div class="rfoot">${pendF(sec, i, e.pending)}${rmB(sec, i)}</div>`;
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
      hint: "One entry per SMS entrance. Leave the exit date empty while the entry is still open — SMS entries are never marked pending.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("sms", i, "entrance_date", e.entrance_date, "Entrance date", true)}
          ${dateF("sms", i, "exit_date", e.exit_date, "Exit date (if closed)")}
        </div>
        ${e.note ? `<p class="hint">${esc(e.note)}</p>` : ""}
        <div class="rfoot"><span class="hint">${e.exit_date ? "closed" : "still open"}</span>${rmB("sms", i)}</div>`,
      blank: () => ({ entrance_date: "", exit_date: "" }) },

    { id: "airsickness",
      hint: "One entry per airsickness event — when it happened and with whom, so the squadron can see the pattern.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("airsickness", i, "date", e.date, "Date", true)}
          ${insF("airsickness", i, "instructor", e.instructor, "Instructor")}
        </div>
        ${textF("airsickness", i, "phase", e.phase, "Phase of flight / note (optional)", "e.g. aerobatics, after the third spin")}
        <div class="rfoot">${rmB("airsickness", i)}</div>`,
      blank: () => ({ date: "", instructor: "", phase: "" }) },

    { id: "fail",
      hint: "One entry per FAIL: the track, the flight it happened on, the syllabus items that missed the desired performance, the instructor, the date and the grade.",
      row: (e, i) => failRow("fail", i, e),
      blank: () => ({ date: "", category: "", flight_code: "", items: [], instructor: "", grade: null, pending: false }) },

    { id: "almost_good",
      hint: "Same detail as a FAIL — the track, the flight, the items, the instructor, the date and the grade.",
      row: (e, i) => failRow("almost_good", i, e),
      blank: () => ({ date: "", category: "", flight_code: "", items: [], instructor: "", grade: null, pending: false }) },

    /* ── FIXED SLOTS: the eight stage checkrides, always all eight ── */
    { id: "evaluations", fixed: true,
      hint: "The eight checkrides of the stage — every one of them is here from the first day and stays PENDING until you fly it. Fill in the date, the evaluator and the grade when it happens. Nothing can be added or removed: that is what lets the squadron compare you with your class on the same flight.",
      row: (e, i, meta) => {
        const m = meta || {};
        const flown = !WA.slotEmpty("evaluations", e);
        const head = m.slot
          ? `<span class="slot-nm">${esc(WA.evalLabel(e.evaluation))}</span>
             ${slotBadge("evaluations", i, flown)}`
          : (e.evaluation
              ? `<span class="slot-nm">Earlier attempt &mdash; ${esc(WA.evalLabel(e.evaluation))}</span>
                 <span class="badge" title="A checkride flown more than once: the latest attempt is the one every comparison uses">superseded</span>
                 ${rmB("evaluations", i)}`
              : `<span class="slot-nm warn-t">Imported evaluation &mdash; which checkride was it?</span>
                 ${rmB("evaluations", i)}`);
        return `
        <div class="slot-h">${head}</div>
        ${m.slot ? "" : evalF(i, e.evaluation)}
        <div class="rgrid2">
          ${insF("evaluations", i, "with", e.with, "With (evaluator)")}
          ${dateF("evaluations", i, "date", e.date, "Date", flown)}
        </div>
        <div class="rgrid2">${gradeF("evaluations", i, "grade", e.grade, "Grade (%)")}<div></div></div>
        <div class="rfoot">${pendF("evaluations", i, e.pending)}</div>`;
      } },

    /* ── FIXED SLOTS: the solos the syllabus prescribes ── */
    { id: "solo_flights", fixed: true,
      hint: "The solos of the stage, one row each — they are fixed by the syllabus and stay PENDING until flown. Fill in the date and then either the grade and the instructor, or NG (non-graded). A solo the syllabus did not foresee goes in as an additional solo at the end.",
      row: (e, i, meta) => {
        const m = meta || {};
        const slot = e.slot ? WA.soloSlot(e.slot) : null;
        const flown = !WA.slotEmpty("solo_flights", e);
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
          <span class="chiprow segrow">
            <button type="button" class="chip${e.ng ? "" : " is-on"}" data-ng="solo_flights:${i}:0"
                    aria-pressed="${e.ng ? "false" : "true"}">Graded&nbsp;%</button>
            <button type="button" class="chip${e.ng ? " is-on" : ""}" data-ng="solo_flights:${i}:1"
                    aria-pressed="${e.ng ? "true" : "false"}">NG (non-graded)</button>
          </span></div>
        ${e.ng ? `<p class="hint">Non-graded solo — no instructor and no grade are recorded.</p>` : `
          <div class="rgrid2">
            ${gradeF("solo_flights", i, "grade", e.grade, "Grade (%)", flown)}
            ${insF("solo_flights", i, "instructor", e.instructor, "Evaluator / instructor" + (flown ? " *" : ""))}
          </div>`}`;
      },
      blank: () => ({ slot: null, sortie: "", date: "", ng: false, grade: null, instructor: "" }) },

    { id: "fpc",
      hint: "One entry per FPC — which stage flight it followed, who conducted it and the result. Several FPC after the same flight are simply several entries. Tick pending while you are still waiting for the result.",
      row: (e, i) => `
        <div class="rgrid2">
          ${triggerF("fpc", i, e)}
          ${evaluatorF("fpc", i, e)}
        </div>
        <div class="rgrid2">
          ${dateF("fpc", i, "date", e.date, "Date", true)}
          ${gradeF("fpc", i, "grade", e.grade, "Grade (%)")}
        </div>
        ${textF("fpc", i, "result", e.result, "Result (optional)", "e.g. pass")}
        <div class="rfoot"><span class="hint">${WA.checkLineHTML("fpc", e)}</span>
          ${pendF("fpc", i, e.pending)}${rmB("fpc", i)}</div>`,
      blank: () => ({ date: "", flight_code: "", evaluator: "", result: "", grade: null, pending: false }) },

    { id: "cef",
      hint: "One entry per CEF — which stage flight it followed, who conducted it and the result. Tick pending while you are still waiting for the result.",
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
          ${pendF("cef", i, e.pending)}${rmB("cef", i)}</div>`,
      blank: () => ({ date: "", flight_code: "", evaluator: "", result: "", grade: null, pending: false }) },
  ];
  const secById = (id) => SECTIONS.find((s) => s.id === id);

  /* ── rendering ─────────────────────────────────────────────────────────── */
  function rowHTML(sec, e, i, meta) {
    const leg = stillLegacy(sec.id, e);
    const co = WA.isCO(e);
    const slot = !!(meta && meta.slot);
    return `<div class="rrow${e.pending ? " is-pending" : ""}${leg ? " is-legacy" : ""}${
      co ? " is-co" : ""}${slot ? " is-slot" : ""}${
      slot && WA.slotEmpty(sec.id, e) ? " is-empty" : ""}" data-row="${esc(sec.id)}:${i}">
      ${leg ? `<p class="legnote">Imported from the previous form &mdash; please complete
        ${esc(missingOf(sec.id, e).join(", ") || "the missing details")}.</p>` : ""}
      ${co ? `<p class="conote">${WA.coTag(e)} entered by the squadron CO
        ${asCO ? "" : "on your behalf"}</p>` : ""}
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
        ? `<div class="addrow"><button type="button" class="btn btn-sm" data-add="solo_flights"
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
    if (sec === "sms") { if (!isDate(e.entrance_date)) out.push("the entrance date"); return out; }
    if (!isDate(e.date)) out.push("the date");
    if (sec === "fail" || sec === "almost_good") {
      if (!WA.itemCat(e.category)) out.push("the track");
      if (!(e.items || []).length) out.push("at least one item");
    }
    if (sec === "nfs") {
      if (!WA.nfsReason(e.reason)) out.push("the reason");
      else if (e.reason === "other" && !txt(e.note)) out.push("the cause");
    }
    if (sec === "evaluations" && !WA.evalById(e.evaluation)) out.push("which checkride it was");
    if (sec === "solo_flights" && !e.ng) {
      if (!isFinite(Number(e.grade)) || e.grade === null || e.grade === "") out.push("the grade");
      if (!txt(e.instructor)) out.push("the instructor");
    }
    return out;
  }

  /* the derived counter of a section — FILLED entries only, so the eight
     pending solo slots do not read as eight solos flown (round 5) */
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
            : `<button type="button" class="btn btn-sm" data-add="${esc(sec.id)}">+ Add</button>`}</div>
        <p class="hint">${esc(sec.hint)}</p>
        <div style="margin-top:8px" id="rows-${esc(sec.id)}">${rowsHTML(sec)}</div>
      </section>`;
  }

  /* datalist: the instructor surnames behind every "with whom" box */
  const DATALISTS =
    `<datalist id="dl-ins">${INS.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;

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
    <div class="savebar">
      ${asCO ? backBtn : ""}
      <button type="button" class="btn btn-primary" id="stu-save">Save${asCO ? " as CO" : ""}</button>
      <span class="st" id="stu-status">All changes are kept only after you press Save.</span>
    </div>`;

  const form = $("stu-form");

  function redraw(secId) {
    $("rows-" + secId).innerHTML = rowsHTML(secById(secId));
    $("cnt-" + secId).textContent = cntHTML(secId);
  }
  function redrawMS(secId, i) {
    const box = form.querySelector(`[data-ms="${secId}:${i}"]`);
    if (box) box.innerHTML = msHTML(secId, i, S.data[secId][i]);
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
      ? codeNoteHTML(e.category, txt(e.flight_code).toUpperCase()) : "";
    let note = label.querySelector(".fnote");
    if (!html) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement("span");
      note.className = "fnote";
      label.appendChild(note);
    }
    note.innerHTML = html;
  }

  /* the pending/flown badge of a fixed slot, without touching the inputs */
  function refreshSlotBadge(secId, i) {
    const b = form.querySelector(`[data-slotbadge="${secId}:${i}"]`);
    if (!b) return;
    const flown = !WA.slotEmpty(secId, S.data[secId][i]);
    b.textContent = flown ? "flown" : "pending — not flown yet";
    b.classList.toggle("badge-good", flown);
    const row = form.querySelector(`.rrow[data-row="${secId}:${i}"]`);
    if (row) row.classList.toggle("is-empty", !flown);
    $("cnt-" + secId).textContent = cntHTML(secId);
  }
  function markDirty() {
    S.dirty = true;
    const st = $("stu-status");
    st.className = "st";
    st.textContent = "Unsaved changes — press Save.";
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
  function showLegacyNote() {
    let n = 0;
    for (const sec of SECTIONS) for (const e of S.data[sec.id]) if (stillLegacy(sec.id, e)) n++;
    $("stu-legacy").innerHTML = n
      ? `<b>${n} ${n === 1 ? "entry was" : "entries were"} imported from the previous version of this
         form</b> and ${n === 1 ? "is" : "are"} missing a detail the squadron now asks for. They are
         highlighted below — completing them takes a few seconds and nothing is lost in the meantime.`
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
           ? (n === 1 ? "It stays" : "They stay") + " marked until the student saves this form themselves."
           : "Pressing <b>Save</b> re-reports the whole record as your own and removes the marks."}`
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
      S.data[sec][Number(i)].items.splice(Number(k), 1);
      redrawMS(sec, Number(i));
      markDirty();
      return;
    }
    const other = ev.target.closest("[data-msaddother]");
    if (other) {
      const [sec, i] = other.dataset.msaddother.split(":");
      const e = S.data[sec][Number(i)];
      const v = txt(e._otherText);
      if (!v) { toast("Type the item first", true); return; }
      if (!e.items.includes(v)) e.items.push(v);
      e._other = false; e._otherText = "";
      redrawMS(sec, Number(i));
      afterEdit(sec, e, other.closest(".rrow"));
      return;
    }
    const ng = ev.target.closest("[data-ng]");
    if (ng) {
      const [sec, i, on] = ng.dataset.ng.split(":");
      const e = S.data[sec][Number(i)];
      e.ng = on === "1";
      if (e.ng) { e.grade = null; e.instructor = ""; }
      dropLegacy(sec, e);
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

  /* one edit → drop the legacy flag if the row is now complete, mark dirty */
  function afterEdit(secId, entry, row) {
    const was = !!entry.legacy;
    dropLegacy(secId, entry);
    if (was && !entry.legacy) { unmarkLegacy(row); showLegacyNote(); }
    markDirty();
  }

  form.addEventListener("input", (ev) => {
    const el = ev.target;

    /* multi-select: filter box (re-renders only the options) */
    if (el.dataset.msq !== undefined) {
      const [sec, i] = el.dataset.msq.split(":");
      const e = S.data[sec][Number(i)];
      e._q = el.value;
      const box = form.querySelector(`[data-ms="${sec}:${i}"] .ms-add`);
      if (box) box.innerHTML = itemOptions(e.category, e._q);
      return;
    }
    if (el.dataset.msother !== undefined) {
      const [sec, i] = el.dataset.msother.split(":");
      S.data[sec][Number(i)]._otherText = el.value;
      return;
    }
    if (el.dataset.msadd !== undefined) {
      const [sec, i] = el.dataset.msadd.split(":");
      const e = S.data[sec][Number(i)];
      const v = el.value;
      if (!v) return;
      if (v === CUSTOM) { e._other = true; }
      else if (!e.items.includes(v)) e.items.push(v);
      const box = redrawMS(sec, Number(i));
      if (box) {
        const focusOn = box.querySelector(e._other ? "[data-msother]" : ".ms-q");
        if (focusOn) focusOn.focus();
      }
      afterEdit(sec, e, el.closest(".rrow"));
      return;
    }

    const sec = el.dataset.sec, f = el.dataset.field;
    if (!sec || !f) return;
    const i = Number(el.dataset.idx);
    const entry = S.data[sec][i];
    if (!entry) return;

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
          redrawRow(sec, i, `[data-field="@${key}"]`);
        }
      } else {
        entry[key] = el.value;
        refreshSlotBadge(sec, i);
        refreshCodeNote(sec, i, key);
      }
      const wasL = !!entry.legacy;
      dropLegacy(sec, entry);
      if (wasL !== !!entry.legacy) { redrawRow(sec, i); showLegacyNote(); }
      markDirty();
      return;
    }

    if (el.type === "checkbox") {
      entry[f] = el.checked;
      if (f === "pending") el.closest(".rrow").classList.toggle("is-pending", el.checked);
    } else if (el.type === "number") {
      entry[f] = el.value === "" ? null : num(el.value);
    } else {
      entry[f] = el.value;
    }
    const wasLegacy = !!entry.legacy;
    dropLegacy(sec, entry);
    /* the category drives BOTH lists this row depends on: the syllabus items
       and the flight codes. A code chosen under the old track cannot survive
       the change — keeping it is exactly the impossible pair this round
       removes — so it is dropped, out loud. */
    if (f === "category") {
      entry._q = ""; entry._other = false;
      const code = txt(entry.flight_code);
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
          t.pending = !!entry.pending;
          if (entry.entered_by) t.entered_by = entry.entered_by;
          if (!WA.slotEmpty("evaluations", t) && !COMPLETE.evaluations(t)) t.legacy = true;
          S.data.evaluations.splice(i, 1);
        }
      }
      ensureSlots();
      redraw(sec);
      showLegacyNote();
    } else if (f === "note" && sec === "nfs") {
      /* the note IS the cause when the reason is "Other" — the row's own
         completeness note has to follow what is typed into it */
      const wasE = form.querySelector(`.rrow[data-row="nfs:${i}"]`);
      if (wasE) wasE.classList.toggle("is-legacy", stillLegacy("nfs", entry));
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
      push("sms", { entrance_date: e.entrance_date || null,
                    exit_date: e.exit_date || null, note: txt(e.note) || null }, e);
    });
    d.airsickness.forEach((e, i) => {
      if (!isDate(e.date) && !e.legacy) { need("airsickness", i, "the date is required"); return; }
      push("airsickness", { date: e.date || null, instructor: txt(e.instructor) || null,
                            phase: txt(e.phase) || null }, e);
    });
    for (const k of ["fail", "almost_good"]) {
      d[k].forEach((e, i) => {
        const code = txt(e.flight_code).toUpperCase();
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
        push(k, {
          date: e.date || null, category: e.category || null,
          flight_code: code || null,
          items: (e.items || []).map(txt).filter(Boolean),
          instructor: txt(e.instructor) || null,
          grade: gr(e.grade), pending: !!e.pending,
        }, e);
      });
    }
    /* THE EIGHT CHECKRIDES — fixed rows. One that has not been flown travels
       as its identity and nothing else: the server accepts a slot without a
       date, and counts it as nothing. */
    d.evaluations.forEach((e, i) => {
      const empty = WA.slotEmpty("evaluations", e);
      if (!e.legacy && !empty) {
        if (!WA.evalById(e.evaluation)) { need("evaluations", i, "choose which checkride it was"); return; }
        if (!isDate(e.date)) { need("evaluations", i, "the date is required once the checkride is flown"); return; }
      }
      if (!intOK("evaluations", i, e, "grade", "the grade")) return;
      push("evaluations", {
        date: e.date || null, evaluation: WA.evalById(e.evaluation) ? e.evaluation : null,
        with: txt(e.with) || null, grade: gr(e.grade), pending: !!e.pending }, e);
    });
    /* THE SOLO SLOTS — same rule, plus the sortie that was flown solo */
    d.solo_flights.forEach((e, i) => {
      const empty = WA.slotEmpty("solo_flights", e);
      const slot = e.slot ? WA.soloSlot(e.slot) : null;
      if (!e.legacy && !empty) {
        if (!isDate(e.date)) { need("solo_flights", i, "the date is required once the solo is flown"); return; }
        if (!e.ng && gr(e.grade) === null) { need("solo_flights", i, "a graded solo needs its grade (or mark it NG)"); return; }
        if (!e.ng && !txt(e.instructor)) { need("solo_flights", i, "a graded solo needs the evaluator or instructor"); return; }
      }
      if (!intOK("solo_flights", i, e, "grade", "the grade")) return;
      const sortie = txt(e.sortie).toUpperCase();
      if (sortie && slot && sortie[0] !== String(slot.id)[0]) {
        need("solo_flights", i, "sortie " + sortie + " does not belong to Training Section " + slot.sec);
        return;
      }
      push("solo_flights", {
        slot: slot ? slot.id : null,
        sortie: sortie || null,
        date: e.date || null, ng: !!e.ng,
        grade: e.ng ? null : gr(e.grade),
        instructor: e.ng ? null : (txt(e.instructor) || null) }, e);
    });
    for (const k of ["fpc", "cef"]) {
      d[k].forEach((e, i) => {
        if (!isDate(e.date) && !e.legacy) { need(k, i, "the date is required"); return; }
        if (!intOK(k, i, e, "grade", "the grade")) return;
        push(k, { date: e.date || null,
                  flight_code: txt(e.flight_code).toUpperCase() || null,
                  evaluator: txt(e.evaluator) || null,
                  result: txt(e.result) || null, grade: gr(e.grade), pending: !!e.pending }, e);
      });
    }
    return { clean, rows, problems, leftovers };
  }

  $("stu-save").addEventListener("click", async () => {
    const st = $("stu-status");
    const { clean, rows, problems, leftovers } = buildPayload();
    if (problems.length) {
      st.className = "st err";
      st.textContent = problems[0] + (problems.length > 1 ? " (+" + (problems.length - 1) + " more)" : "");
      toast(problems[0], true);
      return;
    }
    const btn = $("stu-save");
    btn.disabled = true;
    st.className = "st";
    st.textContent = "Saving…";
    try {
      const res = asCO
        ? await rpc("admin_save_student_record",
                    { p_token: WA.token, p_student_id: O.targetId, p_payload: clean })
        : await rpc("save_student_record", { p_token: WA.token, p_payload: clean });
      S.lastUpdate = res.last_update;
      S.enteredBy = res.entered_by || null;
      S.dirty = false;
      /* THE STAMPS, as the server decided them (round 4b). A CO save is diffed
         against the stored record — only the entries he added or changed get
         the tag — so the client can no longer work them out from the payload
         alone: it applies res.record, entry for entry, in payload order.
         An instance still running the round-4 schema sends no record back and
         really does stamp everything, so that branch mirrors what it did. */
      const srv = (res.record && typeof res.record === "object") ? res.record : null;
      for (const sec of SECTIONS) {
        const list = srv ? (Array.isArray(srv[sec.id]) ? srv[sec.id] : []) : null;
        (rows[sec.id] || []).forEach((e, i) => {
          const by = srv ? ((list[i] || {}).entered_by || null) : (asCO ? "admin" : null);
          if (by) e.entered_by = by; else delete e.entered_by;
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
      st.className = "st ok";
      st.textContent = "Saved ✓ " + fmtDT(S.lastUpdate) +
        (asCO ? " — " + coN + " of " + coTot + " entr" + (coTot === 1 ? "y" : "ies") +
          " tagged as entered by CO" : "") +
        (leftovers.length ? " — " + leftovers.length + " imported entr" +
          (leftovers.length === 1 ? "y is" : "ies are") + " still incomplete" : "");
      toast(leftovers.length
        ? "Record saved — " + leftovers.length + " imported entries still need a detail"
        : (asCO ? "Record saved — " + coN + " entr" + (coN === 1 ? "y" : "ies") +
                  " tagged as entered by CO" : "Record saved"));
    } catch (e) {
      st.className = "st err";
      st.textContent = "Save failed: " + e.message;
      toast("Save failed: " + e.message, true);
    }
    btn.disabled = false;
  });

  WA._stuState = S;
  if (!WA._stuUnloadHooked) {
    WA._stuUnloadHooked = true;
    window.addEventListener("beforeunload", (ev) => {
      if (WA._stuState && WA._stuState.dirty) { ev.preventDefault(); ev.returnValue = ""; }
    });
  }
};
