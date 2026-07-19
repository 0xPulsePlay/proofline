import { CopyHex } from "@/components/CopyHex";
import { solanaOnChain, solanaMemoAttestation, baseMainnet, baseSepolia, shortHex } from "@/lib/story-data";

function ReceiptLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="mono" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function MainnetEvidence() {
  return (
    <section className="story-section" id="mainnet-today">
      <div className="story-section-head">
        <span className="story-num">03</span>
        <h2>What&apos;s real on mainnet today</h2>
      </div>
      <p className="story-dek">
        Every number below is pulled directly from the evidence bundles shipped in this repo
        (<code className="mono tiny">evidence/mainnet/</code>, <code className="mono tiny">evidence/runs/</code>) —
        explorer-linked, independently re-checkable, nothing invented for this page.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="num mono">{solanaOnChain.soBytes.toLocaleString()}</div>
          <div className="label">Deployed program size (bytes), Solana mainnet</div>
        </div>
        <div className="stat-card">
          <div className="num mono">{solanaOnChain.computeUnitsConsumed.toLocaleString()}</div>
          <div className="label">Compute units consumed by verify_outcome (real CPI into TxLINE)</div>
        </div>
        <div className="stat-card">
          <div className="num mono">{solanaOnChain.verifiedSlot.toLocaleString()}</div>
          <div className="label">Finalized Solana mainnet slot</div>
        </div>
        <div className="stat-card">
          <div className="num mono">
            {solanaOnChain.participant1Score}–{solanaOnChain.participant2Score}
          </div>
          <div className="label">
            Verified outcome — fixture {solanaOnChain.fixtureId}, result {solanaOnChain.resultLabel}
          </div>
        </div>
      </div>

      {/* Solana mainnet on-chain verification */}
      <div className="panel receipt-panel">
        <h3>
          Deployed program — ON-CHAIN verification{" "}
          <span className="chip ok" style={{ fontSize: 10, marginLeft: 8 }}>SOLANA MAINNET</span>
        </h3>
        <p className="small dim" style={{ margin: "6px 0 10px" }}>
          A CPI into TxLINE&apos;s deployed mainnet verifier checked the Merkle proof against the real
          mainnet daily root and returned exact one-byte <code className="mono">true</code>. This leg{" "}
          <strong style={{ color: "var(--text)" }}>is</strong> on-chain verification.
        </p>
        <div className="receipt-row">
          <span className="rlabel">Program</span>
          <ReceiptLink href={solanaOnChain.explorer.program}>{solanaOnChain.programId}</ReceiptLink>
        </div>
        <div className="receipt-row">
          <span className="rlabel">verify_outcome tx</span>
          <ReceiptLink href={solanaOnChain.explorer.verifyOutcome}>{shortHex(solanaOnChain.verifyOutcomeTx, 14, 8)}</ReceiptLink>
          <span className="tiny dim">
            slot {solanaOnChain.verifiedSlot} · {solanaOnChain.computeUnitsConsumed.toLocaleString()} CU · return{" "}
            <span className="chip ok" style={{ fontSize: 10 }}>true</span>
          </span>
        </div>
        <div className="receipt-row">
          <span className="rlabel">VerifiedOutcome PDA</span>
          <ReceiptLink href={solanaOnChain.explorer.verifiedOutcome}>{shortHex(solanaOnChain.verifiedOutcomePda, 14, 8)}</ReceiptLink>
        </div>
      </div>

      {/* Memo attestation — exact claim wording */}
      <div className="panel receipt-panel">
        <h3>
          Memo attestation{" "}
          <span className="chip active" style={{ fontSize: 10, marginLeft: 8 }}>CLIENT-VERIFIED + ANCHORED</span>
        </h3>
        <p className="small" style={{ margin: "6px 0 10px" }}>
          <strong style={{ color: "var(--text)" }}>{solanaMemoAttestation.claimWording}</strong> — a signed
          Memo transaction binding the proof-bundle and instruction digests. The Memo program does not
          execute the verification; this is <em>not</em> &quot;verified on-chain by Proofline.&quot;
        </p>
        <div className="receipt-row">
          <span className="rlabel">Memo tx</span>
          <ReceiptLink href={solanaMemoAttestation.explorer}>{shortHex(solanaMemoAttestation.signature, 14, 8)}</ReceiptLink>
          <CopyHex value={solanaMemoAttestation.signature} label="memo signature" />
        </div>
      </div>

      {/* Base mainnet full dual finality */}
      <div className="panel receipt-panel">
        <h3>
          Base mainnet — full dual finality exercised{" "}
          <span className="chip ok" style={{ fontSize: 10, marginLeft: 8 }}>BASE MAINNET</span>
        </h3>
        <p className="small dim" style={{ margin: "6px 0 10px" }}>
          All 5 contracts deployed to Base mainnet and exercised end to end: L3 report → VAA import → on-chain{" "}
          <span className="mono">DualFinalized</span> → settle().
        </p>
        <div className="receipt-row">
          <span className="rlabel">L3 report</span>
          <ReceiptLink href={`${baseMainnet.explorerBaseUrl}/tx/${baseMainnet.l3ReportTx}`}>
            {shortHex(baseMainnet.l3ReportTx, 14, 8)}
          </ReceiptLink>
        </div>
        <div className="receipt-row">
          <span className="rlabel">VAA import</span>
          <ReceiptLink href={`${baseMainnet.explorerBaseUrl}/tx/${baseMainnet.vaaImportTx}`}>
            {shortHex(baseMainnet.vaaImportTx, 14, 8)}
          </ReceiptLink>
          <span className="chip ok" style={{ fontSize: 10 }}>DualFinalized</span>
        </div>
        <div className="receipt-row">
          <span className="rlabel">settle()</span>
          <ReceiptLink href={`${baseMainnet.explorerBaseUrl}/tx/${baseMainnet.settleTx}`}>
            {shortHex(baseMainnet.settleTx, 14, 8)}
          </ReceiptLink>
        </div>
        <div className="receipt-row">
          <span className="rlabel">Attestation id</span>
          <CopyHex value={baseMainnet.attestationId} label="Base mainnet attestation id" />
        </div>
      </div>

      {/* Base Sepolia trio */}
      <div className="panel receipt-panel">
        <h3>
          Base Sepolia — the original trio{" "}
          <span className="chip ok" style={{ fontSize: 10, marginLeft: 8 }}>DEPLOYED + EXERCISED LIVE</span>
        </h3>
        <p className="small dim" style={{ margin: "6px 0 10px" }}>
          The full contract set (all 5) was deployed and exercised live on Base Sepolia first — the
          Control Room replay below runs against this real execution.
        </p>
        <div className="receipt-row">
          <span className="rlabel">Level 3 onReport</span>
          <ReceiptLink href={`${baseSepolia.explorerBaseUrl}/tx/${baseSepolia.l3ReportTx}`}>
            {shortHex(baseSepolia.l3ReportTx, 12, 6)}
          </ReceiptLink>
        </div>
        <div className="receipt-row">
          <span className="rlabel">Level 4 submitVaa</span>
          <ReceiptLink href={`${baseSepolia.explorerBaseUrl}/tx/${baseSepolia.vaaImportTx}`}>
            {shortHex(baseSepolia.vaaImportTx, 12, 6)}
          </ReceiptLink>
          <span className="chip ok" style={{ fontSize: 10 }}>DualFinalized</span>
        </div>
        <div className="receipt-row">
          <span className="rlabel">settle()</span>
          <ReceiptLink href={`${baseSepolia.explorerBaseUrl}/tx/${baseSepolia.settleTx}`}>
            {shortHex(baseSepolia.settleTx, 12, 6)}
          </ReceiptLink>
        </div>
      </div>
    </section>
  );
}
