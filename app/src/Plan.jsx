import { addDays, dayInfo, daysBetween, formatDay, PLAN_WEEKS, REST } from './plan.js'
import { GroupSelect } from './ui.jsx'

export default function Plan({ exercises, data, setOverride, today, schedule, groups }) {
  const { settings, overrides } = data
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const planned = new Map(schedule.map((d) => [d.day, d]))
  const logged = new Map()
  for (const l of data.logs) logged.set(l.day, [...(logged.get(l.day) ?? []), byId.get(l.exercise_id)])
  const currentWeek = Math.floor(daysBetween(settings.start_date, today) / 7) + 1

  const weeks = Array.from({ length: PLAN_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, k) => addDays(settings.start_date, w * 7 + k)))

  return (
    <>
      <header className="top">
        <h1>26-week plan</h1>
        <p className="subtitle">Change a day's muscle group to reshuffle that week. Past days show what you logged.</p>
      </header>
      <main>
        {weeks.map((days, w) => (
          <details key={w} className="week" open={w + 1 === currentWeek}>
            <summary>
              Week {w + 1}
              <span>{formatDay(days[0], { day: 'numeric', month: 'short' })} – {formatDay(days[6], { day: 'numeric', month: 'short' })}</span>
            </summary>
            <ul className="list">
              {days.map((day) => {
                const info = dayInfo(day, settings, overrides)
                const past = day < today
                const items = past ? (logged.get(day) ?? []) : (planned.get(day)?.exercises ?? [])
                return (
                  <li key={day} className={day === today ? 'plan-day today' : 'plan-day'}>
                    <span className="plan-date">{formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <GroupSelect
                      groups={groups}
                      value={info.group}
                      disabled={past}
                      onChange={(g) => setOverride(day, { muscle_group: g })}
                      aria-label={`Muscle group for ${formatDay(day, { dateStyle: 'full' })}`}
                    />
                    <span className="plan-items">
                      {items.filter(Boolean).map((e) => e.name).join(' · ') ||
                        (info.group === REST ? 'Rest' : past ? 'Nothing logged' : '')}
                    </span>
                  </li>
                )
              })}
            </ul>
          </details>
        ))}
      </main>
    </>
  )
}
