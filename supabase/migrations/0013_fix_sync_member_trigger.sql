-- 0013_fix_sync_member_trigger.sql
-- Fix column name in sync_member_from_saved_bank_account (saved_bank_accounts uses 'name', not 'display_name')

create or replace function public.sync_member_from_saved_bank_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank public.saved_bank_accounts%rowtype;
begin
  if NEW.bank_code is null or NEW.bank_account_no is null then
    select * into v_bank
    from public.saved_bank_accounts
    where
      (NEW.profile_id is not null and user_id = NEW.profile_id)
      or name ilike NEW.display_name
    order by updated_at desc
    limit 1;

    if found then
      NEW.bank_code := v_bank.bank_code;
      NEW.bank_name := v_bank.bank_name;
      NEW.bank_account_no := v_bank.account_no;
      NEW.bank_account_name := v_bank.account_name;
    end if;
  end if;

  return NEW;
end;
$$;
