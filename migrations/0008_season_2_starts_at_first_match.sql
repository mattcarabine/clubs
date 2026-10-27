-- Custom SQL migration file, put your code below! --
-- Production's Season 2 was detected on 2026-10-26 23:35:52 UTC, in the
-- relay's first Poll after EA blocked us, together with all nine of its
-- Matches (from 2026-10-22). It was stamped with that Poll's time, after
-- every one of them, so none counted in Season 2 or its Campaigns. Move its
-- start to its first Match, as the Poll now dates new Seasons. Guarded on the
-- exact stored value and Match, so it changes nothing in any other database.
UPDATE `seasons`
SET `started_at` = (SELECT `played_at` FROM `matches` WHERE `match_id` = '128238697530467')
WHERE `number` = 2
  AND `started_at` = 1793057752178
  AND EXISTS (SELECT 1 FROM `matches` WHERE `match_id` = '128238697530467');
