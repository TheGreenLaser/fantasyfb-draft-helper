// Generates mock player projection data shaped like a simplified version of
// what the FantasyPros API returns (player, position, team, projected points,
// ADP, ADP std dev). This lets the rest of the app be built and tested before
// a FantasyPros API key is wired in — swapping this file for a real fetch
// later should not require touching any other code.

import { writeFileSync } from "fs";

const rng = (seed => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
})(42);

function jitter(base, pct) {
  return base * (1 + (rng() - 0.5) * 2 * pct);
}

// Realistic-shaped point curves per position: (rank, points) anchor pairs,
// points fall off roughly like real season-long fantasy scoring curves.
const curves = {
  QB: { top: 380, floor: 180, count: 32, decay: 1.3 },
  RB: { top: 340, floor: 40, count: 65, decay: 1.15 },
  WR: { top: 320, floor: 40, count: 75, decay: 1.12 },
  TE: { top: 240, floor: 40, count: 32, decay: 1.4 },
  K: { top: 150, floor: 100, count: 24, decay: 1.05 },
  DST: { top: 150, floor: 80, count: 24, decay: 1.08 },
};

const firstNames = ["James","Michael","Chris","David","Marcus","Josh","Justin","Tyler","Jordan","DeAndre",
  "Ja'Marr","Amon-Ra","Puka","CeeDee","Brock","Trevor","Kyler","Dak","Lamar","Patrick",
  "Bijan","Jonathan","Breece","Saquon","Jahmyr","De'Von","Kenneth","Isiah","Rachaad","Travis",
  "Sam","Mark","George","T.J.","Evan","Nico","Malik","Garrett","Drake","Chris"];
const lastNames = ["Johnson","Williams","Brown","Jones","Davis","Miller","Wilson","Moore","Taylor","Anderson",
  "Chase","St. Brown","Nacua","Lamb","Bowers","Lawrence","Murray","Prescott","Jackson","Mahomes",
  "Robinson","Taylor","Hall","Barkley","Gibbs","Achane","Walker","Pacheco","White","Kelce",
  "LaPorta","Andrews","Hockenson","Higgins","Engram","Collins","Nabers","Wilson","London","Godwin"];
const teams = ["BUF","MIA","NE","NYJ","BAL","CIN","CLE","PIT","HOU","IND","JAX","TEN",
  "DEN","KC","LV","LAC","DAL","NYG","PHI","WAS","CHI","DET","GB","MIN",
  "ATL","CAR","NO","TB","ARI","LAR","SF","SEA"];

let idCounter = 1;
function makeName(used) {
  let name;
  do {
    name = `${firstNames[Math.floor(rng() * firstNames.length)]} ${lastNames[Math.floor(rng() * lastNames.length)]}`;
  } while (used.has(name));
  used.add(name);
  return name;
}

function pointsForRank(rank, curve) {
  const { top, floor, count, decay } = curve;
  const t = Math.min(rank / count, 1);
  const val = floor + (top - floor) * Math.pow(1 - t, decay);
  return Math.max(floor * 0.85, jitter(val, 0.04));
}

const players = [];
const usedNames = new Set();

for (const [position, curve] of Object.entries(curves)) {
  for (let rank = 1; rank <= curve.count; rank++) {
    const projected = Math.round(pointsForRank(rank, curve) * 10) / 10;
    players.push({
      id: idCounter++,
      name: position === "DST" ? `${teams[(rank - 1) % teams.length]} D/ST` : makeName(usedNames),
      position,
      team: teams[Math.floor(rng() * teams.length)],
      byeWeek: 5 + Math.floor(rng() * 9),
      projectedPoints: projected,
      positionRank: rank,
    });
  }
}

// Overall ADP: roughly sorted by points across positions, with realistic
// position-based ADP skew (QBs/TEs go later than their points would suggest
// in most formats; RB/WR go earlier), plus noise and a std dev per player
// that widens further down the board (later picks are less consensus-y).
const adpSkew = { QB: 1.35, RB: 0.85, WR: 0.88, TE: 1.2, K: 3.0, DST: 2.6 };

players.forEach(p => {
  p._adpScore = p.projectedPoints / adpSkew[p.position];
});
players.sort((a, b) => b._adpScore - a._adpScore);

players.forEach((p, i) => {
  const rawAdp = i + 1 + (rng() - 0.5) * 6;
  p.adp = Math.max(1, Math.round(rawAdp * 10) / 10);
  p.adpStdDev = Math.round((2 + p.adp * 0.12) * 10) / 10;
  delete p._adpScore;
});

players.sort((a, b) => a.adp - b.adp);

writeFileSync(
  new URL("./projections.json", import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), source: "mock", players }, null, 2)
);

console.log(`Wrote ${players.length} mock players to projections.json`);
