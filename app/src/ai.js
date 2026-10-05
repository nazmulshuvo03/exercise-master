// Browser side of the AI feature. The model is reached through /api/ai (see api/ai.js), which holds
// the key; answers are validated in plan.js before anything is saved.
import { saveOverrides } from './data.js'
import { addDays, CORE, dayInfo, formatDay, validateWeek, weekOf } from './plan.js'
import { supabase } from './supabase.js'

const HISTORY_DAYS = 21 // the trainer looks back 3 weeks
const SCANS = 6 // ponytail: latest InBody scans only, raise if the trend needs a longer view

export async function askAi(action, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ action, ...body }),
    signal: AbortSignal.timeout(250_000), // longer than the server's model timeout in api/ai.js
  })
  if (!res.ok) throw new Error({ 429: 'daily AI limit reached', 503: 'the AI model is busy, try again later' }[res.status] ?? `AI request failed (${res.status})`)
  return res.json()
}

// "10 reps 60 kg, 8 reps 65 kg" or "20 minutes 3 km"
const setsText = (log, [amount, load]) =>
  log.reps.map((r, i) => `${r} ${amount.toLowerCase()}${load ? ` ${Number(log.weights[i])} ${load}` : ''}`).join(', ')

// infos: dayInfo() of the days to plan. week: { day, group } of the whole plan week. taken: ids
// already planned on the week's other days. logs (sorted by day) and scans come from fetchUserData.
export function weekRequest({ exercises, blocked, infos, week, taken, logs, scans, today, note }) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const from = addDays(today, -HISTORY_DAYS)
  const lastDone = new Map()
  const history = []
  for (const l of logs) {
    const e = byId.get(l.exercise_id)
    if (l.day >= today || !e) continue
    lastDone.set(e.id, l.day)
    if (l.day >= from) history.push(`${l.day} ${e.bodyPart}: ${e.name} (${setsText(l, e.units)})`)
  }
  const groups = new Set(infos.flatMap((i) => [i.group, ...(i.core ? [CORE] : [])]))
  return {
    week,
    note, // what the user told the app about the day ("Gym is busy"), if anything
    // avoid: the day's current list, which the user asked to replace; keep: already started, must stay
    days: infos.map(({ day, group, main, core, plan, keep }) => ({ day, group, main, core, ...(plan?.length && { avoid: plan }), ...(keep?.length && { keep }) })),
    history,
    body: scans.slice(-SCANS),
    catalog: exercises
      .filter((e) => groups.has(e.bodyPart) && !blocked.has(e.id) && !taken.has(e.id))
      .map((e) => ({ id: e.id, name: e.name, group: e.bodyPart, tags: e.tags, lastDone: lastDone.get(e.id) ?? null })),
  }
}

export const swapRequest = (exercise, candidates, dayExercises) => ({
  exercise: { name: exercise.name, tags: exercise.tags },
  dayExercises: dayExercises.map((e) => e.name),
  candidates: candidates.map((e) => ({ id: e.id, name: e.name, tags: e.tags })),
})

// A short session for "Only 30 minutes": about 4 exercises, never fewer than the ones already started.
const SHORT_TOTAL = 4
function shorten(info, keep, byId) {
  const kept = (group) => keep.filter((id) => byId.get(id)?.bodyPart === group).length
  const core = info.group === CORE ? 0 : Math.max(kept(CORE), Math.min(info.core, 1))
  return { ...info, core, main: Math.max(kept(info.group), Math.min(info.main, SHORT_TOTAL - core)) }
}

// Asks the AI to plan `days` (one week, or a single day to re-plan) from today on and saves each
// day it answers well; the rest keep what they had. Exercises already logged on a day stay in its
// plan. opts: { note } what the user told the app, { short } plan a shorter session.
// Returns { message, plans: { day: ids } of the days it planned, prev: { day: plan or null } to undo
// with, focus: the AI's reason for the last day }.
// One call per day, one after another, so every call reads the plans of the week's other days,
// including the ones just made. A whole week in one call took the model over 3 minutes.
export async function planDays(days, { exercises, data, userId, save, today, note, short }) {
  const { settings } = data
  let { overrides } = data
  const infoOf = (day) => dayInfo(day, settings, overrides)
  const week = weekOf(days[0], settings).filter((day) => infoOf(day))
  const todo = week.filter((day) => days.includes(day) && day >= today && infoOf(day).main + infoOf(day).core > 0)
  if (!todo.length) return { message: 'Nothing to plan: the rest of this week is rest days.', plans: {}, prev: {}, focus: '' }
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const ids = (i) => [...(i.plan ?? []), ...i.added]
  const prev = Object.fromEntries(todo.map((day) => [day, infoOf(day).plan]))
  const plans = {}
  let focus, error
  for (const [k, day] of todo.entries()) {
    try {
      const pending = todo.slice(k + 1) // their old plans are about to be replaced
      const infos = week.map(infoOf)
      const others = infos.filter((i) => i.day !== day && !pending.includes(i.day))
      const keep = [...new Set(data.logs.filter((l) => l.day === day).map((l) => l.exercise_id))]
      const target = infos.find((i) => i.day === day)
      const ctx = {
        exercises,
        blocked: data.blocked,
        infos: [{ ...(short ? shorten(target, keep, byId) : target), keep }],
        // upcoming days show their saved exercises; past days are in history
        week: infos.map((i) => {
          const names = others.includes(i) && i.day >= today ? ids(i).map((id) => byId.get(id)?.name).filter(Boolean) : []
          return { day: i.day, group: i.group, ...(names.length && { planned: names }) }
        }),
        taken: new Set(others.flatMap(ids)),
        logs: data.logs,
        scans: data.scans,
        today,
        note,
      }
      const response = await askAi('week', weekRequest(ctx))
      const plan = validateWeek(response, ctx)[day]
      if (!plan) continue
      const saved = await save(() => saveOverrides(userId, [{ day, plan }]), (d, rows) => ({
        overrides: { ...d.overrides, ...Object.fromEntries(rows.map((r) => [r.day, r])) },
      }))
      if (!saved) return { message: '', plans, prev, focus: '' } // save() already showed the error
      overrides = { ...overrides, [day]: saved[0] }
      plans[day] = plan
      focus = response.days.find((d) => d?.day === day)?.focus
    } catch (err) { // limit reached, model down or timed out: later days would fail the same way
      console.error(err)
      error = err
      break
    }
  }
  const planned = Object.keys(plans).length
  const done = (message) => ({ message, plans, prev, focus: typeof focus === 'string' ? focus.slice(0, 160) : '' })
  if (!planned && error) return done(`AI unavailable (${error.message}). Nothing changed; days without an AI plan use the preset rotation.`)
  if (!planned) return done('The AI gave no usable answer. Nothing changed.')
  if (planned < todo.length) {
    return done(`AI planned ${planned} of ${todo.length} days${error ? ` (then: ${error.message})` : ''}. The others keep their previous exercises or the preset rotation.`)
  }
  if (todo.length > 1) return done('This week is planned by AI.')
  return done(`AI planned ${formatDay(todo[0], { weekday: 'long' })}.`)
}
