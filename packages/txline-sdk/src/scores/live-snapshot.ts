/**
 * Live TxLINE score-event ingestion (free tier) — verified against the real
 * API 2026-07-19 with World Cup Final fixture 18257739.
 *
 * /api/scores/snapshot/{fixtureId} returns the fixture's full EVENT LIST
 * (append-only; the max-Seq record is current state). This module maps those
 * real events onto the same FixtureState-shaped document the deterministic
 * recorded fixtures use, so live and recorded ingestion are ONE code path
 * downstream (proof-bundle hashing, final-record detection, both lanes).
 *
 * HONESTY BOUNDARY: the free tier exposes the score stream, not TxLINE's
 * on-Solana proof leg — so a live snapshot carries proof/root/wormhole fields
 * from a caller-supplied template (the recorded fixture), each labeled
 * synthetic. Live records are REAL; the proof leg stays simulated and says so.
 *
 * Field mapping is defensive: pre-match events observed live carry
 * Action/Seq/Ts/GameState with empty Data; in-play score keys are probed from
 * Data/Stats under several candidate names because the free tier's in-play
 * shape could not be observed before a live final (today's starts 19:00Z).
 */
import { authorize, dataHeaders, TXLINE_BASE_URL, type TxLineAuth } from "../auth/guest";
import type { ScoreRecord } from "./final-marker";

/** Raw event shape as actually returned by /api/scores/snapshot/{fid}. */
export interface RawScoreEvent {
  FixtureId: number;
  GameState?: string;
  StartTime?: number;
  Action: string;
  Id?: number;
  Ts: number;
  Seq: number;
  Data?: Record<string, unknown>;
  Stats?: Record<string, unknown>;
  Participant1Id?: number;
  Participant2Id?: number;
  Participant1IsHome?: boolean;
}

export async function fetchScoresSnapshot(
  fixtureId: string,
  auth: TxLineAuth,
  baseUrl = TXLINE_BASE_URL,
): Promise<RawScoreEvent[]> {
  const res = await fetch(`${baseUrl}/api/scores/snapshot/${fixtureId}`, {
    headers: dataHeaders(auth),
  });
  if (!res.ok) throw new Error(`scores snapshot failed: HTTP ${res.status}`);
  return (await res.json()) as RawScoreEvent[];
}

function probeNumber(bags: Array<Record<string, unknown> | undefined>, keys: string[]): number | undefined {
  for (const bag of bags) {
    if (!bag) continue;
    for (const key of keys) {
      const v = bag[key];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return undefined;
}

/** GameState string → the recorded-fixture statusId vocabulary (best-effort). */
function statusIdFor(ev: RawScoreEvent): number {
  const explicit = probeNumber([ev.Data, ev.Stats], ["StatusId", "statusId"]);
  if (explicit !== undefined) return explicit;
  // Observed live (fixture 18257865, 2026-07-19): the settlement event arrives
  // as Action="game_finalised" with GameState still "scheduled" and empty
  // Data — in the live vocabulary the ACTION is the finalisation signal.
  if (ev.Action === "game_finalised") return 100;
  switch (ev.GameState) {
    case "finished":
    case "finalised":
      return 100;
    case "in_play":
    case "live":
      return 30;
    default:
      return 0;
  }
}

/** Period in the recorded vocabulary; game_finalised settles as period 100. */
function periodFor(ev: RawScoreEvent): number {
  const explicit = probeNumber([ev.Data, ev.Stats], ["Period", "period"]);
  if (explicit !== undefined) return explicit;
  return ev.Action === "game_finalised" ? 100 : 0;
}

/** Map one raw live event onto the recorded-fixture record shape. */
export function mapScoreEvent(ev: RawScoreEvent): ScoreRecord {
  return {
    action: ev.Action,
    statusId: statusIdFor(ev),
    period: periodFor(ev),
    fixtureId: String(ev.FixtureId),
    sequence: String(ev.Seq),
    // Observed live: the Stats bag keys scores by TxLINE stat id — "1" is
    // participant 1's score, "2" participant 2's (cross-checked against the
    // fixture's stat-validation proof: statsToProve keys 1/2 carry the same
    // values). Named keys win if a future shape exposes them.
    participant1Score:
      probeNumber([ev.Data, ev.Stats], ["Participant1Score", "P1Score", "HomeScore", "Score1", "1"]) ?? 0,
    participant2Score:
      probeNumber([ev.Data, ev.Stats], ["Participant2Score", "P2Score", "AwayScore", "Score2", "2"]) ?? 0,
    timestampMs: ev.Ts,
  };
}

/**
 * FixtureState-shaped result (structurally identical to
 * @proofline/config/cre-runtime's FixtureState — kept structural on purpose
 * so the dependency arrow stays config → txline-sdk).
 */
export interface LiveFixtureState {
  fixtureId: string;
  participant1: string;
  participant2: string;
  competition?: string;
  records: Array<Omit<ScoreRecord, "fixtureId">>;
  proof: Record<string, unknown>;
  rootAccount: string;
  dailyRootPdaByEpochDay: Record<string, string>;
  strategy: string;
  proofAvailability?: { ticksAfterFinalObserved?: number };
  wormhole?: { emitterBase58: string; sequence: string };
  destinationChain?: number;
}

/** Proof-leg template fields a live snapshot cannot source from the free tier. */
export type ProofLegTemplate = Pick<
  LiveFixtureState,
  | "participant1"
  | "participant2"
  | "competition"
  | "rootAccount"
  | "dailyRootPdaByEpochDay"
  | "strategy"
  | "proofAvailability"
  | "wormhole"
  | "destinationChain"
>;

export async function fetchLiveFixtureState(
  fixtureId: string,
  template: ProofLegTemplate,
  baseUrl = TXLINE_BASE_URL,
  auth?: TxLineAuth,
): Promise<LiveFixtureState> {
  const resolved = auth ?? (await authorize(baseUrl));
  const raw = await fetchScoresSnapshot(fixtureId, resolved, baseUrl);
  const records = raw
    .map(mapScoreEvent)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .map(({ fixtureId: _drop, ...rest }) => rest);
  return {
    fixtureId,
    participant1: template.participant1,
    participant2: template.participant2,
    competition: template.competition,
    records,
    proof: {
      synthetic: true,
      source: "txline-live-free-tier",
      note: "live score events are REAL; the TxLINE proof leg is not exposed on the free tier — proof/root/wormhole fields come from the run template and are labeled synthetic",
    },
    rootAccount: template.rootAccount,
    dailyRootPdaByEpochDay: template.dailyRootPdaByEpochDay,
    strategy: template.strategy,
    proofAvailability: template.proofAvailability,
    wormhole: template.wormhole,
    destinationChain: template.destinationChain,
  };
}
