CREATE TABLE `session_posts` (
	`session_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`polls_waited` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`posted_at` integer,
	`created_at` integer NOT NULL
);
