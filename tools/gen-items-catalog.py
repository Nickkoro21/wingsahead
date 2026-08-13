#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gen-items-catalog.py — build app/items-catalog.js from the FDMS syllabus data.

SOURCES (read-only, NOT part of this repo):
    D:\\FDMS\\data\\observations\\master_index.json
    → categories contact / instrument / formation / vfr_navigation
      → items[] {item_id, item_name, mif_numbers}          → WA_ITEMS
    D:\\FDMS\\data\\flowchart2.json
    → sorties[] {id, track, band, name, checkride}         → WA_SORTIES

The generated file is a plain <script> catalogue used by the FAIL /
ALMOST GOOD rows: category select → multi-select of that category's syllabus
items (WA_ITEMS) and a searchable flight-code picker (WA_SORTIES).
No student data is involved — syllabus structure only.

Usage (from the repo root):
    python tools/gen-items-catalog.py [master_index.json] [flowchart2.json]
"""

import json
import os
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
    lines.append("")
    lines.append("   %d items and %d sortie codes across %d categories,"
                 % (total, n_sorties, len(out_cats)))
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

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))
    print("wrote %s \u2014 %d items, %d sortie codes"
          % (os.path.normpath(OUT), total, n_sorties))


if __name__ == "__main__":
    main()
