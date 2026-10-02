import { useState } from 'react'
import { saveSettings, setBlocked } from './data.js'
import { addDays, CORE, formatDay, planEnd } from './plan.js'
import { supabase } from './supabase.js'
import { GroupSelect } from './ui.jsx'

export default function Settings({ exercises, data, userId, save, groups, email }) {
  const [form, setForm] = useState(() => ({ ...data.settings }))
  const [busy, setBusy] = useState(false)
  const mainGroups = groups.filter((g) => g !== CORE)
  const changed = JSON.stringify(form) !== JSON.stringify(data.settings)

  const setCount = (key, group) => (e) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [group]: Number(e.target.value) } }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { start_date, week, main_counts, core_counts } = form
    const settings = await save(() => saveSettings(userId, { start_date, week, main_counts, core_counts }), (_d, settings) => ({ settings }))
    if (settings) setForm({ ...settings }) // jsonb may reorder keys, so re-sync from the saved row
    setBusy(false)
  }

  const blocked = exercises.filter((e) => data.blocked.has(e.id))
  const unblock = (id) => save(() => setBlocked(userId, id, false), (d) => {
    const next = new Set(d.blocked)
    next.delete(id)
    return { blocked: next }
  })

  return (
    <>
      <header className="top"><h1>Settings</h1></header>
      <main className="settings">
        <form onSubmit={submit}>
          <h2 className="section-head">Plan</h2>
          <div className="field-group">
            <label className="field">
              Start date
              <input type="date" required value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </label>
            <p className="hint">
              {form.start_date
                ? `Runs ${formatDay(form.start_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} to ${formatDay(addDays(planEnd(form), -1), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Every week starts on this weekday.`
                : 'The 26-week plan starts here. Every week starts on this weekday.'}
            </p>
          </div>

          <h2 className="section-head">Usual week</h2>
          <ul className="list">
            {form.week.map((g, i) => (
              <li key={i} className="setting-row" data-group={g}>
                <label htmlFor={`week-${i}`}>
                  <b>{form.start_date ? formatDay(addDays(form.start_date, i), { weekday: 'long' }) : `Day ${i + 1}`}</b>
                  <span>Day {i + 1}</span>
                </label>
                <GroupSelect
                  id={`week-${i}`}
                  groups={groups}
                  value={g}
                  onChange={(v) => setForm((f) => ({ ...f, week: f.week.map((x, j) => (j === i ? v : x)) }))}
                />
              </li>
            ))}
          </ul>

          <h2 className="section-head">Exercises per day</h2>
          <p className="hint field-group">Main exercises come from the day's group. Core exercises are added on top.</p>
          <table className="counts">
            <thead><tr><th scope="col">Group</th><th scope="col">Main</th><th scope="col">Core</th></tr></thead>
            <tbody>
              {mainGroups.map((g) => (
                <tr key={g} data-group={g}>
                  <th scope="row">{g}</th>
                  <td><input type="number" min="0" max="20" required aria-label={`${g} main exercises`} value={form.main_counts[g] ?? 7} onChange={setCount('main_counts', g)} /></td>
                  <td><input type="number" min="0" max="10" required aria-label={`${g} core exercises`} value={form.core_counts[g] ?? 0} onChange={setCount('core_counts', g)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={changed ? 'save-bar pending' : 'save-bar'}>
            {changed && <span>Unsaved changes</span>}
            <button className="primary" disabled={busy || !changed}>{busy ? 'Saving…' : changed ? 'Save plan settings' : 'Saved'}</button>
          </div>
        </form>

        <h2 className="section-head">Unavailable exercises</h2>
        {blocked.length === 0 && <p className="hint field-group">None. On the Today tab, tap “Not available in my gym” under an exercise your gym can’t do.</p>}
        <ul className="list">
          {blocked.map((e) => (
            <li key={e.id} className="setting-row" data-group={e.bodyPart}>
              <span className="row-text"><span className="row-name">{e.name}</span><span className="row-tags">{e.bodyPart}</span></span>
              <button className="secondary" onClick={() => unblock(e.id)}>Available again</button>
            </li>
          ))}
        </ul>

        <h2 className="section-head">Account</h2>
        <div className="setting-row account">
          <span className="row-text"><span className="row-tags">Signed in as</span><span className="row-name">{email}</span></span>
          <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </main>
    </>
  )
}
