"use client";
/**
 * Per-event evidence drawer. Expert mode shows every raw field; real Base
 * transactions link to the explorer; simulated events say so — a simulated
 * event NEVER gets an explorer link.
 */
import type { RunEvent } from "@proofline/event-model";
import { EXPLAIN } from "@proofline/event-model";

export function EvidenceDrawer({
  runEvent,
  expert,
  explorerBaseUrl,
  onClose,
}: {
  runEvent: RunEvent;
  expert: boolean;
  explorerBaseUrl: string;
  onClose: () => void;
}) {
  const e = runEvent.event as Record<string, unknown> & { type: RunEvent["event"]["type"] };
  const txHash = typeof e.txHash === "string" ? e.txHash : null;
  return (
    <aside className="drawer" role="dialog" aria-label="Evidence">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {e.type.replaceAll("_", " ")}
        </h3>
        <button className="ctl" onClick={onClose} aria-label="close drawer">✕</button>
      </div>
      <p className="small dim">{EXPLAIN[e.type]}</p>
      {runEvent.simulated && (
        <p>
          <span className="badge-sim">simulated leg</span>{" "}
          <span className="tiny faint">no real network transaction exists for this event</span>
        </p>
      )}
      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>seq</dt>
        <dd>{runEvent.seq}</dd>
        <dt>at</dt>
        <dd>{new Date(runEvent.at).toISOString()}</dd>
        {Object.entries(e)
          .filter(([k]) => k !== "type")
          .map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
            </div>
          ))}
      </dl>
      {txHash && !runEvent.simulated && (
        <p style={{ marginTop: 12 }}>
          <a href={`${explorerBaseUrl}/tx/${txHash}`} target="_blank" rel="noreferrer" className="ctl" style={{ display: "inline-block" }}>
            view on BaseScan ↗
          </a>
        </p>
      )}
      {!expert && (
        <p className="tiny faint" style={{ marginTop: 14 }}>
          Switch to Expert mode for raw program ids, PDAs, and payload bytes.
        </p>
      )}
    </aside>
  );
}
