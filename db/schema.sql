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
-- ENTER ON BEHALF (round 4): the admin can fill in ANYBODY's form through the
-- admin_* on-behalf RPCs. They share the owner's validation path exactly
-- (wa.write_record / wa.write_proposal), and what they write is stamped
-- entered_by='admin' server-side — the tag the whole UI renders as "ADMIN".
-- ROUND 8 — THE ADMIN'S EDITS PREVAIL (supersedes the round-4b reclaim rule):
-- an entry the admin created or modified is LOCKED for its owner. The owner's
-- save must carry every one of them through fact for fact and no longer
-- strips the stamps (wa.carry_stamps refuses a payload that alters or drops
-- one, by name); the admin can still edit or delete his own, and editing an
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
-- ROUND 4b — WHAT they write, not what they submit: an admin save is DIFFED
-- against the stored record (wa.stamp_record_diff), so adding one line to a
-- student's 17 self-reported entries stamps that one line and leaves the other
-- 17 self-reported. The record-level flag is derived from the entries
-- (wa.record_stamp) and means "contains admin-entered data", never "is an admin
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
language plpgsql set search_path = public, wa, pg_temp as $$
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

-- ── ROUND 19 — THE INSTRUCTOR'S OWN RECORD ────────────────────────────────
-- The mirror of public.student_records, one table over: a student reports his
-- own training, and from this round an instructor reports his own CURRENCY —
-- the flights he flew and the 3-01 events they exercised. Same shape for the
-- same reasons: ONE jsonb per person, sections inside it, every count derived
-- and nothing typed; whitelisted keys, a read-time strip and a cap per section
-- (wa.ins_entry_keys / wa.ins_strip_entry / wa.ins_section_cap).
--
-- WHY A SECOND TABLE AND NOT A COLUMN ON public.proposals. A proposal is keyed
-- (instructor, student) — it is a statement ABOUT SOMEBODY ELSE, and there are
-- as many of them as there are students. A currency row is a statement about
-- the instructor HIMSELF, and there is exactly one record of them per person.
-- Hanging it off a proposal would tie an instructor's flying to whichever
-- student happened to be first in a list, and would lose it the day that
-- student left. One row per instructor is the shape the data actually has.
--
-- NO `entered_by` COLUMN, AND THAT IS THE RULING (round 19). The admin can
-- enter a STUDENT's record on their behalf because he is transcribing a form
-- somebody filled in on paper. He cannot enter an instructor's currency: it is
-- a claim about who flew what, and the only person who can make it is the
-- person who flew. The admin's on-behalf form therefore shows this section
-- READ-ONLY and says why — so there is no stamp to carry, no diff to stamp,
-- and no way for a currency claim to arrive with anybody else's hand on it.
create table if not exists public.instructor_records (
  instructor_id uuid primary key references public.people(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  last_update   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
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
-- 'admin' = the admin entered this row FOR the owner; null = the owner
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

-- ══ ROUND 18 — ASSESSMENTS ARE OPEN FOR ONE CLASS AT A TIME ════════════════
-- COMMAND RULING (2026-08-26), verbatim: «Τωρα τελειωνουν της 98Β, οποτε μονο
-- για αυτους θελω προτασεις. Στο μελλον θα επιλεγουμε για ποια ταξη θα
-- στελνουμε προτασεις αξιοποιησης με το WA στους εκπαιδευτες. Θελουμε την
-- σειρα την οποια τελειωνει, οχι ολες τις ενεργες.»
--   «98B is finishing now, so I want proposals only for them. In future we will
--    CHOOSE which class we send utilization proposals to the instructors for.
--    We want the class that is FINISHING, not every active one.»
--
-- WHY A SETTING AND NOT A COLUMN. This is not a fact about a person, a record
-- or an assessment — it is a fact about the SQUADRON'S CALENDAR, one value for
-- the whole installation, and it changes about three times a year. A column on
-- `people` would ask every row to carry the same answer; a per-instructor flag
-- would let two instructors be asked about two different classes, which is
-- exactly the thing the ruling forbids. One row in one tiny table is the
-- lightest shape that is also the correct one.
--
-- WHY IN SCHEMA `wa` AND NOT `public`. PostgREST reaches `public` and nothing
-- else, so a table here needs no RLS policy, no revoke, no deny-by-default
-- boilerplate: it is unreachable by construction, and the ONLY way in or out is
-- the RPC pair below. The lockdown block further down does not have to grow.
--
-- NULLABLE = NONE. `value is null` (or the row absent) means NO class is open:
-- the instructor form lists nobody and every write is refused. That is a real
-- state the admin can choose — between two classes there is genuinely nobody to
-- assess — and it is stored as the absence of an answer rather than as a magic
-- string, because a magic string is a class name somebody could one day create.
create table if not exists wa.settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_touch_settings on wa.settings;
create trigger trg_touch_settings before update on wa.settings
  for each row execute function wa.touch_updated_at();

create or replace function wa.setting(p_key text) returns text
language sql stable set search_path = public, wa, pg_temp as $$ select value from wa.settings where key = p_key $$;

-- THE SCOPE, NORMALISED ONCE. Everything that gates on it reads THIS — the
-- dataset filter, the write refusal and the admin's own read-back — so an
-- empty string, a stray space and a missing row cannot mean three things.
create or replace function wa.assessment_class() returns text
language sql stable set search_path = public, wa, pg_temp as $$
  select nullif(btrim(coalesce(wa.setting('assessment_class'), '')), '')
$$;

-- IS THIS STUDENT IN SCOPE? ONE definition, two callers that must never drift:
-- wa.instructor_dataset (which students the form LISTS) and wa.write_proposal
-- (which students may be WRITTEN). If these two ever disagreed, the form would
-- show a card whose Save is refused, or hide a student whose assessment lands.
-- A student with NO CLASS RECORDED is never in scope — the scope is a class
-- NAME, and a person carrying no name to match cannot match one. Give them
-- their class under People & links and they join the class they belong to.
create or replace function wa.student_in_scope(s public.people) returns boolean
language sql stable set search_path = public, wa, pg_temp as $$
  select wa.assessment_class() is not null
     and nullif(btrim(coalesce(s.class, '')), '') = wa.assessment_class()
$$;

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
--     invalidate a link the admin has already distributed.
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

drop trigger if exists trg_touch_ins_records on public.instructor_records;
create trigger trg_touch_ins_records before update on public.instructor_records
  for each row execute function wa.touch_updated_at();

-- ── LOCKDOWN: no direct table access, RLS deny-by-default ──────────────────
alter table public.people             enable row level security;
alter table public.student_records    enable row level security;
alter table public.proposals          enable row level security;
alter table public.instructor_records enable row level security;

revoke all on public.people             from public, anon, authenticated;
revoke all on public.student_records    from public, anon, authenticated;
revoke all on public.proposals          from public, anon, authenticated;
revoke all on public.instructor_records from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ══ ROUND 24 (P45-WA) — THE BRIDGE LANE: THREE TABLES, ALL IN SCHEMA `wa` ═══
-- PHASES 4+5 of the FDMS bridge open a SECOND writer on public.student_records:
-- the squadron's own scheduler, pushing the flights it already recorded into
-- the student's log. Three tables carry it, and every one of them lives in
-- schema `wa` for the reason wa.settings gives in its own comment: PostgREST
-- reaches `public` and nothing else, so a table here needs no policy and no
-- revoke to be unreachable — it is unreachable BY CONSTRUCTION, and the only
-- way in or out is the RPC pair at the bottom of this file.
--
-- THAT IS THE ANSWER TO THE SHARPEST FINDING OF THE PHASE-4/5 ADVERSARIAL READ
-- (2026-08-28, must-fix 2). The design drafted `public.bridge_tombstones`; on
-- Supabase a new PUBLIC table is reachable through the REST surface, so a
-- tombstone could have been READ (rid = oid ∷ sortie ∷ ord — training data),
-- FORGED (a forged tombstone silently suppresses the push lane for any
-- identity: a targeted data-withholding attack that needs no token at all) or
-- DELETED (which un-gates it). Moving them one schema over removes the door
-- rather than locking it. RLS + revoke are applied anyway, belt and braces, and
-- THE r24 AUDIT BLOCK AT THE FOOT OF THIS FILE FAILS THE DEPLOYMENT if a future
-- round ever grants anything on them, moves one out of schema `wa`, drops its
-- RLS, gives it a policy, or widens one of its vocabularies away from the
-- registry it mirrors. It reads pg_class / pg_constraint / relacl — the
-- CATALOG, not this file — so what it asserts is true of the DATABASE.
-- (WA-24 verify finding 9a: the two sentences that used to stand here promised
-- exactly that block while no such block existed — the «comment that lied»
-- class rounds 22b and 23b were spent on. It exists now; search this file for
-- «r24:».)
--
-- ── 1. THE CREDENTIAL — DIGEST ONLY, AND IT IS NOT A PERSON ────────────────
-- The bridge is not a member of the squadron and must never be listable as
-- one. A fourth `wa_role` value would have to ride an `alter type` (which
-- cannot run inside this file's do-blocks and cannot be used in the same
-- transaction that references it), and a `people` row would leak into
-- wa.person_json, into every export and into admin_list_people — which prints
-- TOKENS. So the credential is one row in a table of its own, storing only the
-- SHA-256 digest of a token the database never sees again.
--   · wa.auth cannot match it (it is not in public.people), so a stolen bridge
--     token opens public.bridge_pull and public.bridge_push and structurally
--     nothing else — not one admin RPC, not one owner RPC, not one login token.
--   · The plaintext exists exactly once, in the answer to admin_bridge_mint,
--     on the admin's own screen. The database CANNOT echo what it never
--     stored — which is a stronger guarantee than the §4φ rule it serves
--     («καμία εντολή δεν επιστρέφει ποτέ στήλη token», now also true of
--     `token_sha256`, which is a digest and still never returned).
--   · ONE credential at a time, and ROTATION IS MINTING: the new digest
--     overwrites the old, so every holder of the old token is out at its next
--     call. Revoke is one switch that closes every lane at once.
--
-- ACTIVE ⇒ THERE IS A DIGEST (WA-24 verify finding 10·4). Without the CHECK the
-- table accepted `active = true` beside `token_sha256 is null`: authentication
-- refuses such a row correctly (NULL matches no digest — proven live), but
-- admin_bridge_status would have printed «active since …» for a credential that
-- CANNOT AUTHENTICATE — a status surface lying about the one fact it exists to
-- report. It is the house's own presence-before-membership discipline written
-- into the table: the state «armed» is not expressible without the thing that
-- arms it. The other direction stays legal on purpose — a digest with
-- active=false is exactly what REVOKE leaves behind, and it is what lets
-- `revoked_at` mean something.
create table if not exists wa.bridge_access (
  id           int primary key default 1 check (id = 1),   -- exactly one row
  token_sha256 text,                    -- hex digest; null = never minted
  active       boolean not null default false,
  minted_at    timestamptz,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  constraint bridge_access_armed_chk check (not active or token_sha256 is not null)
);

-- ── 2. TOMBSTONES — A DELETION IS NEVER AN ABSENCE ─────────────────────────
-- «this identity does not come back on its own.» An FDMS undo or a deleted
-- source event crosses the wire as a REMOVE op, which deletes the bridge's own
-- row and lays a tombstone here. The FDMS side excludes a tombstoned identity
-- from its derived push queue, so an undo STICKS against the five-second
-- auto-push debounce instead of being re-created one beat later; the only
-- clearance is an explicit, confirmed re-push (`clear_tombstone`), which sets
-- cleared_at and is logged on both sides.
-- THE KEY IS THE `rid` — the FDMS-side, DATE-FREE identity of the attempt
-- (oid ∷ band ∷ node ∷ ord). The (sortie, date, seq) handle travels with it for
-- the human reading the report, but it is NOT the identity: a date correction
-- moves the handle and must not resurrect the tombstone.
-- IT NEVER LOCKS THE STUDENT OUT. Nothing on the owner's save path reads this
-- table — a tombstone is a fact about the BRIDGE's intentions, never a claim
-- over a row the student typed.
--
-- ── THE KEY IS THE ROSTER OID, AND IT SURVIVES THE PERSON (verify finding 3c)
-- The first draft keyed the gate on `student_id … on delete cascade`, and the
-- verify proved live what that costs: lay two tombstones, delete the person,
-- and NOTHING REMAINS — so admin_delete_person followed by a re-create on the
-- SAME external_oid resurrects every undone push at the next auto-push cycle.
-- The gate has to outlive the row it was laid against, and it can, because the
-- identity it gates is not a WA uuid at all: the `rid` is FDMS's own and it
-- CARRIES the roster object id. So `student_oid` is the key (people.external_oid
-- is UNIQUE — round 9), the uuid stays beside it as a convenience handle and is
-- NULLED, not cascaded, when the person goes. A student deleted and re-created
-- on the same oid meets the same tombstones; one re-created on a DIFFERENT oid
-- is a different student to the bridge and his rids differ too, so nothing
-- stale can attach to him either.
create table if not exists wa.bridge_tombstones (
  id          uuid primary key default gen_random_uuid(),
  student_oid text not null,                        -- THE KEY: people.external_oid
  student_id  uuid references public.people(id) on delete set null,  -- handle only
  -- THE VOCABULARY IS SPELLED OUT, AND IT IS AUDITED (verify finding 10·5).
  -- The literals are written here on purpose — the proposals_level_chk
  -- precedent, verbatim: «a CHECK that called a function could be silently
  -- widened by redefining the function». What was missing was the other half:
  -- nothing tied the spelled-out list back to the registry it mirrors, so a
  -- future round widening wa.log_bands() would get a tombstone table that
  -- silently refuses the new band. The r24 audit block at the foot of this file
  -- reads BOTH out of the catalog and fails the deployment if they disagree.
  -- MIRROR: wa.log_bands() · wa.bridge_reasons() below.
  section     text not null constraint bridge_tombstones_section_chk
                            check (section in ('flights', 'fs')),
  sortie      text not null,
  -- THE HANDLE IS GUARDED LIKE EVERY OTHER DATE AND SEQ IN THIS FILE (verify
  -- finding 3b): the first draft took date='12/08/2026' and seq=-7 without a
  -- murmur. The date literal is the ISO pattern of wa.is_iso_date and the seq
  -- bounds are the ones wa.validate_record asks of a flight row
  -- (wa.chk_int(e->'seq', …, 1, 20)); both are audited against their mirrors at
  -- the foot of this file for the reason the section list is.
  date        text not null constraint bridge_tombstones_date_chk
                            check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  seq         int  not null default 1 constraint bridge_tombstones_seq_chk
                            check (seq >= 1 and seq <= 20),
  rid         text not null,
  reason      text not null constraint bridge_tombstones_reason_chk
                            check (reason in ('undo', 'source_removed', 'developer')),
  at          timestamptz not null default now(),
  cleared_at  timestamptz
);
-- ONE LIVE TOMBSTONE PER (student oid, rid) — the shape of the fact, asserted.
-- WHAT THIS INDEX DOES AND DOES NOT DO (verify finding 5, the comment corrected).
-- It makes a SECOND live tombstone for one identity impossible. It does NOT make
-- a replayed remove idempotent: a unique index turns a duplicate into an ERROR,
-- never into a no-op, and under the round's own «per-row outcomes are VERDICTS,
-- not exceptions» rule an exception here would void every sibling op of the same
-- push. Idempotency is therefore the CALLER's, and public.bridge_push is written
-- to carry it: its remove branch answers a replay with the verdict `unchanged`
-- BEFORE it writes, and lays its tombstone `on conflict … do nothing` so a race
-- that beats the check is absorbed rather than raised. The index is the fence;
-- the verdict is the behaviour.
create unique index if not exists bridge_tombstones_live
  on wa.bridge_tombstones (student_oid, rid) where cleared_at is null;
create index if not exists bridge_tombstones_at on wa.bridge_tombstones (at desc);

-- ── 3. THE AUDIT — EVERY OP, ITS VERDICT, AND NO NAMES ─────────────────────
-- One row per operation, whatever the operation did (a refused push is exactly
-- as interesting as an accepted one). NO NAMES AND NO GRADES: the person is the
-- roster's object id, the flight is its handle, and the reason a row was
-- refused is its FIELD PATH, never the value that failed. The tail of this
-- table travels in bridge_pull and in admin_export, so both sides can render
-- «what Wings Ahead remembers happening» beside «what the FDMS ledger claims» —
-- and a drift between the two is a report line, never a silence.
--
-- `op` AND `verdict` ARE DELIBERATELY UNCONSTRAINED, and that is the opposite
-- ruling from the tombstone table two blocks up — for the opposite reason. A
-- tombstone is a LIVE GATE that the push lane consults, so a value outside the
-- vocabulary would be a gate nobody can reason about. This is a LOG of what
-- happened. A vocabulary CHECK on a log makes the history unwritable the day the
-- vocabulary changes, and — worse — makes an old, honest row unreadable by a
-- future constraint validation. What the ROUND guarantees instead is at the
-- writer: public.bridge_push only ever writes wa.bridge_ops() / wa.bridge_verdicts()
-- values, and it is the only writer there is.
create table if not exists wa.bridge_audit (
  id          bigint generated by default as identity primary key,
  at          timestamptz not null default now(),
  student_id  uuid references public.people(id) on delete set null,
  student_oid text,
  op          text not null,
  section     text,
  sortie      text,
  date        text,
  seq         int,
  rid         text,
  verdict     text not null,
  note        text
);
create index if not exists bridge_audit_at on wa.bridge_audit (at desc);

-- BELT AND BRACES over «unreachable by construction». Schema `wa` is already
-- revoked from public/anon/authenticated at the top of this file, so none of
-- the three is addressable through PostgREST at all; RLS with no policy is the
-- second lock and the explicit revoke is the third. The SECURITY DEFINER RPCs
-- run as the owner and are unaffected (the pattern public.people has carried
-- since round 1). THE r24 AUDIT BLOCK AT THE FOOT OF THIS FILE asserts all of
-- it against the CATALOG — schema, RLS, policy count, relacl and the sequence —
-- so a future round cannot loosen it by accident. (It is real: WA-24 verify
-- finding 9a caught this sentence promising a block nobody had written.)
alter table wa.bridge_access     enable row level security;
alter table wa.bridge_tombstones enable row level security;
alter table wa.bridge_audit      enable row level security;
revoke all on wa.bridge_access     from public, anon, authenticated;
revoke all on wa.bridge_tombstones from public, anon, authenticated;
revoke all on wa.bridge_audit      from public, anon, authenticated;
revoke all on all sequences in schema wa from public, anon, authenticated;

-- ── auth / validation helpers (schema wa — unreachable from the API) ───────
create or replace function wa.auth(p_token text) returns public.people
language plpgsql stable set search_path = public, wa, pg_temp as $$
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
language plpgsql stable set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth(p_token);
  if v.role <> p_role then
    raise exception 'WA: forbidden — this action requires the % role', p_role;
  end if;
  return v;
end $$;

-- ── THE BRIDGE'S OWN DOOR (round 24 / P45-WA) ──────────────────────────────
-- The mirror image of wa.auth, and deliberately NOT a branch of it: this one
-- looks the caller up in a table public.people is not, so the two credentials
-- can never be confused for one another in either direction. A bridge token
-- fails wa.auth (it is not a person); the admin token fails this (its digest is
-- not the stored one). A wrongly pasted credential is therefore a NAMED refusal
-- at setup time, never a working-but-overprivileged bridge.
--
-- ONE SENTENCE FOR ALL FOUR FAILURES — never minted, wrong token, revoked, and
-- (verify finding 4, the one cosmetic seam of the fragment) A TOKEN TOO SHORT
-- TO BE ONE. The short-token path used to answer «WA: invalid bridge token»,
-- which is a DIFFERENT sentence and therefore an oracle: it discloses that a
-- length floor exists and where it is, and it gives the legitimate caller who
-- fat-fingered a paste no instruction at all. Telling the four apart would let
-- a holder of nothing learn whether a credential exists and whether it was
-- withdrawn; ONE sentence says what to DO, which is the only thing a legitimate
-- caller needs. The length test stays — it is what stops a null or a stray ""
-- reaching digest() — it simply no longer speaks in its own voice.
--
-- IT IS `volatile`, AND THAT IS LOAD-BEARING (must-fix 1 of the 2026-08-28
-- adversarial read). It touches last_used_at, and PostgREST runs a STABLE
-- function inside a READ ONLY transaction — a `stable` bridge_pull over this
-- would have failed with «cannot execute UPDATE in a read-only transaction» on
-- EVERY call, including the setup test, bricking onboarding with a Postgres
-- error where the design promised the server's own sentence.
--
-- ── THE READ-ONLY GUARD, AND THE CLAIM THAT USED TO STAND HERE (P45-WAb, F3)
-- WHAT THESE TWO LINES ASSERTED AS FACT: «a volatile function is POST-only on
-- PostgREST, so the token travels in the request BODY and can never be smeared
-- through a URL or a proxy log.» THE ROUTER DOES NOT REFUSE THE GET. It accepts
-- `GET /rest/v1/rpc/bridge_pull?p_token=…`, runs the volatile function inside a
-- READ ONLY transaction — and the two outcomes DIFFERED, which is worse than
-- the smear the sentence was worrying about:
--   · a bad token raised the house sentence below BEFORE the last_used_at
--     UPDATE was ever reached                                    → HTTP 400
--   · a LIVE token passed the comparison, reached the UPDATE, and died on the
--     transaction («cannot execute UPDATE in a read-only transaction»)
--                                                                → HTTP 405
-- THE STATUS CODE ALONE THEREFORE SEPARATED A LIVE CREDENTIAL FROM A WRONG, A
-- REVOKED OR AN ABSENT ONE — the exact distinction wa.bridge_refusal_msg exists
-- to erase, defeated on one verb by a router nobody asked. And the token did
-- reach the request LINE, so the half of the sentence about proxy logs was
-- false as written too.
--
-- SO THE FUNCTION REFUSES WHAT THE ROUTER WOULD NOT, AND IT REFUSES IT FIRST —
-- before the length test, before digest(), before wa.bridge_access is read.
-- Nothing has been compared when this raises, so there is nothing for the
-- answer to disclose: every GET gets ONE sentence and ONE status, whatever it
-- carries — live, dead, revoked, absent, empty. And the sentence says the one
-- thing a legitimate caller who put his credential in a URL has to change.
--
-- WHY THE GUARD LIVES HERE AND NOT IN THE TWO DOORS (the judgement, recorded).
-- wa.auth_bridge is the FIRST statement of public.bridge_pull and of
-- public.bridge_push, and it is the lane's only entrance. Guarding it once means
-- a third door opened by a later round INHERITS the guard instead of having to
-- remember it; guarding it in each door would be two spellings of one rule, and
-- two spellings of one rule is exactly what the sentence below was made a
-- function to avoid. Same doctrine, one notch up.
--
-- WHAT IT DOES NOT CLAIM. The same 400/405 split is INHERITED by every other
-- volatile RPC in this file — public.admin_regenerate_token is the plainest of
-- them and has behaved this way since round 1 — so a GET of one still tells a
-- good ADMIN token from a bad one. Closing that is a wider round than this one,
-- and it is written down here rather than left implied. What P45-WAb closes is
-- the BRIDGE lane: the one lane whose headline discipline is «one sentence for
-- every failure», and the only credential in this application that travels
-- between two machines with no human and no browser in front of it.
--
-- `extensions` on the path for digest(), the wa.gen_token precedent.
-- THE SENTENCE ITSELF IS A FUNCTION, for the wa.admin_lock_msg reason exactly:
-- it is said in more than one place (here, and by public.bridge_pull /
-- bridge_push when they refuse a caller who never authenticated), and one
-- definition cannot drift from itself. The POST-only sentence is NOT a function
-- for the same reason inverted: it is said once, at the one entrance, and a
-- second caller of it would be the bug.
create or replace function wa.bridge_refusal_msg() returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select 'WA: invalid or revoked bridge token — the bridge credential is minted by the admin on the People page, under Bridge, and it is shown exactly once'
$$;

create or replace function wa.auth_bridge(p_token text) returns void
language plpgsql volatile set search_path = public, wa, extensions, pg_temp as $$
begin
  -- THE VERB, BEFORE THE CREDENTIAL. A read-only transaction is how PostgREST
  -- runs a GET, and answering a GET at all is what made the status code an
  -- oracle. This raises with nothing compared and nothing read.
  if current_setting('transaction_read_only', true) = 'on' then
    raise exception '%', 'WA: the bridge doors are POST-only — call rpc/bridge_pull and rpc/bridge_push with POST and the credential in the request BODY, never as a URL parameter';
  end if;
  if p_token is null or length(p_token) < 24
     or not exists (select 1 from wa.bridge_access
                     where active
                       and token_sha256 = encode(digest(p_token, 'sha256'), 'hex')) then
    raise exception '%', wa.bridge_refusal_msg();
  end if;
  update wa.bridge_access set last_used_at = now() where id = 1;
end $$;

-- ── THE BRIDGE VOCABULARIES — REGISTRIES, LIKE EVERY OTHER CLOSED LIST ─────
-- Three closed lists the lane speaks in. They are functions and not literals
-- scattered through bridge_push for the reason wa.missions() and
-- wa.flight_kinds() are: a vocabulary spelled out twice is a vocabulary that
-- can disagree with itself, and the r24 audit block at the foot of this file
-- asserts the tombstone table's spelled-out CHECK against wa.bridge_reasons()
-- so the ONE place a literal is still written down cannot drift from the list.
--
-- WHY THE THREE ARE SERVER-SIDE ONLY, recorded as a judgement and not an
-- omission: the house rule is «a registry gets BOTH mirrors» — SQL and
-- app/app.js — and it exists because a CLIENT that hardcodes a vocabulary
-- drifts from the server that judges it. No Wings Ahead surface renders an op,
-- a verdict or a removal reason: the ops are written by FDMS, the verdicts are
-- read by FDMS, and the only WA surface that touches the lane is the People
-- page's Bridge card, which prints booleans and dates. The value that DOES
-- reach a WA surface is the per-entry stamp 'fdms', and that one has both its
-- mirrors (wa.entry_count_by / WA.srcOf, WA.FDMS_TAG).
create or replace function wa.bridge_ops() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['upsert','remove']::text[]
$$;
create or replace function wa.bridge_reasons() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['undo','source_removed','developer']::text[]
$$;
-- THE VERDICT LIST — every answer one op can get, and there is no other.
--   created / moved / updated / removed  the write happened (audited)
--   unchanged                            the row already said exactly this, or
--                                        the tombstone was already lying there:
--                                        a replay, absorbed, never an exception
--   exists_student / exists_admin        a HUMAN's row stands at that handle —
--                                        returned in full, and NOTHING written
--                                        (the bridge can never write over one
--                                        whatever it sends, so its facts buy no
--                                        route in and buy the report both
--                                        versions)
--   exists_fdms                          a row THE BRIDGE ITSELF wrote holds the
--                                        handle and this op has not shown it may
--                                        replace it: a move aiming at it, an
--                                        upsert claiming nothing, or a `prev`
--                                        whose facts are not the standing row's
--                                        (P45-WAc F1). The row is NOT handed
--                                        back — `"row": null` — because
--                                        describing a bridge row is what
--                                        authorises overwriting it
--   missing                              `prev` named a bridge row that is gone
--                                        (the admin deleted it — his custody)
--   tombstoned                           the identity is tombstoned; only an
--                                        explicit clear_tombstone re-push returns
--   refused                              the op itself is malformed, or the
--                                        section would not validate with it —
--                                        THIS op is refused, its siblings land
create or replace function wa.bridge_verdicts() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['created','moved','updated','removed','unchanged',
               'exists_student','exists_admin','exists_fdms',
               'missing','tombstoned','refused']::text[]
$$;

create or replace function wa.is_iso_date(t text) returns boolean
language plpgsql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when t is null then null else
    btrim(regexp_replace(translate(t, U&'\00a0\200b\feff', '   '), '\s+', ' ', 'g')) end
$$;
create or replace function wa.norm_code(t text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$ select upper(wa.norm_line(t)) $$;
create or replace function wa.norm_free(t text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when t is null then null else
    regexp_replace(regexp_replace(translate(t, U&'\00a0', ' '), '^\s+', ''), '\s+$', '') end
$$;

-- WHICH RULE A FIELD GETS, BY ITS NAME. The name is the same wherever the
-- field appears (a flight_code is a flight_code in fail, almost_good, fpc and
-- cef alike), so this classification also covers the superseded v1 section
-- names the read-time migration still accepts.
create or replace function wa.code_fields() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['flight_code','sortie','slot','evaluation']::text[]
$$;
create or replace function wa.free_fields() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['note','result','phase','comment']::text[]
$$;

-- the rule this field's name earns, applied to one string
create or replace function wa.norm_str(p_key text, t text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when p_key = any(wa.code_fields()) then wa.norm_code(t)
              when p_key = any(wa.free_fields()) then wa.norm_free(t)
              else wa.norm_line(t) end
$$;

-- one value of one field, normalised. Non-strings pass through untouched
-- (a grade stays a number, `ng` stays a boolean, json null stays null);
-- a list of strings — items[] — is normalised element by element.
create or replace function wa.norm_field(p_key text, v jsonb) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
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
--
-- ══ P45-WAe — THE DISPATCH IS SAID HERE, NOT CALLED ONCE PER FIELD ═════════
-- THE MEASUREMENT THAT FORCED THIS (44 records / 2 200 flight rows / 4 109
-- entries, the round's scratch dataset, local stack): this function is reached
-- ~4 100 times per export and it used to call wa.norm_field once per FIELD —
-- ~53 000 calls — and every one of those is a FULL EXECUTOR INVOCATION.
-- WHY IT CANNOT BE INLINED AWAY, which is the fact the whole round turns on:
-- PostgreSQL's SQL-function inliner (inline_function) refuses ANY function that
-- carries a `SET` clause, and «set search_path = public, wa, pg_temp» is on
-- every wa helper by house rule (the round-20 audit at the foot of this file
-- FAILS THE DEPLOYMENT without it). So in this schema a helper call in a
-- per-field loop is never free and never will be: 53 000 of them cost 1.7 s of
-- a 3 s statement budget, measured, and that is 1.7 s no reader ever asked for.
--   wa.norm_entry, shipped (call per field)   2 195 ms / 4 109 entries
--   wa.norm_entry, this version                 380 ms   (5.7×)
--
-- WHAT IS DUPLICATED, EXACTLY, AND WHAT IS NOT. The CASE below is wa.norm_field's
-- own CASE with its two cheap arms taken here and its one expensive arm — the
-- items[] list, which needs a sub-select over an SRF — still DELEGATED to it.
-- The string arm is wa.norm_str's CASE, likewise: the REGISTRIES (wa.code_fields
-- / wa.free_fields) and the three RULES (wa.norm_code / wa.norm_free /
-- wa.norm_line) are called, never copied, so a field that changes class or a
-- rule that changes shape still changes in exactly one place.
-- AND THE DUPLICATION IS MACHINE-CHECKED, not remembered: an audit block at the
-- foot of this file asserts wa.norm_entry(jsonb_build_object(k, v))->k ≡
-- wa.norm_field(k, v) across every field class × every jsonb type, and FAILS THE
-- DEPLOYMENT if the two ever disagree. That is the r22 withsp_markers pattern
-- applied to a pair of expressions instead of a pair of registries — the house
-- answer to a mirrored rule, and the only one that survives a later round.
create or replace function wa.norm_entry(e jsonb) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when jsonb_typeof(e) <> 'object' then e else
    coalesce((select jsonb_object_agg(t.k, case
                when t.v is null                  then 'null'::jsonb
                when jsonb_typeof(t.v) = 'string' then to_jsonb(
                       case when t.k = any(wa.code_fields()) then wa.norm_code(t.v #>> '{}')
                            when t.k = any(wa.free_fields()) then wa.norm_free(t.v #>> '{}')
                            else                                  wa.norm_line(t.v #>> '{}') end)
                when jsonb_typeof(t.v) = 'array'  then wa.norm_field(t.k, t.v)
                else t.v end)
              from jsonb_each(e) t(k, v)), '{}'::jsonb) end
$$;

-- a whole record: every entry of every section. Applied at BOTH boundaries,
-- so the validator, the storage and the read all see the same string.
create or replace function wa.norm_record(p jsonb) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
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
language plpgsql immutable set search_path = public, wa, pg_temp as $$
begin
  if not p_ok then
    raise exception 'WA: invalid payload — % (%)', p_msg, p_where;
  end if;
end $$;

create or replace function wa.chk_text(v jsonb, p_where text, p_required boolean, p_max int)
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then
    perform wa.chk(not p_required, p_where, 'required text missing');
    return;
  end if;
  perform wa.chk(jsonb_typeof(v) = 'string', p_where, 'must be text');
  perform wa.chk(length(v #>> '{}') <= p_max, p_where, format('text longer than %s chars', p_max));
end $$;

create or replace function wa.chk_date(v jsonb, p_where text, p_required boolean)
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then
    perform wa.chk(not p_required, p_where, 'required date missing');
    return;
  end if;
  perform wa.chk(jsonb_typeof(v) = 'string' and wa.is_iso_date(v #>> '{}'),
                 p_where, 'date must be ISO YYYY-MM-DD');
end $$;

create or replace function wa.chk_bool(v jsonb, p_where text)
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
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
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    perform wa.chk(not p_required, p_where, 'required grade missing');
    return;
  end if;
  perform wa.chk(jsonb_typeof(v) = 'number', p_where, 'grade must be a number');
  n := (v #>> '{}')::numeric;
  perform wa.chk(n >= 0 and n <= 100, p_where, 'grade out of range 0-100');
  -- P45-WAe — the sentence is composed only when it is going to be raised.
  -- This helper runs on every graded row of every section (2 200 flight rows
  -- on the round's scratch record set), and the trailing-zero trim it prints
  -- was being computed for all of them to say nothing.
  if n <> trunc(n) then
    perform wa.chk(false, p_where,
                 format('grades are whole numbers — %s is not accepted (round it, e.g. %s)',
                        trim(trailing '.' from trim(trailing '0' from n::text)),
                        round(n)::text));
  end if;
end $$;

-- a row that came from a v1 record and could not be completed by the read-time
-- migration (no date stored, no evaluation identity). It is accepted on write
-- so the student can save the rest of the form without losing it; the UI asks
-- for the missing field and drops the flag the moment it is supplied.
create or replace function wa.is_legacy(e jsonb) returns boolean
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when jsonb_typeof(e->'legacy') = 'boolean'
              then (e->>'legacy')::boolean else false end
$$;

-- EVERY entry carries its own date (round-3 rule: no manually typed counts
-- anywhere) — the only exception is an un-completable legacy row.
create or replace function wa.chk_entry_date(e jsonb, p_where text)
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
begin
  perform wa.chk_bool(e->'legacy', p_where || '.legacy');
  perform wa.chk_date(e->'date', p_where || '.date', not wa.is_legacy(e));
end $$;

-- list of short strings (FAIL / ALMOST GOOD items[])
create or replace function wa.chk_str_list(v jsonb, p_where text, p_min int, p_max int, p_len int)
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['C4590','C4790','C5090','C5490','I4490','I4890','F4690','N4690']::text[]
$$;

-- 1-based position of a checkride in the syllabus order · null when unknown
create or replace function wa.eval_pos(p_id text) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['GT-WSGES','GT-INITIAL','GT-FLYPRIN','GT-AERO-CRM','GT-METEO-BA','GT-INSTR','GT-IFRNAV-GPS','GT-CO110','GT-CO109','GT-FORM','GT-VFRNAV','GT-GENBRIEF']::text[]
$$;

create or replace function wa.lesson_courses(p_group text) returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['CO190','JP190','IN190','IN290','FO190','TACFOR590','NA190','LNAV790']::text[]
$$;

-- JP190 is «Exams on Flight physiology (foreign SPs only)» — conditional, so
-- it is NOT OWED by a HAF student. (FDMS's own SchedReady never reads the
-- flag and leaves JP190 pending for ever; that defect is not mirrored here.)
create or replace function wa.exam_conditional(p_id text) returns boolean
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['C4790-91-S1','C4801-04-S1','C4901-05-S1','C5201-04-S1','C5301-04-S1','F4301-06-S1','F4301-06-S2','F4501-03-S1']::text[]
$$;

-- ── ROUND 22 — THE SORTIE CODES A SOLO SLOT CAN HOLD ───────────────
-- RULING (2026-08-28): «Έβαλα την C4791 και έκανα save. Γιατί δεν
-- ανανεώνεται στον πίνακα Flights;» — the solo slot and the Flights row for one
-- sortie were two books for one flight. The CHECKRIDE PRECEDENT closes it:
-- the fact is stored ONCE, in the Solo flights section, and the Flights table
-- RENDERS it. These two arrays are what the refusal is judged against.
--   solo_slot_codes  — the union of the slots' own pickers: every code any
--     fixed solo slot can hold. A stored flights row naming one of these is
--     refused only when THIS record's solo section already holds it, because
--     a candidate that was not flown solo WAS flown dual and its row is true.
--   solo_only_codes  — a SOLO BY DEFINITION: the section REQUIRES its solo
--     and its picker offers no alternative, so nobody ever flies that code
--     dual. Refused always, by name, exactly as a checkride is. Derived here
--     as `req and slots_of_section >= len(codes)`, so a section that ever
--     prescribed 2 solos over 2 candidates would join it with no new code.
-- MIRROR: app/app.js → WA.soloSlotCodes() / WA.soloOnlyCodes().
create or replace function wa.solo_slot_codes() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['C4791','C4802','C4803','C4902','C4903','C4904','C5202','C5203','C5302','C5303','F4301','F4302','F4303','F4304','F4305','F4501','F4502']::text[]
$$;

create or replace function wa.solo_only_codes() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['C4791']::text[]
$$;
-- ▲▲ GENERATED BLOCK ▲▲

-- ══ THESE FOUR ROUNDS' FUNCTIONS LIVE **OUTSIDE** THE GENERATED BLOCK ═════
-- ROUND 22 — A RELOCATION, AND THE TRAP IT DEFUSES. Rounds 14, 15, 18 and 19
-- each added a HAND-WRITTEN function between the GENERATED-BLOCK markers above,
-- where it read naturally beside the exams and the roster it belongs to. But
-- tools/gen-items-catalog.py REPLACES EVERYTHING BETWEEN THOSE MARKERS: the
-- next run of the generator — a syllabus correction, a new sortie — would have
-- deleted all eight of them silently, and the deploy would have failed far
-- from the cause (or, worse, succeeded against an older cloud that still had
-- them). Nothing about them is generated, so they are moved out; the file
-- order is unchanged relative to each other and every one of them still
-- follows the functions it calls.
-- The generator now also emits the search_path pin it used to drop (which
-- would have failed the round-20 audit on the very next run), so the two
-- halves of this file can no longer contradict each other by accident.

-- ══ ROUND 14 — THE WEEKLY SERIES, AND HOW MANY TRIALS AN EXAM MAY HAVE ═════
-- «στα ground exam να εχουμε 2nd trial, 3rd και να μπορουμε να βαλουμε τα ΕΕΘ
--  με ΕΕΘ 1, ΕΕΘ 2 κλπ»
-- Two different things, stored differently because they ARE different:
--   · a TRIAL is another attempt AT ONE OF THE EIGHT. Same exam, sat again, so
--     it keeps the exam's identity and adds a number: `trial` 2 or 3. THE FIRST
--     TRIAL IS WRITTEN AS NO KEY AT ALL, which is what makes every record from
--     before this round correct without being rewritten.
--   · a Weekly exam is a WEEKLY THEORY EXAM — an OPEN series the syllabus does
--     not enumerate, so it names no exam and carries `series` + `series_no`.
-- NOT part of the generated block: WA_EXAMS / wa.exam_ids() come out of the
-- syllabus sources and the weekly exams are not in them. They are the
-- squadron's own weekly programme, declared here by hand, on purpose.
-- MIRROR: app/app.js → WA.EXAM_SERIES / WA.EXAM_TRIALS.
--
-- ══ ROUND 18 — THE SERIES IS CALLED «WEEKLY» ON EVERY SURFACE ══════════════
-- COMMAND RULING (2026-08-26), verbatim: «τα ερωτηματολογια ΕΕΘ 1,2,3 να τα
-- βαλουμε ως Weekly 1,2,3» — «the ΕΕΘ questionnaires 1,2,3, let us put them as
-- Weekly 1,2,3». So: ΕΕΘ → **Weekly**, everywhere a human reads it — row
-- labels, the mint button, badges, tips, the confirmation dialog, the printed
-- brief, the CSV, the admin table and the refusals below.
--
-- THE STORED KEY DOES NOT MOVE, and that is the whole design of this rename.
-- `series` is still the literal 'EETH' in every record, in the CHECK this
-- function feeds, and in the payload the client sends. NOT ONE ROW IS
-- MIGRATED: a record written in round 14 renders as «Weekly 3» the moment the
-- new client loads, because the number was always the name and the WORD was
-- always looked up. A rename that rewrote the key would have to touch every
-- stored record to change a caption, and would leave any instance running an
-- older client unable to read its own data.
-- THE VISIBLE NAME LIVES IN ONE FUNCTION (wa.series_label), mirroring
-- WA.EXAM_SERIES[].label — so the next rename is two lines, not thirty.
create or replace function wa.exam_series() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$ select array['EETH']::text[] $$;
create or replace function wa.series_label(p_series text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when p_series = 'EETH' then 'Weekly' else coalesce(p_series, '?') end
$$;
create or replace function wa.exam_trials() returns int
language sql immutable set search_path = public, wa, pg_temp as $$ select 3 $$;

-- ══ ROUND 15 — THE GROUND-EXAM PASS MARK IS 80 % ══════════════════════════
-- COMMAND WORDING (2026-08-21): «80% για εξετασεις εδαφους, 60% για πτησεις.
-- Πλεον εχουμε κανει και το mapping.» That closes round 12b's open item («THE
-- GROUND-EXAM PASS MARK IS DELIBERATELY NOT DECIDED — one number, or two
-- different exams with two right numbers?») in favour of TWO: a πτήση is
-- judged at 60 by ΠΔ 151/13 and ΠΔ 29/2020, a ground exam at 80, and FDMS has
-- always called that second number `exam_pass_pct`.
-- IT APPLIES TO BOTH SHAPES: the eight fixed ground exams AND the Weekly
-- series, which are ground exams too and are marked the same way.
--
-- THE SERVER RECORDS THE NUMBER AND JUDGES NOTHING WITH IT, and that is not an
-- omission — it is round 12b's shape unchanged. The exams branch of
-- wa.validate_record checks the grade's SHAPE (wa.chk_grade: a whole number
-- 0-100) and stores it; no server function collapses an exam grade into a
-- pass, a mission or a state. wa.grade_passed / wa.grade_mission are called
-- ONLY from wa.eval_operative (checkrides) and the flights / fs branch of the
-- validator respectively, and neither reaches an exams row. Which TRIAL of a
-- re-sat exam is operative is decided on the client (WA.examOperativeIx),
-- exactly as it was in round 14 — no round-15 behaviour moved to the server.
-- The constant lives here so the two halves cannot drift and so the FDMS
-- bridge has one server-side number to join on. If a later round makes the
-- server judge an exam, this is the function it must call.
-- The FREEZE-PER-EXAM-AT-ENTRY principle (an exam judged by the mark in force
-- on the day it was sat) is a BRIDGE FINGERPRINT on the FDMS side, not a WA
-- constant: this function is the one LIVE number and has no history.
-- MIRROR: app/app.js → WA.EXAM_PASS_MIN / WA.passMin / WA.gradePassed(g,sec).
create or replace function wa.exam_pass_min() returns numeric
language sql immutable set search_path = public, wa, pg_temp as $$ select 80::numeric $$;

-- did this ground-exam grade PASS? — the exams' own question, at the exams'
-- own mark. It is the mirror of WA.gradePassed(g, 'exams') and, like the
-- constant above, it is declared and not yet called: nothing on the server
-- judges an exam. wa.grade_passed(g) remains the FLIGHT question at 60.
create or replace function wa.exam_passed(g numeric) returns boolean
language sql immutable set search_path = public, wa, pg_temp as $$
  select g is not null and g >= wa.exam_pass_min()
$$;

-- ══ ROUND 14 — SENIORITY ORDER ════════════════════════════════════════════
-- «τους εκπαιδευτες με σειρα αρχαιοτητας. HAF πρωτα, ITAF μετα.»
-- Every list of instructors the application produces is ordered by this key and
-- by nothing else. Two levels: the AIR FORCE (HAF, then ITAF, then any other
-- named one alphabetically, then whoever the roster gave no country), and
-- within each the CALL SIGN in NATURAL order — a 2 before a 14, never the
-- string order that puts the 14 first. The call sign and not the rank decides,
-- because the call sign IS the squadron's own position while the rank is a
-- grade; this is the FDMS Currency precedent unchanged.
-- WHICH CALL SIGN COMES FIRST IS NOT WRITTEN ANYWHERE (round 19, the FDMS
-- round-18 privacy lesson applied here): the order falls out of the `call_sign`
-- values the roster itself holds, so no literal in this file names a real call
-- sign and no comment says which officer holds which one. Whoever has no call
-- sign sorts LAST WITHIN THEIR OWN AIR FORCE, by surname.
-- It lives on the SERVER as well as in the client because the instructor
-- picker's payload is surnames and nothing else — no country and no call sign
-- ever leave the database for a student — so the ORDER is the only way the
-- ruling can reach that list at all.
-- MIRROR: app/app.js → WA.seniorityKey / WA.bySeniority.
create or replace function wa.natkey(s text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select coalesce((
    select string_agg(case when t.m[1] ~ '^[0-9]+$' then lpad(t.m[1], 8, '0') else t.m[1] end,
                      '' order by t.ord)
    from regexp_matches(upper(coalesce(s, '')), '[0-9]+|[^0-9]+', 'g')
         with ordinality as t(m, ord)), '')
$$;
create or replace function wa.seniority_key(p_country text, p_call_sign text,
                                            p_last_name text, p_first_name text)
returns text language sql immutable set search_path = public, wa, pg_temp as $$
  with x as (select upper(btrim(coalesce(p_country, ''))) as c,
                    btrim(coalesce(p_call_sign, '')) as cs)
  select (case x.c when 'HAF' then '0' when 'ITAF' then '1'
                   when '' then '3' else '2' end)
      || '|' || (case when x.c in ('HAF', 'ITAF', '') then '' else x.c end)
      || '|' || (case when x.cs = '' then '1' else '0' end)
      || '|' || wa.natkey(x.cs)
      || '|' || upper(coalesce(p_last_name, ''))
      || '|' || upper(coalesce(p_first_name, ''))
  from x
$$;
-- the same key straight off a people row — the form every ORDER BY uses
create or replace function wa.seniority_key(p public.people) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select wa.seniority_key(p.country, p.call_sign, p.last_name, p.first_name)
$$;

-- ══ ROUND 19 — THE INSTRUCTOR'S OWN CURRENCY (the FDMS bridge lane) ════════
-- RULING (2026-08-26), verbatim: «στο link που θα στέλνουμε σε κάθε εκπαιδευτή
-- θέλω να μπορεί να περάσει κι εκείνος, πέρα από την αξιολόγηση, κάποια δική
-- του πτήση S και τα αντίστοιχα Ε. Επίσης να μπορεί να περάσει Ε και σε μια
-- πτήση με μαθητή πέρα από τις S. Αυτό θα είναι μια γέφυρα για το currency του
-- FDMS.»
--
-- WHAT A ROW IS. An instructor's currency row is a CLAIM ABOUT HIS OWN FLYING:
-- on this DAY he flew — either a sortie of his own (kind 'own') or a sortie
-- with a student (kind 'student') — in the AIR or in the SIMULATOR (category
-- 'aeros' / 'fs'), and it exercised these EVENTS (e_items[], possibly none).
-- `seq` tells two flights of the same day apart, exactly as it does on a
-- student's log row.
--
-- WHAT A ROW IS NOT. It is NOT the student's flight. A 'student' row does not
-- reference a student, a record or a proposal: the flight itself lives on the
-- student's side and is entered there by the student. This row is the
-- instructor's own currency claim about the same hour of the same day, and
-- keeping the two unlinked is what makes the sections independently correct —
-- neither can corrupt the other, and revoking one link touches neither.
--
-- AND THERE IS NO SORTIE CODE, DELIBERATELY (the round-19 judgement). The R12
-- flight-kind pattern — a closed syllabus list with an off-catalogue escape —
-- was considered and refused for two reasons the form makes plain. (a) The
-- syllabus catalogue is the STUDENT's Phase-II flow chart; an instructor's own
-- Σ sortie under Πίνακας 9 has no code in it at all, so the box would be
-- empty-by-nature on half the rows, and a field that is meaningless for half
-- its rows teaches its user to skip it on the other half. (b) FDMS's currency
-- cell is dated by DATE and E-ITEM and by nothing else (scheduler-spec §11:
-- «μία έξοδος στο κελί, κατά τη δική της ημερομηνία · δατάρει και Ε άλλων
-- στηλών»), so a code would be a field this bridge carries and its destination
-- never reads. House minimalism decided the rest: this section has no note
-- field either.
--
-- ══ ROUND 21 (§4x) — CONTINUATION / WITH SP, AND THE SORTIE RETURNS FOR ONE
-- KIND. RULING (2026-08-28): «Στο flight επιλογές Continuation, With SP. …
-- Όταν η επιλογή είναι With SP να ανοίγουν οι πτήσεις των μαθητών, έξτρα
-- repeat, fcf, cef.»
--
-- THE STORED KEYS MOVE — 'own' → 'continuation', 'student' → 'with_sp' — and
-- the judgement is recorded: the cloud instructor_records table is EMPTY
-- (verified 27/08/2026, restated below at the migration), so a permanent
-- translation layer («stored 'own', shown Continuation») would be a tax paid
-- forever to spare a migration that costs two CASE arms. The house owns the
-- mechanism (wa.migrate_ins_entry, read-time, idempotent), and stored keys
-- that say what the surfaces say is the round-20 doctrine — no two
-- vocabularies for one fact.
--
-- AND §4u·2 IS SUPERSEDED FOR with_sp ONLY: reason (a) above dies the moment
-- the sortie field exists only on the kind where it is always meaningful (a
-- flight WITH a student always has the student's sortie), and reason (b) was
-- argued about the instructor's OWN Σ rows, which keep their Σ category and
-- take no sortie. A Continuation row still refuses a sortie BY NAME.
create or replace function wa.currency_kinds() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$ select array['continuation','with_sp']::text[] $$;

-- the printed name of a kind — the SQL twin of the client's labels
-- (app/app.js → WA.CURRENCY_KINDS), written once so the export and any reader
-- of it never hardcodes the ids the way it never hardcodes a Σ slug.
create or replace function wa.currency_kind_label(p_id text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case p_id
    when 'continuation' then 'Continuation'
    when 'with_sp' then 'With SP'
    else null end
$$;

-- ROUND 21 — THE THREE MARKERS a with-SP row may carry in its `sortie` box
-- beside the student syllabus codes: they ARE the R12 flight-kind ids, stored
-- in the SAME field as the codes (lowercase words cannot collide with the
-- ^[A-Z]\d{4}$ code shapes), so they need no new vocabulary and line up 1:1
-- with the student row's `kind` values for the bridge join (§4x·6). A SUBSET
-- of wa.flight_kinds(), deliberately: without 'syllabus' (a syllabus flight is
-- named by its code) and without 'other' (the off-catalogue free text IS the
-- other).
create or replace function wa.withsp_markers() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['repeat','fcf','cef']::text[]
$$;

-- THE TWO PROGRAMMES, IN THE NAMES THE 3-01 PRINTS FOR THEM. «ΑΕΡΟΣ» is the
-- semester AIR programme (Πίνακας 9) and «F/S» the semester SIMULATOR one
-- (Πίνακας 6) — the two sections the FDMS currency card opens with and closes
-- on. They are STORED as ASCII keys and only ever SHOWN in the printed Greek,
-- the same terminology bridge the Weekly tip makes for the ΕΕΘ.
--
-- ROUND 20 — AND A ROW NO LONGER STORES ONE. RULING (2026-08-27): «θα έπρεπε να
-- έχουμε ποια S είναι και δυνατότητα πολλαπλών Ε. Αφού θα τροφοδοτούν το ίδιο
-- σχήμα με το FDMS να τα έχουμε σωστά.» A row now names its Σ CATEGORY and the
-- programme is DERIVED from it (wa.s_category_group), so the two can never
-- disagree — no row can claim a Σ-3 flown in the simulator, because nothing
-- stores the two facts separately any more. This list survives as the
-- vocabulary of the DERIVED value: it is what the group function returns, what
-- the export labels its two sections with, and what every surface prints.
create or replace function wa.currency_categories() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$ select array['aeros','fs']::text[] $$;

-- the printed name of a programme — one function, so the refusals, the export
-- and the tooltips cannot disagree about what «fs» is called on paper
create or replace function wa.currency_category_name(p_id text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case p_id
    when 'aeros' then 'ΑΕΡΟΣ — the semester air programme (Πίνακας 9)'
    when 'fs' then 'F/S — the semester simulator programme (Πίνακας 6)'
    else null end
$$;

-- ▼▼ CURRENCY GENERATED BLOCK — tools/gen-currency-catalog.py — DO NOT EDIT BY HAND ▼▼
-- Generated from the FDMS instructor-currency research file:
--   2026-08-14  (D:/FDMS/data/requirements/instructor_currency.json)
-- MIRROR: app/currency-catalog.js, written by the same run of the same script.
--
-- THE E-ITEMS OF THE 3-01/2025 ΔΑΕ — the EVENTS table of Ch.4 §48 (PDF 105-107).
-- An instructor's currency row names the events his sortie exercised, and this
-- is the closed list it may name: an id outside it is refused ON WRITE, BY NAME,
-- because a currency claim nobody can look up in the 3-01 is a claim that cannot
-- be audited. The STORED value is the ASCII id — never the printed Greek code,
-- whose Ε and α are homoglyphs of Latin E and a and could not be retyped.
--
-- 27 of the catalog's 28 e-items are here. The one that is not, by name:
--   e-1d-demo — Chapter 5 of the 3-01 — the display pilot's own currency, which FDMS shows only to the instructor who holds the post.
create or replace function wa.e_item_ids() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array[
    'e-1a-aerobatics',
    'e-1b-spin',
    'e-1c-aircraft-test-fcf',
    'e-2-practice-forced-landing',
    'e-3-in-cloud-flight',
    'e-4-ifr-approach',
    'e-5-formation-descent',
    'e-6c-landing-light-off-night',
    'e-9a-no-flap-approach',
    'e-9c-heavy-aircraft-approach',
    'e-10a-foreign-airfield',
    'e-10b-both-runway-directions',
    'e-14a-live-weapons-air-to-ground',
    'e-14b-live-weapons-air-to-air',
    'e-18-formation-takeoff',
    'e-21-flight-300ft',
    'e-30a-high-altitude-intercept-day',
    'e-31a-low-altitude-intercept-day',
    'e-32-bfm',
    'e-40-training-munitions-release',
    'e-41a-range-firing-day',
    'e-45-visual-delivery-med-hi-apex-day',
    'e-46-visual-delivery-low-apex-day',
    'e-49a-has-day',
    'e-49c-las-day',
    'e-62-oca-strike',
    'e-67-cas'
  ]::text[]
$$;

-- the printed name of one e-item — the refusal says WHICH event it could not
-- find, in the words the 3-01 prints, not a slug the instructor never typed
create or replace function wa.e_item_name(p_id text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case p_id
    when 'e-1a-aerobatics' then 'Ε-1α — Aerobatics (Ακροβατικά)'
    when 'e-1b-spin' then 'Ε-1β — SPIN'
    when 'e-1c-aircraft-test-fcf' then 'Ε-1γ — Aircraft test flight (FCF / Δοκιμή Α/Φ)'
    when 'e-2-practice-forced-landing' then 'Ε-2 — Practice forced landing (Εικονική Αναγκαστική Π/Γ)'
    when 'e-3-in-cloud-flight' then 'Ε-3 — Flight inside cloud (Πτήση εντός νεφών)'
    when 'e-4-ifr-approach' then 'Ε-4 — IFR approach (Προσέγγιση IFR)'
    when 'e-5-formation-descent' then 'Ε-5 — Descent in formation (Κάθοδος σε σχηματισμό)'
    when 'e-6c-landing-light-off-night' then 'Ε-6γ — Approach with landing light OFF (night)'
    when 'e-9a-no-flap-approach' then 'Ε-9α — Approach without FLAPS'
    when 'e-9c-heavy-aircraft-approach' then 'Ε-9γ — Approach with a heavy aircraft (Προσέγγιση με βαρύ Α/Φ)'
    when 'e-10a-foreign-airfield' then 'Ε-10α — Landing, touch & go or approach at a foreign airfield'
    when 'e-10b-both-runway-directions' then 'Ε-10β — Landing or approach on both runway directions'
    when 'e-14a-live-weapons-air-to-ground' then 'Ε-14α — Release of live air-to-ground weapons'
    when 'e-14b-live-weapons-air-to-air' then 'Ε-14β — Release of live air-to-air weapons'
    when 'e-18-formation-takeoff' then 'Ε-18 — Formation takeoff (Α/Γ σε σχηματισμό)'
    when 'e-21-flight-300ft' then 'Ε-21 — Flight at 300 ft (LOW ALTITUDE)'
    when 'e-30a-high-altitude-intercept-day' then 'Ε-30α — High-altitude interception, day (Υ.Α.Η.)'
    when 'e-31a-low-altitude-intercept-day' then 'Ε-31α — Low-altitude interception, day (Χ.Α.Η.)'
    when 'e-32-bfm' then 'Ε-32 — BFM (Basic Fighter Manoeuvres)'
    when 'e-40-training-munitions-release' then 'Ε-40 — Release of training munitions (Άφεση εκπαιδευτικών πυρομαχικών)'
    when 'e-41a-range-firing-day' then 'Ε-41α — Range firing, day (Π.ΒΟΛΗΣ (Η))'
    when 'e-45-visual-delivery-med-hi-apex-day' then 'Ε-45 — VISUAL DELIVERY MED/HI APEX, day'
    when 'e-46-visual-delivery-low-apex-day' then 'Ε-46 — VISUAL DELIVERY LOW APEX, day'
    when 'e-49a-has-day' then 'Ε-49Α — HAS (High Angle Strafe), day'
    when 'e-49c-las-day' then 'Ε-49Γ — LAS (Low Angle Strafe), day'
    when 'e-62-oca-strike' then 'Ε-62 — OCA (STRIKE)'
    when 'e-67-cas' then 'Ε-67 — CAS (Close Air Support)'
    else null end
$$;

-- ── THE Σ CATEGORIES (round 20) ─────────────────────────────────────────
-- WHICH SORTIE it was, not merely which table it belongs to. Πίνακας 9 has
-- 6 ΑΕΡΟΣ rows in it and Πίνακας 6 6 F/S rows, and «ΑΕΡΟΣ» names one of them
-- exactly as little as «a flight» names an aircraft. The programme is DERIVED
-- from the category (wa.s_category_group), so the two can never disagree.
--
-- 17 categories. What is in the list and is not a row of the 3-01:
--   x-night-students — the 3-01 prints no such requirement — FDMS carries it as a column of its own because the squadron flies it, and because a night sortie is what keeps the night-landing currency alive.
--   x-fcf-flight — a functional check flight is flown by the squadron's Test Pilots and is not a Πίνακας 9 requirement — FDMS carries it as a column of its own, and it is what dates the Ε-1γ row of the EVENTS table.
--   x-demo-flight — the 3-01 prints it in Chapter 5 — the display pilot's own sortie. FDMS carries demo as a table of its own, gated on the demo_pilot flag, and §37α counts it (with the FCF) inside Σ-1 for those available. Wings Ahead has no demo-pilot flag, so the option is MARKED, never hidden — the x-fcf reasoning, verbatim.
--   legacy-aeros-unspecified — a round-19 row that stored only the programme. The Σ was never recorded and cannot be guessed from a date — it is shown marked, everywhere, and needs the developer's hand.
--   legacy-fs-unspecified — a round-19 row that stored only the programme. The Σ was never recorded and cannot be guessed from a date — it is shown marked, everywhere, and needs the developer's hand.
-- And what the research file carries that is NOT a kind of sortie, by name:
--   sim-refresh-after-abstention — §49 prints a THRESHOLD IN DAYS, not a category — the sortie it demands is a SIM-1, which is in the list already.
--   semiannual-air-total-t6 — the printed ΣΥΝΟΛΟ ΕΞΟΔΩΝ row of Πίνακας 9 — a total is not a sortie anybody flies.
--   semiannual-fs-total-t6 — the printed ΣΥΝΟΛΑ row of Πίνακας 6 — a total is not a sortie anybody flies.
create or replace function wa.s_category_ids() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array[
    's-1-general-adaptation',
    's-2-pdo-day',
    's-2-pdo-night',
    's-3-air-to-ground',
    's-4-air-to-air',
    's-20-no-requirements',
    'x-night-students',
    'x-fcf-flight',
    'x-demo-flight',
    'legacy-aeros-unspecified',
    'sim-1',
    'sim-2',
    'sim-3',
    'sim-4',
    'sim-5',
    'sim-da',
    'legacy-fs-unspecified'
  ]::text[]
$$;

-- the printed name of one Σ category — the refusal names the category it could
-- not find in the words Πίνακας 6 / Πίνακας 9 print, never a slug
create or replace function wa.s_category_name(p_id text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case p_id
    when 's-1-general-adaptation' then 'Σ-1 — General Adaptation'
    when 's-2-pdo-day' then 'Σ-2 — Instrument flight (PDO), day'
    when 's-2-pdo-night' then 'Σ-2 — Instrument flight (PDO), night'
    when 's-3-air-to-ground' then 'Σ-3 — Air-to-Ground missions, day/night'
    when 's-4-air-to-air' then 'Σ-4 — Air-to-Air missions, day/night'
    when 's-20-no-requirements' then 'Σ-20 — No-requirements missions'
    when 'x-night-students' then 'Νυχτερινή με μαθητές — Night sortie flown with students'
    when 'x-fcf-flight' then 'Πτήση δοκιμής (FCF) — Aircraft test flight'
    when 'x-demo-flight' then 'Πτήση επίδειξης (DEMO) — Display flight (demo sortie)'
    when 'legacy-aeros-unspecified' then 'ΑΕΡΟΣ — unspecified (recorded before the Σ taxonomy)'
    when 'sim-1' then 'SIM-1 — Precision handling / ACRO (F/S)'
    when 'sim-2' then 'SIM-2 — IFR (F/S)'
    when 'sim-3' then 'SIM-3 — Air-to-Ground missions (F/S)'
    when 'sim-4' then 'SIM-4 — Air-to-Air missions (F/S)'
    when 'sim-5' then 'SIM-5 — Emergency procedures (F/S)'
    when 'sim-da' then 'SIM-ΔΑ — Aircraft test in the simulator (Test Pilots only)'
    when 'legacy-fs-unspecified' then 'F/S — unspecified (recorded before the Σ taxonomy)'
    else null end
$$;

-- WHICH PROGRAMME a category belongs to — 'aeros' (Πίνακας 9) or 'fs'
-- (Πίνακας 6). Round 19 STORED this; from round 20 it is derived, so a row
-- cannot claim a Σ-3 flown in the simulator.
create or replace function wa.s_category_group(p_id text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case p_id
    when 's-1-general-adaptation' then 'aeros'
    when 's-2-pdo-day' then 'aeros'
    when 's-2-pdo-night' then 'aeros'
    when 's-3-air-to-ground' then 'aeros'
    when 's-4-air-to-air' then 'aeros'
    when 's-20-no-requirements' then 'aeros'
    when 'x-night-students' then 'aeros'
    when 'x-fcf-flight' then 'aeros'
    when 'x-demo-flight' then 'aeros'
    when 'legacy-aeros-unspecified' then 'aeros'
    when 'sim-1' then 'fs'
    when 'sim-2' then 'fs'
    when 'sim-3' then 'fs'
    when 'sim-4' then 'fs'
    when 'sim-5' then 'fs'
    when 'sim-da' then 'fs'
    when 'legacy-fs-unspecified' then 'fs'
    else null end
$$;

-- THE LEGACY IDS — storable, never offered. A round-19 row carried a programme
-- and no category; the Σ cannot be guessed from a date, so the migration says
-- so in the id itself and every surface renders it marked.
create or replace function wa.s_category_legacy_ids() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['legacy-aeros-unspecified', 'legacy-fs-unspecified']::text[]
$$;
-- ▲▲ CURRENCY GENERATED BLOCK ▲▲

-- HOW MANY EVENTS ONE SORTIE MAY NAME. The ceiling is the catalogue itself:
-- a sortie cannot exercise an event twice, so more ids than the 3-01 prints is
-- not a busy sortie, it is a payload nobody typed.
create or replace function wa.e_item_cap() returns int
language sql immutable set search_path = public, wa, pg_temp as $$ select array_length(wa.e_item_ids(), 1) $$;

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
-- SCOPE (round 15): THIS IS THE FLIGHT'S NUMBER. It judges the two flight
-- logs, the checkrides, the solos and the FPC / CEF, and it does not move. A
-- GROUND EXAM is judged at 80 by wa.exam_pass_min() — «80% για εξετασεις
-- εδαφους, 60% για πτησεις» (2026-08-21) — and the printed FIVE-BAND SCALE
-- below is untouched by that ruling, because the bands are a CHARACTERISATION
-- and not a pass mark: a ground exam marked 78 is still «ΛΚ Λίαν Καλώς», it
-- simply does not pass a ground exam.
-- MIRROR: app/app.js → WA.GRADE_PASS_MIN / WA.GRADE_BANDS / WA.gradeBand /
-- WA.gradePassed. Change one, change the other.
create or replace function wa.grade_pass_min() returns numeric
language sql immutable set search_path = public, wa, pg_temp as $$ select 60::numeric $$;

create or replace function wa.grade_band(g numeric) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql stable set search_path = public, wa, pg_temp as $$
  select coalesce(jsonb_object_agg(k.id, coalesce(wa.eval_operative(p_rec, k.id), 'null'::jsonb)),
                  '{}'::jsonb)
  from unnest(wa.eval_ids()) k(id)
$$;

-- FAIL / ALMOST GOOD categories — the four syllabus tracks. 'other' is not
-- offered by the form; it only carries v1 free-text rows through migration.
create or replace function wa.item_cats() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['questionnaire','briefing','flight','fs','illness','other']::text[]
$$;

-- one NFS entry, given the reason it did not use to carry. A row written
-- before round 5 has only a free-text note — which is exactly the form's
-- «6. ΑΛΛΗ ΑΙΤΙΑ:» line, so it becomes reason 'other' with the note kept
-- verbatim. A row with neither reason nor note is flagged legacy: the form
-- asks which of the six causes it was and nothing is guessed for it.
create or replace function wa.nfs_reason_fix(e jsonb) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
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
-- blank, and it demands the reason in writing (§32δ(2): the Squadron CO
-- informs the student of the reasons he was put in ΚΕΠΕ).
-- MIRROR: app/app.js → WA.SMS_REASONS. Change one, change the other.
create or replace function wa.sms_reasons() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['sortie59','two63','airsickness','written','oral','instructor',
               'judgement']::text[]
$$;

-- one SMS entry, given the reason it did not use to carry (round 8).
-- Nothing is guessed: a row written before the rule keeps its note and is
-- flagged legacy, so it stays READABLE everywhere and the form asks which of
-- the seven it was before the record can be saved again — the standing
-- "keep it, ask for it" contract.
create or replace function wa.sms_reason_fix(e jsonb) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
-- ROUND 12b — THE USER'S REVIEW OF THE ABOVE (2026-08-20), verbatim:
--   «Μπορουμε αντι να το εχουμε σε αυτη την μορφη να ειναι σε πινακα με στηλες
--   και σειρες ολες τις πτησεις. Απλα για cef, fcf, repeat θα προσθετει εξτρα
--   γραμμες. Sorting με βαση τις ημερομηνιες. Δε θελω πεδιο note, Or a verdict
--   with no number. Θελω μονο mission complete, mission incomplete. Ομοιως για
--   μαθηματα και εξετασεις. Μη βαλεις εκπαιδευτη για μαθηματα και εξετασεις για
--   να ειναι απλο.»
-- What that changes on THIS side of the wire: `note` and `verdict` leave
-- wa.entry_keys for the flight logs, `mission` (complete / incomplete) replaces
-- the three-way verdict, and lessons / exams lose their instructor, their note
-- and — with them — the periods and attendance boxes the drawn table has no
-- cell for. The rest of this block stands as written. Nothing had shipped when
-- the review landed (the cloud schema was never re-run and the app was never
-- pushed), so the four sections are simply RESHAPED: no migration, no legacy
-- path, and a stored key that is no longer named is dropped on read by
-- wa.strip_entry like any retired one.
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
-- wa.slot_empty needs no branch for these four and the admin-entry arithmetic
-- ("1 of 18 entered by the admin") is not diluted by 133 placeholders.
--
-- the thirteen sections of a v2 record, in form order — the new four LAST,
-- which is where the directive puts them («ενα πινακα στο τελος»).
-- MIRROR: app/app.js → WA.COUNTED.
create or replace function wa.sections() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['nfs','sms','fail','almost_good','airsickness',
               'evaluations','solo_flights','fpc','cef',
               'flights','fs','lessons','exams']::text[]
$$;

-- the two bands, which are also the two log-flight section names
create or replace function wa.log_bands() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$ select array['flights','fs']::text[] $$;

-- HOW MANY ENTRIES ONE SECTION MAY HOLD. 200 was a flat literal until round 12
-- put the whole syllabus in reach of a record: 47 ground courses over several
-- blocks each, and 85 flights plus their re-flies, are legitimately more rows
-- than any earlier section could ever have. Payload size is not the constraint
-- (a flight row is ~180 bytes against a 400 000-byte ceiling); the cap is only
-- there to stop a runaway client.
create or replace function wa.section_cap(p_sec text) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['syllabus','repeat','fcf','cef','other']::text[]
$$;

-- ── THE MISSION (round 12b — the user's review of the table form) ─────────
-- «Or a verdict with no number. Θελω μονο mission complete, mission
-- incomplete. Ομοιως για μαθηματα και εξετασεις.»
--
-- Round 12's three-way verdict (pass / lagging / failed) is GONE. The squadron
-- asked for exactly two answers, and they are the two a sortie has when nobody
-- wrote a percentage: the mission was COMPLETE, or it was NOT. The three-band
-- distinction it replaces was the printed grade scale wearing a second name —
-- and where a grade exists that scale is already there, in the number.
--
-- WHERE IT MAY LIVE — unchanged doctrine, one word narrower:
--   · a grade exists  → the mission is DERIVED (wa.grade_mission) and a stored
--     one is REFUSED by name. A stored mission beside a stored grade is a
--     second source of truth that can contradict the first — the defect round
--     11 removed from the FPC.
--   · no grade, not NG → it may be SET BY HAND: the squadron characterised the
--     flight without a number, which is the whole reason the key exists. Left
--     empty it means the debrief has not landed yet.
--   · NG → neither. A familiarisation ride nobody was in a position to score is
--     not a mission verdict either.
create or replace function wa.missions() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select array['complete','incomplete']::text[]
$$;

-- THE TWO-WAY COLLAPSE of the printed five-band scale, at the SAME threshold
-- (ΠΔ 151/13: 60 % separates acceptable from unacceptable): excellent ·
-- very_good · good → complete; lagging · failed → incomplete.
-- MIRROR: app/app.js → WA.gradeMission.
create or replace function wa.grade_mission(g numeric) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case wa.grade_band(g)
    when 'excellent' then 'complete' when 'very_good' then 'complete'
    when 'good'      then 'complete'
    when 'lagging'   then 'incomplete'
    when 'failed'    then 'incomplete'
    else null end
$$;

-- SUPERSEDED BY THE TWO ABOVE, and dropped so no surface can call them back.
-- Nothing shipped ever stored a `verdict`: round 12 has not been pushed to
-- Pages and the cloud schema has not been re-run, so this replacement needs no
-- migration and leaves no legacy path behind it (a stored verdict on the local
-- demo stack is dropped on read by wa.strip_entry, like any retired key).
drop function if exists wa.grade_verdict(numeric);
drop function if exists wa.verdicts();

-- a whole number in a range, nullable. Round 12 wrote it for the ground-lesson
-- periods box; round 12b removed that box and the flight log's `seq` is now its
-- only caller — so it stays, and it is where a small counted integer belongs.
create or replace function wa.chk_int(v jsonb, p_where text, p_min int, p_max int)
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
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
returns void language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return; end if;
  perform wa.chk(jsonb_typeof(v) = 'number', p_where, 'duration must be a number');
  n := (v #>> '{}')::numeric;
  perform wa.chk(n > 0, p_where,
                 'a flown sortie lasted longer than nothing — leave the box empty while the time is not known yet');
  perform wa.chk(n <= 24, p_where,
                 'duration is DECIMAL HOURS, not minutes — 1.3 is one hour and eighteen minutes');
  -- P45-WAe — composed only when raised, for the wa.chk_grade reason exactly.
  if n <> round(n, 1) then
    perform wa.chk(false, p_where,
                 format('duration is recorded to one decimal (6-minute steps) — %s is not (round it, e.g. %s)',
                        trim(trailing '.' from trim(trailing '0' from n::text)),
                        trim(trailing '.' from trim(trailing '0' from round(n, 1)::text))));
  end if;
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
    -- ROUND 23 — `duration` JOINS THE TWO FIXED SECTIONS, under the SAME KEY
    -- the log rows use. RULING (2026-08-28, evening): «Να βάλουμε και το
    -- duration στις παράγωγες γραμμές.» One name buys wa.chk_duration, the
    -- client's WA.fieldText / durParse / durFix / [data-dur] handler, the CSV
    -- Hours column and the change list with no new code at all; a second name
    -- would need every one of them twice. Optional everywhere: null / absent is
    -- legal and the key never decides a state.
    -- THE REGISTRY ENTRY IS THE MIGRATION — absent ≡ null, so wa.migrate_record
    -- needs no branch. What the entry does is stop wa.strip_entry DESTROYING
    -- the key on the first read (the R19 lesson), which is why both mirrors
    -- land in the same commit as the first line that writes it.
    when 'evaluations'  then array['date','evaluation','with','grade','duration','legacy','entered_by']
    when 'solo_flights' then array['slot','sortie','date','ng','grade','instructor','duration','legacy','entered_by']
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
    --   mission         complete / incomplete — only where the grade is absent
    --                   and the row is not NG (wa.missions())
    -- ROUND 12b — `note` and `verdict` ARE GONE. «Δε θελω πεδιο note, Or a
    -- verdict with no number. Θελω μονο mission complete, mission incomplete.»
    -- Both are refused by name on write and dropped on read (wa.strip_entry).
    when 'flights'      then array['date','track','sortie','seq','kind','instructor',
                                   'instructor_oid','duration','grade','ng','mission',
                                   'legacy','entered_by']
    when 'fs'           then array['date','track','sortie','seq','kind','instructor',
                                   'instructor_oid','duration','grade','ng','mission',
                                   'legacy','entered_by']
    -- A GROUND LESSON IS A BLOCK, not a point: date = start, end_date = end,
    -- null = a single day. ROUND 12b — the row is GROUP · COURSE · START · END
    -- and nothing else: «Μη βαλεις εκπαιδευτη για μαθηματα και εξετασεις για να
    -- ειναι απλο», and the same review removed the note field everywhere. The
    -- periods and attendance boxes went with them — the table the user drew has
    -- four cells, and a key with no cell is a key nobody could ever edit. No
    -- grade either: a lesson is attended, not scored.
    when 'lessons'      then array['date','end_date','group','course','legacy','entered_by']
    -- THE EIGHT GROUND-EXAM GROUPS AND NOTHING ELSE. Four theory groups carry a
    -- nested exams[] (FF 190 · PT 190 · AΕ 190 · JX 190 · JX 191 · NA 191) which
    -- FDMS treats as COURSES OF THEIR GROUP — they belong in `lessons`, and
    -- filing them here as well would make the two systems disagree about what a
    -- student is owed. ROUND 12b: EXAM · DATE · GRADE, no examiner, no note.
    -- ROUND 14 — TRIAL and SERIES. `trial` is 2 or 3 and nothing else (the
    -- first trial is written as no key at all, so nothing stored before this
    -- round has to be rewritten); `series` + `series_no` are the Weekly
    -- theory exams, which name no `exam`. The two shapes are EXCLUSIVE and the
    -- validator refuses a row that tries to be both.
    when 'exams'        then array['date','exam','trial','series','series_no',
                                   'grade','legacy','entered_by']
    else array[]::text[] end
$$;

-- ── AN EMPTY FIXED SLOT (round 5) ─────────────────────────────────────────
-- Solo flights and evaluations are FIXED syllabus rows: the eight solos the
-- stage prescribes and the eight stage checkrides are present from the first
-- day, empty until they are flown. A slot nobody has flown yet is a
-- PLACEHOLDER, not an entry — it must not be counted, must not be stamped as
-- "entered by the admin", and must not demand a date it cannot have.
-- ROUND 23 — AND `duration` IS PART OF THE TEST, ON BOTH SHAPES. This is the
-- three-valued-logic seam of the round (the round-20b rule: presence before
-- membership), and it has one right answer. An ABSENT key and an explicit NULL
-- both read `is null` here, so NO STORED RECORD CHANGES STATE ON DEPLOY: no
-- record can carry the key today, because it was unregistered and therefore
-- stripped on every read. A row carrying ONLY a duration correctly stops being
-- an empty slot — a duration is a report about a flight that happened — and is
-- then asked for its date and its instructor by the rules that already exist,
-- the same shape as a grade typed on its own.
-- MIRROR: app/app.js → WA.slotEmpty.
create or replace function wa.slot_empty(p_sec text, e jsonb) returns boolean
language sql immutable set search_path = public, wa, pg_temp as $$
  select case
    when jsonb_typeof(e) <> 'object' then false
    when p_sec = 'solo_flights' then
      (e->>'slot') is not null and (e->>'date') is null and (e->>'grade') is null
      and (e->>'instructor') is null and (e->>'sortie') is null
      and (e->>'duration') is null
      and coalesce((case when jsonb_typeof(e->'ng') = 'boolean'
                         then (e->>'ng')::boolean else false end), false) = false
    -- ROUND 8: the pending tick is gone, so an evaluation slot is empty when
    -- it carries nothing but its identity — which is all it ever meant.
    when p_sec = 'evaluations' then
      (e->>'evaluation') is not null and (e->>'date') is null and (e->>'grade') is null
      and (e->>'with') is null and (e->>'duration') is null
    else false end
$$;

-- ══ ROUND 23 — THREE PREDICATES THAT NO LONGER EXIST, AND WHY ════════
-- RULING 2026-08-28 (evening) — ΜΑΡΚΑΡΙΣΜΑ, ΟΧΙ ΑΡΝΗΣΗ (spec §4y·11·1):
--   «Δεν υπάρχει διπλότυπο για την ίδια πτήση … Όπως είναι με το which-sortie
--    που μπορούμε να κάνουμε type είναι μια χαρά — θα μπαίνει ως έξτρα
--    γραμμή. Για να μην το πνίξουμε: ΜΑΡΚΑΡΙΣΜΑ ως ύποπτο, και το ξεδιαλύνουμε
--    μετά και μαζί.»
-- wa.solo_holder, wa.solo_twin and wa.solo_row_name existed for exactly THREE
-- refusals and for nothing else: the tier-1 solo-by-definition code in a
-- flights row, the tier-2 same-day duplicate, and the 22b solo PAIR. All three
-- became CLIENT MARKS in round 23 — the row is accepted, stored and rendered as
-- a suspect-marked EXTRA — so the three predicates are DROPPED here rather than
-- left standing with no caller: a predicate nobody calls is a rule nobody
-- enforces wearing the clothes of a rule, and the round after next re-wires the
-- refusal by accident. `drop function if exists` is idempotent under the ×2
-- ON_ERROR_STOP run.
-- WHAT REPLACES THEM: app/app.js → WA.soloHolderOf / WA.logRowFlag /
-- WA.soloPairSuspect, computed at render on all three surfaces. NOTHING IS
-- STORED for a suspect mark, on either side: it is a RELATION between two rows,
-- and a flag stored on one of them would survive the edit that resolved it.
-- WHAT DID NOT GO: wa.solo_only_codes() / wa.solo_slot_codes() and all three
-- r22 audit assertions. They are the GENERATED MIRROR of the client's mark set
-- (tools/gen-items-catalog.py emits the JS copy and the SQL copy in one run),
-- and asserting the SQL copy asserts the run — a code in solo_only that the flow
-- chart does not know would make the client mark a row for a sortie that does
-- not exist.
drop function if exists wa.solo_holder(jsonb, text, text);
drop function if exists wa.solo_twin(jsonb, int, text);
drop function if exists wa.solo_row_name(jsonb);

-- one entry, reduced to the keys its section allows (read-time repair)
--
-- ══ P45-WAe — THE REGISTRY IS READ ONCE PER ENTRY, NOT ONCE PER FIELD ══════
-- IDENTICAL OUTPUT, SAME SIGNATURE, SAME RULE — and 6.6× the speed, for one
-- reason: `where t.k = any(wa.entry_keys(p_sec))` sits in the WHERE of a scan
-- over jsonb_each, so wa.entry_keys was evaluated ONCE PER FIELD. p_sec is a
-- Param, not a constant, so nothing folds it; the pin blocks the inliner (see
-- wa.norm_entry for that whole story); and the function builds a 13-element
-- text[] from literals on every one of those calls. Measured on the round's
-- scratch dataset (4 109 entries, ~53 000 fields):
--   shipped (registry per field)   731 ms / 4 109 entries
--   this version (registry once)   109 ms
-- plpgsql rather than SQL because plpgsql is what has a LOCAL to read it into.
-- The early return is the same `jsonb_typeof(e) <> 'object'` test the SQL CASE
-- made, and it is written the same way round: a NULL e answers '{}' through the
-- aggregate below exactly as it did through the CASE's ELSE arm.
create or replace function wa.strip_entry(e jsonb, p_sec text) returns jsonb
language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare ks text[]; o jsonb;
begin
  if jsonb_typeof(e) <> 'object' then return '{}'::jsonb; end if;
  ks := wa.entry_keys(p_sec);
  select coalesce(jsonb_object_agg(t.k, t.v), '{}'::jsonb) into o
    from jsonb_each(e) t(k, v) where t.k = any(ks);
  return o;
end $$;

-- ── ONE SECTION, VALIDATED ON ITS OWN (round 24 / P45-WA) ─────────────────
-- The STUDENT RECORD's structural validation, per section: the v2 shape of
-- round 3 (a section is a LIST of dated entries, counts are derived and never
-- stored) plus the round-4 per-section key whitelist. It RAISES on violation,
-- in wa.chk's own sentence, naming the field path.
-- THE EXTRACTION, AND WHY IT IS THE FEATURE AND NOT A TIDY-UP. public.bridge_push
-- is a SURGEON, not a courier: it applies the FDMS ops to the STORED record
-- server-side and never asks a client to send the other eleven sections back.
-- It therefore must be able to validate exactly what it touched — `flights` and
-- `fs` — and nothing else. That is not an optimisation, it is the round's
-- load-bearing decision (design #3), and the local stack proves why: ONE of the
-- four stored student records FAILS wa.validate_record on its own migrated form
-- (an SMS entrance written before round 8 names no ΚΕΠΕ condition). A push
-- written as a read-modify-write of the whole record would be PERMANENTLY
-- REFUSED for that student — for a rule about a section the bridge does not
-- touch, cannot see and could never fix. Here, his flights push lands and his
-- SMS row stays exactly as unsaveable as it was, which is the truth.
--
-- IT IS THE SAME CODE, MOVED. wa.validate_record is now a loop over this
-- function and holds only what is genuinely about the WHOLE payload (the root
-- object test, the size cap, the section-name whitelist and the two renamed-key
-- refusals). Everything below — the per-entry chain, the cap, and the four
-- cross-row rules (solo slots, exam trials, the (track,sortie,date,seq) fence,
-- the evaluation order) — is the round-12 body verbatim, with `p->k` reading
-- `p_arr` and one indentation level removed. Behaviour-identical by
-- construction: the moved code never referenced `p` except as `p->k`, and the
-- loop that calls it walks wa.sections() in the same order, so the FIRST
-- refusal a bad payload meets is the same refusal it met before.
-- THE CAP TRAVELS WITH IT, deliberately (the adversarial read's item 10·5): the
-- 400-row wa.section_cap used to live in the generic loop, and an extraction
-- that left it behind would have let the surgeon grow a section past a limit the
-- form cannot.
create or replace function wa.validate_section(p_sec text, p_arr jsonb) returns void
language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare
  k text := p_sec;
  f text;
  e jsonb;
  i int;
  i2 int;
  w text;
  pos int;
  prev_id text;
  done boolean[];
  is_ng boolean;
  -- P45-WAe — the section's key whitelist, read ONCE for the whole array
  -- instead of twice per field of every row. See the KEY WHITELIST block at
  -- the foot of the entry loop for the measurement and the reasoning.
  ks text[];
begin
  perform wa.chk(jsonb_typeof(p_arr) = 'array', k, 'must be a list');
  -- ROUND 12: the flat 200 became wa.section_cap — the log tables can hold
  -- the whole syllabus and its re-flies, which no earlier section could.
  perform wa.chk(jsonb_array_length(p_arr) <= wa.section_cap(k), k, 'too many entries');
  ks := wa.entry_keys(k);
  for i in 0 .. coalesce(jsonb_array_length(p_arr), 0) - 1 loop
    e := p_arr->i;
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
      -- ROUND 23 — the CHECKRIDE's own HOURS, under the same rule and the
      -- same sentence as a flight-log row. «Να βάλουμε και το duration στις
      -- παράγωγες γραμμές»: the derived Flights row of a checkride reads it
      -- off THIS row, which is the one place it is stored. Optional: null /
      -- absent is legal and the key never decides a state.
      perform wa.chk_duration(e->'duration', w || '.duration');

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

      -- ══ ROUND 22b — THE FENCE THIS SECTION OWED (verify finding 2b) ══
      -- ══ ROUND 23 — AND THE PAIR THAT LEFT WITH THE RULING ════════════
      -- The solo picker offers the Training Section's candidates AND free
      -- text beside them, because the generated chart can lag reality; the
      -- rule below is what that opening may NOT be used for. It is asked
      -- only of a row that NAMES a sortie — presence before membership, the
      -- round-20b rule: an unflown slot names none, so it can neither be
      -- caught by it nor disarm it.
      --
      -- A CHECKRIDE IN A SOLO SLOT — the R12 sentence, one section over.
      --     `{"sortie": "C4590"}` was accepted here: stored, counted and
      --     exported while appearing NOWHERE in the Flights table, because
      --     WA.derivedSlots skips a checkride position on purpose — that
      --     position belongs to Evaluations, where the syllabus order and
      --     the pass-attempt rule apply to it. A checkride is flown WITH an
      --     evaluator; it can never be a solo, whoever typed it. STRUCTURAL:
      --     no true flight matches it, which is why it is still a REFUSAL.
      --
      -- WHAT LEFT: TWO SOLOS OF ONE SORTIE. 22b refused the pair by name
      -- (wa.solo_twin). RULING 2026-08-28 (evening), §4y·11·1: «Ένα solo που
      -- δεν πετάχτηκε σε μια ενότητα (λόγω καιρού) συνήθως πετιέται σε
      -- κάποιο repeat» — a genuine second solo of one code is a flight that
      -- happened, and this refusal refused it. Both rows are now KEPT,
      -- STORED and MARKED SUSPECT on the client (WA.soloPairSuspect,
      -- rendered at rest on BOTH rows), and the double record is untangled
      -- with the squadron. wa.solo_twin and wa.solo_row_name were dropped
      -- with it — see the round-23 block above wa.strip_entry.
      --
      -- THE JUDGEMENT ON THE REST OF THE FREE TEXT, recorded (spec §4y·10,
      -- pointer §4y·11·1): the CANDIDATE SET IS NOT FENCED. A solo of a
      -- sortie the chart did not mark `sc` is still a flight that happened,
      -- and refusing it would refuse the truth — the one thing this
      -- application must never do. Such a code is already bounded
      -- (wa.code_track: ^[BCIFN][0-9]{4}$, and its letter must match the
      -- slot's Training Section above) and, unlike a checkride, it makes no
      -- second book: the Flights position it names is DERIVED from this very
      -- row.
      -- KEEP IT, ASK FOR IT: a legacy row that breaks the rule is stored,
      -- read and shown exactly as it stands — what is refused is the SAVE,
      -- with the row named, so the owner is in front of the form when the
      -- question is asked. The way out is the row's own picker (a slot) or
      -- its ✕ (an additional solo).
      -- MIRROR: app/app.js → WA.soloIsCheckrideRefusal;
      --         app/student.js → buildPayload, the solo_flights branch.
      perform wa.chk(nullif(trim(coalesce(e->>'sortie', '')), '') is null
                     or not (upper(wa.norm_line(e->>'sortie')) = any(wa.eval_ids())),
                     w || '.sortie',
                     format('%s is one of the eight checkrides — a checkride is recorded in the Evaluations section, where the syllabus order and the pass-attempt rule apply to it, and it is flown WITH an evaluator: it can never be a solo. Choose the sortie this Training Section prescribes as its solo.',
                            upper(wa.norm_line(e->>'sortie'))));
      -- ROUND 23 — the SOLO's own HOURS, under the same rule and the same
      -- sentence as a flight-log row. Optional: null / absent is legal
      -- (wa.chk_duration returns on null), and the key never decides a
      -- state — a solo is complete on its date, its authorising instructor
      -- and either NG or a grade, exactly as it was.
      perform wa.chk_duration(e->'duration', w || '.duration');
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
      --
      -- ══ P45-WAe — THE TWO CATALOGUE CHECKS ASK BEFORE THEY COMPOSE ═══════
      -- wa.chk(ok, where, MSG) takes its sentence as an ARGUMENT, so an
      -- inline format() is built on every row whether the row is wrong or not.
      -- These two are the expensive pair of this branch: the band sentence
      -- calls wa.sortie_band FOUR times (twice in the test, twice in the two
      -- CASE arms of the message) and each of those is a full executor call
      -- into a 130-code catalogue. Measured on a 55-row `flights` section: the
      -- band check alone ~30 ms per validation — 30 of the 68 ms that were still
      -- left once the KEY WHITELIST below had been repaired (it was 216 ms
      -- before that). And public.bridge_push validates the whole section ONCE
      -- PER OPERATION, so a 25-op chunk paid all of it 25 times.
      -- The `if` is the same predicate, negated: wa.chk raises exactly when the
      -- test fails, so building the sentence only then is behaviour-identical —
      -- the refusal, its wording and its field path are unchanged, and the
      -- P45-WAe validator probe proves that message for message.
      if not (wa.code_track(e->>'sortie') is null or (e->>'track') is null
              or wa.code_track(e->>'sortie') = (e->>'track')) then
        perform wa.chk(false, w || '.sortie',
                     format('%s belongs to the %s track but this row is in the %s table — record it in that table instead',
                            upper(e->>'sortie'), wa.code_track(e->>'sortie'), e->>'track'));
      end if;
      -- BAND ⇄ CODE, the same doctrine one axis over. Nothing derives
      -- flights-from-F/S out of a code, so the generated catalogue is the
      -- only authority — and where it knows the code, it is a fact.
      if not (wa.sortie_band(e->>'sortie') is null
              or wa.sortie_band(e->>'sortie') = k) then
        perform wa.chk(false, w || '.sortie',
                     format('%s is %s sortie — it belongs in the %s tables, not the %s ones',
                            upper(e->>'sortie'),
                            case when wa.sortie_band(e->>'sortie') = 'fs' then 'a SIMULATOR' else 'an AIRCRAFT' end,
                            case when wa.sortie_band(e->>'sortie') = 'fs' then 'F/S' else 'Flights' end,
                            case when k = 'fs' then 'F/S' else 'Flights' end));
      end if;
      -- ONE FACT, ONE ROW. The eight checkrides have their own section,
      -- with the syllabus-order rule and the pass-attempt rule on them. A
      -- second row here would be a second grade for one flight, and the two
      -- can disagree — which is the corruption this app exists to prevent.
      perform wa.chk(not ((e->>'sortie') = any(wa.eval_ids())),
                     w || '.sortie',
                     format('%s is one of the eight checkrides — a checkride is recorded in the Evaluations section, where the syllabus order and the pass-attempt rule apply to it. Two rows for one flight would be two grades that can disagree.',
                            upper(e->>'sortie')));

      -- ══ ROUND 22 — AND THE SAME DOCTRINE FOR A SOLO, IN TWO TIERS ═══════
      -- ══ ROUND 23 — AND BOTH TIERS ARE NOW MARKS, NOT REFUSALS ═══════════
      -- RULING (2026-08-28), the user's own words: «Έβαλα την C4791 και
      -- έκανα save. Γιατί δεν ανανεώνεται στον πίνακα Flights;» A solo
      -- is recorded in the Solo flights section; the Flights table renders
      -- that record at the sortie's place in the flow chart and stores
      -- nothing. A row here for the same sortie MAY be the second book.
      --
      -- THE SET IS JUDGED FROM THE SYLLABUS, NOT ASSUMED, and the syllabus
      -- has two shapes (spec §4y·3; app/app.js carries the same judgement in
      -- prose). THE JUDGEMENT STANDS — it is still what decides WHICH
      -- SENTENCE a row wears; what it produces is no longer a refusal:
      --
      -- TIER 1 — A SOLO BY DEFINITION. A Training Section whose solo is
      --   REQUIRED and whose picker offers no alternative: the slot must be
      --   filled and only one code can fill it, so nobody flies that code
      --   dual, ever. Today that is exactly C4791, the stage's 1st SOLO.
      --   MARKED SUSPECT, by name.
      -- TIER 2 — A SOLO CANDIDATE. C4802 and C4803 are the two candidates
      --   of a four-sortie section prescribing ONE solo: whichever was not
      --   flown solo WAS flown dual, and its Flights row is the truth.
      --   Marking all 17 candidates by name would cry wolf on a real
      --   flight, so the mark fires only on the SAME-DAY shape: the same
      --   sortie on the same day as a flown solo of this record. A dual
      --   C4802 on another day is a second real sortie and wears no
      --   suspicion at all — it is the commonest TRUE shape in the syllabus.
      --
      -- RULING 2026-08-28 (evening) — ΜΑΡΚΑΡΙΣΜΑ, ΟΧΙ ΑΡΝΗΣΗ (§4y·11·1):
      -- «Όπως είναι με το which-sortie που μπορούμε να κάνουμε type είναι μια
      -- χαρά — θα μπαίνει ως έξτρα γραμμή. Για να μην το πνίξουμε:
      -- ΜΑΡΚΑΡΙΣΜΑ ως ύποπτο, και το ξεδιαλύνουμε μετά και μαζί.»
      -- A refusal here refused FLIGHTS THAT HAPPENED — a repeat flown in
      -- another section's slot, a genuine second solo («ένα solo που δεν
      -- πετάχτηκε … συνήθως πετιέται σε κάποιο repeat») — so the two
      -- tiers became MARKS. Nothing is refused, nothing is destroyed, and
      -- the double record is untangled with the squadron.
      -- THE ONE-TRUTH CORE IS UNTOUCHED: a filled solo still DERIVES its
      -- Flights position and the derived row still WINS it (WA.slotKey /
      -- WA.slotOwner), so a stored row for that sortie is always an EXTRA —
      -- now suspect-marked instead of refused. The two wa.chk calls that
      -- stood here, and wa.solo_holder with them, are gone; what stands in
      -- their place is a CLIENT computation on all three surfaces, because
      -- «this sortie appears twice» is a RELATION between two rows and a flag
      -- stored on one of them would outlive the edit that resolved it.
      -- MIRROR: app/app.js → WA.soloOnlySuspect / WA.soloSameDaySuspect /
      -- WA.logRowFlag; WA.slotKey / WA.slotOwner (unchanged, and load-
      -- bearing: they are why the position is still never claimed).

      -- WHICH FLIGHT OF THAT CODE ON THAT DAY. Deliberate, never derived:
      -- an array index is a POSITION and this is a FACT, and there is no
      -- (sortie, date) uniqueness rule here — a second turn on one day is a
      -- real thing, and a rule that refused it would refuse the truth.
      perform wa.chk_int(e->'seq', w || '.seq', 1, 20);

      -- THE KIND — closed list, 'syllabus' by default (see wa.flight_kinds)
      perform wa.chk_text(e->'kind', w || '.kind', false, 20);
      -- P45-WAe — asked before composed, as above: wa.flight_kinds() is a call
      -- and array_to_string over its answer is a string built for nobody.
      if not ((e->>'kind') is null or (e->>'kind') = any(wa.flight_kinds())) then
        perform wa.chk(false, w || '.kind',
                     format('unknown kind of flight — the list is %s',
                            array_to_string(wa.flight_kinds(), ' / ')));
      end if;

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
      -- the unambiguous identity, written by the admin's form path only for
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

      -- THE MISSION, AND WHERE IT MAY LIVE (round 12b). Only where the
      -- grade is absent and the row is not NG. Two answers, no third.
      perform wa.chk_text(e->'mission', w || '.mission', false, 20);
      -- P45-WAe — asked before composed. The second of the two is the one that
      -- matters most: its sentence calls wa.grade_mission on the row's grade,
      -- so the shipped spelling ran a catalogue lookup on EVERY flight of the
      -- record to build a sentence that applies to almost none of them.
      if not ((e->>'mission') is null or (e->>'mission') = any(wa.missions())) then
        perform wa.chk(false, w || '.mission',
                     format('unknown mission — %s', array_to_string(wa.missions(), ' / ')));
      end if;
      if not ((e->>'mission') is null or jsonb_typeof(e->'grade') <> 'number') then
        perform wa.chk(false, w || '.mission',
                     format('this row has a grade, so its mission is READ from it (%s %% is “mission %s”) — a stored mission beside a stored grade is a second source of truth that can contradict the first',
                            -- round-12 verify finding 1, kept: the grade is whole by
                            -- construction (chk_grade above), so it prints UNCHANGED —
                            -- the trailing-zero trim borrowed from chk_grade once turned
                            -- 100 into "1 %" here.
                            (e->>'grade'),
                            wa.grade_mission((e->>'grade')::numeric)));
      end if;
      perform wa.chk((e->>'mission') is null or not is_ng,
                     w || '.mission',
                     'a non-graded (NG) flight is not scorable at all — it carries neither a grade nor a mission');

      -- ROUND 12b — THE TWO RETIRED KEYS, REFUSED BY NAME. The generic
      -- whitelist below would answer "unknown field"; these say WHY, which
      -- is the ruling and not a typo report.
      perform wa.chk(not (e ? 'note'), w || '.note',
        'the note field was removed from the flight log — «Δε θελω πεδιο note»: a flight row is the flight, the date, who flew it, how long it lasted and how it went');
      perform wa.chk(not (e ? 'verdict'), w || '.verdict',
        'the three-way verdict (pass / lagging / failed) was replaced by MISSION — «Θελω μονο mission complete, mission incomplete»');

    elsif k = 'lessons' then
      -- ══ ROUND 14 — AN END DATE ALONE IS A VALID RECORD ═══════════════
      -- «τα μαθηματα να δεχομαστε και μονο end date για την καταγραφη»
      -- A lesson is a BLOCK: date = start, end_date = end. Round 12b asked
      -- for the START on every row, which meant a course that a student
      -- knows FINISHED on the 12th but cannot date the beginning of could
      -- not be recorded at all — and it is the exact row round 13's open
      -- item 2 named («a started ground lesson cannot be saved»): the ONLY
      -- partial state a two-date row has is an end without a start, and it
      -- was the one state the server refused. EITHER date is now enough;
      -- neither is still refused, because a lesson with no date at all says
      -- nothing that «this course is in the programme» does not already.
      -- This is the ONE section where chk_entry_date does not apply.
      perform wa.chk_bool(e->'legacy', w || '.legacy');
      perform wa.chk_date(e->'date', w || '.date', false);
      perform wa.chk_date(e->'end_date', w || '.end_date', false);
      perform wa.chk(wa.is_legacy(e)
                     or wa.is_iso_date(e->>'date')
                     or wa.is_iso_date(e->>'end_date'),
                     w || '.date',
                     'a ground lesson is recorded by its start date, its end date, or both — one of the two is required');
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
      -- ROUND 12b — THE SIMPLICITY RULING, REFUSED BY NAME. «Μη βαλεις
      -- εκπαιδευτη για μαθηματα και εξετασεις για να ειναι απλο» — and the
      -- same review took the note field with it. The periods and attendance
      -- boxes went too: the table the user drew is GROUP · COURSE · START ·
      -- END, and a key with no cell is a key nobody could ever edit.
      perform wa.chk(not (e ? 'instructor') and not (e ? 'instructor_oid'),
        w || '.instructor',
        'a ground lesson does not name an instructor — «Μη βαλεις εκπαιδευτη για μαθηματα και εξετασεις για να ειναι απλο»');
      perform wa.chk(not (e ? 'note'), w || '.note',
        'the note field was removed — «Δε θελω πεδιο note»');
      perform wa.chk(not (e ? 'periods') and not (e ? 'absent'), w || '.periods',
        'a ground lesson row is GROUP · COURSE · START · END — the periods and attendance boxes were removed with the round-12b simplification');
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

    elsif k = 'exams' then
      -- ══ ROUND 14 — TWO SHAPES, AND THEY ARE EXCLUSIVE ════════════════
      -- Either the row is one of the EIGHT (exam + optional trial 2|3), or
      -- it is a Weekly exam of the weekly series (series + series_no, no
      -- exam). A row that tried to be both would be a fixed exam the eight
      -- do not contain, and every count of "how many of the eight are done"
      -- would disagree with every other.
      perform wa.chk_bool(e->'legacy', w || '.legacy');
      perform wa.chk_text(e->'series', w || '.series', false, 20);
      -- ROUND 18 — the ONE refusal that must still print the STORED KEY,
      -- because it is the value the payload has to carry. It names the
      -- visible word beside it so the reader can tell which is which.
      perform wa.chk((e->>'series') is null or (e->>'series') = any(wa.exam_series()),
                     w || '.series',
                     format('unknown exam series — the list is %s (the %s theory exams)',
                            array_to_string(wa.exam_series(), ' / '),
                            wa.series_label('EETH')));
      perform wa.chk(not ((e->>'series') is not null and (e->>'exam') is not null),
                     w || '.series',
                     format('a row is either one of the eight ground exams or one of the %s series — never both',
                            wa.series_label('EETH')));
      if (e->>'series') is not null then
        -- THE NUMBER IS THE NAME. A Weekly exam with no number cannot be
        -- told from any other, so it is the one thing this shape requires;
        -- the DATE and the GRADE are both nullable, because a weekly exam
        -- is put on the programme before it is sat.
        perform wa.chk_date(e->'date', w || '.date', false);
        perform wa.chk_int(e->'series_no', w || '.series_no', 1, wa.section_cap('exams'));
        -- coalesce, because an ABSENT key makes jsonb_typeof return SQL
        -- NULL and a NULL predicate is not a failed one: without it the
        -- «required» half of this rule never fired at all.
        perform wa.chk(wa.is_legacy(e)
                       or coalesce(jsonb_typeof(e->'series_no'), 'missing') = 'number',
                       w || '.series_no',
                       format('every %1$s exam carries its number — %1$s 1, %1$s 2 … — because the number is its name',
                              wa.series_label('EETH')));
        perform wa.chk(not (e ? 'trial'), w || '.trial',
          format('a %s exam is not an attempt at one of the eight ground exams — it carries its series number, never a trial',
                 wa.series_label('EETH')));
      else
        -- A PLANNED ATTEMPT MAY BE DATELESS (round 14). A minted 2nd or 3rd
        -- trial says «a re-sit has been ordered» before it says when; the
        -- FIRST trial still needs its date, because a first attempt with no
        -- date is exactly the owed slot, and that stores nothing at all.
        perform wa.chk_bool(e->'legacy', w || '.legacy');
        perform wa.chk_date(e->'date', w || '.date', false);
        perform wa.chk(wa.is_legacy(e) or (e ? 'trial')
                       or wa.is_iso_date(e->>'date'),
                       w || '.date',
                       'the first sitting of a ground exam carries its date — a re-sit that has only been scheduled is recorded as a 2nd or 3rd trial');
        perform wa.chk_text(e->'exam', w || '.exam', not wa.is_legacy(e), 40);
        perform wa.chk((e->>'exam') is null or (e->>'exam') = any(wa.exam_ids()),
                       w || '.exam',
                       format('unknown ground exam — the list is %s',
                              array_to_string(wa.exam_ids(), ' / ')));
        perform wa.chk(wa.is_legacy(e)
                       or nullif(trim(coalesce(e->>'exam', '')), '') is not null,
                       w || '.exam',
                       format('every exam row names which of the eight ground exams it was, or the %s series it belongs to',
                              wa.series_label('EETH')));
        -- 2 AND 3, AND NOTHING ELSE. 1 is written as no key at all: a
        -- stored 1 would be a second way of saying what the absence already
        -- says, and two spellings of one fact is how a uniqueness rule gets
        -- quietly bypassed.
        perform wa.chk(not (e ? 'trial') or (e->>'trial') <> '1', w || '.trial',
          'the first trial is written as no trial key at all — a stored 1 would be a second spelling of the same fact, and two spellings is how a uniqueness rule gets bypassed');
        perform wa.chk_int(e->'trial', w || '.trial', 2, wa.exam_trials());
        perform wa.chk(not (e ? 'series_no'), w || '.series_no',
          format('a series number belongs to a %s exam — one of the eight ground exams is numbered by its TRIAL',
                 wa.series_label('EETH')));
      end if;
      -- NULLABLE, for the same reason a flight's grade is: the result can
      -- take longer to arrive than the exam did to sit.
      -- SHAPE ONLY, AND DELIBERATELY (round 15): chk_grade asks for a whole
      -- number 0-100 and asks nothing about whether it PASSED. A ground
      -- exam passes at 80 (wa.exam_pass_min) and a flight at 60, and a
      -- refusal written here with either number would be the server
      -- deciding a question no server function is asked. A 40 % is a valid,
      -- complete, storable ground-exam row — it simply did not pass.
      perform wa.chk_grade(e->'grade', w || '.grade', false);
      -- ROUND 12b — the same simplicity ruling, one section over.
      perform wa.chk(not (e ? 'instructor') and not (e ? 'instructor_oid'),
        w || '.instructor',
        'a ground exam does not name an examiner — «Μη βαλεις εκπαιδευτη για μαθηματα και εξετασεις για να ειναι απλο»');
      perform wa.chk(not (e ? 'note'), w || '.note',
        'the note field was removed — «Δε θελω πεδιο note»');
    end if;

    -- PENDING IS GONE (round 8) — refused by name, before the generic
    -- whitelist message, so the reason is the ruling and not a typo report.
    perform wa.chk(not (e ? 'pending'), w || '.pending',
      'the pending flag was removed — an entry that has not happened yet is simply an unfilled row (a fixed slot with no date reads as not flown), and a result that is still awaited is a grade not written yet');

    -- KEY WHITELIST — last, so the specific messages above win when they
    -- apply. Everything else: named, and refused.
    --
    -- ══ P45-WAe — THE REFUSAL IS BUILT WHEN THERE IS ONE, NOT ON EVERY FIELD
    -- THIS BLOCK WAS 145 ms OF THE 216 ms A 55-ROW `flights` SECTION COST TO
    -- VALIDATE — two thirds of it — and public.bridge_push validates the whole
    -- section once PER OPERATION, so a 25-op push on a real record spent 3.6 s
    -- here alone and died on the anon role's 3 s statement_timeout (measured,
    -- local stack, P45-WAe). Two faults, one shape:
    --   · wa.chk(ok, where, MSG) takes its sentence as an ARGUMENT, so the
    --     sentence was BUILT FOR EVERY FIELD OF EVERY ROW — 715 format() +
    --     array_to_string() + wa.entry_keys() on a 55-row section — and thrown
    --     away 715 times, because the check passes. 1.9 s of the 3.6 s was the
    --     construction of a message nobody was ever shown.
    --   · wa.entry_keys(k) was called twice per field on top of that.
    -- THE CURE IS THE SAME RULE THE LOOP ALREADY OBEYED, WRITTEN OUT: the loop
    -- raised on the FIRST key the section does not name and never looked at the
    -- rest, so ASK FOR THAT KEY and build the sentence only if there is one.
    -- Byte-identical refusals, byte-identical `where` paths, same order:
    -- jsonb_object_keys yields a jsonb object's keys in stored order (length,
    -- then bytewise) and `limit 1` takes the same first one the loop would have
    -- stopped at. 3 625 ms → 12 ms on the same 25×55 rows.
    perform wa.chk_text(e->'entered_by', w || '.entered_by', false, 20);
    f := (select ko from jsonb_object_keys(e) ko where not (ko = any(ks)) limit 1);
    if f is not null then
      perform wa.chk(false, w || '.' || f,
        format('unknown field for a %s entry — accepted fields are %s',
               k, array_to_string(ks, ', ')));
    end if;
  end loop;

  -- ONE ROW PER SOLO SLOT. The section is a fixed list; two rows claiming
  -- the same slot would make "the C4801-04 solo" ambiguous and let the
  -- fixed list grow through the back door.
  if k = 'solo_flights' then
    perform wa.chk((select count(*) = count(distinct t.slot) from (
                      select e2->>'slot' as slot
                      from jsonb_array_elements(p_arr) e2
                      where jsonb_typeof(e2) = 'object' and (e2->>'slot') is not null) t),
                   k, 'each solo slot may appear only once — the solo rows are fixed');
  end if;

  -- ══ ROUND 14 — ONE ROW PER (EXAM, TRIAL), AND WEEKLY NUMBERS ARE UNIQUE
  -- The solo-slot precedent two blocks up, applied to the two new shapes.
  -- Two rows both calling themselves «IN190, 2nd trial» are two results for
  -- one sitting that can disagree, and the pass-attempt rule would have to
  -- pick between them arbitrarily; two rows both calling themselves
  -- «Weekly 3» make the number stop being a name. Both are closed here, on
  -- the server, because the form's «next trial» / «+ Weekly n» affordances
  -- mint from max+1 and a payload can always be hand-made.
  if k = 'exams' then
    perform wa.chk((select count(*) = count(distinct t.key) from (
                      select coalesce(e2->>'exam', '-') || '|'
                             || coalesce(e2->>'trial', '1') as key
                      from jsonb_array_elements(p_arr) e2
                      where jsonb_typeof(e2) = 'object'
                        and (e2->>'series') is null
                        and (e2->>'exam') is not null) t),
                   k, 'two rows are the same trial of the same ground exam — each of the eight may be sat once per trial (1st, 2nd, 3rd)');
    perform wa.chk((select count(*) = count(distinct t.key) from (
                      select coalesce(e2->>'series', '-') || '|'
                             || coalesce(e2->>'series_no', '-') as key
                      from jsonb_array_elements(p_arr) e2
                      where jsonb_typeof(e2) = 'object'
                        and (e2->>'series') is not null
                        and (e2->>'series_no') is not null) t),
                   k, format('two rows carry the same %s number — the number is the name, so it identifies exactly one weekly exam',
                             wa.series_label('EETH')));
  end if;

  -- SEQ MUST DISAMBIGUATE (round-12 verify finding 2, the solo precedent
  -- one section up). Dropping the (sortie,date) uniqueness was the ruling
  -- — a same-day re-fly is real — but two rows sharing (track,sortie,date)
  -- AND seq are two grades for one flight that can disagree, exactly the
  -- corruption the checkride refusal exists to prevent; and a duplicated
  -- FAIL pair is the mechanism the bridge critique names as able to
  -- fabricate a ΠΔ 29/2020 referral downstream.
  if k in ('flights', 'fs') then
    perform wa.chk((select count(*) = count(distinct t.key) from (
                      select coalesce(e2->>'track', '-') || '|' || coalesce(e2->>'sortie', '-')
                             || '|' || coalesce(e2->>'date', '-') || '|'
                             || coalesce(e2->>'seq', '1') as key
                      from jsonb_array_elements(p_arr) e2
                      where jsonb_typeof(e2) = 'object'
                        and (e2->>'sortie') is not null and (e2->>'date') is not null) t),
                   k, 'two rows carry the same sortie, date and seq — a same-day re-fly needs its own seq (the form''s "+ same-day re-fly" mints the next one)');
  end if;

  -- ── EVALUATIONS FOLLOW THE SYLLABUS ORDER (round 6) ─────────────────
  -- The stage is flown in one order and the checkrides sit in it at fixed
  -- points, so a later checkride cannot have been flown while an earlier
  -- one has not: such a record is a typo in the identity picker, and it
  -- silently corrupts every per-checkride comparison the admin makes.
  -- THE ORDER IS THE SYLLABUS ORDER — wa.eval_ids(), generated from the
  -- FILE ORDER of the sortie entries in flowchart2.json (the printed
  -- Training Flow Chart): C4590 → C4790 → C5090 → C5490 → I4490 → I4890
  -- → F4690 → N4690.
  -- What is refused is a FILL out of order. A row that is still the empty
  -- fixed slot is always allowed — that is the default state of all eight
  -- from day one, and it is the state every predecessor starts in.
  if k = 'evaluations' then
    done := array_fill(false, array[array_length(wa.eval_ids(), 1)]);
    for i in 0 .. coalesce(jsonb_array_length(p_arr), 0) - 1 loop
      e := p_arr->i;
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
end $$;

-- ROUND 24 — WHAT IS LEFT HERE IS WHAT IS TRUE OF THE WHOLE PAYLOAD and of
-- nothing smaller: the root object, the 400 kB ceiling, the section-name
-- whitelist and the two renamed-key refusals. Everything that is true of ONE
-- SECTION moved to wa.validate_section above, which is now the only place a
-- section is judged — by this loop, and by public.bridge_push for the two
-- sections it touched. Two callers, one rule.
create or replace function wa.validate_record(p jsonb) returns void
language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare
  k text;
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

  -- every section: array, capped, entries are dated objects — ONE function,
  -- called once per present section, in wa.sections() order (round 24), so the
  -- FIRST refusal a bad payload meets is the one it met before the extraction.
  foreach k in array allowed loop
    if p ? k then
      perform wa.validate_section(k, p_arr => p->k);
    end if;
  end loop;
end $$;

-- how many airsickness entries still carry the retired phase-of-flight note
-- (round 6). Like the legacy flag, it may only ever be USED UP: the note is
-- kept so nothing is destroyed behind its owner's back, but the count can
-- never grow — the field is gone from the form, and it cannot come back
-- through a hand-made payload either.
create or replace function wa.phase_count(p jsonb) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language sql immutable set search_path = public, wa, pg_temp as $$
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
language plpgsql immutable set search_path = public, wa, pg_temp as $$
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
        -- A MISSION BESIDE A GRADE IS DROPPED, not flagged — and this is the
        -- ONE place this round removes a stored value. It is lossless: where a
        -- grade exists the mission is DERIVED from it (wa.grade_mission), so
        -- what is dropped is a copy, not a fact. Flagging it instead would
        -- leave a row nobody could ever save, because the form draws no mission
        -- box on a graded row — a trap, not a question.
        -- (`verdict`, round 12's three-way key, needs no branch here: it is not
        -- in wa.entry_keys any more, so wa.strip_entry drops it on read like
        -- any retired key. Nothing shipped ever stored one.)
        if jsonb_typeof(e->'grade') = 'number' and (e->>'mission') is not null then
          e := (e - 'mission') || jsonb_build_object('mission', null);
        end if;
        if (e->>'ng')::boolean and (e->>'mission') is not null then
          e := (e - 'mission') || jsonb_build_object('mission', null);
        end if;
        if (e->>'mission') is not null and not ((e->>'mission') = any(wa.missions())) then
          e := (e - 'mission') || jsonb_build_object('mission', null, 'legacy', true);
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
      -- ROUND 12b — the `absent` default is gone with the box: attendance,
      -- periods, the instructor and the note are no longer keys of a lesson, so
      -- wa.strip_entry drops any that a stored row still carries.
      -- ROUND 14 — EITHER date completes a lesson. A row recorded by its END
      -- alone is a course that demonstrably ran, so it is no longer flagged as
      -- an import that lost its date.
      if (not wa.is_iso_date(e->>'date') and not wa.is_iso_date(e->>'end_date'))
         or coalesce(e->>'group', '') = '' then
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
      -- ROUND 14 — THE TWO SHAPES, repaired the round-13 way: a value its
      -- catalogue no longer contains is NULLED and the row FLAGGED, never
      -- dropped and never guessed at.
      if (e->>'series') is not null and not ((e->>'series') = any(wa.exam_series())) then
        e := (e - 'series') || jsonb_build_object('series', null, 'legacy', true);
      end if;
      if (e->>'series') is not null then
        -- a Weekly exam names no exam and takes no trial; date AND grade are both
        -- nullable, because a weekly exam is programmed before it is sat
        if (e->>'exam') is not null then
          e := (e - 'exam') || jsonb_build_object('exam', null, 'legacy', true);
        end if;
        e := e - 'trial';
        if (e->>'series_no') is null then
          e := e || jsonb_build_object('legacy', true);
        end if;
      else
        e := e - 'series' - 'series_no';
        if (e->>'exam') is not null and not ((e->>'exam') = any(wa.exam_ids())) then
          e := (e - 'exam') || jsonb_build_object('exam', null, 'legacy', true);
        end if;
        -- trial 1 is written as NO KEY AT ALL, so a stored 1 (or anything
        -- outside 2..3) is normalised away rather than kept as a second
        -- spelling of what the absence already says
        if jsonb_typeof(e->'trial') <> 'number'
           or (e->>'trial')::numeric < 2
           or (e->>'trial')::numeric > wa.exam_trials()
           or (e->>'trial')::numeric <> trunc((e->>'trial')::numeric) then
          e := e - 'trial';
        end if;
        -- a PLANNED trial may be dateless — see wa.validate_record
        if (not wa.is_iso_date(e->>'date') and not (e ? 'trial'))
           or coalesce(e->>'exam', '') = '' then
          e := e || jsonb_build_object('legacy', true);
        end if;
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    o := o || jsonb_build_object('exams', arr);
  end if;

  -- FINAL PASS — per-section key whitelist (round-4 W3a): a key the form
  -- cannot show and the validator no longer accepts is dropped on READ, so a
  -- record that was written before this rule stops carrying it (a smuggled
  -- {"pending":true} anywhere disappears the moment the record is read).
  --
  -- P45-WAe — ONE STATEMENT PER SECTION INSTEAD OF ONE `||` PER ROW. The inner
  -- loop was `e := e || jsonb_build_array(…)`, which rebuilds the whole array
  -- it has accumulated so far on every row — quadratic in the section's length,
  -- on the section that is 55 rows on a real record and grows for as long as a
  -- student flies. `jsonb_agg … order by ord` is the same rows in the same
  -- order, built once. With the wa.strip_entry repair above it, the final pass
  -- went 869 ms → 147 ms over the round's 44-record scratch dataset.
  -- The `order by` is not decoration: without it the aggregate's input order is
  -- the scan's, and a section's rows are a LIST whose order is a fact.
  arr := '{}'::jsonb;
  for k in select jsonb_object_keys(o) loop
    select coalesce(jsonb_agg(wa.strip_entry(t.x, k) order by t.ord), '[]'::jsonb)
      into e
      from jsonb_array_elements(o->k) with ordinality t(x, ord);
    arr := arr || jsonb_build_object(k, e);
  end loop;
  return arr;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROUND 19 — THE INSTRUCTOR RECORD: ITS BOUNDARY, ITS WHITELIST, ITS REPAIR
-- ───────────────────────────────────────────────────────────────────────────
-- Everything below is the student-record machinery said once more for the
-- table next door, and it is said SEPARATELY on purpose. The two records share
-- not one section name, and a single wa.entry_keys() serving both would answer
-- 'currency' with the student's list — which is exactly the failure mode the
-- whitelist exists to prevent: an unregistered section is not rejected, it is
-- silently DESTROYED by the strip, row by row, on the first read. Two records,
-- two registries, and each one exhaustive about its own sections.
-- ═══════════════════════════════════════════════════════════════════════════

-- the sections of an instructor record, in form order. One, for now — and the
-- list exists rather than the literal so the second one costs a line here and
-- nothing anywhere else.
-- MIRROR: app/app.js → WA.INS_SECTIONS.
create or replace function wa.ins_sections() returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$ select array['currency']::text[] $$;

-- HOW MANY ROWS ONE SECTION MAY HOLD. An instructor flies most days of the
-- week; 400 rows is roughly two years of his own sorties, and like every other
-- cap in this schema it is a runaway-client stop and not a squadron rule.
create or replace function wa.ins_section_cap(p_sec text) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when p_sec = 'currency' then 400 else 200 end
$$;

-- PER-SECTION KEY WHITELIST — the exhaustive list of keys ONE entry of an
-- instructor's record may carry. Anything else is refused on write and dropped
-- on read, exactly as wa.entry_keys does for a student's.
-- MIRROR: app/app.js → WA.INS_ENTRY_KEYS. Change one, change the other.
create or replace function wa.ins_entry_keys(p_sec text) returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select case p_sec
    -- date        required — a currency claim without a day claims nothing
    -- kind        'continuation' (his own flight) / 'with_sp' (a flight with a
    --             student) — round 21; the round-19/20 'own'/'student' keys
    --             are mapped on read (wa.migrate_ins_entry)
    -- s_category  WHICH Σ IT WAS — CONTINUATION ONLY, required there: an id of
    --             wa.s_category_ids(): Σ-1 · Σ-2 day · Σ-2 night · Σ-3 · Σ-4 ·
    --             Σ-20 of Πίνακας 9, SIM-1…SIM-ΔΑ of Πίνακας 6, FDMS's two
    --             recording columns, the demo flight of Chapter 5, and the two
    --             legacy ids of §4v·1. The PROGRAMME is derived from it
    --             (wa.s_category_group), which is why round 19's `category` is
    --             gone from this list: two keys for one fact is two keys that
    --             can contradict each other. On a with_sp row it survives ONLY
    --             as a READ-ONLY LEGACY CARRIER (a round-19/20 'student' row
    --             claimed a Σ and no sortie): storable, marked, and the write
    --             path refuses to let the count of such rows GROW
    --             (wa.ins_withsp_scat_count — the round-6 `phase` doctrine).
    -- sortie      WHAT WAS FLOWN — WITH-SP ONLY, required there (round 21): a
    --             syllabus code of the STUDENT catalogue, either band
    --             (wa.sortie_band decides which); or one of the three markers
    --             of wa.withsp_markers() (repeat / fcf / cef); or off-catalogue
    --             free text, accepted and shown marked — the student form's
    --             own escape, because the syllabus data may lag reality and a
    --             record must never become unstorable. REFUSED BY NAME on a
    --             Continuation row. No band and no track is stored: the code
    --             carries both wherever anyone needs them.
    -- e_items     the 3-01 EVENTS the sortie exercised — ids of wa.e_item_ids(),
    --             possibly NONE: a plain Σ flight that exercised no event is
    --             still a flight, and the ruling asks for it by name
    -- seq         which sortie of that kind, identity and day — 1, and 2 for the
    --             second. AUTHORED, never an array index (round-12 doctrine)
    when 'currency' then array['date','kind','s_category','sortie','e_items','seq']
    else array[]::text[] end
$$;

-- one entry, reduced to the keys its section allows (read-time repair)
create or replace function wa.ins_strip_entry(e jsonb, p_sec text) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when jsonb_typeof(e) <> 'object' then '{}'::jsonb else
    coalesce((select jsonb_object_agg(t.k, t.v) from jsonb_each(e) t(k, v)
              where t.k = any(wa.ins_entry_keys(p_sec))), '{}'::jsonb) end
$$;

-- the E-items of one row, as a text[] — used by the uniqueness and membership
-- checks below and by nothing that writes
create or replace function wa.e_items_of(e jsonb) returns text[]
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when jsonb_typeof(e->'e_items') = 'array'
    then coalesce((select array_agg(x #>> '{}')
                   from jsonb_array_elements(e->'e_items') x), array[]::text[])
    else array[]::text[] end
$$;

-- INSTRUCTOR RECORD payload — full structural validation, raises on violation.
-- Every refusal NAMES the thing it refused, because the instructor form saves
-- the whole section in one act and «invalid payload» would send him hunting
-- through his own year for the row the server meant.
create or replace function wa.validate_instructor_record(p jsonb) returns void
language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare
  k text; f text; i int; j int; e jsonb; w text;
  ids text[]; seen text[];
begin
  perform wa.chk(jsonb_typeof(p) = 'object', 'payload', 'must be a JSON object');
  for k in select jsonb_object_keys(p) loop
    perform wa.chk(k = any(wa.ins_sections()), k,
      format('unknown section — an instructor record holds: %s',
             array_to_string(wa.ins_sections(), ', ')));
    perform wa.chk(jsonb_typeof(p->k) = 'array', k, 'section must be a list of entries');
    perform wa.chk(jsonb_array_length(p->k) <= wa.ins_section_cap(k), k,
      format('too many entries (max %s)', wa.ins_section_cap(k)));
    for i in 0 .. jsonb_array_length(p->k) - 1 loop
      e := p->k->i;
      w := format('%s[%s]', k, i);
      perform wa.chk(jsonb_typeof(e) = 'object', w, 'entry must be an object');
      -- the whitelist, refused BY NAME on the way in
      for f in select jsonb_object_keys(e) loop
        perform wa.chk(f = any(wa.ins_entry_keys(k)), w || '.' || f,
          format('unknown field for section %s — allowed: %s',
                 k, array_to_string(wa.ins_entry_keys(k), ', ')));
      end loop;
      if k = 'currency' then
        perform wa.chk_date(e->'date', w || '.date', true);
        -- ══ ROUND 20b — PRESENCE IS ITS OWN QUESTION ══════════════════════
        -- A bare «x = any(list)» is NULL when x is absent, and wa.chk raises
        -- only on FALSE — so a row that named NO kind at all walked straight
        -- past the closed list that refuses a row naming the WRONG one. The
        -- form was the only thing asking, which makes a rule a suggestion:
        -- anything that is not the form (a stale tab, a replayed payload, the
        -- next client) could file a flight the currency card cannot count.
        --
        -- THE FIX IS THE HOUSE'S OWN, NOT A NEW ONE: the SMS entrance has
        -- asked this way since round 8 (wa.sms_reasons, above) — a
        -- required-presence chk with ITS OWN curated sentence, THEN the
        -- membership check. Two questions, two sentences: «you left this
        -- blank» and «that is not one of the choices» are different things to
        -- have done, and one message for both would answer neither.
        --
        -- THE WORDS ARE THE FORM'S WORDS, deliberately: instructor.js →
        -- curIncomplete() promises «the server refuses these too, by field»,
        -- and until this round that promise was false for exactly the two
        -- fields it names. Now the server refuses in the sentence the client
        -- would have said, so the instructor meets one wording, not two.
        -- ROUND 21 — the two kinds are CONTINUATION and WITH SP, in the
        -- ruling's own words, and the required-presence sentences moved with
        -- them (server = client wording, the curIncomplete() promise).
        perform wa.chk(nullif(trim(coalesce(e->>'kind', '')), '') is not null,
          w || '.kind',
          'every flight of the logbook says whether it was a Continuation flight of your own or one with a student (SP) — the squadron counts the two differently, so a row that says neither is a sortie that counts nowhere');
        perform wa.chk((e->>'kind') = any(wa.currency_kinds()), w || '.kind',
          format('a flight is either a Continuation flight or one with an SP — %s',
                 array_to_string(wa.currency_kinds(), ' / ')));
        -- ROUND 20 — WHICH Σ, AND THE REFUSAL SAYS IT BY NAME. The closed list
        -- is the printed one (Πίνακας 9 + Πίνακας 6 + FDMS's two columns), and
        -- an id outside it is refused with the PRINTED NAMES of the programme
        -- it would have belonged to — «s-7» is a slug nobody typed, and
        -- «invalid category» would send an instructor hunting through a year.
        -- the COUNT is the count of what the sentence then LISTS: the legacy
        -- ids are storable and never offered, so naming them in the total and
        -- omitting them from the list would be a number nobody could verify
        -- against the words beside it.
        --
        -- ROUND 20b — AND IT IS ASKED BEFORE IT IS CHECKED. Same shape, same
        -- fix as `kind` above: the membership check below is NULL-blind, so a
        -- row with no Σ category at all — or with a JSON `null` where one
        -- belongs — was ACCEPTED by the very check written to close the list.
        -- ROUND 21 — AND IT IS ASKED PER KIND. A Continuation flight is named
        -- by its Σ category and refuses a sortie BY NAME; a with-SP flight is
        -- named by the student's sortie and takes a Σ only as the read-only
        -- legacy carrier of a round-19/20 'student' row (whose growth the
        -- write path blocks — wa.ins_withsp_scat_count). One box, one fact.
        if (e->>'kind') = 'continuation' then
          perform wa.chk(nullif(trim(coalesce(e->>'sortie', '')), '') is null,
            w || '.sortie',
            'a Continuation flight is your own — it is named by its Σ category of Πίνακας 9 / Πίνακας 6, not by a syllabus sortie of the students');
          perform wa.chk(nullif(trim(coalesce(e->>'s_category', '')), '') is not null,
            w || '.s_category',
            'every Continuation flight names which Σ category it was — Πίνακας 9 and Πίνακας 6 are counted by the category, so a flight without one is counted towards nothing');
        elsif (e->>'kind') = 'with_sp' then
          perform wa.chk(nullif(trim(coalesce(e->>'sortie', '')), '') is null
                         or nullif(trim(coalesce(e->>'s_category', '')), '') is null,
            w || '.s_category',
            'one box, one fact — this flight already names the student sortie, and a Σ category beside it would be a second claim that can contradict the first');
          -- the presence question: the legacy carrier (a Σ and no sortie) is
          -- the ONE sanctioned way a with-SP row stands without one
          perform wa.chk(nullif(trim(coalesce(e->>'sortie', '')), '') is not null
                         or nullif(trim(coalesce(e->>'s_category', '')), '') is not null,
            w || '.sortie',
            'every flight with an SP names what was flown — choose the student''s sortie from the syllabus, or repeat / fcf / cef, or type the code if the syllabus data lags reality');
          -- the value space is the student form's own: catalogue codes and the
          -- three markers are recognised, anything else is accepted as
          -- off-catalogue free text and SHOWN MARKED — no membership refusal,
          -- and no checkride refusal either (the student-side wa.eval_ids()
          -- refusal exists to prevent two grades for one flight; this row
          -- carries no grade).
          perform wa.chk_text(e->'sortie', w || '.sortie', false, 40);
        end if;
        -- the Σ membership check runs WHEREVER a Σ is present, either kind:
        -- a claim nobody can look up in the printed tables cannot be audited
        perform wa.chk((e->>'s_category') is null
                       or (e->>'s_category') = any(wa.s_category_ids()), w || '.s_category',
          format('«%s» is not a category of Πίνακας 9 (ΑΕΡΟΣ) or Πίνακας 6 (F/S) — choose one of the %s a flight may be recorded under: %s',
                 coalesce(e->>'s_category', ''),
                 (select count(*) from unnest(wa.s_category_ids()) t(id)
                   where not (t.id = any(wa.s_category_legacy_ids()))),
                 (select string_agg(wa.s_category_name(t.id), ' · ' order by t.ord)
                    from unnest(wa.s_category_ids()) with ordinality t(id, ord)
                   where not (t.id = any(wa.s_category_legacy_ids())))));
        perform wa.chk_int(e->'seq', w || '.seq', 1, 9);
        -- THE EVENTS. A closed list, and the refusal names the id it could not
        -- find: a currency claim that cannot be looked up in the 3-01 is a
        -- claim nobody can audit, and «invalid» would not say which one.
        if e ? 'e_items' then
          perform wa.chk(jsonb_typeof(e->'e_items') = 'array' or jsonb_typeof(e->'e_items') = 'null',
                         w || '.e_items', 'must be a list of event ids');
          if jsonb_typeof(e->'e_items') = 'array' then
            perform wa.chk(jsonb_array_length(e->'e_items') <= wa.e_item_cap(),
              w || '.e_items',
              format('a sortie cannot exercise more events than the 3-01 prints (%s)',
                     wa.e_item_cap()));
            ids := wa.e_items_of(e);
            for j in 1 .. coalesce(array_length(ids, 1), 0) loop
              -- ROUND 20b — THE THIRD SITE OF THE SAME SHAPE, found by the
              -- sweep and NOT by the report that sent it. An element that is
              -- JSON `null` (or an empty string) reaches here as SQL NULL —
              -- wa.e_items_of reads each element with `#>> '{}'` — so the
              -- membership check below was NULL-blind exactly as the two
              -- above were. This one did not silently accept, which is how it
              -- stayed hidden: it fell through to the DUPLICATE check, whose
              -- `x = ids[j]` is NULL for every row, so the count came out 0,
              -- 0 <> 1 fired, and an empty slot was refused as «« » is named
              -- twice on the same sortie» — a sentence about a rule the row
              -- had not broken, naming an event that was not there. Presence
              -- first, and the refusal says what is actually wrong.
              perform wa.chk(nullif(trim(coalesce(ids[j], '')), '') is not null,
                format('%s.e_items[%s]', w, j - 1),
                'an event slot names the event the sortie exercised — an empty slot claims nothing, and a currency claim that cannot be looked up in the 3-01 is one nobody can audit');
              perform wa.chk(ids[j] = any(wa.e_item_ids()),
                format('%s.e_items[%s]', w, j - 1),
                format('«%s» is not an event of the 3-01 EVENTS table — choose one of the %s printed events',
                       ids[j], wa.e_item_cap()));
              perform wa.chk((select count(*) from unnest(ids) x where x = ids[j]) = 1,
                format('%s.e_items[%s]', w, j - 1),
                format('«%s» is named twice on the same sortie — one flight exercises an event once',
                       coalesce(wa.e_item_name(ids[j]), ids[j])));
            end loop;
          end if;
        end if;
      end if;
    end loop;
    -- ONE ROW PER (kind, what-was-flown, date, seq) — the same identity the
    -- change list names a row by, so two rows the dialog would print
    -- identically cannot both be stored. `seq` is what makes a second sortie
    -- of the same day sayable; without this check it would also make it
    -- forgeable twice.
    -- ROUND 21 — ONE FORMULA, BOTH KINDS: the what-was-flown slot is the Σ
    -- category where the row carries one, else the sortie folded through
    -- upper(wa.norm_line(…)) so `c4101` and `C4101` cannot both be stored
    -- (identity only — the stored value is what the normalisation boundary
    -- made of it; the markers pass through upper() harmlessly).
    -- ROUND 22 (WA-21 verify finding 6) — THE EMPTY-STRING EDGE, ALIGNED.
    -- The client's rule is `String(x.s_category || "") || WA.normCode(x.sortie)`
    -- (WA.curIdent): an EMPTY Σ falls through to the sortie. `coalesce` skips
    -- only NULL, so a row carrying `"s_category": ""` identified itself as
    -- «kind|‹nothing›|date|seq» here and as «kind|SORTIE|date|seq» there — two
    -- rows the dialog printed as different could collide on the server, and two
    -- the dialog printed as the same could both be stored. The RULING picks the
    -- CLIENT's rule, so `nullif(…, '')` is added and the two agree by
    -- construction. (No stored row carries the shape — curPayload never emits an
    -- empty Σ — which is exactly why it had to be closed before one does.)
    -- MIRROR: app/app.js → WA.curIdent.
    if k = 'currency' then
      seen := array[]::text[];
      for i in 0 .. jsonb_array_length(p->k) - 1 loop
        e := p->k->i;
        f := (e->>'kind') || '|' ||
             coalesce(nullif(e->>'s_category', ''),
                      upper(wa.norm_line(e->>'sortie')), '') || '|' ||
             (e->>'date') || '|' || coalesce(e->>'seq', '1');
        perform wa.chk(not (f = any(seen)), format('%s[%s]', k, i),
          format('this flight is already recorded (%s, %s, flight %s of the day) — give the second one its own number',
                 e->>'date',
                 coalesce(wa.s_category_name(e->>'s_category'), e->>'s_category',
                          e->>'sortie', '—'),
                 coalesce(e->>'seq', '1')));
        seen := seen || f;
      end loop;
    end if;
  end loop;
end $$;

-- ROUND 20 — THE ONE LEGACY SHAPE THIS RECORD HAS: a round-19 row that stored
-- the PROGRAMME (`category` = 'aeros' / 'fs') and no Σ category at all.
--
-- IT DOES NOT GUESS, AND THAT IS THE WHOLE DESIGN. Nobody can reconstruct from
-- «ΑΕΡΟΣ on the 26th» whether the sortie was a Σ-1 or a Σ-3 — the fact was
-- never recorded, and mapping it to «the usual one» would put a category in an
-- instructor's logbook that he never claimed. So the migration carries across
-- the only thing the old row really knew (the programme) onto a category whose
-- printed name SAYS it is unspecified, and every surface renders it marked:
-- app/currency-catalog.js `legacy: true`, a red-edged chip in the table, a line
-- in the FDMS bridge saying which rows still need the developer's hand.
--
-- TWO LEGACY IDS AND NOT ONE, for the same reason: 'aeros' and 'fs' are facts
-- the old row carried, and folding both into a single «unspecified» would throw
-- away something TRUE in order to say something honest.
--
-- THE CLOUD HAS NOTHING TO MIGRATE (`instructor_records` verified EMPTY on
-- 27/08/2026), so this path exists for the local demo fixtures and for any
-- instance that ran round 19 or 20 before this deploy. It is idempotent: a row
-- that already carries the round-21 keys is left exactly as it stands.
--
-- ROUND 21 — TWO MORE ARMS, IN ORDER (kind map first, then the category→legacy
-- arm; both idempotent; the strip runs after, as today):
--   'own' → 'continuation' · 'student' → 'with_sp'  — the pure rename of §4x·1
--     (the cloud maps nothing; local fixtures and any round-19/20 instance do).
--   a `sortie` whose lowercase form is one of wa.withsp_markers() is folded to
--     that lowercase id — the normalisation boundary upper-cases every field
--     named `sortie` (wa.code_fields), and the markers ARE the R12 kind ids,
--     which are lowercase words; this arm is what keeps the stored value equal
--     to the id every reader (and the bridge join) compares against.
--   an `s_category` on a (now) with_sp row is KEPT AS-IS — the legacy carrier
--     of §4x·2: the old row claimed a Σ, nobody can reconstruct the student's
--     sortie code from it, and the migration does not guess. Rendered marked;
--     growth blocked at write (wa.ins_withsp_scat_count).
create or replace function wa.migrate_ins_entry(e jsonb, p_sec text) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
  select case
    when jsonb_typeof(e) <> 'object' then '{}'::jsonb
    when p_sec <> 'currency' then e
    else (
      select case
        when x ? 's_category' then x
        when (x->>'category') = 'aeros' then x || jsonb_build_object('s_category', 'legacy-aeros-unspecified')
        when (x->>'category') = 'fs' then x || jsonb_build_object('s_category', 'legacy-fs-unspecified')
        else x end
      from (select e
              || case when (e->>'kind') = 'own' then jsonb_build_object('kind', 'continuation')
                      when (e->>'kind') = 'student' then jsonb_build_object('kind', 'with_sp')
                      else '{}'::jsonb end
              || case when lower(coalesce(e->>'sortie', '')) = any(wa.withsp_markers())
                       and (e->>'sortie') is distinct from lower(e->>'sortie')
                      then jsonb_build_object('sortie', lower(e->>'sortie'))
                      else '{}'::jsonb end as x) s)
    end
$$;

-- READ-TIME REPAIR of an instructor record — the twin of wa.migrate_record.
-- The legacy pass above runs FIRST and the strip runs after it, because the
-- strip is what makes `category` stop existing: reading it after the key had
-- been dropped would heal nothing and lose the programme.
-- The rest is the FINAL PASS: every section the registry does not name is
-- dropped, and inside a section every key it does not name is stripped. That is
-- what makes a retired key stop existing the moment the record is read, instead
-- of lingering in storage until somebody notices.
create or replace function wa.migrate_instructor_record(p jsonb) returns jsonb
language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare o jsonb := '{}'::jsonb; k text; arr jsonb; i int;
begin
  if jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  foreach k in array wa.ins_sections() loop
    arr := '[]'::jsonb;
    if jsonb_typeof(p->k) = 'array' then
      for i in 0 .. jsonb_array_length(p->k) - 1 loop
        arr := arr || jsonb_build_array(
          wa.ins_strip_entry(wa.migrate_ins_entry(p->k->i, k), k));
      end loop;
    end if;
    o := o || jsonb_build_object(k, arr);
  end loop;
  return o;
end $$;

-- HOW MANY ROWS OF A RECORD STILL CARRY A LEGACY CATEGORY. The bridge and the
-- dashboard both need this number, and neither should count it for itself: a
-- legacy row is not a fault to hide, it is work the developer owes, and a
-- figure computed twice is a figure that eventually disagrees with itself.
create or replace function wa.ins_legacy_count(p jsonb) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select coalesce((
    select count(*)::int
    from jsonb_array_elements(coalesce(p->'currency', '[]'::jsonb)) e
    where (e->>'s_category') = any(wa.s_category_legacy_ids())), 0)
$$;

-- ROUND 21 — HOW MANY with-SP ROWS STILL CARRY A Σ CATEGORY. The second «work
-- the developer owes» number, beside wa.ins_legacy_count: a round-19/20
-- 'student' row named a Σ and no student sortie, and the migration keeps the
-- claim rather than guess a code from it. The write path refuses a payload
-- whose count EXCEEDS the stored record's (the exact analog of the round-6
-- `phase` grow-guard), so the number can only ever be used up.
create or replace function wa.ins_withsp_scat_count(p jsonb) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select coalesce((
    select count(*)::int
    from jsonb_array_elements(coalesce(p->'currency', '[]'::jsonb)) e
    where jsonb_typeof(e) = 'object'
      and (e->>'kind') = 'with_sp'
      and nullif(trim(coalesce(e->>'s_category', '')), '') is not null), 0)
$$;

-- how many rows an instructor record holds, all sections together
create or replace function wa.ins_entry_count(p jsonb) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select coalesce(sum(coalesce(jsonb_array_length(p->k), 0))::int, 0)
  from unnest(wa.ins_sections()) k
$$;

-- person as public jsonb (never leaks the token).
-- ROUND 9: the roster fields travel with the person — external_oid so the admin
-- can see WHICH row the shared roster owns, call_sign / country / test_pilot
-- because they are how the squadron actually names and sorts its instructors.
create or replace function wa.person_json(p public.people) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
  select jsonb_build_object(
    'id', p.id, 'role', p.role, 'mn', p.mn, 'rank', p.rank,
    'first_name', p.first_name, 'last_name', p.last_name, 'class', p.class,
    'duty', p.duty, 'leadership', p.leadership, 'status', p.status,
    'external_oid', p.external_oid, 'call_sign', p.call_sign,
    'country', p.country, 'test_pilot', p.test_pilot,
    'active', p.active)
$$;

-- how many entries of a record carry a given PROVENANCE stamp (round 12).
-- 'admin' is the admin's; the generalisation is here because the bridge's
-- 'fdms' stamp is the next value this has to be able to count WITHOUT being
-- counted as the admin's — a row a machine proposed is not a row the admin
-- wrote, and conflating them would be a truth defect in the exact feature that
-- exists to be honest about provenance.
-- (An unflown fixed slot is a placeholder, not an entry — round 5.)
create or replace function wa.entry_count_by(p jsonb, p_source text) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select coalesce((
    select count(*)::int
    from jsonb_each(coalesce(p, '{}'::jsonb)) s(key, val)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(val) = 'array' then val else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object' and (e->>'entered_by') = p_source
      and not wa.slot_empty(s.key, e)), 0)
$$;

-- how many entries of a record were entered BY THE ADMIN on the owner's behalf.
-- Kept as its own name because a dozen callers say it, and because "the admin's"
-- is the question every surface actually asks.
create or replace function wa.co_entry_count(p jsonb) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select wa.entry_count_by(p, 'admin')
$$;

-- how many entries the record carries in total — the DENOMINATOR behind
-- "17 self-reported + 1 entered by the admin". Without it the dashboard cannot
-- tell a record the admin wrote from a record the admin merely added one line to
-- (round-4b: the two used to look identical, and both read as "admin record").
-- ROUND 5: a fixed slot nobody has flown yet counts for nothing here either —
-- otherwise every record would arrive carrying 16 "entries" it does not have,
-- and "1 of 18 entered by the admin" would stop being true.
create or replace function wa.entry_count(p jsonb) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select coalesce((
    select count(*)::int
    from jsonb_each(coalesce(p, '{}'::jsonb)) s(key, val)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(val) = 'array' then val else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object' and not wa.slot_empty(s.key, e)), 0)
$$;

-- ── the RECORD-level stamp is DERIVED, never authored (round 4b) ───────────
-- 'admin' means "this record CONTAINS data the admin entered" — that is all it
-- has ever been able to mean since the stamp went per-entry. It is true when
-- at least one entry carries the stamp, and (the one case with no entries to
-- carry it) when the admin created the record and its owner has never saved it.
-- Every view must then say WHICH of the two it is by comparing
-- wa.co_entry_count against wa.entry_count: all entries → "entered by the admin",
-- some → "self-reported, N entries added by the admin". Reading this flag alone
-- as "the admin filled the whole thing in" is the round-4 defect.
-- p_rec is the MIGRATED record; p_stored is the column as it stands.
create or replace function wa.record_stamp(p_rec jsonb, p_stored text) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select case
    when wa.co_entry_count(p_rec) > 0 then 'admin'
    when wa.entry_count(p_rec) = 0 and p_stored = 'admin' then 'admin'
    else null end
$$;

-- ── ENTER-ON-BEHALF: the entry stamp ──────────────────────────────────────
-- ROUND 4b — the stamp is decided PER ENTRY, by DIFF.
-- The round-4 version stamped every entry of the submitted payload, so an admin
-- who added ONE line to a student's 17 self-reported entries re-attributed all
-- 18 to himself. The record then lied about its own provenance, in the exact
-- place the feature exists to be honest about. Superseded:
drop function if exists wa.stamp_record(jsonb, text);

-- ── THE ADMIN'S EDITS PREVAIL — THE SUPREMACY INVERSION (round 8) ─────────
-- Rounds 4b-7 gave the owner the last word: saving your own form cleared every
-- admin stamp on it, because "reclaiming your own data makes it self-reported
-- again". The squadron reads it the other way round. When the admin writes a
-- line into a student's record he is not making a suggestion, and a record in
-- which the student can quietly overwrite the admin's correction is a record
-- the squadron cannot brief from.
-- SO: an entry the admin created or modified (entered_by = 'admin') is LOCKED
-- for its owner. The owner's save must carry every one of them through
-- UNCHANGED — it is refused otherwise — and it NO LONGER STRIPS THE STAMPS.
-- The admin keeps the full range of motion: he may edit or delete his own
-- entries, and editing an owner's entry makes it his (the diff below stamps
-- it), which locks it.
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
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when jsonb_typeof(e) <> 'object' then coalesce(e, 'null'::jsonb) else
    coalesce((select jsonb_object_agg(t.k, t.v) from jsonb_each(e) t(k, v)
              where t.k <> 'entered_by' and jsonb_typeof(t.v) <> 'null'), '{}'::jsonb) end
$$;

-- the admin path: the submitted payload against the STORED record, section by
-- section. An entry that is already in the record keeps the provenance it
-- already had (null stays null — the admin re-sending a student's line does not
-- make it his); an entry that is NEW or MODIFIED is the admin's and says so.
-- Entries that disappeared need nothing: a deletion leaves no row to attribute.
-- p_old is the stored record AFTER wa.migrate_record — the same shape the
-- form was handed, so an untouched row round-trips to an exact match.
create or replace function wa.stamp_record_diff(p_new jsonb, p_old jsonb) returns jsonb
language plpgsql immutable set search_path = public, wa, pg_temp as $$
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
        -- the admin "entered". Stamping it would tag the eight checkrides and the
        -- eight solos of every record the admin ever opens (round 5).
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

-- ── THE LOCK REFUSAL, IN ONE PLACE ────────────────────────────────────────
-- ROUND 17b. This sentence is the SERVER TWIN of the note the owner already
-- reads on the locked row (app/student.js → rowHTML, built from WA.ADMIN_BODY
-- «the squadron administration» + WA.ADMIN_WORD «the admin»). Round 17 changed
-- the client's half and left the server's saying «the squadron CO … only the
-- CO», so the one sentence a student is ever shown TWICE — once on the row,
-- once when the save is refused — named two different people. It is a function
-- and not two literals for exactly that reason: the refusal for the section
-- that WAS submitted and the refusal for the section that was OMITTED are the
-- same rule, and one definition cannot drift from itself.
-- (The stored value stays entered_by='admin' and the internal names keep
-- theirs — round 17's rule: what the USER SEES stops claiming CO-ness.)
create or replace function wa.admin_lock_msg() returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select 'this entry was set by the squadron administration and only the admin can change or remove it — it is shown on your form locked, and your save must leave it exactly as it stands'
$$;

-- ── THE HANDLE OF A LOG ROW, IN ONE PLACE (round 24) ──────────────────────
-- (sortie, date, seq) is what NAMES a flight-log row to anything outside the
-- record: the bridge's ops carry it as `prev`, the survival clause below asks
-- «does a row still stand at this handle?», and public.bridge_push matches on
-- it. It is a HANDLE and not an identity — a date correction MOVES it, which is
-- exactly why the FDMS ledger keys on its own date-free rid instead. Absent seq
-- reads as 1, the same default wa.migrate_record writes and wa.entry_keys
-- documents, so a hand-made payload cannot dodge a match by omitting the key.
create or replace function wa.log_handle(e jsonb) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select coalesce(e->>'sortie', '') || U&'\2237' || coalesce(e->>'date', '')
      || U&'\2237' || coalesce(nullif(e->>'seq', ''), '1')
$$;

-- ── THE SAME ROW'S SEQ, READ AS A NUMBER (P45-WAc, F4) ────────────────────
-- wa.log_handle spells the seq as TEXT, because a handle is a string. This is
-- the same field read as what it actually is — which flight of that sortie on
-- that day — and it answers NULL for anything that is not one.
--
-- IT EXISTS BECAUSE A CAST INSIDE AN INSERT IS A RAISE. public.bridge_push
-- files EVERY operation in wa.bridge_audit (`seq int`) and every removal in
-- wa.bridge_tombstones (`seq int`, CHECK 1..20), and it does both INSIDE the
-- per-op loop. So `(op->'row'->>'seq')::int` on an op carrying `"seq": "x"`
-- did not refuse that op — it raised the WHOLE call with a raw Postgres error
-- («invalid input syntax for type integer») and took the nine well-formed
-- operations standing beside it, against this lane's own contract that only
-- the ENVELOPE raises. Read once, as an int or as nothing, and the two inserts
-- stop being able to raise at all.
--
-- THE BOUNDS ARE THE ONES THAT ALREADY EXIST, not a third opinion:
-- wa.validate_section asks wa.chk_int(e->'seq', …, 1, 20) of every flight row
-- and bridge_tombstones_seq_chk repeats them in its own CHECK.
--
-- ── AND THE JSON TYPE IS PART OF THE READING (P45-WAd, F1) ─────────────────
-- THE INVARIANT THIS FUNCTION SERVES, stated once and then defended in full:
-- THE NUMBER THAT FILES THE TOMBSTONE MUST BE THE NUMBER IN THE HANDLE THAT
-- FOUND THE ROW. Two readers stand on this one field and they read it
-- differently — wa.log_handle spells it with `->>` (the TEXT form, so `2` and
-- `"2"` are both '2'), while wa.migrate_record takes it only when
-- `jsonb_typeof(e->'seq') = 'number'` and otherwise DISCARDS it and writes the
-- authored default 1. So a seq that is not a JSON number is a value the two
-- readers disagree about, and the previous spelling of this function — a regex
-- over `e->>'seq'` — could not see the difference.
--   · A LEADING ZERO ('01') was the half that was defended: the handle would
--     spell it '01', match no stored row, and the migration would write 1.
--   · A PLAIN STRING ("2") was the half that was not, and it is the WORSE half
--     because both readers accept it and they accept DIFFERENT VALUES. The two
--     faces of that, both proven live in P45-WAc:
--       — on the WRITE side an op carrying `"seq":"2"` was `created` (the row
--         landing at seq 1) and then REFUSED on its own identical replay, which
--         is the LOST-ANSWER failure P45-WAb F1 exists to make impossible: the
--         replay looks for its row at handle seq 2, finds nothing, appends a
--         second row that migrates to 1, and wa.validate_section refuses the
--         duplicate handle. Nothing is corrupted and the queue is stuck.
--       — on the PROOF side (P45-WAc F1) a `prev` spelling its seq as a string
--         silently failed the knowledge test on every seq >= 2 flight and
--         passed on every seq-1 flight, because there the discarded value and
--         the default coincide. The refusal then told the caller his CLAIM was
--         wrong when what was wrong was the TYPE.
-- THE CURE IS ONE PREDICATE, and it is here rather than a coercion in the
-- migration for the reason this lane refuses everything else it cannot read
-- exactly: a coercion would make `"2"` mean 2 on the bridge while the same
-- record read through any other door still means 1, i.e. two answers for one
-- stored byte. Refusing by SHAPE gives the caller one sentence naming the type.
-- (`""`, JSON `null` and an ABSENT key stay «not sent» and are NOT refused:
-- there both readers already agree on 1 — wa.log_handle coalesces the empty
-- text to '1' and the migration writes 1 — so there is no disagreement to
-- refuse, and «absent seq reads as 1» is the documented contract above.)
create or replace function wa.log_seq(e jsonb) returns int
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when jsonb_typeof(e) <> 'object' then null
              when jsonb_typeof(e->'seq') = 'number'
               and e->>'seq' ~ '^[1-9][0-9]?$' and (e->>'seq')::int between 1 and 20
                then (e->>'seq')::int end
$$;

-- ── ONE BLOCK OF THE WIRE, READ EXACTLY AS A STORED ROW IS READ (P45-WAc) ──
-- public.bridge_push holds TWO wire blocks that have to be compared with rows
-- in the record: `row` (what this operation would write) and, since P45-WAc,
-- `prev` (the row it CLAIMS to be replacing — see F1 there). Both are read by
-- this one function, and that is the whole point of it being one.
--
-- WHY THE READ MIGRATION AND NOT A HAND-BUILT OBJECT. The stored rows both
-- blocks are matched against have all been through wa.migrate_record: it
-- normalises every string (the round-5b boundary), writes the three authored
-- defaults (seq 1, kind 'syllabus', ng false), resolves the track from a
-- syllabus code, drops a mission that a grade already implies and strips every
-- key the section has retired. Reading a wire block any other way would make an
-- UNCHANGED row look changed, and an HONEST `prev` look like a lie, purely
-- because FDMS did not send a key whose default this database writes.
-- One function, both sides, and the same one the storage went through.
create or replace function wa.bridge_row(p_sec text, e jsonb) returns jsonb
language sql immutable set search_path = public, wa, pg_temp as $$
  select case when jsonb_typeof(e) <> 'object' then null else
    wa.migrate_record(jsonb_build_object(p_sec, jsonb_build_array(
      e || jsonb_build_object('entered_by', 'fdms'))))->p_sec->0 end
$$;

-- ── THE BRIDGE ROW'S SURVIVAL CLAUSE — THE SENTENCE (round 24 / B.4) ──────
-- The mirror of wa.admin_lock_msg one notch SOFTER, and the difference is the
-- whole ruling: an admin row is LOCKED (it may not be edited at all), an FDMS
-- row is CORRECTABLE (edit it and the corrected row becomes YOURS — the stamp
-- is stripped, and the next cross-check reports the divergence to the
-- developer, who rules). What it is not is DELETABLE from this form.
--
-- WHERE THE BOUNDARY RUNS, SAID OUT LOUD (the adversarial read's must-fix 9).
-- The successor test below keys on the HANDLE — sortie, date, seq — so changing
-- one of those three is indistinguishable from removing the row, and is refused
-- as one. That is a POLICY and not an accident: the handle is the scheduler's
-- own name for the flight, the thing its ledger and its report are keyed to,
-- and a student silently renaming it would leave the two systems talking about
-- different flights with nobody told. The sentence therefore says which fields
-- are his and which are not, instead of promising «correct it if it is wrong»
-- and then refusing exactly one kind of correction.
-- It names the flight and the day, because a refusal a student cannot LOCATE on
-- a form of eighty rows is a refusal he cannot act on.
create or replace function wa.fdms_lock_msg(e jsonb) returns text
language sql immutable set search_path = public, wa, pg_temp as $$
  select format(
    '%s of %s came from the squadron''s own scheduler (FDMS). You may CORRECT what it says — the instructor, the grade, the mission — and the corrected row becomes yours; the squadron sees the difference at its next cross-check. What you may not do here is REMOVE it, or change the three fields that name it (the sortie, the date and the same-day sequence number): those are the scheduler''s handle for this flight, and a flight is removed on the squadron''s side, not on this form. If the row appeared while you were editing, reload the form — nothing you have typed has been sent.',
    coalesce(nullif(upper(coalesce(e->>'sortie', '')), ''), 'this flight'),
    case when wa.is_iso_date(e->>'date')
         then to_char((e->>'date')::date, 'DD/MM/YYYY')
         else 'an unrecorded date' end)
$$;

-- the OWNER path (round 8): the submitted payload against the STORED record.
-- Every entry the admin owns must still be there, fact for fact — matched by
-- wa.entry_core exactly as the admin path matches, position first — and it comes
-- out of this function still carrying his name. An entry of the owner's own
-- keeps null whether it changed or not: their record is still theirs to write.
-- An admin entry that was ALTERED has no match, and an admin entry that was DELETED
-- has no match either; both leave a stored stamp unclaimed, and that is the
-- refusal — one sentence, naming the rule, for both.
--
-- ══ ROUND 24 — AND THE SAME PASS NOW ANSWERS FOR THE BRIDGE'S ROWS ═════════
-- The FDMS lane writes entries stamped 'fdms'. Two sentences bind it, and they
-- pull in opposite directions:
--   «an fdms row does NOT lock the student out of his own record» — so the
--     admin clause above is left ALONE: it fires on the literal 'admin' and on
--     nothing else, which is why an fdms row can be edited at all;
--   «a bridge row must not be deletable by accident, from either side» — so an
--     fdms stamp that comes back unclaimed is not automatically the owner's to
--     drop.
-- The two meet at ONE test, and it is the HANDLE: an unclaimed stored fdms row
-- is an EDIT (allowed, stamp stripped by the loop above — the row is now his)
-- when a submitted row still stands at the same (sortie, date, seq); it is a
-- DELETION (refused, by wa.fdms_lock_msg, which names the flight and the day)
-- when nothing does. The whole-section-omitted case falls out of the same rule
-- with no successor possible, so it is refused unconditionally — the shape the
-- admin clause has carried since round 8.
-- WHAT THIS DOES NOT DO: it never consults wa.bridge_tombstones and never asks
-- whether the bridge is even configured. A student's save is judged against
-- what is IN HIS RECORD, so no bridge state can ever lock him out.
create or replace function wa.carry_stamps(p_new jsonb, p_old jsonb) returns jsonb
language plpgsql immutable set search_path = public, wa, pg_temp as $$
declare
  o jsonb := '{}'::jsonb;
  k text; nw jsonb; od jsonb; arr jsonb; e jsonb; core jsonb;
  i int; j int; n_old int; hit int; used boolean[];
  kept boolean;
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
        -- a row the owner wrote or changed — theirs, never the admin's
        e := e - 'entered_by';
      end if;
      arr := arr || jsonb_build_array(e);
    end loop;
    -- EVERY ADMIN ENTRY MUST HAVE BEEN CLAIMED. One that was not is one the
    -- owner altered or dropped, and only the admin may do either.
    -- ROUND 24 — AND EVERY FDMS ENTRY MUST STILL HAVE A ROW AT ITS HANDLE. One
    -- that has not is a flight the student deleted (or renamed, which is the
    -- same act to the scheduler), and a flight is removed on the squadron's
    -- side. One that HAS is a correction, and the loop above has already made
    -- the corrected row his.
    for j in 0 .. n_old - 1 loop
      if used[j + 1] or wa.slot_empty(k, od->j) then continue; end if;
      if (od->j->>'entered_by') = 'admin' then
        perform wa.chk(false, format('%s[%s]', k, j), wa.admin_lock_msg());
      elsif (od->j->>'entered_by') = 'fdms' then
        kept := false;
        for i in 0 .. jsonb_array_length(nw) - 1 loop
          if jsonb_typeof(nw->i) = 'object'
             and wa.log_handle(nw->i) = wa.log_handle(od->j) then
            kept := true; exit;
          end if;
        end loop;
        perform wa.chk(kept, format('%s[%s]', k, j), wa.fdms_lock_msg(od->j));
      end if;
    end loop;
    o := o || jsonb_build_object(k, arr);
  end loop;
  -- a whole SECTION the payload omitted takes its stored admin entries with it,
  -- so the same rule has to look at what is not in the payload at all
  -- (ROUND 24 — and its fdms entries too: an omitted section can hold no
  -- successor at any handle, so every one of them is a deletion)
  for k in select jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) loop
    if (p_new ? k) or jsonb_typeof(p_old->k) <> 'array' then continue; end if;
    for j in 0 .. jsonb_array_length(p_old->k) - 1 loop
      if wa.slot_empty(k, p_old->k->j) then continue; end if;
      if (p_old->k->j->>'entered_by') = 'fdms' then
        perform wa.chk(false, format('%s[%s]', k, j), wa.fdms_lock_msg(p_old->k->j));
      end if;
      if (p_old->k->j->>'entered_by') = 'admin' then
        perform wa.chk(false, format('%s[%s]', k, j), wa.admin_lock_msg());
      end if;
    end loop;
  end loop;
  return o;
end $$;

-- ── the ONE HUMAN student-record write path — and it is not the only door ──
-- Used by BOTH public.save_student_record (the owner) and
-- public.admin_save_student_record (the admin on their behalf) — same validation,
-- same legacy rule, same upsert. An admin typo is still a typo.
--
-- ── THE SECOND DOOR, NAMED (P45-WAb, F4; the critique's item 10·5) ─────────
-- This header said «the ONE student-record write path», and it stopped being
-- true the hour round 24 landed: public.bridge_push writes
-- public.student_records DIRECTLY — its own update and its own insert, at the
-- foot of the surgeon — and no comment anywhere said so. The claim above is now
-- the narrower true one (this is the path a HUMAN's payload takes, from either
-- of the two human doors), and the second door is written down HERE, which is
-- where anybody reasoning about «what can change a student record» reads first.
--
-- WHY THE BRIDGE DOES NOT COME THROUGH THIS FUNCTION. This one takes a WHOLE
-- RECORD and validates the whole of it. One of the four records on the local
-- stack cannot pass wa.validate_record on its own migrated form — over an SMS
-- entrance that names no ΚΕΠΕ condition, a section the bridge does not touch,
-- cannot see and could never fix — so a push routed through here would be
-- PERMANENTLY REFUSED for that student by a defect nobody in the lane is
-- allowed to repair. public.bridge_push is a SURGEON for exactly that reason
-- (design decision #3, spec §4z·3·4).
--
-- AND WHY THE SECOND DOOR IS SAFE: it keeps the four things this one does.
--   · THE SAME NORMALISATION BOUNDARY. The candidate row is built by
--     wa.migrate_record on a one-row section — the same call the stored rows go
--     through — so nothing reaches storage unnormalised (round 5b).
--   · THE SAME VALIDATOR, on the sections it touched. wa.validate_section is
--     the extracted body of this file's own per-section loop and the cap
--     (wa.section_cap) travelled with it, so «legal to the form» and «legal to
--     the bridge» cannot drift: they are one function with two callers.
--   · THE SAME REGISTRIES AND THE SAME REFUSALS — wa.log_bands, the syllabus
--     tables, the (track, sortie, date, seq) fence. A push cannot write a band,
--     a code, a duplicate handle or a four-hundred-and-first row that this door
--     would have refused.
--   · IT WRITES ONLY WHAT IT TOUCHED. `data = <stored, byte for byte> || {the
--     touched sections}` — the eleven sections it cannot see are not
--     re-validated, not re-normalised, not rewritten and not migrated into
--     storage behind their owner's back.
--
-- THE ONE THING IT DELIBERATELY DOES NOT DO IS RECOMPUTE `record_stamp`, and
-- that is a decision rather than an omission: wa.record_stamp counts the literal
-- 'admin', an fdms row is neither the owner's nor the admin's, and recomputing
-- the record-level stamp from the bridge would be the lane answering a question
-- about CUSTODY that nobody asked it. So an fdms row can never flip a record's
-- stamp — which is also why wa.carry_stamps, not this function, is where the
-- bridge row's survival clause lives.
create or replace function wa.write_record(p_student uuid, p_payload jsonb, p_as_admin boolean)
returns jsonb
language plpgsql volatile set search_path = public, wa, pg_temp as $$
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
  -- fires on a clean C4302, on the owner path and the admin path alike.
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
  -- admin path (round 4b, unchanged): only what he actually wrote carries his
  -- name, and editing an owner's entry makes that entry his.
  -- OWNER path (round 8): the stamps SURVIVE. Every admin entry must come back
  -- fact for fact — wa.carry_stamps refuses the save otherwise, naming the
  -- rule — and it comes back still stamped. The owner's own entries stay the
  -- owner's whether they changed or not.
  -- Applied server-side on EVERY write, so a stamp can neither be forged by a
  -- hand-made payload nor thrown away by one.
  stamped := case when p_as_admin then wa.stamp_record_diff(pl, old)
                  else wa.carry_stamps(pl, old) end;
  -- DERIVED, never typed — on both paths now, because a record whose entries
  -- carry the admin's name keeps saying so after its owner saves it. The one case
  -- the entries cannot settle (a record the admin opened and nobody has filled)
  -- still belongs to the admin path: an empty record locks nothing.
  by_who := wa.record_stamp(stamped,
              case when p_as_admin then (case when had then prev else 'admin' end)
                   else null end);

  insert into public.student_records as sr (student_id, data, last_update, entered_by)
  values (p_student, stamped, now(), by_who)
  on conflict (student_id)
  do update set data = excluded.data, last_update = now(), entered_by = excluded.entered_by
  returning last_update into t;
  -- `record` is the stamped payload as stored: the client applies the server's
  -- verdict instead of guessing which of its rows the admin touched.
  return jsonb_build_object('ok', true, 'last_update', t, 'entered_by', by_who,
                            'co_entries', wa.co_entry_count(stamped),
                            'entries', wa.entry_count(stamped),
                            'record', stamped);
end $$;

-- ── the ONE proposal write path ───────────────────────────────────────────
-- Used by BOTH public.save_proposal (the instructor) and
-- public.admin_save_proposal (the admin on their behalf).
create or replace function wa.write_proposal(p_instructor uuid, p_student uuid,
                                             p_payload jsonb, p_as_admin boolean)
returns jsonb
language plpgsql volatile set search_path = public, wa, pg_temp as $$
declare
  s public.people;
  k text;
  lv text;
  fw boolean; cm text;
  saved public.proposals;
  scope text;
  who   text;
  by_who text := case when p_as_admin then 'admin' else null end;
begin
  select * into s from public.people
   where id = p_student and role = 'student' and active;
  if not found then
    raise exception 'WA: unknown student';
  end if;

  -- ══ ROUND 18 — THE SCOPE GATES THE WRITE, AND IT REFUSES BY NAME ═════════
  -- «μονο για αυτους θελω προτασεις» is a rule about what may be WRITTEN, and
  -- a rule that lives only in the client is a rule a stale tab breaks. An
  -- instructor who left the form open on Friday, or who kept a card from the
  -- class that finished last term, must not be able to save into it on Monday
  -- because his HTML predates the admin's decision — so the gate is HERE, in
  -- the one write path both callers go through (the instructor's own
  -- save_proposal AND the admin's admin_save_proposal, because the admin's
  -- on-behalf form is the same questionnaire and can go stale the same way).
  --
  -- IT GATES WRITES AND NOTHING ELSE. Every proposal already stored stays
  -- readable everywhere it shows today — the Overview table, the analysis
  -- cards, the printed brief, the CSV exports, public.admin_get_data and
  -- public.admin_export are all untouched by this. Moving the scope to next
  -- term's class does not delete, hide or expire one assessment of the class
  -- that finished; it stops NEW ones being written for anybody else.
  --
  -- THE REFUSAL NAMES THE STUDENT, because that is the only thing that makes
  -- it actionable: the instructor's Save writes card by card and reports per
  -- card, so «one of them was refused» would send him hunting through twelve
  -- students for the one the server meant.
  scope := wa.assessment_class();
  who   := btrim(coalesce(s.rank, '') || ' ' || coalesce(s.last_name, ''));
  if scope is null then
    raise exception 'WA: assessments are closed — no class is open for assessment at the moment, so nothing can be recorded for %. The admin opens a class on the dashboard, under Instructor submissions.', who;
  elsif not wa.student_in_scope(s) then
    raise exception 'WA: % is in class %, and assessments are open for class % — only that class can be assessed right now. Nothing was written. (Assessments already stored for other classes are untouched and stay visible.)',
      who, coalesce(nullif(btrim(coalesce(s.class, '')), ''), '— none recorded —'), scope;
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

-- ── ROUND 19 — the ONE instructor-record write path ───────────────────────
-- ONE caller today (public.save_instructor_currency, the owner) and it is
-- written as a path anyway, for the same reason wa.write_record is one: the
-- normalisation, the validation and the upsert are the contract, and a second
-- entry point that skipped any of the three would be a second contract.
--
-- IT IS THE OWNER'S PATH AND ONLY THE OWNER'S. There is no p_as_admin twin
-- here — see the table's own comment: a currency claim is a statement about
-- who flew what, and the admin was not in the aircraft. The admin's on-behalf
-- form renders this section read-only, so the refusal is not a message the
-- user ever meets; the absence of the path is what makes it true.
create or replace function wa.write_instructor_record(p_instructor uuid, p_payload jsonb)
returns jsonb
language plpgsql volatile set search_path = public, wa, pg_temp as $$
declare t timestamptz; pl jsonb;
begin
  -- the SAME normalisation boundary the student record crosses (round 5b):
  -- what is validated below is exactly what is stored further down, so a
  -- padded ' e-32-bfm ' cannot be a known event to the storage and an unknown
  -- one to the membership check.
  pl := wa.norm_record(p_payload);
  perform wa.validate_instructor_record(pl);
  -- and the READ-TIME shape is what is written: the record is stored already
  -- stripped, so what comes back out of the table is byte-identical to what
  -- the migration would have made of it.
  pl := wa.migrate_instructor_record(pl);

  -- ROUND 21 — THE with-SP Σ CARRIER MAY ONLY EVER BE USED UP (the round-6
  -- `phase` grow-guard, exact analog): both sides of the comparison are in the
  -- MIGRATED shape, so a stale round-19/20 payload and the stored record are
  -- counted in one vocabulary.
  perform wa.chk(wa.ins_withsp_scat_count(pl)
                   <= wa.ins_withsp_scat_count(wa.instructor_record_of(p_instructor)),
                 'currency',
                 'a Σ category on a with-SP flight is a leftover of the old form — it may stay on the rows that already carry one, and no new row takes one; name the student''s sortie instead');

  insert into public.instructor_records as ir (instructor_id, data, last_update)
  values (p_instructor, pl, now())
  on conflict (instructor_id)
  do update set data = excluded.data, last_update = now()
  returning last_update into t;
  return jsonb_build_object('ok', true, 'last_update', t,
                            'entries', wa.ins_entry_count(pl),
                            'record', pl);
end $$;

-- the instructor's own record, migrated on read — '{}' becomes the empty
-- sections rather than nothing, so every reader gets the same shape whether
-- the instructor has ever saved or not
create or replace function wa.instructor_record_of(p_instructor uuid) returns jsonb
language sql stable set search_path = public, wa, pg_temp as $$
  select wa.migrate_instructor_record(
           coalesce((select ir.data from public.instructor_records ir
                      where ir.instructor_id = p_instructor), '{}'::jsonb))
$$;

-- ══ ROUND 21 (§4x·5) — MY FLIGHT LOGBOOK: THREE SOURCES, ONE ROW SHAPE ═════
-- RULING (2026-08-28): «Στο My Currency να έχουμε έναν πίνακα My Flight
-- Logbook, όπου θα μπαίνει ό,τι βάζει ο κάθε εκπαιδευτής. … αν μπει ένας
-- μαθητής και βάλει πτήση C4101 με [τον εκπαιδευτή] να το βλέπουμε κι εδώ — ή
-- αν προσθέσει κάποιος πτήση στο progress του FDMS.»
--
-- (a) SELF — the caller's own currency rows, PROJECTED (e_items are NOT
--     repeated here: they live in the editable table above; the logbook is the
--     flying, not the events).
-- (b) SP-ENTERED — every flights/fs row of every ACTIVE student's record that
--     names the caller. Deliberately NOT wa.student_in_scope: the ruling says
--     any student's row naming him, and a graduating class closing its
--     assessment window does not un-fly its flights. solo_flights are EXCLUDED
--     (the instructor there AUTHORISED, he was not aboard); the
--     evaluations/fpc/cef evaluator matches are a noted open item (§4x·10).
--     Read-only here — the student's row belongs to the student.
--     ROUND 23, JUDGEMENT RECORDED (§4y·11·9 b): the two fixed sections gained
--     a `duration` this round, and the SP lane was still NOT extended to solo
--     or evaluation rows. A solo names an AUTHORISING instructor (who may not
--     have flown) and a checkride names an EVALUATOR; folding either into «My
--     Flight Logbook» changes what the table MEANS, and that is a ruling, not
--     an inference. What the round did add is the HOURS column, which reads
--     the duration of the rows this lane already lists.
-- (c) FDMS-PROGRESS — the designed, empty slot: a student-record row whose
--     provenance stamp is 'fdms' (`entered_by = 'fdms'`, the value
--     wa.entry_count_by already reserves for bridge slice 3) is labelled
--     src:'fdms' instead of 'sp'.
--     ROUND 24 — THE SLOT IS FILLED, AND ROUND 21's PROMISE HELD LITERALLY:
--     public.bridge_push writes entered_by:'fdms' rows into exactly the two
--     sections this lane already scans, so «Phase 4's FDMS→WA lane lands into a
--     finished surface with NO further logbook change» is now a fact and not a
--     forecast — NOT ONE LINE of this function changed to receive it.
--
-- THE MATCHING RULE — oid-first, surname fallback, shared-surname honesty:
--   1. a row carrying instructor_oid matches iff v.external_oid is non-null
--      and equal — the oid is the unambiguous identity, and surname never
--      overrides it; an oid row that is not his is not listed.
--   2. a row with no oid falls back to folded surnames. A misspelled surname
--      matches nobody and appears in nobody's logbook — the same truth every
--      surname box in the app already lives with; recorded, not papered over.
--   3. `ambiguous: true` on every surname-matched row whose folded surname is
--      shared by MORE THAN ONE role='instructor' row in people (active or not
--      — old rows may name departed men). The row is SHOWN, flagged, counted
--      under counts.sp_ambiguous as well as counts.sp — flagged, never
--      guessed, never silently attributed, never dropped. Both holders of the
--      surname see the row flagged in their own logbooks.
--
-- CAPS, AND THE COUNTS STAY TRUE: self is uncapped (≤400 by
-- wa.ins_section_cap); sp+fdms are capped at the most recent 600 rows
-- POST-SORT, `counts` are computed BEFORE the cap, and truncated/omitted say
-- so in numbers the client turns into words. The scan is one pass over the
-- active students' records, wa.migrate_record ONCE per record (the lateral
-- pattern); the in-scope students are migrated a second time by the students
-- lane of the dataset — accepted and recorded (§4x·5): different populations,
-- and restructuring the students lane to share would couple two lanes for a
-- ≤31-record cost.
create or replace function wa.instructor_logbook(v public.people) returns jsonb
language sql stable set search_path = public, wa, pg_temp as $$
  with cap as (select 600 as n),
  self_rows as (
    select jsonb_build_object(
             'src', 'self',
             'date', e->>'date',
             'sortie', e->>'sortie',
             's_category', e->>'s_category',
             'band', case when nullif(e->>'sortie', '') is not null
                          then wa.sortie_band(e->>'sortie') else null end,
             'kind', e->>'kind',
             'seq', coalesce(nullif(e->>'seq', '')::int, 1),
             'grade', null, 'ng', null, 'mission', null,
             -- ROUND 23 — a CURRENCY row stores no duration: it records WHAT
             -- was flown, not for how long. The Hours column of My Flight
             -- Logbook exists for the student-entered lanes, and a Self row
             -- honestly carries none rather than inventing one.
             'duration', null,
             'student', null, 'match', null, 'ambiguous', false,
             'legacy', ((e->>'s_category') = any(wa.s_category_legacy_ids()))
                       or ((e->>'kind') = 'with_sp'
                           and nullif(trim(coalesce(e->>'s_category', '')), '') is not null)
           ) as row,
           coalesce(e->>'date', '') as d, 0 as srcord, '' as stu,
           coalesce(nullif(e->>'seq', '')::int, 1) as sq
    from jsonb_array_elements(
           coalesce(wa.instructor_record_of(v.id)->'currency', '[]'::jsonb)) e
    where jsonb_typeof(e) = 'object'
  ),
  -- the folded surnames held by MORE THAN ONE instructor row (active or not)
  shared as (
    select lower(btrim(p.last_name)) as ln
    from public.people p
    where p.role = 'instructor'
      and p.last_name is not null and btrim(p.last_name) <> ''
    group by lower(btrim(p.last_name))
    having count(*) > 1
  ),
  sp_hits as (
    select s, b.k as band, x.e,
           case when nullif(x.e->>'instructor_oid', '') is not null
                then 'oid' else 'surname' end as match,
           case when (x.e->>'entered_by') = 'fdms' then 'fdms' else 'sp' end as src,
           coalesce(nullif(x.e->>'seq', '')::int, 1) as sq
    from public.people s
    join public.student_records r on r.student_id = s.id
    -- the read-time migration runs ONCE per record, not once per question
    cross join lateral (select wa.migrate_record(coalesce(r.data, '{}'::jsonb)) as rec) m
    cross join lateral unnest(array['flights', 'fs']) b(k)
    cross join lateral jsonb_array_elements(coalesce(m.rec->b.k, '[]'::jsonb)) x(e)
    where s.role = 'student' and s.active
      and jsonb_typeof(x.e) = 'object'
      and case
            when nullif(x.e->>'instructor_oid', '') is not null
              then v.external_oid is not null
               and x.e->>'instructor_oid' = v.external_oid
            else nullif(lower(btrim(coalesce(x.e->>'instructor', ''))), '') is not null
             and lower(btrim(coalesce(x.e->>'instructor', ''))) =
                 lower(btrim(coalesce(v.last_name, '')))
          end
  ),
  sp_built as (
    select jsonb_build_object(
             'src', src,
             'date', e->>'date',
             'sortie', e->>'sortie',
             's_category', null,
             'band', band,
             'kind', e->>'kind',
             'seq', sq,
             'grade', e->'grade',
             'ng', coalesce((case when jsonb_typeof(e->'ng') = 'boolean'
                                  then (e->>'ng')::boolean end), false),
             'mission', e->>'mission',
             -- ROUND 23 — THE TIME FLOWN, from the student's own row. «Oi WA-21
             -- logbook rows carry the duration where they already show flight
             -- data»: this lane already prints the student's grade, NG and
             -- mission, so the one flight fact it was missing rides with them.
             'duration', e->'duration',
             'student', jsonb_build_object('last_name', (s).last_name,
                                           'first_name', (s).first_name,
                                           'class', (s).class),
             'match', match,
             'ambiguous', match = 'surname'
               and lower(btrim(coalesce(e->>'instructor', ''))) in (select ln from shared),
             'legacy', coalesce((case when jsonb_typeof(e->'legacy') = 'boolean'
                                      then (e->>'legacy')::boolean end), false)
           ) as row,
           coalesce(e->>'date', '') as d,
           case when src = 'fdms' then 2 else 1 end as srcord,
           coalesce((s).last_name, '') as stu, sq, src,
           (match = 'surname'
            and lower(btrim(coalesce(e->>'instructor', ''))) in (select ln from shared)) as amb
    from sp_hits
  ),
  ncounts as (
    select (select count(*) from self_rows) as n_self,
           (select count(*) from sp_built where src = 'sp') as n_sp,
           (select count(*) from sp_built where src = 'sp' and amb) as n_amb,
           (select count(*) from sp_built where src = 'fdms') as n_fdms
  ),
  sp_capped as (
    select row, d, srcord, stu, sq
    from sp_built
    order by d desc, srcord, stu, sq desc
    limit (select n from cap)
  ),
  merged as (
    select row, d, srcord, stu, sq from self_rows
    union all
    select row, d, srcord, stu, sq from sp_capped
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(row order by d desc, srcord, stu, sq desc)
                      from merged), '[]'::jsonb),
    'counts', (select jsonb_build_object('self', n_self, 'sp', n_sp,
                                         'sp_ambiguous', n_amb, 'fdms', n_fdms)
               from ncounts),
    'truncated', (select n_sp + n_fdms > (select n from cap) from ncounts),
    'omitted', (select greatest(n_sp + n_fdms - (select n from cap), 0) from ncounts))
$$;

-- ── the ONE instructor dataset ────────────────────────────────────────────
-- students + their self-reported cards + THIS instructor's proposal per
-- student. Used by public.list_students_for_instructor (the instructor) and
-- public.admin_get_proposals_of (the admin on their behalf).
--
-- ROUND 18 — AND IT IS THE SCOPED CLASS, NOT EVERY ACTIVE STUDENT. «Θελουμε
-- την σειρα την οποια τελειωνει, οχι ολες τις ενεργες.» The filter is the SAME
-- predicate the write path refuses on (wa.student_in_scope), so the form can
-- never list a card whose Save would be refused, nor hide a student whose
-- assessment would land. With no class open the list is EMPTY and the client
-- says why — `assessment_class` travels with the payload for exactly that: an
-- empty list with no reason attached is a blank page, and a blank page reads
-- as a broken link rather than as a decision somebody made.
create or replace function wa.instructor_dataset(v public.people) returns jsonb
language sql stable set search_path = public, wa, pg_temp as $$
  select jsonb_build_object(
    'me', wa.person_json(v),
    'assessment_class', wa.assessment_class(),
    -- ROUND 19 — THE INSTRUCTOR'S OWN CURRENCY RIDES WITH HIS FORM. It is his
    -- record, on his form, in the same round trip as the cards: a second call
    -- would be a second chance for the page to render half of itself. The
    -- admin's on-behalf view gets it too — read-only there, because
    -- wa.write_instructor_record has no admin path at all.
    'currency', wa.instructor_record_of(v.id) -> 'currency',
    'currency_last_update', (select ir.last_update from public.instructor_records ir
                              where ir.instructor_id = v.id),
    -- ROUND 21 — THE LOGBOOK RIDES WITH THE SAME DOOR, in the same round trip
    -- (the §4u house rule: one round trip per door — a second call would be a
    -- second chance for the page to render half of itself). The admin's
    -- on-behalf view inherits it read-only for free. NOT exported: it is a
    -- projection recomputable from student_records + instructor_records +
    -- people, and an export that shipped both sources and projection would
    -- eventually disagree with itself (§4x·7).
    'logbook', wa.instructor_logbook(v),
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
      where s.role = 'student' and s.active
        and wa.student_in_scope(s)), '[]'::jsonb))
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
-- ROUND 14 — AND IT IS ORDERED BY SENIORITY. The payload is still surnames and
-- nothing else, so the ORDER is the only channel the ruling («HAF πρωτα, ITAF
-- μετα», call sign natural within each) has into this list: the client cannot
-- re-sort what it cannot see. Two instructors sharing a surname collapse to one
-- entry — the picker is a list of names — and it takes the SENIOR one's key, so
-- a shared surname lands where the more senior of the two belongs.
create or replace function wa.instructor_surnames() returns jsonb
language sql stable set search_path = public, wa, pg_temp as $$
  select coalesce((
    select jsonb_agg(t.ln order by t.k, t.ln)
    from (select p.last_name as ln, min(wa.seniority_key(p)) as k
          from public.people p
          where p.role = 'instructor' and p.active
            and p.last_name is not null and btrim(p.last_name) <> ''
          group by p.last_name) t), '[]'::jsonb)
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
-- the admin set comes through UNCHANGED and still stamped — a payload that
-- alters or drops one is refused (see wa.carry_stamps).
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

-- the OWNER saving: the proposal becomes self-reported again (an admin stamp is
-- cleared the moment the instructor saves it themselves).
create or replace function public.save_proposal(p_token text, p_student_id uuid, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'instructor');
  return wa.write_proposal(v.id, p_student_id, p_payload, false);
end $$;

-- ── ROUND 19 — THE INSTRUCTOR SAVES HIS OWN CURRENCY ──────────────────────
-- The whole section in one act, exactly as the student form saves a record:
-- rows are added and removed as well as edited, so a per-row RPC would have to
-- invent a row identity that survives a page the user is still editing.
-- THE TOKEN IS THE IDENTITY. There is no p_instructor_id: the row this writes
-- belongs to whoever holds the link, and a parameter naming somebody else
-- would be a way to file a flight under another instructor's name. Revoking a
-- link (public.admin_set_active → active = false) closes this the same instant
-- it closes the assessments — wa.auth_role refuses an inactive person.
create or replace function public.save_instructor_currency(p_token text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'instructor');
  return wa.write_instructor_record(v.id, p_payload);
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
           -- ROUND 14 — role first (the People table's three blocks), then
           -- SENIORITY inside each: HAF before ITAF, call sign natural within
           order by p.role, wa.seniority_key(p), p.last_name, p.first_name)
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
    -- not to this database: the admin may ADOPT a hand-made person into the
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

-- ══ ROUND 18 — THE ONE CONTROL THAT OPENS AND CLOSES THE ASSESSMENTS ═══════
-- «Στο μελλον θα επιλεγουμε για ποια ταξη θα στελνουμε προτασεις αξιοποιησης.»
-- ONE class name, or nothing. Passing null / '' closes the assessments: the
-- instructor form lists nobody, every write is refused, and NOTHING STORED IS
-- TOUCHED — this function writes one row of wa.settings and reads no other
-- table for anything but the guard below.
--
-- THE GUARD: A CLASS NOBODY IS IN CANNOT BE OPENED. The control offers the
-- classes that exist, so a name outside them arrives only from a typo, a stale
-- tab or a hand-rolled call — and every one of those silently closes the
-- assessments for the whole squadron while the dashboard claims a class is
-- open. So it is refused, and the refusal NAMES what does exist, because the
-- admin's next act is to pick one of them. (A class whose last student was
-- deactivated afterwards therefore cannot be re-selected — it is no longer a
-- class. It also cannot be silently rewritten to «all»: a stale scope stays
-- closed, which is the safe direction. The dashboard shows it, marked.)
create or replace function public.admin_set_assessment_class(p_token text, p_class text)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare
  v public.people;
  want text;
  have text[];
begin
  v := wa.auth_role(p_token, 'admin');
  want := nullif(btrim(coalesce(wa.norm_line(coalesce(p_class, '')), '')), '');
  if want is not null then
    perform wa.chk(length(want) <= 40, 'assessment_class',
                   'a class name is at most 40 characters');
    select coalesce(array_agg(distinct btrim(s.class) order by btrim(s.class)), array[]::text[])
      into have
      from public.people s
     where s.role = 'student' and s.active
       and nullif(btrim(coalesce(s.class, '')), '') is not null;
    if not (want = any(have)) then
      raise exception 'WA: no active student is in class % — assessments cannot be opened for a class nobody is in. The classes on the roster are: %. Choose one of them, or «none» to close the assessments.',
        want, coalesce(nullif(array_to_string(have, ' · '), ''), '(none — no active student carries a class)');
    end if;
  end if;

  insert into wa.settings (key, value) values ('assessment_class', want)
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('ok', true,
    'assessment_class', wa.assessment_class(),
    'students', (select count(*) from public.people s
                  where s.role = 'student' and s.active and wa.student_in_scope(s)));
end $$;

-- ── ENTER ON BEHALF (round 4) ─────────────────────────────────────────────
-- The admin must be able to enter and edit information FOR ANYONE — a student who
-- cannot reach their link, an instructor who dictates his ranking over the
-- phone. Transparency is the price: what the admin writes carries
-- entered_by='admin', which the views render as a small "ADMIN" tag.
-- A PROPOSAL is one row and is stamped as a whole. A RECORD is a list of
-- entries, so round 4b decides it entry by entry: the payload is diffed
-- against the stored record and only the entries the admin added or changed are
-- stamped (wa.stamp_record_diff). The stamps survive further admin saves — an admin
-- re-save that changes nothing changes nothing — and are all cleared the
-- moment the OWNER saves: reclaiming their own data makes it self-reported.
-- SECURITY: admin role only (a student/instructor token raises), and the
-- validation pipeline is the SAME one the owner goes through — wa.write_record
-- / wa.write_proposal — so an admin typo is refused exactly like a student typo.

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
    -- the admin fills in the SAME form and gets the SAME picker (round 9)
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
        -- how many entries the admin wrote, out of how many the record holds:
        -- 1 of 18 is a self-reported record with one admin addition, 18 of 18 is
        -- a record the admin entered. The dashboard must not confuse the two.
        'co_entries', wa.co_entry_count(m.rec),
        -- ROUND 24 — AND HOW MANY CAME FROM THE SQUADRON'S SCHEDULER. Beside
        -- co_entries and counted the same way, NEVER folded into it: a row a
        -- machine pushed is not a row the admin wrote, and conflating the two
        -- would be a truth defect in the very feature that exists to be honest
        -- about provenance (wa.entry_count_by's own comment, since round 12).
        'fdms_entries', wa.entry_count_by(m.rec, 'fdms'),
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
               -- ROUND 14 — seniority, not the alphabet (wa.seniority_key)
               order by wa.seniority_key(ip), ip.last_name)
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
          -- and WHO said it: the admin reads a level with the names beside it
          'by_level', coalesce((
            select jsonb_object_agg(k.lvl, coalesce(c.names, '[]'::jsonb))
            from unnest(wa.level_keys()) k(lvl)
            left join lateral (
              select jsonb_agg(coalesce(i2.rank || ' ', '') || i2.last_name
                               order by wa.seniority_key(i2), i2.last_name) as names
              from public.proposals p2
              join public.people i2 on i2.id = p2.instructor_id and i2.active
              where p2.student_id = s.id and p2.level = k.lvl) c on true), '{}'::jsonb),
          -- ROUND 8's RULE SURVIVES THE RESHAPE: the two silences are still
          -- not the same silence. `no_level` = he submitted and formed no
          -- view; `not_submitted` (below) = he has not answered at all.
          'no_level', coalesce((
            select jsonb_agg(coalesce(i2.rank || ' ', '') || i2.last_name
                             order by wa.seniority_key(i2), i2.last_name)
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
        select jsonb_agg(coalesce(ip.rank || ' ', '') || ip.last_name
                         order by wa.seniority_key(ip), ip.last_name)
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
                               where pr.instructor_id = p.id),
           -- ROUND 19 — HIS OWN CURRENCY, READ-ONLY, ON THE DASHBOARD. The
           -- admin can see what an instructor claims he flew; he cannot write
           -- it (wa.write_instructor_record has no admin path), so this is a
           -- READ and the People drill-down renders it as one.
           'currency', wa.instructor_record_of(p.id) -> 'currency',
           'currency_last_update', (select ir.last_update
                                    from public.instructor_records ir
                                    where ir.instructor_id = p.id))
         -- ROUND 14 — the squadron's own order, everywhere it lists people
         order by wa.seniority_key(p), p.last_name), '[]'::jsonb)
  into instructors
  from public.people p where p.role = 'instructor';

  return jsonb_build_object(
    'students', students,
    'instructors', instructors,
    -- ROUND 18 — the class the instructors are being asked about. It travels
    -- with the dashboard's own dataset and NARROWS NOTHING IN IT: `students`
    -- above is still every active student and `proposals` still every stored
    -- assessment, whatever class it belongs to. This is the value the control
    -- reads back so it can show what is currently open.
    'assessment_class', wa.assessment_class(),
    'generated_at', now());
end $$;

-- ── THE CREDENTIAL'S STATE, AND NEVER ITS DIGEST (round 24) ───────────────
-- Everything a surface may know about the bridge credential: whether one was
-- ever minted, whether it is armed, and the three dates. `token_sha256` is not
-- returned, not counted and not hinted at — the §4φ rule («καμία εντολή δεν
-- επιστρέφει ποτέ στήλη token») extended by name to a column that is only a
-- digest and is still nobody's business.
-- `exists` IS DERIVED FROM THE DIGEST AND `active` IS THE COLUMN, and the table
-- itself guarantees they cannot disagree (bridge_access_armed_chk): the state
-- «active with nothing to authenticate» is not expressible, so this card can
-- never print «active since …» for a credential that would refuse every call —
-- which is exactly what the first draft of the table allowed.
create or replace function wa.bridge_status_json() returns jsonb
language sql stable set search_path = public, wa, pg_temp as $$
  select coalesce((select jsonb_build_object(
           'exists', b.token_sha256 is not null,
           'active', b.active,
           'minted_at', b.minted_at,
           'last_used_at', b.last_used_at,
           'revoked_at', b.revoked_at)
         from wa.bridge_access b where b.id = 1),
         jsonb_build_object('exists', false, 'active', false,
                            'minted_at', null, 'last_used_at', null,
                            'revoked_at', null))
$$;

-- raw export (JSON download / CSV built client-side) — tokens excluded
--
-- ══ ROUND 19 — THE PAYLOAD SAYS WHAT IT IS: "schema": "wa-export-v1" ═══════
-- The FDMS Bridge accepts this file MARKED OR UNMARKED, because until now
-- there was nothing to mark it with — and an importer that has to guess is an
-- importer whose guard can be walked past by any JSON that happens to carry a
-- `people` array. The stamp closes that: from this round the file names its
-- own format in its own first field, the bridge's store-Import can demand it,
-- and the unmarked branch becomes what it always should have been — a
-- compatibility path for files exported before today, not the normal case.
-- THE VALUE IS A CONTRACT AND IT IS VERSIONED. `wa-export-v1` describes the
-- SHAPE below, not the round that wrote it: adding a key (this round adds
-- `instructor_records`) leaves a v1 reader working, because a reader that
-- ignores what it does not know still gets every field it came for. Only a
-- change that BREAKS such a reader — a key renamed, a type changed, a section
-- removed — may move it to v2, and nothing here may move it silently.
--
-- ══ ROUND 24 — ONE BODY, TWO DOORS (P45-WA) ═══════════════════════════════
-- The FDMS bridge reads Wings Ahead through public.bridge_pull, and what it must
-- read is THE EXPORT — the same shape, the same marker, the same reader on the
-- far side (the bridge's parseExport is not taught a second format). Writing the
-- payload twice would have been two payloads that drift apart on the first round
-- that adds a key to one of them. So the body is ONE function and the two RPCs
-- are two doors onto it, differing in exactly two declared ways:
--   · `proposals` — admin only. The assessments are the one payload with real
--     judgement sensitivity and zero bridge use; minimum leakage cuts there
--     (design decision #10), and the cut is a BOOLEAN ARGUMENT so it is visible
--     in the signature rather than hidden in a branch.
--   · `via` — the bridge door stamps `"via": "bridge"` on its answer, so a file
--     saved from a live pull can never be mistaken for an admin download.
-- Everything else is identical, `instructor_records` and `currency_kinds`
-- included: the currency lane is the named next errand of this same credential.
--
-- ══ P45-WAe — THE MIGRATION IS READ ONCE PER RECORD, AND THE CTE IS WHY ═════
-- THE DEFECT THIS FIXES WAS INVISIBLE IN THE OUTPUT AND FATAL IN THE CLOCK.
-- The student-records block used to read
--     from public.student_records r
--     cross join lateral (select wa.migrate_record(r.data) as rec) m
-- and then name `m.rec` FIVE times (data · record_stamp · co_entries ·
-- fdms_entries · entries_total — and wa.record_stamp names it twice more once
-- the planner inlines it). A LATERAL sub-select with no FROM is not a variable:
-- PostgreSQL FLATTENS it (pull_up_simple_subquery) and substitutes the
-- expression at every reference, so wa.migrate_record ran ~5 TIMES PER RECORD.
-- Nobody could see it, because every one of those runs returns the same bytes.
-- MEASURED, on the round's scratch dataset (44 records / 2 200 flight rows /
-- a 1.55 MB answer, local stack): wa.export_body(false) took 15.7–16.7 s, and
-- timed block by block ~15.7 s of that was THIS ONE BLOCK; with the lateral
-- materialised the same block is 3.4 s — the SAME PAYLOAD, byte for byte, for a
-- fifth of the work. The rest of the round (wa.norm_entry · wa.strip_entry · the
-- final pass) took the whole door from there to 0.83 s over REST as anon.
-- `as materialized` is the whole cure and it is a PROMISE, not a hint: the CTE
-- is evaluated once and its columns are read, never re-derived. An audit block
-- at the foot of this file asserts that the word is still here and that
-- wa.migrate_record is named exactly ONCE in this body — because a later round
-- that «tidied» the CTE back into a lateral would re-arm a 5× cost that no
-- test, no diff and no reader can see.
create or replace function wa.export_body(p_with_proposals boolean) returns jsonb
language plpgsql stable set search_path = public, wa, pg_temp as $$
declare o jsonb; recs jsonb; ins jsonb;
begin
  with m as materialized (
    select r.student_id, r.data, r.entered_by, r.last_update,
           wa.migrate_record(r.data) as rec
      from public.student_records r)
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', m.student_id,
           'data', m.rec,
           'data_as_stored', m.data,
           'entered_by', wa.record_stamp(m.rec, m.entered_by),
           'co_entries', wa.co_entry_count(m.rec),
           -- ROUND 24 — the bridge's own count, beside the
           -- admin's and never inside it (see admin_get_data)
           'fdms_entries', wa.entry_count_by(m.rec, 'fdms'),
           'entries_total', wa.entry_count(m.rec),
           'last_update', m.last_update)), '[]'::jsonb)
    into recs
    from m;

  -- the same treatment for the instructor records, where the re-derivation was
  -- not the planner's doing but the text's: wa.migrate_instructor_record was
  -- WRITTEN four times in the block below, once per key that needed it.
  with mi as materialized (
    select ir.instructor_id, ir.data, ir.last_update,
           wa.migrate_instructor_record(ir.data) as rec
      from public.instructor_records ir)
  select coalesce(jsonb_agg(jsonb_build_object(
           'instructor_id', mi.instructor_id,
           'data', mi.rec,
           'data_as_stored', mi.data,
           'entries_total', wa.ins_entry_count(mi.rec),
           'legacy_rows', wa.ins_legacy_count(mi.rec),
           'withsp_legacy_rows', wa.ins_withsp_scat_count(mi.rec),
           'last_update', mi.last_update)), '[]'::jsonb)
    into ins
    from mi;

  o := jsonb_build_object(
    'schema', 'wa-export-v1',
    'exported_at', now(),
    'people', coalesce((select jsonb_agg(wa.person_json(p)
                          order by p.role, wa.seniority_key(p), p.last_name)
                        from public.people p), '[]'::jsonb),
    'student_records', recs,
    -- ROUND 10: the assessment and its weight. The frozen rank_* / nr_*
    -- columns are not exported either — the export is what the app knows, and
    -- the app no longer knows anything about aircraft types.
    -- ROUND 24 — AND THE BRIDGE DOOR DOES NOT GET THIS ONE. It is built here
    -- and STRIPPED at the foot of the function (see there for why removing the
    -- key is the only honest way to leave it out). Both answers are still
    -- `wa-export-v1` — the marker describes the shape of what is present
    -- (§4u·9), and a v1 reader that came for `people` still gets it.
    'proposals', coalesce((
                   select jsonb_agg(jsonb_build_object(
                    'instructor_id', pr.instructor_id, 'student_id', pr.student_id,
                    'level', pr.level,
                    'level_label', wa.level_label(pr.level),
                    'weight', wa.level_weight(pr.level),
                    'flew_with', pr.flew_with, 'comment', pr.comment,
                    'entered_by', pr.entered_by,
                    'updated_at', pr.updated_at)) from public.proposals pr), '[]'::jsonb),
    -- ROUND 19 — THE BRIDGE LANE. The instructors' own currency claims, in the
    -- same shape the form wrote them and the same shape the read gives back
    -- (wa.migrate_instructor_record runs here too, so an export can never
    -- carry a key the section has retired). `data_as_stored` is kept beside it
    -- for the same reason the student records keep theirs: the migration is a
    -- READ, and an export that showed only its output could not prove what the
    -- table actually holds.
    -- ROUND 20 — `legacy_rows` rides along because a bridge must be able to
    -- ask «which of these still need a hand?» without knowing what a legacy id
    -- looks like. It counts the rows whose Σ was never recorded (§4v·1).
    -- ROUND 21 — `withsp_legacy_rows` is the second such number: the with-SP
    -- rows still carrying the old form's Σ claim (§4x·2). And the migrated
    -- `data` already carries the NEW kind keys (continuation / with_sp), so
    -- exports say what the surfaces say without a reader translating.
    -- P45-WAe — built above, from a materialised CTE, for the reason written at
    -- the head of this function: the four spellings of
    -- wa.migrate_instructor_record that used to stand here were four migrations
    -- of the same record per row.
    'instructor_records', ins,
    -- ROUND 21 — the closed kind list, with its printed labels, so no reader
    -- ever hardcodes 'continuation'/'with_sp' the way it never hardcodes a Σ
    -- slug. ADDITIVE, so the stamp stays `wa-export-v1` (§4x·7): §4u·9's
    -- promotion rule triggers on a change that BREAKS an existing reader, the
    -- only prospective reader of `kind` values is the bridge's currency lane
    -- (slice 6, unshipped), and no shipped reader switch-cases on
    -- 'own'/'student'.
    'currency_kinds', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', t.id, 'label', wa.currency_kind_label(t.id)) order by t.ord)
                      from unnest(wa.currency_kinds()) with ordinality t(id, ord)), '[]'::jsonb),
    -- and the closed list the ids above were chosen from, so a reader that has
    -- never seen the 3-01 can still print «Ε-32 — BFM» instead of a slug
    'e_items', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', t.id, 'name', wa.e_item_name(t.id)) order by t.ord)
                from unnest(wa.e_item_ids()) with ordinality t(id, ord)), '[]'::jsonb),
    -- ROUND 20 — and the OTHER closed list, for the same reason. A reader gets
    -- the printed name, the programme the category belongs to and whether the
    -- id is a legacy placeholder, so «legacy-aeros-unspecified» is never a slug
    -- the bridge has to recognise by spelling.
    's_categories', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', t.id,
                      'name', wa.s_category_name(t.id),
                      'programme', wa.s_category_group(t.id),
                      'programme_name', wa.currency_category_name(
                                          wa.s_category_group(t.id)),
                      'legacy', t.id = any(wa.s_category_legacy_ids())) order by t.ord)
                    from unnest(wa.s_category_ids()) with ordinality t(id, ord)), '[]'::jsonb),
    -- ══ ROUND 24 — WHAT WINGS AHEAD REMEMBERS THE BRIDGE DOING ═════════════
    -- Two blocks, in BOTH doors: the admin's own download shows the bridge's
    -- history for the same reason the FDMS report needs it — «what WA remembers
    -- happening» has to be renderable beside «what the FDMS ledger claims», and
    -- a drift between the two is a report line rather than a silence.
    -- NO NAMES: a tombstone is (roster oid, section, handle, rid, reason) and an
    -- audit row is the same plus its verdict. The audit tail is the LAST 200
    -- rows — enough to explain a week, small enough that an export stays a file
    -- a person can open, and honest about being a tail (`audit_total` says how
    -- many there are, so a reader is never left thinking 200 is all of it).
    'bridge', jsonb_build_object(
      'tombstones', coalesce((select jsonb_agg(jsonb_build_object(
                        'student_oid', t.student_oid, 'student_id', t.student_id,
                        'section', t.section, 'sortie', t.sortie, 'date', t.date,
                        'seq', t.seq, 'rid', t.rid, 'reason', t.reason,
                        'at', t.at, 'cleared_at', t.cleared_at) order by t.at desc)
                      from wa.bridge_tombstones t), '[]'::jsonb),
      'audit_total', (select count(*) from wa.bridge_audit),
      'audit_tail', coalesce((select jsonb_agg(jsonb_build_object(
                        'at', a.at, 'student_oid', a.student_oid, 'op', a.op,
                        'section', a.section, 'sortie', a.sortie, 'date', a.date,
                        'seq', a.seq, 'rid', a.rid, 'verdict', a.verdict,
                        'note', a.note) order by a.at desc, a.id desc)
                      from (select * from wa.bridge_audit
                             order by at desc, id desc limit 200) a), '[]'::jsonb),
      -- the credential's STATE and never its digest: booleans and dates, the
      -- §4φ rule («καμία εντολή δεν επιστρέφει ποτέ στήλη token») applied to a
      -- column that is not a token but is not anybody's business either
      'credential', wa.bridge_status_json()));
  -- THE KEY IS REMOVED, NOT EMPTIED. `jsonb_build_object('proposals', NULL)`
  -- would have written `"proposals": null` — a reader cannot tell that from «no
  -- assessments recorded», and one of the two readings is false. Stripping the
  -- key says «not in this payload», which is the only true thing to say.
  if not p_with_proposals then o := o - 'proposals'; end if;
  return o;
end $$;

-- THE ADMIN'S DOOR — unchanged in every observable way except the two keys the
-- round adds (`fdms_entries` per student record, and the `bridge` block). Still
-- `wa-export-v1`: both are ADDITIVE, and a v1 reader that ignores what it does
-- not know still gets every field it came for (§4u·9's promotion rule fires on
-- a key RENAMED, a type CHANGED or a section REMOVED — none happened here).
create or replace function public.admin_export(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  return wa.export_body(true);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROUND 24 (P45-WA) — THE BRIDGE'S OWN RPCs
-- ───────────────────────────────────────────────────────────────────────────
-- Five doors. Three are the ADMIN's (mint · revoke · status) and open with the
-- admin token like every other admin_* RPC; two are the BRIDGE's (pull · push)
-- and open with the digest credential and with nothing else. No door opens with
-- both, in either direction, and that is structural rather than checked:
-- wa.auth looks a caller up in public.people, wa.auth_bridge looks one up in
-- wa.bridge_access, and no row is ever in both tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── STATUS — booleans and dates (never the digest) ────────────────────────
create or replace function public.admin_bridge_status(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  return wa.bridge_status_json();
end $$;

-- ── MINT — the plaintext exists once, in this answer ──────────────────────
-- ROTATION IS MINTING (design decision #2). There is exactly one credential, so
-- a second mint OVERWRITES the first digest: every holder of the old token —
-- the developer's browser, his other device, the weekly backup Action — is out
-- at its next call, with no list of holders to walk and nothing left half-armed.
-- That is the price of one switch that closes every lane at once, and it is the
-- right price for a squadron of one owner.
-- TWO wa.gen_token()s, because one is 144 bits of the same alphabet the login
-- tokens use and this credential guards a wider door than any single person's.
-- WHAT THE DATABASE KEEPS IS THE DIGEST. It cannot echo the plaintext later
-- because it never stored it — a stronger guarantee than the §4φ rule it
-- serves, and the reason `token` appears in this file exactly once more, in the
-- return value of this function, on the admin's own screen.
create or replace function public.admin_bridge_mint(p_token text) returns jsonb
language plpgsql volatile security definer
set search_path = public, wa, extensions, pg_temp as $$
declare v public.people; t text;
begin
  v := wa.auth_role(p_token, 'admin');
  t := wa.gen_token() || wa.gen_token();
  insert into wa.bridge_access as b (id, token_sha256, active, minted_at, revoked_at)
  values (1, encode(digest(t, 'sha256'), 'hex'), true, now(), null)
  on conflict (id) do update
    set token_sha256 = excluded.token_sha256,
        active       = true,
        minted_at    = now(),
        last_used_at = null,
        revoked_at   = null;
  return jsonb_build_object('token', t, 'status', wa.bridge_status_json());
end $$;

-- ── REVOKE — idempotent, and it keeps the digest ──────────────────────────
-- The row is not deleted and the digest is not cleared, on purpose: `revoked_at`
-- has to mean something, and «there was a credential and it was withdrawn on
-- the 29th» is a fact the People card prints. Authentication asks for `active`,
-- so a revoked digest matches nothing (proven live: the same one sentence).
create or replace function public.admin_bridge_revoke(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare v public.people;
begin
  v := wa.auth_role(p_token, 'admin');
  update wa.bridge_access
     set active = false,
         revoked_at = coalesce(revoked_at, now())
   where id = 1 and active;
  return wa.bridge_status_json();
end $$;

-- ── PULL — the export-equivalent read, and it is VOLATILE ─────────────────
-- MUST-FIX 1 OF THE ADVERSARIAL READ, and the fragment's own comment proved the
-- premise live: wa.auth_bridge touches `last_used_at`, PostgREST runs a STABLE
-- function inside a READ ONLY transaction, and a `stable` pull would therefore
-- have died with «cannot execute UPDATE in a read-only transaction» on EVERY
-- call — including the setup Test, bricking onboarding with a Postgres error
-- where the design promised the server's own sentence. `volatile` is the cure
-- and it costs nothing: the call is a POST either way (design decision #15, and
-- the whole reason the Cloudflare-Worker lift of E.4 is a URL swap and not a
-- contract change).
--
-- WHAT `volatile` DOES NOT BUY, corrected in P45-WAb (F3): it does NOT make the
-- door POST-ONLY. PostgREST routes a GET here too, inside a READ ONLY
-- transaction, and until F3 the status code of that GET told a live credential
-- from a dead one — 400 for the house sentence raised before the last_used_at
-- UPDATE, 405 for the UPDATE that a live token reached. The refusal is
-- wa.auth_bridge's first act now, before any comparison, so the GET answers
-- identically whatever it carries. Read it there; it is not repeated here,
-- because the guard is not repeated here either.
--
-- IT RETURNS NO TOKEN COLUMN OF ANY KIND. wa.person_json has been tokenless by
-- construction since round 1; `token_sha256` is not in the body either — the
-- `bridge.credential` block is wa.bridge_status_json, which is booleans and
-- dates. So a stolen bridge credential reads the roster and the records and
-- CANNOT read one login token: the whole point of giving the lane a table of
-- its own instead of a fourth wa_role.
create or replace function public.bridge_pull(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
begin
  perform wa.auth_bridge(p_token);
  return wa.export_body(false) || jsonb_build_object('via', 'bridge');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PUSH — THE SERVER-SIDE SURGEON
-- ───────────────────────────────────────────────────────────────────────────
-- THE SHAPE OF THE CALL. One student, a list of ops, one transaction:
--   p_ops = [ { "op": "upsert" | "remove",
--               "section": "flights" | "fs",
--               "rid": "<the FDMS date-free identity>",
--               "prev": <the row AS THE BRIDGE LAST WROTE IT> | null,
--               "row":  { date, track, sortie, seq, kind, instructor,
--                         instructor_oid, grade, ng, mission },   -- upsert only
--               "clear_tombstone": false,
--               "reason": "undo" | "source_removed" | "developer" } ]  -- remove
--
-- `prev` CHANGED SHAPE IN P45-WAc, AND IT IS THE ONE WIRE CHANGE OF THAT ROUND.
-- It used to be the three fields that NAME the row — sortie, date, seq — and a
-- name is not a proof: the caller is standing on that handle already, so
-- repeating it says nothing an identity that never wrote the row could not also
-- say. `prev` is now the ROW, the same facts in the same keys as `row`, and it
-- is compared with what actually stands at the handle (F1 below). A removal
-- names its row the same way — `prev`, or `row` when it sends no `prev`.
--
-- WHY A SURGEON AND NOT A COURIER (design decision #3). The study's first shape
-- had the client READ the record, modify it and send the whole thing back. That
-- shape is dead on arrival here, and the local stack is the proof: one of the
-- four stored records fails wa.validate_record on its own migrated form, so a
-- courier push would be PERMANENTLY REFUSED for that student — over an SMS row
-- the bridge does not touch, cannot see and could never fix. The surgery
-- happens here instead: the ops are applied to the STORED record, and only the
-- sections they touched are re-validated (wa.validate_section). The untouched
-- eleven are not serialized, not sent, not re-validated and not rewritten.
--
-- VERDICTS, NOT EXCEPTIONS. One bad op must never void its nine siblings, so
-- every per-op outcome — including a section that would not validate with the
-- op applied — is a VERDICT (wa.bridge_verdicts) and the op is simply not
-- applied. Only the ENVELOPE raises: a bad credential, an unknown or ambiguous
-- OID, an inactive student, a p_ops that is not an array.
--
-- THE FOUR THINGS IT NEVER DOES.
--   · It never overwrites a row it does not own. A handle occupied by a
--     student's row or an admin's row is answered `exists_student` /
--     `exists_admin`, the row is RETURNED IN FULL so the FDMS report can show
--     both versions, and nothing is written.
--   · It never overwrites a row it owns but was not TOLD about (P45-WAb F2,
--     P45-WAc F1), and here is EXACTLY what that is worth, in the two
--     sentences the code can actually stand behind:
--       — AN UPSERT THAT DOES NOT CLAIM A REPLACEMENT CANNOT OVERWRITE ONE.
--         `prev` is what says «I am replacing the row standing here»; an upsert
--         without one is a CREATE, and a create landing on a handle that
--         already holds a BRIDGE row is `exists_fdms` — not `updated`.
--       — A CLAIMED REPLACEMENT MUST PROVE KNOWLEDGE OF THE ROW IT REPLACES.
--         `prev` is compared, fact for fact, with the row standing at the
--         handle (wa.entry_core, through wa.bridge_row); a `prev` that does not
--         match is `exists_fdms` and nothing is written. The same test guards
--         the `remove` verb, which used to need no proof at all.
--     The stored row carries no rid by design, so Wings Ahead can see THAT
--     another FDMS identity holds the handle and never WHICH; overwriting on a
--     guess is how one flight silently becomes another and an undo stops
--     sticking. The audit tail carries both rids at the handle for the
--     cross-check.
--     WHAT IT IS NOT, said in the same breath, because the P45-WAb headline
--     («two rids CANNOT silently share one handle») over-claimed and a claim
--     this file cannot prove is worth less than no claim at all:
--       — BYTE-IDENTICAL TWINS REMAIN INDISTINGUISHABLE. If two identities
--         describe the same flight with the same facts, the second one's `prev`
--         genuinely matches and its `row` is genuinely already there — to this
--         database they are one row, and no test written HERE can separate
--         them. That dedup is P45-FDMS's, by pairing on evId.
--       — AND THIS IS AN INTEGRITY GATE, NOT AN AUTHORISATION BOUNDARY. One
--         bridge credential serves the whole FDMS instance and public.bridge_pull
--         returns the records, so a caller that reads first can always compose a
--         `prev` that matches. What the gate stops is the failure this lane
--         actually suffers: a queue that has lost track of which identity holds
--         a handle, pushing a change it never had the facts for.
--   · It never accepts provenance from the wire. `entered_by` is set HERE, to
--     'fdms', on every row it writes; a client that sends one is refused by
--     name. Provenance is a property of which function was called, exactly as
--     `p_as_admin` is on wa.write_record.
--   · It never bakes the migration into storage. The write-back is SURGICAL —
--     `data = <stored, untouched> || {the touched sections}` — so a record whose
--     owner has never opened a form keeps its raw truth in `data_as_stored` and
--     everywhere else. (A whole-record `data = wa.migrate_record(...)` would
--     have replaced every stored record's raw form ~5 s after any training-log
--     write, with no human in the loop. Today only a human save bakes it.)
--
-- AND A FIFTH, ADDED IN P45-WAd BECAUSE IT WAS THE ROUND'S WHOLE SUBJECT:
--   · IT NEVER NORMALISES A VALUE IT CANNOT READ — IT REFUSES IT BY NAME.
--     The migration this lane reads through is CHARITABLE by design: it writes
--     'syllabus' over a kind the registry does not know, `false` over an `ng`
--     that is not a boolean, `1` over a `seq` that is not a number, and that
--     charity is right and load-bearing for a HUMAN's stored row — a record
--     whose owner cannot save it is worse than a record read generously, and
--     round 12's whole log-table migration exists to say so. It is WRONG on
--     this wire. FDMS is a protocol peer: when it sends a word this lane does
--     not speak, writing a DIFFERENT flight than the one it described and
--     answering `created` is how two systems begin to disagree about what
--     happened, with nobody told. So every field carrying an authored default
--     (`seq`, `kind`, `ng`) is judged HERE, on the wire block, before the
--     migration can be charitable at it — and the containers (`prev`, `row`,
--     `rid`, `clear_tombstone`) are judged for their SHAPE for the same reason
--     the `date` guard already was: an answer must name the real fault, never
--     report that no row stands at a handle nobody could have built.
--     THE RULE THAT GENERATES THE LIST, so a later round can apply it without
--     re-deriving it: a field the MIGRATION rewrites cannot be defended by
--     wa.validate_section downstream, because the validator judges the migrated
--     candidate and never sees what the wire sent.
--
-- THERE IS NO RECORD-LEVEL OPTIMISTIC LOCK, and that is a DECISION (must-fix 4
-- of the adversarial read). The design carried `p_if_last_update` from the
-- courier era; with the surgery server-side, every op is judged against the
-- LIVE stored record inside one transaction and the per-op provenance verdicts
-- already refuse everything the lock could refuse. What the lock would have
-- ADDED is a lie: after any student save the next push would answer `stale`,
-- and the recovery the design wrote for it was «retry after a fresh pull,
-- automatically» — an automatic background pull of the full real-names export
-- with no tab open, which the same design forbids in its own custody section.
-- Every retry in this lane is therefore an explicit act, and there is nothing
-- in this file that polls.
--
-- AND BECAUSE THE RETRY IS THE ONLY RECOVERY THERE IS, EVERY OP IS REPLAY-SAFE
-- (P45-WAb, F1). The failure this lane actually has is the LOST ANSWER: the
-- push landed, the response never arrived, and the caller sends the identical
-- operation again — with the identical, now-stale `prev`, because that is what
-- its ledger still holds. All four verbs answer `unchanged` in that situation
-- and write nothing: a create or an update because the stored row already
-- matches the candidate; a remove because the tombstone is already lying on the
-- identity; and a MOVE because the row is standing at the handle the op was
-- moving it to, fact for fact. Before that round the move alone answered
-- `exists_fdms` — a CONFLICT verdict for an operation that had succeeded, on
-- the one path the whole retry story runs through.
-- THE REPLAY IS THE IDENTICAL OPERATION, AND THAT IS NOW A RULE AND NOT A
-- HABIT (P45-WAc). Since `prev` is compared with the row it claims to replace,
-- a ledger must take its `prev` from the LAST ACKNOWLEDGED push: re-sending the
-- same op is always safe, and sending a SECOND change with the first change's
-- `prev` is refused — a report line — instead of being applied on top of a row
-- the caller has not seen. Which is what an ordered queue does anyway.
create or replace function public.bridge_push(p_token text, p_student_oid text,
                                              p_ops jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare
  s public.people;
  n_match int;
  raw jsonb;          -- the record exactly as stored
  mig jsonb;          -- the same record, read-migrated (matching only)
  had boolean;
  cur jsonb := '{}'::jsonb;   -- section -> working array (migrated + normalised)
  touched text[] := '{}';
  verdicts jsonb := '[]'::jsonb;
  op jsonb;
  o_op text; sec text; v_rid text; prv jsonb; row_in jsonb; v_reason text;
  clear_tomb boolean;
  arr jsonb; cand jsonb; outrec jsonb;
  claim jsonb;        -- the block this op says the standing row IS (P45-WAc F1)
  pcand jsonb;        -- that block read exactly as a stored row is read
  hit int; tgt int; j int; ix int;
  stamp text; tgt_stamp text;
  vd text; note text; found jsonb; changed boolean := false;
  h_prev text; h_new text;
  t timestamptz;
  k text;
  -- THE rid'S ONE BOUND, WRITTEN ONCE (P45-WAd F3). It is used by the guard and
  -- by the guard's own sentence, and a number said twice is a number that can
  -- disagree with itself — the wa.admin_lock_msg doctrine at local scale.
  rid_max constant int := 200;
begin
  -- ── THE ENVELOPE ────────────────────────────────────────────────────────
  perform wa.auth_bridge(p_token);
  perform wa.chk(jsonb_typeof(p_ops) = 'array', 'ops', 'the push carries a LIST of operations');
  perform wa.chk(jsonb_array_length(p_ops) <= 200, 'ops',
                 'a single push carries at most 200 operations — send the rest in the next one');

  -- THE PERSON IS THE ROSTER'S OBJECT ID (ruling #4): OID first, and a surname
  -- never resolves anybody here. Two refusals, and each says which of the two
  -- things went wrong, because the developer has to know whether to add a
  -- person or to heal a duplicate.
  select count(*) into n_match from public.people p
   where p.role = 'student' and p.active and p.external_oid = p_student_oid;
  perform wa.chk(n_match > 0, 'student_oid',
    format('no ACTIVE student carries the roster object id %s — the person has to exist on the Wings Ahead roster, and be active, before a flight can be pushed onto his record',
           coalesce(p_student_oid, '(none)')));
  perform wa.chk(n_match < 2, 'student_oid',
    format('roster object id %s is carried by more than one person — the roster must be healed before the bridge writes anything to it',
           p_student_oid));
  select * into s from public.people p
   where p.role = 'student' and p.active and p.external_oid = p_student_oid;

  -- ── THE RECORD, AND THE TWO ARRAYS THE LANE MAY TOUCH ───────────────────
  -- `raw` is what is stored, byte for byte, and it is what the write-back
  -- starts from. The two working arrays are the MIGRATED, NORMALISED forms of
  -- the two log sections, because that is the shape the stored rows are matched
  -- and compared in (wa.entry_core against a raw row would never collapse with
  -- a row the form wrote). Their migration is only the seq / kind / ng defaults
  -- and the track fill-in — nothing that can lose a fact.
  select sr.data, true into raw, had
    from public.student_records sr where sr.student_id = s.id;
  raw := coalesce(raw, '{}'::jsonb);
  had := coalesce(had, false);
  mig := wa.migrate_record(raw);
  foreach k in array wa.log_bands() loop
    cur := cur || jsonb_build_object(k, coalesce(mig->k, '[]'::jsonb));
  end loop;

  -- ── ONE OP AT A TIME ────────────────────────────────────────────────────
  for j in 0 .. jsonb_array_length(p_ops) - 1 loop
    op := p_ops->j;
    vd := null; note := null; found := null;
    o_op := op->>'op';
    sec := op->>'section';
    v_rid := op->>'rid';
    v_reason := op->>'reason';
    clear_tomb := coalesce((case when jsonb_typeof(op->'clear_tombstone') = 'boolean'
                                 then (op->>'clear_tombstone')::boolean end), false);
    prv := case when jsonb_typeof(op->'prev') = 'object'
                then wa.norm_entry(op->'prev') else null end;
    row_in := case when jsonb_typeof(op->'row') = 'object'
                   then wa.norm_entry(op->'row') else null end;

    -- THE OP'S OWN SHAPE. Refusals here are verdicts like any other: a
    -- malformed op is this op's problem and not its siblings'.
    if jsonb_typeof(op) <> 'object' then
      vd := 'refused'; note := 'an operation must be an object';
    elsif o_op is null or not (o_op = any(wa.bridge_ops())) then
      vd := 'refused';
      note := format('unknown operation — the lane speaks %s',
                     array_to_string(wa.bridge_ops(), ' / '));
    elsif sec is null or not (sec = any(wa.log_bands())) then
      vd := 'refused';
      note := format('a pushed flight belongs to %s — nothing else is writable through this lane',
                     array_to_string(wa.log_bands(), ' or '));
    elsif nullif(trim(coalesce(v_rid, '')), '') is null then
      vd := 'refused';
      note := 'every operation names the FDMS identity it is about (rid) — it is what the tombstones and the audit are keyed to';
    -- ── P45-WAd F3 — AND THE rid HAS A SHAPE, WHICH IT NEVER HAD ────────────
    -- THE HOLE THIS CLOSES. The branch above tests whether the rid is BLANK,
    -- through `op->>'rid'` — and `->>` renders ANY jsonb as text, so
    -- `"rid": {"o":1}` came through as the literal string `{"o": 1}` and became
    -- the key of a tombstone and of an audit row. That is the silent-coercion
    -- class this lane refuses everywhere else: the caller believes it sent an
    -- object, the database keyed a gate to a rendering of one, and the next
    -- push under the same «rid» matches only if it renders identically.
    --
    -- AND THE LENGTH IS NOT COSMETIC — IT IS THE LAST RAW RAISE IN THIS LOOP.
    -- wa.bridge_tombstones carries `bridge_tombstones_live`, a UNIQUE btree on
    -- (student_oid, rid), and a btree index tuple cannot exceed 2704 bytes. A
    -- removal under a 4 000-character rid therefore died INSIDE the per-op loop
    -- with «index row size 4024 exceeds btree version 4 maximum 2704» — a raw
    -- Postgres error that voids the whole call and every sibling op, which is
    -- exactly what P45-WAc F4 was written to leave nowhere. (Proven live before
    -- and after this guard. `on conflict do nothing` does not help: the index
    -- tuple is built before any conflict is looked for.)
    --
    -- THE GRAMMAR, AND THE JUDGEMENT — WHY IT IS NOT ONE. The only rid grammar
    -- this file has ever named is informational (`rid = oid ∷ sortie ∷ ord`, in
    -- the tombstone table's own comment) and it is FDMS'S composition, not Wings
    -- Ahead's: the design's own rule is that the rid is date-free and opaque
    -- here (B.2 — the record is the squadron's document, not FDMS's mirror), so
    -- a WA-side pattern would break the day FDMS re-composes its identity and
    -- would be enforcing a foreign system's private key format. What this side
    -- legitimately owns is the SHAPE it can store and index: a string, not
    -- blank, and short enough that the gate it keys can be written. 200 is the
    -- house's name-length cap (wa.chk_text of `instructor`, `with`, `evaluator`)
    -- and it is ~13× under the btree ceiling, so the bound is generous by the
    -- one measure that matters and familiar by the other.
    elsif jsonb_typeof(op->'rid') <> 'string' or length(v_rid) > rid_max then
      vd := 'refused';
      -- TWO SENTENCES, BECAUSE THEY ARE TWO FAULTS. One refusal that said
      -- «string of at most 200 characters» for both would tell the caller who
      -- sent an object about a length he did not exceed, and the caller who
      -- sent a long name about a type he got right. Each names its own fault
      -- and the reason it is a fault here.
      note := case when jsonb_typeof(op->'rid') <> 'string' then
        format('the FDMS identity of an operation (rid) crosses this wire as a STRING, and this one sent a JSON %s. It is refused by its SHAPE: the rid is what the tombstone and the audit are KEYED to, and anything that is not a string is stored as a RENDERING of what you sent — here «%s» — so the next push under the same identity would match only by accident. What the rid MEANS is FDMS''s own business and nothing on this side reads into it; what it must BE is a name this record can key a gate to.',
               jsonb_typeof(op->'rid'), left(v_rid, 40))
      else
        format('the FDMS identity of an operation (rid) is at most %s characters and this one sent %s. It is refused by its LENGTH, and not for tidiness: the live-tombstone gate is a UNIQUE index on (student oid, rid), a btree entry cannot exceed 2704 bytes, and a removal under a rid past that limit raised a RAW database error inside the per-op loop — voiding the whole call and every well-formed operation sent beside it, which is the one thing this lane promises cannot happen.',
               rid_max, length(v_rid))
      end;
    -- ── P45-WAd F4 — THE CONTAINERS HAVE A SHAPE TOO ────────────────────────
    -- `prev` and `row` are read at the head of this loop with «is it an object?
    -- then read it, else NULL» — a silent downgrade that changed what the
    -- operation MEANT. `"prev": "the row"` made a claimed replacement into a
    -- CREATE (proven live: `exists_fdms`, i.e. the caller was told a row was in
    -- his way when what was wrong was that his claim was not an object), and on
    -- a removal `"row": "C4101"` was answered `missing` — «no row stands at that
    -- flight, date and seq» about a handle that was never built. That is word
    -- for word the fault the `date` guard below already refuses by SHAPE, and
    -- the same sentence applies. JSON `null` and an ABSENT key are NOT this: the
    -- wire contract in the header is `"prev": <the row> | null`, and an upsert
    -- with no `row` at all keeps its own older, sharper refusal further down.
    elsif not (coalesce(jsonb_typeof(op->'prev'), 'null') = any(array['object','null']))
       or not (coalesce(jsonb_typeof(op->'row'),  'null') = any(array['object','null'])) then
      vd := 'refused';
      note := 'the `prev` and `row` of an operation are each a flight ROW — a JSON object — or absent. This one sent something else, and it is refused by its SHAPE rather than quietly read as «nothing sent»: a `prev` that is not an object would have turned a claimed replacement into a create, and a `row` that is not an object would have been answered «no row stands at that flight» about a handle nobody could have built.';
    elsif not (coalesce(jsonb_typeof(op->'clear_tombstone'), 'null') = any(array['boolean','null'])) then
      -- The same rule one field over: `"clear_tombstone": "yes"` used to be
      -- COERCED to false, so a deliberate act — the one act that brings a
      -- removed identity back — was silently not performed. The answer
      -- (`tombstoned`) is a report line, but it reports the wrong fact.
      vd := 'refused';
      note := 'clear_tombstone is true or false — bringing a removed identity back is the one deliberate act in this lane, and a value that is not a boolean is refused rather than read as «no»';
    -- ── P45-WAc F4 — A BAD FIELD TYPE IS A REFUSAL, NEVER A RAISE ───────────
    -- THE HOLE THIS CLOSES (pre-existing, inherited unchanged from round 24).
    -- Every op — refused ones included — is filed in wa.bridge_audit at the
    -- foot of this loop, and that table takes `seq` as an INT. The cast used to
    -- live in the INSERT itself, so an op carrying `"seq": "not-a-number"`
    -- raised the WHOLE CALL with a raw Postgres error and voided the nine
    -- well-formed ops beside it — the exact failure the header promises cannot
    -- happen («only the ENVELOPE raises»), and it could not be answered by a
    -- verdict because the raise came AFTER the verdict was decided.
    -- THE SWEEP, RECORDED — AND CORRECTED IN P45-WAd, BECAUSE TWO THIRDS OF ITS
    -- LAST SENTENCE WERE FALSE. Two wire fields reach a typed column or a cast:
    -- `seq` (int, in the audit and in the tombstone) and `date` (text in the
    -- audit, but CHECK-constrained to the ISO pattern in the tombstone). Every
    -- other field of `row` / `prev` is read with `->>` into a text column or
    -- handed to wa.migrate_record / wa.validate_section — but «handed to the
    -- migration» is NOT the same as «answered with a verdict», and this comment
    -- used to name three examples as refusals without asking the database:
    --   · a sortie that is an object, a grade of "abc", a 5 000-character
    --     sortie — TRUE, all three are refusals (wa.chk_text / wa.chk_grade see
    --     the value unchanged, because the migration does not touch them);
    --   · «a kind that is an array» and «`ng: "maybe"`» — FALSE, and provably
    --     so: the migration REWRITES both before the validator ever sees them
    --     (`kind` → 'syllabus', `ng` → false), so wa.validate_section validates
    --     a value the caller never sent. Both were `created` in P45-WAd's
    --     pre-fix probe. They are refused by the two branches below now, which
    --     is what makes the sentence true again.
    -- THE LESSON, WRITTEN DOWN RATHER THAN LEARNED TWICE: a field the migration
    -- NORMALISES cannot be defended by the validator downstream of it, because
    -- the validator judges the migrated candidate. Anything with an authored
    -- default (`seq`, `kind`, `ng`) has to be judged HERE, on the wire block, or
    -- it is not judged at all.
    elsif (nullif(row_in->>'seq', '') is not null and wa.log_seq(row_in) is null)
       or (nullif(prv->>'seq', '')    is not null and wa.log_seq(prv)    is null) then
      vd := 'refused';
      note := 'the same-day sequence number of a flight crosses this wire as a NUMBER — 2, never "2". A string is refused as one because this database reads that field TWICE and the two readers disagree about it: the handle that finds the row spells it as text, and the migration that writes the row takes only a JSON number and otherwise writes the default 1. A row would land at one sequence number and be looked for at another. It is a whole number from 1 to 20 — the bounds every flight row of this record is validated against — written without a leading zero. THIS operation is refused for it and the ones sent beside it are not: an operation whose shape the parser cannot read is its own problem, never its siblings''.';
    -- ── P45-WAd F4 — AN UNKNOWN `kind` IS REFUSED, NOT NORMALISED ───────────
    -- THE HOLE THIS CLOSES. wa.migrate_record writes 'syllabus' over any kind
    -- the registry does not know — «banana», ["repeat"], "Repeat" with a capital
    -- — and that is RIGHT for a stored row read through a human's form: the
    -- catalogue may have retired a value, and a record whose owner cannot save
    -- it is worse than a record read charitably. It is WRONG on this wire. FDMS
    -- is a protocol peer, not a legacy row: it said something this lane does not
    -- speak, and the honest answer is to say so by name rather than to write a
    -- different flight than the one it described and answer `created`. (Proven
    -- live in P45-WAd: `kind:"banana"` and `kind:["repeat"]` were both `created`
    -- and both stored as 'syllabus'.)
    -- IT IS ALSO A PROOF-SIDE TRAP, exactly the shape of the string seq above:
    -- a `prev` carrying an unknown kind is migrated to 'syllabus' before the
    -- knowledge test, so a false claim quietly PASSES against a syllabus row and
    -- a true one is told «your claim is wrong» when what was wrong was the word.
    -- Hence both blocks, as with `seq` and `date`.
    -- ABSENT / `null` / "" ARE NOT THIS, and the judgement is the seq one: the
    -- migration's authored default for a kind nobody sent is 'syllabus', both
    -- readers agree on it, there is no disagreement to refuse — and refusing it
    -- would make FDMS spell out a value it has no opinion about on every row.
    elsif (nullif(row_in->>'kind', '') is not null
           and not (row_in->>'kind' = any(wa.flight_kinds())))
       or (nullif(prv->>'kind', '') is not null
           and not (prv->>'kind' = any(wa.flight_kinds()))) then
      vd := 'refused';
      note := format('a pushed flight says which KIND of flight it was, and the lane speaks %s — this operation sent something else. It is refused by NAME instead of being read as ''syllabus'': a stored row may be read charitably, because a student must always be able to save his own record, but the bridge is a machine on the other end of a protocol and silently writing a different flight than the one it described is how the two systems start disagreeing about what happened.',
                     array_to_string(wa.flight_kinds(), ' / '));
    elsif not (coalesce(jsonb_typeof(row_in->'ng'), 'null') = any(array['boolean','null']))
       or not (coalesce(jsonb_typeof(prv->'ng'),    'null') = any(array['boolean','null'])) then
      -- The same fault at the field the lane cares most about. `ng: "maybe"` was
      -- migrated to false and `created` — and the branch below that refuses
      -- `ng: true` by name never fired, because it tests for a BOOLEAN true. So
      -- the one field this lane welds shut could be addressed in a type it does
      -- not read, and the answer was silence. It is a shape refusal now, and the
      -- `ng: true` refusal below keeps its own sentence for the honest boolean.
      vd := 'refused';
      note := 'the NON-GRADED flag of a flight is true or false — this operation sent something else, and it is refused by its SHAPE rather than read as «no». NG is the one field the bridge never writes at all (see the refusal below), so a value it cannot read is the last thing it should guess at.';
    elsif not (coalesce(jsonb_typeof(row_in->'date'), 'null') = any(array['string','null']))
       or not (coalesce(jsonb_typeof(prv->'date'),    'null') = any(array['string','null'])) then
      vd := 'refused';
      note := 'a date crosses this wire as a calendar day written out — "2026-09-01" — and this operation sent something that is not a string at all. It is refused by its SHAPE, before anything is matched, so that the answer names the real fault instead of reporting that no row stands at a handle nobody could have built.';
    elsif o_op = 'remove' and (v_reason is null
                               or not (v_reason = any(wa.bridge_reasons()))) then
      vd := 'refused';
      note := format('a removal names its reason — %s',
                     array_to_string(wa.bridge_reasons(), ' / '));
    elsif o_op = 'upsert' and row_in is null then
      vd := 'refused'; note := 'an upsert carries the row it means to write';
    elsif o_op = 'upsert' and (row_in ? 'entered_by') then
      -- PROVENANCE IS NOT A WIRE FIELD. Refused by NAME rather than silently
      -- overwritten, because a caller that sends it believes something false
      -- about who decides it, and the next thing it believes may not be
      -- harmless. (wa.write_record overwrites instead — but there the client is
      -- the owner's own form, and there is no second system to correct.)
      vd := 'refused';
      note := 'entered_by is not accepted from the wire — the bridge''s rows are stamped ''fdms'' by the server, because provenance is a property of WHICH DOOR was called';
    elsif o_op = 'upsert' and (row_in ? 'legacy') then
      vd := 'refused';
      note := 'the legacy flag marks a row inherited from the previous form — the bridge writes complete rows, so it never sets it';
    elsif o_op = 'upsert' and coalesce((case when jsonb_typeof(row_in->'ng') = 'boolean'
                                             then (row_in->>'ng')::boolean end), false) then
      -- NG IS WELDED SHUT FROM THIS LANE (design F.4). FDMS has no NG state to
      -- assert, and ng-as-completion-switch is a named must-fix of the earlier
      -- critique: a lane that could set it could silently un-score a flight.
      vd := 'refused';
      note := 'the bridge never marks a flight NON-GRADED — FDMS has no such state to assert, and NG removes the grade';
    elsif o_op = 'upsert' and jsonb_typeof(row_in->'duration') is not null
          and jsonb_typeof(row_in->'duration') <> 'null' then
      -- DURATION CROSSES IN NEITHER DIRECTION UNTIL FDMS HAS THE FIELD
      -- (ruling #8). Refused rather than dropped: silently discarding a number
      -- somebody sent is how the two systems start disagreeing about hours.
      vd := 'refused';
      note := 'the bridge carries no flight TIME in either direction yet — the hours belong to the student''s own row, and a pushed duration would be a second source for a number FDMS does not hold';
    end if;

    if vd is null then
      arr := cur->sec;
      h_prev := case when prv is not null then wa.log_handle(prv)
                     when row_in is not null then wa.log_handle(row_in) end;
      h_new  := case when row_in is not null then wa.log_handle(row_in) end;

      -- WHERE THE ROW STANDS NOW, and what stands where it is going
      hit := -1; tgt := -1;
      for ix in 0 .. jsonb_array_length(arr) - 1 loop
        if jsonb_typeof(arr->ix) <> 'object' then continue; end if;
        if hit < 0 and wa.log_handle(arr->ix) = h_prev then hit := ix; end if;
        if tgt < 0 and h_new is not null and wa.log_handle(arr->ix) = h_new then tgt := ix; end if;
      end loop;
      stamp := case when hit >= 0 then arr->hit->>'entered_by' end;
      tgt_stamp := case when tgt >= 0 then arr->tgt->>'entered_by' end;

      -- ── THE TWO CANDIDATES, AND ONE FUNCTION READS BOTH ────────────────────
      -- `cand` is what this op would WRITE; `pcand` is what it CLAIMS is
      -- standing there already (`prev`, or — for a removal that sends none —
      -- `row`). Both are built by the READ MIGRATION and not by hand, both
      -- BEFORE the first verdict, because four of the verdicts below have to
      -- ask one of two questions: «is the row that is standing in the way the
      -- one I was about to write?» (P45-WAb F1) and «is the row standing here
      -- the one this operation says it is replacing?» (P45-WAc F1).
      -- WHY THE MIGRATION IS THE ONLY HONEST READER: the stored rows both are
      -- compared with have been through wa.migrate_record, which normalises
      -- every string (the round-5b boundary), writes the three authored
      -- defaults (seq 1, kind 'syllabus', ng false), resolves the track from a
      -- syllabus code and strips any key the section has retired. Reading a
      -- wire block any other way would make an UNCHANGED row look changed on
      -- every push and an HONEST `prev` look like a lie, purely because FDMS
      -- did not send a key whose default this database writes: permanent churn,
      -- and a report the developer would learn to ignore. One function
      -- (wa.bridge_row), both blocks, the same call the stored rows went
      -- through — which is also where must-fix 6, the normalisation boundary,
      -- is honoured.
      cand  := wa.bridge_row(sec, row_in);
      claim := case when o_op = 'upsert' then prv else coalesce(prv, row_in) end;
      pcand := wa.bridge_row(sec, claim);

      if o_op = 'upsert' then
        -- 1. THE TOMBSTONE GATE. An identity somebody undid does not come back
        --    on its own; only an explicit, confirmed re-push clears it.
        if exists (select 1 from wa.bridge_tombstones tb
                    where tb.student_oid = p_student_oid and tb.rid = v_rid
                      and tb.cleared_at is null)
           and not clear_tomb then
          vd := 'tombstoned';
          note := 'this identity was removed from Wings Ahead by the bridge — bringing it back is a deliberate act (clear_tombstone), not something the queue does by itself';
        -- 2. A HUMAN'S ROW AT THE HANDLE WE ARE MOVING FROM.
        elsif hit >= 0 and stamp is distinct from 'fdms' then
          vd := case when stamp = 'admin' then 'exists_admin' else 'exists_student' end;
          found := arr->hit;
          note := case when stamp = 'admin'
                       then 'the admin has taken this row over — the bridge does not write over it'
                       else 'a row typed on this record already stands at that flight, date and seq — the bridge never overwrites what a human wrote' end;
        -- 3. A ROW AT THE HANDLE WE ARE MOVING TO that is not the one we hold.
        elsif tgt >= 0 and tgt <> hit then
          if tgt_stamp is distinct from 'fdms' then
            vd := case when tgt_stamp = 'admin' then 'exists_admin' else 'exists_student' end;
            found := arr->tgt;
            note := 'that flight, date and seq is already taken on this record — the move would have made two rows one flight';
          elsif hit < 0 and wa.entry_core(arr->tgt) = wa.entry_core(cand) then
            -- ── P45-WAb F1 — A `moved` OP IS REPLAY-SAFE TOO ────────────────
            -- THE HOLE THIS CLOSES. A move is `prev` (where the row was) plus
            -- `row` (where it goes). Once it lands, the source handle is empty
            -- and the target holds the row — so the RETRY of that same op,
            -- which is what a caller sends when the ANSWER never arrived and
            -- which still carries the now-stale `prev`, used to read as: source
            -- gone (hit < 0), target occupied by another bridge row (tgt >= 0),
            -- i.e. `exists_fdms`. A CONFLICT VERDICT FOR AN OPERATION THAT HAD
            -- ALREADY SUCCEEDED — and the one place the lane's own rule «a
            -- replay is absorbed, never an exception» did not reach, while a
            -- replayed create, update and remove all answer `unchanged`.
            -- THE TEST IS THE ONE THAT WAS ALREADY THERE, ASKED OF THE OTHER
            -- SLOT: is the row standing at the target byte-identical (by
            -- wa.entry_core, stamp excluded, nulls dropped) to what this op
            -- would have written? Then this op is what put it there and there
            -- is nothing left to do. `hit < 0` is half the condition and not a
            -- convenience: if the SOURCE row is still standing, the move has
            -- NOT landed and an identical twin at the target is a genuine
            -- collision — that stays `exists_fdms` below, because answering
            -- `unchanged` there would leave two rows for one flight and tell
            -- the caller everything was fine.
            vd := 'unchanged';
            note := 'this operation had already landed — the row it moves is standing at its new flight, date and seq, fact for fact, and the `prev` it carries is the handle the row left. A retry after an answer that never arrived is absorbed here, exactly as a replayed create, update or remove is.';
          else
            -- P45-WAc F1 — AND THE ROW IS NOT HANDED BACK. Every other
            -- `exists_*` returns the standing row in full so the FDMS report can
            -- show both versions, and for a HUMAN's row that is right: the
            -- bridge can never write over one whatever it sends, so knowing its
            -- facts buys nothing. An `exists_fdms` row is the opposite case —
            -- since P45-WAc the way to overwrite a bridge row is to DESCRIBE it
            -- in `prev`, so answering the refusal with the row's own facts would
            -- have made this refusal the shortest route to the overwrite it
            -- exists to prevent. The verdict names the HANDLE (which the caller
            -- sent) and nothing else; the developer reads the rest from his own
            -- report and from the audit tail's two rids.
            vd := 'exists_fdms';
            note := 'that flight, date and seq is already taken on this record by a row the bridge itself wrote — the move would have made two rows one flight. What stands there is not described back to you: since a `prev` that describes a row is what authorises replacing it, an answer that handed over the facts would be a way around the rule it is enforcing.';
          end if;
        else
          -- 4. THE WRITE ITSELF.
          if hit < 0 and prv is not null then
            -- `prev` named a bridge row that is not there: the admin deleted it
            -- (his custody). Reported, never silently re-created — the developer
            -- settles it from the report.
            vd := 'missing';
            note := 'the row this operation was going to change is no longer on the record — the admin removed it, and putting it back is a deliberate re-push';
          elsif coalesce((case when jsonb_typeof(cand->'legacy') = 'boolean'
                               then (cand->>'legacy')::boolean end), false) then
            -- THE MIGRATION FLAGGED IT INCOMPLETE. That flag is a READ repair
            -- for rows inherited from the previous form; a row arriving today
            -- without a date, a sortie, a table or an instructor is not
            -- inherited, it is unfinished — and writing it would put a row on
            -- a student's record that only HE can be asked to complete, for a
            -- flight he did not enter.
            vd := 'refused';
            note := 'an incomplete flight is not pushed — a row of the log names its DATE, its SORTIE, the TABLE it belongs to and the INSTRUCTOR who flew it or authorised it';
          elsif hit >= 0 and wa.entry_core(arr->hit) = wa.entry_core(cand) then
            vd := 'unchanged';
          elsif hit >= 0 and prv is null then
            -- ── P45-WAb F2 — TWO rids CANNOT SILENTLY SHARE ONE HANDLE ──────
            -- THE HOLE THIS CLOSES, and it is the other half of a verdict the
            -- critique asked for. Case 3 above tests the slot a move is aiming
            -- AT — but for an upsert with no `prev` the two handles are the
            -- same string, so `tgt` and `hit` are the same index and `tgt <>
            -- hit` is never true. That upsert therefore fell straight through
            -- to the write and, finding a row it was allowed to touch, answered
            -- `updated` — OVERWRITING A FLIGHT THAT BELONGS TO A DIFFERENT
            -- FDMS IDENTITY. Both ledgers then read as landed, and a later
            -- remove under rid B tombstones only B, so rid A re-creates the row
            -- at the next auto-push and the undo does not stick.
            --
            -- WHAT WINGS AHEAD CAN AND CANNOT KNOW. The stored row carries NO
            -- rid, by design (B.2: the record is the squadron's document, not
            -- FDMS's mirror), so this database cannot know WHICH identity holds
            -- the handle. It can know THAT a bridge row holds it, and that this
            -- operation did not claim to be replacing it — and that is enough
            -- to refuse. The audit tail records both rids against the handle,
            -- so the cross-check on the FDMS side reads which two collided.
            --
            -- SO AN UPSERT WITHOUT `prev` IS A CREATE, AND IS JUDGED AS ONE:
            -- it may land on an empty handle (`created`), it may find its own
            -- row already there fact-for-fact (`unchanged`, the branch above,
            -- which is why a replay still costs nothing) — and anything else is
            -- a conflict somebody has to settle. A CHANGE carries `prev`.
            --
            -- WHAT THIS HALF DOES NOT CLOSE ON ITS OWN — and P45-WAc's F1,
            -- immediately below, is the other half. A `prev` was a CLAIM and
            -- nothing else: this function read it only through wa.log_handle,
            -- i.e. the same sortie / date / seq the operation was already
            -- sending in `row`. So the identity refused HERE obtained a silent
            -- `updated` by adding a two-line `prev` block copied out of its own
            -- `row` — and this refusal's own advice used to tell it to. The
            -- branch below now makes `prev` prove knowledge. The REMOVE verb had
            -- the same blind spot from the other side (it matched on the handle
            -- alone, so a remove under rid B deleted rid A's row and tombstoned
            -- only B); it is guarded by the same test now, in its own branch.
            vd := 'exists_fdms';
            note := format('a flight already stands at %s of %s (#%s) on this record and the bridge itself put it there — and this operation did not say which row it was replacing. A pushed row carries no FDMS identity, so Wings Ahead can see THAT another identity holds this flight, date and seq but not WHICH, and writing over it would lose a flight with nobody told. Send the change with `prev` CARRYING the row it replaces — the row as the bridge last wrote it, fact for fact, because `prev` is checked against what actually stands here — or remove the identity holding the handle first; the audit tail carries both rids at this handle for the cross-check.',
                           coalesce(nullif(upper(coalesce(cand->>'sortie', '')), ''), 'this flight'),
                           case when wa.is_iso_date(cand->>'date')
                                then to_char((cand->>'date')::date, 'DD/MM/YYYY')
                                else 'an unrecorded date' end,
                           coalesce(nullif(cand->>'seq', ''), '1'));
          elsif hit >= 0 and wa.entry_core(pcand) is distinct from wa.entry_core(arr->hit) then
            -- ── P45-WAc F1 — `prev` MUST PROVE KNOWLEDGE ────────────────────
            -- THE HOLE THIS CLOSES, and it is the bypass the P45-WAb verify
            -- walked through live. The branch above refuses an upsert that does
            -- not CLAIM a replacement; it did nothing about a FALSE claim,
            -- because the claim's content was never compared with anything.
            -- rid B, answered `exists_fdms` a moment earlier, copied the three
            -- handle fields out of its own `row` into a `prev` and got a silent
            -- `updated` over rid A's flight. The audit recorded it; nothing
            -- refused it.
            --
            -- THE TEST IS THE ONE THIS FILE ALREADY OWNS, asked of the third
            -- slot: is the row standing at the handle byte-identical (by
            -- wa.entry_core — stamp excluded, null-valued keys dropped) to the
            -- row `prev` describes, both read through wa.bridge_row? If it is
            -- not, the operation does not know what it is replacing, and an
            -- identity that never wrote the row CANNOT produce its facts out of
            -- the handle it is standing on. That is why the proof is the FULL
            -- core and not a chosen subset — the judgement, recorded:
            --   · the handle proves nothing: it is how the row was found, so
            --     asking for it back is asking the claimant to repeat himself;
            --   · any subset short of the core has to NAME the proof-bearing
            --     fields, and every such list is guessable on some row (a flight
            --     whose debrief has not landed carries little beyond the
            --     instructor and three defaults). The core degrades by itself to
            --     «the strongest proof this particular row can offer»;
            --   · and it is ONE test with one spelling. A second, weaker notion
            --     of «is this the row?» beside wa.entry_core is exactly the drift
            --     wa.admin_lock_msg and wa.bridge_reasons() were made functions
            --     to prevent.
            -- IT COSTS THE HONEST CALLER NOTHING IT DOES NOT ALREADY HOLD: to
            -- know a change is worth pushing, the queue must already hold the row
            -- it last pushed. `prev` becomes that row instead of three of its
            -- fields. What it does demand is ORDER — the ledger must take its
            -- `prev` from the LAST ACKNOWLEDGED push, so a second change sent
            -- with the first change's `prev` is refused here rather than applied
            -- twice. That is the retry doctrine of this lane written as a rule
            -- instead of a hope, and it fails as a REPORT LINE, never silently.
            --
            -- THE VERDICT IS `exists_fdms` AND NOT A NEW WORD, deliberately. To
            -- the caller both halves are one fact — «the row at this handle is
            -- not yours to write, settle it» — they take the same route on the
            -- FDMS report, and wa.bridge_verdicts() stays the eleven words the
            -- acceptance sweep counts. The NOTE is what separates «you claimed
            -- nothing» from «your claim is wrong».
            --
            -- WHAT IT REFUSES TO SAY. Not one fact of the standing row is echoed
            -- back — not which field differs, not its value. The sentence names
            -- only the handle, which the caller sent. An answer that said «the
            -- grade is 5» would turn this refusal into the two-step overwrite it
            -- exists to prevent: ask once, be told, claim correctly.
            --
            -- AND WHAT IT STILL DOES NOT CLOSE, so that no reader has to find
            -- out the hard way:
            --   · BYTE-IDENTICAL TWINS. Two identities describing the same
            --     flight with the same facts are ONE ROW to this database: B's
            --     `prev` genuinely matches, and its `row` is genuinely already
            --     standing there (the `unchanged` branch above). No test written
            --     on this side can separate them, because there is nothing to
            --     separate. That dedup is P45-FDMS's, by pairing on evId with a
            --     seq minted once and frozen.
            --   · THIS IS AN INTEGRITY GATE, NOT AN AUTHORISATION BOUNDARY. One
            --     bridge credential serves the whole FDMS instance, and
            --     public.bridge_pull hands back the records — so a caller that
            --     READS FIRST can always compose a `prev` that matches. The gate
            --     is against the failure this lane actually suffers: a queue that
            --     has lost track of which identity holds a handle and pushes a
            --     change it never had the facts for.
            -- The audit still records both rids at the handle either way, which
            -- is the lane's whole doctrine for a disagreement it cannot settle
            -- alone: a report line, never a silence.
            vd := 'exists_fdms';
            note := format('this operation says it is replacing the row at %s of %s (#%s), but the row standing there is not the row its `prev` describes. `prev` is a claim of KNOWLEDGE and is checked as one: it must be the row as the bridge last wrote it, fact for fact — which is precisely what an identity that never wrote the row cannot produce. WHICH facts differ is deliberately not answered: an answer that described the standing row would be a way of reading a flight somebody else wrote, and then of claiming it correctly. Take the `prev` from the last push this identity had acknowledged, or settle the collision on the FDMS side; the audit tail carries both rids at this handle.',
                           coalesce(nullif(upper(coalesce(pcand->>'sortie', '')), ''), 'this flight'),
                           case when wa.is_iso_date(pcand->>'date')
                                then to_char((pcand->>'date')::date, 'DD/MM/YYYY')
                                else 'an unrecorded date' end,
                           coalesce(nullif(pcand->>'seq', ''), '1'));
          else
            if hit >= 0 then
              vd := case when h_prev is distinct from h_new then 'moved' else 'updated' end;
              arr := jsonb_set(arr, array[hit::text], cand);
            else
              vd := 'created';
              arr := arr || jsonb_build_array(cand);
            end if;
          end if;
        end if;

      else  -- o_op = 'remove'
        if hit < 0 then
          -- A REPLAY, ABSORBED (verify finding 5). The unique index would RAISE
          -- on a second tombstone and the raise would void every sibling op, so
          -- the caller carries the idempotency — here, by answering the replay
          -- before it writes.
          if exists (select 1 from wa.bridge_tombstones tb
                      where tb.student_oid = p_student_oid and tb.rid = v_rid
                        and tb.cleared_at is null) then
            vd := 'unchanged';
            note := 'already removed, and the tombstone is already lying on it';
          else
            vd := 'missing';
            note := 'no row stands at that flight, date and seq — nothing to remove';
          end if;
        elsif stamp is distinct from 'fdms' then
          -- THE BRIDGE REMOVES ONLY ITS OWN ROWS, on either side of the wire.
          -- A row whose stamp was stripped is the student's correction and is
          -- his; the admin's is the admin's.
          vd := case when stamp = 'admin' then 'exists_admin' else 'exists_student' end;
          found := arr->hit;
          note := case when stamp = 'admin'
                       then 'the admin has taken this row over — only he removes it now'
                       else 'this row is no longer the bridge''s: somebody on this record corrected it, and a corrected row belongs to the person who corrected it' end;
        elsif wa.entry_core(pcand) is distinct from wa.entry_core(arr->hit) then
          -- ── P45-WAc F1, THE OTHER VERB ──────────────────────────────────
          -- THE GAP §4z·10·2 DECLARED UNCLOSABLE, NARROWED. A removal used to
          -- name its row by the HANDLE alone — so a remove sent under rid B,
          -- aimed at a handle whose row rid A had written, deleted A's row and
          -- laid a tombstone on B; A, untombstoned, re-created the row at its
          -- next push and the undo did not stick. That was true whatever the
          -- upsert side did, which is why the round that closed the upsert half
          -- had to write the remove half down as still open.
          -- IT IS THE SAME TEST, ASKED OF THE SAME BLOCK: the row a removal
          -- names — `prev`, or `row` when it sends no `prev` — must BE the row
          -- standing at the handle, fact for fact. A removal is the one verb
          -- that destroys, so a claim it cannot back is the last place to be
          -- generous. The known limits are the two written out at the upsert
          -- branch above and they are the same two: byte-identical twins really
          -- are one row here, and a caller that pulls first can describe
          -- anything. Neither is closable on this side; both are P45-FDMS's.
          vd := 'exists_fdms';
          note := format('this removal names the row at %s of %s (#%s), but the row standing there is not the row it describes. A removal carries the row it removes — as the bridge last wrote it, fact for fact — because matching on the sortie, the date and the seq alone would let an identity delete a flight it never wrote, which is exactly how an undo stops sticking. WHICH facts differ is deliberately not answered here. Settle it from the report; the audit tail carries both rids at this handle.',
                         coalesce(nullif(upper(coalesce(pcand->>'sortie', '')), ''), 'this flight'),
                         case when wa.is_iso_date(pcand->>'date')
                              then to_char((pcand->>'date')::date, 'DD/MM/YYYY')
                              else 'an unrecorded date' end,
                         coalesce(nullif(pcand->>'seq', ''), '1'));
        else
          vd := 'removed';
          arr := (select coalesce(jsonb_agg(x), '[]'::jsonb)
                    from jsonb_array_elements(arr) with ordinality t(x, n)
                   where n - 1 <> hit);
        end if;
      end if;

      -- 5. THE SECTION MUST STILL BE A LEGAL SECTION — and if it is not, THIS
      --    op is refused and its siblings are untouched. The sub-block is what
      --    isolates them: a validator raise inside it rolls back to the
      --    savepoint plpgsql opened, not to the start of the call.
      if vd in ('created', 'moved', 'updated', 'removed') then
        begin
          perform wa.validate_section(sec, arr);
          cur := cur || jsonb_build_object(sec, arr);
          if not (sec = any(touched)) then touched := touched || sec; end if;
          changed := true;
        exception when others then
          vd := 'refused';
          note := SQLERRM;
        end;
      end if;

      -- 6. THE TOMBSTONE AND ITS CLEARANCE, after the section proved legal.
      if vd = 'removed' then
        insert into wa.bridge_tombstones
          (student_oid, student_id, section, sortie, date, seq, rid, reason)
        values (p_student_oid, s.id, sec,
                coalesce(prv->>'sortie', row_in->>'sortie'),
                coalesce(prv->>'date', row_in->>'date'),
                coalesce(wa.log_seq(prv), wa.log_seq(row_in), 1),
                v_rid, v_reason)
        on conflict do nothing;
      elsif clear_tomb and vd in ('created', 'moved', 'updated', 'unchanged') then
        update wa.bridge_tombstones tb
           set cleared_at = now()
         where tb.student_oid = p_student_oid and tb.rid = v_rid
           and tb.cleared_at is null;
      end if;
    end if;

    -- 7. THE AUDIT — one row per op, whatever it decided. No names, no grades.
    --    THE SEQ IS READ, NOT CAST (P45-WAc F4). This insert runs for EVERY op,
    --    including the ones already refused, so the `::int` that used to stand
    --    here was the one expression in the loop that could still raise after a
    --    verdict had been decided — and a raise here takes the whole call and
    --    every sibling op with it. wa.log_seq answers NULL for a seq that is not
    --    one, the column is nullable, and the op-shape guard above has already
    --    said so in words.
    insert into wa.bridge_audit
      (student_id, student_oid, op, section, sortie, date, seq, rid, verdict, note)
    values (s.id, p_student_oid, coalesce(o_op, '(none)'), sec,
            coalesce(row_in->>'sortie', prv->>'sortie'),
            coalesce(row_in->>'date', prv->>'date'),
            coalesce(wa.log_seq(row_in), wa.log_seq(prv)),
            v_rid, vd, note);

    verdicts := verdicts || jsonb_build_array(jsonb_build_object(
      'rid', v_rid, 'op', o_op, 'section', sec, 'verdict', vd,
      'note', note, 'row', found));
  end loop;

  -- ── ONE WRITE, SURGICAL ─────────────────────────────────────────────────
  -- `raw ||` keeps every untouched section exactly as stored — including the
  -- eleven this lane cannot see and the one that would not validate today.
  -- The record-level `entered_by` is NOT recomputed: wa.record_stamp counts the
  -- literal 'admin', so an fdms row can never flip a record's stamp, and
  -- rewriting it here would be the lane deciding a question it is not asked.
  if changed then
    outrec := raw;
    foreach k in array touched loop
      outrec := outrec || jsonb_build_object(k, cur->k);
    end loop;
    if had then
      update public.student_records
         set data = outrec, last_update = now()
       where student_id = s.id
      returning last_update into t;
    else
      insert into public.student_records (student_id, data, last_update, entered_by)
      values (s.id, outrec, now(), null)
      returning last_update into t;
    end if;
  else
    select sr.last_update into t from public.student_records sr where sr.student_id = s.id;
  end if;

  outrec := coalesce((select wa.migrate_record(sr.data) from public.student_records sr
                       where sr.student_id = s.id), '{}'::jsonb);
  return jsonb_build_object(
    'ok', true,
    'student_oid', p_student_oid,
    'last_update', t,
    'verdicts', verdicts,
    'fdms_entries', wa.entry_count_by(outrec, 'fdms'),
    'entries_total', wa.entry_count(outrec));
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
    'save_instructor_currency(text, jsonb)',
    'admin_list_people(text)',
    'admin_save_person(text, uuid, jsonb)',
    'admin_delete_person(text, uuid)',
    'admin_set_active(text, uuid, boolean)',
    'admin_regenerate_token(text, uuid)',
    'admin_set_assessment_class(text, text)',
    'admin_get_student_form(text, uuid)',
    'admin_save_student_record(text, uuid, jsonb)',
    'admin_get_proposals_of(text, uuid)',
    'admin_save_proposal(text, uuid, uuid, jsonb)',
    'admin_get_data(text)',
    'admin_export(text)',
    -- ══ ROUND 24 — THE BRIDGE'S FIVE (P45-WA) ═══════════════════════════════
    -- They join the same loop as everything else, and that is the doctrine
    -- rather than an oversight: this application is RPC-ONLY, `anon` is the
    -- role every browser and every wire client arrives as, and each function
    -- authenticates ITSELF from the credential in its argument. The three
    -- admin_bridge_* ask wa.auth_role(admin); bridge_pull and bridge_push ask
    -- wa.auth_bridge, which looks the caller up in a table `public.people` is
    -- NOT — so being callable is not being answerable.
    -- NOTE for anybody counting refusals: this list is 25 entries, of which
    -- TWO (bridge_pull, bridge_push) ACCEPT the bridge credential, keepalive()
    -- takes no credential at all, and whoami answers {"role": null} to a
    -- stranger rather than refusing. «Every other RPC refuses the bridge token»
    -- is therefore 21 refusals + 1 anonymous answer + 1 tokenless ping — and an
    -- acceptance test that says «25 refusals» fails on its own arithmetic.
    -- (P45-WAb F5: this comment was WRITTEN to fix an arithmetic nit and said
    -- «22», because it subtracted the two bridge doors from the 25 and then
    -- counted only one of them back out. 25 − 2 accepted − 1 tokenless − 1
    -- anonymous = 21, which is what spec §4z·5·8 says and what the live blast-
    -- radius sweep counted. A comment that disagrees with the spec is worth
    -- exactly as much as a comment that disagrees with the code.)
    'admin_bridge_status(text)',
    'admin_bridge_mint(text)',
    'admin_bridge_revoke(text)',
    'bridge_pull(text)',
    'bridge_push(text, text, jsonb)',
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

-- ═══════════════════════════════════════════════════════════════════════════
-- ROUND 18 MIGRATION — THE ASSESSMENT SCOPE IS SEEDED TO TODAY'S REALITY, ONCE
-- ───────────────────────────────────────────────────────────────────────────
-- «Τωρα τελειωνουν της 98Β, οποτε μονο για αυτους θελω προτασεις» (2026-08-26).
-- 98B HAF is the class finishing on the day this ruling was made, so that is
-- the value this file installs — the setting arrives ALREADY CORRECT and the
-- admin does not have to know the feature exists before the instructors can be
-- asked anything.
--
-- IT IS GUARDED BY THE LEDGER AND NOT BY `on conflict`, for the round-10
-- reason exactly: this file is re-applied on every deploy, and «seed if the
-- row is missing» would resurrect 98B HAF the first time an admin deliberately
-- CLOSES the assessments by choosing «— none —» (which stores a NULL value, or
-- which a later cleanup might remove altogether). A decision the admin made on
-- the dashboard must not be undone by a deployment. So the seed runs ONCE per
-- database, ever, and afterwards the only writer is
-- public.admin_set_assessment_class.
do $$
declare cur text;
begin
  if exists (select 1 from wa.migrations where id = 'r18-assessment-class') then
    cur := wa.assessment_class();
    raise notice 'r18: assessment scope already seeded — leaving it at %',
      coalesce('«' || cur || '»', 'none (assessments closed)');
  else
    insert into wa.settings (key, value) values ('assessment_class', '98B HAF')
    on conflict (key) do nothing;
    insert into wa.migrations (id, note) values ('r18-assessment-class',
      'r18: assessment_class seeded to «98B HAF» — the class finishing on 2026-08-26. Changed thereafter only through public.admin_set_assessment_class.');
    raise notice 'r18: assessment scope seeded to «%» (% active student(s) in it)',
      wa.assessment_class(),
      (select count(*) from public.people s
        where s.role = 'student' and s.active and wa.student_in_scope(s));
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 24 SEED — THE BRIDGE CREDENTIAL'S ROW EXISTS, AND IT IS NEVER MINTED
-- ──────────────────────────────────────────────────────────────────────────
-- wa.bridge_access is a SINGLETON (`check (id = 1)`), and this is where its one
-- row is born — in the honest never-minted state: no digest, not active, no
-- dates. So the People page's Bridge card reads a ROW that says «no credential»
-- rather than inferring it from an absence, and admin_bridge_mint is an UPDATE
-- of something that exists instead of a create-or-update whose two branches can
-- drift.
--
-- WHAT THIS BLOCK DOES NOT DO, AND MUST NEVER DO: mint. A deployment cannot mint
-- a credential, because the plaintext exists exactly once, in the answer to the
-- admin's own click — a token minted by a schema run would have nowhere to be
-- shown and would sit armed in the database with nobody holding it. The
-- credential is created by a human, on his own screen, and by no other path.
--
-- IT IS GUARDED BY THE LEDGER AND NOT BY `on conflict`, for the round-10 and
-- round-18 reason exactly: this file is re-applied on every deploy, and «insert
-- if the row is missing» would RESURRECT the row the first time an owner
-- deliberately de-provisions the lane by deleting it. A decision somebody made
-- must not be undone by a deployment. So it runs ONCE per database, ever.
do $$
declare st jsonb;
begin
  if exists (select 1 from wa.migrations where id = 'p45-bridge-lane') then
    st := wa.bridge_status_json();
    raise notice 'r24: bridge lane already seeded — credential exists=% active=% (minted by the admin, never by a deploy)',
      st->>'exists', st->>'active';
  else
    insert into wa.bridge_access (id, token_sha256, active) values (1, null, false)
    on conflict (id) do nothing;
    insert into wa.migrations (id, note) values ('p45-bridge-lane',
      'r24 (P45-WA): the FDMS bridge lane — wa.bridge_access / bridge_tombstones / bridge_audit, wa.auth_bridge, public.bridge_pull / bridge_push and the three admin_bridge_* RPCs. This row seeds the SINGLETON credential row in its never-minted state (no digest, not active). No deployment ever mints: the plaintext exists once, in the answer to admin_bridge_mint, on the admin''s own screen.');
    raise notice 'r24: bridge lane seeded — one credential row, never minted; % tombstone(s), % audit row(s)',
      (select count(*) from wa.bridge_tombstones),
      (select count(*) from wa.bridge_audit);
  end if;
end $$;

-- ── bootstrap: the admin person (created once; token survives re-runs) ─────
-- ROUND 17b — THE SEED IS A ROLE, NOT A PERSON. «Ο admin δεν ειναι ο squadron
-- CO, ειμαι εγω, ο developer» (2026-08-22). Round 17 stopped every SURFACE
-- from calling the admin the CO and left the one place that says it in DATA:
-- this seed, which wrote the surname «Squadron CO» into the row every fresh
-- deployment reads its display name from — so a brand-new install introduced
-- its own holder as the squadron's Commanding Officer before anybody typed a
-- character. The seed now writes the NEUTRAL ROLE and nothing else: no rank,
-- no given name, last_name = 'Admin'. WA.personRankName joins rank + surname,
-- so every surface that prints the holder reads exactly «Admin» until he sets
-- his own name.
-- WHERE THE REAL NAME LIVES: in the DATABASE, set by the admin himself through
-- People → Edit on the running instance. It never enters a tracked file — the
-- privacy rule of round 9, unchanged.
-- EXISTING INSTALLS ARE UNTOUCHED: the insert is guarded by `not exists`, so
-- on any database that already has an admin row it does nothing at all, and a
-- name already set (including one still reading «Squadron CO») is left exactly
-- as it stands for its owner to correct through the same People → Edit.
insert into public.people (role, rank, first_name, last_name)
select 'admin', '', '', 'Admin'
where not exists (select 1 from public.people where role = 'admin');

-- ══ ROUND 20 — THE search_path AUDIT: THE SWEEP PROVES ITSELF ══════════════
-- The 27/08 advisor triage (spec §4φ) counted `function_search_path_mutable`
-- ×102 — every helper in the `wa` schema. All 102 now carry
-- «set search_path = public, wa, pg_temp», WHICH IS THE STRING THE PUBLIC RPCs
-- ALREADY SET: a wa helper is only ever reached from a public RPC that has
-- already put exactly those three schemas on the path, so pinning them to it is
-- behaviour-identical by construction rather than by hope. wa.gen_token keeps
-- its own (`public, extensions, pg_temp`) because pgcrypto lives in a fourth
-- schema on Supabase — which is why it was the one function pinned already.
--
-- AND THE PIN IS AUDITED, NOT REMEMBERED. `create or replace function` replaces
-- a function's SET clauses along with its body, so a future round that
-- re-creates one wa helper without the clause would silently unpin it and the
-- advisor would grow the lint back one function at a time. This block FAILS THE
-- DEPLOYMENT instead, naming every function that lost it — the only kind of
-- reminder that cannot be forgotten. It reads the catalog, so what it asserts
-- is true of the DATABASE and not merely of this file.
do $$
declare bad text[];
begin
  select coalesce(array_agg(p.oid::regprocedure::text order by p.proname), '{}')
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'wa'
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                    where c like 'search_path=%');
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'search_path is not pinned on % wa function(s): % — every wa function must carry «set search_path = public, wa, pg_temp» (round 20; spec §4φ advisor triage)',
      array_length(bad, 1), array_to_string(bad, ', ');
  end if;
  raise notice 'r20: search_path pinned on all % wa functions',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'wa');
end $$;


-- ══ ROUND 22 (WA-21 verify finding 4) — THE MARKERS ARE A SUBSET, AND IT IS
-- ══ ASSERTED, NOT MERELY WRITTEN DOWN ═════════════════════════════════
-- wa.withsp_markers() is declared (§4x·2) as a SUBSET of wa.flight_kinds(): the
-- three markers a with-SP currency row may carry in its `sortie` box ARE the R12
-- flight-kind ids, and that is what makes the bridge join of §4x·6 a JOIN and not
-- a translation table. Nothing enforced it. Add a fourth marker here, or rename a
-- kind there, and the two lists drift apart silently — the join would then match
-- nothing for that value and no error would ever be raised, which is the worst
-- failure this file can have: a wrong answer with no complaint.
-- SO IT FAILS THE DEPLOYMENT, WITH NAMES — the round-20 search_path audit's own
-- pattern, for the same reason: an invariant a future round can break by accident
-- must be checked by the machine, not remembered by a person. It reads the
-- FUNCTIONS, so what it asserts is true of the DATABASE and not of this file.
do $$
declare bad text[];
begin
  select coalesce(array_agg(m order by m), '{}') into bad
  from unnest(wa.withsp_markers()) m
  where not (m = any(wa.flight_kinds()));
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'wa.withsp_markers() is not a subset of wa.flight_kinds(): % — the with-SP markers ARE the R12 flight-kind ids (spec §4x·2) and the bridge join of §4x·6 depends on it; add the value to wa.flight_kinds() or take it out of wa.withsp_markers()',
      array_to_string(bad, ', ');
  end if;
  -- and the two deliberate EXCLUSIONS stay excluded ON PURPOSE, not by accident:
  -- 'syllabus' (a syllabus flight is named by its code) and 'other' (the
  -- off-catalogue free text IS the other). Either one appearing in the marker
  -- list is a mistake of exactly the same silent kind.
  if 'syllabus' = any(wa.withsp_markers()) or 'other' = any(wa.withsp_markers()) then
    raise exception 'wa.withsp_markers() must not contain «syllabus» or «other» — a syllabus flight is named by its code and the off-catalogue free text IS the other (spec §4x·2)';
  end if;
  raise notice 'r22: withsp_markers (%) is a subset of flight_kinds (%)',
    array_to_string(wa.withsp_markers(), '/'), array_to_string(wa.flight_kinds(), '/');
end $$;

-- ══ ROUND 22 — THE SOLO CODE SETS ARE REAL SORTIES (r23: AND SO IS THE MARK) ═
-- The two solo MARKS of the client (round 22: they were refusals of
-- wa.validate_record) are judged against two GENERATED arrays
-- (wa.solo_slot_codes / wa.solo_only_codes, spliced out of the flow chart by
-- tools/gen-items-catalog.py). ROUND 23 — THE ARRAYS STAY, AND SO DO ALL THREE
-- ASSERTIONS, although nothing on this side refuses by them any more: they are
-- the GENERATED MIRROR of the client's mark set, emitted in the same run as the
-- JS copy, so asserting the SQL copy asserts the run. A code in either of them
-- that the flow chart does not know would make the client mark a row for a
-- sortie that does not exist — the same unanswerable nonsense a refusal nobody
-- could satisfy used to be. And
-- solo_only ⊆ solo_slot holds by construction, so a run that broke it broke the
-- derivation. Both are asserted, in the same pattern, for the same reason.
do $$
declare bad text[];
begin
  select coalesce(array_agg(c order by c), '{}') into bad
  from unnest(wa.solo_slot_codes()) c
  where wa.sortie_band(c) is null;
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'wa.solo_slot_codes() names % sortie(s) the flow chart does not know: % — a solo candidate must be a real sortie of the printed chart (round 22; regenerate with tools/gen-items-catalog.py)',
      array_length(bad, 1), array_to_string(bad, ', ');
  end if;
  select coalesce(array_agg(c order by c), '{}') into bad
  from unnest(wa.solo_only_codes()) c
  where not (c = any(wa.solo_slot_codes()));
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'wa.solo_only_codes() is not a subset of wa.solo_slot_codes(): % — a solo BY DEFINITION is a solo CANDIDATE of some slot (round 22)',
      array_to_string(bad, ', ');
  end if;
  -- ROUND 22b — AND NO SOLO CANDIDATE IS A CHECKRIDE. The two sets come from
  -- two different markers of the same generated chart (`sc` and `k`) and are
  -- disjoint by construction; if a run ever made them overlap, the solo picker
  -- would offer a code the save still refuses by name (the finding-2b fence —
  -- one of the four refusals round 23 deliberately LEFT STANDING), and
  -- the student would be told to record a flight in a section that cannot hold
  -- it. That is the same silent, unanswerable refusal the two assertions above
  -- exist to prevent, so it is asserted in the same place and the same words.
  select coalesce(array_agg(c order by c), '{}') into bad
  from unnest(wa.solo_slot_codes()) c
  where c = any(wa.eval_ids());
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'wa.solo_slot_codes() names % checkride(s): % — a checkride is flown WITH an evaluator and is recorded in Evaluations; it can never be a solo candidate (round 22b)',
      array_length(bad, 1), array_to_string(bad, ', ');
  end if;
  raise notice 'r22: % solo candidate code(s), of which % marked SUSPECT by name always (%) — no longer refused (ruling 2026-08-28, §4y·11·1)',
    coalesce(array_length(wa.solo_slot_codes(), 1), 0),
    coalesce(array_length(wa.solo_only_codes(), 1), 0),
    array_to_string(wa.solo_only_codes(), '/');
end $$;

-- ══ ROUND 24 — THE BRIDGE TABLES' AUDIT: THE PROMISE, KEPT ════════════════
-- THIS BLOCK IS THE ONE THE FRAGMENT'S COMMENTS PROMISED AND NOBODY WROTE
-- (WA-24 verify findings 9a and 10·1). Two sentences up the file claimed «an
-- audit block at the foot of this file FAILS THE DEPLOYMENT if a future round
-- ever grants anything on them» and «asserts all of it against the CATALOG»,
-- and there was no such block: the belt-and-braces argument rested on a
-- tripwire that did not exist, so a later round could have loosened every one
-- of these locks and nothing would have complained. That is precisely the
-- «comment that lied» class rounds 22b and 23b were spent on, and the cure is
-- the same one: not to soften the sentence, but to write the block.
--
-- IT READS THE CATALOG, NOT THIS FILE — pg_class, pg_namespace, pg_policy,
-- pg_constraint, pg_proc and the ACLs — so what it asserts is true of the
-- DATABASE the schema was just applied to. Five things, each failing with
-- names:
--   1. all three tables are in schema `wa` (the unreachability argument IS
--      their address: PostgREST is configured for `public` and
--      `graphql_public` and reaches nothing else);
--   2. RLS on, ZERO policies — default-deny, the §4φ-accepted shape;
--   3. no privilege of any kind for public / anon / authenticated, on the
--      tables or on the audit table's identity sequence;
--   4. the two spelled-out vocabularies of wa.bridge_tombstones still say
--      exactly what their registries say, and the two handle guards are still
--      there. This is the other half of the proposals_level_chk doctrine: the
--      literals stay literals (a CHECK that called a function could be widened
--      by redefining the function), and the AUDIT is what stops them drifting
--      from the list they mirror — the r22 withsp_markers pattern, applied to
--      a table constraint instead of to a pair of functions;
--   5. wa.auth_bridge still refuses a READ ONLY transaction before it compares
--      anything (P45-WAb F3) — the one line that stops PostgREST's GET verb
--      from separating a live credential from a dead one by status code — and
--      the assertion is on the EXECUTABLE guard, not on the word appearing
--      somewhere in the body, comments included (P45-WAc F3), with BOTH SQL
--      comment syntaxes stripped and the guard asserted to stand FIRST, before
--      the credential is read at all (P45-WAd F2).
do $$
declare
  bad text[];
  want text[];
  got  text[];
  def  text;
  body text;   -- `def` with BOTH kinds of SQL comment stripped (P45-WAd F2)
  n int;
begin
  -- 1 · the address
  select coalesce(array_agg(t.rel order by t.rel), '{}') into bad
  from unnest(array['bridge_access','bridge_tombstones','bridge_audit']) t(rel)
  where not exists (select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                     where ns.nspname = 'wa' and c.relname = t.rel and c.relkind = 'r');
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'r24: the bridge table(s) % are not in schema «wa» — the lane is unreachable from PostgREST BY ADDRESS (the API is configured for public + graphql_public), and moving one to `public` would put a forgeable tombstone on the open REST surface',
      array_to_string(bad, ', ');
  end if;

  -- 2 · RLS on, no policy
  select coalesce(array_agg(c.relname order by c.relname), '{}') into bad
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'wa' and c.relname like 'bridge\_%' and c.relkind = 'r'
    and not c.relrowsecurity;
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'r24: row level security is OFF on wa.% — RLS with no policy is the second lock (default-deny), and it is what the §4φ advisor triage accepted by design',
      array_to_string(bad, ', wa.');
  end if;
  select coalesce(array_agg(c.relname || ' (' || pol.polname || ')' order by c.relname), '{}')
    into bad
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'wa' and c.relname like 'bridge\_%';
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'r24: wa.% carries a POLICY — these tables are reached only through SECURITY DEFINER RPCs, which run as the owner and bypass RLS; a policy here can only ever be a door somebody opened for a role that should have none',
      array_to_string(bad, ', wa.');
  end if;

  -- 3 · not one privilege for the API roles, tables or sequence
  select coalesce(array_agg(c.relname || ' → ' || g.grantee order by c.relname, g.grantee), '{}')
    into bad
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  cross join unnest(array['public','anon','authenticated']) g(grantee)
  where ns.nspname = 'wa' and c.relname like 'bridge\_%'
    and c.relkind in ('r', 'S')
    and (has_table_privilege(case when g.grantee = 'public' then 'public' else g.grantee end,
                             c.oid, 'select')
      or has_table_privilege(case when g.grantee = 'public' then 'public' else g.grantee end,
                             c.oid, 'insert')
      or has_table_privilege(case when g.grantee = 'public' then 'public' else g.grantee end,
                             c.oid, 'update')
      or has_table_privilege(case when g.grantee = 'public' then 'public' else g.grantee end,
                             c.oid, 'delete'));
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'r24: a bridge table is GRANTED to an API role — % — and the whole design of this lane is that no role but the owner ever touches it: a readable tombstone is training data, a writable one is a silent, tokenless data-withholding attack on any identity',
      array_to_string(bad, ', ');
  end if;

  -- 4 · the spelled-out vocabularies still mirror their registries
  select pg_get_constraintdef(con.oid) into def
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'wa' and c.relname = 'bridge_tombstones'
    and con.conname = 'bridge_tombstones_section_chk';
  if def is null then
    raise exception 'r24: wa.bridge_tombstones lost its `section` CHECK — the tombstone gate is keyed to a band, and a band nobody constrains is a gate that can be laid on a section that does not exist';
  end if;
  select coalesce(array_agg(m[1] order by m[1]), '{}') into got
  from regexp_matches(def, '''([a-z_]+)''', 'g') m;
  select coalesce(array_agg(b order by b), '{}') into want from unnest(wa.log_bands()) b;
  if got is distinct from want then
    raise exception 'r24: the spelled-out `section` CHECK of wa.bridge_tombstones says (%) while wa.log_bands() says (%) — the literal is deliberate (the proposals_level_chk rule: a CHECK that called a function could be widened by redefining the function), so widening the registry means widening this constraint in the same commit',
      array_to_string(got, '/'), array_to_string(want, '/');
  end if;

  select pg_get_constraintdef(con.oid) into def
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'wa' and c.relname = 'bridge_tombstones'
    and con.conname = 'bridge_tombstones_reason_chk';
  if def is null then
    raise exception 'r24: wa.bridge_tombstones lost its `reason` CHECK — every removal names why it happened, and the report on the FDMS side prints that word to the developer';
  end if;
  select coalesce(array_agg(m[1] order by m[1]), '{}') into got
  from regexp_matches(def, '''([a-z_]+)''', 'g') m;
  select coalesce(array_agg(b order by b), '{}') into want from unnest(wa.bridge_reasons()) b;
  if got is distinct from want then
    raise exception 'r24: the spelled-out `reason` CHECK of wa.bridge_tombstones says (%) while wa.bridge_reasons() says (%)',
      array_to_string(got, '/'), array_to_string(want, '/');
  end if;

  -- the two handle guards: a tombstone's date is an ISO date and its seq is a
  -- flight number, exactly as wa.is_iso_date and wa.validate_section demand of
  -- the row it is a tombstone FOR (the first draft took '12/08/2026' and -7)
  select count(*) into n
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'wa' and c.relname = 'bridge_tombstones'
    and con.conname in ('bridge_tombstones_date_chk', 'bridge_tombstones_seq_chk')
    and (con.conname <> 'bridge_tombstones_date_chk'
         or pg_get_constraintdef(con.oid) like '%d{4}-%d{2}-%d{2}%');
  if n <> 2 then
    raise exception 'r24: wa.bridge_tombstones is missing a handle guard — the date must carry the ISO pattern wa.is_iso_date matches and the seq must be 1..20, the bounds wa.validate_section asks of a flight row (found % of the 2)', n;
  end if;

  -- and the credential cannot be armed with nothing to authenticate
  select count(*) into n
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'wa' and c.relname = 'bridge_access'
    and con.conname = 'bridge_access_armed_chk';
  if n <> 1 then
    raise exception 'r24: wa.bridge_access lost bridge_access_armed_chk — without it the table accepts active=true beside token_sha256=null, and the People page would print «active since …» for a credential that refuses every call';
  end if;

  -- 5 · THE READ-ONLY GUARD IS STILL THE FIRST THING wa.auth_bridge DOES
  --     (P45-WAb, F3). The lane's headline discipline is that every failure
  --     answers in ONE sentence, and PostgREST's GET defeated it: routed to a
  --     volatile function inside a READ ONLY transaction, a bad token raised
  --     the house sentence (400) while a LIVE one reached the last_used_at
  --     UPDATE and died on the transaction (405), so the STATUS CODE told a
  --     live credential from a dead one. The cure is a guard that raises before
  --     any comparison — and a guard nothing asserts is a guard a later round
  --     removes while tidying. This reads the CATALOG's own copy of the
  --     function body, so it is true of the database and not of this file —
  --     and, since P45-WAc F3, it asserts a guard that RUNS rather than a word
  --     that appears (see the block below the null check).
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'wa' and p.proname = 'auth_bridge';
  if def is null then
    raise exception 'r24: wa.auth_bridge does not exist — it is the ONLY entrance to public.bridge_pull and public.bridge_push';
  end if;
  -- P45-WAc F3 — AND IT ASSERTS AN EXECUTABLE GUARD, NOT A WORD IN A COMMENT.
  -- The first spelling of this was `position('transaction_read_only' in def) = 0`,
  -- a SUBSTRING test over the whole function body — and the body includes its
  -- comments. Its stated job is to survive a later round «tidying», and the way
  -- rounds tidy is by COMMENTING OUT: leave the guard behind a `--` with the
  -- word still in the prose above it and the deployment went green while the
  -- live-token oracle was fully back. Proven both ways in P45-WAc.
  -- So the COMMENTS COME OFF FIRST and what is asserted is the SHAPE of a
  -- running guard: a conditional that reads current_setting('transaction_read_only')
  -- and RAISES. `[^;]*` is what ties the three together — there is no statement
  -- terminator between an `if` and the `raise` that is its first statement — so
  -- the wording of the comparison stays free to change while the mechanism may
  -- not disappear.
  --
  -- ── P45-WAd F2 — BOTH KINDS OF COMMENT, BECAUSE SQL HAS TWO ──────────────
  -- The P45-WAc verify walked straight through the half that was missing: the
  -- strip was `--[^\n]*` ONLY, so commenting the three-line guard out with
  -- `/* … */` — the ordinary way a SQL round tidies a BLOCK — left the
  -- deployment GREEN with the oracle fully back (proven live in that verify:
  -- inside `SET LOCAL transaction_read_only = on` a live token reached the
  -- UPDATE and died 25006/405 while a wrong token got the house sentence/400).
  -- A guard-assertion that only knows one of SQL's two comment syntaxes is a
  -- guard-assertion that knows neither. BLOCK COMMENTS COME OFF FIRST — a `--`
  -- inside a `/* … */` is text, while a `/*` inside a `--` line is already dead
  -- — and `.*?` is non-greedy so two separate blocks are not eaten as one.
  -- (The strip is safe on THIS body: it carries neither `--` nor `/*` inside a
  -- string literal, and the assertion would fail loudly, not quietly, if a later
  -- round put one there.)
  body := regexp_replace(regexp_replace(def, '/\*.*?\*/', '', 'g'),
                         '--[^\n]*', '', 'g');
  if body !~ 'if[^;]*current_setting\s*\(\s*''transaction_read_only''[^;]*then[^;]*raise' then
    raise exception 'r24: wa.auth_bridge has lost its read-only guard — an EXECUTABLE «if current_setting(''transaction_read_only'' …) then raise» is not in the catalog''s copy of the body, with BOTH kinds of SQL comment stripped first (a guard that is only mentioned in a comment, of either syntax, is not a guard). Without it PostgREST answers GET rpc/bridge_pull?p_token=… with 400 for a wrong token and 405 for a live one, and the status code alone becomes a live-credential oracle that wa.bridge_refusal_msg exists to make impossible';
  end if;

  -- ── P45-WAd F2, THE SECOND HALF — THE GUARD IS ALSO *FIRST* ──────────────
  -- The assertion above tests EXISTENCE. The P45-WAc verify's other doctoring
  -- moved the guard BELOW the credential lookup, executable and intact: the
  -- assertion passed and the property broke anyway, because a live token now
  -- reaches the lookup before the raise and the two 400 bodies differ again.
  -- «Raises with nothing compared and nothing read» is the sentence the guard's
  -- own comment makes, so it is assertable: in the comment-stripped body, the
  -- guard must appear BEFORE the first mention of wa.bridge_access — the table
  -- that holds the digest and the last_used_at both halves of the oracle came
  -- from. Anchoring on the TABLE rather than on `token_sha256` survives a column
  -- rename and still covers the `update`, which is what the 405 came from.
  --
  -- WHAT THIS DOES AND DOES NOT PROVE — the limit, stated instead of implied.
  -- It proves TEXTUAL order in the executable body, which for this body (a
  -- straight-line plpgsql block: guard, lookup, update) is execution order. It
  -- does NOT read control flow: a guard sitting first but wrapped in a branch
  -- that is never taken would still pass here, and nothing short of executing
  -- the function can see that. Two assertions therefore stand where three would
  -- be needed for a proof — shape (it runs) and position (it runs first) — and
  -- the third is a LIVE test, which is where it is done: §4z·10·3's six-state
  -- GET matrix, re-run every acceptance sweep, is what actually observes the
  -- oracle being dead. Recorded again in §4z·10·3 so the limit travels.
  if position('bridge_access' in body) = 0
     or position('transaction_read_only' in body) = 0
     or position('transaction_read_only' in body) > position('bridge_access' in body) then
    raise exception 'r24: wa.auth_bridge''s read-only guard is no longer the FIRST thing it does — in the catalog''s copy of the body (comments stripped) the read of wa.bridge_access comes before the current_setting(''transaction_read_only'') guard, or one of the two is not there at all. The guard''s whole property is that it «raises with nothing compared and nothing read»: once a live credential can reach the lookup or the last_used_at UPDATE inside a READ ONLY transaction, the GET answers differ again by status code or by body, and that difference is the live-credential oracle P45-WAb closed';
  end if;

  raise notice 'r24: bridge lane audited — 3 tables in schema wa, RLS on, 0 policies, 0 API grants; section (%) ≡ wa.log_bands(), reason (%) ≡ wa.bridge_reasons(); handle guards, the armed check and the read-only (GET) guard executable and FIRST (both comment syntaxes stripped)',
    array_to_string(wa.log_bands(), '/'), array_to_string(wa.bridge_reasons(), '/');
end $$;

-- ══ P45-WAe — THE TWO PROPERTIES THIS ROUND BOUGHT, AND NEITHER IS VISIBLE ═══
-- ── AUDIT 1 · wa.norm_entry SAYS WHAT wa.norm_field SAYS ──────────────────
-- wa.norm_entry writes out the per-field dispatch instead of calling
-- wa.norm_field 53 000 times per export (the whole story is at that function).
-- A dispatch said in two places is a rule that can disagree with itself, and
-- the disagreement would be SILENT: an export whose sortie codes stopped being
-- upper-cased, or whose notes lost their inner newlines, still validates, still
-- diffs clean against nothing, and only surfaces as a bridge that cannot match
-- a row it wrote. So the equivalence is ASSERTED, not remembered — the r22
-- withsp_markers pattern applied to a pair of expressions — across every field
-- CLASS (code / free / plain / unregistered) × every jsonb TYPE the two can
-- meet. It reads the LIVE functions, so what it proves is true of the database.
do $$
declare bad text[] := '{}'; kk text; vv jsonb; got jsonb; want jsonb;
begin
  foreach kk in array (wa.code_fields() || wa.free_fields()
                       || array['instructor','date','grade','legacy','entered_by','zzz']) loop
    foreach vv in array array[
        '" c4302 "'::jsonb, '"C4302"'::jsonb, '"c4302"'::jsonb, '"  a   b  "'::jsonb,
        '""'::jsonb, '" one \n two "'::jsonb, '"x y​z﻿"'::jsonb,
        'null'::jsonb, '0'::jsonb, '3'::jsonb, '1.5'::jsonb, 'true'::jsonb, 'false'::jsonb,
        '[]'::jsonb, '[" x ","Y "]'::jsonb, '[1,"  z  ",null,true]'::jsonb,
        '{"a":" b "}'::jsonb] loop
      got  := wa.norm_entry(jsonb_build_object(kk, vv)) -> kk;
      want := wa.norm_field(kk, vv);
      if got is distinct from want then
        bad := bad || format('%s = %s → norm_entry %s / norm_field %s',
                             kk, vv::text, got::text, want::text);
      end if;
    end loop;
  end loop;
  if coalesce(array_length(bad, 1), 0) > 0 then
    raise exception 'P45-WAe: wa.norm_entry no longer normalises a field the way wa.norm_field does — % disagreement(s): %. The per-field dispatch is written out inside wa.norm_entry because calling wa.norm_field once per field costs 1.7 s of a 3 s statement budget on a real export (the pin on every wa helper blocks PostgreSQL''s SQL inliner, so the call is never free); the price of writing it twice is that the two must be PROVEN equal on every deploy. Fix the copy in wa.norm_entry, or change wa.norm_field and wa.norm_str together with it',
      array_length(bad, 1), array_to_string(bad, ' · ');
  end if;
  raise notice 'P45-WAe: wa.norm_entry ≡ wa.norm_field over % field name(s) × 17 value shapes',
    coalesce(array_length(wa.code_fields() || wa.free_fields()
                          || array['instructor','date','grade','legacy','entered_by','zzz'], 1), 0);
end $$;

-- ── AUDIT 2 · THE EXPORT STILL READS EACH RECORD'S MIGRATION ONCE ─────────
-- THE DEFECT THIS GUARDS AGAINST HAS NO OUTPUT SIGNATURE AT ALL. wa.export_body
-- used to hang the migration off a `cross join lateral (select …) m` and name
-- `m.rec` five times; PostgreSQL flattens such a sub-select and substitutes the
-- expression at every reference, so wa.migrate_record ran ~5× per record and the
-- answer was byte-identical every time. 16.8 s for a 1.5 MB payload, against the
-- anon role's 3 s statement_timeout — i.e. the read door of the FDMS bridge was
-- dead after the first real push, and no diff, no test and no reader could see
-- why. A CTE «as materialized» is the cure and the ONLY part of it a later round
-- could undo by accident while tidying. Two assertions, on the catalog's own
-- copy of the body with both comment syntaxes stripped (the P45-WAd F2 lesson —
-- a guard that only knows `--` does not know `/* … */`):
--   · the CTEs are still MATERIALIZED, and
--   · each migration is NAMED EXACTLY ONCE, because a second spelling is a
--     second migration whatever the CTE says.
do $$
declare def text; body text; n_mat int; n_stu int; n_ins int;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'wa' and p.proname = 'export_body';
  if def is null then
    raise exception 'P45-WAe: wa.export_body does not exist — it is the ONE body behind both public.admin_export and public.bridge_pull';
  end if;
  body := regexp_replace(regexp_replace(def, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g');
  select count(*) into n_mat from regexp_matches(body, 'as\s+materialized', 'gi');
  select count(*) into n_stu from regexp_matches(body, 'wa\.migrate_record\s*\(', 'g');
  select count(*) into n_ins from regexp_matches(body, 'wa\.migrate_instructor_record\s*\(', 'g');
  if n_mat < 2 or n_stu <> 1 or n_ins <> 1 then
    raise exception 'P45-WAe: wa.export_body has lost its once-per-record migration — the executable body carries % «as materialized» (expected 2), % call(s) to wa.migrate_record (expected 1) and % to wa.migrate_instructor_record (expected 1). Naming a migrated record more than once — or hanging it off a plain LATERAL / a non-materialised CTE, which the planner flattens and substitutes at every reference — re-runs the migration once per reference. It is invisible: every run returns the same bytes. It cost 16.8 s instead of 3.4 s on a 44-record / 2 200-flight-row export, which is the whole difference between the bridge''s read door answering and dying on the anon role''s 3 s statement_timeout',
      n_mat, n_stu, n_ins;
  end if;
  raise notice 'P45-WAe: wa.export_body migrates each record ONCE (% materialized CTE(s), 1 wa.migrate_record, 1 wa.migrate_instructor_record)', n_mat;
end $$;

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
