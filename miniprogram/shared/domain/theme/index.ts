export type ThemeId = "classic" | "benji" | "maple";
export type ThemeAccess = "free" | "vip";
export type ThemeMode = "local" | "online";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  access: ThemeAccess;
  modes: ThemeMode[];
}

export const DEFAULT_THEME_ID: ThemeId = "classic";

export const THEME_REGISTRY: readonly ThemeDefinition[] = [
  {
    id: "classic",
    name: "经典绿桌",
    access: "free",
    modes: ["local", "online"]
  },
  {
    id: "benji",
    name: "春日和风",
    access: "free",
    modes: ["local", "online"]
  },
  {
    id: "maple",
    name: "枫夜",
    access: "free",
    modes: ["local", "online"]
  }
];

export function getThemeById(themeId: ThemeId): ThemeDefinition {
  return THEME_REGISTRY.find((theme) => theme.id === themeId) ?? THEME_REGISTRY[0];
}

export function listThemesForMode(mode: ThemeMode): ThemeDefinition[] {
  return THEME_REGISTRY.filter((theme) => theme.modes.includes(mode));
}

export function canAccessTheme(theme: ThemeDefinition, isVip: boolean): boolean {
  return theme.access === "free" || isVip;
}

export function getNextAccessibleThemeId(
  currentThemeId: ThemeId,
  mode: ThemeMode,
  isVip: boolean
): ThemeId {
  const themes = listThemesForMode(mode);
  const currentIndex = themes.findIndex((theme) => theme.id === currentThemeId);

  for (let offset = 1; offset <= themes.length; offset += 1) {
    const theme = themes[(Math.max(currentIndex, 0) + offset) % themes.length];

    if (canAccessTheme(theme, isVip)) {
      return theme.id;
    }
  }

  return DEFAULT_THEME_ID;
}
