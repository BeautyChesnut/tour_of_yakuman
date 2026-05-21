import { isNumberTile, normalizeRedTile, validateTileCounts } from "../tiles/index";
import type { BaseTile, NumberSuit, Tile } from "../tiles/index";
import type { HandInput, Meld, ValidationResult } from "./types";

export function validateHandInput(input: HandInput): ValidationResult {
  const errors: string[] = [];

  if (!input.winningTile) {
    errors.push("需要选择和牌张");
  }

  const handTiles = [
    ...input.concealedTiles,
    ...(input.winningTile ? [input.winningTile] : []),
    ...input.melds.flatMap((meld) => meld.tiles)
  ];
  const countValidation = validateTileCounts(handTiles);
  errors.push(...countValidation.errors);

  if (input.conditions.riichi || input.conditions.doubleRiichi) {
    const doraCount = input.doraIndicators.length + input.kanDoraIndicators.length;
    const uraDoraCount = input.uraDoraIndicators.length;

    if (doraCount !== uraDoraCount) {
      errors.push("立直时宝牌和里宝牌指示牌数量需要一致");
    }
  }

  for (const meld of input.melds) {
    errors.push(...validateMeld(meld).errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateMeld(meld: Meld): ValidationResult {
  switch (meld.type) {
    case "chi":
      return validateChi(meld.tiles);
    case "pon":
      return validateSameTileMeld(meld.tiles, 3, "碰面子必须由三张相同牌组成");
    case "minkan":
      return validateSameTileMeld(meld.tiles, 4, "明杠面子必须由四张相同牌组成");
    case "ankan":
      return validateSameTileMeld(meld.tiles, 4, "暗杠面子必须由四张相同牌组成");
    case "kakan":
      return validateSameTileMeld(meld.tiles, 4, "加杠面子必须由四张相同牌组成");
  }
}

function validateChi(tiles: Tile[]): ValidationResult {
  const normalized = tiles.map(normalizeRedTile);

  if (normalized.length !== 3 || normalized.some((tile) => !isNumberTile(tile))) {
    return invalid("吃面子必须是同花色连续三张数牌");
  }

  const suits = normalized.map((tile) => tile[1] as NumberSuit);
  const ranks = normalized.map((tile) => Number(tile[0])).sort((a, b) => a - b);

  if (new Set(suits).size !== 1) {
    return invalid("吃面子必须是同花色连续三张数牌");
  }

  if (ranks[1] !== ranks[0] + 1 || ranks[2] !== ranks[1] + 1) {
    return invalid("吃面子必须是同花色连续三张数牌");
  }

  return valid();
}

function validateSameTileMeld(
  tiles: Tile[],
  expectedLength: number,
  message: string
): ValidationResult {
  const normalized = tiles.map(normalizeRedTile);

  if (normalized.length !== expectedLength || new Set<BaseTile>(normalized).size !== 1) {
    return invalid(message);
  }

  return valid();
}

function valid(): ValidationResult {
  return {
    valid: true,
    errors: []
  };
}

function invalid(message: string): ValidationResult {
  return {
    valid: false,
    errors: [message]
  };
}
