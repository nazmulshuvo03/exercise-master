-- Log reps and weight for every set, and let a day carry hand-picked exercises
-- instead of per-day exercise counts.

alter table public.workout_logs
  drop column sets,
  drop column reps,
  drop column weight,
  add column reps int[] not null
    check (cardinality(reps) between 1 and 50 and array_position(reps, null) is null
      and 1 <= all(reps) and 500 >= all(reps)),
  add column weights numeric(6, 2)[] not null
    check (cardinality(weights) = cardinality(reps) and array_position(weights, null) is null
      and 0 <= all(weights));

alter table public.day_overrides
  drop column main_count,
  drop column core_count,
  add column added bigint[] not null default '{}';
