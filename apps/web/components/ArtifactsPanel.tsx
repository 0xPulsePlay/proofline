"use client";
/** Evidence drawer: the run's artifacts with their hashes, plus contract links. */
import { useState } from "react";
import type { RunManifest } from "@proofline/event-model";
import { CopyHex } from "./CopyHex";

export function ArtifactsPanel({ manifest }: { manifest: RunManifest }) {
  const [open, setOpen] = useState(false);
  const d = manifest.derivation;
  const c = manifest.contracts;
  const explorer = c.explorerBaseUrl;
  const contracts: [string, string][] = [
    ["FinalityRegistry", c.finalityRegistry],
    ["CRELevel3Receiver", c.creLevel3Receiver],
    ["WormholeOutcomeReceiver", c.wormholeOutcomeReceiver],
    ["DemoPredictionMarket", c.demoPredictionMarket],
    ["WormholeCore (dev set)", c.wormholeCore],
  ];
  return (
    <div className="panel">
      <button
        className="drawer-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: "100%", textAlign: "left", padding: 0 }}
      >
        <h3 style={{ margin: 0 }}>
          Run evidence &amp; artifacts <span className="tiny faint">{open ? "▾ hide" : "▸ show"}</span>
        </h3>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {d && (
            <dl className="kv">
              <dt>payload (176 B)</dt>
              <dd><CopyHex value={d.payloadHex} label="payload hex" /></dd>
              <dt>VAA hash</dt>
              <dd>{d.vaaHash ? <CopyHex value={d.vaaHash} label="vaa hash" /> : "—"}</dd>
              <dt>signed VAA</dt>
              <dd>{d.vaaHex ? <CopyHex value={d.vaaHex} head={14} label="vaa hex" /> : "—"}</dd>
              <dt>emitter (32 B)</dt>
              <dd><CopyHex value={d.sourceEmitter} label="emitter" /></dd>
              <dt>domain sep</dt>
              <dd><CopyHex value={d.domainSeparator} label="domain separator" /></dd>
            </dl>
          )}
          <div>
            <div className="tiny faint" style={{ marginBottom: 4 }}>artifacts in this run</div>
            <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
              {Object.entries(manifest.artifacts).map(([file, desc]) => (
                <li key={file}>
                  <span className="mono">{file}</span> — {desc}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="tiny faint" style={{ marginBottom: 4 }}>
              Base Sepolia contracts (REAL — chain id {c.chainId})
            </div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, listStyle: "none" }}>
              {contracts.map(([name, addr]) => (
                <li key={name} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span className="dim" style={{ minWidth: 170 }}>{name}</span>
                  <a className="mono tiny" href={`${explorer}/address/${addr}`} target="_blank" rel="noreferrer">
                    {addr.slice(0, 10)}…{addr.slice(-6)} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
