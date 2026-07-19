"use client";
import { useState } from "react";
import Link from "next/link";
import { RunProvider, useRun } from "@/lib/run-engine";
import { TopBar } from "@/components/TopBar";
import { ReplayBar } from "@/components/ReplayBar";
import { Caption } from "@/components/Caption";
import { ProofDerivation } from "@/components/ProofDerivation";
import { ArtifactsPanel } from "@/components/ArtifactsPanel";
import { CreControlBox, LanesRace, StatusChips, TrustMap } from "@proofline/ui/control-room";
import { GuardianRing } from "@proofline/ui/guardian-ring";
import { MerklePath } from "@proofline/ui/proof-path";
import { BaseGates } from "@proofline/ui/chain-column";
import { EvidenceDrawer, EvidenceTimeline } from "@proofline/ui/evidence-drawer";

function Room() {
  const { manifest, state, events, mode, expert, nowMs } = useRun();
  const [selected, setSelected] = useState<number | null>(null);
  const [trustOpen, setTrustOpen] = useState(false);

  if (!manifest) {
    return (
      <div className="panel" style={{ marginTop: 20 }}>
        <h3>No recorded run available</h3>
        <p className="dim small">
          The control room replays recorded executions from <code>evidence/runs/</code>. Run{" "}
          <code>pnpm --filter @proofline/relay-cli capture-run</code> to produce one.
        </p>
      </div>
    );
  }

  const f = manifest.fixture;
  const explorer = manifest.contracts.explorerBaseUrl;
  const selectedEvent = selected !== null ? events.find((e) => e.seq === selected) : undefined;
  const log = events
    .filter((e) => e.event.type !== "HEARTBEAT")
    .slice(-24)
    .map((e) => `${new Date(e.at).toISOString().slice(11, 19)} ${e.event.type}${e.simulated ? " [sim]" : ""}`);

  return (
    <>
      <div className="scoreline">
        <span className="teams">
          {f.participant1} <span className="score">{f.participant1Score}</span>
          <span className="dim"> — </span>
          <span className="score">{f.participant2Score}</span> {f.participant2}
        </span>
        <span className="final-tag">FINAL</span>
        {f.synthetic && <span className="badge-sim">synthetic fixture</span>}
        <span style={{ flex: 1 }} />
        <span className="mono tiny dim">
          Attestation{" "}
          {state.attestationId ? (
            <Link href={`/attestations/${state.attestationId}`}>
              {state.attestationId.slice(0, 10)}…{state.attestationId.slice(-6)}
            </Link>
          ) : (
            "pending"
          )}
        </span>
        <button className="ctl" onClick={() => setTrustOpen(true)}>Why should I trust this?</button>
      </div>
      <StatusChips state={state} />
      <ReplayBar />
      <div className="room">
        <div className="stack">
          <LanesRace state={state} simulatedLegs={manifest.simulatedLegs} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <MerklePath state={state} expert={expert} simulated={f.synthetic} />
            <div className="panel">
              <h3>Wormhole guardians</h3>
              <GuardianRing
                signatures={state.level4.guardianSignatures}
                awaiting={!state.level4.vaaHash}
                replayMode={mode === "replay"}
                devSet={manifest.contracts.wormholeCoreKind === "dev-guardian-set-mock"}
              />
              {state.level4.vaaHash && (
                <div className="inset mono tiny" style={{ marginTop: 10 }}>
                  <div>Fixture {f.fixtureId}</div>
                  <div>
                    {f.participant1} {f.participant1Score}–{f.participant2Score} {f.participant2}
                  </div>
                  <div className="dim">Payload {state.level4.vaaHash.slice(0, 10)}…</div>
                  <div className="dim">Emitter sequence {state.level4.wormholeSequence}</div>
                </div>
              )}
            </div>
          </div>
          <EvidenceTimeline events={events} selectedSeq={selected} onSelect={setSelected} />
        </div>
        <div className="stack">
          <CreControlBox
            state={state}
            workflowMode="local simulation (no deployed DON) — see README"
            log={log}
            nowMs={nowMs}
          />
          <BaseGates state={state} explorer={explorer} />
          {manifest.derivation && <ProofDerivation derivation={manifest.derivation} state={state} />}
          <ArtifactsPanel manifest={manifest} />
        </div>
      </div>
      <Caption />
      {selectedEvent && (
        <EvidenceDrawer
          runEvent={selectedEvent}
          expert={expert}
          explorerBaseUrl={explorer}
          onClose={() => setSelected(null)}
        />
      )}
      {trustOpen && (
        <TrustMap
          onClose={() => setTrustOpen(false)}
          buildNotes={[
            "Base Sepolia contracts, transactions, and settlement are REAL — verify every hash on BaseScan.",
            "Solana adapter leg is simulated in this build (TxLINE's TxOracle verifier exists only on Solana mainnet); the Anchor program ships as compiling reference source.",
            "Wormhole guardian observation is simulated via a 19-key dev guardian set derived from public strings; Base-side signature verification (ecrecover, 13-of-19) is real.",
            "CRE workflows run in local simulation, not a deployed DON.",
            "The adapter program's upgrade authority is a stated trust assumption — see SECURITY.md.",
          ]}
        />
      )}
    </>
  );
}

export default function ControlRoomPage() {
  return (
    <RunProvider>
      <div className="shell">
        <TopBar />
        <Room />
      </div>
    </RunProvider>
  );
}
