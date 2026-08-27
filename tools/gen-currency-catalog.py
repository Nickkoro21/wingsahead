#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gen-currency-catalog.py — build app/currency-catalog.js from the FDMS
instructor-currency research file, and rewrite the CURRENCY GENERATED BLOCK of
db/schema.sql from the same source, in ONE run.

SOURCE (read-only, NOT part of this repo):
    D:\\FDMS\\data\\requirements\\instructor_currency.json
    → items[] where kind == 'e-item'                       → WA_E_ITEMS
    → items[] where kind in ('s-category', 'sim')          → WA_S_CATEGORIES

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

────────────────────────────────────────────────────────────────────────────────
ROUND 20 — THE Σ TAXONOMY (WA_S_CATEGORIES)
────────────────────────────────────────────────────────────────────────────────
RULING (2026-08-27): «θα έπρεπε να έχουμε ποια S είναι και δυνατότητα πολλαπλών
Ε. Αφού θα τροφοδοτούν το ίδιο σχήμα με το FDMS να τα έχουμε σωστά.»

Round 19 stored the programme — ΑΕΡΟΣ or F/S — and stopped there. That is the
TABLE a sortie belongs to, not the SORTIE: Πίνακας 9 has five Σ rows in it and
Πίνακας 6 six SIM rows, and «ΑΕΡΟΣ» says which of them was flown exactly as
little as «a flight» says which aircraft. So the row now carries the CATEGORY,
and the programme is derived from it — one fact where there were two, and the
one FDMS's own currency card is keyed by.

WHAT IS IN THE CATALOG, AND WHERE EACH ROW COMES FROM
  · the six ΑΕΡΟΣ rows of Πίνακας 9 — kind 's-category' in the source
    (Σ-1 · Σ-2 day · Σ-2 night · Σ-3 · Σ-4 · Σ-20);
  · the six F/S rows of Πίνακας 6 — kind 'sim'
    (SIM-1 · SIM-2 · SIM-3 · SIM-4 · SIM-5 · SIM-ΔΑ);
  · THE TWO RECORDING AIDS FDMS carries as columns of its own ΑΕΡΟΣ table and
    the 3-01 prints nowhere — «Νυχτερινή με μαθητές» and «Πτήση δοκιμής (FCF)».
    They are declared HERE, by id and by printed name, because they are not
    rows of the research file: FDMS's app/currency.js declares them in its SYNTH
    table for the same reason («they exist because the squadron flies both and
    wants them WRITTEN DOWN»), and the two applications must not disagree about
    what a night sortie with students is called. The generator ASSERTS, when the
    FDMS client is found beside the research file, that FDMS still carries each
    id and each printed name verbatim — a rename over there fails the build over
    here rather than quietly forking the taxonomy. The assert never changes a
    single emitted byte: the file being absent is a printed warning, not a
    different catalog.
  · TWO LEGACY IDS, one per programme — `legacy-aeros-unspecified` and
    `legacy-fs-unspecified`. See below.

WHAT IS EXCLUDED FROM THE Σ CATALOG, AND WHY, BY NAME
  · `semiannual-air-total-t6` / `semiannual-fs-total-t6` — the ΣΥΝΟΛΟ rows.
    A total is not a sortie anybody flies; offering it would let an instructor
    record «I flew a total».
  · `sim-refresh-after-abstention` — §49 prints a THRESHOLD IN DAYS, not a
    category: the sortie it demands is a SIM-1, which is already in the list.

THE TWO LEGACY IDS, AND WHY THERE ARE TWO. A round-19 row knows its programme
('aeros' / 'fs') and cannot know its Σ — nobody can reconstruct from «ΑΕΡΟΣ» on
the 26th whether the sortie was a Σ-1 or a Σ-3. The migration therefore refuses
to guess: it maps the programme it HAS onto a category that says, in the words
it renders with, that the Σ was never recorded. Two ids and not one because the
programme is a fact the old row really did carry, and folding both into a single
«unspecified» would throw away something true in order to say something honest.
They are STORABLE (a migrated record must round-trip without the server refusing
rows the instructor never touched) and never OFFERED (no new row can claim one).

────────────────────────────────────────────────────────────────────────────────
ROUND 21 — THE DEMO FLIGHT (x-demo-flight)
────────────────────────────────────────────────────────────────────────────────
RULING (2026-08-28): «Πρόσθεσε και το demo flight.»

One more generated category — the display pilot's own sortie. The 3-01 prints
it in CHAPTER 5, not in Πίνακας 9: FDMS carries demo as a table of its own
(app/currency.js → DEMO_IDS, six records, gated on the roster's `demo_pilot`
flag), and §37α counts the demo sortie — with the FCF, in one sentence — inside
Σ-1 for those available. It sits AFTER x-fcf-flight and before the aeros legacy
id, because §37α couples FCF and DEMO in one sentence and the two aids of that
sentence should sit together.

MARKED, NOT HIDDEN — the x-fcf reasoning, verbatim: Wings Ahead's roster has NO
`demo_pilot` flag at all (FDMS's is the curated one, deliberately not imported
this round), so hiding the option is not even possible without inventing a flag
— and an invented, unset flag would stop a man recording a flight he really
flew. `dp: true` (the `tp` mechanism, second instance) renders «Demo pilots
only» beside the option and in the tooltip; the server accepts any catalogue id
regardless, exactly as it does for `tp`.

GENERATED-FROM-SOURCE ASSERT (assert_demo_against_source): the research file
must still carry `e-1d-demo` (kind e-item) AND `demo-500ft-currency` (kind
recency) — the two records the category is generated to be consistent with; if
either vanishes, the build FAILS («the demo category must be re-argued against
the catalog that exists») — the exclusion-list assert pattern, third instance.
It does NOT assert against FDMS's app/currency.js: demo is not a SYNTH column
there (it is the DEMO_IDS table), so the S_AIDS client assert does not apply.

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

# the Σ rows of the research file that are NOT a kind of sortie — see docstring
S_EXCLUDED = {
    "semiannual-air-total-t6":
        "the printed ΣΥΝΟΛΟ ΕΞΟΔΩΝ row of Πίνακας 9 — "
        "a total is not a sortie anybody flies",
    "semiannual-fs-total-t6":
        "the printed ΣΥΝΟΛΑ row of Πίνακας 6 — "
        "a total is not a sortie anybody flies",
    "sim-refresh-after-abstention":
        "§49 prints a THRESHOLD IN DAYS, not a category — the sortie it demands is a SIM-1, "
        "which is in the list already",
}

# the source `kind` of each programme, and the programme key Wings Ahead stores
S_GROUP_OF_KIND = {"s-category": "aeros", "sim": "fs"}

# ── THE TWO RECORDING AIDS, DECLARED — see the docstring. `id` and `name` are
# FDMS's own (app/currency.js → SYNTH) and are asserted against it when the FDMS
# client is found beside the research file.
S_AIDS = [
    {"id": "x-night-students", "g": "aeros", "after": "s-20-no-requirements",
     "name": "Νυχτερινή με μαθητές — Night sortie flown with students",
     "why": "the 3-01 prints no such requirement — FDMS carries it as a column of its own because "
            "the squadron flies it, and because a night sortie is what keeps the night-landing "
            "currency alive"},
    {"id": "x-fcf-flight", "g": "aeros", "after": "x-night-students", "tp": True,
     "name": "Πτήση δοκιμής (FCF) — Aircraft test flight",
     "why": "a functional check flight is flown by the squadron's Test Pilots and is not a "
            "Πίνακας 9 requirement — FDMS carries it as a column of its own, and it is "
            "what dates the Ε-1γ row of the EVENTS table"},
]

# ── THE TEST-PILOT ROWS, DECLARED. The research file says so in Greek prose
# («Η έξοδος SIM-ΔΑ ισχύει μόνο για τους Δοκιμαστές της Μοίρας») and FDMS marks
# it by hand in its own quota table (`tp_only: true`) for exactly that reason —
# a flag parsed out of a sentence is a flag that breaks when the sentence is
# rewritten. Declared here, ASSERTED to exist, and used only to MARK the option:
# Wings Ahead does not hide it, because its `test_pilot` flag comes from the
# shared roster and an unset one would block a man from recording a flight he
# really flew. FDMS, whose flag is curated, hides its FCF column; this form
# says «Test Pilots only» beside the option and lets the squadron read it.
S_TP_ONLY = {"sim-da"}

# ── THE DEMO FLIGHT, DECLARED (round 21) — see the docstring. Chapter-5
# doctrine, not a Πίνακας 9 row: `aid` because the 3-01 prints no semester row
# for it, `dp` because it belongs to the ΙΠΤΑΜΕΝΟΣ ΕΠΙΔΕΙΞΗΣ — MARKED, never
# hidden, because Wings Ahead's roster has no demo_pilot flag to hide it by.
S_DEMO = [
    {"id": "x-demo-flight", "g": "aeros", "after": "x-fcf-flight", "dp": True,
     "name": "Πτήση επίδειξης (DEMO) — Display flight (demo sortie)",
     "why": "the 3-01 prints it in Chapter 5 — the display pilot's own sortie. FDMS carries "
            "demo as a table of its own, gated on the demo_pilot flag, and §37α counts it "
            "(with the FCF) inside Σ-1 for those available. Wings Ahead has no demo-pilot "
            "flag, so the option is MARKED, never hidden — the x-fcf reasoning, verbatim"},
]

# ── THE TWO LEGACY IDS — see the docstring. Declared, never derived: they exist
# because round 19 stored a programme and no category, and they are what a
# round-19 row becomes when a round-20 reader reads it.
S_LEGACY = [
    {"id": "legacy-aeros-unspecified", "g": "aeros",
     "name": "ΑΕΡΟΣ — unspecified (recorded before the Σ taxonomy)"},
    {"id": "legacy-fs-unspecified", "g": "fs",
     "name": "F/S — unspecified (recorded before the Σ taxonomy)"},
]

LEGACY_WHY = ("a round-19 row that stored only the programme. The Σ was never recorded and cannot be "
              "guessed from a date — it is shown marked, everywhere, and needs the developer's hand")

ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
# «2 sortie(s) per semester (posted) / 1 (attached)», and the two shapes the
# research file writes where the 3-01 prints a dash instead of a number
QUOTA_RE = re.compile(r"^(.*?) sortie\(s\) per semester \(posted\) / (.*?) \(attached\)$")


def split_name(printed, what="e-item"):
    """'\u0395-1\u03b1 \u2014 Aerobatics (\u0391\u03ba\u03c1\u03bf\u03b2\u03b1\u03c4\u03b9\u03ba\u03ac)' \u2192 ('\u0395-1\u03b1', 'Aerobatics (\u0391\u03ba\u03c1\u03bf\u03b2\u03b1\u03c4\u03b9\u03ba\u03ac)')

    The catalog writes every e-item name \u2014 and every \u03a3 category name, and both
    of FDMS's two recording aids \u2014 as CODE + ' \u2014 ' + the English name. A row
    that does not is a source change, not a formatting quirk, so the build FAILS
    on it rather than emitting a code-less chip."""
    parts = printed.split(" \u2014 ", 1)
    if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
        raise SystemExit(
            "instructor_currency.json: %s name %r does not read "
            "'CODE \u2014 NAME' \u2014 the parser would emit a chip with no code" % (what, printed))
    return parts[0].strip(), parts[1].strip()


def quota_of(item):
    """The printed semester quota of one \u03a3 row \u2014 (posted, attached), either an
    int or None where the 3-01 prints a dash \u00ab-\u00bb. Carried for the TOOLTIP only:
    Wings Ahead records that a sortie was flown and on what day, and FDMS is
    where the semester is counted against \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 6 / \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 9."""
    pp = str((item.get("validity_days") or {}).get("printed_period") or "")
    m = QUOTA_RE.match(pp)
    if not m:
        raise SystemExit(
            "instructor_currency.json: the printed_period of %r does not read "
            "'N sortie(s) per semester (posted) / M (attached)' \u2014 %r" % (item.get("id"), pp))
    num = lambda s: int(s) if s.strip().isdigit() else None
    return num(m.group(1)), num(m.group(2))


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


# ROUND 20 — AND THE GENERATED FUNCTIONS PIN THEIR OWN search_path. The round
# pinned every wa.* function schema-wide; the ones below are WRITTEN BY THIS
# SCRIPT, so the clause has to live in the emitter or the next regeneration
# would silently unpin them and the schema's own load-time audit would fail the
# deployment. The string is the one every other wa function carries, verbatim.
SQL_SET = "set search_path = public, wa, pg_temp"


def sql_block(rows, srows, dropped, sdropped, generated, src_path):
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
    L.append("language sql immutable %s as $$" % SQL_SET)
    L.append("  select array[")
    for i, r in enumerate(rows):
        L.append("    %s%s" % (sql_lit(r["id"]), "," if i < len(rows) - 1 else ""))
    L.append("  ]::text[]")
    L.append("$$;")
    L.append("")
    L.append("-- the printed name of one e-item \u2014 the refusal says WHICH event it could not")
    L.append("-- find, in the words the 3-01 prints, not a slug the instructor never typed")
    L.append("create or replace function wa.e_item_name(p_id text) returns text")
    L.append("language sql immutable %s as $$" % SQL_SET)
    L.append("  select case p_id")
    for r in rows:
        L.append("    when %s then %s" % (sql_lit(r["id"]),
                                          sql_lit(r["c"] + " \u2014 " + r["n"])))
    L.append("    else null end")
    L.append("$$;")
    L.append("")
    L.append("-- \u2500\u2500 THE \u03a3 CATEGORIES (round 20) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
    L.append("-- WHICH SORTIE it was, not merely which table it belongs to. \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 9 has")
    L.append("-- %d \u0391\u0395\u03a1\u039f\u03a3 rows in it and \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 6 %d F/S rows, and \u00ab\u0391\u0395\u03a1\u039f\u03a3\u00bb names one of them"
             % (sum(1 for r in srows if r["g"] == "aeros" and not r.get("aid") and not r.get("legacy")),
                sum(1 for r in srows if r["g"] == "fs" and not r.get("legacy"))))
    L.append("-- exactly as little as \u00aba flight\u00bb names an aircraft. The programme is DERIVED")
    L.append("-- from the category (wa.s_category_group), so the two can never disagree.")
    L.append("--")
    L.append("-- %d categories. What is in the list and is not a row of the 3-01:" % len(srows))
    for r in srows:
        if r.get("aid"):
            L.append("--   %s \u2014 %s." % (r["id"], r["why"]))
    for r in srows:
        if r.get("legacy"):
            L.append("--   %s \u2014 %s." % (r["id"], LEGACY_WHY))
    L.append("-- And what the research file carries that is NOT a kind of sortie, by name:")
    for did, why in sdropped:
        L.append("--   %s \u2014 %s." % (did, why))
    L.append("create or replace function wa.s_category_ids() returns text[]")
    L.append("language sql immutable %s as $$" % SQL_SET)
    L.append("  select array[")
    for i, r in enumerate(srows):
        L.append("    %s%s" % (sql_lit(r["id"]), "," if i < len(srows) - 1 else ""))
    L.append("  ]::text[]")
    L.append("$$;")
    L.append("")
    L.append("-- the printed name of one \u03a3 category \u2014 the refusal names the category it could")
    L.append("-- not find in the words \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 6 / \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 9 print, never a slug")
    L.append("create or replace function wa.s_category_name(p_id text) returns text")
    L.append("language sql immutable %s as $$" % SQL_SET)
    L.append("  select case p_id")
    for r in srows:
        L.append("    when %s then %s" % (sql_lit(r["id"]),
                                          sql_lit(r["c"] + " \u2014 " + r["n"])))
    L.append("    else null end")
    L.append("$$;")
    L.append("")
    L.append("-- WHICH PROGRAMME a category belongs to \u2014 'aeros' (\u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 9) or 'fs'")
    L.append("-- (\u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 6). Round 19 STORED this; from round 20 it is derived, so a row")
    L.append("-- cannot claim a \u03a3-3 flown in the simulator.")
    L.append("create or replace function wa.s_category_group(p_id text) returns text")
    L.append("language sql immutable %s as $$" % SQL_SET)
    L.append("  select case p_id")
    for r in srows:
        L.append("    when %s then %s" % (sql_lit(r["id"]), sql_lit(r["g"])))
    L.append("    else null end")
    L.append("$$;")
    L.append("")
    L.append("-- THE LEGACY IDS \u2014 storable, never offered. A round-19 row carried a programme")
    L.append("-- and no category; the \u03a3 cannot be guessed from a date, so the migration says")
    L.append("-- so in the id itself and every surface renders it marked.")
    L.append("create or replace function wa.s_category_legacy_ids() returns text[]")
    L.append("language sql immutable %s as $$" % SQL_SET)
    L.append("  select array[%s]::text[]"
             % ", ".join(sql_lit(r["id"]) for r in srows if r.get("legacy")))
    L.append("$$;")
    L.append(SQL_END)
    return "\n".join(L)


def assert_aids_against_fdms(src_path):
    """The two recording aids are DECLARED here and OWNED by FDMS. If the FDMS
    client is found beside the research file, every declared id and every
    declared printed name must still be inside it verbatim — a rename over there
    fails the build over here instead of quietly forking the taxonomy.

    IT NEVER CHANGES AN EMITTED BYTE. The file being absent prints a warning and
    the catalog is identical either way, so the output stays byte-idempotent on
    a machine that has Wings Ahead and not FDMS."""
    # …/FDMS/data/requirements/instructor_currency.json → …/FDMS/app/currency.js
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(src_path))))
    client = os.path.join(root, "app", "currency.js")
    if not os.path.isfile(client):
        print("note: %s not found — the two recording aids could not be checked "
              "against FDMS (the catalog is unaffected)" % client)
        return
    with open(client, encoding="utf-8") as fh:
        js = fh.read()
    for aid in S_AIDS:
        for what, val in (("id", aid["id"]), ("printed name", aid["name"])):
            if val not in js:
                raise SystemExit(
                    "FDMS no longer carries the %s %r of the recording aid %r — the two "
                    "applications would disagree about what the column is called. Re-argue "
                    "the declaration against %s." % (what, val, aid["id"], client))
    print("the %d recording aids still match FDMS verbatim (%s)"
          % (len(S_AIDS), client))


def assert_demo_against_source(cat):
    """ROUND 21 — the demo category is generated to be CONSISTENT WITH two
    records of the research file: the excluded EVENTS row `e-1d-demo` (Ε-1δ —
    DEMO) and the Ch.5 §17 recency `demo-500ft-currency` (the 15-day display
    currency the dated x-demo-flight row is what feeds). If either vanishes
    from the source, the category can no longer claim to be generated from
    anything and the build FAILS — the exclusion-list assert pattern, third
    instance.

    It does NOT assert against FDMS's app/currency.js: demo is not a SYNTH
    column over there (it is the DEMO_IDS table, gated on demo_pilot), so the
    S_AIDS client assert does not apply to it."""
    want = {"e-1d-demo": "e-item", "demo-500ft-currency": "recency"}
    have = {it.get("id"): it.get("kind") for it in cat.get("items", [])}
    for iid, kind in want.items():
        if have.get(iid) != kind:
            raise SystemExit(
                "the demo category is argued against %r (kind %r) and the source no "
                "longer carries it — the demo category must be re-argued against the "
                "catalog that exists" % (iid, kind))
    print("the demo category still matches its two source records "
          "(e-1d-demo e-item + demo-500ft-currency recency)")


def build_s_categories(cat, src_path):
    """The Σ taxonomy: the printed rows of Πίνακας 9 and Πίνακας 6, plus the two
    aids FDMS carries as columns of its own, plus the demo flight of Chapter 5
    (round 21), plus the two legacy ids.

    THE ORDER IS THE PRINTED ONE, ΑΕΡΟΣ FIRST. Inside each programme the rows
    keep the order of the research file (which is the order of the table); the
    aids sit where FDMS puts them — after Σ-20, before nothing — the demo
    flight follows the FCF (§37α couples the two in one sentence), and each
    programme's legacy id closes it, because a value nothing may be recorded
    under does not belong among the values that may."""
    assert_aids_against_fdms(src_path)
    assert_demo_against_source(cat)
    found, dropped = {}, []
    for item in cat.get("items", []):
        kind = item.get("kind")
        if kind not in S_GROUP_OF_KIND:
            continue
        iid = item["id"]
        if iid in S_EXCLUDED:
            dropped.append((iid, S_EXCLUDED[iid]))
            continue
        if not ID_RE.match(iid):
            raise SystemExit("Σ id %r is not pure ASCII kebab-case — aborting" % iid)
        code, name = split_name(item["name"], "Σ category")
        posted, attached = quota_of(item)
        found.setdefault(S_GROUP_OF_KIND[kind], []).append(
            {"id": iid, "c": code, "n": name, "g": S_GROUP_OF_KIND[kind],
             "p": posted, "a": attached, "tp": iid in S_TP_ONLY})
    have = {r["id"] for g in found.values() for r in g}
    for tid in S_TP_ONLY:
        if tid not in have:
            raise SystemExit(
                "the Test-Pilot list names %r and the source no longer carries it — "
                "the mark must be re-argued against the catalog that exists" % tid)
    for did in S_EXCLUDED:
        if did not in [d for d, _w in dropped]:
            raise SystemExit(
                "the Σ exclusion list names %r and the source no longer carries it — "
                "the drop must be re-argued against the catalog that exists" % did)
    if not found.get("aeros") or not found.get("fs"):
        raise SystemExit("the source carries no Σ categories for one of the two "
                         "programmes — aborting")

    out = []
    for g in ("aeros", "fs"):
        out.extend(found.get(g, []))
        for aid in S_AIDS:
            if aid["g"] != g:
                continue
            code, name = split_name(aid["name"], "recording aid")
            out.append({"id": aid["id"], "c": code, "n": name, "g": g,
                        "p": None, "a": None, "aid": True,
                        "why": aid["why"], "tp": bool(aid.get("tp"))})
        for dm in S_DEMO:
            if dm["g"] != g:
                continue
            code, name = split_name(dm["name"], "demo category")
            out.append({"id": dm["id"], "c": code, "n": name, "g": g,
                        "p": None, "a": None, "aid": True,
                        "why": dm["why"], "dp": True})
        for leg in S_LEGACY:
            if leg["g"] != g:
                continue
            code, name = split_name(leg["name"], "legacy category")
            out.append({"id": leg["id"], "c": code, "n": name, "g": g,
                        "p": None, "a": None, "legacy": True})
    seen = set()
    for r in out:
        if r["id"] in seen:
            raise SystemExit("duplicate Σ id %r — aborting" % r["id"])
        seen.add(r["id"])
    return out, dropped


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

    srows, sdropped = build_s_categories(cat, src)

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
    L.append("   WA_S_CATEGORIES \u2014 the \u03a3 TAXONOMY (round 20): WHICH sortie was flown, not")
    L.append("                merely which table it belongs to. The %d printed rows of \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 9"
             % sum(1 for r in srows if r["g"] == "aeros" and not r.get("aid") and not r.get("legacy")))
    L.append("                (\u0391\u0395\u03a1\u039f\u03a3) and \u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 6 (F/S), the %d recording aids FDMS carries as"
             % sum(1 for r in srows if r.get("aid") and not r.get("dp")))
    L.append("                columns of its own, the %d demo flight of Chapter 5 (round 21,"
             % sum(1 for r in srows if r.get("dp")))
    L.append("                Demo pilots only \u2014 marked, never hidden), and %d legacy ids for the"
             % sum(1 for r in srows if r.get("legacy")))
    L.append("                rows round 19 stored before this taxonomy existed.")
    L.append("")
    L.append("   WA_S_CATEGORIES.items[]")
    L.append("     id     \u2014 THE STORED VALUE, pure ASCII, asserted like the e-item ids")
    L.append("     c      \u2014 the printed code (\u00ab\u03a3-3\u00bb, \u00abSIM-\u0394\u0391\u00bb) or, for the two aids, the Greek")
    L.append("              head FDMS prints over the column")
    L.append("     n      \u2014 the name in English, as the source prints it")
    L.append("     g      \u2014 the PROGRAMME: 'aeros' (\u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 9) or 'fs' (\u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2 6). Round 19")
    L.append("              stored this on the row; from round 20 it is DERIVED from the")
    L.append("              category, so a \u03a3-3 cannot claim to have been flown in the simulator.")
    L.append("     p / a  \u2014 the printed semester quota for a POSTED / ATTACHED instructor, or")
    L.append("              absent where the 3-01 prints a dash. Tooltip only: this application")
    L.append("              records that a sortie was flown and on what day, and FDMS is where")
    L.append("              the semester is counted against the printed table.")
    L.append("     aid    \u2014 true for a row the 3-01 does not print (FDMS's two columns); `why`")
    L.append("              carries the reason.")
    L.append("     tp     \u2014 true where only Test Pilots fly it. The option is MARKED, never")
    L.append("              hidden: this application's test_pilot flag comes from the shared")
    L.append("              roster, and an unset one must not stop a man recording a flight.")
    L.append("     dp     \u2014 true where only the DEMO PILOT flies it (round 21 \u2014 the tp")
    L.append("              mechanism, second instance). Marked, never hidden: this roster has")
    L.append("              no demo_pilot flag at all \u2014 FDMS's is the curated one \u2014 so hiding")
    L.append("              would need an invented flag, and an unset invented flag would stop")
    L.append("              a man recording a flight he really flew.")
    L.append("     legacy \u2014 true for a value that may be STORED and must never be OFFERED.")
    L.append("")
    L.append("   MIRROR: db/schema.sql \u2192 wa.e_item_ids() / wa.e_item_name() /")
    L.append("   wa.s_category_ids() / wa.s_category_name() / wa.s_category_group() /")
    L.append("   wa.s_category_legacy_ids(), written by the same run of the same script, so the")
    L.append("   closed lists the form offers and the closed lists the server enforces cannot")
    L.append("   drift.")
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
    L.append("var WA_S_CATEGORIES = {")
    L.append("  source: %s," % js_esc(
        "FDMS instructor currency catalogue (instructor_currency.json, %s) — "
        "3-01/2025 ΔΑΕ Ch.4, Πίνακας 9 (ΑΕΡΟΣ) and Πίνακας 6 (F/S), plus the two "
        "recording aids FDMS carries as columns of its own" % generated))
    L.append("  total: %d," % len(srows))
    L.append("  excluded: [%s]," % ", ".join(
        "{ id: %s, why: %s }" % (js_esc(d), js_esc(w)) for d, w in sdropped))
    L.append("  legacyWhy: %s," % js_esc(LEGACY_WHY))
    L.append("  items: [")
    for r in srows:
        bits = ["id: %s" % js_esc(r["id"]), "c: %s" % js_esc(r["c"]),
                "n: %s" % js_esc(r["n"]), "g: %s" % js_esc(r["g"])]
        if r["p"] is not None:
            bits.append("p: %d" % r["p"])
        if r["a"] is not None:
            bits.append("a: %d" % r["a"])
        if r.get("aid"):
            bits.append("aid: true")
            bits.append("why: %s" % js_esc(r["why"]))
        if r.get("tp"):
            bits.append("tp: true")
        if r.get("dp"):
            bits.append("dp: true")
        if r.get("legacy"):
            bits.append("legacy: true")
        L.append("    { %s }," % ", ".join(bits))
    L.append("  ],")
    L.append("};")
    L.append("")

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(L))

    block = sql_block(rows, srows, dropped, sdropped, generated, src)
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
    print("             \u2014 %d \u03a3 categories: %d \u0391\u0395\u03a1\u039f\u03a3 + %d F/S printed rows, %d recording "
          "aids, %d demo (dp), %d legacy (%s excluded)"
          % (len(srows),
             sum(1 for r in srows if r["g"] == "aeros" and not r.get("aid") and not r.get("legacy")),
             sum(1 for r in srows if r["g"] == "fs" and not r.get("legacy")),
             sum(1 for r in srows if r.get("aid") and not r.get("dp")),
             sum(1 for r in srows if r.get("dp")),
             sum(1 for r in srows if r.get("legacy")),
             ", ".join(d for d, _w in sdropped) or "none"))
    print("wrote %s \u2014 CURRENCY GENERATED BLOCK: wa.e_item_ids() (%d) + wa.e_item_name() + "
          "wa.s_category_ids() (%d) + wa.s_category_name() + wa.s_category_group() + "
          "wa.s_category_legacy_ids()"
          % (os.path.normpath(OUT_SQL), len(rows), len(srows)))
    print("every emitted id is pure ASCII kebab-case (assert: %d checked, 0 collisions)"
          % (len(rows) + len(srows)))


if __name__ == "__main__":
    main()
