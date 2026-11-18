import type { OnlineRoom, RoomScoringState, RoomStateVersion } from "./types";

export const INITIAL_ROOM_STATE_VERSION: RoomStateVersion = 1;

export function createNextRoomStateVersion(version: RoomStateVersion): RoomStateVersion {
  return version + 1;
}

export function canUpdateRoomState(
  currentVersion: RoomStateVersion,
  submittedVersion: RoomStateVersion
): boolean {
  return currentVersion === submittedVersion;
}

export function isRoomClosed(room: Pick<OnlineRoom, "status" | "closedAt">): boolean {
  return room.status === "closed" || Boolean(room.closedAt);
}

export function isRoomExpired(
  room: Pick<OnlineRoom, "status" | "expiresAt">,
  now = Date.now()
): boolean {
  return room.status === "expired" || (room.expiresAt !== undefined && room.expiresAt <= now);
}

export function canJoinRoom(
  room: Pick<OnlineRoom, "status" | "closedAt" | "expiresAt">,
  now = Date.now()
): boolean {
  return !isRoomClosed(room) && !isRoomExpired(room, now);
}

export function touchRoomState(
  state: RoomScoringState,
  updatedBy: string,
  updatedAt = Date.now()
): RoomScoringState {
  return {
    ...state,
    version: createNextRoomStateVersion(state.version),
    updatedBy,
    updatedAt
  };
}
