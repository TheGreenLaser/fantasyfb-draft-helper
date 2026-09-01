import { useMemo } from "react";
import type { DraftPick, Player } from "../types";
import { POSITION_VAR } from "../constants";

/**
 * A scrolling log of recent picks — most useful in practice mode so the user
 * can see what opponents just auto-drafted without scanning the whole player
 * table. Shown in live mode too for consistency. Most recent pick on top.
 */
export function DraftFeed({
  picks,
  players,
  mySlot,
  teams,
  limit = 40,
}: {
  picks: DraftPick[];
  players: Player[];
  mySlot: number;
  teams: number;
  limit?: number;
}) {
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  const recent = picks.slice(-limit).reverse();

  if (recent.length === 0) {
    return (
      <div className="draft-feed draft-feed--empty">
        <span className="draft-feed__title">Draft feed</span>
        <span className="text-muted">No picks yet.</span>
      </div>
    );
  }

  return (
    <div className="draft-feed">
      <span className="draft-feed__title">Draft feed</span>
      <ol className="draft-feed__list">
        {recent.map(pick => {
          const player = playerById.get(pick.playerId);
          const mine = pick.byTeam === mySlot;
          const round = Math.floor((pick.pickNumber - 1) / teams) + 1;
          return (
            <li key={pick.pickNumber} className={`draft-feed__row ${mine ? "draft-feed__row--mine" : ""}`}>
              <span className="draft-feed__pick">{round}.{String(((pick.pickNumber - 1) % teams) + 1).padStart(2, "0")}</span>
              <span className="draft-feed__team">{mine ? "You" : `Team ${pick.byTeam}`}</span>
              {player ? (
                <>
                  <span
                    className="pos-chip pos-chip--sm"
                    style={{ background: `var(${POSITION_VAR[player.position]})` }}
                  >
                    {player.position}
                  </span>
                  <span className="draft-feed__name">{player.name}</span>
                </>
              ) : (
                <span className="draft-feed__name text-muted">#{pick.playerId}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
