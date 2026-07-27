CREATE TABLE `global_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`job_url` text NOT NULL,
	`error_message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`trigger` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `health_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`details` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`ai_suggestion` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `health_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `health_test_definitions` (
	`name` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`timeout_ms` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_name` text NOT NULL,
	`status` text NOT NULL,
	`response_time` integer,
	`error_message` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `best_practices` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`rule` text NOT NULL,
	`rationale` text NOT NULL,
	`source_url` text,
	`tags` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hitl_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`instance_name` text NOT NULL,
	`action_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`decision_reason` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE TABLE `mcp_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`server_name` text NOT NULL,
	`tool_name` text NOT NULL,
	`request` text,
	`response` text,
	`success` integer DEFAULT false NOT NULL,
	`error_message` text,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dashboard_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metric_name` text NOT NULL,
	`metric_value` real NOT NULL,
	`metric_type` text NOT NULL,
	`category` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`owner` text DEFAULT 'you' NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`task_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assignee` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`due_date` integer,
	`progress` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`author` text DEFAULT 'you' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text DEFAULT 'you' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metrics_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`metric` text NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`accent_color` text DEFAULT '#6366f1' NOT NULL,
	`font_size` text DEFAULT 'md' NOT NULL,
	`density` text DEFAULT 'comfortable' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`date_format` text DEFAULT 'MM/DD/YYYY' NOT NULL,
	`time_format` text DEFAULT '12h' NOT NULL,
	`number_format` text DEFAULT 'en-US' NOT NULL,
	`animations` integer DEFAULT true NOT NULL,
	`reduced_motion` integer DEFAULT false NOT NULL,
	`high_contrast` integer DEFAULT false NOT NULL,
	`screen_reader` integer DEFAULT false NOT NULL,
	`keyboard_shortcuts` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`secret` text,
	`active` integer DEFAULT true NOT NULL,
	`last_status` text,
	`last_triggered_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`category` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`actor` text,
	`entity_type` text,
	`entity_id` text,
	`href` text,
	`created_at` integer NOT NULL
);
