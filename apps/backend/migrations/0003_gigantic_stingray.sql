ALTER TABLE `tasks` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `color` text DEFAULT 'gray' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `archived_at` integer;