import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([api.getRecommendations(), api.getDraftState()]);
      setRec(r);
      setDraftState(d);
      setError(null);
    } catch (e) {
      setError("Can't reach the draft helper server. Is it running on port 3001?");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:3001/api/players");
        const data = await res.json();
        setAllPlayers(data.players);
      } catch {
        // handled by refresh() error state below
      }
    })();
    refresh();
  }, [refresh]);

  const handleDraft = async (playerId: number) => {
    await api.pickPlayer(playerId);
    refresh();
  };

  const handleUndo = async () => {
    await api.undo();
    refresh();
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

  const myPlayerIds = new Set(
    draftState.picks.filter(p => p.byTeam === draftState.myDraftSlot).map(p => p.playerId)
  );
  const myPlayers = allPlayers.filter(p => myPlayerIds.has(p.id));

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

      <RosterStrip assignment={rec.assignment} myPlayers={myPlayers} />

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
