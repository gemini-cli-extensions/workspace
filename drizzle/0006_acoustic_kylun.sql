CREATE TABLE `template_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`template_type` text NOT NULL,
	`drive_id` text NOT NULL,
	`drive_url` text NOT NULL,
	`tags` text,
	`created_by_sub` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
