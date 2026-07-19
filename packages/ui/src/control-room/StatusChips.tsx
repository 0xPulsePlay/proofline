"use client";
import type { ControlRoomState } from "@proofline/event-model";

export function StatusChips({ state }: { state: ControlRoomState }) {
  const chips: { label: string; cls: string }[] = [
    { label: `Source record ${state.finalRecord ? "✓" : "…"}`, cls: state.finalRecord ? "ok" : "pending" },
    { label: `Proof ${state.proof ? "✓" : "…"}`, cls: state.proof ? "ok" : "pending" },
    { label: `Solana ${state.level4.verifiedSlot ? "✓" : "…"}`, cls: state.level4.verifiedSlot ? "ok" : "pending" },
    {
      label: `VAA ${state.level4.guardianSignatures.length ? `${state.level4.guardianSignatures.length}/19` : "…"}`,
      cls: state.level4.guardianSignatures.length >= 13 ? "ok" : "pending",
    },
    {
      label: `Base ${state.level4.baseVerifiedBlock ? "✓" : state.level3.baseTxHash ? "L3 ✓" : "pending"}`,
      cls: state.level4.baseVerifiedBlock ? "ok" : state.level3.baseTxHash ? "active" : "pending",
    },
    {
      label:
        state.finality === "DualFinalized"
          ? "DUAL FINALIZED"
          : state.finality === "Conflict"
            ? "CONFLICT"
            : state.finality,
      cls: state.finality === "DualFinalized" ? "ok" : state.finality === "Conflict" ? "fail" : "pending",
    },
  ];
  return (
    <div className="gatesrow" role="status">
      {chips.map((c) => (
        <span key={c.label} className={`chip ${c.cls}`}>
          {c.label}
        </span>
      ))}
    </div>
  );
}
