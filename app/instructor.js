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
        (sl.row.date ? ` (${esc(fmtD(sl.row.date))})` : "") + (sl.row.pending ? " ⏳" : "") + WA.coTag(sl.row)
      : `<span class="k">${esc(sl.def.id)} —</span>`).join(" · ") +
      (slots.extras.length ? ` · <span class="k">${slots.extras.length} imported, not identified</span>` : "");
    const soLine = `<span class="k">${doneSlots} of ${nSlots} syllabus solos flown${
      solos.length > doneSlots ? " · " + (solos.length - doneSlots) + " additional" : ""}</span>` +
      (solos.length ? " — " + solos.map((e) => esc(fmtD(e.date)) +
          (e.ng ? ` — <span class="k">NG</span>` : ` — <b>${WA.pct(e.grade)}</b>`) + WA.coTag(e)).join(" · ") : "");
    /* one line per entry — items inside an entry are separated by · , so the
       entries themselves must not be, or a multi-item FAIL reads as three */
    const failLine = ["fail", "almost_good"].map((k) => {
      const list = Array.isArray(rec[k]) ? rec[k] : [];
      if (!list.length) return "";
      return `<div class="line">${esc(WA.secLabel(k))}:` + list.map((e) =>
        `<div class="sub">${esc(fmtD(e.date))}${e.flight_code ? " <b>" + WA.sortieCell(e.category, e.flight_code) + "</b>" : ""}
          ${esc(WA.itemsLabel(e))}${(e.items || []).length > 1 ? ` <span class="k">(${(e.items || []).length} items)</span>` : ""}${
          e.grade === null || e.grade === undefined ? "" : ` <b>${WA.pct(e.grade)}</b>`}
          ${e.instructor ? `<span class="k">w/ ${esc(e.instructor)}</span>` : ""}
          ${e.pending ? "⏳" : ""}${WA.coTag(e)}</div>`).join("") + `</div>`;
    }).join("");
    /* NOTE (round-4 W3c): no "Evals" count here — every student converges to
       the same eight checkrides, so the number compares nothing. The grades
       on the Evaluations line below are the information. */
    return `
      <div class="selfrep">
        <div class="t">Self-reported record ${s.last_update
          ? `<span class="badge">upd. ${esc(fmtDT(s.last_update))}</span>` : `<span class="badge badge-warn">nothing submitted yet</span>`}
          ${st.pending ? `<span class="badge badge-warn">${st.pending} pending</span>` : ""}
          ${src.any
            ? `<span class="badge badge-acc" title="${esc(src.tip)}">${esc(src.all
                ? "entered by CO" : src.n + " entr" + (src.n === 1 ? "y" : "ies") + " by CO")}</span>`
            : ""}</div>
        <div class="kgrid">
          <span><span class="k">Solos</span> <b>${st.solos}</b></span>
          <span><span class="k">NFS</span> <b>${st.nfs}</b></span>
          <span><span class="k">SMS</span> <b>${st.sms}</b></span>
          <span><span class="k">FAIL</span> <b>${st.fail}</b></span>
          <span><span class="k">A.GOOD</span> <b>${st.almost_good}</b></span>
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
    return [1, 2, 3].map((n) => `
      <button type="button" class="chip${cur === n ? " is-on" : ""}"
              data-stu="${esc(sid)}" data-branch="${esc(branch)}" data-rank="${n}"
              aria-pressed="${cur === n ? "true" : "false"}">${WA.RANK_WORD[n]}</button>`).join("");
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
          (each position used once):</div>
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
    <div class="wrap" id="ins-form">
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
    </div>`;

  const root = $("ins-form");

  function refreshChips(sid) {
    for (const b of WA.BRANCHES) {
      const holder = root.querySelector(`[data-chips="${sid}:${b.id}"]`);
      if (holder) holder.innerHTML = chipRow(sid, b.id);
    }
  }
  function markDirty(sid) {
    P[sid].dirty = true;
    const st = root.querySelector(`[data-st="${sid}"]`);
    st.className = "prop-st";
    st.textContent = "Unsaved changes — press Save.";
  }

  root.addEventListener("click", async (ev) => {
    const chip = ev.target.closest(".chip[data-rank]");
    if (chip) {
      const sid = chip.dataset.stu, branch = chip.dataset.branch, n = Number(chip.dataset.rank);
      const ranks = P[sid].ranks;
      if (ranks[branch] === n) {
        ranks[branch] = null;                 // tap again → clear
      } else {
        for (const b of WA.BRANCHES) if (ranks[b.id] === n) ranks[b.id] = null;  // uniqueness
        ranks[branch] = n;
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
        const payload = { ranks: P[sid].ranks, flew_with: P[sid].flew_with,
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
