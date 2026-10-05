import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { planDays } from './ai.js'
import Body from './Body.jsx'
import { bodyPartsOf, fetchExercises, fetchUserData, saveOverride } from './data.js'
import Library from './Library.jsx'
import Plan from './Plan.jsx'
import Home from './Home.jsx'
import { buildSchedule, dayInfo, daysBetween, toDay, weekOf } from './plan.js'
import Progress from './Progress.jsx'
import Settings from './Settings.jsx'
import { supabase } from './supabase.js'
import Today from './Today.jsx'

const TABS = ['Home', 'Today', 'Plan', 'Progress', 'Body', 'Exercises', 'Settings']

function Login() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const credentials = { email: form.get('email'), password: form.get('password') }
    const signUp = e.nativeEvent.submitter?.value === 'signup'
    setBusy(true)
    setMessage('')
    const { data, error } = signUp
      ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin } })
      : await supabase.auth.signInWithPassword(credentials)
    setBusy(false)
    if (error) setMessage(error.message)
    else if (signUp && !data.session) setMessage('Account created. Confirm the link in your email, then sign in.')
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <h1>Exercise Book</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" minLength={6} required />
        </label>
        <button className="primary" value="signin" disabled={busy}>Sign in</button>
        <button className="secondary" value="signup" disabled={busy}>Create account</button>
        {message && <p role="status">{message}</p>}
      </form>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined while checking

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <p className="empty">Loading…</p>
  if (!session) return <Login />
  // keyed by user, so signing in as someone else starts from empty state
  return <Workspace key={session.user.id} userId={session.user.id} email={session.user.email} />
}

function Workspace({ userId, email }) {
  const [exercises, setExercises] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState('Home')
  const [ai, setAi] = useState({ days: null, message: '' }) // days: being planned by AI right now
  const tried = useRef(new Set()) // days the auto-plan already asked for, so a failing AI is not re-asked in a loop

  useEffect(() => {
    let live = true
    Promise.all([fetchExercises(), fetchUserData(userId)])
      .then(([ex, d]) => live && (setExercises(ex), setData(d)))
      .catch((err) => live && (console.error(err), setError(err)))
    return () => { live = false }
  }, [userId, reload])

  // Runs a Supabase write, merges apply(data, result) into local state and returns the result
  // (undefined on failure).
  const save = useCallback(async (request, apply) => {
    try {
      const result = await request()
      setData((d) => ({ ...d, ...apply(d, result) }))
      return result
    } catch (err) {
      console.error(err)
      alert(`Could not save: ${err.message}`)
    }
  }, [])

  // Changes one day's group or hand-picked exercises. Choosing the week's default group clears the
  // override; any group change drops the day's exact exercise list, which belonged to the old group.
  const setOverride = (day, fields) => {
    const { settings } = data
    if (fields.muscle_group === settings.week[daysBetween(settings.start_date, day) % 7]) fields = { ...fields, muscle_group: null }
    if ('muscle_group' in fields) {
      fields = { ...fields, plan: null }
      tried.current.delete(day) // new group: let the auto-plan ask the AI for this day again
    }
    return save(() => saveOverride(userId, day, fields), (d, row) => ({ overrides: { ...d.overrides, [day]: row } }))
  }

  const today = toDay()
  const schedule = useMemo(() => {
    if (!data) return []
    const lastDone = new Map()
    for (const l of data.logs) if (l.day < today) lastDone.set(l.exercise_id, l.day) // logs are sorted by day
    return buildSchedule({ exercises, blocked: data.blocked, lastDone, settings: data.settings, overrides: data.overrides, from: today })
  }, [exercises, data, today])

  const planWithAi = async (days) => {
    setAi({ days, message: '' })
    setAi({ days: null, message: await planDays(days, { exercises, data, userId, save, today }) })
  }

  // The AI plans the rest of the current week as soon as a day there has no exercise list yet.
  // Days it could not plan fall back to the preset rotation.
  useEffect(() => {
    if (!data || ai.days) return
    const missing = weekOf(today, data.settings).filter((day) => {
      const info = day >= today && !tried.current.has(day) && dayInfo(day, data.settings, data.overrides)
      return info && !info.plan && info.main + info.core > 0
    })
    missing.forEach((day) => tried.current.add(day))
    if (missing.length) planWithAi(missing)
  }, [data, ai.days, today]) // eslint-disable-line react-hooks/exhaustive-deps -- planWithAi is rebuilt each render

  if (error) {
    return (
      <p className="empty">
        Could not load your data. Check your connection and try again.{' '}
        <button className="secondary" onClick={() => { setError(null); setReload((n) => n + 1) }}>Retry</button>
      </p>
    )
  }
  if (!data) return <p className="empty">Loading your plan…</p>

  const props = { exercises, data, userId, save, setOverride, today, schedule, groups: bodyPartsOf(exercises), go: setTab, ai, planWithAi }
  return (
    <>
      {tab === 'Home' && <Home {...props} />}
      {tab === 'Today' && <Today {...props} />}
      {tab === 'Plan' && <Plan {...props} />}
      {tab === 'Progress' && <Progress {...props} />}
      {tab === 'Body' && <Body {...props} />}
      {tab === 'Exercises' && <Library exercises={exercises} blocked={data.blocked} />}
      {tab === 'Settings' && <Settings {...props} email={email} />}
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
    </>
  )
}
