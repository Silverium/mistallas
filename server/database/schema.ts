import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey(),
  // allow either numeric or string GitHub identifier
  userId: text('user_id').notNull().$type<number | string>(),
  title: text('title').notNull(),
  completed: integer('completed').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

export const userMeasurements = sqliteTable('user_measurements', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull().$type<number | string>(),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
  weightKg: integer('weight_kg_x100').notNull(),
  heightCm: integer('height_cm_x10'),
  chestCm: integer('chest_cm_x10'),
  waistCm: integer('waist_cm_x10'),
  hipsCm: integer('hips_cm_x10'),
  shoulderWidthCm: integer('shoulder_width_cm_x10'),
  sleeveLengthCm: integer('sleeve_length_cm_x10'),
  neckCm: integer('neck_cm_x10'),
  inseamCm: integer('inseam_cm_x10'),
  thighCm: integer('thigh_cm_x10'),
  source: text('source').notNull().default('manual'),
  notes: text('notes')
})

export const purchaseEvents = sqliteTable('purchase_events', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull().$type<number | string>(),
  brand: text('brand').notNull(),
  category: text('category').notNull(),
  productType: text('product_type').notNull(),
  sizeLabel: text('size_label').notNull(),
  purchasedAt: integer('purchased_at', { mode: 'timestamp' }).notNull(),
  fitFeedback: text('fit_feedback'),
  notes: text('notes')
})

export const purchaseMeasurementSnapshots = sqliteTable('purchase_measurement_snapshots', {
  id: integer('id').primaryKey(),
  purchaseEventId: integer('purchase_event_id').notNull(),
  userId: text('user_id').notNull().$type<number | string>(),
  measuredAt: integer('measured_at', { mode: 'timestamp' }).notNull(),
  weightKg: integer('weight_kg_x100').notNull(),
  heightCm: integer('height_cm_x10'),
  chestCm: integer('chest_cm_x10'),
  waistCm: integer('waist_cm_x10'),
  hipsCm: integer('hips_cm_x10'),
  shoulderWidthCm: integer('shoulder_width_cm_x10'),
  sleeveLengthCm: integer('sleeve_length_cm_x10'),
  neckCm: integer('neck_cm_x10'),
  inseamCm: integer('inseam_cm_x10'),
  thighCm: integer('thigh_cm_x10')
})
