CREATE TABLE `wishes` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`votes` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
