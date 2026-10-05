# Exercise Book

Daily workout planner: one muscle group per day, 6 days a week, with the AI planning each week as it comes.
Exercises rotate so the ones you did longest ago come first, with variety across sub-muscle tags.
You log sets, reps and weight for each exercise, and you can mark an exercise as unavailable to get a replacement.

## Setup

1. Run the SQL files in Supabase, in this order: `../supabase/migrations/*.sql`, then `../supabase/seed.sql`.
2. Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run `npm install`, then `npm run dev`. Create an account on the sign-in screen.
   If email confirmation is on (the Supabase default), click the link in the email, then sign in.

## Code map

- `src/plan.js` – rotation planner (pure functions, tested by `npm test`)
- `src/data.js` – Supabase reads and writes
- `src/App.jsx` – sign-in, data loading, tabs
- `src/Today.jsx`, `Plan.jsx`, `Progress.jsx`, `Settings.jsx`, `Library.jsx` – screens
- `src/ui.jsx` – shared components (images, exercise detail view)
