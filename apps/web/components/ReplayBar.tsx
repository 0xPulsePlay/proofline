"use client";
import { useRun } from "@/lib/run-engine";

export function ReplayBar() {
  const {
    mode,
    allEvents,
    cursor,
    playing,
    play,
    pause,
    restart,
    scrubTo,
    speed,
    setSpeed,
    boundaryPause,
    setBoundaryPause,
    boundaryNote,
  } = useRun();
  if (mode === "live") return null;
  return (
    <div className="panel">
      <div className="replaybar">
        <button className="ctl" onClick={playing ? pause : play} aria-label={playing ? "pause" : "play"}>
          {playing ? "⏸ pause" : cursor >= allEvents.length - 1 ? "↻ replay" : "▶ play"}
        </button>
        <button className="ctl" onClick={restart}>⏮ restart</button>
        <input
          type="range"
          min={-1}
          max={allEvents.length - 1}
          value={cursor}
          onChange={(e) => scrubTo(Number(e.target.value))}
          aria-label="scrub timeline"
        />
        <span className="tiny mono dim">
          {cursor + 1}/{allEvents.length}
        </span>
        {[1, 2, 4].map((s) => (
          <button key={s} className={`ctl ${speed === s ? "on" : ""}`} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
        <label className="toggle" title="Auto-pause at each verification boundary">
          <input
            type="checkbox"
            checked={boundaryPause}
            onChange={(e) => setBoundaryPause(e.target.checked)}
          />
          Pause at each verification boundary
        </label>
      </div>
      {boundaryNote && (
        <div className="inset small" style={{ marginTop: 8, borderColor: "var(--provisional)" }}>
          <strong>Verification boundary.</strong> <span className="dim">{boundaryNote}</span>{" "}
          <button className="ctl" onClick={play} style={{ marginLeft: 8 }}>continue ▶</button>
        </div>
      )}
    </div>
  );
}
