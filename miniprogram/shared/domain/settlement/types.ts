import type { HandInput } from "../hand/index";
import type { DrawRoundInput, PlayerPoints, RoundEvent, RoundInput, Seat } from "../round/index";
import type { Payment, ScoringResult } from "../scoring/index";

export interface RoundSettlementResult {
  payments: Payment[];
  pointDelta: PlayerPoints;
  pointsAfter: PlayerPoints;
  pointDiffs: Record<Seat, Record<Seat, number>>;
}

export interface DrawSettlementResult extends RoundSettlementResult {
  tenpaiSeats: Seat[];
  dealerContinues: boolean;
  nextHonba: number;
  riichiSticksAfter: number;
}

export interface SettlementRecord {
  id: string;
  event: RoundEvent;
  roundInput?: RoundInput;
  drawInput?: DrawRoundInput;
  handInput?: HandInput;
  result: ScoringResult;
  pointsAfter: PlayerPoints;
  createdAt: string;
  updatedAt: string;
}
