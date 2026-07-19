"use client";
import Link from "next/link";
import { useRun } from "@/lib/run-engine";

export function TopBar() {
  const { mode, setMode, liveAvailable, expert, setExpert, manifest } = useRun();
  return (
    <div className="topbar">
      <Link href="/" className="brand" style={{ color: "var(--text)" }}>
        PROOF<span>LINE</span>
      </Link>
      <div className="mode-group" role="tablist" aria-label="mode">
        {(["replay", "inspect", "live"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "on" : ""}
            disabled={m === "live" && !liveAvailable}
            title={m === "live" && !liveAvailable ? "Live mode needs a local coordinator (see README)" : undefined}
            onClick={() => setMode(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      {mode === "replay" && (
        <span className="tiny faint">
          Replay of a recorded execution against Base Sepolia — real timestamps, real transactions.
        </span>
      )}
      <div style={{ flex: 1 }} />
      <nav className="small" style={{ display: "flex", gap: 14 }}>
        <Link href="/control-room">Control room</Link>
        <Link href="/tamper-lab">Tamper lab</Link>
        <Link href="/integrations">Integrations</Link>
        {manifest && <Link href={`/matches/${manifest.fixture.fixtureId}`}>Match</Link>}
      </nav>
      <label className="toggle">
        <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
        Expert mode
      </label>
    </div>
  );
}
