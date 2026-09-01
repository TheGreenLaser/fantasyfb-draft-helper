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
