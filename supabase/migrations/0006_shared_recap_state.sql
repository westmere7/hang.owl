-- 0006: Move shared recap state out of localStorage into the database, so the
-- whole group sees the same thing (previously per-device, which meant one
-- person's checkmarks silently drove the shared hangout status).

-- Who physically holds everyone's deposits. Null = the admin (the default).
alter table public.hangouts
  add column if not exists deposit_holder_id uuid
    references public.hangout_members (id) on delete set null;

-- Which payback transfers have been marked paid. Keyed by the (from, to)
-- member pair — NOT the amount — so a mark survives when amounts recompute
-- after a new spend is added.
create table if not exists public.settlement_marks (
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  from_member_id uuid not null references public.hangout_members (id) on delete cascade,
  to_member_id uuid not null references public.hangout_members (id) on delete cascade,
  marked_at timestamptz not null default now(),
  primary key (hangout_id, from_member_id, to_member_id)
);
create index if not exists settlement_marks_hangout_idx on public.settlement_marks (hangout_id);

alter table public.settlement_marks enable row level security;

-- Any member can view and toggle marks (settling up is collaborative).
create policy "marks read" on public.settlement_marks
  for select to authenticated using (is_hangout_member(hangout_id));
create policy "marks write" on public.settlement_marks
  for insert to authenticated with check (is_hangout_member(hangout_id));
create policy "marks delete" on public.settlement_marks
  for delete to authenticated using (is_hangout_member(hangout_id));

-- Setting the deposit holder mirrors the deposit/override permission: the
-- admin, or any member when the hangout lets guests edit the recap.
create or replace function public.set_deposit_holder(p_hangout uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    is_hangout_admin(p_hangout)
    or (
      is_hangout_member(p_hangout)
      and exists (select 1 from hangouts h where h.id = p_hangout and h.guest_can_edit_recap)
    )
  ) then
    raise exception 'not allowed to set the deposit holder';
  end if;

  if p_member is not null and not exists (
    select 1 from hangout_members m where m.id = p_member and m.hangout_id = p_hangout
  ) then
    raise exception 'member does not belong to this hangout';
  end if;

  update hangouts set deposit_holder_id = p_member where id = p_hangout;
end;
$$;

grant execute on function public.set_deposit_holder(uuid, uuid) to authenticated;
