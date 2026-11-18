import { describe, expect, it } from "vitest";
import { handleConfirmSettlement } from "../../cloudfunctions/confirmSettlement/src/index";
import type {
  CloudDatabase,
  CloudDatabaseCollection
} from "../../cloudfunctions/_shared/src/index";
import type {
  OnlineRoom,
  RoomScoringState,
  RoomSettlementRecord,
  RoomSharedScoringData,
  SettlementRecord
} from "../../miniprogram/shared/domain";

interface MemoryStore {
  rooms: Record<string, OnlineRoom>;
  roomStates: Record<string, RoomScoringState>;
  roomSettlementRecords: Record<string, RoomSettlementRecord>;
}

function createMemoryDatabase(store: MemoryStore): CloudDatabase {
  return {
    collection: <T>(name: string) =>
      ({
        doc: (id: string) => ({
          get: async () => ({ data: getCollection(store, name)[id] as T | undefined }),
          set: async ({ data }: { data: T }) => {
            getCollection(store, name)[id] = data as
              | OnlineRoom
              | RoomScoringState
              | RoomSettlementRecord;
          },
          update: async ({ data }: { data: Partial<T> }) => {
            getCollection(store, name)[id] = {
              ...(getCollection(store, name)[id] as object),
              ...data
            } as unknown as OnlineRoom | RoomScoringState | RoomSettlementRecord;
          }
        })
      }) satisfies CloudDatabaseCollection<T>
  };
}

function getCollection(
  store: MemoryStore,
  name: string
): Record<string, OnlineRoom | RoomScoringState | RoomSettlementRecord> {
  if (name === "rooms") {
    return store.rooms;
  }
  if (name === "roomStates") {
    return store.roomStates;
  }
  return store.roomSettlementRecords;
}

function createRoom(): OnlineRoom {
  return {
    id: "room-1",
    roomCode: "123456",
    ownerOpenId: "openid-owner",
    seatMap: {
      east: { openId: "openid-owner", joinedAt: 1 },
      south: undefined,
      west: undefined,
      north: undefined
    },
    status: "waiting",
    createdAt: 1,
    updatedAt: 1
  };
}

function createSharedState(): RoomSharedScoringData {
  return {
    round: {
      roundWind: "east",
      roundIndex: 0,
      honba: 0,
      riichiSticks: 0,
      dealer: "east",
      eventType: "ron",
      winType: "ron"
    },
    playerPoints: { east: 25000, south: 25000, west: 25000, north: 25000 },
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
  };
}

function createRoomState(overrides: Partial<RoomScoringState> = {}): RoomScoringState {
  return {
    roomId: "room-1",
    version: 1,
    ...createSharedState(),
    updatedBy: "openid-owner",
    updatedAt: 1,
    ...overrides
  };
}

function createSettlementRecord(overrides: Partial<SettlementRecord> = {}): SettlementRecord {
  return {
    id: "record-1",
    event: { type: "tsumo", winner: "east" },
    result: {
      valid: true,
      errors: [],
      warnings: [],
      yaku: [],
      dora: [],
      han: 1,
      fu: 30,
      fuDetails: [],
      basePoints: 240,
      payments: [],
      pointDelta: { east: 1000, south: -300, west: -300, north: -400 }
    },
    pointsAfter: { east: 26000, south: 24700, west: 24700, north: 24600 },
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    ...overrides
  };
}

describe("确认房间结算云函数", () => {
  it("允许房主写入结算记录并更新房间点数", async () => {
    const store: MemoryStore = {
      rooms: { "room-1": createRoom() },
      roomStates: { "room-1": createRoomState() },
      roomSettlementRecords: {}
    };
    const result = await handleConfirmSettlement(
      { roomId: "room-1", baseVersion: 1, record: createSettlementRecord() },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-owner" }),
        now: () => 2
      }
    );

    expect(result.state.version).toBe(2);
    expect(result.state.playerPoints.east).toBe(26000);
    expect(result.state.recentRecordId).toBe("record-1");
    expect(store.roomSettlementRecords["room-1_record-1"].createdBy).toBe("openid-owner");
  });

  it("拒绝非房主确认结算", async () => {
    await expect(
      handleConfirmSettlement(
        { roomId: "room-1", baseVersion: 1, record: createSettlementRecord() },
        {
          db: createMemoryDatabase({
            rooms: { "room-1": createRoom() },
            roomStates: { "room-1": createRoomState() },
            roomSettlementRecords: {}
          }),
          getContext: () => ({ OPENID: "openid-member" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("仅房主可确认结算");
  });

  it("重新确认同一局时覆盖最近记录且不重复追加记录 ID", async () => {
    const store: MemoryStore = {
      rooms: { "room-1": createRoom() },
      roomStates: {
        "room-1": createRoomState({
          recordIds: ["record-1"],
          recentRecordId: "record-1"
        })
      },
      roomSettlementRecords: {}
    };
    const result = await handleConfirmSettlement(
      {
        roomId: "room-1",
        baseVersion: 1,
        record: createSettlementRecord({
          pointsAfter: { east: 27000, south: 24000, west: 24500, north: 24500 }
        })
      },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-owner" }),
        now: () => 2
      }
    );

    expect(result.state.recordIds).toEqual(["record-1"]);
    expect(result.state.playerPoints.east).toBe(27000);
  });
});
