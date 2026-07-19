"use client";
/**
 * Tamper Lab — "try to forge it." Replay-only, controlled panel: each forgery
 * scenario is verified in-browser with the same math the Base contract runs;
 * the contract's ACTUAL error names are shown.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { buildScenarios, verifyLikeBase, type Scenario, type Verdict } from "@/lib/tamper";
import { demoManifest, deployment, shortHex } from "@/lib/demo-data";
import { CopyHex } from "@/components/CopyHex";

function CheckList({ verdict }: { verdict: Verdict }) {
  return (
    <ol className="checkorder">
      {verdict.checks.map((c) => (
        <li key={c.label} className={c.status}>
          <span className="step-dot" aria-hidden>
            {c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "·"}
          </span>
          <span>
            {c.label}
            {c.detail && <span className="tiny faint mono"> — {c.detail}</span>}
            {c.status === "skipped" && <span className="tiny faint"> (not reached)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ScenarioCard({ s }: { s: Scenario }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [running, setRunning] = useState(false);
  const attempt = async () => {
    setRunning(true);
    setVerdict(null);
    // yield a frame so the button state paints before the crypto runs
    await new Promise((r) => setTimeout(r, 30));
    setVerdict(await verifyLikeBase(s.vaaBytes, s.consumedVaaHashes));
    setRunning(false);
  };
  return (
    <div className={`panel tamper ${verdict ? (verdict.accepted ? "accepted" : "rejected") : ""}`}>
      <h3>{s.title} {s.happy && <span className="chip ok sm">happy path</span>}</h3>
      <p className="small dim mb-2">{s.summary}</p>
      <p className="tiny faint mono mb-3">
        {s.mutation} · VAA {s.vaaBytes.length} bytes
      </p>
      <button className="ctl" onClick={attempt} disabled={running}>
        {running ? "verifying…" : s.happy ? "▶ Submit VAA" : "▶ Attempt forged relay"}
      </button>
      <AnimatePresence>
        {verdict && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
            <div className={`verdict ${verdict.accepted ? "ok" : "bad"}`} role="status">
              {verdict.accepted ? "ACCEPTED ✓" : "REJECTED ✕"}
              {verdict.contractError && (
                <span className="mono small ml-2">
                  revert {verdict.contractError}
                </span>
              )}
            </div>
            <CheckList verdict={verdict} />
            {verdict.accepted && verdict.attestationId && (
              <div className="small dim mt-2">
                attestation id derived on-chain:{" "}
                <CopyHex value={verdict.attestationId} label="attestation id" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TamperLabPage() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    buildScenarios().then(setScenarios).catch((e) => setErr(String(e)));
  }, []);
  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand">
          PROOF<span>LINE</span>
        </Link>
        <span className="small dim">Tamper Lab — try to forge a result</span>
        <div className="spacer" />
        <nav className="small navlinks">
          <Link href="/control-room">Control room</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href={`/matches/${demoManifest.fixture.fixtureId}`}>Match</Link>
        </nav>
      </div>

      <div className="panel mt-4">
        <h3>How this panel works — and what is real</h3>
        <p className="small dim m-0">
          Every scenario below builds real VAA bytes and verifies them <strong>with the same math
          the Base contract runs</strong> — signature recovery (ecrecover), 13-of-19 quorum,
          registered-emitter, payload codec, and replay checks mirror{" "}
          <span className="mono">WormholeOutcomeReceiver.sol</span> check-for-check, in order, and
          the failing check&apos;s <strong>actual Solidity error name</strong> is shown. Signatures
          come from the <span className="badge-sim">dev guardian set</span> (19 publicly re-derivable
          keys standing in for Wormhole&apos;s guardian network, since this build&apos;s Solana leg
          is simulated) — the verification cryptography itself is real secp256k1. Registered
          emitter on Base:{" "}
          <a href={`${deployment.explorerBaseUrl}/address/${deployment.contracts.wormholeOutcomeReceiver}`} target="_blank" rel="noreferrer" className="mono">
            {shortHex(deployment.contracts.wormholeOutcomeReceiver)} ↗
          </a>
        </p>
      </div>

      <div className="scoreline sub">
        <span className="teams sub">
          Original score <span className="score">2–1</span>
          <span className="dim"> · can you make Base believe </span>
          <span className="text-fail">3–1</span>
          <span className="dim">?</span>
        </span>
      </div>

      {err && <div className="panel"><p className="small text-fail">{err}</p></div>}
      {!scenarios && !err && (
        <div className="panel"><p className="small dim">Deriving dev guardian keys and signing scenario VAAs in your browser…</p></div>
      )}
      {scenarios && (
        <div className="tamper-grid">
          {scenarios.map((s) => (
            <ScenarioCard key={s.id} s={s} />
          ))}
        </div>
      )}

      <p className="tiny faint mt-4">
        A relayer can delay an outcome, but it cannot change one. A proof uploader can submit
        arbitrary bytes, but the Solana adapter emits only after TxLINE&apos;s canonical verifier
        returns true. Base accepts only a valid Wormhole VAA from the registered emitter.
      </p>
    </div>
  );
}
