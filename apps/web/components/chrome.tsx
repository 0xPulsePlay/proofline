"use client";
/**
 * Shared chrome: nav, honesty footer, plates, section indices, hex copy,
 * scroll-reveal. The honesty footer text is SACRED — real vs simulated
 * labels appear verbatim on every page.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GlyphConverge, IconCheck, IconCopy } from "./icons";

const LINKS: [string, string][] = [
  ["/control-room", "Control Room"],
  ["/mainnet", "Mainnet"],
  ["/tamper-lab", "Tamper Lab"],
  ["/integrations", "Integrations"],
];

export function Nav({ extra }: { extra?: ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="nav">
      <Link href="/" className="brand" aria-label="Proofline home">
        <GlyphConverge />
        PROOF<em>LINE</em>
      </Link>
      {extra}
      <nav className="links" aria-label="primary">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={pathname === href ? "here" : ""}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Permanent honesty legend — what is real vs simulated in this build. */
export function HonestyFooter() {
  return (
    <footer className="honesty" aria-label="real vs simulated legend">
      <span className="stamp real">
        <span className="dot" />
        REAL
      </span>
      <span className="small dim">
        keccak hashing · secp256k1 signatures · payload codec · attestation ids · Base Sepolia
        contracts (BaseScan-verifiable)
      </span>
      <span className="stamp sim">SIMULATED</span>
      <span className="small dim">
        Solana leg · Wormhole guardian observation (<span className="mono">dev guardian set</span>,
        publicly re-derivable) · CRE DON (local simulation)
      </span>
    </footer>
  );
}

/** Engraved evidence plate with corner ticks. */
export function Plate({
  children,
  className = "",
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: "sol" | "fail";
}) {
  return (
    <div className={`plate ${glow ? `glow-${glow}` : ""} ${className}`}>
      <span className="tick tl" aria-hidden />
      <span className="tick tr" aria-hidden />
      <span className="tick bl" aria-hidden />
      <span className="tick br" aria-hidden />
      {children}
    </div>
  );
}

export function PlateHead({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="plate-head">
      {kicker && <span className="kicker">{kicker}</span>}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Numbered section divider — the archival index mark. */
export function SectionIndex({ no, title }: { no: string; title: string }) {
  return (
    <div className="sec-index">
      <span className="no">{no}</span>
      <h2>{title}</h2>
      <span className="rule" aria-hidden />
    </div>
  );
}

/** Truncated REAL hex with click-to-copy. Never used for invented values. */
export function Hex({
  value,
  head = 12,
  tail = 8,
  label,
  full,
}: {
  value: string;
  head?: number;
  tail?: number;
  label?: string;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const shown =
    !full && value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  return (
    <button
      className="hexline"
      title={`${value} — click to copy`}
      aria-label={`copy ${label ?? "hex value"}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <span>{shown}</span>
      <span className="tag">{copied ? <IconCheck size={12} /> : <IconCopy size={12} />}</span>
    </button>
  );
}

/** Scroll-triggered staggered reveal wrapper (honors reduced motion). */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** REAL / SIMULATED stamps. */
export function StampReal({ children }: { children?: ReactNode }) {
  return (
    <span className="stamp real">
      <span className="dot" />
      {children ?? "REAL"}
    </span>
  );
}
export function StampSim({ children }: { children?: ReactNode }) {
  return <span className="stamp sim">{children ?? "SIMULATED"}</span>;
}
