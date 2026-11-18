import type { GameVariant, Seat, WinType } from "../round/index";
import type { Tile } from "../tiles/index";

const IDENTIFIER_PATTERN = /^[a-z0-9_-]{1,24}$/;

export type GrowthEventName =
  | "growth_open"
  | "growth_local_start"
  | "growth_settlement_complete"
  | "growth_share_open";

export interface GrowthLaunchContext {
  source: string;
  exampleId: string;
}

export interface CuratedScoringExample {
  id: string;
  title: string;
  gameVariant: GameVariant;
  concealedTiles: Tile[];
  winningTile: Tile;
  winType: WinType;
  winner: Seat;
  discarder: Seat | "";
}

export interface GrowthEventFields {
  source?: string;
  exampleId?: string;
  mode?: "home" | "local" | "online";
  playerCount?: 3 | 4;
  shareContext?: "home" | "room" | "example" | "result";
}

export interface ShareMetadata {
  title: string;
  path: string;
}

export type GrowthAnalyticsReporter = (
  eventName: GrowthEventName,
  fields: Record<string, string | number>
) => void;

const CURATED_EXAMPLES: Record<string, CuratedScoringExample> = {
  "pinfu-tsumo": {
    id: "pinfu-tsumo",
    title: "四麻平和自摸示例",
    gameVariant: "yonma",
    concealedTiles: ["2m", "3m", "4m", "5m", "6m", "2p", "3p", "4p", "6p", "7p", "8p", "5s", "5s"],
    winningTile: "4m",
    winType: "tsumo",
    winner: "south",
    discarder: ""
  },
  "sanma-basic": {
    id: "sanma-basic",
    title: "三麻基础自摸示例",
    gameVariant: "sanma",
    concealedTiles: ["1m", "1m", "1m", "2p", "3p", "4p", "6p", "7p", "8p", "2s", "3s", "4s", "5s"],
    winningTile: "5s",
    winType: "tsumo",
    winner: "south",
    discarder: ""
  }
};

export function parseGrowthLaunchContext(
  options: Record<string, string | undefined>
): GrowthLaunchContext {
  const sceneValues = parseSceneValues(options.scene);

  return {
    source: normalizeIdentifier(
      options.source ?? options.from ?? options.channel ?? sceneValues.source ?? ""
    ),
    exampleId: normalizeExampleId(options.example ?? sceneValues.example ?? "")
  };
}

export function getCuratedScoringExample(exampleId: string): CuratedScoringExample | undefined {
  const example = CURATED_EXAMPLES[normalizeExampleId(exampleId)];

  return example
    ? {
        ...example,
        concealedTiles: [...example.concealedTiles]
      }
    : undefined;
}

export function createHomeShareMetadata(): ShareMetadata {
  return {
    title: "役满之旅｜四麻三麻立直麻将算点",
    path: "/pages/scoring/index?source=share-home"
  };
}

export function createRoomShareMetadata(roomCode: string): ShareMetadata {
  return {
    title: `邀请你加入役满之旅在线房间 ${roomCode}`,
    path: `/pages/scoring/index?roomCode=${roomCode}&source=share-room`
  };
}

export function createExampleShareMetadata(exampleId: string): ShareMetadata {
  const example = getCuratedScoringExample(exampleId);

  if (!example) {
    return createHomeShareMetadata();
  }

  return {
    title: `来算算这手：${example.title}`,
    path: `/pages/scoring/index?example=${example.id}&source=share-example`
  };
}

export function createResultShareMetadata(
  gameVariant: GameVariant,
  resultText: string
): ShareMetadata {
  const variantText = gameVariant === "sanma" ? "三麻" : "四麻";
  const summary = resultText.trim().slice(0, 24) || "本局结算完成";

  return {
    title: `役满之旅｜${variantText} ${summary}`,
    path: "/pages/scoring/index?source=share-result"
  };
}

export function createGrowthEventPayload(
  fields: GrowthEventFields
): Record<string, string | number> {
  const payload: Record<string, string | number> = {};
  const source = normalizeIdentifier(fields.source ?? "");
  const exampleId = normalizeExampleId(fields.exampleId ?? "");

  if (source) {
    payload.source = source;
  }
  if (exampleId) {
    payload.example_id = exampleId;
  }
  if (fields.mode) {
    payload.mode = fields.mode;
  }
  if (fields.playerCount === 3 || fields.playerCount === 4) {
    payload.player_count = fields.playerCount;
  }
  if (fields.shareContext) {
    payload.share_context = fields.shareContext;
  }

  return payload;
}

export function reportGrowthEvent(
  reporter: GrowthAnalyticsReporter | undefined,
  eventName: GrowthEventName,
  fields: GrowthEventFields
): void {
  if (!reporter) {
    return;
  }

  try {
    reporter(eventName, createGrowthEventPayload(fields));
  } catch {
    // Analytics must never interrupt scoring.
  }
}

function normalizeIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  return IDENTIFIER_PATTERN.test(normalized) ? normalized : "";
}

function normalizeExampleId(value: string): string {
  const normalized = normalizeIdentifier(value);
  return normalized && CURATED_EXAMPLES[normalized] ? normalized : "";
}

function parseSceneValues(sceneValue: string | undefined): {
  source?: string;
  example?: string;
} {
  if (!sceneValue) {
    return {};
  }

  let decoded: string;

  try {
    decoded = decodeURIComponent(sceneValue);
  } catch {
    return {};
  }

  const result: { source?: string; example?: string } = {};

  for (const part of decoded.split(/[&,;?]/)) {
    const separatorIndex = part.search(/[:=]/);

    if (separatorIndex < 1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim().toLowerCase();
    const value = part.slice(separatorIndex + 1).trim();

    if (key === "source" || key === "src" || key === "from") {
      result.source = value;
    }
    if (key === "example" || key === "ex") {
      result.example = value;
    }
  }

  return result;
}
