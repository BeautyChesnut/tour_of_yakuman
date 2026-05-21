export type NumberSuit = "m" | "p" | "s";
export type NumberRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type NumberTile = `${NumberRank}${NumberSuit}`;
export type RedFiveTile = "red5m" | "red5p" | "red5s";
export type WindTile = "east" | "south" | "west" | "north";
export type DragonTile = "white" | "green" | "red";
export type HonorTile = WindTile | DragonTile;
export type BaseTile = NumberTile | HonorTile;
export type Tile = BaseTile | RedFiveTile;

export interface TileCountValidationResult {
  valid: boolean;
  errors: string[];
}
