# 本地素材清单

本清单记录当前已入库的 UI 素材。麻将牌面已改为 `references/mjui.png` 切片后的完整牌面 PNG，页面组件保留 CSS/text fallback 兜底。

## tiles

- `tiles/generated/faces/tile-*.png`：由 `scripts/slice_mjui_tiles.py` 从 `references/mjui.png` 切片得到的 37 张单张牌面，当前已接入 `tile-face` 优先展示。
- `references/mjui-tile-faces-contact-sheet.png`：37 张单张牌面的总览图，用于人工检查牌面一致性，不进入小程序包。

### gpt-image v1 观察

- 优点：整体牌胚质感、圆角、阴影和真实麻将牌观感明显优于 SVG 占位。
- 问题：赤五没有作为独立三张牌稳定生成，部分字牌/白板/空白牌数量和比例不够准确。
- 结论：可作为真实牌面风格参考，但暂不应直接切片替换所有牌面；下一轮应改成“逐张或按花色分批生成”，降低整图里牌种错漏的概率。

### 当前采用方案

- `references/mjui.png` 作为当前正式牌面素材源。
- `scripts/slice_mjui_tiles.py` 负责按 10 列 × 4 行切片，生成 `tiles/generated/faces/tile-*.png`。
- 本地 `tile-face` 组件优先加载 `tiles/generated/faces/tile-*.png`，加载失败时回退到文本叠加。
- 切片素材已经包含完整牌胚和牌面，`tile-face` 不再叠加空白牌胚。
- 赤五通过 `red5m/red5p/red5s` 对应切片的全红外观区分，不再叠加额外红点。

## icons

- `icons/icon-record.svg`：记录。
- `icons/icon-rollback.svg`：回退。
- `icons/icon-reset.svg`：重置/危险操作。
- `icons/icon-clear.svg`：清空当前格。
- `icons/icon-confirm.svg`：确认。
- `icons/icon-warning.svg`：警示。

## table

- `table/table-felt.svg`：桌面纹理参考。

## result

- `result/result-win.svg`：和牌结果辅助素材。
- `result/result-draw.svg`：流局结果辅助素材。

## 替换约定

- gpt-image 生成素材完成筛选后，优先保持语义化命名不变。
- 如果生成素材尺寸不同，需要先更新组件映射或样式，不应把素材尺寸假设散落到业务逻辑中。
- 任一素材缺失时，页面必须继续使用组件 fallback 展示可读内容。
