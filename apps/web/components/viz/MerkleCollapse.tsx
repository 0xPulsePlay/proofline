"use client";
/**
 * MerkleCollapse — the TxLINE commitment rendered as a tree that proves
 * itself upward. Leaves sit at the bottom; when the proof arrives, each
 * level materializes out of its children (spring from below) and the
 * connecting edges draw themselves, collapsing toward the daily root.
 * The root stamps TRUE only when the on-chain verification slot exists.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { ControlRoomState } from "@proofline/event-model";

const LEVELS: string[][] = [
  ["daily root PDA"],
  ["five-minute batch root"],
  ["fixture root"],
  ["score event root"],
  ["Home goals", "Away goals", "Period"],
];

export function MerkleCollapse({
  state,
  leafValues,
  simulated,
}: {
  state: ControlRoomState;
  leafValues?: [string, string, string];
  simulated?: boolean;
}) {
  const reduced = useReducedMotion();
  const hasProof = !!state.proof;
  const verified = !!state.level4.verifiedSlot;
  // LEVELS[0] is the root; reveal from leaves (index 4) upward
  const revealed = (li: number) => (li === LEVELS.length - 1 ? true : hasProof);
  const leaves = leafValues ?? ["2", "1", "100"];

  return (
    <div>
      <div className="stack-sm">
        {LEVELS.map((row, li) => {
          const isRoot = li === 0;
          const isLeaf = li === LEVELS.length - 1;
          const on = revealed(li);
          // reveal order: leaves first (delay 0), root last
          const order = LEVELS.length - 1 - li;
          return (
            <div key={li}>
              <motion.div
                className="row"
                style={{ justifyContent: "center", gap: 8 }}
                initial={false}
                animate={{ opacity: on ? 1 : 0.28, y: on ? 0 : 10 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 120, damping: 17, delay: hasProof && !isLeaf ? order * 0.16 : 0 }
                }
              >
                {row.map((cell, ci) => (
                  <div
                    key={cell}
                    className="mono tiny"
                    style={{
                      border: `1px solid ${
                        isRoot && verified
                          ? "rgba(45,240,164,0.55)"
                          : on
                            ? "var(--hair-2)"
                            : "var(--hair)"
                      }`,
                      borderRadius: 4,
                      background: isRoot && verified ? "var(--sol-dim)" : "var(--ink)",
                      padding: "7px 13px",
                      textAlign: "center",
                      color: on ? "var(--text)" : "var(--faint)",
                      minWidth: 88,
                    }}
                  >
                    <div>{cell}</div>
                    {isLeaf && (
                      <div className="faint" style={{ fontSize: 10 }}>
                        = {leaves[ci]}
                      </div>
                    )}
                    {isRoot && verified && (
                      <div className="text-ok" style={{ fontSize: 10, letterSpacing: "0.12em" }}>
                        VERIFIED TRUE
                      </div>
                    )}
                  </div>
                ))}
              </motion.div>
              {/* connector to the level above */}
              {li < LEVELS.length - 1 && (
                <svg width="100%" height={16} aria-hidden style={{ display: "block" }}>
                  <motion.line
                    x1="50%"
                    x2="50%"
                    y1={0}
                    y2={16}
                    stroke={revealed(li + 1) ? "var(--hair-2)" : "var(--hair)"}
                    strokeWidth={1}
                    initial={false}
                    animate={{ pathLength: revealed(li + 1) ? 1 : 0.2 }}
                    transition={{ duration: 0.35, delay: reduced ? 0 : order * 0.16 }}
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      {simulated && (
        <div className="mt-2" style={{ textAlign: "center" }}>
          <span className="stamp sim">synthetic fixture</span>
        </div>
      )}
      {state.proof && (
        <dl className="kv mt-2">
          <div className="row">
            <dt>proof hash</dt>
            <dd>{state.proof.proofHash}</dd>
          </div>
          <div className="row">
            <dt>root PDA</dt>
            <dd>{state.proof.rootPda}</dd>
          </div>
        </dl>
      )}
      {verified && (
        <motion.div
          className="codeblock mt-2"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="hi">Proofline Adapter</div>
          <div>└── CPI: TxOracle.validate_stat_v2</div>
          <div>
            &nbsp;&nbsp;&nbsp;&nbsp;└── result: <span className="text-ok">TRUE</span>
            <span className="faint"> · slot {state.level4.verifiedSlot}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
