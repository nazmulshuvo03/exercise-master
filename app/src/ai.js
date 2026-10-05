// Browser side of the AI feature. The model is reached through /api/ai (see api/ai.js), which holds
// the key; answers are validated in plan.js before anything is saved.
import { saveOverrides } from './data.js'
import { CORE, dayInfo, validateWeek } from './plan.js'
import { supabase } from './supabase.js'

export async function askAi(action, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ action, ...body }),
    signal: AbortSignal.timeout(100_000), // longer than the server's model timeout in api/ai.js
  })
  if (!res.ok) throw new Error({ 429: 'daily AI limit reached', 503: 'the AI model is busy, try again later' }[res.status] ?? `AI request failed (${res.status})`)
  return res.json()
}

// infos: dayInfo() of the days to plan. lastDone: Map exerciseId -> last day done.
export function weekRequest({ exercises, blocked, infos }, lastDone) {
  const groups = new Set(infos.flatMap((i) => [i.group, ...(i.core ? [CORE] : [])]))
  return {
    days: infos.map(({ day, group, main, core }) => ({ day, group, main, core })),
    catalog: exercises
      .filter((e) => groups.has(e.bodyPart) && !blocked.has(e.id))
      .map((e) => ({ id: e.id, name: e.name, group: e.bodyPart, tags: e.tags, lastDone: lastDone.get(e.id) ?? null })),
  }
}

export const swapRequest = (exercise, candidates, dayExercises) => ({
  exercise: { name: exercise.name, tags: exercise.tags },
  dayExercises: dayExercises.map((e) => e.name),
  candidates: candidates.map((e) => ({ id: e.id, name: e.name, tags: e.tags })),
})

// Asks the AI to plan `days` (the days of one week) from today on and saves the days it answers
// well; the rest stay on the preset rotation. Returns the message to show the user.
export async function planDays(days, { exercises, data, userId, save, today }) {
  try {
    const infos = days.filter((d) => d >= today).map((d) => dayInfo(d, data.settings, data.overrides))
      .filter((i) => i && i.main + i.core > 0)
    if (!infos.length) return 'Nothing to plan: the rest of this week is rest days.'
    const lastDone = new Map()
    for (const l of data.logs) if (l.day < today) lastDone.set(l.exercise_id, l.day) // sorted by day
    const ctx = { exercises, blocked: data.blocked, infos }
    const accepted = validateWeek(await askAi('week', weekRequest(ctx, lastDone)), ctx)
    const rows = Object.entries(accepted).map(([day, plan]) => ({ day, plan }))
    if (rows.length && !await save(() => saveOverrides(userId, rows), (d, saved) => ({
      overrides: { ...d.overrides, ...Object.fromEntries(saved.map((r) => [r.day, r])) },
    }))) return '' // save() already showed the error
    return rows.length === infos.length
      ? 'This week is planned by AI.'
      : `AI planned ${rows.length} of ${infos.length} days. The others use the preset rotation.`
  } catch (err) {
    console.error(err)
    return `AI unavailable (${err.message}). This week stays on the preset rotation.`
  }
}
