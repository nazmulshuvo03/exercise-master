import { addDays, dayInfo, daysBetween, formatDay, PLAN_WEEKS, REST } from './plan.js'
import { GroupSelect } from './ui.jsx'

export default function Plan({ exercises, data, setOverride, today, schedule, groups, ai, planWithAi }) {
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
        <p className="subtitle">AI plans each week's exercises when the week starts, or earlier with the week's button. Past days show what you logged.</p>
        {ai.message && <p className="hint" role="status">{ai.message}</p>}
      </header>
      <main>
        {weeks.map((days, w) => (
          <details key={w} className="week" open={w + 1 === currentWeek}>
            <summary>
              Week {w + 1}
              <span>{formatDay(days[0], { day: 'numeric', month: 'short' })} – {formatDay(days[6], { day: 'numeric', month: 'short' })}</span>
            </summary>
            {days[6] >= today && (
              <div className="week-actions">
                <button className="secondary" disabled={Boolean(ai.days)} onClick={() => planWithAi(days)}>
                  {ai.days?.some((d) => days.includes(d)) ? 'Planning…' : days.some((d) => overrides[d]?.plan) ? 'Re-plan week with AI' : 'Plan week with AI'}
                </button>
              </div>
            )}
            <ul className="list">
              {days.map((day) => {
                const info = dayInfo(day, settings, overrides)
                const past = day < today
                const planning = ai.days?.includes(day) && !info.plan
                // Only AI (or swapped) lists are shown ahead of time. The preset rotation is just the
                // fallback for this week's days the AI could not plan.
                const shown = info.plan || (w + 1 === currentWeek && !planning)
                const items = past ? (logged.get(day) ?? [])
                  : (planned.get(day)?.exercises ?? []).filter((e) => shown || info.added.includes(e.id))
                return (
                  <li key={day} data-group={info.group} className={day === today ? 'plan-day today' : 'plan-day'}>
                    <span className="plan-date">{formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <GroupSelect
                      groups={groups}
                      value={info.group}
                      disabled={past}
                      onChange={(g) => setOverride(day, { muscle_group: g })}
                      aria-label={`Muscle group for ${formatDay(day, { dateStyle: 'full' })}`}
                    />
                    <span className="plan-items">
                      {items.filter(Boolean).map((e) => e.name).join(', ') ||
                        (info.group === REST ? 'Rest' : past ? 'Nothing logged' : planning ? 'AI is planning…' : 'Not planned yet')}
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
