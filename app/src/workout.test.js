import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bump, defaultRows, lastText, planText, replanSummary, setRows, setText, volumeOf } from './workout.js'

const STRENGTH = ['Reps', 'kg']
const log = (reps, weights) => ({ exercise_id: 1, reps, weights: weights.map(String) })

test('sets: logged ones lay over the plan, extras are kept', () => {
  const plan = defaultRows(STRENGTH)
  assert.equal(plan.length, 3)
  const rows = setRows(plan, log([8, 8], [60, 60]))
  assert.deepEqual(rows.map((r) => r.done), [true, true, false])
  assert.equal(rows[0].reps, 8)
  assert.equal(rows[2].reps, 10) // not logged yet: still the plan
  assert.equal(setRows(plan.slice(0, 1), log([8, 8], [60, 60])).length, 2) // more logged than planned
  assert.deepEqual(defaultRows(['Minutes', 'km']), [{ reps: 20, kg: 0 }])
})

test('text: strength, body weight and cardio sets', () => {
  assert.equal(setText(STRENGTH, { reps: 10, kg: 60 }), '10 × 60 kg')
  assert.equal(setText(STRENGTH, { reps: 10, kg: 0 }), '10 × BW')
  assert.equal(setText(['Reps'], { reps: 12, kg: 0 }), '12 reps')
  assert.equal(setText(['Minutes', 'km'], { reps: 20, kg: 3 }), '20 min · 3 km (9.0 km/h)')
  assert.equal(planText(STRENGTH, [{ reps: 10, kg: 60 }, { reps: 10, kg: 60 }, { reps: 10, kg: 60 }]), '3 × 10 · 60 kg')
  assert.equal(lastText(STRENGTH, log([10, 10, 10], [57.5, 57.5, 57.5])), '3 × 10 at 57.5 kg')
  assert.equal(lastText(STRENGTH, log([8, 8], [0, 0])), '2 × 8, body weight')
  assert.equal(lastText(STRENGTH, log([10, 8], [60, 62.5])), '10 × 60 kg, 8 × 62.5 kg')
})

test('stepper stays above its minimum and rounds to a tenth', () => {
  assert.equal(bump(1, -1, 1), 1)
  assert.equal(bump(0, -2.5, 0), 0)
  assert.equal(bump(57.5, 2.5, 0), 60)
  assert.equal(bump(0.1, 0.2, 0), 0.3)
})

test('volume counts only kg loads', () => {
  const byId = new Map([[1, { units: STRENGTH }], [2, { units: ['Minutes', 'km'] }]])
  assert.equal(volumeOf([log([10, 10], [60, 50]), { exercise_id: 2, reps: [20], weights: ['3'] }], byId), 1100)
})

test('re-plan summary pairs swaps and notes drops and additions', () => {
  const name = (id) => `E${id}`
  assert.deepEqual(replanSummary([1, 2, 3], [1, 4, 3], name), { headline: '1 exercise swapped', changes: ['E2 → E4'] })
  assert.deepEqual(replanSummary([1, 2, 3], [1, 2], name), { headline: 'Cut to 2 exercises', changes: ['Dropped E3'] })
  assert.deepEqual(replanSummary([1, 2], [2, 1], name), { headline: 'Same exercises, new order', changes: [] })
})
