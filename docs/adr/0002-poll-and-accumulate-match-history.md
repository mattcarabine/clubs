# Poll EA every 5 minutes and keep every Match ourselves

EA's `clubs/matches` returns at most the 10 most recent Matches per Match Type, with no paging, so long-term history only exists if we capture it ourselves. We Poll every 5 minutes, which matches EA's `max-age=300` cache, so polling faster gains nothing. We deduplicate by match ID and keep every Match of every Match Type, including Friendlies, for both Our Club and Opponents. History starts at go-live; earlier Matches cannot be recovered.
