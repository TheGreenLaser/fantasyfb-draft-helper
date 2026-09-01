interface Props {
  currentPick: number;
  totalPicks: number;
  mySlot: number;
  teams: number;
  picksUntilMyTurn: number;
  onSlotChange: (slot: number) => void;
  onUndo: () => void;
  onReset: () => void;
}

export function Header({ currentPick, totalPicks, mySlot, teams, picksUntilMyTurn, onSlotChange, onUndo, onReset }: Props) {
  const onTheClock = picksUntilMyTurn === 0;

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__title">Draft Helper</span>
        <span className="header__pick-count">
          pick {Math.min(currentPick, totalPicks)} of {totalPicks}
        </span>
      </div>

      <div className={`header__status ${onTheClock ? "header__status--live" : ""}`}>
        {onTheClock ? "You're on the clock" : `${picksUntilMyTurn} pick${picksUntilMyTurn === 1 ? "" : "s"} until your turn`}
      </div>

      <div className="header__controls">
        <label className="header__slot">
          Draft slot
          <select value={mySlot} onChange={e => onSlotChange(Number(e.target.value))}>
            {Array.from({ length: teams }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={onUndo}>Undo</button>
        <button className="btn btn--danger" onClick={onReset}>Reset</button>
      </div>
    </header>
  );
}
