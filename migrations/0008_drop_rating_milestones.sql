-- CLUBS-52: the only rating feat is now a Perfect rating (10.0), so drop the
-- stored 9.0+ "rating" and "personal-best-rating" Milestones and their
-- comments. The next Poll that stores data re-detects Perfect ratings.
DELETE FROM `ai_writeups`
WHERE `kind` = 'milestone'
  AND `subject_key` IN (
    SELECT CAST(`id` AS TEXT) FROM `milestones`
    WHERE `kind` IN ('rating', 'personal-best-rating')
  );
--> statement-breakpoint
DELETE FROM `milestones` WHERE `kind` IN ('rating', 'personal-best-rating');
