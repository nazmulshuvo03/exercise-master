import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, buildSchedule, dayInfo, fallbackSwap, PLAN_WEEKS, validateSwap, validateWeek, weekOf } from './plan.js'

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

test('a day plan replaces the rotation; blocked ids are dropped; group change ignores rest', () => {
  const day = '2026-09-29' // Shoulders
  const ids = exercises.filter((e) => e.bodyPart === 'Shoulders').slice(0, 6).map((e) => e.id)
  const d = plan({ overrides: { [day]: { plan: ids } } }).find((x) => x.day === day)
  assert.deepEqual(d.exercises.map((e) => e.id), ids)
  const blocked = new Set([ids[0]])
  const b = plan({ overrides: { [day]: { plan: ids } }, blocked }).find((x) => x.day === day)
  assert.deepEqual(b.exercises.map((e) => e.id), ids.slice(1))
  assert.equal(dayInfo('2026-10-04', settings, { '2026-10-04': { plan: ids } }).plan, null) // rest day
})

const ids = (group, n, from = 0) => exercises.filter((e) => e.bodyPart === group).slice(from, from + n).map((e) => e.id)
const infos = [
  { day: '2026-09-28', group: 'Chest', main: 7, core: 1 },
  { day: '2026-09-29', group: 'Shoulders', main: 6, core: 2 },
]
const ctx = { exercises, blocked: new Set(), infos }

test('validateWeek keeps only days that match group, counts and availability', () => {
  const chest = [...ids('Chest', 7), ...ids('Core', 1)]
  const good = { day: '2026-09-28', exercises: chest }
  const ok = (day) => Object.keys(validateWeek({ days: [day] }, ctx))
  assert.deepEqual(ok(good), ['2026-09-28'])
  assert.deepEqual(ok({ ...good, exercises: chest.slice(1) }), []) // wrong count
  assert.deepEqual(ok({ ...good, exercises: [...chest.slice(1), chest[1]] }), []) // duplicate
  assert.deepEqual(ok({ ...good, exercises: [...chest.slice(1), ...ids('Back', 1)] }), []) // wrong group
  assert.deepEqual(ok({ ...good, exercises: [...chest.slice(1), 99999] }), []) // unknown id
  assert.deepEqual(ok({ day: '2026-10-05', exercises: chest }), []) // day not asked for
  assert.deepEqual(Object.keys(validateWeek({ days: [good] }, { ...ctx, blocked: new Set([chest[0]]) })), []) // blocked
  assert.deepEqual(validateWeek(null, ctx), {})
  assert.deepEqual(Object.keys(validateWeek({ days: [good] }, { ...ctx, taken: new Set([chest[7]]) })), []) // used on another day
  // already started exercises must stay in the list
  const keepInfos = [{ ...infos[0], keep: [chest[0]] }]
  assert.deepEqual(Object.keys(validateWeek({ days: [good] }, { ...ctx, infos: keepInfos })), ['2026-09-28'])
  assert.deepEqual(Object.keys(validateWeek({ days: [good] }, { ...ctx, infos: [{ ...infos[0], keep: [99999] }] })), [])
  // Core day: only main exercises, all Core
  const coreInfo = [{ day: '2026-09-28', group: 'Core', main: 7, core: 0 }]
  assert.equal(Object.keys(validateWeek({ days: [{ day: '2026-09-28', exercises: ids('Core', 7) }] }, { ...ctx, infos: coreInfo })).length, 1)
})

test('swaps stay in the body part, avoid the day and blocked, and prefer similar tags', () => {
  const chest = exercises.filter((e) => e.bodyPart === 'Chest')
  const [e0] = chest // tags Chest, Chest-0; Chest-4, -8, ... share both tags
  const swap = { exercises, blocked: new Set(), dayIds: [e0.id], lastDone: new Map() }
  const next = fallbackSwap(e0, swap)
  assert.equal(next.bodyPart, 'Chest')
  assert.ok(next.tags.includes('Chest-0'))
  const blocked = new Set(chest.filter((e) => e.tags.includes('Chest-0')).map((e) => e.id))
  assert.ok(!fallbackSwap(e0, { ...swap, blocked }).tags.includes('Chest-0')) // next most similar, not a blocked one
  assert.equal(fallbackSwap(e0, { ...swap, blocked: new Set(chest.map((e) => e.id)) }), undefined)
  assert.equal(validateSwap({ id: next.id }, e0, swap), next)
  assert.equal(validateSwap({ id: ids('Back', 1)[0] }, e0, swap), undefined) // other group
  assert.equal(validateSwap({ id: e0.id }, e0, swap), undefined) // itself
  assert.equal(validateSwap('chest', e0, swap), undefined)
})

test('weekOf returns the plan week containing a day', () => {
  assert.deepEqual(weekOf('2026-10-03', settings), Array.from({ length: 7 }, (_, k) => addDays('2026-09-28', k)))
  assert.equal(weekOf('2026-10-05', settings)[0], '2026-10-05')
})
