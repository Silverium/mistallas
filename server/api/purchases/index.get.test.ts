import { describe, it, expect } from 'vitest'
import { calculatePurchaseSearchScore, fuzzyMatchScore } from '@root/server/utils/fuzzy-search'

describe('Fuzzy Search', () => {
  describe('fuzzyMatchScore', () => {
    it('returns 1 for exact match', () => {
      const score = fuzzyMatchScore('nike', 'nike')
      expect(score).toBe(1)
    })

    it('returns 0.9 for substring match', () => {
      const score = fuzzyMatchScore('ike', 'nike')
      expect(score).toBe(0.9)
    })

    it('returns 0.9 for substring match in compound word', () => {
      const score = fuzzyMatchScore('run', 'running shoes')
      expect(score).toBe(0.9) // "run" is substring of "running"
    })

    it('handles character transposition (typo)', () => {
      const score = fuzzyMatchScore('hoodei', 'hoodie')
      expect(score).toBeGreaterThan(0.5) // Should match with tolerance
    })

    it('handles similar partial match', () => {
      const score = fuzzyMatchScore('run', 'running')
      expect(score).toBeGreaterThan(0.5) // Should match for longer word
    })

    it('returns 0 for no match', () => {
      const score = fuzzyMatchScore('xyz', 'nike shoes')
      expect(score).toBe(0)
    })

    it('handles empty text', () => {
      const score = fuzzyMatchScore('nike', '')
      expect(score).toBe(0)
    })

    it('handles empty search term', () => {
      const score = fuzzyMatchScore('', 'nike')
      expect(score).toBe(1)
    })

    it('is case-insensitive', () => {
      const score1 = fuzzyMatchScore('NIKE', 'nike shoes')
      const score2 = fuzzyMatchScore('nike', 'NIKE SHOES')
      expect(score1).toBe(score2)
    })
  })

  describe('calculatePurchaseSearchScore', () => {
    it('scores brand higher than other fields', () => {
      const purchase1 = {
        brand: 'nike',
        category: 'shoes',
        productType: 'running',
        sizeLabel: 'M',
        fitFeedback: null,
        notes: null
      }

      const purchase2 = {
        brand: 'generic',
        category: 'nike shoes',
        productType: 'running',
        sizeLabel: 'M',
        fitFeedback: null,
        notes: null
      }

      const score1 = calculatePurchaseSearchScore(purchase1, 'nike')
      const score2 = calculatePurchaseSearchScore(purchase2, 'nike')

      expect(score1).toBeGreaterThan(score2)
    })

    it('returns 0 for no matches', () => {
      const purchase = {
        brand: 'nike',
        category: 'shoes',
        productType: 'running',
        sizeLabel: 'M',
        fitFeedback: null,
        notes: null
      }

      const score = calculatePurchaseSearchScore(purchase, 'xyz')
      expect(score).toBe(0)
    })

    it('returns > 0 for partial matches', () => {
      const purchase = {
        brand: 'nike',
        category: 'shoes',
        productType: 'running',
        sizeLabel: 'M',
        fitFeedback: null,
        notes: null
      }

      const score = calculatePurchaseSearchScore(purchase, 'run')
      expect(score).toBeGreaterThan(0)
    })

    it('handles null values', () => {
      const purchase = {
        brand: 'nike',
        category: null,
        productType: null,
        sizeLabel: null,
        fitFeedback: null,
        notes: null
      }

      const score = calculatePurchaseSearchScore(purchase, 'nike')
      expect(score).toBeGreaterThan(0)
    })
  })
})
