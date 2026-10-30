-- William Tool · accounts + shared command library
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Access model
--   * People sign in with Google. Anyone can sign up, but a new account is "pending" and cannot use the app
--     until an admin approves it (in the app: tab "Thành viên").
--   * Approved members read every shared command and may add their own; they can only
--     edit / delete commands they created. Admins can edit every shared command.
--   * A command marked private is visible to its owner only (admins included).
--   * All rules are enforced by Row Level Security, so they hold even if someone
--     calls the REST API directly with the public anon key.
--
-- First admin: sign up in the app, then run
--   update public.app_members set status = 'approved', role = 'admin' where email = 'ten@congty.vn';

-- ── members ───────────────────────────────────────────────────────────────────

create table if not exists public.app_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  role         text not null default 'member' check (role in ('member', 'admin')),
  requested_at timestamptz not null default now(),
  decided_by   text,
  decided_at   timestamptz
);

-- name / photo from the Google profile, shown on the members page
alter table public.app_members add column if not exists full_name text;
alter table public.app_members add column if not exists avatar_url text;

create or replace function public.current_email() returns text
  language sql stable
  as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.app_members where user_id = auth.uid() and status = 'approved') $$;

create or replace function public.is_app_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.app_members where user_id = auth.uid() and status = 'approved' and role = 'admin') $$;

-- every new account starts as a pending request
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  insert into public.app_members (user_id, email, full_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (user_id) do update
    set full_name  = coalesce(excluded.full_name, public.app_members.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.app_members.avatar_url);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- refresh name / photo when the profile changes (e.g. first Google sign-in of an email account)
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of raw_user_meta_data on auth.users for each row execute function public.handle_new_user();

-- accounts that existed before this script ran
insert into public.app_members (user_id, email, full_name, avatar_url)
  select id, lower(email),
         coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
         coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture')
    from auth.users where email is not null
  on conflict (user_id) do update
    set full_name  = coalesce(excluded.full_name, public.app_members.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.app_members.avatar_url);

-- safety net if the trigger did not run for some account
create or replace function public.request_access() returns void
  language sql security definer set search_path = public
  as $$ insert into public.app_members (user_id, email) select auth.uid(), public.current_email() where auth.uid() is not null on conflict (user_id) do nothing $$;

-- admins approve / block / promote other accounts (never their own)
create or replace function public.set_member(target uuid, new_status text, new_role text) returns void
  language plpgsql security definer set search_path = public
  as $$
begin
  if not public.is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'cannot change your own account' using errcode = '42501'; end if;
  update public.app_members
     set status = new_status, role = new_role, decided_by = public.current_email(), decided_at = now()
   where user_id = target;
end $$;

-- ── commands ──────────────────────────────────────────────────────────────────

create table if not exists public.commands (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  kind        text not null check (kind in ('shell', 'sql', 'note')),
  category    text not null default 'Chung' check (char_length(category) between 1 and 60),
  tags        text[] not null default '{}',
  description text not null default '' check (char_length(description) <= 4000),
  body        text not null check (char_length(body) between 1 and 20000),
  uses        integer not null default 0,
  owner_id    uuid default auth.uid(),
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 'note' (links, test accounts…) was added later: widen the check on existing databases
alter table public.commands drop constraint if exists commands_kind_check;
alter table public.commands add constraint commands_kind_check check (kind in ('shell', 'sql', 'note'));

-- private commands: only the owner can see them — not other members, not app admins
alter table public.commands add column if not exists is_private boolean not null default false;

create index if not exists commands_category_idx on public.commands (category);
create index if not exists commands_uses_idx on public.commands (uses desc);

create table if not exists public.command_history (
  id          bigserial primary key,
  command_id  uuid not null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  data        jsonb not null,
  changed_by  text,
  changed_at  timestamptz not null default now()
);

create index if not exists command_history_cmd_idx on public.command_history (command_id, changed_at desc);

-- stamp owner / author / time (clients cannot spoof them) and keep a history row for every change
create or replace function public.commands_audit() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.created_by := public.current_email();
    new.updated_by := new.created_by;
    new.created_at := now();
    new.updated_at := now();
    new.uses := 0;
    insert into public.command_history (command_id, action, data, changed_by) values (new.id, 'insert', to_jsonb(new), new.created_by);
    return new;
  elsif tg_op = 'UPDATE' then
    -- a usage bump is not an edit
    if (to_jsonb(new) - 'uses' - 'updated_at') = (to_jsonb(old) - 'uses' - 'updated_at') then
      return new;
    end if;
    new.owner_id := old.owner_id;
    -- an admin editing someone else's command must not be able to hide it from its owner's team
    if new.is_private and not old.is_private and new.owner_id is distinct from auth.uid() then
      raise exception 'only the owner can make a command private' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := public.current_email();
    new.updated_at := now();
    insert into public.command_history (command_id, action, data, changed_by) values (old.id, 'update', to_jsonb(old), new.updated_by);
    return new;
  else
    insert into public.command_history (command_id, action, data, changed_by) values (old.id, 'delete', to_jsonb(old), public.current_email());
    return old;
  end if;
end $$;

drop trigger if exists commands_audit_ins on public.commands;
drop trigger if exists commands_audit_upd on public.commands;
drop trigger if exists commands_audit_del on public.commands;
create trigger commands_audit_ins before insert on public.commands for each row execute function public.commands_audit();
create trigger commands_audit_upd before update on public.commands for each row execute function public.commands_audit();
create trigger commands_audit_del after delete on public.commands for each row execute function public.commands_audit();

-- members count a use (copy) without needing write access to the row
create or replace function public.bump_command_use(cid uuid) returns void
  language sql security definer set search_path = public
  as $$ update public.commands set uses = uses + 1
         where id = cid and public.is_member() and (not is_private or owner_id = auth.uid()) $$;

-- history follows the command's visibility (also for versions saved before it became private)
create or replace function public.history_visible(cid uuid, d jsonb) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select case
      when exists (select 1 from public.commands where id = cid)
        then exists (select 1 from public.commands where id = cid and (not is_private or owner_id = auth.uid()))
      else coalesce((d ->> 'is_private')::boolean, false) = false or (d ->> 'owner_id')::uuid = auth.uid()
    end
  $$;

-- ── row level security ────────────────────────────────────────────────────────

alter table public.app_members enable row level security;
alter table public.commands enable row level security;
alter table public.command_history enable row level security;

drop policy if exists members_read on public.app_members;
create policy members_read on public.app_members for select to authenticated using (user_id = auth.uid() or public.is_app_admin());
-- (no write policies: rows are created by the trigger and changed through set_member only)

drop policy if exists commands_read on public.commands;
drop policy if exists commands_insert on public.commands;
drop policy if exists commands_update on public.commands;
drop policy if exists commands_delete on public.commands;
create policy commands_read   on public.commands for select to authenticated
  using (public.is_member() and (not is_private or owner_id = auth.uid()));
create policy commands_insert on public.commands for insert to authenticated with check (public.is_member());
-- owners edit their own; admins edit everyone's shared commands, never someone's private ones
create policy commands_update on public.commands for update to authenticated
  using (public.is_member() and (owner_id = auth.uid() or (public.is_app_admin() and not is_private)))
  with check (public.is_member() and (owner_id = auth.uid() or (public.is_app_admin() and not is_private)));
create policy commands_delete on public.commands for delete to authenticated
  using (public.is_member() and (owner_id = auth.uid() or (public.is_app_admin() and not is_private)));

drop policy if exists history_read on public.command_history;
create policy history_read on public.command_history for select to authenticated
  using (public.is_member() and public.history_visible(command_id, data));

-- nothing for anonymous visitors
revoke all on public.app_members, public.commands, public.command_history from anon;
revoke execute on function public.bump_command_use(uuid), public.set_member(uuid, text, text), public.request_access() from anon, public;
grant select on public.app_members, public.command_history to authenticated;
grant select, insert, update, delete on public.commands to authenticated;
revoke execute on function public.history_visible(uuid, jsonb) from anon, public;
grant execute on function public.history_visible(uuid, jsonb) to authenticated;
grant execute on function public.bump_command_use(uuid), public.set_member(uuid, text, text), public.request_access(), public.is_member(), public.is_app_admin() to authenticated;

-- ── shared accounts (login + password + OTP) ──────────────────────────────────
-- One row per account of some system: link, username, note, and optionally a password and a
-- TOTP secret. Any member can add one; its owner (and admins, unless it is private) manage it.
-- Shared with the whole team, selected members, or nobody else (private: owner only, admins
-- included). Password and secret live in a table nobody can read through the API — not
-- members, not app admins. Members get them through functions that check access and log
-- every request: acct_password() returns the password, acct_code() computes the current OTP
-- in the database so the TOTP secret never reaches a browser after it has been added.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.team_accounts (
  id            uuid primary key default gen_random_uuid(),
  system        text not null default '' check (char_length(system) <= 100),
  username      text not null check (char_length(username) between 1 and 200),
  url           text not null default '' check (char_length(url) <= 500),
  note          text not null default '' check (char_length(note) <= 2000),
  password      text check (char_length(password) <= 500),
  otp_secret    text,
  otp_algorithm text not null default 'SHA1' check (otp_algorithm in ('SHA1', 'SHA256', 'SHA512')),
  otp_digits    integer not null default 6 check (otp_digits in (6, 7, 8)),
  otp_period    integer not null default 30 check (otp_period between 10 and 300),
  everyone      boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- who may use an account when everyone = false
create table if not exists public.team_account_access (
  account_id uuid not null references public.team_accounts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  primary key (account_id, user_id)
);

create table if not exists public.team_account_log (
  id         bigserial primary key,
  account_id uuid,
  account    text not null,
  action     text not null check (action in ('code', 'copy', 'password', 'create', 'update', 'delete')),
  user_email text,
  at         timestamptz not null default now()
);
create index if not exists team_account_log_at_idx on public.team_account_log (at desc);

-- added later: who owns an account (members can add their own) and owner-only accounts
alter table public.team_accounts add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.team_accounts add column if not exists is_private boolean not null default false;
update public.team_accounts a set owner_id = m.user_id
  from public.app_members m where a.owner_id is null and m.email = a.created_by;
-- added later: environment within a system (Dev, UAT, Prod…), and logging copied OTP codes
alter table public.team_accounts add column if not exists env text not null default '' check (char_length(env) <= 40);
alter table public.team_account_log drop constraint if exists team_account_log_action_check;
alter table public.team_account_log add constraint team_account_log_action_check
  check (action in ('code', 'copy', 'password', 'create', 'update', 'delete'));
create index if not exists team_account_log_recent_idx on public.team_account_log (account_id, user_email, action, at desc);

alter table public.team_accounts enable row level security;
alter table public.team_account_access enable row level security;
alter table public.team_account_log enable row level security;
-- no policies at all: every read and write goes through the functions below
revoke all on public.team_accounts, public.team_account_access, public.team_account_log from anon, authenticated;

create or replace function public.base32_decode(s text) returns bytea
  language plpgsql immutable
  as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  clean text := upper(regexp_replace(s, '[\s=-]', '', 'g'));
  buf bigint := 0;
  bits int := 0;
  idx int;
  out bytea := ''::bytea;
begin
  if clean = '' then raise exception 'invalid base32 secret'; end if;
  for i in 1 .. length(clean) loop
    idx := strpos(alphabet, substr(clean, i, 1)) - 1;
    if idx < 0 then raise exception 'invalid base32 secret'; end if;
    buf := (buf << 5) | idx;
    bits := bits + 5;
    if bits >= 8 then
      bits := bits - 8;
      out := out || set_byte('\x00'::bytea, 0, ((buf >> bits) & 255)::int);
      buf := buf & ((1::bigint << bits) - 1);
    end if;
  end loop;
  return out;
end $$;

-- RFC 6238 time-based one-time password
create or replace function public.totp(secret text, alg text, digits int, period int, at timestamptz) returns text
  language plpgsql stable
  as $$
declare
  counter bigint := floor(extract(epoch from at) / period)::bigint;
  msg bytea := '\x0000000000000000'::bytea;
  h bytea;
  off int;
  bin bigint;
begin
  for i in 0 .. 7 loop
    msg := set_byte(msg, 7 - i, ((counter >> (8 * i)) & 255)::int);
  end loop;
  h := extensions.hmac(msg, public.base32_decode(secret), lower(alg));
  off := get_byte(h, length(h) - 1) & 15;
  bin := ((get_byte(h, off) & 127)::bigint << 24) | (get_byte(h, off + 1)::bigint << 16)
       | (get_byte(h, off + 2)::bigint << 8) | get_byte(h, off + 3);
  return lpad((bin % power(10, digits)::bigint)::text, digits, '0');
end $$;

-- private: owner only. Otherwise the owner, admins, and the team or the selected members.
create or replace function public.can_use_account(aid uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select public.is_member() and exists (
      select 1 from public.team_accounts a
       where a.id = aid
         and (a.owner_id = auth.uid()
              or (not a.is_private and (public.is_app_admin() or a.everyone
                  or exists (select 1 from public.team_account_access x where x.account_id = a.id and x.user_id = auth.uid())))))
  $$;

-- edit / delete / see who has access: the owner, or an admin for anything not private
create or replace function public.can_manage_account(aid uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select public.is_member() and exists (
      select 1 from public.team_accounts a
       where a.id = aid and (a.owner_id = auth.uid() or (public.is_app_admin() and not a.is_private)))
  $$;

create or replace function public.account_name(a public.team_accounts) returns text
  language sql immutable
  as $$ select concat_ws(' · ', nullif(a.system, ''), nullif(a.env, ''), a.username) $$;

-- approved members, so anyone sharing an account can pick who gets it
create or replace function public.member_directory()
  returns table (user_id uuid, email text, full_name text, avatar_url text)
  language sql stable security definer set search_path = public
  as $$
    select m.user_id, m.email, m.full_name, m.avatar_url from public.app_members m
     where public.is_member() and m.status = 'approved'
     order by lower(coalesce(m.full_name, m.email))
  $$;

-- accounts this user may use: everything except the password and the OTP secret
drop function if exists public.acct_list();
create or replace function public.acct_list()
  returns table (id uuid, system text, env text, username text, url text, note text, has_password boolean, has_otp boolean,
                 otp_digits int, otp_period int, everyone boolean, is_private boolean, owner_id uuid, can_manage boolean,
                 created_by text, updated_at timestamptz)
  language sql stable security definer set search_path = public
  as $$
    select a.id, a.system, a.env, a.username, a.url, a.note, a.password is not null, a.otp_secret is not null,
           a.otp_digits, a.otp_period, a.everyone, a.is_private, a.owner_id, public.can_manage_account(a.id),
           a.created_by, a.updated_at
      from public.team_accounts a
     where public.can_use_account(a.id)
     order by lower(a.system), lower(a.env), lower(a.username)
  $$;

-- the password; logged
create or replace function public.acct_password(aid uuid) returns text
  language plpgsql security definer set search_path = public
  as $$
declare a public.team_accounts;
begin
  if not public.can_use_account(aid) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into a from public.team_accounts where id = aid;
  if a.password is null then raise exception 'no password stored'; end if;
  insert into public.team_account_log (account_id, account, action, user_email) values (a.id, public.account_name(a), 'password', public.current_email());
  return a.password;
end $$;

-- the current OTP (and the next one, so a code about to expire is not a problem); logged
create or replace function public.acct_code(aid uuid)
  returns table (code text, next_code text, remaining int, period int)
  language plpgsql security definer set search_path = public
  as $$
declare
  a public.team_accounts;
  now_ts timestamptz := clock_timestamp();
begin
  if not public.can_use_account(aid) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into a from public.team_accounts where team_accounts.id = aid;
  if a.otp_secret is null then raise exception 'no otp stored'; end if;
  insert into public.team_account_log (account_id, account, action, user_email) values (a.id, public.account_name(a), 'code', public.current_email());
  return query select
    public.totp(a.otp_secret, a.otp_algorithm, a.otp_digits, a.otp_period, now_ts),
    public.totp(a.otp_secret, a.otp_algorithm, a.otp_digits, a.otp_period, now_ts + make_interval(secs => a.otp_period)),
    (a.otp_period - (floor(extract(epoch from now_ts))::bigint % a.otp_period))::int,
    a.otp_period;
end $$;

-- current and next OTP of several accounts at once, for codes shown without a click. Seeing a
-- code is logged at most once an hour per person and account; copying one is always logged.
create or replace function public.acct_codes(ids uuid[])
  returns table (id uuid, code text, next_code text, remaining int, period int)
  language plpgsql security definer set search_path = public
  as $$
declare
  a public.team_accounts;
  now_ts timestamptz := clock_timestamp();
  me text := public.current_email();
begin
  if not public.is_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  for a in select * from public.team_accounts t where t.id = any(ids[1:200]) and t.otp_secret is not null loop
    continue when not public.can_use_account(a.id);
    if not exists (select 1 from public.team_account_log l
                    where l.account_id = a.id and l.user_email = me and l.action = 'code' and l.at > now_ts - interval '1 hour') then
      insert into public.team_account_log (account_id, account, action, user_email) values (a.id, public.account_name(a), 'code', me);
    end if;
    id := a.id;
    code := public.totp(a.otp_secret, a.otp_algorithm, a.otp_digits, a.otp_period, now_ts);
    next_code := public.totp(a.otp_secret, a.otp_algorithm, a.otp_digits, a.otp_period, now_ts + make_interval(secs => a.otp_period));
    remaining := (a.otp_period - (floor(extract(epoch from now_ts))::bigint % a.otp_period))::int;
    period := a.otp_period;
    return next;
  end loop;
end $$;

-- a member copied an OTP code
create or replace function public.acct_copied(aid uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
declare a public.team_accounts;
begin
  if not public.can_use_account(aid) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into a from public.team_accounts where id = aid;
  insert into public.team_account_log (account_id, account, action, user_email) values (a.id, public.account_name(a), 'copy', public.current_email());
end $$;

-- add (any member) or edit (owner / admin). p_password / p_otp_secret: null keeps the stored
-- value, '' removes it. Only the owner can make an account private.
drop function if exists public.acct_save(uuid, text, text, text, text, text, text, text, int, int, boolean, uuid[]);
drop function if exists public.acct_save(uuid, text, text, text, text, text, text, text, int, int, boolean, uuid[], boolean);
create or replace function public.acct_save(
  aid uuid, p_system text, p_env text, p_username text, p_url text, p_note text, p_password text,
  p_otp_secret text, p_otp_algorithm text, p_otp_digits int, p_otp_period int,
  p_everyone boolean, p_members uuid[], p_private boolean
) returns uuid
  language plpgsql security definer set search_path = public
  as $$
declare
  rid uuid := aid;
  sec text := case when p_otp_secret is null then null else upper(regexp_replace(p_otp_secret, '[\s=-]', '', 'g')) end;
  priv boolean := coalesce(p_private, false);
  a public.team_accounts;
begin
  if not public.is_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  if sec <> '' then perform public.base32_decode(sec); end if; -- validates
  if rid is null then
    insert into public.team_accounts (system, env, username, url, note, password, otp_secret, otp_algorithm, otp_digits, otp_period,
                                      everyone, is_private, owner_id, created_by)
      values (coalesce(p_system, ''), coalesce(p_env, ''), p_username, coalesce(p_url, ''), coalesce(p_note, ''), nullif(p_password, ''), nullif(sec, ''),
              coalesce(p_otp_algorithm, 'SHA1'), coalesce(p_otp_digits, 6), coalesce(p_otp_period, 30),
              coalesce(p_everyone, true) and not priv, priv, auth.uid(), public.current_email())
      returning * into a;
    rid := a.id;
  else
    if not public.can_manage_account(rid) then raise exception 'not allowed' using errcode = '42501'; end if;
    select * into a from public.team_accounts where id = rid;
    if priv and not a.is_private and a.owner_id is distinct from auth.uid() then
      raise exception 'only the owner can make an account private' using errcode = '42501';
    end if;
    update public.team_accounts set
      system = coalesce(p_system, ''), env = coalesce(p_env, ''), username = p_username, url = coalesce(p_url, ''), note = coalesce(p_note, ''),
      password = case when p_password is null then password else nullif(p_password, '') end,
      otp_secret = case when sec is null then otp_secret else nullif(sec, '') end,
      otp_algorithm = coalesce(p_otp_algorithm, otp_algorithm), otp_digits = coalesce(p_otp_digits, otp_digits),
      otp_period = coalesce(p_otp_period, otp_period),
      everyone = coalesce(p_everyone, everyone) and not priv, is_private = priv, updated_at = now()
    where id = rid
    returning * into a;
  end if;
  delete from public.team_account_access where account_id = rid;
  if not a.everyone and not a.is_private and p_members is not null then
    insert into public.team_account_access (account_id, user_id) select rid, unnest(p_members) on conflict do nothing;
  end if;
  insert into public.team_account_log (account_id, account, action, user_email)
    values (rid, public.account_name(a), case when aid is null then 'create' else 'update' end, public.current_email());
  return rid;
end $$;

create or replace function public.acct_delete(aid uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
declare a public.team_accounts;
begin
  if not public.can_manage_account(aid) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.team_accounts where id = aid returning * into a;
  if found then
    insert into public.team_account_log (account_id, account, action, user_email) values (aid, public.account_name(a), 'delete', public.current_email());
  end if;
end $$;

-- who has access to an account (when shared with selected members)
create or replace function public.acct_members(aid uuid) returns setof uuid
  language plpgsql stable security definer set search_path = public
  as $$
begin
  if not public.can_manage_account(aid) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query select user_id from public.team_account_access where account_id = aid;
end $$;

-- recent activity: admins see everything except private accounts; others see the accounts they own
create or replace function public.acct_activity(max_rows int default 200)
  returns table (id bigint, account_id uuid, account text, action text, user_email text, at timestamptz)
  language plpgsql stable security definer set search_path = public
  as $$
begin
  if not public.is_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.id, l.account_id, l.account, l.action, l.user_email, l.at
      from public.team_account_log l
      left join public.team_accounts a on a.id = l.account_id
     where (a.id is not null and (a.owner_id = auth.uid() or (public.is_app_admin() and not a.is_private)))
        or (a.id is null and public.is_app_admin())
     order by l.at desc
     limit least(max_rows, 1000);
end $$;

revoke execute on function public.acct_list(), public.acct_password(uuid), public.acct_code(uuid),
  public.acct_save(uuid, text, text, text, text, text, text, text, text, int, int, boolean, uuid[], boolean),
  public.acct_codes(uuid[]), public.acct_copied(uuid),
  public.acct_delete(uuid), public.acct_members(uuid), public.acct_activity(int), public.member_directory(),
  public.can_use_account(uuid), public.can_manage_account(uuid),
  public.totp(text, text, int, int, timestamptz), public.base32_decode(text) from anon, public;
grant execute on function public.acct_list(), public.acct_password(uuid), public.acct_code(uuid),
  public.acct_save(uuid, text, text, text, text, text, text, text, text, int, int, boolean, uuid[], boolean),
  public.acct_codes(uuid[]), public.acct_copied(uuid),
  public.acct_delete(uuid), public.acct_members(uuid), public.acct_activity(int), public.member_directory() to authenticated;

-- ── overtime log ──────────────────────────────────────────────────────────────
--   * ot_people is the team's OT roster, separate from sign-in accounts: anyone can be listed, even
--     without an account, under the name the team uses (not the Google profile name).
--   * A person whose email matches a signed-in member is theirs: they log and rename their own row.
--     Admins manage the whole roster and log OT for anyone, including people without an account.
--   * One OT row per person per day: hours + what they did. Every approved member sees the whole team.
--   * ot_days holds a shared title per day ("LIVE gencode", "Dựng RL"…), shown above the column in the export.

create table if not exists public.ot_people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  full_name  text not null default '' check (char_length(full_name) <= 120),
  email      text check (email is null or email = lower(btrim(email))),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ot_people_email_key on public.ot_people (email) where email is not null;

create table if not exists public.ot_entries (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid references public.ot_people (id) on delete restrict,
  work_date  date not null,
  hours      numeric(4, 2) not null check (hours > 0 and hours <= 24),
  note       text not null default '' check (char_length(note) <= 2000),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- earlier versions keyed OT by sign-in account: move those rows onto roster people
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ot_entries' and column_name = 'user_id') then
    insert into public.ot_people (name, full_name, email)
      select distinct on (m.email) coalesce(substring(btrim(m.full_name) from '(\S+)$'), split_part(m.email, '@', 1)), coalesce(m.full_name, ''), m.email
        from public.ot_entries e join public.app_members m on m.user_id = e.user_id
      on conflict do nothing;
    alter table public.ot_entries add column if not exists person_id uuid references public.ot_people (id) on delete restrict;
    update public.ot_entries e set person_id = p.id
      from public.app_members m join public.ot_people p on p.email = m.email
     where m.user_id = e.user_id and e.person_id is null;
    alter table public.ot_entries drop column user_id;
  end if;
end $$;
alter table public.ot_entries alter column person_id set not null;
alter table public.ot_entries drop constraint if exists ot_entries_person_day_key;
alter table public.ot_entries add constraint ot_entries_person_day_key unique (person_id, work_date);
create index if not exists ot_entries_date_idx on public.ot_entries (work_date);

create table if not exists public.ot_days (
  work_date  date primary key,
  label      text not null check (char_length(label) between 1 and 80),
  updated_by text,
  updated_at timestamptz not null default now()
);

create or replace function public.ot_touch() returns trigger
  language plpgsql
  as $$
begin
  new.updated_by := public.current_email();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ot_entries_touch on public.ot_entries;
create trigger ot_entries_touch before insert or update on public.ot_entries for each row execute function public.ot_touch();
drop trigger if exists ot_days_touch on public.ot_days;
create trigger ot_days_touch before insert or update on public.ot_days for each row execute function public.ot_touch();

-- the roster row belongs to the signed-in member with the same email
create or replace function public.ot_is_mine(pid uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.ot_people where id = pid and email = public.current_email()) $$;

alter table public.ot_people enable row level security;
alter table public.ot_entries enable row level security;
alter table public.ot_days enable row level security;

drop policy if exists ot_people_read on public.ot_people;
drop policy if exists ot_people_insert on public.ot_people;
drop policy if exists ot_people_update on public.ot_people;
drop policy if exists ot_people_delete on public.ot_people;
create policy ot_people_read   on public.ot_people for select to authenticated using (public.is_member());
-- members may add / rename only themselves (and cannot point their row at another email)
create policy ot_people_insert on public.ot_people for insert to authenticated
  with check (public.is_app_admin() or (public.is_member() and email = public.current_email()));
create policy ot_people_update on public.ot_people for update to authenticated
  using (public.is_app_admin() or (public.is_member() and email = public.current_email()))
  with check (public.is_app_admin() or (public.is_member() and email = public.current_email()));
create policy ot_people_delete on public.ot_people for delete to authenticated using (public.is_app_admin());

drop policy if exists ot_read on public.ot_entries;
drop policy if exists ot_insert on public.ot_entries;
drop policy if exists ot_update on public.ot_entries;
drop policy if exists ot_delete on public.ot_entries;
create policy ot_read   on public.ot_entries for select to authenticated using (public.is_member());
create policy ot_insert on public.ot_entries for insert to authenticated
  with check (public.is_member() and (public.is_app_admin() or public.ot_is_mine(person_id)));
create policy ot_update on public.ot_entries for update to authenticated
  using (public.is_member() and (public.is_app_admin() or public.ot_is_mine(person_id)))
  with check (public.is_member() and (public.is_app_admin() or public.ot_is_mine(person_id)));
create policy ot_delete on public.ot_entries for delete to authenticated
  using (public.is_member() and (public.is_app_admin() or public.ot_is_mine(person_id)));

drop policy if exists ot_days_read on public.ot_days;
drop policy if exists ot_days_write on public.ot_days;
create policy ot_days_read  on public.ot_days for select to authenticated using (public.is_member());
create policy ot_days_write on public.ot_days for all to authenticated using (public.is_member()) with check (public.is_member());

revoke all on public.ot_people, public.ot_entries, public.ot_days from anon;
revoke execute on function public.ot_is_mine(uuid) from anon, public;
grant execute on function public.ot_is_mine(uuid) to authenticated;
grant select, insert, update, delete on public.ot_people, public.ot_entries, public.ot_days to authenticated;
