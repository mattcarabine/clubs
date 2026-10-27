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
The coarse position EA reports for an Appearance: Goalkeeper, Defender, Midfielder or Forward. These exact names are used in the app too; with no Position Group selected, a view covers "All Positions".
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
A Squad Member whose average rating over their last 5 Appearances is at least 0.5 above their average over every Appearance before them (at least 10), in the active filters. Shown as "Hot", and as "In form" on Matchday.
_Avoid_: On fire, purple patch

**Cold form**:
The same comparison, at least 0.5 below. Shown as "Cold", and as "Out of form" on Matchday.
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

**Comparison**:
Two Squad Members' stats side by side, shown in the app as "Compare to…".
_Avoid_: Head-to-head (reserved for Our Club vs an Opponent), versus, matchup

**Shared Match**:
A Match in which both Squad Members in a Comparison made an Appearance; shown in the app as "Played together".
_Avoid_: Partnership, joint match, common game

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
A notable achievement by Our Club or a Squad Member, reached in a specific Match: a landmark in EA's career totals (a 50th goal, a 100th Win) or in the recorded Appearances (a 5th Perfect rating), a one-Match feat (a hat-trick, a Perfect rating) or a club record. Records and recorded counts cover only recorded Matches, so they are "since records began". There are no Goalkeeper Milestones: the AI keeps goal.
_Avoid_: Achievement, award, badge

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
