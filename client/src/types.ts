export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export interface Player {
  id: number;
  name: string;
  position: Position;
  team: string;
  byeWeek: number | null;
  projectedPoints: number;
  positionRank: number;
  adp: number;
  adpStdDev: number;
}

export interface RankedPlayer extends Player {
  vor: number;
  /** Point improvement this player adds to my best starting lineup (roster-aware). */
  marginalValue: number;
  opportunityCost: number;
  recommendationScore: number;
  tier: number | null;
}

/** A placeholder for a lineup slot I haven't filled yet (worth replacement-level points). */
export interface LineupPlaceholder {
  placeholder: true;
  position: string;
  points: number;
}

/** slot key ("QB", "RB1", "FLEX", …) → the rostered player filling it, or a placeholder. */
export type LineupAssignment = Record<string, Player | LineupPlaceholder>;

export function isPlaceholder(slot: Player | LineupPlaceholder): slot is LineupPlaceholder {
  return (slot as LineupPlaceholder).placeholder === true;
}

export interface RecommendationsResponse {
  players: RankedPlayer[];
  opportunityCost: Record<Position, number>;
  assignment: LineupAssignment;
  currentPick: number;
  nextPickNumber: number;
  picksUntilMyTurn: number;
  onTheClockSlot: number;
  myDraftSlot: number;
}

export interface RosterSettings {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  K: number;
  DST: number;
  BENCH: number;
}

export interface LeagueSettings {
  teams: number;
  scoring: string;
  roster: RosterSettings;
}

export interface DraftPick {
  pickNumber: number;
  playerId: number;
  byTeam: number;
}

export interface DraftState {
  settings: LeagueSettings;
  myDraftSlot: number;
  picks: DraftPick[];
}
