/**
 * Attestation detail — payload fields, BOTH independent derivation paths,
 * explorer links. Data source: the bundled demo run (real protocol math).
 */
import Link from "next/link";
import { decodeMatchOutcomeV1 } from "@proofline/protocol";
import { demoManifest, deployment, explorerAddress, vector, shortHex } from "@/lib/demo-data";
import { CopyHex } from "@/components/CopyHex";

export default async function AttestationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = demoManifest.derivation;
  const known = d && id.toLowerCase() === d.attestationId.toLowerCase();

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand" style={{ color: "var(--text)" }}>PROOF<span>LINE</span></Link>
        <span className="small dim">Attestation detail</span>
        <div style={{ flex: 1 }} />
        <nav className="small" style={{ display: "flex", gap: 14 }}>
          <Link href="/control-room">Control room</Link>
          <Link href="/tamper-lab">Tamper lab</Link>
          <Link href="/integrations">Integrations</Link>
        </nav>
      </div>

      {!known || !d ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Unknown attestation</h3>
          <p className="small dim">
            <span className="mono">{id}</span> is not part of the bundled demo data. The demo run&apos;s
            attestation is{" "}
            <Link className="mono" href={`/attestations/${demoManifest.attestationId}`}>
              {shortHex(demoManifest.attestationId)}
            </Link>.
          </p>
        </div>
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
  const resultName = o.result === 1 ? "HOME (Canada)" : o.result === 2 ? "DRAW" : "AWAY (France)";

  const payloadRows: [string, string][] = [
    ["magic / version / type", "PRFL · v1 · MATCH_OUTCOME"],
    ["fixture id", String(o.fixtureId)],
    ["result", `${o.result} — ${resultName}`],
    ["score", `${o.participant1Score}–${o.participant2Score} (period ${o.period})`],
    ["score sequence", String(o.scoreSequence)],
    ["proof timestamp", new Date(Number(o.proofTimestampMs)).toISOString()],
    ["destination chain", `${o.destinationChain} (Base Sepolia, Wormhole numbering)`],
    ["source validation", `validate_stat_v${o.sourceValidationVersion}`],
  ];
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
      <div className="scoreline">
        <span className="teams" style={{ fontSize: 26 }}>
          {f.participant1} <span className="score">{f.participant1Score}</span>
          <span className="dim"> — </span>
          <span className="score">{f.participant2Score}</span> {f.participant2}
        </span>
        <span className="final-tag">FINAL</span>
        {f.synthetic && <span className="badge-sim">synthetic fixture</span>}
      </div>
      <div className="panel">
        <h3>Attestation id</h3>
        <div className="mono small" style={{ wordBreak: "break-all" }}>
          <CopyHex value={d.attestationId} head={20} tail={12} label="attestation id" />
        </div>
        <p className="tiny faint" style={{ margin: "8px 0 0" }}>
          keccak256(domainSeparator ‖ sourceEmitter ‖ fixtureId ‖ scoreSequence ‖
          validationInstructionHash ‖ proofBundleHash) — conformance-asserted against{" "}
          <span className="mono">match-outcome-v1.json</span> (vector value{" "}
          <span className="mono">{shortHex(vector.attestationId)}</span>).
        </p>
      </div>

      <div className="two-col" style={{ marginTop: 14 }}>
        <div className="panel">
          <h3>Payload — MatchOutcomeV1 (176 bytes, REAL)</h3>
          <table className="data"><tbody>
            {payloadRows.map(([k, v]) => (
              <tr key={k}><td className="dim" style={{ whiteSpace: "nowrap" }}>{k}</td><td className="mono">{v}</td></tr>
            ))}
          </tbody></table>
          <div style={{ marginTop: 10 }}>
            <span className="tiny faint">encoded payload </span>
            <CopyHex value={d.payloadHex} head={18} label="payload hex" />
          </div>
        </div>
        <div className="panel">
          <h3>Committed hashes</h3>
          <dl className="kv">
            {hashRows.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v.startsWith("0x") ? <CopyHex value={v} label={k} /> : v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3>Two independent derivation paths — the dual-finality trick</h3>
        <div className="two-col">
          <div className="inset">
            <div className="small"><strong>Level 3 — fast lane</strong> <span className="badge-sim">simulated leg</span></div>
            <p className="tiny dim" style={{ margin: "6px 0 0" }}>
              Three independent RPC providers simulate the TxOracle validation; the CRE workflow
              reports the outcome to{" "}
              <a href={explorerAddress(deployment.contracts.creLevel3Receiver)} target="_blank" rel="noreferrer" className="mono">
                CRELevel3Receiver ↗
              </a>
              , which derives the attestation id on-chain from the report fields.
            </p>
          </div>
          <div className="inset">
            <div className="small"><strong>Level 4 — proof lane</strong> <span className="chip ok" style={{ fontSize: 10 }}>real math</span></div>
            <p className="tiny dim" style={{ margin: "6px 0 0" }}>
              The signed VAA ({d.guardianIndices?.length ?? 13} dev-guardian signatures) is delivered to{" "}
              <a href={explorerAddress(deployment.contracts.wormholeOutcomeReceiver)} target="_blank" rel="noreferrer" className="mono">
                WormholeOutcomeReceiver ↗
              </a>
              , which verifies signatures via{" "}
              <a href={explorerAddress(deployment.contracts.wormholeCore)} target="_blank" rel="noreferrer" className="mono">
                WormholeCore ↗
              </a>{" "}
              and independently derives the same attestation id from the payload + emitter.
            </p>
          </div>
        </div>
        <p className="small" style={{ margin: "12px 0 0", color: "var(--ok)" }}>
          Digest equality of the two derivations is exactly what{" "}
          <a href={explorerAddress(deployment.contracts.finalityRegistry)} target="_blank" rel="noreferrer" className="mono">
            FinalityRegistry ↗
          </a>{" "}
          requires for DUAL FINALIZED.
        </p>
      </div>
      <p className="small" style={{ marginTop: 14 }}>
        <Link href={`/matches/${f.fixtureId}`}>← match timeline</Link>
        <span className="dim"> · </span>
        <Link href="/control-room">watch the run in the control room →</Link>
      </p>
    </>
  );
}
