import type { OnlineRoom, RoomScoringState, RoomSharedScoringData, Seat } from "../../domain/index";

export interface OnlineRoomService {
  createRoom(input?: OnlineRoomCreateInput): Promise<OnlineRoomServiceResult>;
  joinRoom(input: OnlineRoomJoinInput): Promise<OnlineRoomServiceResult>;
  leaveRoom(input: OnlineRoomLeaveInput): Promise<OnlineRoomServiceResult>;
  transferRoomOwner(input: OnlineRoomTransferOwnerInput): Promise<OnlineRoomServiceResult>;
  shuffleRoomSeats(input: OnlineRoomShuffleSeatsInput): Promise<OnlineRoomServiceResult>;
  updateRoomState(input: OnlineRoomUpdateStateInput): Promise<OnlineRoomUpdateStateResult>;
  confirmSettlement(
    input: OnlineRoomConfirmSettlementInput
  ): Promise<OnlineRoomConfirmSettlementResult>;
}

export interface OnlineRoomCreateInput {
  seat?: Seat;
  displayName?: string;
  avatarUrl?: string;
}

export interface OnlineRoomJoinInput extends OnlineRoomCreateInput {
  roomCode: string;
}

export interface OnlineRoomServiceResult {
  room: OnlineRoom;
  state: RoomScoringState;
}

export interface OnlineRoomUpdateStateInput {
  roomId: string;
  baseVersion: number;
  sharedState: RoomSharedScoringData;
}

export interface OnlineRoomShuffleSeatsInput {
  roomId: string;
}

export interface OnlineRoomLeaveInput {
  roomId: string;
}

export interface OnlineRoomTransferOwnerInput {
  roomId: string;
  targetOpenId: string;
}

export interface OnlineRoomUpdateStateResult {
  state: RoomScoringState;
}

export interface OnlineRoomConfirmSettlementInput {
  roomId: string;
  baseVersion: number;
  record: import("../../domain/index").SettlementRecord;
}

export interface OnlineRoomConfirmSettlementResult {
  state: RoomScoringState;
  record: import("../../domain/index").RoomSettlementRecord;
}

export interface OnlineRoomDependencies {
  callFunction<T>(name: string, data: WechatMiniprogram.IAnyObject): Promise<T>;
}

export interface OnlineRoomInviteOptions {
  roomCode?: string;
  scene?: string;
}
