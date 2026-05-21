import { describe, expect, it } from "vitest";
import { validateHandInput } from "../../miniprogram/shared/domain/hand";
import type { HandInput } from "../../miniprogram/shared/domain/hand";

const baseHand: HandInput = {
  concealedTiles: [
    "1m",
    "2m",
    "3m",
    "4p",
    "5p",
    "6p",
    "7s",
    "8s",
    "9s",
    "east",
    "east",
    "white",
    "white"
  ],
  winningTile: "white",
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

describe("手牌输入校验", () => {
  it("接受完整的基础手牌输入", () => {
    const result = validateHandInput(baseHand);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("缺少和牌张时阻止结算", () => {
    const result = validateHandInput({
      ...baseHand,
      winningTile: undefined
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("需要选择和牌张");
  });

  it("校验同一种牌不能超过四张", () => {
    const result = validateHandInput({
      ...baseHand,
      concealedTiles: ["5m", "5m", "5m", "5m", "red5m"],
      winningTile: "1p"
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("五万数量超过四张");
  });

  it("校验吃面子必须是同花色连续三张数牌", () => {
    const result = validateHandInput({
      ...baseHand,
      melds: [
        {
          type: "chi",
          tiles: ["7m", "8m", "9m"],
          open: true
        },
        {
          type: "chi",
          tiles: ["east", "south", "west"],
          open: true
        }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("吃面子必须是同花色连续三张数牌");
  });

  it("校验碰和杠必须由相同牌组成", () => {
    const ponResult = validateHandInput({
      ...baseHand,
      melds: [{ type: "pon", tiles: ["1m", "1m", "2m"], open: true }]
    });
    const kanResult = validateHandInput({
      ...baseHand,
      melds: [{ type: "ankan", tiles: ["south", "south", "south", "west"], open: false }]
    });

    expect(ponResult.errors).toContain("碰面子必须由三张相同牌组成");
    expect(kanResult.errors).toContain("暗杠面子必须由四张相同牌组成");
  });

  it("立直时要求宝牌和里宝牌指示牌数量一致", () => {
    const result = validateHandInput({
      ...baseHand,
      doraIndicators: ["4p", "east"],
      uraDoraIndicators: ["4p"],
      conditions: {
        ...baseHand.conditions,
        riichi: true
      }
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("立直时宝牌和里宝牌指示牌数量需要一致");
  });

  it("两立直时宝牌和里宝牌指示牌数量一致则通过校验", () => {
    const result = validateHandInput({
      ...baseHand,
      doraIndicators: ["4p"],
      uraDoraIndicators: ["4p"],
      conditions: {
        ...baseHand.conditions,
        doubleRiichi: true
      }
    });

    expect(result.valid).toBe(true);
    expect(result.errors).not.toContain("立直时宝牌和里宝牌指示牌数量需要一致");
  });
});
