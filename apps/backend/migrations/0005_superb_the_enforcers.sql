CREATE TABLE `task_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_labels_project_name_unique` ON `task_labels` (`project_id`,`name`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `label_id` text REFERENCES task_labels(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `color`;--> statement-breakpoint
-- Seed DEFAULT_LABELS for existing projects; one statement per label so rowid keeps their order.
INSERT INTO `task_labels` (`id`, `project_id`, `name`, `color`, `created_at`) SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), `id`, 'バグ報告', '#e5484d', `created_at` FROM `projects`;--> statement-breakpoint
INSERT INTO `task_labels` (`id`, `project_id`, `name`, `color`, `created_at`) SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), `id`, '更新依頼', '#3e63dd', `created_at` FROM `projects`;--> statement-breakpoint
INSERT INTO `task_labels` (`id`, `project_id`, `name`, `color`, `created_at`) SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), `id`, 'その他', '#8b8d98', `created_at` FROM `projects`;
