/** Landing — one-screen pitch with doors into the control room and tamper lab. */
import Link from "next/link";
import { demoManifest, deployment, shortHex } from "@/lib/demo-data";

export default function Home() {
  const f = demoManifest.fixture;
  return (
    <div className="shell landing">
      <div className="topbar">
        <span className="brand">PROOF<span>LINE</span></span>
        <div className="spacer" />
        <nav className="small navlinks">
          <Link href="/control-room">Control room</Link>
          <Link href="/tamper-lab">Tamper lab</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href={`/matches/${f.fixtureId}`}>Match</Link>
        </nav>
      </div>

      <div className="hero">
        <h1>
          Sports results, <span className="hl">proven once.</span>
          <br />
          Settled <span className="hl">everywhere.</span>
        </h1>
        <p className="dim hero-lead">
          TxLINE commits scores to Solana. Proofline verifies them with TxLINE&apos;s own on-chain
          verifier, carries the outcome across Wormhole, and finalizes on Base — two independent
          lanes racing to the same digest. A relayer can delay an outcome; it cannot change one.
        </p>
        <div className="hero-cta">
          <Link href="/control-room" className="cta primary">
            ▶ Watch the Finality Control Room
            <span className="tiny cta-sub">
              replay of a recorded run — {f.participant1} {f.participant1Score}–{f.participant2Score} {f.participant2}
            </span>
          </Link>
          <Link href="/tamper-lab" className="cta">
            ⚔ Try to forge a result
            <span className="tiny cta-sub">
              tamper lab — every attack fails with the contract&apos;s real error
            </span>
          </Link>
        </div>
        <div className="hero-path mono tiny dim">
          TxLINE → Solana <span className="badge-sim">sim</span> → Wormhole 13/19{" "}
          <span className="badge-sim">dev set</span> → Chainlink CRE{" "}
          <span className="badge-sim">local</span> → Base Sepolia{" "}
          <span className="chip ok sm">REAL</span>
        </div>
        <p className="tiny faint">
          Dual finality: fast lane (RPC quorum, provisional) and proof lane (Wormhole VAA) must
          independently derive attestation{" "}
          <Link className="mono" href={`/attestations/${demoManifest.attestationId}`}>
            {shortHex(demoManifest.attestationId)}
          </Link>{" "}
          — contracts live on{" "}
          <a href={`${deployment.explorerBaseUrl}/address/${deployment.contracts.finalityRegistry}`} target="_blank" rel="noreferrer">
            Base Sepolia ↗
          </a>
          .
        </p>
      </div>
    </div>
  );
}
