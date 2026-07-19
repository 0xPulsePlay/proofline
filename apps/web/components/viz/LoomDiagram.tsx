"use client";
/**
 * LoomDiagram — the five-stage wiring drawn as a circuit board that draws
 * itself on scroll: traces etch in left to right, each stage chip lands on
 * its socket. Honesty is structural: simulated stages get dashed frames,
 * Base Sepolia gets the solid seal.
 */
import { motion, useReducedMotion } from "framer-motion";

interface Stage {
  name: string;
  role: string;
  detail: string;
  sim?: string;
}

const STAGES: Stage[] = [
  { name: "TxLINE / TxODDS", role: "originates sports data; commits Merkle roots on Solana", detail: "program 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA (mainnet)", sim: "recorded fixture" },
  { name: "Solana adapter", role: "CPI into TxOracle validate_stat_v2; emits only on TRUE", detail: "emitter 0x000044ba…00000000", sim: "simulated leg" },
  { name: "Wormhole", role: "19 guardians sign the message; 13-of-19 quorum", detail: "VAA v1 · secp256k1 (real math)", sim: "dev guardian set" },
  { name: "Chainlink CRE", role: "liveness: heartbeat, retries, VAA fetch, Base delivery", detail: "workflows/cre-* (no deployed DON)", sim: "local simulation" },
  { name: "Base Sepolia", role: "verifies VAA, stores outcome, dual-finality registry, settles market", detail: "chain id 84532" },
];

const W = 1060;
const H = 300;
const colX = (i: number) => 96 + i * 217;

export function LoomDiagram({ registeredEmitter, chainId }: { registeredEmitter: string; chainId: number }) {
  const reduced = useReducedMotion();
  const cy = 108;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 780, height: "auto" }} role="img" aria-label="Wiring diagram from TxLINE through Solana, Wormhole and CRE to Base Sepolia">
        {/* traces */}
        {STAGES.slice(0, -1).map((_, i) => (
          <motion.line
            key={i}
            x1={colX(i) + 78}
            y1={cy}
            x2={colX(i + 1) - 78}
            y2={cy}
            stroke="var(--hair-2)"
            strokeWidth={1.5}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : 0.25 + i * 0.3 }}
          />
        ))}
        {/* arrowheads */}
        {STAGES.slice(0, -1).map((_, i) => (
          <motion.path
            key={i}
            d={`M ${colX(i + 1) - 84} ${cy - 5} L ${colX(i + 1) - 78} ${cy} L ${colX(i + 1) - 84} ${cy + 5}`}
            fill="none"
            stroke="var(--hair-2)"
            strokeWidth={1.5}
            initial={reduced ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: reduced ? 0 : 0.25 + i * 0.3 + 0.4 }}
          />
        ))}
        {STAGES.map((s, i) => {
          const x = colX(i);
          const last = i === STAGES.length - 1;
          const detail = s.name === "Solana adapter"
            ? `emitter ${registeredEmitter.slice(0, 12)}…${registeredEmitter.slice(-8)}`
            : s.name === "Base Sepolia"
              ? `chain id ${chainId}`
              : s.detail;
          return (
            <motion.g
              key={s.name}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 140, damping: 16, delay: reduced ? 0 : i * 0.3 }}
            >
              <rect
                x={x - 78}
                y={cy - 46}
                width={156}
                height={92}
                rx={6}
                fill="var(--ink-2)"
                stroke={last ? "var(--sol)" : "var(--hair-2)"}
                strokeWidth={last ? 1.8 : 1.2}
                strokeDasharray={s.sim ? "5 4" : undefined}
              />
              <text x={x} y={cy - 26} textAnchor="middle" fontSize={11.5} fontWeight={700} fontFamily="var(--sans)" fill="var(--text)">
                {s.name}
              </text>
              <text x={x} y={cy - 10} textAnchor="middle" fontSize={9} fontFamily="var(--mono)" fill="var(--dim)">
                {s.sim ? s.sim : "REAL"}
              </text>
              {s.role.split(";").map((line, li) => (
                <text key={li} x={x} y={cy + 6 + li * 12} textAnchor="middle" fontSize={8.5} fontFamily="var(--sans)" fill="var(--faint)">
                  {line.trim().slice(0, 34)}
                </text>
              ))}
              <text x={x} y={cy + 40} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill="var(--faint)">
                {detail.length > 36 ? `${detail.slice(0, 34)}…` : detail}
              </text>
            </motion.g>
          );
        })}
        {/* captions */}
        <text x={colX(0) - 78} y={cy + 88} fontSize={9.5} fontFamily="var(--mono)" fill="var(--faint)">
          ORIGIN
        </text>
        <text x={colX(4) + 78} y={cy + 88} textAnchor="end" fontSize={9.5} fontFamily="var(--mono)" fill="var(--sol)">
          SETTLEMENT — REAL
        </text>
        <text x={W / 2} y={30} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--dim)" letterSpacing={2}>
          ONE OUTCOME, ETCHED ACROSS FIVE STAGES
        </text>
      </svg>
    </div>
  );
}
