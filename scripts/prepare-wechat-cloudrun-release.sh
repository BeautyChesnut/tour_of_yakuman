#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/cloudrun/online-room"
STAMP="$(date +%Y%m%d_%H%M)"
ZIP_PATH="/private/tmp/tour_of_yakuman_online_room_${STAMP}.zip"
PUBLIC_ZIP_PATH="$HOME/Public/tour_of_yakuman_online_room_${STAMP}.zip"

cd "$ROOT_DIR"

echo "==> Running local checks"
node --check cloudrun/online-room/server.cjs
npm run typecheck
npm run lint
npm test

echo "==> Building cloudrun zip"
cd "$SERVICE_DIR"
zip -r "$ZIP_PATH" . -x 'node_modules/*' '.DS_Store'

echo "==> Verifying zip root"
ZIP_ROOT_FILES="$(unzip -Z1 "$ZIP_PATH")"
for required in Dockerfile package.json server.cjs; do
  if ! printf '%s\n' "$ZIP_ROOT_FILES" | grep -qx "$required"; then
    echo "Missing required root file in zip: $required" >&2
    exit 1
  fi
done

if cp "$ZIP_PATH" "$PUBLIC_ZIP_PATH" 2>/dev/null; then
  PUBLIC_COPY_MESSAGE="$PUBLIC_ZIP_PATH"
  UPLOAD_ZIP_PATH="$PUBLIC_ZIP_PATH"
else
  PUBLIC_COPY_MESSAGE="未生成（当前系统不允许写入 ~/Public，直接使用上方 /private/tmp 代码包）"
  UPLOAD_ZIP_PATH="$ZIP_PATH"
fi

cat <<EOF

==> WeChat CloudRun release package is ready

Zip:
  $ZIP_PATH

Public copy:
  $PUBLIC_COPY_MESSAGE

Deploy console:
  https://cloud.weixin.qq.com/cloudrun

Form values:
  选择方式: 手动上传代码包
  上传方式: 压缩包（.zip/.jar/.war）
  代码包: $UPLOAD_ZIP_PATH
  端口: 80

After publishing, verify:
  服务页线上版本变为最新版本
  状态为 服务正常
  运行日志包含 online room service listening on 80
EOF
