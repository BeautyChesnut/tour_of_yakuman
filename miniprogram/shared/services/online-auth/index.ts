import type {
  CachedOnlineAuthSession,
  OnlineAuthCloudResult,
  OnlineAuthDependencies,
  OnlineAuthLoginResult,
  OnlineAuthService,
  OnlineAuthSession,
  OnlineAuthStorage
} from "./types";
import { callOnlineBackend } from "../online-backend/index";

const LOGIN_FUNCTION_NAME = "login";
const SESSION_STORAGE_KEY = "tourOfYakumanOnlineAuthSession";
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type {
  CachedOnlineAuthSession,
  OnlineAuthCloudResult,
  OnlineAuthDependencies,
  OnlineAuthLoginResult,
  OnlineAuthService,
  OnlineAuthSession,
  OnlineAuthStorage
} from "./types";
export type { OnlineAuthErrorKind, OnlineAuthErrorView } from "./errors";
export { createOnlineAuthErrorView } from "./errors";

export function createOnlineAuthService(
  dependencies: OnlineAuthDependencies = createWechatOnlineAuthDependencies()
): OnlineAuthService {
  const storage = dependencies.storage ?? createVolatileOnlineAuthStorage();
  const now = dependencies.now ?? Date.now;
  const sessionTtlMs = dependencies.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;

  return {
    async getSession(): Promise<OnlineAuthSession> {
      const cached = storage.get();

      if (cached && isCachedSessionValid(cached, now())) {
        return cached;
      }

      if (cached) {
        storage.remove();
      }

      return this.login();
    },

    async login(): Promise<OnlineAuthSession> {
      const loginResult = await dependencies.login();

      if (!loginResult.code) {
        throw new Error("微信登录失败，请重试");
      }

      const cloudResult = await dependencies.callLoginFunction(loginResult.code);

      if (!cloudResult.session?.openId) {
        throw new Error(`登录服务未返回有效用户身份：${describeLoginCloudResult(cloudResult)}`);
      }

      const session = cloudResult.session;
      storage.set({
        ...session,
        expiresAt: session.loggedInAt + sessionTtlMs
      });

      return session;
    },

    clearSession(): void {
      storage.remove();
    }
  };
}

function describeLoginCloudResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return `返回类型 ${typeof result}`;
  }

  const data = result as Record<string, unknown>;
  const fields = Object.keys(data);
  const session = data.session;

  if (session && typeof session === "object") {
    const sessionData = session as Record<string, unknown>;
    const sessionFields = Object.keys(sessionData);
    const openIdType = typeof sessionData.openId;

    return `返回字段 ${fields.join(",") || "无"}，session 字段 ${
      sessionFields.join(",") || "无"
    }，openId 类型 ${openIdType}`;
  }

  return `返回字段 ${fields.join(",") || "无"}，无 session`;
}

function createWechatOnlineAuthDependencies(): OnlineAuthDependencies {
  return {
    login: () =>
      new Promise<OnlineAuthLoginResult>((resolve, reject) => {
        wx.login({
          success: (result) => resolve({ code: result.code }),
          fail: () => reject(new Error("微信登录失败，请重试"))
        });
      }),
    callLoginFunction: (code) =>
      callOnlineBackend<OnlineAuthCloudResult>(LOGIN_FUNCTION_NAME, { code }),
    storage: createWechatOnlineAuthStorage(),
    now: Date.now,
    sessionTtlMs: DEFAULT_SESSION_TTL_MS
  };
}

function createWechatOnlineAuthStorage(): OnlineAuthStorage {
  return {
    get: () => {
      try {
        const value = wx.getStorageSync(SESSION_STORAGE_KEY) as CachedOnlineAuthSession | "";
        return value || undefined;
      } catch {
        return undefined;
      }
    },
    set: (session) => {
      wx.setStorageSync(SESSION_STORAGE_KEY, session);
    },
    remove: () => {
      wx.removeStorageSync(SESSION_STORAGE_KEY);
    }
  };
}

function isCachedSessionValid(session: CachedOnlineAuthSession, now: number): boolean {
  return Boolean(session.openId && session.user?.openId && session.expiresAt > now);
}

function createVolatileOnlineAuthStorage(): OnlineAuthStorage {
  let cached: CachedOnlineAuthSession | undefined;

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
