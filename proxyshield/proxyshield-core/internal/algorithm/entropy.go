// Package algorithm provides rate limiting algorithms and entropy calculation.
package algorithm

import "math"

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
