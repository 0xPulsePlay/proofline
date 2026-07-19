import { honestyTaxonomy } from "@/lib/story-data";

export function HonestyPanel() {
  return (
    <section className="story-section" id="honesty">
      <div className="story-section-head">
        <span className="story-num">05</span>
        <h2>The honesty panel</h2>
      </div>
      <p className="story-dek">
        The L1–L4 verification-level taxonomy isn&apos;t hidden in fine print here — it&apos;s
        exposed as a legible product feature. Every leg below is labeled exactly as real or
        simulated, mirroring the README&apos;s honesty table byte for byte.
      </p>

      <div className="honesty-grid">
        {honestyTaxonomy.map((row) => (
          <div key={row.leg} className={`honesty-row ${row.status}`}>
            <span className="honesty-dot" aria-hidden>
              {row.status === "real" ? "●" : "◇"}
            </span>
            <div className="honesty-leg">
              {row.leg}
              {row.level && <span className="lvl">{row.level}</span>}
              <span
                className={`chip ${row.status === "real" ? "ok" : "sim"}`}
                style={{ fontSize: 10, marginTop: 6, display: "inline-flex" }}
              >
                {row.status === "real" ? "REAL" : "SIMULATED"}
              </span>
            </div>
            <div className="honesty-detail">{row.detail}</div>
          </div>
        ))}
      </div>

      <p className="tiny faint" style={{ marginTop: 14 }}>
        Trust assumptions are the product&apos;s UI, not its fine print — see the Control Room&apos;s
        &ldquo;Why should I trust this?&rdquo; panel and the Tamper Lab for the same taxonomy under
        live attack.
      </p>
    </section>
  );
}
