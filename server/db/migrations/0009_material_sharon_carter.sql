CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_normalized_name_unique` ON `categories` (`normalized_name`);
--> statement-breakpoint
-- Seed the predefined categories (issue #23), pre-verified.
INSERT INTO `categories` (`name`, `normalized_name`, `verified`, `created_at`) VALUES
	('Ropa', 'ropa', 1, unixepoch()),
	('Calzado', 'calzado', 1, unixepoch()),
	('Bisutería', 'bisutería', 1, unixepoch()),
	('Perfumería', 'perfumería', 1, unixepoch()),
	('Maquillaje', 'maquillaje', 1, unixepoch()),
	('Peluquería', 'peluquería', 1, unixepoch()),
	('Accesorios', 'accesorios', 1, unixepoch());
--> statement-breakpoint
-- Backfill the registry with distinct categories already present on existing
-- purchases, for admin visibility/review only — this does NOT rewrite the
-- existing purchase_events.category text (normalization applies going
-- forward only).
INSERT INTO `categories` (`name`, `normalized_name`, `verified`, `created_at`)
SELECT DISTINCT `category`, LOWER(TRIM(`category`)), 0, unixepoch()
FROM `purchase_events`
WHERE LOWER(TRIM(`category`)) NOT IN (SELECT `normalized_name` FROM `categories`);