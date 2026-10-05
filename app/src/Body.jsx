import { useRef, useState } from 'react'
import { askAi } from './ai.js'
import { deleteScan, saveScan } from './data.js'
import { FIELDS, jsonIn, parseScan, PROMPT, SECTIONS } from './inbody.js'
import { formatDay } from './plan.js'
import { useBackClosable } from './ui.jsx'

const LONG = { day: 'numeric', month: 'long', year: 'numeric' }
const SHORT = { day: 'numeric', month: 'short' }
const LEAN = [['lean_left_arm', 'Left arm'], ['lean_right_arm', 'Right arm'], ['lean_trunk', 'Trunk'], ['lean_left_leg', 'Left leg'], ['lean_right_leg', 'Right leg']]

// The form keeps what the user typed as strings; parseScan turns them into numbers on save.
const toForm = (day, metrics = {}) => ({ day, ...Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, String(v)])) })

// A phone photo can be 10+ MB; the AI only needs the sheet legible, and api/ai.js caps the size.
async function toJpeg(file, maxSide = 2000) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

// The add / edit page: photo, AI or pasted reply, and the form. initial: toForm() of the scan.
function ScanEditor({ initial, existing, data, userId, save, onSaved, onDelete, onBack }) {
  const [file, setFile] = useState(null) // the sheet photo, never stored
  const [read, setRead] = useState(false) // the AI has filled the form once
  const [form, setForm] = useState(initial)
  const [pasted, setPasted] = useState('')
  const [status, setStatus] = useState('')
  const [aiError, setAiError] = useState('') // why Read with AI failed; shown until the form is filled
  const [busy, setBusy] = useState(false)
  const otherAi = useRef(null)

  const pick = (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setStatus('That is not an image. Choose a photo or scan of the sheet.')
    setFile(f)
    setStatus('')
    setAiError('')
  }

  const fill = (answer) => {
    const { day, metrics, invalid } = parseScan(answer)
    const found = Object.keys(metrics).length
    if (!found) {
      setStatus('No values found in that answer. Type them in below.')
      return false
    }
    setAiError('')
    setForm((f) => toForm(day ?? f.day, metrics))
    setStatus([
      `Filled ${found} of ${FIELDS.length} values.`,
      !day && 'No test date found, so check the date.',
      invalid.length && `Left out values that look wrong: ${invalid.join(', ')}.`,
      'Check them against the sheet before saving.',
    ].filter(Boolean).join(' '))
    return true
  }

  const readWithAi = async () => {
    setBusy(true)
    setAiError('')
    setStatus('Reading the sheet…')
    let reason
    try {
      if (fill(await askAi('inbody', { image: await toJpeg(file) }))) setRead(true)
      else reason = 'it found no values in the photo'
    } catch (err) {
      console.error(err)
      reason = err.message
    }
    if (reason) {
      setStatus('')
      setAiError(reason)
      otherAi.current.open = true // the way out: another AI, opened right below the alert
    }
    setBusy(false)
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT)
      setStatus('Prompt copied. Give it to another AI with the photo, then paste its reply below.')
    } catch {
      setStatus('Could not copy. Select the prompt text and copy it by hand.')
    }
  }

  const fillFromPaste = () => {
    try {
      fill(jsonIn(pasted))
    } catch {
      setStatus('That reply has no valid JSON object. Paste the whole reply from the other AI.')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const { day, metrics, invalid } = parseScan(form)
    if (!day) return setStatus('Enter the test date.')
    if (invalid.length) return setStatus(`Check these values: ${invalid.join(', ')}.`)
    if (!Object.keys(metrics).length) return setStatus('Enter at least one value.')
    setBusy(true)
    const saved = await save(() => saveScan(userId, { day, metrics }), (d, row) => ({
      scans: [...d.scans.filter((s) => s.day !== row.day), row].sort((a, b) => a.day.localeCompare(b.day)),
    }))
    setBusy(false)
    if (saved) onSaved(day) // else save() already showed the error
  }

  const replacing = data.scans.some((s) => s.day === form.day)

  return (
    <div className="page gap-22" style={{ paddingTop: 4, paddingBottom: 40 }}>
      <div className="between">
        <button className="btn btn-ghost" onClick={onBack}>‹ Body</button>
        <span className="muted">{existing ? `Scan of ${formatDay(initial.day, LONG)}` : 'New InBody scan'}</span>
      </div>

      <label
        className="drop halftone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
      >
        <b>{file ? file.name : 'Add the InBody sheet'}</b>
        <span className="muted">{file ? 'Photo added · tap to replace' : 'Take a photo or choose one'}</span>
        <input type="file" accept="image/*" aria-label="InBody sheet photo" onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
      </label>

      <div className="stack stack-10">
        <button className="btn btn-primary" style={{ height: 48, fontSize: 16 }} disabled={!file || busy} onClick={readWithAi}>
          {status === 'Reading the sheet…' ? 'Reading the sheet…' : read ? 'Read again with AI' : 'Read with AI'}
        </button>
        {aiError && (
          <p className="alert" role="alert">
            <b>AI could not read the sheet.</b> Reason: {aiError}. Use another AI below: copy the prompt, give it the photo, and paste its reply. Or type the values.
          </p>
        )}
        <span className="muted" role="status">{status || (file ? 'AI fills in the fields below from the photo.' : 'Add a photo first, or type the values in.')}</span>
        <details ref={otherAi}>
          <summary>Use another AI instead</summary>
          <div className="stack stack-10" style={{ marginTop: 10 }}>
            <p className="muted-14">Copy this prompt, give it to any AI together with the photo, and paste its reply here.</p>
            <pre className="prompt">{PROMPT}</pre>
            <button className="btn btn-secondary btn-start" onClick={copyPrompt}>Copy prompt</button>
            <div className="field">
              <label htmlFor="pasted">Reply from the other AI</label>
              <textarea id="pasted" className="input" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"day": "2026-09-23", "weight": 82.2, …}' />
            </div>
            <button className="btn btn-secondary btn-start" disabled={!pasted.trim()} onClick={fillFromPaste}>Fill the form</button>
          </div>
        </details>
      </div>

      <form className="stack-20 stack" style={{ gap: 24 }} onSubmit={submit}>
        <div className="field">
          <label htmlFor="scan-day">Test date</label>
          <input id="scan-day" className="input" type="date" required value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} />
        </div>
        {SECTIONS.map((s) => (
          <fieldset key={s.title} className="stack stack-10" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={{ padding: 0, marginBottom: 12 }}><h4>{s.title}</h4></legend>
            <div className="fields">
              {s.fields.map((f) => (
                <div className="field" key={f.key}>
                  <label htmlFor={`f-${f.key}`}>{f.label}{f.unit && f.unit !== 'level' && f.unit !== 'points' && ` (${f.unit})`}</label>
                  <input
                    id={`f-${f.key}`}
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={f.min}
                    max={f.max}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        {replacing && <p className="muted">Replaces the saved scan of this date.</p>}
        <button className="btn btn-primary btn-lg" disabled={busy}>Save scan</button>
        {existing && <button type="button" className="btn btn-ghost btn-start" onClick={onDelete}>Delete this scan</button>}
      </form>
    </div>
  )
}

// What changed since the scan before, in words: "−0.7 kg since 14 Sep". good: which direction is better.
function change(now, before, unit, goodUp, since) {
  if (now == null || before == null) return null
  const d = Math.round((now - before) * 10) / 10
  if (!d) return { text: 'No change', good: null }
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)} ${unit} since ${since}`, good: goodUp ? d > 0 : d < 0 }
}

export default function Body({ data, userId, save, today }) {
  const [editing, open, close] = useBackClosable() // { form: toForm(), existing } of the scan being added or edited
  const [notice, setNotice] = useState('')

  const remove = async (day) => {
    if (!confirm(`Delete the scan of ${formatDay(day, LONG)}?`)) return
    const ok = await save(() => deleteScan(userId, day), (d) => ({ scans: d.scans.filter((s) => s.day !== day) }))
    if (ok !== undefined) close()
  }

  if (editing) {
    return (
      <ScanEditor
        key={editing.form.day + editing.existing}
        initial={editing.form} existing={editing.existing} data={data} userId={userId} save={save}
        onSaved={(day) => { setNotice(`Saved the scan of ${formatDay(day, LONG)}.`); close() }}
        onDelete={() => remove(editing.form.day)}
        onBack={close}
      />
    )
  }

  const scans = [...data.scans].reverse() // newest first
  const [latest, before] = scans
  const since = before ? formatDay(before.day, SHORT) : ''
  const m = latest?.metrics ?? {}
  const stats = latest && [
    ['Weight', m.weight, 'kg', change(m.weight, before?.metrics.weight, 'kg', false, since)],
    ['Skeletal muscle', m.smm, 'kg', change(m.smm, before?.metrics.smm, 'kg', true, since)],
    ['Body fat', m.pbf, '%', change(m.pbf, before?.metrics.pbf, '%', false, since)],
    ['InBody score', m.inbody_score, '/ 100', change(m.inbody_score, before?.metrics.inbody_score, 'pts', true, since)],
  ]
  const lean = LEAN.filter(([k]) => m[k] != null)
  const maxLean = Math.max(1, ...lean.map(([k]) => m[k]))

  return (
    <div className="page gap-34" style={{ paddingTop: 10 }}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack stack-6">
          <h2>Body</h2>
          <span className="muted-14">{latest ? `Latest InBody scan, ${formatDay(latest.day, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'InBody scans, newest first'}</span>
        </div>
        <button className="btn btn-primary" onClick={() => { setNotice(''); open({ form: toForm(today), existing: false }) }}>New scan</button>
      </div>
      {notice && <p className="status" role="status">{notice}</p>}
      {!latest && <p className="muted-14">No scans yet. Tap New scan and add a photo of your InBody sheet.</p>}

      {latest && (
        <>
          <div className="bodystats">
            {stats.map(([label, val, unit, ch]) => (
              <div className="stack stack-2" key={label}>
                <span className="muted">{label}</span>
                <span className="v">{val ?? '–'}{val != null && <small> {unit}</small>}</span>
                {ch && <span className={ch.good === null ? 'muted' : ch.good ? 'status' : 'muted warn-text'}>{ch.text}</span>}
              </div>
            ))}
          </div>

          {lean.length > 0 && (
            <div className="stack stack-2">
              <h4 style={{ marginBottom: 6 }}>Segmental lean</h4>
              {lean.map(([k, label]) => (
                <div className="meter lean" key={k} style={{ gridTemplateColumns: '90px minmax(0, 1fr) 64px', padding: '5px 0' }}>
                  <span>{label}</span>
                  <span className="track" aria-hidden="true"><span style={{ width: `${(m[k] / maxLean) * 100}%` }} /></span>
                  <span className="val">{m[k]} kg</span>
                </div>
              ))}
            </div>
          )}

          <div className="stack stack-2">
            <h4 style={{ marginBottom: 6 }}>Scan history</h4>
            {scans.map((s) => (
              <button
                className="scanrow" key={s.day}
                aria-label={`Edit scan of ${formatDay(s.day, LONG)}`}
                onClick={() => { setNotice(''); open({ form: toForm(s.day, s.metrics), existing: true }) }}
              >
                <span>{formatDay(s.day, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span>{s.metrics.weight != null ? `${s.metrics.weight} kg` : '–'}</span>
                <span>{s.metrics.pbf != null ? `${s.metrics.pbf}% fat` : '–'}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
