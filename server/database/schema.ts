import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tier: text('tier', { enum: ['free', 'premium', 'enterprise'] }).notNull().default('free'),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status', { enum: ['active', 'cancelled', 'past_due'] }),
  loginProvider: text('login_provider', { enum: ['github', 'google', 'instagram'] }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

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
  footCm: integer('foot_cm_x10'),
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
  notes: text('notes'),
  price: real('price')
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
  thighCm: integer('thigh_cm_x10'),
  footCm: integer('foot_cm_x10')
})

export const purchasePhotos = sqliteTable('purchase_photos', {
  id: integer('id').primaryKey(),
  purchaseEventId: integer('purchase_event_id').notNull(),
  userId: text('user_id').notNull().$type<number | string>(),
  storageKey: text('storage_key').notNull(),
  slot: integer('slot', { mode: 'number' }).notNull(), // 1, 2, or 3
  mimeType: text('mime_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  bytes: real('bytes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
}, table => ({
  purchaseEventSlotUnique: uniqueIndex('purchase_photos_purchase_event_slot_unique').on(table.purchaseEventId, table.slot),
  purchaseEventIdIdx: index('purchase_photos_purchase_event_id_idx').on(table.purchaseEventId),
  userIdIdx: index('purchase_photos_user_id_idx').on(table.userId)
}))
