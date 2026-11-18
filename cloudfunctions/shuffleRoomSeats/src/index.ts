import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  ShuffleRoomSeatsCloudEvent,
  ShuffleRoomSeatsCloudResult
} from "../../_shared/src/index";
import { SEATS } from "../../../miniprogram/shared/domain/index";
import type {
  OnlineRoom,
  RoomMemberRef,
  RoomScoringState,
  RoomSeatMap
} from "../../../miniprogram/shared/domain/index";

interface ShuffleRoomSeatsDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
}

export async function main(
  event: ShuffleRoomSeatsCloudEvent
): Promise<ShuffleRoomSeatsCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  return handleShuffleRoomSeats(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now
  });
}

export async function handleShuffleRoomSeats(
  event: ShuffleRoomSeatsCloudEvent,
  dependencies: ShuffleRoomSeatsDependencies
): Promise<ShuffleRoomSeatsCloudResult> {
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
    throw new Error("仅房主可随机座位");
  }

  const state = (await states.doc(event.roomId).get()).data;

  if (!state) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  const members = SEATS.map((seat) => room.seatMap[seat]).filter(
    (member): member is RoomMemberRef => Boolean(member)
  );

  if (members.length !== SEATS.length) {
    throw new Error("房间满 4 人后才能随机座位");
  }

  const shuffledMembers = shuffleArray(members);
  const seatMap = SEATS.reduce<RoomSeatMap>(
    (nextSeatMap, seat, index) => ({
      ...nextSeatMap,
      [seat]: shuffledMembers[index]
    }),
    {} as RoomSeatMap
  );
  const updatedAt = dependencies.now();
  const nextRoom: OnlineRoom = {
    ...room,
    seatMap,
    updatedAt
  };

  await rooms.doc(event.roomId).update({
    data: {
      seatMap,
      updatedAt
    }
  });

  return { room: nextRoom, state };
}

function shuffleArray<T>(items: readonly T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const item = shuffled[index];

    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = item;
  }

  return shuffled;
}
