import { supabase } from './supabase.js'

export async function fetchExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, body_part, name, tags, description, help, images')
    .order('id')
  if (error) throw error

  return data.map((r) => ({
    id: r.id,
    bodyPart: r.body_part,
    name: r.name,
    tags: r.tags,
    description: r.description,
    help: r.help,
    images: r.images,
  }))
}

// body parts in insertion (CSV) order
export const bodyPartsOf = (exercises) => [...new Set(exercises.map((e) => e.bodyPart))]
