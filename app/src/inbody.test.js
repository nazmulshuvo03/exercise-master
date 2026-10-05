import assert from 'node:assert/strict'
import test from 'node:test'
import { FIELDS, jsonIn, parseScan, PROMPT } from './inbody.js'

test('parseScan keeps valid numbers and the date', () => {
  const { day, metrics, invalid } = parseScan({ day: '2026-09-23', weight: 82.2, pbf: '28,0', smm: '33.3', bmi: null, protein: '' })
  assert.equal(day, '2026-09-23')
  assert.deepEqual(metrics, { weight: 82.2, pbf: 28, smm: 33.3 })
  assert.deepEqual(invalid, [])
})

test('parseScan reports values out of range or not numbers', () => {
  const { day, metrics, invalid } = parseScan({ day: '23.09.2026', weight: 8220, pbf: 'n/a', visceral_fat: 10 })
  assert.equal(day, undefined)
  assert.deepEqual(metrics, { visceral_fat: 10 })
  assert.deepEqual(invalid, ['Weight', 'Percent body fat'])
})

test('parseScan ignores unknown keys and non-objects', () => {
  assert.deepEqual(parseScan({ impedance: 300 }).metrics, {})
  assert.deepEqual(parseScan(null), { day: undefined, metrics: {}, invalid: [] })
})

test('jsonIn reads an object wrapped in a fence', () => {
  assert.deepEqual(jsonIn('Here it is:\n```json\n{"weight": 82.2}\n```'), { weight: 82.2 })
})

test('prompt names every field', () => {
  for (const f of FIELDS) assert.ok(PROMPT.includes(`"${f.key}"`), f.key)
  assert.equal(new Set(FIELDS.map((f) => f.key)).size, FIELDS.length)
})
