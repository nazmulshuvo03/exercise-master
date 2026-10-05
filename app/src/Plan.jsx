import { useState } from 'react'
import { addDays, dayInfo, daysBetween, formatDay, PLAN_WEEKS, planEnd, REST } from './plan.js'
import { GroupSelect, Plate } from './ui.jsx'

// "Re-plan week with AI" for the current week: idle, busy, then the result with an Undo.
function WeekCard({ week, days, ai, planned, planWithAi, restorePlans }) {
  const [phase, setPhase] = useState('idle')
  const [result, setResult] = useState(null)
  const busy = phase === 'busy' || Boolean(ai.days?.some((d) => days.includes(d)))

  const run = async () => {
    setPhase('busy')
    setResult(await planWithAi(days))
    setPhase('done')
  }
  const undo = async () => {
    await restorePlans(result.prev)
    setPhase('idle')
  }

  return (
    <section className="card" style={{ padding: 18, gap: 10 }} aria-label="Re-plan this week">
      <div className="card-kicker">Week {week} · this week</div>
      {busy && <div style={{ fontSize: 16, fontWeight: 600 }} role="status">Re-planning week {week}…</div>}
      {!busy && phase !== 'done' && (
        <div className="stack stack-10">
          <div style={{ fontSize: 14 }}>{planned ? 'Re-plan' : 'Plan'} the rest of this week from your logs so far.</div>
          <button className="btn btn-primary btn-start" onClick={run}>{planned ? 'Re-plan week with AI' : 'Plan week with AI'}</button>
        </div>
      )}
      {!busy && phase === 'done' && (
        <div className="stack stack-10" role="status">
          <div style={{ fontSize: 14 }}>{result.message || 'Nothing changed.'}</div>
          <div className="wrap">
            {Object.keys(result.plans).length > 0 && <button className="btn btn-secondary" onClick={undo}>Undo</button>}
            <button className="btn btn-ghost" onClick={() => setPhase('idle')}>Done</button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function Plan({ exercises, data, setOverride, today, schedule, groups, ai, planWithAi, restorePlans }) {
  const { settings, overrides } = data
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const planned = new Map(schedule.map((d) => [d.day, d]))
  const logged = new Map()
  for (const l of data.logs) logged.set(l.day, [...(logged.get(l.day) ?? []), byId.get(l.exercise_id)])
  const currentWeek = Math.floor(daysBetween(settings.start_date, today) / 7) + 1
  const [open, setOpen] = useState({ [currentWeek]: true })

  const weeks = Array.from({ length: PLAN_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, k) => addDays(settings.start_date, w * 7 + k)))
  const short = { day: 'numeric', month: 'short' }

  return (
    <div className="page gap-26" style={{ paddingTop: 10 }}>
      <div className="stack stack-10">
        <h2>26-week plan</h2>
        <p className="muted-14 balance">
          {formatDay(settings.start_date, { day: 'numeric', month: 'long', year: 'numeric' })} to {formatDay(addDays(planEnd(settings), -1), { day: 'numeric', month: 'long', year: 'numeric' })}.
          {' '}AI plans each week's exercises when the week starts. Past days show what you logged.
        </p>
      </div>

      {currentWeek >= 1 && currentWeek <= PLAN_WEEKS && (
        <WeekCard
          week={currentWeek} days={weeks[currentWeek - 1]} ai={ai} planWithAi={planWithAi} restorePlans={restorePlans}
          planned={weeks[currentWeek - 1].some((d) => overrides[d]?.plan)}
        />
      )}

      <div>
        {weeks.map((days, w) => {
          const n = w + 1
          const isOpen = Boolean(open[n])
          const status = n === currentWeek ? 'This week' : days.some((d) => logged.has(d)) ? 'Logged' : ''
          return (
            <div key={n}>
              <button className="weekhead" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [n]: !o[n] }))}>
                <span><b>Week {n}</b><span className="status">{status}</span></span>
                <span className="muted">{formatDay(days[0], short)} – {formatDay(days[6], short)}</span>
              </button>
              {isOpen && (
                <div className="stack stack-20" style={{ padding: '4px 0 22px' }}>
                  {days.map((day) => {
                    const info = dayInfo(day, settings, overrides)
                    const past = day < today
                    const planning = ai.days?.includes(day) && !info.plan
                    // Only AI (or swapped) lists are shown ahead of time. The preset rotation is just the
                    // fallback for this week's days the AI could not plan.
                    const shown = info.plan || (n === currentWeek && !planning)
                    const items = past ? (logged.get(day) ?? [])
                      : (planned.get(day)?.exercises ?? []).filter((e) => shown || info.added.includes(e.id))
                    const detail = items.filter(Boolean).map((e) => e.name).join(', ')
                      || (info.group === REST ? 'Rest' : past ? 'Nothing logged' : planning ? 'AI is planning…' : `Planned by AI on ${formatDay(days[0], short)}.`)
                    return (
                      <div className="planday" key={day}>
                        <div>
                          <Plate group={info.group} />
                          <span className="label">{formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                          <GroupSelect
                            groups={groups}
                            value={info.group}
                            disabled={past}
                            onChange={(g) => setOverride(day, { muscle_group: g })}
                            aria-label={`Muscle group for ${formatDay(day, { dateStyle: 'full' })}`}
                          />
                        </div>
                        <div className="detail">
                          {detail}
                          {!past && info.plan && (
                            <>
                              {' '}
                              <button className="btn btn-ghost" disabled={Boolean(ai.days)} onClick={() => planWithAi([day])}
                                aria-label={`Re-plan ${formatDay(day, { dateStyle: 'full' })} with AI`}>
                                {ai.days?.includes(day) ? 'Planning…' : 'Re-plan'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
