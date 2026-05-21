import { describe, expect, it } from "vitest";
import {
  compareTiles,
  countTiles,
  getDoraFromIndicator,
  getTileDisplayName,
  normalizeRedTile,
  validateTileCounts
} from "../../miniprogram/shared/domain/tiles";

describe("牌工具", () => {
  it("赤五在计数和牌型判断中归一为普通五", () => {
    expect(normalizeRedTile("red5m")).toBe("5m");
    expect(normalizeRedTile("red5p")).toBe("5p");
    expect(normalizeRedTile("5s")).toBe("5s");

    expect(countTiles(["5m", "red5m", "5m"])).toEqual({
      "5m": 3
    });
  });

  it("按万筒索字顺序排序，并把赤五排在普通五之后", () => {
    const tiles = ["east", "1s", "red5m", "5m", "9p", "white", "1m"] as const;

    expect([...tiles].sort(compareTiles)).toEqual([
      "1m",
      "5m",
      "red5m",
      "9p",
      "1s",
      "east",
      "white"
    ]);
  });

  it("把宝牌指示牌转换为实际宝牌", () => {
    expect(getDoraFromIndicator("3m")).toBe("4m");
    expect(getDoraFromIndicator("9p")).toBe("1p");
    expect(getDoraFromIndicator("north")).toBe("east");
    expect(getDoraFromIndicator("red")).toBe("white");
    expect(getDoraFromIndicator("red5s")).toBe("6s");
  });

  it("输出中文展示名", () => {
    expect(getTileDisplayName("1m")).toBe("一万");
    expect(getTileDisplayName("9p")).toBe("九筒");
    expect(getTileDisplayName("red5s")).toBe("赤五索");
    expect(getTileDisplayName("green")).toBe("发");
  });

  it("校验同一种牌和赤五数量", () => {
    expect(validateTileCounts(["5m", "5m", "5m", "red5m"]).valid).toBe(true);
    expect(validateTileCounts(["5m", "5m", "5m", "5m", "red5m"]).errors).toContain(
      "五万数量超过四张"
    );
    expect(validateTileCounts(["red5p", "red5p"]).errors).toContain("赤五筒数量超过一张");
  });
});
