import { useEffect, useState } from 'react'
import { askAi, swapRequest } from './ai.js'
import { saveLog, setBlocked } from './data.js'
import Library from './Library.jsx'
import { getRestSeconds, loadSkipped, saveSkipped } from './local.js'
import { dayInfo, fallbackSwap, formatDay, planEnd, REST, swapCandidates, validateSwap, weekOf } from './plan.js'
import Summary from './Summary.jsx'
import { familyOf, Overlay, Plate, Plated, useBackClosable } from './ui.jsx'
import Workout from './Workout.jsx'
import { bump, defaultRows, logRows, minutesFor, planText, replanSummary, setRows, setText } from './workout.js'

const REASONS = [
  { key: 'time', label: 'Only 30 minutes' },
  { key: 'busy', label: 'Gym is busy' },
  { key: 'shoulder', label: 'Shoulder feels off' },
  { key: 'barbell', label: 'No barbell free' },
]

// "Re-plan with AI": pick a reason or say what is going on, then see what changed. onReplan({ note,
// short }) resolves to { headline, changes, undo? }.
function AiCard({ disabled, onReplan }) {
  const [reason, setReason] = useState(null)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('idle') // idle | busy | done
  const [result, setResult] = useState(null)

  const reset = () => { setPhase('idle'); setReason(null); setText('') }
  const run = async () => {
    setPhase('busy')
    const chip = REASONS.find((r) => r.key === reason)
    try {
      setResult(await onReplan({ note: [chip?.label, text.trim()].filter(Boolean).join('. '), short: reason === 'time' }))
    } catch (err) {
      console.error(err)
      setResult({ headline: 'Could not re-plan', changes: [] })
    }
    setPhase('done')
  }

  return (
    <section className="card" aria-label="Re-plan with AI">
      <div className="card-kicker">Re-plan with AI</div>
      {phase === 'idle' && (
        <div className="stack">
          <div className="card-title">Something different today?</div>
          <div className="wrap">
            {REASONS.map((r) => (
              <button key={r.key} className="chip" aria-pressed={reason === r.key} onClick={() => setReason(reason === r.key ? null : r.key)}>{r.label}</button>
            ))}
          </div>
          <input className="input" style={{ background: 'var(--color-bg)' }} placeholder="Or say what's going on" aria-label="What is going on" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary btn-start" disabled={disabled || (!reason && !text.trim())} onClick={run}>Re-plan today</button>
        </div>
      )}
      {phase === 'busy' && (
        <div className="stack stack-6" role="status" style={{ padding: '8px 0' }}>
          <div className="card-title">Re-planning…</div>
          <div className="muted">Checking last week's logs and your unavailable equipment.</div>
        </div>
      )}
      {phase === 'done' && (
        <div className="stack stack-10" role="status">
          <div className="card-title">{result.headline}</div>
          {result.changes.map((c) => <div key={c} style={{ fontSize: 14, lineHeight: 1.45 }}>{c}</div>)}
          <div className="wrap" style={{ marginTop: 4 }}>
            {result.undo && <button className="btn btn-secondary" onClick={async () => { await result.undo(); reset() }}>Undo</button>}
            <button className="btn btn-ghost" onClick={reset}>Re-plan again</button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function Today({ exercises, data, userId, save, setOverride, today, schedule, ai, planWithAi, restorePlans, screen, setScreen }) {
  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState({}) // planned sets ({ reps, kg }) by exercise id, once edited
  const [skipped, setSkipped] = useState(() => loadSkipped(today))
  const [rest, setRest] = useState(null) // seconds of the rest being shown, or null
  const [busy, setBusy] = useState(false) // a set is being saved
  const [swapping, setSwapping] = useState(false)
  const [status, setStatus] = useState('')
  const [picking, openPicker, closePicker] = useBackClosable()
  const info = dayInfo(today, data.settings, data.overrides)

  const last = new Map()
  const done = new Map()
  for (const l of data.logs) { // sorted by day, so the latest log wins
    if (l.day < today) last.set(l.exercise_id, l)
    else if (l.day === today) done.set(l.exercise_id, l)
  }

  // today's plan, plus anything already logged today that is no longer in it. While the AI plans
  // today, only hand-added exercises show, not the preset rotation it is about to replace.
  const waiting = info && ai.days?.includes(today) && !info.plan
  const planned = (schedule[0]?.day === today ? schedule[0].exercises : []).filter((e) => !waiting || info.added.includes(e.id))
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const list = [...planned, ...[...done.keys()].map((id) => byId.get(id)).filter((e) => e && !planned.includes(e))]
  const i = Math.max(0, Math.min(index, list.length - 1))
  const exercise = list[i]

  const basePlan = (e) => (last.has(e.id) ? logRows(last.get(e.id)) : defaultRows(e.units))
  const editPlan = (e, fn) => setDrafts((d) => ({ ...d, [e.id]: fn(d[e.id] ?? basePlan(e)) }))
  const rowsOf = (e) => setRows(drafts[e.id] ?? basePlan(e), done.get(e.id))
  const isDone = (e, sk = skipped) => sk.has(e.id) || rowsOf(e).every((r) => r.done)
  const rows = exercise && rowsOf(exercise)
  const cur = rows ? rows.findIndex((r) => !r.done) : -1

  useEffect(() => { // each exercise starts at the top
    if (screen === 'workout') document.querySelector('.screen')?.scrollTo(0, 0)
  }, [i, screen])

  if (!info) {
    return (
      <div className="page">
        <p className="muted-14">
          Your 26-week plan runs {formatDay(data.settings.start_date, { dateStyle: 'medium' })} to{' '}
          {formatDay(planEnd(data.settings), { dateStyle: 'medium' })}. Change the start date in Settings.
        </p>
        <button className="btn btn-secondary btn-start" onClick={() => setScreen('settings')}>Open Settings</button>
      </div>
    )
  }

  const nextOpen = (sk) => {
    for (let k = 1; k <= list.length; k++) {
      const j = (i + k) % list.length
      if (!isDone(list[j], sk)) return j
    }
    return -1
  }
  const advance = (sk = skipped) => {
    const j = nextOpen(sk)
    if (j < 0) setScreen('summary')
    else setIndex(j)
  }

  const addExercise = (e) => {
    setOverride(today, { added: [...info.added, e.id] })
    setIndex(list.length) // the new exercise goes last
    closePicker()
    setScreen('workout')
  }
  const removeAdded = (e) => setOverride(today, { added: info.added.filter((id) => id !== e.id) })

  // "Not in my gym": replaces a not-yet-done exercise in today's list with a similar one (the AI's
  // pick, or the closest by tags when the AI is unavailable) and never plans the original again.
  const notInMyGym = async (e) => {
    if (!confirm(`Mark “${e.name}” as unavailable? You'll get a similar ${e.bodyPart.toLowerCase()} exercise instead, and it won't be planned again. You can undo this in Settings.`)) return
    const body = info.plan ?? planned.filter((x) => !info.added.includes(x.id)).map((x) => x.id)
    setSwapping(true)
    setStatus('')
    try {
      const ctx = {
        exercises,
        blocked: new Set(data.blocked).add(e.id),
        dayIds: list.map((x) => x.id),
        lastDone: new Map([...last].map(([id, l]) => [id, l.day])),
      }
      let next, why
      try {
        const answer = await askAi('swap', swapRequest(e, swapCandidates(e, ctx), list))
        next = validateSwap(answer, e, ctx)
        why = typeof answer.why === 'string' ? answer.why.slice(0, 120) : ''
      } catch (err) {
        console.error(err)
      }
      const aiPick = Boolean(next)
      next ??= fallbackSwap(e, ctx)
      // save() resolves to undefined on failure; setBlocked succeeds with null
      if (await save(() => setBlocked(userId, e.id, true), (d) => ({ blocked: new Set(d.blocked).add(e.id) })) === undefined) return
      if (!next) return setStatus(`No similar ${e.bodyPart.toLowerCase()} exercise is left for “${e.name}”.`)
      if (!body.includes(e.id)) return
      await setOverride(today, { plan: body.map((id) => (id === e.id ? next.id : id)) })
      setStatus(`Replaced “${e.name}” with “${next.name}”${aiPick && why ? `: ${why}` : ''}${aiPick ? '' : ' (AI unavailable, picked by similar tags)'}.`)
    } finally {
      setSwapping(false)
    }
  }

  const skip = () => {
    const next = new Set(skipped).add(exercise.id)
    setSkipped(next)
    saveSkipped(today, next)
    advance(next)
  }

  const plain = (rs) => rs.map(({ reps, kg }) => ({ reps, kg }))
  const adjust = (field, delta, min) =>
    editPlan(exercise, (plan) => plan.map((r, k) => (k === cur ? { ...r, [field]: bump(r[field], delta, min) } : r)))
  const addSet = () => editPlan(exercise, () => [...plain(rows), { ...plain(rows).at(-1) }])
  const removeSet = () => editPlan(exercise, () => plain(rows.slice(0, -1)))

  // Saves the whole log of the exercise with this set added, copies its load to the sets still to
  // do, and starts the rest.
  const logSet = async () => {
    const set = rows[cur]
    const logged = [...rows.filter((r) => r.done), set]
    setBusy(true)
    const row = await save(
      () => saveLog(userId, { exercise_id: exercise.id, day: today, reps: logged.map((r) => r.reps), weights: logged.map((r) => r.kg) }),
      (d, row) => ({ logs: [...d.logs.filter((l) => l.id !== row.id), row] }),
    )
    setBusy(false)
    if (!row) return
    editPlan(exercise, () => plain(rows).map((r, k) => (k > cur ? { ...r, kg: set.kg } : r)))
    setStatus('')
    setRest(getRestSeconds())
  }

  // After the rest: stay while the exercise has sets left, else go to the next unfinished one.
  const endRest = () => {
    setRest(null)
    if (cur < 0) advance()
  }
  const restNext = () => {
    if (cur >= 0) return `Set ${cur + 1}, ${setText(exercise.units, rows[cur])}`
    const j = nextOpen(skipped)
    return j < 0 ? 'Finish the workout' : list[j].name
  }

  // The AI card. Started exercises stay; the rest of today's list is planned again.
  const replan = async ({ note, short }) => {
    const before = info.plan ?? planned.filter((e) => !info.added.includes(e.id)).map((e) => e.id)
    const result = await planWithAi([today], { note, short })
    const after = result.plans[today]
    setIndex(0)
    if (!after) return { headline: result.message || 'Nothing changed', changes: [] }
    const { headline, changes } = replanSummary(before, after, (id) => byId.get(id)?.name ?? '')
    return { headline, changes: result.focus ? [...changes, result.focus] : changes, undo: () => restorePlans(result.prev) }
  }

  const allDone = list.length > 0 && list.every((e) => isDone(e))
  const startedAny = list.some((e) => rowsOf(e).some((r) => r.done))
  const firstOpen = list.findIndex((e) => !isDone(e))
  const start = () => {
    if (allDone) return setScreen('summary')
    setIndex(Math.max(0, firstOpen))
    setScreen('workout')
  }
  const leave = () => { setRest(null); setScreen(null) }

  if (screen === 'workout' && exercise) {
    return (
      <Workout
        list={list} i={i} setIndex={setIndex} exercise={exercise} rows={rows} cur={cur}
        previous={last.get(exercise.id)} isDone={isDone} added={info.added.includes(exercise.id)}
        busy={busy} swapping={swapping} status={status}
        onLeave={leave} onLog={logSet} onAdjust={adjust} onAddSet={addSet} onRemoveSet={removeSet}
        onSkip={skip} onNotInMyGym={() => notInMyGym(exercise)} onRemoveAdded={() => removeAdded(exercise)}
        onFinish={() => setScreen('summary')}
        rest={rest} restNext={rest != null ? restNext() : ''} onEndRest={endRest}
      />
    )
  }

  if (screen === 'summary') {
    return <Summary data={data} today={today} info={info} byId={byId} done={done} onClose={() => setScreen(null)} />
  }

  const totalSets = list.reduce((n, e) => n + rowsOf(e).length, 0)
  const isRest = info.group === REST
  const family = familyOf(info.group)
  const week = weekOf(today, data.settings)

  return (
    <div className="page">
      <div className="stack">
        <div className="between">
          <span style={{ fontWeight: 600, fontSize: 18 }}>Routine</span>
          <button className="btn btn-ghost" onClick={() => setScreen('settings')}>Settings</button>
        </div>
        <div className="dateline">
          <span>{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span>Week {info.week} of 26 · Day {info.weekDay}</span>
        </div>
      </div>

      <div className="stack">
        <div className="kicker"><Plate group={info.group} />{isRest ? 'Rest day' : `${family ? `${family} day` : info.group}`}</div>
        <h1 className="headline"><Plated>{info.group}</Plated></h1>
        {list.length > 0 ? (
          <>
            <div style={{ fontSize: 15 }}>{list.length} exercises · about {minutesFor(totalSets)} min</div>
            <div className="segments" aria-hidden="true">
              {list.map((e) => <span key={e.id} className={isDone(e) ? 'on' : ''} />)}
            </div>
            <button className="btn btn-primary btn-lg btn-spread" style={{ marginTop: 4 }} onClick={start}>
              <span>{allDone ? 'Workout logged' : startedAny ? 'Continue workout' : 'Start workout'}</span>
              <span className="meta">{allDone ? 'View summary' : startedAny ? `Exercise ${firstOpen + 1}` : ''}</span>
            </button>
          </>
        ) : (
          <p className="muted-14" role="status">{waiting ? 'AI is planning today’s workout…' : 'Nothing planned. Enjoy the rest, or add an exercise.'}</p>
        )}
      </div>

      {list.length > 0 && <AiCard disabled={Boolean(ai.days)} onReplan={replan} />}

      <div>
        <div className="listhead">
          <h4>Today's exercises</h4>
          {list.length > 0 && <span className="muted">{list.filter((e) => isDone(e)).length} of {list.length} done</span>}
        </div>
        {list.map((e, j) => {
          const rs = rowsOf(e)
          const n = rs.filter((r) => r.done).length
          const status = skipped.has(e.id) ? ['Skipped', true] : n === rs.length ? ['Done'] : n ? [`${n} of ${rs.length}`] : []
          return (
            <button key={e.id} className="rowbtn" onClick={() => { setIndex(j); setScreen('workout') }}>
              <span className="idx">{j + 1}</span>
              <span>
                <span className="name">{e.name}</span>
                <span className="muted">{planText(e.units, rs)}{e.bodyPart === 'Core' && info.group !== 'Core' ? ' · core' : ''}</span>
              </span>
              <span className={status[1] ? 'status quiet' : 'status'}>{status[0]}</span>
            </button>
          )
        })}
        <button className="btn btn-ghost btn-start" style={{ marginTop: 6 }} onClick={() => openPicker(true)}>+ Add exercise</button>
      </div>

      <div className="stack stack-2">
        <h4 style={{ marginBottom: 8 }}>This week</h4>
        {week.map((day) => {
          const d = dayInfo(day, data.settings, data.overrides)
          if (!d) return null
          return (
            <div className="weekrow" key={day}>
              <span className="day">{formatDay(day, { weekday: 'short' })}</span>
              <Plate group={d.group} />
              <span className={day === today ? 'today' : ''}>{d.group}</span>
              <span className="note">{day === today ? 'Today' : ''}</span>
            </div>
          )
        })}
      </div>

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
    </div>
  )
}
