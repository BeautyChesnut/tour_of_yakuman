import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  LeaveRoomCloudEvent,
  LeaveRoomCloudResult
} from "../../_shared/src/index";
import { SEATS } from "../../../miniprogram/shared/domain/index";
import type {
  OnlineRoom,
  RoomScoringState,
  RoomSeatMap,
  Seat
} from "../../../miniprogram/shared/domain/index";

interface LeaveRoomDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
}

export async function main(event: LeaveRoomCloudEvent): Promise<LeaveRoomCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  return handleLeaveRoom(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now
  });
}

export async function handleLeaveRoom(
  event: LeaveRoomCloudEvent,
  dependencies: LeaveRoomDependencies
): Promise<LeaveRoomCloudResult> {
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

  const state = (await states.doc(event.roomId).get()).data;

  if (!state) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  const memberSeat = findMemberSeat(room, openId);

  if (!memberSeat) {
    return { room, state };
  }

  const now = dependencies.now();
  const seatMap = createSeatMapWithoutMember(room, openId);
  const nextOwnerOpenId =
    room.ownerOpenId === openId ? pickRandomRoomOwnerOpenId(seatMap) : room.ownerOpenId;
  const nextRoom: OnlineRoom = nextOwnerOpenId
    ? {
        ...room,
        ownerOpenId: nextOwnerOpenId,
        seatMap,
        updatedAt: now
      }
    : {
        ...room,
        status: "closed",
        closedAt: now,
        seatMap,
        updatedAt: now
      };

  await rooms.doc(event.roomId).update({
    data: nextOwnerOpenId
      ? {
          ownerOpenId: nextRoom.ownerOpenId,
          seatMap: nextRoom.seatMap,
          updatedAt: nextRoom.updatedAt
        }
      : {
          status: nextRoom.status,
          closedAt: nextRoom.closedAt,
          seatMap: nextRoom.seatMap,
          updatedAt: nextRoom.updatedAt
        }
  });

  return { room: nextRoom, state };
}

function findMemberSeat(room: OnlineRoom, openId: string): Seat | "" {
  return SEATS.find((seat) => room.seatMap[seat]?.openId === openId) || "";
}

function createSeatMapWithoutMember(room: OnlineRoom, openId: string): RoomSeatMap {
  return SEATS.reduce<RoomSeatMap>(
    (seatMap, seat) => ({
      ...seatMap,
      [seat]: room.seatMap[seat]?.openId === openId ? undefined : room.seatMap[seat]
    }),
    {} as RoomSeatMap
  );
}

function pickRandomRoomOwnerOpenId(seatMap: RoomSeatMap): string {
  const candidates = SEATS.map((seat) => seatMap[seat]?.openId).filter(
    (candidate): candidate is string => Boolean(candidate)
  );

  if (candidates.length === 0) {
    return "";
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}
