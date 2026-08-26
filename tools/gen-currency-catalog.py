#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gen-currency-catalog.py — build app/currency-catalog.js from the FDMS
instructor-currency research file, and rewrite the CURRENCY GENERATED BLOCK of
db/schema.sql from the same source, in ONE run.

SOURCE (read-only, NOT part of this repo):
    D:\\FDMS\\data\\requirements\\instructor_currency.json
    → items[] where kind == 'e-item'                       → WA_E_ITEMS

WHY THIS IS SAFE TO TRACK. The E-items are the EVENTS table of the 3-01/2025
ΔΑΕ (Ch.4 §§41-48, PDF 103-107) — published doctrine about what a T-6A
instructor may exercise in the air. They name no person, no call sign and no
squadron: they are the same 28 rows for every instructor in the Air Force.
Nothing personal travels with them, so unlike the roster they belong in the
repository (round-9 privacy rule).

WHAT IS EXCLUDED, AND WHY IT IS EXCLUDED BY NAME.
`e-1d-demo` (Ε-1δ — DEMO) is Chapter-5 doctrine: it belongs to the ΙΠΤΑΜΕΝΟΣ
ΕΠΙΔΕΙΞΗΣ (the display pilot) and to nobody else. FDMS itself hides it from
every instructor who does not hold the post (its ✈ Demo-pilot section, spec
§11θ), and Wings Ahead has no demo-pilot flag to hide it by — so offering it in
a closed list every instructor sees would show fourteen people a currency for a
post one of them might hold. It is dropped HERE, by id, and the drop is printed
in the generated header of both mirrors so the difference between «27» and the
catalog's «28» is never a silent one. A demo pilot records his DEMO where the
demo sheet lives: FDMS.

THE ID IS THE STORED VALUE, AND IT IS PURE ASCII. The printed code is Greek
(«Ε-1α» is a Greek Ε and a Greek α; «Ε» and «E» are homoglyphs), which is
exactly the trap gen-items-catalog.py had to defuse for the course codes. Here
it never arms: what the record stores is the catalog's `id` — `e-1a-aerobatics`
— and the generator ASSERTS that every emitted id matches ^[a-z0-9-]+$ and that
no two ids collide. The Greek code is display only.

Usage (from the repo root):
    python tools/gen-currency-catalog.py [instructor_currency.json]
"""

import json
import os
import re
import sys

DEFAULT_SRC = r"D:\FDMS\data\requirements\instructor_currency.json"
OUT = os.path.join("app", "currency-catalog.js")
OUT_SQL = os.path.join("db", "schema.sql")

SQL_BEGIN = "-- \u25bc\u25bc CURRENCY GENERATED BLOCK \u2014 tools/gen-currency-catalog.py \u2014 DO NOT EDIT BY HAND \u25bc\u25bc"
SQL_END = "-- \u25b2\u25b2 CURRENCY GENERATED BLOCK \u25b2\u25b2"

# Chapter 5 belongs to the display pilot alone — see the module docstring.
EXCLUDED = {
    "e-1d-demo": "Chapter 5 of the 3-01 \u2014 the display pilot's own currency, "
                 "which FDMS shows only to the instructor who holds the post",
}

ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def split_name(printed):
    """'\u0395-1\u03b1 \u2014 Aerobatics (\u0391\u03ba\u03c1\u03bf\u03b2\u03b1\u03c4\u03b9\u03ba\u03ac)' \u2192 ('\u0395-1\u03b1', 'Aerobatics (\u0391\u03ba\u03c1\u03bf\u03b2\u03b1\u03c4\u03b9\u03ba\u03ac)')

    The catalog writes every e-item name as CODE + ' \u2014 ' + the English name.
    A row that does not is a source change, not a formatting quirk, so the
    build FAILS on it rather than emitting a code-less chip."""
    parts = printed.split(" \u2014 ", 1)
    if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
        raise SystemExit(
            "instructor_currency.json: e-item name %r does not read "
            "'CODE \u2014 NAME' \u2014 the parser would emit a chip with no code" % printed)
    return parts[0].strip(), parts[1].strip()


def days_of(item):
    """The printed \u0394\u0399\u0391\u0398\u0395\u03a3\u0399\u039c\u039f\u03a4\u0397\u03a4\u0391 window of the EXPERIENCED (\u0395\u039c\u03a0) column,
    or None where the 3-01 prints no number at all. It is carried for the
    TOOLTIP only \u2014 Wings Ahead records that an E was exercised and on what day;
    FDMS is where the window counts down."""
    v = (item.get("validity_days") or {}).get("experienced")
    if v is None:
        return None
    n = int(v)
    return n if n > 0 else None


def js_esc(s):
    return json.dumps(s, ensure_ascii=False)


def sql_lit(s):
    return "'" + s.replace("'", "''") + "'"


def sql_block(rows, dropped, generated, src_path):
    L = []
    L.append(SQL_BEGIN)
    L.append("-- Generated from the FDMS instructor-currency research file:")
    L.append("--   %s  (%s)" % (generated, src_path.replace("\\", "/")))
    L.append("-- MIRROR: app/currency-catalog.js, written by the same run of the same script.")
    L.append("--")
    L.append("-- THE E-ITEMS OF THE 3-01/2025 \u0394\u0391\u0395 \u2014 the EVENTS table of Ch.4 \u00a748 (PDF 105-107).")
    L.append("-- An instructor's currency row names the events his sortie exercised, and this")
    L.append("-- is the closed list it may name: an id outside it is refused ON WRITE, BY NAME,")
    L.append("-- because a currency claim nobody can look up in the 3-01 is a claim that cannot")
    L.append("-- be audited. The STORED value is the ASCII id \u2014 never the printed Greek code,")
    L.append("-- whose \u0395 and \u03b1 are homoglyphs of Latin E and a and could not be retyped.")
    L.append("--")
    L.append("-- %d of the catalog's %d e-items are here. The one that is not, by name:"
             % (len(rows), len(rows) + len(dropped)))
    for did, why in dropped:
        L.append("--   %s \u2014 %s." % (did, why))
    L.append("create or replace function wa.e_item_ids() returns text[]")
    L.append("language sql immutable as $$")
    L.append("  select array[")
    for i, r in enumerate(rows):
        L.append("    %s%s" % (sql_lit(r["id"]), "," if i < len(rows) - 1 else ""))
    L.append("  ]::text[]")
    L.append("$$;")
    L.append("")
    L.append("-- the printed name of one e-item \u2014 the refusal says WHICH event it could not")
    L.append("-- find, in the words the 3-01 prints, not a slug the instructor never typed")
    L.append("create or replace function wa.e_item_name(p_id text) returns text")
    L.append("language sql immutable as $$")
    L.append("  select case p_id")
    for r in rows:
        L.append("    when %s then %s" % (sql_lit(r["id"]),
                                          sql_lit(r["c"] + " \u2014 " + r["n"])))
    L.append("    else null end")
    L.append("$$;")
    L.append(SQL_END)
    return "\n".join(L)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    with open(src, encoding="utf-8") as fh:
        cat = json.load(fh)
    if cat.get("schema") != "currency-catalog-v1":
        raise SystemExit("unexpected source schema %r \u2014 aborting" % cat.get("schema"))

    rows, dropped = [], []
    for item in cat.get("items", []):
        if item.get("kind") != "e-item":
            continue
        iid = item["id"]
        if iid in EXCLUDED:
            dropped.append((iid, EXCLUDED[iid]))
            continue
        code, name = split_name(item["name"])
        if not ID_RE.match(iid):
            raise SystemExit("e-item id %r is not pure ASCII kebab-case \u2014 aborting" % iid)
        rows.append({"id": iid, "c": code, "n": name,
                     "seat": item.get("seat") or "", "d": days_of(item)})

    seen = set()
    for r in rows:
        if r["id"] in seen:
            raise SystemExit("duplicate e-item id %r \u2014 aborting" % r["id"])
        seen.add(r["id"])
    for did in EXCLUDED:
        if did not in [d for d, _w in dropped]:
            raise SystemExit(
                "the exclusion list names %r and the source no longer carries it \u2014 "
                "the drop must be re-argued against the catalog that exists" % did)
    if not rows:
        raise SystemExit("no e-items found \u2014 aborting")

    generated = cat.get("generated", "?")
    L = []
    L.append("\"use strict\";")
    L.append("/* " + "\u2550" * 72)
    L.append("   Wings Ahead \u2014 INSTRUCTOR CURRENCY catalogue.  GENERATED FILE \u2014 DO NOT EDIT.")
    L.append("   " + "\u2500" * 72)
    L.append("   WA_E_ITEMS \u2014 the E-items of the 3-01/2025 \u0394\u0391\u0395 EVENTS table (Ch.4 \u00a748,")
    L.append("                PDF 105-107), read from the FDMS instructor-currency research")
    L.append("                file (data/requirements/instructor_currency.json, %s)." % generated)
    L.append("   Regenerate with:  python tools/gen-currency-catalog.py")
    L.append("")
    L.append("   WA_E_ITEMS.items[]")
    L.append("     id   \u2014 THE STORED VALUE. Pure ASCII (e-1a-aerobatics), asserted by the")
    L.append("            generator: the printed code is Greek and its \u0395/\u03b1 are homoglyphs of")
    L.append("            Latin E/a, so a stored code would be a value nobody could retype.")
    L.append("     c    \u2014 the printed code, verbatim (\u00ab\u0395-1\u03b1\u00bb)")
    L.append("     n    \u2014 the event name in English, as the catalog prints it")
    L.append("     seat \u2014 the \u0398\u0395\u03a3\u0397 \u03a7\u0395\u0399\u03a1\u0399\u03a3\u03a4\u0397 column: which seat the event counts from")
    L.append("     d    \u2014 the printed \u0394\u0399\u0391\u0398\u0395\u03a3\u0399\u039c\u039f\u03a4\u0397\u03a4\u0391 window in days for an EXPERIENCED")
    L.append("            (\u0395\u039c\u03a0) instructor, or absent where the 3-01 prints no number. It is")
    L.append("            carried for the TOOLTIP only: this application records that an event")
    L.append("            was exercised and on what day \u2014 FDMS is where the window counts down.")
    L.append("")
    L.append("   %d of the catalog's %d e-items. The one that is not, by name:"
             % (len(rows), len(rows) + len(dropped)))
    for did, why in dropped:
        L.append("     %s \u2014 %s." % (did, why))
    L.append("")
    L.append("   MIRROR: db/schema.sql \u2192 wa.e_item_ids() / wa.e_item_name(), written by the")
    L.append("   same run of the same script, so the closed list the form offers and the")
    L.append("   closed list the server enforces cannot drift.")
    L.append("   " + "\u2550" * 72 + " */")
    L.append("var WA_E_ITEMS = {")
    L.append("  source: %s," % js_esc(
        "FDMS instructor currency catalogue (instructor_currency.json, %s) \u2014 "
        "3-01/2025 \u0394\u0391\u0395 Ch.4 \u00a748, EVENTS table" % generated))
    L.append("  total: %d," % len(rows))
    L.append("  excluded: [%s]," % ", ".join(
        "{ id: %s, why: %s }" % (js_esc(d), js_esc(w)) for d, w in dropped))
    L.append("  items: [")
    for r in rows:
        L.append("    { id: %s, c: %s, n: %s, seat: %s%s },"
                 % (js_esc(r["id"]), js_esc(r["c"]), js_esc(r["n"]), js_esc(r["seat"]),
                    "" if r["d"] is None else ", d: %d" % r["d"]))
    L.append("  ],")
    L.append("};")
    L.append("")

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(L))

    block = sql_block(rows, dropped, generated, src)
    with open(OUT_SQL, encoding="utf-8") as fh:
        sql = fh.read()
    if SQL_BEGIN not in sql or SQL_END not in sql:
        raise SystemExit("db/schema.sql has no CURRENCY GENERATED BLOCK markers \u2014 aborting")
    pat = re.compile(re.escape(SQL_BEGIN) + ".*?" + re.escape(SQL_END), re.S)
    sql2 = pat.sub(lambda _m: block, sql, count=1)
    with open(OUT_SQL, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(sql2)

    print("wrote %s \u2014 %d e-items (%s excluded), source generated %s"
          % (os.path.normpath(OUT), len(rows),
             ", ".join(d for d, _w in dropped) or "none", generated))
    print("wrote %s \u2014 CURRENCY GENERATED BLOCK: wa.e_item_ids() (%d) + wa.e_item_name()"
          % (os.path.normpath(OUT_SQL), len(rows)))
    print("every emitted id is pure ASCII kebab-case (assert: %d checked, 0 collisions)"
          % len(rows))


if __name__ == "__main__":
    main()
