import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  TransferRoomOwnerCloudEvent,
  TransferRoomOwnerCloudResult
} from "../../_shared/src/index";
import { SEATS } from "../../../miniprogram/shared/domain/index";
import type { OnlineRoom, RoomScoringState } from "../../../miniprogram/shared/domain/index";

interface TransferRoomOwnerDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
}

export async function main(
  event: TransferRoomOwnerCloudEvent
): Promise<TransferRoomOwnerCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

  return handleTransferRoomOwner(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now
  });
}

export async function handleTransferRoomOwner(
  event: TransferRoomOwnerCloudEvent,
  dependencies: TransferRoomOwnerDependencies
): Promise<TransferRoomOwnerCloudResult> {
  const openId = dependencies.getContext().OPENID;
  const targetOpenId = event.targetOpenId?.trim();

  if (!openId) {
    throw new Error("无法获取微信用户身份");
  }
  if (!event.roomId) {
    throw new Error("缺少房间 ID");
  }
  if (!targetOpenId) {
    throw new Error("请选择要转让的成员");
  }

  const rooms = dependencies.db.collection<OnlineRoom>(CLOUD_COLLECTIONS.rooms);
  const states = dependencies.db.collection<RoomScoringState>(CLOUD_COLLECTIONS.roomStates);
  const room = (await rooms.doc(event.roomId).get()).data;

  if (!room || room.status === "closed" || room.status === "expired") {
    throw new Error("房间不存在或已失效");
  }
  if (room.ownerOpenId !== openId) {
    throw new Error("仅房主可转让房主");
  }
  if (targetOpenId === openId) {
    throw new Error("不能将房主转让给自己");
  }
  if (!SEATS.some((seat) => room.seatMap[seat]?.openId === targetOpenId)) {
    throw new Error("目标成员不在当前房间");
  }

  const state = (await states.doc(event.roomId).get()).data;

  if (!state) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  const updatedAt = dependencies.now();
  const nextRoom: OnlineRoom = { ...room, ownerOpenId: targetOpenId, updatedAt };

  await rooms.doc(event.roomId).update({ data: { ownerOpenId: targetOpenId, updatedAt } });

  return { room: nextRoom, state };
}
