import { describe, expect, it } from "vitest";
import { handleUpdateRoomState } from "../../cloudfunctions/updateRoomState/src/index";
import type {
  CloudDatabase,
  CloudDatabaseCollection
} from "../../cloudfunctions/_shared/src/index";
import type {
  OnlineRoom,
  RoomScoringState,
  RoomSharedScoringData
} from "../../miniprogram/shared/domain";

interface MemoryStore {
  rooms: Record<string, OnlineRoom>;
  roomStates: Record<string, RoomScoringState>;
}

function createMemoryDatabase(store: MemoryStore): CloudDatabase {
  return {
    collection: <T>(name: string) =>
      ({
        doc: (id: string) => ({
          get: async () => ({ data: getCollection(store, name)[id] as T | undefined }),
          set: async ({ data }: { data: T }) => {
            getCollection(store, name)[id] = data as OnlineRoom | RoomScoringState;
          },
          update: async ({ data }: { data: Partial<T> }) => {
            getCollection(store, name)[id] = {
              ...(getCollection(store, name)[id] as object),
              ...data
            } as unknown as OnlineRoom | RoomScoringState;
          }
        })
      }) satisfies CloudDatabaseCollection<T>
  };
}

function getCollection(
  store: MemoryStore,
  name: string
): Record<string, OnlineRoom | RoomScoringState> {
  return name === "rooms" ? store.rooms : store.roomStates;
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

function createSharedState(overrides: Partial<RoomSharedScoringData> = {}): RoomSharedScoringData {
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
    recordIds: [],
    ...overrides
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

describe("更新房间共享状态云函数", () => {
  it("允许房主更新共享状态并递增版本", async () => {
    const store = {
      rooms: { "room-1": createRoom() },
      roomStates: { "room-1": createRoomState() }
    };
    const result = await handleUpdateRoomState(
      {
        roomId: "room-1",
        baseVersion: 1,
        sharedState: createSharedState({
          round: {
            ...createSharedState().round,
            honba: 2
          }
        })
      },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-owner" }),
        now: () => 2
      }
    );

    expect(result.state.version).toBe(2);
    expect(result.state.round.honba).toBe(2);
    expect(result.state.updatedBy).toBe("openid-owner");
    expect(store.roomStates["room-1"].version).toBe(2);
  });

  it("拒绝非房主更新共享状态", async () => {
    await expect(
      handleUpdateRoomState(
        {
          roomId: "room-1",
          baseVersion: 1,
          sharedState: createSharedState()
        },
        {
          db: createMemoryDatabase({
            rooms: { "room-1": createRoom() },
            roomStates: { "room-1": createRoomState() }
          }),
          getContext: () => ({ OPENID: "openid-member" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("仅房主可编辑");
  });

  it("拒绝基于过期版本覆盖最新房间状态", async () => {
    const store = {
      rooms: { "room-1": createRoom() },
      roomStates: { "room-1": createRoomState({ version: 3 }) }
    };

    await expect(
      handleUpdateRoomState(
        {
          roomId: "room-1",
          baseVersion: 2,
          sharedState: createSharedState({
            round: {
              ...createSharedState().round,
              honba: 2
            }
          })
        },
        {
          db: createMemoryDatabase(store),
          getContext: () => ({ OPENID: "openid-owner" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("房间状态已更新，请刷新后重试");

    expect(store.roomStates["room-1"].version).toBe(3);
    expect(store.roomStates["room-1"].round.honba).toBe(0);
  });
});
