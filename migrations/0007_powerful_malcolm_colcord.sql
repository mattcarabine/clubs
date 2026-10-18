CREATE TABLE `season_review_posts` (
	`season` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`posted_at` integer,
	`created_at` integer NOT NULL
);
