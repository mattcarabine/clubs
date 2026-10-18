CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`player_id` text,
	`value` real NOT NULL,
	`threshold` real,
	`position_group` text,
	`match_id` text NOT NULL,
	`achieved_at` integer NOT NULL,
	`detected_at` integer NOT NULL,
	`batch_key` text NOT NULL,
	`dedupe_key` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_dedupe_idx` ON `milestones` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `milestones_achieved_idx` ON `milestones` (`achieved_at`);--> statement-breakpoint
CREATE INDEX `milestones_player_idx` ON `milestones` (`player_id`);--> statement-breakpoint
CREATE INDEX `milestones_match_idx` ON `milestones` (`match_id`);--> statement-breakpoint
CREATE INDEX `milestones_batch_idx` ON `milestones` (`batch_key`);