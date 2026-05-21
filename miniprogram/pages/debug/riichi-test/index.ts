import { runRiichiCompatibilityReport } from "../../../shared/riichi/compatibility";

Page({
  data: {
    allPassed: false,
    results: [] as ReturnType<typeof runRiichiCompatibilityReport>["results"]
  },

  onLoad() {
    const report = runRiichiCompatibilityReport();
    this.setData(report);
  }
});
