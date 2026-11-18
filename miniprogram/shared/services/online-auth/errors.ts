export type OnlineAuthErrorKind = "wechat-login" | "cloud-login" | "network" | "invalid-session";

export interface OnlineAuthErrorView {
  kind: OnlineAuthErrorKind;
  message: string;
  retryLabel: string;
  fallbackLabel: string;
}

const DEFAULT_ERROR_VIEW: OnlineAuthErrorView = {
  kind: "cloud-login",
  message: "在线房间登录失败，请稍后重试",
  retryLabel: "重试",
  fallbackLabel: "返回单机算点"
};

export function createOnlineAuthErrorView(error: unknown): OnlineAuthErrorView {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes("微信登录失败")) {
    return {
      ...DEFAULT_ERROR_VIEW,
      kind: "wechat-login",
      message: "微信登录失败，请重试或先使用单机算点"
    };
  }

  if (message.includes("网络") || message.includes("timeout") || message.includes("fail")) {
    return {
      ...DEFAULT_ERROR_VIEW,
      kind: "network",
      message: "当前网络不可用，在线房间需要联网后使用"
    };
  }

  if (message.includes("有效用户身份")) {
    return {
      ...DEFAULT_ERROR_VIEW,
      kind: "invalid-session",
      message
    };
  }

  return DEFAULT_ERROR_VIEW;
}
