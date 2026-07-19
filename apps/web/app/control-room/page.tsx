"use client";
/**
 * Finality Control Room — a recorded run, replayed on real timestamps.
 * The room is organized around the ConvergingRails: two lanes, one seal.
 * Every lit node corresponds to a real RelayEvent; simulated legs carry
 * dashed seals.
 */
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { RunEvent } from "@proofline/event-model";
import { EXPLAIN } from "@proofline/event-model";
import { RunProvider, useRun } from "@/lib/run-engine";
import { Plate, PlateHead, SectionIndex, Hex, StampSim, StampReal } from "@/components/chrome";
import { ConvergingRails } from "@/components/viz/ConvergingRails";
import { SigningRing } from "@/components/viz/SigningRing";
import { MerkleCollapse } from "@/components/viz/MerkleCollapse";
import { SealChain, type SealBlockData } from "@/components/viz/SealChain";
import { IconPause, IconPlay, IconRestart, IconShield, IconExternal } from "@/components/icons";

const TRUST_ROWS: [string, string][] = [
  ["TxLINE", "originates and commits sports data"],
  ["Solana", "executes proof verification"],
  ["Adapter", "normalizes only verified outcomes"],
  ["Wormhole", "authenticates the cross-chain message"],
  ["CRE", "keeps the process running"],
  ["Base Core", "verifies the VAA"],
  ["Market", "applies the result"],
];

const BUILD_NOTES = [
  "Base Sepolia contracts, transactions, and settlement are REAL — verify every hash on BaseScan.",
  "Solana adapter leg is simulated in this build (TxLINE's TxOracle verifier exists only on Solana mainnet); the Anchor program ships as compiling reference source.",
  "Wormhole guardian observation is simulated via a 19-key dev guardian set derived from public strings; Base-side signature verification (ecrecover, 13-of-19) is real.",
  "CRE workflows run in local simulation, not a deployed DON.",
  "The adapter program's upgrade authority is a stated trust assumption — see SECURITY.md.",
];

function Transport() {
  const {
    mode,
    setMode,
    liveAvailable,
    allEvents,
    cursor,
    playing,
    play,
    pause,
    restart,
    scrubTo,
    speed,
    setSpeed,
    boundaryPause,
    setBoundaryPause,
    boundaryNote,
    expert,
    setExpert,
  } = useRun();
  return (
    <Plate>
      <div className="transport">
        <div className="seg" role="tablist" aria-label="mode">
          {(["replay", "inspect", "live"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "on" : ""}
              disabled={m === "live" && !liveAvailable}
              title={m === "live" && !liveAvailable ? "Live mode needs a local coordinator (see README)" : undefined}
              onClick={() => setMode(m)}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        {mode !== "live" && (
          <>
            <button className="btn sm" onClick={playing ? pause : play} aria-label={playing ? "pause" : "play"}>
              {playing ? <IconPause size={13} /> : <IconPlay size={13} />}
              {playing ? "pause" : cursor >= allEvents.length - 1 ? "replay" : "play"}
            </button>
            <button className="btn sm" onClick={restart} aria-label="restart">
              <IconRestart size={13} />
            </button>
            <input
              type="range"
              min={-1}
              max={allEvents.length - 1}
              value={cursor}
              onChange={(e) => scrubTo(Number(e.target.value))}
              aria-label="scrub timeline"
            />
            <span className="tiny mono dim nowrap">
              {cursor + 1}/{allEvents.length}
            </span>
            <div className="seg" aria-label="speed">
              {[1, 2, 4].map((s) => (
                <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
          </>
        )}
        <label className="toggle" title="Auto-pause at each verification boundary">
          <input type="checkbox" checked={boundaryPause} onChange={(e) => setBoundaryPause(e.target.checked)} />
          boundaries
        </label>
        <label className="toggle">
          <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
          expert
        </label>
      </div>
      {mode === "replay" && (
        <p className="tiny faint mt-2 m-0">
          Replay of a recorded execution against Base Sepolia — real timestamps, real transactions.
        </p>
      )}
      {boundaryNote && (
        <div className="codeblock mt-2" style={{ borderColor: "var(--bas)" }}>
          <strong className="hi">Verification boundary.</strong> <span className="dim">{boundaryNote}</span>{" "}
          <button className="btn sm" onClick={play}>continue →</button>
        </div>
      )}
    </Plate>
  );
}

function CreSteps() {
  const { state, events, nowMs } = useRun();
  const { heartbeat, steps } = state;
  const nextIn = heartbeat.nextAt ? Math.max(0, Math.round((heartbeat.nextAt - nowMs) / 1000)) : null;
  const log = events
    .filter((e) => e.event.type !== "HEARTBEAT")
    .slice(-12)
    .map((e) => `${new Date(e.at).toISOString().slice(11, 19)} ${e.event.type}${e.simulated ? " [sim]" : ""}`);
  return (
    <Plate>
      <PlateHead kicker="ORCHESTRATION" title="Chainlink CRE">
        <StampSim>local simulation (no deployed DON) — see README</StampSim>
      </PlateHead>
      <div className="row">
        <motion.span
          key={heartbeat.count}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "var(--bas)",
            display: "inline-block",
          }}
          initial={{ scale: 1, boxShadow: "0 0 0 0 rgba(91,140,255,0.55)" }}
          animate={{
            scale: [1, 1.35, 1],
            boxShadow: [
              "0 0 0 0 rgba(91,140,255,0.55)",
              "0 0 0 10px rgba(91,140,255,0)",
              "0 0 0 0 rgba(91,140,255,0)",
            ],
          }}
          transition={{ duration: 0.9 }}
          aria-hidden
        />
        <span className="small mono dim">
          {heartbeat.count === 0 ? (
            "no heartbeat yet"
          ) : (
            <>
              heartbeat #{heartbeat.count}
              {nextIn !== null && (
                <>
                  {" "}
                  · next in {String(Math.floor(nextIn / 60)).padStart(2, "0")}:
                  {String(nextIn % 60).padStart(2, "0")}
                </>
              )}
              {" · last run ✓"}
            </>
          )}
        </span>
      </div>
      <ol className="gates mt-2">
        {steps.map((s) => (
          <li key={s.id} className={s.state === "done" ? "pass" : s.state === "failed" ? "fail" : s.state === "active" ? "" : "skipped"}>
            <span className="gno">{String(s.id).padStart(2, "0")}</span>
            <span>
              {s.label}
              <span className="tiny faint"> — {s.state}</span>
            </span>
          </li>
        ))}
      </ol>
      {log.length > 0 && (
        <div className="codeblock mt-2 tiny" style={{ maxHeight: 120, overflowY: "auto" }}>
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </Plate>
  );
}

function DerivationCascade() {
  const { manifest, state } = useRun();
  const d = manifest?.derivation;
  if (!d) return null;
  const rows: { label: string; formula: string; value: string; revealed: boolean; pending: string }[] = [
    {
      label: "proof bundle hash",
      formula: "keccak256(canonical evidence bundle)",
      value: d.proofBundleHash,
      revealed: !!state.proof,
      pending: "awaiting TxLINE proof",
    },
    {
      label: "validation instruction hash",
      formula: "keccak256(program ‖ root PDA ‖ ix data)",
      value: d.validationInstructionHash,
      revealed: !!state.level4.verifiedSlot,
      pending: "awaiting Solana verification",
    },
    {
      label: "attestation id",
      formula: "keccak256(domain ‖ emitter ‖ fixture ‖ seq ‖ hashes)",
      value: d.attestationId,
      revealed: state.finality === "DualFinalized",
      pending: "derived independently by both lanes",
    },
  ];
  return (
    <Plate>
      <PlateHead kicker="DERIVATION" title="Proof path">
        <StampReal>REAL keccak256</StampReal>
      </PlateHead>
      <div className="stack-sm">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={false}
            animate={{ opacity: r.revealed ? 1 : 0.45 }}
            transition={{ duration: 0.35 }}
          >
            <div className="tiny faint mono mb-1">
              {r.label} — {r.formula}
            </div>
            {r.revealed ? (
              <Hex value={r.value} label={r.label} />
            ) : (
              <span className="tiny faint mono">{r.pending}</span>
            )}
            {i < rows.length - 1 && (
              <div className="faint mono tiny" style={{ paddingLeft: 12, lineHeight: 1.2 }}>
                ↓
              </div>
            )}
          </motion.div>
        ))}
      </div>
      <p className="tiny faint mt-2 m-0">
        Values reproduce the conformance vector byte-for-byte; the Base contracts derive the same
        attestation id on-chain from the VAA payload.
      </p>
    </Plate>
  );
}

function Artifacts() {
  const { manifest } = useRun();
  const [open, setOpen] = useState(false);
  if (!manifest) return null;
  const d = manifest.derivation;
  const c = manifest.contracts;
  const contracts: [string, string][] = [
    ["FinalityRegistry", c.finalityRegistry],
    ["CRELevel3Receiver", c.creLevel3Receiver],
    ["WormholeOutcomeReceiver", c.wormholeOutcomeReceiver],
    ["DemoPredictionMarket", c.demoPredictionMarket],
    ["WormholeCore (dev set)", c.wormholeCore],
  ];
  return (
    <Plate>
      <button className="row" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="kicker">ARTIFACTS</span>
        <strong className="small" style={{ letterSpacing: "0.14em" }}>
          RUN EVIDENCE {open ? "▾" : "▸"}
        </strong>
      </button>
      {open && (
        <div className="stack mt-2">
          {d && (
            <dl className="kv">
              <div className="row"><dt>payload (176 B)</dt><dd><Hex value={d.payloadHex} label="payload hex" /></dd></div>
              <div className="row"><dt>VAA hash</dt><dd>{d.vaaHash ? <Hex value={d.vaaHash} label="vaa hash" /> : "—"}</dd></div>
              <div className="row"><dt>signed VAA</dt><dd>{d.vaaHex ? <Hex value={d.vaaHex} head={14} label="vaa hex" /> : "—"}</dd></div>
              <div className="row"><dt>emitter (32 B)</dt><dd><Hex value={d.sourceEmitter} label="emitter" /></dd></div>
              <div className="row"><dt>domain sep</dt><dd><Hex value={d.domainSeparator} label="domain separator" /></dd></div>
            </dl>
          )}
          <div>
            <div className="tiny faint mb-1">artifacts in this run</div>
            <ul className="small dim m-0" style={{ paddingLeft: 18 }}>
              {Object.entries(manifest.artifacts).map(([file, desc]) => (
                <li key={file}>
                  <span className="mono">{file}</span> — {desc}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="tiny faint mb-1">Base Sepolia contracts (REAL — chain id {c.chainId})</div>
            <ul className="small m-0" style={{ paddingLeft: 0, listStyle: "none" }}>
              {contracts.map(([name, addr]) => (
                <li key={name} className="row" style={{ gap: 8 }}>
                  <span className="dim" style={{ minWidth: 160 }}>{name}</span>
                  <a className="mono tiny" href={`${c.explorerBaseUrl}/address/${addr}`} target="_blank" rel="noreferrer">
                    {addr.slice(0, 10)}…{addr.slice(-6)} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Plate>
  );
}

function EventDrawer({ ev, onClose }: { ev: RunEvent; onClose: () => void }) {
  const { manifest, expert } = useRun();
  const e = ev.event as Record<string, unknown> & { type: RunEvent["event"]["type"] };
  const txHash = typeof e.txHash === "string" ? e.txHash : null;
  const explorer = manifest?.contracts.explorerBaseUrl;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <motion.aside
        className="drawer"
        role="dialog"
        aria-label="Evidence"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong className="mono small" style={{ letterSpacing: "0.12em" }}>
            {e.type.replaceAll("_", " ")}
          </strong>
          <button className="btn sm" onClick={onClose} aria-label="close drawer">✕</button>
        </div>
        <p className="small dim">{EXPLAIN[e.type]}</p>
        {ev.simulated && (
          <p>
            <StampSim>simulated leg</StampSim>{" "}
            <span className="tiny faint">no real network transaction exists for this event</span>
          </p>
        )}
        <dl className="kv mt-2">
          <div className="row"><dt>seq</dt><dd>{ev.seq}</dd></div>
          <div className="row"><dt>at</dt><dd>{new Date(ev.at).toISOString()}</dd></div>
          {Object.entries(e)
            .filter(([k]) => k !== "type")
            .map(([k, v]) => (
              <div key={k} className="row">
                <dt>{k}</dt>
                <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
              </div>
            ))}
        </dl>
        {txHash && !ev.simulated && explorer && (
          <p className="mt-3">
            <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noreferrer" className="btn sm">
              view on BaseScan <IconExternal size={12} />
            </a>
          </p>
        )}
        {!expert && (
          <p className="tiny faint mt-3">Switch to Expert mode for raw program ids, PDAs, and payload bytes.</p>
        )}
      </motion.aside>
    </>
  );
}

function TrustOverlay({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <motion.div
        className="drawer"
        role="dialog"
        aria-label="Trust map"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong className="mono small" style={{ letterSpacing: "0.12em" }}>WHY SHOULD I TRUST THIS?</strong>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <table className="tbl mt-2">
          <tbody>
            {TRUST_ROWS.map(([k, v]) => (
              <tr key={k}>
                <td className="mono nowrap">{k}</td>
                <td className="dim">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small dim mt-3">
          <strong className="hi">CRE provides liveness. TxLINE, Solana, and Wormhole provide correctness.</strong>{" "}
          A relayer can delay an outcome, but it cannot change one. A proof uploader can submit
          arbitrary bytes, but the Solana adapter emits only after TxLINE&apos;s canonical verifier
          returns true. Base accepts only a valid Wormhole VAA from the registered emitter.
        </p>
        <p className="small dim">
          What a verified proof establishes: <em>this exact value was included in the dataset
          TxODDS committed to Solana</em>. It does not establish that the value is unquestionably
          what happened in the physical match — TxODDS remains the originating oracle. Tamper-evident,
          not &quot;trustless sports truth.&quot;
        </p>
        <div className="kicker mt-3 mb-1">THIS BUILD&apos;S TRUST ASSUMPTIONS</div>
        <ul className="small dim m-0" style={{ paddingLeft: 18 }}>
          {BUILD_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </motion.div>
    </>
  );
}

function Room() {
  const { manifest, state, events, mode } = useRun();
  const [selected, setSelected] = useState<number | null>(null);
  const [trustOpen, setTrustOpen] = useState(false);

  if (!manifest) {
    return (
      <div className="shell">
        <Plate className="mt-4">
          <PlateHead title="No recorded run available" />
          <p className="dim small m-0">
            The control room replays recorded executions from <code>evidence/runs/</code>. Run{" "}
            <code>pnpm --filter @proofline/relay-cli capture-run</code> to produce one.
          </p>
        </Plate>
      </div>
    );
  }

  const f = manifest.fixture;
  const selectedEvent = selected !== null ? events.find((e) => e.seq === selected) : undefined;

  const blocks: SealBlockData[] = events
    .filter((e) => e.event.type !== "HEARTBEAT")
    .map((e) => ({
      key: String(e.seq),
      top: new Date(e.at).toISOString().slice(11, 19),
      name: e.event.type.toLowerCase().replaceAll("_", " "),
      sim: e.simulated,
      selected: selected === e.seq,
      onClick: () => setSelected(e.seq),
    }));

  return (
    <div className="shell wide">
      <div className="score-hero">
        <span className="teams">
          {f.participant1} <span className="num">{f.participant1Score}</span>
          <span className="vs"> — </span>
          <span className="num">{f.participant2Score}</span> {f.participant2}
        </span>
        <span className="final-tag">FINAL</span>
        {f.synthetic && <StampSim>synthetic fixture</StampSim>}
        <span className="spacer" />
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
        <button className="btn sm" onClick={() => setTrustOpen(true)}>
          <IconShield size={13} /> Why should I trust this?
        </button>
      </div>

      <div className="mt-3">
        <Transport />
      </div>

      <div className="sec">
        <SectionIndex no="01" title="The race — two lanes, one digest" />
        <Plate>
          <ConvergingRails state={state} simulatedLegs={manifest.simulatedLegs} />
        </Plate>
      </div>

      <div className="sec">
        <SectionIndex no="02" title="The machinery" />
        <div className="room">
          <div className="stack">
            <Plate>
              <PlateHead kicker="COMMITMENT" title="TxLINE Merkle proof" />
              <MerkleCollapse
                state={state}
                simulated={f.synthetic}
                leafValues={[
                  String(f.participant1Score),
                  String(f.participant2Score),
                  String(f.period),
                ]}
              />
            </Plate>
            <Plate>
              <PlateHead kicker="SEQUENCE" title="Evidence chain" />
              <SealChain blocks={blocks} />
            </Plate>
          </div>
          <div className="stack">
            <Plate>
              <PlateHead kicker="QUORUM" title="Wormhole guardians" />
              <SigningRing
                signatures={state.level4.guardianSignatures}
                replayMode={mode === "replay"}
                devSet={manifest.contracts.wormholeCoreKind === "dev-guardian-set-mock"}
              />
              {state.level4.vaaHash && (
                <div className="codeblock tiny mt-2">
                  <div>Fixture {f.fixtureId}</div>
                  <div>
                    {f.participant1} {f.participant1Score}–{f.participant2Score} {f.participant2}
                  </div>
                  <div className="faint">Payload {state.level4.vaaHash.slice(0, 10)}…</div>
                  <div className="faint">Emitter sequence {state.level4.wormholeSequence}</div>
                </div>
              )}
            </Plate>
            <CreSteps />
            <DerivationCascade />
            <Artifacts />
          </div>
        </div>
      </div>

      <CaptionStrip />

      <AnimatePresence>
        {selectedEvent && <EventDrawer ev={selectedEvent} onClose={() => setSelected(null)} />}
        {trustOpen && <TrustOverlay onClose={() => setTrustOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

function CaptionStrip() {
  const { events, expert } = useRun();
  if (expert) return null;
  const last = [...events].reverse().find((e) => e.event.type !== "HEARTBEAT");
  return (
    <div className="caption-strip">
      {last ? (
        <>
          {EXPLAIN[last.event.type]}
          {last.simulated && <span className="stamp sim" style={{ marginLeft: 8 }}>simulated leg</span>}
        </>
      ) : (
        <>
          Press play: TxLINE committed the score to Solana. Our Solana program checked the proof.
          Wormhole Guardians signed the message. Base verified their signatures. The market can now
          settle.
        </>
      )}
    </div>
  );
}

export default function ControlRoomPage() {
  return (
    <RunProvider>
      <Room />
    </RunProvider>
  );
}
