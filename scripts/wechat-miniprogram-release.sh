#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WECHAT_CLI="${WECHAT_CLI:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"
PORTAL_URL="https://mp.weixin.qq.com/"
VERSION_PAGE_URL="https://mp.weixin.qq.com/wxamp/wacodepage/getcodepage?lang=zh_CN"
RELEASE_STATE_DIR="${RELEASE_STATE_DIR:-/private/tmp/tour_of_yakuman_wechat_release}"
DEFAULT_REVIEW_DESCRIPTION="新增三人麻将算点与局势分析；优化四人麻将算点、责任支付和拔北规则；完善在线房间房主转让、异常诊断及草稿恢复；统一多套桌面皮肤与结算弹窗样式。"

usage() {
  cat <<'EOF'
Usage:
  npm run release:wechat -- check
  npm run release:wechat -- upload <version> <development-description>
  npm run release:wechat -- all <version> <development-description> [review-description]
  npm run release:wechat -- review [version] [review-description]
  npm run release:wechat -- status
  npm run release:wechat -- publish

Commands:
  check    Run the complete mini program release verification suite.
  upload   Run checks and upload a development version with WeChat DevTools CLI.
  all      Run checks, upload, prepare the review brief, and open WeChat MP console.
  review   Prepare/copy the review brief and open WeChat MP console.
  status   Open the version management page to inspect review status.
  publish  Open the version management page for the final manual release action.

Notes:
  - review/publish never click the final button automatically.
  - WeChat login/QR verification still requires the account owner.
  - Set SKIP_CHECKS=1 only when the same source tree has already passed checks.
EOF
}

require_version() {
  local version="${1:-}"
  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid version '$version'; expected x.y.z, for example 2.1.4." >&2
    exit 2
  fi
}

require_description() {
  local description="${1:-}"
  if [[ -z "$description" ]]; then
    echo "A non-empty version description is required." >&2
    exit 2
  fi
  if (( ${#description} > 200 )); then
    echo "Version description must not exceed 200 characters." >&2
    exit 2
  fi
}

run_checks() {
  cd "$ROOT_DIR"
  echo "==> Running WeChat mini program release checks"
  npm run format:check
  npm run typecheck
  npm run typecheck:cloud
  npm run lint
  npm test
  npm run build:web
  npm run verify:riichi-bundle
  node --check cloudrun/online-room/server.cjs
  echo "==> All release checks passed"
}

write_release_state() {
  local version="$1"
  local development_description="$2"
  local review_description="$3"
  local phase="$4"
  local info_output="${5:-}"
  local state_path="$RELEASE_STATE_DIR/release-${version}.json"

  mkdir -p "$RELEASE_STATE_DIR"
  node - "$state_path" "$ROOT_DIR" "$version" "$development_description" "$review_description" "$phase" "$info_output" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [statePath, projectPath, version, developmentDescription, reviewDescription, phase, infoOutput] =
  process.argv.slice(2);
const projectConfig = JSON.parse(fs.readFileSync(path.join(projectPath, "project.config.json"), "utf8"));

const state = {
  appId: projectConfig.appid,
  projectPath,
  version,
  developmentDescription,
  reviewDescription,
  phase,
  testAccount: "无需登录账号即可使用",
  privacy: {
    collectsUserPrivacy: true,
    items: ["openid", "用户主动选择的头像", "用户主动填写的昵称"],
    purpose: "用于在线房间成员身份识别、展示和区分；单机算点无需提供头像昵称。"
  },
  optionalReviewFields: {
    previewImages: false,
    previewVideo: false,
    orderCenterPath: false,
    expeditedReview: false
  },
  infoOutput: infoOutput || null,
  updatedAt: new Date().toISOString()
};

fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
console.log(statePath);
NODE
}

copy_review_brief() {
  local version="$1"
  local review_description="$2"
  local brief_path="$RELEASE_STATE_DIR/review-${version:-next}.txt"

  mkdir -p "$RELEASE_STATE_DIR"
  cat >"$brief_path" <<EOF
微信小程序审核资料

版本：${version:-请以开发版本为准}
版本描述：$review_description
测试账号：无需登录账号即可使用
用户隐私保护指引：采集用户隐私
隐私项目：openid、用户主动选择的头像、用户主动填写的昵称
用途：用于在线房间成员身份识别、展示和区分；单机算点无需提供头像昵称。
图片预览：不上传
视频预览：不上传
订单中心 path：不填写
审核加急：不申请
EOF

  if command -v pbcopy >/dev/null 2>&1; then
    pbcopy <"$brief_path"
    echo "==> Review brief copied to clipboard"
  fi
  echo "==> Review brief: $brief_path"
}

open_portal() {
  local url="$1"
  if [[ "${NO_OPEN:-0}" == "1" ]]; then
    echo "==> Browser opening skipped because NO_OPEN=1"
    echo "    $url"
    return
  fi
  echo "==> Opening WeChat MP console"
  echo "    $url"
  open "$url"
}

upload_version() {
  local version="$1"
  local development_description="$2"
  local review_description="$3"
  local info_output="$RELEASE_STATE_DIR/upload-${version}.json"

  if [[ ! -x "$WECHAT_CLI" ]]; then
    echo "WeChat DevTools CLI was not found or is not executable: $WECHAT_CLI" >&2
    exit 1
  fi

  if [[ "${SKIP_CHECKS:-0}" != "1" ]]; then
    run_checks
  else
    echo "==> Skipping checks because SKIP_CHECKS=1"
  fi

  mkdir -p "$RELEASE_STATE_DIR"
  echo "==> Uploading mini program $version"
  "$WECHAT_CLI" upload \
    --project "$ROOT_DIR" \
    -v "$version" \
    -d "$development_description" \
    --info-output "$info_output"

  write_release_state "$version" "$development_description" "$review_description" "development-uploaded" "$info_output" >/dev/null
  echo "==> Development version uploaded"
  echo "    Upload result: $info_output"
}

command="${1:-}"
case "$command" in
  check)
    run_checks
    ;;
  upload)
    version="${2:-}"
    development_description="${3:-}"
    require_version "$version"
    require_description "$development_description"
    upload_version "$version" "$development_description" "$DEFAULT_REVIEW_DESCRIPTION"
    ;;
  all)
    version="${2:-}"
    development_description="${3:-}"
    review_description="${4:-$DEFAULT_REVIEW_DESCRIPTION}"
    require_version "$version"
    require_description "$development_description"
    require_description "$review_description"
    upload_version "$version" "$development_description" "$review_description"
    copy_review_brief "$version" "$review_description"
    write_release_state "$version" "$development_description" "$review_description" "review-ready" "$RELEASE_STATE_DIR/upload-${version}.json" >/dev/null
    open_portal "$VERSION_PAGE_URL"
    ;;
  review)
    version="${2:-next}"
    review_description="${3:-$DEFAULT_REVIEW_DESCRIPTION}"
    if [[ "$version" != "next" ]]; then
      require_version "$version"
    fi
    require_description "$review_description"
    copy_review_brief "$version" "$review_description"
    open_portal "$VERSION_PAGE_URL"
    ;;
  status)
    open_portal "$VERSION_PAGE_URL"
    ;;
  publish)
    echo "==> Final release remains a deliberate manual action after review approval."
    open_portal "$VERSION_PAGE_URL"
    ;;
  help|-h|--help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
