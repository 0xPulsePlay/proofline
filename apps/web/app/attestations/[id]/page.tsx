/**
 * Attestation dossier — the digest itself is the hero: it crystallizes out
 * of noise, then is dissected (payload, committed hashes) and shown as the
 * junction where the two independent derivation lanes agree.
 * Data source: the bundled demo run (real protocol math).
 */
import Link from "next/link";
import { decodeMatchOutcomeV1 } from "@proofline/protocol";
import { demoManifest, deployment, explorerAddress, vector, shortHex } from "@/lib/demo-data";
import { Hex, Plate, PlateHead, SectionIndex, Reveal, StampReal, StampSim } from "@/components/chrome";
import { DigestResolve } from "@/components/viz/DigestResolve";
import { LaneFork } from "@/components/viz/LaneFork";
import { ByteDissect, MATCH_OUTCOME_FIELDS } from "@/components/viz/ByteDissect";
import { IconExternal } from "@/components/icons";

export default async function AttestationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = demoManifest.derivation;
  const known = d && id.toLowerCase() === d.attestationId.toLowerCase();

  return (
    <div className="shell">
      {!known || !d ? (
        <section style={{ padding: "46px 0 0" }}>
          <Plate>
            <PlateHead title="Unknown attestation" />
            <p className="small dim m-0">
              <span className="mono">{id}</span> is not part of the bundled demo data. The demo
              run&apos;s attestation is{" "}
              <Link className="mono" href={`/attestations/${demoManifest.attestationId}`}>
                {shortHex(demoManifest.attestationId)}
              </Link>
              .
            </p>
          </Plate>
        </section>
      ) : (
        <AttestationDetail />
      )}
    </div>
  );
}

function AttestationDetail() {
  const d = demoManifest.derivation!;
  const f = demoManifest.fixture;
  const payloadBytes = (() => {
    const clean = d.payloadHex.slice(2);
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
  })();
  const o = decodeMatchOutcomeV1(payloadBytes);

  const dissectFields = MATCH_OUTCOME_FIELDS({
    flags: o.flags,
    destinationChain: o.destinationChain,
    sourceValidationVersion: o.sourceValidationVersion,
    result: o.result,
    fixtureId: o.fixtureId,
    scoreSequence: o.scoreSequence,
    proofTimestampMs: o.proofTimestampMs,
    period: o.period,
    participant1Score: o.participant1Score,
    participant2Score: o.participant2Score,
    txlineProgramId: o.txlineProgramId,
    dailyRootAccount: o.dailyRootAccount,
    validationInstructionHash: o.validationInstructionHash,
    proofBundleHash: o.proofBundleHash,
  });
  const hashRows: [string, string][] = [
    ["txline program id", o.txlineProgramId],
    ["daily root account", o.dailyRootAccount],
    ["validation instruction hash", o.validationInstructionHash],
    ["proof bundle hash", o.proofBundleHash],
    ["source emitter (32 B)", d.sourceEmitter],
    ["domain separator", d.domainSeparator],
    ["VAA hash", d.vaaHash ?? "—"],
  ];

  return (
    <>
      <section style={{ padding: "30px 0 0" }}>
        <Reveal>
          <div className="kicker mb-2">ATTESTATION DOSSIER</div>
          <div className="score-hero">
            <span className="teams" style={{ fontSize: "clamp(18px, 3vw, 26px)" }}>
              {f.participant1} <span className="num">{f.participant1Score}</span>
              <span className="vs"> — </span>
              <span className="num">{f.participant2Score}</span> {f.participant2}
            </span>
            <span className="final-tag">FINAL</span>
            {f.synthetic && <StampSim>synthetic fixture</StampSim>}
          </div>
          <h1
            className="mono mt-3 hexwrap"
            style={{ fontSize: "clamp(15px, 2.6vw, 22px)", fontWeight: 650, letterSpacing: "0.02em", color: "var(--sol)" }}
          >
            <DigestResolve value={d.attestationId} speed={14} />
          </h1>
        </Reveal>
      </section>

      <div className="sec">
        <SectionIndex no="01" title="How the id is derived" />
        <Reveal>
          <Plate>
            <div className="codeblock tiny">
              keccak256(domainSeparator ‖ sourceEmitter ‖ fixtureId ‖ scoreSequence ‖
              validationInstructionHash ‖ proofBundleHash)
            </div>
            <p className="tiny faint mt-2 m-0">
              Conformance-asserted against <span className="mono">match-outcome-v1.json</span>{" "}
              (vector value <span className="mono">{shortHex(vector.attestationId)}</span>). The
              same value is derived independently by both finality lanes, on-chain.
            </p>
          </Plate>
        </Reveal>
      </div>

      <div className="sec">
        <SectionIndex no="02" title="Dissection — the bytes that were attested" />
        <div className="grid-2">
          <Reveal>
            <Plate>
              <PlateHead kicker="PAYLOAD" title="MatchOutcomeV1 — 176 bytes">
                <StampReal />
              </PlateHead>
              <p className="tiny faint mt-0 mb-2">
                Every field owns its exact byte range — hover a row to light its bytes.
                Destination chain uses Wormhole numbering.
              </p>
              <ByteDissect payloadHex={d.payloadHex} fields={dissectFields} />
              <div className="mt-2">
                <span className="tiny faint">encoded payload </span>
                <Hex value={d.payloadHex} head={18} label="payload hex" />
              </div>
            </Plate>
          </Reveal>
          <Reveal delay={0.08}>
            <Plate>
              <PlateHead kicker="COMMITMENTS" title="Bound hashes" />
              <dl className="kv">
                {hashRows.map(([k, v]) => (
                  <div className="row" key={k}>
                    <dt>{k}</dt>
                    <dd>{v.startsWith("0x") ? <Hex value={v} label={k} /> : v}</dd>
                  </div>
                ))}
              </dl>
            </Plate>
          </Reveal>
        </div>
      </div>

      <div className="sec">
        <SectionIndex no="03" title="Two independent derivation paths — the dual-finality trick" />
        <Reveal>
          <Plate>
            <div style={{ overflowX: "auto" }}>
              <LaneFork fastLabel="LEVEL 3 · FAST LANE" proofLabel="LEVEL 4 · PROOF LANE" />
            </div>
            <div className="grid-2 mt-3">
              <div>
                <div className="row mb-1">
                  <strong className="small">Level 3 — fast lane</strong>
                  <StampSim>simulated leg</StampSim>
                </div>
                <p className="tiny dim m-0">
                  Three independent RPC providers simulate the TxOracle validation; the CRE workflow
                  reports the outcome to{" "}
                  <a href={explorerAddress(deployment.contracts.creLevel3Receiver)} target="_blank" rel="noreferrer" className="mono">
                    CRELevel3Receiver <IconExternal size={11} style={{ verticalAlign: "-1px" }} />
                  </a>
                  , which derives the attestation id on-chain from the report fields.
                </p>
              </div>
              <div>
                <div className="row mb-1">
                  <strong className="small">Level 4 — proof lane</strong>
                  <StampReal>real math</StampReal>
                </div>
                <p className="tiny dim m-0">
                  The signed VAA ({d.guardianIndices?.length ?? 13} dev-guardian signatures) is
                  delivered to{" "}
                  <a href={explorerAddress(deployment.contracts.wormholeOutcomeReceiver)} target="_blank" rel="noreferrer" className="mono">
                    WormholeOutcomeReceiver <IconExternal size={11} style={{ verticalAlign: "-1px" }} />
                  </a>
                  , which verifies signatures via{" "}
                  <a href={explorerAddress(deployment.contracts.wormholeCore)} target="_blank" rel="noreferrer" className="mono">
                    WormholeCore <IconExternal size={11} style={{ verticalAlign: "-1px" }} />
                  </a>{" "}
                  and independently derives the same attestation id from the payload + emitter.
                </p>
              </div>
            </div>
            <p className="small mt-3 mb-0 text-ok">
              Digest equality of the two derivations is exactly what{" "}
              <a href={explorerAddress(deployment.contracts.finalityRegistry)} target="_blank" rel="noreferrer" className="mono">
                FinalityRegistry <IconExternal size={11} style={{ verticalAlign: "-1px" }} />
              </a>{" "}
              requires for DUAL FINALIZED.
            </p>
          </Plate>
        </Reveal>
        <p className="small mt-4">
          <Link href={`/matches/${f.fixtureId}`}>← match dossier</Link>
          <span className="dim"> · </span>
          <Link href="/control-room">watch the run in the control room →</Link>
        </p>
      </div>
    </>
  );
}
