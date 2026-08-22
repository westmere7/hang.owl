-- 0007: Per-hangout activity log. Every change is recorded by database
-- triggers (not the client), so nothing is missed and entries can't be forged.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  actor_id uuid,               -- auth.uid() at the time of the action
  actor_name text not null,    -- their display name, denormalised
  action text not null,        -- machine code, e.g. 'spend.add'
  summary text not null,       -- human-readable line
  created_at timestamptz not null default now()
);
create index if not exists activity_log_hangout_idx
  on public.activity_log (hangout_id, created_at desc);

alter table public.activity_log enable row level security;

-- Members can read their hangout's log. No insert policy: only the
-- security-definer trigger below writes rows, so entries can't be spoofed.
create policy "log read" on public.activity_log
  for select to authenticated using (is_hangout_member(hangout_id));

-- Best display name for the acting user within a hangout.
create or replace function public.actor_name(p_hangout uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select m.display_name from hangout_members m
            where m.hangout_id = p_hangout and m.profile_id = auth.uid() limit 1), ''),
    nullif((select p.display_name from profiles p where p.id = auth.uid()), ''),
    'Someone'
  );
$$;

-- Formats a numeric amount with thousands separators, no trailing zeros.
create or replace function public.fmt_amt(n numeric)
returns text language sql immutable as $$
  select trim(to_char(n, 'FM999G999G999G999G990D99'));
$$;

create or replace function public.log_activity()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  h uuid;
  act text := '';
  summ text := '';
begin
  if TG_TABLE_NAME = 'spends' then
    h := coalesce(NEW.hangout_id, OLD.hangout_id);
    if TG_OP = 'INSERT' then
      act := 'spend.add';
      summ := 'added spend "' || NEW.title || '" (' || fmt_amt(NEW.amount) || ')';
    elsif TG_OP = 'UPDATE' then
      act := 'spend.edit'; summ := 'edited spend "' || NEW.title || '"';
    else
      act := 'spend.delete'; summ := 'deleted spend "' || OLD.title || '"';
    end if;

  elsif TG_TABLE_NAME = 'hangout_members' then
    h := coalesce(NEW.hangout_id, OLD.hangout_id);
    if TG_OP = 'INSERT' then
      act := 'member.add';
      summ := (case when NEW.profile_id is null then 'added guest "' else 'joined as "' end)
              || NEW.display_name || '"';
    elsif TG_OP = 'UPDATE' then
      if OLD.profile_id is null and NEW.profile_id is not null then
        act := 'member.claim'; summ := 'claimed the seat "' || NEW.display_name || '"';
      elsif OLD.display_name is distinct from NEW.display_name then
        act := 'member.rename';
        summ := 'renamed "' || OLD.display_name || '" to "' || NEW.display_name || '"';
      elsif OLD.deposit is distinct from NEW.deposit then
        act := 'member.deposit';
        summ := 'set ' || NEW.display_name || '''s deposit to ' || fmt_amt(NEW.deposit);
      elsif OLD.share_override is distinct from NEW.share_override then
        act := 'member.override';
        summ := case when NEW.share_override is null
          then 'cleared ' || NEW.display_name || '''s share override'
          else 'set ' || NEW.display_name || '''s share to ' || fmt_amt(NEW.share_override) end;
      else
        return null;
      end if;
    else
      act := 'member.remove'; summ := 'removed "' || OLD.display_name || '"';
    end if;

  elsif TG_TABLE_NAME = 'hangout_bookmarks' then
    h := coalesce(NEW.hangout_id, OLD.hangout_id);
    if TG_OP = 'INSERT' then
      act := 'bookmark.add'; summ := 'added bookmark "' || NEW.title || '"';
    elsif TG_OP = 'UPDATE' then
      if OLD.done is distinct from NEW.done then
        act := 'bookmark.done';
        summ := (case when NEW.done then 'checked off "' else 'un-checked "' end) || NEW.title || '"';
      else
        act := 'bookmark.edit'; summ := 'edited bookmark "' || NEW.title || '"';
      end if;
    else
      act := 'bookmark.remove'; summ := 'removed bookmark "' || OLD.title || '"';
    end if;

  elsif TG_TABLE_NAME = 'settlement_marks' then
    h := coalesce(NEW.hangout_id, OLD.hangout_id);
    if TG_OP = 'INSERT' then
      act := 'settle.mark';
      summ := 'marked '
        || coalesce((select display_name from hangout_members where id = NEW.from_member_id), '?')
        || ' → '
        || coalesce((select display_name from hangout_members where id = NEW.to_member_id), '?')
        || ' as paid';
    else
      act := 'settle.unmark';
      summ := 'un-marked '
        || coalesce((select display_name from hangout_members where id = OLD.from_member_id), '?')
        || ' → '
        || coalesce((select display_name from hangout_members where id = OLD.to_member_id), '?');
    end if;

  elsif TG_TABLE_NAME = 'hangouts' then
    h := NEW.id;
    if OLD.name is distinct from NEW.name then
      act := 'hangout.rename'; summ := 'renamed the hangout to "' || NEW.name || '"';
    elsif OLD.status is distinct from NEW.status then
      act := 'hangout.status';
      summ := case when NEW.status = 'ended' then 'ended the hangout' else 'reopened the hangout' end;
    elsif OLD.deposit_holder_id is distinct from NEW.deposit_holder_id then
      act := 'hangout.holder';
      summ := 'set the deposit holder to '
        || coalesce((select display_name from hangout_members where id = NEW.deposit_holder_id), 'the organizer');
    elsif OLD.currency is distinct from NEW.currency then
      act := 'hangout.currency'; summ := 'changed the currency to ' || NEW.currency;
    elsif (OLD.starts_on is distinct from NEW.starts_on)
       or (OLD.ends_on is distinct from NEW.ends_on) then
      act := 'hangout.dates'; summ := 'updated the dates';
    elsif (OLD.guest_can_add_spend, OLD.guest_can_edit_spend,
           OLD.guest_can_add_bookmark, OLD.guest_can_edit_recap)
       is distinct from (NEW.guest_can_add_spend, NEW.guest_can_edit_spend,
           NEW.guest_can_add_bookmark, NEW.guest_can_edit_recap) then
      act := 'hangout.perms'; summ := 'updated guest permissions';
    else
      return null;
    end if;

  else
    return null;
  end if;

  insert into public.activity_log (hangout_id, actor_id, actor_name, action, summary)
  values (h, auth.uid(), actor_name(h), act, summ);
  return null;
end;
$$;

create trigger log_spends
  after insert or update or delete on public.spends
  for each row execute function public.log_activity();
create trigger log_members
  after insert or update or delete on public.hangout_members
  for each row execute function public.log_activity();
create trigger log_bookmarks
  after insert or update or delete on public.hangout_bookmarks
  for each row execute function public.log_activity();
create trigger log_marks
  after insert or delete on public.settlement_marks
  for each row execute function public.log_activity();
create trigger log_hangouts
  after update on public.hangouts
  for each row execute function public.log_activity();
