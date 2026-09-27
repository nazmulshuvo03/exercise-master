import Papa from 'papaparse'
import csv from '../../exercises.csv?raw'

const rows = Papa.parse(csv.replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data

export const exercises = rows.map((r) => ({
  id: `${r['Body Part']}-${r['Serial No']}`,
  bodyPart: r['Body Part'],
  name: r.Exercise,
  tags: r.Tags.split(',').map((t) => t.trim()).filter(Boolean),
  description: r.Description,
  help: r.Help,
  images: Array.from({ length: 10 }, (_, i) => r[`Image ${i + 1}`]).filter(Boolean),
}))

// body parts in CSV order
export const bodyParts = [...new Set(exercises.map((e) => e.bodyPart))]
