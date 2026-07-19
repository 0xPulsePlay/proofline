/** Landing — the pitch, the honest pipeline, and four doors into the exhibit. */
import Link from "next/link";
import { demoManifest, deployment, shortHex } from "@/lib/demo-data";
import { Plate, Reveal, SectionIndex, StampReal, StampSim } from "@/components/chrome";
import {
  IconBlocks,
  IconHammer,
  IconPulse,
  IconSeal,
  IconCircuit,
} from "@/components/icons";

function Spine() {
  const stages: [string, string, "sim" | "real"][] = [
    ["TxLINE", "score committed", "sim"],
    ["Solana", "proof verified", "sim"],
    ["Wormhole", "13/19 guardians", "sim"],
    ["Chainlink CRE", "liveness", "sim"],
    ["Base Sepolia", "settlement", "real"],
  ];
  return (
    <svg viewBox="0 0 1000 120" className="spine" style={{ width: "100%", height: "auto", minWidth: 560 }} role="img" aria-label="Pipeline: TxLINE to Solana to Wormhole to Chainlink CRE to Base Sepolia">
      <line x1={70} y1={46} x2={930} y2={46} stroke="var(--hair-2)" strokeWidth={1.5} />
      {stages.map(([name, sub], i) => {
        const x = 70 + i * 215;
        return (
          <g key={name}>
            <circle cx={x} cy={46} r={7} fill="var(--ink-2)" stroke={i === 4 ? "var(--sol)" : "var(--hair-2)"} strokeWidth={1.5} />
            <circle cx={x} cy={46} r={2.5} fill={i === 4 ? "var(--sol)" : "var(--faint)"} />
            <text x={x} y={80} textAnchor="middle" fontSize={12} fontFamily="var(--mono)" fill="var(--text)">
              {name}
            </text>
            <text x={x} y={96} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--faint)">
              {sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  const f = demoManifest.fixture;
  return (
    <div className="shell">
      <section style={{ padding: "46px 0 10px" }}>
        <Reveal>
          <div className="kicker mb-2">ORACLE-ATTESTED SETTLEMENT · SOLANA → BASE</div>
          <h1 className="display">
            Sports results, <span className="hl">proven once.</span>
            <br />
            Settled <span className="hl">everywhere.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="lede mt-3">
            TxLINE commits scores to Solana. Proofline verifies them with TxLINE&apos;s own
            on-chain verifier, carries the outcome across Wormhole, and finalizes on Base — two
            independent lanes racing to the same digest. A relayer can delay an outcome; it cannot
            change one.
          </p>
        </Reveal>
      </section>

      <Reveal delay={0.2}>
        <Plate className="mt-4">
          <div style={{ overflowX: "auto" }}>
            <Spine />
          </div>
          <div className="row mt-2" style={{ justifyContent: "center" }}>
            <span className="mono tiny faint">TxLINE → Solana</span>
            <StampSim>sim</StampSim>
            <span className="mono tiny faint">→ Wormhole 13/19</span>
            <StampSim>dev set</StampSim>
            <span className="mono tiny faint">→ Chainlink CRE</span>
            <StampSim>local</StampSim>
            <span className="mono tiny faint">→ Base Sepolia</span>
            <StampReal />
          </div>
        </Plate>
      </Reveal>

      <div className="sec">
        <SectionIndex no="01" title="Enter the exhibit" />
        <div className="grid-doors">
          <Reveal>
            <Link href="/control-room" className="door">
              <span className="go">→</span>
              <span className="glyph"><IconPulse size={26} /></span>
              <h3>Finality Control Room</h3>
              <p>
                Replay of a recorded run — {f.participant1} {f.participant1Score}–
                {f.participant2Score} {f.participant2}. Two lanes race to one digest on real
                timestamps.
              </p>
            </Link>
          </Reveal>
          <Reveal delay={0.06}>
            <Link href="/mainnet" className="door">
              <span className="go">→</span>
              <span className="glyph"><IconSeal size={26} /></span>
              <h3>Solana Mainnet Exhibit</h3>
              <p>
                The deployed program, the real verify_outcome transaction, and the memo-anchored
                attestation — formal evidence, self-explaining.
              </p>
            </Link>
          </Reveal>
          <Reveal delay={0.12}>
            <Link href="/tamper-lab" className="door">
              <span className="go">→</span>
              <span className="glyph"><IconHammer size={26} /></span>
              <h3>Tamper Lab</h3>
              <p>
                Try to forge a result. Every attack fails with the Base contract&apos;s real error,
                verified in your browser.
              </p>
            </Link>
          </Reveal>
          <Reveal delay={0.18}>
            <Link href="/integrations" className="door">
              <span className="go">→</span>
              <span className="glyph"><IconCircuit size={26} /></span>
              <h3>Integrations</h3>
              <p>
                The wiring, the deployed contracts, and the two-call interface any Base contract
                can consume.
              </p>
            </Link>
          </Reveal>
        </div>
      </div>

      <div className="sec">
        <SectionIndex no="02" title="The dual-finality guarantee" />
        <div className="grid-2">
          <Reveal>
            <Plate>
              <div className="row mb-2">
                <span className="glyph dim"><IconBlocks size={20} /></span>
                <strong>Two lanes, one digest</strong>
              </div>
              <p className="small dim m-0">
                Dual finality: fast lane (RPC quorum, provisional) and proof lane (Wormhole VAA)
                must independently derive attestation{" "}
                <Link className="mono" href={`/attestations/${demoManifest.attestationId}`}>
                  {shortHex(demoManifest.attestationId)}
                </Link>
                . Settlement requires both to agree — contracts live on{" "}
                <a
                  href={`${deployment.explorerBaseUrl}/address/${deployment.contracts.finalityRegistry}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Base Sepolia ↗
                </a>
                .
              </p>
            </Plate>
          </Reveal>
          <Reveal delay={0.08}>
            <Plate>
              <div className="row mb-2">
                <span className="glyph dim"><IconSeal size={20} /></span>
                <strong>What a proof establishes</strong>
              </div>
              <p className="small dim m-0">
                CRE provides liveness. TxLINE, Solana, and Wormhole provide correctness. A relayer
                can delay an outcome, but it cannot change one. A proof uploader can submit
                arbitrary bytes, but the Solana adapter emits only after TxLINE&apos;s canonical
                verifier returns true. Base accepts only a valid Wormhole VAA from the registered
                emitter.
              </p>
            </Plate>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
