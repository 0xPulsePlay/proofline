"use client";
import { useRun } from "@/lib/run-engine";
import { EXPLAIN } from "@proofline/event-model";

/** Explain-mode narration bar: plain-language line for the latest event. */
export function Caption() {
  const { events, expert } = useRun();
  if (expert) return null;
  const last = [...events].reverse().find((e) => e.event.type !== "HEARTBEAT");
  if (!last) {
    return (
      <div className="caption">
        Press play: TxLINE committed the score to Solana. Our Solana program checked the proof.
        Wormhole Guardians signed the message. Base verified their signatures. The market can now settle.
      </div>
    );
  }
  return (
    <div className="caption">
      {EXPLAIN[last.event.type]}
      {last.simulated && <span className="badge-sim ml-2">simulated leg</span>}
    </div>
  );
}
