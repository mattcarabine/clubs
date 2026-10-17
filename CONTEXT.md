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
EA's classification of a Match: League, Playoff or Friendly.
_Avoid_: Mode, competition

**Competitive Match**:
A League or Playoff Match; the default scope for all stats.
_Avoid_: Ranked match, real match

**Appearance**:
One player's participation in one Match, with that player's stats for it.
_Avoid_: Cap, game played, player-match

**Position Group**:
The coarse position EA reports for an Appearance: Goalkeeper, Defender, Midfielder or Forward. These exact names are used in the app too; with no Position Group selected, a view covers "All Positions".
_Avoid_: Position, role, attack, midfield, defence, GK/DEF/MID/FWD

**DNF**:
A Match ended early because one side quit; EA awards the result to the side that stayed.
_Avoid_: Forfeit, rage quit

**Dropped Points**:
A Match drawn or lost.
_Avoid_: Non-win, bad result

**Session**:
A run of Matches with no more than 45 minutes between consecutive kick-offs.
_Avoid_: Sitting, night

**Season**:
One of EA's live Pro Clubs content seasons (e.g. "Closed Season 01"), lasting roughly six weeks, at the end of which EA's season totals reset.
_Avoid_: Campaign, division season, year

### Comparisons

**Outcome Split**:
Our Club's stats averaged over Wins set beside the same averages over Dropped Points.

**Comparison**:
Two Squad Members' stats side by side, shown in the app as "Compare to…".
_Avoid_: Head-to-head (reserved for Our Club vs an Opponent), versus, matchup

**Shared Match**:
A Match in which both Squad Members in a Comparison made an Appearance; shown in the app as "Played together".
_Avoid_: Partnership, joint match, common game

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
