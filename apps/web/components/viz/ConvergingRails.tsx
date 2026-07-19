"use client";
/**
 * ConvergingRails — the dual-finality race rendered as two physical tracks
 * that converge on a single seal. A packet rides each track; its position is
 * driven ONLY by real run state (rpc quorum count, CPI slot, VAA, Base
 * block). When both packets arrive, the seal stamps and the shared digest
 * resolves out of noise.
 */
import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import type { ControlRoomState } from "@proofline/event-model";
import { DigestResolve } from "./DigestResolve";

const W = 1000;
const H = 400;
const SEAL = { x: 884, y: 200 };

const FAST_PATH = `M64 96 H700 C 790 96 806 200 878 200`;
const PROOF_PATH = `M64 304 H700 C 790 304 806 200 878 200`;

interface Station {
  x: number;
  y: number;
  label: string;
  sub?: string;
  on: boolean;
  active: boolean;
  sim?: boolean;
}

function usePathPoint(pathD: string, target: number) {
  const ref = useRef<SVGPathElement | null>(null);
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const reduced = useReducedMotion();
  const lenRef = useRef(0);
  const progRef = useRef(0);

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    lenRef.current = p.getTotalLength();
    const set = (frac: number) => {
      progRef.current = frac;
      const q = p.getPointAtLength(Math.max(0, Math.min(1, frac)) * lenRef.current);
      setPt({ x: q.x, y: q.y });
    };
    if (reduced) {
      set(target);
      return;
    }
    const controls = animate(progRef.current, target, {
      type: "spring",
      stiffness: 60,
      damping: 16,
      onUpdate: (v) => set(v),
    });
    return () => controls.stop();
  }, [target, reduced, pathD]);

  return { ref, pt };
}

function StationNode({ s, above }: { s: Station; above?: boolean }) {
  const reduced = useReducedMotion();
  const ly = above ? s.y - 34 : s.y + 26;
  return (
    <g>
      <motion.circle
        cx={s.x}
        cy={s.y}
        r={7}
        fill={s.on ? "var(--sol)" : "var(--ink-2)"}
        stroke={s.on ? "var(--sol)" : s.active ? "var(--bas)" : "var(--hair-2)"}
        strokeWidth={1.5}
        initial={false}
        animate={s.on && !reduced ? { scale: [1, 1.5, 1] } : { scale: 1 }}
        transition={{ duration: 0.5 }}
      />
      {s.active && !s.on && !reduced && (
        <circle cx={s.x} cy={s.y} r={7} fill="none" stroke="var(--bas)" strokeWidth={1} opacity={0.7}>
          <animate attributeName="r" values="7;12;7" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      <text
        x={s.x}
        y={ly}
        textAnchor="middle"
        fontSize={11}
        fontFamily="var(--mono)"
        fill={s.on ? "var(--text)" : "var(--faint)"}
      >
        {s.label}
      </text>
      {s.sub && (
        <text x={s.x} y={ly + 13} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--faint)">
          {s.sub}
        </text>
      )}
      {s.sim && (
        <text x={s.x} y={ly + 24} textAnchor="middle" fontSize={8.5} fontFamily="var(--mono)" fill="var(--txl)">
          sim
        </text>
      )}
    </g>
  );
}

export function ConvergingRails({
  state,
  simulatedLegs,
}: {
  state: ControlRoomState;
  simulatedLegs: string[];
}) {
  const { level3, level4, finality } = state;
  const sim = (leg: string) => simulatedLegs.some((l) => l.startsWith(leg));

  // progress targets derived only from real state
  const fastTarget = level3.baseTxHash ? 1 : (level3.rpcResults.length / 3) * 0.62;
  const proofTarget = level4.baseVerifiedBlock
    ? 1
    : level4.vaaHash
      ? 0.74
      : level4.verifiedSlot
        ? 0.5
        : state.proof
          ? 0.22
          : 0;

  const fast = usePathPoint(FAST_PATH, fastTarget);
  const proof = usePathPoint(PROOF_PATH, proofTarget);
  const reducedMotion = useReducedMotion();

  const fastStations: Station[] = [
    { x: 150, y: 96, label: "RPC A", on: level3.rpcResults.length >= 1, active: level3.status === "in_progress" && level3.rpcResults.length === 0, sim: sim("level3-rpc") },
    { x: 285, y: 96, label: "RPC B", on: level3.rpcResults.length >= 2, active: level3.rpcResults.length === 1, sim: sim("level3-rpc") },
    { x: 420, y: 96, label: "RPC C", on: level3.rpcResults.length >= 3, active: level3.rpcResults.length === 2, sim: sim("level3-rpc") },
    {
      x: 585, y: 96, label: "CRE report",
      sub: level3.baseTxHash ? `${level3.baseTxHash.slice(0, 10)}…` : "quorum → Base",
      on: !!level3.baseTxHash, active: level3.rpcResults.length >= 3 && !level3.baseTxHash,
    },
  ];
  const proofStations: Station[] = [
    { x: 150, y: 304, label: "TxLINE proof", on: !!state.proof, active: !state.proof && !!state.finalRecord },
    { x: 300, y: 304, label: "Solana CPI", sub: level4.verifiedSlot ? `slot ${level4.verifiedSlot}` : "validate_stat_v2", on: !!level4.verifiedSlot, active: !!state.proof && !level4.verifiedSlot, sim: sim("solana-adapter") },
    { x: 460, y: 304, label: "Wormhole VAA", sub: level4.vaaHash ? `${level4.vaaHash.slice(0, 10)}…` : "13/19 quorum", on: !!level4.vaaHash, active: !!level4.verifiedSlot && !level4.vaaHash, sim: sim("wormhole-guardians") },
    { x: 615, y: 304, label: "Base Core", sub: level4.baseVerifiedBlock ? `block ${level4.baseVerifiedBlock}` : "parseAndVerifyVM", on: !!level4.baseVerifiedBlock, active: !!level4.vaaHash && !level4.baseVerifiedBlock },
  ];

  const sealed = finality === "DualFinalized";
  const conflict = finality === "Conflict";

  return (
    <div className="rails-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dual finality lanes converging on one digest">
        {/* lane labels */}
        <text x={64} y={66} fontSize={10.5} fontFamily="var(--mono)" fill="var(--dim)" letterSpacing={2}>
          FAST LANE — LEVEL 3 · RPC QUORUM · PROVISIONAL
        </text>
        <text x={64} y={348} fontSize={10.5} fontFamily="var(--mono)" fill="var(--dim)" letterSpacing={2}>
          PROOF LANE — LEVEL 4 · NATIVE CROSS-CHAIN VERIFICATION
        </text>

        {/* track beds */}
        <path ref={fast.ref} d={FAST_PATH} fill="none" stroke="var(--hair-2)" strokeWidth={1.5} />
        <path ref={proof.ref} d={PROOF_PATH} fill="none" stroke="var(--hair-2)" strokeWidth={1.5} />
        {/* sleepers */}
        {Array.from({ length: 24 }, (_, i) => {
          const x = 84 + i * 26;
          if (x > 690) return null;
          return (
            <g key={i} stroke="var(--hair)" strokeWidth={1}>
              <line x1={x} y1={90} x2={x} y2={102} />
              <line x1={x} y1={298} x2={x} y2={310} />
            </g>
          );
        })}

        {/* progress traces */}
        <motion.path
          d={FAST_PATH}
          fill="none"
          stroke="var(--bas)"
          strokeWidth={2}
          initial={false}
          animate={{ pathLength: fastTarget }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
        />
        <motion.path
          d={PROOF_PATH}
          fill="none"
          stroke="var(--vio)"
          strokeWidth={2}
          initial={false}
          animate={{ pathLength: proofTarget }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
        />

        {/* stations */}
        {fastStations.map((s) => (
          <StationNode key={s.label} s={s} above />
        ))}
        {proofStations.map((s) => (
          <StationNode key={s.label} s={s} />
        ))}

        {/* packets */}
        {fast.pt && fastTarget > 0 && (
          <circle cx={fast.pt.x} cy={fast.pt.y} r={4.5} fill="var(--bas)">
            {!reducedMotion && (
              <animate attributeName="opacity" values="1;0.55;1" dur="1.1s" repeatCount="indefinite" />
            )}
          </circle>
        )}
        {proof.pt && proofTarget > 0 && (
          <circle cx={proof.pt.x} cy={proof.pt.y} r={4.5} fill="var(--vio)">
            {!reducedMotion && (
              <animate attributeName="opacity" values="1;0.55;1" dur="1.1s" repeatCount="indefinite" />
            )}
          </circle>
        )}

        {/* the seal */}
        <g>
          <motion.circle
            cx={SEAL.x}
            cy={SEAL.y}
            r={30}
            fill="var(--ink-2)"
            stroke={sealed ? "var(--sol)" : conflict ? "var(--fail)" : "var(--hair-2)"}
            strokeWidth={sealed || conflict ? 2 : 1.5}
            initial={false}
            animate={sealed ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ duration: 0.6 }}
          />
          <circle
            cx={SEAL.x}
            cy={SEAL.y}
            r={21}
            fill="none"
            stroke={sealed ? "var(--sol)" : "var(--hair)"}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={SEAL.x}
            y={SEAL.y + 4}
            textAnchor="middle"
            fontSize={11}
            fontFamily="var(--mono)"
            fontWeight={700}
            fill={sealed ? "var(--sol)" : conflict ? "var(--fail)" : "var(--faint)"}
          >
            {sealed ? "=" : conflict ? "≠" : "?"}
          </text>
          <text x={SEAL.x} y={SEAL.y + 48} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill={sealed ? "var(--sol)" : "var(--faint)"} letterSpacing={1.5}>
            {sealed ? "DUAL FINALIZED" : conflict ? "CONFLICT — FROZEN" : finality.toUpperCase()}
          </text>
        </g>

        {/* market node */}
        <g opacity={sealed ? 1 : 0.45}>
          <line x1={SEAL.x + 30} y1={SEAL.y} x2={948} y2={SEAL.y} stroke="var(--hair-2)" strokeWidth={1.5} />
          <motion.rect
            x={950}
            y={SEAL.y - 12}
            width={24}
            height={24}
            rx={3}
            fill={state.settledTxHash ? "var(--sol-dim)" : "var(--ink-2)"}
            stroke={state.settledTxHash ? "var(--sol)" : "var(--hair-2)"}
            strokeWidth={1.5}
            initial={false}
            animate={state.settledTxHash ? { scale: [1, 1.2, 1] } : {}}
            style={{ transformOrigin: "962px 200px" }}
          />
          <text x={962} y={SEAL.y + 30} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--faint)">
            {state.settledTxHash ? "SETTLED" : "MARKET"}
          </text>
        </g>
      </svg>

      {sealed && state.attestationId && (
        <div className="mt-2" style={{ textAlign: "center" }}>
          <div className="tiny faint mono mb-1">both lanes derived the same attestation id</div>
          <DigestResolve
            className="mono small text-ok hexwrap"
            value={state.attestationId}
            speed={10}
          />
        </div>
      )}
    </div>
  );
}
