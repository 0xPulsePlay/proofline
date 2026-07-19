"use client";
/**
 * The Chainlink CRE control box — an orchestration console, not a logo card.
 * Heartbeat pulse fires ONLY when a HEARTBEAT event arrives (keyed by count),
 * never as a free-running CSS loop.
 */
import { motion } from "framer-motion";
import type { ControlRoomState } from "@proofline/event-model";

export function CreControlBox({
  state,
  workflowMode,
  log,
  nowMs,
}: {
  state: ControlRoomState;
  workflowMode: string;
  log: string[];
  nowMs: number;
}) {
  const { heartbeat, steps } = state;
  const nextIn = heartbeat.nextAt ? Math.max(0, Math.round((heartbeat.nextAt - nowMs) / 1000)) : null;
  return (
    <div className="panel crebox">
      <h3>Chainlink CRE — orchestration &amp; liveness</h3>
      <div className="hb">
        <motion.div
          className="hb-circle"
          key={heartbeat.count}
          initial={{ scale: 1, boxShadow: "0 0 0 0 rgba(74,125,255,0.55)" }}
          animate={{ scale: [1, 1.35, 1], boxShadow: ["0 0 0 0 rgba(74,125,255,0.55)", "0 0 0 12px rgba(74,125,255,0)", "0 0 0 0 rgba(74,125,255,0)"] }}
          transition={{ duration: 0.9 }}
          aria-hidden
        />
        <div className="small mono dim">
          {heartbeat.count === 0 ? (
            "no heartbeat yet"
          ) : (
            <>
              heartbeat #{heartbeat.count}
              {nextIn !== null && <> · next in {String(Math.floor(nextIn / 60)).padStart(2, "0")}:{String(nextIn % 60).padStart(2, "0")}</>}
              {" · last run ✓"}
            </>
          )}
        </div>
      </div>
      <div className="tiny faint mono" style={{ marginTop: 6 }}>
        mode: {workflowMode}
      </div>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.id} className={s.state}>
            <span className="step-dot" aria-hidden>
              {s.state === "done" ? "✓" : s.state === "failed" ? "✕" : s.state === "active" ? "●" : "○"}
            </span>
            <span>
              {s.id} {s.label}
              <span className="tiny faint"> — {s.state}</span>
            </span>
          </li>
        ))}
      </ol>
      {log.length > 0 && (
        <div className="cmdlog" aria-label="command log">
          {log.slice(-24).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
