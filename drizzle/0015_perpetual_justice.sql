ALTER TABLE `gmail_message_attachments` ADD `size` integer;--> statement-breakpoint
ALTER TABLE `gmail_message_attachments` ADD `is_junk` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `gmail_message_attachments` ADD `skipped_rationale` text;--> statement-breakpoint
ALTER TABLE `gmail_message_attachments` ADD `is_dupe` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `gmail_message_attachments` ADD `dupe_rationale` text;--> statement-breakpoint
ALTER TABLE `gmail_message_attachments` ADD `dupe_parent_id` text;