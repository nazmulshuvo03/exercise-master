-- AI week planning: a day can carry an exact exercise list, and AI calls are capped per user per day.

-- NULL = preset rotation. Otherwise exactly these exercise ids, in order, replace the rotation
-- for that day (day_overrides.added is still appended).
alter table public.day_overrides add column plan bigint[];

-- Only ai_take_call touches this table, so RLS is on with no policies.
create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

-- Counts one AI call for the signed-in user. Returns false once today's count passes max_calls.
create function public.ai_take_call(max_calls int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare used int;
begin
  insert into public.ai_usage (user_id, calls) values ((select auth.uid()), 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into used;
  return used <= max_calls;
end $$;

revoke execute on function public.ai_take_call from public, anon;
grant execute on function public.ai_take_call to authenticated;
