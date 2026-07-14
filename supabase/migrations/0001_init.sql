-- HangOwl schema. Run this in the Supabase SQL editor (or `supabase db push`).
-- Requires: Auth -> Anonymous sign-ins ENABLED in the Supabase dashboard.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------ global bookmarks
create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  url text,
  title text not null,
  description text,
  image_url text,
  category text not null default 'visit'
    check (category in ('visit', 'eat', 'drink', 'do')),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- hangouts
create table public.hangouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  starts_on date,
  ends_on date,
  expected_guests int not null default 4 check (expected_guests between 1 and 99),
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'ended')),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  guest_can_add_spend boolean not null default true,
  guest_can_edit_spend boolean not null default true,
  guest_can_add_bookmark boolean not null default true,
  guest_can_edit_recap boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.hangout_members (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  deposit numeric not null default 0 check (deposit >= 0),
  share_override numeric check (share_override >= 0),
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (hangout_id, profile_id)
);

create table public.hangout_bookmarks (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  category text not null default 'visit'
    check (category in ('visit', 'eat', 'drink', 'do')),
  url text,
  title text not null,
  description text,
  image_url text,
  notes text,
  done boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.spends (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  spender_member_id uuid not null references public.hangout_members (id) on delete cascade,
  title text not null,
  category text not null default 'misc'
    check (category in ('accommodation', 'eat_drink', 'transport', 'activity', 'misc')),
  amount numeric not null check (amount >= 0),
  spent_at timestamptz not null default now(),
  note text,
  bill_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.spend_shares (
  spend_id uuid not null references public.spends (id) on delete cascade,
  member_id uuid not null references public.hangout_members (id) on delete cascade,
  weight numeric not null default 1 check (weight >= 0),
  primary key (spend_id, member_id)
);

create index hangout_members_profile_idx on public.hangout_members (profile_id);
create index hangout_members_hangout_idx on public.hangout_members (hangout_id);
create index hangout_bookmarks_hangout_idx on public.hangout_bookmarks (hangout_id);
create index spends_hangout_idx on public.spends (hangout_id);

-- ------------------------------------------------------------ RLS helpers
create or replace function public.is_hangout_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from hangout_members m
    where m.hangout_id = h and m.profile_id = auth.uid()
  );
$$;

create or replace function public.is_hangout_admin(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from hangouts x
    where x.id = h and x.admin_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------ RLS policies
alter table public.profiles enable row level security;
alter table public.bookmarks enable row level security;
alter table public.hangouts enable row level security;
alter table public.hangout_members enable row level security;
alter table public.hangout_bookmarks enable row level security;
alter table public.spends enable row level security;
alter table public.spend_shares enable row level security;

-- profiles: everyone signed-in can read names; you manage only your own row.
create policy "profiles read" on public.profiles
  for select to authenticated using (true);
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- Global bookmarks: shared team list — any signed-in user has full access.
create policy "bookmarks all" on public.bookmarks
  for all to authenticated using (true) with check (true);

-- Hangouts: readable by any signed-in user (required for the QR join flow,
-- codes are unguessable). Only the admin can change or delete them.
create policy "hangouts read" on public.hangouts
  for select to authenticated using (true);
create policy "hangouts insert" on public.hangouts
  for insert to authenticated with check (admin_id = auth.uid());
create policy "hangouts update" on public.hangouts
  for update to authenticated using (admin_id = auth.uid());
create policy "hangouts delete" on public.hangouts
  for delete to authenticated using (admin_id = auth.uid());

-- Members: readable by all signed-in (join page shows who's in). You join
-- yourself; deposits/overrides editable by the admin, or by anyone when the
-- hangout allows guests to edit the recap.
create policy "members read" on public.hangout_members
  for select to authenticated using (true);
create policy "members join self" on public.hangout_members
  for insert to authenticated with check (profile_id = auth.uid());
create policy "members update" on public.hangout_members
  for update to authenticated using (
    is_hangout_admin(hangout_id)
    or (
      is_hangout_member(hangout_id)
      and exists (select 1 from hangouts h where h.id = hangout_id and h.guest_can_edit_recap)
    )
  );
create policy "members delete" on public.hangout_members
  for delete to authenticated using (
    profile_id = auth.uid() or is_hangout_admin(hangout_id)
  );

-- Hangout bookmarks: members only; adding/editing gated by the guest flag.
create policy "hbookmarks read" on public.hangout_bookmarks
  for select to authenticated using (is_hangout_member(hangout_id));
create policy "hbookmarks write" on public.hangout_bookmarks
  for insert to authenticated with check (
    is_hangout_admin(hangout_id)
    or (
      is_hangout_member(hangout_id)
      and exists (select 1 from hangouts h where h.id = hangout_id and h.guest_can_add_bookmark)
    )
  );
create policy "hbookmarks update" on public.hangout_bookmarks
  for update to authenticated using (
    is_hangout_admin(hangout_id)
    or (
      is_hangout_member(hangout_id)
      and exists (select 1 from hangouts h where h.id = hangout_id and h.guest_can_add_bookmark)
    )
  );
create policy "hbookmarks delete" on public.hangout_bookmarks
  for delete to authenticated using (
    is_hangout_admin(hangout_id)
    or (
      is_hangout_member(hangout_id)
      and exists (select 1 from hangouts h where h.id = hangout_id and h.guest_can_add_bookmark)
    )
  );

-- Spends: members can read; adding gated by guest_can_add_spend; editing
-- others' entries gated by guest_can_edit_spend (own entries always OK).
create policy "spends read" on public.spends
  for select to authenticated using (is_hangout_member(hangout_id));
create policy "spends insert" on public.spends
  for insert to authenticated with check (
    is_hangout_admin(hangout_id)
    or (
      is_hangout_member(hangout_id)
      and exists (select 1 from hangouts h where h.id = hangout_id and h.guest_can_add_spend)
    )
  );
create policy "spends update" on public.spends
  for update to authenticated using (
    is_hangout_admin(hangout_id)
    or created_by = auth.uid()
    or (
      is_hangout_member(hangout_id)
      and exists (select 1 from hangouts h where h.id = hangout_id and h.guest_can_edit_spend)
    )
  );
create policy "spends delete" on public.spends
  for delete to authenticated using (
    is_hangout_admin(hangout_id)
    or created_by = auth.uid()
    or (
      is_hangout_member(hangout_id)
      and exists (select 1 from hangouts h where h.id = hangout_id and h.guest_can_edit_spend)
    )
  );

-- Spend shares follow their spend's hangout membership.
create policy "shares read" on public.spend_shares
  for select to authenticated using (
    exists (select 1 from spends s where s.id = spend_id and is_hangout_member(s.hangout_id))
  );
create policy "shares write" on public.spend_shares
  for insert to authenticated with check (
    exists (select 1 from spends s where s.id = spend_id and is_hangout_member(s.hangout_id))
  );
create policy "shares delete" on public.spend_shares
  for delete to authenticated using (
    exists (select 1 from spends s where s.id = spend_id and is_hangout_member(s.hangout_id))
  );

-- ------------------------------------------------------------- storage
-- Public bucket for bill photos (paths are unguessable UUIDs).
insert into storage.buckets (id, name, public)
values ('bills', 'bills', true)
on conflict (id) do nothing;

create policy "bills upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'bills');
create policy "bills read" on storage.objects
  for select using (bucket_id = 'bills');
create policy "bills delete" on storage.objects
  for delete to authenticated using (bucket_id = 'bills');
