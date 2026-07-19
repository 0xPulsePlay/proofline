"use client";
import type { RunEvent } from "@proofline/event-model";

const fmt = (ms: number) =>
  new Date(ms).toISOString().slice(11, 19);

export function EvidenceTimeline({
  events,
  selectedSeq,
  onSelect,
}: {
  events: RunEvent[];
  selectedSeq: number | null;
  onSelect: (seq: number) => void;
}) {
  return (
    <div className="panel">
      <h3>Evidence timeline</h3>
      <div className="timeline" role="list">
        {events
          .filter((e) => e.event.type !== "HEARTBEAT")
          .map((e) => (
            <button
              key={e.seq}
              role="listitem"
              className={`tl-item ${selectedSeq === e.seq ? "sel" : ""}`}
              onClick={() => onSelect(e.seq)}
            >
              <div className="tt">{fmt(e.at)}</div>
              <div>
                {e.event.type.toLowerCase().replaceAll("_", " ")}
                {e.simulated ? " ⚠" : ""}
              </div>
            </button>
          ))}
        {events.length === 0 && <span className="small faint">no events yet</span>}
      </div>
    </div>
  );
}
