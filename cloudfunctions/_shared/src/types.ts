import type { UserProfile } from "../../../miniprogram/shared/domain/online-room/index";
import type {
  OnlineRoom,
  RoomSharedScoringData,
  RoomScoringState,
  RoomSettlementRecord,
  Seat
} from "../../../miniprogram/shared/domain/index";
import type { SettlementRecord } from "../../../miniprogram/shared/domain/settlement/index";

export interface CloudDatabaseCollection<T> {
  doc(id: string): {
    get(): Promise<{ data?: T }>;
    set(options: { data: T }): Promise<unknown>;
    update(options: { data: Partial<T> }): Promise<unknown>;
  };
  where?(query: Partial<T>): {
    limit(count: number): {
      get(): Promise<{ data: T[] }>;
    };
  };
}

export interface CloudDatabase {
  collection<T>(name: string): CloudDatabaseCollection<T>;
}

export interface CloudFunctionContext {
  OPENID?: string;
}

export interface LoginCloudEvent {
  code?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface LoginCloudResult {
  session: {
    openId: string;
    user: UserProfile;
    loggedInAt: number;
  };
}

export interface CreateRoomCloudEvent {
  seat?: Seat;
  displayName?: string;
  avatarUrl?: string;
}

export interface CreateRoomCloudResult {
  room: OnlineRoom;
  state: RoomScoringState;
}

export interface JoinRoomCloudEvent {
  roomCode: string;
  seat?: Seat;
  displayName?: string;
  avatarUrl?: string;
}

export interface JoinRoomCloudResult {
  room: OnlineRoom;
  state: RoomScoringState;
}

export interface LeaveRoomCloudEvent {
  roomId: string;
}

export interface LeaveRoomCloudResult {
  room: OnlineRoom;
  state: RoomScoringState;
}

export interface TransferRoomOwnerCloudEvent {
  roomId: string;
  targetOpenId: string;
}

export interface TransferRoomOwnerCloudResult {
  room: OnlineRoom;
  state: RoomScoringState;
}

export interface ShuffleRoomSeatsCloudEvent {
  roomId: string;
}

export interface ShuffleRoomSeatsCloudResult {
  room: OnlineRoom;
  state: RoomScoringState;
}

export interface UpdateRoomStateCloudEvent {
  roomId: string;
  baseVersion: number;
  sharedState: RoomSharedScoringData;
}

export interface UpdateRoomStateCloudResult {
  state: RoomScoringState;
}

export interface ConfirmSettlementCloudEvent {
  roomId: string;
  baseVersion: number;
  record: SettlementRecord;
}

export interface ConfirmSettlementCloudResult {
  state: RoomScoringState;
  record: RoomSettlementRecord;
}

export type RoomCollections = {
  rooms: OnlineRoom;
  roomStates: RoomScoringState;
  roomSettlementRecords: RoomSettlementRecord;
  users: UserProfile;
};
