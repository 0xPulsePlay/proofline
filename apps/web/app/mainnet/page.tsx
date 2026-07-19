"use client";
/**
 * Solana Mainnet — the evidence exhibit. Formal cryptographic evidence
 * presented as a self-explaining archival show: the sealed transaction
 * chain, the proof path that draws itself, the bound digests.
 *
 * TRUST WORDING IS FIXED (docs/codex-mainnet-review.md): real TxLINE data,
 * client-verified by TxLINE's deployed mainnet verifier against its real
 * mainnet root, then immutably attested by Proofline on Solana mainnet.
 * This page never claims "verified on-chain by Proofline" for the memo path.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Hex, Plate, PlateHead, SectionIndex, Reveal } from "@/components/chrome";
import { SealChain, type SealBlockData } from "@/components/viz/SealChain";
import { IconCheck, IconExternal, IconSeal } from "@/components/icons";

interface RootRead {
  endpoint: string;
  pda: string;
  slot: number;
  owner: string;
  dataSha256: string;
}
interface ViewResult {
  endpoint: string;
  slot: number;
  returned: boolean;
}
interface Manifest {
  mode: string;
  fixtureId: string;
  seq: number;
  result: string;
  stats: Array<{ key: number; value: number; period: number }>;
  proofTsMs: number;
  rootPda: string;
  rootReads: RootRead[];
  views: ViewResult[];
  ixHash: string;
  bundleHash: string;
  txlineProgram: string;
  txlineIdlCommit: string;
  trustWording: string;
}
interface MemoPreview {
  memo: string;
  attestationId: string;
  signer: string;
  feeLamports: number;
}
interface RunEntry {
  id: string;
  label: string;
  manifest: string;
  memoPreview?: string;
  broadcast?: string;
}
interface Broadcast {
  signature: string;
}
interface D2Evidence {
  program: { id: string; soBytes: number; upgradeAuthority: string; programDataAddress?: string };
  transactions: {
    deploy: { signature: string; slot: number };
    initializeConfig?: { signature: string; slot: number };
    verifyOutcome: { signature: string; slot: number; computeUnitsConsumed: number | null; txlineReturnBase64: string };
  };
  accounts: { verifiedOutcomePda: string; dailyRoot: string; txlineProgram: string; configPda?: string };
  verifiedOutcome: {
    fixtureId: string;
    participant1Score: number;
    participant2Score: number;
    period: number;
    result: number;
    proofBundleHash: string;
    validationInstructionHash: string;
  };
  explorer: { deploy: string; verifyOutcome: string; program: string; verifiedOutcome: string; initializeConfig?: string };
}

/** The verification moment: proof path drawing itself to the TRUE stamp. */
function ProofPathDraw({ bundle, ix, root }: { bundle: string; ix: string; root: string }) {
  const reduced = useReducedMotion();
  const nodes = [
    { y: 30, label: "Merkle proof bundle", value: bundle, color: "var(--txl)" },
    { y: 105, label: "validation instruction", value: ix, color: "var(--vio)" },
    { y: 180, label: "mainnet daily root", value: root, color: "var(--sol)" },
  ];
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox="0 0 720 240" style={{ width: "100%", minWidth: 520, height: "auto" }} role="img" aria-label="Proof path: bundle hash to instruction hash to daily root, verified true">
        {nodes.map((n, i) => (
          <g key={n.label}>
            {i > 0 && (
              <motion.line
                x1={110}
                y1={nodes[i - 1].y + 16}
                x2={110}
                y2={n.y - 16}
                stroke="var(--hair-2)"
                strokeWidth={1.5}
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : i * 0.45 }}
              />
            )}
            <motion.rect
              x={30}
              y={n.y - 16}
              width={160}
              height={32}
              rx={4}
              fill="var(--ink)"
              stroke={n.color}
              strokeWidth={1.2}
              initial={reduced ? false : { opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 160, damping: 16, delay: reduced ? 0 : i * 0.45 }}
              style={{ transformOrigin: `110px ${n.y}px` }}
            />
            <text x={110} y={n.y - 2} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--dim)">
              {n.label}
            </text>
            <text x={110} y={n.y + 11} textAnchor="middle" fontSize={8.5} fontFamily="var(--mono)" fill="var(--faint)">
              {n.value.slice(0, 14)}…
            </text>
            <motion.text
              x={210}
              y={n.y + 4}
              fontSize={9.5}
              fontFamily="var(--mono)"
              fill="var(--faint)"
              initial={reduced ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: reduced ? 0 : i * 0.45 + 0.25 }}
            >
              {i === 0 ? "sha256 · raw TxLINE proof response" : i === 1 ? "CPI → TxOracle.validate_stat_v2" : "read-only .view · finalized commitment"}
            </motion.text>
          </g>
        ))}
        <motion.g
          initial={reduced ? false : { opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: reduced ? 0 : 3 * 0.45 }}
          style={{ transformOrigin: "110px 216px" }}
        >
          <circle cx={110} cy={216} r={14} fill="var(--sol-dim)" stroke="var(--sol)" strokeWidth={1.5} />
          <text x={110} y={220} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fontWeight={700} fill="var(--sol)">
            T
          </text>
          <text x={136} y={220} fontSize={10} fontFamily="var(--mono)" fill="var(--sol)" letterSpacing={1.5}>
            RETURNED EXACT true
          </text>
        </motion.g>
      </svg>
    </div>
  );
}

function LedgerRow({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="mono hexwrap" style={{ fontSize: 12 }}>
            {v} <IconExternal size={11} style={{ verticalAlign: "-1px" }} />
          </a>
        ) : (
          <span className="mono hexwrap" style={{ fontSize: 12 }}>{v}</span>
        )}
      </dd>
    </div>
  );
}

export default function MainnetPage() {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [d2, setD2] = useState<D2Evidence | null>(null);
  const [data, setData] = useState<
    Record<string, { manifest: Manifest; memo?: MemoPreview; broadcast?: Broadcast }>
  >({});

  useEffect(() => {
    fetch("/mainnet/index.json")
      .then((r) => r.json())
      .then(async (idx: { runs: RunEntry[] }) => {
        setRuns(idx.runs);
        const out: Record<string, { manifest: Manifest; memo?: MemoPreview; broadcast?: Broadcast }> = {};
        for (const run of idx.runs) {
          const manifest = (await fetch(run.manifest).then((r) => r.json())) as Manifest;
          let memo: MemoPreview | undefined;
          let broadcast: Broadcast | undefined;
          if (run.memoPreview)
            memo = await fetch(run.memoPreview).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined);
          if (run.broadcast)
            broadcast = await fetch(run.broadcast).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined);
          out[run.id] = { manifest, memo, broadcast };
        }
        setData(out);
      })
      .catch(() => setRuns([]));
    fetch("/mainnet/d2-mainnet.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setD2)
      .catch(() => setD2(null));
  }, []);

  const txBlocks: SealBlockData[] = d2
    ? [
        {
          key: "deploy",
          top: `slot ${d2.transactions.deploy.slot}`,
          name: "deploy program",
          sub: `${d2.transactions.deploy.signature.slice(0, 16)}…`,
          href: d2.explorer.deploy,
        },
        ...(d2.transactions.initializeConfig
          ? [
              {
                key: "init",
                top: `slot ${d2.transactions.initializeConfig.slot}`,
                name: "initialize config",
                sub: `${d2.transactions.initializeConfig.signature.slice(0, 16)}…`,
                href: d2.explorer.initializeConfig,
              } satisfies SealBlockData,
            ]
          : []),
        {
          key: "verify",
          top: `slot ${d2.transactions.verifyOutcome.slot}`,
          name: "verify_outcome → TRUE",
          sub: `${d2.transactions.verifyOutcome.signature.slice(0, 16)}…`,
          href: d2.explorer.verifyOutcome,
        },
      ]
    : [];

  return (
    <div className="shell">
      <section style={{ padding: "30px 0 0" }}>
        <Reveal>
          <div className="row mb-2">
            <span className="glyph dim"><IconSeal size={22} /></span>
            <span className="stamp real">SOLANA MAINNET</span>
          </div>
          <h1 className="display" style={{ fontSize: "clamp(32px, 5.4vw, 56px)" }}>
            The mainnet <span className="hl">evidence exhibit.</span>
          </h1>
          <p className="lede mt-2" style={{ fontSize: 15.5 }}>
            Solana mainnet evidence — client-verified + memo-anchored, plus a deployed program that
            executed verification as a real transaction.
          </p>
        </Reveal>
      </section>

      <div className="sec">
        <SectionIndex no="01" title="What this evidence is (and is not)" />
        <Reveal>
          <Plate>
            <p className="small dim m-0" style={{ fontSize: 14, lineHeight: 1.65 }}>
              <strong className="hi">
                Real TxLINE data, client-verified by TxLINE&apos;s deployed mainnet verifier against
                its real mainnet root, then immutably attested by Proofline on Solana mainnet
              </strong>{" "}
              — a signed Memo transaction binding the proof-bundle and instruction digests. The Memo
              program does not execute the verification: every claim below is independently
              reproducible by re-running the deployed TxLINE program against the published evidence
              bundle. This is client-verified + memo-anchored — <em>not</em> &quot;verified on-chain
              by Proofline.&quot;
            </p>
          </Plate>
        </Reveal>
      </div>

      {d2 && (
        <div className="sec">
          <SectionIndex no="02" title="Deployed program — on-chain verification" />
          <Reveal>
            <Plate glow="sol">
              <PlateHead kicker="EXHIBIT A" title="verify_outcome, executed on mainnet">
                <span className="stamp real">SOLANA MAINNET</span>
              </PlateHead>
              <p className="small dim panel-intro">
                The Proofline adapter program is <strong className="hi">deployed on
                Solana mainnet</strong> and executed <code className="mono">verify_outcome</code> as
                a real transaction: a CPI into the deployed TxLINE program verified the Merkle
                proof against the real mainnet daily root and returned exact{" "}
                <code className="mono">true</code> — this leg IS on-chain verification, distinct
                from the memo path below.
              </p>

              <ProofPathDraw
                bundle={`0x${d2.verifiedOutcome.proofBundleHash}`}
                ix={`0x${d2.verifiedOutcome.validationInstructionHash}`}
                root={d2.accounts.dailyRoot}
              />

              <div className="kicker mt-3 mb-1">THE SEALED CHAIN — EVERY TRANSACTION, EXPLORER-LINKED</div>
              <SealChain blocks={txBlocks} />

              <div className="grid-2 mt-3">
                <dl className="kv">
                  <LedgerRow k="program" v={d2.program.id} href={d2.explorer.program} />
                  <LedgerRow k="program size" v={`${d2.program.soBytes} bytes`} />
                  <LedgerRow k="upgrade authority" v={d2.program.upgradeAuthority} />
                  {d2.program.programDataAddress && (
                    <LedgerRow k="program data" v={d2.program.programDataAddress} />
                  )}
                  <LedgerRow k="TxLINE program" v={d2.accounts.txlineProgram} />
                </dl>
                <dl className="kv">
                  <LedgerRow k="verify_outcome tx" v={d2.transactions.verifyOutcome.signature} href={d2.explorer.verifyOutcome} />
                  <LedgerRow k="slot" v={String(d2.transactions.verifyOutcome.slot)} />
                  <LedgerRow k="compute units" v={`${d2.transactions.verifyOutcome.computeUnitsConsumed} CU`} />
                  <LedgerRow k="TxLINE return" v={`true (base64 ${d2.transactions.verifyOutcome.txlineReturnBase64})`} />
                  <LedgerRow k="VerifiedOutcome PDA" v={d2.accounts.verifiedOutcomePda} href={d2.explorer.verifiedOutcome} />
                </dl>
              </div>

              <div className="codeblock tiny mt-3">
                VerifiedOutcome PDA → fixture {d2.verifiedOutcome.fixtureId},{" "}
                {d2.verifiedOutcome.participant1Score}–{d2.verifiedOutcome.participant2Score},
                period {d2.verifiedOutcome.period}, all fields derived from the verified bytes
              </div>
              <div className="stack-sm mt-2">
                <div className="row">
                  <span className="tiny faint mono" style={{ minWidth: 90 }}>bundle</span>
                  <Hex value={`0x${d2.verifiedOutcome.proofBundleHash}`} label="proof bundle hash" />
                </div>
                <div className="row">
                  <span className="tiny faint mono" style={{ minWidth: 90 }}>instruction</span>
                  <Hex value={`0x${d2.verifiedOutcome.validationInstructionHash}`} label="validation instruction hash" />
                </div>
              </div>
            </Plate>
          </Reveal>
        </div>
      )}

      <div className="sec">
        <SectionIndex no="03" title="The memo path — client-verified + memo-anchored" />
        {runs.length === 0 && (
          <Plate>
            <p className="small dim m-0">No mainnet evidence bundles published yet.</p>
          </Plate>
        )}
        {runs.map((run) => {
          const d = data[run.id];
          if (!d)
            return (
              <Plate key={run.id} className="mb-2">
                <p className="tiny dim m-0">loading {run.label}…</p>
              </Plate>
            );
          const m = d.manifest;
          const scores = m.stats.filter((s) => s.key === 1 || s.key === 2).map((s) => s.value);
          return (
            <Reveal key={run.id}>
              <Plate className="mb-3">
                <PlateHead kicker="EXHIBIT B" title={run.label}>
                  <span className={`stamp ${m.mode === "live-final" ? "real" : "live"}`}>
                    {m.mode === "live-final" ? "LIVE FINAL" : "REHEARSAL"}
                  </span>
                </PlateHead>
                <p className="small dim panel-intro">
                  fixture <span className="mono">{m.fixtureId}</span> · seq {m.seq} · scores{" "}
                  {scores.join("–")} · result <strong className="hi">{m.result}</strong> · proofTs{" "}
                  {new Date(m.proofTsMs).toISOString()}
                </p>
                <p className="small dim">
                  <strong className="hi">{m.trustWording}</strong>
                </p>

                <div className="kicker mb-1">DEPLOYED-VERIFIER RESULTS (READ-ONLY .view, FINALIZED COMMITMENT)</div>
                <div className="stack-sm mb-3">
                  {m.views.map((v) => (
                    <div key={v.endpoint} className="row mono tiny">
                      <span style={{ minWidth: 220 }}>{v.endpoint.replace("https://", "")}</span>
                      <span className="faint">slot {v.slot}</span>
                      {v.returned ? (
                        <span className="stamp real"><IconCheck size={10} /> returned TRUE</span>
                      ) : (
                        <span className="stamp fail">NOT TRUE</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="kicker mb-1">MAINNET DAILY-ROOT ACCOUNT (FINALIZED, BOTH RPCS)</div>
                <dl className="kv mb-3">
                  <LedgerRow k="root PDA" v={m.rootPda} />
                  <LedgerRow k="owner" v="TxLINE program" />
                  <LedgerRow k="data sha256" v={m.rootReads[0]?.dataSha256 ?? ""} />
                </dl>

                <div className="kicker mb-1">BOUND DIGESTS</div>
                <div className="stack-sm mb-3">
                  <div className="row">
                    <span className="tiny faint mono" style={{ minWidth: 150 }}>
                      instruction (pinned IDL <span className="mono">{m.txlineIdlCommit.slice(0, 8)}…</span>)
                    </span>
                    <Hex value={m.ixHash} label="instruction hash" />
                  </div>
                  <div className="row">
                    <span className="tiny faint mono" style={{ minWidth: 150 }}>evidence bundle</span>
                    <Hex value={m.bundleHash} label="bundle hash" />
                  </div>
                  {d.memo && (
                    <div className="row">
                      <span className="tiny faint mono" style={{ minWidth: 150 }}>attestation id</span>
                      <Hex value={d.memo.attestationId} label="attestation id" />
                    </div>
                  )}
                </div>

                {d.memo && (
                  <>
                    <div className="kicker mb-1">
                      MEMO ATTESTATION{" "}
                      {d.broadcast?.signature
                        ? "(BROADCAST, FINALIZED)"
                        : "(BUILT + DRY-RUN VALIDATED; BROADCAST PENDING AUTHORIZATION)"}
                    </div>
                    <div className="codeblock tiny hexwrap mb-2">{d.memo.memo}</div>
                    {d.broadcast?.signature && (
                      <dl className="kv">
                        <LedgerRow
                          k="transaction"
                          v={d.broadcast.signature}
                          href={`https://explorer.solana.com/tx/${d.broadcast.signature}`}
                        />
                      </dl>
                    )}
                    {d.broadcast?.signature && (
                      <p className="tiny mt-2">
                        <a
                          href={`https://explorer.solana.com/tx/${d.broadcast.signature}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View the finalized transaction on Solana Explorer ↗
                        </a>
                      </p>
                    )}
                  </>
                )}
              </Plate>
            </Reveal>
          );
        })}
      </div>

      <div className="sec">
        <SectionIndex no="04" title="Reproduce it yourself" />
        <Plate>
          <p className="tiny dim m-0">
            Reproduce: <code className="mono">pnpm --filter @proofline/mainnet-attestor rehearse</code>{" "}
            — the evidence bundle (raw verbatim proof response, exact instruction bytes, canonical
            strategy, finalisation record) ships in{" "}
            <code className="mono">evidence/mainnet/</code> in the repo.
          </p>
        </Plate>
      </div>
    </div>
  );
}
