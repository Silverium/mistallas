CREATE TABLE IF NOT EXISTS `purchase_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`brand` text NOT NULL,
	`category` text NOT NULL,
	`product_type` text NOT NULL,
	`size_label` text NOT NULL,
	`purchased_at` integer NOT NULL,
	`fit_feedback` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_measurement_snapshots` (
	`id` integer PRIMARY KEY NOT NULL,
	`purchase_event_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`measured_at` integer NOT NULL,
	`weight_kg_x100` integer NOT NULL,
	`height_cm_x10` integer,
	`chest_cm_x10` integer,
	`waist_cm_x10` integer,
	`hips_cm_x10` integer,
	`shoulder_width_cm_x10` integer,
	`sleeve_length_cm_x10` integer,
	`neck_cm_x10` integer,
	`inseam_cm_x10` integer,
	`thigh_cm_x10` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_measurements` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`weight_kg_x100` integer NOT NULL,
	`height_cm_x10` integer,
	`chest_cm_x10` integer,
	`waist_cm_x10` integer,
	`hips_cm_x10` integer,
	`shoulder_width_cm_x10` integer,
	`sleeve_length_cm_x10` integer,
	`neck_cm_x10` integer,
	`inseam_cm_x10` integer,
	`thigh_cm_x10` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`notes` text
);
