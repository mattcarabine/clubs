# Poll EA directly from the Worker, with a home relay as a fallback

EA's Pro Clubs API is protected by Akamai bot detection, which often blocks datacenter IPs. A spike Worker sending a full set of Chrome-like request headers got 200s from Cloudflare (LHR) on its first run (2026-10-17), so the Worker's Cron Trigger polls EA directly. We're building on that before the 24-hour reachability run finishes. Its pass mark is 95% or more 200s, with no 403 streak longer than 30 minutes.

The fetching code is kept separate from the scheduled handler, so the same Poll can run as a Node script on the owner's always-on Mac mini and push Raw Payloads to an authenticated Worker ingest endpoint. That gives us a fallback if Akamai starts blocking Cloudflare, without a rewrite.
