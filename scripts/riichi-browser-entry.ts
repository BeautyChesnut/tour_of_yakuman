import { runRiichiCompatibilityReport } from "../miniprogram/shared/riichi/compatibility";

const report = runRiichiCompatibilityReport();

if (!report.allPassed) {
  const details = report.results
    .filter((result) => !result.passed)
    .map((result) => `${result.name}: ${result.failures.join("; ")}`)
    .join("\n");

  throw new Error(`riichi browser bundle compatibility failed:\n${details}`);
}

console.log(`riichi browser bundle compatibility passed: ${report.results.length} cases`);
