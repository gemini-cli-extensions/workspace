CREATE TABLE `drive_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`channel_id` text,
	`resource_id` text,
	`resource_state` text,
	`resource_uri` text,
	`message_number` text,
	`payload` text,
	`received_at` integer NOT NULL
);
