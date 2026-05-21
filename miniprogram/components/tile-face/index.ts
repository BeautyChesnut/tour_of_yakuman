const HONOR_LABELS: Record<string, string> = {
  east: "东",
  south: "南",
  west: "西",
  north: "北",
  white: "白",
  green: "发",
  red: "中"
};

const SUIT_LABELS: Record<string, string> = {
  m: "万",
  p: "筒",
  s: "索"
};

Component({
  properties: {
    tile: {
      type: String,
      value: ""
    },
    label: {
      type: String,
      value: ""
    },
    size: {
      type: String,
      value: "compact"
    },
    active: {
      type: Boolean,
      value: false
    },
    winning: {
      type: Boolean,
      value: false
    },
    emptyText: {
      type: String,
      value: ""
    }
  },

  data: {
    imageSrc: "",
    mainLabel: "",
    suitLabel: "",
    tileClass: "empty"
  },

  observers: {
    "tile,label,size,active,winning,emptyText": function updateTileFace(
      tile: string,
      label: string,
      size: string,
      active: boolean,
      winning: boolean,
      emptyText: string
    ) {
      const parsed = parseTileFace(tile, label, emptyText);
      this.setData({
        ...parsed,
        imageSrc: tile ? `/assets/tiles/generated/faces/tile-${tile}.png` : "",
        tileClass: [
          parsed.tileClass,
          size === "normal" ? "normal" : "compact",
          active ? "active" : "",
          winning ? "winning" : ""
        ]
          .filter(Boolean)
          .join(" ")
      });
    }
  },

  methods: {
    handleImageError() {
      this.setData({ imageSrc: "" });
    }
  }
});

function parseTileFace(
  tile: string,
  fallbackLabel: string,
  emptyText: string
): { mainLabel: string; suitLabel: string; tileClass: string } {
  if (!tile) {
    return {
      mainLabel: emptyText,
      suitLabel: "",
      tileClass: "empty"
    };
  }

  if (tile.startsWith("red5")) {
    const suit = tile.slice(-1);
    return {
      mainLabel: "0",
      suitLabel: SUIT_LABELS[suit] ?? "",
      tileClass: `number suit-${suit} red-five`
    };
  }

  if (HONOR_LABELS[tile]) {
    const dragonClass = tile === "red" ? "dragon-red" : tile === "green" ? "dragon-green" : "honor";

    return {
      mainLabel: HONOR_LABELS[tile],
      suitLabel: tile === "white" ? "白" : "",
      tileClass: dragonClass
    };
  }

  const rank = tile[0];
  const suit = tile[1];

  return {
    mainLabel: rank || fallbackLabel,
    suitLabel: SUIT_LABELS[suit] ?? "",
    tileClass: `number suit-${suit}`
  };
}
