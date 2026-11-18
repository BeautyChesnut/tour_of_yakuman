import { describe, expect, it } from "vitest";
import {
  DEFAULT_RIICHI_ADAPTER_RULES,
  calculateWithRiichi,
  toRiichiInput
} from "../../miniprogram/shared/domain/scoring-adapter";
import type { HandInput } from "../../miniprogram/shared/domain/hand";
import type { RoundInput } from "../../miniprogram/shared/domain/round";

const baseRound: RoundInput = {
  roundWind: "east",
  honba: 0,
  riichiSticks: 0,
  dealer: "east",
  winner: "south",
  winType: "tsumo"
};

const baseConditions = {
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  menzenTsumo: true,
  haitei: false,
  houtei: false,
  rinshan: false,
  chankan: false,
  tenhou: false,
  chiihou: false,
  enableUraDora: false
};

describe("riichi adapter", () => {
  it("把项目手牌和局况转换为 riichi 字符串", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    expect(toRiichiInput(hand, baseRound)).toBe("112233456789m11s+14");
  });

  it("荣和时把和牌张放入 +agari 部分", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: { ...baseConditions, menzenTsumo: false }
    };

    expect(toRiichiInput(hand, { ...baseRound, winType: "ron", discarder: "east" })).toBe(
      "112233456789m1s+1s+14"
    );
  });

  it("按亲家位置换算和牌者自风", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    expect(toRiichiInput(hand, { ...baseRound, dealer: "west", winner: "west" })).toBe(
      "112233456789m11s+11"
    );
    expect(toRiichiInput(hand, { ...baseRound, dealer: "west", winner: "north" })).toBe(
      "112233456789m11s+14"
    );
  });

  it("三麻按玩家实际座位传入自风", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    expect(toRiichiInput(hand, { ...baseRound, playerCount: 3, winner: "south" })).toBe(
      "112233456789m11s+12"
    );
  });

  it("三麻万子宝牌指示牌只在一万和九万之间循环", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2p",
        "2p",
        "3p",
        "3p",
        "4p",
        "5p",
        "6p",
        "7p",
        "8p",
        "9p",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: ["1m", "9m"],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    expect(toRiichiInput(hand, { ...baseRound, playerCount: 3 })).toContain("+d19m+");
  });

  it("把宝牌指示牌转换为实际宝牌传给 riichi", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s",
        "1s",
        "5p",
        "red5p"
      ],
      winningTile: "5p",
      melds: [],
      doraIndicators: ["4p"],
      kanDoraIndicators: ["north"],
      uraDoraIndicators: ["4p"],
      conditions: { ...baseConditions, riichi: true, ippatsu: true, enableUraDora: true }
    };

    expect(toRiichiInput(hand, baseRound)).toBe("123456789m550p11s+d55p1z+ri14");
  });

  it("计算并转换 riichi 输出为项目 ScoringResult", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.han).toBe(4);
    expect(result.fu).toBe(30);
    expect(result.fuDetails).toEqual([{ name: "总符数（riichi）", fu: 30 }]);
    expect(result.payments).toEqual([
      { from: "east", to: "south", points: 3900, reason: "hand" },
      { from: "west", to: "south", points: 2000, reason: "hand" },
      { from: "north", to: "south", points: 2000, reason: "hand" }
    ]);
    expect(result.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["一气通贯", "一杯口", "门前清自摸和"])
    );
  });

  it("三麻自摸只生成两名对手的手牌支付", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s",
        "1s",
        "2s",
        "3s"
      ],
      winningTile: "4s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, { ...baseRound, playerCount: 3 });

    expect(result.valid).toBe(true);
    expect(result.payments.map((payment) => payment.from).sort()).toEqual(["east", "west"]);
  });

  it("三麻拔北作为宝牌番计入点数", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "1m",
        "9m",
        "9m",
        "9m",
        "2p",
        "3p",
        "4p",
        "2s",
        "3s",
        "4s",
        "5p"
      ],
      winningTile: "5p",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      nukiDoraCount: 2,
      conditions: baseConditions
    };

    const withoutNuki = calculateWithRiichi(
      { ...hand, nukiDoraCount: 0 },
      { ...baseRound, playerCount: 3 }
    );
    const withNuki = calculateWithRiichi(hand, { ...baseRound, playerCount: 3 });

    expect(withNuki.valid).toBe(true);
    expect(withoutNuki.valid).toBe(true);
    expect(withNuki.dora).toEqual(expect.arrayContaining([{ name: "拔北", han: 2 }]));
    expect(withNuki.han).toBe(withoutNuki.han + 2);
    expect(withNuki.payments.map((payment) => payment.from).sort()).toEqual(["east", "west"]);
  });

  it("大三元自摸有责任者时由责任者承担全部手牌支付", () => {
    const hand: HandInput = {
      concealedTiles: [
        "white",
        "white",
        "white",
        "green",
        "green",
        "green",
        "red",
        "red",
        "red",
        "1m",
        "2m",
        "3m",
        "9p"
      ],
      winningTile: "9p",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      liabilitySeat: "west",
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.yaku.map((yaku) => yaku.name)).toContain("大三元");
    expect(result.payments).toEqual([{ from: "west", to: "south", points: 32000, reason: "hand" }]);
  });

  it("大三元荣和有责任者时由放铳者和责任者共同承担", () => {
    const hand: HandInput = {
      concealedTiles: [
        "white",
        "white",
        "white",
        "green",
        "green",
        "green",
        "red",
        "red",
        "red",
        "1m",
        "2m",
        "3m",
        "9p"
      ],
      winningTile: "9p",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      liabilitySeat: "west",
      conditions: { ...baseConditions, menzenTsumo: false }
    };

    const result = calculateWithRiichi(hand, {
      ...baseRound,
      winType: "ron",
      discarder: "east"
    });

    expect(result.valid).toBe(true);
    expect(result.yaku.map((yaku) => yaku.name)).toContain("大三元");
    expect(result.payments).toEqual([
      { from: "east", to: "south", points: 16000, reason: "hand" },
      { from: "west", to: "south", points: 16000, reason: "hand" }
    ]);
  });

  it("复合役满只对产生包牌的役满部分应用责任支付", () => {
    const hand: HandInput = {
      concealedTiles: ["south"],
      winningTile: "south",
      melds: [
        { type: "pon", open: true, tiles: ["white", "white", "white"] },
        { type: "pon", open: true, tiles: ["green", "green", "green"] },
        { type: "pon", open: true, tiles: ["red", "red", "red"] },
        { type: "pon", open: true, tiles: ["east", "east", "east"] }
      ],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      liabilitySeat: "west",
      conditions: { ...baseConditions, menzenTsumo: false }
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["大三元", "字一色"])
    );
    expect(result.payments).toEqual([
      { from: "east", to: "south", points: 16000, reason: "hand" },
      { from: "west", to: "south", points: 40000, reason: "hand" },
      { from: "north", to: "south", points: 8000, reason: "hand" }
    ]);
  });

  it("输出中文役种和宝牌名称", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s",
        "1s",
        "5p",
        "red5p"
      ],
      winningTile: "5p",
      melds: [],
      doraIndicators: ["4p"],
      kanDoraIndicators: [],
      uraDoraIndicators: ["4p"],
      conditions: { ...baseConditions, riichi: true, ippatsu: true }
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["立直", "一发", "门前清自摸和"])
    );
    expect(result.dora.map((dora) => dora.name)).toEqual(
      expect.arrayContaining(["宝牌", "赤宝牌"])
    );
  });

  it("平和自摸按 20 符计算，不额外加自摸符", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7p",
        "8p",
        "9p",
        "2s",
        "3s",
        "5s",
        "5s"
      ],
      winningTile: "4s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.fu).toBe(20);
    expect(result.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["平和", "门前清自摸和"])
    );
    expect(result.payments).toEqual([
      { from: "east", to: "south", points: 700, reason: "hand" },
      { from: "west", to: "south", points: 400, reason: "hand" },
      { from: "north", to: "south", points: 400, reason: "hand" }
    ]);
  });

  it("平和荣和按 30 符计算", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7p",
        "8p",
        "9p",
        "2s",
        "3s",
        "5s",
        "5s"
      ],
      winningTile: "4s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: { ...baseConditions, menzenTsumo: false }
    };

    const result = calculateWithRiichi(hand, {
      ...baseRound,
      winType: "ron",
      discarder: "east"
    });

    expect(result.valid).toBe(true);
    expect(result.fu).toBe(30);
    expect(result.yaku.map((yaku) => yaku.name)).toContain("平和");
    expect(result.payments).toEqual([{ from: "east", to: "south", points: 1000, reason: "hand" }]);
  });

  it("役牌雀头不计平和", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7p",
        "8p",
        "9p",
        "2s",
        "3s",
        "east",
        "east"
      ],
      winningTile: "4s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.fu).toBe(30);
    expect(result.yaku.map((yaku) => yaku.name)).not.toContain("平和");
  });

  it("嵌张等待不计平和", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7p",
        "8p",
        "9p",
        "2s",
        "4s",
        "5s",
        "5s"
      ],
      winningTile: "3s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.fu).toBe(30);
    expect(result.yaku.map((yaku) => yaku.name)).not.toContain("平和");
  });

  it("自摸张用于组成雀头时不计平和", () => {
    const hand: HandInput = {
      concealedTiles: [
        "4m",
        "5m",
        "6m",
        "7m",
        "2p",
        "3p",
        "4p",
        "6p",
        "7p",
        "8p",
        "2s",
        "3s",
        "4s"
      ],
      winningTile: "4m",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.fu).toBe(30);
    expect(result.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["断幺九", "门前清自摸和"])
    );
    expect(result.yaku.map((yaku) => yaku.name)).not.toContain("平和");
  });

  it("在 eval 不可用的小程序环境中仍可计算点数", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };
    const globalWithEval = globalThis as Record<string, unknown>;
    const originalEval = globalWithEval.eval;

    try {
      globalWithEval.eval = undefined;

      const result = calculateWithRiichi(hand, baseRound);

      expect(result.valid).toBe(true);
      expect(result.payments).toEqual([
        { from: "east", to: "south", points: 3900, reason: "hand" },
        { from: "west", to: "south", points: 2000, reason: "hand" },
        { from: "north", to: "south", points: 2000, reason: "hand" }
      ]);
    } finally {
      globalWithEval.eval = originalEval;
    }
  });

  it("荣和时输出放铳者到和牌者的支付", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: { ...baseConditions, menzenTsumo: false }
    };

    const result = calculateWithRiichi(hand, { ...baseRound, winType: "ron", discarder: "east" });

    expect(result.valid).toBe(true);
    expect(result.payments).toEqual([{ from: "east", to: "south", points: 5200, reason: "hand" }]);
  });

  it("亲家自摸时三家支付相同点数", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, { ...baseRound, dealer: "east", winner: "east" });

    expect(result.valid).toBe(true);
    expect(result.payments).toEqual([
      { from: "south", to: "east", points: 3900, reason: "hand" },
      { from: "west", to: "east", points: 3900, reason: "hand" },
      { from: "north", to: "east", points: 3900, reason: "hand" }
    ]);
  });

  it("支持累计役满并把基础点修正为役满基础点", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s",
        "1s",
        "5p",
        "red5p"
      ],
      winningTile: "5p",
      melds: [],
      doraIndicators: ["4p", "4p", "4p"],
      kanDoraIndicators: [],
      uraDoraIndicators: ["4p", "4p", "4p"],
      conditions: { ...baseConditions, riichi: true, ippatsu: true }
    };

    const result = calculateWithRiichi(hand, baseRound);

    expect(result.valid).toBe(true);
    expect(result.han).toBeGreaterThanOrEqual(13);
    expect(result.limit).toBe("yakuman");
    expect(result.basePoints).toBe(8000);
    expect(result.payments).toEqual([
      { from: "east", to: "south", points: 16000, reason: "hand" },
      { from: "west", to: "south", points: 8000, reason: "hand" },
      { from: "north", to: "south", points: 8000, reason: "hand" }
    ]);
  });

  it("支持关闭食断", () => {
    const hand: HandInput = {
      concealedTiles: ["2m", "3m", "4m", "2p"],
      winningTile: "2p",
      melds: [
        { type: "chi", tiles: ["3p", "4p", "5p"], open: true },
        { type: "chi", tiles: ["4s", "5s", "6s"], open: true },
        { type: "chi", tiles: ["6s", "7s", "8s"], open: true }
      ],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: { ...baseConditions, menzenTsumo: false }
    };

    const result = calculateWithRiichi(hand, baseRound, {
      ...DEFAULT_RIICHI_ADAPTER_RULES,
      kuitan: false
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("没有役");
  });

  it("显式报告 riichi 暂不支持的规则配置", () => {
    const hand: HandInput = {
      concealedTiles: [
        "1m",
        "1m",
        "2m",
        "2m",
        "3m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "9m",
        "1s"
      ],
      winningTile: "1s",
      melds: [],
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: [],
      conditions: baseConditions
    };

    const result = calculateWithRiichi(hand, baseRound, {
      ...DEFAULT_RIICHI_ADAPTER_RULES,
      kiriageMangan: true,
      kazoeYakuman: false,
      doubleWindPairFu: 2
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      "riichi 不支持切上满贯配置，adapter 暂未补齐",
      "riichi 不支持关闭累计役满，adapter 暂未补齐",
      "riichi 不支持双风雀头符数配置，adapter 暂未补齐"
    ]);
  });
});
