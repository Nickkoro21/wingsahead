#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gen-people-import.py — turn the PRIVATE global roster into a people-import.sql
you paste into the Supabase SQL editor.

    python tools/gen-people-import.py <roster.json> [-o people-import.sql]
                                      [--base-url https://<user>.github.io/wingsahead]
                                      [--classes "98B HAF"]

═══ THE PRIVACY GATE — READ THIS FIRST ═══════════════════════════════════════
The roster is the squadron's real personnel list. It lives OUTSIDE this repo
(D:\\FDMS-roster\\roster.json) and so must its output: the generated SQL carries
real names, ranks and call signs, and it must NEVER be committed. This script
therefore writes NEXT TO THE ROSTER by default, refuses point blank to write
inside a git working tree, and the repo git-ignores people-import.sql as a
second line of defence. The demo seed of this repo keeps its fake people for
ever.
══════════════════════════════════════════════════════════════════════════════

WHAT THE GENERATED SQL DOES

  · UPSERT BY external_oid — the roster's IMMUTABLE object id ('R-nnnn') is
    the identity. An id already in the database is UPDATED IN PLACE; a new one
    is CREATED. Anybody the roster does not mention is LEFT ALONE: departures
    stay a decision somebody makes on purpose, never a side effect of a file.
  · THE TOKEN IS NEVER TOUCHED ON UPDATE. A personal link the CO has already
    distributed keeps working through any number of re-runs; a NEW person gets
    a token minted by the column default. Re-running the script is therefore
    safe by construction, which is the only way an import ever gets used twice.
  · A FIELD THE ROSTER SAYS NOTHING ABOUT IS NOT WRITTEN. `mn` is null for
    everyone until the user supplies the numbers, so an import must not blank
    an MN somebody typed into the People tab: every nullable column is written
    as coalesce(new, old).
  · `active` is set on INSERT only — a link the CO revoked stays revoked until
    he says otherwise.
  · The final SELECT prints SURNAME · ROLE · PERSONAL LINK for every person in
    the database — the CO's copy-paste distribution sheet.

The SQL is idempotent: run it as many times as you like.

═══ --classes : WHO GOES LIVE FIRST ══════════════════════════════════════════
The squadron does not start with everybody. The first class to use this app is
one class, and the rest join when that one has proved it — so the import can be
narrowed to the classes that are actually going live:

    --classes "98B HAF"                 one class
    --classes "98B HAF" --classes 99A   repeatable
    --classes "98B HAF,99A"             or comma-separated, same thing

WHAT IT DOES AND DOES NOT DO
  · It filters STUDENTS ONLY. Every instructor in the roster is imported every
    time: an instructor flies with whoever is on the programme, the student
    form offers their surnames as its picker, and a squadron half-imported
    would show a student a half-list of the people they fly with.
  · WITHOUT the flag NOTHING changes: everybody in the roster is imported,
    exactly as before.
  · Matching is on the roster's `class` field, case- and space-insensitive
    ("98b haf" finds "98B HAF"). A class nobody is in is a TYPO and stops the
    run — a silent zero-student import is the one failure this script must
    never hand somebody at launch.
  · It filters what the SQL WRITES, never what is already in the database:
    students of another class already imported are left exactly as they are
    (as is anybody the roster does not mention). Widening the scope later is
    just another run with more classes named.
══════════════════════════════════════════════════════════════════════════════
"""

import argparse
import json
import os
import sys
from datetime import date

# roster status → the wa_status enum of this app (Assigned / Attached /
# Departed are exactly the three the enum already carries, so this is an
# identity map with a safety net for anything unexpected).
STATUS = {"Assigned": "Assigned", "Attached": "Attached", "Departed": "Departed"}
DUTIES = {"Squadron Commander", "DO", "Flight Commander", "Evaluator", "Instructor"}
LEADERSHIPS = {"Wingman", "2-ship", "4-ship", "Mission Commander"}


def q(v):
    """A SQL literal for a text value; None / '' become NULL."""
    if v is None:
        return "null"
    s = str(v).strip()
    if s == "":
        return "null"
    return "'" + s.replace("'", "''") + "'"


def qb(v):
    return "true" if v else "false"


def enum(v, allowed, col):
    """Enum-typed columns raise on an unknown value — say so HERE, where the
    line number of the roster entry is still known, instead of letting the
    squadron discover it as a Postgres error inside the SQL editor."""
    if v is None or str(v).strip() == "":
        return "null"
    s = str(v).strip()
    if s not in allowed:
        raise SystemExit(
            "roster: %s = %r is not one of %s — fix the roster or extend the "
            "enum in db/schema.sql first" % (col, s, sorted(allowed)))
    return q(s)


def person_rows(roster):
    """[(role, dict)] in roster order — instructors first, then students."""
    out = []
    for r in roster.get("instructors") or []:
        out.append(("instructor", r))
    for r in roster.get("students") or []:
        out.append(("student", r))
    return out


def norm_class(v):
    """Class names are typed by people: '98b  haf' and '98B HAF' are one class."""
    return " ".join(str(v or "").split()).upper()


def wanted_classes(chunks):
    """--classes accepts the flag repeatedly AND commas inside one value; both
    end up here as one set of normalised names. Empty set = no filter."""
    out = set()
    for chunk in chunks or []:
        for part in str(chunk).split(","):
            c = norm_class(part)
            if c:
                out.add(c)
    return out


def filter_students(rows, wanted):
    """Keep every instructor; keep the students of the named classes only.

    Returns (kept_rows, dropped_count, per_class_counts). A named class that
    matches nobody raises: at launch, a typo that silently imports zero
    students is worse than any error message."""
    kept, dropped = [], 0
    found = {c: 0 for c in wanted}
    for role, r in rows:
        if role != "student":
            kept.append((role, r))
            continue
        c = norm_class(r.get("class"))
        if c in wanted:
            found[c] += 1
            kept.append((role, r))
        else:
            dropped += 1
    empty = sorted(c for c, n in found.items() if n == 0)
    if empty:
        have = sorted({norm_class(r.get("class")) for role, r in rows
                       if role == "student" and norm_class(r.get("class"))})
        raise SystemExit(
            "--classes: no student is in %s.\n"
            "The roster's student classes are: %s\n"
            "Nothing was written — fix the spelling and run it again."
            % (", ".join(repr(c) for c in empty), ", ".join(have) or "(none)"))
    return kept, dropped, found


def value_tuple(role, r):
    oid = str(r.get("oid") or "").strip()
    if not oid:
        raise SystemExit("roster: a person without an oid cannot be imported "
                         "(%s %s)" % (r.get("rank"), r.get("last_name")))
    last = str(r.get("last_name") or "").strip()
    if not last:
        raise SystemExit("roster: %s has no last_name" % oid)
    return "  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)" % (
        q(oid), q(role), q(r.get("mn")), q(r.get("rank")),
        q(r.get("first_name")), q(last), q(r.get("class")),
        enum(r.get("duty") if role == "instructor" else None, DUTIES, "duty"),
        enum(r.get("leadership") if role == "instructor" else None, LEADERSHIPS, "leadership"),
        enum(STATUS.get(str(r.get("status") or "").strip(), r.get("status"))
             if role == "instructor" else None,
             set(STATUS.values()), "status"),
        q(r.get("call_sign")), q(r.get("country")), qb(r.get("test_pilot")))


HEADER = """\
-- ═══════════════════════════════════════════════════════════════════════════
-- Wings Ahead — PEOPLE IMPORT   (generated {when} by tools/gen-people-import.py)
-- FROM: {src}
--
--   ***  PRIVATE — REAL NAMES.  NEVER COMMIT THIS FILE.  ***
--
-- Paste the whole thing into the Supabase SQL editor and press Run. It is
-- IDEMPOTENT: it upserts BY external_oid (the roster's immutable object id),
-- it NEVER touches an existing person's token — every link already handed out
-- keeps working — and it never writes a null over a value the People tab
-- already holds. Nobody is deleted or deactivated: somebody the roster does
-- not mention is left exactly as they are.
--
-- Requires the ROUND 9 columns (db/schema.sql): people.external_oid unique,
-- call_sign, country, test_pilot. Run schema.sql first if this errors.
--
-- {n} person(s): {counts}
-- SCOPE: {scope}. Students of any other class are NOT in this file — anybody
-- already in the database stays exactly as they are, and widening the scope
-- later is simply another run with more classes named.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- A roster id says WHO somebody is, never WHAT they are. If one of these ids
-- is already in the database as the other role, the import stops here rather
-- than writing an instructor's name over a student's row.
do $$
declare bad text;
begin
  select string_agg(p.external_oid || ' (here: ' || p.role || ')', ', ') into bad
  from public.people p
  join (values
{role_pairs}
  ) as w(oid, role) on w.oid = p.external_oid
  where p.role::text <> w.role;
  if bad is not null then
    raise exception 'WA import: roster id(s) already present with a different role: %', bad;
  end if;
end $$;

with incoming (external_oid, role, mn, rank, first_name, last_name, class,
               duty, leadership, status, call_sign, country, test_pilot) as (
  values
{values}
),
typed as (
  select external_oid,
         role::public.wa_role              as role,
         mn, rank, first_name, last_name, class,
         duty::public.wa_duty              as duty,
         leadership::public.wa_leadership  as leadership,
         status::public.wa_status          as status,
         call_sign, country, test_pilot
  from incoming
)
insert into public.people as p
       (external_oid, role, mn, rank, first_name, last_name, class,
        duty, leadership, status, call_sign, country, test_pilot, active)
select external_oid, role, mn, rank, first_name, last_name, class,
       duty, leadership, status, call_sign, country, test_pilot, true
from typed
on conflict (external_oid) do update set
  -- the TOKEN and ACTIVE are deliberately absent from this list, and so is
  -- ROLE: what somebody is, is not something a roster line may flip
  mn         = coalesce(excluded.mn,         p.mn),
  rank       = coalesce(excluded.rank,       p.rank),
  first_name = coalesce(excluded.first_name, p.first_name),
  last_name  = excluded.last_name,
  class      = coalesce(excluded.class,      p.class),
  duty       = coalesce(excluded.duty,       p.duty),
  leadership = coalesce(excluded.leadership, p.leadership),
  status     = coalesce(excluded.status,     p.status),
  call_sign  = coalesce(excluded.call_sign,  p.call_sign),
  country    = coalesce(excluded.country,    p.country),
  test_pilot = excluded.test_pilot
where p.role = excluded.role;   -- belt & braces behind the guard above

commit;

-- ── THE CO'S DISTRIBUTION SHEET ───────────────────────────────────────────
-- Surname · role · personal link, for EVERY person in the database (the
-- roster's and the ones added by hand alike). Copy the column straight out of
-- the result grid and send each line to its owner — privately.
select p.last_name                                  as surname,
       coalesce(p.rank, '')                         as rank,
       p.role::text                                 as role,
       coalesce(p.external_oid, '(local)')          as roster_oid,
       coalesce(p.call_sign, '')                    as call_sign,
       case when p.active then '' else 'REVOKED' end as revoked,
       '{base}/#t=' || p.token                      as personal_link
from public.people p
order by p.role, p.last_name, p.first_name;
"""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("roster", help="path to the PRIVATE roster.json")
    ap.add_argument("-o", "--out", default=None,
                    help="output .sql (default: people-import.sql next to the roster)")
    ap.add_argument("--base-url", default="<PAGES-URL>",
                    help="the app's base URL, used to print the personal links")
    ap.add_argument("--classes", action="append", metavar="CLASS[,CLASS…]",
                    help="import the STUDENTS of these classes only (repeatable, "
                         "commas allowed, case-insensitive). Instructors are "
                         "always imported. Omit it to import everybody — the "
                         "default, unchanged. Example: --classes \"98B HAF\"")
    ap.add_argument("--force-unsafe-path", action="store_true",
                    help=argparse.SUPPRESS)
    a = ap.parse_args(argv)

    src = os.path.abspath(a.roster)
    with open(src, encoding="utf-8") as fh:
        roster = json.load(fh)

    out = os.path.abspath(a.out) if a.out else os.path.join(os.path.dirname(src),
                                                            "people-import.sql")
    # THE PRIVACY GATE, enforced and not merely documented: walk up from the
    # target and refuse to write anywhere under a git working tree.
    d = os.path.dirname(out)
    while True:
        if os.path.isdir(os.path.join(d, ".git")) and not a.force_unsafe_path:
            raise SystemExit(
                "REFUSED: %s is inside the git repository %s.\n"
                "The generated SQL carries real names and must never enter a "
                "repo. Write it next to the private roster instead." % (out, d))
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent

    rows = person_rows(roster)
    if not rows:
        raise SystemExit("roster: no instructors and no students — nothing to import")

    # LAUNCH SCOPE (round 9) — students of the named classes only; instructors
    # always. No flag, no filter: the run is exactly what it was before.
    wanted = wanted_classes(a.classes)
    scope = "every class"
    if wanted:
        rows, dropped, per_class = filter_students(rows, wanted)
        scope = "classes " + ", ".join(
            "%s (%d student%s)" % (c, per_class[c], "" if per_class[c] == 1 else "s")
            for c in sorted(wanted))
        if not any(role == "student" for role, _ in rows):
            raise SystemExit("--classes: the filter left no students at all — "
                             "nothing was written")
        print("class filter: %s — %d other student(s) left out of this import"
              % (scope, dropped))

    values = ",\n".join(value_tuple(role, r) for role, r in rows)
    role_pairs = ",\n".join("    (%s, %s)" % (q(r.get("oid")), q(role))
                            for role, r in rows)
    counts = "%d instructor(s), %d student(s)" % (
        sum(1 for role, _ in rows if role == "instructor"),
        sum(1 for role, _ in rows if role == "student"))

    sql = HEADER.format(when=date.today().isoformat(), src=src, n=len(rows),
                        counts=counts, scope=scope, values=values,
                        role_pairs=role_pairs,
                        base=a.base_url.rstrip("/").replace("'", "''"))
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(sql)
    print("wrote %s — %s (%s)" % (out, counts, scope))
    print("PRIVATE FILE: real names. Do not commit it, do not paste it anywhere public.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
