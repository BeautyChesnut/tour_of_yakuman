# 在线房间云开发环境约定

本文档记录在线房间模式的云开发环境、本地配置和数据存储约定。

## 云开发环境

- 默认后台方案：微信云托管，服务名由部署者自行配置。
- 默认数据存储：云托管 MySQL，保存用户、房间、共享算点状态和房间结算记录。
- 仓库仍保留云函数和云数据库实现，作为回退方案。
- 单机算点模式继续保留，不依赖云开发环境。

## 环境 ID

真实云开发环境 ID 不提交到仓库。开发者在本地创建：

```text
config/cloud.env.local.json
```

该文件从 `config/cloud.env.example.json` 复制，并填入微信云开发控制台中的环境 ID。

建议环境：

| 用途 | 说明 |
| --- | --- |
| `dev` | 本地开发和微信开发者工具调试 |
| `prod` | 提审和线上发布 |

第一版实现可以只接入一个环境。若只使用一个环境，先填 `dev`，发布前再决定是否拆分 `prod`。

## 本地配置文件

本地配置文件结构：

```json
{
  "defaultEnv": "dev",
  "envs": {
    "dev": {
      "envId": ""
    },
    "prod": {
      "envId": ""
    }
  }
}
```

约束：

- `envId` 只保存云开发环境 ID，不保存密钥、令牌或私有服务地址。
- `config/cloud.env.local.json` 必须加入 `.gitignore`。
- 小程序端后续初始化云开发时，只读取明确配置的环境 ID；未配置时在线房间入口应提示需要配置云环境。

## 云托管 MySQL

当前 `cloud-container` 模式需要在云托管服务中配置：

- `MYSQL_ADDRESS`
- `MYSQL_USERNAME`（也兼容 `MYSQL_USER`）
- `MYSQL_PASSWORD`
- 可选：`MYSQL_DATABASE`，默认 `tour_of_yakuman`

服务首次收到请求时会自动创建数据库和以下表：

| 表名 | 用途 |
| --- | --- |
| `online_users` | 微信用户身份、展示信息和最近登录时间 |
| `online_rooms` | 房间、房主、成员、座位和生命周期状态 |
| `online_room_states` | 当前房间共享算点状态和版本号 |
| `online_room_settlement_records` | 房间结算记录 |

## 云函数回退方案

切换到 `cloud-function` 模式时使用以下云数据库集合：

| 集合名 | 用途 |
| --- | --- |
| `users` | 保存微信用户身份、展示信息和最近登录时间 |
| `rooms` | 保存房间基础信息、房主、成员、座位和生命周期状态 |
| `roomStates` | 保存当前房间共享算点状态和版本号 |
| `roomSettlementRecords` | 保存房间内本局结算记录 |

命名约定：

- 集合名使用 lower camel case。
- 文档字段优先使用英文语义名，例如 `ownerOpenId`、`roomCode`、`seatMap`、`version`、`updatedAt`。
- 时间字段统一保存毫秒时间戳。
- 房间状态字段使用枚举字符串，例如 `waiting`、`playing`、`closed`。

## 部署确认

- `cloud-container` 模式需要填写部署者自己的环境 ID 和云托管服务名。
- 云托管模式需要配置 MySQL 环境变量，不需要手工创建云数据库集合。
- 云函数回退模式的集合名固定为 `users`、`rooms`、`roomStates`、`roomSettlementRecords`。
