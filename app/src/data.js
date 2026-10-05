import { toDay } from './plan.js'
import { supabase } from './supabase.js'

const check = ({ data, error }) => {
  if (error) throw error
  return data
}

export async function fetchExercises() {
  const data = check(await supabase
    .from('exercises')
    .select('id, body_part, name, tags, description, help, images, units')
    .order('id'))

  return data.map((r) => ({
    id: r.id,
    bodyPart: r.body_part,
    name: r.name,
    tags: r.tags,
    description: r.description,
    help: r.help,
    images: r.images,
    units: r.units, // [amount per set, optional load], e.g. ['Reps', 'kg'] or ['Minutes', 'km']
  }))
}

// body parts in insertion (CSV) order
export const bodyPartsOf = (exercises) => [...new Set(exercises.map((e) => e.bodyPart))]

// PostgREST caps responses (1000 rows by default), and 26 weeks of logs can exceed that.
async function fetchAll(query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const page = check(await query().range(from, from + 999))
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

// Creates default settings on first use. Two loads can race (StrictMode, two tabs), so
// insert-or-ignore instead of select-then-insert.
async function fetchSettings(userId) {
  check(await supabase.from('settings')
    .upsert({ user_id: userId, start_date: toDay() }, { onConflict: 'user_id', ignoreDuplicates: true }))
  return check(await supabase.from('settings').select('*').eq('user_id', userId).single())
}

export async function fetchUserData(userId) {
  const [settings, overrides, logs, blocked, scans] = await Promise.all([
    fetchSettings(userId),
    fetchAll(() => supabase.from('day_overrides').select('*').order('day')),
    fetchAll(() => supabase.from('workout_logs').select('*').order('day').order('id')),
    fetchAll(() => supabase.from('blocked_exercises').select('exercise_id')),
    fetchAll(() => supabase.from('body_scans').select('day, metrics').order('day')),
  ])
  return {
    settings,
    overrides: Object.fromEntries(overrides.map((o) => [o.day, o])),
    logs,
    blocked: new Set(blocked.map((b) => b.exercise_id)),
    scans, // [{ day, metrics }] sorted by day, see inbody.js
  }
}

export const saveSettings = async (userId, fields) =>
  check(await supabase.from('settings').update(fields).eq('user_id', userId).select().single())

export const saveOverride = async (userId, day, fields) =>
  check(await supabase.from('day_overrides')
    .upsert({ user_id: userId, day, ...fields }, { onConflict: 'user_id,day' })
    .select().single())

// rows: [{ day, ...fields }]; fields not listed keep their saved values.
export const saveOverrides = async (userId, rows) =>
  check(await supabase.from('day_overrides')
    .upsert(rows.map((r) => ({ user_id: userId, ...r })), { onConflict: 'user_id,day' })
    .select())

export const saveLog = async (userId, log) =>
  check(await supabase.from('workout_logs')
    .upsert({ user_id: userId, ...log }, { onConflict: 'user_id,exercise_id,day' })
    .select().single())

export const setBlocked = async (userId, exerciseId, blocked) =>
  check(blocked
    ? await supabase.from('blocked_exercises').insert({ user_id: userId, exercise_id: exerciseId })
    : await supabase.from('blocked_exercises').delete().eq('user_id', userId).eq('exercise_id', exerciseId))

export const saveScan = async (userId, scan) =>
  check(await supabase.from('body_scans')
    .upsert({ user_id: userId, ...scan }, { onConflict: 'user_id,day' })
    .select('day, metrics').single())

export const deleteScan = async (userId, day) =>
  check(await supabase.from('body_scans').delete().eq('user_id', userId).eq('day', day))
