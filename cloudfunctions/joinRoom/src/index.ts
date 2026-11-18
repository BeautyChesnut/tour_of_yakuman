import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  JoinRoomCloudEvent,
  JoinRoomCloudResult
} from "../../_shared/src/index";
import { canJoinRoom, SEATS } from "../../../miniprogram/shared/domain/index";
import type {
  OnlineRoom,
  RoomScoringState,
  RoomSeatMap,
  Seat
} from "../../../miniprogram/shared/domain/index";

interface JoinRoomDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
}

export async function main(event: JoinRoomCloudEvent): Promise<JoinRoomCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  return handleJoinRoom(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now
  });
}

export async function handleJoinRoom(
  event: JoinRoomCloudEvent,
  dependencies: JoinRoomDependencies
): Promise<JoinRoomCloudResult> {
  const openId = dependencies.getContext().OPENID;

  if (!openId) {
    throw new Error("无法获取微信用户身份");
  }

  if (!event.roomCode) {
    throw new Error("请输入房间码");
  }

  const rooms = dependencies.db.collection<OnlineRoom>(CLOUD_COLLECTIONS.rooms);
  const query = rooms.where?.({ roomCode: event.roomCode });

  if (!query) {
    throw new Error("当前数据库驱动不支持房间码查询");
  }

  const room = (await query.limit(1).get()).data[0];

  if (!room) {
    throw new Error("房间不存在或已失效");
  }

  if (!canJoinRoom(room, dependencies.now())) {
    throw new Error(room.status === "closed" ? "房间已结束" : "房间已失效");
  }

  const state = (
    await dependencies.db
      .collection<RoomScoringState>(CLOUD_COLLECTIONS.roomStates)
      .doc(room.id)
      .get()
  ).data;

  if (!state) {
    throw new Error("房间状态不存在，请联系房主重新创建房间");
  }

  const existingSeat = findMemberSeat(room, openId);

  if (existingSeat) {
    const nextRoom = createRoomWithUpdatedMember(room, existingSeat, event, dependencies.now());

    if (nextRoom !== room) {
      await rooms.doc(room.id).update({
        data: {
          seatMap: nextRoom.seatMap,
          updatedAt: nextRoom.updatedAt
        }
      });
    }

    return { room: nextRoom, state };
  }

  const seat = resolveSeat(room, event.seat);
  const now = dependencies.now();
  const nextSeatMap: RoomSeatMap = {
    ...room.seatMap,
    [seat]: {
      openId,
      displayName: event.displayName,
      avatarUrl: event.avatarUrl,
      joinedAt: now
    }
  };
  const nextRoom: OnlineRoom = {
    ...room,
    seatMap: nextSeatMap,
    updatedAt: now
  };

  await rooms.doc(room.id).update({
    data: {
      seatMap: nextSeatMap,
      updatedAt: now
    }
  });

  return { room: nextRoom, state };
}

function findMemberSeat(room: OnlineRoom, openId: string): Seat | "" {
  return SEATS.find((seat) => room.seatMap[seat]?.openId === openId) || "";
}

function createRoomWithUpdatedMember(
  room: OnlineRoom,
  seat: Seat,
  event: JoinRoomCloudEvent,
  now: number
): OnlineRoom {
  const member = room.seatMap[seat];

  if (!member) {
    return room;
  }

  const nextMember = {
    ...member,
    displayName: event.displayName || member.displayName,
    avatarUrl: event.avatarUrl || member.avatarUrl
  };

  if (nextMember.displayName === member.displayName && nextMember.avatarUrl === member.avatarUrl) {
    return room;
  }

  return {
    ...room,
    seatMap: {
      ...room.seatMap,
      [seat]: nextMember
    },
    updatedAt: now
  };
}

function resolveSeat(room: OnlineRoom, requestedSeat?: Seat): Seat {
  if (requestedSeat) {
    if (room.seatMap[requestedSeat]) {
      throw new Error("座位已被占用，请选择其他空座位");
    }

    return requestedSeat;
  }

  const emptySeats = SEATS.filter((seat) => !room.seatMap[seat]);
  if (emptySeats.length === 0) {
    throw new Error("房间人数已满");
  }

  return emptySeats[Math.floor(Math.random() * emptySeats.length)];
}
