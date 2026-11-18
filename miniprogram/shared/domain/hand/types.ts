import type { Tile } from "../tiles/index";
import type { Seat } from "../round/index";

export type MeldType = "chi" | "pon" | "minkan" | "ankan" | "kakan";

export interface Meld {
  type: MeldType;
  tiles: Tile[];
  open: boolean;
  calledTile?: Tile;
}

export interface WinConditions {
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  menzenTsumo: boolean;
  haitei: boolean;
  houtei: boolean;
  rinshan: boolean;
  chankan: boolean;
  tenhou: boolean;
  chiihou: boolean;
  enableUraDora: boolean;
}

export interface HandInput {
  concealedTiles: Tile[];
  winningTile?: Tile;
  melds: Meld[];
  doraIndicators: Tile[];
  kanDoraIndicators: Tile[];
  uraDoraIndicators: Tile[];
  nukiDoraCount?: number;
  liabilitySeat?: Seat;
  conditions: WinConditions;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
