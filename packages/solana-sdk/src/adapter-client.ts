/**
 * Typed client interface for the proofline-adapter Solana program.
 *
 * HONESTY NOTE: in this build the Solana leg is SIMULATED (the adapter
 * program compiles but is not deployed — TxLINE's TxOracle verifier exists
 * only on Solana mainnet). SimulatedAdapterClient produces the same typed
 * results a live Anchor client would, deterministically, and every consumer
 * marks them simulated:true in the event stream.
 */
export interface VerifyOutcomeResult {
  signature: string;
  slot: number;
  verifiedOutcomePda: string;
  txlineReturnedTrue: boolean;
}

export interface PublishOutcomeResult {
  signature: string;
  slot: number;
  emitter: string; // base58 emitter PDA
  sequence: bigint;
}

export interface AdapterClient {
  verifyOutcome(args: {
    fixtureId: bigint;
    proofBufferPda?: string;
  }): Promise<VerifyOutcomeResult>;
  publishOutcome(args: { verifiedOutcomePda: string }): Promise<PublishOutcomeResult>;
}

/** Deterministic simulation of the two-transaction Solana leg. */
export class SimulatedAdapterClient implements AdapterClient {
  private slot: number;

  constructor(private opts: { emitterBase58: string; baseSlot?: number }) {
    this.slot = opts.baseSlot ?? 1_234_560;
  }

  private sig(tag: string): string {
    // visibly synthetic signature — never confusable with a real one
    return `SIM${tag}${this.slot.toString(36).toUpperCase()}devnetNotBroadcast`;
  }

  async verifyOutcome(args: { fixtureId: bigint }): Promise<VerifyOutcomeResult> {
    this.slot += 7;
    return {
      signature: this.sig("Verify"),
      slot: this.slot,
      verifiedOutcomePda: `Verif1edOutcome${args.fixtureId}11111111111111`,
      txlineReturnedTrue: true,
    };
  }

  async publishOutcome(): Promise<PublishOutcomeResult> {
    this.slot += 4;
    return {
      signature: this.sig("Publish"),
      slot: this.slot,
      emitter: this.opts.emitterBase58,
      sequence: 184n,
    };
  }
}
