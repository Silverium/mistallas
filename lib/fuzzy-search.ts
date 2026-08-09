/**
 * Shared fuzzy search core used by both app and server wrappers.
 * Keep imports environment-neutral (no browser or Node-only APIs).
 */

/**
 * Calculate fuzzy match score between a search term and a text.
 * Returns a score between 0 and 1, where 1 is a perfect match.
 */
export function fuzzyMatchScore(searchTerm: string, text: string): number {
  if (!text) return 0
  if (!searchTerm) return 1

  const term = searchTerm.toLowerCase()
  const target = text.toLowerCase()

  // Exact match
  if (target === term) return 1

  // Substring match
  if (target.includes(term)) return 0.9

  // Word prefix match
  const words = target.split(/\s+/)
  for (const word of words) {
    if (word.startsWith(term)) return 0.8
  }

  // Levenshtein-based approach: character sequence with tolerance
  let termIdx = 0
  let targetIdx = 0
  let matchedChars = 0
  let allowedMisses = Math.ceil(Math.max(term.length, target.length) * 0.2) // Allow 20% typos

  while (termIdx < term.length && targetIdx < target.length) {
    if (term[termIdx] === target[targetIdx]) {
      termIdx++
      matchedChars++
      targetIdx++
    }
    else if (allowedMisses > 0) {
      // Skip this character in target and try next (allows for typos)
      targetIdx++
      allowedMisses--
    }
    else {
      // No more tolerance for misses
      break
    }
  }

  // Check if we matched most of the term
  const matchPercentage = matchedChars / term.length
  if (matchPercentage >= 0.6) {
    // Matched at least 60% of characters
    const score = 0.5 + (matchPercentage * 0.3)
    return Math.min(0.85, score)
  }

  return 0
}

type SearchablePurchase = {
  brand?: string | null
  category?: string | null
  productType?: string | null
  sizeLabel?: string | null
  fitFeedback?: string | null
  notes?: string | null
}

const WORD_WEIGHT_DECAY = 0.5
const NO_MATCH_SCORE = 0
const EMPTY_SEARCH_SCORE = 1

/**
 * Calculate overall fuzzy match score for a purchase against a search term.
 * Considers multiple fields with different weights.
 */
export function calculatePurchaseSearchScore(
  purchase: SearchablePurchase,
  searchTerm: string
): number {
  const fields = [
    { value: purchase.brand, weight: 0.35 },
    { value: purchase.productType, weight: 0.35 },
    { value: purchase.category, weight: 0.15 },
    { value: purchase.notes, weight: 0.1 },
    { value: purchase.fitFeedback, weight: 0.05 }
  ]

  const scores = fields
    .map(field => fuzzyMatchScore(searchTerm, field.value ?? '') * field.weight)

  return scores.reduce((sum, score) => sum + score, 0)
}

/**
 * Calculate fuzzy match score for a purchase against multiple search words.
 * Words earlier in the array carry more weight (first word = highest priority).
 */
export function calculateMultiWordSearchScore(
  purchase: SearchablePurchase,
  words: string[]
): number {
  if (words.length === 0) return EMPTY_SEARCH_SCORE

  const firstWord = words[0]
  if (words.length === 1) {
    if (!firstWord) {
      return NO_MATCH_SCORE
    }

    return calculatePurchaseSearchScore(purchase, firstWord)
  }

  // Assign decreasing weights to words: first word gets the most weight.
  // Weights follow a geometric decay: [0.5, 0.25, 0.125, ...] normalised to sum 1.
  const rawWeights = words.map((_, i) => Math.pow(WORD_WEIGHT_DECAY, i))
  const total = rawWeights.reduce((s, w) => s + w, 0)
  const wordWeights = rawWeights.map(w => w / total)

  return words.reduce((sum, word, i) => {
    const weight = wordWeights[i] ?? 0
    return sum + calculatePurchaseSearchScore(purchase, word) * weight
  }, 0)
}
