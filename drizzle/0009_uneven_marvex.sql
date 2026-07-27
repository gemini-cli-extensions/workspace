CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`account` text NOT NULL,
	`agent` text NOT NULL,
	`session_id` text,
	`thread_id` text,
	`google_file_id` text,
	`google_file_url` text,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`metadata_json` text
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`accounts_json` text NOT NULL,
	`agent` text NOT NULL,
	`action` text NOT NULL,
	`params_json` text NOT NULL,
	`prompt_text` text,
	`frequency` text NOT NULL,
	`schedule_spec` text,
	`schedule_ids_json` text,
	`index_to_d1` integer DEFAULT false NOT NULL,
	`index_vectorize_corpus` text,
	`status` text DEFAULT 'active' NOT NULL,
	`source` text DEFAULT 'ui' NOT NULL,
	`last_run_at` integer,
	`next_run_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`ts` integer DEFAULT (unixepoch()) NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`data_json` text
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text,
	`session_key` text NOT NULL,
	`title` text NOT NULL,
	`agent` text,
	`account` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `threads_key_unique` ON `threads` (`key`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`message_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`agent` text,
	`account` text,
	`metadata` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_thread_message_idx` ON `messages` (`thread_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `google_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`folder_id` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_slides` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `drive_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`parent_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `emails_indexed` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`thread_id` text NOT NULL,
	`subject` text NOT NULL,
	`from` text NOT NULL,
	`to` text NOT NULL,
	`snippet` text NOT NULL,
	`internal_date` integer NOT NULL,
	`labels_json` text,
	`vectorized` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `appscript_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`title` text NOT NULL,
	`parent_id` text,
	`url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
