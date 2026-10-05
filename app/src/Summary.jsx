import { addDays, dayInfo, formatDay, REST } from './plan.js'
import { Plate, Plated } from './ui.jsx'
import { volumeOf } from './workout.js'

const fmt = (n) => Math.round(n).toLocaleString('en-GB')

// Shown after the last exercise: today's totals next to the last session of the same group.
export default function Summary({ data, today, info, byId, done, onClose }) {
  const logs = [...done.values()]
  const volume = volumeOf(logs, byId)
  const sets = logs.reduce((n, l) => n + l.reps.length, 0)
  const reps = logs.reduce((n, l) => n + (byId.get(l.exercise_id)?.units[0] === 'Reps' ? l.reps.reduce((a, b) => a + b, 0) : 0), 0)

  // the latest earlier day that trained today's group, with everything logged on it
  const sameGroup = data.logs.filter((l) => l.day < today && byId.get(l.exercise_id)?.bodyPart === info.group)
  const lastDay = sameGroup.reduce((d, l) => (l.day > d ? l.day : d), '')
  const lastVolume = lastDay && volumeOf(data.logs.filter((l) => l.day === lastDay), byId)

  const tomorrow = dayInfo(addDays(today, 1), data.settings, data.overrides)

  return (
    <div className="page gap-30">
      <div className="stack stack-10">
        <div className="kicker">{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })} · Workout logged</div>
        <h1 style={{ fontSize: 52 }}>{info.group === REST ? 'Workout' : info.group}, done.</h1>
      </div>
      <div className="stack stack-10">
        <span className="muted">Volume, kg</span>
        <div style={{ fontSize: 96, fontWeight: 600 }}><Plated kind="num">{fmt(volume)}</Plated></div>
        <span style={{ fontSize: 14 }}>
          {lastDay ? `Last ${info.group.toLowerCase()} day: ${fmt(lastVolume)} kg` : `First ${info.group.toLowerCase()} day logged`}
        </span>
      </div>
      <div className="stats">
        <div className="stat big"><b>{logs.length}</b><span className="muted">exercises</span></div>
        <div className="stat big"><b>{sets}</b><span className="muted">sets</span></div>
        <div className="stat big"><b>{fmt(reps)}</b><span className="muted">reps</span></div>
      </div>
      {tomorrow && (
        <div className="stack stack-6">
          <h4>Tomorrow</h4>
          <div className="kicker" style={{ fontSize: 18, letterSpacing: 0, textTransform: 'none' }}><Plate group={tomorrow.group} />{tomorrow.group}</div>
        </div>
      )}
      <button className="btn btn-primary btn-lg" onClick={onClose}>Back to Today</button>
    </div>
  )
}
