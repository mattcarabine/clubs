-- Custom SQL migration file, put your code below! --
-- CLUBS-72: fill every recorded club's crest from the latest stored
-- `clubs/matches` Raw Payload that lists it, as the Poll now does for new
-- Matches. Only all-digit IDs, as `toCrestAssetId` keeps; clubs with a crest
-- already, or none in any payload, are left alone.
UPDATE `clubs`
SET `crest_asset_id` = (
  SELECT json_extract(`club`.`value`, '$.details.customKit.crestAssetId')
  FROM `raw_payloads` AS `payload`,
    json_each(`payload`.`body`) AS `match`,
    json_each(`match`.`value`, '$.clubs') AS `club`
  WHERE `payload`.`endpoint` = 'clubs/matches'
    AND json_valid(`payload`.`body`)
    AND `club`.`key` = `clubs`.`club_id`
    AND json_extract(`club`.`value`, '$.details.customKit.crestAssetId') GLOB '[0-9]*'
    AND json_extract(`club`.`value`, '$.details.customKit.crestAssetId') NOT GLOB '*[^0-9]*'
    AND length(json_extract(`club`.`value`, '$.details.customKit.crestAssetId')) <= 12
  ORDER BY `payload`.`id` DESC
  LIMIT 1
)
WHERE `crest_asset_id` IS NULL;
