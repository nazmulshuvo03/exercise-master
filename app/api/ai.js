// Vercel function (and, in `npm run dev`, a Vite middleware): the only place that holds AI_API_KEY.
// It checks the Supabase session, counts the call against the user's daily cap, asks the model
// and returns its JSON. Business rules are validated in the browser (plan.js), not here.
// Only raw Node req/res APIs are used so Vercel and the dev middleware can share this file.
import { createClient } from '@supabase/supabase-js'

const MAX_CALLS_PER_DAY = 30
const MAX_BODY = 100_000

const SYSTEM = 'You are a strength coach inside a workout app. Reply with one JSON object only, no prose, no markdown.'

const PROMPTS = {
  week: ({ days, catalog }) => `Plan these gym days. For each day choose exactly "main" exercises whose group equals the day's group, plus exactly "core" exercises whose group is "Core". Use only ids from the catalog. Never repeat an exercise within the week. Prefer exercises with an old or null lastDone, cover different tags (sub-muscles) within a day, and put big compound lifts first.
Return {"days":[{"day":"YYYY-MM-DD","exercises":[id,...]}]} with one entry per day below.
days: ${JSON.stringify(days)}
catalog: ${JSON.stringify(catalog)}`,

  swap: ({ exercise, dayExercises, candidates }) => `The user wants to skip or avoid "${exercise.name}" (tags: ${exercise.tags.join(', ')}). Pick the most similar replacement from candidates: same target muscle and movement pattern, and not a duplicate of what they already do today (${dayExercises.join(', ')}).
Return {"id":<candidate id>,"why":"<max 12 words>"}.
candidates: ${JSON.stringify(candidates)}`,
}

const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  try {
    const { AI_BASE_URL, AI_API_KEY, AI_MODEL, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = process.env
    if (!AI_BASE_URL || !AI_API_KEY || !AI_MODEL) return send(res, 500, { error: 'AI is not configured' })
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })

    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return send(res, 401, { error: 'Sign in again' })

    const body = req.body
    const prompt = body && JSON.stringify(body).length < MAX_BODY ? PROMPTS[body.action]?.(body) : undefined
    if (!prompt) return send(res, 400, { error: 'Bad request' })

    const { data: allowed, error } = await supabase.rpc('ai_take_call', { max_calls: MAX_CALLS_PER_DAY })
    if (error) throw error
    if (!allowed) return send(res, 429, { error: 'Daily AI limit reached' })

    const ai = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
        // no response_format: json_object mode makes some free models emit only whitespace until max_tokens
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(90_000), // the free reasoning model took 6-56s in tests
    })
    if (!ai.ok) throw new Error(`model returned ${ai.status}: ${(await ai.text()).slice(0, 200)}`)
    const content = (await ai.json()).choices?.[0]?.message?.content ?? ''
    // the model may wrap the object in a ``` fence or a sentence; keep from the first { to the last }
    send(res, 200, JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)))
  } catch (err) {
    console.error('ai:', err)
    send(res, 502, { error: 'AI request failed' })
  }
}
