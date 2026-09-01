import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { DEFAULT_SETTINGS } from "./lib/leagueSettings.js";
import { getRecommendations, computeVOR } from "./lib/valuation.js";
import { computeLineupValue } from "./lib/lineup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTIONS_PATH = join(__dirname, "data", "projections.json");
const DRAFT_STATE_PATH = join(__dirname, "data", "draft-state.json");

const { players: allPlayers } = JSON.parse(readFileSync(PROJECTIONS_PATH, "utf-8"));

function loadDraftState() {
  if (existsSync(DRAFT_STATE_PATH)) {
    return JSON.parse(readFileSync(DRAFT_STATE_PATH, "utf-8"));
  }
  return {
    settings: DEFAULT_SETTINGS,
    myDraftSlot: 1, // 1-indexed position in the snake order
    picks: [], // { pickNumber, playerId, byTeam } in order made
  };
}

let draftState = loadDraftState();

function saveDraftState() {
  writeFileSync(DRAFT_STATE_PATH, JSON.stringify(draftState, null, 2));
}

/** Snake-draft team-on-the-clock for a given overall pick number. */
function teamOnClock(pickNumber, teams) {
  const round = Math.floor((pickNumber - 1) / teams);
  const posInRound = (pickNumber - 1) % teams;
  const slot = round % 2 === 0 ? posInRound + 1 : teams - posInRound;
  return slot;
}

/** Next overall pick number at which `mySlot` is on the clock, from `fromPick` onward. */
function nextPickForSlot(fromPick, mySlot, teams) {
  let pick = fromPick;
  while (teamOnClock(pick, teams) !== mySlot) pick++;
  return pick;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/players", (req, res) => {
  res.json({ players: allPlayers });
});

app.get("/api/draft-state", (req, res) => {
  res.json(draftState);
});

app.post("/api/draft-state/settings", (req, res) => {
  draftState.settings = { ...draftState.settings, ...req.body };
  saveDraftState();
  res.json(draftState);
});

app.post("/api/draft-state/my-slot", (req, res) => {
  draftState.myDraftSlot = req.body.slot;
  saveDraftState();
  res.json(draftState);
});

// Mark a player drafted (by anyone). pickNumber auto-increments if omitted.
app.post("/api/draft-state/pick", (req, res) => {
  const { playerId, byTeam } = req.body;
  const pickNumber = draftState.picks.length + 1;
  draftState.picks.push({ pickNumber, playerId, byTeam: byTeam ?? teamOnClock(pickNumber, draftState.settings.teams) });
  saveDraftState();
  res.json(draftState);
});

app.post("/api/draft-state/undo", (req, res) => {
  draftState.picks.pop();
  saveDraftState();
  res.json(draftState);
});

app.post("/api/draft-state/reset", (req, res) => {
  draftState = { settings: DEFAULT_SETTINGS, myDraftSlot: 1, picks: [] };
  saveDraftState();
  res.json(draftState);
});

// The main endpoint the client polls after every pick: available players
// ranked by recommendation score, tiers, and opportunity cost.
app.get("/api/recommendations", (req, res) => {
  const draftedIds = new Set(draftState.picks.map(p => p.playerId));
  const available = allPlayers.filter(p => !draftedIds.has(p.id));

  const currentPick = draftState.picks.length + 1;
  const nextPickNumber = nextPickForSlot(currentPick, draftState.myDraftSlot, draftState.settings.teams);

  // My current roster as full player objects, for marginal-value scoring.
  const playerById = new Map(allPlayers.map(p => [p.id, p]));
  const myRosterPlayers = draftState.picks
    .filter(p => p.byTeam === draftState.myDraftSlot)
    .map(p => playerById.get(p.playerId))
    .filter(Boolean);

  const { players, opportunityCost } = getRecommendations(available, {
    nextPickNumber,
    settings: draftState.settings,
    myRosterPlayers,
  });

  // Best starting lineup for my ACTUAL roster right now (computed once, separate
  // from the per-candidate marginal-value calls) so the client can render it.
  const { replacementPoints } = computeVOR(available, draftState.settings);
  const { assignment } = computeLineupValue(myRosterPlayers, draftState.settings, replacementPoints);

  res.json({
    players,
    opportunityCost,
    assignment,
    currentPick,
    nextPickNumber,
    picksUntilMyTurn: nextPickNumber - currentPick,
    onTheClockSlot: teamOnClock(currentPick, draftState.settings.teams),
    myDraftSlot: draftState.myDraftSlot,
  });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`Draft helper server running on http://localhost:${PORT}`));
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already in use — likely an orphaned server from ` +
      `a previous session still serving stale data. Run: pkill -f "node server.js"\n`);
    process.exit(1);
  }
  throw err;
});
