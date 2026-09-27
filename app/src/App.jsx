import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bodyPartsOf, fetchExercises } from './exercises.js'

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const initials = (name) =>
  name.split(/\s+/).filter((w) => /^[a-z]/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

// Image from another site: may be blocked or gone, so fall back to `fallback`.
function RemoteImage({ src, alt, className, fallback }) {
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

function Avatar({ exercise }) {
  const fallback = <span className="avatar avatar-initials" aria-hidden="true">{initials(exercise.name)}</span>
  return <RemoteImage src={exercise.images[0]} alt="" className="avatar" fallback={fallback} />
}

function Tags({ tags }) {
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

function Detail({ exercise, onClose }) {
  const { steps, tip } = parseHelp(exercise.help)
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current.focus()
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div className="detail-bar">
        <button ref={closeRef} className="back" onClick={onClose}>‹ Back</button>
        <span className="detail-part">{exercise.bodyPart}</span>
      </div>
      <div className="detail-body">
        <h1 id="detail-title">{exercise.name}</h1>
        <Slider images={exercise.images} name={exercise.name} />
        <p className="description">{exercise.description}</p>
        <Tags tags={exercise.tags} />
        <h2>How to do it</h2>
        <ol className="steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        {tip && <p className="tip"><strong>Tip:</strong> {tip}</p>}
      </div>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [exercises, setExercises] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    fetchExercises()
      .then((data) => { setExercises(data); setStatus('ready') })
      .catch((err) => { console.error(err); setStatus('error') })
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (e) => !q || e.name.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))
    return bodyPartsOf(exercises)
      .map((part) => ({ part, items: exercises.filter((e) => e.bodyPart === part && match(e)) }))
      .filter((g) => g.items.length)
  }, [query, exercises])

  // Phone back button closes the detail view.
  useEffect(() => {
    const onPop = () => setSelected(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const open = (e) => {
    history.pushState({ detail: e.id }, '')
    setSelected(e)
  }
  const close = useCallback(() => history.back(), [])

  return (
    <>
      <header className="top">
        <h1>Exercises</h1>
        <input
          type="search"
          placeholder={`Search ${exercises.length} exercises or muscles`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search exercises"
        />
        <nav className="jump" aria-label="Body parts">
          {groups.map((g) => (
            <a key={g.part} href={`#${slug(g.part)}`}>{g.part}</a>
          ))}
        </nav>
      </header>

      <main>
        {status === 'loading' && <p className="empty">Loading exercises…</p>}
        {status === 'error' && <p className="empty">Could not load exercises. Check your connection and try again.</p>}
        {status === 'ready' && groups.length === 0 && <p className="empty">No exercises match “{query}”.</p>}
        {groups.map((g) => (
          <section key={g.part} id={slug(g.part)} aria-labelledby={`h-${slug(g.part)}`}>
            <h2 className="section-head" id={`h-${slug(g.part)}`}>
              {g.part} <span>{g.items.length}</span>
            </h2>
            <ul className="list">
              {g.items.map((e) => (
                <li key={e.id}>
                  <button className="row" onClick={() => open(e)}>
                    <Avatar exercise={e} />
                    <span className="row-text">
                      <span className="row-name">{e.name}</span>
                      <span className="row-tags">{e.tags.filter((t) => t !== e.bodyPart).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {selected && <Detail key={selected.id} exercise={selected} onClose={close} />}
    </>
  )
}
