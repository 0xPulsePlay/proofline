export function Hero() {
  return (
    <div className="story-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/story/hero.png"
        alt="Two glowing proof-path lanes, one emerald-green and one violet, racing toward a central lock and registry hub where they converge"
        className="story-hero-img"
      />
      <div className="story-hero-scrim" aria-hidden />
      <div className="story-hero-content">
        <p className="story-kicker">Proofline — hackathon submission</p>
        <h1>
          Sports results, <span className="hl">proven once.</span>
          <br />
          Settled <span className="hl">everywhere.</span>
        </h1>
        <p className="lede">
          Proofline turns a TxLINE match result committed on Solana into a reusable, cross-chain
          sports-finality primitive that any EVM contract can consume. A single source can be
          manipulated, replayed, or trusted on faith — Proofline routes the outcome down two
          independently-operated lanes and only finalizes when both agree, byte for byte.
        </p>
        <div className="story-hero-facts small mono dim">
          <span className="chip ok" style={{ marginRight: 8 }}>REAL — Solana mainnet</span>
          <span className="chip ok" style={{ marginRight: 8 }}>REAL — Base mainnet</span>
          <span className="chip active">dual finality, exercised end to end</span>
        </div>
      </div>
    </div>
  );
}
