ALTER TABLE `purchase_photos` ADD COLUMN `created_at` integer;

CREATE UNIQUE INDEX `purchase_photos_purchase_event_slot_unique`
ON `purchase_photos` (`purchase_event_id`, `slot`);

CREATE INDEX `purchase_photos_purchase_event_id_idx`
ON `purchase_photos` (`purchase_event_id`);

CREATE INDEX `purchase_photos_user_id_idx`
ON `purchase_photos` (`user_id`);