import Riichi from "../../vendor/riichi";
import type RiichiPackage from "riichi";
import { validateHandInput } from "../hand/index";
import type { HandInput, Meld } from "../hand/index";
import type { RoundInput, Seat } from "../round/index";
import { SEATS, TURN_ORDER, getActiveSeats } from "../round/index";
import type { LimitHand, NamedHan, Payment, ScoringResult } from "../scoring/index";
import { compareTiles, getDoraFromIndicator, normalizeRedTile } from "../tiles/index";
import type { BaseTile, NumberSuit, Tile } from "../tiles/index";

export interface RiichiAdapterRuleOptions {
  kuitan: boolean;
  akaDora: boolean;
  kiriageMangan: boolean;
  kazoeYakuman: boolean;
  doubleYakuman: boolean;
  doubleWindPairFu: 2 | 4;
}

export const DEFAULT_RIICHI_ADAPTER_RULES: RiichiAdapterRuleOptions = {
  kuitan: true,
  akaDora: true,
  kiriageMangan: false,
  kazoeYakuman: true,
  doubleYakuman: true,
  doubleWindPairFu: 4
};

const SEAT_TO_RIICHI_WIND: Record<Seat, string> = {
  east: "1",
  south: "2",
  west: "3",
  north: "4"
};

const RIICHI_WIND_LABELS: Record<number, string> = {
  1: "東",
  2: "南",
  3: "西",
  4: "北",
  5: "白",
  6: "發",
  7: "中"
};

const YAKU_NAME_ZH: Record<string, string> = {
  国士無双十三面待ち: "国士无双十三面",
  国士無双: "国士无双",
  純正九蓮宝燈: "纯正九莲宝灯",
  九蓮宝燈: "九莲宝灯",
  四暗刻単騎待ち: "四暗刻单骑",
  四暗刻: "四暗刻",
  大四喜: "大四喜",
  小四喜: "小四喜",
  大三元: "大三元",
  字一色: "字一色",
  緑一色: "绿一色",
  清老頭: "清老头",
  四槓子: "四杠子",
  天和: "天和",
  地和: "地和",
  人和: "人和",
  大七星: "大七星",
  清一色: "清一色",
  混一色: "混一色",
  二盃口: "二杯口",
  純全帯么九: "纯全带幺九",
  混全帯么九: "混全带幺九",
  対々和: "对对和",
  混老頭: "混老头",
  三槓子: "三杠子",
  小三元: "小三元",
  三色同刻: "三色同刻",
  三暗刻: "三暗刻",
  七対子: "七对子",
  ダブル立直: "两立直",
  一気通貫: "一气通贯",
  三色同順: "三色同顺",
  断么九: "断幺九",
  平和: "平和",
  一盃口: "一杯口",
  門前清自摸和: "门前清自摸和",
  立直: "立直",
  一発: "一发",
  嶺上開花: "岭上开花",
  搶槓: "抢杠",
  海底摸月: "海底摸月",
  河底撈魚: "河底捞鱼",
  場風東: "场风 东",
  場風南: "场风 南",
  場風西: "场风 西",
  場風北: "场风 北",
  自風東: "自风 东",
  自風南: "自风 南",
  自風西: "自风 西",
  自風北: "自风 北",
  役牌白: "役牌 白",
  役牌発: "役牌 发",
  役牌中: "役牌 中",
  ドラ: "宝牌",
  赤ドラ: "赤宝牌",
  抜きドラ: "拔北"
};

type RiichiInstance = InstanceType<typeof RiichiPackage>;
type RiichiResult = RiichiPackage.Result;

type MutableRiichiResult = Omit<RiichiResult, "oya" | "ko"> & {
  oya: number[];
  ko: number[];
};

type EvalFreeRiichi = RiichiInstance & {
  tmpResult: MutableRiichiResult;
  agari: string;
  isTsumo: boolean;
  isOya: boolean;
  bakaze: number;
  jikaze: number;
  calcTen: () => void;
};

export function calculateWithRiichi(
  handInput: HandInput,
  roundInput: RoundInput,
  rules: RiichiAdapterRuleOptions = DEFAULT_RIICHI_ADAPTER_RULES
): ScoringResult {
  const validation = validateHandInput(handInput);

  if (!validation.valid) {
    return createInvalidResult(validation.errors);
  }

  if (!handInput.winningTile) {
    return createInvalidResult(["需要选择和牌张"]);
  }

  const riichi = new Riichi(toRiichiInput(handInput, roundInput));
  setKnownWinningTile(riichi, handInput.winningTile);
  applyRules(riichi, rules);
  applyEvalFreeCalcTen(riichi);
  riichi.disableHairi();

  const result = riichi.calc();

  if (result.error) {
    return createInvalidResult(["算点库返回错误"]);
  }

  if (!result.isAgari) {
    return createInvalidResult([result.text || "不是有效和牌"]);
  }

  if (!result.yakuman && !result.han) {
    return createInvalidResult(["没有役"]);
  }

  const adjustedResult = applyNukiDora(result, handInput.nukiDoraCount, roundInput);
  const { yaku, dora } = splitYakuAndDora(adjustedResult.yaku);
  const zeroDelta = SEATS.reduce<Record<Seat, number>>(
    (acc, seat) => ({
      ...acc,
      [seat]: 0
    }),
    {} as Record<Seat, number>
  );

  return {
    valid: true,
    errors: [],
    warnings: getRuleWarnings(rules),
    yaku,
    dora,
    han: adjustedResult.han,
    fu: adjustedResult.fu || undefined,
    fuDetails: adjustedResult.fu ? [{ name: "总符数（riichi）", fu: adjustedResult.fu }] : [],
    limit: mapLimit(adjustedResult.name),
    basePoints: calculateBasePoints(adjustedResult),
    payments: createLiabilityAdjustedHandPayments(adjustedResult, roundInput, handInput),
    pointDelta: zeroDelta
  };
}

export function toRiichiInput(handInput: HandInput, roundInput: RoundInput): string {
  if (!handInput.winningTile) {
    throw new Error("需要选择和牌张");
  }

  const baseTiles =
    roundInput.winType === "tsumo"
      ? [...handInput.concealedTiles, handInput.winningTile]
      : handInput.concealedTiles;
  const parts = [tilesToRiichiGroup(baseTiles)];

  if (roundInput.winType === "ron") {
    parts.push(tileToRiichi(handInput.winningTile));
  }

  for (const meld of handInput.melds) {
    parts.push(meldToRiichiGroup(meld));
  }

  const doraTiles = [
    ...handInput.doraIndicators.map((tile) => getDoraFromIndicatorForRound(tile, roundInput)),
    ...handInput.kanDoraIndicators.map((tile) => getDoraFromIndicatorForRound(tile, roundInput)),
    ...(shouldUseUraDora(handInput)
      ? handInput.uraDoraIndicators.map((tile) => getDoraFromIndicatorForRound(tile, roundInput))
      : [])
  ];

  if (doraTiles.length > 0) {
    parts.push(`d${tilesToRiichiGroup(doraTiles)}`);
  }

  parts.push(`${conditionsToRiichiExtra(handInput, roundInput)}${roundToRiichiWind(roundInput)}`);

  return parts.join("+");
}

function applyRules(riichi: RiichiInstance, rules: RiichiAdapterRuleOptions): void {
  if (!rules.kuitan) {
    riichi.disableKuitan();
  }

  if (!rules.akaDora) {
    riichi.disableAka();
  }

  if (!rules.doubleYakuman) {
    riichi.disableWyakuman();
  }
}

function setKnownWinningTile(riichi: RiichiInstance, winningTile: Tile): void {
  (riichi as EvalFreeRiichi).agari = tileToRiichi(normalizeRedTile(winningTile));
}

function applyEvalFreeCalcTen(riichi: RiichiInstance): void {
  const target = riichi as EvalFreeRiichi;

  target.calcTen = function calcTenWithoutEval(this: EvalFreeRiichi) {
    const result = this.tmpResult;
    result.name = "";
    result.text = `(${RIICHI_WIND_LABELS[this.bakaze]}場`;
    result.text += `${RIICHI_WIND_LABELS[this.jikaze]}家)`;
    result.text += this.isTsumo ? "自摸" : "栄和";

    let base: number;

    if (result.yakuman) {
      base = 8000 * result.yakuman;
      result.name = result.yakuman > 1 ? `${result.yakuman}倍役満` : "役満";
    } else {
      if (!result.han) {
        return;
      }

      base = result.fu * 2 ** (result.han + 2);
      result.text += ` ${result.fu}符${result.han}飜`;

      if (base > 2000) {
        if (result.han >= 13) {
          base = 8000;
          result.name = "数え役満";
        } else if (result.han >= 11) {
          base = 6000;
          result.name = "三倍満";
        } else if (result.han >= 8) {
          base = 4000;
          result.name = "倍満";
        } else if (result.han >= 6) {
          base = 3000;
          result.name = "跳満";
        } else {
          base = 2000;
          result.name = "満貫";
        }
      }
    }

    result.text += `${result.name ? " " : ""}${result.name}`;

    if (this.isTsumo) {
      result.oya = [ceil100(base * 2), ceil100(base * 2), ceil100(base * 2)];
      result.ko = [ceil100(base * 2), ceil100(base), ceil100(base)];
    } else {
      result.oya = [ceil100(base * 6)];
      result.ko = [ceil100(base * 4)];
    }

    result.ten = sumPayments(this.isOya ? result.oya : result.ko);
    result.text += ` ${result.ten}点`;

    if (this.isTsumo) {
      result.text += "(";
      if (this.isOya) {
        result.text += `${result.oya[0]}all`;
      } else {
        result.text += `${result.ko[0]},${result.ko[1]}`;
      }
      result.text += ")";
    }
  };
}

function ceil100(value: number): number {
  return Math.ceil(value / 100) * 100;
}

function sumPayments(payments: readonly number[]): number {
  return payments.reduce((total, payment) => total + payment, 0);
}

function getRuleWarnings(rules: RiichiAdapterRuleOptions): string[] {
  const warnings: string[] = [];

  if (rules.kiriageMangan) {
    warnings.push("riichi 不支持切上满贯配置，adapter 暂未补齐");
  }

  if (!rules.kazoeYakuman) {
    warnings.push("riichi 不支持关闭累计役满，adapter 暂未补齐");
  }

  if (rules.doubleWindPairFu !== 4) {
    warnings.push("riichi 不支持双风雀头符数配置，adapter 暂未补齐");
  }

  return warnings;
}

function shouldUseUraDora(handInput: HandInput): boolean {
  return (
    handInput.conditions.enableUraDora &&
    (handInput.conditions.riichi || handInput.conditions.doubleRiichi)
  );
}

function getDoraFromIndicatorForRound(indicator: Tile, roundInput: RoundInput): Tile {
  if (roundInput.playerCount === 3 && indicator === "1m") {
    return "9m";
  }

  if (roundInput.playerCount === 3 && indicator === "9m") {
    return "1m";
  }

  return getDoraFromIndicator(indicator);
}

function conditionsToRiichiExtra(handInput: HandInput, roundInput: RoundInput): string {
  const conditions = handInput.conditions;
  const flags: string[] = [];

  if (conditions.tenhou || conditions.chiihou) {
    flags.push("t");
  }

  if (conditions.doubleRiichi) {
    flags.push("w");
  } else if (conditions.riichi) {
    flags.push("r");
  }

  if (conditions.ippatsu) {
    flags.push("i");
  }

  if (conditions.haitei || conditions.houtei) {
    flags.push("h");
  }

  if (conditions.rinshan || conditions.chankan) {
    flags.push("k");
  }

  if (roundInput.winType === "ron" && !conditions.houtei && conditions.haitei) {
    flags.push("h");
  }

  return flags.join("");
}

function roundToRiichiWind(roundInput: RoundInput): string {
  return `${SEAT_TO_RIICHI_WIND[roundInput.roundWind]}${winnerSeatWindToRiichi(roundInput)}`;
}

function winnerSeatWindToRiichi(roundInput: RoundInput): string {
  if (roundInput.playerCount === 3) {
    return SEAT_TO_RIICHI_WIND[roundInput.winner];
  }

  const dealerIndex = TURN_ORDER.indexOf(roundInput.dealer);
  const winnerIndex = TURN_ORDER.indexOf(roundInput.winner);
  const relativeIndex = (winnerIndex - dealerIndex + TURN_ORDER.length) % TURN_ORDER.length;
  const relativeSeat = SEATS[relativeIndex];

  return SEAT_TO_RIICHI_WIND[relativeSeat];
}

function meldToRiichiGroup(meld: Meld): string {
  if (meld.type === "ankan") {
    return tilesToRiichiGroup(meld.tiles.slice(0, 2));
  }

  return tilesToRiichiGroup(meld.tiles);
}

function tilesToRiichiGroup(tiles: readonly Tile[]): string {
  const sorted = [...tiles].sort(compareTiles);
  const grouped: Partial<Record<NumberSuit | "z", string[]>> = {
    m: [],
    p: [],
    s: [],
    z: []
  };

  for (const tile of sorted) {
    const code = tileToRiichi(tile);
    const suit = code[1] as NumberSuit | "z";
    grouped[suit] = [...(grouped[suit] ?? []), code[0]];
  }

  return (["m", "p", "s", "z"] as const)
    .map((suit) => {
      const ranks = grouped[suit] ?? [];

      return ranks.length > 0 ? `${ranks.join("")}${suit}` : "";
    })
    .join("");
}

function tileToRiichi(tile: Tile | BaseTile): string {
  const normalized = normalizeRedTile(tile);

  if (tile === "red5m") {
    return "0m";
  }

  if (tile === "red5p") {
    return "0p";
  }

  if (tile === "red5s") {
    return "0s";
  }

  if (/^[1-9][mps]$/.test(normalized)) {
    return normalized;
  }

  const honorMap: Record<BaseTile, string> = {
    east: "1z",
    south: "2z",
    west: "3z",
    north: "4z",
    white: "5z",
    green: "6z",
    red: "7z",
    "1m": "1m",
    "2m": "2m",
    "3m": "3m",
    "4m": "4m",
    "5m": "5m",
    "6m": "6m",
    "7m": "7m",
    "8m": "8m",
    "9m": "9m",
    "1p": "1p",
    "2p": "2p",
    "3p": "3p",
    "4p": "4p",
    "5p": "5p",
    "6p": "6p",
    "7p": "7p",
    "8p": "8p",
    "9p": "9p",
    "1s": "1s",
    "2s": "2s",
    "3s": "3s",
    "4s": "4s",
    "5s": "5s",
    "6s": "6s",
    "7s": "7s",
    "8s": "8s",
    "9s": "9s"
  };

  return honorMap[normalized];
}

function splitYakuAndDora(source: Record<string, string>): { yaku: NamedHan[]; dora: NamedHan[] } {
  const yaku: NamedHan[] = [];
  const dora: NamedHan[] = [];

  for (const [name, value] of Object.entries(source)) {
    const item = {
      name: translateYakuName(name),
      han: parseHan(value)
    };

    if (name.includes("ドラ")) {
      dora.push(item);
    } else {
      yaku.push(item);
    }
  }

  return { yaku, dora };
}

function translateYakuName(name: string): string {
  return YAKU_NAME_ZH[name] ?? name;
}

function parseHan(value: string): number {
  const match = value.match(/\d+/);

  return match ? Number(match[0]) : 0;
}

function mapLimit(name: string): LimitHand | undefined {
  const mapping: Record<string, LimitHand> = {
    満貫: "mangan",
    跳満: "haneman",
    倍満: "baiman",
    三倍満: "sanbaiman",
    役満: "yakuman"
  };

  if (name.endsWith("役満")) {
    return "yakuman";
  }

  return mapping[name];
}

function calculateBasePoints(result: RiichiResult): number {
  if (result.yakuman > 0) {
    return 8000 * result.yakuman;
  }

  const limit = mapLimit(result.name);

  if (limit === "mangan") {
    return 2000;
  }

  if (limit === "haneman") {
    return 3000;
  }

  if (limit === "baiman") {
    return 4000;
  }

  if (limit === "sanbaiman") {
    return 6000;
  }

  if (limit === "yakuman") {
    return 8000;
  }

  return result.fu * 2 ** (result.han + 2);
}

function applyNukiDora(
  result: RiichiResult,
  nukiDoraCount: number | undefined,
  roundInput: RoundInput
): RiichiResult {
  const count = normalizeNukiDoraCount(nukiDoraCount);

  if (roundInput.playerCount !== 3 || count === 0 || result.yakuman > 0) {
    return result;
  }

  const adjustedHan = result.han + count;
  const base = calculateLimitedBasePoints(result.fu, adjustedHan);
  const isTsumo = result.oya.length > 1 || result.ko.length > 1;
  const name = createLimitName(base, adjustedHan);

  return {
    ...result,
    yaku: {
      ...result.yaku,
      抜きドラ: `${count}飜`
    },
    han: adjustedHan,
    name,
    ten: roundInput.winner === roundInput.dealer ? ceil100(base * 6) : ceil100(base * 4),
    oya: isTsumo
      ? [ceil100(base * 2), ceil100(base * 2), ceil100(base * 2)]
      : [ceil100(base * 6), 0, 0],
    ko: isTsumo ? [ceil100(base * 2), ceil100(base), ceil100(base)] : [ceil100(base * 4), 0, 0]
  };
}

function normalizeNukiDoraCount(count: number | undefined): number {
  return Math.min(Math.max(Math.trunc(count ?? 0), 0), 4);
}

function calculateLimitedBasePoints(fu: number, han: number): number {
  const base = fu * 2 ** (han + 2);

  if (base <= 2000) {
    return base;
  }

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

  return 2000;
}

function createLimitName(base: number, han: number): string {
  if (base < 2000) {
    return "";
  }

  if (han >= 13) {
    return "数え役満";
  }

  if (han >= 11) {
    return "三倍満";
  }

  if (han >= 8) {
    return "倍満";
  }

  if (han >= 6) {
    return "跳満";
  }

  return "満貫";
}

function createHandPayments(result: RiichiResult, roundInput: RoundInput): Payment[] {
  const activeSeats = getActiveSeats(roundInput.playerCount);

  if (roundInput.winType === "ron") {
    if (!roundInput.discarder) {
      return [];
    }

    return [
      {
        from: roundInput.discarder,
        to: roundInput.winner,
        points: result.ten,
        reason: "hand"
      }
    ];
  }

  if (roundInput.winner === roundInput.dealer) {
    const allPayment = result.oya[0] ?? 0;

    return activeSeats
      .filter((seat) => seat !== roundInput.winner)
      .map((seat) => ({
        from: seat,
        to: roundInput.winner,
        points: allPayment,
        reason: "hand"
      }));
  }

  const dealerPayment = result.ko[0] ?? 0;
  const childPayment = result.ko[1] ?? 0;

  return activeSeats
    .filter((seat) => seat !== roundInput.winner)
    .map((seat) => ({
      from: seat,
      to: roundInput.winner,
      points: seat === roundInput.dealer ? dealerPayment : childPayment,
      reason: "hand"
    }));
}

function createLiabilityAdjustedHandPayments(
  result: RiichiResult,
  roundInput: RoundInput,
  handInput: HandInput
): Payment[] {
  const payments = createHandPayments(result, roundInput);
  const liabilitySeat = handInput.liabilitySeat;
  const liabilityYakuman = countLiabilityYakuman(result);

  if (
    !liabilitySeat ||
    liabilitySeat === roundInput.winner ||
    result.yakuman <= 0 ||
    liabilityYakuman <= 0
  ) {
    return payments;
  }

  const normalYakuman = Math.max(0, result.yakuman - liabilityYakuman);
  const normalPayments = normalYakuman > 0 ? createYakumanPayments(normalYakuman, roundInput) : [];
  const liabilityBasePayments = createYakumanPayments(liabilityYakuman, roundInput);
  let liabilityPayments: Payment[];

  if (roundInput.winType === "tsumo") {
    const total = liabilityBasePayments.reduce((sum, payment) => sum + payment.points, 0);
    liabilityPayments = [
      {
        from: liabilitySeat,
        to: roundInput.winner,
        points: total,
        reason: "hand"
      }
    ];

    return aggregatePayments([...normalPayments, ...liabilityPayments]);
  }

  if (!roundInput.discarder || liabilitySeat === roundInput.discarder) {
    return aggregatePayments([...normalPayments, ...liabilityBasePayments]);
  }

  const ronPayment = liabilityBasePayments.find((payment) => payment.reason === "hand");

  if (!ronPayment) {
    return aggregatePayments([...normalPayments, ...liabilityBasePayments]);
  }

  const splitPayment = ceil100(ronPayment.points / 2);

  liabilityPayments = [
    {
      from: roundInput.discarder,
      to: roundInput.winner,
      points: splitPayment,
      reason: "hand"
    },
    {
      from: liabilitySeat,
      to: roundInput.winner,
      points: splitPayment,
      reason: "hand"
    }
  ];

  return aggregatePayments([...normalPayments, ...liabilityPayments]);
}

function countLiabilityYakuman(result: RiichiResult): number {
  return Object.entries(result.yaku)
    .filter(([name]) =>
      ["大三元", "大四喜", "四槓子"].some((yakumanName) => name.includes(yakumanName))
    )
    .reduce((total, [, value]) => total + parseYakumanCount(value), 0);
}

function parseYakumanCount(value: string): number {
  const match = value.match(/\d+/);

  return match ? Number(match[0]) : 1;
}

function createYakumanPayments(yakumanCount: number, roundInput: RoundInput): Payment[] {
  const activeSeats = getActiveSeats(roundInput.playerCount);
  const base = 8000 * yakumanCount;

  if (roundInput.winType === "ron") {
    if (!roundInput.discarder) {
      return [];
    }

    return [
      {
        from: roundInput.discarder,
        to: roundInput.winner,
        points: roundInput.winner === roundInput.dealer ? ceil100(base * 6) : ceil100(base * 4),
        reason: "hand"
      }
    ];
  }

  if (roundInput.winner === roundInput.dealer) {
    const allPayment = ceil100(base * 2);

    return activeSeats
      .filter((seat) => seat !== roundInput.winner)
      .map((seat) => ({
        from: seat,
        to: roundInput.winner,
        points: allPayment,
        reason: "hand" as const
      }));
  }

  const dealerPayment = ceil100(base * 2);
  const childPayment = ceil100(base);

  return activeSeats
    .filter((seat) => seat !== roundInput.winner)
    .map((seat) => ({
      from: seat,
      to: roundInput.winner,
      points: seat === roundInput.dealer ? dealerPayment : childPayment,
      reason: "hand" as const
    }));
}

function aggregatePayments(payments: readonly Payment[]): Payment[] {
  const grouped = new Map<string, Payment>();

  for (const payment of payments) {
    const key = `${payment.from}:${payment.to}:${payment.reason}`;
    const existing = grouped.get(key);

    grouped.set(key, {
      ...payment,
      points: (existing?.points ?? 0) + payment.points
    });
  }

  return [...grouped.values()];
}

function createInvalidResult(errors: string[]): ScoringResult {
  const zeroDelta = SEATS.reduce<Record<Seat, number>>(
    (acc, seat) => ({
      ...acc,
      [seat]: 0
    }),
    {} as Record<Seat, number>
  );

  return {
    valid: false,
    errors,
    warnings: [],
    yaku: [],
    dora: [],
    han: 0,
    fuDetails: [],
    basePoints: 0,
    payments: [],
    pointDelta: zeroDelta
  };
}
