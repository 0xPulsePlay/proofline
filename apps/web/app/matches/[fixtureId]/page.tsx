/**
 * Match dossier — the fixture's TxLINE record spine: a deterministic
 * recording timeline that seals itself, then the commitment and the
 * outcome on Base. Data source: the bundled demo run (real protocol math).
 */
import Link from "next/link";
import { demoFixtureFile, demoManifest, deployment, explorerAddress, shortHex } from "@/lib/demo-data";
import { Plate, PlateHead, SectionIndex, Reveal, StampReal, StampSim } from "@/components/chrome";
import { RecordSpine } from "@/components/viz/RecordSpine";
import { IconExternal } from "@/components/icons";

export default async function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const fx = demoFixtureFile;
  const known = fixtureId === fx.fixtureId;
  const f = demoManifest.fixture;

  return (
    <div className="shell">
      {!known ? (
        <section style={{ padding: "46px 0 0" }}>
          <Plate>
            <PlateHead title="Unknown fixture" />
            <p className="small dim m-0">
              Fixture <span className="mono">{fixtureId}</span> is not part of the bundled demo
              data. Try{" "}
              <Link className="mono" href={`/matches/${fx.fixtureId}`}>
                {fx.fixtureId}
              </Link>
              .
            </p>
          </Plate>
        </section>
      ) : (
        <>
          <section style={{ padding: "30px 0 0" }}>
            <Reveal>
              <div className="kicker mb-2">
                MATCH DOSSIER · {fx.competition} · FIXTURE {fx.fixtureId}
              </div>
              <div className="score-hero">
                <span className="teams">
                  {f.participant1} <span className="num">{f.participant1Score}</span>
                  <span className="vs"> — </span>
                  <span className="num">{f.participant2Score}</span> {f.participant2}
                </span>
                <span className="final-tag">FINAL</span>
                <StampSim>synthetic fixture</StampSim>
              </div>
            </Reveal>
          </section>

          <div className="sec">
            <SectionIndex no="01" title="The record spine — deterministic recording" />
            <Reveal>
              <Plate>
                <RecordSpine
                  records={fx.records.map((r) => ({
                    key: String(r.sequence),
                    at: new Date(r.timestampMs).toISOString(),
                    action: r.action,
                    detail: `status ${r.statusId} · period ${r.period} · seq ${r.sequence} · score ${r.participant1Score}–${r.participant2Score}`,
                    terminal: r.action === "game_finalised",
                  }))}
                />
                <p className="tiny faint mt-3 m-0">{fx.description}</p>
              </Plate>
            </Reveal>
          </div>

          <div className="sec">
            <SectionIndex no="02" title="What the records became" />
            <div className="grid-2">
              <Reveal>
                <Plate>
                  <PlateHead kicker="COMMITMENT" title="Sealed on Solana">
                    <StampSim>simulated leg</StampSim>
                  </PlateHead>
                  <dl className="kv">
                    <div className="row"><dt>daily root</dt><dd>{fx.rootAccount}</dd></div>
                    <div className="row"><dt>strategy</dt><dd>{fx.strategy}</dd></div>
                    <div className="row"><dt>emitter</dt><dd>{fx.wormhole.emitterBase58}</dd></div>
                    <div className="row"><dt>emitter sequence</dt><dd>{fx.wormhole.sequence}</dd></div>
                    <div className="row"><dt>destination</dt><dd>{fx.destinationChain} (Base Sepolia)</dd></div>
                  </dl>
                </Plate>
              </Reveal>
              <Reveal delay={0.08}>
                <Plate>
                  <PlateHead kicker="SETTLEMENT" title="Outcome on Base">
                    <StampReal>REAL, verify on BaseScan</StampReal>
                  </PlateHead>
                  <p className="small dim m-0">
                    Result:{" "}
                    <strong className="hi">
                      {f.participant1} wins {f.participant1Score}–{f.participant2Score}
                    </strong>
                  </p>
                  <dl className="kv mt-2">
                    <div className="row">
                      <dt>attestation</dt>
                      <dd>
                        <Link className="mono" href={`/attestations/${demoManifest.attestationId}`}>
                          {shortHex(demoManifest.attestationId)}
                        </Link>
                      </dd>
                    </div>
                    <div className="row">
                      <dt>registry</dt>
                      <dd>
                        <a className="mono" href={explorerAddress(deployment.contracts.finalityRegistry)} target="_blank" rel="noreferrer">
                          {shortHex(deployment.contracts.finalityRegistry)} <IconExternal size={11} style={{ verticalAlign: "-1px" }} />
                        </a>
                      </dd>
                    </div>
                    <div className="row">
                      <dt>market</dt>
                      <dd>
                        <a className="mono" href={explorerAddress(deployment.contracts.demoPredictionMarket)} target="_blank" rel="noreferrer">
                          {shortHex(deployment.contracts.demoPredictionMarket)} <IconExternal size={11} style={{ verticalAlign: "-1px" }} />
                        </a>
                      </dd>
                    </div>
                  </dl>
                  <p className="small mt-3 m-0">
                    <Link href="/control-room">watch this outcome relay in the control room →</Link>
                  </p>
                </Plate>
              </Reveal>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
