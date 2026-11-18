import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  ConfirmSettlementCloudEvent,
  ConfirmSettlementCloudResult
} from "../../_shared/src/index";
import { createNextRoomStateVersion } from "../../../miniprogram/shared/domain/index";
import type {
  OnlineRoom,
  RoomScoringState,
  RoomSettlementRecord
} from "../../../miniprogram/shared/domain/index";

interface ConfirmSettlementDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
}

export async function main(
  event: ConfirmSettlementCloudEvent
): Promise<ConfirmSettlementCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  return handleConfirmSettlement(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now
  });
}

export async function handleConfirmSettlement(
  event: ConfirmSettlementCloudEvent,
  dependencies: ConfirmSettlementDependencies
): Promise<ConfirmSettlementCloudResult> {
  const openId = dependencies.getContext().OPENID;

  if (!openId) {
    throw new Error("无法获取微信用户身份");
  }

  if (!event.roomId) {
    throw new Error("缺少房间 ID");
  }

  if (!event.record?.result?.valid) {
    throw new Error("结算结果无效，请返回修改");
  }

  const rooms = dependencies.db.collection<OnlineRoom>(CLOUD_COLLECTIONS.rooms);
  const states = dependencies.db.collection<RoomScoringState>(CLOUD_COLLECTIONS.roomStates);
  const records = dependencies.db.collection<RoomSettlementRecord>(
    CLOUD_COLLECTIONS.roomSettlementRecords
  );
  const room = (await rooms.doc(event.roomId).get()).data;

  if (!room) {
    throw new Error("房间不存在或已失效");
  }

  if (room.ownerOpenId !== openId) {
    throw new Error("仅房主可确认结算");
  }

  const currentState = (await states.doc(event.roomId).get()).data;

  if (!currentState) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  if (event.baseVersion !== currentState.version) {
    throw new Error("房间状态已更新，请刷新后重试");
  }

  const now = dependencies.now();
  const roomRecord: RoomSettlementRecord = {
    roomId: event.roomId,
    record: event.record,
    createdBy: openId,
    createdAt: now,
    updatedAt: now
  };
  const nextRecordIds = currentState.recordIds.includes(event.record.id)
    ? currentState.recordIds
    : [...currentState.recordIds, event.record.id];
  const nextState: RoomScoringState = {
    ...currentState,
    playerPoints: event.record.pointsAfter,
    recentRecordId: event.record.id,
    recordIds: nextRecordIds,
    version: createNextRoomStateVersion(currentState.version),
    updatedBy: openId,
    updatedAt: now
  };

  await records.doc(createRoomSettlementRecordId(event.roomId, event.record.id)).set({
    data: roomRecord
  });
  await states.doc(event.roomId).update({
    data: nextState
  });

  return { state: nextState, record: roomRecord };
}

function createRoomSettlementRecordId(roomId: string, recordId: string): string {
  return `${roomId}_${recordId}`;
}
