// Fetches real player data from ESPN and writes it to projections.json in
// the exact shape server.js already reads. Run this instead of
// generate-mock-data.js, then restart the server.
//
//   node data/fetch-projections.js
//
// Re-run periodically during the preseason as projections/ADP shift.

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { fetchEspnPlayers } from "../lib/sources/espn.js";
import { transformEspnPlayers } from "../lib/sources/transform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "projections.json");

async function main() {
  console.log("Fetching player data from ESPN…");
  const { season, raw } = await fetchEspnPlayers({ limit: 600 });

  console.log(`Got ${raw.players.length} raw entries for ${season} season, transforming…`);
  const players = transformEspnPlayers(raw, season);

  if (players.length < 100) {
    console.warn(
      `Only got ${players.length} usable players — that's suspiciously low for a full ` +
      `player pool (expect 250-400+). ESPN's response shape may have changed. ` +
      `Inspect the raw response before trusting this data.`
    );
  }

  const byPos = {};
  for (const p of players) byPos[p.position] = (byPos[p.position] || 0) + 1;
  console.log("Players by position:", byPos);

  writeFileSync(
    OUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), source: "espn", season, players }, null, 2)
  );
  console.log(`Wrote ${players.length} players to ${OUT_PATH}`);
}

main().catch(err => {
  console.error("Failed to fetch/transform ESPN data:");
  console.error(err);
  console.error(
    "\nprojections.json was NOT modified. Your existing data (mock or previously " +
    "fetched) is still in place. See the comment at the top of lib/sources/espn.js " +
    "for how to debug ESPN's endpoint directly."
  );
  process.exit(1);
});
