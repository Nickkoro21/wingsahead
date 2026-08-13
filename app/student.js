"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   WingsAhead — STUDENT form (mobile-first).
   Sectioned, repeatable rows (+add/remove), pending flags, Save any time,
   shows own last_update. ISO storage / DD-MM-YYYY display.
   ══════════════════════════════════════════════════════════════════════════ */

WA.renderStudent = async function (view, me) {
  let S = { data: emptyRecord(), lastUpdate: null, dirty: false };

  function emptyRecord() {
    return { nfs: { count: 0, dates: [] }, sms: [], fail: [], almost_good: [],
             airsickness: [], evaluations: [], solo_flights: [],
             progress_tests: [], aptitude_exams: [] };
  }

  function normalize(d) {
    const base = emptyRecord();
    if (!d || typeof d !== "object") return base;
    const out = base;
    if (d.nfs && typeof d.nfs === "object") {
      out.nfs.count = isFinite(Number(d.nfs.count)) ? Number(d.nfs.count) : 0;
      out.nfs.dates = Array.isArray(d.nfs.dates) ? d.nfs.dates.map(String) : [];
    }
    for (const k of ["sms", "fail", "almost_good", "airsickness", "evaluations",
                     "solo_flights", "progress_tests", "aptitude_exams"]) {
      if (Array.isArray(d[k])) out[k] = d[k].map((e) => (e && typeof e === "object") ? { ...e } : {});
    }
    return out;
  }

  try {
    const got = await rpc("get_student_form", { p_token: WA.token });
    S.data = normalize(got.data);
    S.lastUpdate = got.last_update || null;
  } catch (e) {
    view.innerHTML = `<div class="landing"><h2>Could not load your form</h2><p>${esc(e.message)}</p></div>`;
    return;
  }

  /* ── section descriptors ── */
  const dateF = (sec, i, field, val, label, req) => `
    <label class="f"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="date" value="${esc(val || "")}" data-sec="${esc(sec)}" data-idx="${i}" data-field="${esc(field)}"></label>`;
  const textF = (sec, i, field, val, label, req, ph) => `
    <label class="f"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="text" value="${esc(val || "")}" placeholder="${esc(ph || "")}"
             data-sec="${esc(sec)}" data-idx="${i}" data-field="${esc(field)}"></label>`;
  const gradeF = (sec, i, field, val, label, req) => `
    <label class="f"><span>${esc(label)}${req ? " *" : ""}</span>
      <input type="number" min="0" max="100" step="0.5" inputmode="decimal"
             value="${val === null || val === undefined || val === "" ? "" : esc(val)}"
             data-sec="${esc(sec)}" data-idx="${i}" data-field="${esc(field)}"></label>`;
  const pendF = (sec, i, on) => `
    <label class="ck pend"><input type="checkbox" ${on ? "checked" : ""}
      data-sec="${esc(sec)}" data-idx="${i}" data-field="pending"> pending</label>`;
  const rmB = (sec, i) => `<button type="button" class="rm" data-rm="${esc(sec)}" data-idx="${i}">&#10005; remove</button>`;

  const SECTIONS = [
    { id: "sms", title: "SMS", hint: "Safety Management System entries — entrance / exit dates. Tick pending if the entry is not closed yet.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("sms", i, "entrance_date", e.entrance_date, "Entrance date", true)}
          ${dateF("sms", i, "exit_date", e.exit_date, "Exit date (if closed)")}
        </div>
        <div class="rfoot">${pendF("sms", i, e.pending)}${rmB("sms", i)}</div>`,
      blank: () => ({ entrance_date: "", exit_date: "", pending: false }) },
    { id: "fail", title: "FAIL", hint: "One entry per FAIL — which item missed the desired performance.",
      row: (e, i) => `
        ${textF("fail", i, "item", e.item, "Item that missed the desired performance", true, "e.g. steep turns")}
        <div class="rgrid2">${dateF("fail", i, "date", e.date, "Date (optional)")}<div></div></div>
        <div class="rfoot">${pendF("fail", i, e.pending)}${rmB("fail", i)}</div>`,
      blank: () => ({ item: "", date: "", pending: false }) },
    { id: "almost_good", title: "ALMOST GOOD", hint: "One entry per ALMOST GOOD — which item missed the desired performance.",
      row: (e, i) => `
        ${textF("almost_good", i, "item", e.item, "Item that missed the desired performance", true)}
        <div class="rgrid2">${dateF("almost_good", i, "date", e.date, "Date (optional)")}<div></div></div>
        <div class="rfoot">${pendF("almost_good", i, e.pending)}${rmB("almost_good", i)}</div>`,
      blank: () => ({ item: "", date: "", pending: false }) },
    { id: "airsickness", title: "Airsickness", hint: "One entry per airsickness event.",
      row: (e, i) => `
        <div class="rgrid2">${dateF("airsickness", i, "date", e.date, "Date", true)}<div></div></div>
        <div class="rfoot">${rmB("airsickness", i)}</div>`,
      blank: () => ({ date: "" }) },
    { id: "evaluations", title: "Evaluations", hint: "Your evaluation flights — instructor, grade (0-100), date.",
      row: (e, i) => `
        ${textF("evaluations", i, "with", e.with, "With (instructor)", false, "e.g. Maj Koroniadis")}
        <div class="rgrid2">
          ${gradeF("evaluations", i, "grade", e.grade, "Grade")}
          ${dateF("evaluations", i, "date", e.date, "Date")}
        </div>
        <div class="rfoot">${pendF("evaluations", i, e.pending)}${rmB("evaluations", i)}</div>`,
      blank: () => ({ with: "", grade: null, date: "", pending: false }) },
    { id: "solo_flights", title: "Solo flights", hint: "Instructor and grade are required only when the solo was graded.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("solo_flights", i, "date", e.date, "Date", true)}
          <label class="ck" style="align-self:end; padding-bottom:8px;">
            <input type="checkbox" ${e.graded ? "checked" : ""}
              data-sec="solo_flights" data-idx="${i}" data-field="graded"> graded</label>
        </div>
        <div class="rgrid2 solo-g" ${e.graded ? "" : "hidden"}>
          ${textF("solo_flights", i, "instructor", e.instructor, "Instructor", !!e.graded)}
          ${gradeF("solo_flights", i, "grade", e.grade, "Grade", !!e.graded)}
        </div>
        <div class="rfoot">${rmB("solo_flights", i)}</div>`,
      blank: () => ({ date: "", graded: false, instructor: "", grade: null }) },
    { id: "progress_tests", title: "Progress tests", hint: "Result, or tick pending if you are still waiting for it.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("progress_tests", i, "date", e.date, "Date")}
          ${textF("progress_tests", i, "by", e.by, "By (examiner)")}
        </div>
        ${textF("progress_tests", i, "result", e.result, "Result", false, "e.g. pass / 82%")}
        <div class="rfoot">${pendF("progress_tests", i, e.pending)}${rmB("progress_tests", i)}</div>`,
      blank: () => ({ date: "", by: "", result: "", pending: false }) },
    { id: "aptitude_exams", title: "Aptitude exams", hint: "Result, or tick pending if you are still waiting for it.",
      row: (e, i) => `
        <div class="rgrid2">
          ${dateF("aptitude_exams", i, "date", e.date, "Date")}
          ${textF("aptitude_exams", i, "by", e.by, "By (examiner)")}
        </div>
        ${textF("aptitude_exams", i, "result", e.result, "Result")}
        <div class="rfoot">${pendF("aptitude_exams", i, e.pending)}${rmB("aptitude_exams", i)}</div>`,
      blank: () => ({ date: "", by: "", result: "", pending: false }) },
  ];

  function rowsHTML(sec) {
    const list = S.data[sec.id];
    if (!list.length) return `<div class="empty">No entries — use “+ Add”.</div>`;
    return list.map((e, i) =>
      `<div class="rrow${e.pending ? " is-pending" : ""}">${sec.row(e, i)}</div>`).join("");
  }

  function secHTML(sec) {
    return `
      <section class="card">
        <div class="sec-h"><h2>${esc(sec.title)}</h2>
          <span class="cnt" id="cnt-${esc(sec.id)}">${S.data[sec.id].length}</span>
          <button type="button" class="btn btn-sm" data-add="${esc(sec.id)}">+ Add</button></div>
        <p class="hint">${esc(sec.hint)}</p>
        <div style="margin-top:8px" id="rows-${esc(sec.id)}">${rowsHTML(sec)}</div>
      </section>`;
  }

  view.innerHTML = `
    <div class="wrap" id="stu-form">
      <section class="card">
        <div class="idhead">
          <span class="nm">${esc(WA.personName(me, true))}</span>
          <span class="meta">${esc([me.mn ? "MN " + me.mn : "", me.class ? "Class " + me.class : ""].filter(Boolean).join(" · "))}</span>
          <span class="lastupd" id="stu-lastupd">Last update: <b>${esc(fmtDT(S.lastUpdate))}</b></span>
        </div>
        <p class="hint" style="margin-top:6px">Your self-reported training record. It is visible to your
          instructors and the squadron CO. You can come back through the same link and edit at any time
          — remember to press <b>Save</b>.</p>
      </section>

      <section class="card">
        <div class="sec-h"><h2>NFS</h2></div>
        <p class="hint">Number of NFS and, optionally, their dates.</p>
        <div class="rgrid2" style="margin-top:8px">
          <label class="f"><span>NFS count</span>
            <input type="number" min="0" max="999" step="1" inputmode="numeric" id="nfs-count"
                   value="${esc(S.data.nfs.count)}"></label>
          <div></div>
        </div>
        <div class="sec-h" style="margin-top:10px"><h3 style="margin:0">NFS dates (optional)</h3>
          <button type="button" class="btn btn-sm" data-add="nfs_dates">+ Add date</button></div>
        <div id="rows-nfs_dates">${nfsDatesHTML()}</div>
      </section>

      ${SECTIONS.map(secHTML).join("")}
    </div>
    <div class="savebar">
      <button type="button" class="btn btn-primary" id="stu-save">Save</button>
      <span class="st" id="stu-status">All changes are kept only after you press Save.</span>
    </div>`;

  function nfsDatesHTML() {
    if (!S.data.nfs.dates.length) return `<div class="empty">No dates recorded.</div>`;
    return S.data.nfs.dates.map((d, i) => `
      <div class="rrow"><div class="rgrid2">
        <label class="f"><span>Date</span>
          <input type="date" value="${esc(d)}" data-nfsdate="${i}"></label><div></div></div>
        <div class="rfoot"><button type="button" class="rm" data-rm="nfs_dates" data-idx="${i}">&#10005; remove</button></div>
      </div>`).join("");
  }

  const form = $("stu-form");
  const secById = (id) => SECTIONS.find((s) => s.id === id);

  function redraw(secId) {
    if (secId === "nfs_dates") {
      $("rows-nfs_dates").innerHTML = nfsDatesHTML();
      return;
    }
    const sec = secById(secId);
    $("rows-" + secId).innerHTML = rowsHTML(sec);
    $("cnt-" + secId).textContent = S.data[secId].length;
  }

  function markDirty() {
    S.dirty = true;
    const st = $("stu-status");
    st.className = "st";
    st.textContent = "Unsaved changes — press Save.";
  }

  /* attach-once delegated listeners */
  form.addEventListener("click", (ev) => {
    const add = ev.target.closest("[data-add]");
    if (add) {
      const id = add.dataset.add;
      if (id === "nfs_dates") S.data.nfs.dates.push("");
      else S.data[id].push(secById(id).blank());
      redraw(id);
      markDirty();
      return;
    }
    const rm = ev.target.closest("[data-rm]");
    if (rm) {
      const id = rm.dataset.rm, i = Number(rm.dataset.idx);
      if (id === "nfs_dates") S.data.nfs.dates.splice(i, 1);
      else S.data[id].splice(i, 1);
      redraw(id);
      markDirty();
    }
  });

  form.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.id === "nfs-count") {
      S.data.nfs.count = el.value === "" ? 0 : Math.max(0, Math.floor(num(el.value)));
      markDirty();
      return;
    }
    if (el.dataset.nfsdate !== undefined) {
      S.data.nfs.dates[Number(el.dataset.nfsdate)] = el.value;
      markDirty();
      return;
    }
    const sec = el.dataset.sec, f = el.dataset.field;
    if (!sec || !f) return;
    const entry = S.data[sec][Number(el.dataset.idx)];
    if (!entry) return;
    if (el.type === "checkbox") {
      entry[f] = el.checked;
      if (f === "pending") el.closest(".rrow").classList.toggle("is-pending", el.checked);
      if (f === "graded") redraw(sec);       // show/hide instructor+grade
    } else if (el.type === "number") {
      entry[f] = el.value === "" ? null : num(el.value);
    } else {
      entry[f] = el.value;
    }
    markDirty();
  });

  /* ── collect + client-side validation (server re-validates everything) ── */
  function buildPayload() {
    const d = S.data, problems = [];
    const clean = {
      nfs: { count: Math.max(0, Math.floor(num(d.nfs.count))),
             dates: d.nfs.dates.filter((x) => x) },
      sms: [], fail: [], almost_good: [], airsickness: [], evaluations: [],
      solo_flights: [], progress_tests: [], aptitude_exams: [],
    };
    d.sms.forEach((e, i) => {
      if (!e.entrance_date) { problems.push("SMS #" + (i + 1) + ": entrance date is required"); return; }
      clean.sms.push({ entrance_date: e.entrance_date, exit_date: e.exit_date || null, pending: !!e.pending });
    });
    for (const k of ["fail", "almost_good"]) {
      d[k].forEach((e, i) => {
        const item = String(e.item || "").trim();
        if (!item) { problems.push((k === "fail" ? "FAIL" : "ALMOST GOOD") + " #" + (i + 1) + ": the item is required"); return; }
        clean[k].push({ item, date: e.date || null, pending: !!e.pending });
      });
    }
    d.airsickness.forEach((e, i) => {
      if (!e.date) { problems.push("Airsickness #" + (i + 1) + ": date is required"); return; }
      clean.airsickness.push({ date: e.date });
    });
    d.evaluations.forEach((e) => {
      clean.evaluations.push({
        with: String(e.with || "").trim() || null,
        grade: (e.grade === null || e.grade === undefined || e.grade === "") ? null : num(e.grade),
        date: e.date || null, pending: !!e.pending });
    });
    d.solo_flights.forEach((e, i) => {
      if (!e.date) { problems.push("Solo #" + (i + 1) + ": date is required"); return; }
      const graded = !!e.graded;
      if (graded && (!String(e.instructor || "").trim() ||
                     e.grade === null || e.grade === undefined || e.grade === "")) {
        problems.push("Solo #" + (i + 1) + ": instructor and grade are required when graded");
        return;
      }
      clean.solo_flights.push({
        date: e.date, graded,
        instructor: graded ? String(e.instructor).trim() : (String(e.instructor || "").trim() || null),
        grade: (e.grade === null || e.grade === undefined || e.grade === "") ? null : num(e.grade) });
    });
    for (const k of ["progress_tests", "aptitude_exams"]) {
      d[k].forEach((e) => {
        clean[k].push({ date: e.date || null, by: String(e.by || "").trim() || null,
                        result: String(e.result || "").trim() || null, pending: !!e.pending });
      });
    }
    return { clean, problems };
  }

  $("stu-save").addEventListener("click", async () => {
    const st = $("stu-status");
    const { clean, problems } = buildPayload();
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
      const res = await rpc("save_student_record", { p_token: WA.token, p_payload: clean });
      S.lastUpdate = res.last_update;
      S.dirty = false;
      $("stu-lastupd").innerHTML = `Last update: <b>${esc(fmtDT(S.lastUpdate))}</b>`;
      st.className = "st ok";
      st.textContent = "Saved ✓ " + fmtDT(S.lastUpdate);
      toast("Record saved");
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
