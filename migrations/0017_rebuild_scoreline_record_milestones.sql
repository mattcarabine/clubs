-- CLUBS-92: a Rage Quit now counts in scoreline records (CLUBS-91), but the
-- stored ones were detected under the old rule. Delete them: a kind with
-- nothing stored backfills from every Match on the next detection run.
DELETE FROM `milestones`
WHERE `kind` IN ('record-win-margin', 'record-defeat-margin', 'record-goals');
