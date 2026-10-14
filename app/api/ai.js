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
  week: ({ week, days, history, trend, body, catalog, note, goal }) => `Plan the gym days in "days" the way an experienced personal trainer would. Work through these steps before you choose:
1. History: for each day's muscle group, find its last 2-3 sessions in "history" and which sub-muscles (catalog tags), angles and movement patterns they hit, and whether reps or load went up. "history" shows what the user did and, when the app had prescribed it, what was planned: compare them.
2. Variation: bias each new session toward the sub-muscles and angles the last session of that group hit least (for example incline after a week of flat pressing, the long head after short-head curls, hamstrings after a quad-heavy leg day). This is a preference, not a rule: keep 1-2 key compound lifts from last time when the user is progressing on them (progressive overload needs the same lift for a few weeks), and rotate the accessory work around them.
3. Balance: across the session cover the group's main sub-muscles; mix free weights, cables and machines; order big compound lifts first, then isolation work.
4. Week: "week" lists every day of this plan week; "planned" on a day is what the user will already do then. Read those days and "history" together. Do not hit a muscle hard that was trained heavily the day before or will be the day after (for example front delts next to a chest pressing day, biceps next to a heavy back day), and make the new session complement the rest of the week instead of repeating its angles.
5. Body: "body" holds the user's InBody scans, oldest first (smm = skeletal muscle mass, pbf = percent body fat, lean_* and fat_* = segmental kg). Read the trend. Falling muscle or rising fat: favour big compound lifts. One limb clearly weaker in segmental lean: add unilateral (single-arm or single-leg) work for it. No scans: skip this step.
6. Goal: "goal" is the user's phase. bulk = eating in a surplus to build muscle: hypertrophy work with progressive overload; the main compound lifts heavy for 5-8 reps, other compounds 8-12, isolation 10-15 (12-20 for side delts, calves and abs), last sets close to failure; recovery is good, so volume can sit at the top of the range. cut = eating in a deficit: keep the load heavy to hold on to muscle, cut volume (fewer sets and exercises) and intensity techniques. maintain = in between.
7. Size: "main" and "core" on a day are [min, max] exercise counts. Choose the number inside that range from history (how much volume the user handled and recovered from), the body trend, the goal and "note".
8. Sets: for every exercise give its sets, each {"reps":n,"kg":n}. Decide them like a coach who watched every session, from the user's capability right now, not from a fixed rule:
- This lift: "recent" in catalog (its last sessions, oldest first) and "history". Did the user hit the planned reps or beat them? How much did reps fall across sets at the same load (a big drop means they were near failure, flat reps mean there was room)? How long since it was last done (after a long break, start lighter)?
- The whole picture: "trend" gives sets and kg volume per group for each of the last 8 weeks. Are the user's loads and reps rising across most lifts, stalling, or falling (fatigue, missed weeks)? Push harder when they are progressing well and recovering, hold or back off when they stall or volume dropped.
- Related lifts: use progress on similar movements and the same muscle to set loads for lifts not done recently or never done (for example incline press from flat press, leaving 2-3 reps in reserve for a new lift).
- The goal and the body trend.
Choose the change in load or reps yourself: it can be none, a small step, or a bigger jump when the user clearly outperformed the plan. Round the kg to what the equipment allows (barbells in 2.5 kg steps, dumbbells mostly 1-2 kg, machine stacks often 2.5-5 kg). Progress by reps instead of load when that fits better. "units" tells what the numbers mean: ["Reps","kg"] = reps and kg (kg 0 = body weight, more = added load); ["Reps"] = reps only, kg 0; ["Minutes","km"] or ["Seconds"] = reps holds the minutes or seconds and kg the km or other load. Sets may differ (ramping up to a top set, or a back-off set).
9. Techniques: supersets and drop sets are optional tools, not a quota. Most sessions need neither. Decide per session the way an experienced gym instructor would, and add one only when this session clearly gains from it: for example the muscle is lagging or has stalled across recent sessions, the session would otherwise run long, or the user is recovering well and needs more stimulus on a final isolation move. Do not add them by habit, and do not repeat them on every day of the week.
- Superset (same "superset" letter on consecutive exercises, done back to back with rest after the round, at most 2 per session): only after the heavy main lifts, in the second half of the session. Pair with a clear purpose: post-exhaust (a compound, then an isolation move for the same muscle, such as dumbbell press then cable fly), two isolation moves for different heads or functions of the day's muscle (such as incline curl then hammer curl), or a core exercise between sets of a light isolation move. Both exercises must be usable together without walking across a busy gym: the same cable station, the same pair of dumbbells, or a bench next to the machine. Never pair two heavy compounds, two lifts that both load the lower back, or a lift that needs full strength with one that tires the muscle that stabilises it. Give both exercises the same number of sets.
- Drop set (at most 1-2 exercises per session; sets with "drop":true after the last working set, 1-2 drops of about 20-30% less kg each, done with no rest): on the last 1-2 isolation exercises for the day's main muscle, on a machine, cable stack or dumbbell rack where the weight changes in seconds; never on barbell lifts or on an exercise that is in a superset.
- "tip": up to 12 words. On the first exercise of a superset say why the pair works; on a drop-set exercise say how to drop; elsewhere use it for a cue that matters (rest-pause, tempo, pause at the stretch) or leave it out.
10. "avoid" on a day lists exercises the user rejected for that day. Choose others unless the group has no suitable alternative.
11. "keep" on a day lists exercises the user already started today: every one of them must be in that day's list. "note" is what the user says about the session (for example the gym is busy, a joint feels off, a machine is taken): follow it when you choose.
Hard rules, a day that breaks one is discarded: between the "main" counts of exercises whose group equals the day's group, plus between the "core" counts whose group is "Core"; only ids from catalog.
Return {"days":[{"day":"YYYY-MM-DD","focus":"<max 20 words: what this session emphasises and why>","exercises":[{"id":<catalog id>,"sets":[{"reps":8,"kg":60}],"superset":"A","tip":"..."}]}]} with one entry per day in "days", exercises in the order to do them; "superset" and "tip" only when used.
goal: ${JSON.stringify(['bulk', 'cut', 'maintain'].includes(goal) ? goal : 'maintain')}
week: ${JSON.stringify(week)}
days: ${JSON.stringify(days)}
note: ${JSON.stringify(typeof note === 'string' ? note.slice(0, 300) : null)}
history (last 3 weeks, oldest first): ${JSON.stringify(history)}
trend: ${JSON.stringify(trend)}
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
        max_tokens: 12000, // reasoning models spend much of this thinking; the answer now carries every set too
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
