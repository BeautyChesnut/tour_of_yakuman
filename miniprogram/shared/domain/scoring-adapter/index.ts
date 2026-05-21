import Riichi from "riichi";
import { validateHandInput } from "../hand/index";
import type { HandInput, Meld } from "../hand/index";
import type { RoundInput, Seat } from "../round/index";
import { SEATS } from "../round/index";
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
  赤ドラ: "赤宝牌"
};

type MutableRiichiResult = Omit<Riichi.Result, "oya" | "ko"> & {
  oya: number[];
  ko: number[];
};

type EvalFreeRiichi = Riichi & {
  tmpResult: MutableRiichiResult;
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

  const riichi = new Riichi(toRiichiInput(handInput, roundInput));
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

  const { yaku, dora } = splitYakuAndDora(result.yaku);
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
    han: result.han,
    fu: result.fu || undefined,
    fuDetails: result.fu ? [{ name: "总符数（riichi）", fu: result.fu }] : [],
    limit: mapLimit(result.name),
    basePoints: calculateBasePoints(result),
    payments: createHandPayments(result, roundInput),
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
    ...handInput.doraIndicators.map(getDoraFromIndicator),
    ...handInput.kanDoraIndicators.map(getDoraFromIndicator),
    ...(shouldUseUraDora(handInput) ? handInput.uraDoraIndicators.map(getDoraFromIndicator) : [])
  ];

  if (doraTiles.length > 0) {
    parts.push(`d${tilesToRiichiGroup(doraTiles)}`);
  }

  parts.push(`${conditionsToRiichiExtra(handInput, roundInput)}${roundToRiichiWind(roundInput)}`);

  return parts.join("+");
}

function applyRules(riichi: Riichi, rules: RiichiAdapterRuleOptions): void {
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

function applyEvalFreeCalcTen(riichi: Riichi): void {
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
  const dealerIndex = SEATS.indexOf(roundInput.dealer);
  const winnerIndex = SEATS.indexOf(roundInput.winner);
  const relativeIndex = (winnerIndex - dealerIndex + SEATS.length) % SEATS.length;
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

function calculateBasePoints(result: Riichi.Result): number {
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

function createHandPayments(result: Riichi.Result, roundInput: RoundInput): Payment[] {
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

    return SEATS.filter((seat) => seat !== roundInput.winner).map((seat) => ({
      from: seat,
      to: roundInput.winner,
      points: allPayment,
      reason: "hand"
    }));
  }

  const dealerPayment = result.ko[0] ?? 0;
  const childPayment = result.ko[1] ?? 0;

  return SEATS.filter((seat) => seat !== roundInput.winner).map((seat) => ({
    from: seat,
    to: roundInput.winner,
    points: seat === roundInput.dealer ? dealerPayment : childPayment,
    reason: "hand"
  }));
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
