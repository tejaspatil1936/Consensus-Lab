# KeyVault — API Key Management Demo

A full-stack demo application showcasing ProxyShield protecting a real API service.

## Stack

- **Frontend**: React + Vite on `:5173`
- **Proxy**: ProxyShield (Go) on `:9090`
- **Backend**: Express on `127.0.0.1:3000` (hidden from internet)
- **Dashboard**: ProxyShield dashboard on `:9091`

## Quick Start

```bash
# Install dependencies first
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Build ProxyShield (from repo root)
cd ../proxyshield-core && go build -o proxyshield-core ./cmd/proxyshield/ && cd ../demo-apikeys

# Start everything
./start.sh
```

## Login

- Email: `admin@apikeys.dev`
- Password: `admin123`

## Attack Tester

Click the **🛡️ Attack Tester** button in the bottom-right corner to run live attack simulations:

1. **Brute Force** — 10 rapid login attempts → rate limited
2. **SQL Injection** — UNION SELECT attack → blocked by WAF
3. **XSS** — `<script>` in key name → blocked by WAF
4. **Honeypot** — probe `/admin` → IP banned
5. **Encoded Attack** — high-entropy base64 body → blocked by entropy check
6. **Spam Creation** — rapid key creation → rate limited
7. **Check Headers** — shows `X-RateLimit-Remaining` from proxy headers

Watch the ProxyShield Dashboard at `http://localhost:9091` to see events in real time.
