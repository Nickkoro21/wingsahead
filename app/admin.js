"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   Wings Ahead — ADMIN dashboard (desktop-first).
   Overview · Student analysis (4-bar SVG comparison + trend + branch boxes)
   · Brief mode (large type, one student/screen, arrows + keyboard, print)
   · People & link management · CSV/JSON export.
   ══════════════════════════════════════════════════════════════════════════ */

WA.renderAdmin = async function (view, me) {
  /* coming back from an "enter on behalf" detour, the dashboard reopens where
     it was left (tab + student), so Back is a return and not a reset */
  const back = WA._admReturn || {};
  WA._admReturn = null;
  const A = { data: null, people: null, tab: back.tab || "overview", sel: back.sel || 0,
              metric: "fail", evalSel: "C4590", plotCat: "contact",
              rankSel: 1, loading: false, hi: null };
  WA._adminState = A;

  const BR = WA.BRANCHES;   // [{id,label}] — defined in instructor.js
  const RW = WA.RANK_WORD;  // {1:"1st",2:"2nd",3:"3rd"}

  /* Countable metrics only — round-2 R4 removed the evaluation COUNT chip
     (every student converges to the same eight checkrides) and the mean
     evaluation grade (evaluations are compared one identity at a time,
     in the per-evaluation card below).
     DIRECTION AUDIT (round-3 W5): FPC and CEF exist only after a failure,
     so more of them is worse — they can never read "higher is better". */
  const METRICS = [
    { id: "fail", label: "FAIL", dir: "low", fn: (s) => s.fail },
    { id: "almost_good", label: "ALMOST GOOD", dir: "low", fn: (s) => s.almost_good },
    { id: "nfs", label: "NFS", dir: "low", fn: (s) => s.nfs },
    { id: "sms", label: "SMS entries", dir: "low", fn: (s) => s.sms },
    { id: "airsickness", label: "Airsickness", dir: "low", fn: (s) => s.airsickness },
    { id: "solos", label: "Solo flights", dir: "high", fn: (s) => s.solos },
    { id: "fpc", label: "FPC", dir: "low", fn: (s) => s.fpc, tip: WA.secTip("fpc") },
    { id: "cef", label: "CEF", dir: "low", fn: (s) => s.cef, tip: WA.secTip("cef") },
  ];
  const DIRWORD = { high: "higher is better", low: "lower is better" };

  /* ── data loading ── */
  async function load(soft) {
    if (A.loading) return;
    A.loading = true;
    try {
      const [d, p] = await Promise.all([
        rpc("admin_get_data", { p_token: WA.token }),
        rpc("admin_list_people", { p_token: WA.token }),
      ]);
      A.data = d;
      A.people = p;
      for (const s of A.data.students) {
        /* the server migrates on read; repeating it here keeps the dashboard
           correct against a cloud instance still running the v1 schema */
        s.record = WA.migrateRecord(s.record);
        s._stats = WA.recStats(s.record);
        s._evals = WA.evalRows(s.record);
        s._fpc = WA.fpcRows(s.record);
        /* WHOSE record this is, counted from the entries (round 4b): _src.all
           = the CO entered all of it, _src.some = the owner's record with
           _src.n CO additions. The record-level flag alone cannot tell them
           apart, and reading it as "CO record" is what round 4 got wrong. */
        s._src = WA.coSource(s.record, s.entered_by);
      }
      if (A.sel >= A.data.students.length) A.sel = Math.max(0, A.data.students.length - 1);
      if (!soft || safeToRedraw()) render();
      buildPrint();
    } catch (e) {
      if (!soft) view.innerHTML = `<div class="landing"><h2>Could not load</h2><p>${esc(e.message)}</p></div>`;
      else toast("Refresh failed: " + e.message, true);
    }
    A.loading = false;
  }

  /* how many records the students reported themselves and how many the CO
     entered for them — the one line the class summary owes the reader.
     A record the CO merely ADDED to stays in the self-reported count and is
     named separately; folding it into "entered by CO" would say the student
     never reported anything (round-4b fix). */
  function sourceLine(list) {
    const src = list.filter((s) => s.completion.has_record);
    if (!src.length) return "no records submitted yet";
    const co = src.filter((s) => s._src.all).length;
    const part = src.filter((s) => s._src.some);
    const adds = part.reduce((a, s) => a + s._src.n, 0);
    return (src.length - co) + " self-reported" +
      (part.length ? " (" + part.length + " with " + adds +
        (adds === 1 ? " entry" : " entries") + " added by the CO)" : "") +
      (co ? " · " + co + " entered by CO" : "");
  }

  /* the "enter on behalf" hop: remember where the dashboard was, then hand
     over to the hash route (the admin token travels in the hash). */
  function editAs(kind, id) {
    WA._admReturn = { tab: A.tab, sel: A.sel };
    location.hash = WA.coHash(kind, id);
  }

  function safeToRedraw() {
    const veil = view.querySelector(".veil");
    if (veil && !veil.classList.contains("hidden")) return false;
    const ae = document.activeElement;
    return !(ae && view.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName));
  }

  /* ── shell ── */
  view.innerHTML = `
    <div class="wrap-wide screen-only" id="adm">
      <div class="tabs" id="adm-tabs">
        <button type="button" class="chip is-on" data-tab="overview">Overview</button>
        <button type="button" class="chip" data-tab="students">Student analysis</button>
        <button type="button" class="chip" data-tab="brief">Brief mode</button>
        <button type="button" class="chip" data-tab="people">People &amp; links</button>
        <button type="button" class="chip" data-tab="refresh" title="Reload all data">&#8635; Refresh</button>
      </div>
      <div id="adm-content"><div class="card"><p class="hint">Loading…</p></div></div>
      <div class="veil hidden" id="adm-veil"><div class="modal" id="adm-modal"></div></div>
    </div>
    <div class="print-only" id="print-brief"></div>`;

  function render() {
    for (const c of view.querySelectorAll("#adm-tabs .chip"))
      c.classList.toggle("is-on", c.dataset.tab === A.tab);
    const el = $("adm-content");
    if (!A.data) { el.innerHTML = `<div class="card"><p class="hint">Loading…</p></div>`; return; }
    if (A.tab === "overview") el.innerHTML = htmlOverview();
    else if (A.tab === "students") el.innerHTML = htmlAnalysis();
    else if (A.tab === "brief") el.innerHTML = htmlBrief();
    else el.innerHTML = htmlPeople();
  }

  /* ════════ OVERVIEW ════════ */
  function propCounts(s) {
    const c = { fighters: 0, helicopters: 0, transport_ff: 0 };
    for (const p of s.proposals) for (const b of BR) if (p.ranks[b.id]) c[b.id]++;
    return c;
  }

  function htmlOverview() {
    const students = A.data.students;
    const insTotal = A.data.instructors.filter((i) => i.active).length;
    const rows = students.map((s, i) => {
      const st = s._stats, c = s.completion, pc = propCounts(s);
      const mb = (v) => Math.max(2, Math.min(18, v * 5));
      /* NOTE (round-4 W3c): no "Evals" column — every student converges to the
         same eight checkrides, so the count ranks nobody. The per-evaluation
         grades (analysis + print matrix) carry the comparison. */
      return `
        <tr class="rowlink" data-goto="${i}" title="Open student analysis">
          <td><b>${esc(WA.personName(s.person, true))}</b></td>
          <td>${esc(s.person.class || "—")}</td>
          <td class="num">${st.solos}</td>
          <td class="num">${st.nfs}</td>
          <td class="num">${st.sms}</td>
          <td class="num">${st.fail}</td>
          <td class="num">${st.almost_good}</td>
          <td class="num">${st.airsickness}</td>
          <td class="num">${st.fpc}</td>
          <td class="num">${st.cef}</td>
          <td>${st.pending ? `<span class="badge badge-warn">${st.pending} pending</span>` : `<span class="badge">—</span>`}</td>
          <td><span class="minibars" title="proposals naming Fighters / Helicopters / Transport–FF">
                <i style="height:${mb(pc.fighters)}px" title="Fighters: ${pc.fighters}"></i>
                <i class="b2" style="height:${mb(pc.helicopters)}px" title="Helicopters: ${pc.helicopters}"></i>
                <i class="b3" style="height:${mb(pc.transport_ff)}px" title="Transport–FF: ${pc.transport_ff}"></i>
              </span> <span class="badge">${c.proposals_in}/${c.instructors_total}</span></td>
          <td>${c.has_record
            ? `<span class="badge badge-good">✓ ${esc(fmtDT(s.last_update))}</span>`
            : `<span class="badge badge-bad">not submitted</span>`}
            ${WA.coRecordTag(s._src)}</td>
          <td><button type="button" class="btn btn-sm" data-editrec="${esc(s.person.id)}"
                title="Open this student's form and enter data on their behalf — every entry is tagged 'entered by CO'"
                >&#9998; Edit record</button></td>
        </tr>`;
    }).join("");

    const noRecord = students.filter((s) => !s.completion.has_record)
      .map((s) => esc(WA.personName(s.person, true)));
    const insRows = A.data.instructors.map((i) => {
      const done = i.proposals_count, all = A.data.students.length;
      const badge = !i.active ? `<span class="badge badge-bad">revoked</span>`
        : done === 0 ? `<span class="badge badge-bad">nothing yet</span>`
        : done < all ? `<span class="badge badge-warn">${done}/${all}</span>`
        : `<span class="badge badge-good">✓ ${done}/${all}</span>`;
      return `<span style="margin-right:14px; white-space:nowrap">${esc(WA.personName(i, true))} ${badge}</span>`;
    }).join(" ");

    return `
      <div class="toolrow">
        <span class="hint">${students.length} students · ${insTotal} active instructors ·
          records: ${esc(sourceLine(students))} ·
          data as of ${esc(fmtDT(A.data.generated_at))}</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" data-act="csv-summary">Export CSV — summary</button>
        <button type="button" class="btn btn-sm" data-act="csv-entries">Export CSV — every entry</button>
        <button type="button" class="btn btn-sm" data-act="csv-proposals">Export CSV — proposals</button>
        <button type="button" class="btn btn-sm" data-act="json-export">Export JSON — full</button>
      </div>
      <div class="tblwrap"><table class="tbl">
        <thead><tr>
          <th>Student</th><th>Class</th><th>Solos</th><th>NFS</th><th>SMS</th>
          <th>FAIL</th><th>A.Good</th><th>Airsick</th>
          <th title="${esc(WA.secTip("fpc"))}">FPC</th><th title="${esc(WA.secTip("cef"))}">CEF</th>
          <th>Pending</th><th>Proposals</th><th>Self-report</th><th>Enter for</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="grid2" style="margin-top:12px">
        <div class="card"><h3>Students without a self-report</h3>
          <p class="hint">${noRecord.length ? noRecord.join(", ") : "Everyone has submitted ✓"}</p></div>
        <div class="card"><h3>Instructor submissions</h3>
          <p class="hint" style="line-height:2">${insRows || "No instructors yet."}</p></div>
      </div>`;
  }

  /* ════════ STUDENT ANALYSIS ════════ */
  /* one 4-bar comparison: this student · class best · class worst · class average.
     opts.unit — "%" appended to every value · opts.max — fixed axis top. */
  function barsSVG(caption, mine, vals, dir, opts) {
    const o = opts || {};
    const unit = o.unit || "";
    const best = vals.length ? (dir === "high" ? Math.max(...vals) : Math.min(...vals)) : null;
    const worst = vals.length ? (dir === "high" ? Math.min(...vals) : Math.max(...vals)) : null;
    const avg = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const bars = [
      { label: "This student", v: mine, color: "var(--accent)" },
      { label: "Class best", v: best, color: "var(--good)" },
      { label: "Class worst", v: worst, color: "var(--bad)" },
      { label: "Class average", v: avg, color: "var(--hf)" },
    ];
    const W = 640, H = 280, L = 44, R = 10, T = 26, B = 38;
    /* counts get whole-number gridlines; grades keep the honest 0-100 axis */
    const peak = Math.max(0, ...bars.map((b) => (b.v === null ? 0 : b.v)));
    const step = o.max ? o.max / 4 : Math.max(1, Math.ceil(peak / 4));
    const max = o.max || step * 4;
    const iw = (W - L - R) / bars.length;
    let grid = "", labels = "";
    for (let i = 0; i <= 4; i++) {
      const val = step * i;
      const y = H - B - ((H - T - B) * val) / max;
      grid += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" style="stroke:var(--line);stroke-width:${i === 0 ? 1.4 : 0.6}"/>` +
              `<text x="${L - 6}" y="${y + 3.5}" text-anchor="end" style="fill:var(--muted);font-size:10px">${esc(round1(val))}</text>`;
    }
    const rects = bars.map((b, i) => {
      const x = L + iw * i + iw * 0.18, w = iw * 0.64;
      const v = b.v === null ? 0 : b.v;
      const h = Math.max(b.v === null ? 0 : 2, ((H - T - B) * v) / max);
      const y = H - B - h;
      labels += `<text x="${x + w / 2}" y="${H - B + 15}" text-anchor="middle" style="fill:var(--muted);font-size:10.5px">${esc(b.label)}</text>` +
                `<text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" style="fill:var(--text);font-size:12px;font-weight:600">${
                  b.v === null ? "—" : esc(b.v + unit)}</text>`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" style="fill:${b.color}"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparison chart — ${esc(caption)}">
      <text x="${L}" y="14" style="fill:var(--muted);font-size:11px">${esc(caption)}</text>
      ${grid}${rects}${labels}</svg>`;
  }

  function fourBarSVG(s) {
    const m = METRICS.find((x) => x.id === A.metric) || METRICS[0];
    const vals = A.data.students.map((x) => m.fn(x._stats))
      .filter((v) => v !== null && v !== undefined && isFinite(v));
    return barsSVG(m.label + " — " + DIRWORD[m.dir], m.fn(s._stats), vals, m.dir, {});
  }

  /* ── per-evaluation comparison: the SAME checkride across the class ──
     one value per student = their LATEST graded attempt (WA.evalLatest). */
  function evalValues(id) {
    return A.data.students.map((x) => {
      const r = WA.evalLatest(x._evals, id);
      return { name: x.person.last_name, v: r ? r.grade : null };
    });
  }

  function evalCompare(s) {
    const id = A.evalSel;
    const all = evalValues(id);
    const vals = all.filter((x) => x.v !== null).map((x) => x.v);
    const mineRow = WA.evalLatest(s._evals, id);
    const mine = mineRow ? mineRow.grade : null;
    const chart = barsSVG(WA.evalLabel(id) + " — grade %, higher is better", mine, vals, "high",
                          { unit: "%", max: 100 });
    const listed = all.filter((x) => x.v !== null)
      .sort((a, b) => b.v - a.v)
      .map((x) => `${esc(x.name)} ${esc(x.v)}%`).join(" · ");
    return `
      ${chart}
      <p class="hint chk">Class values on <b>${esc(id)}</b>: ${listed || "nobody has flown it yet"}
        ${vals.length ? ` &mdash; best ${esc(Math.max(...vals))}%, worst ${esc(Math.min(...vals))}%,
        average ${esc(round1(vals.reduce((a, b) => a + b, 0) / vals.length))}%` : ""}
        (n = ${vals.length} of ${A.data.students.length} students).
        ${mine === null ? "<b>This student has no graded attempt on this evaluation.</b>" : ""}</p>`;
  }

  /* ── per-category plot: the category's evaluations in SYLLABUS order ──
     (never date order) with the class average as a faint reference. */
  function plotDef(cat) {
    if (cat === "fpc") {
      const n = A.data.students.reduce((m, x) => Math.max(m, x._fpc.length), 0);
      return {
        note: "An FPC has no position in the syllabus — entries are numbered in date order.",
        pts: Array.from({ length: n }, (_, k) => ({ key: k, label: "FPC #" + (k + 1), title: "FPC #" + (k + 1) })),
        val: (x, p) => (x._fpc[p.key] ? x._fpc[p.key].grade : null),
        row: (x, p) => (x._fpc[p.key] ? "fpc:" + x._fpc[p.key].i : null),
      };
    }
    return {
      note: "Shown in syllabus order — never in date order.",
      pts: WA.evalsOfCat(cat).map((d) => ({ key: d.id, label: d.id, title: WA.evalLabel(d.id) })),
      val: (x, p) => { const r = WA.evalLatest(x._evals, p.key); return r ? r.grade : null; },
      row: (x, p) => { const r = WA.evalLatest(x._evals, p.key); return r ? "ev:" + r.i : null; },
    };
  }

  function catPlotSVG(s) {
    const def = plotDef(A.plotCat);
    if (!def.pts.length)
      return `<p class="hint" style="padding:6px 2px">Nothing to plot in this category yet.</p>`;
    const mine = def.pts.map((p) => def.val(s, p));
    const cls = def.pts.map((p) => {
      const vs = A.data.students.map((x) => def.val(x, p)).filter((v) => v !== null);
      return vs.length ? round1(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
    });
    const seen = mine.concat(cls).filter((v) => v !== null);
    if (!seen.length)
      return `<p class="hint" style="padding:6px 2px">No grades reported in this category yet
        &mdash; the ${def.pts.length} position${def.pts.length === 1 ? "" : "s"} of the plot are still empty.</p>`;
    let lo = Math.min(...seen), hi = Math.max(...seen);
    if (hi - lo < 10) { const c = (hi + lo) / 2; lo = c - 5; hi = c + 5; }
    const pad = (hi - lo) * 0.18;
    lo = Math.max(0, Math.floor(lo - pad));
    hi = Math.min(100, Math.ceil(hi + pad));

    const W = 660, H = 230, L = 40, R = 14, T = 22, B = 46;
    const n = def.pts.length;
    const x = (i) => n === 1 ? (L + (W - L - R) / 2) : L + ((W - L - R) * i) / (n - 1);
    const y = (g) => H - B - ((H - T - B) * (g - lo)) / (hi - lo);

    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const val = lo + ((hi - lo) / 4) * i, yy = y(val);
      grid += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" style="stroke:var(--line);stroke-width:${i === 0 ? 1.4 : 0.6}"/>` +
              `<text x="${L - 6}" y="${yy + 3.5}" text-anchor="end" style="fill:var(--muted);font-size:10px">${esc(round1(val))}</text>`;
    }
    const segs = (vals, style) => {
      let out = "", run = [];
      vals.forEach((v, i) => {
        if (v === null) { if (run.length > 1) out += `<polyline points="${run.join(" ")}" style="${style}"/>`; run = []; }
        else run.push(x(i) + "," + y(v));
      });
      if (run.length > 1) out += `<polyline points="${run.join(" ")}" style="${style}"/>`;
      return out;
    };
    const clsLine = segs(cls, "fill:none;stroke:var(--muted);stroke-width:1.4;stroke-dasharray:5 4;opacity:.55");
    const clsDots = cls.map((v, i) => v === null ? "" :
      `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" style="fill:var(--muted);opacity:.55"/>`).join("");
    const myLine = segs(mine, "fill:none;stroke:var(--accent);stroke-width:2.4");
    const myDots = def.pts.map((p, i) => {
      const v = mine[i];
      const key = def.row(s, p);
      const xLab = `<text x="${x(i)}" y="${H - B + 15}" text-anchor="middle" style="fill:var(--muted);font-size:10px">${esc(p.label)}</text>`;
      if (v === null) {
        return xLab + `<text x="${x(i)}" y="${y(lo) - 4}" text-anchor="middle" style="fill:var(--muted);font-size:9px">not flown</text>`;
      }
      return xLab +
        `<circle cx="${x(i)}" cy="${y(v)}" r="4.4" style="fill:var(--accent)"/>` +
        `<text x="${x(i)}" y="${y(v) - 10}" text-anchor="middle" style="fill:var(--text);font-size:11px;font-weight:600">${esc(v)}</text>` +
        (key ? `<circle class="hit" cx="${x(i)}" cy="${y(v)}" r="13" data-pt="${esc(key)}"
                  style="fill:transparent;cursor:pointer"><title>${esc(p.title)} — ${esc(v)}%. Click to find it in the table below.</title></circle>` : "");
    }).join("");

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grades in ${esc(A.plotCat)}, syllabus order">
      ${grid}${clsLine}${clsDots}${myLine}${myDots}
      <text x="${L}" y="13" style="fill:var(--muted);font-size:10.5px">${esc(def.note)}</text>
      </svg>`;
  }

  /* ── the summary table every plot point points at ── */
  function evalSummary(s) {
    const rows = [];
    s._evals.slice().sort((a, b) => (a.order - b.order) || String(a.date).localeCompare(String(b.date)))
      .forEach((r) => rows.push({
        key: "ev:" + r.i, cat: r.cat,
        what: r.def ? `<b>${esc(r.id)}</b> ${esc(r.def.name)}` : `<span class="warn-t">(not identified — imported entry)</span>`,
        who: r.with, grade: r.grade, date: r.date, pending: r.pending, co: WA.isCO(r),
      }));
    s._fpc.forEach((r, k) => rows.push({
      key: "fpc:" + r.i, cat: "fpc",
      what: `<b>FPC #${k + 1}</b> ${esc(r.result || "flight progress check")}`,
      who: r.with, grade: r.grade, date: r.date, pending: r.pending, co: WA.isCO(r),
    }));
    if (!rows.length) return `<p class="hint">No evaluations or FPC entries reported yet.</p>`;
    return `
      <div class="tblwrap"><table class="tbl" id="sumtbl">
        <thead><tr><th>Evaluation</th><th>With whom</th><th>Grade</th><th>Date</th><th>Pending</th><th>Source</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr data-sumrow="${esc(r.key)}" class="${r.cat === A.plotCat ? "in-cat" : ""}${A.hi === r.key ? " is-hi" : ""}">
            <td>${r.what}</td><td>${esc(r.who || "—")}</td>
            <td class="num">${WA.pct(r.grade)}</td>
            <td>${esc(fmtD(r.date))}</td>
            <td>${r.pending ? `<span class="badge badge-warn">pending</span>` : "—"}</td>
            <td>${r.co ? `<span class="cotag" title="${esc(WA.CO_TIP)}">CO</span>` : `<span class="k">self</span>`}</td></tr>`).join("")}
        </tbody></table></div>`;
  }

  /* ── the dated-entry tables the CO asked to see in full ── */
  function evTable(head, rows) {
    if (!rows.length) return "";
    return `<div class="tblwrap" style="margin-bottom:10px"><table class="tbl">
      <thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody></table></div>`;
  }

  /* the last cell of every entry table: who put this row in the record */
  function srcCell(e) {
    return `<td>${WA.isCO(e)
      ? `<span class="cotag" title="${esc(WA.CO_TIP)}">CO</span>`
      : `<span class="k">self</span>`}</td>`;
  }

  function failTable(s, k) {
    const list = Array.isArray(s.record[k]) ? s.record[k] : [];
    if (!list.length) return `<p class="hint">No ${esc(WA.secLabel(k))} entries reported.</p>`;
    return evTable(["Date", "Track", "Flight", "Items", "Instructor", "Grade", "", "Source"],
      list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e) => `
        <tr><td>${esc(fmtD(e.date))}</td>
          <td>${esc(WA.itemCatLabel(e.category))}</td>
          <td title="${esc(WA.sortieLabel(e.category, e.flight_code))}">${esc(e.flight_code || "—")}</td>
          <td>${esc(WA.itemsLabel(e))}</td>
          <td>${esc(e.instructor || "—")}</td>
          <td class="num">${WA.pct(e.grade)}</td>
          <td>${e.pending ? `<span class="badge badge-warn">pending</span>` : ""}</td>
          ${srcCell(e)}</tr>`));
  }

  function airsickTable(s) {
    const list = Array.isArray(s.record.airsickness) ? s.record.airsickness : [];
    if (!list.length) return `<p class="hint">No airsickness reported.</p>`;
    return evTable(["Date", "With whom", "Phase of flight / note", "Source"],
      list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e) => `
        <tr><td>${esc(fmtD(e.date))}</td><td>${esc(e.instructor || "—")}</td>
          <td>${esc(e.phase || "—")}</td>${srcCell(e)}</tr>`));
  }

  function otherTables(s) {
    const r = s.record;
    const nfs = (r.nfs || []).map((e) =>
      `<tr><td>${esc(fmtD(e.date))}</td><td>${esc(e.note || "—")}</td>${srcCell(e)}</tr>`);
    const sms = (r.sms || []).map((e) =>
      `<tr><td>${esc(fmtD(e.entrance_date))}</td><td>${e.exit_date ? esc(fmtD(e.exit_date)) : `<span class="badge badge-warn">still open</span>`}</td>
        <td>${esc(e.note || "—")}</td>${srcCell(e)}</tr>`);
    const solo = (r.solo_flights || []).map((e) =>
      `<tr><td>${esc(fmtD(e.date))}</td>
        <td>${e.ng ? `<span class="badge">NG — non-graded</span>` : WA.pct(e.grade)}</td>
        <td>${esc(e.ng ? "—" : (e.instructor || "—"))}</td>${srcCell(e)}</tr>`);
    const chk = (k) => (r[k] || []).map((e) =>
      `<tr><td>${esc(fmtD(e.date))}</td><td>${esc(e.by || "—")}</td>
        <td>${esc(e.result || "—")}</td>
        <td class="num">${WA.pct(e.grade)}</td>
        <td>${e.pending ? `<span class="badge badge-warn">pending</span>` : ""}</td>${srcCell(e)}</tr>`);
    const blk = (k, head, rows) => `
      <h3 style="margin-top:8px">${esc(WA.secLabel(k))} ${WA.tipDot(k)}
        <span class="cnt">${rows.length} ${rows.length === 1 ? "entry" : "entries"}</span></h3>
      ${rows.length ? evTable(head, rows) : `<p class="hint">None reported.</p>`}`;
    return blk("nfs", ["Date", "Note", "Source"], nfs) +
           blk("sms", ["Entrance", "Exit", "Note", "Source"], sms) +
           blk("solo_flights", ["Date", "Grade", "Instructor", "Source"], solo) +
           blk("fpc", ["Date", "By", "Result", "Grade", "", "Source"], chk("fpc")) +
           blk("cef", ["Date", "By", "Result", "Grade", "", "Source"], chk("cef"));
  }

  function branchBoxes(s, forBrief) {
    const total = s.proposals.length;
    const flew = s.proposals.filter((p) => p.flew_with).length;
    const flewPct = total ? Math.round((flew / total) * 100) : 0;
    return BR.map((b) => {
      const ag = s.aggregates[b.id];
      const firsts = (ag.by_rank["1"] || []).length;
      const politeA = ag.not_this_branch.map((n) =>
        `<li>${esc(n)} has not recommended ${esc(b.label)} for this student</li>`).join("");
      const politeB = s.not_submitted.map((n) =>
        `<li>${esc(n)} has not submitted a recommendation for this student yet</li>`).join("");
      let names;
      if (forBrief) {
        names = [1, 2, 3].map((r) => {
          const list = ag.by_rank[String(r)] || [];
          return `<div>${esc(RW[r])}: ${list.length
            ? (r === 1 ? "<b>" + esc(list.join(", ")) + "</b>" : esc(list.join(", ")))
            : "<span class='none' style='color:var(--muted)'>—</span>"}</div>`;
        }).join("");
      } else {
        const list = ag.by_rank[String(A.rankSel)] || [];
        names = list.length
          ? `<div class="names">${esc(list.join(", "))}</div>`
          : `<div class="names none">No instructor gave ${esc(b.label)} as ${esc(RW[A.rankSel])} choice.</div>`;
      }
      return `
        <div class="branchbox">
          <h4>${esc(b.label)} <span class="score" title="weighted score — formula 3×1st + 2×2nd + 1×3rd">Σ ${esc(ag.weighted)}</span></h4>
          ${names}
          <div class="stats">weighted <b>${esc(ag.weighted)}</b> (3×1st + 2×2nd + 1×3rd) ·
            ${firsts} first-choice ${firsts === 1 ? "vote" : "votes"} ·
            ${total ? flewPct + "% of proposers flew with them" : "no proposers yet"}</div>
          ${forBrief ? "" : `<ul class="polite">${politeA}${politeB}</ul>`}
        </div>`;
    }).join("");
  }

  function htmlAnalysis() {
    const students = A.data.students;
    if (!students.length) return `<div class="card"><p class="hint">No active students yet — add them under People &amp; links.</p></div>`;
    const s = students[A.sel];
    const st = s._stats;
    const pend = WA.pendingItems(s.record);
    const chips = METRICS.map((m) =>
      `<button type="button" class="chip${m.id === A.metric ? " is-on" : ""}" data-metric="${esc(m.id)}"
        title="${esc((m.tip ? m.tip + " " : "") + "(" + DIRWORD[m.dir] + ")")}">${esc(m.label)}</button>`).join("");
    const rsel = [1, 2, 3].map((r) =>
      `<button type="button" class="chip${A.rankSel === r ? " is-on" : ""}" data-ranksel="${r}">${esc(RW[r])} choice</button>`).join("");
    const drill = s.proposals.length ? `
      <details class="drill"><summary>Drill-down — every proposal for this student (${s.proposals.length})</summary>
        <div class="tblwrap" style="margin-top:8px"><table class="tbl">
          <thead><tr><th>Instructor</th><th>Duty</th><th>Leadership</th><th>Status</th>
            <th>Fighters</th><th>Helicopters</th><th>Transport–FF</th><th>Flew with</th><th>Comment</th>
            <th>Source</th></tr></thead>
          <tbody>${s.proposals.map((p) => `
            <tr><td><b>${esc((p.rank ? p.rank + " " : "") + p.last_name)}</b></td>
              <td>${esc(p.duty || "—")}</td><td>${esc(p.leadership || "—")}</td><td>${esc(p.status || "—")}</td>
              <td>${esc(p.ranks.fighters ? RW[p.ranks.fighters] : "—")}</td>
              <td>${esc(p.ranks.helicopters ? RW[p.ranks.helicopters] : "—")}</td>
              <td>${esc(p.ranks.transport_ff ? RW[p.ranks.transport_ff] : "—")}</td>
              <td>${p.flew_with ? "✓" : "—"}</td><td>${esc(p.comment || "")}</td>
              ${srcCell(p)}</tr>`).join("")}
          </tbody></table></div></details>` : "";

    const evOpts = WA.EVALUATIONS.map((d) =>
      `<option value="${esc(d.id)}"${A.evalSel === d.id ? " selected" : ""}>${esc(WA.evalLabel(d.id))}</option>`).join("");
    const catChips = WA.EVAL_CATS.map((c) =>
      `<button type="button" class="chip${A.plotCat === c.id ? " is-on" : ""}" data-plotcat="${esc(c.id)}"
        ${c.id === "fpc" ? `title="${esc(WA.secTip("fpc"))}"` : ""}>${esc(c.label)}</button>`).join("");

    return `
      <div class="ana-nav">
        <button type="button" class="btn arrowbtn" data-nav="-1" title="Previous student (←)">&#8592;</button>
        <span class="pos">${A.sel + 1} / ${students.length}</span>
        <span class="nm">${esc(WA.personName(s.person, true))}</span>
        <button type="button" class="btn arrowbtn" data-nav="1" title="Next student (→)">&#8594;</button>
      </div>
      <div class="card">
        <div class="idhead">
          <span class="nm">${esc(WA.personName(s.person, true))}</span>
          <span class="meta">${esc([s.person.mn ? "MN " + s.person.mn : "", s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}</span>
          <span class="lastupd">Self-report: <b>${s.completion.has_record ? esc(fmtDT(s.last_update)) : "not submitted"}</b></span>
          ${st.pending ? `<span class="badge badge-warn">${st.pending} pending item${st.pending === 1 ? "" : "s"}</span>` : ""}
          ${st.legacy ? `<span class="badge badge-bad">${st.legacy} imported entr${st.legacy === 1 ? "y" : "ies"} incomplete</span>` : ""}
          ${s._src.any ? `<span class="badge badge-acc" title="${esc(s._src.tip)}">${
            s._src.all ? (s._src.total ? "record entered by CO" : "record opened by CO")
                       : s._src.n + " entr" + (s._src.n === 1 ? "y" : "ies") + " entered by CO"}</span>` : ""}
          <button type="button" class="btn btn-sm" data-editrec="${esc(s.person.id)}"
            title="Open this student's form and enter data on their behalf — every entry is tagged 'entered by CO'"
            >&#9998; Edit record</button>
        </div>
        ${pend.length ? `<ul class="pendlist">${pend.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="card">
        <h2>Comparison vs class</h2>
        <p class="hint">Click a metric — the chart shows this student against the class best, worst and average.
          Every count is derived from the student's dated entries.</p>
        <div class="chiprow" style="margin:10px 0">${chips}</div>
        <div class="chartbox">${fourBarSVG(s)}</div>
      </div>
      <div class="card">
        <h2>Evaluations ${WA.tipDot("evaluations")}</h2>
        <p class="hint">Evaluations are separate events, so they are compared <b>one checkride at a time</b> —
          never as an average, and never as a count. A re-flown checkride counts with its latest graded attempt.</p>
        <div class="toolrow" style="margin:10px 0 8px">
          <label class="f" style="max-width:340px"><span>Compare on this evaluation</span>
            <select id="evalsel">${evOpts}</select></label>
        </div>
        <div class="chartbox">${evalCompare(s)}</div>

        <h3 style="margin-top:16px">Grades per category</h3>
        <p class="hint">The category's evaluations in syllabus order, with the class average as the faint
          dashed reference. Click a point to find it in the table below.</p>
        <div class="chiprow" style="margin:10px 0">${catChips}</div>
        <div class="chartbox" id="catplot">${catPlotSVG(s)}</div>
        <div class="legendrow">
          <span><i style="background:var(--accent)"></i>this student</span>
          <span><i style="background:var(--muted)"></i>class average on the same evaluation</span>
        </div>

        <h3 style="margin-top:16px">Summary — every evaluation and FPC of this student</h3>
        ${evalSummary(s)}
      </div>
      <div class="card">
        <h2>FAIL &amp; ALMOST GOOD</h2>
        <h3>${esc(WA.secLabel("fail"))} ${WA.tipDot("fail")}
          <span class="cnt">${st.fail} ${st.fail === 1 ? "entry" : "entries"}</span></h3>
        ${failTable(s, "fail")}
        <h3 style="margin-top:10px">${esc(WA.secLabel("almost_good"))} ${WA.tipDot("almost_good")}
          <span class="cnt">${st.almost_good} ${st.almost_good === 1 ? "entry" : "entries"}</span></h3>
        ${failTable(s, "almost_good")}
      </div>
      <div class="card">
        <h2>Airsickness ${WA.tipDot("airsickness")}
          <span class="cnt">${st.airsickness} ${st.airsickness === 1 ? "entry" : "entries"}</span></h2>
        <p class="hint">When each incident happened and with whom.</p>
        ${airsickTable(s)}
      </div>
      <div class="card">
        <h2>Other dated entries</h2>
        ${otherTables(s)}
      </div>
      <div class="card">
        <h2>Proposals</h2>
        <p class="hint">The position selector applies to all three branch boxes simultaneously.</p>
        <div class="chiprow" style="margin:10px 0">${rsel}</div>
        <div class="grid3">${branchBoxes(s, false)}</div>
        ${drill}
      </div>`;
  }

  /* ════════ BRIEF MODE ════════ */
  function htmlBrief() {
    const students = A.data.students;
    if (!students.length) return `<div class="card"><p class="hint">No active students yet.</p></div>`;
    const s = students[A.sel];
    const st = s._stats;
    return `
      <div class="brief">
        <div class="brief-nav">
          <button type="button" class="btn arrowbtn" data-nav="-1" title="Previous student (←)">&#8592;</button>
          <span class="pos">${A.sel + 1} / ${students.length}</span>
          <button type="button" class="btn arrowbtn" data-nav="1" title="Next student (→)">&#8594;</button>
          <span class="spacer"></span>
          <button type="button" class="btn btn-sm" data-act="print">&#128424; Print brief</button>
        </div>
        <div class="b-name">${esc(WA.personName(s.person, true))}</div>
        <div class="b-meta">${esc([s.person.mn ? "MN " + s.person.mn : "", s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}
          ${st.pending ? ` · <span style="color:var(--warn)">${st.pending} pending</span>` : ""}
          ${s._src.any ? ` · ${WA.coRecordTag(s._src)} ${esc(s._src.all
            ? "record entered by the CO"
            : s._src.n + (s._src.n === 1 ? " entry" : " entries") + " entered by the CO")}` : ""}</div>
        <div class="card"><div class="kgrid">
          <span><span class="k">Solos</span> <b>${st.solos}</b></span>
          <span><span class="k">NFS</span> <b>${st.nfs}</b></span>
          <span><span class="k">SMS</span> <b>${st.sms}</b></span>
          <span><span class="k">FAIL</span> <b>${st.fail}</b></span>
          <span><span class="k">ALMOST GOOD</span> <b>${st.almost_good}</b></span>
          <span><span class="k">Airsickness</span> <b>${st.airsickness}</b></span>
          <span title="${esc(WA.secTip("fpc"))}"><span class="k">FPC</span> <b>${st.fpc}</b></span>
          <span title="${esc(WA.secTip("cef"))}"><span class="k">CEF</span> <b>${st.cef}</b></span>
        </div></div>
        <div class="card b-detail">
          <div class="kline"><span class="k">Evaluations</span>
            ${s._evals.length ? s._evals.slice().sort((a, b) => a.order - b.order).map((e) =>
              `<b>${esc(WA.evalShort(e.id))}</b> ${WA.pct(e.grade)}${
                e.with ? " <span class='k'>w/ " + esc(e.with) + "</span>" : ""}${e.pending ? " ⏳" : ""}${WA.coTag(e)}`).join(" · ")
              : "<span class='k'>none reported</span>"}</div>
          <div class="kline"><span class="k">Solo flights</span>
            ${st.solos ? (s.record.solo_flights || []).map((e) =>
              esc(fmtD(e.date)) + (e.ng ? " <span class='k'>NG</span>" : " <b>" + WA.pct(e.grade) + "</b>") +
              WA.coTag(e)).join(" · ")
              : "<span class='k'>none reported</span>"}</div>
          ${["fail", "almost_good"].map((k) => {
            const list = s.record[k] || [];
            /* one sub-line per entry: the items inside an entry are already
               separated by · , so entries must not be */
            return `<div class="kline"><span class="k">${esc(WA.secLabel(k))}</span>
              ${list.length ? list.map((e) => `<div class="sub">${esc(fmtD(e.date))}` +
                (e.flight_code ? " <b>" + esc(e.flight_code) + "</b>" : "") + " " + esc(WA.itemsLabel(e)) +
                (e.grade === null || e.grade === undefined ? "" : " <b>" + WA.pct(e.grade) + "</b>") +
                (e.instructor ? " <span class='k'>w/ " + esc(e.instructor) + "</span>" : "") +
                (e.pending ? " ⏳" : "") + WA.coTag(e) + `</div>`).join("")
                : "<span class='k'>none reported</span>"}</div>`;
          }).join("")}
          <div class="kline"><span class="k">Airsickness</span>
            ${(s.record.airsickness || []).length ? (s.record.airsickness || []).map((e) =>
              esc(fmtD(e.date)) + (e.instructor ? " <span class='k'>w/ " + esc(e.instructor) + "</span>" : "") +
              (e.phase ? " (" + esc(e.phase) + ")" : "") + WA.coTag(e)).join(" · ")
              : "<span class='k'>none reported</span>"}</div>
        </div>
        <div class="grid3">${branchBoxes(s, true)}</div>
      </div>`;
  }

  /* ════════ PRINT (page per student + class summary) ════════ */
  function buildPrint() {
    const holder = $("print-brief");
    if (!holder || !A.data) return;
    const students = A.data.students;
    const pages = students.map((s) => {
      const st = s._stats;
      const branchRows = BR.map((b) => {
        const ag = s.aggregates[b.id];
        return `<tr><td><b>${esc(b.label)}</b></td>
          <td>${esc((ag.by_rank["1"] || []).join(", ") || "—")}</td>
          <td>${esc((ag.by_rank["2"] || []).join(", ") || "—")}</td>
          <td>${esc((ag.by_rank["3"] || []).join(", ") || "—")}</td>
          <td>${esc(ag.weighted)}</td></tr>`;
      }).join("");
      const politeAll = BR.map((b) => s.aggregates[b.id].not_this_branch.map((n) =>
        `<li>${esc(n)} has not recommended ${esc(b.label)} for this student</li>`).join("")).join("") +
        s.not_submitted.map((n) => `<li>${esc(n)} has not submitted a recommendation for this student yet</li>`).join("");
      const comments = s.proposals.filter((p) => p.comment).map((p) =>
        `<li><b>${esc((p.rank ? p.rank + " " : "") + p.last_name)}:</b> ${esc(p.comment)}</li>`).join("");
      const prT = (head, rows) => rows.length
        ? `<table class="pr-t"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
           <tbody>${rows.join("")}</tbody></table>`
        : `<p class="pr-none">None reported.</p>`;
      /* the CO tag rides in the first cell of every printed row — small, and
         it costs the table no extra column (round-4 W2c) */
      const evRows = s._evals.slice().sort((a, b) => a.order - b.order).map((e) =>
        `<tr><td>${esc(e.def ? e.id + " — " + e.def.name : "(not identified)")}${WA.coTag(e)}</td>
          <td>${esc(e.with || "—")}</td><td>${WA.pct(e.grade)}</td>
          <td>${esc(fmtD(e.date))}</td><td>${e.pending ? "pending" : ""}</td></tr>`);
      const fgRows = (k) => (s.record[k] || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td><td>${esc(WA.itemCatLabel(e.category))}</td>
          <td>${esc(e.flight_code || "—")}</td><td>${esc(WA.itemsLabel(e))}</td>
          <td>${esc(e.instructor || "—")}</td>
          <td>${WA.pct(e.grade)}</td>
          <td>${e.pending ? "pending" : ""}</td></tr>`);
      const asRows = (s.record.airsickness || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td><td>${esc(e.instructor || "—")}</td><td>${esc(e.phase || "—")}</td></tr>`);
      const soRows = (s.record.solo_flights || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td><td>${e.ng ? "NG (non-graded)" : WA.pct(e.grade)}</td>
          <td>${esc(e.ng ? "—" : (e.instructor || "—"))}</td></tr>`);
      const ckRows = (k) => (s.record[k] || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td><td>${esc(e.by || "—")}</td><td>${esc(e.result || "—")}</td>
          <td>${WA.pct(e.grade)}</td>
          <td>${e.pending ? "pending" : ""}</td></tr>`);
      const nfsRows = (s.record.nfs || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td><td>${esc(e.note || "—")}</td></tr>`);
      const smsRows = (s.record.sms || []).map((e) =>
        `<tr><td>${esc(fmtD(e.entrance_date))}${WA.coTag(e)}</td><td>${e.exit_date ? esc(fmtD(e.exit_date)) : "still open"}</td>
          <td>${esc(e.note || "—")}</td></tr>`);
      return `
        <div class="pr-page">
          <div class="pr-brand"><img src="assets/364mea-240.png" alt=""><span>Wings Ahead</span>
            <span class="pr-brand-sub">364 MEA — student utilization</span></div>
          <h2>${esc(WA.personName(s.person, true))}</h2>
          <div class="pr-meta">${esc([s.person.mn ? "MN " + s.person.mn : "", s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}
            · ${s._src.all ? "record ENTERED BY THE CO"
              : "self-report" + (s._src.some
                ? " (+" + s._src.n + " entered by the CO)" : "")}
            ${s.completion.has_record ? "updated " + esc(fmtDT(s.last_update)) : "NOT submitted"}
            · proposals in: ${s.completion.proposals_in}/${s.completion.instructors_total}</div>
          <div class="pr-sec">Reported record — counts derived from the dated entries</div>
          <table class="pr-t"><thead><tr><th>Solos</th><th>NFS</th>
            <th>SMS</th><th>FAIL</th><th>Almost Good</th><th>Airsick</th><th>FPC</th><th>CEF</th><th>Pending</th></tr></thead>
            <tbody><tr>
              <td>${st.solos}</td><td>${st.nfs}</td><td>${st.sms}</td><td>${st.fail}</td>
              <td>${st.almost_good}</td><td>${st.airsickness}</td><td>${st.fpc}</td>
              <td>${st.cef}</td><td>${st.pending}</td></tr></tbody></table>
          <div class="pr-sec">Evaluations (syllabus order)</div>
          ${prT(["Evaluation", "With whom", "Grade", "Date", ""], evRows)}
          <div class="pr-sec">FAIL</div>
          ${prT(["Date", "Track", "Flight", "Items", "Instructor", "Grade", ""], fgRows("fail"))}
          <div class="pr-sec">ALMOST GOOD</div>
          ${prT(["Date", "Track", "Flight", "Items", "Instructor", "Grade", ""], fgRows("almost_good"))}
          <div class="pr-sec">Airsickness — when and with whom</div>
          ${prT(["Date", "With whom", "Phase of flight / note"], asRows)}
          <div class="pr-sec">Solo flights</div>
          ${prT(["Date", "Grade", "Instructor"], soRows)}
          <div class="pr-sec">NFS</div>
          ${prT(["Date", "Note"], nfsRows)}
          <div class="pr-sec">SMS</div>
          ${prT(["Entrance", "Exit", "Note"], smsRows)}
          <div class="pr-sec">FPC — Δοκιμή Προόδου (flight progress check)</div>
          ${prT(["Date", "By", "Result", "Grade", ""], ckRows("fpc"))}
          <div class="pr-sec">CEF — Εξέταση Καταλληλότητας (Squadron Evaluator)</div>
          ${prT(["Date", "By", "Result", "Grade", ""], ckRows("cef"))}
          <div class="pr-sec">Utilization proposals (weighted 3×1st + 2×2nd + 1×3rd)</div>
          <table class="pr-t"><thead><tr><th>Branch</th><th>1st choice</th><th>2nd choice</th><th>3rd choice</th><th>Σ</th></tr></thead>
            <tbody>${branchRows}</tbody></table>
          ${comments ? `<div class="pr-sec">Instructor comments</div><ul class="pr-bullets">${comments}</ul>` : ""}
          ${politeAll ? `<div class="pr-sec">Outstanding</div><ul class="pr-bullets">${politeAll}</ul>` : ""}
        </div>`;
    }).join("");

    /* class summary ranking table(s) */
    const classes = {};
    for (const s of students) {
      const k = s.person.class || "—";
      (classes[k] = classes[k] || []).push(s);
    }
    const summary = Object.keys(classes).sort().map((cls) => {
      const list = classes[cls].slice().sort((a, b) => {
        const tw = (x) => BR.reduce((acc, br) => acc + x.aggregates[br.id].weighted, 0);
        return tw(b) - tw(a);
      });
      return `
        <div class="pr-sec">Class ${esc(cls)} — summary ranking (weighted 3/2/1 per branch)</div>
        <p class="pr-src">Records: ${esc(sourceLine(list))}
          — &ldquo;CO&rdquo; marks a record the squadron CO entered in full,
          &ldquo;+N CO&rdquo; a self-reported record he added N entries to.</p>
        <table class="pr-t"><thead><tr><th>#</th><th>Student</th>
          <th>Fighters Σ</th><th>Helicopters Σ</th><th>Transport–FF Σ</th>
          <th>1st-choice votes</th><th>Proposals in</th><th>FAIL</th><th>A.Good</th><th>FPC</th><th>CEF</th></tr></thead><tbody>
          ${list.map((s, i) => {
            const firsts = BR.reduce((acc, b) => acc + (s.aggregates[b.id].by_rank["1"] || []).length, 0);
            return `<tr><td>${i + 1}</td><td><b>${esc(WA.personName(s.person, true))}</b>${
                WA.coRecordTag(s._src)}</td>
              <td>${esc(s.aggregates.fighters.weighted)}</td>
              <td>${esc(s.aggregates.helicopters.weighted)}</td>
              <td>${esc(s.aggregates.transport_ff.weighted)}</td>
              <td>${firsts}</td>
              <td>${s.completion.proposals_in}/${s.completion.instructors_total}</td>
              <td>${s._stats.fail}</td><td>${s._stats.almost_good}</td>
              <td>${s._stats.fpc}</td><td>${s._stats.cef}</td></tr>`;
          }).join("")}</tbody></table>`;
    }).join("");

    /* one row per student per evaluation — the same-checkride comparison on paper */
    const evalMatrix = `
      <div class="pr-sec">Evaluations — every student on the same checkride (latest graded attempt)</div>
      <table class="pr-t"><thead><tr><th>Student</th>
        ${WA.EVALUATIONS.map((d) => `<th>${esc(d.id)}</th>`).join("")}</tr></thead><tbody>
        ${students.map((s) => `<tr><td><b>${esc(WA.personName(s.person, true))}</b></td>
          ${WA.EVALUATIONS.map((d) => {
            const r = WA.evalLatest(s._evals, d.id);
            return `<td>${WA.pct(r ? r.grade : null)}${r ? WA.coTag(r) : ""}</td>`;
          }).join("")}</tr>`).join("")}
        <tr><td><b>Class average</b></td>
          ${WA.EVALUATIONS.map((d) => {
            const vs = students.map((s) => { const r = WA.evalLatest(s._evals, d.id); return r ? r.grade : null; })
              .filter((v) => v !== null);
            return `<td>${vs.length ? esc(round1(vs.reduce((a, b) => a + b, 0) / vs.length)) + "%" : "—"}</td>`;
          }).join("")}</tr>
      </tbody></table>`;

    holder.innerHTML = pages + `<div class="pr-page">
      <div class="pr-brand"><img src="assets/364mea-240.png" alt=""><span>Wings Ahead</span>
        <span class="pr-brand-sub">364 MEA — student utilization</span></div>
      <h2>Class summary</h2>
      <div class="pr-meta">Generated ${esc(fmtDT(A.data.generated_at))}
        · all classes: ${esc(sourceLine(students))}</div>${summary}${evalMatrix}</div>`;
  }

  /* ════════ PEOPLE & LINKS ════════ */
  function linkFor(tok) {
    return location.origin + location.pathname + "#t=" + tok;
  }

  function peopleRows(list, kind) {
    if (!list.length) return `<tr><td colspan="5" class="hint">None yet.</td></tr>`;
    return list.map((p) => {
      const extra = kind === "student"
        ? [p.mn ? "MN " + p.mn : "", p.class ? "Class " + p.class : ""].filter(Boolean).join(" · ")
        : [p.duty, p.leadership, p.status].filter(Boolean).join(" · ");
      return `
        <tr>
          <td><b>${esc(WA.personName(p, true))}</b></td>
          <td>${esc(extra || "—")}</td>
          <td>${p.active ? `<span class="badge badge-good">active</span>` : `<span class="badge badge-bad">revoked</span>`}</td>
          <td class="linkcell">…${esc(String(p.token).slice(-8))}</td>
          <td style="white-space:nowrap">
            <button type="button" class="btn btn-sm" data-copy="${esc(p.token)}" title="Copy this person's private link">Copy link</button>
            <button type="button" class="btn btn-sm" data-edit="${esc(p.id)}">Edit</button>
            ${kind === "instructor" && p.active
              ? `<button type="button" class="btn btn-sm" data-editprop="${esc(p.id)}"
                   title="Open this instructor's recommendation form and fill it in on their behalf — every proposal is tagged 'entered by CO'"
                   >&#9998; Enter proposals as…</button>` : ""}
            ${kind === "student" && p.active
              ? `<button type="button" class="btn btn-sm" data-editrec="${esc(p.id)}"
                   title="Open this student's form and enter data on their behalf — every entry is tagged 'entered by CO'"
                   >&#9998; Edit record</button>` : ""}
            <button type="button" class="btn btn-sm" data-regen="${esc(p.id)}" title="New token — the old link stops working">Regenerate</button>
            ${p.role === "admin" ? "" : (p.active
              ? `<button type="button" class="btn btn-sm btn-danger" data-revoke="${esc(p.id)}" title="Deactivate the link">Revoke</button>`
              : `<button type="button" class="btn btn-sm" data-activate="${esc(p.id)}">Re-activate</button>`)}
            ${p.role === "admin" ? "" : `<button type="button" class="btn btn-sm btn-danger" data-del="${esc(p.id)}">Delete</button>`}
          </td>
        </tr>`;
    }).join("");
  }

  function htmlPeople() {
    const ppl = A.people || [];
    const stu = ppl.filter((p) => p.role === "student");
    const ins = ppl.filter((p) => p.role === "instructor");
    const adm = ppl.filter((p) => p.role === "admin");
    return `
      <div class="toolrow">
        <span class="hint">Personal links only — whoever holds a link IS that person. Distribute privately
          (Viber/mail). If a link leaks: <b>Regenerate</b> and resend.</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm btn-primary" data-act="add-student">+ Add student</button>
        <button type="button" class="btn btn-sm" data-act="add-instructor">+ Add instructor</button>
      </div>
      <div class="card"><h3>Students (${stu.length})</h3>
        <div class="tblwrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Details</th><th>Status</th><th>Token</th><th>Actions</th></tr></thead>
          <tbody>${peopleRows(stu, "student")}</tbody></table></div></div>
      <div class="card"><h3>Instructors (${ins.length})</h3>
        <div class="tblwrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Duty · Leadership · Status</th><th>Status</th><th>Token</th><th>Actions</th></tr></thead>
          <tbody>${peopleRows(ins, "instructor")}</tbody></table></div></div>
      <div class="card"><h3>Admin</h3>
        <div class="tblwrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Details</th><th>Status</th><th>Token</th><th>Actions</th></tr></thead>
          <tbody>${peopleRows(adm, "admin")}</tbody></table></div></div>`;
  }

  /* person editor modal */
  function openPersonModal(role, person) {
    const p = person || {};
    const isStu = role === "student";
    const sel = (id, label, opts, cur) => `
      <label class="f"><span>${esc(label)}</span><select id="${esc(id)}">
        <option value="">—</option>
        ${opts.map((o) => `<option value="${esc(o)}"${cur === o ? " selected" : ""}>${esc(o)}</option>`).join("")}
      </select></label>`;
    $("adm-modal").innerHTML = `
      <h3>${person ? "Edit" : "Add"} ${esc(role)}</h3>
      <div class="fgrid">
        <label class="f"><span>Rank</span><input type="text" id="pm-rank" value="${esc(p.rank || "")}" placeholder="e.g. ${isStu ? "Cdt" : "Maj"}"></label>
        <label class="f"><span>Military Number</span><input type="text" id="pm-mn" value="${esc(p.mn || "")}"></label>
        <label class="f"><span>Last name *</span><input type="text" id="pm-last" value="${esc(p.last_name || "")}"></label>
        <label class="f"><span>First name</span><input type="text" id="pm-first" value="${esc(p.first_name || "")}"></label>
        ${isStu
          ? `<label class="f"><span>Class</span><input type="text" id="pm-class" value="${esc(p.class || "")}" placeholder="e.g. 2026B"></label>`
          : sel("pm-duty", "Duty", ["Squadron Commander", "DO", "Flight Commander", "Evaluator", "Instructor"], p.duty) +
            sel("pm-leadership", "Leadership", ["Wingman", "2-ship", "4-ship", "Mission Commander"], p.leadership) +
            sel("pm-status", "Status", ["Assigned", "Attached", "Departed"], p.status)}
      </div>
      <div class="mfoot">
        <button type="button" class="btn" data-act="modal-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-act="modal-save"
          data-role="${esc(role)}" data-id="${esc(p.id || "")}">${person ? "Save" : "Create"}</button>
      </div>`;
    $("adm-veil").classList.remove("hidden");
    $("pm-last").focus();
  }

  async function savePersonModal(btn) {
    const role = btn.dataset.role, id = btn.dataset.id || null;
    const val = (i) => { const el = $(i); return el ? el.value.trim() : ""; };
    const payload = {
      rank: val("pm-rank"), mn: val("pm-mn"),
      last_name: val("pm-last"), first_name: val("pm-first"),
    };
    if (!payload.last_name) { toast("Last name is required", true); return; }
    if (role === "student") payload.class = val("pm-class");
    else {
      payload.duty = val("pm-duty");
      payload.leadership = val("pm-leadership");
      payload.status = val("pm-status");
    }
    if (!id) payload.role = role;
    btn.disabled = true;
    try {
      const saved = await rpc("admin_save_person", { p_token: WA.token, p_id: id, p: payload });
      $("adm-veil").classList.add("hidden");
      toast((id ? "Saved: " : "Created: ") + WA.personName(saved, true) +
            (id ? "" : " — use Copy link to share"));
      await load(false);
      A.tab = "people";
      render();
    } catch (e) {
      toast("Save failed: " + e.message, true);
    }
    btn.disabled = false;
  }

  /* ════════ exports ════════ */
  function download(name, mime, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function csv(rows) {
    const cell = (v) => {
      const s = String(v === null || v === undefined ? "" : v);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  }
  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /* NOTE (round-4 W3c): no "Evals" column — the count converges to eight for
     everyone and ranks nobody; the per-evaluation grade columns below are the
     comparison. "Record entered by" says whether the CO filled it in. */
  function exportSummaryCSV() {
    const rows = [["MN", "Rank", "Last name", "First name", "Class",
      "Solos", "NFS", "SMS", "FAIL", "Almost Good", "Airsickness",
      "FPC", "CEF", "Pending items", "Incomplete imported entries",
      "Record entered by", "CO-entered entries"]
      .concat(WA.EVALUATIONS.map((d) => d.id))
      .concat(["W Fighters", "W Helicopters", "W Transport-FF",
        "1st F", "1st H", "1st T-FF", "Proposals in", "Instructors total", "Self-report updated"])];
    for (const s of A.data.students) {
      const st = s._stats, ag = s.aggregates;
      rows.push([s.person.mn, s.person.rank, s.person.last_name, s.person.first_name, s.person.class,
        st.solos, st.nfs, st.sms, st.fail,
        st.almost_good, st.airsickness, st.fpc, st.cef, st.pending, st.legacy,
        /* "CO" = every entry is the CO's · "self" = the owner's record, and
           the next column says how many entries of it the CO added */
        s.completion.has_record || s._src.any ? s._src.word : "", s._src.n]
        .concat(WA.EVALUATIONS.map((d) => {
          const r = WA.evalLatest(s._evals, d.id);
          return r && r.grade !== null ? r.grade : "";
        }))
        .concat([ag.fighters.weighted, ag.helicopters.weighted, ag.transport_ff.weighted,
          (ag.fighters.by_rank["1"] || []).length, (ag.helicopters.by_rank["1"] || []).length,
          (ag.transport_ff.by_rank["1"] || []).length,
          s.completion.proposals_in, s.completion.instructors_total,
          s.completion.has_record ? fmtDT(s.last_update) : "not submitted"]));
    }
    download("wings-ahead-summary-" + stamp() + ".csv", "text/csv;charset=utf-8", csv(rows));
  }

  /* every dated entry of every student, one row each — the raw record on paper */
  function exportEntriesCSV() {
    const rows = [["Student", "Class", "Section", "Date", "Detail", "Flight code",
      "Items", "With whom", "Grade", "Pending", "Incomplete import", "Entered by"]];
    const add = (s, sec, e, detail, code, items, who, grade, pend, date) =>
      rows.push([WA.personName(s.person, true), s.person.class, WA.secLabel(sec),
        fmtD(date === undefined ? e.date : date), detail, code || "", items || "", who || "",
        grade === null || grade === undefined ? "" : grade, pend ? "yes" : "",
        e.legacy ? "yes" : "", WA.coWord(e)]);
    for (const s of A.data.students) {
      const r = s.record;
      (r.nfs || []).forEach((e) => add(s, "nfs", e, e.note || "", "", "", "", null, false));
      (r.sms || []).forEach((e) => add(s, "sms", e,
        e.exit_date ? "exit " + fmtD(e.exit_date) : "still open", "", "", "", null, false, e.entrance_date));
      (r.airsickness || []).forEach((e) => add(s, "airsickness", e, e.phase || "", "", "", e.instructor, null, false));
      for (const k of ["fail", "almost_good"]) {
        (r[k] || []).forEach((e) => add(s, k, e, WA.itemCatLabel(e.category),
          e.flight_code, (e.items || []).join(" | "), e.instructor, e.grade, e.pending));
      }
      (r.evaluations || []).forEach((e) => add(s, "evaluations", e,
        e.evaluation ? WA.evalLabel(e.evaluation) : "(not identified)", e.evaluation, "",
        e.with, e.grade, e.pending));
      (r.solo_flights || []).forEach((e) => add(s, "solo_flights", e,
        e.ng ? "NG (non-graded)" : "graded", "", "", e.instructor, e.grade, false));
      for (const k of ["fpc", "cef"]) {
        (r[k] || []).forEach((e) => add(s, k, e, e.result || "", "", "", e.by, e.grade, e.pending));
      }
    }
    download("wings-ahead-entries-" + stamp() + ".csv", "text/csv;charset=utf-8", csv(rows));
  }

  function exportProposalsCSV() {
    const rows = [["Student", "Class", "Instructor", "Duty", "Leadership", "Status",
      "Fighters", "Helicopters", "Transport-FF", "Flew with", "Comment", "Updated", "Entered by"]];
    for (const s of A.data.students) for (const p of s.proposals) {
      rows.push([WA.personName(s.person, true), s.person.class,
        (p.rank ? p.rank + " " : "") + p.last_name, p.duty, p.leadership, p.status,
        p.ranks.fighters ? RW[p.ranks.fighters] : "", p.ranks.helicopters ? RW[p.ranks.helicopters] : "",
        p.ranks.transport_ff ? RW[p.ranks.transport_ff] : "",
        p.flew_with ? "yes" : "no", p.comment || "", fmtDT(p.updated_at), WA.coWord(p)]);
    }
    download("wings-ahead-proposals-" + stamp() + ".csv", "text/csv;charset=utf-8", csv(rows));
  }

  async function exportJSON() {
    try {
      const full = await rpc("admin_export", { p_token: WA.token });
      download("wings-ahead-export-" + stamp() + ".json", "application/json", JSON.stringify(full, null, 2));
    } catch (e) {
      toast("Export failed: " + e.message, true);
    }
  }

  /* ════════ delegated events (attach once per admin render) ════════ */
  const adm = $("adm");
  adm.addEventListener("click", async (ev) => {
    const t = ev.target;
    const tab = t.closest("[data-tab]");
    if (tab) {
      if (tab.dataset.tab === "refresh") { await load(false); toast("Data refreshed"); return; }
      A.tab = tab.dataset.tab;
      render();
      return;
    }
    /* ENTER ON BEHALF — checked BEFORE data-goto, because the button lives
       inside a row whose click opens the analysis */
    const erec = t.closest("[data-editrec]");
    if (erec) { editAs("rec", erec.dataset.editrec); return; }
    const eprop = t.closest("[data-editprop]");
    if (eprop) { editAs("prop", eprop.dataset.editprop); return; }

    const goto = t.closest("[data-goto]");
    if (goto) { A.sel = Number(goto.dataset.goto); A.tab = "students"; render(); return; }
    const nav = t.closest("[data-nav]");
    if (nav) { navStudent(Number(nav.dataset.nav)); return; }
    const met = t.closest("[data-metric]");
    if (met) { A.metric = met.dataset.metric; render(); return; }
    const pc = t.closest("[data-plotcat]");
    if (pc) { A.plotCat = pc.dataset.plotcat; A.hi = null; render(); return; }
    const pt = t.closest("[data-pt]");
    if (pt) { highlightRow(pt.dataset.pt); return; }
    const rs = t.closest("[data-ranksel]");
    if (rs) { A.rankSel = Number(rs.dataset.ranksel); render(); return; }

    const act = t.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "print") { buildPrint(); window.print(); }
      else if (a === "csv-summary") exportSummaryCSV();
      else if (a === "csv-entries") exportEntriesCSV();
      else if (a === "csv-proposals") exportProposalsCSV();
      else if (a === "json-export") exportJSON();
      else if (a === "add-student") openPersonModal("student", null);
      else if (a === "add-instructor") openPersonModal("instructor", null);
      else if (a === "modal-cancel") $("adm-veil").classList.add("hidden");
      else if (a === "modal-save") await savePersonModal(act);
      return;
    }

    const copy = t.closest("[data-copy]");
    if (copy) {
      const ok = await WA.copyText(linkFor(copy.dataset.copy));
      toast(ok ? "Link copied — paste it in a private message" : "Copy failed — copy it manually", !ok);
      return;
    }
    const edit = t.closest("[data-edit]");
    if (edit) {
      const p = (A.people || []).find((x) => x.id === edit.dataset.edit);
      if (p) openPersonModal(p.role, p);
      return;
    }
    const regen = t.closest("[data-regen]");
    if (regen) {
      const p = (A.people || []).find((x) => x.id === regen.dataset.regen);
      if (!p) return;
      if (!window.confirm("Regenerate the link for " + WA.personName(p, true) +
          "? The old link stops working immediately.")) return;
      try {
        const saved = await rpc("admin_regenerate_token", { p_token: WA.token, p_id: p.id });
        if (p.role === "admin") {
          await WA.copyText(linkFor(saved.token));
          window.alert("Your NEW admin link is now in the clipboard — the page will reload with it. " +
                       "Save it somewhere safe before closing this tab.");
          location.hash = "#t=" + saved.token;
          return;
        }
        await load(false);
        A.tab = "people";
        render();
        const ok = await WA.copyText(linkFor(saved.token));
        toast("New link generated" + (ok ? " and copied" : "") + " — resend it");
      } catch (e) { toast("Failed: " + e.message, true); }
      return;
    }
    const revoke = t.closest("[data-revoke]");
    if (revoke) {
      const p = (A.people || []).find((x) => x.id === revoke.dataset.revoke);
      if (!p) return;
      if (!window.confirm("Revoke the link of " + WA.personName(p, true) +
          "? Their link stops working until re-activated (data is kept).")) return;
      try {
        await rpc("admin_set_active", { p_token: WA.token, p_id: p.id, p_active: false });
        await load(false); A.tab = "people"; render();
        toast("Link revoked");
      } catch (e) { toast("Failed: " + e.message, true); }
      return;
    }
    const act2 = t.closest("[data-activate]");
    if (act2) {
      try {
        await rpc("admin_set_active", { p_token: WA.token, p_id: act2.dataset.activate, p_active: true });
        await load(false); A.tab = "people"; render();
        toast("Link re-activated");
      } catch (e) { toast("Failed: " + e.message, true); }
      return;
    }
    const del = t.closest("[data-del]");
    if (del) {
      const p = (A.people || []).find((x) => x.id === del.dataset.del);
      if (!p) return;
      if (!window.confirm("DELETE " + WA.personName(p, true) +
          " and ALL their data (record / proposals)? This cannot be undone.")) return;
      try {
        await rpc("admin_delete_person", { p_token: WA.token, p_id: p.id });
        await load(false); A.tab = "people"; render();
        toast("Deleted");
      } catch (e) { toast("Failed: " + e.message, true); }
      return;
    }
  });

  adm.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") $("adm-veil").classList.add("hidden");
  });

  /* the evaluation selector of the per-evaluation comparison */
  adm.addEventListener("change", (ev) => {
    if (ev.target.id === "evalsel") { A.evalSel = ev.target.value; render(); }
  });

  /* a plot point → the matching row of the summary table */
  function highlightRow(key) {
    A.hi = key;
    for (const tr of adm.querySelectorAll("[data-sumrow]"))
      tr.classList.toggle("is-hi", tr.dataset.sumrow === key);
    const row = adm.querySelector(`[data-sumrow="${key}"]`);
    if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function navStudent(step) {
    const n = A.data && A.data.students.length;
    if (!n) return;
    A.sel = (A.sel + step + n) % n;
    render();
  }
  WA._admNav = navStudent;   /* the once-attached key handler always calls the live one */

  /* keyboard ←/→ during analysis + brief — attach once globally */
  if (!WA._admKeysHooked) {
    WA._admKeysHooked = true;
    document.addEventListener("keydown", (ev) => {
      const st = WA._adminState;
      if (!st || !WA.me || WA.me.role !== "admin" || !WA._admNav) return;
      if (st.tab !== "students" && st.tab !== "brief") return;
      const ae = document.activeElement;
      if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
      const veil = $("adm-veil");
      if (veil && !veil.classList.contains("hidden")) return;
      if (ev.key === "ArrowLeft") { ev.preventDefault(); WA._admNav(-1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); WA._admNav(1); }
    });
  }

  /* live aggregates: gentle background refresh while the dashboard is open */
  if (WA._admTimer) clearInterval(WA._admTimer);
  WA._admTimer = setInterval(() => {
    if (document.hidden || !WA.me || WA.me.role !== "admin") return;
    load(true);
  }, 25000);

  await load(false);
};
