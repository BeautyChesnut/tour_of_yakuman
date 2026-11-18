import { SEATS, getActiveSeats } from "../../shared/domain/round/index";
import type { PlayerCount, PlayerPoints, Seat } from "../../shared/domain/round/index";
import type { ThemeId } from "../../shared/domain/theme/index";
import {
  analyzeAvoidLast,
  analyzeDrawSituation,
  analyzePointSituation,
  analyzePointTarget,
  analyzeRiichiCost,
  analyzeRoundStage,
  createScoreRecommendations,
  createRefreshedOnlineSituationSnapshot,
  getSituationTieBreakOrder,
  rankSituationSeats,
  SITUATION_ANALYSIS_SNAPSHOT_STORAGE_KEY
} from "../../shared/domain/situation-analysis/index";
import {
  createOnlineRoomErrorView,
  createOnlineRoomService
} from "../../shared/services/online-room/index";
import type {
  AvoidLastAnalysis,
  LastPlaceRisk,
  PointTargetAnalysis,
  ScoreRecommendation,
  SituationAnalysisSnapshot,
  TsumoRequirement
} from "../../shared/domain/situation-analysis/index";

interface TargetAnalysisView {
  targetRank: 1 | 2 | 3;
  tabLabel: string;
  achieved: boolean;
  statusText: string;
  pressureText: string;
  ronScenarios: SituationScenarioView[];
  tsumoScenario: SituationScenarioView | null;
  strategyLines: string[];
}

interface AvoidLastView {
  currentlyLast: boolean;
  lastRank: 3 | 4;
  statusText: string;
  pressureText: string;
  riskScenarios: SituationScenarioView[];
  strategyLines: string[];
}

interface SituationScenarioView {
  id: string;
  title: string;
  description: string;
  resultRank: number;
  resultRankText: string;
  resultRows: SituationResultRow[];
  scoreRecommendations: ScoreRecommendationView[];
}

interface ScoreRecommendationView {
  id: string;
  label: string;
  toneClass: string;
  toneText: string;
  scoreText: string;
  paymentText: string;
}

interface SituationResultRow {
  seat: Seat;
  name: string;
  pointsText: string;
  rankText: string;
  isCurrentPlayer: boolean;
}

interface PerspectiveOption {
  seat: Seat;
  label: string;
  selected: boolean;
}

interface RoundContextView {
  stageLabel: string;
  stageDetail: string;
  dealerText: string;
  tieBreakText: string;
}

interface RiichiCostView {
  available: boolean;
  title: string;
  detail: string;
  warning: boolean;
  resultRows: SituationResultRow[];
}

interface DrawAnalysisView {
  title: string;
  detail: string;
  continuationText: string;
  resultRows: SituationResultRow[];
}

interface SituationAnalysisPageData {
  snapshot: SituationAnalysisSnapshot | null;
  available: boolean;
  currentRankText: string;
  metaText: string;
  emptyText: string;
  tabs: Array<{ key: string; label: string }>;
  activeTabIndex: number;
  activeTarget: TargetAnalysisView | null;
  targetViews: TargetAnalysisView[];
  avoidLast: AvoidLastView | null;
  activeScenario: SituationScenarioView | null;
  themeId: ThemeId;
  tabLayoutClass: string;
  perspectiveLayoutClass: string;
  perspectiveOptions: PerspectiveOption[];
  freshnessText: string;
  freshnessClass: string;
  canRefresh: boolean;
  refreshing: boolean;
  roundContext: RoundContextView | null;
  riichiCost: RiichiCostView | null;
  drawTenpaiSeats: Seat[];
  drawTenpaiOptions: PerspectiveOption[];
  drawAnalysis: DrawAnalysisView | null;
}

const ALL_TARGET_RANKS = [1, 2, 3] as const;
const SEAT_LABELS: Record<Seat, string> = {
  east: "东",
  south: "南",
  west: "西",
  north: "北"
};
const onlineRoomService = createOnlineRoomService();

Page<SituationAnalysisPageData, WechatMiniprogram.IAnyObject>({
  data: {
    snapshot: null,
    available: false,
    currentRankText: "",
    metaText: "",
    emptyText: "局势数据已失效，请返回算点桌面后重新进入。",
    tabs: [
      ...ALL_TARGET_RANKS.map((targetRank) => ({
        key: `rank-${targetRank}`,
        label: `升至第 ${targetRank} 位`
      })),
      { key: "avoid-last", label: "跌四风险" }
    ],
    activeTabIndex: 0,
    activeTarget: null,
    targetViews: [],
    avoidLast: null,
    activeScenario: null,
    themeId: "classic",
    tabLayoutClass: "target-tabs-four",
    perspectiveLayoutClass: "perspective-options-four",
    perspectiveOptions: [],
    freshnessText: "",
    freshnessClass: "",
    canRefresh: false,
    refreshing: false,
    roundContext: null,
    riichiCost: null,
    drawTenpaiSeats: [],
    drawTenpaiOptions: [],
    drawAnalysis: null
  },

  onLoad() {
    const snapshot = wx.getStorageSync(SITUATION_ANALYSIS_SNAPSHOT_STORAGE_KEY) as
      | SituationAnalysisSnapshot
      | undefined;

    if (!isValidSnapshot(snapshot)) {
      return;
    }

    const themeId = normalizeThemeId(snapshot.themeId);

    this.setData({
      snapshot,
      ...createAnalysisPagePatch(snapshot),
      themeId,
      ...createFreshnessPatch(snapshot)
    });
    applyNavigationTheme(themeId);

    if (snapshot.source?.mode === "online") {
      void this.refreshOnlineSnapshot();
    }
  },

  async refreshOnlineSnapshot() {
    const snapshot = this.data.snapshot;

    if (snapshot?.source?.mode !== "online" || this.data.refreshing) {
      return;
    }

    this.setData({
      refreshing: true,
      freshnessText: "正在同步在线房间最新数据...",
      freshnessClass: "freshness-syncing"
    });

    try {
      const result = await onlineRoomService.joinRoom({ roomCode: snapshot.source.roomCode });
      const nextSnapshot = createRefreshedOnlineSituationSnapshot(
        snapshot,
        result.room,
        result.state,
        Date.now()
      );

      wx.setStorageSync(SITUATION_ANALYSIS_SNAPSHOT_STORAGE_KEY, nextSnapshot);
      this.setData({
        snapshot: nextSnapshot,
        ...createAnalysisPagePatch(nextSnapshot, this.data.drawTenpaiSeats),
        ...createFreshnessPatch(nextSnapshot),
        refreshing: false
      });
    } catch (error) {
      const errorView = createOnlineRoomErrorView(error);

      this.setData({
        refreshing: false,
        canRefresh: true,
        freshnessText: `同步失败，当前为 ${formatSnapshotTime(snapshot.createdAt)} 的缓存数据：${errorView.message}`,
        freshnessClass: "freshness-warning"
      });
    }
  },

  handleRefresh() {
    void this.refreshOnlineSnapshot();
  },

  handlePerspectiveChange(event: WechatMiniprogram.TouchEvent) {
    const seat = event.currentTarget.dataset.seat as Seat | undefined;
    const snapshot = this.data.snapshot;

    if (!snapshot || !seat) {
      return;
    }

    if (!getSnapshotActiveSeats(snapshot).includes(seat) || seat === snapshot.perspectiveSeat) {
      return;
    }

    const nextSnapshot = { ...snapshot, perspectiveSeat: seat };

    this.setData({
      snapshot: nextSnapshot,
      ...createAnalysisPagePatch(nextSnapshot)
    });
  },

  handleDrawTenpaiToggle(event: WechatMiniprogram.TouchEvent) {
    const seat = event.currentTarget.dataset.seat as Seat | undefined;
    const snapshot = this.data.snapshot;

    if (!snapshot || !seat) {
      return;
    }

    const activeSeats = getSnapshotActiveSeats(snapshot);

    if (!activeSeats.includes(seat)) {
      return;
    }

    const nextTenpaiSeats = this.data.drawTenpaiSeats.includes(seat)
      ? this.data.drawTenpaiSeats.filter((selectedSeat) => selectedSeat !== seat)
      : activeSeats.filter(
          (candidateSeat) =>
            candidateSeat === seat || this.data.drawTenpaiSeats.includes(candidateSeat)
        );

    this.setData(createDrawAnalysisPatch(snapshot, nextTenpaiSeats));
  },

  handleTabChange(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.data.tabs[index]) {
      return;
    }

    this.setData({
      activeTabIndex: index,
      activeTarget: index < this.data.targetViews.length ? this.data.targetViews[index] : null,
      activeScenario: null
    });
  },

  handleScenarioOpen(event: WechatMiniprogram.TouchEvent) {
    const scenarioId = String(event.currentTarget.dataset.scenarioId || "");
    const scenarios = [
      ...(this.data.activeTarget?.ronScenarios ?? []),
      ...(this.data.activeTarget?.tsumoScenario ? [this.data.activeTarget.tsumoScenario] : []),
      ...(this.data.avoidLast?.riskScenarios ?? [])
    ];
    const activeScenario = scenarios.find((scenario) => scenario.id === scenarioId);

    if (activeScenario) {
      this.setData({ activeScenario });
    }
  },

  handleScenarioClose() {
    this.setData({ activeScenario: null });
  },

  handleBack() {
    wx.navigateBack();
  }
});

function createAnalysisPagePatch(
  snapshot: SituationAnalysisSnapshot,
  selectedTenpaiSeats?: readonly Seat[]
): Pick<
  SituationAnalysisPageData,
  | "available"
  | "currentRankText"
  | "metaText"
  | "tabs"
  | "activeTabIndex"
  | "activeTarget"
  | "targetViews"
  | "avoidLast"
  | "activeScenario"
  | "tabLayoutClass"
  | "perspectiveLayoutClass"
  | "perspectiveOptions"
  | "roundContext"
  | "riichiCost"
  | "drawTenpaiSeats"
  | "drawTenpaiOptions"
  | "drawAnalysis"
> {
  const playerCount = getSnapshotPlayerCount(snapshot);
  const activeSeats = getSnapshotActiveSeats(snapshot);
  const targetRanks = ALL_TARGET_RANKS.slice(0, playerCount - 1);
  const analysis = analyzePointSituation(snapshot);
  const targetViews = targetRanks.map((targetRank) =>
    createTargetAnalysisView(snapshot, analyzePointTarget(snapshot, targetRank))
  );
  const avoidLastAnalysis = analyzeAvoidLast(snapshot);
  const avoidLast = createAvoidLastView(snapshot, avoidLastAnalysis);
  const tabs = [
    ...targetRanks.map((targetRank) => ({
      key: `rank-${targetRank}`,
      label: `升至第 ${targetRank} 位`
    })),
    ...(avoidLastAnalysis.currentlyLast
      ? []
      : [{ key: "avoid-last", label: `跌${avoidLastAnalysis.lastRank === 3 ? "三" : "四"}风险` }])
  ];
  const firstActionableIndex = targetViews.findIndex((view) => !view.achieved);
  const avoidLastTabIndex = targetViews.length;
  const activeTabIndex =
    firstActionableIndex >= 0
      ? firstActionableIndex
      : avoidLastAnalysis.currentlyLast
        ? 0
        : avoidLastTabIndex;

  return {
    available: true,
    currentRankText: `${getPlayerName(snapshot, snapshot.perspectiveSeat)} · 第 ${analysis.currentRank} 位 · ${formatPoints(analysis.currentPoints)} 点`,
    metaText: `${snapshot.roundLabel} / 东家：${getPlayerName(snapshot, snapshot.dealer)} / 本场 ${snapshot.honba} / 供托 ${snapshot.riichiSticks}`,
    tabs,
    targetViews,
    activeTabIndex,
    activeTarget: activeTabIndex < avoidLastTabIndex ? targetViews[activeTabIndex] : null,
    avoidLast,
    activeScenario: null,
    tabLayoutClass:
      tabs.length === 2
        ? "target-tabs-two"
        : tabs.length === 3
          ? "target-tabs-three"
          : "target-tabs-four",
    perspectiveLayoutClass:
      playerCount === 3 ? "perspective-options-three" : "perspective-options-four",
    perspectiveOptions: activeSeats.map((seat) => ({
      seat,
      label: `${SEAT_LABELS[seat]} · ${getPlayerName(snapshot, seat)}`,
      selected: seat === snapshot.perspectiveSeat
    })),
    roundContext: createRoundContextView(snapshot),
    riichiCost: createRiichiCostView(snapshot),
    ...createDrawAnalysisPatch(snapshot, selectedTenpaiSeats ?? [snapshot.perspectiveSeat])
  };
}

function createRoundContextView(snapshot: SituationAnalysisSnapshot): RoundContextView {
  const analysis = analyzeRoundStage(snapshot);
  const stageText = {
    "first-half": {
      label: "前半场",
      detail: "当前仍有较多局数，点数门槛用于比较路线，不代表必须立即追分。"
    },
    "second-half": {
      label: "后半场",
      detail: "剩余局数正在减少，升位与末位风险门槛的优先级开始提高。"
    },
    "all-last": {
      label: "默认半庄终局",
      detail: `南${getSnapshotPlayerCount(snapshot) === 3 ? "三" : "四"}局通常是半庄最后一局，应优先按最终顺位目标比较点数路线。`
    },
    extension: {
      label: "延长局",
      detail: "当前已进入西场或北场，终局条件请以现场采用的规则为准。"
    }
  }[analysis.stage];

  return {
    stageLabel: `${snapshot.roundLabel} · ${stageText.label}`,
    stageDetail: `${stageText.detail} 实际终局仍以现场规则为准。`,
    dealerText: analysis.isDealer
      ? "当前视角为庄家，和牌或听牌流局可连庄。"
      : `当前庄家为${getPlayerName(snapshot, snapshot.dealer)}，庄家听牌流局将连庄。`,
    tieBreakText: `同点顺位按${getSituationTieBreakOrder(getSnapshotPlayerCount(snapshot))
      .map((seat) => SEAT_LABELS[seat])
      .join(" → ")}确定。`
  };
}

function createRiichiCostView(snapshot: SituationAnalysisSnapshot): RiichiCostView {
  const analysis = analyzeRiichiCost(snapshot);

  if (!analysis.canDeclare) {
    return {
      available: false,
      title: "当前无法支付立直棒",
      detail: `当前仅有 ${formatPoints(analysis.pointsBefore)} 点，少于立直所需的 1,000 点。`,
      warning: true,
      resultRows: []
    };
  }

  const rankText = analysis.rankChanged
    ? `即时顺位由第 ${analysis.rankBefore} 位变为第 ${analysis.rankAfterDeclaration} 位`
    : `即时顺位保持第 ${analysis.rankBefore} 位`;

  return {
    available: true,
    title: `宣言后 ${formatPoints(analysis.pointsAfterDeclaration)} 点 · 第 ${analysis.rankAfterDeclaration} 位`,
    detail: `支付 1,000 点后，${rankText}；场上供托变为 ${analysis.riichiSticksAfter} 根。`,
    warning: analysis.rankAfterDeclaration > analysis.rankBefore,
    resultRows: createResultRows(snapshot, analysis.playerPointsAfter)
  };
}

function createDrawAnalysisPatch(
  snapshot: SituationAnalysisSnapshot,
  tenpaiSeats: readonly Seat[]
): Pick<SituationAnalysisPageData, "drawTenpaiSeats" | "drawTenpaiOptions" | "drawAnalysis"> {
  const activeSeats = getSnapshotActiveSeats(snapshot);
  const normalizedTenpaiSeats = activeSeats.filter((seat) => tenpaiSeats.includes(seat));
  const analysis = analyzeDrawSituation(snapshot, normalizedTenpaiSeats);
  const perspectiveIsTenpai = normalizedTenpaiSeats.includes(snapshot.perspectiveSeat);

  return {
    drawTenpaiSeats: normalizedTenpaiSeats,
    drawTenpaiOptions: activeSeats.map((seat) => ({
      seat,
      label: `${SEAT_LABELS[seat]} · ${getPlayerName(snapshot, seat)}`,
      selected: normalizedTenpaiSeats.includes(seat)
    })),
    drawAnalysis: {
      title: `流局后第 ${analysis.perspectiveRankAfter} 位 · ${formatPoints(analysis.pointsAfter[snapshot.perspectiveSeat])} 点`,
      detail: `${getPlayerName(snapshot, snapshot.perspectiveSeat)}按“${perspectiveIsTenpai ? "听牌" : "未听"}”计算；供托保留 ${analysis.riichiSticksAfter} 根。`,
      continuationText: analysis.dealerContinues
        ? `庄家听牌，连庄并进入 ${analysis.nextHonba} 本场。`
        : `庄家未听，通常轮庄；下一局为 ${analysis.nextHonba} 本场。`,
      resultRows: createResultRows(snapshot, analysis.pointsAfter)
    }
  };
}

function createTargetAnalysisView(
  snapshot: SituationAnalysisSnapshot,
  analysis: PointTargetAnalysis
): TargetAnalysisView {
  if (analysis.achieved) {
    return {
      targetRank: analysis.targetRank,
      tabLabel: `升至第 ${analysis.targetRank} 位`,
      achieved: true,
      statusText: `当前已达到第 ${analysis.targetRank} 位目标`,
      pressureText: `你目前位列第 ${analysis.currentRank}，无需额外得点即可满足该目标。`,
      ronScenarios: [],
      tsumoScenario: null,
      strategyLines: ["优先控制放铳风险，并根据终局目标决定是否继续争取更高顺位。"]
    };
  }

  const rankedSeats = createRankedSeats(snapshot);
  const targetSeat = rankedSeats[analysis.targetRank - 1];
  const gap = Math.max(
    0,
    snapshot.playerPoints[targetSeat] - snapshot.playerPoints[snapshot.perspectiveSeat]
  );
  const ronScenarios = [...analysis.ronRequirements]
    .sort((left, right) => left.handPoints - right.handPoints)
    .map((requirement) =>
      createScenarioView(snapshot, {
        id: `rank-${analysis.targetRank}-ron-${requirement.discarder}`,
        title: `荣和${getPlayerName(snapshot, requirement.discarder)} · ${formatPoints(requirement.handPoints)} 点`,
        description: `可达成第 ${analysis.targetRank} 位目标${createBetterRankNote(requirement.finalRank, analysis.targetRank)}`,
        resultRank: requirement.finalRank,
        pointsAfter: requirement.pointsAfter,
        minimumHandPoints: requirement.handPoints,
        isDealer: snapshot.perspectiveSeat === snapshot.dealer,
        winType: "ron"
      })
    );
  const tsumoScenario = analysis.tsumoRequirement
    ? createScenarioView(snapshot, {
        id: `rank-${analysis.targetRank}-tsumo`,
        title: `自摸 · 合计 ${formatPoints(analysis.tsumoRequirement.handPoints)} 点`,
        description: `${createTsumoPaymentText(snapshot, analysis.tsumoRequirement)}，可达成第 ${analysis.targetRank} 位目标${createBetterRankNote(analysis.tsumoRequirement.finalRank, analysis.targetRank)}`,
        resultRank: analysis.tsumoRequirement.finalRank,
        pointsAfter: analysis.tsumoRequirement.pointsAfter,
        minimumHandPoints: analysis.tsumoRequirement.handPoints,
        isDealer: snapshot.perspectiveSeat === snapshot.dealer,
        winType: "tsumo"
      })
    : null;
  const shortestRon = [...analysis.ronRequirements].sort(
    (left, right) => left.handPoints - right.handPoints
  )[0];
  const strategyLines: string[] = [];

  if (shortestRon) {
    strategyLines.push(
      `达到第 ${analysis.targetRank} 位的最短直击路线：荣和${getPlayerName(snapshot, shortestRon.discarder)} ${formatPoints(shortestRon.handPoints)} 点。`
    );
  }
  const directTarget = analysis.ronRequirements.find(
    (requirement) => requirement.discarder === targetSeat
  );
  if (directTarget && directTarget.discarder !== shortestRon?.discarder) {
    strategyLines.push(
      `直接打击目标位${getPlayerName(snapshot, targetSeat)}时，需要 ${formatPoints(directTarget.handPoints)} 点。`
    );
  }
  strategyLines.push("结果仅按点数推演，实际决策仍需结合手牌、巡目与牌河。");

  return {
    targetRank: analysis.targetRank,
    tabLabel: `升至第 ${analysis.targetRank} 位`,
    achieved: false,
    statusText: `目标：升至第 ${analysis.targetRank} 位`,
    pressureText: `当前第 ${analysis.currentRank} 位，距离目标位${getPlayerName(snapshot, targetSeat)}相差 ${formatPoints(gap)} 点。`,
    ronScenarios,
    tsumoScenario,
    strategyLines
  };
}

function createTsumoPaymentText(
  snapshot: SituationAnalysisSnapshot,
  requirement: TsumoRequirement
): string {
  const childPayerLabel = getSnapshotPlayerCount(snapshot) === 3 ? "子家" : "子家各";
  const payments =
    requirement.dealerPayment === requirement.childPayment
      ? `每家 ${formatPoints(requirement.childPayment)}`
      : `亲家 ${formatPoints(requirement.dealerPayment)} / ${childPayerLabel} ${formatPoints(requirement.childPayment)}`;

  return `支付：${payments}`;
}

function createBetterRankNote(finalRank: number, targetRank: 1 | 2 | 3): string {
  return finalRank < targetRank ? "（实际名次可能更高）" : "";
}

function createAvoidLastView(
  snapshot: SituationAnalysisSnapshot,
  analysis: AvoidLastAnalysis
): AvoidLastView {
  if (analysis.currentlyLast) {
    return {
      currentlyLast: true,
      lastRank: analysis.lastRank,
      statusText: `当前处于第 ${analysis.lastRank} 位`,
      pressureText: `请切换到“升至第 ${analysis.lastRank - 1} 位”查看脱离末位所需的最低条件。`,
      riskScenarios: [],
      strategyLines: [`优先关注最低升${analysis.lastRank - 1}路线，并避免继续向领先玩家输送点数。`]
    };
  }

  const riskScenarios = analysis.risks.map((risk) => createRiskScenario(snapshot, risk));
  const shortestRisk = analysis.risks[0];
  const strategyLines = shortestRisk
    ? [
        `当前最危险的单次放铳对象是${getPlayerName(snapshot, shortestRisk.winner)}，其最低跌${analysis.lastRank === 3 ? "三" : "四"}风险线为 ${formatPoints(shortestRisk.handPoints)} 点。`,
        "风险线只用于点数判断，不代表该玩家实际已经听牌。"
      ]
    : [`当前常规合法打点范围内，没有单次放铳会立即跌至第 ${analysis.lastRank} 位。`];

  return {
    currentlyLast: false,
    lastRank: analysis.lastRank,
    statusText: `当前第 ${analysis.currentRank} 位 · 跌${analysis.lastRank === 3 ? "三" : "四"}风险`,
    pressureText: `以下为向不同玩家放铳后，导致你跌至第 ${analysis.lastRank} 位的最低手牌打点。`,
    riskScenarios,
    strategyLines
  };
}

function createRiskScenario(
  snapshot: SituationAnalysisSnapshot,
  risk: LastPlaceRisk
): SituationScenarioView {
  return createScenarioView(snapshot, {
    id: `avoid-last-${risk.winner}`,
    title: `放铳给${getPlayerName(snapshot, risk.winner)} · ${formatPoints(risk.handPoints)} 点`,
    description: `达到该风险线后，你将跌至第 ${risk.finalRank} 位`,
    resultRank: risk.finalRank,
    pointsAfter: risk.pointsAfter,
    minimumHandPoints: risk.handPoints,
    isDealer: risk.winner === snapshot.dealer,
    winType: "ron"
  });
}

function createScenarioView(
  snapshot: SituationAnalysisSnapshot,
  scenario: {
    id: string;
    title: string;
    description: string;
    resultRank: number;
    pointsAfter: PlayerPoints;
    minimumHandPoints: number;
    isDealer: boolean;
    winType: "ron" | "tsumo";
  }
): SituationScenarioView {
  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    resultRank: scenario.resultRank,
    resultRankText: `结算后你为第 ${scenario.resultRank} 位`,
    resultRows: createResultRows(snapshot, scenario.pointsAfter),
    scoreRecommendations: createScoreRecommendations({
      minimumHandPoints: scenario.minimumHandPoints,
      isDealer: scenario.isDealer,
      winType: scenario.winType,
      playerCount: getSnapshotPlayerCount(snapshot)
    }).map((recommendation) =>
      createScoreRecommendationView(recommendation, getSnapshotPlayerCount(snapshot))
    )
  };
}

function createScoreRecommendationView(
  recommendation: ScoreRecommendation,
  playerCount: PlayerCount
): ScoreRecommendationView {
  const toneMap: Record<ScoreRecommendation["tone"], { className: string; text: string }> = {
    minimum: { className: "recommendation-minimum", text: "最低条件" },
    alternative: { className: "recommendation-alternative", text: "同点替代" },
    stable: { className: "recommendation-stable", text: "稳妥条件" }
  };
  const tone = toneMap[recommendation.tone];
  const childPayerLabel = playerCount === 3 ? "子家" : "子家各";
  const paymentText =
    recommendation.dealerPayment === undefined || recommendation.childPayment === undefined
      ? ""
      : recommendation.dealerPayment === recommendation.childPayment
        ? `每家 ${formatPoints(recommendation.childPayment)}`
        : `亲家 ${formatPoints(recommendation.dealerPayment)} / ${childPayerLabel} ${formatPoints(recommendation.childPayment)}`;

  return {
    id: recommendation.id,
    label: recommendation.label,
    toneClass: tone.className,
    toneText: tone.text,
    scoreText: `合计 ${formatPoints(recommendation.handPoints)} 点`,
    paymentText
  };
}

function createResultRows(
  snapshot: SituationAnalysisSnapshot,
  pointsAfter: PlayerPoints
): SituationResultRow[] {
  return createRankedSeatsFromPoints(pointsAfter, getSnapshotPlayerCount(snapshot)).map(
    (seat, index) => ({
      seat,
      name: getPlayerName(snapshot, seat),
      pointsText: `${formatPoints(pointsAfter[seat])} 点`,
      rankText: `第 ${index + 1} 位`,
      isCurrentPlayer: seat === snapshot.perspectiveSeat
    })
  );
}

function createRankedSeats(snapshot: SituationAnalysisSnapshot): Seat[] {
  return createRankedSeatsFromPoints(snapshot.playerPoints, getSnapshotPlayerCount(snapshot));
}

function createRankedSeatsFromPoints(
  playerPoints: PlayerPoints,
  playerCount: PlayerCount = 4
): Seat[] {
  return rankSituationSeats(playerPoints, playerCount);
}

function getSnapshotPlayerCount(snapshot: SituationAnalysisSnapshot): PlayerCount {
  return snapshot.playerCount === 3 ? 3 : 4;
}

function getSnapshotActiveSeats(snapshot: SituationAnalysisSnapshot): Seat[] {
  return getActiveSeats(getSnapshotPlayerCount(snapshot));
}

function getPlayerName(snapshot: SituationAnalysisSnapshot, seat: Seat): string {
  return snapshot.playerNames[seat]?.trim() || seat;
}

function formatPoints(points: number): string {
  return points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function createFreshnessPatch(
  snapshot: SituationAnalysisSnapshot
): Pick<SituationAnalysisPageData, "freshnessText" | "freshnessClass" | "canRefresh"> {
  if (snapshot.source?.mode !== "online") {
    return {
      freshnessText: `本地数据 · ${formatSnapshotTime(snapshot.createdAt)}`,
      freshnessClass: "freshness-local",
      canRefresh: false
    };
  }

  return {
    freshnessText: `已同步 · ${formatSnapshotTime(snapshot.createdAt)} · 房间版本 ${snapshot.source.roomVersion}`,
    freshnessClass: "freshness-fresh",
    canRefresh: true
  };
}

function formatSnapshotTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "未知时间";
  }

  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeThemeId(themeId: ThemeId | undefined): ThemeId {
  return themeId === "benji" || themeId === "maple" ? themeId : "classic";
}

function applyNavigationTheme(themeId: ThemeId): void {
  const backgroundColor =
    themeId === "maple" ? "#542A24" : themeId === "benji" ? "#2F7255" : "#184C3A";

  wx.setNavigationBarColor({
    frontColor: "#ffffff",
    backgroundColor
  });
}

function isValidSnapshot(
  snapshot: SituationAnalysisSnapshot | undefined
): snapshot is SituationAnalysisSnapshot {
  return Boolean(
    snapshot &&
    typeof snapshot.createdAt === "number" &&
    (snapshot.playerCount === undefined ||
      snapshot.playerCount === 3 ||
      snapshot.playerCount === 4) &&
    SEATS.includes(snapshot.roundWind) &&
    Number.isInteger(snapshot.roundIndex) &&
    snapshot.roundIndex >= 0 &&
    getActiveSeats(snapshot.playerCount === 3 ? 3 : 4).includes(snapshot.perspectiveSeat) &&
    getActiveSeats(snapshot.playerCount === 3 ? 3 : 4).includes(snapshot.dealer) &&
    SEATS.every(
      (seat) =>
        typeof snapshot.playerPoints?.[seat] === "number" &&
        typeof snapshot.playerNames?.[seat] === "string"
    )
  );
}
