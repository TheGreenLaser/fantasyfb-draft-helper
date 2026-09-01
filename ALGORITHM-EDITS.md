# ALGORITHM-EDITS — standing reference

The single place that records **deliberate modelling choices** in the draft
math: things that look like bugs or gaps at a glance but are intentional, with
the reasoning attached so nobody "fixes" them by accident.

This file was bootstrapped after the fact (see the Roster-Aware Opponent
Modeling handoff). The decisions in the table below already existed — they were
scattered across inline `// NOTE:` comments, `README.md` caveats, and commit
messages. They've been consolidated here; the inline `NOTE:` comments remain as
pointers at the point of change.

## Process

When you make a change that reverses or adds to one of these decisions:

1. **Read first.** Read the handoff, then read the *actual current contents* of
   the files it touches (`montecarlo.js`, `leagueSettings.js`, `valuation.js`,
   `lineup.js`, `sources/*`). Don't trust a formula summarised
   here or in a handoff without checking it still matches the code.
2. **Comment at the point of change.** A `// NOTE:` where the behaviour lives,
   explaining what was reversed/added and *why*, linking back to the handoff (and
   any prior handoff the original decision came from).
3. **Update this table.** Remove a row that's fully resolved, or replace it with
   the new state + a pointer to the handoff. Add a new row if the change
   introduced a fresh deliberate simplification.
4. **Verify with numbers, not vibes.** The bar is the rebalance pass (commit
   `4d71597`) and the Layer 5 verification (commit `e926f03`): concrete
   before/after figures showing the *specific* behaviour changed — not "it runs"
   or "still looks sane." Keep the ad-hoc script; report the actual numbers.

## Deliberate simplifications

| # | Area | Simplification | Why it's OK / reasoning | Where |
|---|------|----------------|-------------------------|-------|
| 1 | `sources/transform.js` | **No bye weeks.** `byeWeek` is always `null` from the ESPN source. | ESPN's `kona_player_info` endpoint doesn't return bye weeks. Needs a second source (team schedules). Affects display only — no algorithm depends on `byeWeek`. Applies to every position equally, incl. DST/K. | `transform.js` `byeWeek: null`; `README.md` "No bye weeks" |
| 2 | `sources/transform.js` | **ADP std dev is estimated from ADP**, not a real spread-of-opinion figure. `estimateAdpStdDev(adp) = 2 + 0.12·adp`. | ESPN doesn't publish an ECR spread the way FantasyPros does. The estimate (later picks = wider disagreement) is directionally right and is the *same* heuristic the mock generator uses, so opportunity-cost math behaves identically on mock and real data. Treat opportunity-cost magnitudes as directional. | `transform.js` `estimateAdpStdDev`; `README.md` |
| 3 | `sources/espn.js` | **Scoring is ESPN `leaguedefaults/3`**, not the user's actual league. | Gets default (PPR-ish) projections without a real league ID. `ESPN_LEAGUE_DEFAULT_ID=1\|2` env var switches to standard scoring. Projections are the input to everything, so a league-scoring mismatch scales all values together and rankings mostly survive. | `espn.js` `LEAGUE_DEFAULT_ID`; `README.md` |
| 4 | `leagueSettings.js` | **League settings are hardcoded** (`DEFAULT_SETTINGS`): 10 teams, PPR, `QB1/RB2/WR2/TE1/FLEX2/K1/DST1/BENCH5`. | The pipeline reads `settings.roster` generically (no position hardcoding downstream), so wiring the client settings form to `POST /api/draft-state/settings` is all that's left. Nothing in the math assumes these specific numbers. | `leagueSettings.js` header; `README.md` next-steps #2 |
| 5 | `valuation.js` | **`recommendationScore` is driven by raw VOR, not marginal lineup value.** Every player is scored equally regardless of how full their position is on my roster. | Layer 4 made marginal value primary, which collapsed the score toward ~0 for extra players at an already-full position (a 5th RB once RB+FLEX are spoken for). That over-punished bench-quality depth, which has real value (injury insurance, bye coverage, trade bait). `marginalValue` is still computed and returned for display. Don't revert without a *gentler* curve than a hard collapse. | `valuation.js` `NOTE` at `recommendationScore`; commit `4d71597` |
| 6 | `valuation.js` | **Opportunity cost is position-level and roster-agnostic.** It's `E[VOR lost by waiting]` for the position, not adjusted for what I've already drafted. | Positional scarcity is a market signal independent of my roster. Making it roster-aware is a bigger lift than that pass took on, and feeding marginal value into it was explicitly rejected. | `valuation.js` `NOTE` above `computeOpportunityCost` call |
| 7 | `leagueSettings.js` | **FLEX allocation in `computeReplacementRanks` is greedy**, not a full assignment solve: pool RB/WR/TE beyond their dedicated cutoffs, hand FLEX slots to the highest projected points. | For the standard slot structure (dedicated slots never compete across positions; FLEX is generic) greedy-by-points is optimal or within noise. A full solve isn't worth it at this precision. | `leagueSettings.js` `computeReplacementRanks` comment |
| 8 | `lineup.js` | **Fixed replacement-level fill for empty lineup slots**, and Monte Carlo truncates at a fixed 30-pick horizon. | `computeLineupValue` fills unstaffed slots with that position's replacement-level points (not zero), so a short simulation reads as "locked-in roster + realistic waiver fill-ins for whatever's still open." Lets Layer 5 stop early without biasing toward candidates that fill a slot now. | `lineup.js` step 3 comment; `montecarlo.js` `runOneSimulation` doc |
| 9 | `montecarlo.js` / `server.js` | **Monte Carlo (Layer 5) is manual-trigger only** (`POST /api/simulate`), not part of the after-pick refresh loop. ~1.5–2.5s at default knobs (150 sims × 30-pick horizon × 8 candidates). | It's a "think harder about *this* pick" tool. Running it every pick would be a multi-second stall on the polling loop for marginal benefit over the Layer 1–4 heuristic. Knobs are named constants at the top of `montecarlo.js`. | `server.js` comment above `/api/simulate`; `montecarlo.js` header |
| 10 | `montecarlo.js` | **My own future picks inside a rollout use the Layer 1–4 greedy heuristic** (`getRecommendations`), not a nested simulation. | A recursive sim-inside-sim would explode the cost. The greedy heuristic is a reasonable stand-in for "what would I actually do on my next turn," and it's the same code path the live board uses. | `montecarlo.js` `runOneSimulation` |
| 11 | `montecarlo.js` / `practice.js` | **Opponent-need modelling is a flat per-position multiplier**, not a compounding or opportunity-cost model. A position whose startable slots (dedicated + FLEX for RB/WR/TE) are all filled gets its ADP sampling weight scaled by `SATURATED_POSITION_WEIGHT` (0.15); the 2nd and 5th extra player at that position get the *same* multiplier. | Reverses the old "opponents aren't roster-need-aware" decision (see below). Deliberately kept a nudge, not a solver: opponents don't use VOR/opportunity cost (that makes every opponent draft identically and optimally — its own unrealism), and the multiplier doesn't compound (that drifts back toward a rigid roster-need solver). Consequence: in a *forced* full 15-round draft an opponent can still occasionally end a round-15 tail with e.g. 2 DST or a stacked QB room once the pool is saturated for everyone. Judged acceptable — real drafters stream/handcuff, and the aggregate roster shapes are much saner (see handoff verification). Tunable via the named constant. | `montecarlo.js` `NOTE (roster-aware opponents)`, `positionNeedMultipliers`, `SATURATED_POSITION_WEIGHT` |
| 12 | `montecarlo.js` / `valuation.js` | **In Monte Carlo / practice sims, my own simulated roster never drafts K or DST**, so those two starting slots score as replacement-level placeholders for *my* rollouts. (Opponents now do fill them — row 11.) | A VOR-maximising drafter (the Layer 1–4 heuristic that stands in for me) always finds a skill-position player with higher VOR than any K/DST at the same pick — which is realistic (K/DST streaming is a late, low-leverage decision). Because the placeholder fill is *identical across all candidates being compared*, it doesn't bias the candidate ranking Layer 5 produces. Not worth special-casing my sim-self to grab a K/DST in the last rounds. See the DST/K audit note below. | `montecarlo.js` `runOneSimulation`; `lineup.js` step 3 |

## Resolved / reversed

### Opponents in Monte Carlo & practice mode are now roster-need-aware

*Previously:* "Opponents in Monte Carlo / practice mode aren't roster-need-aware
— real ADP data already encodes realistic positional timing; verified (not just
assumed) to produce sane position distributions without this."

*Reversed by:* the Roster-Aware Opponent Modeling handoff. That original
verification checked **aggregate** position distributions (which did look sane —
RB/WR-heavy early, QBs rounds 2–3, no K/DST in the first 5 rounds). It did
**not** check whether any single simulated opponent looks like a plausible
drafter — and a roster-blind ADP sample happily hands one opponent a 4th RB
while it has zero TE. That reads as broken in practice mode, where the user
watches individual opponents pick.

`sampleOpponentPick` now multiplies each player's ADP-proximity weight by a
per-position need multiplier (`positionNeedMultipliers`) derived from that
opponent's own simulated roster, reusing `lineup.js`'s greedy slot assignment to
decide "is this position's startable set full." It's a nudge, not a solver — see
row 11. Details, benchmark, and before/after numbers in the handoff.

## Audit notes (not simplifications)

### DST / K support is fully generic — no code changes were needed

The Roster-Aware handoff's Workstream B asked for an audit of DST/K support
across the pipeline. Result: **it was already generic end to end.** No hardcoded
`['QB','RB','WR','TE']` position list exists anywhere in the value pipeline or
the client.

- `sources/espn.js` / `transform.js` — `POSITION_MAP` includes K (5) and DST
  (16); the transform keeps them. The current real ESPN pool has 42 K and 32
  DST with real projected points and ADP.
- `leagueSettings.js` `computeReplacementRanks` — iterates
  `["QB","RB","WR","TE","K","DST"]`, builds `dedicatedStarters` from
  `roster.K` / `roster.DST`, and correctly leaves K/DST out of the FLEX pool.
- `valuation.js` — `computeVOR`, `computeTiers`, `computeOpportunityCost`, and
  `getRecommendations` all iterate `for (const pos in byPos)` / map over every
  scored player. K and DST get VOR, tiers, and an overall rank like any position.
- `lineup.js` `computeLineupValue` — `DEDICATED_SLOTS` includes K/DST; the FLEX
  pool is `FLEX_ELIGIBLE` only, so K/DST are correctly excluded from FLEX and an
  unfilled K/DST slot gets a replacement-level placeholder (no crash).
- Client — `constants.ts` `POSITIONS` / `POSITION_VAR`, `types.ts` `Position` /
  `RosterSettings`, and `index.css` (`--k`, `--dst`) all include both.
  `RosterStrip` renders whatever slot keys the server sends. `PlayerTable`'s
  filter is driven by the `POSITIONS` array.
- `montecarlo.js` / `practice.js` — the opponent pool never excluded K/DST; they
  were simply under-drafted by roster-blind sampling. Row 11's change fixes that
  as a side effect (see the handoff's full-draft verification: rosters with 0
  DST dropped from ~4.5/10 to ~1/10).

The one real limitation surfaced by the audit is row 12 (my sim-self doesn't
draft K/DST), which is an emergent property of VOR-maximising, not a filter.
