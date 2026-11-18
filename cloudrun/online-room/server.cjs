const http = require("node:http");
const zlib = require("node:zlib");
const mysql = require("mysql2/promise");

const PORT = Number(process.env.PORT || 80);
const SEATS = ["east", "south", "west", "north"];
const INITIAL_ROOM_STATE_VERSION = 1;
const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MYSQL_DATABASE = "tour_of_yakuman";
const API_VERSION = 2;
const SERVICE_VERSION =
  process.env.K_REVISION ||
  process.env.CLOUD_RUN_REVISION ||
  process.env.SERVICE_VERSION ||
  "local";

let pool;
let schemaReadyPromise;

const server = http.createServer(async (request, response) => {
  const requestId = createRequestId();
  const startedAt = Date.now();

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "仅支持 POST 请求" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const cloudbaseContext = parseCloudbaseContext(request.headers["x-cloudbase-context"]);
    const openIdInfo = getOpenIdInfo(request, cloudbaseContext);

    logInfo(requestId, "request:start", {
      method: request.method,
      path: getPath(request.url || ""),
      hasCloudbaseContext: Boolean(cloudbaseContext),
      cloudbaseContextKeys: cloudbaseContext ? Object.keys(cloudbaseContext).sort() : [],
      cloudbaseEnvId: getCloudbaseEnvId(cloudbaseContext) || "",
      hasExtendedContext: hasExtendedContext(cloudbaseContext),
      openIdSource: openIdInfo.source,
      openId: maskId(openIdInfo.openId),
      bodyKeys: body && typeof body === "object" ? Object.keys(body).sort() : []
    });

    if (!openIdInfo.openId) {
      logWarn(requestId, "auth:missing-openid", {
        headerKeys: getKnownHeaderKeys(request)
      });
      sendJson(response, 401, createErrorResponse(new Error("无法获取微信用户身份"), requestId));
      return;
    }

    if (getPath(request.url || "") === "/api/diagnostics/events") {
      logClientDiagnostic(requestId, body);
      sendJson(response, 200, withServiceMetadata({ accepted: true }, requestId));
      return;
    }

    const store = await createMySqlStore(requestId);
    const result = await routeRequest(request.url || "", body, openIdInfo.openId, store, requestId);
    logInfo(requestId, "request:success", {
      path: getPath(request.url || ""),
      durationMs: Date.now() - startedAt,
      resultKeys: result && typeof result === "object" ? Object.keys(result).sort() : []
    });
    sendJson(response, 200, withServiceMetadata(result, requestId));
  } catch (error) {
    logError(requestId, "request:error", error, {
      path: getPath(request.url || ""),
      durationMs: Date.now() - startedAt
    });
    sendJson(response, 400, createErrorResponse(error, requestId));
  }
});

server.listen(PORT, () => {
  console.log(`online room service listening on ${PORT}`);
});

async function routeRequest(url, body, openId, store, requestId) {
  const path = getPath(url);

  if (path === "/api/login") {
    return login(body, openId, store, requestId);
  }
  if (path === "/api/rooms") {
    return createRoom(body, openId, store, requestId);
  }
  if (path === "/api/rooms/join") {
    return joinRoom(body, openId, store, requestId);
  }
  if (path === "/api/rooms/leave") {
    return leaveRoom(body, openId, store, requestId);
  }
  if (path === "/api/rooms/owner/transfer") {
    return transferRoomOwner(body, openId, store, requestId);
  }
  if (path === "/api/rooms/seats/shuffle") {
    return shuffleRoomSeats(body, openId, store, requestId);
  }
  if (path === "/api/rooms/state") {
    return updateRoomState(body, openId, store, requestId);
  }
  if (path === "/api/rooms/settlement") {
    return confirmSettlement(body, openId, store, requestId);
  }

  throw new Error("接口不存在");
}

async function login(body, openId, store, requestId) {
  const now = Date.now();
  const existing = await store.getUser(openId, requestId);
  const user = {
    openId,
    displayName: body.displayName || existing?.displayName,
    avatarUrl: body.avatarUrl || existing?.avatarUrl,
    membership: normalizeMembership(existing?.membership),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastLoginAt: now
  };

  await store.saveUser(openId, user, requestId);

  return {
    session: {
      openId,
      user,
      loggedInAt: now
    }
  };
}

function normalizeMembership(membership) {
  if (membership?.plan !== "vip") {
    return { plan: "free" };
  }

  return Number.isFinite(membership.expiresAt)
    ? { plan: "vip", expiresAt: membership.expiresAt }
    : { plan: "vip" };
}

async function createRoom(body, ownerOpenId, store, requestId) {
  const now = Date.now();
  const roomId = createId("room");
  const ownerSeat = normalizeSeat(body.seat) || "east";
  const room = {
    id: roomId,
    roomCode: createRoomCode(),
    ownerOpenId,
    seatMap: createInitialSeatMap(ownerSeat, {
      openId: ownerOpenId,
      displayName: body.displayName,
      avatarUrl: body.avatarUrl,
      joinedAt: now
    }),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + DEFAULT_ROOM_TTL_MS
  };
  const state = createInitialRoomState(roomId, ownerOpenId, now);

  await store.saveRoomWithState(room, state, requestId);

  return { room, state };
}

async function joinRoom(body, openId, store, requestId) {
  const roomCode = normalizeRoomCode(body.roomCode || "");

  if (!roomCode) {
    throw new Error("请输入房间码");
  }

  const room = await store.getRoomByCode(roomCode, requestId);

  if (!room) {
    throw new Error("房间不存在或已失效");
  }

  if (!canJoinRoom(room, Date.now())) {
    throw new Error(room.status === "closed" ? "房间已结束" : "房间已失效");
  }

  const state = await store.getRoomState(room.id, requestId);

  if (!state) {
    throw new Error("房间状态不存在，请联系房主重新创建房间");
  }

  const existingSeat = findMemberSeat(room, openId);

  if (existingSeat) {
    const nextRoom = createRoomWithUpdatedMember(room, existingSeat, body, Date.now());

    if (nextRoom !== room) {
      await store.saveRoom(nextRoom, requestId, "rooms.updateMemberProfile");
    }

    return { room: nextRoom, state };
  }

  const seat = resolveSeat(room, normalizeSeat(body.seat));
  const now = Date.now();
  const seatMap = {
    ...room.seatMap,
    [seat]: {
      openId,
      displayName: body.displayName,
      avatarUrl: body.avatarUrl,
      joinedAt: now
    }
  };
  const nextRoom = {
    ...room,
    seatMap,
    updatedAt: now
  };

  await store.saveRoom(nextRoom, requestId, "rooms.updateSeatMap");

  return { room: nextRoom, state };
}

async function updateRoomState(body, openId, store, requestId) {
  const roomId = body.roomId;
  const room = await store.getRoom(roomId, requestId);

  if (!room) {
    throw new Error("房间不存在或已失效");
  }
  if (room.ownerOpenId !== openId) {
    throw new Error("仅房主可编辑");
  }

  const currentState = await store.getRoomState(roomId, requestId);

  if (!currentState) {
    throw new Error("房间状态不存在，请重新进入房间");
  }
  if (body.baseVersion !== currentState.version) {
    throw new Error("房间状态已更新，请刷新后重试");
  }

  const now = Date.now();
  const nextState = {
    ...currentState,
    ...body.sharedState,
    roomId,
    version: currentState.version + 1,
    updatedBy: openId,
    updatedAt: now
  };

  await store.saveRoomState(nextState, requestId, "roomStates.update");

  return { state: nextState };
}

async function shuffleRoomSeats(body, openId, store, requestId) {
  const roomId = body.roomId;
  const room = await store.getRoom(roomId, requestId);

  if (!room) {
    throw new Error("房间不存在或已失效");
  }
  if (room.ownerOpenId !== openId) {
    throw new Error("仅房主可随机座位");
  }

  const state = await store.getRoomState(roomId, requestId);

  if (!state) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  const members = SEATS.map((seat) => room.seatMap?.[seat]).filter(Boolean);

  if (members.length !== SEATS.length) {
    throw new Error("房间满 4 人后才能随机座位");
  }

  const now = Date.now();
  const shuffledMembers = shuffleArray(members);
  const seatMap = SEATS.reduce(
    (nextSeatMap, seat, index) => ({
      ...nextSeatMap,
      [seat]: shuffledMembers[index]
    }),
    {}
  );
  const nextRoom = {
    ...room,
    seatMap,
    updatedAt: now
  };

  await store.saveRoom(nextRoom, requestId, "rooms.shuffleSeats");

  return { room: nextRoom, state };
}

async function leaveRoom(body, openId, store, requestId) {
  const roomId = body.roomId;
  const room = await store.getRoom(roomId, requestId);

  if (!room) {
    throw new Error("房间不存在或已失效");
  }

  const state = await store.getRoomState(roomId, requestId);

  if (!state) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  const memberSeat = findMemberSeat(room, openId);

  if (!memberSeat) {
    return { room, state };
  }

  const now = Date.now();
  const seatMap = createSeatMapWithoutMember(room, openId);
  const nextOwnerOpenId =
    room.ownerOpenId === openId ? pickRandomRoomOwnerOpenId(seatMap) : room.ownerOpenId;
  const nextRoom = nextOwnerOpenId
    ? {
        ...room,
        ownerOpenId: nextOwnerOpenId,
        seatMap,
        updatedAt: now
      }
    : {
        ...room,
        status: "closed",
        closedAt: now,
        seatMap,
        updatedAt: now
      };

  await store.saveRoom(nextRoom, requestId, "rooms.leave");

  return { room: nextRoom, state };
}

async function transferRoomOwner(body, openId, store, requestId) {
  const roomId = body.roomId;
  const targetOpenId = typeof body.targetOpenId === "string" ? body.targetOpenId.trim() : "";

  if (!roomId) {
    throw new Error("缺少房间 ID");
  }
  if (!targetOpenId) {
    throw new Error("请选择要转让的成员");
  }

  const room = await store.getRoom(roomId, requestId);

  if (!room || room.status === "closed" || room.status === "expired") {
    throw new Error("房间不存在或已失效");
  }
  if (room.ownerOpenId !== openId) {
    throw new Error("仅房主可转让房主");
  }
  if (targetOpenId === openId) {
    throw new Error("不能将房主转让给自己");
  }
  if (!findMemberSeat(room, targetOpenId)) {
    throw new Error("目标成员不在当前房间");
  }

  const state = await store.getRoomState(roomId, requestId);

  if (!state) {
    throw new Error("房间状态不存在，请重新进入房间");
  }

  const nextRoom = {
    ...room,
    ownerOpenId: targetOpenId,
    updatedAt: Date.now()
  };

  await store.saveRoom(nextRoom, requestId, "rooms.transferOwner");

  return { room: nextRoom, state };
}

async function confirmSettlement(body, openId, store, requestId) {
  const roomId = body.roomId;
  const record = body.record;

  if (!record?.result?.valid) {
    throw new Error("结算结果无效，请返回修改");
  }

  const room = await store.getRoom(roomId, requestId);

  if (!room) {
    throw new Error("房间不存在或已失效");
  }
  if (room.ownerOpenId !== openId) {
    throw new Error("仅房主可确认结算");
  }

  const currentState = await store.getRoomState(roomId, requestId);

  if (!currentState) {
    throw new Error("房间状态不存在，请重新进入房间");
  }
  if (body.baseVersion !== currentState.version) {
    throw new Error("房间状态已更新，请刷新后重试");
  }

  const now = Date.now();
  const roomRecord = {
    roomId,
    record,
    createdBy: openId,
    createdAt: now,
    updatedAt: now
  };
  const recordIds = currentState.recordIds.includes(record.id)
    ? currentState.recordIds
    : [...currentState.recordIds, record.id];
  const nextState = {
    ...currentState,
    playerPoints: record.pointsAfter,
    recentRecordId: record.id,
    recordIds,
    version: currentState.version + 1,
    updatedBy: openId,
    updatedAt: now
  };

  await store.saveSettlementAndState(`${roomId}_${record.id}`, roomRecord, nextState, requestId);

  return { state: nextState, record: roomRecord };
}

async function createMySqlStore(requestId) {
  const db = await getPool(requestId);
  await ensureMySqlSchema(db, requestId);

  return {
    getUser: (openId, id) => getJsonRow(db, "online_users", "open_id", openId, id, "users.get"),
    saveUser: (openId, user, id) =>
      executeSql(
        db,
        id,
        "users.set",
        "INSERT INTO online_users (open_id, data, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at), last_login_at = VALUES(last_login_at)",
        [
          openId,
          stringifyJson(user),
          toMysqlDate(user.createdAt),
          toMysqlDate(user.updatedAt),
          toMysqlDate(user.lastLoginAt)
        ]
      ),
    getRoom: (roomId, id) => getJsonRow(db, "online_rooms", "id", roomId, id, "rooms.get"),
    getRoomByCode: async (roomCode, id) => {
      const rows = await querySql(
        db,
        id,
        "rooms.queryByCode",
        "SELECT data FROM online_rooms WHERE room_code = ? LIMIT 1",
        [roomCode]
      );
      return rows[0] ? parseJson(rows[0].data) : undefined;
    },
    saveRoom: (room, id, operation = "rooms.set") => saveRoom(db, room, id, operation),
    getRoomState: (roomId, id) =>
      getJsonRow(db, "online_room_states", "room_id", roomId, id, "roomStates.get"),
    saveRoomState: (state, id, operation = "roomStates.set") =>
      saveRoomState(db, state, id, operation),
    saveRoomWithState: async (room, state, id) => {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await saveRoom(connection, room, id, "rooms.set");
        await saveRoomState(connection, state, id, "roomStates.set");
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    saveSettlementAndState: async (recordId, record, state, id) => {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await executeSql(
          connection,
          id,
          "roomSettlementRecords.set",
          "INSERT INTO online_room_settlement_records (id, room_id, record_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)",
          [
            recordId,
            record.roomId,
            record.record.id,
            stringifyJson(record),
            toMysqlDate(record.createdAt),
            toMysqlDate(record.updatedAt)
          ]
        );
        await saveRoomState(connection, state, id, "roomStates.updateAfterSettlement");
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
  };
}

async function getPool(requestId) {
  if (pool) {
    return pool;
  }

  const config = getMySqlConfig();
  const { database, ...bootstrapConfig } = config;
  const bootstrapPool = mysql.createPool({
    ...bootstrapConfig,
    waitForConnections: true,
    connectionLimit: 2,
    multipleStatements: false
  });

  await executeSql(
    bootstrapPool,
    requestId,
    "mysql.createDatabase",
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrapPool.end();

  pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 5,
    multipleStatements: false
  });

  logInfo(requestId, "mysql:init", {
    host: config.host,
    port: config.port,
    database: config.database,
    user: maskId(config.user),
    hasPassword: Boolean(config.password)
  });

  return pool;
}

async function ensureMySqlSchema(db, requestId) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureMySqlSchemaOnce(db, requestId).catch((error) => {
      schemaReadyPromise = undefined;
      throw error;
    });
  }

  return schemaReadyPromise;
}

async function ensureMySqlSchemaOnce(db, requestId) {
  await executeSql(
    db,
    requestId,
    "mysql.schema.users",
    "CREATE TABLE IF NOT EXISTS online_users (open_id VARCHAR(128) PRIMARY KEY, data LONGTEXT NOT NULL, created_at DATETIME(3) NULL, updated_at DATETIME(3) NULL, last_login_at DATETIME(3) NULL) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await executeSql(
    db,
    requestId,
    "mysql.schema.rooms",
    "CREATE TABLE IF NOT EXISTS online_rooms (id VARCHAR(128) PRIMARY KEY, room_code VARCHAR(16) NOT NULL, owner_open_id VARCHAR(128) NOT NULL, status VARCHAR(32) NOT NULL, expires_at DATETIME(3) NULL, updated_at DATETIME(3) NULL, data LONGTEXT NOT NULL, UNIQUE KEY uniq_room_code (room_code), KEY idx_owner_open_id (owner_open_id), KEY idx_status_expires (status, expires_at)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await executeSql(
    db,
    requestId,
    "mysql.schema.roomStates",
    "CREATE TABLE IF NOT EXISTS online_room_states (room_id VARCHAR(128) PRIMARY KEY, version INT NOT NULL, updated_at DATETIME(3) NULL, data LONGTEXT NOT NULL) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await executeSql(
    db,
    requestId,
    "mysql.schema.roomSettlementRecords",
    "CREATE TABLE IF NOT EXISTS online_room_settlement_records (id VARCHAR(191) PRIMARY KEY, room_id VARCHAR(128) NOT NULL, record_id VARCHAR(128) NOT NULL, created_at DATETIME(3) NULL, updated_at DATETIME(3) NULL, data LONGTEXT NOT NULL, KEY idx_room_id (room_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  logInfo(requestId, "mysql:schema:ready");
}

function getMySqlConfig() {
  const address = process.env.MYSQL_ADDRESS;
  const user = process.env.MYSQL_USERNAME || process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE || process.env.MYSQL_DB || DEFAULT_MYSQL_DATABASE;

  if (!address || !user || !password) {
    throw new Error("缺少 MySQL 环境变量 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD");
  }

  const { host, port } = parseMySqlAddress(address);

  return {
    host,
    port,
    user,
    password,
    database,
    charset: "utf8mb4",
    timezone: "Z"
  };
}

function parseMySqlAddress(address) {
  const value = String(address).replace(/^mysql:\/\//, "");
  const [host, portText] = value.split(":");

  return {
    host,
    port: Number(portText || process.env.MYSQL_PORT || 3306)
  };
}

async function getJsonRow(db, table, column, value, requestId, operation) {
  const rows = await querySql(
    db,
    requestId,
    operation,
    `SELECT data FROM ${table} WHERE ${column} = ? LIMIT 1`,
    [value]
  );
  return rows[0] ? parseJson(rows[0].data) : undefined;
}

async function saveRoom(db, room, requestId, operation) {
  return executeSql(
    db,
    requestId,
    operation,
    "INSERT INTO online_rooms (id, room_code, owner_open_id, status, expires_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE room_code = VALUES(room_code), owner_open_id = VALUES(owner_open_id), status = VALUES(status), expires_at = VALUES(expires_at), updated_at = VALUES(updated_at), data = VALUES(data)",
    [
      room.id,
      room.roomCode,
      room.ownerOpenId,
      room.status,
      toMysqlDate(room.expiresAt),
      toMysqlDate(room.updatedAt),
      stringifyJson(room)
    ]
  );
}

async function saveRoomState(db, state, requestId, operation) {
  return executeSql(
    db,
    requestId,
    operation,
    "INSERT INTO online_room_states (room_id, version, updated_at, data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE version = VALUES(version), updated_at = VALUES(updated_at), data = VALUES(data)",
    [state.roomId, state.version, toMysqlDate(state.updatedAt), stringifyJson(state)]
  );
}

async function querySql(db, requestId, operation, sql, params = []) {
  const startedAt = Date.now();

  try {
    const [rows] = await db.execute(sql, params);
    logInfo(requestId, `db:${operation}:ok`, {
      durationMs: Date.now() - startedAt,
      rowCount: Array.isArray(rows) ? rows.length : undefined
    });
    return rows;
  } catch (error) {
    logError(requestId, `db:${operation}:error`, error, {
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}

async function executeSql(db, requestId, operation, sql, params = []) {
  const startedAt = Date.now();

  try {
    const [result] = await db.execute(sql, params);
    logInfo(requestId, `db:${operation}:ok`, {
      durationMs: Date.now() - startedAt,
      affectedRows: result?.affectedRows,
      insertId: result?.insertId
    });
    return result;
  } catch (error) {
    logError(requestId, `db:${operation}:error`, error, {
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value);
}

function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function toMysqlDate(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString().slice(0, 23).replace("T", " ");
}

function createInitialRoomState(roomId, updatedBy, now) {
  return {
    roomId,
    version: INITIAL_ROOM_STATE_VERSION,
    round: {
      roundWind: "east",
      roundIndex: 0,
      honba: 0,
      riichiSticks: 0,
      dealer: "east",
      eventType: "ron",
      winType: "ron"
    },
    playerPoints: createDefaultPlayerPoints(),
    hand: {
      concealedTiles: [],
      melds: []
    },
    dora: {
      doraIndicators: [],
      kanDoraIndicators: [],
      uraDoraIndicators: []
    },
    conditions: {
      riichi: false,
      doubleRiichi: false,
      ippatsu: false,
      menzenTsumo: false,
      haitei: false,
      houtei: false,
      rinshan: false,
      chankan: false,
      tenhou: false,
      chiihou: false,
      enableUraDora: false
    },
    riichiSeats: createSeatBooleanMap(),
    tenpaiSeats: createSeatBooleanMap(),
    recordIds: [],
    updatedBy,
    updatedAt: now
  };
}

function createDefaultPlayerPoints() {
  return SEATS.reduce((points, seat) => ({ ...points, [seat]: 25000 }), {});
}

function createSeatBooleanMap() {
  return SEATS.reduce((map, seat) => ({ ...map, [seat]: false }), {});
}

function createInitialSeatMap(ownerSeat, owner) {
  return SEATS.reduce(
    (seatMap, seat) => ({ ...seatMap, [seat]: seat === ownerSeat ? owner : undefined }),
    {}
  );
}

function findMemberSeat(room, openId) {
  return SEATS.find((seat) => room.seatMap?.[seat]?.openId === openId) || "";
}

function createSeatMapWithoutMember(room, openId) {
  return SEATS.reduce(
    (seatMap, seat) => ({
      ...seatMap,
      [seat]: room.seatMap?.[seat]?.openId === openId ? undefined : room.seatMap?.[seat]
    }),
    {}
  );
}

function pickRandomRoomOwnerOpenId(seatMap) {
  const candidates = SEATS.map((seat) => seatMap?.[seat]?.openId).filter(Boolean);

  if (candidates.length === 0) {
    return "";
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function createRoomWithUpdatedMember(room, seat, body, now) {
  const member = room.seatMap?.[seat];

  if (!member) {
    return room;
  }

  const nextMember = {
    ...member,
    displayName: body.displayName || member.displayName,
    avatarUrl: body.avatarUrl || member.avatarUrl
  };

  if (nextMember.displayName === member.displayName && nextMember.avatarUrl === member.avatarUrl) {
    return room;
  }

  return {
    ...room,
    seatMap: {
      ...room.seatMap,
      [seat]: nextMember
    },
    updatedAt: now
  };
}

function resolveSeat(room, requestedSeat) {
  if (requestedSeat) {
    if (room.seatMap?.[requestedSeat]) {
      throw new Error("座位已被占用，请选择其他空座位");
    }

    return requestedSeat;
  }

  const emptySeats = SEATS.filter((seat) => !room.seatMap?.[seat]);
  if (emptySeats.length === 0) {
    throw new Error("房间人数已满");
  }

  return emptySeats[Math.floor(Math.random() * emptySeats.length)];
}

function shuffleArray(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const item = shuffled[index];

    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = item;
  }

  return shuffled;
}

function canJoinRoom(room, now) {
  return (
    room.status !== "closed" &&
    room.status !== "expired" &&
    (!room.expiresAt || room.expiresAt > now)
  );
}

function normalizeSeat(seat) {
  return SEATS.includes(seat) ? seat : undefined;
}

function normalizeRoomCode(value) {
  return String(value).replace(/\D/g, "").slice(0, 6);
}

function createRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCloudbaseEnvId(cloudbaseContext) {
  return (
    cloudbaseContext?.envID ||
    cloudbaseContext?.envId ||
    cloudbaseContext?.ENVID ||
    process.env.CLOUDBASE_ENV_ID ||
    process.env.TCB_ENV ||
    process.env.SCF_NAMESPACE ||
    ""
  );
}

function getOpenIdInfo(request, cloudbaseContext) {
  const headerOpenId =
    request.headers["x-wx-openid"] ||
    request.headers["x-wx-from-openid"] ||
    request.headers["x-wx-source-openid"] ||
    request.headers["x-wx-user-openid"];

  if (headerOpenId) {
    return { openId: headerOpenId, source: "header" };
  }

  const contextOpenId =
    cloudbaseContext?.openId ||
    cloudbaseContext?.openid ||
    cloudbaseContext?.OPENID ||
    cloudbaseContext?.wxOpenId ||
    cloudbaseContext?.uid ||
    cloudbaseContext?.UID;

  return { openId: contextOpenId, source: contextOpenId ? "cloudbase-context" : "missing" };
}

function parseCloudbaseContext(value) {
  if (!value) {
    return undefined;
  }

  const rawValue = String(value);
  const parsers = [
    () => JSON.parse(rawValue),
    () => JSON.parse(Buffer.from(rawValue, "base64").toString("utf8")),
    () => JSON.parse(zlib.gunzipSync(Buffer.from(rawValue, "base64")).toString("utf8")),
    () => JSON.parse(zlib.gunzipSync(Buffer.from(rawValue, "latin1")).toString("utf8"))
  ];

  for (const parse of parsers) {
    try {
      return parse();
    } catch {
      // Try the next known encoding format.
    }
  }

  console.warn("failed to parse x-cloudbase-context");
  return undefined;
}

function hasExtendedContext(cloudbaseContext) {
  return Boolean(
    cloudbaseContext?.extendedContext ||
    cloudbaseContext?.extended_context ||
    cloudbaseContext?.EXTENDED_CONTEXT
  );
}

function getKnownHeaderKeys(request) {
  return Object.keys(request.headers)
    .filter((key) => key.startsWith("x-wx") || key.startsWith("x-cloudbase"))
    .sort();
}

function getPath(url) {
  return url.split("?")[0];
}

function createRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function maskId(value) {
  if (!value) {
    return "";
  }

  const text = String(value);

  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`;
  }

  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function logInfo(requestId, event, detail = {}) {
  console.log(JSON.stringify({ level: "info", requestId, event, ...detail }));
}

function logWarn(requestId, event, detail = {}) {
  console.warn(JSON.stringify({ level: "warn", requestId, event, ...detail }));
}

function logError(requestId, event, error, detail = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      event,
      ...detail,
      errorName: error?.name || "",
      errorCode: error?.code || "",
      errorMessage: getErrorMessage(error),
      requestErrorId: error?.requestId || ""
    })
  );
}

function logClientDiagnostic(requestId, body) {
  const allowedActions = new Set([
    "login",
    "createRoom",
    "joinRoom",
    "leaveRoom",
    "transferRoomOwner",
    "shuffleRoomSeats",
    "updateRoomState",
    "confirmSettlement",
    "unhandledError",
    "unhandledRejection"
  ]);
  const action = allowedActions.has(body?.action) ? body.action : "unknown";

  logWarn(requestId, "client:diagnostic", {
    action,
    errorCode: normalizeDiagnosticText(body?.errorCode, 48),
    sourceRequestId: normalizeDiagnosticText(body?.requestId, 80),
    clientVersion: normalizeDiagnosticText(body?.clientVersion, 32),
    environment: normalizeDiagnosticText(body?.environment, 16),
    networkType: normalizeDiagnosticText(body?.networkType, 16),
    durationMs: normalizeDiagnosticDuration(body?.durationMs),
    occurredAt: normalizeDiagnosticTimestamp(body?.occurredAt)
  });
}

function normalizeDiagnosticText(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizeDiagnosticDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) ? Math.max(0, Math.min(Math.round(duration), 120000)) : 0;
}

function normalizeDiagnosticTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function withServiceMetadata(data, requestId) {
  return {
    ...(data && typeof data === "object" ? data : { data }),
    _service: {
      apiVersion: API_VERSION,
      serviceVersion: SERVICE_VERSION,
      requestId
    }
  };
}

function createErrorResponse(error, requestId) {
  const code = getBusinessErrorCode(error);

  return withServiceMetadata(
    {
      error: getErrorMessage(error),
      code,
      requestId,
      retryable: code === "SERVICE_ERROR"
    },
    requestId
  );
}

function getBusinessErrorCode(error) {
  const message = getErrorMessage(error);

  if (message.includes("无法获取微信用户身份")) return "AUTH_REQUIRED";
  if (message.includes("状态已更新")) return "ROOM_VERSION_CONFLICT";
  if (message.includes("房间不存在") || message.includes("房间已失效")) return "ROOM_NOT_FOUND";
  if (message.includes("仅房主可") || message.includes("不能将房主")) return "FORBIDDEN";
  if (
    message.includes("缺少") ||
    message.includes("请输入") ||
    message.includes("请选择") ||
    message.includes("不在当前房间") ||
    message.includes("无效")
  ) {
    return "INVALID_REQUEST";
  }
  if (message.includes("接口不存在")) return "ENDPOINT_NOT_FOUND";
  return "SERVICE_ERROR";
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(data));
}

function getErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : "服务异常，请稍后重试";
}
