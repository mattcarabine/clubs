# One static link-preview card, no per-page images

Shared links unfurl from Open Graph tags (CLUBS-38). Each page writes its own title and description from its `meta()`, but every page points `og:image` at the same committed 1200×630 PNG, `public/og-card.png`: the crest and club name on `shale-950`, drawn once by `pnpm og:card` (headless Chromium over HTML that uses the site's tokens and display font).

A per-Match card showing the score would look better in Discord, but rendering it at request time means an SVG-to-PNG step (Satori and resvg as WASM) inside the Worker. That breaks the free plan (ADR 0001): its 10 ms CPU limit per request is far below what rasterising a card takes, and the WASM and font would eat most of the 3 MB Worker size limit. Pre-rendering a card per Match at Poll time would need storage we do not have on the free plan (R2 needs a card on file). The title and description already carry the score line and result, so the static card is the brand and the text is the news.

Previews also mean letting the unfurl bots in: `public/robots.txt` allows Discordbot, WhatsApp, facebookexternalhit, Twitterbot, Slackbot and TelegramBot and disallows everyone else, and every response still carries `X-Robots-Tag: noindex, nofollow`, so a fetched page is never indexed.

Revisit if the club moves to a paid Workers plan or adds an image store.
