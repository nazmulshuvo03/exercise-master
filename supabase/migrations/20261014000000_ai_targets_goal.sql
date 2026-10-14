-- AI set prescriptions per planned exercise, and the user's training goal for the AI to plan around.

-- NULL = no prescription. Otherwise { "<exercise id>": { "sets": [{ "reps", "kg", "drop"? }],
-- "superset"?: "A", "tip"?: "..." } }, validated in the browser (plan.js) before it is saved.
alter table public.day_overrides add column targets jsonb;

alter table public.settings
  add column goal text not null default 'maintain' check (goal in ('bulk', 'cut', 'maintain'));
