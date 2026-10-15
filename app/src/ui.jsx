import { useCallback, useEffect, useRef, useState } from 'react'
import { REST } from './plan.js'

// Muscle groups print as plates: push is cyan, pull magenta, legs and core yellow, cardio ink.
const FAMILY = { Chest: 'Push', Shoulders: 'Push', Triceps: 'Push', Back: 'Pull', Biceps: 'Pull', Legs: 'Legs and core', Core: 'Legs and core', Cardio: 'Cardio' }
const PLATE = {
  Push: 'var(--color-accent)',
  Pull: 'var(--color-accent-2)',
  'Legs and core': 'var(--color-process-yellow)',
  Cardio: 'var(--color-text)',
}
export const familyOf = (group) => FAMILY[group]
export const plateOf = (group) => PLATE[FAMILY[group]] ?? 'var(--color-neutral-300)'

// The 10 × 10 plate square beside a group name.
export const Plate = ({ group, small }) => <span className={small ? 'sq sq-s' : 'sq'} style={{ background: plateOf(group) }} aria-hidden="true" />

// Text printed as misregistered process plates. kind: 'head' (headlines) or 'num' (figures).
export function Plated({ kind = 'head', children }) {
  const Tag = kind === 'num' ? 'div' : 'span'
  return (
    <Tag className={`cmyk-${kind}`}>
      <span className="paper">{children}</span>
      {['c', 'm', 'y'].map((p) => <span key={p} className={`plate plate-${p}`} aria-hidden="true">{children}</span>)}
    </Tag>
  )
}

const initials = (name) =>
  name.split(/\s+/).filter((w) => /^[a-z]/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

// Image from another site: may be blocked or gone, so fall back to `fallback`.
export function RemoteImage({ src, alt, className, fallback }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) return fallback
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

// Small halftone picture of an exercise, for lists.
export function Thumb({ exercise }) {
  return (
    <div className="thumb halftone" aria-hidden="true">
      <RemoteImage src={exercise.images[0]} alt="" fallback={<span className="muted">{initials(exercise.name)}</span>} />
    </div>
  )
}

export const musclesOf = (exercise) => exercise.tags.filter((t) => t !== exercise.bodyPart).join(', ')

function Slider({ images, name }) {
  const track = useRef(null)
  const [index, setIndex] = useState(0)
  const [full, openFull, closeFull] = useBackClosable() // the full-screen view is open

  const go = (i) => {
    const el = track.current
    const next = Math.max(0, Math.min(images.length - 1, i))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, select, textarea')) return // arrows there move the caret
      if (e.key === 'ArrowLeft') go(index - 1)
      if (e.key === 'ArrowRight') go(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="slider" aria-roledescription="carousel" aria-label={`${name} images`}>
      <div className="illustration halftone">
        <div className="slider-track" ref={track} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {images.map((src, i) => (
            <div className="slide" key={src} aria-label={`Image ${i + 1} of ${images.length}`}>
              <button className="slide-open" onClick={() => openFull(true)} aria-label={`Show image ${i + 1} full screen`}>
                <RemoteImage src={src} alt={`${name}, image ${i + 1}`} fallback={<div className="slide-missing">Image unavailable</div>} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {full && (
        // Escape is handled here first and marked, so a surrounding Overlay stays open
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${name}, image ${index + 1} of ${images.length}`}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeFull() } }}>
          <div className="lightbox-bar">
            <span>{index + 1} / {images.length}</span>
            <button className="btn btn-secondary" autoFocus onClick={closeFull}>Close</button>
          </div>
          <RemoteImage src={images[index]} alt={`${name}, image ${index + 1}`} fallback={<div className="slide-missing">Image unavailable</div>} />
          {images.length > 1 && (
            <>
              <button className="slider-arrow prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous image">‹</button>
              <button className="slider-arrow next" onClick={() => go(index + 1)} disabled={index === images.length - 1} aria-label="Next image">›</button>
            </>
          )}
        </div>
      )}
      {images.length > 1 && (
        <>
          <button className="slider-arrow prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous image">‹</button>
          <button className="slider-arrow next" onClick={() => go(index + 1)} disabled={index === images.length - 1} aria-label="Next image">›</button>
          <div className="slider-dots">
            {images.map((src, i) => (
              <button key={src} onClick={() => go(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// "1. step 2. step Tip: text" -> { steps, tip }
function parseHelp(help) {
  const [body, tip] = help.split(/\s*Tip:\s*/i)
  const steps = body.split(/\s*\d+\.\s+/).filter(Boolean)
  return { steps, tip }
}

// Pictures, description, how-to steps and the tip.
export function ExerciseInfo({ exercise }) {
  const { steps, tip } = parseHelp(exercise.help)
  return (
    <div className="stack-20 stack">
      <Slider images={exercise.images} name={exercise.name} />
      <div className="stack" style={{ gap: 12 }}>
        <p className="balance" style={{ fontSize: 16 }}>{exercise.description}</p>
        {steps.length > 0 && (
          <div className="stack-10 stack">
            <h4 style={{ margin: '8px 0 0' }}>How to do it</h4>
            {steps.map((s, i) => <div className="step" key={i}><b>{i + 1}</b><span>{s}</span></div>)}
            {tip && <p className="tip balance" style={{ marginTop: 6 }}>{tip}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// Full-screen layer with a back bar; Escape closes it.
export function Overlay({ title, label, onClose, children }) {
  const layer = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!layer.current.contains(document.activeElement)) closeRef.current.focus() // keep an autoFocus child
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div ref={layer} className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="overlay-bar">
        <button ref={closeRef} className="btn btn-ghost" onClick={onClose}>‹ Back</button>
        <span className="muted">{label}</span>
      </div>
      {children}
    </div>
  )
}

// Value shown in an overlay; the phone back button clears it. Overlays can stack (an image opened
// full screen inside an exercise's details): each history entry carries its depth, and back closes
// only the layers above the entry it lands on.
export function useBackClosable() {
  const [value, setValue] = useState(null)
  const depth = useRef(0)

  useEffect(() => {
    const onPop = () => { if ((history.state?.depth ?? 0) < depth.current) setValue(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const open = useCallback((v) => {
    depth.current = (history.state?.depth ?? 0) + 1
    history.pushState({ overlay: true, depth: depth.current }, '')
    setValue(v)
  }, [])
  const close = useCallback(() => history.back(), [])

  return [value, open, close]
}

// Opens an exercise's detail view.
export function useDetail() {
  const [selected, open, close] = useBackClosable()
  const detail = selected && (
    <Overlay key={selected.id} title={selected.name} label={selected.bodyPart} onClose={close}>
      <div className="page gap-22">
        <div className="stack stack-6">
          <div className="kicker"><Plate group={selected.bodyPart} />{selected.bodyPart}</div>
          <h2 style={{ fontSize: 30 }} className="balance">{selected.name}</h2>
          <div className="muted-14">{musclesOf(selected)}</div>
        </div>
        <ExerciseInfo exercise={selected} />
      </div>
    </Overlay>
  )
  return [open, detail]
}

export function GroupSelect({ groups, value, onChange, ...rest }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {[...groups, REST].map((g) => <option key={g}>{g}</option>)}
    </select>
  )
}

// − value + control; `name` (default: the label) is what the buttons say to a screen reader.
export function Stepper({ label, name = label, value, onMinus, onPlus, small }) {
  return (
    <div className={small ? 'stepper sm' : 'stepper'}>
      {label && <span className="muted">{label}</span>}
      <div>
        <button className="btn btn-secondary" onClick={onMinus} aria-label={`Less ${name}`}>−</button>
        <output>{value}</output>
        <button className="btn btn-secondary" onClick={onPlus} aria-label={`More ${name}`}>+</button>
      </div>
    </div>
  )
}

// Before an AI request: what the AI is about to do, and a box for anything to tell it. Sending with
// the box empty is fine. ask({ title, text, send }) resolves to the note ('' when empty), or null
// when cancelled; render `sheet` once in the caller.
export function useNote() {
  const [open, setOpen] = useState(null) // { title, text, send, resolve }
  const ask = useCallback((options) => new Promise((resolve) => setOpen({ ...options, resolve })), [])
  const close = (value) => {
    open.resolve(value)
    setOpen(null)
  }
  const sheet = open && (
    <div className="sheet-backdrop" style={{ zIndex: 20 }} onClick={(e) => e.target === e.currentTarget && close(null)}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={open.title}
        onSubmit={(e) => { e.preventDefault(); close(new FormData(e.currentTarget).get('note').trim()) }}
        onKeyDown={(e) => e.key === 'Escape' && close(null)}>
        <div className="card-title">{open.title}</div>
        {open.text && <div className="muted-14 balance">{open.text}</div>}
        <textarea name="note" className="input" rows={3} maxLength={300} autoFocus aria-label="Note for the AI (optional)"
          placeholder="Optional: anything the AI should know, e.g. left shoulder sore, no barbell, more back work" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => close(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}>{open.send ?? 'Send to AI'}</button>
        </div>
      </form>
    </div>
  )
  return [sheet, ask]
}
