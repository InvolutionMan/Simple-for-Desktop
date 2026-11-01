#!/usr/bin/env bash
# 一键启动 Simple 网页版。
#
#   ./run.sh                真实接口，127.0.0.1:8787
#   ./run.sh --mock         离线预览（固定假数据，不碰官方后端）
#   ./run.sh --dev          额外开 /api/dev/session，用已有 token 建会话
#   ./run.sh --port 9000    换端口
#
# 沙箱环境只允许写工作区，所以 cargo 的 home 与 target 都放在项目内。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CARGO_HOME="$ROOT/.cargo-home"
export CARGO_TARGET_DIR="$ROOT/server/target"

# 官方 App Key 等敏感配置放在本机 .env（已 gitignore）。
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

cd "$ROOT/server"

# 端口被旧的 --mock 服务占着时，新进程会启动失败，旧进程继续用假数据——
# 这里提前拦住，避免以为在真实模式里。
PORT="${SIMPLE_PORT:-8787}"
HOST="${SIMPLE_HOST:-127.0.0.1}"
previous=""
for argument in "$@"; do
  [ "$previous" = "--port" ] && PORT="$argument"
  [ "$previous" = "--host" ] && HOST="$argument"
  previous="$argument"
done

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已经被占用，先停掉那个服务（Ctrl+C），或者换端口：./run.sh --port 8899" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | tail -n +2 >&2 || true
  exit 1
fi

case " $* " in
  *" --mock "*)
    echo "[simple] 离线预览：假数据，不会发送真实短信"
    ;;
  *)
    echo "[simple] 真实接口：登录时会通过官方短信服务发送验证码"
    ;;
esac

cargo build

exec "$CARGO_TARGET_DIR/debug/simple-web-server" \
  --web "$ROOT/web" \
  --data "$ROOT/data" \
  "$@"
