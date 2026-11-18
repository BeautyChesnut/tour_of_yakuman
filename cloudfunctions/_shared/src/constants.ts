export const CLOUD_COLLECTIONS = {
  users: "users",
  rooms: "rooms",
  roomStates: "roomStates",
  roomSettlementRecords: "roomSettlementRecords"
} as const;

export const CLOUD_FUNCTIONS = {
  login: "login",
  createRoom: "createRoom",
  joinRoom: "joinRoom",
  leaveRoom: "leaveRoom",
  transferRoomOwner: "transferRoomOwner",
  shuffleRoomSeats: "shuffleRoomSeats",
  updateRoomState: "updateRoomState",
  confirmSettlement: "confirmSettlement"
} as const;
