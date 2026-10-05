// Set-by-set logging helpers. Pure functions, no React, so plain node can test them.
// A set is { reps, kg }: `reps` is the exercise's first unit (reps, minutes or seconds) and `kg` its
// optional load (kg, km, ...). units = [amount, load?], see exercises.units.

const START = { Reps: [3, 10], Minutes: [1, 20], Seconds: [3, 30] }

// First time: 3 × 10 reps, one 20-minute block, or 3 × 30-second intervals.
export const defaultRows = ([amount]) => {
  const [n, reps] = START[amount] ?? START.Reps
  return Array.from({ length: n }, () => ({ reps, kg: 0 }))
}

export const logRows = (log) => log.reps.map((reps, i) => ({ reps, kg: Number(log.weights[i]) }))

// The sets of one exercise today: `plan` (edited, or copied from last time) with the logged sets
// laid over it. Sets are logged in order, so the logged ones are always the first ones.
export function setRows(plan, log) {
  const logged = log ? logRows(log) : []
  return [
    ...plan.map((r, i) => (i < logged.length ? { ...logged[i], done: true } : { ...r, done: false })),
    ...logged.slice(plan.length).map((r) => ({ ...r, done: true })),
  ]
}

export const repStep = ([amount]) => (amount === 'Seconds' ? 5 : 1)
export const loadStep = ([, load]) => ({ kg: 2.5, km: 0.5 })[load] ?? 1

// Stepper result: never below `min`, rounded to a tenth.
export const bump = (value, delta, min) => Math.max(min, Math.round((value + delta) * 10) / 10)

const weightText = (load, kg) => (kg ? `${kg} ${load}` : load === 'kg' ? 'body weight' : '')

// One set: "10 × 60 kg", "10 × BW", "20 min · 3 km (9.0 km/h)", "30 s".
export function setText([amount, load], { reps, kg }) {
  if (amount === 'Reps') return load ? `${reps} × ${load === 'kg' && !kg ? 'BW' : `${kg} ${load}`}` : `${reps} reps`
  const time = `${reps} ${amount === 'Minutes' ? 'min' : 's'}`
  if (!load) return time
  const speed = amount === 'Minutes' && load === 'km' && reps > 0 ? ` (${(kg / (reps / 60)).toFixed(1)} km/h)` : ''
  return `${time} · ${kg} ${load}${speed}`
}

// Today's plan for an exercise: "3 × 10 · 60 kg".
export function planText(units, rows) {
  const [amount, load] = units
  const n = rows.length
  if (amount !== 'Reps') return `${n > 1 ? `${n} × ` : ''}${setText(units, rows[0])}`
  const w = weightText(load, rows[0].kg)
  return `${n} × ${rows[0].reps}${w ? ` · ${w}` : ''}`
}

// What the last session looked like: "3 × 10 at 57.5 kg", or every set when they differ.
export function lastText(units, log) {
  const rows = logRows(log)
  const [amount, load] = units
  const same = rows.every((r) => r.reps === rows[0].reps && r.kg === rows[0].kg)
  if (amount !== 'Reps' || !same) return rows.map((r) => setText(units, r)).join(', ')
  const w = weightText(load, rows[0].kg)
  return `${rows.length} × ${rows[0].reps}${w ? (rows[0].kg ? ` at ${w}` : `, ${w}`) : ''}`
}

// Total kg lifted: reps × kg over every set of the logs whose load is kg.
export const volumeOf = (logs, byId) =>
  logs.reduce((sum, l) => (byId.get(l.exercise_id)?.units[1] === 'kg'
    ? sum + l.reps.reduce((s, r, i) => s + r * Number(l.weights[i]), 0)
    : sum), 0)

// Rough session length: 2.4 minutes a set, rounded to 5.
export const minutesFor = (sets) => Math.round((sets * 2.4) / 5) * 5

// The AI card's result: "Old → New" per swap, "Dropped X" / "Added X" when the count changed.
// before / after: exercise ids of the day's list; name(id): exercise name.
export function replanSummary(before, after, name) {
  const out = before.filter((id) => !after.includes(id))
  const inn = after.filter((id) => !before.includes(id))
  const changes = [
    ...out.map((id, k) => (k < inn.length ? `${name(id)} → ${name(inn[k])}` : `Dropped ${name(id)}`)),
    ...inn.slice(out.length).map((id) => `Added ${name(id)}`),
  ]
  const headline = after.length < before.length
    ? `Cut to ${after.length} exercises`
    : inn.length ? `${inn.length} exercise${inn.length > 1 ? 's' : ''} swapped` : 'Same exercises, new order'
  return { headline, changes }
}
