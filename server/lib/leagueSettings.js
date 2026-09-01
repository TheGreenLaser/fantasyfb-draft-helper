// Default league settings. All of this will eventually be user-configurable
// from the client; hardcoded here so the rest of the pipeline has something
// concrete to work against.

export const DEFAULT_SETTINGS = {
  teams: 10,
  scoring: "PPR",
  roster: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    FLEX: 2, // eligible: RB, WR, TE
    K: 1,
    DST: 1,
    BENCH: 5,
  },
};

// Positions that can fill a FLEX slot.
export const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

/**
 * Replacement level = the last player at each position who would be a
 * starter league-wide, accounting for FLEX by pooling RB/WR/TE and
 * distributing flex slots to whichever position has the best players
 * available beyond their dedicated starter slots.
 *
 * Returns { QB: n, RB: n, WR: n, TE: n, K: n, DST: n } = replacement rank
 * (1-indexed position rank) for each position.
 */
export function computeReplacementRanks(playersByPosition, settings = DEFAULT_SETTINGS) {
  const { teams, roster } = settings;

  const dedicatedStarters = {
    QB: teams * roster.QB,
    RB: teams * roster.RB,
    WR: teams * roster.WR,
    TE: teams * roster.TE,
    K: teams * roster.K,
    DST: teams * roster.DST,
  };

  const flexSlots = teams * roster.FLEX;

  // Build the pool of "next best" flex-eligible players beyond their
  // dedicated starter cutoffs, then hand out flex slots to whichever is
  // most valuable, greedily. This approximates optimal flex allocation
  // without a full assignment solve.
  const flexPool = [];
  for (const pos of FLEX_ELIGIBLE) {
    const list = playersByPosition[pos] || [];
    for (let i = dedicatedStarters[pos]; i < list.length; i++) {
      flexPool.push({ pos, points: list[i].projectedPoints });
    }
  }
  flexPool.sort((a, b) => b.points - a.points);

  const flexTaken = { RB: 0, WR: 0, TE: 0 };
  for (let i = 0; i < Math.min(flexSlots, flexPool.length); i++) {
    flexTaken[flexPool[i].pos]++;
  }

  const replacementRank = {};
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"]) {
    const extra = flexTaken[pos] || 0;
    // Replacement rank is the first player NOT taken as a starter or flex.
    replacementRank[pos] = dedicatedStarters[pos] + extra + 1;
  }
  return replacementRank;
}
