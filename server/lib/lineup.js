import { DEFAULT_SETTINGS, FLEX_ELIGIBLE } from "./leagueSettings.js";

// Slot types that get their own dedicated starter slot(s), in display order.
const DEDICATED_SLOTS = ["QB", "RB", "WR", "TE", "K", "DST"];

/**
 * Value of the best possible starting lineup for a set of rostered players.
 *
 * Greedy assignment (optimal for this slot structure — dedicated slots never
 * compete across positions, FLEX is generic and picks from leftovers):
 *   1. Fill each dedicated slot with the top-N rostered players at that position.
 *   2. Pool the unused RB/WR/TE players, fill FLEX slot(s) from the top of it.
 *   3. Any still-empty slot gets a placeholder worth that position's
 *      replacement-level points (what you'd realistically get off waivers),
 *      NOT zero — so filling a slot for the first time isn't overvalued
 *      versus upgrading an already-filled one.
 *
 * @param {Array} rosterPlayers  player objects with { position, projectedPoints }
 * @param {object} settings       league settings (uses settings.roster counts)
 * @param {object} replacementPoints  { QB, RB, ... } from computeVOR — reused, not recomputed
 * @returns {{ total: number, assignment: Record<string, object>, bench: Array }}
 *   assignment maps each slot key (e.g. "QB", "RB1", "FLEX") to either a player
 *   object or { placeholder: true, position, points }.
 *   bench is every rostered player not used in a starting or flex slot,
 *   sorted descending by projectedPoints.
 */
export function computeLineupValue(rosterPlayers, settings = DEFAULT_SETTINGS, replacementPoints = {}) {
  const roster = settings.roster ?? DEFAULT_SETTINGS.roster;

  const byPos = {};
  for (const p of rosterPlayers) {
    (byPos[p.position] ||= []).push(p);
  }
  for (const pos in byPos) {
    byPos[pos].sort((a, b) => b.projectedPoints - a.projectedPoints);
  }

  const assignment = {};
  const used = new Set();
  let total = 0;

  // Step 1: dedicated slots.
  for (const pos of DEDICATED_SLOTS) {
    const count = roster[pos] ?? 0;
    const list = byPos[pos] ?? [];
    for (let i = 0; i < count; i++) {
      const key = count > 1 ? `${pos}${i + 1}` : pos;
      const player = list[i];
      if (player) {
        assignment[key] = player;
        used.add(player);
        total += player.projectedPoints;
      } else {
        const points = replacementPoints[pos] ?? 0;
        assignment[key] = { placeholder: true, position: pos, points };
        total += points;
      }
    }
  }

  // Step 2: FLEX from leftover flex-eligible players.
  const flexCount = roster.FLEX ?? 0;
  const flexPool = [];
  for (const pos of FLEX_ELIGIBLE) {
    for (const p of byPos[pos] ?? []) {
      if (!used.has(p)) flexPool.push(p);
    }
  }
  flexPool.sort((a, b) => b.projectedPoints - a.projectedPoints);

  for (let i = 0; i < flexCount; i++) {
    const key = flexCount > 1 ? `FLEX${i + 1}` : "FLEX";
    const player = flexPool[i];
    if (player) {
      assignment[key] = player;
      used.add(player);
      total += player.projectedPoints;
    } else {
      // No single position owns a FLEX slot; the realistic waiver-level fill is
      // the best replacement level among flex-eligible positions.
      const points = Math.max(...FLEX_ELIGIBLE.map(pos => replacementPoints[pos] ?? 0));
      assignment[key] = { placeholder: true, position: "FLEX", points };
      total += points;
    }
  }

  // Everything left over after starters + flex are filled is bench depth.
  const bench = rosterPlayers
    .filter(p => !used.has(p))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  return { total: Math.round(total * 10) / 10, assignment, bench };
}
