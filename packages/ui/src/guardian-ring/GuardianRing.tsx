"use client";
/**
 * 19-node Guardian ring, threshold marker at 13.
 * Honesty rule: nodes light ONLY from actual signature indices decoded from
 * the VAA (VAA_READY.signatures). While waiting: all neutral. In replay,
 * sequential lighting is labeled "Reconstructing signatures from completed VAA."
 */
import { motion } from "framer-motion";

const N = 19;
const QUORUM = 13;

export function GuardianRing({
  signatures,
  awaiting,
  replayMode,
  devSet,
}: {
  signatures: number[];
  awaiting: boolean;
  replayMode: boolean;
  devSet: boolean;
}) {
  const R = 74;
  const C = 92;
  const lit = new Set(signatures);
  return (
    <div className="ringwrap">
      <svg width={C * 2} height={C * 2} role="img" aria-label={`Guardian ring: ${signatures.length} of ${N} signatures`}>
        {Array.from({ length: N }, (_, i) => {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const x = C + R * Math.cos(a);
          const y = C + R * Math.sin(a);
          const on = lit.has(i);
          const order = signatures.indexOf(i);
          return (
            <g key={i}>
              <motion.circle
                cx={x}
                cy={y}
                r={7}
                fill={on ? "var(--wormhole)" : "var(--bg-inset)"}
                stroke={on ? "var(--wormhole)" : "var(--line-strong)"}
                strokeWidth={1.5}
                initial={false}
                animate={on ? { scale: [1, 1.45, 1], opacity: 1 } : { scale: 1, opacity: 0.8 }}
                transition={{ duration: 0.45, delay: on && replayMode ? order * 0.12 : 0 }}
              />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                fontSize="7"
                fontFamily="var(--mono)"
                fill={on ? "var(--bg)" : "var(--text-faint)"}
              >
                {i}
              </text>
            </g>
          );
        })}
        <text x={C} y={C - 8} textAnchor="middle" fontSize="22" fontWeight={750} fill="var(--text)" fontFamily="var(--mono)">
          {signatures.length}/{N}
        </text>
        <text x={C} y={C + 12} textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="var(--mono)">
          quorum {QUORUM}
        </text>
      </svg>
      <div className="small dim" style={{ maxWidth: 190 }}>
        {awaiting ? (
          <>Awaiting signed VAA — all nodes neutral until real signatures are decoded.</>
        ) : (
          <>
            VAA authenticated — {signatures.length} guardian signatures decoded from the VAA
            body.
            {replayMode && (
              <div className="tiny faint" style={{ marginTop: 4 }}>
                Reconstructing signatures from completed VAA.
              </div>
            )}
          </>
        )}
        {devSet && (
          <div style={{ marginTop: 6 }}>
            <span className="badge-sim">dev guardian set</span>
          </div>
        )}
      </div>
    </div>
  );
}
