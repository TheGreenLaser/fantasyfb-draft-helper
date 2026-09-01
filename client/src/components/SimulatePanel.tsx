import { useState } from "react";
import { api } from "../api";
import type { RankedPlayer, SimulationResponse } from "../types";
import { POSITION_VAR } from "../constants";

/**
 * Layer 5 UI: a manual "simulate the rest of the draft" button. Opt-in only
 * — this never fires on pick changes. Takes ~1.5-2.5s server-side, so the
 * loading state shows the candidate names up front rather than a blank wait.
 */
export function SimulatePanel({ topCandidates }: { topCandidates: RankedPlayer[] }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.simulate());
    } catch {
      setError("Simulation failed — is the server still running?");
    } finally {
      setLoading(false);
    }
  };

  const previewNames = topCandidates.slice(0, 8).map(p => p.name);

  // Shared scale for the p10-p90 bars: min p10 / max p90 across all results.
  const lo = data ? Math.min(...data.results.map(r => r.p10)) : 0;
  const hi = data ? Math.max(...data.results.map(r => r.p90)) : 1;
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  const best = data?.results[0];

  return (
    <div className="sim-panel">
      <div className="sim-panel__head">
        <div>
          <div className="sim-panel__label">Monte Carlo</div>
          <div className="sim-panel__sub">
            Simulate the rest of the draft to see which pick gives the best roster on average.
          </div>
        </div>
        <button className="btn btn--primary" onClick={run} disabled={loading}>
          {loading ? "Simulating…" : data ? "Re-run" : "Simulate top picks"}
        </button>
      </div>

      {loading && (
        <div className="sim-panel__loading">
          <span className="sim-spinner" aria-hidden />
          <span>
            Running ~150 simulations across {previewNames.length} candidates
            {previewNames.length > 0 && <> — {previewNames.join(", ")}</>}. This takes a couple seconds.
          </span>
        </div>
      )}

      {error && !loading && <div className="sim-panel__error">{error}</div>}

      {data && !loading && (
        <>
          <div className="sim-panel__meta">
            {data.numSimulations} sims · {data.horizonPicks}-pick horizon · {(data.tookMs / 1000).toFixed(1)}s
          </div>
          <div className="sim-rows">
            {data.results.map((r, i) => (
              <div className={`sim-row${i === 0 ? " sim-row--best" : ""}`} key={r.playerId}>
                <span
                  className="pos-chip pos-chip--sm"
                  style={{ background: `var(${POSITION_VAR[r.position]})` }}
                >
                  {r.position}
                </span>
                <span className="sim-row__name">{r.name}</span>
                <div className="sim-row__bar">
                  <div
                    className="sim-row__range"
                    style={{ left: `${pct(r.p10)}%`, width: `${pct(r.p90) - pct(r.p10)}%` }}
                  />
                  <div className="sim-row__mean" style={{ left: `${pct(r.mean)}%` }} />
                </div>
                <span className="sim-row__val">{r.mean}</span>
              </div>
            ))}
          </div>
          {best && (
            <div className="sim-panel__takeaway">
              Best expected roster: <strong>{best.name}</strong> ({best.mean}, likely range {best.p10}–{best.p90}).
            </div>
          )}
        </>
      )}
    </div>
  );
}
