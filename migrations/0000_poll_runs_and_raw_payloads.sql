CREATE TABLE `poll_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`status` text NOT NULL,
	`requests` integer NOT NULL,
	`failures` integer NOT NULL,
	`payloads_stored` integer NOT NULL,
	`errors` text
);
--> statement-breakpoint
CREATE TABLE `raw_payloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`variant` text DEFAULT '' NOT NULL,
	`fetched_at` integer NOT NULL,
	`hash` text NOT NULL,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_payloads_request_idx` ON `raw_payloads` (`endpoint`,`variant`,"id" DESC);