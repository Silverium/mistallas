/**
 * Client-side fuzzy search implementation that mirrors the server-side logic.
 * Used for offline search on cached purchase records.
 */

/**
 * Calculate Damerau-Levenshtein distance (allows insertions, deletions, substitutions, and transpositions)
 * Returns a normalized score between 0 and 1, where 1 is a perfect match.
 */
function damerauLevenshteinScore(a: string, b: string): number {
  const aLen = a.length
  const bLen = b.length
  const maxLen = Math.max(aLen, bLen)

  if (maxLen === 0)
    return 1 // Both empty strings match perfectly

  // Create a dictionary to track character positions for transposition detection
  const da = new Map<string, number>()

  // Initialize the distance matrix
  const maxDist = aLen + bLen
  const H = new Map<string, number>()
  H.set(`${-1},${-1}`, maxDist)

  for (let i = 0; i <= aLen; i++) {
    H.set(`${i},${-1}`, maxDist)
    H.set(`${i},${0}`, i)
  }
  for (let j = 0; j <= bLen; j++) {
    H.set(`${-1},${j}`, maxDist)
    H.set(`${0},${j}`, j)
  }

  for (let i = 1; i <= aLen; i++) {
    let db = 0
    for (let j = 1; j <= bLen; j++) {
      const k = da.get(b[j - 1]) || 0
      const l = db
      let cost = 1
      if (a[i - 1] === b[j - 1]) {
        cost = 0
        db = j
      }

      const dist = Math.min(
        (H.get(`${i - 1},${j}`) ?? 0) + 1, // deletion
        (H.get(`${i},${j - 1}`) ?? 0) + 1, // insertion
        (H.get(`${i - 1},${j - 1}`) ?? 0) + cost, // substitution
        (H.get(`${k - 1},${l - 1}`) ?? 0) + (i - k - 1) + 1 + (j - l - 1) // transposition
      )
      H.set(`${i},${j}`, dist)
    }
    da.set(a[i - 1], i)
  }

  const distance = H.get(`${aLen},${bLen}`) ?? maxLen
  return Math.max(0, 1 - distance / maxLen)
}

export function fuzzyMatchScore(searchTerm: string, text: string): number {
  if (!text)
    return 0
  if (!searchTerm)
    return 1

  const term = searchTerm.toLowerCase()
  const target = text.toLowerCase()

  // Exact match
  if (target === term)
    return 1

  // Substring match - very high score
  if (target.includes(term))
    return 0.95

  // Word prefix match - high score
  const words = target.split(/\s+/)
  for (const word of words) {
    if (word.startsWith(term))
      return 0.90
  }

  // Try matching against each word individually with Damerau-Levenshtein
  let bestWordScore = 0
  for (const word of words) {
    const score = damerauLevenshteinScore(term, word)
    bestWordScore = Math.max(bestWordScore, score)
  }

  // If any single word has a good match, return that score with a slight boost
  if (bestWordScore >= 0.6)
    return bestWordScore * 0.85

  // Try matching the full text
  const fullTextScore = damerauLevenshteinScore(term, target)
  if (fullTextScore >= 0.6)
    return fullTextScore * 0.80

  return 0
}

export function calculateMultiWordSearchScore(
  record: Record<string, unknown>,
  searchWords: string[]
): number {
  if (!searchWords.length)
    return 1

  const fieldsToSearch = ['brand', 'category', 'productType', 'sizeLabel']
  const searchText = fieldsToSearch
    .map(field => String(record[field] || ''))
    .join(' ')

  let totalScore = 0
  for (const word of searchWords) {
    totalScore += fuzzyMatchScore(word, searchText)
  }

  return totalScore / searchWords.length
}
