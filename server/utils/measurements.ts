import { z } from 'h3-zod'

// ---------------------------------------------------------------------------
// Scale helpers
// ---------------------------------------------------------------------------

export const toX100 = (value: number) => Math.round(value * 100)
export const toX10 = (value: number) => Math.round(value * 10)
export const fromX100 = (value: number | null) => value === null ? null : value / 100
export const fromX10 = (value: number | null) => value === null ? null : value / 10

// ---------------------------------------------------------------------------
// Field registry – single source of truth for all numeric measurement fields
// ---------------------------------------------------------------------------

export type MeasurementKey = 'weightKg' | 'heightCm' | 'chestCm' | 'waistCm' | 'hipsCm' | 'shoulderWidthCm' | 'sleeveLengthCm' | 'neckCm' | 'inseamCm' | 'thighCm' | 'footCm'

export type MeasurementFieldDef = { key: MeasurementKey, scale: 10 | 100 }

export const measurementFields: MeasurementFieldDef[] = [
  { key: 'weightKg', scale: 100 },
  { key: 'heightCm', scale: 10 },
  { key: 'chestCm', scale: 10 },
  { key: 'waistCm', scale: 10 },
  { key: 'hipsCm', scale: 10 },
  { key: 'shoulderWidthCm', scale: 10 },
  { key: 'sleeveLengthCm', scale: 10 },
  { key: 'neckCm', scale: 10 },
  { key: 'inseamCm', scale: 10 },
  { key: 'thighCm', scale: 10 },
  { key: 'footCm', scale: 10 }
]

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const numericMeasurementFields = {
  weightKg: z.coerce.number().positive().optional(),
  heightCm: z.coerce.number().positive().optional(),
  chestCm: z.coerce.number().positive().optional(),
  waistCm: z.coerce.number().positive().optional(),
  hipsCm: z.coerce.number().positive().optional(),
  shoulderWidthCm: z.coerce.number().positive().optional(),
  sleeveLengthCm: z.coerce.number().positive().optional(),
  neckCm: z.coerce.number().positive().optional(),
  inseamCm: z.coerce.number().positive().optional(),
  thighCm: z.coerce.number().positive().optional(),
  footCm: z.coerce.number().positive().optional()
}

const metaFields = {
  recordedAt: z.coerce.date().optional(),
  source: z.string().min(1).max(30).optional(),
  notes: z.string().max(500).optional()
}

/** Used for POST (create) and bulk upload – weightKg is required. */
export const measurementCreateSchema = z.object({
  ...numericMeasurementFields,
  weightKg: z.coerce.number().positive(),
  ...metaFields
})

/** Used for PATCH (update) – all fields optional. */
export const measurementPatchSchema = z.object({
  ...numericMeasurementFields,
  ...metaFields
})

export type MeasurementCreateInput = z.infer<typeof measurementCreateSchema>
export type MeasurementPatchInput = z.infer<typeof measurementPatchSchema>

// ---------------------------------------------------------------------------
// Encode helpers (user input → DB storage)
// ---------------------------------------------------------------------------

const encodeScaled = (value: number, scale: 10 | 100) =>
  scale === 100 ? toX100(value) : toX10(value)

/** Returns all numeric fields encoded for DB insert (null when not provided). weightKg is always number since it is required in MeasurementCreateInput. */
export const encodeMeasurementInsert = (input: MeasurementCreateInput) => ({
  weightKg: toX100(input.weightKg),
  ...Object.fromEntries(
    measurementFields.filter(f => f.key !== 'weightKg').map(({ key, scale }) => [
      key,
      input[key] !== undefined ? encodeScaled(input[key] as number, scale) : null
    ])
  ) as Record<Exclude<MeasurementKey, 'weightKg'>, number | null>
})

/** Returns only the provided numeric fields encoded for DB update (partial). */
export const encodeMeasurementPatch = (input: MeasurementPatchInput) => {
  const result: Record<string, unknown> = {}
  for (const { key, scale } of measurementFields) {
    if (input[key] !== undefined) {
      result[key] = encodeScaled(input[key] as number, scale)
    }
  }
  if (input.recordedAt !== undefined) result.recordedAt = input.recordedAt
  if (input.source !== undefined) result.source = input.source
  if (input.notes !== undefined) result.notes = input.notes
  return result
}

// ---------------------------------------------------------------------------
// Decode helpers (DB storage → human-readable output)
// ---------------------------------------------------------------------------

export type MeasurementSource = Record<MeasurementKey, number | null>

export const fromScaled = (value: number | null, scale: 10 | 100) =>
  scale === 100 ? fromX100(value) : fromX10(value)

/** Decodes all scaled fields from a DB row back to real-world values. */
export const decodeMeasurement = (source: MeasurementSource) =>
  Object.fromEntries(
    measurementFields.map(({ key, scale }) => [key, fromScaled(source[key], scale)])
  ) as Record<MeasurementKey, number | null>
