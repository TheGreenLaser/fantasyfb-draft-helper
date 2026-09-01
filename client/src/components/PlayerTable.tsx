import { useMemo, useState } from "react";
import type { Position, RankedPlayer } from "../types";
import { POSITIONS, POSITION_VAR } from "../constants";

type SortKey =
  | "recommendationScore"
  | "marginalValue"
  | "vor"
  | "projectedPoints"
  | "adp"
  | "opportunityCost";

const SORT_LABELS: Record<SortKey, string> = {
  recommendationScore: "Score",
  marginalValue: "Marg.",
  vor: "VOR",
  projectedPoints: "Proj",
  adp: "ADP",
  opportunityCost: "Opp. cost",
};

// Shown on hover. "Marg." reflects value to your CURRENT roster (how much this
// player would improve your best starting lineup right now), so it can disagree
// with "Score" for a saturated position — Score is roster-agnostic (VOR-based).
const SORT_TITLES: Partial<Record<SortKey, string>> = {
  recommendationScore: "Roster-agnostic value (VOR + opportunity cost). Every player treated equally regardless of how full that position is on your roster.",
  marginalValue: "Value to your current roster: how much this player would improve your best possible starting lineup right now. Not used for ranking.",
};

export function PlayerTable({ players, onDraft }: { players: RankedPlayer[]; onDraft: (id: number) => void }) {
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recommendationScore");

  const filtered = useMemo(() => {
    let list = players;
    if (posFilter !== "ALL") list = list.filter(p => p.position === posFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    const dir = sortKey === "adp" ? 1 : -1; // lower ADP = sooner gone = show first when sorting by ADP
    return [...list].sort((a, b) => dir * (a[sortKey] - b[sortKey]));
  }, [players, posFilter, search, sortKey]);

  return (
    <div className="player-table-wrap">
      <div className="player-table__controls">
        <div className="pos-filter">
          <button
            className={`pos-filter__btn ${posFilter === "ALL" ? "pos-filter__btn--active" : ""}`}
            onClick={() => setPosFilter("ALL")}
          >
            All
          </button>
          {POSITIONS.map(pos => (
            <button
              key={pos}
              className={`pos-filter__btn ${posFilter === pos ? "pos-filter__btn--active" : ""}`}
              style={posFilter === pos ? { borderColor: `var(${POSITION_VAR[pos]})`, color: `var(${POSITION_VAR[pos]})` } : undefined}
              onClick={() => setPosFilter(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="player-table__scroll">
        <table className="player-table">
          <thead>
            <tr>
              <th className="col-tier">Tier</th>
              <th className="col-name">Player</th>
              <th className="col-pos">Pos</th>
              <th className="col-team">Team</th>
              <th className="col-bye">Bye</th>
              {(["projectedPoints", "vor", "marginalValue", "opportunityCost", "recommendationScore", "adp"] as SortKey[]).map(key => (
                <th
                  key={key}
                  className={`col-num sortable ${sortKey === key ? "sortable--active" : ""}`}
                  onClick={() => setSortKey(key)}
                  title={SORT_TITLES[key]}
                >
                  {SORT_LABELS[key]}
                </th>
              ))}
              <th className="col-action" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const prevTier = i > 0 ? filtered[i - 1].tier : null;
              const tierBoundary = sortKey === "recommendationScore" && p.tier !== prevTier && i > 0;
              return (
                <tr key={p.id} className={tierBoundary ? "row--tier-start" : ""}>
                  <td className="col-tier">
                    <span className="tier-dot" style={{ background: `var(${POSITION_VAR[p.position]})` }}>
                      {p.tier}
                    </span>
                  </td>
                  <td className="col-name">{p.name}</td>
                  <td className="col-pos">
                    <span className="pos-chip pos-chip--sm" style={{ background: `var(${POSITION_VAR[p.position]})` }}>
                      {p.position}
                    </span>
                  </td>
                  <td className="col-team text-muted">{p.team}</td>
                  <td className="col-bye text-muted">{p.byeWeek ?? "–"}</td>
                  <td className="col-num mono">{p.projectedPoints.toFixed(1)}</td>
                  <td className="col-num mono">{p.vor.toFixed(1)}</td>
                  <td className="col-num mono">{p.marginalValue.toFixed(1)}</td>
                  <td className="col-num mono">{p.opportunityCost.toFixed(1)}</td>
                  <td className="col-num mono strong">{p.recommendationScore.toFixed(1)}</td>
                  <td className="col-num mono text-muted">{p.adp.toFixed(1)}</td>
                  <td className="col-action">
                    <button className="btn btn--sm" onClick={() => onDraft(p.id)}>Draft</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="empty-row">No players match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
