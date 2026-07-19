"use client";
import { useState } from "react";

/** Truncated REAL hex with click-to-copy. Never used for invented values. */
export function CopyHex({
  value,
  head = 10,
  tail = 6,
  label,
}: {
  value: string;
  head?: number;
  tail?: number;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const shown =
    value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  return (
    <button
      className="copyhex mono"
      title={`${value} — click to copy`}
      aria-label={`copy ${label ?? "hex value"}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {shown}
      <span className="tiny faint">{copied ? " copied ✓" : " ⧉"}</span>
    </button>
  );
}
