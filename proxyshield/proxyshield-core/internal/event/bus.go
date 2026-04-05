// Package event provides a central event bus for decoupled communication
// between proxy components using Go channels.
package event

import (
	"sync"
	"time"
)

// Event type constants used throughout the proxy.
const (
	RequestReceived  = "request:received"
	RequestForwarded = "request:forwarded"
	RequestBlocked   = "request:blocked"
	IPBanned         = "ip:banned"
	ConfigReloaded   = "config:reloaded"
	RateLimitWarning = "rate-limit:warning"
)

// subscribeAllKey is the internal key used for SubscribeAll channels.
const subscribeAllKey = "__all__"

// Event represents a single event published on the bus.
type Event struct {
	Name      string                 `json:"name"`
	Data      map[string]interface{} `json:"data"`
	Timestamp time.Time              `json:"timestamp"`
}

// Bus is a channel-based event bus that fans out events to subscribers.
// Publishers never block — events are dropped if a subscriber's buffer is full.
type Bus struct {
	subscribers map[string][]chan Event
	mu          sync.RWMutex
	bufferSize  int
}

// NewBus creates a new Bus with the given channel buffer size.
// A bufferSize of 10000 is recommended for production use.
func NewBus(bufferSize int) *Bus {
	return &Bus{
		subscribers: make(map[string][]chan Event),
		bufferSize:  bufferSize,
	}
}

// Subscribe returns a buffered channel that receives events with the given name.
// If the channel buffer fills up, new events are dropped to avoid blocking publishers.
func (b *Bus) Subscribe(eventName string) chan Event {
	ch := make(chan Event, b.bufferSize)
	b.mu.Lock()
	b.subscribers[eventName] = append(b.subscribers[eventName], ch)
	b.mu.Unlock()
	return ch
}

// SubscribeAll returns a buffered channel that receives every event published on the bus.
func (b *Bus) SubscribeAll() chan Event {
	return b.Subscribe(subscribeAllKey)
}

// Publish sends the event to all matching subscribers and all SubscribeAll subscribers.
// Uses non-blocking sends — events are dropped rather than blocking the publisher.
func (b *Bus) Publish(evt Event) {
	b.mu.RLock()
	named := b.subscribers[evt.Name]
	all := b.subscribers[subscribeAllKey]
	b.mu.RUnlock()

	for _, ch := range named {
		select {
		case ch <- evt:
		default:
		}
	}
	for _, ch := range all {
		select {
		case ch <- evt:
		default:
		}
	}
}

// Unsubscribe removes a subscriber channel from the given event name.
func (b *Bus) Unsubscribe(eventName string, target chan Event) {
	b.mu.Lock()
	defer b.mu.Unlock()

	channels := b.subscribers[eventName]
	updated := channels[:0]
	for _, ch := range channels {
		if ch != target {
			updated = append(updated, ch)
		}
	}
	b.subscribers[eventName] = updated
}
