import type { Player, LineupAssignment } from "../types";
import { isPlaceholder } from "../types";
import { POSITION_VAR } from "../constants";

/** Strips the trailing index off slot keys so "RB1"/"RB2" both show as "RB". */
function slotLabel(key: string) {
  return key.replace(/\d+$/, "");
}

export function RosterStrip({
  assignment,
  bench,
}: {
  assignment: LineupAssignment;
  /** Bench players from the server, already sorted desc by projectedPoints. */
  bench: Player[];
}) {
  // Render whatever slot keys the server sends, in the order it sends them, so
  // roster-shape changes (e.g. 1 FLEX -> 2 FLEX) need no client change.
  const slots = Object.entries(assignment);

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

      {bench.map(p => (
        <div key={p.id} className="roster-slot roster-slot--benchplayer">
          <span className="roster-slot__label">BN · {p.position}</span>
          <span
            className="roster-slot__dot"
            style={{ background: `var(${POSITION_VAR[p.position]})` }}
          />
          <span className="roster-slot__name roster-slot__name--muted">{p.name}</span>
          <span className="roster-slot__empty">{p.projectedPoints.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
