"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   WingsAhead — INSTRUCTOR form (mobile-first).
   Student list; per student a compact card of their self-reported data
   beside the ranking pickers (1st/2nd/3rd across the three branches,
   uniqueness enforced) + flew-with + comment. Save/edit any time.
   ══════════════════════════════════════════════════════════════════════════ */

WA.BRANCHES = [
  { id: "fighters", label: "Fighters" },
  { id: "helicopters", label: "Helicopters" },
  { id: "transport_ff", label: "Transport–Firefighting" },
];
WA.RANK_WORD = { 1: "1st", 2: "2nd", 3: "3rd" };

WA.renderInstructor = async function (view, me) {
  let data;
  try {
    data = await rpc("list_students_for_instructor", { p_token: WA.token });
  } catch (e) {
    view.innerHTML = `<div class="landing"><h2>Could not load</h2><p>${esc(e.message)}</p></div>`;
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
      dirty: false,
    };
  }

  function selfCard(s) {
    const st = WA.recStats(s.record);
    const evals = Array.isArray(s.record.evaluations) ? s.record.evaluations : [];
    const solos = Array.isArray(s.record.solo_flights) ? s.record.solo_flights : [];
    const evLine = evals.length
      ? evals.map((e) => `<b>${esc(e.grade === null || e.grade === undefined ? "?" : e.grade)}</b>` +
          (e.date ? ` (${esc(fmtD(e.date))})` : "") + (e.pending ? " ⏳" : "")).join(" · ")
      : "none reported";
    const soLine = solos.length
      ? solos.map((e) => esc(fmtD(e.date)) +
          (e.graded ? ` — <b>${esc(e.grade === null || e.grade === undefined ? "?" : e.grade)}</b>` : "")).join(" · ")
      : "none reported";
    return `
      <div class="selfrep">
        <div class="t">Self-reported record ${s.last_update
          ? `<span class="badge">upd. ${esc(fmtDT(s.last_update))}</span>` : `<span class="badge badge-warn">nothing submitted yet</span>`}
          ${st.pending ? `<span class="badge badge-warn">${st.pending} pending</span>` : ""}</div>
        <div class="kgrid">
          <span><span class="k">Evals</span> <b>${st.evals}</b>${st.evalMean !== null ? ` <span class="k">(μ</span> <b>${esc(st.evalMean)}</b><span class="k">)</span>` : ""}</span>
          <span><span class="k">Solos</span> <b>${st.solos}</b></span>
          <span><span class="k">NFS</span> <b>${st.nfs}</b></span>
          <span><span class="k">SMS</span> <b>${st.sms}</b></span>
          <span><span class="k">FAIL</span> <b>${st.fail}</b></span>
          <span><span class="k">A.GOOD</span> <b>${st.almost_good}</b></span>
          <span><span class="k">Airsick</span> <b>${st.airsickness}</b></span>
          <span><span class="k">Progr.</span> <b>${st.progress}</b></span>
          <span><span class="k">Aptit.</span> <b>${st.aptitude}</b></span>
        </div>
        <div class="line">Evaluations: ${evLine}</div>
        <div class="line">Solo flights: ${soLine}</div>
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
          <button type="button" class="btn btn-primary btn-sm" data-save="${esc(sid)}">Save</button>
          <span class="prop-st" data-st="${esc(sid)}">${p.savedAt
            ? "Saved ✓ " + esc(fmtDT(p.savedAt)) : "No recommendation submitted yet."}</span>
        </div>
      </section>`;
  }

  view.innerHTML = `
    <div class="wrap" id="ins-form">
      <section class="card">
        <div class="idhead">
          <span class="nm">${esc(WA.personName(me, true))}</span>
          <span class="meta">${esc([me.duty, me.leadership, me.status].filter(Boolean).join(" · "))}</span>
        </div>
        <p class="hint" style="margin-top:6px">Utilization recommendations for the Wing Commander brief.
          For each student, rank the branches you recommend — <b>1st</b> is your strongest choice.
          You may rank one, two or all three branches; the same position cannot go to two branches
          (picking it again moves it). Tap a selected position to clear it. Each student card also shows
          the data the student self-reported. You can return and edit any time.</p>
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
        const res = await rpc("save_proposal", {
          p_token: WA.token, p_student_id: sid,
          p_payload: { ranks: P[sid].ranks, flew_with: P[sid].flew_with,
                       comment: P[sid].comment.trim() || null },
        });
        P[sid].savedAt = res.updated_at;
        P[sid].dirty = false;
        st.className = "prop-st ok";
        st.textContent = "Saved ✓ " + fmtDT(res.updated_at);
        toast("Recommendation saved");
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

  WA._insState = P;
  if (!WA._insUnloadHooked) {
    WA._insUnloadHooked = true;
    window.addEventListener("beforeunload", (ev) => {
      const p = WA._insState;
      if (p && Object.values(p).some((x) => x.dirty)) { ev.preventDefault(); ev.returnValue = ""; }
    });
  }
};
