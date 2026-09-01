// Maps ESPN's internal numeric IDs to the values the rest of the app uses.
// Sourced from the espn-api open-source package's constants, which have
// been stable for years, but ESPN could add/change these without notice.

const POSITION_MAP = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};

const TEAM_MAP = {
  0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL",
  7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV",
  14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
  21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB",
  28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

const KEEP_POSITIONS = new Set(Object.values(POSITION_MAP));

/** Projected season-total fantasy points under this league's scoring, or null. */
function projectedPoints(player, season) {
  const entry = (player.stats || []).find(
    s => s.seasonId === season && s.statSourceId === 1 && s.statSplitTypeId === 0
  );
  return typeof entry?.appliedTotal === "number" ? entry.appliedTotal : null;
}

/**
 * ESPN doesn't publish an ADP standard deviation. This estimates one from
 * the ADP itself — later picks have historically wider expert disagreement
 * than early ones — using the same heuristic the mock data generator used,
 * so opportunity-cost math behaves consistently either way. Replace this
 * with a real source (e.g. FantasyPros ECR spread) if you get access.
 */
function estimateAdpStdDev(adp) {
  return Math.round((2 + adp * 0.12) * 10) / 10;
}

/**
 * Converts ESPN's raw kona_player_info response into our Player[] shape,
 * sorted by ADP with per-position rank assigned.
 */
export function transformEspnPlayers(raw, season) {
  const candidates = [];

  for (const entry of raw.players) {
    const p = entry.player;
    if (!p) continue;

    const position = POSITION_MAP[p.defaultPositionId];
    if (!position || !KEEP_POSITIONS.has(position)) continue;

    const points = projectedPoints(p, season);
    const adp = p.ownership?.averageDraftPosition;

    // Skip players ESPN has no meaningful projection or ADP for — usually
    // deep bench/inactive players not relevant to a draft.
    if (points == null || !adp || adp <= 0) continue;

    candidates.push({
      id: p.id,
      name: p.fullName,
      position,
      team: TEAM_MAP[p.proTeamId] ?? "FA",
      byeWeek: null, // ESPN doesn't include this in kona_player_info; see README
      projectedPoints: Math.round(points * 10) / 10,
      adp: Math.round(adp * 10) / 10,
      adpStdDev: estimateAdpStdDev(adp),
    });
  }

  candidates.sort((a, b) => a.adp - b.adp);

  const positionCounts = {};
  const byPointsForRank = [...candidates].sort((a, b) => b.projectedPoints - a.projectedPoints);
  const rankMap = new Map();
  for (const p of byPointsForRank) {
    positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
    rankMap.set(p.id, positionCounts[p.position]);
  }

  return candidates.map(p => ({ ...p, positionRank: rankMap.get(p.id) }));
}
