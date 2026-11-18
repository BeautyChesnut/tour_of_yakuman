export type OnlineRoomErrorKind =
  | "not-found"
  | "full"
  | "closed"
  | "expired"
  | "invalid-code"
  | "service-version"
  | "network"
  | "unknown";

export interface OnlineRoomErrorView {
  kind: OnlineRoomErrorKind;
  message: string;
}

export function createOnlineRoomErrorView(error: unknown): OnlineRoomErrorView {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes("请输入 6 位房间码") || message.includes("请输入房间码")) {
    return { kind: "invalid-code", message: "请输入 6 位房间码" };
  }

  if (message.includes("接口不存在")) {
    return {
      kind: "service-version",
      message: "在线服务版本过旧，请先发布最新云托管服务"
    };
  }

  if (message.includes("房间不存在")) {
    return { kind: "not-found", message: "房间不存在或已失效，请确认房间码" };
  }

  if (message.includes("过期") || message.includes("失效")) {
    return { kind: "expired", message: "房间已过期，请联系房主重新创建房间" };
  }

  if (message.includes("人数已满")) {
    return { kind: "full", message: "房间人数已满，请联系房主重新创建房间" };
  }

  if (message.includes("已结束") || message.includes("已关闭")) {
    return { kind: "closed", message: "房间已结束，请联系房主重新创建房间" };
  }

  if (message.includes("network") || message.includes("fail") || message.includes("timeout")) {
    return { kind: "network", message: "在线房间连接失败，请检查网络后重试" };
  }

  return { kind: "unknown", message: message || "在线房间连接失败，请稍后重试" };
}
