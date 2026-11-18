import { describe, expect, it } from "vitest";
import {
  createOnlineRoomErrorView,
  createOnlineRoomService,
  normalizeRoomCode,
  parseOnlineRoomInviteOptions
} from "../../miniprogram/shared/services/online-room";
import type {
  OnlineRoomDependencies,
  OnlineRoomServiceResult
} from "../../miniprogram/shared/services/online-room";
import type { SettlementRecord } from "../../miniprogram/shared/domain";

function createResult(roomCode = "123456"): OnlineRoomServiceResult {
  return {
    room: {
      id: "room-1",
      roomCode,
      ownerOpenId: "openid-owner",
      seatMap: {
        east: { openId: "openid-owner", joinedAt: 1 },
        south: undefined,
        west: undefined,
        north: undefined
      },
      status: "waiting",
      createdAt: 1,
      updatedAt: 1
    },
    state: {
      roomId: "room-1",
      version: 1,
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
      hand: { concealedTiles: [], melds: [] },
      dora: { doraIndicators: [], kanDoraIndicators: [], uraDoraIndicators: [] },
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
      updatedAt: 1
    }
  };
}

function createSettlementRecord(): SettlementRecord {
  return {
    id: "record-1",
    event: { type: "draw", tenpaiSeats: [] },
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
      pointDelta: { east: 0, south: 0, west: 0, north: 0 }
    },
    pointsAfter: createResult().state.playerPoints,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
}

describe("在线房间服务", () => {
  it("封装创建和加入房间云函数调用", async () => {
    const calls: Array<{ name: string; data: WechatMiniprogram.IAnyObject }> = [];
    const callFunction: OnlineRoomDependencies["callFunction"] = async <T>(
      name: string,
      data: WechatMiniprogram.IAnyObject
    ) => {
      calls.push({ name, data });
      return createResult() as T;
    };
    const service = createOnlineRoomService({ callFunction });

    await service.createRoom({ seat: "east", displayName: "房主" });
    await service.joinRoom({ roomCode: " 123-456 ", displayName: "成员" });
    await service.transferRoomOwner({ roomId: "room-1", targetOpenId: "openid-member" });
    await service.updateRoomState({
      roomId: "room-1",
      baseVersion: 1,
      sharedState: createResult().state
    });
    await service.confirmSettlement({
      roomId: "room-1",
      baseVersion: 2,
      record: createSettlementRecord()
    });

    expect(calls[0]).toEqual({
      name: "createRoom",
      data: {
        seat: "east",
        displayName: "房主"
      }
    });
    expect(calls[1]).toEqual({
      name: "joinRoom",
      data: {
        roomCode: "123456",
        displayName: "成员"
      }
    });
    expect(calls[2]).toEqual({
      name: "transferRoomOwner",
      data: {
        roomId: "room-1",
        targetOpenId: "openid-member"
      }
    });
    expect(calls[3]).toEqual({
      name: "updateRoomState",
      data: {
        roomId: "room-1",
        baseVersion: 1,
        sharedState: createResult().state
      }
    });
    expect(calls[4]).toMatchObject({
      name: "confirmSettlement",
      data: {
        roomId: "room-1",
        baseVersion: 2
      }
    });
  });

  it("解析房间码和小程序码 scene 参数", () => {
    expect(normalizeRoomCode("房间 123-456")).toBe("123456");
    expect(parseOnlineRoomInviteOptions({ roomCode: "654321" })).toBe("654321");
    expect(parseOnlineRoomInviteOptions({ scene: "roomCode%3D135790" })).toBe("135790");
    expect(parseOnlineRoomInviteOptions({ scene: "246810" })).toBe("246810");
    expect(parseOnlineRoomInviteOptions({ scene: "src%3Axhs-001" })).toBe("");
    expect(parseOnlineRoomInviteOptions({ scene: "ex%3Apinfu-tsumo" })).toBe("");
  });

  it("把常见房间错误转换成可展示提示", () => {
    expect(createOnlineRoomErrorView(new Error("房间不存在或已失效"))).toMatchObject({
      kind: "not-found",
      message: "房间不存在或已失效，请确认房间码"
    });
    expect(createOnlineRoomErrorView(new Error("房间人数已满"))).toMatchObject({
      kind: "full",
      message: "房间人数已满，请联系房主重新创建房间"
    });
    expect(createOnlineRoomErrorView(new Error("房间已结束"))).toMatchObject({
      kind: "closed",
      message: "房间已结束，请联系房主重新创建房间"
    });
    expect(createOnlineRoomErrorView(new Error("房间已失效"))).toMatchObject({
      kind: "expired",
      message: "房间已过期，请联系房主重新创建房间"
    });
    expect(createOnlineRoomErrorView(new Error("接口不存在"))).toMatchObject({
      kind: "service-version",
      message: "在线服务版本过旧，请先发布最新云托管服务"
    });
    expect(createOnlineRoomErrorView(new Error("目标成员不在当前房间"))).toMatchObject({
      kind: "unknown",
      message: "目标成员不在当前房间"
    });
  });
});
