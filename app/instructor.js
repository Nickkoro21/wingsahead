"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   Wings Ahead — INSTRUCTOR form (mobile-first).
   Student list; per student a compact card of their self-reported data
   beside ONE assessment — the five-level scale about fighters (round 10) —
   plus flew-with + comment. Save/edit any time.

   ROUND 10: the branch ranking is gone. An instructor no longer distributes a
   student across three aircraft types; he answers one question about him,
   once, and the answer is one of five levels defined in app.js → WA.LEVELS.
   ROUND 14: the thin rule moved up one — it now sits between «Recommended as
   Alternate» and «Recommended for Other Assignments», where it marks the real
   boundary of the scale: three FIGHTER answers above it, two REDIRECT answers
   below. And the per-student Save is gone: ONE general Save writes every
   assessment that differs from what is stored, after a confirmation naming the
   instructor the link belongs to and listing the changes.

   ROUND-4 ENTER-ON-BEHALF: the SAME form, bound to another instructor.
   opts.asCO swaps the two RPCs for their admin_* twins (identical validation
   server-side) and adds the "entering as CO" banner; nothing else forks.
     opts = { asCO: true, targetId: <instructor uuid> }   (admin token only)
   ══════════════════════════════════════════════════════════════════════════ */

WA.renderInstructor = async function (view, me, opts) {
  const O = opts || {};
  const asCO = !!O.asCO;
  const backBtn = `<button type="button" class="btn btn-sm" data-coback>&#8592; Back to the dashboard</button>`;
  let data, who = me || {};
  try {
    data = asCO
      ? await rpc("admin_get_proposals_of", { p_token: WA.token, p_instructor_id: O.targetId })
      : await rpc("list_students_for_instructor", { p_token: WA.token });
    who = me || data.me || {};
  } catch (e) {
    view.innerHTML = `<div class="landing"><h2>Could not load</h2><p>${esc(e.message)}</p>
      ${asCO ? `<p>${backBtn}</p>` : ""}</div>`;
    if (asCO) view.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-coback]")) location.hash = WA.adminHash();
    });
    return;
  }

  /* per-student proposal working state */
  const P = {};
  for (const s of data.students) {
    const mp = s.my_proposal;
    P[s.person.id] = {
      /* null = no view formed yet, and it stays null until the instructor
         picks one: nothing is assumed on his behalf. A migrated row whose
         old ranking said nothing about fighters arrives here as null too, and
         the card asks for the assessment rather than inventing it. */
      level: (mp && WA.level(mp.level)) ? mp.level : null,
      flew_with: !!(mp && mp.flew_with),
      comment: (mp && mp.comment) || "",
      savedAt: mp ? mp.updated_at : null,
      enteredBy: (mp && mp.entered_by) || null,
      dirty: false,
    };
  }

  function selfCard(s) {
    const rec = WA.migrateRecord(s.record);
    const st = WA.recStats(rec);
    /* whose record this is, counted from the entries (round 4b) — "entered by
       CO" is only true when ALL of it was; one CO addition to a student's own
       record is an addition, and the badge says so */
    const src = WA.coSource(rec, s.entered_by);
    /* ROUND 5 — the eight checkrides and the eight solos are FIXED syllabus
       rows: the card shows every checkride, saying which are not flown yet,
       and counts the solos against the slots the syllabus prescribes. */
    const slots = WA.evalSlotRows(rec);
    const solos = WA.filled("solo_flights", rec.solo_flights);
    const nSlots = WA.soloSlots().length;
    const doneSlots = solos.filter((e) => e.slot && WA.soloSlot(e.slot)).length;
    const evLine = slots.slots.map((sl) => sl.row
      ? `${esc(sl.def.id)} <b>${WA.pct(sl.row.grade)}</b>` +
        (sl.row.date ? ` (${esc(fmtD(sl.row.date))})` : "") + WA.coTag(sl.row)
      : `<span class="k">${esc(sl.def.id)} —</span>`).join(" · ") +
      (slots.extras.length ? ` · <span class="k">${slots.extras.length} imported, not identified</span>` : "");
    const soLine = `<span class="k">${doneSlots} of ${nSlots} syllabus solos flown${
      solos.length > doneSlots ? " · " + (solos.length - doneSlots) + " additional" : ""}</span>` +
      /* ROUND 6 — every flown solo names its instructor, NG included (on an NG
         row that is the one who AUTHORISED it), so the card names them too */
      (solos.length ? " — " + solos.map((e) => esc(fmtD(e.date)) +
          (e.ng ? ` — <span class="k">NG</span>` : ` — <b>${WA.pct(e.grade)}</b>`) +
          " " + WA.soloWhoPhrase(e) +
          WA.coTag(e)).join(" · ") : "");
    /* ROUND 12 — THE FLIGHT LOG, ONE LINE PER BAND. An instructor reads this
       card before flying with the student, so what it owes them is the shape
       of the log — how much of each track has been flown, how many hours, and
       how many sorties are still waiting for a debrief. The rows themselves
       are the CO's drill-down and the student's own form; a card that printed
       eighty of them would stop being readable at the moment it matters. */
    const logLine = ["flights", "fs"].map((k) => {
      const list = Array.isArray(rec[k]) ? rec[k] : [];
      /* ROUND 13 — an empty log is no longer an empty line: the syllabus is
         pre-seeded, so "nothing flown" has a denominator and the card says it */
      if (!list.length) {
        return `<div class="line">${esc(WA.secLabel(k))}: <span class="k">nothing flown yet &mdash; all ${
          esc(WA.slotCount(k))} sorties of the flow chart owed</span></div>`;
      }
      const hrs = list.reduce((a, e) => a + (isFinite(Number(e.duration)) ? Number(e.duration) : 0), 0);
      const lag = list.filter(WA.awaitingDebrief).length;
      const per = WA.TRACKS.map((t) => {
        const n = list.filter((e) => (e.track || "") === t).length;
        return n ? `<b>${esc(WA.itemCatLabel(t))}</b> ${esc(n)}` : "";
      }).filter(Boolean).join(" · ");
      /* ROUND 12b — the missions that were NOT completed. A summary line that
         counted only hours would let the one fact an instructor most needs to
         see pass unmentioned. */
      const bad = list.filter((e) => WA.rowMission(e) === "incomplete").length;
      /* ROUND 13 — how much of the printed flow chart is still owed. An
         instructor about to brief a student is asking where in the stage they
         are, and "12 flown" cannot answer that without its denominator. */
      const cn = WA.stateCounts(k, list);
      return `<div class="line">${esc(WA.secLabel(k))}: ${per}` +
        (hrs > 0 ? ` <span class="k">· ${esc(Math.round(hrs * 10) / 10)} h</span>` : "") +
        ` <span class="k" title="${esc("Of the " + WA.slotCount(k) +
          " sorties the printed flow chart prescribes here, " + cn.done + " are complete and " +
          cn.owed + " have nothing recorded against them yet")}">· ${esc(cn.owed)} of ${
          esc(WA.slotCount(k))} owed</span>` +
        (lag ? ` <span class="k" title="Flown, and the debrief has not landed yet — the grade is genuinely not known, not missing">· ${esc(lag)} awaiting a grade</span>` : "") +
        (bad ? ` <span class="k" title="Missions that were not completed — read from the grade where there is one, said by the squadron where there is not">· ${esc(bad)} incomplete</span>` : "") +
        `</div>`;
    }).join("") +
    ((rec.lessons || []).length || (rec.exams || []).length
      ? (() => {
          const cl = WA.stateCounts("lessons", rec.lessons);
          const cx = WA.stateCounts("exams", rec.exams);
          /* ROUND 14 — slotsDone, not done: an exam sat three times is ONE
             exam done, and «9 of 8» would be the arithmetic saying so.
             ROUND 15 — AND «DONE» IS NOT «PASSED». The ground exams got a pass
             mark of their own (80 %) and this counter did not move with it: it
             counts the exams that have been SAT AND MARKED, whatever the mark
             says. Left unlabelled beside a live pass mark it would read as
             «four passed», so it says which number it is. */
          return `<div class="line">Ground: <b>${esc(cl.slotsDone)}</b> of ${
            esc(WA.slotCount("lessons"))} lessons · <b title="${
            esc("Ground exams SAT AND MARKED — a result is in, whatever it says. It is not how many were passed: a ground exam is passed at " +
                WA.passMin("exams") + " %, and an exam marked below it is still a finished row.")
            }">${esc(cx.slotsDone)}</b> of ${
            esc(WA.slotCount("exams"))} exams</div>`;
        })()
      : "");
    /* one line per entry — items inside an entry are separated by · , so the
       entries themselves must not be, or a multi-item FAIL reads as three */
    const failLine = ["fail", "almost_good"].map((k) => {
      const list = Array.isArray(rec[k]) ? rec[k] : [];
      if (!list.length) return "";
      return `<div class="line">${esc(WA.secLabel(k))}:` + list.map((e) =>
        `<div class="sub">${esc(fmtD(e.date))}${e.flight_code ? " <b>" + WA.sortieCell(e.category, e.flight_code) + "</b>" : ""}
          ${WA.itemsLabelHTML(e)}${WA.itemsCountHTML(e)}${
          e.grade === null || e.grade === undefined ? "" : ` <b>${WA.pct(e.grade)}</b>`}
          ${e.instructor ? `<span class="k">with ${esc(e.instructor)}</span>` : ""}
          ${WA.coTag(e)}</div>`).join("") + `</div>`;
    }).join("");
    /* NOTE (round-4 W3c): no "Evals" count here — every student converges to
       the same eight checkrides, so the number compares nothing. The grades
       on the Evaluations line below are the information. */
    return `
      <div class="selfrep">
        <div class="t">Self-reported record ${s.last_update
          ? `<span class="badge">upd. ${esc(fmtDT(s.last_update))}</span>` : `<span class="badge badge-warn">nothing submitted yet</span>`}
          ${src.any
            ? `<span class="badge badge-acc" title="${esc(src.tip)}">${esc(src.all
                ? "entered by CO" : src.n + " entr" + (src.n === 1 ? "y" : "ies") + " by CO")}</span>`
            : ""}</div>
        <div class="kgrid">
          <span><span class="k">Solos</span> <b>${st.solos}</b></span>
          <span><span class="k">NFS</span> <b>${st.nfs}</b></span>
          <span><span class="k">SMS</span> <b>${st.sms}</b></span>
          <span><span class="k">FAIL</span> <b>${st.fail}</b></span>
          <span><span class="k">Almost Good</span> <b>${st.almost_good}</b></span>
          <span><span class="k">Airsick</span> <b>${st.airsickness}</b></span>
          <span title="${esc(WA.secTip("fpc"))}"><span class="k">FPC</span> <b>${st.fpc}</b></span>
          <span title="${esc(WA.secTip("cef"))}"><span class="k">CEF</span> <b>${st.cef}</b></span>
        </div>
        <div class="line">Evaluations: ${evLine}</div>
        <div class="line">Solo flights: ${soLine}</div>
        ${logLine}
        ${failLine}
      </div>`;
  }

  /* ── THE ASSESSMENT PICKER (round 10) ────────────────────────────────────
     ONE radio group per student — one question, one answer, in scale order.
     A real <input type=radio> and not a chip row, because that is what this
     control now IS: five mutually exclusive answers to a single question, and
     the browser gives arrow-key navigation, the group role and the
     screen-reader wording for free.
     THE THIN RULE IS THE FIGHTER / OTHER SPLIT (round 14). «την γραμμη μεταξυ
     recommended as alternate and recommended for other assignments» — it moved
     up one, and the move is what turned it from a typographic hedge into the
     one boundary this form is asked to draw: the THREE answers above it place a
     student on the fighter track or immediately beside it; the TWO below it
     place him somewhere else in the Air Force. It is drawn from
     WA.LEVEL_SEP_AT, so the scale and the rule can never disagree.
     CLEARING: clicking the selected level again returns the student to "no
     view formed yet" — the same escape the round-8 chips had, which a radio
     group does not offer by itself, and the only way to un-say something the
     instructor did not mean to say. */
  function levelGroup(sid) {
    const cur = P[sid].level;
    return WA.LEVELS.map((l, i) =>
      (i === WA.LEVEL_SEP_AT ? `<div class="lvl-sep" role="separator"></div>` : "") + `
      <label class="lvl-opt lvl-${esc(l.id)}${cur === l.id ? " is-on" : ""}">
        <input type="radio" name="lvl-${esc(sid)}" value="${esc(l.id)}"
               data-lvl="${esc(sid)}"${cur === l.id ? " checked" : ""}>
        <span class="lvl-lbl">${esc(l.label)}</span>
        <span class="lvl-w" title="weight — the scale carries its judgement here, never in a negative word">${l.w}</span>
      </label>`).join("");
  }

  function stuCard(s) {
    const sid = s.person.id;
    const p = P[sid];
    return `
      <section class="card stucard" data-stucard="${esc(sid)}">
        <div class="stu-head">
          <span class="nm">${esc(WA.personName(s.person, true))}</span>
          <span class="meta">${esc([s.person.mn ? "MN " + s.person.mn : "", s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}</span>
        </div>
        ${selfCard(s)}
        <div class="hint" style="margin-bottom:6px">${asCO ? "This instructor&rsquo;s assessment" : "Your assessment"}
          of this student <b>for fighters</b> &mdash; one answer, the strongest first.
          Choosing the selected one again clears it; leaving it unanswered says nothing either way.</div>
        <div class="lvlgroup" role="radiogroup"
             aria-label="Assessment for fighters" data-lvlgroup="${esc(sid)}">${levelGroup(sid)}</div>
        ${/* ROUND 14 — THE PER-STUDENT SAVE IS GONE. «το save οχι για καθε
             μαθητη, αλλα γενικα.» Round 10 argued for it («the card's OWN Save
             announces the dirt») and the argument had one flaw the live form
             makes obvious: an instructor answers a QUESTIONNAIRE about a class,
             not twelve separate forms, and a Save per card asks him to perform
             twelve acts to complete one. The objection round 10 raised against
             a single button — "save which of them?" — is answered by the same
             machinery the student form has had since round 9: DIRT IS MEASURED,
             so the one button saves exactly the cards that differ from what is
             stored, and re-stamps nothing else. */ ""}
        <div class="prop-foot">
          <label class="ck"><input type="checkbox" data-flew="${esc(sid)}" ${p.flew_with ? "checked" : ""}>
            I have flown with this student</label>
          <input type="text" placeholder="Comment (optional)" maxlength="500"
                 value="${esc(p.comment)}" data-comment="${esc(sid)}">
          <span class="prop-st" data-st="${esc(sid)}">${p.savedAt
            ? "Saved ✓ " + esc(fmtDT(p.savedAt)) : "No assessment submitted yet."}</span>
          ${p.enteredBy === "admin"
            ? `<span class="cotag" data-cotag="${esc(sid)}" title="${esc(WA.CO_TIP)}">CO</span>` : ""}
        </div>
      </section>`;
  }

  view.innerHTML = `
    <div class="wrap screen-only" id="ins-form">
      ${asCO ? `
        <div class="cobar" role="note">
          <span class="cotag">CO</span>
          <div class="cotxt"><b>Entering as CO</b> &mdash; you are filling in the assessments of
            <b>${esc(WA.personName(who, true))}</b> &mdash; everything you save here is tagged
            <b>&ldquo;entered by CO&rdquo;</b> and shown as such everywhere, until
            ${esc(who.last_name || "the instructor")} saves the same assessment themselves.</div>
          ${backBtn}
        </div>` : ""}
      <section class="card">
        <div class="idhead">
          <span class="nm">${esc(WA.personName(who, true))}</span>
          <span class="meta">${esc([who.duty, who.leadership, who.status].filter(Boolean).join(" · "))}</span>
        </div>
        <p class="hint" style="margin-top:6px">Utilization assessments for the Wing Commander brief.
          For each student, ${asCO ? "record the one assessment this instructor makes" : "give the one assessment you make"}
          <b>about fighters</b>, on the five-level scale. The number beside each level is its weight
          &mdash; the brief averages them, so the scale says what it means without a single
          discouraging word. Each student card also shows the data the student self-reported.
          ${asCO ? "The instructor can overwrite any of this from their own link." : "You can return and edit any time."}</p>
      </section>
      ${data.students.length
        ? data.students.map(stuCard).join("")
        : `<section class="card"><p class="hint">No active students yet.</p></section>`}
    </div>
    ${/* ROUND 14 — ONE SAVE, and it is the student form's floating pattern:
         this form is one card per student and a dozen screens long, so a
         button at the bottom is a button most of the class never scrolls to.
         It says HOW MANY assessments it is about to write, because that is the
         number the instructor is deciding about. */ ""}
    <div class="savefloat" id="ins-float" hidden>
      <span class="sf-hint" id="ins-float-hint">unsaved</span>
      <button type="button" class="btn btn-primary" id="ins-float-save">Save</button>
    </div>
    <div class="savebar">
      ${asCO ? backBtn : ""}
      <button type="button" class="btn btn-primary" id="ins-save">Save</button>
      <span class="st" id="ins-status">Assessments are kept only after you press Save.</span>
    </div>
    <div class="print-only" id="print-ins"></div>`;

  const root = $("ins-form");

  /* ══════════════════════════════════════════════════════════════════════════
     THE PRINTED ASSESSMENT SHEET (round 8, rewritten for round 10).
     Until round 8 this view had no print block at all, so Ctrl+P printed the
     live form — chips, buttons and all — and the instructor got a screenshot
     of an app instead of a document. It prints what the document actually is:
     a header naming whose assessments these are, and one BLOCK PER STUDENT
     carrying (a) the identity line, (b) THE ASSESSMENT in words and its
     weight, (c) whether the instructor has flown with the student and their
     comment, and (d) the student's own reported record in one compact table,
     which is the evidence the assessment rests on. Monochrome: on paper the
     level is the SENTENCE, never a colour, so the fifth level reads as the
     redirect it is instead of as whatever grey a printer decides to make it.
     ══════════════════════════════════════════════════════════════════════════ */
  function buildInsPrint() {
    const holder = $("print-ins");
    if (!holder) return;
    const pages = data.students.map((s) => {
      const p = P[s.person.id];
      const rec = WA.migrateRecord(s.record);
      const st = WA.recStats(rec);
      const slots = WA.evalSlotRows(rec);
      const solos = WA.filled("solo_flights", rec.solo_flights);
      const doneSlots = solos.filter((e) => e.slot && WA.soloSlot(e.slot)).length;
      const lv = WA.level(p.level);
      return `
        <div class="pr-ins-blk">
          <h3>${esc(WA.personName(s.person, true))}
            <span class="pr-ins-meta">${esc([s.person.mn ? "MN " + s.person.mn : "",
              s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}</span></h3>
          <table class="pr-t"><thead><tr><th>Assessment for fighters</th><th>Weight</th></tr></thead><tbody>
            <tr><td${lv ? ' class="pr-lvl"' : ""}>${lv ? esc(lv.label) : "not assessed yet"}</td>
              <td>${lv ? lv.w : "—"}</td></tr>
          </tbody></table>
          <p class="pr-ins-line"><b>Flown with this student:</b> ${p.flew_with ? "yes" : "no"}
            &nbsp;·&nbsp; <b>Assessment:</b> ${lv
              ? "submitted" + (p.savedAt ? " " + esc(fmtDT(p.savedAt)) : "")
              : "no view recorded"}</p>
          ${p.comment ? `<p class="pr-ins-line"><b>Comment:</b> ${esc(p.comment)}</p>` : ""}
          <p class="pr-ins-sub">The student's own reported record</p>
          <table class="pr-t"><thead><tr>
            <th>Solos</th><th>NFS</th><th>SMS</th><th>FAIL</th><th>Almost Good</th>
            <th>Airsick</th><th>FPC</th><th>CEF</th></tr></thead>
            <tbody><tr><td>${doneSlots} of ${WA.soloSlots().length}</td><td>${st.nfs}</td>
              <td>${st.sms}</td><td>${st.fail}</td><td>${st.almost_good}</td>
              <td>${st.airsickness}</td><td>${st.fpc}</td><td>${st.cef}</td></tr></tbody></table>
          <table class="pr-t"><thead><tr><th>Checkride</th>
            ${slots.slots.map((sl) => `<th>${esc(sl.def.id)}</th>`).join("")}</tr></thead>
            <tbody><tr><td>Grade</td>
              ${slots.slots.map((sl) => `<td>${sl.row ? WA.pct(sl.row.grade) : "not flown"}</td>`).join("")}
            </tr></tbody></table>
        </div>`;
    }).join("");
    holder.innerHTML = `
      <div class="pr-page">
        <div class="pr-brand"><img src="assets/364mea-240.png" alt=""><span>Wings Ahead</span>
          <span class="pr-brand-sub">364 MEA — utilization assessments (fighters)</span></div>
        <h2>${esc(WA.personName(who, true))}</h2>
        <div class="pr-meta">${esc([who.duty, who.leadership, who.status].filter(Boolean).join(" · "))}
          · ${data.students.length} student${data.students.length === 1 ? "" : "s"}
          · printed ${esc(fmtDT(new Date().toISOString()))}${asCO ? " · entered by the squadron CO" : ""}</div>
        ${pages || `<p class="pr-none">No active students.</p>`}
      </div>`;
  }
  buildInsPrint();
  if (!WA._insPrintHooked) {
    WA._insPrintHooked = true;
    window.addEventListener("beforeprint", () => {
      if (WA._insPrint) WA._insPrint();
    });
  }
  WA._insPrint = buildInsPrint;

  /* the group redrawn from state WITHOUT replacing its DOM — the radios keep
     their focus, so ↑/↓ still walks the scale after the first answer. An
     innerHTML refresh here would throw the focus away on every arrow press. */
  function syncLevels(sid) {
    const holder = root.querySelector(`[data-lvlgroup="${sid}"]`);
    if (!holder) return;
    for (const lab of holder.querySelectorAll(".lvl-opt")) {
      const input = lab.querySelector("input[data-lvl]");
      const on = !!input && P[sid].level === input.value;
      lab.classList.toggle("is-on", on);
      if (input) input.checked = on;          // a cleared answer unchecks all five
    }
  }
  /* ── ROUND 14 — DIRT IS MEASURED, AND ONE BUTTON SAVES WHAT IS DIRTY ──────
     «το save οχι για καθε μαθητη, αλλα γενικα.» The round-9 doctrine of the
     student form, applied here: SAVED holds each card as it was last stored,
     the card is dirty when it DIFFERS, and the one Save writes exactly the
     dirty ones. Change something and change it back and the card leaves the
     list, because the assessment really is the stored one again — which is
     also what stops the general Save from re-stamping a row the CO owns and
     the instructor never touched (owner-reclaim only happens where the
     instructor actually answered). */
  const SAVED = {};
  const fp = (x) => JSON.stringify([x.level, !!x.flew_with, String(x.comment || "").trim()]);
  for (const sid of Object.keys(P)) SAVED[sid] = fp(P[sid]);
  function dirtyIds() {
    return Object.keys(P).filter((sid) => fp(P[sid]) !== SAVED[sid]);
  }
  function nameOf(sid) {
    const s = data.students.find((x) => x.person.id === sid);
    return s ? WA.personName(s.person, true) : sid;
  }
  function stateOf(sid) {
    const p = P[sid];
    return { level: p.level, flew_with: !!p.flew_with, comment: String(p.comment || "").trim() };
  }
  function savedStateOf(sid) {
    const a = JSON.parse(SAVED[sid]);
    return { level: a[0], flew_with: a[1], comment: a[2] };
  }
  function markDirty(sid) {
    const d = fp(P[sid]) !== SAVED[sid];
    P[sid].dirty = d;
    if (WA._insPrint) WA._insPrint();
    const st = root.querySelector(`[data-st="${sid}"]`);
    if (st) {
      st.className = "prop-st";
      st.textContent = d
        ? "Unsaved — it will be written by the Save button."
        : (P[sid].savedAt ? "Saved ✓ " + fmtDT(P[sid].savedAt) : "No assessment submitted yet.");
    }
    const card = root.querySelector(`[data-stucard="${sid}"]`);
    if (card) card.classList.toggle("is-dirty", d);
    refreshSave();
  }
  function refreshSave() {
    const n = dirtyIds().length;
    const word = "Save " + n + " assessment" + (n === 1 ? "" : "s") + (asCO ? " as CO" : "");
    for (const id of ["ins-save", "ins-float-save"]) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.textContent = n ? word : "Save" + (asCO ? " as CO" : "");
      b.disabled = !n;
    }
    const f = document.getElementById("ins-float");
    if (f) f.hidden = !n;
    const h = document.getElementById("ins-float-hint");
    if (h) h.textContent = n + " unsaved";
    const st = document.getElementById("ins-status");
    if (st && !st.classList.contains("ok") && !st.classList.contains("err")) {
      st.textContent = n
        ? n + " assessment" + (n === 1 ? "" : "s") + " changed — press Save."
        : "Assessments are kept only after you press Save.";
    }
    /* the floating bar clears the sticky top bar, whatever height it wrapped
       to on this screen (the round-9 measurement, not a hardcoded offset) */
    if (f) f.style.top = (WA.measureTopbar() + 10) + "px";
  }

  root.addEventListener("click", async (ev) => {
    /* THE ASSESSMENT — and its one non-native gesture: clicking the level that
       is already chosen CLEARS it, returning the student to "no view formed
       yet". A radio group cannot be emptied by keyboard or mouse on its own,
       and without this an instructor who mis-clicked would be stuck having
       said something about a person he meant to say nothing about.
       P[sid].level still holds the PREVIOUS value at this point (the browser
       has flipped the input, not our state), so the comparison is the test. */
    const radio = ev.target.closest("input[data-lvl]");
    if (radio) {
      const sid = radio.dataset.lvl;
      P[sid].level = (P[sid].level === radio.value) ? null : radio.value;
      syncLevels(sid);
      markDirty(sid);
      return;
    }
  });

  /* ── ROUND 14 — THE ONE GENERAL SAVE ──────────────────────────────────────
     ONE ACT, ONE STUDENT AT A TIME ON THE WIRE. There is deliberately no batch
     RPC: wa.write_proposal carries the whole per-proposal contract — the level
     normalisation, the owner-reclaim that clears the CO tag when the owner
     answers, the CO stamp when the CO does — and a second write path would be
     a second place for those rules to live. So the button iterates the DIRTY
     cards over the RPC that already exists, and reports per card: an assessment
     the server refuses leaves that one card unsaved and named, and the rest of
     the class still lands. */
  async function saveAll(ids) {
    const st = $("ins-status");
    const btns = [$("ins-save"), document.getElementById("ins-float-save")].filter(Boolean);
    btns.forEach((b) => { b.disabled = true; });
    st.className = "st";
    st.textContent = "Saving " + ids.length + "…";
    let ok = 0;
    const failed = [];
    for (const sid of ids) {
      const cst = root.querySelector(`[data-st="${sid}"]`);
      if (cst) { cst.className = "prop-st"; cst.textContent = "Saving…"; }
      try {
        const payload = { level: P[sid].level,
                          flew_with: P[sid].flew_with,
                          comment: P[sid].comment.trim() || null };
        const res = asCO
          ? await rpc("admin_save_proposal", { p_token: WA.token, p_instructor_id: O.targetId,
                                               p_student_id: sid, p_payload: payload })
          : await rpc("save_proposal", { p_token: WA.token, p_student_id: sid, p_payload: payload });
        P[sid].savedAt = res.updated_at;
        P[sid].enteredBy = res.entered_by || null;
        /* the server's verdict, not our guess: wa.write_proposal normalises
           the level and returns what it stored, so a value the form and the
           database could ever disagree about is settled here */
        P[sid].level = WA.level(res.level) ? res.level : null;
        P[sid].dirty = false;
        SAVED[sid] = fp(P[sid]);
        syncLevels(sid);
        if (cst) {
          cst.className = "prop-st ok";
          cst.textContent = "Saved ✓ " + fmtDT(res.updated_at) +
            (P[sid].level ? " — " + WA.levelLabel(P[sid].level) : " — no assessment recorded") +
            (asCO ? " — tagged as entered by CO" : "");
        }
        const card = root.querySelector(`[data-stucard="${sid}"]`);
        if (card) card.classList.remove("is-dirty");
        /* mirror the server's stamp: the OWNER saving clears it (db/schema.sql
           → wa.write_proposal), the CO saving sets it */
        const tag = root.querySelector(`[data-cotag="${sid}"]`);
        if (asCO && !tag && cst) {
          cst.insertAdjacentHTML("afterend",
            `<span class="cotag" data-cotag="${esc(sid)}" title="${esc(WA.CO_TIP)}">CO</span>`);
        } else if (!asCO && tag) tag.remove();
        ok++;
      } catch (e) {
        failed.push({ sid, msg: e.message });
        if (cst) { cst.className = "prop-st err"; cst.textContent = "Save failed: " + e.message; }
      }
    }
    if (WA._insPrint) WA._insPrint();
    btns.forEach((b) => { b.disabled = false; });
    refreshSave();
    if (failed.length) {
      st.className = "st err";
      st.textContent = ok + " saved · " + failed.length + " refused — " +
        nameOf(failed[0].sid) + ": " + failed[0].msg;
      toast(failed.length + " assessment" + (failed.length === 1 ? "" : "s") + " could not be saved", true);
      const card = root.querySelector(`[data-stucard="${failed[0].sid}"]`);
      if (card) card.scrollIntoView({ block: "center" });
    } else {
      st.className = "st ok";
      st.textContent = ok + " assessment" + (ok === 1 ? "" : "s") + " saved ✓ " +
        fmtDT(new Date().toISOString()) + (asCO ? " — tagged as entered by CO" : "");
      toast(asCO
        ? ok + " assessment" + (ok === 1 ? "" : "s") + " saved as CO — they are tagged"
        : ok + " assessment" + (ok === 1 ? "" : "s") + " saved");
    }
  }
  /* the change list, then the write — «ποιος εγραψε … και σε σχεση με τι» */
  async function confirmedSaveAll() {
    const ids = dirtyIds();
    if (!ids.length) return;
    const before = {}, after = {};
    for (const sid of ids) { before[sid] = savedStateOf(sid); after[sid] = stateOf(sid); }
    const changes = WA.proposalChanges(before, after, nameOf);
    const ans = await WA.confirmSave({
      who: WA.personRankName(WA.me || {}),
      onBehalf: asCO ? WA.personRankName(who) : "",
      title: "Save " + ids.length + " assessment" + (ids.length === 1 ? "" : "s") + "?",
      what: asCO
        ? "These are recorded as this instructor’s assessments and tagged “entered by CO”. Every one of them is about FIGHTERS, on the five-level scale."
        : "These are your assessments for the Wing Commander brief — one answer per student, about FIGHTERS, on the five-level scale.",
      savedWord: "last saved",
      changes,
    });
    if (ans === "keep") return;
    if (ans === "discard") {
      for (const sid of ids) {
        const a = savedStateOf(sid);
        P[sid].level = a.level;
        P[sid].flew_with = a.flew_with;
        P[sid].comment = a.comment;
        syncLevels(sid);
        const box = root.querySelector(`[data-comment="${sid}"]`);
        if (box) box.value = a.comment;
        const ck = root.querySelector(`[data-flew="${sid}"]`);
        if (ck) ck.checked = a.flew_with;
        markDirty(sid);
      }
      if (WA._insPrint) WA._insPrint();
      toast(changes.length + " change" + (changes.length === 1 ? "" : "s") +
        " discarded — the form is back to the last saved assessments");
      return;
    }
    await saveAll(ids);
  }
  $("ins-save").addEventListener("click", confirmedSaveAll);
  $("ins-float-save").addEventListener("click", confirmedSaveAll);
  refreshSave();
  if (!WA._insFloatHooked) {
    WA._insFloatHooked = true;
    window.addEventListener("resize", () => {
      const f = document.getElementById("ins-float");
      if (f) f.style.top = (WA.measureTopbar() + 10) + "px";
    });
  }

  root.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset.flew) { P[el.dataset.flew].flew_with = el.checked; markDirty(el.dataset.flew); }
    else if (el.dataset.comment) { P[el.dataset.comment].comment = el.value; markDirty(el.dataset.comment); }
  });

  /* ↑/↓/←/→ inside the group select without ever producing a click, so the
     keyboard path needs its own listener. It only ever SELECTS — clearing is
     the click-the-chosen-one gesture — and the guard keeps it from running a
     second time over what the click handler has already applied. */
  root.addEventListener("change", (ev) => {
    const input = ev.target.closest && ev.target.closest("input[data-lvl]");
    if (!input) return;
    const sid = input.dataset.lvl;
    if (P[sid].level === input.value) return;
    P[sid].level = input.value;
    syncLevels(sid);
    markDirty(sid);
  });

  /* Back to the dashboard — the admin token stays in the hash */
  if (asCO) {
    view.addEventListener("click", (ev) => {
      if (!ev.target.closest("[data-coback]")) return;
      const n = dirtyIds().length;
      if (n && !window.confirm(
        n + " assessment" + (n === 1 ? " has" : "s have") +
        " unsaved changes. Leave without saving?")) return;
      for (const k of Object.keys(P)) { P[k].dirty = false; SAVED[k] = fp(P[k]); }
      location.hash = WA.adminHash();
    });
  }

  WA._insState = P;
  if (!WA._insUnloadHooked) {
    WA._insUnloadHooked = true;
    window.addEventListener("beforeunload", (ev) => {
      const p = WA._insState;
      if (p && Object.values(p).some((x) => x.dirty)) { ev.preventDefault(); ev.returnValue = ""; }
    });
  }
};
