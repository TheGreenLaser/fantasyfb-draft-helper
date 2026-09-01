import { computeReplacementRanks, DEFAULT_SETTINGS } from "./leagueSettings.js";
import { computeLineupValue } from "./lineup.js";

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 7.1.26).
 * Used to turn ADP + std dev into "probability still available at pick N".
 */
function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** P(player with this ADP/stdDev is still on the board at `pickNumber`). */
function probAvailableAt(player, pickNumber) {
  if (player.adpStdDev <= 0) return player.adp >= pickNumber ? 1 : 0;
  const z = (pickNumber - player.adp) / player.adpStdDev;
  return 1 - normalCdf(z);
}

function groupByPosition(players) {
  const byPos = {};
  for (const p of players) {
    (byPos[p.position] ||= []).push(p);
  }
  for (const pos in byPos) {
    byPos[pos].sort((a, b) => b.projectedPoints - a.projectedPoints);
  }
  return byPos;
}

/**
 * Attaches vor (value over replacement) to every player and returns the
 * replacement point total used per position, for display/debugging.
 */
export function computeVOR(players, settings = DEFAULT_SETTINGS) {
  const byPos = groupByPosition(players);
  const replacementRank = computeReplacementRanks(byPos, settings);

  const replacementPoints = {};
  for (const pos in byPos) {
    const rank = replacementRank[pos] ?? byPos[pos].length;
    const idx = Math.min(rank - 1, byPos[pos].length - 1);
    replacementPoints[pos] = byPos[pos][Math.max(idx, 0)]?.projectedPoints ?? 0;
  }

  const scored = players.map(p => ({
    ...p,
    vor: Math.round((p.projectedPoints - (replacementPoints[p.position] ?? 0)) * 10) / 10,
  }));

  return { players: scored, replacementPoints, replacementRank };
}

/**
 * Simple gap-based tiering within a position: sort by VOR, start a new tier
 * whenever the drop to the next player exceeds `gapThreshold` fraction of
 * the running tier's own point range (adaptive, not a fixed number).
 */
export function computeTiers(playersInPosition, gapThreshold = 0.45) {
  const sorted = [...playersInPosition].sort((a, b) => b.vor - a.vor);
  if (sorted.length === 0) return [];

  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i].vor - sorted[i + 1].vor);
  }
  const avgGap = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);

  let tier = 1;
  const withTiers = [sorted[0] ? { ...sorted[0], tier } : null].filter(Boolean);
  for (let i = 1; i < sorted.length; i++) {
    const drop = sorted[i - 1].vor - sorted[i].vor;
    if (drop > avgGap * (1 + gapThreshold) && drop > 3) {
      tier++;
    }
    withTiers.push({ ...sorted[i], tier });
  }
  return withTiers;
}

/**
 * Opportunity cost: for each position, how much expected VOR you lose by
 * waiting until your next pick, versus taking the best available now.
 *
 * E[best VOR at next pick] is computed by walking the sorted list of
 * remaining players at that position and weighting each one's VOR by the
 * probability it is the best still-available player when your next pick
 * comes around (i.e. it survived, and everyone better than it didn't).
 */
export function computeOpportunityCost(byPosition, nextPickNumber) {
  const cost = {};
  for (const pos in byPosition) {
    const list = byPosition[pos]; // sorted desc by vor
    if (list.length === 0) {
      cost[pos] = 0;
      continue;
    }
    const bestNow = list[0].vor;

    let expectedBestLater = 0;
    let survivalOfAllBetter = 1; // P(everyone better than i is gone by next pick)
    for (let i = 0; i < list.length; i++) {
      const pAvail = probAvailableAt(list[i], nextPickNumber);
      const pThisIsBest = survivalOfAllBetter * pAvail;
      expectedBestLater += pThisIsBest * list[i].vor;
      survivalOfAllBetter *= (1 - pAvail);
    }
    // Remaining probability mass (nobody at this position survives) contributes 0.

    cost[pos] = Math.round((bestNow - expectedBestLater) * 10) / 10;
  }
  return cost;
}

/**
 * Full recommendation pass: given available players and the pick number of
 * the user's NEXT turn, returns players sorted by a blended score of
 * value and position-level opportunity cost, plus tiers per position.
 *
 * The value signal driving the score is raw VOR — every player is treated
 * equally regardless of how full their position is on my roster. When
 * `myRosterPlayers` is supplied we ALSO compute each candidate's marginal
 * value (how much they'd improve my best possible starting lineup given what
 * I've already drafted, see lineup.js) and return it for display, but it does
 * not affect recommendationScore. See the NOTE in the map() below.
 */
export function getRecommendations(availablePlayers, { nextPickNumber, settings = DEFAULT_SETTINGS, lambda = 0.6, myRosterPlayers = null } = {}) {
  const { players: scored, replacementPoints } = computeVOR(availablePlayers, settings);
  const byPos = groupByPosition(scored);

  const tiersByPos = {};
  for (const pos in byPos) {
    tiersByPos[pos] = computeTiers(byPos[pos]);
  }

  // NOTE: opportunityCost stays VOR-based, position-level and roster-agnostic
  // on purpose. Positional scarcity is a market signal independent of my
  // roster; making it roster-aware is a bigger lift than this pass takes on.
  // Don't "fix" this by feeding marginal value into it.
  const oppCost = nextPickNumber
    ? computeOpportunityCost(byPos, nextPickNumber)
    : Object.fromEntries(Object.keys(byPos).map(p => [p, 0]));

  const useMarginal = Array.isArray(myRosterPlayers);
  const baseLineupValue = useMarginal
    ? computeLineupValue(myRosterPlayers, settings, replacementPoints).total
    : 0;

  const ranked = scored
    .map(p => {
      const marginalValue = useMarginal
        ? Math.round(
            (computeLineupValue([...myRosterPlayers, p], settings, replacementPoints).total -
              baseLineupValue) * 10
          ) / 10
        : p.vor;
      // NOTE: recommendationScore is deliberately driven by raw VOR, NOT
      // marginalValue. Layer 4 made marginal value the primary driver, which
      // caused the score to collapse toward zero for extra players at an
      // already-full position (e.g. a 5th RB once both RB and both FLEX slots
      // are spoken for). That "diminishing returns" behavior was judged too
      // aggressive — it punishes bench-quality depth almost entirely, when a
      // strong bench player still has real value (injury insurance, trade
      // bait, bye-week coverage, or just being a genuinely good player). So we
      // treat every player equally via VOR regardless of how full their
      // position is on my roster. marginalValue is still computed and returned
      // below because "how much would this player help my lineup right now" is
      // useful info — it just doesn't drive the ranking anymore. Don't "fix"
      // this back to marginalValue without reintroducing a gentler curve
      // (e.g. partial credit for bench depth) instead of a hard collapse.
      return {
        ...p,
        marginalValue,
        opportunityCost: oppCost[p.position] ?? 0,
        recommendationScore:
          Math.round((p.vor + lambda * (oppCost[p.position] ?? 0)) * 10) / 10,
        tier: tiersByPos[p.position]?.find(t => t.id === p.id)?.tier ?? null,
      };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore);

  return { players: ranked, opportunityCost: oppCost };
}
