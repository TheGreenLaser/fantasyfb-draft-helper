import type { Player, LineupAssignment } from "../types";
import { isPlaceholder } from "../types";
import { POSITION_VAR } from "../constants";

/** Strips the trailing index off slot keys so "RB1"/"RB2" both show as "RB". */
function slotLabel(key: string) {
  return key.replace(/\d+$/, "");
}

export function RosterStrip({
  assignment,
  myPlayers,
}: {
  assignment: LineupAssignment;
  myPlayers: Player[];
}) {
  const slots = Object.entries(assignment);
  const starterIds = new Set(
    slots
      .map(([, v]) => (isPlaceholder(v) ? null : v.id))
      .filter((id): id is number => id !== null)
  );
  const bench = myPlayers.filter(p => !starterIds.has(p.id));

  return (
    <div className="roster-strip">
      {slots.map(([key, slot]) => {
        if (isPlaceholder(slot)) {
          return (
            <div key={key} className="roster-slot roster-slot--placeholder">
              <span className="roster-slot__label">{slotLabel(key)}</span>
              <span className="roster-slot__empty">waiver-level</span>
            </div>
          );
        }
        return (
          <div key={key} className="roster-slot roster-slot--filled">
            <span className="roster-slot__label">{slotLabel(key)}</span>
            <span
              className="roster-slot__dot"
              style={{ background: `var(${POSITION_VAR[slot.position]})` }}
            />
            <span className="roster-slot__name">{slot.name}</span>
          </div>
        );
      })}
      {bench.length > 0 && (
        <div className="roster-slot roster-slot--bench">
          <span className="roster-slot__label">Bench ({bench.length})</span>
          <span className="roster-slot__name roster-slot__name--muted">
            {bench.map(p => p.name).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
