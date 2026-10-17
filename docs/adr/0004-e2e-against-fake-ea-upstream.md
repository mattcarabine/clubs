# End-to-end tests run against a fake EA upstream

The main test suite is Playwright driving the real local stack: `wrangler dev`, local D1 and the real scheduled handler. EA is replaced by a local fake server that replays recorded Raw Payloads, with the EA base URL configurable. CI never calls the live EA API, because it is unofficial, protected by Akamai bot detection and has had multi-day outages. A separate on-demand `test:live` smoke suite hits real EA and the deployed site. Unit tests are kept to stat formulas and parser edge cases; true end-to-end coverage is preferred.
