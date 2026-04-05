#!/bin/bash
# ProxyShield Attack Simulation Script
# Fires various attack patterns at localhost:9090 for demo purposes.

TARGET="http://localhost:9090"
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ProxyShield Attack Simulation          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. SQL Injection
echo "[1/6] SQL Injection attempts..."
curl -s -o /dev/null -w "  GET /api/users?id=1' UNION SELECT * FROM secrets --  → %{http_code}\n" \
  "$TARGET/api/users?id=1%27%20UNION%20SELECT%20*%20FROM%20secrets%20--"
curl -s -o /dev/null -w "  GET /search?q=1; DROP TABLE users --  → %{http_code}\n" \
  "$TARGET/search?q=1%3B%20DROP%20TABLE%20users%20--"

echo ""

# 2. XSS
echo "[2/6] XSS attempts..."
curl -s -o /dev/null -w "  GET /?q=<script>alert(1)</script>  → %{http_code}\n" \
  "$TARGET/?q=%3Cscript%3Ealert(1)%3C/script%3E"
curl -s -o /dev/null -w "  POST /api/comment with XSS body  → %{http_code}\n" \
  -X POST -H "Content-Type: application/json" \
  -d '{"comment":"<script>document.cookie</script>"}' \
  "$TARGET/api/comment"

echo ""

# 3. Honeypot traps
echo "[3/6] Honeypot probing..."
for path in /admin /.env /wp-login.php /phpmyadmin; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET$path")
  echo "  GET $path  → $code"
done

echo ""

# 4. Brute force login
echo "[4/6] Brute force login (10 rapid requests)..."
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@test.com","password":"wrong'$i'"}' \
    "$TARGET/login")
  echo "  Login attempt $i  → $code"
done

echo ""

# 5. High-entropy body (base64-like payload)
echo "[5/6] High entropy payload..."
PAYLOAD=$(cat /dev/urandom | base64 | head -c 512)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"data\":\"$PAYLOAD\"}" \
  "$TARGET/api/keys")
echo "  POST /api/keys with high-entropy body  → $code"

echo ""

# 6. Rate limit spam
echo "[6/6] Rate limit test (20 rapid GETs)..."
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET/getAllUsers")
  echo "  GET /getAllUsers #$i  → $code"
done

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Simulation complete. Check dashboard!   ║"
echo "║  http://localhost:9091                   ║"
echo "╚══════════════════════════════════════════╝"
