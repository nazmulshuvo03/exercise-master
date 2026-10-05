import { useEffect, useState } from 'react'
import { askAi, swapRequest } from './ai.js'
import { saveLog, setBlocked } from './data.js'
import Library from './Library.jsx'
import { dayInfo, fallbackSwap, formatDay, planEnd, REST, swapCandidates, validateSwap } from './plan.js'
import { ExerciseInfo, GroupSelect, Overlay, useBackClosable } from './ui.jsx'

// First-time rows: 3 × 10 reps, one 20-minute block, or 3 × 30-second intervals.
const START = { Reps: [3, '10'], Minutes: [1, '20'], Seconds: [3, '30'] }
const defaultRows = ([amount]) => {
  const [n, value] = START[amount] ?? START.Reps
  return Array.from({ length: n }, () => ({ reps: value, weight: '0' }))
}
const rowsOf = (log) => log.reps.map((r, i) => ({ reps: String(r), weight: String(Number(log.weights[i])) }))
const sameRows = (a, b) =>
  a.length === b.length && a.every((r, i) => Number(r.reps) === Number(b[i].reps) && Number(r.weight) === Number(b[i].weight))
// Minutes + km (treadmill): speed is derived, not typed.
const hasSpeed = (amount, load) => amount === 'Minutes' && load === 'km'
const speed = (minutes, km) => (Number(minutes) > 0 ? `${(Number(km) / (Number(minutes) / 60)).toFixed(1)} km/h` : '–')
const summary = (log, [amount, load]) =>
  log.reps.map((r, i) => {
    const w = Number(log.weights[i])
    if (hasSpeed(amount, load)) return `${r} min, ${w} km (${speed(r, w)})`
    return `${r} ${amount.toLowerCase()}${load ? ` @ ${w} ${load}` : ''}`
  }).join(', ')

// One row per set: reps and weight.
function SetsForm({ units: [amount, load], rows, saved, onChange, onSave }) {
  const [busy, setBusy] = useState(false)
  const changed = !saved || !sameRows(rows, saved)
  const edit = (i, key) => (e) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: e.target.value } : r)))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    await onSave()
    setBusy(false)
  }

  return (
    <form className="sets" onSubmit={submit}>
      <table>
        <thead>
          <tr><th scope="col">Set</th><th scope="col">{amount}</th>{load && <th scope="col">{load}</th>}{hasSpeed(amount, load) && <th scope="col">Speed</th>}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              <td>
                <input type="number" inputMode="numeric" min="1" max="500" required
                  aria-label={`Set ${i + 1} ${amount.toLowerCase()}`} value={r.reps} onChange={edit(i, 'reps')} />
              </td>
              {load && (
                <td>
                  <input type="number" inputMode="decimal" min="0" max="9999" step="0.25" required
                    aria-label={`Set ${i + 1} ${load}`} value={r.weight} onChange={edit(i, 'weight')} />
                </td>
              )}
              {hasSpeed(amount, load) && <td className="speed"><output>{speed(r.reps, r.weight)}</output></td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sets-actions">
        <button type="button" className="secondary" onClick={() => onChange([...rows, { ...rows.at(-1) }])} disabled={rows.length >= 50}>+ Set</button>
        <button type="button" className="secondary" onClick={() => onChange(rows.slice(0, -1))} disabled={rows.length <= 1}>− Set</button>
        <button className="primary" disabled={busy || !changed}>{!changed ? 'Done ✓' : saved ? 'Update' : 'Done'}</button>
      </div>
    </form>
  )
}

export default function Today({ exercises, data, userId, save, setOverride, today, schedule, groups, ai, planWithAi }) {
  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState({}) // unsaved set rows by exercise id, kept while paging
  const [picking, openPicker, closePicker] = useBackClosable()
  const [status, setStatus] = useState('')
  const [swapping, setSwapping] = useState(false)
  const info = dayInfo(today, data.settings, data.overrides)

  const last = new Map()
  const done = new Map()
  for (const l of data.logs) { // sorted by day, so the latest log wins
    if (l.day < today) last.set(l.exercise_id, l)
    else if (l.day === today) done.set(l.exercise_id, l)
  }

  // today's plan, plus anything already logged today that is no longer in it. While the AI plans
  // today, only hand-added exercises show, not the preset rotation it is about to replace.
  const waiting = ai.days?.includes(today) && !info?.plan
  const planned = (schedule[0]?.day === today ? schedule[0].exercises : []).filter((e) => !waiting || info.added.includes(e.id))
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const list = [...planned, ...[...done.keys()].map((id) => byId.get(id)).filter((e) => e && !planned.includes(e))]
  const i = Math.max(0, Math.min(index, list.length - 1))
  const exercise = list[i]

  useEffect(() => {
    document.querySelector('.chip[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [i])

  if (!info) {
    return (
      <>
        <header className="top"><h1>Today</h1></header>
        <main>
          <p className="empty">
            Your 26-week plan runs {formatDay(data.settings.start_date, { dateStyle: 'medium' })} to{' '}
            {formatDay(planEnd(data.settings), { dateStyle: 'medium' })}. Change the start date in Settings.
          </p>
        </main>
      </>
    )
  }

  const addExercise = (e) => {
    setOverride(today, { added: [...info.added, e.id] })
    setIndex(list.length) // the new exercise goes last
    closePicker()
  }

  const removeAdded = (e) => setOverride(today, { added: info.added.filter((id) => id !== e.id) })

  // Replaces a not-yet-done exercise in today's list with a similar one: the AI's pick, or the
  // closest by tags when the AI is unavailable. permanent = also never plan it again.
  const swap = async (e, permanent) => {
    if (permanent && !confirm(`Mark “${e.name}” as unavailable? You'll get a similar ${e.bodyPart.toLowerCase()} exercise instead, and it won't be planned again. You can undo this in Settings.`)) return
    const body = info.plan ?? planned.filter((x) => !info.added.includes(x.id)).map((x) => x.id)
    setSwapping(true)
    setStatus('')
    try {
      const ctx = {
        exercises,
        blocked: permanent ? new Set(data.blocked).add(e.id) : data.blocked,
        dayIds: list.map((x) => x.id),
        lastDone: new Map([...last].map(([id, l]) => [id, l.day])),
      }
      let next, why
      try {
        const ai = await askAi('swap', swapRequest(e, swapCandidates(e, ctx), list))
        next = validateSwap(ai, e, ctx)
        why = typeof ai.why === 'string' ? ai.why.slice(0, 120) : ''
      } catch (err) {
        console.error(err)
      }
      const aiPick = Boolean(next)
      next ??= fallbackSwap(e, ctx)
      // save() resolves to undefined on failure; setBlocked succeeds with null
      if (permanent && await save(() => setBlocked(userId, e.id, true), (d) => ({ blocked: new Set(d.blocked).add(e.id) })) === undefined) return
      if (!next) return setStatus(`No similar ${e.bodyPart.toLowerCase()} exercise is left for “${e.name}”.`)
      if (!body.includes(e.id)) return
      await setOverride(today, { plan: body.map((id) => (id === e.id ? next.id : id)) })
      setStatus(`Replaced “${e.name}” with “${next.name}”${aiPick && why ? `: ${why}` : ''}${aiPick ? '' : ' (AI unavailable, picked by similar tags)'}.`)
    } finally {
      setSwapping(false)
    }
  }

  const logSets = async (e, rows) => {
    const row = await save(
      () => saveLog(userId, { exercise_id: e.id, day: today, reps: rows.map((r) => Number(r.reps)), weights: rows.map((r) => Number(r.weight)) }),
      (d, row) => ({ logs: [...d.logs.filter((l) => l.id !== row.id), row] }),
    )
    if (!row) return
    setDrafts((d) => {
      const next = { ...d }
      delete next[e.id]
      return next
    })
    if (i < list.length - 1) setIndex(i + 1)
  }

  const saved = exercise && done.get(exercise.id)
  const previous = exercise && last.get(exercise.id)
  const logged = saved ?? previous
  const rows = exercise && (drafts[exercise.id] ?? (logged ? rowsOf(logged) : defaultRows(exercise.units)))

  return (
    <>
      <header className="top" data-group={info.group}>
        <div className="today-head">
          <h1>{info.group === REST ? 'Rest day' : info.group}</h1>
          <GroupSelect groups={groups} value={info.group} onChange={(g) => setOverride(today, { muscle_group: g })} aria-label="Muscle group for today" />
        </div>
        <p className="subtitle">
          {formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}, week {info.week} day {info.weekDay}. {done.size} of {list.length} done.
          {/* once something is logged, single swaps fit better than a whole new list */}
          {info.main + info.core > 0 && !done.size && (
            <>
              {' '}
              <button className="link" disabled={Boolean(ai.days)} onClick={async () => { setStatus(''); setIndex(0); setStatus(await planWithAi([today])) }}>
                {ai.days?.includes(today) ? 'AI is planning…' : 'Re-plan today with AI'}
              </button>
            </>
          )}
        </p>
        <nav className="chips" aria-label="Today's exercises">
          {list.map((e, j) => (
            <button key={e.id} className={done.has(e.id) ? 'chip done' : 'chip'} aria-current={j === i ? 'step' : undefined} onClick={() => setIndex(j)}>
              {j + 1}. {e.name}
            </button>
          ))}
          <button className="chip add" onClick={() => openPicker(true)}>+ Add exercise</button>
        </nav>
      </header>

      {status && <p className="hint swap-status" role="status">{status}</p>}

      {!exercise && (
        <main>
          <p className="empty">{waiting ? 'AI is planning today’s workout…' : 'Nothing planned. Enjoy the rest, or add an exercise.'}</p>
        </main>
      )}

      {exercise && (
        <main className="exercise" key={exercise.id} data-group={exercise.bodyPart}>
          <section className="exercise-log" aria-labelledby="exercise-name">
            <p className="exercise-count">
              Exercise {i + 1} of {list.length}
              {exercise.bodyPart !== info.group && <span className="badge" data-group={exercise.bodyPart}>{exercise.bodyPart}</span>}
              {info.added.includes(exercise.id) && <span className="badge">Added</span>}
            </p>
            <h2 id="exercise-name">{exercise.name}</h2>
            <p className="card-meta">
              {previous ? `Last time, ${formatDay(previous.day, { day: 'numeric', month: 'short' })}: ${summary(previous, exercise.units)}` : 'First time'}
            </p>
            <SetsForm
              units={exercise.units}
              rows={rows}
              saved={saved && rowsOf(saved)}
              onChange={(r) => setDrafts((d) => ({ ...d, [exercise.id]: r }))}
              onSave={() => logSets(exercise, rows)}
            />
            {info.added.includes(exercise.id)
              ? <button className="link" onClick={() => removeAdded(exercise)}>Remove from today</button>
              : (
                <div className="swap-actions">
                  {!saved && <button className="link" disabled={swapping} onClick={() => swap(exercise, false)}>{swapping ? 'Finding a replacement…' : 'Skip today'}</button>}
                  <button className="link" disabled={swapping} onClick={() => swap(exercise, true)}>Not available in my gym</button>
                </div>
              )}
          </section>
          <section className="exercise-info" aria-label="How to do it">
            <ExerciseInfo exercise={exercise} />
          </section>
        </main>
      )}

      {exercise && (
        <div className="pager">
          <button className="secondary" onClick={() => setIndex(i - 1)} disabled={i === 0}>‹ Previous</button>
          <span>{i + 1} / {list.length}</span>
          <button className="secondary" onClick={() => setIndex(i + 1)} disabled={i >= list.length - 1}>Next ›</button>
        </div>
      )}

      {picking && (
        <Overlay title="Add exercise" label={formatDay(today, { weekday: 'long' })} onClose={closePicker}>
          <Library
            title="Add exercise"
            exercises={exercises.filter((e) => !data.blocked.has(e.id) && !list.includes(e))}
            blocked={data.blocked}
            onPick={addExercise}
          />
        </Overlay>
      )}
    </>
  )
}
