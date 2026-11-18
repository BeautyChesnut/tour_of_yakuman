import type { Meld, WinConditions } from "../../domain/hand/index";
import type { PlayerPoints, RoundWind, Seat, WinType } from "../../domain/round/index";
import type { RoomRoundState, RoomSharedScoringData } from "../../domain/online-room/index";
import type { Tile } from "../../domain/tiles/index";

export interface LocalScoringDraftLike {
  roundWind: RoundWind;
  roundIndex: number;
  honba: number;
  riichiSticks: number;
  dealer: Seat;
  eventType: "ron" | "tsumo" | "draw";
  winType: WinType;
  winner?: Seat | "";
  ronWinners?: Seat[];
  discarder?: Seat | "";
  tenpaiSeats: Record<Seat, boolean>;
  playerPoints: PlayerPoints;
  concealedTiles: Array<Tile | "">;
  winningTile: Array<Tile | "">;
  melds: Meld[];
  doraIndicators: Array<Tile | "">;
  kanDoraIndicators: Array<Tile | "">;
  uraDoraIndicators: Array<Tile | "">;
  conditions: WinConditions;
  riichiSeats: Record<Seat, boolean>;
  recordIds: string[];
  recentRecordId?: string;
}

export interface LocalScoringDraftPatch {
  roundWind: RoundWind;
  roundIndex: number;
  honba: number;
  riichiSticks: number;
  dealer: Seat;
  eventType: "ron" | "tsumo" | "draw";
  winType: WinType;
  winner: Seat | "";
  ronWinners: Seat[];
  discarder: Seat | "";
  tenpaiSeats: Record<Seat, boolean>;
  playerPoints: PlayerPoints;
  concealedTiles: Tile[];
  winningTile: Tile[];
  melds: Meld[];
  doraIndicators: Tile[];
  kanDoraIndicators: Tile[];
  uraDoraIndicators: Tile[];
  conditions: WinConditions;
  riichiSeats: Record<Seat, boolean>;
  recordIds: string[];
  recentRecordId?: string;
}

export function createRoomSharedScoringDataFromDraft(
  draft: LocalScoringDraftLike
): RoomSharedScoringData {
  return {
    round: createRoomRoundStateFromDraft(draft),
    playerPoints: { ...draft.playerPoints },
    hand: {
      concealedTiles: compactTiles(draft.concealedTiles),
      winningTile: compactTiles(draft.winningTile)[0],
      melds: [...draft.melds]
    },
    dora: {
      doraIndicators: compactTiles(draft.doraIndicators),
      kanDoraIndicators: compactTiles(draft.kanDoraIndicators),
      uraDoraIndicators: compactTiles(draft.uraDoraIndicators)
    },
    conditions: { ...draft.conditions },
    riichiSeats: { ...draft.riichiSeats },
    tenpaiSeats: { ...draft.tenpaiSeats },
    recordIds: [...draft.recordIds],
    recentRecordId: draft.recentRecordId
  };
}

export function createDraftPatchFromRoomSharedScoringData(
  sharedState: RoomSharedScoringData
): LocalScoringDraftPatch {
  return {
    roundWind: sharedState.round.roundWind,
    roundIndex: sharedState.round.roundIndex,
    honba: sharedState.round.honba,
    riichiSticks: sharedState.round.riichiSticks,
    dealer: sharedState.round.dealer,
    eventType: sharedState.round.eventType,
    winType: sharedState.round.winType,
    winner: sharedState.round.winner ?? "",
    ronWinners: sharedState.round.ronWinners ?? [],
    discarder: sharedState.round.discarder ?? "",
    tenpaiSeats: { ...sharedState.tenpaiSeats },
    playerPoints: { ...sharedState.playerPoints },
    concealedTiles: [...sharedState.hand.concealedTiles],
    winningTile: sharedState.hand.winningTile ? [sharedState.hand.winningTile] : [],
    melds: [...sharedState.hand.melds],
    doraIndicators: [...sharedState.dora.doraIndicators],
    kanDoraIndicators: [...sharedState.dora.kanDoraIndicators],
    uraDoraIndicators: [...sharedState.dora.uraDoraIndicators],
    conditions: { ...sharedState.conditions },
    riichiSeats: { ...sharedState.riichiSeats },
    recordIds: [...sharedState.recordIds],
    recentRecordId: sharedState.recentRecordId
  };
}

function createRoomRoundStateFromDraft(draft: LocalScoringDraftLike): RoomRoundState {
  return {
    roundWind: draft.roundWind,
    roundIndex: draft.roundIndex,
    honba: draft.honba,
    riichiSticks: draft.riichiSticks,
    dealer: draft.dealer,
    eventType: draft.eventType,
    winType: draft.winType,
    winner: draft.winner || undefined,
    ronWinners: draft.ronWinners,
    discarder: draft.discarder || undefined,
    tenpaiSeats: Object.entries(draft.tenpaiSeats)
      .filter(([, checked]) => checked)
      .map(([seat]) => seat as Seat)
  };
}

function compactTiles(tiles: Array<Tile | "">): Tile[] {
  return tiles.filter((tile): tile is Tile => tile !== "");
}
