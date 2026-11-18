import { CLOUD_COLLECTIONS } from "../../_shared/src/index";
import type {
  CloudDatabase,
  CloudFunctionContext,
  CreateRoomCloudEvent,
  CreateRoomCloudResult
} from "../../_shared/src/index";
import {
  createDefaultPlayerPoints,
  INITIAL_ROOM_STATE_VERSION,
  SEATS
} from "../../../miniprogram/shared/domain/index";
import type {
  OnlineRoom,
  RoomScoringState,
  RoomSeatMap,
  Seat
} from "../../../miniprogram/shared/domain/index";

const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

interface CreateRoomDependencies {
  db: CloudDatabase;
  getContext(): CloudFunctionContext;
  now(): number;
  createRoomId(): string;
  createRoomCode(): string;
  roomTtlMs?: number;
}

export async function main(event: CreateRoomCloudEvent = {}): Promise<CreateRoomCloudResult> {
  const cloud = await import("wx-server-sdk");

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  return handleCreateRoom(event, {
    db: cloud.database() as CloudDatabase,
    getContext: () => cloud.getWXContext() as CloudFunctionContext,
    now: Date.now,
    createRoomId: () => `room-${Date.now()}`,
    createRoomCode: () => String(Math.floor(100000 + Math.random() * 900000))
  });
}

export async function handleCreateRoom(
  event: CreateRoomCloudEvent,
  dependencies: CreateRoomDependencies
): Promise<CreateRoomCloudResult> {
  const ownerOpenId = dependencies.getContext().OPENID;

  if (!ownerOpenId) {
    throw new Error("无法获取微信用户身份");
  }

  const now = dependencies.now();
  const roomId = dependencies.createRoomId();
  const ownerSeat = normalizeSeat(event.seat);
  const room: OnlineRoom = {
    id: roomId,
    roomCode: dependencies.createRoomCode(),
    ownerOpenId,
    seatMap: createInitialSeatMap(ownerSeat, {
      openId: ownerOpenId,
      displayName: event.displayName,
      avatarUrl: event.avatarUrl,
      joinedAt: now
    }),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + (dependencies.roomTtlMs ?? DEFAULT_ROOM_TTL_MS)
  };
  const state: RoomScoringState = {
    roomId,
    version: INITIAL_ROOM_STATE_VERSION,
    round: {
      roundWind: "east",
      roundIndex: 0,
      honba: 0,
      riichiSticks: 0,
      dealer: "east",
      eventType: "ron",
      winType: "ron"
    },
    playerPoints: createDefaultPlayerPoints(),
    hand: {
      concealedTiles: [],
      melds: []
    },
    dora: {
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: []
    },
    conditions: {
      riichi: false,
      doubleRiichi: false,
      ippatsu: false,
      menzenTsumo: false,
      haitei: false,
      houtei: false,
      rinshan: false,
      chankan: false,
      tenhou: false,
      chiihou: false,
      enableUraDora: false
    },
    riichiSeats: createEmptySeatBooleanMap(),
    tenpaiSeats: createEmptySeatBooleanMap(),
    recordIds: [],
    updatedBy: ownerOpenId,
    updatedAt: now
  };

  await dependencies.db.collection<OnlineRoom>(CLOUD_COLLECTIONS.rooms).doc(roomId).set({
    data: room
  });
  await dependencies.db.collection<RoomScoringState>(CLOUD_COLLECTIONS.roomStates).doc(roomId).set({
    data: state
  });

  return { room, state };
}

function normalizeSeat(seat: Seat | undefined): Seat {
  return seat && SEATS.includes(seat) ? seat : "east";
}

function createInitialSeatMap(ownerSeat: Seat, owner: NonNullable<RoomSeatMap[Seat]>): RoomSeatMap {
  return SEATS.reduce<RoomSeatMap>(
    (seatMap, seat) => ({
      ...seatMap,
      [seat]: seat === ownerSeat ? owner : undefined
    }),
    {} as RoomSeatMap
  );
}

function createEmptySeatBooleanMap(): Record<Seat, boolean> {
  return SEATS.reduce<Record<Seat, boolean>>(
    (seatMap, seat) => ({
      ...seatMap,
      [seat]: false
    }),
    {} as Record<Seat, boolean>
  );
}
