-- What each logged set measures. units[1] is stored in workout_logs.reps, the optional
-- units[2] in workout_logs.weights. Strength default: reps and kg. Cardio: e.g. {Minutes,km/h}.
alter table public.exercises
  add column units text[] not null default '{Reps,kg}'
    check (cardinality(units) between 1 and 2);
