import type { HandInput, Meld, WinConditions } from "../hand/index";
import type { MembershipEntitlement } from "../membership/index";
import type { PlayerPoints, RoundEvent, RoundWind, Seat, WinType } from "../round/index";
import type { SettlementRecord } from "../settlement/index";
import type { Tile } from "../tiles/index";

export type OnlineRoomStatus = "waiting" | "playing" | "closed" | "expired";
export type OnlineRoomRole = "owner" | "member";
export type OnlineRoomWorkbenchMode = "local" | "room-host" | "room-viewer";
export type RoomStateVersion = number;

export interface UserProfile {
  openId: string;
  displayName?: string;
  avatarUrl?: string;
  membership?: MembershipEntitlement;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
}

export interface RoomMemberRef {
  openId: string;
  displayName?: string;
  avatarUrl?: string;
  joinedAt: number;
}

export type RoomSeatMap = Record<Seat, RoomMemberRef | undefined>;

export interface OnlineRoom {
  id: string;
  roomCode: string;
  ownerOpenId: string;
  seatMap: RoomSeatMap;
  status: OnlineRoomStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  closedAt?: number;
}

export interface RoomRoundState {
  roundWind: RoundWind;
  roundIndex: number;
  honba: number;
  riichiSticks: number;
  dealer: Seat;
  eventType: "ron" | "tsumo" | "draw";
  winType: WinType;
  winner?: Seat;
  ronWinners?: Seat[];
  discarder?: Seat;
  tenpaiSeats?: Seat[];
}

export interface RoomHandDraft {
  concealedTiles: Tile[];
  winningTile?: Tile;
  melds: Meld[];
  handInput?: HandInput;
}

export interface RoomDoraDraft {
  doraIndicators: Tile[];
  kanDoraIndicators: Tile[];
  uraDoraIndicators: Tile[];
}

export interface RoomSharedScoringData {
  round: RoomRoundState;
  playerPoints: PlayerPoints;
  hand: RoomHandDraft;
  dora: RoomDoraDraft;
  conditions: WinConditions;
  riichiSeats: Record<Seat, boolean>;
  tenpaiSeats: Record<Seat, boolean>;
  currentEvent?: RoundEvent;
  recentRecordId?: string;
  recordIds: string[];
}

export interface RoomScoringState extends RoomSharedScoringData {
  roomId: string;
  version: RoomStateVersion;
  updatedBy: string;
  updatedAt: number;
}

export interface RoomSettlementRecord {
  roomId: string;
  record: SettlementRecord;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
