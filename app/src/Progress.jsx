import { daysBetween } from './plan.js'

const fmt = (n) => Math.round(n).toLocaleString()

const MINUTES = { Minutes: 1, Seconds: 1 / 60 }

const empty = () => ({ days: new Set(), sets: 0, reps: 0, volume: 0, minutes: 0 })
// Strength sets add reps and volume; timed (cardio) sets add minutes.
function add(total, l, [amount, load]) {
  total.days.add(l.day)
  total.sets += l.reps.length
  l.reps.forEach((r, i) => {
    if (amount in MINUTES) total.minutes += r * MINUTES[amount]
    else total.reps += r
    if (load === 'kg') total.volume += r * Number(l.weights[i])
  })
}

export default function Progress({ exercises, data, groups }) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const byGroup = new Map(groups.map((g) => [g, empty()]))
  const byWeek = new Map()
  for (const l of data.logs) {
    const exercise = byId.get(l.exercise_id)
    if (!exercise) continue
    add(byGroup.get(exercise.bodyPart), l, exercise.units)
    const week = Math.floor(daysBetween(data.settings.start_date, l.day) / 7) + 1
    if (!byWeek.has(week)) byWeek.set(week, empty())
    add(byWeek.get(week), l, exercise.units)
  }
  const timed = [...byGroup.values()].some((t) => t.minutes)
  const weeks = [...byWeek].sort(([a], [b]) => b - a)
  const maxVolume = Math.max(1, ...weeks.map(([, t]) => t.volume))

  return (
    <>
      <header className="top">
        <h1>Progress</h1>
        <p className="subtitle">{data.logs.length} exercises logged. Volume = reps × kg, summed over every set.</p>
      </header>
      <main className="progress">
        {data.logs.length === 0 && <p className="empty">Log your first workout on the Today tab to see totals here.</p>}
        {data.logs.length > 0 && (
          <>
            <h2 className="section-head">By muscle group</h2>
            <table>
              <thead>
                <tr><th scope="col">Group</th><th scope="col">Days</th><th scope="col">Sets</th><th scope="col">Reps</th><th scope="col">Volume kg</th>{timed && <th scope="col">Minutes</th>}</tr>
              </thead>
              <tbody>
                {[...byGroup].filter(([, t]) => t.sets).map(([g, t]) => (
                  <tr key={g}><th scope="row">{g}</th><td>{t.days.size}</td><td>{fmt(t.sets)}</td><td>{fmt(t.reps)}</td><td>{fmt(t.volume)}</td>{timed && <td>{fmt(t.minutes)}</td>}</tr>
                ))}
              </tbody>
            </table>

            <h2 className="section-head">By week</h2>
            <ul className="weeks">
              {weeks.map(([w, t]) => (
                <li key={w}>
                  <span>Week {w}</span>
                  <span className="bar" aria-hidden="true"><span style={{ width: `${(t.volume / maxVolume) * 100}%` }} /></span>
                  <span>{fmt(t.sets)} sets · {fmt(t.volume)} kg{t.minutes > 0 && ` · ${fmt(t.minutes)} min cardio`}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  )
}
