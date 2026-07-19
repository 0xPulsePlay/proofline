/**
 * Match view — fixture record timeline → outcome, from the bundled demo data.
 */
import Link from "next/link";
import { demoFixtureFile, demoManifest, deployment, explorerAddress, shortHex } from "@/lib/demo-data";

export default async function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const fx = demoFixtureFile;
  const known = fixtureId === fx.fixtureId;
  const f = demoManifest.fixture;

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand" style={{ color: "var(--text)" }}>PROOF<span>LINE</span></Link>
        <span className="small dim">Match view</span>
        <div style={{ flex: 1 }} />
        <nav className="small" style={{ display: "flex", gap: 14 }}>
          <Link href="/control-room">Control room</Link>
          <Link href="/tamper-lab">Tamper lab</Link>
          <Link href="/integrations">Integrations</Link>
        </nav>
      </div>

      {!known ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Unknown fixture</h3>
          <p className="small dim">
            Fixture <span className="mono">{fixtureId}</span> is not part of the bundled demo data.
            Try <Link className="mono" href={`/matches/${fx.fixtureId}`}>{fx.fixtureId}</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="scoreline">
            <span className="teams">
              {f.participant1} <span className="score">{f.participant1Score}</span>
              <span className="dim"> — </span>
              <span className="score">{f.participant2Score}</span> {f.participant2}
            </span>
            <span className="final-tag">FINAL</span>
            <span className="badge-sim">synthetic fixture</span>
            <span style={{ flex: 1 }} />
            <span className="tiny dim">{fx.competition} · fixture {fx.fixtureId}</span>
          </div>

          <div className="panel">
            <h3>TxLINE record timeline (deterministic recording)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fx.records.map((r) => (
                <div key={r.sequence} className="inset" style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="mono tiny faint">{new Date(r.timestampMs).toISOString()}</span>
                  <span className="mono small" style={{ color: r.action === "game_finalised" ? "var(--ok)" : "var(--text)" }}>
                    {r.action}
                  </span>
                  <span className="mono tiny dim">
                    status {r.statusId} · period {r.period} · seq {r.sequence} · score {r.participant1Score}–{r.participant2Score}
                  </span>
                  {r.action === "game_finalised" && (
                    <span className="chip ok" style={{ fontSize: 10 }}>FINAL marker (status 100 / period 100)</span>
                  )}
                </div>
              ))}
            </div>
            <p className="tiny faint" style={{ margin: "10px 0 0" }}>
              {fx.description}
            </p>
          </div>

          <div className="two-col" style={{ marginTop: 14 }}>
            <div className="panel">
              <h3>Commitment</h3>
              <dl className="kv">
                <dt>daily root</dt><dd>{fx.rootAccount}</dd>
                <dt>strategy</dt><dd>{fx.strategy}</dd>
                <dt>emitter</dt><dd>{fx.wormhole.emitterBase58}</dd>
                <dt>emitter sequence</dt><dd>{fx.wormhole.sequence}</dd>
                <dt>destination</dt><dd>{fx.destinationChain} (Base Sepolia)</dd>
              </dl>
            </div>
            <div className="panel">
              <h3>Outcome on Base</h3>
              <p className="small dim" style={{ margin: 0 }}>
                Result: <strong style={{ color: "var(--text)" }}>{f.participant1} wins {f.participant1Score}–{f.participant2Score}</strong>
                <br />
                Attestation:{" "}
                <Link className="mono" href={`/attestations/${demoManifest.attestationId}`}>
                  {shortHex(demoManifest.attestationId)}
                </Link>
                <br />
                Registry:{" "}
                <a className="mono" href={explorerAddress(deployment.contracts.finalityRegistry)} target="_blank" rel="noreferrer">
                  {shortHex(deployment.contracts.finalityRegistry)} ↗
                </a>
                <br />
                Market:{" "}
                <a className="mono" href={explorerAddress(deployment.contracts.demoPredictionMarket)} target="_blank" rel="noreferrer">
                  {shortHex(deployment.contracts.demoPredictionMarket)} ↗
                </a>
              </p>
              <p className="small" style={{ marginTop: 10 }}>
                <Link href="/control-room">watch this outcome relay in the control room →</Link>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
