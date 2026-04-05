# ProxyShield Go — Claude Code Build Prompt

## READ FIRST

You are building **ProxyShield**, a high-performance reverse proxy and API gateway from scratch in **Go**. This is a complete rewrite of the Node.js version for maximum performance. You are also building a demo application — an API Key Management Platform — to showcase ProxyShield's security features.

**CRITICAL RULES:**
1. Do NOT push anything to git. Only commit locally. Never run `git push`.
2. Build everything inside the existing repo at the current working directory.
3. Go version: 1.21+. Use ONLY the Go standard library. ZERO external Go dependencies.
4. The demo frontend uses React + Vite. The demo backend uses Express. These are separate from the Go proxy.
5. Write production-grade, idiomatic Go code. Proper error handling, goroutine safety, structured logging, clean interfaces.
6. Every exported function must have a GoDoc comment.
7. Follow Go naming conventions: camelCase for unexported, PascalCase for exported, acronyms fully capitalized (HTTP, URL, IP, SSE, WAF, XSS, SQL).

---

## FOLDER STRUCTURE

Build this exact structure inside the current repo. Do not modify any existing files outside these new folders.

```
proxyshield-core/
├── cmd/
│   └── proxyshield/
│       └── main.go                 ← Entry point, CLI flags, startup
├── internal/
│   ├── config/
│   │   ├── config.go              ← Config structs, loader, validator
│   │   └── watcher.go             ← Hot-reload with os.Stat polling
│   ├── proxy/
│   │   ├── server.go              ← HTTP server, request handling
│   │   ├── forwarder.go           ← Reverse proxy forwarding with streaming
│   │   └── context.go             ← Per-request context struct
│   ├── middleware/
│   │   ├── chain.go               ← Middleware interface + chain runner
│   │   ├── blacklist.go           ← IP blacklist (static + runtime bans)
│   │   ├── waf.go                 ← SQL injection, XSS, entropy detection
│   │   ├── honeypot.go            ← Trap URLs with auto-ban
│   │   ├── ratelimiter.go         ← Dual algorithm rate limiting
│   │   ├── throttle.go            ← Graduated delay
│   │   └── headers.go             ← X-RateLimit response headers
│   ├── algorithm/
│   │   ├── tokenbucket.go         ← Token bucket algorithm
│   │   ├── slidingwindow.go       ← Counter-based sliding window
│   │   └── entropy.go             ← Shannon entropy calculation
│   ├── dashboard/
│   │   ├── server.go              ← Dashboard HTTP server
│   │   ├── sse.go                 ← SSE event broadcasting
│   │   ├── stats.go               ← Real-time statistics collector
│   │   └── public/                ← Static dashboard files
│   │       ├── index.html
│   │       ├── style.css
│   │       └── app.js
│   ├── event/
│   │   └── bus.go                 ← Central event bus (channel-based)
│   └── logger/
│       └── logger.go              ← Structured JSON logger
├── benchmark/
│   └── bench.go                   ← Built-in self-benchmark
├── scripts/
│   └── attack-sim.sh             ← Attack simulation for demos
├── config.json                    ← Default config
├── go.mod
└── README.md

demo-apikeys/
├── backend/
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── components/
│   │       ├── Navbar.jsx
│   │       ├── LoginPage.jsx
│   │       ├── Dashboard.jsx
│   │       ├── APIKeyList.jsx
│   │       ├── CreateKeyModal.jsx
│   │       ├── UsageChart.jsx
│   │       ├── KeyDetailPanel.jsx
│   │       ├── Notification.jsx
│   │       └── AttackPanel.jsx
│   ├── package.json
│   └── vite.config.js
├── proxy-config.json
├── start.sh
└── README.md
```

---

## PART 1: PROXYSHIELD-CORE (Go)

Build every file in order. Each section describes exactly what to implement.

---

### go.mod

```
module github.com/tejaspatil1936/proxyshield-core

go 1.21
```

No require statements. Zero external dependencies.

---

### internal/logger/logger.go

**Purpose**: Structured JSON logger used throughout the proxy. All logging goes through this. No fmt.Println or log.Println anywhere else in the codebase.

**Implementation**:

```go
package logger
```

Define a package-level Logger struct with these methods:
- `Info(msg string, fields ...Field)` — writes to stdout
- `Warn(msg string, fields ...Field)` — writes to stderr
- `Error(msg string, fields ...Field)` — writes to stderr
- `Debug(msg string, fields ...Field)` — writes to stdout, only if verbose mode is on

Field type:
```go
type Field struct {
    Key   string
    Value interface{}
}

func F(key string, value interface{}) Field {
    return Field{Key: key, Value: value}
}
```

Output format — one JSON object per line:
```json
{"level":"info","message":"Request forwarded","timestamp":"2026-04-05T12:00:00Z","ip":"192.168.1.5","path":"/api/keys","latency_ms":2.3}
```

Use `sync.Mutex` to prevent interleaved output from concurrent goroutines.

Package-level functions that use a default logger instance:
```go
var verbose bool

func SetVerbose(v bool) { verbose = v }
func Info(msg string, fields ...Field)  { /* ... */ }
func Warn(msg string, fields ...Field)  { /* ... */ }
func Error(msg string, fields ...Field) { /* ... */ }
func Debug(msg string, fields ...Field) { /* ... */ }
```

Use `json.Marshal` for the output. Use `time.Now().UTC().Format(time.RFC3339)` for timestamps.

---

### internal/event/bus.go

**Purpose**: Central event bus using Go channels. Every middleware sends events here. Dashboard and logger subscribe. Fully decoupled — no middleware imports the dashboard or vice versa.

**Implementation**:

```go
package event
```

Event types as string constants:
```go
const (
    RequestReceived  = "request:received"
    RequestForwarded = "request:forwarded"
    RequestBlocked   = "request:blocked"
    IPBanned         = "ip:banned"
    ConfigReloaded   = "config:reloaded"
    RateLimitWarning = "rate-limit:warning"
)
```

Event struct:
```go
type Event struct {
    Name      string                 `json:"name"`
    Data      map[string]interface{} `json:"data"`
    Timestamp time.Time              `json:"timestamp"`
}
```

Bus struct:
```go
type Bus struct {
    subscribers map[string][]chan Event
    mu          sync.RWMutex
    bufferSize  int
}
```

Methods:
- `NewBus(bufferSize int) *Bus` — creates a new bus, default buffer 10000
- `Subscribe(eventName string) chan Event` — returns a buffered channel. Subscriber reads from this channel. If the channel buffer is full, the event is dropped (proxy never blocks waiting for a slow subscriber).
- `SubscribeAll() chan Event` — subscribe to all event types
- `Publish(event Event)` — sends event to all subscribers of that event name and to SubscribeAll subscribers. Use non-blocking send with select/default to drop events if subscriber buffer is full. Never block the publisher.
- `Unsubscribe(eventName string, ch chan Event)` — removes a subscriber channel

Use `sync.RWMutex` — read lock for Publish (hot path), write lock for Subscribe/Unsubscribe (cold path).

---

### internal/config/config.go

**Purpose**: Parse, validate, and store the proxy configuration from config.json. Same JSON format as the Node.js version.

**Implementation**:

```go
package config
```

Config structs — must parse the exact same config.json:

```go
type Config struct {
    Server      ServerConfig      `json:"server"`
    Middlewares []string          `json:"middlewares"`
    RateLimits  []RateLimitRule   `json:"rate_limits"`
    Security    SecurityConfig    `json:"security"`
    Honeypots   []HoneypotConfig  `json:"honeypots"`
    Throttle    ThrottleConfig    `json:"throttle"`
    Dashboard   DashboardConfig   `json:"dashboard"`
}

type ServerConfig struct {
    ListenPort    int    `json:"listen_port"`
    BackendURL    string `json:"backend_url"`
    DashboardPort int    `json:"dashboard_port"`
}

type RateLimitRule struct {
    Path            string `json:"path"`
    Method          string `json:"method"`
    Limit           int    `json:"limit"`
    WindowSeconds   int    `json:"window_seconds"`
    Algorithm       string `json:"algorithm"`
    ThrottleEnabled bool   `json:"throttle_enabled"`
}

type SecurityConfig struct {
    BlockSQLInjection bool     `json:"block_sql_injection"`
    BlockXSS          bool     `json:"block_xss"`
    EntropyThreshold  float64  `json:"entropy_threshold"`
    MaxBodyBytes      int64    `json:"max_body_bytes"`
    BlacklistedIPs    []string `json:"blacklisted_ips"`
}

type HoneypotConfig struct {
    Path       string `json:"path"`
    BanMinutes int    `json:"ban_minutes"`
}

type ThrottleConfig struct {
    WarnThreshold     float64 `json:"warn_threshold"`
    WarnDelayMs       int     `json:"warn_delay_ms"`
    CriticalThreshold float64 `json:"critical_threshold"`
    CriticalDelayMs   int     `json:"critical_delay_ms"`
}

type DashboardConfig struct {
    Enabled   bool `json:"enabled"`
    MaxEvents int  `json:"max_events"`
}
```

Thread-safe config holder:
```go
type Holder struct {
    config *Config
    mu     sync.RWMutex
}

func NewHolder() *Holder
func (h *Holder) Get() *Config          // read lock
func (h *Holder) Set(cfg *Config)       // write lock
```

Functions:
- `Load(path string) (*Config, error)` — read file, parse JSON, validate, return config
- `Validate(cfg *Config) error` — check all required fields:
  - ListenPort: 1-65535
  - BackendURL: non-empty, starts with http:// or https://
  - DashboardPort: 1-65535, different from ListenPort
  - RateLimits: each must have path (starts with /), method (GET/POST/PUT/DELETE/PATCH), limit > 0, window_seconds > 0
  - Algorithm defaults to "sliding_window" if empty
  - ThrottleEnabled defaults to false if missing
  - Security.EntropyThreshold defaults to 5.5 if 0
  - Security.MaxBodyBytes defaults to 1048576 if 0
  - Honeypots: each must have path (starts with /), ban_minutes > 0
  - Throttle fields default: warn_threshold=0.8, warn_delay_ms=200, critical_threshold=0.9, critical_delay_ms=500

---

### internal/config/watcher.go

**Purpose**: Watch config.json for changes and hot-reload. Uses os.Stat polling every 2 seconds (no external fsnotify dependency).

**Implementation**:

```go
package config
```

Function:
```go
func Watch(path string, holder *Holder, eventBus *event.Bus) 
```

This runs in a goroutine. Every 2 seconds:
1. `os.Stat(path)` to get ModTime
2. If ModTime changed since last check:
   a. Read and parse new config
   b. If parse fails: log warning, keep old config, continue
   c. If validation fails: log warning, keep old config, continue
   d. If valid: compute diff (compare old vs new — just log the changes, don't need a full differ like Node version), call `holder.Set(newConfig)`, publish `ConfigReloaded` event
3. Sleep 2 seconds, repeat

Use `time.NewTicker(2 * time.Second)` for the polling loop.

---

### internal/algorithm/entropy.go

**Purpose**: Calculate Shannon entropy of a byte slice. Uses a fixed [256]int array for frequency counting — stack allocated, zero heap allocation, no GC pressure.

```go
package algorithm
```

```go
// CalculateEntropy computes the Shannon entropy of the given text in bits per byte.
// Returns a value between 0 and 8. Normal English text scores 3.5-4.5.
// Base64-encoded payloads score 5.5-6.0.
// Uses a fixed [256]int frequency array — no heap allocation.
func CalculateEntropy(data []byte) float64 {
    if len(data) == 0 {
        return 0
    }

    var freq [256]int
    for _, b := range data {
        freq[b]++
    }

    total := float64(len(data))
    entropy := 0.0

    for _, count := range freq {
        if count == 0 {
            continue
        }
        p := float64(count) / total
        entropy -= p * math.Log2(p)
    }

    return entropy
}
```

---

### internal/algorithm/tokenbucket.go

**Purpose**: Token Bucket rate limiting. Allows bursts if tokens have accumulated. Uses sync.Map for outer lookup and sync.Mutex per entry for fine-grained locking.

```go
package algorithm
```

```go
type TokenBucketEntry struct {
    mu         sync.Mutex
    tokens     float64
    lastRefill time.Time
}

type TokenBucket struct {
    entries sync.Map // map[string]*TokenBucketEntry
}
```

Methods:
- `NewTokenBucket() *TokenBucket`
- `Check(key string, limit int, windowSeconds int) RateLimitResult`

RateLimitResult struct (shared between both algorithms):
```go
type RateLimitResult struct {
    Allowed   bool
    Current   int
    Limit     int
    Remaining int
    ResetTime int64  // Unix timestamp in seconds
}
```

Algorithm:
1. Load or create entry from sync.Map (use `LoadOrStore`)
2. Lock the entry mutex
3. Calculate elapsed time since lastRefill
4. Calculate tokens to add: `elapsed.Seconds() * (float64(limit) / float64(windowSeconds))`
5. Cap tokens at limit: `math.Min(limit, tokens + tokensToAdd)`
6. If tokens >= 1: deduct 1, return allowed=true with remaining=floor(tokens)
7. If tokens < 1: return allowed=false, remaining=0
8. Update lastRefill
9. Unlock

- `Cleanup(maxAge time.Duration)` — iterate sync.Map, delete entries not accessed in maxAge. Call this from a goroutine every 60 seconds.

---

### internal/algorithm/slidingwindow.go

**Purpose**: Counter-based sliding window rate limiting. Uses a fixed-size int32 array — one count per second. O(W) memory where W is window size, regardless of traffic volume. This is the optimized version — not the log-based approach.

```go
package algorithm
```

```go
type SlidingWindowEntry struct {
    mu         sync.Mutex
    buckets    []int32
    windowSize int
    lastSecond int64
}

type SlidingWindow struct {
    entries sync.Map // map[string]*SlidingWindowEntry
}
```

Methods:
- `NewSlidingWindow() *SlidingWindow`
- `Check(key string, limit int, windowSeconds int) RateLimitResult`

Algorithm:
1. Load or create entry. On create, allocate `buckets = make([]int32, windowSeconds)` — this is the only allocation, done once per IP+endpoint.
2. Lock entry mutex
3. Get current second: `now := time.Now().Unix()`
4. Calculate bucket index: `idx := int(now % int64(windowSize))`
5. Clear stale buckets: if `now > lastSecond`, iterate from lastSecond+1 to now, clearing each bucket at `(second % windowSize)`. Cap the loop at windowSize iterations to handle long gaps.
6. Set lastSecond = now
7. Sum all buckets to get current count
8. If current < limit: increment `buckets[idx]++`, return allowed=true
9. If current >= limit: return allowed=false
10. Unlock

- `Cleanup(maxAge time.Duration)` — delete entries where lastSecond is older than maxAge

**Why this is better than Node.js version**: Node version stores an array of timestamps that grows with every request — O(N) memory. This version uses a fixed array — 60 seconds = 60 int32s = 240 bytes, always. Whether the IP sends 10 requests or 10 million, memory usage is identical.

---

### internal/proxy/context.go

**Purpose**: Per-request context that flows through the middleware chain. Created fresh for each incoming request.

```go
package proxy
```

```go
type RequestContext struct {
    IP            string
    Body          []byte
    BodyText      string
    StartTime     time.Time
    RateLimitInfo *RateLimitInfo
    Config        *config.Config
    EventBus      *event.Bus
}

type RateLimitInfo struct {
    Limit           int
    Current         int
    Remaining       int
    ResetTime       int64
    ThrottleEnabled bool
    Path            string
}
```

---

### internal/middleware/chain.go

**Purpose**: Define the Middleware interface and the chain runner that executes middlewares in order.

```go
package middleware
```

```go
// Middleware is the interface every security layer implements.
// Handle inspects the request and either blocks it (returns true) or passes it along (returns false).
type Middleware interface {
    // Name returns the middleware identifier for logging and config mapping.
    Name() string
    // Handle processes the request. Returns true if the request was blocked (response already written).
    // Returns false if the request should continue to the next middleware.
    Handle(w http.ResponseWriter, r *http.Request, ctx *proxy.RequestContext) bool
}
```

Chain runner:
```go
// RunChain executes each middleware in order.
// Returns true if any middleware blocked the request.
func RunChain(chain []Middleware, w http.ResponseWriter, r *http.Request, ctx *proxy.RequestContext) bool {
    for _, mw := range chain {
        blocked := mw.Handle(w, r, ctx)
        if blocked {
            return true
        }
    }
    return false
}
```

Chain builder:
```go
// BuildChain creates the middleware chain from config.
// The banMap is shared between IPBlacklist and Honeypot.
func BuildChain(cfg *config.Config, banMap *sync.Map, tb *algorithm.TokenBucket, sw *algorithm.SlidingWindow) []Middleware {
    factories := map[string]func() Middleware{
        "ip-blacklist": func() Middleware { return NewIPBlacklist(cfg, banMap) },
        "waf":          func() Middleware { return NewWAF(cfg) },
        "honeypot":     func() Middleware { return NewHoneypot(cfg, banMap) },
        "rate-limiter": func() Middleware { return NewRateLimiter(cfg, tb, sw) },
        "throttle":     func() Middleware { return NewThrottle(cfg) },
        "headers":      nil, // handled in response writer wrapper
    }

    var chain []Middleware
    for _, name := range cfg.Middlewares {
        if name == "headers" {
            continue // handled separately
        }
        if factory, ok := factories[name]; ok && factory != nil {
            chain = append(chain, factory())
        }
    }
    return chain
}
```

---

### internal/middleware/blacklist.go

**Purpose**: First middleware. Checks static blacklist from config AND runtime ban map (populated by honeypot). Cheapest check — runs first.

```go
package middleware
```

```go
type IPBlacklist struct {
    config    *config.Config
    banMap    *sync.Map
    blacklist map[string]bool  // built once from config array for O(1) lookup
}
```

- `NewIPBlacklist(cfg *config.Config, banMap *sync.Map) *IPBlacklist` — build the blacklist map from `cfg.Security.BlacklistedIPs`
- `Name() string` → returns `"ip-blacklist"`
- `Handle(w, r, ctx)`:
  1. Check static blacklist map: `if blacklist[ctx.IP]` → write 403 JSON `{"error":"Forbidden","reason":"BLACKLISTED_IP"}`, publish `RequestBlocked` event, return true
  2. Check runtime ban map: load from `banMap` using ctx.IP as key. If found, check expiry: `if time.Now().Before(entry.BannedAt.Add(entry.BanDuration))` → still banned, write 403, return true. If expired → delete from banMap, continue.
  3. Return false (not blocked)

Ban entry struct (shared with honeypot):
```go
type BanEntry struct {
    BannedAt    time.Time
    BanDuration time.Duration
}
```

---

### internal/middleware/waf.go

**Purpose**: Web Application Firewall. SQL injection + XSS regex + entropy-based anomaly detection. Regex patterns compiled ONCE at startup (not per request).

```go
package middleware
```

```go
type WAF struct {
    config     *config.Config
    sqlPattern *regexp.Regexp
    xssPattern *regexp.Regexp
}
```

- `NewWAF(cfg *config.Config) *WAF` — compile both regex patterns using `regexp.MustCompile`
- `Name()` → `"waf"`

SQL pattern (same as Node.js version):
```
(?i)(\b(union\s+(all\s+)?select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+(table|database|column)|alter\s+table|create\s+(table|database)|exec(\s+|\()|execute(\s+|\()|xp_|sp_)\b|(--)|(\/\*[\s\S]*?\*\/)|(\b(or|and)\s+\d+\s*=\s*\d+)|('\s*(or|and)\s+'?\d+'?\s*=\s*'?\d+)|(;\s*(drop|delete|update|insert|alter|create)))
```

XSS pattern:
```
(?i)(<\s*script|<\s*iframe|<\s*embed|<\s*object|javascript\s*:|on(error|load|click|mouseover|focus|blur|submit|change|input|keydown|keyup|keypress)\s*=|eval\s*\(|document\s*\.\s*(cookie|write|location)|window\s*\.\s*(location|open)|alert\s*\(|prompt\s*\(|confirm\s*\()
```

`Handle(w, r, ctx)`:
1. Collect scannable strings: `r.URL.Path`, all `r.URL.Query()` values, `ctx.BodyText`
2. If `config.BlockSQLInjection` is true: test each string against sqlPattern. If match → write 403 `{"error":"Forbidden","reason":"SQL_INJECTION"}`, publish event with threatTag `SQL_INJECTION`, return true
3. If `config.BlockXSS` is true: test each string against xssPattern. If match → 403, threatTag `XSS`, return true
4. Entropy check: if `ctx.BodyText` is not empty, check Content-Type — skip if `multipart/form-data` or `application/octet-stream` or starts with `image/`, `audio/`, `video/`. Otherwise call `algorithm.CalculateEntropy(ctx.Body)`. If result > `config.EntropyThreshold` → 403, threatTag `HIGH_ENTROPY`, return true
5. Return false

---

### internal/middleware/honeypot.go

**Purpose**: Trap URLs. Any IP hitting a honeypot path gets banned.

```go
package middleware
```

```go
type Honeypot struct {
    config *config.Config
    banMap *sync.Map
}
```

- `NewHoneypot(cfg, banMap)`, `Name()` → `"honeypot"`
- `Handle(w, r, ctx)`:
  1. Extract pathname from `r.URL.Path`
  2. Iterate `config.Honeypots`, check exact match with path
  3. If no match → return false
  4. If match: calculate ban duration `time.Duration(honeypot.BanMinutes) * time.Minute`, store `BanEntry{BannedAt: time.Now(), BanDuration: duration}` in banMap with key `ctx.IP`
  5. Publish `IPBanned` event with ip, path, banMinutes
  6. Publish `RequestBlocked` event with threatTag `HONEYPOT_TRAP`
  7. Write 403 JSON, return true

---

### internal/middleware/ratelimiter.go

**Purpose**: Per-IP per-endpoint rate limiting. Chooses between token bucket and sliding window based on config.

```go
package middleware
```

```go
type RateLimiter struct {
    config        *config.Config
    tokenBucket   *algorithm.TokenBucket
    slidingWindow *algorithm.SlidingWindow
}
```

- `NewRateLimiter(cfg, tb, sw)`, `Name()` → `"rate-limiter"`
- `Handle(w, r, ctx)`:
  1. Find matching rate limit rule: iterate `config.RateLimits`, find first where `rule.Path == r.URL.Path` AND `strings.EqualFold(rule.Method, r.Method)`
  2. If no match → return false (no rate limit for this endpoint)
  3. Build key: `fmt.Sprintf("%s:%s:%s", ctx.IP, r.Method, rule.Path)`
  4. Choose algorithm: if `rule.Algorithm == "token_bucket"` → call `tokenBucket.Check(key, rule.Limit, rule.WindowSeconds)`, else → `slidingWindow.Check(key, rule.Limit, rule.WindowSeconds)`
  5. Set `ctx.RateLimitInfo` with result data + `rule.ThrottleEnabled` + `rule.Path`
  6. If not allowed:
     - Determine threatTag: if rule.Limit <= 10 or path contains "login" → `BRUTE_FORCE`, else → `RATE_LIMITED`
     - Calculate retryAfter: `result.ResetTime - time.Now().Unix()`
     - Write 429 with headers: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
     - JSON body: `{"error":"Rate limit exceeded","retryAfter":N}`
     - Publish `RequestBlocked` event
     - Return true
  7. Return false

---

### internal/middleware/throttle.go

**Purpose**: Graduated delay. Never blocks — only slows down.

```go
package middleware
```

```go
type Throttle struct {
    config *config.Config
}
```

- `NewThrottle(cfg)`, `Name()` → `"throttle"`
- `Handle(w, r, ctx)`:
  1. If `ctx.RateLimitInfo == nil` → return false
  2. If `!ctx.RateLimitInfo.ThrottleEnabled` → return false
  3. Calculate usage ratio: `float64(ctx.RateLimitInfo.Current) / float64(ctx.RateLimitInfo.Limit)`
  4. Get thresholds from config.Throttle (use defaults if zero)
  5. If ratio >= CriticalThreshold → `time.Sleep(CriticalDelayMs * time.Millisecond)`
  6. Else if ratio >= WarnThreshold → `time.Sleep(WarnDelayMs * time.Millisecond)`
  7. Else → no delay
  8. If delay was applied: publish `RateLimitWarning` event with usagePercent and delayMs
  9. Return false (never blocks)

---

### internal/middleware/headers.go

**Purpose**: Custom ResponseWriter wrapper that injects X-RateLimit headers into the response. This is NOT a middleware in the chain — it wraps the ResponseWriter before forwarding.

```go
package middleware
```

```go
// RateLimitResponseWriter wraps http.ResponseWriter to inject rate limit headers
// before the first write. Headers are set once when WriteHeader is called.
type RateLimitResponseWriter struct {
    http.ResponseWriter
    info          *proxy.RateLimitInfo
    headerWritten bool
}

func NewRateLimitResponseWriter(w http.ResponseWriter, info *proxy.RateLimitInfo) *RateLimitResponseWriter {
    return &RateLimitResponseWriter{ResponseWriter: w, info: info}
}

func (rw *RateLimitResponseWriter) WriteHeader(statusCode int) {
    if !rw.headerWritten && rw.info != nil {
        rw.Header().Set("X-RateLimit-Limit", strconv.Itoa(rw.info.Limit))
        rw.Header().Set("X-RateLimit-Remaining", strconv.Itoa(rw.info.Remaining))
        rw.Header().Set("X-RateLimit-Reset", strconv.FormatInt(rw.info.ResetTime, 10))
        rw.headerWritten = true
    }
    rw.ResponseWriter.WriteHeader(statusCode)
}

func (rw *RateLimitResponseWriter) Write(b []byte) (int, error) {
    if !rw.headerWritten {
        rw.WriteHeader(http.StatusOK)
    }
    return rw.ResponseWriter.Write(b)
}
```

---

### internal/proxy/forwarder.go

**Purpose**: Reverse proxy using `httputil.ReverseProxy`. Streams request and response bodies without buffering.

```go
package proxy
```

```go
// NewForwarder creates an httputil.ReverseProxy configured for the given backend URL.
func NewForwarder(backendURL string) (*httputil.ReverseProxy, error)
```

Implementation:
1. Parse backendURL using `url.Parse`
2. Create `httputil.NewSingleHostReverseProxy(target)`
3. Override `Director` function:
   - Set `req.URL.Scheme`, `req.URL.Host` from target
   - Keep original `req.URL.Path` and `req.URL.RawQuery`
   - Set `req.Host` to target host
   - Add/append `X-Forwarded-For` with client IP
   - Add `X-Forwarded-Proto: http`
   - Add `X-Forwarded-Host` with original Host header
4. Override `ErrorHandler`:
   - On error, write 502 JSON: `{"error":"Backend unavailable"}`
   - Log the error
5. Set `Transport` with connection pooling:
   ```go
   &http.Transport{
       MaxIdleConns:        100,
       MaxIdleConnsPerHost: 100,
       IdleConnTimeout:     90 * time.Second,
   }
   ```
6. Return the proxy

---

### internal/proxy/server.go

**Purpose**: Main HTTP server. Receives requests, parses body, runs middleware chain, forwards to backend.

```go
package proxy
```

```go
// Server is the main proxy server.
type Server struct {
    config      *config.Holder
    eventBus    *event.Bus
    chain       []middleware.Middleware
    forwarder   *httputil.ReverseProxy
    banMap      *sync.Map
    tb          *algorithm.TokenBucket
    sw          *algorithm.SlidingWindow
    httpServer  *http.Server
}

// NewServer creates a new proxy server with all dependencies.
func NewServer(holder *config.Holder, bus *event.Bus) (*Server, error)

// Start begins listening on the configured port. Blocks until shutdown.
func (s *Server) Start() error

// Shutdown gracefully stops the server with a 5-second timeout.
func (s *Server) Shutdown() error
```

Request handler (`ServeHTTP` or handler function):

1. Extract client IP: parse `r.RemoteAddr`, remove port, strip `::ffff:` prefix. Check `X-Forwarded-For` first.

2. Emit `RequestReceived` event.

3. Read body for POST/PUT/PATCH:
   - Check `Content-Length` against `config.Security.MaxBodyBytes`. If exceeded → write 413, emit blocked event with `OVERSIZED_PAYLOAD`, return.
   - Read body using `io.ReadAll(http.MaxBytesReader(w, r.Body, maxBytes))`. If error (body too large) → 413.
   - Store body as `[]byte` and `string`
   - Replace `r.Body` with `io.NopCloser(bytes.NewReader(body))` so the forwarder can read it again.

4. Create `RequestContext` with config, eventBus, IP, body, startTime.

5. Run middleware chain: `middleware.RunChain(s.chain, w, r, ctx)`. If returns true → request was blocked, return.

6. Wrap ResponseWriter with `RateLimitResponseWriter` if `ctx.RateLimitInfo != nil`.

7. Forward using `s.forwarder.ServeHTTP(wrappedWriter, r)`.

8. After forwarding, emit `RequestForwarded` event with latency.

Startup:
- Create forwarder from `config.BackendURL`
- Create shared `sync.Map` for ban map
- Create `TokenBucket` and `SlidingWindow` instances
- Build middleware chain using `middleware.BuildChain`
- Start cleanup goroutine: every 60 seconds, call `tb.Cleanup()` and `sw.Cleanup()`
- Start HTTP server on `config.ListenPort`
- Handle `SIGINT`, `SIGTERM` → call `Shutdown()`

---

### internal/dashboard/sse.go

**Purpose**: SSE (Server-Sent Events) broadcaster. Manages connected clients and fans out events.

```go
package dashboard
```

```go
type SSEBroker struct {
    clients    map[chan []byte]bool
    mu         sync.RWMutex
    register   chan chan []byte
    unregister chan chan []byte
    eventBus   *event.Bus
}

func NewSSEBroker(bus *event.Bus) *SSEBroker
func (b *SSEBroker) Start() // goroutine: subscribe to all events, broadcast to clients
func (b *SSEBroker) ServeHTTP(w http.ResponseWriter, r *http.Request) // SSE endpoint handler
```

ServeHTTP:
1. Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `Access-Control-Allow-Origin: *`
2. Flush headers immediately using `http.Flusher`
3. Create client channel, register it
4. Send `: connected\n\n` comment
5. Start heartbeat ticker (30 seconds): send `: heartbeat\n\n`
6. Loop: read from client channel, write `event: {name}\ndata: {json}\n\n`, flush
7. On client disconnect (`r.Context().Done()`): unregister channel, close it, stop heartbeat

---

### internal/dashboard/stats.go

**Purpose**: Collect and serve real-time statistics.

```go
package dashboard
```

```go
type Stats struct {
    mu             sync.RWMutex
    TotalRequests  int64                  `json:"totalRequests"`
    TotalForwarded int64                  `json:"totalForwarded"`
    TotalBlocked   int64                  `json:"totalBlocked"`
    BlockedByType  map[string]int64       `json:"blockedByType"`
    RPS            float64                `json:"requestsPerSecond"`
    ActiveBans     int                    `json:"activeBans"`
    Uptime         float64                `json:"uptimeSeconds"`
    startTime      time.Time
    recentRequests []time.Time            // for RPS calculation
}

func NewStats(bus *event.Bus, banMap *sync.Map) *Stats
func (s *Stats) Start() // goroutine: subscribe to events, update stats, recalculate RPS every second
func (s *Stats) ServeHTTP(w http.ResponseWriter, r *http.Request) // GET /stats endpoint
```

RPS calculation: keep timestamps of requests in the last 10 seconds. Every second, count timestamps within the window, divide by 10.

---

### internal/dashboard/server.go

**Purpose**: Dashboard HTTP server. Serves static files, SSE endpoint, and stats endpoint.

```go
package dashboard
```

```go
type DashboardServer struct {
    broker     *SSEBroker
    stats      *Stats
    httpServer *http.Server
    publicDir  string
}

func NewDashboardServer(bus *event.Bus, banMap *sync.Map, cfg *config.Config) *DashboardServer
func (d *DashboardServer) Start() error
func (d *DashboardServer) Shutdown() error
```

Routes:
- `GET /` or `GET /dashboard` → serve `index.html`
- `GET /style.css` → serve `style.css`
- `GET /app.js` → serve `app.js`
- `GET /events` → SSE broker handler
- `GET /stats` → stats handler
- Everything else → 404

Serve static files by embedding them or reading from the `public/` directory relative to the binary. Use `os.ReadFile` with path resolution.

---

### internal/dashboard/public/index.html, style.css, app.js

Build a professional dark-themed dashboard identical in features to the Node.js version:

**index.html**: Stats cards (RPS, forwarded, blocked, active bans), threat distribution section, live event feed table, connection status indicator. Link to style.css and app.js.

**style.css**: Dark theme (#0f1117 bg, #1a1d27 cards). Professional look — like Datadog or Grafana.
- Stats cards in a horizontal row with colored left borders
- Event feed as a proper table with fixed column widths
- Status pills: green "FWD" for forwarded, red "BLOCKED" for blocked
- Threat tag colored badges: SQL_INJECTION (red), XSS (orange), BRUTE_FORCE (yellow), HONEYPOT_TRAP (purple), HIGH_ENTROPY (blue), BLACKLISTED_IP (gray), RATE_LIMITED (amber)
- Alternating row backgrounds
- Monospace font for IPs and timestamps
- Responsive layout
- Smooth transitions on stat updates

**app.js**: Vanilla JS. EventSource connection to /events with reconnect logic. Update DOM on each event. RPS calculation. Max 100 events in feed. Connection status indicator with green/red dot.

---

### benchmark/bench.go

**Purpose**: Built-in self-benchmark. Starts proxy + dummy backend, fires N concurrent requests, measures latency distribution.

```go
package benchmark
```

```go
func Run(configPath string, numRequests int, concurrency int) error
```

1. Start a tiny HTTP backend on a random port: responds 200 `{"ok":true}` to everything
2. Modify config to point to this backend
3. Start the proxy server
4. Create a WaitGroup and a semaphore channel (buffered channel of size `concurrency`)
5. Fire `numRequests` goroutines, each sending GET to proxy
6. Collect latencies in a `[]float64` (use sync.Mutex to append safely)
7. After all complete: sort latencies, calculate p50/p95/p99/min/max/avg
8. Print formatted results:
```
╔══════════════════════════════════════╗
║   ProxyShield Benchmark Results     ║
╠══════════════════════════════════════╣
║  Total requests:    10,000          ║
║  Successful:        10,000          ║
║  Failed:            0               ║
║  Duration:          0.82s           ║
║  Throughput:        12,195 req/s    ║
║                                     ║
║  Latency Distribution:              ║
║    min:   0.1ms                     ║
║    avg:   0.4ms                     ║
║    p50:   0.3ms                     ║
║    p95:   0.8ms                     ║
║    p99:   1.5ms                     ║
║    max:   4.2ms                     ║
╚══════════════════════════════════════╝
```
9. Shutdown proxy and backend

---

### cmd/proxyshield/main.go

**Purpose**: Entry point. Parse CLI flags, wire everything together, start servers.

```go
package main
```

CLI flags using `flag` package:
- `-config` string, default `"config.json"` — path to config file
- `-verbose` bool, default false — enable debug logging
- `-benchmark` bool, default false — run benchmark mode
- `-requests` int, default 10000 — benchmark request count
- `-concurrency` int, default 100 — benchmark concurrency

Normal mode (`-benchmark` is false):
1. Parse flags, set verbose
2. Load config
3. Create event bus
4. Create config holder, start config watcher goroutine
5. Create and start proxy server
6. Create and start dashboard server (if config.Dashboard.Enabled)
7. Print startup banner:
```
╔══════════════════════════════════════════╗
║         ProxyShield v1.0.0               ║
║   High-Performance Reverse Proxy (Go)    ║
╠══════════════════════════════════════════╣
║  Proxy:      http://localhost:9090       ║
║  Backend:    http://127.0.0.1:3000       ║
║  Dashboard:  http://localhost:9091       ║
║  Middlewares: 6 active                   ║
║  Algorithms:  token_bucket, sliding_window║
╚══════════════════════════════════════════╝
```
8. Wait for SIGINT/SIGTERM
9. Graceful shutdown (5 second timeout)

Benchmark mode (`-benchmark` is true):
1. Call `benchmark.Run(configPath, requests, concurrency)`
2. Exit

---

### config.json

Same as the Node.js version. Copy it exactly:

```json
{
  "server": {
    "listen_port": 9090,
    "backend_url": "http://localhost:8080",
    "dashboard_port": 9091
  },
  "middlewares": ["ip-blacklist", "waf", "honeypot", "rate-limiter", "throttle", "headers"],
  "rate_limits": [
    { "path": "/getAllUsers", "method": "GET", "limit": 100, "window_seconds": 60, "algorithm": "token_bucket", "throttle_enabled": false },
    { "path": "/login", "method": "POST", "limit": 5, "window_seconds": 60, "algorithm": "sliding_window", "throttle_enabled": true }
  ],
  "security": {
    "block_sql_injection": true,
    "block_xss": true,
    "entropy_threshold": 5.5,
    "max_body_bytes": 1048576,
    "blacklisted_ips": ["203.0.113.42"]
  },
  "honeypots": [
    { "path": "/admin", "ban_minutes": 30 },
    { "path": "/.env", "ban_minutes": 60 },
    { "path": "/wp-login.php", "ban_minutes": 30 },
    { "path": "/phpmyadmin", "ban_minutes": 60 }
  ],
  "throttle": {
    "warn_threshold": 0.8,
    "warn_delay_ms": 200,
    "critical_threshold": 0.9,
    "critical_delay_ms": 500
  },
  "dashboard": { "enabled": true, "max_events": 1000 }
}
```

---

### scripts/attack-sim.sh

Same attack simulation script as before, targeting localhost:9090. Make it executable.

---

## PART 2: DEMO-APIKEYS (API Key Management Platform)

This is the demo application that showcases ProxyShield protecting a real-world API service.

---

### demo-apikeys/backend/package.json

```json
{
  "name": "demo-apikeys-backend",
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.18.0", "cors": "^2.8.5" }
}
```

---

### demo-apikeys/backend/server.js

Express server on `127.0.0.1:3000` ONLY. CORS allowing `http://localhost:5173`.

**In-memory data:**

API Keys array (pre-populated):
```javascript
const apiKeys = [
  {
    id: "key_live_a1b2c3d4e5f6",
    name: "Production API",
    prefix: "sk_live_...f6",
    created: "2026-03-01T10:00:00Z",
    lastUsed: "2026-04-05T14:30:00Z",
    status: "active",
    permissions: ["read", "write"],
    rateLimit: 1000,
    usage: { today: 847, thisMonth: 23500, total: 142000 },
    environment: "production"
  },
  {
    id: "key_test_g7h8i9j0k1l2",
    name: "Staging API",
    prefix: "sk_test_...l2",
    created: "2026-03-15T08:00:00Z",
    lastUsed: "2026-04-05T12:15:00Z",
    status: "active",
    permissions: ["read", "write", "admin"],
    rateLimit: 5000,
    usage: { today: 2341, thisMonth: 45200, total: 89000 },
    environment: "staging"
  },
  {
    id: "key_test_m3n4o5p6q7r8",
    name: "Development API",
    prefix: "sk_test_...r8",
    created: "2026-02-20T16:00:00Z",
    lastUsed: "2026-04-04T09:45:00Z",
    status: "active",
    permissions: ["read"],
    rateLimit: 10000,
    usage: { today: 156, thisMonth: 3200, total: 12000 },
    environment: "development"
  },
  {
    id: "key_live_s9t0u1v2w3x4",
    name: "Analytics Service",
    prefix: "sk_live_...x4",
    created: "2026-01-10T12:00:00Z",
    lastUsed: "2026-04-03T18:20:00Z",
    status: "revoked",
    permissions: ["read"],
    rateLimit: 500,
    usage: { today: 0, thisMonth: 0, total: 67000 },
    environment: "production"
  }
];
```

Usage logs array (for the chart):
```javascript
const usageLogs = [];
// Generate 24 hours of fake hourly usage data for each key
for (let i = 23; i >= 0; i--) {
  const hour = new Date(Date.now() - i * 3600000);
  usageLogs.push({
    hour: hour.toISOString(),
    key_live_a1b2c3d4e5f6: Math.floor(Math.random() * 50) + 20,
    key_test_g7h8i9j0k1l2: Math.floor(Math.random() * 120) + 50,
    key_test_m3n4o5p6q7r8: Math.floor(Math.random() * 15) + 2,
    key_live_s9t0u1v2w3x4: 0
  });
}
```

**Routes:**

POST /api/login — accepts { email, password }. If email is "admin@apikeys.dev" and password is "admin123" → return { success: true, token: "admin-jwt", user: { name: "Admin", email: "admin@apikeys.dev", role: "owner" } }. Otherwise 401.

GET /api/keys — return all API keys (never return the full key value, only prefix)

GET /api/keys/:id — return single key with full details

POST /api/keys — create new key. Accepts { name, permissions, environment, rateLimit }. Generate a random key id and prefix. Return the new key object with a fake full key shown ONCE: `"key": "sk_live_" + random 32 hex chars`. This is the only time the full key is shown.

DELETE /api/keys/:id — set key status to "revoked", return updated key

PATCH /api/keys/:id — update key name, permissions, or rateLimit. Return updated key.

POST /api/keys/:id/rotate — generate new key value, update lastUsed. Return new key with full value shown once.

GET /api/keys/:id/usage — return hourly usage data for the key from usageLogs array

GET /api/usage/overview — return aggregated usage: { totalKeys: N, activeKeys: N, totalRequestsToday: N, totalRequestsMonth: N }

GET /api/keys/search?q=query — search keys by name (case-insensitive contains)

GET /api/health — return { status: "healthy", keys: count, uptime }

Log every request with timestamp, method, path.

---

### demo-apikeys/frontend/package.json

```json
{
  "name": "demo-apikeys-frontend",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^18.2.0", "react-dom": "^18.2.0" },
  "devDependencies": { "@vitejs/plugin-react": "^4.0.0", "vite": "^5.0.0" }
}
```

### demo-apikeys/frontend/vite.config.js

React plugin. Proxy /api to http://localhost:9090 (ProxyShield):
```javascript
server: { port: 5173, proxy: { '/api': { target: 'http://localhost:9090', changeOrigin: true } } }
```

### demo-apikeys/frontend/src/App.jsx

Main app. Two views: LoginPage (if not logged in) and Dashboard (if logged in).
State: isLoggedIn, user, notification, apiKeys, selectedKey, usageData

### demo-apikeys/frontend/src/App.css

Professional developer platform theme. Think Stripe Dashboard or Postman.
- Background: #f8fafc (very light gray)
- Sidebar: #0f172a (dark navy), white text, 250px wide
- Content area: white cards with subtle shadows
- Primary color: #6366f1 (indigo — developer/API vibe)
- Success: #10b981, Danger: #ef4444, Warning: #f59e0b
- API key display: monospace, partially masked with dots
- Code-like elements: dark bg (#1e293b), monospace, rounded
- Status badges: green "Active", red "Revoked", yellow "Expiring"
- Responsive but optimize for desktop (developers use desktop)
- Typography: Inter/system-ui, clean, professional

### Components:

**Navbar.jsx**: Top bar with "🔑 KeyVault" logo, user name, logout button. Below it show small text "Protected by ProxyShield" in muted color.

**LoginPage.jsx**: Centered card. Title "KeyVault — API Key Management". Subtitle "Manage, monitor, and secure your API keys". Email input (default: admin@apikeys.dev), password input (default: admin123). Sign in button (indigo). Handle 429 with orange notification "Too many attempts. Account locked." Handle 403 with red notification "Blocked by security system."

**Dashboard.jsx**: Layout with sidebar + main content.

Sidebar links:
- 🔑 API Keys (active by default)
- 📊 Usage Overview
- ⚙️ Settings (just show "Coming soon")

Main content changes based on sidebar selection.

Top of main content: 4 stat cards in a row:
- Total Keys (count)
- Active Keys (count)
- Requests Today (number)
- Requests This Month (number)

Below stats: APIKeyList

**APIKeyList.jsx**: Table of all API keys.
Columns: Name, Key (masked prefix), Environment (badge: blue "production", green "staging", gray "development"), Status (green "active" / red "revoked"), Last Used (relative time), Actions (View, Revoke/Delete).
"+ Create New Key" button at top-right.
Search input to filter keys.

**CreateKeyModal.jsx**: Modal to create a new API key.
Fields:
- Key Name (text input)
- Environment (dropdown: production, staging, development)
- Permissions (checkboxes: read, write, admin)
- Rate Limit (number input, requests per hour)
- "Create Key" button

After creation: show the full key value in a special display box with a copy button and a warning "This key will only be shown once. Copy it now." This is how Stripe/OpenAI show new API keys.

Handle 429 (rate limited key creation) with appropriate notification.

**KeyDetailPanel.jsx**: Expandable panel or slide-out showing full key details when clicking "View" on a key.
Shows: name, full masked prefix, environment, permissions list, rate limit, creation date, last used date, usage stats (today, this month, total).
"Rotate Key" button — calls POST /api/keys/:id/rotate, shows new key value once.
"Revoke Key" button — calls DELETE /api/keys/:id, updates status.
Usage chart below (UsageChart component).

**UsageChart.jsx**: Simple bar chart showing last 24 hours of usage for the selected key. Pure CSS/JS bars — no chart library. Each bar is a div with dynamic height. X-axis shows hours (12AM, 1AM, ..., 11PM). Y-axis shows request count. Colored bars (indigo for active keys, gray for revoked).

**Notification.jsx**: Fixed top notification bar. Slides down. Color coded: green (success), red (blocked/error), orange (rate limited), blue (info). Auto-dismiss 5 seconds. Shows ProxyShield threat tags when blocked.

**AttackPanel.jsx**: Floating panel in bottom-right. Title "🛡️ ProxyShield Tester". Subtitle "Test API security live".

Collapsed: small dark button.
Expanded: dark panel with these attack buttons:

1. "🔓 Brute Force Login" (red) — fires 10 rapid POST /api/login with wrong passwords. Shows X/10 blocked.

2. "💉 SQL Injection" (orange) — sends GET /api/keys/search?q=' UNION SELECT * FROM secrets --. Shows "SQL injection blocked."

3. "⚡ XSS in Key Name" (purple) — sends POST /api/keys with name: "<script>steal(document.cookie)</script>". Shows "XSS blocked."

4. "🍯 Probe /admin" (yellow) — sends GET /admin. Shows "Honeypot triggered. IP banned."

5. "🔥 Encoded Attack" (pink) — sends POST /api/keys with name containing high-entropy base64 string. Shows "High entropy anomaly blocked."

6. "🔄 Spam Key Creation" (teal) — fires 5 rapid POST /api/keys to trigger rate limit on key creation. Shows how many got through vs blocked.

7. "📊 Check Headers" (blue) — sends GET /api/keys and shows X-RateLimit-Remaining value from response headers.

Each button: loading state, result status below button, description text.

---

### demo-apikeys/proxy-config.json

```json
{
  "server": {
    "listen_port": 9090,
    "backend_url": "http://127.0.0.1:3000",
    "dashboard_port": 9091
  },
  "middlewares": ["ip-blacklist", "waf", "honeypot", "rate-limiter", "throttle", "headers"],
  "rate_limits": [
    { "path": "/api/login", "method": "POST", "limit": 5, "window_seconds": 60, "algorithm": "sliding_window", "throttle_enabled": true },
    { "path": "/api/keys", "method": "POST", "limit": 3, "window_seconds": 60, "algorithm": "sliding_window", "throttle_enabled": false },
    { "path": "/api/keys", "method": "GET", "limit": 60, "window_seconds": 60, "algorithm": "token_bucket", "throttle_enabled": false },
    { "path": "/api/keys/search", "method": "GET", "limit": 30, "window_seconds": 60, "algorithm": "token_bucket", "throttle_enabled": false }
  ],
  "security": {
    "block_sql_injection": true,
    "block_xss": true,
    "entropy_threshold": 5.5,
    "max_body_bytes": 1048576,
    "blacklisted_ips": []
  },
  "honeypots": [
    { "path": "/admin", "ban_minutes": 5 },
    { "path": "/.env", "ban_minutes": 10 },
    { "path": "/wp-login.php", "ban_minutes": 5 },
    { "path": "/phpmyadmin", "ban_minutes": 10 },
    { "path": "/.git/config", "ban_minutes": 10 },
    { "path": "/api/internal", "ban_minutes": 5 }
  ],
  "throttle": {
    "warn_threshold": 0.8,
    "warn_delay_ms": 200,
    "critical_threshold": 0.9,
    "critical_delay_ms": 500
  },
  "dashboard": { "enabled": true, "max_events": 1000 }
}
```

---

### demo-apikeys/start.sh

```bash
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
```

`chmod +x start.sh`

---

## BUILD ORDER

Build in this exact order:

### Phase 1: Go foundation
1. go.mod
2. internal/logger/logger.go
3. internal/event/bus.go
4. internal/config/config.go
5. internal/config/watcher.go

### Phase 2: Algorithms
6. internal/algorithm/entropy.go
7. internal/algorithm/tokenbucket.go
8. internal/algorithm/slidingwindow.go

### Phase 3: Middlewares
9. internal/proxy/context.go
10. internal/middleware/chain.go
11. internal/middleware/blacklist.go
12. internal/middleware/waf.go
13. internal/middleware/honeypot.go
14. internal/middleware/ratelimiter.go
15. internal/middleware/throttle.go
16. internal/middleware/headers.go

### Phase 4: Proxy core
17. internal/proxy/forwarder.go
18. internal/proxy/server.go

### Phase 5: Dashboard
19. internal/dashboard/sse.go
20. internal/dashboard/stats.go
21. internal/dashboard/server.go
22. internal/dashboard/public/index.html
23. internal/dashboard/public/style.css
24. internal/dashboard/public/app.js

### Phase 6: Entry points
25. cmd/proxyshield/main.go
26. benchmark/bench.go
27. config.json
28. scripts/attack-sim.sh

### Phase 7: Demo app
29. demo-apikeys/backend/package.json
30. demo-apikeys/backend/server.js
31. demo-apikeys/frontend/package.json
32. demo-apikeys/frontend/vite.config.js
33. demo-apikeys/frontend/index.html
34. demo-apikeys/frontend/src/main.jsx
35. demo-apikeys/frontend/src/App.jsx
36. demo-apikeys/frontend/src/App.css
37. All component files
38. demo-apikeys/proxy-config.json
39. demo-apikeys/start.sh
40. demo-apikeys/README.md

### Phase 8: Build and verify
41. `cd proxyshield-core && go build -o proxyshield-core ./cmd/proxyshield/`
42. Verify binary exists and show size: `ls -lh proxyshield-core`
43. `cd ../demo-apikeys/backend && npm install`
44. `cd ../frontend && npm install`
45. Show final folder structure of both proxyshield-core/ and demo-apikeys/

### Phase 9: README
46. proxyshield-core/README.md

**REMINDER: Do NOT run git push at any point. Only local commits are allowed.**

After completing all phases:
1. Show me `go build` output (should be clean, zero errors)
2. Show me binary size
3. Show me the folder structure of both projects
4. Run: `cd proxyshield-core && ./proxyshield-core --config config.json &` then `curl -s http://localhost:9090/health` and show result. Kill after.
5. `git add -A && git commit -m "feat: ProxyShield Go core + KeyVault demo app"` — do NOT push
