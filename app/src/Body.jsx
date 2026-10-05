import { useEffect, useRef, useState } from 'react'
import { askAi } from './ai.js'
import { deleteScan, saveScan } from './data.js'
import { FIELDS, jsonIn, parseScan, PROMPT, SECTIONS } from './inbody.js'
import { formatDay } from './plan.js'
import { Overlay, useBackClosable } from './ui.jsx'

const LONG = { day: 'numeric', month: 'long', year: 'numeric' }
const COLUMNS = [['weight', 'Weight kg'], ['smm', 'SMM kg'], ['pbf', 'Fat %'], ['inbody_score', 'Score']]

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

function Change({ scans, index, k }) {
  const before = scans[index + 1]?.metrics[k]
  const now = scans[index].metrics[k]
  if (before == null || now == null || now === before) return null
  const diff = Math.round((now - before) * 10) / 10
  return <span className="change">{diff > 0 ? `+${diff}` : `−${-diff}`}</span>
}

// scans: data.scans (oldest first). Shown newest first, each value with its change since the scan
// before. actions(scan), if given, renders the last cell of each row.
function ScanTable({ scans, actions }) {
  const rows = [...scans].reverse()
  return (
    <table className="scans">
      <thead>
        <tr>
          <th scope="col">Date</th>
          {COLUMNS.map(([key, title]) => <th key={key} scope="col">{title}</th>)}
          {actions && <th scope="col"><span className="visually-hidden">Actions</span></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.day}>
            <th scope="row">{formatDay(s.day, { day: 'numeric', month: 'short', year: '2-digit' })}</th>
            {COLUMNS.map(([key]) => <td key={key}>{s.metrics[key] ?? '–'} <Change scans={rows} index={i} k={key} /></td>)}
            {actions && <td className="scan-actions">{actions(s)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// The add / edit page: photo, AI or pasted reply, and the form. initial: toForm() of the scan.
function ScanEditor({ initial, data, userId, save, onSaved }) {
  const [image, setImage] = useState(null) // { file, url } of the sheet photo, never stored
  const [dragging, setDragging] = useState(false)
  const [form, setForm] = useState(initial)
  const [pasted, setPasted] = useState('')
  const [status, setStatus] = useState('')
  const [aiError, setAiError] = useState('') // why Read with AI failed; shown until the form is filled
  const [busy, setBusy] = useState(false)
  const otherAi = useRef(null)

  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image])

  const pick = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setStatus('That is not an image. Choose a photo or scan of the sheet.')
    setImage({ file, url: URL.createObjectURL(file) })
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
      'Check them against the sheet, then save.',
    ].filter(Boolean).join(' '))
    return true
  }

  const readWithAi = async () => {
    setBusy(true)
    setAiError('')
    setStatus('Reading the sheet…')
    let reason
    try {
      if (!fill(await askAi('inbody', { image: await toJpeg(image.file) }))) reason = 'it found no values in the photo'
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
    <div className="scan-editor">
      <div className="field-group">
        <label
          className={dragging ? 'drop dragging' : 'drop'}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
        >
          {image
            ? <img src={image.url} alt="Your InBody sheet" />
            : <span><b>Drop the InBody sheet here</b>or tap to choose a photo</span>}
          <input type="file" accept="image/*" onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
        </label>
        <div className="scan-tools">
          <button className="primary" disabled={!image || busy} onClick={readWithAi}>{busy ? 'Working…' : 'Read with AI'}</button>
          {image && <button className="secondary" disabled={busy} onClick={() => setImage(null)}>Remove photo</button>}
        </div>
        {aiError && (
          <p className="ai-failed" role="alert">
            <b>AI could not read the sheet</b>
            Reason: {aiError}. Use another AI below: copy the prompt, give it the photo, and paste its reply. Or type the values.
          </p>
        )}
        {status && <p className="hint" role="status">{status}</p>}

        <details className="other-ai" ref={otherAi}>
          <summary>Use another AI instead</summary>
          <p className="hint">Copy this prompt, give it to any AI together with the photo, and paste its reply here.</p>
          <pre className="prompt">{PROMPT}</pre>
          <button className="secondary" onClick={copyPrompt}>Copy prompt</button>
          <label className="field">
            Reply from the other AI
            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"day": "2026-09-23", "weight": 82.2, …}' />
          </label>
          <button className="secondary" disabled={!pasted.trim()} onClick={fillFromPaste}>Fill the form</button>
        </details>
      </div>

      <form onSubmit={submit}>
        <div className="field-group">
          <label className="field">
            Test date
            <input type="date" required value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} />
          </label>
        </div>
        {SECTIONS.map((s) => (
          <fieldset key={s.title} className="scan-section">
            <legend className="section-head">{s.title}</legend>
            <div className="scan-fields">
              {s.fields.map((f) => (
                <label key={f.key} className="field">
                  {f.label}{f.unit && f.unit !== 'level' && f.unit !== 'points' && ` (${f.unit})`}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={f.min}
                    max={f.max}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="save-bar">
          {replacing && <span>Replaces the saved scan of this date</span>}
          <button className="primary" disabled={busy}>Save scan</button>
        </div>
      </form>
    </div>
  )
}

export default function Body({ data, userId, save, today }) {
  const [editing, open, close] = useBackClosable() // { label, form: toForm() } of the scan being added or edited
  const [notice, setNotice] = useState('')

  const remove = (day) => {
    if (!confirm(`Delete the scan of ${formatDay(day, LONG)}?`)) return
    save(() => deleteScan(userId, day), (d) => ({ scans: d.scans.filter((s) => s.day !== day) }))
  }

  const onSaved = (day) => {
    setNotice(`Saved the scan of ${formatDay(day, LONG)}.`)
    close()
  }

  return (
    <>
      <header className="top">
        <div className="body-head">
          <h1>Body</h1>
          <button className="primary" onClick={() => { setNotice(''); open({ label: 'New InBody scan', form: toForm(today) }) }}>Add new</button>
        </div>
        <p className="subtitle">InBody results, newest first, with the change since the scan before.</p>
      </header>
      <main className="progress">
        {notice && <p className="hint field-group" role="status">{notice}</p>}
        {data.scans.length === 0
          ? <p className="empty">No scans yet. Tap Add new and drop a photo of your InBody sheet.</p>
          : <ScanTable scans={data.scans} actions={(s) => (
            <>
              <button className="link" onClick={() => { setNotice(''); open({ label: `Edit ${formatDay(s.day, LONG)}`, form: toForm(s.day, s.metrics) }) }}>Edit</button>
              <button className="link" onClick={() => remove(s.day)}>Delete</button>
            </>
          )} />}
      </main>
      {editing && (
        <Overlay title="InBody scan" label={editing.label} onClose={close}>
          <ScanEditor initial={editing.form} data={data} userId={userId} save={save} onSaved={onSaved} />
        </Overlay>
      )}
    </>
  )
}
