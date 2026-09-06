import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { DraftState, Player, RecommendationsResponse } from "./types";
import { Header } from "./components/Header";
import { TopPick } from "./components/TopPick";
import { SimulatePanel } from "./components/SimulatePanel";
import { RosterStrip } from "./components/RosterStrip";
import { PlayerTable } from "./components/PlayerTable";
import { DraftFeed } from "./components/DraftFeed";
import "./index.css";
import "./App.css";

export default function App() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [rec, setRec] = useState<RecommendationsResponse | null>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One request, one snapshot. The recommendations response carries the full
  // draftState from the same server snapshot, so the header, feed and roster
  // can't desync from each other. The seq guard drops a slow earlier refresh
  // whose response lands after a newer one (rapid drafting), which otherwise
  // makes the board jump backwards (e.g. pick 1 → 2 → 5 → 4).
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const r = await api.getRecommendations();
      if (seq !== refreshSeq.current) return; // a newer refresh already won
      setRec(r);
      setDraftState(r.draftState);
      setError(null);
    } catch (e) {
      if (seq !== refreshSeq.current) return;
      setError("Can't reach the draft helper server.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/players");
        const data = await res.json();
        setAllPlayers(data.players);
      } catch {
        // handled by refresh() error state below
      }
    })();
    refresh();
  }, [refresh]);

  const handleDraft = async (playerId: number) => {
    // A 409 here means the board was behind the real draft and this player is
    // already gone. Swallow it and refresh so the board resnaps to the truth.
    try {
      await api.pickPlayer(playerId);
    } catch {
      /* fall through to refresh */
    }
    await refresh();
  };

  const handleUndo = async () => {
    await api.undo();
    await refresh();
  };

  const handleReset = async () => {
    if (!confirm("Reset the whole draft? This clears every pick.")) return;
    await api.reset();
    refresh();
  };

  const handleStartPractice = async (slot: number) => {
    await api.startPractice(slot);
    refresh();
  };

  const handleExitPractice = async () => {
    await api.setMode("live");
    refresh();
  };

  const handleSlotChange = async (slot: number) => {
    await api.setMySlot(slot);
    refresh();
  };

  if (error) {
    return (
      <div className="app-error">
        <p>{error}</p>
        <p className="text-muted">Run <code>npm run dev</code> in the server folder, then reload this page.</p>
      </div>
    );
  }

  if (!rec || !draftState) {
    return <div className="app-loading">Loading draft board…</div>;
  }

  const totalPicks = draftState.settings.teams * (
    Object.values(draftState.settings.roster).reduce((a, b) => a + b, 0)
  );

  return (
    <div className="app">
      <Header
        currentPick={rec.currentPick}
        totalPicks={totalPicks}
        mySlot={draftState.myDraftSlot}
        teams={draftState.settings.teams}
        picksUntilMyTurn={rec.picksUntilMyTurn}
        mode={draftState.mode}
        hasPicks={draftState.picks.length > 0}
        onSlotChange={handleSlotChange}
        onStartPractice={handleStartPractice}
        onExitPractice={handleExitPractice}
        onUndo={handleUndo}
        onReset={handleReset}
      />

      <TopPick player={rec.players[0]} runnerUp={rec.players[1]} onDraft={handleDraft} />

      <SimulatePanel topCandidates={rec.players} />

      <RosterStrip assignment={rec.assignment} bench={rec.bench} />

      <DraftFeed
        picks={draftState.picks}
        players={allPlayers}
        mySlot={draftState.myDraftSlot}
        teams={draftState.settings.teams}
      />

      <PlayerTable players={rec.players} onDraft={handleDraft} />
    </div>
  );
}
