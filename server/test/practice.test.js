// Practice Draft Mode tests. Run: npm test  (from server/)
//
// Covers the six scenarios from the feature spec: slot-1 start, late-slot
// start, snake reversal across rounds, mid-practice undo, full-draft
// completion, and a speed check for the auto-draft batch.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { DEFAULT_SETTINGS } from "../lib/leagueSettings.js";
import { teamOnClock } from "../lib/draftMath.js";
import {
  autoDraftUntilMyTurn,
  undoPracticePick,
  totalPicks,
} from "../lib/practice.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { players: allPlayers } = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "projections.json"), "utf-8")
);

function newPractice(slot, settings = DEFAULT_SETTINGS) {
  return { settings, myDraftSlot: slot, mode: "practice", picks: [] };
}

// Record my pick the way POST /api/draft-state/pick does, then run the loop.
function myPick(state, playerId) {
  const draftedIds = new Set(state.picks.map(p => p.playerId));
  const player = playerId
    ? allPlayers.find(p => p.id === playerId)
    : allPlayers.find(p => !draftedIds.has(p.id));
  const pickNumber = state.picks.length + 1;
  state.picks.push({
    pickNumber,
    playerId: player.id,
    byTeam: teamOnClock(pickNumber, state.settings.teams),
  });
  return autoDraftUntilMyTurn(state, allPlayers);
}

test("scenario 1: slot 1 start needs no auto-picks before the first turn", () => {
  const state = newPractice(1);
  const autoPicks = autoDraftUntilMyTurn(state, allPlayers);
  assert.equal(autoPicks.length, 0);
  assert.equal(state.picks.length, 0);
  assert.equal(teamOnClock(1, state.settings.teams), 1); // my turn
});

test("scenario 2: slot 10 of 10 gets exactly 9 auto-picks, then it's my turn", () => {
  const state = newPractice(10);
  const autoPicks = autoDraftUntilMyTurn(state, allPlayers);
  assert.equal(autoPicks.length, 9);
  assert.equal(state.picks.length, 9);
  assert.deepEqual(
    autoPicks.map(p => p.byTeam),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
  // Next pick (10) is genuinely mine.
  assert.equal(teamOnClock(state.picks.length + 1, state.settings.teams), 10);
  // No player drafted twice.
  assert.equal(new Set(state.picks.map(p => p.playerId)).size, 9);
});

test("scenario 3: snake reversal — right number of opponent picks between my turns", () => {
  const teams = DEFAULT_SETTINGS.teams; // 10
  const state = newPractice(3);

  // Before my round-1 pick (overall 3): 2 opponents.
  let auto = autoDraftUntilMyTurn(state, allPlayers);
  assert.equal(auto.length, 2);
  assert.equal(state.picks.length + 1, 3);

  // Round 1 -> round 2. Slot 3 picks at overall 3 and overall 18 (snake),
  // so 14 opponent picks (4..17) resolve in between.
  auto = myPick(state, null);
  assert.equal(auto.length, 14);
  assert.equal(state.picks.length + 1, 18);
  assert.equal(teamOnClock(18, teams), 3);

  // Round 2 -> round 3. Slot 3 picks at overall 18 and overall 23,
  // so 4 opponent picks (19..22) in between — the tight turn at the wall.
  auto = myPick(state, null);
  assert.equal(auto.length, 4);
  assert.equal(state.picks.length + 1, 23);
  assert.equal(teamOnClock(23, teams), 3);
});

test("scenario 4: undo mid-practice lands back exactly at my last decision", () => {
  const state = newPractice(6);
  autoDraftUntilMyTurn(state, allPlayers); // picks 1..5

  const beforePickCount = state.picks.length; // 5
  const myFirstPickPlayerId = allPlayers.find(
    p => !new Set(state.picks.map(x => x.playerId)).has(p.id)
  ).id;
  const auto = myPick(state, myFirstPickPlayerId);
  assert.ok(auto.length > 0, "opponents auto-drafted after my pick");
  assert.ok(state.picks.length > beforePickCount + 1);

  undoPracticePick(state);

  // Back to exactly the state right before my decision.
  assert.equal(state.picks.length, beforePickCount);
  assert.equal(teamOnClock(state.picks.length + 1, state.settings.teams), 6);
  // The player I took is available again.
  assert.ok(!state.picks.some(p => p.playerId === myFirstPickPlayerId));
});

test("scenario 4b: undo with no opponent picks after (my pick was last) drops one", () => {
  // Slot 1: I pick overall 1, and the loop stops immediately at overall 2?
  // No — overall 2 is team 2, so opponents DO run. Use a contrived 1-team
  // league so my pick is always last.
  const solo = newPractice(1, { ...DEFAULT_SETTINGS, teams: 1 });
  myPick(solo, null);
  myPick(solo, null);
  assert.equal(solo.picks.length, 2);
  undoPracticePick(solo);
  assert.equal(solo.picks.length, 1);
});

test("scenario 5: full practice draft completes — no infinite loop, no crash", () => {
  const state = newPractice(7);
  const cap = totalPicks(state.settings);

  let auto = autoDraftUntilMyTurn(state, allPlayers);
  let guard = 0;
  while (state.picks.length < cap && guard < cap + 5) {
    guard++;
    // It's my turn (or draft is done). If done, break.
    if (state.picks.length >= cap) break;
    assert.equal(
      teamOnClock(state.picks.length + 1, state.settings.teams),
      7,
      "loop always stops on my turn until the draft ends"
    );
    auto = myPick(state, null);
  }

  assert.equal(state.picks.length, cap, "every roster spot across every team is filled");
  // Pick numbers are a clean 1..cap sequence.
  assert.deepEqual(
    state.picks.map(p => p.pickNumber),
    Array.from({ length: cap }, (_, i) => i + 1)
  );
  // No duplicate players.
  assert.equal(new Set(state.picks.map(p => p.playerId)).size, cap);
  // A further auto-draft call is a harmless no-op.
  assert.equal(autoDraftUntilMyTurn(state, allPlayers).length, 0);
});

test("scenario 5b: pool exhaustion doesn't hang (tiny player pool)", () => {
  const smallPool = allPlayers.slice(0, 12);
  const state = newPractice(10);
  const auto = autoDraftUntilMyTurn(state, smallPool);
  assert.ok(auto.length <= 12);
  assert.equal(state.picks.length, auto.length);
  // Second call adds nothing once the pool is dry / it's my turn.
  const again = autoDraftUntilMyTurn(state, smallPool);
  assert.ok(again.length + auto.length <= 12);
});

test("scenario 6: auto-drafting a full opponent batch is near-instant", () => {
  const runs = 20;
  const start = performance.now();
  for (let i = 0; i < runs; i++) {
    const state = newPractice(10);
    autoDraftUntilMyTurn(state, allPlayers); // 9 opponent picks
  }
  const perBatchMs = (performance.now() - start) / runs;
  // This is weighted sampling, not simulation. Should be well under 20ms;
  // a generous ceiling catches an accidental getRecommendations call.
  assert.ok(perBatchMs < 50, `9-pick batch took ${perBatchMs.toFixed(2)}ms (expected < 50ms)`);
});
