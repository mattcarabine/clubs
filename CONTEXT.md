# A Bloo Bloo Stats

A private stats dashboard for the EA Sports FC 27 Pro Clubs club "A Bloo Bloo", built from match data recorded off EA's unofficial Pro Clubs API.

## Language

### Clubs and people

**Our Club**:
"A Bloo Bloo" (club ID 332191, platform `common-gen5`): the single club this tool exists for.
_Avoid_: Team, my club

**Opponent**:
Any club Our Club has played a Match against.
_Avoid_: Rival, enemy, other team

**Opponent humans**:
How many human players the Opponent fielded in a Match: its Appearances with minutes, since EA lists only humans and leaves AI fill-ins out. The Analysis page groups Matches by the exact count, in bands (1–3, 4–6, 7–9, 10–11), and against our own Squad Members playing (much fewer, slightly fewer, same, slightly more, much more, where much is 3 or more apart), each with how often either side quit.
_Avoid_: Real players, opponent size, lobby size

**Skill Rating**:
EA's rating of a club's strength (`skillRating` in `clubs/overallStats`). Each Match records both clubs' Skill Ratings at the time it was played.
_Avoid_: Elo, SR, club rating, strength

**Opponent Rating**:
The Opponent's Skill Rating at a Match, read within an hour of it. Matches recorded before ratings were captured are backfilled with the Opponent's current rating instead.
_Avoid_: Opposition strength, enemy rating

**Win Chance**:
Our Club's chance of a Win before kick-off, from the gap between our Skill Rating and the Opponent Rating. Fitted to our rated Competitive Matches (draws count as Dropped Points) once there are 20 of them; before that it is an Elo-style estimate, shown as "Estimate".
_Avoid_: Odds, win probability, expected result

**Billing**:
How a Win Chance billed Our Club before kick-off: **Favourites** at 55% or more, **Underdogs** at 45% or less, and a **Toss-up** between.
_Avoid_: Expected to win, odds-on

**Upset**:
A result against our Win Chance: an **Upset Win** from under 35%, or Dropped Points from over 65% (**Should have won**). It is a **big upset** from under 20% ("Big upset Win") or over 80% ("Should really have won").
_Avoid_: Shock, surprise result

**Squad Member**:
Anyone who has made an Appearance for Our Club, identified by their stable EA player ID (persona names can change; IDs don't). Our Club has no guests.
_Avoid_: Member, user, teammate, guest

**Former Squad Member**:
A Squad Member who has left Our Club; still counted in all-time views, hidden from current-squad views.
_Avoid_: Ex-player, inactive

**Roster**:
The hand-maintained overrides for Squad Members: display names and who is a Former Squad Member.
_Avoid_: Squad list, members list

### Matches

**Match**:
One completed game between Our Club and an Opponent, identified by EA's match ID.
_Avoid_: Game, fixture, result

**Match Type**:
EA's classification of a Match: League, Playoff or Friendly. The app shows only League and Playoff Matches: the Poll still stores Friendlies, but no page or stat includes them.
_Avoid_: Mode, competition

**Competitive Match**:
A League or Playoff Match; the default scope for all stats.
_Avoid_: Ranked match, real match

**Appearance**:
One player's participation in one Match, with that player's stats for it. An Appearance with no minutes (EA's record of a player who rage quit, rated 3.0 with every stat zeroed) is never counted, and the Match page tags it "Rage quit" with no stats.
_Avoid_: Cap, game played, player-match

**Position Group**:
The coarse position EA reports for an Appearance: Goalkeeper, Defender, Midfielder or Forward. These exact names are used in the app too.

**Main Position**:
The Position Group a Squad Member made most of their Appearances in, among the Matches the filters select; a tie goes to the one they played most recently, and Appearances with no position never decide it. With "Main position only" on (the default, CLUBS-82), their stats count only those Appearances, so a midfielder and a forward are each judged where they play.
_Avoid_: Position, role, attack, midfield, defence, GK/DEF/MID/FWD

**Rage Quit**:
A Match ended early because one side quit; EA awards the result to the side that stayed. Shown as "We rage quit" (EA records it as our loss) or "They rage quit" (the Opponent did, and it is our Win), and counted as "rage quits". EA keeps almost none of the quitting side's stats, so they are not counted (ours in a Match we quit, the Opponent's in one they quit); its result is. Code and URLs keep EA's name, `dnf` (`?dnf=0`).
_Avoid_: DNF, did not finish, forfeit, abandoned

**Dropped Points**:
A Match drawn or lost. The term names the idea in code and in compact labels; a sentence on the site says "draws and defeats" ("In draws and defeats we take 5.3 fewer shots per 90 than in Wins", "After a draw or defeat…"), since "in Dropped Points" reads as jargon.
_Avoid_: Non-win, bad result

**Session**:
A run of Matches with no more than 45 minutes between consecutive kick-offs.
_Avoid_: Sitting, night

**Season**:
One of EA's live Pro Clubs content seasons (e.g. "Closed Season 01"), lasting roughly six weeks, at the end of which EA's season totals reset.
_Avoid_: Campaign, division season, year

**Hot form**:
A Squad Member whose average rating over their last 5 Appearances is at least 0.5 above their average over every Appearance before them (at least 10), in the active filters. Shown as "Hot", and as "In form" in the Squad page's Form watch.
_Avoid_: On fire, purple patch

**Cold form**:
The same comparison, at least 0.5 below. Shown as "Cold", and as "Out of form" in the Squad page's Form watch.
_Avoid_: Slump, bad form

### League

**Division**:
The tier Our Club plays in: Elite, then Division 1 down to Division 5. EA's `currentDivision` maps 1 = Elite, 2 = Division 1 … 6 = Division 5.
_Avoid_: League, tier, rank

**Campaign**:
A run of League Matches in one Division. It ends when Our Club reaches the Points Target (→ Promotion Series) or loses all its Chances (→ Relegation Match). Tracked from the first Season start the Poll detects, when every club restarts in Division 5 on 0 points.
_Avoid_: In-game season, run, push (a Season is EA's ~6-week content season)

**Points Target**:
The Campaign points needed to reach a Promotion Series: 3 for a League Win, 1 for a draw. It differs per Division; Elite has none.
_Avoid_: Threshold, goal

**Chance**:
One of 3 lives in a Campaign. Each League loss costs one. Division 5 has none to lose: Our Club can't be relegated from it.
_Avoid_: Life, strike

**Promotion Series**:
The Matches after reaching the Points Target. Win enough and Our Club is promoted; otherwise a new Campaign starts in the same Division with a head start. Draws count as losses here.
_Avoid_: Promotion matches, playoff

**Relegation Match**:
A one-off Match after losing all Chances. Lose it and Our Club is relegated; win it and the Chances reset.
_Avoid_: Relegation battle, decider

**Promotion** / **Relegation**:
Moving up or down a Division.
_Avoid_: Going up, going down

**Playoffs**:
EA's end-of-Season Matches (Match Type Playoff). Never part of a Campaign: once Our Club plays one, League Matches stop counting until the next Season starts.
_Avoid_: Promotion Series, finals

### Comparisons

**Outcome Split**:
Our Club's stats averaged over Wins set beside the same averages over Dropped Points.

**Swing**:
Our Club's Win % in the Matches a Squad Member rated at or above their own average, minus the Win % in the Matches they rated below it, in points. A big Swing means results follow how they play; a small one beside a high rating means their rating doesn't move the result. EA rates winners higher, so most Swings are positive: compare Squad Members with each other. Needs 3 Matches each side, with "Small sample" under 10.
_Avoid_: Impact, influence score, importance, clutch

**Floor**:
The rating a Squad Member reaches or beats in 4 of 5 Matches (the 20th percentile of their ratings). A high Floor is consistently good, whatever their Swing. Needs 5 rated Appearances, with "Small sample" under 10.
_Avoid_: Minimum, worst rating, baseline

**Spread**:
How far a Squad Member's ratings wander from their own average (the standard deviation). Low is steady. Same thresholds as Floor.
_Avoid_: Variance, volatility, inconsistency

**Comparison**:
Two Squad Members' stats side by side, shown in the app as "Compare to…".
_Avoid_: Head-to-head (reserved for Our Club vs an Opponent), versus, matchup

**Shared Match**:
A Match in which both Squad Members in a Comparison made an Appearance; shown in the app as "Played together".
_Avoid_: Partnership, joint match, common game

**Above team**:
A Squad Member's rating minus the average rating of their teammates (Our Club's other counted Appearances) in the same Match, averaged over their Matches. Above 0, they outperform the team around them; near 0, they rise and fall with it. A Match with no other rated teammate gives no figure.
_Avoid_: Vs team (its old name, unclear about the sign), relative rating, plus-minus, outperformance score

**Rating link**:
Whether two Squad Members rate well and badly in the same Matches: the correlation of their ratings over their Shared Matches (from −1 to +1), shown on Compare as "Rise and fall together?". "Beyond the team" repeats it with the rest of the line-up's average held fixed (a partial correlation), so two who only ride the team's tide read weaker there. Needs 8 rated Shared Matches for a verdict, with "Small sample" under 15.
_Avoid_: Correlation of form (Form is the last 5 ratings), chemistry, partnership

### Write-ups

**Write-up**:
Prose about our stats, written by the Poll (never on a page view) and shown as ordinary site copy, with no label saying how it was written. It talks like a pundit, in football words: the labels in this glossary are for headings, not its prose.
_Avoid_: AI summary, generated text, insight

**Session recap**:
The Write-up of a Session, written once it is over (more than 45 minutes after its last kick-off) and again only if a Match joins it later.
_Avoid_: Session summary, night report

**Match report**:
A few sentences on one Match, written with its Session recap.
_Avoid_: Match summary

**State of the club**:
The Write-up on the Analysis page about Our Club as a whole, refreshed with each new Session recap.
_Avoid_: Club report, overview

**Coaching notes**:
A Squad Member's 2 to 4 short points for one Coaching week (what is working, what to work on, one focus for next week), on their profile and signed by The Gaff. Only Squad Members with an Appearance that week get them.
_Avoid_: Advice, feedback, tips, AI coaching

**Coaching week**:
A London week, Monday 00:00 to Monday 00:00. Its Coaching notes are written by the first Poll after 09:00 London on the Monday that ends it; only the latest such week is ever written, so nothing is invented for older weeks.
_Avoid_: Training week, gameweek

**Season Review**:
The story of one finished Season, told as a deck of cards: its record, Division journey, best and worst Matches, best Session, when we play, Nemesis and favourite Opponent, the Awards, and Write-ups to open and close it. Written once, on the Poll that sees the next Season start, and announced only by a Discord post with its link: nothing on the site links to it.
_Avoid_: Wrapped, season summary, recap

**Award**:
A Season Review's prize for one Squad Member (Player of the Season, Golden Boot, Playmaker, Most Improved, Ever-present, Hot Streak), decided by a fixed rule with documented tie-breaks; its citation is a Write-up.
_Avoid_: Trophy, badge, honour

**The Gaff**:
The sign-off on advice aimed at one Squad Member, such as their Coaching notes.
_Avoid_: Coach, manager, AI coach

**Milestone**:
A notable achievement by Our Club or a Squad Member, reached in a specific Match: a landmark in EA's career totals (a 50th goal, a 100th Win) or in the recorded Appearances (a 5th Perfect rating), a one-Match feat (a hat-trick, a Perfect rating), a Streak or a club record (biggest Win, biggest defeat). Streaks, records and recorded counts cover only recorded Matches, so they are "since records began". A Rage Quit sets no scoreline record, since EA awards or cuts short its score, but counts by its result in a Streak. There are no Goalkeeper Milestones: the AI keeps goal.
_Avoid_: Achievement, award, badge

**Streak**:
A run longer than any before it since records began, as a Milestone on the Match that broke the old best: Our Club's Matches in a row won, unbeaten or without a Win, or a Squad Member's counted Appearances in a row with a goal, an assist or Man of the Match. A Squad Member's run skips Appearances that aren't counted and Matches they missed.
_Avoid_: Run (in UI copy), sequence

**Perfect rating**:
A Match rating of 10.0, EA's highest. It is the only rating that makes a Milestone.
_Avoid_: 10.0 rating, perfect 10

### Data capture

**Poll**:
One scheduled fetch of Our Club's recent Matches and season totals from EA.
_Avoid_: Sync, scrape, refresh

**Snapshot**:
A timestamped copy of EA's running season totals (per Squad Member and per club), taken on each Poll.
_Avoid_: Stats dump, checkpoint

**Raw Payload**:
An EA API response stored exactly as received, from which all derived stats can be rebuilt.
_Avoid_: Cache, blob
