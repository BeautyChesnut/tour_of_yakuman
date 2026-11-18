import { describe, expect, it } from "vitest";
import {
  createDraftPatchFromRoomSharedScoringData,
  createRoomSharedScoringDataFromDraft
} from "../../miniprogram/shared/services/online-room";
import type { LocalScoringDraftLike } from "../../miniprogram/shared/services/online-room";

function createDraft(overrides: Partial<LocalScoringDraftLike> = {}): LocalScoringDraftLike {
  return {
    roundWind: "east",
    roundIndex: 0,
    honba: 1,
    riichiSticks: 1,
    dealer: "east",
    eventType: "ron",
    winType: "ron",
    winner: "south",
    ronWinners: ["south"],
    discarder: "west",
    tenpaiSeats: { east: false, south: true, west: false, north: false },
    playerPoints: { east: 25000, south: 24000, west: 26000, north: 25000 },
    concealedTiles: ["1m", "2m", "", "3m"],
    winningTile: ["3m"],
    melds: [{ type: "chi", tiles: ["1m", "2m", "3m"], open: true, calledTile: "3m" }],
    doraIndicators: ["4p", ""],
    kanDoraIndicators: [],
    uraDoraIndicators: ["east"],
    conditions: {
      riichi: true,
      doubleRiichi: false,
      ippatsu: false,
      menzenTsumo: false,
      haitei: false,
      houtei: false,
      rinshan: false,
      chankan: false,
      tenhou: false,
      chiihou: false,
      enableUraDora: true
    },
    riichiSeats: { east: false, south: true, west: false, north: false },
    recordIds: ["record-1"],
    recentRecordId: "record-1",
    ...overrides
  };
}

describe("房间共享算点状态 adapter", () => {
  it("从单机 draft 抽取可持久化共享状态", () => {
    const sharedState = createRoomSharedScoringDataFromDraft(createDraft());

    expect(sharedState.round).toMatchObject({
      roundWind: "east",
      honba: 1,
      dealer: "east",
      winner: "south",
      discarder: "west"
    });
    expect(sharedState.hand.concealedTiles).toEqual(["1m", "2m", "3m"]);
    expect(sharedState.hand.winningTile).toBe("3m");
    expect(sharedState.hand.melds).toHaveLength(1);
    expect(sharedState.conditions.riichi).toBe(true);
    expect(sharedState.riichiSeats.south).toBe(true);
    expect(sharedState.recordIds).toEqual(["record-1"]);
  });

  it("从共享状态生成单机 draft patch 且不包含本地 UI 状态", () => {
    const sharedState = createRoomSharedScoringDataFromDraft(createDraft());
    const patch = createDraftPatchFromRoomSharedScoringData(sharedState);

    expect(patch).toMatchObject({
      roundWind: "east",
      winner: "south",
      discarder: "west",
      concealedTiles: ["1m", "2m", "3m"],
      winningTile: ["3m"],
      doraIndicators: ["4p"]
    });
    expect(Object.keys(patch)).not.toContain("editingPanel");
    expect(Object.keys(patch)).not.toContain("activeTileArea");
    expect(Object.keys(patch)).not.toContain("errors");
  });
});
