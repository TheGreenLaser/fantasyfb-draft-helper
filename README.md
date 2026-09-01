# Fantasy Football Draft Helper

Live draft assistant: value over replacement (VOR), tiers, and ADP-based
opportunity cost, refreshed after every pick. Runs entirely locally.

## Running it

Two terminals:

```bash
# Terminal 1 — backend
cd server
npm install
npm run dev        # http://localhost:3001

# Terminal 2 — frontend
cd client
npm install
npm run dev         # http://localhost:5173
```

Open http://localhost:5173. Set your draft slot in the header, and click
"Draft" on whichever player is actually taken (by you or anyone else) to
keep the board in sync.

## Getting real player data

By default the app runs on **mock data** (`server/data/projections.json`,
random names, plausible-but-fake numbers). To pull real players:

```bash
cd server
npm run fetch-data
```

This calls ESPN's fantasy football API — free, no signup or key required —
and overwrites `projections.json` with real players, teams, projected
season points, and ADP. Restart the server afterward to pick it up.

Restart the server after fetch-data. If port 3001 is already in use, an
orphaned process from a previous session is still bound to it and will
keep serving stale data silently. Kill it first: `pkill -f "node server.js"`

**Important caveats about this data source:**

- **It's unofficial.** ESPN doesn't publish or document this API; there's
  no key because there's no public contract at all. It's the same endpoint
  set long-running open-source projects (`espn-api`, `ffscrapr`) have used
  for years, so it's reasonably stable, but ESPN could change the response
  shape without warning. If `npm run fetch-data` fails or the numbers look
  wrong, start with the comments at the top of `server/lib/sources/espn.js`.
- **No bye weeks.** ESPN's projection endpoint doesn't include them —
  `byeWeek` will show as "–" in the table until a bye-week source is added.
- **No real ADP standard deviation.** ESPN doesn't publish the spread of
  expert opinion the way FantasyPros does, so `adpStdDev` is estimated from
  ADP itself (later picks assumed to have more disagreement). This feeds
  directly into the opportunity-cost numbers, so treat those as directionally
  useful rather than precise until a better source is wired in.
- **Scoring may not exactly match your league.** The fetch uses ESPN's
  generic default-scoring league (`leaguedefaults/3`), which in practice
  tracks PPR-like scoring but isn't guaranteed to match your league's exact
  settings. If projected point totals look like standard (non-PPR) scoring,
  try setting `ESPN_LEAGUE_DEFAULT_ID=1` or `=2` as an environment variable
  before running the fetch, and compare.

Re-run `npm run fetch-data` any time closer to your draft to pick up
updated projections. `npm run mock-data` regenerates the synthetic dataset
if you want to go back to it (e.g. for testing without hitting ESPN).

Draft state is written to `server/data/draft-state.json` after every pick,
so a crash or reload doesn't lose your draft — just restart the server and
reload the page. Click **Reset** in the header to clear it and start over.

## What's implemented

- **Real player data via ESPN** (see above) or mock data as a fallback —
  either way, shaped identically so nothing downstream cares which one
  is loaded.
- **VOR** (`server/lib/valuation.js`) — replacement level computed per
  position from your league's roster settings, including proper FLEX
  allocation (`server/lib/leagueSettings.js`).
- **Tiers** — adaptive gap-detection within each position's VOR-sorted list.
- **Opportunity cost** — for each position, expected VOR lost by waiting
  until your next pick, using each player's ADP + ADP std dev to estimate
  survival probability via a normal CDF.
- **Recommendation score** — `VOR + λ × opportunity_cost`, this is what the
  board is sorted by. `λ` is set in `getRecommendations()` in `valuation.js`.
- **Snake draft math** — correct team-on-the-clock and "picks until your
  turn" for any team count / draft slot.
- **Roster strip** — greedily fills starter slots (including FLEX) from your
  picks so you can see your projected starting lineup forming in real time.

## Project structure

```
server/
  server.js              Express app, draft state, snake-draft math
  lib/leagueSettings.js   Replacement-level / FLEX allocation logic
  lib/valuation.js         VOR, tiers, opportunity cost, recommendation score
  lib/sources/espn.js       Fetches raw player data from ESPN (unofficial API)
  lib/sources/transform.js  Converts ESPN's raw shape into our Player type
  data/fetch-projections.js Script: ESPN -> projections.json (npm run fetch-data)
  data/generate-mock-data.js Script: synthetic fallback data (npm run mock-data)
  data/projections.json    Player pool currently loaded by the server
  data/draft-state.json    Picks made so far (gitignored, created at runtime)

client/
  src/App.tsx              Top-level state, polls server after each pick
  src/components/
    Header.tsx              Draft slot picker, pick counter, undo/reset
    TopPick.tsx              The single recommended pick, with a reason
    RosterStrip.tsx          Your starting lineup as it fills in
    PlayerTable.tsx          Full sortable/filterable/tiered board
  src/api.ts                Fetch wrapper for the server API
  src/types.ts               Shared TS types matching server responses
```

## Next steps (not yet built)

Roughly in priority order — see the design conversation this came out of
for the full reasoning:

1. **Bye weeks and a real ADP spread** — ESPN's endpoint doesn't provide
   either; a small supplementary fetch (e.g. team schedules for byes) or a
   switch to a source with published ECR standard deviation would sharpen
   the opportunity-cost numbers.
2. **League settings UI** — roster slots, team count, and scoring are
   currently hardcoded in `leagueSettings.js`; wire up the settings form
   in the client to `POST /api/draft-state/settings`.
3. **Marginal value / optimal lineup scoring (Layer 4)** — right now VOR is
   the only per-pick value signal. Scoring by the *marginal* improvement to
   your best possible starting lineup would better handle diminishing
   returns (e.g. your 4th RB vs your 2nd).
4. **Live sync** — Sleeper's API is free and unauthenticated; polling it
   for picks would remove the need to manually click "Draft" for other
   teams.
5. **Monte Carlo (Layer 5)** — simulate the rest of the draft under an ADP-
   weighted opponent model to get a true expected-value recommendation
   instead of the greedy VOR + opportunity-cost heuristic. Worth a Web
   Worker given ~250 players × 16 rounds × several thousand simulations.
6. **Backtesting** — run the recommender against a past season's actual
   ADP and results to sanity-check `λ` and catch bugs that look reasonable
   in isolation.
# fantasyfb-draft-helper
# fantasyfb-draft-helper
