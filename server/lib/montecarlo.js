// Layer 5: Monte Carlo draft simulation.
//
// Layers 1-4 are greedy — they score the pick in front of you. This layer
// estimates expected value: for each shortlisted candidate, simulate the
// rest of the draft many times (opponents picking ADP-weighted-random, you
// picking via the real Layer 1-4 heuristic on your own future turns) and
// compare the average final roster value.
//
// Manual trigger only (POST /api/simulate). This is a "think harder about
// this specific pick" tool, not part of the after-every-pick refresh loop.

import { computeVOR, getRecommendations } from "./valuation.js";
import { computeLineupValue } from "./lineup.js";
import { teamOnClock, nextPickForSlot } from "./draftMath.js";
import { FLEX_ELIGIBLE } from "./leagueSettings.js";

// --- Tunable knobs -----------------------------------------------------------
// Easy to find on purpose: real-machine timing on the ESPN-sized pool (~500
// players) may differ from the sandbox benchmark (252-player mock pool), so
// tune these once you've seen actual wall-clock time from the Simulate button.
//   150 sims x 30-pick horizon x 8 candidates  ->  ~1.5-2.5s in the sandbox.
export const DEFAULT_NUM_SIMULATIONS = 150;
export const DEFAULT_HORIZON_PICKS = 30;
export const DEFAULT_CANDIDATE_COUNT = 8;
// Weight multiplier applied to a position once a simulated opponent has filled
// every startable slot it could use (dedicated slots, plus FLEX for RB/WR/TE).
// A multiplier, NOT a hard filter — a "full" position still gets picked
// occasionally (bench depth, best-player-available), the way real drafters do.
export const SATURATED_POSITION_WEIGHT = 0.15;
// ---------------------------------------------------------------------------

// NOTE (roster-aware opponents): sampleOpponentPick used to weight purely by
// ADP proximity, with a deliberate "no roster-need modeling" decision recorded
// in ALGORITHM-EDITS.md's deliberate-simplifications table and verified in
// HANDOFF-layer5.md ("plausible simulated opponent drafts... no K/DST in the
// first 5 rounds"). That verification checked *aggregate* position
// distributions, which looked sane. It did NOT check whether any *single*
// simulated opponent looks like a plausible drafter — and a roster-blind ADP
// sample happily gives one opponent a 4th RB while it has zero TE. That reads
// as broken in practice mode, where the user watches individual opponents pick.
// Reversed per HANDOFF (Roster-Aware Opponent Modeling): the ADP weight is now
// multiplied by a per-position need multiplier derived from that opponent's own
// simulated roster. Still a nudge, not a solver — opponents do not use VOR or
// opportunity cost (that would make every opponent draft identically and
// optimally, its own kind of unrealism). See ALGORITHM-EDITS.md.

/**
 * Per-position sampling-weight multiplier for one opponent, given the roster
 * they've drafted so far. 1 for any position with an open startable slot;
 * SATURATED_POSITION_WEIGHT for a position whose dedicated slots (and FLEX,
 * for flex-eligible positions) are all filled by real players.
 *
 * Reuses lineup.js's greedy slot assignment rather than reimplementing an
 * "is this slot full" check — a slot it fills with a placeholder is, by
 * definition, one this roster can't yet staff.
 */
export function positionNeedMultipliers(roster, settings) {
  const { assignment } = computeLineupValue(roster, settings, {});

  const hasOpenSlot = {};
  for (const slot of Object.values(assignment)) {
    if (!slot.placeholder) continue;
    if (slot.position === "FLEX") {
      for (const fp of FLEX_ELIGIBLE) hasOpenSlot[fp] = true;
    } else {
      hasOpenSlot[slot.position] = true;
    }
  }

  const positions = Object.keys(settings.roster).filter(
    k => k !== "FLEX" && k !== "BENCH"
  );
  const mult = {};
  for (const pos of positions) {
    mult[pos] = hasOpenSlot[pos] ? 1 : SATURATED_POSITION_WEIGHT;
  }
  return mult;
}

/**
 * Draw one opponent pick from `pool`, weighted by a Gaussian centered on each
 * player's ADP. When `opts.roster` + `opts.settings` are supplied, the ADP
 * weight is also scaled by that opponent's positional need (see
 * positionNeedMultipliers and the NOTE above). Called without opts it behaves
 * exactly as the original ADP-only sampler.
 */
export function sampleOpponentPick(pool, pickNumber, { roster = null, settings = null } = {}) {
  const needMult =
    roster && settings ? positionNeedMultipliers(roster, settings) : null;

  const weights = pool.map(p => {
    const sd = Math.max(p.adpStdDev, 0.5);
    const z = (pickNumber - p.adp) / sd;
    const adpWeight = Math.exp(-0.5 * z * z);
    return needMult ? adpWeight * (needMult[p.position] ?? 1) : adpWeight;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (!(totalWeight > 0)) {
    // Every remaining player is far past their ADP — just take the best one.
    return pool.reduce((best, p) => (p.projectedPoints > best.projectedPoints ? p : best));
  }
  let r = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Simulate `horizonPicks` overall picks forward from `currentPick` (where the
 * candidate has just been taken), then score the resulting roster. Truncating
 * at a fixed horizon is fine because computeLineupValue fills empty slots with
 * replacement-level placeholders — a short sim naturally scores as
 * "locked-in roster + realistic waiver fill-ins for whatever's still open".
 *
 * @param {object} [opts.trace]  optional array; if given, each pick is pushed
 *                               as { pick, team, mine, playerId, name, position }
 * @param {Map<number, object[]>} [opts.opponentRosters]  slot -> players that
 *   opponent has ALREADY drafted before currentPick. Seeds each opponent's
 *   roster so their need multiplier reflects the real board, not just the
 *   handful of picks they make inside this rollout. Copied, not mutated.
 */
function runOneSimulation({
  candidate, availablePlayers, myRoster, currentPick, horizonPicks,
  settings, replacementPoints, myDraftSlot, trace, opponentRosters,
}) {
  let pool = availablePlayers.filter(p => p.id !== candidate.id);
  const simRoster = [...myRoster, candidate];
  const endPick = currentPick + horizonPicks;

  // Per-opponent running roster, seeded from picks already made this draft.
  const oppRosters = new Map();
  if (opponentRosters) {
    for (const [slot, players] of opponentRosters) oppRosters.set(slot, [...players]);
  }

  if (trace) {
    trace.push({ pick: currentPick, team: myDraftSlot, mine: true, playerId: candidate.id, name: candidate.name, position: candidate.position });
  }

  for (let pick = currentPick + 1; pick <= endPick && pool.length > 0; pick++) {
    const team = teamOnClock(pick, settings.teams);
    if (team === myDraftSlot) {
      const nextPick = nextPickForSlot(pick + 1, myDraftSlot, settings.teams);
      const { players: ranked } = getRecommendations(pool, {
        nextPickNumber: nextPick,
        settings,
        myRosterPlayers: simRoster,
      });
      const choice = ranked[0];
      if (choice) {
        simRoster.push(choice);
        pool = pool.filter(p => p.id !== choice.id);
        if (trace) trace.push({ pick, team, mine: true, playerId: choice.id, name: choice.name, position: choice.position });
      }
    } else {
      const roster = oppRosters.get(team) || [];
      const picked = sampleOpponentPick(pool, pick, { roster, settings });
      pool = pool.filter(p => p.id !== picked.id);
      oppRosters.set(team, [...roster, picked]);
      if (trace) trace.push({ pick, team, mine: false, playerId: picked.id, name: picked.name, position: picked.position });
    }
  }

  return computeLineupValue(simRoster, settings, replacementPoints).total;
}

/**
 * Run `numSimulations` simulations for each candidate and return them ranked
 * by mean final-roster value, with p10/p50/p90 for a range indicator.
 *
 * @param {object[]} params.candidates       player objects to evaluate as "my pick now"
 * @param {object[]} params.availablePlayers  full remaining pool (candidates included)
 * @param {object[]} params.myRoster          my rostered player objects so far
 * @param {number}   params.currentPick       overall pick number I'm on the clock for
 * @param {number}   params.myDraftSlot       my 1-indexed snake slot
 * @param {object}   params.settings          league settings
 * @param {Map<number, object[]>} [params.opponentRosters]  slot -> players each
 *   opponent has already drafted; threaded into every rollout so opponents draft
 *   roster-need-aware from the real board state, not from scratch.
 * @param {boolean}  [params.traceFirst]      capture a full pick log for candidate[0]'s first sim
 */
export function simulateCandidates({
  candidates, availablePlayers, myRoster, currentPick, myDraftSlot, settings,
  numSimulations = DEFAULT_NUM_SIMULATIONS, horizonPicks = DEFAULT_HORIZON_PICKS,
  opponentRosters = null, traceFirst = false,
}) {
  const { replacementPoints } = computeVOR(availablePlayers, settings);
  let sampleTrace = null;

  const results = candidates.map((candidate, ci) => {
    const values = [];
    for (let i = 0; i < numSimulations; i++) {
      const trace = traceFirst && ci === 0 && i === 0 ? [] : undefined;
      values.push(runOneSimulation({
        candidate, availablePlayers, myRoster, currentPick, horizonPicks,
        settings, replacementPoints, myDraftSlot, trace, opponentRosters,
      }));
      if (trace) sampleTrace = trace;
    }
    values.sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const pct = q => values[Math.floor(q * (values.length - 1))];
    const round1 = n => Math.round(n * 10) / 10;
    return {
      playerId: candidate.id,
      name: candidate.name,
      position: candidate.position,
      mean: round1(mean),
      p10: round1(pct(0.1)),
      p50: round1(pct(0.5)),
      p90: round1(pct(0.9)),
    };
  });

  results.sort((a, b) => b.mean - a.mean);
  return sampleTrace ? { results, sampleTrace } : { results };
}
