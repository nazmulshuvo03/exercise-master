import { useMemo, useState } from 'react'
import { bodyPartsOf } from './data.js'
import { Avatar, useDetail } from './ui.jsx'

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

// Searchable exercise list. Rows open the detail view, or call onPick when given.
export default function Library({ exercises, blocked, title = 'Exercises', onPick }) {
  const [query, setQuery] = useState('')
  const [open, detail] = useDetail()

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (e) => !q || e.name.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))
    return bodyPartsOf(exercises)
      .map((part) => ({ part, items: exercises.filter((e) => e.bodyPart === part && match(e)) }))
      .filter((g) => g.items.length)
  }, [query, exercises])

  return (
    <>
      <header className="top">
        <h1>{title}</h1>
        <input
          type="search"
          placeholder={`Search ${exercises.length} exercises or muscles`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search exercises"
          autoFocus={!!onPick}
        />
        <nav className="jump" aria-label="Body parts">
          {groups.map((g) => (
            <a key={g.part} href={`#${slug(g.part)}`}>{g.part}</a>
          ))}
        </nav>
      </header>

      <main>
        {groups.length === 0 && <p className="empty">No exercises match “{query}”.</p>}
        {groups.map((g) => (
          <section key={g.part} id={slug(g.part)} aria-labelledby={`h-${slug(g.part)}`}>
            <h2 className="section-head" id={`h-${slug(g.part)}`}>
              {g.part} <span>{g.items.length}</span>
            </h2>
            <ul className="list">
              {g.items.map((e) => (
                <li key={e.id}>
                  <button className="row" onClick={() => (onPick ?? open)(e)}>
                    <Avatar exercise={e} />
                    <span className="row-text">
                      <span className="row-name">
                        {e.name} {blocked.has(e.id) && <span className="badge">Unavailable</span>}
                      </span>
                      <span className="row-tags">{e.tags.filter((t) => t !== e.bodyPart).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {detail}
    </>
  )
}
