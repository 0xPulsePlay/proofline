"use client";
/**
 * SigningRing — the Wormhole guardian quorum as a ring of 19 arc segments
 * that sweep in as real signatures are decoded from the VAA. A quorum arc
 * marks the 13-of-19 threshold; it ignites only when crossed. Nodes light
 * ONLY from actual VAA signature indices — never decorative.
 */
import { motion, useReducedMotion } from "framer-motion";

const N = 19;
const QUORUM = 13;

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

export function SigningRing({
  signatures,
  replayMode,
  devSet,
}: {
  signatures: number[];
  replayMode: boolean;
  devSet: boolean;
}) {
  const reduced = useReducedMotion();
  const C = 110;
  const R = 88;
  const lit = new Set(signatures);
  const gap = (Math.PI * 2) / N;
  const quorumReached = signatures.length >= QUORUM;

  return (
    <div className="row" style={{ alignItems: "center", gap: 20 }}>
      <svg
        width={C * 2}
        height={C * 2}
        viewBox={`0 0 ${C * 2} ${C * 2}`}
        role="img"
        aria-label={`Guardian signing ring: ${signatures.length} of ${N} signatures, quorum ${QUORUM}`}
      >
        {/* track */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--hair)" strokeWidth={3} />
        {/* quorum arc — the threshold region (13/19 of the circle) */}
        <motion.path
          d={arc(C, C, R - 9, -Math.PI / 2, -Math.PI / 2 + gap * QUORUM)}
          fill="none"
          stroke={quorumReached ? "var(--sol)" : "var(--hair-2)"}
          strokeWidth={2}
          strokeDasharray="4 5"
          initial={false}
          animate={{ opacity: quorumReached ? 1 : 0.5 }}
        />
        {/* signature segments */}
        {Array.from({ length: N }, (_, i) => {
          const a0 = -Math.PI / 2 + i * gap + 0.045;
          const a1 = -Math.PI / 2 + (i + 1) * gap - 0.045;
          const on = lit.has(i);
          const order = signatures.indexOf(i);
          return (
            <motion.path
              key={i}
              d={arc(C, C, R, a0, a1)}
              fill="none"
              stroke={on ? "var(--vio)" : "var(--hair-2)"}
              strokeWidth={on ? 5 : 3}
              strokeLinecap="round"
              initial={false}
              animate={
                on && !reduced
                  ? { pathLength: [0, 1], opacity: 1 }
                  : { pathLength: on ? 1 : 0.35, opacity: on ? 1 : 0.6 }
              }
              transition={
                on
                  ? { duration: 0.5, delay: replayMode && !reduced ? order * 0.11 : 0, ease: "easeOut" }
                  : { duration: 0.3 }
              }
            />
          );
        })}
        {/* index ticks */}
        {Array.from({ length: N }, (_, i) => {
          const a = -Math.PI / 2 + (i + 0.5) * gap;
          const x = C + (R + 14) * Math.cos(a);
          const y = C + (R + 14) * Math.sin(a);
          return (
            <text
              key={i}
              x={x}
              y={y + 3}
              textAnchor="middle"
              fontSize={7.5}
              fontFamily="var(--mono)"
              fill={lit.has(i) ? "var(--text)" : "var(--faint)"}
            >
              {i}
            </text>
          );
        })}
        <text x={C} y={C - 6} textAnchor="middle" fontSize={24} fontWeight={750} fill="var(--text)" fontFamily="var(--mono)">
          {signatures.length}/{N}
        </text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={9.5} fill={quorumReached ? "var(--sol)" : "var(--faint)"} fontFamily="var(--mono)" letterSpacing={1.5}>
          {quorumReached ? "QUORUM REACHED" : `quorum ${QUORUM}`}
        </text>
      </svg>
      <div className="small dim" style={{ maxWidth: 200 }}>
        {signatures.length === 0 ? (
          <>Awaiting signed VAA — all segments neutral until real signatures are decoded.</>
        ) : (
          <>
            VAA authenticated — {signatures.length} guardian signatures decoded from the VAA body.
            {replayMode && (
              <div className="tiny faint mt-1">Reconstructing signatures from completed VAA.</div>
            )}
          </>
        )}
        {devSet && (
          <div className="mt-1">
            <span className="stamp sim">dev guardian set</span>
          </div>
        )}
      </div>
    </div>
  );
}
