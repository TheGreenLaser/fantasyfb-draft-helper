interface Props {
  currentPick: number;
  totalPicks: number;
  mySlot: number;
  teams: number;
  picksUntilMyTurn: number;
  mode: "live" | "practice";
  hasPicks: boolean;
  onSlotChange: (slot: number) => void;
  onStartPractice: (slot: number) => void;
  onExitPractice: () => void;
  onUndo: () => void;
  onReset: () => void;
}

export function Header({
  currentPick,
  totalPicks,
  mySlot,
  teams,
  picksUntilMyTurn,
  mode,
  hasPicks,
  onSlotChange,
  onStartPractice,
  onExitPractice,
  onUndo,
  onReset,
}: Props) {
  const onTheClock = picksUntilMyTurn === 0;
  const practice = mode === "practice";

  const handlePracticeClick = () => {
    if (practice) {
      if (hasPicks && !confirm("Exit practice mode? Future picks won't auto-draft; the board stays as-is.")) return;
      onExitPractice();
      return;
    }
    if (hasPicks && !confirm("Start a practice draft? This clears the current draft and auto-drafts every other team.")) return;
    onStartPractice(mySlot);
  };

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
        {practice && <span className="header__mode-badge">Practice · slot {mySlot}</span>}
        <label className="header__slot">
          Draft slot
          <select value={mySlot} onChange={e => onSlotChange(Number(e.target.value))}>
            {Array.from({ length: teams }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button className={`btn ${practice ? "btn--danger" : ""}`} onClick={handlePracticeClick}>
          {practice ? "Exit practice" : "Practice mode"}
        </button>
        <button className="btn" onClick={onUndo}>Undo</button>
        <button className="btn btn--danger" onClick={onReset}>Reset</button>
      </div>
    </header>
  );
}
