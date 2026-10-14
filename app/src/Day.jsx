import { useState } from 'react'
import { saveSets, withLog } from './data.js'
import { SetEditor } from './Workout.jsx'
import { bump, defaultRows, logRows, setRows, setText, supersetOf, techniqueNotes } from './workout.js'

const plain = (rows) => rows.map(({ reps, kg, drop }) => ({ reps, kg, ...(drop && { drop }) }))

// One day of the plan, opened from the Plan tab: every exercise with its sets. On today and past
// days a logged set can be fixed or deleted and a missed set logged; on upcoming days the planned
// sets can be changed (saved as the day's targets).
export default function Day({ day, today, info, items, data, userId, save, setOverride }) {
  const [edit, setEdit] = useState(null) // { id: exercise id, k: set index, set: { reps, kg } }
  const [busy, setBusy] = useState(false)
  const done = new Map()
  const last = new Map()
  for (const l of data.logs) { // sorted by day, so the latest earlier log wins
    if (l.day < day) last.set(l.exercise_id, l)
    else if (l.day === day) done.set(l.exercise_id, l)
  }
  const canLog = day <= today
  const letters = items.map((e) => info.targets[e.id]?.superset)
  const planOf = (e) => info.targets[e.id]?.sets ?? (last.has(e.id) ? logRows(last.get(e.id)) : defaultRows(e.units))
  const rowsOf = (e) => setRows(planOf(e), done.get(e.id))

  const run = async (request) => {
    setBusy(true)
    const result = await request()
    setBusy(false)
    if (result !== undefined) setEdit(null)
  }
  const saveLogged = (e, sets) => run(() => {
    const old = done.get(e.id)
    return save(() => saveSets(userId, e.id, day, sets, old), (d, row) => ({ logs: withLog(d.logs, row, old) }))
  })
  const savePlan = (e, sets) => run(() => setOverride(day, { targets: { ...info.targets, [e.id]: { ...info.targets[e.id], sets } } }))
  const loggedOf = (rows) => rows.filter((r) => r.done).map(({ reps, kg }) => ({ reps, kg }))

  // What Save / Delete do on set k of exercise e, by whether that set is logged and the day is past.
  const finish = (e, rows, k, set) => {
    const logged = loggedOf(rows)
    if (rows[k]?.done) return saveLogged(e, set ? logged.map((r, j) => (j === k ? set : r)) : logged.filter((_, j) => j !== k))
    if (canLog) return set && saveLogged(e, [...logged, set])
    const plan = plain(rows)
    if (k >= plan.length) return savePlan(e, [...plan, set])
    return savePlan(e, set ? plan.map((r, j) => (j === k ? { ...r, ...set } : r)) : plan.filter((_, j) => j !== k))
  }

  if (!items.length) return <div className="page"><p className="muted-14">Nothing planned or logged on this day.</p></div>

  return (
    <div className="page gap-26">
      <p className="muted-14 balance">
        {canLog
          ? 'Tap a set to fix it, or to log one you did but did not log.'
          : 'Tap a set to change what is planned. The AI set these from your history.'}
      </p>
      {items.map((e, j) => {
        const rows = rowsOf(e)
        const partners = supersetOf(letters, j).filter((x) => x !== j).map((x) => items[x].name)
        const notes = [...techniqueNotes(e.units, rows, partners), ...(info.targets[e.id]?.tip ? [info.targets[e.id].tip] : [])]
        const editing = edit?.id === e.id ? edit : null
        const adjust = (field, delta, min) => setEdit((x) => ({ ...x, set: { ...x.set, [field]: bump(x.set[field], delta, min) } }))
        const editor = (k, title) => (
          <SetEditor key={k} exercise={e} set={editing.set} title={title} onAdjust={adjust}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy} onClick={() => finish(e, rows, k, editing.set)}>
                {rows[k]?.done || !canLog ? 'Save' : 'Log set'}
              </button>
              {(rows[k]?.done || !canLog) && (
                <button className="btn btn-secondary" style={{ flex: 1 }} disabled={busy || (!rows[k]?.done && rows.length <= 1)} onClick={() => finish(e, rows, k, null)}>
                  {rows[k]?.done ? 'Delete' : 'Remove'}
                </button>
              )}
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </SetEditor>
        )
        return (
          <section key={e.id} className="stack stack-6" aria-label={e.name}>
            <h3 style={{ fontSize: 18 }}>{partners.length ? `${j + 1}${letters[j]}` : j + 1}. {e.name}</h3>
            {notes.map((n) => <div key={n} className="accent-text" style={{ fontSize: 14 }}>{n}</div>)}
            <div>
              {rows.map((r, k) => {
                const name = `Set ${k + 1}${r.drop ? ' · drop' : ''}`
                if (editing?.k === k) return editor(k, `${name} · ${r.done || !canLog ? 'edit' : 'log'}`)
                return (
                  <button key={k} className={r.done ? 'setrow done' : 'setrow'} aria-label={`Edit ${name}, ${setText(e.units, r)}`}
                    onClick={() => setEdit({ id: e.id, k, set: { reps: r.reps, kg: r.kg } })}>
                    <span className="n">{name}</span>
                    <span className="num">{setText(e.units, r)}</span>
                    <span className="st">{r.done ? 'Logged' : canLog ? 'Not logged' : 'Planned'}</span>
                  </button>
                )
              })}
              {editing?.k === rows.length && editor(rows.length, `Set ${rows.length + 1} · ${canLog ? 'log' : 'new'}`)}
            </div>
            <button className="btn btn-ghost btn-start" disabled={busy || rows.length >= 50}
              onClick={() => setEdit({ id: e.id, k: rows.length, set: { reps: rows.at(-1)?.reps ?? 10, kg: rows.at(-1)?.kg ?? 0 } })}>
              + {canLog ? 'Log a set' : 'Add a set'}
            </button>
          </section>
        )
      })}
    </div>
  )
}
