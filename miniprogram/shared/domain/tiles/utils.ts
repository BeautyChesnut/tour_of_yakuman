import type {
  BaseTile,
  NumberSuit,
  NumberTile,
  RedFiveTile,
  Tile,
  TileCountValidationResult
} from "./types";

const SUIT_ORDER: Record<NumberSuit, number> = {
  m: 0,
  p: 1,
  s: 2
};

const HONOR_ORDER: BaseTile[] = ["east", "south", "west", "north", "white", "green", "red"];

const RED_TO_BASE: Record<RedFiveTile, NumberTile> = {
  red5m: "5m",
  red5p: "5p",
  red5s: "5s"
};

const HONOR_NAMES: Record<BaseTile, string> = {
  east: "东",
  south: "南",
  west: "西",
  north: "北",
  white: "白",
  green: "发",
  red: "中",
  "1m": "一万",
  "2m": "二万",
  "3m": "三万",
  "4m": "四万",
  "5m": "五万",
  "6m": "六万",
  "7m": "七万",
  "8m": "八万",
  "9m": "九万",
  "1p": "一筒",
  "2p": "二筒",
  "3p": "三筒",
  "4p": "四筒",
  "5p": "五筒",
  "6p": "六筒",
  "7p": "七筒",
  "8p": "八筒",
  "9p": "九筒",
  "1s": "一索",
  "2s": "二索",
  "3s": "三索",
  "4s": "四索",
  "5s": "五索",
  "6s": "六索",
  "7s": "七索",
  "8s": "八索",
  "9s": "九索"
};

export function isRedTile(tile: Tile): tile is RedFiveTile {
  return tile === "red5m" || tile === "red5p" || tile === "red5s";
}

export function normalizeRedTile(tile: Tile): BaseTile {
  return isRedTile(tile) ? RED_TO_BASE[tile] : tile;
}

export function isNumberTile(tile: Tile): tile is NumberTile | RedFiveTile {
  const normalized = normalizeRedTile(tile);

  return /^[1-9][mps]$/.test(normalized);
}

export function isHonorTile(tile: Tile): boolean {
  return !isNumberTile(tile);
}

export function getTileDisplayName(tile: Tile): string {
  if (isRedTile(tile)) {
    return `赤${HONOR_NAMES[normalizeRedTile(tile)]}`;
  }

  return HONOR_NAMES[tile];
}

export function countTiles(tiles: readonly Tile[]): Partial<Record<BaseTile, number>> {
  return tiles.reduce<Partial<Record<BaseTile, number>>>((counts, tile) => {
    const normalized = normalizeRedTile(tile);

    return {
      ...counts,
      [normalized]: (counts[normalized] ?? 0) + 1
    };
  }, {});
}

export function validateTileCounts(tiles: readonly Tile[]): TileCountValidationResult {
  const errors: string[] = [];
  const counts = countTiles(tiles);
  const redCounts = tiles
    .filter(isRedTile)
    .reduce<Partial<Record<RedFiveTile, number>>>((acc, tile) => {
      return {
        ...acc,
        [tile]: (acc[tile] ?? 0) + 1
      };
    }, {});

  for (const [tile, count] of Object.entries(counts) as Array<[BaseTile, number]>) {
    if (count > 4) {
      errors.push(`${getTileDisplayName(tile)}数量超过四张`);
    }
  }

  for (const [tile, count] of Object.entries(redCounts) as Array<[RedFiveTile, number]>) {
    if (count > 1) {
      errors.push(`${getTileDisplayName(tile)}数量超过一张`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function compareTiles(a: Tile, b: Tile): number {
  return getTileSortKey(a) - getTileSortKey(b);
}

export function getDoraFromIndicator(indicator: Tile): BaseTile {
  const normalized = normalizeRedTile(indicator);

  if (isNumberTile(normalized)) {
    const rank = Number(normalized[0]);
    const suit = normalized[1] as NumberSuit;
    const nextRank = rank === 9 ? 1 : rank + 1;

    return `${nextRank}${suit}` as BaseTile;
  }

  const honorIndex = HONOR_ORDER.indexOf(normalized);

  if (honorIndex >= 0 && honorIndex <= 3) {
    return HONOR_ORDER[(honorIndex + 1) % 4];
  }

  const dragonOrder: BaseTile[] = ["white", "green", "red"];
  const dragonIndex = dragonOrder.indexOf(normalized);

  return dragonOrder[(dragonIndex + 1) % dragonOrder.length];
}

function getTileSortKey(tile: Tile): number {
  const normalized = normalizeRedTile(tile);

  if (isNumberTile(normalized)) {
    const rank = Number(normalized[0]);
    const suit = normalized[1] as NumberSuit;
    const redOffset = isRedTile(tile) ? 0.1 : 0;

    return SUIT_ORDER[suit] * 10 + rank + redOffset;
  }

  return 40 + HONOR_ORDER.indexOf(normalized);
}
