import type { GameVariant, Seat } from "../../domain/round/index";
import type { RoomSharedScoringData } from "../../domain/online-room/index";

const LOCAL_DRAFT_STORAGE_KEY = "tourOfYakumanLocalDraft";
const LOCAL_DRAFT_SCHEMA_VERSION = 1;
const LOCAL_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface LocalDraftSnapshot {
  schemaVersion: 1;
  gameVariant: GameVariant;
  sharedState: RoomSharedScoringData;
  nukiDoraCount: number;
  liabilitySeat: Seat | "";
  savedAt: number;
}

export interface LocalDraftStorageAdapter {
  get(): unknown;
  set(value: LocalDraftSnapshot): void;
  remove(): void;
}

export interface LocalDraftStorage {
  load(gameVariant: GameVariant): LocalDraftSnapshot | undefined;
  save(snapshot: Omit<LocalDraftSnapshot, "schemaVersion" | "savedAt">): void;
  clear(): void;
}

export function createLocalDraftStorage(
  adapter: LocalDraftStorageAdapter = createWechatStorageAdapter(),
  now: () => number = Date.now
): LocalDraftStorage {
  return {
    load(gameVariant) {
      try {
        const value = adapter.get();

        if (!isLocalDraftSnapshot(value) || value.gameVariant !== gameVariant) {
          return undefined;
        }
        if (now() - value.savedAt > LOCAL_DRAFT_MAX_AGE_MS) {
          adapter.remove();
          return undefined;
        }

        return value;
      } catch {
        return undefined;
      }
    },
    save(snapshot) {
      try {
        adapter.set({
          ...snapshot,
          schemaVersion: LOCAL_DRAFT_SCHEMA_VERSION,
          savedAt: now()
        });
      } catch {
        // 本地存储空间不足不影响继续算点。
      }
    },
    clear() {
      try {
        adapter.remove();
      } catch {
        // 清理失败不影响当前页面。
      }
    }
  };
}

function createWechatStorageAdapter(): LocalDraftStorageAdapter {
  return {
    get: () => wx.getStorageSync(LOCAL_DRAFT_STORAGE_KEY),
    set: (value) => wx.setStorageSync(LOCAL_DRAFT_STORAGE_KEY, value),
    remove: () => wx.removeStorageSync(LOCAL_DRAFT_STORAGE_KEY)
  };
}

function isLocalDraftSnapshot(value: unknown): value is LocalDraftSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<LocalDraftSnapshot>;

  return (
    snapshot.schemaVersion === LOCAL_DRAFT_SCHEMA_VERSION &&
    (snapshot.gameVariant === "yonma" || snapshot.gameVariant === "sanma") &&
    typeof snapshot.savedAt === "number" &&
    typeof snapshot.nukiDoraCount === "number" &&
    (snapshot.liabilitySeat === "" ||
      snapshot.liabilitySeat === "east" ||
      snapshot.liabilitySeat === "south" ||
      snapshot.liabilitySeat === "west" ||
      snapshot.liabilitySeat === "north") &&
    Boolean(snapshot.sharedState && typeof snapshot.sharedState === "object")
  );
}
