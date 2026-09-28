CREATE TABLE `task_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_attachments_project_id_idx` ON `task_attachments` (`project_id`);--> statement-breakpoint
ALTER TABLE `task_comments` ADD `edited_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `description_edited_at` integer;