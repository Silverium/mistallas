CREATE TABLE `purchase_photos` (
	`id` integer PRIMARY KEY NOT NULL,
	`purchase_event_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`slot` integer NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`bytes` real
);
