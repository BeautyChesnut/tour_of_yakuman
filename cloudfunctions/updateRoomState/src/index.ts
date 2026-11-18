import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  UpdateRoomStateCloudEvent,
  UpdateRoomStateCloudResult
} from "../../_shared/src/index";
import { createNextRoomStateVersion } from "../../../miniprogram/shared/domain/index";
import type { OnlineRoom, RoomScoringState } from "../../../miniprogram/shared/domain/index";

interface UpdateRoomStateDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
}

export async function main(event: UpdateRoomStateCloudEvent): Promise<UpdateRoomStateCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  return handleUpdateRoomState(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now
  });
}

export async function handleUpdateRoomState(
  event: UpdateRoomStateCloudEvent,
  dependencies: UpdateRoomStateDependencies
): Promise<UpdateRoomStateCloudResult> {
  const openId = dependencies.getContext().OPENID;

  if (!openId) {
    throw new Error("无法获取微信用户身份");
  }

  if (!event.roomId) {
    throw new Error("缺少房间 ID");
  }

  const rooms = dependencies.db.collection<OnlineRoom>(CLOUD_COLLECTIONS.rooms);
  const states = dependencies.db.collection<RoomScoringState>(CLOUD_COLLECTIONS.roomStates);
  const room = (await rooms.doc(event.roomId).get()).data;

  if (!room) {
    throw new Error("房间不存在或已失效");
  }

  if (room.ownerOpenId !== openId) {
    throw new Error("仅房主可编辑");
  }

  const currentState = (await states.doc(event.roomId).get()).data;

  if (!currentState) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  if (event.baseVersion !== currentState.version) {
    throw new Error("房间状态已更新，请刷新后重试");
  }

  const now = dependencies.now();
  const nextState: RoomScoringState = {
    ...currentState,
    ...event.sharedState,
    roomId: event.roomId,
    version: createNextRoomStateVersion(currentState.version),
    updatedBy: openId,
    updatedAt: now
  };

  await states.doc(event.roomId).update({
    data: nextState
  });

  return { state: nextState };
}
