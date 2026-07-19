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
        <Link href="/" className="brand">PROOF<span>LINE</span></Link>
        <span className="small dim">Match view</span>
        <div className="spacer" />
        <nav className="small navlinks">
          <Link href="/control-room">Control room</Link>
          <Link href="/tamper-lab">Tamper lab</Link>
          <Link href="/integrations">Integrations</Link>
        </nav>
      </div>

      {!known ? (
        <div className="panel mt-4">
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
            <span className="spacer" />
            <span className="tiny dim">{fx.competition} · fixture {fx.fixtureId}</span>
          </div>

          <div className="panel">
            <h3>TxLINE record timeline (deterministic recording)</h3>
            <div className="stack-sm">
              {fx.records.map((r) => (
                <div key={r.sequence} className="inset row-base">
                  <span className="mono tiny faint">{new Date(r.timestampMs).toISOString()}</span>
                  <span className={`mono small ${r.action === "game_finalised" ? "text-ok" : "hi"}`}>
                    {r.action}
                  </span>
                  <span className="mono tiny dim">
                    status {r.statusId} · period {r.period} · seq {r.sequence} · score {r.participant1Score}–{r.participant2Score}
                  </span>
                  {r.action === "game_finalised" && (
                    <span className="chip ok sm">FINAL marker (status 100 / period 100)</span>
                  )}
                </div>
              ))}
            </div>
            <p className="tiny faint mt-2">
              {fx.description}
            </p>
          </div>

          <div className="two-col mt-4">
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
              <p className="small dim m-0">
                Result: <strong className="hi">{f.participant1} wins {f.participant1Score}–{f.participant2Score}</strong>
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
              <p className="small mt-2">
                <Link href="/control-room">watch this outcome relay in the control room →</Link>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
