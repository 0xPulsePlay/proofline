const risks = [
  {
    title: "Manipulation",
    body: "A single reporting source can be pressured, bribed, or bugged into publishing the wrong score — and nothing downstream can tell.",
  },
  {
    title: "Replay",
    body: "An old, already-settled result can be resubmitted to trigger a payout twice unless every consumer independently re-derives the same identity.",
  },
  {
    title: "Single-source risk",
    body: "If one oracle is the only path from \"the game happened\" to \"the contract paid out,\" that oracle's uptime and honesty become the whole system's risk.",
  },
];

export function RiskTriad() {
  return (
    <div className="stat-grid" style={{ marginTop: 22 }}>
      {risks.map((r) => (
        <div key={r.title} className="stat-card">
          <div className="label" style={{ color: "var(--fail)", fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {r.title}
          </div>
          <div className="small dim" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {r.body}
          </div>
        </div>
      ))}
    </div>
  );
}
