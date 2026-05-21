import type { Seat } from "../round/index";

export type LimitHand = "mangan" | "haneman" | "baiman" | "sanbaiman" | "yakuman";

export interface NamedHan {
  name: string;
  han: number;
}

export interface FuDetail {
  name: string;
  fu: number;
}

export interface Payment {
  from: Seat;
  to: Seat;
  points: number;
  reason: "hand" | "honba" | "riichi-stick" | "draw-penalty";
}

export interface ScoringResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  yaku: NamedHan[];
  dora: NamedHan[];
  han: number;
  fu?: number;
  fuDetails: FuDetail[];
  limit?: LimitHand;
  basePoints: number;
  payments: Payment[];
  pointDelta: Record<Seat, number>;
  pointsAfter?: Record<Seat, number>;
  pointDiffs?: Record<Seat, Record<Seat, number>>;
}
