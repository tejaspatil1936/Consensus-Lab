#!/bin/bash
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   KeyVault Demo — ProxyShield in Action              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

echo "[1/3] Starting KeyVault backend on :3000..."
cd backend && node server.js &
BACKEND_PID=$!
cd ..
sleep 2

echo "[2/3] Starting ProxyShield (Go) on :9090..."
../proxyshield-core/proxyshield-core --config ./proxy-config.json &
PROXY_PID=$!
sleep 2

echo "[3/3] Starting React frontend on :5173..."
cd frontend && npx vite &
FRONTEND_PID=$!
cd ..

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
