# 在线房间微信云托管服务

该目录提供微信云托管版本的在线房间后台。小程序端通过 `wx.cloud.callContainer` 调用本服务，服务端通过微信云托管注入的 openid 请求头识别真实微信用户。

## 接口

服务默认监听 `PORT`，接口前缀为 `/api`：

- `POST /api/login`
- `POST /api/rooms`
- `POST /api/rooms/join`
- `POST /api/rooms/state`
- `POST /api/rooms/settlement`

对应小程序端配置见：

```text
miniprogram/shared/config/cloud-backend.ts
```

## 部署前准备

1. 在微信云开发中确认云托管环境已开通。
2. 在云托管服务中开通 MySQL，并配置环境变量：
   - `MYSQL_ADDRESS`
   - `MYSQL_USERNAME`（也兼容 `MYSQL_USER`）
   - `MYSQL_PASSWORD`
   - 可选：`MYSQL_DATABASE`，默认 `tour_of_yakuman`
3. 服务首次收到请求时会自动创建数据库和以下数据表：
   - `online_users`
   - `online_rooms`
   - `online_room_states`
   - `online_room_settlement_records`
4. 在 `miniprogram/shared/config/cloud-backend.ts` 中填写：
   - `envId`
   - `containerServiceName`
   - `containerBasePath`

## 部署方式

在微信开发者工具的云托管面板中创建或选择服务，代码目录选择：

```text
cloudrun/online-room
```

构建方式可使用 Dockerfile。服务名需要与小程序端 `containerServiceName` 保持一致。

## 本地运行

本地运行只适合检查 HTTP 服务能否启动。因为本地没有微信云托管注入的 openid 请求头，不能完整验证登录和权限。

```bash
cd cloudrun/online-room
npm install
npm start
```

## 与云函数版本的关系

项目仍保留 `cloudfunctions/` 云函数和云数据库实现，便于回退或对比。小程序端通过 `CLOUD_BACKEND_CONFIG.mode` 切换：

- `cloud-container`：微信云托管，默认推荐给已有云托管环境使用。
- `cloud-function`：微信云函数。

两种模式的数据存储不同：云托管模式使用 MySQL，云函数模式使用 `users`、`rooms`、`roomStates`、`roomSettlementRecords` 四个云数据库集合。
