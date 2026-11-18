import type { HandInput } from "../hand/index";
import { DEFAULT_INITIAL_POINTS, SEATS, getActiveSeats, getActiveTurnOrder } from "../round/index";
import type {
  DrawRoundInput,
  MultipleRonRoundInput,
  PlayerCount,
  PlayerPoints,
  RoundInput,
  Seat
} from "../round/index";
import type { Payment, ScoringResult } from "../scoring/index";
import type {
  DrawSettlementResult,
  MultipleRonSettlementResult,
  MultipleRonWinRecord,
  RoundSettlementResult,
  SettlementRecord
} from "./types";

export type {
  DrawSettlementResult,
  MultipleRonSettlementResult,
  MultipleRonWinRecord,
  RoundSettlementResult,
  SettlementRecord
} from "./types";

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
  return applyHandPaymentSettlement(roundInput, scoringResult.payments, currentPoints);
}

export function applyHandPaymentSettlement(
  roundInput: Pick<
    RoundInput,
    "winner" | "discarder" | "winType" | "honba" | "riichiSticks" | "playerCount"
  >,
  handPayments: readonly Payment[],
  currentPoints: PlayerPoints = createDefaultPlayerPoints()
): RoundSettlementResult {
  const payments = [...handPayments, ...createHonbaPayments(roundInput)];
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
  const activeSeats = getActiveSeats(drawInput.playerCount);
  const tenpaiSeats = uniqueSeats(drawInput.tenpaiSeats, activeSeats);
  const payments = createDrawPenaltyPayments(tenpaiSeats, activeSeats);
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

export function findMultipleRonPriorityWinner(
  discarder: Seat,
  winners: readonly Seat[],
  playerCount: PlayerCount = 4
): Seat {
  const activeTurnOrder = getActiveTurnOrder(playerCount);
  const uniqueWinners = uniqueSeats(winners, activeTurnOrder).filter((seat) => seat !== discarder);

  if (uniqueWinners.length === 0) {
    throw new Error("多人荣和需要至少一名非放铳和牌者");
  }

  const discarderIndex = activeTurnOrder.indexOf(discarder);
  const orderedSeats = [
    ...activeTurnOrder.slice(discarderIndex + 1),
    ...activeTurnOrder.slice(0, discarderIndex)
  ];
  const priorityWinner = orderedSeats.find((seat) => uniqueWinners.includes(seat));

  if (!priorityWinner) {
    throw new Error("无法计算上家取り优先和牌者");
  }

  return priorityWinner;
}

export function applyMultipleRonSettlement(
  roundInput: MultipleRonRoundInput,
  winRecords: readonly MultipleRonWinRecord[],
  currentPoints: PlayerPoints = roundInput.playerPoints ?? createDefaultPlayerPoints()
): MultipleRonSettlementResult {
  const activeSeats = getActiveSeats(roundInput.playerCount);
  const winners = uniqueSeats(roundInput.winners, activeSeats).filter(
    (seat) => seat !== roundInput.discarder
  );
  const priorityWinner = findMultipleRonPriorityWinner(
    roundInput.discarder,
    winners,
    roundInput.playerCount
  );
  const handPayments = winRecords.flatMap((record) =>
    record.result.payments.filter((payment) => payment.reason === "hand")
  );
  const honbaPayments = createMultipleRonHonbaPayments(roundInput, priorityWinner);
  const payments = [...handPayments, ...honbaPayments];
  const pointDelta = calculatePointDelta(payments);
  const riichiStickBonus = roundInput.riichiSticks * 1000;

  if (riichiStickBonus > 0) {
    pointDelta[priorityWinner] += riichiStickBonus;
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
    pointDiffs: calculatePointDiffs(pointsAfter),
    winners,
    discarder: roundInput.discarder,
    priorityWinner,
    dealerContinues: winners.includes(roundInput.dealer)
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

export function createMultipleRonSettlementRecord(
  roundInput: MultipleRonRoundInput,
  winRecords: readonly MultipleRonWinRecord[],
  currentPoints: PlayerPoints = roundInput.playerPoints ?? createDefaultPlayerPoints(),
  id = createRecordId()
): SettlementRecord {
  const settlement = applyMultipleRonSettlement(roundInput, winRecords, currentPoints);
  const now = new Date().toISOString();
  const aggregateResult: ScoringResult = {
    valid: winRecords.every((record) => record.result.valid),
    errors: winRecords.flatMap((record) => record.result.errors),
    warnings: [
      `多人荣和：${settlement.winners.length} 家和牌`,
      `本场和供托上家取り：${settlement.priorityWinner}`
    ],
    childResults: winRecords.map((record) => ({
      winner: record.winner,
      result: record.result
    })),
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

  return {
    id,
    event: {
      type: "ron",
      winner: settlement.priorityWinner,
      winners: settlement.winners,
      discarder: settlement.discarder
    },
    multipleRonInput: {
      ...roundInput,
      winners: settlement.winners,
      playerPoints: currentPoints
    },
    multipleRonWins: winRecords.map((record) => ({
      ...record,
      roundInput: {
        ...record.roundInput,
        playerPoints: currentPoints
      }
    })),
    result: aggregateResult,
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

function createHonbaPayments(
  roundInput: Pick<RoundInput, "winner" | "discarder" | "winType" | "honba" | "playerCount">
): Payment[] {
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

  return getActiveSeats(roundInput.playerCount)
    .filter((seat) => seat !== roundInput.winner)
    .map((seat) => ({
      from: seat,
      to: roundInput.winner,
      points: roundInput.honba * 100,
      reason: "honba"
    }));
}

function createMultipleRonHonbaPayments(
  roundInput: MultipleRonRoundInput,
  priorityWinner: Seat
): Payment[] {
  if (roundInput.honba <= 0) {
    return [];
  }

  return [
    {
      from: roundInput.discarder,
      to: priorityWinner,
      points: roundInput.honba * 300,
      reason: "honba"
    }
  ];
}

function createDrawPenaltyPayments(
  tenpaiSeats: readonly Seat[],
  activeSeats: readonly Seat[] = SEATS
): Payment[] {
  const tenpaiCount = tenpaiSeats.length;

  if (tenpaiCount === 0 || tenpaiCount === activeSeats.length) {
    return [];
  }

  const notenSeats = activeSeats.filter((seat) => !tenpaiSeats.includes(seat));
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

function uniqueSeats(seats: readonly Seat[], activeSeats: readonly Seat[] = SEATS): Seat[] {
  return activeSeats.filter((seat) => seats.includes(seat));
}
