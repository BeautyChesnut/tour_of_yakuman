export type Seat = "east" | "south" | "west" | "north";
export type RoundWind = "east" | "south" | "west" | "north";
export type WinType = "ron" | "tsumo";

export type PlayerPoints = Record<Seat, number>;

export interface RoundContext {
  roundWind: RoundWind;
  honba: number;
  riichiSticks: number;
  dealer: Seat;
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

export type RoundEvent =
  | { type: "ron"; winner: Seat; discarder: Seat }
  | { type: "tsumo"; winner: Seat }
  | { type: "draw"; tenpaiSeats: Seat[] };

export const DEFAULT_INITIAL_POINTS = 25000;

export const SEATS: Seat[] = ["east", "south", "west", "north"];
