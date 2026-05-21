import { getTileDisplayName } from "../../shared/domain/tiles/index";
import type { Tile } from "../../shared/domain/tiles/index";

interface TileOption {
  tile: Tile;
  label: string;
}

interface TileRow {
  key: string;
  label: string;
  tiles: TileOption[];
}

interface TileSlotView {
  tile?: Tile;
  label?: string;
}

type TileSlotValue = Tile | "";

const TILE_ROWS: TileRow[] = [
  { key: "m", label: "万", tiles: createNumberTiles("m", "red5m") },
  { key: "s", label: "索", tiles: createNumberTiles("s", "red5s") },
  { key: "p", label: "筒", tiles: createNumberTiles("p", "red5p") },
  {
    key: "z",
    label: "字",
    tiles: (["east", "south", "west", "north", "white", "green", "red"] as Tile[]).map(toOption)
  }
];

Component({
  properties: {
    title: {
      type: String,
      value: ""
    },
    hint: {
      type: String,
      value: ""
    },
    area: {
      type: String,
      value: ""
    },
    tiles: {
      type: Array,
      value: []
    },
    expanded: {
      type: Boolean,
      value: true
    }
  },

  data: {
    activeIndex: 0,
    tileRows: TILE_ROWS,
    slots: [] as TileSlotView[]
  },

  observers: {
    tiles(tiles: TileSlotValue[]) {
      this.setData({
        slots: tiles.map((tile) => ({
          tile: tile || undefined,
          label: tile ? getTileDisplayName(tile) : ""
        }))
      });
    }
  },

  lifetimes: {
    attached() {
      const tiles = this.properties.tiles as TileSlotValue[];
      this.setData({
        slots: tiles.map((tile) => ({
          tile: tile || undefined,
          label: tile ? getTileDisplayName(tile) : ""
        }))
      });
    }
  },

  methods: {
    handleHeaderTap() {
      this.triggerFocus();
    },

    handleSlotTap(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index);
      this.setData({ activeIndex: index });
      this.triggerFocus();
    },

    handleTileTap(event: WechatMiniprogram.TouchEvent) {
      const tile = event.currentTarget.dataset.tile as Tile;
      this.triggerEvent("fill", {
        area: this.properties.area,
        index: this.data.activeIndex,
        tile
      });
      this.setData({
        activeIndex: findNextActiveIndex(
          this.properties.tiles as TileSlotValue[],
          this.data.activeIndex
        )
      });
    },

    handleClearTap() {
      this.triggerEvent("clear", {
        area: this.properties.area,
        index: this.data.activeIndex
      });
    },

    triggerFocus() {
      this.triggerEvent("focusarea", {
        area: this.properties.area
      });
    }
  }
});

function createNumberTiles(suit: "m" | "p" | "s", redFive: Tile): TileOption[] {
  return [
    ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => toOption(`${rank}${suit}`)),
    { tile: redFive, label: "0" }
  ];
}

function toOption(tile: Tile): TileOption {
  return {
    tile,
    label: getTileDisplayName(tile)
  };
}

function findNextActiveIndex(tiles: readonly TileSlotValue[], currentIndex: number): number {
  const nextEmptyIndex = tiles.findIndex((tile, index) => index > currentIndex && tile === "");

  if (nextEmptyIndex >= 0) {
    return nextEmptyIndex;
  }

  return Math.min(currentIndex + 1, Math.max(tiles.length - 1, 0));
}
