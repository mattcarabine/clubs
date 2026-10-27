-- Production's Season 1 Review was written while Season 2 still started at
-- its detection time, so its intro, outro and Award citations counted Season
-- 2's nine Matches (see 0009). Re-queue its job: the next drain rewrites it
-- from the corrected Season, storing new write-ups that pages show in place
-- of the old ones. Guarded on Season 2's first Match, so it changes nothing
-- in any other database. The Discord announcement is not sent again.
UPDATE `ai_jobs`
SET `status` = 'pending', `attempts` = 0, `next_attempt_at` = NULL,
  `last_error` = NULL, `finished_at` = NULL
WHERE `kind` = 'season-review'
  AND `subject_key` = '1'
  AND `status` = 'done'
  AND EXISTS (SELECT 1 FROM `matches` WHERE `match_id` = '128238697530467');
