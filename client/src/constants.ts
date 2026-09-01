import type { Position } from "./types";

export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export const POSITION_VAR: Record<Position, string> = {
  QB: "--qb",
  RB: "--rb",
  WR: "--wr",
  TE: "--te",
  K: "--k",
  DST: "--dst",
};

// Order roster slots should fill in for the roster strip.
export const STARTER_SLOTS: { slot: string; eligible: Position[] }[] = [
  { slot: "QB", eligible: ["QB"] },
  { slot: "RB", eligible: ["RB"] },
  { slot: "RB", eligible: ["RB"] },
  { slot: "WR", eligible: ["WR"] },
  { slot: "WR", eligible: ["WR"] },
  { slot: "TE", eligible: ["TE"] },
  { slot: "FLEX", eligible: ["RB", "WR", "TE"] },
  { slot: "K", eligible: ["K"] },
  { slot: "DST", eligible: ["DST"] },
];
