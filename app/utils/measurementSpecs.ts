export type MeasurementSpec = {
  key: string
  label: string
  unit: 'kg' | 'cm'
}

/** Display metadata for all numeric measurement fields, in canonical order. */
export const measurementSpecs = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' },
  { key: 'heightCm', label: 'Altura', unit: 'cm' },
  { key: 'chestCm', label: 'Pecho', unit: 'cm' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm' },
  { key: 'hipsCm', label: 'Cadera', unit: 'cm' },
  { key: 'shoulderWidthCm', label: 'Ancho de hombros', unit: 'cm' },
  { key: 'sleeveLengthCm', label: 'Largo de manga', unit: 'cm' },
  { key: 'neckCm', label: 'Cuello', unit: 'cm' },
  { key: 'inseamCm', label: 'Tiro', unit: 'cm' },
  { key: 'thighCm', label: 'Muslo', unit: 'cm' },
  { key: 'footCm', label: 'Pie', unit: 'cm' }
] as const satisfies readonly MeasurementSpec[]
