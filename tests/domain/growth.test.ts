import { describe, expect, it, vi } from "vitest";
import { calculateWithRiichi } from "../../miniprogram/shared/domain/scoring-adapter";
import {
  createExampleShareMetadata,
  createGrowthEventPayload,
  createHomeShareMetadata,
  createResultShareMetadata,
  createRoomShareMetadata,
  getCuratedScoringExample,
  parseGrowthLaunchContext,
  reportGrowthEvent
} from "../../miniprogram/shared/domain/growth";

describe("推广入口", () => {
  it("解析查询参数和 scene 中的匿名来源与示例", () => {
    expect(parseGrowthLaunchContext({ source: "XHS-001", example: "pinfu-tsumo" })).toEqual({
      source: "xhs-001",
      exampleId: "pinfu-tsumo"
    });
    expect(parseGrowthLaunchContext({ scene: "src%3Abili-02%2Cex%3Asanma-basic" })).toEqual({
      source: "bili-02",
      exampleId: "sanma-basic"
    });
  });

  it("拒绝过长来源和未注册示例", () => {
    expect(
      parseGrowthLaunchContext({
        source: "this-source-identifier-is-too-long",
        example: "unknown-hand"
      })
    ).toEqual({ source: "", exampleId: "" });
    expect(getCuratedScoringExample("unknown-hand")).toBeUndefined();
  });

  it("返回不可被外部修改的合法示例牌副本", () => {
    const first = getCuratedScoringExample("pinfu-tsumo");
    const second = getCuratedScoringExample("pinfu-tsumo");

    expect(first).toMatchObject({ gameVariant: "yonma", winType: "tsumo" });
    first?.concealedTiles.pop();
    expect(second?.concealedTiles).toHaveLength(13);
  });

  it.each(["pinfu-tsumo", "sanma-basic"])("示例牌 %s 可由真实引擎结算", (exampleId) => {
    const example = getCuratedScoringExample(exampleId);

    expect(example).toBeDefined();
    if (!example) {
      return;
    }

    const result = calculateWithRiichi(
      {
        concealedTiles: example.concealedTiles,
        winningTile: example.winningTile,
        melds: [],
        doraIndicators: [],
        kanDoraIndicators: [],
        uraDoraIndicators: [],
        conditions: {
          riichi: false,
          doubleRiichi: false,
          ippatsu: false,
          menzenTsumo: example.winType === "tsumo",
          haitei: false,
          houtei: false,
          rinshan: false,
          chankan: false,
          tenhou: false,
          chiihou: false,
          enableUraDora: false
        }
      },
      {
        roundWind: "east",
        honba: 0,
        riichiSticks: 0,
        dealer: "east",
        winner: example.winner,
        winType: example.winType,
        ...(example.discarder ? { discarder: example.discarder } : {}),
        playerCount: example.gameVariant === "sanma" ? 3 : 4
      }
    );

    expect(result.valid, result.errors.join("；")).toBe(true);
  });

  it("按首页、房间、示例和结果生成分享信息", () => {
    expect(createHomeShareMetadata().title).toContain("四麻三麻");
    expect(createRoomShareMetadata("123456").path).toContain("roomCode=123456");
    expect(createExampleShareMetadata("sanma-basic").path).toContain("example=sanma-basic");
    expect(createResultShareMetadata("sanma", "满贯 5番").title).toContain("三麻 满贯 5番");
  });

  it("匿名事件只保留白名单字段且上报失败不影响调用", () => {
    expect(
      createGrowthEventPayload({
        source: "douyin-1",
        exampleId: "pinfu-tsumo",
        mode: "local",
        playerCount: 4,
        shareContext: "result"
      })
    ).toEqual({
      source: "douyin-1",
      example_id: "pinfu-tsumo",
      mode: "local",
      player_count: 4,
      share_context: "result"
    });

    const reporter = vi.fn(() => {
      throw new Error("analytics unavailable");
    });
    expect(() => reportGrowthEvent(reporter, "growth_open", { source: "xhs-1" })).not.toThrow();
  });
});
