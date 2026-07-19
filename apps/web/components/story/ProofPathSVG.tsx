/**
 * Animated proof-path diagram: TxLINE's mainnet Merkle root splits into two
 * independently-operated lanes that race toward the same convergence point
 * (the FinalityRegistry). Two packets travel the curves on a loop; the
 * convergence node pulses on arrival — a continuous illustration of "two
 * independent lanes racing to the same digest," not live telemetry.
 */
export function ProofPathSVG() {
  return (
    <svg
      className="proof-svg"
      viewBox="0 0 1000 320"
      role="img"
      aria-label="TxLINE's mainnet Merkle root feeds two independent lanes — Level 3 RPC quorum and Level 4 Wormhole VAA — that converge at the same attestation id in the FinalityRegistry"
    >
      <defs>
        <linearGradient id="lvl3Grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--txline)" />
          <stop offset="100%" stopColor="var(--solana)" />
        </linearGradient>
        <linearGradient id="lvl4Grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--txline)" />
          <stop offset="100%" stopColor="var(--wormhole)" />
        </linearGradient>
      </defs>

      {/* faint grid backdrop */}
      <g opacity="0.12" stroke="var(--line-strong)">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 125} y1={0} x2={i * 125} y2={320} />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 80} x2={1000} y2={i * 80} />
        ))}
      </g>

      {/* source: TxLINE mainnet Merkle root */}
      <circle cx="70" cy="160" r="13" fill="var(--txline)" className="proof-node-pulse" />

      {/* level 3 lane (top arc) */}
      <path
        id="lvl3path"
        d="M70,160 C 300,45 660,45 900,160"
        stroke="url(#lvl3Grad)"
        strokeWidth="3"
        fill="none"
        opacity="0.55"
      />
      {/* level 4 lane (bottom arc) */}
      <path
        id="lvl4path"
        d="M70,160 C 300,275 660,275 900,160"
        stroke="url(#lvl4Grad)"
        strokeWidth="3"
        fill="none"
        opacity="0.55"
      />

      {/* traveling packets */}
      <circle r="6" fill="var(--solana)">
        <animateMotion dur="3.1s" repeatCount="indefinite">
          <mpath href="#lvl3path" />
        </animateMotion>
      </circle>
      <circle r="6" fill="var(--wormhole)">
        <animateMotion dur="3.5s" repeatCount="indefinite">
          <mpath href="#lvl4path" />
        </animateMotion>
      </circle>

      {/* convergence: FinalityRegistry */}
      <circle cx="900" cy="160" r="26" fill="none" stroke="var(--ok)" strokeWidth="2" className="proof-converge-ring" />
      <circle cx="900" cy="160" r="9" fill="var(--ok)" />
    </svg>
  );
}
