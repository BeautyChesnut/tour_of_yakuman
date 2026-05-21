# UI 素材设计与生成说明

本文档记录 `enhance-ui-assets-and-visual-hierarchy` change 的素材策略、当前展示位置、gpt-image 生成提示词和本地资产管理约定。

## 当前展示位置梳理

| 类型 | 位置 | 当前数据来源 | 本轮处理 |
| --- | --- | --- | --- |
| 手牌与和牌张 | `pages/scoring/index` 手牌弹层顶部 14 格 | `handSlotViews` | 接入 `tile-face` |
| 宝牌与里宝牌 | `pages/scoring/index` 宝牌弹层 8 格 | `doraSlotViews`、`uraDoraSlotViews` | 接入 `tile-face` |
| 鸣牌 | `pages/scoring/index` 鸣牌弹层 4 组 × 4 格 | `meldGroupViews` | 接入 `tile-face` |
| 牌盘 | 手牌、鸣牌、宝牌弹层底部 | `handTileRows`、`doraTileRows` | 接入 `tile-face` |
| 方位 | 虚拟牌桌四家区域 | `tableSeats` | 接入 `state-badge` |
| 牌桌状态 | 亲家、立直、赢家、放铳者 | `tableSeats.className` 与局况字段 | 接入 `state-badge` |
| 全局操作 | 记录、回退、重置 | 场况区按钮 | 图标化样式 |
| 清空操作 | 各牌面弹层 | `handleDirectTileClearTap` | 图标化样式 |
| 结果页 | `components/scoring-result` | `resultView` | 重排视觉层级 |

## 本地资产目录

```text
miniprogram/assets/
  icons/   操作图标、状态章图标
  tiles/   麻将牌面 PNG 或雪碧图
  table/   桌面纹理、桌心辅助素材
  result/  结果页辅助素材
```

当前实现采用“外部牌面素材切片 + 文本 fallback”的方案：`references/mjui.png` 作为正式牌面素材源，`scripts/slice_mjui_tiles.py` 负责切出 37 张单张牌面 PNG，`tile-face` 优先加载这些完整牌面 PNG。由于切片素材已经包含牌胚、牌面和赤五外观，不再需要运行时叠加空白牌胚，也不再需要为赤五额外绘制红点。gpt-image 整张牌面一次性生成已经验证不稳定，只保留为风格参考，不进入小程序包。

## gpt-image 提示词

### 麻将牌面

> 生成一套适合微信小程序移动端显示的立直麻将牌面素材，浅象牙白牌面，细腻但简洁，正面平视，圆角矩形，轻微阴影，透明背景。需要统一风格，适合在 24px 到 48px 高度显示。包含万子 1-9、筒子 1-9、索子 1-9、东南西北白发中、赤五万赤五筒赤五索、空牌占位。不要使用复杂纹理，不要透视变形。

结论：整套牌面一次性生成存在牌种错漏和文字不稳定，不作为最终接入方式。

### 空白牌胚

> Generate one blank realistic Japanese riichi mahjong tile body for use as a reusable app UI asset. A single blank ivory-white mahjong tile with no markings, no text, no symbols. Front-facing orthographic view, subtle rounded corners, slight bevel, soft studio lighting, polished ivory plastic/ceramic material. Centered vertical rectangle around 3:4, fully visible, no rotation, no perspective. Perfectly flat solid #00ff00 chroma-key background for background removal. No cast shadow outside the tile, no watermark.

结论：该方向曾用于验证牌胚质感。当前正式牌面已改用 `references/mjui.png` 完整切片，因此空白牌胚不再接入 `tile-face`，也不进入小程序包。

### 方位与状态章

> 生成一套小尺寸麻将桌状态章，移动端 UI 图标风格，透明背景，圆形或圆角方形，包含：东、南、西、北、亲、立、听、和、铳。色彩克制，能在绿色桌面和白色卡片上清晰显示，文字必须端正可读。

### 操作图标

> 生成一套微信小程序工具按钮图标，线性图标风格，统一笔画，透明背景，颜色深灰和红色危险态两套，包含：记录、回退、重置、清空、确认、警示。图标需要适合 20px 到 28px 显示，并配合中文按钮标签使用。

### 桌面视觉

> 生成一个移动端麻将算点小程序的虚拟桌面背景素材，深绿色桌布，轻微纹理，中央有低调桌心区域，俯视平面风格，不要出现真实人物或实体麻将牌，适合叠加四家点数卡片和局况文字。

### 结果页辅助素材

> 生成一组立直麻将算点结果页辅助视觉素材，简洁移动端 UI 风格，包含胜利主结果装饰、荒牌流局装饰、点数变化上升下降小图标、支付箭头。透明背景，色彩克制，不遮挡文字。

## 素材入库规则

- 文件名使用小写英文、数字和短横线，例如 `tile-1m.png`、`badge-riichi.png`。
- 单张牌面素材需保持同一画布比例。
- 素材必须压缩后入库，避免小程序包体快速膨胀。
- 如果生成素材中文字不稳定，字牌和状态章改用本地文字叠加。
- 所有素材都必须有 CSS/text fallback，不能因为缺图导致空白。

## 当前牌面切片规则

`references/mjui.png` 尺寸为 800×516，按 10 列 × 4 行切片，每格 80×129。

```text
第 1 行：1s 2s 3s 4s 5s 6s 7s 8s 9s red5s
第 2 行：1m 2m 3m 4m 5m 6m 7m 8m 9m red5m
第 3 行：1p 2p 3p 4p 5p 6p 7p 8p 9p red5p
第 4 行：east south west north white green red
```

生成命令：

```bash
python scripts/slice_mjui_tiles.py
```

脚本会将运行时需要的单张牌面输出到 `miniprogram/assets/tiles/generated/faces/`，并把人工检查用总览图输出到 `references/mjui-tile-faces-contact-sheet.png`，避免检查图进入小程序包。
