import { daysBetween } from './plan.js'
import { Plate } from './ui.jsx'

const fmt = (n) => Math.round(n).toLocaleString('en-GB')
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

export default function Progress({ exercises, data, groups, today }) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const weekOf = (day) => Math.floor(daysBetween(data.settings.start_date, day) / 7) + 1
  const thisWeek = weekOf(today)
  const byWeek = new Map()
  const lastWeek = new Map(groups.map((g) => [g, empty()]))
  const best = new Map() // exercise id -> its heaviest set, ranked by estimated one-rep max
  for (const l of data.logs) {
    const e = byId.get(l.exercise_id)
    if (!e) continue
    const w = weekOf(l.day)
    if (!byWeek.has(w)) byWeek.set(w, empty())
    add(byWeek.get(w), l, e.units)
    if (w === thisWeek - 1) add(lastWeek.get(e.bodyPart), l, e.units)
    if (e.units[0] === 'Reps' && e.units[1] === 'kg') {
      l.reps.forEach((reps, i) => {
        const kg = Number(l.weights[i])
        const score = kg * (1 + reps / 30)
        if (kg > 0 && score > (best.get(e.id)?.score ?? 0)) best.set(e.id, { name: e.name, kg, reps, score })
      })
    }
  }

  const now = byWeek.get(thisWeek) ?? empty()
  const weeks = [...byWeek].sort(([a], [b]) => a - b).slice(-8)
  const maxVolume = Math.max(1, ...weeks.map(([, t]) => t.volume))
  const rows = [...lastWeek].filter(([, t]) => t.sets)
  const timed = rows.some(([, t]) => t.minutes)
  const bests = [...best.values()].sort((a, b) => b.score - a.score).slice(0, 5)

  return (
    <div className="page gap-34" style={{ paddingTop: 10 }}>
      <div className="stack stack-10">
        <h2>Progress</h2>
        <p className="muted-14">Volume is reps × kg, summed over every set.</p>
      </div>
      {data.logs.length === 0 && <p className="muted-14">Log your first workout on the Today tab to see totals here.</p>}
      {data.logs.length > 0 && (
        <>
          <div className="stats">
            <div className="stat"><b>{now.days.size}</b><span className="muted">sessions this week</span></div>
            <div className="stat"><b>{fmt(now.sets)}</b><span className="muted">sets this week</span></div>
            <div className="stat"><b>{fmt(now.volume)}</b><span className="muted">kg this week</span></div>
          </div>

          <div className="stack">
            <h4>Volume by week</h4>
            {weeks.map(([w, t]) => (
              <div className="meter" key={w} style={{ gridTemplateColumns: '64px minmax(0, 1fr) 84px' }}>
                <span>Week {w}</span>
                <span className="track" aria-hidden="true"><span style={{ width: `${(t.volume / maxVolume) * 100}%` }} /></span>
                <span className="val">{fmt(t.volume)}</span>
              </div>
            ))}
          </div>

          <div className="stack stack-10">
            <h4>Last week by muscle group</h4>
            {rows.length === 0
              ? <p className="muted-14">Nothing was logged last week.</p>
              : (
                <table className="table">
                  <thead>
                    <tr><th>Group</th><th className="r">Sets</th><th className="r">Reps</th><th className="r">kg</th>{timed && <th className="r">Min</th>}</tr>
                  </thead>
                  <tbody>
                    {rows.map(([g, t]) => (
                      <tr key={g}>
                        <td><span className="kicker" style={{ fontSize: 14, letterSpacing: 0, textTransform: 'none' }}><Plate group={g} />{g}</span></td>
                        <td className="r">{fmt(t.sets)}</td><td className="r">{fmt(t.reps)}</td><td className="r">{fmt(t.volume)}</td>
                        {timed && <td className="r">{fmt(t.minutes)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>

          {bests.length > 0 && (
            <div className="stack stack-2">
              <h4 style={{ marginBottom: 6 }}>Best sets</h4>
              {bests.map((b) => (
                <div className="between" key={b.name} style={{ padding: '8px 0', fontSize: 15 }}>
                  <span>{b.name}</span><span className="num" style={{ whiteSpace: 'nowrap' }}>{b.kg} kg × {b.reps}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
