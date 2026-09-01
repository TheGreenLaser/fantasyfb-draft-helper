import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { DEFAULT_SETTINGS } from "./lib/leagueSettings.js";
import { getRecommendations, computeVOR } from "./lib/valuation.js";
import { computeLineupValue } from "./lib/lineup.js";
import { teamOnClock, nextPickForSlot } from "./lib/draftMath.js";
import {
  simulateCandidates,
  DEFAULT_NUM_SIMULATIONS,
  DEFAULT_HORIZON_PICKS,
  DEFAULT_CANDIDATE_COUNT,
} from "./lib/montecarlo.js";
import { autoDraftUntilMyTurn, undoPracticePick } from "./lib/practice.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTIONS_PATH = join(__dirname, "data", "projections.json");
const DRAFT_STATE_PATH = join(__dirname, "data", "draft-state.json");

const { players: allPlayers } = JSON.parse(readFileSync(PROJECTIONS_PATH, "utf-8"));

function freshDraftState() {
  return {
    settings: DEFAULT_SETTINGS,
    myDraftSlot: 1, // 1-indexed position in the snake order
    mode: "live", // "live" | "practice" — practice auto-drafts every other team
    picks: [], // { pickNumber, playerId, byTeam } in order made
  };
}

function loadDraftState() {
  if (existsSync(DRAFT_STATE_PATH)) {
    const loaded = JSON.parse(readFileSync(DRAFT_STATE_PATH, "utf-8"));
    // Back-compat: state files written before Practice Mode have no `mode`.
    if (loaded.mode !== "practice") loaded.mode = "live";
    return loaded;
  }
  return freshDraftState();
}

let draftState = loadDraftState();

function saveDraftState() {
  writeFileSync(DRAFT_STATE_PATH, JSON.stringify(draftState, null, 2));
}

/**
 * Shared setup for the routes that reason about "the board right now":
 * available players, the current/next pick numbers, and my roster as full
 * player objects. Used by both /api/recommendations and /api/simulate so
 * there's one definition of that context.
 */
function buildDraftContext() {
  const draftedIds = new Set(draftState.picks.map(p => p.playerId));
  const available = allPlayers.filter(p => !draftedIds.has(p.id));

  const currentPick = draftState.picks.length + 1;
  const nextPickNumber = nextPickForSlot(currentPick, draftState.myDraftSlot, draftState.settings.teams);

  const playerById = new Map(allPlayers.map(p => [p.id, p]));
  const myRosterPlayers = draftState.picks
    .filter(p => p.byTeam === draftState.myDraftSlot)
    .map(p => playerById.get(p.playerId))
    .filter(Boolean);

  return { available, currentPick, nextPickNumber, myRosterPlayers, playerById };
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
// In practice mode, recording the user's pick also auto-drafts every
// opponent up to the user's next turn; those picks come back as `autoPicks`.
app.post("/api/draft-state/pick", (req, res) => {
  const { playerId, byTeam } = req.body;
  const pickNumber = draftState.picks.length + 1;
  draftState.picks.push({ pickNumber, playerId, byTeam: byTeam ?? teamOnClock(pickNumber, draftState.settings.teams) });

  if (draftState.mode === "practice") {
    const autoPicks = autoDraftUntilMyTurn(draftState, allPlayers);
    saveDraftState();
    return res.json({ ...draftState, autoPicks });
  }

  saveDraftState();
  res.json(draftState);
});

app.post("/api/draft-state/undo", (req, res) => {
  if (draftState.mode === "practice") {
    // Rewind past the opponent auto-picks back to before my last decision.
    undoPracticePick(draftState);
  } else {
    draftState.picks.pop();
  }
  saveDraftState();
  res.json(draftState);
});

app.post("/api/draft-state/reset", (req, res) => {
  draftState = freshDraftState();
  saveDraftState();
  res.json(draftState);
});

// Switch draft mode. Going back to "live" needs no special handling — the app
// just stops auto-drafting after future picks; history is left untouched.
app.post("/api/draft-state/mode", (req, res) => {
  const { mode } = req.body;
  if (mode === "live" || mode === "practice") draftState.mode = mode;
  saveDraftState();
  res.json(draftState);
});

// Start a fresh practice draft: reset, set my slot, and immediately auto-draft
// every pick before my first turn. Returns the new state plus the auto-picks.
app.post("/api/draft-state/start-practice", (req, res) => {
  const slot = Number(req.body.slot);
  draftState = freshDraftState();
  draftState.mode = "practice";
  draftState.myDraftSlot = Number.isFinite(slot) && slot >= 1 ? slot : 1;
  const autoPicks = autoDraftUntilMyTurn(draftState, allPlayers);
  saveDraftState();
  res.json({ ...draftState, autoPicks });
});

// The main endpoint the client polls after every pick: available players
// ranked by recommendation score, tiers, and opportunity cost.
app.get("/api/recommendations", (req, res) => {
  const { available, currentPick, nextPickNumber, myRosterPlayers } = buildDraftContext();

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

// Manual-trigger Monte Carlo (Layer 5). NOT polled — this is a deliberate
// "think harder about this pick" call and takes ~1.5-2.5s. Body:
//   { candidateIds?: number[] }  — omit to simulate the top-N players from
//   the current recommendation ranking; pass IDs to compare specific players.
app.post("/api/simulate", (req, res) => {
  const { available, currentPick, myRosterPlayers } = buildDraftContext();
  const settings = draftState.settings;

  const candidateIds = Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : null;

  let candidates;
  if (candidateIds && candidateIds.length > 0) {
    const wanted = new Set(candidateIds);
    candidates = available.filter(p => wanted.has(p.id));
  } else {
    const { players: ranked } = getRecommendations(available, {
      nextPickNumber: nextPickForSlot(currentPick, draftState.myDraftSlot, settings.teams),
      settings,
      myRosterPlayers,
    });
    candidates = ranked.slice(0, DEFAULT_CANDIDATE_COUNT);
  }

  if (candidates.length === 0) {
    return res.status(400).json({ error: "No valid candidates to simulate." });
  }

  const started = Date.now();
  const { results } = simulateCandidates({
    candidates,
    availablePlayers: available,
    myRoster: myRosterPlayers,
    currentPick,
    myDraftSlot: draftState.myDraftSlot,
    settings,
    numSimulations: DEFAULT_NUM_SIMULATIONS,
    horizonPicks: DEFAULT_HORIZON_PICKS,
  });

  res.json({
    results,
    numSimulations: DEFAULT_NUM_SIMULATIONS,
    horizonPicks: DEFAULT_HORIZON_PICKS,
    tookMs: Date.now() - started,
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
