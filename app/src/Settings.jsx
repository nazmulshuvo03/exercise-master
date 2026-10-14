import { useEffect, useRef, useState } from 'react'
import { saveSettings, setBlocked } from './data.js'
import { getRestSeconds, getRestTimer, REST_STEP, setRestSeconds, setRestTimer } from './local.js'
import { addDays, CORE, formatDay } from './plan.js'
import { supabase } from './supabase.js'
import { GroupSelect, Plate, Stepper } from './ui.jsx'

// jsonb may reorder keys, so compare settings in a fixed order.
const norm = (s) => JSON.stringify([s.start_date, s.goal, s.week, Object.entries(s.main_counts).sort(), Object.entries(s.core_counts).sort()])
const clamp = (n) => Math.max(0, Math.min(12, n))
const SAVE_DELAY = 600

export default function Settings({ exercises, data, userId, save, groups, email, setScreen }) {
  const [form, setForm] = useState(() => ({ ...data.settings }))
  const [rest, setRest] = useState(getRestSeconds)
  const [timer, setTimer] = useState(getRestTimer)
  const mainGroups = groups.filter((g) => g !== CORE)
  const latest = useRef(form)
  useEffect(() => { latest.current = form }) // first, so the save below reads this render's form
  const saved = useRef(norm(data.settings)) // what the database holds, as far as this page knows

  // Changes save by themselves: shortly after the last edit, and at once when leaving the page.
  const flush = () => {
    const { start_date, goal, week, main_counts, core_counts } = latest.current
    if (!start_date || norm(latest.current) === saved.current) return
    saved.current = norm(latest.current)
    return save(() => saveSettings(userId, { start_date, goal, week, main_counts, core_counts }), (_d, settings) => ({ settings }))
  }
  useEffect(() => {
    const t = setTimeout(flush, SAVE_DELAY)
    return () => clearTimeout(t)
  }, [form]) // eslint-disable-line react-hooks/exhaustive-deps -- flush reads the latest form through a ref
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setCount = (key, group, delta) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [group]: clamp((f[key][group] ?? (key === 'main_counts' ? 7 : 0)) + delta) } }))

  const blocked = exercises.filter((e) => data.blocked.has(e.id))
  const unblock = (id) => save(() => setBlocked(userId, id, false), (d) => {
    const next = new Set(d.blocked)
    next.delete(id)
    return { blocked: next }
  })
  const longDay = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }

  return (
    <div className="page">
      <div className="stack stack-6">
        <button className="btn btn-ghost btn-start" onClick={() => setScreen(null)}>‹ Today</button>
        <h2>Settings</h2>
        <span className="muted">Changes save as you make them.</span>
      </div>

      <div className="stack stack-10">
        <h4>Plan</h4>
        <div className="field">
          <label htmlFor="start">Start date</label>
          <input id="start" className="input input-lg" type="date" required value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
        </div>
        <span className="muted balance">
          {form.start_date
            ? `Starts ${formatDay(form.start_date, longDay)}. Every week starts on this weekday.`
            : 'The plan starts here. Every week starts on this weekday.'}
        </span>
      </div>

      <div className="stack stack-10">
        <div className="field">
          <label htmlFor="goal">Goal</label>
          <select id="goal" className="input input-lg" value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}>
            <option value="bulk">Bulk: build muscle in a calorie surplus</option>
            <option value="maintain">Maintain</option>
            <option value="cut">Cut: keep muscle in a calorie deficit</option>
          </select>
        </div>
        <span className="muted balance">The AI picks sets, reps and load for this goal.</span>
      </div>

      <div className="stack stack-2">
        <h4 style={{ marginBottom: 6 }}>Usual week</h4>
        {form.week.map((g, i) => (
          <div className="usual" key={i}>
            <Plate group={g} />
            <b><label htmlFor={`week-${i}`}>{form.start_date ? formatDay(addDays(form.start_date, i), { weekday: 'long' }) : `Day ${i + 1}`}</label></b>
            <GroupSelect
              id={`week-${i}`}
              groups={groups}
              value={g}
              onChange={(v) => setForm((f) => ({ ...f, week: f.week.map((x, j) => (j === i ? v : x)) }))}
            />
          </div>
        ))}
      </div>

      <div className="stack stack-2">
        <h4>Exercises per day</h4>
        <span className="muted" style={{ marginBottom: 8 }}>Main exercises come from the day's group. Core exercises are added on top. The AI may plan up to 2 more or fewer main exercises, and 1 more or fewer core, from your history.</span>
        <div className="counts head"><span>Group</span><span>Main</span><span>Core</span></div>
        {mainGroups.map((g) => (
          <div className="counts" key={g}>
            <span style={{ fontSize: 15 }}>{g}</span>
            <Stepper small value={form.main_counts[g] ?? 7} onMinus={() => setCount('main_counts', g, -1)} onPlus={() => setCount('main_counts', g, 1)} name={`${g} main exercises`} />
            <Stepper small value={form.core_counts[g] ?? 0} onMinus={() => setCount('core_counts', g, -1)} onPlus={() => setCount('core_counts', g, 1)} name={`${g} core exercises`} />
          </div>
        ))}
      </div>

      <div className="stack stack-6">
        <h4>Rest between sets</h4>
        <label className="between" style={{ fontSize: 15 }}>
          <span>Rest timer after each set</span>
          <input type="checkbox" checked={timer} onChange={(e) => { setTimer(e.target.checked); setRestTimer(e.target.checked) }} />
        </label>
        {!timer && <span className="muted balance">Off: rest on your own and log sets whenever suits you, one by one or all at once.</span>}
        {timer && <div className="between">
          <span className="muted balance">The countdown starts after each logged set.</span>
          <div style={{ width: 150, flex: 'none' }}>
            <Stepper
              small name="rest time" value={`${rest} s`}
              onMinus={() => { const s = Math.max(REST_STEP, rest - REST_STEP); setRest(s); setRestSeconds(s) }}
              onPlus={() => { const s = Math.min(300, rest + REST_STEP); setRest(s); setRestSeconds(s) }}
            />
          </div>
        </div>}
      </div>

      <div className="stack stack-6">
        <h4>Not in my gym</h4>
        {blocked.length === 0 && <span className="muted-14 balance">None. During a workout, tap “Not in my gym” on an exercise your gym can't do and it won't be planned again.</span>}
        {blocked.map((e) => (
          <div className="between" key={e.id} style={{ padding: '4px 0', fontSize: 15 }}>
            <span>{e.name}</span>
            <button className="btn btn-ghost" onClick={() => unblock(e.id)}>Restore</button>
          </div>
        ))}
      </div>

      <div className="stack stack-10">
        <h4>Account</h4>
        <div className="between">
          <span style={{ fontSize: 14 }}>Signed in as {email}</span>
          <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
