"use client";
/**
 * ByteDissect — the 176-byte MatchOutcomeV1 payload as a physical byte
 * strip. Each field owns its exact byte range (offsets from the protocol
 * codec); hovering a field lights its bytes. The encoding stops being a
 * blob and becomes a document you can point at.
 */
import { useState } from "react";

export interface ByteField {
  name: string;
  offset: number;
  size: number;
  value: string;
}

export const MATCH_OUTCOME_FIELDS = (v: {
  flags: number;
  destinationChain: number;
  sourceValidationVersion: number;
  result: number;
  fixtureId: bigint;
  scoreSequence: bigint;
  proofTimestampMs: bigint;
  period: number;
  participant1Score: number;
  participant2Score: number;
  txlineProgramId: string;
  dailyRootAccount: string;
  validationInstructionHash: string;
  proofBundleHash: string;
}): ByteField[] => [
  { name: "magic", offset: 0, size: 4, value: "PRFL" },
  { name: "version", offset: 4, size: 1, value: "1" },
  { name: "message_type", offset: 5, size: 1, value: "1 = MATCH_OUTCOME" },
  { name: "flags", offset: 6, size: 2, value: String(v.flags) },
  { name: "destination_chain", offset: 8, size: 2, value: `${v.destinationChain} (Base Sepolia)` },
  { name: "source_validation_version", offset: 10, size: 1, value: `validate_stat_v${v.sourceValidationVersion}` },
  { name: "result", offset: 11, size: 1, value: `${v.result} (1=HOME 2=DRAW 3=AWAY)` },
  { name: "fixture_id", offset: 12, size: 8, value: String(v.fixtureId) },
  { name: "score_sequence", offset: 20, size: 8, value: String(v.scoreSequence) },
  { name: "proof_timestamp_ms", offset: 28, size: 8, value: new Date(Number(v.proofTimestampMs)).toISOString() },
  { name: "period", offset: 36, size: 4, value: String(v.period) },
  { name: "participant_1_score", offset: 40, size: 4, value: String(v.participant1Score) },
  { name: "participant_2_score", offset: 44, size: 4, value: String(v.participant2Score) },
  { name: "txline_program_id", offset: 48, size: 32, value: v.txlineProgramId },
  { name: "daily_root_account", offset: 80, size: 32, value: v.dailyRootAccount },
  { name: "validation_instruction_hash", offset: 112, size: 32, value: v.validationInstructionHash },
  { name: "proof_bundle_hash", offset: 144, size: 32, value: v.proofBundleHash },
];

const FIELD_COLORS = ["#5b8cff", "#a78bff", "#2df0a4", "#ffb454"];

export function ByteDissect({ payloadHex, fields }: { payloadHex: string; fields: ByteField[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const clean = payloadHex.startsWith("0x") ? payloadHex.slice(2) : payloadHex;
  const bytes = clean.match(/.{1,2}/g) ?? [];

  const colorOf = (bi: number): string | null => {
    for (let fi = 0; fi < fields.length; fi++) {
      const f = fields[fi];
      if (bi >= f.offset && bi < f.offset + f.size) {
        return FIELD_COLORS[fi % FIELD_COLORS.length];
      }
    }
    return null;
  };

  return (
    <div>
      <div className="bytestrip" role="img" aria-label="176-byte MatchOutcomeV1 payload">
        {bytes.map((b, bi) => {
          const c = colorOf(bi);
          const lit = hot !== null && bi >= fields[hot].offset && bi < fields[hot].offset + fields[hot].size;
          return (
            <span
              key={bi}
              className="byte"
              style={
                lit
                  ? { color: "#06080c", background: c ?? "var(--text)", borderColor: c ?? "var(--text)" }
                  : c
                    ? { borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, color: "var(--dim)" }
                    : undefined
              }
            >
              {b}
            </span>
          );
        })}
      </div>
      <div className="mt-2">
        {fields.map((f, fi) => (
          <div
            key={f.name}
            className={`fieldrow ${hot === fi ? "hot" : ""}`}
            onMouseEnter={() => setHot(fi)}
            onMouseLeave={() => setHot(null)}
            onFocus={() => setHot(fi)}
            onBlur={() => setHot(null)}
            tabIndex={0}
          >
            <span className="foff">
              [{f.offset}..{f.offset + f.size - 1}]
            </span>
            <span className="fname" style={{ color: FIELD_COLORS[fi % FIELD_COLORS.length] }}>
              {f.name}
            </span>
            <span className="fval">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
