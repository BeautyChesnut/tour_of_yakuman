import { describe, expect, it } from "vitest";
import {
  analyzeAvoidFourth,
  analyzeAvoidLast,
  analyzeDrawSituation,
  analyzePointSituation,
  analyzePointTarget,
  analyzeRiichiCost,
  analyzeRoundStage,
  canShowSituationAnalysis,
  createRefreshedOnlineSituationSnapshot,
  createScoreRecommendations,
  getSituationTieBreakOrder,
  resolveSituationAnalysisPerspectiveSeat,
  SITUATION_TIE_BREAK_ORDER
} from "../../miniprogram/shared/domain/situation-analysis";
import { applyHandPaymentSettlement } from "../../miniprogram/shared/domain/settlement";
import type { OnlineRoom, RoomScoringState } from "../../miniprogram/shared/domain/online-room";

describe("在线房间点数局势分析", () => {
  it("为四麻和本地三麻开放分析，并按模式选择默认视角", () => {
    expect(canShowSituationAnalysis({ mode: "local", playerCount: 4 })).toBe(true);
    expect(canShowSituationAnalysis({ mode: "local", playerCount: 3 })).toBe(true);
    expect(canShowSituationAnalysis({ mode: "online", playerCount: 3 })).toBe(false);
    expect(canShowSituationAnalysis({ mode: "online", playerCount: 4, occupiedSeatCount: 1 })).toBe(
      true
    );
    expect(
      resolveSituationAnalysisPerspectiveSeat({
        mode: "local",
        dealer: "west",
        onlineSeat: "south"
      })
    ).toBe("west");
    expect(
      resolveSituationAnalysisPerspectiveSeat({
        mode: "online",
        dealer: "west",
        onlineSeat: "south"
      })
    ).toBe("south");
  });

  describe("本地三麻局势分析", () => {
    it("仅按东南西排名并忽略北家点数", () => {
      const analysis = analyzePointSituation({
        playerPoints: { east: 35000, south: 35000, west: 35000, north: 99999 },
        perspectiveSeat: "west",
        dealer: "east",
        honba: 0,
        riichiSticks: 0,
        playerCount: 3
      });

      expect(analysis.rankedSeats).toEqual(["east", "south", "west"]);
      expect(analysis.currentRank).toBe(3);
    });

    it("同点顺位使用东南西且末位风险为第三位", () => {
      const input = {
        playerPoints: { east: 36000, south: 35000, west: 34000, north: 99999 },
        perspectiveSeat: "south" as const,
        dealer: "east" as const,
        honba: 0,
        riichiSticks: 0,
        playerCount: 3 as const
      };
      const analysis = analyzeAvoidLast(input);

      expect(getSituationTieBreakOrder(3)).toEqual(["east", "south", "west"]);
      expect(analysis.lastRank).toBe(3);
      expect(analysis.currentlyLast).toBe(false);
      expect(analysis.risks).toHaveLength(2);
      expect(analysis.risks.every((risk) => risk.finalRank === 3)).toBe(true);
      expect(analysis.risks.every((risk) => risk.winner !== "north")).toBe(true);
    });

    it("三麻子家自摸只计算两名对手支付", () => {
      const input = {
        playerPoints: { east: 40000, south: 25000, west: 40000, north: 99999 },
        perspectiveSeat: "south" as const,
        dealer: "east" as const,
        honba: 0,
        riichiSticks: 0,
        playerCount: 3 as const
      };
      const requirement = analyzePointTarget(input, 2).tsumoRequirement;

      expect(requirement).toBeDefined();
      expect(requirement?.handPoints).toBe(
        (requirement?.dealerPayment ?? 0) + (requirement?.childPayment ?? 0)
      );
      expect(requirement?.pointsAfter.north).toBe(99999);
      expect(requirement?.pointsAfter.south).toBe(25000 + (requirement?.handPoints ?? 0));
    });

    it("三麻荒牌一家听牌时由另外两家各支付 1500 点", () => {
      const result = analyzeDrawSituation(
        {
          playerPoints: { east: 35000, south: 35000, west: 35000, north: 99999 },
          perspectiveSeat: "south",
          dealer: "east",
          honba: 1,
          riichiSticks: 2,
          roundWind: "south",
          playerCount: 3
        },
        ["south", "north"]
      );

      expect(result.tenpaiSeats).toEqual(["south"]);
      expect(result.pointsAfter).toEqual({
        east: 33500,
        south: 38000,
        west: 33500,
        north: 99999
      });
      expect(result.rankedSeats).toEqual(["south", "east", "west"]);
      expect(result.nextHonba).toBe(2);
    });

    it("三麻南三局为默认终局，立直后只重排三家", () => {
      const stage = analyzeRoundStage({
        roundWind: "south",
        roundIndex: 2,
        dealer: "west",
        perspectiveSeat: "south",
        playerCount: 3
      });
      const riichi = analyzeRiichiCost({
        playerPoints: { east: 35000, south: 35500, west: 34500, north: 99999 },
        perspectiveSeat: "south",
        dealer: "west",
        honba: 0,
        riichiSticks: 0,
        playerCount: 3
      });

      expect(stage.stage).toBe("all-last");
      expect(riichi.rankBefore).toBe(1);
      expect(riichi.rankAfterDeclaration).toBe(2);
      expect(riichi.playerPointsAfter.north).toBe(99999);
    });

    it("三麻自摸符番建议使用两家支付合计", () => {
      const recommendations = createScoreRecommendations({
        minimumHandPoints: 6000,
        isDealer: true,
        winType: "tsumo",
        playerCount: 3
      });

      expect(recommendations[0]?.handPoints).toBe((recommendations[0]?.childPayment ?? 0) * 2);
      expect(recommendations.every((item) => item.handPoints >= 6000)).toBe(true);
    });
  });

  it("按直击对象计算升位所需的最小合法打点", () => {
    const analysis = analyzePointSituation({
      playerPoints: {
        east: 25000,
        south: 20000,
        west: 30000,
        north: 25000
      },
      perspectiveSeat: "south",
      dealer: "east",
      honba: 0,
      riichiSticks: 0
    });
    const directEast = analysis.improveRonRequirements.find(
      (requirement) => requirement.discarder === "east"
    );
    const directWest = analysis.improveRonRequirements.find(
      (requirement) => requirement.discarder === "west"
    );

    expect(analysis.currentRank).toBe(4);
    expect(directEast?.handPoints).toBe(2600);
    expect(directWest?.handPoints).toBeGreaterThan(directEast?.handPoints ?? 0);
  });

  it("将供托计入逆转收益并降低所需手牌点数", () => {
    const baseInput = {
      playerPoints: {
        east: 25000,
        south: 20000,
        west: 30000,
        north: 25000
      },
      perspectiveSeat: "south" as const,
      dealer: "east" as const,
      honba: 0
    };
    const withoutSticks = analyzePointSituation({ ...baseInput, riichiSticks: 0 });
    const withSticks = analyzePointSituation({ ...baseInput, riichiSticks: 2 });
    const withoutSticksRon = withoutSticks.improveRonRequirements.find(
      (requirement) => requirement.discarder === "west"
    );
    const withSticksRon = withSticks.improveRonRequirements.find(
      (requirement) => requirement.discarder === "west"
    );

    expect(withSticksRon?.handPoints).toBeLessThan(withoutSticksRon?.handPoints ?? 0);
  });

  it("区分庄家与子家自摸的支付结构", () => {
    const points = {
      east: 20000,
      south: 25000,
      west: 30000,
      north: 25000
    };
    const dealerAnalysis = analyzePointSituation({
      playerPoints: points,
      perspectiveSeat: "east",
      dealer: "east",
      honba: 0,
      riichiSticks: 0
    });
    const childAnalysis = analyzePointSituation({
      playerPoints: { ...points, east: 25000, south: 20000 },
      perspectiveSeat: "south",
      dealer: "east",
      honba: 0,
      riichiSticks: 0
    });

    expect(dealerAnalysis.improveTsumoRequirement?.dealerPayment).toBe(
      dealerAnalysis.improveTsumoRequirement?.childPayment
    );
    expect(childAnalysis.improveTsumoRequirement?.dealerPayment).toBeGreaterThan(
      childAnalysis.improveTsumoRequirement?.childPayment ?? 0
    );
  });

  it("识别向落后玩家放铳后可能发生的掉位风险", () => {
    const analysis = analyzePointSituation({
      playerPoints: {
        east: 26000,
        south: 25000,
        west: 24000,
        north: 25000
      },
      perspectiveSeat: "east",
      dealer: "east",
      honba: 0,
      riichiSticks: 0
    });

    expect(analysis.currentRank).toBe(1);
    expect(analysis.dealInRisk).toMatchObject({
      winner: "south",
      handPoints: 1000,
      finalRank: 2
    });
  });

  it("分别计算升至第一、第二和第三位的目标条件", () => {
    const input = {
      playerPoints: {
        east: 35000,
        south: 15000,
        west: 30000,
        north: 20000
      },
      perspectiveSeat: "south" as const,
      dealer: "east" as const,
      honba: 0,
      riichiSticks: 0
    };
    const first = analyzePointTarget(input, 1);
    const second = analyzePointTarget(input, 2);
    const third = analyzePointTarget(input, 3);

    expect(first.currentRank).toBe(4);
    expect(first.ronRequirements[0]?.handPoints).toBeGreaterThanOrEqual(
      second.ronRequirements[0]?.handPoints ?? 0
    );
    expect(second.ronRequirements[0]?.handPoints).toBeGreaterThanOrEqual(
      third.ronRequirements[0]?.handPoints ?? 0
    );
    expect(first.tsumoRequirement?.finalRank).toBe(1);
    expect(second.tsumoRequirement?.finalRank).toBeLessThanOrEqual(2);
    expect(third.tsumoRequirement?.finalRank).toBeLessThanOrEqual(3);
    expect(first.targetRank).toBe(1);
    expect(second.targetRank).toBe(2);
    expect(third.targetRank).toBe(3);
    expect(first.ronRequirements.every((item) => item.finalRank <= 1)).toBe(true);
    expect(second.ronRequirements.every((item) => item.finalRank <= 2)).toBe(true);
    expect(third.ronRequirements.every((item) => item.finalRank <= 3)).toBe(true);
  });

  it("目标名次已经达成时不再生成逆转条件", () => {
    const result = analyzePointTarget(
      {
        playerPoints: { east: 30000, south: 25000, west: 24000, north: 21000 },
        perspectiveSeat: "east",
        dealer: "east",
        honba: 0,
        riichiSticks: 0
      },
      3
    );

    expect(result.achieved).toBe(true);
    expect(result.ronRequirements).toEqual([]);
    expect(result.tsumoRequirement).toBeUndefined();
  });

  it("返回每条升位路线结算后的四家点数", () => {
    const result = analyzePointTarget(
      {
        playerPoints: { east: 30000, south: 18000, west: 27000, north: 25000 },
        perspectiveSeat: "south",
        dealer: "east",
        honba: 1,
        riichiSticks: 1
      },
      3
    );
    const directEast = result.ronRequirements.find((item) => item.discarder === "east");

    expect(directEast).toBeDefined();
    expect(directEast?.pointsAfter.south).toBe(18000 + (directEast?.handPoints ?? 0) + 300 + 1000);
    expect(directEast?.pointsAfter.east).toBe(30000 - (directEast?.handPoints ?? 0) - 300);
  });

  it("分别计算向每位对手放铳后跌至第四位的最低风险线", () => {
    const analysis = analyzeAvoidFourth({
      playerPoints: { east: 28000, south: 26000, west: 24000, north: 22000 },
      perspectiveSeat: "south",
      dealer: "east",
      honba: 0,
      riichiSticks: 0
    });

    expect(analysis.currentRank).toBe(2);
    expect(analysis.currentlyFourth).toBe(false);
    expect(analysis.risks).toHaveLength(3);
    expect(analysis.risks.every((risk) => risk.finalRank === 4)).toBe(true);
    expect(
      analysis.risks.every((risk) => risk.pointsAfter.south < risk.pointsAfter[risk.winner])
    ).toBe(true);
  });

  it("将子家荣和 7700 点转换为常用符番组合", () => {
    const recommendations = createScoreRecommendations({
      minimumHandPoints: 7700,
      isDealer: false,
      winType: "ron"
    });

    expect(recommendations.slice(0, 2)).toMatchObject([
      { label: "30 符 4 番", handPoints: 7700, tone: "minimum" },
      { label: "60 符 3 番", handPoints: 7700, tone: "alternative" }
    ]);
    expect(recommendations[2]).toMatchObject({ label: "满贯", handPoints: 8000 });
  });

  it("正确生成子家满贯自摸的支付建议", () => {
    const recommendations = createScoreRecommendations({
      minimumHandPoints: 8000,
      isDealer: false,
      winType: "tsumo"
    });

    expect(recommendations[0]).toMatchObject({
      label: "满贯",
      handPoints: 8000,
      dealerPayment: 4000,
      childPayment: 2000,
      tone: "minimum"
    });
  });

  it("正确生成亲家满贯荣和建议且不返回低于目标的组合", () => {
    const recommendations = createScoreRecommendations({
      minimumHandPoints: 12000,
      isDealer: true,
      winType: "ron"
    });

    expect(recommendations[0]).toMatchObject({ label: "满贯", handPoints: 12000 });
    expect(recommendations.every((item) => item.handPoints >= 12000)).toBe(true);
  });

  it("荣和建议不会返回不成立的 20 符组合", () => {
    const recommendations = createScoreRecommendations({
      minimumHandPoints: 1000,
      isDealer: false,
      winType: "ron"
    });

    expect(recommendations.every((item) => !item.label.startsWith("20 符"))).toBe(true);
  });

  it("与正式结算共享荣和支付、本场和供托结果", () => {
    const input = {
      playerPoints: { east: 30000, south: 18000, west: 27000, north: 25000 },
      perspectiveSeat: "south" as const,
      dealer: "east" as const,
      honba: 2,
      riichiSticks: 1
    };
    const analysis = analyzePointTarget(input, 3);
    const requirement = analysis.ronRequirements.find((item) => item.discarder === "east");

    expect(requirement).toBeDefined();
    const settlement = applyHandPaymentSettlement(
      {
        winner: "south",
        discarder: "east",
        winType: "ron",
        honba: input.honba,
        riichiSticks: input.riichiSticks,
        playerCount: 4
      },
      [
        {
          from: "east",
          to: "south",
          points: requirement?.handPoints ?? 0,
          reason: "hand"
        }
      ],
      input.playerPoints
    );

    expect(requirement?.pointsAfter).toEqual(settlement.pointsAfter);
  });

  it("与正式结算共享子家自摸支付、本场和供托结果", () => {
    const input = {
      playerPoints: { east: 30000, south: 18000, west: 27000, north: 25000 },
      perspectiveSeat: "south" as const,
      dealer: "east" as const,
      honba: 1,
      riichiSticks: 2
    };
    const analysis = analyzePointTarget(input, 2);
    const requirement = analysis.tsumoRequirement;

    expect(requirement).toBeDefined();
    const settlement = applyHandPaymentSettlement(
      {
        winner: "south",
        winType: "tsumo",
        honba: input.honba,
        riichiSticks: input.riichiSticks,
        playerCount: 4
      },
      [
        {
          from: "east",
          to: "south",
          points: requirement?.dealerPayment ?? 0,
          reason: "hand"
        },
        {
          from: "west",
          to: "south",
          points: requirement?.childPayment ?? 0,
          reason: "hand"
        },
        {
          from: "north",
          to: "south",
          points: requirement?.childPayment ?? 0,
          reason: "hand"
        }
      ],
      input.playerPoints
    );

    expect(requirement?.pointsAfter).toEqual(settlement.pointsAfter);
  });

  it("同点时按东南西北顺序稳定确定顺位", () => {
    const analysis = analyzePointSituation({
      playerPoints: { east: 25000, south: 25000, west: 25000, north: 25000 },
      perspectiveSeat: "west",
      dealer: "east",
      honba: 0,
      riichiSticks: 0
    });

    expect(analysis.rankedSeats).toEqual(["east", "south", "west", "north"]);
    expect(analysis.currentRank).toBe(3);
  });

  it("使用在线房间最新版本更新分析点数、局况和成员名称", () => {
    const snapshot = {
      createdAt: 1000,
      roundWind: "east" as const,
      roundIndex: 0,
      roundLabel: "东场一局",
      playerNames: { east: "旧东", south: "旧南", west: "旧西", north: "旧北" },
      playerPoints: { east: 25000, south: 25000, west: 25000, north: 25000 },
      perspectiveSeat: "south" as const,
      dealer: "east" as const,
      honba: 0,
      riichiSticks: 0,
      source: {
        mode: "online" as const,
        roomId: "room-1",
        roomCode: "123456",
        roomVersion: 2
      }
    };
    const room = {
      id: "room-1",
      roomCode: "123456",
      ownerOpenId: "owner",
      seatMap: {
        east: { openId: "owner", displayName: "房主", joinedAt: 1 },
        south: { openId: "member", displayName: "成员", joinedAt: 2 },
        west: undefined,
        north: undefined
      },
      status: "playing",
      createdAt: 1,
      updatedAt: 2
    } satisfies OnlineRoom;
    const state = {
      roomId: "room-1",
      version: 3,
      updatedBy: "owner",
      updatedAt: 3000,
      round: {
        roundWind: "south",
        roundIndex: 2,
        honba: 2,
        riichiSticks: 1,
        dealer: "west",
        eventType: "ron",
        winType: "ron"
      },
      playerPoints: { east: 30000, south: 18000, west: 27000, north: 25000 },
      hand: { concealedTiles: [], melds: [] },
      dora: { doraIndicators: [], kanDoraIndicators: [], uraDoraIndicators: [] },
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
      },
      riichiSeats: { east: false, south: false, west: false, north: false },
      tenpaiSeats: { east: false, south: false, west: false, north: false },
      recordIds: []
    } satisfies RoomScoringState;

    expect(createRefreshedOnlineSituationSnapshot(snapshot, room, state, 4000)).toMatchObject({
      createdAt: 4000,
      roundWind: "south",
      roundIndex: 2,
      roundLabel: "南场三局",
      playerNames: { east: "房主", south: "成员", west: "旧西", north: "旧北" },
      playerPoints: state.playerPoints,
      perspectiveSeat: "south",
      dealer: "west",
      honba: 2,
      riichiSticks: 1,
      source: { mode: "online", roomId: "room-1", roomCode: "123456", roomVersion: 3 }
    });
  });

  it("拒绝使用其他房间的数据刷新分析快照", () => {
    const snapshot = {
      createdAt: 1000,
      roundWind: "east" as const,
      roundIndex: 0,
      roundLabel: "东场一局",
      playerNames: { east: "东", south: "南", west: "西", north: "北" },
      playerPoints: { east: 25000, south: 25000, west: 25000, north: 25000 },
      perspectiveSeat: "east" as const,
      dealer: "east" as const,
      honba: 0,
      riichiSticks: 0,
      source: {
        mode: "online" as const,
        roomId: "room-1",
        roomCode: "123456",
        roomVersion: 1
      }
    };
    const room = {
      id: "room-2",
      roomCode: "654321",
      ownerOpenId: "owner",
      seatMap: { east: undefined, south: undefined, west: undefined, north: undefined },
      status: "playing",
      createdAt: 1,
      updatedAt: 2
    } satisfies OnlineRoom;
    const state = {
      roomId: "room-2",
      version: 1,
      updatedBy: "owner",
      updatedAt: 2,
      round: {
        roundWind: "east",
        roundIndex: 0,
        honba: 0,
        riichiSticks: 0,
        dealer: "east",
        eventType: "ron",
        winType: "ron"
      },
      playerPoints: snapshot.playerPoints,
      hand: { concealedTiles: [], melds: [] },
      dora: { doraIndicators: [], kanDoraIndicators: [], uraDoraIndicators: [] },
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
      },
      riichiSeats: { east: false, south: false, west: false, north: false },
      tenpaiSeats: { east: false, south: false, west: false, north: false },
      recordIds: []
    } satisfies RoomScoringState;

    expect(() => createRefreshedOnlineSituationSnapshot(snapshot, room, state, 3000)).toThrow(
      "在线房间与局势分析快照不匹配"
    );
  });

  it("将南四局识别为默认半庄终局并识别当前视角庄家", () => {
    expect(
      analyzeRoundStage({
        roundWind: "south",
        roundIndex: 3,
        dealer: "west",
        perspectiveSeat: "west"
      })
    ).toEqual({ stage: "all-last", isDealer: true, isDefaultAllLast: true });
    expect(
      analyzeRoundStage({
        roundWind: "west",
        roundIndex: 0,
        dealer: "east",
        perspectiveSeat: "south"
      }).stage
    ).toBe("extension");
  });

  it("立直支付 1000 点后重新计算即时顺位和供托", () => {
    const result = analyzeRiichiCost({
      playerPoints: { east: 26000, south: 25500, west: 25000, north: 23500 },
      perspectiveSeat: "south",
      dealer: "east",
      honba: 0,
      riichiSticks: 1
    });

    expect(result).toMatchObject({
      canDeclare: true,
      pointsBefore: 25500,
      pointsAfterDeclaration: 24500,
      rankBefore: 2,
      rankAfterDeclaration: 3,
      rankChanged: true,
      riichiSticksAfter: 2
    });
    expect(result.playerPointsAfter.south).toBe(24500);
  });

  it("点数不足 1000 时不生成立直支付", () => {
    const result = analyzeRiichiCost({
      playerPoints: { east: 30000, south: 900, west: 35000, north: 34100 },
      perspectiveSeat: "south",
      dealer: "east",
      honba: 0,
      riichiSticks: 0
    });

    expect(result.canDeclare).toBe(false);
    expect(result.playerPointsAfter.south).toBe(900);
    expect(result.riichiSticksAfter).toBe(0);
  });

  it.each([
    {
      name: "一家听牌",
      tenpaiSeats: ["south"] as const,
      expected: { east: 24000, south: 28000, west: 24000, north: 24000 },
      dealerContinues: false
    },
    {
      name: "两家听牌",
      tenpaiSeats: ["east", "south"] as const,
      expected: { east: 26500, south: 26500, west: 23500, north: 23500 },
      dealerContinues: true
    },
    {
      name: "全员听牌",
      tenpaiSeats: ["east", "south", "west", "north"] as const,
      expected: { east: 25000, south: 25000, west: 25000, north: 25000 },
      dealerContinues: true
    },
    {
      name: "全员未听",
      tenpaiSeats: [] as const,
      expected: { east: 25000, south: 25000, west: 25000, north: 25000 },
      dealerContinues: false
    }
  ])("按正式结算规则推演$name", ({ tenpaiSeats, expected, dealerContinues }) => {
    const result = analyzeDrawSituation(
      {
        playerPoints: { east: 25000, south: 25000, west: 25000, north: 25000 },
        perspectiveSeat: "south",
        dealer: "east",
        honba: 1,
        riichiSticks: 2,
        roundWind: "south"
      },
      tenpaiSeats
    );

    expect(result.pointsAfter).toEqual(expected);
    expect(result.nextHonba).toBe(2);
    expect(result.riichiSticksAfter).toBe(2);
    expect(result.dealerContinues).toBe(dealerContinues);
  });

  it("同点规则导出为东南西北并与排名函数一致", () => {
    expect(SITUATION_TIE_BREAK_ORDER).toEqual(["east", "south", "west", "north"]);
    expect(
      analyzeDrawSituation(
        {
          playerPoints: { east: 25000, south: 25000, west: 25000, north: 25000 },
          perspectiveSeat: "north",
          dealer: "east",
          honba: 0,
          riichiSticks: 0,
          roundWind: "east"
        },
        []
      ).rankedSeats
    ).toEqual(SITUATION_TIE_BREAK_ORDER);
  });
});
