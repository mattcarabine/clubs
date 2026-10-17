ALTER TABLE `matches` ADD `our_skill_rating` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `opponent_skill_rating` integer;--> statement-breakpoint
CREATE INDEX `matches_unrated_idx` ON `matches` (`played_at`) WHERE our_skill_rating IS NULL;