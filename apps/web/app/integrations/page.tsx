/**
 * Integrations — "the loom": the TxLINE → Solana → Wormhole → CRE → Base
 * wiring drawn as a circuit that draws itself, plus the deployed-contract
 * ledger (full addresses, explorer links) and the consumer interface.
 */
import { demoManifest, deployment, explorerAddress, explorerTx, shortHex } from "@/lib/demo-data";
import { Plate, PlateHead, SectionIndex, Reveal, StampReal, StampSim } from "@/components/chrome";
import { LoomDiagram } from "@/components/viz/LoomDiagram";

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
      <section style={{ padding: "30px 0 0" }}>
        <h1 className="display" style={{ fontSize: "clamp(32px, 5.4vw, 56px)" }}>
          How the pieces <span className="hl">wire together.</span>
        </h1>
      </section>

      <div className="sec">
        <SectionIndex no="01" title="The loom — five stages, two lanes" />
        <Reveal>
          <Plate>
            <LoomDiagram registeredEmitter={deployment.registeredEmitter} chainId={deployment.chainId} />
            <p className="tiny faint mt-2 m-0">
              Two lanes feed the registry: Level 3 (RPC-quorum fast lane, provisional) and Level 4
              (Wormhole-verified proof lane). Settlement requires both to derive the same
              attestation id.
            </p>
          </Plate>
        </Reveal>
      </div>

      <div className="sec">
        <SectionIndex no="02" title="Deployed contracts — Base Sepolia" />
        <Reveal>
          <Plate>
            <PlateHead title="Contract ledger">
              <StampReal>REAL, verify on BaseScan</StampReal>
            </PlateHead>
            <table className="tbl">
              <thead>
                <tr><th>contract</th><th>address</th><th>role</th></tr>
              </thead>
              <tbody>
                {contractRows.map(([name, key, addr, role]) => (
                  <tr key={name}>
                    <td className="mono small nowrap">{name}</td>
                    <td>
                      <a className="mono tiny hexwrap" href={explorerAddress(addr)} target="_blank" rel="noreferrer">
                        {addr} ↗
                      </a>
                      {deployment.deployTxHashes[key] && (
                        <div className="tiny faint">
                          deploy tx{" "}
                          <a className="mono" href={explorerTx(deployment.deployTxHashes[key])} target="_blank" rel="noreferrer">
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
              <div className="row"><dt>registered emitter</dt><dd>{deployment.registeredEmitter}</dd></div>
              <div className="row"><dt>guardian quorum</dt><dd>{deployment.quorum} of {deployment.guardianSet.length}</dd></div>
              <div className="row"><dt>forwarder (demo EOA)</dt><dd>{deployment.forwarder}</dd></div>
            </dl>
          </Plate>
        </Reveal>
      </div>

      <div className="sec">
        <SectionIndex no="03" title="Consume it from any Base contract" />
        <Reveal>
          <Plate>
            <pre className="codeblock">{`(bool finalized, uint8 result) =
    proofline.finalOutcome(fixtureId);

require(finalized, "Outcome not finalized");
// result: 1 = HOME, 2 = DRAW, 3 = AWAY`}</pre>
            <p className="tiny faint mt-2 m-0">
              Proofline is a reusable cross-chain sports-finality primitive; the demo market is one
              consumer, not the product. Demo fixture:{" "}
              <span className="mono">{demoManifest.fixture.fixtureId}</span>
              {demoManifest.fixture.synthetic && (
                <>
                  {" "}
                  <StampSim>synthetic fixture</StampSim>
                </>
              )}
            </p>
          </Plate>
        </Reveal>
      </div>
    </div>
  );
}
