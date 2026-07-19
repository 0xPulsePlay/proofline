"use client";
import { useEffect, useState } from "react";
import { shortHex } from "@/lib/story-data";

interface LiveEntry {
  id: string;
  label: string;
  description: string;
  network: "solana" | "base-mainnet" | "wormhole";
  market?: string;
  status: "pending" | "confirmed";
  txHash: string | null;
  timestampMs: number | null;
  explorerUrl: string | null;
}
interface Rehearsal {
  label: string;
  fixtureId: string;
  network: string;
  l3ReportTx: string;
  vaaImportTx: string;
  status: string;
}
interface LiveFinalData {
  fixture: { id: string; matchup: string; competition: string };
  rehearsal: Rehearsal;
  entries: LiveEntry[];
}

const explorerFor = (network: LiveEntry["network"], hash: string) => {
  if (network === "solana") return `https://explorer.solana.com/tx/${hash}`;
  if (network === "base-mainnet") return `https://basescan.org/tx/${hash}`;
  return undefined;
};

function EntryCard({ entry }: { entry: LiveEntry }) {
  const link = entry.explorerUrl ?? (entry.txHash ? explorerFor(entry.network, entry.txHash) : undefined);
  return (
    <div className={`live-card ${entry.status === "pending" ? "is-pending" : "is-confirmed"}`}>
      <div className="row">
        {entry.status === "pending" ? (
          <>
            <span className="pending-dot" aria-hidden />
            <span className="chip pending mono" style={{ fontSize: 11 }}>PENDING — lands tonight</span>
          </>
        ) : (
          <span className="chip ok mono" style={{ fontSize: 11 }}>CONFIRMED</span>
        )}
        <strong>{entry.label}</strong>
        {entry.market && <span className="tiny faint mono">market {shortHex(entry.market, 8, 6)}</span>}
      </div>
      <div className="desc">{entry.description}</div>
      <div className="data-slot">
        {entry.txHash ? (
          link ? (
            <a href={link} target="_blank" rel="noreferrer">
              {shortHex(entry.txHash, 14, 8)} ↗
            </a>
          ) : (
            shortHex(entry.txHash, 14, 8)
          )
        ) : (
          <span className="faint">tx hash — awaiting the whistle</span>
        )}
        {entry.timestampMs && <span> · {new Date(entry.timestampMs).toISOString()}</span>}
      </div>
    </div>
  );
}

export function LiveFinal() {
  const [data, setData] = useState<LiveFinalData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/story/live-final.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  return (
    <section className="story-section" id="live-final">
      <div className="story-section-head">
        <span className="story-num">04</span>
        <h2>Today&apos;s live World Cup final</h2>
      </div>
      <p className="story-dek">
        This section is fed by a small JSON file the page fetches at runtime — the numbers below
        update the moment the real transactions land, with no rebuild required. Until then, every
        pending slot says exactly that.
      </p>

      {!data && !error && <div className="panel small dim">loading live-final.json…</div>}
      {error && <div className="panel small dim">live-final.json not reachable — the pending state below is the honest fallback.</div>}

      {data && (
        <>
          <div className="live-final-head">
            <span className="chip active mono" style={{ fontSize: 11 }}>
              fixture {data.fixture.id}
            </span>
            <strong>{data.fixture.matchup}</strong>
            <span className="tiny dim">{data.fixture.competition}</span>
          </div>

          <div className="live-timeline">
            {data.entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>

          <div className="rehearsal-strip">
            <div className="tiny dim" style={{ marginBottom: 8 }}>
              &ldquo;We rehearse against reality before the real thing.&rdquo;
            </div>
            <div className="panel small">
              <strong>{data.rehearsal.label}</strong> — fixture {data.rehearsal.fixtureId} on {data.rehearsal.network}.
              <div className="receipt-row" style={{ marginTop: 8 }}>
                <span className="rlabel">L3 report</span>
                <a className="mono" href={`https://sepolia.basescan.org/tx/${data.rehearsal.l3ReportTx}`} target="_blank" rel="noreferrer">
                  {shortHex(data.rehearsal.l3ReportTx, 12, 6)}
                </a>
              </div>
              <div className="receipt-row">
                <span className="rlabel">VAA import</span>
                <a className="mono" href={`https://sepolia.basescan.org/tx/${data.rehearsal.vaaImportTx}`} target="_blank" rel="noreferrer">
                  {shortHex(data.rehearsal.vaaImportTx, 12, 6)}
                </a>
                <span className="chip ok" style={{ fontSize: 10 }}>{data.rehearsal.status}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
