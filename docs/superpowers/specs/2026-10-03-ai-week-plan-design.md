# AI week plan and exercise swap

## Goal
The user wants AI to plan a week of workouts instead of the preset rotation, and to suggest a similar exercise when they skip or avoid one. The preset rotation stays as the fallback, so the app works when the AI is unavailable.

## Decisions already made
- AI plans the current week automatically: when the app loads, every remaining day of the current week without an exercise list is sent to the AI in one call. Changing a day's group clears its list, so the AI plans that day again. A day the AI fails on is not retried until the next load, and uses the preset rotation. It never plans all 26 weeks; later weeks show only their muscle group until they start or the user plans them with the week's button.
- The preset rotation (`plan.js` `pick()`) is the fallback for the week and for the swap.
- The OpenRouter key stays on the server. The app deploys on Vercel, so the proxy is a Vercel serverless function.
- Secrets: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Locally in `app/.env.local`, deployed in Vercel environment variables. All three exist locally already.
- No new npm dependency.

## Components

### 1. Migration `supabase/migrations/<timestamp>_ai.sql`
- `day_overrides.plan bigint[]`, nullable. `NULL` means the preset rotation. A value means exactly these exercises, in order, replace the rotation for that day (`added` is still appended).
- Table `ai_usage (user_id uuid, day date, calls int, primary key (user_id, day))` with RLS, no direct client access.
- Function `ai_take_call(max_calls int) returns boolean`, `security definer`, keyed on `auth.uid()`. It increments today's count and returns false once the count would exceed `max_calls`.

### 2. `app/api/ai.js`
- `POST` with `Authorization: Bearer <supabase access token>`.
- Checks the token with `supabase.auth.getUser(token)`, then calls `ai_take_call(30)` using a client carrying the user's token. Rejects with 401 or 429.
- Body: `{ action: 'week' | 'swap', ... }`. The function builds the prompt, calls `${AI_BASE_URL}/chat/completions` with `model: AI_MODEL` and a JSON schema response format, and returns the parsed JSON.
- No validation of business rules here beyond JSON shape. Validation runs in the client against the data the client already holds (`plan.js`), so one implementation serves local and deployed.
- Local dev: `vite.config.js` gets a small middleware that routes `/api/ai` to the same handler, so `npm run dev` works with `.env.local`.

### 3. `app/src/plan.js` additions (pure, tested)
- `buildSchedule`: when `info.plan` is set, the day's exercises are those ids (skipping blocked or unknown ids) instead of `pick()` results.
- `validateWeek(response, context)`: per day, accept only if every id exists, is not blocked, belongs to the day's group (core ids only up to the core count), has no duplicates, and the count equals the expected main + core count. Returns the accepted days. Invalid days are dropped, so they fall back to the preset.
- `validateSwap(id, context)`: accept only if the id exists, is not blocked, is in the same body part, and is not already in the day.
- `fallbackSwap(exercise, context)`: deterministic. Picks from the same pool by highest tag overlap, not blocked, not already in the day, longest unused first.

### 4. Client (`data.js`, `Plan.jsx`, `Today.jsx`)
- `data.js`: `askAi(action, body)` posts to `/api/ai` with the session token; `saveOverride` already upserts the new `plan` field.
- `Plan.jsx`: a "Plan week with AI" button on each week that is current or in the future. It sends the week's days (group, main and core counts), the unblocked catalog for the groups involved (id, name, tags, last-done date). Accepted days are saved to `day_overrides.plan` in one batch. A message names any days that stayed on the preset. A failed call keeps the preset and shows a message.
- `Today.jsx`: two actions on the exercise screen.
  - **Skip today**: swap for a similar exercise on this day only.
  - **Not available in my gym**: the existing block action, then the same swap.
  - The swap asks the AI first, validates, and falls back to `fallbackSwap`. The result replaces the exercise in that day's `plan`. If the day has no `plan` yet, the current day list is saved first so the swap sticks.

## Error handling
- Network error, non-200, timeout (100 s; the server gives the model 90 s), invalid JSON, or schema mismatch: use the fallback and show a short message. The user is never blocked.
- 429: show "daily AI limit reached" and use the fallback.

## Testing
- `app/src/plan.test.js` (existing `node --test` file) gets cases for `buildSchedule` with `plan`, `validateWeek` (bad id, blocked id, wrong group, wrong count, duplicate), `validateSwap`, and `fallbackSwap`.
- Manual: run `npm run dev` with the real key, plan a week, skip and block an exercise, and confirm the fallback by breaking `AI_API_KEY`.

## Out of scope for this spec
Sets/reps/weight targets from the AI, the energy and time input, and the progress coach. These are later slices that build on this one.

## Setup the user does
- Apply the migration to Supabase.
- Add `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` in Vercel environment variables and redeploy.
