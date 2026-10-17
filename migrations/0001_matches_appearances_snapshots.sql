CREATE TABLE `appearances` (
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`club_id` text NOT NULL,
	`position_group` text,
	`goals` integer NOT NULL,
	`assists` integer NOT NULL,
	`shots` integer NOT NULL,
	`passes_made` integer NOT NULL,
	`pass_attempts` integer NOT NULL,
	`tackles_made` integer NOT NULL,
	`tackle_attempts` integer NOT NULL,
	`rating` real,
	`man_of_the_match` integer NOT NULL,
	`red_cards` integer NOT NULL,
	`saves` integer NOT NULL,
	`goals_conceded` integer NOT NULL,
	`clean_sheet` integer NOT NULL,
	`seconds_played` integer NOT NULL,
	PRIMARY KEY(`match_id`, `player_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`club_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appearances_player_idx` ON `appearances` (`player_id`);--> statement-breakpoint
CREATE TABLE `clubs` (
	`club_id` text PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`match_id` text PRIMARY KEY NOT NULL,
	`match_type` text NOT NULL,
	`played_at` integer NOT NULL,
	`opponent_club_id` text NOT NULL,
	`goals_for` integer NOT NULL,
	`goals_against` integer NOT NULL,
	`result` text NOT NULL,
	`dnf` integer NOT NULL,
	`raw_payload_id` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`opponent_club_id`) REFERENCES `clubs`(`club_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_payload_id`) REFERENCES `raw_payloads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matches_played_at_idx` ON `matches` (`played_at`);--> statement-breakpoint
CREATE TABLE `players` (
	`player_id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`persona_name` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`club_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raw_payload_id` integer NOT NULL,
	`taken_at` integer NOT NULL,
	`source` text NOT NULL,
	`subject` text NOT NULL,
	`subject_key` text NOT NULL,
	`player_id` text,
	`stats` text NOT NULL,
	FOREIGN KEY (`raw_payload_id`) REFERENCES `raw_payloads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshots_subject_idx` ON `snapshots` (`source`,`subject_key`,`taken_at`);--> statement-breakpoint
ALTER TABLE `poll_runs` ADD `matches_added` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `poll_runs` ADD `snapshots_added` integer DEFAULT 0 NOT NULL;