# 微信小程序发布流程

本文档记录可复用的微信小程序和云托管发布步骤，不保存个人电脑路径、生产环境标识、线上版本历史或账号信息。

## 前置条件

- 本机已安装并登录微信开发者工具。
- 当前微信账号对 `project.config.json` 中配置的小程序具有上传权限。
- 在线房间所需的云环境、云托管服务和 MySQL 已由部署者完成配置。
- 真实环境 ID、服务名和数据库配置不得写入发布记录或提交密钥文件。

## 发布前校验

在项目根目录执行：

```bash
npm run format:check
npm run typecheck
npm run typecheck:cloud
npm run lint
npm test
npm run build:web
npm run verify:riichi-bundle
node --check cloudrun/online-room/server.cjs
```

全部通过后再发布。在线功能还需要确认：

- 小程序端云环境 ID 和服务名与部署目标一致。
- 云托管服务已配置 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`。
- 可选的 `MYSQL_DATABASE` 未配置时默认使用 `tour_of_yakuman`。
- `config/cloud.env.local.json` 等本地配置没有进入 Git。
- 单机算点在网络不可用时仍能正常进入和结算。

## 云托管部署

先生成待上传代码包：

```bash
npm run release:cloudrun:prepare
```

脚本会完成本地校验，并在系统临时目录生成 zip。zip 根目录直接包含：

```text
Dockerfile
package.json
server.cjs
```

然后进入[微信云托管控制台](https://cloud.weixin.qq.com/cloudrun)，选择目标环境和服务，手动上传代码包并填写容器端口 `80`。

发布后检查：

1. 新版本状态为“服务正常”。
2. 运行日志包含 `online room service listening on 80`。
3. `/api/login`、创建房间、加入房间和房主转让均可正常调用。
4. 日志不包含昵称、头像、房间码、手牌、点数或数据库凭据。

## 小程序开发版本

推荐使用项目脚本完成校验和开发版本上传：

```bash
npm run release:wechat -- all <版本号> "<开发版本备注>" "<审核版本说明>"
```

也可以分步执行：

```bash
npm run release:wechat -- check
npm run release:wechat -- upload <版本号> "<开发版本备注>"
npm run release:wechat -- review <版本号> "<审核版本说明>"
```

脚本会从当前项目目录和 `project.config.json` 动态读取项目路径与 AppID，不保存开发者本机绝对路径。

## 审核与正式发布

1. 登录微信公众平台，进入版本管理。
2. 选择刚上传的开发版本并提交审核。
3. 按实际功能填写隐私项目，不声明未采集的数据。
4. 审核通过后再次确认版本号和功能说明，再执行正式发布。
5. 发布后分别验证单机四麻、单机三麻、在线创建房间、加入房间和结算。

## 安全约束

- 不提交数据库地址、用户名、密码、SecretId、SecretKey、API Key、Token 或私钥。
- 不提交生产部署压缩包、运行日志、真实房间码或测试用户信息。
- 不在仓库保存线上版本历史和个人操作记录。
- AppID 用于微信开发者工具识别项目，不是面向用户的推广入口。
- 用户推广应使用小程序名称、微信分享卡片或经审核的小程序码。
