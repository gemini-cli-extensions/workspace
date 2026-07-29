CREATE TABLE `render_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_file_id` text,
	`r2_key` text NOT NULL,
	`mime_type` text DEFAULT 'image/png' NOT NULL,
	`page_count` integer,
	`created_by_sub` text,
	`created_at` integer NOT NULL
);
