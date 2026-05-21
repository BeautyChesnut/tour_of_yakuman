import { describe, expect, it } from "vitest";
import {
  RIICHI_COMPATIBILITY_CASES,
  runRiichiCompatibilityReport
} from "../miniprogram/shared/riichi/compatibility";

describe("riichi 兼容验证样例", () => {
  it("固定样例应返回预期番符和点数", () => {
    const report = runRiichiCompatibilityReport();

    expect(report.results).toHaveLength(RIICHI_COMPATIBILITY_CASES.length);
    expect(report.allPassed, formatFailures(report)).toBe(true);
  });
});

function formatFailures(report: ReturnType<typeof runRiichiCompatibilityReport>): string {
  return report.results
    .filter((result) => !result.passed)
    .map((result) => `${result.name}: ${result.failures.join("; ")}`)
    .join("\n");
}
