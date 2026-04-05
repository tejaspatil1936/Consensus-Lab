# ProxyShield

High-performance reverse proxy and API gateway built from scratch in Go. Zero external dependencies. Single binary.

## Structure

- `proxyshield-core/` — The Go reverse proxy (main project)
- `demo-apikeys/` — KeyVault demo app showcasing ProxyShield

## Quick Start

```bash
# Build the Go proxy
cd proxyshield-core
go build -o proxyshield-core ./cmd/proxyshield/
./proxyshield-core --config config.json
```

```bash
# Run the full demo (proxy + backend + frontend)
cd demo-apikeys
./start.sh
# App:       http://localhost:5173
# Dashboard: http://localhost:9091
# Login:     admin@apikeys.dev / admin123
```

## Features

- WAF: SQL injection, XSS, Shannon entropy anomaly detection
- Rate limiting: token bucket + sliding window (per-IP, per-endpoint)
- Honeypots: trap URLs that auto-ban scanners
- IP blacklist: static + runtime bans
- Throttle: graduated delays without blocking
- Hot reload: config changes applied without restart
- Dashboard: real-time SSE dashboard at `:9091`
- Benchmark: `./proxyshield-core --benchmark`

## Docs

- [proxyshield-core/README.md](proxyshield-core/README.md) — Go proxy architecture and usage
- [demo-apikeys/README.md](demo-apikeys/README.md) — KeyVault demo setup and attack tester
