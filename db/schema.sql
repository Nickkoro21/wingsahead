-- ═══════════════════════════════════════════════════════════════════════════
-- WingsAhead — full database schema (Supabase / Postgres)
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
end $$;

-- STUDENT RECORD payload — full structural validation, raises on violation
create or replace function wa.validate_record(p jsonb) returns void
language plpgsql immutable as $$
declare
  k text;
  e jsonb;
  i int;
  allowed text[] := array['nfs','sms','fail','almost_good','airsickness',
                          'evaluations','solo_flights','progress_tests','aptitude_exams'];
  lists text[]   := array['sms','fail','almost_good','airsickness',
                          'evaluations','solo_flights','progress_tests','aptitude_exams'];
begin
  perform wa.chk(p is not null and jsonb_typeof(p) = 'object', 'root', 'payload must be an object');
  perform wa.chk(pg_column_size(p) < 200000, 'root', 'payload too large');
  for k in select jsonb_object_keys(p) loop
    perform wa.chk(k = any(allowed), k, 'unknown section');
  end loop;

  -- nfs: { count: int >= 0, dates: [iso ...] }
  if p ? 'nfs' then
    perform wa.chk(jsonb_typeof(p->'nfs') = 'object', 'nfs', 'must be an object');
    if (p->'nfs') ? 'count' then
      perform wa.chk(jsonb_typeof(p->'nfs'->'count') = 'number'
                     and (p->'nfs'->>'count')::numeric = floor((p->'nfs'->>'count')::numeric)
                     and (p->'nfs'->>'count')::numeric between 0 and 999,
                     'nfs.count', 'must be an integer 0-999');
    end if;
    if (p->'nfs') ? 'dates' then
      perform wa.chk(jsonb_typeof(p->'nfs'->'dates') = 'array', 'nfs.dates', 'must be a list');
      perform wa.chk(jsonb_array_length(p->'nfs'->'dates') <= 100, 'nfs.dates', 'too many entries');
      for i in 0 .. coalesce(jsonb_array_length(p->'nfs'->'dates'), 0) - 1 loop
        perform wa.chk_date(p->'nfs'->'dates'->i, format('nfs.dates[%s]', i), true);
      end loop;
    end if;
  end if;

  -- every list section: array, <= 100 entries, entries are objects
  foreach k in array lists loop
    if p ? k then
      perform wa.chk(jsonb_typeof(p->k) = 'array', k, 'must be a list');
      perform wa.chk(jsonb_array_length(p->k) <= 100, k, 'too many entries');
      for i in 0 .. coalesce(jsonb_array_length(p->k), 0) - 1 loop
        e := p->k->i;
        perform wa.chk(jsonb_typeof(e) = 'object', format('%s[%s]', k, i), 'entry must be an object');
        if k = 'sms' then
          perform wa.chk_date(e->'entrance_date', format('sms[%s].entrance_date', i), true);
          perform wa.chk_date(e->'exit_date',      format('sms[%s].exit_date', i), false);
          perform wa.chk_bool(e->'pending',        format('sms[%s].pending', i));
        elsif k in ('fail', 'almost_good') then
          perform wa.chk_text(e->'item', format('%s[%s].item', k, i), true, 300);
          perform wa.chk_date(e->'date', format('%s[%s].date', k, i), false);
          perform wa.chk_bool(e->'pending', format('%s[%s].pending', k, i));
        elsif k = 'airsickness' then
          perform wa.chk_date(e->'date', format('airsickness[%s].date', i), true);
        elsif k = 'evaluations' then
          perform wa.chk_text(e->'with',  format('evaluations[%s].with', i), false, 200);
          perform wa.chk_grade(e->'grade', format('evaluations[%s].grade', i), false);
          perform wa.chk_date(e->'date',  format('evaluations[%s].date', i), false);
          perform wa.chk_bool(e->'pending', format('evaluations[%s].pending', i));
        elsif k = 'solo_flights' then
          perform wa.chk_date(e->'date', format('solo_flights[%s].date', i), true);
          perform wa.chk_bool(e->'graded', format('solo_flights[%s].graded', i));
          if coalesce((e->>'graded')::boolean, false) then
            -- instructor + grade required only when graded
            perform wa.chk_text(e->'instructor', format('solo_flights[%s].instructor', i), true, 200);
            perform wa.chk_grade(e->'grade', format('solo_flights[%s].grade', i), true);
          else
            perform wa.chk_text(e->'instructor', format('solo_flights[%s].instructor', i), false, 200);
            perform wa.chk_grade(e->'grade', format('solo_flights[%s].grade', i), false);
          end if;
        elsif k in ('progress_tests', 'aptitude_exams') then
          perform wa.chk_date(e->'date', format('%s[%s].date', k, i), false);
          perform wa.chk_text(e->'by',   format('%s[%s].by', k, i), false, 200);
          perform wa.chk_text(e->'result', format('%s[%s].result', k, i), false, 300);
          perform wa.chk_bool(e->'pending', format('%s[%s].pending', k, i));
        end if;
      end loop;
    end if;
  end loop;
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

-- count of pending-flagged entries (direct members of the top-level list
-- sections — same semantics as the client's WA.pendingItems; a jsonpath
-- '$.**' walk would double-count through lax-mode array unwrapping)
create or replace function wa.pending_count(p jsonb) returns int
language sql immutable as $$
  select coalesce((
    select count(*)::int
    from jsonb_each(coalesce(p, '{}'::jsonb)) s(key, val)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(val) = 'array' then val else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object'
      and coalesce((e->>'pending')::boolean, false)), 0)
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
begin
  v := wa.auth_role(p_token, 'student');
  select * into r from public.student_records where student_id = v.id;
  return jsonb_build_object(
    'me', wa.person_json(v),
    'data', coalesce(r.data, '{}'::jsonb),
    'last_update', r.last_update);
end $$;

create or replace function public.save_student_record(p_token text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare
  v public.people;
  t timestamptz;
begin
  v := wa.auth_role(p_token, 'student');
  perform wa.validate_record(p_payload);
  insert into public.student_records as sr (student_id, data, last_update)
  values (v.id, p_payload, now())
  on conflict (student_id)
  do update set data = excluded.data, last_update = now()
  returning last_update into t;
  return jsonb_build_object('ok', true, 'last_update', t);
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
  return jsonb_build_object(
    'me', wa.person_json(v),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person', wa.person_json(s),
               'record', coalesce(r.data, '{}'::jsonb),
               'last_update', r.last_update,
               'my_proposal', case when pr.id is null then null else jsonb_build_object(
                 'ranks', jsonb_build_object(
                   'fighters', pr.rank_fighters,
                   'helicopters', pr.rank_helicopters,
                   'transport_ff', pr.rank_transport_ff),
                 'flew_with', pr.flew_with,
                 'comment', pr.comment,
                 'updated_at', pr.updated_at) end)
             order by s.last_name, s.first_name)
      from public.people s
      left join public.student_records r on r.student_id = s.id
      left join public.proposals pr on pr.student_id = s.id and pr.instructor_id = v.id
      where s.role = 'student' and s.active), '[]'::jsonb));
end $$;

create or replace function public.save_proposal(p_token text, p_student_id uuid, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, wa, pg_temp as $$
declare
  v public.people;
  s public.people;
  rf smallint; rh smallint; rt smallint;
  fw boolean; cm text;
  n int;
  saved public.proposals;
begin
  v := wa.auth_role(p_token, 'instructor');
  select * into s from public.people
   where id = p_student_id and role = 'student' and active;
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
  cm := nullif(trim(coalesce(p_payload->>'comment', '')), '');

  insert into public.proposals as pr
         (instructor_id, student_id, rank_fighters, rank_helicopters,
          rank_transport_ff, flew_with, comment)
  values (v.id, p_student_id, rf, rh, rt, fw, cm)
  on conflict (instructor_id, student_id)
  do update set rank_fighters = excluded.rank_fighters,
                rank_helicopters = excluded.rank_helicopters,
                rank_transport_ff = excluded.rank_transport_ff,
                flew_with = excluded.flew_with,
                comment = excluded.comment
  returning * into saved;
  return jsonb_build_object('ok', true, 'updated_at', saved.updated_at);
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
    perform wa.chk(nullif(trim(p->>'last_name'), '') is not null, 'last_name', 'required');
    insert into public.people
           (role, mn, rank, first_name, last_name, class, duty, leadership, status)
    values (r,
            nullif(trim(coalesce(p->>'mn', '')), ''),
            nullif(trim(coalesce(p->>'rank', '')), ''),
            nullif(trim(coalesce(p->>'first_name', '')), ''),
            trim(p->>'last_name'),
            nullif(trim(coalesce(p->>'class', '')), ''),
            (nullif(p->>'duty', ''))::public.wa_duty,
            (nullif(p->>'leadership', ''))::public.wa_leadership,
            (nullif(p->>'status', ''))::public.wa_status)
    returning * into row;
  else
    select * into row from public.people where id = p_id;
    if not found then raise exception 'WA: unknown person'; end if;
    perform wa.chk(not (p ? 'role'), 'role', 'role cannot be changed');
    update public.people set
      mn         = case when p ? 'mn'         then nullif(trim(coalesce(p->>'mn', '')), '')         else mn end,
      rank       = case when p ? 'rank'       then nullif(trim(coalesce(p->>'rank', '')), '')       else rank end,
      first_name = case when p ? 'first_name' then nullif(trim(coalesce(p->>'first_name', '')), '') else first_name end,
      last_name  = case when p ? 'last_name'  then coalesce(nullif(trim(p->>'last_name'), ''), last_name) else last_name end,
      class      = case when p ? 'class'      then nullif(trim(coalesce(p->>'class', '')), '')      else class end,
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
      'record', coalesce(r.data, '{}'::jsonb),
      'last_update', r.last_update,
      'completion', jsonb_build_object(
        'has_record', r.student_id is not null,
        'pending_count', wa.pending_count(r.data),
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
                          'student_id', r.student_id, 'data', r.data,
                          'last_update', r.last_update)) from public.student_records r), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg(jsonb_build_object(
                    'instructor_id', pr.instructor_id, 'student_id', pr.student_id,
                    'ranks', jsonb_build_object('fighters', pr.rank_fighters,
                      'helicopters', pr.rank_helicopters, 'transport_ff', pr.rank_transport_ff),
                    'flew_with', pr.flew_with, 'comment', pr.comment,
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
    'list_students_for_instructor(text)',
    'save_proposal(text, uuid, jsonb)',
    'admin_list_people(text)',
    'admin_save_person(text, uuid, jsonb)',
    'admin_delete_person(text, uuid)',
    'admin_set_active(text, uuid, boolean)',
    'admin_regenerate_token(text, uuid)',
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
