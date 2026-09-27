import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, buildSchedule, dayInfo, PLAN_WEEKS } from './plan.js'

const sizes = { Chest: 21, Shoulders: 16, Back: 20, Biceps: 19, Triceps: 18, Legs: 32, Core: 14 }
const exercises = Object.entries(sizes).flatMap(([part, n], g) =>
  Array.from({ length: n }, (_, i) => ({ id: g * 100 + i, bodyPart: part, tags: [part, `${part}-${i % 4}`] })),
)
const settings = {
  start_date: '2026-09-28',
  week: ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Legs', 'Rest'],
  main_counts: { Chest: 7, Shoulders: 6, Back: 7, Biceps: 6, Triceps: 6, Legs: 8 },
  core_counts: { Chest: 1, Shoulders: 2, Back: 1, Biceps: 2, Triceps: 2, Legs: 0 },
}
const plan = (extra = {}) =>
  buildSchedule({ exercises, blocked: new Set(), lastDone: new Map(), settings, overrides: {}, from: settings.start_date, ...extra })

test('covers 26 weeks with correct groups and counts', () => {
  const days = plan()
  assert.equal(days.length, PLAN_WEEKS * 7)
  for (const d of days) {
    const main = d.exercises.filter((e) => e.bodyPart === d.group)
    const core = d.exercises.filter((e) => e.bodyPart === 'Core')
    assert.equal(main.length, d.main)
    assert.equal(core.length, d.core)
    if (d.group === 'Rest') assert.equal(d.exercises.length, 0)
  }
  assert.equal(dayInfo(addDays(settings.start_date, PLAN_WEEKS * 7), settings), null)
})

test('no exercise repeats until its pool has rotated', () => {
  const lastSeen = new Map()
  for (const [i, d] of plan().entries()) {
    for (const e of d.exercises) {
      // a pool of size n with k picks per week can go floor(n/k) weeks without repeats
      const perWeek = e.bodyPart === 'Core' ? 8 : d.main
      const minGap = Math.floor(sizes[e.bodyPart] / perWeek) * 7
      if (lastSeen.has(e.id)) assert.ok(i - lastSeen.get(e.id) >= minGap, `${e.id} repeated too soon`)
      lastSeen.set(e.id, i)
    }
  }
})

test('blocked exercises never appear; same inputs give same plan', () => {
  const blocked = new Set([0, 1, 2, 500])
  const days = plan({ blocked })
  assert.ok(days.every((d) => d.exercises.every((e) => !blocked.has(e.id))))
  assert.deepEqual(plan({ blocked }), days)
})

test('day overrides change group and append hand-picked exercises', () => {
  const day = '2026-09-29'
  const legs = exercises.find((e) => e.bodyPart === 'Legs')
  const overrides = { [day]: { muscle_group: 'Legs', added: [0, legs.id] } }
  const d = plan({ overrides }).find((x) => x.day === day)
  assert.equal(d.group, 'Legs')
  assert.equal(d.exercises.length, settings.main_counts.Legs + 2)
  assert.deepEqual(d.exercises.slice(-2).map((e) => e.id), [0, legs.id])
  assert.equal(new Set(d.exercises).size, d.exercises.length) // added one is not picked twice
})
