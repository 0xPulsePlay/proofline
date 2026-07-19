/**
 * Permanent honesty legend — what is real vs simulated in this build.
 * Rendered on every page (layout footer).
 */
export function Legend() {
  return (
    <footer className="legend" aria-label="real vs simulated legend">
      <span className="chip ok">REAL</span>
      <span className="small dim">
        keccak hashing · secp256k1 signatures · payload codec · attestation ids · Base Sepolia
        contracts (BaseScan-verifiable)
      </span>
      <span className="chip sim">SIMULATED</span>
      <span className="small dim">
        Solana leg · Wormhole guardian observation (<span className="mono">dev guardian set</span>,
        publicly re-derivable) · CRE DON (local simulation)
      </span>
    </footer>
  );
}
