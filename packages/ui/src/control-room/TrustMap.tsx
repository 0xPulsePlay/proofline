"use client";
/** "Why should I trust this?" — each component's role, stated plainly. */

const ROWS: [string, string][] = [
  ["TxLINE", "originates and commits sports data"],
  ["Solana", "executes proof verification"],
  ["Adapter", "normalizes only verified outcomes"],
  ["Wormhole", "authenticates the cross-chain message"],
  ["CRE", "keeps the process running"],
  ["Base Core", "verifies the VAA"],
  ["Market", "applies the result"],
];

export function TrustMap({ onClose, buildNotes }: { onClose: () => void; buildNotes: string[] }) {
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-label="Trust map">
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h3>Why should I trust this?</h3>
        <table className="data">
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{k}</td>
                <td className="dim">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small dim" style={{ marginTop: 12 }}>
          <strong>CRE provides liveness. TxLINE, Solana, and Wormhole provide correctness.</strong>{" "}
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
        <h3 style={{ marginTop: 14 }}>This build&apos;s trust assumptions</h3>
        <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
          {buildNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <div style={{ marginTop: 14, textAlign: "right" }}>
          <button className="ctl" onClick={onClose}>close</button>
        </div>
      </div>
    </div>
  );
}
