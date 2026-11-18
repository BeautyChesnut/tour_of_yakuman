import { describe, expect, it } from "vitest";
import { handleLogin } from "../../cloudfunctions/login/src/index";
import type {
  CloudDatabase,
  CloudDatabaseCollection
} from "../../cloudfunctions/_shared/src/index";
import type { UserProfile } from "../../miniprogram/shared/domain/online-room";

function createMemoryDatabase(initialUsers: Record<string, UserProfile> = {}): CloudDatabase {
  const users = { ...initialUsers };

  return {
    collection: <T>() =>
      ({
        doc: (id: string) => ({
          get: async () => ({ data: users[id] as T | undefined }),
          set: async ({ data }: { data: T }) => {
            users[id] = data as UserProfile;
          },
          update: async ({ data }: { data: Partial<T> }) => {
            users[id] = {
              ...(users[id] as UserProfile),
              ...(data as Partial<UserProfile>)
            };
          }
        })
      }) satisfies CloudDatabaseCollection<T>
  };
}

describe("登录云函数", () => {
  it("首次登录时创建用户并返回 session", async () => {
    const now = 1_765_000_000_000;
    const result = await handleLogin(
      { displayName: "东家", avatarUrl: "avatar.png" },
      {
        db: createMemoryDatabase(),
        getContext: () => ({ OPENID: "openid-owner" }),
        now: () => now
      }
    );

    expect(result.session.openId).toBe("openid-owner");
    expect(result.session.user.displayName).toBe("东家");
    expect(result.session.user.membership).toEqual({ plan: "free" });
    expect(result.session.user.createdAt).toBe(now);
    expect(result.session.user.lastLoginAt).toBe(now);
  });

  it("再次登录时更新展示信息和最近登录时间", async () => {
    const oldTime = 1_765_000_000_000;
    const now = oldTime + 1000;
    const result = await handleLogin(
      { displayName: "南家" },
      {
        db: createMemoryDatabase({
          "openid-owner": {
            openId: "openid-owner",
            displayName: "东家",
            avatarUrl: "avatar.png",
            membership: { plan: "vip", expiresAt: now + 60_000 },
            createdAt: oldTime,
            updatedAt: oldTime,
            lastLoginAt: oldTime
          }
        }),
        getContext: () => ({ OPENID: "openid-owner" }),
        now: () => now
      }
    );

    expect(result.session.user.displayName).toBe("南家");
    expect(result.session.user.avatarUrl).toBe("avatar.png");
    expect(result.session.user.membership).toEqual({
      plan: "vip",
      expiresAt: now + 60_000
    });
    expect(result.session.user.createdAt).toBe(oldTime);
    expect(result.session.user.updatedAt).toBe(now);
  });

  it("无法获取 openId 时拒绝登录", async () => {
    await expect(
      handleLogin(
        {},
        {
          db: createMemoryDatabase(),
          getContext: () => ({}),
          now: () => 0
        }
      )
    ).rejects.toThrow("无法获取微信用户身份");
  });
});
