-- ═══════════════════════════════════════════════════════════════════════════
-- Wings Ahead — full database schema (Supabase / Postgres)
-- ───────────────────────────────────────────────────────────────────────────
-- IDEMPOTENT: safe to paste & Run in the Supabase SQL editor as many times
-- as you like — re-running never destroys data.
--
-- SECURITY MODEL — RPC-ONLY:
--   · anon / authenticated have ZERO direct access to any table.
--   · Every client call is a SECURITY DEFINER function taking the caller's
--     personal token as its first argument; the function validates role +
--     ownership and RAISES on any violation.
--   · RLS is additionally ENABLED on every table with no policies
--     (deny-by-default belt & braces).
--
-- ENTER ON BEHALF (round 4): the CO can fill in ANYBODY's form through the
-- admin_* on-behalf RPCs. They share the owner's validation path exactly
-- (wa.write_record / wa.write_proposal), and what they write is stamped
-- entered_by='admin' server-side — the tag the whole UI renders as "CO".
-- ROUND 8 — THE CO'S EDITS PREVAIL (supersedes the round-4b reclaim rule):
-- an entry the CO created or modified is LOCKED for its owner. The owner's
-- save must carry every one of them through fact for fact and no longer
-- strips the stamps (wa.carry_stamps refuses a payload that alters or drops
-- one, by name); the CO can still edit or delete his own, and editing an
-- owner's entry makes it his — which locks it.
-- ROUND 8 — SMS NAMES ITS ΚΕΠΕ ENTRY CONDITION (3-01 ΚΕΦ.2 §32β, PDF 54 /
-- printed 36): wa.sms_reasons(), required on every entrance, legacy rows
-- readable and refused on re-save until the condition is chosen.
-- ROUND 8 — PENDING IS GONE from the data model: the key is out of every
-- section's whitelist, refused by name on write and stripped on read; an
-- unflown fixed slot needs no flag to say it has not been flown.
-- ROUND 10 — THE FIVE-LEVEL ASSESSMENT, AND THERE IS NO AIRCRAFT TYPE LEFT.
-- The command replaced the branch ranking with ONE assessment per instructor
-- per student, about FIGHTERS: proposals.level, a closed list of five keys
-- weighted 10 / 8 / 5 / 3 / 1 (wa.level_keys / wa.level_weight /
-- wa.level_label). Not one negative word appears on the scale — the lower two
-- levels redirect rather than reject, because the sentence written about a
-- 22-year-old is one he remembers for life. The round-8 branch fields are
-- RETIRED: frozen in the table as the migration's audit trail, refused on
-- write by name, and returned by nothing. The aggregate is a WEIGHTED MEAN,
-- not a sum — one assessment per instructor makes a sum a popularity count.
-- ROUND 8 (superseded by round 10) — a proposal branch had FOUR states:
-- 1st / 2nd / 3rd, explicitly NOT RECOMMENDED (proposals.nr_*), or untouched.
-- ROUND 9 — THE SHARED ROSTER. One private roster file feeds every FDMS app.
-- people gains external_oid (the roster's IMMUTABLE object id — unique,
-- nullable, the join key of tools/gen-people-import.py) plus call_sign,
-- country and test_pilot. An import upserts BY external_oid and never touches
-- the token, so re-running it does not invalidate a link already handed out.
-- NOTHING roster-derived may ever enter this repo: the generated SQL is
-- written next to the private roster and is git-ignored here as well.
-- ROUND 6 — FIVE STRICTNESS RULES. Each of them replaces something the form
-- used to accept out of politeness with the thing the squadron can actually
-- use, and each keeps what is already stored READABLE while refusing to write
-- it again until it is corrected ("keep it, ask for it"):
--   1. AIRSICKNESS names the FLIGHT (any track), not a phase-of-flight note.
--      The note survives as legacy information, can never be added again
--      (wa.phase_count), and blocks the re-save of its own row until the
--      flight is chosen.
--   2. FAIL / ALMOST GOOD items[] are SYLLABUS ONLY — the custom item is gone.
--      wa.item_names(category) is the closed list, generated from the printed
--      gradesheets; anything else is refused by name.
--   3. EVALUATIONS FOLLOW THE SYLLABUS ORDER — wa.eval_ids(), generated from
--      the FILE ORDER of flowchart2.json (the printed Training Flow Chart):
--      C4590 → C4790 → C5090 → C5490 → I4490 → I4890 → F4690 → N4690. A later
--      checkride cannot be recorded while an earlier one has not been flown.
--   4. EVERY FLOWN SOLO NAMES ITS INSTRUCTOR, NG included — NG removes the
--      grade, not the person who AUTHORISED the flight.
--   5. AN FPC IS CONDUCTED BY THE SQUADRON CO OR THE DO (wa.fpc_evaluators())
--      and by nobody else. CEF keeps its open evaluator list.
-- ROUND 5b — THE NORMALISATION BOUNDARY: every string of a record is trimmed,
-- its inner whitespace collapsed, and (for the code-shaped fields) upper-cased
-- ONCE, before validation and as stored (wa.norm_record in wa.write_record) and
-- again on read (wa.migrate_record). A rule can no longer be walked past with a
-- space: ' C4302 ' under the Instrument track is refused exactly as C4302 is.
-- ROUND 5: the NFS reason (the printed causes of the ΦΜΠ, form Α0473),
-- whole-number grades, category⇄flight-code agreement, FIXED SYLLABUS SLOTS
-- for the solos and the eight checkrides (empty until flown — an unflown
-- slot is a placeholder that counts for nothing and is never stamped), and
-- the FPC/CEF trigger flight + evaluator (ex "by").
-- ROUND 4b — WHAT they write, not what they submit: a CO save is DIFFED
-- against the stored record (wa.stamp_record_diff), so adding one line to a
-- student's 17 self-reported entries stamps that one line and leaves the other
-- 17 self-reported. The record-level flag is derived from the entries
-- (wa.record_stamp) and means "contains CO-entered data", never "is a CO
-- record" — the views spell out which by counting.
--
-- The FINAL SELECT of this script prints the ADMIN token + link fragment —
-- copy it straight from the SQL editor result grid.
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  begin
    create extension if not exists pgcrypto with schema extensions;  -- Supabase layout
  exception when others then
    create extension if not exists pgcrypto;                         -- vanilla fallback
  end;
end $$;

-- ── enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.wa_role as enum ('student', 'instructor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wa_duty as enum
    ('Squadron Commander', 'DO', 'Flight Commander', 'Evaluator', 'Instructor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wa_leadership as enum
    ('Wingman', '2-ship', '4-ship', 'Mission Commander');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wa_status as enum ('Assigned', 'Attached', 'Departed');
exception when duplicate_object then null; end $$;

-- ── private helper schema (NOT exposed by PostgREST) ───────────────────────
create schema if not exists wa;
revoke all on schema wa from public;
revoke all on schema wa from anon;
revoke all on schema wa from authenticated;

-- token: 24 chars base64url from 18 random bytes.
-- own search_path: on Supabase pgcrypto lives in the "extensions" schema,
-- on vanilla Postgres in "public" — cover both, independent of the caller.
create or replace function wa.gen_token() returns text
language sql volatile
set search_path = public, extensions, pg_temp as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_')
$$;

create or replace function wa.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── tables ─────────────────────────────────────────────────────────────────
create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default wa.gen_token(),
  role        public.wa_role not null,
  mn          text,                        -- Military Number
  rank        text,
  first_name  text,
  last_name   text not null,
  class       text,                        -- students
  duty        public.wa_duty,              -- instructors
  leadership  public.wa_leadership,        -- instructors
  status      public.wa_status,            -- instructors
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.student_records (
  student_id  uuid primary key references public.people(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  last_update timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.proposals (
  id                uuid primary key default gen_random_uuid(),
  instructor_id     uuid not null references public.people(id) on delete cascade,
  student_id        uuid not null references public.people(id) on delete cascade,
  rank_fighters     smallint check (rank_fighters     between 1 and 3),
  rank_helicopters  smallint check (rank_helicopters  between 1 and 3),
  rank_transport_ff smallint check (rank_transport_ff between 1 and 3),
  flew_with         boolean not null default false,
  comment           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (instructor_id, student_id)
);

-- ── ENTER-ON-BEHALF stamp (round 4) ───────────────────────────────────────
-- 'admin' = the squadron CO entered this row FOR the owner; null = the owner
-- reported it themselves. Set by the write path only — never by the client.
-- Per-ENTRY stamps live inside student_records.data (entries[].entered_by).
alter table public.student_records add column if not exists entered_by text;
alter table public.proposals       add column if not exists entered_by text;

do $$ begin
  alter table public.student_records add constraint student_records_entered_by_chk
    check (entered_by is null or entered_by = 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.proposals add constraint proposals_entered_by_chk
    check (entered_by is null or entered_by = 'admin');
exception when duplicate_object then null; end $$;

-- ── "NOT RECOMMENDED" — the fourth state of a branch (round 8) ────────────
-- RETIRED IN ROUND 10 together with the whole branch ranking — see the block
-- below. The three columns are kept, frozen, as the audit trail the migration
-- read: nothing writes them again, and nothing returns them to the API.
-- Until round 8 a branch had three states: 1st / 2nd / 3rd, or untouched —
-- and "untouched" had to carry two very different meanings at once ("I would
-- not put him there" and "I have not formed a view"). The instructor can now
-- say the first one OUT LOUD, per branch, mutually exclusive with a rank.
-- Untouched stays untouched: three states become four.
alter table public.proposals add column if not exists nr_fighters     boolean not null default false;
alter table public.proposals add column if not exists nr_helicopters  boolean not null default false;
alter table public.proposals add column if not exists nr_transport_ff boolean not null default false;

do $$ begin
  alter table public.proposals add constraint proposals_nr_excl check (
        (rank_fighters     is null or nr_fighters     = false)
    and (rank_helicopters  is null or nr_helicopters  = false)
    and (rank_transport_ff is null or nr_transport_ff = false)
  );
exception when duplicate_object then null; end $$;

-- ══ ROUND 10 — THE FIVE-LEVEL ASSESSMENT, AND IT IS ABOUT FIGHTERS ═════════
-- COMMAND DIRECTIVE (2026-08-19). The branch ranking is gone. An instructor no
-- longer distributes a student across three aircraft types; he answers ONE
-- question about him, once, and the question is about FIGHTERS. There is no
-- aircraft-type ranking left anywhere in this database.
--
-- THE SCALE — five levels, weights 10 / 8 / 5 / 3 / 1:
--   strongly_recommended        10  "Strongly Recommended"
--   recommended                  8  "Recommended"
--   alternate                    5  "Recommended as Alternate"
--   other_assignments            3  "Recommended for Other Assignments"
--   strongly_other_assignments   1  "Strongly Recommended for Other Assignments"
--
-- NOT ONE NEGATIVE WORD APPEARS ON IT, and that is the design, not an
-- accident of phrasing. The lower two levels REDIRECT — «your value is
-- somewhere else» — where a plain scale would REJECT. These sentences are read
-- by 22-year-olds at the end of the hardest year of their lives, and they will
-- remember the wording of the one written about them for the rest of it. The
-- command's own «not recommended at all» is therefore expressed WITHOUT the
-- negation, as the emphatic redirect at weight 1: the strongest thing the
-- scale can say in that direction, said without telling anybody he is not
-- wanted. The weights carry the judgement; the words carry the person.
--
-- ONE ROW = ONE ASSESSMENT: the unique (instructor_id, student_id) key already
-- said so, and now the row says so too. `level` may be NULL — an instructor who
-- has recorded a comment or "I have flown with him" but has not formed a view
-- has said nothing, and a null is the only honest way to store that. It is
-- never invented on his behalf.
alter table public.proposals add column if not exists level text;

-- the closed list, enforced in the table as well as in the write path. The
-- literals are spelled out here on purpose: a CHECK that called a function
-- could be silently widened by redefining the function.
-- MIRROR: wa.level_keys() below · app/app.js → WA.LEVELS.
do $$ begin
  alter table public.proposals add constraint proposals_level_chk check (
    level is null or level in ('strongly_recommended', 'recommended', 'alternate',
                               'other_assignments', 'strongly_other_assignments')
  );
exception when duplicate_object then null; end $$;

-- ── ONE-SHOT MIGRATIONS, RECORDED (round 10) ──────────────────────────────
-- A data migration is not idempotent by being careful; it is idempotent by
-- being RECORDED. This file is re-applied on every deploy, so the round-10
-- conversion of the branch ranks into levels must be able to say "already
-- done" no matter what the data looks like afterwards. Without this ledger,
-- an instructor who deliberately CLEARED his level would have it resurrected
-- from the frozen rank_* columns by the next re-apply — a retired judgement
-- coming back to life behind his back. The row here is what makes that
-- impossible, and it carries the counts the migration reported.
create table if not exists wa.migrations (
  id      text primary key,
  ran_at  timestamptz not null default now(),
  note    text
);

-- ── ROUND 9 — THE GLOBAL ROSTER ───────────────────────────────────────────
-- ONE roster now feeds every FDMS app (the scheduler and this one). It is a
-- PRIVATE file that lives outside both public repos and carries an IMMUTABLE
-- object id per person (external_oid, 'R-nnnn'). Wings Ahead does not own
-- that id, it BORROWS it: it is the join key an import upserts on, so the same
-- person is the same row after the tenth re-run, and everything else about
-- them (rank, duty, call sign, country, test-pilot flag) may change freely.
--   · external_oid is UNIQUE and NULLABLE — a person added by hand in the
--     People tab simply has none, and Postgres allows any number of NULLs in
--     a unique column, so hand-made people never collide with each other.
--   · The TOKEN is never part of an import's update list: a re-import must not
--     invalidate a link the CO has already distributed.
--   · call_sign / country / test_pilot are what the roster adds to a person;
--     country is TEXT and not an enum on purpose — the country dropdown of
--     both apps carries HAF / ITAF plus the "Other…" free-text escape, and the
--     third air force that arrives tomorrow must not need a migration.
alter table public.people add column if not exists external_oid text;
alter table public.people add column if not exists call_sign    text;
alter table public.people add column if not exists country      text;
alter table public.people add column if not exists test_pilot   boolean not null default false;

-- (a UNIQUE constraint creates an index of the same name, so a re-run raises
--  duplicate_TABLE, not duplicate_object — both mean "already there")
do $$ begin
  alter table public.people add constraint people_external_oid_key unique (external_oid);
exception when duplicate_object or duplicate_table then null; end $$;

-- ranking positions must be pairwise distinct inside one proposal
do $$ begin
  alter table public.proposals add constraint proposals_ranks_distinct check (
        (rank_fighters    is null or rank_helicopters  is null or rank_fighters    <> rank_helicopters)
    and (rank_fighters    is null or rank_transport_ff is null or rank_fighters    <> rank_transport_ff)
    and (rank_helicopters is null or rank_transport_ff is null or rank_helicopters <> rank_transport_ff)
  );
exception when duplicate_object then null; end $$;

-- updated_at triggers
drop trigger if exists trg_touch_people on public.people;
create trigger trg_touch_people before update on public.people
  for each row execute function wa.touch_updated_at();

drop trigger if exists trg_touch_records on public.student_records;
create trigger trg_touch_records before update on public.student_records
  for each row execute function wa.touch_updated_at();

drop trigger if exists trg_touch_proposals on public.proposals;
create trigger trg_touch_proposals before update on public.proposals
  for each row execute function wa.touch_updated_at();

-- ── LOCKDOWN: no direct table access, RLS deny-by-default ──────────────────
alter table public.people          enable row level security;
alter table public.student_records enable row level security;
alter table public.proposals       enable row level security;

revoke all on public.people          from public, anon, authenticated;
revoke all on public.student_records from public, anon, authenticated;
revoke all on public.proposals       from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ── auth / validation helpers (schema wa — unreachable from the API) ───────
create or replace function wa.auth(p_token text) returns public.people
language plpgsql stable as $$
declare v public.people;
begin
  if p_token is null or length(p_token) < 24 then
    raise exception 'WA: invalid token';
  end if;
  select * into v from public.people where token = p_token and active;
  if not found then
    raise exception 'WA: invalid or revoked token';
  end if;
  return v;
end $$;

create or replace function wa.auth_role(p_token text, p_role public.wa_role)
returns public.people
language plpgsql stable as $$
declare v public.people;
begin
  v := wa.auth(p_token);
  if v.role <> p_role then
    raise exception 'WA: forbidden — this action requires the % role', p_role;
  end if;
  return v;
end $$;

create or replace function wa.is_iso_date(t text) returns boolean
language plpgsql immutable as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform t::date;
  return true;
exception when others then return false;
end $$;

-- ══ NORMALISATION — WHITESPACE IS NOT DATA (round 5b) ═════════════════════
-- A field must be CHECKED as it is STORED and stored as it is checked. Before
-- this boundary existed the two drifted apart: wa.code_track matches
-- '^[BCIFN][0-9]{4}$', so ' C4302 ' was not a syllabus code to it, the
-- category⇄code contradiction it exists to refuse was never evaluated, and
-- the padded string entered the record verbatim — a value the picker can
-- never produce and no later read could reconcile. The regexes were right;
-- the input reaching them was not.
--
-- So every string is normalised ONCE, on the way in (wa.write_record, before
-- wa.validate_record) and on the way out (wa.migrate_record, so a padded
-- value written by an older instance surfaces clean). Same function, same
-- result, both directions — a check can no longer be dodged by a space.
--
--   norm_line  single-line values (codes, names, dates, enum ids):
--              every whitespace run — space / tab / newline / NBSP / ZWSP —
--              collapses to ONE space, and the ends are cut.
--   norm_code  norm_line + upper case: 'c4302', ' C4302 ' and 'C4302' are
--              the same sortie, so they must be the same string.
--   norm_free  free text (a note, a result, a phase of flight) keeps its
--              inner shape — it may legitimately be typed on several lines —
--              and only loses the whitespace at its ends.
create or replace function wa.norm_line(t text) returns text
language sql immutable as $$
  select case when t is null then null else
    btrim(regexp_replace(translate(t, U&'\00a0\200b\feff', '   '), '\s+', ' ', 'g')) end
$$;
create or replace function wa.norm_code(t text) returns text
language sql immutable as $$ select upper(wa.norm_line(t)) $$;
create or replace function wa.norm_free(t text) returns text
language sql immutable as $$
  select case when t is null then null else
    regexp_replace(regexp_replace(translate(t, U&'\00a0', ' '), '^\s+', ''), '\s+$', '') end
$$;

-- WHICH RULE A FIELD GETS, BY ITS NAME. The name is the same wherever the
-- field appears (a flight_code is a flight_code in fail, almost_good, fpc and
-- cef alike), so this classification also covers the superseded v1 section
-- names the read-time migration still accepts.
create or replace function wa.code_fields() returns text[]
language sql immutable as $$
  select array['flight_code','sortie','slot','evaluation']::text[]
$$;
create or replace function wa.free_fields() returns text[]
language sql immutable as $$
  select array['note','result','phase','comment']::text[]
$$;

-- the rule this field's name earns, applied to one string
create or replace function wa.norm_str(p_key text, t text) returns text
language sql immutable as $$
  select case when p_key = any(wa.code_fields()) then wa.norm_code(t)
              when p_key = any(wa.free_fields()) then wa.norm_free(t)
              else wa.norm_line(t) end
$$;

-- one value of one field, normalised. Non-strings pass through untouched
-- (a grade stays a number, `ng` stays a boolean, json null stays null);
-- a list of strings — items[] — is normalised element by element.
create or replace function wa.norm_field(p_key text, v jsonb) returns jsonb
language sql immutable as $$
  select case
    when v is null then 'null'::jsonb
    when jsonb_typeof(v) = 'string' then to_jsonb(wa.norm_str(p_key, v #>> '{}'))
    when jsonb_typeof(v) = 'array' then coalesce((
      select jsonb_agg(case when jsonb_typeof(x) = 'string'
                            then to_jsonb(wa.norm_str(p_key, x #>> '{}')) else x end)
      from jsonb_array_elements(v) x), '[]'::jsonb)
    else v end
$$;

-- one entry, every field normalised
create or replace function wa.norm_entry(e jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(e) <> 'object' then e else
    coalesce((select jsonb_object_agg(t.k, wa.norm_field(t.k, t.v))
              from jsonb_each(e) t(k, v)), '{}'::jsonb) end
$$;

-- a whole record: every entry of every section. Applied at BOTH boundaries,
-- so the validator, the storage and the read all see the same string.
create or replace function wa.norm_record(p jsonb) returns jsonb
language sql immutable as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then p else
    coalesce((select jsonb_object_agg(t.k, case
        when jsonb_typeof(t.v) = 'array' then coalesce((
          select jsonb_agg(wa.norm_entry(x)) from jsonb_array_elements(t.v) x), '[]'::jsonb)
        when jsonb_typeof(t.v) = 'object' then wa.norm_entry(t.v)
        else t.v end)
      from jsonb_each(p) t(k, v)), '{}'::jsonb) end
$$;

-- one field of one entry: type + format checks
create or replace function wa.chk(p_ok boolean, p_where text, p_msg text) returns void
language plpgsql immutable as $$
begin
  if not p_ok then
    raise exception 'WA: invalid payload — % (%)', p_msg, p_where;
  end if;
end $$;

create or replace function wa.chk_text(v jsonb, p_where text, p_required boolean, p_max int)
returns void language plpgsql immutable as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then
    perform wa.chk(not p_required, p_where, 'required text missing');
    return;
  end if;
  perform wa.chk(jsonb_typeof(v) = 'string', p_where, 'must be text');
  perform wa.chk(length(v #>> '{}') <= p_max, p_where, format('text longer than %s chars', p_max));
end $$;

create or replace function wa.chk_date(v jsonb, p_where text, p_required boolean)
returns void language plpgsql immutable as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then
    perform wa.chk(not p_required, p_where, 'required date missing');
    return;
  end if;
  perform wa.chk(jsonb_typeof(v) = 'string' and wa.is_iso_date(v #>> '{}'),
                 p_where, 'date must be ISO YYYY-MM-DD');
end $$;

create or replace function wa.chk_bool(v jsonb, p_where text)
returns void language plpgsql immutable as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then return; end if;
  perform wa.chk(jsonb_typeof(v) = 'boolean', p_where, 'must be true/false');
end $$;

-- GRADES ARE WHOLE NUMBERS (round 5). The gradesheet is scored in whole
-- percentage points, so 62.5 is a typo or a half-remembered average, not a
-- grade — and two students can only be compared on the same scale. Records
-- written before this rule keep their fractional value (nothing is rewritten
-- behind the owner's back); they are RENDERED rounded with the raw value in
-- the tooltip, and the form asks for a whole number the next time it is saved.
create or replace function wa.chk_grade(v jsonb, p_where text, p_required boolean)
returns void language plpgsql immutable as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    perform wa.chk(not p_required, p_where, 'required grade missing');
    return;
  end if;
  perform wa.chk(jsonb_typeof(v) = 'number', p_where, 'grade must be a number');
  n := (v #>> '{}')::numeric;
  perform wa.chk(n >= 0 and n <= 100, p_where, 'grade out of range 0-100');
  perform wa.chk(n = trunc(n), p_where,
                 format('grades are whole numbers — %s is not accepted (round it, e.g. %s)',
                        trim(trailing '.' from trim(trailing '0' from n::text)),
                        round(n)::text));
end $$;

-- a row that came from a v1 record and could not be completed by the read-time
-- migration (no date stored, no evaluation identity). It is accepted on write
-- so the student can save the rest of the form without losing it; the UI asks
-- for the missing field and drops the flag the moment it is supplied.
create or replace function wa.is_legacy(e jsonb) returns boolean
language sql immutable as $$
  select case when jsonb_typeof(e->'legacy') = 'boolean'
              then (e->>'legacy')::boolean else false end
$$;

-- EVERY entry carries its own date (round-3 rule: no manually typed counts
-- anywhere) — the only exception is an un-completable legacy row.
create or replace function wa.chk_entry_date(e jsonb, p_where text)
returns void language plpgsql immutable as $$
begin
  perform wa.chk_bool(e->'legacy', p_where || '.legacy');
  perform wa.chk_date(e->'date', p_where || '.date', not wa.is_legacy(e));
end $$;

-- list of short strings (FAIL / ALMOST GOOD items[])
create or replace function wa.chk_str_list(v jsonb, p_where text, p_min int, p_max int, p_len int)
returns void language plpgsql immutable as $$
declare i int;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    perform wa.chk(p_min = 0, p_where, 'required list missing');
    return;
  end if;
  perform wa.chk(jsonb_typeof(v) = 'array', p_where, 'must be a list');
  perform wa.chk(jsonb_array_length(v) >= p_min, p_where,
                 format('at least %s entry is required', p_min));
  perform wa.chk(jsonb_array_length(v) <= p_max, p_where, 'too many entries');
  for i in 0 .. jsonb_array_length(v) - 1 loop
    perform wa.chk(jsonb_typeof(v->i) = 'string' and length(v->>i) > 0,
                   format('%s[%s]', p_where, i), 'must be a non-empty text');
    perform wa.chk(length(v->>i) <= p_len, format('%s[%s]', p_where, i),
                   format('text longer than %s chars', p_len));
  end loop;
end $$;

-- the eight Phase II checkrides — the identity every evaluation carries — and
-- the printed gradesheet items of every track. BOTH come straight from the
-- FDMS syllabus sources through tools/gen-items-catalog.py, which writes the
-- JS catalogue and the block below in ONE run: the two mirrors cannot drift,
-- because nobody types either of them by hand.
-- ▼▼ GENERATED BLOCK — tools/gen-items-catalog.py — DO NOT EDIT BY HAND ▼▼
-- Generated from the FDMS syllabus sources:
--   flow chart      2026-08-09  (data/flowchart2.json)
--   syllabus items  2026-08-08T22:10:34  (data/observations/master_index.json)
-- MIRROR: app/items-catalog.js, written by the same run of the same script.

-- THE EIGHT CHECKRIDES, IN SYLLABUS ORDER (round 6). The order is not a
-- judgement call: it is the FILE ORDER of the sortie entries in
-- flowchart2.json, which is the order the printed Training Flow Chart lays
-- them out in. The ARRAY POSITION is therefore the syllabus position, and
-- wa.eval_pos() reads it — an evaluation may not be recorded while an
-- earlier one has not been flown.
-- MIRROR: app/app.js → WA.EVALUATIONS (ordered by WA_EVAL_ORDER).
create or replace function wa.eval_ids() returns text[]
language sql immutable as $$
  select array['C4590','C4790','C5090','C5490','I4490','I4890','F4690','N4690']::text[]
$$;

-- 1-based position of a checkride in the syllabus order · null when unknown
create or replace function wa.eval_pos(p_id text) returns int
language sql immutable as $$
  select i from generate_subscripts(wa.eval_ids(), 1) i
  where (wa.eval_ids())[i] = p_id
$$;

-- THE PRINTED GRADESHEET ITEMS OF ONE TRACK (round 6). FAIL / ALMOST GOOD
-- items[] may hold ONLY these strings: the custom "Other…" item died with
-- round 6, so an item that is not on the printed sheet of the chosen track
-- is refused on write — by name, with the rule spelled out.
-- 'other' is the migration-only placeholder category and has NO catalogue:
-- a row still filed under it must be given a real track first.
-- MIRROR: app/items-catalog.js → WA_ITEMS.categories[].items[].name
create or replace function wa.item_names(p_cat text) returns text[]
language sql immutable as $$
  select case p_cat
    when 'contact' then array[
      'GROUND PROCEDURES',
      'TAKE OFF',
      'DEPARTURE / TRANSITION TO FLIGHT AREAS',
      'AREA AWARENESS',
      'BASIC A/C CONTROL',
      'G –AWARENESS',
      'SLOW FLIGHT',
      'POWER ON / ELP STALLS',
      'TRAFFIC PATTERN STALLS',
      'SPIN PREVENTION /SPIN RECOVERY',
      'UNUSUAL ATTITUDES RECOVERY',
      'PRECISION - AEROBATIC MANEUVERS',
      'DESCENT - TRAFFIC PATTERN ENTRY',
      'AIRPORT TRAFFIC PATTERN',
      'LANDING PATTERN (NORMAL, NO FLAP, FLAP T/O - AΟA)',
      'LANDING (FLAPS LDG - FLAPS UP - FLAPS Τ/Ο - ELP - AΟA)',
      'STRAIGHT-IN (FLAPS LDG, FLAPS UP, FLAPS Τ/Ο).',
      'EMERGENCY LANDING PATTERN (ELP)',
      'GO AROUND',
      'CLOSED PATTERN',
      'CLEARING',
      'RADIO COMMUNICATION',
      'AIRMANSHIP',
      'EMERGENCY PROCEDURES',
      'GENERAL KNOWLEDGE',
      'SPECIAL REQUIREMENTS',
      'CRM'
    ]::text[]
    when 'instrument' then array[
      'GROUND PROCEDURES',
      'TAKE OFF',
      'STANDARD INSTRUMENT DEPARTURE (SID)',
      'BASIC A/C CONTROL',
      'STEEP TURNS',
      'AIRSPEED CHANGES',
      'CONSTANT AIRSPEED - CONSTANT RATE CLIMBS / DESCENTS AND VERTICAL "S"',
      'UNUSUAL ATTITUDES RECOVERY',
      'CONFIDENCE MANEUVERS',
      'COURSE INTERCEPTS',
      'MAINTAINING COURSE',
      'ARC INTERCEPT',
      'MAINTAINING ARC',
      'POINT TO POINT',
      'HOLDING',
      'INSTRUMENT DESCENT (PENETRATION)',
      'EN-ROUTE DESCENT',
      'VOR / TACAN APPROACH',
      'ILS APPROACH',
      'LOCALIZER APPROACH',
      'GCA APPROACH (ASR)',
      'GCA APPROACH (PAR)',
      'GCA APPROACH (GYRO OUT)',
      'STANDBY INSTRUMENTS APPROACH',
      'CIRCLING APPROACH',
      'LANDING',
      'MISSED APPROACH',
      'RADIO COMMUNICATION, AIRMANSHIP, EMERGENCY PROCEDURES, GENERAL KNOWLEDGE.',
      'SPECIAL REQUIREMENTS',
      'CRM'
    ]::text[]
    when 'formation' then array[
      'TAKE OFF (FORMATION - INTERVAL)',
      'DEPARTURE',
      'IN FLIGHT PLANNING / FORMATION CONSISTENCY',
      'RETURN / DESCENT / TRAFFIC PATTERN ENTRY',
      'FORMATION APPROACH',
      'FORMATION TAKE OFF',
      'INTERVAL TAKE OFF',
      'TURNING REJOIN',
      'STRAIGHT AHEAD REJOIN',
      'OVERSHOOT',
      'BREAK OUT',
      'FORMATION APPROACH.',
      'MISSION PLANNING / BRIEFING.',
      'GROUND PROCEDURES.',
      'PITCH OUT / SPACING',
      'FINGERTIP',
      'ROUTE / FIGHTING WING FORMATION',
      'ECHELON TURN (AS WINGMAN)',
      'CROSS UNDER',
      'LEAD CHANGE',
      'CLOSE TRAIL',
      'EXTENDED TRAIL',
      'TACTICAL FORMATION',
      'TACTICAL TURNS DELAY 90°, DELAY 45°, IN PLACE, CROSS / HOOK / SHACKLE/ CHECK TURNS',
      'BASIC A/C - FORMATION CONTROL',
      'LANDING PATTERN',
      'LANDING',
      'VISUAL SIGNALS',
      'CLEARING',
      'RADIO COMMUNICATION',
      'AIRMANSHIP',
      'EMERGENCY PROCEDURES',
      'GENERAL KNOWLEDGE',
      'CRM'
    ]::text[]
    when 'vfr_navigation' then array[
      'MISSION PLANNING / BRIEFING - DEBRIEFING',
      'GROUND PROCEDURES',
      'TAKEOFF',
      'VFR DEPARTURE / SID',
      'BASIC A/C CONTROL / WINGMAN CONSIDERATION',
      'IN-FLIGHT PLANNING / FORMATION INTERGRITY',
      'FINGERTIP',
      'TACTICAL FORMATION',
      'TACTICAL TURNS',
      'MAINTAIN TRACK',
      'MAP READING',
      'PILOTAGE',
      'NAVIGATION WITH GPS',
      'VFR ARRIVAL / TRAFFIC PATTERN ENTRY',
      'INSTRUMET PROCEDURES',
      'FORMATION APPROACH',
      'TRAFFIC PATTERN PROCEDURES',
      'OVERHEAD PATTERN',
      'LANDING',
      'INSTRUMENT PROCEDURES',
      'CLEARING',
      'COMMUNICATION',
      'AIRMANSHIP',
      'EMERGENCY PROCEDURES',
      'GENERAL KNOWLEDGE',
      'CRM'
    ]::text[]
    else array[]::text[] end
$$;

-- ══ ROUND 12 — THE LOG TABLES: THE FOUR CATALOGUES ═══════════════════════
-- The sorties of ONE table — a (band, track) pair — in FLOW-CHART ORDER, i.e.
-- the order the printed Training Flow Chart lays the stage out in. NOT the
-- code order of wa.item_names' neighbour WA_SORTIES: in ('flights',
-- 'instrument') the chart runs … I4602 I4701 I4603 I4890 and sorting by code
-- silently reorders it.
-- THE BAND IS THE SECTION AND THE TRACK IS THE LETTER (wa.code_track), so a
-- flights/fs row is fully placed by the pair — no new lookup on the hot path.
-- MIRROR: app/items-catalog.js → WA_LOG_SORTIES.
create or replace function wa.sortie_codes(p_band text, p_track text) returns text[]
language sql immutable as $$
  select case p_band || '/' || p_track
    when 'flights/contact' then array[
      'C4101',
      'C4201',
      'C4202',
      'C4203',
      'C4301',
      'C4302',
      'C4303',
      'C4401',
      'C4402',
      'C4403',
      'C4590',
      'C4601',
      'C4602',
      'C4790',
      'C4791',
      'C4801',
      'C4802',
      'C4803',
      'C4804',
      'C4901',
      'C4902',
      'C4903',
      'C4904',
      'C4905',
      'C5090',
      'C5101',
      'C5102',
      'C5201',
      'C5202',
      'C5203',
      'C5204',
      'C5301',
      'C5302',
      'C5303',
      'C5304',
      'C5490'
    ]::text[]
    when 'flights/instrument' then array[
      'I4101',
      'I4102',
      'I4201',
      'I4202',
      'I4301',
      'I4302',
      'I4490',
      'I4501',
      'I4502',
      'I4601',
      'I4602',
      'I4701',
      'I4603',
      'I4890'
    ]::text[]
    when 'flights/formation' then array[
      'F4101',
      'F4102',
      'F4103',
      'F4104',
      'F4201',
      'F4202',
      'F4203',
      'F4204',
      'F4301',
      'F4302',
      'F4303',
      'F4304',
      'F4305',
      'F4306',
      'F4401',
      'F4402',
      'F4403',
      'F4404',
      'F4501',
      'F4502',
      'F4503',
      'F4690'
    ]::text[]
    when 'flights/vfr_navigation' then array[
      'N4101',
      'N4102',
      'N4201',
      'N4202',
      'N4301',
      'N4302',
      'N4401',
      'N4402',
      'N4403',
      'N4501',
      'N4502',
      'N4503',
      'N4690'
    ]::text[]
    when 'fs/contact' then array[
      'B1001',
      'B1002',
      'C1101',
      'C2101',
      'C2201',
      'C2202',
      'C2301',
      'C2302',
      'C2401',
      'C2402',
      'C2403',
      'C2501',
      'C2502',
      'C2503',
      'C2601',
      'C2602',
      'C2603',
      'C2604'
    ]::text[]
    when 'fs/instrument' then array[
      'I3101',
      'I3102',
      'I3201',
      'I3202',
      'I3203',
      'I3301',
      'I3302',
      'I3303',
      'I3304',
      'I3401',
      'I3402',
      'I3403',
      'I3404',
      'I3501',
      'I3502',
      'I3503',
      'I3504',
      'I3601'
    ]::text[]
    when 'fs/formation' then array[
      'F3101',
      'F3102',
      'F3201',
      'F3202',
      'F3203'
    ]::text[]
    when 'fs/vfr_navigation' then array[
      'N2101',
      'N2201',
      'N2202',
      'N2301',
      'N2302',
      'N2303',
      'N2304'
    ]::text[]
    else array[]::text[] end
$$;

-- which BAND a syllabus code belongs to — 'flights' | 'fs' | null (not a
-- catalogue code). The letter gives the track; only the flow chart gives the
-- band, which is why this is generated and wa.code_track is not.
create or replace function wa.sortie_band(p_code text) returns text
language sql immutable as $$
  select case
    when upper(wa.norm_line(p_code)) = any(array[
      'C4101',
      'C4201',
      'C4202',
      'C4203',
      'C4301',
      'C4302',
      'C4303',
      'C4401',
      'C4402',
      'C4403',
      'C4590',
      'C4601',
      'C4602',
      'C4790',
      'C4791',
      'C4801',
      'C4802',
      'C4803',
      'C4804',
      'C4901',
      'C4902',
      'C4903',
      'C4904',
      'C4905',
      'C5090',
      'C5101',
      'C5102',
      'C5201',
      'C5202',
      'C5203',
      'C5204',
      'C5301',
      'C5302',
      'C5303',
      'C5304',
      'C5490',
      'I4101',
      'I4102',
      'I4201',
      'I4202',
      'I4301',
      'I4302',
      'I4490',
      'I4501',
      'I4502',
      'I4601',
      'I4602',
      'I4701',
      'I4603',
      'I4890',
      'F4101',
      'F4102',
      'F4103',
      'F4104',
      'F4201',
      'F4202',
      'F4203',
      'F4204',
      'F4301',
      'F4302',
      'F4303',
      'F4304',
      'F4305',
      'F4306',
      'F4401',
      'F4402',
      'F4403',
      'F4404',
      'F4501',
      'F4502',
      'F4503',
      'F4690',
      'N4101',
      'N4102',
      'N4201',
      'N4202',
      'N4301',
      'N4302',
      'N4401',
      'N4402',
      'N4403',
      'N4501',
      'N4502',
      'N4503',
      'N4690'
    ]::text[]) then 'flights'
    when upper(wa.norm_line(p_code)) = any(array[
      'B1001',
      'B1002',
      'C1101',
      'C2101',
      'C2201',
      'C2202',
      'C2301',
      'C2302',
      'C2401',
      'C2402',
      'C2403',
      'C2501',
      'C2502',
      'C2503',
      'C2601',
      'C2602',
      'C2603',
      'C2604',
      'I3101',
      'I3102',
      'I3201',
      'I3202',
      'I3203',
      'I3301',
      'I3302',
      'I3303',
      'I3304',
      'I3401',
      'I3402',
      'I3403',
      'I3404',
      'I3501',
      'I3502',
      'I3503',
      'I3504',
      'I3601',
      'F3101',
      'F3102',
      'F3201',
      'F3202',
      'F3203',
      'N2101',
      'N2201',
      'N2202',
      'N2301',
      'N2302',
      'N2303',
      'N2304'
    ]::text[]) then 'fs'
    else null end
$$;

-- THE 12 THEORY GROUPS and, per group, its COURSES — the codes exactly as the
-- FDMS parser derives them from the printed duration block. The join key for
-- a course is the PAIR (group, course), never the code alone: OJT is a course
-- of four different groups.
-- MIRROR: app/items-catalog.js → WA_GROUND.
create or replace function wa.lesson_groups() returns text[]
language sql immutable as $$
  select array['GT-WSGES','GT-INITIAL','GT-FLYPRIN','GT-AERO-CRM','GT-METEO-BA','GT-INSTR','GT-IFRNAV-GPS','GT-CO110','GT-CO109','GT-FORM','GT-VFRNAV','GT-GENBRIEF']::text[]
$$;

create or replace function wa.lesson_courses(p_group text) returns text[]
language sql immutable as $$
  select case p_group
    when 'GT-WSGES' then array[
      'A/C Systems (WSGES)'
    ]::text[]
    when 'GT-INITIAL' then array[
      'OP 101-115',
      'IC 101',
      'LP 101-108',
      'PR 101-113',
      'JP 101-110*'
    ]::text[]
    when 'GT-FLYPRIN' then array[
      'FF 101-108',
      'FF 190',
      'CO 101-105',
      'CO 106-108',
      'OJT',
      'PT 101-104',
      'PT 190',
      'BB 101-102',
      'SOPs 101-104',
      'IFG 101-102'
    ]::text[]
    when 'GT-AERO-CRM' then array[
      'AE 101-108',
      'AE 190',
      'OJT',
      'CR 201-202*'
    ]::text[]
    when 'GT-METEO-BA' then array[
      'JX 101-109',
      'JX 190',
      'OJT',
      'Meteo Briefing',
      'JX 191',
      'BA 101-103'
    ]::text[]
    when 'GT-INSTR' then array[
      'IN 101-105',
      'IN 201-210'
    ]::text[]
    when 'GT-IFRNAV-GPS' then array[
      'NA 101-103',
      'ATR',
      'NA 191',
      'IPR PL2',
      'OJT',
      'GPS'
    ]::text[]
    when 'GT-CO110' then array[
      'CO 110'
    ]::text[]
    when 'GT-CO109' then array[
      'CO 109'
    ]::text[]
    when 'GT-FORM' then array[
      'FO 101-104',
      'FO 201',
      'TACFOR 501-506',
      'OJT'
    ]::text[]
    when 'GT-VFRNAV' then array[
      'NA 104-111',
      'LNAV 701-705'
    ]::text[]
    when 'GT-GENBRIEF' then array[
      'FT',
      'ABA',
      'FP',
      'EP',
      'FS'
    ]::text[]
    else array[]::text[] end
$$;

-- THE EIGHT GROUND-EXAM GROUPS. These and ONLY these: four theory groups
-- carry a nested exams[] (FF 190 · PT 190 · AΕ 190 · JX 190 · JX 191 ·
-- NA 191) which a human would file under "exams", and FDMS does not — its
-- parser picks them up as COURSES OF THEIR GROUP. Putting them here too
-- would make the two systems disagree about what a student is owed.
-- MIRROR: app/items-catalog.js → WA_EXAMS.
create or replace function wa.exam_ids() returns text[]
language sql immutable as $$
  select array['CO190','JP190','IN190','IN290','FO190','TACFOR590','NA190','LNAV790']::text[]
$$;

-- JP190 is «Exams on Flight physiology (foreign SPs only)» — conditional, so
-- it is NOT OWED by a HAF student. (FDMS's own SchedReady never reads the
-- flag and leaves JP190 pending for ever; that defect is not mirrored here.)
create or replace function wa.exam_conditional(p_id text) returns boolean
language sql immutable as $$
  select case when p_id = any(array['JP190']::text[]) then true else false end
$$;

-- ── THE FIXED SOLO SLOTS (round 5, generated since round 12) ─────────────
-- One slot per solo the stage prescribes — flow-chart Training Sections whose
-- printed duration block says SOLO SORTIES > 0. F4301-06 prescribes TWO, so it
-- carries two distinct slots. Hand-kept until round 12 opened the generator;
-- it mirrored WA_SOLO_SLOTS by discipline alone, which is a drift that costs
-- nothing to remove.
-- MIRROR: app/items-catalog.js → WA_SOLO_SLOTS.
create or replace function wa.solo_slots() returns text[]
language sql immutable as $$
  select array['C4790-91-S1','C4801-04-S1','C4901-05-S1','C5201-04-S1','C5301-04-S1','F4301-06-S1','F4301-06-S2','F4501-03-S1']::text[]
$$;
-- ▲▲ GENERATED BLOCK ▲▲

-- ══ ROUND 11 — THE GRADE SCALE, AND WHAT «SUCCESSFUL» MEANS ════════════════
-- Nothing in a student record stores an OUTCOME: an evaluation entry carries
-- date · evaluation · with · grade and has never carried a pass/fail tick
-- (wa.entry_keys('evaluations')). So "was this flight characterised
-- successful?" is answered by THE GRADE against the printed scale, which is
-- how the squadron reads it on paper.
--   ΠΔ 151/13, quoted in 3-01/2025 ΔΑΕ (FDMS data/requirements/
--   failure_procedures.json, requirement #0, `verbatim`):
--     «Α»  Άριστα        90-100 %      «ΛΚ» Λίαν Καλώς   75-89 %
--     «Κ»  Καλώς          60-74 %      «ΣΚ» Σχεδόν Καλώς 50-59 %  = ΥΣΤΕΡΗΣΗ
--     «Ε»  ΑΠΟΤΥΧΩΝ        0-49 %                                 = ΑΠΟΤΥΧΙΑ
--   and, in the same record: «Το κατώφλι 59%/60% διαχωρίζει την αποδεκτή από
--   τη μη αποδεκτή απόδοση και είναι το κατώφλι που χρησιμοποιούν όλα τα
--   κριτήρια παραπομπής.»
-- For a CHECKRIDE the referral law says the same number in its own words —
-- ΠΔ 29/2020 Άρθρο 3 παρ.1β (FDMS fail-16): «βαθμολογείται με βαθμολογία από
-- μηδέν (0) έως πενήντα εννέα τοις εκατό (59%)» in a πτήση εξέτασης ή
-- αξιολόγησης IS the referral case. One threshold, two sources, no ambiguity.
-- MIRROR: app/app.js → WA.GRADE_PASS_MIN / WA.GRADE_BANDS / WA.gradeBand /
-- WA.gradePassed. Change one, change the other.
create or replace function wa.grade_pass_min() returns numeric
language sql immutable as $$ select 60::numeric $$;

create or replace function wa.grade_band(g numeric) returns text
language sql immutable as $$
  select case
    when g is null then null
    when g >= 90 then 'excellent'
    when g >= 75 then 'very_good'
    when g >= 60 then 'good'
    when g >= 50 then 'lagging'
    else 'failed' end
$$;

-- a row with NO grade is not a pass: an evaluation whose result has not been
-- written yet has not been characterised anything
create or replace function wa.grade_passed(g numeric) returns boolean
language sql immutable as $$
  select g is not null and g >= wa.grade_pass_min()
$$;

-- ══ ROUND 11 — THE PASS-ATTEMPT RULE ══════════════════════════════════════
-- COMMAND WORDING (2026-08-19): «Αν ο μαθητής στην κανονική ροή βαθμολογήθηκε
-- με αποτυχία ή υστέρηση, τότε θα υπολογίζουμε για βαθμολογία αυτή όπου η
-- πτήση χαρακτηρίστηκε ως επιτυχής.»
-- One checkride can hold several attempts; the value every GRADE SURFACE uses
-- is the attempt the flight was characterised SUCCESSFUL on. The failed and
-- lagged attempts stay in the record and stay visible — they never enter a
-- number.
-- ROUND 9'S TWIN RULE IS NOT REPLACED, IT IS DEMOTED TO THE TIEBREAK: PASS is
-- the filter and runs first; "the latest" decides only between attempts that
-- are equally operative. Latest = a dated attempt beats an undated one, then
-- the later date, then the higher position in the stored array — which is what
-- `order by (d is not null) desc, d desc, i desc` says.
-- A slot with no pass at all falls back to its latest graded attempt (passed
-- false), and one with no grade at all to its latest row, so a checkride that
-- has been flown never disappears from a table.
-- MIRROR: app/app.js → WA.evalOperativeOf / WA.attemptLater.
create or replace function wa.eval_operative(p_rec jsonb, p_id text) returns jsonb
language sql immutable as $$
  with att as (
    select t.e,
           (t.ord - 1)::int as i,
           nullif(trim(coalesce(t.e->>'date', '')), '') as d,
           case when jsonb_typeof(t.e->'grade') = 'number'
                then (t.e->>'grade')::numeric else null end as g
    from jsonb_array_elements(
           case when jsonb_typeof(p_rec->'evaluations') = 'array'
                then p_rec->'evaluations' else '[]'::jsonb end) with ordinality t(e, ord)
    where jsonb_typeof(t.e) = 'object' and t.e->>'evaluation' = p_id
  ),
  n as (select count(*)::int as k from att)
  select coalesce(
    (select jsonb_build_object('i', i, 'grade', g, 'date', d, 'passed', true,
                               'attempts', (select k from n))
       from att where wa.grade_passed(g)
       order by (d is not null) desc, d desc, i desc limit 1),
    (select jsonb_build_object('i', i, 'grade', g, 'date', d, 'passed', false,
                               'attempts', (select k from n))
       from att where g is not null
       order by (d is not null) desc, d desc, i desc limit 1),
    (select jsonb_build_object('i', i, 'grade', null, 'date', d, 'passed', false,
                               'attempts', (select k from n))
       from att
       order by (d is not null) desc, d desc, i desc limit 1))
$$;

-- the eight operative attempts of one record, keyed by checkride id — what
-- admin_get_data ships beside the record so the server's arithmetic and the
-- dashboard's are demonstrably the same arithmetic. `null` = never flown.
create or replace function wa.eval_grades(p_rec jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_object_agg(k.id, coalesce(wa.eval_operative(p_rec, k.id), 'null'::jsonb)),
                  '{}'::jsonb)
  from unnest(wa.eval_ids()) k(id)
$$;

-- FAIL / ALMOST GOOD categories — the four syllabus tracks. 'other' is not
-- offered by the form; it only carries v1 free-text rows through migration.
create or replace function wa.item_cats() returns text[]
language sql immutable as $$
  select array['contact','instrument','formation','vfr_navigation','other']::text[]
$$;

-- ── WHO MAY CONDUCT AN FPC (round 6) ──────────────────────────────────────
-- An FPC is a Δοκιμή Προόδου flown for the squadron leadership, so it is
-- conducted by ONE OF TWO APPOINTMENTS and by nobody else: the Squadron CO or
-- the DO. The instructor surnames and the free-text "Other…" that round 5
-- offered are gone from the FPC picker — an instructor's name in that box was
-- always a mis-filed CEF or an ordinary debrief.
-- CEF is untouched: an Εξέταση Καταλληλότητας is conducted by a Squadron
-- Evaluator, and its evaluator list stays open.
-- MIRROR: app/app.js → WA.FPC_EVALUATORS. Change one, change the other.
create or replace function wa.fpc_evaluators() returns text[]
language sql immutable as $$
  select array['Squadron CO','DO']::text[]
$$;

-- ── NFS REASONS (round 5) — the printed causes of the ΦΜΠ ──────────────────
-- Form Α0473 «ΦΥΛΛΟ ΜΗ ΠΤΗΣΗΣ ΜΑΘΗΤΗ – ΕΚΠΑΙΔΕΥΟΜΕΝΟΥ», 3-01/2025 ΔΑΕ
-- ΚΕΦ.9, PDF page 219 (printed page 201): the six-line table «ΑΙΤΙΑ ΦΥΛΛΟΥ ΜΗ
-- ΠΤΗΣΗΣ» — 1. ΑΠΟΤΥΧΙΑ ΣΕ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟ · 2. ΑΠΟΤΥΧΙΑ ΣΕ ΠΡΟ ΠΤΗΣΗΣ
-- ΕΝΗΜΕΡΩΣΗ · 3. ΑΠΟΤΥΧΙΑ ΣΕ ΠΤΗΣΗ · 4. ΑΠΟΤΥΧΙΑ ΣΕ F/S · 5. ΑΣΘΕΝΕΙΑ ·
-- 6. ΑΛΛΗ ΑΙΤΙΑ (a blank line on the form → the free-text note here).
-- MIRROR: app/app.js → WA.NFS_REASONS. Change one, change the other.
create or replace function wa.nfs_reasons() returns text[]
language sql immutable as $$
  select array['questionnaire','briefing','flight','fs','illness','other']::text[]
$$;

-- one NFS entry, given the reason it did not use to carry. A row written
-- before round 5 has only a free-text note — which is exactly the form's
-- «6. ΑΛΛΗ ΑΙΤΙΑ:» line, so it becomes reason 'other' with the note kept
-- verbatim. A row with neither reason nor note is flagged legacy: the form
-- asks which of the six causes it was and nothing is guessed for it.
create or replace function wa.nfs_reason_fix(e jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(e) <> 'object' then e
    when (e->>'reason') = any(wa.nfs_reasons()) then e
    when (e->>'reason') is not null
      then (e - 'reason') || jsonb_build_object('reason', null, 'legacy', true)
    when nullif(trim(coalesce(e->>'note', '')), '') is not null
      then e || jsonb_build_object('reason', 'other')
    else e || jsonb_build_object('legacy', true)
  end
$$;

-- ── SMS (ΚΕΠΕ) ENTRY REASONS (round 8) — the printed entry thresholds ──────
-- SMS is the squadron's Special Monitoring Status — ΚΕΠΕ, «Κατάσταση Ειδικής
-- Παρακολούθησης Εκπαίδευσης Μαθητή» — and the regulation does not leave the
-- reason for an entrance to prose: 3-01/2025 ΔΑΕ, ΚΕΦ.2 §32β, PDF page 54 =
-- printed page 36, prints the general power in its opening sentence and then
-- SIX numbered conditions, at least one of which puts a student in ΚΕΠΕ:
--   (1) Σε οποιαδήποτε έξοδο αέρος, πλην (περιπτώσεων ΑΕΡΟΝΑΥΤΙΑΣ,
--       Περιστατικού Φυσιολογίας Πτήσεων) ή F/S βαθμολογηθεί με 59% και κάτω.
--   (2) Σε δύο συνεχόμενες πτήσεις, εκτός των τελικών εξετάσεων και Δοκιμών
--       Προόδου, βαθμολογηθεί με 63% και κάτω.
--   (3) Σε δύο συνεχόμενες πτήσεις παρουσιάσει ΑΕΡΟΝΑΥΤΙΑ.
--   (4) Σε μία γραπτή αξιολόγηση ή εξέταση εδάφους (συμπεριλαμβανομένων
--       εξετάσεων σε CBT) χαρακτηρισθεί ως «ΑΠΟΤΥΧΩΝ».
--   (5) Σε 2 συνεχόμενες ή 4 μη συνεχόμενες προφορικές εξετάσεις εδάφους κατά
--       την ομαδική ή/και ατομική προ πτήσεως ενημέρωση, χαρακτηρισθεί ως
--       «ΑΠΟΤΥΧΩΝ».
--   (6) Όταν ο Εκπαιδευτής του, εισηγηθεί να μπει σε ΚΕΠΕ λόγω μη αποδεκτής
--       προόδου μεταξύ των πτήσεων.
-- THE SEVENTH IS NOT AN INVENTED "Other…": it is the opening sentence of the
-- same §32β — «Μαθητής να τίθεται σε ΚΕΠΕ κατά την κρίση του Διοικητή της
-- Μοίρας ή του Α.Ε. αυτής, όταν οι επιδόσεις του στην πτητική ή θεωρητική
-- εκπαίδευση υπολείπονται έναντι της παρεχόμενης εκπαίδευσης» — the standing
-- discretion of the Squadron CO / DO, which the six conditions specify
-- («Ειδικότερα…») without exhausting. That is the only room the regulation
-- leaves, so it is the only option beyond the six, it is NAMED rather than
-- blank, and it demands the reason in writing (§32δ(2): the CO informs the
-- student of the reasons he was put in ΚΕΠΕ).
-- MIRROR: app/app.js → WA.SMS_REASONS. Change one, change the other.
create or replace function wa.sms_reasons() returns text[]
language sql immutable as $$
  select array['sortie59','two63','airsickness','written','oral','instructor',
               'judgement']::text[]
$$;

-- one SMS entry, given the reason it did not use to carry (round 8).
-- Nothing is guessed: a row written before the rule keeps its note and is
-- flagged legacy, so it stays READABLE everywhere and the form asks which of
-- the seven it was before the record can be saved again — the standing
-- "keep it, ask for it" contract.
create or replace function wa.sms_reason_fix(e jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(e) <> 'object' then e
    when (e->>'reason') = any(wa.sms_reasons()) then e
    when (e->>'reason') is not null
      then (e - 'reason') || jsonb_build_object('reason', null, 'legacy', true)
    else e || jsonb_build_object('legacy', true)
  end
$$;

-- ══ THE ASSESSMENT SCALE (round 10) — THE CLOSED LIST AND ITS WEIGHTS ═════
-- The five levels IN SCALE ORDER, strongest first. The order is the order the
-- form draws them in and the order every table reads them in; the array
-- position is the scale position, so nothing anywhere has to hard-code a
-- sequence beside this one.
-- MIRROR: proposals_level_chk above · app/app.js → WA.LEVELS.
create or replace function wa.level_keys() returns text[]
language sql immutable as $$
  select array['strongly_recommended', 'recommended', 'alternate',
               'other_assignments', 'strongly_other_assignments']::text[]
$$;

-- THE WEIGHT OF A LEVEL — 10 / 8 / 5 / 3 / 1, set by the command.
-- The gaps are not decoration: 10→8 is a nuance between two recommendations,
-- 8→5 is a real step down, 5→3 crosses from "fighters" to "elsewhere", and
-- 3→1 is the emphasis inside that. A mean therefore separates a class the way
-- the squadron reads it, which an even 5/4/3/2/1 would not.
-- null for anything else — an unassessed row weighs nothing and, crucially,
-- COUNTS as nothing: it is excluded from the mean rather than scored zero.
create or replace function wa.level_weight(p_level text) returns int
language sql immutable as $$
  select case p_level
    when 'strongly_recommended'       then 10
    when 'recommended'                then 8
    when 'alternate'                  then 5
    when 'other_assignments'          then 3
    when 'strongly_other_assignments' then 1
    else null end
$$;

-- THE WORDS, character-exact. The server owns them because they are printed
-- on a document that goes to the Wing Commander and shown to the student's
-- own instructors: one spelling, one source, no drift between the form, the
-- brief, the CSV and the print sheet.
create or replace function wa.level_label(p_level text) returns text
language sql immutable as $$
  select case p_level
    when 'strongly_recommended'       then 'Strongly Recommended'
    when 'recommended'                then 'Recommended'
    when 'alternate'                  then 'Recommended as Alternate'
    when 'other_assignments'          then 'Recommended for Other Assignments'
    when 'strongly_other_assignments' then 'Strongly Recommended for Other Assignments'
    else null end
$$;

-- ── THE FIXED SOLO SLOTS (round 5) ────────────────────────────────────────
-- Solos are not a free list: the form draws exactly these rows, empty until
-- flown, and nothing can add or remove one. An unforeseen extra solo is a
-- slot-LESS entry (the "additional solo" path).
-- ROUND 12 — the list itself MOVED INTO THE GENERATED BLOCK above. It was
-- hand-kept here and mirrored app/items-catalog.js → WA_SOLO_SLOTS by
-- discipline alone; both now come from one run of tools/gen-items-catalog.py
-- over flowchart2.json, so they cannot drift. See wa.solo_slots() there.

-- the track a Phase II sortie code belongs to, from its letter — B/C contact,
-- I instrument, F formation, N navigation (verified against all 133 codes of
-- flowchart2.json). null = not a syllabus-shaped code, i.e. free text.
-- This is what makes "category Instrument + flight C4302" impossible: the
-- letter IS the track, so the pair contradicts itself and is refused.
create or replace function wa.code_track(p_code text) returns text
language sql immutable as $$
  select case
    when p_code is null or upper(p_code) !~ '^[BCIFN][0-9]{4}$' then null
    when left(upper(p_code), 1) in ('B', 'C') then 'contact'
    when left(upper(p_code), 1) = 'I' then 'instrument'
    when left(upper(p_code), 1) = 'F' then 'formation'
    else 'vfr_navigation' end
$$;

-- ══ ROUND 12 — THE LOG TABLES ═════════════════════════════════════════════
-- COMMAND WORDING (2026-08-19), verbatim:
--   «Για αρχη προσθεσε για καθε μαθητη ανα κατηγορια ενα πινακα στο τελος οπου
--   θα εχει ολες τις πτησεις. contact, ημερομηνια, instructor, duration, grade
--   or non graded (δεκτο το null, γιατι καποιες φορες αργει το debriefing).
--   4+4 πινακες για f/s και flights. ομοιως τα μαθηματα και τα exams.»
-- and, on the placeholder kinds:
--   «να αφησουμε placeholder για τυχον fcf, cef, repeat»
--
-- THE 4+4 TABLES ARE A RENDER GROUPING, NOT EIGHT STORAGE KEYS. Adding a
-- section to this app is expensive by design — a dozen lists name every one of
-- them by hand — so eight sections would be eight copies of one identical rule.
-- FOUR sections carry them, taking the FDMS `kind` vocabulary verbatim so that
-- anyone reading either codebase meets the same four words:
--   flights  the aircraft sorties          → 4 tables, one per track
--   fs       the simulator sorties         → 4 tables, one per track
--   lessons  the ground courses            → one block
--   exams    the 8 ground-exam groups      → one block
-- WHY SPLIT BY BAND AT ALL, given the tables are per track?
--   1. THE SECTION IS THE BAND. The track is on the row (and the letter of a
--      syllabus code proves it — wa.code_track), but NOTHING anywhere derives
--      flights-from-F/S out of a code, so the band has to be stored somewhere,
--      and being the array it sits in costs nothing.
--   2. THE ENTRY CAP. 85 flights plus their re-flies in one array approaches
--      wa.section_cap; per band it never does.
--   3. Sim hours and flight hours are counted separately by the squadron
--      everywhere.
-- NOTHING IS PRE-SEEDED. The syllabus list is the CLOSED LIST a sortie is
-- CHOSEN from, never a skeleton of rows: an unflown sortie is not an entry, so
-- wa.slot_empty needs no branch for these four and the CO-entry arithmetic
-- ("1 of 18 entered by the CO") is not diluted by 133 placeholders.
--
-- the thirteen sections of a v2 record, in form order — the new four LAST,
-- which is where the directive puts them («ενα πινακα στο τελος»).
-- MIRROR: app/app.js → WA.COUNTED.
create or replace function wa.sections() returns text[]
language sql immutable as $$
  select array['nfs','sms','fail','almost_good','airsickness',
               'evaluations','solo_flights','fpc','cef',
               'flights','fs','lessons','exams']::text[]
$$;

-- the two bands, which are also the two log-flight section names
create or replace function wa.log_bands() returns text[]
language sql immutable as $$ select array['flights','fs']::text[] $$;

-- HOW MANY ENTRIES ONE SECTION MAY HOLD. 200 was a flat literal until round 12
-- put the whole syllabus in reach of a record: 47 ground courses over several
-- blocks each, and 85 flights plus their re-flies, are legitimately more rows
-- than any earlier section could ever have. Payload size is not the constraint
-- (a flight row is ~180 bytes against a 400 000-byte ceiling); the cap is only
-- there to stop a runaway client.
create or replace function wa.section_cap(p_sec text) returns int
language sql immutable as $$
  select case when p_sec in ('flights','fs','lessons') then 400 else 200 end
$$;

-- ── THE FLIGHT KINDS (round 12) ───────────────────────────────────────────
-- «να αφησουμε placeholder για τυχον fcf, cef, repeat» — the user's own list,
-- closed, with 'syllabus' as the default every ordinary row takes:
--   syllabus  a sortie of the printed flow chart, flown in its place
--   repeat    the SAME syllabus node flown again (FDMS records a re-fly as a
--             new event on the same node; here it is a new row that says so)
--   fcf       Functional Check Flight        cef  Εξέταση Καταλληλότητας
--   other     anything the four above do not cover
-- fcf / cef / other are OFF-CATALOGUE BY NATURE: they free the sortie box to
-- free text WITHOUT the "not in the syllabus catalogue" warning, because for
-- them the catalogue was never the right list to look in.
-- MIRROR: app/app.js → WA.FLIGHT_KINDS.
create or replace function wa.flight_kinds() returns text[]
language sql immutable as $$
  select array['syllabus','repeat','fcf','cef','other']::text[]
$$;

-- ── THE VERDICT WITHOUT A NUMBER (round 12) ───────────────────────────────
-- The squadron's scheduler knows pass / lag / fail and has NO percentage for a
-- sortie; this record knows percentages. `verdict` is how the first crosses
-- into the second, and it exists ONLY WHERE THE GRADE IS ABSENT: a stored
-- verdict beside a stored grade is a second source of truth that can
-- contradict the first — the exact defect round 11 removed from the FPC («an
-- FPC's result is its grade against the printed scale»). Where a grade exists
-- the verdict is DERIVED (wa.grade_verdict) and a stored one is refused by name.
-- Without it, a flight the squadron recorded as FAILED would arrive in the
-- student's record indistinguishable from one still awaiting its debrief — a
-- failure invisible in the record that exists to show it.
create or replace function wa.verdicts() returns text[]
language sql immutable as $$
  select array['pass','lagging','failed']::text[]
$$;

-- the three-way collapse of the printed five-band scale, at the SAME
-- thresholds (ΠΔ 151/13: 60 % separates acceptable from unacceptable, 50-59 %
-- is ΥΣΤΕΡΗΣΗ / ΣΧΕΔΟΝ ΚΑΛΩΣ): excellent · very_good · good → pass.
-- MIRROR: app/app.js → WA.gradeVerdict.
create or replace function wa.grade_verdict(g numeric) returns text
language sql immutable as $$
  select case wa.grade_band(g)
    when 'excellent' then 'pass' when 'very_good' then 'pass' when 'good' then 'pass'
    when 'lagging'   then 'lagging'
    when 'failed'    then 'failed'
    else null end
$$;

-- a whole number in a range, nullable — the ground-lesson periods box.
-- NULL IS NOT ZERO here: it means the FULL course, which is FDMS's own
-- semantics for a lesson event that carries no periods_done (covCore).
create or replace function wa.chk_int(v jsonb, p_where text, p_min int, p_max int)
returns void language plpgsql immutable as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return; end if;
  perform wa.chk(jsonb_typeof(v) = 'number', p_where, 'must be a number');
  n := (v #>> '{}')::numeric;
  perform wa.chk(n = trunc(n), p_where, 'must be a whole number');
  perform wa.chk(n >= p_min and n <= p_max, p_where,
                 format('out of range %s-%s', p_min, p_max));
end $$;

-- DURATION — DECIMAL HOURS, ONE DECIMAL (round 12). 0.1 h = 6 minutes, which
-- is how a logbook line is written and how the squadron reads a flight time.
-- What is STORED is the time ACTUALLY flown; what the box OPENS with is the
-- syllabus value for that sortie, so the common case is a confirmation and the
-- uncommon one a correction. Nullable, because the same debrief lag applies —
-- a sortie can be dated and flown before the times are in.
create or replace function wa.chk_duration(v jsonb, p_where text)
returns void language plpgsql immutable as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return; end if;
  perform wa.chk(jsonb_typeof(v) = 'number', p_where, 'duration must be a number');
  n := (v #>> '{}')::numeric;
  perform wa.chk(n > 0, p_where,
                 'a flown sortie lasted longer than nothing — leave the box empty while the time is not known yet');
  perform wa.chk(n <= 24, p_where,
                 'duration is DECIMAL HOURS, not minutes — 1.3 is one hour and eighteen minutes');
  perform wa.chk(n = round(n, 1), p_where,
                 format('duration is recorded to one decimal (6-minute steps) — %s is not (round it, e.g. %s)',
                        trim(trailing '.' from trim(trailing '0' from n::text)),
                        trim(trailing '.' from trim(trailing '0' from round(n, 1)::text))));
end $$;

-- ── PENDING IS GONE (round 8) ─────────────────────────────────────────────
-- The tick box, the flag, the badges, the columns and the counters are all
-- removed. An unfilled fixed slot needs no flag to say what it is: it has no
-- date, so it has not been flown, and every surface reads it that way. A
-- FAIL / FPC / CEF row waiting for a result is simply a row whose result is
-- not written yet. The key is therefore out of every section's whitelist
-- (wa.entry_keys), refused on write with its own sentence, and stripped from
-- stored rows on read (wa.strip_entry, via wa.migrate_record).
-- Superseded, and dropped so no view can call it back:
drop function if exists wa.pending_sections();
drop function if exists wa.pending_count(jsonb);

-- ── PER-SECTION KEY WHITELIST (round-4 W3a) ───────────────────────────────
-- The exhaustive list of keys ONE entry of a section may carry. Anything else
-- is rejected on write and stripped on read: a typo ("total_count") is caught
-- instead of silently stored, and a flag the form no longer knows ("pending",
-- retired in round 8) can never enter the record.
-- MIRROR: app/app.js → WA.ENTRY_KEYS. Change one, change the other.
create or replace function wa.entry_keys(p_sec text) returns text[]
language sql immutable as $$
  select case p_sec
    when 'nfs'          then array['date','reason','note','legacy','entered_by']
    -- ROUND 8: an SMS entrance names the ΚΕΠΕ entry condition it was raised
    -- under (3-01 ΚΕΦ.2 §32β) — wa.sms_reasons().
    when 'sms'          then array['entrance_date','exit_date','reason','note','legacy','entered_by']
    when 'fail'         then array['date','category','flight_code','items','instructor',
                                   'grade','legacy','entered_by']
    when 'almost_good'  then array['date','category','flight_code','items','instructor',
                                   'grade','legacy','entered_by']
    -- ROUND 6: an airsickness event names the FLIGHT it happened on, not a
    -- phase-of-flight note. `phase` survives in this list as a READ-ONLY
    -- LEGACY CARRIER — a note already written is never destroyed behind its
    -- owner's back — but the form no longer draws the box, the write path
    -- refuses to let the number of rows carrying one grow (wa.phase_count),
    -- and such a row cannot be saved again until its flight is chosen.
    when 'airsickness'  then array['date','instructor','flight_code','phase','legacy','entered_by']
    when 'evaluations'  then array['date','evaluation','with','grade','legacy','entered_by']
    when 'solo_flights' then array['slot','sortie','date','ng','grade','instructor','legacy','entered_by']
    when 'fpc'          then array['date','flight_code','evaluator','result','grade','legacy','entered_by']
    when 'cef'          then array['date','flight_code','evaluator','result','grade','legacy','entered_by']
    -- ══ ROUND 12 — THE LOG TABLES ═══════════════════════════════════════════
    -- flights and fs share ONE shape: the same flight, flown in the aircraft or
    -- in the simulator, is the same set of facts.
    --   date            required — the sortie happened on a day; only the GRADE lags
    --   track           which of the four tables the row belongs to. It is not
    --                   derived from the code, because kind fcf/cef/other have no
    --                   syllabus code at all; where a syllabus code IS present its
    --                   letter must agree with it (the fail/almost_good rule).
    --   sortie          the flight identity. Closed list per (section, track);
    --                   free text accepted and shown marked "off-catalogue".
    --   seq             which flight of that code on that date — 1, and 2 for a
    --                   deliberate same-day re-fly. AUTHORED, never derived from
    --                   an array index: an index is a position and this is a fact.
    --   kind            wa.flight_kinds() — 'syllabus' unless said otherwise
    --   instructor      required on EVERY row (the round-6 solo doctrine)
    --   instructor_oid  the unambiguous identity, never drawn as a box
    --   duration        decimal hours, one decimal, nullable
    --   grade           0-100 whole, nullable — NULL = the debrief has not landed
    --   ng              non-graded BY NATURE; ng ⇒ grade must be null
    --   verdict         only where the grade is absent (wa.verdicts())
    --   note            ≤300, also the carrier for a lag/fail's maneuvers text
    when 'flights'      then array['date','track','sortie','seq','kind','instructor',
                                   'instructor_oid','duration','grade','ng','verdict',
                                   'note','legacy','entered_by']
    when 'fs'           then array['date','track','sortie','seq','kind','instructor',
                                   'instructor_oid','duration','grade','ng','verdict',
                                   'note','legacy','entered_by']
    -- A GROUND LESSON IS A BLOCK, not a point: date = start, end_date = end,
    -- null = a single day. `periods` NULL means the FULL course (FDMS's own
    -- covCore semantics), and `absent` is how "the class covered it and this
    -- student did not" is said from the student's side. No grade: a lesson is
    -- attended, not scored.
    when 'lessons'      then array['date','end_date','group','course','periods','absent',
                                   'instructor','instructor_oid','note','legacy','entered_by']
    -- THE EIGHT GROUND-EXAM GROUPS AND NOTHING ELSE. Four theory groups carry a
    -- nested exams[] (FF 190 · PT 190 · AΕ 190 · JX 190 · JX 191 · NA 191) which
    -- FDMS treats as COURSES OF THEIR GROUP — they belong in `lessons`, and
    -- filing them here as well would make the two systems disagree about what a
    -- student is owed.
    when 'exams'        then array['date','exam','grade','instructor','instructor_oid',
                                   'note','legacy','entered_by']
    else array[]::text[] end
$$;

-- ── AN EMPTY FIXED SLOT (round 5) ─────────────────────────────────────────
-- Solo flights and evaluations are FIXED syllabus rows: the eight solos the
-- stage prescribes and the eight stage checkrides are present from the first
-- day, empty until they are flown. A slot nobody has flown yet is a
-- PLACEHOLDER, not an entry — it must not be counted, must not be stamped as
-- "entered by the CO", and must not demand a date it cannot have.
create or replace function wa.slot_empty(p_sec text, e jsonb) returns boolean
language sql immutable as $$
  select case
    when jsonb_typeof(e) <> 'object' then false
    when p_sec = 'solo_flights' then
      (e->>'slot') is not null and (e->>'date') is null and (e->>'grade') is null
      and (e->>'instructor') is null and (e->>'sortie') is null
      and coalesce((case when jsonb_typeof(e->'ng') = 'boolean'
                         then (e->>'ng')::boolean else false end), false) = false
    -- ROUND 8: the pending tick is gone, so an evaluation slot is empty when
    -- it carries nothing but its identity — which is all it ever meant.
    when p_sec = 'evaluations' then
      (e->>'evaluation') is not null and (e->>'date') is null and (e->>'grade') is null
      and (e->>'with') is null
    else false end
$$;

-- one entry, reduced to the keys its section allows (read-time repair)
create or replace function wa.strip_entry(e jsonb, p_sec text) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(e) <> 'object' then '{}'::jsonb else
    coalesce((select jsonb_object_agg(t.k, t.v) from jsonb_each(e) t(k, v)
              where t.k = any(wa.entry_keys(p_sec))), '{}'::jsonb) end
$$;

-- STUDENT RECORD payload — full structural validation, raises on violation.
-- v2 shape (round 3): every section is a LIST of dated entries; counts are
-- derived, never stored. Round 4 adds the per-section key whitelist.
create or replace function wa.validate_record(p jsonb) returns void
language plpgsql immutable as $$
declare
  k text;
  f text;
  e jsonb;
  i int;
  i2 int;
  w text;
  pos int;
  prev_id text;
  done boolean[];
  is_ng boolean;
  allowed text[] := wa.sections();
begin
  perform wa.chk(p is not null and jsonb_typeof(p) = 'object', 'root', 'payload must be an object');
  perform wa.chk(pg_column_size(p) < 400000, 'root', 'payload too large');
  for k in select jsonb_object_keys(p) loop
    perform wa.chk(k <> 'progress_tests', k, 'renamed — send it as "fpc"');
    perform wa.chk(k <> 'fcp', k, 'renamed — the progress check is an FPC, send it as "fpc"');
    perform wa.chk(k <> 'aptitude_exams', k, 'renamed — send it as "cef"');
    perform wa.chk(k = any(allowed), k, 'unknown section');
  end loop;
  perform wa.chk(jsonb_typeof(p->'nfs') is distinct from 'object', 'nfs',
                 'manual counts are no longer accepted — send a list of dated entries');

  -- every section: array, <= 200 entries, entries are dated objects
  foreach k in array allowed loop
    if p ? k then
      perform wa.chk(jsonb_typeof(p->k) = 'array', k, 'must be a list');
      -- ROUND 12: the flat 200 became wa.section_cap — the log tables can hold
      -- the whole syllabus and its re-flies, which no earlier section could.
      perform wa.chk(jsonb_array_length(p->k) <= wa.section_cap(k), k, 'too many entries');
      for i in 0 .. coalesce(jsonb_array_length(p->k), 0) - 1 loop
        e := p->k->i;
        w := format('%s[%s]', k, i);
        perform wa.chk(jsonb_typeof(e) = 'object', w, 'entry must be an object');
        perform wa.chk(not (e ? 'count'), w,
                       'manual counts are not accepted — the count is derived from the entries');
        perform wa.chk_bool(e->'legacy', w || '.legacy');

        if k = 'nfs' then
          perform wa.chk_date(e->'date', w || '.date', not wa.is_legacy(e));
          -- the REASON is the printed cause of the ΦΜΠ (form Α0473, 3-01 ΚΕΦ.9)
          perform wa.chk_text(e->'reason', w || '.reason', not wa.is_legacy(e), 40);
          perform wa.chk(e->>'reason' is null or (e->>'reason') = any(wa.nfs_reasons()),
                         w || '.reason',
                         format('unknown NFS reason — the form prints %s',
                                array_to_string(wa.nfs_reasons(), ' / ')));
          perform wa.chk_text(e->'note', w || '.note', false, 300);
          perform wa.chk((e->>'reason') is distinct from 'other'
                         or nullif(trim(coalesce(e->>'note', '')), '') is not null,
                         w || '.note',
                         'reason "Other" needs the cause written out (the ΑΛΛΗ ΑΙΤΙΑ line of the form)');

        elsif k = 'sms' then
          perform wa.chk_date(e->'entrance_date', w || '.entrance_date', not wa.is_legacy(e));
          perform wa.chk_date(e->'exit_date', w || '.exit_date', false);
          perform wa.chk_text(e->'note', w || '.note', false, 300);
          -- ROUND 8 — THE ENTRANCE NAMES ITS ΚΕΠΕ CONDITION (3-01 ΚΕΦ.2 §32β).
          -- The regulation prints the six thresholds and, in the opening
          -- sentence of the same paragraph, the Squadron CO / DO discretion
          -- they specify; nothing else puts a student in ΚΕΠΕ, so nothing else
          -- is accepted here. REQUIRED EVEN ON A LEGACY ROW — the legacy flag
          -- excuses what the OLD form never asked for, never a rule of this
          -- round, or the rule would be optional for exactly the rows that
          -- break it. Such a row stays READABLE everywhere and is refused on
          -- the next save until the condition is chosen.
          perform wa.chk_text(e->'reason', w || '.reason', false, 40);
          perform wa.chk(nullif(trim(coalesce(e->>'reason', '')), '') is not null,
                         w || '.reason',
                         'every SMS entrance names the condition it was raised under — the six ΚΕΠΕ entry thresholds of 3-01 ΚΕΦ.2 §32β, or the Squadron CO / DO decision of its opening sentence');
          perform wa.chk((e->>'reason') = any(wa.sms_reasons()),
                         w || '.reason',
                         format('unknown SMS entry condition — 3-01 ΚΕΦ.2 §32β prints %s',
                                array_to_string(wa.sms_reasons(), ' / ')));
          -- the discretionary path is the only one that is not a measurable
          -- threshold, so it carries its reason in writing (§32δ(2))
          perform wa.chk((e->>'reason') is distinct from 'judgement'
                         or nullif(trim(coalesce(e->>'note', '')), '') is not null,
                         w || '.note',
                         'a Squadron CO / DO decision names the reduced performance it was based on — write it in the note (3-01 ΚΕΦ.2 §32δ(2): the student is told the reasons he was put in ΚΕΠΕ)');

        elsif k in ('fail', 'almost_good') then
          perform wa.chk_entry_date(e, w);
          perform wa.chk_text(e->'category', w || '.category', not wa.is_legacy(e), 40);
          perform wa.chk(e->>'category' is null or (e->>'category') = any(wa.item_cats()),
                         w || '.category', 'unknown category');
          perform wa.chk_text(e->'flight_code', w || '.flight_code', false, 40);
          -- CATEGORY ⇄ FLIGHT CODE (round 5). The picker only ever offers the
          -- chosen track's sorties, so this can only arrive through free text
          -- (or a hand-made payload). A syllabus-SHAPED code whose letter
          -- contradicts the category is provably wrong — refused, by name.
          -- A code the catalogue does not know (a re-numbered sortie, a
          -- one-off) is accepted and shown marked "off-catalogue": the
          -- syllabus data may lag reality, and a record must never become
          -- unstorable because of it.
          perform wa.chk(wa.code_track(e->>'flight_code') is null
                         or (e->>'category') is null or (e->>'category') = 'other'
                         or wa.code_track(e->>'flight_code') = (e->>'category'),
                         w || '.flight_code',
                         format('flight %s belongs to the %s track but this entry is filed under %s — choose the code from the chosen track''s list',
                                upper(e->>'flight_code'),
                                wa.code_track(e->>'flight_code'), e->>'category'));
          perform wa.chk_str_list(e->'items', w || '.items',
                                  case when wa.is_legacy(e) then 0 else 1 end, 40, 300);
          -- SYLLABUS ONLY (round 6). The custom "Other… (type it yourself)"
          -- item is gone: an item that is not on the printed gradesheet of the
          -- chosen track cannot be compared with anything, cannot be counted
          -- across students and cannot be looked up in the MIF. items[] may
          -- therefore hold ONLY the catalogue names of the entry's category —
          -- and a row still filed under the migration placeholder 'other' has
          -- no catalogue at all, so it must be given a real track first.
          -- The legacy rows keep their custom strings (they are READ, marked
          -- and shown), and this is the refusal that asks for them to be
          -- replaced before the record is written again.
          if jsonb_typeof(e->'items') = 'array' then
            for i2 in 0 .. jsonb_array_length(e->'items') - 1 loop
              perform wa.chk(
                jsonb_typeof(e->'items'->i2) <> 'string'
                or (e->>'category') is not null
                   and (e->'items'->>i2) = any(wa.item_names(e->>'category')),
                format('%s.items[%s]', w, i2),
                case
                  when (e->>'category') is null or (e->>'category') = 'other' then
                    format('“%s” is not a syllabus item, and this entry has no track yet — choose the track first, then pick the item from its printed gradesheet (the custom item was removed in round 6)',
                           e->'items'->>i2)
                  else
                    format('“%s” is not a syllabus item — FAIL / ALMOST GOOD items come from the printed %s gradesheet only (the custom item was removed in round 6): replace it with an item of that list',
                           e->'items'->>i2, e->>'category')
                end);
            end loop;
          end if;
          perform wa.chk_text(e->'instructor', w || '.instructor', false, 200);
          perform wa.chk_grade(e->'grade', w || '.grade', false);

        elsif k = 'airsickness' then
          -- ROUND 6 — THE FLIGHT, NOT THE PHASE. An airsickness event is
          -- attached to the sortie it happened on (any track: airsickness does
          -- not respect the syllabus), and the free-text "phase of flight /
          -- note" box is gone. A stored note is still READ — nothing is
          -- destroyed behind its owner's back — but a row that carries one
          -- cannot be written again until the flight has been chosen.
          perform wa.chk_entry_date(e, w);
          perform wa.chk_text(e->'instructor', w || '.instructor', false, 200);
          perform wa.chk_text(e->'flight_code', w || '.flight_code', false, 40);
          perform wa.chk_text(e->'phase', w || '.phase', false, 300);
          -- THE FLIGHT IS MANDATORY (round 6b). "Add the flight" was the point
          -- of the round: an airsickness event with no sortie on it is a date
          -- and a name, and no pattern can be seen in that. ABSENT, null, ""
          -- and "   " are the SAME absence and all four are refused — the
          -- value has already been through wa.norm_code at the write boundary,
          -- so a padded string arrives here as ''.
          -- REQUIRED EVEN ON A LEGACY ROW, exactly like the solo instructor
          -- below: the legacy flag excuses what the OLD form never asked for,
          -- it does not excuse a rule of this round, or the rule would be
          -- optional for precisely the rows that break it. Such a row stays
          -- READABLE everywhere and is refused on the next save until the
          -- flight is supplied — the standing "keep it, ask for it" contract.
          -- The row that still carries the retired note gets the sentence that
          -- explains what happened to it; every other one gets the rule.
          perform wa.chk(nullif(trim(coalesce(e->>'flight_code', '')), '') is not null,
                         w || '.flight_code',
                         case when nullif(trim(coalesce(e->>'phase', '')), '') is not null
                              then 'the phase-of-flight note is no longer collected — this entry keeps it as legacy information, but it cannot be saved again until you choose the FLIGHT the airsickness happened on'
                              else 'every airsickness entry names the FLIGHT it happened on — choose the sortie the student was sick on (round 6 replaced the phase-of-flight note with the flight)'
                         end);

        elsif k = 'evaluations' then
          -- FIXED SLOT RULE (round 5): the eight checkrides are always present.
          -- A checkride that has not been flown yet is an identity and nothing
          -- else — it cannot carry the date it does not have. The moment it
          -- carries anything at all (a date, a grade, an evaluator) it is a
          -- flown evaluation and the date is required again.
          perform wa.chk_bool(e->'legacy', w || '.legacy');
          perform wa.chk_date(e->'date', w || '.date',
                              not wa.is_legacy(e) and not wa.slot_empty(k, e));
          perform wa.chk_text(e->'evaluation', w || '.evaluation', not wa.is_legacy(e), 20);
          perform wa.chk(e->>'evaluation' is null or (e->>'evaluation') = any(wa.eval_ids()),
                         w || '.evaluation', 'unknown evaluation — expected one of the eight checkrides');
          perform wa.chk_text(e->'with', w || '.with', false, 200);
          perform wa.chk_grade(e->'grade', w || '.grade', false);

        elsif k = 'solo_flights' then
          -- FIXED SLOT RULE (round 5): the solos of the stage are the syllabus
          -- slots, present from day one and empty until flown. `slot` names
          -- which one; a slot-LESS entry is the "additional solo" escape hatch
          -- for a solo the syllabus did not foresee.
          perform wa.chk_bool(e->'legacy', w || '.legacy');
          perform wa.chk_text(e->'slot', w || '.slot', false, 40);
          perform wa.chk((e->>'slot') is null or (e->>'slot') = any(wa.solo_slots()),
                         w || '.slot',
                         'unknown solo slot — the solo rows are the fixed slots of the syllabus');
          perform wa.chk_text(e->'sortie', w || '.sortie', false, 20);
          perform wa.chk((e->>'sortie') is null or wa.code_track(e->>'sortie') is not null,
                         w || '.sortie', 'the solo sortie must be a syllabus code (e.g. C4802)');
          perform wa.chk((e->>'sortie') is null or (e->>'slot') is null
                         or left(upper(e->>'sortie'), 1) = left(e->>'slot', 1),
                         w || '.sortie',
                         'this sortie does not belong to the Training Section of that solo slot');
          perform wa.chk(not (e ? 'graded'), w || '.graded',
                         'replaced — send "ng": true for a non-graded solo');
          perform wa.chk_bool(e->'ng', w || '.ng');
          -- THE INSTRUCTOR IS ON EVERY FLOWN SOLO ROW (round 6) — NG included.
          -- A student never launches alone on their own authority: somebody
          -- AUTHORISES the solo, signs for it and owns it. NG removes the
          -- GRADE (there is nothing to score), never the person: on a
          -- non-graded row the name is the AUTHORISING instructor, on a graded
          -- one it is the instructor / evaluator who graded it.
          if not wa.slot_empty(k, e) then
            is_ng := coalesce(case when jsonb_typeof(e->'ng') = 'boolean'
                                   then (e->>'ng')::boolean else false end, false);
            perform wa.chk_date(e->'date', w || '.date', not wa.is_legacy(e));
            -- REQUIRED EVEN ON A LEGACY ROW. The legacy flag excuses what the
            -- OLD form never asked for; it does not excuse a round-6 rule, or
            -- the rule would be optional for exactly the rows that break it.
            -- A row without the name is readable everywhere and refused on the
            -- next save until it is supplied ("keep it, ask for it").
            -- The type/length check first, so a number in the box is answered
            -- with "must be text" and not with the rule below…
            perform wa.chk_text(e->'instructor', w || '.instructor', false, 200);
            -- …and then THE NAME ITSELF, on every FLOWN row, graded or NG.
            -- ROUND 6b: one absence, four spellings. The key ABSENT, an
            -- explicit null, "" and "   " all mean nobody signed for this
            -- solo, so all four are refused — the value has already been
            -- through wa.norm_line at the write boundary, so a padded string
            -- arrives here as ''. (Before this, a graded row could carry
            -- instructor:"" past the required-text check, which only asks
            -- whether a STRING is there; and absent/null were refused with a
            -- generic "required text missing" instead of the rule.) The
            -- sentence names which kind of row it is, because the two are
            -- different duties: the NG row wants the AUTHORISING instructor,
            -- the graded one the instructor / evaluator who scored it.
            perform wa.chk(nullif(trim(coalesce(e->>'instructor', '')), '') is not null,
                           w || '.instructor',
                           case when is_ng
                                then 'a non-graded (NG) solo still names the AUTHORISING instructor — NG removes the grade, not the person who authorised the flight'
                                else 'a flown solo names the instructor / evaluator who signed for it — a student never launches alone on their own authority'
                           end);
            if is_ng then
              perform wa.chk(e->'grade' is null or jsonb_typeof(e->'grade') = 'null',
                             w || '.grade', 'a non-graded (NG) solo carries no grade');
            else
              perform wa.chk_grade(e->'grade', w || '.grade', not wa.is_legacy(e));
            end if;
          end if;

        elsif k in ('fpc', 'cef') then
          -- round 5: the person is the EVALUATOR (DO / Squadron CO / an
          -- instructor), and the entry names the STAGE FLIGHT that triggered it.
          perform wa.chk(not (e ? 'by'), w || '.by',
                         'renamed — the person who conducted it is the evaluator, send it as "evaluator"');
          perform wa.chk_entry_date(e, w);
          perform wa.chk_text(e->'flight_code', w || '.flight_code', false, 40);
          perform wa.chk((e->>'flight_code') is null
                         or wa.code_track(e->>'flight_code') is not null
                         or length(trim(e->>'flight_code')) > 0,
                         w || '.flight_code', 'the trigger flight cannot be blank');
          perform wa.chk_text(e->'evaluator', w || '.evaluator', false, 200);
          -- AN FPC IS CONDUCTED BY THE SQUADRON CO OR THE DO — nobody else
          -- (round 6). CEF keeps its open list: a CEF is flown with a Squadron
          -- Evaluator. A stored value from before this rule is READ and shown,
          -- and this refusal is what asks for it to be corrected.
          if k = 'fpc' then
            perform wa.chk((e->>'evaluator') is null
                           or (e->>'evaluator') = any(wa.fpc_evaluators()),
                           w || '.evaluator',
                           format('an FPC is conducted by the %s and by nobody else — “%s” is not one of them',
                                  array_to_string(wa.fpc_evaluators(), ' or the '),
                                  e->>'evaluator'));
          end if;
          perform wa.chk_text(e->'result', w || '.result', false, 300);
          perform wa.chk_grade(e->'grade', w || '.grade', false);

        -- ══ ROUND 12 — THE LOG TABLES ═════════════════════════════════════
        elsif k in ('flights', 'fs') then
          -- THE DATE. The flight happened on a day; only the GRADE lags, which
          -- is the whole point of «δεκτο το null, γιατι καποιες φορες αργει το
          -- debriefing». A date is therefore required on every row.
          perform wa.chk_entry_date(e, w);

          -- WHICH TABLE THIS ROW IS IN. Four per band, and the row says which:
          -- kind fcf / cef / other have no syllabus code to read a track off,
          -- so the track cannot be derived and has to be stored.
          perform wa.chk_text(e->'track', w || '.track', not wa.is_legacy(e), 20);
          perform wa.chk((e->>'track') is null
                         or ((e->>'track') = any(wa.item_cats()) and (e->>'track') <> 'other'),
                         w || '.track',
                         format('unknown track — the four tables of a band are %s',
                                array_to_string(array['contact','instrument','formation','vfr_navigation'], ' / ')));

          -- THE FLIGHT IDENTITY. «contact» in the directive is the sortie: the
          -- table is already per category, so the first column is WHICH FLIGHT.
          perform wa.chk_text(e->'sortie', w || '.sortie', not wa.is_legacy(e), 40);
          perform wa.chk(wa.is_legacy(e)
                         or nullif(trim(coalesce(e->>'sortie', '')), '') is not null,
                         w || '.sortie',
                         'every row of a flight log names the flight — choose the sortie from the table''s list, or type it if the syllabus data lags reality');
          -- TRACK ⇄ CODE, the round-5 rule applied to the same kind of pair. A
          -- code the catalogue does NOT know is accepted and shown marked
          -- off-catalogue (the syllabus data may lag reality and a record must
          -- never become unstorable); a syllabus-SHAPED code whose letter
          -- contradicts the table it sits in is provably wrong.
          perform wa.chk(wa.code_track(e->>'sortie') is null or (e->>'track') is null
                         or wa.code_track(e->>'sortie') = (e->>'track'),
                         w || '.sortie',
                         format('%s belongs to the %s track but this row is in the %s table — record it in that table instead',
                                upper(e->>'sortie'), wa.code_track(e->>'sortie'), e->>'track'));
          -- BAND ⇄ CODE, the same doctrine one axis over. Nothing derives
          -- flights-from-F/S out of a code, so the generated catalogue is the
          -- only authority — and where it knows the code, it is a fact.
          perform wa.chk(wa.sortie_band(e->>'sortie') is null
                         or wa.sortie_band(e->>'sortie') = k,
                         w || '.sortie',
                         format('%s is %s sortie — it belongs in the %s tables, not the %s ones',
                                upper(e->>'sortie'),
                                case when wa.sortie_band(e->>'sortie') = 'fs' then 'a SIMULATOR' else 'an AIRCRAFT' end,
                                case when wa.sortie_band(e->>'sortie') = 'fs' then 'F/S' else 'Flights' end,
                                case when k = 'fs' then 'F/S' else 'Flights' end));
          -- ONE FACT, ONE ROW. The eight checkrides have their own section,
          -- with the syllabus-order rule and the pass-attempt rule on them. A
          -- second row here would be a second grade for one flight, and the two
          -- can disagree — which is the corruption this app exists to prevent.
          perform wa.chk(not ((e->>'sortie') = any(wa.eval_ids())),
                         w || '.sortie',
                         format('%s is one of the eight checkrides — a checkride is recorded in the Evaluations section, where the syllabus order and the pass-attempt rule apply to it. Two rows for one flight would be two grades that can disagree.',
                                upper(e->>'sortie')));

          -- WHICH FLIGHT OF THAT CODE ON THAT DAY. Deliberate, never derived:
          -- an array index is a POSITION and this is a FACT, and there is no
          -- (sortie, date) uniqueness rule here — a second turn on one day is a
          -- real thing, and a rule that refused it would refuse the truth.
          perform wa.chk_int(e->'seq', w || '.seq', 1, 20);

          -- THE KIND — closed list, 'syllabus' by default (see wa.flight_kinds)
          perform wa.chk_text(e->'kind', w || '.kind', false, 20);
          perform wa.chk((e->>'kind') is null or (e->>'kind') = any(wa.flight_kinds()),
                         w || '.kind',
                         format('unknown kind of flight — the list is %s',
                                array_to_string(wa.flight_kinds(), ' / ')));

          -- THE INSTRUCTOR IS ON EVERY ROW — the round-6 solo doctrine applied
          -- to every sortie: «a student never launches alone on their own
          -- authority». On a graded row it is who graded it, on an NG or
          -- ungraded row it is who flew with or authorised it. Required even on
          -- a legacy row: the flag excuses what an OLD form never asked for,
          -- never a rule of this round, or the rule would be optional for
          -- exactly the rows that break it.
          perform wa.chk_text(e->'instructor', w || '.instructor', false, 200);
          perform wa.chk(nullif(trim(coalesce(e->>'instructor', '')), '') is not null,
                         w || '.instructor',
                         'every flown sortie names the instructor — a student never launches alone on their own authority, and an ungraded row still had somebody in the other seat or somebody who authorised it');
          -- the unambiguous identity, written by the CO's form path only for
          -- now. Never drawn as a box, so nothing a student types reaches it.
          perform wa.chk_text(e->'instructor_oid', w || '.instructor_oid', false, 64);

          perform wa.chk_duration(e->'duration', w || '.duration');
          perform wa.chk_bool(e->'ng', w || '.ng');
          is_ng := coalesce(case when jsonb_typeof(e->'ng') = 'boolean'
                                 then (e->>'ng')::boolean else false end, false);
          if is_ng then
            -- the identical rule and the identical sentence as solo_flights
            perform wa.chk(e->'grade' is null or jsonb_typeof(e->'grade') = 'null',
                           w || '.grade', 'a non-graded (NG) flight carries no grade');
          else
            perform wa.chk_grade(e->'grade', w || '.grade', false);
          end if;

          -- THE VERDICT, AND WHERE IT MAY LIVE. Only where the grade is absent.
          perform wa.chk_text(e->'verdict', w || '.verdict', false, 20);
          perform wa.chk((e->>'verdict') is null or (e->>'verdict') = any(wa.verdicts()),
                         w || '.verdict',
                         format('unknown verdict — %s', array_to_string(wa.verdicts(), ' / ')));
          perform wa.chk((e->>'verdict') is null or jsonb_typeof(e->'grade') <> 'number',
                         w || '.verdict',
                         format('this row has a grade, so its verdict is READ from it (%s %% is “%s”) — a stored verdict beside a stored grade is a second source of truth that can contradict the first',
                                trim(trailing '.' from trim(trailing '0' from (e->>'grade'))),
                                wa.grade_verdict((e->>'grade')::numeric)));
          perform wa.chk((e->>'verdict') is null or not is_ng,
                         w || '.verdict',
                         'a non-graded (NG) flight is not scorable at all — it carries neither a grade nor a verdict');
          perform wa.chk_text(e->'note', w || '.note', false, 300);

        elsif k = 'lessons' then
          perform wa.chk_entry_date(e, w);
          -- A LESSON IS A BLOCK. date = start, end_date = end, null = one day.
          perform wa.chk_date(e->'end_date', w || '.end_date', false);
          perform wa.chk((e->>'end_date') is null or (e->>'date') is null
                         or (e->>'end_date') >= (e->>'date'),
                         w || '.end_date', 'a lesson cannot end before it started');
          -- THE GROUP IS THE CLOSED LIST — it is the identity of the row, and
          -- one of the twelve theory groups of the printed programme.
          perform wa.chk_text(e->'group', w || '.group', not wa.is_legacy(e), 40);
          perform wa.chk((e->>'group') is null or (e->>'group') = any(wa.lesson_groups()),
                         w || '.group',
                         'unknown ground group — the list is the twelve theory groups of the syllabus');
          perform wa.chk(wa.is_legacy(e)
                         or nullif(trim(coalesce(e->>'group', '')), '') is not null,
                         w || '.group', 'every ground lesson names the group it belongs to');
          -- THE COURSE, off-catalogue accepted and marked (the sortie rule):
          -- course codes are derived at run time from the printed duration
          -- block, so they are the value most likely to lag reality. What IS
          -- refused is the CONTRADICTION — a course that exists but in ANOTHER
          -- group, which would make the (group, course) join key false.
          perform wa.chk_text(e->'course', w || '.course', false, 60);
          perform wa.chk((e->>'course') is null or (e->>'group') is null
                         or (e->>'course') = any(wa.lesson_courses(e->>'group'))
                         or not exists (select 1 from unnest(wa.lesson_groups()) g
                                        where (e->>'course') = any(wa.lesson_courses(g))),
                         w || '.course',
                         format('“%s” is a course of another group — a course is identified by the PAIR (group, course), never by its code alone (OJT is a course of four different groups)',
                                e->>'course'));
          -- NULL PERIODS MEANS THE FULL COURSE — FDMS's own semantics.
          perform wa.chk_int(e->'periods', w || '.periods', 0, 400);
          perform wa.chk_bool(e->'absent', w || '.absent');
          perform wa.chk_text(e->'instructor', w || '.instructor', false, 200);
          perform wa.chk_text(e->'instructor_oid', w || '.instructor_oid', false, 64);
          perform wa.chk_text(e->'note', w || '.note', false, 300);

        elsif k = 'exams' then
          perform wa.chk_entry_date(e, w);
          perform wa.chk_text(e->'exam', w || '.exam', not wa.is_legacy(e), 40);
          perform wa.chk((e->>'exam') is null or (e->>'exam') = any(wa.exam_ids()),
                         w || '.exam',
                         format('unknown ground exam — the list is %s',
                                array_to_string(wa.exam_ids(), ' / ')));
          perform wa.chk(wa.is_legacy(e)
                         or nullif(trim(coalesce(e->>'exam', '')), '') is not null,
                         w || '.exam', 'every exam row names which of the eight ground exams it was');
          -- NULLABLE, for the same reason a flight's grade is: the result can
          -- take longer to arrive than the exam did to sit.
          perform wa.chk_grade(e->'grade', w || '.grade', false);
          perform wa.chk_text(e->'instructor', w || '.instructor', false, 200);
          perform wa.chk_text(e->'instructor_oid', w || '.instructor_oid', false, 64);
          perform wa.chk_text(e->'note', w || '.note', false, 300);
        end if;

        -- PENDING IS GONE (round 8) — refused by name, before the generic
        -- whitelist message, so the reason is the ruling and not a typo report.
        perform wa.chk(not (e ? 'pending'), w || '.pending',
          'the pending flag was removed — an entry that has not happened yet is simply an unfilled row (a fixed slot with no date reads as not flown), and a result that is still awaited is a grade not written yet');

        -- KEY WHITELIST — last, so the specific messages above win when they
        -- apply. Everything else: named, and refused.
        perform wa.chk_text(e->'entered_by', w || '.entered_by', false, 20);
        for f in select jsonb_object_keys(e) loop
          perform wa.chk(f = any(wa.entry_keys(k)), w || '.' || f,
            format('unknown field for a %s entry — accepted fields are %s',
                   k, array_to_string(wa.entry_keys(k), ', ')));
        end loop;
      end loop;

      -- ONE ROW PER SOLO SLOT. The section is a fixed list; two rows claiming
      -- the same slot would make "the C4801-04 solo" ambiguous and let the
      -- fixed list grow through the back door.
      if k = 'solo_flights' then
        perform wa.chk((select count(*) = count(distinct t.slot) from (
                          select e2->>'slot' as slot
                          from jsonb_array_elements(p->k) e2
                          where jsonb_typeof(e2) = 'object' and (e2->>'slot') is not null) t),
                       k, 'each solo slot may appear only once — the solo rows are fixed');
      end if;

      -- ── EVALUATIONS FOLLOW THE SYLLABUS ORDER (round 6) ─────────────────
      -- The stage is flown in one order and the checkrides sit in it at fixed
      -- points, so a later checkride cannot have been flown while an earlier
      -- one has not: such a record is a typo in the identity picker, and it
      -- silently corrupts every per-checkride comparison the CO makes.
      -- THE ORDER IS THE SYLLABUS ORDER — wa.eval_ids(), generated from the
      -- FILE ORDER of the sortie entries in flowchart2.json (the printed
      -- Training Flow Chart): C4590 → C4790 → C5090 → C5490 → I4490 → I4890
      -- → F4690 → N4690.
      -- What is refused is a FILL out of order. A row that is still the empty
      -- fixed slot is always allowed — that is the default state of all eight
      -- from day one, and it is the state every predecessor starts in.
      if k = 'evaluations' then
        done := array_fill(false, array[array_length(wa.eval_ids(), 1)]);
        for i in 0 .. coalesce(jsonb_array_length(p->k), 0) - 1 loop
          e := p->k->i;
          if jsonb_typeof(e) <> 'object' then continue; end if;
          pos := wa.eval_pos(e->>'evaluation');
          if pos is not null and not wa.slot_empty(k, e) then done[pos] := true; end if;
        end loop;
        for i in 1 .. array_length(wa.eval_ids(), 1) loop
          if not done[i] then continue; end if;
          for i2 in 1 .. i - 1 loop
            if not done[i2] then
              prev_id := (wa.eval_ids())[i2];
              perform wa.chk(false, k || '[' || (wa.eval_ids())[i] || ']',
                format('evaluations follow the syllabus order — %s cannot be recorded while %s has not been flown',
                       (wa.eval_ids())[i], prev_id));
            end if;
          end loop;
        end loop;
      end if;
    end if;
  end loop;
end $$;

-- how many airsickness entries still carry the retired phase-of-flight note
-- (round 6). Like the legacy flag, it may only ever be USED UP: the note is
-- kept so nothing is destroyed behind its owner's back, but the count can
-- never grow — the field is gone from the form, and it cannot come back
-- through a hand-made payload either.
create or replace function wa.phase_count(p jsonb) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_array_elements(
      case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object'
      and nullif(trim(coalesce(e->>'phase', '')), '') is not null), 0)
$$;

-- ── THE RETIRED FPC RESULT (round 11), SAME CONTRACT AS THE PHASE NOTE ─────
-- «Αφαίρεσε το result optional.» The FPC's free-text Result box is gone from
-- the form: an FPC's result IS its grade against the printed scale
-- (wa.grade_passed — 60 % and above is the successful characterisation), and a
-- free-text line beside that number is only ever a place to write a second,
-- softer answer to the same question ("pass" under a 48 %).
-- `result` stays in wa.entry_keys('fpc') as a READ-ONLY CARRIER so nothing
-- already written is destroyed on read, and this counter is what retires the
-- key on WRITE: an existing note may be kept or dropped, never ADDED, and a
-- payload that grows the count is refused by name.
-- CEF IS UNTOUCHED and keeps its Result field — its evaluator is a Squadron
-- Evaluator whose written finding is a different object from a Δοκιμή Προόδου.
-- MIRROR: app/app.js → WA.fpcResultNote / WA.FPC_RESULT_TIP.
create or replace function wa.fpc_result_count(p jsonb) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_array_elements(
      case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object'
      and nullif(trim(coalesce(e->>'result', '')), '') is not null), 0)
$$;

-- the legacy result TEXTS themselves, sorted — round 11 residual (verify item
-- 9): the count guard alone stopped a result being ADDED but not a stored one
-- being quietly REWRITTEN under an equal count. Kept-or-dropped means the
-- surviving texts must be the stored texts.
create or replace function wa.fpc_results(p jsonb) returns text[]
language sql immutable as $$
  select coalesce((
    select array_agg(r order by r) from (
      select trim(e->>'result') as r
      from jsonb_array_elements(
        case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
      where jsonb_typeof(e) = 'object'
        and nullif(trim(coalesce(e->>'result', '')), '') is not null) t), '{}')
$$;

-- how many entries of ONE section still carry the legacy escape hatch
create or replace function wa.legacy_count(p jsonb) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_array_elements(
      case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
    where wa.is_legacy(e)), 0)
$$;

-- ── READ-TIME MIGRATION ────────────────────────────────────────────────────
-- A v1 record (manual NFS counter, free-text FAIL items, identity-less
-- evaluations, pending flags, graded/non-graded solos, progress_tests /
-- aptitude_exams) is rewritten into the v2 shape on EVERY read. Nothing is
-- ever lost: what cannot be completed is carried with legacy = true and the
-- form asks the student for the missing field. The stored row is untouched —
-- a v1 cloud instance keeps working the moment this file is re-run.
create or replace function wa.migrate_record(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  o jsonb := '{}'::jsonb;
  arr jsonb;
  e jsonb;
  i int;
  n int;
  cnt int;
  dts jsonb;
  k text;
  taken text[];
  freeslots text[];
  ord int[];
  idx int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;

  -- WHITESPACE FIRST (round 5b). A record written before the normalisation
  -- boundary existed can hold a padded value — ' C4302 ' — that every regex
  -- below would read as free text. It surfaces CLEAN, so the form shows the
  -- code it always was and every rule applies to it as designed. The stored
  -- row is not rewritten behind the owner's back (nothing here ever is): if
  -- the clean value now contradicts its own category, the record stays
  -- READABLE everywhere and the next save REFUSES until the pair is fixed in
  -- the picker — the same "keep it, ask for it" contract as the legacy rows.
  p := wa.norm_record(p);

  -- NFS — v1 { count, dates[] } → one dated entry per date, plus a placeholder
  -- per counted-but-undated event (the count itself is never re-typed again).
  if jsonb_typeof(p->'nfs') = 'array' then
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->'nfs') - 1 loop
      e := p->'nfs'->i;
      if jsonb_typeof(e) <> 'object' then continue; end if;
      e := wa.nfs_reason_fix(e);
      if not wa.is_iso_date(e->>'date') then e := e || jsonb_build_object('legacy', true); end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object('nfs', arr);
  elsif jsonb_typeof(p->'nfs') = 'object' then
    dts := case when jsonb_typeof(p->'nfs'->'dates') = 'array' then p->'nfs'->'dates' else '[]'::jsonb end;
    cnt := coalesce(case when jsonb_typeof(p->'nfs'->'count') = 'number'
                         then floor((p->'nfs'->>'count')::numeric)::int else 0 end, 0);
    arr := '[]'::jsonb;
    n := 0;
    for i in 0 .. jsonb_array_length(dts) - 1 loop
      if wa.is_iso_date(dts->>i) then
        arr := arr || jsonb_build_array(
          wa.nfs_reason_fix(jsonb_build_object('date', dts->i)));
        n := n + 1;
      end if;
    end loop;
    while n < cnt loop
      arr := arr || jsonb_build_array(jsonb_build_object(
        'date', null, 'legacy', true, 'reason', 'other',
        'note', 'imported from the old NFS counter — the date was never recorded'));
      n := n + 1;
    end loop;
    o := o || jsonb_build_object('nfs', arr);
  end if;

  -- SMS — the pending flag is gone; if it was set, say so in the note.
  if jsonb_typeof(p->'sms') = 'array' then
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->'sms') - 1 loop
      e := p->'sms'->i;
      if jsonb_typeof(e) <> 'object' then continue; end if;
      if coalesce(case when jsonb_typeof(e->'pending') = 'boolean'
                       then (e->>'pending')::boolean else false end, false)
         and (e->'note') is null then
        e := e || jsonb_build_object('note', 'was flagged as awaiting a result in the previous form');
      end if;
      e := e - 'pending';
      -- ROUND 8 — the entrance names its ΚΕΠΕ condition (3-01 ΚΕΦ.2 §32β). A
      -- row written before that rule has none: it is READ with its note
      -- intact, flagged, and the form asks which of the seven it was.
      e := wa.sms_reason_fix(e);
      if not wa.is_iso_date(e->>'entrance_date') then e := e || jsonb_build_object('legacy', true); end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object('sms', arr);
  end if;

  -- FAIL / ALMOST GOOD — v1 free-text item → items[] under category 'other'
  foreach k in array array['fail','almost_good'] loop
    if jsonb_typeof(p->k) = 'array' then
      arr := '[]'::jsonb;
      for i in 0 .. jsonb_array_length(p->k) - 1 loop
        e := p->k->i;
        if jsonb_typeof(e) <> 'object' then continue; end if;
        if coalesce(jsonb_typeof(e->'items'), '-') <> 'array' then
          if coalesce(nullif(trim(coalesce(e->>'item', e->>'custom', '')), ''), '') <> '' then
            e := e || jsonb_build_object('items',
                   jsonb_build_array(trim(coalesce(nullif(e->>'item',''), e->>'custom'))));
          else
            e := e || jsonb_build_object('items', '[]'::jsonb);
          end if;
          e := (e - 'item') - 'custom';
          if (e->>'category') is null then e := e || jsonb_build_object('category', 'other'); end if;
          e := e || jsonb_build_object('legacy', true);
        end if;
        -- ROUND 6 — SYLLABUS ONLY. A row still naming an item the printed
        -- gradesheet of its track does not carry (the custom "Other…" item of
        -- rounds 2-5, or any item under the placeholder category 'other') is
        -- READ with its strings intact, and flagged: the form marks the chips,
        -- names them, and refuses to save the row until they are replaced.
        if not wa.is_iso_date(e->>'date') or (e->>'category') is null
           or jsonb_array_length(coalesce(e->'items', '[]'::jsonb)) = 0
           or exists (select 1
                      from jsonb_array_elements_text(
                             case when jsonb_typeof(e->'items') = 'array'
                                  then e->'items' else '[]'::jsonb end) it
                      where not (it = any(wa.item_names(e->>'category')))) then
          e := e || jsonb_build_object('legacy', true);
        end if;
        arr := arr || jsonb_build_array(e);
      end loop;
      o := o || jsonb_build_object(k, arr);
    end if;
  end loop;

  -- AIRSICKNESS — ROUND 6: the event names the FLIGHT it happened on, and the
  -- free-text "phase of flight / note" is no longer collected. A stored note
  -- is NOT thrown away: it is read, shown greyed as legacy information, and
  -- the row is flagged so the form asks for the flight — the same "keep it,
  -- ask for it" contract every other legacy row has.
  -- ROUND 6b — THE FLIGHT IS MANDATORY, so EVERY flight-less row is flagged,
  -- not only the ones that carry the retired note: a pre-round-6 entry that
  -- simply never had a flight is exactly as incomplete as one that has a note
  -- instead of it. Both stay readable, both are asked for, both are refused on
  -- the next save (wa.validate_record). MIRROR: app/app.js → WA.migrateRecord.
  if jsonb_typeof(p->'airsickness') = 'array' then
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->'airsickness') - 1 loop
      e := p->'airsickness'->i;
      if jsonb_typeof(e) <> 'object' then continue; end if;
      if not wa.is_iso_date(e->>'date')
         or nullif(trim(coalesce(e->>'flight_code', '')), '') is null then
        e := e || jsonb_build_object('legacy', true);
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object('airsickness', arr);
  end if;

  -- EVALUATIONS — v1 rows carry no identity; they stay, flagged, until the
  -- student says which of the eight checkrides they were.
  if jsonb_typeof(p->'evaluations') = 'array' then
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->'evaluations') - 1 loop
      e := p->'evaluations'->i;
      if jsonb_typeof(e) <> 'object' then continue; end if;
      if (e->>'evaluation') is null or not ((e->>'evaluation') = any(wa.eval_ids())) then
        e := e - 'evaluation' || jsonb_build_object('evaluation', null, 'legacy', true);
      end if;
      -- an identified checkride with nothing in it is a FIXED SLOT nobody has
      -- flown yet (round 5) — not an imported entry missing its date
      if not wa.is_iso_date(e->>'date') and not wa.slot_empty('evaluations', e) then
        e := e || jsonb_build_object('legacy', true);
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object('evaluations', arr);
  end if;

  -- SOLO FLIGHTS — v1 graded:boolean → ng (non-graded) with a % grade
  if jsonb_typeof(p->'solo_flights') = 'array' then
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->'solo_flights') - 1 loop
      e := p->'solo_flights'->i;
      if jsonb_typeof(e) <> 'object' then continue; end if;
      if coalesce(jsonb_typeof(e->'ng'), '-') <> 'boolean' then
        e := e || jsonb_build_object('ng',
               not coalesce(case when jsonb_typeof(e->'graded') = 'boolean'
                                 then (e->>'graded')::boolean else false end, false));
      end if;
      e := e - 'graded';
      if (e->>'ng')::boolean then e := e || jsonb_build_object('grade', null); end if;
      -- ROUND 6 — the INSTRUCTOR is on every flown solo row, NG included: the
      -- authorising instructor may not fly along, but he authorises. A row
      -- recorded before that rule (an NG solo with nobody's name on it) is
      -- read, stays readable, and is flagged so the form asks who authorised it.
      if not wa.slot_empty('solo_flights', e)
         and (not wa.is_iso_date(e->>'date')
              or nullif(trim(coalesce(e->>'instructor', '')), '') is null
              or (not (e->>'ng')::boolean and coalesce(jsonb_typeof(e->'grade'), '-') <> 'number')) then
        e := e || jsonb_build_object('legacy', true);
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;

    -- ROUND 5 — SOLOS BECOME THE SYLLABUS SLOTS. A solo recorded before this
    -- rule names no slot, so it is placed by the only ordering the syllabus
    -- gives: the solo slots come in stage order (1st SOLO → C48XX → C49XX →
    -- C52XX → C53XX → F43XX ×2 → F45XX), so the earliest recorded solo takes
    -- the earliest free slot. Deterministic (same record → same placement),
    -- and the student can move any of them with the slot's sortie picker.
    -- A solo beyond the eight, or one with no date to order it by, stays
    -- slot-less: the "additional solo" path, which is exactly what it is.
    taken := coalesce(array(select e2->>'slot' from jsonb_array_elements(arr) e2
                            where (e2->>'slot') is not null), array[]::text[]);
    freeslots := array(select s from unnest(wa.solo_slots()) s where not (s = any(taken)));
    ord := coalesce(array(
      select (t.ord - 1)::int
      from jsonb_array_elements(arr) with ordinality t(e2, ord)
      where (t.e2->>'slot') is null and wa.is_iso_date(t.e2->>'date')
      order by (t.e2->>'date'), t.ord), array[]::int[]);
    n := 0;
    foreach idx in array ord loop
      exit when n >= coalesce(array_length(freeslots, 1), 0);
      n := n + 1;
      arr := jsonb_set(arr, array[idx::text],
                       (arr->idx) || jsonb_build_object('slot', freeslots[n]));
    end loop;
    o := o || jsonb_build_object('solo_flights', arr);
  end if;

  -- PROGRESS TESTS → FPC · APTITUDE EXAMS → CEF (round-3 + round-4 renames).
  -- The progress check is an FPC — Δοκιμή Προόδου. The two superseded storage
  -- keys ('progress_tests' from v1, and the transposed spelling shipped in
  -- round 3) are read as SOURCE keys for ever, so no stored record is
  -- stranded; nothing is ever written under them again.
  foreach k in array array['fpc','cef'] loop
    if jsonb_typeof(p->k) = 'array' then
      arr := p->k;
    else
      arr := null;
      if k = 'fpc' then
        if    jsonb_typeof(p->'fcp') = 'array'            then arr := p->'fcp';
        elsif jsonb_typeof(p->'progress_tests') = 'array' then arr := p->'progress_tests';
        end if;
      elsif jsonb_typeof(p->'aptitude_exams') = 'array'   then arr := p->'aptitude_exams';
      end if;
      if arr is null then continue; end if;
    end if;
    e := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(arr) - 1 loop
      if jsonb_typeof(arr->i) <> 'object' then continue; end if;
      dts := arr->i;
      -- round 5: "by" → "evaluator" (DO / Squadron CO / an instructor). The
      -- superseded key is read for ever; nothing is written under it again.
      if (dts ? 'by') then
        dts := (dts - 'by') || case when (dts->>'evaluator') is null
                                    then jsonb_build_object('evaluator', dts->'by')
                                    else '{}'::jsonb end;
      end if;
      -- ROUND 6 — an FPC is conducted by the Squadron CO or the DO. A stored
      -- FPC naming anybody else (an instructor surname, a free-text
      -- appointment) is READ and shown, flagged so the form asks which of the
      -- two it actually was. CEF is untouched — its evaluator list stays open.
      e := e || jsonb_build_array(
        case when wa.is_iso_date(dts->>'date')
                  and (k <> 'fpc' or (dts->>'evaluator') is null
                       or (dts->>'evaluator') = any(wa.fpc_evaluators()))
             then dts
             else dts || jsonb_build_object('legacy', true) end);
    end loop;
    o := o || jsonb_build_object(k, e);
  end loop;

  -- ══ ROUND 12 — THE LOG TABLES: THE PASS-THROUGH, WHICH IS THE POINT ══════
  -- THIS BLOCK IS NOT OPTIONAL AND IT IS NOT COSMETIC. Everything above builds
  -- `o` key by key and the final pass below iterates over `o` — so a section
  -- this function does not NAME never enters `o` and is DELETED from every
  -- read, silently, for ever. (And even reaching the final pass, an entry of a
  -- section wa.entry_keys does not name would be stripped to {} row by row.)
  -- A student's whole flight log would evaporate on the first read after the
  -- schema shipped. Hence: named here, named there, and the four sections
  -- travel through with their own repairs.
  --
  -- THE REPAIRS, all on the wa.nfs_reason_fix model — a value the CATALOGUE NO
  -- LONGER KNOWS is nulled and the row is flagged, so the record stays READABLE
  -- everywhere and the form asks for the missing choice on the next save. That
  -- is what stops a future syllabus revision (a renamed theory group, a
  -- withdrawn ground exam) from making stored records permanently unsaveable:
  -- the alternative is a record whose owner is refused every time they press
  -- Save with no box on the form able to fix it.
  foreach k in array array['flights','fs'] loop
    if jsonb_typeof(p->k) = 'array' then
      arr := '[]'::jsonb;
      for i in 0 .. jsonb_array_length(p->k) - 1 loop
        e := p->k->i;
        if jsonb_typeof(e) <> 'object' then continue; end if;
        -- the two authored defaults, so a row written by an older client (or by
        -- a bridge that does not know them yet) reads as what it always was:
        -- one flight of that sortie, flown in its syllabus place.
        -- coalesce(jsonb_typeof(…), '-'), NOT a bare <>: an ABSENT key makes
        -- jsonb_typeof return SQL NULL, `NULL <> 'number'` is NULL, and the
        -- branch is silently skipped — which is precisely the row that needs
        -- the default. (The house idiom, already used by the solo migration.)
        if coalesce(jsonb_typeof(e->'seq'), '-') <> 'number' then
          e := (e - 'seq') || jsonb_build_object('seq', 1);
        end if;
        if coalesce(e->>'kind', '') = '' or not ((e->>'kind') = any(wa.flight_kinds())) then
          e := (e - 'kind') || jsonb_build_object('kind', 'syllabus');
        end if;
        if coalesce(jsonb_typeof(e->'ng'), '-') <> 'boolean' then
          e := (e - 'ng') || jsonb_build_object('ng', false);
        end if;
        -- NG removes the GRADE and nothing else (the solo_flights rule)
        if (e->>'ng')::boolean then e := e || jsonb_build_object('grade', null); end if;
        -- THE TRACK, RESOLVED WHERE IT CAN BE. A row whose sortie is a syllabus
        -- code carries its track in the code's own letter, so filling it in
        -- from there destroys nothing and invents nothing (wa.code_track is
        -- what the validator judges the pair by). Anything else is flagged and
        -- the form asks which table the row belongs to.
        if coalesce(e->>'track', '') = '' and wa.code_track(e->>'sortie') is not null then
          e := (e - 'track') || jsonb_build_object('track', wa.code_track(e->>'sortie'));
        end if;
        -- A VERDICT BESIDE A GRADE IS DROPPED, not flagged — and this is the
        -- ONE place round 12 removes a stored value. It is lossless: where a
        -- grade exists the verdict is DERIVED from it (wa.grade_verdict), so
        -- what is dropped is a copy, not a fact. Flagging it instead would
        -- leave a row nobody could ever save, because the form draws no verdict
        -- box on a graded row — a trap, not a question.
        if jsonb_typeof(e->'grade') = 'number' and (e->>'verdict') is not null then
          e := (e - 'verdict') || jsonb_build_object('verdict', null);
        end if;
        if (e->>'ng')::boolean and (e->>'verdict') is not null then
          e := (e - 'verdict') || jsonb_build_object('verdict', null);
        end if;
        if (e->>'verdict') is not null and not ((e->>'verdict') = any(wa.verdicts())) then
          e := (e - 'verdict') || jsonb_build_object('verdict', null, 'legacy', true);
        end if;
        -- what the row must carry to be a flight at all
        if not wa.is_iso_date(e->>'date')
           or nullif(trim(coalesce(e->>'sortie', '')), '') is null
           or nullif(trim(coalesce(e->>'instructor', '')), '') is null
           or coalesce(e->>'track', '') = '' then
          e := e || jsonb_build_object('legacy', true);
        end if;
        arr := arr || jsonb_build_array(e);
      end loop;
      o := o || jsonb_build_object(k, arr);
    end if;
  end loop;

  if jsonb_typeof(p->'lessons') = 'array' then
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->'lessons') - 1 loop
      e := p->'lessons'->i;
      if jsonb_typeof(e) <> 'object' then continue; end if;
      -- THE CATALOGUE-NARROWING REPAIR. A group the twelve no longer contain
      -- (a renamed theory group after a syllabus revision) is nulled and the
      -- row flagged — never dropped, never guessed at.
      if (e->>'group') is not null and not ((e->>'group') = any(wa.lesson_groups())) then
        e := (e - 'group') || jsonb_build_object('group', null, 'legacy', true);
      end if;
      if coalesce(jsonb_typeof(e->'absent'), '-') <> 'boolean' then
        e := (e - 'absent') || jsonb_build_object('absent', false);
      end if;
      if not wa.is_iso_date(e->>'date') or coalesce(e->>'group', '') = '' then
        e := e || jsonb_build_object('legacy', true);
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object('lessons', arr);
  end if;

  if jsonb_typeof(p->'exams') = 'array' then
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->'exams') - 1 loop
      e := p->'exams'->i;
      if jsonb_typeof(e) <> 'object' then continue; end if;
      -- the same narrowing repair, one catalogue over
      if (e->>'exam') is not null and not ((e->>'exam') = any(wa.exam_ids())) then
        e := (e - 'exam') || jsonb_build_object('exam', null, 'legacy', true);
      end if;
      if not wa.is_iso_date(e->>'date') or coalesce(e->>'exam', '') = '' then
        e := e || jsonb_build_object('legacy', true);
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object('exams', arr);
  end if;

  -- FINAL PASS — per-section key whitelist (round-4 W3a): a key the form
  -- cannot show and the validator no longer accepts is dropped on READ, so a
  -- record that was written before this rule stops carrying it (a smuggled
  -- {"pending":true} anywhere disappears the moment the record is read).
  arr := '{}'::jsonb;
  for k in select jsonb_object_keys(o) loop
    e := '[]'::jsonb;
    for i in 0 .. coalesce(jsonb_array_length(o->k), 0) - 1 loop
      e := e || jsonb_build_array(wa.strip_entry(o->k->i, k));
    end loop;
    arr := arr || jsonb_build_object(k, e);
  end loop;
  return arr;
end $$;

-- person as public jsonb (never leaks the token).
-- ROUND 9: the roster fields travel with the person — external_oid so the CO
-- can see WHICH row the shared roster owns, call_sign / country / test_pilot
-- because they are how the squadron actually names and sorts its instructors.
create or replace function wa.person_json(p public.people) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'role', p.role, 'mn', p.mn, 'rank', p.rank,
    'first_name', p.first_name, 'last_name', p.last_name, 'class', p.class,
    'duty', p.duty, 'leadership', p.leadership, 'status', p.status,
    'external_oid', p.external_oid, 'call_sign', p.call_sign,
    'country', p.country, 'test_pilot', p.test_pilot,
    'active', p.active)
$$;

-- how many entries of a record carry a given PROVENANCE stamp (round 12).
-- 'admin' is the CO's; the generalisation is here because the bridge's 'fdms'
-- stamp is the next value this has to be able to count WITHOUT being counted as
-- the CO's — a row a machine proposed is not a row the Squadron CO wrote, and
-- conflating them would be a truth defect in the exact feature that exists to
-- be honest about provenance.
-- (An unflown fixed slot is a placeholder, not an entry — round 5.)
create or replace function wa.entry_count_by(p jsonb, p_source text) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_each(coalesce(p, '{}'::jsonb)) s(key, val)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(val) = 'array' then val else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object' and (e->>'entered_by') = p_source
      and not wa.slot_empty(s.key, e)), 0)
$$;

-- how many entries of a record were entered BY THE CO on the owner's behalf.
-- Kept as its own name because a dozen callers say it, and because "the CO's"
-- is the question every surface actually asks.
create or replace function wa.co_entry_count(p jsonb) returns int
language sql immutable as $$
  select wa.entry_count_by(p, 'admin')
$$;

-- how many entries the record carries in total — the DENOMINATOR behind
-- "17 self-reported + 1 entered by the CO". Without it the dashboard cannot
-- tell a record the CO wrote from a record the CO merely added one line to
-- (round-4b: the two used to look identical, and both read as "CO record").
-- ROUND 5: a fixed slot nobody has flown yet counts for nothing here either —
-- otherwise every record would arrive carrying 16 "entries" it does not have,
-- and "1 of 18 entered by the CO" would stop being true.
create or replace function wa.entry_count(p jsonb) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_each(coalesce(p, '{}'::jsonb)) s(key, val)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(val) = 'array' then val else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object' and not wa.slot_empty(s.key, e)), 0)
$$;

-- ── the RECORD-level stamp is DERIVED, never authored (round 4b) ───────────
-- 'admin' means "this record CONTAINS data the CO entered" — that is all it
-- has ever been able to mean since the stamp went per-entry. It is true when
-- at least one entry carries the stamp, and (the one case with no entries to
-- carry it) when the CO created the record and its owner has never saved it.
-- Every view must then say WHICH of the two it is by comparing
-- wa.co_entry_count against wa.entry_count: all entries → "entered by the CO",
-- some → "self-reported, N entries added by the CO". Reading this flag alone
-- as "the CO filled the whole thing in" is the round-4 defect.
-- p_rec is the MIGRATED record; p_stored is the column as it stands.
create or replace function wa.record_stamp(p_rec jsonb, p_stored text) returns text
language sql immutable as $$
  select case
    when wa.co_entry_count(p_rec) > 0 then 'admin'
    when wa.entry_count(p_rec) = 0 and p_stored = 'admin' then 'admin'
    else null end
$$;

-- ── ENTER-ON-BEHALF: the entry stamp ──────────────────────────────────────
-- ROUND 4b — the stamp is decided PER ENTRY, by DIFF.
-- The round-4 version stamped every entry of the submitted payload, so a CO
-- who added ONE line to a student's 17 self-reported entries re-attributed all
-- 18 to himself. The record then lied about its own provenance, in the exact
-- place the feature exists to be honest about. Superseded:
drop function if exists wa.stamp_record(jsonb, text);

-- ── THE CO'S EDITS PREVAIL — THE SUPREMACY INVERSION (round 8) ────────────
-- Rounds 4b-7 gave the owner the last word: saving your own form cleared every
-- CO stamp on it, because "reclaiming your own data makes it self-reported
-- again". The squadron reads it the other way round. When the Squadron CO
-- writes a line into a student's record he is not making a suggestion, and a
-- record in which the student can quietly overwrite the CO's correction is a
-- record the CO cannot brief from.
-- SO: an entry the CO created or modified (entered_by = 'admin') is LOCKED for
-- its owner. The owner's save must carry every one of them through UNCHANGED —
-- it is refused otherwise — and it NO LONGER STRIPS THE STAMPS. The CO keeps
-- the full range of motion: he may edit or delete his own entries, and editing
-- an owner's entry makes it his (the diff below stamps it), which locks it.
-- The reclaim rule is superseded, and its function is dropped so no path can
-- call it back:
drop function if exists wa.strip_stamps(jsonb);

-- ONE entry reduced to its FACTS — the identity the diff compares.
-- The stamp itself is excluded (it is the thing being decided), and a
-- null-valued key is dropped so {"note": null} and {} are the same entry:
-- the validator, the migration and the form all treat an absent field and a
-- null field identically, and different writers of the same record spell
-- "empty" both ways. Anything else — a changed date, one more item, a grade
-- typed over — makes a DIFFERENT entry, which is the point.
create or replace function wa.entry_core(e jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(e) <> 'object' then coalesce(e, 'null'::jsonb) else
    coalesce((select jsonb_object_agg(t.k, t.v) from jsonb_each(e) t(k, v)
              where t.k <> 'entered_by' and jsonb_typeof(t.v) <> 'null'), '{}'::jsonb) end
$$;

-- the CO path: the submitted payload against the STORED record, section by
-- section. An entry that is already in the record keeps the provenance it
-- already had (null stays null — the CO re-sending a student's line does not
-- make it his); an entry that is NEW or MODIFIED is the CO's and says so.
-- Entries that disappeared need nothing: a deletion leaves no row to attribute.
-- p_old is the stored record AFTER wa.migrate_record — the same shape the
-- form was handed, so an untouched row round-trips to an exact match.
create or replace function wa.stamp_record_diff(p_new jsonb, p_old jsonb) returns jsonb
language plpgsql immutable as $$
declare
  o jsonb := '{}'::jsonb;
  k text; nw jsonb; od jsonb; arr jsonb; e jsonb; core jsonb;
  i int; j int; n_old int; hit int; used boolean[];
begin
  if p_new is null or jsonb_typeof(p_new) <> 'object' then return coalesce(p_new, '{}'::jsonb); end if;
  for k in select jsonb_object_keys(p_new) loop
    nw := p_new->k;
    if jsonb_typeof(nw) <> 'array' then
      o := o || jsonb_build_object(k, nw);
      continue;
    end if;
    od := case when jsonb_typeof(coalesce(p_old, '{}'::jsonb)->k) = 'array'
               then p_old->k else '[]'::jsonb end;
    n_old := jsonb_array_length(od);
    -- each stored entry may be claimed by ONE submitted entry: a section that
    -- holds several identical rows (three undated NFS imports, say) must not
    -- have one of them answer for all three when two were deleted.
    used := array_fill(false, array[greatest(n_old, 1)]);
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(nw) - 1 loop
      e := nw->i;
      if jsonb_typeof(e) <> 'object' then
        arr := arr || jsonb_build_array(e);
        continue;
      end if;
      core := wa.entry_core(e);
      hit := -1;
      -- same position first — the form round-trips its rows in order, so an
      -- untouched row matches the row it was drawn from, not a twin of it.
      if i < n_old and not used[i + 1] and wa.entry_core(od->i) = core then
        hit := i;
      else
        for j in 0 .. n_old - 1 loop
          if not used[j + 1] and wa.entry_core(od->j) = core then hit := j; exit; end if;
        end loop;
      end if;
      if hit >= 0 then
        used[hit + 1] := true;
        e := case when (od->hit->>'entered_by') is null then e - 'entered_by'
                  else e || jsonb_build_object('entered_by', od->hit->'entered_by') end;
      elsif wa.slot_empty(k, e) then
        -- an unflown fixed slot is a placeholder the FORM draws, not something
        -- the CO "entered". Stamping it would tag the eight checkrides and the
        -- eight solos of every record the CO ever opens (round 5).
        e := e - 'entered_by';
      else
        e := e || jsonb_build_object('entered_by', 'admin');
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object(k, arr);
  end loop;
  return o;
end $$;

-- the OWNER path (round 8): the submitted payload against the STORED record.
-- Every entry the CO owns must still be there, fact for fact — matched by
-- wa.entry_core exactly as the CO path matches, position first — and it comes
-- out of this function still carrying his name. An entry of the owner's own
-- keeps null whether it changed or not: their record is still theirs to write.
-- A CO entry that was ALTERED has no match, and a CO entry that was DELETED
-- has no match either; both leave a stored stamp unclaimed, and that is the
-- refusal — one sentence, naming the rule, for both.
create or replace function wa.carry_stamps(p_new jsonb, p_old jsonb) returns jsonb
language plpgsql immutable as $$
declare
  o jsonb := '{}'::jsonb;
  k text; nw jsonb; od jsonb; arr jsonb; e jsonb; core jsonb;
  i int; j int; n_old int; hit int; used boolean[];
begin
  if p_new is null or jsonb_typeof(p_new) <> 'object' then return coalesce(p_new, '{}'::jsonb); end if;
  for k in select jsonb_object_keys(p_new) loop
    nw := p_new->k;
    if jsonb_typeof(nw) <> 'array' then
      o := o || jsonb_build_object(k, nw);
      continue;
    end if;
    od := case when jsonb_typeof(coalesce(p_old, '{}'::jsonb)->k) = 'array'
               then p_old->k else '[]'::jsonb end;
    n_old := jsonb_array_length(od);
    used := array_fill(false, array[greatest(n_old, 1)]);
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(nw) - 1 loop
      e := nw->i;
      if jsonb_typeof(e) <> 'object' then
        arr := arr || jsonb_build_array(e);
        continue;
      end if;
      core := wa.entry_core(e);
      hit := -1;
      if i < n_old and not used[i + 1] and wa.entry_core(od->i) = core then
        hit := i;
      else
        for j in 0 .. n_old - 1 loop
          if not used[j + 1] and wa.entry_core(od->j) = core then hit := j; exit; end if;
        end loop;
      end if;
      if hit >= 0 then
        used[hit + 1] := true;
        -- the stored provenance rides through untouched: 'admin' stays
        -- 'admin' (the lock), null stays null (the owner's own line)
        e := case when (od->hit->>'entered_by') is null then e - 'entered_by'
                  else e || jsonb_build_object('entered_by', od->hit->'entered_by') end;
      else
        -- a row the owner wrote or changed — theirs, never the CO's
        e := e - 'entered_by';
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    -- EVERY CO ENTRY MUST HAVE BEEN CLAIMED. One that was not is one the owner
    -- altered or dropped, and only the CO may do either.
    for j in 0 .. n_old - 1 loop
      if not used[j + 1] and (od->j->>'entered_by') = 'admin'
         and not wa.slot_empty(k, od->j) then
        perform wa.chk(false, format('%s[%s]', k, j),
          'this entry was set by the squadron CO and only the CO can change it — it is shown on your form locked, and your save must leave it exactly as it stands');
      end if;
    end loop;
    o := o || jsonb_build_object(k, arr);
  end loop;
  -- a whole SECTION the payload omitted takes its stored CO entries with it,
  -- so the same rule has to look at what is not in the payload at all
  for k in select jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) loop
    if (p_new ? k) or jsonb_typeof(p_old->k) <> 'array' then continue; end if;
    for j in 0 .. jsonb_array_length(p_old->k) - 1 loop
      if (p_old->k->j->>'entered_by') = 'admin'
         and not wa.slot_empty(k, p_old->k->j) then
        perform wa.chk(false, format('%s[%s]', k, j),
          'this entry was set by the squadron CO and only the CO can change it — it is shown on your form locked, and your save must leave it exactly as it stands');
      end if;
    end loop;
  end loop;
  return o;
end $$;

-- ── the ONE student-record write path ─────────────────────────────────────
-- Used by BOTH public.save_student_record (the owner) and
-- public.admin_save_student_record (the CO on their behalf) — same validation,
-- same legacy rule, same upsert. A CO typo is still a typo.
create or replace function wa.write_record(p_student uuid, p_payload jsonb, p_as_admin boolean)
returns jsonb
language plpgsql volatile as $$
declare
  t timestamptz;
  pl jsonb;
  old jsonb;
  prev text;
  had boolean;
  k text;
  stamped jsonb;
  by_who text;
begin
  -- THE NORMALISATION BOUNDARY (round 5b) — FIRST, before anything looks at a
  -- value. What is validated below is exactly what is stored further down, so
  -- a padded ' C4302 ' cannot be a syllabus code to the storage and free text
  -- to wa.code_track: the category⇄track refusal fires on it exactly as it
  -- fires on a clean C4302, on the owner path and the CO path alike.
  pl := wa.norm_record(p_payload);
  perform wa.validate_record(pl);

  select wa.migrate_record(sr.data), sr.entered_by, true into old, prev, had
  from public.student_records sr where sr.student_id = p_student;
  old := coalesce(old, '{}'::jsonb);
  had := coalesce(had, false);

  -- the `legacy` escape hatch (a dateless row inherited from the v1 form) may
  -- only be USED UP, never created: a section can never come back with more
  -- legacy rows than the stored record already had. Without this, the flag
  -- would be a way to store undated entries for ever.
  for k in select jsonb_object_keys(pl) loop
    perform wa.chk(wa.legacy_count(pl->k) <= wa.legacy_count(old->k),
                   k, 'entries imported from the previous form cannot be added, only completed');
  end loop;

  -- THE RETIRED AIRSICKNESS NOTE, same contract (round 6): a stored
  -- phase-of-flight note may be kept or dropped, never ADDED. The form has no
  -- box for it any more, so a payload that grows the count is a hand-made one.
  perform wa.chk(wa.phase_count(pl->'airsickness') <= wa.phase_count(old->'airsickness'),
                 'airsickness',
                 'the phase-of-flight note was replaced by the flight code — an existing note is kept as legacy information, but a new one cannot be added');

  -- THE RETIRED FPC RESULT, same contract (round 11): the free-text Result box
  -- is gone from the form, so a payload that grows the count is a hand-made
  -- one. An FPC's result is its GRADE against the printed scale.
  perform wa.chk(wa.fpc_result_count(pl->'fpc') <= wa.fpc_result_count(old->'fpc'),
                 'fpc',
                 'the free-text result was removed — an FPC''s result is its grade against the printed scale (60 % and above is the successful characterisation, PD 151/13). A result already written is kept as a legacy note, but a new one cannot be added');
  -- ... and the surviving texts must be the STORED texts (kept or dropped,
  -- never rewritten) — round 11 residual, verify item 9: a sub-multiset check,
  -- so equal counts can no longer smuggle a replacement string through.
  perform wa.chk(
    (select coalesce(bool_and(
       (select count(*) from unnest(wa.fpc_results(old->'fpc')) o where o = n.r) >=
       n.c), true)
     from (select r, count(*) as c
           from unnest(wa.fpc_results(pl->'fpc')) r group by r) n),
    'fpc',
    'a legacy result note may be kept or dropped, never rewritten — the removed Result box cannot be edited through a hand-made payload');

  -- THE STAMP — decided per entry, against what is STORED, on BOTH paths.
  -- CO path (round 4b, unchanged): only what he actually wrote carries his
  -- name, and editing an owner's entry makes that entry his.
  -- OWNER path (round 8): the stamps SURVIVE. Every CO entry must come back
  -- fact for fact — wa.carry_stamps refuses the save otherwise, naming the
  -- rule — and it comes back still stamped. The owner's own entries stay the
  -- owner's whether they changed or not.
  -- Applied server-side on EVERY write, so a stamp can neither be forged by a
  -- hand-made payload nor thrown away by one.
  stamped := case when p_as_admin then wa.stamp_record_diff(pl, old)
                  else wa.carry_stamps(pl, old) end;
  -- DERIVED, never typed — on both paths now, because a record whose entries
  -- carry the CO's name keeps saying so after its owner saves it. The one case
  -- the entries cannot settle (a record the CO opened and nobody has filled)
  -- still belongs to the CO path: an empty record locks nothing.
  by_who := wa.record_stamp(stamped,
              case when p_as_admin then (case when had then prev else 'admin' end)
                   else null end);

  insert into public.student_records as sr (student_id, data, last_update, entered_by)
  values (p_student, stamped, now(), by_who)
  on conflict (student_id)
  do update set data = excluded.data, last_update = now(), entered_by = excluded.entered_by
  returning last_update into t;
  -- `record` is the stamped payload as stored: the client applies the server's
  -- verdict instead of guessing which of its rows the CO touched.
  return jsonb_build_object('ok', true, 'last_update', t, 'entered_by', by_who,
                            'co_entries', wa.co_entry_count(stamped),
                            'entries', wa.entry_count(stamped),
                            'record', stamped);
end $$;

-- ── the ONE proposal write path ───────────────────────────────────────────
-- Used by BOTH public.save_proposal (the instructor) and
-- public.admin_save_proposal (the CO on their behalf).
create or replace function wa.write_proposal(p_instructor uuid, p_student uuid,
                                             p_payload jsonb, p_as_admin boolean)
returns jsonb
language plpgsql volatile as $$
declare
  s public.people;
  k text;
  lv text;
  fw boolean; cm text;
  saved public.proposals;
  by_who text := case when p_as_admin then 'admin' else null end;
begin
  select * into s from public.people
   where id = p_student and role = 'student' and active;
  if not found then
    raise exception 'WA: unknown student';
  end if;
  perform wa.chk(p_payload is not null and jsonb_typeof(p_payload) = 'object',
                 'proposal', 'payload must be an object');

  -- ── THE RETIRED BRANCH RANKING (round 10) — REFUSED ON WRITE, BY NAME ────
  -- The standing "keep it, ask for it" contract, applied to a whole shape
  -- rather than one field: what is already stored in rank_* / nr_* stays
  -- READABLE in the table for ever (it is the audit trail of the migration),
  -- but nothing may write it again. A payload that still carries the old
  -- shape is not half-right, it is a client that has not been reloaded — so
  -- it is refused before anything is stored, and the refusal names the field
  -- that replaced it instead of complaining about an unknown key.
  foreach k in array array['ranks', 'not_recommended',
                           'rank_fighters', 'rank_helicopters', 'rank_transport_ff',
                           'nr_fighters', 'nr_helicopters', 'nr_transport_ff'] loop
    perform wa.chk(not (p_payload ? k), k,
      format('the branch ranking was retired in round 10 — there is no aircraft-type ranking any more. Send ONE assessment about Fighters as "level", one of: %s',
             array_to_string(wa.level_keys(), ' / ')));
  end loop;

  -- ── THE ASSESSMENT — ONE CLOSED LIST OF FIVE (round 10) ─────────────────
  -- Absent or null is a legitimate answer and means "no view formed yet": an
  -- instructor may record that he has flown with a student, or leave a
  -- comment, before he is ready to place him. Nothing is assumed for him.
  -- Anything OUTSIDE the five is refused with the five named — an invented
  -- level must never become a weight nobody can explain.
  if p_payload ? 'level' and jsonb_typeof(p_payload->'level') <> 'null' then
    perform wa.chk(jsonb_typeof(p_payload->'level') = 'string', 'level', 'must be text');
    lv := wa.norm_line(p_payload->>'level');
    perform wa.chk(lv = any(wa.level_keys()), 'level',
      format('unknown assessment level "%s" — the scale is exactly: %s',
             p_payload->>'level', array_to_string(wa.level_keys(), ' / ')));
  end if;

  perform wa.chk_bool(p_payload->'flew_with', 'flew_with');
  fw := coalesce((p_payload->>'flew_with')::boolean, false);
  perform wa.chk_text(p_payload->'comment', 'comment', false, 500);
  -- free text: the ends are cut (round 5b); the paragraphing the instructor
  -- typed is his own and is kept
  cm := nullif(wa.norm_free(coalesce(p_payload->>'comment', '')), '');

  -- the frozen rank_* / nr_* columns are absent from BOTH lists below: a new
  -- row leaves them at their defaults and an existing row keeps whatever the
  -- migration read out of it, untouched, for ever.
  insert into public.proposals as pr
         (instructor_id, student_id, level, flew_with, comment, entered_by)
  values (p_instructor, p_student, lv, fw, cm, by_who)
  on conflict (instructor_id, student_id)
  do update set level = excluded.level,
                flew_with = excluded.flew_with,
                comment = excluded.comment,
                entered_by = excluded.entered_by
  returning * into saved;
  return jsonb_build_object('ok', true, 'updated_at', saved.updated_at,
                            'entered_by', by_who, 'level', saved.level,
                            'weight', wa.level_weight(saved.level));
end $$;

-- ── the ONE instructor dataset ────────────────────────────────────────────
-- students + their self-reported cards + THIS instructor's proposal per
-- student. Used by public.list_students_for_instructor (the instructor) and
-- public.admin_get_proposals_of (the CO on their behalf).
create or replace function wa.instructor_dataset(v public.people) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'me', wa.person_json(v),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person', wa.person_json(s),
               'record', m.rec,
               'last_update', r.last_update,
               'entered_by', wa.record_stamp(m.rec, r.entered_by),
               'co_entries', wa.co_entry_count(m.rec),
               'entries_total', wa.entry_count(m.rec),
               -- ROUND 10: ONE assessment, about Fighters. The retired
               -- rank_* / nr_* columns are deliberately NOT returned — the
               -- form has nothing to draw them with, and a client that still
               -- reads them would send them back and be refused.
               'my_proposal', case when pr.id is null then null else jsonb_build_object(
                 'level', pr.level,
                 'weight', wa.level_weight(pr.level),
                 'flew_with', pr.flew_with,
                 'comment', pr.comment,
                 'entered_by', pr.entered_by,
                 'updated_at', pr.updated_at) end)
             order by s.last_name, s.first_name)
      from public.people s
      left join public.student_records r on r.student_id = s.id
      left join public.proposals pr on pr.student_id = s.id and pr.instructor_id = v.id
      -- the read-time migration runs ONCE per record, not once per question
      cross join lateral (select wa.migrate_record(coalesce(r.data, '{}'::jsonb)) as rec) m
      where s.role = 'student' and s.active), '[]'::jsonb))
$$;

-- ── THE ACTIVE INSTRUCTORS, SURNAMES ONLY (round 9) ────────────────────────
-- Every box on the student form that asks WHO — the airsickness instructor,
-- the FAIL / ALMOST GOOD instructor, the solo's "Authorised by", the
-- evaluation's evaluator, the CEF's — is a typed name with a list behind it.
-- The list is THIS, and it is deliberately the whole of what leaves the
-- database for it: a JSON ARRAY OF SURNAME STRINGS, sorted, distinct, active
-- instructors only. No id, no token, no rank, no external_oid, no duty — a
-- student may legitimately see who their instructors are, and nothing beyond
-- that follows the surname out. One definition, three callers
-- (get_student_form, admin_get_student_form and the standalone
-- list_instructor_names), so the picker cannot drift between them.
create or replace function wa.instructor_surnames() returns jsonb
language sql stable as $$
  select coalesce((
    select jsonb_agg(distinct p.last_name order by p.last_name)
    from public.people p
    where p.role = 'instructor' and p.active
      and p.last_name is not null and btrim(p.last_name) <> ''), '[]'::jsonb)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLIC RPC — the only API surface
-- ═══════════════════════════════════════════════════════════════════════════

-- who am I? (the ONE call that answers instead of raising on a bad token,
-- so the client can show the polite invalid-link landing)
create or replace function public.whoami(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  if p_token is null or length(p_token) < 24 then
    return jsonb_build_object('role', null);
  end if;
  select * into v from public.people where token = p_token and active;
  if not found then
    return jsonb_build_object('role', null);
  end if;
  return wa.person_json(v);
end $$;

-- STUDENT ────────────────────────────────────────────────────────────────
create or replace function public.get_student_form(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare
  v public.people;
  r public.student_records;
  rec jsonb;
begin
  v := wa.auth_role(p_token, 'student');
  select * into r from public.student_records where student_id = v.id;
  rec := wa.migrate_record(coalesce(r.data, '{}'::jsonb));
  return jsonb_build_object(
    'me', wa.person_json(v),
    'data', rec,
    -- ROUND 9 — THE FORM ARRIVES WITH ITS OWN PICKER. The instructor list is
    -- part of the form's payload, not a second question the client has to
    -- remember to ask: one round trip, and a form that can never render its
    -- name boxes without the names. Surnames only (wa.instructor_surnames).
    'instructors', wa.instructor_surnames(),
    'entered_by', wa.record_stamp(rec, r.entered_by),
    'co_entries', wa.co_entry_count(rec),
    'entries_total', wa.entry_count(rec),
    'last_update', r.last_update);
end $$;

-- the squadron's active instructors, SURNAMES ONLY — the picker behind
-- "with whom" on FAIL / ALMOST GOOD / airsickness / evaluation rows.
-- Readable by ANY valid token (students included) and it exposes nothing
-- else: no ids, no ranks, no duties, no tokens. Round 9 folded the same list
-- into the two get_*_student_form payloads; this call stays as the standalone
-- question, over the SAME wa.instructor_surnames().
create or replace function public.list_instructor_names(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth(p_token);
  return wa.instructor_surnames();
end $$;

-- the OWNER saving (round 8): their own entries stay theirs, and every entry
-- the squadron CO set comes through UNCHANGED and still stamped — a payload
-- that alters or drops one is refused (see wa.carry_stamps).
create or replace function public.save_student_record(p_token text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'student');
  return wa.write_record(v.id, p_payload, false);
end $$;

-- INSTRUCTOR ─────────────────────────────────────────────────────────────
-- students + their self-reported cards (spec: instructors SEE student data)
-- + the caller's own proposal per student
create or replace function public.list_students_for_instructor(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'instructor');
  return wa.instructor_dataset(v);
end $$;

-- the OWNER saving: the proposal becomes self-reported again (a CO stamp is
-- cleared the moment the instructor saves it themselves).
create or replace function public.save_proposal(p_token text, p_student_id uuid, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'instructor');
  return wa.write_proposal(v.id, p_student_id, p_payload, false);
end $$;

-- ADMIN ──────────────────────────────────────────────────────────────────
-- people CRUD incl. tokens
create or replace function public.admin_list_people(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  return coalesce((
    select jsonb_agg(wa.person_json(p) || jsonb_build_object(
             'token', p.token, 'created_at', p.created_at)
           order by p.role, p.last_name, p.first_name)
    from public.people p), '[]'::jsonb);
end $$;

-- create (p_id null) or update (p_id set); returns the row incl. token
create or replace function public.admin_save_person(p_token text, p_id uuid, p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare
  v public.people;
  row public.people;
  r public.wa_role;
  v_oid text;
begin
  v := wa.auth_role(p_token, 'admin');
  perform wa.chk(p is not null and jsonb_typeof(p) = 'object', 'person', 'payload must be an object');
  perform wa.chk_text(p->'mn', 'mn', false, 40);
  perform wa.chk_text(p->'rank', 'rank', false, 40);
  perform wa.chk_text(p->'first_name', 'first_name', false, 120);
  perform wa.chk_text(p->'last_name', 'last_name', p_id is null, 120);
  perform wa.chk_text(p->'class', 'class', false, 40);
  -- ROUND 9 — the roster fields
  perform wa.chk_text(p->'call_sign', 'call_sign', false, 40);
  perform wa.chk_text(p->'country', 'country', false, 40);
  perform wa.chk_text(p->'external_oid', 'external_oid', false, 60);
  perform wa.chk_bool(p->'test_pilot', 'test_pilot');
  -- enum casts below raise on any illegal value (duty/leadership/status/role)
  -- ROUND 9 RESIDUAL — THE OBJECT ID IS UNIQUE, AND SAYS SO IN OUR OWN WORDS.
  -- `people.external_oid` carries a unique index, so handing a person an id
  -- that already belongs to somebody else used to surface as a raw Postgres
  -- 23505 ("duplicate key value violates unique constraint …_key") — a message
  -- about an index, in a dialog about a person. The check below refuses it in
  -- the house style, naming the id, BEFORE the write is attempted.
  -- NULL IS NOT A DUPLICATE: a hand-made person legitimately has no roster id,
  -- and `external_oid: null` stays exactly what it was — the silent no-op the
  -- update's coalesce() already implements. Only a REAL id is checked.
  if p_id is null then
    r := (p->>'role')::public.wa_role;
    perform wa.chk(r in ('student', 'instructor'), 'role', 'only student/instructor can be created');
    perform wa.chk(nullif(wa.norm_line(p->>'last_name'), '') is not null, 'last_name', 'required');
    v_oid := nullif(wa.norm_code(coalesce(p->>'external_oid', '')), '');
    if v_oid is not null then
      perform wa.chk(not exists (select 1 from public.people q where q.external_oid = v_oid),
                     'external_oid',
                     format('external_oid %s is already assigned to another person', v_oid));
    end if;
    insert into public.people
           (role, mn, rank, first_name, last_name, class, duty, leadership, status,
            external_oid, call_sign, country, test_pilot)
    values (r,
            nullif(wa.norm_line(coalesce(p->>'mn', '')), ''),
            nullif(wa.norm_line(coalesce(p->>'rank', '')), ''),
            nullif(wa.norm_line(coalesce(p->>'first_name', '')), ''),
            wa.norm_line(p->>'last_name'),
            nullif(wa.norm_line(coalesce(p->>'class', '')), ''),
            (nullif(p->>'duty', ''))::public.wa_duty,
            (nullif(p->>'leadership', ''))::public.wa_leadership,
            (nullif(p->>'status', ''))::public.wa_status,
            nullif(wa.norm_code(coalesce(p->>'external_oid', '')), ''),
            nullif(wa.norm_code(coalesce(p->>'call_sign', '')), ''),
            nullif(wa.norm_line(coalesce(p->>'country', '')), ''),
            coalesce((p->>'test_pilot')::boolean, false))
    returning * into row;
  else
    select * into row from public.people where id = p_id;
    if not found then raise exception 'WA: unknown person'; end if;
    perform wa.chk(not (p ? 'role'), 'role', 'role cannot be changed');
    -- ROUND 9 — THE OBJECT ID IS IMMUTABLE. It belongs to the shared roster,
    -- not to this database: the CO may ADOPT a hand-made person into the
    -- roster by giving them the id once (null → 'R-nnnn'), and after that the
    -- id is the one thing on the row he cannot rewrite. Re-sending the same
    -- value is not a change and is accepted, so a plain "Save" never fails.
    if p ? 'external_oid' then
      perform wa.chk(row.external_oid is null
                     or row.external_oid = nullif(wa.norm_code(coalesce(p->>'external_oid', '')), ''),
                     'external_oid',
                     format('the roster object id is immutable — this person is %s', row.external_oid));
    end if;
    -- ADOPTION (null → 'R-nnnn') is the only way this column is ever written
    -- on an existing row, and it is the only place a clash can appear.
    if row.external_oid is null and p ? 'external_oid' then
      v_oid := nullif(wa.norm_code(coalesce(p->>'external_oid', '')), '');
      if v_oid is not null then
        perform wa.chk(not exists (select 1 from public.people q
                                   where q.external_oid = v_oid and q.id <> p_id),
                       'external_oid',
                       format('external_oid %s is already assigned to another person', v_oid));
      end if;
    end if;
    update public.people set
      mn         = case when p ? 'mn'         then nullif(wa.norm_line(coalesce(p->>'mn', '')), '')         else mn end,
      rank       = case when p ? 'rank'       then nullif(wa.norm_line(coalesce(p->>'rank', '')), '')       else rank end,
      first_name = case when p ? 'first_name' then nullif(wa.norm_line(coalesce(p->>'first_name', '')), '') else first_name end,
      last_name  = case when p ? 'last_name'  then coalesce(nullif(wa.norm_line(p->>'last_name'), ''), last_name) else last_name end,
      class      = case when p ? 'class'      then nullif(wa.norm_line(coalesce(p->>'class', '')), '') else class end,
      duty       = case when p ? 'duty'       then (nullif(p->>'duty', ''))::public.wa_duty         else duty end,
      leadership = case when p ? 'leadership' then (nullif(p->>'leadership', ''))::public.wa_leadership else leadership end,
      status     = case when p ? 'status'     then (nullif(p->>'status', ''))::public.wa_status     else status end,
      call_sign  = case when p ? 'call_sign'  then nullif(wa.norm_code(coalesce(p->>'call_sign', '')), '') else call_sign end,
      country    = case when p ? 'country'    then nullif(wa.norm_line(coalesce(p->>'country', '')), '') else country end,
      test_pilot = case when p ? 'test_pilot' then coalesce((p->>'test_pilot')::boolean, false) else test_pilot end,
      external_oid = coalesce(external_oid,
                       case when p ? 'external_oid'
                            then nullif(wa.norm_code(coalesce(p->>'external_oid', '')), '') end)
    where id = p_id
    returning * into row;
  end if;
  return wa.person_json(row) || jsonb_build_object('token', row.token);
end $$;

create or replace function public.admin_delete_person(p_token text, p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people; row public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  select * into row from public.people where id = p_id;
  if not found then raise exception 'WA: unknown person'; end if;
  if row.role = 'admin' then
    raise exception 'WA: the admin account cannot be deleted';
  end if;
  delete from public.people where id = p_id;  -- cascades records + proposals
  return jsonb_build_object('ok', true, 'deleted', p_id);
end $$;

-- revoke = deactivate (link stops working immediately); reactivate restores it
create or replace function public.admin_set_active(p_token text, p_id uuid, p_active boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people; row public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  select * into row from public.people where id = p_id;
  if not found then raise exception 'WA: unknown person'; end if;
  if row.role = 'admin' and not p_active then
    raise exception 'WA: the admin link cannot be revoked (regenerate it instead)';
  end if;
  update public.people set active = p_active where id = p_id returning * into row;
  return wa.person_json(row) || jsonb_build_object('token', row.token);
end $$;

-- regenerate = new token, old link dead instantly (leak response)
create or replace function public.admin_regenerate_token(p_token text, p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people; row public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  update public.people set token = wa.gen_token(), active = true
  where id = p_id returning * into row;
  if not found then raise exception 'WA: unknown person'; end if;
  return wa.person_json(row) || jsonb_build_object('token', row.token);
end $$;

-- ── ENTER ON BEHALF (round 4) ─────────────────────────────────────────────
-- The CO must be able to enter and edit information FOR ANYONE — a student who
-- cannot reach their link, an instructor who dictates his ranking over the
-- phone. Transparency is the price: what the CO writes carries
-- entered_by='admin', which the views render as a small "CO" tag.
-- A PROPOSAL is one row and is stamped as a whole. A RECORD is a list of
-- entries, so round 4b decides it entry by entry: the payload is diffed
-- against the stored record and only the entries the CO added or changed are
-- stamped (wa.stamp_record_diff). The stamps survive further CO saves — a CO
-- re-save that changes nothing changes nothing — and are all cleared the
-- moment the OWNER saves: reclaiming their own data makes it self-reported.
-- SECURITY: admin role only (a student/instructor token raises), and the
-- validation pipeline is the SAME one the owner goes through — wa.write_record
-- / wa.write_proposal — so a CO typo is refused exactly like a student typo.

create or replace function public.admin_get_student_form(p_token text, p_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare
  v public.people;
  s public.people;
  r public.student_records;
  rec jsonb;
begin
  v := wa.auth_role(p_token, 'admin');
  select * into s from public.people
   where id = p_student_id and role = 'student' and active;
  if not found then raise exception 'WA: unknown student'; end if;
  select * into r from public.student_records where student_id = s.id;
  rec := wa.migrate_record(coalesce(r.data, '{}'::jsonb));
  return jsonb_build_object(
    'me', wa.person_json(s),
    'data', rec,
    -- the CO fills in the SAME form and gets the SAME picker (round 9)
    'instructors', wa.instructor_surnames(),
    'entered_by', wa.record_stamp(rec, r.entered_by),
    'co_entries', wa.co_entry_count(rec),
    'entries_total', wa.entry_count(rec),
    'on_behalf', true,
    'last_update', r.last_update);
end $$;

create or replace function public.admin_save_student_record(p_token text, p_student_id uuid,
                                                            p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people; s public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  select * into s from public.people
   where id = p_student_id and role = 'student' and active;
  if not found then raise exception 'WA: unknown student'; end if;
  return wa.write_record(s.id, p_payload, true);
end $$;

create or replace function public.admin_get_proposals_of(p_token text, p_instructor_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people; ins public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  select * into ins from public.people
   where id = p_instructor_id and role = 'instructor' and active;
  if not found then raise exception 'WA: unknown instructor'; end if;
  return wa.instructor_dataset(ins) || jsonb_build_object('on_behalf', true);
end $$;

create or replace function public.admin_save_proposal(p_token text, p_instructor_id uuid,
                                                      p_student_id uuid, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people; ins public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  select * into ins from public.people
   where id = p_instructor_id and role = 'instructor' and active;
  if not found then raise exception 'WA: unknown instructor'; end if;
  return wa.write_proposal(ins.id, p_student_id, p_payload, true);
end $$;

-- the dashboard dataset: students + records + per-student aggregates
-- (per-branch surname lists per rank, weighted 3/2/1 scores, polite
-- non-proposal lists, completion) + instructors
create or replace function public.admin_get_data(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare
  v public.people;
  students jsonb;
  instructors jsonb;
  n_instructors int;
begin
  v := wa.auth_role(p_token, 'admin');
  select count(*) into n_instructors
  from public.people where role = 'instructor' and active;

  select coalesce(jsonb_agg(stu order by stu->'person'->>'last_name', stu->'person'->>'first_name'), '[]'::jsonb)
  into students
  from (
    select jsonb_build_object(
      'person', wa.person_json(s),
      'record', m.rec,
      -- ROUND 11 — THE PASS ATTEMPT OF EACH OF THE EIGHT, computed server-side
      -- by the one definition (wa.eval_operative). The dashboard derives the
      -- same eight from `record` with the mirrored WA.evalOperativeOf, exactly
      -- as it repeats wa.migrate_record client-side, so a cloud instance
      -- running an older schema still draws the right chart. This object is
      -- what makes the two DEMONSTRABLY the same rule instead of two rules
      -- that happen to agree: it can be diffed against the client's own map
      -- from a raw RPC call, which is how round 11 verified it.
      'eval_grades', wa.eval_grades(m.rec),
      'last_update', r.last_update,
      'entered_by', wa.record_stamp(m.rec, r.entered_by),
      'completion', jsonb_build_object(
        'has_record', r.student_id is not null,
        'entered_by', wa.record_stamp(m.rec, r.entered_by),
        -- how many entries the CO wrote, out of how many the record holds:
        -- 1 of 18 is a self-reported record with one CO addition, 18 of 18 is
        -- a record the CO entered. The dashboard must not confuse the two.
        'co_entries', wa.co_entry_count(m.rec),
        'entries_total', wa.entry_count(m.rec),
        'proposals_in', (select count(*) from public.proposals pr
                         join public.people ip on ip.id = pr.instructor_id and ip.active
                         where pr.student_id = s.id),
        'instructors_total', n_instructors),
      'proposals', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'instructor_id', ip.id,
                 'last_name', ip.last_name, 'rank', ip.rank,
                 'duty', ip.duty, 'leadership', ip.leadership, 'status', ip.status,
                 -- ROUND 9: the drill-down names the instructor the way the
                 -- squadron does — the call sign beside the surname
                 'call_sign', ip.call_sign, 'country', ip.country,
                 'test_pilot', ip.test_pilot,
                 'level', pr.level,
                 'weight', wa.level_weight(pr.level),
                 'flew_with', pr.flew_with, 'comment', pr.comment,
                 'entered_by', pr.entered_by,
                 'updated_at', pr.updated_at)
               order by ip.last_name)
        from public.proposals pr
        join public.people ip on ip.id = pr.instructor_id and ip.active
        where pr.student_id = s.id), '[]'::jsonb),
      -- ══ THE AGGREGATE (round 10) — A WEIGHTED MEAN, NOT A SUM ═══════════
      -- The branch scores were SUMS, and a sum rewards being talked about: a
      -- student four instructors placed second out-scored one that two placed
      -- first. With one assessment per instructor the honest statistic is the
      -- MEAN of the weights — «what does this squadron, on average, say about
      -- him for fighters» — and it is comparable between a student with nine
      -- assessments and one with three.
      -- `n` counts only the rows that carry a level, so an instructor who has
      -- submitted without forming a view neither raises nor lowers anybody:
      -- he is named in `no_level` instead. `sum` travels beside the mean so
      -- every surface can print the arithmetic instead of asking for trust.
      'assessment', (
        select jsonb_build_object(
          'n', coalesce(x.n, 0),
          'sum', coalesce(x.sm, 0),
          'mean', case when coalesce(x.n, 0) = 0 then null
                       else round(x.sm::numeric / x.n, 2) end,
          -- how many said each level, in scale order — the distribution the
          -- brief prints as «2× Strongly · 1× Alternate»
          'counts', coalesce((
            select jsonb_object_agg(k.lvl, coalesce(c.n, 0))
            from unnest(wa.level_keys()) k(lvl)
            left join lateral (
              select count(*) as n
              from public.proposals p2
              join public.people i2 on i2.id = p2.instructor_id and i2.active
              where p2.student_id = s.id and p2.level = k.lvl) c on true), '{}'::jsonb),
          -- and WHO said it: the CO reads a level with the names beside it
          'by_level', coalesce((
            select jsonb_object_agg(k.lvl, coalesce(c.names, '[]'::jsonb))
            from unnest(wa.level_keys()) k(lvl)
            left join lateral (
              select jsonb_agg(coalesce(i2.rank || ' ', '') || i2.last_name
                               order by i2.last_name) as names
              from public.proposals p2
              join public.people i2 on i2.id = p2.instructor_id and i2.active
              where p2.student_id = s.id and p2.level = k.lvl) c on true), '{}'::jsonb),
          -- ROUND 8's RULE SURVIVES THE RESHAPE: the two silences are still
          -- not the same silence. `no_level` = he submitted and formed no
          -- view; `not_submitted` (below) = he has not answered at all.
          'no_level', coalesce((
            select jsonb_agg(coalesce(i2.rank || ' ', '') || i2.last_name order by i2.last_name)
            from public.proposals p2
            join public.people i2 on i2.id = p2.instructor_id and i2.active
            where p2.student_id = s.id and p2.level is null), '[]'::jsonb))
        from (
          select count(*) filter (where pr.level is not null) as n,
                 sum(wa.level_weight(pr.level)) as sm
          from public.proposals pr
          join public.people ip on ip.id = pr.instructor_id and ip.active
          where pr.student_id = s.id) x),
      'not_submitted', coalesce((
        -- active instructors with no proposal at all for this student
        select jsonb_agg(coalesce(ip.rank || ' ', '') || ip.last_name order by ip.last_name)
        from public.people ip
        where ip.role = 'instructor' and ip.active
          and not exists (select 1 from public.proposals pr
                          where pr.instructor_id = ip.id and pr.student_id = s.id)),
        '[]'::jsonb)
    ) as stu
    from public.people s
    left join public.student_records r on r.student_id = s.id
    -- the read-time migration runs ONCE per record, not once per question
    cross join lateral (select wa.migrate_record(coalesce(r.data, '{}'::jsonb)) as rec) m
    where s.role = 'student' and s.active
  ) q;

  select coalesce(jsonb_agg(wa.person_json(p) || jsonb_build_object(
           'proposals_count', (select count(*) from public.proposals pr
                               where pr.instructor_id = p.id))
         order by p.last_name), '[]'::jsonb)
  into instructors
  from public.people p where p.role = 'instructor';

  return jsonb_build_object(
    'students', students,
    'instructors', instructors,
    'generated_at', now());
end $$;

-- raw export (JSON download / CSV built client-side) — tokens excluded
create or replace function public.admin_export(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  return jsonb_build_object(
    'exported_at', now(),
    'people', coalesce((select jsonb_agg(wa.person_json(p) order by p.role, p.last_name)
                        from public.people p), '[]'::jsonb),
    'student_records', coalesce((select jsonb_agg(jsonb_build_object(
                          'student_id', r.student_id,
                          'data', m.rec,
                          'data_as_stored', r.data,
                          'entered_by', wa.record_stamp(m.rec, r.entered_by),
                          'co_entries', wa.co_entry_count(m.rec),
                          'entries_total', wa.entry_count(m.rec),
                          'last_update', r.last_update))
                        from public.student_records r
                        cross join lateral (select wa.migrate_record(r.data) as rec) m), '[]'::jsonb),
    -- ROUND 10: the assessment and its weight. The frozen rank_* / nr_*
    -- columns are not exported either — the export is what the app knows, and
    -- the app no longer knows anything about aircraft types.
    'proposals', coalesce((select jsonb_agg(jsonb_build_object(
                    'instructor_id', pr.instructor_id, 'student_id', pr.student_id,
                    'level', pr.level,
                    'level_label', wa.level_label(pr.level),
                    'weight', wa.level_weight(pr.level),
                    'flew_with', pr.flew_with, 'comment', pr.comment,
                    'entered_by', pr.entered_by,
                    'updated_at', pr.updated_at)) from public.proposals pr), '[]'::jsonb));
end $$;

-- weekly keep-alive ping (GitHub Action) — touches nothing, returns 'ok'
create or replace function public.keepalive() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select 'ok'::text
$$;

-- ── function grants: EXECUTE for anon only on the public RPC surface ───────
do $$
declare fn text;
begin
  foreach fn in array array[
    'whoami(text)',
    'get_student_form(text)',
    'save_student_record(text, jsonb)',
    'list_instructor_names(text)',
    'list_students_for_instructor(text)',
    'save_proposal(text, uuid, jsonb)',
    'admin_list_people(text)',
    'admin_save_person(text, uuid, jsonb)',
    'admin_delete_person(text, uuid)',
    'admin_set_active(text, uuid, boolean)',
    'admin_regenerate_token(text, uuid)',
    'admin_get_student_form(text, uuid)',
    'admin_save_student_record(text, uuid, jsonb)',
    'admin_get_proposals_of(text, uuid)',
    'admin_save_proposal(text, uuid, uuid, jsonb)',
    'admin_get_data(text)',
    'admin_export(text)',
    'keepalive()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', fn);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 10 MIGRATION — THE BRANCH RANKS BECOME ONE LEVEL, ONCE
-- ──────────────────────────────────────────────────────────────────────────
-- THIS IS DEMO COMFORT, NOT DOCTRINE. The real 98B deployment starts with an
-- EMPTY proposals table, so this block will map nothing there and simply
-- record that it ran. It exists so the local demo (and any instance that
-- already collected round-8 rankings) is not left blank on the morning the
-- new form appears — an empty dashboard would look like data loss.
--
-- THE MAPPING. Fighters was one of three branches; it is now the only
-- question. So the student's FIGHTERS POSITION is what carries over, and
-- everything else in the old row is read as a statement about fighters:
--   Fighters 1st                     → strongly_recommended        (10)
--   Fighters 2nd                     → recommended                  (8)
--   Fighters 3rd                     → alternate                    (5)
--   not recommended for ALL THREE    → strongly_other_assignments   (1)
--   not recommended for Fighters     → other_assignments            (3)
--   Fighters unranked, another
--     branch ranked                  → other_assignments            (3)
--   anything else                    → LEVEL NULL, re-entry needed
-- The all-out refusal is tested BEFORE the fighters-only one, or an
-- instructor who ruled out every branch would be recorded as merely
-- redirecting. The last line is the one that matters most: a row where the
-- instructor said nothing about fighters and recommended nowhere else has NO
-- fighters opinion in it, and inventing one — even the polite weight-3 one —
-- would put words in his mouth that a student may one day read. Its comment
-- and flew-with survive untouched; the level stays null and the form asks.
--
-- Idempotent by ledger (wa.migrations), not by luck: see the table's comment.
do $$
declare
  n_rows int; n1 int; n2 int; n3 int; n5 int; n4a int; n4b int; n_open int;
  msg text;
begin
  if exists (select 1 from wa.migrations where id = 'r10-five-level-scale') then
    return;
  end if;
  select count(*) into n_rows from public.proposals;

  update public.proposals set level = 'strongly_recommended'
   where level is null and rank_fighters = 1;
  get diagnostics n1 = row_count;

  update public.proposals set level = 'recommended'
   where level is null and rank_fighters = 2;
  get diagnostics n2 = row_count;

  update public.proposals set level = 'alternate'
   where level is null and rank_fighters = 3;
  get diagnostics n3 = row_count;

  -- the explicit all-out negative, if any exists: nowhere at all → the
  -- emphatic redirect, which is the strongest thing the scale says in that
  -- direction and still says it without a negative word
  update public.proposals set level = 'strongly_other_assignments'
   where level is null and nr_fighters and nr_helicopters and nr_transport_ff;
  get diagnostics n5 = row_count;

  update public.proposals set level = 'other_assignments'
   where level is null and nr_fighters;
  get diagnostics n4a = row_count;

  -- "he placed him somewhere, and it was not fighters" — a view about
  -- fighters, expressed by where the student was put instead
  update public.proposals set level = 'other_assignments'
   where level is null and rank_fighters is null
     and (rank_helicopters is not null or rank_transport_ff is not null);
  get diagnostics n4b = row_count;

  select count(*) into n_open from public.proposals where level is null;

  msg := format('r10: %s proposal row(s) read · %s strongly_recommended · %s recommended · %s alternate · %s other_assignments (%s explicit fighters-refusal + %s ranked-elsewhere) · %s strongly_other_assignments · %s left unassessed (comment kept, re-entry required)',
                n_rows, n1, n2, n3, n4a + n4b, n4a, n4b, n5, n_open);
  insert into wa.migrations (id, note) values ('r10-five-level-scale', msg);
  raise notice '%', msg;
end $$;

-- ── bootstrap: the admin person (created once; token survives re-runs) ─────
insert into public.people (role, rank, first_name, last_name)
select 'admin', '', '', 'Squadron CO'
where not exists (select 1 from public.people where role = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- YOUR ADMIN LINK — copy the admin_link value from the result grid below,
-- replace <PAGES-URL> with your GitHub Pages address, open it, add people.
-- ═══════════════════════════════════════════════════════════════════════════
select token as admin_token,
       '<PAGES-URL>/#t=' || token as admin_link
from public.people
where role = 'admin'
order by created_at
limit 1;
