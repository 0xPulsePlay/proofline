"use client";
/**
 * SealChain — a chain of sealed blocks. Each block is one real event (or one
 * real mainnet transaction); the link between blocks draws itself as the
 * chain extends. Simulated events get dashed seals — the honesty mark is
 * structural, not a footnote.
 */
import { motion, useReducedMotion } from "framer-motion";

export interface SealBlockData {
  key: string;
  top: string;
  name: string;
  sub?: string;
  sim?: boolean;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
}

export function SealChain({ blocks }: { blocks: SealBlockData[] }) {
  const reduced = useReducedMotion();
  return (
    <div className="sealchain" role="list">
      {blocks.map((b, i) => {
        const inner = (
          <>
            <div className="bl-t">{b.top}</div>
            <div className="bl-n">{b.name}</div>
            {b.sub && <div className="bl-s">{b.sub}</div>}
            {b.sim && (
              <div className="mt-1">
                <span className="stamp sim">sim</span>
              </div>
            )}
          </>
        );
        const block = b.href ? (
          <a
            className={`sealblock ${b.sim ? "sim" : ""} ${b.selected ? "sel" : ""}`}
            href={b.href}
            target="_blank"
            rel="noreferrer"
            role="listitem"
            onClick={b.onClick}
          >
            {inner}
          </a>
        ) : b.onClick ? (
          <button
            className={`sealblock ${b.sim ? "sim" : ""} ${b.selected ? "sel" : ""}`}
            onClick={b.onClick}
            role="listitem"
          >
            {inner}
          </button>
        ) : (
          <div className={`sealblock ${b.sim ? "sim" : ""} ${b.selected ? "sel" : ""}`} role="listitem">
            {inner}
          </div>
        );
        return (
          <motion.div
            key={b.key}
            style={{ display: "flex", alignItems: "stretch" }}
            initial={reduced ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: reduced ? 0 : i * 0.05 }}
          >
            {i > 0 && <span className="seallink" aria-hidden />}
            {block}
          </motion.div>
        );
      })}
      {blocks.length === 0 && <span className="small faint">no events yet</span>}
    </div>
  );
}
