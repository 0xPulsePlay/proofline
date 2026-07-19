"use client";
/**
 * The dual-finality race — fast lane (CRE/RPC quorum) vs proof lane
 * (Solana → Wormhole → Base Core), converging on one digest.
 */
import { motion, AnimatePresence } from "framer-motion";
import type { ControlRoomState } from "@proofline/event-model";

function Card({
  title,
  sub,
  status,
  sim,
}: {
  title: string;
  sub?: string;
  status: "pending" | "active" | "ok" | "fail";
  sim?: boolean;
}) {
  return (
    <div className={`nodecard ${status === "ok" ? "ok" : status === "active" ? "active" : status === "fail" ? "fail" : ""}`}>
      <div className="t">
        <span>{title}</span>
        <span aria-hidden>{status === "ok" ? "✓" : status === "fail" ? "✕" : status === "active" ? "●" : "○"}</span>
      </div>
      {sub && <div className="s">{sub}</div>}
      {sim && <div style={{ marginTop: 4 }}><span className="badge-sim">simulated</span></div>}
    </div>
  );
}

const short = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-8)}` : "—");

export function LanesRace({ state, simulatedLegs }: { state: ControlRoomState; simulatedLegs: string[] }) {
  const { level3, level4, finality, attestationId } = state;
  const sim = (leg: string) => simulatedLegs.includes(leg);
  const l3s = (p: string): "pending" | "active" | "ok" => {
    const r = level3.rpcResults.find((x) => x.provider === p);
    if (r) return r.agreed ? "ok" : "active";
    return level3.status === "in_progress" ? "active" : "pending";
  };
  return (
    <div className="panel">
      <h3>Finality lanes</h3>

      <div className="lane">
        <div className="lane-title">
          <strong>FAST LANE</strong>
          <span className="tiny faint">Level 3 — RPC quorum · provisional</span>
          {level3.status === "done" && <span className="chip ok">✓ CRE attested</span>}
        </div>
        <div className="lane-cards">
          {["RPC A", "RPC B", "RPC C"].map((p) => (
            <Card key={p} title={p} status={l3s(p)} sub={level3.rpcResults.find((x) => x.provider === p)?.simulationDigest ? `digest ${level3.rpcResults.find((x) => x.provider === p)!.simulationDigest.slice(0, 10)}…` : "TxOracle simulation"} sim={sim("level3-rpc")} />
          ))}
          <span className="arrow" aria-hidden>▶</span>
          <Card
            title="Base CRE attestation"
            status={level3.baseTxHash ? "ok" : level3.status === "in_progress" ? "active" : level3.status === "failed" ? "fail" : "pending"}
            sub={level3.baseTxHash ? short(level3.baseTxHash) : "awaiting quorum"}
          />
        </div>
      </div>

      <div className="lane" style={{ marginTop: 14 }}>
        <div className="lane-title">
          <strong>PROOF LANE</strong>
          <span className="tiny faint">Level 4 — native cross-chain verification</span>
          {level4.status === "done" && <span className="chip ok">✓ Wormhole verified</span>}
        </div>
        <div className="lane-cards">
          <Card title="TxLINE" status={state.proof ? "ok" : "pending"} sub="proof committed" />
          <span className="arrow" aria-hidden>→</span>
          <Card
            title="Solana Adapter"
            status={level4.verifiedSlot ? "ok" : level4.verifySig ? "active" : "pending"}
            sub={level4.verifiedSlot ? `validate_stat_v2 TRUE · slot ${level4.verifiedSlot}` : "CPI validate_stat_v2"}
            sim={sim("solana-adapter")}
          />
          <span className="arrow" aria-hidden>→</span>
          <Card
            title="Wormhole 13/19"
            status={level4.vaaHash ? "ok" : level4.wormholeSequence ? "active" : "pending"}
            sub={level4.vaaHash ? `VAA ${level4.vaaHash.slice(0, 10)}…` : level4.wormholeSequence ? `sequence ${level4.wormholeSequence}` : "guardian quorum"}
            sim={sim("wormhole-guardians")}
          />
          <span className="arrow" aria-hidden>→</span>
          <Card
            title="Base Core"
            status={level4.baseVerifiedBlock ? "ok" : level4.baseTxHash ? "active" : "pending"}
            sub={level4.baseVerifiedBlock ? `verified · block ${level4.baseVerifiedBlock}` : level4.baseTxHash ? short(level4.baseTxHash) : "parseAndVerifyVM"}
          />
          <span className="arrow" aria-hidden>→</span>
          <Card title="Market" status={state.settledTxHash ? "ok" : "pending"} sub={state.settledTxHash ? "settled" : "awaiting finality"} />
        </div>
      </div>

      <AnimatePresence>
        {finality === "DualFinalized" && attestationId && (
          <motion.div
            className="seal"
            style={{ marginTop: 16 }}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="tiny mono dim">Comparing outcome digests…</div>
            <div className="seal-race" aria-label="both lanes derived the same attestation id">
              <motion.div
                className="seal-hash mono"
                initial={{ x: -70, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              >
                <span className="tiny faint">LEVEL 3 · CRE report</span>
                <span>{short(attestationId)}</span>
              </motion.div>
              <motion.div
                className="seal-eq"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7, duration: 0.3 }}
                aria-hidden
              >
                =
              </motion.div>
              <motion.div
                className="seal-hash mono"
                initial={{ x: 70, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              >
                <span className="tiny faint">LEVEL 4 · Wormhole VAA</span>
                <span>{short(attestationId)}</span>
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.4 }}
            >
              <div className="small" style={{ color: "var(--ok)" }}>MATCH ✓</div>
              <div className="big">DUAL FINALIZED</div>
              <div className="mono tiny dim" style={{ marginTop: 4, wordBreak: "break-all" }}>
                {attestationId}
              </div>
            </motion.div>
          </motion.div>
        )}
        {finality === "Conflict" && (
          <motion.div className="seal" style={{ marginTop: 16, borderColor: "var(--fail)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="big" style={{ color: "var(--fail)" }}>CONFLICT — SETTLEMENT FROZEN</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
