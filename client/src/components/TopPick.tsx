import type { RankedPlayer } from "../types";
import { POSITION_VAR } from "../constants";

function reasonFor(player: RankedPlayer, runnerUp?: RankedPlayer): string {
  if (player.opportunityCost > 8) {
    return `Sharp drop-off at ${player.position} after this tier — waiting is expensive.`;
  }
  // Marginal value is clearly the dominant factor: a much bigger lineup upgrade
  // than the runner-up, distinct from the opportunity-cost-driven reasons above.
  if (runnerUp && player.marginalValue > 0 && player.marginalValue >= runnerUp.marginalValue * 1.5 + 5) {
    return `Biggest upgrade to your starting lineup available right now.`;
  }
  if (player.tier === 1) {
    return `Top tier at ${player.position}, clear of the field.`;
  }
  if (runnerUp && player.position !== runnerUp.position) {
    return `Best value on the board right now.`;
  }
  return `Highest value over replacement available.`;
}

export function TopPick({ player, runnerUp, onDraft }: { player: RankedPlayer | undefined; runnerUp?: RankedPlayer; onDraft: (id: number) => void }) {
  if (!player) {
    return (
      <div className="top-pick top-pick--empty">
        <span>No players left on the board.</span>
      </div>
    );
  }

  return (
    <div className="top-pick">
      <div className="top-pick__label">Recommended pick</div>
      <div className="top-pick__main">
        <span className="pos-chip" style={{ background: `var(${POSITION_VAR[player.position]})` }}>
          {player.position}
        </span>
        <span className="top-pick__name">{player.name}</span>
        <span className="top-pick__team">{player.team}</span>
        <button className="btn btn--primary top-pick__draft" onClick={() => onDraft(player.id)}>
          Draft {player.name.split(" ")[0]}
        </button>
      </div>
      <div className="top-pick__meta">
        <span>{reasonFor(player, runnerUp)}</span>
        <span className="top-pick__stats">
          marginal <strong>{player.marginalValue}</strong> · VOR <strong>{player.vor}</strong> · opp. cost <strong>{player.opportunityCost}</strong> · tier <strong>{player.tier}</strong>
        </span>
      </div>
    </div>
  );
}
