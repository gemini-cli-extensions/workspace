CREATE TABLE `email_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`from_address` text NOT NULL,
	`from_name` text,
	`to_address` text NOT NULL,
	`subject` text DEFAULT '(no subject)' NOT NULL,
	`text_body` text DEFAULT '' NOT NULL,
	`html_body` text,
	`snippet` text DEFAULT '' NOT NULL,
	`folder` text DEFAULT 'inbox' NOT NULL,
	`labels` text DEFAULT '[]' NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`received_at` integer NOT NULL,
	`raw_size` integer DEFAULT 0 NOT NULL
);
