import { describe, expect, it } from "vitest";
import type { HandInput } from "../../miniprogram/shared/domain/hand";
import type {
  DrawRoundInput,
  MultipleRonRoundInput,
  RoundInput
} from "../../miniprogram/shared/domain/round";
import type { ScoringResult } from "../../miniprogram/shared/domain/scoring";
import {
  applyMultipleRonSettlement,
  applyDrawSettlement,
  applyHandPaymentSettlement,
  applyRoundSettlement,
  createDrawSettlementRecord,
  createDefaultPlayerPoints,
  createMultipleRonSettlementRecord,
  createSettlementRecord,
  findMultipleRonPriorityWinner,
  replaceRecentSettlement
} from "../../miniprogram/shared/domain/settlement";

const round: RoundInput = {
  roundWind: "east",
  honba: 0,
  riichiSticks: 0,
  dealer: "east",
  winner: "south",
  discarder: "east",
  winType: "ron"
};

const drawRound: DrawRoundInput = {
  roundWind: "east",
  honba: 0,
  riichiSticks: 2,
  dealer: "east",
  tenpaiSeats: []
};

const multipleRonRound: MultipleRonRoundInput = {
  roundWind: "east",
  honba: 0,
  riichiSticks: 0,
  dealer: "east",
  discarder: "east",
  winners: ["south", "west"]
};

const scoring: ScoringResult = {
  valid: true,
  errors: [],
  warnings: [],
  yaku: [{ name: "立直", han: 1 }],
  dora: [],
  han: 1,
  fu: 30,
  fuDetails: [],
  basePoints: 240,
  payments: [{ from: "east", to: "south", points: 1000, reason: "hand" }],
  pointDelta: {
    east: 0,
    south: 0,
    west: 0,
    north: 0
  }
};

const hand: HandInput = {
  concealedTiles: [],
  winningTile: "1m",
  melds: [],
  doraIndicators: [],
  kanDoraIndicators: [],
  uraDoraIndicators: [],
  conditions: {
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    menzenTsumo: false,
    haitei: false,
    houtei: false,
    rinshan: false,
    chankan: false,
    tenhou: false,
    chiihou: false,
    enableUraDora: false
  }
};

describe("本局结算", () => {
  it("默认四家初始点数为 25000", () => {
    expect(createDefaultPlayerPoints()).toEqual({
      east: 25000,
      south: 25000,
      west: 25000,
      north: 25000
    });
  });

  it("荣和时本场由放铳者每本场额外支付 300 点", () => {
    const result = applyRoundSettlement(
      { ...round, honba: 2 },
      scoring,
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta.east).toBe(-1600);
    expect(result.pointDelta.south).toBe(1600);
    expect(result.pointsAfter.east).toBe(23400);
    expect(result.pointsAfter.south).toBe(26600);
  });

  it("自摸时本场由每名对手每本场额外支付 100 点", () => {
    const result = applyRoundSettlement(
      {
        ...round,
        honba: 1,
        winType: "tsumo",
        discarder: undefined
      },
      {
        ...scoring,
        payments: [
          { from: "east", to: "south", points: 500, reason: "hand" },
          { from: "west", to: "south", points: 300, reason: "hand" },
          { from: "north", to: "south", points: 300, reason: "hand" }
        ]
      },
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: -600,
      south: 1400,
      west: -400,
      north: -400
    });
  });

  it("三麻自摸时本场只由两名对手额外支付", () => {
    const result = applyRoundSettlement(
      {
        ...round,
        playerCount: 3,
        honba: 1,
        winType: "tsumo",
        discarder: undefined
      },
      {
        ...scoring,
        payments: [
          { from: "east", to: "south", points: 500, reason: "hand" },
          { from: "west", to: "south", points: 300, reason: "hand" }
        ]
      },
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: -600,
      south: 1000,
      west: -400,
      north: 0
    });
  });

  it("供托直接加入和牌者收入", () => {
    const result = applyRoundSettlement(
      { ...round, riichiSticks: 2 },
      scoring,
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta.south).toBe(3000);
    expect(result.pointsAfter.south).toBe(28000);
  });

  it("共享手牌支付结算统一追加荣和本场与供托", () => {
    const result = applyHandPaymentSettlement(
      {
        winner: "south",
        discarder: "east",
        winType: "ron",
        honba: 2,
        riichiSticks: 1,
        playerCount: 4
      },
      [{ from: "east", to: "south", points: 3900, reason: "hand" }],
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: -4500,
      south: 5500,
      west: 0,
      north: 0
    });
  });

  it("共享手牌支付结算统一追加自摸本场与供托", () => {
    const result = applyHandPaymentSettlement(
      {
        winner: "south",
        winType: "tsumo",
        honba: 1,
        riichiSticks: 1,
        playerCount: 4
      },
      [
        { from: "east", to: "south", points: 2000, reason: "hand" },
        { from: "west", to: "south", points: 1000, reason: "hand" },
        { from: "north", to: "south", points: 1000, reason: "hand" }
      ],
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: -2100,
      south: 5300,
      west: -1100,
      north: -1100
    });
  });

  it("计算四家点差", () => {
    const result = applyRoundSettlement(
      { ...round, honba: 2 },
      scoring,
      createDefaultPlayerPoints()
    );

    expect(result.pointDiffs.south.east).toBe(3200);
    expect(result.pointDiffs.east.south).toBe(-3200);
  });

  it("生成最近一局结算记录并支持覆盖", () => {
    const first = createSettlementRecord(
      round,
      hand,
      scoring,
      createDefaultPlayerPoints(),
      "record-1"
    );
    const second = createSettlementRecord(
      { ...round, honba: 1 },
      hand,
      scoring,
      createDefaultPlayerPoints(),
      "record-2"
    );

    expect(replaceRecentSettlement([], first)).toEqual([first]);
    expect(replaceRecentSettlement([first], second)).toEqual([second]);
  });

  it("荒牌流局 0 家或 4 家听牌时不产生罚符收支", () => {
    const zeroTenpai = applyDrawSettlement(drawRound, createDefaultPlayerPoints());
    const fourTenpai = applyDrawSettlement(
      { ...drawRound, tenpaiSeats: ["east", "south", "west", "north"] },
      createDefaultPlayerPoints()
    );

    expect(zeroTenpai.pointDelta).toEqual({
      east: 0,
      south: 0,
      west: 0,
      north: 0
    });
    expect(fourTenpai.pointDelta).toEqual(zeroTenpai.pointDelta);
  });

  it("荒牌流局 1 家听牌时听牌者收 3000 点", () => {
    const result = applyDrawSettlement(
      { ...drawRound, tenpaiSeats: ["south"] },
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: -1000,
      south: 3000,
      west: -1000,
      north: -1000
    });
  });

  it("三麻荒牌流局只在三名玩家之间分配罚符", () => {
    const oneTenpai = applyDrawSettlement(
      { ...drawRound, playerCount: 3, tenpaiSeats: ["south"] },
      createDefaultPlayerPoints()
    );
    const allTenpai = applyDrawSettlement(
      { ...drawRound, playerCount: 3, tenpaiSeats: ["east", "south", "west"] },
      createDefaultPlayerPoints()
    );

    expect(oneTenpai.pointDelta).toEqual({
      east: -1500,
      south: 3000,
      west: -1500,
      north: 0
    });
    expect(allTenpai.pointDelta).toEqual({
      east: 0,
      south: 0,
      west: 0,
      north: 0
    });
  });

  it("荒牌流局 2 家听牌时听牌者各收 1500 点", () => {
    const result = applyDrawSettlement(
      { ...drawRound, tenpaiSeats: ["east", "south"] },
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: 1500,
      south: 1500,
      west: -1500,
      north: -1500
    });
  });

  it("荒牌流局 3 家听牌时未听者支付 3000 点", () => {
    const result = applyDrawSettlement(
      { ...drawRound, tenpaiSeats: ["east", "south", "west"] },
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: 1000,
      south: 1000,
      west: 1000,
      north: -3000
    });
  });

  it("荒牌流局根据亲家听牌状态判断连庄并保留供托", () => {
    const dealerTenpai = applyDrawSettlement(
      { ...drawRound, honba: 1, riichiSticks: 2, tenpaiSeats: ["east"] },
      createDefaultPlayerPoints()
    );
    const dealerNoten = applyDrawSettlement(
      { ...drawRound, honba: 1, riichiSticks: 2, tenpaiSeats: ["south"] },
      createDefaultPlayerPoints()
    );

    expect(dealerTenpai.dealerContinues).toBe(true);
    expect(dealerNoten.dealerContinues).toBe(false);
    expect(dealerTenpai.nextHonba).toBe(2);
    expect(dealerTenpai.riichiSticksAfter).toBe(2);
  });

  it("生成流局结算记录并支持最近记录覆盖", () => {
    const drawRecord = createDrawSettlementRecord(
      { ...drawRound, tenpaiSeats: ["south", "west"] },
      createDefaultPlayerPoints(),
      "draw-1"
    );

    expect(drawRecord.event).toEqual({
      type: "draw",
      tenpaiSeats: ["south", "west"]
    });
    expect(drawRecord.drawInput?.riichiSticks).toBe(2);
    expect(replaceRecentSettlement([], drawRecord)).toEqual([drawRecord]);
  });

  it("多人荣和按放铳者之后摸牌顺序决定上家取り优先者", () => {
    expect(findMultipleRonPriorityWinner("east", ["west", "north"])).toBe("north");
    expect(findMultipleRonPriorityWinner("east", ["south", "north"])).toBe("north");
    expect(findMultipleRonPriorityWinner("south", ["east", "north"])).toBe("east");
    expect(findMultipleRonPriorityWinner("west", ["east", "north"])).toBe("east");
    expect(findMultipleRonPriorityWinner("north", ["south", "east"])).toBe("south");
  });

  it("双响时放铳者分别支付荣和点数，供托和本场上家取り", () => {
    const result = applyMultipleRonSettlement(
      { ...multipleRonRound, honba: 2, riichiSticks: 1 },
      [createWinRecord("south", 1000), createWinRecord("west", 2000)],
      createDefaultPlayerPoints()
    );

    expect(result.priorityWinner).toBe("west");
    expect(result.pointDelta).toEqual({
      east: -3600,
      south: 1000,
      west: 3600,
      north: 0
    });
    expect(result.pointsAfter.east).toBe(21400);
    expect(result.pointsAfter.south).toBe(26000);
    expect(result.pointsAfter.west).toBe(28600);
  });

  it("三响时聚合三名和牌者支付", () => {
    const result = applyMultipleRonSettlement(
      { ...multipleRonRound, winners: ["south", "west", "north"] },
      [
        createWinRecord("south", 1000),
        createWinRecord("west", 2000),
        createWinRecord("north", 3900)
      ],
      createDefaultPlayerPoints()
    );

    expect(result.pointDelta).toEqual({
      east: -6900,
      south: 1000,
      west: 2000,
      north: 3900
    });
  });

  it("多人荣和中包含亲家时连庄，不包含亲家时轮庄", () => {
    const dealerWin = applyMultipleRonSettlement(
      { ...multipleRonRound, discarder: "south", winners: ["east", "west"] },
      [createWinRecord("east", 5800), createWinRecord("west", 2000)],
      createDefaultPlayerPoints()
    );
    const dealerNotWin = applyMultipleRonSettlement(
      { ...multipleRonRound, winners: ["south", "west"] },
      [createWinRecord("south", 1000), createWinRecord("west", 2000)],
      createDefaultPlayerPoints()
    );

    expect(dealerWin.dealerContinues).toBe(true);
    expect(dealerNotWin.dealerContinues).toBe(false);
  });

  it("生成多人荣和结算记录并保存每名和牌者结果", () => {
    const record = createMultipleRonSettlementRecord(
      { ...multipleRonRound, honba: 1, riichiSticks: 1 },
      [createWinRecord("south", 1000), createWinRecord("west", 2000)],
      createDefaultPlayerPoints(),
      "multi-ron-1"
    );

    expect(record.event).toEqual({
      type: "ron",
      winner: "west",
      winners: ["south", "west"],
      discarder: "east"
    });
    expect(record.multipleRonWins?.map((win) => win.winner)).toEqual(["south", "west"]);
    expect(record.result.childResults?.length).toBe(2);
    expect(record.pointsAfter.west).toBe(28300);
    expect(replaceRecentSettlement([], record)).toEqual([record]);
  });
});

function createWinRecord(winner: RoundInput["winner"], points: number) {
  const roundInput: RoundInput = {
    ...round,
    winner,
    discarder: "east",
    winType: "ron"
  };
  const result: ScoringResult = {
    ...scoring,
    payments: [{ from: "east", to: winner, points, reason: "hand" }]
  };

  return {
    winner,
    roundInput,
    handInput: hand,
    result
  };
}
