import type { HandInput } from "../hand/index";
import { DEFAULT_INITIAL_POINTS, SEATS } from "../round/index";
import type { DrawRoundInput, PlayerPoints, RoundInput, Seat } from "../round/index";
import type { Payment, ScoringResult } from "../scoring/index";
import type { DrawSettlementResult, RoundSettlementResult, SettlementRecord } from "./types";

export type { DrawSettlementResult, RoundSettlementResult, SettlementRecord } from "./types";

export function createDefaultPlayerPoints(initialPoints = DEFAULT_INITIAL_POINTS): PlayerPoints {
  return SEATS.reduce<PlayerPoints>(
    (points, seat) => ({
      ...points,
      [seat]: initialPoints
    }),
    {} as PlayerPoints
  );
}

export function applyRoundSettlement(
  roundInput: RoundInput,
  scoringResult: ScoringResult,
  currentPoints: PlayerPoints = roundInput.playerPoints ?? createDefaultPlayerPoints()
): RoundSettlementResult {
  const payments = [...scoringResult.payments, ...createHonbaPayments(roundInput)];
  const pointDelta = calculatePointDelta(payments);
  const riichiStickBonus = roundInput.riichiSticks * 1000;

  if (riichiStickBonus > 0) {
    pointDelta[roundInput.winner] += riichiStickBonus;
  }

  const pointsAfter = SEATS.reduce<PlayerPoints>(
    (points, seat) => ({
      ...points,
      [seat]: currentPoints[seat] + pointDelta[seat]
    }),
    {} as PlayerPoints
  );

  return {
    payments,
    pointDelta,
    pointsAfter,
    pointDiffs: calculatePointDiffs(pointsAfter)
  };
}

export function applyDrawSettlement(
  drawInput: DrawRoundInput,
  currentPoints: PlayerPoints = drawInput.playerPoints ?? createDefaultPlayerPoints()
): DrawSettlementResult {
  const tenpaiSeats = uniqueSeats(drawInput.tenpaiSeats);
  const payments = createDrawPenaltyPayments(tenpaiSeats);
  const pointDelta = calculatePointDelta(payments);
  const pointsAfter = SEATS.reduce<PlayerPoints>(
    (points, seat) => ({
      ...points,
      [seat]: currentPoints[seat] + pointDelta[seat]
    }),
    {} as PlayerPoints
  );

  return {
    payments,
    pointDelta,
    pointsAfter,
    pointDiffs: calculatePointDiffs(pointsAfter),
    tenpaiSeats,
    dealerContinues: tenpaiSeats.includes(drawInput.dealer),
    nextHonba: drawInput.honba + 1,
    riichiSticksAfter: drawInput.riichiSticks
  };
}

export function createDrawScoringResult(drawInput: DrawRoundInput): ScoringResult {
  const settlement = applyDrawSettlement(
    drawInput,
    drawInput.playerPoints ?? createDefaultPlayerPoints()
  );

  return {
    valid: true,
    errors: [],
    warnings: [
      settlement.dealerContinues ? "亲家听牌，连庄" : "亲家未听，轮庄",
      `下一局 ${settlement.nextHonba} 本场`,
      `供托继续保留：${settlement.riichiSticksAfter} 根`
    ],
    yaku: [],
    dora: [],
    han: 0,
    fuDetails: [],
    basePoints: 0,
    payments: settlement.payments,
    pointDelta: settlement.pointDelta,
    pointsAfter: settlement.pointsAfter,
    pointDiffs: settlement.pointDiffs
  };
}

export function createSettlementRecord(
  roundInput: RoundInput,
  handInput: HandInput,
  scoringResult: ScoringResult,
  currentPoints: PlayerPoints = roundInput.playerPoints ?? createDefaultPlayerPoints(),
  id = createRecordId()
): SettlementRecord {
  const settlement = applyRoundSettlement(roundInput, scoringResult, currentPoints);
  const now = new Date().toISOString();

  return {
    id,
    event:
      roundInput.winType === "ron"
        ? {
            type: "ron",
            winner: roundInput.winner,
            discarder: roundInput.discarder as Seat
          }
        : {
            type: "tsumo",
            winner: roundInput.winner
          },
    roundInput,
    handInput,
    result: {
      ...scoringResult,
      payments: settlement.payments,
      pointDelta: settlement.pointDelta,
      pointsAfter: settlement.pointsAfter,
      pointDiffs: settlement.pointDiffs
    },
    pointsAfter: settlement.pointsAfter,
    createdAt: now,
    updatedAt: now
  };
}

export function createDrawSettlementRecord(
  drawInput: DrawRoundInput,
  currentPoints: PlayerPoints = drawInput.playerPoints ?? createDefaultPlayerPoints(),
  id = createRecordId()
): SettlementRecord {
  const settlement = applyDrawSettlement(drawInput, currentPoints);
  const result = createDrawScoringResult({
    ...drawInput,
    playerPoints: currentPoints
  });
  const now = new Date().toISOString();

  return {
    id,
    event: {
      type: "draw",
      tenpaiSeats: settlement.tenpaiSeats
    },
    drawInput: {
      ...drawInput,
      tenpaiSeats: settlement.tenpaiSeats,
      playerPoints: currentPoints
    },
    result,
    pointsAfter: settlement.pointsAfter,
    createdAt: now,
    updatedAt: now
  };
}

export function replaceRecentSettlement(
  records: readonly SettlementRecord[],
  replacement: SettlementRecord
): SettlementRecord[] {
  if (records.length === 0) {
    return [replacement];
  }

  return [...records.slice(0, -1), replacement];
}

function createHonbaPayments(roundInput: RoundInput): Payment[] {
  if (roundInput.honba <= 0) {
    return [];
  }

  if (roundInput.winType === "ron") {
    if (!roundInput.discarder) {
      return [];
    }

    return [
      {
        from: roundInput.discarder,
        to: roundInput.winner,
        points: roundInput.honba * 300,
        reason: "honba"
      }
    ];
  }

  return SEATS.filter((seat) => seat !== roundInput.winner).map((seat) => ({
    from: seat,
    to: roundInput.winner,
    points: roundInput.honba * 100,
    reason: "honba"
  }));
}

function createDrawPenaltyPayments(tenpaiSeats: readonly Seat[]): Payment[] {
  const tenpaiCount = tenpaiSeats.length;

  if (tenpaiCount === 0 || tenpaiCount === SEATS.length) {
    return [];
  }

  const notenSeats = SEATS.filter((seat) => !tenpaiSeats.includes(seat));
  const paymentByNoten = 3000 / notenSeats.length;

  if (tenpaiCount === notenSeats.length) {
    return notenSeats.map((notenSeat, index) => ({
      from: notenSeat,
      to: tenpaiSeats[index],
      points: paymentByNoten,
      reason: "draw-penalty" as const
    }));
  }

  return notenSeats.flatMap((notenSeat) =>
    tenpaiSeats.map((tenpaiSeat) => ({
      from: notenSeat,
      to: tenpaiSeat,
      points: paymentByNoten / tenpaiCount,
      reason: "draw-penalty" as const
    }))
  );
}

function calculatePointDelta(payments: readonly Payment[]): PlayerPoints {
  return payments.reduce<PlayerPoints>((delta, payment) => {
    return {
      ...delta,
      [payment.from]: delta[payment.from] - payment.points,
      [payment.to]: delta[payment.to] + payment.points
    };
  }, createDefaultPlayerPoints(0));
}

function calculatePointDiffs(points: PlayerPoints): Record<Seat, Record<Seat, number>> {
  return SEATS.reduce<Record<Seat, Record<Seat, number>>>(
    (outer, seat) => ({
      ...outer,
      [seat]: SEATS.reduce<Record<Seat, number>>(
        (inner, otherSeat) => ({
          ...inner,
          [otherSeat]: points[seat] - points[otherSeat]
        }),
        {} as Record<Seat, number>
      )
    }),
    {} as Record<Seat, Record<Seat, number>>
  );
}

function createRecordId(): string {
  return `settlement-${Date.now()}`;
}

function uniqueSeats(seats: readonly Seat[]): Seat[] {
  return SEATS.filter((seat) => seats.includes(seat));
}
