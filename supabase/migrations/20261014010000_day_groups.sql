-- A day can train 1-3 muscle groups (catch-up days after missed sessions). NULL = the usual week's
-- group for that weekday. Replaces muscle_group, which held a single group.
alter table public.day_overrides
  add column groups text[] check (cardinality(groups) between 1 and 3 and array_position(groups, null) is null);

update public.day_overrides set groups = array[muscle_group] where muscle_group is not null;

alter table public.day_overrides drop column muscle_group;
