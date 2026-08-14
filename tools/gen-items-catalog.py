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
    → sorties[] in FILE ORDER, checkride == true           → WA_EVAL_ORDER
    → groups[]  {id, sorties_solo, solo_candidate_sorties} → WA_SOLO_SLOTS

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


def sq(s):
    """one SQL string literal, quotes doubled."""
    return "'" + str(s).replace("'", "''") + "'"


def sql_block(cats, evals, flow_generated, idx_generated):
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
    lines.append("   %d items, %d sortie codes and %d solo slots across %d categories,"
                 % (total, n_sorties, len(slots), len(out_cats)))
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

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))

    # \u2500\u2500 the SQL mirror, spliced into db/schema.sql between its markers \u2500\u2500\u2500\u2500
    block = sql_block(out_cats, eval_order, fc.get("generated", "?"),
                      idx.get("generated_at", "?"))
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


if __name__ == "__main__":
    main()
