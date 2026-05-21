import { validateMeld } from "../../shared/domain/hand/index";
import type { HandInput, Meld, MeldType, WinConditions } from "../../shared/domain/hand/index";
import type {
  DrawRoundInput,
  PlayerPoints,
  RoundInput,
  RoundWind,
  Seat,
  WinType
} from "../../shared/domain/round/index";
import { DEFAULT_INITIAL_POINTS, SEATS } from "../../shared/domain/round/index";
import type { FuDetail, NamedHan, ScoringResult } from "../../shared/domain/scoring/index";
import { calculateWithRiichi } from "../../shared/domain/scoring-adapter/index";
import {
  createDefaultPlayerPoints,
  createDrawSettlementRecord,
  createSettlementRecord,
  replaceRecentSettlement
} from "../../shared/domain/settlement/index";
import type { SettlementRecord } from "../../shared/domain/settlement/index";
import { getTileDisplayName, normalizeRedTile } from "../../shared/domain/tiles/index";
import type { Tile } from "../../shared/domain/tiles/index";

type RoundEventType = "ron" | "tsumo" | "draw";
type EditingPanel =
  | "none"
  | "round-event"
  | "scene-yaku"
  | "hand"
  | "dora"
  | "meld"
  | "records"
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
type ConditionKey = Exclude<keyof WinConditions, "menzenTsumo">;
type TimingConditionKey = "" | "haitei" | "houtei" | "rinshan" | "chankan";
type OpeningYakumanKey = "" | "tenhou" | "chiihou";

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
  area: "concealedTiles" | "winningTile";
  index: number;
  tile: TileSlotValue;
  label: string;
  active: boolean;
  winning: boolean;
}

interface DoraTileOption {
  tile: Tile;
  label: string;
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
  inferredText: string;
  needsKanType: boolean;
  kanType: KanMeldType | "";
}

interface PointRow {
  seat: Seat;
  label: string;
  points: number;
}

interface TableSeatView {
  seat: Seat;
  label: string;
  directionLabel: string;
  points: number;
  rankText: string;
  riichiText: string;
  statusBadges: Array<{ type: string; label: string }>;
  className: string;
}

interface SummaryRow {
  key: EditingPanel;
  title: string;
  value: string;
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
  warnings: string[];
}

interface DraftSnapshot {
  roundWindIndex: number;
  roundIndex: number;
  roundLabel: string;
  honba: number;
  riichiSticks: number;
  dealerIndex: number;
  winnerIndex: number;
  discarderIndex: number;
  dealer: Seat;
  winner: Seat;
  discarder: Seat | "";
  eventType: RoundEventType;
  eventTypeIndex: number;
  winType: WinType;
  playerPoints: PlayerPoints;
  pointRows: PointRow[];
  riichiSeats: Record<Seat, boolean>;
  tenpaiSeats: Record<Seat, boolean>;
  concealedTiles: TileSlotValue[];
  winningTile: TileSlotValue[];
  meldDraftTiles: TileSlotValue[];
  doraIndicators: TileSlotValue[];
  kanDoraIndicators: TileSlotValue[];
  uraDoraIndicators: TileSlotValue[];
  activeDoraIndex: number;
  selectedMeldTypeIndex: number;
  meldDraftHint: string;
  meldKanTypes: Array<KanMeldType | "">;
  melds: Meld[];
  meldRows: MeldRow[];
  conditionOptions: Array<Option<ConditionKey>>;
  activeTileArea: TileArea;
}

interface ScoringPageData extends DraftSnapshot {
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
  tenpaiRows: TenpaiRow[];
  riichiStateOptions: RiichiStateOption[];
  timingConditionOptions: Array<RadioOption<TimingConditionKey>>;
  openingYakumanOptions: Array<RadioOption<OpeningYakumanKey>>;
  bonusConditionOptions: Array<Option<ConditionKey>>;
  handSlotViews: HandSlotView[];
  handTileRows: DoraTileRow[];
  meldGroupViews: MeldGroupView[];
  kanTypeOptions: Array<Option<KanMeldType>>;
  doraSlotViews: DoraSlotView[];
  uraDoraSlotViews: DoraSlotView[];
  doraTileRows: DoraTileRow[];
  summaryRows: SummaryRow[];
  recordRows: RecordRow[];
  confirmationLines: string[];
}

const SEAT_LABELS: Record<Seat, string> = {
  east: "玩家1",
  south: "玩家2",
  west: "玩家3",
  north: "玩家4"
};
const SEAT_DIRECTION_LABELS: Record<Seat, string> = {
  east: "东",
  south: "南",
  west: "西",
  north: "北"
};

const ROUND_WIND_VALUES: RoundWind[] = ["east", "south", "west", "north"];
const ROUND_WIND_LABELS = ["东场", "南场", "西场", "北场"];
const ROUND_INDEX_LABELS = ["一局", "二局", "三局", "四局"];
const EVENT_TYPE_OPTIONS: Array<Option<RoundEventType>> = [
  { key: "ron", label: "放铳" },
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

const EMPTY_RESULT_VIEW: ResultView = {
  limitText: "-",
  han: 0,
  fu: "-",
  basePoints: 0,
  yakuLines: [],
  doraLines: [],
  fuLines: [],
  scoreRows: [],
  warnings: []
};

Page({
  data: createInitialData(),

  handleOpenPanel(event: WechatMiniprogram.TouchEvent) {
    const panel = event.currentTarget.dataset.panel as EditingPanel;
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

  handleClosePanel() {
    this.setData({ editingPanel: "none", errors: [] });
  },

  handleTileFill(event: WechatMiniprogram.CustomEvent<TileFillDetail>) {
    const { area, index, tile } = event.detail;
    const value = isDoraArea(area) ? normalizeRedTile(tile) : tile;
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

  handleDirectTileTap(event: WechatMiniprogram.TouchEvent) {
    const area = this.data.activeTileArea as DirectTileArea;
    const tile = event.currentTarget.dataset.tile as Tile;
    const maxIndex = Math.max((this.data[area] as TileSlotValue[]).length - 1, 0);
    const nextIndex = Math.min(this.data.activeDoraIndex + 1, maxIndex);
    const value = isDoraArea(area) ? normalizeRedTile(tile) : tile;

    updateDraft(this, {
      ...createTileAreaPatch(this.data, area, this.data.activeDoraIndex, value),
      activeDoraIndex: nextIndex
    });
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

  handleKanTypeTap(event: WechatMiniprogram.TouchEvent) {
    const groupIndex = Number(event.currentTarget.dataset.groupIndex);
    const type = event.currentTarget.dataset.type as KanMeldType;
    const meldKanTypes = this.data.meldKanTypes.map((currentType, index) =>
      index === groupIndex ? type : currentType
    );

    updateDraft(this, { meldKanTypes });
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
    updateDraft(this, {
      dealerIndex,
      dealer: SEATS[dealerIndex]
    });
  },

  handleWinnerChange(event: WechatMiniprogram.PickerChange) {
    const winnerIndex = Number(event.detail.value);
    updateDraft(this, {
      winnerIndex,
      winner: SEATS[winnerIndex]
    });
  },

  handleWinnerRadioChange(event: WechatMiniprogram.RadioGroupChange) {
    const winner = event.detail.value as Seat;
    updateDraft(this, {
      winner,
      winnerIndex: SEATS.indexOf(winner)
    });
  },

  handleDiscarderChange(event: WechatMiniprogram.PickerChange) {
    const discarderIndex = Number(event.detail.value);
    updateDraft(this, {
      discarderIndex,
      discarder: SEATS[discarderIndex]
    });
  },

  handleDiscarderRadioChange(event: WechatMiniprogram.RadioGroupChange) {
    const discarder = event.detail.value as Seat;
    updateDraft(this, {
      discarder,
      discarderIndex: SEATS.indexOf(discarder)
    });
  },

  handleEventTypeTap(event: WechatMiniprogram.TouchEvent) {
    const eventType = event.currentTarget.dataset.type as RoundEventType;
    updateDraft(this, {
      eventType,
      eventTypeIndex: EVENT_TYPE_OPTIONS.findIndex((option) => option.key === eventType),
      winType: eventType === "tsumo" ? "tsumo" : "ron",
      discarder: eventType === "ron" ? SEATS[this.data.discarderIndex] : ""
    });
  },

  handleNumberInput(event: WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field as "honba" | "riichiSticks";
    updateDraft(this, {
      [field]: parseNonNegativeInteger(event.detail.value)
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
      pointRows: createPointRows(playerPoints)
    });
  },

  handleToggleRiichi(event: WechatMiniprogram.TouchEvent) {
    const seat = event.currentTarget.dataset.seat as Seat;
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
      pointRows: createPointRows(playerPoints),
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
          ? findFirstChildSeat(this.data.dealer)
          : this.data.winner;

    updateDraft(this, {
      eventType: openingYakuman === "" ? this.data.eventType : "tsumo",
      eventTypeIndex:
        openingYakuman === ""
          ? this.data.eventTypeIndex
          : EVENT_TYPE_OPTIONS.findIndex((option) => option.key === "tsumo"),
      winType: openingYakuman === "" ? this.data.winType : "tsumo",
      winner: yakumanWinner,
      winnerIndex: SEATS.indexOf(yakumanWinner),
      discarder: openingYakuman === "" ? this.data.discarder : "",
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
    updateDraft(this, {
      tenpaiSeats: SEATS.reduce<Record<Seat, boolean>>(
        (acc, seat) => ({
          ...acc,
          [seat]: values.has(seat)
        }),
        {} as Record<Seat, boolean>
      )
    });
  },

  handleMeldTypeTap(event: WechatMiniprogram.TouchEvent) {
    const selectedMeldTypeIndex = Number(event.currentTarget.dataset.index);
    updateDraft(this, {
      selectedMeldTypeIndex,
      meldDraftHint: createMeldDraftHint(MELD_TYPE_OPTIONS[selectedMeldTypeIndex].key)
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
      meldDraftTiles: createSlots(4),
      errors: []
    });
  },

  handleRemoveMeld(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const melds = this.data.melds.filter((_meld: Meld, meldIndex: number) => meldIndex !== index);
    updateDraft(this, {
      melds,
      meldRows: createMeldRows(melds)
    });
  },

  handleShowRecords() {
    updateDraft(this, { editingPanel: "records" });
  },

  handleRollback() {
    if (!this.data.recentDraft) {
      this.setData({ errors: ["暂无可回退的最近结算"] });
      return;
    }

    wx.showModal({
      title: "回退结算",
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
    wx.showModal({
      title: "重置复位",
      content: "将清空当前未结算输入并恢复四家 25000 点。",
      success: (result) => {
        if (result.confirm) {
          this.setData(createInitialData(this.data.settlementRecords));
        }
      }
    });
  },

  handlePrepareSettlement() {
    const errors = validateDraft(this.data);

    if (errors.length > 0) {
      this.setData({ errors });
      return;
    }

    if (this.data.eventType !== "draw") {
      const scoringResult = calculateWithRiichi(
        buildHandInput(this.data),
        buildRoundInput(this.data)
      );

      if (!scoringResult.valid) {
        this.setData({ errors: scoringResult.errors });
        return;
      }
    }

    updateDraft(this, {
      editingPanel: "confirm",
      errors: []
    });
  },

  handleConfirmSettlement() {
    const record =
      this.data.eventType === "draw"
        ? createDrawSettlementRecord(
            buildDrawRoundInput(this.data),
            this.data.playerPoints,
            this.data.recentRecord?.id
          )
        : createWinSettlementRecord(this.data);
    const settlementRecords = replaceRecentSettlement(this.data.settlementRecords, record);

    this.setData({
      editing: false,
      editingPanel: "none",
      errors: [],
      resultView: createResultView(record.result, record),
      recentRecord: record,
      recentDraft: createDraftSnapshot(this.data),
      settlementRecords,
      recordRows: createRecordRows(settlementRecords)
    });
  },

  handleEditResult() {
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

    this.setData(createInitialData(this.data.settlementRecords, nextPoints, nextRoundState));
  }
});

function createInitialData(
  settlementRecords: SettlementRecord[] = [],
  initialPoints: PlayerPoints = createDefaultPlayerPoints(),
  roundState: RoundState = createInitialRoundState()
): ScoringPageData {
  const baseData: ScoringPageData = {
    editing: true,
    editingPanel: "none",
    roundWindLabels: ROUND_WIND_LABELS,
    roundIndexLabels: ROUND_INDEX_LABELS,
    seatLabels: SEATS.map((seat) => SEAT_LABELS[seat]),
    eventTypeOptions: EVENT_TYPE_OPTIONS,
    roundWindIndex: roundState.roundWindIndex,
    roundIndex: roundState.roundIndex,
    roundLabel: createRoundLabel(roundState.roundWindIndex, roundState.roundIndex),
    honba: roundState.honba,
    riichiSticks: roundState.riichiSticks,
    dealerIndex: roundState.dealerIndex,
    winnerIndex: 1,
    discarderIndex: 2,
    dealer: SEATS[roundState.dealerIndex],
    winner: "south",
    discarder: "west",
    eventType: "ron",
    eventTypeIndex: 0,
    winType: "ron",
    playerPoints: initialPoints,
    pointRows: createPointRows(initialPoints),
    riichiSeats: createSeatBooleanMap(),
    tenpaiSeats: createSeatBooleanMap(),
    concealedTiles: createSlots(13),
    winningTile: createSlots(1),
    meldDraftTiles: createSlots(16),
    doraIndicators: createSlots(4),
    kanDoraIndicators: createSlots(0),
    uraDoraIndicators: createSlots(4),
    activeDoraIndex: 0,
    selectedMeldTypeIndex: 0,
    meldTypeOptions: MELD_TYPE_OPTIONS,
    meldDraftHint: createMeldDraftHint("chi"),
    meldKanTypes: ["", "", "", ""],
    melds: [],
    meldRows: [],
    conditionOptions: CONDITION_OPTIONS.map((option) => ({ ...option, checked: false })),
    activeTileArea: "concealedTiles",
    errors: [],
    resultView: EMPTY_RESULT_VIEW,
    settlementRecords,
    recentRecord: settlementRecords[settlementRecords.length - 1],
    recentDraft: undefined,
    tableSeats: [],
    tenpaiRows: [],
    riichiStateOptions: [],
    timingConditionOptions: [],
    openingYakumanOptions: [],
    bonusConditionOptions: [],
    handSlotViews: [],
    handTileRows: HAND_TILE_ROWS,
    meldGroupViews: [],
    kanTypeOptions: KAN_TYPE_OPTIONS,
    doraSlotViews: [],
    uraDoraSlotViews: [],
    doraTileRows: DORA_TILE_ROWS,
    summaryRows: [],
    recordRows: createRecordRows(settlementRecords),
    confirmationLines: []
  };

  return {
    ...baseData,
    ...createDerivedPatch(baseData)
  };
}

function updateDraft(
  page: WechatMiniprogram.Page.Instance<ScoringPageData, WechatMiniprogram.IAnyObject>,
  patch: Partial<ScoringPageData>
): void {
  const nextData = {
    ...page.data,
    ...patch
  };

  page.setData({
    ...patch,
    ...createDerivedPatch(nextData)
  });
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
      ...advanceRoundPosition(current, !dealerContinues),
      honba: data.honba + 1,
      riichiSticks: data.riichiSticks
    };
  }

  const dealerContinues = record.event.winner === data.dealer;

  return {
    ...advanceRoundPosition(current, !dealerContinues),
    honba: dealerContinues ? data.honba + 1 : 0,
    riichiSticks: 0
  };
}

function advanceRoundPosition(state: RoundState, rotateDealer: boolean): RoundState {
  if (!rotateDealer) {
    return state;
  }

  const wrappedRound = state.roundIndex >= ROUND_INDEX_LABELS.length - 1;

  return {
    ...state,
    dealerIndex: (state.dealerIndex + 1) % SEATS.length,
    roundIndex: wrappedRound ? 0 : state.roundIndex + 1,
    roundWindIndex: wrappedRound
      ? Math.min(state.roundWindIndex + 1, ROUND_WIND_VALUES.length - 1)
      : state.roundWindIndex
  };
}

function findFirstChildSeat(dealer: Seat): Seat {
  return SEATS.find((seat) => seat !== dealer) ?? "south";
}

function createDerivedPatch(
  data: ScoringPageData
): Pick<
  ScoringPageData,
  | "tableSeats"
  | "tenpaiRows"
  | "riichiStateOptions"
  | "timingConditionOptions"
  | "openingYakumanOptions"
  | "bonusConditionOptions"
  | "handSlotViews"
  | "handTileRows"
  | "meldGroupViews"
  | "melds"
  | "meldRows"
  | "doraSlotViews"
  | "uraDoraSlotViews"
  | "summaryRows"
  | "recordRows"
  | "confirmationLines"
> {
  const inferredMelds = inferMeldsFromDraft(data.meldDraftTiles, data.meldKanTypes);
  const inferredMeldRows = createMeldRows(inferredMelds);
  const dataWithInferredMelds = {
    ...data,
    melds: inferredMelds,
    meldRows: inferredMeldRows
  };

  return {
    tableSeats: createTableSeats(data),
    tenpaiRows: createTenpaiRows(data.tenpaiSeats),
    riichiStateOptions: createRiichiStateOptions(data.conditionOptions),
    timingConditionOptions: createTimingConditionOptions(data.conditionOptions),
    openingYakumanOptions: createOpeningYakumanOptions(data.conditionOptions),
    bonusConditionOptions: createBonusConditionOptions(data.conditionOptions),
    handSlotViews: createHandSlotViews(
      data.concealedTiles,
      data.winningTile,
      data.activeTileArea,
      data.activeDoraIndex
    ),
    handTileRows: HAND_TILE_ROWS,
    meldGroupViews: createMeldGroupViews(
      data.meldDraftTiles,
      data.meldKanTypes,
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
    summaryRows: createSummaryRows(dataWithInferredMelds),
    recordRows: createRecordRows(data.settlementRecords),
    confirmationLines: createConfirmationLines(dataWithInferredMelds)
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

function createSlots(length: number): TileSlotValue[] {
  return Array.from({ length }, () => "");
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

function parseNonNegativeInteger(value: string | number, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function createPointRows(playerPoints: PlayerPoints): PointRow[] {
  return SEATS.map((seat) => ({
    seat,
    label: SEAT_LABELS[seat],
    points: playerPoints[seat]
  }));
}

function createTableSeats(data: ScoringPageData): TableSeatView[] {
  const rankMap = createRankMap(data.playerPoints);

  return (["north", "west", "east", "south"] as Seat[]).map((seat) => ({
    seat,
    label: SEAT_LABELS[seat],
    directionLabel: SEAT_DIRECTION_LABELS[seat],
    points: data.playerPoints[seat],
    rankText: `${rankMap[seat]} 位`,
    riichiText: data.riichiSeats[seat] ? "立直" : "未立直",
    statusBadges: createSeatStatusBadges(data, seat),
    className: [
      `seat-${seat}`,
      seat === data.dealer ? "is-dealer" : "",
      data.eventType !== "draw" && seat === data.winner ? "is-winner" : "",
      data.eventType === "ron" && seat === data.discarder ? "is-discarder" : "",
      data.riichiSeats[seat] ? "is-riichi" : ""
    ]
      .filter(Boolean)
      .join(" ")
  }));
}

function createRankMap(playerPoints: PlayerPoints): Record<Seat, number> {
  return [...SEATS]
    .sort((left, right) => {
      const pointDiff = playerPoints[right] - playerPoints[left];

      return pointDiff || SEATS.indexOf(left) - SEATS.indexOf(right);
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

  if (data.riichiSeats[seat]) {
    badges.push({ type: "riichi", label: "立" });
  }

  if (data.eventType !== "draw" && seat === data.winner) {
    badges.push({ type: "winner", label: "和" });
  }

  if (data.eventType === "ron" && seat === data.discarder) {
    badges.push({ type: "discarder", label: "铳" });
  }

  if (data.eventType === "draw" && data.tenpaiSeats[seat]) {
    badges.push({ type: "tenpai", label: "听" });
  }

  return badges;
}

function createTenpaiRows(tenpaiSeats: Record<Seat, boolean>): TenpaiRow[] {
  return SEATS.map((seat) => ({
    seat,
    label: SEAT_LABELS[seat],
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
  winningTile: readonly TileSlotValue[],
  activeArea: TileArea,
  activeIndex: number
): HandSlotView[] {
  return [
    ...concealedTiles.map((tile, index) => ({
      area: "concealedTiles" as const,
      index,
      tile,
      label: tile ? getTileDisplayName(tile) : "",
      active: activeArea === "concealedTiles" && activeIndex === index,
      winning: false
    })),
    {
      area: "winningTile" as const,
      index: 0,
      tile: winningTile[0] ?? "",
      label: winningTile[0] ? getTileDisplayName(winningTile[0]) : "胡",
      active: activeArea === "winningTile",
      winning: true
    }
  ];
}

function createMeldGroupViews(
  tiles: readonly TileSlotValue[],
  kanTypes: ReadonlyArray<KanMeldType | "">,
  activeArea: TileArea,
  activeIndex: number
): MeldGroupView[] {
  return splitMeldDraftRows(tiles).map((row, groupIndex) => {
    const compact = compactTiles(row);
    const kanType = kanTypes[groupIndex] ?? "";

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
      inferredText: createMeldInferredText(compact, kanType),
      needsKanType: compact.length === 4 && isSameNormalizedTileSet(compact),
      kanType
    };
  });
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
  options: readonly Option<ConditionKey>[]
): Array<RadioOption<TimingConditionKey>> {
  const timingCondition = getTimingCondition(options);

  return TIMING_CONDITION_OPTIONS.map((option) => ({
    ...option,
    checked: option.key === timingCondition
  }));
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
  return [
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
      value: createDoraSummary(data)
    },
    {
      key: "hand",
      title: "手牌",
      value: `手牌 ${compactTiles(data.concealedTiles).length}/13，和牌张 ${compactTiles(data.winningTile).map(getTileDisplayName)[0] ?? "未选"}`
    },
    {
      key: "meld",
      title: "鸣牌",
      value:
        data.melds.length > 0
          ? `${data.melds.length} 组：${data.meldRows.map((row) => row.text).join("；")}`
          : "0 组"
    }
  ];
}

function createEventSummary(data: ScoringPageData): string {
  if (data.eventType === "draw") {
    const tenpaiLabels = selectedSeats(data.tenpaiSeats).map((seat) => SEAT_LABELS[seat]);
    return `荒牌流局：${tenpaiLabels.length > 0 ? tenpaiLabels.join("、") : "无人"}听牌`;
  }

  if (data.eventType === "tsumo") {
    return `自摸：${SEAT_LABELS[data.winner]}`;
  }

  return `荣和：${SEAT_LABELS[data.discarder as Seat]} 放铳，${SEAT_LABELS[data.winner]} 和牌`;
}

function createConditionSummary(data: ScoringPageData): string {
  const labels = data.conditionOptions
    .filter((option) => option.checked)
    .map((option) => option.label);

  return labels.length > 0 ? labels.join(" / ") : "无";
}

function createDoraSummary(data: ScoringPageData): string {
  const counts = [
    `宝${compactTiles(data.doraIndicators).length}`,
    `里${compactTiles(data.uraDoraIndicators).length}`
  ];

  return counts.join(" / ");
}

function createRecordRows(records: readonly SettlementRecord[]): RecordRow[] {
  return records.map((record, index) => ({
    id: record.id,
    title: `第 ${index + 1} 条：${record.event.type === "draw" ? "荒牌流局" : "和牌结算"}`,
    detail: SEATS.map((seat) => `${SEAT_LABELS[seat]} ${record.pointsAfter[seat]}`).join(" / ")
  }));
}

function createMeldDraftHint(type: MeldType): string {
  return type === "chi" || type === "pon" ? "选择 3 张后加入鸣牌" : "选择 4 张后加入鸣牌";
}

function createMeldRows(melds: readonly Meld[]): MeldRow[] {
  return melds.map((meld, index) => ({
    id: `${index}-${meld.type}-${meld.tiles.join("-")}`,
    text: `${MELD_TYPE_OPTIONS.find((option) => option.key === meld.type)?.label ?? "鸣牌"}：${meld.tiles
      .map(getTileDisplayName)
      .join(" ")}`
  }));
}

function buildHandInput(data: ScoringPageData): HandInput {
  const melds = inferMeldsFromDraft(data.meldDraftTiles, data.meldKanTypes);
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
    conditions
  };
}

function buildRoundInput(data: ScoringPageData): RoundInput {
  return {
    roundWind: ROUND_WIND_VALUES[data.roundWindIndex],
    honba: data.honba,
    riichiSticks: data.riichiSticks,
    dealer: data.dealer,
    winner: data.winner,
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
    tenpaiSeats: selectedSeats(data.tenpaiSeats),
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

  if (data.eventType === "ron" && !data.discarder) {
    return ["荣和时需要选择放铳者"];
  }

  if (data.eventType === "ron" && data.winner === data.discarder) {
    return ["放铳者不能与和牌者相同"];
  }

  return validateMeldDrafts(data.meldDraftTiles, data.meldKanTypes);
}

function validateMeldDrafts(
  tiles: readonly TileSlotValue[],
  kanTypes: ReadonlyArray<KanMeldType | "">
): string[] {
  return splitMeldDraftRows(tiles).flatMap((row, groupIndex) => {
    const compact = compactTiles(row);
    const groupLabel = `第 ${groupIndex + 1} 组鸣牌`;

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

function createConfirmationLines(data: ScoringPageData): string[] {
  if (data.eventType === "draw") {
    return [
      `${data.roundLabel} ${data.honba} 本场 ${data.riichiSticks} 供托`,
      createEventSummary(data),
      "荒牌流局后本场 +1，供托继续保留"
    ];
  }

  return [
    `${data.roundLabel} ${data.honba} 本场 ${data.riichiSticks} 供托`,
    createEventSummary(data),
    `手牌 ${compactTiles(data.concealedTiles).length} 张，和牌张 ${compactTiles(data.winningTile).map(getTileDisplayName)[0] ?? "未选"}`,
    `鸣牌 ${data.melds.length} 组，${createDoraSummary(data)}`
  ];
}

function createResultView(result: ScoringResult, record?: SettlementRecord): ResultView {
  const rankMap = createRankMap(result.pointsAfter ?? createDefaultPlayerPoints());

  return {
    limitText: record?.event.type === "draw" ? "荒牌流局" : formatLimit(result),
    han: result.han,
    fu: record?.event.type === "draw" ? "-" : (result.fu ?? "-"),
    basePoints: result.basePoints,
    yakuLines: result.yaku,
    doraLines: result.dora,
    fuLines: result.fuDetails.filter((detail) => !detail.name.startsWith("总符数")),
    scoreRows: SEATS.map((seat) => ({
      seat,
      label: SEAT_LABELS[seat],
      directionLabel: SEAT_DIRECTION_LABELS[seat],
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
    warnings: result.warnings
  };
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

function selectedSeats(map: Record<Seat, boolean>): Seat[] {
  return SEATS.filter((seat) => map[seat]);
}

function isDoraArea(area: TileArea): boolean {
  return area === "doraIndicators" || area === "kanDoraIndicators" || area === "uraDoraIndicators";
}

function createDraftSnapshot(data: ScoringPageData): DraftSnapshot {
  return {
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
    discarder: data.discarder,
    eventType: data.eventType,
    eventTypeIndex: data.eventTypeIndex,
    winType: data.winType,
    playerPoints: { ...data.playerPoints },
    pointRows: createPointRows(data.playerPoints),
    riichiSeats: { ...data.riichiSeats },
    tenpaiSeats: { ...data.tenpaiSeats },
    concealedTiles: [...data.concealedTiles],
    winningTile: [...data.winningTile],
    meldDraftTiles: [...data.meldDraftTiles],
    doraIndicators: [...data.doraIndicators],
    kanDoraIndicators: [...data.kanDoraIndicators],
    uraDoraIndicators: [...data.uraDoraIndicators],
    activeDoraIndex: data.activeDoraIndex,
    selectedMeldTypeIndex: data.selectedMeldTypeIndex,
    meldDraftHint: data.meldDraftHint,
    meldKanTypes: [...data.meldKanTypes],
    melds: data.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    meldRows: [...data.meldRows],
    conditionOptions: data.conditionOptions.map((option) => ({ ...option })),
    activeTileArea: data.activeTileArea
  };
}
