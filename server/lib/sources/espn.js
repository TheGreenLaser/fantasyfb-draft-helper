// Pulls player data from ESPN's fantasy football API. This is NOT an
// official, documented API — there's no key or signup because there's no
// public contract at all. It's the same reverse-engineered endpoint set
// used by long-running open-source projects (espn-api, ffscrapr,
// ESPN-Fantasy-Football-API), so it's reasonably stable in practice, but
// ESPN can change the response shape without notice.
//
// If this starts failing: open the URL below in a browser (it's plain
// GET + a header, no auth) and compare the JSON shape against what
// transform.js expects.

const SEASON = new Date().getMonth() >= 1 ? new Date().getFullYear() : new Date().getFullYear() - 1;

// "leaguedefaults/3" is a generic public league used purely to get
// default-scoring projections without needing a real league ID. In
// practice this has corresponded to a PPR-like scoring set; if your
// projected totals look like standard (non-PPR) scoring, try 1 or 2 here.
const LEAGUE_DEFAULT_ID = process.env.ESPN_LEAGUE_DEFAULT_ID || 3;

const BASE_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leaguedefaults/${LEAGUE_DEFAULT_ID}`;

/**
 * Fetches raw player data from ESPN. Returns the parsed JSON response
 * (an object with a `players` array of `{ player: {...} }` entries).
 */
export async function fetchEspnPlayers({ limit = 600 } = {}) {
  const filter = {
    players: {
      limit,
      sortPercOwned: { sortPriority: 4, sortAsc: false },
    },
  };

  const res = await fetch(`${BASE_URL}?view=kona_player_info`, {
    headers: {
      "X-Fantasy-Filter": JSON.stringify(filter),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(
      `ESPN API returned ${res.status} ${res.statusText}. ` +
      `URL: ${BASE_URL}. This endpoint is undocumented and may have changed — ` +
      `see the comment at the top of espn.js.`
    );
  }

  const data = await res.json();
  if (!Array.isArray(data.players)) {
    throw new Error(
      `ESPN API response didn't include a "players" array. ` +
      `The response shape may have changed — inspect the raw JSON at ${BASE_URL}.`
    );
  }

  return { season: SEASON, raw: data };
}
