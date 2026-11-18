import { CLOUD_BACKEND_CONFIG } from "../../config/cloud-backend";

export type BackendEndpoint =
  | "login"
  | "createRoom"
  | "joinRoom"
  | "leaveRoom"
  | "transferRoomOwner"
  | "shuffleRoomSeats"
  | "updateRoomState"
  | "confirmSettlement"
  | "reportDiagnostic";

export interface OnlineBackendServiceMetadata {
  apiVersion: number;
  serviceVersion: string;
  requestId: string;
}

export interface ClientDiagnosticEvent {
  action: BackendEndpoint | "unhandledError" | "unhandledRejection";
  errorCode: string;
  requestId?: string;
  durationMs?: number;
}

export class OnlineBackendError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, requestId = "", retryable = false) {
    super(message);
    this.name = "OnlineBackendError";
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
  }
}

const REQUIRED_API_VERSION = 2;

const CONTAINER_ENDPOINTS: Record<BackendEndpoint, string> = {
  login: "/login",
  createRoom: "/rooms",
  joinRoom: "/rooms/join",
  leaveRoom: "/rooms/leave",
  transferRoomOwner: "/rooms/owner/transfer",
  shuffleRoomSeats: "/rooms/seats/shuffle",
  updateRoomState: "/rooms/state",
  confirmSettlement: "/rooms/settlement",
  reportDiagnostic: "/diagnostics/events"
};

export function initCloudBackend(): void {
  if (typeof wx === "undefined" || !wx.cloud?.init) {
    return;
  }

  wx.cloud.init({
    env: CLOUD_BACKEND_CONFIG.envId || undefined
  });
}

export async function callOnlineBackend<T>(
  endpoint: BackendEndpoint,
  data: WechatMiniprogram.IAnyObject
): Promise<T> {
  const startedAt = Date.now();

  try {
    if (CLOUD_BACKEND_CONFIG.mode === "cloud-container") {
      return await callCloudContainer(endpoint, data);
    }

    return await callCloudFunction(endpoint, data);
  } catch (error) {
    if (endpoint !== "reportDiagnostic") {
      void reportClientDiagnostic({
        action: endpoint,
        errorCode: getOnlineBackendErrorCode(error),
        requestId: error instanceof OnlineBackendError ? error.requestId : "",
        durationMs: Date.now() - startedAt
      });
    }

    throw error;
  }
}

export function getOnlineBackendErrorCode(error: unknown): string {
  return error instanceof OnlineBackendError ? error.code : "NETWORK_ERROR";
}

export async function reportClientDiagnostic(event: ClientDiagnosticEvent): Promise<void> {
  if (CLOUD_BACKEND_CONFIG.mode !== "cloud-container" || typeof wx === "undefined") {
    return;
  }

  const networkType = await getNetworkType();

  await callCloudContainer("reportDiagnostic", {
    action: event.action,
    errorCode: event.errorCode.slice(0, 48),
    requestId: event.requestId?.slice(0, 80) || "",
    durationMs: Math.max(0, Math.round(event.durationMs || 0)),
    ...getClientRuntimeInfo(),
    networkType,
    occurredAt: Date.now()
  }).then(
    () => undefined,
    () => undefined
  );
}

function callCloudFunction<T>(
  endpoint: BackendEndpoint,
  data: WechatMiniprogram.IAnyObject
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    wx.cloud.callFunction({
      name: endpoint,
      data,
      success: (result) => resolve(result.result as T),
      fail: reject
    });
  });
}

function callCloudContainer<T>(
  endpoint: BackendEndpoint,
  data: WechatMiniprogram.IAnyObject,
  attempt = 0
): Promise<T> {
  const serviceName = CLOUD_BACKEND_CONFIG.containerServiceName;

  if (!serviceName) {
    return Promise.reject(new Error("未配置微信云托管服务名"));
  }

  return new Promise<T>((resolve, reject) => {
    wx.cloud.callContainer({
      config: CLOUD_BACKEND_CONFIG.envId ? { env: CLOUD_BACKEND_CONFIG.envId } : undefined,
      path: `${normalizeBasePath(CLOUD_BACKEND_CONFIG.containerBasePath)}${CONTAINER_ENDPOINTS[endpoint]}`,
      method: "POST",
      header: {
        "content-type": "application/json",
        "X-WX-SERVICE": serviceName
      },
      data,
      success: (result) => {
        try {
          const data = unwrapContainerResponse(normalizeContainerResponse(result));

          assertCompatibleService(data);

          if (isErrorResponse(data)) {
            reject(
              new OnlineBackendError(
                data.error,
                data.code || "SERVICE_ERROR",
                data.requestId || getServiceMetadata(data)?.requestId || "",
                Boolean(data.retryable)
              )
            );
            return;
          }

          resolve(data as T);
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => {
        if (attempt === 0 && isSafeRetryEndpoint(endpoint)) {
          callCloudContainer<T>(endpoint, data, 1).then(resolve, reject);
          return;
        }

        reject(error);
      }
    });
  });
}

export function isSafeRetryEndpoint(endpoint: BackendEndpoint): boolean {
  return endpoint === "login" || endpoint === "joinRoom" || endpoint === "reportDiagnostic";
}

export function assertCompatibleService(data: unknown): void {
  const metadata = getServiceMetadata(data);

  if (!metadata || metadata.apiVersion < REQUIRED_API_VERSION) {
    throw new OnlineBackendError(
      "在线服务正在升级，请稍后重试",
      "SERVICE_VERSION_MISMATCH",
      metadata?.requestId || "",
      true
    );
  }
}

function getServiceMetadata(data: unknown): OnlineBackendServiceMetadata | undefined {
  if (!isPlainObject(data) || !isPlainObject(data._service)) {
    return undefined;
  }

  const metadata = data._service;

  if (
    typeof metadata.apiVersion !== "number" ||
    typeof metadata.serviceVersion !== "string" ||
    typeof metadata.requestId !== "string"
  ) {
    return undefined;
  }

  return metadata as unknown as OnlineBackendServiceMetadata;
}

function getClientRuntimeInfo(): {
  clientVersion: string;
  environment: string;
} {
  try {
    const accountInfo = wx.getAccountInfoSync();

    return {
      clientVersion: accountInfo.miniProgram.version || "dev",
      environment: accountInfo.miniProgram.envVersion || "unknown"
    };
  } catch {
    return { clientVersion: "unknown", environment: "unknown" };
  }
}

function getNetworkType(): Promise<string> {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (result) => resolve(result.networkType || "unknown"),
      fail: () => resolve("unknown")
    });
  });
}

function normalizeContainerResponse(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function unwrapContainerResponse(data: unknown): unknown {
  const parsed = normalizeContainerResponse(data);

  if (!isPlainObject(parsed)) {
    return parsed;
  }

  if (isBusinessPayload(parsed)) {
    return parsed;
  }

  if ("data" in parsed) {
    return unwrapContainerResponse(parsed.data);
  }

  if ("result" in parsed) {
    return unwrapContainerResponse(parsed.result);
  }

  return parsed;
}

function isBusinessPayload(data: Record<string, unknown>): boolean {
  return (
    "session" in data || "room" in data || "state" in data || "record" in data || "error" in data
  );
}

function isPlainObject(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function isErrorResponse(data: unknown): data is {
  error: string;
  code?: string;
  requestId?: string;
  retryable?: boolean;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error?: unknown }).error === "string"
  );
}

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === "/") {
    return "";
  }

  return basePath.startsWith("/") ? basePath : `/${basePath}`;
}
