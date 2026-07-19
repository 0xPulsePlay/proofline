"use client";
/**
 * RecordSpine — TxLINE's deterministic recording rendered as a vertical
 * spine that seals itself: the line draws downward record by record, each
 * entry pins itself with a spring, and the terminal record (game_finalised,
 * status 100 / period 100) lands as a wax-seal stamp. Reduced motion: static.
 */
import { motion, useReducedMotion } from "framer-motion";

export interface SpineRecord {
  key: string;
  at: string;
  action: string;
  detail: string;
  terminal?: boolean;
}

export function RecordSpine({ records }: { records: SpineRecord[] }) {
  const reduced = useReducedMotion();
  return (
    <ol className="spine-records" role="list" aria-label="TxLINE record timeline">
      {records.map((r, i) => (
        <li key={r.key} className="spine-record">
          <span className="spine-rail" aria-hidden>
            {i > 0 && (
              <motion.span
                className="spine-line"
                initial={reduced ? false : { scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.4, delay: reduced ? 0 : 0.05 }}
                style={{ transformOrigin: "top" }}
              />
            )}
            <motion.span
              className={`spine-node ${r.terminal ? "terminal" : ""}`}
              initial={reduced ? false : { scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ type: "spring", stiffness: 300, damping: 17, delay: reduced ? 0 : 0.12 }}
            />
          </span>
          <motion.div
            className="spine-body"
            initial={reduced ? false : { opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ duration: 0.35, delay: reduced ? 0 : 0.1 }}
          >
            <div className="row">
              <span className="mono tiny faint">{r.at}</span>
              <span className={`mono small ${r.terminal ? "text-ok" : "hi"}`}>{r.action}</span>
              {r.terminal && <span className="stamp real">FINAL marker · status 100 / period 100</span>}
            </div>
            <div className="mono tiny dim mt-1">{r.detail}</div>
          </motion.div>
        </li>
      ))}
    </ol>
  );
}
