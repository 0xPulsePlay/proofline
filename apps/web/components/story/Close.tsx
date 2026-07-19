import { links } from "@/lib/story-data";

export function Close() {
  return (
    <section className="story-close" id="close">
      <h2 style={{ fontSize: 22, margin: "0 0 6px" }}>See it for yourself</h2>
      <p className="small dim" style={{ maxWidth: 640 }}>
        Every claim on this page traces back to a transaction, a program, or a file in the repo.
        Verify any of it independently.
      </p>
      <div className="close-links">
        <a className="cta" href={links.repo} target="_blank" rel="noreferrer">
          Repo
          <span className="tiny" style={{ display: "block", opacity: 0.8 }}>github.com/0xPulsePlay/proofline</span>
        </a>
        <a className="cta primary" href={links.liveApp} target="_blank" rel="noreferrer">
          Live app
          <span className="tiny" style={{ display: "block", opacity: 0.8 }}>proofline-app.vercel.app</span>
        </a>
        <a className="cta" href={links.mainnetEvidence}>
          Mainnet evidence
          <span className="tiny" style={{ display: "block", opacity: 0.8 }}>/mainnet — every hash, explorer-linked</span>
        </a>
        <a className="cta" href={links.controlRoom}>
          Control room replay
          <span className="tiny" style={{ display: "block", opacity: 0.8 }}>event-sourced, no fake animation</span>
        </a>
        <a className="cta" href={links.video} target="_blank" rel="noreferrer">
          Demo video
          <span className="tiny" style={{ display: "block", opacity: 0.8 }}>shared.claude.do/public/proofline-demo-player</span>
        </a>
      </div>
      <p className="story-signoff">
        Built solo during the hackathon window. Every number on this page is on-chain checkable.
      </p>
    </section>
  );
}
