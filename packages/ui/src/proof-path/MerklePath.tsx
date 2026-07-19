"use client";
/**
 * TxLINE → Solana section: three nested layers (API record → Merkle proof →
 * TxOracle commitment). Leaves collapse upward into roots when the proof
 * becomes available; then the CPI call stack renders once verified.
 */
import { motion } from "framer-motion";
import type { ControlRoomState } from "@proofline/event-model";

const LEVELS = [
  ["Home goals = 2", "Away goals = 1", "Period = 100"],
  ["score event root"],
  ["fixture root"],
  ["five-minute batch root"],
  ["daily root PDA"],
];

export function MerklePath({
  state,
  expert,
  simulated,
}: {
  state: ControlRoomState;
  expert: boolean;
  simulated: boolean;
}) {
  const hasProof = !!state.proof;
  const verified = !!state.level4.verifiedSlot;
  return (
    <div className="panel">
      <h3>
        TxLINE commitment {simulated && <span className="badge-sim" style={{ marginLeft: 8 }}>synthetic fixture</span>}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {LEVELS.map((row, li) => (
          <motion.div
            key={li}
            style={{ display: "flex", gap: 6, justifyContent: "center" }}
            initial={false}
            animate={{ opacity: hasProof || li === 0 ? 1 : 0.35 }}
            transition={{ delay: hasProof ? li * 0.18 : 0, duration: 0.35 }}
          >
            {row.map((cell) => (
              <div key={cell} className="inset mono tiny" style={{ textAlign: "center" }}>
                {cell}
                {li > 0 && hasProof && <span style={{ color: "var(--ok)" }}> ✓</span>}
              </div>
            ))}
          </motion.div>
        ))}
      </div>
      {expert && state.proof && (
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>proof hash</dt>
          <dd>{state.proof.proofHash}</dd>
          <dt>root PDA</dt>
          <dd>{state.proof.rootPda}</dd>
        </dl>
      )}
      {verified && (
        <motion.div className="inset mono small" style={{ marginTop: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div>Proofline Adapter</div>
          <div className="dim">&nbsp;&nbsp;└── CPI: TxOracle.validate_stat_v2</div>
          <div className="dim">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── result: <span style={{ color: "var(--ok)" }}>TRUE</span>
            <span className="faint"> · slot {state.level4.verifiedSlot}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
