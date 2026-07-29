CREATE TABLE `gmail_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`capture_mode` text DEFAULT 'none' NOT NULL,
	`capture_attachments` integer DEFAULT false NOT NULL,
	`attachment_store` text,
	`attachment_drive_folder_id` text,
	`filters_json` text,
	`created_via` text DEFAULT 'sync' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gmail_message_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`filename` text,
	`mimetype` text,
	`md5` text,
	`r2_key` text,
	`drive_id` text,
	`drive_url` text,
	`ocr_text` text,
	`rag_uuid` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gmail_message_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`email` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gmail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`account` text NOT NULL,
	`subject` text,
	`snippet` text,
	`body_text` text,
	`rag_uuid` text,
	`label_ids_json` text,
	`internal_date` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gmail_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`subject` text,
	`snippet` text,
	`history_id` text,
	`label_ids_json` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
