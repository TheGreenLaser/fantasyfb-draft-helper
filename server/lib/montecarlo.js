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

// --- Tunable knobs -----------------------------------------------------------
// Easy to find on purpose: real-machine timing on the ESPN-sized pool (~500
// players) may differ from the sandbox benchmark (252-player mock pool), so
// tune these once you've seen actual wall-clock time from the Simulate button.
//   150 sims x 30-pick horizon x 8 candidates  ->  ~1.5-2.5s in the sandbox.
export const DEFAULT_NUM_SIMULATIONS = 150;
export const DEFAULT_HORIZON_PICKS = 30;
export const DEFAULT_CANDIDATE_COUNT = 8;
// ---------------------------------------------------------------------------

/**
 * Draw one opponent pick from `pool`, weighted by a Gaussian centered on each
 * player's ADP. No roster-need modeling on purpose: real ADP already encodes
 * positional timing (K/DST have late ADP, so their weight near early picks is
 * ~0), which keeps simulated opponent drafts plausible without extra logic.
 */
function sampleOpponentPick(pool, pickNumber) {
  const weights = pool.map(p => {
    const sd = Math.max(p.adpStdDev, 0.5);
    const z = (pickNumber - p.adp) / sd;
    return Math.exp(-0.5 * z * z);
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
 */
function runOneSimulation({
  candidate, availablePlayers, myRoster, currentPick, horizonPicks,
  settings, replacementPoints, myDraftSlot, trace,
}) {
  let pool = availablePlayers.filter(p => p.id !== candidate.id);
  const simRoster = [...myRoster, candidate];
  const endPick = currentPick + horizonPicks;

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
      const picked = sampleOpponentPick(pool, pick);
      pool = pool.filter(p => p.id !== picked.id);
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
 * @param {boolean}  [params.traceFirst]      capture a full pick log for candidate[0]'s first sim
 */
export function simulateCandidates({
  candidates, availablePlayers, myRoster, currentPick, myDraftSlot, settings,
  numSimulations = DEFAULT_NUM_SIMULATIONS, horizonPicks = DEFAULT_HORIZON_PICKS,
  traceFirst = false,
}) {
  const { replacementPoints } = computeVOR(availablePlayers, settings);
  let sampleTrace = null;

  const results = candidates.map((candidate, ci) => {
    const values = [];
    for (let i = 0; i < numSimulations; i++) {
      const trace = traceFirst && ci === 0 && i === 0 ? [] : undefined;
      values.push(runOneSimulation({
        candidate, availablePlayers, myRoster, currentPick, horizonPicks,
        settings, replacementPoints, myDraftSlot, trace,
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
