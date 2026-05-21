import type { Seat, WinType } from "../../shared/domain/round/index";

interface SeatView {
  key: Seat;
  label: string;
  className: string;
  role: string;
}

const SEAT_LABELS: Record<Seat, string> = {
  east: "玩家1",
  south: "玩家2",
  west: "玩家3",
  north: "玩家4"
};

Component({
  properties: {
    roundLabel: {
      type: String,
      value: "东一局"
    },
    honba: {
      type: Number,
      value: 0
    },
    riichiSticks: {
      type: Number,
      value: 0
    },
    winner: {
      type: String,
      value: "south"
    },
    dealer: {
      type: String,
      value: "east"
    },
    discarder: {
      type: String,
      value: ""
    },
    winType: {
      type: String,
      value: "ron"
    }
  },

  data: {
    seats: createSeatViews("south", "east", "", "ron")
  },

  observers: {
    "winner,dealer,discarder,winType": function observeTableContext(
      winner: Seat,
      dealer: Seat,
      discarder: Seat | "",
      winType: WinType
    ) {
      this.setData({
        seats: createSeatViews(winner, dealer, discarder, winType)
      });
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        seats: createSeatViews(
          this.properties.winner as Seat,
          this.properties.dealer as Seat,
          this.properties.discarder as Seat | "",
          this.properties.winType as WinType
        )
      });
    }
  }
});

function createSeatViews(
  winner: Seat,
  dealer: Seat,
  discarder: Seat | "",
  winType: WinType
): SeatView[] {
  return (["north", "west", "east", "south"] as Seat[]).map((seat) => {
    const roles = [
      seat === dealer ? "亲" : "",
      seat === winner ? "和" : "",
      winType === "ron" && seat === discarder ? "铳" : ""
    ].filter(Boolean);

    return {
      key: seat,
      label: SEAT_LABELS[seat],
      className: [
        seat,
        seat === winner ? "winner" : "",
        seat === dealer ? "dealer" : "",
        winType === "ron" && seat === discarder ? "discarder" : ""
      ]
        .filter(Boolean)
        .join(" "),
      role: roles.join(" / ")
    };
  });
}
