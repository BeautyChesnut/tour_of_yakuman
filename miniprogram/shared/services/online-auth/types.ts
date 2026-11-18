import type { UserProfile } from "../../domain/online-room/index";

export interface OnlineAuthSession {
  openId: string;
  user: UserProfile;
  loggedInAt: number;
}

export interface OnlineAuthLoginResult {
  code: string;
}

export interface OnlineAuthCloudResult {
  session: OnlineAuthSession;
}

export interface OnlineAuthDependencies {
  login(): Promise<OnlineAuthLoginResult>;
  callLoginFunction(code: string): Promise<OnlineAuthCloudResult>;
  storage?: OnlineAuthStorage;
  now?: () => number;
  sessionTtlMs?: number;
}

export interface CachedOnlineAuthSession extends OnlineAuthSession {
  expiresAt: number;
}

export interface OnlineAuthStorage {
  get(): CachedOnlineAuthSession | undefined;
  set(session: CachedOnlineAuthSession): void;
  remove(): void;
}

export interface OnlineAuthService {
  login(): Promise<OnlineAuthSession>;
  getSession(): Promise<OnlineAuthSession>;
  clearSession(): void;
}
