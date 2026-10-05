// InBody result sheet fields. The keys are stored in body_scans.metrics; the same list drives the
// form, the prompt for the AI (in-app or pasted into another AI) and the check of its answer.
const field = (key, label, unit, min, max) => ({ key, label, unit, min, max })
const limbs = (kind, max) => [
  field(`${kind}_left_arm`, 'Left arm', 'kg', 0, max),
  field(`${kind}_right_arm`, 'Right arm', 'kg', 0, max),
  field(`${kind}_trunk`, 'Trunk', 'kg', 0, max * 3),
  field(`${kind}_left_leg`, 'Left leg', 'kg', 0, max),
  field(`${kind}_right_leg`, 'Right leg', 'kg', 0, max),
]

export const SECTIONS = [
  { title: 'Body composition', fields: [
    field('weight', 'Weight', 'kg', 20, 400),
    field('smm', 'Skeletal muscle mass', 'kg', 5, 150),
    field('body_fat_mass', 'Body fat mass', 'kg', 0, 300),
    field('pbf', 'Percent body fat', '%', 1, 80),
    field('bmi', 'BMI', 'kg/m²', 8, 100),
    field('total_body_water', 'Total body water', 'L', 5, 150),
    field('protein', 'Protein', 'kg', 1, 50),
    field('minerals', 'Minerals', 'kg', 0.5, 20),
    field('fat_free_mass', 'Fat free mass', 'kg', 10, 250),
  ] },
  { title: 'Scores and research', fields: [
    field('inbody_score', 'InBody score', 'points', 0, 150),
    field('visceral_fat', 'Visceral fat level', 'level', 1, 30),
    field('waist_hip_ratio', 'Waist-hip ratio', '', 0.4, 2),
    field('bmr', 'Basal metabolic rate', 'kcal', 500, 5000),
    field('phase_angle', 'Phase angle', '°', 1, 20),
    field('smi', 'SMI', 'kg/m²', 2, 20),
    field('target_weight', 'Target weight', 'kg', 20, 400),
    field('recommended_kcal', 'Recommended calorie intake', 'kcal', 500, 10000),
  ] },
  { title: 'Segmental lean', fields: limbs('lean', 40) },
  { title: 'Segmental fat', fields: limbs('fat', 40) },
]

export const FIELDS = SECTIONS.flatMap((s) => s.fields)

export const PROMPT = `Read this InBody result sheet. Reply with one JSON object only, no prose, no markdown.
Keys: "day" = the test date as "YYYY-MM-DD", plus the keys below. Each value is a plain number in the unit given, or null if the sheet does not show it. Use the measured value, never the normal range in brackets. For segmental analysis use the kg value, not the %, and follow the sheet's Left/Right labels.
${FIELDS.map((f) => `"${f.key}": ${f.label}${f.unit ? ` (${f.unit})` : ''}`).join('\n')}`

const DAY = /^\d{4}-\d{2}-\d{2}$/

// Checks an answer from the AI, pasted JSON or the form (strings). Returns the valid date (or
// undefined), the numbers within range, and the labels of values that were given but invalid.
export function parseScan(answer) {
  const day = typeof answer?.day === 'string' && DAY.test(answer.day) && !isNaN(Date.parse(answer.day)) ? answer.day : undefined
  const metrics = {}
  const invalid = []
  for (const f of FIELDS) {
    const raw = answer?.[f.key]
    if (raw == null || raw === '') continue
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
    if (Number.isFinite(n) && n >= f.min && n <= f.max) metrics[f.key] = n
    else invalid.push(f.label)
  }
  return { day, metrics, invalid }
}

// Pasted text from another AI may wrap the object in a ``` fence or a sentence.
export const jsonIn = (text) => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
