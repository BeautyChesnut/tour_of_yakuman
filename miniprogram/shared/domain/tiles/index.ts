export type {
  BaseTile,
  DragonTile,
  HonorTile,
  NumberRank,
  NumberSuit,
  NumberTile,
  RedFiveTile,
  Tile,
  TileCountValidationResult,
  WindTile
} from "./types";
export {
  compareTiles,
  countTiles,
  getDoraFromIndicator,
  getTileDisplayName,
  isHonorTile,
  isNumberTile,
  isRedTile,
  normalizeRedTile,
  validateTileCounts
} from "./utils";
