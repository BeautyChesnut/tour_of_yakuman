import { describe, expect, it } from "vitest";
import { handleCreateRoom } from "../../cloudfunctions/createRoom/src/index";
import type {
  CloudDatabase,
  CloudDatabaseCollection
} from "../../cloudfunctions/_shared/src/index";
import type { OnlineRoom, RoomScoringState } from "../../miniprogram/shared/domain";

function createMemoryDatabase(store: Record<string, Record<string, unknown>> = {}): CloudDatabase {
  return {
    collection: <T>(name: string) => {
      store[name] = store[name] ?? {};

      return {
        doc: (id: string) => ({
          get: async () => ({ data: store[name][id] as T | undefined }),
          set: async ({ data }: { data: T }) => {
            store[name][id] = data;
          },
          update: async ({ data }: { data: Partial<T> }) => {
            store[name][id] = {
              ...(store[name][id] as object),
              ...data
            };
          }
        })
      } satisfies CloudDatabaseCollection<T>;
    }
  };
}

describe("创建房间云函数", () => {
  it("创建房间并初始化房主座位和共享状态", async () => {
    const now = 1_765_000_000_000;
    const store: Record<string, Record<string, unknown>> = {};
    const result = await handleCreateRoom(
      { seat: "south", displayName: "南家", avatarUrl: "avatar.png" },
      {
        db: createMemoryDatabase(store),
        getContext: () => ({ OPENID: "openid-owner" }),
        now: () => now,
        createRoomId: () => "room-1",
        createRoomCode: () => "123456",
        roomTtlMs: 60_000
      }
    );

    expect(result.room).toMatchObject({
      id: "room-1",
      roomCode: "123456",
      ownerOpenId: "openid-owner",
      status: "waiting",
      expiresAt: now + 60_000
    });
    expect(result.room.seatMap.south?.displayName).toBe("南家");
    expect(result.room.seatMap.east).toBeUndefined();
    expect(result.state).toMatchObject({
      roomId: "room-1",
      version: 1,
      updatedBy: "openid-owner"
    });
    expect(result.state.playerPoints.east).toBe(25000);
    expect((store.rooms["room-1"] as OnlineRoom).roomCode).toBe("123456");
    expect((store.roomStates["room-1"] as RoomScoringState).version).toBe(1);
  });

  it("缺少 openId 时拒绝创建房间", async () => {
    await expect(
      handleCreateRoom(
        {},
        {
          db: createMemoryDatabase(),
          getContext: () => ({}),
          now: () => 0,
          createRoomId: () => "room-1",
          createRoomCode: () => "123456"
        }
      )
    ).rejects.toThrow("无法获取微信用户身份");
  });
});
