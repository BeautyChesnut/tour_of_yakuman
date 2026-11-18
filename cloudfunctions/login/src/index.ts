import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  LoginCloudEvent,
  LoginCloudResult
} from "../../_shared/src/index";
import type { UserProfile } from "../../../miniprogram/shared/domain/online-room/index";
import {
  FREE_MEMBERSHIP,
  normalizeMembershipEntitlement
} from "../../../miniprogram/shared/domain/membership/index";

interface LoginDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
}

export async function main(event: LoginCloudEvent = {}): Promise<LoginCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  return handleLogin(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now
  });
}

export async function handleLogin(
  event: LoginCloudEvent,
  dependencies: LoginDependencies
): Promise<LoginCloudResult> {
  const openId = dependencies.getContext().OPENID;

  if (!openId) {
    throw new Error("无法获取微信用户身份");
  }

  const now = dependencies.now();
  const users = dependencies.db.collection<UserProfile>(CLOUD_COLLECTIONS.users);
  const existing = await users.doc(openId).get();
  const user: UserProfile = existing.data
    ? {
        ...existing.data,
        displayName: event.displayName ?? existing.data.displayName,
        avatarUrl: event.avatarUrl ?? existing.data.avatarUrl,
        membership: normalizeMembershipEntitlement(existing.data.membership),
        updatedAt: now,
        lastLoginAt: now
      }
    : {
        openId,
        displayName: event.displayName,
        avatarUrl: event.avatarUrl,
        membership: { ...FREE_MEMBERSHIP },
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      };

  if (existing.data) {
    await users.doc(openId).update({ data: user });
  } else {
    await users.doc(openId).set({ data: user });
  }

  return {
    session: {
      openId,
      user,
      loggedInAt: now
    }
  };
}
