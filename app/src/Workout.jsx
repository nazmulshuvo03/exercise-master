import { useEffect, useRef, useState } from 'react'
import { ExerciseInfo, musclesOf, Plate, Plated, Stepper } from './ui.jsx'
import { loadStep, lastText, repStep, setText } from './workout.js'

// Countdown over the workout. It counts to a deadline, so a phone that sleeps mid-rest still shows
// the right time. When it runs out (or "Skip rest" is tapped) onDone moves on.
function RestSheet({ seconds, next, onDone }) {
  const [end, setEnd] = useState(() => Date.now() + seconds * 1000)
  const [total, setTotal] = useState(seconds)
  const [now, setNow] = useState(() => Date.now())
  const finish = useRef(onDone)
  useEffect(() => { finish.current = onDone })
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, Math.ceil((end - now) / 1000))
  useEffect(() => { if (left === 0) finish.current() }, [left])
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Rest">
        <div className="kicker">Rest</div>
        <div style={{ fontSize: 112, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          <Plated kind="num">{text}</Plated>
        </div>
        <div className="bar"><div style={{ width: `${(left / total) * 100}%` }} /></div>
        <div style={{ fontSize: 15 }}>Next: {next}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setEnd((e) => e + 15000); setTotal((t) => Math.max(t, left + 15)) }}>+15 s</button>
          <button className="btn btn-primary" style={{ flex: 2 }} autoFocus onClick={onDone}>Skip rest</button>
        </div>
      </div>
    </div>
  )
}

// The set being done now: steppers for the amount and the load, then the log button.
function SetNow({ exercise, set, n, busy, onAdjust, onLog }) {
  const [amount, load] = exercise.units
  const bw = load === 'kg' && set.kg === 0
  return (
    <div className="setnow">
      <div className="kicker">Set {n} · now</div>
      <div className={load ? 'steppers' : 'steppers one'}>
        <Stepper label={amount} value={set.reps} onMinus={() => onAdjust('reps', -repStep(exercise.units), 1)} onPlus={() => onAdjust('reps', repStep(exercise.units), 1)} />
        {load && (
          <Stepper
            label={bw ? 'Added kg' : load}
            value={bw ? 'BW' : set.kg}
            onMinus={() => onAdjust('kg', -loadStep(exercise.units), 0)}
            onPlus={() => onAdjust('kg', loadStep(exercise.units), 0)}
          />
        )}
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy} onClick={onLog}>Log set {n}</button>
    </div>
  )
}

export default function Workout({
  list, i, setIndex, exercise, rows, cur, previous, isDone, added, busy, swapping, status,
  onLeave, onLog, onAdjust, onAddSet, onRemoveSet, onSkip, onNotInMyGym, onRemoveAdded, onFinish,
  rest, restNext, onEndRest,
}) {
  const last = i === list.length - 1
  return (
    <>
      <div className="page gap-22" style={{ paddingTop: 4 }}>
        <div className="between">
          <button className="btn btn-ghost" onClick={onLeave}>‹ Today</button>
          <span className="muted">Exercise {i + 1} of {list.length}</span>
        </div>
        <div className="segments" style={{ marginTop: -8 }}>
          {list.map((e, j) => (
            <button key={e.id} onClick={() => setIndex(j)} aria-label={`Exercise ${j + 1}, ${e.name}`} aria-current={j === i ? 'step' : undefined}>
              <span className={isDone(e) ? 'on' : j === i ? 'now' : ''} />
            </button>
          ))}
        </div>

        <div className="stack stack-6">
          <div className="kicker"><Plate group={exercise.bodyPart} />{exercise.bodyPart}</div>
          <h2 style={{ fontSize: 30 }} className="balance">{exercise.name}</h2>
          <div className="muted-14">{musclesOf(exercise)}</div>
          <div style={{ fontSize: 14 }}>{previous ? `Last time: ${lastText(exercise.units, previous)}` : 'First time'}</div>
        </div>

        <div>
          {rows.map((r, k) => (k === cur
            ? <SetNow key={k} exercise={exercise} set={r} n={k + 1} busy={busy} onAdjust={onAdjust} onLog={onLog} />
            : (
              <div key={k} className={r.done ? 'setrow done' : 'setrow'}>
                <span className="n">Set {k + 1}</span>
                <span className="num">{setText(exercise.units, r)}</span>
                <span className="st">{r.done ? 'Logged' : ''}</span>
              </div>
            )))}
          {cur < 0 && <div className="accent-text" style={{ paddingTop: 14 }} role="status">All sets logged.</div>}
        </div>

        <div className="wrap">
          <button className="btn btn-secondary" onClick={onAddSet} disabled={rows.length >= 50}>+ Set</button>
          <button className="btn btn-secondary" onClick={onRemoveSet} disabled={rows.length <= 1 || rows.at(-1).done}>− Set</button>
          <button className="btn btn-ghost" onClick={onSkip}>Skip today</button>
          {added
            ? <button className="btn btn-ghost" onClick={onRemoveAdded}>Remove from today</button>
            : <button className="btn btn-ghost" disabled={swapping} onClick={onNotInMyGym}>{swapping ? 'Finding a replacement…' : 'Not in my gym'}</button>}
        </div>
        {status && <p className="muted-14 balance" role="status">{status}</p>}

        <ExerciseInfo exercise={exercise} />
      </div>

      <div className="pager">
        <button className="btn btn-secondary" disabled={i === 0} onClick={() => setIndex(i - 1)}>‹ Previous</button>
        <span className="num" style={{ fontSize: 14 }}>{i + 1} / {list.length}</span>
        <button className="btn btn-secondary" onClick={() => (last ? onFinish() : setIndex(i + 1))}>{last ? 'Finish' : 'Next ›'}</button>
      </div>

      {rest != null && <RestSheet seconds={rest} next={restNext} onDone={onEndRest} />}
    </>
  )
}
