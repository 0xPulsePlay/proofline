import { ProofPathSVG } from "./ProofPathSVG";
import { attestationFormula } from "@/lib/story-data";

export function HowItWorks() {
  return (
    <section className="story-section" id="how-it-works">
      <div className="story-section-head">
        <span className="story-num">02</span>
        <h2>How it works</h2>
      </div>
      <p className="story-dek">
        TxLINE commits a match result into a Merkle root on Solana mainnet. From there, two
        lanes — run by different code, different infrastructure, different trust assumptions —
        race to the same finish line on Base.
      </p>

      <div className="panel proof-svg-panel">
        <ProofPathSVG />
        <div className="stage-caption-row">
          <div className="stage-caption lvl3">
            <div className="t">Level 3 — the fast lane</div>
            <div className="dim">
              The exact TxOracle <code className="mono">validate_stat_v2</code> simulation is submitted,
              byte-identical, to a 3-RPC quorum. Agreement is judged on stable outputs only. A Chainlink
              CRE workflow delivers an ABI-encoded attestation to Base.
            </div>
          </div>
          <div className="stage-caption lvl4">
            <div className="t">Level 4 — the proof lane</div>
            <div className="dim">
              A Wormhole VAA carries the fixed-width <code className="mono">MatchOutcomeV1</code> payload
              (13-of-19 guardian quorum, verified on-chain via ecrecover) into the receiver, which
              re-derives the attestation identity on-chain.
            </div>
          </div>
        </div>
      </div>

      <div className="story-keyline">
        Two independent lanes that converge on the same byte-for-byte outcome.
      </div>

      <p className="small dim" style={{ marginTop: 18 }}>
        Each lane independently derives the same attestation id from the same inputs. There is no
        shared memory between them at execution time — only the formula:
      </p>
      <div className="formula-block">
        <span className="k">attestationId</span> = {attestationFormula}
      </div>

      <div className="story-keyline" style={{ borderColor: "var(--txline)", background: "color-mix(in srgb, var(--txline) 6%, var(--bg-panel))" }}>
        The Base registry never &ldquo;approximately compares&rdquo; JSON. It compares exact
        attestation IDs.
      </div>

      <p className="small dim" style={{ marginTop: 10 }}>
        When the two digests meet in the <span className="mono">FinalityRegistry</span>, the fixture
        reaches <strong style={{ color: "var(--text)" }}>DUAL FINALIZED</strong> — and an independent
        prediction market settles from it permissionlessly. A digest mismatch freezes the fixture in{" "}
        <span className="mono">Conflict</span>, never silently overwritten.
      </p>
    </section>
  );
}
