# Four tabs: Matches, Squad, Analysis, Milestones

By October 2026 the nav had seven tabs: Matchday, Squad, Matches, Opponents, Trends, Analysis and Milestones. They overlapped, and seven tabs didn't fit a phone, so the nav had to scroll sideways. On 2026-10-27 the owner agreed to cut it to four: **Matches · Squad · Analysis · Milestones**.

- **Matches is the home page (`/`).** Matchday repeated what other pages already showed. Its latest Match hero now leads the Matches list on its first page, and the page still refreshes itself after a Poll. Form watch moves to Squad, the EA club snapshot to Analysis, and the latest Milestone is already on Milestones. `/matches` and `/sessions` redirect to `/`.
- **Opponents leaves the nav, but its pages stay.** We almost never meet the same club twice, so a tab for Opponents earned little. `/opponents` and `/opponents/:id` still work by URL, and a Match page still links to its Opponent.
- **Trends merges into Analysis.** Both charted Win % by kick-off, both had a rolling-results chart, and Line-ups and Personnel answered the same question. Analysis already filters by Season and date, so the "over time" view is a filter setting rather than a page of its own. The Skill Rating history and the Division timeline move to an "Over time" section. `/trends` redirects to `/analysis`.
- **Analysis compares periods.** A date range compares with the same number of days just before it (the last 7 days against the 7 before them, never a year earlier). A Season compares with another Season. Campaigns are never compared, because each Division plays at a different level.

This ships in three steps: CLUBS-58 (Matches as home, Opponents out of the nav), CLUBS-59 (Trends into Analysis) and CLUBS-60 (period compare). Until CLUBS-59 lands, the nav keeps Trends as a fifth tab.

Consequences: there is no page about Opponents in general, and there is no landing page separate from the Match list. A new page must earn a tab by not overlapping these four. Otherwise it is reached by a link from one of them, as Compare, Sessions and Opponents are.
