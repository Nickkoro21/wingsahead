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
-- The owner saving their own form clears it.
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
--      checkride cannot be recorded while an earlier one is still pending.
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
-- for the solos and the eight checkrides (pending until flown — an unflown
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
-- (a grade stays a number, `pending` stays a boolean, json null stays null);
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
-- ▲▲ GENERATED BLOCK ▲▲

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

-- ── THE FIXED SOLO SLOTS (round 5) ────────────────────────────────────────
-- One slot per solo the stage prescribes — flow-chart Training Sections whose
-- printed duration block says SOLO SORTIES > 0. F4301-06 prescribes TWO, so it
-- carries two distinct slots. Solos are not a free list: the form draws exactly
-- these rows, pending until flown, and nothing can add or remove one. An
-- unforeseen extra solo is a slot-LESS entry (the "additional solo" path).
-- MIRROR: app/items-catalog.js → WA_SOLO_SLOTS (generated from flowchart2.json).
create or replace function wa.solo_slots() returns text[]
language sql immutable as $$
  select array['C4790-91-S1','C4801-04-S1','C4901-05-S1','C5201-04-S1',
               'C5301-04-S1','F4301-06-S1','F4301-06-S2','F4501-03-S1']::text[]
$$;

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

-- the nine sections of a v2 record, in form order.
-- MIRROR: app/app.js → WA.COUNTED.
create or replace function wa.sections() returns text[]
language sql immutable as $$
  select array['nfs','sms','fail','almost_good','airsickness',
               'evaluations','solo_flights','fpc','cef']::text[]
$$;

-- the sections whose entries may carry `pending` — an entry is pending only
-- where the form offers the tick box. Anywhere else the flag would be a
-- badge on the CO's dashboard that nobody can ever clear (round-4 W3a).
create or replace function wa.pending_sections() returns text[]
language sql immutable as $$
  select array['fail','almost_good','evaluations','fpc','cef']::text[]
$$;

-- ── PER-SECTION KEY WHITELIST (round-4 W3a) ───────────────────────────────
-- The exhaustive list of keys ONE entry of a section may carry. Anything else
-- is rejected on write and stripped on read: a typo ("total_count") is caught
-- instead of silently stored, and a flag the form cannot show ("pending" on an
-- NFS row) can never enter the record.
-- MIRROR: app/app.js → WA.ENTRY_KEYS. Change one, change the other.
create or replace function wa.entry_keys(p_sec text) returns text[]
language sql immutable as $$
  select case p_sec
    when 'nfs'          then array['date','reason','note','legacy','entered_by']
    when 'sms'          then array['entrance_date','exit_date','note','legacy','entered_by']
    when 'fail'         then array['date','category','flight_code','items','instructor',
                                   'grade','pending','legacy','entered_by']
    when 'almost_good'  then array['date','category','flight_code','items','instructor',
                                   'grade','pending','legacy','entered_by']
    -- ROUND 6: an airsickness event names the FLIGHT it happened on, not a
    -- phase-of-flight note. `phase` survives in this list as a READ-ONLY
    -- LEGACY CARRIER — a note already written is never destroyed behind its
    -- owner's back — but the form no longer draws the box, the write path
    -- refuses to let the number of rows carrying one grow (wa.phase_count),
    -- and such a row cannot be saved again until its flight is chosen.
    when 'airsickness'  then array['date','instructor','flight_code','phase','legacy','entered_by']
    when 'evaluations'  then array['date','evaluation','with','grade','pending','legacy','entered_by']
    when 'solo_flights' then array['slot','sortie','date','ng','grade','instructor','legacy','entered_by']
    when 'fpc'          then array['date','flight_code','evaluator','result','grade','pending','legacy','entered_by']
    when 'cef'          then array['date','flight_code','evaluator','result','grade','pending','legacy','entered_by']
    else array[]::text[] end
$$;

-- ── AN EMPTY FIXED SLOT (round 5) ─────────────────────────────────────────
-- Solo flights and evaluations are FIXED syllabus rows: the eight solos the
-- stage prescribes and the eight stage checkrides are present from the first
-- day, pending until they are flown. A slot nobody has flown yet is a
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
    when p_sec = 'evaluations' then
      (e->>'evaluation') is not null and (e->>'date') is null and (e->>'grade') is null
      and (e->>'with') is null
      and coalesce((case when jsonb_typeof(e->'pending') = 'boolean'
                         then (e->>'pending')::boolean else false end), false) = false
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
      perform wa.chk(jsonb_array_length(p->k) <= 200, k, 'too many entries');
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
          -- SMS entries can never be pending (round-3 ruling)
          perform wa.chk(not (e ? 'pending') or jsonb_typeof(e->'pending') = 'null',
                         w || '.pending', 'SMS entries cannot be pending');
          perform wa.chk_date(e->'entrance_date', w || '.entrance_date', not wa.is_legacy(e));
          perform wa.chk_date(e->'exit_date', w || '.exit_date', false);
          perform wa.chk_text(e->'note', w || '.note', false, 300);

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
          perform wa.chk_bool(e->'pending', w || '.pending');

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
          -- carries anything (a date, a grade, an evaluator, a pending tick)
          -- it is a flown evaluation and the date is required again.
          perform wa.chk_bool(e->'legacy', w || '.legacy');
          perform wa.chk_date(e->'date', w || '.date',
                              not wa.is_legacy(e) and not wa.slot_empty(k, e));
          perform wa.chk_text(e->'evaluation', w || '.evaluation', not wa.is_legacy(e), 20);
          perform wa.chk(e->>'evaluation' is null or (e->>'evaluation') = any(wa.eval_ids()),
                         w || '.evaluation', 'unknown evaluation — expected one of the eight checkrides');
          perform wa.chk_text(e->'with', w || '.with', false, 200);
          perform wa.chk_grade(e->'grade', w || '.grade', false);
          perform wa.chk_bool(e->'pending', w || '.pending');

        elsif k = 'solo_flights' then
          -- FIXED SLOT RULE (round 5): the solos of the stage are the syllabus
          -- slots, present from day one and pending until flown. `slot` names
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
          perform wa.chk_bool(e->'pending', w || '.pending');
        end if;

        -- `pending` exists only where the form draws the tick box; anywhere
        -- else it would become a badge on the CO's dashboard that nobody can
        -- ever clear (round-4 W3a).
        perform wa.chk(not (e ? 'pending') or jsonb_typeof(e->'pending') = 'null'
                       or k = any(wa.pending_sections()), w || '.pending',
          format('a %s entry can never be pending — only %s entries can',
                 k, array_to_string(wa.pending_sections(), ' / ')));

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
                format('evaluations follow the syllabus order — %s cannot be recorded while %s is pending',
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
-- evaluations, pending SMS, graded/non-graded solos, progress_tests /
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
        e := e || jsonb_build_object('note', 'was flagged pending in the previous form');
      end if;
      e := e - 'pending';
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

  -- FINAL PASS — per-section key whitelist (round-4 W3a): a key the form
  -- cannot show and the validator no longer accepts is dropped on READ, so a
  -- record that was written before this rule stops carrying it (a smuggled
  -- {"pending":true} on an NFS row disappears the moment the record is read).
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

-- person as public jsonb (never leaks the token)
create or replace function wa.person_json(p public.people) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'role', p.role, 'mn', p.mn, 'rank', p.rank,
    'first_name', p.first_name, 'last_name', p.last_name, 'class', p.class,
    'duty', p.duty, 'leadership', p.leadership, 'status', p.status,
    'active', p.active)
$$;

-- count of pending-flagged entries (direct members of the PENDING-CAPABLE
-- top-level sections — exactly the entries the client's WA.pendingItems can
-- describe and the form can clear; a jsonpath '$.**' walk would double-count
-- through lax-mode array unwrapping, and counting every section would resurrect
-- the round-4 W3a bug: a badge nobody can clear)
create or replace function wa.pending_count(p jsonb) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_each(coalesce(p, '{}'::jsonb)) s(key, val)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(val) = 'array' then val else '[]'::jsonb end) e
    where s.key = any(wa.pending_sections())
      and jsonb_typeof(e) = 'object'
      and case when jsonb_typeof(e->'pending') = 'boolean'
               then (e->>'pending')::boolean else false end), 0)
$$;

-- how many entries of a record were entered BY THE CO on the owner's behalf
-- (an unflown fixed slot is a placeholder, not an entry — round 5)
create or replace function wa.co_entry_count(p jsonb) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_each(coalesce(p, '{}'::jsonb)) s(key, val)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(val) = 'array' then val else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object' and (e->>'entered_by') = 'admin'
      and not wa.slot_empty(s.key, e)), 0)
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

-- the OWNER path: saving your own form re-reports the WHOLE record as yours
-- (the reclaim rule — unchanged, and deliberately not a diff).
create or replace function wa.strip_stamps(p jsonb) returns jsonb
language plpgsql immutable as $$
declare o jsonb := '{}'::jsonb; k text; arr jsonb; i int; e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return coalesce(p, '{}'::jsonb); end if;
  for k in select jsonb_object_keys(p) loop
    if jsonb_typeof(p->k) <> 'array' then
      o := o || jsonb_build_object(k, p->k);
      continue;
    end if;
    arr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(p->k) - 1 loop
      e := p->k->i;
      if jsonb_typeof(e) = 'object' then e := e - 'entered_by'; end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object(k, arr);
  end loop;
  return o;
end $$;

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

  -- THE STAMP (round 4b) — the CO's save is diffed against what is stored, so
  -- only what he actually wrote carries his name; the owner's save reclaims
  -- everything. Applied server-side on EVERY write, so a stamp can neither be
  -- forged by a hand-made payload nor kept alive by one.
  stamped := case when p_as_admin then wa.stamp_record_diff(pl, old)
                  else wa.strip_stamps(pl) end;
  -- DERIVED, never typed. On a CO save of a record that does not exist yet the
  -- CO is its creator, which is what an empty record has instead of entries.
  by_who := case when p_as_admin
                 then wa.record_stamp(stamped, case when had then prev else 'admin' end)
                 else null end;

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
  rf smallint; rh smallint; rt smallint;
  fw boolean; cm text;
  n int;
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

  -- ranks: null or integer 1..3, pairwise distinct
  foreach cm in array array['fighters', 'helicopters', 'transport_ff'] loop
    if (p_payload->'ranks') ? cm and jsonb_typeof(p_payload->'ranks'->cm) <> 'null' then
      perform wa.chk(jsonb_typeof(p_payload->'ranks'->cm) = 'number'
                     and (p_payload->'ranks'->>cm)::numeric in (1, 2, 3),
                     'ranks.' || cm, 'rank must be 1, 2 or 3');
    end if;
  end loop;
  rf := (p_payload->'ranks'->>'fighters')::smallint;
  rh := (p_payload->'ranks'->>'helicopters')::smallint;
  rt := (p_payload->'ranks'->>'transport_ff')::smallint;
  select count(distinct x) into n from unnest(array[rf, rh, rt]) x where x is not null;
  perform wa.chk(n = (case when rf is null then 0 else 1 end
                    + case when rh is null then 0 else 1 end
                    + case when rt is null then 0 else 1 end),
                 'ranks', 'the same position cannot be given to two branches');

  perform wa.chk_bool(p_payload->'flew_with', 'flew_with');
  fw := coalesce((p_payload->>'flew_with')::boolean, false);
  perform wa.chk_text(p_payload->'comment', 'comment', false, 500);
  -- free text: the ends are cut (round 5b); the paragraphing the instructor
  -- typed is his own and is kept
  cm := nullif(wa.norm_free(coalesce(p_payload->>'comment', '')), '');

  insert into public.proposals as pr
         (instructor_id, student_id, rank_fighters, rank_helicopters,
          rank_transport_ff, flew_with, comment, entered_by)
  values (p_instructor, p_student, rf, rh, rt, fw, cm, by_who)
  on conflict (instructor_id, student_id)
  do update set rank_fighters = excluded.rank_fighters,
                rank_helicopters = excluded.rank_helicopters,
                rank_transport_ff = excluded.rank_transport_ff,
                flew_with = excluded.flew_with,
                comment = excluded.comment,
                entered_by = excluded.entered_by
  returning * into saved;
  return jsonb_build_object('ok', true, 'updated_at', saved.updated_at, 'entered_by', by_who);
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
               'my_proposal', case when pr.id is null then null else jsonb_build_object(
                 'ranks', jsonb_build_object(
                   'fighters', pr.rank_fighters,
                   'helicopters', pr.rank_helicopters,
                   'transport_ff', pr.rank_transport_ff),
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
    'entered_by', wa.record_stamp(rec, r.entered_by),
    'co_entries', wa.co_entry_count(rec),
    'entries_total', wa.entry_count(rec),
    'last_update', r.last_update);
end $$;

-- the squadron's active instructors, SURNAMES ONLY — the picker behind
-- "with whom" on FAIL / ALMOST GOOD / airsickness / evaluation rows.
-- Readable by ANY valid token (students included) and it exposes nothing
-- else: no ids, no ranks, no duties, no tokens.
create or replace function public.list_instructor_names(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth(p_token);
  return coalesce((
    select jsonb_agg(distinct p.last_name order by p.last_name)
    from public.people p
    where p.role = 'instructor' and p.active and p.last_name is not null), '[]'::jsonb);
end $$;

-- the OWNER saving: every entry becomes self-reported again (any CO stamp on
-- the record and on its entries is cleared — see wa.strip_stamps).
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
begin
  v := wa.auth_role(p_token, 'admin');
  perform wa.chk(p is not null and jsonb_typeof(p) = 'object', 'person', 'payload must be an object');
  perform wa.chk_text(p->'mn', 'mn', false, 40);
  perform wa.chk_text(p->'rank', 'rank', false, 40);
  perform wa.chk_text(p->'first_name', 'first_name', false, 120);
  perform wa.chk_text(p->'last_name', 'last_name', p_id is null, 120);
  perform wa.chk_text(p->'class', 'class', false, 40);
  -- enum casts below raise on any illegal value (duty/leadership/status/role)
  if p_id is null then
    r := (p->>'role')::public.wa_role;
    perform wa.chk(r in ('student', 'instructor'), 'role', 'only student/instructor can be created');
    perform wa.chk(nullif(wa.norm_line(p->>'last_name'), '') is not null, 'last_name', 'required');
    insert into public.people
           (role, mn, rank, first_name, last_name, class, duty, leadership, status)
    values (r,
            nullif(wa.norm_line(coalesce(p->>'mn', '')), ''),
            nullif(wa.norm_line(coalesce(p->>'rank', '')), ''),
            nullif(wa.norm_line(coalesce(p->>'first_name', '')), ''),
            wa.norm_line(p->>'last_name'),
            nullif(wa.norm_line(coalesce(p->>'class', '')), ''),
            (nullif(p->>'duty', ''))::public.wa_duty,
            (nullif(p->>'leadership', ''))::public.wa_leadership,
            (nullif(p->>'status', ''))::public.wa_status)
    returning * into row;
  else
    select * into row from public.people where id = p_id;
    if not found then raise exception 'WA: unknown person'; end if;
    perform wa.chk(not (p ? 'role'), 'role', 'role cannot be changed');
    update public.people set
      mn         = case when p ? 'mn'         then nullif(wa.norm_line(coalesce(p->>'mn', '')), '')         else mn end,
      rank       = case when p ? 'rank'       then nullif(wa.norm_line(coalesce(p->>'rank', '')), '')       else rank end,
      first_name = case when p ? 'first_name' then nullif(wa.norm_line(coalesce(p->>'first_name', '')), '') else first_name end,
      last_name  = case when p ? 'last_name'  then coalesce(nullif(wa.norm_line(p->>'last_name'), ''), last_name) else last_name end,
      class      = case when p ? 'class'      then nullif(wa.norm_line(coalesce(p->>'class', '')), '') else class end,
      duty       = case when p ? 'duty'       then (nullif(p->>'duty', ''))::public.wa_duty         else duty end,
      leadership = case when p ? 'leadership' then (nullif(p->>'leadership', ''))::public.wa_leadership else leadership end,
      status     = case when p ? 'status'     then (nullif(p->>'status', ''))::public.wa_status     else status end
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
        'pending_count', wa.pending_count(m.rec),
        'proposals_in', (select count(*) from public.proposals pr
                         join public.people ip on ip.id = pr.instructor_id and ip.active
                         where pr.student_id = s.id),
        'instructors_total', n_instructors),
      'proposals', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'instructor_id', ip.id,
                 'last_name', ip.last_name, 'rank', ip.rank,
                 'duty', ip.duty, 'leadership', ip.leadership, 'status', ip.status,
                 'ranks', jsonb_build_object(
                   'fighters', pr.rank_fighters,
                   'helicopters', pr.rank_helicopters,
                   'transport_ff', pr.rank_transport_ff),
                 'flew_with', pr.flew_with, 'comment', pr.comment,
                 'entered_by', pr.entered_by,
                 'updated_at', pr.updated_at)
               order by ip.last_name)
        from public.proposals pr
        join public.people ip on ip.id = pr.instructor_id and ip.active
        where pr.student_id = s.id), '[]'::jsonb),
      'aggregates', (
        select jsonb_object_agg(b.branch, jsonb_build_object(
          'by_rank', (
            select jsonb_build_object(
              '1', coalesce(jsonb_agg(x.last_name order by x.last_name) filter (where x.rk = 1), '[]'::jsonb),
              '2', coalesce(jsonb_agg(x.last_name order by x.last_name) filter (where x.rk = 2), '[]'::jsonb),
              '3', coalesce(jsonb_agg(x.last_name order by x.last_name) filter (where x.rk = 3), '[]'::jsonb))
            from (
              select ip.last_name,
                     case b.branch when 'fighters' then pr.rank_fighters
                                   when 'helicopters' then pr.rank_helicopters
                                   else pr.rank_transport_ff end as rk
              from public.proposals pr
              join public.people ip on ip.id = pr.instructor_id and ip.active
              where pr.student_id = s.id) x
            where x.rk is not null),
          'weighted', (
            select coalesce(sum(4 - x.rk), 0)
            from (
              select case b.branch when 'fighters' then pr.rank_fighters
                                   when 'helicopters' then pr.rank_helicopters
                                   else pr.rank_transport_ff end as rk
              from public.proposals pr
              join public.people ip on ip.id = pr.instructor_id and ip.active
              where pr.student_id = s.id) x
            where x.rk is not null),
          'not_this_branch', (
            -- submitted a proposal for this student but did NOT recommend this branch
            select coalesce(jsonb_agg(y.nm order by y.nm), '[]'::jsonb)
            from (
              select coalesce(ip.rank || ' ', '') || ip.last_name as nm
              from public.proposals pr
              join public.people ip on ip.id = pr.instructor_id and ip.active
              where pr.student_id = s.id
                and (case b.branch when 'fighters' then pr.rank_fighters
                                   when 'helicopters' then pr.rank_helicopters
                                   else pr.rank_transport_ff end) is null) y)))
        from (values ('fighters'), ('helicopters'), ('transport_ff')) b(branch)),
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
    'proposals', coalesce((select jsonb_agg(jsonb_build_object(
                    'instructor_id', pr.instructor_id, 'student_id', pr.student_id,
                    'ranks', jsonb_build_object('fighters', pr.rank_fighters,
                      'helicopters', pr.rank_helicopters, 'transport_ff', pr.rank_transport_ff),
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
