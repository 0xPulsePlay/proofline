"use client";
/**
 * Base section — three gates: Wormhole Core → Proofline Registry → Demo
 * Market → payout unlocked. Clicking the parseAndVerifyVM gate reveals the
 * verification checklist.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import type { ControlRoomState } from "@proofline/event-model";

const CHECKLIST = [
  "Guardian signatures valid",
  "Guardian set accepted",
  "Source chain: Solana",
  "Emitter matches Proofline",
  "Payload version supported",
  "VAA not previously consumed",
];

export function BaseGates({ state, explorer }: { state: ControlRoomState; explorer?: string }) {
  const [open, setOpen] = useState(false);
  const vaaVerified = !!state.level4.baseVerifiedBlock;
  const stored = state.finality === "WormholeVerified" || state.finality === "DualFinalized";
  const settled = !!state.settledTxHash;
  const gate = (ok: boolean, active: boolean) => (ok ? "ok" : active ? "active" : "pending");
  return (
    <div className="panel" style={{ borderColor: "color-mix(in srgb, var(--base) 30%, var(--line))" }}>
      <h3>Base — verification gates</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          className={`nodecard ${gate(vaaVerified, !!state.level4.baseTxHash)}`}
          onClick={() => setOpen((o) => !o)}
          style={{ textAlign: "left" }}
          aria-expanded={open}
        >
          <div className="t">
            <span>Wormhole Core — parseAndVerifyVM</span>
            <span aria-hidden>{vaaVerified ? "✓" : "○"}</span>
          </div>
          <div className="s">{vaaVerified ? `verified in block ${state.level4.baseVerifiedBlock} · click for checklist` : "waiting for VAA submission"}</div>
        </button>
        {open && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="inset small" style={{ listStyle: "none", margin: 0, padding: "8px 12px" }}>
            {CHECKLIST.map((c) => (
              <li key={c} style={{ padding: "2px 0" }}>
                <span style={{ color: vaaVerified ? "var(--ok)" : "var(--text-faint)" }}>{vaaVerified ? "✓" : "○"}</span>{" "}
                <span className="dim">{c}</span>
              </li>
            ))}
          </motion.ul>
        )}
        <div className={`nodecard ${gate(stored, vaaVerified)}`}>
          <div className="t">
            <span>Proofline Registry</span>
            <span aria-hidden>{stored ? "✓" : "○"}</span>
          </div>
          <div className="s">{stored ? "outcome stored" : "awaiting verified outcome"}</div>
        </div>
        <div className={`nodecard ${gate(settled, state.finality === "DualFinalized")}`}>
          <div className="t">
            <span>Demo Market</span>
            <span aria-hidden>{settled ? "✓" : "○"}</span>
          </div>
          <div className="s">
            {settled ? (
              <>
                settlement executed — payout unlocked
                {explorer && state.settledTxHash && (
                  <>
                    {" · "}
                    <a href={`${explorer}/tx/${state.settledTxHash}`} target="_blank" rel="noreferrer">
                      tx ↗
                    </a>
                  </>
                )}
              </>
            ) : state.finality === "DualFinalized" ? (
              "anyone can call settle()"
            ) : (
              "withdrawals locked"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
