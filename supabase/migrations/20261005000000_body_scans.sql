-- InBody (body composition) results, one per test date. metrics holds the numbers keyed as in
-- app/src/inbody.js, which validates them before saving. The sheet image itself is not stored.
create table public.body_scans (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  primary key (user_id, day)
);

alter table public.body_scans enable row level security;

create policy "Own body scans" on public.body_scans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
