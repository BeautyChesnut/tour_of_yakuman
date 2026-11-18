import { describe, expect, it } from "vitest";
import { handleJoinRoom } from "../../cloudfunctions/joinRoom/src/index";
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
        }),
        where: (query: Partial<T>) => ({
          limit: (count: number) => ({
            get: async () => ({
              data: Object.values(getCollection(store, name))
                .filter((item) =>
                  Object.entries(query).every(
                    ([key, value]) => (item as unknown as Record<string, unknown>)[key] === value
                  )
                )
                .slice(0, count) as T[]
            })
          })
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

function createRoom(overrides: Partial<OnlineRoom> = {}): OnlineRoom {
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
    updatedAt: 1,
    expiresAt: 999,
    ...overrides
  };
}

function createState(): RoomScoringState {
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
    playerPoints: {
      east: 25000,
      south: 25000,
      west: 25000,
      north: 25000
    },
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

describe("加入房间云函数", () => {
  it("通过房间码加入未满员房间并绑定请求座位", async () => {
    const store = {
      rooms: { "room-1": createRoom() },
      roomStates: { "room-1": createState() }
    };
    const result = await handleJoinRoom(
      { roomCode: "123456", seat: "south", displayName: "南家" },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-member" }),
        now: () => 2
      }
    );

    expect(result.room.id).toBe("room-1");
    expect(result.state.version).toBe(1);
    expect(result.room.seatMap.south).toEqual({
      openId: "openid-member",
      displayName: "南家",
      avatarUrl: undefined,
      joinedAt: 2
    });
    expect(store.rooms["room-1"].seatMap.south?.openId).toBe("openid-member");
    expect(store.rooms["room-1"].updatedAt).toBe(2);
  });

  it("未指定座位时随机绑定一个空座位", async () => {
    const store = {
      rooms: { "room-1": createRoom() },
      roomStates: { "room-1": createState() }
    };
    const result = await handleJoinRoom(
      { roomCode: "123456" },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-member" }),
        now: () => 2
      }
    );

    const occupiedSeats = (["south", "west", "north"] as const).filter(
      (seat) => result.room.seatMap[seat]?.openId === "openid-member"
    );

    expect(occupiedSeats).toHaveLength(1);
    expect(result.room.seatMap.east?.openId).toBe("openid-owner");
  });

  it("已在房间内的成员重复进入时不重复占座", async () => {
    const store = {
      rooms: {
        "room-1": createRoom({
          seatMap: {
            east: { openId: "openid-east", joinedAt: 1 },
            south: { openId: "openid-south", joinedAt: 1 },
            west: { openId: "openid-west", joinedAt: 1 },
            north: { openId: "openid-north", joinedAt: 1 }
          }
        })
      },
      roomStates: { "room-1": createState() }
    };
    const result = await handleJoinRoom(
      { roomCode: "123456" },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-west" }),
        now: () => 2
      }
    );

    expect(result.room.seatMap.west?.openId).toBe("openid-west");
    expect(result.room.updatedAt).toBe(1);
  });

  it("拒绝不存在的房间码", async () => {
    await expect(
      handleJoinRoom(
        { roomCode: "000000" },
        {
          db: createMemoryDatabase({ rooms: {}, roomStates: {} }),
          getContext: () => ({ OPENID: "openid-member" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("房间不存在或已失效");
  });

  it("拒绝已满员的新成员", async () => {
    await expect(
      handleJoinRoom(
        { roomCode: "123456" },
        {
          db: createMemoryDatabase({
            rooms: {
              "room-1": createRoom({
                seatMap: {
                  east: { openId: "openid-east", joinedAt: 1 },
                  south: { openId: "openid-south", joinedAt: 1 },
                  west: { openId: "openid-west", joinedAt: 1 },
                  north: { openId: "openid-north", joinedAt: 1 }
                }
              })
            },
            roomStates: { "room-1": createState() }
          }),
          getContext: () => ({ OPENID: "openid-new" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("房间人数已满");
  });

  it("拒绝加入已被占用的座位", async () => {
    await expect(
      handleJoinRoom(
        { roomCode: "123456", seat: "east" },
        {
          db: createMemoryDatabase({
            rooms: { "room-1": createRoom() },
            roomStates: { "room-1": createState() }
          }),
          getContext: () => ({ OPENID: "openid-new" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("座位已被占用，请选择其他空座位");
  });

  it("拒绝已过期房间", async () => {
    await expect(
      handleJoinRoom(
        { roomCode: "123456" },
        {
          db: createMemoryDatabase({
            rooms: { "room-1": createRoom({ expiresAt: 1 }) },
            roomStates: { "room-1": createState() }
          }),
          getContext: () => ({ OPENID: "openid-member" }),
          now: () => 2
        }
      )
    ).rejects.toThrow("房间已失效");
  });
});
