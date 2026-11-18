import type { OnlineRoomDependencies, OnlineRoomInviteOptions, OnlineRoomService } from "./types";
import { callOnlineBackend } from "../online-backend/index";

const CREATE_ROOM_FUNCTION_NAME = "createRoom";
const JOIN_ROOM_FUNCTION_NAME = "joinRoom";
const LEAVE_ROOM_FUNCTION_NAME = "leaveRoom";
const TRANSFER_ROOM_OWNER_FUNCTION_NAME = "transferRoomOwner";
const SHUFFLE_ROOM_SEATS_FUNCTION_NAME = "shuffleRoomSeats";
const UPDATE_ROOM_STATE_FUNCTION_NAME = "updateRoomState";
const CONFIRM_SETTLEMENT_FUNCTION_NAME = "confirmSettlement";

export type {
  OnlineRoomCreateInput,
  OnlineRoomDependencies,
  OnlineRoomConfirmSettlementInput,
  OnlineRoomConfirmSettlementResult,
  OnlineRoomInviteOptions,
  OnlineRoomJoinInput,
  OnlineRoomLeaveInput,
  OnlineRoomTransferOwnerInput,
  OnlineRoomService,
  OnlineRoomServiceResult,
  OnlineRoomShuffleSeatsInput,
  OnlineRoomUpdateStateInput,
  OnlineRoomUpdateStateResult
} from "./types";
export type { OnlineRoomErrorKind, OnlineRoomErrorView } from "./errors";
export { createOnlineRoomErrorView } from "./errors";
export type { LocalScoringDraftLike, LocalScoringDraftPatch } from "./scoring-state-adapter";
export {
  createDraftPatchFromRoomSharedScoringData,
  createRoomSharedScoringDataFromDraft
} from "./scoring-state-adapter";

export function createOnlineRoomService(
  dependencies: OnlineRoomDependencies = createWechatOnlineRoomDependencies()
): OnlineRoomService {
  return {
    createRoom: (input = {}) => dependencies.callFunction(CREATE_ROOM_FUNCTION_NAME, input),
    joinRoom: (input) =>
      dependencies.callFunction(JOIN_ROOM_FUNCTION_NAME, {
        ...input,
        roomCode: normalizeRoomCode(input.roomCode)
      }),
    leaveRoom: (input) => dependencies.callFunction(LEAVE_ROOM_FUNCTION_NAME, input),
    transferRoomOwner: (input) =>
      dependencies.callFunction(TRANSFER_ROOM_OWNER_FUNCTION_NAME, input),
    shuffleRoomSeats: (input) => dependencies.callFunction(SHUFFLE_ROOM_SEATS_FUNCTION_NAME, input),
    updateRoomState: (input) => dependencies.callFunction(UPDATE_ROOM_STATE_FUNCTION_NAME, input),
    confirmSettlement: (input) => dependencies.callFunction(CONFIRM_SETTLEMENT_FUNCTION_NAME, input)
  };
}

export function parseOnlineRoomInviteOptions(options: OnlineRoomInviteOptions): string {
  if (options.roomCode) {
    return normalizeRoomCode(options.roomCode);
  }

  if (!options.scene) {
    return "";
  }

  let scene: string;

  try {
    scene = decodeURIComponent(options.scene);
  } catch {
    return "";
  }
  const params = scene
    .split(/[&,;?]/)
    .map((part) => part.split(/[:=]/, 2))
    .find(([key]) => key === "roomCode" || key === "room");

  if (params?.[1]) {
    return normalizeRoomCode(params[1]);
  }

  return /^\d{6}$/.test(scene.trim()) ? scene.trim() : "";
}

export function normalizeRoomCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function createWechatOnlineRoomDependencies(): OnlineRoomDependencies {
  return {
    callFunction: <T>(name: string, data: WechatMiniprogram.IAnyObject) =>
      callOnlineBackend<T>(name as Parameters<typeof callOnlineBackend>[0], data)
  };
}
