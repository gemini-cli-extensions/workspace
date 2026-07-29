CREATE TABLE `braille_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_file_id` text,
	`source_url` text,
	`surface` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`anchor` text,
	`structure` text NOT NULL,
	`tags` text,
	`created_by_sub` text,
	`created_at` integer NOT NULL
);
