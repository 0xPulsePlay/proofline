import Link from "next/link";

export function StoryTopBar() {
  return (
    <div className="topbar">
      <Link href="/" className="brand" style={{ color: "var(--text)" }}>
        PROOF<span>LINE</span>
      </Link>
      <span className="small dim">The submission story</span>
      <div style={{ flex: 1 }} />
      <nav className="small" style={{ display: "flex", gap: 14 }}>
        <Link href="/control-room">Control room</Link>
        <Link href="/tamper-lab">Tamper lab</Link>
        <Link href="/mainnet">Mainnet</Link>
        <Link href="/integrations">Integrations</Link>
        <Link href="/story" style={{ color: "var(--txline)" }}>
          Story
        </Link>
      </nav>
    </div>
  );
}
