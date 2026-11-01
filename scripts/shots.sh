#!/usr/bin/env bash
# 用本机 Chrome 无头模式，把 mock 模式的主要页面截到 shots/。
#
#   ./scripts/shots.sh
#
# 需要 Chrome；可用 CHROME=/path/to/chrome 覆盖。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/server/target/debug/simple-web-server"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8791}"
OUT="$ROOT/shots"
DATA="$(mktemp -d)"
PROFILE="$(mktemp -d)"
LOG="$(mktemp)"
PID=""

cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
  fi
  rm -rf "$DATA" "$PROFILE"
  rm -f "$LOG"
}
trap cleanup EXIT

if [ ! -x "$BIN" ]; then
  echo "找不到 $BIN，先构建：cd server && CARGO_HOME=../.cargo-home cargo build" >&2
  exit 1
fi
if [ ! -x "$CHROME" ]; then
  echo "找不到 Chrome，用 CHROME=/path/to/chrome 指定" >&2
  exit 1
fi

"$BIN" --mock --port "$PORT" --web "$ROOT/web" --data "$DATA" > "$LOG" 2>&1 &
PID=$!
disown "$PID" 2>/dev/null || true

for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1 && break
  sleep 0.25
done

BASE="http://127.0.0.1:$PORT"
mkdir -p "$OUT"

shot() {
  local name="$1"
  local url="$2"
  local budget="$3"
  "$CHROME" \
    --headless=new --disable-gpu --hide-scrollbars \
    --no-first-run --no-default-browser-check \
    --run-all-compositor-stages-before-draw \
    --user-data-dir="$PROFILE" \
    --window-size=1180,730 --force-device-scale-factor=2 \
    --virtual-time-budget="$budget" \
    --screenshot="$OUT/$name.png" \
    "$url" 2>/dev/null
  echo "  shots/$name.png"
}

echo "截图输出到 $OUT"
shot splash  "$BASE/"              2200
shot login   "$BASE/"              5200
shot feed    "$BASE/#/dev"         6200
shot night   "$BASE/#/night"       5200
shot room    "$BASE/#/room/r2"     5200
shot profile "$BASE/#/profile"     4200
shot letter  "$BASE/#/slow-letter" 4200

echo "完成。"
