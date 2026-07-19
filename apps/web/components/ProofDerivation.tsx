"use client";
/**
 * Proof-path visualization: proof bundle hash → validation instruction hash →
 * attestationId. REAL hex (from the run's derivation block, conformance-
 * asserted at generation time), truncated, click-to-copy. Each stage is
 * revealed only when the driving RelayEvent has arrived — no fake progress.
 */
import { motion } from "framer-motion";
import type { ControlRoomState, RunDerivation } from "@proofline/event-model";
import { CopyHex } from "./CopyHex";

function Row({
  label,
  formula,
  value,
  revealed,
  pendingNote,
}: {
  label: string;
  formula: string;
  value: string;
  revealed: boolean;
  pendingNote: string;
}) {
  return (
    <motion.div
      className="derive-row"
      initial={false}
      animate={{ opacity: revealed ? 1 : 0.45 }}
      transition={{ duration: 0.35 }}
    >
      <div className="small">
        {label} <span className="tiny faint mono">{formula}</span>
      </div>
      <div>
        {revealed ? (
          <CopyHex value={value} label={label} />
        ) : (
          <span className="tiny faint mono">{pendingNote}</span>
        )}
      </div>
    </motion.div>
  );
}

export function ProofDerivation({
  derivation,
  state,
}: {
  derivation: RunDerivation;
  state: ControlRoomState;
}) {
  const hasProof = !!state.proof;
  const verified = !!state.level4.verifiedSlot;
  const dual = state.finality === "DualFinalized";
  return (
    <div className="panel">
      <h3>
        Proof path — real derivations <span className="chip ok" style={{ fontSize: 10 }}>REAL keccak256</span>
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Row
          label="proof bundle hash"
          formula="keccak256(canonical evidence bundle)"
          value={derivation.proofBundleHash}
          revealed={hasProof}
          pendingNote="awaiting TxLINE proof"
        />
        <div className="derive-arrow" aria-hidden>↓</div>
        <Row
          label="validation instruction hash"
          formula="keccak256(program ‖ root PDA ‖ ix data)"
          value={derivation.validationInstructionHash}
          revealed={verified}
          pendingNote="awaiting Solana verification"
        />
        <div className="derive-arrow" aria-hidden>↓</div>
        <Row
          label="attestation id"
          formula="keccak256(domain ‖ emitter ‖ fixture ‖ seq ‖ hashes)"
          value={derivation.attestationId}
          revealed={dual}
          pendingNote="derived independently by both lanes"
        />
      </div>
      <p className="tiny faint" style={{ margin: "10px 0 0" }}>
        Values reproduce the conformance vector byte-for-byte; the Base contracts derive the same
        attestation id on-chain from the VAA payload.
      </p>
    </div>
  );
}
