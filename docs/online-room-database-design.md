# 在线房间云数据库集合设计

本文档定义 2.0 在线房间模式的云数据库集合结构。字段命名与 `miniprogram/shared/domain/online-room` 类型保持一致，后续云函数和客户端服务以本文档为数据契约。

## 总体约定

- 数据库：微信云开发数据库。
- 时间字段：统一保存毫秒时间戳。
- 用户权限：以微信登录得到的 `openId` 为准，不使用昵称、头像或座位名做权限判断。
- 房主单写：修改 `rooms`、`roomStates` 和 `roomSettlementRecords` 的云函数必须校验 `openId === ownerOpenId`。
- 房主转让：仅当前房主可将 `ownerOpenId` 更新为 `seatMap` 中另一名已入座成员；普通成员、本人和未入座用户均不可作为有效转让请求。
- 房间状态使用 `version` 做乐观并发控制，旧版本不得覆盖新版本。

## `users`

保存微信用户身份和展示信息。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | string | 是 | 云数据库文档 ID，建议等于 `openId` |
| `openId` | string | 是 | 微信用户稳定身份 |
| `displayName` | string | 否 | 用户主动授权或填写的展示名 |
| `avatarUrl` | string | 否 | 用户主动授权的头像地址 |
| `createdAt` | number | 是 | 首次登录时间 |
| `updatedAt` | number | 是 | 用户信息更新时间 |
| `lastLoginAt` | number | 是 | 最近登录时间 |

索引建议：

- `openId` 唯一索引。

## `rooms`

保存房间基础信息、房主、座位和生命周期。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | string | 是 | 房间 ID |
| `id` | string | 是 | 房间 ID，与 `_id` 保持一致 |
| `roomCode` | string | 是 | 用户输入或分享使用的短房间码 |
| `ownerOpenId` | string | 是 | 房主 openId |
| `seatMap` | object | 是 | 东南西北座位到成员信息的映射 |
| `status` | string | 是 | `waiting`、`playing`、`closed` 或 `expired` |
| `createdAt` | number | 是 | 创建时间 |
| `updatedAt` | number | 是 | 更新时间 |
| `expiresAt` | number | 否 | 过期时间 |
| `closedAt` | number | 否 | 关闭时间 |

`seatMap` 结构：

```json
{
  "east": {
    "openId": "openid",
    "displayName": "东家",
    "avatarUrl": "",
    "joinedAt": 1765000000000
  },
  "south": null,
  "west": null,
  "north": null
}
```

索引建议：

- `roomCode` 普通索引，用于加入房间。
- `ownerOpenId` 普通索引，用于查询用户创建的房间。
- `status` + `expiresAt` 组合索引，用于清理过期房间。

## `roomStates`

保存房间当前共享算点状态。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | string | 是 | 建议等于 `roomId`，一个房间一份当前状态 |
| `roomId` | string | 是 | 所属房间 ID |
| `version` | number | 是 | 状态版本号，从 1 开始递增 |
| `round` | object | 是 | 当前局况、本局事件和和牌相关信息 |
| `playerPoints` | object | 是 | 四家当前点数 |
| `hand` | object | 是 | 手牌、和牌张和结构化手牌输入草稿 |
| `dora` | object | 是 | 宝牌、杠宝牌、里宝牌指示牌 |
| `currentEvent` | object | 否 | 当前本局事件摘要 |
| `recentRecordId` | string | 否 | 最近一局结算记录 ID |
| `recordIds` | string[] | 是 | 房间结算记录 ID 列表 |
| `updatedBy` | string | 是 | 最近更新者 openId |
| `updatedAt` | number | 是 | 最近更新时间 |

索引建议：

- `roomId` 唯一索引。
- `updatedAt` 普通索引，用于同步或调试排序。

并发规则：

- 客户端提交更新时必须携带当前 `version`。
- 云函数仅接受与数据库当前版本一致的更新。
- 更新成功后 `version + 1`，并写入新的 `updatedAt`。

## `roomSettlementRecords`

保存房间内每局结算记录。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | string | 是 | 结算记录文档 ID |
| `roomId` | string | 是 | 所属房间 ID |
| `record` | object | 是 | 现有 `SettlementRecord` 结构 |
| `createdBy` | string | 是 | 创建记录的房主 openId |
| `createdAt` | number | 是 | 创建时间 |
| `updatedAt` | number | 是 | 更新时间 |

索引建议：

- `roomId` + `createdAt` 组合索引，用于按房间查询历史记录。
- `createdBy` 普通索引，用于排查或统计。

## 权限边界

第一版在线房间通过云函数写入数据库。客户端不直接写入房间集合。

- `users`：登录云函数创建或更新当前用户。
- `rooms`：创建、加入、关闭房间必须通过云函数。
- `roomStates`：只有房主可通过云函数更新。
- `roomSettlementRecords`：只有房主确认结算时可通过云函数写入或覆盖最近记录。
- `rooms.ownerOpenId`：只有 `transferRoomOwner` 或房主退出继任流程可更新；主动转让不修改共享算点状态版本。

## 非目标

- 不在数据库中保存聊天内容。
- 不保存完整牌谱回放。
- 不支持旁观者列表。
- 不支持多人同时编辑的冲突合并记录。
