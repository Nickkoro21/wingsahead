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
    nfs: (e) => isDate(e.date),
    sms: (e) => isDate(e.entrance_date),
    airsickness: (e) => isDate(e.date),
    fail: (e) => isDate(e.date) && !!WA.itemCat(e.category) && (e.items || []).length > 0,
    almost_good: (e) => isDate(e.date) && !!WA.itemCat(e.category) && (e.items || []).length > 0,
    evaluations: (e) => isDate(e.date) && !!WA.evalById(e.evaluation),
    solo_flights: (e) => isDate(e.date) &&
      (e.ng ? true : (isFinite(Number(e.grade)) && e.grade !== null && e.grade !== "" && !!txt(e.instructor))),
    fpc: (e) => isDate(e.date),
    cef: (e) => isDate(e.date),
  };
  const stillLegacy = (sec, e) => !!e.legacy && !COMPLETE[sec](e);

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

  const gradeF = (sec, i, field, val, label, req) => `
    <label class="f"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="number" min="0" max="100" step="0.5" inputmode="decimal" placeholder="0-100"
             value="${val === null || val === undefined || val === "" ? "" : esc(val)}"
             ${F(sec, i, field)}></label>`;

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
    const cat = WA.itemCat(e.category) ? e.category : "";
    return `
      <div class="rgrid2">
        ${catF(sec, i, e)}
        ${textF(sec, i, "flight_code", e.flight_code, "Flight code",
                cat ? "e.g. " + ((WA.sorties(cat)[0] || {}).c || "C4302") : "choose a track first",
                cat ? "dl-sortie-" + cat : "")}
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
      hint: "One entry per NFS, each with its own date. The count below is calculated from the entries — you never type a number.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("nfs", i, "date", e.date, "Date", true)}
          ${textF("nfs", i, "note", e.note, "Note (optional)", "e.g. weather, unserviceable aircraft")}
        </div>
        <div class="rfoot">${rmB("nfs", i)}</div>`,
      blank: () => ({ date: "", note: "" }) },

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

    { id: "evaluations",
      hint: "The eight checkrides of the stage. Say which checkride the entry is — that is what lets the squadron compare you with your class on the same flight.",
      row: (e, i) => `
        ${evalF(i, e.evaluation)}
        <div class="rgrid2">
          ${insF("evaluations", i, "with", e.with, "With (evaluator)")}
          ${dateF("evaluations", i, "date", e.date, "Date", true)}
        </div>
        <div class="rgrid2">${gradeF("evaluations", i, "grade", e.grade, "Grade (%)")}<div></div></div>
        <div class="rfoot">${pendF("evaluations", i, e.pending)}${rmB("evaluations", i)}</div>`,
      blank: () => ({ date: "", evaluation: "", with: "", grade: null, pending: false }) },

    { id: "solo_flights",
      hint: "One entry per solo. A solo is either graded as a percentage or NG (non-graded) — NG solos are left out of every grade calculation.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("solo_flights", i, "date", e.date, "Date", true)}
          <div class="f"><span>Grading</span>
            <span class="chiprow segrow">
              <button type="button" class="chip${e.ng ? "" : " is-on"}" data-ng="solo_flights:${i}:0"
                      aria-pressed="${e.ng ? "false" : "true"}">Graded&nbsp;%</button>
              <button type="button" class="chip${e.ng ? " is-on" : ""}" data-ng="solo_flights:${i}:1"
                      aria-pressed="${e.ng ? "true" : "false"}">NG (non-graded)</button>
            </span></div>
        </div>
        ${e.ng ? `<p class="hint">Non-graded solo — no instructor and no grade are recorded.</p>` : `
          <div class="rgrid2">
            ${gradeF("solo_flights", i, "grade", e.grade, "Grade (%)", true)}
            ${insF("solo_flights", i, "instructor", e.instructor, "Instructor *")}
          </div>`}
        <div class="rfoot">${rmB("solo_flights", i)}</div>`,
      blank: () => ({ date: "", ng: false, grade: null, instructor: "" }) },

    { id: "fpc",
      hint: "One entry per FPC. Tick pending while you are still waiting for the result.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("fpc", i, "date", e.date, "Date", true)}
          ${insF("fpc", i, "by", e.by, "By (examiner)")}
        </div>
        <div class="rgrid2">
          ${textF("fpc", i, "result", e.result, "Result (optional)", "e.g. pass")}
          ${gradeF("fpc", i, "grade", e.grade, "Grade (%)")}
        </div>
        <div class="rfoot">${pendF("fpc", i, e.pending)}${rmB("fpc", i)}</div>`,
      blank: () => ({ date: "", by: "", result: "", grade: null, pending: false }) },

    { id: "cef",
      hint: "One entry per CEF. Tick pending while you are still waiting for the result.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("cef", i, "date", e.date, "Date", true)}
          ${insF("cef", i, "by", e.by, "By (evaluator)")}
        </div>
        <div class="rgrid2">
          ${textF("cef", i, "result", e.result, "Result (optional)", "e.g. pass")}
          ${gradeF("cef", i, "grade", e.grade, "Grade (%)")}
        </div>
        <div class="rfoot">${pendF("cef", i, e.pending)}${rmB("cef", i)}</div>`,
      blank: () => ({ date: "", by: "", result: "", grade: null, pending: false }) },
  ];
  const secById = (id) => SECTIONS.find((s) => s.id === id);

  /* ── rendering ─────────────────────────────────────────────────────────── */
  function rowsHTML(sec) {
    const list = S.data[sec.id] || [];
    if (!list.length) return `<div class="empty">No entries &mdash; use &ldquo;+ Add&rdquo;.</div>`;
    return list.map((e, i) => {
      const leg = stillLegacy(sec.id, e);
      const co = WA.isCO(e);
      return `<div class="rrow${e.pending ? " is-pending" : ""}${leg ? " is-legacy" : ""}${co ? " is-co" : ""}">
        ${leg ? `<p class="legnote">Imported from the previous form &mdash; please complete
          ${esc(missingOf(sec.id, e).join(", ") || "the missing details")}.</p>` : ""}
        ${co ? `<p class="conote">${WA.coTag(e)} entered by the squadron CO
          ${asCO ? "" : "on your behalf"}</p>` : ""}
        ${sec.row(e, i)}</div>`;
    }).join("");
  }

  function missingOf(sec, e) {
    const out = [];
    if (sec === "sms") { if (!isDate(e.entrance_date)) out.push("the entrance date"); return out; }
    if (!isDate(e.date)) out.push("the date");
    if (sec === "fail" || sec === "almost_good") {
      if (!WA.itemCat(e.category)) out.push("the track");
      if (!(e.items || []).length) out.push("at least one item");
    }
    if (sec === "evaluations" && !WA.evalById(e.evaluation)) out.push("which checkride it was");
    if (sec === "solo_flights" && !e.ng) {
      if (!isFinite(Number(e.grade)) || e.grade === null || e.grade === "") out.push("the grade");
      if (!txt(e.instructor)) out.push("the instructor");
    }
    return out;
  }

  function cntHTML(id) {
    const n = (S.data[id] || []).length;
    return `${n} ${n === 1 ? "entry" : "entries"}`;
  }

  function secHTML(sec) {
    return `
      <section class="card">
        <div class="sec-h"><h2>${esc(WA.secLabel(sec.id))}</h2>${WA.tipDot(sec.id)}
          <span class="cnt" id="cnt-${esc(sec.id)}" title="counted automatically from the entries below">${cntHTML(sec.id)}</span>
          <button type="button" class="btn btn-sm" data-add="${esc(sec.id)}">+ Add</button></div>
        <p class="hint">${esc(sec.hint)}</p>
        <div style="margin-top:8px" id="rows-${esc(sec.id)}">${rowsHTML(sec)}</div>
      </section>`;
  }

  /* datalists: instructor surnames + the sortie codes of each track */
  const DATALISTS =
    `<datalist id="dl-ins">${INS.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>` +
    ITEM_CATS.map((c) => `<datalist id="dl-sortie-${esc(c.id)}">${
      WA.sorties(c.id).map((s) => `<option value="${esc(s.c)}">${
        esc(s.n + (s.b === "fs" ? " (simulator)" : "") + (s.k ? " — checkride" : ""))}</option>`).join("")
    }</datalist>`).join("");

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
  function markDirty() {
    S.dirty = true;
    const st = $("stu-status");
    st.className = "st";
    st.textContent = "Unsaved changes — press Save.";
  }
  /* an imported row stops being a leftover the moment it is complete — the
     flag is dropped in place, so typing is never interrupted by a redraw */
  function dropLegacy(secId, e) {
    if (!e.legacy || !COMPLETE[secId](e)) return;
    delete e.legacy;
    /* the "date was never recorded" placeholder is untrue once it is */
    if (secId === "nfs" && e.note === WA.NFS_IMPORT_NOTE) e.note = "";
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
    for (const sec of SECTIONS) for (const e of S.data[sec.id]) { tot++; if (WA.isCO(e)) n++; }
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
      S.data[id].push(secById(id).blank());
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
      redraw(sec);
      showLegacyNote();
      markDirty();
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
    const entry = S.data[sec][Number(el.dataset.idx)];
    if (!entry) return;
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
    /* the category drives the item list and the flight-code list */
    if (f === "category") { entry._q = ""; entry._other = false; redraw(sec); }
    else if (wasLegacy && !entry.legacy) unmarkLegacy(el.closest(".rrow"));
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

    for (const sec of SECTIONS) clean[sec.id] = [];

    d.nfs.forEach((e, i) => {
      if (!isDate(e.date) && !e.legacy) { need("nfs", i, "the date is required"); return; }
      push("nfs", { date: e.date || null, note: txt(e.note) || null }, e);
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
        if (!e.legacy) {
          if (!isDate(e.date)) { need(k, i, "the date is required"); return; }
          if (!WA.itemCat(e.category)) { need(k, i, "choose the track"); return; }
          if (!(e.items || []).length) { need(k, i, "choose at least one item"); return; }
        }
        push(k, {
          date: e.date || null, category: e.category || null,
          flight_code: txt(e.flight_code).toUpperCase() || null,
          items: (e.items || []).map(txt).filter(Boolean),
          instructor: txt(e.instructor) || null,
          grade: gr(e.grade), pending: !!e.pending,
        }, e);
      });
    }
    d.evaluations.forEach((e, i) => {
      if (!e.legacy) {
        if (!WA.evalById(e.evaluation)) { need("evaluations", i, "choose which checkride it was"); return; }
        if (!isDate(e.date)) { need("evaluations", i, "the date is required"); return; }
      }
      push("evaluations", {
        date: e.date || null, evaluation: WA.evalById(e.evaluation) ? e.evaluation : null,
        with: txt(e.with) || null, grade: gr(e.grade), pending: !!e.pending }, e);
    });
    d.solo_flights.forEach((e, i) => {
      if (!e.legacy) {
        if (!isDate(e.date)) { need("solo_flights", i, "the date is required"); return; }
        if (!e.ng && gr(e.grade) === null) { need("solo_flights", i, "a graded solo needs its grade (or mark it NG)"); return; }
        if (!e.ng && !txt(e.instructor)) { need("solo_flights", i, "a graded solo needs the instructor"); return; }
      }
      push("solo_flights", {
        date: e.date || null, ng: !!e.ng,
        grade: e.ng ? null : gr(e.grade),
        instructor: e.ng ? null : (txt(e.instructor) || null) }, e);
    });
    for (const k of ["fpc", "cef"]) {
      d[k].forEach((e, i) => {
        if (!isDate(e.date) && !e.legacy) { need(k, i, "the date is required"); return; }
        push(k, { date: e.date || null, by: txt(e.by) || null,
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
