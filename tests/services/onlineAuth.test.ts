import { describe, expect, it, vi } from "vitest";
import {
  createOnlineAuthErrorView,
  createOnlineAuthService
} from "../../miniprogram/shared/services/online-auth";
import type {
  CachedOnlineAuthSession,
  OnlineAuthDependencies,
  OnlineAuthStorage
} from "../../miniprogram/shared/services/online-auth";

function createMemoryStorage(initial?: CachedOnlineAuthSession): OnlineAuthStorage {
  let cached = initial;

  return {
    get: () => cached,
    set: (session) => {
      cached = session;
    },
    remove: () => {
      cached = undefined;
    }
  };
}

describe("在线模式登录服务", () => {
  it("封装微信登录 code 并调用登录云函数", async () => {
    const now = 1_765_000_000_000;
    const dependencies: OnlineAuthDependencies = {
      login: vi.fn(async () => ({ code: "wx-code" })),
      callLoginFunction: vi.fn(async (code) => ({
        session: {
          openId: `openid-from-${code}`,
          loggedInAt: now,
          user: {
            openId: `openid-from-${code}`,
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now
          }
        }
      }))
    };

    const session = await createOnlineAuthService(dependencies).login();

    expect(dependencies.login).toHaveBeenCalledTimes(1);
    expect(dependencies.callLoginFunction).toHaveBeenCalledWith("wx-code");
    expect(session.openId).toBe("openid-from-wx-code");
  });

  it("微信登录未返回 code 时提示重试", async () => {
    const service = createOnlineAuthService({
      login: async () => ({ code: "" }),
      callLoginFunction: vi.fn()
    });

    await expect(service.login()).rejects.toThrow("微信登录失败，请重试");
  });

  it("登录云函数未返回 openId 时提示身份无效", async () => {
    const service = createOnlineAuthService({
      login: async () => ({ code: "wx-code" }),
      callLoginFunction: async () => ({
        session: {
          openId: "",
          loggedInAt: 0,
          user: {
            openId: "",
            createdAt: 0,
            updatedAt: 0,
            lastLoginAt: 0
          }
        }
      })
    });

    await expect(service.login()).rejects.toThrow("登录服务未返回有效用户身份");
  });

  it("优先复用未过期的本地会话缓存", async () => {
    const now = 1_765_000_000_000;
    const dependencies: OnlineAuthDependencies = {
      login: vi.fn(),
      callLoginFunction: vi.fn(),
      now: () => now,
      storage: createMemoryStorage({
        openId: "openid-cached",
        loggedInAt: now - 1000,
        expiresAt: now + 1000,
        user: {
          openId: "openid-cached",
          createdAt: now - 1000,
          updatedAt: now - 1000,
          lastLoginAt: now - 1000
        }
      })
    };

    const session = await createOnlineAuthService(dependencies).getSession();

    expect(session.openId).toBe("openid-cached");
    expect(dependencies.login).not.toHaveBeenCalled();
  });

  it("缓存过期时清除缓存并重新登录", async () => {
    const now = 1_765_000_000_000;
    const storage = createMemoryStorage({
      openId: "openid-expired",
      loggedInAt: now - 2000,
      expiresAt: now - 1000,
      user: {
        openId: "openid-expired",
        createdAt: now - 2000,
        updatedAt: now - 2000,
        lastLoginAt: now - 2000
      }
    });
    const dependencies: OnlineAuthDependencies = {
      login: vi.fn(async () => ({ code: "wx-code" })),
      callLoginFunction: vi.fn(async () => ({
        session: {
          openId: "openid-new",
          loggedInAt: now,
          user: {
            openId: "openid-new",
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now
          }
        }
      })),
      now: () => now,
      sessionTtlMs: 1000,
      storage
    };

    const session = await createOnlineAuthService(dependencies).getSession();

    expect(session.openId).toBe("openid-new");
    expect(storage.get()?.expiresAt).toBe(now + 1000);
  });

  it("可以主动清除本地会话缓存", async () => {
    const now = 1_765_000_000_000;
    const storage = createMemoryStorage({
      openId: "openid-cached",
      loggedInAt: now,
      expiresAt: now + 1000,
      user: {
        openId: "openid-cached",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      }
    });

    createOnlineAuthService({
      login: vi.fn(),
      callLoginFunction: vi.fn(),
      storage
    }).clearSession();

    expect(storage.get()).toBeUndefined();
  });

  it("把登录错误转换成可展示的重试和单机兜底提示", () => {
    expect(createOnlineAuthErrorView(new Error("微信登录失败，请重试"))).toMatchObject({
      kind: "wechat-login",
      retryLabel: "重试",
      fallbackLabel: "返回单机算点"
    });
    expect(createOnlineAuthErrorView(new Error("request fail"))).toMatchObject({
      kind: "network",
      message: "当前网络不可用，在线房间需要联网后使用"
    });
    expect(createOnlineAuthErrorView(new Error("登录服务未返回有效用户身份"))).toMatchObject({
      kind: "invalid-session"
    });
  });
});
