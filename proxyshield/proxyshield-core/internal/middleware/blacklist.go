package middleware

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/tejaspatil1936/proxyshield-core/internal/config"
	"github.com/tejaspatil1936/proxyshield-core/internal/event"
	"github.com/tejaspatil1936/proxyshield-core/internal/reqctx"
)

// BanEntry records when an IP was banned and for how long.
// Shared between IPBlacklist and Honeypot.
type BanEntry struct {
	BannedAt    time.Time
	BanDuration time.Duration
}

// IPBlacklist is the first middleware in the chain. It checks both the static
// blacklist from config and the runtime ban map populated by the honeypot middleware.
type IPBlacklist struct {
	config    *config.Config
	banMap    *sync.Map
	blacklist map[string]bool
}

// NewIPBlacklist creates an IPBlacklist middleware, pre-building the O(1) lookup map.
func NewIPBlacklist(cfg *config.Config, banMap *sync.Map) *IPBlacklist {
	bl := make(map[string]bool, len(cfg.Security.BlacklistedIPs))
	for _, ip := range cfg.Security.BlacklistedIPs {
		bl[ip] = true
	}
	return &IPBlacklist{config: cfg, banMap: banMap, blacklist: bl}
}

// Name returns the middleware identifier.
func (m *IPBlacklist) Name() string { return "ip-blacklist" }

// Handle blocks requests from statically blacklisted or runtime-banned IPs.
func (m *IPBlacklist) Handle(w http.ResponseWriter, r *http.Request, ctx *reqctx.Context) bool {
	if m.blacklist[ctx.IP] {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error":  "Forbidden",
			"reason": "BLACKLISTED_IP",
		})
		ctx.EventBus.Publish(event.Event{
			Name: event.RequestBlocked,
			Data: map[string]interface{}{
				"ip": ctx.IP, "path": r.URL.Path, "threatTag": "BLACKLISTED_IP",
			},
			Timestamp: time.Now(),
		})
		return true
	}

	if val, ok := m.banMap.Load(ctx.IP); ok {
		entry := val.(BanEntry)
		if time.Now().Before(entry.BannedAt.Add(entry.BanDuration)) {
			writeJSON(w, http.StatusForbidden, map[string]string{
				"error":  "Forbidden",
				"reason": "BANNED_IP",
			})
			ctx.EventBus.Publish(event.Event{
				Name: event.RequestBlocked,
				Data: map[string]interface{}{
					"ip": ctx.IP, "path": r.URL.Path, "threatTag": "BANNED_IP",
				},
				Timestamp: time.Now(),
			})
			return true
		}
		// Ban expired — clean up
		m.banMap.Delete(ctx.IP)
	}

	return false
}

// writeJSON writes a JSON response body with the given status code.
func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	data, _ := json.Marshal(body)
	w.Write(data)
}
