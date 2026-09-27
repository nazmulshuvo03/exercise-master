-- Per-user workout planning and logging. Every row belongs to auth.uid().

-- Plan defaults. week = one group (or 'Rest') per day, day 1 = start_date's weekday.
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  start_date date not null default current_date,
  week text[] not null default '{Chest,Shoulders,Back,Biceps,Triceps,Legs,Rest}'
    check (cardinality(week) = 7),
  main_counts jsonb not null default '{"Chest":7,"Shoulders":6,"Back":7,"Biceps":6,"Triceps":6,"Legs":8}',
  core_counts jsonb not null default '{"Chest":1,"Shoulders":2,"Back":1,"Biceps":2,"Triceps":2,"Legs":0}'
);

-- Changes to a single day: another muscle group and/or other exercise counts.
create table public.day_overrides (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  muscle_group text,
  main_count int check (main_count between 0 and 20),
  core_count int check (core_count between 0 and 10),
  primary key (user_id, day)
);

create table public.workout_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id bigint not null references public.exercises on delete cascade,
  day date not null,
  sets int not null check (sets between 1 and 50),
  reps int not null check (reps between 1 and 500),
  weight numeric(6, 2) not null default 0 check (weight >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, exercise_id, day)
);
create index workout_logs_user_day on public.workout_logs (user_id, day);

-- Exercises the user's gym cannot do.
create table public.blocked_exercises (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id bigint not null references public.exercises on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.settings enable row level security;
alter table public.day_overrides enable row level security;
alter table public.workout_logs enable row level security;
alter table public.blocked_exercises enable row level security;

create policy "Own settings" on public.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own day overrides" on public.day_overrides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own workout logs" on public.workout_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own blocked exercises" on public.blocked_exercises for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
