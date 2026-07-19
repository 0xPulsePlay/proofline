"use client";

/**
 * Solana mainnet evidence — the HYBRID no-deploy attestation path.
 *
 * TRUST WORDING IS FIXED (docs/codex-mainnet-review.md): real TxLINE data,
 * client-verified by TxLINE's deployed mainnet verifier against its real
 * mainnet root, then immutably attested by Proofline on Solana mainnet.
 * This page never claims "verified on-chain by Proofline".
 */
import Link from "next/link";
import { useEffect, useState } from "react";

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

function Hex({ value }: { value: string }) {
  return (
    <code
      className="mono tiny"
      style={{ cursor: "pointer", wordBreak: "break-all" }}
      title="click to copy"
      onClick={() => navigator.clipboard?.writeText(value)}
    >
      {value}
    </code>
  );
}

export default function MainnetPage() {
  const [runs, setRuns] = useState<RunEntry[]>([]);
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
            memo = await fetch(run.memoPreview)
              .then((r) => (r.ok ? r.json() : undefined))
              .catch(() => undefined);
          if (run.broadcast)
            broadcast = await fetch(run.broadcast)
              .then((r) => (r.ok ? r.json() : undefined))
              .catch(() => undefined);
          out[run.id] = { manifest, memo, broadcast };
        }
        setData(out);
      })
      .catch(() => setRuns([]));
  }, []);

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand" style={{ color: "var(--text)" }}>
          PROOF<span>LINE</span>
        </Link>
        <span className="small dim">Solana mainnet evidence — client-verified + memo-anchored</span>
        <div style={{ flex: 1 }} />
        <nav className="small" style={{ display: "flex", gap: 14 }}>
          <Link href="/control-room">Control room</Link>
          <Link href="/tamper-lab">Tamper lab</Link>
          <Link href="/integrations">Integrations</Link>
        </nav>
      </div>

      <div className="panel" style={{ marginTop: 16, maxWidth: 860 }}>
        <h3>What this evidence is (and is not)</h3>
        <p className="small dim" style={{ marginTop: 6 }}>
          <strong style={{ color: "var(--text)" }}>
            Real TxLINE data, client-verified by TxLINE&apos;s deployed mainnet verifier against its
            real mainnet root, then immutably attested by Proofline on Solana mainnet
          </strong>{" "}
          — a signed Memo transaction binding the proof-bundle and instruction digests. The Memo
          program does not execute the verification: every claim below is independently
          reproducible by re-running the deployed TxLINE program against the published evidence
          bundle. This is client-verified + memo-anchored — <em>not</em> &quot;verified on-chain
          by Proofline.&quot;
        </p>
      </div>

      {runs.length === 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="small dim">No mainnet evidence bundles published yet.</p>
        </div>
      )}
      {runs.map((run) => {
        const d = data[run.id];
        if (!d)
          return (
            <div key={run.id} className="panel" style={{ marginTop: 12 }}>
              <p className="tiny dim">loading {run.label}…</p>
            </div>
          );
        const m = d.manifest;
        const scores = m.stats.filter((s) => s.key === 1 || s.key === 2).map((s) => s.value);
        return (
          <div key={run.id} className="panel" style={{ marginTop: 12, maxWidth: 860 }}>
            <h3>
              {run.label}{" "}
              <span className={`chip ${m.mode === "live-final" ? "ok" : "active"}`} style={{ fontSize: 10, marginLeft: 8 }}>
                {m.mode === "live-final" ? "LIVE FINAL" : "REHEARSAL"}
              </span>
            </h3>
            <div className="tiny dim" style={{ margin: "6px 0 10px" }}>
              fixture <span className="mono">{m.fixtureId}</span> · seq {m.seq} · scores {scores.join("–")} · result{" "}
              <strong style={{ color: "var(--text)" }}>{m.result}</strong> · proofTs {new Date(m.proofTsMs).toISOString()}
            </div>

            <div className="tiny dim">Deployed-verifier results (read-only .view, finalized commitment)</div>
            {m.views.map((v) => (
              <div key={v.endpoint} className="tiny mono" style={{ marginTop: 4 }}>
                {v.endpoint.replace("https://", "")} · slot {v.slot} ·{" "}
                {v.returned ? (
                  <span className="chip ok" style={{ fontSize: 10 }}>returned TRUE</span>
                ) : (
                  <span className="chip fail" style={{ fontSize: 10 }}>NOT TRUE</span>
                )}
              </div>
            ))}

            <div className="tiny dim" style={{ marginTop: 10 }}>Mainnet daily-root account (finalized, both RPCs)</div>
            <div className="tiny mono" style={{ marginTop: 4 }}>
              PDA <Hex value={m.rootPda} /> · owner = TxLINE program · data sha256{" "}
              <Hex value={(m.rootReads[0]?.dataSha256 ?? "").slice(0, 24) + "…"} />
            </div>

            <div className="tiny dim" style={{ marginTop: 10 }}>Bound digests</div>
            <div className="tiny" style={{ marginTop: 4 }}>
              instruction (pinned IDL <span className="mono">{m.txlineIdlCommit.slice(0, 8)}…</span>): <Hex value={m.ixHash} />
              <br />
              evidence bundle: <Hex value={m.bundleHash} />
              {d.memo && (
                <>
                  <br />
                  attestation id: <Hex value={d.memo.attestationId} />
                </>
              )}
            </div>

            {d.memo && (
              <>
                <div className="tiny dim" style={{ marginTop: 10 }}>
                  Memo attestation{" "}
                  {d.broadcast?.signature ? "(broadcast, finalized)" : "(built + dry-run validated; broadcast pending authorization)"}
                </div>
                <div
                  className="tiny mono"
                  style={{ wordBreak: "break-all", background: "rgba(255,255,255,0.04)", padding: 8, borderRadius: 6, marginTop: 4 }}
                >
                  {d.memo.memo}
                </div>
                {d.broadcast?.signature && (
                  <p className="tiny" style={{ marginTop: 6 }}>
                    <a href={`https://explorer.solana.com/tx/${d.broadcast.signature}`} target="_blank" rel="noreferrer">
                      View the finalized transaction on Solana Explorer ↗
                    </a>
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      <div className="panel" style={{ marginTop: 12, maxWidth: 860 }}>
        <p className="tiny dim">
          Reproduce: <code className="mono">pnpm --filter @proofline/mainnet-attestor rehearse</code> — the evidence
          bundle (raw verbatim proof response, exact instruction bytes, canonical strategy, finalisation record) ships
          in <code className="mono">evidence/mainnet/</code> in the repo.
        </p>
      </div>
    </div>
  );
}
