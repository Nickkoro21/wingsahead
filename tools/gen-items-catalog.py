#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gen-items-catalog.py — build app/items-catalog.js from the FDMS syllabus data,
and rewrite the GENERATED BLOCK of db/schema.sql from the same sources.

SOURCES (read-only, NOT part of this repo):
    D:\\FDMS\\data\\observations\\master_index.json
    → categories contact / instrument / formation / vfr_navigation
      → items[] {item_id, item_name, mif_numbers}          → WA_ITEMS
    D:\\FDMS\\data\\flowchart2.json
    → sorties[] {id, track, band, name, checkride}         → WA_SORTIES
    → sorties[] in FILE ORDER, per (band, track)           → WA_LOG_SORTIES
    → sorties[] in FILE ORDER, checkride == true           → WA_EVAL_ORDER
    → groups[]  {id, sorties_solo, solo_candidate_sorties} → WA_SOLO_SLOTS
    → groups[]  kind == 'theory', duration_summary parsed  → WA_GROUND
    → groups[]  kind == 'ground_exam'                      → WA_EXAMS

ROUND 12 — THE LOG TABLES. The four new record sections (flights · fs ·
lessons · exams) need three catalogues this script did not emit:
  · the per-track sortie list SPLIT BY BAND and in FLOW-CHART ORDER
    (WA_LOG_SORTIES). WA_SORTIES is code-sorted (rows.sort below) and that is
    NOT the syllabus order — in ('flights','instrument') the flow chart runs
    … I4602 I4701 I4603 I4890, and code-sorting silently reorders it. The two
    live side by side deliberately: the existing pickers keep the order they
    have always had, and the log tables get the printed one.
  · the 12 theory groups decomposed into their 47 COURSES (WA_GROUND), by a
    PORT of FDMS parseGroupCourses (app/scheduler.js:146-210). One parser
    written twice is a drift risk, so the port asserts the four totals it must
    reproduce — 47 courses · 45 required + 2 conditional · 514 required
    periods · 26 supplementary — and fails the build otherwise.
  · the 8 ground-exam groups (WA_EXAMS), carrying the `conditional` flag so
    JP190 (foreign SPs only) is shown as NOT OWED rather than pending for ever.

THE GREEK-HOMOGLYPH TRIPWIRE (round 12). Course codes in flowchart2.json are
mixed-script: AΕ 101-108 and AΕ 190 are Latin A + GREEK Ε (U+0395), and inside
g:GT-INSTR the code IN 101-105 is Latin while ΙΝ 201-210 is Greek Ι Ν. Two
codes whose printed forms are identical differ in script, and a stored value
nobody can retype is a value nobody can ever correct. The parser folds Greek to
Latin FOR MATCHING (exactly as FDMS's normTxt does) and then ASSERTS that every
EMITTED code is pure Latin — the build fails, loudly, naming the code and its
Latin twin, rather than shipping a code the form can never reproduce.

The generated file is a plain <script> catalogue used by the FAIL /
ALMOST GOOD rows: category select → multi-select of that category's syllabus
items (WA_ITEMS) and a per-category flight-code SELECT (WA_SORTIES), and by
the Solo flights section, whose rows are the FIXED syllabus solo slots
(WA_SOLO_SLOTS) — one row per solo the stage prescribes, never a free list.
No student data is involved — syllabus structure only.

ROUND 6 — the two rules that need the catalogue ON THE SERVER as well:
  · FAIL / ALMOST GOOD items[] may hold ONLY the printed items of the chosen
    track (the custom "Other…" item is gone), so the validator needs the 117
    item names → wa.item_names(category).
  · Evaluations follow the SYLLABUS ORDER, and the definitive order of the
    eight checkrides is the FILE ORDER of the sortie entries in
    flowchart2.json — the order in which the printed Training Flow Chart lays
    them out → wa.eval_ids(), whose array position IS the order.
Both are written into db/schema.sql between the GENERATED-BLOCK markers, so
the SQL mirror can never drift from the JS one: they come from one run of one
script over one source.

Usage (from the repo root):
    python tools/gen-items-catalog.py [master_index.json] [flowchart2.json]
"""

import json
import os
import re
import sys

CATS = [
    ("contact",        "Contact"),
    ("instrument",     "Instrument"),
    ("formation",      "Formation"),
    ("vfr_navigation", "VFR Navigation"),
]

DEFAULT_SRC = r"D:\FDMS\data\observations\master_index.json"
DEFAULT_FLOW = r"D:\FDMS\data\flowchart2.json"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "items-catalog.js")
OUT_SQL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "db", "schema.sql")

SQL_BEGIN = "-- ▼▼ GENERATED BLOCK — tools/gen-items-catalog.py — DO NOT EDIT BY HAND ▼▼"
SQL_END = "-- ▲▲ GENERATED BLOCK ▲▲"


BANDS = ["flights", "fs"]

# THE FOUR TOTALS THE COURSE PORT MUST REPRODUCE (round 12), re-derived from
# flowchart2.json. They are a BUILD ASSERTION and not a comment: a syllabus
# revision that moves one of them stops the build instead of silently changing
# what every student is owed.
GROUND_ASSERT = {"courses": 47, "required": 45, "conditional": 2,
                 "req_periods": 514, "suppl_periods": 26}
# per (band, track) sortie counts — the same doctrine, one number per table
SORTIE_ASSERT = {
    ("flights", "contact"): 36, ("flights", "instrument"): 14,
    ("flights", "formation"): 22, ("flights", "vfr_navigation"): 13,
    ("fs", "contact"): 18, ("fs", "instrument"): 18,
    ("fs", "formation"): 5, ("fs", "vfr_navigation"): 7,
}

# ── THE GREEK → LATIN FOLD (round 12) ─────────────────────────────────────
# The exact table FDMS uses (app/scheduler.js:146). It is used HERE ONLY FOR
# MATCHING — the label part a course code is adopted from — never to rewrite an
# emitted value. What guards the emitted values is assert_latin() below.
GREEK2LAT = {
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H",
    "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O",
    "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
}
GREEK_RE = re.compile("[" + "".join(GREEK2LAT) + "]")
ANY_GREEK_RE = re.compile("[Ͱ-Ͽἀ-῿]")


def fold_greek(s):
    """Greek capitals that LOOK Latin → their Latin twin. Matching only."""
    return GREEK_RE.sub(lambda m: GREEK2LAT[m.group(0)], str(s if s is not None else ""))


def assert_latin(kind, ident, code):
    """A code the WA form could never reproduce must never be emitted.

    Nothing is rewritten quietly: the build STOPS and names the code, where it
    came from and what its Latin twin would be, so the decision is a human's.
    """
    if ANY_GREEK_RE.search(str(code)):
        bad = " ".join("U+%04X" % ord(c) for c in str(code) if ANY_GREEK_RE.match(c))
        raise SystemExit(
            "GREEK CODE REFUSED — %s %s emits the code %r, which contains Greek "
            "letters (%s).\nIts Latin twin would be %r. A mixed-script code is one the "
            "form's dropdown can offer but nobody can retype, so it must not be stored: "
            "fix the syllabus source, or extend the fold table and decide DELIBERATELY "
            "which script the catalogue carries.\n(tools/gen-items-catalog.py — "
            "assert_latin)" % (kind, ident, code, bad, fold_greek(code)))


def sq(s):
    """one SQL string literal, quotes doubled."""
    return "'" + str(s).replace("'", "''") + "'"


def norm_txt(s):
    """FDMS normTxt (scheduler.js:147) — fold Greek, collapse space, lower."""
    return re.sub(r"\s+", " ", fold_greek(s)).strip().lower()


def synth_code(name, taken):
    """FDMS synthCode (scheduler.js:148-155) — a code for a code-less segment."""
    m = re.match(r"^([A-Z]{2,})\b", str(name or "").strip())
    if m:
        base = m.group(1)
    else:
        base = re.sub(r"[^A-Z0-9]", "",
                      "".join(w[:1] for w in str(name or "").split()).upper())[:4] or "CRS"
    code, i = base, 2
    while code in taken:
        code = base + "-" + str(i)
        i += 1
    return code


def parse_group_courses(g):
    """PORT of FDMS parseGroupCourses (app/scheduler.js:156-210), line for line.

    Source: duration_summary ("Chapter: Course name | CODE | periods · …"),
    parsed defensively — segments split on " · ", fields on " | "; segments with
    no code (OJT, Air Traffic Rules, the General-Briefing subjects) get a
    synthesised one; "[suppl.]" segments are conditional (foreign SPs) and never
    block the group. The LABEL codes win over the table codes, matched by
    prefix / first number / shared distinctive token. A group with no
    duration_summary (WSGES · CO 109 · CO 110) is ONE course = the group itself.
    """
    label = str(g.get("label") or "")
    parts = [{"raw": p.strip(), "norm": norm_txt(p), "used": False}
             for p in label.split(" · ")]

    def adopt(code_raw, name_raw):
        norm = norm_txt(code_raw)
        hit = None
        if norm:
            hit = next((p for p in parts if not p["used"] and p["norm"] == norm), None)
        toks = [t for t in norm.split(" ") if t]
        t0 = toks[0] if toks else ""
        m = re.search(r"\d+", norm)
        n0 = m.group(0) if m else ""

        def tok_ok(pt0):
            return pt0 == t0 or (t0 and (pt0.startswith(t0) or t0.startswith(pt0)))

        if not hit and norm and "-" in norm:
            for p in parts:
                if p["used"]:
                    continue
                pt0 = (p["norm"].split(" ") or [""])[0]
                pm = re.search(r"\d+", p["norm"])
                if tok_ok(pt0) and n0 and (pm.group(0) if pm else "") == n0:
                    hit = p
                    break
            if not hit:
                c = [p for p in parts if not p["used"]
                     and tok_ok((p["norm"].split(" ") or [""])[0])]
                if len(c) == 1:
                    hit = c[0]
        if not hit and norm:            # shared distinctive token (OPR PL2 → IPR PL2)
            c = [p for p in parts if not p["used"]
                 and any(len(t) >= 3 and t in p["norm"].split(" ") for t in toks)]
            if len(c) == 1:
                hit = c[0]
        if not hit and not norm and name_raw:   # a code-less segment that IS a label part
            nn = norm_txt(name_raw)
            hit = next((p for p in parts if not p["used"] and p["norm"] == nn), None)
        if hit:
            hit["used"] = True
            return hit["raw"]
        return ""

    src = str(g.get("duration_summary") or "")
    out, taken = [], set()
    for seg in src.split(" · "):
        fields = [x.strip() for x in seg.split("|")]
        fields = [x for x in fields if x != ""]
        if len(fields) < 2:
            continue
        raw_name = fields[0]
        conditional = bool(re.match(r"^\[suppl\.?\]", raw_name, re.I))
        name = re.sub(r"^\[suppl\.?\]\s*", "", raw_name, flags=re.I)
        name = re.sub(r"^\d+\.\s*", "", name)
        ci = name.find(": ")
        if ci >= 0:
            name = name[ci + 2:]        # drop the chapter header
        code_raw, periods = "", None
        try:
            if len(fields) >= 3:
                code_raw, periods = fields[1], int(fields[-1])
            else:
                periods = int(fields[1])
        except ValueError:
            continue
        code = adopt(code_raw, "" if code_raw else name) or code_raw or synth_code(name, taken)
        if code in taken:
            code = synth_code(code, taken)
        taken.add(code)
        out.append({"code": code, "name": name, "periods": periods,
                    "conditional": conditional})
    if not out:                          # WSGES · CO 109 · CO 110
        out.append({"code": label or g["id"], "name": g.get("name") or "",
                    "periods": 0 if g.get("periods") is None else g["periods"],
                    "conditional": False})
    return out


def sortie_hours(s, groups_by_id):
    """The PRESCRIBED hours of one sortie, one decimal, or None.

    Only 15 of the 133 carry an `hours` of their own; the rest inherit from
    their Training Section (hours_per_sortie, else hours_total ÷ sorties_total).
    This is what the duration box PREFILLS with — the stored value is always the
    ACTUAL time flown (A.4), so it is a starting point and never a fact.
    """
    g = groups_by_id.get(s.get("group")) or {}
    h = s.get("hours")
    if h is None:
        h = g.get("hours_per_sortie")
    if h is None and g.get("hours_total") is not None and g.get("sorties_total"):
        try:
            h = float(g["hours_total"]) / int(g["sorties_total"])
        except (TypeError, ValueError, ZeroDivisionError):
            h = None
    if h is None:
        return None
    return round(float(h) + 1e-9, 1)


def sql_block(cats, evals, flow_generated, idx_generated,
              log_sorties, ground, exams, solo_slot_ids):
    """the wa.eval_ids() + wa.item_names() mirror, as SQL text."""
    L = []
    L.append(SQL_BEGIN)
    L.append("-- Generated from the FDMS syllabus sources:")
    L.append("--   flow chart      %s  (data/flowchart2.json)" % flow_generated)
    L.append("--   syllabus items  %s  (data/observations/master_index.json)" % idx_generated)
    L.append("-- MIRROR: app/items-catalog.js, written by the same run of the same script.")
    L.append("")
    L.append("-- THE EIGHT CHECKRIDES, IN SYLLABUS ORDER (round 6). The order is not a")
    L.append("-- judgement call: it is the FILE ORDER of the sortie entries in")
    L.append("-- flowchart2.json, which is the order the printed Training Flow Chart lays")
    L.append("-- them out in. The ARRAY POSITION is therefore the syllabus position, and")
    L.append("-- wa.eval_pos() reads it — an evaluation may not be recorded while an")
    L.append("-- earlier one has not been flown.")
    L.append("-- MIRROR: app/app.js → WA.EVALUATIONS (ordered by WA_EVAL_ORDER).")
    L.append("create or replace function wa.eval_ids() returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select array[%s]::text[]" % ",".join(sq(e) for e in evals))
    L.append("$$;")
    L.append("")
    L.append("-- 1-based position of a checkride in the syllabus order · null when unknown")
    L.append("create or replace function wa.eval_pos(p_id text) returns int")
    L.append("language sql immutable as $$")
    L.append("  select i from generate_subscripts(wa.eval_ids(), 1) i")
    L.append("  where (wa.eval_ids())[i] = p_id")
    L.append("$$;")
    L.append("")
    L.append("-- THE PRINTED GRADESHEET ITEMS OF ONE TRACK (round 6). FAIL / ALMOST GOOD")
    L.append("-- items[] may hold ONLY these strings: the custom \"Other…\" item died with")
    L.append("-- round 6, so an item that is not on the printed sheet of the chosen track")
    L.append("-- is refused on write — by name, with the rule spelled out.")
    L.append("-- 'other' is the migration-only placeholder category and has NO catalogue:")
    L.append("-- a row still filed under it must be given a real track first.")
    L.append("-- MIRROR: app/items-catalog.js → WA_ITEMS.categories[].items[].name")
    L.append("create or replace function wa.item_names(p_cat text) returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select case p_cat")
    for cid, _label in CATS:
        names = [it["name"] for it in next(c for c in cats if c["id"] == cid)["items"]]
        L.append("    when %s then array[" % sq(cid))
        for k, n in enumerate(names):
            L.append("      %s%s" % (sq(n), "," if k < len(names) - 1 else ""))
        L.append("    ]::text[]")
    L.append("    else array[]::text[] end")
    L.append("$$;")

    # ══ ROUND 12 — THE LOG-TABLE CATALOGUES ══════════════════════════════
    L.append("")
    L.append("-- ══ ROUND 12 — THE LOG TABLES: THE FOUR CATALOGUES ═══════════════════════")
    L.append("-- The sorties of ONE table — a (band, track) pair — in FLOW-CHART ORDER, i.e.")
    L.append("-- the order the printed Training Flow Chart lays the stage out in. NOT the")
    L.append("-- code order of wa.item_names' neighbour WA_SORTIES: in ('flights',")
    L.append("-- 'instrument') the chart runs … I4602 I4701 I4603 I4890 and sorting by code")
    L.append("-- silently reorders it.")
    L.append("-- THE BAND IS THE SECTION AND THE TRACK IS THE LETTER (wa.code_track), so a")
    L.append("-- flights/fs row is fully placed by the pair — no new lookup on the hot path.")
    L.append("-- MIRROR: app/items-catalog.js → WA_LOG_SORTIES.")
    L.append("create or replace function wa.sortie_codes(p_band text, p_track text) returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select case p_band || '/' || p_track")
    for band in BANDS:
        for cid, _lab in CATS:
            rows = log_sorties[band][cid]
            L.append("    when %s then array[" % sq(band + "/" + cid))
            for k, r in enumerate(rows):
                L.append("      %s%s" % (sq(r["c"]), "," if k < len(rows) - 1 else ""))
            L.append("    ]::text[]")
    L.append("    else array[]::text[] end")
    L.append("$$;")
    L.append("")
    L.append("-- which BAND a syllabus code belongs to — 'flights' | 'fs' | null (not a")
    L.append("-- catalogue code). The letter gives the track; only the flow chart gives the")
    L.append("-- band, which is why this is generated and wa.code_track is not.")
    L.append("create or replace function wa.sortie_band(p_code text) returns text")
    L.append("language sql immutable as $$")
    L.append("  select case")
    for band in BANDS:
        codes = [r["c"] for cid, _l in CATS for r in log_sorties[band][cid]]
        L.append("    when upper(wa.norm_line(p_code)) = any(array[")
        for k, c in enumerate(codes):
            L.append("      %s%s" % (sq(c), "," if k < len(codes) - 1 else ""))
        L.append("    ]::text[]) then %s" % sq(band))
    L.append("    else null end")
    L.append("$$;")
    L.append("")
    L.append("-- THE 12 THEORY GROUPS and, per group, its COURSES — the codes exactly as the")
    L.append("-- FDMS parser derives them from the printed duration block. The join key for")
    L.append("-- a course is the PAIR (group, course), never the code alone: OJT is a course")
    L.append("-- of four different groups.")
    L.append("-- MIRROR: app/items-catalog.js → WA_GROUND.")
    L.append("create or replace function wa.lesson_groups() returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select array[%s]::text[]" % ",".join(sq(g["g"]) for g in ground))
    L.append("$$;")
    L.append("")
    L.append("create or replace function wa.lesson_courses(p_group text) returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select case p_group")
    for g in ground:
        L.append("    when %s then array[" % sq(g["g"]))
        for k, c in enumerate(g["courses"]):
            L.append("      %s%s" % (sq(c["c"]), "," if k < len(g["courses"]) - 1 else ""))
        L.append("    ]::text[]")
    L.append("    else array[]::text[] end")
    L.append("$$;")
    L.append("")
    L.append("-- THE EIGHT GROUND-EXAM GROUPS. These and ONLY these: four theory groups")
    L.append("-- carry a nested exams[] (FF 190 · PT 190 · AΕ 190 · JX 190 · JX 191 ·")
    L.append("-- NA 191) which a human would file under \"exams\", and FDMS does not — its")
    L.append("-- parser picks them up as COURSES OF THEIR GROUP. Putting them here too")
    L.append("-- would make the two systems disagree about what a student is owed.")
    L.append("-- MIRROR: app/items-catalog.js → WA_EXAMS.")
    L.append("create or replace function wa.exam_ids() returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select array[%s]::text[]" % ",".join(sq(e["id"]) for e in exams))
    L.append("$$;")
    L.append("")
    L.append("-- JP190 is «Exams on Flight physiology (foreign SPs only)» — conditional, so")
    L.append("-- it is NOT OWED by a HAF student. (FDMS's own SchedReady never reads the")
    L.append("-- flag and leaves JP190 pending for ever; that defect is not mirrored here.)")
    L.append("create or replace function wa.exam_conditional(p_id text) returns boolean")
    L.append("language sql immutable as $$")
    L.append("  select case when p_id = any(array[%s]::text[]) then true else false end"
             % ",".join(sq(e["id"]) for e in exams if e["cond"]))
    L.append("$$;")
    L.append("")
    L.append("-- ── THE FIXED SOLO SLOTS (round 5, generated since round 12) ─────────────")
    L.append("-- One slot per solo the stage prescribes — flow-chart Training Sections whose")
    L.append("-- printed duration block says SOLO SORTIES > 0. F4301-06 prescribes TWO, so it")
    L.append("-- carries two distinct slots. Hand-kept until round 12 opened the generator;")
    L.append("-- it mirrored WA_SOLO_SLOTS by discipline alone, which is a drift that costs")
    L.append("-- nothing to remove.")
    L.append("-- MIRROR: app/items-catalog.js → WA_SOLO_SLOTS.")
    L.append("create or replace function wa.solo_slots() returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select array[%s]::text[]" % ",".join(sq(s) for s in solo_slot_ids))
    L.append("$$;")
    L.append(SQL_END)
    return "\n".join(L)


def number_label(mifs):
    """Printed item number(s): '07' · '12-20' (contiguous) · '23, 25, 27, 32'."""
    if not mifs:
        return None
    if len(mifs) == 1:
        return "%02d" % mifs[0]
    if mifs == list(range(mifs[0], mifs[-1] + 1)):
        return "%02d\u2013%02d" % (mifs[0], mifs[-1])
    return ", ".join("%02d" % m for m in mifs)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    flow = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_FLOW
    with open(src, encoding="utf-8") as fh:
        idx = json.load(fh)
    with open(flow, encoding="utf-8") as fh:
        fc = json.load(fh)

    out_cats, total = [], 0
    for cid, clabel in CATS:
        items = idx["categories"][cid]["items"]
        rows = []
        for it in items:
            rows.append({
                "id": it["item_id"],
                "n": number_label(it.get("mif_numbers") or []),
                "name": it["item_name"],
            })
        total += len(rows)
        out_cats.append({"id": cid, "label": clabel, "items": rows})

    # ── SOLO SLOTS — the FIXED rows of the Solo flights section ───────────
    # Every group (Training Section) whose printed duration block prescribes
    # SOLO SORTIES > 0 contributes exactly that many slots, in syllabus order.
    # A section that prescribes TWO solos (F4301-06) gets TWO distinct slots.
    # `codes` are the sorties the syllabus names as the solo candidates of that
    # section: where it names exactly one (C4791 — the 1st SOLO), the slot is
    # that sortie; where it names several, the student picks which one they flew.
    slots = []
    for g in sorted(fc["groups"], key=lambda x: str(x.get("id"))):
        n_solo = int(g.get("sorties_solo") or 0)
        if n_solo <= 0:
            continue
        codes = list(g.get("solo_candidate_sorties") or [])
        for k in range(n_solo):
            slots.append({
                "id": "%s-S%d" % (g["id"], k + 1),   # stable, stored in records
                "sec": g["id"],                       # Training Section id
                "track": g.get("track") or "",
                "name": g.get("name") or "",
                "n": k + 1, "of": n_solo,
                "req": bool(g.get("solo_required")),
                "codes": codes,
            })

    # ── THE SYLLABUS ORDER OF THE EIGHT CHECKRIDES (round 6) ─────────────
    # NOT a judgement call and NOT date order: the FILE ORDER of the sortie
    # entries in flowchart2.json, which is the order the printed Training Flow
    # Chart lays the stage out in. A later evaluation may not be filled while
    # an earlier one has not been flown, so this list IS the rule.
    eval_order = [s["id"] for s in fc["sorties"] if s.get("checkride")]

    # sortie codes per track — the FAIL / ALMOST GOOD "flight code" picker
    sorties, n_sorties = {}, 0
    for cid, _ in CATS:
        rows = []
        for s in fc["sorties"]:
            if s.get("track") != cid:
                continue
            rows.append({
                "c": s["id"],                      # code, e.g. C4302
                "n": s.get("name") or "",          # printed sortie name
                "b": s.get("band") or "",          # flights | fs (simulator)
                "k": bool(s.get("checkride")),     # checkride?
            })
        rows.sort(key=lambda r: r["c"])
        sorties[cid] = rows
        n_sorties += len(rows)

    # ══ ROUND 12 — THE LOG-TABLE CATALOGUES ══════════════════════════════════
    # (a) the sorties of ONE table — (band, track) — in FLOW-CHART ORDER.
    #     `o` is the 1-based position in that order, so the client never has to
    #     re-derive it and a re-sort anywhere cannot silently reorder the stage.
    groups_by_id = {g["id"]: g for g in fc["groups"]}
    log_sorties = {b: {cid: [] for cid, _ in CATS} for b in BANDS}
    for s in fc["sorties"]:
        b, t = s.get("band"), s.get("track")
        if b not in log_sorties or t not in log_sorties[b]:
            continue
        rows = log_sorties[b][t]
        assert_latin("sortie", s["id"], s["id"])
        rows.append({
            "c": s["id"],
            "n": s.get("name") or "",
            "g": s.get("group") or "",                 # Training Section
            "o": len(rows) + 1,                        # flow-chart position
            "h": sortie_hours(s, groups_by_id),        # prescribed hours (prefill)
            "nt": bool(s.get("night")),
            "k": bool(s.get("checkride")),
            "f1": bool(s.get("first_solo")),
            "sc": bool(s.get("solo_candidate")),
        })
    for (b, t), want in SORTIE_ASSERT.items():
        got = len(log_sorties[b][t])
        if got != want:
            raise SystemExit(
                "SORTIE COUNT CHANGED — (%s, %s) holds %d sorties, the printed flow chart "
                "has %d. Either the syllabus was revised (update SORTIE_ASSERT deliberately) "
                "or the source is wrong. Not shipping a table of the wrong size."
                % (b, t, got, want))

    # (b) the 12 theory groups, decomposed into their 47 courses
    ground, n_courses, n_req, n_cond, p_req, p_sup = [], 0, 0, 0, 0, 0
    for g in fc["groups"]:
        if g.get("kind") != "theory":
            continue
        cs = parse_group_courses(g)
        seen = set()
        for c in cs:
            assert_latin("course of group", g["id"], c["code"])
            # (group, code) is the join key, so the code must be unique WITHIN
            # its group — OJT is a course of four different groups, and that is
            # correct; two OJTs in ONE group would not be.
            if c["code"] in seen:
                raise SystemExit("DUPLICATE COURSE CODE %r inside group %s — the join key "
                                 "(group, course) would be ambiguous" % (c["code"], g["id"]))
            seen.add(c["code"])
            n_courses += 1
            if c["conditional"]:
                n_cond += 1
                p_sup += c["periods"]
            else:
                n_req += 1
                p_req += c["periods"]
        ground.append({
            "g": g["id"], "name": g.get("name") or "", "track": g.get("track") or "",
            "p": g.get("periods"),
            "courses": [{"c": c["code"], "n": c["name"], "p": c["periods"],
                         "cond": c["conditional"]} for c in cs],
        })
    got = {"courses": n_courses, "required": n_req, "conditional": n_cond,
           "req_periods": p_req, "suppl_periods": p_sup}
    if got != GROUND_ASSERT:
        raise SystemExit(
            "GROUND COURSE TOTALS CHANGED — this port of FDMS parseGroupCourses "
            "produced %r, the printed syllabus says %r.\nOne parser written twice "
            "drifts silently and the codes still LOOK right, so the build stops here: "
            "re-check the port against D:\\FDMS\\app\\scheduler.js:156-210, or update "
            "GROUND_ASSERT deliberately if the syllabus itself was revised."
            % (got, GROUND_ASSERT))

    # (c) the 8 ground-exam groups — and ONLY those (see the SQL comment)
    exams = []
    for g in fc["groups"]:
        if g.get("kind") != "ground_exam":
            continue
        assert_latin("ground exam", g["id"], g["id"])
        exams.append({"id": g["id"], "name": g.get("name") or "",
                      "track": g.get("track") or "", "p": g.get("periods"),
                      "cond": bool(g.get("conditional"))})
    if len(exams) != 8:
        raise SystemExit("GROUND EXAM COUNT CHANGED — %d groups, the syllabus has 8"
                         % len(exams))

    lines = []
    lines.append('"use strict";')
    lines.append("/* " + "\u2550" * 72)
    lines.append("   Wings Ahead \u2014 syllabus catalogue.  GENERATED FILE \u2014 DO NOT EDIT.")
    lines.append("   " + "\u2500" * 72)
    lines.append("   WA_ITEMS   \u2014 the printed gradesheet items per category, from the FDMS")
    lines.append("                Phase II syllabus item list (data/observations/master_index.json")
    lines.append("                \u2192 contact / instrument / formation / vfr_navigation).")
    lines.append("   WA_SORTIES \u2014 the Phase II sortie codes per category, from the FDMS")
    lines.append("                flow chart (data/flowchart2.json \u2192 sorties[]).")
    lines.append("   Regenerate with:  python tools/gen-items-catalog.py")
    lines.append("")
    lines.append("   WA_ITEMS.categories[].items[]")
    lines.append("     id    \u2014 syllabus item id (e.g. contact-12)")
    lines.append("     n     \u2014 printed item number(s), '12\u201320' when the printed item spans rows,")
    lines.append("             null for CRM (no numbered row)")
    lines.append("     name  \u2014 the printed item name, verbatim")
    lines.append("   WA_SORTIES[categoryId][]")
    lines.append("     c     \u2014 sortie code (e.g. C4302)      n \u2014 printed sortie name")
    lines.append("     b     \u2014 band: 'flights' | 'fs' (simulator)   k \u2014 checkride?")
    lines.append("   WA_SOLO_SLOTS[]  \u2014 the FIXED solo rows of the stage")
    lines.append("     id    \u2014 slot id, stored in solo_flights[].slot (e.g. C4801-04-S1)")
    lines.append("     sec   \u2014 Training Section        track \u2014 syllabus track")
    lines.append("     n/of  \u2014 which solo of that section (F4301-06 prescribes 2)")
    lines.append("     req   \u2014 the section REQUIRES the solo (C4790-91: the 1st SOLO)")
    lines.append("     codes \u2014 the sorties the syllabus names as its solo candidates")
    lines.append("   WA_EVAL_ORDER[]  \u2014 the eight checkrides in SYLLABUS ORDER: the FILE")
    lines.append("             ORDER of the sortie entries of flowchart2.json, i.e. the order")
    lines.append("             of the printed Training Flow Chart. A later evaluation cannot")
    lines.append("             be filled while an earlier one has not been flown (round 6).")
    lines.append("")
    lines.append("   ROUND 12 \u2014 THE LOG TABLES")
    lines.append("   WA_LOG_SORTIES[band][track][]  \u2014 the sorties of ONE log table, in")
    lines.append("             FLOW-CHART ORDER (not code order: WA_SORTIES above is sorted by")
    lines.append("             code, and in ('flights','instrument') the chart runs")
    lines.append("             \u2026 I4602 I4701 I4603 I4890).")
    lines.append("     c/n   \u2014 code and printed name          g \u2014 Training Section")
    lines.append("     o     \u2014 flow-chart position, 1-based    h \u2014 prescribed hours or null")
    lines.append("     nt    \u2014 night     k \u2014 checkride     f1 \u2014 first solo     sc \u2014 solo candidate")
    lines.append("   WA_GROUND[]  \u2014 the 12 theory groups and their 47 courses. The join key")
    lines.append("             for a course is the PAIR (g, c) \u2014 OJT is a course of four groups.")
    lines.append("     g/name/track/p   \u2014 group id, printed name, track, total periods")
    lines.append("     courses[] {c, n, p, cond}  \u2014 code, name, periods, conditional (foreign SPs)")
    lines.append("   WA_EXAMS[]   \u2014 the 8 ground-exam groups {id, name, track, p, cond}.")
    lines.append("             ONLY these: the nested exams[] of four theory groups (FF 190 \u00b7")
    lines.append("             PT 190 \u00b7 A\u0395 190 \u00b7 JX 190 \u00b7 JX 191 \u00b7 NA 191) are COURSES of their")
    lines.append("             group in FDMS, and filing them here too would make the two")
    lines.append("             systems disagree about what a student is owed.")
    lines.append("")
    lines.append("   %d items, %d sortie codes and %d solo slots across %d categories,"
                 % (total, n_sorties, len(slots), len(out_cats)))
    lines.append("   %d log sorties in %d (band, track) tables, %d ground courses in %d"
                 % (sum(len(log_sorties[b][c]) for b in BANDS for c, _ in CATS),
                    len(BANDS) * len(CATS), n_courses, len(ground)))
    lines.append("   theory groups and %d ground exams," % len(exams))
    lines.append("   generated from master_index %s / flow chart %s."
                 % (idx.get("generated_at", "?"), fc.get("generated", "?")))
    lines.append("   " + "\u2550" * 72 + " */")
    lines.append("var WA_ITEMS = {")
    lines.append('  source: "FDMS Phase II syllabus item list (master_index.json, %s)",'
                 % idx.get("generated_at", "?"))
    lines.append("  total: %d," % total)
    lines.append("  categories: [")
    for ci, cat in enumerate(out_cats):
        lines.append('    { id: %s, label: %s, items: ['
                     % (json.dumps(cat["id"]), json.dumps(cat["label"], ensure_ascii=False)))
        for it in cat["items"]:
            lines.append("      { id: %s, n: %s, name: %s },"
                         % (json.dumps(it["id"]),
                            json.dumps(it["n"], ensure_ascii=False),
                            json.dumps(it["name"], ensure_ascii=False)))
        lines.append("    ] }" + ("," if ci < len(out_cats) - 1 else ""))
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    lines.append("/* Phase II sortie codes per category \u2014 the FAIL / ALMOST GOOD flight-code")
    lines.append("   picker (searchable; free text is always accepted as a fallback). */")
    lines.append("var WA_SORTIES = {")
    for ci, (cid, _) in enumerate(CATS):
        lines.append("  %s: [" % json.dumps(cid))
        for r in sorties[cid]:
            lines.append("    { c: %s, n: %s, b: %s%s },"
                         % (json.dumps(r["c"]),
                            json.dumps(r["n"], ensure_ascii=False),
                            json.dumps(r["b"]),
                            ", k: true" if r["k"] else ""))
        lines.append("  ]" + ("," if ci < len(CATS) - 1 else ""))
    lines.append("};")
    lines.append("")
    lines.append("/* The FIXED solo slots of the stage \u2014 one row per solo the syllabus")
    lines.append("   prescribes (flow chart groups with SOLO SORTIES > 0). The Solo flights")
    lines.append("   section renders exactly these, always, and nothing can add or remove one.")
    lines.append("   MIRROR: db/schema.sql \u2192 wa.solo_slots(). Change one, change the other. */")
    lines.append("var WA_SOLO_SLOTS = [")
    for s in slots:
        lines.append("  { id: %s, sec: %s, track: %s, n: %d, of: %d, req: %s,"
                     % (json.dumps(s["id"]), json.dumps(s["sec"]), json.dumps(s["track"]),
                        s["n"], s["of"], "true" if s["req"] else "false"))
        lines.append("    name: %s," % json.dumps(s["name"], ensure_ascii=False))
        lines.append("    codes: [%s] },"
                     % ", ".join(json.dumps(c) for c in s["codes"]))
    lines.append("];")
    lines.append("")
    lines.append("/* THE SYLLABUS ORDER OF THE EIGHT CHECKRIDES (round 6) \u2014 the FILE ORDER of")
    lines.append("   the sortie entries in flowchart2.json, which is the order the printed")
    lines.append("   Training Flow Chart lays the stage out in. Never date order: a later")
    lines.append("   evaluation cannot be FILLED while an earlier one has not been flown, on the")
    lines.append("   client and on the server alike.")
    lines.append("   MIRROR: db/schema.sql \u2192 wa.eval_ids() / wa.eval_pos(). */")
    lines.append("var WA_EVAL_ORDER = [%s];"
                 % ", ".join(json.dumps(c) for c in eval_order))
    lines.append("")

    # \u2550\u2550 ROUND 12 \u2014 THE LOG-TABLE CATALOGUES \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
    lines.append("/* ROUND 12 \u2014 THE SORTIES OF ONE LOG TABLE, IN FLOW-CHART ORDER.")
    lines.append("   Eight lists, one per (band, track): the 4+4 tables the directive asks")
    lines.append("   for. The order is the FILE ORDER of flowchart2.json \u2014 the order the")
    lines.append("   printed Training Flow Chart lays the stage out in \u2014 and NOT the code")
    lines.append("   order WA_SORTIES above carries: in ('flights','instrument') the chart")
    lines.append("   runs \u2026 I4602 I4701 I4603 I4890, the night sortie BEFORE I4603, and")
    lines.append("   sorting by code reorders the stage silently. Both lists exist on")
    lines.append("   purpose: the round-5 pickers keep the order they have always had.")
    lines.append("   NOTHING IS PRE-SEEDED FROM THIS. It is the closed list a sortie is")
    lines.append("   CHOSEN from, never a skeleton of rows: an unflown sortie is not an")
    lines.append("   entry, so wa.slot_empty needs no branch for these sections.")
    lines.append("   MIRROR: db/schema.sql \u2192 wa.sortie_codes() / wa.sortie_band(). */")
    lines.append("var WA_LOG_SORTIES = {")
    for bi, band in enumerate(BANDS):
        lines.append("  %s: {" % json.dumps(band))
        for ci, (cid, _lab) in enumerate(CATS):
            lines.append("    %s: [" % json.dumps(cid))
            for r in log_sorties[band][cid]:
                lines.append("      { c: %s, n: %s, g: %s, o: %d%s%s%s%s%s },"
                             % (json.dumps(r["c"]),
                                json.dumps(r["n"], ensure_ascii=False),
                                json.dumps(r["g"]), r["o"],
                                "" if r["h"] is None else ", h: %s" % json.dumps(r["h"]),
                                ", nt: true" if r["nt"] else "",
                                ", k: true" if r["k"] else "",
                                ", f1: true" if r["f1"] else "",
                                ", sc: true" if r["sc"] else ""))
            lines.append("    ]" + ("," if ci < len(CATS) - 1 else ""))
        lines.append("  }" + ("," if bi < len(BANDS) - 1 else ""))
    lines.append("};")
    lines.append("")
    lines.append("/* THE 12 THEORY GROUPS AND THEIR 47 COURSES (round 12) \u2014 derived by a PORT")
    lines.append("   of the FDMS parser (app/scheduler.js parseGroupCourses) over the printed")
    lines.append("   duration block of each group, and asserted against the four totals it")
    lines.append("   must reproduce: 47 courses \u00b7 45 required + 2 conditional \u00b7 514 required")
    lines.append("   periods \u00b7 26 supplementary. THE JOIN KEY IS THE PAIR (group, course) \u2014")
    lines.append("   never the code alone, because OJT is a course of four different groups.")
    lines.append("   `cond` marks a [suppl.] course (foreign SPs who did not cover it at their")
    lines.append("   Air Force Academy): it is offered and it never blocks anything.")
    lines.append("   MIRROR: db/schema.sql \u2192 wa.lesson_groups() / wa.lesson_courses(). */")
    lines.append("var WA_GROUND = [")
    for g in ground:
        lines.append("  { g: %s, track: %s, p: %s," %
                     (json.dumps(g["g"]), json.dumps(g["track"]), json.dumps(g["p"])))
        lines.append("    name: %s," % json.dumps(g["name"], ensure_ascii=False))
        lines.append("    courses: [")
        for c in g["courses"]:
            lines.append("      { c: %s, n: %s, p: %s%s },"
                         % (json.dumps(c["c"], ensure_ascii=False),
                            json.dumps(c["n"], ensure_ascii=False),
                            json.dumps(c["p"]),
                            ", cond: true" if c["cond"] else ""))
        lines.append("    ] },")
    lines.append("];")
    lines.append("")
    lines.append("/* THE 8 GROUND-EXAM GROUPS (round 12) \u2014 and only these. Four theory groups")
    lines.append("   carry a nested exams[] (FF 190 \u00b7 PT 190 \u00b7 A\u0395 190 \u00b7 JX 190 \u00b7 JX 191 \u00b7")
    lines.append("   NA 191) that a human would naturally file under \"exams\"; FDMS does not,")
    lines.append("   its parser picks them up as COURSES OF THEIR GROUP, and filing them here")
    lines.append("   as well would make the two systems disagree about what is owed.")
    lines.append("   `cond` is JP190 \u2014 \u00abExams on Flight physiology (foreign SPs only)\u00bb \u2014 which")
    lines.append("   a HAF student does not owe. (FDMS's own SchedReady never reads that flag")
    lines.append("   and leaves JP190 pending for ever; the defect is not mirrored here.)")
    lines.append("   MIRROR: db/schema.sql \u2192 wa.exam_ids() / wa.exam_conditional(). */")
    lines.append("var WA_EXAMS = [")
    for e in exams:
        lines.append("  { id: %s, track: %s, p: %s%s, name: %s },"
                     % (json.dumps(e["id"]), json.dumps(e["track"]), json.dumps(e["p"]),
                        ", cond: true" if e["cond"] else "",
                        json.dumps(e["name"], ensure_ascii=False)))
    lines.append("];")
    lines.append("")

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))

    # \u2500\u2500 the SQL mirror, spliced into db/schema.sql between its markers \u2500\u2500\u2500\u2500
    block = sql_block(out_cats, eval_order, fc.get("generated", "?"),
                      idx.get("generated_at", "?"),
                      log_sorties, ground, exams, [s["id"] for s in slots])
    with open(OUT_SQL, encoding="utf-8") as fh:
        sql = fh.read()
    if SQL_BEGIN not in sql or SQL_END not in sql:
        raise SystemExit("db/schema.sql has no GENERATED BLOCK markers \u2014 aborting")
    pat = re.compile(re.escape(SQL_BEGIN) + ".*?" + re.escape(SQL_END), re.S)
    sql2 = pat.sub(lambda _m: block, sql, count=1)
    with open(OUT_SQL, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(sql2)

    print("wrote %s \u2014 %d items, %d sortie codes, %d solo slots (%s)"
          % (os.path.normpath(OUT), total, n_sorties, len(slots),
             ", ".join(s["id"] for s in slots)))
    print("wrote %s \u2014 GENERATED BLOCK: %d checkrides in syllabus order (%s), "
          "%d item names" % (os.path.normpath(OUT_SQL), len(eval_order),
                             " \u2192 ".join(eval_order), total))
    print("round 12 \u2014 log tables: %s"
          % " \u00b7 ".join("%s/%s %d" % (b, c, len(log_sorties[b][c]))
                       for b in BANDS for c, _l in CATS))
    print("round 12 \u2014 ground: %d courses in %d theory groups "
          "(%d required + %d conditional, %d + %d periods), %d ground exams (%s conditional)"
          % (n_courses, len(ground), n_req, n_cond, p_req, p_sup, len(exams),
             ", ".join(e["id"] for e in exams if e["cond"]) or "none"))
    print("round 12 \u2014 every emitted code is pure Latin (assert_latin: %d sorties, "
          "%d courses, %d exams checked)" % (133, n_courses, len(exams)))


if __name__ == "__main__":
    main()
