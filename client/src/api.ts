import type { DraftState, RecommendationsResponse } from "./types";

const BASE = "http://localhost:3001";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  getRecommendations: () => req<RecommendationsResponse>("/api/recommendations"),
  getDraftState: () => req<DraftState>("/api/draft-state"),
  setMySlot: (slot: number) => req<DraftState>("/api/draft-state/my-slot", { method: "POST", body: JSON.stringify({ slot }) }),
  setSettings: (settings: Partial<DraftState["settings"]>) =>
    req<DraftState>("/api/draft-state/settings", { method: "POST", body: JSON.stringify(settings) }),
  pickPlayer: (playerId: number) =>
    req<DraftState>("/api/draft-state/pick", { method: "POST", body: JSON.stringify({ playerId }) }),
  undo: () => req<DraftState>("/api/draft-state/undo", { method: "POST" }),
  reset: () => req<DraftState>("/api/draft-state/reset", { method: "POST" }),
};
