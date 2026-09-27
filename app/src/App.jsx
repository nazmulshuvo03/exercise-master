import { useCallback, useEffect, useMemo, useState } from 'react'
import { bodyPartsOf, fetchExercises, fetchUserData, saveOverride } from './data.js'
import Library from './Library.jsx'
import Plan from './Plan.jsx'
import { buildSchedule, daysBetween, toDay } from './plan.js'
import Progress from './Progress.jsx'
import Settings from './Settings.jsx'
import { supabase } from './supabase.js'
import Today from './Today.jsx'

const TABS = ['Today', 'Plan', 'Progress', 'Exercises', 'Settings']

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
  const [tab, setTab] = useState('Today')

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

  // Changes one day's group or counts. Choosing the week's default group clears the override.
  const setOverride = (day, fields) => {
    const { settings } = data
    if (fields.muscle_group === settings.week[daysBetween(settings.start_date, day) % 7]) fields = { ...fields, muscle_group: null }
    return save(() => saveOverride(userId, day, fields), (d, row) => ({ overrides: { ...d.overrides, [day]: row } }))
  }

  const today = toDay()
  const schedule = useMemo(() => {
    if (!data) return []
    const lastDone = new Map()
    for (const l of data.logs) if (l.day < today) lastDone.set(l.exercise_id, l.day) // logs are sorted by day
    return buildSchedule({ exercises, blocked: data.blocked, lastDone, settings: data.settings, overrides: data.overrides, from: today })
  }, [exercises, data, today])

  if (error) {
    return (
      <p className="empty">
        Could not load your data. Check your connection and try again.{' '}
        <button className="secondary" onClick={() => { setError(null); setReload((n) => n + 1) }}>Retry</button>
      </p>
    )
  }
  if (!data) return <p className="empty">Loading your plan…</p>

  const props = { exercises, data, userId, save, setOverride, today, schedule, groups: bodyPartsOf(exercises) }
  return (
    <>
      {tab === 'Today' && <Today {...props} />}
      {tab === 'Plan' && <Plan {...props} />}
      {tab === 'Progress' && <Progress {...props} />}
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
