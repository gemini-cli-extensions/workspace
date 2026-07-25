CREATE TABLE `asset_events` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`user_sub` text NOT NULL,
	`action` text NOT NULL,
	`detail` text,
	`tool_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `workspace_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspace_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_sub` text NOT NULL,
	`asset_type` text NOT NULL,
	`google_id` text NOT NULL,
	`title` text,
	`url` text,
	`first_seen_at` integer NOT NULL,
	`last_touched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_assets_user_sub_asset_type_google_id_unique` ON `workspace_assets` (`user_sub`,`asset_type`,`google_id`);