package algorithm

import (
	"math"
	"sync"
	"time"
)

// RateLimitResult holds the outcome of a rate limit check.
// Shared between TokenBucket and SlidingWindow.
type RateLimitResult struct {
	Allowed   bool
	Current   int
	Limit     int
	Remaining int
	ResetTime int64 // Unix timestamp in seconds
}

// TokenBucketEntry holds the per-key state for the token bucket algorithm.
type TokenBucketEntry struct {
	mu         sync.Mutex
	tokens     float64
	lastRefill time.Time
	lastAccess time.Time
}

// TokenBucket implements the token bucket rate limiting algorithm.
// Allows bursts when tokens have accumulated. Uses sync.Map for concurrent access
// with per-entry fine-grained locking.
type TokenBucket struct {
	entries sync.Map // map[string]*TokenBucketEntry
}

// NewTokenBucket creates a new TokenBucket instance.
func NewTokenBucket() *TokenBucket {
	return &TokenBucket{}
}

// Check determines whether the key is within its rate limit.
// limit is the maximum number of requests per windowSeconds.
func (tb *TokenBucket) Check(key string, limit int, windowSeconds int) RateLimitResult {
	now := time.Now()

	actual, _ := tb.entries.LoadOrStore(key, &TokenBucketEntry{
		tokens:     float64(limit),
		lastRefill: now,
		lastAccess: now,
	})
	entry := actual.(*TokenBucketEntry)

	entry.mu.Lock()
	defer entry.mu.Unlock()

	entry.lastAccess = now

	elapsed := now.Sub(entry.lastRefill)
	tokensToAdd := elapsed.Seconds() * (float64(limit) / float64(windowSeconds))
	entry.tokens = math.Min(float64(limit), entry.tokens+tokensToAdd)
	entry.lastRefill = now

	resetTime := now.Add(time.Duration(windowSeconds) * time.Second).Unix()

	if entry.tokens >= 1 {
		entry.tokens--
		remaining := int(math.Floor(entry.tokens))
		return RateLimitResult{
			Allowed:   true,
			Current:   limit - remaining,
			Limit:     limit,
			Remaining: remaining,
			ResetTime: resetTime,
		}
	}

	return RateLimitResult{
		Allowed:   false,
		Current:   limit,
		Limit:     limit,
		Remaining: 0,
		ResetTime: resetTime,
	}
}

// Cleanup removes entries that have not been accessed within maxAge.
// Call this periodically (e.g., every 60 seconds) to prevent unbounded memory growth.
func (tb *TokenBucket) Cleanup(maxAge time.Duration) {
	cutoff := time.Now().Add(-maxAge)
	tb.entries.Range(func(k, v interface{}) bool {
		entry := v.(*TokenBucketEntry)
		entry.mu.Lock()
		old := entry.lastAccess.Before(cutoff)
		entry.mu.Unlock()
		if old {
			tb.entries.Delete(k)
		}
		return true
	})
}
