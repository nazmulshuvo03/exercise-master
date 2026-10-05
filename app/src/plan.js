// Rotation planner. Pure functions, no Supabase, so it can be tested with plain node.
// Days are local 'YYYY-MM-DD' strings; arithmetic is done in UTC to dodge DST/timezone shifts.

export const PLAN_WEEKS = 26
export const REST = 'Rest'
export const CORE = 'Core'

const DAY_MS = 86400000
const ms = (day) => Date.parse(`${day}T00:00:00Z`)
const pad = (n) => String(n).padStart(2, '0')

export const toDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (day, n) => new Date(ms(day) + n * DAY_MS).toISOString().slice(0, 10)
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY_MS)
export const formatDay = (day, options) => new Date(ms(day)).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options })
export const planEnd =(settings) => addDays(settings.start_date, PLAN_WEEKS * 7)
// The 7 days of the plan week that contains `day`.
export const weekOf = (day, settings) => {
  const start = addDays(settings.start_date, Math.floor(daysBetween(settings.start_date, day) / 7) * 7)
  return Array.from({ length: 7 }, (_, k) => addDays(start, k))
}

// Muscle group and exercise counts for one day, or null when the day is outside the plan.
export function dayInfo(day, settings, overrides = {}) {
  const i = daysBetween(settings.start_date, day)
  if (i < 0 || i >= PLAN_WEEKS * 7) return null
  const o = overrides[day] ?? {}
  const group = o.muscle_group ?? settings.week[i % 7]
  const rest = group === REST
  return {
    day,
    week: Math.floor(i / 7) + 1,
    weekDay: (i % 7) + 1,
    group,
    main: rest ? 0 : (settings.main_counts[group] ?? 7),
    core: rest || group === CORE ? 0 : (settings.core_counts[group] ?? 0),
    added: o.added ?? [], // exercise ids picked by hand for this day
    plan: rest ? null : (o.plan ?? null), // exact exercise ids (AI or swapped); null = rotate
  }
}

// ---------- AI answers: the model may only choose from what the app already allows ----------

// Per day, keeps the AI's list only when it has exactly the expected main and core exercises, all
// real, unblocked, from the right group, no duplicates, and none of `taken` (ids planned on the
// week's other days), and every id in the day's `keep` (exercises already started today). Returns
// { day: [ids] } for accepted days; the rest keep what they had (an earlier plan or the preset rotation).
export function validateWeek(response, { exercises, blocked, infos, taken }) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const used = new Set(taken)
  const accepted = {}
  for (const { day, exercises: ids } of Array.isArray(response?.days) ? response.days : []) {
    const info = infos.find((i) => i.day === day)
    if (!info || !Array.isArray(ids) || new Set(ids).size !== ids.length || info.keep?.some((id) => !ids.includes(id))) continue
    const picked = ids.map((id) => byId.get(id))
    if (picked.some((e) => !e || blocked.has(e.id) || used.has(e.id))) continue
    const count = (group) => picked.filter((e) => e.bodyPart === group).length
    const core = info.group === CORE ? 0 : count(CORE) // a Core day has only main exercises
    if (count(info.group) === info.main && core === info.core && picked.length === info.main + info.core) {
      accepted[day] = ids
    }
  }
  return accepted
}

// Exercises that could replace `exercise` today: same body part, available, not already in the day.
export const swapCandidates = (exercise, { exercises, blocked, dayIds }) =>
  exercises.filter((e) => e.bodyPart === exercise.bodyPart && e.id !== exercise.id && !blocked.has(e.id) && !dayIds.includes(e.id))

// The AI's chosen replacement (an exercise), or undefined when its id is not an allowed candidate.
export const validateSwap = (response, exercise, ctx) => swapCandidates(exercise, ctx).find((e) => e.id === response?.id)

// Used when the AI is unavailable: most shared tags (similar), then longest unused.
// lastDone: Map exerciseId -> last day done. ponytail: tag overlap only, no equipment/movement model.
export function fallbackSwap(exercise, ctx) {
  const tags = new Set(exercise.tags)
  const overlap = (e) => e.tags.filter((t) => tags.has(t)).length
  const idle = (e) => ctx.lastDone.get(e.id) ?? '' // '' sorts before any date: never done first
  return swapCandidates(exercise, ctx).sort((a, b) => overlap(b) - overlap(a) || idle(a).localeCompare(idle(b)))[0]
}

// Deterministic RNG seeded by a string, so a day's picks don't change on reload.
function rng(seed) {
  let h = 1779033703
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Picks n exercises: longest-unused first, then ones whose tags (sub-muscles) are not yet
// covered today, then random. Records the picks in `last`.
// ponytail: hand-tuned weights (4 points per week unused vs 1 per shared tag); tune here if
// rotation feels too repetitive or too samey.
function pick(pool, n, day, last) {
  const rand = rng(day + (pool[0]?.bodyPart ?? ''))
  const cands = pool.map((e) => ({
    e,
    weeks: last.has(e.id) ? Math.min(daysBetween(last.get(e.id), day) / 7, 10) : 11,
    r: rand(),
  }))
  const covered = new Set()
  const score = (c) => c.weeks * 4 - c.e.tags.filter((t) => covered.has(t)).length + c.r
  const chosen = []
  while (chosen.length < n && cands.length) {
    let best = 0
    for (let i = 1; i < cands.length; i++) if (score(cands[i]) > score(cands[best])) best = i
    const { e } = cands.splice(best, 1)[0]
    chosen.push(e)
    e.tags.forEach((t) => covered.add(t))
  }
  chosen.forEach((e) => last.set(e.id, day))
  return chosen
}

// Plan from `from` (inclusive) to the end of the 26 weeks.
// lastDone: Map exerciseId -> last day it was done before `from`.
export function buildSchedule({ exercises, blocked, lastDone, settings, overrides, from }) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const pools = new Map()
  for (const e of exercises) {
    if (blocked.has(e.id)) continue
    if (!pools.has(e.bodyPart)) pools.set(e.bodyPart, [])
    pools.get(e.bodyPart).push(e)
  }
  const last = new Map(lastDone)
  const days = []
  const end = planEnd(settings)
  for (let day = from > settings.start_date ? from : settings.start_date; day < end; day = addDays(day, 1)) {
    const info = dayInfo(day, settings, overrides)
    const added = info.added.map((id) => byId.get(id)).filter((e) => e && !blocked.has(e.id))
    added.forEach((e) => last.set(e.id, day))
    const free = (group) => (pools.get(group) ?? []).filter((e) => !added.includes(e))
    const fixed = info.plan?.map((id) => byId.get(id)).filter((e) => e && !blocked.has(e.id))
    const body = fixed ?? [...pick(free(info.group), info.main, day, last), ...pick(free(CORE), info.core, day, last)]
    fixed?.forEach((e) => last.set(e.id, day))
    days.push({ ...info, exercises: [...body, ...added.filter((e) => !body.includes(e))] })
  }
  return days
}
