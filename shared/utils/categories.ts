export const PREDEFINED_CATEGORIES = [
  'Ropa',
  'Calzado',
  'Bisutería',
  'Perfumería',
  'Maquillaje',
  'Peluquería',
  'Accesorios'
] as const

// Abuse protection: cap how many not-yet-verified categories one user can introduce.
export const MAX_UNVERIFIED_CATEGORIES_PER_USER = 10

export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

// Unique key used for de-duplication (lowercased, whitespace-collapsed).
export function categoryMatchKey(raw: string): string {
  return normalizeCategoryName(raw).toLowerCase()
}

// Canonical display form stored the first time a category name is seen.
export function toCanonicalCategoryLabel(raw: string): string {
  return normalizeCategoryName(raw)
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
