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
   server-side) and adds the "entering as the admin" banner; nothing else forks.
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

  /* ══════════════════════════════════════════════════════════════════════════
     ROUND 18 — THIS FORM IS ABOUT ONE CLASS, AND IT SAYS WHICH.
     ──────────────────────────────────────────────────────────────────────────
     RULING (2026-08-26): «Τωρα τελειωνουν της 98Β, οποτε μονο για αυτους θελω
     προτασεις … Θελουμε την σειρα την οποια τελειωνει, οχι ολες τις ενεργες.»

     THE FILTER IS THE SERVER'S, NOT THIS FILE'S. `data.students` arrives
     already narrowed (wa.instructor_dataset → wa.student_in_scope), which is
     why the cards, the rail and the «N of M chosen» head all follow without a
     single one of them being told about classes: they are all built from that
     one list, and they were built from it before this round. A client-side
     filter here would have been a fourth place to keep in step, and the one
     place a stale tab could ignore.

     WHAT THE CLIENT ADDS IS THE SENTENCE. An empty list means one of two very
     different things — «no class is open for assessment» or «this class has
     nobody in it» — and neither of them is «your link is broken», which is what
     a blank page says. So the scope travels with the payload and the form
     states it out loud, at the top, whether the list is empty or not: an
     instructor must never have to GUESS which class he is answering about.

     A SERVER THAT PREDATES THIS ROUND SAYS NOTHING, AND «NOTHING» IS NOT
     «CLOSED». The key is ABSENT from an un-migrated instance's payload and NULL
     on a migrated one with no class open — two different facts, and reading the
     first as the second would print «assessments are closed» over a full list
     of cards. The deployment gate moves the schema first, so this is a belt on
     top of braces; it costs one comparison and it keeps the form from
     contradicting itself if the two halves are ever deployed out of order.
     ══════════════════════════════════════════════════════════════════════════ */
  const scoped = data.assessment_class !== undefined;   /* a round-18 server? */
  const scope = data.assessment_class || null;
  const scopeLine = !scoped
    ? ""
    : scope
      ? "Assessments are open for class " + scope + "."
      : "Assessments are closed — no class is open for assessment at the moment.";
  const SCOPE_TIP = scope
    ? "The squadron assesses ONE class at a time — the one that is finishing. " +
      scope + " is the class currently open, so these are its students and no others. " +
      "Students of every other class are simply not asked about right now; nothing already " +
      "submitted about them has been lost, and the admin can open a different class at any time."
    : "No class is open for assessment at the moment. The admin opens one on the dashboard, " +
      "and until then nothing can be recorded here. Everything already submitted is kept.";
  /* the empty page, said in the terms of the reason it is empty */
  const emptyLine = !scoped
    ? "No active students yet."
    : !scope
      ? "There is nothing to assess yet. " + scopeLine +
        " The squadron assesses one class at a time — the one that is finishing — and the admin has not opened one. " +
        "Nothing you have submitted before has been lost: it is all still on the dashboard."
      : "No active student is in class " + scope + " at the moment, so there is nothing to assess here. " +
        "The class is open for assessment; it simply has nobody active in it.";

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
       the admin" is only true when ALL of it was; one admin addition to a
       student's own record is an addition, and the badge says so */
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
       are the admin's drill-down and the student's own form; a card that printed
       eighty of them would stop being readable at the moment it matters. */
    const logLine = ["flights", "fs"].map((k) => {
      const list = Array.isArray(rec[k]) ? rec[k] : [];
      /* ROUND 13 — an empty log is no longer an empty line: the syllabus is
         pre-seeded, so "nothing flown" has a denominator and the card says it */
      /* ROUND 22 — «nothing flown yet» is only true when nothing is flown
         ANYWHERE: a checkride recorded in Evaluations and a solo recorded in
         Solo flights fill positions of this log without putting a row in it,
         and a card that read the array’s length alone would tell an instructor
         the student had not flown a sortie the record says they passed. */
      const cn0 = WA.stateCounts(k, list, null, rec);
      if (!list.length && !cn0.derived) {
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
      const cn = cn0;
      return `<div class="line">${esc(WA.secLabel(k))}: ${per || `<span class="k">—</span>`}` +
        (cn.derived ? ` <span class="k" title="${esc("Flown, and recorded in the sections that own them — the checkrides in Evaluations, the solos in Solo flights. They are not rows of this log and they are not owed in it.")}">· ${esc(cn.derived)} recorded elsewhere</span>` : "") +
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
          const cl = WA.stateCounts("lessons", rec.lessons, null, rec);
          const cx = WA.stateCounts("exams", rec.exams, null, rec);
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
                ? "entered by " + WA.ADMIN_WORD
                : src.n + " entr" + (src.n === 1 ? "y" : "ies") + " by " + WA.ADMIN_WORD)}</span>`
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

  /* ══════════════════════════════════════════════════════════════════════════
     ROUND 17 — THE STUDENT RAIL, AND THE TWO COLOURS THAT ARE ITS WHOLE POINT.
     ──────────────────────────────────────────────────────────────────────────
     «στο instructor recommendation θα ήθελα navigation panel με τους μαθητές.
      Πράσινη χροιά όποιο έχει βάλει επιλογή, μουσταρδί ότι δεν έχει επιλέξει
      κάτι ακόμη» (2026-08-22)

     THE SAME COMPONENT AS ROUND 14, one row per STUDENT CARD instead of one per
     section: WA.navHTML / WA.navMount, told how to find a card (the cards carry
     their own ids, exactly as the admin's analysis cards do) and handed a
     `rowTone` — the one thing the component grew this round.

     WHAT MAKES A ROW GREEN. A CHOICE, and nothing else: an assessment level
     currently selected on that card, whether it is saved or still pending. Not
     a comment, not the flew-with tick — those are notes ABOUT a judgement and
     an instructor who wrote a comment and chose no level has still said nothing
     the brief can average. So the test is P[sid].level, which is the form's own
     working state and therefore truthful through every flow there is: a click
     flips it, clicking the chosen level again clears it back to mustard, the
     dialog's discard restores the saved value, and the general save replaces it
     with the server's verdict.
     THE COUNT IN THE HEAD is the same fact for the whole class — «7 of 9
     chosen» — so the rail answers «how much of this is left?» without being
     read row by row.
     THE RAIL IS THE CARD LIST, LITERALLY: both are built from data.students in
     the order it arrives (seniority / class order, as-is), so a filter or a
     grouping added here later moves both or neither — they cannot drift.
     ══════════════════════════════════════════════════════════════════════════ */
  function hasChoice(sid) { return !!(P[sid] && P[sid].level); }
  /* ROUND 19 APPENDED A CURRENCY ROW HERE, AND ROUND 20 TOOK IT BACK OUT. The
     rail's own rule — «the rail is the card list, literally» — held for the
     students and was bent for that one row, because the currency section sat
     below nine tall cards on the same page and would otherwise never be
     scrolled to. The doors solved that better: the currency is its own view
     with its own tile on the landing, so the rule is unbent and the rail is
     the student cards again, in their order, and nothing else. */
  function navItems() {
    return data.students.map((s) => {
      const sid = s.person.id;
      const lv = hasChoice(sid) ? WA.level(P[sid].level) : null;
      const meta = [s.person.mn ? "MN " + s.person.mn : "",
                    s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · ");
      return {
        id: sid,
        /* rank + surname, the way the squadron says a name — the full name and
           the class travel in the tip, where there is room for them */
        label: WA.personRankName(s.person),
        tip: WA.personName(s.person, true) + (meta ? " · " + meta : "") + " — " +
             (lv ? lv.label + " (weight " + lv.w + ")" +
                   (P[sid].dirty ? " — chosen, not saved yet" : "")
                 : "no assessment chosen yet — this student is still owed one") +
             ". Click to go to the card.",
        /* the weight IS the assessment in one glyph — the number the brief
           averages, and the one the card prints beside every level */
        badge: lv ? String(lv.w) : "not yet",
        tone: lv ? "good" : "mustard",
        rowTone: lv ? "done" : "extra",
      };
    });
    /* ROUND 20 — AND THE CURRENCY ROW IS GONE FROM IT. Round 19 appended it
       here because the section sat below nine tall cards on the same page and
       would otherwise never be scrolled to. It is now behind its own door with
       its own tile on the landing, so a rail row pointing at a card that is not
       in this view would scroll to nothing. The rail is about the students
       again, which is what its head has always counted. */
  }
  function navSummary() {
    const n = data.students.length;
    if (!n) return "";
    return data.students.filter((s) => hasChoice(s.person.id)).length + " of " + n + " chosen";
  }
  function refreshNav() { if (WA._nav) WA._nav.refresh(navItems()); }

  /* ══════════════════════════════════════════════════════════════════════════
     ROUND 19 — «MY CURRENCY»: THE INSTRUCTOR'S OWN FLYING, ON HIS OWN LINK.
     ──────────────────────────────────────────────────────────────────────────
     RULING (2026-08-26): «στο link που θα στέλνουμε σε κάθε εκπαιδευτή θέλω να
     μπορεί να περάσει κι εκείνος, πέρα από την αξιολόγηση, κάποια δική του
     πτήση S και τα αντίστοιχα Ε. Επίσης να μπορεί να περάσει Ε και σε μια πτήση
     με μαθητή πέρα από τις S. Αυτό θα είναι μια γέφυρα για το currency του
     FDMS.»

     IT IS A PLAIN TABLE, AND THAT IS THE WHOLE DESIGN. The student's log tables
     are pre-seeded from the printed flow chart and wear four state colours,
     because there the syllabus KNOWS what is owed. Here nothing is owed by a
     form: an instructor's flying is open-ended, so there is no denominator, no
     placeholder row and no state chip — a chip saying «owed» would invent a
     requirement the 3-01 states somewhere else entirely. Rows are added by
     «+ flight», they sort themselves newest first, and an empty section says so
     in one line instead of drawing an empty skeleton.

     AND IT IS READ-ONLY ON THE ADMIN'S TWIN. `asCO` renders every cell as text
     and offers no control that writes: a currency claim says who flew what, and
     the admin was not in the aircraft. The server agrees by having no admin
     write path at all (db/schema.sql → wa.write_instructor_record), so this is
     not a client-side courtesy a hand-made request could step around.
     ══════════════════════════════════════════════════════════════════════════ */
  const CUR_SEC = "ins_currency";
  const curRO = asCO;
  /* the working rows, materialised: `seq` and `e_items` are always present, so
     the fingerprint of a row the server just returned and of the row the form
     is holding are built from the same shape (the payload drops both again
     where they say nothing — see curPayload) */
  const curLoad = (list) => WA.migrateInsRecord({ currency: list }).currency
    .map((e) => ({ ...e, seq: WA.curSeq(e), e_items: WA.eItemsOf(e) }));
  const C = { rows: curLoad(data.currency) };
  let curSavedAt = data.currency_last_update || null;
  /* A ROW WITH NOTHING IN IT IS NOT AN ENTRY — the wa.slot_empty rule, said for
     a section that has no slots: «+ flight» pressed and then ignored must not
     become a refusal, a change line or a stored row. */
  const curBlank = (e) => !e.date && !e.kind && !e.s_category && !e.sortie &&
                          !(e.e_items || []).length;
  const curLive = () => C.rows.filter((e) => !curBlank(e));
  const curFp = (rows) => JSON.stringify(rows.map(WA.fpEntry));
  let CUR_SAVED = curFp(curLive());
  let CUR_SAVED_ROWS = curLive().map((e) => ({ ...e, e_items: (e.e_items || []).slice() }));
  const curIsDirty = () => curFp(curLive()) !== CUR_SAVED;
  const curChanges = () => WA.recordChanges(
    { [CUR_SEC]: CUR_SAVED_ROWS }, { [CUR_SEC]: curLive() }, [CUR_SEC]);
  /* ── WHAT THE SAVE DIALOG SAYS THESE ROWS ARE (round 22, WA-21 verify
     finding 2) ───────────────────────────────────────────────────────
     Round 20 had ONE kind of row, so ONE sentence was the truth. Round 21 gave
     the section two, and a Σ category is now a property of exactly one of them
     — so the round-20 sentence («each row names the Σ category … and the
     E-items») is false in front of every with-SP row, on the one screen where
     the instructor SIGNS the claim. This reads the rows actually about to be
     stored and describes those: the Σ half only where a Σ is really there,
     the sortie half only where a sortie is, and both when both are. */
  function curSaveWhat() {
    const live = curLive();
    const nC = live.filter((e) => e.kind === "continuation").length;
    const nS = live.filter((e) => e.kind === "with_sp").length;
    const ev = "the E-items of the 3-01 it exercised";
    const sigma = "its Σ category of Πίνακας 9 / Πίνακας 6";
    const sortie = "the student’s sortie";
    if (nC && nS) {
      return "Each row names the day, what was flown and " + ev + " — a Continuation flight names " +
        sigma + " (" + nC + " here), a With-SP flight names " + sortie + " and carries no Σ (" + nS + " here).";
    }
    if (nC) return "Each row names the day, " + sigma + " and " + ev + ".";
    if (nS) {
      return "Each row names the day, " + sortie + " that was flown and " + ev +
        " — a With-SP row carries no Σ category.";
    }
    return "Each row names the day, what was flown and " + ev + ".";
  }
  /* what actually goes on the wire: the keys that say nothing are dropped, so
     a record never stores «seq: 1», an empty event list, or the field the
     row's KIND does not take — a Continuation row ships its Σ category, a
     with-SP row its sortie (or, on a legacy carrier, the old Σ claim). */
  function curPayload() {
    return curLive().map((e) => {
      const o = { date: e.date || null, kind: e.kind || null };
      if (e.s_category) o.s_category = e.s_category;
      if (e.sortie) o.sortie = e.sortie;
      if (WA.curSeq(e) > 1) o.seq = WA.curSeq(e);
      if ((e.e_items || []).length) o.e_items = (e.e_items || []).slice();
      return o;
    });
  }
  /* the three facts that make two sorties of one day two rows and not one —
     the WA.curIdent coalesce minus the seq it exists to hand out */
  const curTrip = (e) => [String(e.kind || ""),
                          String(e.s_category || "") || WA.normCode(e.sortie || ""),
                          String(e.date || "")].join("|");
  /* SEQ IS AUTHORED — the box is on the row and the instructor may change it —
     but the form never hands him a number the server is about to refuse. When a
     row's identity lands on one that already exists it takes the lowest free
     number instead, and the toast says so: silently keeping the collision would
     turn a saved section into a refusal at the last moment. */
  function curFixSeq(i) {
    const me = C.rows[i];
    if (!me || curBlank(me)) return 0;
    const taken = {};
    C.rows.forEach((r, k) => {
      if (k !== i && !curBlank(r) && curTrip(r) === curTrip(me)) taken[WA.curSeq(r)] = true;
    });
    if (!taken[WA.curSeq(me)]) return 0;
    for (let s = 1; s <= 9; s++) {
      if (!taken[s]) { me.seq = s; return s; }
    }
    return 0;
  }
  /* the rows that cannot be saved yet, named the way the instructor reads them.
     The server refuses these too, by field — but «required date missing
     (currency[2].date)» is an address, and this is a sentence.
     ROUND 21 — asked PER KIND: a Continuation flight still needs its Σ
     category; a with-SP flight still needs what was flown (a legacy carrier —
     the old Σ claim and no sortie — is complete as it stands). */
  function curNeedsWhat(e) {
    if (!e.kind) return false;
    if (e.kind === "continuation") return !e.s_category;
    if (e.kind === "with_sp") return !e.sortie && !e.s_category;
    return false;
  }
  function curIncomplete() {
    return C.rows.map((e, i) => ({ e, i })).filter(({ e }) =>
        !curBlank(e) && (!e.date || !e.kind || curNeedsWhat(e))).map(({ e, i }) => {
      const miss = [!e.date ? "a date" : "",
                    !e.kind ? "whether it was a Continuation flight or one with an SP" : "",
                    e.kind === "continuation" && curNeedsWhat(e)
                      ? "which Σ category it was" : "",
                    e.kind === "with_sp" && curNeedsWhat(e)
                      ? "what was flown — the student's sortie, or repeat / fcf / cef, or the code" : ""]
                   .filter(Boolean);
      const nm = WA.rowLabel(CUR_SEC, e) ||
        (e.e_items || []).map(WA.eItemCode).join(" · ") || "a new flight";
      return { i, text: nm + " — still needs " + miss.join(" and ") };
    });
  }
  /* THE ROW THE REFUSAL NAMES, MARKED (the 12b pattern, .is-problem): a
     sentence that points at a row is only half of an instruction until the eye
     knows which row it points at. Four seconds, background only. */
  function curMark(i) {
    const tr = document.querySelector(`#ins-cur [data-currow="${i}"]`);
    if (!tr) return;
    tr.classList.add("is-problem");
    tr.scrollIntoView({ block: "center" });
    const box = tr.querySelector("input, select");
    if (box) box.focus();
    setTimeout(() => tr.classList.remove("is-problem"), 4000);
  }

  /* ── ROUND 20 — THE E CELL SAYS «MANY», AND IT SAYS IT FIRST ─────────────
     «δυνατότητα πολλαπλών Ε». Multi-E has been in the data since round 19; what
     was missing was any sign of it. The cell offered a «— add an event —»
     select — a list of ONE that happens to be repeatable, which is what a form
     looks like when it does not take many — so a sortie that exercised four
     events was recorded with one. The select is gone: the cell now carries a
     COUNT CHIP and one button that opens the picker (WA.pickEvents), which puts
     all 27 on screen at once with a filter over them, exactly as the FDMS
     dialog does. The chips stay, and each keeps its own ✕: taking one event off
     a sortie is a single gesture and should not require opening a dialog. */
  function curEventsCell(i, e) {
    const ids = e.e_items || [];
    const chips = ids.map((id, k) => {
      const known = !!WA.eItem(id);
      return `<span class="mschip${known ? "" : " is-legacy"}" title="${esc(WA.eItemTip(id))}">${
        esc(WA.eItemCode(id))}${known ? "" : ` <span class="k">unknown</span>`}${curRO ? ""
        : `<button type="button" class="x" data-curerm="${esc(i)}:${esc(k)}"
                   aria-label="Remove ${esc(WA.eItemCode(id))}">&#10005;</button>`}</span>`;
    }).join("");
    const countTip = ids.length
      ? ids.length + " of the " + WA.E_ITEMS.length + " events of the 3-01 are recorded on this sortie: " +
        ids.map(WA.eItemText).join(" · ")
      : "No event is recorded on this sortie. A sortie that exercised none is still a sortie — " +
        "this is a valid row, not an unfinished one.";
    return `<div class="ms-chips">${ids.length
        ? `<span class="ms-n" title="${esc(countTip)}">${esc(ids.length)}</span>` : ""}${chips
        || `<span class="ms-none" title="${esc(countTip)}">${curRO ? "no event recorded" : "no event yet"}</span>`}</div>` +
      (curRO ? "" : `<button type="button" class="btn btn-sm ms-pick" data-curepick="${esc(i)}"
         title="${esc("Opens the EVENTS table of the 3-01 (Ch.4 §48) — all " + WA.E_ITEMS.length +
                      " of them, with a filter — and you tick every event this sortie exercised. " +
                      "A sortie exercises as many as it exercises; nothing is written until you press Done.")}"
         aria-label="Choose the events of this flight">${ids.length
           ? "&#9998; " + ids.length + " event" + (ids.length === 1 ? "" : "s")
           : "+ events"}</button>`);
  }
  /* ── ROUND 20 — THE CATEGORY BOX, GROUPED BY THE TABLE IT IS PRINTED IN ──
     Twelve printed rows plus FDMS's two columns is a list an <optgroup> makes
     readable and a flat list does not: ΑΕΡΟΣ (Πίνακας 9) above, F/S (Πίνακας 6)
     below, in the order the 3-01 prints them. THE LEGACY IDS ARE NOT OFFERED —
     they may be stored and must never be chosen — but a row that HOLDS one
     keeps it selectable in its own box, marked, so the value is visible and can
     be corrected instead of vanishing the moment the select is drawn. */
  function curCatOptions(e) {
    const cur = String(e.s_category || "");
    /* the Test-Pilot mark is a HINT and not a gate (the option is offered to
       everybody — see the generator's argument), and it is added only where the
       printed name does not already carry it: SIM-ΔΑ's own name ends in «(Test
       Pilots only)», and «(Test Pilots only) (Test Pilots)» is what a rule
       applied without looking at its subject reads like. */
    const opt = (c) => `<option value="${esc(c.id)}"${cur === c.id ? " selected" : ""}
        title="${esc(WA.sCatTip(c.id))}">${esc(c.c + " — " + c.n)}${
        (c.tp && !/test pilot/i.test(c.n)) ? " (Test Pilots)" : ""}${
        (c.dp && !/demo pilot/i.test(c.n)) ? " (Demo pilots)" : ""}</option>`;
    /* ROUND 21 — the optgroups are titled by the PRINTED TABLES, a source
       citation and not a programme badge: the Programme column died with the
       ruling («Το PROGRAMME δεν χρειάζεται»), and «Πίνακας 9 (ΑΕΡΟΣ)» is where
       the category is printed, which is a different fact from a derived label
       beside every row. */
    const grp = (g) => {
      const items = WA.sCatOptions().filter((c) => c.g === g);
      if (!items.length) return "";
      return `<optgroup label="${esc(g === "aeros" ? "Πίνακας 9 (ΑΕΡΟΣ)" : "Πίνακας 6 (F/S)")}">${
        items.map(opt).join("")}</optgroup>`;
    };
    const lost = cur && !WA.sCat(cur)
      ? `<option value="${esc(cur)}" selected>${esc(cur)} &mdash; not in the 3-01 list</option>` : "";
    const legacy = WA.sCatIsLegacy(cur)
      ? `<optgroup label="Recorded before the Σ taxonomy">
           <option value="${esc(cur)}" selected title="${esc(WA.sCatTip(cur))}">${
             esc(WA.sCatText(cur))}</option></optgroup>` : "";
    return `<option value=""${cur ? "" : " selected"}>&mdash; choose &mdash;</option>` +
      lost + legacy + grp("aeros") + grp("fs");
  }
  /* ── ROUND 21 — THE WITH-SP PICKER: THE STUDENTS' OWN SYLLABUS ───────────
     «Όταν η επιλογή είναι With SP να ανοίγουν οι πτήσεις των μαθητών, έξτρα
     repeat, fcf, cef.» BOTH bands open — the students fly aircraft AND
     simulator with instructors — as the 8 (band, track) tables of the
     generated R12 catalogue (WA_LOG_SORTIES; no new catalogue file), led by
     one «Beyond the syllabus» group carrying the three markers. Off-catalogue
     text arrives through the student form's own escape — the «Other…» option
     that swaps the box to free text — and is saved IN CAPITALS and shown
     marked (round 22 / WA-21 verify finding 3: `sortie` is a wa.code_fields
     name, so the normalisation boundary upper-cases it — the promise says so
     now): the syllabus data may lag reality and a record must never become
     unstorable. Band is NEVER stored: WA.sortieBand derives it where the code
     is known, and honestly derives nothing for markers and free text. */
  function curSortieOptions(e) {
    const cur = String(e.sortie || "");
    const curN = WA.normCode(cur);
    const mk = WA.withspMarker(cur);
    const opt = (v, t, tip, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}${
      tip ? ` title="${esc(tip)}"` : ""}>${esc(t)}</option>`;
    let out = `<option value=""${cur ? "" : " selected"}>&mdash; choose &mdash;</option>`;
    if (cur && !WA.curSortieKnown(cur)) {
      out += opt(cur, cur + " — off-catalogue",
        "Not in the generated syllabus catalogue — " + WA.OFFCAT_SAVED + " " +
        "The syllabus data may lag reality, and a record must never become unstorable.", true);
    }
    out += `<optgroup label="Beyond the syllabus">` +
      WA.WITHSP_MARKERS.map((m) => opt(m.id, m.label, m.tip, !!(mk && mk.id === m.id))).join("") +
      `</optgroup>`;
    for (const b of WA.LOG_BANDS) {
      for (const t of WA.TRACKS) {
        const list = WA.logSorties(b.id, t);
        if (!list.length) continue;
        out += `<optgroup label="${esc(b.short + " — " + WA.itemCatLabel(t))}">` +
          list.map((s) => opt(s.c, s.c + " — " + s.n,
            "Training Section " + s.g + (s.h ? " · syllabus " + s.h + " h" : "") +
            (s.nt ? " · night" : ""),
            !mk && curN === s.c)).join("") + `</optgroup>`;
      }
    }
    out += `<option value="__other__"
      title="${esc("Frees the box to plain text — for a code the catalogue does not know yet. It is " + WA.OFFCAT_SAVED)}">Other&hellip; (type the code)</option>`;
    return out;
  }
  /* the ONE what-was-flown cell, per kind: a Continuation flight names its Σ
     category; a with-SP flight names the student's sortie — and a with-SP row
     still carrying the OLD FORM's Σ claim (rounds 19/20 stored a Σ on
     'student' rows) wears it as a marked chip until a sortie replaces it. */
  function curWhatCell(i, e) {
    if (!e.kind) {
      return `<span class="k" title="${esc("Choose Continuation or With SP first — a Continuation flight names its Σ category of Πίνακας 9 / Πίνακας 6, a With-SP flight names the student's sortie.")}">&mdash; choose the flight first &mdash;</span>`;
    }
    if (e.kind === "continuation") {
      return `<select class="catbox" data-curf="${esc(i)}:s_category"
             title="${esc(WA.sCatTip(e.s_category))}"
             aria-label="Which Σ category this Continuation flight was">${curCatOptions(e)}</select>`;
    }
    const carrier = !e.sortie && e.s_category;
    const chip = carrier
      ? `<span class="mschip is-legacy" title="${esc(
          "Recorded before the student-sortie catalogue — the old form asked for a Σ category on a with-SP flight. Σ as claimed: " +
          WA.sCatText(e.s_category) + ". Nobody can reconstruct the student's sortie code from the claim, and the form will not guess: " +
          "choose the sortie to replace it, or leave the row exactly as it stands.")}">Σ as claimed: ${
          esc(WA.sCatCode(e.s_category))}</span> `
      : "";
    if (e._sfree) {
      /* ROUND 22 (WA-21 verify finding 1) — THE BOX AND ITS WAY BACK ARE ONE
         CONTROL. The two used to be bare siblings in a `white-space: nowrap`
         cell: the input took its own default width, the button was pushed past
         the cell's edge and at 1280 px it slid UNDER the # column's seq box,
         where roughly half of it could not be clicked at all. They are wrapped
         now, and .curtbl .freewrap lays them out as a flex pair that stays
         inside the cell at every width — the button clickable across its whole
         face, and the input free to shrink instead of shoving. */
      return chip + `<span class="freewrap"><input type="text" data-curf="${esc(i)}:sortie"
             value="${esc(e.sortie || "")}"
             maxlength="40" placeholder="e.g. C4101 or FCF profile 2" autocomplete="off"
             aria-label="What was flown with the SP — free text"
        ><button type="button" class="btn btn-sm" data-curslist="${esc(i)}"
          title="${esc("Back to the syllabus list. Whatever is typed stays in the box until you change it.")}">list</button></span>`;
    }
    return chip + `<select class="catbox" data-curf="${esc(i)}:sortie"
           title="${esc(e.sortie ? WA.curSortieText(e.sortie)
             : "What was flown with the SP: the student's syllabus sortie (either band), or repeat / fcf / cef, or Other… to type a code the catalogue does not know.")}"
           aria-label="What was flown with the SP">${curSortieOptions(e)}</select>` +
      (e.sortie && !WA.curSortieKnown(e.sortie)
        ? ` <span class="badge badge-warn" title="${esc("Not in the generated syllabus catalogue — " + WA.OFFCAT_SAVED + " The syllabus data may lag reality.")}">off-catalogue</span>`
        : "");
  }
  /* what the RO twin and the logbook print in the same cell */
  function curWhatText(e) {
    if (e.s_category) return WA.sCatText(e.s_category);
    if (e.sortie) return WA.curSortieText(e.sortie);
    return "—";
  }
  function curRowHTML(e, i) {
    const legacy = WA.sCatIsLegacy(e.s_category) ||
                   (e.kind === "with_sp" && !!e.s_category);
    if (curRO) {
      return `<tr${legacy ? ` class="is-legacy"` : ""}>
        <td>${esc(e.date ? fmtD(e.date) : "—")}</td>
        <td>${esc(WA.currencyKindLabel(e.kind))}</td>
        <td title="${esc(e.s_category ? WA.sCatTip(e.s_category)
            : (e.sortie ? WA.curSortieText(e.sortie) : ""))}">${esc(curWhatText(e))}${
          e.kind === "with_sp" && e.s_category
            ? ` <span class="k">(Σ as claimed — recorded before the student-sortie catalogue)</span>` : ""}${
          e.sortie && !WA.curSortieKnown(e.sortie)
            ? ` <span class="k">(off-catalogue)</span>` : ""}</td>
        <td class="num">${esc(WA.curSeq(e))}</td>
        <td class="ecell">${curEventsCell(i, e)}</td>
      </tr>`;
    }
    return `<tr data-currow="${esc(i)}"${legacy ? ` class="is-legacy"` : ""}>
      <td><input type="date" data-curf="${esc(i)}:date" value="${esc(e.date || "")}"
                 aria-label="Date of the flight"></td>
      <td><select data-curf="${esc(i)}:kind" aria-label="Whose flight this was">
        <option value=""${e.kind ? "" : " selected"}>&mdash; choose &mdash;</option>
        ${WA.CURRENCY_KINDS.map((k) => `<option value="${esc(k.id)}"${
          e.kind === k.id ? " selected" : ""} title="${esc(k.tip)}">${esc(k.label)}</option>`).join("")}
      </select></td>
      <td class="wcell">${curWhatCell(i, e)}</td>
      <td class="num"><input type="number" min="1" max="9" step="1" class="seqbox"
             data-curf="${esc(i)}:seq" value="${esc(WA.curSeq(e))}"
             title="${esc("Which flight of that day this is, for that kind and that flight identity. It is 1 unless you flew the same thing twice on the same day; the form takes the next free number when it has to.")}"
             aria-label="Which flight of the day"></td>
      <td class="ecell">${curEventsCell(i, e)}</td>
      <td><button type="button" class="btn btn-sm btn-x" data-curdel="${esc(i)}"
            title="Remove this flight from your currency">&#10005;</button></td>
    </tr>`;
  }
  function curTableHTML() {
    const ord = WA.curSort(C.rows);
    if (!ord.length) {
      return `<div class="empty">${curRO
        ? "This instructor has not recorded a flight of his own yet."
        : "No flight recorded yet &mdash; use &ldquo;+ flight&rdquo;. A sortie that exercised no event is still a sortie: the events may be left empty."}</div>`;
    }
    return `<div class="tblwrap"><table class="ftbl curtbl">
      <thead><tr>
        <th>Date</th>
        <th title="${esc("Continuation — a flight of your own. With SP — one flown with a student. Neither of them names the student: their flight is recorded on their own form.")}">Flight</th>
        <th title="${esc("WHAT WAS FLOWN. A Continuation flight names its Σ category — the printed rows of Πίνακας 9 (Σ-1 · Σ-2 day · Σ-2 night · Σ-3 · Σ-4 · Σ-20) and of Πίνακας 6 (SIM-1 … SIM-ΔΑ), plus FDMS's recording columns and the Chapter-5 demo flight. A With-SP flight names the student's syllabus sortie (either band), or repeat / fcf / cef, or the code as typed.")}">Sortie / Σ category</th>
        <th class="num" title="${esc("Which flight of that day — 1, and 2 for a second sortie of the same kind and identity on the same date.")}">#</th>
        <th title="${esc("The events of the 3-01 EVENTS table (Ch.4 §48) this sortie exercised — the closed list of " + WA.E_ITEMS.length + " the register is built on. A sortie may exercise MANY, and one that exercised none is still a sortie.")}">E-items</th>
        ${curRO ? "" : "<th></th>"}
      </tr></thead>
      <tbody>${ord.map(({ e, i }) => curRowHTML(e, i)).join("")}</tbody>
    </table></div>`;
  }
  /* HOW MANY ROWS STILL CARRY A LEGACY CATEGORY — the rows round 19 stored with
     a programme and no Σ. They are not a fault to hide: they are work somebody
     owes, so the card says how many there are and the table marks each one.
     ROUND 21 — and the SECOND such number beside it: the with-SP rows still
     carrying the old form's Σ claim (wa.ins_withsp_scat_count's client twin). */
  const curLegacy = () => curLive().filter((e) => WA.sCatIsLegacy(e.s_category));
  const curCarriers = () => curLive().filter((e) => e.kind === "with_sp" && e.s_category);
  function curCardHTML() {
    const live = curLive();
    const n = live.length;
    const ev = live.reduce((a, e) => a + (e.e_items || []).length, 0);
    const leg = curLegacy().length;
    const car = curCarriers().length;
    return `
      <section class="card" id="ins-cur">
        <div class="idhead">
          <span class="nm">${esc(WA.secLabel(CUR_SEC))} ${WA.tipDot(CUR_SEC)}</span>
          <span class="meta">${n
            ? esc(n + " flight" + (n === 1 ? "" : "s") + " · " + ev + " event" + (ev === 1 ? "" : "s"))
            : "nothing recorded yet"}</span>
          ${leg ? `<span class="badge badge-bad" title="${esc(
            leg + " row" + (leg === 1 ? "" : "s") + " recorded before the Σ taxonomy existed (round 19): " +
            "the programme was stored and the category was not. Nobody can tell from a date whether a " +
            "sortie was a Σ-1 or a Σ-3, so the form will not guess — pick the right category on " +
            (leg === 1 ? "that row" : "those rows") + " and press Save.")}">${esc(leg)} without a Σ</span>` : ""}
          ${car ? `<span class="badge badge-bad" title="${esc(
            car + " with-SP row" + (car === 1 ? "" : "s") + " still carr" + (car === 1 ? "ies" : "y") +
            " the OLD form's Σ claim (rounds 19/20 asked for a Σ category on a flight with a student). " +
            "Nobody can reconstruct the student's sortie code from the claim, so the form will not guess — " +
            "choose the sortie on " + (car === 1 ? "that row" : "those rows") +
            " to replace it, or leave " + (car === 1 ? "it" : "them") + " exactly as " +
            (car === 1 ? "it stands" : "they stand") + "; no new row can take a Σ claim.")}">${esc(car)} with an old Σ claim</span>` : ""}
          <span class="badge${n ? " badge-good" : ""}"
            title="${esc(curSavedAt
              ? "Last saved " + fmtDT(curSavedAt)
              : "Nothing has been saved into this currency yet")}">${esc(curSavedAt
              ? "upd. " + fmtDT(curSavedAt) : "not submitted yet")}</span>
        </div>
        <p class="hint" style="margin-top:6px">${curRO
          ? "<b>Read-only.</b> An instructor's currency is a claim about who flew what, so it can only be entered from his own link &mdash; the server has no path for anybody else to write it. Everything below is what he recorded himself."
          : "Your own flying, for the squadron's currency register &mdash; the bridge into FDMS. " +
            "One row per sortie: the day, whether it was a <b>Continuation</b> flight of your own or one " +
            "<b>With SP</b>, and what was flown &mdash; a Continuation flight names its <b>Σ category</b> " +
            "(the printed rows of Πίνακας 9 and Πίνακας 6), a With-SP flight names <b>the student&rsquo;s " +
            "sortie</b> from the syllabus, or repeat / fcf / cef, or the code as typed &mdash; " +
            "and the <b>E-items</b> of the 3-01 it exercised, as many as it exercised. " +
            "A flight that exercised no event is still a flight. " +
            "This names no student and changes no student&rsquo;s record."}</p>
        ${curTableHTML()}
        ${curRO ? "" : `<div class="addrow"><button type="button" class="btn btn-sm btn-add"
            id="cur-add" title="${esc("Adds one flight of your own. Nothing is filled in for you: a date, a kind and what was flown are facts, and the form assumes none of them.")}"
            >+ flight</button></div>`}
      </section>`;
  }
  function curRedraw(focusSel) {
    const holder = document.getElementById("ins-cur-holder");
    if (!holder) return;
    holder.innerHTML = curCardHTML();
    if (focusSel) {
      const el = holder.querySelector(focusSel);
      if (el) el.focus();
    }
    refreshNav();
    refreshSave();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ROUND 21 — «MY FLIGHT LOGBOOK»: EVERYTHING THAT NAMES THIS INSTRUCTOR.
     ──────────────────────────────────────────────────────────────────────────
     RULING (2026-08-28): «Στο My Currency να έχουμε έναν πίνακα My Flight
     Logbook, όπου θα μπαίνει ό,τι βάζει ο κάθε εκπαιδευτής. Εδώ είναι που θέλει
     προσοχή: αν μπει ένας μαθητής και βάλει πτήση C4101 με [τον εκπαιδευτή] να
     το βλέπουμε κι εδώ — ή αν προσθέσει κάποιος πτήση στο progress του FDMS.»

     READ-ONLY, BELOW THE EDITABLE TABLE, and computed on the SERVER
     (wa.instructor_logbook — one round trip per door, §4u): three sources in
     one row shape — SELF (his own currency rows, projected), SP-ENTERED (every
     flights/fs row of ANY active student naming him: oid first, surname
     fallback, shared surnames FLAGGED and never guessed) and FDMS-PROGRESS
     (the designed slot: rows whose provenance stamp is 'fdms' — zero today, so
     the source column exists and counts 0 until the Phase-4 bridge lane lands
     into it). The student's row belongs to the student — no control here
     writes.

     THE SELF LANE IS REDRAWN FROM THE SAVED ROWS (CUR_SAVED_ROWS — the same
     migrated shape the server projects), so a currency save updates the
     logbook without a second round trip and without the two ever disagreeing:
     both are the stored record, one projection each. The SP/FDMS lanes are the
     server's and only a reload refreshes them.
     A SERVER THAT PREDATES THIS ROUND SHIPS NO `logbook` KEY — the card is
     simply not drawn (the round-18 absent-is-not-closed doctrine). */
  const LOG = (data.logbook && typeof data.logbook === "object") ? data.logbook : null;
  function logSelfRows(rows) {
    return rows.map((e) => ({
      src: "self", date: e.date || null, sortie: e.sortie || null,
      s_category: e.s_category || null,
      band: e.sortie ? WA.sortieBand(e.sortie) : null,
      kind: e.kind || null, seq: WA.curSeq(e),
      grade: null, ng: null, mission: null, student: null, match: null,
      ambiguous: false,
      legacy: WA.sCatIsLegacy(e.s_category) || (e.kind === "with_sp" && !!e.s_category),
    }));
  }
  function logSrcOrd(s) { return s === "self" ? 0 : (s === "fdms" ? 2 : 1); }
  function logRows() {
    const sp = (LOG && Array.isArray(LOG.rows))
      ? LOG.rows.filter((r) => r && r.src !== "self") : [];
    /* the server's own sort, mirrored: date desc · self → sp → fdms ·
       student surname · seq desc */
    return logSelfRows(CUR_SAVED_ROWS).concat(sp).sort((a, b) => {
      const da = String(a.date || ""), db = String(b.date || "");
      if (da !== db) return da < db ? 1 : -1;
      const oa = logSrcOrd(a.src), ob = logSrcOrd(b.src);
      if (oa !== ob) return oa - ob;
      const sa = String((a.student || {}).last_name || ""),
            sb = String((b.student || {}).last_name || "");
      if (sa !== sb) return sa < sb ? -1 : 1;
      return (Number(b.seq) || 1) - (Number(a.seq) || 1);
    });
  }
  function logSrcChip(r) {
    if (r.src === "self") {
      return `<span class="badge" title="${esc("A row you entered yourself in the table above" +
        (r.kind ? " — " + WA.currencyKindLabel(r.kind) : "") + ".")}">Self${
        r.kind ? " · " + esc(WA.currencyKindLabel(r.kind)) : ""}</span>`;
    }
    if (r.src === "fdms") {
      return `<span class="badge badge-acc" title="${esc("A flown event of FDMS Progress (not the scheduler board) that reached this record through the bridge — provenance 'fdms'.")}">FDMS</span>`;
    }
    return `<span class="badge badge-good" title="${esc("Entered by the student on their own form — their flight log names you as the instructor. Read-only here: the row belongs to the student.")}">SP</span>`;
  }
  function logFlightCell(r) {
    const what = r.s_category ? WA.sCatText(r.s_category)
      : (r.sortie ? WA.curSortieText(r.sortie) : "—");
    const kindChip = (r.src !== "self" && r.kind && r.kind !== "syllabus")
      ? ` <span class="k" title="${esc((WA.flightKind(r.kind) || {}).tip || "")}">${esc(WA.flightKindLabel(r.kind))}</span>` : "";
    return esc(what) + kindChip +
      (r.legacy ? ` <span class="badge badge-bad" title="${esc(r.src === "self"
        ? "This row wears a legacy mark — recorded before the current taxonomy; see the table above."
        : "The student's row wears the legacy mark — imported from the previous form.")}">legacy</span>` : "");
  }
  function logResultCell(r) {
    if (r.src === "self") {
      return `<span class="k" title="${esc("A Self row carries no grade — the grade of a flight with a student belongs to the student's own row.")}">&mdash;</span>`;
    }
    if (r.ng) return `<span class="k" title="Non-graded by nature (NG)">NG</span>`;
    if (r.grade !== null && r.grade !== undefined && r.grade !== "") return WA.pct(r.grade);
    if (r.mission) return esc(WA.missionLabel(r.mission));
    return WA.debriefChip(r, r.band) || "&mdash;";
  }
  function logStudentCell(r) {
    if (!r.student) return `<span class="k">&mdash;</span>`;
    const s = r.student;
    const nm = [s.last_name || "", s.first_name || ""].filter(Boolean).join(" ") +
      (s.class ? " · " + s.class : "");
    return esc(nm) + (r.ambiguous
      ? ` <span class="badge badge-warn" title="${esc("Shared surname — more than one instructor on the roster carries the surname this row names, and the row has no unambiguous identity (no oid), so it may belong to another instructor of the same surname. It is flagged, never guessed, and both holders of the surname see it flagged in their own logbooks.")}">shared surname &mdash; may belong to another</span>`
      : "");
  }
  function logCardHTML() {
    if (!LOG) return "";
    const rows = logRows();
    const c = LOG.counts || {};
    const nSelf = CUR_SAVED_ROWS.filter((e) => !curBlank(e)).length;
    const nSp = Number(c.sp) || 0, nAmb = Number(c.sp_ambiguous) || 0,
          nFdms = Number(c.fdms) || 0;
    const counts = [
      nSelf + " of your own",
      nSp + " entered by students" + (nAmb ? " (" + nAmb + " shared-surname, flagged)" : ""),
      nFdms + " from FDMS Progress",
    ].join(" · ");
    const trunc = LOG.truncated
      ? ` <span class="badge badge-warn" title="${esc("The student-entered lanes are capped at the most recent 600 rows; the counts before this sentence are the TRUE totals, computed before the cap.")}">showing the most recent 600 of ${esc(nSp + nFdms)} student-entered rows — ${esc(LOG.omitted || 0)} older not listed</span>`
      : "";
    return `
      <section class="card" id="ins-log">
        <div class="idhead">
          <span class="nm">My Flight Logbook <span class="tipdot" tabindex="0" role="note"
            title="${esc("Every flight this application knows about you, from three sources: SELF — the rows you enter in the table above; SP — every flight a student logged on their own form naming you as the instructor (matched by identity where the row carries one, else by surname — shared surnames are flagged, never guessed); FDMS — flown events of FDMS Progress that arrive through the bridge (none yet; the column is ready). Read-only: the students' rows belong to the students, and your own are edited above.")}"
            aria-label="My Flight Logbook: what this table is">&#9432;</span></span>
          <span class="meta">${esc(counts)}</span>
          ${trunc}
        </div>
        ${rows.length ? `<div class="tblwrap"><table class="ftbl">
          <thead><tr>
            <th>Date</th>
            <th title="${esc("Self — your own row from the table above. SP — entered by the student on their own form. FDMS — a flown event of FDMS Progress, via the bridge (none yet).")}">Source</th>
            <th title="${esc("What was flown — the Σ category or sortie of a Self row, or the sortie the student logged.")}">Flight</th>
            <th title="${esc("Aircraft or simulator — read off the section the student's row sits in, or off the sortie code where it is known. A marker or off-catalogue text honestly derives nothing.")}">Band</th>
            <th title="${esc("The student whose form the row lives on — SP and FDMS rows only. Your own rows name no student, by design.")}">Student</th>
            <th title="${esc("The student row's grade, NG, or mission — read-only. Your own rows carry none: the grade belongs to the student.")}">Result</th>
            <th class="num" title="Which flight of that identity on that day">#</th>
          </tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${esc(r.date ? fmtD(r.date) : "—")}</td>
            <td>${logSrcChip(r)}</td>
            <td>${logFlightCell(r)}</td>
            <td>${esc(r.band ? ((WA.logBand(r.band) || {}).short || r.band) : "—")}</td>
            <td>${logStudentCell(r)}</td>
            <td>${logResultCell(r)}</td>
            <td class="num">${esc(Number(r.seq) || 1)}</td>
          </tr>`).join("")}</tbody>
        </table></div>`
        : `<div class="empty">Nothing yet &mdash; no flight of your own is saved above, and no student&rsquo;s log names ${curRO ? "this instructor" : "you"} so far.</div>`}
      </section>`;
  }
  function logRedraw() {
    const holder = document.getElementById("ins-log-holder");
    if (holder) holder.innerHTML = logCardHTML();
  }

  function stuCard(s) {
    const sid = s.person.id;
    const p = P[sid];
    return `
      <section class="card stucard" id="ins-stu-${esc(sid)}" data-stucard="${esc(sid)}">
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
            ? `<span class="cotag" data-cotag="${esc(sid)}" title="${esc(WA.CO_TIP)}">${esc(WA.ADMIN_TAG)}</span>` : ""}
        </div>
      </section>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ROUND 20 — THE LANDING, AND THE TWO DOORS.
     ──────────────────────────────────────────────────────────────────────────
     RULING (2026-08-27): «το landing page να έχει τα στοιχεία αυτού που μπαίνει,
     ώστε να κάνει και επιβεβαίωση, και να έχουμε μήνυμα καλωσορίσματος. Και μετά
     δύο επιλογές: My currency, Student Assessment. Τώρα είναι μπερδεμένα.»

     WHAT WAS CONFUSED, AND WHY. Round 19 put the instructor's own currency at
     the bottom of the assessment form because there was nowhere else to put it,
     and the page became two different jobs in one scroll: a questionnaire about
     twelve other people, and a logbook about himself. They share a link and
     nothing else — different subject, different verb, different Save — and a
     reader who opens the link is given no moment in which to notice that.

     SO THE LINK OPENS ON NEITHER. It opens on WHO YOU ARE: rank and full name
     as the roster holds them, the duty line, and the class the squadron is
     asking about — and it says so as a CONFIRMATION, with the sentence that
     makes it actionable («if this is not you, close the page»). A personal link
     that is forwarded, pasted into the wrong chat or opened on a shared machine
     is the one failure this application cannot detect and the holder can, in
     one glance, which is what the welcome is for.

     AND THEN TWO DOORS, EACH ITS OWN VIEW. Each carries its own back control,
     its own Save and its own count of unsaved work; the landing shows both
     counts, so an instructor who left something half-typed behind one door is
     told which door. The doors are HASH SUB-ROUTES (app.js → WA.doorHash), so
     one can be bookmarked and Back returns through them.
     ══════════════════════════════════════════════════════════════════════════ */
  const DOOR_META = {
    assess: {
      label: "Student Assessment",
      sub: scope ? "Class " + scope : "the class that is finishing",
      icon: "&#9733;",
      what: "The utilization assessment the Wing Commander brief is built from &mdash; " +
            "one answer per student, about fighters, on the five-level scale.",
    },
    currency: {
      label: WA.secLabel(CUR_SEC),
      /* ROUND 21 — the door holds two tables now, and the tile says so; on a
         server that predates the logbook the second half would be a promise
         the door cannot keep, so it is only made where the payload carries it */
      sub: LOG ? "your own flying · your logbook" : "your own flying",
      icon: "&#9992;",
      what: "Your own sorties for the squadron&rsquo;s currency register &mdash; Continuation or " +
            "With SP, what was flown, and the E-items" +
            (LOG ? " &mdash; and below them your Flight Logbook: every flight a student logged " +
                   "naming you, and the FDMS-Progress lane the bridge will fill" : "") +
            ". It names no student and changes nobody&rsquo;s record.",
    },
  };
  /* WHICH DOOR IS OPEN — "" is the landing. It is read from the hash on every
     change and never held anywhere else, so the address bar is the truth. */
  let door = WA.doorFromHash ? WA.doorFromHash() : "";
  const isDoor = (d) => door === d;

  /* NO STUDENTS, NO RAIL — AND THEN NO GRID EITHER. `.pagelay` is a two-column
     grid whose first column is the 224 px rail; with the rail absent the form
     would be placed in THAT column and rendered 224 px wide. So the wrapper is
     only a layout when there is something to lay out, and the empty form falls
     back to exactly the markup it had before round 17: a plain `.wrap`. */
  const railed = data.students.length > 0;
  const coBar = asCO ? `
    <div class="cobar" role="note">
      <span class="cotag">${esc(WA.ADMIN_TAG)}</span>
      <div class="cotxt"><b>Entering as ${esc(WA.adminRankName())}</b>
        &mdash; you are filling in the assessments of
        <b>${esc(WA.personName(who, true))}</b> &mdash; everything you save here is tagged
        <b>&ldquo;entered by ${esc(WA.ADMIN_WORD)}&rdquo;</b> and shown as such everywhere, until
        ${esc(who.last_name || "the instructor")} saves the same assessment themselves.</div>
      ${backBtn}
    </div>` : "";
  /* the control that returns to the landing — one per door, at the TOP of it,
     because that is where a reader who wants out is already looking */
  const homeBar = (d) => `
    <div class="doorbar">
      <button type="button" class="btn btn-sm" data-door=""
        title="${esc("Back to the welcome page, where both doors are. Nothing is saved or discarded by going back — whatever you have typed is still here when you return.")}"
        >&#8592; ${esc(asCO ? "All of this instructor’s sections" : "My sections")}</button>
      <span class="doorttl">${DOOR_META[d].icon} <b>${esc(DOOR_META[d].label)}</b>
        <span class="k">&mdash; ${esc(DOOR_META[d].sub)}</span></span>
    </div>`;
  /* one door, as a big clear tile. The unsaved count rides on it: the landing
     is where an instructor decides where to go, and «3 unsaved» is the fact
     that decides it. */
  function doorTile(d, n) {
    const m = DOOR_META[d];
    return `
      <button type="button" class="doortile" data-door="${esc(d)}"
        title="${esc(m.label + " — " + m.sub + ". " + m.what.replace(/&mdash;/g, "—").replace(/&rsquo;/g, "'"))}">
        <span class="dt-ic" aria-hidden="true">${m.icon}</span>
        <span class="dt-t">${esc(m.label)}</span>
        <span class="dt-s">${esc(m.sub)}</span>
        <span class="dt-w">${m.what}</span>
        <span class="dt-b">${n
          ? `<span class="badge badge-warn">${esc(n)} unsaved</span>`
          : `<span class="badge">open</span>`}</span>
      </button>`;
  }
  view.innerHTML = `
    ${/* ── THE WELCOME ────────────────────────────────────────────────── */ ""}
    <div class="wrap screen-only" id="ins-home">
      ${coBar}
      <section class="card welcome">
        <p class="wl-hi">${esc(asCO ? "Entering on behalf of" : "Welcome,")}</p>
        <h2 class="wl-nm">${esc(WA.personName(who, true) || "instructor")}</h2>
        <p class="wl-meta">${esc([who.duty, who.leadership, who.status,
            WA.callSign(who) ? "call sign " + WA.callSign(who) : ""].filter(Boolean).join(" · ")
          || "no duty recorded on the roster")}</p>
        <p class="wl-cf">${asCO
          ? `You are the admin, filling this in on <b>${esc(WA.personName(who, true))}</b>&rsquo;s behalf.
             Everything you save is tagged &ldquo;entered by ${esc(WA.ADMIN_WORD)}&rdquo;.`
          : `You are signed in as <b>${esc(WA.personName(who, true))}</b>${
              who.mn ? ", MN " + esc(who.mn) : ""}.
             <b>If this is not you, close this page and tell the squadron administration</b> &mdash;
             this is a personal link and everything saved through it is recorded in your name.`}</p>
        ${scoped ? `<p class="wl-scope ${scope ? "is-open" : "is-shut"}"
          title="${esc(SCOPE_TIP)}">${esc(scopeLine)}${scope
            ? " " + data.students.length + " student" +
              (data.students.length === 1 ? " is" : "s are") + " being asked about."
            : ""}</p>` : ""}
      </section>
      <div class="doors" role="group" aria-label="What would you like to do?">
        ${doorTile("assess", 0)}
        ${doorTile("currency", 0)}
      </div>
      <p class="hint" id="ins-home-hint">Both doors keep their own Save. Nothing is written
        anywhere until you press it, and moving between them never discards what you have typed.</p>
    </div>

    ${/* ── DOOR 1 — STUDENT ASSESSMENT ────────────────────────────────── */ ""}
    <div class="doorpane" id="ins-pane-assess" hidden>
      ${homeBar("assess")}
      <div class="${railed ? "pagelay lay-read" : "lay-none"}" id="ins-lay">
      ${railed
        ? WA.navHTML("ins-nav", navItems(), {
            title: scope ? "Class " + scope : "Students",
            aria: (asCO ? "This instructor’s students" : "Your students") +
                  (scope ? " — class " + scope : "") })
        : ""}
      <div class="wrap lay-main screen-only" id="ins-form">
        <section class="card">
          <div class="idhead">
            <span class="nm">${esc(WA.personName(who, true))}</span>
            <span class="meta">${esc([who.duty, who.leadership, who.status].filter(Boolean).join(" · "))}</span>
            ${/* ROUND 18 — WHICH CLASS THIS FORM IS ABOUT, beside the name of the
                 person it belongs to, because those are the two facts that decide
                 what every card below means. */ ""}
            ${scoped
              ? `<span class="badge ${scope ? "badge-good" : "badge-warn"}"
                  title="${esc(SCOPE_TIP)}">${esc(scope
                    ? "Class " + scope + " · " + data.students.length +
                      " student" + (data.students.length === 1 ? "" : "s")
                    : "Assessments closed")}</span>` : ""}
          </div>
          <p class="hint" style="margin-top:6px">${scopeLine ? `<b>${esc(scopeLine)}</b> ` : ""}
            Utilization assessments for the Wing Commander brief.
            For each student, ${asCO ? "record the one assessment this instructor makes" : "give the one assessment you make"}
            <b>about fighters</b>, on the five-level scale. The number beside each level is its weight
            &mdash; the brief averages them, so the scale says what it means without a single
            discouraging word. Each student card also shows the data the student self-reported.
            ${asCO ? "The instructor can overwrite any of this from their own link." : "You can return and edit any time."}</p>
        </section>
        ${data.students.length
          ? data.students.map(stuCard).join("")
          : `<section class="card">${scoped
                ? `<h3>${esc(scope ? "Class " + scope + " is open — and empty"
                                   : "Nothing to assess")}</h3>` : ""}
               <p class="hint">${esc(emptyLine)}</p></section>`}
      </div>
      </div>
    </div>

    ${/* ── DOOR 2 — MY CURRENCY · MY FLIGHT LOGBOOK ───────────────────── */ ""}
    <div class="doorpane" id="ins-pane-currency" hidden>
      ${homeBar("currency")}
      <div class="wrap screen-only" id="ins-cur-holder">${curCardHTML()}</div>
      <div class="wrap screen-only" id="ins-log-holder">${logCardHTML()}</div>
    </div>

    ${/* ROUND 14 — ONE SAVE, and it is the student form's floating pattern:
         this form is one card per student and a dozen screens long, so a
         button at the bottom is a button most of the class never scrolls to.
         It says HOW MANY assessments it is about to write, because that is the
         number the instructor is deciding about.
         ROUND 20 — AND IT BELONGS TO THE OPEN DOOR. The landing has no Save at
         all: there is nothing on it to save, and a button that offered to write
         work the reader cannot see from where he is standing is the confusion
         this round was called to remove. */ ""}
    <div class="savefloat" id="ins-float" hidden>
      <span class="sf-hint" id="ins-float-hint">unsaved</span>
      <button type="button" class="btn btn-primary" id="ins-float-save">Save</button>
    </div>
    <div class="savebar" id="ins-savebar" hidden>
      ${asCO ? backBtn : ""}
      <button type="button" class="btn btn-primary" id="ins-save">Save</button>
      <span class="st" id="ins-status">Assessments are kept only after you press Save.</span>
    </div>
    <div class="print-only" id="print-ins"></div>`;

  const root = $("ins-form");
  /* ── THE RAIL LIVES AND DIES WITH ITS DOOR ────────────────────────────────
     It is mounted when the assessment door opens and destroyed when it closes.
     Not merely hidden: the panel keeps a SCROLL SPY on `window` that measures
     its cards, and a hidden card measures zero — so a spy left running behind a
     closed door would keep marking the last row as «you are here» while the
     reader is somewhere else entirely. WA._nav is the one slot teardownView()
     destroys, and this uses the same slot. */
  function mountRail() {
    if (WA._nav) return;
    const el = document.getElementById("ins-nav");
    if (!el) return;
    WA._nav = WA.navMount(el, {
      items: navItems(),
      summary: navSummary,
      /* the cards carry ids of their own, so the panel is told how to find them
         instead of assuming the student form's "sec-" prefix */
      anchor: (id) => document.getElementById("ins-stu-" + id),
    });
    WA._nav.summary(navSummary());
  }
  function unmountRail() {
    if (!WA._nav) return;
    WA._nav.destroy();
    WA._nav = null;
  }

  /* ── ROUND 20 — SHOWING ONE DOOR ──────────────────────────────────────────
     Three panes, one visible. The panes are HIDDEN and not rebuilt, because
     everything the instructor has typed lives in their DOM (the comment boxes,
     the half-filled currency row) and in the closures around them; rebuilding
     on every door change would throw both away, which is the one thing the
     rail's own destroy/mount dance is careful NOT to do.
     THE SCROLL GOES BACK TO THE TOP, once, on an actual change: arriving in a
     door at the scroll depth of the one just left is how a reader concludes a
     page is broken. */
  function showDoor(next, scroll) {
    door = WA.DOORS.indexOf(next) >= 0 ? next : "";
    const home = document.getElementById("ins-home");
    if (home) home.hidden = !!door;
    for (const d of WA.DOORS) {
      const pane = document.getElementById("ins-pane-" + d);
      if (pane) pane.hidden = door !== d;
    }
    if (door === "assess" && railed) mountRail(); else unmountRail();
    const bar = document.getElementById("ins-savebar");
    if (bar) bar.hidden = !door;
    refreshSave();                                   /* which refreshes the tiles */
    if (scroll) window.scrollTo(0, 0);
  }
  /* the two tiles say where the unsaved work is — the whole point of showing
     both counts on a page that can save neither */
  function refreshHome() {
    const holder = document.querySelector("#ins-home .doors");
    if (!holder) return;
    holder.innerHTML = doorTile("assess", dirtyIds().length) + doorTile("currency", curCount());
    const hint = document.getElementById("ins-home-hint");
    const n = dirtyIds().length + curCount();
    if (hint) {
      hint.innerHTML = n
        ? `<b>${esc(n)} unsaved change${n === 1 ? "" : "s"}</b> &mdash; each door has its own Save,
           and the badge above says which door is holding what. Nothing is written until you press it.`
        : `Both doors keep their own Save. Nothing is written anywhere until you press it,
           and moving between them never discards what you have typed.`;
    }
  }
  /* THE ROUTER'S HOOK. app.js offers every hash change to this before tearing
     anything down; taking it is what makes a door a sub-route of one page
     instead of a reload. It answers `true` only for the link it was built for —
     a different token, or the admin leaving an on-behalf detour, must rebuild. */
  WA._insKey = (WA.token || "") + "|" + (asCO ? "prop:" + O.targetId : "");
  WA._insDoor = function (tok, co, next) {
    const key = (tok || "") + "|" + (co ? co.kind + ":" + co.id : "");
    if (key !== WA._insKey) return false;
    if (next === door) return true;         /* already there — nothing to do */
    showDoor(next, true);
    return true;
  };

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
          ${/* ROUND 18 — the sheet says WHICH CLASS it covers. On paper this
               matters more than on screen: a printed list of nine names with no
               class on it is filed, found next term, and read as the whole
               squadron. */ ""}
          ${scoped ? "· " + esc(scope ? "class " + scope : "no class open for assessment") : ""}
          · ${data.students.length} student${data.students.length === 1 ? "" : "s"}
          · printed ${esc(fmtDT(new Date().toISOString()))}${asCO
            ? " · entered on their behalf by " + esc(WA.adminRankName()) + " (" + esc(WA.ADMIN_BODY) + ")" : ""}</div>
        ${pages || `<p class="pr-none">${esc(emptyLine)}</p>`}
        ${/* ROUND 19 — AND THE SECOND HALF OF WHAT WAS SUBMITTED. The round-8
             doctrine for this sheet is that it prints what the document
             actually IS; from this round the document has two parts, and a
             printout that showed only the assessments would be filed as the
             whole of an instructor's return. Monochrome, one row per flight,
             the events written out in their printed codes. */ ""}
        <div class="pr-ins-blk">
          <h3>${esc(WA.secLabel(CUR_SEC))}
            <span class="pr-ins-meta">own flying &mdash; the squadron&rsquo;s currency register</span></h3>
          ${curLive().length
            ? `<table class="pr-t"><thead><tr>
                 <th>Date</th><th>Flight</th><th>Sortie / Σ category</th>
                 <th>#</th><th>E-items</th>
               </tr></thead><tbody>${WA.curSort(curLive()).map(({ e }) => `<tr>
                 <td>${esc(e.date ? fmtD(e.date) : "—")}</td>
                 <td>${esc(WA.currencyKindLabel(e.kind))}</td>
                 <td>${esc(curWhatText(e))}${e.kind === "with_sp" && e.s_category
                   ? " (Σ as claimed — recorded before the student-sortie catalogue)" : ""}</td>
                 <td>${esc(WA.curSeq(e))}</td>
                 <td>${esc((e.e_items || []).map(WA.eItemCode).join(" · ") || "—")}</td>
               </tr>`).join("")}</tbody></table>`
            : `<p class="pr-none">No flight recorded.</p>`}
        </div>
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
     also what stops the general Save from re-stamping a row the admin owns and
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
    /* ROUND 17 — the rail is LIVE: a level chosen turns its row green on the
       very click, clearing it returns the row to mustard, and the discard flow
       (which comes through here card by card) puts back the saved truth. */
    refreshNav();
    refreshSave();
  }
  /* ── ROUND 19 SAID BOTH NUMBERS, ROUND 20 SAYS THE OPEN ONE ───────────────
     Round 19's button read «Save 3 assessments + 2 currency changes», and that
     was the honest sentence for a page that held both at once. The doors made
     it dishonest in the only way that matters: from inside «My currency» it
     offered to write twelve assessments the reader cannot see, cannot check and
     did not come here to think about — and a confirmation dialog listing them
     is not consent, it is a surprise with a list attached.
     SO THE SAVE BELONGS TO THE OPEN DOOR, and the sentence grammar of round 19
     is kept EXACTLY as it was for the case each door produces: one of the two
     numbers is simply zero. The other door's unsaved work is not lost and not
     hidden — it is counted on its tile on the landing, and the leave-the-page
     guard still asks about both. */
  const doorCounts = () => ({
    a: door === "assess" ? dirtyIds().length : 0,
    c: door === "currency" ? curCount() : 0,
  });
  function curCount() { return curRO ? 0 : curChanges().length; }
  function saveWords(nA, nC) {
    const a = nA + " assessment" + (nA === 1 ? "" : "s");
    const c = nC + " currency change" + (nC === 1 ? "" : "s");
    if (nA && nC) return a + " + " + c;
    if (nC) return c;
    return a;
  }
  /* The status line under the button says the same two numbers as a sentence,
     and «3 currency changes changed» is not one: «changed» belongs to the
     assessments, which are EDITED, while currency rows are added and removed.
     Round 14's exact sentence is kept for the case where they are all that
     moved, because for that case it was already right. */
  function statusWords(nA, nC) {
    if (nA && nC) return saveWords(nA, nC) + " — press Save.";
    if (nC) return saveWords(0, nC) + " — press Save.";
    return saveWords(nA, 0) + " changed — press Save.";
  }
  function refreshSave() {
    const { a: nA, c: nC } = doorCounts();
    const n = nA + nC;
    const word = "Save " + saveWords(nA, nC) + (asCO ? " as admin" : "");
    for (const id of ["ins-save", "ins-float-save"]) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.textContent = n ? word : "Save" + (asCO ? " as admin" : "");
      b.disabled = !n;
    }
    const f = document.getElementById("ins-float");
    if (f) f.hidden = !n || !door;
    const h = document.getElementById("ins-float-hint");
    if (h) h.textContent = n + " unsaved";
    const st = document.getElementById("ins-status");
    if (st && !st.classList.contains("ok") && !st.classList.contains("err")) {
      st.textContent = n
        ? statusWords(nA, nC)
        : (door === "currency"
            ? "Your flights are kept only after you press Save."
            : "Assessments are kept only after you press Save.");
    }
    /* the floating bar clears the sticky top bar, whatever height it wrapped
       to on this screen (the round-9 measurement, not a hardcoded offset) */
    if (f) f.style.top = (WA.measureTopbar() + 10) + "px";
    /* and the landing's two badges follow the same numbers — they are the same
       question asked from one step further back, so they are answered here */
    refreshHome();
  }

  /* ROUND 20 — ONE DELEGATION HOST FOR THE WHOLE VIEW. Round 19 hung this on
     `#ins-form`, which was the one element both sections lived inside; the
     currency now lives in a different pane, so the host moves up to the view
     itself. Nothing else changes: every branch still tests its own attribute,
     and the modal is appended to document.body, out of this tree entirely. */
  view.addEventListener("click", async (ev) => {
    /* ── THE DOORS ──────────────────────────────────────────────────────────
       A door click ONLY sets the hash. The hash change comes back through
       app.js → route() → WA._insDoor → showDoor, so the click, the Back button,
       a bookmark and a reload are one path with one behaviour — and the address
       bar is never a step behind what is on screen. */
    const doorBtn = ev.target.closest("[data-door]");
    if (doorBtn) {
      const want = doorBtn.dataset.door || "";
      if (want === door) { showDoor(want, true); return; }
      location.hash = WA.doorHash(want);
      return;
    }
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
    /* ── ROUND 19 — THE ACTS OF THE CURRENCY TABLE ──────────────────────────
       Add a flight · remove a flight · take one event off a flight · (round 20)
       open the event picker. All of them are ACTS on the working rows followed
       by ONE redraw of the section's own holder. */
    if (curRO) return;
    if (ev.target.closest("#cur-add")) {
      if (C.rows.length >= WA.INS_SECTION_CAP(CUR_SEC)) {
        toast("Your currency is full (" + WA.INS_SECTION_CAP(CUR_SEC) + " flights)", true);
        return;
      }
      /* NOTHING IS FILLED IN. A date, a kind and what was flown are FACTS, and
         a form that guesses one of them for an instructor has put a flight in
         his logbook that he did not fly. The row says what it still needs. */
      C.rows.push({ date: "", kind: "", s_category: "", sortie: "", seq: 1, e_items: [] });
      curRedraw(`[data-currow="${C.rows.length - 1}"] input[type="date"]`);
      return;
    }
    /* ROUND 21 — back from the free-text sortie box to the syllabus list.
       Whatever is typed stays: revealing a control is not an edit (the
       fingerprint doctrine), and the list shows the typed value marked. */
    const slist = ev.target.closest("[data-curslist]");
    if (slist) {
      const row = C.rows[Number(slist.dataset.curslist)];
      if (!row) return;
      row._sfree = false;
      curRedraw(`[data-curf="${Number(slist.dataset.curslist)}:sortie"]`);
      return;
    }
    const del = ev.target.closest("[data-curdel]");
    if (del) {
      const i = Number(del.dataset.curdel);
      const row = C.rows[i];
      const nm = row ? WA.rowLabel(CUR_SEC, row) : "";
      C.rows.splice(i, 1);
      curRedraw();
      toast(nm ? nm + " removed — press Save to keep the change"
               : "The empty row was removed");
      return;
    }
    const erm = ev.target.closest("[data-curerm]");
    if (erm) {
      const [ix, k] = String(erm.dataset.curerm).split(":");
      const row = C.rows[Number(ix)];
      if (!row) return;
      const ids = (row.e_items || []).slice();
      ids.splice(Number(k), 1);
      row.e_items = ids;
      curRedraw(`[data-curepick="${Number(ix)}"]`);
      return;
    }
    /* ── ROUND 20 — THE PICKER ──────────────────────────────────────────────
       «δυνατότητα πολλαπλών Ε». One dialog, every event on screen, a filter
       over them and a count of what is ticked. It resolves to the whole list,
       so the row is REPLACED rather than added to — which is what makes
       unticking work at all, and what a «Clear all» needs to mean something. */
    const pick = ev.target.closest("[data-curepick]");
    if (pick) {
      const i = Number(pick.dataset.curepick);
      const row = C.rows[i];
      if (!row) return;
      const before = (row.e_items || []).slice();
      const got = await WA.pickEvents({
        selected: before,
        what: (WA.rowLabel(CUR_SEC, row) ? WA.rowLabel(CUR_SEC, row) + ". " : ""),
      });
      if (got === null) return;                       /* Cancel really cancels */
      row.e_items = got;
      curRedraw(`[data-curepick="${i}"]`);
      const d = got.length - before.length;
      if (d !== 0) {
        toast(got.length
          ? got.length + " event" + (got.length === 1 ? "" : "s") +
            " on this flight — press Save to keep the change"
          : "No event on this flight now — a sortie that exercised none is still a sortie");
      }
      return;
    }
  });

  /* ── ROUND 19 — EVERY CELL OF THE CURRENCY TABLE, ON ONE LISTENER ─────────
     `change` and not `input`: a date box fires `input` on every keystroke of a
     half-typed year, and this handler REDRAWS (the table sorts by date, and the
     sort must not be a step behind the value). Committing the cell is the
     moment the fact exists, and the redraw puts the focus back where it was.
     THE GUARD IS THE IDEMPOTENCY: a browser that also fires `input` on a select
     would come through here twice, and the second pass finds nothing changed. */
  function curField(el) {
    if (curRO || !el || !el.dataset || !el.dataset.curf) return false;
    const [ix, field] = String(el.dataset.curf).split(":");
    const i = Number(ix);
    const row = C.rows[i];
    if (!row) return false;
    let v = el.value;
    if (field === "seq") {
      const n = Math.round(Number(v));
      v = (isFinite(n) && n >= 1 && n <= 9) ? n : 1;
    }
    /* ROUND 21 — «Other…» is not a value, it is a mode: the box becomes free
       text and keeps whatever the row already held. */
    if (field === "sortie" && v === "__other__") {
      row._sfree = true;
      curRedraw(`[data-curf="${i}:sortie"]`);
      return true;
    }
    if (String(row[field] === undefined ? "" : row[field]) === String(v)) return false;
    const prevKind = row.kind;
    row[field] = v;
    /* ROUND 21 — ONE BOX, ONE FACT, kept true by the form and not only by the
       refusal. Flipping the kind clears the field the new kind does not take
       (a Σ on a with-SP row would otherwise become the forbidden second claim
       the server refuses, and a sortie on a Continuation row likewise); and a
       sortie chosen on a with-SP row that still wore the OLD form's Σ claim
       REPLACES the claim — that is the correction the grow-guard exists to
       allow. Nothing is written until Save; discard restores every clearing. */
    if (field === "kind" && v !== prevKind) {
      if (v === "continuation" && row.sortie) {
        row.sortie = ""; row._sfree = false;
        toast("A Continuation flight is named by its Σ category — the sortie box was cleared");
      } else if (v === "with_sp" && row.s_category) {
        row.s_category = "";
        toast("A flight with an SP is named by the student's sortie — the Σ box was cleared");
      }
    }
    if (field === "sortie" && v && row.kind === "with_sp" && row.s_category) {
      row.s_category = "";
      toast("The old Σ claim was replaced by the sortie — press Save to keep the change");
    }
    /* the row may have just landed on another one's day, kind and identity */
    const moved = curFixSeq(i);
    if (moved) {
      toast("A flight of " + fmtD(row.date) + " (" +
        (row.s_category ? WA.sCatCode(row.s_category) : WA.curSortieCode(row.sortie)) +
        ", " + WA.currencyKindLabel(row.kind) + ") is already recorded — this one is #" + moved);
    }
    curRedraw(`[data-curf="${i}:${field}"]`);
    return true;
  }
  view.addEventListener("change", (ev) => { curField(ev.target); });

  /* ── ROUND 14 — THE ONE GENERAL SAVE ──────────────────────────────────────
     ONE ACT, ONE STUDENT AT A TIME ON THE WIRE. There is deliberately no batch
     RPC: wa.write_proposal carries the whole per-proposal contract — the level
     normalisation, the owner-reclaim that clears the admin tag when the owner
     answers, the admin stamp when the admin does — and a second write path would be
     a second place for those rules to live. So the button iterates the DIRTY
     cards over the RPC that already exists, and reports per card: an assessment
     the server refuses leaves that one card unsaved and named, and the rest of
     the class still lands. */
  /* ── ROUND 19 — THE CURRENCY IS ONE WRITE, AND IT GOES FIRST ──────────────
     The whole section in one act: rows are ADDED AND REMOVED here, not only
     edited, so a per-row RPC would have to invent a row identity that survives
     a page still being edited. It goes before the assessment loop because it is
     one fast call and because a refusal the instructor must act on should reach
     him before a dozen slower writes, not after them — and the loop runs
     regardless, so nothing in the class is held hostage by one bad flight.
     THE SERVER'S VERDICT IS APPLIED, NOT ASSUMED: the returned record is what
     the working rows are rebuilt from, exactly as an assessment takes back the
     level the server stored. */
  async function saveCurrency() {
    if (curRO || !curIsDirty()) return null;
    const bad = curIncomplete();
    if (bad.length) {
      curMark(bad[0].i);
      return "Currency not saved — " + bad[0].text +
        (bad.length > 1 ? " (and " + (bad.length - 1) + " more)" : "");
    }
    try {
      const res = await rpc("save_instructor_currency",
        { p_token: WA.token, p_payload: { currency: curPayload() } });
      C.rows = curLoad((res.record || {}).currency || []);
      curSavedAt = res.last_update || curSavedAt;
      CUR_SAVED = curFp(curLive());
      CUR_SAVED_ROWS = curLive().map((e) => ({ ...e, e_items: (e.e_items || []).slice() }));
      curRedraw();
      /* ROUND 21 — the logbook's Self lane is a projection of the SAVED rows,
         so it moves the moment they do */
      logRedraw();
      return null;
    } catch (e) {
      return "Currency not saved — " + e.message;
    }
  }

  /* ROUND 20 — `withCur` is the OPEN DOOR, passed in rather than read here, so
     the one function that writes cannot disagree with the button that counted.
     From «Student Assessment» it is false and the currency is not touched at
     all; from «My currency» `ids` is empty and the loop below does not run. */
  async function saveAll(ids, withCur) {
    const st = $("ins-status");
    const btns = [$("ins-save"), document.getElementById("ins-float-save")].filter(Boolean);
    btns.forEach((b) => { b.disabled = true; });
    st.className = "st";
    st.textContent = "Saving " + (ids.length + (withCur ? curCount() : 0)) + "…";
    let ok = 0;
    const failed = [];
    const curWas = withCur ? curCount() : 0;
    const curErr = withCur ? await saveCurrency() : null;
    const curOk = curWas && !curErr ? curWas : 0;
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
            (asCO ? " — tagged as entered by " + WA.ADMIN_WORD : "");
        }
        const card = root.querySelector(`[data-stucard="${sid}"]`);
        if (card) card.classList.remove("is-dirty");
        /* mirror the server's stamp: the OWNER saving clears it (db/schema.sql
           → wa.write_proposal), the admin saving sets it */
        const tag = root.querySelector(`[data-cotag="${sid}"]`);
        if (asCO && !tag && cst) {
          cst.insertAdjacentHTML("afterend",
            `<span class="cotag" data-cotag="${esc(sid)}" title="${esc(WA.CO_TIP)}">${esc(WA.ADMIN_TAG)}</span>`);
        } else if (!asCO && tag) tag.remove();
        ok++;
      } catch (e) {
        failed.push({ sid, msg: e.message });
        if (cst) { cst.className = "prop-st err"; cst.textContent = "Save failed: " + e.message; }
      }
    }
    if (WA._insPrint) WA._insPrint();
    btns.forEach((b) => { b.disabled = false; });
    /* the server's verdict may differ from ours (wa.write_proposal normalises
       the level), so the rail is redrawn from P AFTER the writes, not before */
    refreshNav();
    refreshSave();
    /* ROUND 19 — TWO WRITES, ONE VERDICT LINE. A currency refusal is reported
       even when every assessment landed: «12 saved ✓» beside a section that was
       silently not written is the one sentence this form must never print. */
    if (failed.length || curErr) {
      st.className = "st err";
      st.textContent = [
        (ok + curOk) + " saved",
        failed.length ? failed.length + " refused — " + nameOf(failed[0].sid) + ": " + failed[0].msg : "",
        curErr || "",
      ].filter(Boolean).join(" · ");
      toast(curErr && !failed.length
        ? "Your currency could not be saved"
        : failed.length + " assessment" + (failed.length === 1 ? "" : "s") + " could not be saved", true);
      const card = failed.length ? root.querySelector(`[data-stucard="${failed[0].sid}"]`)
                                 : document.getElementById("ins-cur");
      if (card) card.scrollIntoView({ block: "center" });
    } else {
      st.className = "st ok";
      st.textContent = saveWords(ok, curOk) + " saved ✓ " +
        fmtDT(new Date().toISOString()) + (asCO ? " — tagged as entered by " + WA.ADMIN_WORD : "");
      toast(asCO
        ? ok + " assessment" + (ok === 1 ? "" : "s") + " saved as admin — they are tagged"
        : saveWords(ok, curOk) + " saved");
    }
  }
  /* the change list, then the write — «ποιος εγραψε … και σε σχεση με τι»
     ROUND 20 — AND THE LIST IS THE OPEN DOOR'S. The diff BUILDERS are unchanged
     and still shared (WA.proposalChanges for the assessments, WA.recordChanges
     through curChanges() for the flights): what the door decides is which of
     them the dialog is asked for, not how either is written. */
  async function confirmedSaveAll() {
    const inCur = door === "currency";
    const ids = inCur ? [] : dirtyIds();
    const curCh = (inCur && !curRO) ? curChanges() : [];
    if (!ids.length && !curCh.length) return;
    const before = {}, after = {};
    for (const sid of ids) { before[sid] = savedStateOf(sid); after[sid] = stateOf(sid); }
    /* ROUND 19 — the currency rows name themselves through the SAME builder
       every other record in this application uses (WA.rowLabel → «My currency ·
       own · Σ-3 — Air-to-Ground missions, day/night · 26/08/2026 #2 — added
       (E-items Ε-1α · Ε-32)»), so nothing about this section had to be
       described twice. */
    const changes = WA.proposalChanges(before, after, nameOf).concat(curCh);
    const ans = await WA.confirmSave({
      who: WA.personRankName(WA.me || {}),
      onBehalf: asCO ? WA.personRankName(who) : "",
      title: "Save " + saveWords(ids.length, curCh.length) + "?",
      /* ROUND 22 (WA-21 verify finding 2) — THE PREAMBLE IS PER KIND, BECAUSE
         THE ROWS ARE. Round 21 split a currency row in two: a CONTINUATION row
         names its Σ category, a WITH-SP row names the student’s sortie and
         cannot carry a Σ at all. The dialog kept round 20’s sentence and told
         every signer that «each row names the Σ category», which is false of
         exactly the rows the round added — and this is the screen where the
         claim is signed. It now says what is actually in front of them: the
         two kinds by name, and the Σ sentence only where a Σ is really there. */
      what: inCur
        ? "These are your own flights for the squadron’s currency register — the bridge into FDMS. " +
          curSaveWhat() +
          " They name no student, and they change no student’s record."
        : (asCO
            ? "These are recorded as this instructor’s assessments and tagged “entered by " + WA.ADMIN_WORD + "”. Every one of them is about FIGHTERS, on the five-level scale."
            : "These are your assessments for the Wing Commander brief — one answer per student, about FIGHTERS, on the five-level scale."),
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
      /* the currency goes back to its last saved rows by the same act — the
         dialog listed them, so «discard» must undo them or the sentence it
         asked the question with was not true */
      if (curCh.length) {
        C.rows = CUR_SAVED_ROWS.map((e) => ({ ...e, e_items: (e.e_items || []).slice() }));
        curRedraw();
      }
      if (WA._insPrint) WA._insPrint();
      toast(changes.length + " change" + (changes.length === 1 ? "" : "s") +
        " discarded — the form is back to the last saved " +
        (inCur ? "flights" : "assessments"));
      return;
    }
    await saveAll(ids, inCur);
  }
  $("ins-save").addEventListener("click", confirmedSaveAll);
  $("ins-float-save").addEventListener("click", confirmedSaveAll);
  /* ROUND 20 — THE FIRST DRAW IS A DOOR CHANGE LIKE ANY OTHER. The hash decides
     it, so a bookmarked door opens on it and a bare link opens on the welcome;
     `false` because a fresh render is already at the top of the page, and a
     scroll here would fight a browser restoring one. */
  showDoor(door, false);
  if (!WA._insFloatHooked) {
    WA._insFloatHooked = true;
    window.addEventListener("resize", () => {
      const f = document.getElementById("ins-float");
      if (f) f.style.top = (WA.measureTopbar() + 10) + "px";
    });
  }

  if (root) {
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
  }

  /* Back to the dashboard — the admin token stays in the hash.
     ROUND 20 — it asks about BOTH doors: leaving the page is leaving both, and
     a warning that counted only the assessments would let a half-typed flight
     go without a word. (The currency is read-only on this twin, so in practice
     the second number is zero — but the sentence is written from the counts,
     not from an assumption about which of them can be non-zero.) */
  if (asCO) {
    view.addEventListener("click", (ev) => {
      if (!ev.target.closest("[data-coback]")) return;
      const nA = dirtyIds().length, nC = curCount();
      if ((nA + nC) && !window.confirm(
        saveWords(nA, nC) + " unsaved. Leave without saving?")) return;
      for (const k of Object.keys(P)) { P[k].dirty = false; SAVED[k] = fp(P[k]); }
      location.hash = WA.adminHash();
    });
  }

  WA._insState = P;
  /* ROUND 19 — AND THE CURRENCY COUNTS AS UNSAVED WORK TOO. The guard existed
     to stop a closed tab from throwing away an answer; a table of flights is
     more typing than an answer, not less. It is read through a function rather
     than copied into a flag, so it can never be a stale snapshot of the rows. */
  WA._insCurDirty = () => !curRO && curIsDirty();
  if (!WA._insUnloadHooked) {
    WA._insUnloadHooked = true;
    window.addEventListener("beforeunload", (ev) => {
      const p = WA._insState;
      const cur = typeof WA._insCurDirty === "function" && WA._insCurDirty();
      if (cur || (p && Object.values(p).some((x) => x.dirty))) {
        ev.preventDefault(); ev.returnValue = "";
      }
    });
  }
};
