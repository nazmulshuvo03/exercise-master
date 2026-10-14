// Rotation planner. Pure functions, no Supabase, so it can be tested with plain node.
// Days are local 'YYYY-MM-DD' strings; arithmetic is done in UTC to dodge DST/timezone shifts.

export const REST = 'Rest'
export const CORE = 'Core'

const DAY_MS = 86400000
const ms = (day) => Date.parse(`${day}T00:00:00Z`)
const pad = (n) => String(n).padStart(2, '0')

export const toDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (day, n) => new Date(ms(day) + n * DAY_MS).toISOString().slice(0, 10)
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY_MS)
export const formatDay = (day, options) => new Date(ms(day)).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options })
// The 7 days of the plan week that contains `day`.
export const weekOf = (day, settings) => {
  const start = addDays(settings.start_date, Math.floor(daysBetween(settings.start_date, day) / 7) * 7)
  return Array.from({ length: 7 }, (_, k) => addDays(start, k))
}

// Muscle group and exercise counts for one day, or null when the day is before the plan starts.
// The plan has no end: each week is planned by the AI when it comes.
export function dayInfo(day, settings, overrides = {}) {
  const i = daysBetween(settings.start_date, day)
  if (i < 0) return null
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
    targets: (!rest && o.targets) || {}, // AI set prescriptions by exercise id, see sanitizeTarget
  }
}

// ---------- AI answers: the model may only choose from what the app already allows ----------

// How many main and core exercises a day may have: the settings' counts give or take a couple, so
// the AI can size the session from history and recovery. A short session ("Only 30 minutes") is exact.
export function countRange({ main, core, short }) {
  if (short) return { main: [main, main], core: [core, core] }
  const around = (n, slack, min) => (n ? [Math.max(min, n - slack), n + slack] : [0, 0])
  return { main: around(main, 2, 1), core: around(core, 1, 0) }
}

const MAX_SETS = 10
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

// One exercise's prescription from the AI, cleaned up, or undefined when its sets are unusable
// (the exercise then starts from its last log). reps/kg follow exercises.units like a log does.
export function sanitizeTarget({ sets, superset, tip }) {
  if (!Array.isArray(sets) || !sets.length || sets.length > MAX_SETS) return
  if (!sets.every((s) => num(s?.reps, 1, 500) && num(s?.kg ?? 0, 0, 1000))) return
  const rows = sets.map((s, k) => ({ reps: Math.round(s.reps), kg: Math.round((s.kg ?? 0) * 10) / 10, ...(k > 0 && s.drop === true && { drop: true }) }))
  return {
    sets: rows,
    ...(typeof superset === 'string' && /^[A-Z]$/.test(superset) && { superset }),
    ...(typeof tip === 'string' && tip.trim() && { tip: tip.trim().slice(0, 100) }),
  }
}

// A superset letter only counts on 2+ exercises next to each other; otherwise it is dropped.
// An exercise in a superset has no drop set: the two do not combine.
function tidySupersets(ids, targets) {
  const letters = ids.map((id) => targets[id]?.superset)
  ids.forEach((id, k) => {
    const s = letters[k]
    if (!s) return
    const at = letters.flatMap((l, j) => (l === s ? [j] : []))
    if (at.length < 2 || at.at(-1) - at[0] !== at.length - 1) delete targets[id].superset
    else targets[id].sets = targets[id].sets.filter((r) => !r.drop)
  })
}

// Per day, keeps the AI's list only when its main and core counts are in countRange, all real,
// unblocked, from the right group, no duplicates, and none of `taken` (ids planned on the week's
// other days), and every id in the day's `keep` (exercises already started today). An entry is an
// id or { id, sets, superset, tip }. Returns { day: { plan: [ids], targets } } for accepted days;
// the rest keep what they had (an earlier plan or the preset rotation).
export function validateWeek(response, { exercises, blocked, infos, taken }) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const used = new Set(taken)
  const accepted = {}
  for (const { day, exercises: entries } of Array.isArray(response?.days) ? response.days : []) {
    const info = infos.find((i) => i.day === day)
    if (!info || !Array.isArray(entries)) continue
    const ids = entries.map((x) => (typeof x === 'object' && x ? x.id : x))
    if (new Set(ids).size !== ids.length || info.keep?.some((id) => !ids.includes(id))) continue
    const picked = ids.map((id) => byId.get(id))
    if (picked.some((e) => !e || blocked.has(e.id) || used.has(e.id))) continue
    const count = (group) => picked.filter((e) => e.bodyPart === group).length
    const main = count(info.group)
    const core = info.group === CORE ? 0 : count(CORE) // a Core day has only main exercises
    const range = countRange(info)
    const within = (n, [lo, hi]) => n >= lo && n <= hi
    if (!within(main, range.main) || !within(core, range.core) || picked.length !== main + core) continue
    const targets = {}
    entries.forEach((x, k) => {
      const t = typeof x === 'object' && x && sanitizeTarget(x)
      if (t) targets[ids[k]] = t
    })
    tidySupersets(ids, targets)
    accepted[day] = { plan: ids, targets }
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

// Plan from `from` (inclusive) to the end of its week.
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
  const begin = from > settings.start_date ? from : settings.start_date
  const end = addDays(weekOf(begin, settings)[6], 1)
  for (let day = begin; day < end; day = addDays(day, 1)) {
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
