"use client";
/**
 * LaneFork — the dual-finality trick drawn as two rails that leave separate
 * origins and converge onto a single digest node. Fast lane dashed (simulated
 * leg), proof lane solid (real math); the seal at the junction only appears
 * once both paths have drawn. Reduced motion: fully drawn, static.
 */
import { motion, useReducedMotion } from "framer-motion";

export function LaneFork({ fastLabel, proofLabel }: { fastLabel: string; proofLabel: string }) {
  const reduced = useReducedMotion();
  const draw = (delay: number) => ({
    initial: reduced ? false : { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true, margin: "-40px" },
    transition: { duration: reduced ? 0 : 0.9, delay: reduced ? 0 : delay, ease: "easeInOut" as const },
  });
  return (
    <svg
      viewBox="0 0 720 150"
      style={{ width: "100%", minWidth: 520, height: "auto", display: "block" }}
      role="img"
      aria-label="Two independent derivation lanes converging on one attestation digest"
    >
      <text x={24} y={34} fontSize={10.5} fontFamily="var(--mono)" fill="var(--txl)" letterSpacing={1.2}>
        {fastLabel}
      </text>
      <text x={24} y={124} fontSize={10.5} fontFamily="var(--mono)" fill="var(--sol)" letterSpacing={1.2}>
        {proofLabel}
      </text>
      <motion.path
        d="M 24 48 C 240 48, 320 75, 470 75"
        fill="none"
        stroke="var(--txl)"
        strokeWidth={1.6}
        strokeDasharray="5 5"
        {...draw(0)}
      />
      <motion.path
        d="M 24 102 C 240 102, 320 75, 470 75"
        fill="none"
        stroke="var(--sol)"
        strokeWidth={1.6}
        {...draw(0.25)}
      />
      <motion.g
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ type: "spring", stiffness: 220, damping: 14, delay: reduced ? 0 : 1.05 }}
        style={{ transformOrigin: "492px 75px" }}
      >
        <circle cx={492} cy={75} r={17} fill="var(--sol-dim)" stroke="var(--sol)" strokeWidth={1.5} />
        <circle cx={492} cy={75} r={5} fill="var(--sol)" />
      </motion.g>
      <motion.text
        x={526}
        y={79}
        fontSize={10.5}
        fontFamily="var(--mono)"
        fill="var(--sol)"
        letterSpacing={1.2}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ delay: reduced ? 0 : 1.2 }}
      >
        DIGESTS EQUAL → DUAL FINALIZED
      </motion.text>
    </svg>
  );
}
