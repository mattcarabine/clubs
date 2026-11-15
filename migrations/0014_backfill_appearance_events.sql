-- Custom SQL migration file, put your code below! --
-- CLUBS-84: fill every stored Appearance's Match Events from the Raw Payload
-- its Match was first parsed from, as the Poll now does for new Matches. The
-- four `match_event_aggregate_*` strings ("217:5,24:12") are joined and turned
-- into a JSON object ({"217":5,"24":12}). A player whose strings are empty, or
-- do not make valid JSON, is left null.
UPDATE `appearances`
SET `events` = `source`.`events`
FROM (
  SELECT
    `matches`.`match_id` AS `match_id`,
    `player`.`key` AS `player_id`,
    '{"' || replace(replace(
      trim(
        coalesce(json_extract(`player`.`value`, '$.match_event_aggregate_0'), '') || ',' ||
        coalesce(json_extract(`player`.`value`, '$.match_event_aggregate_1'), '') || ',' ||
        coalesce(json_extract(`player`.`value`, '$.match_event_aggregate_2'), '') || ',' ||
        coalesce(json_extract(`player`.`value`, '$.match_event_aggregate_3'), ''),
        ','
      ),
      ',', ',"'), ':', '":') || '}' AS `events`
  FROM `matches`
    JOIN `raw_payloads` AS `payload` ON `payload`.`id` = `matches`.`raw_payload_id`,
    json_each(`payload`.`body`) AS `match`,
    json_each(`match`.`value`, '$.players') AS `club`,
    json_each(`club`.`value`) AS `player`
  WHERE json_valid(`payload`.`body`)
    AND json_extract(`match`.`value`, '$.matchId') = `matches`.`match_id`
) AS `source`
WHERE `appearances`.`match_id` = `source`.`match_id`
  AND `appearances`.`player_id` = `source`.`player_id`
  AND `appearances`.`events` IS NULL
  AND json_valid(`source`.`events`)
  AND `source`.`events` GLOB '{"[0-9]*'
  AND `source`.`events` NOT GLOB '*[^0-9:,"{}]*'
  AND `source`.`events` NOT LIKE '%,,%';
