import { validateMeld } from "../../shared/domain/hand/index";
import type { HandInput, Meld, MeldType, WinConditions } from "../../shared/domain/hand/index";
import type {
  DrawRoundInput,
  GameVariant,
  MultipleRonRoundInput,
  PlayerCount,
  PlayerPoints,
  RoundInput,
  RoundWind,
  Seat,
  WinType
} from "../../shared/domain/round/index";
import type {
  OnlineRoom,
  OnlineRoomWorkbenchMode,
  RoomMemberRef,
  RoomScoringState,
  RoomSeatMap
} from "../../shared/domain/online-room/index";
import type { LocalScoringDraftLike } from "../../shared/services/online-room/index";
import {
  DEFAULT_INITIAL_POINTS,
  SEATS,
  TURN_ORDER,
  getActiveSeats,
  getActiveTurnOrder
} from "../../shared/domain/round/index";
import type { FuDetail, NamedHan, ScoringResult } from "../../shared/domain/scoring/index";
import { calculateWithRiichi } from "../../shared/domain/scoring-adapter/index";
import {
  createDefaultPlayerPoints,
  createDrawSettlementRecord,
  createMultipleRonSettlementRecord,
  createSettlementRecord,
  replaceRecentSettlement
} from "../../shared/domain/settlement/index";
import type { MultipleRonWinRecord, SettlementRecord } from "../../shared/domain/settlement/index";
import {
  compareTiles,
  getTileDisplayName,
  isNumberTile,
  isRedTile,
  normalizeRedTile
} from "../../shared/domain/tiles/index";
import type { BaseTile, NumberSuit, Tile } from "../../shared/domain/tiles/index";
import {
  analyzePointSituation,
  canShowSituationAnalysis,
  resolveSituationAnalysisPerspectiveSeat,
  SITUATION_ANALYSIS_SNAPSHOT_STORAGE_KEY
} from "../../shared/domain/situation-analysis/index";
import type {
  PointSituationAnalysis,
  RonRequirement,
  TsumoRequirement
} from "../../shared/domain/situation-analysis/index";
import {
  createMembershipAccess,
  FREE_MEMBERSHIP_ACCESS
} from "../../shared/domain/membership/index";
import type { MembershipAccess } from "../../shared/domain/membership/index";
import {
  createExampleShareMetadata,
  createHomeShareMetadata,
  createResultShareMetadata,
  createRoomShareMetadata,
  getCuratedScoringExample,
  parseGrowthLaunchContext,
  reportGrowthEvent
} from "../../shared/domain/growth/index";
import type {
  CuratedScoringExample,
  GrowthEventFields,
  GrowthEventName,
  ShareMetadata
} from "../../shared/domain/growth/index";
import {
  canAccessTheme,
  DEFAULT_THEME_ID,
  getThemeById,
  listThemesForMode
} from "../../shared/domain/theme/index";
import type { ThemeId } from "../../shared/domain/theme/index";
import { createOnlineAuthService } from "../../shared/services/online-auth/index";
import type { OnlineAuthSession } from "../../shared/services/online-auth/index";
import { getOnlineBackendErrorCode } from "../../shared/services/online-backend/index";
import { createLocalDraftStorage } from "../../shared/services/local-draft/index";
import type { LocalDraftSnapshot } from "../../shared/services/local-draft/index";
import {
  createDraftPatchFromRoomSharedScoringData,
  createRoomSharedScoringDataFromDraft,
  createOnlineRoomErrorView,
  createOnlineRoomService,
  normalizeRoomCode,
  parseOnlineRoomInviteOptions
} from "../../shared/services/online-room/index";
import type { OnlineRoomServiceResult } from "../../shared/services/online-room/index";

type RoundEventType = "ron" | "tsumo" | "draw";
type EditingPanel =
  | "none"
  | "round-event"
  | "scene-yaku"
  | "hand"
  | "dora"
  | "meld"
  | "players"
  | "theme"
  | "rules"
  | "records"
  | "online-room"
  | "join-room"
  | "confirm";
type TileArea =
  | "concealedTiles"
  | "winningTile"
  | "meldDraftTiles"
  | "doraIndicators"
  | "kanDoraIndicators"
  | "uraDoraIndicators";
type DoraArea = "doraIndicators" | "uraDoraIndicators";
type DirectTileArea = "concealedTiles" | "winningTile" | "meldDraftTiles" | DoraArea;
type KanMeldType = "minkan" | "ankan" | "kakan";
type TileSlotValue = Tile | "";
type SeatSlotValue = Seat | "";
type ConditionKey = Exclude<keyof WinConditions, "menzenTsumo">;
type TimingConditionKey = "" | "haitei" | "houtei" | "rinshan" | "chankan";
type OpeningYakumanKey = "" | "tenhou" | "chiihou";
type MeldDraftTileMap = Record<MeldType, TileSlotValue[]>;
type MeldDraftKanTypeMap = Record<MeldType, Array<KanMeldType | "">>;
type PlayerNames = Record<Seat, string>;
type ScoringPageInstance = WechatMiniprogram.Page.Instance<
  ScoringPageData,
  WechatMiniprogram.IAnyObject
> & {
  refreshMembershipAccess(): Promise<void>;
  refreshOnlineRoomPresence(silent?: boolean): Promise<void>;
  restoreActiveOnlineRoom(): Promise<void>;
};

interface MeldGroupRef {
  type: MeldType;
  groupIndex: number;
}

interface TileFillDetail {
  area: TileArea;
  index: number;
  tile: Tile;
}

interface TileClearDetail {
  area: TileArea;
  index: number;
}

interface TileFocusDetail {
  area: TileArea;
}

interface DoraSlotView {
  index: number;
  tile: TileSlotValue;
  label: string;
  active: boolean;
}

interface HandSlotView {
  area: "concealedTiles";
  index: number;
  tile: TileSlotValue;
  label: string;
  active: boolean;
}

interface WinningTileCandidateView {
  tile: Tile;
  label: string;
  selected: boolean;
}

interface DoraTileOption {
  tile: Tile;
  label: string;
  disabled?: boolean;
  suggested?: boolean;
}

interface DoraTileRow {
  key: string;
  label: string;
  tiles: DoraTileOption[];
}

interface Option<T extends string = string> {
  key: T;
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

interface MeldRow {
  id: string;
  text: string;
}

interface MeldSlotView {
  groupIndex: number;
  slotIndex: number;
  flatIndex: number;
  tile: TileSlotValue;
  label: string;
  active: boolean;
}

interface MeldGroupView {
  index: number;
  title: string;
  slots: MeldSlotView[];
  visibleSlotCount: number;
  inferredText: string;
  needsKanType: boolean;
  kanType: KanMeldType | "";
}

interface PointRow {
  seat: Seat;
  label: string;
  points: number;
}

interface RoleChoiceView {
  seat: Seat;
  label: string;
  selected: boolean;
  disabled: boolean;
  mark: string;
}

interface TableSeatView {
  seat: Seat;
  label: string;
  directionLabel: string;
  avatarSrc: string;
  avatarClass: string;
  avatarSpriteClass: string;
  avatarMode: "widthFix" | "aspectFit" | "aspectFill";
  points: number;
  rankText: string;
  nickname: string;
  onlineStatusText: string;
  statusBadges: Array<{ type: string; label: string }>;
  className: string;
}

interface OnlineRoomSeatOption {
  seat: Seat;
  label: string;
  selected: boolean;
}

interface OnlineRoomMemberRow {
  seat: Seat;
  directionLabel: string;
  openId: string;
  displayName: string;
  avatarUrl: string;
  isOwner: boolean;
  canTransfer: boolean;
}

interface SummaryRow {
  key: EditingPanel;
  title: string;
  value: string;
  iconSrc?: string;
  valueLines?: string[];
  tileSections?: SummaryTileSection[];
  valueTone?: "warning";
}

interface SummaryTileSection {
  id: string;
  label: string;
  tiles: SummaryTileView[];
  emptyText?: string;
}

interface SummaryTileView {
  id: string;
  tile: Tile;
  label: string;
  winning?: boolean;
}

interface SituationAnalysisView {
  visible: boolean;
  available: boolean;
  metaText: string;
  rankingText: string;
  pressureText: string;
  reversalLines: string[];
  strategyLines: string[];
  emptyText: string;
}

interface TenpaiRow {
  seat: Seat;
  label: string;
  checked: boolean;
}

interface RiichiStateOption {
  key: "" | "riichi" | "doubleRiichi";
  label: string;
  checked: boolean;
}

interface RadioOption<T extends string = string> {
  key: T;
  label: string;
  checked: boolean;
}

interface RecordRow {
  id: string;
  title: string;
  detail: string;
}

interface ThemeOptionView {
  id: ThemeId;
  name: string;
  description: string;
  previewSrc: string;
  accessText: string;
  selected: boolean;
  locked: boolean;
}

interface RoundState {
  roundWindIndex: number;
  roundIndex: number;
  honba: number;
  riichiSticks: number;
  dealerIndex: number;
}

interface ResultView {
  limitText: string;
  han: number;
  fu: number | string;
  basePoints: number;
  yakuLines: NamedHan[];
  doraLines: NamedHan[];
  fuLines: FuDetail[];
  scoreRows: Array<{
    seat: Seat;
    label: string;
    directionLabel: string;
    deltaText: string;
    deltaClass: string;
    after: number;
    rankText: string;
  }>;
  childResultGroups: Array<{
    winner: Seat;
    label: string;
    directionLabel: string;
    limitText: string;
    han: number;
    fu: number | string;
    paymentText: string;
    yakuText: string;
  }>;
  warnings: string[];
}

interface DraftSnapshot {
  gameVariant: GameVariant;
  roundWindIndex: number;
  roundIndex: number;
  roundLabel: string;
  honba: number;
  riichiSticks: number;
  dealerIndex: number;
  winnerIndex: number;
  discarderIndex: number;
  dealer: Seat;
  winner: SeatSlotValue;
  ronWinnerSeats: Record<Seat, boolean>;
  discarder: Seat | "";
  eventType: RoundEventType;
  eventTypeIndex: number;
  winType: WinType;
  playerNames: PlayerNames;
  playerPoints: PlayerPoints;
  pointRows: PointRow[];
  playerNameRows: Array<{
    seat: Seat;
    directionLabel: string;
    label: string;
    name: string;
    placeholder: string;
  }>;
  riichiSeats: Record<Seat, boolean>;
  tenpaiSeats: Record<Seat, boolean>;
  concealedTiles: TileSlotValue[];
  winningTile: TileSlotValue[];
  meldDraftTiles: TileSlotValue[];
  meldDraftTilesByType: MeldDraftTileMap;
  doraIndicators: TileSlotValue[];
  kanDoraIndicators: TileSlotValue[];
  uraDoraIndicators: TileSlotValue[];
  nukiDoraCount: number;
  liabilitySeat: SeatSlotValue;
  activeDoraIndex: number;
  selectedMeldTypeIndex: number;
  meldDraftHint: string;
  meldKanTypes: Array<KanMeldType | "">;
  meldKanTypesByType: MeldDraftKanTypeMap;
  melds: Meld[];
  meldRows: MeldRow[];
  conditionOptions: Array<Option<ConditionKey>>;
  activeTileArea: TileArea;
  multiRonProgress: MultiRonProgress | null;
}

interface ScoringPageData extends DraftSnapshot {
  showModeHome: boolean;
  growthSource: string;
  growthExampleId: string;
  gameVariantText: string;
  editing: boolean;
  editingPanel: EditingPanel;
  roundWindLabels: string[];
  roundIndexLabels: string[];
  seatLabels: string[];
  eventTypeOptions: Array<Option<RoundEventType>>;
  meldTypeOptions: Array<Option<MeldType>>;
  errors: string[];
  resultView: ResultView;
  settlementRecords: SettlementRecord[];
  recentRecord?: SettlementRecord;
  recentDraft?: DraftSnapshot;
  tableSeats: TableSeatView[];
  activeThemeId: ThemeId;
  activeThemeName: string;
  themeOptions: ThemeOptionView[];
  membershipAccess: MembershipAccess;
  winnerChoiceRows: RoleChoiceView[];
  discarderChoiceRows: RoleChoiceView[];
  liabilityChoiceRows: RoleChoiceView[];
  tenpaiRows: TenpaiRow[];
  riichiStateOptions: RiichiStateOption[];
  timingConditionOptions: Array<RadioOption<TimingConditionKey>>;
  openingYakumanOptions: Array<RadioOption<OpeningYakumanKey>>;
  bonusConditionOptions: Array<Option<ConditionKey>>;
  handSlotViews: HandSlotView[];
  winningTileCandidates: WinningTileCandidateView[];
  handTileRows: DoraTileRow[];
  meldGroupViews: MeldGroupView[];
  kanTypeOptions: Array<Option<KanMeldType>>;
  doraSlotViews: DoraSlotView[];
  uraDoraSlotViews: DoraSlotView[];
  doraTileRows: DoraTileRow[];
  summaryRows: SummaryRow[];
  situationAnalysis: SituationAnalysisView;
  tableCenterLines: string[];
  recordRows: RecordRow[];
  confirmationLines: string[];
  confirmationResultLines: string[];
  multiRonStatusText: string;
  multiRonCurrentLabel: string;
  multiRonConfirmText: string;
  onlineRoomCodeInput: string;
  onlineRoomLoading: boolean;
  onlineRoomStatusText: string;
  onlineRoomCodeText: string;
  onlineRoomId: string;
  onlineRoomVersion: number;
  onlineRoomRoleText: string;
  onlineRoomOwnerOpenId: string;
  onlineRoomMemberRows: OnlineRoomMemberRow[];
  canShuffleOnlineSeats: boolean;
  onlineRoomSelectedSeat: Seat;
  onlineRoomSeatOptions: OnlineRoomSeatOption[];
  onlineRoomSeatMap: Partial<RoomSeatMap>;
  onlineProfileName: string;
  onlineProfileAvatarUrl: string;
  workbenchMode: OnlineRoomWorkbenchMode;
}

interface MultiRonProgress {
  discarder: Seat;
  winners: Seat[];
  currentWinner: Seat;
  completedWins: MultipleRonWinRecord[];
}

const DEFAULT_PLAYER_NAMES: PlayerNames = {
  east: "玩家1",
  south: "玩家2",
  west: "玩家3",
  north: "玩家4"
};
const PLAYER_NAMES_STORAGE_KEY = "tourOfYakumanPlayerNames";
const ONLINE_PROFILE_STORAGE_KEY = "tourOfYakumanOnlineProfile";
const ACTIVE_ONLINE_ROOM_STORAGE_KEY = "tourOfYakumanActiveOnlineRoom";
const PREFERRED_THEME_STORAGE_KEY = "tourOfYakumanPreferredTheme";
const THEME_PRESENTATION: Record<ThemeId, Pick<ThemeOptionView, "description" | "previewSrc">> = {
  classic: {
    description: "专注清晰",
    previewSrc: "/assets/table/table-felt.svg"
  },
  benji: {
    description: "轻松明快",
    previewSrc: "/assets/benji/benji-zhuobu.jpg"
  },
  maple: {
    description: "沉稳雅致",
    previewSrc: "/assets/maple/maple-table.jpg"
  }
};
const SEAT_DIRECTION_LABELS: Record<Seat, string> = {
  east: "东",
  south: "南",
  west: "西",
  north: "北"
};
const PLAYER_AVATAR_SOURCES: Record<Seat, string> = {
  east: "/assets/players/player3.jpg",
  south: "/assets/players/player4.jpg",
  west: "/assets/players/player1.jpg",
  north: "/assets/players/player2.jpg"
};
const BENJI_PLAYER_AVATAR_SOURCES: Record<Seat, string> = {
  east: "/assets/benji/benji-player3-transparent.png",
  south: "/assets/benji/benji-player4-transparent.png",
  west: "/assets/benji/benji-player2-transparent.png",
  north: "/assets/benji/benji-player1-transparent.png"
};
const MAPLE_PLAYER_SPRITE_CLASSES: Record<Seat, string> = {
  east: "maple-avatar-east",
  south: "maple-avatar-south",
  west: "maple-avatar-west",
  north: "maple-avatar-north"
};
const BENJI_SUMMARY_ICON_SOURCES: Partial<Record<EditingPanel, string>> = {
  "round-event": "/assets/benji/benji-benjushijian.jpg",
  "scene-yaku": "/assets/benji/benji-changmianfanxing.jpg",
  dora: "/assets/benji/benji-baopai.jpg",
  meld: "/assets/benji/benji-mingpai.jpg",
  hand: "/assets/benji/benji-shoupai.jpg"
};

const ROUND_WIND_VALUES: RoundWind[] = ["east", "south", "west", "north"];
const ROUND_WIND_LABELS = ["东场", "南场", "西场", "北场"];
const ROUND_INDEX_LABELS = ["一局", "二局", "三局", "四局"];
const GAME_VARIANT_LABELS: Record<GameVariant, string> = {
  yonma: "四人麻将",
  sanma: "三人麻将"
};
const GAME_VARIANT_DEFAULT_POINTS: Record<GameVariant, number> = {
  yonma: 25000,
  sanma: 35000
};
const EVENT_TYPE_OPTIONS: Array<Option<RoundEventType>> = [
  { key: "ron", label: "荣和" },
  { key: "tsumo", label: "自摸" },
  { key: "draw", label: "流局" }
];
const MELD_TYPE_OPTIONS: Array<Option<MeldType>> = [
  { key: "chi", label: "吃" },
  { key: "pon", label: "碰" },
  { key: "minkan", label: "明杠" },
  { key: "ankan", label: "暗杠" },
  { key: "kakan", label: "加杠" }
];
const KAN_TYPE_OPTIONS: Array<Option<KanMeldType>> = [
  { key: "minkan", label: "明杠" },
  { key: "ankan", label: "暗杠" },
  { key: "kakan", label: "加杠" }
];
const CONDITION_OPTIONS: Array<Option<ConditionKey>> = [
  { key: "riichi", label: "立直" },
  { key: "doubleRiichi", label: "两立直" },
  { key: "ippatsu", label: "一发" },
  { key: "haitei", label: "海底" },
  { key: "houtei", label: "河底" },
  { key: "rinshan", label: "岭上" },
  { key: "chankan", label: "抢杠" },
  { key: "tenhou", label: "天和" },
  { key: "chiihou", label: "地和" },
  { key: "enableUraDora", label: "里宝牌" }
];
const TIMING_CONDITION_OPTIONS: Array<RadioOption<TimingConditionKey>> = [
  { key: "", label: "无", checked: true },
  { key: "haitei", label: "海底", checked: false },
  { key: "houtei", label: "河底", checked: false },
  { key: "rinshan", label: "岭上", checked: false },
  { key: "chankan", label: "抢杠", checked: false }
];
const OPENING_YAKUMAN_OPTIONS: Array<RadioOption<OpeningYakumanKey>> = [
  { key: "", label: "无", checked: true },
  { key: "tenhou", label: "天和", checked: false },
  { key: "chiihou", label: "地和", checked: false }
];
const BONUS_CONDITION_KEYS: ConditionKey[] = ["ippatsu"];
const DORA_TILE_ROWS: DoraTileRow[] = [
  { key: "m", label: "万", tiles: createDoraNumberTiles("m") },
  { key: "s", label: "索", tiles: createDoraNumberTiles("s") },
  { key: "p", label: "筒", tiles: createDoraNumberTiles("p") },
  {
    key: "z",
    label: "字",
    tiles: [
      { tile: "east", label: "东" },
      { tile: "south", label: "南" },
      { tile: "west", label: "西" },
      { tile: "north", label: "北" },
      { tile: "white", label: "白" },
      { tile: "green", label: "发" },
      { tile: "red", label: "中" }
    ]
  }
];
const HAND_TILE_ROWS: DoraTileRow[] = [
  { key: "m", label: "万", tiles: createNumberTilesWithRed("m") },
  { key: "s", label: "索", tiles: createNumberTilesWithRed("s") },
  { key: "p", label: "筒", tiles: createNumberTilesWithRed("p") },
  DORA_TILE_ROWS[3]
];
const WINNING_CANDIDATE_TILES: Tile[] = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "east",
  "south",
  "west",
  "north",
  "white",
  "green",
  "red"
];

const EMPTY_RESULT_VIEW: ResultView = {
  limitText: "-",
  han: 0,
  fu: "-",
  basePoints: 0,
  yakuLines: [],
  doraLines: [],
  fuLines: [],
  scoreRows: [],
  childResultGroups: [],
  warnings: []
};

const onlineAuthService = createOnlineAuthService();
const onlineRoomService = createOnlineRoomService();
const localDraftStorage = createLocalDraftStorage();
let onlineRoomRefreshTimer: ReturnType<typeof setInterval> | undefined;
let onlineRoomRefreshRunning = false;
let onlineRoomRestoreRunning = false;
let roomStateSyncRunning = false;
let pendingRoomStateSyncData: ScoringPageData | undefined;
let workbenchSwipeStart:
  | {
      x: number;
      y: number;
      active: boolean;
      triggered: boolean;
    }
  | undefined;

Page({
  data: createInitialData(),

  onLoad(options: Record<string, string | undefined>) {
    wx.showShareMenu({
      menus: ["shareAppMessage", "shareTimeline"]
    });
    const preferredThemeId = loadPreferredTheme();

    if (preferredThemeId !== this.data.activeThemeId) {
      updateDraft(this, { activeThemeId: preferredThemeId });
    }
    applyScoringNavigationTheme(
      this.data.showModeHome ? DEFAULT_THEME_ID : this.data.activeThemeId
    );
    void this.refreshMembershipAccess();

    const growthContext = parseGrowthLaunchContext(options);
    const example = getCuratedScoringExample(growthContext.exampleId);

    this.setData({
      growthSource: growthContext.source,
      growthExampleId: example?.id ?? ""
    });
    reportPageGrowthEvent(this.data, "growth_open", {
      source: growthContext.source,
      exampleId: example?.id,
      mode: example ? "local" : "home",
      playerCount: example?.gameVariant === "sanma" ? 3 : example ? 4 : undefined
    });

    if (example) {
      openCuratedScoringExample(this, example);
      return;
    }

    const roomCode = parseOnlineRoomInviteOptions(options);
    if (roomCode) {
      this.setData({
        editingPanel: "join-room",
        onlineRoomCodeInput: roomCode,
        onlineRoomStatusText: "已识别邀请房间码，可直接加入"
      });
    } else {
      void this.restoreActiveOnlineRoom();
    }
  },

  onShow() {
    if (!this.data.showModeHome && this.data.workbenchMode !== "local") {
      startOnlineRoomAutoRefresh(this);
      void this.refreshOnlineRoomPresence(true);
      return;
    }

    if (this.data.showModeHome && this.data.editingPanel === "none") {
      void this.restoreActiveOnlineRoom();
    }
  },

  onUnload() {
    stopOnlineRoomAutoRefresh();
  },

  onShareAppMessage(options?: WechatMiniprogram.Page.IShareAppMessageOption) {
    const requestedResult =
      !this.data.editing ||
      (options?.from === "button" && options.target?.dataset.shareContext === "result");
    const metadata = createPageShareMetadata(this.data, requestedResult);

    reportPageGrowthEvent(this.data, "growth_share_open", {
      shareContext: resolveShareContext(this.data, requestedResult)
    });
    return metadata;
  },

  onShareTimeline() {
    const metadata = createPageShareMetadata(this.data, !this.data.editing);

    reportPageGrowthEvent(this.data, "growth_share_open", {
      shareContext: resolveShareContext(this.data, !this.data.editing)
    });
    return {
      title: metadata.title,
      query: metadata.path.split("?")[1] ?? ""
    };
  },

  handleSeatInviteTap() {
    return;
  },

  handleShowOnlineRoom() {
    if (this.data.onlineRoomLoading) {
      return;
    }

    updateDraft(this, {
      editingPanel: "online-room",
      errors: [],
      onlineRoomCodeText: "",
      onlineRoomStatusText: ""
    });
  },

  handleBackToModeHome() {
    stopOnlineRoomAutoRefresh();
    applyScoringNavigationTheme(DEFAULT_THEME_ID);
    this.setData({
      showModeHome: true,
      editingPanel: "none",
      errors: [],
      onlineRoomStatusText: ""
    });
  },

  handleShowJoinRoom() {
    if (this.data.onlineRoomLoading) {
      return;
    }

    updateDraft(this, { editingPanel: "join-room", errors: [] });
  },

  handleEnterLocalMode() {
    wx.showActionSheet({
      itemList: [GAME_VARIANT_LABELS.yonma, GAME_VARIANT_LABELS.sanma],
      success: (result) => {
        this.enterLocalMode(result.tapIndex === 1 ? "sanma" : "yonma");
      }
    });
  },

  enterLocalMode(gameVariant: GameVariant) {
    stopOnlineRoomAutoRefresh();
    applyScoringNavigationTheme(this.data.activeThemeId);

    const savedDraft = localDraftStorage.load(gameVariant);

    reportPageGrowthEvent(this.data, "growth_local_start", {
      mode: "local",
      playerCount: getPlayerCountFromVariant(gameVariant)
    });

    if (savedDraft) {
      applyLocalDraftSnapshot(this, savedDraft);
      return;
    }

    const localPatch = createLocalModePatch(this.data, gameVariant);

    updateDraft(this, {
      ...localPatch,
      showModeHome: false,
      workbenchMode: "local",
      onlineRoomStatusText: "",
      onlineRoomRoleText: "",
      onlineRoomCodeText: ""
    });
  },

  handleShowThemePicker() {
    updateDraft(this, {
      editingPanel: "theme",
      errors: []
    });
  },

  handleThemeSelect(event: WechatMiniprogram.TouchEvent) {
    const themeId = event.currentTarget.dataset.themeId as ThemeId | undefined;

    if (!themeId) {
      return;
    }

    const theme = getThemeById(themeId);
    const mode = this.data.workbenchMode === "local" ? "local" : "online";

    if (!theme.modes.includes(mode)) {
      return;
    }

    if (!canAccessTheme(theme, this.data.membershipAccess.canUseVipThemes)) {
      wx.showToast({ title: "会员专属皮肤", icon: "none" });
      return;
    }

    updateDraft(this, {
      activeThemeId: themeId,
      editingPanel: "none"
    });
    savePreferredTheme(themeId);
    applyScoringNavigationTheme(themeId);
  },

  async refreshMembershipAccess() {
    try {
      const session = await onlineAuthService.getSession();
      const patch = createMembershipPatch(this.data, session);

      updateDraft(this, patch);
      if (!this.data.showModeHome) {
        applyScoringNavigationTheme(patch.activeThemeId);
      }
    } catch {
      const activeTheme = getThemeById(this.data.activeThemeId);
      const activeThemeId = canAccessTheme(activeTheme, false)
        ? this.data.activeThemeId
        : DEFAULT_THEME_ID;

      updateDraft(this, {
        membershipAccess: { ...FREE_MEMBERSHIP_ACCESS },
        activeThemeId
      });
      if (!this.data.showModeHome) {
        applyScoringNavigationTheme(activeThemeId);
      }
    }
  },

  handleOnlineRoomCodeInput(event: WechatMiniprogram.Input) {
    this.setData({
      onlineRoomCodeInput: normalizeRoomCode(String(event.detail.value)),
      onlineRoomStatusText: ""
    });
  },

  handleOnlineProfileNameInput(event: WechatMiniprogram.Input) {
    const name = String(event.detail.value).trim();

    this.setData({
      onlineProfileName: name,
      onlineRoomStatusText: ""
    });
    saveOnlineProfile({
      displayName: name,
      avatarUrl: this.data.onlineProfileAvatarUrl
    });
  },

  handleChooseOnlineAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
    const avatarUrl = event.detail.avatarUrl || "";

    this.setData({
      onlineProfileAvatarUrl: avatarUrl,
      onlineRoomStatusText: ""
    });
    saveOnlineProfile({
      displayName: this.data.onlineProfileName,
      avatarUrl
    });
  },

  handleSeatAvatarError(event: WechatMiniprogram.TouchEvent) {
    const seat = event.currentTarget.dataset.seat as Seat | undefined;

    if (!seat || !SEATS.includes(seat) || !this.data.onlineRoomSeatMap?.[seat]) {
      return;
    }

    this.setData({
      [`onlineRoomSeatMap.${seat}.avatarUrl`]: ""
    } as WechatMiniprogram.IAnyObject);
  },

  async handleCreateOnlineRoom() {
    const displayName = createOnlineDisplayName(
      this.data.onlineProfileName,
      this.data.playerNames.east
    );
    const avatarUrl = await prepareOnlineProfileAvatar(this);

    await this.runOnlineRoomAction(() =>
      onlineRoomService.createRoom({
        seat: "east",
        displayName,
        avatarUrl
      })
    );
  },

  async handleJoinOnlineRoom() {
    const roomCode = normalizeRoomCode(this.data.onlineRoomCodeInput);

    if (roomCode.length !== 6) {
      this.setData({ onlineRoomStatusText: "请输入 6 位房间码" });
      return;
    }

    const avatarUrl = await prepareOnlineProfileAvatar(this);

    await this.runOnlineRoomAction(() =>
      onlineRoomService.joinRoom({
        roomCode,
        displayName: createOnlineDisplayName(this.data.onlineProfileName, "玩家"),
        avatarUrl
      })
    );
  },

  async runOnlineRoomAction(action: () => Promise<OnlineRoomServiceResult>) {
    if (this.data.onlineRoomLoading) {
      return;
    }

    this.setData({
      onlineRoomLoading: true,
      onlineRoomStatusText: "正在连接在线房间..."
    });

    try {
      const session = await onlineAuthService.getSession();
      const result = await action();
      const roomPatch = createOnlineRoomPatch(result, session.openId, "已进入在线房间");

      saveActiveOnlineRoom(result.room);
      applyRoomScoringState(this, result.state, {
        showModeHome: false,
        onlineRoomLoading: false,
        ...createMembershipPatch(this.data, session),
        ...roomPatch
      });
      startOnlineRoomAutoRefresh(this);
    } catch (error) {
      const errorView = createOnlineRoomErrorView(error);

      this.setData({
        onlineRoomLoading: false,
        onlineRoomStatusText: errorView.message
      });
    }
  },

  async handleRefreshOnlineRoom() {
    await this.refreshOnlineRoomPresence(false);
  },

  async refreshOnlineRoomPresence(silent = false) {
    const roomCode = normalizeRoomCode(this.data.onlineRoomCodeInput);

    if (!roomCode) {
      if (!silent) {
        this.setData({ onlineRoomStatusText: "暂无可刷新的在线房间" });
      }
      return;
    }

    if (this.data.onlineRoomLoading || onlineRoomRefreshRunning) {
      return;
    }

    onlineRoomRefreshRunning = true;

    if (!silent) {
      this.setData({
        onlineRoomLoading: true,
        onlineRoomStatusText: "正在刷新房间状态..."
      });
    }

    try {
      const session = await onlineAuthService.getSession();
      const result = await onlineRoomService.joinRoom({
        roomCode,
        displayName: createOnlineDisplayName(this.data.onlineProfileName, "玩家"),
        avatarUrl: createBackendAvatarUrl(this.data.onlineProfileAvatarUrl)
      });
      const nextPatch = createOnlineRoomPatch(
        result,
        session.openId,
        silent ? this.data.onlineRoomStatusText : "已刷新"
      );
      const membershipPatch = createMembershipPatch(this.data, session);
      const nextData = {
        ...this.data,
        onlineRoomLoading: false,
        ...membershipPatch,
        ...nextPatch
      };

      saveActiveOnlineRoom(result.room);
      this.setData({
        onlineRoomLoading: false,
        ...membershipPatch,
        ...nextPatch,
        ...createDerivedPatch(nextData)
      });
    } catch (error) {
      const errorView = createOnlineRoomErrorView(error);

      if (isOnlineRoomGoneError(errorView.message)) {
        clearActiveOnlineRoom();
      }

      if (!silent) {
        this.setData({
          onlineRoomLoading: false,
          onlineRoomStatusText: errorView.message
        });
      }
    } finally {
      onlineRoomRefreshRunning = false;
    }
  },

  async restoreActiveOnlineRoom() {
    const activeRoom = loadActiveOnlineRoom();

    if (!activeRoom || this.data.onlineRoomLoading || onlineRoomRestoreRunning) {
      return;
    }

    onlineRoomRestoreRunning = true;
    this.setData({
      onlineRoomLoading: true,
      onlineRoomCodeInput: activeRoom.roomCode,
      onlineRoomStatusText: "正在恢复在线房间..."
    });

    try {
      const session = await onlineAuthService.getSession();
      const result = await onlineRoomService.joinRoom({
        roomCode: activeRoom.roomCode,
        displayName: createOnlineDisplayName(this.data.onlineProfileName, "玩家"),
        avatarUrl: createBackendAvatarUrl(this.data.onlineProfileAvatarUrl)
      });
      const roomPatch = createOnlineRoomPatch(result, session.openId, "已恢复在线房间");

      saveActiveOnlineRoom(result.room);
      applyRoomScoringState(this, result.state, {
        showModeHome: false,
        onlineRoomLoading: false,
        ...createMembershipPatch(this.data, session),
        ...roomPatch
      });
      startOnlineRoomAutoRefresh(this);
    } catch (error) {
      const errorView = createOnlineRoomErrorView(error);

      if (isOnlineRoomGoneError(errorView.message)) {
        clearActiveOnlineRoom();
      }

      this.setData({
        onlineRoomLoading: false,
        onlineRoomStatusText: errorView.message
      });
    } finally {
      onlineRoomRestoreRunning = false;
    }
  },

  handleLeaveOnlineRoom() {
    const isHost = this.data.workbenchMode === "room-host";

    wx.showModal({
      title: "退出房间",
      content: isHost
        ? "房主退出后，会随机将房主权限转移给房间内其他成员；若房间只剩你一人，则结束房间。"
        : "退出后会离开当前座位，下次进入小程序不会自动回到这个房间。",
      confirmText: "退出",
      confirmColor: "#9f2a2a",
      success: (result) => {
        if (result.confirm) {
          void this.runLeaveOnlineRoom();
        }
      }
    });
  },

  handleWorkbenchTouchStart(event: WechatMiniprogram.TouchEvent) {
    const touch = event.touches[0];

    if (!touch || this.data.workbenchMode === "local" || this.data.editingPanel !== "none") {
      workbenchSwipeStart = undefined;
      return;
    }

    workbenchSwipeStart = {
      x: touch.clientX,
      y: touch.clientY,
      active: touch.clientX <= 28,
      triggered: false
    };
  },

  handleWorkbenchTouchMove(event: WechatMiniprogram.TouchEvent) {
    const touch = event.touches[0];

    if (!touch || !workbenchSwipeStart?.active || workbenchSwipeStart.triggered) {
      return;
    }

    const deltaX = touch.clientX - workbenchSwipeStart.x;
    const deltaY = Math.abs(touch.clientY - workbenchSwipeStart.y);

    if (deltaX >= 88 && deltaY <= 42) {
      workbenchSwipeStart.triggered = true;
      this.handleLeaveOnlineRoom();
    }
  },

  handleWorkbenchTouchEnd() {
    workbenchSwipeStart = undefined;
  },

  handleWorkbenchTouchCancel() {
    workbenchSwipeStart = undefined;
  },

  async runLeaveOnlineRoom() {
    if (this.data.onlineRoomLoading) {
      return;
    }

    const roomId = this.data.onlineRoomId;

    clearActiveOnlineRoom();
    stopOnlineRoomAutoRefresh();

    if (!roomId) {
      this.setData(createLeaveOnlineRoomPatch(this.data));
      return;
    }

    this.setData({
      onlineRoomLoading: true,
      onlineRoomStatusText: "正在退出房间..."
    });

    try {
      await onlineRoomService.leaveRoom({ roomId });
      this.setData(createLeaveOnlineRoomPatch(this.data));
    } catch (error) {
      const errorView = createOnlineRoomErrorView(error);

      this.setData({
        onlineRoomLoading: false,
        onlineRoomStatusText: errorView.message
      });
    }
  },

  handleOpenPanel(event: WechatMiniprogram.TouchEvent) {
    const panel = event.currentTarget.dataset.panel as EditingPanel;

    if (isReadonlyWorkbench(this.data) && isSharedEditingPanel(panel)) {
      showRoomViewerReadonlyToast();
      return;
    }

    const directArea =
      panel === "dora"
        ? "doraIndicators"
        : panel === "hand"
          ? "concealedTiles"
          : panel === "meld"
            ? "meldDraftTiles"
            : this.data.activeTileArea;

    updateDraft(this, {
      editingPanel: panel,
      activeTileArea: directArea,
      activeDoraIndex:
        panel === "dora" || panel === "hand" || panel === "meld" ? 0 : this.data.activeDoraIndex
    });
  },

  handleOpenSituationAnalysis() {
    if (!this.data.situationAnalysis.available) {
      return;
    }

    const playerNames = SEATS.reduce(
      (names, seat) => ({
        ...names,
        [seat]: getSituationPlayerName(this.data, seat)
      }),
      {} as PlayerNames
    );

    wx.setStorageSync(SITUATION_ANALYSIS_SNAPSHOT_STORAGE_KEY, {
      createdAt: Date.now(),
      roundWind: ROUND_WIND_VALUES[this.data.roundWindIndex],
      roundIndex: this.data.roundIndex,
      roundLabel: this.data.roundLabel,
      themeId: this.data.activeThemeId,
      playerNames,
      playerPoints: { ...this.data.playerPoints },
      playerCount: getPlayerCountForData(this.data),
      perspectiveSeat: getSituationPerspectiveSeat(this.data),
      dealer: this.data.dealer,
      honba: this.data.honba,
      riichiSticks: this.data.riichiSticks,
      source:
        this.data.workbenchMode === "local"
          ? { mode: "local" }
          : {
              mode: "online",
              roomId: this.data.onlineRoomId,
              roomCode: this.data.onlineRoomCodeInput,
              roomVersion: this.data.onlineRoomVersion
            }
    });
    wx.navigateTo({ url: "/pages/situation-analysis/index" });
  },

  handleClosePanel() {
    if (this.data.editingPanel === "players") {
      const playerNames = normalizePlayerNames(this.data.playerNames);

      savePlayerNames(playerNames);
      updateDraft(this, {
        playerNames,
        editingPanel: "none",
        errors: []
      });
      return;
    }

    this.setData({ editingPanel: "none", errors: [] });
  },

  handleTileFill(event: WechatMiniprogram.CustomEvent<TileFillDetail>) {
    const { area, index, tile } = event.detail;
    const value = normalizeDirectTileValue(area, tile);
    updateDraft(this, createTileAreaPatch(this.data, area, index, value));
  },

  handleTileClear(event: WechatMiniprogram.CustomEvent<TileClearDetail>) {
    const { area, index } = event.detail;
    updateDraft(this, createTileAreaPatch(this.data, area, index, ""));
  },

  handleTileFocus(event: WechatMiniprogram.CustomEvent<TileFocusDetail>) {
    updateDraft(this, { activeTileArea: event.detail.area });
  },

  handleDoraSlotTap(event: WechatMiniprogram.TouchEvent) {
    updateDraft(this, {
      activeTileArea: event.currentTarget.dataset.area as DirectTileArea,
      activeDoraIndex: Number(event.currentTarget.dataset.index)
    });
  },

  handleHandSlotClearTap(event: WechatMiniprogram.TouchEvent) {
    const area = event.currentTarget.dataset.area as "concealedTiles" | "winningTile";
    const index = Number(event.currentTarget.dataset.index);

    updateDraft(this, createHandTileClearPatch(this.data, area, index));
  },

  handleHandAllClearTap() {
    updateDraft(this, {
      concealedTiles: createSlots(13),
      winningTile: createSlots(1),
      activeTileArea: "concealedTiles",
      activeDoraIndex: 0
    });
  },

  handleWinningCandidateTap(event: WechatMiniprogram.TouchEvent) {
    const tile = event.currentTarget.dataset.tile as Tile;

    updateDraft(this, {
      winningTile: [tile],
      activeTileArea: "concealedTiles",
      activeDoraIndex: 0
    });
  },

  handleDoraSlotClearTap(event: WechatMiniprogram.TouchEvent) {
    const area = event.currentTarget.dataset.area as DoraArea;
    const index = Number(event.currentTarget.dataset.index);

    updateDraft(this, {
      ...createTileAreaPatch(this.data, area, index, ""),
      activeTileArea: area,
      activeDoraIndex: index
    });
  },

  handleDoraAllClearTap() {
    updateDraft(this, {
      doraIndicators: createSlots(4),
      uraDoraIndicators: createSlots(4),
      activeTileArea: "doraIndicators",
      activeDoraIndex: 0
    });
  },

  handleDirectTileTap(event: WechatMiniprogram.TouchEvent) {
    const area = this.data.activeTileArea as DirectTileArea;
    const tile = event.currentTarget.dataset.tile as Tile;
    const disabled =
      event.currentTarget.dataset.disabled === true ||
      event.currentTarget.dataset.disabled === "true";

    if (disabled) {
      return;
    }

    const value = normalizeDirectTileValue(area, tile);

    if (area === "concealedTiles") {
      updateDraft(this, createConcealedTileFillPatch(this.data, this.data.activeDoraIndex, value));
      return;
    }

    if (area === "winningTile") {
      updateDraft(this, {
        ...createTileAreaPatch(this.data, area, 0, value),
        activeDoraIndex: 0
      });
      return;
    }

    if (area === "meldDraftTiles") {
      updateDraft(this, createMeldTileFillPatch(this.data, this.data.activeDoraIndex, value));
      return;
    }

    updateDraft(
      this,
      createSequentialTileFillPatch(this.data, area, this.data.activeDoraIndex, value)
    );
  },

  handleDirectTileClearTap() {
    const area = this.data.activeTileArea as DirectTileArea;

    updateDraft(this, createTileAreaPatch(this.data, area, this.data.activeDoraIndex, ""));
  },

  handleMeldSlotTap(event: WechatMiniprogram.TouchEvent) {
    updateDraft(this, {
      activeTileArea: "meldDraftTiles",
      activeDoraIndex: Number(event.currentTarget.dataset.index)
    });
  },

  handleMeldSlotClearTap(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const meldDraftTiles = this.data.meldDraftTiles.map((tile, tileIndex) =>
      tileIndex === index ? "" : tile
    );
    const meldDraftTilesByType = createMeldDraftTileMapWithActive(this.data, meldDraftTiles);

    updateDraft(this, {
      meldDraftTiles,
      meldDraftTilesByType,
      winningTile: createAutoWinningTilePatch(this.data.concealedTiles, {
        ...this.data,
        meldDraftTiles,
        meldDraftTilesByType
      }),
      activeTileArea: "meldDraftTiles",
      activeDoraIndex: index
    });
  },

  handleMeldAllClearTap() {
    const meldDraftTiles = createSlots(16);
    const meldKanTypes: Array<KanMeldType | ""> = ["", "", "", ""];
    const meldDraftTilesByType = createMeldDraftTileMapWithActive(this.data, meldDraftTiles);
    const meldKanTypesByType = createMeldDraftKanTypeMapWithActive(this.data, meldKanTypes);

    updateDraft(this, {
      meldDraftTiles,
      meldKanTypes,
      meldDraftTilesByType,
      meldKanTypesByType,
      winningTile: createAutoWinningTilePatch(this.data.concealedTiles, {
        ...this.data,
        meldDraftTiles,
        meldKanTypes,
        meldDraftTilesByType,
        meldKanTypesByType
      }),
      activeTileArea: "meldDraftTiles",
      activeDoraIndex: 0
    });
  },

  handleKanTypeTap(event: WechatMiniprogram.TouchEvent) {
    const groupIndex = Number(event.currentTarget.dataset.groupIndex);
    const type = event.currentTarget.dataset.type as KanMeldType;
    const meldKanTypes = this.data.meldKanTypes.map((currentType, index) =>
      index === groupIndex ? type : currentType
    );
    const meldKanTypesByType = createMeldDraftKanTypeMapWithActive(this.data, meldKanTypes);

    updateDraft(this, {
      meldKanTypes,
      meldKanTypesByType,
      winningTile: createAutoWinningTilePatch(this.data.concealedTiles, {
        ...this.data,
        meldKanTypes,
        meldKanTypesByType
      })
    });
  },

  handleRoundWindChange(event: WechatMiniprogram.PickerChange) {
    const roundWindIndex = Number(event.detail.value);
    updateDraft(this, {
      roundWindIndex,
      roundLabel: createRoundLabel(roundWindIndex, this.data.roundIndex)
    });
  },

  handleRoundIndexChange(event: WechatMiniprogram.PickerChange) {
    const roundIndex = Number(event.detail.value);
    updateDraft(this, {
      roundIndex,
      roundLabel: createRoundLabel(this.data.roundWindIndex, roundIndex)
    });
  },

  handleDealerChange(event: WechatMiniprogram.PickerChange) {
    const dealerIndex = Number(event.detail.value);
    const dealer = getSeatByChoiceIndex(this.data, dealerIndex);

    updateDraft(this, {
      dealerIndex: getActiveSeatsForData(this.data).indexOf(dealer),
      dealer
    });
  },

  handleWinnerChange(event: WechatMiniprogram.PickerChange) {
    const winnerIndex = Number(event.detail.value);
    const winner = getSeatByChoiceIndex(this.data, winnerIndex);

    updateDraft(this, {
      winnerIndex: getActiveSeatsForData(this.data).indexOf(winner),
      winner
    });
  },

  handleWinnerRadioChange(event: WechatMiniprogram.RadioGroupChange) {
    const winner = event.detail.value as Seat;
    const ronWinnerSeats =
      this.data.eventType === "ron"
        ? {
            ...this.data.ronWinnerSeats,
            [winner]: true
          }
        : this.data.ronWinnerSeats;
    const discarder =
      this.data.eventType === "ron" && this.data.discarder === winner ? "" : this.data.discarder;

    updateDraft(this, {
      winner,
      winnerIndex: getActiveSeatsForData(this.data).indexOf(winner),
      ronWinnerSeats,
      discarder,
      discarderIndex: discarder
        ? getActiveSeatsForData(this.data).indexOf(discarder)
        : this.data.discarderIndex
    });
  },

  handleWinnerSeatTap(event: WechatMiniprogram.TouchEvent) {
    const winner = event.currentTarget.dataset.seat as Seat;

    if (this.data.eventType === "ron" && this.data.discarder === winner) {
      return;
    }

    if (this.data.eventType === "ron") {
      const activeSeats = getActiveSeatsForData(this.data);
      const selectedCount = selectedSeats(this.data.ronWinnerSeats, activeSeats).length;
      const nextSelected = !this.data.ronWinnerSeats[winner];
      const maxRonWinnerCount = activeSeats.length - 1;

      if (nextSelected && selectedCount >= maxRonWinnerCount) {
        this.setData({ errors: [`荣和最多选择 ${maxRonWinnerCount} 名和牌者`] });
        return;
      }

      const ronWinnerSeats = {
        ...this.data.ronWinnerSeats,
        [winner]: nextSelected
      };
      const winners = selectedSeats(ronWinnerSeats, activeSeats);

      updateDraft(this, {
        ronWinnerSeats,
        winner: winners[0] ?? "",
        winnerIndex: winners[0] ? activeSeats.indexOf(winners[0]) : -1,
        multiRonProgress: null,
        errors: []
      });
      return;
    }

    this.handleWinnerRadioChange({
      detail: { value: winner }
    } as WechatMiniprogram.RadioGroupChange);
  },

  handleDiscarderChange(event: WechatMiniprogram.PickerChange) {
    const discarderIndex = Number(event.detail.value);
    const discarder = getSeatByChoiceIndex(this.data, discarderIndex);

    updateDraft(this, {
      discarderIndex: getActiveSeatsForData(this.data).indexOf(discarder),
      discarder
    });
  },

  handleDiscarderRadioChange(event: WechatMiniprogram.RadioGroupChange) {
    const discarder = event.detail.value as Seat;
    const ronWinnerSeats = {
      ...this.data.ronWinnerSeats,
      [discarder]: false
    };
    const activeSeats = getActiveSeatsForData(this.data);
    const winner =
      this.data.winner === discarder
        ? (selectedSeats(ronWinnerSeats, activeSeats)[0] ?? "")
        : this.data.winner;

    updateDraft(this, {
      winner,
      winnerIndex: winner ? activeSeats.indexOf(winner) : -1,
      ronWinnerSeats,
      discarder,
      discarderIndex: activeSeats.indexOf(discarder),
      multiRonProgress: null
    });
  },

  handleDiscarderSeatTap(event: WechatMiniprogram.TouchEvent) {
    const discarder = event.currentTarget.dataset.seat as Seat;

    if (this.data.ronWinnerSeats[discarder]) {
      return;
    }

    this.handleDiscarderRadioChange({
      detail: { value: discarder }
    } as WechatMiniprogram.RadioGroupChange);
  },

  handleEventTypeTap(event: WechatMiniprogram.TouchEvent) {
    const eventType = event.currentTarget.dataset.type as RoundEventType;

    updateDraft(this, {
      eventType,
      eventTypeIndex: EVENT_TYPE_OPTIONS.findIndex((option) => option.key === eventType),
      winType: eventType === "tsumo" ? "tsumo" : "ron",
      winner: "",
      winnerIndex: -1,
      ronWinnerSeats: createSeatBooleanMap(),
      discarder: "",
      discarderIndex: -1,
      multiRonProgress: null,
      tenpaiSeats: eventType === "draw" ? this.data.tenpaiSeats : createSeatBooleanMap()
    });
  },

  handleNumberInput(event: WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field as "honba" | "riichiSticks" | "nukiDoraCount";
    const value = parseNonNegativeInteger(event.detail.value);

    updateDraft(this, {
      [field]: field === "nukiDoraCount" ? Math.min(value, 4) : value
    } as Partial<ScoringPageData>);
  },

  handlePointInput(event: WechatMiniprogram.Input) {
    const seat = event.currentTarget.dataset.seat as Seat;
    const points = parseNonNegativeInteger(event.detail.value, DEFAULT_INITIAL_POINTS);
    const playerPoints = {
      ...this.data.playerPoints,
      [seat]: points
    };

    updateDraft(this, {
      playerPoints,
      pointRows: createPointRows(
        playerPoints,
        this.data.playerNames,
        getActiveSeatsForData(this.data)
      )
    });
  },

  handleToggleRiichi(event: WechatMiniprogram.TouchEvent) {
    if (isReadonlyWorkbench(this.data)) {
      showRoomViewerReadonlyToast();
      return;
    }

    const seat = event.currentTarget.dataset.seat as Seat;

    if (isEmptyOnlineSeat(this.data, seat)) {
      return;
    }

    const nextRiichi = !this.data.riichiSeats[seat];
    const pointDelta = nextRiichi ? -1000 : 1000;
    const stickDelta = nextRiichi ? 1 : -1;
    const playerPoints = {
      ...this.data.playerPoints,
      [seat]: this.data.playerPoints[seat] + pointDelta
    };
    const riichiSeats = {
      ...this.data.riichiSeats,
      [seat]: nextRiichi
    };

    updateDraft(this, {
      riichiSeats,
      playerPoints,
      pointRows: createPointRows(
        playerPoints,
        this.data.playerNames,
        getActiveSeatsForData(this.data)
      ),
      riichiSticks: Math.max(0, this.data.riichiSticks + stickDelta)
    });
  },

  handleBonusConditionChange(event: WechatMiniprogram.CheckboxGroupChange) {
    const values = new Set(event.detail.value as ConditionKey[]);
    const currentRiichiState = getRiichiState(this.data.conditionOptions);
    const hasOpeningYakuman = getOpeningYakuman(this.data.conditionOptions) !== "";

    updateDraft(this, {
      conditionOptions: CONDITION_OPTIONS.map((option) => ({
        ...option,
        checked: BONUS_CONDITION_KEYS.includes(option.key)
          ? !hasOpeningYakuman && currentRiichiState !== "" && values.has(option.key)
          : Boolean(
              this.data.conditionOptions.find((current) => current.key === option.key)?.checked
            )
      }))
    });
  },

  handleRiichiStateChange(event: WechatMiniprogram.RadioGroupChange) {
    const riichiState = event.detail.value as "" | "riichi" | "doubleRiichi";

    updateDraft(this, {
      conditionOptions: normalizeSceneConditions(
        CONDITION_OPTIONS.map((option) => ({
          ...option,
          checked:
            option.key === "riichi" || option.key === "doubleRiichi"
              ? option.key === riichiState
              : (option.key === "tenhou" || option.key === "chiihou") && riichiState !== ""
                ? false
                : Boolean(
                    this.data.conditionOptions.find((current) => current.key === option.key)
                      ?.checked
                  )
        }))
      )
    });
  },

  handleTimingConditionChange(event: WechatMiniprogram.RadioGroupChange) {
    const timingCondition = event.detail.value as TimingConditionKey;

    updateDraft(this, {
      conditionOptions: normalizeSceneConditions(
        CONDITION_OPTIONS.map((option) => ({
          ...option,
          checked:
            option.key === "haitei" ||
            option.key === "houtei" ||
            option.key === "rinshan" ||
            option.key === "chankan"
              ? option.key === timingCondition
              : (option.key === "tenhou" || option.key === "chiihou") && timingCondition !== ""
                ? false
                : Boolean(
                    this.data.conditionOptions.find((current) => current.key === option.key)
                      ?.checked
                  )
        }))
      )
    });
  },

  handleOpeningYakumanChange(event: WechatMiniprogram.RadioGroupChange) {
    const openingYakuman = event.detail.value as OpeningYakumanKey;
    const yakumanWinner =
      openingYakuman === "tenhou"
        ? this.data.dealer
        : openingYakuman === "chiihou" && this.data.winner === this.data.dealer
          ? findFirstChildSeat(this.data.dealer, this.data.gameVariant)
          : this.data.winner || findFirstChildSeat(this.data.dealer, this.data.gameVariant);

    updateDraft(this, {
      eventType: openingYakuman === "" ? this.data.eventType : "tsumo",
      eventTypeIndex:
        openingYakuman === ""
          ? this.data.eventTypeIndex
          : EVENT_TYPE_OPTIONS.findIndex((option) => option.key === "tsumo"),
      winType: openingYakuman === "" ? this.data.winType : "tsumo",
      winner: yakumanWinner,
      winnerIndex: getActiveSeatsForData(this.data).indexOf(yakumanWinner),
      ronWinnerSeats: openingYakuman === "" ? this.data.ronWinnerSeats : createSeatBooleanMap(),
      discarder: openingYakuman === "" ? this.data.discarder : "",
      multiRonProgress: openingYakuman === "" ? this.data.multiRonProgress : null,
      conditionOptions: normalizeSceneConditions(
        CONDITION_OPTIONS.map((option) => ({
          ...option,
          checked:
            option.key === "tenhou" || option.key === "chiihou"
              ? option.key === openingYakuman
              : Boolean(
                  this.data.conditionOptions.find((current) => current.key === option.key)?.checked
                )
        }))
      )
    });
  },

  handleTenpaiChange(event: WechatMiniprogram.CheckboxGroupChange) {
    const values = new Set(event.detail.value as Seat[]);
    const activeSeats = getActiveSeatsForData(this.data);

    updateDraft(this, {
      tenpaiSeats: SEATS.reduce<Record<Seat, boolean>>(
        (acc, seat) => ({
          ...acc,
          [seat]: activeSeats.includes(seat) && values.has(seat)
        }),
        {} as Record<Seat, boolean>
      )
    });
  },

  handleTenpaiTap(event: WechatMiniprogram.TouchEvent) {
    const seat = event.currentTarget.dataset.seat as Seat;

    if (!getActiveSeatsForData(this.data).includes(seat)) {
      return;
    }

    updateDraft(this, {
      tenpaiSeats: {
        ...this.data.tenpaiSeats,
        [seat]: !this.data.tenpaiSeats[seat]
      }
    });
  },

  handleLiabilitySeatTap(event: WechatMiniprogram.TouchEvent) {
    const seat = event.currentTarget.dataset.seat as Seat;

    if (
      !getActiveSeatsForData(this.data).includes(seat) ||
      getRonWinners(this.data).includes(seat)
    ) {
      return;
    }

    updateDraft(this, {
      liabilitySeat: this.data.liabilitySeat === seat ? "" : seat
    });
  },

  handleClearLiabilitySeat() {
    updateDraft(this, {
      liabilitySeat: ""
    });
  },

  handleMeldTypeTap(event: WechatMiniprogram.TouchEvent) {
    const selectedMeldTypeIndex = Number(event.currentTarget.dataset.index);
    const currentType = MELD_TYPE_OPTIONS[this.data.selectedMeldTypeIndex].key;
    const nextType = MELD_TYPE_OPTIONS[selectedMeldTypeIndex].key;

    if (getPlayerCountForData(this.data) === 3 && nextType === "chi") {
      this.setData({ errors: ["三人麻将不能吃牌"] });
      return;
    }

    const meldDraftTilesByType = {
      ...this.data.meldDraftTilesByType,
      [currentType]: [...this.data.meldDraftTiles]
    };
    const meldKanTypesByType = {
      ...this.data.meldKanTypesByType,
      [currentType]: [...this.data.meldKanTypes]
    };
    const meldDraftTiles = sanitizeMeldDraftTilesForType(meldDraftTilesByType[nextType], nextType);
    const meldKanTypes = sanitizeMeldKanTypesForType(meldKanTypesByType[nextType], nextType);

    updateDraft(this, {
      selectedMeldTypeIndex,
      meldDraftHint: createMeldDraftHint(nextType),
      meldDraftTiles,
      meldKanTypes,
      meldDraftTilesByType,
      meldKanTypesByType,
      winningTile: createAutoWinningTilePatch(this.data.concealedTiles, {
        ...this.data,
        selectedMeldTypeIndex,
        meldDraftTiles,
        meldKanTypes,
        meldDraftTilesByType,
        meldKanTypesByType
      }),
      activeTileArea: "meldDraftTiles",
      activeDoraIndex: 0
    });
  },

  handleAddMeld() {
    if (this.data.melds.length >= 4) {
      this.setData({ errors: ["鸣牌最多支持 4 组"] });
      return;
    }

    const type = MELD_TYPE_OPTIONS[this.data.selectedMeldTypeIndex].key;
    const tiles = compactTiles(this.data.meldDraftTiles);
    const expectedLength = type === "chi" || type === "pon" ? 3 : 4;

    if (tiles.length !== expectedLength) {
      this.setData({
        errors: [
          `${MELD_TYPE_OPTIONS[this.data.selectedMeldTypeIndex].label}需要输入 ${expectedLength} 张牌`
        ]
      });
      return;
    }

    const meld: Meld = {
      type,
      tiles,
      open: type !== "ankan",
      calledTile: tiles[0]
    };
    const validation = validateMeld(meld);

    if (!validation.valid) {
      this.setData({ errors: validation.errors });
      return;
    }

    const melds = [...this.data.melds, meld];
    updateDraft(this, {
      melds,
      meldRows: createMeldRows(melds),
      winningTile: createAutoWinningTilePatch(this.data.concealedTiles, {
        ...this.data,
        melds
      }),
      meldDraftTiles: createSlots(4),
      errors: []
    });
  },

  handleRemoveMeld(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const melds = this.data.melds.filter((_meld: Meld, meldIndex: number) => meldIndex !== index);
    updateDraft(this, {
      melds,
      meldRows: createMeldRows(melds),
      winningTile: createAutoWinningTilePatch(this.data.concealedTiles, {
        ...this.data,
        melds
      })
    });
  },

  handleShowRecords() {
    updateDraft(this, { editingPanel: "records" });
  },

  handleShowPlayers() {
    updateDraft(this, { editingPanel: "players" });
  },

  handleTransferRoomOwner(event: WechatMiniprogram.TouchEvent) {
    if (this.data.workbenchMode !== "room-host" || this.data.onlineRoomLoading) {
      showRoomViewerReadonlyToast();
      return;
    }

    const targetOpenId = String(event.currentTarget.dataset.openId || "");
    const displayName = String(event.currentTarget.dataset.displayName || "该成员");

    if (!targetOpenId) {
      wx.showToast({ title: "未找到该成员", icon: "none" });
      return;
    }

    wx.showModal({
      title: "转让房主",
      content: `确认将房主转让给“${displayName}”吗？转让后你将变为只读成员。`,
      confirmText: "确认转让",
      success: (result) => {
        if (result.confirm) {
          void this.runTransferRoomOwner(targetOpenId);
        }
      }
    });
  },

  async runTransferRoomOwner(targetOpenId: string) {
    if (this.data.onlineRoomLoading || !this.data.onlineRoomId) {
      return;
    }

    this.setData({ onlineRoomLoading: true, onlineRoomStatusText: "正在转让房主..." });

    try {
      const session = await onlineAuthService.getSession();
      const result = await onlineRoomService.transferRoomOwner({
        roomId: this.data.onlineRoomId,
        targetOpenId
      });
      const roomPatch = createOnlineRoomPatch(result, session.openId, "房主已转让");

      saveActiveOnlineRoom(result.room);
      applyRoomScoringState(this, result.state, {
        ...roomPatch,
        onlineRoomLoading: false,
        editingPanel: "players"
      });
      wx.showToast({ title: "房主已转让", icon: "success" });
    } catch (error) {
      const errorView = createOnlineRoomErrorView(error);

      this.setData({
        onlineRoomLoading: false,
        onlineRoomStatusText: errorView.message
      });
      wx.showToast({ title: errorView.message, icon: "none" });
    }
  },

  handleShowRules() {
    updateDraft(this, { editingPanel: "rules" });
  },

  handlePlayerNameInput(event: WechatMiniprogram.Input) {
    const seat = event.currentTarget.dataset.seat as Seat;
    const name = String(event.detail.value);
    const playerNames = {
      ...this.data.playerNames,
      [seat]: name
    };

    updateDraft(this, {
      playerNames
    });
  },

  handlePlayerNameBlur(event: WechatMiniprogram.Input) {
    const seat = event.currentTarget.dataset.seat as Seat;
    const playerNames = normalizePlayerNames({
      ...this.data.playerNames,
      [seat]: String(event.detail.value)
    });

    savePlayerNames(playerNames);
    updateDraft(this, {
      playerNames
    });
  },

  handleRollback() {
    if (isReadonlyWorkbench(this.data)) {
      showRoomViewerReadonlyToast();
      return;
    }

    if (!this.data.recentDraft) {
      wx.showToast({
        title: "暂无最近结算可修改",
        icon: "none"
      });
      return;
    }

    wx.showModal({
      title: "修改最近结算",
      content: "将恢复最近一局输入，确认后可重新修改结算。",
      success: (result) => {
        if (result.confirm && this.data.recentDraft) {
          updateDraft(this, {
            ...this.data.recentDraft,
            editing: true,
            editingPanel: "none",
            errors: []
          });
        }
      }
    });
  },

  handleReset() {
    if (isReadonlyWorkbench(this.data)) {
      showRoomViewerReadonlyToast();
      return;
    }

    wx.showModal({
      title: "重置复位",
      content: `将清空当前未结算输入并恢复${GAME_VARIANT_LABELS[this.data.gameVariant]} 25000 点。`,
      success: (result) => {
        if (result.confirm) {
          this.setData({
            ...createInitialData(
              this.data.settlementRecords,
              createDefaultPlayerPoints(GAME_VARIANT_DEFAULT_POINTS[this.data.gameVariant]),
              createInitialRoundState(),
              this.data.playerNames,
              undefined,
              undefined,
              this.data.gameVariant
            ),
            showModeHome: false,
            workbenchMode: this.data.workbenchMode,
            growthSource: this.data.growthSource,
            growthExampleId: this.data.growthExampleId,
            onlineRoomId: this.data.onlineRoomId,
            onlineRoomVersion: this.data.onlineRoomVersion,
            onlineRoomCodeInput: this.data.onlineRoomCodeInput,
            onlineRoomCodeText: this.data.onlineRoomCodeText,
            onlineRoomRoleText: this.data.onlineRoomRoleText,
            onlineRoomSelectedSeat: this.data.onlineRoomSelectedSeat,
            onlineRoomSeatOptions: this.data.onlineRoomSeatOptions,
            onlineRoomSeatMap: this.data.onlineRoomSeatMap
          });
        }
      }
    });
  },

  handleShuffleOnlineSeats() {
    if (this.data.workbenchMode !== "room-host") {
      showRoomViewerReadonlyToast();
      return;
    }

    if (
      !this.data.onlineRoomId ||
      countOnlineRoomMembers(this.data.onlineRoomSeatMap) !== SEATS.length
    ) {
      wx.showToast({
        title: "房间满 4 人后才能随机",
        icon: "none"
      });
      return;
    }

    wx.showModal({
      title: "随机座位",
      content: "将随机打乱四位玩家的东南西北座位，确认后同步给所有成员。",
      confirmText: "随机",
      success: (result) => {
        if (result.confirm) {
          void this.runShuffleOnlineSeats();
        }
      }
    });
  },

  async runShuffleOnlineSeats() {
    if (this.data.onlineRoomLoading) {
      return;
    }

    this.setData({
      onlineRoomLoading: true,
      onlineRoomStatusText: "正在随机座位..."
    });

    try {
      const session = await onlineAuthService.getSession();
      const result = await onlineRoomService.shuffleRoomSeats({
        roomId: this.data.onlineRoomId
      });
      const roomPatch = createOnlineRoomPatch(result, session.openId, "座位已随机");

      applyRoomScoringState(this, result.state, {
        ...roomPatch,
        ...createMembershipPatch(this.data, session),
        onlineRoomLoading: false
      });
    } catch (error) {
      const errorView = createOnlineRoomErrorView(error);

      this.setData({
        onlineRoomLoading: false,
        onlineRoomStatusText: errorView.message
      });
    }
  },

  handlePrepareSettlement() {
    if (isReadonlyWorkbench(this.data)) {
      showRoomViewerReadonlyToast();
      return;
    }

    const nextData = prepareRonStepData(this.data);
    const errors = validateDraft(nextData);
    let scoringPreview: ScoringResult | undefined;

    if (errors.length > 0) {
      this.setData({ errors });
      return;
    }

    if (nextData.eventType !== "draw") {
      scoringPreview = calculateWithRiichi(buildHandInput(nextData), buildRoundInput(nextData));

      if (!scoringPreview.valid) {
        this.setData({ errors: scoringPreview.errors });
        return;
      }
    }

    updateDraft(this, {
      winner: nextData.winner,
      winnerIndex: nextData.winnerIndex,
      ronWinnerSeats: nextData.ronWinnerSeats,
      multiRonProgress: nextData.multiRonProgress,
      confirmationResultLines: createConfirmationResultLines(nextData, scoringPreview),
      editingPanel: "confirm",
      errors: []
    });
  },

  async handleConfirmSettlement() {
    if (this.data.eventType === "ron" && getRonWinners(this.data).length > 1) {
      this.handleConfirmMultipleRonSettlement();
      return;
    }

    const record =
      this.data.eventType === "draw"
        ? createDrawSettlementRecord(
            buildDrawRoundInput(this.data),
            this.data.playerPoints,
            this.data.recentRecord?.id
          )
        : createWinSettlementRecord(this.data);
    const settlementRecords = this.data.recentRecord
      ? replaceRecentSettlement(this.data.settlementRecords, record)
      : [...this.data.settlementRecords, record];

    if (!(await persistRoomSettlementIfNeeded(this, record))) {
      return;
    }

    this.setData({
      editing: false,
      editingPanel: "none",
      errors: [],
      resultView: createResultView(record.result, record, this.data.playerNames),
      recentRecord: record,
      recentDraft: createDraftSnapshot(this.data),
      settlementRecords,
      recordRows: createRecordRows(settlementRecords, this.data.playerNames)
    });
    reportPageGrowthEvent(this.data, "growth_settlement_complete", {
      mode: this.data.workbenchMode === "local" ? "local" : "online",
      playerCount: getPlayerCountForData(this.data)
    });
  },

  async handleConfirmMultipleRonSettlement() {
    const progress = ensureMultiRonProgress(this.data);
    const currentData = {
      ...this.data,
      winner: progress.currentWinner,
      winnerIndex: getActiveSeatsForData(this.data).indexOf(progress.currentWinner),
      discarder: progress.discarder,
      discarderIndex: getActiveSeatsForData(this.data).indexOf(progress.discarder),
      multiRonProgress: progress
    };
    const handInput = buildHandInput(currentData);
    const roundInput = buildRoundInput(currentData);
    const scoringResult = calculateWithRiichi(handInput, roundInput);

    if (!scoringResult.valid) {
      this.setData({ errors: scoringResult.errors, editingPanel: "none" });
      return;
    }

    const currentWinnerIndex = Math.max(0, progress.winners.indexOf(progress.currentWinner));
    const completedWins: MultipleRonWinRecord[] = [
      ...progress.completedWins.slice(0, currentWinnerIndex),
      {
        winner: progress.currentWinner,
        roundInput,
        handInput,
        result: scoringResult
      }
    ];

    if (completedWins.length < progress.winners.length) {
      const nextWinner = progress.winners[completedWins.length];
      const nextProgress: MultiRonProgress = {
        ...progress,
        currentWinner: nextWinner,
        completedWins
      };

      updateDraft(this, {
        ...createEmptySingleWinDraftPatch(),
        winner: nextWinner,
        winnerIndex: getActiveSeatsForData(this.data).indexOf(nextWinner),
        multiRonProgress: nextProgress,
        confirmationResultLines: [],
        editingPanel: "none",
        errors: []
      });
      wx.showToast({
        title: `继续结算${getPlayerName(this.data, nextWinner)}`,
        icon: "none"
      });
      return;
    }

    const finalProgress: MultiRonProgress = {
      ...progress,
      completedWins
    };
    const record = createMultipleRonSettlementRecord(
      buildMultipleRonRoundInput(currentData, finalProgress),
      completedWins,
      this.data.playerPoints,
      this.data.recentRecord?.id
    );
    const settlementRecords = this.data.recentRecord
      ? replaceRecentSettlement(this.data.settlementRecords, record)
      : [...this.data.settlementRecords, record];

    if (!(await persistRoomSettlementIfNeeded(this, record))) {
      return;
    }

    this.setData({
      editing: false,
      editingPanel: "none",
      errors: [],
      resultView: createResultView(record.result, record, this.data.playerNames),
      recentRecord: record,
      recentDraft: createDraftSnapshot({
        ...currentData,
        multiRonProgress: finalProgress
      }),
      settlementRecords,
      recordRows: createRecordRows(settlementRecords, this.data.playerNames)
    });
    reportPageGrowthEvent(this.data, "growth_settlement_complete", {
      mode: this.data.workbenchMode === "local" ? "local" : "online",
      playerCount: getPlayerCountForData(this.data)
    });
  },

  handleMultiRonBack() {
    const progress = this.data.multiRonProgress;

    if (!progress || progress.completedWins.length === 0) {
      this.setData({ errors: ["暂无可回退的已完成和牌者"] });
      return;
    }

    const lastWin = progress.completedWins[progress.completedWins.length - 1];
    const nextProgress: MultiRonProgress = {
      ...progress,
      currentWinner: lastWin.winner,
      completedWins: progress.completedWins.slice(0, -1)
    };

    updateDraft(this, {
      ...createDraftPatchFromWinRecord(lastWin),
      multiRonProgress: nextProgress,
      confirmationResultLines: [],
      editingPanel: "none",
      errors: []
    });
  },

  handleCancelMultiRon() {
    const winner = selectedSeats(this.data.ronWinnerSeats, getActiveSeatsForData(this.data))[0];

    updateDraft(this, {
      ...createEmptySingleWinDraftPatch(),
      winner: winner ?? "",
      winnerIndex: winner ? getActiveSeatsForData(this.data).indexOf(winner) : -1,
      multiRonProgress: null,
      confirmationResultLines: [],
      editingPanel: "none",
      errors: []
    });
  },

  handleEditResult() {
    if (isReadonlyWorkbench(this.data)) {
      showRoomViewerReadonlyToast();
      return;
    }

    if (!this.data.recentDraft) {
      this.setData({ editing: true });
      return;
    }

    updateDraft(this, {
      ...this.data.recentDraft,
      editing: true,
      editingPanel: "none",
      errors: []
    });
  },

  handleNewInput() {
    const nextPoints = this.data.recentRecord?.pointsAfter;
    const nextRoundState = this.data.recentRecord
      ? createNextRoundState(this.data.recentRecord, this.data)
      : undefined;

    this.setData({
      ...createInitialData(
        this.data.settlementRecords,
        nextPoints,
        nextRoundState,
        this.data.playerNames,
        this.data.recentRecord,
        this.data.recentDraft,
        this.data.gameVariant
      ),
      showModeHome: false,
      workbenchMode: this.data.workbenchMode,
      activeThemeId: this.data.activeThemeId,
      activeThemeName: this.data.activeThemeName,
      themeOptions: this.data.themeOptions,
      membershipAccess: this.data.membershipAccess,
      growthSource: this.data.growthSource,
      growthExampleId: this.data.growthExampleId,
      onlineRoomId: this.data.onlineRoomId,
      onlineRoomVersion: this.data.onlineRoomVersion,
      onlineRoomCodeInput: this.data.onlineRoomCodeInput,
      onlineRoomCodeText: this.data.onlineRoomCodeText,
      onlineRoomRoleText: this.data.onlineRoomRoleText,
      onlineRoomSelectedSeat: this.data.onlineRoomSelectedSeat,
      onlineRoomSeatOptions: this.data.onlineRoomSeatOptions,
      onlineRoomSeatMap: this.data.onlineRoomSeatMap
    });
  }
});

function createInitialData(
  settlementRecords: SettlementRecord[] = [],
  initialPoints: PlayerPoints = createDefaultPlayerPoints(),
  roundState: RoundState = createInitialRoundState(),
  playerNames: PlayerNames = loadPlayerNames(),
  recentRecord?: SettlementRecord,
  recentDraft?: DraftSnapshot,
  gameVariant: GameVariant = "yonma"
): ScoringPageData {
  const onlineProfile = loadOnlineProfile();
  const activeThemeId = loadPreferredTheme();
  const activeSeats = getActiveSeatsForVariant(gameVariant);
  const normalizedDealer = normalizeSeatForActiveSeats(SEATS[roundState.dealerIndex], activeSeats);
  const dealerIndex = activeSeats.indexOf(normalizedDealer);
  const roundIndex = normalizeRoundIndexForVariant(roundState.roundIndex, gameVariant);
  const baseData: ScoringPageData = {
    showModeHome: true,
    growthSource: "",
    growthExampleId: "",
    editing: true,
    editingPanel: "none",
    gameVariant,
    gameVariantText: GAME_VARIANT_LABELS[gameVariant],
    roundWindLabels: ROUND_WIND_LABELS,
    roundIndexLabels: createRoundIndexLabels(gameVariant),
    seatLabels: activeSeats.map((seat) => getPlayerNameFromMap(playerNames, seat)),
    eventTypeOptions: EVENT_TYPE_OPTIONS,
    roundWindIndex: roundState.roundWindIndex,
    roundIndex,
    roundLabel: createRoundLabel(roundState.roundWindIndex, roundIndex),
    honba: roundState.honba,
    riichiSticks: roundState.riichiSticks,
    dealerIndex,
    winnerIndex: -1,
    discarderIndex: -1,
    dealer: normalizedDealer,
    winner: "",
    ronWinnerSeats: createSeatBooleanMap(),
    discarder: "",
    eventType: "ron",
    eventTypeIndex: 0,
    winType: "ron",
    playerNames,
    playerPoints: initialPoints,
    pointRows: createPointRows(initialPoints, playerNames, activeSeats),
    playerNameRows: createPlayerNameRows(playerNames, normalizedDealer, activeSeats, gameVariant),
    riichiSeats: createSeatBooleanMap(),
    tenpaiSeats: createSeatBooleanMap(),
    concealedTiles: createSlots(13),
    winningTile: createSlots(1),
    meldDraftTiles: createSlots(16),
    meldDraftTilesByType: createEmptyMeldDraftTileMap(),
    doraIndicators: createSlots(4),
    kanDoraIndicators: createSlots(0),
    uraDoraIndicators: createSlots(4),
    nukiDoraCount: 0,
    liabilitySeat: "",
    activeDoraIndex: 0,
    selectedMeldTypeIndex: 0,
    meldTypeOptions: MELD_TYPE_OPTIONS,
    meldDraftHint: createMeldDraftHint("chi"),
    meldKanTypes: ["", "", "", ""],
    meldKanTypesByType: createEmptyMeldDraftKanTypeMap(),
    melds: [],
    meldRows: [],
    conditionOptions: CONDITION_OPTIONS.map((option) => ({ ...option, checked: false })),
    activeTileArea: "concealedTiles",
    multiRonProgress: null,
    errors: [],
    resultView: EMPTY_RESULT_VIEW,
    settlementRecords,
    ...(recentRecord ? { recentRecord } : {}),
    ...(recentDraft ? { recentDraft } : {}),
    tableSeats: [],
    activeThemeId,
    activeThemeName: getThemeById(activeThemeId).name,
    themeOptions: [],
    membershipAccess: { ...FREE_MEMBERSHIP_ACCESS },
    winnerChoiceRows: [],
    discarderChoiceRows: [],
    liabilityChoiceRows: [],
    tenpaiRows: [],
    riichiStateOptions: [],
    timingConditionOptions: [],
    openingYakumanOptions: [],
    bonusConditionOptions: [],
    handSlotViews: [],
    winningTileCandidates: [],
    handTileRows: HAND_TILE_ROWS,
    meldGroupViews: [],
    kanTypeOptions: KAN_TYPE_OPTIONS,
    doraSlotViews: [],
    uraDoraSlotViews: [],
    doraTileRows: DORA_TILE_ROWS,
    summaryRows: [],
    situationAnalysis: createEmptySituationAnalysisView(),
    tableCenterLines: [],
    recordRows: createRecordRows(settlementRecords, playerNames),
    confirmationLines: [],
    confirmationResultLines: [],
    multiRonStatusText: "",
    multiRonCurrentLabel: "",
    multiRonConfirmText: "确认结算",
    onlineRoomCodeInput: "",
    onlineRoomLoading: false,
    onlineRoomStatusText: "",
    onlineRoomCodeText: "",
    onlineRoomId: "",
    onlineRoomVersion: 0,
    onlineRoomRoleText: "",
    onlineRoomOwnerOpenId: "",
    onlineRoomMemberRows: [],
    canShuffleOnlineSeats: false,
    onlineRoomSelectedSeat: "south",
    onlineRoomSeatOptions: createOnlineRoomSeatOptions("south", normalizedDealer),
    onlineRoomSeatMap: {},
    onlineProfileName: onlineProfile.displayName,
    onlineProfileAvatarUrl: onlineProfile.avatarUrl,
    workbenchMode: "local"
  };

  return {
    ...baseData,
    ...createDerivedPatch(baseData)
  };
}

function getPlayerCountFromVariant(gameVariant: GameVariant): PlayerCount {
  return gameVariant === "sanma" ? 3 : 4;
}

function getActiveSeatsForVariant(gameVariant: GameVariant): Seat[] {
  return getActiveSeats(getPlayerCountFromVariant(gameVariant));
}

function getActiveSeatsForData(
  data: Pick<ScoringPageData, "gameVariant" | "workbenchMode">
): Seat[] {
  return data.workbenchMode === "local" ? getActiveSeatsForVariant(data.gameVariant) : SEATS;
}

function getPlayerCountForData(
  data: Pick<ScoringPageData, "gameVariant" | "workbenchMode">
): PlayerCount {
  return data.workbenchMode === "local" ? getPlayerCountFromVariant(data.gameVariant) : 4;
}

function createRoundIndexLabels(gameVariant: GameVariant): string[] {
  return ROUND_INDEX_LABELS.slice(0, getActiveSeatsForVariant(gameVariant).length);
}

function normalizeRoundIndexForVariant(roundIndex: number, gameVariant: GameVariant): number {
  return Math.min(Math.max(roundIndex, 0), createRoundIndexLabels(gameVariant).length - 1);
}

function normalizeSeatForActiveSeats(seat: Seat | undefined, activeSeats: readonly Seat[]): Seat {
  return seat && activeSeats.includes(seat) ? seat : activeSeats[0];
}

function getSeatByChoiceIndex(data: ScoringPageData, index: number): Seat {
  const activeSeats = getActiveSeatsForData(data);

  return activeSeats[index] ?? activeSeats[0];
}

function createLocalModePatch(
  data: ScoringPageData,
  gameVariant: GameVariant
): Partial<ScoringPageData> {
  const activeSeats = getActiveSeatsForVariant(gameVariant);
  const dealer = normalizeSeatForActiveSeats(data.dealer, activeSeats);
  const roundIndex = normalizeRoundIndexForVariant(data.roundIndex, gameVariant);
  const winner = normalizeSeatForActiveSeats(data.winner || undefined, activeSeats);
  const hasWinner = Boolean(data.winner && activeSeats.includes(data.winner));
  const discarder = data.discarder && activeSeats.includes(data.discarder) ? data.discarder : "";
  const ronWinnerSeats = createSeatBooleanMapFromSeats(
    selectedSeats(data.ronWinnerSeats, activeSeats)
  );
  const shouldUseVariantDefaultPoints = data.showModeHome && data.settlementRecords.length === 0;
  const playerPoints = shouldUseVariantDefaultPoints
    ? createDefaultPlayerPoints(GAME_VARIANT_DEFAULT_POINTS[gameVariant])
    : data.playerPoints;
  const selectedMeldTypeIndex =
    gameVariant === "sanma" && MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key === "chi"
      ? MELD_TYPE_OPTIONS.findIndex((option) => option.key === "pon")
      : data.selectedMeldTypeIndex;

  return {
    gameVariant,
    gameVariantText: GAME_VARIANT_LABELS[gameVariant],
    roundIndex,
    roundLabel: createRoundLabel(data.roundWindIndex, roundIndex),
    dealer,
    dealerIndex: activeSeats.indexOf(dealer),
    winner: hasWinner ? winner : "",
    winnerIndex: hasWinner ? activeSeats.indexOf(winner) : -1,
    discarder,
    discarderIndex: discarder ? activeSeats.indexOf(discarder) : -1,
    ronWinnerSeats,
    tenpaiSeats: createSeatBooleanMapFromSeats(selectedSeats(data.tenpaiSeats, activeSeats)),
    playerPoints,
    pointRows: createPointRows(playerPoints, data.playerNames, activeSeats),
    concealedTiles: sanitizeTileSlotsForVariant(data.concealedTiles, gameVariant),
    winningTile: sanitizeTileSlotsForVariant(data.winningTile, gameVariant),
    meldDraftTiles: sanitizeTileSlotsForVariant(data.meldDraftTiles, gameVariant),
    meldDraftTilesByType: sanitizeMeldDraftTileMapForVariant(
      data.meldDraftTilesByType,
      gameVariant
    ),
    doraIndicators: sanitizeTileSlotsForVariant(data.doraIndicators, gameVariant),
    uraDoraIndicators: sanitizeTileSlotsForVariant(data.uraDoraIndicators, gameVariant),
    nukiDoraCount: gameVariant === "sanma" ? data.nukiDoraCount : 0,
    liabilitySeat:
      data.liabilitySeat && activeSeats.includes(data.liabilitySeat) ? data.liabilitySeat : "",
    selectedMeldTypeIndex,
    multiRonProgress: null
  };
}

function openCuratedScoringExample(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>,
  example: CuratedScoringExample
): void {
  stopOnlineRoomAutoRefresh();
  applyScoringNavigationTheme(page.data.activeThemeId);
  const activeSeats = getActiveSeatsForVariant(example.gameVariant);
  const localPatch = createLocalModePatch(page.data, example.gameVariant);

  updateDraft(page, {
    ...localPatch,
    showModeHome: false,
    editing: true,
    editingPanel: "none",
    workbenchMode: "local",
    eventType: example.winType === "tsumo" ? "tsumo" : "ron",
    eventTypeIndex: example.winType === "tsumo" ? 1 : 0,
    winType: example.winType,
    winner: example.winner,
    winnerIndex: activeSeats.indexOf(example.winner),
    ronWinnerSeats: createSeatBooleanMap(),
    discarder: example.discarder,
    discarderIndex: example.discarder ? activeSeats.indexOf(example.discarder) : -1,
    concealedTiles: [...example.concealedTiles],
    winningTile: [example.winningTile],
    meldDraftTiles: createSlots(16),
    meldDraftTilesByType: createEmptyMeldDraftTileMap(),
    melds: [],
    doraIndicators: createSlots(4),
    kanDoraIndicators: [],
    uraDoraIndicators: createSlots(4),
    conditionOptions: CONDITION_OPTIONS.map((option) => ({ ...option, checked: false })),
    activeTileArea: "winningTile",
    onlineRoomStatusText: "",
    onlineRoomRoleText: "",
    onlineRoomCodeText: "",
    errors: []
  });
  reportPageGrowthEvent(page.data, "growth_local_start", {
    mode: "local",
    playerCount: getPlayerCountFromVariant(example.gameVariant),
    exampleId: example.id
  });
}

function createPageShareMetadata(data: ScoringPageData, requestedResult: boolean): ShareMetadata {
  if (requestedResult && !data.editing) {
    const valueText = [
      data.resultView.limitText,
      data.resultView.han > 0 ? `${data.resultView.han}番` : ""
    ]
      .filter(Boolean)
      .join(" ");
    return createResultShareMetadata(data.gameVariant, valueText);
  }

  const roomCode = normalizeRoomCode(data.onlineRoomCodeInput);
  if (data.onlineRoomId && roomCode) {
    return createRoomShareMetadata(roomCode);
  }
  if (data.growthExampleId) {
    return createExampleShareMetadata(data.growthExampleId);
  }
  return createHomeShareMetadata();
}

function resolveShareContext(
  data: ScoringPageData,
  requestedResult: boolean
): "home" | "room" | "example" | "result" {
  if (requestedResult && !data.editing) {
    return "result";
  }
  if (data.onlineRoomId && normalizeRoomCode(data.onlineRoomCodeInput)) {
    return "room";
  }
  return data.growthExampleId ? "example" : "home";
}

function reportPageGrowthEvent(
  data: Pick<ScoringPageData, "growthSource" | "growthExampleId">,
  eventName: GrowthEventName,
  fields: GrowthEventFields
): void {
  const reportEvent =
    typeof wx.reportEvent === "function"
      ? (name: GrowthEventName, payload: Record<string, string | number>) =>
          wx.reportEvent(name, payload)
      : typeof wx.reportAnalytics === "function"
        ? (name: GrowthEventName, payload: Record<string, string | number>) =>
            wx.reportAnalytics(name, payload)
        : undefined;

  reportGrowthEvent(reportEvent, eventName, {
    source: data.growthSource,
    exampleId: data.growthExampleId,
    ...fields
  });
}

function sanitizeTileSlotsForVariant(
  slots: readonly TileSlotValue[],
  gameVariant: GameVariant
): TileSlotValue[] {
  return slots.map((tile) => (tile && isRemovedManzuTileForSanma(gameVariant, tile) ? "" : tile));
}

function sanitizeMeldDraftTileMapForVariant(
  map: MeldDraftTileMap,
  gameVariant: GameVariant
): MeldDraftTileMap {
  return {
    chi: sanitizeTileSlotsForVariant(map.chi, gameVariant),
    pon: sanitizeTileSlotsForVariant(map.pon, gameVariant),
    minkan: sanitizeTileSlotsForVariant(map.minkan, gameVariant),
    ankan: sanitizeTileSlotsForVariant(map.ankan, gameVariant),
    kakan: sanitizeTileSlotsForVariant(map.kakan, gameVariant)
  };
}

function updateDraft(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>,
  patch: Partial<ScoringPageData>
): void {
  const mergedData = {
    ...page.data,
    ...patch
  };
  const nextData = normalizeRoundEventState(mergedData);
  const roundEventPatch = createRoundEventStatePatch(nextData);
  const derivedPatch = createDerivedPatch(nextData);
  const syncedData = {
    ...nextData,
    ...roundEventPatch,
    ...derivedPatch
  };

  page.setData({
    ...patch,
    ...roundEventPatch,
    ...derivedPatch
  });

  if (shouldSyncRoomState(page.data, patch)) {
    syncRoomSharedState(page, syncedData);
  }

  if (shouldSaveLocalDraft(syncedData, patch)) {
    saveLocalDraft(syncedData);
  }
}

function shouldSaveLocalDraft(data: ScoringPageData, patch: Partial<ScoringPageData>): boolean {
  return data.workbenchMode === "local" && !data.showModeHome && hasSharedDraftPatch(patch);
}

function saveLocalDraft(data: ScoringPageData): void {
  localDraftStorage.save({
    gameVariant: data.gameVariant,
    sharedState: createRoomSharedScoringDataFromDraft(createLocalScoringDraft(data)),
    nukiDoraCount: data.nukiDoraCount,
    liabilitySeat: data.liabilitySeat
  });
}

function shouldSyncRoomState(
  data: Pick<ScoringPageData, "workbenchMode" | "onlineRoomId" | "onlineRoomVersion">,
  patch: Partial<ScoringPageData>
): boolean {
  if (data.workbenchMode !== "room-host" || !data.onlineRoomId || data.onlineRoomVersion <= 0) {
    return false;
  }

  return hasSharedDraftPatch(patch);
}

function hasSharedDraftPatch(patch: Partial<ScoringPageData>): boolean {
  const sharedKeys: Array<keyof ScoringPageData> = [
    "roundWindIndex",
    "roundIndex",
    "honba",
    "riichiSticks",
    "dealerIndex",
    "dealer",
    "winner",
    "ronWinnerSeats",
    "discarder",
    "eventType",
    "winType",
    "playerPoints",
    "riichiSeats",
    "tenpaiSeats",
    "concealedTiles",
    "winningTile",
    "meldDraftTiles",
    "meldDraftTilesByType",
    "meldKanTypes",
    "meldKanTypesByType",
    "doraIndicators",
    "kanDoraIndicators",
    "uraDoraIndicators",
    "nukiDoraCount",
    "liabilitySeat",
    "conditionOptions",
    "settlementRecords",
    "recentRecord"
  ];

  return sharedKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
}

function syncRoomSharedState(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>,
  data: ScoringPageData
): void {
  pendingRoomStateSyncData = data;

  if (!roomStateSyncRunning) {
    void flushPendingRoomState(page);
  }
}

async function flushPendingRoomState(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>
): Promise<void> {
  roomStateSyncRunning = true;

  try {
    while (pendingRoomStateSyncData && page.data.workbenchMode === "room-host") {
      const data = pendingRoomStateSyncData;
      pendingRoomStateSyncData = undefined;

      try {
        const result = await onlineRoomService.updateRoomState({
          roomId: page.data.onlineRoomId,
          baseVersion: page.data.onlineRoomVersion,
          sharedState: createRoomSharedScoringDataFromDraft(createLocalScoringDraft(data))
        });

        page.setData({
          onlineRoomVersion: result.state.version,
          onlineRoomStatusText: "已同步"
        });
      } catch (error) {
        pendingRoomStateSyncData = undefined;

        if (getOnlineBackendErrorCode(error) === "ROOM_VERSION_CONFLICT") {
          page.setData({ onlineRoomStatusText: "房间状态有更新，正在自动刷新..." });
          await refreshRoomStateAfterConflict(page);
          break;
        }

        const errorView = createOnlineRoomErrorView(error);
        page.setData({ onlineRoomStatusText: errorView.message });
        break;
      }
    }
  } finally {
    roomStateSyncRunning = false;
  }
}

async function refreshRoomStateAfterConflict(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>
): Promise<boolean> {
  try {
    const session = await onlineAuthService.getSession();
    const result = await onlineRoomService.joinRoom({
      roomCode: page.data.onlineRoomCodeInput,
      displayName: createOnlineDisplayName(page.data.onlineProfileName, "玩家"),
      avatarUrl: createBackendAvatarUrl(page.data.onlineProfileAvatarUrl)
    });
    const roomPatch = createOnlineRoomPatch(result, session.openId, "已自动刷新最新状态");

    saveActiveOnlineRoom(result.room);
    applyRoomScoringState(page, result.state, {
      ...roomPatch,
      onlineRoomLoading: false
    });
    return true;
  } catch (error) {
    const errorView = createOnlineRoomErrorView(error);

    page.setData({ onlineRoomStatusText: errorView.message });
    return false;
  }
}

function applyLocalDraftSnapshot(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>,
  snapshot: LocalDraftSnapshot
): void {
  const state: RoomScoringState = {
    ...snapshot.sharedState,
    roomId: "local-draft",
    version: 0,
    updatedBy: "local",
    updatedAt: snapshot.savedAt
  };

  applyRoomScoringState(page, state, {
    showModeHome: false,
    workbenchMode: "local",
    gameVariant: snapshot.gameVariant,
    gameVariantText: GAME_VARIANT_LABELS[snapshot.gameVariant],
    nukiDoraCount: snapshot.nukiDoraCount,
    liabilitySeat: snapshot.liabilitySeat,
    onlineRoomId: "",
    onlineRoomVersion: 0,
    onlineRoomCodeInput: "",
    onlineRoomCodeText: "",
    onlineRoomRoleText: "",
    onlineRoomOwnerOpenId: "",
    onlineRoomMemberRows: [],
    onlineRoomSeatMap: {},
    onlineRoomStatusText: ""
  });
}

function createLocalScoringDraft(data: ScoringPageData): LocalScoringDraftLike {
  const melds = inferMeldsFromAllTypeDrafts(data);

  return {
    roundWind: ROUND_WIND_VALUES[data.roundWindIndex],
    roundIndex: data.roundIndex,
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    dealer: data.dealer,
    eventType: data.eventType,
    winType: data.winType,
    winner: data.winner,
    ronWinners: selectedSeats(data.ronWinnerSeats, getActiveSeatsForData(data)),
    discarder: data.discarder,
    tenpaiSeats: { ...data.tenpaiSeats },
    playerPoints: { ...data.playerPoints },
    concealedTiles: [...data.concealedTiles],
    winningTile: [...data.winningTile],
    melds,
    doraIndicators: [...data.doraIndicators],
    kanDoraIndicators: [...data.kanDoraIndicators],
    uraDoraIndicators: [...data.uraDoraIndicators],
    conditions: createWinConditions(data.conditionOptions, data.winType, melds),
    riichiSeats: { ...data.riichiSeats },
    recordIds: data.settlementRecords.map((record) => record.id),
    recentRecordId: data.recentRecord?.id
  };
}

function applyRoomScoringState(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>,
  state: RoomScoringState,
  extraPatch: Partial<ScoringPageData> = {}
): void {
  const patch = createDraftPatchFromRoomSharedScoringData(state);
  const roundWindIndex = ROUND_WIND_VALUES.indexOf(patch.roundWind);
  const dealerIndex = SEATS.indexOf(patch.dealer);
  const winnerIndex = patch.winner ? SEATS.indexOf(patch.winner) : -1;
  const discarderIndex = patch.discarder ? SEATS.indexOf(patch.discarder) : -1;
  const meldDraftTilesByType = createMeldDraftMapFromMelds(patch.melds);
  const meldKanTypesByType = createMeldKanTypeMapFromMelds(patch.melds);
  const selectedMeldType = MELD_TYPE_OPTIONS[page.data.selectedMeldTypeIndex].key;
  const ronWinnerSeats = createSeatBooleanMapFromSeats(patch.ronWinners);
  const nextData = normalizeRoundEventState({
    ...page.data,
    roundWindIndex,
    roundIndex: patch.roundIndex,
    roundLabel: createRoundLabel(roundWindIndex, patch.roundIndex),
    honba: patch.honba,
    riichiSticks: patch.riichiSticks,
    dealerIndex,
    dealer: patch.dealer,
    winner: patch.winner,
    winnerIndex,
    ronWinnerSeats,
    discarder: patch.discarder,
    discarderIndex,
    eventType: patch.eventType,
    eventTypeIndex: EVENT_TYPE_OPTIONS.findIndex((option) => option.key === patch.eventType),
    winType: patch.winType,
    playerPoints: patch.playerPoints,
    pointRows: createPointRows(patch.playerPoints, page.data.playerNames, SEATS),
    riichiSeats: patch.riichiSeats,
    tenpaiSeats: patch.tenpaiSeats,
    concealedTiles: padTileSlots(patch.concealedTiles, 13),
    winningTile: padTileSlots(patch.winningTile, 1),
    meldDraftTiles: meldDraftTilesByType[selectedMeldType],
    meldDraftTilesByType,
    meldKanTypes: meldKanTypesByType[selectedMeldType],
    meldKanTypesByType,
    melds: patch.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    meldRows: createMeldRows(patch.melds),
    doraIndicators: padTileSlots(patch.doraIndicators, 4),
    kanDoraIndicators: padTileSlots(patch.kanDoraIndicators, 0),
    uraDoraIndicators: padTileSlots(patch.uraDoraIndicators, 4),
    nukiDoraCount: 0,
    conditionOptions: createConditionOptionsFromWinConditions(patch.conditions),
    editingPanel: "none",
    errors: [],
    multiRonProgress: null,
    onlineRoomVersion: state.version,
    ...extraPatch
  });

  page.setData({
    ...nextData,
    ...createRoundEventStatePatch(nextData),
    ...createDerivedPatch(nextData)
  });
}

function createOnlineRoomPatch(
  result: OnlineRoomServiceResult,
  currentOpenId: string,
  onlineRoomStatusText: string
): Partial<ScoringPageData> {
  const workbenchMode: OnlineRoomWorkbenchMode =
    result.room.ownerOpenId === currentOpenId ? "room-host" : "room-viewer";
  const currentSeat = findSeatByOpenId(result.room.seatMap, currentOpenId);

  return {
    workbenchMode,
    onlineRoomId: result.room.id,
    onlineRoomVersion: result.state.version,
    onlineRoomCodeInput: result.room.roomCode,
    onlineRoomCodeText: `房间码：${result.room.roomCode}`,
    onlineRoomRoleText: workbenchMode === "room-host" ? "房主" : "成员",
    onlineRoomOwnerOpenId: result.room.ownerOpenId,
    onlineRoomMemberRows: createOnlineRoomMemberRows(result.room, currentOpenId),
    onlineRoomSeatMap: result.room.seatMap,
    ...(currentSeat
      ? {
          onlineRoomSelectedSeat: currentSeat,
          onlineRoomSeatOptions: createOnlineRoomSeatOptions(currentSeat, result.state.round.dealer)
        }
      : {}),
    onlineRoomStatusText
  };
}

function createOnlineRoomMemberRows(
  room: OnlineRoom,
  currentOpenId: string
): OnlineRoomMemberRow[] {
  return SEATS.flatMap((seat) => {
    const member = room.seatMap[seat];

    if (!member) {
      return [];
    }

    const isOwner = member.openId === room.ownerOpenId;

    return [
      {
        seat,
        directionLabel: SEAT_DIRECTION_LABELS[seat],
        openId: member.openId,
        displayName: member.displayName?.trim() || `${SEAT_DIRECTION_LABELS[seat]}家成员`,
        avatarUrl: member.avatarUrl || "",
        isOwner,
        canTransfer: room.ownerOpenId === currentOpenId && !isOwner
      }
    ];
  });
}

function createMembershipPatch(
  data: Pick<ScoringPageData, "activeThemeId">,
  session: OnlineAuthSession
): Pick<ScoringPageData, "activeThemeId" | "membershipAccess"> {
  const membershipAccess = createMembershipAccess(session.user.membership);
  const activeTheme = getThemeById(data.activeThemeId);

  return {
    membershipAccess,
    activeThemeId: canAccessTheme(activeTheme, membershipAccess.canUseVipThemes)
      ? data.activeThemeId
      : DEFAULT_THEME_ID
  };
}

function findSeatByOpenId(seatMap: Partial<RoomSeatMap>, openId: string): Seat | "" {
  return SEATS.find((seat) => seatMap?.[seat]?.openId === openId) || "";
}

function startOnlineRoomAutoRefresh(page: ScoringPageInstance): void {
  stopOnlineRoomAutoRefresh();
  onlineRoomRefreshTimer = setInterval(() => {
    if (page.data.showModeHome || page.data.workbenchMode === "local") {
      stopOnlineRoomAutoRefresh();
      return;
    }

    void page.refreshOnlineRoomPresence(true);
  }, 5000);
}

function stopOnlineRoomAutoRefresh(): void {
  pendingRoomStateSyncData = undefined;

  if (onlineRoomRefreshTimer === undefined) {
    return;
  }

  clearInterval(onlineRoomRefreshTimer);
  onlineRoomRefreshTimer = undefined;
  onlineRoomRefreshRunning = false;
}

function createLeaveOnlineRoomPatch(data: ScoringPageData): Partial<ScoringPageData> {
  return {
    ...createInitialData(
      data.settlementRecords,
      undefined,
      undefined,
      data.playerNames,
      data.recentRecord,
      data.recentDraft
    ),
    showModeHome: true,
    growthSource: data.growthSource,
    growthExampleId: data.growthExampleId,
    editingPanel: "none",
    onlineRoomStatusText: ""
  };
}

function isOnlineRoomGoneError(message: string): boolean {
  return /房间不存在|房间已失效|房间已结束|房间人数已满/.test(message);
}

function padTileSlots(tiles: readonly Tile[], length: number): TileSlotValue[] {
  return [...tiles, ...createSlots(Math.max(0, length - tiles.length))];
}

function createSeatBooleanMapFromSeats(seats: readonly Seat[]): Record<Seat, boolean> {
  const selected = new Set(seats);

  return SEATS.reduce<Record<Seat, boolean>>(
    (map, seat) => ({
      ...map,
      [seat]: selected.has(seat)
    }),
    {} as Record<Seat, boolean>
  );
}

function createConditionOptionsFromWinConditions(
  conditions: WinConditions
): Array<Option<ConditionKey>> {
  return CONDITION_OPTIONS.map((option) => ({
    ...option,
    checked: Boolean(conditions[option.key])
  }));
}

async function persistRoomSettlementIfNeeded(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>,
  record: SettlementRecord
): Promise<boolean> {
  if (page.data.workbenchMode !== "room-host") {
    return true;
  }

  page.setData({ onlineRoomStatusText: "正在同步结算..." });

  try {
    const result = await onlineRoomService.confirmSettlement({
      roomId: page.data.onlineRoomId,
      baseVersion: page.data.onlineRoomVersion,
      record
    });

    page.setData({
      onlineRoomVersion: result.state.version,
      onlineRoomStatusText: "结算已同步"
    });
    return true;
  } catch (error) {
    if (getOnlineBackendErrorCode(error) === "ROOM_VERSION_CONFLICT") {
      const refreshed = await refreshRoomStateAfterConflict(page);
      const message = refreshed
        ? "房间状态已更新，请重新确认结算"
        : "房间状态刷新失败，请重新连接后再结算";

      page.setData({
        editingPanel: "none",
        onlineRoomStatusText: message,
        errors: [message]
      });
      return false;
    }

    const errorView = createOnlineRoomErrorView(error);

    page.setData({
      editingPanel: "none",
      onlineRoomStatusText: errorView.message,
      errors: [errorView.message]
    });
    return false;
  }
}

function isReadonlyWorkbench(data: Pick<ScoringPageData, "workbenchMode">): boolean {
  return data.workbenchMode === "room-viewer";
}

function isSharedEditingPanel(panel: EditingPanel): boolean {
  return ["round-event", "scene-yaku", "hand", "dora", "meld"].includes(panel);
}

function showRoomViewerReadonlyToast(): void {
  wx.showToast({
    title: "仅房主可编辑",
    icon: "none"
  });
}

function normalizeRoundEventState(data: ScoringPageData): ScoringPageData {
  const eventTypeIndex = EVENT_TYPE_OPTIONS.findIndex((option) => option.key === data.eventType);
  const activeSeats = getActiveSeatsForData(data);

  if (data.eventType === "ron") {
    const ronWinnerSeats = {
      ...createSeatBooleanMapFromSeats(selectedSeats(data.ronWinnerSeats, activeSeats)),
      ...(data.winner && activeSeats.includes(data.winner) ? { [data.winner]: true } : {})
    };
    const selectedWinners = selectedSeats(ronWinnerSeats, activeSeats);
    const discarder =
      data.discarder &&
      activeSeats.includes(data.discarder) &&
      !selectedWinners.includes(data.discarder)
        ? data.discarder
        : "";
    const winner =
      data.multiRonProgress?.currentWinner &&
      activeSeats.includes(data.multiRonProgress.currentWinner)
        ? data.multiRonProgress.currentWinner
        : data.winner && activeSeats.includes(data.winner)
          ? data.winner
          : (selectedWinners[0] ?? "");

    return {
      ...data,
      eventTypeIndex,
      winType: "ron",
      winner,
      winnerIndex: winner ? activeSeats.indexOf(winner) : -1,
      ronWinnerSeats,
      discarder,
      discarderIndex: discarder ? activeSeats.indexOf(discarder) : -1,
      tenpaiSeats: createSeatBooleanMap()
    };
  }

  const winner =
    data.eventType === "tsumo" && data.winner && activeSeats.includes(data.winner)
      ? data.winner
      : "";

  return {
    ...data,
    eventTypeIndex,
    winType: data.eventType === "tsumo" ? "tsumo" : "ron",
    winner,
    winnerIndex: winner ? activeSeats.indexOf(winner) : -1,
    ronWinnerSeats: createSeatBooleanMap(),
    discarder: "",
    discarderIndex: -1,
    multiRonProgress: null,
    tenpaiSeats:
      data.eventType === "draw"
        ? createSeatBooleanMapFromSeats(selectedSeats(data.tenpaiSeats, activeSeats))
        : createSeatBooleanMap()
  };
}

function createRoundEventStatePatch(data: ScoringPageData): Partial<ScoringPageData> {
  return {
    eventTypeIndex: data.eventTypeIndex,
    winType: data.winType,
    winner: data.winner,
    winnerIndex: data.winnerIndex,
    ronWinnerSeats: data.ronWinnerSeats,
    discarder: data.discarder,
    discarderIndex: data.discarderIndex,
    multiRonProgress: data.multiRonProgress,
    tenpaiSeats: data.tenpaiSeats
  };
}

function createInitialRoundState(): RoundState {
  return {
    roundWindIndex: 0,
    roundIndex: 0,
    honba: 0,
    riichiSticks: 0,
    dealerIndex: 0
  };
}

function createNextRoundState(record: SettlementRecord, data: ScoringPageData): RoundState {
  const current: RoundState = {
    roundWindIndex: data.roundWindIndex,
    roundIndex: data.roundIndex,
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    dealerIndex: data.dealerIndex
  };

  if (record.event.type === "draw") {
    const dealerContinues = record.drawInput?.tenpaiSeats.includes(data.dealer) ?? false;

    return {
      ...advanceRoundPosition(current, !dealerContinues, data.gameVariant),
      honba: data.honba + 1,
      riichiSticks: data.riichiSticks
    };
  }

  const winners =
    record.event.type === "ron"
      ? (record.event.winners ?? [record.event.winner])
      : [record.event.winner];
  const dealerContinues = winners.includes(data.dealer);

  return {
    ...advanceRoundPosition(current, !dealerContinues, data.gameVariant),
    honba: dealerContinues ? data.honba + 1 : 0,
    riichiSticks: 0
  };
}

function advanceRoundPosition(
  state: RoundState,
  rotateDealer: boolean,
  gameVariant: GameVariant = "yonma"
): RoundState {
  if (!rotateDealer) {
    return state;
  }

  const playerCount = getPlayerCountFromVariant(gameVariant);
  const activeSeats = getActiveSeatsForVariant(gameVariant);
  const activeTurnOrder = getActiveTurnOrder(playerCount);
  const wrappedRound = state.roundIndex >= createRoundIndexLabels(gameVariant).length - 1;
  const currentDealer = activeSeats[state.dealerIndex] ?? activeSeats[0];
  const currentTurnIndex = activeTurnOrder.indexOf(currentDealer);
  const nextDealer =
    activeTurnOrder[(currentTurnIndex + 1) % activeTurnOrder.length] ?? activeSeats[0];

  return {
    ...state,
    dealerIndex: activeSeats.indexOf(nextDealer),
    roundIndex: wrappedRound ? 0 : state.roundIndex + 1,
    roundWindIndex: wrappedRound
      ? Math.min(state.roundWindIndex + 1, ROUND_WIND_VALUES.length - 1)
      : state.roundWindIndex
  };
}

function findFirstChildSeat(dealer: Seat, gameVariant: GameVariant = "yonma"): Seat {
  const activeTurnOrder = getActiveTurnOrder(getPlayerCountFromVariant(gameVariant));
  const dealerIndex = activeTurnOrder.indexOf(dealer);
  return activeTurnOrder[(dealerIndex + 1) % activeTurnOrder.length] ?? "south";
}

function createDerivedPatch(
  data: ScoringPageData
): Pick<
  ScoringPageData,
  | "tableSeats"
  | "activeThemeName"
  | "themeOptions"
  | "gameVariantText"
  | "roundIndexLabels"
  | "seatLabels"
  | "meldTypeOptions"
  | "winnerChoiceRows"
  | "discarderChoiceRows"
  | "liabilityChoiceRows"
  | "playerNameRows"
  | "tenpaiRows"
  | "riichiStateOptions"
  | "timingConditionOptions"
  | "openingYakumanOptions"
  | "bonusConditionOptions"
  | "handSlotViews"
  | "winningTileCandidates"
  | "handTileRows"
  | "meldGroupViews"
  | "melds"
  | "meldRows"
  | "doraSlotViews"
  | "uraDoraSlotViews"
  | "doraTileRows"
  | "summaryRows"
  | "situationAnalysis"
  | "tableCenterLines"
  | "recordRows"
  | "confirmationLines"
  | "multiRonStatusText"
  | "multiRonCurrentLabel"
  | "multiRonConfirmText"
  | "canShuffleOnlineSeats"
> {
  const inferredMelds = inferMeldsFromAllTypeDrafts(data);
  const inferredMeldRows = createMeldRows(inferredMelds);
  const dataWithInferredMelds = {
    ...data,
    melds: inferredMelds,
    meldRows: inferredMeldRows
  };

  return {
    activeThemeName: getThemeById(data.activeThemeId).name,
    themeOptions: createThemeOptionViews(data),
    gameVariantText: GAME_VARIANT_LABELS[data.gameVariant],
    roundIndexLabels: createRoundIndexLabels(data.gameVariant),
    seatLabels: getActiveSeatsForData(data).map((seat) =>
      getPlayerNameFromMap(data.playerNames, seat)
    ),
    meldTypeOptions: createMeldTypeOptions(data),
    tableSeats: createTableSeats(data),
    winnerChoiceRows: createWinnerChoiceRows(data),
    discarderChoiceRows: createDiscarderChoiceRows(data),
    liabilityChoiceRows: createLiabilityChoiceRows(data),
    playerNameRows: createPlayerNameRows(
      data.playerNames,
      data.dealer,
      getActiveSeatsForData(data),
      data.gameVariant
    ),
    tenpaiRows: createTenpaiRows(data.tenpaiSeats, data.playerNames, getActiveSeatsForData(data)),
    riichiStateOptions: createRiichiStateOptions(data.conditionOptions),
    timingConditionOptions: createTimingConditionOptions(data.conditionOptions, data),
    openingYakumanOptions: createOpeningYakumanOptions(data.conditionOptions),
    bonusConditionOptions: createBonusConditionOptions(data.conditionOptions),
    handSlotViews: createHandSlotViews(
      data.concealedTiles,
      data.activeTileArea,
      data.activeDoraIndex
    ),
    winningTileCandidates: createWinningTileCandidateViews(dataWithInferredMelds),
    handTileRows: createHandTileRows(data),
    meldGroupViews: createMeldGroupViews(
      data.meldDraftTiles,
      data.meldKanTypes,
      MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key,
      data.activeTileArea,
      data.activeDoraIndex
    ),
    melds: inferredMelds,
    meldRows: inferredMeldRows,
    doraSlotViews: createDoraSlotViews(
      data.doraIndicators,
      data.activeTileArea,
      data.activeDoraIndex,
      "doraIndicators"
    ),
    uraDoraSlotViews: createDoraSlotViews(
      data.uraDoraIndicators,
      data.activeTileArea,
      data.activeDoraIndex,
      "uraDoraIndicators"
    ),
    doraTileRows: createDoraTileRows(data),
    summaryRows: createSummaryRows(dataWithInferredMelds),
    situationAnalysis: createSituationAnalysisView(dataWithInferredMelds),
    tableCenterLines: createTableCenterLines(dataWithInferredMelds),
    recordRows: createRecordRows(data.settlementRecords, data.playerNames),
    confirmationLines: createConfirmationLines(dataWithInferredMelds),
    multiRonStatusText: createMultiRonStatusText(data),
    multiRonCurrentLabel: data.multiRonProgress
      ? getPlayerName(data, data.multiRonProgress.currentWinner)
      : "",
    multiRonConfirmText:
      data.multiRonProgress &&
      data.multiRonProgress.completedWins.length + 1 < data.multiRonProgress.winners.length
        ? "继续结算下一名"
        : "确认结算",
    canShuffleOnlineSeats: canShuffleOnlineSeats(data)
  };
}

function createTileAreaPatch(
  data: ScoringPageData,
  area: TileArea,
  index: number,
  value: TileSlotValue
): Partial<ScoringPageData> {
  const current = data[area] as TileSlotValue[];
  const next = current.map((tile, tileIndex) => (tileIndex === index ? value : tile));

  return { [area]: next } as Partial<ScoringPageData>;
}

function createSequentialTileFillPatch(
  data: ScoringPageData,
  area: DirectTileArea,
  index: number,
  value: TileSlotValue
): Partial<ScoringPageData> {
  const current = data[area] as TileSlotValue[];
  const next = current.map((tile, tileIndex) => (tileIndex === index ? value : tile));
  const maxIndex = Math.max(current.length - 1, 0);
  const nextIndex = findNextEmptyIndex(next, index, Math.min(index + 1, maxIndex));

  if (area === "doraIndicators" && nextIndex === index && !next.includes("")) {
    const firstUraDoraEmptyIndex = data.uraDoraIndicators.findIndex((tile) => tile === "");

    return {
      doraIndicators: next,
      activeTileArea: "uraDoraIndicators",
      activeDoraIndex: firstUraDoraEmptyIndex >= 0 ? firstUraDoraEmptyIndex : 0
    };
  }

  return {
    [area]: next,
    activeDoraIndex: nextIndex
  } as Partial<ScoringPageData>;
}

function createConcealedTileFillPatch(
  data: ScoringPageData,
  index: number,
  value: Tile
): Partial<ScoringPageData> {
  const wasFullBefore = compactTiles(data.concealedTiles).length === data.concealedTiles.length;
  const replaced = data.concealedTiles.map((tile, tileIndex) =>
    tileIndex === index ? value : tile
  );
  const sortedTiles = compactTiles(replaced).sort(compareTiles);
  const concealedTiles = [
    ...sortedTiles,
    ...createSlots(data.concealedTiles.length - sortedTiles.length)
  ];
  const nextEmptyIndex = concealedTiles.findIndex((tile) => tile === "");
  const winningTile = createAutoWinningTilePatch(concealedTiles, data);

  if (wasFullBefore) {
    return {
      concealedTiles,
      winningTile,
      activeTileArea: "concealedTiles",
      activeDoraIndex: Math.min(index, concealedTiles.length - 1)
    };
  }

  if (nextEmptyIndex >= 0) {
    return {
      concealedTiles,
      winningTile,
      activeTileArea: "concealedTiles",
      activeDoraIndex: nextEmptyIndex
    };
  }

  return {
    concealedTiles,
    winningTile,
    activeTileArea: "concealedTiles",
    activeDoraIndex: Math.max(concealedTiles.length - 1, 0)
  };
}

function createHandTileClearPatch(
  data: ScoringPageData,
  area: "concealedTiles" | "winningTile",
  index: number
): Partial<ScoringPageData> {
  if (area === "winningTile") {
    return {
      ...createTileAreaPatch(data, area, 0, ""),
      activeTileArea: area,
      activeDoraIndex: 0
    };
  }

  const nextTiles = data.concealedTiles.map((tile, tileIndex) => (tileIndex === index ? "" : tile));
  const sortedTiles = compactTiles(nextTiles).sort(compareTiles);
  const concealedTiles = [
    ...sortedTiles,
    ...createSlots(data.concealedTiles.length - sortedTiles.length)
  ];
  const nextEmptyIndex = concealedTiles.findIndex((tile) => tile === "");

  return {
    concealedTiles,
    winningTile: createAutoWinningTilePatch(concealedTiles, data),
    activeTileArea: area,
    activeDoraIndex:
      nextEmptyIndex >= 0 ? nextEmptyIndex : Math.min(index, concealedTiles.length - 1)
  };
}

function createAutoWinningTilePatch(
  concealedTiles: readonly TileSlotValue[],
  data: ScoringPageData
): TileSlotValue[] {
  const candidates = findWinningTileCandidates(concealedTiles, inferMeldsFromAllTypeDrafts(data));
  const current = data.winningTile[0];

  if (current && candidates.includes(current)) {
    return [current];
  }

  return candidates.length === 1 ? [candidates[0]] : createSlots(1);
}

function createMeldTileFillPatch(
  data: ScoringPageData,
  index: number,
  value: Tile
): Partial<ScoringPageData> {
  const type = MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key;
  const normalizedIndex = isThreeTileMeldType(type) && index % 4 === 3 ? index - 3 : index;
  const groupIndex = Math.floor(normalizedIndex / 4);
  const groupStart = groupIndex * 4;
  const row = sanitizeMeldDraftTilesForType(
    data.meldDraftTiles.slice(groupStart, groupStart + 4),
    type
  );

  if (compactTiles(row).length === 0 && countOccupiedMeldDraftGroups(data) >= 4) {
    return {
      errors: ["鸣牌最多支持 4 组，请先清空一组再添加"]
    };
  }

  const quickTiles = shouldQuickFillMeldGroup(row, normalizedIndex, groupStart)
    ? createQuickMeldTiles(type, value)
    : undefined;

  if (quickTiles) {
    const meldDraftTiles = data.meldDraftTiles.map((tile, tileIndex) => {
      if (tileIndex < groupStart || tileIndex >= groupStart + 4) {
        return tile;
      }

      return quickTiles[tileIndex - groupStart] ?? "";
    });
    const meldKanTypes = data.meldKanTypes.map((currentType, typeIndex) =>
      typeIndex === groupIndex && isKanMeldType(type) ? type : currentType
    );
    const meldDraftTilesByType = createMeldDraftTileMapWithActive(data, meldDraftTiles);
    const meldKanTypesByType = createMeldDraftKanTypeMapWithActive(data, meldKanTypes);
    const nextGroupStart = Math.min(groupStart + 4, data.meldDraftTiles.length - 1);

    return {
      meldDraftTiles,
      meldKanTypes,
      meldDraftTilesByType,
      meldKanTypesByType,
      winningTile: createAutoWinningTilePatch(data.concealedTiles, {
        ...data,
        meldDraftTiles,
        meldKanTypes,
        meldDraftTilesByType,
        meldKanTypesByType
      }),
      activeTileArea: "meldDraftTiles",
      activeDoraIndex: isThreeTileMeldType(type)
        ? nextGroupStart
        : findNextEmptyIndex(meldDraftTiles, groupStart + quickTiles.length - 1, nextGroupStart),
      errors: []
    };
  }

  const patch = createSequentialTileFillPatch(data, "meldDraftTiles", normalizedIndex, value);
  const meldDraftTiles = sanitizeMeldDraftTilesForType(
    (patch.meldDraftTiles ?? data.meldDraftTiles) as TileSlotValue[],
    type
  );
  const activeDoraIndex = normalizeMeldActiveIndex(
    (patch.activeDoraIndex ?? normalizedIndex) as number,
    type,
    meldDraftTiles.length
  );
  const meldDraftTilesByType = createMeldDraftTileMapWithActive(data, meldDraftTiles);

  return {
    ...patch,
    activeDoraIndex,
    meldDraftTilesByType,
    errors: [],
    winningTile: createAutoWinningTilePatch(data.concealedTiles, {
      ...data,
      ...patch,
      activeDoraIndex,
      meldDraftTiles,
      meldDraftTilesByType
    })
  };
}

function createQuickMeldTiles(type: MeldType, tile: Tile): TileSlotValue[] | undefined {
  const repeatedTiles = createRepeatedMeldTiles(tile, isKanMeldType(type) ? 4 : 3);

  if (type === "pon") {
    return [...repeatedTiles, ""];
  }

  if (isKanMeldType(type)) {
    return repeatedTiles;
  }

  if (type !== "chi") {
    return undefined;
  }

  const normalized = normalizeRedTile(tile);

  if (!isNumberTile(normalized)) {
    return undefined;
  }

  const rank = Number(normalized[0]);
  const suit = normalized[1] as NumberSuit;
  const startRank = Math.min(Math.max(rank, 1), 7);

  return ([startRank, startRank + 1, startRank + 2] as const).map((nextRank) => {
    if (nextRank === 5 && isRedTile(tile)) {
      return tile;
    }

    return `${nextRank}${suit}` as Tile;
  });
}

function shouldQuickFillMeldGroup(
  row: readonly TileSlotValue[],
  index: number,
  groupStart: number
): boolean {
  return compactTiles(row).length === 0 || index === groupStart;
}

function createRepeatedMeldTiles(tile: Tile, count: 3 | 4): Tile[] {
  const normalized = normalizeRedTile(tile);
  const tiles = Array.from({ length: count }, () => normalized);

  if (isRedTile(tile)) {
    return [tile, ...tiles.slice(1)];
  }

  if (count === 4) {
    const redFiveTile = createRedFiveTile(normalized);

    if (redFiveTile) {
      return [redFiveTile, ...tiles.slice(1)];
    }
  }

  return tiles;
}

function createRedFiveTile(tile: BaseTile): Tile | undefined {
  if (tile === "5m") {
    return "red5m";
  }

  if (tile === "5p") {
    return "red5p";
  }

  if (tile === "5s") {
    return "red5s";
  }

  return undefined;
}

function isKanMeldType(type: MeldType): type is KanMeldType {
  return type === "minkan" || type === "ankan" || type === "kakan";
}

function isThreeTileMeldType(type: MeldType): boolean {
  return type === "chi" || type === "pon";
}

function normalizeMeldActiveIndex(index: number, type: MeldType, length: number): number {
  if (!isThreeTileMeldType(type) || index % 4 !== 3) {
    return Math.max(0, Math.min(index, length - 1));
  }

  return Math.max(0, Math.min(index + 1, length - 1));
}

function findNextEmptyIndex(
  tiles: readonly TileSlotValue[],
  currentIndex: number,
  fallbackIndex: number
): number {
  const nextEmptyIndex = tiles.findIndex(
    (tile, tileIndex) => tileIndex > currentIndex && tile === ""
  );

  if (nextEmptyIndex >= 0) {
    return nextEmptyIndex;
  }

  return Math.max(0, Math.min(fallbackIndex, tiles.length - 1));
}

function createSlots(length: number): TileSlotValue[] {
  return Array.from({ length }, () => "");
}

function createEmptyMeldDraftTileMap(): MeldDraftTileMap {
  return MELD_TYPE_OPTIONS.reduce<MeldDraftTileMap>(
    (acc, option) => ({
      ...acc,
      [option.key]: createSlots(16)
    }),
    {} as MeldDraftTileMap
  );
}

function createEmptyMeldDraftKanTypeMap(): MeldDraftKanTypeMap {
  return MELD_TYPE_OPTIONS.reduce<MeldDraftKanTypeMap>(
    (acc, option) => ({
      ...acc,
      [option.key]: ["", "", "", ""]
    }),
    {} as MeldDraftKanTypeMap
  );
}

function getSelectedMeldType(data: Pick<ScoringPageData, "selectedMeldTypeIndex">): MeldType {
  return MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key;
}

function createMeldDraftTileMapWithActive(
  data: ScoringPageData,
  meldDraftTiles: readonly TileSlotValue[] = data.meldDraftTiles
): MeldDraftTileMap {
  const type = getSelectedMeldType(data);

  return {
    ...data.meldDraftTilesByType,
    [type]: sanitizeMeldDraftTilesForType(meldDraftTiles, type)
  };
}

function createMeldDraftKanTypeMapWithActive(
  data: ScoringPageData,
  meldKanTypes: ReadonlyArray<KanMeldType | ""> = data.meldKanTypes
): MeldDraftKanTypeMap {
  const type = getSelectedMeldType(data);

  return {
    ...data.meldKanTypesByType,
    [type]: sanitizeMeldKanTypesForType(meldKanTypes, type)
  };
}

function createActiveMeldDraftState(data: ScoringPageData): {
  meldDraftTilesByType: MeldDraftTileMap;
  meldKanTypesByType: MeldDraftKanTypeMap;
} {
  const meldDraftTilesByType = createMeldDraftTileMapWithActive(data);
  const meldKanTypesByType = createMeldDraftKanTypeMapWithActive(data);

  return {
    meldDraftTilesByType: sanitizeMeldDraftTileMap(meldDraftTilesByType),
    meldKanTypesByType: sanitizeMeldKanTypeMap(meldKanTypesByType)
  };
}

function cloneMeldDraftTileMap(map: MeldDraftTileMap): MeldDraftTileMap {
  return MELD_TYPE_OPTIONS.reduce<MeldDraftTileMap>(
    (acc, option) => ({
      ...acc,
      [option.key]: [...map[option.key]]
    }),
    {} as MeldDraftTileMap
  );
}

function cloneMeldDraftKanTypeMap(map: MeldDraftKanTypeMap): MeldDraftKanTypeMap {
  return MELD_TYPE_OPTIONS.reduce<MeldDraftKanTypeMap>(
    (acc, option) => ({
      ...acc,
      [option.key]: [...map[option.key]]
    }),
    {} as MeldDraftKanTypeMap
  );
}

function sanitizeMeldDraftTileMap(map: MeldDraftTileMap): MeldDraftTileMap {
  return MELD_TYPE_OPTIONS.reduce<MeldDraftTileMap>(
    (acc, option) => ({
      ...acc,
      [option.key]: sanitizeMeldDraftTilesForType(map[option.key], option.key)
    }),
    {} as MeldDraftTileMap
  );
}

function sanitizeMeldKanTypeMap(map: MeldDraftKanTypeMap): MeldDraftKanTypeMap {
  return MELD_TYPE_OPTIONS.reduce<MeldDraftKanTypeMap>(
    (acc, option) => ({
      ...acc,
      [option.key]: sanitizeMeldKanTypesForType(map[option.key], option.key)
    }),
    {} as MeldDraftKanTypeMap
  );
}

function sanitizeMeldDraftTilesForType(
  tiles: readonly TileSlotValue[],
  type: MeldType
): TileSlotValue[] {
  if (!isThreeTileMeldType(type)) {
    return [...tiles];
  }

  return tiles.map((tile, index) => (index % 4 === 3 ? "" : tile));
}

function sanitizeMeldKanTypesForType(
  kanTypes: ReadonlyArray<KanMeldType | "">,
  type: MeldType
): Array<KanMeldType | ""> {
  return isKanMeldType(type) ? [...kanTypes] : ["", "", "", ""];
}

function createDoraNumberTiles(suit: "m" | "p" | "s"): DoraTileOption[] {
  return ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => ({
    tile: `${rank}${suit}`,
    label: `${rank}`
  }));
}

function createNumberTilesWithRed(suit: "m" | "p" | "s"): DoraTileOption[] {
  return [
    ...createDoraNumberTiles(suit),
    {
      tile: `red5${suit}`,
      label: "0"
    } as DoraTileOption
  ];
}

function createHandTileRows(data: ScoringPageData): DoraTileRow[] {
  return HAND_TILE_ROWS.map((row) => ({
    ...row,
    tiles: row.tiles.map((option) => ({
      ...option,
      disabled: isHandTileDisabled(data, option.tile),
      suggested: isSuggestedTile(data, option.tile)
    }))
  }));
}

function createDoraTileRows(data: ScoringPageData): DoraTileRow[] {
  return DORA_TILE_ROWS.map((row) => ({
    ...row,
    tiles: row.tiles.map((option) => ({
      ...option,
      disabled: isDoraTileDisabled(data, option.tile)
    }))
  }));
}

function isHandTileDisabled(data: ScoringPageData, tile: Tile): boolean {
  if (isSanmaRemovedManzuTile(data, tile)) {
    return true;
  }

  if (isDoraArea(data.activeTileArea)) {
    return isDoraTileDisabled(data, tile);
  }

  if (data.activeTileArea === "meldDraftTiles" && isAddingNewMeldGroupBlocked(data)) {
    return true;
  }

  const counts = createInputTileCounts(
    data,
    shouldQuickFillActiveMeldGroup(data) ? createActiveMeldGroupRef(data) : undefined
  );
  const tilesToFill = createTileFillPreview(data, tile);
  const normalizedFillCounts = tilesToFill.reduce<Partial<Record<BaseTile, number>>>(
    (acc, fillTile) => {
      const normalized = normalizeRedTile(fillTile);

      acc[normalized] = (acc[normalized] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const redFillCounts = tilesToFill
    .filter(isRedTile)
    .reduce<Partial<Record<Tile, number>>>((acc, fillTile) => {
      acc[fillTile] = (acc[fillTile] ?? 0) + 1;
      return acc;
    }, {});

  return (
    Object.entries(normalizedFillCounts).some(
      ([baseTile, fillCount]) => (counts.normalized[baseTile as BaseTile] ?? 0) + fillCount > 4
    ) ||
    Object.entries(redFillCounts).some(
      ([redTile, fillCount]) => (counts.red[redTile as Tile] ?? 0) + fillCount > 1
    )
  );
}

function isDoraTileDisabled(data: ScoringPageData, tile: Tile): boolean {
  if (isSanmaRemovedManzuTile(data, tile)) {
    return true;
  }

  if (data.activeTileArea !== "doraIndicators" && data.activeTileArea !== "uraDoraIndicators") {
    return false;
  }

  const activeArea = data.activeTileArea;
  const activeIndex = data.activeDoraIndex;
  const doraTiles = [
    ...collectCountedTiles(data.doraIndicators, data, "doraIndicators"),
    ...collectCountedTiles(data.uraDoraIndicators, data, "uraDoraIndicators")
  ];
  const counts = doraTiles.reduce<Partial<Record<BaseTile, number>>>((acc, currentTile) => {
    const normalized = normalizeRedTile(currentTile);

    acc[normalized] = (acc[normalized] ?? 0) + 1;
    return acc;
  }, {});
  const normalizedTile = normalizeRedTile(tile);
  const currentTile = data[activeArea][activeIndex];
  const replacingSameTile =
    currentTile !== "" && normalizeRedTile(currentTile) === normalizedTile ? 1 : 0;

  return (counts[normalizedTile] ?? 0) - replacingSameTile + 1 > 4;
}

function isSanmaRemovedManzuTile(data: ScoringPageData, tile: Tile): boolean {
  return getPlayerCountForData(data) === 3 && isRemovedManzuTileForSanma(data.gameVariant, tile);
}

function isRemovedManzuTileForSanma(gameVariant: GameVariant, tile: Tile): boolean {
  return gameVariant === "sanma" && /^([2-8]m|red5m)$/.test(tile);
}

function createTileFillPreview(data: ScoringPageData, tile: Tile): Tile[] {
  if (data.activeTileArea !== "meldDraftTiles") {
    return [normalizeDirectTileValue(data.activeTileArea, tile)];
  }

  const selectedMeldType = MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key;
  const activeIndex =
    isThreeTileMeldType(selectedMeldType) && data.activeDoraIndex % 4 === 3
      ? data.activeDoraIndex - 3
      : data.activeDoraIndex;
  const groupStart = Math.floor(activeIndex / 4) * 4;
  const row = data.meldDraftTiles.slice(groupStart, groupStart + 4);
  const quickTiles = shouldQuickFillMeldGroup(row, activeIndex, groupStart)
    ? createQuickMeldTiles(selectedMeldType, tile)
    : undefined;

  return quickTiles ? compactTiles(quickTiles) : [tile];
}

function normalizeDirectTileValue(area: TileArea, tile: Tile): Tile {
  return isDoraArea(area) ? normalizeRedTile(tile) : tile;
}

function isAddingNewMeldGroupBlocked(data: ScoringPageData): boolean {
  const selectedMeldType = MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key;
  const activeIndex =
    isThreeTileMeldType(selectedMeldType) && data.activeDoraIndex % 4 === 3
      ? data.activeDoraIndex - 3
      : data.activeDoraIndex;
  const groupStart = Math.floor(activeIndex / 4) * 4;
  const row = sanitizeMeldDraftTilesForType(
    data.meldDraftTiles.slice(groupStart, groupStart + 4),
    selectedMeldType
  );

  return compactTiles(row).length === 0 && countOccupiedMeldDraftGroups(data) >= 4;
}

function isSuggestedTile(data: ScoringPageData, tile: Tile): boolean {
  if (data.activeTileArea !== "concealedTiles") {
    return false;
  }

  const compact = compactTiles(data.concealedTiles);

  if (compact.length < 2) {
    return false;
  }

  const normalized = normalizeRedTile(tile);
  const recent = compact.slice(-2).map(normalizeRedTile);

  if (!isNumberTile(normalized) || !recent.every(isNumberTile)) {
    return recent.every((recentTile) => recentTile === normalized);
  }

  const suit = normalized[1];
  const rank = Number(normalized[0]);
  const recentRanks = recent
    .filter((recentTile) => recentTile[1] === suit)
    .map((recentTile) => Number(recentTile[0]))
    .sort((a, b) => a - b);

  if (recentRanks.length < 2) {
    return false;
  }

  return (
    rank === recentRanks[0] - 1 ||
    rank === recentRanks[1] + 1 ||
    (recentRanks[1] - recentRanks[0] === 2 && rank === recentRanks[0] + 1)
  );
}

function createInputTileCounts(
  data: ScoringPageData,
  excludedMeldGroup?: MeldGroupRef
): {
  normalized: Partial<Record<BaseTile, number>>;
  red: Partial<Record<Tile, number>>;
} {
  const inputTiles = createCountedInputTiles(data, excludedMeldGroup);

  return inputTiles.reduce(
    (acc, tile) => {
      const normalized = normalizeRedTile(tile);

      acc.normalized[normalized] = (acc.normalized[normalized] ?? 0) + 1;

      if (isRedTile(tile)) {
        acc.red[tile] = (acc.red[tile] ?? 0) + 1;
      }

      return acc;
    },
    {
      normalized: {} as Partial<Record<BaseTile, number>>,
      red: {} as Partial<Record<Tile, number>>
    }
  );
}

function createCountedInputTiles(data: ScoringPageData, excludedMeldGroup?: MeldGroupRef): Tile[] {
  return [
    ...collectCountedTiles(data.concealedTiles, data, "concealedTiles"),
    ...collectCountedTiles(data.winningTile, data, "winningTile"),
    ...collectCountedMeldTiles(data, excludedMeldGroup)
  ];
}

function collectCountedMeldTiles(data: ScoringPageData, excludedMeldGroup?: MeldGroupRef): Tile[] {
  const { meldDraftTilesByType } = createActiveMeldDraftState(data);
  const activeMeldType = getSelectedMeldType(data);

  return MELD_TYPE_OPTIONS.flatMap((option) =>
    splitMeldDraftRows(meldDraftTilesByType[option.key]).flatMap((row, groupIndex) => {
      if (excludedMeldGroup?.type === option.key && excludedMeldGroup.groupIndex === groupIndex) {
        return [];
      }

      return row.filter((tile, slotIndex): tile is Tile => {
        const flatIndex = groupIndex * 4 + slotIndex;

        if (tile === "") {
          return false;
        }

        return !(
          data.activeTileArea === "meldDraftTiles" &&
          option.key === activeMeldType &&
          flatIndex === data.activeDoraIndex
        );
      });
    })
  );
}

function collectCountedTiles(
  tiles: readonly TileSlotValue[],
  data: ScoringPageData,
  area: DirectTileArea
): Tile[] {
  return tiles.filter((tile, tileIndex): tile is Tile => {
    if (tile === "") {
      return false;
    }

    return !(data.activeTileArea === area && tileIndex === data.activeDoraIndex);
  });
}

function createActiveMeldGroupRef(data: ScoringPageData): MeldGroupRef | undefined {
  if (data.activeTileArea !== "meldDraftTiles") {
    return undefined;
  }

  const type = MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key;
  const activeIndex =
    isThreeTileMeldType(type) && data.activeDoraIndex % 4 === 3
      ? data.activeDoraIndex - 3
      : data.activeDoraIndex;

  return {
    type,
    groupIndex: Math.floor(activeIndex / 4)
  };
}

function shouldQuickFillActiveMeldGroup(data: ScoringPageData): boolean {
  if (data.activeTileArea !== "meldDraftTiles") {
    return false;
  }

  const type = MELD_TYPE_OPTIONS[data.selectedMeldTypeIndex].key;
  const activeIndex =
    isThreeTileMeldType(type) && data.activeDoraIndex % 4 === 3
      ? data.activeDoraIndex - 3
      : data.activeDoraIndex;
  const groupStart = Math.floor(activeIndex / 4) * 4;
  const row = sanitizeMeldDraftTilesForType(
    data.meldDraftTiles.slice(groupStart, groupStart + 4),
    type
  );

  return shouldQuickFillMeldGroup(row, activeIndex, groupStart);
}

function createSeatBooleanMap(): Record<Seat, boolean> {
  return SEATS.reduce<Record<Seat, boolean>>(
    (acc, seat) => ({
      ...acc,
      [seat]: false
    }),
    {} as Record<Seat, boolean>
  );
}

function compactTiles(tiles: readonly TileSlotValue[]): Tile[] {
  return tiles.filter((tile): tile is Tile => tile !== "");
}

function createRoundLabel(roundWindIndex: number, roundIndex: number): string {
  return `${ROUND_WIND_LABELS[roundWindIndex]}${ROUND_INDEX_LABELS[roundIndex]}`;
}

function applyScoringNavigationTheme(themeId: ThemeId): void {
  const backgroundColor =
    themeId === "maple" ? "#542A24" : themeId === "benji" ? "#2F7255" : "#184C3A";

  wx.setNavigationBarColor({
    frontColor: "#ffffff",
    backgroundColor
  });
}

function createThemeOptionViews(
  data: Pick<ScoringPageData, "activeThemeId" | "membershipAccess" | "workbenchMode">
): ThemeOptionView[] {
  const mode = data.workbenchMode === "local" ? "local" : "online";

  return listThemesForMode(mode).map((theme) => ({
    id: theme.id,
    name: theme.name,
    description: THEME_PRESENTATION[theme.id].description,
    previewSrc: THEME_PRESENTATION[theme.id].previewSrc,
    accessText: theme.access === "vip" ? "会员" : "免费",
    selected: theme.id === data.activeThemeId,
    locked: !canAccessTheme(theme, data.membershipAccess.canUseVipThemes)
  }));
}

function parseNonNegativeInteger(value: string | number, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function getPlayerName(data: Pick<ScoringPageData, "playerNames">, seat: Seat): string {
  return getPlayerNameFromMap(data.playerNames, seat);
}

function getPlayerNameFromMap(playerNames: PlayerNames, seat: Seat): string {
  return playerNames[seat]?.trim() || DEFAULT_PLAYER_NAMES[seat];
}

function createPlayerNickname(playerNames: PlayerNames, seat: Seat): string {
  const rawName = playerNames[seat]?.trim() ?? "";

  if (!rawName || isDefaultLikePlayerName(rawName, seat)) {
    return "";
  }

  return rawName.slice(0, 1);
}

function loadPlayerNames(): PlayerNames {
  try {
    const stored = wx.getStorageSync(PLAYER_NAMES_STORAGE_KEY) as Partial<PlayerNames> | "";

    if (!stored || typeof stored !== "object") {
      return { ...DEFAULT_PLAYER_NAMES };
    }

    return SEATS.reduce<PlayerNames>(
      (names, seat) => ({
        ...names,
        [seat]: normalizeStoredPlayerName(stored[seat], seat)
      }),
      {} as PlayerNames
    );
  } catch {
    return { ...DEFAULT_PLAYER_NAMES };
  }
}

function savePlayerNames(playerNames: PlayerNames): void {
  try {
    wx.setStorageSync(PLAYER_NAMES_STORAGE_KEY, playerNames);
  } catch {
    // 本地存储失败不影响本局算点，当前页面状态仍会继续使用新名字。
  }
}

function loadPreferredTheme(): ThemeId {
  try {
    const stored = wx.getStorageSync(PREFERRED_THEME_STORAGE_KEY) as unknown;

    return stored === "benji" || stored === "maple" || stored === "classic"
      ? stored
      : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function savePreferredTheme(themeId: ThemeId): void {
  try {
    wx.setStorageSync(PREFERRED_THEME_STORAGE_KEY, themeId);
  } catch {
    // 皮肤偏好保存失败不影响当前页面继续使用所选皮肤。
  }
}

function loadOnlineProfile(): { displayName: string; avatarUrl: string } {
  try {
    const stored = wx.getStorageSync(ONLINE_PROFILE_STORAGE_KEY) as
      | { displayName?: unknown; avatarUrl?: unknown }
      | "";

    if (!stored || typeof stored !== "object") {
      return { displayName: "", avatarUrl: "" };
    }

    return {
      displayName: typeof stored.displayName === "string" ? stored.displayName.trim() : "",
      avatarUrl: typeof stored.avatarUrl === "string" ? stored.avatarUrl : ""
    };
  } catch {
    return { displayName: "", avatarUrl: "" };
  }
}

function saveOnlineProfile(profile: { displayName: string; avatarUrl: string }): void {
  try {
    wx.setStorageSync(ONLINE_PROFILE_STORAGE_KEY, {
      displayName: profile.displayName.trim(),
      avatarUrl: profile.avatarUrl
    });
  } catch {
    // 资料缓存失败不影响创建或加入房间。
  }
}

function loadActiveOnlineRoom(): { roomId: string; roomCode: string } | undefined {
  try {
    const stored = wx.getStorageSync(ACTIVE_ONLINE_ROOM_STORAGE_KEY) as
      | { roomId?: unknown; roomCode?: unknown }
      | "";

    if (!stored || typeof stored !== "object") {
      return undefined;
    }

    const roomId = typeof stored.roomId === "string" ? stored.roomId : "";
    const roomCode = typeof stored.roomCode === "string" ? normalizeRoomCode(stored.roomCode) : "";

    return roomId && roomCode ? { roomId, roomCode } : undefined;
  } catch {
    return undefined;
  }
}

function saveActiveOnlineRoom(room: OnlineRoom): void {
  try {
    wx.setStorageSync(ACTIVE_ONLINE_ROOM_STORAGE_KEY, {
      roomId: room.id,
      roomCode: room.roomCode
    });
  } catch {
    // 房间记忆失败不影响当前在线房间使用。
  }
}

function clearActiveOnlineRoom(): void {
  try {
    wx.removeStorageSync(ACTIVE_ONLINE_ROOM_STORAGE_KEY);
  } catch {
    // 清理失败不影响本次退出流程。
  }
}

function normalizeStoredPlayerName(value: unknown, seat: Seat): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed || isDefaultLikePlayerName(trimmed, seat)) {
    return "";
  }

  return trimmed.slice(0, 1);
}

function normalizePlayerNames(playerNames: PlayerNames): PlayerNames {
  return SEATS.reduce<PlayerNames>(
    (names, seat) => ({
      ...names,
      [seat]: normalizeStoredPlayerName(playerNames[seat], seat)
    }),
    {} as PlayerNames
  );
}

function isDefaultLikePlayerName(name: string, seat: Seat): boolean {
  return name === DEFAULT_PLAYER_NAMES[seat] || /^玩家[1-4]?$/.test(name) || name === "玩";
}

function createPointRows(
  playerPoints: PlayerPoints,
  playerNames: PlayerNames,
  activeSeats: readonly Seat[] = SEATS
): PointRow[] {
  return activeSeats.map((seat) => ({
    seat,
    label: playerNames[seat] || DEFAULT_PLAYER_NAMES[seat],
    points: playerPoints[seat]
  }));
}

function createPlayerNameRows(
  playerNames: PlayerNames,
  dealer: Seat,
  activeSeats: readonly Seat[] = SEATS,
  gameVariant: GameVariant = "yonma"
): Array<{ seat: Seat; directionLabel: string; label: string; name: string; placeholder: string }> {
  return activeSeats.map((seat) => ({
    seat,
    directionLabel: createSeatWindLabelForVariant(seat, dealer, gameVariant),
    label: DEFAULT_PLAYER_NAMES[seat],
    name: createPlayerNickname(playerNames, seat),
    placeholder: DEFAULT_PLAYER_NAMES[seat]
  }));
}

function createWinnerChoiceRows(data: ScoringPageData): RoleChoiceView[] {
  return getActiveSeatsForData(data).map((seat) => {
    const selected =
      data.eventType === "ron" ? getRonWinners(data).includes(seat) : data.winner === seat;

    return {
      seat,
      label: getPlayerName(data, seat),
      selected,
      disabled: data.eventType === "ron" && data.discarder === seat,
      mark: selected ? (data.eventType === "tsumo" ? "摸" : "和") : ""
    };
  });
}

function createDiscarderChoiceRows(data: ScoringPageData): RoleChoiceView[] {
  return getActiveSeatsForData(data).map((seat) => {
    const selected = data.discarder === seat;

    return {
      seat,
      label: getPlayerName(data, seat),
      selected,
      disabled: data.eventType === "ron" && getRonWinners(data).includes(seat),
      mark: selected ? "铳" : ""
    };
  });
}

function createLiabilityChoiceRows(data: ScoringPageData): RoleChoiceView[] {
  const winnerSeats = new Set(getRonWinners(data));

  return getActiveSeatsForData(data).map((seat) => {
    const disabled = winnerSeats.has(seat);
    const selected = data.liabilitySeat === seat;

    return {
      seat,
      label: getPlayerName(data, seat),
      selected,
      disabled,
      mark: selected ? "包" : ""
    };
  });
}

function createMeldTypeOptions(data: ScoringPageData): Array<Option<MeldType>> {
  return MELD_TYPE_OPTIONS.map((option) => ({
    ...option,
    disabled: getPlayerCountForData(data) === 3 && option.key === "chi"
  }));
}

function createTableSeats(data: ScoringPageData): TableSeatView[] {
  const activeSeats = getActiveSeatsForData(data);
  const rankMap = createRankMap(data.playerPoints, activeSeats);
  const winners = getRonWinners(data);
  const currentWinner = getCurrentWinner(data);
  const useBenjiLayout = data.workbenchMode === "local" && data.activeThemeId === "benji";
  const useMapleLayout = data.activeThemeId === "maple";
  const useMapleLocalAvatars = data.workbenchMode === "local" && useMapleLayout;

  return (["north", "west", "east", "south"] as Seat[])
    .filter((seat) => activeSeats.includes(seat))
    .map((seat) => {
      const onlineMember = getOnlineSeatMember(data, seat);
      const isOnlineRoom = data.workbenchMode !== "local";
      const isEmptyOnlineSeat = isOnlineRoom && !onlineMember;

      return {
        seat,
        label: onlineMember?.displayName || getPlayerName(data, seat),
        directionLabel: createSeatWindLabelForVariant(
          seat,
          data.dealer,
          data.workbenchMode === "local" ? data.gameVariant : "yonma"
        ),
        avatarSrc: useBenjiLayout
          ? BENJI_PLAYER_AVATAR_SOURCES[seat]
          : createSeatAvatarSrc(seat, onlineMember),
        avatarClass: `seat-avatar-${seat}${onlineMember ? " seat-avatar-online-member" : ""}`,
        avatarSpriteClass: useMapleLocalAvatars ? MAPLE_PLAYER_SPRITE_CLASSES[seat] : "",
        avatarMode:
          data.activeThemeId !== "classic"
            ? onlineMember?.avatarUrl
              ? "aspectFill"
              : "aspectFit"
            : "widthFix",
        points: data.playerPoints[seat],
        rankText: `${rankMap[seat]} 位`,
        nickname: isEmptyOnlineSeat
          ? ""
          : createOnlineMemberNickname(onlineMember) ||
            createPlayerNickname(data.playerNames, seat),
        onlineStatusText: isEmptyOnlineSeat ? "邀请好友" : "",
        statusBadges: createSeatStatusBadges(data, seat),
        className: [
          `seat-${seat}`,
          useBenjiLayout ? "is-benji-seat" : "",
          useMapleLayout ? "is-maple-seat" : "",
          isEmptyOnlineSeat ? "is-empty-online-seat" : "",
          seat === data.dealer ? "is-dealer" : "",
          data.eventType === "tsumo" && seat === data.winner ? "is-winner" : "",
          data.eventType === "ron" && winners.includes(seat) ? "is-winner" : "",
          data.eventType === "ron" && seat === currentWinner ? "is-current-winner" : "",
          data.eventType === "ron" && seat === data.discarder ? "is-discarder" : "",
          data.riichiSeats[seat] ? "is-riichi" : ""
        ]
          .filter(Boolean)
          .join(" ")
      };
    });
}

function getOnlineSeatMember(data: ScoringPageData, seat: Seat): RoomMemberRef | undefined {
  return data.onlineRoomSeatMap?.[seat];
}

function isEmptyOnlineSeat(data: ScoringPageData, seat: Seat): boolean {
  return data.workbenchMode !== "local" && !getOnlineSeatMember(data, seat);
}

function canShuffleOnlineSeats(data: ScoringPageData): boolean {
  return (
    data.workbenchMode === "room-host" &&
    countOnlineRoomMembers(data.onlineRoomSeatMap) === SEATS.length
  );
}

function countOnlineRoomMembers(seatMap: Partial<RoomSeatMap>): number {
  return SEATS.filter((seat) => Boolean(seatMap?.[seat])).length;
}

function createOnlineMemberNickname(member: RoomMemberRef | undefined): string {
  return createNicknameInitial(member?.displayName);
}

function createSeatAvatarSrc(seat: Seat, member: RoomMemberRef | undefined): string {
  const avatarUrl = member?.avatarUrl?.trim() || "";

  return isShareableAvatarUrl(avatarUrl) ? avatarUrl : PLAYER_AVATAR_SOURCES[seat];
}

async function prepareOnlineProfileAvatar(page: ScoringPageInstance): Promise<string | undefined> {
  const avatarUrl = page.data.onlineProfileAvatarUrl.trim();

  if (!avatarUrl) {
    return undefined;
  }
  if (isShareableAvatarUrl(avatarUrl)) {
    return avatarUrl;
  }
  if (!isUploadableAvatarUrl(avatarUrl)) {
    return undefined;
  }

  page.setData({ onlineRoomStatusText: "正在上传头像..." });

  try {
    const uploadedAvatarUrl = await uploadOnlineProfileAvatar(avatarUrl);

    page.setData({
      onlineProfileAvatarUrl: uploadedAvatarUrl,
      onlineRoomStatusText: ""
    });
    saveOnlineProfile({
      displayName: page.data.onlineProfileName,
      avatarUrl: uploadedAvatarUrl
    });

    return uploadedAvatarUrl;
  } catch {
    page.setData({ onlineRoomStatusText: "头像上传失败，将使用默认头像" });
    return undefined;
  }
}

function uploadOnlineProfileAvatar(filePath: string): Promise<string> {
  if (!wx.cloud?.uploadFile) {
    return Promise.reject(new Error("当前环境不支持上传头像"));
  }

  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath: createOnlineProfileAvatarCloudPath(filePath),
      filePath,
      success: (result) => resolve(result.fileID),
      fail: reject
    });
  });
}

function createOnlineProfileAvatarCloudPath(filePath: string): string {
  const extension = inferAvatarFileExtension(filePath);
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `online-avatars/${Date.now()}-${randomPart}.${extension}`;
}

function inferAvatarFileExtension(filePath: string): string {
  const matchedExtension = filePath.toLowerCase().match(/\.([a-z0-9]+)(?:[?#].*)?$/)?.[1] || "";

  return ["jpg", "jpeg", "png", "webp"].includes(matchedExtension) ? matchedExtension : "jpg";
}

function createBackendAvatarUrl(avatarUrl: string): string | undefined {
  const normalizedAvatarUrl = avatarUrl.trim();

  return isShareableAvatarUrl(normalizedAvatarUrl) ? normalizedAvatarUrl : undefined;
}

function isUploadableAvatarUrl(avatarUrl: string): boolean {
  return Boolean(avatarUrl) && !isShareableAvatarUrl(avatarUrl);
}

function isShareableAvatarUrl(avatarUrl: string): boolean {
  return (
    avatarUrl.startsWith("https://") ||
    avatarUrl.startsWith("cloud://") ||
    avatarUrl.startsWith("/assets/")
  );
}

function createOnlineRoomSeatOptions(
  selectedSeat: Seat,
  dealer: Seat = "east"
): OnlineRoomSeatOption[] {
  return SEATS.map((displayWind) => findSeatByDisplayWind(displayWind, dealer)).map((seat) => ({
    seat,
    label: createSeatWindLabel(seat, dealer),
    selected: seat === selectedSeat
  }));
}

function findSeatByDisplayWind(displayWind: Seat, dealer: Seat): Seat {
  return (
    SEATS.find(
      (seat) => createSeatWindLabel(seat, dealer) === SEAT_DIRECTION_LABELS[displayWind]
    ) || displayWind
  );
}

function createOnlineDisplayName(profileName: string, fallbackName: string): string {
  return profileName.trim() || fallbackName;
}

function createNicknameInitial(name: string | undefined): string {
  const trimmed = name?.trim() || "";
  const firstVisibleChar = Array.from(trimmed).find((char) => /[\p{L}\p{N}]/u.test(char));

  return firstVisibleChar || "";
}

function createSeatWindLabel(seat: Seat, dealer: Seat): string {
  const dealerIndex = TURN_ORDER.indexOf(dealer);
  const seatIndex = TURN_ORDER.indexOf(seat);
  const relativeIndex = (seatIndex - dealerIndex + TURN_ORDER.length) % TURN_ORDER.length;
  const seatWind = SEATS[relativeIndex];

  return SEAT_DIRECTION_LABELS[seatWind];
}

function createSeatWindLabelForVariant(
  seat: Seat,
  dealer: Seat,
  gameVariant: GameVariant = "yonma"
): string {
  return gameVariant === "sanma" ? SEAT_DIRECTION_LABELS[seat] : createSeatWindLabel(seat, dealer);
}

function createSeatWindLabelForPlayerCount(
  seat: Seat,
  dealer: Seat,
  playerCount: PlayerCount = 4
): string {
  return playerCount === 3 ? SEAT_DIRECTION_LABELS[seat] : createSeatWindLabel(seat, dealer);
}

function createRankMap(
  playerPoints: PlayerPoints,
  activeSeats: readonly Seat[] = SEATS
): Record<Seat, number> {
  return [...activeSeats]
    .sort((left, right) => {
      const pointDiff = playerPoints[right] - playerPoints[left];

      return pointDiff || activeSeats.indexOf(left) - activeSeats.indexOf(right);
    })
    .reduce<Record<Seat, number>>(
      (rankMap, seat, index) => ({
        ...rankMap,
        [seat]: index + 1
      }),
      {} as Record<Seat, number>
    );
}

function createSeatStatusBadges(
  data: ScoringPageData,
  seat: Seat
): Array<{ type: string; label: string }> {
  const badges: Array<{ type: string; label: string }> = [];

  if (seat === data.dealer) {
    badges.push({ type: "dealer", label: "亲" });
  }

  if (data.eventType === "ron" && seat === data.winner) {
    badges.push({ type: "winner", label: "和" });
  } else if (data.eventType === "ron" && getRonWinners(data).includes(seat)) {
    badges.push({ type: "winner", label: seat === getCurrentWinner(data) ? "和" : "待" });
  }

  if (data.eventType === "tsumo" && seat === data.winner) {
    badges.push({ type: "winner", label: "摸" });
  }

  if (data.eventType === "ron" && seat === data.discarder) {
    badges.push({ type: "discarder", label: "铳" });
  }

  if (data.eventType === "draw" && data.tenpaiSeats[seat]) {
    badges.push({ type: "tenpai", label: "听" });
  }

  return badges;
}

function createTenpaiRows(
  tenpaiSeats: Record<Seat, boolean>,
  playerNames: PlayerNames,
  activeSeats: readonly Seat[] = SEATS
): TenpaiRow[] {
  return activeSeats.map((seat) => ({
    seat,
    label: playerNames[seat] || DEFAULT_PLAYER_NAMES[seat],
    checked: tenpaiSeats[seat]
  }));
}

function createDoraSlotViews(
  tiles: readonly TileSlotValue[],
  activeArea: TileArea,
  activeIndex: number,
  area: DoraArea
): DoraSlotView[] {
  return tiles.map((tile, index) => ({
    index,
    tile,
    label: tile ? getTileDisplayName(tile) : "",
    active: activeArea === area && activeIndex === index
  }));
}

function createHandSlotViews(
  concealedTiles: readonly TileSlotValue[],
  activeArea: TileArea,
  activeIndex: number
): HandSlotView[] {
  return concealedTiles.map((tile, index) => ({
    area: "concealedTiles" as const,
    index,
    tile,
    label: tile ? getTileDisplayName(tile) : "",
    active: activeArea === "concealedTiles" && activeIndex === index
  }));
}

function createWinningTileCandidateViews(data: ScoringPageData): WinningTileCandidateView[] {
  const selectedTile = data.winningTile[0];

  return findWinningTileCandidates(data.concealedTiles, data.melds).map((tile) => ({
    tile,
    label: getTileDisplayName(tile),
    selected: selectedTile === tile
  }));
}

function findWinningTileCandidates(
  concealedTiles: readonly TileSlotValue[],
  melds: readonly Meld[]
): Tile[] {
  const tiles = compactTiles(concealedTiles);
  const requiredConcealedCount = getRequiredConcealedTileCount(melds);

  if (tiles.length !== requiredConcealedCount) {
    return [];
  }

  const inputTiles = [...tiles, ...melds.flatMap((meld) => meld.tiles)];

  return WINNING_CANDIDATE_TILES.flatMap((tile) => {
    const normalized = normalizeRedTile(tile);
    const sameTileCount = inputTiles.filter(
      (currentTile) => normalizeRedTile(currentTile) === normalized
    ).length;

    if (sameTileCount >= 4 || !isCompleteWinningHand([...tiles, tile], melds.length)) {
      return [];
    }

    return createWinningCandidateVariants(tile, inputTiles);
  });
}

function createWinningCandidateVariants(tile: Tile, existingTiles: readonly Tile[]): Tile[] {
  const redFiveTile = createRedFiveTile(normalizeRedTile(tile));

  if (!redFiveTile || existingTiles.includes(redFiveTile)) {
    return [tile];
  }

  return [tile, redFiveTile];
}

function isCompleteWinningHand(tiles: readonly Tile[], meldCount: number): boolean {
  const counts = createBaseTileCountMap(tiles);

  if (meldCount === 0 && (isSevenPairs(counts) || isKokushi(counts))) {
    return true;
  }

  return isStandardHand(counts);
}

function createBaseTileCountMap(tiles: readonly Tile[]): Record<BaseTile, number> {
  const initialCounts = WINNING_CANDIDATE_TILES.reduce<Record<BaseTile, number>>(
    (acc, tile) => ({
      ...acc,
      [tile as BaseTile]: 0
    }),
    {} as Record<BaseTile, number>
  );

  return tiles.reduce<Record<BaseTile, number>>((acc, tile) => {
    const normalized = normalizeRedTile(tile);

    return {
      ...acc,
      [normalized]: acc[normalized] + 1
    };
  }, initialCounts);
}

function isSevenPairs(counts: Record<BaseTile, number>): boolean {
  return Object.values(counts).filter((count) => count === 2).length === 7;
}

function isKokushi(counts: Record<BaseTile, number>): boolean {
  const yaochuTiles: BaseTile[] = [
    "1m",
    "9m",
    "1p",
    "9p",
    "1s",
    "9s",
    "east",
    "south",
    "west",
    "north",
    "white",
    "green",
    "red"
  ];

  return (
    yaochuTiles.every((tile) => counts[tile] >= 1) && yaochuTiles.some((tile) => counts[tile] >= 2)
  );
}

function isStandardHand(counts: Record<BaseTile, number>): boolean {
  return WINNING_CANDIDATE_TILES.some((tile) => {
    const pairTile = tile as BaseTile;

    if (counts[pairTile] < 2) {
      return false;
    }

    const remainingCounts = { ...counts, [pairTile]: counts[pairTile] - 2 };

    return canSplitAllMelds(remainingCounts);
  });
}

function canSplitAllMelds(counts: Record<BaseTile, number>): boolean {
  const nextTile = WINNING_CANDIDATE_TILES.find((tile) => counts[tile as BaseTile] > 0) as
    | BaseTile
    | undefined;

  if (!nextTile) {
    return true;
  }

  if (counts[nextTile] >= 3) {
    const tripletCounts = { ...counts, [nextTile]: counts[nextTile] - 3 };

    if (canSplitAllMelds(tripletCounts)) {
      return true;
    }
  }

  if (!isNumberTile(nextTile)) {
    return false;
  }

  const rank = Number(nextTile[0]);
  const suit = nextTile[1] as NumberSuit;

  if (rank > 7) {
    return false;
  }

  const secondTile = `${rank + 1}${suit}` as BaseTile;
  const thirdTile = `${rank + 2}${suit}` as BaseTile;

  if (counts[secondTile] <= 0 || counts[thirdTile] <= 0) {
    return false;
  }

  return canSplitAllMelds({
    ...counts,
    [nextTile]: counts[nextTile] - 1,
    [secondTile]: counts[secondTile] - 1,
    [thirdTile]: counts[thirdTile] - 1
  });
}

function createMeldGroupViews(
  tiles: readonly TileSlotValue[],
  kanTypes: ReadonlyArray<KanMeldType | "">,
  selectedMeldType: MeldType,
  activeArea: TileArea,
  activeIndex: number
): MeldGroupView[] {
  return splitMeldDraftRows(sanitizeMeldDraftTilesForType(tiles, selectedMeldType)).map(
    (row, groupIndex) => {
      const compact = compactTiles(row);
      const kanType = kanTypes[groupIndex] ?? "";
      const visibleSlotCount = getVisibleMeldSlotCount(compact, kanType, selectedMeldType);

      return {
        index: groupIndex,
        title: `第 ${groupIndex + 1} 组`,
        slots: row.map((tile, slotIndex) => {
          const flatIndex = groupIndex * 4 + slotIndex;

          return {
            groupIndex,
            slotIndex,
            flatIndex,
            tile,
            label: tile ? getTileDisplayName(tile) : "",
            active: activeArea === "meldDraftTiles" && activeIndex === flatIndex
          };
        }),
        visibleSlotCount,
        inferredText: createMeldInferredText(compact, kanType),
        needsKanType: compact.length === 4 && isSameNormalizedTileSet(compact),
        kanType
      };
    }
  );
}

function getVisibleMeldSlotCount(
  tiles: readonly Tile[],
  kanType: KanMeldType | "",
  selectedMeldType: MeldType
): number {
  if (isThreeTileMeldType(selectedMeldType)) {
    return 3;
  }

  if (
    tiles.length >= 4 ||
    kanType ||
    selectedMeldType === "minkan" ||
    selectedMeldType === "ankan" ||
    selectedMeldType === "kakan"
  ) {
    return 4;
  }

  return 3;
}

function createMeldInferredText(tiles: readonly Tile[], kanType: KanMeldType | ""): string {
  if (tiles.length === 0) {
    return "未输入";
  }

  if (tiles.length < 3) {
    return `${tiles.length} 张，继续输入`;
  }

  if (tiles.length === 3) {
    const type = inferMeldType(tiles, "");

    if (type === "pon") {
      return "自动识别：碰";
    }

    if (type === "chi") {
      return "自动识别：吃";
    }

    return "无法推断为吃或碰";
  }

  if (tiles.length === 4 && isSameNormalizedTileSet(tiles)) {
    return kanType
      ? `杠：${KAN_TYPE_OPTIONS.find((option) => option.key === kanType)?.label ?? ""}`
      : "请选择杠类型";
  }

  return "4 张鸣牌必须相同";
}

function inferMeldsFromDraft(
  tiles: readonly TileSlotValue[],
  kanTypes: ReadonlyArray<KanMeldType | "">
): Meld[] {
  return splitMeldDraftRows(tiles).flatMap((row, groupIndex) => {
    const compact = compactTiles(row);
    const type = inferMeldType(compact, kanTypes[groupIndex] ?? "");

    if (!type) {
      return [];
    }

    const meld: Meld = {
      type,
      tiles: compact,
      open: type !== "ankan",
      calledTile: compact[0]
    };
    const validation = validateMeld(meld);

    return validation.valid ? [meld] : [];
  });
}

function inferMeldsFromAllTypeDrafts(data: ScoringPageData): Meld[] {
  const { meldDraftTilesByType, meldKanTypesByType } = createActiveMeldDraftState(data);

  return MELD_TYPE_OPTIONS.flatMap((option) =>
    inferMeldsFromDraft(meldDraftTilesByType[option.key], meldKanTypesByType[option.key])
  );
}

function countOccupiedMeldDraftGroups(data: ScoringPageData): number {
  const { meldDraftTilesByType } = createActiveMeldDraftState(data);

  return MELD_TYPE_OPTIONS.reduce((count, option) => {
    const rows = splitMeldDraftRows(meldDraftTilesByType[option.key]);

    return count + rows.filter((row) => compactTiles(row).length > 0).length;
  }, 0);
}

function inferMeldType(tiles: readonly Tile[], kanType: KanMeldType | ""): MeldType | undefined {
  if (tiles.length === 3) {
    if (isSameNormalizedTileSet(tiles)) {
      return "pon";
    }

    const chi: Meld = {
      type: "chi",
      tiles: [...tiles],
      open: true,
      calledTile: tiles[0]
    };

    return validateMeld(chi).valid ? "chi" : undefined;
  }

  if (tiles.length === 4 && kanType && isSameNormalizedTileSet(tiles)) {
    return kanType;
  }

  return undefined;
}

function splitMeldDraftRows(tiles: readonly TileSlotValue[]): TileSlotValue[][] {
  return Array.from({ length: 4 }, (_value, groupIndex) =>
    tiles.slice(groupIndex * 4, groupIndex * 4 + 4)
  );
}

function isSameNormalizedTileSet(tiles: readonly Tile[]): boolean {
  if (tiles.length === 0) {
    return false;
  }

  const firstTile = normalizeRedTile(tiles[0]);
  return tiles.every((tile) => normalizeRedTile(tile) === firstTile);
}

function createRiichiStateOptions(options: readonly Option<ConditionKey>[]): RiichiStateOption[] {
  const riichiState = getRiichiState(options);

  return [
    { key: "", label: "无", checked: riichiState === "" },
    { key: "riichi", label: "立直", checked: riichiState === "riichi" },
    { key: "doubleRiichi", label: "两立直", checked: riichiState === "doubleRiichi" }
  ];
}

function createTimingConditionOptions(
  options: readonly Option<ConditionKey>[],
  data?: Pick<ScoringPageData, "gameVariant" | "workbenchMode">
): Array<RadioOption<TimingConditionKey>> {
  const timingCondition = getTimingCondition(options);

  return TIMING_CONDITION_OPTIONS.map((option) => ({
    ...option,
    label: createTimingConditionLabel(option.key, data),
    checked: option.key === timingCondition
  }));
}

function createTimingConditionLabel(
  key: TimingConditionKey,
  data?: Pick<ScoringPageData, "gameVariant" | "workbenchMode">
): string {
  if (data && getPlayerCountForData(data) === 3 && key === "rinshan") {
    return "岭上/拔北岭上";
  }

  if (data && getPlayerCountForData(data) === 3 && key === "chankan") {
    return "抢杠/抢北";
  }

  return TIMING_CONDITION_OPTIONS.find((option) => option.key === key)?.label ?? "无";
}

function createOpeningYakumanOptions(
  options: readonly Option<ConditionKey>[]
): Array<RadioOption<OpeningYakumanKey>> {
  const openingYakuman = getOpeningYakuman(options);

  return OPENING_YAKUMAN_OPTIONS.map((option) => ({
    ...option,
    checked: option.key === openingYakuman
  }));
}

function createBonusConditionOptions(
  options: readonly Option<ConditionKey>[]
): Array<Option<ConditionKey>> {
  const riichiState = getRiichiState(options);
  const hasOpeningYakuman = getOpeningYakuman(options) !== "";

  return options
    .filter((option) => BONUS_CONDITION_KEYS.includes(option.key))
    .map((option) => ({
      ...option,
      checked: !hasOpeningYakuman && riichiState !== "" && Boolean(option.checked),
      disabled: hasOpeningYakuman || riichiState === ""
    }));
}

function getRiichiState(options: readonly Option<ConditionKey>[]): "" | "riichi" | "doubleRiichi" {
  if (options.some((option) => option.key === "doubleRiichi" && option.checked)) {
    return "doubleRiichi";
  }

  if (options.some((option) => option.key === "riichi" && option.checked)) {
    return "riichi";
  }

  return "";
}

function getTimingCondition(options: readonly Option<ConditionKey>[]): TimingConditionKey {
  const timingKeys: TimingConditionKey[] = ["haitei", "houtei", "rinshan", "chankan"];
  return (
    timingKeys.find((key) => options.some((option) => option.key === key && option.checked)) ?? ""
  );
}

function getOpeningYakuman(options: readonly Option<ConditionKey>[]): OpeningYakumanKey {
  if (options.some((option) => option.key === "tenhou" && option.checked)) {
    return "tenhou";
  }

  if (options.some((option) => option.key === "chiihou" && option.checked)) {
    return "chiihou";
  }

  return "";
}

function normalizeSceneConditions(
  options: Array<Option<ConditionKey>>
): Array<Option<ConditionKey>> {
  const openingYakuman = getOpeningYakuman(options);
  const riichiState = getRiichiState(options);
  const timingCondition = getTimingCondition(options);

  return options.map((option) => {
    if (openingYakuman !== "") {
      return {
        ...option,
        checked: option.key === openingYakuman
      };
    }

    if (option.key === "riichi" || option.key === "doubleRiichi") {
      return {
        ...option,
        checked: option.key === riichiState
      };
    }

    if (
      option.key === "haitei" ||
      option.key === "houtei" ||
      option.key === "rinshan" ||
      option.key === "chankan"
    ) {
      return {
        ...option,
        checked: option.key === timingCondition
      };
    }

    if (option.key === "ippatsu" || option.key === "enableUraDora") {
      return {
        ...option,
        checked:
          option.key === "enableUraDora" ? false : riichiState !== "" && Boolean(option.checked)
      };
    }

    return option;
  });
}

function createSummaryRows(data: ScoringPageData): SummaryRow[] {
  const rows: SummaryRow[] = [
    {
      key: "round-event",
      title: "本局事件",
      value: createEventSummary(data)
    },
    {
      key: "scene-yaku",
      title: "场面番型",
      value: createConditionSummary(data)
    },
    {
      key: "dora",
      title: "宝牌",
      value: createDoraSummary(data),
      tileSections: createDoraSummaryTileSections(data)
    },
    {
      key: "meld",
      title: "鸣牌",
      value:
        data.melds.length > 0
          ? `${data.melds.length} 组：${data.meldRows.map((row) => row.text).join("；")}`
          : "0 组",
      tileSections: createMeldSummaryTileSections(data)
    },
    {
      key: "hand",
      title: "手牌",
      value: createHandSummary(data),
      tileSections: createHandSummaryTileSections(data),
      valueTone: isHandCountOverLimit(data) ? "warning" : undefined
    }
  ];

  if (data.activeThemeId === "classic") {
    return rows;
  }

  return rows.map((row) => ({
    ...row,
    iconSrc: BENJI_SUMMARY_ICON_SOURCES[row.key]
  }));
}

function createEmptySituationAnalysisView(emptyText = "", visible = false): SituationAnalysisView {
  return {
    visible,
    available: false,
    metaText: "",
    rankingText: "",
    pressureText: "",
    reversalLines: [],
    strategyLines: [],
    emptyText
  };
}

function createSituationAnalysisView(data: ScoringPageData): SituationAnalysisView {
  if (
    !canShowSituationAnalysis({
      mode: data.workbenchMode === "local" ? "local" : "online",
      playerCount: getPlayerCountForData(data),
      occupiedSeatCount: countOnlineRoomMembers(data.onlineRoomSeatMap)
    })
  ) {
    return createEmptySituationAnalysisView();
  }

  const currentSeat = getSituationPerspectiveSeat(data);

  const analysis = analyzePointSituation({
    playerPoints: data.playerPoints,
    perspectiveSeat: currentSeat,
    dealer: data.dealer,
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    playerCount: getPlayerCountForData(data)
  });
  const reversalLines = createSituationReversalLines(data, analysis);
  const strategyLines = createSituationStrategyLines(data, analysis);

  return {
    visible: true,
    available: true,
    metaText: `当前：${data.roundLabel} / 东家：${getSituationPlayerName(data, data.dealer)} / 本场：${data.honba} / 供托：${data.riichiSticks}`,
    rankingText: `${getSituationPlayerName(data, currentSeat)}当前第 ${analysis.currentRank} 名 · ${formatSituationPoints(analysis.currentPoints)} 点`,
    pressureText: createSituationPressureText(data, analysis),
    reversalLines,
    strategyLines,
    emptyText: ""
  };
}

function getSituationPerspectiveSeat(
  data: Pick<ScoringPageData, "workbenchMode" | "onlineRoomSelectedSeat" | "dealer">
): Seat {
  return resolveSituationAnalysisPerspectiveSeat({
    mode: data.workbenchMode === "local" ? "local" : "online",
    dealer: data.dealer,
    onlineSeat: data.onlineRoomSelectedSeat
  });
}

function createSituationPressureText(
  data: ScoringPageData,
  analysis: PointSituationAnalysis
): string {
  if (analysis.currentRank === 1) {
    const secondSeat = analysis.rankedSeats[1];
    const lead = data.playerPoints[analysis.rankedSeats[0]] - data.playerPoints[secondSeat];

    return `领先第 2 名 ${formatSituationPoints(lead)} 点。`;
  }

  if (analysis.gapToPrevious === 0) {
    return `与第 ${analysis.currentRank - 1} 名同点，当前顺位靠后。`;
  }

  const previousText = `距离第 ${analysis.currentRank - 1} 名差 ${formatSituationPoints(analysis.gapToPrevious ?? 0)} 点`;
  const leaderText =
    analysis.currentRank > 2
      ? `，距离第 1 名差 ${formatSituationPoints(analysis.gapToLeader)} 点`
      : "";

  return `${previousText}${leaderText}。`;
}

function createSituationReversalLines(
  data: ScoringPageData,
  analysis: PointSituationAnalysis
): string[] {
  if (!analysis.improveTargetRank) {
    return ["当前已是第 1 名，无需计算反超条件。"];
  }

  const ronLines = [...analysis.improveRonRequirements]
    .sort((left, right) => left.handPoints - right.handPoints)
    .map(
      (requirement) =>
        `直击${getSituationPlayerName(data, requirement.discarder)}：${formatSituationPoints(requirement.handPoints)} 点可升至第 ${requirement.finalRank} 名`
    );
  const tsumoLine = analysis.improveTsumoRequirement
    ? createSituationTsumoText(data, analysis.improveTsumoRequirement)
    : "";

  return [...ronLines, ...(tsumoLine ? [tsumoLine] : [])];
}

function createSituationStrategyLines(
  data: ScoringPageData,
  analysis: PointSituationAnalysis
): string[] {
  const lines: string[] = [];
  const improvePath = createShortestSituationPath(
    data,
    analysis.improveRonRequirements,
    analysis.improveTsumoRequirement
  );

  if (improvePath) {
    lines.push(`最短升位路径：${improvePath}。`);
  }

  if (analysis.currentRank > 2) {
    const firstPath = createShortestSituationPath(
      data,
      analysis.firstRonRequirements,
      analysis.firstTsumoRequirement
    );

    if (firstPath) {
      lines.push(`争一线：${firstPath}。`);
    }
  }

  if (analysis.dealInRisk) {
    lines.push(
      `风险线：放铳给${getSituationPlayerName(data, analysis.dealInRisk.winner)}达到 ${formatSituationPoints(analysis.dealInRisk.handPoints)} 点后，可能降至第 ${analysis.dealInRisk.finalRank} 名。`
    );
  } else if (analysis.currentRank === 1) {
    lines.push("当前没有单次常规打点可立即造成的明显掉位风险。");
  }

  return lines;
}

function createShortestSituationPath(
  data: ScoringPageData,
  ronRequirements: RonRequirement[],
  tsumoRequirement: TsumoRequirement | undefined
): string {
  const paths = ronRequirements.map((requirement) => ({
    points: requirement.handPoints,
    text: `直击${getSituationPlayerName(data, requirement.discarder)} ${formatSituationPoints(requirement.handPoints)} 点`
  }));

  if (tsumoRequirement) {
    paths.push({
      points: tsumoRequirement.handPoints,
      text: `自摸合计 ${formatSituationPoints(tsumoRequirement.handPoints)} 点`
    });
  }

  return paths.sort((left, right) => left.points - right.points)[0]?.text ?? "";
}

function createSituationTsumoText(data: ScoringPageData, requirement: TsumoRequirement): string {
  const childPayerLabel = getPlayerCountForData(data) === 3 ? "子家" : "子家各";
  const paymentText =
    requirement.dealerPayment === requirement.childPayment
      ? `每家 ${formatSituationPoints(requirement.childPayment)}`
      : `亲家 ${formatSituationPoints(requirement.dealerPayment)} / ${childPayerLabel} ${formatSituationPoints(requirement.childPayment)}`;

  return `自摸：合计 ${formatSituationPoints(requirement.handPoints)} 点（${paymentText}）可升至第 ${requirement.finalRank} 名`;
}

function getSituationPlayerName(data: ScoringPageData, seat: Seat): string {
  return data.workbenchMode === "local"
    ? getPlayerName(data, seat)
    : data.onlineRoomSeatMap?.[seat]?.displayName?.trim() || getPlayerName(data, seat);
}

function formatSituationPoints(points: number): string {
  return points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function createMeldSummaryTileSections(data: ScoringPageData): SummaryTileSection[] | undefined {
  if (data.melds.length === 0) {
    return undefined;
  }

  return MELD_TYPE_OPTIONS.flatMap((option) => {
    const melds = data.melds.filter((meld) => meld.type === option.key);

    if (melds.length === 0) {
      return [];
    }

    return [
      {
        id: `meld-${option.key}`,
        label: option.label,
        tiles: melds.flatMap((meld, meldIndex) =>
          meld.tiles.map((tile, tileIndex) =>
            createSummaryTileView(tile, `meld-${option.key}-${meldIndex}-${tileIndex}`)
          )
        )
      }
    ];
  });
}

function createDoraSummaryTileSections(data: ScoringPageData): SummaryTileSection[] | undefined {
  if (
    compactTiles(data.doraIndicators).length === 0 &&
    compactTiles(data.uraDoraIndicators).length === 0
  ) {
    return undefined;
  }

  return [
    createSummaryTileSection("dora", "宝", data.doraIndicators),
    createSummaryTileSection("ura-dora", "里", data.uraDoraIndicators)
  ];
}

function createHandSummaryTileSections(data: ScoringPageData): SummaryTileSection[] | undefined {
  const handTiles = compactTiles(data.concealedTiles);
  const winningTile = compactTiles(data.winningTile)[0];

  if (handTiles.length === 0 && !winningTile) {
    return undefined;
  }

  return [
    {
      id: "hand",
      label: "手牌",
      tiles: handTiles.map((tile, tileIndex) => createSummaryTileView(tile, `hand-${tileIndex}`)),
      emptyText: "未选"
    },
    {
      id: "winning",
      label: "和牌张",
      tiles: winningTile ? [createSummaryTileView(winningTile, "winning-0", true)] : [],
      emptyText: "未选"
    }
  ];
}

function createSummaryTileSection(
  id: string,
  label: string,
  tiles: readonly TileSlotValue[]
): SummaryTileSection {
  return {
    id,
    label,
    tiles: compactTiles(tiles).map((tile, tileIndex) =>
      createSummaryTileView(tile, `${id}-${tileIndex}`)
    ),
    emptyText: "未选"
  };
}

function createSummaryTileView(tile: Tile, id: string, winning = false): SummaryTileView {
  return {
    id,
    tile,
    label: getTileDisplayName(tile),
    winning
  };
}

function createEventSummary(data: ScoringPageData): string {
  if (data.eventType === "draw") {
    const tenpaiLabels = selectedSeats(data.tenpaiSeats, getActiveSeatsForData(data)).map((seat) =>
      getPlayerName(data, seat)
    );
    return `荒牌流局：${tenpaiLabels.length > 0 ? tenpaiLabels.join("、") : "无人"}听牌`;
  }

  if (data.eventType === "tsumo") {
    return `自摸：${data.winner ? getPlayerName(data, data.winner) : "未选"}`;
  }

  const winners = getRonWinners(data);

  if (!data.discarder || winners.length === 0) {
    return "荣和：未选";
  }

  const progressText =
    data.multiRonProgress && winners.length > 1
      ? `，当前 ${getPlayerName(data, data.multiRonProgress.currentWinner)}（${data.multiRonProgress.completedWins.length + 1}/${winners.length}）`
      : "";

  return `荣和：${getPlayerName(data, data.discarder)} 放铳，${winners.map((seat) => getPlayerName(data, seat)).join("、")} 和牌${progressText}`;
}

function createTableCenterLines(data: ScoringPageData): string[] {
  return [data.roundLabel, `本场 ${data.honba} / 立直 ${data.riichiSticks}`];
}

function createMultiRonStatusText(data: ScoringPageData): string {
  const progress = data.multiRonProgress;

  if (!progress) {
    return "";
  }

  return `多人荣和 ${progress.completedWins.length}/${progress.winners.length}，当前 ${getPlayerName(data, progress.currentWinner)}`;
}

function createConditionSummary(data: ScoringPageData): string {
  const labels = data.conditionOptions
    .filter((option) => option.checked && option.key !== "enableUraDora")
    .map((option) => option.label);
  const liabilityText = data.liabilitySeat
    ? `责任者 ${getPlayerName(data, data.liabilitySeat)}`
    : "";
  const allLabels = [...labels, liabilityText].filter(Boolean);

  return allLabels.length > 0 ? allLabels.join(" / ") : "无";
}

function createDoraSummary(data: ScoringPageData): string {
  return createDoraSummaryLines(data).join(" / ");
}

function createHandSummary(data: ScoringPageData): string {
  const expectedCount = getRequiredConcealedTileCount(data.melds);
  const selectedTiles = compactTiles(data.concealedTiles);
  const selectedCount = selectedTiles.length;
  const selectedHandText = selectedTiles.map(getTileDisplayName).join("、") || "未选";
  const selectedWinningTile = compactTiles(data.winningTile).map(getTileDisplayName)[0] ?? "未选";

  if (selectedCount > expectedCount) {
    return `手牌：${selectedHandText}，多 ${selectedCount - expectedCount} 张 / 和牌张：${selectedWinningTile}`;
  }

  return `手牌：${selectedHandText} / 和牌张：${selectedWinningTile}`;
}

function isHandCountOverLimit(data: ScoringPageData): boolean {
  return compactTiles(data.concealedTiles).length > getRequiredConcealedTileCount(data.melds);
}

function createDoraSummaryLines(data: ScoringPageData): string[] {
  const doraText = createTileListSummary(data.doraIndicators);
  const uraDoraText = createTileListSummary(data.uraDoraIndicators);
  const lines = [`宝：${doraText}`, `里：${uraDoraText}`];

  if (getPlayerCountForData(data) === 3) {
    lines.push(`拔北：${data.nukiDoraCount}`);
  }

  return lines;
}

function createTileListSummary(tiles: readonly TileSlotValue[]): string {
  const labels = compactTiles(tiles).map(getTileDisplayName);

  return labels.length > 0 ? labels.join("、") : "未选";
}

function getRequiredConcealedTileCount(melds: readonly Meld[]): number {
  return Math.max(1, 13 - melds.length * 3);
}

function createRecordRows(
  records: readonly SettlementRecord[],
  playerNames: PlayerNames = DEFAULT_PLAYER_NAMES
): RecordRow[] {
  return [...records].reverse().map((record, reversedIndex) => ({
    id: record.id,
    title: `第 ${records.length - reversedIndex} 条：${
      record.event.type === "draw" ? "荒牌流局" : "和牌结算"
    }`,
    detail: getRecordActiveSeats(record)
      .map((seat) => `${getPlayerNameFromMap(playerNames, seat)} ${record.pointsAfter[seat]}`)
      .join(" / ")
  }));
}

function getRecordActiveSeats(record: SettlementRecord): Seat[] {
  const playerCount =
    record.roundInput?.playerCount ??
    record.multipleRonInput?.playerCount ??
    record.drawInput?.playerCount ??
    4;

  return getActiveSeats(playerCount);
}

function createMeldDraftHint(type: MeldType): string {
  return type === "chi" || type === "pon" ? "选择 3 张后加入鸣牌" : "选择 4 张后加入鸣牌";
}

function createMeldRows(melds: readonly Meld[]): MeldRow[] {
  return melds.map((meld, index) => {
    const label = MELD_TYPE_OPTIONS.find((option) => option.key === meld.type)?.label ?? "鸣牌";
    const tiles = isKanMeldType(meld.type) ? [createKanSummaryTile(meld.tiles)] : meld.tiles;

    return {
      id: `${index}-${meld.type}-${meld.tiles.join("-")}`,
      text: `${label}：${tiles.map(getTileDisplayName).join(" ")}`
    };
  });
}

function createKanSummaryTile(tiles: readonly Tile[]): Tile {
  return normalizeRedTile(tiles[0]);
}

function buildHandInput(data: ScoringPageData): HandInput {
  const melds = inferMeldsFromAllTypeDrafts(data);
  const conditions = {
    ...createWinConditions(data.conditionOptions, data.winType, melds),
    enableUraDora: compactTiles(data.uraDoraIndicators).length > 0
  };

  return {
    concealedTiles: compactTiles(data.concealedTiles),
    winningTile: compactTiles(data.winningTile)[0],
    melds,
    doraIndicators: compactTiles(data.doraIndicators),
    kanDoraIndicators: [],
    uraDoraIndicators: compactTiles(data.uraDoraIndicators),
    nukiDoraCount: getPlayerCountForData(data) === 3 ? data.nukiDoraCount : 0,
    liabilitySeat: data.liabilitySeat || undefined,
    conditions
  };
}

function buildRoundInput(data: ScoringPageData): RoundInput {
  return {
    roundWind: ROUND_WIND_VALUES[data.roundWindIndex],
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    dealer: data.dealer,
    playerCount: getPlayerCountForData(data),
    winner: data.winner as Seat,
    discarder: data.eventType === "ron" ? (data.discarder as Seat) : undefined,
    winType: data.eventType === "tsumo" ? "tsumo" : "ron",
    playerPoints: data.playerPoints
  };
}

function buildDrawRoundInput(data: ScoringPageData): DrawRoundInput {
  return {
    roundWind: ROUND_WIND_VALUES[data.roundWindIndex],
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    dealer: data.dealer,
    playerCount: getPlayerCountForData(data),
    tenpaiSeats: selectedSeats(data.tenpaiSeats, getActiveSeatsForData(data)),
    playerPoints: data.playerPoints
  };
}

function buildMultipleRonRoundInput(
  data: ScoringPageData,
  progress: MultiRonProgress
): MultipleRonRoundInput {
  return {
    roundWind: ROUND_WIND_VALUES[data.roundWindIndex],
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    dealer: data.dealer,
    playerCount: getPlayerCountForData(data),
    discarder: progress.discarder,
    winners: progress.winners,
    playerPoints: data.playerPoints
  };
}

function createWinSettlementRecord(data: ScoringPageData): SettlementRecord {
  const roundInput = buildRoundInput(data);
  const handInput = buildHandInput(data);
  const scoringResult = calculateWithRiichi(handInput, roundInput);

  return createSettlementRecord(
    roundInput,
    handInput,
    scoringResult,
    data.playerPoints,
    data.recentRecord?.id
  );
}

function prepareRonStepData(data: ScoringPageData): ScoringPageData {
  if (data.eventType !== "ron") {
    return data;
  }

  const winners = getRonWinners(data);

  if (winners.length <= 1) {
    const winner = winners[0] ?? data.winner;

    return {
      ...data,
      winner,
      winnerIndex: winner ? getActiveSeatsForData(data).indexOf(winner) : -1,
      multiRonProgress: null
    };
  }

  const progress = data.multiRonProgress ?? ensureMultiRonProgress(data);

  return {
    ...data,
    winner: progress.currentWinner,
    winnerIndex: getActiveSeatsForData(data).indexOf(progress.currentWinner),
    discarder: progress.discarder,
    discarderIndex: getActiveSeatsForData(data).indexOf(progress.discarder),
    multiRonProgress: progress
  };
}

function ensureMultiRonProgress(data: ScoringPageData): MultiRonProgress {
  const winners = orderRonWinnersForInput(
    data.discarder as Seat,
    getRonWinners(data),
    data.gameVariant
  );
  const discarder = data.discarder as Seat;

  if (data.multiRonProgress) {
    return data.multiRonProgress;
  }

  return {
    discarder,
    winners,
    currentWinner: winners[0],
    completedWins: []
  };
}

function orderRonWinnersForInput(
  discarder: Seat,
  winners: readonly Seat[],
  gameVariant: GameVariant = "yonma"
): Seat[] {
  if (!discarder) {
    return uniqueSeatList(winners, getActiveSeatsForVariant(gameVariant));
  }

  const activeTurnOrder = getActiveTurnOrder(getPlayerCountFromVariant(gameVariant));
  const turnIndex = activeTurnOrder.indexOf(discarder);
  const order = [...activeTurnOrder.slice(turnIndex + 1), ...activeTurnOrder.slice(0, turnIndex)];
  const uniqueWinners = uniqueSeatList(winners, activeTurnOrder);

  return order.filter((seat) => uniqueWinners.includes(seat));
}

function uniqueSeatList(seats: readonly Seat[], activeSeats: readonly Seat[] = SEATS): Seat[] {
  return activeSeats.filter((seat) => seats.includes(seat));
}

function getRonWinners(
  data: Pick<
    ScoringPageData,
    "eventType" | "winner" | "ronWinnerSeats" | "multiRonProgress" | "gameVariant" | "workbenchMode"
  >
): Seat[] {
  if (data.eventType !== "ron") {
    return data.winner ? [data.winner] : [];
  }

  if (data.multiRonProgress) {
    return data.multiRonProgress.winners;
  }

  const selectedWinners = selectedSeats(data.ronWinnerSeats, getActiveSeatsForData(data));
  return selectedWinners.length > 0 ? selectedWinners : data.winner ? [data.winner] : [];
}

function getCurrentWinner(
  data: Pick<ScoringPageData, "winner" | "multiRonProgress">
): SeatSlotValue {
  return data.multiRonProgress?.currentWinner ?? data.winner;
}

function createEmptySingleWinDraftPatch(): Partial<ScoringPageData> {
  return {
    concealedTiles: createSlots(13),
    winningTile: createSlots(1),
    meldDraftTiles: createSlots(16),
    meldDraftTilesByType: createEmptyMeldDraftTileMap(),
    doraIndicators: createSlots(4),
    uraDoraIndicators: createSlots(4),
    nukiDoraCount: 0,
    meldKanTypes: ["", "", "", ""],
    meldKanTypesByType: createEmptyMeldDraftKanTypeMap(),
    melds: [],
    meldRows: [],
    conditionOptions: CONDITION_OPTIONS.map((option) => ({ ...option, checked: false })),
    activeTileArea: "concealedTiles",
    activeDoraIndex: 0,
    selectedMeldTypeIndex: 0,
    meldDraftHint: createMeldDraftHint("chi")
  };
}

function createDraftPatchFromWinRecord(record: MultipleRonWinRecord): Partial<ScoringPageData> {
  const conditionOptions = CONDITION_OPTIONS.map((option) => ({
    ...option,
    checked: Boolean(record.handInput.conditions[option.key])
  }));

  return {
    winner: record.winner,
    winnerIndex: SEATS.indexOf(record.winner),
    concealedTiles: [
      ...record.handInput.concealedTiles,
      ...createSlots(13 - record.handInput.concealedTiles.length)
    ],
    winningTile: record.handInput.winningTile ? [record.handInput.winningTile] : createSlots(1),
    doraIndicators: [
      ...record.handInput.doraIndicators,
      ...createSlots(4 - record.handInput.doraIndicators.length)
    ],
    uraDoraIndicators: [
      ...record.handInput.uraDoraIndicators,
      ...createSlots(4 - record.handInput.uraDoraIndicators.length)
    ],
    nukiDoraCount: record.handInput.nukiDoraCount ?? 0,
    meldDraftTiles: createSlots(16),
    meldDraftTilesByType: createMeldDraftMapFromMelds(record.handInput.melds),
    meldKanTypes: ["", "", "", ""],
    meldKanTypesByType: createMeldKanTypeMapFromMelds(record.handInput.melds),
    melds: record.handInput.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    meldRows: createMeldRows(record.handInput.melds),
    conditionOptions,
    activeTileArea: "concealedTiles",
    activeDoraIndex: 0,
    selectedMeldTypeIndex: 0,
    meldDraftHint: createMeldDraftHint("chi")
  };
}

function createMeldDraftMapFromMelds(melds: readonly Meld[]): MeldDraftTileMap {
  const map = createEmptyMeldDraftTileMap();

  melds.forEach((meld, index) => {
    const rowStart = index * 4;
    map[meld.type] = map[meld.type].map((tile, tileIndex) =>
      tileIndex >= rowStart && tileIndex < rowStart + meld.tiles.length
        ? meld.tiles[tileIndex - rowStart]
        : tile
    );
  });

  return map;
}

function createMeldKanTypeMapFromMelds(melds: readonly Meld[]): MeldDraftKanTypeMap {
  const map = createEmptyMeldDraftKanTypeMap();

  melds.forEach((meld, index) => {
    if (isKanMeldType(meld.type)) {
      map[meld.type][index] = meld.type;
    }
  });

  return map;
}

function createWinConditions(
  options: readonly Option<ConditionKey>[],
  winType: WinType,
  melds: readonly Meld[]
): WinConditions {
  const enabled = new Set(options.filter((option) => option.checked).map((option) => option.key));
  const isClosed = melds.every((meld) => !meld.open);

  return {
    riichi: enabled.has("riichi"),
    doubleRiichi: enabled.has("doubleRiichi"),
    ippatsu: enabled.has("ippatsu"),
    menzenTsumo: winType === "tsumo" && isClosed,
    haitei: enabled.has("haitei"),
    houtei: enabled.has("houtei"),
    rinshan: enabled.has("rinshan"),
    chankan: enabled.has("chankan"),
    tenhou: enabled.has("tenhou"),
    chiihou: enabled.has("chiihou"),
    enableUraDora: enabled.has("enableUraDora")
  };
}

function validateDraft(data: ScoringPageData): string[] {
  if (data.eventType === "draw") {
    return [];
  }

  const activeSeats = getActiveSeatsForData(data);
  const winners = data.eventType === "ron" ? getRonWinners(data) : data.winner ? [data.winner] : [];

  if (getPlayerCountForData(data) === 3 && hasSanmaRemovedManzuInDraft(data)) {
    return ["三人麻将不使用 2-8 万，请清除后再结算"];
  }

  if (
    getPlayerCountForData(data) === 3 &&
    inferMeldsFromAllTypeDrafts(data).some((meld) => meld.type === "chi")
  ) {
    return ["三人麻将不能吃牌"];
  }

  if (winners.length === 0) {
    return [data.eventType === "tsumo" ? "自摸时需要选择自摸者" : "荣和时需要选择和牌者"];
  }

  if (winners.some((winner) => !activeSeats.includes(winner))) {
    return [`${GAME_VARIANT_LABELS[data.gameVariant]}不能选择未入局座位`];
  }

  if (data.eventType === "ron" && winners.length > activeSeats.length - 1) {
    return [`荣和最多选择 ${activeSeats.length - 1} 名和牌者`];
  }

  if (data.eventType === "ron" && !data.discarder) {
    return ["荣和时需要选择放铳者"];
  }

  if (data.eventType === "ron" && winners.includes(data.discarder as Seat)) {
    return ["放铳者不能与和牌者相同"];
  }

  if (data.liabilitySeat && !activeSeats.includes(data.liabilitySeat)) {
    return ["责任者不能选择未入局座位"];
  }

  if (data.liabilitySeat && winners.includes(data.liabilitySeat)) {
    return ["责任者不能与和牌者相同"];
  }

  const expectedHandCount = getRequiredConcealedTileCount(inferMeldsFromAllTypeDrafts(data));
  const selectedHandCount = compactTiles(data.concealedTiles).length;

  if (selectedHandCount > expectedHandCount) {
    return [`手牌多 ${selectedHandCount - expectedHandCount} 张，请删除后再结算`];
  }

  if (selectedHandCount < expectedHandCount) {
    return [`手牌还需 ${expectedHandCount - selectedHandCount} 张`];
  }

  const meldDraftErrors = validateAllMeldDrafts(data);

  if (meldDraftErrors.length > 0) {
    return meldDraftErrors;
  }

  if (countOccupiedMeldDraftGroups(data) > 4) {
    return ["鸣牌最多支持 4 组"];
  }

  if (inferMeldsFromAllTypeDrafts(data).length > 4) {
    return ["鸣牌最多支持 4 组"];
  }

  return [];
}

function hasSanmaRemovedManzuInDraft(data: ScoringPageData): boolean {
  const meldTiles = inferMeldsFromAllTypeDrafts(data).flatMap((meld) => meld.tiles);
  const tiles = [
    ...compactTiles(data.concealedTiles),
    ...compactTiles(data.winningTile),
    ...meldTiles,
    ...compactTiles(data.doraIndicators),
    ...compactTiles(data.uraDoraIndicators)
  ];

  return tiles.some((tile) => isRemovedManzuTileForSanma(data.gameVariant, tile));
}

function validateMeldDrafts(
  tiles: readonly TileSlotValue[],
  kanTypes: ReadonlyArray<KanMeldType | "">,
  labelPrefix = ""
): string[] {
  return splitMeldDraftRows(tiles).flatMap((row, groupIndex) => {
    const compact = compactTiles(row);
    const groupLabel = `${labelPrefix}第 ${groupIndex + 1} 组鸣牌`;

    if (compact.length === 0) {
      return [];
    }

    if (compact.length < 3) {
      return [`${groupLabel}未填完整`];
    }

    if (compact.length === 3) {
      return inferMeldType(compact, "") ? [] : [`${groupLabel}无法推断为吃或碰，请检查牌面`];
    }

    if (!isSameNormalizedTileSet(compact)) {
      return [`${groupLabel}输入 4 张时必须是相同牌`];
    }

    if (!kanTypes[groupIndex]) {
      return [`${groupLabel}需要选择杠类型`];
    }

    return [];
  });
}

function validateAllMeldDrafts(data: ScoringPageData): string[] {
  const { meldDraftTilesByType, meldKanTypesByType } = createActiveMeldDraftState(data);

  return MELD_TYPE_OPTIONS.flatMap((option) =>
    validateMeldDrafts(
      meldDraftTilesByType[option.key],
      meldKanTypesByType[option.key],
      `${option.label} `
    )
  );
}

function createConfirmationLines(data: ScoringPageData): string[] {
  if (data.eventType === "draw") {
    return [
      `${data.roundLabel} ${data.honba} 本场 ${data.riichiSticks} 供托`,
      createEventSummary(data),
      "荒牌流局后本场 +1，供托继续保留"
    ];
  }

  const progress = data.multiRonProgress;
  const progressLines =
    progress && progress.winners.length > 1
      ? [
          `当前结算：${getPlayerName(data, progress.currentWinner)}（${progress.completedWins.length + 1}/${progress.winners.length}）`,
          `已完成：${progress.completedWins.length > 0 ? progress.completedWins.map((win) => getPlayerName(data, win.winner)).join("、") : "无"}`,
          `剩余：${
            progress.winners
              .slice(progress.completedWins.length + 1)
              .map((seat) => getPlayerName(data, seat))
              .join("、") || "无"
          }`
        ]
      : [];

  return [
    `${data.roundLabel} ${data.honba} 本场 ${data.riichiSticks} 供托`,
    createEventSummary(data),
    `手牌 ${compactTiles(data.concealedTiles).length} 张，和牌张 ${compactTiles(data.winningTile).map(getTileDisplayName)[0] ?? "未选"}`,
    `鸣牌 ${data.melds.length} 组，${createDoraSummary(data)}`,
    ...progressLines
  ];
}

function createConfirmationResultLines(
  data: ScoringPageData,
  currentResult?: ScoringResult
): string[] {
  if (!currentResult) {
    return [];
  }

  const progress = data.multiRonProgress;
  const completedLines =
    progress?.completedWins.flatMap((win) =>
      createWinResultPreviewLines("已完成", win.winner, win.result, data.playerNames)
    ) ?? [];
  const currentWinner = progress?.currentWinner ?? (data.winner as Seat);

  return [
    ...completedLines,
    ...createWinResultPreviewLines(
      progress ? "当前" : "本局",
      currentWinner,
      currentResult,
      data.playerNames
    )
  ];
}

function createWinResultPreviewLines(
  prefix: string,
  winner: Seat,
  result: ScoringResult,
  playerNames: PlayerNames = DEFAULT_PLAYER_NAMES
): string[] {
  const valueText = createResultValueText(result);
  const yakuText = [...result.yaku, ...result.dora]
    .map((line) => `${line.name} ${line.han}番`)
    .join("、");

  return [
    `${prefix} ${getPlayerNameFromMap(playerNames, winner)}：${valueText}`,
    `役种：${yakuText || "无"}`
  ];
}

function createResultValueText(result: ScoringResult): string {
  const limitText = formatLimit(result);

  if (!result.limit) {
    return limitText;
  }

  const fuText = result.fu ? `${result.fu} 符` : "役满";
  return `${limitText}，${result.han} 番 / ${fuText}`;
}

function createResultView(
  result: ScoringResult,
  record?: SettlementRecord,
  playerNames: PlayerNames = DEFAULT_PLAYER_NAMES
): ResultView {
  const playerCount =
    record?.roundInput?.playerCount ??
    record?.multipleRonInput?.playerCount ??
    record?.drawInput?.playerCount ??
    4;
  const activeSeats = getActiveSeats(playerCount);
  const rankMap = createRankMap(result.pointsAfter ?? createDefaultPlayerPoints(), activeSeats);
  const dealer =
    record?.roundInput?.dealer ??
    record?.multipleRonInput?.dealer ??
    record?.drawInput?.dealer ??
    "east";

  return {
    limitText:
      record?.multipleRonWins && record.multipleRonWins.length > 1
        ? `多人荣和 ${record.multipleRonWins.length} 家`
        : record?.event.type === "draw"
          ? "荒牌流局"
          : formatLimit(result),
    han: result.han,
    fu: record?.event.type === "draw" ? "-" : (result.fu ?? "-"),
    basePoints: result.basePoints,
    yakuLines: result.yaku,
    doraLines: result.dora,
    fuLines: result.fuDetails.filter((detail) => !detail.name.startsWith("总符数")),
    scoreRows: activeSeats.map((seat) => ({
      seat,
      label: getPlayerNameFromMap(playerNames, seat),
      directionLabel: createSeatWindLabelForPlayerCount(seat, dealer, playerCount),
      deltaText: formatSigned(result.pointDelta[seat]),
      deltaClass:
        result.pointDelta[seat] > 0
          ? "positive"
          : result.pointDelta[seat] < 0
            ? "negative"
            : "neutral",
      after: result.pointsAfter?.[seat] ?? 0,
      rankText: `${rankMap[seat]} 位`
    })),
    childResultGroups: (record?.multipleRonWins ?? []).map((win) => ({
      winner: win.winner,
      label: getPlayerNameFromMap(playerNames, win.winner),
      directionLabel: createSeatWindLabelForPlayerCount(win.winner, dealer, playerCount),
      limitText: formatLimit(win.result),
      han: win.result.han,
      fu: win.result.fu ?? "-",
      paymentText: createWinnerPaymentText(win.winner, win.result.payments, playerNames),
      yakuText: [...win.result.yaku, ...win.result.dora]
        .map((line) => `${line.name}${line.han}番`)
        .join("、")
    })),
    warnings: createResultWarnings(result.warnings, record, dealer, playerNames)
  };
}

function createResultWarnings(
  warnings: readonly string[],
  record: SettlementRecord | undefined,
  dealer: Seat,
  playerNames: PlayerNames
): string[] {
  if (!record?.multipleRonWins || !record.multipleRonInput) {
    return [...warnings];
  }

  return warnings.map((warning) => {
    if (!warning.startsWith("本场和供托上家取り：")) {
      return warning;
    }

    const priorityWinner = record.event.type === "ron" ? record.event.winner : undefined;

    if (!priorityWinner) {
      return warning;
    }

    return `本场和供托上家取り：${createSeatDisplayText(priorityWinner, dealer, playerNames)}`;
  });
}

function createSeatDisplayText(seat: Seat, dealer: Seat, playerNames: PlayerNames): string {
  return `${createSeatWindLabel(seat, dealer)} ${getPlayerNameFromMap(playerNames, seat)}`;
}

function createWinnerPaymentText(
  winner: Seat,
  payments: ScoringResult["payments"],
  playerNames: PlayerNames
): string {
  const handPayments = payments.filter(
    (payment) => payment.to === winner && payment.reason === "hand"
  );

  if (handPayments.length === 0) {
    return "支付：无";
  }

  return `支付：${handPayments
    .map((payment) => `${getPlayerNameFromMap(playerNames, payment.from)} ${payment.points}`)
    .join(" / ")}`;
}

function formatLimit(result: ScoringResult): string {
  if (result.limit) {
    const labels = {
      mangan: "满贯",
      haneman: "跳满",
      baiman: "倍满",
      sanbaiman: "三倍满",
      yakuman: result.han >= 13 && result.yaku.every((yaku) => yaku.han > 0) ? "累计役满" : "役满"
    };

    return labels[result.limit];
  }

  return `${result.fu ?? "-"} 符 ${result.han} 番`;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function selectedSeats(map: Record<Seat, boolean>, activeSeats: readonly Seat[] = SEATS): Seat[] {
  return activeSeats.filter((seat) => map[seat]);
}

function isDoraArea(area: TileArea): boolean {
  return area === "doraIndicators" || area === "kanDoraIndicators" || area === "uraDoraIndicators";
}

function createDraftSnapshot(data: ScoringPageData): DraftSnapshot {
  const { meldDraftTilesByType, meldKanTypesByType } = createActiveMeldDraftState(data);
  const activeSeats = getActiveSeatsForData(data);

  return {
    gameVariant: data.gameVariant,
    roundWindIndex: data.roundWindIndex,
    roundIndex: data.roundIndex,
    roundLabel: data.roundLabel,
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    dealerIndex: data.dealerIndex,
    winnerIndex: data.winnerIndex,
    discarderIndex: data.discarderIndex,
    dealer: data.dealer,
    winner: data.winner,
    ronWinnerSeats: { ...data.ronWinnerSeats },
    discarder: data.discarder,
    eventType: data.eventType,
    eventTypeIndex: data.eventTypeIndex,
    winType: data.winType,
    playerNames: { ...data.playerNames },
    playerPoints: { ...data.playerPoints },
    pointRows: createPointRows(data.playerPoints, data.playerNames, activeSeats),
    playerNameRows: createPlayerNameRows(
      data.playerNames,
      data.dealer,
      activeSeats,
      data.gameVariant
    ),
    riichiSeats: { ...data.riichiSeats },
    tenpaiSeats: { ...data.tenpaiSeats },
    concealedTiles: [...data.concealedTiles],
    winningTile: [...data.winningTile],
    meldDraftTiles: [...data.meldDraftTiles],
    meldDraftTilesByType: cloneMeldDraftTileMap(meldDraftTilesByType),
    doraIndicators: [...data.doraIndicators],
    kanDoraIndicators: [...data.kanDoraIndicators],
    uraDoraIndicators: [...data.uraDoraIndicators],
    nukiDoraCount: data.nukiDoraCount,
    liabilitySeat: data.liabilitySeat,
    activeDoraIndex: data.activeDoraIndex,
    selectedMeldTypeIndex: data.selectedMeldTypeIndex,
    meldDraftHint: data.meldDraftHint,
    meldKanTypes: [...data.meldKanTypes],
    meldKanTypesByType: cloneMeldDraftKanTypeMap(meldKanTypesByType),
    melds: data.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    meldRows: [...data.meldRows],
    conditionOptions: data.conditionOptions.map((option) => ({ ...option })),
    activeTileArea: data.activeTileArea,
    multiRonProgress: data.multiRonProgress
      ? {
          ...data.multiRonProgress,
          winners: [...data.multiRonProgress.winners],
          completedWins: data.multiRonProgress.completedWins.map((win) =>
            cloneMultipleRonWinRecord(win)
          )
        }
      : null
  };
}

function cloneMultipleRonWinRecord(record: MultipleRonWinRecord): MultipleRonWinRecord {
  return {
    ...record,
    roundInput: {
      ...record.roundInput,
      playerPoints: record.roundInput.playerPoints
        ? { ...record.roundInput.playerPoints }
        : undefined
    },
    handInput: {
      ...record.handInput,
      concealedTiles: [...record.handInput.concealedTiles],
      melds: record.handInput.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      doraIndicators: [...record.handInput.doraIndicators],
      kanDoraIndicators: [...record.handInput.kanDoraIndicators],
      uraDoraIndicators: [...record.handInput.uraDoraIndicators],
      conditions: { ...record.handInput.conditions }
    },
    result: {
      ...record.result,
      errors: [...record.result.errors],
      warnings: [...record.result.warnings],
      yaku: record.result.yaku.map((line) => ({ ...line })),
      dora: record.result.dora.map((line) => ({ ...line })),
      fuDetails: record.result.fuDetails.map((line) => ({ ...line })),
      payments: record.result.payments.map((payment) => ({ ...payment })),
      pointDelta: { ...record.result.pointDelta },
      pointsAfter: record.result.pointsAfter ? { ...record.result.pointsAfter } : undefined,
      pointDiffs: record.result.pointDiffs
        ? SEATS.reduce<Record<Seat, Record<Seat, number>>>(
            (acc, seat) => ({
              ...acc,
              [seat]: { ...record.result.pointDiffs?.[seat] }
            }),
            {} as Record<Seat, Record<Seat, number>>
          )
        : undefined
    }
  };
}
