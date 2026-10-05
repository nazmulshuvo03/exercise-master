// Vercel function (and, in `npm run dev`, a Vite middleware): the only place that holds AI_API_KEY.
// It checks the Supabase session, counts the call against the user's daily cap, asks the model
// and returns its JSON. Business rules are validated in the browser (plan.js), not here.
// Only raw Node req/res APIs are used so Vercel and the dev middleware can share this file.
import { createClient } from '@supabase/supabase-js'
import { jsonIn, PROMPT as INBODY_PROMPT } from '../src/inbody.js'

const MAX_CALLS_PER_DAY = 30
const MAX_BODY = 100_000
const MAX_IMAGE = 3_000_000 // the browser sends a JPEG of at most 2000 px a side, well under this

const SYSTEM = 'You are a strength coach inside a workout app. Reply with one JSON object only, no prose, no markdown.'

const PROMPTS = {
  week: ({ week, days, history, body, catalog }) => `Plan the gym days in "days" the way an experienced personal trainer would. Work through these steps before you choose:
1. History: for each day's muscle group, find its last 2-3 sessions in "history" and which sub-muscles (catalog tags), angles and movement patterns they hit, and whether reps or load went up.
2. Variation: bias each new session toward the sub-muscles and angles the last session of that group hit least (for example incline after a week of flat pressing, the long head after short-head curls, hamstrings after a quad-heavy leg day). This is a preference, not a rule: keep 1-2 key compound lifts from last time when the user is progressing on them (progressive overload needs the same lift for a few weeks), and rotate the accessory work around them.
3. Balance: across the session cover the group's main sub-muscles; mix free weights, cables and machines; order big compound lifts first, then isolation work.
4. Week: "week" lists every day of this plan week; "planned" on a day is what the user will already do then. Read those days and "history" together. Do not hit a muscle hard that was trained heavily the day before or will be the day after (for example front delts next to a chest pressing day, biceps next to a heavy back day), and make the new session complement the rest of the week instead of repeating its angles.
5. Body: "body" holds the user's InBody scans, oldest first (smm = skeletal muscle mass, pbf = percent body fat, lean_* and fat_* = segmental kg). Read the trend. Falling muscle or rising fat: favour big compound lifts. One limb clearly weaker in segmental lean: add unilateral (single-arm or single-leg) work for it. No scans: skip this step.
6. "avoid" on a day lists exercises the user rejected for that day. Choose others unless the group has no suitable alternative.
Hard rules, a day that breaks one is discarded: exactly "main" exercises whose group equals the day's group, plus exactly "core" exercises whose group is "Core"; only ids from catalog.
Return {"days":[{"day":"YYYY-MM-DD","focus":"<max 20 words: what this session emphasises and why>","exercises":[id,...]}]} with one entry per day in "days", exercises in the order to do them.
week: ${JSON.stringify(week)}
days: ${JSON.stringify(days)}
history (last 3 weeks, oldest first): ${JSON.stringify(history)}
body: ${JSON.stringify(body)}
catalog: ${JSON.stringify(catalog)}`,

  swap: ({ exercise, dayExercises, candidates }) => `The user wants to skip or avoid "${exercise.name}" (tags: ${exercise.tags.join(', ')}). Pick the most similar replacement from candidates: same target muscle and movement pattern, and not a duplicate of what they already do today (${dayExercises.join(', ')}).
Return {"id":<candidate id>,"why":"<max 12 words>"}.
candidates: ${JSON.stringify(candidates)}`,

  inbody: ({ image }) => typeof image === 'string' && image.length < MAX_IMAGE && /^data:image\/(jpeg|png|webp);base64,/.test(image)
    ? [{ type: 'text', text: INBODY_PROMPT }, { type: 'image_url', image_url: { url: image } }]
    : undefined,
}

const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  try {
    const { AI_BASE_URL, AI_API_KEY, AI_MODEL, AI_VISION_MODEL, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = process.env
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
    const limit = body?.action === 'inbody' ? MAX_IMAGE + 1000 : MAX_BODY
    const prompt = body && JSON.stringify(body).length < limit ? PROMPTS[body.action]?.(body) : undefined
    if (!prompt) return send(res, 400, { error: 'Bad request' })

    const { data: allowed, error } = await supabase.rpc('ai_take_call', { max_calls: MAX_CALLS_PER_DAY })
    if (error) throw error
    if (!allowed) return send(res, 429, { error: 'Daily AI limit reached' })

    const ai = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // reading a photo needs a vision model; AI_VISION_MODEL is for when AI_MODEL is text-only
        model: body.action === 'inbody' ? AI_VISION_MODEL || AI_MODEL : AI_MODEL,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
        // no response_format: json_object mode makes some free models emit only whitespace until max_tokens
        max_tokens: 8000, // reasoning models spend much of this thinking through the week plan
      }),
      // a day plan took 36s alone and up to 167s with a week of days in parallel (free model);
      // Vercel stops the function at 300s (default with fluid compute)
      signal: AbortSignal.timeout(240_000),
    })
    if (ai.status === 429) return send(res, 503, { error: 'AI model is busy' }) // free models are rate-limited upstream
    if (!ai.ok) throw new Error(`model returned ${ai.status}: ${(await ai.text()).slice(0, 200)}`)
    const content = (await ai.json()).choices?.[0]?.message?.content ?? ''
    send(res, 200, jsonIn(content)) // the model may wrap the object in a ``` fence or a sentence
  } catch (err) {
    console.error('ai:', err)
    send(res, 502, { error: 'AI request failed' })
  }
}
