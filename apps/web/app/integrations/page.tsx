/**
 * Integrations — the TxLINE → Solana → Wormhole → CRE → Base wiring diagram
 * with real addresses + explorer links and the simulated/real legend.
 */
import Link from "next/link";
import { demoManifest, deployment, explorerAddress, explorerTx, shortHex } from "@/lib/demo-data";

function Stage({
  name,
  role,
  sim,
  children,
}: {
  name: string;
  role: string;
  sim?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="wire-stage">
      <div className="t">
        <strong>{name}</strong>
        {sim ? <span className="badge-sim">{sim}</span> : <span className="chip ok sm">REAL</span>}
      </div>
      <div className="tiny dim">{role}</div>
      {children && <div className="tiny mono mt-2">{children}</div>}
    </div>
  );
}

export default function IntegrationsPage() {
  const c = deployment.contracts;
  const contractRows: [string, string, string, string][] = [
    ["FinalityRegistry", "finalityRegistry", c.finalityRegistry, "single source of truth: Unknown → CREAttested / WormholeVerified → DualFinalized; freezes on conflict"],
    ["CRELevel3Receiver", "creLevel3Receiver", c.creLevel3Receiver, "fast-lane (Level 3) attestation intake — provisional"],
    ["WormholeOutcomeReceiver", "wormholeOutcomeReceiver", c.wormholeOutcomeReceiver, "proof-lane (Level 4) VAA intake — permissionless submitVaa"],
    ["WormholeCore (dev guardian set)", "wormholeCore", c.wormholeCore, "VAA v1 parse + ecrecover 13-of-19 quorum verification"],
    ["DemoPredictionMarket", "demoPredictionMarket", c.demoPredictionMarket, "consumer: settles only on DualFinalized"],
  ];
  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand">PROOF<span>LINE</span></Link>
        <span className="small dim">Integrations — how the pieces wire together</span>
        <div className="spacer" />
        <nav className="small navlinks">
          <Link href="/control-room">Control room</Link>
          <Link href="/tamper-lab">Tamper lab</Link>
          <Link href={`/matches/${demoManifest.fixture.fixtureId}`}>Match</Link>
        </nav>
      </div>

      <div className="panel mt-4">
        <h3>Wiring diagram</h3>
        <div className="wire">
          <Stage name="TxLINE / TxODDS" role="originates sports data; commits Merkle roots on Solana" sim="recorded fixture">
            program 9ExbZ…cKaA (mainnet)
          </Stage>
          <span className="wire-arrow" aria-hidden>→</span>
          <Stage name="Solana adapter" role="CPI into TxOracle validate_stat_v2; emits only on TRUE" sim="simulated leg">
            emitter {shortHex(deployment.registeredEmitter, 12, 8)}
          </Stage>
          <span className="wire-arrow" aria-hidden>→</span>
          <Stage name="Wormhole" role="19 guardians sign the message; 13-of-19 quorum" sim="dev guardian set">
            VAA v1 · secp256k1 (real math)
          </Stage>
          <span className="wire-arrow" aria-hidden>→</span>
          <Stage name="Chainlink CRE" role="liveness: heartbeat, retries, VAA fetch, Base delivery" sim="local simulation">
            workflows/cre-* (no deployed DON)
          </Stage>
          <span className="wire-arrow" aria-hidden>→</span>
          <Stage name="Base Sepolia" role="verifies VAA, stores outcome, dual-finality registry, settles market">
            chain id {deployment.chainId}
          </Stage>
        </div>
        <p className="tiny faint mt-2">
          Two lanes feed the registry: Level 3 (RPC-quorum fast lane, provisional) and Level 4
          (Wormhole-verified proof lane). Settlement requires both to derive the same attestation id.
        </p>
      </div>

      <div className="panel mt-4">
        <h3>Deployed contracts — Base Sepolia (REAL, verify on BaseScan)</h3>
        <table className="data">
          <thead>
            <tr><th>contract</th><th>address</th><th>role</th></tr>
          </thead>
          <tbody>
            {contractRows.map(([name, key, addr, role]) => (
              <tr key={name}>
                <td className="mono small nowrap">{name}</td>
                <td>
                  <a className="mono tiny" href={explorerAddress(addr)} target="_blank" rel="noreferrer">
                    {addr} ↗
                  </a>
                  {deployment.deployTxHashes[key] && (
                    <div className="tiny faint">
                      deploy tx{" "}
                      <a href={explorerTx(deployment.deployTxHashes[key])} target="_blank" rel="noreferrer">
                        {shortHex(deployment.deployTxHashes[key], 10, 6)} ↗
                      </a>
                    </div>
                  )}
                </td>
                <td className="dim small">{role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="kv mt-3">
          <dt>registered emitter</dt><dd>{deployment.registeredEmitter}</dd>
          <dt>guardian quorum</dt><dd>{deployment.quorum} of {deployment.guardianSet.length}</dd>
          <dt>forwarder (demo EOA)</dt><dd>{deployment.forwarder}</dd>
        </dl>
      </div>

      <div className="panel mt-4">
        <h3>Consume it from any Base contract</h3>
        <pre className="inset mono small pre-block">{`(bool finalized, uint8 result) =
    proofline.finalOutcome(fixtureId);

require(finalized, "Outcome not finalized");
// result: 1 = HOME, 2 = DRAW, 3 = AWAY`}</pre>
        <p className="tiny faint mt-2">
          Proofline is a reusable cross-chain sports-finality primitive; the demo market is one
          consumer, not the product.
        </p>
      </div>
    </div>
  );
}
