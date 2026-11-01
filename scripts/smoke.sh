#!/usr/bin/env bash
# 冒烟测试：用 mock 模式起一个临时服务，验证接口形状、鉴权、CSRF 与静态托管。
#
#   ./scripts/smoke.sh
#
# 需要先构建一次：cd server && cargo build

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/server/target/debug/simple-web-server"
PORT="${PORT:-8790}"
DATA="$(mktemp -d)"
COOKIES="$(mktemp)"
LOG="$(mktemp)"
PID=""

cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
  fi
  rm -rf "$DATA" "$COOKIES" "$LOG"
  rm -f /tmp/simple-smoke-*.json
}
trap cleanup EXIT

if [ ! -x "$BIN" ]; then
  echo "找不到 $BIN，先执行：cd server && CARGO_HOME=../.cargo-home cargo build" >&2
  exit 1
fi

"$BIN" --mock --port "$PORT" --web "$ROOT/web" --data "$DATA" > "$LOG" 2>&1 &
PID=$!
disown "$PID" 2>/dev/null || true

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

BASE="http://127.0.0.1:$PORT"
fail() {
  echo "FAIL: $1" >&2
  echo "--- server log ---" >&2
  tail -20 "$LOG" >&2
  exit 1
}

status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

# 1. 健康检查
health="$(curl -sf "$BASE/api/health")" || fail "health 不可用"
echo "$health" | grep -q '"mock":true' || fail "mock 标记不对: $health"

# 2. 未登录必须 401
[ "$(status "$BASE/api/feed?tab=following")" = "401" ] || fail "未登录 feed 不是 401"

# 3. 静态页与 SPA 兜底
[ "$(status "$BASE/")" = "200" ] || fail "首页不可用"
curl -sf "$BASE/" | grep -q 'id="app"' || fail "首页不是 SPA 外壳"
[ "$(status "$BASE/deep/link")" = "200" ] || fail "SPA 兜底失效"

# 4. 跨站 POST 要被挡掉
[ "$(status -X POST "$BASE/api/votes" -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{"post_id":"p1","liked":true}')" = "403" ] \
  || fail "跨站 POST 没被拒绝"

# 5. 开发会话（mock 下 token 写 mock 即可）
curl -sf -c "$COOKIES" -X POST "$BASE/api/dev/session" \
  -H 'Content-Type: application/json' -d '{"token":"mock"}' > /tmp/simple-smoke-session.json \
  || fail "dev session 失败"

# 6. 接口形状
curl -sf -b "$COOKIES" "$BASE/api/auth/session" > /tmp/simple-smoke-me.json || fail "session 失败"
curl -sf -b "$COOKIES" "$BASE/api/feed?tab=following" > /tmp/simple-smoke-feed.json || fail "feed 失败"
curl -sf -b "$COOKIES" "$BASE/api/profile/posts" > /tmp/simple-smoke-profile.json || fail "profile posts 失败"
curl -sf -b "$COOKIES" "$BASE/api/posts/p1/comments" > /tmp/simple-smoke-comments.json || fail "comments 失败"
curl -sf -b "$COOKIES" "$BASE/api/night-markets" > /tmp/simple-smoke-night.json || fail "night 失败"
curl -sf -b "$COOKIES" "$BASE/api/rooms/r2/state" > /tmp/simple-smoke-room.json || fail "room 失败"
curl -sf -b "$COOKIES" -X POST "$BASE/api/votes" -H 'Content-Type: application/json' \
  -d '{"post_id":"p1","liked":true}' > /dev/null || fail "点赞失败"

[ "$(status -b "$COOKIES" -X POST "$BASE/api/im/session" -H 'Content-Type: application/json' -d '{}')" = "503" ] \
  || fail "mock 私信应为 503"

python3 - <<'PY' || fail "接口形状不符合预期"
import json

def load(path):
    with open(path) as handle:
        return json.load(handle)

me = load("/tmp/simple-smoke-me.json")
assert me["user"]["nickname"], me
assert me["user"].get("simple_id"), me
feed = load("/tmp/simple-smoke-feed.json")
assert len(feed["posts"]) >= 5, len(feed["posts"])
profile = load("/tmp/simple-smoke-profile.json")
assert len(profile["posts"]) >= 1, profile
assert feed["posts"][0]["id"] == "p1", feed["posts"][0]
comments = load("/tmp/simple-smoke-comments.json")
assert len(comments["comments"]) >= 3, comments
night = load("/tmp/simple-smoke-night.json")
assert len(night["channels"]) >= 8, len(night["channels"])
assert night["is_open"] is True, night
room = load("/tmp/simple-smoke-room.json")
assert room["count"] == 12, room
assert room["seats_ok"] is True, room
assert len(room["seats"]) == 6, room
PY

# 7. 退出后会话失效
curl -sf -b "$COOKIES" -X POST "$BASE/api/auth/logout" > /dev/null || fail "logout 失败"
[ "$(status -b "$COOKIES" "$BASE/api/feed?tab=following")" = "401" ] || fail "退出后仍可访问"

rm -f /tmp/simple-smoke-*.json
echo "OK: 健康检查、鉴权、CSRF、feed / profile / comments / night / room、静态托管全部通过"
