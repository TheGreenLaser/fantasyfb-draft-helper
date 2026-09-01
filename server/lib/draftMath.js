// Snake-draft math. Single source of truth — imported by both server.js
// (the live draft board) and montecarlo.js (simulated future picks).

/** Snake-draft team-on-the-clock (1-indexed slot) for a given overall pick number. */
export function teamOnClock(pickNumber, teams) {
  const round = Math.floor((pickNumber - 1) / teams);
  const posInRound = (pickNumber - 1) % teams;
  const slot = round % 2 === 0 ? posInRound + 1 : teams - posInRound;
  return slot;
}

/** Next overall pick number at which `mySlot` is on the clock, from `fromPick` onward. */
export function nextPickForSlot(fromPick, mySlot, teams) {
  let pick = fromPick;
  while (teamOnClock(pick, teams) !== mySlot) pick++;
  return pick;
}
