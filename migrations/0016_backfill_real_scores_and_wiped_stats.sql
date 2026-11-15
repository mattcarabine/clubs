-- Custom SQL migration file, put your code below! --
-- CLUBS-87: bring stored Matches in line with what the Poll now parses.
--
-- 1. A player who left a Match early has every named stat zeroed but keeps
--    their Match Events. Restore goals (214), assists (11), shots (217 + 218)
--    and passes (215 made, 215 + 216 attempted) from them.
UPDATE `appearances`
SET
  `goals` = coalesce(json_extract(`events`, '$."214"'), 0),
  `assists` = coalesce(json_extract(`events`, '$."11"'), 0),
  `shots` = coalesce(json_extract(`events`, '$."217"'), 0) + coalesce(json_extract(`events`, '$."218"'), 0),
  `passes_made` = coalesce(json_extract(`events`, '$."215"'), 0),
  `pass_attempts` = coalesce(json_extract(`events`, '$."215"'), 0) + coalesce(json_extract(`events`, '$."216"'), 0)
WHERE `seconds_played` > 0
  AND `events` IS NOT NULL
  AND json_valid(`events`)
  AND `goals` + `assists` + `shots` + `pass_attempts` + `tackle_attempts` = 0;
--> statement-breakpoint
-- 2. A player whose minutes and rating EA lost (0 seconds, 3.0) but whose
--    stats it kept did play: give them the Match's longest minutes and no
--    rating.
UPDATE `appearances`
SET
  `seconds_played` = (
    SELECT coalesce(max(`other`.`seconds_played`), 0)
    FROM `appearances` AS `other`
    WHERE `other`.`match_id` = `appearances`.`match_id`
  ),
  `rating` = NULL
WHERE `seconds_played` = 0
  AND `pass_attempts` + `shots` + `tackle_attempts` > 0;
--> statement-breakpoint
-- 3. When the side that stayed led by fewer than three, EA records a Rage
--    Quit as 3-0. Every player's `SCORE` in the Raw Payload carries their
--    club's real goals: make that the Match's score and keep EA's beside it.
UPDATE `matches`
SET
  `awarded_goals_for` = `matches`.`goals_for`,
  `awarded_goals_against` = `matches`.`goals_against`,
  `goals_for` = `source`.`goals_for`,
  `goals_against` = `source`.`goals_against`
FROM (
  SELECT
    `stored`.`match_id` AS `match_id`,
    max(CASE WHEN `club`.`key` <> `stored`.`opponent_club_id`
      THEN CAST(json_extract(`player`.`value`, '$.SCORE') AS INTEGER) END) AS `goals_for`,
    max(CASE WHEN `club`.`key` = `stored`.`opponent_club_id`
      THEN CAST(json_extract(`player`.`value`, '$.SCORE') AS INTEGER) END) AS `goals_against`
  FROM `matches` AS `stored`
    JOIN `raw_payloads` AS `payload` ON `payload`.`id` = `stored`.`raw_payload_id`,
    json_each(`payload`.`body`) AS `match`,
    json_each(`match`.`value`, '$.players') AS `club`,
    json_each(`club`.`value`) AS `player`
  WHERE `stored`.`dnf` = 1
    AND `stored`.`awarded_goals_for` IS NULL
    AND json_valid(`payload`.`body`)
    AND json_extract(`match`.`value`, '$.matchId') = `stored`.`match_id`
    AND json_extract(`player`.`value`, '$.SCORE') GLOB '[0-9]*'
    AND json_extract(`player`.`value`, '$.SCORE') NOT GLOB '*[^0-9]*'
  GROUP BY `stored`.`match_id`
) AS `source`
WHERE `matches`.`match_id` = `source`.`match_id`
  AND `source`.`goals_for` IS NOT NULL
  AND `source`.`goals_against` IS NOT NULL
  AND (`source`.`goals_for` <> `matches`.`goals_for`
    OR `source`.`goals_against` <> `matches`.`goals_against`);
