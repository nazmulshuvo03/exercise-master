create table public.exercises (
  id bigint generated always as identity primary key,
  body_part text not null,
  serial_no int not null,
  name text not null,
  tags text[] not null default '{}',
  description text not null default '',
  help text not null default '',
  images text[] not null default '{}',
  unique (body_part, serial_no),
  unique (body_part, name)
);

alter table public.exercises enable row level security;

-- catalog is public read-only; writes only via dashboard / service role
create policy "Exercises are readable by everyone"
  on public.exercises for select
  to anon, authenticated
  using (true);
