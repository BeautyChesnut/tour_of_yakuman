export type Seat = "east" | "south" | "west" | "north";
export type RoundWind = "east" | "south" | "west" | "north";
export type WinType = "ron" | "tsumo";
export type GameVariant = "yonma" | "sanma";
export type PlayerCount = 3 | 4;

export type PlayerPoints = Record<Seat, number>;

export interface RoundContext {
  roundWind: RoundWind;
  honba: number;
  riichiSticks: number;
  dealer: Seat;
  playerCount?: PlayerCount;
  playerPoints?: PlayerPoints;
}

export interface RoundInput extends RoundContext {
  winner: Seat;
  discarder?: Seat;
  winType: WinType;
}

export interface DrawRoundInput extends RoundContext {
  tenpaiSeats: Seat[];
}

export interface MultipleRonRoundInput extends RoundContext {
  discarder: Seat;
  winners: Seat[];
}

export type RoundEvent =
  | { type: "ron"; winner: Seat; discarder: Seat; winners?: Seat[] }
  | { type: "tsumo"; winner: Seat }
  | { type: "draw"; tenpaiSeats: Seat[] };

export const DEFAULT_INITIAL_POINTS = 25000;

export const SEATS: Seat[] = ["east", "south", "west", "north"];
export const TURN_ORDER: Seat[] = ["east", "north", "west", "south"];
export const SANMA_SEATS: Seat[] = ["east", "south", "west"];

export function getActiveSeats(playerCount: PlayerCount = 4): Seat[] {
  return playerCount === 3 ? SANMA_SEATS : SEATS;
}

export function getActiveTurnOrder(playerCount: PlayerCount = 4): Seat[] {
  const activeSeats = getActiveSeats(playerCount);

  return TURN_ORDER.filter((seat) => activeSeats.includes(seat));
}
