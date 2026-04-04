/**
 * Calculate Shannon entropy of a string to detect encoded or obfuscated payloads.
 * Normal English text has entropy around 3.5–4.5 bits per byte.
 * Base64-encoded attack payloads have entropy around 5.5–6.0.
 *
 * @param {string} text - The input string to analyze
 * @returns {number} Entropy value in bits per byte (range 0 to 8)
 */
export function calculateEntropy(text) {
  if (!text || text.length === 0) return 0;

  const freq = new Map();
  for (const char of text) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  const total = text.length;
  let entropy = 0;

  for (const count of freq.values()) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}
