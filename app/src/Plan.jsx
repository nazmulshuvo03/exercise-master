import { useState } from 'react'
import { addDays, dayInfo, daysBetween, formatDay, REST, weekOf } from './plan.js'
import { GroupSelect, Plate } from './ui.jsx'

const SHORT = { day: 'numeric', month: 'short' }

// "Re-plan week with AI": idle, busy, then the result with an Undo.
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
  const [open, setOpen] = useState({})

  const thisWeek = currentWeek >= 1 ? weekOf(today, settings) : []
  // finished weeks, newest first
  const pastWeeks = Array.from({ length: Math.max(0, currentWeek - 1) }, (_, k) => currentWeek - 1 - k)
    .map((n) => ({ n, days: Array.from({ length: 7 }, (_, d) => addDays(settings.start_date, (n - 1) * 7 + d)) }))

  const names = (items) => items.filter(Boolean).map((e) => e.name)

  return (
    <div className="page gap-26" style={{ paddingTop: 10 }}>
      <div className="stack stack-10">
        <h2>Plan</h2>
        <p className="muted-14 balance">AI plans each week's exercises when the week starts. Past weeks show what you logged.</p>
      </div>

      {currentWeek < 1 && <p className="muted-14">Your plan starts {formatDay(settings.start_date, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>}

      {thisWeek.length > 0 && (
        <>
          <WeekCard
            week={currentWeek} days={thisWeek} ai={ai} planWithAi={planWithAi} restorePlans={restorePlans}
            planned={thisWeek.some((d) => overrides[d]?.plan)}
          />
          <div className="stack stack-20">
            <h4>This week · {formatDay(thisWeek[0], SHORT)} – {formatDay(thisWeek[6], SHORT)}</h4>
            {thisWeek.map((day) => {
              const info = dayInfo(day, settings, overrides)
              const past = day < today
              const planning = ai.days?.includes(day) && !info.plan
              const items = past ? names(logged.get(day) ?? []) : names((planned.get(day)?.exercises ?? []).filter((e) => !planning || info.added.includes(e.id)))
              const empty = info.group === REST ? 'Rest' : past ? 'Nothing logged' : planning ? 'AI is planning…' : 'Not planned yet'
              return (
                <div className="planday" key={day}>
                  <div>
                    <Plate group={info.group} />
                    <span className={day === today ? 'label accent-text' : 'label'}>{formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <GroupSelect
                      groups={groups}
                      value={info.group}
                      disabled={past}
                      onChange={(g) => setOverride(day, { muscle_group: g })}
                      aria-label={`Muscle group for ${formatDay(day, { dateStyle: 'full' })}`}
                    />
                  </div>
                  <div className="detail">
                    {items.length ? items.map((n, k) => <div key={k}>{n}</div>) : empty}
                    {!past && info.plan && (
                      <button className="btn btn-ghost" disabled={Boolean(ai.days)} onClick={() => planWithAi([day])}
                        aria-label={`Re-plan ${formatDay(day, { dateStyle: 'full' })} with AI`}>
                        {ai.days?.includes(day) ? 'Planning…' : 'Re-plan'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {pastWeeks.length > 0 && (
        <div>
          <h4 style={{ marginBottom: 4 }}>Past weeks</h4>
          {pastWeeks.map(({ n, days }) => {
            const isOpen = Boolean(open[n])
            return (
              <div key={n}>
                <button className="weekhead" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [n]: !o[n] }))}>
                  <span><b>Week {n}</b><span className="status">{days.some((d) => logged.has(d)) ? 'Logged' : ''}</span></span>
                  <span className="muted">{formatDay(days[0], SHORT)} – {formatDay(days[6], SHORT)}</span>
                </button>
                {isOpen && (
                  <div className="stack stack-20" style={{ padding: '4px 0 22px' }}>
                    {days.map((day) => {
                      const info = dayInfo(day, settings, overrides)
                      const items = names(logged.get(day) ?? [])
                      return (
                        <div className="planday" key={day}>
                          <div>
                            <Plate group={info.group} />
                            <span className="label">{formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                            <span>{info.group}</span>
                          </div>
                          <div className="detail">{items.length ? items.join(', ') : info.group === REST ? 'Rest' : 'Nothing logged'}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
