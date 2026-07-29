CREATE TABLE `gmail_message_bodies` (
	`message_id` text PRIMARY KEY NOT NULL,
	`body_text` text,
	`size_bytes` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `gmail_messages` DROP COLUMN `body_text`;