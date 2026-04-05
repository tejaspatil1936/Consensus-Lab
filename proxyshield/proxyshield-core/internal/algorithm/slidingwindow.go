package algorithm

import (
	"sync"
	"time"
)

// SlidingWindowEntry holds the per-key state for the sliding window algorithm.
// Uses a fixed-size bucket array — O(W) memory regardless of traffic volume.
type SlidingWindowEntry struct {
	mu         sync.Mutex
	buckets    []int32
	windowSize int
	lastSecond int64
	lastAccess time.Time
}

// SlidingWindow implements the counter-based sliding window rate limiting algorithm.
// Each second maps to one bucket in a fixed circular array — no timestamp logging.
// Memory usage is constant: 60 seconds = 60 int32s = 240 bytes per key.
type SlidingWindow struct {
	entries sync.Map // map[string]*SlidingWindowEntry
}

// NewSlidingWindow creates a new SlidingWindow instance.
func NewSlidingWindow() *SlidingWindow {
	return &SlidingWindow{}
}

// Check determines whether the key is within its rate limit.
// limit is the maximum number of requests per windowSeconds.
func (sw *SlidingWindow) Check(key string, limit int, windowSeconds int) RateLimitResult {
	now := time.Now()
	nowSec := now.Unix()

	actual, loaded := sw.entries.LoadOrStore(key, &SlidingWindowEntry{
		buckets:    make([]int32, windowSeconds),
		windowSize: windowSeconds,
		lastSecond: nowSec,
		lastAccess: now,
	})
	entry := actual.(*SlidingWindowEntry)

	if !loaded {
		// freshly created entry
		entry.mu.Lock()
		defer entry.mu.Unlock()
		idx := int(nowSec % int64(windowSeconds))
		entry.buckets[idx]++
		entry.lastAccess = now
		return RateLimitResult{
			Allowed:   1 <= limit,
			Current:   1,
			Limit:     limit,
			Remaining: limit - 1,
			ResetTime: nowSec + int64(windowSeconds),
		}
	}

	entry.mu.Lock()
	defer entry.mu.Unlock()

	entry.lastAccess = now

	// Clear stale buckets from lastSecond+1 up to now.
	if nowSec > entry.lastSecond {
		diff := nowSec - entry.lastSecond
		if diff > int64(windowSeconds) {
			diff = int64(windowSeconds)
		}
		for i := int64(1); i <= diff; i++ {
			staleSec := entry.lastSecond + i
			idx := int(staleSec % int64(windowSeconds))
			entry.buckets[idx] = 0
		}
		entry.lastSecond = nowSec
	}

	// Sum all buckets for current count.
	var total int32
	for _, v := range entry.buckets {
		total += v
	}
	current := int(total)

	resetTime := nowSec + int64(windowSeconds)

	if current < limit {
		idx := int(nowSec % int64(windowSeconds))
		entry.buckets[idx]++
		return RateLimitResult{
			Allowed:   true,
			Current:   current + 1,
			Limit:     limit,
			Remaining: limit - current - 1,
			ResetTime: resetTime,
		}
	}

	return RateLimitResult{
		Allowed:   false,
		Current:   current,
		Limit:     limit,
		Remaining: 0,
		ResetTime: resetTime,
	}
}

// Cleanup removes entries where lastSecond is older than maxAge.
// Call this periodically to prevent unbounded memory growth.
func (sw *SlidingWindow) Cleanup(maxAge time.Duration) {
	cutoff := time.Now().Add(-maxAge)
	sw.entries.Range(func(k, v interface{}) bool {
		entry := v.(*SlidingWindowEntry)
		entry.mu.Lock()
		old := entry.lastAccess.Before(cutoff)
		entry.mu.Unlock()
		if old {
			sw.entries.Delete(k)
		}
		return true
	})
}
