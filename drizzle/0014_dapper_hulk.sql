PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_gmail_message_bodies` (
	`message_id` text PRIMARY KEY NOT NULL,
	`body_text` text,
	`size_bytes` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `gmail_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_gmail_message_bodies`("message_id", "body_text", "size_bytes", "created_at") SELECT "message_id", "body_text", "size_bytes", "created_at" FROM `gmail_message_bodies`;--> statement-breakpoint
DROP TABLE `gmail_message_bodies`;--> statement-breakpoint
ALTER TABLE `__new_gmail_message_bodies` RENAME TO `gmail_message_bodies`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `gmail_message_bodies_created_at_idx` ON `gmail_message_bodies` (`created_at`);