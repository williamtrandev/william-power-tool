-- William Tool · accounts + shared command library
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Access model
--   * People sign in with Google. Anyone can sign up, but a new account is "pending" and cannot use the app
--     until an admin approves it (in the app: tab "Thành viên").
--   * Approved members read every command and may add their own; they can only
--     edit / delete commands they created. Admins can edit everything.
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
  kind        text not null check (kind in ('shell', 'sql')),
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
  as $$ update public.commands set uses = uses + 1 where id = cid and public.is_member() $$;

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
create policy commands_read   on public.commands for select to authenticated using (public.is_member());
create policy commands_insert on public.commands for insert to authenticated with check (public.is_member());
create policy commands_update on public.commands for update to authenticated
  using (public.is_app_admin() or (public.is_member() and owner_id = auth.uid()))
  with check (public.is_app_admin() or (public.is_member() and owner_id = auth.uid()));
create policy commands_delete on public.commands for delete to authenticated
  using (public.is_app_admin() or (public.is_member() and owner_id = auth.uid()));

drop policy if exists history_read on public.command_history;
create policy history_read on public.command_history for select to authenticated using (public.is_member());

-- nothing for anonymous visitors
revoke all on public.app_members, public.commands, public.command_history from anon;
revoke execute on function public.bump_command_use(uuid), public.set_member(uuid, text, text), public.request_access() from anon, public;
grant select on public.app_members, public.command_history to authenticated;
grant select, insert, update, delete on public.commands to authenticated;
grant execute on function public.bump_command_use(uuid), public.set_member(uuid, text, text), public.request_access(), public.is_member(), public.is_app_admin() to authenticated;
