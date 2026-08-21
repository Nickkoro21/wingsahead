"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   Wings Ahead — ADMIN dashboard (desktop-first).
   Overview · Student analysis (4-bar SVG comparison + trend + the assessment)
   · Brief mode (large type, one student/screen, arrows + keyboard, print)
   · People & link management · CSV/JSON export.

   ROUND 10 — ONE ASSESSMENT, ABOUT FIGHTERS. The three branch boxes and the
   1st/2nd/3rd selector are gone with the branch ranking itself. What replaced
   them is one box carrying the WEIGHTED MEAN of the five-level scale
   (app.js → WA.LEVELS), the arithmetic that produced it, the distribution and
   the names behind each level. Everything ranks on that mean.
   ══════════════════════════════════════════════════════════════════════════ */

WA.renderAdmin = async function (view, me) {
  /* coming back from an "enter on behalf" detour, the dashboard reopens where
     it was left (tab + student), so Back is a return and not a reset */
  const back = WA._admReturn || {};
  WA._admReturn = null;
  /* ── THE OVERVIEW CLASS FILTER (round 11) ─────────────────────────────────
     «Στο overview να μπορώ να φιλτράρω ανά class.» The choice survives a
     reload — a CO who briefs 98B all morning should not re-pick 98B after
     every refresh — so it lives in localStorage, exactly like the palette.
     "" is All, and a stored class that no longer has a student falls back to
     All rather than showing an empty table nobody asked for. */
  const CLS_KEY = "wa-adm-class";
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const A = { data: null, people: null, tab: back.tab || "overview", sel: back.sel || 0,
              metric: "fail", evalSel: "C4590",
              cls: lsGet(CLS_KEY) || "",
              loading: false, hi: null };
  WA._adminState = A;

  const LV = WA.LEVELS;     // the five-level scale, in scale order — app.js
  /* ROUND 9 — the sentinel of the "Other…" option, the same idea (and the
     same word) as the student form's PICK_OTHER */
  const PM_OTHER = "__other__";
  /* the ranks the squadron actually carries, offered as a datalist over a box
     that stays free text — the same list the FDMS scheduler's rank chips use,
     "Lt Col" included (the global roster holds two). */
  const RANKS = ["Cdt", "2Lt", "1Lt", "Capt", "Maj", "Lt Col", "S.Ten", "Lt"];

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
        /* ROUND 5 — the eight checkrides are fixed rows: a slot nobody has
           flown is a placeholder, so _evals holds the ATTEMPTS (and the
           imported entries nobody has identified), while _evalSlots holds the
           full eight-row view the tables and the printed brief show. */
        s._evals = WA.evalRows(s.record).filter((r) => r.flown || !r.id);
        s._evalSlots = WA.evalSlotRows(s.record);
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

  /* ── THE CLASS FILTER, IN THREE FUNCTIONS ─────────────────────────────────
     THE CLASSES ARE READ-ONLY — THEY FOLLOW THE MEMBERS. There is no list of
     classes anywhere in this database: a class exists because a student
     carries its name in people.class, and it stops existing when the last one
     stops carrying it. So the chips are DERIVED from the active students on
     every draw, in sorted order, and the unclassified students (people the
     roster gave no class) collect under one honest chip rather than
     disappearing — a student with no class must never become a student the
     Overview cannot show. */
  const NO_CLASS = "__noclass__";      /* the sentinel of "no class recorded" */
  function classOf(s) { return String((s.person && s.person.class) || "").trim(); }
  function classList() {
    const seen = {}, out = [];
    for (const s of (A.data ? A.data.students : [])) {
      const c = classOf(s) || NO_CLASS;
      if (!seen[c]) { seen[c] = 0; out.push(c); }
      seen[c]++;
    }
    out.sort((a, b) => a === NO_CLASS ? 1 : b === NO_CLASS ? -1 : a.localeCompare(b));
    return out.map((c) => ({ id: c, n: seen[c],
      label: c === NO_CLASS ? "No class recorded" : c }));
  }
  /* a filter that matches nobody is not a filter, it is a stale choice —
     so an id that has left the roster silently reverts to All */
  function activeClass() {
    if (!A.cls) return "";
    return classList().some((c) => c.id === A.cls) ? A.cls : "";
  }
  /* the students the Overview and its three CSV exports are about */
  function visible() {
    const c = activeClass();
    const all = A.data ? A.data.students : [];
    return c ? all.filter((s) => (classOf(s) || NO_CLASS) === c) : all;
  }
  function classLabel(id) {
    const hit = classList().find((c) => c.id === id);
    return hit ? hit.label : id;
  }
  /* ── THE RULING ON EXPORT SCOPE (round 11) ────────────────────────────────
     The three CSVs FOLLOW THE FILTER; the JSON export does NOT, and both are
     said out loud on the buttons themselves.
     WHY: the CSVs are one row per student (summary, assessments) or per entry
     of a student (entries) — they are the table the CO is looking at, in a
     spreadsheet — and they live in the toolrow directly above the filtered
     table. A button that sits over 6 visible rows and silently writes 20 is a
     button that produces the wrong attachment on a Monday morning, and the
     filename is the only place that mistake can be caught. So the scope
     travels in the filename: wings-ahead-summary-98B-20260819.csv.
     WHY NOT THE JSON: that one is not a view, it is the BACKUP — a raw
     server-side dump (public.admin_export) of people, records and proposals,
     the thing you restore from. A partial backup that looks like a full one is
     a trap, and the RPC has no class argument to narrow it with anyway. It
     stays complete, and its tooltip says so. */
  const CSV_SCOPE_TIP =
    "Follows the class filter above — exactly the rows you can see, and the class travels in the file name. Pick “All classes” to export the whole squadron.";
  const JSON_SCOPE_TIP =
    "ALWAYS COMPLETE — the class filter does not apply. This is the raw backup of every person, record and assessment, straight from the server; a partial file that looked like a full one would be a trap to restore from.";
  const CLASS_READONLY_TIP =
    "The classes are read-only here — they follow the members. A class appears because a student carries its name, and disappears when the last one stops; there is no list to maintain. Change a student's class under People & links.";

  /* the filename suffix of a filtered export: "-98B", "-no-class", "" */
  function classSuffix() {
    const c = activeClass();
    if (!c) return "";
    if (c === NO_CLASS) return "-no-class";
    return "-" + String(c).replace(/[^0-9A-Za-z_-]+/g, "-").replace(/^-+|-+$/g, "");
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

  /* ══ ROUND 14 — THE LEFT PANEL ON THE DASHBOARD: THE JUDGEMENT ════════════
     «Check the ADMIN dashboard too — if a left panel helps there
      (Overview/Analysis/Brief/People as vertical nav), apply the same pattern.»

     THE FOUR TABS STAY A HORIZONTAL CHIP ROW, and that is a ruling and not an
     omission. A left panel answers ONE question — «where am I in this long
     document, and what is in the rest of it» — and the four tabs are not a
     document: each one REPLACES the whole content, so a vertical rail of them
     could only ever highlight the row that is already lit. What it would cost
     is real: ~220 px of width on every tab, for ever, and the two things this
     dashboard most needs width for sit exactly there — the Overview's
     thirteen-column table and the log tables in the analysis.

     BUT THE PATTERN'S REAL HOME IN THE ADMIN IS THE STUDENT ANALYSIS, which IS
     a document: ten cards, several screens, and the CO reading it is looking
     for a section (the evaluations plot, the FAIL table, the flight log, the
     assessment). So the panel goes THERE, listing that tab's cards and carrying
     the same live states, mounted from the same WA.navMount the student form
     uses. One component, two surfaces; the tabs keep the shape that suits a
     view switch. */
  const ANA_CARDS = [
    { id: "ana-id", label: "Student" },
    { id: "ana-cmp", label: "Comparison" },
    { id: "ana-eval", label: "Evaluations" },
    { id: "ana-fail", label: "FAIL & Almost Good" },
    { id: "ana-air", label: "Airsickness" },
    { id: "ana-other", label: "Other entries" },
    { id: "ana-flights", label: "Flights" },
    { id: "ana-fs", label: "F/S" },
    { id: "ana-ground", label: "Ground" },
    { id: "ana-assess", label: "Assessment" },
  ];
  function anaNavItems() {
    const s = A.data && A.data.students[A.sel];
    const plain = ANA_CARDS.map((c) => ({ id: c.id, label: c.label }));
    if (!s) return plain;
    const st = s._stats;
    const cnt = (n) => ({ badge: String(n), tone: n ? "" : "muted" });
    const bars = (sec) => {
      const cn = WA.stateCounts(sec, s.record[sec]);
      return { badge: cn.owed ? cn.owed + " owed" : (cn.n ? "all in" : "—"),
               tone: cn.owed ? "" : (cn.n ? "good" : "muted"),
               tip: WA.secLabel(sec) + " — " + WA.stateLine(sec, cn),
               bars: [{ state: "done", n: cn.done }, { state: "started", n: cn.started },
                      { state: "owed", n: cn.owed }, { state: "extra", n: cn.extra }] };
    };
    const gl = WA.stateCounts("lessons", s.record.lessons);
    const gx = WA.stateCounts("exams", s.record.exams);
    const a = s.assessment || { n: 0, mean: null };
    const by = {
      "ana-fail": cnt(st.fail + st.almost_good),
      "ana-air": cnt(st.airsickness),
      "ana-other": cnt(st.fpc + st.cef + st.nfs + st.sms),
      "ana-flights": bars("flights"),
      "ana-fs": bars("fs"),
      /* the two ground blocks share one card, so their row carries the pair */
      "ana-ground": {
        badge: (gl.owed + gx.owed) ? (gl.owed + gx.owed) + " owed" : "all in",
        tone: (gl.owed + gx.owed) ? "" : "good",
        tip: "Ground lessons — " + WA.stateLine("lessons", gl) +
             " · Ground exams — " + WA.stateLine("exams", gx),
        bars: [{ state: "done", n: gl.done + gx.done },
               { state: "started", n: gl.started + gx.started },
               { state: "owed", n: gl.owed + gx.owed },
               { state: "extra", n: gl.extra + gx.extra }],
      },
      "ana-assess": { badge: a.n ? "Ø " + WA.meanText(a.mean) : "—",
                      tone: a.n ? "good" : "muted" },
    };
    return ANA_CARDS.map((c) => Object.assign({ id: c.id, label: c.label }, by[c.id] || {}));
  }

  function render() {
    for (const c of view.querySelectorAll("#adm-tabs .chip"))
      c.classList.toggle("is-on", c.dataset.tab === A.tab);
    const el = $("adm-content");
    /* the panel belongs to the analysis tab and to nothing else — a scroll
       listener pointing at cards that no longer exist is the one bug this
       component can have, so every redraw destroys it before it draws */
    if (WA._nav) { WA._nav.destroy(); WA._nav = null; }
    if (!A.data) { el.innerHTML = `<div class="card"><p class="hint">Loading…</p></div>`; return; }
    if (A.tab === "overview") el.innerHTML = htmlOverview();
    else if (A.tab === "students") el.innerHTML = htmlAnalysis();
    else if (A.tab === "brief") el.innerHTML = htmlBrief();
    else el.innerHTML = htmlPeople();
    const nav = document.getElementById("ana-nav");
    /* the analysis cards carry their own ids, so the panel is told how to
       find them instead of assuming the student form's "sec-" prefix */
    if (nav) WA._nav = WA.navMount(nav, { items: anaNavItems(),
      anchor: (id) => document.getElementById(id) });
  }

  /* ════════ OVERVIEW ════════ */
  /* the mean, rendered as the one number this dashboard now ranks on, with a
     five-segment distribution beside it — one bar per level, in scale order,
     coloured by the same tokens as the chips. A student with three
     assessments and a student with nine are on the same axis because the mean
     is a mean, which the round-8 SUM was not. */
  function meanCell(s) {
    const a = s.assessment || { n: 0, counts: {}, mean: null };
    const c = s.completion;
    const mb = (v) => Math.max(2, Math.min(18, v * 6));
    const bars = LV.map((l) => {
      const n = (a.counts || {})[l.id] || 0;
      return `<i class="lb-${esc(l.id)}" style="height:${mb(n)}px"
                 title="${esc(l.label)}: ${n}"></i>`;
    }).join("");
    return `<span class="meanpill${a.n ? "" : " is-none"}"
                  title="${esc(a.n
                    ? "weighted mean of " + a.n + " assessment" + (a.n === 1 ? "" : "s") +
                      " — " + WA.levelFormula(a.counts, a.n) + " = " + WA.meanText(a.mean)
                    : "no instructor has assessed this student yet")}">Ø ${esc(WA.meanText(a.mean))}</span>
      <span class="minibars" title="${esc("distribution — " + (WA.levelDist(a.counts) || "nothing recorded"))}">${bars}</span>
      <span class="badge">${a.n}/${c.instructors_total}</span>`;
  }

  function htmlOverview() {
    const all = A.data.students;
    const cls = activeClass();
    const students = visible();
    const insTotal = A.data.instructors.filter((i) => i.active).length;
    /* THE ROW KEEPS ITS ORIGINAL INDEX. A.sel indexes A.data.students, so a
       filtered table that renumbered its rows would open the wrong student's
       analysis — quietly, and only while a filter is on. */
    const rows = students.map((s) => {
      const i = all.indexOf(s);
      const st = s._stats, c = s.completion;
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
          <td class="mcell">${meanCell(s)}</td>
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
    /* THE INSTRUCTOR CARD IS NOT FILTERABLE, and pretending otherwise would be
       a lie in a badge. proposals_count arrives from the server counted over
       EVERY student an instructor has assessed; there is no per-class
       breakdown in the payload, so "7/12" cannot be re-derived for one class
       here. It therefore stays the whole squadron's number and says so out
       loud the moment a filter is on. */
    /* ROUND 14 — SENIORITY, not the alphabet. The server already orders this
       list (wa.seniority_key), and the client sorts it again with the SAME
       comparator: the dashboard payload carries the country and the call sign,
       so this surface can hold the order even against a cloud instance whose
       schema has not been re-run yet. One comparator, both sides. */
    const insRows = WA.sortBySeniority(A.data.instructors).map((i) => {
      const done = i.proposals_count, n = all.length;
      const badge = !i.active ? `<span class="badge badge-bad">revoked</span>`
        : done === 0 ? `<span class="badge badge-bad">nothing yet</span>`
        : done < n ? `<span class="badge badge-warn">${done}/${n}</span>`
        : `<span class="badge badge-good">✓ ${done}/${n}</span>`;
      return `<span style="margin-right:14px; white-space:nowrap">${esc(WA.personCall(i, true))} ${badge}</span>`;
    }).join(" ");

    const list = classList();
    const chip = (id, label, n, tip) =>
      `<button type="button" class="chip${(cls === id) ? " is-on" : ""}" data-cls="${esc(id)}"
        title="${esc(tip)}">${esc(label)} <span class="k">${n}</span></button>`;
    const chips = chip("", "All classes", all.length,
        "Every active student, whatever class they are in") +
      list.map((c) => chip(c.id, c.label, c.n,
        c.id === NO_CLASS
          ? "Students the roster gave no class — they are still students, so they get their own chip instead of vanishing"
          : "Only class " + c.label)).join("");

    return `
      <div class="toolrow">
        <span class="hint">${students.length}${cls ? " of " + all.length : ""} students ·
          ${insTotal} active instructors ·
          records: ${esc(sourceLine(students))} ·
          data as of ${esc(fmtDT(A.data.generated_at))}${cls
            ? ` · <b>filtered to ${esc(classLabel(cls))}</b>` : ""}</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" data-act="csv-summary"
          title="${esc(CSV_SCOPE_TIP)}">Export CSV — summary${cls ? " (" + classLabel(cls) + ")" : ""}</button>
        <button type="button" class="btn btn-sm" data-act="csv-entries"
          title="${esc(CSV_SCOPE_TIP)}">Export CSV — every entry${cls ? " (" + classLabel(cls) + ")" : ""}</button>
        <button type="button" class="btn btn-sm" data-act="csv-assessments"
          title="${esc(CSV_SCOPE_TIP)}">Export CSV — assessments${cls ? " (" + classLabel(cls) + ")" : ""}</button>
        <button type="button" class="btn btn-sm" data-act="json-export"
          title="${esc(JSON_SCOPE_TIP)}">Export JSON — full</button>
      </div>
      <div class="chiprow filterrow" role="group" aria-label="Filter by class">
        <span class="k" style="align-self:center">Class</span>${chips}
        <span class="k" style="align-self:center" title="${esc(CLASS_READONLY_TIP)}">&#9432;</span>
      </div>
      <div class="tblwrap"><table class="tbl">
        <thead><tr>
          <th>Student</th><th>Class</th><th>Solos</th><th>NFS</th><th>SMS</th>
          <th>FAIL</th><th>Almost Good</th><th>Airsick</th>
          <th title="${esc(WA.secTip("fpc"))}">FPC</th><th title="${esc(WA.secTip("cef"))}">CEF</th>
          <th title="${esc(WA.LEVEL_TIP)}">Assessment (fighters)</th><th>Self-report</th><th>Enter for</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="13" class="hint">No student in
          ${esc(classLabel(cls))}.</td></tr>`}</tbody></table></div>
      <div class="grid2" style="margin-top:12px">
        <div class="card"><h3>Students without a self-report${cls ? " — " + esc(classLabel(cls)) : ""}</h3>
          <p class="hint">${noRecord.length ? noRecord.join(", ")
            : (students.length ? "Everyone has submitted ✓" : "—")}</p></div>
        <div class="card"><h3>Instructor submissions</h3>
          <p class="hint" style="line-height:2">${insRows || "No instructors yet."}</p>
          ${cls ? `<p class="hint"><b>Not filtered.</b> Each badge counts the assessments that
            instructor has submitted across <b>all ${all.length}</b> students — the payload carries
            no per-class breakdown, so this card cannot honestly be narrowed to
            ${esc(classLabel(cls))}.</p>` : ""}</div>
      </div>`;
  }

  /* ════════ STUDENT ANALYSIS ════════ */
  /* one 4-bar comparison: this student · class best · class worst · class average.
     opts.unit — "%" appended to every value · opts.max — fixed axis top. */
  /* ── THE AXIS FOLLOWS THE DATA (round 8) ──────────────────────────────────
     A grade chart pinned to 0-100 spends four fifths of its height on a range
     nobody in the class is in: 69 · 77 · 87 draw three bars of almost exactly
     the same length, and the CO cannot see at a glance what he came to see.
     `o.min0` asks for a floor derived from the plot itself — the LOWEST value
     actually drawn, less 5, floored at 0 — while the top stays the honest 100
     so a grade is never made to look bigger than it is. Counts keep their
     0-based axis: a bar chart of "how many FAILs" must start at zero or it
     lies. The value labels ride above the bars either way. */
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
    /* counts get whole-number gridlines; grades keep the honest 100 at the top */
    const peak = Math.max(0, ...bars.map((b) => (b.v === null ? 0 : b.v)));
    const step0 = o.max ? o.max / 4 : Math.max(1, Math.ceil(peak / 4));
    const max = o.max || step0 * 4;
    /* the floor: the lowest value actually plotted, less 5, never below 0 */
    const drawn = bars.map((b) => b.v).filter((v) => v !== null && isFinite(v));
    const lo = (o.min0 && drawn.length) ? Math.max(0, Math.floor(Math.min(...drawn)) - 5) : 0;
    const span = Math.max(1, max - lo);
    const iw = (W - L - R) / bars.length;
    let grid = "", labels = "";
    for (let i = 0; i <= 4; i++) {
      const val = lo + (span / 4) * i;
      const y = H - B - ((H - T - B) * (val - lo)) / span;
      grid += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" style="stroke:var(--line);stroke-width:${i === 0 ? 1.4 : 0.6}"/>` +
              `<text x="${L - 6}" y="${y + 3.5}" text-anchor="end" style="fill:var(--muted);font-size:10px">${esc(round1(val))}</text>`;
    }
    const rects = bars.map((b, i) => {
      const x = L + iw * i + iw * 0.18, w = iw * 0.64;
      const v = b.v === null ? lo : Math.max(lo, b.v);
      const h = Math.max(b.v === null ? 0 : 2, ((H - T - B) * (v - lo)) / span);
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
     ROUND 11 — one value per student = their PASS ATTEMPT (WA.evalGrade): the
     attempt the flight was characterised successful on, not merely the latest.
     Every class statistic on this dashboard now reads through that one rule. */
  function evalValues(id) {
    return A.data.students.map((x) => ({
      name: x.person.last_name, v: WA.evalGrade(x._evals, id),
    }));
  }

  function evalCompare(s) {
    const id = A.evalSel;
    const all = evalValues(id);
    const vals = all.filter((x) => x.v !== null).map((x) => x.v);
    const op = WA.evalOperativeOf(s._evals, id);
    const mine = op.row ? op.row.grade : null;
    /* ROUND 8 — the axis starts just below the lowest grade on the plot, so
       the four bars differ by what the grades differ by (min0), and still ends
       at 100, so nothing is exaggerated. */
    const chart = barsSVG(WA.evalLabel(id) + " — grade %, higher is better", mine, vals, "high",
                          { unit: "%", max: 100, min0: true });
    const listed = all.filter((x) => x.v !== null)
      .sort((a, b) => b.v - a.v)
      .map((x) => `${esc(x.name)} ${esc(x.v)}%`).join(" · ");
    return `
      ${chart}
      <p class="hint chk">Axis: ${vals.length || mine !== null
        ? esc(Math.max(0, Math.floor(Math.min(...[mine].concat(vals)
            .filter((v) => v !== null && isFinite(v)))) - 5)) + "–100 %"
        : "0–100 %"} — it starts just below the lowest grade plotted.
        Class values on <b>${esc(id)}</b>: ${listed || "nobody has flown it yet"}
        ${vals.length ? ` &mdash; best ${esc(Math.max(...vals))}%, worst ${esc(Math.min(...vals))}%,
        average ${esc(round1(vals.reduce((a, b) => a + b, 0) / vals.length))}%` : ""}
        (n = ${vals.length} of ${A.data.students.length} students).
        ${mine === null ? "<b>This student has no graded attempt on this evaluation.</b>" : ""}
        ${op.attempts > 1 ? `<br><b>${op.attempts} attempts</b> on this checkride &mdash; the value
          plotted is ${op.passed
            ? "the one the flight was characterised <b>successful</b> on"
            : "the latest, and <b>none of them passed yet</b>"}
          <span class="tipdot" tabindex="0" role="note" title="${esc(WA.PASS_ATTEMPT_TIP)}"
            aria-label="${esc(WA.PASS_ATTEMPT_TIP)}">&#9432;</span>.` : ""}</p>`;
  }

  /* ── THE PLOT DEFINITIONS (round 11) ──────────────────────────────────────
     "eval" — ALL EIGHT CHECKRIDES ON ONE LINE, in syllabus order. The four
     per-category tabs are gone: «Στο Grades per category να πλωτάρονται οι 8
     αξιολογήσεις όλες μαζί. Ανά κατηγορία απλώς στα χ labels άλλο χρώμα.»
     A tab per track meant the CO saw four charts of two or three points each
     and had to hold the shape of the stage in his head; one line of eight
     shows it. The track survives where it belongs — in the COLOUR of the x
     label (WA.evalCatColor), which needs no click to read.
     "fpc" — its own block, below, and NOT a fifth colour on the same line:
     an FPC has no position in the syllabus, so its points cannot share an x
     axis that IS the syllabus without inventing an order the flights do not
     have. See the ruling above the FPC block in htmlAnalysis. */
  function plotDef(kind, s) {
    if (kind === "fpc") {
      /* THE AXIS IS THE CLASS'S DEEPEST FPC COUNT, so #2 means the same
         position for everybody — but a student with NO FPC gets no plot at
         all. Before round 11 the FPC lived behind a tab nobody opened unless
         they wanted it; now it is always on screen, and drawing "FPC #1 not
         flown · FPC #2 not flown" for a student who has never been referred
         puts an absence on the page as though it were a gap in his record. */
      if (s && !s._fpc.length) return { pts: [], none: true };
      const n = A.data.students.reduce((m, x) => Math.max(m, x._fpc.length), 0);
      return {
        note: "An FPC has no position in the syllabus — entries are numbered in date order.",
        pts: Array.from({ length: n }, (_, k) => ({ key: k, cat: "fpc",
          label: "FPC #" + (k + 1), title: "FPC #" + (k + 1) })),
        val: (x, p) => (x._fpc[p.key] ? x._fpc[p.key].grade : null),
        op: (x, p) => (x._fpc[p.key] ? { row: x._fpc[p.key], passed: WA.gradePassed(x._fpc[p.key].grade), attempts: 1 } : null),
        row: (x, p) => (x._fpc[p.key] ? "fpc:" + x._fpc[p.key].i : null),
      };
    }
    return {
      note: "All eight checkrides in syllabus order — never in date order. The x label is coloured by track.",
      pts: WA.EVALUATIONS.map((d) => ({ key: d.id, cat: d.cat,
        label: d.id, title: WA.evalLabel(d.id) })),
      val: (x, p) => WA.evalGrade(x._evals, p.key),
      op: (x, p) => WA.evalOperativeOf(x._evals, p.key),
      row: (x, p) => { const r = WA.evalOperative(x._evals, p.key); return r ? "ev:" + r.i : null; },
    };
  }

  function catPlotSVG(s, kind) {
    const def = plotDef(kind, s);
    if (!def.pts.length)
      return `<p class="hint" style="padding:6px 2px">${def.none
        ? "No FPC on this student's record &mdash; nothing to plot."
        : "Nothing to plot here yet."}</p>`;
    const mine = def.pts.map((p) => def.val(s, p));
    const cls = def.pts.map((p) => {
      const vs = A.data.students.map((x) => def.val(x, p)).filter((v) => v !== null);
      return vs.length ? round1(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
    });
    const seen = mine.concat(cls).filter((v) => v !== null);
    if (!seen.length)
      return `<p class="hint" style="padding:6px 2px">No grades reported here yet
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
      const op = def.op(s, p) || { passed: false, attempts: 0 };
      /* ROUND 11 — THE X LABEL CARRIES THE TRACK, in colour and nowhere else.
         It is the whole reason the four category tabs could go away, so it is
         also the one label on this chart that is not --muted. */
      const xLab = `<text x="${x(i)}" y="${H - B + 15}" text-anchor="middle"
        style="fill:${esc(WA.evalCatColor(p.cat))};font-size:10.5px;font-weight:600"
        ><title>${esc(p.title + " — " + WA.evalCatLabel(p.cat))}</title>${esc(p.label)}</text>`;
      if (v === null) {
        return xLab + `<text x="${x(i)}" y="${y(lo) - 4}" text-anchor="middle" style="fill:var(--muted);font-size:9px">not flown</text>`;
      }
      /* A POINT THAT HAS NOT PASSED IS DRAWN HOLLOW. The rule says the number
         is the successful attempt; when there is no successful attempt the
         chart still has to show a number, and it must not look like the same
         kind of number. A ring, not a colour: --bad on a data point would put
         a verdict in the palette, and the band is already named in the
         tooltip and spelled out in the table below. */
      const passed = op.passed;
      const dot = passed
        ? `<circle cx="${x(i)}" cy="${y(v)}" r="4.4" style="fill:var(--accent)"/>`
        : `<circle cx="${x(i)}" cy="${y(v)}" r="4.6"
             style="fill:var(--chart-bg);stroke:var(--accent);stroke-width:2;stroke-dasharray:2.2 1.8"/>`;
      const band = WA.gradeBandText(v);
      const tip = p.title + " — " + v + "% · " + band +
        (op.attempts > 1 ? " · " + op.attempts + " attempts, " +
          (passed ? "this is the successful one" : "none successful yet") : "") +
        ". Click to find it in the table below.";
      return xLab + dot +
        `<text x="${x(i)}" y="${y(v) - 10}" text-anchor="middle" style="fill:var(--text);font-size:11px;font-weight:600">${esc(v)}</text>` +
        (key ? `<circle class="hit" cx="${x(i)}" cy="${y(v)}" r="13" data-pt="${esc(key)}"
                  style="fill:transparent;cursor:pointer"><title>${esc(tip)}</title></circle>` : "");
    }).join("");

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(kind === "fpc"
        ? "FPC grades in date order" : "Grades on the eight checkrides, syllabus order")}">
      ${grid}${clsLine}${clsDots}${myLine}${myDots}
      <text x="${L}" y="13" style="fill:var(--muted);font-size:10.5px">${esc(def.note)}</text>
      </svg>`;
  }

  /* the legend of the single evaluation chart: the two lines, then the four
     tracks in syllabus order — which is also the order their labels appear
     along the x axis, so the legend reads left to right like the chart does */
  function evalLegend() {
    const cats = WA.EVAL_CATS.filter((c) => c.id !== "fpc").map((c) =>
      `<span title="${esc("the x labels of the " + c.label.toLowerCase() +
        " checkrides are drawn in this colour")}"><i style="background:${esc(c.color)}"></i>${
        esc(c.label)}</span>`).join("");
    return `<div class="legendrow">
        <span><i style="background:var(--accent)"></i>this student</span>
        <span title="the average of every active student who has flown that checkride — all classes, not only this student's">
          <i style="background:var(--muted)"></i>class average on the same checkride</span>
        <span class="lgsep" aria-hidden="true"></span>
        <span class="k">x labels by track:</span>${cats}
      </div>`;
  }

  /* ── the summary table every plot point points at ──
     ROUND 5: all EIGHT checkrides are always listed, in syllabus order —
     the ones nobody has flown yet say so, which is half of what the CO is
     looking for during the brief. */
  /* the band a grade fell in, as the chip the attempt rows wear: "ΥΣΤΕΡΗΣΗ"
     and "ΑΠΟΤΥΧΙΑ" are the squadron's own words for what did not pass, and an
     attempt row is the one place on this dashboard where saying them plainly
     is the point (round 11) */
  function bandChip(g) {
    const b = WA.gradeBand(g);
    if (!b) return "";
    return `<span class="bandchip band-${esc(b.id)}"
      title="${esc(WA.GRADE_SOURCE)}">${esc(b.code)} ${esc(b.label)}</span>`;
  }

  function evalSummary(s) {
    const rows = [];
    for (const sl of s._evalSlots.slots) {
      const r = sl.row;
      /* ROUND 11 — the row that stands for the slot is the PASS ATTEMPT. When
         there is none, the slot still shows its latest attempt and says out
         loud that nothing has passed yet, rather than showing a number that
         quietly reads like a result. */
      const many = sl.attempts > 1;
      rows.push({
        key: r ? "ev:" + r.i : "", cat: sl.def.cat, flown: !!r,
        what: `<b>${esc(sl.def.id)}</b> ${esc(sl.def.name)}` +
          (r && many ? ` <span class="badge" title="${esc(WA.PASS_ATTEMPT_TIP)}">${
            sl.passed ? "counts: successful attempt" : "no successful attempt yet"} · ${
            sl.attempts} attempts</span>` : "") +
          (r && !sl.passed && r.grade !== null ? " " + bandChip(r.grade) : ""),
        who: r ? r.with : "", grade: r ? r.grade : null, date: r ? r.date : "",
        co: !!(r && WA.isCO(r)),
      });
      for (const old of sl.earlier) {
        rows.push({
          key: "ev:" + old.i, cat: sl.def.cat, flown: true, sub: true,
          /* NOT COUNTED ANYWHERE — and the row says so, because a grade in a
             table is assumed to be a grade that counts until it is told not
             to be */
          what: `<span class="k">attempt — ${esc(sl.def.id)}</span> ${bandChip(old.grade)}
            <span class="k" title="${esc(WA.PASS_ATTEMPT_TIP)}">not counted</span>`,
          who: old.with, grade: old.grade, date: old.date, co: WA.isCO(old),
        });
      }
    }
    for (const r of s._evalSlots.extras) {
      rows.push({
        key: "ev:" + r.i, cat: null, flown: true,
        what: `<span class="warn-t">(not identified — imported entry)</span>`,
        who: r.with, grade: r.grade, date: r.date, co: WA.isCO(r),
      });
    }
    s._fpc.forEach((r, k) => rows.push({
      key: "fpc:" + r.i, cat: "fpc", flown: true,
      what: `<b>FPC #${k + 1}</b> ${r.trigger ? "(" + WA.sortieCell(null, r.trigger) + ") " : ""}` +
        `<span class="k">flight progress check</span>${WA.fpcResultNote(r.result)}`,
      who: r.with, grade: r.grade, date: r.date, co: WA.isCO(r),
    }));
    /* the coloured square that ties a table row to its x label on the chart —
       the same token, so the two surfaces cannot drift apart (round 11) */
    const catDot = (cat) => cat
      ? `<i class="catdot" style="background:${esc(WA.evalCatColor(cat))}"
           title="${esc(WA.evalCatLabel(cat))}"></i>` : "";
    return `
      <div class="tblwrap"><table class="tbl" id="sumtbl">
        <thead><tr><th>Evaluation</th><th>With whom</th><th>Grade</th><th>Date</th><th>Source</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr data-sumrow="${esc(r.key)}" class="${
            A.hi && A.hi === r.key ? "is-hi" : ""}${r.flown ? "" : " is-unflown"}">
            <td>${catDot(r.cat)}${r.what}</td>
            <td>${r.flown ? esc(r.who || "—") : `<span class="k">not flown yet</span>`}</td>
            <td class="num">${WA.pct(r.grade)}</td>
            <td>${r.flown ? esc(fmtD(r.date)) : "—"}</td>
            <td>${r.flown ? (r.co ? `<span class="cotag" title="${esc(WA.CO_TIP)}">CO</span>`
                                  : `<span class="k">self</span>`) : "—"}</td></tr>`).join("")}
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
    return evTable(["Date", "Track", "Flight", "Items", "Instructor", "Grade", "Source"],
      list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e) => `
        <tr><td>${esc(fmtD(e.date))}</td>
          <td>${esc(WA.itemCatLabel(e.category))}</td>
          <td>${WA.sortieCell(e.category, e.flight_code)}</td>
          <td class="items">${WA.itemsLabelHTML(e)}
            ${WA.itemsN(e) > 1
              ? `<span class="badge" title="${esc((e.items || []).join(" · "))}">${WA.itemsN(e)} items</span>` : ""}
            ${WA.itemsLegacy(e).length
              ? `<span class="badge badge-warn" title="${esc(WA.ITEM_LEGACY_TIP)}">${
                  WA.itemsLegacy(e).length} legacy</span>` : ""}</td>
          <td>${esc(e.instructor || "—")}</td>
          <td class="num">${WA.pct(e.grade)}</td>
          ${srcCell(e)}</tr>`));
  }

  /* ROUND 6 — the airsickness table names the FLIGHT. A row still carrying the
     retired phase-of-flight note shows it greyed under the flight: readable
     for ever, and visibly not the thing the column now asks for. */
  function airsickTable(s) {
    const list = Array.isArray(s.record.airsickness) ? s.record.airsickness : [];
    if (!list.length) return `<p class="hint">No airsickness reported.</p>`;
    return evTable(["Date", "Flight", "With whom", "Source"],
      list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e) => `
        <tr><td>${esc(fmtD(e.date))}</td>
          <td>${e.flight_code ? WA.sortieCell(null, e.flight_code) : `<span class="k">—</span>`}${
            e.phase ? `<div class="k" title="The phase-of-flight note this form collected before round 6 — kept as legacy information, the flight is what the squadron records now">legacy note: ${esc(e.phase)}</div>` : ""}</td>
          <td>${esc(e.instructor || "—")}</td>${srcCell(e)}</tr>`));
  }

  /* the solo section as the CO must see it: the FIXED syllabus slots, in
     syllabus order, each either flown or openly unflown, plus any extra solo
     reality produced (round 5) */
  function soloRows(s) {
    const list = Array.isArray(s.record.solo_flights) ? s.record.solo_flights : [];
    const bySlot = {};
    for (const e of list) if (e.slot) bySlot[e.slot] = e;
    const out = WA.soloSlots().map((sl) => {
      const e = bySlot[sl.id];
      const flown = !!e && !WA.slotEmpty("solo_flights", e);
      return `<tr class="${flown ? "" : "is-unflown"}">
        <td title="${esc(WA.soloSlotTip(sl.id))}"><b>${esc(sl.sec)}</b>${
          sl.of > 1 ? ` <span class="k">solo ${sl.n} of ${sl.of}</span>` : ""}${
          sl.req ? ` <span class="badge badge-warn">required</span>` : ""}</td>
        <td>${flown && e.sortie ? WA.sortieCell(null, e.sortie) : `<span class="k">${esc(sl.codes.join(" / "))}</span>`}</td>
        <td>${flown ? esc(fmtD(e.date)) : `<span class="badge">not flown yet</span>`}</td>
        <td>${!flown ? "—" : (e.ng ? `<span class="badge">NG — non-graded</span>` : WA.pct(e.grade))}</td>
        <td>${!flown ? "—" : WA.soloWhoHTML(e)}</td>
        ${flown ? srcCell(e) : "<td>—</td>"}</tr>`;
    });
    for (const e of list) {
      if (e.slot && WA.soloSlot(e.slot)) continue;
      out.push(`<tr><td><span class="badge badge-acc">additional</span></td>
        <td>${e.sortie ? WA.sortieCell(null, e.sortie) : "—"}</td>
        <td>${esc(fmtD(e.date))}</td>
        <td>${e.ng ? `<span class="badge">NG — non-graded</span>` : WA.pct(e.grade)}</td>
        <td>${WA.soloWhoHTML(e)}</td>${srcCell(e)}</tr>`);
    }
    return out;
  }


  /* ══════════════════════════════════════════════════════════════════════════
     ROUND 12 — THE LOG TABLES, AS THE CO READS THEM.
     Here they ARE real tables, with the directive's own columns — the screen is
     wide, and the CO is reading rather than typing. Same order as the form:
     4 Flights + 4 F/S + Ground lessons + Ground exams.
     ══════════════════════════════════════════════════════════════════════════ */
  /* the grade cell of a log row — and the one place the debrief lag is shown
     as what it is: a fact, not a gap. */
  function logGradeCell(e) {
    if (e.ng) return `<td><span class="badge">NG &mdash; non-graded</span></td>`;
    if (e.grade !== null && e.grade !== undefined && e.grade !== "" && isFinite(Number(e.grade))) {
      return `<td class="num">${WA.pct(e.grade)}</td>`;
    }
    return `<td class="lag">${WA.debriefChip(e) || "&mdash;"}</td>`;
  }
  /* ROUND 12b — THE MISSION, IN ITS OWN COLUMN. Where a grade exists it is
     READ from the number and marked as such; where none does it is what the
     squadron said about the flight without one. A mission the squadron
     recorded as INCOMPLETE must never be indistinguishable from a flight still
     waiting for its debrief — that is the whole reason the key exists, and the
     column is where the CO sees it. */
  function logMissionCell(e) {
    if (e.ng) {
      return `<td><span class="k" title="A non-graded (NG) flight is not scorable at all — it carries neither a grade nor a mission">&mdash;</span></td>`;
    }
    const m = WA.rowMission(e);
    if (!m) return `<td><span class="k">&mdash;</span></td>`;
    const def = WA.mission(m) || {};
    const derived = WA.missionDerived(e);
    return `<td><span class="mchip is-${esc(m)}" title="${esc(derived
      ? "Read from the grade: " + e.grade + " % is “" + (def.label || m) + "” (the 60 % threshold of ΠΔ 151/13)"
      : def.tip || "")}">${esc(def.label || m)}${
      derived ? ` <span class="k">read from the grade</span>` : ""}</span></td>`;
  }
  /* ROUND 13 — THE FOUR STATES, ON THE CO'S SIDE TOO. The record the CO reads
     is SPARSE — an owed slot is stored nowhere — so the owed rows are drawn
     from the same catalogue the student's form draws them from, through the
     same WA.slotRows. The result is that the CO's table and the student's form
     are THE SAME TABLE: same order, same colours, same four counts, and the
     one question the CO actually asks — what is this student still owed — is
     answered without opening the student's own link. */
  const stateCell = (st) => {
    const d = WA.rowStateDef(st);
    return `<td><span class="stchip st-${esc(st)}" title="${esc(d.tip)}">${esc(d.label)}</span></td>`;
  };
  function logRows(s, band, track) {
    return WA.slotRows(band, s.record[band], track).map((r) => {
      const e = r.e;
      if (!e) {
        const d = r.def, sd = d.sortie || {};
        return `<tr class="st-owed">
          <td><span title="${esc(WA.logSortieLabel(band, track, d.code, "syllabus") +
              (sd.g ? " · Training Section " + sd.g : "") +
              (sd.h ? " · syllabus " + sd.h + " h" : "") + (sd.nt ? " · night" : ""))}"
            ><b>${esc(d.code)}</b></span></td>
          <td class="k">&mdash;</td><td class="k">&mdash;</td>
          <td class="num k">${sd.h ? esc(sd.h) : "&mdash;"}</td>
          <td class="k">&mdash;</td><td class="k">&mdash;</td>
          ${stateCell("owed")}<td class="k">&mdash;</td></tr>`;
      }
      const kind = WA.flightKind(e.kind);
      const seq = Number(e.seq || 1);
      const known = WA.logSortieKnown(band, track, e.sortie);
      return `<tr class="st-${esc(r.state)}">
        <td><span title="${esc(WA.logSortieLabel(band, track, e.sortie, e.kind))}"><b>${esc(e.sortie || "—")}</b></span>${
          known || WA.kindOffCatalogue(e.kind) ? ""
            : `<span class="offcat" title="Not in the syllabus catalogue — typed as free text">*</span>`}${
          kind && kind.id !== "syllabus"
            ? ` <span class="badge badge-acc" title="${esc(kind.tip)}">${esc(kind.label)}</span>` : ""}${
          seq > 1
            ? ` <span class="badge" title="A deliberate same-day re-fly — the ${esc(seq)}th flight of this sortie on this date, not a duplicate">#${esc(seq)}</span>` : ""}</td>
        <td>${esc(fmtD(e.date))}</td>
        <td>${esc(e.instructor || "—")}</td>
        <td class="num">${e.duration === null || e.duration === undefined || e.duration === ""
          ? `<span class="k">—</span>` : esc(e.duration)}</td>
        ${logGradeCell(e)}
        ${logMissionCell(e)}
        ${stateCell(r.state)}
        ${srcCell(e)}</tr>`;
    });
  }
  function logBandBlock(s, band) {
    const all = Array.isArray(s.record[band]) ? s.record[band] : [];
    const head = ["Flight", "Date", "Instructor", "Hours", "Grade", "Mission", "State", "Source"];
    const body = WA.TRACKS.map((t) => {
      const rows = logRows(s, band, t);
      const cn = WA.stateCounts(band, all, t);
      return `
        <h3 style="margin-top:10px">${esc(WA.secLabel(band))} &mdash; ${esc(WA.itemCatLabel(t))}
          <span class="cnt">${esc(WA.stateLine(band, cn))}</span></h3>
        ${rows.length ? evTable(head, rows)
          : `<p class="hint">Nothing recorded in this track yet.</p>`}`;
    }).join("");
    return `<h2>${esc(WA.secLabel(band))} ${WA.tipDot(band)}
        <span class="cnt">${esc(WA.stateLine(band, WA.stateCounts(band, all)))}</span></h2>
      ${stateLegend()}
      ${body}`;
  }
  /* the same legend the student's form carries — four colours are four facts */
  function stateLegend() {
    return `<p class="legend">${WA.ROW_STATES.map((st) =>
      `<span class="lgchip st-${esc(st.id)}" title="${esc(st.tip)}">${esc(st.label)}</span>`)
      .join(`<span class="lgsep">·</span>`)}
      <span class="k">&mdash; the syllabus is pre-seeded: an OWED row is prescribed by the printed
      programme and stored nowhere until it is filled in</span></p>`;
  }
  /* ROUND 12b — GROUP · COURSE · DATES, and nothing else: «Μη βαλεις
     εκπαιδευτη για μαθηματα και εξετασεις για να ειναι απλο», and the same
     review removed the note field and with it the periods and attendance
     boxes. What the CO reads is what the student's own table holds. */
  function lessonsTable(s) {
    const rows = WA.slotRows("lessons", s.record.lessons).map((r) => {
      const e = r.e;
      if (!e) {
        const d = r.def;
        return `<tr class="st-owed">
          <td title="${esc(WA.groundGroupLabel(d.group))}"><b>${esc(d.group)}</b></td>
          <td title="${esc(d.crs.n + " · " + d.crs.p + " period" + (d.crs.p === 1 ? "" : "s"))}">${
            esc(d.course)}${d.crs.cond
              ? ` <span class="badge badge-acc" title="Supplementary — only for SPs who did not cover it at their Air Force Academy">foreign SPs</span>` : ""}</td>
          <td class="k">&mdash;</td>${stateCell("owed")}<td class="k">&mdash;</td></tr>`;
      }
      const c = WA.lessonCourse(e.group, e.course);
      return `<tr class="st-${esc(r.state)}">
        <td title="${esc(WA.groundGroupLabel(e.group))}"><b>${esc(e.group || "—")}</b></td>
        <td>${esc(e.course || "—")}${c ? "" :
          (e.course ? `<span class="offcat" title="Not in the generated syllabus catalogue for this group">*</span>` : "")}</td>
        ${/* ROUND 14 — an END-ONLY lesson is a course that ran and finished on a
             known day; "— – 30/04" reads as a broken range, so it is named */ ""}
        <td>${e.date
          ? esc(fmtD(e.date)) + (e.end_date && e.end_date !== e.date ? " &ndash; " + esc(fmtD(e.end_date)) : "")
          : (e.end_date
              ? `<span title="Recorded by its end date — the course ran and finished on this day">ended ${esc(fmtD(e.end_date))}</span>`
              : `<span class="k">&mdash;</span>`)}</td>
        ${stateCell(r.state)}
        ${srcCell(e)}</tr>`;
    });
    return evTable(["Group", "Course", "Dates", "State", "Source"], rows);
  }
  function examsTable(s) {
    const rows = WA.slotRows("exams", s.record.exams).map((r) => {
      const e = r.e;
      if (!e) {
        const d = r.def.def;
        return `<tr class="st-owed">
          <td title="${esc(WA.examLabel(d.id))}"><b>${esc(d.id)}</b>${
            d.cond ? ` <span class="badge badge-acc" title="Foreign SPs only — a HAF student does not owe this exam">foreign SPs only</span>` : ""}</td>
          <td class="k">&mdash;</td><td class="k">&mdash;</td>
          ${stateCell("owed")}<td class="k">&mdash;</td></tr>`;
      }
      const x = WA.exam(e.exam);
      const has = e.grade !== null && e.grade !== undefined && e.grade !== "" && isFinite(Number(e.grade));
      /* ROUND 14 — the row says WHICH ATTEMPT it is, and an ΕΕΘ says its
         number: the CO reading two IN190 lines has to be able to tell the
         re-sit from the first sitting, and a series row names no exam at all */
      const ser = WA.examSeries(e);
      const tn = ser ? 1 : WA.examTrial(e);
      /* ONE trial badge, and its colour says whether this is the attempt the
         verdict is read from: accented on the operative one, plain on the
         attempts it displaced (which are kept and shown, and count for nothing
         in that verdict — the round-11 pass rule, one section over) */
      const showTrial = !ser && (tn > 1 || r.alt);
      return `<tr class="st-${esc(r.state)}">
        <td title="${esc(ser ? ser.tip : WA.examLabel(e.exam))}"><b>${esc(
          ser ? WA.examRowLabel(e) : (e.exam || "—"))}</b>${
          ser ? ` <span class="badge" title="${esc(ser.tip)}">weekly theory</span>` : ""}${
          showTrial ? ` <span class="badge${r.alt ? "" : " badge-acc"}" title="${esc(
            WA.examTrialWord(tn) + (r.alt
              ? " of this exam. It is kept and shown; the exam's verdict is read from the attempt it was PASSED on."
              : " — this is the attempt the exam's verdict is read from."))}">${
            esc(WA.examTrialWord(tn))}</span>` : ""}${
          x && x.cond ? ` <span class="badge badge-acc" title="Foreign SPs only — a HAF student does not owe this exam">foreign SPs only</span>` : ""}</td>
        <td>${esc(fmtD(e.date))}</td>
        ${has ? `<td class="num">${WA.pct(e.grade)}</td>`
              : `<td class="lag">${WA.debriefChip(e, "exams") || "&mdash;"}</td>`}
        ${stateCell(r.state)}
        ${srcCell(e)}</tr>`;
    });
    return evTable(["Exam", "Date", "Grade", "State", "Source"], rows);
  }

  /* "3 of 8 syllabus solos flown · 1 additional" — the honest solo counter */
  function soloCount(s) {
    const list = Array.isArray(s.record.solo_flights) ? s.record.solo_flights : [];
    const done = list.filter((e) => e.slot && WA.soloSlot(e.slot) &&
      !WA.slotEmpty("solo_flights", e)).length;
    const extra = s._stats.solos - done;
    return done + " of " + WA.soloSlots().length + " syllabus solos flown" +
      (extra > 0 ? " · " + extra + " additional" : "");
  }

  function otherTables(s) {
    const r = s.record;
    const nfs = (r.nfs || []).map((e) =>
      `<tr><td>${esc(fmtD(e.date))}</td>
        <td title="${esc((WA.nfsReason(e.reason) || {}).el || "")}">${esc(WA.nfsReasonShort(e))}</td>
        <td>${esc(e.note || "—")}</td>${srcCell(e)}</tr>`);
    /* ROUND 8 — the entrance names its ΚΕΠΕ condition (3-01 ΚΕΦ.2 §32β). A row
       recorded before the rule shows the gap, marked, so the CO can see which
       rows the student still has to complete. */
    const sms = (r.sms || []).map((e) =>
      `<tr><td>${esc(fmtD(e.entrance_date))}</td>
        <td title="${esc((WA.smsReason(e.reason) || {}).el || "")}">${WA.smsReason(e.reason)
          ? esc(WA.smsReasonShort(e))
          : `<span class="itlegacy" title="Recorded before round 8 asked which of the ΚΕΠΕ entry conditions of 3-01 ΚΕΦ.2 §32β it was — the row cannot be saved again until it is chosen">not recorded <span class="k">(legacy)</span></span>`}</td>
        <td>${e.exit_date ? esc(fmtD(e.exit_date)) : `<span class="badge badge-warn">still open</span>`}</td>
        <td>${esc(e.note || "—")}</td>${srcCell(e)}</tr>`);
    /* ROUND 6 — an FPC is conducted by the Squadron CO or the DO. A stored FPC
       naming anybody else is shown as it was written, marked, so the CO can see
       at a glance which rows the student still has to correct. */
    const evalCell = (k, e) => {
      const v = e.evaluator || "";
      if (k !== "fpc" || WA.fpcEvaluatorOK(v || null)) return esc(v || "—");
      return `<span class="itlegacy" title="An FPC is conducted by the ${
        esc(WA.FPC_EVALUATORS.join(" or the "))} — this row was recorded before that rule and cannot be saved again until it is corrected">${
        esc(v)} <span class="k">(legacy)</span></span>`;
    };
    /* ROUND 11 — the FPC RESULT column is now a legacy carrier: it prints what
       is stored, marked, and nothing new can ever appear in it. CEF keeps the
       ordinary field, so the same builder answers differently per section. */
    const resCell = (k, e) => k === "fpc"
      ? (String(e.result || "").trim()
          ? WA.fpcResultNote(e.result)
          : `<span class="k" title="${esc(WA.FPC_RESULT_TIP)}">— <i>(box removed)</i></span>`)
      : esc(e.result || "—");
    const chk = (k) => (r[k] || []).map((e) =>
      `<tr><td><b>${esc(WA.secLabel(k))}</b>${e.flight_code ? " (" + WA.sortieCell(null, e.flight_code) + ")" : ""}</td>
        <td>${evalCell(k, e)}</td>
        <td>${esc(fmtD(e.date))}</td>
        <td>${resCell(k, e)}</td>
        <td class="num">${WA.pct(e.grade)}</td>${srcCell(e)}</tr>`);
    const blk = (k, head, rows, cnt) => `
      <h3 style="margin-top:8px">${esc(WA.secLabel(k))} ${WA.tipDot(k)}
        <span class="cnt">${esc(cnt || (rows.length + " " + (rows.length === 1 ? "entry" : "entries")))}</span></h3>
      ${rows.length ? evTable(head, rows) : `<p class="hint">None reported.</p>`}`;
    return blk("nfs", ["Date", "Reason (form Α0473)", "Note", "Source"], nfs) +
           blk("sms", ["Entrance", "Entry condition (3-01 ΚΕΦ.2 §32β)", "Exit", "Note", "Source"], sms) +
           blk("solo_flights", ["Syllabus slot", "Sortie", "Date", "Grade", "Authorised by", "Source"],
               soloRows(s), soloCount(s)) +
           blk("fpc", ["Entry", "Evaluator", "Date", "Result", "Grade", "Source"], chk("fpc")) +
           blk("cef", ["Entry", "Evaluator", "Date", "Result", "Grade", "Source"], chk("cef"));
  }

  /* ── THE LEVEL CHIP (round 10) ────────────────────────────────────────────
     One assessment, in its own words, coloured by a token scale that descends
     with the levels — and the fifth is NOT an error state. It never wears
     --bad: "Strongly Recommended for Other Assignments" is the squadron
     saying where a pilot belongs, not that something went wrong with him, and
     a red chip would put back on the screen exactly the negative the wording
     was written to keep off it. It gets --hf, a neutral cool token, filled
     like the first level is filled — because both ends of this scale are
     emphatic statements and the hue, not the intensity, says which direction.
     A row with no level is the silence, and says so in words. */
  function levelChip(level, small) {
    const l = WA.level(level);
    if (!l) {
      return `<span class="lvchip lv-none" title="This instructor has submitted, but has not formed a view yet — nothing is assumed on his behalf.">no view yet</span>`;
    }
    return `<span class="lvchip lv-${esc(l.id)}" title="${esc(l.label + " — weight " + l.w)}">${
      esc(small ? l.short : l.label)}<b>${l.w}</b></span>`;
  }

  /* ── THE ASSESSMENT BOX (round 10) ────────────────────────────────────────
     One box where three branch boxes used to be, because there is one question
     now. It prints the WEIGHTED MEAN, then the ARITHMETIC THAT PRODUCED IT —
     "(10×2 + 5×1) ÷ 3 = 8.33" — so the Wing Commander can check the number
     instead of trusting it, then the distribution and the names behind each
     level in scale order.
     ROUND 8'S RULE SURVIVES THE RESHAPE: the two silences are still not the
     same silence, and still get their own sentences. "has submitted without
     forming a view" is a person who looked and did not answer; "has not
     submitted" is a person who has not looked. */
  function assessBox(s, forBrief) {
    const a = s.assessment || { n: 0, sum: 0, mean: null, counts: {}, by_level: {}, no_level: [] };
    const total = s.proposals.length;
    const flew = s.proposals.filter((p) => p.flew_with).length;
    const flewPct = total ? Math.round((flew / total) * 100) : 0;
    /* ROUND 14 — THE SAME RULE THE FORM DRAWS, on the readout. The line sits
       between «Recommended as Alternate» and «Recommended for Other
       Assignments» and marks the FIGHTER / OTHER split, so the CO reading a
       distribution sees the same boundary the instructor answered against —
       and it is drawn from WA.LEVEL_SEP_AT, so the two cannot drift. */
    const rows = LV.map((l, i) => {
      const names = (a.by_level || {})[l.id] || [];
      return (i === WA.LEVEL_SEP_AT
        ? `<div class="lvl-sep" role="separator" title="${esc(
            "Above the line: the three fighter answers. Below it: the two that place the student elsewhere.")}"></div>`
        : "") +
        `<div class="lvrow${names.length ? "" : " is-empty"}">
        ${levelChip(l.id, true)}
        <span class="lvnames" title="${esc(WA.SENIORITY_TIP)}">${names.length ? esc(names.join(", ")) : "—"}</span>
        <span class="lvn">${names.length || ""}</span>
      </div>`;
    }).join("");
    const noView = (a.no_level || []).map((n) =>
      `<li>${esc(n)} has submitted but has not formed a view yet</li>`).join("");
    const noSub = s.not_submitted.map((n) =>
      `<li>${esc(n)} has not submitted an assessment for this student yet</li>`).join("");
    const formula = a.n ? WA.levelFormula(a.counts, a.n) + " = " + WA.meanText(a.mean) : "";
    return `
      <div class="assessbox">
        <div class="asshead">
          <span class="assmean${a.n ? "" : " is-none"}">Ø ${esc(WA.meanText(a.mean))}</span>
          <span class="asssub">${a.n
            ? esc("weighted mean of " + a.n + " assessment" + (a.n === 1 ? "" : "s"))
            : "no assessment yet"}</span>
          ${a.n ? `<span class="assformula" title="the weights are 10 · 8 · 5 · 3 · 1, strongest first">${esc(formula)}</span>` : ""}
        </div>
        ${a.n ? `<div class="assdist">${esc(WA.levelDist(a.counts))}</div>` : ""}
        <div class="lvrows">${rows}</div>
        <div class="stats">${total
          ? total + " submitted · " + flewPct + "% of them flew with this student"
          : "no instructor has submitted yet"}</div>
        ${forBrief
          ? ((a.no_level || []).length
              ? `<div class="assline">Submitted without a view: <b>${esc((a.no_level || []).join(", "))}</b></div>`
              : "")
          : `<ul class="polite">${noView}${noSub}</ul>`}
      </div>`;
  }

  function htmlAnalysis() {
    const students = A.data.students;
    if (!students.length) return `<div class="card"><p class="hint">No active students yet — add them under People &amp; links.</p></div>`;
    const s = students[A.sel];
    const st = s._stats;
    const chips = METRICS.map((m) =>
      `<button type="button" class="chip${m.id === A.metric ? " is-on" : ""}" data-metric="${esc(m.id)}"
        title="${esc((m.tip ? m.tip + " " : "") + "(" + DIRWORD[m.dir] + ")")}">${esc(m.label)}</button>`).join("");
    const drill = s.proposals.length ? `
      <details class="drill"><summary>Drill-down — every assessment of this student (${s.proposals.length})
        <span class="k" title="${esc(WA.SENIORITY_TIP)}">— in seniority order</span></summary>
        <div class="tblwrap" style="margin-top:8px"><table class="tbl">
          <thead><tr><th>Instructor</th><th>Duty</th><th>Leadership</th><th>Status</th>
            <th title="${esc(WA.LEVEL_TIP)}">Assessment (fighters)</th><th class="num">Weight</th>
            <th>Flew with</th><th>Comment</th><th>Source</th></tr></thead>
          <tbody>${WA.sortBySeniority(s.proposals).map((p) => `
            <tr><td><b>${esc(WA.personCall(p, true))}</b>${p.test_pilot ? ` <span class="badge" title="test pilot">TP</span>` : ""}</td>
              <td>${esc(p.duty || "—")}</td><td>${esc(p.leadership || "—")}</td><td>${esc(p.status || "—")}</td>
              <td>${levelChip(p.level)}</td>
              <td class="num">${WA.levelWeight(p.level) === null ? "—" : WA.levelWeight(p.level)}</td>
              <td>${p.flew_with ? "✓" : "—"}</td><td>${esc(p.comment || "")}</td>
              ${srcCell(p)}</tr>`).join("")}
          </tbody></table></div></details>` : "";

    const evOpts = WA.EVALUATIONS.map((d) =>
      `<option value="${esc(d.id)}"${A.evalSel === d.id ? " selected" : ""}>${esc(WA.evalLabel(d.id))}</option>`).join("");

    return `
      <div class="pagelay" id="ana-lay">
      ${WA.navHTML("ana-nav", anaNavItems(), {
          title: "This student", aria: "Sections of this student's analysis" })}
      <div class="lay-main" id="ana-main">
      <div class="ana-nav">
        <button type="button" class="btn arrowbtn" data-nav="-1" title="Previous student (←)">&#8592;</button>
        <span class="pos">${A.sel + 1} / ${students.length}</span>
        <span class="nm">${esc(WA.personName(s.person, true))}</span>
        <button type="button" class="btn arrowbtn" data-nav="1" title="Next student (→)">&#8594;</button>
      </div>
      <div class="card" id="ana-id">
        <div class="idhead">
          <span class="nm">${esc(WA.personName(s.person, true))}</span>
          <span class="meta">${esc([s.person.mn ? "MN " + s.person.mn : "", s.person.class ? "Class " + s.person.class : ""].filter(Boolean).join(" · "))}</span>
          <span class="lastupd">Self-report: <b>${s.completion.has_record ? esc(fmtDT(s.last_update)) : "not submitted"}</b></span>
          ${st.legacy ? `<span class="badge badge-bad"
            title="Entries recorded on an earlier version of the form. They are readable everywhere; the student is asked to complete them, and the round-6 rules refuse the next save until they are."
            >${st.legacy} entr${st.legacy === 1 ? "y" : "ies"} to correct</span>` : ""}
          ${s._src.any ? `<span class="badge badge-acc" title="${esc(s._src.tip)}">${
            s._src.all ? (s._src.total ? "record entered by CO" : "record opened by CO")
                       : s._src.n + " entr" + (s._src.n === 1 ? "y" : "ies") + " entered by CO"}</span>` : ""}
          <button type="button" class="btn btn-sm" data-editrec="${esc(s.person.id)}"
            title="Open this student's form and enter data on their behalf — every entry is tagged 'entered by CO'"
            >&#9998; Edit record</button>
        </div>
      </div>
      <div class="card" id="ana-cmp">
        <h2>Comparison vs class</h2>
        <p class="hint">Click a metric — the chart shows this student against the class best, worst and average.
          Every count is derived from the student's dated entries.</p>
        <div class="chiprow" style="margin:10px 0">${chips}</div>
        <div class="chartbox">${fourBarSVG(s)}</div>
      </div>
      <div class="card" id="ana-eval">
        <h2>Evaluations ${WA.tipDot("evaluations")}</h2>
        <p class="hint">Evaluations are separate events, so they are compared <b>one checkride at a time</b> —
          never as an average, and never as a count. A re-flown checkride counts with the attempt the
          flight was characterised <b>successful</b> on
          <span class="tipdot" tabindex="0" role="note" title="${esc(WA.PASS_ATTEMPT_TIP)}"
            aria-label="${esc(WA.PASS_ATTEMPT_TIP)}">&#9432;</span>.</p>
        <div class="toolrow" style="margin:10px 0 8px">
          <label class="f" style="max-width:340px"><span>Compare on this evaluation</span>
            <select id="evalsel">${evOpts}</select></label>
        </div>
        <div class="chartbox">${evalCompare(s)}</div>

        ${/* ROUND 11 — ONE CHART, ALL EIGHT. The four per-category tabs are
             gone with the heading that named them: what the CO asked to see is
             the whole stage in one line, and the track now rides in the colour
             of the x label. */ ""}
        <h3 style="margin-top:16px">Grades — the eight checkrides</h3>
        <p class="hint">Every checkride of the stage on one line, in syllabus order, with the class
          average as the faint dashed reference. The <b>x label is coloured by track</b>; a
          checkride nobody has flown yet is a gap. Click a point to find it in the table below.</p>
        <div class="chartbox" id="catplot">${catPlotSVG(s, "eval")}</div>
        ${evalLegend()}

        ${/* ── WHY THE FPC IS ITS OWN BLOCK AND NOT A FIFTH COLOUR ──────────
             The eight checkrides share an x axis because the SYLLABUS gives
             them one: C4590 is before C4790 for every student in the squadron,
             for ever. An FPC has no such position — it happens when a referral
             case happens — so putting FPC #1 and FPC #2 on the same axis would
             invent an order the flights do not have and, worse, would put one
             student's FPC #2 above another student's FPC #2 as though the two
             were the same event. It keeps the axis it can honestly have (date
             order, numbered), on its own, directly below — visible in the same
             glance, which a toggle would not be. */ ""}
        <h3 style="margin-top:16px">FPC ${WA.tipDot("fpc")}
          <span class="cnt">${st.fpc} ${st.fpc === 1 ? "entry" : "entries"}</span></h3>
        <p class="hint">Its own plot, because an FPC has no position in the syllabus: the eight
          checkrides above share an x axis the stage gives them, and an FPC has none. Numbered in
          date order.</p>
        <div class="chartbox" id="fpcplot">${catPlotSVG(s, "fpc")}</div>

        <h3 style="margin-top:16px">Summary — every evaluation and FPC of this student</h3>
        ${evalSummary(s)}
      </div>
      <div class="card" id="ana-fail">
        <h2>FAIL &amp; ALMOST GOOD</h2>
        <h3>${esc(WA.secLabel("fail"))} ${WA.tipDot("fail")}
          <span class="cnt">${st.fail} ${st.fail === 1 ? "entry" : "entries"}</span></h3>
        ${failTable(s, "fail")}
        <h3 style="margin-top:10px">${esc(WA.secLabel("almost_good"))} ${WA.tipDot("almost_good")}
          <span class="cnt">${st.almost_good} ${st.almost_good === 1 ? "entry" : "entries"}</span></h3>
        ${failTable(s, "almost_good")}
      </div>
      <div class="card" id="ana-air">
        <h2>Airsickness ${WA.tipDot("airsickness")}
          <span class="cnt">${st.airsickness} ${st.airsickness === 1 ? "entry" : "entries"}</span></h2>
        <p class="hint">When each incident happened and with whom.</p>
        ${airsickTable(s)}
      </div>
      <div class="card" id="ana-other">
        <h2>Other dated entries</h2>
        ${otherTables(s)}
      </div>
      ${/* ROUND 12 — THE LOG TABLES, at the end, in the form's own order.
           A grade left empty is NOT a gap in this table: it is a flight whose
           debrief has not landed, and the cell says so. */ ""}
      <div class="card" id="ana-flights">
        ${logBandBlock(s, "flights")}
      </div>
      <div class="card" id="ana-fs">
        ${logBandBlock(s, "fs")}
      </div>
      <div class="card" id="ana-ground">
        <h2>${esc(WA.secLabel("lessons"))} ${WA.tipDot("lessons")}
          <span class="cnt">${esc(WA.stateLine("lessons",
            WA.stateCounts("lessons", s.record.lessons)))}</span></h2>
        ${stateLegend()}
        ${lessonsTable(s)}
        <h2 style="margin-top:14px">${esc(WA.secLabel("exams"))} ${WA.tipDot("exams")}
          <span class="cnt">${esc(WA.stateLine("exams",
            WA.stateCounts("exams", s.record.exams)))}</span></h2>
        ${examsTable(s)}
      </div>
      <div class="card" id="ana-assess">
        <h2>Assessment for fighters</h2>
        <p class="hint">${esc(WA.LEVEL_TIP)}</p>
        ${assessBox(s, false)}
        ${drill}
      </div>
      </div>
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
          ${s._src.any ? ` · ${WA.coRecordTag(s._src)} ${esc(s._src.all
            ? "record entered by the CO"
            : s._src.n + (s._src.n === 1 ? " entry" : " entries") + " entered by the CO")}` : ""}</div>
        <div class="card"><div class="kgrid">
          <span><span class="k">Solos</span> <b>${st.solos}</b></span>
          <span><span class="k">NFS</span> <b>${st.nfs}</b></span>
          <span><span class="k">SMS</span> <b>${st.sms}</b></span>
          <span><span class="k">FAIL</span> <b>${st.fail}</b></span>
          <span><span class="k">Almost Good</span> <b>${st.almost_good}</b></span>
          <span><span class="k">Airsickness</span> <b>${st.airsickness}</b></span>
          <span title="${esc(WA.secTip("fpc"))}"><span class="k">FPC</span> <b>${st.fpc}</b></span>
          <span title="${esc(WA.secTip("cef"))}"><span class="k">CEF</span> <b>${st.cef}</b></span>
        </div></div>
        <div class="card b-detail">
          <div class="kline"><span class="k">Evaluations</span>
            ${s._evalSlots.slots.map((sl) => sl.row
              ? `<b>${esc(sl.def.id)}</b> ${WA.pct(sl.row.grade)}${
                  sl.row.with ? " <span class='k'>with " + esc(sl.row.with) + "</span>" : ""}${
                  WA.coTag(sl.row)}`
              : `<span class="k">${esc(sl.def.id)} not flown</span>`).join(" · ")}
            ${s._evalSlots.extras.length
              ? ` · <span class="k">${s._evalSlots.extras.length} imported, not identified</span>` : ""}</div>
          <div class="kline"><span class="k">Solo flights</span>
            <span class="k">${esc(soloCount(s))}</span>
            ${/* ROUND 6 — the instructor rides on every flown solo, NG included
                 (there he is the one who AUTHORISED it), so the brief names him */ ""}
            ${st.solos ? " — " + WA.filled("solo_flights", s.record.solo_flights).map((e) =>
              `<b>${esc(e.slot ? (WA.soloSlot(e.slot) || {}).sec || e.slot : "extra")}</b> ` +
              esc(fmtD(e.date)) + (e.ng ? " <span class='k'>NG</span>" : " <b>" + WA.pct(e.grade) + "</b>") +
              " " + WA.soloWhoPhrase(e) +
              WA.coTag(e)).join(" · ")
              : ""}</div>
          ${/* ROUND 12 — the flight log, as ONE line the brief can carry: per
               track, how many were flown, how many hours, and how many are
               still waiting for a grade. The rows themselves are in the CO's
               drill-down; what a brief needs is the shape of the log. */ ""}
          ${["flights", "fs"].map((k) => {
            const list = Array.isArray(s.record[k]) ? s.record[k] : [];
            const lag = list.filter(WA.awaitingDebrief).length;
            const hrs = list.reduce((a, e) => a + (isFinite(Number(e.duration)) ? Number(e.duration) : 0), 0);
            /* ROUND 13 — and how much of the syllabus is STILL OWED. A brief
               that said only what was flown could never answer the question the
               CO actually asks of it: how far through the stage is this one. */
            const cn = WA.stateCounts(k, list);
            return `<div class="kline"><span class="k">${esc(WA.secLabel(k))}</span>
              ${list.length
                ? WA.TRACKS.map((t) => {
                    const n = list.filter((e) => (e.track || "") === t).length;
                    return n ? `<b>${esc(WA.itemCatLabel(t))}</b> ${esc(n)}` : "";
                  }).filter(Boolean).join(" · ") +
                  (hrs > 0 ? ` <span class="k">· ${esc(Math.round(hrs * 10) / 10)} h</span>` : "") +
                  ` <span class="k" title="${esc("The printed flow chart prescribes " +
                    WA.slotCount(k) + " sorties here; " + cn.done + " are complete, " + cn.started +
                    " started and " + cn.owed + " have nothing recorded against them yet" +
                    (cn.extra ? " (" + cn.extra + " extra beyond the planned pass)" : ""))
                    }">· ${esc(cn.owed)} of ${esc(WA.slotCount(k))} owed</span>` +
                  (lag ? ` <span class="k" title="Flown, and the debrief has not landed yet — the grade is genuinely not known, not missing">· ${esc(lag)} awaiting a grade</span>` : "") +
                  /* ROUND 12b — a mission the squadron recorded as INCOMPLETE
                     is the one thing in this log a brief must not swallow */
                  ((() => {
                    const bad = list.filter((e) => WA.rowMission(e) === "incomplete").length;
                    return bad ? ` <span class="k" title="Flights whose mission was not completed — read from the grade where there is one, said by the squadron where there is not">· ${esc(bad)} incomplete</span>` : "";
                  })())
                : `<span class="k">none recorded &mdash; all ${esc(WA.slotCount(k))} of the syllabus owed</span>`}</div>`;
          }).join("")}
          ${/* ROUND 13 — the ground programme has a denominator too: 47 courses
                and 8 exams, all of them owed on day one */ ""}
          <div class="kline"><span class="k">Ground</span>
            ${(() => {
              const cl = WA.stateCounts("lessons", s.record.lessons);
              const cx = WA.stateCounts("exams", s.record.exams);
              /* ROUND 14 — slotsDone, not done: an exam sat three times is ONE
                 exam done, and «9 of 8» would be the arithmetic saying so */
              return `<b>${esc(cl.slotsDone)}</b> of ${esc(WA.slotCount("lessons"))} lessons` +
                (cl.started ? ` <span class="k">(+${esc(cl.started)} started)</span>` : "") +
                ` · <b>${esc(cx.slotsDone)}</b> of ${esc(WA.slotCount("exams"))} exams` +
                (cx.lag ? ` <span class="k">· ${esc(cx.lag)} awaiting a result</span>` : "") +
                (cl.extra + cx.extra ? ` <span class="k">· ${esc(cl.extra + cx.extra)} extra</span>` : "");
            })()}</div>
          ${["fail", "almost_good"].map((k) => {
            const list = s.record[k] || [];
            /* one sub-line per entry: the items inside an entry are already
               separated by · , so entries must not be */
            return `<div class="kline"><span class="k">${esc(WA.secLabel(k))}</span>
              ${list.length ? list.map((e) => `<div class="sub">${esc(fmtD(e.date))}` +
                (e.flight_code ? " <b>" + WA.sortieCell(e.category, e.flight_code) + "</b>" : "") + " " +
                WA.itemsLabelHTML(e) +
                WA.itemsCountHTML(e) +
                (e.grade === null || e.grade === undefined ? "" : " <b>" + WA.pct(e.grade) + "</b>") +
                (e.instructor ? " <span class='k'>with " + esc(e.instructor) + "</span>" : "") +
                WA.coTag(e) + `</div>`).join("")
                : "<span class='k'>none reported</span>"}</div>`;
          }).join("")}
          <div class="kline"><span class="k">Airsickness</span>
            ${(s.record.airsickness || []).length ? (s.record.airsickness || []).map((e) =>
              esc(fmtD(e.date)) +
              (e.flight_code ? " <b>" + WA.sortieCell(null, e.flight_code) + "</b>" : "") +
              (e.instructor ? " <span class='k'>with " + esc(e.instructor) + "</span>" : "") +
              (e.phase ? ` <span class='k' title="the phase-of-flight note this form collected before round 6">(legacy: ${esc(e.phase)})</span>` : "") +
              WA.coTag(e)).join(" · ")
              : "<span class='k'>none reported</span>"}</div>
          ${["fpc", "cef"].map((k) => {
            const list = s.record[k] || [];
            /* "FPC (C4590) — DO — 12/08/2026" — the line the CO asked for */
            return `<div class="kline"><span class="k">${esc(WA.secLabel(k))}</span>
              ${list.length ? list.map((e) => `<div class="sub">${WA.checkLineHTML(k, e)}` +
                (e.grade === null || e.grade === undefined ? "" : " <b>" + WA.pct(e.grade) + "</b>") +
                /* ROUND 11 — the FPC's stored result is a legacy note, and the
                   brief marks it as one; the CEF's is still its own field */
                (k === "fpc" ? WA.fpcResultNote(e.result)
                             : (e.result ? " <span class='k'>" + esc(e.result) + "</span>" : "")) +
                WA.coTag(e) + `</div>`).join("")
                : "<span class='k'>none reported</span>"}</div>`;
          }).join("")}
          <div class="kline"><span class="k">SMS</span>
            ${(s.record.sms || []).length ? (s.record.sms || []).map((e) =>
              esc(fmtD(e.entrance_date)) + " <span class='k'>" + esc(WA.smsReasonLabel(e)) + "</span>" +
              (e.exit_date ? " <span class='k'>→ " + esc(fmtD(e.exit_date)) + "</span>"
                           : " <span class='k'>still open</span>") +
              WA.coTag(e)).join(" · ")
              : "<span class='k'>none reported</span>"}</div>
          <div class="kline"><span class="k">NFS</span>
            ${(s.record.nfs || []).length ? (s.record.nfs || []).map((e) =>
              esc(fmtD(e.date)) + " <span class='k'>" + esc(WA.nfsReasonLabel(e)) + "</span>" +
              WA.coTag(e)).join(" · ")
              : "<span class='k'>none reported</span>"}</div>
        </div>
        ${assessBox(s, true)}
      </div>`;
  }

  /* ════════ PRINT (page per student + class summary) ════════ */
  function buildPrint() {
    const holder = $("print-brief");
    if (!holder || !A.data) return;
    const students = A.data.students;
    const pages = students.map((s) => {
      const st = s._stats;
      /* ROUND 10 — ON PAPER THE LEVEL IS THE SENTENCE, NEVER A COLOUR. The
         screen chips carry a token scale; a printed brief is monochrome, so
         every row here says the level in full words and shows its weight and
         its count. Nothing about this table needs a printer to be honest. */
      const ass = s.assessment || { n: 0, sum: 0, mean: null, counts: {}, by_level: {}, no_level: [] };
      const levelRows = LV.map((l) => {
        const names = (ass.by_level || {})[l.id] || [];
        return `<tr${names.length ? "" : ' class="is-unflown"'}>
          <td><b>${esc(l.label)}</b></td><td>${l.w}</td>
          <td>${names.length || "—"}</td>
          <td>${esc(names.join(", ") || "—")}</td></tr>`;
      }).join("");
      /* the two silences, still each in its own words (round 8's rule, kept) */
      const politeAll = (ass.no_level || []).map((n) =>
        `<li>${esc(n)} has submitted but has not formed a view yet</li>`).join("") +
        s.not_submitted.map((n) => `<li>${esc(n)} has not submitted an assessment for this student yet</li>`).join("");
      /* round 14 — the printed comments are in seniority order too */
      const comments = WA.sortBySeniority(s.proposals).filter((p) => p.comment).map((p) =>
        `<li><b>${esc((p.rank ? p.rank + " " : "") + p.last_name)}:</b> ${esc(p.comment)}</li>`).join("");
      const prT = (head, rows) => rows.length
        ? `<table class="pr-t"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
           <tbody>${rows.join("")}</tbody></table>`
        : `<p class="pr-none">None reported.</p>`;
      /* the CO tag rides in the first cell of every printed row — small, and
         it costs the table no extra column (round-4 W2c) */
      /* the eight checkrides, always all eight — a printed brief that omits
         the ones nobody has flown hides half the picture (round 5) */
      const evRows = s._evalSlots.slots.map((sl) => {
        const e = sl.row;
        return `<tr${e ? "" : ' class="is-unflown"'}>
          <td>${esc(sl.def.id + " — " + sl.def.name)}${e ? WA.coTag(e) : ""}</td>
          <td>${e ? esc(e.with || "—") : "not flown yet"}</td><td>${WA.pct(e ? e.grade : null)}</td>
          <td>${e ? esc(fmtD(e.date)) : "—"}</td></tr>`;
      }).concat(s._evalSlots.extras.map((e) =>
        `<tr><td>(not identified — imported)${WA.coTag(e)}</td>
          <td>${esc(e.with || "—")}</td><td>${WA.pct(e.grade)}</td>
          <td>${esc(fmtD(e.date))}</td></tr>`));
      const fgRows = (k) => (s.record[k] || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td><td>${esc(WA.itemCatLabel(e.category))}</td>
          <td>${esc(e.flight_code || "—")}</td>
          <td>${esc(WA.itemsLabel(e))}${WA.itemsCountHTML(e, "pr-n")}</td>
          <td>${esc(e.instructor || "—")}</td>
          <td>${WA.pct(e.grade)}</td></tr>`);
      /* ROUND 6 — the printed airsickness table names the FLIGHT; a row that
         still carries the retired note prints it marked "legacy", so paper
         says exactly what the screen says */
      const asRows = (s.record.airsickness || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td>
          <td>${esc(e.flight_code || "—")}${e.phase
            ? ` <span class="pr-n">(legacy note: ${esc(e.phase)})</span>` : ""}</td>
          <td>${esc(e.instructor || "—")}</td></tr>`);
      /* the solos as the syllabus prescribes them: every slot, flown or not */
      const soloBySlot = {};
      for (const e of (s.record.solo_flights || [])) if (e.slot) soloBySlot[e.slot] = e;
      const soRows = WA.soloSlots().map((sl) => {
        const e = soloBySlot[sl.id];
        const flown = !!e && !WA.slotEmpty("solo_flights", e);
        return `<tr${flown ? "" : ' class="is-unflown"'}>
          <td>${esc(sl.sec + (sl.of > 1 ? " (solo " + sl.n + " of " + sl.of + ")" : "") +
                    (sl.req ? " — required" : ""))}${flown ? WA.coTag(e) : ""}</td>
          <td>${esc(flown && e.sortie ? e.sortie : sl.codes.join(" / "))}</td>
          <td>${flown ? esc(fmtD(e.date)) : "not flown yet"}</td>
          <td>${!flown ? "—" : (e.ng ? "NG (non-graded)" : WA.pct(e.grade))}</td>
          <td>${!flown ? "—" : esc(WA.soloWho(e))}</td></tr>`;
      }).concat((s.record.solo_flights || []).filter((e) => !e.slot || !WA.soloSlot(e.slot)).map((e) =>
        `<tr><td>additional solo${WA.coTag(e)}</td><td>${esc(e.sortie || "—")}</td>
          <td>${esc(fmtD(e.date))}</td>
          <td>${e.ng ? "NG (non-graded)" : WA.pct(e.grade)}</td>
          <td>${esc(WA.soloWho(e))}</td></tr>`));
      /* ROUND 6 — an FPC is conducted by the Squadron CO or the DO. Colour is
         not available on paper, so a row from before that rule says so in
         words, exactly as the screen marks it */
      const ckRows = (k) => (s.record[k] || []).map((e) =>
        `<tr><td>${esc(WA.checkTitle(k, e))}${WA.coTag(e)}</td>
          <td>${esc(e.evaluator || "—")}${k === "fpc" && !WA.fpcEvaluatorOK(e.evaluator || null)
            ? ` <span class="pr-n">(legacy — an FPC is conducted by the ${
                esc(WA.FPC_EVALUATORS.join(" or the "))})</span>` : ""}</td>
          <td>${esc(fmtD(e.date))}</td>
          <td>${k === "fpc"
            ? (String(e.result || "").trim()
                ? esc(e.result) + ` <span class="pr-n">(legacy note — the FPC result box was
                    removed in round 11; the grade against the printed scale is the result)</span>`
                : `<span class="pr-n">—</span>`)
            : esc(e.result || "—")}</td>
          <td>${WA.pct(e.grade)}</td></tr>`);
      const nfsRows = (s.record.nfs || []).map((e) =>
        `<tr><td>${esc(fmtD(e.date))}${WA.coTag(e)}</td><td>${esc(WA.nfsReasonShort(e))}</td>
          <td>${esc(e.note || "—")}</td></tr>`);
      const smsRows = (s.record.sms || []).map((e) =>
        `<tr><td>${esc(fmtD(e.entrance_date))}${WA.coTag(e)}</td>
          <td>${WA.smsReason(e.reason) ? esc(WA.smsReasonShort(e))
            : `<span class="pr-n">not recorded (legacy)</span>`}</td>
          <td>${e.exit_date ? esc(fmtD(e.exit_date)) : "still open"}</td>
          <td>${esc(e.note || "—")}</td></tr>`);
      /* ROUND 12 — the log tables on paper, one block per (band, track), and
         only the tracks that hold something: a brief with eight empty tables in
         it is a brief nobody reads to the end. */
      const logGradeWord = (e) => {
        if (e.ng) return "NG (non-graded)";
        if (e.grade !== null && e.grade !== undefined && e.grade !== "" && isFinite(Number(e.grade))) {
          return WA.pct(e.grade);
        }
        /* ROUND 12b — A ROW WHOSE MISSION IS SET IS NOT WAITING FOR ANYTHING.
           The squadron characterised the flight; what it never wrote down is
           the percentage, and saying "awaiting debrief" here would put a chase
           on a brief for a flight nobody is chasing. */
        if (!WA.awaitingDebrief(e)) return `<span class="pr-n">no percentage recorded</span>`;
        return `<span class="pr-n">awaiting debrief${(() => {
          const n = WA.daysAgo(e.date); return n === null ? "" : " — flown " + n + " d ago";
        })()}</span>`;
      };
      /* ROUND 12b — the mission IN WORDS, and where it came from. Paper is
         monochrome: a chip cannot say "read from the grade", so the cell does. */
      const logMissionWord = (e) => {
        if (e.ng) return `<span class="pr-n">not scorable</span>`;
        const m = WA.rowMission(e);
        if (!m) return `<span class="pr-n">—</span>`;
        /* where it is READ from the number, paper says so — it cannot hover.
           Where it was said by the squadron the Grade cell beside it already
           reads "no percentage recorded", so the label stands alone. */
        return esc(WA.missionLabel(m)) +
          (WA.missionDerived(e) ? ` <span class="pr-n">(read from the grade)</span>` : "");
      };
      /* ROUND 13 ON PAPER — the four states are WORDS here, and the OWED rows
         are not printed one by one. A photocopied brief of 180 empty lines is
         not a brief; what paper needs is the arithmetic — "9 done · 2 started ·
         66 owed · 1 extra" in the section heading — and the state word on each
         row that exists. The screen carries the colour; the paper carries the
         count and the word, and they are the same four words. */
      const logPrint = ["flights", "fs"].map((k) => WA.TRACKS.map((t) => {
        const all = Array.isArray(s.record[k]) ? s.record[k] : [];
        const list = WA.slotRows(k, all, t).filter((r) => r.e);
        if (!list.length) return "";
        const cn = WA.stateCounts(k, all, t);
        const rws = list.map((r) => { const e = r.e; return `<tr>
          <td>${esc(e.sortie || "—")}${WA.coTag(e)}${
            e.kind && e.kind !== "syllabus" ? ` <span class="pr-n">(${esc(WA.flightKindLabel(e.kind))})</span>` : ""}${
            Number(e.seq || 1) > 1 ? ` <span class="pr-n">(same-day re-fly #${esc(Number(e.seq))})</span>` : ""}</td>
          <td>${esc(fmtD(e.date))}</td>
          <td>${esc(e.instructor || "—")}</td>
          <td>${e.duration === null || e.duration === undefined || e.duration === "" ? "—" : esc(e.duration)}</td>
          <td>${logGradeWord(e)}</td>
          <td>${logMissionWord(e)}</td>
          <td>${esc(WA.rowStateDef(r.state).label)}</td></tr>`; });
        return `<div class="pr-sec">${esc(WA.secLabel(k))} — ${esc(WA.itemCatLabel(t))}
            (${esc(WA.stateLine(k, cn))})</div>
          ${prT(["Flight", "Date", "Instructor", "Hours", "Grade", "Mission", "State"], rws)}`;
      }).join("")).join("");
      const lessonCn = WA.stateCounts("lessons", s.record.lessons);
      const lessonRows = WA.slotRows("lessons", s.record.lessons).filter((r) => r.e).map((r) => {
        const e = r.e, c = WA.lessonCourse(e.group, e.course);
        return `<tr><td>${esc(e.group || "—")}${WA.coTag(e)}</td>
          <td>${esc(e.course || "—")}${c ? "" : (e.course ? ` <span class="pr-n">(off-catalogue)</span>` : "")}</td>
          <td>${e.date
            ? esc(fmtD(e.date)) + (e.end_date && e.end_date !== e.date ? " – " + esc(fmtD(e.end_date)) : "")
            : (e.end_date ? "ended " + esc(fmtD(e.end_date)) : "—")}</td>
          <td>${esc(WA.rowStateDef(r.state).label)}</td></tr>`;
      });
      const examCn = WA.stateCounts("exams", s.record.exams);
      const examRows = WA.slotRows("exams", s.record.exams).filter((r) => r.e).map((r) => {
        const e = r.e;
        const has = e.grade !== null && e.grade !== undefined && e.grade !== "" && isFinite(Number(e.grade));
        /* ROUND 14 ON PAPER — the trial and the ΕΕΘ number are part of the row's
           NAME (WA.examRowLabel), because monochrome print has no badge colour
           to tell a re-sit from the first sitting with */
        const ser = WA.examSeries(e);
        return `<tr><td>${esc(WA.examRowLabel(e))}${WA.coTag(e)}${
            ser ? ` <span class="pr-n">(weekly theory)</span>` : ""}${
            !ser && r.alt ? ` <span class="pr-n">(not the operative attempt)</span>` : ""}${
            (WA.exam(e.exam) || {}).cond ? ` <span class="pr-n">(foreign SPs only)</span>` : ""}</td>
          <td>${e.date ? esc(fmtD(e.date)) : `<span class="pr-n">not sat yet</span>`}</td>
          ${/* an exam nobody has sat is not "awaiting" a result — it is waiting
               to happen, and the Date cell beside this one already says so */ ""}
          <td>${has ? WA.pct(e.grade)
            : (e.date ? `<span class="pr-n">awaiting the result</span>` : `<span class="pr-n">&mdash;</span>`)}</td>
          <td>${esc(WA.rowStateDef(r.state).label)}</td></tr>`;
      });
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
            · assessments in: ${ass.n}/${s.completion.instructors_total}</div>
          <div class="pr-sec">Reported record — counts derived from the dated entries</div>
          <table class="pr-t"><thead><tr><th>Solos</th><th>NFS</th>
            <th>SMS</th><th>FAIL</th><th>Almost Good</th><th>Airsick</th><th>FPC</th><th>CEF</th></tr></thead>
            <tbody><tr>
              <td>${st.solos}</td><td>${st.nfs}</td><td>${st.sms}</td><td>${st.fail}</td>
              <td>${st.almost_good}</td><td>${st.airsickness}</td><td>${st.fpc}</td>
              <td>${st.cef}</td></tr></tbody></table>
          <div class="pr-sec">Evaluations (syllabus order)</div>
          ${prT(["Evaluation", "With whom", "Grade", "Date"], evRows)}
          <div class="pr-sec">FAIL</div>
          ${prT(["Date", "Track", "Flight", "Items", "Instructor", "Grade"], fgRows("fail"))}
          <div class="pr-sec">ALMOST GOOD</div>
          ${prT(["Date", "Track", "Flight", "Items", "Instructor", "Grade"], fgRows("almost_good"))}
          <div class="pr-sec">Airsickness — when, on which flight and with whom</div>
          ${prT(["Date", "Flight", "With whom"], asRows)}
          <div class="pr-sec">Solo flights — the syllabus slots (${esc(soloCount(s))})</div>
          ${prT(["Syllabus slot", "Sortie", "Date", "Grade", "Authorised by"], soRows)}
          <div class="pr-sec">NFS — Φύλλο μη Πτήσης (reason per form Α0473)</div>
          ${prT(["Date", "Reason", "Note"], nfsRows)}
          <div class="pr-sec">SMS — ΚΕΠΕ (entry condition per 3-01 ΚΕΦ.2 §32β)</div>
          ${prT(["Entrance", "Entry condition", "Exit", "Note"], smsRows)}
          <div class="pr-sec">FPC — Δοκιμή Προόδου (flight progress check)</div>
          ${prT(["Entry", "Evaluator", "Date", "Result", "Grade"], ckRows("fpc"))}
          <div class="pr-sec">CEF — Εξέταση Καταλληλότητας (Squadron Evaluator)</div>
          ${prT(["Entry", "Evaluator", "Date", "Result", "Grade"], ckRows("cef"))}
          ${/* ROUND 12 — THE LOG TABLES ON PAPER. Paper is monochrome, so the
               debrief lag and a mission-with-no-number are printed IN WORDS
               rather than as a colour or a blank: a photocopied brief that
               showed an empty Grade cell for a flight the squadron recorded as
               an INCOMPLETE mission would hide exactly what it exists to
               show — and where the mission is read from the grade, the cell
               says so, because paper cannot hover. */ ""}
          ${logPrint}
          <div class="pr-sec">Ground lessons — the theory groups and their courses
            (${esc(WA.stateLine("lessons", lessonCn))})</div>
          ${lessonRows.length ? prT(["Group", "Course", "Dates", "State"], lessonRows)
            : `<div class="pr-n">Nothing recorded yet — all ${esc(WA.slotCount("lessons"))} courses of the programme are owed.</div>`}
          <div class="pr-sec">Ground exams (${esc(WA.stateLine("exams", examCn))})</div>
          ${examRows.length ? prT(["Exam", "Date", "Grade", "State"], examRows)
            : `<div class="pr-n">Nothing recorded yet — all ${esc(WA.slotCount("exams"))} ground exams are owed.</div>`}
          <div class="pr-sec">Assessment for fighters — weighted mean ${
            ass.n ? esc(WA.levelFormula(ass.counts, ass.n) + " = " + WA.meanText(ass.mean))
                  : "no assessment submitted yet"}</div>
          <table class="pr-t"><thead><tr><th>Level</th><th>Weight</th><th>Count</th>
            <th>Instructors</th></tr></thead>
            <tbody>${levelRows}</tbody></table>
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
    /* ROUND 10 — THE CLASS RANKS ON THE WEIGHTED MEAN. The round-8 branch
       SUMS rewarded being talked about: four instructors placing a student
       second out-scored two placing another first. With one assessment per
       instructor the mean is the comparable number, and a student nobody has
       assessed yet has no number at all — he sorts last rather than at zero,
       because "not asked about" is not the same as "placed at the bottom". */
    const summary = Object.keys(classes).sort().map((cls) => {
      const mn = (x) => (x.assessment && x.assessment.n) ? x.assessment.mean : null;
      const list = classes[cls].slice().sort((a, b) => {
        const ma = mn(a), mb2 = mn(b);
        if (ma === null && mb2 === null) return 0;
        if (ma === null) return 1;
        if (mb2 === null) return -1;
        return mb2 - ma;
      });
      return `
        <div class="pr-sec">Class ${esc(cls)} — summary ranking (weighted mean of the five-level
          assessment for fighters; weights 10 · 8 · 5 · 3 · 1)</div>
        <p class="pr-src">Records: ${esc(sourceLine(list))}
          — &ldquo;CO&rdquo; marks a record the squadron CO entered in full,
          &ldquo;+N CO&rdquo; a self-reported record he added N entries to.</p>
        <table class="pr-t"><thead><tr><th>#</th><th>Student</th>
          <th>Ø mean</th><th>Distribution</th><th>Assessments in</th>
          <th>FAIL</th><th>Almost Good</th><th>FPC</th><th>CEF</th></tr></thead><tbody>
          ${list.map((s, i) => {
            const a = s.assessment || { n: 0, counts: {}, mean: null };
            return `<tr><td>${i + 1}</td><td><b>${esc(WA.personName(s.person, true))}</b>${
                WA.coRecordTag(s._src)}</td>
              <td><b>${esc(WA.meanText(a.mean))}</b></td>
              <td>${esc(WA.levelDist(a.counts) || "—")}</td>
              <td>${a.n}/${s.completion.instructors_total}</td>
              <td>${s._stats.fail}</td><td>${s._stats.almost_good}</td>
              <td>${s._stats.fpc}</td><td>${s._stats.cef}</td></tr>`;
          }).join("")}</tbody></table>`;
    }).join("");

    /* one row per student per evaluation — the same-checkride comparison on
       paper. ROUND 11: the cell is the PASS ATTEMPT, and a slot that has been
       flown without passing prints its number followed by an asterisk, which
       the caption explains. Paper is monochrome, so the hollow ring the screen
       draws has to become a mark that survives a photocopier. */
    const evalMatrix = `
      <div class="pr-sec">Evaluations — every student on the same checkride
        (the attempt the flight was characterised successful on)</div>
      <table class="pr-t"><thead><tr><th>Student</th>
        ${WA.EVALUATIONS.map((d) => `<th>${esc(d.id)}</th>`).join("")}</tr></thead><tbody>
        ${students.map((s) => `<tr><td><b>${esc(WA.personName(s.person, true))}</b></td>
          ${WA.EVALUATIONS.map((d) => {
            const op = WA.evalOperativeOf(s._evals, d.id);
            const r = op.row;
            return `<td>${WA.pct(r ? r.grade : null)}${
              r && r.grade !== null && !op.passed ? "*" : ""}${r ? WA.coTag(r) : ""}</td>`;
          }).join("")}</tr>`).join("")}
        <tr><td><b>Class average</b></td>
          ${WA.EVALUATIONS.map((d) => {
            const vs = students.map((s) => WA.evalGrade(s._evals, d.id))
              .filter((v) => v !== null);
            return `<td>${vs.length ? esc(round1(vs.reduce((a, b) => a + b, 0) / vs.length)) + "%" : "—"}</td>`;
          }).join("")}</tr>
      </tbody></table>
      <p class="pr-src">A grade marked <b>*</b> did not pass: the checkride has been flown and no
        attempt reached 60 % (ΠΔ 151/13 — ΣΚ 50-59 % is ΥΣΤΕΡΗΣΗ, Ε 0-49 % is ΑΠΟΤΥΧΙΑ). Where a
        checkride was re-flown, the grade printed is the successful attempt; the earlier attempts are
        in the student's own page above and count for nothing here.</p>`;

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
        : [p.duty, p.leadership, p.status, p.country].filter(Boolean).join(" · ");
      return `
        <tr>
          <td><b>${esc(WA.personName(p, true))}</b>${WA.rosterTags(p)}</td>
          <td>${esc(extra || "—")}</td>
          <td>${p.active ? `<span class="badge badge-good">active</span>` : `<span class="badge badge-bad">revoked</span>`}</td>
          <td class="linkcell">…${esc(String(p.token).slice(-8))}</td>
          <td style="white-space:nowrap">
            <button type="button" class="btn btn-sm" data-copy="${esc(p.token)}" title="Copy this person's private link">Copy link</button>
            <button type="button" class="btn btn-sm" data-edit="${esc(p.id)}">Edit</button>
            ${kind === "instructor" && p.active
              ? `<button type="button" class="btn btn-sm" data-editprop="${esc(p.id)}"
                   title="Open this instructor's assessment form and fill it in on their behalf — every assessment is tagged 'entered by CO'"
                   >&#9998; Enter assessments as…</button>` : ""}
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
    /* ROUND 14 — the instructors block is in SENIORITY order: «HAF πρωτα, ITAF
       μετα», call sign natural within each. admin_list_people already sends it
       that way (wa.seniority_key); the same comparator runs here so the table
       holds the order whatever the instance's schema version. */
    const ins = WA.sortBySeniority(ppl.filter((p) => p.role === "instructor"));
    const adm = ppl.filter((p) => p.role === "admin");
    return `
      <div class="toolrow">
        <span class="hint">Personal links only — whoever holds a link IS that person. Distribute privately
          (Viber/mail). If a link leaks: <b>Regenerate</b> and resend.</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm btn-add" data-act="add-student">+ Add student</button>
        <button type="button" class="btn btn-sm btn-add" data-act="add-instructor">+ Add instructor</button>
      </div>
      <div class="card"><h3>Students (${stu.length})</h3>
        <div class="tblwrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Details</th><th>Status</th><th>Token</th><th>Actions</th></tr></thead>
          <tbody>${peopleRows(stu, "student")}</tbody></table></div></div>
      <div class="card"><h3>Instructors (${ins.length})
        <span class="k" title="${esc(WA.SENIORITY_TIP)}">— seniority order</span></h3>
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
    /* ROUND 9 — a closed list PLUS the "Other…" free-text escape. The two air
       forces in the squadron today are named; the third one that arrives
       tomorrow is typed, and needs no release to be recordable. */
    const selOther = (id, label, opts, cur, ph) => {
      const v = cur ? String(cur) : "";
      const other = v !== "" && opts.indexOf(v) < 0;
      return `
      <label class="f"><span>${esc(label)}</span>
        <select id="${esc(id)}" data-other="${esc(id)}">
          <option value=""${v === "" ? " selected" : ""}>—</option>
          ${opts.map((o) => `<option value="${esc(o)}"${!other && v === o ? " selected" : ""}>${esc(o)}</option>`).join("")}
          <option value="${esc(PM_OTHER)}"${other ? " selected" : ""}>Other…</option>
        </select>
        <input type="text" class="freein${other ? "" : " hidden"}" id="${esc(id)}-other"
               value="${esc(other ? v : "")}" placeholder="${esc(ph || "type it")}"
               aria-label="${esc(label)} — typed"></label>`;
    };
    /* THE ROSTER OBJECT ID IS IMMUTABLE (server-enforced). It can be given
       ONCE, to adopt a person who was added here by hand into the shared
       roster; after that the box is read-only and says so. */
    const oidF = p.external_oid
      ? `<label class="f"><span>Roster object id — immutable</span>
           <input type="text" id="pm-oid" value="${esc(p.external_oid)}" readonly
             title="this person comes from the shared roster; the id is the one thing that never changes"></label>`
      : `<label class="f"><span>Roster object id — optional, set once</span>
           <input type="text" id="pm-oid" value="" placeholder="e.g. R-0000"
             title="give this person the id the shared roster uses, and the next roster import will update them instead of creating a duplicate"></label>`;
    $("adm-modal").innerHTML = `
      <h3>${person ? "Edit" : "Add"} ${esc(role)}</h3>
      <div class="fgrid">
        <label class="f"><span>Rank</span><input type="text" id="pm-rank" list="pm-ranks"
          value="${esc(p.rank || "")}" placeholder="e.g. ${isStu ? "Cdt" : "Maj"}"
          title="the ranks the squadron uses are offered — the box stays free text, which is the escape"></label>
        <datalist id="pm-ranks">${RANKS.map((r) => `<option value="${esc(r)}"></option>`).join("")}</datalist>
        <label class="f"><span>Military Number</span><input type="text" id="pm-mn" value="${esc(p.mn || "")}"></label>
        <label class="f"><span>Last name *</span><input type="text" id="pm-last" value="${esc(p.last_name || "")}"></label>
        <label class="f"><span>First name</span><input type="text" id="pm-first" value="${esc(p.first_name || "")}"></label>
        ${isStu
          ? `<label class="f"><span>Class</span><input type="text" id="pm-class" value="${esc(p.class || "")}" placeholder="e.g. 2026B"></label>`
          : sel("pm-duty", "Duty", ["Squadron Commander", "DO", "Flight Commander", "Evaluator", "Instructor"], p.duty) +
            sel("pm-leadership", "Leadership", ["Wingman", "2-ship", "4-ship", "Mission Commander"], p.leadership) +
            sel("pm-status", "Status", ["Assigned", "Attached", "Departed"], p.status) +
            `<label class="f"><span>Call sign</span><input type="text" id="pm-callsign" value="${esc(p.call_sign || "")}" placeholder="e.g. TEST-01"></label>` +
            selOther("pm-country", "Country — air force", ["HAF", "ITAF"], p.country, "e.g. FAF") +
            `<label class="f"><span>Test pilot</span>
               <div class="ck"><input type="checkbox" id="pm-tp"${p.test_pilot ? " checked" : ""}>
                 <b title="test pilot — badged TP wherever this person is named">yes</b></div></label>`}
        ${oidF}
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
    /* the "Other…" pair reads back as ONE value — what was picked, or what was
       typed into the box the option reveals */
    const valOther = (i) => (val(i) === PM_OTHER ? val(i + "-other") : val(i));
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
      payload.call_sign = val("pm-callsign");
      payload.country = valOther("pm-country");
      payload.test_pilot = !!($("pm-tp") && $("pm-tp").checked);
    }
    /* an EMPTY id box is not an instruction to clear the roster id — it is a
       person the roster has never mentioned. Only a typed value is sent, and
       the server refuses to change one that is already there. */
    const oid = val("pm-oid");
    if (oid) payload.external_oid = oid;
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
      "FPC", "CEF", "Entries to correct",
      "Record entered by", "CO-entered entries"]
      .concat(WA.EVALUATIONS.map((d) => d.id))
      /* ROUND 10 — the assessment travels as the MEAN plus the raw material it
         was computed from: the weight sum, the count, and one column per level
         in scale order. A spreadsheet can therefore re-derive the mean, or
         re-weight the scale entirely, without going back to the database. */
      .concat(["Mean (fighters)", "Weight sum", "Assessments in", "Instructors total"])
      .concat(WA.LEVELS.map((l) => l.label))
      /* ROUND 13 — WHERE THE FOURTH WORD LIVES. The entries CSV is one row per
         entry and an OWED slot is not an entry, so "owed" could never appear
         there. It appears HERE, as arithmetic: four columns per slot section,
         done / started / owed / extra against the printed syllabus. That is
         what makes the export answer "how far through the stage is this class"
         in a spreadsheet, which is the question the pre-seeded slots exist for. */
      .concat(WA.SLOT_SECTIONS.reduce((a, k) => a.concat(
        [WA.secLabel(k) + " done", WA.secLabel(k) + " started",
         WA.secLabel(k) + " owed", WA.secLabel(k) + " extra",
         WA.secLabel(k) + " in syllabus"]), []))
      .concat(["Self-report updated"])];
    for (const s of visible()) {
      const st = s._stats;
      const a = s.assessment || { n: 0, sum: 0, mean: null, counts: {} };
      rows.push([s.person.mn, s.person.rank, s.person.last_name, s.person.first_name, s.person.class,
        st.solos, st.nfs, st.sms, st.fail,
        st.almost_good, st.airsickness, st.fpc, st.cef, st.legacy,
        /* "CO" = every entry is the CO's · "self" = the owner's record, and
           the next column says how many entries of it the CO added */
        s.completion.has_record || s._src.any ? s._src.word : "", s._src.n]
        /* ROUND 11 — the PASS ATTEMPT, raw, per checkride. A spreadsheet that
           averaged a column would otherwise be averaging failed re-flights. */
        .concat(WA.EVALUATIONS.map((d) => WA.pctRaw(WA.evalGrade(s._evals, d.id))))
        .concat([a.n ? WA.meanText(a.mean) : "", a.n ? a.sum : "",
          a.n, s.completion.instructors_total])
        .concat(WA.LEVELS.map((l) => (a.counts || {})[l.id] || 0))
        .concat(WA.SLOT_SECTIONS.reduce((acc, k) => {
          const cn = WA.stateCounts(k, s.record[k]);
          return acc.concat([cn.done, cn.started, cn.owed, cn.extra, WA.slotCount(k)]);
        }, []))
        .concat([s.completion.has_record ? fmtDT(s.last_update) : "not submitted"]));
    }
    download("wings-ahead-summary" + classSuffix() + "-" + stamp() + ".csv",
             "text/csv;charset=utf-8", csv(rows));
  }

  /* every dated entry of every student, one row each — the raw record on paper.
     ROUND 5: the multi-select items travel COMMA-JOINED in one cell (the CSV
     separator is ";", so a comma is safe and reads as a list), a fixed slot
     nobody has flown is not exported as an entry, and the grade is the RAW
     stored number — a fractional legacy grade is never rounded away here. */
  function exportEntriesCSV() {
    /* ROUND 12 — three columns no other column carries: "Hours" is the flown
       duration (WA-only until FDMS grows the field), "Awaiting" is the debrief
       lag — «δεκτο το null» — and (round 12b) "Mission" is complete /
       incomplete, marked when it is READ FROM THE GRADE rather than said. A
       spreadsheet that read a blank Grade as a zero would be reading a failure
       that never happened, so both facts are stated in columns of their own. */
    /* ROUND 13 — "State" carries the four words of the colour scheme. THREE of
       them can ever appear here and that is not an oversight: this export is
       one row per ENTRY, and an OWED slot is not an entry — nothing is stored
       for it, by design. Where a student stands against the syllabus is a
       COUNT, so it travels in the summary CSV (four columns), in the drill-down
       and on the printed brief. Every other section leaves the cell empty
       rather than inventing a state it does not have. */
    const rows = [["Student", "Class", "Section", "Date", "Detail", "Flight code",
      "Items", "Item count", "With whom / authorised by", "Grade", "To correct", "Entered by", "Counts",
      "Hours", "Awaiting", "Mission", "State"]];
    /* the claim map per student per section — computed ONCE per section rather
       than per row, and by the same function every surface uses */
    let CL = {};
    const stateOf = (sec, e, ix) => {
      if (!WA.hasSlots(sec)) return "";
      const c = CL[sec];
      return WA.rowStateDef(WA.rowState(sec, e, !!(c && c.claimed[ix]))).label;
    };
    /* "Counts" — round 11 residual (verify item 10): a re-flown checkride
       exports BOTH attempts; this column says which one the numbers use,
       decided by the same helper as every other surface. Non-evaluation rows
       leave it empty. */
    const add = (s, sec, e, detail, code, items, who, grade, date, counts, hours, state) =>
      rows.push([WA.personName(s.person, true), s.person.class, WA.secLabel(sec),
        fmtD(date === undefined ? e.date : date), detail, code || "",
        items || "", WA.itemsN(e) || "", who || "",
        WA.pctRaw(grade),
        e.legacy ? "yes" : "", WA.coWord(e), counts || "",
        hours === undefined || hours === null ? "" : hours,
        /* the debrief lag belongs to the sections that HAVE a grade. A ground
           lesson is attended, not scored, so it is never "awaiting" anything —
           and a column that said it was would put a chase on every lesson in
           the squadron (found by this round's own CSV read-back). */
        (sec === "flights" || sec === "fs" || sec === "exams") ? WA.debriefWord(e, sec) : "",
        /* round 12b — only the two flight logs have a mission; everything
           else leaves the cell empty rather than inventing one */
        (sec === "flights" || sec === "fs")
          ? (e.ng ? "not scorable (NG)"
                  : (WA.rowMission(e)
                      ? WA.missionLabel(WA.rowMission(e)) +
                        (WA.missionDerived(e) ? " (read from the grade)" : " (no percentage recorded)")
                      : ""))
          : "",
        state || ""]);
    for (const s of visible()) {
      const r = s.record;
      CL = {};
      for (const k of WA.SLOT_SECTIONS) CL[k] = WA.claims(k, r[k] || []);
      (r.nfs || []).forEach((e) => add(s, "nfs", e,
        WA.nfsReasonLabel(e) + (e.note && e.reason !== "other" ? " — " + e.note : ""),
        "", "", "", null));
      /* ROUND 8 — the ΚΕΠΕ entry condition travels in Detail beside the state */
      (r.sms || []).forEach((e) => add(s, "sms", e,
        WA.smsReasonLabel(e) + " — " + (e.exit_date ? "exit " + fmtD(e.exit_date) : "still open"),
        "", "", "", null, e.entrance_date));
      /* ROUND 6 — the flight travels in the "Flight code" column like every
         other section's; a surviving phase note rides in Detail, named */
      (r.airsickness || []).forEach((e) => add(s, "airsickness", e,
        e.phase ? "legacy note: " + e.phase : "", e.flight_code, "", e.instructor, null));
      for (const k of ["fail", "almost_good"]) {
        (r[k] || []).forEach((e) => add(s, k, e, WA.itemCatLabel(e.category),
          e.flight_code, (e.items || []).join(", "), e.instructor, e.grade));
      }
      const evRows = WA.evalRows(r);
      const opIdx = {};
      for (const d of WA.EVALUATIONS) {
        const w = WA.evalOperativeOf(evRows, d.id).row;
        if (w) opIdx[d.id] = w.i;
      }
      WA.filled("evaluations", r.evaluations).forEach((e) => add(s, "evaluations", e,
        e.evaluation ? WA.evalLabel(e.evaluation) : "(not identified)", e.evaluation, "",
        e.with, e.grade, undefined,
        e.evaluation ? (opIdx[e.evaluation] === r.evaluations.indexOf(e)
          ? "yes" : "no — another attempt counts") : ""));
      WA.filled("solo_flights", r.solo_flights).forEach((e) => add(s, "solo_flights", e,
        (e.slot ? WA.soloSlotLabel(e.slot) : "additional solo") +
        (e.ng ? " — NG (non-graded)" : " — graded"),
        e.sortie, "", WA.soloWho(e), e.grade));
      /* ROUND 11 — the FPC's Detail cell carries its stored result NAMED as a
         legacy note (an unmarked "pass" in a spreadsheet column beside a 48 %
         is exactly the disagreement the box was removed for); the CEF's Result
         is still an ordinary field and travels as itself */
      for (const k of ["fpc", "cef"]) {
        (r[k] || []).forEach((e) => add(s, k, e,
          k === "fpc" ? WA.fpcResultText(e.result) : (e.result || ""),
          e.flight_code, "", e.evaluator, e.grade));
      }
      /* ROUND 12 — the log rows. Detail carries the track, the kind when it is
         not an ordinary syllabus sortie, and the seq of a same-day re-fly; the
         MISSION has a column of its own (round 12b), because an unmarked blank
         in a Grade column beside a mission the squadron called INCOMPLETE is
         exactly the disagreement the key exists to prevent. */
      for (const k of ["flights", "fs"]) {
        (r[k] || []).forEach((e, ix) => {
          const bits = [WA.itemCatLabel(e.track)];
          if (e.kind && e.kind !== "syllabus") bits.push(WA.flightKindLabel(e.kind));
          if (Number(e.seq || 1) > 1) bits.push("same-day re-fly #" + Number(e.seq));
          if (e.ng) bits.push("NG (non-graded)");
          add(s, k, e, bits.join(" — "), e.sortie, "", e.instructor, e.grade,
              undefined, "", e.duration, stateOf(k, e, ix));
        });
      }
      /* ROUND 14 — a lesson recorded by its END alone has an empty Date cell,
         so Detail says which day it is: "ended 30/04/2026" and not a bare "to" */
      (r.lessons || []).forEach((e, ix) => add(s, "lessons", e,
        [WA.groundGroupLabel(e.group),
         e.end_date && e.end_date !== e.date
           ? (e.date ? "to " + fmtD(e.end_date) : "ended " + fmtD(e.end_date)) : ""
        ].filter(Boolean).join(" — "),
        e.course, "", "", null, undefined, "", undefined, stateOf("lessons", e, ix)));
      /* ROUND 14 — a spreadsheet reading two IN190 rows must be able to tell
         the re-sit from the first sitting, and an ΕΕΘ names no exam at all. The
         Flight-code column therefore carries WA.examRowLabel — the same name
         every other surface prints — and the "Counts" column says which attempt
         the verdict is read from, exactly as it does for a re-flown checkride. */
      {
        const exCL = WA.claims("exams", r.exams || []);
        (r.exams || []).forEach((e, ix) => add(s, "exams", e,
          [WA.examSeries(e) ? WA.examSeries(e).label + " — weekly theory exam" : WA.examLabel(e.exam),
           WA.examTrial(e) > 1 && !WA.examSeries(e) ? WA.examTrialWord(WA.examTrial(e)) : "",
           (WA.exam(e.exam) || {}).cond ? "foreign SPs only" : ""
          ].filter(Boolean).join(" — "),
          WA.examRowLabel(e), "", "", e.grade, undefined,
          WA.examSeries(e) ? "" : (exCL.claimed[ix] ? "yes" : "no — another attempt counts"),
          "", undefined, stateOf("exams", e, ix)));
      }
    }
    download("wings-ahead-entries" + classSuffix() + "-" + stamp() + ".csv",
             "text/csv;charset=utf-8", csv(rows));
  }

  /* ROUND 10 — one row per assessment, carrying BOTH the words and the weight.
     The label is what the squadron says; the weight is what the brief adds up.
     A row an instructor has submitted without forming a view keeps both cells
     empty rather than scoring zero — the silence must not become a number. */
  function exportAssessmentsCSV() {
    const rows = [["Student", "Class", "Instructor", "Call sign", "Country", "Test pilot",
      "Duty", "Leadership", "Status",
      "Assessment (fighters)", "Weight", "Flew with", "Comment", "Updated", "Entered by"]];
    /* ROUND 14 — seniority order here too, so a printed export and the screen
       list the squadron in the same sequence (WA.bySeniority) */
    for (const s of visible()) for (const p of WA.sortBySeniority(s.proposals)) {
      const l = WA.level(p.level);
      rows.push([WA.personName(s.person, true), s.person.class,
        (p.rank ? p.rank + " " : "") + p.last_name,
        p.call_sign || "", p.country || "", p.test_pilot ? "yes" : "no",
        p.duty, p.leadership, p.status,
        l ? l.label : "", l ? l.w : "",
        p.flew_with ? "yes" : "no", p.comment || "", fmtDT(p.updated_at), WA.coWord(p)]);
    }
    download("wings-ahead-assessments" + classSuffix() + "-" + stamp() + ".csv",
             "text/csv;charset=utf-8", csv(rows));
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
    /* the class filter — persisted, so tomorrow's session opens on 98B too */
    const cl = t.closest("[data-cls]");
    if (cl) { A.cls = cl.dataset.cls; lsSet(CLS_KEY, A.cls); render(); return; }
    const pt = t.closest("[data-pt]");
    if (pt) { highlightRow(pt.dataset.pt); return; }

    const act = t.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "print") { buildPrint(); window.print(); }
      else if (a === "csv-summary") exportSummaryCSV();
      else if (a === "csv-entries") exportEntriesCSV();
      else if (a === "csv-assessments") exportAssessmentsCSV();
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
          " and ALL their data (record / assessments)? This cannot be undone.")) return;
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
    /* ROUND 9 — "Other…" reveals its free-text box in place (the modal is
       never re-rendered, so what is typed survives until Save) */
    const os = ev.target.closest && ev.target.closest("[data-other]");
    if (os) {
      const box = $(os.dataset.other + "-other");
      if (box) {
        const on = os.value === PM_OTHER;
        box.classList.toggle("hidden", !on);
        if (on) box.focus(); else box.value = "";
      }
    }
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
