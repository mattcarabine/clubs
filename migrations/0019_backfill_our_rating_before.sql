-- CLUBS-88: Our Club's Skill Rating going into each recorded Match: our
-- latest Snapshot taken before the Match's time (EA stamps full time) and
-- after the Match before it, so a reading one result stale is never used.
-- Matches with no such reading stay null and have no rating gap.
UPDATE `matches` SET `our_rating_before` = (
  SELECT json_extract(s.`stats`, '$.skillRating')
  FROM `snapshots` s
  WHERE s.`source` = 'clubs/overallStats'
    AND s.`subject` = 'club'
    AND s.`subject_key` IN (
      SELECT a.`club_id` FROM `appearances` a
      WHERE a.`match_id` = `matches`.`match_id`
        AND a.`club_id` <> `matches`.`opponent_club_id`
    )
    AND json_extract(s.`stats`, '$.skillRating') IS NOT NULL
    AND s.`taken_at` < `matches`.`played_at`
    AND s.`taken_at` > coalesce(
      (SELECT max(p.`played_at`) FROM `matches` p WHERE p.`played_at` < `matches`.`played_at`),
      0
    )
  ORDER BY s.`taken_at` DESC, s.`id` DESC
  LIMIT 1
)
WHERE `our_rating_before` IS NULL;
