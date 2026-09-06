CREATE TABLE `need_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`message` text NOT NULL,
	`answers` text NOT NULL,
	`supplement` text NOT NULL,
	`analysis` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wish_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`wish_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wish_id`) REFERENCES `wishes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_wish_votes_wish_actor` ON `wish_votes` (`wish_id`,`actor_id`);--> statement-breakpoint
ALTER TABLE `wishes` ADD `actor_id` text;