"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   WingsAhead — ADMIN dashboard (desktop-first).
   Overview · Student analysis (4-bar SVG comparison + trend + branch boxes)
   · Brief mode (large type, one student/screen, arrows + keyboard, print)
   · People & link management · CSV/JSON export.
   ══════════════════════════════════════════════════════════════════════════ */

WA.renderAdmin = async function (view, me) {
  const A = { data: null, people: null, tab: "overview", sel: 0,
              metric: "eval_mean", rankSel: 1, loading: false };
  WA._adminState = A;

  const BR = WA.BRANCHES;   // [{id,label}] — defined in instructor.js
  const RW = WA.RANK_WORD;  // {1:"1st",2:"2nd",3:"3rd"}

  const METRICS = [
    { id: "eval_mean", label: "Mean eval grade", dir: "high", fn: (s) => s.evalMean },
    { id: "evals", label: "Evaluations", dir: "high", fn: (s) => s.evals },
    { id: "fail", label: "FAIL", dir: "low", fn: (s) => s.fail },
    { id: "almost_good", label: "ALMOST GOOD", dir: "low", fn: (s) => s.almost_good },
    { id: "nfs", label: "NFS", dir: "low", fn: (s) => s.nfs },
    { id: "sms", label: "SMS entries", dir: "low", fn: (s) => s.sms },
    { id: "airsickness", label: "Airsickness", dir: "low", fn: (s) => s.airsickness },
    { id: "solos", label: "Solo flights", dir: "high", fn: (s) => s.solos },
    { id: "progress", label: "Progress tests", dir: "high", fn: (s) => s.progress },
    { id: "aptitude", label: "Aptitude exams", dir: "high", fn: (s) => s.aptitude },
  ];

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
      for (const s of A.data.students) s._stats = WA.recStats(s.record);
      if (A.sel >= A.data.students.length) A.sel = Math.max(0, A.data.students.length - 1);
      if (!soft || safeToRedraw()) render();
      buildPrint();
    } catch (e) {
      if (!soft) view.innerHTML = `<div class="landing"><h2>Could not load</h2><p>${esc(e.message)}</p></div>`;
      else toast("Refresh failed: " + e.message, true);
    }
    A.loading = false;
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
      return `
        <tr class="rowlink" data-goto="${i}" title="Open student analysis">
          <td><b>${esc(WA.personName(s.person, true))}</b></td>
          <td>${esc(s.person.class || "—")}</td>
          <td class="num">${st.evals}${st.evalMean !== null ? ` <span class="badge badge-acc">μ ${esc(st.evalMean)}</span>` : ""}</td>
          <td class="num">${st.solos}</td>
          <td class="num">${st.nfs}</td>
          <td class="num">${st.sms}</td>
          <td class="num">${st.fail}</td>
          <td class="num">${st.almost_good}</td>
          <td class="num">${st.airsickness}</td>
          <td class="num">${st.progress}</td>
          <td class="num">${st.aptitude}</td>
          <td>${st.pending ? `<span class="badge badge-warn">${st.pending} pending</span>` : `<span class="badge">—</span>`}</td>
          <td><span class="minibars" title="proposals naming Fighters / Helicopters / Transport–FF">
                <i style="height:${mb(pc.fighters)}px" title="Fighters: ${pc.fighters}"></i>
                <i class="b2" style="height:${mb(pc.helicopters)}px" title="Helicopters: ${pc.helicopters}"></i>
                <i class="b3" style="height:${mb(pc.transport_ff)}px" title="Transport–FF: ${pc.transport_ff}"></i>
              </span> <span class="badge">${c.proposals_in}/${c.instructors_total}</span></td>
          <td>${c.has_record
            ? `<span class="badge badge-good">✓ ${esc(fmtDT(s.last_update))}</span>`
            : `<span class="badge badge-bad">not submitted</span>`}</td>
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
          data as of ${esc(fmtDT(A.data.generated_at))}</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" data-act="csv-summary">Export CSV — summary</button>
        <button type="button" class="btn btn-sm" data-act="csv-proposals">Export CSV — proposals</button>
        <button type="button" class="btn btn-sm" data-act="json-export">Export JSON — full</button>
      </div>
      <div class="tblwrap"><table class="tbl">
        <thead><tr>
          <th>Student</th><th>Class</th><th>Evals</th><th>Solos</th><th>NFS</th><th>SMS</th>
          <th>FAIL</th><th>A.Good</th><th>Airsick</th><th>Progr.</th><th>Aptit.</th>
          <th>Pending</th><th>Proposals</th><th>Self-report</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="grid2" style="margin-top:12px">
        <div class="card"><h3>Students without a self-report</h3>
          <p class="hint">${noRecord.length ? noRecord.join(", ") : "Everyone has submitted ✓"}</p></div>
        <div class="card"><h3>Instructor submissions</h3>
          <p class="hint" style="line-height:2">${insRows || "No instructors yet."}</p></div>
      </div>`;
  }

  /* ════════ STUDENT ANALYSIS ════════ */
  function metricValues(m) {
    return A.data.students
      .map((s) => m.fn(s._stats))
      .filter((v) => v !== null && v !== undefined && isFinite(v));
  }

  function fourBarSVG(s) {
    const m = METRICS.find((x) => x.id === A.metric);
    const vals = metricValues(m);
    const mine = m.fn(s._stats);
    const best = vals.length ? (m.dir === "high" ? Math.max(...vals) : Math.min(...vals)) : null;
    const worst = vals.length ? (m.dir === "high" ? Math.min(...vals) : Math.max(...vals)) : null;
    const avg = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const bars = [
      { label: "This student", v: mine, color: "var(--accent)" },
      { label: "Class best", v: best, color: "var(--good)" },
      { label: "Class worst", v: worst, color: "var(--bad)" },
      { label: "Class average", v: avg, color: "var(--hf)" },
    ];
    const W = 640, H = 280, L = 44, R = 10, T = 26, B = 38;
    const max = Math.max(1, ...bars.map((b) => (b.v === null ? 0 : b.v))) * 1.12;
    const iw = (W - L - R) / bars.length;
    let grid = "", labels = "";
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const val = (max / ticks) * i;
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
                `<text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" style="fill:var(--text);font-size:12px;font-weight:600">${b.v === null ? "—" : esc(b.v)}</text>`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" style="fill:${b.color}"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparison chart — ${esc(m.label)}">
      <text x="${L}" y="14" style="fill:var(--muted);font-size:11px">${esc(m.label)} — ${esc(m.dir === "high" ? "higher is better" : "lower is better")}</text>
      ${grid}${rects}${labels}</svg>`;
  }

  function trendSVG(s) {
    const evals = (Array.isArray(s.record.evaluations) ? s.record.evaluations : [])
      .filter((e) => isFinite(Number(e.grade)) && e.date)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (evals.length < 2)
      return `<p class="hint" style="padding:6px 2px">${evals.length === 0
        ? "No dated evaluation grades reported yet — no trend to draw."
        : "Only one dated evaluation grade — the trend needs two or more."}</p>`;
    const W = 640, H = 170, L = 40, R = 12, T = 14, B = 30;
    const gs = evals.map((e) => Number(e.grade));
    let lo = Math.min(...gs), hi = Math.max(...gs);
    if (hi - lo < 4) { hi += 2; lo = Math.max(0, lo - 2); }
    const pad = (hi - lo) * 0.15;
    lo = Math.max(0, lo - pad); hi = hi + pad;
    const x = (i) => L + ((W - L - R) * i) / (evals.length - 1);
    const y = (g) => H - B - ((H - T - B) * (g - lo)) / (hi - lo);
    const pts = evals.map((e, i) => `${x(i)},${y(Number(e.grade))}`).join(" ");
    const dots = evals.map((e, i) =>
      `<circle cx="${x(i)}" cy="${y(Number(e.grade))}" r="3.4" style="fill:var(--gold)"/>` +
      `<text x="${x(i)}" y="${y(Number(e.grade)) - 8}" text-anchor="middle" style="fill:var(--text);font-size:10px">${esc(Number(e.grade))}</text>` +
      `<text x="${x(i)}" y="${H - B + 14}" text-anchor="middle" style="fill:var(--muted);font-size:9px">${esc(fmtD(e.date).slice(0, 5))}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evaluation grade trend">
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" style="stroke:var(--line)"/>
      <polyline points="${pts}" style="fill:none;stroke:var(--gold);stroke-width:2"/>
      ${dots}</svg>`;
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
      `<button type="button" class="chip${m.id === A.metric ? " is-on" : ""}" data-metric="${esc(m.id)}">${esc(m.label)}</button>`).join("");
    const rsel = [1, 2, 3].map((r) =>
      `<button type="button" class="chip${A.rankSel === r ? " is-on" : ""}" data-ranksel="${r}">${esc(RW[r])} choice</button>`).join("");
    const drill = s.proposals.length ? `
      <details class="drill"><summary>Drill-down — every proposal for this student (${s.proposals.length})</summary>
        <div class="tblwrap" style="margin-top:8px"><table class="tbl">
          <thead><tr><th>Instructor</th><th>Duty</th><th>Leadership</th><th>Status</th>
            <th>Fighters</th><th>Helicopters</th><th>Transport–FF</th><th>Flew with</th><th>Comment</th></tr></thead>
          <tbody>${s.proposals.map((p) => `
            <tr><td><b>${esc((p.rank ? p.rank + " " : "") + p.last_name)}</b></td>
              <td>${esc(p.duty || "—")}</td><td>${esc(p.leadership || "—")}</td><td>${esc(p.status || "—")}</td>
              <td>${esc(p.ranks.fighters ? RW[p.ranks.fighters] : "—")}</td>
              <td>${esc(p.ranks.helicopters ? RW[p.ranks.helicopters] : "—")}</td>
              <td>${esc(p.ranks.transport_ff ? RW[p.ranks.transport_ff] : "—")}</td>
              <td>${p.flew_with ? "✓" : "—"}</td><td>${esc(p.comment || "")}</td></tr>`).join("")}
          </tbody></table></div></details>` : "";

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
        </div>
        ${pend.length ? `<ul class="pendlist">${pend.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="card">
        <h2>Comparison vs class</h2>
        <p class="hint">Click a metric — the chart shows this student against the class best, worst and average.</p>
        <div class="chiprow" style="margin:10px 0">${chips}</div>
        <div class="chartbox">${fourBarSVG(s)}</div>
        <h3 style="margin-top:14px">Evaluation grade trend</h3>
        <div class="chartbox">${trendSVG(s)}</div>
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
          ${st.pending ? ` · <span style="color:var(--warn)">${st.pending} pending</span>` : ""}</div>
        <div class="card"><div class="kgrid">
          <span><span class="k">Evaluations</span> <b>${st.evals}</b>${st.evalMean !== null ? ` <span class="k">mean</span> <b>${esc(st.evalMean)}</b>` : ""}</span>
          <span><span class="k">Solos</span> <b>${st.solos}</b></span>
          <span><span class="k">NFS</span> <b>${st.nfs}</b></span>
          <span><span class="k">SMS</span> <b>${st.sms}</b></span>
          <span><span class="k">FAIL</span> <b>${st.fail}</b></span>
          <span><span class="k">ALMOST GOOD</span> <b>${st.almost_good}</b></span>
          <span><span class="k">Airsickness</span> <b>${st.airsickness}</b></span>
          <span><span class="k">Progress</span> <b>${st.progress}</b></span>
          <span><span class="k">Aptitude</span> <b>${st.aptitude}</b></span>
        </div></div>
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
      return `
        <div class="pr-page">
          <h2>${esc(WA.personName(s.person, true))}</h2>
          <div class="pr-meta">${esc([s.person.mn ? "MN " + s.person.mn : "", s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}
            · self-report ${s.completion.has_record ? "updated " + esc(fmtDT(s.last_update)) : "NOT submitted"}
            · proposals in: ${s.completion.proposals_in}/${s.completion.instructors_total}</div>
          <div class="pr-sec">Self-reported record</div>
          <table class="pr-t"><thead><tr><th>Evals</th><th>Mean grade</th><th>Solos</th><th>NFS</th>
            <th>SMS</th><th>FAIL</th><th>Almost Good</th><th>Airsick</th><th>Progress</th><th>Aptitude</th><th>Pending</th></tr></thead>
            <tbody><tr><td>${st.evals}</td><td>${st.evalMean === null ? "—" : esc(st.evalMean)}</td>
              <td>${st.solos}</td><td>${st.nfs}</td><td>${st.sms}</td><td>${st.fail}</td>
              <td>${st.almost_good}</td><td>${st.airsickness}</td><td>${st.progress}</td>
              <td>${st.aptitude}</td><td>${st.pending}</td></tr></tbody></table>
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
        <table class="pr-t"><thead><tr><th>#</th><th>Student</th>
          <th>Fighters Σ</th><th>Helicopters Σ</th><th>Transport–FF Σ</th>
          <th>1st-choice votes</th><th>Proposals in</th><th>Mean eval</th></tr></thead><tbody>
          ${list.map((s, i) => {
            const firsts = BR.reduce((acc, b) => acc + (s.aggregates[b.id].by_rank["1"] || []).length, 0);
            return `<tr><td>${i + 1}</td><td><b>${esc(WA.personName(s.person, true))}</b></td>
              <td>${esc(s.aggregates.fighters.weighted)}</td>
              <td>${esc(s.aggregates.helicopters.weighted)}</td>
              <td>${esc(s.aggregates.transport_ff.weighted)}</td>
              <td>${firsts}</td>
              <td>${s.completion.proposals_in}/${s.completion.instructors_total}</td>
              <td>${s._stats.evalMean === null ? "—" : esc(s._stats.evalMean)}</td></tr>`;
          }).join("")}</tbody></table>`;
    }).join("");

    holder.innerHTML = pages + `<div class="pr-page"><h2>WingsAhead — class summary</h2>
      <div class="pr-meta">Generated ${esc(fmtDT(A.data.generated_at))}</div>${summary}</div>`;
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

  function exportSummaryCSV() {
    const rows = [["MN", "Rank", "Last name", "First name", "Class",
      "Evals", "Mean grade", "Solos", "NFS", "SMS", "FAIL", "Almost Good", "Airsickness",
      "Progress tests", "Aptitude exams", "Pending items",
      "W Fighters", "W Helicopters", "W Transport-FF",
      "1st F", "1st H", "1st T-FF", "Proposals in", "Instructors total", "Self-report updated"]];
    for (const s of A.data.students) {
      const st = s._stats, ag = s.aggregates;
      rows.push([s.person.mn, s.person.rank, s.person.last_name, s.person.first_name, s.person.class,
        st.evals, st.evalMean === null ? "" : st.evalMean, st.solos, st.nfs, st.sms, st.fail,
        st.almost_good, st.airsickness, st.progress, st.aptitude, st.pending,
        ag.fighters.weighted, ag.helicopters.weighted, ag.transport_ff.weighted,
        (ag.fighters.by_rank["1"] || []).length, (ag.helicopters.by_rank["1"] || []).length,
        (ag.transport_ff.by_rank["1"] || []).length,
        s.completion.proposals_in, s.completion.instructors_total,
        s.completion.has_record ? fmtDT(s.last_update) : "not submitted"]);
    }
    download("wingsahead-summary-" + stamp() + ".csv", "text/csv;charset=utf-8", csv(rows));
  }

  function exportProposalsCSV() {
    const rows = [["Student", "Class", "Instructor", "Duty", "Leadership", "Status",
      "Fighters", "Helicopters", "Transport-FF", "Flew with", "Comment", "Updated"]];
    for (const s of A.data.students) for (const p of s.proposals) {
      rows.push([WA.personName(s.person, true), s.person.class,
        (p.rank ? p.rank + " " : "") + p.last_name, p.duty, p.leadership, p.status,
        p.ranks.fighters ? RW[p.ranks.fighters] : "", p.ranks.helicopters ? RW[p.ranks.helicopters] : "",
        p.ranks.transport_ff ? RW[p.ranks.transport_ff] : "",
        p.flew_with ? "yes" : "no", p.comment || "", fmtDT(p.updated_at)]);
    }
    download("wingsahead-proposals-" + stamp() + ".csv", "text/csv;charset=utf-8", csv(rows));
  }

  async function exportJSON() {
    try {
      const full = await rpc("admin_export", { p_token: WA.token });
      download("wingsahead-export-" + stamp() + ".json", "application/json", JSON.stringify(full, null, 2));
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
    const goto = t.closest("[data-goto]");
    if (goto) { A.sel = Number(goto.dataset.goto); A.tab = "students"; render(); return; }
    const nav = t.closest("[data-nav]");
    if (nav) { navStudent(Number(nav.dataset.nav)); return; }
    const met = t.closest("[data-metric]");
    if (met) { A.metric = met.dataset.metric; render(); return; }
    const rs = t.closest("[data-ranksel]");
    if (rs) { A.rankSel = Number(rs.dataset.ranksel); render(); return; }

    const act = t.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "print") { buildPrint(); window.print(); }
      else if (a === "csv-summary") exportSummaryCSV();
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
