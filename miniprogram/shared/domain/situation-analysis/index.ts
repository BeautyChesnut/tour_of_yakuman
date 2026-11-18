import { SEATS, getActiveSeats } from "../round/index";
import type { PlayerCount, PlayerPoints, RoundWind, Seat } from "../round/index";
import type { OnlineRoom, RoomScoringState } from "../online-room/index";
import { applyDrawSettlement, applyHandPaymentSettlement } from "../settlement/index";
import type { Payment } from "../scoring/index";
import type { ThemeId } from "../theme/index";

export interface SituationAnalysisInput {
  playerPoints: PlayerPoints;
  perspectiveSeat: Seat;
  dealer: Seat;
  honba: number;
  riichiSticks: number;
  playerCount?: PlayerCount;
}

export type SituationAnalysisMode = "local" | "online";

export interface SituationAnalysisAvailabilityInput {
  mode: SituationAnalysisMode;
  playerCount: PlayerCount;
  occupiedSeatCount?: number;
}

export interface PointTargetAnalysis {
  targetRank: 1 | 2 | 3;
  achieved: boolean;
  currentRank: number;
  ronRequirements: RonRequirement[];
  tsumoRequirement?: TsumoRequirement;
}

export interface SituationAnalysisSnapshot extends SituationAnalysisInput {
  createdAt: number;
  roundWind: RoundWind;
  roundIndex: number;
  roundLabel: string;
  playerNames: Record<Seat, string>;
  themeId?: ThemeId;
  source?: SituationAnalysisSnapshotSource;
}

export type SituationAnalysisSnapshotSource =
  | { mode: "local" }
  | {
      mode: "online";
      roomId: string;
      roomCode: string;
      roomVersion: number;
    };

export interface RonRequirement {
  discarder: Seat;
  handPoints: number;
  finalRank: number;
  pointsAfter: PlayerPoints;
}

export interface TsumoRequirement {
  handPoints: number;
  dealerPayment: number;
  childPayment: number;
  finalRank: number;
  pointsAfter: PlayerPoints;
}

export interface DealInRisk {
  winner: Seat;
  handPoints: number;
  finalRank: number;
  pointsAfter: PlayerPoints;
}

export interface FourthPlaceRisk {
  winner: Seat;
  handPoints: number;
  finalRank: 4;
  pointsAfter: PlayerPoints;
}

export interface LastPlaceRisk {
  winner: Seat;
  handPoints: number;
  finalRank: 3 | 4;
  pointsAfter: PlayerPoints;
}

export interface AvoidFourthAnalysis {
  currentRank: number;
  currentlyFourth: boolean;
  risks: FourthPlaceRisk[];
}

export interface AvoidLastAnalysis {
  currentRank: number;
  lastRank: 3 | 4;
  currentlyLast: boolean;
  risks: LastPlaceRisk[];
}

export interface ScoreRecommendationInput {
  minimumHandPoints: number;
  isDealer: boolean;
  winType: "ron" | "tsumo";
  playerCount?: PlayerCount;
}

export interface ScoreRecommendation {
  id: string;
  label: string;
  tone: "minimum" | "alternative" | "stable";
  handPoints: number;
  dealerPayment?: number;
  childPayment?: number;
}

export interface PointSituationAnalysis {
  currentRank: number;
  currentPoints: number;
  rankedSeats: Seat[];
  gapToPrevious?: number;
  gapToLeader: number;
  improveTargetRank?: number;
  improveRonRequirements: RonRequirement[];
  improveTsumoRequirement?: TsumoRequirement;
  firstRonRequirements: RonRequirement[];
  firstTsumoRequirement?: TsumoRequirement;
  dealInRisk?: DealInRisk;
}

export type SituationRoundStage = "first-half" | "second-half" | "all-last" | "extension";

export interface RoundStageAnalysis {
  stage: SituationRoundStage;
  isDealer: boolean;
  isDefaultAllLast: boolean;
}

export interface RiichiCostAnalysis {
  canDeclare: boolean;
  pointsBefore: number;
  pointsAfterDeclaration: number;
  rankBefore: number;
  rankAfterDeclaration: number;
  rankChanged: boolean;
  riichiSticksAfter: number;
  playerPointsAfter: PlayerPoints;
}

export interface DrawSituationAnalysis {
  tenpaiSeats: Seat[];
  pointsAfter: PlayerPoints;
  rankedSeats: Seat[];
  perspectiveRankBefore: number;
  perspectiveRankAfter: number;
  dealerContinues: boolean;
  nextHonba: number;
  riichiSticksAfter: number;
}

interface TsumoCandidate {
  handPoints: number;
  dealerPayment: number;
  childPayment: number;
}

interface ScorePattern {
  id: string;
  label: string;
  basePoints: number;
  practicalOrder: number;
  ronAllowed: boolean;
}

const FU_VALUES = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
const MAX_YAKUMAN_MULTIPLIER = 6;

export const SITUATION_ANALYSIS_SNAPSHOT_STORAGE_KEY = "tourOfYakumanSituationAnalysisSnapshot";
export const SITUATION_TIE_BREAK_ORDER: readonly Seat[] = ["east", "south", "west", "north"];

const ROUND_WIND_LABELS: Record<RoomScoringState["round"]["roundWind"], string> = {
  east: "东场",
  south: "南场",
  west: "西场",
  north: "北场"
};
const ROUND_INDEX_LABELS = ["一局", "二局", "三局", "四局"];

export function createRefreshedOnlineSituationSnapshot(
  snapshot: SituationAnalysisSnapshot,
  room: OnlineRoom,
  state: RoomScoringState,
  now: number
): SituationAnalysisSnapshot {
  if (snapshot.source?.mode !== "online") {
    throw new Error("当前局势分析不是在线房间数据");
  }

  if (snapshot.source.roomId !== room.id || state.roomId !== room.id) {
    throw new Error("在线房间与局势分析快照不匹配");
  }

  return {
    ...snapshot,
    createdAt: now,
    roundWind: state.round.roundWind,
    roundIndex: state.round.roundIndex,
    roundLabel: `${ROUND_WIND_LABELS[state.round.roundWind]}${ROUND_INDEX_LABELS[state.round.roundIndex] ?? state.round.roundIndex + 1}`,
    playerNames: SEATS.reduce<Record<Seat, string>>(
      (names, seat) => ({
        ...names,
        [seat]: room.seatMap[seat]?.displayName?.trim() || snapshot.playerNames[seat]
      }),
      {} as Record<Seat, string>
    ),
    playerPoints: { ...state.playerPoints },
    playerCount: 4,
    dealer: state.round.dealer,
    honba: state.round.honba,
    riichiSticks: state.round.riichiSticks,
    source: {
      mode: "online",
      roomId: room.id,
      roomCode: room.roomCode,
      roomVersion: state.version
    }
  };
}

export function analyzeRoundStage(input: {
  roundWind: RoundWind;
  roundIndex: number;
  dealer: Seat;
  perspectiveSeat: Seat;
  playerCount?: PlayerCount;
}): RoundStageAnalysis {
  const allLastRoundIndex = (input.playerCount ?? 4) - 1;
  const stage: SituationRoundStage =
    input.roundWind === "east"
      ? "first-half"
      : input.roundWind === "south" && input.roundIndex === allLastRoundIndex
        ? "all-last"
        : input.roundWind === "south"
          ? "second-half"
          : "extension";

  return {
    stage,
    isDealer: input.dealer === input.perspectiveSeat,
    isDefaultAllLast: stage === "all-last"
  };
}

export function analyzeRiichiCost(input: SituationAnalysisInput): RiichiCostAnalysis {
  const rankBefore = createRankMap(input.playerPoints, input.playerCount)[input.perspectiveSeat];
  const pointsBefore = input.playerPoints[input.perspectiveSeat];
  const canDeclare = pointsBefore >= 1000;
  const playerPointsAfter = canDeclare
    ? {
        ...input.playerPoints,
        [input.perspectiveSeat]: pointsBefore - 1000
      }
    : { ...input.playerPoints };
  const rankAfterDeclaration = createRankMap(playerPointsAfter, input.playerCount)[
    input.perspectiveSeat
  ];

  return {
    canDeclare,
    pointsBefore,
    pointsAfterDeclaration: playerPointsAfter[input.perspectiveSeat],
    rankBefore,
    rankAfterDeclaration,
    rankChanged: rankAfterDeclaration !== rankBefore,
    riichiSticksAfter: input.riichiSticks + (canDeclare ? 1 : 0),
    playerPointsAfter
  };
}

export function analyzeDrawSituation(
  input: SituationAnalysisInput & { roundWind: RoundWind },
  tenpaiSeats: readonly Seat[]
): DrawSituationAnalysis {
  const settlement = applyDrawSettlement(
    {
      roundWind: input.roundWind,
      dealer: input.dealer,
      honba: input.honba,
      riichiSticks: input.riichiSticks,
      playerCount: input.playerCount ?? 4,
      playerPoints: input.playerPoints,
      tenpaiSeats: [...tenpaiSeats]
    },
    input.playerPoints
  );
  const rankedSeats = rankSituationSeats(settlement.pointsAfter, input.playerCount);

  return {
    tenpaiSeats: settlement.tenpaiSeats,
    pointsAfter: settlement.pointsAfter,
    rankedSeats,
    perspectiveRankBefore: createRankMap(input.playerPoints, input.playerCount)[
      input.perspectiveSeat
    ],
    perspectiveRankAfter: rankedSeats.indexOf(input.perspectiveSeat) + 1,
    dealerContinues: settlement.dealerContinues,
    nextHonba: settlement.nextHonba,
    riichiSticksAfter: settlement.riichiSticksAfter
  };
}

export function canShowSituationAnalysis(input: SituationAnalysisAvailabilityInput): boolean {
  return input.playerCount === 4 || (input.mode === "local" && input.playerCount === 3);
}

export function resolveSituationAnalysisPerspectiveSeat(input: {
  mode: SituationAnalysisMode;
  dealer: Seat;
  onlineSeat: Seat;
}): Seat {
  return input.mode === "local" ? input.dealer : input.onlineSeat;
}

export function analyzePointSituation(input: SituationAnalysisInput): PointSituationAnalysis {
  const rankedSeats = rankSituationSeats(input.playerPoints, input.playerCount);
  const currentRank = rankedSeats.indexOf(input.perspectiveSeat) + 1;
  const previousSeat = currentRank > 1 ? rankedSeats[currentRank - 2] : undefined;
  const leaderSeat = rankedSeats[0];
  const improveTargetRank = currentRank > 1 ? currentRank - 1 : undefined;
  const improveRonRequirements = improveTargetRank
    ? createRonRequirements(input, improveTargetRank)
    : [];
  const firstRonRequirements = currentRank > 1 ? createRonRequirements(input, 1) : [];
  const dealInRisks = rankedSeats
    .filter((seat) => createRankMap(input.playerPoints, input.playerCount)[seat] > currentRank)
    .map((winner) => findDealInRisk(input, winner))
    .filter((risk): risk is DealInRisk => Boolean(risk))
    .sort((left, right) => left.handPoints - right.handPoints);

  return {
    currentRank,
    currentPoints: input.playerPoints[input.perspectiveSeat],
    rankedSeats,
    gapToPrevious: previousSeat
      ? Math.max(0, input.playerPoints[previousSeat] - input.playerPoints[input.perspectiveSeat])
      : undefined,
    gapToLeader: Math.max(
      0,
      input.playerPoints[leaderSeat] - input.playerPoints[input.perspectiveSeat]
    ),
    improveTargetRank,
    improveRonRequirements,
    improveTsumoRequirement: improveTargetRank
      ? findTsumoRequirement(input, improveTargetRank)
      : undefined,
    firstRonRequirements,
    firstTsumoRequirement: currentRank > 1 ? findTsumoRequirement(input, 1) : undefined,
    dealInRisk: dealInRisks[0]
  };
}

export function analyzePointTarget(
  input: SituationAnalysisInput,
  targetRank: 1 | 2 | 3
): PointTargetAnalysis {
  const currentRank = createRankMap(input.playerPoints, input.playerCount)[input.perspectiveSeat];
  const achieved = currentRank <= targetRank;

  return {
    targetRank,
    achieved,
    currentRank,
    ronRequirements: achieved ? [] : createRonRequirements(input, targetRank),
    tsumoRequirement: achieved ? undefined : findTsumoRequirement(input, targetRank)
  };
}

export function analyzeAvoidFourth(input: SituationAnalysisInput): AvoidFourthAnalysis {
  const analysis = analyzeAvoidLast({ ...input, playerCount: 4 });

  return {
    currentRank: analysis.currentRank,
    currentlyFourth: analysis.currentlyLast,
    risks: analysis.risks.map((risk) => ({ ...risk, finalRank: 4 }))
  };
}

export function analyzeAvoidLast(input: SituationAnalysisInput): AvoidLastAnalysis {
  const playerCount = input.playerCount ?? 4;
  const currentRank = createRankMap(input.playerPoints, playerCount)[input.perspectiveSeat];
  const lastRank = playerCount;

  return {
    currentRank,
    lastRank,
    currentlyLast: currentRank === lastRank,
    risks:
      currentRank === lastRank
        ? []
        : getActiveSeats(playerCount)
            .filter((seat) => seat !== input.perspectiveSeat)
            .map((winner) => findLastPlaceRisk(input, winner, lastRank))
            .filter((risk): risk is LastPlaceRisk => Boolean(risk))
            .sort((left, right) => left.handPoints - right.handPoints)
  };
}

export function createScoreRecommendations(input: ScoreRecommendationInput): ScoreRecommendation[] {
  const candidates = createScorePatterns()
    .filter((pattern) => input.winType !== "ron" || pattern.ronAllowed)
    .map((pattern) => createScoreRecommendationCandidate(pattern, input))
    .filter((candidate) => candidate.handPoints >= input.minimumHandPoints)
    .sort(
      (left, right) =>
        left.handPoints - right.handPoints ||
        left.practicalOrder - right.practicalOrder ||
        left.label.localeCompare(right.label)
    );
  const minimumPoints = candidates[0]?.handPoints;

  if (minimumPoints === undefined) {
    return [];
  }

  const minimumCandidates = candidates
    .filter((candidate) => candidate.handPoints === minimumPoints)
    .slice(0, 2);
  const stableCandidate = candidates.find((candidate) => candidate.handPoints > minimumPoints);
  const selected = [...minimumCandidates, ...(stableCandidate ? [stableCandidate] : [])].slice(
    0,
    3
  );

  return selected.map(({ practicalOrder: _practicalOrder, ...candidate }, index) => ({
    ...candidate,
    tone:
      index === 0 ? "minimum" : candidate.handPoints === minimumPoints ? "alternative" : "stable"
  }));
}

function createRonRequirements(
  input: SituationAnalysisInput,
  targetRank: number
): RonRequirement[] {
  return getSituationActiveSeats(input)
    .filter((seat) => seat !== input.perspectiveSeat)
    .map((discarder) => findRonRequirement(input, discarder, targetRank))
    .filter((requirement): requirement is RonRequirement => Boolean(requirement));
}

function findRonRequirement(
  input: SituationAnalysisInput,
  discarder: Seat,
  targetRank: number
): RonRequirement | undefined {
  const candidates = createRonCandidates(input.perspectiveSeat === input.dealer);

  for (const handPoints of candidates) {
    const pointsAfter = simulateRon(input, input.perspectiveSeat, discarder, handPoints);
    const finalRank = createRankMap(pointsAfter, input.playerCount)[input.perspectiveSeat];

    if (finalRank <= targetRank) {
      return { discarder, handPoints, finalRank, pointsAfter };
    }
  }

  return undefined;
}

function findTsumoRequirement(
  input: SituationAnalysisInput,
  targetRank: number
): TsumoRequirement | undefined {
  const candidates = createTsumoCandidates(
    input.perspectiveSeat === input.dealer,
    input.playerCount
  );

  for (const candidate of candidates) {
    const pointsAfter = simulateTsumo(input, input.perspectiveSeat, candidate);
    const finalRank = createRankMap(pointsAfter, input.playerCount)[input.perspectiveSeat];

    if (finalRank <= targetRank) {
      return { ...candidate, finalRank, pointsAfter };
    }
  }

  return undefined;
}

function findDealInRisk(input: SituationAnalysisInput, winner: Seat): DealInRisk | undefined {
  const candidates = createRonCandidates(winner === input.dealer);

  for (const handPoints of candidates) {
    const pointsAfter = simulateRon(input, winner, input.perspectiveSeat, handPoints);
    const rankMap = createRankMap(pointsAfter, input.playerCount);

    if (rankMap[winner] < rankMap[input.perspectiveSeat]) {
      return {
        winner,
        handPoints,
        finalRank: rankMap[input.perspectiveSeat],
        pointsAfter
      };
    }
  }

  return undefined;
}

function findLastPlaceRisk(
  input: SituationAnalysisInput,
  winner: Seat,
  lastRank: 3 | 4
): LastPlaceRisk | undefined {
  const candidates = createRonCandidates(winner === input.dealer);

  for (const handPoints of candidates) {
    const pointsAfter = simulateRon(input, winner, input.perspectiveSeat, handPoints);
    const finalRank = createRankMap(pointsAfter, input.playerCount)[input.perspectiveSeat];

    if (finalRank === lastRank) {
      return { winner, handPoints, finalRank: lastRank, pointsAfter };
    }
  }

  return undefined;
}

function simulateRon(
  input: SituationAnalysisInput,
  winner: Seat,
  discarder: Seat,
  handPoints: number
): PlayerPoints {
  const handPayments: Payment[] = [
    {
      from: discarder,
      to: winner,
      points: handPoints,
      reason: "hand"
    }
  ];

  return applyHandPaymentSettlement(
    {
      winner,
      discarder,
      winType: "ron",
      honba: input.honba,
      riichiSticks: input.riichiSticks,
      playerCount: input.playerCount ?? 4
    },
    handPayments,
    input.playerPoints
  ).pointsAfter;
}

function simulateTsumo(
  input: SituationAnalysisInput,
  winner: Seat,
  candidate: TsumoCandidate
): PlayerPoints {
  const handPayments: Payment[] = getSituationActiveSeats(input)
    .filter((seat) => seat !== winner)
    .map((payer) => ({
      from: payer,
      to: winner,
      points:
        winner === input.dealer
          ? candidate.childPayment
          : payer === input.dealer
            ? candidate.dealerPayment
            : candidate.childPayment,
      reason: "hand"
    }));

  return applyHandPaymentSettlement(
    {
      winner,
      winType: "tsumo",
      honba: input.honba,
      riichiSticks: input.riichiSticks,
      playerCount: input.playerCount ?? 4
    },
    handPayments,
    input.playerPoints
  ).pointsAfter;
}

function createRonCandidates(isDealer: boolean): number[] {
  const values = new Set<number>();

  createBasePointCandidates(false).forEach((basePoints) => {
    values.add(roundUpToHundred(basePoints * (isDealer ? 6 : 4)));
  });

  return [...values].sort((left, right) => left - right);
}

function createTsumoCandidates(isDealer: boolean, playerCount: PlayerCount = 4): TsumoCandidate[] {
  const candidates = new Map<string, TsumoCandidate>();

  createBasePointCandidates(true).forEach((basePoints) => {
    const dealerPayment = roundUpToHundred(basePoints * 2);
    const childPayment = roundUpToHundred(basePoints * (isDealer ? 2 : 1));
    const handPoints = isDealer
      ? childPayment * (playerCount - 1)
      : dealerPayment + childPayment * (playerCount - 2);
    const candidate = { handPoints, dealerPayment, childPayment };

    candidates.set(`${dealerPayment}-${childPayment}`, candidate);
  });

  return [...candidates.values()].sort((left, right) => left.handPoints - right.handPoints);
}

function createScoreRecommendationCandidate(
  pattern: ScorePattern,
  input: ScoreRecommendationInput
): Omit<ScoreRecommendation, "tone"> & { practicalOrder: number } {
  if (input.winType === "ron") {
    return {
      id: `${pattern.id}-ron-${input.isDealer ? "dealer" : "child"}`,
      label: pattern.label,
      handPoints: roundUpToHundred(pattern.basePoints * (input.isDealer ? 6 : 4)),
      practicalOrder: pattern.practicalOrder
    };
  }

  const dealerPayment = roundUpToHundred(pattern.basePoints * 2);
  const childPayment = roundUpToHundred(pattern.basePoints * (input.isDealer ? 2 : 1));

  return {
    id: `${pattern.id}-tsumo-${input.isDealer ? "dealer" : "child"}`,
    label: pattern.label,
    handPoints: input.isDealer
      ? childPayment * ((input.playerCount ?? 4) - 1)
      : dealerPayment + childPayment * ((input.playerCount ?? 4) - 2),
    dealerPayment,
    childPayment,
    practicalOrder: pattern.practicalOrder
  };
}

function createScorePatterns(): ScorePattern[] {
  const patterns: ScorePattern[] = [];
  const practicalFuOrder = [30, 40, 50, 60, 25, 70, 80, 90, 100, 110, 20];

  FU_VALUES.forEach((fu) => {
    for (let han = 1; han <= 4; han += 1) {
      if ((fu === 20 && han < 2) || (fu === 25 && han < 2)) {
        continue;
      }

      const uncappedBasePoints = fu * 2 ** (han + 2);

      if (uncappedBasePoints >= 2000) {
        continue;
      }

      patterns.push({
        id: `${fu}fu-${han}han`,
        label: `${fu} 符 ${han} 番`,
        basePoints: uncappedBasePoints,
        practicalOrder: han * -100 + practicalFuOrder.indexOf(fu),
        ronAllowed: fu !== 20
      });
    }
  });

  return [
    ...patterns,
    {
      id: "mangan",
      label: "满贯",
      basePoints: 2000,
      practicalOrder: 1000,
      ronAllowed: true
    },
    {
      id: "haneman",
      label: "跳满",
      basePoints: 3000,
      practicalOrder: 1001,
      ronAllowed: true
    },
    {
      id: "baiman",
      label: "倍满",
      basePoints: 4000,
      practicalOrder: 1002,
      ronAllowed: true
    },
    {
      id: "sanbaiman",
      label: "三倍满",
      basePoints: 6000,
      practicalOrder: 1003,
      ronAllowed: true
    },
    {
      id: "yakuman",
      label: "役满",
      basePoints: 8000,
      practicalOrder: 1004,
      ronAllowed: true
    },
    ...Array.from({ length: MAX_YAKUMAN_MULTIPLIER - 1 }, (_, index) => ({
      id: `${index + 2}x-yakuman`,
      label: `${index + 2} 倍役满`,
      basePoints: 8000 * (index + 2),
      practicalOrder: 1005 + index,
      ronAllowed: true
    }))
  ];
}

function createBasePointCandidates(forTsumo: boolean): number[] {
  const values = new Set<number>();

  FU_VALUES.forEach((fu) => {
    for (let han = 1; han <= 13; han += 1) {
      if ((!forTsumo && fu === 20) || (fu === 20 && han < 2) || (fu === 25 && han < 2)) {
        continue;
      }
      values.add(createLimitedBasePoints(fu, han));
    }
  });

  for (let multiplier = 2; multiplier <= MAX_YAKUMAN_MULTIPLIER; multiplier += 1) {
    values.add(8000 * multiplier);
  }

  return [...values].sort((left, right) => left - right);
}

function createLimitedBasePoints(fu: number, han: number): number {
  if (han >= 13) {
    return 8000;
  }
  if (han >= 11) {
    return 6000;
  }
  if (han >= 8) {
    return 4000;
  }
  if (han >= 6) {
    return 3000;
  }
  if (han >= 5) {
    return 2000;
  }

  return Math.min(2000, fu * 2 ** (han + 2));
}

export function rankSituationSeats(
  playerPoints: PlayerPoints,
  playerCount: PlayerCount = 4
): Seat[] {
  const tieBreakOrder = getSituationTieBreakOrder(playerCount);

  return [...tieBreakOrder].sort((left, right) => {
    const pointDiff = playerPoints[right] - playerPoints[left];

    return pointDiff || tieBreakOrder.indexOf(left) - tieBreakOrder.indexOf(right);
  });
}

function createRankMap(
  playerPoints: PlayerPoints,
  playerCount: PlayerCount = 4
): Record<Seat, number> {
  return rankSituationSeats(playerPoints, playerCount).reduce<Record<Seat, number>>(
    (rankMap, seat, index) => ({
      ...rankMap,
      [seat]: index + 1
    }),
    {} as Record<Seat, number>
  );
}

export function getSituationTieBreakOrder(playerCount: PlayerCount = 4): Seat[] {
  const activeSeats = getActiveSeats(playerCount);

  return SITUATION_TIE_BREAK_ORDER.filter((seat) => activeSeats.includes(seat));
}

function getSituationActiveSeats(input: Pick<SituationAnalysisInput, "playerCount">): Seat[] {
  return getActiveSeats(input.playerCount ?? 4);
}

function roundUpToHundred(value: number): number {
  return Math.ceil(value / 100) * 100;
}
