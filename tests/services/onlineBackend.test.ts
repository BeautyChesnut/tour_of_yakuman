import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCompatibleService,
  callOnlineBackend,
  getOnlineBackendErrorCode,
  isSafeRetryEndpoint,
  OnlineBackendError
} from "../../miniprogram/shared/services/online-backend";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("在线后端诊断与兼容策略", () => {
  it("接受满足要求的服务 API 版本", () => {
    expect(() =>
      assertCompatibleService({
        _service: { apiVersion: 2, serviceVersion: "service-v2", requestId: "req-1" }
      })
    ).not.toThrow();
  });

  it("拒绝缺失或过旧的服务 API 版本", () => {
    for (const response of [
      {},
      { _service: { apiVersion: 1, serviceVersion: "old", requestId: "req-old" } }
    ]) {
      try {
        assertCompatibleService(response);
        throw new Error("应拒绝旧服务");
      } catch (error) {
        expect(error).toBeInstanceOf(OnlineBackendError);
        expect(getOnlineBackendErrorCode(error)).toBe("SERVICE_VERSION_MISMATCH");
      }
    }
  });

  it("只允许幂等或安全请求自动重试", () => {
    expect(isSafeRetryEndpoint("login")).toBe(true);
    expect(isSafeRetryEndpoint("joinRoom")).toBe(true);
    expect(isSafeRetryEndpoint("reportDiagnostic")).toBe(true);
    expect(isSafeRetryEndpoint("createRoom")).toBe(false);
    expect(isSafeRetryEndpoint("transferRoomOwner")).toBe(false);
    expect(isSafeRetryEndpoint("updateRoomState")).toBe(false);
    expect(isSafeRetryEndpoint("confirmSettlement")).toBe(false);
  });

  it("安全请求网络失败后自动重试一次", async () => {
    let attempts = 0;

    vi.stubGlobal("wx", {
      cloud: {
        callContainer(options: { success(result: unknown): void; fail(error: Error): void }) {
          attempts += 1;
          if (attempts === 1) {
            options.fail(new Error("network fail"));
            return;
          }
          options.success({
            data: {
              room: { id: "room-1" },
              _service: { apiVersion: 2, serviceVersion: "test", requestId: "req-2" }
            }
          });
        }
      }
    });

    await expect(callOnlineBackend("joinRoom", { roomCode: "123456" })).resolves.toMatchObject({
      room: { id: "room-1" }
    });
    expect(attempts).toBe(2);
  });
});
