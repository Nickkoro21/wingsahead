"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   Wings Ahead — INSTRUCTOR form (mobile-first).
   Student list; per student a compact card of their self-reported data
   beside the ranking pickers (1st/2nd/3rd across the three branches,
   uniqueness enforced) + flew-with + comment. Save/edit any time.

   ROUND-4 ENTER-ON-BEHALF: the SAME form, bound to another instructor.
   opts.asCO swaps the two RPCs for their admin_* twins (identical validation
   server-side) and adds the "entering as CO" banner; nothing else forks.
     opts = { asCO: true, targetId: <instructor uuid> }   (admin token only)
   ══════════════════════════════════════════════════════════════════════════ */

WA.BRANCHES = [
  { id: "fighters", label: "Fighters" },
  { id: "helicopters", label: "Helicopters" },
  { id: "transport_ff", label: "Transport–Firefighting" },
];
WA.RANK_WORD = { 1: "1st", 2: "2nd", 3: "3rd" };
/* ── THE FOURTH STATE OF A BRANCH (round 8) ────────────────────────────────
   Ranked 1st / 2nd / 3rd · NOT RECOMMENDED · untouched. Until round 8 the
   third had to carry two meanings at once — "I would not send him there" and
   "I have not formed a view" — and the CO could not tell them apart on the
   brief. They are now different answers, worded differently everywhere:
   "does not recommend" is a judgement, "has not recommended" is a silence.
   MIRROR: db/schema.sql → proposals.nr_* / the aggregates of admin_get_data. */
WA.NR_WORD = "Not recommended";
WA.NR_TIP = "The instructor says this branch is not for this student — different from simply not ranking it, which says nothing either way.";

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
      ranks: {
        fighters: mp && mp.ranks ? mp.ranks.fighters : null,
        helicopters: mp && mp.ranks ? mp.ranks.helicopters : null,
        transport_ff: mp && mp.ranks ? mp.ranks.transport_ff : null,
      },
      nr: {
        fighters: !!(mp && mp.not_recommended && mp.not_recommended.fighters),
        helicopters: !!(mp && mp.not_recommended && mp.not_recommended.helicopters),
        transport_ff: !!(mp && mp.not_recommended && mp.not_recommended.transport_ff),
      },
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
        ${failLine}
      </div>`;
  }

  function chipRow(sid, branch) {
    const cur = P[sid].ranks[branch];
    const nr = P[sid].nr[branch];
    return [1, 2, 3].map((n) => `
      <button type="button" class="chip${cur === n ? " is-on" : ""}"
              data-stu="${esc(sid)}" data-branch="${esc(branch)}" data-rank="${n}"
              aria-pressed="${cur === n ? "true" : "false"}">${WA.RANK_WORD[n]}</button>`).join("") +
      `<button type="button" class="chip chip-nr${nr ? " is-on" : ""}"
               data-stu="${esc(sid)}" data-branch="${esc(branch)}" data-nr="1"
               title="${esc(WA.NR_TIP)}"
               aria-pressed="${nr ? "true" : "false"}">${esc(WA.NR_WORD)}</button>`;
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
        <div class="hint" style="margin-bottom:6px">Your recommendation — rank up to three branches
          (each position used once), or say <b>Not recommended</b> for a branch you would not send
          this student to. A branch you leave untouched says nothing either way:</div>
        ${WA.BRANCHES.map((b) => `
          <div class="rankrow"><span class="bl">${esc(b.label)}</span>
            <span class="rk-chips" data-chips="${esc(sid)}:${esc(b.id)}">${chipRow(sid, b.id)}</span></div>`).join("")}
        <div class="prop-foot">
          <label class="ck"><input type="checkbox" data-flew="${esc(sid)}" ${p.flew_with ? "checked" : ""}>
            I have flown with this student</label>
          <input type="text" placeholder="Comment (optional)" maxlength="500"
                 value="${esc(p.comment)}" data-comment="${esc(sid)}">
          <button type="button" class="btn btn-primary btn-sm" data-save="${esc(sid)}">Save${asCO ? " as CO" : ""}</button>
          <span class="prop-st" data-st="${esc(sid)}">${p.savedAt
            ? "Saved ✓ " + esc(fmtDT(p.savedAt)) : "No recommendation submitted yet."}</span>
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
          <div class="cotxt"><b>Entering as CO</b> &mdash; you are filling in the recommendations of
            <b>${esc(WA.personName(who, true))}</b> &mdash; everything you save here is tagged
            <b>&ldquo;entered by CO&rdquo;</b> and shown as such everywhere, until
            ${esc(who.last_name || "the instructor")} saves the same recommendation themselves.</div>
          ${backBtn}
        </div>` : ""}
      <section class="card">
        <div class="idhead">
          <span class="nm">${esc(WA.personName(who, true))}</span>
          <span class="meta">${esc([who.duty, who.leadership, who.status].filter(Boolean).join(" · "))}</span>
        </div>
        <p class="hint" style="margin-top:6px">Utilization recommendations for the Wing Commander brief.
          For each student, rank the branches ${asCO ? "this instructor recommends" : "you recommend"} —
          <b>1st</b> is ${asCO ? "their" : "your"} strongest choice.
          ${asCO ? "One" : "You"} may rank one, two or all three branches; the same position cannot go to
          two branches (picking it again moves it). Tap a selected position to clear it. Each student card
          also shows the data the student self-reported.
          ${asCO ? "The instructor can overwrite any of this from their own link." : "You can return and edit any time."}</p>
      </section>
      ${data.students.length
        ? data.students.map(stuCard).join("")
        : `<section class="card"><p class="hint">No active students yet.</p></section>`}
    </div>
    <div class="print-only" id="print-ins"></div>`;

  const root = $("ins-form");

  /* ══════════════════════════════════════════════════════════════════════════
     THE PRINTED RECOMMENDATION SHEET (round 8).
     Until now this view had no print block at all, so Ctrl+P printed the live
     form — chips, buttons, filter boxes and all — and the instructor got a
     screenshot of an app instead of a document. It now prints what the
     document actually is: a header naming whose recommendations these are, and
     one BLOCK PER STUDENT carrying (a) the identity line, (b) the branch table
     — position or "Not recommended" per branch, with the fourth state spelled
     out in words because paper has no colour — (c) whether the instructor has
     flown with the student and their comment, and (d) the student's own
     reported record in one compact table, which is the evidence the
     recommendation rests on. Monochrome, like every other printed surface.
     ══════════════════════════════════════════════════════════════════════════ */
  function branchWord(p, bid) {
    if (p.ranks[bid]) return WA.RANK_WORD[p.ranks[bid]] + " choice";
    if (p.nr[bid]) return WA.NR_WORD;
    return "—";
  }
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
      const anySaid = WA.BRANCHES.some((b) => p.ranks[b.id] || p.nr[b.id]);
      return `
        <div class="pr-ins-blk">
          <h3>${esc(WA.personName(s.person, true))}
            <span class="pr-ins-meta">${esc([s.person.mn ? "MN " + s.person.mn : "",
              s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}</span></h3>
          <table class="pr-t"><thead><tr><th>Branch</th><th>Recommendation</th></tr></thead><tbody>
            ${WA.BRANCHES.map((b) => `<tr><td>${esc(b.label)}</td>
              <td${p.nr[b.id] ? ' class="pr-nr"' : ""}>${esc(branchWord(p, b.id))}</td></tr>`).join("")}
          </tbody></table>
          <p class="pr-ins-line"><b>Flown with this student:</b> ${p.flew_with ? "yes" : "no"}
            &nbsp;·&nbsp; <b>Recommendation:</b> ${anySaid
              ? "submitted" + (p.savedAt ? " " + esc(fmtDT(p.savedAt)) : "")
              : "nothing recorded for any branch"}</p>
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
          <span class="pr-brand-sub">364 MEA — utilization recommendations</span></div>
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

  function refreshChips(sid) {
    for (const b of WA.BRANCHES) {
      const holder = root.querySelector(`[data-chips="${sid}:${b.id}"]`);
      if (holder) holder.innerHTML = chipRow(sid, b.id);
    }
  }
  function markDirty(sid) {
    P[sid].dirty = true;
    if (WA._insPrint) WA._insPrint();
    const st = root.querySelector(`[data-st="${sid}"]`);
    st.className = "prop-st";
    st.textContent = "Unsaved changes — press Save.";
  }

  root.addEventListener("click", async (ev) => {
    /* NOT RECOMMENDED — mutually exclusive with a rank, and a toggle of its
       own: tapping it again returns the branch to untouched (round 8) */
    const nrChip = ev.target.closest(".chip[data-nr]");
    if (nrChip) {
      const sid = nrChip.dataset.stu, branch = nrChip.dataset.branch;
      const on = !P[sid].nr[branch];
      P[sid].nr[branch] = on;
      if (on) P[sid].ranks[branch] = null;
      refreshChips(sid);
      markDirty(sid);
      return;
    }
    const chip = ev.target.closest(".chip[data-rank]");
    if (chip) {
      const sid = chip.dataset.stu, branch = chip.dataset.branch, n = Number(chip.dataset.rank);
      const ranks = P[sid].ranks;
      if (ranks[branch] === n) {
        ranks[branch] = null;                 // tap again → clear
      } else {
        for (const b of WA.BRANCHES) if (ranks[b.id] === n) ranks[b.id] = null;  // uniqueness
        ranks[branch] = n;
        P[sid].nr[branch] = false;            // a rank IS a recommendation
      }
      refreshChips(sid);
      markDirty(sid);
      return;
    }
    const save = ev.target.closest("[data-save]");
    if (save) {
      const sid = save.dataset.save;
      const st = root.querySelector(`[data-st="${sid}"]`);
      save.disabled = true;
      st.className = "prop-st";
      st.textContent = "Saving…";
      try {
        const payload = { ranks: P[sid].ranks, not_recommended: P[sid].nr,
                          flew_with: P[sid].flew_with,
                          comment: P[sid].comment.trim() || null };
        const res = asCO
          ? await rpc("admin_save_proposal", { p_token: WA.token, p_instructor_id: O.targetId,
                                               p_student_id: sid, p_payload: payload })
          : await rpc("save_proposal", { p_token: WA.token, p_student_id: sid, p_payload: payload });
        P[sid].savedAt = res.updated_at;
        P[sid].enteredBy = res.entered_by || null;
        P[sid].dirty = false;
        st.className = "prop-st ok";
        st.textContent = "Saved ✓ " + fmtDT(res.updated_at) + (asCO ? " — tagged as entered by CO" : "");
        if (WA._insPrint) WA._insPrint();
        /* mirror the server's stamp: the OWNER saving clears it (db/schema.sql
           → wa.write_proposal), the CO saving sets it */
        const tag = root.querySelector(`[data-cotag="${sid}"]`);
        if (asCO && !tag) {
          st.insertAdjacentHTML("afterend",
            `<span class="cotag" data-cotag="${esc(sid)}" title="${esc(WA.CO_TIP)}">CO</span>`);
        } else if (!asCO && tag) tag.remove();
        toast(asCO ? "Recommendation saved as CO — it is tagged" : "Recommendation saved");
      } catch (e) {
        st.className = "prop-st err";
        st.textContent = "Save failed: " + e.message;
        toast("Save failed: " + e.message, true);
      }
      save.disabled = false;
    }
  });

  root.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset.flew) { P[el.dataset.flew].flew_with = el.checked; markDirty(el.dataset.flew); }
    else if (el.dataset.comment) { P[el.dataset.comment].comment = el.value; markDirty(el.dataset.comment); }
  });

  /* Back to the dashboard — the admin token stays in the hash */
  if (asCO) {
    view.addEventListener("click", (ev) => {
      if (!ev.target.closest("[data-coback]")) return;
      if (Object.values(P).some((x) => x.dirty) && !window.confirm(
        "Some recommendations have unsaved changes. Leave without saving?")) return;
      for (const k of Object.keys(P)) P[k].dirty = false;
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
