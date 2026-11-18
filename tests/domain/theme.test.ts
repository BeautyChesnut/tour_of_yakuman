import { describe, expect, it } from "vitest";
import {
  canAccessTheme,
  getNextAccessibleThemeId,
  getThemeById,
  listThemesForMode,
  THEME_REGISTRY
} from "../../miniprogram/shared/domain/theme";

describe("主题注册表", () => {
  it("集中注册当前三套本地和在线主题", () => {
    expect(THEME_REGISTRY.map((theme) => theme.id)).toEqual(["classic", "benji", "maple"]);
    expect(listThemesForMode("local").map((theme) => theme.id)).toEqual([
      "classic",
      "benji",
      "maple"
    ]);
    expect(listThemesForMode("online").map((theme) => theme.id)).toEqual([
      "classic",
      "benji",
      "maple"
    ]);
  });

  it("当前三套主题均向免费用户开放", () => {
    expect(canAccessTheme(getThemeById("classic"), false)).toBe(true);
    expect(canAccessTheme(getThemeById("benji"), false)).toBe(true);
    expect(canAccessTheme(getThemeById("maple"), false)).toBe(true);
  });

  it("免费用户可依次轮换全部主题", () => {
    expect(getNextAccessibleThemeId("classic", "online", false)).toBe("benji");
    expect(getNextAccessibleThemeId("benji", "online", false)).toBe("maple");
    expect(getNextAccessibleThemeId("maple", "online", false)).toBe("classic");
  });
});
