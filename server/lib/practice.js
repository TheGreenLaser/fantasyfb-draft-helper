// Practice Draft Mode: let the user run full mock drafts where every other
// team is auto-drafted. Unlike Monte Carlo (Layer 5), this is cheap — one
// weighted opponent sample per pick, no getRecommendations calls — so a full
// batch of opponents between the user's turns resolves in milliseconds.
//
// The opponent model is shared with Layer 5: sampleOpponentPick lives in
// montecarlo.js and is reused here as-is (ADP-weighted, no roster-need logic).

import { teamOnClock } from "./draftMath.js";
import { sampleOpponentPick } from "./montecarlo.js";

/** Total roster spots per team (starters + bench). */
export function totalRosterSpots(settings) {
  return Object.values(settings.roster).reduce((a, b) => a + b, 0);
}

/** Total picks in the whole draft — the same calc the client does. */
export function totalPicks(settings) {
  return settings.teams * totalRosterSpots(settings);
}

/**
 * Auto-draft every upcoming pick that isn't myDraftSlot's, one weighted
 * opponent sample each, until it's the user's turn or the draft is complete
 * (pool empty / every roster spot across every team filled).
 *
 * Mutates draftState.picks. Returns just the picks it appended so the client
 * can show what the opponents did without a second round-trip.
 */
export function autoDraftUntilMyTurn(draftState, allPlayers) {
  const { settings, myDraftSlot } = draftState;
  const cap = totalPicks(settings);

  const draftedIds = new Set(draftState.picks.map(p => p.playerId));
  let pool = allPlayers.filter(p => !draftedIds.has(p.id));

  const autoPicks = [];
  while (draftState.picks.length < cap && pool.length > 0) {
    const pickNumber = draftState.picks.length + 1;
    const byTeam = teamOnClock(pickNumber, settings.teams);
    if (byTeam === myDraftSlot) break;

    const picked = sampleOpponentPick(pool, pickNumber);
    pool = pool.filter(p => p.id !== picked.id);

    const pick = { pickNumber, playerId: picked.id, byTeam };
    draftState.picks.push(pick);
    autoPicks.push(pick);
  }
  return autoPicks;
}

/**
 * Practice-mode undo. In live mode undo drops exactly one pick; here the
 * user's last pick was followed by a batch of opponent auto-picks, so we
 * rewind to the state right before the user's last decision: pop trailing
 * non-me picks, then pop the user's own last pick. Mutates draftState.picks.
 */
export function undoPracticePick(draftState) {
  const { picks, myDraftSlot } = draftState;
  while (picks.length > 0 && picks[picks.length - 1].byTeam !== myDraftSlot) {
    picks.pop();
  }
  picks.pop();
}
