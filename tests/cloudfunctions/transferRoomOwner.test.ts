import { describe, expect, it } from "vitest";
import { handleTransferRoomOwner } from "../../cloudfunctions/transferRoomOwner/src/index";
import type {
  CloudDatabase,
  CloudDatabaseCollection
} from "../../cloudfunctions/_shared/src/index";
import type { OnlineRoom, RoomScoringState } from "../../miniprogram/shared/domain";

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
      east: { openId: "openid-owner", displayName: "房主", joinedAt: 1 },
      south: { openId: "openid-member", displayName: "成员", joinedAt: 1 },
      west: undefined,
      north: undefined
    },
    status: "waiting",
    createdAt: 1,
    updatedAt: 1
  };
}

function createRoomState(): RoomScoringState {
  return {
    roomId: "room-1",
    version: 1,
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
    updatedBy: "openid-owner",
    updatedAt: 1
  };
}

function createStore(): MemoryStore {
  return {
    rooms: { "room-1": createRoom() },
    roomStates: { "room-1": createRoomState() }
  };
}

describe("转让在线房间房主云函数", () => {
  it("允许房主转让给已入座成员", async () => {
    const store = createStore();
    const result = await handleTransferRoomOwner(
      { roomId: "room-1", targetOpenId: "openid-member" },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-owner" }),
        now: () => 2
      }
    );

    expect(result.room.ownerOpenId).toBe("openid-member");
    expect(result.state.version).toBe(1);
    expect(store.rooms["room-1"].updatedAt).toBe(2);
  });

  it("拒绝普通成员发起转让", async () => {
    await expect(
      handleTransferRoomOwner(
        { roomId: "room-1", targetOpenId: "openid-member" },
        {
          db: createMemoryDatabase(createStore()),
          getContext: () => ({ OPENID: "openid-member" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("仅房主可转让房主");
  });

  it("拒绝转让给自己或未入座用户", async () => {
    const dependencies = {
      db: createMemoryDatabase(createStore()),
      getContext: () => ({ OPENID: "openid-owner" }),
      now: () => 2
    };

    await expect(
      handleTransferRoomOwner({ roomId: "room-1", targetOpenId: "openid-owner" }, dependencies)
    ).rejects.toThrow("不能将房主转让给自己");
    await expect(
      handleTransferRoomOwner({ roomId: "room-1", targetOpenId: "openid-stranger" }, dependencies)
    ).rejects.toThrow("目标成员不在当前房间");
  });
});
