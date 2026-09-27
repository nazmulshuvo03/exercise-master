import { useCallback, useEffect, useRef, useState } from 'react'
import { REST } from './plan.js'

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

export function Avatar({ exercise }) {
  const fallback = <span className="avatar avatar-initials" aria-hidden="true">{initials(exercise.name)}</span>
  return <RemoteImage src={exercise.images[0]} alt="" className="avatar" fallback={fallback} />
}

export function Tags({ tags }) {
  return (
    <ul className="tags">
      {tags.map((t) => <li key={t}>{t}</li>)}
    </ul>
  )
}

function Slider({ images, name }) {
  const track = useRef(null)
  const [index, setIndex] = useState(0)

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
      <div
        className="slider-track"
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {images.map((src, i) => (
          <div className="slide" key={src} aria-label={`Image ${i + 1} of ${images.length}`}>
            <RemoteImage
              src={src}
              alt={`${name}, image ${i + 1}`}
              fallback={<div className="slide-missing">Image unavailable</div>}
            />
          </div>
        ))}
      </div>
      <button className="slider-arrow prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous image">‹</button>
      <button className="slider-arrow next" onClick={() => go(index + 1)} disabled={index === images.length - 1} aria-label="Next image">›</button>
      <div className="dots">
        {images.map((src, i) => (
          <button
            key={src}
            className={i === index ? 'dot active' : 'dot'}
            onClick={() => go(i)}
            aria-label={`Show image ${i + 1}`}
            aria-current={i === index}
          />
        ))}
      </div>
    </div>
  )
}

// "1. step 2. step Tip: text" -> { steps, tip }
function parseHelp(help) {
  const [body, tip] = help.split(/\s*Tip:\s*/i)
  const steps = body.split(/\s*\d+\.\s+/).filter(Boolean)
  return { steps, tip }
}

// Images, description, tags and how-to steps.
export function ExerciseInfo({ exercise }) {
  const { steps, tip } = parseHelp(exercise.help)
  return (
    <>
      <Slider images={exercise.images} name={exercise.name} />
      <div className="info-text">
        <p className="description">{exercise.description}</p>
        <Tags tags={exercise.tags} />
        <h2>How to do it</h2>
        <ol className="steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        {tip && <p className="tip"><strong>Tip:</strong> {tip}</p>}
      </div>
    </>
  )
}

// Full-screen layer with a back bar; Escape closes it.
export function Overlay({ title, label, onClose, children }) {
  const layer = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!layer.current.contains(document.activeElement)) closeRef.current.focus() // keep an autoFocus child
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div ref={layer} className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="detail-bar">
        <button ref={closeRef} className="back" onClick={onClose}>‹ Back</button>
        <span className="detail-part">{label}</span>
      </div>
      {children}
    </div>
  )
}

// Value shown in an overlay; the phone back button clears it.
export function useBackClosable() {
  const [value, setValue] = useState(null)

  useEffect(() => {
    const onPop = () => setValue(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const open = useCallback((v) => {
    history.pushState({ overlay: true }, '')
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
      <div className="detail-body">
        <h1>{selected.name}</h1>
        <ExerciseInfo exercise={selected} />
      </div>
    </Overlay>
  )
  return [open, detail]
}

export function GroupSelect({ groups, value, onChange, ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {[...groups, REST].map((g) => <option key={g}>{g}</option>)}
    </select>
  )
}
