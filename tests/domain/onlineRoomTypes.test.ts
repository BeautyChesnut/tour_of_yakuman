import { describe, expect, it } from "vitest";
import type {
  OnlineRoom,
  RoomScoringState,
  RoomSeatMap,
  RoomSettlementRecord,
  UserProfile
} from "../../miniprogram/shared/domain/online-room";
import {
  canJoinRoom,
  canUpdateRoomState,
  createNextRoomStateVersion,
  INITIAL_ROOM_STATE_VERSION,
  isRoomClosed,
  isRoomExpired,
  touchRoomState
} from "../../miniprogram/shared/domain/online-room";
import type { SettlementRecord } from "../../miniprogram/shared/domain/settlement";

describe("在线房间领域类型", () => {
  it("定义用户、房间、座位、共享算点状态和房间结算记录结构", () => {
    const now = 1_765_000_000_000;
    const user: UserProfile = {
      openId: "openid-owner",
      displayName: "东家",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };
    const seatMap: RoomSeatMap = {
      east: {
        openId: user.openId,
        displayName: user.displayName,
        joinedAt: now
      },
      south: undefined,
      west: undefined,
      north: undefined
    };
    const room: OnlineRoom = {
      id: "room-1",
      roomCode: "123456",
      ownerOpenId: user.openId,
      seatMap,
      status: "waiting",
      createdAt: now,
      updatedAt: now
    };
    const state: RoomScoringState = {
      roomId: room.id,
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
      playerPoints: {
        east: 25000,
        south: 25000,
        west: 25000,
        north: 25000
      },
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
      riichiSeats: { east: false, south: false, west: false, north: false },
      tenpaiSeats: { east: false, south: false, west: false, north: false },
      recordIds: [],
      updatedBy: user.openId,
      updatedAt: now
    };
    const record: RoomSettlementRecord = {
      roomId: room.id,
      record: {
        id: "record-1",
        event: { type: "tsumo", winner: "east" },
        result: {
          valid: true,
          errors: [],
          warnings: [],
          yaku: [],
          dora: [],
          han: 0,
          fuDetails: [],
          basePoints: 0,
          payments: [],
          pointDelta: {
            east: 0,
            south: 0,
            west: 0,
            north: 0
          }
        },
        pointsAfter: state.playerPoints,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString()
      } satisfies SettlementRecord,
      createdBy: user.openId,
      createdAt: now,
      updatedAt: now
    };

    expect(room.seatMap.east?.openId).toBe(user.openId);
    expect(state.version).toBe(INITIAL_ROOM_STATE_VERSION);
    expect(state.hand.melds).toEqual([]);
    expect(state.conditions.riichi).toBe(false);
    expect(state.riichiSeats.east).toBe(false);
    expect(state.tenpaiSeats.east).toBe(false);
    expect(record.record.pointsAfter.east).toBe(25000);
  });

  it("维护房间状态版本号和关闭过期判断", () => {
    const now = 1_765_000_000_000;
    const room: OnlineRoom = {
      id: "room-1",
      roomCode: "123456",
      ownerOpenId: "openid-owner",
      seatMap: {
        east: undefined,
        south: undefined,
        west: undefined,
        north: undefined
      },
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 60_000
    };
    const state: RoomScoringState = {
      roomId: room.id,
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
      playerPoints: {
        east: 25000,
        south: 25000,
        west: 25000,
        north: 25000
      },
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
      riichiSeats: { east: false, south: false, west: false, north: false },
      tenpaiSeats: { east: false, south: false, west: false, north: false },
      recordIds: [],
      updatedBy: "openid-owner",
      updatedAt: now
    };

    expect(canUpdateRoomState(state.version, INITIAL_ROOM_STATE_VERSION)).toBe(true);
    expect(canUpdateRoomState(state.version, createNextRoomStateVersion(state.version))).toBe(
      false
    );
    expect(touchRoomState(state, "openid-owner", now + 1).version).toBe(2);
    expect(canJoinRoom(room, now)).toBe(true);
    expect(isRoomClosed({ ...room, status: "closed", closedAt: now })).toBe(true);
    expect(isRoomExpired(room, now + 60_001)).toBe(true);
    expect(canJoinRoom({ ...room, expiresAt: now - 1 })).toBe(false);
  });
});
