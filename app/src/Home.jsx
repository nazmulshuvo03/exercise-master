import { dayInfo, formatDay, REST, weekOf } from './plan.js'

export default function Home({ data, today, schedule, go, ai, planWithAi }) {
  const { settings, overrides } = data
  const info = dayInfo(today, settings, overrides)

  if (!info) {
    return (
      <>
        <header className="top"><h1>Exercise Book</h1></header>
        <main className="home">
          <p className="empty">Your 26-week plan is not running today. Change the start date in Settings.</p>
          <div className="home-actions">
            <button className="home-action" onClick={() => go('Plan')}><b>See plan</b><span>All 26 weeks</span></button>
            <button className="home-action" onClick={() => go('Settings')}><b>Settings</b><span>Start date and week</span></button>
          </div>
        </main>
      </>
    )
  }

  const doneIds = new Set(data.logs.filter((l) => l.day === today).map((l) => l.exercise_id))
  const plannedIds = (schedule[0]?.day === today ? schedule[0].exercises : []).map((e) => e.id)
  const total = new Set([...plannedIds, ...doneIds]).size
  const week = weekOf(today, settings)
  const rest = info.group === REST
  const waiting = ai.days?.includes(today) && !info.plan

  return (
    <>
      <header className="top">
        <h1>{formatDay(today, { weekday: 'long' })}</h1>
        <p className="subtitle">{formatDay(today, { day: 'numeric', month: 'long' })}, week {info.week} of 26</p>
      </header>
      <main className="home">
        <section className="home-today" data-group={info.group} aria-label="Today">
          <p className="home-label">Today</p>
          <p className="home-group">{rest ? 'Rest day' : info.group}</p>
          {!rest && (
            <>
              <p className="subtitle">{doneIds.size} of {total} exercises done</p>
              <div className="bar" aria-hidden="true"><span style={{ width: `${total ? (100 * doneIds.size) / total : 0}%` }} /></div>
            </>
          )}
        </section>

        <div className="home-actions">
          <button className="home-action primary-action" onClick={() => go('Today')}>
            <b>{rest ? 'Open today' : doneIds.size ? 'Continue workout' : 'Start workout'}</b>
            <span>{rest ? 'Add an exercise if you want' : waiting ? 'AI is planning it…' : `${total} exercises`}</span>
          </button>
          <button className="home-action" onClick={() => go('Plan')}><b>See plan</b><span>All 26 weeks</span></button>
          <button className="home-action" disabled={Boolean(ai.days)} onClick={() => planWithAi(week)}>
            <b>{ai.days ? 'AI is planning…' : 'Re-plan week with AI'}</b><span>Rest of this week</span>
          </button>
          <button className="home-action" onClick={() => go('Progress')}><b>Progress</b><span>Sets, reps, weight</span></button>
        </div>
        {ai.message && <p className="hint home-message" role="status">{ai.message}</p>}

        <h2 className="home-label">This week</h2>
        <ul className="week-strip">
          {week.map((day) => {
            const d = dayInfo(day, settings, overrides)
            return (
              <li key={day} data-group={d.group} aria-current={day === today ? 'date' : undefined} className={day < today ? 'past' : undefined}>
                <span>{formatDay(day, { weekday: 'short' })}</span>
                <b>{d.group === REST ? 'Rest' : d.group}</b>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
