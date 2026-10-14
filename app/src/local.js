// Per-device preferences. localStorage can be blocked or full, so every access is guarded.
const read = (key) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const write = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* the setting just does not stick */ }
}

export const REST_STEP = 15
export const getRestSeconds = () => Math.max(REST_STEP, Number(read('restSeconds')) || 90)
export const setRestSeconds = (s) => write('restSeconds', String(s))
// Off: no countdown after a set, for logging sets in a batch after resting on your own.
export const getRestTimer = () => read('restTimer') !== 'off'
export const setRestTimer = (on) => write('restTimer', on ? 'on' : 'off')

// Exercise ids skipped on a day ("Skip today"); nothing is saved to the database for a skip.
export const loadSkipped = (day) => {
  try { return new Set(JSON.parse(read(`skipped:${day}`) ?? '[]')) } catch { return new Set() }
}
export const saveSkipped = (day, ids) => write(`skipped:${day}`, JSON.stringify([...ids]))
