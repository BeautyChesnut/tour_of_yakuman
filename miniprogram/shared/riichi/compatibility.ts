import Riichi from "riichi";

export interface RiichiExpectedResult {
  isAgari: boolean;
  han?: number;
  fu?: number;
  ten?: number;
  yakuman?: number;
  yakuIncludes?: string[];
}

export interface RiichiCompatibilityCase {
  name: string;
  input: string;
  expected: RiichiExpectedResult;
  configure?: "disableKuitan" | "disableWyakuman";
}

export interface RiichiCompatibilityResult {
  name: string;
  input: string;
  passed: boolean;
  failures: string[];
  actual: Pick<
    Riichi.Result,
    "isAgari" | "yakuman" | "yaku" | "han" | "fu" | "ten" | "name" | "text"
  >;
}

export interface RiichiCompatibilityReport {
  allPassed: boolean;
  results: RiichiCompatibilityResult[];
}

export const RIICHI_COMPATIBILITY_CASES: RiichiCompatibilityCase[] = [
  {
    name: "README 自摸",
    input: "112233456789m11s",
    expected: {
      isAgari: true,
      han: 4,
      fu: 30,
      ten: 7900,
      yakuman: 0,
      yakuIncludes: ["一気通貫", "一盃口", "門前清自摸和"]
    }
  },
  {
    name: "七对子",
    input: "112244m557799p33s",
    expected: {
      isAgari: true,
      han: 3,
      fu: 25,
      ten: 3200,
      yakuman: 0,
      yakuIncludes: ["七対子", "門前清自摸和"]
    }
  },
  {
    name: "国士无双十三面",
    input: "19m19p19s1234567z1m",
    expected: {
      isAgari: true,
      ten: 64000,
      yakuman: 2,
      yakuIncludes: ["国士無双十三面待ち"]
    }
  },
  {
    name: "食断关闭后无役",
    input: "234m22p+345p+456s+678s",
    configure: "disableKuitan",
    expected: {
      isAgari: true,
      han: 0,
      fu: 0,
      ten: 0,
      yakuman: 0
    }
  },
  {
    name: "立直一发宝牌赤宝",
    input: "123456789m11s055p+d5p+ri",
    expected: {
      isAgari: true,
      han: 9,
      fu: 30,
      ten: 16000,
      yakuman: 0,
      yakuIncludes: ["立直", "一発", "ドラ", "赤ドラ"]
    }
  }
];

export function runRiichiCase(testCase: RiichiCompatibilityCase): RiichiCompatibilityResult {
  const riichi = new Riichi(testCase.input);

  if (testCase.configure === "disableKuitan") {
    riichi.disableKuitan();
  }

  if (testCase.configure === "disableWyakuman") {
    riichi.disableWyakuman();
  }

  riichi.disableHairi();

  const result = riichi.calc();
  const failures = compareResult(result, testCase.expected);

  return {
    name: testCase.name,
    input: testCase.input,
    passed: failures.length === 0,
    failures,
    actual: {
      isAgari: result.isAgari,
      yakuman: result.yakuman,
      yaku: result.yaku,
      han: result.han,
      fu: result.fu,
      ten: result.ten,
      name: result.name,
      text: result.text
    }
  };
}

export function runRiichiCompatibilityReport(
  cases: RiichiCompatibilityCase[] = RIICHI_COMPATIBILITY_CASES
): RiichiCompatibilityReport {
  const results = cases.map(runRiichiCase);

  return {
    allPassed: results.every((result) => result.passed),
    results
  };
}

function compareResult(result: Riichi.Result, expected: RiichiExpectedResult): string[] {
  const failures: string[] = [];

  compareField(failures, "isAgari", result.isAgari, expected.isAgari);
  compareOptionalField(failures, "han", result.han, expected.han);
  compareOptionalField(failures, "fu", result.fu, expected.fu);
  compareOptionalField(failures, "ten", result.ten, expected.ten);
  compareOptionalField(failures, "yakuman", result.yakuman, expected.yakuman);

  for (const yakuName of expected.yakuIncludes ?? []) {
    if (!Object.prototype.hasOwnProperty.call(result.yaku, yakuName)) {
      failures.push(`缺少役种：${yakuName}`);
    }
  }

  return failures;
}

function compareField<T>(failures: string[], name: string, actual: T, expected: T): void {
  if (actual !== expected) {
    failures.push(`${name} 期望 ${String(expected)}，实际 ${String(actual)}`);
  }
}

function compareOptionalField<T>(
  failures: string[],
  name: string,
  actual: T,
  expected: T | undefined
): void {
  if (expected !== undefined) {
    compareField(failures, name, actual, expected);
  }
}
