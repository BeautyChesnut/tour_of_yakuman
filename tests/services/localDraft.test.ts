import { describe, expect, it } from "vitest";
import { createLocalDraftStorage } from "../../miniprogram/shared/services/local-draft";
import type {
  LocalDraftSnapshot,
  LocalDraftStorageAdapter
} from "../../miniprogram/shared/services/local-draft";
import type { RoomSharedScoringData } from "../../miniprogram/shared/domain";

function createSharedState(): RoomSharedScoringData {
  return {
    round: {
      roundWind: "east",
      roundIndex: 0,
      honba: 0,
      riichiSticks: 0,
      dealer: "east",
      eventType: "ron",
      winType: "ron",
      winner: "south",
      discarder: "west"
    },
    playerPoints: { east: 25000, south: 25000, west: 25000, north: 25000 },
    hand: { concealedTiles: ["1m", "2m"], winningTile: "3m", melds: [] },
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
  };
}

function createMemoryAdapter(): LocalDraftStorageAdapter & { value?: LocalDraftSnapshot } {
  return {
    value: undefined,
    get() {
      return this.value;
    },
    set(value) {
      this.value = value;
    },
    remove() {
      this.value = undefined;
    }
  };
}

describe("本地算点草稿", () => {
  it("自动保存并恢复相同玩法草稿", () => {
    const adapter = createMemoryAdapter();
    const storage = createLocalDraftStorage(adapter, () => 1000);

    storage.save({
      gameVariant: "yonma",
      sharedState: createSharedState(),
      nukiDoraCount: 0,
      liabilitySeat: ""
    });

    expect(storage.load("yonma")?.sharedState.hand.winningTile).toBe("3m");
    expect(storage.load("sanma")).toBeUndefined();
  });

  it("忽略并清理超过七天的旧草稿", () => {
    const adapter = createMemoryAdapter();
    const storage = createLocalDraftStorage(adapter, () => 1000);

    storage.save({
      gameVariant: "sanma",
      sharedState: createSharedState(),
      nukiDoraCount: 2,
      liabilitySeat: "south"
    });

    const laterStorage = createLocalDraftStorage(adapter, () => 1000 + 8 * 24 * 60 * 60 * 1000);

    expect(laterStorage.load("sanma")).toBeUndefined();
    expect(adapter.value).toBeUndefined();
  });
});
