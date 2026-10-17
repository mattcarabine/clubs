# Host on Cloudflare Workers + D1 within the free plan

The dashboard, the Poll (Cron Trigger) and storage (D1) all live in a single Cloudflare Worker, built with React Router v7 in framework mode and served from a subdomain of a Cloudflare-managed domain. Cloudflare was the owner's preferred host. Wrangler, Miniflare and local D1 run the whole loop locally, and the Worker fits within free-plan limits. The free plan is a hard constraint: per-invocation CPU limits, the Cron Trigger allowance and D1 daily read/write quotas shape the design, so design changes must be checked against them.
