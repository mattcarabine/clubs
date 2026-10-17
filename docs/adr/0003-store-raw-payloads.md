# Store Raw Payloads alongside normalised tables

Every EA response we act on is stored verbatim, as a Raw Payload in D1, and the normalised tables (Matches, Appearances, Snapshots) are derived from it. EA's API is unofficial, all values are strings, field names change between FC versions, and the `match_event_aggregate_*` counters are only partly decoded. Keeping the raw data lets us add metrics or fix parsing later by rebuilding the tables, without losing history, and gives us real fixtures for tests.
