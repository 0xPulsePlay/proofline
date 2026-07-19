/** The deterministic demo fixture — the author's canonical example. */
import type { RunFixture } from "@proofline/event-model";

export const DEMO_FIXTURE: RunFixture = {
  fixtureId: "982341",
  participant1: "Canada",
  participant2: "France",
  participant1Score: 2,
  participant2Score: 1,
  period: 100,
  kickoffIso: "2026-07-19T16:00:00Z",
  competition: "World Cup Final (demo)",
  synthetic: true,
};

export const SCORE_SEQUENCE = 184n;
export const PROOF_TIMESTAMP_MS = 1784498100000; // 2026-07-19T18:35:00Z
export const DAILY_ROOT_B58 = "7dai1yRoots1111111111111111111111111111111";
