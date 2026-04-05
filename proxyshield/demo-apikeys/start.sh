#!/bin/bash
# Resolve the directory this script lives in, regardless of where it's called from.
DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$DEMO_DIR/../proxyshield-core"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   KeyVault Demo — ProxyShield in Action              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

echo "[1/3] Starting KeyVault backend on :3000..."
node "$DEMO_DIR/backend/server.js" &
BACKEND_PID=$!
sleep 2

echo "[2/3] Starting ProxyShield (Go) on :9090..."
if [ ! -f "$CORE_DIR/proxyshield-core" ]; then
  echo "    Binary not found — building..."
  (cd "$CORE_DIR" && go build -o proxyshield-core ./cmd/proxyshield/) || { echo "Build failed. Is Go installed?"; exit 1; }
fi
"$CORE_DIR/proxyshield-core" --config "$DEMO_DIR/proxy-config.json" &
PROXY_PID=$!
sleep 2

echo "[3/3] Starting React frontend on :5173..."
(cd "$DEMO_DIR/frontend" && npx vite) &
FRONTEND_PID=$!

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  KeyVault is running!                                ║"
echo "║                                                      ║"
echo "║  App:        http://localhost:5173                    ║"
echo "║  Dashboard:  http://localhost:9091                    ║"
echo "║  Proxy:      http://localhost:9090                    ║"
echo "║  Backend:    http://127.0.0.1:3000 (hidden)          ║"
echo "║                                                      ║"
echo "║  Login: admin@apikeys.dev / admin123                 ║"
echo "║  Click Attack Tester to demo security features       ║"
echo "║                                                      ║"
echo "║  Ctrl+C to stop all                                  ║"
echo "╚══════════════════════════════════════════════════════╝"

trap "kill $BACKEND_PID $PROXY_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
