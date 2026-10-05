import { useMemo, useState } from 'react'
import { bodyPartsOf } from './data.js'
import { musclesOf, Plate, Thumb, useDetail } from './ui.jsx'

// Searchable exercise list. Rows open the detail view, or call onPick when given. A search looks at
// every group; with none, the selected group's exercises show.
export default function Library({ exercises, blocked, title = 'Library', onPick }) {
  const groups = useMemo(() => bodyPartsOf(exercises), [exercises])
  const [group, setGroup] = useState(null)
  const [query, setQuery] = useState('')
  const [open, detail] = useDetail()

  const q = query.trim().toLowerCase()
  const selected = group && groups.includes(group) ? group : groups[0]
  const items = exercises.filter((e) => (q
    ? `${e.name} ${musclesOf(e)}`.toLowerCase().includes(q)
    : e.bodyPart === selected))

  return (
    <div className="page flush" style={{ gap: 18, paddingTop: 10 }}>
      <div className="stack pad">
        <h2>{title}</h2>
        <input
          className="input input-lg"
          type="search"
          placeholder={`Search ${exercises.length} exercises or muscles`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search exercises"
          autoFocus={!!onPick}
        />
      </div>
      <div className="chips" role="group" aria-label="Muscle groups">
        {groups.map((g) => (
          <button key={g} className="chip ink" aria-pressed={!q && g === selected} onClick={() => { setGroup(g); setQuery('') }}>
            <Plate group={g} small />{g}
          </button>
        ))}
      </div>
      <div className="pad">
        <div className="muted" style={{ marginBottom: 6 }}>{q ? `${items.length} results for “${query.trim()}”` : `${selected} · ${items.length}`}</div>
        {items.map((e) => (
          <button key={e.id} className="libitem" onClick={() => (onPick ?? open)(e)}>
            <Thumb exercise={e} />
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="name">{e.name}</span>
              <span className="muted">{musclesOf(e)}</span>
              {blocked.has(e.id) && <span className="warn-text" style={{ fontSize: 12 }}>Not in my gym</span>}
            </span>
          </button>
        ))}
      </div>
      {detail}
    </div>
  )
}
