"use client";
/**
 * Tamper Lab — "the forge." Replay-only: each forgery scenario is verified
 * in-browser with the same math the Base contract runs; failures slam shut
 * at the exact check, showing the contract's ACTUAL error name.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { buildScenarios, verifyLikeBase, type Scenario, type Verdict } from "@/lib/tamper";
import { demoManifest, deployment, shortHex } from "@/lib/demo-data";
import { Hex, Plate, SectionIndex, StampSim } from "@/components/chrome";
import { IconCheck, IconCross, IconHammer, IconPlay } from "@/components/icons";

function GateCascade({ verdict }: { verdict: Verdict }) {
  const reduced = useReducedMotion();
  return (
    <ol className="gates">
      {verdict.checks.map((c, i) => (
        <motion.li
          key={c.label}
          className={c.status}
          initial={reduced ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.28, delay: reduced ? 0 : i * 0.14 }}
        >
          <span className="gno">
            {c.status === "pass" ? <IconCheck size={11} /> : c.status === "fail" ? <IconCross size={11} /> : `${i + 1}`}
          </span>
          <span>
            {c.label}
            {c.detail && <span className="tiny faint mono"> — {c.detail}</span>}
            {c.status === "skipped" && <span className="tiny faint"> (not reached)</span>}
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

function ForgeCard({ s, index }: { s: Scenario; index: number }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [running, setRunning] = useState(false);
  const reduced = useReducedMotion();
  const attempt = async () => {
    setRunning(true);
    setVerdict(null);
    // yield a frame so the button state paints before the crypto runs
    await new Promise((r) => setTimeout(r, 30));
    setVerdict(await verifyLikeBase(s.vaaBytes, s.consumedVaaHashes));
    setRunning(false);
  };
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: reduced ? 0 : index * 0.07 }}
    >
      <Plate glow={verdict ? (verdict.accepted ? "sol" : "fail") : undefined}>
        <div className="plate-head">
          <span className="kicker">FORGE ATTEMPT {String(index + 1).padStart(2, "0")}</span>
          <h3>{s.title}</h3>
          {s.happy && <span className="stamp real">happy path</span>}
        </div>
        <p className="small dim mb-2">{s.summary}</p>
        <p className="tiny faint mono mb-3">
          {s.mutation} · VAA {s.vaaBytes.length} bytes
        </p>
        <button className="btn" onClick={attempt} disabled={running}>
          {running ? "verifying…" : s.happy ? "Submit VAA" : "Attempt forged relay"}
          {!running && <IconPlay size={13} />}
        </button>
        <AnimatePresence>
          {verdict && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3"
            >
              <motion.div
                className={`verdict-banner ${verdict.accepted ? "ok" : "bad"}`}
                role="status"
                initial={reduced ? false : { scale: 0.96 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
              >
                {verdict.accepted ? "ACCEPTED" : "REJECTED"}
                {verdict.contractError && (
                  <span className="mono small">revert {verdict.contractError}</span>
                )}
              </motion.div>
              <GateCascade verdict={verdict} />
              {verdict.accepted && verdict.attestationId && (
                <div className="small dim mt-2">
                  attestation id derived on-chain:{" "}
                  <Hex value={verdict.attestationId} label="attestation id" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Plate>
    </motion.div>
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
      <section style={{ padding: "30px 0 0" }}>
        <div className="row mb-2">
          <span className="glyph dim"><IconHammer size={22} /></span>
          <span className="stamp sim">replay-only · in-browser verification</span>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(32px, 5.4vw, 56px)" }}>
          Try to <span className="hl">forge</span> a result.
        </h1>
        <div className="score-hero mt-2">
          <span className="teams" style={{ fontSize: "clamp(20px, 3.4vw, 28px)" }}>
            Original score <span className="num">2–1</span>
            <span className="vs"> · can you make Base believe </span>
            <span className="text-fail">3–1</span>
            <span className="vs">?</span>
          </span>
        </div>
      </section>

      <div className="sec">
        <SectionIndex no="01" title="How this panel works — and what is real" />
        <Plate>
          <p className="small dim m-0">
            Every scenario below builds real VAA bytes and verifies them{" "}
            <strong className="hi">with the same math the Base contract runs</strong> — signature
            recovery (ecrecover), 13-of-19 quorum, registered-emitter, payload codec, and replay
            checks mirror <span className="mono">WormholeOutcomeReceiver.sol</span> check-for-check,
            in order, and the failing check&apos;s{" "}
            <strong className="hi">actual Solidity error name</strong> is shown. Signatures come
            from the <StampSim>dev guardian set</StampSim> (19 publicly re-derivable keys standing
            in for Wormhole&apos;s guardian network, since this build&apos;s Solana leg is
            simulated) — the verification cryptography itself is real secp256k1. Registered emitter
            on Base:{" "}
            <a
              href={`${deployment.explorerBaseUrl}/address/${deployment.contracts.wormholeOutcomeReceiver}`}
              target="_blank"
              rel="noreferrer"
              className="mono"
            >
              {shortHex(deployment.contracts.wormholeOutcomeReceiver)} ↗
            </a>
          </p>
        </Plate>
      </div>

      <div className="sec">
        <SectionIndex no="02" title="The attempts" />
        {err && (
          <Plate>
            <p className="small text-fail m-0">{err}</p>
          </Plate>
        )}
        {!scenarios && !err && (
          <Plate>
            <p className="small dim m-0">
              Deriving dev guardian keys and signing scenario VAAs in your browser…
            </p>
          </Plate>
        )}
        {scenarios && (
          <div className="forge-grid">
            {scenarios.map((s, i) => (
              <ForgeCard key={s.id} s={s} index={i} />
            ))}
          </div>
        )}
      </div>

      <p className="tiny faint mt-4">
        A relayer can delay an outcome, but it cannot change one. A proof uploader can submit
        arbitrary bytes, but the Solana adapter emits only after TxLINE&apos;s canonical verifier
        returns true. Base accepts only a valid Wormhole VAA from the registered emitter. Fixture:{" "}
        <Link className="mono" href={`/matches/${demoManifest.fixture.fixtureId}`}>
          {demoManifest.fixture.fixtureId}
        </Link>
        .
      </p>
    </div>
  );
}
