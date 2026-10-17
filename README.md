# A Bloo Bloo Stats

Private stats dashboard for the EA Sports FC 27 Pro Clubs club **A Bloo Bloo**, served at https://clubs.marabine.co.uk.

The Cloudflare Worker polls EA's Pro Clubs API every 5 minutes, keeps every match in D1 and serves a React Router dashboard.

- Domain glossary: [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr](docs/adr)
- Contributor and agent guide: [CLAUDE.md](CLAUDE.md)
- Work tracking: Linear team CLUBS, project "v1 — A Bloo Bloo Stats"

```sh
pnpm install
pnpm dev          # local dev server (workerd via the Cloudflare Vite plugin)
pnpm test:e2e     # Playwright end-to-end tests against the production build
```
