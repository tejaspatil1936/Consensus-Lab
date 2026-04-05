package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/tejaspatil1936/proxyshield-core/internal/config"
	"github.com/tejaspatil1936/proxyshield-core/internal/event"
	"github.com/tejaspatil1936/proxyshield-core/internal/reqctx"
)

// Honeypot bans any IP that accesses a configured trap URL.
type Honeypot struct {
	config *config.Config
	banMap *sync.Map
}

// NewHoneypot creates a Honeypot middleware.
func NewHoneypot(cfg *config.Config, banMap *sync.Map) *Honeypot {
	return &Honeypot{config: cfg, banMap: banMap}
}

// Name returns the middleware identifier.
func (m *Honeypot) Name() string { return "honeypot" }

// Handle bans the client IP if it accesses any configured honeypot path.
func (m *Honeypot) Handle(w http.ResponseWriter, r *http.Request, ctx *reqctx.Context) bool {
	path := r.URL.Path

	for _, hp := range m.config.Honeypots {
		if path != hp.Path {
			continue
		}

		banDuration := time.Duration(hp.BanMinutes) * time.Minute
		m.banMap.Store(ctx.IP, BanEntry{
			BannedAt:    time.Now(),
			BanDuration: banDuration,
		})

		ctx.EventBus.Publish(event.Event{
			Name: event.IPBanned,
			Data: map[string]interface{}{
				"ip": ctx.IP, "path": path, "banMinutes": hp.BanMinutes,
			},
			Timestamp: time.Now(),
		})
		ctx.EventBus.Publish(event.Event{
			Name: event.RequestBlocked,
			Data: map[string]interface{}{
				"ip": ctx.IP, "path": path, "threatTag": "HONEYPOT_TRAP",
			},
			Timestamp: time.Now(),
		})

		writeJSON(w, http.StatusForbidden, map[string]string{
			"error":  "Forbidden",
			"reason": "HONEYPOT_TRAP",
		})
		return true
	}

	return false
}
